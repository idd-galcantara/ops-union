import { MAX_TAIL_LINES, streamStructuredPodLogs, type LogStreamHandle, type StructuredLogCallbacks, type StructuredLogLine, type StructuredLogOptions } from './kube/logsService.js';
import { safeErrorMessage } from './kube/podsService.js';
import { MAX_ACTIVE_LIVE_SOURCE_READS } from './resourceLimits.js';
import { MAX_LIVE_INFLIGHT_BYTES_PER_SESSION, MAX_LIVE_INFLIGHT_BYTES_PER_SOURCE, MAX_LIVE_STREAMS_PER_CONNECTION } from './logsProtocol.js';
import type { EffectiveLogSubscription, AggregateLogEvent, LogCounters, LogSource, SummaryReason } from './logsTypes.js';

export type SubscriptionStreamFactory = (
  options: StructuredLogOptions,
  callbacks: StructuredLogCallbacks,
) => LogStreamHandle;

export type SubscriptionEmitter = (event: AggregateLogEvent) => void;

/**
 * Bounds on how the live aggregate path schedules and buffers source reads.
 * Injectable so tests can set tiny values; defaults mirror the History pump.
 */
export interface LiveSubscriptionLimits {
  maxActiveSourceReads: number;
  maxStreamsPerConnection: number;
  maxInFlightBytesPerSource: number;
  maxInFlightBytesPerSession: number;
}

export const DEFAULT_LIVE_SUBSCRIPTION_LIMITS: LiveSubscriptionLimits = {
  maxActiveSourceReads: MAX_ACTIVE_LIVE_SOURCE_READS,
  maxStreamsPerConnection: MAX_LIVE_STREAMS_PER_CONNECTION,
  maxInFlightBytesPerSource: MAX_LIVE_INFLIGHT_BYTES_PER_SOURCE,
  maxInFlightBytesPerSession: MAX_LIVE_INFLIGHT_BYTES_PER_SESSION,
};

export interface StartLogSubscriptionOptions {
  limits?: Partial<LiveSubscriptionLimits>;
}

interface SourceState {
  source: LogSource;
  counters: LogCounters;
  sequence: number;
  status: 'queued' | 'active' | 'ended' | 'error';
  handle?: LogStreamHandle;
  /** Decoded bytes read from this source but not yet drained to the socket. */
  inFlightBytes: number;
}

function counters(): LogCounters {
  return { emittedLines: 0, emittedBytes: 0, droppedLines: 0 };
}

function copyCounters(value: LogCounters): LogCounters {
  return { ...value };
}

export interface RunningLogSubscription {
  cancel: () => void;
  completion: Promise<void>;
}

/** Fans out read-only source streams while keeping protocol accounting centralized. */
export function startLogSubscription(
  subscription: EffectiveLogSubscription,
  emit: SubscriptionEmitter,
  streamFactory: SubscriptionStreamFactory = streamStructuredPodLogs,
  options: StartLogSubscriptionOptions = {},
): RunningLogSubscription {
  const limits: LiveSubscriptionLimits = { ...DEFAULT_LIVE_SUBSCRIPTION_LIMITS, ...options.limits };
  // Per-connection cap: never schedule more sources than the connection allows.
  const admitted = subscription.sources.slice(0, limits.maxStreamsPerConnection);
  const states: SourceState[] = admitted.map((source) => ({
    source,
    counters: counters(),
    sequence: 0,
    status: 'queued',
    inFlightBytes: 0,
  }));
  let activeReads = 0;
  let sessionInFlightBytes = 0;
  let cancelled = false;
  let summarySent = false;
  let aggregateStopping = false;
  let resolveCompletion!: () => void;
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });

  const totals = () => states.reduce(
    (total, state) => ({
      lines: total.lines + state.counters.emittedLines,
      bytes: total.bytes + state.counters.emittedBytes,
    }),
    { lines: 0, bytes: 0 },
  );

  const sendSummary = (reason: SummaryReason) => {
    if (summarySent || cancelled) return;
    summarySent = true;
    emit({
      type: 'summary',
      sources: states.map((state) => ({ source: state.source, counters: copyCounters(state.counters), status: state.status === 'error' ? 'error' : 'ended' })),
      limits: subscription.limits,
      reason,
    });
    resolveCompletion();
  };

  const maybeComplete = () => {
    if (cancelled || summarySent || states.some((state) => state.status === 'active' || state.status === 'queued')) return;
    const totalLines = totals().lines;
    const allFailed = states.every((state) => state.status === 'error') && totalLines === 0;
    sendSummary(allFailed ? 'all-failed' : 'completed');
  };

  // A source that was counted as an active read gives its slot back exactly once,
  // then the pump may start the next queued source (bounded-concurrency, mirrors
  // HistorySourcePump: decrement activeReads + pump on each terminal).
  const releaseRead = (state: SourceState) => {
    sessionInFlightBytes -= state.inFlightBytes;
    state.inFlightBytes = 0;
    activeReads = Math.max(0, activeReads - 1);
  };

  const endSource = (state: SourceState, reason: 'eof' | 'to-reached' | 'limit' | 'cancelled') => {
    if (state.status !== 'active') return;
    state.status = 'ended';
    releaseRead(state);
    emit({ type: 'sourceEnded', source: state.source, counters: copyCounters(state.counters), reason });
    pump();
    maybeComplete();
  };

  const stopForAggregate = (trigger: SourceState) => {
    if (aggregateStopping) return;
    aggregateStopping = true;
    for (const state of states) {
      if (state.status !== 'active' && state.status !== 'queued') continue;
      const wasActive = state.status === 'active';
      state.status = 'ended';
      if (wasActive) releaseRead(state);
      emit({
        type: 'sourceEnded',
        source: state.source,
        counters: copyCounters(state.counters),
        reason: state === trigger ? 'limit' : 'cancelled',
      });
      state.handle?.stop();
    }
    sendSummary('aggregate-limit');
  };

  // Releases a source's accrued in-flight bytes once the synchronous emit burst
  // has drained to the socket. Scheduling the release on a microtask lets a flood
  // of lines within one chunk accumulate and trip the backpressure caps, while
  // normal interleaved traffic drains between chunks and never engages them.
  const scheduleDrain = (state: SourceState) => {
    if (state.inFlightBytes === 0) return;
    queueMicrotask(() => {
      sessionInFlightBytes -= state.inFlightBytes;
      state.inFlightBytes = 0;
    });
  };

  const onLine = (state: SourceState, line: StructuredLogLine): boolean => {
    if (cancelled || state.status !== 'active') return false;
    const total = totals();
    const sourceLimit = state.counters.emittedLines + 1 > subscription.limits.maxLinesPerSource
      || state.counters.emittedBytes + line.bytes > subscription.limits.maxBytesPerSource;
    const aggregateLimit = total.lines + 1 > subscription.limits.maxLinesTotal
      || total.bytes + line.bytes > subscription.limits.maxBytesTotal;
    if (sourceLimit) {
      endSource(state, 'limit');
      return false;
    }
    if (aggregateLimit) {
      stopForAggregate(state);
      return false;
    }
    // In-flight decoded-byte backpressure: pause this source (return false) when
    // its undrained bytes would exceed the per-source or per-session cap. The
    // content caps above (DEFAULT_LOG_LIMITS) stay unchanged.
    const sourceOverflow = state.inFlightBytes + line.bytes > limits.maxInFlightBytesPerSource;
    const sessionOverflow = sessionInFlightBytes + line.bytes > limits.maxInFlightBytesPerSession;
    if (sourceOverflow || sessionOverflow) return false;

    state.sequence += 1;
    state.counters.emittedLines += 1;
    state.counters.emittedBytes += line.bytes;
    state.inFlightBytes += line.bytes;
    sessionInFlightBytes += line.bytes;
    emit({
      type: 'line',
      sourceId: state.source.sourceId,
      sequence: state.sequence,
      timestamp: line.timestamp,
      message: line.message,
      bytes: line.bytes,
      ...(state.source.application ? { application: state.source.application } : {}),
    });
    scheduleDrain(state);
    return true;
  };

  const startSource = (state: SourceState) => {
    if (cancelled || aggregateStopping || state.status !== 'queued') return;
    state.status = 'active';
    activeReads += 1;
    const callbacks: StructuredLogCallbacks = {
      onLine: (line) => onLine(state, line),
      onWarning: (count) => {
        if (state.status !== 'active') return;
        state.counters.droppedLines += count;
        emit({ type: 'sourceWarning', sourceId: state.source.sourceId, warning: 'dropped-unparseable', count: state.counters.droppedLines });
      },
      onError: (message) => {
        if (state.status !== 'active' || cancelled) return;
        state.status = 'error';
        releaseRead(state);
        emit({ type: 'sourceError', source: state.source, message, counters: copyCounters(state.counters), status: 'error' });
        pump();
        maybeComplete();
      },
      onEnd: (reason) => endSource(state, reason),
    };
    try {
      state.handle = streamFactory(
        {
          cluster: state.source.cluster,
          namespace: state.source.namespace,
          pod: state.source.pod,
          container: state.source.container,
          follow: subscription.follow,
          tailLines: Math.min(MAX_TAIL_LINES, subscription.limits.maxLinesPerSource),
          maxBytes: subscription.limits.maxBytesPerSource,
          from: subscription.from,
          to: subscription.to,
        },
        callbacks,
      );
      if (cancelled || state.status !== 'active') state.handle.stop();
    } catch (error) {
      callbacks.onError(safeErrorMessage(error));
    }
  };

  // Bounded pump mirroring HistorySourcePump: start queued sources while under
  // both the active-read bound and the per-connection stream cap.
  function pump(): void {
    if (cancelled || aggregateStopping) return;
    while (activeReads < limits.maxActiveSourceReads && activeReads < limits.maxStreamsPerConnection) {
      const next = states.find((state) => state.status === 'queued');
      if (!next) break;
      startSource(next);
    }
  }

  // Emit sourceStarted for EVERY admitted source up front, before scheduling.
  for (const state of states) {
    emit({ type: 'sourceStarted', source: state.source, counters: copyCounters(state.counters) });
  }
  pump();
  maybeComplete();

  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      for (const state of states) {
        if (state.status === 'active' || state.status === 'queued') state.status = 'ended';
        state.handle?.stop();
      }
      resolveCompletion();
    },
    completion,
  };
}
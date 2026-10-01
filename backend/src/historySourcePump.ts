import type { StructuredLogLine } from './kube/logsService.js';
import { safeErrorMessage } from './kube/podsService.js';
import type { HistoryLimits } from './historyLimits.js';
import { HistoryLimitError } from './historyStorage.js';
import type { HistoryAggregateProgress, HistorySourceProgress, HistoryTerminalStatus, HistoryRecord, LogCounters } from './logsTypes.js';
import type { HistoryStartInput, HistoryStreamFactory, SourceState } from './historySessionTypes.js';

export interface HistorySourcePumpProgress {
  aggregate: HistoryAggregateProgress;
  sources: HistorySourceProgress[];
}

export class HistorySourcePump {
  private activeReads = 0;
  private diskBytes = 0;
  private cancelRequested = false;
  private terminal = false;

  constructor(
    private readonly input: HistoryStartInput,
    readonly states: SourceState[],
    readonly limits: HistoryLimits,
    private readonly streamFactory: HistoryStreamFactory,
    private readonly emitProgress: () => void,
    private readonly finalize: (status: HistoryTerminalStatus, cleanup: boolean) => void,
  ) {}

  start(): void {
    this.pump();
  }

  cancel(): void {
    if (this.terminal) return;
    this.cancelRequested = true;
    for (const state of this.states) {
      if (state.status === 'queued' || state.status === 'reading' || state.status === 'indexing') {
        state.status = 'cancelled';
        state.stopReason = 'cancelled';
        state.handle?.stop();
      }
    }
  }

  progress(): HistorySourcePumpProgress {
    const counts = this.states.reduce((result, state) => {
      if (state.status === 'queued') result.queuedSources += 1;
      if (state.status === 'reading' || state.status === 'indexing') result.activeSources += 1;
      if (['ready', 'partial', 'failed', 'cancelled'].includes(state.status)) result.completedSources += 1;
      return result;
    }, { queuedSources: 0, activeSources: 0, completedSources: 0 });
    const counters = this.aggregateCounters();
    return {
      aggregate: {
        capturedLines: counters.lines,
        capturedBytes: counters.bytes,
        ...counts,
        sourceCount: this.states.length,
        determinate: false,
        limits: {
          maxLinesTotal: this.limits.maxLinesTotal,
          maxBytesTotal: this.limits.maxBytesTotal,
          maxDiskBytesTotal: this.limits.maxDiskBytesTotal,
          usedDiskBytes: this.diskBytes,
        },
      },
      sources: this.states.map(sourceProgress),
    };
  }

  private pump(): void {
    if (this.terminal) return;
    while (!this.cancelRequested && this.activeReads < this.limits.maxConcurrentSourceReads) {
      const next = this.states.find((state) => state.status === 'queued');
      if (!next) break;
      this.startSource(next);
    }
    if (!this.terminal && this.states.every((state) => ['ready', 'partial', 'failed', 'cancelled'].includes(state.status))) {
      this.terminal = true;
      this.finalize(this.aggregateStatus(), false);
    }
  }

  private startSource(state: SourceState): void {
    this.activeReads += 1;
    state.status = 'reading';
    try {
      const callbacks = {
        onLine: (line: StructuredLogLine) => this.appendLine(state, line),
        onWarning: (count: number) => { state.counters.droppedLines += count; this.emitProgress(); },
        onLimit: (reason: string) => { state.stopReason = 'limit'; state.limitReason = reason; },
        onError: (message: string) => this.finishSource(state, 'failed', message),
        onEnd: (reason: 'eof' | 'to-reached' | 'limit' | 'cancelled') => this.finishSource(state, reason === 'limit' ? 'partial' : reason === 'cancelled' ? 'cancelled' : 'ready'),
      };
      state.handle = this.streamFactory({
        cluster: state.source.cluster,
        namespace: state.source.namespace,
        pod: state.source.pod,
        container: state.source.container,
        follow: false,
        tailLines: undefined,
        maxBytes: undefined,
        maxRecordBytes: this.limits.maxRecordBytes,
        from: this.input.from,
        to: this.input.to,
      }, callbacks);
      if (this.cancelRequested) state.handle.stop();
    } catch (error) {
      this.finishSource(state, 'failed', safeErrorMessage(error));
    }
    this.emitProgress();
  }

  private appendLine(state: SourceState, line: StructuredLogLine): boolean {
    if (this.cancelRequested || state.status !== 'reading') return false;
    if (line.bytes > this.limits.maxRecordBytes) {
      state.stopReason = 'limit';
      state.limitReason = 'record-size';
      return false;
    }
    const total = this.aggregateCounters();
    if (state.counters.emittedLines + 1 > this.limits.maxLinesPerSource || state.counters.emittedBytes + line.bytes > this.limits.maxBytesPerSource) {
      state.stopReason = 'limit';
      state.limitReason = state.counters.emittedLines + 1 > this.limits.maxLinesPerSource ? 'lines-per-source' : 'bytes-per-source';
      return false;
    }
    const exceedsLines = total.lines + 1 > this.limits.maxLinesTotal;
    const exceedsBytes = total.bytes + line.bytes > this.limits.maxBytesTotal;
    if (exceedsLines || exceedsBytes) {
      state.stopReason = 'limit';
      state.limitReason = exceedsLines ? 'lines-total' : 'bytes-total';
      for (const other of this.states) {
        if (other !== state && (other.status === 'reading' || other.status === 'queued')) {
          other.status = 'partial';
          other.limitReason = 'aggregate-limit';
          other.handle?.stop();
        }
      }
      return false;
    }
    state.sequence += 1;
    const record: HistoryRecord = {
      sourceKey: state.sourceKey,
      source: state.source,
      sequence: state.sequence,
      timestamp: line.timestamp,
      message: line.message,
      bytes: line.bytes,
      ...(state.source.application ? { application: state.source.application } : {}),
    };
    try {
      const addedDisk = state.writer!.append(record, line.bytes, this.diskBytes);
      this.diskBytes += addedDisk;
      state.counters.emittedLines += 1;
      state.counters.emittedBytes += line.bytes;
      this.emitProgress();
      return true;
    } catch (error) {
      if (error instanceof HistoryLimitError) state.limitReason = error.reason;
      else state.error = 'History snapshot storage failed.';
      state.stopReason = 'limit';
      return false;
    }
  }

  private finishSource(state: SourceState, result: 'ready' | 'partial' | 'failed' | 'cancelled', error?: string): void {
    if (!['reading', 'indexing'].includes(state.status)) return;
    state.status = 'indexing';
    if (error) state.error = safeErrorMessage(error);
    if (state.writer) {
      try { state.writer.close(); } catch { state.error = 'History snapshot storage failed.'; }
    }
    state.status = state.stopReason === 'cancelled' || this.cancelRequested || result === 'cancelled' ? 'cancelled' : state.error ? 'failed' : state.stopReason === 'limit' || result === 'partial' ? 'partial' : result;
    this.activeReads = Math.max(0, this.activeReads - 1);
    this.emitProgress();
    this.pump();
  }

  private aggregateCounters(): { lines: number; bytes: number } {
    return this.states.reduce((total, state) => ({ lines: total.lines + state.counters.emittedLines, bytes: total.bytes + state.counters.emittedBytes }), { lines: 0, bytes: 0 });
  }

  private aggregateStatus(): HistoryTerminalStatus {
    if (this.cancelRequested || this.states.some((state) => state.status === 'cancelled')) return 'cancelled';
    if (this.states.every((state) => state.status === 'failed')) return 'failed';
    return this.states.every((state) => state.status === 'ready') ? 'complete' : 'partial';
  }
}

function emptyCounters(): LogCounters {
  return { emittedLines: 0, emittedBytes: 0, droppedLines: 0 };
}

function copyCounters(value: LogCounters): LogCounters {
  return { ...value };
}

function sourceProgress(state: SourceState): HistorySourceProgress {
  return {
    source: state.source,
    sourceKey: state.sourceKey,
    status: state.status,
    counters: copyCounters(state.counters),
    ...(state.limitReason ? { limitReason: state.limitReason } : {}),
    ...(state.error ? { error: state.error } : {}),
    continuity: state.continuity,
  };
}

export function createSourceState(source: SourceState['source']): SourceState {
  return {
    source,
    sourceKey: Buffer.from(JSON.stringify([source.cluster, source.namespace, source.pod, source.container])).toString('base64url'),
    status: 'queued',
    counters: emptyCounters(),
    sequence: 0,
    continuity: 'single-read',
  };
}

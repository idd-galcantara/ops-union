import { appendBoundedEvent, CLIENT_LOG_BUFFER, sourceStateForEvent } from './logsSession';
import { serializeLogSubscription } from './api';
import type { LogRange } from './types';
import type { LogSearchValues } from './logsSearch';
import type { AggregateLogEvent, LogEventRecord, LogLimits, LogSource, LogSourceState, SummaryReason } from './types';

export type LiveAggregateLogEvent =
  | Extract<AggregateLogEvent, { type: 'accepted' }>
  | Extract<AggregateLogEvent, { type: 'sourceStarted' | 'sourceEnded' | 'sourceError' | 'sourceWarning' }>
  | Extract<AggregateLogEvent, { type: 'line' }>
  | Extract<AggregateLogEvent, { type: 'summary' }>
  | Extract<AggregateLogEvent, { type: 'error' }>;

export interface LiveSessionReductionState {
  events: LogEventRecord[];
  sourceStates: Map<string, LogSourceState>;
  acceptedLimits: LogLimits;
  summaryReason?: SummaryReason;
  error?: string;
  state: 'connecting' | 'transitioning' | 'streaming' | 'paused' | 'partial' | 'ended' | 'error';
}

export interface LiveSessionReduction {
  state: LiveSessionReductionState;
  operationComplete: boolean;
}

interface MutableRef<T> { current: T }

interface LiveSessionControllerOptions {
  socket: WebSocket;
  values: Pick<LogSearchValues, 'period' | 'follow'>;
  range: LogRange;
  sources: LogSource[];
  defaultLimits: LogLimits;
  operationId: number | undefined;
  pausedRef: MutableRef<boolean>;
  eventsRef: MutableRef<LogEventRecord[]>;
  sourceStatesRef: MutableRef<Map<string, LogSourceState>>;
  acceptedLimitsRef: MutableRef<LogLimits>;
  transitioningFromHistoryRef: MutableRef<boolean>;
  liveSessionAcceptedRef: MutableRef<boolean>;
  setEvents: (events: LogEventRecord[]) => void;
  setSourceStates: (states: Map<string, LogSourceState>) => void;
  setAcceptedLimits: (limits: LogLimits) => void;
  setReceivedWhilePaused: (update: (count: number) => number) => void;
  setSummaryReason: (reason: SummaryReason) => void;
  setState: (state: 'streaming' | 'paused' | 'partial' | 'ended' | 'error') => void;
  setError: (message: string) => void;
  finishSearchOperation: (requestId: number | undefined) => void;
  acknowledgeTransition: () => void;
}

export function createLiveSessionController(options: LiveSessionControllerOptions) {
  const initialState: LiveSessionReductionState['state'] = options.sourceStatesRef.current.size > 0 ? 'streaming' : 'connecting';
  let reductionState: LiveSessionReductionState = {
    events: options.eventsRef.current,
    sourceStates: options.sourceStatesRef.current,
    acceptedLimits: options.acceptedLimitsRef.current,
    state: initialState,
  };
  const subscribe = () => {
    options.socket.send(serializeLogSubscription({ type: 'subscribe', period: options.values.period, follow: options.values.follow, ...options.range, sources: options.sources, limits: options.defaultLimits }));
  };
  const handle = (event: LiveAggregateLogEvent) => {
    const reduction = reduceLiveLogEvent(reductionState, event, options.sources, options.pausedRef.current);
    reductionState = reduction.state;
    options.eventsRef.current = reductionState.events;
    options.sourceStatesRef.current = reductionState.sourceStates;
    options.acceptedLimitsRef.current = reductionState.acceptedLimits;
    options.setEvents(reductionState.events);
    options.setSourceStates(reductionState.sourceStates);
    options.setAcceptedLimits(reductionState.acceptedLimits);
    if (event.type === 'accepted' || event.type === 'line' || event.type === 'summary' || event.type === 'error') {
      if (reductionState.state !== 'connecting' && reductionState.state !== 'transitioning') options.setState(reductionState.state);
    }
    if (event.type === 'sourceError') options.setState('partial');
    if (event.type === 'line' && options.pausedRef.current) options.setReceivedWhilePaused((count) => count + 1);
    if (event.type === 'accepted') {
      options.liveSessionAcceptedRef.current = true;
      options.finishSearchOperation(options.operationId);
      if (options.transitioningFromHistoryRef.current) {
        options.transitioningFromHistoryRef.current = false;
        options.acknowledgeTransition();
      }
    }
    if (event.type === 'summary') {
      options.setSummaryReason(event.reason);
      options.finishSearchOperation(options.operationId);
    }
    if (event.type === 'error') {
      options.setError(event.message);
      options.finishSearchOperation(options.operationId);
    }
    if (reduction.operationComplete && event.type !== 'accepted' && event.type !== 'summary' && event.type !== 'error') options.finishSearchOperation(options.operationId);
  };
  return { subscribe, handle };
}

export function reduceLiveLogEvent(
  current: LiveSessionReductionState,
  event: LiveAggregateLogEvent,
  sources: LogSource[],
  paused: boolean,
): LiveSessionReduction {
  if (event.type === 'accepted') {
    return {
      operationComplete: true,
      state: { ...current, acceptedLimits: event.limits, state: paused ? 'paused' : 'streaming' },
    };
  }
  if (event.type === 'sourceStarted' || event.type === 'sourceEnded' || event.type === 'sourceError' || event.type === 'sourceWarning') {
    const sourceStates = sourceStateForEvent(current.sourceStates, event);
    return {
      operationComplete: false,
      state: { ...current, sourceStates, state: event.type === 'sourceError' ? 'partial' : current.state },
    };
  }
  if (event.type === 'line') {
    const source = current.sourceStates.get(event.sourceId)?.source ?? sources.find((item) => item.sourceId === event.sourceId);
    if (!source) return { operationComplete: false, state: current };
    const record: LogEventRecord = { source: event.application ? { ...source, application: event.application } : source, event };
    return {
      operationComplete: false,
      state: {
        ...current,
        events: appendBoundedEvent(current.events, record, Math.min(CLIENT_LOG_BUFFER, current.acceptedLimits.maxLinesTotal)),
        state: current.state === 'partial' || paused ? 'paused' : 'streaming',
      },
    };
  }
  if (event.type === 'summary') {
    return {
      operationComplete: true,
      state: { ...current, acceptedLimits: event.limits, summaryReason: event.reason, state: current.state === 'partial' ? 'partial' : 'ended' },
    };
  }
  return {
    operationComplete: true,
    state: { ...current, error: event.message, state: 'error' },
  };
}
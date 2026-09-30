import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LoaderCircle, Pause, Play, Search, Trash2, X } from 'lucide-react';
import { aggregateLogsUrl, serializeHistoryCancel, serializeHistoryQueryStart, serializeHistoryQueryWindow, serializeHistoryStart, serializeHistoryWindow, serializeLogSubscription } from '../api';
import { LOG_PERIODS, resolveLogRange } from '../logsRange';
import { cloneLogSearchValues, consumeLogSearchJumpRequest, createLogSearchActivation, createLogSearchJumpRequest, createLogSearchOperationSnapshot, DEFAULT_LOG_SEARCH_VALUES, logSearchOperationComplete, searchHasPendingChanges, shouldConsumeLogSearchJumpRequest, type LogSearchJumpRequest, type LogSearchOperationKind, type LogSearchOperationSnapshot, type LogSearchState } from '../logsSearch';
import { DEFAULT_LOG_DISPLAY_STATE, logRecordKey, setWrapLines, type LogGrouping } from '../logsPresentation';
import { addHistoryQueryWindow, addHistoryWindow, appendBoundedEvent, CLIENT_LOG_BUFFER, createHistoryQueryWindowCache, createHistoryWindowCache, filterLogRecords, historyQueryRecordAt, historyRecordToEvent, HISTORY_WINDOW_LIMIT, historyRecordsFromCache, logFilterValues, sourceLabel, sourceStateForEvent, sourcesForPods, type HistoryQueryWindowCache, type HistoryQueryWindowRequest, type HistoryWindowCache, type HistoryWindowRequest, type LogRecordFilters } from '../logsSession';
import { ErrorState } from './Feedback';
import type { AggregateLogEvent, HistoryAggregateProgress, HistoryQueryFilters, HistorySessionIdentity, HistorySourceProgress, HistoryTerminalStatus, LogEventRecord, LogLimits, LogSource, LogSourceState, NormalizedPod, PodRef, SummaryReason, Target } from '../types';

const DEFAULT_LIMITS: LogLimits = { maxLinesPerSource: 2_000, maxBytesPerSource: 2 * 1024 * 1024, maxLinesTotal: 10_000, maxBytesTotal: 10 * 1024 * 1024 };
type ConnectionState = 'validating' | 'connecting' | 'streaming' | 'paused' | 'ended' | 'partial' | 'error' | 'history-starting' | 'history-reading' | 'history-ready' | 'history-partial' | 'history-cancelled' | 'history-expired' | 'transitioning';

interface HistoryViewState {
  identity?: HistorySessionIdentity;
  status: 'starting' | 'reading' | HistoryTerminalStatus | 'transitioning' | 'transition-failed' | 'transitioned';
  aggregate?: HistoryAggregateProgress;
  sources: HistorySourceProgress[];
  limitReasons: string[];
}

interface HistoryRuntime {
  identity?: HistorySessionIdentity;
  requested: Set<string>;
  pending: Map<string, HistoryWindowRequest>;
  sourceProgress: HistorySourceProgress[];
  terminal: boolean;
}

interface HistoryQueryState {
  identity: HistorySessionIdentity;
  queryId: string;
  totalMatches: number;
}

interface HistoryQueryRuntime {
  queryId?: string;
  retiredQueryIds: Set<string>;
  requested: Set<string>;
  pending: Map<string, HistoryQueryWindowRequest>;
}

interface SearchOperationState {
  kind: LogSearchOperationKind;
  snapshot: LogSearchOperationSnapshot;
}

interface LogViewerProps {
  pod: PodRef;
  pods?: PodRef[];
  sources?: LogSource[];
  consultedContexts?: Target[];
  onChangeSources?: () => void;
  onClose?: () => void;
}

export function LogViewer({ pod, pods, sources, consultedContexts, onChangeSources, onClose }: LogViewerProps) {
  const fallbackPods = useMemo(() => [pod], [pod]);
  const logPods = pods ?? fallbackPods;
  const availableSources = useMemo(() => sources ?? sourcesForPods(logPods.map((item): NormalizedPod => ({ cluster: item.cluster, namespace: item.namespace, name: item.name, status: '', ready: '', restarts: 0, node: '', imageTag: '', ageSeconds: 0, containers: item.containers, application: item.application ?? { key: `pod:${item.name}`, name: item.name, source: 'pod' } }))), [logPods, sources]);
  const [search, setSearch] = useState<LogSearchState>(() => ({ draft: cloneLogSearchValues(DEFAULT_LOG_SEARCH_VALUES), applied: cloneLogSearchValues(DEFAULT_LOG_SEARCH_VALUES) }));
  const [display, setDisplay] = useState(DEFAULT_LOG_DISPLAY_STATE);
  const [events, setEvents] = useState<LogEventRecord[]>([]);
  const [sourceStates, setSourceStates] = useState<Map<string, LogSourceState>>(new Map());
  const [state, setState] = useState<ConnectionState>('validating');
  const [error, setError] = useState<string>();
  const [validationError, setValidationError] = useState<string>();
  const [searchOperation, setSearchOperation] = useState<SearchOperationState>();
  const [summaryReason, setSummaryReason] = useState<SummaryReason | undefined>(undefined);
  const [acceptedLimits, setAcceptedLimits] = useState(DEFAULT_LIMITS);
  const [historyState, setHistoryState] = useState<HistoryViewState>();
  const [historyWindows, setHistoryWindows] = useState<HistoryWindowCache>(() => createHistoryWindowCache());
  const [historyQuery, setHistoryQuery] = useState<HistoryQueryState>();
  const [historyQueryCache, setHistoryQueryCache] = useState<HistoryQueryWindowCache>(() => createHistoryQueryWindowCache());
  const [historyWindowLoading, setHistoryWindowLoading] = useState(false);
  const [historyWindowError, setHistoryWindowError] = useState<string>();
  const [historyWindowRetryRequests, setHistoryWindowRetryRequests] = useState<HistoryWindowRequest[]>([]);
  const [historyQueryRetryRequests, setHistoryQueryRetryRequests] = useState<HistoryQueryWindowRequest[]>([]);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [receivedWhilePaused, setReceivedWhilePaused] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const { draft, applied } = search;
  const outputRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<SummaryReason | undefined>(undefined);
  const pausedRef = useRef(paused);
  const acceptedLimitsRef = useRef(acceptedLimits);
  pausedRef.current = paused;
  acceptedLimitsRef.current = acceptedLimits;
  const sourceStatesRef = useRef(sourceStates);
  sourceStatesRef.current = sourceStates;
  const historyRuntimeRef = useRef<HistoryRuntime>({ requested: new Set(), pending: new Map(), sourceProgress: [], terminal: false });
  const historyQueryRuntimeRef = useRef<HistoryQueryRuntime>({ retiredQueryIds: new Set(), requested: new Set(), pending: new Map() });
  const historySocketRef = useRef<WebSocket | undefined>(undefined);
  const historyRequestRef = useRef<((sourceKey: string, line: number, direction?: 'forward' | 'backward') => void) | undefined>(undefined);
  const historyQueryRequestRef = useRef<((request: HistoryQueryWindowRequest) => void) | undefined>(undefined);
  const historyQueryStartRef = useRef<((filters: HistoryQueryFilters) => void) | undefined>(undefined);
  const historyQueryVisibleRangeRef = useRef<{ firstIndex: number; lastIndex: number } | undefined>(undefined);
  const historyQueryReadyRequestRef = useRef<number | undefined>(undefined);
  const liveSessionAcceptedRef = useRef(false);
  const searchJumpRequestRef = useRef<LogSearchJumpRequest | undefined>(undefined);
  const jumpToLatestRef = useRef<(() => void) | undefined>(undefined);
  const requestGenerationRef = useRef(0);
  const requestIdRef = useRef(0);
  const searchOperationIdRef = useRef(0);
  const searchOperationRef = useRef<SearchOperationState | undefined>(undefined);
  const transitioningFromHistoryRef = useRef(false);
  const historyTailPendingRef = useRef(false);
  const historyTailRevealRef = useRef(false);
  const selectedSources = availableSources;
  const hasPendingSearch = searchHasPendingChanges(search);
  const filterValues = useMemo(() => logFilterValues(selectedSources, events), [selectedSources, events]);
  const appliedCustomRange = useMemo(() => ({ from: applied.customFrom, to: applied.customTo }), [applied.customFrom, applied.customTo]);
  const appliedRangeResult = useMemo(() => resolveLogRange(applied.period, new Date(), appliedCustomRange), [applied.period, appliedCustomRange, sessionAttempt]);
  const visibleEvents = useMemo(() => filterLogRecords(events, applied.filters), [events, applied.filters]);
  const queryHistoryActive = applied.mode === 'history' && Boolean(historyQuery);
  const isSearchApplying = Boolean(searchOperation);
  const virtualCount = queryHistoryActive ? historyQuery!.totalMatches : visibleEvents.length;
  const virtualCountRef = useRef(virtualCount);
  virtualCountRef.current = virtualCount;
  const virtualizer = useVirtualizer({
    count: virtualCount,
    getScrollElement: () => outputRef.current,
    estimateSize: () => 34,
    measureElement: (element) => element.getBoundingClientRect().height,
    getItemKey: (index) => {
      if (queryHistoryActive) {
        const record = historyQueryRecordAt(historyQueryCache, index);
        return record ? logRecordKey(historyRecordToEvent(record)) : `history-query-${index}`;
      }
      const record = visibleEvents[index];
      return record ? logRecordKey(record) : index;
    },
    overscan: 10,
  });

  const setSearchOperationState = (operation: SearchOperationState | undefined) => {
    searchOperationRef.current = operation;
    setSearchOperation(operation);
  };
  const finishSearchOperation = (requestId: number | undefined) => {
    const current = searchOperationRef.current;
    if (!current || current.snapshot.requestId !== requestId) return;
    searchOperationRef.current = undefined;
    setSearchOperation(undefined);
  };

  useEffect(() => {
    const operation = searchOperationRef.current;
    const operationId = operation?.snapshot.requestId;
    const sessionSnapshot = operation?.snapshot ?? createLogSearchOperationSnapshot(applied, appliedRangeResult.range ?? {}, selectedSources, 0);
    const sessionValues = sessionSnapshot.values;
    const sessionRange = sessionSnapshot.range;
    const sessionSources = sessionSnapshot.sources;
    let historyTerminalSeen = false;
    let historyQueryReadySeen = false;
    const preserveHistoryBoundary = sessionValues.mode === 'live' && transitioningFromHistoryRef.current;
    if (!preserveHistoryBoundary) {
      setEvents([]);
      setHistoryState(undefined);
      setHistoryWindows(createHistoryWindowCache());
      setHistoryQuery(undefined);
      setHistoryQueryCache(createHistoryQueryWindowCache());
      setHistoryWindowLoading(false);
      setHistoryWindowError(undefined);
      setHistoryWindowRetryRequests([]);
      setHistoryQueryRetryRequests([]);
    }
    setSourceStates(new Map());
    setSummaryReason(undefined);
    summaryRef.current = undefined;
    setError(operation ? undefined : appliedRangeResult.error);
    setReceivedWhilePaused(0);
    setAutoScroll(sessionValues.mode !== 'history' && !preserveHistoryBoundary);
    setAcceptedLimits(DEFAULT_LIMITS);
    historyRuntimeRef.current = { requested: new Set(), pending: new Map(), sourceProgress: [], terminal: false };
    historyQueryRuntimeRef.current = { retiredQueryIds: new Set(), requested: new Set(), pending: new Map() };
    historyQueryVisibleRangeRef.current = undefined;
    historyRequestRef.current = undefined;
    historyQueryRequestRef.current = undefined;
    historyQueryStartRef.current = undefined;
    liveSessionAcceptedRef.current = false;
    historyQueryReadyRequestRef.current = undefined;
    historyTailPendingRef.current = false;
    historyTailRevealRef.current = false;
    if (!operation && appliedRangeResult.error) {
      setState('error');
      return;
    }
    if (sessionSources.length === 0) {
      setState('error');
      setError('No confirmed log sources are available.');
      return;
    }
    let active = true;
    const socket = new WebSocket(aggregateLogsUrl());
    historySocketRef.current = socket;
    setState(sessionValues.mode === 'history' ? 'history-starting' : preserveHistoryBoundary ? 'transitioning' : 'connecting');
    const isCurrentHistoryEvent = (event: { sessionId: string; snapshotId: string; generation: number }) => {
      const identity = historyRuntimeRef.current.identity;
      return Boolean(identity && event.sessionId === identity.sessionId && event.snapshotId === identity.snapshotId && event.generation === identity.generation);
    };
    const requestHistoryWindow = (sourceKey: string, line: number, direction: 'forward' | 'backward' = 'forward') => {
      const identity = historyRuntimeRef.current.identity;
      if (!identity || socket.readyState !== WebSocket.OPEN) return;
      const key = `${sourceKey}:${line}:${direction}`;
      if (historyRuntimeRef.current.requested.has(key)) return;
      historyRuntimeRef.current.requested.add(key);
      historyRuntimeRef.current.pending.set(key, { sourceKey, line, direction });
      socket.send(serializeHistoryWindow({ sessionId: identity.sessionId, generation: identity.generation, sourceKey, line, direction, limit: HISTORY_WINDOW_LIMIT }));
    };
    const requestHistoryQueryWindow = (request: HistoryQueryWindowRequest) => {
      const identity = historyRuntimeRef.current.identity;
      const queryId = historyQueryRuntimeRef.current.queryId;
      if (!identity || !queryId || socket.readyState !== WebSocket.OPEN) return;
      const key = `${queryId}:${request.offset}:${request.direction}`;
      if (historyQueryRuntimeRef.current.requested.has(key)) return;
      historyQueryRuntimeRef.current.requested.add(key);
      historyQueryRuntimeRef.current.pending.set(key, request);
      socket.send(serializeHistoryQueryWindow({ sessionId: identity.sessionId, generation: identity.generation, queryId, offset: request.offset, direction: request.direction, limit: HISTORY_WINDOW_LIMIT }));
      setHistoryWindowLoading(true);
    };
    const startHistoryQuery = (filters: HistoryQueryFilters) => {
      const identity = historyRuntimeRef.current.identity;
      if (!identity || !historyRuntimeRef.current.terminal || socket.readyState !== WebSocket.OPEN) return;
      historyQueryReadyRequestRef.current = undefined;
      const previousQueryId = historyQueryRuntimeRef.current.queryId;
      if (previousQueryId) historyQueryRuntimeRef.current.retiredQueryIds.add(previousQueryId);
      historyQueryRuntimeRef.current.queryId = undefined;
      historyQueryRuntimeRef.current.requested.clear();
      historyQueryRuntimeRef.current.pending.clear();
      setHistoryQuery(undefined);
      setHistoryQueryCache(createHistoryQueryWindowCache());
      setHistoryQueryRetryRequests([]);
      setHistoryWindowError(undefined);
      setHistoryWindowLoading(true);
      socket.send(serializeHistoryQueryStart({ sessionId: identity.sessionId, generation: identity.generation, filters }));
    };
    const failPendingHistoryWindows = (message: string): boolean => {
      if (historyRuntimeRef.current.pending.size === 0) return false;
      const retryRequests = [...historyRuntimeRef.current.pending.values()];
      historyRuntimeRef.current.pending.clear();
      historyRuntimeRef.current.requested.clear();
      setHistoryWindowRetryRequests(retryRequests);
      setHistoryWindowError(message);
      setHistoryWindowLoading(false);
      return true;
    };
    const failPendingHistoryQueryWindows = (message: string): boolean => {
      if (historyQueryRuntimeRef.current.pending.size === 0) return false;
      const retryRequests = [...historyQueryRuntimeRef.current.pending.values()];
      historyQueryRuntimeRef.current.pending.clear();
      historyQueryRuntimeRef.current.requested.clear();
      setHistoryQueryRetryRequests(retryRequests);
      setHistoryWindowError(message);
      setHistoryWindowLoading(false);
      return true;
    };
    historyRequestRef.current = requestHistoryWindow;
    historyQueryRequestRef.current = requestHistoryQueryWindow;
    historyQueryStartRef.current = startHistoryQuery;
    socket.onopen = () => {
      if (!active) return;
      if (sessionValues.mode === 'history') {
        socket.send(serializeHistoryStart({ requestId: `history-${++requestIdRef.current}`, generation: ++requestGenerationRef.current, ...sessionRange, sources: sessionSources }));
      } else {
        socket.send(serializeLogSubscription({ type: 'subscribe', period: sessionValues.period, follow: sessionValues.follow, ...sessionRange, sources: sessionSources, limits: DEFAULT_LIMITS }));
      }
    };
    socket.onmessage = (message: MessageEvent<string>) => {
      if (!active) return;
      let event: AggregateLogEvent;
      try {
        event = JSON.parse(message.data) as AggregateLogEvent;
      } catch {
        setError('The log stream returned an invalid event.');
        finishSearchOperation(operationId);
        setState('error');
        return;
      }
      if (sessionValues.mode === 'history') {
        if (event.type === 'history.accepted') {
          const identity = { sessionId: event.sessionId, snapshotId: event.snapshotId, generation: event.generation };
          historyRuntimeRef.current.identity = identity;
          setHistoryWindowError(undefined);
          setHistoryWindowRetryRequests([]);
          setHistoryState({ identity, status: 'reading', sources: [], limitReasons: [] });
          setState('history-reading');
          return;
        }
        if (event.type === 'history.progress') {
          if (!isCurrentHistoryEvent(event)) return;
          historyRuntimeRef.current.sourceProgress = event.sources;
          setHistoryState((current) => current ? { ...current, status: 'reading', aggregate: event.aggregate, sources: event.sources } : current);
          setState('history-reading');
          return;
        }
        if (event.type === 'history.window') {
          if (!isCurrentHistoryEvent(event)) return;
          const responseDirection = [...historyRuntimeRef.current.pending.values()].find((request) => request.sourceKey === event.sourceKey && (request.line === event.startLine || request.line === event.endLine))?.direction;
          if (responseDirection) {
            const responseLine = responseDirection === 'forward' ? event.startLine : event.endLine;
            const responseKey = `${event.sourceKey}:${responseLine}:${responseDirection}`;
            historyRuntimeRef.current.pending.delete(responseKey);
          }
          const revealHistoryTail = historyTailPendingRef.current && responseDirection === 'backward';
          if (revealHistoryTail) historyTailPendingRef.current = false;
          setHistoryWindowError(undefined);
          setHistoryWindows((current) => {
            const update = addHistoryWindow(current, event, historyRuntimeRef.current.identity!, responseDirection ?? 'forward');
            if (!update) return current;
            for (const evictedKey of update.evictedKeys) {
              historyRuntimeRef.current.requested.delete(`${evictedKey}:forward`);
              historyRuntimeRef.current.requested.delete(`${evictedKey}:backward`);
            }
            setHistoryWindowLoading(historyRuntimeRef.current.pending.size > 0);
            if (revealHistoryTail) {
              historyTailRevealRef.current = true;
              setAutoScroll(true);
            }
            setEvents(historyRecordsFromCache(update.cache));
            return update.cache;
          });
          return;
        }
        if (event.type === 'history.query.ready') {
          if (!isCurrentHistoryEvent(event) || historyQueryRuntimeRef.current.retiredQueryIds.has(event.queryId)) return;
          if (historyQueryRuntimeRef.current.queryId && historyQueryRuntimeRef.current.queryId !== event.queryId) return;
          historyQueryRuntimeRef.current.queryId = event.queryId;
          historyQueryRuntimeRef.current.requested.clear();
          historyQueryRuntimeRef.current.pending.clear();
          const jumpRequest = searchJumpRequestRef.current;
          if (jumpRequest?.requestId === searchOperationIdRef.current && jumpRequest.mode === 'history') historyQueryReadyRequestRef.current = jumpRequest.requestId;
          setHistoryQuery({ identity: historyRuntimeRef.current.identity!, queryId: event.queryId, totalMatches: event.totalMatches });
          setHistoryQueryCache(createHistoryQueryWindowCache());
          setHistoryQueryRetryRequests([]);
          setHistoryWindowError(undefined);
          setHistoryWindowLoading(event.totalMatches > 0);
          historyQueryReadySeen = true;
          if (operation?.kind === 'history' && logSearchOperationComplete(operation.kind, historyTerminalSeen, historyQueryReadySeen)) finishSearchOperation(operationId);
          return;
        }
        if (event.type === 'history.query.window') {
          if (!isCurrentHistoryEvent(event) || historyQueryRuntimeRef.current.queryId !== event.queryId) return;
          const pendingEntry = [...historyQueryRuntimeRef.current.pending.entries()].find(([, request]) => request.offset === event.startIndex && request.direction === 'forward')
            ?? [...historyQueryRuntimeRef.current.pending.entries()].find(([, request]) => request.direction === 'forward' && request.offset < event.endIndex && request.offset >= event.startIndex);
          const responseKey = pendingEntry?.[0];
          const responseRequest = pendingEntry?.[1];
          if (responseKey) historyQueryRuntimeRef.current.pending.delete(responseKey);
          setHistoryQueryRetryRequests([]);
          setHistoryWindowError(undefined);
          setHistoryQueryCache((current) => {
            const update = addHistoryQueryWindow(current, event, historyRuntimeRef.current.identity ? { ...historyRuntimeRef.current.identity, queryId: event.queryId } : event);
            if (!update) return current;
            for (const evictedKey of update.evictedKeys) {
              for (const requestedKey of historyQueryRuntimeRef.current.requested) {
                if (requestedKey.startsWith(`${event.queryId}:${evictedKey.split(':')[0]}:`)) historyQueryRuntimeRef.current.requested.delete(requestedKey);
              }
            }
            setHistoryWindowLoading(historyQueryRuntimeRef.current.pending.size > 0);
            return update.cache;
          });
          const visibleRange = historyQueryVisibleRangeRef.current;
          const requestedPageEnd = (responseRequest?.offset ?? event.startIndex) + HISTORY_WINDOW_LIMIT;
          if (event.hasMoreAfter && event.endIndex < requestedPageEnd && event.endIndex <= (visibleRange?.lastIndex ?? -1)) {
            requestHistoryQueryWindow({ offset: event.endIndex, direction: 'forward' });
          }
          if (event.hasMoreAfter && event.endIndex < (visibleRange?.lastIndex ?? -1) && !historyQueryRuntimeRef.current.requested.has(`${event.queryId}:${event.endIndex}:forward`)) {
            requestHistoryQueryWindow({ offset: event.endIndex, direction: 'forward' });
          }
          return;
        }
        if (event.type === 'history.terminal') {
          if (!isCurrentHistoryEvent(event)) return;
          historyRuntimeRef.current.sourceProgress = event.sources;
          historyRuntimeRef.current.terminal = true;
          historyTerminalSeen = true;
          setHistoryWindowError(undefined);
          setHistoryWindowRetryRequests([]);
          setHistoryState((current) => current ? { ...current, status: event.status, aggregate: event.aggregate, sources: event.sources, limitReasons: event.limitReasons } : current);
          setState(event.status === 'complete' ? 'history-ready' : event.status === 'cancelled' ? 'history-cancelled' : event.status === 'expired' ? 'history-expired' : 'history-partial');
          if (operationId !== undefined && ['failed', 'cancelled', 'expired'].includes(event.status)) finishSearchOperation(operationId);
          if (operationId !== undefined && operation?.kind === 'history' && logSearchOperationComplete(operation.kind, historyTerminalSeen, historyQueryReadySeen)) finishSearchOperation(operationId);
          startHistoryQuery(sessionValues.filters);
          return;
        }
        if (event.type === 'error') {
          if (failPendingHistoryWindows(event.message)) return;
          if (failPendingHistoryQueryWindows(event.message)) return;
          setError(event.message);
          finishSearchOperation(operationId);
          setState('error');
        }
        return;
      }
      if (event.type === 'accepted') {
        setAcceptedLimits(event.limits);
        liveSessionAcceptedRef.current = true;
        finishSearchOperation(operationId);
        if (transitioningFromHistoryRef.current) {
          transitioningFromHistoryRef.current = false;
          setHistoryState((current) => current ? { ...current, status: 'transitioned' } : current);
          setEvents([]);
        }
        setState(pausedRef.current ? 'paused' : 'streaming');
        return;
      }
      if (event.type === 'sourceStarted' || event.type === 'sourceEnded' || event.type === 'sourceError' || event.type === 'sourceWarning') {
        setSourceStates((current) => {
          const next = sourceStateForEvent(current, event);
          sourceStatesRef.current = next;
          return next;
        });
        if (event.type === 'sourceError') setState('partial');
        return;
      }
      if (event.type === 'line') {
        const source = sourceStatesRef.current.get(event.sourceId)?.source ?? sessionSources.find((item) => item.sourceId === event.sourceId);
        if (!source) return;
        setEvents((current) => appendBoundedEvent(current, { source: event.application ? { ...source, application: event.application } : source, event }, Math.min(CLIENT_LOG_BUFFER, acceptedLimitsRef.current.maxLinesTotal)));
        if (pausedRef.current) setReceivedWhilePaused((count) => count + 1);
        setState((current) => current === 'partial' || pausedRef.current ? 'paused' : 'streaming');
        return;
      }
      if (event.type === 'summary') {
        summaryRef.current = event.reason;
        setSummaryReason(event.reason);
        setAcceptedLimits(event.limits);
        finishSearchOperation(operationId);
        setState((current) => current === 'partial' ? 'partial' : 'ended');
        return;
      }
      if (event.type === 'error') {
        setError(event.message);
        finishSearchOperation(operationId);
        setState('error');
      }
    };
    socket.onerror = () => {
      if (active) {
        if (failPendingHistoryWindows('Could not load the historical window.')) return;
        if (failPendingHistoryQueryWindows('Could not load the historical query window.')) return;
        setError('Could not connect to the aggregate log stream.');
        finishSearchOperation(operationId);
        if (transitioningFromHistoryRef.current) setHistoryState((current) => current ? { ...current, status: 'transition-failed' } : current);
        setState('error');
      }
    };
    socket.onclose = () => {
      if (active) {
        if (failPendingHistoryWindows('The history connection closed while loading a window.')) return;
        if (failPendingHistoryQueryWindows('The history connection closed while loading a query window.')) return;
        finishSearchOperation(operationId);
        if (transitioningFromHistoryRef.current) setHistoryState((current) => current ? { ...current, status: 'transition-failed' } : current);
        setState((current) => current === 'error' || current === 'partial' || summaryRef.current ? current : 'ended');
      }
    };
    return () => {
      active = false;
      if (sessionValues.mode === 'history') {
        const identity = historyRuntimeRef.current.identity;
        if (identity && socket.readyState === WebSocket.OPEN) socket.send(serializeHistoryCancel({ ...identity, reason: 'session-replaced' }));
      }
      socket.close();
      liveSessionAcceptedRef.current = false;
      historyQueryRequestRef.current = undefined;
      historyQueryStartRef.current = undefined;
      if (historySocketRef.current === socket) historySocketRef.current = undefined;
    };
  }, [applied.follow, applied.mode, applied.period, appliedRangeResult, selectedSources, sessionAttempt]);

  useEffect(() => {
    virtualizer.measure();
  }, [display.wrapLines, virtualizer]);

  useEffect(() => {
    if (applied.mode === 'history' && historyRuntimeRef.current.terminal) historyQueryStartRef.current?.(applied.filters);
  }, [applied.filters, applied.mode]);

  const requestHistoryQueryRange = () => {
    if (!queryHistoryActive || historyQuery!.totalMatches === 0) return;
    const items = virtualizer.getVirtualItems();
    const firstIndex = items[0]?.index ?? 0;
    const lastIndex = items[items.length - 1]?.index ?? Math.min(historyQuery!.totalMatches - 1, firstIndex + HISTORY_WINDOW_LIMIT - 1);
    historyQueryVisibleRangeRef.current = { firstIndex, lastIndex };
    const firstMissing = items.find((item) => !historyQueryRecordAt(historyQueryCache, item.index))?.index ?? (historyQueryRecordAt(historyQueryCache, firstIndex) ? undefined : firstIndex);
    if (firstMissing !== undefined) historyQueryRequestRef.current?.({ offset: firstMissing, direction: 'forward' });
  };

  useEffect(() => {
    requestHistoryQueryRange();
  }, [historyQuery?.queryId, historyQuery?.totalMatches, historyQueryCache.windows.length, queryHistoryActive, virtualizer]);

  useEffect(() => {
    const shouldRevealTail = historyTailRevealRef.current || (applied.mode === 'live' && liveSessionAcceptedRef.current);
    if (shouldRevealTail && autoScroll && !paused && virtualCount > 0) {
      virtualizer.scrollToIndex(virtualCount - 1, { align: 'end' });
      historyTailRevealRef.current = false;
    }
  }, [applied.mode, autoScroll, events.length, paused, virtualCount, virtualizer]);

  const sourceErrors = [...sourceStates.values()].filter((item) => item.status === 'error');
  const historySourceErrors = historyState?.sources.filter((item) => item.status === 'failed' || Boolean(item.error)) ?? [];
  const totalDropped = applied.mode === 'history'
    ? historyState?.sources.reduce((sum, item) => sum + item.counters.droppedLines, 0) ?? 0
    : [...sourceStates.values()].reduce((sum, item) => sum + item.counters.droppedLines, 0);
  const totalLines = applied.mode === 'history'
    ? historyState?.aggregate?.capturedLines ?? 0
    : [...sourceStates.values()].reduce((sum, item) => sum + item.counters.emittedLines, 0);
  const updateDraft = (update: (current: LogSearchState['draft']) => LogSearchState['draft']) => {
    setValidationError(undefined);
    setSearch((current) => ({ ...current, draft: update(current.draft) }));
  };
  const updateFilter = (field: keyof LogRecordFilters, value: string) => updateDraft((current) => ({ ...current, filters: { ...current.filters, [field]: value } }));
  const clearFilters = () => updateDraft((current) => ({ ...current, filters: { pod: '', container: '', cluster: '', namespace: '', text: '' } }));
  const draftFilterCount = Object.values(draft.filters).filter(Boolean).length;
  const activeFilterCount = Object.values(applied.filters).filter(Boolean).length;
  const beginTransportOperation = (snapshot: LogSearchOperationSnapshot, kind: LogSearchOperationKind) => {
    const operation = { kind, snapshot };
    setSearchOperationState(operation);
    setSessionAttempt((attempt) => attempt + 1);
  };
  const confirmSearch = () => {
    const activation = createLogSearchActivation({ draft, applied }, {
      isBusy: Boolean(searchOperationRef.current),
      sources: selectedSources,
      now: new Date(),
      requestId: ++searchOperationIdRef.current,
    });
    if (!activation.accepted) {
      if (activation.reason === 'invalid-range') setValidationError(activation.error);
      return;
    }
    setValidationError(undefined);
    searchJumpRequestRef.current = createLogSearchJumpRequest(activation.snapshot, activation.kind);
    if (activation.startsTransport) beginTransportOperation(activation.snapshot, activation.kind);
    setSearch(activation.nextState);
  };
  const requestHistoryEdge = (edge: 'before' | 'after') => {
    if (applied.mode !== 'history' || !historyState || !['complete', 'partial', 'failed'].includes(historyState.status)) return;
    for (const source of historyState.sources) {
      const windows = historyWindows.windows.filter((window) => window.sourceKey === source.sourceKey).sort((left, right) => left.startLine - right.startLine);
      const first = windows[0];
      const last = windows[windows.length - 1];
      if (edge === 'before' && first?.hasMoreBefore) historyRequestRef.current?.(source.sourceKey, first.startLine, 'backward');
      if (edge === 'after' && last?.hasMoreAfter) historyRequestRef.current?.(source.sourceKey, last.endLine, 'forward');
    }
  };
  const retryHistoryWindows = () => {
    if (queryHistoryActive && historyQueryRetryRequests.length > 0 && historyQueryRequestRef.current) {
      const requests = historyQueryRetryRequests;
      setHistoryWindowError(undefined);
      setHistoryQueryRetryRequests([]);
      for (const request of requests) historyQueryRequestRef.current(request);
      return;
    }
    if (historyWindowRetryRequests.length === 0 || !historyRequestRef.current) return;
    const requests = historyWindowRetryRequests;
    setHistoryWindowError(undefined);
    setHistoryWindowRetryRequests([]);
    setHistoryWindowLoading(true);
    for (const request of requests) historyRequestRef.current(request.sourceKey, request.line, request.direction);
  };
  const onScroll = () => {
    const element = outputRef.current;
    if (element) {
      const nearEnd = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      if (applied.mode === 'live') setAutoScroll(nearEnd);
      else setAutoScroll(false);
      if (queryHistoryActive) requestHistoryQueryRange();
      else if (nearEnd) requestHistoryEdge('after');
      else if (element.scrollTop < 80) requestHistoryEdge('before');
    }
  };
  const jumpToLatest = () => {
    if (queryHistoryActive) {
      setAutoScroll(true);
      if (virtualCount > 0) virtualizer.scrollToIndex(virtualCount - 1, { align: 'end' });
      return;
    }
    if (applied.mode === 'history' && historyState && ['complete', 'partial', 'failed'].includes(historyState.status)) {
      let waitingForTail = false;
      for (const source of historyState.sources) {
        const total = source.counters.emittedLines;
        if (total <= HISTORY_WINDOW_LIMIT) continue;
        const hasTail = historyWindows.windows.some((window) => window.sourceKey === source.sourceKey && window.endLine === total && !window.hasMoreAfter);
        const requestKey = `${source.sourceKey}:${total}:backward`;
        if (!hasTail && !historyRuntimeRef.current.requested.has(requestKey)) {
          historyTailPendingRef.current = true;
          historyRequestRef.current?.(source.sourceKey, total, 'backward');
          waitingForTail = true;
        }
      }
      if (waitingForTail) return;
    }
    setAutoScroll(true);
    if (virtualCount > 0) virtualizer.scrollToIndex(virtualCount - 1, { align: 'end' });
  };
  jumpToLatestRef.current = jumpToLatest;
  useEffect(() => {
    const request = searchJumpRequestRef.current;
    const historyResultsReady = Boolean(historyQuery?.queryId) && historyQueryReadyRequestRef.current === request?.requestId;
    const resultsReady = applied.mode === 'live' ? liveSessionAcceptedRef.current && events.length > 0 : historyResultsReady;
    const jump = jumpToLatestRef.current;
    if (!jump || !shouldConsumeLogSearchJumpRequest(request, { requestId: searchOperationIdRef.current, mode: applied.mode, paused, resultsReady })) return;
    searchJumpRequestRef.current = consumeLogSearchJumpRequest(request);
    jump();
  }, [applied.filters, applied.mode, events.length, historyQuery?.queryId, paused, state, virtualCount]);
  const canTransitionToLive = applied.mode === 'history' && historyState && ['complete', 'partial'].includes(historyState.status);
  const transitionToLive = () => {
    if (!canTransitionToLive || hasPendingSearch || isSearchApplying) return;
    transitioningFromHistoryRef.current = true;
    setHistoryState((current) => current ? { ...current, status: 'transitioning' } : current);
    const next = { ...applied, mode: 'live' as const, follow: true };
    const range = resolveLogRange(next.period, new Date(), { from: next.customFrom, to: next.customTo }).range ?? {};
    beginTransportOperation(createLogSearchOperationSnapshot(next, range, selectedSources, ++searchOperationIdRef.current), 'live');
    setSearch({ draft: cloneLogSearchValues(next), applied: cloneLogSearchValues(next) });
  };
  const retryLiveTransition = () => {
    if (historyState?.status !== 'transition-failed' || isSearchApplying) return;
    transitioningFromHistoryRef.current = true;
    setHistoryState((current) => current ? { ...current, status: 'transitioning' } : current);
    const range = resolveLogRange(applied.period, new Date(), { from: applied.customFrom, to: applied.customTo }).range ?? {};
    beginTransportOperation(createLogSearchOperationSnapshot(applied, range, selectedSources, ++searchOperationIdRef.current), 'live');
  };
  const cancelHistory = () => {
    const identity = historyRuntimeRef.current.identity;
    const socket = historySocketRef.current;
    if (!identity || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(serializeHistoryCancel({ ...identity, reason: 'user-cancelled' }));
  };
  const application = selectedSources[0]?.application;
  const contexts = consultedContexts && consultedContexts.length > 0
    ? consultedContexts.map((context) => `${context.cluster} / ${context.namespace}`)
    : [...new Set(selectedSources.map((source) => `${source.cluster} / ${source.namespace}`))];
  const selectedPods = new Set(selectedSources.map((source) => `${source.cluster}\u0000${source.namespace}\u0000${source.pod}`)).size;
  const sidecarCount = selectedSources.filter((source) => source.containerRole === 'sidecar').length;

  return <div className="log-viewer">
    <header className="log-workspace-header">
      <div className="log-workspace-identity">
        <span className="eyebrow">Logs workspace</span>
        <h2 title={application?.name ?? pod.name}>{application?.name ?? pod.name}</h2>
        <span title={application?.key}>{application?.key ?? 'pod identity'}</span>
      </div>
      <div className="log-workspace-contexts" aria-label="Selected log contexts">
        <span className="summary-label">Contexts</span>
        <div>{contexts.map((context) => <span key={context} title={context}>{context}</span>)}</div>
      </div>
      <div className="log-workspace-stats">
        <span>{selectedPods} pod(s)</span>
        <span>{selectedSources.length} container(s)</span>
        <span>{sidecarCount} sidecar(s)</span>
        <span>{applied.mode === 'history' ? 'History mode' : 'Live mode'}</span>
        <span>{formatRange(appliedRangeResult.range)}</span>
        <span className={`log-workspace-status log-state-${state}`} role="status" aria-live="polite"><span className="status-dot" />{sourceErrors.length > 0 || historySourceErrors.length > 0 ? `${stateLabel(state)} · partial` : stateLabel(state)}</span>
      </div>
      <div className="log-workspace-actions">
        {onChangeSources && <button type="button" className="secondary-button" onClick={onChangeSources}>Change sources</button>}
        {onClose && <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close logs workspace" title="Close logs workspace"><X size={15} /></button>}
      </div>
    </header>
    <div className="log-toolbar">
      <div className="log-toolbar-range">
        <fieldset className="log-mode-control"><legend>Session mode</legend><label><input type="radio" name="log-mode" value="live" checked={draft.mode === 'live'} onChange={() => updateDraft((current) => ({ ...current, mode: 'live' }))} /> Live</label><label><input type="radio" name="log-mode" value="history" checked={draft.mode === 'history'} onChange={() => updateDraft((current) => ({ ...current, mode: 'history' }))} /> History</label></fieldset>
        <label className="log-control"><span>Period</span><select value={draft.period} onChange={(event) => updateDraft((current) => ({ ...current, period: event.target.value as typeof draft.period }))} aria-label="Log period">{LOG_PERIODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {draft.period === 'custom' && <div className="log-range-fields" aria-label="Custom UTC range"><label className="log-control"><span>From inclusive</span><input type="datetime-local" value={draft.customFrom} onChange={(event) => updateDraft((current) => ({ ...current, customFrom: event.target.value }))} aria-label="Log range start UTC" /></label><label className="log-control"><span>To exclusive</span><input type="datetime-local" value={draft.customTo} onChange={(event) => updateDraft((current) => ({ ...current, customTo: event.target.value }))} aria-label="Log range end UTC" /></label></div>}
        {draft.mode === 'live' && <label className="log-follow"><input type="checkbox" checked={draft.follow} onChange={(event) => updateDraft((current) => ({ ...current, follow: event.target.checked }))} /> Follow</label>}
      </div>
      <div className="log-structured-filters" aria-label="Structured log filters">
        <FilterSelect label="Pod" value={draft.filters.pod} values={filterValues.pods} onChange={(value) => updateFilter('pod', value)} />
        <FilterSelect label="Container" value={draft.filters.container} values={filterValues.containers} onChange={(value) => updateFilter('container', value)} />
        <FilterSelect label="Cluster" value={draft.filters.cluster} values={filterValues.clusters} onChange={(value) => updateFilter('cluster', value)} />
        <FilterSelect label="Namespace" value={draft.filters.namespace} values={filterValues.namespaces} onChange={(value) => updateFilter('namespace', value)} />
        <label className="log-filter"><Search size={13} aria-hidden="true" /><span className="visually-hidden">Filter log message text</span><input value={draft.filters.text} onChange={(event) => updateFilter('text', event.target.value)} placeholder="Message text" aria-label="Filter log message text" />{draft.filters.text && <button type="button" className="filter-clear" onClick={() => updateFilter('text', '')} aria-label="Clear message text filter"><X size={11} aria-hidden="true" /></button>}</label>
        {draftFilterCount > 0 && <button type="button" className="text-button" onClick={clearFilters}>Clear filters ({draftFilterCount})</button>}
      </div>
      <div className="log-toolbar-actions">
        <div className="log-search-cluster">
          <label className="log-control log-grouping"><span>Group</span><select value={display.grouping} onChange={(event) => setDisplay((current) => ({ ...current, grouping: event.target.value as LogGrouping }))} aria-label="Log grouping"><option value="application">Application</option><option value="source">Source</option></select></label>
          <button type="button" className="primary-button log-search-button" onClick={confirmSearch} disabled={selectedSources.length === 0 || isSearchApplying} aria-busy={isSearchApplying}>{isSearchApplying ? <LoaderCircle size={14} className="spinning" aria-hidden="true" /> : <Search size={14} aria-hidden="true" />} Search</button>
        </div>
        <span className="log-search-status" role="status" aria-live="polite">{isSearchApplying ? 'Applying search...' : hasPendingSearch ? `Search changes pending · ${activeFilterCount} applied filter(s)` : `Search applied · ${activeFilterCount} applied filter(s) · ${applied.mode}`}</span>
        <label className="log-follow"><input type="checkbox" checked={display.wrapLines} onChange={(event) => setDisplay((current) => setWrapLines(current, event.target.checked))} /> Wrap lines</label>
        <span className={`log-state log-state-${state}`} role="status" aria-live="polite"><span className="status-dot" />{stateLabel(state)}</span>
        <div className="log-actions"><button type="button" className="icon-button subtle" onClick={() => setPaused((value) => !value)} title={paused ? 'Resume' : 'Pause'} aria-label={paused ? 'Resume log stream' : 'Pause log stream'}>{paused ? <Play size={14} /> : <Pause size={14} />}</button><button type="button" className="icon-button subtle" onClick={() => setEvents([])} title="Clear" aria-label="Clear retained log events"><Trash2 size={14} /></button></div>
      </div>
    </div>
    <div className="log-range-summary" role="status"><span>{formatRange(appliedRangeResult.range)}</span><span>{selectedSources.length} source(s) selected</span><span>Effective limit: {formatBytes(acceptedLimits.maxBytesTotal)} / {acceptedLimits.maxLinesTotal.toLocaleString()} lines</span></div>
    {historyState && <div className="log-history-status" role="status" aria-live="polite"><div><strong>{historyStatusLabel(historyState.status)}</strong>{historyState.aggregate && <span>{historyState.aggregate.capturedLines.toLocaleString()} lines · {formatBytes(historyState.aggregate.capturedBytes)} · {historyState.aggregate.completedSources}/{historyState.aggregate.sourceCount} sources complete</span>}{historyState.limitReasons.length > 0 && <span>Limit: {historyState.limitReasons.join(', ')}</span>}{historyWindowError && <span role="alert">Historical window failed: {historyWindowError}</span>}</div><div className="log-history-actions">{historyWindowError && <button type="button" className="text-button" onClick={retryHistoryWindows}>Retry historical window</button>}{historyState.status === 'reading' && <button type="button" className="text-button" onClick={cancelHistory}>Cancel history</button>}{canTransitionToLive && <button type="button" className="secondary-button" onClick={transitionToLive} disabled={hasPendingSearch || isSearchApplying}>Start one new live session</button>}{historyState.status === 'transition-failed' && <button type="button" className="secondary-button" onClick={retryLiveTransition} disabled={isSearchApplying}>Retry live transition</button>}</div></div>}
    <details className="log-source-inspection">
      <summary>Inspect selected sources ({selectedSources.length}){sourceErrors.length + historySourceErrors.length > 0 ? ` · ${sourceErrors.length + historySourceErrors.length} failed` : ''}</summary>
      <div className="log-source-inspection-list">{selectedSources.map((source) => { const sourceState = sourceStates.get(source.sourceId); const historicalState = historyState?.sources.find((item) => item.source.sourceId === source.sourceId); return <span key={source.sourceId} title={sourceLabel(source)}>{sourceLabel(source)}{sourceState ? ` · ${sourceState.status}${sourceState.endReason ? `:${sourceState.endReason}` : ''}` : historicalState ? ` · ${historicalState.status}` : ''}</span>; })}</div>
    </details>
    {error && <ErrorState message={error} />}
    {validationError && <div className="log-validation-error" role="alert"><strong>Search was not applied.</strong> {validationError}</div>}
    {(sourceErrors.length > 0 || historySourceErrors.length > 0) && <div className="log-partial-summary" role="status" aria-live="polite"><strong>{sourceErrors.length + historySourceErrors.length} source(s) failed</strong>{sourceErrors.map((item) => <span key={item.source.sourceId}>{sourceLabel(item.source)}: {item.error}</span>)}{historySourceErrors.map((item) => <span key={item.sourceKey}>{sourceLabel(item.source)}: {item.error ?? 'Source failed while preparing history.'}</span>)}</div>}
    <div className="log-output" ref={outputRef} onScroll={onScroll} tabIndex={0} role="log" aria-label="Structured log output" aria-live="polite"><div className={`log-output-inner ${display.wrapLines ? 'is-wrapped' : 'is-nowrap'}`} style={{ height: virtualizer.getTotalSize() }}>{virtualCount === 0 ? <p className="log-empty">{emptyMessage(state, applied.mode, historyState, historyWindowLoading, historyWindowError, events.length, activeFilterCount)}</p> : virtualizer.getVirtualItems().map((item) => { const cachedRecord = queryHistoryActive ? historyQueryRecordAt(historyQueryCache, item.index) : undefined; const record = queryHistoryActive ? cachedRecord ? historyRecordToEvent(cachedRecord) : undefined : visibleEvents[item.index]; return record ? <LogRow key={item.key} record={record} grouping={display.grouping} query={applied.filters.text} start={item.start} wrapLines={display.wrapLines} measureElement={virtualizer.measureElement} index={item.index} /> : <LogRowPlaceholder key={item.key} start={item.start} wrapLines={display.wrapLines} index={item.index} measureElement={virtualizer.measureElement} />; })}</div></div>
    <div className="log-footer"><span aria-live="polite">{queryHistoryActive ? `${historyQuery!.totalMatches.toLocaleString()} matching` : activeFilterCount > 0 ? `${visibleEvents.length} of ${events.length}` : `${events.length}`} retained / {totalLines.toLocaleString()} emitted{totalDropped > 0 ? ` / ${totalDropped} dropped` : ''}{applied.mode === 'live' && events.length >= CLIENT_LOG_BUFFER ? ' · client buffer full' : ''}{receivedWhilePaused > 0 ? ` · ${receivedWhilePaused} received while paused` : ''}</span>{summaryReason && <span>ended: {summaryReason}</span>}{applied.mode === 'history' && historyState?.status === 'transitioned' && <span>History boundary closed · live acknowledged</span>}{!autoScroll && <button type="button" className="text-button" onClick={jumpToLatest}>Jump to latest</button>}</div>
  </div>;
}

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label className={`log-control log-filter-select ${value ? 'is-selected' : 'is-empty'}`} data-state={value ? 'selected' : 'empty'}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter by ${label.toLowerCase()}`}><option value="">All {label.toLowerCase()}s</option>{values.map((option) => <option value={option} key={option}>{option}</option>)}</select>{value && <button type="button" className="filter-clear" onClick={() => onChange('')} aria-label={`Clear ${label.toLowerCase()} filter`}><X size={11} aria-hidden="true" /></button>}</label>;
}

function stateLabel(state: ConnectionState): string { if (state === 'validating') return 'validating'; if (state === 'connecting') return 'connecting'; if (state === 'streaming') return 'live'; if (state === 'paused') return 'paused'; if (state === 'partial' || state === 'history-partial') return 'partial'; if (state === 'history-starting') return 'history starting'; if (state === 'history-reading') return 'reading history'; if (state === 'history-ready') return 'history ready'; if (state === 'history-cancelled') return 'history cancelled'; if (state === 'history-expired') return 'history expired'; if (state === 'transitioning') return 'starting live'; if (state === 'error') return 'error'; return 'ended'; }
function historyStatusLabel(status: HistoryViewState['status']): string { if (status === 'starting') return 'History session starting'; if (status === 'reading') return 'Preparing historical snapshot'; if (status === 'complete') return 'Historical snapshot ready'; if (status === 'partial') return 'Historical snapshot partial'; if (status === 'failed') return 'Historical snapshot failed'; if (status === 'cancelled') return 'Historical snapshot cancelled'; if (status === 'expired') return 'Historical snapshot expired'; if (status === 'transitioning') return 'Historical boundary retained while Live connects'; if (status === 'transition-failed') return 'Live transition failed; history retained'; return 'Historical boundary closed; Live acknowledged'; }
function emptyMessage(state: ConnectionState, mode: 'live' | 'history', history: HistoryViewState | undefined, windowLoading: boolean, windowError: string | undefined, eventCount: number, filterCount: number): string { if (filterCount > 0 && eventCount > 0) return 'No event matches the selected filters.'; if (mode === 'history') { if (state === 'history-starting' || state === 'history-reading') return 'Preparing the historical snapshot...'; if (windowError) return 'The historical window could not be loaded. Retry the window request.'; if (windowLoading) return 'Loading historical window...'; if (history?.status === 'cancelled') return 'History was cancelled. Start a new Search to begin again.'; if (history?.status === 'expired') return 'This historical snapshot expired. Start a new Search to prepare it again.'; if (history?.status === 'failed') return 'The historical snapshot failed without readable records.'; if (history?.status === 'complete' || history?.status === 'partial') return 'The historical snapshot contains no records.'; } return state === 'connecting' || state === 'transitioning' ? 'Connecting to selected sources...' : 'No log events received yet.'; }
function formatRange(range?: { from?: string; to?: string }): string { if (!range || (!range.from && !range.to)) return 'Range: all available'; return `Range: ${range.from ?? 'all available'} to ${range.to ?? 'now'} (UTC, end exclusive)`; }
function formatBytes(bytes: number): string { if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MiB`; if (bytes >= 1024) return `${Math.round(bytes / 1024)} KiB`; return `${bytes} B`; }

function LogRow({ record, grouping, query, start, wrapLines, measureElement, index }: { record: LogEventRecord; grouping: LogGrouping; query: string; start: number; wrapLines: boolean; measureElement: (element: HTMLElement) => void; index: number }) {
  const group = grouping === 'application' ? record.source.application?.name ?? record.source.pod : record.source.container;
  const message = record.event.message || '(empty message)';
  return <div ref={(element) => { if (element) measureElement(element); }} data-index={index} className={`log-line structured-log-line ${wrapLines ? 'is-wrapped' : 'is-nowrap'}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${start}px)` }}>
    <span className="log-source-cell" title={`${record.source.pod} / ${record.source.container}`}><strong>{group}</strong><small>{record.source.pod} / {record.source.container}</small></span>
    <span className="log-message" aria-label={message}>{highlightSegments(message, query).map((segment, index) => segment.match ? <mark className="log-mark" key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>)}</span>
  </div>;
}

function LogRowPlaceholder({ start, wrapLines, measureElement, index }: { start: number; wrapLines: boolean; measureElement: (element: HTMLElement) => void; index: number }) {
  return <div ref={(element) => { if (element) measureElement(element); }} data-index={index} className={`log-line structured-log-line log-query-placeholder ${wrapLines ? 'is-wrapped' : 'is-nowrap'}`} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${start}px)` }} aria-label="Loading historical record"><span className="log-source-cell" aria-hidden="true"><strong>...</strong><small>loading</small></span><span className="log-message" aria-hidden="true">Loading historical record...</span></div>;
}

function highlightSegments(value: string, query: string): Array<{ text: string; match: boolean }> { const needle = query.trim(); if (!needle) return [{ text: value, match: false }]; const lower = value.toLowerCase(); const lowerNeedle = needle.toLowerCase(); const segments: Array<{ text: string; match: boolean }> = []; let cursor = 0; let index = lower.indexOf(lowerNeedle); while (index >= 0) { if (index > cursor) segments.push({ text: value.slice(cursor, index), match: false }); segments.push({ text: value.slice(index, index + needle.length), match: true }); cursor = index + needle.length; index = lower.indexOf(lowerNeedle, cursor); } if (cursor < value.length) segments.push({ text: value.slice(cursor), match: false }); return segments.length > 0 ? segments : [{ text: value, match: false }]; }

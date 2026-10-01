import { serializeHistoryQueryStart, serializeHistoryQueryWindow, serializeHistoryWindow } from './api';
import { createHistoryQueryWindowCache } from './logsSession';
import { HISTORY_WINDOW_LIMIT, type HistoryQueryWindowCache, type HistoryQueryWindowRequest, type HistoryWindowRequest } from './logsSession';
import type { HistoryQueryFilters, HistorySessionIdentity } from './types';

export interface HistoryRuntime {
  identity?: HistorySessionIdentity;
  requested: Set<string>;
  pending: Map<string, HistoryWindowRequest>;
  sourceProgress: import('./types').HistorySourceProgress[];
  terminal: boolean;
}

export interface HistoryQueryState {
  identity: HistorySessionIdentity;
  queryId: string;
  totalMatches: number;
}

export interface HistoryQueryRuntime {
  queryId?: string;
  retiredQueryIds: Set<string>;
  requested: Set<string>;
  pending: Map<string, HistoryQueryWindowRequest>;
}

interface HistoryControllerOptions {
  socket: WebSocket;
  historyRuntime: HistoryRuntime;
  historyQueryRuntime: HistoryQueryRuntime;
  setHistoryWindowLoading: (value: boolean) => void;
  setHistoryWindowError: (value: string | undefined) => void;
  setHistoryWindowRetryRequests: (value: HistoryWindowRequest[]) => void;
  setHistoryQueryRetryRequests: (value: HistoryQueryWindowRequest[]) => void;
  setHistoryQuery: (value: HistoryQueryState | undefined) => void;
  setHistoryQueryCache: (value: HistoryQueryWindowCache) => void;
  resetHistoryQueryReadyRequest: () => void;
}

export function createHistoryController({
  socket,
  historyRuntime,
  historyQueryRuntime,
  setHistoryWindowLoading,
  setHistoryWindowError,
  setHistoryWindowRetryRequests,
  setHistoryQueryRetryRequests,
  setHistoryQuery,
  setHistoryQueryCache,
  resetHistoryQueryReadyRequest,
}: HistoryControllerOptions) {
  const isCurrentEvent = (event: { sessionId: string; snapshotId: string; generation: number }) => {
    const identity = historyRuntime.identity;
    return Boolean(identity && event.sessionId === identity.sessionId && event.snapshotId === identity.snapshotId && event.generation === identity.generation);
  };
  const requestWindow = (sourceKey: string, line: number, direction: 'forward' | 'backward' = 'forward') => {
    const identity = historyRuntime.identity;
    if (!identity || socket.readyState !== WebSocket.OPEN) return;
    const key = `${sourceKey}:${line}:${direction}`;
    if (historyRuntime.requested.has(key)) return;
    historyRuntime.requested.add(key);
    historyRuntime.pending.set(key, { sourceKey, line, direction });
    socket.send(serializeHistoryWindow({ sessionId: identity.sessionId, generation: identity.generation, sourceKey, line, direction, limit: HISTORY_WINDOW_LIMIT }));
  };
  const requestQueryWindow = (request: HistoryQueryWindowRequest) => {
    const identity = historyRuntime.identity;
    const queryId = historyQueryRuntime.queryId;
    if (!identity || !queryId || socket.readyState !== WebSocket.OPEN) return;
    const key = `${queryId}:${request.offset}:${request.direction}`;
    if (historyQueryRuntime.requested.has(key)) return;
    historyQueryRuntime.requested.add(key);
    historyQueryRuntime.pending.set(key, request);
    socket.send(serializeHistoryQueryWindow({ sessionId: identity.sessionId, generation: identity.generation, queryId, offset: request.offset, direction: request.direction, limit: HISTORY_WINDOW_LIMIT }));
    setHistoryWindowLoading(true);
  };
  const startQuery = (filters: HistoryQueryFilters) => {
    const identity = historyRuntime.identity;
    if (!identity || !historyRuntime.terminal || socket.readyState !== WebSocket.OPEN) return;
    resetHistoryQueryReadyRequest();
    const previousQueryId = historyQueryRuntime.queryId;
    if (previousQueryId) historyQueryRuntime.retiredQueryIds.add(previousQueryId);
    historyQueryRuntime.queryId = undefined;
    historyQueryRuntime.requested.clear();
    historyQueryRuntime.pending.clear();
    setHistoryQuery(undefined);
    setHistoryQueryCache(createHistoryQueryWindowCache());
    setHistoryQueryRetryRequests([]);
    setHistoryWindowError(undefined);
    setHistoryWindowLoading(true);
    socket.send(serializeHistoryQueryStart({ sessionId: identity.sessionId, generation: identity.generation, filters }));
  };
  const failPendingWindows = (message: string): boolean => {
    if (historyRuntime.pending.size === 0) return false;
    const retryRequests = [...historyRuntime.pending.values()];
    historyRuntime.pending.clear();
    historyRuntime.requested.clear();
    setHistoryWindowRetryRequests(retryRequests);
    setHistoryWindowError(message);
    setHistoryWindowLoading(false);
    return true;
  };
  const failPendingQueryWindows = (message: string): boolean => {
    if (historyQueryRuntime.pending.size === 0) return false;
    const retryRequests = [...historyQueryRuntime.pending.values()];
    historyQueryRuntime.pending.clear();
    historyQueryRuntime.requested.clear();
    setHistoryQueryRetryRequests(retryRequests);
    setHistoryWindowError(message);
    setHistoryWindowLoading(false);
    return true;
  };
  return { isCurrentEvent, requestWindow, requestQueryWindow, startQuery, failPendingWindows, failPendingQueryWindows };
}
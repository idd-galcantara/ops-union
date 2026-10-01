import { useRef, useState } from 'react';
import { resolveLogRange } from './logsRange';
import {
  cloneLogSearchValues,
  createLogSearchActivation,
  createLogSearchJumpRequest,
  createLogSearchOperationSnapshot,
  DEFAULT_LOG_SEARCH_VALUES,
  searchHasPendingChanges,
  type LogSearchJumpRequest,
  type LogSearchOperationKind,
  type LogSearchOperationSnapshot,
  type LogSearchState,
} from './logsSearch';
import type { LogSource } from './types';

export interface SearchOperationState {
  kind: LogSearchOperationKind;
  snapshot: LogSearchOperationSnapshot;
}

interface UseLogSearchControllerOptions {
  sources: LogSource[];
  historyStatus: 'complete' | 'partial' | 'transition-failed' | undefined;
  onHistoryTransitionStatus: (status: 'transitioning') => void;
}

export function useLogSearchController({ sources, historyStatus, onHistoryTransitionStatus }: UseLogSearchControllerOptions) {
  const [search, setSearch] = useState<LogSearchState>(() => ({ draft: cloneLogSearchValues(DEFAULT_LOG_SEARCH_VALUES), applied: cloneLogSearchValues(DEFAULT_LOG_SEARCH_VALUES) }));
  const [validationError, setValidationError] = useState<string>();
  const [searchOperation, setSearchOperation] = useState<SearchOperationState>();
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const searchOperationIdRef = useRef(0);
  const searchOperationRef = useRef<SearchOperationState | undefined>(undefined);
  const searchJumpRequestRef = useRef<LogSearchJumpRequest | undefined>(undefined);
  const transitioningFromHistoryRef = useRef(false);

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
  const beginTransportOperation = (snapshot: LogSearchOperationSnapshot, kind: LogSearchOperationKind) => {
    setSearchOperationState({ kind, snapshot });
    setSessionAttempt((attempt) => attempt + 1);
  };
  const confirmSearch = () => {
    const activation = createLogSearchActivation({ draft: search.draft, applied: search.applied }, {
      isBusy: Boolean(searchOperationRef.current),
      sources,
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
  const canTransitionToLive = search.applied.mode === 'history' && (historyStatus === 'complete' || historyStatus === 'partial');
  const transitionToLive = () => {
    if (!canTransitionToLive || searchHasPendingChanges(search) || Boolean(searchOperationRef.current)) return;
    transitioningFromHistoryRef.current = true;
    onHistoryTransitionStatus('transitioning');
    const next = { ...search.applied, mode: 'live' as const, follow: true };
    const range = resolveLogRange(next.period, new Date(), { from: next.customFrom, to: next.customTo }).range ?? {};
    beginTransportOperation(createLogSearchOperationSnapshot(next, range, sources, ++searchOperationIdRef.current), 'live');
    setSearch({ draft: cloneLogSearchValues(next), applied: cloneLogSearchValues(next) });
  };
  const retryLiveTransition = () => {
    if (historyStatus !== 'transition-failed' || Boolean(searchOperationRef.current)) return;
    transitioningFromHistoryRef.current = true;
    onHistoryTransitionStatus('transitioning');
    const range = resolveLogRange(search.applied.period, new Date(), { from: search.applied.customFrom, to: search.applied.customTo }).range ?? {};
    beginTransportOperation(createLogSearchOperationSnapshot(search.applied, range, sources, ++searchOperationIdRef.current), 'live');
  };

  return {
    search,
    setSearch,
    draft: search.draft,
    applied: search.applied,
    validationError,
    setValidationError,
    searchOperation,
    searchOperationRef,
    searchOperationIdRef,
    searchJumpRequestRef,
    transitioningFromHistoryRef,
    sessionAttempt,
    hasPendingSearch: searchHasPendingChanges(search),
    isSearchApplying: Boolean(searchOperation),
    canTransitionToLive,
    confirmSearch,
    finishSearchOperation,
    transitionToLive,
    retryLiveTransition,
  };
}
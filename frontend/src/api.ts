import type {
  ContextInfo,
  KubeConfigStatus,
  NamespacesResponse,
  PodDescribe,
  PodMetricsResult,
  PodsResponse,
  Target,
  LogSource,
  LogSubscription,
  HistoryQueryFilters,
  HistoryWindowEvent,
} from './types';

/**
 * Actionable, secret-free message shown when the local backend cannot be
 * reached (process down, connection refused) or is returning gateway errors
 * (HTTP 502 through the Vite proxy). Presentation-only (LLR-6).
 */
export function backendUnavailableMessage(): string {
  return 'The local backend is unavailable. It may have stopped or restarted — reconnect once it is running again.';
}

/**
 * Distinguished error for the backend-unavailable failure class so callers and
 * presenters can show {@link backendUnavailableMessage} instead of a raw
 * 'HTTP 502' or a transport-level fetch rejection.
 */
export class BackendUnavailableError extends Error {
  readonly kind = 'backend-unavailable' as const;
  constructor(message: string = backendUnavailableMessage()) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

/** True when a reason is (or should be presented as) a backend-unavailable failure. */
export function isBackendUnavailable(reason: unknown): boolean {
  if (reason instanceof BackendUnavailableError) return true;
  // A fetch to a dead/refused local backend rejects with a TypeError and no Response.
  return reason instanceof TypeError;
}

/** Reads safe metadata about the active kubeconfig. */
export async function fetchKubeConfigStatus(): Promise<KubeConfigStatus> {
  const res = await fetch('/api/kubeconfig/status');
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as KubeConfigStatus;
}

/** Extracts a readable message from a non-OK response. */
async function errorFrom(res: Response): Promise<Error> {
  // A 502 through the Vite proxy means the local backend dropped the connection.
  if (res.status === 502) return new BackendUnavailableError();
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return new Error(body.error);
  } catch {
    // Body was not JSON; fall through to the status text.
  }
  return new Error(`HTTP ${res.status}`);
}

/** Lists kubeconfig contexts available as targets. */
export async function fetchContexts(): Promise<ContextInfo[]> {
  const res = await fetch('/api/contexts');
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as { contexts: ContextInfo[] };
  return body.contexts;
}

/**
 * Fans out a pods query across the given (cluster, namespace) targets.
 * Per-target failures come back in `errors` while successful targets still
 * return their pods.
 */
export async function fetchPods(targets: Target[]): Promise<PodsResponse> {
  const res = await fetch('/api/pods', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as PodsResponse;
}

/**
 * Lists the namespaces available across the given clusters, each annotated with
 * where it exists. Read-only.
 */
export async function fetchNamespaces(clusters: string[]): Promise<NamespacesResponse> {
  const res = await fetch('/api/namespaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clusters }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as NamespacesResponse;
}

/** Path-safe encoding for the cluster/namespace/pod segments. */
function podPath(cluster: string, namespace: string, pod: string): string {
  return `/api/pods/${encodeURIComponent(cluster)}/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}`;
}

/** Reads describe-equivalent details for a pod. */
export async function fetchPodDescribe(
  cluster: string,
  namespace: string,
  pod: string,
): Promise<PodDescribe> {
  const res = await fetch(`${podPath(cluster, namespace, pod)}/describe`);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as PodDescribe;
}

/**
 * Reads CPU/memory for a pod. Always resolves: clusters without metrics-server
 * report `available: false` rather than failing.
 */
export async function fetchPodMetrics(
  cluster: string,
  namespace: string,
  pod: string,
): Promise<PodMetricsResult> {
  const res = await fetch(`${podPath(cluster, namespace, pod)}/metrics`);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as PodMetricsResult;
}

/** Builds the WebSocket URL for streaming a container's logs. */
export function podLogsUrl(
  cluster: string,
  namespace: string,
  pod: string,
  options: { container: string; follow: boolean; tailLines: number },
): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({
    container: options.container,
    follow: String(options.follow),
    tailLines: String(options.tailLines),
  });
  return `${protocol}//${window.location.host}${podPath(cluster, namespace, pod)}/logs?${params}`;
}

/** Builds the single multiplexed WebSocket URL for an aggregate log session. */
export function aggregateLogsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/logs`;
}

/** Keeps the aggregate subscription shape explicit at the transport boundary. */
export function serializeLogSubscription(subscription: LogSubscription): string {
  return JSON.stringify(subscription);
}

export function serializeHistoryStart(input: {
  requestId: string;
  generation: number;
  from?: string;
  to?: string;
  sources: LogSource[];
}): string {
  return JSON.stringify({ type: 'history.start', ...input });
}

export function serializeHistoryWindow(input: {
  sessionId: string;
  generation: number;
  sourceKey: string;
  line: number;
  direction?: 'forward' | 'backward';
  limit?: number;
}): string {
  return JSON.stringify({
    type: 'history.window',
    sessionId: input.sessionId,
    generation: input.generation,
    cursor: { sourceKey: input.sourceKey, line: input.line },
    direction: input.direction ?? 'forward',
    limit: input.limit ?? 500,
  });
}

export function serializeHistoryCancel(input: { sessionId: string; generation: number; reason?: string }): string {
  return JSON.stringify({ type: 'history.cancel', ...input });
}

export function serializeHistoryQueryStart(input: { sessionId: string; generation: number; filters: HistoryQueryFilters }): string {
  return JSON.stringify({ type: 'history.query.start', ...input });
}

export function serializeHistoryQueryWindow(input: { sessionId: string; generation: number; queryId: string; offset: number; direction?: 'forward' | 'backward'; limit?: number }): string {
  return JSON.stringify({ type: 'history.query.window', ...input, direction: input.direction ?? 'forward', limit: input.limit ?? 500 });
}

export function isHistoryWindowEvent(event: { type: string }): event is HistoryWindowEvent {
  return event.type === 'history.window';
}

export function logSourceKey(source: Pick<LogSource, 'cluster' | 'namespace' | 'pod' | 'container'>): string {
  return [source.cluster, source.namespace, source.pod, source.container].join('\u0000');
}

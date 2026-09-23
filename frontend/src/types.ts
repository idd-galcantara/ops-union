/** Contract shared with the backend (see backend/src/kube/types.ts). */

/** A context available in the user's kubeconfig. */
export interface ContextInfo {
  name: string;
  cluster: string;
  namespace?: string;
}

export type KubeConfigSource = 'environment' | 'selected' | 'default';

export interface KubeConfigStatus {
  available: boolean;
  source: KubeConfigSource;
  contextCount?: number;
}

/** A query target: one (cluster, namespace) pair. */
export interface Target {
  cluster: string;
  namespace: string;
}

export interface ApplicationIdentity {
  key: string;
  name: string;
  source: 'label' | 'ownerReference' | 'pod';
  labelKey?: 'app.kubernetes.io/name' | 'app' | 'k8s-app';
  ownerKind?: string;
  ownerName?: string;
}

export interface LogSource {
  sourceId: string;
  cluster: string;
  namespace: string;
  pod: string;
  container: string;
  application?: ApplicationIdentity;
  containerRole?: ContainerRole;
}

export type ContainerRole = 'primary' | 'sidecar' | 'unknown';

export interface InventoryContainer {
  container: string;
  role: ContainerRole;
  roleReason?: string;
}

export interface InventoryPod {
  pod: string;
  containers: InventoryContainer[];
  status?: string;
}

export interface InventoryContext {
  cluster: string;
  namespace: string;
  pods: InventoryPod[];
  sidecarOnlyPods: string[];
}

export interface InventoryIssue {
  cluster?: string;
  namespace?: string;
  pod?: string;
  message: string;
}

export interface ApplicationLogInventory {
  application: ApplicationIdentity;
  consultedContexts: Target[];
  contexts: InventoryContext[];
  issues: InventoryIssue[];
  snapshotAt?: number;
}

export interface LogSourceSelection {
  cluster: string;
  namespace: string;
  pod: string;
  container: string;
  application: ApplicationIdentity;
  containerRole: ContainerRole;
}

export interface LogLimits {
  maxLinesPerSource: number;
  maxBytesPerSource: number;
  maxLinesTotal: number;
  maxBytesTotal: number;
}

export type LogPeriod = 'all' | '5m' | '15m' | '1h' | '6h' | '24h' | 'custom';

export interface LogRange {
  from?: string;
  to?: string;
}

export interface LogSubscription extends LogRange {
  type: 'subscribe';
  period: LogPeriod;
  follow: boolean;
  sources: LogSource[];
  limits: LogLimits;
}

export type LogMode = 'live' | 'history';
export type HistorySourceStatus = 'queued' | 'reading' | 'indexing' | 'ready' | 'partial' | 'failed' | 'cancelled';
export type HistoryTerminalStatus = 'complete' | 'partial' | 'failed' | 'cancelled' | 'expired';

export interface HistoryAggregateProgress {
  capturedLines: number;
  capturedBytes: number;
  completedSources: number;
  activeSources: number;
  queuedSources: number;
  sourceCount: number;
  determinate: false;
  limits: {
    maxLinesTotal: number;
    maxBytesTotal: number;
    maxDiskBytesTotal: number;
    usedDiskBytes: number;
  };
}

export interface HistorySourceProgress {
  source: LogSource;
  sourceKey: string;
  status: HistorySourceStatus;
  counters: LogCounters;
  limitReason?: string;
  error?: string;
  continuity: 'single-read' | 'unknown';
}

export interface HistoryRecord {
  sourceKey: string;
  source: LogSource;
  sequence: number;
  timestamp: string | null;
  message: string;
  bytes: number;
  application?: ApplicationIdentity;
}

export interface HistoryQueryFilters {
  pod: string;
  container: string;
  cluster: string;
  namespace: string;
  text: string;
}

export interface HistoryWindowEvent {
  type: 'history.window';
  sessionId: string;
  snapshotId: string;
  generation: number;
  sourceKey: string;
  source: LogSource;
  startLine: number;
  endLine: number;
  records: HistoryRecord[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface HistoryQueryWindowEvent {
  type: 'history.query.window';
  sessionId: string;
  snapshotId: string;
  generation: number;
  queryId: string;
  startIndex: number;
  endIndex: number;
  records: HistoryRecord[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface HistorySessionIdentity {
  sessionId: string;
  snapshotId: string;
  generation: number;
}

export interface LogCounters {
  emittedLines: number;
  emittedBytes: number;
  droppedLines: number;
}

export interface LogLineEvent {
  type: 'line';
  sourceId: string;
  sequence: number;
  timestamp: string | null;
  message: string;
  bytes: number;
  application?: ApplicationIdentity;
}

export interface LogEventRecord {
  event: LogLineEvent;
  source: LogSource;
}

export type SourceEndReason = 'eof' | 'to-reached' | 'limit' | 'cancelled';
export type SummaryReason = 'completed' | 'aggregate-limit' | 'cancelled' | 'all-failed';

export type AggregateLogEvent =
  | { type: 'accepted'; from: string | null; to: string | null; follow: boolean; limits: LogLimits; sourceCount: number }
  | { type: 'sourceStarted'; source: LogSource; counters: LogCounters }
  | LogLineEvent
  | { type: 'sourceWarning'; sourceId: string; warning: 'dropped-unparseable'; count: number }
  | { type: 'sourceError'; source: LogSource; message: string; counters: LogCounters; status: 'error' }
  | { type: 'sourceEnded'; source: LogSource; counters: LogCounters; reason: SourceEndReason }
  | { type: 'summary'; sources: Array<{ source: LogSource; counters: LogCounters; status: 'ended' | 'error' }>; limits: LogLimits; reason: SummaryReason }
  | { type: 'history.accepted'; requestId: string; sessionId: string; snapshotId: string; generation: number; sourceCount: number }
  | { type: 'history.progress'; sessionId: string; snapshotId: string; generation: number; aggregate: HistoryAggregateProgress; sources: HistorySourceProgress[] }
  | HistoryWindowEvent
  | { type: 'history.terminal'; sessionId: string; snapshotId: string; generation: number; status: HistoryTerminalStatus; aggregate: HistoryAggregateProgress; sources: HistorySourceProgress[]; limitReasons: string[] }
  | { type: 'history.query.ready'; sessionId: string; snapshotId: string; generation: number; queryId: string; totalMatches: number }
  | HistoryQueryWindowEvent
  | { type: 'error'; message: string };

export interface LogSourceState {
  source: LogSource;
  status: 'started' | 'ended' | 'error';
  counters: LogCounters;
  warningCount?: number;
  error?: string;
  endReason?: SourceEndReason;
}

/** A pod normalized for the unified view, annotated with its origin. */
export interface NormalizedPod {
  cluster: string;
  namespace: string;
  name: string;
  status: string;
  ready: string;
  restarts: number;
  node: string;
  ageSeconds: number;
  containers: string[];
  application: ApplicationIdentity;
}

/** An error for a single target that failed during fan-out. */
export interface TargetError {
  target: Target;
  message: string;
}

/** Aggregated pods response. */
export interface PodsResponse {
  pods: NormalizedPod[];
  errors: TargetError[];
}

/** How the unified table groups its rows. */
export type GroupingMode = 'namespace' | 'cluster' | 'application' | 'flat';

/** Stable key for a target, used for dedupe and React keys. */
export function targetKey(target: Target): string {
  return `${target.cluster}/${target.namespace}`;
}

/** A container's resource picture inside the describe payload. */
export interface ContainerDetail {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  state: string;
  reason?: string;
  message?: string;
  exitCode?: number;
  signal?: number;
  finishedAt?: string;
  lastState?: ContainerStateDetail;
  requests?: Record<string, string>;
  limits?: Record<string, string>;
  /** True for native sidecars (init containers with restartPolicy: Always). */
  sidecar: boolean;
}

export interface ContainerStateDetail {
  state: string;
  reason?: string;
  message?: string;
  exitCode?: number;
  signal?: number;
  finishedAt?: string;
}

export interface PodEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  lastSeen?: string;
}

export interface PodTerminationHistoryEntry {
  source: 'container' | 'event';
  timestamp?: string;
  container?: string;
  state?: string;
  reason?: string;
  message?: string;
  exitCode?: number;
  signal?: number;
  type?: string;
  count?: number;
}

export interface PodDescribe {
  cluster: string;
  namespace: string;
  name: string;
  status: string;
  node: string;
  podIP?: string;
  serviceAccount?: string;
  qosClass?: string;
  createdAt?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  conditions: { type: string; status: string; reason?: string; message?: string }[];
  containers: ContainerDetail[];
  events: PodEvent[];
  terminationHistory: PodTerminationHistoryEntry[];
  eventsError?: string;
}

/** `available: false` means the cluster has no metrics-server (expected case). */
export interface PodMetricsResult {
  available: boolean;
  containers?: { name: string; cpu: string; memory: string }[];
  window?: string;
  timestamp?: string;
  reason?: string;
}

/** Identifies the pod currently opened in the details panel. */
export interface PodRef {
  cluster: string;
  namespace: string;
  name: string;
  containers: string[];
  application?: ApplicationIdentity;
}

/** A namespace and the clusters (within the current selection) that have it. */
export interface NamespaceInfo {
  name: string;
  clusters: string[];
}

/** An error for a single cluster during a namespace listing. */
export interface ClusterError {
  cluster: string;
  message: string;
}

export interface NamespacesResponse {
  namespaces: NamespaceInfo[];
  errors: ClusterError[];
}

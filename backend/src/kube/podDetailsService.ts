import type { CoreV1Event, V1Pod } from '@kubernetes/client-node';
import {
  appsClientForContext,
  autoscalingClientForContext,
  coreClientForContext,
  customObjectsClientForContext,
  metricsForContext,
} from './kubeconfig.js';
import { safeErrorMessage } from './podsService.js';
import { getWorkloadSummary, type WorkloadSummary } from './workloadSummary.js';

/** A single container's resource picture, mirroring `kubectl describe`. */
export interface ContainerDetail {
  name: string;
  image: string;
  ready: boolean;
  restartCount: number;
  /** Current state keyword: running | waiting | terminated. */
  state: string;
  /** Reason attached to the state, when the cluster provides one. */
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

/** Normalized event, ordered newest first. */
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
  workload?: WorkloadSummary;
  /** Set when events could not be read; the rest of the describe still returns. */
  eventsError?: string;
}

/** Per-container usage. `available: false` means the cluster has no metrics-server. */
export interface PodMetricsResult {
  available: boolean;
  /** Present only when available. */
  containers?: { name: string; cpu: string; memory: string }[];
  window?: string;
  timestamp?: string;
  /** Human-readable explanation when unavailable. */
  reason?: string;
}

/** Native sidecars are init containers that keep running (restartPolicy: Always). */
function sidecarNames(pod: V1Pod): Set<string> {
  return new Set(
    (pod.spec?.initContainers ?? [])
      .filter((c) => c.restartPolicy === 'Always')
      .map((c) => c.name),
  );
}

function normalizeState(state?: {
  running?: { startedAt?: unknown };
  waiting?: { reason?: string; message?: string };
  terminated?: {
    reason?: string;
    message?: string;
    exitCode?: number;
    signal?: number;
    finishedAt?: unknown;
  };
}): ContainerStateDetail | undefined {
  if (!state) return undefined;
  if (state.waiting) {
    return {
      state: 'waiting',
      reason: state.waiting.reason,
      message: state.waiting.message,
    };
  }
  if (state.terminated) {
    return {
      state: 'terminated',
      reason: state.terminated.reason,
      message: state.terminated.message,
      exitCode: state.terminated.exitCode,
      signal: state.terminated.signal,
      finishedAt: state.terminated.finishedAt?.toString(),
    };
  }
  if (state.running) return { state: 'running' };
  return { state: 'unknown' };
}

/** Builds the container list, including native sidecars, with requests/limits. */
export function buildContainers(pod: V1Pod): ContainerDetail[] {
  const sidecars = sidecarNames(pod);
  const statusByName = new Map(
    [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])].map(
      (cs) => [cs.name, cs],
    ),
  );

  const specs = [
    ...(pod.spec?.containers ?? []),
    ...(pod.spec?.initContainers ?? []).filter((c) => sidecars.has(c.name)),
  ];

  return specs.map((spec) => {
    const status = statusByName.get(spec.name);
    const currentState = normalizeState(status?.state) ?? { state: 'unknown' };
    return {
      name: spec.name,
      image: spec.image ?? '',
      ready: status?.ready ?? false,
      restartCount: status?.restartCount ?? 0,
      ...currentState,
      lastState: normalizeState(status?.lastState),
      requests: spec.resources?.requests as Record<string, string> | undefined,
      limits: spec.resources?.limits as Record<string, string> | undefined,
      sidecar: sidecars.has(spec.name),
    };
  });
}

function buildEvents(events: CoreV1Event[]): PodEvent[] {
  return events
    .map((e) => ({
      type: e.type ?? '',
      reason: e.reason ?? '',
      message: e.message ?? '',
      count: e.count ?? 1,
      lastSeen: (e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp)?.toString(),
    }))
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''));
}

function timestampRank(timestamp?: string): number {
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

export function buildTerminationHistory(
  containers: ContainerDetail[],
  events: PodEvent[],
): PodTerminationHistoryEntry[] {
  const history: PodTerminationHistoryEntry[] = [];

  for (const container of containers) {
    if (container.state === 'terminated') {
      history.push({
        source: 'container',
        timestamp: container.finishedAt,
        container: container.name,
        state: container.state,
        reason: container.reason,
        message: container.message,
        exitCode: container.exitCode,
        signal: container.signal,
      });
    }
    if (container.lastState?.state === 'terminated') {
      history.push({
        source: 'container',
        timestamp: container.lastState.finishedAt,
        container: container.name,
        state: container.lastState.state,
        reason: container.lastState.reason,
        message: container.lastState.message,
        exitCode: container.lastState.exitCode,
        signal: container.lastState.signal,
      });
    }
  }

  history.push(
    ...events.map((event) => ({
      source: 'event' as const,
      timestamp: event.lastSeen,
      type: event.type,
      reason: event.reason,
      message: event.message,
      count: event.count,
    })),
  );

  return history
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => timestampRank(b.entry.timestamp) - timestampRank(a.entry.timestamp) || a.index - b.index)
    .map(({ entry }) => entry);
}

/**
 * Reads a pod and its events, producing a describe-equivalent payload.
 * Read-only: uses only `read`/`list` operations.
 */
export async function getPodDescribe(
  cluster: string,
  namespace: string,
  podName: string,
): Promise<PodDescribe> {
  const client = coreClientForContext(cluster);
  const pod = await client.readNamespacedPod({ name: podName, namespace });

  let events: PodEvent[] = [];
  let eventsError: string | undefined;
  try {
    // Events live in the namespace and are filtered to this pod.
    const eventList = await client.listNamespacedEvent({
      namespace,
      fieldSelector: `involvedObject.name=${podName}`,
    });
    events = buildEvents(eventList.items ?? []);
  } catch (err) {
    // Missing permission on events must not hide the rest of the describe.
    eventsError = safeErrorMessage(err);
  }

  const containers = buildContainers(pod);
  const workload = await getWorkloadSummary(pod.metadata?.ownerReferences, namespace, {
    apps: appsClientForContext(cluster),
    customObjects: customObjectsClientForContext(cluster),
    autoscaling: autoscalingClientForContext(cluster),
  });

  return {
    cluster,
    namespace,
    name: pod.metadata?.name ?? podName,
    status: pod.status?.phase ?? 'Unknown',
    node: pod.spec?.nodeName ?? '',
    podIP: pod.status?.podIP,
    serviceAccount: pod.spec?.serviceAccountName,
    qosClass: pod.status?.qosClass,
    createdAt: pod.metadata?.creationTimestamp?.toString(),
    labels: pod.metadata?.labels ?? {},
    annotations: pod.metadata?.annotations ?? {},
    conditions: (pod.status?.conditions ?? []).map((c) => ({
      type: c.type,
      status: c.status,
      reason: c.reason,
      message: c.message,
    })),
    containers,
    events,
    terminationHistory: buildTerminationHistory(containers, events),
    workload,
    eventsError,
  };
}

/**
 * Recognizes "the metrics API simply isn't installed here" from a real failure.
 * Exported so the degradation path can be unit-tested without a cluster that
 * lacks metrics-server.
 */
export function looksLikeMissingMetricsServer(err: unknown): boolean {
  const status = (err as { statusCode?: number; code?: number })?.statusCode
    ?? (err as { code?: number })?.code;
  if (status === 404 || status === 503) return true;
  const message = safeErrorMessage(err).toLowerCase();
  return (
    message.includes('metrics.k8s.io') ||
    message.includes('not found') ||
    message.includes('could not find the requested resource') ||
    message.includes('serviceunavailable')
  );
}

/**
 * Reads CPU/memory for a pod from metrics.k8s.io.
 *
 * Clusters without metrics-server are a normal, expected case: they return
 * `{ available: false }` with a reason instead of an error, so the details panel
 * degrades gracefully rather than breaking.
 */
export async function getPodMetrics(
  cluster: string,
  namespace: string,
  podName: string,
): Promise<PodMetricsResult> {
  try {
    const metrics = metricsForContext(cluster);
    const list = await metrics.getPodMetrics(namespace);
    const found = list.items.find((item) => item.metadata.name === podName);

    if (!found) {
      return {
        available: false,
        reason: 'Metrics are not available for this pod yet.',
      };
    }

    return {
      available: true,
      window: found.window,
      timestamp: found.timestamp,
      containers: found.containers.map((c) => ({
        name: c.name,
        cpu: c.usage.cpu,
        memory: c.usage.memory,
      })),
    };
  } catch (err) {
    if (looksLikeMissingMetricsServer(err)) {
      return {
        available: false,
        reason: 'This cluster does not expose the metrics API (metrics-server missing).',
      };
    }
    return { available: false, reason: safeErrorMessage(err) };
  }
}

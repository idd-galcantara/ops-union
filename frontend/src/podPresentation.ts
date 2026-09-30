import type { GroupingMode, NormalizedPod } from './types';

/**
 * Formats an age in seconds the way `kubectl` does: the two most significant
 * units, e.g. "3h58m", "2d3h", "45s".
 */
export function formatAge(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s';

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return hours > 0 ? `${days}d${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

/** Severity buckets used to colour the status badge. */
export type StatusSeverity = 'ok' | 'warn' | 'error' | 'neutral';

const OK_STATUSES = new Set(['Running', 'Succeeded', 'Completed']);
const WARN_STATUSES = new Set([
  'Pending',
  'ContainerCreating',
  'PodInitializing',
  'Terminating',
  'Init',
  'NotReady',
]);
const ERROR_STATUSES = new Set([
  'CrashLoopBackOff',
  'Error',
  'Failed',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerConfigError',
  'CreateContainerError',
  'InvalidImageName',
  'OOMKilled',
  'Evicted',
  'RunContainerError',
  'ContainerStatusUnknown',
]);

/** Maps a pod status to a severity for styling. */
export function statusSeverity(status: string): StatusSeverity {
  if (OK_STATUSES.has(status)) return 'ok';
  if (ERROR_STATUSES.has(status)) return 'error';
  if (WARN_STATUSES.has(status)) return 'warn';
  // Unknown reasons that look like failures still read as problems.
  if (/error|backoff|fail|invalid|unknown/i.test(status)) return 'error';
  return 'neutral';
}

/** True when a pod has containers that are not ready (e.g. "1/2"). */
export function isDegraded(pod: NormalizedPod): boolean {
  const [ready, desired] = pod.ready.split('/');
  return ready !== desired;
}

/** Case-insensitive match across the fields a user would search by. */
export function matchesFilter(pod: NormalizedPod, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return [
    pod.name,
    pod.cluster,
    pod.namespace,
    pod.status,
    pod.node,
    pod.imageTag,
    pod.application.key,
    pod.application.name,
    ...pod.containers,
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export interface PodGroup {
  /** Group heading, e.g. a namespace or a cluster name. Empty for flat mode. */
  key: string;
  /** Human-readable heading for identity-backed groups. */
  label?: string;
  pods: NormalizedPod[];
}

/**
 * Splits pods into display groups according to the grouping mode. Groups and
 * rows are sorted so the table stays stable between refreshes.
 */
export function groupPods(pods: NormalizedPod[], grouping: GroupingMode): PodGroup[] {
  const sorted = [...pods].sort(
    (a, b) =>
      a.namespace.localeCompare(b.namespace) ||
      a.cluster.localeCompare(b.cluster) ||
      a.name.localeCompare(b.name),
  );

  if (grouping === 'flat') {
    return [{ key: '', pods: sorted }];
  }

  const buckets = new Map<string, NormalizedPod[]>();
  for (const pod of sorted) {
    const key = grouping === 'namespace'
      ? pod.namespace
      : grouping === 'cluster'
        ? pod.cluster
        : pod.application.key;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(pod);
    else buckets.set(key, [pod]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupPods]) => ({
      key,
      ...(grouping === 'application' ? { label: groupPods[0].application.name } : {}),
      pods: groupPods,
    }));
}

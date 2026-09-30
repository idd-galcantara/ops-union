import type { V1Pod } from '@kubernetes/client-node';
import { applicationIdentity } from './applicationIdentity.js';
import type { NormalizedPod, Target } from './types.js';

/**
 * Derives a human-facing status from a pod, mirroring `kubectl get pods`:
 * container waiting/terminated reasons (e.g. CrashLoopBackOff) take precedence
 * over the coarse phase, and a deletionTimestamp surfaces as "Terminating".
 */
function derivePodStatus(pod: V1Pod): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating';

  const statuses = pod.status?.containerStatuses ?? [];
  for (const cs of statuses) {
    const waiting = cs.state?.waiting?.reason;
    if (waiting) return waiting;
    const terminated = cs.state?.terminated?.reason;
    if (terminated) return terminated;
  }

  return pod.status?.phase ?? 'Unknown';
}

/**
 * Native sidecars are init containers with `restartPolicy: Always` (k8s 1.29+,
 * how Istio injects istio-proxy). `kubectl` counts them in READY and RESTARTS,
 * so we do too — otherwise the unified table would disagree with the terminal.
 */
function nativeSidecars(pod: V1Pod) {
  return (pod.spec?.initContainers ?? []).filter((c) => c.restartPolicy === 'Always');
}

/** Statuses of the containers that count towards READY (regular + native sidecars). */
function countedStatuses(pod: V1Pod) {
  const sidecarNames = new Set(nativeSidecars(pod).map((c) => c.name));
  const initStatuses = (pod.status?.initContainerStatuses ?? []).filter((cs) =>
    sidecarNames.has(cs.name),
  );
  return [...initStatuses, ...(pod.status?.containerStatuses ?? [])];
}

/** Counts total restarts across regular containers and native sidecars. */
function countRestarts(pod: V1Pod): number {
  return countedStatuses(pod).reduce((sum, cs) => sum + (cs.restartCount ?? 0), 0);
}

/** Builds the "ready/desired" string, e.g. "2/2", matching `kubectl get pods`. */
function readyString(pod: V1Pod): string {
  const statuses = countedStatuses(pod);
  const specCount = (pod.spec?.containers?.length ?? 0) + nativeSidecars(pod).length;
  const desired = specCount || statuses.length;
  const ready = statuses.filter((cs) => cs.ready).length;
  return `${ready}/${desired}`;
}

/** Age in seconds from creationTimestamp; 0 when unavailable. `now` is injectable for tests. */
function ageSeconds(pod: V1Pod, now: number): number {
  const created = pod.metadata?.creationTimestamp;
  if (!created) return 0;
  const createdMs = new Date(created).getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((now - createdMs) / 1000));
}

/** Returns the release portion of an image tag, dropping an optional build suffix. */
function imageTag(pod: V1Pod): string {
  const image = pod.spec?.containers?.[0]?.image ?? '';
  const tagStart = image.lastIndexOf(':');
  const digestStart = image.lastIndexOf('@');
  if (tagStart <= digestStart) return '';
  return image.slice(tagStart + 1).split('-', 1)[0] ?? '';
}

/**
 * Normalizes a V1Pod into the unified shape, annotated with its origin target.
 * Pure and deterministic (given `now`), so it is trivially unit-testable.
 */
export function normalizePod(pod: V1Pod, target: Target, now: number = Date.now()): NormalizedPod {
  return {
    cluster: target.cluster,
    namespace: target.namespace,
    name: pod.metadata?.name ?? '(unnamed)',
    status: derivePodStatus(pod),
    ready: readyString(pod),
    restarts: countRestarts(pod),
    node: pod.spec?.nodeName ?? '',
    imageTag: imageTag(pod),
    ageSeconds: ageSeconds(pod, now),
    // Native sidecars are loggable containers too, so expose them for log selection.
    containers: [
      ...(pod.spec?.containers ?? []).map((c) => c.name),
      ...nativeSidecars(pod).map((c) => c.name),
    ],
    application: applicationIdentity(pod),
  };
}

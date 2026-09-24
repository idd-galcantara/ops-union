import { safeErrorMessage } from './podsService.js';

export type WorkloadKind = 'Deployment' | 'StatefulSet' | 'Rollout';

export interface WorkloadReplicas {
  desired?: number;
  current?: number;
  available?: number;
  ready?: number;
  updated?: number;
  unavailable?: number;
}

export interface WorkloadMetricValue {
  value?: string;
  averageValue?: string;
  averageUtilization?: number;
}

export interface WorkloadMetric {
  name: string;
  current?: WorkloadMetricValue;
  target?: WorkloadMetricValue;
}

export interface WorkloadHpa {
  name: string;
  target: { kind: string; name: string };
  minReplicas?: number;
  maxReplicas?: number;
  currentReplicas?: number;
  desiredReplicas?: number;
  metrics: WorkloadMetric[];
}

export interface WorkloadError {
  code: string;
  message: string;
}

export interface WorkloadSummary {
  kind?: WorkloadKind;
  name?: string;
  replicas?: WorkloadReplicas;
  hpa?: WorkloadHpa;
  error?: WorkloadError;
  hpaError?: WorkloadError;
}

interface OwnerReferenceLike {
  apiVersion?: string;
  kind?: string;
  name?: string;
  controller?: boolean;
}

interface AppsReader {
  readNamespacedDeployment(params: { name: string; namespace: string }): Promise<unknown>;
  readNamespacedStatefulSet(params: { name: string; namespace: string }): Promise<unknown>;
  readNamespacedReplicaSet(params: { name: string; namespace: string }): Promise<unknown>;
}

interface CustomObjectsReader {
  getNamespacedCustomObject(params: {
    group: string;
    version: string;
    namespace: string;
    plural: string;
    name: string;
  }): Promise<unknown>;
}

interface AutoscalingReader {
  listNamespacedHorizontalPodAutoscaler(params: { namespace: string }): Promise<unknown>;
}

export interface WorkloadClients {
  apps: AppsReader;
  customObjects: CustomObjectsReader;
  autoscaling: AutoscalingReader;
}

const ROLLOUT_REQUEST = {
  group: 'argoproj.io',
  version: 'v1alpha1',
  plural: 'rollouts',
};

function supportedKind(kind?: string): kind is WorkloadKind {
  return kind === 'Deployment' || kind === 'StatefulSet' || kind === 'Rollout';
}

function controllerOwner(owners: unknown): OwnerReferenceLike | undefined {
  if (!Array.isArray(owners)) return undefined;
  const owner = owners.find((candidate): candidate is OwnerReferenceLike => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as OwnerReferenceLike;
    return value.controller !== false && typeof value.kind === 'string' && typeof value.name === 'string';
  });
  return owner;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resourceError(error: unknown, fallback: string): WorkloadError {
  const status = (error as { statusCode?: number; code?: number })?.statusCode
    ?? (error as { code?: number })?.code;
  const code = status === 403 ? 'forbidden' : status === 404 ? 'not-found' : fallback;
  return { code, message: safeErrorMessage(error) };
}

export function normalizeReplicas(resource: unknown): WorkloadReplicas | undefined {
  if (!resource || typeof resource !== 'object') return undefined;
  const value = resource as {
    spec?: { replicas?: unknown };
    status?: {
      replicas?: unknown;
      availableReplicas?: unknown;
      readyReplicas?: unknown;
      updatedReplicas?: unknown;
      unavailableReplicas?: unknown;
    };
  };
  const replicas: WorkloadReplicas = {};
  const fields: [keyof WorkloadReplicas, unknown][] = [
    ['desired', value.spec?.replicas],
    ['current', value.status?.replicas],
    ['available', value.status?.availableReplicas],
    ['ready', value.status?.readyReplicas],
    ['updated', value.status?.updatedReplicas],
    ['unavailable', value.status?.unavailableReplicas],
  ];
  for (const [key, field] of fields) {
    const normalized = numberField(field);
    if (normalized !== undefined) replicas[key] = normalized;
  }
  return Object.values(replicas).some((entry) => entry !== undefined) ? replicas : undefined;
}

function normalizeMetricValue(value: unknown): WorkloadMetricValue | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metric = value as {
    value?: unknown;
    averageValue?: unknown;
    averageUtilization?: unknown;
  };
  const normalized: WorkloadMetricValue = {};
  if (typeof metric.value === 'string') normalized.value = metric.value;
  if (typeof metric.averageValue === 'string') normalized.averageValue = metric.averageValue;
  const averageUtilization = numberField(metric.averageUtilization);
  if (averageUtilization !== undefined) normalized.averageUtilization = averageUtilization;
  return Object.values(normalized).some((entry) => entry !== undefined) ? normalized : undefined;
}

export function normalizeHpaMetrics(hpa: unknown): WorkloadMetric[] {
  if (!hpa || typeof hpa !== 'object') return [];
  const value = hpa as {
    spec?: { metrics?: unknown[] };
    status?: { currentMetrics?: unknown[] };
  };
  const currentByName = new Map<string, WorkloadMetricValue | undefined>();
  for (const metric of value.status?.currentMetrics ?? []) {
    if (!metric || typeof metric !== 'object') continue;
    const resource = (metric as { type?: unknown; resource?: { name?: unknown; current?: unknown } }).resource;
    if ((metric as { type?: unknown }).type !== 'Resource' || typeof resource?.name !== 'string') continue;
    currentByName.set(resource.name, normalizeMetricValue(resource.current));
  }

  return (value.spec?.metrics ?? []).flatMap((metric) => {
    if (!metric || typeof metric !== 'object') return [];
    const typed = metric as {
      type?: unknown;
      resource?: { name?: unknown; target?: unknown };
    };
    if (typed.type !== 'Resource' || typeof typed.resource?.name !== 'string') return [];
    return [{
      name: typed.resource.name,
      current: currentByName.get(typed.resource.name),
      target: normalizeMetricValue(typed.resource.target),
    }];
  });
}

export function normalizeHpa(hpa: unknown): WorkloadHpa | undefined {
  if (!hpa || typeof hpa !== 'object') return undefined;
  const value = hpa as {
    metadata?: { name?: unknown };
    spec?: {
      scaleTargetRef?: { kind?: unknown; name?: unknown };
      minReplicas?: unknown;
      maxReplicas?: unknown;
    };
    status?: { currentReplicas?: unknown; desiredReplicas?: unknown };
  };
  if (typeof value.metadata?.name !== 'string') return undefined;
  const target = value.spec?.scaleTargetRef;
  if (typeof target?.kind !== 'string' || typeof target.name !== 'string') return undefined;
  const normalized: WorkloadHpa = {
    name: value.metadata.name,
    target: { kind: target.kind, name: target.name },
    metrics: normalizeHpaMetrics(value),
  };
  const fields: [keyof WorkloadHpa, unknown][] = [
    ['minReplicas', value.spec?.minReplicas],
    ['maxReplicas', value.spec?.maxReplicas],
    ['currentReplicas', value.status?.currentReplicas],
    ['desiredReplicas', value.status?.desiredReplicas],
  ];
  for (const [key, field] of fields) {
    const number = numberField(field);
    if (number !== undefined) Object.assign(normalized, { [key]: number });
  }
  return normalized;
}

export function matchingHpa(hpas: unknown[], kind: WorkloadKind, name: string): WorkloadHpa | undefined {
  for (const hpa of hpas) {
    const normalized = normalizeHpa(hpa);
    if (normalized?.target.kind === kind && normalized.target.name === name) return normalized;
  }
  return undefined;
}

export async function resolveWorkloadOwner(
  owners: unknown,
  namespace: string,
  apps: Pick<AppsReader, 'readNamespacedReplicaSet'>,
): Promise<{ kind?: WorkloadKind; name?: string; error?: WorkloadError }> {
  const owner = controllerOwner(owners);
  if (!owner) return { error: { code: 'no-supported-owner', message: 'No supported workload owner was found.' } };
  if (supportedKind(owner.kind)) return { kind: owner.kind, name: owner.name };
  if (owner.kind !== 'ReplicaSet') {
    return { error: { code: 'unsupported-owner', message: `Unsupported pod owner kind: ${owner.kind}.` } };
  }

  try {
    const replicaSet = await apps.readNamespacedReplicaSet({ name: owner.name!, namespace });
    const parent = controllerOwner((replicaSet as { metadata?: { ownerReferences?: unknown } })?.metadata?.ownerReferences);
    if (parent && supportedKind(parent.kind) && (parent.kind === 'Deployment' || parent.kind === 'Rollout')) {
      return { kind: parent.kind, name: parent.name };
    }
    return { error: { code: 'unsupported-owner-chain', message: 'ReplicaSet has no supported workload controller.' } };
  } catch (error) {
    return { error: resourceError(error, 'replicaset-read-failed') };
  }
}

async function readWorkload(
  identity: { kind: WorkloadKind; name: string },
  namespace: string,
  clients: WorkloadClients,
): Promise<unknown> {
  if (identity.kind === 'Deployment') {
    return clients.apps.readNamespacedDeployment({ name: identity.name, namespace });
  }
  if (identity.kind === 'StatefulSet') {
    return clients.apps.readNamespacedStatefulSet({ name: identity.name, namespace });
  }
  return clients.customObjects.getNamespacedCustomObject({ ...ROLLOUT_REQUEST, namespace, name: identity.name });
}

export async function getWorkloadSummary(
  owners: unknown,
  namespace: string,
  clients: WorkloadClients,
): Promise<WorkloadSummary> {
  const resolved = await resolveWorkloadOwner(owners, namespace, clients.apps);
  const summary: WorkloadSummary = { ...resolved };
  if (!resolved.kind || !resolved.name) return summary;

  const [resourceResult, hpaResult] = await Promise.allSettled([
    readWorkload({ kind: resolved.kind, name: resolved.name }, namespace, clients),
    clients.autoscaling.listNamespacedHorizontalPodAutoscaler({ namespace }),
  ]);

  if (resourceResult.status === 'fulfilled') {
    summary.replicas = normalizeReplicas(resourceResult.value);
  } else {
    summary.error = resourceError(resourceResult.reason, 'workload-read-failed');
  }

  if (hpaResult.status === 'fulfilled') {
    const items = (hpaResult.value as { items?: unknown[] })?.items ?? [];
    summary.hpa = matchingHpa(items, resolved.kind, resolved.name);
  } else {
    summary.hpaError = resourceError(hpaResult.reason, 'hpa-read-failed');
  }

  return summary;
}
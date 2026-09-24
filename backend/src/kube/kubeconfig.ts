import {
  AppsV1Api,
  AutoscalingV2Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
  Log,
  Metrics,
} from '@kubernetes/client-node';
import { buildFullCaChain } from './caChain.js';
import {
  loadKubeConfig,
  resolveKubeConfigLocation,
  type KubeConfigSource,
} from './kubeconfigDiscovery.js';

/**
 * Loads the user's kubeconfig once and exposes read-only helpers over it.
 *
 * Security: this module only ever surfaces context/cluster/namespace *names*.
 * Tokens, client certificates and other credentials from the kubeconfig are
 * never returned, logged or persisted — ops-union is a local, read-only tool.
 */

export interface ContextInfo {
  /** Context name, e.g. "cluster-a". This is what the UI selects. */
  name: string;
  /** Cluster name the context points to. */
  cluster: string;
  /** Default namespace declared in the context, if any. */
  namespace?: string;
}

let kubeConfig: KubeConfig | null = null;
let selectedKubeConfigPath = process.env.OPS_FLOW_SELECTED_KUBECONFIG?.trim() || null;
let kubeConfigSource: KubeConfigSource | null = null;

/** Lazily loads (and caches) the active kubeconfig. */
function getKubeConfig(): KubeConfig {
  if (!kubeConfig) {
    const location = resolveKubeConfigLocation({
      selectedPath: selectedKubeConfigPath,
      ignoreEnvironment: Boolean(selectedKubeConfigPath),
    });
    kubeConfig = loadKubeConfig({
      selectedPath: selectedKubeConfigPath,
      ignoreEnvironment: Boolean(selectedKubeConfigPath),
    });
    kubeConfigSource = location.source;
  }
  return kubeConfig;
}

export interface KubeConfigStatus {
  available: boolean;
  source: KubeConfigSource;
  contextCount?: number;
}

/** Returns safe metadata about the active kubeconfig without exposing its path. */
export function getKubeConfigStatus(): KubeConfigStatus {
  const source = kubeConfigSource ?? resolveKubeConfigLocation({
    selectedPath: selectedKubeConfigPath,
    ignoreEnvironment: Boolean(selectedKubeConfigPath),
  }).source;

  try {
    const kc = getKubeConfig();
    return {
      available: true,
      source: kubeConfigSource ?? source,
      contextCount: kc.getContexts().length,
    };
  } catch {
    return { available: false, source };
  }
}

/**
 * Returns the list of contexts available in the kubeconfig, names only.
 * Throws a sanitized error if the kubeconfig cannot be read.
 */
export function listContexts(): ContextInfo[] {
  let kc: KubeConfig;
  try {
    kc = getKubeConfig();
  } catch {
    // Never surface the underlying path/credentials in the error.
    throw new Error('Could not read the kubeconfig.');
  }

  return kc.getContexts().map((ctx) => ({
    name: ctx.name,
    cluster: ctx.cluster,
    namespace: ctx.namespace,
  }));
}

/** Per-context caches so we don't rebuild clients on every request. */
const scopedConfigCache = new Map<string, KubeConfig>();
const clientCache = new Map<string, CoreV1Api>();
const appsCache = new Map<string, AppsV1Api>();
const customObjectsCache = new Map<string, CustomObjectsApi>();
const autoscalingCache = new Map<string, AutoscalingV2Api>();
const metricsCache = new Map<string, Metrics>();
const logCache = new Map<string, Log>();

/**
 * Builds (and caches) a KubeConfig scoped to a single context, with a complete
 * CA chain applied.
 *
 * Scoping a *copy* matters: concurrent fan-out across different contexts must
 * never mutate a shared "current context".
 */
export function scopedConfigForContext(context: string): KubeConfig {
  const cached = scopedConfigCache.get(context);
  if (cached) return cached;

  const kc = getKubeConfig();
  const known = kc.getContexts().some((ctx) => ctx.name === context);
  if (!known) {
    throw new Error(`Unknown context: ${context}`);
  }

  const scoped = new KubeConfig();
  scoped.loadFromOptions({
    clusters: kc.clusters.map((cluster) => ({ ...cluster })),
    users: kc.users.map((user) => ({ ...user })),
    contexts: kc.contexts.map((ctx) => ({ ...ctx })),
    currentContext: context,
  });
  scoped.setCurrentContext(context);
  completeCaChain(scoped, context);
  scopedConfigCache.set(context, scoped);
  return scoped;
}

/**
 * Builds (and caches) a CoreV1Api scoped to a given context.
 * Only read operations are ever called against this client elsewhere in the app.
 */
export function coreClientForContext(context: string): CoreV1Api {
  const cached = clientCache.get(context);
  if (cached) return cached;

  const client = scopedConfigForContext(context).makeApiClient(CoreV1Api);
  clientCache.set(context, client);
  return client;
}

/** Builds (and caches) an AppsV1Api reader scoped to a context. */
export function appsClientForContext(context: string): AppsV1Api {
  const cached = appsCache.get(context);
  if (cached) return cached;

  const client = scopedConfigForContext(context).makeApiClient(AppsV1Api);
  appsCache.set(context, client);
  return client;
}

/** Builds (and caches) a CustomObjectsApi reader scoped to a context. */
export function customObjectsClientForContext(context: string): CustomObjectsApi {
  const cached = customObjectsCache.get(context);
  if (cached) return cached;

  const client = scopedConfigForContext(context).makeApiClient(CustomObjectsApi);
  customObjectsCache.set(context, client);
  return client;
}

/** Builds (and caches) an AutoscalingV2Api reader scoped to a context. */
export function autoscalingClientForContext(context: string): AutoscalingV2Api {
  const cached = autoscalingCache.get(context);
  if (cached) return cached;

  const client = scopedConfigForContext(context).makeApiClient(AutoscalingV2Api);
  autoscalingCache.set(context, client);
  return client;
}

/** Builds (and caches) a metrics.k8s.io reader for a context. */
export function metricsForContext(context: string): Metrics {
  const cached = metricsCache.get(context);
  if (cached) return cached;

  const metrics = new Metrics(scopedConfigForContext(context));
  metricsCache.set(context, metrics);
  return metrics;
}

/** Builds (and caches) a pod log reader for a context. */
export function logForContext(context: string): Log {
  const cached = logCache.get(context);
  if (cached) return cached;

  const log = new Log(scopedConfigForContext(context));
  logCache.set(context, log);
  return log;
}

/**
 * Ensures the scoped config carries a *complete* CA chain for its current cluster.
 *
 * The kubeconfig here only embeds the intermediate CA, while its issuers live in
 * the OS trust store. `@kubernetes/client-node` builds its HTTPS agent solely
 * from `caData`, so without this the TLS handshake fails with
 * UNABLE_TO_GET_ISSUER_CERT. TLS verification remains fully enabled.
 */
export function completeCaChain(scoped: KubeConfig, context: string): void {
  const cluster = scoped.getCurrentCluster();
  if (!cluster?.caData) return;

  const kubeconfigCa = Buffer.from(cluster.caData as string, 'base64').toString('utf8');
  const fullChain = buildFullCaChain(kubeconfigCa);
  if (fullChain === kubeconfigCa) return;

  const patchedClusters = scoped.clusters.map((c) =>
    c.name === cluster.name
      ? { ...c, caData: Buffer.from(fullChain, 'utf8').toString('base64'), caFile: undefined }
      : c,
  );

  scoped.loadFromOptions({
    clusters: patchedClusters,
    users: scoped.users,
    contexts: scoped.contexts,
    currentContext: context,
  });
}

/**
 * Loads a new configuration before replacing the active one. A failed load
 * leaves the previous configuration and all of its clients untouched.
 */
export function reloadKubeConfig(selectedPath?: string | null): void {
  const nextSelectedPath = selectedPath === undefined
    ? selectedKubeConfigPath
    : selectedPath?.trim() || null;
  const nextSource = resolveKubeConfigLocation({
    selectedPath: nextSelectedPath,
    ignoreEnvironment: selectedPath !== undefined && Boolean(nextSelectedPath),
  }).source;
  const nextConfig = loadKubeConfig({
    selectedPath: nextSelectedPath,
    ignoreEnvironment: selectedPath !== undefined && Boolean(nextSelectedPath),
  });

  selectedKubeConfigPath = nextSelectedPath;
  kubeConfig = nextConfig;
  kubeConfigSource = nextSource;
  scopedConfigCache.clear();
  clientCache.clear();
  appsCache.clear();
  customObjectsCache.clear();
  autoscalingCache.clear();
  metricsCache.clear();
  logCache.clear();
}

/** Test/utility hook to reset cached state. */
export function resetKubeConfigCache(): void {
  kubeConfig = null;
  selectedKubeConfigPath = process.env.OPS_FLOW_SELECTED_KUBECONFIG?.trim() || null;
  kubeConfigSource = null;
  scopedConfigCache.clear();
  clientCache.clear();
  appsCache.clear();
  customObjectsCache.clear();
  autoscalingCache.clear();
  metricsCache.clear();
  logCache.clear();
}

import { coreClientForContext } from './kubeconfig.js';
import { safeErrorMessage } from './podsService.js';
import { mapWithConcurrency } from './boundedScheduler.js';
import { boundedIdentifier, MAX_ACTIVE_KUBERNETES_READS, MAX_CONTEXTS_PER_REQUEST } from '../resourceLimits.js';

/** A namespace and the clusters where it exists. */
export interface NamespaceInfo {
  name: string;
  /** Clusters (from the requested set) that contain this namespace. */
  clusters: string[];
}

/** An error for a single cluster that failed during fan-out. */
export interface ClusterError {
  cluster: string;
  message: string;
}

export interface NamespacesFanOutResult {
  namespaces: NamespaceInfo[];
  errors: ClusterError[];
}

/** Lists namespace names for one cluster. Injectable for tests. */
export type NamespaceLister = (cluster: string) => Promise<string[]>;

/** Default lister: read-only listNamespace against the cluster's context. */
const defaultNamespaceLister: NamespaceLister = async (cluster) => {
  const client = coreClientForContext(cluster);
  const list = await client.listNamespace();
  return (list.items ?? [])
    .map((ns) => ns.metadata?.name)
    .filter((name): name is string => Boolean(name));
};

/**
 * Fans out a namespace listing across clusters in parallel and merges the result.
 *
 * Namespaces are keyed by name and annotated with every cluster that has them, so
 * the UI can highlight the ones shared across the whole selection — exactly the
 * case ops-union exists for. A failing cluster is isolated into `errors[]`.
 */
export async function getNamespaces(
  clusters: string[],
  lister: NamespaceLister = defaultNamespaceLister,
): Promise<NamespacesFanOutResult> {
  const unique = [...new Set(clusters.map((c) => c.trim()).filter(Boolean))];

  const settled = await mapWithConcurrency(unique, MAX_ACTIVE_KUBERNETES_READS, async (cluster) => ({ cluster, names: await lister(cluster) }));

  const byName = new Map<string, Set<string>>();
  const errors: ClusterError[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { cluster, names } = result.value;
      for (const name of names) {
        const bucket = byName.get(name);
        if (bucket) bucket.add(cluster);
        else byName.set(name, new Set([cluster]));
      }
    } else {
      errors.push({ cluster: unique[index], message: safeErrorMessage(result.reason) });
    }
  });

  const namespaces: NamespaceInfo[] = [...byName.entries()]
    .map(([name, clusterSet]) => ({ name, clusters: [...clusterSet].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { namespaces, errors };
}

/** Validates the request body into a clean list of cluster names. */
export function parseClusters(body: unknown): { clusters: string[] } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid body: expected an object with "clusters".' };
  }
  const raw = (body as { clusters?: unknown }).clusters;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '"clusters" must be a non-empty list of context names.' };
  }
  if (raw.length > MAX_CONTEXTS_PER_REQUEST) return { error: `A request may contain at most ${MAX_CONTEXTS_PER_REQUEST} contexts.` };

  const clusters: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return { error: 'Each cluster must be a non-empty string.' };
    const error = boundedIdentifier(item, 'cluster');
    if (error) return { error };
    clusters.push(item.trim());
  }

  const unique = [...new Set(clusters)];
  return { clusters: unique };
}

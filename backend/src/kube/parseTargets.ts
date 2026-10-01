import type { Target } from './types.js';
import { boundedIdentifier, MAX_AGGREGATE_TARGETS } from '../resourceLimits.js';

/**
 * Validates and narrows an unknown request body into a clean Target[].
 * Kept standalone so both the route handler and unit tests can use it.
 */
export function parseTargets(body: unknown): { targets: Target[] } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Invalid body: expected an object with "targets".' };
  }
  const raw = (body as { targets?: unknown }).targets;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: '"targets" must be a non-empty list of { cluster, namespace }.' };
  }
  if (raw.length > MAX_AGGREGATE_TARGETS) return { error: `A request may contain at most ${MAX_AGGREGATE_TARGETS} targets.` };

  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { error: 'Each target must be an object { cluster, namespace }.' };
    }
    const { cluster, namespace } = item as { cluster?: unknown; namespace?: unknown };
    if (typeof cluster !== 'string') return { error: 'Each target needs a "cluster" (non-empty string).' };
    if (typeof namespace !== 'string') return { error: 'Each target needs a "namespace" (non-empty string).' };
    const clusterError = boundedIdentifier(cluster, 'cluster');
    const namespaceError = boundedIdentifier(namespace, 'namespace');
    if (clusterError) return { error: clusterError };
    if (namespaceError) return { error: namespaceError };
    const target = { cluster: cluster.trim(), namespace: namespace.trim() };
    const key = `${target.cluster}\u0000${target.namespace}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push(target);
    }
  }

  return { targets };
}

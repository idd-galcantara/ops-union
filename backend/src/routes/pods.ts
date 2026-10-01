import { Router, type Request, type Response } from 'express';
import { errorStatusCode, getPods, safeErrorMessage } from '../kube/podsService.js';
import { getPodDescribe, getPodMetrics } from '../kube/podDetailsService.js';
import { parseTargets } from '../kube/parseTargets.js';
import { boundedIdentifier } from '../resourceLimits.js';

/**
 * POST /api/pods
 * Body: { targets: [{ cluster, namespace }, ...] }
 * Returns { pods, errors } — pods from all targets (annotated with origin),
 * plus per-target errors. Read-only.
 */
export const podsRouter = Router();

podsRouter.post('/', async (req: Request, res: Response) => {
  const parsed = parseTargets(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const result = await getPods(parsed.targets);
    res.json(result);
  } catch (err) {
    // getPods isolates per-target failures, so reaching here is unexpected.
    res.status(500).json({ error: safeErrorMessage(err) });
  }
});

/** Validates the shared :cluster/:namespace/:pod path params. */
type PodParamValue = string | string[] | undefined;

function parsePodParams(
  params: Record<string, PodParamValue>,
): { cluster: string; namespace: string; pod: string } | { error: string } {
  const readParam = (value: PodParamValue): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined;
  const cluster = readParam(params.cluster);
  const namespace = readParam(params.namespace);
  const pod = readParam(params.pod);
  if (!cluster || !namespace || !pod) {
    return { error: 'Provide cluster, namespace and pod.' };
  }
  const clusterError = boundedIdentifier(cluster, 'cluster');
  const namespaceError = boundedIdentifier(namespace, 'namespace');
  const podError = boundedIdentifier(pod, 'pod');
  if (clusterError) return { error: clusterError };
  if (namespaceError) return { error: namespaceError };
  if (podError) return { error: podError };
  return { cluster, namespace, pod };
}

podsRouter.get('/:cluster/:namespace/:pod/describe', async (req: Request, res: Response) => {
  const parsed = parsePodParams(req.params);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const describe = await getPodDescribe(parsed.cluster, parsed.namespace, parsed.pod);
    res.json(describe);
  } catch (err) {
    // Preserve 404 (pod gone) and 403 (no permission); anything else is upstream.
    const status = errorStatusCode(err);
    const httpStatus = status === 404 || status === 403 ? status : 502;
    res.status(httpStatus).json({ error: safeErrorMessage(err) });
  }
});

podsRouter.get('/:cluster/:namespace/:pod/metrics', async (req: Request, res: Response) => {
  const parsed = parsePodParams(req.params);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  // getPodMetrics never throws for a missing metrics-server; it reports
  // { available: false } so the UI can degrade gracefully.
  const metrics = await getPodMetrics(parsed.cluster, parsed.namespace, parsed.pod);
  res.json(metrics);
});

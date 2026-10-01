import type { V1Pod } from '@kubernetes/client-node';
import { coreClientForContext } from './kubeconfig.js';
import { normalizePod } from './normalizePod.js';
import type { NormalizedPod, PodsFanOutResult, Target, TargetError } from './types.js';
import { mapWithConcurrency } from './boundedScheduler.js';
import { MAX_ACTIVE_KUBERNETES_READS } from '../resourceLimits.js';

/**
 * Fetches raw pods for a single target. Injectable so the fan-out can be tested
 * without a live cluster.
 */
export type PodLister = (target: Target) => Promise<V1Pod[]>;

/** Default lister: read-only listNamespacedPod against the target's context. */
const defaultPodLister: PodLister = async (target) => {
  const client = coreClientForContext(target.cluster);
  const list = await client.listNamespacedPod({ namespace: target.namespace });
  return list.items ?? [];
};

/** Pulls the `message` field out of a Kubernetes Status payload, if present. */
function kubernetesStatusMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string') {
    return (body as { message: string }).message;
  }
  if (typeof body === 'string' && body.includes('"message"')) {
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string') return parsed.message;
    } catch {
      // Not JSON after all; fall through.
    }
  }
  return undefined;
}

/**
 * Turns any thrown value into a short, safe message.
 *
 * The Kubernetes client raises `ApiException`, whose `message` concatenates the
 * status code, the raw response body and every response header. Surfacing that
 * verbatim would be unreadable and could echo sensitive headers, so we extract
 * just the Kubernetes `Status.message` when available.
 */
export function safeErrorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object') {
    const anyReason = reason as { code?: unknown; body?: unknown; message?: unknown };

    const statusMessage = kubernetesStatusMessage(anyReason.body);
    if (statusMessage && isSafeOperationalText(statusMessage)) return statusMessage.slice(0, 160);

    // Node system errors (ECONNREFUSED, UNABLE_TO_GET_ISSUER_CERT, ...) use string codes.
    if (typeof anyReason.code === 'string' && anyReason.code) {
      return `Connection failure (${anyReason.code}).`;
    }

    if (typeof anyReason.message === 'string' && anyReason.message) {
      // Never leak the ApiException dump: its message embeds the raw body and
      // every response header. Keep the status and the short reason line only.
      const lines = anyReason.message.split('\n');
      const codeLine = /^HTTP-Code:\s*(\d+)/.exec(lines[0]);
      if (codeLine) {
        const status = codeLine[1];
        const reason = lines
          .find((line) => line.startsWith('Message:'))
          ?.replace(/^Message:\s*/, '')
          .trim();
        const useful = reason && reason !== 'Unknown API Status Code!' && isSafeOperationalText(reason) ? ` ${reason.slice(0, 120)}` : '';
        return `The cluster API responded ${status}.${useful}`;
      }
      if (isSafeOperationalText(anyReason.message)) return anyReason.message.slice(0, 160);
    }
  }
  return 'Failed to query the target.';
}

function isSafeOperationalText(value: string): boolean {
  return !/(?:^|[A-Za-z]:)[\\/]|(?:https?|wss?):|(?:authorization|cookie|token|secret|certificate|kubeconfig|headers?)\b/i.test(value)
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/** HTTP status carried by a Kubernetes client error, when there is one. */
export function errorStatusCode(reason: unknown): number | undefined {
  const code = (reason as { code?: unknown })?.code;
  return typeof code === 'number' ? code : undefined;
}

/**
 * Fans out a pods query across all targets in parallel. A failing target is
 * isolated into `errors[]` and never aborts the aggregation of the others.
 */
export async function getPods(
  targets: Target[],
  lister: PodLister = defaultPodLister,
  now: number = Date.now(),
): Promise<PodsFanOutResult> {
  const settled = await mapWithConcurrency(targets, MAX_ACTIVE_KUBERNETES_READS, async (target) => {
      const items = await lister(target);
      return items.map((pod) => normalizePod(pod, target, now));
    });

  const pods: NormalizedPod[] = [];
  const errors: TargetError[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      pods.push(...result.value);
    } else {
      errors.push({ target: targets[index], message: safeErrorMessage(result.reason) });
    }
  });

  return { pods, errors };
}

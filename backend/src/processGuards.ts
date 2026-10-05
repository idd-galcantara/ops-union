import { safeErrorMessage } from './kube/podsService.js';

/**
 * Sanitizes a thrown value into a short, safe one-line message that never
 * embeds secrets. Reuses the same sanitizer the request paths use so a
 * leaked ApiException dump (raw body + response headers) cannot reach the log.
 */
export function sanitizeFatal(reason: unknown): string {
  return safeErrorMessage(reason);
}

/**
 * Extracts a sanitized stack when one is available. The stack is produced by
 * our own runtime, not by the cluster response, so it is safe to log — but we
 * still strip any obviously sensitive line defensively.
 */
export function sanitizeStack(reason: unknown): string | undefined {
  if (!reason || typeof reason !== 'object') return undefined;
  const stack = (reason as { stack?: unknown }).stack;
  if (typeof stack !== 'string' || !stack) return undefined;
  return stack
    .split('\n')
    .filter((line) => !/(?:authorization|cookie|token|secret|certificate|kubeconfig)\b/i.test(line))
    .join('\n');
}

export interface ProcessGuardDeps {
  /** Sink for the sanitized report; defaults to console.error. */
  log?: (message: string) => void;
  /**
   * Called only for *startup/bind-fatal* paths that must still exit non-zero.
   * In-flight runtime errors never call this — the whole point of the guard is
   * to keep the backend alive so describe/metrics requests stop cascading 502s.
   */
  exit?: (code: number) => void;
}

/**
 * Handles an uncaughtException / unhandledRejection by logging a sanitized
 * report and NOT exiting. A single follow-stream blowing up must not take the
 * process down; the live log socket already contains per-source errors, and
 * killing the process is exactly what broke describe/metrics over the proxy.
 */
export function handleProcessError(
  kind: 'uncaughtException' | 'unhandledRejection',
  reason: unknown,
  deps: ProcessGuardDeps = {},
): void {
  const log = deps.log ?? ((message: string) => console.error(message));
  const message = sanitizeFatal(reason);
  const stack = sanitizeStack(reason);
  log(`[${kind}] ${message}`);
  if (stack) log(stack);
}

/**
 * Registers the process-level safety net. Returns a disposer (used by tests)
 * that removes the listeners it added.
 */
export function registerProcessGuards(deps: ProcessGuardDeps = {}): () => void {
  const onUncaught = (error: unknown) => handleProcessError('uncaughtException', error, deps);
  const onUnhandled = (reason: unknown) => handleProcessError('unhandledRejection', reason, deps);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);
  return () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onUnhandled);
  };
}

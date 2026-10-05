/**
 * Pure reconnection policy for the Live aggregate-log socket (LLR-5).
 *
 * Produces a bounded exponential backoff schedule and classifies whether a
 * socket close was user-initiated (intentional) or an unexpected drop that
 * warrants an automatic reconnect. Kept DOM-free so it can be unit tested with
 * node:test, mirroring logsLiveSession.ts.
 */

export interface ReconnectPolicyConfig {
  /** Delay before the first reconnect attempt. */
  baseMs?: number;
  /** Multiplier applied to the delay after each attempt. */
  factor?: number;
  /** Upper bound for any single delay. */
  maxDelayMs?: number;
  /** Number of reconnect attempts before the policy is exhausted. */
  maxAttempts?: number;
}

export interface ReconnectPolicy {
  /**
   * Returns the delay (ms) to wait before the next reconnect attempt and
   * advances the internal attempt counter, or null once attempts are exhausted.
   */
  nextDelay(): number | null;
  /** Clears the attempt counter so the schedule starts over. */
  reset(): void;
  /** Number of reconnect attempts consumed so far. */
  readonly attempts: number;
}

export const DEFAULT_RECONNECT_CONFIG: Required<ReconnectPolicyConfig> = {
  baseMs: 500,
  factor: 2,
  maxDelayMs: 10_000,
  maxAttempts: 6,
};

export function createReconnectPolicy(config: ReconnectPolicyConfig = {}): ReconnectPolicy {
  const { baseMs, factor, maxDelayMs, maxAttempts } = { ...DEFAULT_RECONNECT_CONFIG, ...config };
  let attempts = 0;
  return {
    nextDelay(): number | null {
      if (attempts >= maxAttempts) return null;
      const delay = Math.min(baseMs * Math.pow(factor, attempts), maxDelayMs);
      attempts += 1;
      return delay;
    },
    reset(): void {
      attempts = 0;
    },
    get attempts(): number {
      return attempts;
    },
  };
}

/**
 * Decides whether an aggregate-WS close should trigger an automatic reconnect.
 * A reconnect happens only for an unexpected drop: the close was not
 * user-initiated and the session has not already reached a terminal state.
 */
export function shouldReconnect(input: { intentionalClose: boolean; terminal: boolean }): boolean {
  return !input.intentionalClose && !input.terminal;
}

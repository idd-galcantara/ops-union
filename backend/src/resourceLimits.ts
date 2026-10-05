export const MAX_CONTEXTS_PER_REQUEST = 32;
export const MAX_AGGREGATE_TARGETS = 256;
export const MAX_KUBERNETES_IDENTIFIER_LENGTH = 128;
export const MAX_ACTIVE_KUBERNETES_READS = 8;
/** Bounds how many live aggregate source reads open concurrently (mirrors MAX_ACTIVE_KUBERNETES_READS). */
export const MAX_ACTIVE_LIVE_SOURCE_READS = 8;
export const MAX_WEBSOCKET_PAYLOAD_BYTES = 512 * 1024;

export function boundedIdentifier(value: string, field: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return `${field} must be a non-empty string.`;
  if (trimmed.length > MAX_KUBERNETES_IDENTIFIER_LENGTH) return `${field} must be ${MAX_KUBERNETES_IDENTIFIER_LENGTH} characters or fewer.`;
  return undefined;
}
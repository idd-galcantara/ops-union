import type { ApplicationIdentity } from './kube/types.js';
import type { EffectiveLogSubscription, HistoryQueryFilters, LogLimits, LogRange, LogSource, SubscribeMessage } from './logsTypes.js';

export const DEFAULT_LOG_LIMITS: LogLimits = {
  maxLinesPerSource: 2_000,
  maxBytesPerSource: 2 * 1024 * 1024,
  maxLinesTotal: 10_000,
  maxBytesTotal: 10 * 1024 * 1024,
};

export const MAX_LOG_LIMITS: LogLimits = {
  maxLinesPerSource: 10_000,
  maxBytesPerSource: 10 * 1024 * 1024,
  maxLinesTotal: 50_000,
  maxBytesTotal: 50 * 1024 * 1024,
};

export const MAX_LOG_SOURCES = 50;
/** Per-connection cap on live follow streams; aligned with MAX_LOG_SOURCES. */
export const MAX_LIVE_STREAMS_PER_CONNECTION = MAX_LOG_SOURCES;
/** In-flight decoded-byte backpressure caps for the live aggregate path (mirror DEFAULT_HISTORY_LIMITS). */
export const MAX_LIVE_INFLIGHT_BYTES_PER_SOURCE = 4 * 1024 * 1024;
export const MAX_LIVE_INFLIGHT_BYTES_PER_SESSION = 32 * 1024 * 1024;
export const MAX_HISTORY_REQUEST_ID_LENGTH = 128;
export const MAX_HISTORY_CURSOR_SOURCE_KEY_LENGTH = 256;
export const MAX_HISTORY_GENERATION = 2_147_483_647;

export type SubscriptionValidation = { subscription: EffectiveLogSubscription } | { error: string };
export interface HistoryStartRequest extends LogRange {
  type: 'history.start';
  requestId: string;
  generation: number;
  sources: LogSource[];
}

export interface HistoryWindowRequest {
  type: 'history.window';
  sessionId: string;
  generation: number;
  cursor?: { sourceKey: string; line: number };
  direction?: 'forward' | 'backward';
  limit?: number;
}

export interface HistoryQueryStartRequest {
  type: 'history.query.start';
  sessionId: string;
  generation: number;
  filters: HistoryQueryFilters;
}

export interface HistoryQueryWindowRequest {
  type: 'history.query.window';
  sessionId: string;
  generation: number;
  queryId: string;
  offset: number;
  direction?: 'forward' | 'backward';
  limit?: number;
}

export interface HistoryCancelRequest {
  type: 'history.cancel';
  sessionId: string;
  generation: number;
  reason?: string;
}

export type HistoryStartValidation = { request: HistoryStartRequest } | { error: string };
export type HistoryWindowValidation = { request: Required<Pick<HistoryWindowRequest, 'type' | 'sessionId' | 'generation' | 'direction' | 'limit'>> & Pick<HistoryWindowRequest, 'cursor'> } | { error: string };
export type HistoryQueryStartValidation = { request: HistoryQueryStartRequest } | { error: string };
export type HistoryQueryWindowValidation = { request: Required<Pick<HistoryQueryWindowRequest, 'type' | 'sessionId' | 'generation' | 'queryId' | 'offset' | 'direction' | 'limit'>> } | { error: string };
export type HistoryCancelValidation = { request: HistoryCancelRequest } | { error: string };

function requiredText(value: unknown, field: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return `${field} must be a non-empty string.`;
  return undefined;
}

function normalizeLimit(value: unknown, field: keyof LogLimits): number | string {
  if (value === undefined) return DEFAULT_LOG_LIMITS[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    return `${field} must be a finite positive integer.`;
  }
  return Math.min(value, MAX_LOG_LIMITS[field]);
}

function normalizeDate(value: unknown, field: 'from' | 'to'): string | undefined | string {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return `${field} must be an ISO timestamp.`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${field} must be an ISO timestamp.`;
  return date.toISOString();
}

function sourceKey(source: LogSource): string {
  return [source.cluster, source.namespace, source.pod, source.container].join('\u0000');
}

function normalizeApplication(value: unknown): ApplicationIdentity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const application = value as Partial<ApplicationIdentity>;
  if (typeof application.key !== 'string' || typeof application.name !== 'string' || application.key.length > 256 || application.name.length > 256) return undefined;
  if (application.source !== 'label' && application.source !== 'ownerReference' && application.source !== 'pod') return undefined;
  return {
    key: application.key,
    name: application.name,
    source: application.source,
    ...(application.labelKey ? { labelKey: application.labelKey } : {}),
    ...(typeof application.ownerKind === 'string' ? { ownerKind: application.ownerKind.slice(0, 256) } : {}),
    ...(typeof application.ownerName === 'string' ? { ownerName: application.ownerName.slice(0, 256) } : {}),
  };
}

export function logSourceIdentityKey(source: Pick<LogSource, 'cluster' | 'namespace' | 'pod' | 'container'>): string {
  return [source.cluster, source.namespace, source.pod, source.container].join('\u0000');
}

function normalizeSources(rawSources: unknown): { sources: LogSource[] } | { error: string } {
  if (!Array.isArray(rawSources) || rawSources.length === 0) return { error: 'Provide at least one log source.' };
  const normalizedSources: LogSource[] = [];
  const seen = new Set<string>();
  for (const rawSource of rawSources) {
    if (!rawSource || typeof rawSource !== 'object') return { error: 'Each source must be an object.' };
    const source = rawSource as LogSource;
    for (const field of ['sourceId', 'cluster', 'namespace', 'pod', 'container'] as const) {
      const error = requiredText(source[field], `source.${field}`);
      if (error) return { error };
      if ((source[field] as string).length > 256) return { error: `source.${field} is too long.` };
    }
    const normalized: LogSource = {
      sourceId: source.sourceId.trim(),
      cluster: source.cluster.trim(),
      namespace: source.namespace.trim(),
      pod: source.pod.trim(),
      container: source.container.trim(),
      ...(normalizeApplication(source.application) ? { application: normalizeApplication(source.application) } : {}),
    };
    const key = sourceKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      normalizedSources.push(normalized);
    }
  }
  if (normalizedSources.length > MAX_LOG_SOURCES) return { error: `A subscription may contain at most ${MAX_LOG_SOURCES} sources.` };
  return { sources: normalizedSources };
}

function validateGeneration(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_HISTORY_GENERATION) return 'generation must be a positive integer.';
  return undefined;
}

function validateHistorySessionId(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) return 'sessionId is invalid.';
  return undefined;
}

function validateHistoryQueryFilters(value: unknown): { filters: HistoryQueryFilters } | { error: string } {
  if (!value || typeof value !== 'object') return { error: 'filters must be an object.' };
  const input = value as Partial<HistoryQueryFilters>;
  const filters: HistoryQueryFilters = { pod: '', container: '', cluster: '', namespace: '', text: '' };
  for (const field of Object.keys(filters) as Array<keyof HistoryQueryFilters>) {
    const candidate = input[field];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'string' || candidate.length > (field === 'text' ? 512 : 256)) return { error: `filters.${field} is invalid.` };
    filters[field] = candidate.trim();
  }
  return { filters };
}

export function validateHistoryStart(raw: unknown): HistoryStartValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'history.start') return { error: 'The first message must start a history session.' };
  const value = raw as Partial<HistoryStartRequest>;
  if (typeof value.requestId !== 'string' || !value.requestId.trim() || value.requestId.length > MAX_HISTORY_REQUEST_ID_LENGTH) return { error: 'requestId must be a bounded non-empty string.' };
  const generationError = validateGeneration(value.generation);
  if (generationError) return { error: generationError };
  const normalizedRange = normalizeRange(value.from, value.to);
  if ('error' in normalizedRange) return normalizedRange;
  const sources = normalizeSources(value.sources);
  if ('error' in sources) return sources;
  return { request: { type: 'history.start', requestId: value.requestId.trim(), generation: value.generation!, ...normalizedRange, sources: sources.sources } };
}

export function validateHistoryWindow(raw: unknown): HistoryWindowValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'history.window') return { error: 'Invalid history window request.' };
  const value = raw as Partial<HistoryWindowRequest>;
  const sessionError = validateHistorySessionId(value.sessionId);
  if (sessionError) return { error: sessionError };
  const generationError = validateGeneration(value.generation);
  if (generationError) return { error: generationError };
  const cursor = value.cursor;
  if (cursor !== undefined && (!cursor || typeof cursor !== 'object' || typeof cursor.sourceKey !== 'string' || cursor.sourceKey.length === 0 || cursor.sourceKey.length > MAX_HISTORY_CURSOR_SOURCE_KEY_LENGTH || !Number.isInteger(cursor.line) || cursor.line < 0)) return { error: 'cursor is invalid.' };
  if (value.direction !== undefined && value.direction !== 'forward' && value.direction !== 'backward') return { error: 'direction must be forward or backward.' };
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit <= 0)) return { error: 'limit must be a positive integer.' };
  return { request: { type: 'history.window', sessionId: value.sessionId!, generation: value.generation!, cursor, direction: value.direction ?? 'forward', limit: value.limit ?? 500 } };
}

export function validateHistoryQueryStart(raw: unknown): HistoryQueryStartValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'history.query.start') return { error: 'Invalid history query start request.' };
  const value = raw as Partial<HistoryQueryStartRequest>;
  const sessionError = validateHistorySessionId(value.sessionId);
  if (sessionError) return { error: sessionError };
  const generationError = validateGeneration(value.generation);
  if (generationError) return { error: generationError };
  const filters = validateHistoryQueryFilters(value.filters);
  if ('error' in filters) return filters;
  return { request: { type: 'history.query.start', sessionId: value.sessionId!, generation: value.generation!, filters: filters.filters } };
}

export function validateHistoryQueryWindow(raw: unknown): HistoryQueryWindowValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'history.query.window') return { error: 'Invalid history query window request.' };
  const value = raw as Partial<HistoryQueryWindowRequest>;
  const sessionError = validateHistorySessionId(value.sessionId);
  if (sessionError) return { error: sessionError };
  const generationError = validateGeneration(value.generation);
  if (generationError) return { error: generationError };
  if (typeof value.queryId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.queryId)) return { error: 'queryId is invalid.' };
  if (typeof value.offset !== 'number' || !Number.isInteger(value.offset) || value.offset < 0) return { error: 'offset must be a non-negative integer.' };
  if (value.direction !== undefined && value.direction !== 'forward' && value.direction !== 'backward') return { error: 'direction must be forward or backward.' };
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit <= 0)) return { error: 'limit must be a positive integer.' };
  return { request: { type: 'history.query.window', sessionId: value.sessionId!, generation: value.generation!, queryId: value.queryId!, offset: value.offset!, direction: value.direction ?? 'forward', limit: value.limit ?? 500 } };
}

export function validateHistoryCancel(raw: unknown): HistoryCancelValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'history.cancel') return { error: 'Invalid history cancel request.' };
  const value = raw as Partial<HistoryCancelRequest>;
  const sessionError = validateHistorySessionId(value.sessionId);
  if (sessionError) return { error: sessionError };
  const generationError = validateGeneration(value.generation);
  if (generationError) return { error: generationError };
  if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > 128)) return { error: 'reason is invalid.' };
  return { request: { type: 'history.cancel', sessionId: value.sessionId!, generation: value.generation!, reason: value.reason } };
}

export function validateSubscription(raw: unknown): SubscriptionValidation {
  if (!raw || typeof raw !== 'object' || (raw as { type?: unknown }).type !== 'subscribe') {
    return { error: 'The first message must be a subscribe message.' };
  }
  const message = raw as Partial<SubscribeMessage>;
  if (!Array.isArray(message.sources) || message.sources.length === 0) {
    return { error: 'Provide at least one log source.' };
  }
  const from = normalizeDate(message.from, 'from');
  const to = normalizeDate(message.to, 'to');
  if (typeof from === 'string' && from.includes(' must be ')) return { error: from };
  if (typeof to === 'string' && to.includes(' must be ')) return { error: to };
  if (from && to && from >= to) return { error: 'from must be earlier than to.' };
  if (message.follow !== undefined && typeof message.follow !== 'boolean') {
    return { error: 'follow must be a boolean.' };
  }

  const sources = normalizeSources(message.sources);
  if ('error' in sources) return sources;

  const requested = message.limits === undefined ? {} : message.limits;
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) {
    return { error: 'limits must be an object.' };
  }
  const limits = {} as LogLimits;
  for (const field of Object.keys(DEFAULT_LOG_LIMITS) as Array<keyof LogLimits>) {
    const value = normalizeLimit(requested[field], field);
    if (typeof value === 'string') return { error: value };
    limits[field] = value;
  }

  return {
    subscription: {
      from: from as string | undefined,
      to: to as string | undefined,
      follow: message.follow !== false,
      limits,
      sources: sources.sources,
    },
  };
}

function normalizeRange(fromValue: unknown, toValue: unknown): { from?: string; to?: string } | { error: string } {
  const from = normalizeDate(fromValue, 'from');
  const to = normalizeDate(toValue, 'to');
  if (typeof from === 'string' && from.includes(' must be ')) return { error: from };
  if (typeof to === 'string' && to.includes(' must be ')) return { error: to };
  if (from && to && from >= to) return { error: 'from must be earlier than to.' };
  return { from: from as string | undefined, to: to as string | undefined };
}
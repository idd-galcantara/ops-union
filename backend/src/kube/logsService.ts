import { PassThrough } from 'node:stream';
import { logForContext } from './kubeconfig.js';
import { safeErrorMessage } from './podsService.js';

/**
 * Minimal, injectable seam over `@kubernetes/client-node`'s `Log`. Returning a
 * {@link LogStreamClient} lets tests drive post-open stream errors and the
 * inactivity deadline without a live cluster. The real implementation is a thin
 * adapter over the cached per-context `Log` client (read-only pod log endpoint).
 */
export interface KubeLogRequestOptions {
  follow?: boolean;
  tailLines?: number;
  limitBytes?: number;
  sinceTime?: string;
  timestamps?: boolean;
}

export interface LogStreamClient {
  log: (
    namespace: string,
    pod: string,
    container: string,
    stream: PassThrough,
    options: KubeLogRequestOptions,
  ) => Promise<AbortController>;
}

export type LogStreamClientFactory = (cluster: string) => LogStreamClient;

const defaultLogClientFactory: LogStreamClientFactory = (cluster) => logForContext(cluster);

export interface LogStreamOptions {
  cluster: string;
  namespace: string;
  pod: string;
  container: string;
  follow: boolean;
  tailLines?: number;
  /**
   * Optional follow-stream inactivity deadline (ms). When set, the stream is
   * stopped cleanly if no data chunk arrives within the window. Default
   * undefined preserves the current always-open follow behavior.
   */
  inactivityMs?: number;
  /** Test seam: inject a fake log client. Defaults to the real per-context Log. */
  logClientFactory?: LogStreamClientFactory;
}

export interface StructuredLogOptions extends LogStreamOptions {
  from?: string;
  to?: string;
  maxBytes?: number;
  maxRecordBytes?: number;
}

export interface StructuredLogLine {
  timestamp: string | null;
  message: string;
  bytes: number;
}

export interface StructuredLogCallbacks {
  onLine: (line: StructuredLogLine) => boolean | void;
  onWarning?: (count: number) => void;
  onLimit?: (reason: string) => void;
  onError: (message: string) => void;
  onEnd: (reason: 'eof' | 'to-reached' | 'limit' | 'cancelled') => void;
}

export interface LogLineParser {
  push: (chunk: Buffer) => string[];
  end: () => string[];
}

class LogLineParserLimitError extends Error {}

export interface LogStreamHandle {
  /** Stops the upstream request and releases resources. */
  stop: () => void;
}

export interface LogStreamCallbacks {
  onLine: (line: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** Upper bound so a huge backlog can't be requested by accident. */
export const MAX_TAIL_LINES = 5000;

/** Clamps tailLines into a sane range. */
export function normalizeTailLines(raw: unknown, fallback = 500): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_TAIL_LINES);
}

export function parseTimestampedLine(line: string): { timestamp: string | null; message: string } {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)(?:\s+)?(.*)$/.exec(line);
  if (!match) return { timestamp: null, message: line };
  const date = new Date(match[1]);
  if (Number.isNaN(date.getTime())) return { timestamp: null, message: line };
  return { timestamp: date.toISOString(), message: match[2] };
}

export function parseLogLine(
  line: string,
  range: { from?: string; to?: string } = {},
): { kind: 'emit' | 'drop' | 'to-reached'; record?: StructuredLogLine } {
  const parsed = parseTimestampedLine(line);
  const hasBoundary = Boolean(range.from || range.to);
  if (!parsed.timestamp) {
    if (hasBoundary) return { kind: 'drop' };
    return { kind: 'emit', record: { ...parsed, bytes: Buffer.byteLength(parsed.message, 'utf8') + 1 } };
  }

  const timestampMs = Date.parse(parsed.timestamp);
  if (range.from && timestampMs < Date.parse(range.from)) return { kind: 'drop' };
  if (range.to && timestampMs >= Date.parse(range.to)) return { kind: 'to-reached' };
  return { kind: 'emit', record: { ...parsed, bytes: Buffer.byteLength(parsed.message, 'utf8') + 1 } };
}

export function createLogLineParser(maxLineBytes = 256 * 1024): LogLineParser {
  const chunks: Buffer[] = [];
  let bufferedBytes = 0;
  const append = (chunk: Buffer): void => {
    if (bufferedBytes + chunk.length > maxLineBytes) throw new LogLineParserLimitError('record-size');
    if (chunk.length > 0) {
      chunks.push(chunk);
      bufferedBytes += chunk.length;
    }
  };
  const takeLine = (): string => {
    const line = Buffer.concat(chunks, bufferedBytes).toString('utf8');
    chunks.length = 0;
    bufferedBytes = 0;
    return line.endsWith('\r') ? line.slice(0, -1) : line;
  };
  const push = (chunk: Buffer): string[] => {
    const lines: string[] = [];
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(0x0a, start);
      const end = newline === -1 ? chunk.length : newline;
      append(chunk.subarray(start, end));
      if (newline === -1) break;
      lines.push(takeLine());
      start = newline + 1;
    }
    return lines;
  };
  return {
    push,
    end: () => {
      if (bufferedBytes === 0) return [];
      return [takeLine()];
    },
  };
}

/**
 * Streams a container's logs, emitting complete lines.
 *
 * Read-only: this uses the pod log endpoint only. The returned handle aborts the
 * upstream request, which matters because a `follow` stream would otherwise stay
 * open after the client disconnects.
 */
export function streamPodLogs(
  options: LogStreamOptions,
  callbacks: LogStreamCallbacks,
): LogStreamHandle {
  const stream = new PassThrough();
  let buffer = '';
  let stopped = false;
  let finished = false;
  let abort: AbortController | undefined;
  let inactivityTimer: NodeJS.Timeout | undefined;

  const clearInactivity = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = undefined;
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInactivity();
    abort?.abort();
    stream.destroy();
  };
  // Routes every terminal path (error / open-time catch / post-open reject)
  // through onError exactly once; stop() prevents a late error after teardown.
  const fail = (reason: unknown) => {
    if (stopped || finished) return;
    finished = true;
    const message = safeErrorMessage(reason);
    stop();
    callbacks.onError(message);
  };

  const armInactivity = () => {
    if (options.inactivityMs === undefined || !options.follow) return;
    clearInactivity();
    inactivityTimer = setTimeout(() => {
      if (stopped || finished) return;
      // Expiry is a clean end, not an error: stop upstream and report onEnd once.
      finished = true;
      stop();
      callbacks.onEnd();
    }, options.inactivityMs);
    inactivityTimer.unref?.();
  };

  stream.on('data', (chunk: Buffer) => {
    if (stopped || finished) return;
    armInactivity();
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    // Keep the trailing partial line in the buffer until its newline arrives.
    buffer = lines.pop() ?? '';
    for (const line of lines) callbacks.onLine(line);
  });

  stream.on('end', () => {
    if (stopped || finished) return;
    finished = true;
    clearInactivity();
    if (buffer.length > 0) {
      callbacks.onLine(buffer);
      buffer = '';
    }
    callbacks.onEnd();
  });

  stream.on('error', (err: Error) => {
    fail(err);
  });

  const log = (options.logClientFactory ?? defaultLogClientFactory)(options.cluster);
  log
    .log(options.namespace, options.pod, options.container, stream, {
      follow: options.follow,
      tailLines: options.tailLines,
      timestamps: false,
    })
    .then((controller) => {
      abort = controller;
      // The client may have disconnected while the request was being set up.
      if (stopped) controller.abort();
      else armInactivity();
    })
    .catch((err: unknown) => {
      // Sanitize: the client's ApiException message embeds the raw body and all
      // response headers, which must never reach the browser.
      fail(err);
    });

  return { stop };
}

/** Timestamped, bounded source stream used by the aggregate protocol. */
export function streamStructuredPodLogs(
  options: StructuredLogOptions,
  callbacks: StructuredLogCallbacks,
): LogStreamHandle {
  const stream = new PassThrough();
  const parser = createLogLineParser(options.maxRecordBytes);
  let stopped = false;
  let completed = false;
  let abort: AbortController | undefined;
  let inactivityTimer: NodeJS.Timeout | undefined;

  const clearInactivity = () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = undefined;
    }
  };

  const finish = (reason: 'eof' | 'to-reached' | 'limit' | 'cancelled') => {
    if (completed) return;
    completed = true;
    clearInactivity();
    callbacks.onEnd(reason);
  };
  // Routes a stream/open error to onError at most once; after finish/error any
  // later rejection is dropped so a single source cannot double-report.
  const fail = (reason: unknown) => {
    if (completed || stopped) return;
    stopped = true;
    clearInactivity();
    completed = true;
    callbacks.onError(safeErrorMessage(reason));
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInactivity();
    abort?.abort();
    stream.destroy();
    finish('cancelled');
  };
  const armInactivity = () => {
    if (options.inactivityMs === undefined || !options.follow) return;
    clearInactivity();
    inactivityTimer = setTimeout(() => {
      if (stopped || completed) return;
      // Expiry runs the normal stop cleanup and ends cleanly ('cancelled'),
      // never throwing — the source simply stops without a protocol error.
      stop();
    }, options.inactivityMs);
    inactivityTimer.unref?.();
  };
  const consumeLine = (line: string) => {
    const parsed = parseLogLine(line, options);
    if (parsed.kind === 'drop') {
      callbacks.onWarning?.(1);
      return;
    }
    if (parsed.kind === 'to-reached') {
      stopped = true;
      abort?.abort();
      stream.destroy();
      finish('to-reached');
      return;
    }
    if (parsed.record && callbacks.onLine(parsed.record) === false) {
      stopped = true;
      abort?.abort();
      stream.destroy();
      finish('limit');
    }
  };
  const handleParserError = (error: unknown): void => {
    if (stopped || completed) return;
    if (error instanceof LogLineParserLimitError) {
      stopped = true;
      abort?.abort();
      callbacks.onLimit?.('record-size');
      finish('limit');
      return;
    }
    fail(error);
  };

  stream.on('data', (chunk: Buffer) => {
    if (stopped || completed) return;
    armInactivity();
    try {
      for (const line of parser.push(chunk)) {
        consumeLine(line);
        if (stopped) break;
      }
    } catch (error) {
      handleParserError(error);
    }
  });
  stream.on('end', () => {
    if (stopped || completed) return;
    clearInactivity();
    try {
      for (const line of parser.end()) consumeLine(line);
      if (!stopped) finish('eof');
    } catch (error) {
      handleParserError(error);
    }
  });
  stream.on('error', (err: Error) => {
    fail(err);
  });

  const log = (options.logClientFactory ?? defaultLogClientFactory)(options.cluster);
  log
    .log(options.namespace, options.pod, options.container, stream, {
      follow: options.follow,
      tailLines: options.tailLines,
      limitBytes: options.maxBytes,
      sinceTime: options.from,
      timestamps: true,
    })
    .then((controller) => {
      abort = controller;
      if (stopped) controller.abort();
      else armInactivity();
    })
    .catch((err: unknown) => {
      fail(err);
    });

  return { stop };
}

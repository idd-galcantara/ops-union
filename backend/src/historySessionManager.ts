import { chmodSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { streamStructuredPodLogs } from './kube/logsService.js';
import { historyLimits, type HistoryLimits } from './historyLimits.js';
import { cleanupOrphanedHistorySessions } from './historySessionCleanup.js';
import { HistorySession } from './historySessionLifecycle.js';
import type { AggregateLogEvent } from './logsTypes.js';
import type { HistorySessionManagerOptions, HistoryStartInput } from './historySessionTypes.js';

const HISTORY_ROOT_PREFIX = 'ops-union-history-';

export class HistorySessionManager {
  private readonly rootDir: string;
  private readonly configuredLimits: HistoryLimits;
  private readonly streamFactory: NonNullable<HistorySessionManagerOptions['streamFactory']>;
  private readonly now: () => number;
  private readonly sessions = new Map<string, HistorySession>();
  private nextGeneration = 0;
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly storageReady: boolean;
  private closed = false;

  constructor(options: HistorySessionManagerOptions = {}) {
    this.rootDir = options.rootDir ?? path.join(os.tmpdir(), HISTORY_ROOT_PREFIX);
    let storageReady = true;
    try {
      mkdirSync(this.rootDir, { recursive: true, mode: 0o700 });
      chmodSync(this.rootDir, 0o700);
    } catch {
      storageReady = false;
    }
    this.storageReady = storageReady;
    this.configuredLimits = historyLimits(options.limits);
    this.streamFactory = options.streamFactory ?? streamStructuredPodLogs;
    this.now = options.now ?? Date.now;
    if (this.storageReady) cleanupOrphanedHistorySessions(this.rootDir, this.configuredLimits.orphanGraceMs, this.now);
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), Math.min(this.configuredLimits.ttlMs, 60_000));
    this.cleanupTimer.unref();
  }

  get limits(): Readonly<HistoryLimits> { return this.configuredLimits; }

  start(input: HistoryStartInput, emit: (event: AggregateLogEvent) => void): { session?: HistorySession; error?: string } {
    this.cleanupExpired();
    if (!this.storageReady) return { error: 'Could not start history session.' };
    const activeSessions = [...this.sessions.values()].filter((session) => !session.isTerminal).length;
    if (activeSessions >= this.configuredLimits.maxConcurrentSessions) return { error: 'History capacity is currently full.' };
    const generation = ++this.nextGeneration;
    let session: HistorySession | undefined;
    try {
      session = new HistorySession({ ...input, generation }, { rootDir: this.rootDir, limits: this.configuredLimits, streamFactory: this.streamFactory, now: this.now }, emit);
      session.prepare();
    } catch {
      session?.cleanup();
      return { error: 'Could not start history session.' };
    }
    this.sessions.set(session.sessionId, session);
    return { session };
  }

  get(sessionId: string, generation: number): HistorySession | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'History session was not found.' };
    if (session.generation !== generation) return { error: 'History generation is stale.' };
    return session;
  }

  cancel(sessionId: string, generation: number): string | undefined {
    const session = this.get(sessionId, generation);
    if ('error' in session) return session.error;
    session.cancel();
    return undefined;
  }

  cleanupExpired(now = this.now()): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.isTerminal && !session.isCleaned && session.terminalStatus !== 'cancelled' && session.terminalTimestamp !== undefined && now - session.terminalTimestamp >= this.configuredLimits.ttlMs) session.expire();
      if (this.sessions.size > this.configuredLimits.maxRetainedSessions && (session.isCleaned || session.isTerminal)) this.sessions.delete(sessionId);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.cleanupTimer);
    for (const session of this.sessions.values()) {
      if (session.isTerminal) session.cleanup();
      else session.cancel();
    }
    this.sessions.clear();
  }
}

import { chmodSync, closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HistoryIndexReader } from './historyIndexReader.js';
import { HistoryStorageWriter, writeAll } from './historyStorage.js';
import { HistorySessionQuery, type HistoryQueryHost } from './historySessionQuery.js';
import { HistorySourcePump, createSourceState } from './historySourcePump.js';
import type { AggregateLogEvent, HistoryCursor, HistoryQueryFilters, HistoryTerminalStatus } from './logsTypes.js';
import type { HistorySessionConstructionOptions, HistorySessionManagerOptions, HistoryStartInput, HistoryWindowResult } from './historySessionTypes.js';

const SESSION_DIR_PREFIX = 'session-';
const CLEANUP_RETRIES = 2;

export class HistorySession {
  readonly sessionId = randomUUID();
  readonly snapshotId = randomUUID();
  readonly generation: number;
  private readonly directory: string;
  private readonly states: ReturnType<typeof createSourceState>[];
  private readonly reader: HistoryIndexReader;
  private readonly pump: HistorySourcePump;
  private readonly query: HistorySessionQuery;
  private readonly now: () => number;
  private readonly emit: (event: AggregateLogEvent) => void;
  private started = false;
  private finalized = false;
  private cleaned = false;
  private terminalAt?: number;
  private status: HistoryTerminalStatus | 'starting' | 'reading' = 'starting';

  constructor(private readonly input: HistoryStartInput, options: HistorySessionConstructionOptions, emit: (event: AggregateLogEvent) => void) {
    this.generation = input.generation;
    this.reader = new HistoryIndexReader(options.limits);
    this.now = options.now;
    this.emit = emit;
    const directory = mkdtempSync(path.join(options.rootDir, SESSION_DIR_PREFIX));
    try {
      chmodSync(directory, 0o700);
    } catch (error) {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
      throw error;
    }
    this.directory = directory;
    this.states = input.sources.map(createSourceState);
    this.pump = new HistorySourcePump(input, this.states, options.limits, options.streamFactory, () => this.emitProgress(), (status, cleanup) => this.finalize(status, cleanup));
    const queryHost: HistoryQueryHost = {
      isFinalized: () => this.finalized,
      status: () => this.status,
      isCleaned: () => this.cleaned,
      states: this.states,
      limits: options.limits,
      reader: this.reader,
      now: this.now,
    };
    this.query = new HistorySessionQuery(queryHost);
  }

  get isTerminal(): boolean { return this.finalized; }
  get isCleaned(): boolean { return this.cleaned; }
  get terminalStatus(): HistoryTerminalStatus | undefined { return this.finalized ? this.status as HistoryTerminalStatus : undefined; }
  get terminalTimestamp(): number | undefined { return this.terminalAt; }

  prepare(): void {
    const writers: HistoryStorageWriter[] = [];
    try {
      for (const state of this.states) {
        state.writer = new HistoryStorageWriter(this.directory, this.pump.limits);
        writers.push(state.writer);
      }
    } catch (error) {
      for (const writer of writers) {
        try { writer.close(); } catch { /* best effort */ }
      }
      throw error;
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.status = 'reading';
    this.writeManifest();
    this.emitProgress();
    this.pump.start();
  }

  cancel(): void {
    if (this.finalized && this.status === 'cancelled') return;
    if (this.finalized) return;
    this.pump.cancel();
    this.finalize('cancelled', true);
  }

  expire(): void {
    if (!this.finalized || this.cleaned) return;
    this.status = 'expired';
    this.cleanupFiles();
    this.emitTerminal();
  }

  cleanup(): void {
    this.cleanupFiles();
  }

  readWindow(cursor: HistoryCursor | undefined, direction: 'forward' | 'backward', requestedLimit: number): HistoryWindowResult | { error: string } {
    return this.query.readWindow(cursor, direction, requestedLimit);
  }

  startQuery(filters: HistoryQueryFilters): { queryId: string; totalMatches: number } | { error: string } {
    return this.query.startQuery(filters);
  }

  readQueryWindow(queryId: string, offset: number, direction: 'forward' | 'backward', requestedLimit: number) {
    return this.query.readQueryWindow(queryId, offset, direction, requestedLimit);
  }

  private emitProgress(): void {
    const progress = this.pump.progress();
    this.emit({ type: 'history.progress', sessionId: this.sessionId, snapshotId: this.snapshotId, generation: this.generation, ...progress });
  }

  private finalize(status: HistoryTerminalStatus, cleanup: boolean): void {
    if (this.finalized) return;
    this.finalized = true;
    this.status = status;
    this.terminalAt = this.now();
    for (const state of this.states) {
      if (state.writer) {
        try { state.writer.close(); } catch { state.error = 'History snapshot storage failed.'; }
      }
    }
    this.writeManifest();
    this.emitTerminal();
    if (cleanup) this.cleanupFiles();
  }

  private emitTerminal(): void {
    const progress = this.pump.progress();
    const reasons = [...new Set(this.states.map((state) => state.limitReason).filter((reason): reason is string => Boolean(reason)))];
    this.emit({ type: 'history.terminal', sessionId: this.sessionId, snapshotId: this.snapshotId, generation: this.generation, status: this.status as HistoryTerminalStatus, ...progress, limitReasons: reasons });
  }

  private writeManifest(): void {
    try {
      const manifest = { version: 1, sessionId: this.sessionId, snapshotId: this.snapshotId, generation: this.generation, range: { from: this.input.from ?? null, to: this.input.to ?? null }, sources: this.pump.progress().sources, status: this.status, terminalAt: this.terminalAt ?? null };
      const manifestPath = path.join(this.directory, 'manifest.json');
      const fd = openSync(manifestPath, 'w', 0o600);
      writeAll(fd, Buffer.from(JSON.stringify(manifest), 'utf8'));
      closeSync(fd);
    } catch {
      // Manifest failure cannot expose a local path or replace the snapshot's safe status.
    }
  }

  private cleanupFiles(): void {
    if (this.cleaned) return;
    for (let attempt = 0; attempt <= CLEANUP_RETRIES; attempt += 1) {
      try {
        rmSync(this.directory, { recursive: true, force: true });
        this.cleaned = true;
        return;
      } catch {
        // Bounded retries; the renderer only sees the safe lifecycle status.
      }
    }
  }
}

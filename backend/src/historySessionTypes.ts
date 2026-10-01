import type { StructuredLogCallbacks, StructuredLogOptions, LogStreamHandle } from './kube/logsService.js';
import type { HistoryLimits } from './historyLimits.js';
import type { AggregateLogEvent, HistoryRecord, HistorySourceProgress, HistoryTerminalStatus, LogCounters, LogSource } from './logsTypes.js';
import type { HistoryStorageWriter } from './historyStorage.js';

export type HistoryStreamFactory = (options: StructuredLogOptions, callbacks: StructuredLogCallbacks) => LogStreamHandle;

export interface HistoryStartInput {
  requestId: string;
  generation: number;
  from?: string;
  to?: string;
  sources: LogSource[];
}

export interface HistoryWindowResult {
  sourceKey: string;
  source: LogSource;
  startLine: number;
  endLine: number;
  records: HistoryRecord[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface HistorySessionManagerOptions {
  rootDir?: string;
  limits?: Partial<HistoryLimits>;
  streamFactory?: HistoryStreamFactory;
  now?: () => number;
}

export interface SourceState {
  source: LogSource;
  sourceKey: string;
  status: HistorySourceProgress['status'];
  counters: LogCounters;
  sequence: number;
  continuity: 'single-read' | 'unknown';
  writer?: HistoryStorageWriter;
  handle?: LogStreamHandle;
  error?: string;
  limitReason?: string;
  stopReason?: 'limit' | 'cancelled';
}

export interface HistorySessionConstructionOptions {
  rootDir: string;
  limits: HistoryLimits;
  streamFactory: HistoryStreamFactory;
  now: () => number;
}

export type HistorySessionStatus = HistoryTerminalStatus | 'starting' | 'reading';

export interface HistoryProgress {
  aggregate: {
    capturedLines: number;
    capturedBytes: number;
    completedSources: number;
    activeSources: number;
    queuedSources: number;
    sourceCount: number;
    determinate: false;
    limits: {
      maxLinesTotal: number;
      maxBytesTotal: number;
      maxDiskBytesTotal: number;
      usedDiskBytes: number;
    };
  };
  sources: HistorySourceProgress[];
}

export type HistoryProgressEmitter = (event: AggregateLogEvent) => void;

import { randomUUID } from 'node:crypto';
import type { HistoryLimits } from './historyLimits.js';
import { HISTORY_MULTI_SOURCE_CURSOR_ERROR } from './historySessionQueryErrors.js';
import { HISTORY_RECORD_TOO_LARGE_ERROR, HistoryIndexReader } from './historyIndexReader.js';
import type { HistoryCursor, HistoryQueryFilters, HistoryRecord, HistoryTerminalStatus } from './logsTypes.js';
import type { HistoryWindowResult, SourceState } from './historySessionTypes.js';

interface HistoryQuery {
  queryId: string;
  references: Array<{ sourceKey: string; line: number }>;
}

export interface HistoryQueryHost {
  isFinalized(): boolean;
  status(): HistoryTerminalStatus | 'starting' | 'reading';
  isCleaned(): boolean;
  states: SourceState[];
  limits: HistoryLimits;
  reader: HistoryIndexReader;
  now: () => number;
}

export class HistorySessionQuery {
  private readonly requestTimes: number[] = [];
  private readonly queries = new Map<string, HistoryQuery>();

  constructor(private readonly host: HistoryQueryHost) {}

  readWindow(cursor: HistoryCursor | undefined, direction: 'forward' | 'backward', requestedLimit: number): HistoryWindowResult | { error: string } {
    const unavailable = this.checkAvailable();
    if (unavailable) return unavailable;
    if (!this.allowRequest()) return { error: 'History window request rate exceeded.' };
    const state = cursor
      ? this.host.states.find((candidate) => candidate.sourceKey === cursor.sourceKey)
      : this.host.states.length === 1 ? this.host.states[0] : undefined;
    if (!cursor && this.host.states.length > 1) return { error: HISTORY_MULTI_SOURCE_CURSOR_ERROR };
    if (!state || !state.writer) return { error: 'History cursor is invalid.' };
    const limit = Math.min(requestedLimit, this.host.limits.maxWindowRecords);
    if (!Number.isInteger(limit) || limit <= 0) return { error: 'History window limit is invalid.' };
    const total = state.writer.lines;
    if (cursor && (cursor.line < 0 || cursor.line > total)) return { error: 'History cursor is invalid.' };
    let start = cursor?.line ?? 0;
    let end = Math.min(total, start + limit);
    if (direction === 'backward') {
      end = cursor?.line ?? total;
      start = Math.max(0, end - limit);
    }
    const result = this.readRecords(state, start, end, direction);
    if ('error' in result) return result;
    return {
      sourceKey: state.sourceKey,
      source: state.source,
      startLine: result.start,
      endLine: result.end,
      records: result.records,
      hasMoreBefore: result.start > 0,
      hasMoreAfter: result.end < total,
    };
  }

  startQuery(filters: HistoryQueryFilters): { queryId: string; totalMatches: number } | { error: string } {
    const unavailable = this.checkAvailable();
    if (unavailable) return unavailable;
    const references: Array<{ sourceKey: string; line: number }> = [];
    for (const state of this.host.states) {
      if (!state.writer) return { error: 'History snapshot storage is unavailable.' };
      let line = 0;
      while (line < state.writer.lines) {
        const result = this.readRecords(state, line, Math.min(state.writer.lines, line + this.host.limits.maxWindowRecords), 'forward');
        if ('error' in result) return result;
        if (result.end <= line) return { error: 'History snapshot index is invalid.' };
        result.records.forEach((record, index) => {
          if (historyRecordMatches(record, filters)) references.push({ sourceKey: state.sourceKey, line: result.start + index });
        });
        line = result.end;
      }
    }
    const queryId = randomUUID();
    this.queries.clear();
    this.queries.set(queryId, { queryId, references });
    return { queryId, totalMatches: references.length };
  }

  readQueryWindow(queryId: string, offset: number, direction: 'forward' | 'backward', requestedLimit: number): { queryId: string; startIndex: number; endIndex: number; records: HistoryRecord[]; hasMoreBefore: boolean; hasMoreAfter: boolean } | { error: string } {
    const unavailable = this.checkAvailable();
    if (unavailable) return unavailable;
    if (!this.allowRequest()) return { error: 'History window request rate exceeded.' };
    const query = this.queries.get(queryId);
    if (!query) return { error: 'History query is invalid or expired.' };
    if (!Number.isInteger(offset) || offset < 0 || offset > query.references.length) return { error: 'History query offset is invalid.' };
    const limit = Math.min(requestedLimit, this.host.limits.maxWindowRecords);
    if (!Number.isInteger(limit) || limit <= 0) return { error: 'History window limit is invalid.' };
    if (direction === 'forward') {
      let endIndex = Math.min(query.references.length, offset + limit);
      let bytes = 0;
      const records: HistoryRecord[] = [];
      for (const reference of query.references.slice(offset, endIndex)) {
        const result = this.readQueryRecord(reference);
        if ('error' in result) return result;
        if (result.record.bytes > this.host.limits.maxWindowBytes && records.length === 0) return { error: HISTORY_RECORD_TOO_LARGE_ERROR };
        if (bytes + result.record.bytes > this.host.limits.maxWindowBytes) break;
        bytes += result.record.bytes;
        records.push(result.record);
      }
      endIndex = offset + records.length;
      return { queryId, startIndex: offset, endIndex, records, hasMoreBefore: offset > 0, hasMoreAfter: endIndex < query.references.length };
    }
    let startIndex = offset;
    let bytes = 0;
    const records: HistoryRecord[] = [];
    for (let index = offset - 1; index >= 0 && records.length < limit; index -= 1) {
      const result = this.readQueryRecord(query.references[index]);
      if ('error' in result) return result;
      if (result.record.bytes > this.host.limits.maxWindowBytes && records.length === 0) return { error: HISTORY_RECORD_TOO_LARGE_ERROR };
      if (bytes + result.record.bytes > this.host.limits.maxWindowBytes) break;
      bytes += result.record.bytes;
      records.unshift(result.record);
      startIndex = index;
    }
    return { queryId, startIndex, endIndex: offset, records, hasMoreBefore: startIndex > 0, hasMoreAfter: offset < query.references.length };
  }

  private checkAvailable(): { error: string } | undefined {
    if (!this.host.isFinalized()) return { error: 'History snapshot is still being prepared.' };
    if (this.host.status() === 'cancelled') return { error: 'History session was cancelled.' };
    if (this.host.status() === 'expired' || this.host.isCleaned()) return { error: 'History session expired.' };
    return undefined;
  }

  private allowRequest(): boolean {
    const now = this.host.now();
    while (this.requestTimes.length > 0 && now - this.requestTimes[0] >= 60_000) this.requestTimes.shift();
    if (this.requestTimes.length >= this.host.limits.maxWindowRequestsPerMinute) return false;
    this.requestTimes.push(now);
    return true;
  }

  private readQueryRecord(reference: { sourceKey: string; line: number }): { record: HistoryRecord } | { error: string } {
    const state = this.host.states.find((candidate) => candidate.sourceKey === reference.sourceKey);
    if (!state) return { error: 'History query index is invalid.' };
    const result = this.readRecords(state, reference.line, reference.line + 1, 'forward');
    if ('error' in result) return result;
    if (result.records.length !== 1) return { error: 'History query index is invalid.' };
    return { record: result.records[0] };
  }

  private readRecords(state: SourceState, start: number, end: number, direction: 'forward' | 'backward') {
    return this.host.reader.readRecords(state.sourceKey, state.writer!, start, end, direction);
  }
}

function historyRecordMatches(record: HistoryRecord, filters: HistoryQueryFilters): boolean {
  return (
    (!filters.pod || record.source.pod === filters.pod) &&
    (!filters.container || record.source.container === filters.container) &&
    (!filters.cluster || record.source.cluster === filters.cluster) &&
    (!filters.namespace || record.source.namespace === filters.namespace) &&
    (!filters.text || record.message.toLowerCase().includes(filters.text.toLowerCase()))
  );
}

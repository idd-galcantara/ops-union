import { closeSync, openSync, readSync, statSync } from 'node:fs';
import type { HistoryLimits } from './historyLimits.js';
import type { HistoryRecord } from './logsTypes.js';
import type { HistoryStorageWriter } from './historyStorage.js';

const DECODED_RECORD_OVERHEAD_BYTES = 256;
export const HISTORY_PAGE_MEMORY_ERROR = 'History page exceeds the in-flight decoded memory limit.';
export const HISTORY_RECORD_TOO_LARGE_ERROR = 'History record exceeds the storage read limit.';

interface IndexEntry {
  lineNumber: number;
  byteOffset: number;
}

interface SelectedRange {
  start: number;
  end: number;
  startOffset: number;
  endOffset: number;
}

interface ReadResult {
  start: number;
  end: number;
  records: HistoryRecord[];
}

class HistoryStorageError extends Error {}

export class HistoryIndexReader {
  private readonly inFlightDecodedBytesBySource = new Map<string, number>();
  private inFlightDecodedBytes = 0;

  constructor(private readonly limits: HistoryLimits) {}

  readRecords(sourceKey: string, writer: HistoryStorageWriter, start: number, end: number, direction: 'forward' | 'backward'): ReadResult | { error: string } {
    if (start === end) return { start, end, records: [] };
    const offsets = this.readIndexOffsets(writer, start, end);
    if ('error' in offsets) return offsets;
    const selected = this.selectFittingRange(offsets.offsets, start, end, direction);
    if ('error' in selected) return selected;
    const bytes = selected.endOffset - selected.startOffset;
    const memoryBytes = bytes * 3 + (selected.end - selected.start) * DECODED_RECORD_OVERHEAD_BYTES;
    const sourceInFlightBytes = this.inFlightDecodedBytesBySource.get(sourceKey) ?? 0;
    if (sourceInFlightBytes + memoryBytes > this.limits.maxInFlightDecodedBytesPerSource || this.inFlightDecodedBytes + memoryBytes > this.limits.maxInFlightDecodedBytesPerSession) {
      return { error: HISTORY_PAGE_MEMORY_ERROR };
    }
    this.inFlightDecodedBytesBySource.set(sourceKey, sourceInFlightBytes + memoryBytes);
    this.inFlightDecodedBytes += memoryBytes;
    try {
      const fd = openSync(writer.dataPath, 'r');
      try {
        const buffer = Buffer.alloc(bytes);
        this.readFully(fd, buffer, selected.startOffset);
        const lines = buffer.toString('utf8').split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        if (lines.length !== selected.end - selected.start || lines.some((line) => line.length === 0)) return { error: 'History snapshot storage is invalid.' };
        const records = lines.map((line) => this.parseStoredRecord(line, sourceKey));
        return { start: selected.start, end: selected.end, records };
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if (error instanceof HistoryStorageError) return { error: error.message };
      return { error: 'History snapshot storage is unavailable.' };
    } finally {
      this.inFlightDecodedBytes -= memoryBytes;
      const remainingSourceBytes = (this.inFlightDecodedBytesBySource.get(sourceKey) ?? 0) - memoryBytes;
      if (remainingSourceBytes > 0) this.inFlightDecodedBytesBySource.set(sourceKey, remainingSourceBytes);
      else this.inFlightDecodedBytesBySource.delete(sourceKey);
    }
  }

  private readFully(fd: number, buffer: Buffer, position: number): void {
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, position + offset);
      if (count === 0) throw new HistoryStorageError('History snapshot storage is unavailable.');
      offset += count;
    }
  }

  private selectFittingRange(offsets: number[], start: number, end: number, direction: 'forward' | 'backward'): SelectedRange | { error: string } {
    let selectedStart = direction === 'backward' ? end : start;
    let selectedEnd = direction === 'backward' ? end : start;
    let bytes = 0;
    if (direction === 'forward') {
      for (let line = start; line < end; line += 1) {
        const recordBytes = offsets[line - start + 1] - offsets[line - start];
        if (recordBytes < 0) return { error: 'History snapshot index is invalid.' };
        if (recordBytes > this.limits.maxWindowBytes && selectedEnd === start) return { error: HISTORY_RECORD_TOO_LARGE_ERROR };
        if (recordBytes > this.limits.maxWindowBytes || bytes + recordBytes > this.limits.maxWindowBytes) break;
        bytes += recordBytes;
        selectedEnd = line + 1;
      }
    } else {
      for (let line = end - 1; line >= start; line -= 1) {
        const recordBytes = offsets[line - start + 1] - offsets[line - start];
        if (recordBytes < 0) return { error: 'History snapshot index is invalid.' };
        if (recordBytes > this.limits.maxWindowBytes && selectedStart === end) return { error: HISTORY_RECORD_TOO_LARGE_ERROR };
        if (recordBytes > this.limits.maxWindowBytes || bytes + recordBytes > this.limits.maxWindowBytes) break;
        bytes += recordBytes;
        selectedStart = line;
      }
    }
    return { start: selectedStart, end: selectedEnd, startOffset: offsets[selectedStart - start], endOffset: offsets[selectedEnd - start] };
  }

  private readIndexOffsets(writer: HistoryStorageWriter, start: number, end: number): { offsets: number[] } | { error: string } {
    try {
      const fd = openSync(writer.indexPath, 'r');
      try {
        const chunk = Buffer.alloc(16 * 1024);
        let pending = '';
        let position = 0;
        let expectedLine = 0;
        const offsets: number[] = [];
        let bytesRead = 0;
        let endFound = false;
        while ((bytesRead = readSync(fd, chunk, 0, chunk.length, position)) > 0 && !endFound) {
          position += bytesRead;
          pending += chunk.subarray(0, bytesRead).toString('utf8');
          const lines = pending.split('\n');
          pending = lines.pop() ?? '';
          if (Buffer.byteLength(pending, 'utf8') > this.limits.maxIndexEntryBytes) return { error: 'History snapshot index is invalid.' };
          for (const line of lines) {
            if (!line || Buffer.byteLength(line, 'utf8') > this.limits.maxIndexEntryBytes) return { error: 'History snapshot index is invalid.' };
            const entry = JSON.parse(line) as Partial<IndexEntry>;
            const byteOffset = entry.byteOffset;
            if (entry.lineNumber !== expectedLine || !this.isInteger(byteOffset) || byteOffset < 0) return { error: 'History snapshot index is invalid.' };
            if (entry.lineNumber >= start && entry.lineNumber <= end) offsets.push(byteOffset);
            if (entry.lineNumber === end) endFound = true;
            expectedLine += 1;
          }
        }
        if (!endFound && pending) {
          const entry = JSON.parse(pending) as Partial<IndexEntry>;
          const byteOffset = entry.byteOffset;
          if (entry.lineNumber !== expectedLine || !this.isInteger(byteOffset) || byteOffset < 0) return { error: 'History snapshot index is invalid.' };
          if (entry.lineNumber >= start && entry.lineNumber <= end) offsets.push(byteOffset);
          expectedLine += 1;
        }
        if (offsets.length === 0 || offsets[0] === undefined) return { error: 'History snapshot index is invalid.' };
        if (offsets.length === end - start) {
          if (end !== writer.lines || expectedLine !== writer.lines) return { error: 'History snapshot index is invalid.' };
          offsets.push(statSync(writer.dataPath).size);
        }
        if (offsets.length !== end - start + 1) return { error: 'History snapshot index is invalid.' };
        return { offsets };
      } finally {
        closeSync(fd);
      }
    } catch {
      return { error: 'History snapshot storage is unavailable.' };
    }
  }

  private parseStoredRecord(line: string, sourceKey: string): HistoryRecord {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new HistoryStorageError('History snapshot storage is invalid.'); }
    if (!value || typeof value !== 'object') throw new HistoryStorageError('History snapshot storage is invalid.');
    const record = value as Partial<HistoryRecord>;
    const sequence = record.sequence;
    const bytes = record.bytes;
    if (record.sourceKey !== sourceKey || !record.source || typeof record.source !== 'object' || !this.isInteger(sequence) || sequence <= 0 || (typeof record.timestamp !== 'string' && record.timestamp !== null) || typeof record.message !== 'string' || !this.isInteger(bytes) || bytes < 0) {
      throw new HistoryStorageError('History snapshot storage is invalid.');
    }
    return record as HistoryRecord;
  }

  private isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
  }
}

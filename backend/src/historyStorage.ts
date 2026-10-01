import { chmodSync, closeSync, openSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HistoryLimits } from './historyLimits.js';
import type { HistoryRecord } from './logsTypes.js';

export interface HistoryIndexEntry {
  lineNumber: number;
  byteOffset: number;
  timestamp: string | null;
}

export class HistoryLimitError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export class HistoryStorageWriter {
  readonly dataPath: string;
  readonly indexPath: string;
  lines = 0;
  logBytes = 0;
  diskBytes = 0;
  private dataBytes = 0;
  private dataFd!: number;
  private indexFd!: number;
  private closed = false;

  constructor(private readonly directory: string, private readonly limits: HistoryLimits) {
    this.dataPath = path.join(directory, `source-${randomUUID()}.ndjson`);
    this.indexPath = path.join(directory, `index-${randomUUID()}.ndjson`);
    let dataFd: number | undefined;
    try {
      dataFd = openSync(this.dataPath, 'w', 0o600);
      this.indexFd = openSync(this.indexPath, 'w', 0o600);
      this.dataFd = dataFd;
    } catch (error) {
      if (dataFd !== undefined) closeSync(dataFd);
      try { rmSync(this.dataPath, { force: true }); } catch { /* best effort */ }
      try { rmSync(this.indexPath, { force: true }); } catch { /* best effort */ }
      throw error;
    }
  }

  append(record: HistoryRecord, logBytes: number, totalDiskBytes: number): number {
    if (Buffer.byteLength(record.message, 'utf8') > this.limits.maxRecordBytes) throw new HistoryLimitError('record-size');
    const encoded = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const entry: HistoryIndexEntry = { lineNumber: this.lines, byteOffset: this.dataBytes, timestamp: record.timestamp };
    const indexEncoded = Buffer.from(`${JSON.stringify(entry)}\n`, 'utf8');
    const addedDisk = encoded.byteLength + indexEncoded.byteLength;
    if (this.diskBytes + addedDisk > this.limits.maxDiskBytesPerSource) throw new HistoryLimitError('disk-per-source');
    if (totalDiskBytes + addedDisk > this.limits.maxDiskBytesTotal) throw new HistoryLimitError('disk-total');
    writeAll(this.dataFd, encoded);
    writeAll(this.indexFd, indexEncoded);
    this.lines += 1;
    this.logBytes += logBytes;
    this.diskBytes += addedDisk;
    this.dataBytes += encoded.byteLength;
    return addedDisk;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeSync(this.dataFd);
    closeSync(this.indexFd);
  }
}

export function writeAll(fd: number, buffer: Buffer): void {
  let offset = 0;
  while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
}

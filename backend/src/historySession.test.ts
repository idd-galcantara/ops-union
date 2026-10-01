import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StructuredLogCallbacks, StructuredLogLine } from './kube/logsService.js';
import { cleanupOrphanedHistorySessions, HistorySessionManager, type HistoryStreamFactory } from './historySession.js';
import type { AggregateLogEvent, HistoryRecord, LogSource } from './logsTypes.js';

const source = (cluster: string, pod = 'pod'): LogSource => ({ sourceId: 'same-name', cluster, namespace: 'namespace', pod, container: 'app' });

function tempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'ops-union-history-test-'));
}

function input(sources: LogSource[]): { requestId: string; generation: number; sources: LogSource[] } {
  return { requestId: 'test-request', generation: 1, sources };
}

function finiteFactory(linesByPod: Record<string, StructuredLogLine[]>, calls: StructuredLogOptionsCapture[], failures: Record<string, string> = {}): HistoryStreamFactory {
  return (options, callbacks) => {
    calls.push({ pod: options.pod, follow: options.follow, from: options.from, to: options.to, tailLines: options.tailLines, maxBytes: options.maxBytes, maxRecordBytes: options.maxRecordBytes });
    if (failures[options.pod]) {
      callbacks.onError(failures[options.pod]);
      return { stop: () => undefined };
    }
    for (const line of linesByPod[options.pod] ?? []) {
      if (callbacks.onLine(line) === false) {
        callbacks.onEnd('limit');
        return { stop: () => undefined };
      }
    }
    callbacks.onEnd('eof');
    return { stop: () => undefined };
  };
}

interface StructuredLogOptionsCapture {
  pod: string;
  follow: boolean;
  from?: string;
  to?: string;
  tailLines?: number;
  maxBytes?: number;
  maxRecordBytes?: number;
}

function terminal(events: AggregateLogEvent[]): Extract<AggregateLogEvent, { type: 'history.terminal' }> {
  const event = events.findLast((candidate): candidate is Extract<AggregateLogEvent, { type: 'history.terminal' }> => candidate.type === 'history.terminal');
  assert.ok(event);
  return event;
}

test('history acquisition is finite, follow=false, indexed, and windowed by source identity', () => {
  const root = tempRoot();
  const calls: StructuredLogOptionsCapture[] = [];
  const events: AggregateLogEvent[] = [];
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ pod: [
    { timestamp: '2026-09-16T10:00:00.000Z', message: 'café', bytes: 6 },
    { timestamp: null, message: 'without timestamp', bytes: 17 },
  ] }, calls) });
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();

  assert.deepEqual(calls, [{ pod: 'pod', follow: false, from: undefined, to: undefined, tailLines: undefined, maxBytes: undefined, maxRecordBytes: 256 * 1024 }]);
  assert.equal(terminal(events).status, 'complete');
  const window = started.session.readWindow(undefined, 'forward', 2);
  assert.ok(!('error' in window));
  if (!('error' in window)) {
    assert.equal(window.records.length, 2);
    assert.equal(window.records[0].message, 'café');
    assert.equal(window.records[1].timestamp, null);
    assert.equal(window.hasMoreAfter, false);
  }

  const sessionDirectory = readdirSync(root).find((name) => name.startsWith('session-'));
  assert.ok(sessionDirectory);
  const files = readdirSync(path.join(root, sessionDirectory!));
  const indexFile = files.find((name) => name.startsWith('index-'));
  assert.ok(indexFile);
  const index = readFileSync(path.join(root, sessionDirectory!, indexFile!), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { lineNumber: number; byteOffset: number; timestamp: string | null });
  assert.equal(index[0].lineNumber, 0);
  assert.equal(index[1].lineNumber, 1);
  assert.equal(index[1].timestamp, null);
  assert.equal(index[1].byteOffset, Buffer.byteLength(`${JSON.stringify((window as { records: HistoryRecord[] }).records[0])}\n`, 'utf8'));
  if (process.platform !== 'win32') assert.equal(statSync(path.join(root, sessionDirectory!)).mode & 0o777, 0o700);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('duplicate pod names across contexts keep distinct source keys and partial failures', () => {
  const root = tempRoot();
  const events: AggregateLogEvent[] = [];
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ 'pod-a': [{ timestamp: null, message: 'successful', bytes: 11 }] }, [], { 'pod-b': 'HTTP-Code: 404\nMessage: secret body\nHeaders: authorization' }) });
  const started = manager.start(input([source('cluster-a', 'pod-a'), source('cluster-b', 'pod-b')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  const final = terminal(events);
  assert.equal(final.status, 'partial');
  assert.equal(final.sources.filter((item) => item.status === 'failed').length, 1);
  assert.equal(final.sources.filter((item) => item.status === 'ready').length, 1);
  assert.equal(final.sources[0].source.sourceId, final.sources[1].source.sourceId);
  assert.notEqual(final.sources[0].sourceKey, final.sources[1].sourceKey);
  assert.ok(!JSON.stringify(final).includes('secret body'));
  assert.ok(!JSON.stringify(final).includes('authorization'));
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('line and disk limits produce a bounded partial snapshot without over-capturing', () => {
  const root = tempRoot();
  const events: AggregateLogEvent[] = [];
  const manager = new HistorySessionManager({ rootDir: root, limits: { maxLinesPerSource: 1, maxLinesTotal: 10, maxDiskBytesPerSource: 1_000, maxDiskBytesTotal: 1_000 }, streamFactory: finiteFactory({ pod: [
    { timestamp: null, message: 'first', bytes: 6 },
    { timestamp: null, message: 'second', bytes: 7 },
  ] }, []) });
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  const final = terminal(events);
  assert.equal(final.status, 'partial');
  assert.deepEqual(final.limitReasons, ['lines-per-source']);
  const window = started.session.readWindow(undefined, 'forward', 20);
  assert.ok(!('error' in window));
  if (!('error' in window)) assert.equal(window.records.length, 1);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('temporary disk limit stops capture before writing an oversized record', () => {
  const root = tempRoot();
  const events: AggregateLogEvent[] = [];
  const manager = new HistorySessionManager({
    rootDir: root,
    limits: { maxLinesPerSource: 10, maxDiskBytesPerSource: 1, maxDiskBytesTotal: 1 },
    streamFactory: finiteFactory({ pod: [{ timestamp: null, message: 'record', bytes: 7 }] }, []),
  });
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  assert.equal(terminal(events).status, 'partial');
  assert.deepEqual(terminal(events).limitReasons, ['disk-per-source']);
  const window = started.session.readWindow(undefined, 'forward', 10);
  assert.ok(!('error' in window));
  if (!('error' in window)) assert.equal(window.records.length, 0);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('backward windows use exclusive cursors at the first, last, and page boundaries', () => {
  const root = tempRoot();
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ pod: [
    { timestamp: null, message: 'line-0', bytes: 7 },
    { timestamp: null, message: 'line-1', bytes: 7 },
    { timestamp: null, message: 'line-2', bytes: 7 },
    { timestamp: null, message: 'line-3', bytes: 7 },
    { timestamp: null, message: 'line-4', bytes: 7 },
  ] }, []) });
  const started = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(started.session);
  started.session.start();
  const sourceKey = started.session.readWindow(undefined, 'forward', 1);
  assert.ok(!('error' in sourceKey));
  if ('error' in sourceKey) return;
  const forwardFirst = started.session.readWindow(undefined, 'forward', 2);
  assert.ok(!('error' in forwardFirst));
  if ('error' in forwardFirst) return;
  assert.deepEqual(forwardFirst.records.map((record) => record.message), ['line-0', 'line-1']);
  const forwardBoundary = started.session.readWindow({ sourceKey: sourceKey.sourceKey, line: 2 }, 'forward', 2);
  assert.ok(!('error' in forwardBoundary));
  if ('error' in forwardBoundary) return;
  assert.deepEqual(forwardBoundary.records.map((record) => record.message), ['line-2', 'line-3']);
  const forwardLast = started.session.readWindow({ sourceKey: sourceKey.sourceKey, line: 4 }, 'forward', 2);
  assert.ok(!('error' in forwardLast));
  if ('error' in forwardLast) return;
  assert.deepEqual(forwardLast.records.map((record) => record.message), ['line-4']);
  const first = started.session.readWindow(undefined, 'backward', 2);
  assert.ok(!('error' in first));
  if ('error' in first) return;
  assert.deepEqual(first.records.map((record) => record.message), ['line-3', 'line-4']);
  assert.equal(first.startLine, 3);
  assert.equal(first.endLine, 5);
  const boundary = started.session.readWindow({ sourceKey: sourceKey.sourceKey, line: 3 }, 'backward', 2);
  assert.ok(!('error' in boundary));
  if ('error' in boundary) return;
  assert.deepEqual(boundary.records.map((record) => record.message), ['line-1', 'line-2']);
  const last = started.session.readWindow({ sourceKey: sourceKey.sourceKey, line: 1 }, 'backward', 2);
  assert.ok(!('error' in last));
  if ('error' in last) return;
  assert.deepEqual(last.records.map((record) => record.message), ['line-0']);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('page reads scan a large on-disk index without requiring an in-memory index', () => {
  const root = tempRoot();
  const lines = Array.from({ length: 400 }, (_, index) => ({ timestamp: null, message: `line-${index}`, bytes: index + 1 }));
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ pod: lines }, []) });
  const started = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(started.session);
  started.session.start();
  const window = started.session.readWindow(undefined, 'forward', 1);
  assert.ok(!('error' in window));
  if (!('error' in window)) assert.equal(window.records[0].message, 'line-0');
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('filtered history queries count and reload matches outside the first result window', () => {
  const root = tempRoot();
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ pod: [
    { timestamp: null, message: 'ordinary', bytes: 9 },
    { timestamp: null, message: 'ordinary', bytes: 9 },
    { timestamp: null, message: 'needle first', bytes: 13 },
    { timestamp: null, message: 'ordinary', bytes: 9 },
    { timestamp: null, message: 'needle second', bytes: 14 },
  ] }, []) });
  const started = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(started.session);
  started.session.start();
  const query = started.session.startQuery({ pod: 'pod', container: '', cluster: 'cluster-a', namespace: '', text: 'needle' });
  assert.ok(!('error' in query));
  if ('error' in query) return;
  assert.equal(query.totalMatches, 2);
  const first = started.session.readQueryWindow(query.queryId, 0, 'forward', 1);
  assert.ok(!('error' in first));
  if ('error' in first) return;
  assert.deepEqual(first.records.map((record) => record.message), ['needle first']);
  assert.equal(first.hasMoreAfter, true);
  const second = started.session.readQueryWindow(query.queryId, first.endIndex, 'forward', 1);
  assert.ok(!('error' in second));
  if ('error' in second) return;
  assert.deepEqual(second.records.map((record) => record.message), ['needle second']);
  assert.equal(second.hasMoreAfter, false);
  const backward = started.session.readQueryWindow(query.queryId, 1, 'backward', 1);
  assert.ok(!('error' in backward));
  if ('error' in backward) return;
  assert.deepEqual(backward.records.map((record) => record.message), ['needle first']);
  assert.deepEqual({ startIndex: backward.startIndex, endIndex: backward.endIndex }, { startIndex: 0, endIndex: 1 });
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('aggregate byte limits report bytes-total rather than lines-total', () => {
  const root = tempRoot();
  const events: AggregateLogEvent[] = [];
  const manager = new HistorySessionManager({ rootDir: root, limits: { maxLinesPerSource: 10, maxBytesPerSource: 100, maxLinesTotal: 10, maxBytesTotal: 7 }, streamFactory: finiteFactory({ pod: [
    { timestamp: null, message: 'first', bytes: 6 },
    { timestamp: null, message: 'second', bytes: 7 },
  ] }, []) });
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  assert.equal(terminal(events).status, 'partial');
  assert.deepEqual(terminal(events).limitReasons, ['bytes-total']);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('oversized windows and malformed stored records return safe errors', () => {
  const root = tempRoot();
  const manager = new HistorySessionManager({ rootDir: root, limits: { maxWindowBytes: 1 }, streamFactory: finiteFactory({ pod: [{ timestamp: null, message: 'record', bytes: 7 }] }, []) });
  const started = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(started.session);
  started.session.start();
  assert.deepEqual(started.session.readWindow(undefined, 'forward', 1), { error: 'History record exceeds the storage read limit.' });
  manager.close();
  rmSync(root, { recursive: true, force: true });

  const malformedRoot = tempRoot();
  const malformedManager = new HistorySessionManager({ rootDir: malformedRoot, streamFactory: finiteFactory({ pod: [{ timestamp: null, message: 'record', bytes: 7 }] }, []) });
  const malformed = malformedManager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(malformed.session);
  malformed.session.start();
  const sessionDirectory = readdirSync(malformedRoot).find((name) => name.startsWith('session-'));
  assert.ok(sessionDirectory);
  const dataFile = readdirSync(path.join(malformedRoot, sessionDirectory!)).find((name) => name.startsWith('source-'));
  assert.ok(dataFile);
  writeFileSync(path.join(malformedRoot, sessionDirectory!, dataFile!), 'not-json\n');
  assert.deepEqual(malformed.session.readWindow(undefined, 'forward', 1), { error: 'History snapshot storage is invalid.' });
  malformedManager.close();
  rmSync(malformedRoot, { recursive: true, force: true });
});

test('adaptive windows return the largest fitting forward and backward ranges with exact boundaries', () => {
  const pageSource = source('cluster-a');
  const sourceKey = Buffer.from(JSON.stringify([pageSource.cluster, pageSource.namespace, pageSource.pod, pageSource.container])).toString('base64url');
  const firstRecordBytes = Buffer.byteLength(`${JSON.stringify({ sourceKey, source: pageSource, sequence: 1, timestamp: null, message: 'same-size', bytes: 9 })}\n`, 'utf8');
  const root = tempRoot();
  const manager = new HistorySessionManager({
    rootDir: root,
    limits: { maxWindowBytes: firstRecordBytes },
    streamFactory: finiteFactory({ pod: [
      { timestamp: null, message: 'same-size', bytes: 9 },
      { timestamp: null, message: 'same-size', bytes: 9 },
      { timestamp: null, message: 'same-size', bytes: 9 },
    ] }, []),
  });
  const started = manager.start(input([pageSource]), () => undefined);
  assert.ok(started.session);
  started.session.start();

  const forward = started.session.readWindow(undefined, 'forward', 3);
  assert.ok(!('error' in forward));
  if ('error' in forward) return;
  assert.deepEqual(forward.records.map((record) => record.sequence), [1]);
  assert.deepEqual({ startLine: forward.startLine, endLine: forward.endLine, hasMoreBefore: forward.hasMoreBefore, hasMoreAfter: forward.hasMoreAfter }, { startLine: 0, endLine: 1, hasMoreBefore: false, hasMoreAfter: true });

  const backward = started.session.readWindow({ sourceKey: forward.sourceKey, line: 3 }, 'backward', 3);
  assert.ok(!('error' in backward));
  if ('error' in backward) return;
  assert.deepEqual(backward.records.map((record) => record.sequence), [3]);
  assert.deepEqual({ startLine: backward.startLine, endLine: backward.endLine, hasMoreBefore: backward.hasMoreBefore, hasMoreAfter: backward.hasMoreAfter }, { startLine: 2, endLine: 3, hasMoreBefore: true, hasMoreAfter: false });
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('multi-source history requires explicit source cursors and returns every source window', () => {
  const root = tempRoot();
  const sources = [source('cluster-a', 'pod-a'), source('cluster-b', 'pod-b')];
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: finiteFactory({ 'pod-a': [{ timestamp: null, message: 'a', bytes: 1 }], 'pod-b': [{ timestamp: null, message: 'b', bytes: 1 }] }, []) });
  const started = manager.start(input(sources), () => undefined);
  assert.ok(started.session);
  started.session.start();
  assert.deepEqual(started.session.readWindow(undefined, 'forward', 10), { error: 'History source cursor is required for multiple sources.' });
  const windows = sources.map((item) => {
    const key = Buffer.from(JSON.stringify([item.cluster, item.namespace, item.pod, item.container])).toString('base64url');
    const window = started.session!.readWindow({ sourceKey: key, line: 0 }, 'forward', 10);
    assert.ok(!('error' in window));
    return window;
  });
  if (windows.some((window) => 'error' in window)) return;
  assert.deepEqual(windows.map((window) => window.records[0].message), ['a', 'b']);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('decoded page memory limits accept the exact envelope, release after each read, and reject overages safely', () => {
  const pageSource = source('cluster-a');
  const sourceKey = Buffer.from(JSON.stringify([pageSource.cluster, pageSource.namespace, pageSource.pod, pageSource.container])).toString('base64url');
  const encodedRecordBytes = Buffer.byteLength(`${JSON.stringify({ sourceKey, source: pageSource, sequence: 1, timestamp: null, message: 'record', bytes: 7 })}\n`, 'utf8');
  const pageMemoryBytes = encodedRecordBytes * 3 + 256;
  const root = tempRoot();
  const manager = new HistorySessionManager({
    rootDir: root,
    limits: { maxInFlightDecodedBytesPerSource: pageMemoryBytes, maxInFlightDecodedBytesPerSession: pageMemoryBytes },
    streamFactory: finiteFactory({ pod: [
      { timestamp: null, message: 'record', bytes: 7 },
      { timestamp: null, message: 'record', bytes: 7 },
    ] }, []),
  });
  const started = manager.start(input([pageSource]), () => undefined);
  assert.ok(started.session);
  started.session.start();
  const first = started.session.readWindow(undefined, 'forward', 1);
  assert.ok(!('error' in first));
  if ('error' in first) return;
  const second = started.session.readWindow({ sourceKey: first.sourceKey, line: 1 }, 'forward', 1);
  assert.ok(!('error' in second));
  manager.close();
  rmSync(root, { recursive: true, force: true });

  const overSourceRoot = tempRoot();
  const overSourceManager = new HistorySessionManager({
    rootDir: overSourceRoot,
    limits: { maxInFlightDecodedBytesPerSource: pageMemoryBytes - 1, maxInFlightDecodedBytesPerSession: pageMemoryBytes },
    streamFactory: finiteFactory({ pod: [{ timestamp: null, message: 'record', bytes: 7 }] }, []),
  });
  const overSource = overSourceManager.start(input([pageSource]), () => undefined);
  assert.ok(overSource.session);
  overSource.session.start();
  assert.deepEqual(overSource.session.readWindow(undefined, 'forward', 1), { error: 'History page exceeds the in-flight decoded memory limit.' });
  overSourceManager.close();
  rmSync(overSourceRoot, { recursive: true, force: true });

  const overSessionRoot = tempRoot();
  const overSessionManager = new HistorySessionManager({
    rootDir: overSessionRoot,
    limits: { maxInFlightDecodedBytesPerSource: pageMemoryBytes, maxInFlightDecodedBytesPerSession: pageMemoryBytes - 1 },
    streamFactory: finiteFactory({ pod: [{ timestamp: null, message: 'record', bytes: 7 }] }, []),
  });
  const overSession = overSessionManager.start(input([pageSource]), () => undefined);
  assert.ok(overSession.session);
  overSession.session.start();
  assert.deepEqual(overSession.session.readWindow(undefined, 'forward', 1), { error: 'History page exceeds the in-flight decoded memory limit.' });
  overSessionManager.close();
  rmSync(overSessionRoot, { recursive: true, force: true });
});

test('history storage setup failures are sanitized', () => {
  const root = tempRoot();
  const invalidRoot = path.join(root, 'root-file');
  writeFileSync(invalidRoot, 'not a directory');
  const manager = new HistorySessionManager({ rootDir: invalidRoot, streamFactory: finiteFactory({ pod: [] }, []) });
  assert.deepEqual(manager.start(input([source('cluster-a')]), () => undefined), { error: 'Could not start history session.' });
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('cancellation is idempotent, stops the source, cleans storage, and rejects windows', () => {
  const root = tempRoot();
  const callbacks = new Map<string, StructuredLogCallbacks>();
  let stops = 0;
  const manager = new HistorySessionManager({ rootDir: root, streamFactory: (options, sourceCallbacks) => {
    callbacks.set(options.pod, sourceCallbacks);
    return { stop: () => { stops += 1; } };
  } });
  const events: AggregateLogEvent[] = [];
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  callbacks.get('pod')?.onLine({ timestamp: null, message: 'before cancel', bytes: 13 });
  started.session.cancel();
  started.session.cancel();
  assert.equal(terminal(events).status, 'cancelled');
  assert.equal(stops, 1);
  assert.deepEqual(started.session.readWindow(undefined, 'forward', 10), { error: 'History session was cancelled.' });
  assert.equal(readdirSync(root).filter((name) => name.startsWith('session-')).length, 0);
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('TTL, orphan cleanup, stale generations, and cursors are bounded and safe', () => {
  const root = tempRoot();
  const orphan = path.join(root, 'session-orphan');
  const orphanFile = path.join(orphan, 'secret.ndjson');
  mkdirSyncForTest(orphan, orphanFile);
  const old = new Date(0);
  utimesSync(orphan, old, old);
  assert.equal(cleanupOrphanedHistorySessions(root, 100, () => 1_000), 1);

  let now = 0;
  const manager = new HistorySessionManager({ rootDir: root, now: () => now, limits: { ttlMs: 10 }, streamFactory: finiteFactory({ pod: [] }, []) });
  const events: AggregateLogEvent[] = [];
  const started = manager.start(input([source('cluster-a')]), (event) => events.push(event));
  assert.ok(started.session);
  started.session.start();
  const wrongGeneration = manager.get(started.session.sessionId, started.session.generation + 1);
  assert.deepEqual(wrongGeneration, { error: 'History generation is stale.' });
  const wrongCursor = started.session.readWindow({ sourceKey: 'missing', line: 0 }, 'forward', 10);
  assert.deepEqual(wrongCursor, { error: 'History cursor is invalid.' });
  now = 11;
  manager.cleanupExpired();
  assert.deepEqual(started.session.readWindow(undefined, 'forward', 10), { error: 'History session expired.' });
  assert.equal(terminal(events).status, 'expired');
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('history session capacity prevents untracked concurrent sessions', () => {
  const root = tempRoot();
  const manager = new HistorySessionManager({ rootDir: root, limits: { maxConcurrentSessions: 1 }, streamFactory: (_options, _callbacks) => ({ stop: () => undefined }) });
  const first = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(first.session);
  first.session.start();
  assert.deepEqual(manager.start(input([source('cluster-b')]), () => undefined), { error: 'History capacity is currently full.' });
  manager.close();
  rmSync(root, { recursive: true, force: true });
});

test('completed sessions remain readable without consuming concurrent capacity', () => {
  const root = tempRoot();
  const manager = new HistorySessionManager({ rootDir: root, limits: { maxConcurrentSessions: 2 }, streamFactory: finiteFactory({ pod: [] }, []) });
  const first = manager.start(input([source('cluster-a')]), () => undefined);
  assert.ok(first.session);
  first.session.start();
  const second = manager.start(input([source('cluster-b')]), () => undefined);
  assert.ok(second.session);
  second.session.start();
  assert.equal(first.session.isTerminal, true);
  assert.equal(second.session.isTerminal, true);

  const third = manager.start(input([source('cluster-c')]), () => undefined);
  assert.ok(third.session);
  assert.equal(manager.get(first.session.sessionId, first.session.generation), first.session);
  third.session.start();

  manager.close();
  rmSync(root, { recursive: true, force: true });
});

function mkdirSyncForTest(directory: string, file: string): void {
  mkdirSync(directory, { mode: 0o700 });
  writeFileSync(file, 'private');
}
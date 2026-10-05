import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import {
  createLogLineParser,
  parseLogLine,
  parseTimestampedLine,
  streamStructuredPodLogs,
  type LogStreamClientFactory,
  type StructuredLogCallbacks,
} from './logsService.js';

/**
 * Test seam: a fake log client that hands the opened PassThrough back to the
 * caller so a post-open error or inactivity can be driven without a cluster.
 */
function fakeLogClient(onStream: (stream: PassThrough) => void): LogStreamClientFactory {
  return () => ({
    log: async (_namespace, _pod, _container, stream) => {
      queueMicrotask(() => onStream(stream));
      return new AbortController();
    },
  });
}

function collect(): { callbacks: StructuredLogCallbacks; errors: string[]; ends: string[]; lineCount: () => number } {
  const errors: string[] = [];
  const ends: string[] = [];
  let lines = 0;
  return {
    errors,
    ends,
    lineCount: () => lines,
    callbacks: {
      onLine: () => { lines += 1; return true; },
      onError: (message) => errors.push(message),
      onEnd: (reason) => ends.push(reason),
    },
  };
}

test('parseTimestampedLine removes the Kubernetes timestamp and normalizes UTC', () => {
  assert.deepEqual(parseTimestampedLine('2026-09-16T10:00:00.123456Z cafe'), {
    timestamp: '2026-09-16T10:00:00.123Z',
    message: 'cafe',
  });
});

test('parseLogLine includes from and excludes to', () => {
  const range = { from: '2026-09-16T10:00:00.000Z', to: '2026-09-16T11:00:00.000Z' };
  assert.equal(parseLogLine('2026-09-16T10:00:00Z first', range).kind, 'emit');
  assert.equal(parseLogLine('2026-09-16T10:59:59.999Z last', range).kind, 'emit');
  assert.equal(parseLogLine('2026-09-16T11:00:00Z boundary', range).kind, 'to-reached');
});

test('parseLogLine preserves unparseable lines only without a time boundary', () => {
  assert.deepEqual(parseLogLine('legacy message'), {
    kind: 'emit',
    record: { timestamp: null, message: 'legacy message', bytes: 15 },
  });
  assert.deepEqual(parseLogLine('legacy message', { from: '2026-09-16T10:00:00Z' }), { kind: 'drop' });
});

test('createLogLineParser retains partial lines and split UTF-8 characters', () => {
  const parser = createLogLineParser();
  const input = Buffer.from('2026-09-16T10:00:00Z café\nnext');
  const split = input.indexOf(0xc3) + 1;
  assert.deepEqual(parser.push(input.subarray(0, split)), []);
  assert.deepEqual(parser.push(input.subarray(split)), ['2026-09-16T10:00:00Z café']);
  assert.deepEqual(parser.end(), ['next']);
});

test('createLogLineParser rejects an oversized unterminated line before retaining it', () => {
  const parser = createLogLineParser(4);
  assert.throws(() => parser.push(Buffer.from('12345')), /record-size/);
});

test('streamStructuredPodLogs routes a post-open stream error to onError exactly once', async () => {
  const sink = collect();
  const factory = fakeLogClient((stream) => {
    stream.emit('error', new Error('socket hang up'));
    // A second error after the first must not re-report.
    stream.emit('error', new Error('socket hang up again'));
  });
  streamStructuredPodLogs(
    { cluster: 'c', namespace: 'n', pod: 'p', container: 'app', follow: true, logClientFactory: factory },
    sink.callbacks,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sink.errors.length, 1);
  assert.equal(sink.ends.length, 0);
});

test('streamStructuredPodLogs ends cleanly on inactivity expiry without throwing', async () => {
  const sink = collect();
  const factory = fakeLogClient(() => undefined); // open but never emit data
  streamStructuredPodLogs(
    { cluster: 'c', namespace: 'n', pod: 'p', container: 'app', follow: true, inactivityMs: 20, logClientFactory: factory },
    sink.callbacks,
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(sink.ends, ['cancelled']);
  assert.equal(sink.errors.length, 0);
});

test('streamStructuredPodLogs resets the inactivity timer on each data chunk', async () => {
  const sink = collect();
  const factory = fakeLogClient((stream) => {
    // Two chunks spaced under the deadline keep the stream alive past it.
    stream.write(Buffer.from('2026-09-16T10:00:00Z one\n'));
    setTimeout(() => stream.write(Buffer.from('2026-09-16T10:00:01Z two\n')), 25);
  });
  streamStructuredPodLogs(
    { cluster: 'c', namespace: 'n', pod: 'p', container: 'app', follow: true, inactivityMs: 40, logClientFactory: factory },
    sink.callbacks,
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(sink.ends.length, 0, 'timer should have been reset by the second chunk');
  assert.ok(sink.lineCount() >= 1);
});
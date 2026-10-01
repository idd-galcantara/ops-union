import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceLiveLogEvent } from './logsLiveSession';
import type { LogLimits, LogSource } from './types';

const limits: LogLimits = { maxLinesPerSource: 10, maxBytesPerSource: 100, maxLinesTotal: 2, maxBytesTotal: 100 };
const source: LogSource = { sourceId: 'source', cluster: 'cluster', namespace: 'namespace', pod: 'pod', container: 'app' };
const initial = { events: [], sourceStates: new Map(), acceptedLimits: limits, state: 'streaming' as const };

test('live reduction preserves source isolation and the aggregate line bound', () => {
  const started = reduceLiveLogEvent(initial, { type: 'sourceStarted', source, counters: { emittedLines: 0, emittedBytes: 0, droppedLines: 0 } }, [source], false).state;
  const first = reduceLiveLogEvent(started, { type: 'line', sourceId: source.sourceId, sequence: 1, timestamp: null, message: 'first', bytes: 5 }, [source], false).state;
  const second = reduceLiveLogEvent(first, { type: 'line', sourceId: source.sourceId, sequence: 2, timestamp: null, message: 'second', bytes: 6 }, [source], false).state;
  const bounded = reduceLiveLogEvent(second, { type: 'line', sourceId: source.sourceId, sequence: 3, timestamp: null, message: 'third', bytes: 5 }, [source], false).state;
  assert.deepEqual(bounded.events.map((item) => item.event.message), ['second', 'third']);
  assert.equal(reduceLiveLogEvent(bounded, { type: 'line', sourceId: 'missing', sequence: 4, timestamp: null, message: 'ignored', bytes: 6 }, [source], false).state.events.length, 2);
});

test('live reduction keeps partial terminal status and marks transport completion', () => {
  const partial = reduceLiveLogEvent(initial, { type: 'sourceError', source, message: 'failed', counters: { emittedLines: 0, emittedBytes: 0, droppedLines: 1 }, status: 'error' }, [source], false).state;
  const result = reduceLiveLogEvent(partial, { type: 'summary', sources: [{ source, counters: { emittedLines: 0, emittedBytes: 0, droppedLines: 1 }, status: 'error' }], limits, reason: 'all-failed' }, [source], false);
  assert.equal(result.operationComplete, true);
  assert.equal(result.state.state, 'partial');
  assert.equal(result.state.summaryReason, 'all-failed');
});
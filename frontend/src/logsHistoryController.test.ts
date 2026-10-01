import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistoryController, type HistoryQueryRuntime, type HistoryRuntime } from './logsHistoryController';

test('history controller guards identity and de-duplicates window requests', () => {
  const previousWebSocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: { OPEN: 1 } });
  try {
    const sent: string[] = [];
    const socket = { readyState: 1, send: (message: string) => sent.push(message) } as unknown as WebSocket;
    const historyRuntime: HistoryRuntime = { identity: { sessionId: 'session', snapshotId: 'snapshot', generation: 4 }, requested: new Set(), pending: new Map(), sourceProgress: [], terminal: true };
    const historyQueryRuntime: HistoryQueryRuntime = { retiredQueryIds: new Set(), requested: new Set(), pending: new Map() };
    const controller = createHistoryController({
      socket,
      historyRuntime,
      historyQueryRuntime,
      setHistoryWindowLoading: () => undefined,
      setHistoryWindowError: () => undefined,
      setHistoryWindowRetryRequests: () => undefined,
      setHistoryQueryRetryRequests: () => undefined,
      setHistoryQuery: () => undefined,
      setHistoryQueryCache: () => undefined,
      resetHistoryQueryReadyRequest: () => undefined,
    });
    assert.equal(controller.isCurrentEvent({ sessionId: 'session', snapshotId: 'snapshot', generation: 4 }), true);
    assert.equal(controller.isCurrentEvent({ sessionId: 'session', snapshotId: 'snapshot', generation: 3 }), false);
    controller.requestWindow('source-key', 0, 'forward');
    controller.requestWindow('source-key', 0, 'forward');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0]), { type: 'history.window', sessionId: 'session', generation: 4, cursor: { sourceKey: 'source-key', line: 0 }, direction: 'forward', limit: 500 });
    assert.deepEqual(historyRuntime.pending.get('source-key:0:forward'), { sourceKey: 'source-key', line: 0, direction: 'forward' });
  } finally {
    if (previousWebSocket) Object.defineProperty(globalThis, 'WebSocket', previousWebSocket);
    else Reflect.deleteProperty(globalThis, 'WebSocket');
  }
});
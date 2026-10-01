import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { test } from 'node:test';
import WebSocket from 'ws';
import { HistorySessionManager } from './historySession.js';
import { attachLogsWebSocket } from './logsWebSocket.js';
import type { AggregateLogEvent, LogSource } from './logsTypes.js';

const source: LogSource = { sourceId: 'source', cluster: 'cluster', namespace: 'namespace', pod: 'pod', container: 'app' };

test('aggregate WebSocket carries one validated history lifecycle and rejects stale windows', async () => {
  const manager = new HistorySessionManager({
    streamFactory: (_options, callbacks) => {
      callbacks.onLine({ timestamp: '2026-09-16T10:00:00.000Z', message: 'history line', bytes: 13 });
      callbacks.onEnd('eof');
      return { stop: () => undefined };
    },
  });
  const server = createServer();
  const wss = attachLogsWebSocket(server, { historyManager: manager });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const messages: AggregateLogEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`);
  const waiters: Array<{ predicate: (event: AggregateLogEvent) => boolean; resolve: (event: AggregateLogEvent) => void; reject: (error: Error) => void }> = [];
  socket.on('message', (data) => {
    const event = JSON.parse(data.toString()) as AggregateLogEvent;
    messages.push(event);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].predicate(event)) {
        const waiter = waiters.splice(index, 1)[0];
        waiter.resolve(event);
      }
    }
  });
  const waitFor = (predicate: (event: AggregateLogEvent) => boolean): Promise<AggregateLogEvent> => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      waiters.push({ predicate, resolve, reject });
      setTimeout(() => {
        const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) {
          waiters.splice(index, 1);
          reject(new Error('Timed out waiting for WebSocket event.'));
        }
      }, 1_000);
    });
  };
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.send(JSON.stringify({ type: 'history.start', requestId: 'request-1', generation: 42, sources: [source] }));
  const accepted = await waitFor((event) => event.type === 'history.accepted') as Extract<AggregateLogEvent, { type: 'history.accepted' }>;
  const terminal = await waitFor((event) => event.type === 'history.terminal') as Extract<AggregateLogEvent, { type: 'history.terminal' }>;
  assert.equal(accepted.sourceCount, 1);
  assert.equal(terminal.status, 'complete');
  assert.ok(messages.some((event) => event.type === 'history.progress'));

  socket.send(JSON.stringify({ type: 'history.window', sessionId: accepted.sessionId, generation: accepted.generation, limit: 10 }));
  const window = await waitFor((event) => event.type === 'history.window') as Extract<AggregateLogEvent, { type: 'history.window' }>;
  assert.equal(window.records[0].message, 'history line');
  socket.send(JSON.stringify({ type: 'history.query.start', sessionId: accepted.sessionId, generation: accepted.generation, filters: { pod: 'pod', container: '', cluster: '', namespace: '', text: 'history' } }));
  const queryReady = await waitFor((event) => event.type === 'history.query.ready') as Extract<AggregateLogEvent, { type: 'history.query.ready' }>;
  assert.equal(queryReady.totalMatches, 1);
  socket.send(JSON.stringify({ type: 'history.query.window', sessionId: accepted.sessionId, generation: accepted.generation, queryId: queryReady.queryId, offset: 0, limit: 10 }));
  const queryWindow = await waitFor((event) => event.type === 'history.query.window') as Extract<AggregateLogEvent, { type: 'history.query.window' }>;
  assert.equal(queryWindow.records[0].message, 'history line');
  socket.send(JSON.stringify({ type: 'history.window', sessionId: accepted.sessionId, generation: accepted.generation + 1, limit: 10 }));
  const stale = await waitFor((event) => event.type === 'error') as Extract<AggregateLogEvent, { type: 'error' }>;
  assert.equal(stale.message, 'History generation is stale.');

  socket.close();
  await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  wss.close();
  manager.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('aggregate WebSocket splits oversized filtered history windows to fit the frame limit', async () => {
  const manager = new HistorySessionManager({
    limits: { maxFrameBytes: 1024 },
    streamFactory: (_options, callbacks) => {
      callbacks.onLine({ timestamp: '2026-09-16T10:00:00.000Z', message: 'x'.repeat(250), bytes: 250 });
      callbacks.onLine({ timestamp: '2026-09-16T10:01:00.000Z', message: 'x'.repeat(250), bytes: 250 });
      callbacks.onEnd('eof');
      return { stop: () => undefined };
    },
  });
  const server = createServer();
  const wss = attachLogsWebSocket(server, { historyManager: manager });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const messages: AggregateLogEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`);
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as AggregateLogEvent));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const waitFor = (predicate: (event: AggregateLogEvent) => boolean): Promise<AggregateLogEvent> => new Promise((resolve, reject) => {
    const existing = messages.find(predicate);
    if (existing) {
      resolve(existing);
      return;
    }
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for WebSocket event.')), 1_000);
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as AggregateLogEvent;
      if (!predicate(event)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(event);
    };
    socket.on('message', onMessage);
  });

  socket.send(JSON.stringify({ type: 'history.start', requestId: 'request-1', generation: 1, sources: [source] }));
  const accepted = await waitFor((event) => event.type === 'history.accepted') as Extract<AggregateLogEvent, { type: 'history.accepted' }>;
  await waitFor((event) => event.type === 'history.terminal');
  socket.send(JSON.stringify({ type: 'history.query.start', sessionId: accepted.sessionId, generation: accepted.generation, filters: { pod: 'pod', container: '', cluster: '', namespace: '', text: 'x' } }));
  const ready = await waitFor((event) => event.type === 'history.query.ready') as Extract<AggregateLogEvent, { type: 'history.query.ready' }>;
  socket.send(JSON.stringify({ type: 'history.query.window', sessionId: accepted.sessionId, generation: accepted.generation, queryId: ready.queryId, offset: 0, limit: 10 }));
  const window = await waitFor((event) => event.type === 'history.query.window') as Extract<AggregateLogEvent, { type: 'history.query.window' }>;
  assert.ok(window.records.length < 2);
  assert.ok(Buffer.byteLength(JSON.stringify(window), 'utf8') <= 1024);

  socket.close();
  await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  wss.close();
  manager.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('aggregate WebSocket applies the manager frame limit to protocol input and output', async () => {
  const manager = new HistorySessionManager({
    limits: { maxFrameBytes: 256 },
    streamFactory: (_options, callbacks) => {
      callbacks.onEnd('eof');
      return { stop: () => undefined };
    },
  });
  const server = createServer();
  const wss = attachLogsWebSocket(server, { historyManager: manager });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`);
  const messages: AggregateLogEvent[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as AggregateLogEvent));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  socket.send(JSON.stringify({ type: 'subscribe', sources: [{ ...source, sourceId: 'x'.repeat(300) }] }));
  const inputError = await new Promise<Extract<AggregateLogEvent, { type: 'error' }>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for protocol error.')), 1_000);
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as AggregateLogEvent;
      if (event.type === 'error') {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(event);
      }
    };
    socket.on('message', onMessage);
  });
  assert.equal(inputError.message, 'The protocol message is too large.');

  await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.equal(manager.limits.maxFrameBytes, 256);
});

test('aggregate WebSocket applies the manager frame limit when sending history events', async () => {
  const manager = new HistorySessionManager({
    limits: { maxFrameBytes: 256 },
    streamFactory: (_options, callbacks) => {
      callbacks.onEnd('eof');
      return { stop: () => undefined };
    },
  });
  const server = createServer();
  const wss = attachLogsWebSocket(server, { historyManager: manager });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`);
  const messages: AggregateLogEvent[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as AggregateLogEvent));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ type: 'history.start', requestId: 'request-1', generation: 1, sources: [source] }));

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for history frame error.')), 1_000);
    const onMessage = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as AggregateLogEvent;
      if (event.type === 'error' && event.message === 'The history response exceeds the transport limit.') {
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve();
      }
    };
    socket.on('message', onMessage);
  });
  assert.equal(messages.some((event) => event.type === 'history.accepted'), true);

  socket.close();
  await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('closing the HTTP server cleans history sessions attached to its WebSocket endpoint', async () => {
  const manager = new HistorySessionManager({
    streamFactory: (_options, _callbacks) => ({ stop: () => undefined }),
  });
  const server = createServer();
  const wss = attachLogsWebSocket(server, { historyManager: manager });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const started = manager.start({ requestId: 'request-1', generation: 1, sources: [source] }, () => undefined);
  assert.ok(started.session);
  started.session.start();
  assert.equal(started.session.isTerminal, false);

  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.equal(started.session.isCleaned, true);
});

test('malformed legacy URI segments are rejected without taking down health', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"status":"ok"}');
      return;
    }
    response.writeHead(404);
    response.end();
  });
  attachLogsWebSocket(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await new Promise<string>((resolve) => {
    const socket = connect(address.port, '127.0.0.1', () => {
      socket.end(`GET /api/pods/%E0%A4/%6E/pod/logs?container=app HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('close', () => resolve(data));
  });
  assert.match(response, /^HTTP\/1\.1 400 Bad Request/);
  const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(health.status, 200);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('configured WebSocket policy rejects arbitrary origins and accepts the capability', async () => {
  const server = createServer();
  const wss = attachLogsWebSocket(server, { policy: { allowedOrigins: ['http://127.0.0.1'], capability: 'capability' } });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const rejected = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`, { headers: { Origin: 'https://untrusted.example', 'x-ops-union-capability': 'capability' } });
  rejected.once('error', () => undefined);
  await new Promise<void>((resolve) => rejected.once('close', resolve));
  const accepted = new WebSocket(`ws://127.0.0.1:${address.port}/api/logs`, { headers: { Origin: 'http://127.0.0.1', 'x-ops-union-capability': 'capability' } });
  await new Promise<void>((resolve, reject) => { accepted.once('open', resolve); accepted.once('error', reject); });
  accepted.close();
  await new Promise<void>((resolve) => accepted.once('close', resolve));
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
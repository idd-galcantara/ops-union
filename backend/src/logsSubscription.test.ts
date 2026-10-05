import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StructuredLogCallbacks, StructuredLogLine } from './kube/logsService.js';
import { validateSubscription } from './logsProtocol.js';
import { startLogSubscription, type SubscriptionStreamFactory } from './logsSubscription.js';
import type { AggregateLogEvent } from './logsTypes.js';

const source = (sourceId: string, pod = sourceId) => ({ sourceId, cluster: 'cluster', namespace: 'namespace', pod, container: 'app' });

function subscription(overrides: Record<string, unknown> = {}) {
  const result = validateSubscription({ type: 'subscribe', sources: [source('a'), source('b')], follow: false, ...overrides });
  assert.ok('subscription' in result);
  if (!('subscription' in result)) throw new Error(result.error);
  return result.subscription;
}

test('startLogSubscription interleaves lines and isolates source errors', async () => {
  const callbacks = new Map<string, StructuredLogCallbacks>();
  const factory: SubscriptionStreamFactory = (options, sourceCallbacks) => {
    callbacks.set(options.pod, sourceCallbacks);
    return { stop: () => undefined };
  };
  const events: AggregateLogEvent[] = [];
  const running = startLogSubscription(subscription(), (event) => events.push(event), factory);
  const first: StructuredLogLine = { timestamp: '2026-09-16T10:00:00.000Z', message: 'one', bytes: 4 };
  callbacks.get('a')?.onLine(first);
  callbacks.get('b')?.onError('not found');
  callbacks.get('a')?.onEnd('eof');
  await running.completion;

  assert.deepEqual(events.filter((event) => event.type === 'line').map((event) => event.sourceId), ['a']);
  assert.equal(events.filter((event) => event.type === 'sourceError').length, 1);
  assert.equal(events.at(-1)?.type, 'summary');
  assert.equal((events.at(-1) as Extract<AggregateLogEvent, { type: 'summary' }>).reason, 'completed');
});

test('startLogSubscription stops every source before an aggregate byte limit is exceeded', async () => {
  const callbacks: StructuredLogCallbacks[] = [];
  let stopped = 0;
  const factory: SubscriptionStreamFactory = (_options, sourceCallbacks) => {
    callbacks.push(sourceCallbacks);
    return { stop: () => { stopped += 1; } };
  };
  const events: AggregateLogEvent[] = [];
  const running = startLogSubscription(
    subscription({ limits: { maxBytesTotal: 5 }}),
    (event) => events.push(event),
    factory,
  );
  callbacks[0].onLine({ timestamp: null, message: '1234', bytes: 5 });
  callbacks[1].onLine({ timestamp: null, message: 'x', bytes: 2 });
  await running.completion;

  assert.equal(stopped, 2);
  assert.equal((events.at(-1) as Extract<AggregateLogEvent, { type: 'summary' }>).reason, 'aggregate-limit');
  assert.equal(events.filter((event) => event.type === 'line').length, 1);
});

test('cancel stops handles created before and during disconnect', async () => {
  const stops: string[] = [];
  const factory: SubscriptionStreamFactory = (options) => ({ stop: () => stops.push(options.pod) });
  const running = startLogSubscription(subscription(), () => undefined, factory);
  running.cancel();
  await running.completion;
  assert.deepEqual(stops.sort(), ['a', 'b']);
});

test('a post-open stream error on one source does not abort siblings', async () => {
  const callbacks = new Map<string, StructuredLogCallbacks>();
  const factory: SubscriptionStreamFactory = (options, sourceCallbacks) => {
    callbacks.set(options.pod, sourceCallbacks);
    return { stop: () => undefined };
  };
  const events: AggregateLogEvent[] = [];
  const running = startLogSubscription(subscription(), (event) => events.push(event), factory);
  // Source 'a' fails after opening; 'b' keeps streaming and ends cleanly.
  callbacks.get('a')?.onError('stream reset');
  callbacks.get('b')?.onLine({ timestamp: null, message: 'alive', bytes: 6 });
  callbacks.get('b')?.onEnd('eof');
  await running.completion;

  assert.equal(events.filter((event) => event.type === 'sourceError').length, 1);
  assert.deepEqual(events.filter((event) => event.type === 'line').map((event) => event.sourceId), ['b']);
  assert.equal(events.filter((event) => event.type === 'sourceEnded').length, 1);
  assert.equal(events.at(-1)?.type, 'summary');
});

test('bounded pump never exceeds the active-read cap and starts queued sources after a terminal', async () => {
  const live = new Map<string, StructuredLogCallbacks>();
  let activeStarts = 0;
  let maxConcurrent = 0;
  const sources = Array.from({ length: 6 }, (_unused, index) => source(`s${index}`, `pod${index}`));
  const factory: SubscriptionStreamFactory = (options, sourceCallbacks) => {
    live.set(options.pod, sourceCallbacks);
    activeStarts += 1;
    maxConcurrent = Math.max(maxConcurrent, activeStarts);
    return { stop: () => undefined };
  };
  const events: AggregateLogEvent[] = [];
  const running = startLogSubscription(
    subscription({ sources, follow: true }),
    (event) => events.push(event),
    factory,
    { limits: { maxActiveSourceReads: 2 } },
  );

  // With a bound of 2, only the first two sources open before any terminal.
  assert.equal(live.size, 2);
  assert.equal(maxConcurrent, 2);

  // Ending one open source frees a slot; exactly one queued source then starts.
  const firstPod = [...live.keys()][0];
  activeStarts -= 1;
  live.get(firstPod)?.onEnd('eof');
  assert.equal(live.size, 3);
  assert.ok(maxConcurrent <= 2);

  // Drain the rest so the subscription completes.
  for (const pod of [...live.keys()]) {
    if (pod === firstPod) continue;
    activeStarts -= 1;
    live.get(pod)?.onEnd('eof');
  }
  // Keep draining newly-started sources until all six have run.
  while (events.filter((event) => event.type === 'sourceEnded').length < sources.length) {
    for (const [pod, cb] of [...live.entries()]) {
      if (events.some((event) => event.type === 'sourceEnded' && event.source.pod === pod)) continue;
      activeStarts -= 1;
      cb.onEnd('eof');
    }
  }
  await running.completion;

  assert.ok(maxConcurrent <= 2);
  // sourceStarted emitted exactly once per source, for every source.
  const started = events.filter((event) => event.type === 'sourceStarted').map((event) => event.source.pod);
  assert.equal(started.length, sources.length);
  assert.equal(new Set(started).size, sources.length);
});

test('the per-connection stream cap bounds how many sources are scheduled', async () => {
  const sources = Array.from({ length: 5 }, (_unused, index) => source(`s${index}`, `pod${index}`));
  const started: string[] = [];
  const factory: SubscriptionStreamFactory = (options) => {
    started.push(options.pod);
    return { stop: () => undefined };
  };
  const events: AggregateLogEvent[] = [];
  startLogSubscription(
    subscription({ sources, follow: true }),
    (event) => events.push(event),
    factory,
    { limits: { maxStreamsPerConnection: 3, maxActiveSourceReads: 8 } },
  );
  // Only 3 sources are admitted, so only 3 ever start or report sourceStarted.
  assert.equal(started.length, 3);
  assert.equal(events.filter((event) => event.type === 'sourceStarted').length, 3);
});

test('in-flight backpressure pauses a source that floods past the per-source cap', async () => {
  let sourceCallbacks: StructuredLogCallbacks | undefined;
  const factory: SubscriptionStreamFactory = (_options, callbacks) => {
    sourceCallbacks = callbacks;
    return { stop: () => undefined };
  };
  const events: AggregateLogEvent[] = [];
  startLogSubscription(
    subscription({ sources: [source('a')], follow: true }),
    (event) => events.push(event),
    factory,
    { limits: { maxInFlightBytesPerSource: 10 } },
  );
  assert.ok(sourceCallbacks);
  // Synchronous flood within one chunk: the third line exceeds the 10-byte cap
  // before the microtask drain runs, so onLine returns false (backpressure).
  const accepted = [
    sourceCallbacks!.onLine({ timestamp: null, message: 'aaaa', bytes: 4 }),
    sourceCallbacks!.onLine({ timestamp: null, message: 'bbbb', bytes: 4 }),
    sourceCallbacks!.onLine({ timestamp: null, message: 'cccc', bytes: 4 }),
  ];
  assert.deepEqual(accepted, [true, true, false]);
  assert.equal(events.filter((event) => event.type === 'line').length, 2);
});

test('source startup errors are sanitized and remain source-scoped', async () => {
  const events: AggregateLogEvent[] = [];
  const running = startLogSubscription(
    subscription({ sources: [source('a')] }),
    (event) => events.push(event),
    () => {
      throw { code: 500, message: 'HTTP-Code: 500\nMessage: Error\nBody: secret\nHeaders: authorization' };
    },
  );
  await running.completion;
  const error = events.find((event) => event.type === 'sourceError');
  assert.equal(error?.type, 'sourceError');
  if (error?.type === 'sourceError') {
    assert.ok(!error.message.includes('secret'));
    assert.ok(!error.message.includes('authorization'));
  }
});
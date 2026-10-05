import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReconnectPolicy, DEFAULT_RECONNECT_CONFIG, shouldReconnect } from './logsReconnect';

test('backoff grows geometrically from the base delay', () => {
  const policy = createReconnectPolicy({ baseMs: 500, factor: 2, maxDelayMs: 10_000, maxAttempts: 6 });
  assert.equal(policy.nextDelay(), 500);
  assert.equal(policy.nextDelay(), 1000);
  assert.equal(policy.nextDelay(), 2000);
  assert.equal(policy.nextDelay(), 4000);
  assert.equal(policy.attempts, 4);
});

test('backoff is capped at maxDelayMs', () => {
  const policy = createReconnectPolicy({ baseMs: 500, factor: 2, maxDelayMs: 10_000, maxAttempts: 10 });
  const delays = [policy.nextDelay(), policy.nextDelay(), policy.nextDelay(), policy.nextDelay(), policy.nextDelay(), policy.nextDelay()];
  assert.deepEqual(delays, [500, 1000, 2000, 4000, 8000, 10_000]);
  assert.equal(policy.nextDelay(), 10_000);
});

test('exhaustion returns null after maxAttempts', () => {
  const policy = createReconnectPolicy({ baseMs: 500, factor: 2, maxDelayMs: 10_000, maxAttempts: 2 });
  assert.equal(policy.nextDelay(), 500);
  assert.equal(policy.nextDelay(), 1000);
  assert.equal(policy.nextDelay(), null);
  assert.equal(policy.nextDelay(), null);
  assert.equal(policy.attempts, 2);
});

test('reset restores the attempt counter and the schedule', () => {
  const policy = createReconnectPolicy({ baseMs: 500, factor: 2, maxDelayMs: 10_000, maxAttempts: 3 });
  policy.nextDelay();
  policy.nextDelay();
  assert.equal(policy.attempts, 2);
  policy.reset();
  assert.equal(policy.attempts, 0);
  assert.equal(policy.nextDelay(), 500);
});

test('default config matches the LLR-5 bounds', () => {
  assert.deepEqual(DEFAULT_RECONNECT_CONFIG, { baseMs: 500, factor: 2, maxDelayMs: 10_000, maxAttempts: 6 });
  const policy = createReconnectPolicy();
  const delays: Array<number | null> = [];
  for (let i = 0; i < 7; i += 1) delays.push(policy.nextDelay());
  assert.deepEqual(delays, [500, 1000, 2000, 4000, 8000, 10_000, null]);
});

test('shouldReconnect only fires for unexpected non-terminal drops', () => {
  assert.equal(shouldReconnect({ intentionalClose: false, terminal: false }), true);
  assert.equal(shouldReconnect({ intentionalClose: true, terminal: false }), false);
  assert.equal(shouldReconnect({ intentionalClose: false, terminal: true }), false);
  assert.equal(shouldReconnect({ intentionalClose: true, terminal: true }), false);
});

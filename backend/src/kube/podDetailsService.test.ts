import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildContainers,
  buildTerminationHistory,
  looksLikeMissingMetricsServer,
} from './podDetailsService.js';

test('looksLikeMissingMetricsServer detects a 404 from the metrics API', () => {
  // A cluster without metrics-server has no metrics.k8s.io API group at all.
  assert.equal(looksLikeMissingMetricsServer({ code: 404 }), true);
  assert.equal(looksLikeMissingMetricsServer({ statusCode: 404 }), true);
});

test('looksLikeMissingMetricsServer detects a 503 (API present but unreachable)', () => {
  assert.equal(looksLikeMissingMetricsServer({ code: 503 }), true);
});

test('looksLikeMissingMetricsServer detects the discovery error message', () => {
  assert.equal(
    looksLikeMissingMetricsServer({
      body: { message: 'the server could not find the requested resource' },
    }),
    true,
  );
  assert.equal(
    looksLikeMissingMetricsServer({ body: { message: 'no matches for metrics.k8s.io/v1beta1' } }),
    true,
  );
});

test('looksLikeMissingMetricsServer does not swallow a permission failure', () => {
  // 403 means metrics exist but access is denied — a different, real problem the
  // UI should report as its own reason.
  assert.equal(looksLikeMissingMetricsServer({ code: 403, body: { message: 'forbidden' } }), false);
});

test('looksLikeMissingMetricsServer does not swallow a connection failure', () => {
  assert.equal(looksLikeMissingMetricsServer({ code: 'ECONNREFUSED' }), false);
});

test('buildContainers preserves current and last termination metadata', () => {
  const containers = buildContainers({
    spec: { containers: [{ name: 'api', image: 'example/api:1' }] },
    status: {
      containerStatuses: [{
        name: 'api',
        ready: false,
        restartCount: 3,
        state: {
          terminated: {
            reason: 'Error',
            message: 'process exited unexpectedly',
            exitCode: 2,
            signal: 9,
            finishedAt: '2026-09-23T12:00:00Z',
          },
        },
        lastState: {
          terminated: {
            reason: 'OOMKilled',
            exitCode: 137,
            finishedAt: '2026-09-23T11:00:00Z',
          },
        },
      }],
    },
  });

  assert.equal(containers.length, 1);
  assert.equal(containers[0].state, 'terminated');
  assert.equal(containers[0].reason, 'Error');
  assert.equal(containers[0].message, 'process exited unexpectedly');
  assert.equal(containers[0].exitCode, 2);
  assert.equal(containers[0].signal, 9);
  assert.equal(containers[0].finishedAt, '2026-09-23T12:00:00Z');
  assert.equal(containers[0].lastState?.state, 'terminated');
  assert.equal(containers[0].lastState?.reason, 'OOMKilled');
  assert.equal(containers[0].lastState?.exitCode, 137);
  assert.equal(containers[0].lastState?.finishedAt, '2026-09-23T11:00:00Z');
});

test('buildTerminationHistory merges sources newest first and keeps missing timestamps last', () => {
  const history = buildTerminationHistory(
    [{
      name: 'api',
      image: 'example/api:1',
      ready: false,
      restartCount: 2,
      state: 'terminated',
      reason: 'Error',
      finishedAt: '2026-09-23T12:00:00Z',
      lastState: {
        state: 'terminated',
        reason: 'OOMKilled',
        exitCode: 137,
        finishedAt: '2026-09-23T11:00:00Z',
      },
      sidecar: false,
    }],
    [
      { type: 'Warning', reason: 'BackOff', message: 'back-off restarting failed container', count: 4, lastSeen: '2026-09-23T13:00:00Z' },
      { type: 'Normal', reason: 'Started', message: 'Started container', count: 1 },
    ],
  );

  assert.deepEqual(history.map((entry) => [entry.source, entry.reason, entry.timestamp]), [
    ['event', 'BackOff', '2026-09-23T13:00:00Z'],
    ['container', 'Error', '2026-09-23T12:00:00Z'],
    ['container', 'OOMKilled', '2026-09-23T11:00:00Z'],
    ['event', 'Started', undefined],
  ]);
});

test('buildContainers and history remain usable when status fields are missing', () => {
  const containers = buildContainers({
    spec: { containers: [{ name: 'api' }] },
  });

  assert.equal(containers[0].state, 'unknown');
  assert.equal(containers[0].restartCount, 0);
  assert.equal(containers[0].lastState, undefined);
  assert.deepEqual(buildTerminationHistory(containers, []), []);
});

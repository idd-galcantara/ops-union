import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatHpaSummary,
  formatReplicaSummary,
  formatWorkloadIdentity,
  formatWorkloadMetric,
  formatWorkloadNotes,
} from './workloadPresentation';

test('formats Rollout identity, replicas, and HPA values', () => {
  const workload = {
    kind: 'Rollout' as const,
    name: 'easy-loan-api',
    replicas: { desired: 4, current: 4, available: 3 },
    hpa: {
      name: 'easy-loan-api-hpa',
      target: { kind: 'Rollout', name: 'easy-loan-api' },
      minReplicas: 2,
      maxReplicas: 10,
      currentReplicas: 2,
      desiredReplicas: 3,
      metrics: [],
    },
  };

  assert.equal(formatWorkloadIdentity(workload), 'Rollout: easy-loan-api');
  assert.equal(formatReplicaSummary(workload), 'desired 4 · current 4 · available 3');
  assert.equal(formatHpaSummary(workload), 'min 2 · max 10 · current 2 · desired 3');
});

test('formats utilization metrics and preserves unavailable states', () => {
  assert.equal(formatWorkloadMetric({
    name: 'cpu',
    current: { averageUtilization: 6 },
    target: { averageUtilization: 80 },
  }), 'CPU 6% / 80%');
  assert.equal(formatWorkloadMetric({ name: 'memory' }), 'MEMORY unavailable');
  assert.equal(formatHpaSummary({ kind: 'Deployment', name: 'api' }), 'HPA not configured');
  assert.deepEqual(formatWorkloadNotes({
    kind: 'Rollout',
    name: 'api',
    hpaError: { code: 'forbidden', message: 'forbidden' },
  }), ['HPA data unavailable: forbidden']);
  assert.deepEqual(formatWorkloadNotes(), ['No supported workload owner was found.']);
});
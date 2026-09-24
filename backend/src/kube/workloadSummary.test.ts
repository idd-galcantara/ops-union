import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getWorkloadSummary,
  matchingHpa,
  normalizeHpa,
  normalizeReplicas,
  normalizeHpaMetrics,
  resolveWorkloadOwner,
  type WorkloadClients,
} from './workloadSummary.js';

function clients(overrides: Partial<WorkloadClients> = {}): WorkloadClients {
  return {
    apps: {
      readNamespacedDeployment: async () => ({}),
      readNamespacedStatefulSet: async () => ({}),
      readNamespacedReplicaSet: async () => ({}),
      ...overrides.apps,
    },
    customObjects: {
      getNamespacedCustomObject: async () => ({}),
      ...overrides.customObjects,
    },
    autoscaling: {
      listNamespacedHorizontalPodAutoscaler: async () => ({ items: [] }),
      ...overrides.autoscaling,
    },
  };
}

test('resolves a ReplicaSet owner through its Rollout controller', async () => {
  const result = await resolveWorkloadOwner(
    [{ kind: 'ReplicaSet', name: 'easy-loan-api-abc', controller: true }],
    'financial-services-easy-loan',
    {
      readNamespacedReplicaSet: async ({ name, namespace }) => {
        assert.equal(name, 'easy-loan-api-abc');
        assert.equal(namespace, 'financial-services-easy-loan');
        return {
          metadata: {
            ownerReferences: [{ apiVersion: 'argoproj.io/v1alpha1', kind: 'Rollout', name: 'easy-loan-api', controller: true }],
          },
        };
      },
    },
  );

  assert.deepEqual(result, { kind: 'Rollout', name: 'easy-loan-api' });
});

test('normalizes standard and Rollout replica fields without inventing absent values', () => {
  assert.deepEqual(normalizeReplicas({
    spec: { replicas: 4 },
    status: { replicas: 4, availableReplicas: 3, readyReplicas: 3, updatedReplicas: 4, unavailableReplicas: 1 },
  }), {
    desired: 4,
    current: 4,
    available: 3,
    ready: 3,
    updated: 4,
    unavailable: 1,
  });
  assert.deepEqual(normalizeReplicas({ spec: {}, status: {} }), undefined);
});

test('matches a Rollout HPA and normalizes resource metrics', () => {
  const hpa = {
    metadata: { name: 'easy-loan-api' },
    spec: {
      scaleTargetRef: { kind: 'Rollout', name: 'easy-loan-api' },
      minReplicas: 2,
      maxReplicas: 10,
      metrics: [{ type: 'Resource', resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } }],
    },
    status: {
      currentReplicas: 2,
      desiredReplicas: 3,
      currentMetrics: [{ type: 'Resource', resource: { name: 'cpu', current: { averageUtilization: 6 } } }],
    },
  };

  assert.equal(matchingHpa([hpa], 'Rollout', 'easy-loan-api')?.target.kind, 'Rollout');
  assert.deepEqual(normalizeHpaMetrics(hpa), [{
    name: 'cpu',
    current: { averageUtilization: 6 },
    target: { averageUtilization: 80 },
  }]);
  assert.deepEqual(normalizeHpa(hpa), {
    name: 'easy-loan-api',
    target: { kind: 'Rollout', name: 'easy-loan-api' },
    minReplicas: 2,
    maxReplicas: 10,
    currentReplicas: 2,
    desiredReplicas: 3,
    metrics: [{
      name: 'cpu',
      current: { averageUtilization: 6 },
      target: { averageUtilization: 80 },
    }],
  });
});

test('keeps Rollout identity when the CRD is absent and HPA access is forbidden', async () => {
  const summary = await getWorkloadSummary(
    [{ kind: 'Rollout', name: 'easy-loan-api', controller: true }],
    'financial-services-easy-loan',
    clients({
      customObjects: {
        getNamespacedCustomObject: async () => { throw { code: 404, body: { message: 'rollouts not found' } }; },
      },
      autoscaling: {
        listNamespacedHorizontalPodAutoscaler: async () => { throw { code: 403, body: { message: 'forbidden' } }; },
      },
    }),
  );

  assert.deepEqual(summary.kind, 'Rollout');
  assert.deepEqual(summary.name, 'easy-loan-api');
  assert.equal(summary.error?.code, 'not-found');
  assert.equal(summary.hpaError?.code, 'forbidden');
  assert.equal(summary.hpa, undefined);
});

test('exposes a matching HPA even when the workload read fails', async () => {
  const summary = await getWorkloadSummary(
    [{ kind: 'Deployment', name: 'bff-easy-loan', controller: true }],
    'financial-services-easy-loan',
    clients({
      apps: {
        readNamespacedDeployment: async () => { throw { code: 403, body: { message: 'forbidden' } }; },
      },
      autoscaling: {
        listNamespacedHorizontalPodAutoscaler: async () => ({
          items: [{ metadata: { name: 'bff-hpa' }, spec: { scaleTargetRef: { kind: 'Deployment', name: 'bff-easy-loan' } } }],
        }),
      },
    }),
  );

  assert.equal(summary.error?.code, 'forbidden');
  assert.equal(summary.hpa?.name, 'bff-hpa');
});
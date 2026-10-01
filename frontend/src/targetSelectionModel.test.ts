import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailableTargets, getTargetSelectionModel } from './targetSelectionModel';

test('target selection reports partial namespace coverage and builds only available pairs', () => {
  const model = getTargetSelectionModel({
    contexts: [{ name: 'cluster-a', cluster: 'cluster-a' }, { name: 'cluster-b', cluster: 'cluster-b' }],
    contextFilter: '',
    selectedClusters: ['cluster-a', 'cluster-b'],
    selectedNamespaces: [],
    namespace: 'ops',
    namespaces: [{ name: 'ops', clusters: ['cluster-a'] }],
    namespacesReady: true,
  });

  assert.equal(model.canAdd, true);
  assert.equal(model.availableTargetCount, 1);
  assert.equal(model.unavailableTargetCount, 1);
  assert.deepEqual(model.unavailableClusters, ['cluster-b']);
  assert.deepEqual(
    buildAvailableTargets(['cluster-a', 'cluster-b'], model.namespacesToAdd, [{ name: 'ops', clusters: ['cluster-a'] }], false),
    [{ cluster: 'cluster-a', namespace: 'ops' }],
  );
});

test('target selection allows typed namespaces only after discovery fails empty', () => {
  const model = getTargetSelectionModel({
    contexts: [{ name: 'cluster-a', cluster: 'cluster-a' }],
    contextFilter: 'a',
    selectedClusters: ['cluster-a'],
    selectedNamespaces: [],
    namespace: 'recovered',
    namespaces: [],
    namespacesReady: true,
    namespacesError: 'Namespace discovery failed.',
  });

  assert.equal(model.canAdd, true);
  assert.deepEqual(model.namespacesToAdd, ['recovered']);
});
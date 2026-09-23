import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreset } from './presets';
import { useOpsFlowStore } from './store';

test('appendImportedPresets persists fresh presets without changing view state', () => {
  const original = useOpsFlowStore.getState();
  const existing = createPreset('existing', [{ cluster: 'c1', namespace: 'n1' }]);
  useOpsFlowStore.setState({
    presets: [existing],
    targets: [{ cluster: 'c2', namespace: 'n2' }],
    pods: [{
      cluster: 'c2',
      namespace: 'n2',
      name: 'pod',
      status: 'Running',
      ready: '1/1',
      restarts: 0,
      node: 'node',
      ageSeconds: 10,
      containers: ['app'],
      application: { key: 'pod:pod', name: 'pod', source: 'pod' },
    }],
    grouping: 'cluster',
    filter: 'pod',
    refreshSeconds: 30,
    activePresetId: existing.id,
    activePresetDirty: true,
  });

  try {
    useOpsFlowStore.getState().appendImportedPresets([{
      name: 'imported',
      description: 'from file',
      targets: [{ cluster: 'c3', namespace: 'n3' }],
    }]);
    const state = useOpsFlowStore.getState();
    assert.equal(state.presets.length, 2);
    assert.notEqual(state.presets[1].id, '');
    assert.equal(state.presets[1].lastUsedAt, undefined);
    assert.deepEqual(state.targets, [{ cluster: 'c2', namespace: 'n2' }]);
    assert.equal(state.pods[0].name, 'pod');
    assert.equal(state.grouping, 'cluster');
    assert.equal(state.filter, 'pod');
    assert.equal(state.refreshSeconds, 30);
    assert.equal(state.activePresetId, existing.id);
    assert.equal(state.activePresetDirty, true);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('clearPresets persists an empty library and preserves current view state', () => {
  const original = useOpsFlowStore.getState();
  const active = createPreset('active', [{ cluster: 'c1', namespace: 'n1' }]);
  useOpsFlowStore.setState({
    presets: [active],
    targets: [{ cluster: 'c1', namespace: 'n1' }],
    pods: [{
      cluster: 'c1',
      namespace: 'n1',
      name: 'pod',
      status: 'Running',
      ready: '1/1',
      restarts: 0,
      node: 'node',
      ageSeconds: 10,
      containers: ['app'],
      application: { key: 'pod:pod', name: 'pod', source: 'pod' },
    }],
    grouping: 'flat',
    filter: 'running',
    refreshSeconds: 60,
    activePresetId: active.id,
    activePresetDirty: true,
  });

  try {
    useOpsFlowStore.getState().clearPresets();
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.presets, []);
    assert.equal(state.activePresetId, null);
    assert.equal(state.activePresetDirty, false);
    assert.deepEqual(state.targets, [{ cluster: 'c1', namespace: 'n1' }]);
    assert.equal(state.pods[0].name, 'pod');
    assert.equal(state.grouping, 'flat');
    assert.equal(state.filter, 'running');
    assert.equal(state.refreshSeconds, 60);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('explicit pod queries signal workspace reset while silent refresh does not', async () => {
  const original = useOpsFlowStore.getState();
  const originalFetch = globalThis.fetch;
  useOpsFlowStore.setState({
    targets: [{ cluster: 'cluster-a', namespace: 'namespace-a' }],
    explicitQueryRevision: 10,
    podsLoading: false,
    refreshing: false,
    filter: 'api',
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ pods: [], errors: [] }), { status: 200 });

  try {
    await useOpsFlowStore.getState().loadPods();
    assert.equal(useOpsFlowStore.getState().explicitQueryRevision, 11);
    await useOpsFlowStore.getState().loadPods({ silent: true });
    assert.equal(useOpsFlowStore.getState().explicitQueryRevision, 11);
    assert.equal(useOpsFlowStore.getState().filter, 'api');
  } finally {
    globalThis.fetch = originalFetch;
    useOpsFlowStore.setState(original);
  }
});

test('resetKubeconfig clears kubeconfig-derived state before reloading contexts', async () => {
  const original = useOpsFlowStore.getState();
  const previousWindow = (globalThis as { window?: unknown }).window;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const pod = {
    cluster: 'cluster-selected',
    namespace: 'namespace-selected',
    name: 'pod',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    node: 'node',
    ageSeconds: 10,
    containers: ['app'],
    application: { key: 'pod:pod', name: 'pod', source: 'pod' as const },
  };

  useOpsFlowStore.setState({
    kubeconfigStatus: { available: true, source: 'selected', contextCount: 1 },
    contexts: [{ name: 'context-selected', cluster: 'cluster-selected' }],
    contextsError: 'stale context error',
    targets: [{ cluster: 'cluster-selected', namespace: 'namespace-selected' }],
    namespaces: [{ name: 'namespace-selected', clusters: ['cluster-selected'] }],
    namespacesFor: ['cluster-selected'],
    namespacesError: 'stale namespace error',
    pods: [pod],
    targetErrors: [{
      target: { cluster: 'cluster-selected', namespace: 'namespace-selected' },
      message: 'stale pod error',
    }],
    podsLoading: true,
    podsError: 'stale pods error',
    refreshing: true,
    hasQueried: true,
    lastUpdatedAt: 1,
    activePresetId: 'preset',
    activePresetDirty: true,
    configurationRevision: 4,
  });
  (globalThis as { window?: unknown }).window = {
    opsFlowDesktop: {
      resetKubeconfig: async () => ({
        status: { available: true, source: 'environment', contextCount: 1 },
      }),
    },
  };
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({
      contexts: [{ name: 'context-environment', cluster: 'cluster-environment' }],
    }), { status: 200 });
  };

  try {
    await useOpsFlowStore.getState().resetKubeconfig();
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.kubeconfigStatus, {
      available: true,
      source: 'environment',
      contextCount: 1,
    });
    assert.deepEqual(state.contexts, [{ name: 'context-environment', cluster: 'cluster-environment' }]);
    assert.equal(state.contextsError, undefined);
    assert.deepEqual(state.targets, []);
    assert.deepEqual(state.namespaces, []);
    assert.deepEqual(state.namespacesFor, []);
    assert.equal(state.namespacesError, undefined);
    assert.deepEqual(state.pods, []);
    assert.deepEqual(state.targetErrors, []);
    assert.equal(state.podsError, undefined);
    assert.equal(state.podsLoading, false);
    assert.equal(state.refreshing, false);
    assert.equal(state.hasQueried, false);
    assert.equal(state.lastUpdatedAt, undefined);
    assert.equal(state.activePresetId, null);
    assert.equal(state.activePresetDirty, false);
    assert.equal(state.configurationRevision, 5);
    assert.deepEqual(requestedUrls, ['/api/contexts']);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previousWindow;
    useOpsFlowStore.setState(original);
  }
});
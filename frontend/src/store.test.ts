import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreset } from './presets';
import { buildTransferPlan, catalogForTransfer } from './presetTransfer';
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

test('clearPresets persists an empty library and resets the active view', () => {
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
    assert.deepEqual(state.targets, []);
    assert.deepEqual(state.pods, []);
    assert.equal(state.hasQueried, false);
    assert.equal(state.grouping, 'flat');
    assert.equal(state.filter, '');
    assert.equal(state.refreshSeconds, 60);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('deleting the active preset resets the current view', () => {
  const original = useOpsFlowStore.getState();
  const active = createPreset('active', [{ cluster: 'c1', namespace: 'n1' }]);
  useOpsFlowStore.setState({
    presets: [active],
    targets: [{ cluster: 'c1', namespace: 'n1' }],
    pods: [{
      cluster: 'c1', namespace: 'n1', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
      node: 'node', ageSeconds: 10, containers: ['app'], application: { key: 'pod:pod', name: 'pod', source: 'pod' },
    }],
    activePresetId: active.id,
    hasQueried: true,
    filter: 'running',
    configurationRevision: 4,
    explicitQueryRevision: 6,
  });

  try {
    const before = useOpsFlowStore.getState();
    useOpsFlowStore.getState().deletePreset(active.id);
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.presets, []);
    assert.equal(state.activePresetId, null);
    assert.deepEqual(state.targets, []);
    assert.deepEqual(state.pods, []);
    assert.equal(state.hasQueried, false);
    assert.equal(state.filter, '');
    assert.equal(state.configurationRevision, before.configurationRevision + 1);
    assert.equal(state.explicitQueryRevision, before.explicitQueryRevision + 1);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('bulk deletion removes exact ids and resets the operational view when active preset is selected', () => {
  const original = useOpsFlowStore.getState();
  const active = createPreset('active', [{ cluster: 'c1', namespace: 'n1' }]);
  const other = createPreset('other', [{ cluster: 'c2', namespace: 'n2' }]);
  const untouched = createPreset('untouched', [{ cluster: 'c3', namespace: 'n3' }]);
  const targets = [{ cluster: 'live', namespace: 'namespace' }];
  const pods = [{
    cluster: 'live', namespace: 'namespace', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
    node: 'node', ageSeconds: 10, containers: ['app'], application: { key: 'pod:pod', name: 'pod', source: 'pod' as const },
  }];
  const workspace = original.workspaces.find((item) => item.id === original.activeWorkspaceId);
  assert.ok(workspace);
  useOpsFlowStore.setState({
    presets: [active, other, untouched],
    workspaces: original.workspaces.map((item) => item.id === workspace.id ? { ...item, presets: [active, other, untouched] } : item),
    targets,
    pods,
    activePresetId: active.id,
    activePresetDirty: true,
    hasQueried: true,
    filter: 'running',
    configurationRevision: 3,
    explicitQueryRevision: 7,
  });

  try {
    const workspaceId = useOpsFlowStore.getState().activeWorkspaceId;
    assert.equal(useOpsFlowStore.getState().deletePresets([active.id, other.id], workspaceId), true);
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.presets.map((preset) => preset.id), [untouched.id]);
    assert.equal(state.activePresetId, null);
    assert.equal(state.activePresetDirty, false);
    assert.deepEqual(state.targets, []);
    assert.deepEqual(state.pods, []);
    assert.equal(state.hasQueried, false);
    assert.equal(state.filter, '');
    assert.equal(state.configurationRevision, 4);
    assert.equal(state.explicitQueryRevision, 8);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('bulk deletion refuses missing ids without changing the catalog', () => {
  const original = useOpsFlowStore.getState();
  const preset = createPreset('kept', [{ cluster: 'c1', namespace: 'n1' }]);
  const workspace = original.workspaces.find((item) => item.id === original.activeWorkspaceId);
  assert.ok(workspace);
  useOpsFlowStore.setState({
    presets: [preset],
    workspaces: original.workspaces.map((item) => item.id === workspace.id ? { ...item, presets: [preset] } : item),
  });

  try {
    const stateBefore = useOpsFlowStore.getState();
    assert.equal(stateBefore.deletePresets([preset.id, 'missing'], stateBefore.activeWorkspaceId), false);
    assert.deepEqual(useOpsFlowStore.getState().presets, [preset]);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('copy transfers selected presets once, retaining the source and operational state', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = { ...createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]), lastUsedAt: 20 };
  const otherPreset = createPreset('other', [{ cluster: 'c2', namespace: 'n2' }]);
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset, otherPreset] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [] };
  const targets = [{ cluster: 'live', namespace: 'namespace' }];
  const pods = [{
    cluster: 'live', namespace: 'namespace', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
    node: 'node', ageSeconds: 10, containers: ['app'], application: { key: 'pod:pod', name: 'pod', source: 'pod' as const },
  }];
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = {
    setItem: () => { writes += 1; },
  };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: source.id,
    presets: source.presets,
    activePresetId: sourcePreset.id,
    activePresetDirty: true,
    targets,
    pods,
    filter: 'pod',
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildTransferPlan(
      catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets),
      { mode: 'copy', sourceWorkspaceId: source.id, presetIds: [sourcePreset.id], destinationWorkspaceIds: [destination.id] },
      (portable) => ({ id: 'copied-id', ...portable }),
    );
    assert.deepEqual(await state.transferPresets(plan), { ok: true });
    const next = useOpsFlowStore.getState();
    assert.equal(writes, 1);
    assert.deepEqual(next.workspaces[0].presets, source.presets);
    assert.equal(next.workspaces[1].presets[0].id, 'copied-id');
    assert.equal(next.workspaces[1].presets[0].lastUsedAt, undefined);
    assert.equal(next.activePresetId, sourcePreset.id);
    assert.equal(next.activePresetDirty, true);
    assert.deepEqual(next.targets, targets);
    assert.deepEqual(next.pods, pods);
    assert.equal(next.filter, 'pod');
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('move commits destination creation and source removal once, returning to the initial view when active', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]);
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: source.id,
    presets: source.presets,
    activePresetId: sourcePreset.id,
    activePresetDirty: true,
    targets: [{ cluster: 'live', namespace: 'namespace' }],
    filter: 'keep-me',
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildTransferPlan(
      catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets),
      { mode: 'move', sourceWorkspaceId: source.id, presetIds: [sourcePreset.id], destinationWorkspaceIds: [destination.id] },
      (portable) => ({ id: 'moved-id', ...portable }),
    );
    assert.deepEqual(await state.transferPresets(plan), { ok: true });
    const next = useOpsFlowStore.getState();
    assert.equal(writes, 1);
    assert.deepEqual(next.workspaces[0].presets, []);
    assert.equal(next.workspaces[1].presets[0].id, 'moved-id');
    assert.equal(next.activePresetId, null);
    assert.equal(next.activePresetDirty, false);
    assert.deepEqual(next.targets, []);
    assert.deepEqual(next.pods, []);
    assert.equal(next.hasQueried, false);
    assert.equal(next.filter, '');
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('a failed catalog write leaves both sides of a transfer unchanged', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]);
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    setItem: () => { throw new Error('storage full'); },
  };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: source.id,
    presets: source.presets,
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildTransferPlan(
      catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets),
      { mode: 'move', sourceWorkspaceId: source.id, presetIds: [sourcePreset.id], destinationWorkspaceIds: [destination.id] },
      (portable) => ({ id: 'moved-id', ...portable }),
    );
    assert.equal((await state.transferPresets(plan)).ok, false);
    assert.deepEqual(useOpsFlowStore.getState().workspaces, [source, destination]);
    assert.deepEqual(useOpsFlowStore.getState().presets, source.presets);
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('ignore transfers only non-conflicting destinations and keeps an all-conflict preset on move', async () => {
  const original = useOpsFlowStore.getState();
  const blocked = createPreset('blocked', [{ cluster: 'c1', namespace: 'n1' }]);
  const transferable = createPreset('transferable', [{ cluster: 'c2', namespace: 'n2' }]);
  const existing = createPreset('existing', blocked.targets);
  const source = { id: 'source-workspace', name: 'Source', presets: [blocked, transferable] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [existing] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: source.id,
    presets: source.presets,
    activePresetId: blocked.id,
    targets: [{ cluster: 'live', namespace: 'keep' }],
    filter: 'keep',
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildTransferPlan(
      catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets),
      { mode: 'move', sourceWorkspaceId: source.id, presetIds: [blocked.id, transferable.id], destinationWorkspaceIds: [destination.id] },
      (portable) => ({ id: `${portable.name}-copy`, ...portable }),
    );
    assert.equal(plan.conflicts.length, 1);
    assert.deepEqual(await state.transferPresets(plan, 'ignore'), { ok: true });
    const next = useOpsFlowStore.getState();
    assert.equal(writes, 1);
    assert.deepEqual(next.workspaces[0].presets.map((preset) => preset.id), [blocked.id]);
    assert.deepEqual(next.workspaces[1].presets.map((preset) => preset.name), ['existing', 'transferable']);
    assert.equal(next.activePresetId, blocked.id);
    assert.equal(next.filter, 'keep');
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('overwrite replaces a destination semantic duplicate while keeping destination identity and usage', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = { ...createPreset('updated name', [{ cluster: 'c1', namespace: 'n1' }]), lastUsedAt: 12 };
  const destinationPreset = { ...createPreset('old name', sourcePreset.targets), lastUsedAt: 88 };
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [destinationPreset] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({ workspaces: [source, destination], activeWorkspaceId: source.id, presets: source.presets });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildTransferPlan(
      catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets),
      { mode: 'copy', sourceWorkspaceId: source.id, presetIds: [sourcePreset.id], destinationWorkspaceIds: [destination.id] },
      () => ({ id: 'fresh-source-id', name: sourcePreset.name, targets: sourcePreset.targets }),
    );
    assert.deepEqual(await state.transferPresets(plan, 'overwrite'), { ok: true });
    const nextDestination = useOpsFlowStore.getState().workspaces[1].presets[0];
    assert.equal(writes, 1);
    assert.equal(nextDestination.id, destinationPreset.id);
    assert.equal(nextDestination.name, sourcePreset.name);
    assert.equal(nextDestination.lastUsedAt, destinationPreset.lastUsedAt);
    assert.equal(useOpsFlowStore.getState().workspaces[0].presets[0].lastUsedAt, sourcePreset.lastUsedAt);
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
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
    await useOpsFlowStore.getState().loadPods({ resetView: false });
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
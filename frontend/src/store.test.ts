import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCopyPlan } from './presetCopy';
import { buildMovePlan } from './presetMove';
import { createPreset } from './presets';
import { buildTransferPlan, catalogForTransfer } from './presetTransfer';
import { useOpsFlowStore } from './store';

test('context responses cannot commit after a revision change or newer request', async () => {
  const original = useOpsFlowStore.getState();
  const originalFetch = globalThis.fetch;
  const pending: Array<(response: Response) => void> = [];
  useOpsFlowStore.setState({ contexts: [{ name: 'current', cluster: 'current' }], configurationRevision: 4 });
  globalThis.fetch = async () => new Promise<Response>((resolve) => { pending.push(resolve); });

  try {
    const staleRevision = useOpsFlowStore.getState().loadContexts();
    useOpsFlowStore.setState({ configurationRevision: 5 });
    pending.shift()!(new Response(JSON.stringify({ contexts: [{ name: 'old', cluster: 'old' }] }), { status: 200 }));
    await staleRevision;
    assert.equal(useOpsFlowStore.getState().contexts[0].name, 'current');

    const older = useOpsFlowStore.getState().loadContexts();
    const newer = useOpsFlowStore.getState().loadContexts();
    pending.pop()!(new Response(JSON.stringify({ contexts: [{ name: 'new', cluster: 'new' }] }), { status: 200 }));
    await newer;
    pending.shift()!(new Response(JSON.stringify({ contexts: [{ name: 'older', cluster: 'older' }] }), { status: 200 }));
    await older;
    assert.equal(useOpsFlowStore.getState().contexts[0].name, 'new');
    assert.equal(useOpsFlowStore.getState().contextsLoading, false);
  } finally {
    globalThis.fetch = originalFetch;
    useOpsFlowStore.setState(original);
  }
});

test('savePreset rejects a duplicate name without changing the catalog', () => {
  const original = useOpsFlowStore.getState();
  const existing = createPreset('Existing preset', [{ cluster: 'c1', namespace: 'n1' }]);
  const workspace = original.workspaces.find((item) => item.id === original.activeWorkspaceId);
  assert.ok(workspace);
  useOpsFlowStore.setState({
    presets: [existing],
    workspaces: original.workspaces.map((item) => item.id === workspace.id ? { ...item, presets: [existing] } : item),
    targets: [{ cluster: 'c2', namespace: 'n2' }],
    activePresetId: existing.id,
  });

  try {
    const result = useOpsFlowStore.getState().savePreset('  EXISTING PRESET  ', 'ignored', [{ cluster: 'c2', namespace: 'n2' }]);
    const state = useOpsFlowStore.getState();
    assert.equal(result, undefined);
    assert.deepEqual(state.presets, [existing]);
    assert.equal(state.activePresetId, existing.id);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('applying a preset resets the target editor revision', () => {
  const original = useOpsFlowStore.getState();
  const preset = createPreset('Production', [{ cluster: 'prod', namespace: 'payments' }]);
  useOpsFlowStore.setState({
    presets: [preset],
    targets: [{ cluster: 'stale', namespace: 'stale' }],
    namespaces: [{ name: 'stale', clusters: ['stale'] }],
    namespacesFor: ['stale'],
    configurationRevision: 4,
  });

  try {
    useOpsFlowStore.getState().applyPreset(preset.id);
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.targets, [{ cluster: 'prod', namespace: 'payments' }]);
    assert.equal(state.configurationRevision, 5);
    assert.equal(state.activePresetId, preset.id);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('clearing targets resets the target editor revision', () => {
  const original = useOpsFlowStore.getState();
  useOpsFlowStore.setState({
    targets: [{ cluster: 'stale', namespace: 'stale' }],
    namespaces: [{ name: 'stale', clusters: ['stale'] }],
    namespacesFor: ['stale'],
    namespacesLoading: true,
    namespacesError: 'stale error',
    configurationRevision: 4,
  });

  try {
    useOpsFlowStore.getState().clearTargets();
    const state = useOpsFlowStore.getState();
    assert.deepEqual(state.targets, []);
    assert.deepEqual(state.namespaces, []);
    assert.deepEqual(state.namespacesFor, []);
    assert.equal(state.namespacesLoading, false);
    assert.equal(state.namespacesError, undefined);
    assert.equal(state.configurationRevision, 5);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

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

test('copies presets from an inactive source into the active Workspace without changing the live view', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = { ...createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]), lastUsedAt: 20 };
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset] };
  const destinationPreset = createPreset('active', [{ cluster: 'live', namespace: 'namespace' }]);
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [destinationPreset] };
  const targets = [{ cluster: 'live', namespace: 'namespace' }];
  const pods = [{
    cluster: 'live', namespace: 'namespace', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
    node: 'node', ageSeconds: 10, containers: ['app'], application: { key: 'pod:pod', name: 'pod', source: 'pod' as const },
  }];
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: destination.id,
    presets: destination.presets,
    activePresetId: destinationPreset.id,
    activePresetDirty: true,
    targets,
    pods,
    filter: 'pod',
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildCopyPlan(
      { version: 1, workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId },
      { sourceWorkspaceId: source.id, sourcePresetIds: [sourcePreset.id], destinationWorkspaceId: destination.id },
      (portable) => ({ id: 'copied-id', ...portable }),
    );
    assert.deepEqual(await state.copyPresetsFromWorkspace(plan), { ok: true });
    const next = useOpsFlowStore.getState();
    assert.equal(writes, 1);
    assert.deepEqual(next.workspaces[0].presets, source.presets);
    assert.equal(next.workspaces[1].presets.some((preset) => preset.id === 'copied-id'), true);
    assert.equal(next.activePresetId, destinationPreset.id);
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

test('a failed cross-Workspace copy leaves source and destination unchanged', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]);
  const source = { id: 'source-workspace', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'destination-workspace', name: 'Destination', presets: [] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { throw new Error('storage full'); } };
  useOpsFlowStore.setState({ workspaces: [source, destination], activeWorkspaceId: destination.id, presets: [] });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildCopyPlan(
      { version: 1, workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId },
      { sourceWorkspaceId: source.id, sourcePresetIds: [sourcePreset.id], destinationWorkspaceId: destination.id },
      (portable) => ({ id: 'copied-id', ...portable }),
    );
    assert.equal((await state.copyPresetsFromWorkspace(plan)).ok, false);
    assert.deepEqual(useOpsFlowStore.getState().workspaces, [source, destination]);
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('cross-Workspace move commits destination and source changes once while preserving live state', async () => {
  const original = useOpsFlowStore.getState();
  const first = { ...createPreset('first', [{ cluster: 'c1', namespace: 'n1' }]), lastUsedAt: 10 };
  const second = createPreset('second', [{ cluster: 'c2', namespace: 'n2' }]);
  const active = { ...createPreset('active', [{ cluster: 'live', namespace: 'ns' }]), lastUsedAt: 20 };
  const source = { id: 'move-source', name: 'Source', presets: [first, second] };
  const destination = { id: 'move-destination', name: 'Destination', presets: [active] };
  const targets = [{ cluster: 'live', namespace: 'ns' }];
  const pods = [{
    cluster: 'live', namespace: 'ns', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
    node: 'node', ageSeconds: 10, containers: ['app'], application: { key: 'pod:pod', name: 'pod', source: 'pod' as const },
  }];
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({
    workspaces: [source, destination],
    activeWorkspaceId: destination.id,
    presets: destination.presets,
    activePresetId: active.id,
    activePresetDirty: true,
    targets,
    pods,
    filter: 'keep',
    explicitQueryRevision: 4,
  });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildMovePlan(
      { version: 1, workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId },
      { sourceWorkspaceId: source.id, sourcePresetIds: [first.id, second.id], destinationWorkspaceId: destination.id, activePresetId: active.id },
      (portable) => ({ id: `new-${portable.name}`, ...portable }),
    );
    assert.deepEqual(await state.movePresetsFromWorkspace(plan), { ok: true });
    const next = useOpsFlowStore.getState();
    assert.equal(writes, 1);
    assert.deepEqual(next.workspaces[0].presets, []);
    assert.deepEqual(next.workspaces[1].presets.map((preset) => preset.id), [active.id, 'new-first', 'new-second']);
    assert.equal(next.activeWorkspaceId, destination.id);
    assert.equal(next.activePresetId, active.id);
    assert.equal(next.activePresetDirty, true);
    assert.deepEqual(next.targets, targets);
    assert.deepEqual(next.pods, pods);
    assert.equal(next.filter, 'keep');
    assert.equal(next.explicitQueryRevision, 4);
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('move Ignore retains conflicting source presets and Overwrite keeps destination identity', async () => {
  const original = useOpsFlowStore.getState();
  const blocked = createPreset('blocked', [{ cluster: 'c1', namespace: 'n1' }]);
  const free = createPreset('free', [{ cluster: 'c2', namespace: 'n2' }]);
  const existing = { ...createPreset('existing', blocked.targets), lastUsedAt: 44 };
  const source = { id: 'move-source', name: 'Source', presets: [blocked, free] };
  const destination = { id: 'move-destination', name: 'Destination', presets: [existing] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { writes += 1; } };
  useOpsFlowStore.setState({ workspaces: [source, destination], activeWorkspaceId: destination.id, presets: destination.presets });

  try {
    const state = useOpsFlowStore.getState();
    const plan = buildMovePlan(
      { version: 1, workspaces: state.workspaces, activeWorkspaceId: state.activeWorkspaceId },
      { sourceWorkspaceId: source.id, sourcePresetIds: [blocked.id, free.id], destinationWorkspaceId: destination.id },
      (portable) => ({ id: `fresh-${portable.name}`, ...portable }),
    );
    assert.deepEqual(await state.movePresetsFromWorkspace(plan, 'ignore'), { ok: true });
    assert.equal(writes, 1);
    assert.deepEqual(useOpsFlowStore.getState().workspaces[0].presets.map((preset) => preset.id), [blocked.id]);
    assert.deepEqual(useOpsFlowStore.getState().workspaces[1].presets.map((preset) => preset.id), [existing.id, 'fresh-free']);

    useOpsFlowStore.setState({ workspaces: [source, destination], activeWorkspaceId: destination.id, presets: destination.presets, activePresetId: existing.id });
    const overwritePlan = buildMovePlan(
      { version: 1, workspaces: [source, destination], activeWorkspaceId: destination.id },
      { sourceWorkspaceId: source.id, sourcePresetIds: [blocked.id], destinationWorkspaceId: destination.id, activePresetId: existing.id },
      (portable) => ({ id: 'source-id-must-not-win', ...portable }),
    );
    assert.deepEqual(await useOpsFlowStore.getState().movePresetsFromWorkspace(overwritePlan, 'overwrite'), { ok: true });
    const overwritten = useOpsFlowStore.getState().workspaces[1].presets[0];
    assert.equal(overwritten.id, existing.id);
    assert.equal(overwritten.lastUsedAt, existing.lastUsedAt);
    assert.equal(useOpsFlowStore.getState().activePresetId, existing.id);
  } finally {
    if (previousLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    useOpsFlowStore.setState(original);
  }
});

test('a failed move persistence leaves both Workspaces and active state unchanged', async () => {
  const original = useOpsFlowStore.getState();
  const sourcePreset = createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]);
  const source = { id: 'move-source', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'move-destination', name: 'Destination', presets: [] };
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = { setItem: () => { throw new Error('storage full'); } };
  useOpsFlowStore.setState({ workspaces: [source, destination], activeWorkspaceId: destination.id, presets: [], activePresetId: null, targets: [{ cluster: 'keep', namespace: 'state' }] });

  try {
    const plan = buildMovePlan(
      { version: 1, workspaces: [source, destination], activeWorkspaceId: destination.id },
      { sourceWorkspaceId: source.id, sourcePresetIds: [sourcePreset.id], destinationWorkspaceId: destination.id },
      () => ({ id: 'fresh-move-id', name: sourcePreset.name, targets: sourcePreset.targets }),
    );
    assert.deepEqual(await useOpsFlowStore.getState().movePresetsFromWorkspace(plan), { ok: false, error: 'The presets could not be moved between Workspaces.' });
    const next = useOpsFlowStore.getState();
    assert.deepEqual(next.workspaces, [source, destination]);
    assert.deepEqual(next.targets, [{ cluster: 'keep', namespace: 'state' }]);
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
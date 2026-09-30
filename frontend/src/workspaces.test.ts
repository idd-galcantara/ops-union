import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreset } from './presets';
import { useOpsFlowStore } from './store';
import {
  createDefaultWorkspace,
  getInitialWorkspaceCatalog,
  loadWorkspaceCatalog,
  parseWorkspaceImport,
  parseWorkspaceImportFile,
  serializeWorkspace,
  serializeWorkspaceBundle,
} from './workspaces';

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  return store;
}

const legacyKey = 'ops-union.presets.v1';

function workspaceDocument(name = 'Payments Team'): string {
  return JSON.stringify({
    format: 'ops-union.workspace',
    version: 1,
    exportedAt: '2026-09-30T12:00:00.000Z',
    workspace: { name, description: 'Payment contexts' },
    presets: [
      {
        name: 'Production',
        description: 'Primary',
        targets: [{ cluster: 'prod-a', namespace: 'payments' }],
      },
      {
        name: 'Staging',
        targets: [{ cluster: 'stage-a', namespace: 'payments' }],
      },
    ],
  });
}

test('legacy flat presets migrate losslessly into one default Workspace', async () => {
  const store = installStorage({
    [legacyKey]: JSON.stringify([
      { id: 'legacy-a', name: 'Payments', targets: [{ cluster: 'prod', namespace: 'pay' }], lastUsedAt: 20 },
      { id: 'legacy-b', name: 'Payments copy', targets: [{ cluster: 'prod', namespace: 'pay' }] },
    ]),
  });

  const initial = getInitialWorkspaceCatalog();
  assert.equal(initial.workspaces.length, 1);
  assert.equal(initial.workspaces[0].name, 'My Workspace');
  assert.deepEqual(initial.workspaces[0].presets.map((preset) => preset.id), ['legacy-a', 'legacy-b']);
  assert.equal(initial.workspaces[0].presets[0].lastUsedAt, 20);

  const hydrated = await loadWorkspaceCatalog();
  assert.equal(hydrated.workspaces[0].presets.length, 2);
  assert.equal(JSON.parse(store.get('ops-union.workspaces.v1') ?? '{}').workspaces.length, 1);
});

test('Workspace export contains only portable current-Workspace fields', () => {
  const preset = { ...createPreset('Production', [{ cluster: 'prod', namespace: 'pay' }], 'Primary'), lastUsedAt: 42 };
  const workspace = {
    ...createDefaultWorkspace([preset]).workspaces[0],
    id: 'local-workspace-id',
    createdAt: 'local-created',
  };
  const document = JSON.parse(serializeWorkspace(workspace, '2026-09-30T12:00:00.000Z'));

  assert.deepEqual(document, {
    format: 'ops-union.workspace',
    version: 1,
    exportedAt: '2026-09-30T12:00:00.000Z',
    workspace: { name: 'My Workspace' },
    presets: [{ name: 'Production', description: 'Primary', targets: [{ cluster: 'prod', namespace: 'pay' }] }],
  });
  assert.equal(JSON.stringify(document).includes('local-workspace-id'), false);
  assert.equal(JSON.stringify(document).includes('lastUsedAt'), false);
});

test('Workspace bundle exports and parses multiple Workspaces as individual candidates', () => {
  const first = createDefaultWorkspace([createPreset('Production', [{ cluster: 'prod', namespace: 'pay' }])]).workspaces[0];
  const second = { ...first, id: 'second', name: 'Staging', presets: [createPreset('Staging', [{ cluster: 'stage', namespace: 'pay' }])] };
  const file = parseWorkspaceImportFile(serializeWorkspaceBundle([first, second], '2026-09-30T12:00:00.000Z'));

  assert.equal(file.error, undefined);
  assert.deepEqual(file.workspaces.map((workspace) => workspace.workspaceName), ['My Workspace', 'Staging']);
  assert.deepEqual(file.workspaces.map((workspace) => workspace.accepted.length), [1, 1]);
  assert.equal(parseWorkspaceImport(serializeWorkspaceBundle([first, second])).workspaceName, 'My Workspace');
});

test('Workspace import preserves the source name for duplicate-name validation', () => {
  const existing = createDefaultWorkspace();
  existing.workspaces[0].name = 'Payments Team';
  const result = parseWorkspaceImport(JSON.stringify({
    ...JSON.parse(workspaceDocument()),
    presets: [
      ...JSON.parse(workspaceDocument()).presets,
      { name: 'broken', targets: [{ cluster: '', namespace: 'missing' }] },
    ],
  }));

  assert.equal(result.accepted.length, 2);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.suggestedName, 'Payments Team');
});

test('Workspace management scopes presets without changing operational state', () => {
  const original = useOpsFlowStore.getState();
  const first = createDefaultWorkspace([createPreset('Existing', [{ cluster: 'c1', namespace: 'n1' }])]);
  useOpsFlowStore.setState({
    workspaces: first.workspaces,
    activeWorkspaceId: first.activeWorkspaceId,
    presets: first.workspaces[0].presets,
    targets: [{ cluster: 'live', namespace: 'ns' }],
    pods: [{
      cluster: 'live', namespace: 'ns', name: 'pod', status: 'Running', ready: '1/1', restarts: 0,
      node: 'node', ageSeconds: 1, containers: ['app'], application: { key: 'pod', name: 'pod', source: 'pod' },
    }],
    filter: 'api',
    hasQueried: true,
  });

  try {
    const error = useOpsFlowStore.getState().createWorkspace('  Platform Team  ', 'Platform');
    assert.equal(error, undefined);
    const state = useOpsFlowStore.getState();
    assert.equal(state.workspaces.length, 2);
    assert.equal(state.workspaces[1].name, 'Platform Team');
    assert.deepEqual(state.presets, []);
    const createdId = state.activeWorkspaceId;
    assert.match(useOpsFlowStore.getState().createWorkspace('platform team') ?? '', /already in use/);
    assert.equal(useOpsFlowStore.getState().renameWorkspace(createdId, '  Platform Operations  ', 'Updated'), undefined);
    assert.equal(useOpsFlowStore.getState().workspaces.find((workspace) => workspace.id === createdId)?.name, 'Platform Operations');
    assert.equal(useOpsFlowStore.getState().renameWorkspace(first.activeWorkspaceId, 'Core Team'), undefined);
    assert.equal(useOpsFlowStore.getState().workspaces.find((workspace) => workspace.id === first.activeWorkspaceId)?.name, 'Core Team');
    assert.deepEqual(state.targets, [{ cluster: 'live', namespace: 'ns' }]);
    assert.equal(state.pods[0].name, 'pod');
    assert.equal(state.filter, 'api');
    assert.equal(state.hasQueried, true);
    assert.equal(state.switchWorkspace(first.activeWorkspaceId), undefined);
    const switched = useOpsFlowStore.getState();
    assert.equal(switched.presets[0].name, 'Existing');
    assert.equal(switched.workspaces.find((workspace) => workspace.id === first.activeWorkspaceId)?.presets[0].name, 'Existing');
    assert.deepEqual(switched.targets, [{ cluster: 'live', namespace: 'ns' }]);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('import creates fresh local preset ids and does not activate by default', () => {
  const original = useOpsFlowStore.getState();
  const first = createDefaultWorkspace([createPreset('Current', [{ cluster: 'c', namespace: 'n' }])]);
  useOpsFlowStore.setState({
    workspaces: first.workspaces,
    activeWorkspaceId: first.activeWorkspaceId,
    presets: first.workspaces[0].presets,
    targets: [{ cluster: 'live', namespace: 'ns' }],
    activePresetId: first.workspaces[0].presets[0].id,
  });

  try {
    const result = parseWorkspaceImport(workspaceDocument());
    assert.equal(useOpsFlowStore.getState().importWorkspace(result, result.suggestedName ?? 'Imported', false), undefined);
    const state = useOpsFlowStore.getState();
    assert.equal(state.workspaces.length, 2);
    assert.equal(state.activeWorkspaceId, first.activeWorkspaceId);
    assert.equal(state.presets[0].name, 'Current');
    assert.equal(state.workspaces[1].presets[0].id === 'Production', false);
    assert.deepEqual(state.targets, [{ cluster: 'live', namespace: 'ns' }]);
    assert.equal(state.activePresetId, first.workspaces[0].presets[0].id);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('import can explicitly overwrite an existing Workspace and clears its active preset', () => {
  const original = useOpsFlowStore.getState();
  const first = createDefaultWorkspace([createPreset('Current', [{ cluster: 'c', namespace: 'n' }])]);
  first.workspaces[0].name = 'Payments Team';
  useOpsFlowStore.setState({
    workspaces: first.workspaces,
    activeWorkspaceId: first.activeWorkspaceId,
    presets: first.workspaces[0].presets,
    activePresetId: first.workspaces[0].presets[0].id,
  });

  try {
    const result = parseWorkspaceImport(workspaceDocument());
    assert.equal(useOpsFlowStore.getState().importWorkspace(result, 'Payments Team', true, { overwrite: true }), undefined);
    const state = useOpsFlowStore.getState();
    assert.equal(state.workspaces.length, 1);
    assert.equal(state.workspaces[0].id, first.activeWorkspaceId);
    assert.equal(state.presets[0].name, 'Production');
    assert.equal(state.activeWorkspaceId, first.activeWorkspaceId);
    assert.equal(state.activePresetId, null);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('bulk Workspace deletion keeps one Workspace and switches when active is removed', () => {
  const original = useOpsFlowStore.getState();
  const first = createDefaultWorkspace([createPreset('Current', [{ cluster: 'c', namespace: 'n' }])]);
  const second = { ...first.workspaces[0], id: 'second', name: 'Second', presets: [] };
  useOpsFlowStore.setState({
    workspaces: [first.workspaces[0], second],
    activeWorkspaceId: first.workspaces[0].id,
    presets: first.workspaces[0].presets,
  });

  try {
    assert.equal(useOpsFlowStore.getState().deleteWorkspaces([first.workspaces[0].id, second.id]), 'At least one Workspace must remain.');
    assert.equal(useOpsFlowStore.getState().deleteWorkspaces([first.workspaces[0].id]), undefined);
    assert.equal(useOpsFlowStore.getState().activeWorkspaceId, second.id);
    assert.equal(useOpsFlowStore.getState().workspaces.length, 1);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

test('the last Workspace cannot be deleted', () => {
  const original = useOpsFlowStore.getState();
  const catalog = createDefaultWorkspace();
  useOpsFlowStore.setState({ workspaces: catalog.workspaces, activeWorkspaceId: catalog.activeWorkspaceId, presets: [] });
  try {
    assert.equal(useOpsFlowStore.getState().deleteWorkspace(catalog.activeWorkspaceId), 'At least one Workspace must remain.');
    assert.equal(useOpsFlowStore.getState().workspaces.length, 1);
  } finally {
    useOpsFlowStore.setState(original);
  }
});

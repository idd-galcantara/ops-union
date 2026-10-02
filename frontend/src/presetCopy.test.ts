import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCopyPlan, entriesForCopy, validateCopyPlan, type CopyIntent } from './presetCopy';
import { createPreset } from './presets';
import { createWorkspace, type WorkspaceCatalog } from './workspaces';

function makeIntent(sourcePresetId: string, overrides: Partial<CopyIntent> = {}): CopyIntent {
  return {
    sourceWorkspaceId: 'source',
    sourcePresetIds: [sourcePresetId],
    destinationWorkspaceId: 'destination',
    ...overrides,
  };
}

test('copy plans allow an inactive source and create fresh portable records', () => {
  const sourcePreset = { ...createPreset('Payments', [{ cluster: ' c1 ', namespace: 'n1' }], ' Source '), lastUsedAt: 42 };
  const source = createWorkspace('Source', '', [sourcePreset]);
  const destination = createWorkspace('Destination');
  const catalog: WorkspaceCatalog = { version: 1, workspaces: [{ ...source, id: 'source' }, { ...destination, id: 'destination' }], activeWorkspaceId: 'destination' };
  const plan = buildCopyPlan(catalog, makeIntent(sourcePreset.id), (portable) => ({ id: 'fresh-id', ...portable }));

  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].preset.id, 'fresh-id');
  assert.equal(plan.entries[0].preset.lastUsedAt, undefined);
  assert.deepEqual(plan.entries[0].preset.targets, [{ cluster: 'c1', namespace: 'n1' }]);
  assert.equal(plan.entries[0].preset.description, 'Source');
  assert.equal(catalog.workspaces[0].presets[0].lastUsedAt, 42);
});

test('copy plans report semantic duplicates but allow name-only collisions', () => {
  const sourcePreset = createPreset('Shared name', [{ cluster: 'c1', namespace: 'n1' }]);
  const sameTargets = createPreset('Different name', sourcePreset.targets);
  const differentTargets = createPreset('Shared name', [{ cluster: 'c2', namespace: 'n2' }]);
  const source = createWorkspace('Source', '', [sourcePreset]);
  const destination = createWorkspace('Destination', '', [sameTargets]);
  const base: WorkspaceCatalog = { version: 1, workspaces: [{ ...source, id: 'source' }, { ...destination, id: 'destination' }], activeWorkspaceId: 'destination' };

  const duplicatePlan = buildCopyPlan(base, makeIntent(sourcePreset.id));
  assert.equal(duplicatePlan.conflicts[0].kind, 'semantic-duplicate');
  assert.equal(entriesForCopy(duplicatePlan, 'ignore').length, 0);

  const allowedPlan = buildCopyPlan({
    ...base,
    workspaces: [{ ...base.workspaces[0], presets: [sourcePreset] }, { ...base.workspaces[1], presets: [differentTargets] }],
  }, makeIntent(sourcePreset.id));
  assert.equal(allowedPlan.conflicts.length, 0);
});

test('copy plans invalidate when the catalog changes', () => {
  const sourcePreset = createPreset('Source', [{ cluster: 'c1', namespace: 'n1' }]);
  const source = createWorkspace('Source', '', [sourcePreset]);
  const destination = createWorkspace('Destination');
  const catalog: WorkspaceCatalog = { version: 1, workspaces: [{ ...source, id: 'source' }, { ...destination, id: 'destination' }], activeWorkspaceId: 'destination' };
  const plan = buildCopyPlan(catalog, makeIntent(sourcePreset.id));
  const changed = { ...catalog, workspaces: catalog.workspaces.map((workspace) => workspace.id === 'destination' ? { ...workspace, name: 'Changed' } : workspace) };

  assert.equal(validateCopyPlan(plan, changed)[0].kind, 'catalog-changed');
});
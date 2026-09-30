import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreset } from './presets';
import { buildTransferPlan, catalogForTransfer, entriesForTransfer, type TransferIntent } from './presetTransfer';
import { createWorkspace } from './workspaces';

function makeIntent(presetId = 'source-preset', overrides: Partial<TransferIntent> = {}): TransferIntent {
  return {
    mode: 'copy',
    sourceWorkspaceId: 'source',
    presetIds: [presetId],
    destinationWorkspaceIds: ['destination'],
    ...overrides,
  };
}

test('transfer plans create fresh portable records without usage metadata', () => {
  const sourcePreset = { ...createPreset('Payments', [
    { cluster: ' cluster-a ', namespace: 'namespace-a' },
    { cluster: 'cluster-a', namespace: 'namespace-a' },
  ], ' Saved '), lastUsedAt: 42 };
  const source = { id: 'source', name: 'Source', presets: [sourcePreset] };
  const destination = { id: 'destination', name: 'Destination', presets: [] };
  const plan = buildTransferPlan(
    catalogForTransfer([source, destination], 'source'),
    makeIntent(sourcePreset.id),
    (portable) => ({ id: 'fresh-id', ...portable }),
  );

  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].preset.id, 'fresh-id');
  assert.equal(plan.entries[0].preset.lastUsedAt, undefined);
  assert.deepEqual(plan.entries[0].preset.targets, [{ cluster: 'cluster-a', namespace: 'namespace-a' }]);
  assert.equal(plan.entries[0].preset.description, 'Saved');
  assert.equal(sourcePreset.lastUsedAt, 42);
});

test('semantic duplicates block a destination while name-only collisions are allowed', () => {
  const sourcePreset = createPreset('Shared name', [{ cluster: 'cluster-a', namespace: 'namespace-a' }]);
  const sameTargets = createPreset('Different name', [{ cluster: 'cluster-a', namespace: 'namespace-a' }]);
  const differentTargets = createPreset('Shared name', [{ cluster: 'cluster-b', namespace: 'namespace-b' }]);
  const source = { id: 'source', name: 'Source', presets: [sourcePreset] };
  const duplicatePlan = buildTransferPlan(
    catalogForTransfer([source, { id: 'destination', name: 'Destination', presets: [sameTargets] }], 'source'),
    makeIntent(sourcePreset.id),
  );
  assert.equal(duplicatePlan.conflicts[0].kind, 'semantic-duplicate');

  const allowedPlan = buildTransferPlan(
    catalogForTransfer([source, { id: 'destination', name: 'Destination', presets: [differentTargets] }], 'source'),
    makeIntent(sourcePreset.id),
  );
  assert.equal(allowedPlan.conflicts.length, 0);
});

test('the source Workspace cannot be selected as a destination', () => {
  const sourcePreset = createPreset('Source preset', [{ cluster: 'cluster-a', namespace: 'namespace-a' }]);
  const source = createWorkspace('Source', '', [sourcePreset]);
  const plan = buildTransferPlan(
    catalogForTransfer([source], source.id),
    makeIntent(sourcePreset.id, { sourceWorkspaceId: source.id, destinationWorkspaceIds: [source.id] }),
  );
  assert.equal(plan.conflicts[0].kind, 'destination-is-source');
});

test('transfer entries can exclude only the conflicting preset-destination combinations', () => {
  const sourcePreset = createPreset('Source preset', [{ cluster: 'cluster-a', namespace: 'namespace-a' }]);
  const source = { id: 'source', name: 'Source', presets: [sourcePreset] };
  const conflictingDestination = { id: 'destination-a', name: 'Destination A', presets: [createPreset('Existing', sourcePreset.targets)] };
  const clearDestination = { id: 'destination-b', name: 'Destination B', presets: [] };
  const plan = buildTransferPlan(
    catalogForTransfer([source, conflictingDestination, clearDestination], 'source'),
    makeIntent(sourcePreset.id, { destinationWorkspaceIds: [conflictingDestination.id, clearDestination.id] }),
  );

  assert.equal(plan.entries.length, 2);
  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(entriesForTransfer(plan, 'ignore').map((entry) => entry.destinationWorkspaceId), [clearDestination.id]);
  assert.equal(entriesForTransfer(plan, 'overwrite').length, 2);
});
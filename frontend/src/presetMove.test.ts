import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMovePlan, entriesForMove, validateMovePlan, type MoveIntent } from './presetMove';
import { createPreset } from './presets';
import { createWorkspace, type WorkspaceCatalog } from './workspaces';

function catalogWith(sourcePresets: ReturnType<typeof createPreset>[], destinationPresets: ReturnType<typeof createPreset>[] = []): WorkspaceCatalog {
  return {
    version: 1,
    workspaces: [
      { ...createWorkspace('Source', '', sourcePresets), id: 'source' },
      { ...createWorkspace('Destination', '', destinationPresets), id: 'destination' },
    ],
    activeWorkspaceId: 'destination',
  };
}

function intent(ids: string[], overrides: Partial<MoveIntent> = {}): MoveIntent {
  return {
    sourceWorkspaceId: 'source',
    sourcePresetIds: ids,
    destinationWorkspaceId: 'destination',
    ...overrides,
  };
}

test('move plans use portable records, fresh ids, and expose name-only collisions', () => {
  const source = { ...createPreset('Same name', [{ cluster: ' c1 ', namespace: 'n1' }], ' description '), lastUsedAt: 7 };
  const nameOnly = createPreset('Same name', [{ cluster: 'c2', namespace: 'n2' }]);
  const catalog = catalogWith([source], [nameOnly]);
  const plan = buildMovePlan(catalog, intent([source.id]), (portable) => ({ id: 'fresh', ...portable }));

  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.nameOnlyCollisions.length, 1);
  assert.equal(plan.entries[0].preset.id, 'fresh');
  assert.equal(plan.entries[0].preset.lastUsedAt, undefined);
  assert.deepEqual(plan.entries[0].preset.targets, [{ cluster: 'c1', namespace: 'n1' }]);
  assert.equal(plan.entries[0].preset.description, 'description');
  assert.notEqual(plan.entries[0].preset.id, source.id);
});

test('ignore skips a complete planned duplicate group while overwrite keeps the last source winner', () => {
  const first = createPreset('first', [{ cluster: 'c1', namespace: 'n1' }]);
  const second = createPreset('second', first.targets);
  const third = createPreset('third', [{ cluster: 'c2', namespace: 'n2' }]);
  const plan = buildMovePlan(catalogWith([first, second, third]), intent([first.id, second.id, third.id]), (portable) => ({ id: `${portable.name}-new`, ...portable }));

  assert.equal(plan.conflicts.some((conflict) => conflict.kind === 'planned-duplicate'), true);
  assert.deepEqual(entriesForMove(plan, 'ignore').map((entry) => entry.sourcePresetId), [third.id]);
  assert.deepEqual(entriesForMove(plan, 'overwrite').map((entry) => entry.sourcePresetId), [second.id, third.id]);
});

test('move plans reject active-source references and stale catalog signatures', () => {
  const sourcePreset = createPreset('source', [{ cluster: 'c1', namespace: 'n1' }]);
  const catalog = catalogWith([sourcePreset]);
  const plan = buildMovePlan(catalog, intent([sourcePreset.id], { activePresetId: sourcePreset.id }));
  assert.equal(plan.conflicts.some((conflict) => conflict.kind === 'active-reference-invalid'), true);
  assert.equal(validateMovePlan(plan, { ...catalog, activeWorkspaceId: 'source' })[0].kind, 'catalog-changed');
});

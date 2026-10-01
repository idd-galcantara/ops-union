import assert from 'node:assert/strict';
import test from 'node:test';
import { filterPresets, getPresetIds } from './presetLibraryModel';
import type { Preset } from './presets';

const presets: Preset[] = [
  { id: 'older', name: 'Payments', targets: [{ cluster: 'prod', namespace: 'payments' }], lastUsedAt: 10 },
  { id: 'newer', name: 'Checkout', description: 'Customer flow', targets: [{ cluster: 'stage', namespace: 'checkout' }], lastUsedAt: 20 },
];

test('preset view model searches names, descriptions, and targets in recent order', () => {
  assert.deepEqual(getPresetIds(filterPresets(presets, 'customer')), ['newer']);
  assert.deepEqual(getPresetIds(filterPresets(presets, 'prod')), ['older']);
  assert.deepEqual(getPresetIds(filterPresets(presets, '')), ['newer', 'older']);
});
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getQuickPresets, MAX_QUICK_PRESETS } from './launchpad';
import type { Preset } from './presets';

function createPresets(count: number): Preset[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `preset-${index}`,
    name: `Preset ${index}`,
    targets: [{ cluster: `cluster-${index}`, namespace: 'default' }],
  }));
}

test('getQuickPresets keeps the saved order and bounds the launchpad list', () => {
  const presets = createPresets(MAX_QUICK_PRESETS + 2);
  const visible = getQuickPresets(presets);

  assert.equal(visible.length, MAX_QUICK_PRESETS);
  assert.deepEqual(
    visible.map((preset) => preset.id),
    presets.slice(0, MAX_QUICK_PRESETS).map((preset) => preset.id),
  );
});

test('getQuickPresets returns an empty list when no presets are saved', () => {
  assert.deepEqual(getQuickPresets([]), []);
});

test('getQuickPresets selects the five most recently used presets', () => {
  const presets = createPresets(6).map((preset, index) => ({
    ...preset,
    ...(index === 0 ? { lastUsedAt: 10 } : {}),
    ...(index === 1 ? { lastUsedAt: 60 } : {}),
    ...(index === 2 ? { lastUsedAt: 30 } : {}),
    ...(index === 3 ? { lastUsedAt: 50 } : {}),
    ...(index === 4 ? { lastUsedAt: 40 } : {}),
  }));

  assert.deepEqual(
    getQuickPresets(presets).map((preset) => preset.id),
    ['preset-1', 'preset-3', 'preset-4', 'preset-2', 'preset-0'],
  );
});

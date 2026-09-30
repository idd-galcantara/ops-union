import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPresetSelectionState, reconcilePresetSelection, toggleVisiblePresetSelection } from './presetSelection';

test('preset selection reports unchecked, indeterminate, and checked visible states', () => {
  assert.deepEqual(getPresetSelectionState(new Set(), ['a', 'b']), {
    selectedVisibleCount: 0,
    allVisibleSelected: false,
    someVisibleSelected: false,
  });
  assert.deepEqual(getPresetSelectionState(new Set(['a']), ['a', 'b']), {
    selectedVisibleCount: 1,
    allVisibleSelected: false,
    someVisibleSelected: true,
  });
  assert.deepEqual(getPresetSelectionState(new Set(['a', 'b', 'hidden']), ['a', 'b']), {
    selectedVisibleCount: 2,
    allVisibleSelected: true,
    someVisibleSelected: false,
  });
});

test('selecting visible presets preserves hidden selection and toggles only the visible scope', () => {
  const selected = toggleVisiblePresetSelection(new Set(['hidden']), ['a', 'b']);
  assert.deepEqual([...selected], ['hidden', 'a', 'b']);
  assert.deepEqual([...toggleVisiblePresetSelection(selected, ['a', 'b'])], ['hidden']);
});

test('reconciliation removes stale ids without remapping reordered presets', () => {
  assert.deepEqual([...reconcilePresetSelection(new Set(['preset-b', 'stale']), ['preset-b', 'preset-a'])], ['preset-b']);
});
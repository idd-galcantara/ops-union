export interface PresetSelectionState {
  selectedVisibleCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
}

export function reconcilePresetSelection(
  selectedIds: ReadonlySet<string>,
  presetIds: readonly string[],
): Set<string> {
  const validIds = new Set(presetIds);
  return new Set([...selectedIds].filter((id) => validIds.has(id)));
}

export function toggleVisiblePresetSelection(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const next = new Set(selectedIds);
  for (const id of visibleIds) {
    if (allVisibleSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function getPresetSelectionState(
  selectedIds: ReadonlySet<string>,
  visibleIds: readonly string[],
): PresetSelectionState {
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  return {
    selectedVisibleCount,
    allVisibleSelected: visibleIds.length > 0 && selectedVisibleCount === visibleIds.length,
    someVisibleSelected: selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length,
  };
}
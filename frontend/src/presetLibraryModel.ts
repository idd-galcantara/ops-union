import { describePreset, orderPresetsByRecentUse, type Preset } from './presets';

export function filterPresets(presets: Preset[], query: string): Preset[] {
  const orderedPresets = orderPresetsByRecentUse(presets);
  const needle = query.trim().toLowerCase();
  if (!needle) return orderedPresets;
  return orderedPresets.filter((preset) => [
    preset.name,
    preset.description ?? '',
    describePreset(preset),
    ...preset.targets.flatMap((target) => [target.cluster, target.namespace]),
  ].join(' ').toLowerCase().includes(needle));
}

export function getPresetIds(presets: readonly Preset[]): string[] {
  return presets.map((preset) => preset.id);
}
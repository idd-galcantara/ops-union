import { orderPresetsByRecentUse, type Preset } from './presets';

export const MAX_QUICK_PRESETS = 5;

export function getQuickPresets(presets: Preset[]): Preset[] {
  return orderPresetsByRecentUse(presets).slice(0, MAX_QUICK_PRESETS);
}

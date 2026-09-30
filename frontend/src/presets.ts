import type { Target } from './types';
import { targetKey } from './types';

/** A saved combination of targets, e.g. "Example preset = cluster-a + cluster-b". */
export interface Preset {
  id: string;
  name: string;
  description?: string;
  targets: Target[];
  lastUsedAt?: number;
}

export const PRESET_EXPORT_FORMAT = 'ops-union.presets';
export const PRESET_EXPORT_VERSION = 1;

export interface PortablePreset {
  name: string;
  description?: string;
  targets: Target[];
}

export interface PresetExportDocument {
  format: typeof PRESET_EXPORT_FORMAT;
  version: typeof PRESET_EXPORT_VERSION;
  exportedAt: string;
  presets: PortablePreset[];
}

export interface InvalidImportedPreset {
  index: number;
  name?: string;
  reason: string;
}

export interface DuplicateImportedPreset {
  index: number;
  name: string;
  reason: string;
}

export interface PresetImportResult {
  accepted: PortablePreset[];
  invalid: InvalidImportedPreset[];
  duplicates: DuplicateImportedPreset[];
  error?: string;
}

const STORAGE_KEY = 'ops-union.presets.v1';

/** Loads the web fallback. Desktop hydration uses the Electron data directory. */
export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizePreset).filter((preset): preset is Preset => preset !== null);
  } catch {
    // Corrupted or unavailable storage must never break the app.
    return [];
  }
}

export function savePresets(presets: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage full or blocked; the desktop store can still persist independently.
  }

  if (typeof window !== 'undefined' && window.opsFlowDesktop) {
    void window.opsFlowDesktop.savePresets(presets).catch(() => undefined);
  }
}

/** Returns normalized portable content, excluding local ids and usage metadata. */
export function toPortablePreset(preset: Preset): PortablePreset {
  const normalizedTargets = normalizeTargets(preset.targets);
  return {
    name: preset.name.trim(),
    ...(preset.description?.trim() ? { description: preset.description.trim() } : {}),
    targets: normalizedTargets,
  };
}

/** Serializes the complete saved collection into the supported export envelope. */
export function serializePresets(
  presets: Preset[],
  exportedAt = new Date().toISOString(),
): string {
  const document: PresetExportDocument = {
    format: PRESET_EXPORT_FORMAT,
    version: PRESET_EXPORT_VERSION,
    exportedAt,
    presets: presets.map(toPortablePreset),
  };
  return JSON.stringify(document, null, 2);
}

/** Stable identity for a preset's normalized target set. */
export function presetSemanticKey(targets: Target[]): string {
  return normalizeTargets(targets)
    .map((target) => `${target.cluster}/${target.namespace}`)
    .sort()
    .join('|');
}

/** Parses an export without changing the store, producing reviewable results. */
export function parsePresetImport(raw: string, existingPresets: Preset[] = []): PresetImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return emptyImportResult('The selected file is not valid JSON.');
  }

  if (!isRecord(parsed) || parsed.format !== PRESET_EXPORT_FORMAT) {
    return emptyImportResult(`Unsupported preset document. Expected format "${PRESET_EXPORT_FORMAT}".`);
  }
  if (parsed.version !== PRESET_EXPORT_VERSION) {
    return emptyImportResult(`Unsupported preset document version: ${String(parsed.version)}.`);
  }
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    return emptyImportResult('The preset document has an invalid exportedAt timestamp.');
  }
  if (!Array.isArray(parsed.presets)) {
    return emptyImportResult('The preset document is missing its presets array.');
  }

  const knownKeys = new Set(existingPresets.map((preset) => presetSemanticKey(preset.targets)));
  const accepted: PortablePreset[] = [];
  const invalid: InvalidImportedPreset[] = [];
  const duplicates: DuplicateImportedPreset[] = [];

  parsed.presets.forEach((value, index) => {
    const result = normalizeImportedPreset(value, index);
    if ('invalid' in result) {
      invalid.push(result.invalid);
      return;
    }

    const key = presetSemanticKey(result.preset.targets);
    if (knownKeys.has(key)) {
      duplicates.push({
        index,
        name: result.preset.name,
        reason: 'Its normalized target set already exists in the current library or import.',
      });
      return;
    }
    knownKeys.add(key);
    accepted.push(result.preset);
  });

  return { accepted, invalid, duplicates };
}

function emptyImportResult(error: string): PresetImportResult {
  return { accepted: [], invalid: [], duplicates: [], error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeImportedPreset(
  value: unknown,
  index: number,
): { preset: PortablePreset } | { invalid: InvalidImportedPreset } {
  if (!isRecord(value)) {
    return { invalid: { index, reason: 'Preset entry must be an object.' } };
  }

  const rawName = value.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) {
    return {
      invalid: {
        index,
        reason: 'Preset name must be a non-empty string.',
      },
    };
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    return {
      invalid: { index, name, reason: 'Preset description must be a string when provided.' },
    };
  }
  if (!Array.isArray(value.targets)) {
    return { invalid: { index, name, reason: 'Preset targets must be an array.' } };
  }

  const targets = normalizeTargets(value.targets);
  if (targets.length === 0) {
    return {
      invalid: {
        index,
        name,
        reason: 'Preset must contain at least one target with a cluster and namespace.',
      },
    };
  }

  return {
    preset: {
      name,
      ...(typeof value.description === 'string' && value.description.trim()
        ? { description: value.description.trim() }
        : {}),
      targets,
    },
  };
}

function normalizeTargets(value: unknown): Target[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((target) => {
    if (!isRecord(target) || typeof target.cluster !== 'string' || typeof target.namespace !== 'string') {
      return [];
    }
    const cluster = target.cluster.trim();
    const namespace = target.namespace.trim();
    return cluster && namespace ? [{ cluster, namespace }] : [];
  });
  return [...new Map(normalized.map((target) => [targetKey(target), target])).values()];
}

/** Loads the stable desktop store, falling back to localStorage in web mode. */
export async function loadPersistentPresets(): Promise<Preset[]> {
  if (typeof window !== 'undefined' && window.opsFlowDesktop) {
    try {
      const presets = await window.opsFlowDesktop.loadPresets();
      return Array.isArray(presets)
        ? presets.map(normalizePreset).filter((preset): preset is Preset => preset !== null)
        : [];
    } catch {
      // A missing or unreadable desktop store should not break the UI.
    }
  }
  return loadPresets();
}

/** Validates untrusted data coming back from storage. */
function isPreset(value: unknown): value is Preset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    targets?: unknown;
    lastUsedAt?: unknown;
  };
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string') return false;
  if (candidate.description !== undefined && typeof candidate.description !== 'string') return false;
  if (!Array.isArray(candidate.targets)) return false;
  return candidate.targets.every(
    (t) =>
      t &&
      typeof t === 'object' &&
      typeof (t as Target).cluster === 'string' &&
      typeof (t as Target).namespace === 'string',
  );
}

function normalizePreset(value: unknown): Preset | null {
  if (!isPreset(value)) return null;
  if (value.lastUsedAt === undefined || isValidUsageTimestamp(value.lastUsedAt)) return value;
  const { lastUsedAt: _ignored, ...legacyPreset } = value;
  return legacyPreset;
}

function isValidUsageTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Builds a preset with a stable, collision-resistant id. */
export function createPreset(name: string, targets: Target[], description = ''): Preset {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    targets: targets.map((t) => ({ cluster: t.cluster, namespace: t.namespace })),
  };
}

/** Short human summary, e.g. "2 clusters · namespace-a". */
export function describePreset(preset: Preset): string {
  const clusters = new Set(preset.targets.map((t) => t.cluster));
  const namespaces = [...new Set(preset.targets.map((t) => t.namespace))];
  const clusterPart = `${clusters.size} cluster${clusters.size === 1 ? '' : 's'}`;
  const namespacePart = namespaces.length === 1 ? namespaces[0] : `${namespaces.length} namespaces`;
  return `${clusterPart} · ${namespacePart}`;
}

/** Orders recent presets first while preserving the original order for ties. */
export function orderPresetsByRecentUse(presets: Preset[]): Preset[] {
  return presets
    .map((preset, index) => ({ preset, index }))
    .sort((left, right) => {
      const leftUsage = left.preset.lastUsedAt ?? -Infinity;
      const rightUsage = right.preset.lastUsedAt ?? -Infinity;
      return rightUsage - leftUsage || left.index - right.index;
    })
    .map(({ preset }) => preset);
}

/** Returns a new preset collection with one valid preset marked as recently used. */
export function markPresetUsed(
  presets: Preset[],
  id: string,
  lastUsedAt = Date.now(),
): Preset[] {
  if (!isValidUsageTimestamp(lastUsedAt) || !presets.some((preset) => preset.id === id)) {
    return presets;
  }
  return presets.map((preset) =>
    preset.id === id ? { ...preset, lastUsedAt } : preset,
  );
}

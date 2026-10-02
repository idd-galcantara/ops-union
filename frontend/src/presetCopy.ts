import {
  createPreset,
  presetSemanticKey,
  toPortablePreset,
  type Preset,
} from './presets';
import type { Target } from './types';
import type { WorkspaceCatalog } from './workspaces';

export type CopyConflictStrategy = 'reject' | 'ignore' | 'overwrite';

export interface CopyIntent {
  sourceWorkspaceId: string;
  sourcePresetIds: string[];
  destinationWorkspaceId: string;
}

export type CopyConflictKind =
  | 'source-missing'
  | 'destination-missing'
  | 'source-is-destination'
  | 'destination-not-active'
  | 'semantic-duplicate'
  | 'planned-duplicate'
  | 'catalog-changed';

export interface CopyConflict {
  kind: CopyConflictKind;
  sourcePresetId?: string;
  sourcePresetName?: string;
  destinationWorkspaceId?: string;
  destinationWorkspaceName?: string;
  conflictingPresetId?: string;
  targetKey?: string;
  message: string;
}

export interface CopyPlanEntry {
  sourcePresetId: string;
  destinationWorkspaceId: string;
  preset: Preset;
}

export interface CopyPlan {
  intent: CopyIntent;
  entries: CopyPlanEntry[];
  conflicts: CopyConflict[];
  catalogSignature: string;
}

export type CopyIdFactory = (portable: {
  name: string;
  description?: string;
  targets: Target[];
}) => Preset;

export function buildCopyPlan(
  catalog: WorkspaceCatalog,
  intent: CopyIntent,
  idFactory: CopyIdFactory = (portable) => createPreset(portable.name, portable.targets, portable.description ?? ''),
): CopyPlan {
  const normalizedIntent = normalizeIntent(intent);
  const conflicts: CopyConflict[] = [];
  const entries: CopyPlanEntry[] = [];
  const source = catalog.workspaces.find((workspace) => workspace.id === normalizedIntent.sourceWorkspaceId);
  const destination = catalog.workspaces.find((workspace) => workspace.id === normalizedIntent.destinationWorkspaceId);

  if (!destination) {
    conflicts.push({
      kind: 'destination-missing',
      destinationWorkspaceId: normalizedIntent.destinationWorkspaceId,
      message: 'The destination Workspace no longer exists.',
    });
  } else if (catalog.activeWorkspaceId !== destination.id) {
    conflicts.push({
      kind: 'destination-not-active',
      destinationWorkspaceId: destination.id,
      destinationWorkspaceName: destination.name,
      message: 'The destination Workspace is no longer active.',
    });
  }

  if (!source) {
    conflicts.push({
      kind: 'source-missing',
      sourcePresetId: normalizedIntent.sourceWorkspaceId,
      message: 'The source Workspace no longer exists.',
    });
  } else if (source.id === normalizedIntent.destinationWorkspaceId) {
    conflicts.push({
      kind: 'source-is-destination',
      destinationWorkspaceId: destination?.id,
      destinationWorkspaceName: destination?.name,
      message: 'The Active Workspace cannot be copied into itself.',
    });
  }

  const sourcePresets = new Map(source?.presets.map((preset) => [preset.id, preset]) ?? []);
  const selected = normalizedIntent.sourcePresetIds.map((id) => sourcePresets.get(id));
  normalizedIntent.sourcePresetIds.forEach((id, index) => {
    if (selected[index]) return;
    conflicts.push({
      kind: 'source-missing',
      sourcePresetId: id,
      destinationWorkspaceId: normalizedIntent.destinationWorkspaceId,
      message: 'One or more selected presets are no longer available.',
    });
  });

  if (!destination || !source || source.id === destination.id) {
    return { intent: normalizedIntent, entries, conflicts, catalogSignature: copyCatalogSignature(catalog) };
  }

  const usedPresetIds = new Set(catalog.workspaces.flatMap((workspace) => workspace.presets.map((preset) => preset.id)));
  const existingByKey = new Map(destination.presets.map((preset) => [presetSemanticKey(preset.targets), preset]));
  const plannedByKey = new Map<string, CopyPlanEntry>();

  for (const preset of selected) {
    if (!preset) continue;
    const portable = toPortablePreset(preset);
    const targetKey = presetSemanticKey(portable.targets);
    const existing = existingByKey.get(targetKey);
    const planned = plannedByKey.get(targetKey);
    if (existing) {
      conflicts.push({
        kind: 'semantic-duplicate',
        sourcePresetId: preset.id,
        sourcePresetName: preset.name,
        destinationWorkspaceId: destination.id,
        destinationWorkspaceName: destination.name,
        conflictingPresetId: existing.id,
        targetKey,
        message: `${preset.name} already exists in ${destination.name} with the same targets.`,
      });
    } else if (planned) {
      conflicts.push({
        kind: 'planned-duplicate',
        sourcePresetId: preset.id,
        sourcePresetName: preset.name,
        destinationWorkspaceId: destination.id,
        destinationWorkspaceName: destination.name,
        conflictingPresetId: planned.sourcePresetId,
        targetKey,
        message: `${preset.name} duplicates another selected preset with the same targets. Only one copy will be kept.`,
      });
    }

    let created = idFactory(portable);
    while (usedPresetIds.has(created.id)) {
      created = createPreset(portable.name, portable.targets, portable.description ?? '');
    }
    usedPresetIds.add(created.id);
    const entry = { sourcePresetId: preset.id, destinationWorkspaceId: destination.id, preset: created };
    entries.push(entry);
    plannedByKey.set(targetKey, entry);
  }

  return { intent: normalizedIntent, entries, conflicts, catalogSignature: copyCatalogSignature(catalog) };
}

export function validateCopyPlan(plan: CopyPlan, catalog: WorkspaceCatalog): CopyConflict[] {
  if (plan.catalogSignature !== copyCatalogSignature(catalog)) {
    return [{ kind: 'catalog-changed', message: 'The Workspace catalog changed. Review the copy again.' }];
  }
  return buildCopyPlan(catalog, plan.intent, (portable) => ({ id: 'validation-id', ...portable })).conflicts;
}

export function copyEntryKey(sourcePresetId: string): string {
  return sourcePresetId;
}

export function entriesForCopy(plan: CopyPlan, strategy: CopyConflictStrategy): CopyPlanEntry[] {
  if (strategy === 'overwrite') return plan.entries;
  const conflicted = new Set(
    plan.conflicts
      .filter((conflict) => conflict.sourcePresetId)
      .map((conflict) => copyEntryKey(conflict.sourcePresetId!)),
  );
  return plan.entries.filter((entry) => !conflicted.has(copyEntryKey(entry.sourcePresetId)));
}

export function copyCatalogSignature(catalog: WorkspaceCatalog): string {
  return JSON.stringify({
    activeWorkspaceId: catalog.activeWorkspaceId,
    workspaces: catalog.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      description: workspace.description,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      presets: workspace.presets.map((preset) => ({
        id: preset.id,
        ...toPortablePreset(preset),
        lastUsedAt: preset.lastUsedAt,
      })),
    })),
  });
}

function normalizeIntent(intent: CopyIntent): CopyIntent {
  return {
    ...intent,
    sourcePresetIds: [...new Set(intent.sourcePresetIds)],
  };
}
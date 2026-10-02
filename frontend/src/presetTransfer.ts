import {
  createPreset,
  presetSemanticKey,
  toPortablePreset,
  type Preset,
} from './presets';
import type { Target } from './types';
import type { Workspace, WorkspaceCatalog } from './workspaces';

export type TransferMode = 'copy' | 'move';
export type TransferConflictStrategy = 'reject' | 'ignore' | 'overwrite';

export interface TransferIntent {
  mode: TransferMode;
  sourceWorkspaceId: string;
  presetIds: string[];
  destinationWorkspaceIds: string[];
}

export type TransferConflictKind =
  | 'source-not-active'
  | 'source-missing'
  | 'destination-missing'
  | 'destination-is-source'
  | 'semantic-duplicate'
  | 'planned-duplicate'
  | 'catalog-changed';

export interface TransferConflict {
  kind: TransferConflictKind;
  sourcePresetId?: string;
  sourcePresetName?: string;
  destinationWorkspaceId?: string;
  destinationWorkspaceName?: string;
  conflictingPresetId?: string;
  targetKey?: string;
  message: string;
}

export interface TransferPlanEntry {
  sourcePresetId: string;
  destinationWorkspaceId: string;
  preset: Preset;
}

export interface TransferPlan {
  intent: TransferIntent;
  entries: TransferPlanEntry[];
  conflicts: TransferConflict[];
  catalogSignature: string;
}

export type TransferIdFactory = (portable: {
  name: string;
  description?: string;
  targets: Target[];
}) => Preset;

export function catalogForTransfer(
  workspaces: Workspace[],
  activeWorkspaceId: string,
  activePresets?: Preset[],
): WorkspaceCatalog {
  return {
    version: 1,
    activeWorkspaceId,
    workspaces: workspaces.map((workspace) =>
      workspace.id === activeWorkspaceId && activePresets
        ? { ...workspace, presets: activePresets }
        : workspace,
    ),
  };
}

export function buildTransferPlan(
  catalog: WorkspaceCatalog,
  intent: TransferIntent,
  idFactory: TransferIdFactory = (portable) => createPreset(portable.name, portable.targets, portable.description ?? ''),
): TransferPlan {
  const normalizedIntent = normalizeIntent(intent);
  const source = catalog.workspaces.find((workspace) => workspace.id === normalizedIntent.sourceWorkspaceId);
  const conflicts: TransferConflict[] = [];
  const entries: TransferPlanEntry[] = [];

  if (catalog.activeWorkspaceId !== normalizedIntent.sourceWorkspaceId) {
    conflicts.push({
      kind: 'source-not-active',
      destinationWorkspaceId: normalizedIntent.sourceWorkspaceId,
      message: 'The source Workspace is no longer active.',
    });
  }

  if (!source) {
    conflicts.push({
      kind: 'source-missing',
      destinationWorkspaceId: normalizedIntent.sourceWorkspaceId,
      message: 'The source Workspace no longer exists.',
    });
  }

  const sourcePresets = new Map(source?.presets.map((preset) => [preset.id, preset]) ?? []);
  const usedPresetIds = new Set(catalog.workspaces.flatMap((workspace) => workspace.presets.map((preset) => preset.id)));
  const selected = normalizedIntent.presetIds.map((id) => sourcePresets.get(id));
  normalizedIntent.presetIds.forEach((id, index) => {
    if (selected[index]) return;
    conflicts.push({
      kind: 'source-missing',
      sourcePresetId: id,
      destinationWorkspaceId: normalizedIntent.sourceWorkspaceId,
      message: 'One or more selected presets are no longer available.',
    });
  });

  const workspacesById = new Map(catalog.workspaces.map((workspace) => [workspace.id, workspace]));
  for (const destinationWorkspaceId of normalizedIntent.destinationWorkspaceIds) {
    const destination = workspacesById.get(destinationWorkspaceId);
    if (!destination) {
      conflicts.push({
        kind: 'destination-missing',
        destinationWorkspaceId,
        message: 'A selected destination Workspace no longer exists.',
      });
      continue;
    }
    if (destinationWorkspaceId === normalizedIntent.sourceWorkspaceId) {
      conflicts.push({
        kind: 'destination-is-source',
        destinationWorkspaceId,
        destinationWorkspaceName: destination.name,
        message: 'The source Workspace cannot be a destination.',
      });
      continue;
    }

    const existingByKey = new Map(destination.presets.map((preset) => [presetSemanticKey(preset.targets), preset]));
    const plannedByKey = new Map<string, TransferPlanEntry>();
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
          destinationWorkspaceId,
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
          destinationWorkspaceId,
          destinationWorkspaceName: destination.name,
          conflictingPresetId: planned.sourcePresetId,
          targetKey,
          message: `${preset.name} duplicates another selected preset with the same targets. Only one copy will be kept.`,
        });
      }

      let created = idFactory(portable);
      if (usedPresetIds.has(created.id)) created = createPreset(portable.name, portable.targets, portable.description ?? '');
      while (usedPresetIds.has(created.id)) {
        created = createPreset(portable.name, portable.targets, portable.description ?? '');
      }
      usedPresetIds.add(created.id);
      const entry = { sourcePresetId: preset.id, destinationWorkspaceId, preset: created };
      entries.push(entry);
      plannedByKey.set(targetKey, entry);
    }
  }

  return {
    intent: normalizedIntent,
    entries,
    conflicts,
    catalogSignature: transferCatalogSignature(catalog),
  };
}

export function validateTransferPlan(plan: TransferPlan, catalog: WorkspaceCatalog): TransferConflict[] {
  if (plan.catalogSignature !== transferCatalogSignature(catalog)) {
    return [{ kind: 'catalog-changed', message: 'The Workspace catalog changed. Review the transfer again.' }];
  }
  return buildTransferPlan(catalog, plan.intent, (portable) => ({
    id: 'validation-id',
    ...portable,
  })).conflicts;
}

export function transferEntryKey(sourcePresetId: string, destinationWorkspaceId: string): string {
  return `${sourcePresetId}\u0000${destinationWorkspaceId}`;
}

export function conflictEntryKeys(plan: TransferPlan): Set<string> {
  return new Set(
    plan.conflicts
      .filter((conflict) => conflict.sourcePresetId && conflict.destinationWorkspaceId)
      .map((conflict) => transferEntryKey(conflict.sourcePresetId!, conflict.destinationWorkspaceId!)),
  );
}

export function entriesForTransfer(
  plan: TransferPlan,
  strategy: TransferConflictStrategy,
): TransferPlanEntry[] {
  if (strategy === 'overwrite') return plan.entries;
  const conflicted = conflictEntryKeys(plan);
  return plan.entries.filter((entry) => !conflicted.has(transferEntryKey(entry.sourcePresetId, entry.destinationWorkspaceId)));
}

export function transferCatalogSignature(catalog: WorkspaceCatalog): string {
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

function normalizeIntent(intent: TransferIntent): TransferIntent {
  return {
    ...intent,
    presetIds: [...new Set(intent.presetIds)],
    destinationWorkspaceIds: [...new Set(intent.destinationWorkspaceIds)],
  };
}
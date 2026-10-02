import {
  createPreset,
  presetSemanticKey,
  toPortablePreset,
  type Preset,
} from './presets';
import type { Target } from './types';
import type { WorkspaceCatalog } from './workspaces';

export type MoveConflictStrategy = 'reject' | 'ignore' | 'overwrite';

export interface MoveIntent {
  sourceWorkspaceId: string;
  sourcePresetIds: string[];
  destinationWorkspaceId: string;
  activePresetId?: string | null;
}

export type MoveConflictKind =
  | 'source-not-inactive'
  | 'source-missing'
  | 'destination-missing'
  | 'destination-not-active'
  | 'source-is-destination'
  | 'source-preset-missing'
  | 'active-reference-invalid'
  | 'semantic-duplicate'
  | 'planned-duplicate'
  | 'catalog-changed';

export interface MoveConflict {
  kind: MoveConflictKind;
  sourcePresetId?: string;
  sourcePresetName?: string;
  destinationWorkspaceId?: string;
  destinationWorkspaceName?: string;
  conflictingPresetId?: string;
  targetKey?: string;
  message: string;
}

export interface MoveNameCollision {
  sourcePresetId: string;
  sourcePresetName: string;
  destinationPresetId: string;
  destinationPresetName: string;
  targetKey: string;
}

export interface MovePlanEntry {
  sourcePresetId: string;
  destinationWorkspaceId: string;
  targetKey: string;
  preset: Preset;
}

export interface MovePlan {
  intent: MoveIntent;
  entries: MovePlanEntry[];
  conflicts: MoveConflict[];
  nameOnlyCollisions: MoveNameCollision[];
  sourceRemovalIds: string[];
  catalogSignature: string;
}

export type MoveIdFactory = (portable: {
  name: string;
  description?: string;
  targets: Target[];
}) => Preset;

export function buildMovePlan(
  catalog: WorkspaceCatalog,
  intent: MoveIntent,
  idFactory: MoveIdFactory = (portable) => createPreset(portable.name, portable.targets, portable.description ?? ''),
): MovePlan {
  const normalizedIntent = normalizeIntent(intent);
  const conflicts: MoveConflict[] = [];
  const entries: MovePlanEntry[] = [];
  const nameOnlyCollisions: MoveNameCollision[] = [];
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
      destinationWorkspaceId: normalizedIntent.sourceWorkspaceId,
      message: 'The source Workspace no longer exists.',
    });
  } else if (source.id === normalizedIntent.destinationWorkspaceId) {
    conflicts.push({
      kind: 'source-is-destination',
      destinationWorkspaceId: destination?.id,
      destinationWorkspaceName: destination?.name,
      message: 'The source Workspace cannot be moved into itself.',
    });
  } else if (source.id === catalog.activeWorkspaceId) {
    conflicts.push({
      kind: 'source-not-inactive',
      destinationWorkspaceId: source.id,
      destinationWorkspaceName: source.name,
      message: 'The source Workspace must remain inactive during the move.',
    });
  }

  if (normalizedIntent.sourcePresetIds.length === 0) {
    conflicts.push({
      kind: 'source-preset-missing',
      destinationWorkspaceId: normalizedIntent.destinationWorkspaceId,
      message: 'Select at least one source preset.',
    });
  }

  if (normalizedIntent.activePresetId) {
    const activeInDestination = destination?.presets.some((preset) => preset.id === normalizedIntent.activePresetId);
    const activeInSource = source?.presets.some((preset) => preset.id === normalizedIntent.activePresetId);
    if (!activeInDestination || activeInSource && normalizedIntent.sourcePresetIds.includes(normalizedIntent.activePresetId)) {
      conflicts.push({
        kind: 'active-reference-invalid',
        sourcePresetId: normalizedIntent.activePresetId,
        destinationWorkspaceId: normalizedIntent.destinationWorkspaceId,
        message: 'The active preset reference is not owned by the destination Workspace.',
      });
    }
  }

  const sourcePresets = new Map(source?.presets.map((preset) => [preset.id, preset]) ?? []);
  const selected = normalizedIntent.sourcePresetIds.map((id) => sourcePresets.get(id));
  normalizedIntent.sourcePresetIds.forEach((id, index) => {
    if (selected[index]) return;
    conflicts.push({
      kind: 'source-preset-missing',
      sourcePresetId: id,
      destinationWorkspaceId: normalizedIntent.destinationWorkspaceId,
      message: 'One or more selected presets are no longer available.',
    });
  });

  if (!destination || !source || source.id === destination.id || source.id === catalog.activeWorkspaceId) {
    return {
      intent: normalizedIntent,
      entries,
      conflicts,
      nameOnlyCollisions,
      sourceRemovalIds: [],
      catalogSignature: moveCatalogSignature(catalog),
    };
  }

  const usedPresetIds = new Set(catalog.workspaces.flatMap((workspace) => workspace.presets.map((preset) => preset.id)));
  const existingByKey = new Map(destination.presets.map((preset) => [presetSemanticKey(preset.targets), preset]));
  const existingByName = new Map(destination.presets.map((preset) => [preset.name.trim().toLocaleLowerCase(), preset]));
  const plannedByKey = new Map<string, MovePlanEntry>();

  for (const preset of selected) {
    if (!preset) continue;
    const portable = toPortablePreset(preset);
    const targetKey = presetSemanticKey(portable.targets);
    const existing = existingByKey.get(targetKey);
    const planned = plannedByKey.get(targetKey);
    const nameCollision = existingByName.get(portable.name.toLocaleLowerCase());
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
        message: `${preset.name} duplicates another selected preset with the same targets.`,
      });
    } else if (nameCollision) {
      nameOnlyCollisions.push({
        sourcePresetId: preset.id,
        sourcePresetName: preset.name,
        destinationPresetId: nameCollision.id,
        destinationPresetName: nameCollision.name,
        targetKey,
      });
    }

    let created = idFactory(portable);
    let attempts = 0;
    while (usedPresetIds.has(created.id) && attempts < 10) {
      created = createPreset(portable.name, portable.targets, portable.description ?? '');
      attempts += 1;
    }
    if (usedPresetIds.has(created.id)) {
      conflicts.push({
        kind: 'catalog-changed',
        sourcePresetId: preset.id,
        message: 'A fresh destination preset identity could not be allocated.',
      });
      continue;
    }
    usedPresetIds.add(created.id);
    const entry = { sourcePresetId: preset.id, destinationWorkspaceId: destination.id, targetKey, preset: created };
    entries.push(entry);
    plannedByKey.set(targetKey, entry);
  }

  const sourceRemovalIds = entriesForMove(
    { intent: normalizedIntent, entries, conflicts, nameOnlyCollisions, sourceRemovalIds: [], catalogSignature: moveCatalogSignature(catalog) },
    'ignore',
  ).map((entry) => entry.sourcePresetId);

  return {
    intent: normalizedIntent,
    entries,
    conflicts,
    nameOnlyCollisions,
    sourceRemovalIds,
    catalogSignature: moveCatalogSignature(catalog),
  };
}

export function validateMovePlan(plan: MovePlan, catalog: WorkspaceCatalog): MoveConflict[] {
  if (plan.catalogSignature !== moveCatalogSignature(catalog)) {
    return [{ kind: 'catalog-changed', message: 'The Workspace catalog changed. Review the move again.' }];
  }
  return buildMovePlan(catalog, plan.intent, (portable) => ({ id: 'validation-id', ...portable })).conflicts;
}

export function entriesForMove(plan: MovePlan, strategy: MoveConflictStrategy): MovePlanEntry[] {
  const semanticConflicts = plan.conflicts.filter(
    (conflict) => conflict.kind === 'semantic-duplicate' || conflict.kind === 'planned-duplicate',
  );
  if (strategy === 'reject') return semanticConflicts.length === 0 ? plan.entries : [];
  const conflictsBySource = new Set(
    plan.conflicts
      .filter((conflict) => conflict.sourcePresetId && (conflict.kind === 'semantic-duplicate' || conflict.kind === 'planned-duplicate'))
      .map((conflict) => conflict.sourcePresetId!),
  );
  const entriesByKey = new Map<string, MovePlanEntry[]>();
  for (const entry of plan.entries) {
    const group = entriesByKey.get(entry.targetKey) ?? [];
    group.push(entry);
    entriesByKey.set(entry.targetKey, group);
  }
  return plan.entries.filter((entry) => {
    const group = entriesByKey.get(entry.targetKey) ?? [];
    if (strategy === 'ignore') return group.length === 1 && !conflictsBySource.has(entry.sourcePresetId);
    return group[group.length - 1]?.sourcePresetId === entry.sourcePresetId;
  });
}

export function moveCatalogSignature(catalog: WorkspaceCatalog): string {
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

function normalizeIntent(intent: MoveIntent): MoveIntent {
  return {
    ...intent,
    sourcePresetIds: [...new Set(intent.sourcePresetIds)],
  };
}

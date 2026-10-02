import {
  createPreset,
  markPresetUsed,
  presetSemanticKey,
  type PortablePreset,
} from '../presets';
import {
  activeWorkspace,
  createDefaultWorkspace,
  createWorkspace as createWorkspaceRecord,
  loadWorkspaceCatalog,
  persistWorkspaceCatalog,
  persistWorkspaceCatalogAndWait,
  serializeWorkspace,
  serializeWorkspaceBundle,
  validateWorkspaceName,
  type WorkspaceCatalog,
} from '../workspaces';
import {
  catalogForTransfer,
  entriesForTransfer,
  transferEntryKey,
  validateTransferPlan,
} from '../presetTransfer';
import {
  copyCatalogSignature,
  entriesForCopy,
  validateCopyPlan,
  type CopyConflictStrategy,
  type CopyPlan,
} from '../presetCopy';
import {
  entriesForMove,
  moveCatalogSignature,
  validateMovePlan,
  type MoveConflictStrategy,
  type MovePlan,
} from '../presetMove';
import { targetKey } from '../types';
import type {
  OpsFlowState,
  StoreGet,
  StoreHelpers,
  StoreSet,
  TransferResult,
} from './types';

function catalogWithPresets(
  state: OpsFlowState,
  presets: OpsFlowState['presets'],
  activeWorkspaceId = state.activeWorkspaceId,
): WorkspaceCatalog {
  return {
    version: 1,
    activeWorkspaceId,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === state.activeWorkspaceId
        ? { ...workspace, presets, updatedAt: new Date().toISOString() }
        : workspace,
    ),
  };
}

function persistState(
  state: OpsFlowState,
  presets: OpsFlowState['presets'],
  activeWorkspaceId = state.activeWorkspaceId,
): void {
  persistWorkspaceCatalog(catalogWithPresets(state, presets, activeWorkspaceId));
}

export function createWorkspaceActions(
  set: StoreSet,
  get: StoreGet,
  helpers: StoreHelpers,
): Pick<
  OpsFlowState,
  | 'hydratePresets'
  | 'createWorkspace'
  | 'renameWorkspace'
  | 'switchWorkspace'
  | 'deleteWorkspace'
  | 'deleteWorkspaces'
  | 'importWorkspace'
  | 'exportWorkspaces'
  | 'exportActiveWorkspace'
  | 'savePreset'
  | 'updatePreset'
  | 'applyPreset'
  | 'deletePreset'
  | 'deletePresets'
  | 'transferPresets'
  | 'copyPresetsFromWorkspace'
  | 'movePresetsFromWorkspace'
  | 'appendImportedPresets'
  | 'clearPresets'
> {
  return {
    hydratePresets: async () => {
      const catalog = await loadWorkspaceCatalog();
      const current = activeWorkspace(catalog);
      set({
        workspaces: catalog.workspaces,
        activeWorkspaceId: current.id,
        presets: current.presets,
        activePresetId: null,
        activePresetDirty: false,
      });
    },

    createWorkspace: (name, description = '') => {
      const state = get();
      const error = validateWorkspaceName(name, state.workspaces);
      if (error) return error;
      const workspace = createWorkspaceRecord(name, description);
      const workspaces = [...state.workspaces, workspace];
      persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId: workspace.id });
      set({
        workspaces,
        activeWorkspaceId: workspace.id,
        presets: [],
        activePresetId: null,
        activePresetDirty: false,
      });
      helpers.resetWorkspaceView();
      return undefined;
    },

    renameWorkspace: (id, name, description = '') => {
      const state = get();
      const current = state.workspaces.find((workspace) => workspace.id === id);
      if (!current) return 'Workspace no longer exists.';
      const error = validateWorkspaceName(name, state.workspaces, id);
      if (error) return error;
      const workspaces = state.workspaces.map((workspace) => workspace.id === id
        ? {
            ...workspace,
            name: name.trim(),
            ...(description.trim() ? { description: description.trim() } : { description: undefined }),
            updatedAt: new Date().toISOString(),
          }
        : workspace);
      persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId: state.activeWorkspaceId });
      set({ workspaces });
      return undefined;
    },

    switchWorkspace: (id) => {
      const state = get();
      const workspace = state.workspaces.find((item) => item.id === id);
      if (!workspace) return 'Workspace no longer exists.';
      if (id === state.activeWorkspaceId) return undefined;
      persistState(state, state.presets, id);
      set({
        activeWorkspaceId: id,
        presets: workspace.presets,
        activePresetId: workspace.presets.some((preset) => preset.id === state.activePresetId) ? state.activePresetId : null,
        activePresetDirty: false,
      });
      helpers.resetWorkspaceView();
      return undefined;
    },

    deleteWorkspace: (id) => {
      const state = get();
      if (state.workspaces.length <= 1) return 'At least one Workspace must remain.';
      if (!state.workspaces.some((workspace) => workspace.id === id)) return 'Workspace no longer exists.';
      const index = state.workspaces.findIndex((workspace) => workspace.id === id);
      const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
      const activeDeleted = id === state.activeWorkspaceId;
      const nextActiveId = activeDeleted
        ? (workspaces[Math.min(index, workspaces.length - 1)]?.id ?? workspaces[0].id)
        : state.activeWorkspaceId;
      const nextActive = workspaces.find((workspace) => workspace.id === nextActiveId) ?? workspaces[0];
      persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId: nextActive.id });
      set({
        workspaces,
        activeWorkspaceId: nextActive.id,
        presets: nextActive.presets,
        activePresetId: id === state.activeWorkspaceId ? null : state.activePresetId,
        activePresetDirty: id === state.activeWorkspaceId ? false : state.activePresetDirty,
      });
      if (activeDeleted) helpers.resetWorkspaceView();
      return undefined;
    },

    deleteWorkspaces: (ids) => {
      const state = get();
      const idsToDelete = new Set(ids);
      const selected = state.workspaces.filter((workspace) => idsToDelete.has(workspace.id));
      if (selected.length === 0) return 'No Workspaces selected.';
      if (selected.length >= state.workspaces.length) return 'At least one Workspace must remain.';

      const activeIndex = state.workspaces.findIndex((workspace) => workspace.id === state.activeWorkspaceId);
      const workspaces = state.workspaces.filter((workspace) => !idsToDelete.has(workspace.id));
      const activeDeleted = idsToDelete.has(state.activeWorkspaceId);
      const nextActiveId = activeDeleted
        ? (workspaces[Math.min(activeIndex, workspaces.length - 1)]?.id ?? workspaces[0].id)
        : state.activeWorkspaceId;
      const nextActive = workspaces.find((workspace) => workspace.id === nextActiveId) ?? workspaces[0];
      persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId: nextActive.id });
      set({
        workspaces,
        activeWorkspaceId: nextActive.id,
        presets: activeDeleted ? nextActive.presets : state.presets,
        ...(activeDeleted ? { activePresetId: null, activePresetDirty: false } : {}),
      });
      if (activeDeleted) helpers.resetWorkspaceView();
      return undefined;
    },

    importWorkspace: (result, name, activate, options = {}) => {
      if (result.error || result.accepted.length === 0) return result.error ?? 'The import contains no valid presets.';
      const state = get();
      const trimmedName = name.trim();
      const existing = state.workspaces.find((workspace) => workspace.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase());
      const error = existing && !options.overwrite
        ? validateWorkspaceName(trimmedName, state.workspaces)
        : validateWorkspaceName(trimmedName, existing ? state.workspaces.filter((workspace) => workspace.id !== existing.id) : state.workspaces);
      if (error) return error;
      const importedPresets = result.accepted.map((preset) => createPreset(preset.name, preset.targets, preset.description ?? ''));
      if (existing && options.overwrite) {
        const replaced = {
          ...existing,
          description: result.description?.trim() || undefined,
          presets: importedPresets,
          updatedAt: new Date().toISOString(),
        };
        const workspaces = state.workspaces.map((workspace) => workspace.id === existing.id ? replaced : workspace);
        const showImported = activate || existing.id === state.activeWorkspaceId;
        const activeWorkspaceId = activate ? existing.id : state.activeWorkspaceId;
        persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId });
        set({
          workspaces,
          activeWorkspaceId,
          presets: showImported ? importedPresets : state.presets,
          ...(showImported ? { activePresetId: null, activePresetDirty: false } : {}),
        });
        if (showImported) helpers.resetWorkspaceView();
        return undefined;
      }

      const imported = createWorkspaceRecord(trimmedName, result.description ?? '', importedPresets);
      const workspaces = [...state.workspaces, imported];
      const activeWorkspaceId = activate ? imported.id : state.activeWorkspaceId;
      const visible = activate ? imported.presets : state.presets;
      persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId });
      set({
        workspaces,
        activeWorkspaceId,
        presets: visible,
        ...(activate ? { activePresetId: null, activePresetDirty: false } : {}),
      });
      if (activate) helpers.resetWorkspaceView();
      return undefined;
    },

    exportActiveWorkspace: (exportedAt) => {
      const state = get();
      const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? createDefaultWorkspace().workspaces[0];
      return serializeWorkspace({ ...workspace, presets: state.presets }, exportedAt);
    },

    exportWorkspaces: (ids, exportedAt) => {
      const state = get();
      const selected = state.workspaces
        .filter((workspace) => ids.includes(workspace.id))
        .map((workspace) => workspace.id === state.activeWorkspaceId
          ? { ...workspace, presets: state.presets }
          : workspace);
      return serializeWorkspaceBundle(selected, exportedAt);
    },

    savePreset: (name, description = '', targetValues = get().targets) => {
      const trimmed = name.trim();
      const { presets } = get();
      if (!trimmed || targetValues.length === 0) return undefined;
      const normalizedName = trimmed.toLocaleLowerCase();
      if (presets.some((preset) => preset.name.trim().toLocaleLowerCase() === normalizedName)) return undefined;
      const created = createPreset(trimmed, targetValues, description);
      const next = [...presets, created];
      persistState(get(), next);
      set((state) => ({
        presets: next,
        workspaces: catalogWithPresets(state, next).workspaces,
        activePresetId: created.id,
        activePresetDirty: false,
      }));
      return created.id;
    },

    updatePreset: (id, name, description, targets) => {
      const trimmedName = name.trim();
      const normalizedTargets = targets
        .map((target) => ({ cluster: target.cluster.trim(), namespace: target.namespace.trim() }))
        .filter((target) => target.cluster && target.namespace);
      const nextTargets = [...new Map(normalizedTargets.map((target) => [targetKey(target), target])).values()];
      if (!trimmedName || nextTargets.length === 0) return;

      const current = get().presets.find((preset) => preset.id === id);
      if (!current) return;
      const next = get().presets.map((preset) =>
        preset.id === id
          ? {
              ...preset,
              name: trimmedName,
              ...(description.trim() ? { description: description.trim() } : { description: undefined }),
              targets: nextTargets,
            }
          : preset,
      );
      persistState(get(), next);
      set((state) => ({
        presets: next,
        workspaces: catalogWithPresets(state, next).workspaces,
        ...(state.activePresetId === id
          ? {
              targets: nextTargets,
              activePresetDirty: false,
              pods: [],
              targetErrors: [],
              hasQueried: false,
              podsError: undefined,
              lastUpdatedAt: undefined,
            }
          : {}),
      }));
    },

    applyPreset: (id) => {
      const preset = get().presets.find((item) => item.id === id);
      if (!preset) return;
      const presets = markPresetUsed(get().presets, id);
      persistState(get(), presets);
      set((state) => ({
        presets,
        workspaces: catalogWithPresets(state, presets).workspaces,
        targets: preset.targets.map((target) => ({ ...target })),
        activePresetId: id,
        activePresetDirty: false,
        configurationRevision: state.configurationRevision + 1,
        pods: [],
        targetErrors: [],
        hasQueried: false,
        podsError: undefined,
        lastUpdatedAt: undefined,
      }));
    },

    deletePreset: (id) => {
      const state = get();
      const next = state.presets.filter((preset) => preset.id !== id);
      const wasActive = state.activePresetId === id;
      persistState(get(), next);
      set((current) => ({
        presets: next,
        workspaces: catalogWithPresets(current, next).workspaces,
        ...(wasActive ? { activePresetId: null, activePresetDirty: false } : {}),
      }));
      if (wasActive) helpers.resetWorkspaceView();
    },

    deletePresets: (ids, expectedWorkspaceId) => {
      const state = get();
      const selectedIds = [...new Set(ids)];
      const activeWorkspaceRecord = state.workspaces.find((workspace) => workspace.id === expectedWorkspaceId);
      if (expectedWorkspaceId !== state.activeWorkspaceId || !activeWorkspaceRecord || selectedIds.length === 0) return false;

      const workspacePresetIds = new Set(activeWorkspaceRecord.presets.map((preset) => preset.id));
      if (selectedIds.some((id) => !workspacePresetIds.has(id))) return false;

      const selectedIdSet = new Set(selectedIds);
      const next = state.presets.filter((preset) => !selectedIdSet.has(preset.id));
      persistState(state, next, expectedWorkspaceId);
      const wasActive = state.activePresetId !== null && selectedIdSet.has(state.activePresetId);
      set((current) => ({
        presets: next,
        workspaces: catalogWithPresets(current, next, expectedWorkspaceId).workspaces,
        ...(wasActive ? { activePresetId: null, activePresetDirty: false } : {}),
      }));
      if (wasActive) helpers.resetWorkspaceView();
      return true;
    },

    transferPresets: async (plan, strategy = 'reject'): Promise<TransferResult> => {
      const state = get();
      if (plan.intent.presetIds.length === 0 || plan.intent.destinationWorkspaceIds.length === 0) {
        return { ok: false, error: 'Select at least one preset and one destination Workspace.' };
      }

      const catalog = catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets);
      const conflicts = validateTransferPlan(plan, catalog);
      const planConflictKeys = new Set(
        plan.conflicts
          .filter((conflict) => conflict.sourcePresetId && conflict.destinationWorkspaceId)
          .map((conflict) => transferEntryKey(conflict.sourcePresetId!, conflict.destinationWorkspaceId!)),
      );
      const currentConflictKeys = new Set(
        conflicts
          .filter((conflict) => conflict.sourcePresetId && conflict.destinationWorkspaceId)
          .map((conflict) => transferEntryKey(conflict.sourcePresetId!, conflict.destinationWorkspaceId!)),
      );
      const unresolvedConflicts = conflicts.filter((conflict) => {
        const keyed = conflict.sourcePresetId && conflict.destinationWorkspaceId;
        if (!keyed) return true;
        if (strategy === 'reject') return true;
        return !planConflictKeys.has(transferEntryKey(conflict.sourcePresetId!, conflict.destinationWorkspaceId!));
      });
      if (unresolvedConflicts.length > 0 || (strategy !== 'reject' && planConflictKeys.size !== currentConflictKeys.size)) {
        return { ok: false, error: (unresolvedConflicts[0] ?? conflicts[0])?.message ?? 'Review the preset transfer again.' };
      }

      const source = catalog.workspaces.find((workspace) => workspace.id === plan.intent.sourceWorkspaceId);
      if (!source || plan.intent.sourceWorkspaceId !== state.activeWorkspaceId) {
        return { ok: false, error: 'The source Workspace is no longer active.' };
      }

      const entries = entriesForTransfer(plan, strategy);
      if (entries.length === 0) return { ok: true };
      const selectedIds = new Set(plan.intent.presetIds);
      const transferredSourceIds = new Set<string>();
      const entriesByDestination = new Map<string, typeof plan.entries>();
      for (const entry of entries) {
        const destinationEntries = entriesByDestination.get(entry.destinationWorkspaceId) ?? [];
        destinationEntries.push(entry);
        entriesByDestination.set(entry.destinationWorkspaceId, destinationEntries);
      }
      const now = new Date().toISOString();
      const nextWorkspaces = catalog.workspaces.map((workspace) => {
        const destinationEntries = entriesByDestination.get(workspace.id) ?? [];
        const nextPresets = [...workspace.presets];
        const semanticIndexes = new Map(nextPresets.map((preset, index) => [presetSemanticKey(preset.targets), index]));
        const incomingSourceByKey = new Map<string, string>();
        for (const entry of destinationEntries) {
          const semanticKey = presetSemanticKey(entry.preset.targets);
          const existingIndex = semanticIndexes.get(semanticKey);
          if (existingIndex === undefined) {
            semanticIndexes.set(semanticKey, nextPresets.length);
            nextPresets.push(entry.preset);
            incomingSourceByKey.set(semanticKey, entry.sourcePresetId);
            continue;
          }
          if (strategy !== 'overwrite') continue;
          const existing = nextPresets[existingIndex];
          nextPresets[existingIndex] = {
            ...entry.preset,
            id: existing.id,
            ...(existing.lastUsedAt === undefined ? {} : { lastUsedAt: existing.lastUsedAt }),
          };
          incomingSourceByKey.set(semanticKey, entry.sourcePresetId);
        }
        incomingSourceByKey.forEach((sourcePresetId) => transferredSourceIds.add(sourcePresetId));
        const retained = workspace.id === source.id && plan.intent.mode === 'move'
          ? nextPresets.filter((preset) => !selectedIds.has(preset.id))
          : nextPresets;
        if (destinationEntries.length === 0 && retained === workspace.presets) return workspace;
        return {
          ...workspace,
          presets: retained,
          updatedAt: now,
        };
      });

      if (plan.intent.mode === 'move') {
        const sourceIndex = nextWorkspaces.findIndex((workspace) => workspace.id === source.id);
        const nextSource = nextWorkspaces[sourceIndex];
        if (nextSource) {
          nextWorkspaces[sourceIndex] = {
            ...nextSource,
            presets: source.presets.filter((preset) => !transferredSourceIds.has(preset.id)),
          };
        }
      }
      const nextCatalog = {
        version: 1 as const,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: nextWorkspaces,
      };

      if (!(await persistWorkspaceCatalogAndWait(nextCatalog))) {
        return { ok: false, error: 'The preset transfer could not be persisted.' };
      }

      const nextActiveWorkspace = nextWorkspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
      const movedActive = plan.intent.mode === 'move' && state.activePresetId !== null && transferredSourceIds.has(state.activePresetId);
      set({
        workspaces: nextWorkspaces,
        presets: nextActiveWorkspace?.presets ?? [],
        ...(movedActive ? { activePresetId: null, activePresetDirty: false } : {}),
      });
      if (movedActive) helpers.resetWorkspaceView();
      return { ok: true };
    },

    copyPresetsFromWorkspace: async (plan: CopyPlan, strategy: CopyConflictStrategy = 'reject'): Promise<TransferResult> => {
      const state = get();
      if (plan.intent.sourcePresetIds.length === 0) {
        return { ok: false, error: 'Select at least one source preset.' };
      }

      const catalog = catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets);
      const conflicts = validateCopyPlan(plan, catalog);
      const plannedConflictKeys = new Set(plan.conflicts.filter((conflict) => conflict.sourcePresetId).map((conflict) => conflict.sourcePresetId!));
      const currentConflictKeys = new Set(conflicts.filter((conflict) => conflict.sourcePresetId).map((conflict) => conflict.sourcePresetId!));
      const unresolved = conflicts.filter((conflict) => {
        if (!conflict.sourcePresetId) return true;
        if (strategy === 'reject') return true;
        return !plannedConflictKeys.has(conflict.sourcePresetId);
      });
      if (unresolved.length > 0 || (strategy !== 'reject' && plannedConflictKeys.size !== currentConflictKeys.size)) {
        return { ok: false, error: (unresolved[0] ?? conflicts[0])?.message ?? 'Review the Workspace copy again.' };
      }

      const source = catalog.workspaces.find((workspace) => workspace.id === plan.intent.sourceWorkspaceId);
      const destination = catalog.workspaces.find((workspace) => workspace.id === plan.intent.destinationWorkspaceId);
      if (!source || !destination || destination.id !== state.activeWorkspaceId || source.id === destination.id) {
        return { ok: false, error: 'The source or destination Workspace is no longer available.' };
      }

      const entries = entriesForCopy(plan, strategy);
      if (entries.length === 0) return { ok: true };
      const now = new Date().toISOString();
      const nextWorkspaces = catalog.workspaces.map((workspace) => {
        if (workspace.id !== destination.id) return workspace;
        const nextPresets = [...workspace.presets];
        const semanticIndexes = new Map(nextPresets.map((preset, index) => [presetSemanticKey(preset.targets), index]));
        for (const entry of entries) {
          const semanticKey = presetSemanticKey(entry.preset.targets);
          const existingIndex = semanticIndexes.get(semanticKey);
          if (existingIndex === undefined) {
            semanticIndexes.set(semanticKey, nextPresets.length);
            nextPresets.push(entry.preset);
            continue;
          }
          if (strategy !== 'overwrite') continue;
          const existing = nextPresets[existingIndex];
          nextPresets[existingIndex] = {
            ...entry.preset,
            id: existing.id,
            ...(existing.lastUsedAt === undefined ? {} : { lastUsedAt: existing.lastUsedAt }),
          };
        }
        return { ...workspace, presets: nextPresets, updatedAt: now };
      });

      const nextCatalog = {
        version: 1 as const,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: nextWorkspaces,
      };
      if (copyCatalogSignature(nextCatalog) === copyCatalogSignature(catalog)) return { ok: true };
      if (!(await persistWorkspaceCatalogAndWait(nextCatalog))) {
        return { ok: false, error: 'The presets could not be copied into the Active Workspace.' };
      }

      const nextActiveWorkspace = nextWorkspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
      set({
        workspaces: nextWorkspaces,
        presets: nextActiveWorkspace?.presets ?? [],
      });
      return { ok: true };
    },

    movePresetsFromWorkspace: async (plan: MovePlan, strategy: MoveConflictStrategy = 'reject'): Promise<TransferResult> => {
      const state = get();
      if (plan.intent.sourcePresetIds.length === 0) {
        return { ok: false, error: 'Select at least one source preset.' };
      }

      const catalog = catalogForTransfer(state.workspaces, state.activeWorkspaceId, state.presets);
      if (plan.intent.activePresetId !== undefined && plan.intent.activePresetId !== state.activePresetId) {
        return { ok: false, error: 'The active preset reference changed. Review the move again.' };
      }
      if (state.activePresetId !== null) {
        const destination = catalog.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
        const source = catalog.workspaces.find((workspace) => workspace.id === plan.intent.sourceWorkspaceId);
        if (!destination?.presets.some((preset) => preset.id === state.activePresetId)
          || source?.presets.some((preset) => preset.id === state.activePresetId && plan.intent.sourcePresetIds.includes(state.activePresetId))) {
          return { ok: false, error: 'The active preset reference is inconsistent with the move.' };
        }
      }

      const conflicts = validateMovePlan(plan, catalog);
      const conflictKey = (conflict: { kind: string; sourcePresetId?: string; targetKey?: string }) =>
        `${conflict.kind}\u0000${conflict.sourcePresetId ?? ''}\u0000${conflict.targetKey ?? ''}`;
      const planConflictKeys = new Set(plan.conflicts
        .filter((conflict) => conflict.kind === 'semantic-duplicate' || conflict.kind === 'planned-duplicate')
        .map(conflictKey));
      const currentConflictKeys = new Set(conflicts
        .filter((conflict) => conflict.kind === 'semantic-duplicate' || conflict.kind === 'planned-duplicate')
        .map(conflictKey));
      const structuralConflicts = conflicts.filter((conflict) => conflict.kind !== 'semantic-duplicate' && conflict.kind !== 'planned-duplicate');
      const unresolvedConflicts = conflicts.filter((conflict) => {
        if (conflict.kind !== 'semantic-duplicate' && conflict.kind !== 'planned-duplicate') return true;
        if (strategy === 'reject') return true;
        return !planConflictKeys.has(conflictKey(conflict));
      });
      if (structuralConflicts.length > 0 || unresolvedConflicts.length > 0
        || planConflictKeys.size !== currentConflictKeys.size
        || [...planConflictKeys].some((key) => !currentConflictKeys.has(key))) {
        return { ok: false, error: (unresolvedConflicts[0] ?? conflicts[0])?.message ?? 'Review the Workspace move again.' };
      }

      const source = catalog.workspaces.find((workspace) => workspace.id === plan.intent.sourceWorkspaceId);
      const destination = catalog.workspaces.find((workspace) => workspace.id === plan.intent.destinationWorkspaceId);
      if (!source || !destination || destination.id !== state.activeWorkspaceId || source.id === destination.id || source.id === state.activeWorkspaceId) {
        return { ok: false, error: 'The source must be an inactive Workspace and the destination must remain active.' };
      }

      const entries = entriesForMove(plan, strategy);
      if (entries.length === 0) return { ok: true };
      const sourceRemovalIds = new Set(entries.map((entry) => entry.sourcePresetId));
      const now = new Date().toISOString();
      const nextWorkspaces = catalog.workspaces.map((workspace) => {
        if (workspace.id === source.id) {
          return {
            ...workspace,
            presets: workspace.presets.filter((preset) => !sourceRemovalIds.has(preset.id)),
            updatedAt: now,
          };
        }
        if (workspace.id !== destination.id) return workspace;

        const nextPresets = [...workspace.presets];
        const semanticIndexes = new Map(nextPresets.map((preset, index) => [presetSemanticKey(preset.targets), index]));
        for (const entry of entries) {
          const semanticKey = entry.targetKey;
          const existingIndex = semanticIndexes.get(semanticKey);
          if (existingIndex === undefined) {
            semanticIndexes.set(semanticKey, nextPresets.length);
            nextPresets.push(entry.preset);
            continue;
          }
          if (strategy !== 'overwrite') continue;
          const existing = nextPresets[existingIndex];
          nextPresets[existingIndex] = {
            ...entry.preset,
            id: existing.id,
            ...(existing.lastUsedAt === undefined ? {} : { lastUsedAt: existing.lastUsedAt }),
          };
        }
        return { ...workspace, presets: nextPresets, updatedAt: now };
      });

      const nextCatalog = {
        version: 1 as const,
        activeWorkspaceId: state.activeWorkspaceId,
        workspaces: nextWorkspaces,
      };
      if (moveCatalogSignature(nextCatalog) === moveCatalogSignature(catalog)) return { ok: true };
      if (!(await persistWorkspaceCatalogAndWait(nextCatalog))) {
        return { ok: false, error: 'The presets could not be moved between Workspaces.' };
      }

      const nextActiveWorkspace = nextWorkspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
      set({
        workspaces: nextWorkspaces,
        presets: nextActiveWorkspace?.presets ?? [],
      });
      return { ok: true };
    },

    appendImportedPresets: (importedPresets: PortablePreset[]) => {
      if (importedPresets.length === 0) return;
      const current = get().presets;
      const knownKeys = new Set(current.map((preset) => presetSemanticKey(preset.targets)));
      const accepted = importedPresets.filter((preset) => {
        const key = presetSemanticKey(preset.targets);
        if (knownKeys.has(key)) return false;
        knownKeys.add(key);
        return true;
      });
      if (accepted.length === 0) return;

      const next = [...current, ...accepted.map((preset) =>
        createPreset(preset.name, preset.targets, preset.description ?? ''),
      )];
      persistState(get(), next);
      set((state) => ({ presets: next, workspaces: catalogWithPresets(state, next).workspaces }));
    },

    clearPresets: () => {
      const hadActivePreset = get().activePresetId !== null;
      persistState(get(), []);
      set((state) => ({
        presets: [],
        workspaces: catalogWithPresets(state, []).workspaces,
        activePresetId: null,
        activePresetDirty: false,
      }));
      if (hadActivePreset) helpers.resetWorkspaceView();
    },
  };
}

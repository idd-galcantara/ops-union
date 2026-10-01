import { create } from 'zustand';
import { fetchContexts, fetchKubeConfigStatus, fetchNamespaces, fetchPods } from './api';
import {
  createPreset,
  markPresetUsed,
  presetSemanticKey,
  type Preset,
  type PortablePreset,
} from './presets';
import {
  activeWorkspace,
  createDefaultWorkspace,
  createWorkspace,
  getInitialWorkspaceCatalog,
  loadWorkspaceCatalog,
  persistWorkspaceCatalog,
  persistWorkspaceCatalogAndWait,
  serializeWorkspace,
  serializeWorkspaceBundle,
  validateWorkspaceName,
  type Workspace,
  type WorkspaceCatalog,
  type WorkspaceImportResult,
} from './workspaces';
import {
  catalogForTransfer,
  entriesForTransfer,
  transferEntryKey,
  validateTransferPlan,
  type TransferConflictStrategy,
  type TransferPlan,
} from './presetTransfer';
import {
  targetKey,
  type ContextInfo,
  type GroupingMode,
  type KubeConfigStatus,
  type NamespaceInfo,
  type NormalizedPod,
  type Target,
  type TargetError,
} from './types';

export interface WorkspaceImportOptions {
  overwrite?: boolean;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
}

/** Auto-refresh intervals offered in the UI, in seconds. 0 means off. */
export const REFRESH_INTERVALS = [0, 10, 30, 60] as const;

let namespacesRequestId = 0;
let podsRequestId = 0;

interface OpsFlowState {
  /** Contexts available in the kubeconfig. */
  contexts: ContextInfo[];
  contextsError?: string;
  contextsLoading: boolean;
  kubeconfigStatus: KubeConfigStatus | null;
  kubeconfigStatusLoading: boolean;
  kubeconfigStatusError?: string;
  configurationRevision: number;

  /** The (cluster, namespace) pairs currently selected. */
  targets: Target[];

  /** Aggregated result of the last query. */
  pods: NormalizedPod[];
  targetErrors: TargetError[];
  podsLoading: boolean;
  podsError?: string;
  /** Whether a query has completed at least once (to distinguish "empty" from "not asked"). */
  hasQueried: boolean;
  /** When the last successful query completed. */
  lastUpdatedAt?: number;
  /** True while an auto-refresh is refetching, so the table isn't blanked. */
  refreshing: boolean;
  explicitQueryRevision: number;

  /** View controls. */
  grouping: GroupingMode;
  filter: string;
  /** Auto-refresh period in seconds; 0 disables it. */
  refreshSeconds: number;

  /** Namespaces discovered in the currently selected clusters (for autocomplete). */
  namespaces: NamespaceInfo[];
  namespacesLoading: boolean;
  namespacesError?: string;
  /** Clusters the namespace list was loaded for, to avoid redundant fetches. */
  namespacesFor: string[];

  /** Saved target combinations. */
  presets: Preset[];
  /** Local preset Workspaces; operational state is intentionally separate. */
  workspaces: Workspace[];
  activeWorkspaceId: string;
  /** Preset applied to the current target selection, if any. */
  activePresetId: string | null;
  /** True when current targets differ from the active preset. */
  activePresetDirty: boolean;

  loadContexts: () => Promise<void>;
  loadKubeconfigStatus: () => Promise<void>;
  selectKubeconfig: () => Promise<void>;
  resetKubeconfig: () => Promise<void>;
  loadNamespaces: (clusters: string[]) => Promise<void>;
  addTarget: (target: Target) => void;
  removeTarget: (target: Target) => void;
  clearTargets: () => void;
  loadPods: (options?: { silent?: boolean; resetView?: boolean }) => Promise<void>;
  setGrouping: (grouping: GroupingMode) => void;
  setFilter: (filter: string) => void;
  setRefreshSeconds: (seconds: number) => void;
  hydratePresets: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => string | undefined;
  renameWorkspace: (id: string, name: string, description?: string) => string | undefined;
  switchWorkspace: (id: string) => string | undefined;
  deleteWorkspace: (id: string) => string | undefined;
  deleteWorkspaces: (ids: string[]) => string | undefined;
  importWorkspace: (result: WorkspaceImportResult, name: string, activate: boolean, options?: WorkspaceImportOptions) => string | undefined;
  exportWorkspaces: (ids: string[], exportedAt?: string) => string;
  exportActiveWorkspace: (exportedAt?: string) => string;
  savePreset: (name: string, description?: string, targets?: Target[]) => string | undefined;
  updatePreset: (id: string, name: string, description: string, targets: Target[]) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  deletePresets: (ids: string[], expectedWorkspaceId: string) => boolean;
  transferPresets: (plan: TransferPlan, strategy?: TransferConflictStrategy) => Promise<TransferResult>;
  appendImportedPresets: (presets: PortablePreset[]) => void;
  clearPresets: () => void;
}

export const useOpsFlowStore = create<OpsFlowState>((set, get) => {
  const initialCatalog = getInitialWorkspaceCatalog();

  const catalogWithPresets = (state: OpsFlowState, presets: Preset[], activeWorkspaceId = state.activeWorkspaceId): WorkspaceCatalog => ({
    version: 1,
    activeWorkspaceId,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === state.activeWorkspaceId
        ? { ...workspace, presets, updatedAt: new Date().toISOString() }
        : workspace,
    ),
  });

  const persistState = (state: OpsFlowState, presets: Preset[], activeWorkspaceId = state.activeWorkspaceId) => {
    persistWorkspaceCatalog(catalogWithPresets(state, presets, activeWorkspaceId));
  };

  const resetWorkspaceView = () => {
    namespacesRequestId += 1;
    podsRequestId += 1;
    set((state) => ({
      targets: [],
      namespaces: [],
      namespacesFor: [],
      namespacesLoading: false,
      namespacesError: undefined,
      pods: [],
      targetErrors: [],
      podsLoading: false,
      refreshing: false,
      hasQueried: false,
      podsError: undefined,
      lastUpdatedAt: undefined,
      filter: '',
      configurationRevision: state.configurationRevision + 1,
      explicitQueryRevision: state.explicitQueryRevision + 1,
    }));
  };

  const applyKubeconfigChange = (kubeconfigStatus?: KubeConfigStatus) => {
    namespacesRequestId += 1;
    podsRequestId += 1;
    set((state) => ({
      kubeconfigStatus: kubeconfigStatus ?? state.kubeconfigStatus,
      kubeconfigStatusLoading: false,
      contexts: [],
      contextsError: undefined,
      targets: [],
      namespaces: [],
      namespacesFor: [],
      namespacesError: undefined,
      namespacesLoading: false,
      pods: [],
      activePresetId: null,
      activePresetDirty: false,
      targetErrors: [],
      podsLoading: false,
      refreshing: false,
      hasQueried: false,
      podsError: undefined,
      lastUpdatedAt: undefined,
      configurationRevision: state.configurationRevision + 1,
    }));
  };

  return {
  contexts: [],
  contextsLoading: false,
  kubeconfigStatus: null,
  kubeconfigStatusLoading: false,
  configurationRevision: 0,
  targets: [],
  pods: [],
  targetErrors: [],
  podsLoading: false,
  hasQueried: false,
  refreshing: false,
  explicitQueryRevision: 0,
  grouping: 'namespace',
  filter: '',
  refreshSeconds: 0,
  namespaces: [],
  namespacesLoading: false,
  namespacesFor: [],
  workspaces: initialCatalog.workspaces,
  activeWorkspaceId: initialCatalog.activeWorkspaceId,
  presets: activeWorkspace(initialCatalog).presets,
  activePresetId: null,
  activePresetDirty: false,

  loadContexts: async () => {
    set({ contextsLoading: true, contextsError: undefined });
    try {
      const contexts = await fetchContexts();
      set({ contexts, contextsLoading: false });
    } catch (err) {
      set({
        contextsLoading: false,
        contextsError: err instanceof Error ? err.message : 'Failed to load contexts.',
      });
    }
  },

  loadKubeconfigStatus: async () => {
    set({ kubeconfigStatusLoading: true, kubeconfigStatusError: undefined });
    try {
      const kubeconfigStatus = await fetchKubeConfigStatus();
      set({ kubeconfigStatus, kubeconfigStatusLoading: false });
    } catch (err) {
      set({
        kubeconfigStatusLoading: false,
        kubeconfigStatusError:
          err instanceof Error ? err.message : 'Failed to read kubeconfig status.',
      });
    }
  },

  selectKubeconfig: async () => {
    const desktop = window.opsFlowDesktop;
    if (!desktop) {
      set({ kubeconfigStatusError: 'Kubeconfig selection is available in the desktop app.' });
      return;
    }

    set({ kubeconfigStatusLoading: true, kubeconfigStatusError: undefined });
    try {
      const result = await desktop.selectKubeconfig();
      if (result.cancelled) {
        set({ kubeconfigStatusLoading: false });
        return;
      }
      if (result.error && !result.status) {
        set({ kubeconfigStatusLoading: false, kubeconfigStatusError: result.error });
        return;
      }

      set({ kubeconfigStatusError: result.error });
      applyKubeconfigChange(result.status);
      await get().loadContexts();
    } catch (err) {
      set({
        kubeconfigStatusLoading: false,
        kubeconfigStatusError:
          err instanceof Error ? err.message : 'Failed to select kubeconfig.',
      });
    }
  },

  resetKubeconfig: async () => {
    const desktop = window.opsFlowDesktop;
    if (!desktop) {
      set({ kubeconfigStatusError: 'Kubeconfig reset is available in the desktop app.' });
      return;
    }
    if (get().kubeconfigStatus?.source !== 'selected' || get().kubeconfigStatusLoading) return;

    set({ kubeconfigStatusLoading: true, kubeconfigStatusError: undefined });
    try {
      const result = await desktop.resetKubeconfig();
      if (result.error && !result.status) {
        set({ kubeconfigStatusLoading: false, kubeconfigStatusError: result.error });
        return;
      }

      set({ kubeconfigStatusError: result.error });
      applyKubeconfigChange(result.status);
      await get().loadContexts();
    } catch (err) {
      set({
        kubeconfigStatusLoading: false,
        kubeconfigStatusError:
          err instanceof Error ? err.message : 'Failed to reset kubeconfig.',
      });
    }
  },

  /**
   * Loads the namespaces that exist in the given clusters, for autocomplete.
   * Skips the request when the same cluster set is already loaded, since these
   * clusters can return ~2000 namespaces.
   */
  loadNamespaces: async (clusters) => {
    const key = [...clusters].sort();
    const current = get();
    const requestId = ++namespacesRequestId;
    const revision = current.configurationRevision;

    if (key.length === 0) {
      set({
        namespaces: [],
        namespacesFor: [],
        namespacesLoading: false,
        namespacesError: undefined,
      });
      return;
    }

    const alreadyLoaded =
      current.namespacesFor.length === key.length &&
      current.namespacesFor.every((c, i) => c === key[i]);
    if (alreadyLoaded && !current.namespacesError) return;

    set({ namespacesLoading: true, namespacesError: undefined });
    try {
      const { namespaces, errors } = await fetchNamespaces(key);
      const latest = get();
      if (
        requestId !== namespacesRequestId ||
        revision !== latest.configurationRevision
      ) {
        return;
      }
      set({
        namespaces,
        namespacesFor: key,
        namespacesLoading: false,
        // Partial failure: report it but keep whatever namespaces did come back.
        namespacesError:
          errors.length > 0
            ? errors.map((error) => `${error.cluster}: ${error.message}`).join(' | ')
            : undefined,
      });
    } catch (err) {
      if (requestId !== namespacesRequestId || revision !== get().configurationRevision) return;
      set({
        namespacesLoading: false,
        namespacesError: err instanceof Error ? err.message : 'Failed to load namespaces.',
      });
    }
  },

  addTarget: (target) => {
    const cluster = target.cluster.trim();
    const namespace = target.namespace.trim();
    if (!cluster || !namespace) return;
    const next = { cluster, namespace };
    const exists = get().targets.some((t) => targetKey(t) === targetKey(next));
    if (exists) return;
    set((state) => ({
      targets: [...state.targets, next],
      activePresetDirty: state.activePresetId !== null || state.activePresetDirty,
    }));
  },

  removeTarget: (target) => {
    set((state) => ({
      targets: state.targets.filter((t) => targetKey(t) !== targetKey(target)),
      activePresetDirty: state.activePresetId !== null || state.activePresetDirty,
    }));
  },

  clearTargets: () => {
    podsRequestId += 1;
    set({
      targets: [],
      activePresetId: null,
      activePresetDirty: false,
      pods: [],
      targetErrors: [],
      podsLoading: false,
      refreshing: false,
      hasQueried: false,
      podsError: undefined,
      lastUpdatedAt: undefined,
    });
  },

  /**
   * Fetches pods for the selected targets.
   * `silent` is used by auto-refresh so the current table stays visible instead
   * of flashing a loading state on every tick.
   */
  loadPods: async ({ silent = false, resetView = !silent } = {}) => {
    const { targets } = get();
    const requestId = ++podsRequestId;
    const revision = get().configurationRevision;
    const targetSignature = targets.map(targetKey).join('|');
    if (targets.length === 0) return;
    if (silent) {
      set({ refreshing: true, podsError: undefined });
    } else {
      set((state) => ({
        podsLoading: true,
        podsError: undefined,
        ...(resetView ? { explicitQueryRevision: state.explicitQueryRevision + 1 } : {}),
      }));
    }
    try {
      const { pods, errors } = await fetchPods(targets);
      const latest = get();
      if (
        requestId !== podsRequestId ||
        revision !== latest.configurationRevision ||
        targetSignature !== latest.targets.map(targetKey).join('|')
      ) {
        return;
      }
      set({
        pods,
        targetErrors: errors,
        podsLoading: false,
        refreshing: false,
        hasQueried: true,
        lastUpdatedAt: Date.now(),
      });
    } catch (err) {
      if (requestId !== podsRequestId || revision !== get().configurationRevision) return;
      set({
        podsLoading: false,
        refreshing: false,
        podsError: err instanceof Error ? err.message : 'Failed to query pods.',
      });
    }
  },

  setGrouping: (grouping) => set({ grouping }),
  setFilter: (filter) => set({ filter }),
  setRefreshSeconds: (refreshSeconds) => set({ refreshSeconds }),

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
    const workspace = createWorkspace(name, description);
    const workspaces = [...state.workspaces, workspace];
    persistWorkspaceCatalog({ version: 1, workspaces, activeWorkspaceId: workspace.id });
    set({
      workspaces,
      activeWorkspaceId: workspace.id,
      presets: [],
      activePresetId: null,
      activePresetDirty: false,
    });
    resetWorkspaceView();
    return undefined;
  },

  renameWorkspace: (id, name, description = '') => {
    const state = get();
    const current = state.workspaces.find((workspace) => workspace.id === id);
    if (!current) return 'Workspace no longer exists.';
    const error = validateWorkspaceName(name, state.workspaces, id);
    if (error) return error;
    const workspaces = state.workspaces.map((workspace) => workspace.id === id
      ? { ...workspace, name: name.trim(), ...(description.trim() ? { description: description.trim() } : { description: undefined }), updatedAt: new Date().toISOString() }
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
    resetWorkspaceView();
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
    if (activeDeleted) resetWorkspaceView();
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
    if (activeDeleted) resetWorkspaceView();
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
      if (showImported) resetWorkspaceView();
      return undefined;
    }

    const imported = createWorkspace(trimmedName, result.description ?? '', importedPresets);
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
    if (activate) resetWorkspaceView();
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
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    const presets = markPresetUsed(get().presets, id);
    persistState(get(), presets);
    set((state) => ({
      presets,
      workspaces: catalogWithPresets(state, presets).workspaces,
      targets: preset.targets.map((t) => ({ ...t })),
      activePresetId: id,
      activePresetDirty: false,
      pods: [],
      targetErrors: [],
      hasQueried: false,
      podsError: undefined,
      lastUpdatedAt: undefined,
    }));
  },

  deletePreset: (id) => {
    const state = get();
    const next = state.presets.filter((p) => p.id !== id);
    const wasActive = state.activePresetId === id;
    persistState(get(), next);
    set((state) => ({
      presets: next,
      workspaces: catalogWithPresets(state, next).workspaces,
      ...(wasActive
        ? { activePresetId: null, activePresetDirty: false }
        : {}),
    }));
    if (wasActive) resetWorkspaceView();
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
    if (wasActive) resetWorkspaceView();
    return true;
  },

  transferPresets: async (plan, strategy = 'reject') => {
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
      const entries = entriesByDestination.get(entry.destinationWorkspaceId) ?? [];
      entries.push(entry);
      entriesByDestination.set(entry.destinationWorkspaceId, entries);
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
    if (movedActive) resetWorkspaceView();
    return { ok: true };
  },

  appendImportedPresets: (importedPresets) => {
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
    if (hadActivePreset) resetWorkspaceView();
  },
  };
});

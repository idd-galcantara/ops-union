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
  serializeWorkspace,
  serializeWorkspaceBundle,
  validateWorkspaceName,
  type Workspace,
  type WorkspaceCatalog,
  type WorkspaceImportResult,
} from './workspaces';
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
  savePreset: (name: string, description?: string) => void;
  updatePreset: (id: string, name: string, description: string, targets: Target[]) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
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
    return undefined;
  },

  deleteWorkspace: (id) => {
    const state = get();
    if (state.workspaces.length <= 1) return 'At least one Workspace must remain.';
    if (!state.workspaces.some((workspace) => workspace.id === id)) return 'Workspace no longer exists.';
    const index = state.workspaces.findIndex((workspace) => workspace.id === id);
    const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
    const nextActiveId = id === state.activeWorkspaceId
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

  savePreset: (name, description = '') => {
    const trimmed = name.trim();
    const { targets, presets } = get();
    if (!trimmed || targets.length === 0) return;
    const created = createPreset(trimmed, targets, description);
    const next = [...presets, created];
    persistState(get(), next);
    set((state) => ({
      presets: next,
      workspaces: catalogWithPresets(state, next).workspaces,
      activePresetId: created.id,
      activePresetDirty: false,
    }));
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
    const next = get().presets.filter((p) => p.id !== id);
    persistState(get(), next);
    set((state) => ({
      presets: next,
      workspaces: catalogWithPresets(state, next).workspaces,
      ...(state.activePresetId === id
        ? { activePresetId: null, activePresetDirty: false }
        : {}),
    }));
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
    persistState(get(), []);
    set((state) => ({
      presets: [],
      workspaces: catalogWithPresets(state, []).workspaces,
      activePresetId: null,
      activePresetDirty: false,
    }));
  },
  };
});

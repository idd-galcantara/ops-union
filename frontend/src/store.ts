import { create } from 'zustand';
import { fetchContexts, fetchKubeConfigStatus, fetchNamespaces, fetchPods } from './api';
import {
  createPreset,
  loadPersistentPresets,
  loadPresets,
  markPresetUsed,
  presetSemanticKey,
  savePresets,
  type Preset,
  type PortablePreset,
} from './presets';
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
  loadPods: (options?: { silent?: boolean }) => Promise<void>;
  setGrouping: (grouping: GroupingMode) => void;
  setFilter: (filter: string) => void;
  setRefreshSeconds: (seconds: number) => void;
  hydratePresets: () => Promise<void>;
  savePreset: (name: string, description?: string) => void;
  updatePreset: (id: string, name: string, description: string, targets: Target[]) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  appendImportedPresets: (presets: PortablePreset[]) => void;
  clearPresets: () => void;
}

export const useOpsFlowStore = create<OpsFlowState>((set, get) => {
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
  presets: loadPresets(),
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
  loadPods: async ({ silent = false } = {}) => {
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
        explicitQueryRevision: state.explicitQueryRevision + 1,
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
    const presets = await loadPersistentPresets();
    set({ presets });
  },

  savePreset: (name, description = '') => {
    const trimmed = name.trim();
    const { targets, presets } = get();
    if (!trimmed || targets.length === 0) return;
    const created = createPreset(trimmed, targets, description);
    const next = [...presets, created];
    savePresets(next);
    set({ presets: next, activePresetId: created.id, activePresetDirty: false });
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
    savePresets(next);
    set((state) => ({
      presets: next,
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
    savePresets(presets);
    set({
      presets,
      targets: preset.targets.map((t) => ({ ...t })),
      activePresetId: id,
      activePresetDirty: false,
      pods: [],
      targetErrors: [],
      hasQueried: false,
      podsError: undefined,
      lastUpdatedAt: undefined,
    });
  },

  deletePreset: (id) => {
    const next = get().presets.filter((p) => p.id !== id);
    savePresets(next);
    set((state) => ({
      presets: next,
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
    savePresets(next);
    set({ presets: next });
  },

  clearPresets: () => {
    savePresets([]);
    set({ presets: [], activePresetId: null, activePresetDirty: false });
  },
  };
});

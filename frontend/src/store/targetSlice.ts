import { fetchNamespaces } from '../api';
import { targetKey } from '../types';
import { invalidatePodsRequests, isCurrentNamespacesRequest, nextNamespacesRequestId } from './requestIds';
import type { StoreGet, StoreSet } from './types';
import type { OpsFlowState } from './types';

export function createTargetActions(
  set: StoreSet,
  get: StoreGet,
): Pick<OpsFlowState, 'loadNamespaces' | 'addTarget' | 'removeTarget' | 'clearTargets'> {
  return {
    loadNamespaces: async (clusters) => {
      const key = [...clusters].sort();
      const current = get();
      const requestId = nextNamespacesRequestId();
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
        current.namespacesFor.every((cluster, index) => cluster === key[index]);
      if (alreadyLoaded && !current.namespacesError) return;

      set({ namespacesLoading: true, namespacesError: undefined });
      try {
        const { namespaces, errors } = await fetchNamespaces(key);
        const latest = get();
        if (
          !isCurrentNamespacesRequest(requestId) ||
          revision !== latest.configurationRevision
        ) {
          return;
        }
        set({
          namespaces,
          namespacesFor: key,
          namespacesLoading: false,
          namespacesError:
            errors.length > 0
              ? errors.map((error) => `${error.cluster}: ${error.message}`).join(' | ')
              : undefined,
        });
      } catch (err) {
        if (!isCurrentNamespacesRequest(requestId) || revision !== get().configurationRevision) return;
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
      const exists = get().targets.some((item) => targetKey(item) === targetKey(next));
      if (exists) return;
      set((state) => ({
        targets: [...state.targets, next],
        activePresetDirty: state.activePresetId !== null || state.activePresetDirty,
      }));
    },

    removeTarget: (target) => {
      set((state) => ({
        targets: state.targets.filter((item) => targetKey(item) !== targetKey(target)),
        activePresetDirty: state.activePresetId !== null || state.activePresetDirty,
      }));
    },

    clearTargets: () => {
      invalidatePodsRequests();
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
  };
}
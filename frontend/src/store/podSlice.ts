import { fetchPods } from '../api';
import { targetKey } from '../types';
import { isCurrentPodsRequest, nextPodsRequestId } from './requestIds';
import type { OpsFlowState, StoreGet, StoreSet } from './types';

export function createPodActions(
  set: StoreSet,
  get: StoreGet,
): Pick<OpsFlowState, 'loadPods' | 'setGrouping' | 'setFilter' | 'setRefreshSeconds'> {
  return {
    loadPods: async ({ silent = false, resetView = !silent } = {}) => {
      const { targets } = get();
      const requestId = nextPodsRequestId();
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
          !isCurrentPodsRequest(requestId) ||
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
        if (!isCurrentPodsRequest(requestId) || revision !== get().configurationRevision) return;
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
  };
}
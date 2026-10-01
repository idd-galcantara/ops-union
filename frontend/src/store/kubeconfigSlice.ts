import { fetchContexts, fetchKubeConfigStatus } from '../api';
import type { OpsFlowState, StoreGet, StoreHelpers, StoreSet } from './types';
import { isCurrentContextsRequest, nextContextsRequestId } from './requestIds';

export function createKubeconfigActions(
  set: StoreSet,
  get: StoreGet,
  helpers: StoreHelpers,
): Pick<OpsFlowState, 'loadContexts' | 'loadKubeconfigStatus' | 'selectKubeconfig' | 'resetKubeconfig'> {
  return {
    loadContexts: async () => {
      const requestId = nextContextsRequestId();
      const revision = get().configurationRevision;
      set({ contextsLoading: true, contextsError: undefined });
      try {
        const contexts = await fetchContexts();
        if (!isCurrentContextsRequest(requestId) || revision !== get().configurationRevision) return;
        set({ contexts, contextsLoading: false });
      } catch (err) {
        if (!isCurrentContextsRequest(requestId) || revision !== get().configurationRevision) return;
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
        helpers.applyKubeconfigChange(result.status);
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
        helpers.applyKubeconfigChange(result.status);
        await get().loadContexts();
      } catch (err) {
        set({
          kubeconfigStatusLoading: false,
          kubeconfigStatusError:
            err instanceof Error ? err.message : 'Failed to reset kubeconfig.',
        });
      }
    },
  };
}
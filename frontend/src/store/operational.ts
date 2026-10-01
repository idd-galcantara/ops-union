import { invalidateContextsRequests, invalidateNamespacesRequests, invalidatePodsRequests } from './requestIds';
import type { KubeConfigStatus } from '../types';
import type { StoreHelpers, StoreSet } from './types';

export function createStoreHelpers(set: StoreSet): StoreHelpers {
  const resetWorkspaceView = () => {
    invalidateNamespacesRequests();
    invalidatePodsRequests();
    invalidateContextsRequests();
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
    invalidateNamespacesRequests();
    invalidatePodsRequests();
    invalidateContextsRequests();
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

  return { resetWorkspaceView, applyKubeconfigChange };
}
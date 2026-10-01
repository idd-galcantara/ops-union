import { create } from 'zustand';
import { activeWorkspace, getInitialWorkspaceCatalog } from './workspaces';
import { createKubeconfigActions } from './store/kubeconfigSlice';
import { createPodActions } from './store/podSlice';
import { createStoreHelpers } from './store/operational';
import { createTargetActions } from './store/targetSlice';
import { createWorkspaceActions } from './store/workspaceSlice';
import type { OpsFlowState } from './store/types';

export type { TransferResult, WorkspaceImportOptions } from './store/types';

/** Auto-refresh intervals offered in the UI, in seconds. 0 means off. */
export const REFRESH_INTERVALS = [0, 10, 30, 60] as const;

export const useOpsFlowStore = create<OpsFlowState>((set, get) => {
  const initialCatalog = getInitialWorkspaceCatalog();
  const helpers = createStoreHelpers(set);

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
    ...createKubeconfigActions(set, get, helpers),
    ...createTargetActions(set, get),
    ...createPodActions(set, get),
    ...createWorkspaceActions(set, get, helpers),
  };
});

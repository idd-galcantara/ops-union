import type { StoreApi } from 'zustand';
import type { PortablePreset, Preset } from '../presets';
import type {
  ContextInfo,
  GroupingMode,
  KubeConfigStatus,
  NamespaceInfo,
  NormalizedPod,
  Target,
  TargetError,
} from '../types';
import type {
  Workspace,
  WorkspaceImportResult,
} from '../workspaces';
import type {
  TransferConflictStrategy,
  TransferPlan,
} from '../presetTransfer';
import type {
  CopyConflictStrategy,
  CopyPlan,
} from '../presetCopy';
import type {
  MoveConflictStrategy,
  MovePlan,
} from '../presetMove';

export interface WorkspaceImportOptions {
  overwrite?: boolean;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
}

export interface OpsFlowState {
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
  copyPresetsFromWorkspace: (plan: CopyPlan, strategy?: CopyConflictStrategy) => Promise<TransferResult>;
  movePresetsFromWorkspace: (plan: MovePlan, strategy?: MoveConflictStrategy) => Promise<TransferResult>;
  appendImportedPresets: (presets: PortablePreset[]) => void;
  clearPresets: () => void;
}

export type StoreSet = StoreApi<OpsFlowState>['setState'];
export type StoreGet = StoreApi<OpsFlowState>['getState'];

export interface StoreHelpers {
  resetWorkspaceView: () => void;
  applyKubeconfigChange: (kubeconfigStatus?: KubeConfigStatus) => void;
}
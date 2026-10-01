import { useEffect, useState } from 'react';
import { buildApplicationLogInventory, inventorySourceKey, selectionToLogSources } from './logSourceInventory';
import { hasSingleApplicationKey } from './logSourceModal';
import type {
  ApplicationLogInventory,
  InventoryIssue,
  LogSource,
  LogSourceSelection,
  NormalizedPod,
  PodRef,
  Target,
  TargetError,
} from './types';
import { toPodRef, type DetailsTab } from './usePodSelectionController';

export interface LogModalState {
  inventory: ApplicationLogInventory;
  originatingContext: Pick<Target, 'cluster' | 'namespace'>;
  initialSelectedKeys?: string[];
}

interface LogSourceControllerOptions {
  pods: NormalizedPod[];
  targets: Target[];
  targetErrors: TargetError[];
  lastUpdatedAt?: number;
  selected: PodRef | null;
  selectedLogPods: PodRef[];
  onSelectLogPods: (pods: NormalizedPod[]) => void;
  onSetLogPods: (pods: PodRef[]) => void;
  onSetDetailsInitialTab: (tab: DetailsTab) => void;
  podsLoading: boolean;
  podsError?: string;
  refreshPods: () => void;
}

function inventoryIssues(targetErrors: TargetError[]): InventoryIssue[] {
  return targetErrors.map((item) => ({
    cluster: item.target.cluster,
    namespace: item.target.namespace,
    message: item.message,
  }));
}

export function useLogSourceController({
  pods,
  targets,
  targetErrors,
  lastUpdatedAt,
  selected,
  selectedLogPods,
  onSelectLogPods,
  onSetLogPods,
  onSetDetailsInitialTab,
  podsLoading,
  podsError,
  refreshPods,
}: LogSourceControllerOptions) {
  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [logConsultedContexts, setLogConsultedContexts] = useState<Target[]>([]);
  const [logModal, setLogModal] = useState<LogModalState | null>(null);

  const openLogModalFromPods = (sourcePods: NormalizedPod[], preserveCurrent = false) => {
    const first = sourcePods[0];
    if (!first || !hasSingleApplicationKey(sourcePods)) return;
    const inventory = buildApplicationLogInventory(
      pods,
      first.application,
      inventoryIssues(targetErrors),
      lastUpdatedAt,
      targets,
    );
    const currentKeys = preserveCurrent && logSources.length > 0 && logSources[0].application?.key === first.application.key
      ? logSources.map(inventorySourceKey)
      : undefined;
    onSelectLogPods(sourcePods);
    setLogModal({
      inventory,
      originatingContext: { cluster: first.cluster, namespace: first.namespace },
      initialSelectedKeys: currentKeys,
    });
  };

  const openCurrentLogSources = () => {
    const sourcePods = selectedLogPods.length > 0
      ? pods.filter((item) => selectedLogPods.some((ref) => ref.cluster === item.cluster && ref.namespace === item.namespace && ref.name === item.name))
      : [pods.find((item) => item.cluster === selected?.cluster && item.namespace === selected?.namespace && item.name === selected?.name)].filter((item): item is NormalizedPod => Boolean(item));
    openLogModalFromPods(sourcePods, true);
  };

  const closeLogWorkspace = () => {
    setLogSources([]);
    onSetDetailsInitialTab('describe');
  };

  const clearDetailsLogState = () => {
    setLogSources([]);
    setLogConsultedContexts([]);
    onSetDetailsInitialTab('describe');
  };

  const resetLogState = () => {
    setLogSources([]);
    setLogConsultedContexts([]);
    setLogModal(null);
    onSetDetailsInitialTab('describe');
  };

  const confirmLogSources = (selection: LogSourceSelection[]) => {
    const confirmed = selectionToLogSources(selection);
    if (confirmed.length === 0) return;
    setLogSources(confirmed);
    setLogConsultedContexts(logModal?.inventory.consultedContexts ?? confirmed.map(({ cluster, namespace }) => ({ cluster, namespace })));
    onSetLogPods(pods
      .filter((pod) => confirmed.some((source) => source.cluster === pod.cluster && source.namespace === pod.namespace && source.pod === pod.name))
      .map(toPodRef));
    onSetDetailsInitialTab('describe');
    setLogModal(null);
  };

  useEffect(() => {
    if (!logModal || !lastUpdatedAt || logModal.inventory.snapshotAt === lastUpdatedAt) return;
    const application = logModal.inventory.application;
    const inventory = buildApplicationLogInventory(pods, application, inventoryIssues(targetErrors), lastUpdatedAt, targets);
    setLogModal((current) => {
      if (!current || current.inventory.application.key !== application.key) return current;
      return { ...current, inventory };
    });
  }, [lastUpdatedAt, logModal, pods, targetErrors, targets]);

  return {
    logSources,
    logConsultedContexts,
    logModal,
    openLogModalFromPods,
    openCurrentLogSources,
    closeLogWorkspace,
    clearDetailsLogState,
    resetLogState,
    confirmLogSources,
    closeLogModal: () => setLogModal(null),
    refreshInventory: refreshPods,
    inventoryLoading: podsLoading,
    inventoryError: podsError,
  };
}
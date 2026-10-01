import { canUseManualNamespace, hasExactNamespaceMatch } from './namespaceSuggestions';
import { targetKey, type ContextInfo, type NamespaceInfo, type Target } from './types';

export interface TargetSelectionModel {
  visibleContexts: ContextInfo[];
  allVisibleClustersSelected: boolean;
  namespacesToAdd: string[];
  unavailableClusters: string[];
  availableTargetCount: number;
  unavailableTargetCount: number;
  canAdd: boolean;
}

export function filterContexts(contexts: ContextInfo[], filter: string): ContextInfo[] {
  const needle = filter.trim().toLowerCase();
  return needle ? contexts.filter((context) => context.name.toLowerCase().includes(needle)) : contexts;
}

export function getTargetSelectionModel({
  contexts,
  contextFilter,
  selectedClusters,
  selectedNamespaces,
  namespace,
  namespaces,
  namespacesReady,
  namespacesError,
}: {
  contexts: ContextInfo[];
  contextFilter: string;
  selectedClusters: string[];
  selectedNamespaces: string[];
  namespace: string;
  namespaces: NamespaceInfo[];
  namespacesReady: boolean;
  namespacesError?: string;
}): TargetSelectionModel {
  const visibleContexts = filterContexts(contexts, contextFilter);
  const allVisibleClustersSelected = visibleContexts.length > 0
    && visibleContexts.every((context) => selectedClusters.includes(context.name));
  const manualNamespaceFallback = canUseManualNamespace(namespaces, namespacesReady, namespacesError);
  const hasExactMatch = (namespacesReady && hasExactNamespaceMatch(namespaces, namespace))
    || (manualNamespaceFallback && Boolean(namespace.trim()));
  const namespacesToAdd = [
    ...selectedNamespaces,
    ...(hasExactMatch && namespace.trim() && !selectedNamespaces.includes(namespace.trim())
      ? [namespace.trim()]
      : []),
  ];
  const namespaceInfoByName = new Map(namespaces.map((item) => [item.name, item]));
  const isNamespaceAvailable = (cluster: string, name: string) =>
    namespaceInfoByName.get(name)?.clusters.includes(cluster)
    ?? (manualNamespaceFallback && Boolean(name.trim()));
  const unavailableClusters = selectedClusters.filter((cluster) =>
    namespacesToAdd.some((name) => !isNamespaceAvailable(cluster, name)),
  );
  const availableTargetCount = selectedClusters.reduce(
    (count, cluster) => count + namespacesToAdd.filter((name) => isNamespaceAvailable(cluster, name)).length,
    0,
  );
  const unavailableTargetCount = selectedClusters.length * namespacesToAdd.length - availableTargetCount;

  return {
    visibleContexts,
    allVisibleClustersSelected,
    namespacesToAdd,
    unavailableClusters,
    availableTargetCount,
    unavailableTargetCount,
    canAdd: selectedClusters.length > 0 && namespacesReady && availableTargetCount > 0,
  };
}

export function buildAvailableTargets(
  selectedClusters: string[],
  namespacesToAdd: string[],
  namespaces: NamespaceInfo[],
  manualNamespaceFallback: boolean,
): Target[] {
  const namespaceInfoByName = new Map(namespaces.map((item) => [item.name, item]));
  const targets: Target[] = [];
  for (const cluster of selectedClusters) {
    for (const namespace of namespacesToAdd) {
      const available = namespaceInfoByName.get(namespace)?.clusters.includes(cluster)
        ?? (manualNamespaceFallback && Boolean(namespace.trim()));
      if (available) targets.push({ cluster, namespace });
    }
  }
  return [...new Map(targets.map((target) => [targetKey(target), target])).values()];
}
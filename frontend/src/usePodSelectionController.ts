import { useState } from 'react';
import type { NormalizedPod, PodRef } from './types';

export type DetailsTab = 'describe' | 'metrics' | 'logs';

export function toPodRef(pod: NormalizedPod): PodRef {
  return {
    cluster: pod.cluster,
    namespace: pod.namespace,
    name: pod.name,
    containers: pod.containers,
    application: pod.application,
  };
}

export function usePodSelectionController() {
  const [selected, setSelected] = useState<PodRef | null>(null);
  const [selectedLogPods, setSelectedLogPods] = useState<PodRef[]>([]);
  const [detailsInitialTab, setDetailsInitialTab] = useState<DetailsTab>('describe');

  const openPod = (pod: NormalizedPod) => {
    setSelected(toPodRef(pod));
    setSelectedLogPods([]);
    setDetailsInitialTab('describe');
  };

  const openLogPods = (pods: NormalizedPod[]) => {
    const first = pods[0];
    if (!first) return;
    setSelected(toPodRef(first));
    setSelectedLogPods(pods.map(toPodRef));
  };

  const setLogPods = (pods: PodRef[]) => setSelectedLogPods(pods);

  const clearSelection = () => {
    setSelected(null);
    setSelectedLogPods([]);
    setDetailsInitialTab('describe');
  };

  return {
    selected,
    selectedLogPods,
    detailsInitialTab,
    openPod,
    openLogPods,
    setLogPods,
    setDetailsInitialTab,
    clearSelection,
  };
}
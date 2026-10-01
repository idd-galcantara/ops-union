import { useMemo } from 'react';
import { matchesFilter } from './podPresentation';
import type { NormalizedPod } from './types';

export interface ApplicationFilterOption {
  key: string;
  name: string;
  podCount: number;
}

export interface PodViewData {
  applicationOptions: ApplicationFilterOption[];
  visiblePods: NormalizedPod[];
  clusterCount: number;
  namespaceCount: number;
}

export function derivePodViewData(
  pods: NormalizedPod[],
  filter: string,
  selectedApplications: string[],
): PodViewData {
  const counts = new Map<string, ApplicationFilterOption>();
  for (const pod of pods) {
    const current = counts.get(pod.application.key);
    if (current) current.podCount += 1;
    else counts.set(pod.application.key, { key: pod.application.key, name: pod.application.name, podCount: 1 });
  }

  const selected = new Set(selectedApplications);
  const visiblePods = pods.filter((pod) =>
    (selected.size === 0 || selected.has(pod.application.key)) && matchesFilter(pod, filter),
  );

  return {
    applicationOptions: [...counts.values()].sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)),
    visiblePods,
    clusterCount: new Set(pods.map((pod) => pod.cluster)).size,
    namespaceCount: new Set(pods.map((pod) => pod.namespace)).size,
  };
}

export function usePodViewData(pods: NormalizedPod[], filter: string, selectedApplications: string[]): PodViewData {
  return useMemo(() => derivePodViewData(pods, filter, selectedApplications), [filter, pods, selectedApplications]);
}
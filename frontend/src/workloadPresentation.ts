import type { WorkloadMetric, WorkloadSummary } from './types';

const replicaLabels: [keyof NonNullable<WorkloadSummary['replicas']>, string][] = [
  ['desired', 'desired'],
  ['current', 'current'],
  ['available', 'available'],
  ['ready', 'ready'],
  ['updated', 'updated'],
  ['unavailable', 'unavailable'],
];

function formatMetricValue(value?: WorkloadMetric['current']): string | undefined {
  if (!value) return undefined;
  if (value.averageUtilization !== undefined) return `${value.averageUtilization}%`;
  if (value.averageValue !== undefined) return value.averageValue;
  return value.value;
}

export function formatWorkloadIdentity(workload?: WorkloadSummary): string {
  if (!workload?.kind || !workload.name) return 'Workload unavailable';
  return `${workload.kind}: ${workload.name}`;
}

export function formatReplicaSummary(workload?: WorkloadSummary): string {
  if (!workload?.replicas) return 'Replicas unavailable';
  const values = replicaLabels
    .flatMap(([key, label]) => workload.replicas?.[key] === undefined ? [] : [`${label} ${workload.replicas[key]}`]);
  return values.length > 0 ? values.join(' · ') : 'Replicas unavailable';
}

export function formatHpaSummary(workload?: WorkloadSummary): string {
  if (!workload?.hpa) return workload?.hpaError ? 'HPA data unavailable' : 'HPA not configured';
  const values: [keyof NonNullable<WorkloadSummary['hpa']>, string][] = [
    ['minReplicas', 'min'],
    ['maxReplicas', 'max'],
    ['currentReplicas', 'current'],
    ['desiredReplicas', 'desired'],
  ];
  const parts = values.flatMap(([key, label]) => workload.hpa?.[key] === undefined ? [] : [`${label} ${workload.hpa[key]}`]);
  return parts.length > 0 ? parts.join(' · ') : 'HPA values unavailable';
}

export function formatWorkloadMetric(metric: WorkloadMetric): string {
  const name = metric.name.toUpperCase();
  const current = formatMetricValue(metric.current);
  const target = formatMetricValue(metric.target);
  if (current && target) return `${name} ${current} / ${target}`;
  if (current) return `${name} ${current}`;
  if (target) return `${name} target ${target}`;
  return `${name} unavailable`;
}

export function formatWorkloadNotes(workload?: WorkloadSummary): string[] {
  if (!workload) return ['No supported workload owner was found.'];
  const notes: string[] = [];
  if (workload.error) notes.push(`Workload data unavailable: ${workload.error.message}`);
  if (workload.hpaError) notes.push(`HPA data unavailable: ${workload.hpaError.message}`);
  return notes;
}
/** A query target: one (cluster, namespace) pair. */
export interface Target {
  cluster: string;
  namespace: string;
}

export interface ApplicationIdentity {
  key: string;
  name: string;
  source: 'label' | 'ownerReference' | 'pod';
  labelKey?: 'app.kubernetes.io/name' | 'app' | 'k8s-app';
  ownerKind?: string;
  ownerName?: string;
}

/** A pod normalized for the unified view, annotated with its origin. */
export interface NormalizedPod {
  /** Origin context/cluster name. */
  cluster: string;
  /** Origin namespace. */
  namespace: string;
  name: string;
  /** Phase or a more specific reason (e.g. Running, CrashLoopBackOff, Pending). */
  status: string;
  /** Ready containers over desired, e.g. "2/3". */
  ready: string;
  /** Total container restarts. */
  restarts: number;
  /** Node the pod is scheduled on, or "" when unscheduled. */
  node: string;
  /** Application image tag, without a build suffix, or "" when unavailable. */
  imageTag: string;
  /** Age in seconds since creation (frontend formats it). */
  ageSeconds: number;
  /** Container names, used for log/metrics selection. */
  containers: string[];
  application: ApplicationIdentity;
}

/** An error for a single target that failed during fan-out. */
export interface TargetError {
  target: Target;
  message: string;
}

/** Aggregated result of a pods fan-out across many targets. */
export interface PodsFanOutResult {
  pods: NormalizedPod[];
  errors: TargetError[];
}

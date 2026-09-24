# Requirements - ops-union v1.5.2 workload summary

## Scope

Version 1.5.2 adds a read-only workload summary to the existing pod Describe panel. The summary
resolves a pod owner chain to Deployment, StatefulSet, or Argo Rollout, normalizes available
replica data, and associates a namespaced HPA when its scale target matches the resolved workload.
It remains a best-effort view of current Kubernetes API responses: no watches, mutations,
collectors, persistence, or durable history are added.

## User stories

- As an operator, I can see which Deployment, StatefulSet, or Rollout owns an inspected pod.
- As an operator, I can compare workload replicas and HPA bounds/current/desired values without
  leaving the pod details panel.
- As an operator, I can see resource metric values such as `CPU 6% / 80%` when Kubernetes exposes
  them.
- As an operator, I can still inspect all existing pod details when workload resources, HPAs, CRDs,
  or permissions are unavailable.
- As a security-conscious user, I can verify that workload inspection remains strictly read-only.

## Requirements

### WS-1 - Workload resolution and API contract

1. The existing pod Describe response SHALL retain every existing field and add an optional,
   structured workload summary.
2. Direct pod owner references SHALL resolve Deployment, StatefulSet, or Argo Rollout when present.
3. ReplicaSet owners SHALL be read by name, then followed through a controller owner to Deployment
   or Rollout. Unsupported or missing owner chains SHALL degrade with a structured error.
4. Deployment, StatefulSet, and ReplicaSet reads SHALL use AppsV1Api. Rollout reads SHALL use
   CustomObjectsApi group `argoproj.io`, version `v1alpha1`, plural `rollouts`, namespaced by name.
5. The implementation SHALL use the existing per-context client caching pattern.
6. Workload replica normalization SHALL preserve available `spec.replicas`, `status.replicas`,
   `availableReplicas`, `readyReplicas`, `updatedReplicas`, and `unavailableReplicas` values and
   SHALL leave omitted values unavailable.

### WS-2 - HPA association and normalization

1. The implementation SHALL use AutoscalingV2Api to list HPAs in the pod namespace and match
   `spec.scaleTargetRef.kind` and `spec.scaleTargetRef.name` against the resolved workload,
   including `kind: Rollout`.
2. The normalized HPA SHALL preserve name, target kind/name, min/max/current/desired replicas, and
   resource metrics when Kubernetes provides them.
3. Resource metrics SHALL retain metric name, current and target values/average values/average
   utilization as available, without inventing missing values. The UI SHALL be able to render
   values such as `CPU 6% / 80%`.
4. If workload resolution is absent, forbidden, unreadable, or the Rollouts CRD is missing, the
   service SHALL still attempt HPA exposure when a matching target can be derived from the owner
   chain. HPA read errors SHALL not hide pod details or workload identity.
5. Missing/forbidden workload and HPA data SHALL be represented by concise structured notes/errors,
   not by a failed Describe request.

### WS-3 - Describe presentation

1. The Describe tab SHALL render a Workload section before the existing pod status grid.
2. A resolved Rollout SHALL be shown as `Rollout: <name>`; Deployment and StatefulSet identities
   SHALL use their respective kinds.
3. The section SHALL show normalized workload replicas and HPA min/max/current/desired replicas
   plus resource metric summaries when available.
4. A workload that resolves without a matching HPA SHALL explicitly show `HPA not configured`.
5. Missing, forbidden, unsupported, and unreadable data SHALL appear as concise non-blocking notes;
   the existing containers, conditions, events, labels, metrics, and logs behavior SHALL remain.
6. The feature SHALL expose no mutation controls and SHALL make no durable-history claim.

### WS-4 - Read-only boundary and verification

1. Only Kubernetes read/list calls SHALL be added: AppsV1Api reads, CustomObjectsApi get,
   AutoscalingV2Api HPA list, and existing pod/event/metrics/log reads.
2. No watches, mutations, persistence, collectors, or arbitrary command execution SHALL be added.
3. Backend tests SHALL cover ReplicaSet-to-Rollout resolution, Rollout normalization, HPA Rollout
   matching, metrics normalization, missing/forbidden CRD/HPA behavior, and absent fields.
4. Frontend formatter tests SHALL cover workload identity, replica/HPA display, metric formatting,
   explicit HPA-not-configured state, and unavailable notes.
5. Focused and full backend/frontend tests, typechecks, builds, diagnostics, and `git diff --check`
   SHALL be run. Real-cluster validation SHALL remain read-only and its availability SHALL be
   recorded honestly.

## Definition of done

- The existing Describe endpoint returns the unchanged pod contract plus a best-effort workload
  summary for Deployment, StatefulSet, and Argo Rollout owner chains.
- HPA data matches standard controllers and Rollouts and preserves unavailable fields.
- The Workload section appears before the status grid and degrades without hiding pod details.
- Focused tests and requested package validation pass, documentation describes the behavior, and
  limitations mention Argo Rollouts CRD/API and RBAC.

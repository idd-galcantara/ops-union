# Design - ops-union v1.5.2 workload summary

## Overview

The existing `getPodDescribe` service remains the orchestration boundary. After reading the pod,
it resolves the owner chain through a small workload module, reads a matching HPA, and adds an
optional normalized `workload` field to the existing response. All reads are per-request and
best-effort; no workload state is persisted.

## Ownership and collaboration

- `@ops-union-backend` owns client factories/cache additions, owner-chain resolution, normalization,
  HPA matching, graceful errors, and backend tests.
- `@ops-union-frontend` owns shared workload types, formatters, Workload section presentation, and
  frontend tests.
- `@ops-union-integration-qa` owns read-only boundary checks, package validation, diagnostics, and
  available cluster evidence.
- `@ops-union-docs-convergence` audits current README and technical documentation after verified
  implementation.
- No release, packaging, commit, push, or Kubernetes mutation is part of this specification.

## Client and resolution flow

1. Read the pod through the existing CoreV1Api client.
2. Inspect `metadata.ownerReferences` for a controller owner. Direct Deployment, StatefulSet, and
   Rollout owners become the workload identity.
3. For a ReplicaSet owner, read the ReplicaSet using AppsV1Api, then follow its controller owner to
   Deployment or Rollout. A Deployment/ReplicaSet chain uses AppsV1Api; a Rollout chain uses
   CustomObjectsApi.
4. Read the resolved workload using AppsV1Api or CustomObjectsApi. A missing/forbidden/unreadable
   resource produces a structured workload error while retaining any identity and continuing to
   derive an HPA target where possible.
5. List namespaced HPAs through AutoscalingV2Api and match target kind/name exactly. A matching HPA
   is normalized even for `kind: Rollout`.
6. Return the pod response with `workload` omitted only when no identity can be derived; errors,
   HPA absence, and missing fields remain explicit within that object.

## Normalized response

`PodDescribe.workload` contains:

- `kind` and `name` for Deployment, StatefulSet, or Rollout identity;
- optional `replicas` values for desired/spec, total/status, available, ready, updated, and
  unavailable counts;
- optional `hpa` with name, target kind/name, min/max/current/desired replicas, and normalized
  resource metrics;
- optional structured `error` and `hpaError` strings suitable for non-blocking UI notes.

Replica values are copied only when numeric and present. HPA resource metrics preserve metric name,
current value, target value, current/target average value, and current/target utilization as
available. The formatter composes a CPU utilization pair as `CPU 6% / 80%` when both values exist;
it does not fill missing values.

## Presentation

`PodDetailsPanel` renders a Workload section before the existing `<dl className="detail-grid">`.
The section is compact and scans as identity, replicas, HPA bounds/current/desired, and metrics.
It explicitly renders `HPA not configured` for a resolved workload without a matching HPA, and
renders concise notes for workload/HPA errors. Existing sections are left in their current order
and behavior.

## Validation strategy

- Backend unit tests use pure resolver/normalizer helpers and mocked read clients to cover direct
  owners, ReplicaSet-to-Rollout traversal, standard and custom resources, HPA matching, metrics,
  forbidden/missing APIs, and omitted fields.
- Frontend formatter tests cover identity and all optional display states without requiring a DOM.
- Run focused tests first, then full backend/frontend tests, backend/frontend/desktop typechecks,
  workspace build, diagnostics, and `git diff --check`.
- Real-cluster validation, if available, uses read-only `kubectl get` evidence only. Argo Rollouts
  CRD availability, API shape/version, RBAC for Apps/CustomObjects/Autoscaling, and clusters that
  omit status/metrics are recorded as limitations rather than concealed.

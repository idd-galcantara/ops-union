# Implementation Tasks - ops-union v1.5.2 workload summary

These tasks authorize only the scoped read-only workload summary. They do not authorize Kubernetes
mutation, watches, collectors, persistence, packaging, release, commit, or push.

## Ownership and sequencing

- `@ops-union-backend` owns WS-1, WS-2, and backend tests.
- `@ops-union-frontend` owns WS-3, shared types, formatters, and frontend tests.
- `@ops-union-integration-qa` owns WS-4 read-only and validation evidence.
- `@ops-union-docs-convergence` performs the final documentation audit after implementation.

## Tasks

- [x] 1.5.2-WS-1 Add cached Kubernetes readers and resolve workload owner chains.
  - Support direct Deployment, StatefulSet, and Rollout owners plus ReplicaSet -> Deployment/Rollout.
  - Use AppsV1Api for standard resources and CustomObjectsApi for Rollouts.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: WS-1.1-WS-1.6, WS-4.1
  - _Validation: focused resolver tests and backend typecheck.

- [x] 1.5.2-WS-2 Normalize workloads, HPAs, and graceful errors.
  - Match AutoscalingV2 HPAs by target kind/name including Rollout and preserve optional replicas and
    resource metric fields.
  - Continue exposing workload identity/pod details when resources or HPA access fail.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: WS-2.1-WS-2.5, WS-4.1, WS-4.3
  - _Dependencies: 1.5.2-WS-1
  - _Validation: focused workload/HPA tests and backend typecheck.

- [x] 1.5.2-WS-3 Add the Workload section and formatter tests.
  - Render workload identity before the pod status grid, replicas, HPA values, metrics, explicit HPA
    not configured, and concise degradation notes.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: WS-3.1-WS-3.6, WS-4.4
  - _Dependencies: 1.5.2-WS-2
  - _Validation: focused formatter tests and frontend typecheck/build.

- [x] 1.5.2-WS-4 Verify read-only boundaries and package validation.
  - Confirm no mutation/watch/collector/persistence/credential exposure and run the requested focused,
    full, typecheck, build, diagnostics, and diff checks.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: WS-4.1-WS-4.5
  - _Dependencies: 1.5.2-WS-1, 1.5.2-WS-2, 1.5.2-WS-3
  - _Validation: package commands, diagnostics, and available read-only cluster evidence.

- [x] 1.5.2-WS-5 Converge current documentation and close evidence.
  - Update README and docs/TECH-DEFINITION with verified workload behavior and Argo/RBAC limitations;
    preserve historical specs and release material.
  - _Owner: @ops-union-docs-convergence
  - _Copilot agent: @ops-union-docs-convergence
  - _Requirements: WS-3, WS-4.5
  - _Dependencies: 1.5.2-WS-4
  - _Validation: documentation audit, task evidence, and `git diff --check`.

## Validation record

Implementation status: complete for the scoped read-only feature.

- WS-1/WS-2: `backend/src/kube/kubeconfig.ts`,
  `backend/src/kube/workloadSummary.ts`, and
  `backend/src/kube/podDetailsService.ts` add cached Apps/Custom Objects/Autoscaling readers,
  ReplicaSet -> Deployment/Rollout resolution, Rollout normalization, HPA matching, metrics, and
  independent graceful errors. Focused workload/pod tests pass 13/13; backend typecheck passes.
- WS-3: `frontend/src/types.ts`, `frontend/src/workloadPresentation.ts`,
  `frontend/src/components/PodDetailsPanel.tsx`, and `frontend/src/index.css` add the Workload
  section before the status grid. Focused workload/diagnostics tests pass 4/4; frontend typecheck
  and build pass.
- WS-4: full backend tests pass 98/98, full frontend tests pass 110/110, all workspace typechecks
  pass, `npm run build` passes, touched-file diagnostics report no errors, and `git diff --check`
  passes. Only read/list Kubernetes operations were added; no mutation, watch, collector,
  persistence, credential exposure, commit, tag, push, or release operation was performed.
- WS-5: current `README.md` and `docs/TECH-DEFINITION.md` describe workload summaries, read-only
  API calls, HPA behavior, and Argo/RBAC limitations. Historical specs and release material were
  left unchanged. Documentation convergence is ready.

Known validation limitations: browser/Electron interaction, screen-reader behavior, and a live
real-cluster validation run were not available in this environment. The provided production HPA
evidence was used to cover the required `Rollout` target shape; no live-cluster mutation was run.
- Required limitations: Argo Rollouts requires the `argoproj.io/v1alpha1` Rollouts CRD and readable
  CustomObjects RBAC; standard workload and HPA visibility also depends on namespace/resource RBAC.
- No real-cluster mutation, commit, tag, push, or release operation is authorized.

# Implementation Tasks - ops-union v1.5.1 pod termination history

These tasks authorize only the scoped read-only describe enrichment and diagnostics presentation.
They do not authorize Kubernetes mutation, collectors, persistence, packaging, release, commit, or
push.

## Ownership and sequencing

- `@ops-union-backend` owns PH-1 and backend tests.
- `@ops-union-frontend` owns PH-3, shared types, and frontend tests.
- `@ops-union-integration-qa` owns PH-2/PH-4 read-only and integration evidence.
- `@ops-union-docs-convergence` performs the final documentation audit after implementation.

## Tasks

- [x] 1.5.1-PH-1 Define and normalize enriched container state.
  - Add optional current state metadata and normalized lastState without breaking existing fields.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: PH-1.1-PH-1.2, PH-2.1-PH-2.4
  - _Validation: focused backend unit tests and backend typecheck.

- [x] 1.5.1-PH-2 Build the bounded newest-first termination timeline.
  - Merge terminated current/last states with pod events, handling absent timestamps and event errors.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: PH-1.3-PH-1.5
  - _Dependencies: 1.5.1-PH-1
  - _Validation: focused normalization tests and describe contract review.

- [x] 1.5.1-PH-3 Add the collapsible Advanced diagnostics UI.
  - Extend frontend types and render the timeline closed by default with empty/degraded states.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: PH-3.1-PH-3.5
  - _Dependencies: 1.5.1-PH-2
  - _Validation: focused frontend helper/component tests and frontend typecheck/build.

- [x] 1.5.1-PH-4 Verify read-only boundaries and graceful degradation.
  - Confirm no mutation, collector, persistence, credential exposure, or durable-history claim.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: PH-2, PH-4.3-PH-4.4
  - _Dependencies: 1.5.1-PH-1, 1.5.1-PH-2, 1.5.1-PH-3
  - _Validation: package tests/typechecks, diff check, and available read-only checks.

- [x] 1.5.1-PH-5 Converge documentation and close evidence.
  - Audit current normative documentation and record implementation status, limitations, and checks.
  - _Owner: @ops-union-docs-convergence
  - _Copilot agent: @ops-union-docs-convergence
  - _Requirements: PH-4.3-PH-4.4
  - _Dependencies: 1.5.1-PH-4
  - _Validation: documentation audit, task evidence, and `git diff --check`.

## Validation record

Implementation status: complete for the scoped read-only feature.

- PH-1/PH-2: `backend/src/kube/podDetailsService.ts` preserves current and last state metadata and
  builds a stable newest-first timeline from terminated states and existing pod events. Focused
  pod-details tests pass 8/8; backend typecheck passes.
- PH-3: `frontend/src/types.ts`, `frontend/src/terminationHistory.ts`, and
  `frontend/src/components/PodDetailsPanel.tsx` expose the contract and a native collapsed
  Advanced diagnostics disclosure. Focused formatter tests pass 2/2; frontend typecheck/build pass.
- PH-4: backend tests pass 91/91, frontend tests pass 107/107, full workspace build passes, touched
  file diagnostics report no errors, and `git diff --check` passes. No Kubernetes mutation, watch,
  collector, persistence, credential exposure, commit, package, or release operation was performed.
- PH-5: current `README.md` and `docs/TECH-DEFINITION.md` now describe v1.5.1 diagnostics behavior;
  historical specs and release notes were left unchanged.

Known limitations: the feature reports only the current pod object's current/last states and the
events returned at describe time. It is not durable multi-day history. Browser/Electron interaction,
screen-reader, and real-cluster validation were not available in this environment.
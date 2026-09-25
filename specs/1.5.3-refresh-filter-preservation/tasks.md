# Implementation Tasks - ops-union v1.5.3 refresh filter preservation

These tasks document the already implemented frontend state-preservation behavior. They authorize
only the scoped frontend change and its validation. They do not authorize backend changes,
Kubernetes mutation, watches, persistence, packaging, release, commit, or push.

## Ownership and sequencing

- `@ops-union-frontend` owns RFP-1, RFP-2, RFP-3, and focused frontend tests.
- `@ops-union-integration-qa` owns RFP-4, RFP-5, non-regression validation, diagnostics, and the
  validation record.
- `@ops-union-architecture-review` owns any read-only contract/ownership audit needed to confirm the
  explicit-query boundary.

## Tasks

- [x] 1.5.3-RFP-1 Add the explicit-fetch reset option to the frontend pod store.
  - Add `resetView?: boolean` to `loadPods` options and retain reset behavior as the default for
    explicit target-selector and initial-launchpad fetches.
  - Clear the current filter and covered view state only for the explicit-fetch reset path and
    preserve the existing new explicit-query signal.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: RFP-1.1-RFP-1.5, RFP-3.1-RFP-3.5
  - _Validation: frontend store/action tests and frontend typecheck.

- [x] 1.5.3-RFP-2 Route refresh, retry, and auto-refresh through preserving loads.
  - Pass `resetView: false` for toolbar manual refresh, silent auto-refresh, and error retries.
  - Preserve the current pod text filter and other existing view state across loading, success, and
    failed retry transitions.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: RFP-2.1-RFP-2.3, RFP-3.1-RFP-3.5
  - _Dependencies: 1.5.3-RFP-1
  - _Validation: focused refresh/retry/auto-refresh tests with a non-empty filter and view state.

- [x] 1.5.3-RFP-3 Preserve the unified Pods view during application log inventory refresh.
  - Keep application log inventory refresh separate from the explicit pod-fetch intent and retain the
    current Pods filter and other view state.
  - Confirm inventory refresh does not emit a new explicit-query signal or reset the Pods view.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: RFP-2.4-RFP-2.5, RFP-3.3-RFP-3.4, RFP-4.4
  - _Dependencies: 1.5.3-RFP-1
  - _Validation: focused application-log inventory refresh test and frontend typecheck.

- [x] 1.5.3-RFP-4 Verify read-only boundaries and frontend non-regression behavior.
  - Confirm the change is limited to frontend state/action routing and related contracts/tests, with
    no backend, Kubernetes, persistence, credential, packaging, release, or source-data mutation.
  - Verify existing filtered rendering, explicit fetch reset, silent auto-refresh, retry, and log
    inventory behavior remain compatible.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: RFP-4.1-RFP-4.5, RFP-5.1-RFP-5.4
  - _Dependencies: 1.5.3-RFP-1, 1.5.3-RFP-2, 1.5.3-RFP-3
  - _Validation: full frontend test suite, frontend typecheck, and touched-file diagnostics.

## Validation record

Implementation status: complete for the scoped frontend state-preservation behavior.

- RFP-1/RFP-3: the frontend store exposes `resetView?: boolean`; explicit fetches retain reset
  semantics by default, while `resetView: false` preserves the filter and other covered view state
  without signaling a new explicit query.
- RFP-2: toolbar refresh, silent auto-refresh, error retries, and application log inventory refresh
  use preserving behavior and retain the unified Pods view state.
- RFP-4/RFP-5: frontend tests pass 110/110, frontend typecheck passes, and touched-file diagnostics
  report no errors. No backend or Kubernetes mutation was introduced or run.

Known validation scope: the recorded checks cover the implemented frontend behavior and touched-file
static diagnostics. No live-cluster, packaging, commit, or push operation is part of this spec.

## Definition of done

- Explicit target-selector/initial-launchpad fetch resets the view and signals a new explicit query.
- Toolbar refresh, auto-refresh, error retries, and application log inventory refresh preserve the
  current pod filter and other covered view state.
- `resetView?: boolean` is documented at the store boundary with compatible explicit-fetch defaults.
- Frontend tests pass 110/110, frontend typecheck passes, touched-file diagnostics have no errors,
  and read-only/non-regression boundaries are recorded.
- No source code, README, docs, historical specs, commit, or push is changed by this specification
  task.

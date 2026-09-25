# Requirements - ops-union v1.5.3 refresh filter preservation

## Scope

Version 1.5.3 preserves the current view state in the unified Pods view when the view is refreshed
implicitly or through existing refresh/retry surfaces. Manual toolbar refresh, auto-refresh, error
retries, and application log inventory refresh SHALL retain the current pod text filter and other
view state. Only an explicit `Fetch pods` action from the target selector or initial launchpad flow
starts a new explicit query and resets the view, including the pod filter.

The change is frontend-only and preserves the existing silent auto-refresh behavior. It does not
change Kubernetes API permissions, mutation behavior, persistence, log contents, or backend query
semantics.

## User stories

- As an operator, I can manually refresh the unified Pods view without losing my current filter or
  other view state.
- As an operator, I can leave auto-refresh enabled without the view jumping back to an unfiltered
  list.
- As an operator, I can retry after a load error without having to reconstruct the filter and view
  state I was using.
- As an operator, I can refresh the application log inventory without losing my current Pods view.
- As an operator, I can explicitly fetch pods for a new target and receive a clean view for that
  explicit query.

## Requirements

### RFP-1 - Explicit fetch and reset contract

1. The frontend pod store `loadPods` options SHALL support an optional `resetView?: boolean`
   control.
2. An explicit `Fetch pods` action from the target selector or initial launchpad flow SHALL call
   `loadPods` with reset behavior enabled, either by passing `resetView: true` or by relying on the
   explicit-fetch default.
3. An explicit fetch SHALL clear the current pod text filter and reset the view state defined by the
   existing Pods store contract before presenting results for the new target.
4. An explicit fetch SHALL signal a new explicit query; it SHALL remain distinguishable from a
   refresh, retry, or background inventory update.
5. The default for explicit fetches SHALL preserve the existing reset behavior so callers that
   represent a new target query do not silently inherit stale view state.

### RFP-2 - Refresh and retry preservation

1. Toolbar manual refresh SHALL call the existing pod-loading path with `resetView: false` and
   SHALL preserve the current pod text filter and other view state.
2. Existing auto-refresh SHALL remain silent and SHALL preserve the current pod text filter and
   other view state without becoming an explicit query.
3. Error retries SHALL call the existing pod-loading path with `resetView: false` and SHALL preserve
   the current pod text filter and other view state.
4. Application log inventory refresh SHALL preserve the current unified Pods view state, including
   the pod text filter, while refreshing the inventory it owns.
5. Refresh and retry operations SHALL update data/loading/error state according to their existing
   behavior without clearing or reinitializing unrelated view state.

### RFP-3 - Store and UI state behavior

1. When `resetView` is false, `loadPods` SHALL preserve the current filter and all existing view
   state covered by the store, including selected/expanded/detail state where applicable.
2. When `resetView` is true, `loadPods` SHALL apply the existing explicit-fetch reset semantics;
   the implementation SHALL not introduce a second, divergent reset mechanism.
3. The unified Pods view SHALL continue to render filtered results consistently after manual refresh,
   auto-refresh, retry, and application log inventory refresh.
4. A refresh or retry SHALL not emit the explicit-query signal used by the target selector or
   launchpad flow.
5. Empty filters, failed loads, loading transitions, and a subsequent explicit fetch SHALL remain
   well-defined and SHALL not leave stale reset or explicit-query flags behind.

### RFP-4 - Read-only and non-regression boundaries

1. This feature SHALL modify only frontend state/action routing and related tests or types needed to
   express the contract.
2. No Kubernetes mutation, watch, persistence, credential handling, backend API contract change,
   log streaming protocol change, or application-log data mutation SHALL be added.
3. Existing pod loading, filtering, sorting, selection, details, retry, and silent auto-refresh
   behavior SHALL remain intact except for the requested preservation of view state.
4. The application log inventory refresh SHALL not reset or replace the unified Pods view and SHALL
   not alter the meaning of an explicit `Fetch pods` action.
5. Existing tests and type contracts outside this behavior SHALL continue to pass.

### RFP-5 - Focused verification

1. Frontend tests SHALL cover explicit fetch reset behavior and the preservation behavior for toolbar
   refresh, auto-refresh, error retry, and application log inventory refresh.
2. Tests SHALL verify that only explicit fetch signals a new explicit query and that `resetView` is
   forwarded or defaulted correctly at the store boundary.
3. Frontend typecheck SHALL pass, and touched-file diagnostics SHALL report no errors.
4. Validation SHALL record the known frontend test result of 110/110, frontend typecheck success,
   and no errors in touched-file diagnostics.

## Definition of done

- `loadPods` exposes `resetView?: boolean` with explicit fetches resetting the view by default and
  refresh/retry/inventory paths preserving view state when false.
- Manual toolbar refresh, auto-refresh, error retries, and application log inventory refresh retain
  the current pod filter and other covered view state.
- Only the target selector/initial launchpad `Fetch pods` flow clears the view and signals a new
  explicit query.
- Read-only and non-regression boundaries are preserved, focused frontend verification is recorded,
  frontend tests pass 110/110, frontend typecheck passes, and touched-file diagnostics have no
  errors.
- No source outside the already implemented behavior, README, docs, historical specs, commit, or
  push is part of this specification.

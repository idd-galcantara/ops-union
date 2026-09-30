# Implementation Tasks - ops-union v1.7.0 preset multi-selection and bulk deletion

These tasks describe planned implementation and validation work. They are intentionally unchecked;
specification authoring does not implement the feature or provide implementation evidence.

## Ownership and sequencing

- `@ops-union-frontend` owns selection state, preset-library UI, confirmation routing, store contract,
  active-reference behavior, accessibility, and focused frontend tests.
- `@ops-union-integration-qa` owns web/desktop interaction, accessibility/focus, responsive,
  persistence-failure, and read-only boundary validation.
- `@ops-union-architecture-review` owns a read-only audit of selection scope, exact ids, active-state
  preservation, and no-query/Kubernetes boundaries.
- `@ops-union-backend` has no planned implementation task. A read-only contract check is allowed
  only if frontend review identifies an unexpected dependency; no backend change is in scope.
- `repository maintainer` owns later spec convergence and release administration only.

## Phase 1 - Selection contract and library controls

- [ ] 1.7.0-BS-1 Align preset selection with the Workspace listing.
  - Inventory the existing Workspace selection owner/helper and reuse its eligible-row scope, master
    checkbox, indeterminate state, clear-selection behavior, and stale-id reconciliation.
  - Add stable-id row checkboxes and ephemeral selection state to the preset library.
  - Keep selection changes free of preset application, query, persistence, and operational resets.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: none_
  - _Requirements: BS-1.1-BS-1.7_
  - _Validation: focused selection tests for empty/partial/all states, filtering, Workspace changes,
    reorder, stale ids, keyboard labels, and no store/query calls.

- [ ] 1.7.0-BS-2 Replace destructive library controls.
  - Remove `Delete all` from the preset library and accessible action set.
  - Add selected count, clear-selection, and selected-delete actions with disabled/empty behavior.
  - Preserve editor, import/export, search, apply, and Workspace-management entry points.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-1
  - _Requirements: BS-2.1-BS-2.2, BS-5.3-BS-5.5_
  - _Validation: component tests for zero/nonzero selection, action availability, and regression of
    neighboring library workflows.

## Phase 2 - Confirmation and atomic deletion

- [ ] 1.7.0-BS-3 Add selected-set confirmation using the existing modal pattern.
  - Show the selected count, names, target context, Active Workspace, and active-preset impact.
  - Preserve the library under the dialog and implement cancel, Escape, backdrop, focus, pending,
    and duplicate-submit behavior through the existing confirmation contract.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-2
  - _Requirements: BS-2.3-BS-2.7, BS-4.1-BS-4.6_
  - _Validation: focused dialog tests for copy, exact dismissal behavior, focus restoration, and
    pending interaction isolation.

- [ ] 1.7.0-BS-4 Add one validated atomic bulk-deletion store boundary.
  - Accept stable ids plus the expected Active Workspace, revalidate membership, and remove exactly
    the requested records once.
  - Keep persistence on the existing web/desktop boundary and preserve last-confirmed state on write
    failure; do not loop independent UI deletes or delete by position/name.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-3
  - _Requirements: BS-3.1-BS-3.7, BS-5.1-BS-5.5_
  - _Validation: store tests for exact ids, stale/missing records, active/inactive mixes, duplicate
    submit, failed persistence, and no apply/load/Kubernetes calls.

## Phase 3 - Active preset and operational-state regression

- [ ] 1.7.0-BS-5 Preserve live state when the active preset is deleted.
  - Clear or reconcile the saved active reference and dirty state when selected ids include the active
    preset.
  - Preserve targets, namespaces, pods, filters, logs, selected details, loading/errors, and query
    state; do not call the Workspace reset boundary.
  - Reconcile post-delete selection deterministically and expose outside/live-search status if the
    existing active-reference UI requires it.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-4
  - _Requirements: BS-3.3-BS-3.6, BS-5.2-BS-5.5_
  - _Validation: focused store/component tests with populated operational state and active/inactive
    deletion combinations.

- [ ] 1.7.0-BS-6 Run frontend regression and accessibility validation.
  - Verify `Delete all` is absent, selected deletion is confirmed once, and all existing preset and
    Workspace flows remain reachable.
  - Validate keyboard navigation, screen-reader names/status, focus containment/restoration, narrow
    layout, themes, long selected-name summaries, and safe errors.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-5
  - _Requirements: BS-2.1-BS-2.7, BS-4.1-BS-4.6, Definition of done_
  - _Validation: frontend tests, `npm run typecheck --workspace=frontend`, production build,
    touched-file diagnostics, and `git diff --check`.

## Phase 4 - Read-only and platform validation

- [ ] 1.7.0-BS-7 Audit ownership and read-only boundaries.
  - Confirm selection/deletion never invokes preset application, pod loading, backend routes,
    Kubernetes APIs, renderer filesystem access, or a second persistence path.
  - Confirm active-preset deletion preserves live state and the exact selected-id contract is used.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.7.0-BS-6
  - _Requirements: BS-3.1-BS-3.7, BS-5.1-BS-5.5_
  - _Validation: read-only code/contract audit with prioritized findings; no source mutation or
    Kubernetes action.

- [ ] 1.7.0-BS-8 Validate web and desktop workflows.
  - Exercise selection, select-all, clear-selection, filtered scopes, active/inactive deletion,
    cancellation, failure, pending states, and narrow/theme behavior in supported environments.
  - Record unavailable browser/Electron or persistence-failure scenarios honestly.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.7.0-BS-7
  - _Requirements: BS-1.1-BS-5.5_
  - _Validation: web/desktop smoke and accessibility scenarios, read-only boundary checks, and a
    written limitation record.

- [ ] 1.7.0-BS-9 Converge the specification with implementation evidence.
  - Update these three files only after implementation, focused tests, QA, and architecture review.
  - Preserve unchecked work, record commands/results and limitations, and keep source, package
    versions, release artifacts, commits, and tags outside this spec-authoring task.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.7.0-BS-8
  - _Requirements: Definition of done_
  - _Validation: spec consistency review and `git diff --check`.

## Definition of done

- The preset list follows the Workspace selection pattern with stable ids, select-all,
  indeterminate, clear-selection, and stale-id reconciliation.
- `Delete all` is removed and selected deletion uses one accessible custom confirmation.
- The exact selected records are deleted once through an atomic existing persistence boundary.
- Active-preset deletion clears/reconciles only the saved reference and preserves live operational
  state, including targets, pods, filters, logs, and query state.
- Cancellation, failure, pending, accessibility, responsive, web/desktop, and read-only evidence is
  recorded before tasks are marked complete.

## Validation record

No implementation or validation evidence is recorded yet. This section is reserved for the
implementation, QA, and architecture agents after the approved tasks are executed.

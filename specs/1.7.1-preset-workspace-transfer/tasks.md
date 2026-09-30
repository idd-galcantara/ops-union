# Implementation Tasks - ops-union v1.7.1 preset copy and move between Workspaces

These tasks describe planned implementation and validation work. They are intentionally unchecked;
specification authoring does not implement the feature or provide implementation evidence.

## Ownership and sequencing

- `@ops-union-frontend` owns source selection integration, destination chooser, pure transfer plan,
  confirmation, store commit routing, active-reference behavior, accessibility, and tests.
- `@ops-union-integration-qa` owns web/desktop transfer, atomicity/failure, accessibility,
  responsive, and read-only validation.
- `@ops-union-architecture-review` owns a read-only audit of transfer ownership, conflict policy,
  fresh metadata, active-reference reconciliation, and no-apply/Kubernetes boundaries.
- `@ops-union-backend` has no planned implementation task. A read-only contract check is allowed
  only if review identifies an unexpected dependency; no backend change is in scope.
- `repository maintainer` owns later spec convergence and release administration only.

## Phase 1 - Selection and destination planning

- [ ] 1.7.1-TR-1 Integrate transfer actions with the v1.7.0 stable-id selection.
  - Add explicit copy and move actions for a non-empty source selection from the Active Workspace.
  - Capture source Workspace identity and selected preset ids; disable actions for empty/stale
    selection and preserve all existing apply/edit/delete flows.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.0-BS-1, 1.7.0-BS-2_
  - _Requirements: TR-1.1-TR-1.6_
  - _Validation: focused component tests for empty/valid/stale selections, mode changes, and no
    catalog/apply/query calls.

- [ ] 1.7.1-TR-2 Build the multi-Workspace destination chooser.
  - List all other saved Workspaces with stable ids, counts, active/source context, and multi-select
    checkboxes; exclude the source Workspace.
  - Reconcile removed destinations and invalidate plans after relevant catalog/context changes.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-1
  - _Requirements: TR-1.3-TR-1.6, TR-5.3-TR-5.6_
  - _Validation: chooser tests for one/many destinations, source exclusion, removed Workspace,
    keyboard navigation, focus, and cancellation.

- [ ] 1.7.1-TR-3 Implement a pure transfer-plan and conflict validator.
  - Resolve stable source/destination ids, normalize portable fields, generate fresh destination ids
    and metadata, and calculate the complete record count before persistence.
  - Detect per-destination semantic duplicates, duplicate planned target sets, missing records, and
    concurrent changes; allow name-only collisions; block rather than partially skip/overwrite.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-2
  - _Requirements: TR-2.3-TR-2.4, TR-4.1-TR-4.7, TR-6.1-TR-6.5_
  - _Validation: pure helper tests for fresh ids, metadata omission, normalization, name-only
    collisions, semantic conflicts, source exclusion, and invalidation without store mutation.

## Phase 2 - Copy and move commits

- [ ] 1.7.1-TR-4 Implement atomic copy commit.
  - Revalidate the plan at submit, append independent destination records, retain the complete source,
    and persist one next catalog through the existing boundary.
  - Preserve source active reference and all operational state; never apply or query copied presets.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-3
  - _Requirements: TR-2.1-TR-2.6, TR-5.1-TR-5.5_
  - _Validation: store tests for one/many sources and destinations, fresh ids, source preservation,
    active copy, exact one commit, failed write, and no apply/load/Kubernetes calls.

- [ ] 1.7.1-TR-5 Implement atomic move commit.
  - Revalidate every source and destination, construct one next catalog containing all destination
    records and removing the selected source records, then persist it once.
  - Ensure a destination or write failure leaves both source and destinations unchanged; do not loop
    independent creates/deletes or expose an intermediate source-removed state.
  - Reconcile the active reference when the moved selection includes the active preset without
    clearing or reapplying live targets.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-3, 1.7.1-TR-4
  - _Requirements: TR-3.1-TR-6, TR-4.6-TR-4.7_
  - _Validation: store tests for active/inactive moves, multiple destinations, exact catalog result,
    atomic failure/rollback, concurrent invalidation, one commit, and no apply/load/Kubernetes calls.

- [ ] 1.7.1-TR-6 Add confirmation and pending/error presentation.
  - Show mode, source/destination context, selected names/counts, record count, conflict status, and
    move-specific source-removal/active-reference impact.
  - Implement existing dialog focus, Escape/backdrop, pending, duplicate-submit, safe-error, and
    source-list preservation behavior.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-4, 1.7.1-TR-5
  - _Requirements: TR-5.1-TR-5.6_
  - _Validation: component tests for copy/move confirmation, cancel paths, exact callbacks, pending
    blocking, failure copy, focus restoration, and responsive text.

## Phase 3 - Regression and boundary validation

- [ ] 1.7.1-TR-7 Validate active references and operational-state preservation.
  - Verify copied active presets remain active and moved active presets clear/reconcile the saved
    reference only.
  - Assert targets, namespaces, pods, filters, logs, selected details, loading/errors, and query
    state are identical before and after successful or failed transfer.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.7.1-TR-5, 1.7.1-TR-6
  - _Requirements: TR-2.5-TR-2.6, TR-3.4-TR-6, Definition of done_
  - _Validation: focused store/component regression tests with populated live state and active,
    inactive, mixed, cancelled, conflicted, and failed plans.

- [ ] 1.7.1-TR-8 Audit ownership, atomicity, and read-only boundaries.
  - Confirm one frontend/store owner, fresh destination ids/metadata, no partial move state, no
    overwrite/skip policy, no backend/Kubernetes/filesystem path, and no apply/query invocation.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.7.1-TR-7
  - _Requirements: TR-3.1-TR-6, Definition of done_
  - _Validation: read-only code/contract audit with prioritized findings; no source mutation or
    Kubernetes action.

- [ ] 1.7.1-TR-9 Validate web and desktop transfer workflows.
  - Exercise copy and move with multiple presets/destinations, semantic conflicts, name-only
    collisions, active preset, cancellation, persistence failure, concurrent invalidation, focus,
    narrow layout, and both themes.
  - Confirm the source is retained for copy, removed only in a successful atomic move, and no query or
    Kubernetes operation occurs. Record environment limitations.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.7.1-TR-8
  - _Requirements: TR-1.1-TR-6.5_
  - _Validation: web/desktop smoke, accessibility, persistence-failure, atomicity, and read-only
    scenarios with a written limitation record.

- [ ] 1.7.1-TR-10 Converge the specification with implementation evidence.
  - Update these three files only after implementation, focused tests, QA, and architecture review.
  - Preserve unchecked history, record commands/results and limitations, and keep source, package
    versions, release artifacts, commits, and tags outside this spec-authoring task.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.7.1-TR-9
  - _Requirements: Definition of done_
  - _Validation: spec consistency review and `git diff --check`.

## Definition of done

- Multiple selected presets can be copied or moved to multiple other Workspaces through an explicit
  destination chooser, transfer plan, and confirmation.
- Copy retains source records; move commits all destination creation and source removal atomically,
  with no partial success on conflict or failure.
- Destination records have fresh ids/local metadata and preserve only portable preset meaning.
- Semantic conflicts block the complete operation, name-only collisions are allowed, and no
  overwrite, automatic rename, or per-record skip occurs.
- Active copy/move, live-state preservation, no-apply/no-Kubernetes, accessibility, responsive,
  failure, and platform-boundary evidence is recorded before completion.

## Validation record

No implementation or validation evidence is recorded yet. This section is reserved for the
implementation, QA, and architecture agents after the approved tasks are executed.

# Implementation Tasks - ops-union v1.6.3 destructive action confirmations

These tasks describe planned implementation and validation work. They are intentionally unchecked:
this specification authoring does not implement the feature or provide implementation evidence.

## Ownership and sequencing

- `@ops-union-frontend` owns confirmation state, dialog UI, operation-specific context, focus and
  dismissal behavior, frontend tests, and verification that `Clear/reset` remains immediate in this
  release.
- `@ops-union-integration-qa` owns web/desktop interaction validation, accessibility/focus checks,
  persistence-failure scenarios, responsive checks, and read-only boundary validation.
- `@ops-union-architecture-review` owns a read-only audit of persisted-versus-transient deletion
  routing, state ownership, exact bulk id sets, and preservation of existing store semantics.
- `@ops-union-backend` has no planned implementation task. It may perform only a read-only boundary
  check if frontend review identifies an unexpected backend dependency; no backend change is in
  scope.
- `repository maintainer` owns later spec convergence and release administration only. It must not
  mark implementation tasks complete without repository evidence.

## Phase 1 - Confirmation contract and state routing

- [ ] 1.6.3-DC-1 Inventory and route every persisted deletion through one custom confirmation contract.
  - Identify the existing preset and Workspace delete triggers and their store operations.
  - Add or reuse a frontend confirmation primitive with semantic dialog, accessible actions, focus,
    Escape/backdrop dismissal, pending state, and parent-surface layering.
  - Replace all persisted-deletion `window.confirm` calls and prevent immediate individual preset
    deletion.
  - Keep `deletePreset`, `clearPresets`, `deleteWorkspace`, and `deleteWorkspaces` as the only
    existing operation owners; do not introduce a second persistence path.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: none_
  - _Requirements: DC-1.1-DC-1.6, DC-9.1-DC-9.5_
  - _Validation: focused component/state tests; `window.confirm` search; frontend typecheck.

- [ ] 1.6.3-DC-2 Preserve primary list/manager mounting and dismissal isolation.
  - Keep the preset library or Workspace manager rendered under its confirmation.
  - Ensure cancel, Escape, and backdrop close only the confirmation and preserve search, selection,
    visible rows, active Workspace, and operational state.
  - Block pointer and keyboard interaction from reaching the underlying surface while the dialog is
    open, and restore focus to the initiating control when possible.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1_
  - _Requirements: DC-1.5, DC-2.6, DC-3.6, DC-4.7, DC-5.4, DC-8.1-DC-8.8_
  - _Validation: keyboard/pointer tests for button cancel, Escape, backdrop, focus containment, and
    focus restoration with the library and manager visibly mounted.

## Phase 2 - Preset deletion variants

- [ ] 1.6.3-DC-3 Add individual preset deletion confirmation with context and impact.
  - Open confirmation from the preset row without deleting immediately.
  - Show stable preset name, target context, Active Workspace context, and operational-state impact.
  - Confirm through `deletePreset(id)` exactly once; handle active-reference reconciliation and a
    missing id without deleting another row.
  - Preserve library search/list state on cancellation and after the store-backed result.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-2_
  - _Requirements: DC-2.1-DC-2.7_
  - _Validation: focused preset-library tests for inactive/active preset, missing id, exact callback,
    context copy, and all dismissal paths.

- [ ] 1.6.3-DC-4 Converge `Delete all presets` on the shared contract.
  - Preserve the existing action and custom dialog while aligning semantic attributes, focus,
    pending behavior, context, and safe failure handling with the other variants.
  - Confirm through `clearPresets()` exactly once and keep the library mounted underneath.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-2_
  - _Requirements: DC-5.1-DC-5.5_
  - _Validation: focused dialog tests with zero/nonzero applicable states, count copy, cancel/Escape/
    backdrop, exact callback, and duplicate-submit prevention.

## Phase 3 - Workspace deletion variants

- [ ] 1.6.3-DC-5 Add individual Workspace deletion confirmation.
  - Replace the native prompt with a custom dialog showing Workspace name, preset count, active
    status, fallback behavior, and preserved live operational state.
  - Keep the last-Workspace guard before mutation and call `deleteWorkspace(id)` once after confirm.
  - Keep the manager mounted and preserve search/selection context on dismissal.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-2_
  - _Requirements: DC-3.1-DC-3.6, DC-9.2-DC-9.4_
  - _Validation: component/store integration tests for active, inactive, populated, empty, last,
    cancelled, and failed deletion scenarios.

- [ ] 1.6.3-DC-6 Add selected Workspace deletion confirmation.
  - Open one dialog for the selected stable Workspace ids, showing selected names/count and aggregate
    preset impact.
  - Reject an all-Workspace selection before mutation with the existing last-Workspace feedback.
  - Confirm through `deleteWorkspaces(ids)` once with the exact intended id set; do not loop individual
    deletions.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-2, 1.6.3-DC-5_
  - _Requirements: DC-4.1-DC-4.3, DC-4.5-DC-7, DC-9.2-DC-9.4_
  - _Validation: focused bulk tests for active/inactive selections, exact ids, names/counts, invalid
    all-selection, duplicate-submit, cancellation, and failed persistence.

- [ ] 1.6.3-DC-7 Add `Keep active only` confirmation.
  - Show the retained active Workspace, removed Workspace names/count, and aggregate preset impact.
  - Use the existing `deleteWorkspaces(nonActiveIds)` operation once after confirmation.
  - Leave the action unavailable when there are no non-active Workspaces and preserve the manager on
    dismissal.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-2, 1.6.3-DC-6_
  - _Requirements: DC-4.4-DC-4.7_
  - _Validation: focused tests for one/many non-active Workspaces, active retention, exact ids, cancel
    paths, and operational-state preservation.

## Phase 4 - Explicit non-scope and regression coverage

- [ ] 1.6.3-DC-8 Preserve immediate transient and draft removals.
  - Verify target-chip removal, selected namespace removal/clear, and unsaved preset-draft target
    removal do not open the persisted-deletion dialog.
  - Keep these actions immediate and preserve their current local/draft semantics.
  - Record and preserve the v1.6.3 decision that `Clear/reset` remains immediate and outside the
    mandatory confirmation scope; defer any confirmation design to a separately approved follow-up.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-1, 1.6.3-DC-3_
  - _Requirements: DC-6.1-DC-6.5, DC-7.1-DC-7.4_
  - _Validation: focused interaction tests proving no confirmation for target/namespace/draft removal;
    a documented test that `Clear/reset` remains immediate and separate._

- [ ] 1.6.3-DC-9 Add state, accessibility, and safe-error regression coverage.
  - Cover semantic dialog attributes, accessible title/description, initial focus, focus trap and
    restoration, visible focus, Escape/backdrop isolation, pending state, and long-context layout.
  - Cover no false success on failed deletion, safe local errors, existing active-reference and
    last-Workspace invariants, and no operation on cancellation.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.3-DC-3, 1.6.3-DC-4, 1.6.3-DC-5, 1.6.3-DC-6, 1.6.3-DC-7, 1.6.3-DC-8_
  - _Requirements: DC-8.1-DC-8.8, DC-9.1-DC-9.5, Definition of done_
  - _Validation: frontend tests, `npm run typecheck --workspace=frontend`, touched-file diagnostics,
    and `git diff --check`.

## Phase 5 - Web, desktop, architecture, and release validation

- [ ] 1.6.3-DC-10 Validate web and desktop confirmation workflows.
  - Exercise individual preset, `Delete all presets`, individual Workspace, selected Workspaces, and
    `Keep active only` in supported web and Electron desktop environments.
  - Verify keyboard-only and screen-reader-oriented semantics, focus restoration, Escape/backdrop
    isolation, narrow/high-zoom layout, pending states, and safe error feedback.
  - Verify persistence occurs only after confirmation and that current live operational state remains
    unchanged.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.6.3-DC-9_
  - _Requirements: DC-1.1-DC-1.6, DC-2.1-DC-5.5, DC-8.1-DC-8.8, DC-9.1-DC-9.5_
  - _Validation: web browser smoke/accessibility scenarios, Electron desktop smoke scenarios, and a
    written limitation record for unavailable environments.

- [ ] 1.6.3-DC-11 Audit ownership and read-only/persistence boundaries.
  - Confirm all persisted deletion triggers pass through the custom confirmation boundary and target,
    namespace, and draft removals do not.
  - Confirm exact bulk id sets, active-Workspace/active-preset invariants, no implicit preset
    application, no Kubernetes mutation, and no renderer filesystem access.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.6.3-DC-9, 1.6.3-DC-10_
  - _Requirements: DC-1.1-DC-1.6, DC-6.1-DC-7.4, DC-9.1-DC-9.5_
  - _Validation: read-only code/contract audit with prioritized findings; no source mutation or
    Kubernetes action.

- [ ] 1.6.3-DC-12 Converge the specification with implementation evidence.
  - Update the three v1.6.3 spec files only after implementation, focused tests, web/desktop checks,
    and the architecture audit produce evidence.
  - Preserve unchecked work and record actual commands, results, environment limitations, the
    `Clear/reset` decision, and approved deviations.
  - Keep source code, historical specs, package versions, release artifacts, commits, and tags
    outside this specification-authoring task unless separately approved.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.6.3-DC-10, 1.6.3-DC-11_
  - _Requirements: Definition of done_
  - _Validation: spec consistency review and `git diff --check` for spec-only convergence.

## Definition of done

- Every persisted deletion in the approved scope uses a custom semantic confirmation and no native
  confirmation remains on those paths.
- Preset, Workspace, selected-Workspace, `Keep active only`, and `Delete all presets` confirmations
  show accurate context and impact and invoke their existing store operation exactly once.
- The initiating library or Workspace manager stays mounted; cancel, Escape, and backdrop affect only
  the confirmation and restore focus safely.
- Target/namespace chip removal and draft target removal remain immediate; the `Clear/reset` policy is
  explicit and separately tested if changed.
- Frontend automated coverage, web validation, desktop validation, accessibility/focus checks,
  persistence-failure checks, and read-only architecture audit are recorded.
- No backend route, Kubernetes mutation, renderer filesystem access, persistence schema change, or
  unrelated UI redesign is introduced.

## Validation record

No implementation or validation evidence is recorded yet. This section is reserved for the
implementation and QA agents after the approved tasks are executed.

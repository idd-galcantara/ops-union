# Implementation Tasks - ops-union v1.8.0 Workspace and preset flow corrections

These tasks define four focused frontend/store corrections. They do not authorize backend changes,
API or WebSocket changes, Kubernetes mutation, credential collection, dependency upgrades, package
versioning, packaging, release, commit, or push. Completed history SHALL be preserved and evidence
SHALL be added only after execution.

## Ownership and sequencing

- `@ops-union-frontend` owns modal composition, Save as new placement, import draft/focus,
  store transition integration, feedback lifecycle, and frontend tests.
- `@ops-union-architecture-review` owns a read-only ownership, contract, stale-response, and
  platform-boundary review.
- `@ops-union-integration-qa` owns available web/desktop smoke, accessibility, responsive/theme,
  regression, and read-only validation.
- `@ops-union-backend` has no implementation task. A read-only dependency check is allowed only if
  review identifies an unexpected backend boundary; no backend change is in scope.
- `repository maintainer` owns specification convergence and release administration only.

## Phase 1 - Baseline and Save as new flow

- [ ] 1.8.0-WPF-1 Record the existing Preset/Workspace flow boundaries.
  - Identify the current Save as new trigger/modal, import modal and final-name input, Workspace
    import/select store action, operational reset/query revision helpers, feedback state, and focused
    tests. Record existing worktree changes without reverting them.
  - Capture the current observable modal structure, command placement, focus behavior, catalog action
    calls, import selection transition, pod state, and feedback lifecycle before implementation.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Requirements: WPF-1.1-WPF-1.5, WPF-2.1-WPF-2.5, WPF-3.1-WPF-3.6, WPF-4.1-WPF-4.5,
    WPF-5.1-WPF-6.5
  - _Validation: targeted source/import inventory, existing focused tests, and a baseline record in
    this task file. No source or Kubernetes mutation is permitted for the baseline.
  - _Definition of done: each correction has a named owner, state boundary, and discriminating test.

- [ ] 1.8.0-WPF-2 Standardize Save as new modal composition and command placement.
  - Move or route Save as new into the existing preset command area outside the row below search.
  - Reuse the established save/edit modal shell, field/action geometry, validation/status region,
    focus behavior, and pending duplicate-submit convention.
  - Preserve distinct-record creation, source-record preservation, no-apply/no-query behavior, and
    operational-state preservation on open, cancel, validation failure, and success.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.0-WPF-1
  - _Requirements: WPF-1.1-WPF-1.5, WPF-5.1-WPF-5.4, WPF-6.1-WPF-6.5
  - _Validation: focused component/store tests for command placement, stable modal structure across
    draft/validation updates, cancel/failure/success, exact catalog action, and no apply/load/Kubernetes
    calls; frontend typecheck for the touched slice.
  - _Definition of done: Save as new has one established modal owner and no search-row layout shift.

## Phase 2 - Import editing and feedback lifecycle

- [ ] 1.8.0-WPF-3 Preserve final Workspace name value and focus while typing.
  - Keep one authoritative controlled final-name value for the mounted import modal and prevent
    keystroke-driven remounts or key changes that replace the input node.
  - Ensure submit reads the latest value, validation preserves the draft, and accessible label,
    error association, visible focus, and existing focus restoration remain intact.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.0-WPF-1
  - _Requirements: WPF-2.1-WPF-2.5, WPF-5.1-WPF-5.4
  - _Validation: component/DOM tests that type, delete, replace, and submit names while asserting
    value order, input identity, `document.activeElement`, selection where supported, validation
    retention, keyboard navigation, and narrow-width wrapping.
  - _Definition of done: continuous keyboard editing does not lose focus, value, or the current
    validation context.

- [ ] 1.8.0-WPF-4 Make import feedback transient and flow-scoped.
  - Clear success, pending presentation, and stale flow-local messages at close, cancel, Escape,
    backdrop dismissal, and the existing settled completion boundary without hiding an actionable
    error prematurely.
  - Ensure a fresh modal opens clean and failed/cancelled operations cannot display false success.
  - Keep feedback out of Workspace/preset serialization and existing persistence/API contracts.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.0-WPF-3
  - _Requirements: WPF-4.1-WPF-4.5, WPF-5.1-WPF-5.4, WPF-6.3-WPF-6.5
  - _Validation: component/store tests for success-close, settled success, failure, cancel, Escape,
    backdrop, pending duplicate submit, reopen, and persistence failure; assert that
    `Workspace imported and selected.` is absent after close and on the next open.
  - _Definition of done: feedback belongs only to the current import flow and is cleared at its
    documented boundary.

## Phase 3 - Imported Workspace operational reconciliation

- [ ] 1.8.0-WPF-5 Reset stale operational state when selecting an imported Workspace without an
      active preset.
  - Route import selection through the existing store/query transition owner rather than clearing
    pods independently in the component.
  - For a no-active-preset Workspace, clear prior pod results, selected pod/details, and dependent
    operational state required by the existing reset contract, then advance/invalidate the existing
    query/configuration revision guard.
  - Preserve catalog failure/cancel behavior, active-preset semantics, no implicit apply, and no
    extra pod query used only to empty the view.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.0-WPF-1, 1.8.0-WPF-4
  - _Requirements: WPF-3.1-WPF-3.6, WPF-5.4-WPF-6.5
  - _Validation: focused store/component tests with populated prior pods and selected details for
    no-active-preset import/select; assert empty pods, cleared dependent selections, revision/request
    invalidation, stale-response rejection, preserved catalog on failure/cancel, and no apply/load/
    Kubernetes call. Run the touched frontend typecheck.
  - _Definition of done: one store transition owns selection/reset ordering and old query results
    cannot reappear after the new Workspace is selected.

## Phase 4 - Regression, accessibility, and boundary review

- [ ] 1.8.0-WPF-6 Run focused end-to-end frontend regression scenarios.
  - Exercise Save as new open/edit/validate/cancel/confirm, import name editing, import/select with
    and without an active preset, populated prior pods, stale in-flight response, failure, cancel,
    close, Escape, backdrop, repeated open, and pending duplicate actions.
  - Check modal layout stability, command wrapping, visible focus, focus containment/restoration,
    semantic labels/status, keyboard-only operation, light/dark themes, narrow widths, and zoom.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.8.0-WPF-2, 1.8.0-WPF-3, 1.8.0-WPF-4, 1.8.0-WPF-5
  - _Requirements: WPF-1.1-WPF-5.5
  - _Validation: available web/desktop smoke and accessibility scenarios; record unavailable
    environment checks and residual risks instead of implying they passed.
  - _Definition of done: user-visible layout, focus, reset, feedback, and regression behavior has
    explicit pass/fail/unavailable evidence.

- [ ] 1.8.0-WPF-7 Audit ownership and read-only platform boundaries.
  - Confirm one owner for modal draft/focus, catalog import, operational reset, stale-response guards,
    and transient feedback; confirm no duplicate store or modal state is introduced.
  - Confirm no backend route, REST/WebSocket change, renderer filesystem access, credential exposure,
    Kubernetes mutation, implicit apply, or unintended pod query was added.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Dependencies: 1.8.0-WPF-5, 1.8.0-WPF-6
  - _Requirements: WPF-3.3-WPF-3.5, WPF-4.1-WPF-4.5, WPF-6.1-WPF-6.5
  - _Validation: read-only source/import/contract audit, no cluster action, and a prioritized
    finding record if a boundary differs from this design.
  - _Definition of done: ownership and platform constraints are verified without source mutation.

- [ ] 1.8.0-WPF-8 Run automated validation and converge this specification.
  - Run focused tests after any repair, relevant frontend tests, frontend typecheck/build, available
    accessibility/regression checks, and `git diff --check`.
  - Update this file only with actual commands/results after implementation and validation. Preserve
    unchecked task history and record unavailable checks, residual risks, and unrelated pre-existing
    failures explicitly.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.8.0-WPF-7
  - _Requirements: WPF-1-WPF-6, Definition of done
  - _Validation: focused frontend tests, relevant full frontend suite, frontend typecheck/build,
    `git diff --check`, and final consistency review. Backend/Kubernetes validation is not required
    unless the implementation introduces an unexpected dependency.
  - _Definition of done: all completion claims have execution evidence and only approved spec/source
    changes are present.

## Definition of done

- Save as new uses the established modal contract and a coherent preset command area outside the
  search-adjacent row, with stable layout and unchanged catalog/no-apply semantics.
- Import final-name editing preserves value, input identity, focus, selection, and accessible
  validation behavior through continuous typing and correction.
- Selecting an imported Workspace with no active preset clears prior pods/dependent operational state
  and invalidates stale responses without implicit apply or extra query behavior.
- Import success/pending/error feedback is flow-local, cleared on close/settled completion, and does
  not survive into a new modal or falsely report success.
- Focused tests, frontend typecheck/build, available accessibility/regression checks, and boundary
  review evidence are recorded; unavailable checks and residual risks are explicit.
- No backend/Kubernetes/API implementation, package version, release artifact, commit, or tag is part
  of this specification-authoring task.

## Validation record

No implementation or validation evidence exists yet. This section SHALL be appended during task
execution; proposed commands and acceptance criteria above are not evidence of completion.

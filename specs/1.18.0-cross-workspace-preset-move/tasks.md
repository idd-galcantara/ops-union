# Implementation Tasks - ops-union v1.18.0 cross-Workspace preset move

This is an implementation plan for the planned move feature. No task below is complete, and this
spec-authoring task does not claim implementation or validation evidence. The v1.17.0 copy behavior
remains the baseline for source selection, portable fields, conflict previews, and operational-state
preservation.

## Ownership and sequencing

- `@ops-union-frontend` owns move entry-point integration, inactive-source selection, multiple preset
  selection, pure planning, conflict handling, confirmation, atomic catalog routing, active-reference
  defense, accessibility, and frontend tests.
- `@ops-union-integration-qa` owns web/desktop persistence, atomicity/failure, accessibility,
  responsive, and read-only/no-Kubernetes validation.
- `@ops-union-architecture-review` owns a read-only audit of catalog ownership, stable-id
  revalidation, source-removal atomicity, active-reference invariants, and no-apply/no-Kubernetes
  boundaries.
- `@ops-union-backend` has no implementation task. No backend, REST/WebSocket, or Kubernetes change
  is authorized.
- `repository maintainer` owns later specification convergence and release administration only; no
  package/version change, commit, tag, or push is implied.

## Phase 1 - Source selection and move planning

- [x] 1.18.0-MV-1 Add the move entry point and capture the Active Workspace destination.
  - Add an explicit move action to the existing preset library without changing single-Workspace
    apply, edit, delete, import/export, or Workspace-switch behavior.
  - Capture `activeWorkspaceId` at flow start and keep it active throughout the flow.
  - _Copilot agent: @ops-union-frontend_
  - _Requirements: MV-BASE.1-MV-BASE.6, MV-001.1-MV-001.8_
  - _Validation: focused component/store tests for destination capture, no Workspace switch, empty
    selection, cancellation, and no catalog/apply/query/Kubernetes calls.

- [x] 1.18.0-MV-2 Build the inactive source Workspace and multi-preset selector.
  - List only saved Workspaces other than the captured destination, show stable ids/names/counts, and
    allow exactly one source.
  - Back the multi-select list with stable source preset ids and reconcile missing Workspaces or
    presets without same-name fallback.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.18.0-MV-1_
  - _Requirements: MV-001.3-MV-001.8, MV-005.2-MV-005.6_
  - _Validation: chooser tests for source exclusion, inactive-source enforcement, zero/one/many
    presets, stable-id behavior, keyboard navigation, focus restoration, and cancellation.

- [x] 1.18.0-MV-3 Implement the pure move-plan and conflict validator.
  - Resolve source/destination snapshots by stable id, extract portable fields, track catalog
    revisions, and generate fresh destination ids only at a valid plan/commit boundary.
  - Detect existing and planned semantic conflicts, preserve name-only collisions as distinct, and
    return create/overwrite/skip/source-removal counts without mutating the store.
  - Implement deterministic Reject, Ignore, and Overwrite planning, including conflict-only Ignore
    no-op behavior and source retention for skipped entries.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.18.0-MV-2_
  - _Requirements: MV-002.1-MV-002.5, MV-003.1-MV-003.8, MV-004.2, MV-BASE.2_
  - _Validation: pure helper tests for normalization, fresh ids, metadata omission, source-id
    non-reuse, missing/stale ids, active-reference defense, semantic/planned conflicts, name-only
    collisions, all strategies, and no store mutation.

## Phase 2 - Review, confirmation, and atomic catalog commit

- [x] 1.18.0-MV-4 Add the move preview and destructive confirmation.
  - Show source/destination, selected presets, create/overwrite/skip counts, source-removal impact,
    semantic conflicts, name-only collisions, and the selected conflict strategy.
  - Make Reject unavailable while unresolved semantic conflicts remain; make conflict-only Ignore a
    visible zero-record no-op rather than a false success.
  - Preserve existing modal layering, Escape/backdrop, focus, wrapping, pending, duplicate-submit,
    and safe-error conventions.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.18.0-MV-3_
  - _Requirements: MV-003.1-MV-003.8, MV-005.1-MV-005.6_
  - _Validation: component tests for preview accuracy, strategy selection, cancellation, confirmation
    impact text, pending blocking, error feedback, focus restoration, and responsive text.

- [x] 1.18.0-MV-5 Implement the one-commit move catalog action.
  - Revalidate source/destination roles, stable selected ids, catalog revisions, target ownership, and
    active-reference ownership immediately before submit.
  - Construct one next catalog with effective destination creates/replacements and eligible source
    removals, then persist through the existing catalog boundary exactly once.
  - Never loop independent creates/deletes or expose a source-removed intermediate state. Preserve
    source records for skipped Ignore entries and preserve destination identity for active overwrite
    safety.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.18.0-MV-3, 1.18.0-MV-4_
  - _Requirements: MV-002.5-MV-002.10, MV-003.5-MV-003.8, MV-004.1-MV-004.6_
  - _Validation: store tests for one/many presets, fresh destination ids/metadata, exact one commit,
    source removal, Ignore/Overwrite/Reject, name-only collisions, conflict-only no-op, stale-plan
    invalidation, active-reference rejection, failed persistence, atomic no-partial-state, and no
    apply/load/query/Kubernetes calls.

- [x] 1.18.0-MV-6 Preserve active and operational state across all move outcomes.
  - Verify `activeWorkspaceId`, `activePresetId`, `activePresetDirty`, targets, namespaces, pods,
    filters, logs, selected details, loading/errors, refresh state, and query state/revisions remain
    unchanged on success, cancellation, invalidation, and failure.
  - Verify an active destination semantic overwrite retains destination id and active reference
    without applying or recomputing the moved preset; reject any abnormal active-source reference.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.18.0-MV-5_
  - _Requirements: MV-004.1-MV-004.6, MV-BASE.3-MV-BASE.5_
  - _Validation: focused store/component regressions with populated live state, active destination,
    overwrite, Ignore, cancel, stale, and failed plans.

## Phase 3 - Boundary and regression validation

- [ ] 1.18.0-MV-7 Validate web and desktop persistence and failure atomicity.
  - Exercise inactive-source moves with multiple presets, semantic conflicts, planned duplicates,
    name-only collisions, Ignore/Overwrite/Reject, cancellation, concurrent invalidation, failed
    persistence, and reload behavior where available.
  - Confirm destination creation/replacement and source removal appear together after success, while
    both Workspaces remain unchanged after validation or write failure.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.18.0-MV-6_
  - _Requirements: MV-002.6-MV-002.10, MV-003.5-MV-003.8, MV-005.1-MV-005.6_
  - _Validation: focused web/desktop persistence, failure-injection, atomicity, accessibility,
    responsive, both-theme, and no-apply/no-query/no-Kubernetes scenarios with limitations recorded.

- [ ] 1.18.0-MV-8 Audit ownership, identity, active-reference, and read-only boundaries.
  - Confirm one frontend/store catalog owner, stable-id revalidation, fresh destination identity,
    source-id non-reuse, one persisted commit, no partial state, explicit conflict policy, active
    reference preservation/rejection rule, and no backend/filesystem/Kubernetes/apply/query path.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.18.0-MV-7_
  - _Requirements: MV-BASE.1-MV-BASE.6, MV-002.5-MV-002.9, MV-004.1-MV-004.6, MV-005.4_
  - _Validation: read-only architecture and contract audit with prioritized findings; no source
    mutation or Kubernetes action.

- [x] 1.18.0-MV-9 Run focused frontend validation and converge the spec.
  - Run focused move/plan/store tests, the complete frontend suite, frontend typecheck, production
    build, and `git diff --check` as applicable after implementation.
  - Record commands, results, environment limitations, and any deferred UI/desktop evidence only
    after those checks exist. Preserve unchecked task history and do not claim implementation evidence
    in advance.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.18.0-MV-7, 1.18.0-MV-8_
  - _Requirements: Definition of done_
  - _Validation: executable checks plus requirements/design/tasks consistency review.

## Definition of done

- One inactive source Workspace can supply multiple selected presets to the Active Workspace through
  a reviewable, keyboard-usable move flow without changing Workspace context.
- Portable destination records use fresh local ids/metadata; source ids are used for source identity
  until successful removal and are never reused as destination ids.
- Semantic conflicts support explicit Reject, Ignore, and Overwrite outcomes, while name-only
  collisions remain separate and deterministic.
- Effective destination changes and source removals are persisted in one catalog commit; validation or
  persistence failure leaves both Workspaces in their last confirmed state.
- `activeWorkspaceId`, active preset reference/dirty state, targets, pods, filters, logs, and query
  state are preserved; inconsistent active-source references are rejected before commit.
- Focused frontend, integration, architecture, accessibility, responsive, failure, atomicity, and
  no-apply/no-Kubernetes validation is recorded before completion.
- No code, package/version, release artifact, commit, tag, or push is changed by this spec-authoring
  task.

## Validation record

- `npm test --workspace=frontend -- src/presetMove.test.ts src/store.test.ts`: passed, 161 tests.
- `npm test --workspace=frontend`: passed, 161 tests.
- `npm run typecheck --workspace=frontend`: passed.
- `npm run build --workspace=frontend`: passed; Vite production bundle generated.
- `git diff --check`: passed.
- `get_errors` on the move helper, store slice/types, selector, and focused tests: no errors.
- Store coverage verifies one persistence call, atomic source removal plus destination creation,
  Ignore source retention, Overwrite destination identity preservation, active/live-state
  preservation, and persistence-failure no-partial-state behavior.
- Integration QA for desktop IPC/reload, browser accessibility/responsive/theme checks, and the
  architecture-review handoff were not available in this session; those tasks remain unchecked.

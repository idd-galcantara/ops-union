# Implementation Tasks - ops-union v1.17.0 cross-Workspace preset copy

This implementation plan records the completed frontend work and the remaining boundary checks. The
later `Move` operation is not part of these tasks.

## Ownership and sequencing

- `@ops-union-frontend` owns source selection, copy planning, conflict handling, catalog commit
  routing, UI, accessibility, and frontend tests.
- `@ops-union-integration-qa` owns web/desktop persistence, failure, accessibility, responsive, and
  read-only validation.
- `@ops-union-architecture-review` owns a read-only audit of catalog ownership, active references,
  and no-apply/no-Kubernetes boundaries.
- `@ops-union-backend` has no implementation task. No backend or Kubernetes change is authorized.
- The repository maintainer owns specification convergence after implementation; no version bump,
  commit, tag, or release push is implied.

## Phase 1 - Source selection and planning

- [x] 1.17.0-CP-1 Add the cross-Workspace copy entry point.
  - Add an explicit action to the existing preset library without changing single-Workspace import,
    export, apply, edit, delete, or Workspace-switch behavior.
  - Capture the Active Workspace as the destination and keep it active throughout the flow.
  - _Copilot agent: @ops-union-frontend_
  - _Requirements: CP-BASE.1-CP-BASE.5, CP-001.1-CP-001.9_
  - _Validation: focused component tests for opening/cancelling the flow, destination capture, and
    no catalog/apply/query calls.

- [x] 1.17.0-CP-2 Build the source Workspace and preset selector.
  - List all other saved Workspaces with stable ids, names, and preset counts; exclude the captured
    destination.
  - Allow exactly one source Workspace and multiple source preset ids.
  - Reconcile removed Workspaces and presets without falling back to display-name matching.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.17.0-CP-1_
  - _Requirements: CP-001.3-CP-001.9, CP-005.1-CP-005.5_
  - _Validation: chooser tests for source exclusion, empty/valid selection, stable ids, keyboard
    navigation, focus restoration, and cancellation.

- [x] 1.17.0-CP-3 Implement the pure copy-plan and conflict validator.
  - Resolve source/destination snapshots, extract portable fields, detect stale plans, and report
    accepted entries and semantic/name conflicts without persistence.
  - Keep fresh destination id generation at the commit boundary or regenerate after final validation.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.17.0-CP-2_
  - _Requirements: CP-002.1-CP-002.5, CP-003.1-CP-003.9, CP-BASE.2-CP-BASE.4_
  - _Validation: pure helper tests for normalization, source identity, missing records, fresh local
    metadata, semantic duplicates, name-only collisions, and no store mutation.

## Phase 2 - Preview, confirmation, and catalog commit

- [x] 1.17.0-CP-4 Add preview and explicit conflict resolution.
  - Show source/destination Workspaces, selected names/counts, accepted count, conflict details, and
    the records that will be created.
  - Require `Ignore conflicts` or `Overwrite conflicts` when semantic conflicts exist; make a
    conflict-only no-op explicit.
  - Preserve the existing modal layering, Escape/backdrop, focus, wrapping, pending, and safe-error
    conventions.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.17.0-CP-3_
  - _Requirements: CP-003.2-CP-003.8, CP-004.1-CP-004.3, CP-005.1-CP-005.5_
  - _Validation: component tests for preview contents, conflict choices, cancellation, duplicate
    submission blocking, error feedback, and responsive text.

- [x] 1.17.0-CP-5 Implement the atomic copy catalog action.
  - Revalidate stable source/destination ids and selected source presets at submit time.
  - Construct one next catalog containing fresh destination records or explicit overwrites while
    leaving the source records unchanged.
  - Persist through the existing Workspace catalog boundary exactly once.
  - Preserve Active Workspace, active preset reference, targets, pods, filters, logs, and query state;
    never call apply, load, or Kubernetes paths.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.17.0-CP-3, 1.17.0-CP-4_
  - _Requirements: CP-002.2-CP-002.9, CP-004.2-CP-004.6_
  - _Validation: store tests for one/many presets, source preservation, fresh ids/metadata, ignore
    and overwrite, active-reference preservation, exact one commit, failed persistence, stale-plan
    invalidation, and no apply/load/Kubernetes calls.

## Phase 3 - Boundary and regression validation

- [ ] 1.17.0-CP-6 Verify operational-state and persistence regression behavior.
  - Exercise copy with populated targets, pods, filters, logs, selected details, loading/error state,
    an active destination preset, and both web and desktop persistence paths where available.
  - Confirm source and destination catalog behavior after reload and after cancellation/failure.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.17.0-CP-5_
  - _Requirements: CP-002.6-CP-002.9, CP-004.1-CP-004.6, Definition of done_
  - _Validation: focused integration/smoke scenarios with written environment limitations.

- [ ] 1.17.0-CP-7 Audit ownership and read-only boundaries.
  - Confirm one frontend/store catalog owner, no source deletion, fresh destination metadata, exact
    commit behavior, active-reference safety, no backend/Kubernetes/filesystem path, and no apply or
    query invocation.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.17.0-CP-6_
  - _Requirements: CP-BASE.1-CP-BASE.5, CP-004.3-CP-004.6, Definition of done_
  - _Validation: read-only architecture and contract audit with prioritized findings.

- [x] 1.17.0-CP-8 Run focused frontend validation and converge the spec.
  - Run the focused tests, complete frontend test suite, frontend typecheck, production build, and
    `git diff --check` as applicable to the implementation.
  - Record commands, results, limitations, and any deferred move behavior in this task file.
  - Update these three spec files only after implementation and validation evidence exists.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.17.0-CP-7_
  - _Requirements: Definition of done_
  - _Validation: spec consistency review and executable checks.

## Definition of done

- One other Workspace can be selected as the source and multiple presets can be copied into the
  Active Workspace through a reviewable confirmation flow.
- Source records remain unchanged; destination records use fresh local ids and metadata and preserve
  only portable preset meaning.
- Semantic conflicts and name collisions are reviewed explicitly before a single catalog commit.
- Cancel, failure, stale plans, active references, operational state, accessibility, responsive
  behavior, no-apply behavior, and no-Kubernetes behavior are validated.
- No move, source deletion, version bump, commit, tag, or release publication is included.

## Validation record

- `npm test --workspace=frontend -- src/presetCopy.test.ts src/store.test.ts`: passed.
- `npm test --workspace=frontend`: 155 passed, 0 failed.
- `npm run typecheck`: backend, frontend, and desktop passed.
- `npm run build`: backend, frontend, and desktop passed.
- `git diff --check`: passed.
- `get_errors` reported no errors in `presetCopy.ts`, `workspaceSlice.ts`, or `TargetSelector.tsx`.
- Store tests cover source preservation, active operational-state preservation, single persistence,
  failed persistence, and stale-plan validation. No backend, Kubernetes, apply, or query path was
  added.
- Manual browser/desktop persistence smoke testing and the separate architecture/integration QA
  review remain environment-level follow-ups; no move behavior was added.
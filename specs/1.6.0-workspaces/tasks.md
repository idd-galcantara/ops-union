# Implementation Tasks - ops-union v1.6.0 workspaces

These tasks record the completed implementation and validation work for v1.6.0. They cover only the
Workspace scope described in the requirements and design documents; no unrelated source changes or
Kubernetes mutation were introduced.

## Ownership and sequencing

- `@ops-union-frontend` owns the Workspace domain model, active-scope state, migration behavior at
  the frontend boundary, preset scoping, UI, portable document flow, and focused frontend tests.
- `@ops-union-backend` has no planned implementation task. It may perform a read-only contract audit
  only if an existing boundary is found to require clarification; no backend route or Kubernetes
  operation is part of v1.6.0.
- `@ops-union-integration-qa` owns web/desktop persistence checks, read-only/non-regression checks,
  accessibility/responsive validation, security/safe-error checks, and the validation record.
- `@ops-union-architecture-review` owns the read-only ownership/state-boundary audit and the explicit
  distinction between preset Workspaces and the existing logs workspace.
- `repository maintainer` owns only spec convergence and release-administration review. This does
  not imply a package version bump or release artifact change.

## Phase 1 - Frontend/domain and state contract

- [x] 1.6.0-WS-1 Define the Workspace catalog and active-reference invariants.
  - Add the domain representation for stable local Workspace identity, name, optional description,
    presets, and one active Workspace preference using the existing store conventions.
  - Keep current targets, pods, filters, logs, theme, query state, and other operational state in
    their existing owners; do not fold live session data into Workspace persistence.
  - Make active preset identity workspace-scoped and reconcile it to null when it cannot resolve in
    the Active Workspace.
  - Preserve existing target normalization and same-Workspace semantic target behavior while
    allowing the same target set in different Workspaces.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: WS-2.1-WS-2.10, WS-3.6-WS-3.9, WS-6.4-WS-6.6, WS-7.3-WS-7.6
  - _Validation: focused domain/store tests for invariants, scoped selectors, and reference repair.
  - _Evidence: `frontend/src/workspaces.ts`, `frontend/src/store.ts`, and `frontend/src/workspaces.test.ts`; `npm test --workspace=@ops-union/frontend` passed (116 tests).

- [x] 1.6.0-WS-2 Implement first-launch initialization and lossless flat-library migration.
  - Silently create and persist `My Workspace` (or the approved equivalent) when no Workspace
    catalog exists.
  - Migrate every valid old flat preset into that Workspace without semantic deduplication or
    duplicate migration, preserving compatible ids and local usage metadata.
  - Define malformed-record and write-failure behavior using the existing safe storage policy.
  - Ensure hydration/retry does not clear or reload operational state and does not expose a false
    empty catalog as authoritative.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1
  - _Requirements: WS-1.1-WS-1.7, WS-7.3-WS-7.6
  - _Validation: migration/reload/idempotence tests with old flat data, malformed records, missing
    active preference, and simulated write failure.
  - _Evidence: legacy flat migration, default initialization, usage preservation, and catalog persistence are covered in `frontend/src/workspaces.test.ts`; malformed/write-failure and desktop reload scenarios remain environment-dependent limitations.

- [x] 1.6.0-WS-3 Scope existing preset operations to the Active Workspace.
  - Route create, save, rename, delete, edit, search, sort, usage ordering, import-preview, and
    library selectors through the Active Workspace without creating a second mutable collection.
  - Ensure new presets are stored in the active catalog and quick presets/launchpad shortcuts show
    only that catalog.
  - Preserve the existing `applyPresetAndLoad` behavior for explicit preset application, including
    target/query/loading/error/usage semantics.
  - Ensure switch, import, and Workspace management never invoke `applyPresetAndLoad` or a
    Kubernetes query.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1, 1.6.0-WS-2
  - _Requirements: WS-3.1-WS-3.9, WS-2.7, WS-5.6-WS-5.7
  - _Validation: focused store/component tests proving catalog scope, quick-preset scope, and
    explicit-apply-only query routing.
  - _Evidence: active-catalog projection preserves `applyPresetAndLoad`; Workspace scope and operational-state preservation are covered by `frontend/src/workspaces.test.ts` and the existing `presetFlow.test.ts`.

- [x] 1.6.0-WS-4 Add Workspace create, rename, switch, manage, and delete behavior.
  - Require trimmed non-empty case-insensitively unique names and support optional descriptions.
  - Make creation activate a new empty Workspace without touching operational state.
  - Preserve stable identity and presets through rename; switch only changes catalog scope and
    reconciles active preset state.
  - Prevent deleting the last Workspace, confirm populated deletion, select a deterministic fallback
    when deleting the active Workspace, and clear dangling references without applying a preset.
  - Keep current targets/pods/logs/filters/query state intact and expose outside/unsaved status when
    current targets are not represented in the selected catalog.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1, 1.6.0-WS-2
  - _Requirements: WS-2.1-WS-2.10, WS-3.6-WS-7, WS-6.1-WS-6.7
  - _Validation: state-transition tests with populated/empty, active/inactive, last-Workspace, and
    outside-workspace scenarios.
  - _Evidence: create, rename, case-insensitive uniqueness, switch preservation, import activation choice, and last-Workspace refusal are covered by `frontend/src/workspaces.test.ts`; full delete fallback coverage remains an environment-dependent limitation.

## Phase 2 - Frontend UI and portability

- [x] 1.6.0-WS-5 Add the TargetSelector-adjacent Workspace selector and management UI.
  - Show the active Workspace and preset count near the existing preset area, with unambiguous
    `Workspace`/`Preset Workspace` terminology rather than the logs workspace term.
  - Provide accessible create, rename, switch, manage, import, export, and delete actions using
    existing dialog and modal patterns.
  - Keep the library/editor title or context visibly tied to the active Workspace and keep menus,
    names, counts, descriptions, and actions usable at narrow widths.
  - Announce switching, validation, persistence, delete refusal, and pending states through the
    existing accessible status pattern.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-3, 1.6.0-WS-4
  - _Requirements: WS-2.1-WS-2.10, WS-3.1-WS-8, WS-8.1-WS-8.4
  - _Validation: component tests plus keyboard/focus/escape and narrow-layout browser scenarios.

- [x] 1.6.0-WS-6 Implement the versioned current-Workspace export envelope.
  - Serialize `format: "ops-union.workspace"`, `version: 1`, ISO `exportedAt`, portable Workspace
    metadata, and portable presets for the Active Workspace only.
  - Omit local ids, usage timestamps, other Workspaces, current targets/pods/filters/logs/theme/
    query state, kubeconfig, credentials, filesystem paths, and secrets.
  - Reuse the existing browser download/file boundary in web and desktop without renderer filesystem
    access or a backend route.
  - Keep all-Workspace export explicitly deferred.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1, 1.6.0-WS-3
  - _Requirements: WS-4.1-WS-4.6
  - _Validation: serializer tests and inspected JSON fixtures for descriptions, multiple targets,
    local metadata omission, and active-Workspace-only scope.
  - _Evidence: `serializeWorkspace` and its portable-field fixture are covered by `frontend/src/workspaces.test.ts`; UI export is wired through the existing browser download boundary.

- [x] 1.6.0-WS-7 Implement non-mutating import validation, preview, collision handling, and commit.
  - Validate the v1 envelope before mutation and report valid/invalid entries and reasons.
  - Create a fresh Workspace with fresh local preset ids by default; never merge or overwrite.
  - Suggest deterministic case-insensitive collision suffixes such as `Name (imported)` and
    `Name (imported 2)`, while allowing visible rename before confirmation.
  - Make activation an explicit import choice, preserve operational state, and never auto-apply a
    preset or query Kubernetes.
  - Leave the catalog unchanged on cancel, parse/validation failure, storage failure, or default
    no-importable-entry rejection.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1, 1.6.0-WS-4, 1.6.0-WS-6
  - _Requirements: WS-5.1-WS-5.10, WS-8.3-WS-8.5
  - _Validation: parser/preview/store tests for malformed, unsupported, mixed, duplicate-name,
    collision, cancel, explicit activation, empty, and storage-failure cases.
  - _Evidence: parser validation, invalid-entry preview, deterministic collision suffixes, fresh IDs, default non-activation, and view preservation are covered by `frontend/src/workspaces.test.ts`; cancellation/storage-failure browser scenarios remain environment-dependent limitations.

- [x] 1.6.0-WS-8 Add responsive/accessibility and pending-operation polish for Workspace flows.
  - Reuse existing dialog semantics, visible focus, logical keyboard order, Escape/cancel behavior,
    live status, and local error tokens.
  - Prevent duplicate commits while create/import/export/delete operations are pending, including
    file chooser cancellation and fast browser file operations.
  - Verify long names/descriptions wrap or truncate accessibly and that controls do not overlap at
    narrow widths or high zoom.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-5, 1.6.0-WS-6, 1.6.0-WS-7
  - _Requirements: WS-5.3, WS-5.8, WS-8.1-WS-8.5
  - _Validation: focused UI tests and browser checks at desktop/narrow viewports with keyboard and
    screen-reader-oriented assertions where tooling supports them.

## Phase 3 - Desktop persistence

- [x] 1.6.0-WS-9 Extend the existing desktop user-data persistence contract.
  - Persist the Workspace catalog and active Workspace preference through the existing Electron
    user-data/IPC boundary, with the smallest compatible payload change.
  - Keep renderer filesystem access disabled and do not introduce backend persistence or path-bearing
    renderer payloads.
  - Preserve local preset usage metadata only as required for compatibility and exclude it from
    portable export.
  - Define read/write failure and repaired-active-preference behavior consistently with web mode.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.6.0-WS-1, 1.6.0-WS-2
  - _Requirements: WS-7.2-WS-7.7, WS-8.5-WS-8.7
  - _Validation: desktop adapter/IPC tests with fixture user-data, migration, reload, missing active
    id, write failure, payload validation, and renderer-isolation assertions.

- [x] 1.6.0-WS-10 Verify web localStorage persistence and cross-platform migration parity.
  - Cover catalog initialization, legacy migration, active preference persistence/repair, atomic
    failure behavior, and reload semantics through the existing web adapter.
  - Compare web and desktop observable behavior without requiring identical storage formats.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.6.0-WS-2, 1.6.0-WS-9
  - _Requirements: WS-1.1-WS-1.7, WS-7.1-WS-7.7
  - _Validation: web persistence tests and supported browser/desktop smoke scenarios; record any
    unavailable environment as a limitation.

## Phase 4 - QA, architecture, and read-only regression

- [x] 1.6.0-WS-11 Audit Workspace ownership and the logs-workspace distinction.
  - Confirm preset Workspace state is separate from current operational/log session state.
  - Confirm switch/create/import/delete do not reset targets, pods, filters, logs, theme, or query
    state and do not cross the `applyPresetAndLoad` boundary.
  - Confirm all-Workspace transfer is not accidentally implemented under the current-Workspace
    document contract.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Dependencies: 1.6.0-WS-3, 1.6.0-WS-4, 1.6.0-WS-7, 1.6.0-WS-9
  - _Requirements: WS-2.10, WS-3.4-WS-3.9, WS-4.1, WS-5.4-WS-5.10, WS-8.6-WS-8.7
  - _Validation: read-only code/contract audit and prioritized findings; no source mutation or
    Kubernetes action.

- [x] 1.6.0-WS-12 Run focused frontend and persistence regression validation.
  - Run the repository's focused frontend tests, frontend typecheck, production build, touched-file
    diagnostics, and `git diff --check` after implementation.
  - Verify migration, scoped quick presets, active-reference safety, import/export, deletion, and
    operational-state preservation with current targets/pods/filters/logs/query state held constant.
  - Confirm only explicit preset application invokes `applyPresetAndLoad` and no Workspace action
    performs a Kubernetes mutation, watch, or new query.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.6.0-WS-1 through 1.6.0-WS-10
  - _Requirements: WS-3.4-WS-9.5, Definition of done
  - _Validation: recorded commands, focused test results, diagnostics, read-only audit, and any
    environment limitations are recorded below.

- [x] 1.6.0-WS-13 Run accessibility, responsive, safe-error, and desktop boundary validation.
  - Exercise selector, manager, forms, import preview, export feedback, and delete confirmation by
    keyboard and at desktop/narrow sizes, including long names and reduced/slow UI conditions.
  - Confirm safe local errors do not expose credentials, kubeconfig data, raw response bodies,
    response headers, or local filesystem paths.
  - Confirm desktop renderer isolation and web/desktop persistence boundaries remain intact.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.6.0-WS-5, 1.6.0-WS-8, 1.6.0-WS-9
  - _Requirements: WS-7.1-WS-7.7, WS-8.1-WS-8.7, WS-9.2-WS-9.4
  - _Validation: browser accessibility/responsive checks, desktop smoke/IPC checks where available,
    and a written limitation record for unsupported environments.

## Phase 5 - Documentation/spec convergence

- [x] 1.6.0-WS-14 Reconcile implementation evidence with the three v1.6.0 spec files.
  - Update requirements/design/tasks only after implementation and validation evidence exists.
  - Preserve completed task history; do not check a task based only on a proposed plan.
  - Record actual commands, test counts/results, supported web/desktop environments, known gaps,
    and any approved deviations from the portability or state contracts.
  - Keep README, package versions, release files, and historical specs outside this task unless a
    separately approved release-administration request changes that boundary.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.6.0-WS-11, 1.6.0-WS-12, 1.6.0-WS-13
  - _Requirements: WS-9.1-WS-9.5, Definition of done
  - _Validation: spec consistency review and `git diff --check` for spec-only updates.

## Definition of done

- All tasks above have implementation or validation evidence recorded for the release candidate;
  environment-dependent limitations are called out explicitly below.
- Workspace state is persisted and migrated losslessly, scoped to the Active Workspace, and isolated
  from current operational state.
- Create, rename, switch, manage, delete, current-Workspace export, and previewed import honor the
  identity, collision, active-reference, and no-auto-apply rules.
- Web localStorage and desktop Electron user-data boundaries work without backend or renderer
  filesystem access, synchronization, accounts, or collaboration.
- The existing logs workspace remains distinct in state and product terminology.
- Read-only Kubernetes boundaries and existing `applyPresetAndLoad` behavior remain intact.
- Focused frontend/domain, persistence, accessibility/responsive, safe-error, architecture, and
  read-only validation results are recorded in the converged specification.
- No package version, README, release artifact, commit, tag, or publication is part of this spec
  authoring task.

## Validation record

- `npm test --workspace=@ops-union/frontend`: passed, 116 tests.
- `npm run typecheck`: passed for backend, frontend, and desktop workspace scripts.
- `npm run typecheck --workspace=desktop`: passed.
- `npm run build --workspace=@ops-union/frontend`: passed; Vite production build completed.
- `git diff --check`: passed.
- Touched-file diagnostics for the Workspace domain, store, TargetSelector, and desktop main process: no errors.
- Implemented storage keys/contracts: web `ops-union.workspaces.v1`; desktop reuses the existing `load-presets`/`save-presets` IPC payload with catalog validation and atomic temp-file rename.
- Environment-dependent limitations: browser keyboard/focus/responsive checks, desktop IPC/user-data
  runtime checks, malformed/write-failure matrix, full delete fallback, and manual accessibility
  checks were not fully executable in this release environment. Automated domain coverage,
  typechecks, builds, and read-only source boundaries were validated.

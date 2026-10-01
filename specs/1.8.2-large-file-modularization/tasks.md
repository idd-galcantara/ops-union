# Implementation Tasks - ops-union v1.8.2 large-file modularization

These tasks define a behavior-preserving refactor only. They do not authorize feature work, protocol
changes, dependency upgrades, Kubernetes mutation, secret collection, packaging, release, commit,
or push. Completed task history SHALL be preserved and evidence SHALL be added only after execution.

## Ownership and sequencing

- `@ops-union-architecture-review` owns the baseline and final structural/contract review.
- `@ops-union-frontend` owns renderer decomposition, frontend tests, CSS, accessibility, and UI
  regression validation.
- `@ops-union-backend` owns History decomposition and backend tests/build evidence.
- `@ops-union-integration-qa` owns web/desktop smoke, visual/accessibility/responsive checks,
  persistence/IPC scenarios, and read-only boundary validation.
- `repository maintainer` owns specification convergence and release administration only.

## Phase 0 - Baseline and characterization

- [ ] 1.8.2-MOD-1 Capture the architecture baseline and public contracts.
  - Inventory the seven assessed files, exports, consumers, imports, side effects, state transitions,
    persistence/transport boundaries, cleanup rules, and current focused tests.
  - Add or identify characterization cases before extraction for target selection, store resets and
    stale responses, Live/History transitions, history limits/cleanup, desktop IPC/persistence,
    App reset/theme/refresh, and CSS/theme/responsive output.
  - Record current file/module graph and any pre-existing worktree changes without reverting them.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Requirements: MOD-1.1-MOD-1.5, MOD-9.4
  - _Validation: source/import inventory, focused existing tests, frontend/backend/desktop typechecks,
    and a baseline report in this task record.
  - _Definition of done: every later task has an identified behavioral seam and compatibility check.

## Phase 1 - Pure contracts and backend history boundary

- [ ] 1.8.2-MOD-2 Extract shared renderer contracts and target/preset composition helpers.
  - Move only pure derivation, selection, reducer, and view-model logic that is currently embedded in
    TargetSelector, App, or LogViewer; preserve existing helpers and avoid a second store.
  - Define narrow props/callback contracts for context selection, namespace target construction,
    preset presentation, Workspace controls, log session state, and App log coordination.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-1
  - _Requirements: MOD-1.1-MOD-1.4, MOD-2.1-MOD-2.5, MOD-4.1-MOD-4.5, MOD-7.1-MOD-7.5
  - _Validation: pure helper tests, existing frontend tests, frontend typecheck, and no changed
    public exports from current import paths.
  - _Definition of done: extracted contracts compile independently and have no UI/process side effects.

- [ ] 1.8.2-MOD-3 Split history storage, bounded readers, queries, and session manager.
  - Extract private storage/writer and cleanup, index/record readers, query indexing/window reads,
    session lifecycle/source pump, and manager/TTL/orphan cleanup from `historySession.ts`.
  - Retain the `historySession.ts` facade and all exported types/classes/functions used by
    `logsWebSocket.ts` and existing tests.
  - Preserve file modes, limits, sanitized errors, generation/session identity, cancellation,
    expiration, terminal events, and cleanup idempotency.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Dependencies: 1.8.2-MOD-1
  - _Requirements: MOD-1.1-MOD-1.4, MOD-5.1-MOD-5.5
  - _Validation: `npm test --workspace=backend`, focused history/storage tests, backend typecheck,
    backend build, and permission/cleanup assertions without cluster mutation.
  - _Definition of done: history behavior is unchanged and the facade has no unrelated storage or
    protocol logic.

- [ ] 1.8.2-MOD-4 Split desktop persistence and IPC services from Main orchestration.
  - Extract preference/preset validation and atomic file operations, kubeconfig dialog/request/result
    mapping, runtime/window lifecycle, and IPC registration from `desktop/src/main.ts`.
  - Preserve all six channel names and payloads, user-data paths, loopback/internal-token boundary,
    BrowserWindow security settings, single-instance behavior, and shutdown ordering.
  - Add deterministic seams for validators, persistence failure, IPC result mapping, and backend
    startup/stop without requiring a live packaged app.
  - _Owner: @ops-union-frontend and @ops-union-integration-qa
  - _Copilot agents: @ops-union-frontend, @ops-union-integration-qa
  - _Dependencies: 1.8.2-MOD-1
  - _Requirements: MOD-1.1-MOD-1.5, MOD-6.1-MOD-6.5
  - _Validation: desktop typecheck/build, channel contract checks, persistence validator tests, and
    sanitized failure cases; no kubeconfig contents or credentials in evidence.
  - _Definition of done: `main.ts` is composition/lifecycle wiring and renderer capabilities are not
    widened.

## Phase 2 - Store and session coordinators

- [ ] 1.8.2-MOD-5 Decompose the Zustand store while retaining one store facade.
  - Extract typed state/action slices or action factories for kubeconfig/context, targets/namespaces,
    pod query/refresh/view, and Workspace/preset catalog/transfer behavior.
  - Keep request counters, configuration/target signatures, explicit-query revisions, reset helpers,
    active references, persistence boundaries, and one `useOpsFlowStore` instance.
  - Re-run characterization tests after each slice rather than changing all actions at once.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-2, 1.8.2-MOD-1
  - _Requirements: MOD-3.1-MOD-3.5, MOD-9.1-MOD-9.3
  - _Validation: `npm test --workspace=frontend` focused on `store.test.ts`, `workspaces.test.ts`,
    `presetTransfer.test.ts`, stale-response scenarios, frontend typecheck/build, and import-cycle
    review.
  - _Definition of done: all existing store consumers compile unchanged and no behavior seam changes.

- [ ] 1.8.2-MOD-6 Extract Live/History log session controllers and LogViewer presentation.
  - Move WebSocket/session effect ownership, event reduction, History windows/queries, search
    activation, transition/retry/cancel logic, and output/control rendering into focused modules.
  - Keep exactly one aggregate socket per mounted session, bounded caches/buffers, generation guards,
    stable keys, source error isolation, and current `LogViewer` props/export.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-2, 1.8.2-MOD-3, 1.8.2-MOD-5
  - _Requirements: MOD-4.1-MOD-4.5, MOD-9.1-MOD-9.3
  - _Validation: log session/history/search/presentation/range tests, focused Live->History->Live,
    cancel, retry, stale-event, repeated-search, and virtual-window scenarios; frontend typecheck/build.
  - _Definition of done: `LogViewer.tsx` composes controllers and presentational pieces without
    duplicate transport or changed terminal behavior.

## Phase 3 - UI composition and styling

- [ ] 1.8.2-MOD-7 Decompose TargetSelector and WorkspaceControls.
  - Extract context picker, namespace/target builder, preset library, Workspace manager, and related
    modal/pending presentation while keeping `TargetSelector` and `WorkspaceControls` facades.
  - Preserve configuration revision resets, namespace fallback, selection deduplication, apply/query
    routing, stable Workspace/preset ids, import/export/transfer, confirmation, focus, and resize.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-2, 1.8.2-MOD-5
  - _Requirements: MOD-2.1-MOD-2.5, MOD-3.2-MOD-3.4
  - _Validation: focused component/keyboard/focus tests, frontend full test suite/typecheck/build,
    and web smoke for target, preset, Workspace, import/export, and transfer workflows.
  - _Definition of done: current import paths work and no UI component owns catalog/query mutation
    outside the store/preset-flow boundary.

- [ ] 1.8.2-MOD-8 Decompose App shell coordination.
  - Extract theme persistence, health status, auto-refresh, pod/detail selection, log-source modal
    coordination, and derived pod-view state while retaining `App` as the composition root.
  - Preserve configuration/explicit-query reset ordering, log inventory refresh, selected details,
    source confirmation/close, health failure state, interval teardown, and theme readiness.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-5, 1.8.2-MOD-6, 1.8.2-MOD-7
  - _Requirements: MOD-7.1-MOD-7.5
  - _Validation: focused shell/coordinator tests plus launchpad, logs, pod presentation, store, and
    workspace regression tests; frontend typecheck/build and web smoke.
  - _Definition of done: `App` owns composition and cross-domain coordination only, with no second
    operational or log state store.

- [ ] 1.8.2-MOD-9 Split index.css into ordered layers without visual drift.
  - Move tokens/theme, shell/layout, target/sidebar, Workspace/preset, pod/details, logs/feedback,
    dialogs, and responsive/accessibility rules into focused stylesheets composed by `index.css`.
  - Preserve class hooks, selector order, design-system tokens, dark mode, focus-visible behavior,
    reduced-motion policy, wrapping, panel geometry, and responsive breakpoints.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.2-MOD-7, 1.8.2-MOD-8
  - _Requirements: MOD-8.1-MOD-8.5
  - _Validation: frontend build, CSS selector/token/order audit, browser screenshots at supported
    desktop/narrow widths and both themes, keyboard/focus checks, and `git diff --check`.
  - _Definition of done: `main.tsx` still imports `index.css` and no intentional visual change is
    introduced by file splitting.

## Phase 4 - Cross-cutting validation and convergence

- [ ] 1.8.2-MOD-10 Review dependency direction, contracts, and read-only boundaries.
  - Audit the final module graph, public facades, import cycles, duplicate state/socket ownership,
    persistence and IPC capabilities, history file safety, and absence of Kubernetes writes/routes.
  - Review changed behavior against the v1.4.0 findings and keep unrelated findings as follow-up
    work rather than silently fixing them here.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Dependencies: 1.8.2-MOD-3, 1.8.2-MOD-4, 1.8.2-MOD-5, 1.8.2-MOD-6, 1.8.2-MOD-7, 1.8.2-MOD-8, 1.8.2-MOD-9
  - _Requirements: MOD-1.2-MOD-1.5, MOD-3.3-MOD-3.5, MOD-5.2-MOD-5.5, MOD-6.2-MOD-6.5, MOD-9.1-MOD-9.3
  - _Validation: read-only source/import audit, contract matrix, typecheck/build evidence, and
    sanitized read-only operation inventory.
  - _Definition of done: ownership is unambiguous and no new privilege, transport, or persistence
    boundary exists.

- [ ] 1.8.2-MOD-11 Run web/desktop end-to-end and accessibility regression validation.
  - Exercise target selection, namespace fallback, pod query/refresh, Workspace/preset flows, log
    source selection, Live/History/search/cancel/retry/return-to-Live, theme, desktop hydration,
    kubeconfig selection/reset, persistence failure, close/shutdown, responsive layout, keyboard
    focus, and both themes.
  - Confirm no Kubernetes mutation, no secret exposure, no duplicate WebSocket session, no partial
    catalog write, and no history file permission/cleanup regression.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.8.2-MOD-10
  - _Requirements: MOD-2.2-MOD-2.5, MOD-4.2-MOD-4.4, MOD-5.3-MOD-5.5, MOD-6.2-MOD-6.5, MOD-7.2-MOD-7.4, MOD-8.2-MOD-8.5, MOD-9.4-MOD-9.5
  - _Validation: available browser/Electron smoke and accessibility scenarios; record unavailable
    cluster/package checks and residual risk without raw cluster output or credentials.
  - _Definition of done: user workflows and platform boundaries have explicit pass/fail/unavailable
    evidence.

- [ ] 1.8.2-MOD-12 Execute final automated validation and converge this specification.
  - Run focused tests after any QA repair, then the complete frontend/backend tests, all workspace
    typechecks, complete build, `git diff --check`, and a permitted-path review.
  - Update this file only with actual commands/results, preserve unchecked history, record limitations,
    and do not claim implementation or release evidence that is absent.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.8.2-MOD-10, 1.8.2-MOD-11
  - _Requirements: MOD-1-MOD-9, Definition of done
  - _Validation: `npm test --workspace=frontend`, `npm test --workspace=backend`, `npm run typecheck`,
    `npm run build`, `git diff --check`, and final spec consistency review.
  - _Definition of done: all completed claims have evidence, remaining limitations are explicit, and
    only approved source/spec changes are present.

## Definition of done

- The seven assessed large files are focused facades/composition roots with cohesive extracted
  modules and documented ownership.
- Existing public imports/contracts, UI behavior, log/history semantics, storage formats, desktop
  security, read-only boundaries, accessibility, responsive layout, and themes remain compatible.
- Focused and full automated validation, available web/desktop checks, and all unavailable checks are
  recorded with owners, dependencies, commands/scenarios, and residual risks.
- No unrelated architecture-audit finding is silently fixed; no new feature, protocol, dependency,
  Kubernetes mutation, secret exposure, commit, tag, or release artifact is part of this work.

## Validation record

No implementation or validation evidence exists yet. This section SHALL be appended during task
execution; proposed commands and acceptance criteria above are not evidence of completion.

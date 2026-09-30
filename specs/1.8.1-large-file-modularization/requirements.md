# Requirements - ops-union v1.8.0 large-file modularization

## Status and scope

Version 1.8.0 defines a behavior-preserving architecture refactor for the large, highly coupled
modules identified by the v1.4.0 architecture audit: `frontend/src/components/TargetSelector.tsx`,
`frontend/src/store.ts`, `frontend/src/components/LogViewer.tsx`, `backend/src/historySession.ts`,
`desktop/src/main.ts`, `frontend/src/App.tsx`, and `frontend/src/index.css`.

The work SHALL decompose responsibilities into cohesive modules, make ownership and dependency
direction explicit, preserve the existing public contracts, and add focused characterization and
regression coverage. It SHALL NOT introduce a product feature, alter the read-only Kubernetes
boundary, change log semantics, change persistence formats, change IPC channel names, or authorize
unrelated bug fixes.

This is an implementation specification. Its tasks are ordered so that the current behavior is
recorded before extraction and each subsequent slice can be verified independently. Implementation
agents SHALL preserve unrelated worktree changes and SHALL not mark a task complete without concrete
evidence in `tasks.md`.

## User stories

- As a maintainer, I can find target selection, workspace/catalog, log-session, history-storage,
  desktop-runtime, shell, and styling responsibilities in focused modules.
- As a frontend contributor, I can change one state or UI concern without importing the entire
  application shell or a monolithic component.
- As a backend contributor, I can test history capture, storage/index reads, queries, cleanup, and
  session management independently while retaining the existing protocol contract.
- As a desktop contributor, I can reason about lifecycle, persistence validation, kubeconfig IPC,
  and window security separately without changing the preload surface.
- As an operator, I experience the same target selection, workspace, live/history log, theme,
  persistence, read-only, accessibility, and failure behavior after the refactor.

## Glossary

- **Public facade:** The existing import/export surface retained while implementation moves into
  focused modules; examples include `TargetSelector`, `WorkspaceControls`, `LogViewer`,
  `useOpsFlowStore`, `HistorySessionManager`, and the existing IPC channel registrations.
- **Behavioral seam:** A state transition, transport message, persistence boundary, lifecycle
  cleanup rule, or rendered interaction whose behavior must remain unchanged.
- **Characterization test:** A test that records current observable behavior before code extraction;
  it is not permission to preserve an unsafe or explicitly out-of-scope defect.
- **Domain slice:** A cohesive module group with one owner and a one-way dependency relationship.

## Requirements

### MOD-1 - Baseline, scope, and compatibility

1. Before moving a responsibility, the implementation SHALL record its current exports, consumers,
   state transitions, side effects, cleanup rules, and focused test evidence.
2. Existing supported imports, component props, Zustand state/actions, backend history manager API,
   desktop IPC channel names/payload contracts, and CSS entrypoint behavior SHALL remain compatible;
   a thin re-export/facade MAY be used during migration.
3. The refactor SHALL not change user-visible behavior, serialized Workspace/preset formats, log
   wire messages, history limits, filesystem permission requirements, read-only Kubernetes calls,
   theme persistence keys, or desktop security settings.
4. New modules SHALL have one primary responsibility and SHALL depend inward on domain helpers or
   contracts rather than importing the application shell solely to reach state.
5. No task in this specification SHALL add a feature, dependency, backend route, Kubernetes write,
   persistence migration, IPC channel, or release artifact.

**Acceptance criteria:** A baseline report identifies the seven source files, their consumers and
behavioral seams; after each extraction the old entrypoint still serves its existing consumers and
focused tests show no unapproved observable change.

### MOD-2 - Target selector and workspace UI decomposition

1. `TargetSelector.tsx` SHALL separate target/context loading and selection, namespace discovery and
   target construction, preset-library presentation, and Workspace-controls presentation into
   cohesive modules with explicit props and callbacks.
2. The context/namespace modules SHALL retain configuration-revision resets, context reload and
   error/loading states, namespace fallback behavior, target deduplication, unavailable-cluster
   feedback, keyboard resizing, and the existing `loadPods` entry point.
3. Preset and Workspace UI modules SHALL retain stable-id selection, apply/save/edit/delete/import/
   export/transfer flows, pending and destructive confirmations, focus restoration, and the
   existing store action contracts.
4. `TargetSelector` and `WorkspaceControls` SHALL remain available from their current import path
   until all consumers migrate, and no component SHALL reach into another component's private state.
5. Extracted UI modules SHALL not add a second source of truth for contexts, targets, presets,
   Workspaces, or apply/query operations.

**Acceptance criteria:** Context/namespace interactions, preset and Workspace workflows, keyboard
behavior, pending/error states, and narrow-layout rendering pass focused tests and the full frontend
test/typecheck suite with the original exports intact.

### MOD-3 - Store ownership and state-slice decomposition

1. `store.ts` SHALL remain the single public Zustand store boundary, while state and actions are
   organized into explicit target/query, kubeconfig/context, view/refresh, and Workspace/preset
   domain slices or equivalent focused modules.
2. Store actions SHALL preserve current signatures and invariants, including request IDs,
   configuration revisions, target signatures, silent refresh, explicit query revisions, Workspace
   reset behavior, active-preset dirty state, transfer atomicity, and operational-state isolation.
3. Persistence helpers SHALL remain behind the existing Workspace catalog boundary; operational
   state SHALL not be persisted as preset metadata or routed through desktop IPC directly.
4. Extracted slices SHALL share typed contracts and narrow dependencies without circular imports or
   duplicate Zustand stores. Effects that invalidate stale namespace, pod, or context responses
   SHALL remain owned by the store/request-guard boundary.
5. Store decomposition SHALL not silently fix unrelated product defects; any discovered issue SHALL
   be recorded as a follow-up rather than folded into an extraction task.

**Acceptance criteria:** Existing `store.test.ts`, workspace tests, preset transfer tests, and
characterization cases pass; stale-response guards, catalog commits, active references, query state,
and live operational state are observably equivalent before and after extraction.

### MOD-4 - Log viewer session and rendering decomposition

1. `LogViewer.tsx` SHALL separate session orchestration, live transport/event reduction, History
   transport/window/query lifecycle, search activation, and rendering/control concerns into focused
   modules or hooks with explicit inputs and outputs.
2. Live and History mode transitions SHALL retain their current WebSocket ownership, subscription
   messages, request/generation/session identity checks, cancellation behavior, retry behavior,
   bounded buffers/caches, source-level error isolation, and terminal states.
3. Search SHALL retain draft/applied semantics, explicit activation, repeatable searches, jump-to-
   latest behavior, history query readiness, stale-operation rejection, and invalid-range errors.
4. Virtualized output SHALL retain stable record keys, grouped presentation, wrapping behavior,
   source labels, output limits, responsive controls, and accessible status/error messaging.
5. `LogViewer` SHALL remain available from its current import path and SHALL not duplicate WebSocket
   ownership or open competing aggregate sessions during extraction.

**Acceptance criteria:** Existing log session, search, history, presentation, and range tests plus
new controller/transition tests pass; replacing Live with History, cancelling, retrying, searching,
and returning to Live produces the same messages, visible states, cleanup, and bounded memory rules.

### MOD-5 - History session and storage decomposition

1. `backend/src/historySession.ts` SHALL be decomposed into cohesive storage/writer, index and
   bounded reader, query, per-session lifecycle, and session-manager/orphan-cleanup responsibilities.
2. `HistorySessionManager`, `HistorySession`, `HistoryStartInput`, `HistoryWindowResult`,
   `HistorySessionManagerOptions`, `HistoryStreamFactory`, and `cleanupOrphanedHistorySessions`
   SHALL remain available through the existing module facade or an explicitly migrated contract.
3. The split SHALL preserve private session directories (`0700`), source/index files (`0600`),
   manifest behavior, bounded source/aggregate lines and bytes, disk limits, decoded-memory limits,
   window request rate, concurrent source reads, frame-safe windows, and sanitized failure reasons.
4. Session lifecycle SHALL preserve start/prepare/finalize/cancel/expire/cleanup idempotency,
   generation/session identity, terminal events, query invalidation, TTL behavior, and orphan
   cleanup semantics.
5. Storage and query modules SHALL not gain Kubernetes or WebSocket ownership; the session manager
   SHALL remain the coordination boundary consumed by `logsWebSocket.ts`.

**Acceptance criteria:** Existing history and logs WebSocket tests pass unchanged or with narrowly
justified import-only updates, and focused tests prove byte/line/disk/memory limits, permissions,
partial failures, cancellation, expiration, query windows, and orphan cleanup remain intact.

### MOD-6 - Desktop Main-process decomposition

1. `desktop/src/main.ts` SHALL separate application/window lifecycle, backend process startup and
   shutdown coordination, preferences/preset persistence and validation, kubeconfig selection/reset
   IPC, and IPC registration into focused modules.
2. The existing IPC channels (`select-kubeconfig`, `reset-kubeconfig`, `load-theme`, `save-theme`,
   `load-presets`, and `save-presets`) SHALL retain names, safe payload validation, return shapes,
   error behavior, and renderer-facing bridge compatibility.
3. BrowserWindow security settings (`contextIsolation`, `nodeIntegration`, `sandbox`), loopback
   backend routing, internal token handling, single-instance behavior, native dialog behavior, and
   bounded shutdown semantics SHALL remain unchanged unless separately specified.
4. Persistence modules SHALL preserve user-data paths, atomic preset replacement, preference merge
   behavior, invalid-data fallback, theme values, and selected-kubeconfig path handling without
   exposing secrets or arbitrary filesystem access to the renderer.
5. Main-process modules SHALL be testable with injected Electron/filesystem/backend dependencies or
   equivalent deterministic seams; no real cluster mutation or packaged release is required here.

**Acceptance criteria:** Desktop typecheck/build passes, IPC contract checks cover every channel,
persistence validation and failure cases are covered, and a desktop smoke scenario shows unchanged
startup, close, kubeconfig selection/reset, theme, preset hydration, and single-instance behavior.

### MOD-7 - App shell and orchestration decomposition

1. `frontend/src/App.tsx` SHALL retain responsibility for top-level composition and explicit
   cross-domain coordination while extracting theme persistence, health status, auto-refresh,
   selection/detail state, log workspace coordination, and derived pod-view data into focused hooks,
   controllers, or presentational components.
2. Reset behavior SHALL remain complete and ordered: brand reset, explicit query/configuration reset,
   selected details, log modal/sources, filters, selected applications, preset-library requests,
   and resizable layout state SHALL preserve their current intended semantics.
3. Log source inventory, source-modal confirmation, selected pod/details state, and LogViewer mount
   lifecycle SHALL retain their current ownership and cleanup boundaries; no second log workspace
   state store SHALL be introduced.
4. Theme loading/saving SHALL preserve web localStorage fallback, desktop hydration, readiness
   gating, theme key, and safe failure behavior. Health and auto-refresh SHALL preserve cancellation,
   interval teardown, silent refresh, and stale-result handling.
5. The `App` default export and existing child-component contracts SHALL remain usable while the
   shell becomes a composition root rather than a repository for unrelated workflow logic.

**Acceptance criteria:** Existing launchpad, logs, workspace, pod presentation, and store behavior
passes; focused tests cover reset/configuration changes, log modal refresh, theme hydration, health
failure, and auto-refresh teardown without changing rendered workflow outcomes.

### MOD-8 - CSS and design-system decomposition

1. `frontend/src/index.css` SHALL become a stable stylesheet entrypoint that imports or composes
   focused layers for tokens/theme, shell/layout, target/sidebar, Workspace/preset controls, pod
   tables/details, logs, dialogs/feedback, and responsive/accessibility rules.
2. Token ownership, theme selectors, import order, cascade/specificity, responsive breakpoints,
   focus-visible styles, reduced-motion behavior, and component class names SHALL remain explicit and
   deterministic.
3. The split SHALL preserve the design-system typography, color tokens, spacing, density, icon/button
   geometry, log wrapping, panel dimensions, desktop/mobile layout, and both light and dark themes.
4. CSS modules SHALL not introduce a second styling convention, rename class hooks without a
   compatibility migration, or hide overflow/focus in order to make a file smaller.
5. The Vite entrypoint SHALL continue importing `index.css`, and production CSS output SHALL contain
   the same required selectors/tokens with no accidental duplicate or later override.

**Acceptance criteria:** Frontend build succeeds and web/desktop visual checks show no unintended
layout, contrast, focus, wrapping, or theme regression at supported desktop and narrow widths.

### MOD-9 - Cross-cutting dependency and validation boundary

1. The final module graph SHALL have explicit one-way ownership: pure domain helpers at the bottom,
   state/session coordinators above them, and UI/process entrypoints at the top.
2. UI modules SHALL not acquire direct filesystem, Electron, Kubernetes, or backend-process access;
   history storage SHALL not render UI; and CSS modules SHALL not encode runtime state transitions.
3. The refactor SHALL preserve read-only Kubernetes behavior, local-only persistence, safe error
   boundaries, and no-new-route/no-new-IPC/no-new-dependency constraints.
4. Every extracted module SHALL have focused tests where behavior is non-trivial, and every phase
   SHALL record commands, results, changed paths, limitations, and residual risks.
5. The final validation SHALL include frontend/backend/desktop typechecks, frontend/backend tests,
   frontend and backend builds, `git diff --check`, and available web/desktop smoke/accessibility
   checks. Unavailable environment checks SHALL be recorded as unavailable, not implied as passed.

**Acceptance criteria:** Architecture review confirms ownership and dependency direction, validation
shows no source-contract drift, and the worktree contains only approved implementation/spec changes
for this effort.

## Out of scope

- New target, Workspace, preset, log, History, theme, or Kubernetes features.
- Fixing unrelated audit findings such as malformed legacy WebSocket decoding, target cardinality
  limits, backend signal shutdown, context response races, shared schemas, or generic error
  sanitization unless a later spec explicitly authorizes them.
- Changing REST/WebSocket/IPC protocols, persistence versions, package dependencies, release
  metadata, packaging configuration, or visual design direction.
- Introducing a second global state store, a dependency-injection framework, a monorepo package
  split, or a backend/frontend shared-contract package.
- Kubernetes mutations, cluster writes, credential inspection, secret copying, or production release.

## Risks

- Extracting stateful React effects can change effect ordering, stale-closure behavior, or cleanup.
- Splitting `store.ts` can create circular imports or accidentally produce multiple store instances.
- Splitting Live/History handling can duplicate WebSockets, lose generation guards, or leak sockets.
- Moving history storage can weaken file modes, limits, cleanup idempotency, or sanitized errors.
- Desktop extraction can widen IPC privilege or change shutdown/persistence ordering.
- CSS imports can alter cascade order, responsive overrides, or dark-theme readability.
- A broad refactor can hide behavior changes behind passing unit tests if browser/Electron checks are
  unavailable.

## Definition of done

- Each of the seven assessed large files has a documented ownership map and is reduced to a focused
  facade/composition root with cohesive extracted modules.
- Existing public contracts, read-only boundaries, persistence formats, log/history semantics,
  desktop security settings, accessibility behavior, responsive layout, and both themes remain
  compatible.
- Characterization, focused unit, integration, typecheck/build, and available web/desktop validation
  evidence is recorded in `tasks.md`; unavailable checks and residual risks are explicit.
- No unrelated audit finding is silently fixed, no new feature or protocol is introduced, and no
  Kubernetes mutation, secret exposure, commit, tag, or release artifact is part of the work.

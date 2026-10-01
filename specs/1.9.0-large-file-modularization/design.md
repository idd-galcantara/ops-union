# Design - ops-union v1.9.0 large-file modularization

## Release intent

This specification turns the v1.4.0 architecture-audit maintainability findings into one ordered,
behavior-preserving refactor. The release is intentionally cross-cutting because the assessed files
are coupled through shared state, log-session identity, persistence boundaries, and the application
shell. The implementation is staged so each domain can be extracted and verified before the next
integration point is changed.

The refactor keeps the current web/Electron product shape. It does not redesign UI, change API
payloads, alter the read-only Kubernetes model, or create a new package boundary.

## Ownership and collaboration

- `@ops-union-architecture-review` owns the baseline, dependency/ownership review, public-contract
  audit, and final structural review. It is read-only for product source.
- `@ops-union-frontend` owns TargetSelector, store, LogViewer, App, CSS extraction, frontend tests,
  accessibility, responsive behavior, and renderer boundary checks.
- `@ops-union-backend` owns the `historySession.ts` decomposition, history tests, storage safety,
  limits, lifecycle, and backend typecheck/build.
- `@ops-union-integration-qa` owns web/desktop smoke, visual/accessibility/responsive checks,
  persistence and IPC scenarios, read-only boundary checks, and environment limitations.
- `repository maintainer` owns spec convergence and release administration after implementation
  evidence exists.

No agent may mark a task complete from a proposed design alone. No backend or frontend implementation
agent may mutate Kubernetes, inspect or record kubeconfig secrets, or rewrite completed historical
specs.

## Baseline and compatibility strategy

Before the first extraction, record the current public imports and behavior seams:

| Area | Existing facade | Contract to preserve | Main evidence |
| --- | --- | --- | --- |
| Target/workspace UI | `TargetSelector`, `WorkspaceControls` | props, callbacks, store actions, keyboard/modal behavior | frontend component/store tests and smoke |
| Renderer state | `useOpsFlowStore` from `store.ts` | state shape, action signatures, request/revision guards, persistence boundary | `store.test.ts`, workspace/preset tests |
| Logs | `LogViewer` from `components/LogViewer.tsx` | Live/History protocol, search, cleanup, virtualization, source semantics | log session/history/search/presentation tests |
| History backend | `HistorySessionManager` and `HistorySession` from `historySession.ts` | session lifecycle, limits, files, queries, manager lookup | `historySession.test.ts`, `logsWebSocket.test.ts` |
| Desktop | preload bridge and IPC channel names | payload/return shapes, security, persistence, lifecycle | desktop typecheck/build and smoke |
| App shell | default `App` export and child props | reset, theme, health, refresh, log workspace composition | frontend tests and smoke |
| CSS | `main.tsx` import of `index.css` and class hooks | cascade, tokens, responsive/theme/accessibility output | build plus browser visual checks |

A facade remains at the old path when consumers or tests still import it. New modules may be moved
behind that facade in small commits. Public type names are re-exported rather than duplicated.
Tests should compare observable state/output and not assert private file layout except where the
layout is a security contract.

## Target module graph

The exact filenames may follow repository conventions, but the ownership must remain equivalent to
this graph:

```text
TargetSelector facade
  -> target/context picker -> namespace target builder -> store selectors/actions
  -> preset library -> preset flow/selection/transfer helpers -> store selectors/actions
WorkspaceControls facade
  -> workspace manager -> import/export/confirmation presentation -> store catalog actions
```

`TargetSelector` owns sidebar composition and layout callbacks. Context selection owns only local
selection/filter state plus store-provided context data. Namespace construction owns availability,
fallback, deduplication, and target-add callbacks. Preset and Workspace components own only UI
transient state and delegate catalog mutation to the store. No extracted component may import the
entire store object when a narrow selector/action prop is sufficient.

## Store module graph and state boundary

`store.ts` remains the Zustand creation point and public facade. It composes typed slices or action
factories for:

1. kubeconfig/context status and context request lifecycle;
2. target and namespace selection/discovery;
3. pod query, refresh, stale-response guards, and view state; and
4. Workspace/preset catalog, active references, transfer commits, and persistence.

The slice factories receive the minimum `get`, `set`, and domain dependencies needed to preserve one
store instance. Request counters and revision/signature guards have one owner and are not recreated
per component. `resetWorkspaceView` and `applyKubeconfigChange` remain explicit cross-slice
transitions so target, namespace, pod, filter, active-preset, and query revisions cannot drift.

Persistence continues through `workspaces.ts` and the existing web localStorage/Electron bridge
boundary. Operational state is never passed to catalog serializers. Existing action signatures are
preserved; a facade can adapt internal slice actions without changing callers.

## LogViewer module graph and session model

`LogViewer` becomes a composition root for a stable session model:

- `logSessionController` owns aggregate WebSocket creation, subscription messages, live event
  reduction, bounded event buffer, source state, pause/follow, and socket cleanup.
- `historyLogController` owns History start/cancel, session identity, generation checks, source
  windows, query windows, retries, terminal states, and the transition back to Live.
- `logSearchController` owns draft/applied values, activation snapshots, operation completion, and
  jump-to-latest coordination.
- presentational components own toolbar/filter controls, summary/source inspection, virtualized
  rows, empty/error/terminal content, and responsive controls.

Controllers may expose reducer-style state transitions and transport commands, but only one controller
owns a socket for a mounted session. The effect that starts a session must close or cancel the prior
socket before replacement and must reject events after cleanup. Session identity remains the tuple
of session/snapshot/generation (and query id for query windows). Existing `logsSession`,
`logsSearch`, `logsPresentation`, `logsRange`, and API serializers remain reusable pure helpers.

## History backend module graph

`historySession.ts` remains a compatibility facade while responsibilities move to focused modules:

```text
historySession facade
  -> historyStorage: private dirs, writers, manifest, file cleanup
  -> historyIndexReader: index offsets, bounded record reads, byte/memory accounting
  -> historyQuery: filter references and query windows
  -> historySessionCore: source pump, limits, progress, terminal/cancel lifecycle
  -> historySessionManager: concurrency, TTL, lookup, orphan cleanup
```

The session core coordinates those modules but does not expose raw file descriptors or storage paths
to the WebSocket layer. Storage uses the existing `0700` directory and `0600` data/index files.
All read-window/query operations retain rate limits and decoded-memory accounting. Cleanup is
idempotent, terminal events are emitted once, and manager generation checks remain authoritative.
Unit tests can inject the existing stream factory, clock, root directory, and limits without opening
Kubernetes connections.

## Desktop Main-process module graph

`desktop/src/main.ts` remains the executable entrypoint and composes:

- runtime lifecycle: single-instance lock, app-ready/close/signal shutdown, window ownership;
- backend runtime: project-root/frontend resolution, port/token setup, start/wait/stop;
- persistence: preferences/preset path resolution, validation, atomic writes, fallback reads;
- kubeconfig IPC service: native dialog, loopback request, internal token, safe result mapping; and
- IPC registration: the six existing channel names and handler wiring.

The preload bridge remains the only renderer-facing capability surface. The renderer receives no
filesystem paths beyond the existing sanitized status/error contracts. BrowserWindow security options
and loopback routing remain in the runtime/window owner. Injected adapters or pure validators should
make persistence and IPC mapping testable without importing a live Electron app.

## App shell module graph

`App` remains the composition root for the page. Extracted responsibilities are:

- `useThemePersistence` or equivalent: web fallback, desktop hydration, readiness, safe writes;
- health status hook: `/api/health` request cancellation and status mapping;
- refresh hook: interval setup/teardown and silent `loadPods` calls;
- log workspace coordinator: selected pod/log pods, inventory/modal, source confirmation, close and
  refresh reconciliation; and
- presentational shell/panel components: topbar, pod workspace, and layout wiring.

Configuration and explicit-query revisions still clear selected details, log state, filter, and
selected applications in the same lifecycle boundary. The coordinator does not become a second store;
its transient state remains local to the shell or is passed through existing callbacks.

## CSS layering and cascade

`index.css` remains the sole imported entrypoint. It composes ordered layers, for example:

1. tokens, global reset, typography, focus, and motion policy;
2. shell/topbar/layout and resizable panel geometry;
3. targets/sidebar, namespaces, presets, and Workspace manager;
4. pod table/details, toolbar, feedback, and confirmations;
5. logs workspace, filters, virtualized output, and history states; and
6. responsive and theme overrides that intentionally come last.

The names and values in `docs/DESIGN-SYSTEM.md` remain authoritative. Splitting by file must not
change selector specificity or create duplicate theme definitions. A CSS import/order audit must list
moved selectors, token owners, responsive overrides, and any deliberate compatibility alias.

## Sequencing and dependency decisions

The first phase captures behavior and identifies dependency cycles. Pure helper/controller contracts
are extracted before UI composition changes. Backend history and desktop persistence are isolated
before their consumers are changed. Store and log session boundaries are verified before App and
TargetSelector facades are simplified. CSS is last among implementation slices because visual output
is the final integration signal.

No phase depends on a new API or persistence version. A phase may stop with the old facade intact
when its focused tests pass; the next phase consumes the facade rather than reaching into private
modules.

## Error, safety, and rollback behavior

- Extraction failures return through the existing safe local error states and do not expose raw
  filesystem paths, kubeconfig contents, tokens, headers, or Kubernetes payloads.
- A stale frontend request, stale log event, cancelled History session, failed persistence write, or
  desktop shutdown failure retains its existing state/error semantics.
- A failed migration phase is reverted at the implementation change level by restoring the facade
  and deleting only newly introduced modules; no data migration or destructive catalog operation is
  used.
- Any behavior difference found by a focused check blocks the next phase until classified as an
  intentional, separately specified change or repaired within the same extraction slice.

## Validation strategy

Each phase records:

- focused unit tests for moved pure logic and state reducers/controllers;
- existing frontend/backend test suites relevant to the touched boundary;
- workspace typechecks and builds;
- `git diff --check` and a permitted-path/worktree review; and
- available web/desktop smoke, keyboard/focus, responsive, theme, persistence, and read-only checks.

The final validation runs `npm test --workspace=frontend`, `npm test --workspace=backend`,
`npm run typecheck`, `npm run build`, and `git diff --check`. Desktop has no test script, so IPC and
runtime behavior require focused deterministic tests added during the task and integration-QA smoke
where the environment supports it. Browser/Electron or real-cluster checks that cannot run are
recorded with the reason and residual risk.

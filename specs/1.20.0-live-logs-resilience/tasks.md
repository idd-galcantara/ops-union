# Implementation Tasks - ops-union v1.20.0 live logs resilience

These tasks implement the live-log resilience work in three priority groups (P0, P1, P2) defined in
`requirements.md` and `design.md`. They authorize scoped backend and frontend changes plus focused
validation. They do NOT authorize Kubernetes mutation, changes to the read-only guarantee, new
remote exposure, commit, push, tag, packaging, or release.

Diagnosis of record: `.agents/tasks/investigate-aggregate-log-stream-drop.md`.

## Ownership and sequencing

- `@ops-union-backend` owns LLR-1, LLR-2, LLR-3, LLR-4 (backend side), and backend tests.
- `@ops-union-frontend` owns LLR-5, LLR-6, and frontend tests.
- `@ops-union-integration-qa` owns LLR-7, LLR-8, non-regression validation, diagnostics, and the
  validation record.
- `@ops-union-security` reviews LLR-1/LLR-3/LLR-4/LLR-7 for secret handling, resource-exhaustion,
  and read-only guarantees.
- `@ops-union-architecture-review` (optional, read-only) confirms the Live-vs-History symmetry and
  contract preservation for LLR-3/LLR-4.

Recommended order: P0 first (LLR-1, LLR-2), then P1 (LLR-3), then P2 (LLR-4, LLR-5, LLR-6), then
boundary + verification (LLR-7, LLR-8). P0 alone removes the cascading 502; P1 removes the trigger.

## P0 - stop the crash and the cascading 502

- [x] 1.20.0-LLR-1 Add backend process-level error handlers.
  - In `backend/src/index.ts`, register `process.on('uncaughtException', ...)` and
    `process.on('unhandledRejection', ...)` that log sanitized message + stack via the existing
    logging path and keep the process alive for in-flight stream/request errors.
  - Preserve `SIGINT`/`SIGTERM` graceful shutdown and `server.on('error', ...)` (`EADDRINUSE`);
    allow startup/bind-fatal conditions to still exit non-zero.
  - Ensure no kubeconfig secrets, tokens, certificates, keys, or authorization headers are logged.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: LLR-1.1-LLR-1.5, LLR-7.3
  - _Validation: backend test asserting a simulated unhandled stream error does not terminate the
    covered path; typecheck.

- [x] 1.20.0-LLR-2 Contain per-source log-stream errors and isolate pod detail requests.
  - In `backend/src/kube/logsService.ts` and `backend/src/logsSubscription.ts`, ensure every stream
    has an `error` handler and that open-time and post-open failures become a per-source
    `error`/`end` event rather than an unhandled rejection; a failing source must not abort other
    sources or the subscription.
  - Confirm `describe`/`metrics` routes remain reachable through a log-stream error (no backend
    crash → no proxy 502 for this cause).
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: LLR-2.1-LLR-2.3, LLR-1.*
  - _Dependencies: 1.20.0-LLR-1
  - _Validation: backend test for per-source error containment; manual/scripted check that detail
    routes respond while a source errors.

## P1 - remove the overload that triggers the failure

- [x] 1.20.0-LLR-3 Bound Live aggregate concurrency and add backpressure.
  - In `backend/src/logsSubscription.ts`, replace the unbounded
    `for (const state of states) startSource(state)` with a bounded scheduler (reuse
    `backend/src/kube/boundedScheduler.ts` / the `HistorySourcePump` pattern).
  - Add named limits co-located with existing limits (`resourceLimits.ts` / `logsProtocol.ts`):
    `MAX_ACTIVE_LIVE_SOURCE_READS` (default aligned with `MAX_ACTIVE_KUBERNETES_READS = 8`),
    `MAX_LIVE_STREAMS_PER_CONNECTION` (≤ `MAX_LOG_SOURCES`), and in-flight byte/line caps per source
    and per session mirroring History intent.
  - Keep `sourceStarted` reporting correct for every confirmed source; keep existing
    `DEFAULT_LOG_LIMITS` content caps in force. Any new transient state field must be additive and
    backward-compatible and documented in `design.md`.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: LLR-3.1-LLR-3.6, LLR-7.5
  - _Dependencies: 1.20.0-LLR-2
  - _Validation: backend tests asserting active starts never exceed the bound, per-connection cap
    enforced, in-flight backpressure applied, and `sourceStarted` emitted for all sources.

## P2 - connection robustness and recovery

- [x] 1.20.0-LLR-4 Add WebSocket heartbeat/reaping and a follow-stream deadline.
  - In `backend/src/logsWebSocket.ts`, add per-socket `isAlive` ping/pong on a configurable
    interval and `terminate()` dead sockets; terminating must run `cancelOwnedSession()` so the
    subscription is cancelled and all upstream `follow` streams are `abort()`/`destroy()`ed.
  - In `backend/src/kube/logsService.ts`, add an optional inactivity deadline to `follow` streams
    that stops the stream cleanly and emits a per-source `end`/`error` on expiry without throwing.
  - Preserve the existing clean teardown (`ws.on('close'/'error', cancelOwnedSession)`).
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Requirements: LLR-4.1-LLR-4.4, LLR-7.2
  - _Dependencies: 1.20.0-LLR-2
  - _Validation: backend tests for heartbeat reaping (dead socket → subscription cancelled, streams
    stopped) and follow-deadline teardown.

- [x] 1.20.0-LLR-5 Add automatic viewer reconnection with backoff.
  - In `frontend/src/components/LogViewer.tsx`, distinguish intentional close (sources change, new
    Search, switch to History, close workspace, unmount) from unexpected drop via an explicit flag.
  - On unexpected close/error, enter a `reconnecting` UI state and retry with bounded exponential
    backoff (bounded max delay and max attempts), resuming current Live parameters on success; on
    exhaustion, fall back to the terminal error state without looping.
  - Respect Pause; do not duplicate/reorder already-rendered lines; reconnect the Live session
    rather than attempting byte-exact resume.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: LLR-5.1-LLR-5.5
  - _Dependencies: 1.20.0-LLR-1 (so the backend stays up to reconnect to)
  - _Validation: frontend tests for reconnect-on-unexpected-close, no-reconnect-on-intentional-close,
    exhaustion → error, and Pause-respecting behavior (mocked WebSocket).

- [x] 1.20.0-LLR-6 Distinguish backend-unavailable from application errors in the UI.
  - In `frontend/src/api.ts` (`errorFrom`/`messageOf`) and `frontend/src/components/PodDetailsPanel.tsx`,
    map a 502/connection-refused failure class to a distinguished "backend unavailable" message with
    actionable, secret-free guidance; presentation-only, no REST contract change.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: LLR-6.1-LLR-6.3
  - _Dependencies: none (independent of LLR-5)
  - _Validation: frontend test asserting a 502-class failure yields the distinguished message, not a
    raw `HTTP 502`.

## Boundary and verification

- [x] 1.20.0-LLR-7 Verify read-only, security, and non-regression boundaries.
  - Confirm no mutating Kubernetes operation was added; backend still binds only to `127.0.0.1`; no
    new remote exposure/transport; no secrets logged/returned by new code paths.
  - Confirm pod fan-out, describe, metrics, History logs, presets/workspaces, and the clean WS
    teardown remain intact; new WS message fields (if any) are additive and backward-compatible.
  - _Owner: @ops-union-integration-qa (with @ops-union-security review)
  - _Copilot agents: @ops-union-integration-qa, @ops-union-security
  - _Requirements: LLR-7.1-LLR-7.5
  - _Dependencies: 1.20.0-LLR-1, 1.20.0-LLR-2, 1.20.0-LLR-3, 1.20.0-LLR-4, 1.20.0-LLR-5, 1.20.0-LLR-6
  - _Validation: read-only route/method audit, grep for mutating client calls, bind-address check,
    secret-handling review of new handlers/logging.

- [x] 1.20.0-LLR-8 Record focused verification outcomes and limitations.
  - Run backend tests, frontend tests, both typechecks, the build, and `git diff --check`; record
    concrete results (counts/pass-fail) and touched-file diagnostics.
  - Explicitly list any check not run (live-cluster, packaged-runtime, browser/Electron interactive)
    as a known limitation; do not record a silent pass.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: LLR-8.1-LLR-8.4
  - _Dependencies: 1.20.0-LLR-7
  - _Validation: the recorded test/typecheck/build outcomes and diagnostics summary.

## Validation record

Implementation status: implemented, integration-verified, and final-gated (APPROVED review of
record at `.agents/tasks/live-logs-resilience/review.json`). Both FEATs (FEAT-001 backend
LLR-1..LLR-4, FEAT-002 frontend LLR-5/LLR-6) are complete and committed on branch
`feature/live-logs-resilience` (commits `2dde905` FEAT-001, `4013ca0` FEAT-002). Cross-FEAT
integration verification was run across both features together in the worktree
`.worktrees/live-logs-resilience`. Per this spec, no commit beyond local, push, tag, packaging, or
release is part of the work; the branch is held locally for the separate controlled-delivery step.

### Final consolidation gate (iteration 2 — re-run of the full suite)

Re-ran the full suite once in the worktree `.worktrees/live-logs-resilience` as the final gate; all
outcomes reproduce iteration 1 exactly:

- Backend tests — `npm test --workspace=backend`: PASS. 116 pass, 0 fail, 0 cancelled, 0 skipped.
- Frontend tests — `npm test --workspace=frontend`: PASS. 171 pass, 0 fail, 0 cancelled, 0 skipped.
- Typecheck — `npm run typecheck` (backend + frontend + desktop): PASS, clean, no errors.
- Build — `npm run build` (backend `tsc`, frontend `tsc -b && vite build`, desktop `tsc`): PASS;
  frontend bundle emitted, 1951 modules transformed.
- Whitespace — `git diff --check`: clean.
- Working tree: `git status --porcelain` shows no tracked source changes. The only tracked artifact
  regenerated by the gate (`frontend/tsconfig.node.tsbuildinfo`, an incremental build cache) was
  restored, so no build-cache churn is left behind. The remaining untracked entries under
  `.agents/tasks/live-logs-resilience/` are agent runtime artifacts, not release source.
- Checks NOT run are unchanged from the list below (live-cluster, packaged-runtime/Electron,
  interactive browser including the LogViewer reconnect UI wiring) and remain known limitations.

### Integration verification outcomes (iteration 1)

- Backend tests — `npm test --workspace=backend`: PASS. 116 tests pass, 0 fail, 0 skipped (baseline
  was 104; +12 new covering process guards, per-source error containment, bounded pump/active-read
  cap, per-connection cap, in-flight backpressure, and heartbeat reaping).
- Frontend tests — `npm test --workspace=frontend`: PASS. 171 tests pass, 0 fail, 0 skipped
  (baseline was 161; +10 new across `logsReconnect.test.ts` and `api.test.ts`).
- Typecheck — `npm run typecheck` (backend + frontend + desktop): PASS, clean, no errors.
- Build — `npm run build` (backend `tsc`, frontend `tsc -b && vite build`, desktop `tsc`): PASS;
  frontend bundle emitted (1951 modules transformed).
- Whitespace — `git diff --check`: clean, no errors.
- Working tree: clean of source changes. The only regenerated artifact
  (`frontend/tsconfig.node.tsbuildinfo`, a tracked incremental build cache touched by typecheck/build)
  was restored so no build-cache churn is left staged.

### Cross-FEAT seam checks

- `LogConnectionState` additive change: `'reconnecting'` is added to the union in
  `LogViewerParts.tsx` and has a matching `stateLabel` entry; `LogViewer.tsx` consumes it
  consistently (reconnect scheduling, exhaustion fallback). No type mismatch between the FEATs.
- WS event shape: the frontend reconnect path reuses the existing
  `liveSessionController`/`reduceLiveLogEvent` pipeline; the backend `AggregateLogEvent` union
  (`backend/src/logsTypes.ts`) has an empty diff — no new event/field, so no event-shape mismatch.
- Shared contract: `sourceStarted` is still emitted exactly once per admitted source by the bounded
  pump, which the frontend session relies on; backend/frontend remain compatible.

### LLR-7 boundary self-check (audit)

- No mutating Kubernetes call added: diff of changed backend files shows no new kube-client mutating
  verbs (create/delete/patch/replace/evict). Pre-existing `*.post` route handlers are read-only
  selection endpoints (kubeconfig/namespace/pod selection), not kube mutations; `.delete()` hits are
  Map/Set operations.
- Backend still binds only `127.0.0.1`: `config.host = '127.0.0.1'`, `server.listen(port, host)`
  unchanged.
- No secrets in new log/handler paths: the new `processGuards.ts` routes every message through
  `safeErrorMessage` and additionally strips any stack line matching
  authorization/cookie/token/secret/certificate/kubeconfig. No raw error bodies logged.
- Process guards do not exit on runtime errors (no new `process.exit`); SIGINT/SIGTERM shutdown and
  `server.on('error')` EADDRINUSE non-zero exit are preserved.
- WS schema additive/backward-compatible: `AggregateLogEvent` unchanged (no new event or field).

### Per-group status

- LLR-1/LLR-2 (P0): DONE — `uncaughtException`/`unhandledRejection` guards keep the backend alive on
  runtime errors with sanitized logging; per-source open-time and post-open stream errors stay
  source-scoped (siblings keep streaming; no rejection escapes). Verified by backend unit tests.
- LLR-3 (P1): DONE — Live aggregate path uses a bounded pump (`MAX_ACTIVE_LIVE_SOURCE_READS = 8`),
  per-connection cap (`MAX_LIVE_STREAMS_PER_CONNECTION = MAX_LOG_SOURCES`), and per-source/per-session
  in-flight byte backpressure; `sourceStarted` emitted once per source. Verified by backend tests.
- LLR-4 (P2): DONE — heartbeat ping/pong reaps dead sockets (terminate → `cancelOwnedSession` →
  subscription cancel → per-source stop) and an optional follow-stream inactivity deadline ends
  cleanly without throwing. Verified by backend tests.
- LLR-5/LLR-6 (P2): DONE — pure `logsReconnect.ts` bounded-backoff policy (base 500ms, factor 2, max
  10s, 6 attempts) + classifier; `LogViewer.tsx` reconnect wiring; `api.ts`
  `BackendUnavailableError`/`backendUnavailableMessage()` for 502 and fetch rejections, surfaced by
  `PodDetailsPanel.messageOf`. Policy and message mapping unit-tested in pure modules.
- LLR-7/LLR-8: DONE — boundary audit above; verification suite run and outcomes recorded here.

### Checks NOT run (known limitations)

These were not exercised and are explicitly NOT recorded as passing:

- Live-cluster validation: no real Kubernetes cluster was contacted; log streaming, follow-stream
  errors, and the describe/metrics-no-longer-502 behavior were exercised only through unit tests and
  injectable seams, not against a running cluster.
- Packaged-runtime / Electron: the desktop packaged runtime was not launched or packaged (typecheck
  and `tsc` build only).
- Interactive browser, including the LogViewer reconnect UI wiring: the frontend runner is
  `tsx --test src/**/*.test.ts` (`.test.ts` only, no DOM/React harness). The `LogViewer.tsx`
  reconnect lifecycle (useEffect/socket transitions, timer scheduling, `reconnecting` state render)
  and `PodDetailsPanel.messageOf` component render were validated only by typecheck + build plus the
  pure policy/classifier and API-mapping unit tests — not by a runtime/DOM test or manual browser
  interaction.

Known validation scope: live-cluster, packaged-runtime, and interactive browser/Electron validation
are out of scope for this spec and are recorded above as limitations.

## Definition of done

- P0: `uncaughtException`/`unhandledRejection` handlers keep the backend alive through single-stream
  errors (with sanitized logging and preserved shutdown/startup-fatal behavior), and per-source
  errors are contained so `describe`/`metrics` no longer 502 from a crashed backend.
- P1: the Live aggregate path starts sources under a bounded concurrency limit with a per-connection
  stream cap and in-flight backpressure, symmetric with History and complementary to content limits.
- P2: the aggregate WebSocket reaps dead connections and tears down their upstream streams, `follow`
  streams honor an inactivity deadline, the viewer reconnects with bounded backoff for unexpected
  drops, and the UI distinguishes backend-unavailable from application errors.
- Read-only and non-regression boundaries hold; backend/frontend tests, typechecks, and build pass;
  verification outcomes and limitations are recorded; and no commit, push, tag, packaging, or
  release is part of this specification.

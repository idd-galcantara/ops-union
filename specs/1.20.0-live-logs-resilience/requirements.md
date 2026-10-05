# Requirements - ops-union v1.20.0 live logs resilience

## Scope

Version 1.20.0 hardens the live log path and the backend process against the intermittent failure
in which the aggregate log WebSocket (`/api/logs`) drops, live logs stop arriving, and subsequent
pod detail requests (`describe`/`metrics`) return HTTP 502 until the backend is restarted by hand.

The root cause, established by a read-only investigation
(`.agents/tasks/investigate-aggregate-log-stream-drop.md`), is threefold:

1. **No process-level safety net.** `backend/src/index.ts` registers no `uncaughtException` or
   `unhandledRejection` handler. An unhandled async error from a log stream (or an undici body
   rejection inside `@kubernetes/client-node`) terminates the whole Node process. With the backend
   gone, the Vite dev proxy returns HTTP 502 for the next `GET .../describe`, which is why "tudo
   quebra".
2. **No concurrency limit or backpressure on the Live aggregate path.** `startLogSubscription` in
   `backend/src/logsSubscription.ts` starts every source at once
   (`for (const state of states) startSource(state)`), unlike the pod fan-out
   (`MAX_ACTIVE_KUBERNETES_READS = 8`) and the History pump
   (`maxConcurrentSourceReads`, in-flight byte caps). A single WS connection may open up to
   `MAX_LOG_SOURCES = 50` concurrent `follow=true` streams.
3. **No connection robustness or recovery.** The `WebSocketServer` has no heartbeat/ping, `follow`
   streams have no timeout, and the frontend viewer does not reconnect
   (`frontend/src/components/LogViewer.tsx` goes straight to the `error` state on `onclose`/`onerror`).
   After a failure the system stays degraded until a manual backend restart.

This work is organized in three priority groups, all in scope for 1.20.0:

- **P0 — stop the crash and the cascading 502** (backend process resilience, fault isolation so
  pod detail requests do not depend on live-log health).
- **P1 — remove the overload that triggers the failure** (concurrency limit and resource
  backpressure on the Live aggregate path, symmetric with History).
- **P2 — connection robustness and recovery** (WebSocket heartbeat and dead-connection reaping,
  `follow` stream deadline, automatic viewer reconnection with backoff, clearer "backend
  unavailable" messaging).

The application remains strictly **local and read-only**. No Kubernetes mutation, no change to the
read-only guarantee, no change to kubeconfig/secret handling, and no new remote exposure may be
introduced. Backend binding stays on `127.0.0.1`.

## User stories

- As an operator streaming live logs across multiple targets, the backend does not crash when a
  single log stream errors, so my session stays usable.
- As an operator, when the live log stream has a problem, I can still open a pod's `describe` and
  `metrics` without getting HTTP 502.
- As an operator, when the aggregate log connection drops transiently, the viewer reconnects on its
  own and resumes streaming without me reopening anything.
- As an operator opening live logs over many sources at once, the backend bounds how many cluster
  streams it opens concurrently so it does not exhaust resources.
- As an operator, when a connection goes half-dead, the backend detects it and releases the
  orphaned upstream log streams instead of leaking them.
- As an operator, when the backend is genuinely unavailable, the UI tells me that clearly instead
  of showing an opaque `HTTP 502`.

## Requirements

### LLR-1 - Backend process resilience (P0)

1. The backend bootstrap (`backend/src/index.ts`) SHALL register a `process.on('uncaughtException', ...)`
   handler and a `process.on('unhandledRejection', ...)` handler.
2. These handlers SHALL log the error through the existing logging path and SHALL NOT terminate the
   process for an error originating in a single log stream or Kubernetes client call.
3. The handlers SHALL preserve existing intentional shutdown behavior for `SIGINT`/`SIGTERM` and
   SHALL preserve the existing `server.on('error', ...)` handling for `EADDRINUSE`.
4. The handlers SHALL NOT swallow or hide programming errors silently; each caught error SHALL be
   logged with enough context (message and stack) to diagnose it, without printing kubeconfig
   secrets, tokens, certificates, authorization headers, or raw sensitive cluster output.
5. A truly fatal, unrecoverable condition (for example a failure during startup/bind) SHALL still be
   allowed to exit with a non-zero code; the safety net is for in-flight request/stream errors, not
   for masking an un-startable server.

### LLR-2 - Fault isolation for pod detail requests (P0)

1. A failure in the live-log subscription or in any individual log stream SHALL NOT make the
   `GET /api/pods/:cluster/:namespace/:pod/describe` or
   `GET /api/pods/:cluster/:namespace/:pod/metrics` endpoints unavailable.
2. With LLR-1 in place, the backend process SHALL remain up through a log-stream error, so the Vite
   dev proxy SHALL NOT return HTTP 502 for `describe`/`metrics` caused by a crashed backend.
3. An error raised while streaming logs for one source SHALL be contained to that source and SHALL
   NOT abort other active sources on the same aggregate subscription.

### LLR-3 - Live aggregate concurrency limit and backpressure (P1)

1. The Live aggregate path (`startLogSubscription` in `backend/src/logsSubscription.ts`) SHALL
   start sources through a bounded-concurrency scheduler rather than starting all sources at once.
2. The concurrency bound SHALL be a named limit, consistent with the existing backend limits model
   (`backend/src/resourceLimits.ts` / `backend/src/logsProtocol.ts`), mirroring the History pump's
   `maxConcurrentSourceReads` approach rather than introducing a divergent mechanism.
3. The Live path SHALL enforce a maximum number of concurrently active `follow` streams per
   aggregate WebSocket connection, and `MAX_LOG_SOURCES = 50` SHALL be treated as a source-count
   cap, not as an unbounded concurrency allowance.
4. The Live path SHALL enforce a bound on in-flight resource use consistent with the History model's
   intent (for example an in-flight byte/line cap per source and per session), so that one or more
   high-volume sources cannot grow memory without limit on the Live path.
5. Existing content limits (`DEFAULT_LOG_LIMITS`, per-source and total line/byte caps) SHALL remain
   in force; the new concurrency/backpressure controls SHALL complement them, not replace them.
6. The ordering and `sourceStarted` reporting observed by the frontend SHALL remain correct: every
   confirmed source SHALL still be reported as started and SHALL still stream, only now subject to
   the concurrency bound.

### LLR-4 - Deterministic stream teardown and dead-connection reaping (P2)

1. The aggregate `WebSocketServer` (`backend/src/logsWebSocket.ts`) SHALL implement a server-side
   heartbeat (ping/pong) with a configurable interval and SHALL terminate connections that fail to
   respond within the configured timeout.
2. When a connection is terminated by the heartbeat reaper, its owned subscription SHALL be
   cancelled and all its upstream `follow` streams SHALL be stopped (`abort()` + `destroy()`), so no
   orphaned cluster streams remain.
3. Each `follow` log stream in `backend/src/kube/logsService.ts` SHALL support an optional
   inactivity deadline/timeout so a stuck upstream body cannot hold a handle open indefinitely;
   reaching the deadline SHALL stop the stream cleanly and report an end/error for that source
   without crashing the process.
4. The existing clean-teardown path (`ws.on('close'/'error', cancelOwnedSession)` →
   `subscription.cancel()` → per-source `stop()`) SHALL be preserved and SHALL remain the primary
   teardown; the heartbeat and deadline are additional safety nets, not replacements.

### LLR-5 - Automatic viewer reconnection (P2)

1. The log viewer (`frontend/src/components/LogViewer.tsx`) SHALL attempt to reconnect the aggregate
   WebSocket automatically when the connection closes or errors unexpectedly, using exponential
   backoff with a bounded maximum delay and a bounded maximum number of attempts.
2. While reconnecting, the viewer SHALL show a distinct "reconnecting" indication rather than
   immediately presenting a terminal error, and SHALL resume the current Live session parameters
   on success.
3. Reconnection SHALL NOT fire for intentional, user-initiated closes (for example changing
   sources, running a new Search, switching to History, or closing the workspace); those SHALL
   continue to use the existing teardown without an automatic reconnect.
4. When reconnection attempts are exhausted, the viewer SHALL fall back to the existing error state
   with a clear message, without entering an infinite reconnect loop.
5. Reconnection behavior SHALL respect the existing Pause state and SHALL NOT duplicate or reorder
   already-rendered lines in a way that corrupts the viewer buffer.

### LLR-6 - Clearer backend-unavailable messaging (P2)

1. When a REST request (for example `describe`/`metrics`) fails because the backend is unreachable
   (proxy 502 / connection refused), the frontend SHALL distinguish "backend unavailable" from an
   application-level error, instead of surfacing only `HTTP 502`.
2. The distinguished message SHALL guide the user toward the appropriate action (for example that
   the backend may need to be running/restarted) without leaking internal details or secrets.
3. This messaging change SHALL be presentation-only and SHALL NOT alter REST contracts, status
   codes, or backend behavior.

### LLR-7 - Read-only and non-regression boundaries

1. This feature SHALL NOT add, expose, or invoke any mutating Kubernetes operation, and SHALL
   preserve the strictly read-only guarantee.
2. The backend SHALL continue to bind only to `127.0.0.1`; no new remote exposure, port, or
   transport SHALL be introduced.
3. Kubeconfig secrets, tokens, certificates, keys, and authorization headers SHALL NOT be logged,
   returned, or persisted by any new code path (including the new error handlers and heartbeat/
   reconnect logic).
4. Existing behavior for pod fan-out, describe, metrics, History logs, presets/workspaces, and the
   clean WebSocket teardown SHALL remain intact except for the resilience/concurrency changes
   specified here.
5. Existing REST and WebSocket message contracts SHALL be preserved unless a change is explicitly
   required by LLR-3/LLR-4 and documented in the design; any new message/field SHALL be additive
   and backward-compatible.

### LLR-8 - Focused verification

1. Backend tests SHALL cover: process-level error isolation intent (a thrown/rejected log-stream
   error does not propagate to crash the process in the covered code paths), Live aggregate
   concurrency bounding, per-connection stream cap, in-flight backpressure behavior, heartbeat/dead-
   connection reaping, and `follow` deadline teardown.
2. Frontend tests SHALL cover: automatic reconnection with backoff on unexpected close/error, no
   reconnection on intentional close, exhaustion fallback to the error state, and the distinguished
   backend-unavailable messaging.
3. Backend and frontend typechecks SHALL pass, the build SHALL pass, and touched-file diagnostics
   SHALL report no errors.
4. The validation record SHALL state concrete outcomes (test counts/results, typecheck, build) and
   SHALL explicitly list any check that could not be run (for example live-cluster or packaging
   validation) as a known limitation rather than a silent pass.

## Definition of done

- The backend registers `uncaughtException`/`unhandledRejection` handlers that log and keep the
  process alive through single-stream errors while preserving intentional shutdown and startup-fatal
  behavior (LLR-1), so pod `describe`/`metrics` no longer return 502 due to a crashed backend (LLR-2).
- The Live aggregate path starts sources under a bounded concurrency limit with a per-connection
  stream cap and in-flight backpressure, symmetric with History and complementary to existing
  content limits (LLR-3).
- The aggregate WebSocket has a heartbeat that reaps dead connections and tears down their upstream
  streams, and `follow` streams support an inactivity deadline; the existing clean teardown is
  preserved (LLR-4).
- The viewer reconnects automatically with bounded exponential backoff for unexpected drops, shows a
  reconnecting state, does not reconnect on intentional closes, and falls back cleanly when attempts
  are exhausted (LLR-5).
- The frontend distinguishes backend-unavailable from application errors with actionable, secret-safe
  messaging (LLR-6).
- Read-only and non-regression boundaries are preserved (LLR-7), focused backend/frontend verification
  is recorded with concrete outcomes and explicit limitations (LLR-8), and no commit, push, tag,
  packaging, or release is part of this specification.

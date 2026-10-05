# Design - ops-union v1.20.0 live logs resilience

## Context and root cause

Source of truth for the diagnosis: `.agents/tasks/investigate-aggregate-log-stream-drop.md`
(read-only investigation). The reported symptom is a two-part cascade:

1. The aggregate log WebSocket (`/api/logs`) drops; the viewer shows
   "Could not connect to the aggregate log stream." and no lines arrive.
2. Pod detail requests (`describe`/`metrics`) then return **HTTP 502**, and the state persists until
   a manual backend restart.

Both symptoms share one cause: the backend process becomes unavailable (crashed or wedged), and the
**Vite dev proxy** returns HTTP 502 when it cannot reach `127.0.0.1:4000`. The 502 is emitted by the
proxy, not by the Express `describe` route.

Confirmed code facts behind the cause:

- `backend/src/index.ts` registers only `SIGINT`/`SIGTERM` and `server.on('error', ...)`. There is
  **no** `uncaughtException`/`unhandledRejection` handler. An unhandled async rejection (undici body
  error during `follow`, surfaced through `@kubernetes/client-node` v2) is fatal by Node default.
- `backend/src/logsSubscription.ts` `startLogSubscription` starts **all** sources at once
  (`for (const state of states) startSource(state)`) with **no** concurrency limit, unlike
  `podsService.getPods` (`mapWithConcurrency(..., MAX_ACTIVE_KUBERNETES_READS)`, limit 8) and
  `historySourcePump` (`maxConcurrentSourceReads`, in-flight byte caps).
- `backend/src/logsProtocol.ts` caps sources at `MAX_LOG_SOURCES = 50` but only by **count** and
  **content** (lines/bytes), not by I/O concurrency.
- `backend/src/logsWebSocket.ts` creates the `WebSocketServer` with **no** ping/heartbeat; teardown
  depends entirely on the browser socket emitting `close`/`error`.
- `backend/src/kube/logsService.ts` `follow` streams have **no** timeout/deadline.
- `frontend/src/components/LogViewer.tsx` does **not** reconnect: `onerror`/`onclose` go straight to
  the terminal `error`/`ended` state.

## Design goals

- **P0:** make a single log-stream error non-fatal to the process, so `describe`/`metrics` stay
  available (no more cascading 502).
- **P1:** bound the Live aggregate path's concurrency and in-flight resource use, mirroring the
  defensive posture that History already has, to remove the overload that triggers the failure.
- **P2:** detect and recover from dropped/half-dead connections (server heartbeat + reaping,
  `follow` deadline, client auto-reconnect) and communicate backend-unavailable clearly.

Non-goals: changing the read-only guarantee, adding Kubernetes mutations, changing the backend bind
address, introducing a new transport, or re-architecting History.

## Ownership boundaries

- `backend/` changes: `@ops-union-backend`
  (`index.ts`, `logsSubscription.ts`, `logsWebSocket.ts`, `kube/logsService.ts`,
  `resourceLimits.ts`/`logsProtocol.ts`, and the bounded-concurrency helper
  `kube/boundedScheduler.ts`).
- `frontend/` changes: `@ops-union-frontend`
  (`components/LogViewer.tsx`, `api.ts`, and error presentation in `PodDetailsPanel.tsx`).
- Read-only, security, and non-regression validation: `@ops-union-integration-qa` and, for the
  resilience/limits review, `@ops-union-security`.
- Architecture/contract audit of the Live-vs-History symmetry: `@ops-union-architecture-review`.

## P0 - Backend process resilience and fault isolation

### LLR-1 process handlers (`backend/src/index.ts`)

Add top-level handlers at bootstrap:

- `process.on('uncaughtException', handler)` and `process.on('unhandledRejection', handler)`.
- The handler logs via the existing logging path with message + stack, **sanitized** so no
  kubeconfig secrets/tokens/certs/authorization headers appear.
- For in-flight request/stream errors, the handler **does not** exit. Rationale: a single `follow`
  stream erroring must not take down the HTTP server that serves `describe`/`metrics`.
- Preserve `SIGINT`/`SIGTERM` graceful shutdown and `server.on('error', ...)` (`EADDRINUSE`).
- Startup/bind-fatal conditions still exit non-zero. The safety net targets runtime stream/request
  errors, not an un-startable server. Guard against masking a crash loop: if desired, a bounded
  counter may log elevated severity when repeated uncaught errors occur, but the default is to keep
  serving.

Design note: process-level handlers are a backstop. The primary fix for known stream errors is to
ensure `logsService`/`logsSubscription` attach `error` handlers to every stream (`stream.on('error', ...)`)
and that `log.log(...).then(...).catch(...)` covers both open-time and post-open failures, converting
them into a per-source `error`/`end` event rather than an unhandled rejection.

### LLR-2 fault isolation

With LLR-1 and per-source error containment, a failure in one source emits an error event for that
source only and does not abort the subscription or the process. `describe`/`metrics` are ordinary
HTTP routes on the same server; keeping the process alive keeps them reachable, so the proxy stops
returning 502 for this cause.

## P1 - Live aggregate concurrency and backpressure

### LLR-3 bounded start (`backend/src/logsSubscription.ts`)

Replace the unbounded `for (const state of states) startSource(state)` with a scheduler that keeps
at most `maxConcurrentLiveSourceReads` streams starting/active at once, reusing the existing
`mapWithConcurrency` pattern from `backend/src/kube/boundedScheduler.ts` or a small
pump analogous to `HistorySourcePump` (prefer reuse over a new mechanism).

New named limits (added to `backend/src/resourceLimits.ts` or `logsProtocol.ts`, co-located with the
existing limits):

- `MAX_ACTIVE_LIVE_SOURCE_READS` — concurrent `follow` streams actively starting; default aligned
  with `MAX_ACTIVE_KUBERNETES_READS` (8) unless evidence favors another value.
- `MAX_LIVE_STREAMS_PER_CONNECTION` — hard cap on concurrently active `follow` streams for one
  aggregate WS connection (≤ `MAX_LOG_SOURCES`).
- In-flight resource caps mirroring History intent (e.g. `maxInFlightDecodedBytesPerSource` /
  `maxInFlightDecodedBytesPerSession` equivalents) so a high-volume source applies backpressure
  instead of growing memory unbounded.

`sourceStarted` reporting stays correct: the frontend still receives a `sourceStarted` for every
confirmed source; the scheduler only controls how many open concurrently. Existing
`DEFAULT_LOG_LIMITS` content caps remain in force and are complementary.

Contract impact: none required to the WS message schema. If a source is queued behind the
concurrency bound, it may optionally surface a transient `queued`-like state analogous to History;
any such field is **additive and backward-compatible** and documented here if introduced.

> FEAT-001 implementation note (contract impact: none): the live scheduler keeps the queued state
> **internal** to `startLogSubscription`. No new `AggregateLogEvent` type or field was added — the
> `queued`/`active` source status is backend-only bookkeeping and is never emitted. `sourceStarted`
> is still emitted exactly once per admitted source, up front, before scheduling.

## P2 - Connection robustness and recovery

### LLR-4 heartbeat + reaping (`backend/src/logsWebSocket.ts`) and deadline (`kube/logsService.ts`)

- Server heartbeat: on the `WebSocketServer`, track `isAlive` per socket; `ping()` on a configurable
  interval; on `pong` mark alive; a socket that misses the window is `terminate()`d. Terminating a
  socket runs the existing `cancelOwnedSession()` so the subscription is cancelled and every
  upstream `follow` stream is `abort()`/`destroy()`ed — no orphaned cluster streams.
- `follow` deadline: `streamStructuredPodLogs`/`streamPodLogs` accept an optional inactivity
  deadline. On expiry, `stop()` the stream cleanly and emit a per-source `end`/`error`; never throw
  past the handler. This bounds stuck-handle accumulation described in the investigation.
- Preserve the existing clean teardown (`ws.on('close'/'error', cancelOwnedSession)`); heartbeat and
  deadline are additive safety nets.

### LLR-5 viewer auto-reconnect (`frontend/src/components/LogViewer.tsx`)

- Distinguish **intentional** close (changing sources, new Search, switch to History, closing the
  workspace, component unmount) from **unexpected** drop. Only unexpected drops trigger reconnect.
  Implement with an explicit flag (e.g. `intentionalCloseRef`) set before any user-initiated close.
- On unexpected `onclose`/`onerror`: enter a `reconnecting` UI state and retry with exponential
  backoff (e.g. base 500ms, factor 2, max delay ~10s, max attempts bounded, e.g. 6). On success,
  reopen with the current applied Live session parameters.
- On exhaustion: fall back to the existing terminal `error` state with a clear message; never loop
  forever.
- Respect Pause; do not duplicate/reorder already-rendered lines. Because Live resumes a fresh
  aggregate session (Kubernetes `follow` is not a resumable paged source per the History design), the
  reconnect reconnects the session rather than attempting byte-exact resumption; the viewer buffer
  cap (5000) and existing dedup/append rules continue to govern rendering.

### LLR-6 backend-unavailable messaging (`frontend/src/api.ts`, `PodDetailsPanel.tsx`)

- In `api.ts` `errorFrom`/`messageOf`, map a 502/connection-refused class of failure to a
  distinguished "backend unavailable" error type, separate from application errors, with an
  actionable, secret-free message. Presentation-only; REST contracts unchanged.

## State transitions (viewer, Live)

```text
connecting --(open)--> streaming --(user action: sources/search/history/close)--> closing(intentional) --> idle/ended
streaming --(unexpected close/error)--> reconnecting --(open)--> streaming
reconnecting --(backoff attempts exhausted)--> error
reconnecting --(user action)--> closing(intentional) --> idle/ended
```

## Error behavior summary

- Single source stream error: contained to that source (per-source `error`/`end`); subscription and
  process survive (LLR-1/LLR-2/LLR-3).
- Half-dead connection: reaped by heartbeat; upstream streams torn down (LLR-4).
- Stuck upstream body: ended by `follow` deadline (LLR-4).
- Transient WS drop: viewer reconnects with backoff (LLR-5).
- Backend truly down: `describe`/`metrics` show "backend unavailable" (LLR-6); when the backend is
  back, the viewer reconnects automatically.

## Security and read-only considerations

- No mutating Kubernetes calls; only list/get/watch/read and log streaming remain (LLR-7.1).
- Backend stays bound to `127.0.0.1`; heartbeat and reconnect add no new exposure (LLR-7.2).
- New handlers/log lines are sanitized; no secrets/tokens/certs/authorization headers are logged or
  returned (LLR-7.3, LLR-1.4).
- Heartbeat/reconnect must not amplify load: bounded intervals, bounded attempts, and the P1
  concurrency caps together prevent reconnect storms from re-triggering overload.

## Testing strategy

- Backend (`tsx --test`): error-containment of a faulting stream (no process-crash in covered path),
  bounded Live concurrency (never more than N active starts), per-connection stream cap, in-flight
  backpressure, heartbeat reaping cancels the subscription and stops streams, `follow` deadline
  tears down cleanly. Use fakes/mocks for the Kubernetes client and sockets; no live cluster.
- Frontend: auto-reconnect on unexpected close with backoff, no reconnect on intentional close,
  exhaustion → error state, backend-unavailable message mapping. Mock `WebSocket` and fetch.
- Typecheck + build for both workspaces; `git diff --check`; touched-file diagnostics.
- Known limitation: live-cluster, packaged-runtime, and browser/Electron interactive validation are
  out of scope for this spec and recorded as limitations.

## Tradeoffs and alternatives

- **Process-wide handlers vs. per-stream catches.** Per-stream error handling is the precise fix;
  the process handlers are a backstop against any missed path. Both are included because the
  investigation shows the failure is exactly an escaped async rejection. Keeping the process alive on
  uncaught errors is a deliberate availability choice for a local single-user tool; it is paired with
  mandatory logging so defects remain visible.
- **Dev-proxy supervision (auto-restart) vs. fixing the crash.** Auto-restart would only shrink the
  502 window; LLR-1 removes the crash cause, which is the correct fix. Supervision is explicitly out
  of scope.
- **Byte-exact log resume vs. session reconnect.** Kubernetes `follow` is not a resumable paged
  source (per the History design), so the viewer reconnects the Live session rather than resuming
  bytes; this matches existing product behavior and avoids a false guarantee.

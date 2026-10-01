# Security Audit

## Scope and baseline


This is an evidence-backed source, dependency, test, and isolated-local-probe audit. The current
SEC-001 through SEC-011 findings below are authoritative for v1.10.1. This report does not replace
a signed release review, a live authorization review, or a packaged-runtime smoke test; those
limitations are recorded as accepted risk where applicable.

## Executive summary and threat model

Ops Union is intentionally a single-user, localhost-bound Kubernetes inspection tool. Electron Main starts a backend child, the backend is the only Kubernetes client, and the sandboxed renderer uses REST, WebSocket, and a narrow preload bridge. The backend uses the user's kubeconfig privileges and exposes read-only cluster data.

The local trust assumption is accepted: another process on the same user session may connect to the loopback backend and issue read requests. This is not treated as a missing multi-user authentication feature. Browser-origin access is controlled by an explicit Origin and capability policy; the renderer-level Electron smoke needed to validate the packaged handoff was not completed in this environment.

**Local threat hypothesis:** an untrusted local HTTP/WebSocket client can reach privileged backend behavior or cause sensitive kubeconfig-derived data to escape because boundary validation, origin handling, or redaction is incomplete.

**Cheapest discriminating checks:** inspect route and upgrade registration, run the existing safe-error and WebSocket tests, send one malformed encoded legacy log URL to an isolated server, and attempt one WebSocket handshake with an arbitrary Origin. The current malformed-URI regression test and configured Origin/capability policy test passed; the renderer-level Electron handoff remains accepted risk.

## Scope and baseline

- **Audit:** ops-union v1.10.0 security hardening
- **Environment:** Linux, Node.js `v25.2.1`, npm `11.6.2`
- **Boundary:** single-user, localhost-only, read-only Kubernetes inspection
- **Evidence date:** 2026-10-01
- **Worktree:** pre-existing agent, README, source, package, and specification changes were
  preserved; no commit, tag, publication, or release upload was performed.

This report updates SEC-001 through SEC-011 from the v1.9.0 baseline. It records executable local
evidence and source review without collecting kubeconfig content, credentials, certificates, raw
cluster responses, or live Kubernetes data.

## Threat model and boundary review

Ops Union remains a local Electron application. Electron Main starts the backend, the backend is
the only Kubernetes client, and the renderer uses REST/WebSocket plus the narrow preload bridge.
The backend remains bound to `127.0.0.1`; Kubernetes calls remain list/read/metrics/log operations.
No mutation method, remote listener, credential response, unrestricted IPC bridge, or multi-user
authorization model was added.

The local single-user trust assumption remains accepted: another process in the user session may
reach the loopback backend. WebSocket browser-origin access is now additionally constrained by an
explicit Origin allowlist and an in-memory capability for configured production/runtime policy.

## Current SEC-001..SEC-011 findings (authoritative)

### SEC-001: Malformed WebSocket URI handling

- **Severity:** high
- **Status:** fixed/validated
- **Controls:** Legacy path decoding is inside a local exception boundary; decoded identifiers are
  bounded to 128 characters; malformed upgrades receive a safe `400` response. Shutdown rejects
  new upgrades with `503`.
- **Evidence:** Backend test `malformed legacy URI segments are rejected without taking down
  health` sends invalid percent-encoding and then receives a successful health response. The full
  backend suite passed `104/104`.
- **Residual risk:** Aggregate requests have no decoded path segments, but malformed handshake
  behavior still depends on Node's HTTP parser for invalid request-line syntax.

### SEC-002: WebSocket Origin and capability policy

- **Severity:** medium
- **Status:** accepted-risk
- **Controls:** Aggregate and legacy upgrades share explicit Origin/capability policy. Production
  config derives a loopback allowlist from `OPS_FLOW_ALLOWED_ORIGINS` or configured loopback
  defaults. Capabilities are accepted only from a header, strict cookie, or prefixed subprotocol;
  they are not placed in URLs, responses, logs, or persistence.
- **Evidence:** Backend test `configured WebSocket policy rejects arbitrary origins and accepts the
  capability` passed. The policy is attached to both socket path families, and malformed capability
  decoding fails closed.
- **Limitation and owner:** No renderer-level Electron/browser handshake smoke was available. Electron
  `44.4.0` and `DISPLAY=:1` were present, but the isolated launch exposed DevTools without a page
  target, so the startup/navigation/WebSocket capability scenario is not claimed as passed. Owner:
  integration QA and frontend; review on the next Linux desktop smoke run.

### SEC-003: REST target/resource caps and bounded concurrency

- **Severity:** medium
- **Status:** fixed/validated
- **Controls:** Requests cap contexts at 32, aggregate targets at 256, and Kubernetes identifiers
  at 128 characters. Raw oversized arrays are rejected before item iteration; duplicate targets
  are removed before scheduling. Namespace and pod reads use an eight-worker bounded scheduler.
- **Evidence:** `parseTargets.test.ts`, `namespacesService.test.ts`, and `podsService.test.ts`
  cover caps, deduplication, per-target failures, and active-read ceilings. Backend typecheck and
  full tests passed.
- **Residual risk:** A caller can still submit a valid request at the documented maximum; the
  scheduler bounds concurrency but does not eliminate upstream Kubernetes latency.

### SEC-004: Deterministic backend shutdown and history cleanup

- **Severity:** medium
- **Status:** accepted-risk
- **Controls:** Signal handling is idempotent and bounded to five seconds. Shutdown marks the
  backend unavailable for new upgrades, terminates active log clients, closes the HTTP server, and
  closes history resources through the server-close lifecycle. History session close is idempotent.
  Electron child termination escalates after four seconds and resolves after a five-second failsafe.
- **Evidence:** A real built backend child reached `/api/health` on port `43127` and exited with code
  `0` after SIGTERM in `13 ms`. Backend history tests cover cancellation, cleanup, repeated close
  behavior, and HTTP server close cleanup; the backend suite passed `104/104`. A real stalled child
  remained alive after SIGTERM and the desktop helper escalated it after `4008 ms` with `SIGKILL`.
- **Limitation and owner:** The spawned signal run did not create a real history session, and the
  packaged Electron window-close path was not observed. The five-second process failsafe remains
  the final availability boundary. Owner: backend and integration QA; review with a full desktop
  history-session smoke.

### SEC-005: WebSocket transport maxPayload

- **Severity:** medium
- **Status:** fixed/validated
- **Controls:** `WebSocketServer` sets `maxPayload` to 512 KiB. Application schema, session,
  generation, and frame-size validation remains active after transport validation.
- **Evidence:** Backend aggregate WebSocket tests cover manager frame limits, oversized history
  events, and transport/application rejection. Full backend suite passed.
- **Residual risk:** No full heap-profile measurement was captured; tests verify bounded protocol
  behavior without recording oversized payload contents.

### SEC-006: Moderate `ip-address` advisory

- **Severity:** medium
- **Status:** fixed/validated
- **Controls:** The reviewed root override resolves the production transitive dependency to
  `ip-address@10.7.2` without changing loopback binding, TLS verification, or read-only behavior.
- **Evidence:** `npm ci --ignore-scripts`, `npm audit --omit=dev`, and `npm explain ip-address`
  passed. Audit reported `0 vulnerabilities`; explain showed the Kubernetes client SOCKS chain
  resolving to `10.7.2`. Workspace typechecks, backend tests, and packaging staging passed.
- **Residual risk:** The dependency chain remains transitive and should be rechecked on future
  Kubernetes client upgrades.

### SEC-007: Generic error redaction

- **Severity:** low
- **Status:** fixed/validated
- **Controls:** Backend safe-error mapping reduces unknown failures to bounded operational text and
  recognizes safe Kubernetes status/reason and connection categories. Paths, URLs, headers, bodies,
  certificates, tokens, kubeconfig content, and stacks are not returned.
- **Evidence:** Backend tests cover Kubernetes bodies, raw JSON bodies, API exception dumps, log
  request failures, connection codes, generic fallbacks, and source-scoped WebSocket errors.
- **Residual risk:** Displayed Kubernetes workload/log text is operator data by design and is not
  treated as an application diagnostic leak.

### SEC-008: Bounded Workspace import

- **Severity:** low
- **Status:** fixed/validated
- **Controls:** Imports are rejected before text parsing above 2 MiB. Workspace, preset, target,
  field, description, and nesting budgets are enforced while preserving valid formats. Errors are
  content-only and failed imports do not mutate the catalog.
- **Evidence:** Frontend test `Workspace imports enforce byte, collection, field, and nesting
  budgets` covers the 2 MiB limit and oversized collections/fields. Frontend tests passed `148/148`
  and frontend typecheck/build passed.
- **Residual risk:** Browser/Electron memory profiling for a boundary-size file was unavailable.

### SEC-009: Stale context response guards

- **Severity:** low
- **Status:** fixed/validated
- **Controls:** Context requests capture a request ID and configuration revision; only the current
  request/revision may commit contexts, errors, or loading completion.
- **Evidence:** Frontend test `context responses cannot commit after a revision change or newer
  request` resolves deferred stale responses after a revision change and newer request; the newest
  context list remains authoritative.
- **Residual risk:** No separate live kubeconfig replacement was performed; the test exercises the
  state contract with deferred responses.

### SEC-010: Reproducible packaging and dependency gates

- **Severity:** medium
- **Status:** accepted-risk
- **Controls:** Runtime staging reads direct dependency versions from the reviewed root lockfile,
  uses a clean production install, and rejects sensitive resource names/extensions. CI runs
  `npm ci`, production audit, workspace typechecks/tests/builds, package preparation, and package
  inspection before artifact upload.
- **Evidence:** `node scripts/prepare-desktop-runtime.mjs` passed. A direct-dependency comparison
  matched staged runtime versions to the root lockfile: `@kubernetes/client-node@1.4.0`,
  `express@4.22.3`, `undici@6.28.1`, and `ws@8.21.3`. `node scripts/inspect-package.mjs` passed
  for five resource roots. `npm run security:prepackage` passed.
- **Limitation and owner:** Current Linux packaging was not run because it would create release
  outputs; Windows and macOS installer/archive inspection, signing/notarization, and a live CI job
  were unavailable on this host. The workflow upload block is source-reviewed, not executed CI
  evidence. Owner: release and integration QA; review on the platform CI runners before release.

### SEC-011: Electron CSP and navigation defense in depth

- **Severity:** low
- **Status:** accepted-risk
- **Controls:** Backend-served CSP permits only local application resources, explicitly listed Google
  font origins, loopback API/WebSocket connections, same-origin scripts, and no objects/framing.
  Electron preserves sandbox, context isolation, disabled Node integration, preload narrowing, and
  denied new windows. `will-navigate` allows only the exact loopback renderer root and rejects
  external, file/data/javascript, credential-bearing, and unexpected loopback URLs.
- **Evidence:** Source review of `backend/src/app.ts`, `desktop/src/runtime.ts`, and
  `frontend/index.html`; backend and desktop typechecks passed; frontend production build passed.
- **Limitation and owner:** Electron `44.4.0` was installed and a display session was available,
  but the bounded isolated launch exposed DevTools without a page target. No startup URL,
  attempted-navigation, new-window, CSP-resource, or renderer WebSocket smoke is claimed as
  passed. Owner: desktop, frontend, and integration QA; review on the next successful packaged
  or local desktop smoke.

## Validation evidence

Passed commands and outcomes:

- `npm ci --ignore-scripts`
- `npm audit --omit=dev` -> `0 vulnerabilities`
- `npm explain ip-address` -> `ip-address@10.7.2`
- `npm run security:prepackage` -> audit, all workspace typechecks, backend/frontend tests, and
  builds passed
- `npm run typecheck --workspace=backend`
- `npm test --workspace=backend` -> `104/104`
- `npm run typecheck --workspace=frontend`
- `npm test --workspace=frontend` -> `148/148`
- `npm run typecheck --workspace=desktop`
- `npm run build`
- `node scripts/prepare-desktop-runtime.mjs`
- `node scripts/inspect-package.mjs`
- `git diff --check`

Additional v1.10.1 runtime and delivery evidence:

- `npm run build` -> backend, frontend, and desktop builds passed.
- Controlled spawned backend health/SIGTERM probe -> health ready; signal-to-exit `13 ms`, exit
  code `0`.
- Controlled stalled-child probe through `desktop/dist/backendProcess.js` -> SIGKILL escalation
  at `4008 ms`; the harness returned and did not hang.
- `node scripts/prepare-desktop-runtime.mjs && node scripts/inspect-package.mjs` -> staging and
  five-root inspection passed; no sensitive path names were printed.
- `unsquashfs` listing of pre-existing `release/ops-union-1.7.1-linux-x86_64.AppImage` -> `0`
  forbidden sensitive path names; this is supplemental historical artifact evidence, not a current
  package claim.
- Electron smoke -> unavailable for completion: Electron `44.4.0` and `DISPLAY=:1` were available,
  but the isolated DevTools launch exposed no page target. No credentials, cluster data, or full
  URLs were recorded.
- Windows/macOS packaging, installer/archive inspection, signing/notarization, and live GitHub
  Actions execution -> unavailable on this Linux host; the workflow was source-reviewed only.

No live Kubernetes request, kubeconfig inspection, release upload, commit, or publication was
performed. The accepted-risk runtime and platform limitations must be completed before a signed
cross-platform release claim.

## Accepted assumptions and residual risks

- Loopback and read-only behavior are product boundaries, not a multi-user authorization model.
- Live Kubernetes validation, kubeconfig inspection, cluster authorization checks, and
  exec-authenticator execution are `N/A by design`; the application consumes the supplied
  configuration and delegates authorization to Kubernetes.
- Kubernetes authorization is delegated to the selected kubeconfig identity and was not live-tested.
- Exec-authenticator behavior and operator-controlled filesystem permissions were not exercised.
- Cluster logs, events, annotations, labels, and workload text may contain sensitive operator data;
  the application displays it intentionally and bounds history/renderer resource use.
- Existing release artifacts were not rebuilt, signed, notarized, or replaced.

## Change-boundary confirmation

The pre-existing 1.10.0 implementation changed backend WebSocket/resource/lifecycle controls,
frontend import and state guards, desktop navigation/process controls, dependency/package gates, CI
gates, and focused tests. This v1.10.1 closure changed only current audit/spec evidence after
validation. No Kubernetes resource or kubeconfig was accessed; no source, package manifest, lockfile,
release artifact, commit, tag, publication, or unrelated worktree change was made by this closure.
## Superseded v1.9.0 baseline (historical only; not current findings)

The following architecture and finding material is retained for traceability. Any `Status: open`
text below belongs to the v1.9.0 baseline and must not be interpreted as an open v1.10.1 finding.

The material below is retained as historical context only. The authoritative current statuses are
the v1.10.1 findings above.

```text
Electron Main
  -> child process environment and loopback health/internal requests
Backend HTTP and WebSocket
  -> validated normalized responses
Kubernetes client adapters
  -> Kubernetes API using kubeconfig credentials in backend memory
Kubeconfig files and external exec authenticators

Renderer
  -> REST and WebSocket only
Preload
  -> select/reset kubeconfig, theme, and validated preset persistence IPC
Main userData
  -> preferences.json and presets.json
```

Sensitive data handling observed:

- Kubeconfig credentials are loaded and cached in backend memory. Context responses contain names, cluster names, and optional namespaces only.
- Kubeconfig status returns availability, source, and context count, not the path or credentials.
- The Electron internal token is generated in Main, passed to the child environment, and required only for kubeconfig selection/reset routes. It is not returned in responses.
- Known Kubernetes API exception dumps are reduced to status and safe reason text. Generic error messages are not uniformly reduced; see SEC-007.
- History directories are created with mode `0700`, source/index files with mode `0600`, and history protocol windows are bounded. Cleanup is best effort and is delayed after an ungraceful process exit; see SEC-004.
- No audit output below includes kubeconfig content, tokens, certificates, keys, authorization headers, raw cluster errors, or secret-looking command output.

### Historical controls verified

### Electron, preload, and renderer

- `desktop/src/runtime.ts` creates a `BrowserWindow` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, and a specific preload path.
- `setWindowOpenHandler` denies uncontrolled new windows.
- Main loads the renderer from `http://127.0.0.1:<dynamic-port>` after a backend health check and keeps the backend loopback-bound.
- `desktop/src/preload.ts` exposes only six application-specific operations and static desktop metadata; there is no generic IPC, filesystem, shell, or Kubernetes bridge.
- IPC handlers validate theme values, preset/workspace shapes, and kubeconfig status responses before persistence or renderer use.
- No renderer `innerHTML`, `dangerouslySetInnerHTML`, shell API, or direct Node access was found.
- No explicit Content-Security-Policy was found in `frontend/index.html`, and no `will-navigate` handler was found. Current renderer code has no identified user-controlled navigation sink; this is a hardening and regression-control gap, not a confirmed exploit in this audit. See SEC-011.

### Backend and WebSocket

- `backend/src/config.ts` fixes the server host to `127.0.0.1`.
- REST routes are explicitly registered under `/api`; kubeconfig selection/reset require the internal header token and return a not-found response when unauthorized.
- Express JSON parsing has its library default body limit, but REST target and cluster cardinality and field lengths are not capped by application validators.
- Aggregate log/history messages validate types, dates, source identity, generations, limits, frame size, session ownership, and request rate. History storage and source reads have explicit line, byte, disk, memory, concurrency, TTL, and retention limits.
- The WebSocket server is attached with `noServer: true` and rejects unknown upgrade paths.
- Application frame checks occur after `ws` has received a message. The installed `ws` default `maxPayload` is `100 * 1024 * 1024`; the application frame limit is lower but is not configured at the library boundary. See SEC-005.

### Kubernetes read-only boundary

The audited client operations are list/read/metrics/log operations only:

- `CoreV1Api.listNamespace`
- `CoreV1Api.listNamespacedPod`
- `CoreV1Api.readNamespacedPod`
- `CoreV1Api.listNamespacedEvent`
- `AppsV1Api.readNamespacedDeployment`
- `AppsV1Api.readNamespacedStatefulSet`
- `AppsV1Api.readNamespacedReplicaSet`
- `CustomObjectsApi.getNamespacedCustomObject` for Rollouts
- `AutoscalingV2Api.listNamespacedHorizontalPodAutoscaler`
- `Metrics.getPodMetrics`
- `Log.log`

No Kubernetes mutation method was found in the audited backend or operational source paths. Context scoping clones kubeconfig entries and sets a specific context for each client; it does not mutate a shared current context. TLS verification remains enabled while the CA chain is completed from the kubeconfig and system roots. A live authorization review was not performed.

### Storage and persistence

- Desktop persistence uses fixed files below Electron `userData`, JSON parsing, shape validation, atomic temporary-file rename, and safe fallback for invalid data.
- Preset/workspace import is content-only JSON and does not accept file paths or executable content.
- History storage uses private temporary directories and bounded cleanup.
- Persistence does not explicitly set file mode or defend against a pre-existing symlink at the fixed `userData` paths. Electron userData permissions and the local single-user filesystem trust model are assumptions, not independently verified controls.

### Dependencies and delivery

- The lockfile resolves Express `4.22.3`, `qs 6.16.0`, and Electron `44.4.0`; `extract-zip` was not present in the resolved tree returned by `npm ls`.
- `npm audit --audit-level=high` exits successfully with no high or critical advisories, but reports one moderate production-transitive advisory for `ip-address <=10.7.0` through `@kubernetes/client-node -> socks-proxy-agent -> socks`.
- `electron-builder.yml` lists explicit desktop/frontend/backend resources and the runtime preparation script rejects kubeconfig-named paths in compiled assets. Packaging was intentionally not run.
- The package workflow runs `npm ci` and packaging but has no explicit dependency audit, unit-test, typecheck, or artifact-inspection gate. The backend runtime staging script runs a fresh production `npm install --omit=dev --ignore-scripts --no-package-lock`, so packaged backend dependencies can drift from the root lockfile. See SEC-010.

## Superseded v1.9.0 findings (historical only; not current findings)

### Historical SEC-001
Category: websocket/input/resource
Severity: high
Confidence: confirmed
Status: open
Evidence: `backend/src/logsWebSocket.ts`, `LOGS_PATH`, legacy upgrade callback; isolated command `node --import tsx/esm ...` with malformed percent encoding reported `malformed_ws_probe=uncaught_URIError`.
Observation: The legacy upgrade path calls `decodeURIComponent` on matched URL segments without a local exception boundary. A malformed encoded segment raises `URIError` from the HTTP upgrade listener.
Impact: A local client can terminate the backend process or make the desktop inspection session unavailable. This is an availability issue at the local trust boundary.
Recommendation: Decode each segment inside a bounded try/catch, reject malformed input with a safe HTTP or WebSocket error, and add a regression test proving a subsequent health request succeeds.
Suggested owner: backend maintainer
Validation: Add and run a malformed legacy WebSocket URL test followed by a health request.

### Historical SEC-002
Category: websocket/backend
Severity: medium
Confidence: confirmed
Status: open
Evidence: `backend/src/logsWebSocket.ts` creates `WebSocketServer({ noServer: true })` without Origin validation; isolated handshake with `Origin: https://untrusted.example` printed `cross_origin_websocket_handshake=accepted`.
Observation: Any webpage that can reach the loopback port can open the log WebSocket. The server does not require the renderer origin, an internal token, or another handshake credential for read log sessions.
Impact: A malicious web page may read cluster log data if it can determine valid source tuples, bypassing browser same-origin protections through the WebSocket channel. This is more specific than the accepted assumption that arbitrary local processes can use the backend.
Recommendation: Decide and document the browser threat boundary. For the desktop path, enforce the expected loopback renderer Origin and/or a per-process WebSocket capability token; for web development, define an explicit allowed-origin policy. Preserve the existing single-user behavior where required.
Suggested owner: backend and desktop maintainers
Validation: Add accepted and rejected Origin tests for aggregate and legacy sockets, then verify the desktop renderer still connects.

### Historical SEC-003
Category: backend/resource/input
Severity: medium
Confidence: confirmed
Status: open
Evidence: `backend/src/kube/parseTargets.ts` and `backend/src/kube/namespacesService.ts` accept arbitrarily long arrays and strings; `podsService.ts` and `namespacesService.ts` use one `Promise.allSettled` operation per item. Existing tests cover valid input, deduplication, and isolated failures but no cardinality cap.
Observation: Live/history log protocols have explicit source and concurrency limits, but ordinary namespace and pod discovery/query fan-out has no application cardinality, string-size, or bounded scheduler control.
Impact: A local caller can create large request parsing, response aggregation, Kubernetes request, and concurrent connection workloads while all operations remain read-only.
Recommendation: Add documented caps for clusters, targets, and identifier lengths, deduplicate pod targets, and use bounded concurrency with a safe capacity response.
Suggested owner: backend maintainer
Validation: Add service tests that assert the caps and maximum active lister count for both namespace and pod paths.

### Historical SEC-004
Category: resource/storage/lifecycle
Severity: medium
Confidence: confirmed
Status: open
Evidence: `desktop/src/backendProcess.ts` sends `child.kill()` and waits for exit without a timeout; `backend/src/index.ts` has no signal shutdown handler; `backend/src/logsWebSocket.ts` closes the history manager only on HTTP server close; `historyLimits.ts` sets a one-hour orphan grace period.
Observation: SIGTERM does not explicitly close the HTTP server or history manager. Active history files can survive an ungraceful backend termination until later startup cleanup, and Main can wait indefinitely for a child that does not exit.
Impact: Temporary cluster log data can persist longer than intended and desktop shutdown can hang. This is primarily availability and local privacy residual risk.
Recommendation: Add bounded signal handling that closes the server and history manager, and add a Main shutdown timeout with escalation. Test window-close, signal, and restart cleanup timing.
Suggested owner: backend and integration-QA maintainers
Validation: Controlled history fixture, signal/desktop shutdown, bounded child exit, and verification that owned temporary storage is removed.

### Historical SEC-005
Category: websocket/resource
Severity: medium
Confidence: confirmed
Status: open
Evidence: `backend/src/logsWebSocket.ts` constructs `WebSocketServer({ noServer: true })` without `maxPayload`; installed `ws` source defaults `maxPayload` to `104857600` bytes. Application checks `maxFrameBytes` only after message assembly.
Observation: A client can make the WebSocket library buffer a message up to 100 MiB before the application rejects it. History's 512 KiB frame limit therefore does not bound transport allocation.
Impact: Repeated local oversized messages can create avoidable memory and CPU pressure, especially alongside multiple sockets.
Recommendation: Set `maxPayload` to the smallest protocol ceiling needed, retain the application limit, and test oversized input at the library boundary.
Suggested owner: backend maintainer
Validation: Assert the configured library ceiling and run an oversized-frame test without recording payload contents.

### Historical SEC-006
Category: dependency
Severity: medium
Confidence: confirmed
Status: open
Evidence: `npm audit --audit-level=high` reported one moderate advisory for `ip-address <=10.7.0`; `npm explain ip-address` traced it through `@kubernetes/client-node@1.4.0 -> socks-proxy-agent@8.0.5 -> socks@2.8.10`.
Observation: The high/critical audit gate is clear, but a production-transitive package has address-family allowlist and unbounded diagnostic-input advisories. The vulnerable package is pulled by the Kubernetes client proxy dependency.
Impact: Exploitability is reduced by loopback-only operation and the application's normal cluster URLs, but a future proxy/input path could inherit incorrect address checks or resource behavior.
Recommendation: Track a reviewed upgrade of the Kubernetes client/proxy chain or a compatible override. Do not apply an automatic fix without lockfile and cluster-client compatibility review.
Suggested owner: repository maintainer
Validation: Re-run `npm audit --omit=dev`, `npm explain ip-address`, typechecks, backend tests, and package smoke after a deliberate dependency change.

### Historical SEC-007
Category: secrets/backend
Severity: low
Confidence: likely
Status: open
Evidence: `backend/src/kube/podsService.ts` returns arbitrary `Error.message` text when the error is not a recognized Kubernetes status or system-code error; `podDetailsService.ts` and `workloadSummary.ts` route upstream failures through this helper.
Observation: Known Kubernetes API exception dumps are sanitized, but generic adapter/library messages can still contain local paths, URLs, request details, or future authorization/header material.
Impact: A future upstream error shape could disclose sensitive connection or filesystem details to the renderer and any local backend client.
Recommendation: Replace generic pass-through with a bounded allowlist of operational categories and add tests for path-, URL-, and header-shaped generic errors.
Suggested owner: backend maintainer
Validation: Inject representative generic errors through details, metrics, workload, and log paths and assert only approved safe text is returned.

### Historical SEC-008
Category: input/resource/persistence
Severity: low
Confidence: likely
Status: open
Evidence: `frontend/src/components/TargetSelector.tsx` reads an imported Workspace file with `file.text()` without a byte limit; `frontend/src/workspaces.ts` and `frontend/src/presets.ts` validate shapes but do not cap document size, workspace count, preset count, target count, or field lengths.
Observation: User-selected JSON is parsed fully in the renderer before application-level normalization. The import path has no explicit resource budget.
Impact: A very large local file can consume renderer memory and block the UI. This is a local file availability issue, not arbitrary code execution.
Recommendation: Reject files above a documented size limit before reading, cap collection and field cardinality, and keep import parsing bounded.
Suggested owner: frontend maintainer
Validation: Add large-file and oversized-collection tests that reject safely without changing existing valid import formats.

### Historical SEC-009
Category: renderer/state-integrity
Severity: low
Status: open
Confidence: confirmed
Evidence: `frontend/src/store/kubeconfigSlice.ts` writes the result of `fetchContexts()` directly; `frontend/src/store/operational.ts` increments `configurationRevision` for kubeconfig changes; namespace and pod actions have request/revision guards but context loading does not.
Observation: A context response started before a kubeconfig replacement or later reload can resolve afterward and overwrite the current context list.
Impact: The renderer may display stale context choices after a configuration change. This can cause incorrect read queries, although the backend still validates context names against its active kubeconfig.
Recommendation: Give context loading a request ID and configuration revision guard, and add a deferred-response regression test.
Suggested owner: frontend maintainer
Validation: Resolve an old context request after selection and assert that the new context list remains authoritative.

### Historical SEC-010
Category: dependency/packaging/delivery
Severity: medium
Confidence: confirmed
Status: open
Evidence: `scripts/prepare-desktop-runtime.mjs` stages backend production dependencies using `npm install --omit=dev --ignore-scripts --no-package-lock`; `.github/workflows/package-desktop.yml` has no explicit audit, test, typecheck, or packaged-content inspection step before upload.
Observation: The packaged backend runtime is resolved afresh from semver ranges rather than reproduced from the committed root lockfile. The release workflow can therefore publish an artifact whose transitive dependency graph differs from the audited checkout, without a dedicated security gate.
Impact: Dependency drift and missing artifact inspection weaken supply-chain reproducibility and can reintroduce a known or newly published vulnerable package into distributed installers.
Recommendation: Make runtime dependency staging reproducible from reviewed lockfile material, then add audit, tests, typechecks, and packaged-content checks to the release gate. Keep signing and checksum requirements explicit.
Suggested owner: release maintainer
Validation: Build in a clean CI workspace, compare runtime dependency versions to the lockfile, run the audit and focused suites, and inspect the final package contents without including kubeconfig material.

### Historical SEC-011
Category: electron/packaging
Severity: low
Confidence: likely
Status: accepted-follow-up
Evidence: `desktop/src/runtime.ts` denies new windows but does not register `will-navigate`; `frontend/index.html` has no CSP meta/header and loads Google Fonts from external origins. No current renderer sink was found that makes navigation or script injection exploitable.
Observation: Electron navigation and packaged-resource policy are enforced only partially. Future content or dependency changes could make an unexpected navigation, remote script, or renderer XSS more consequential because there is no defense-in-depth CSP or navigation allowlist.
Impact: A future renderer injection or unsafe link could move the privileged application window to an unintended origin or load additional remote content.
Recommendation: Add a strict packaged-resource CSP, allow only the expected loopback navigation, and decide whether external font loading should be bundled or explicitly allowed. Add a smoke test for navigation denial.
Suggested owner: desktop and frontend maintainers
Validation: Electron smoke test for initial URL, attempted navigation, external links, and CSP violations.

## Accepted assumptions and residual risks

- Loopback binding and read-only operations are the product boundary, not a multi-user authorization model. Any local process able to connect is trusted to the same extent as the user session.
- Kubernetes authorization is delegated to the selected kubeconfig identity. This audit did not inspect or print kubeconfig data and did not perform live authorization checks.
- The backend may invoke kubeconfig `exec` authentication helpers through the Kubernetes client at runtime. The executable, environment, and permissions are operator-controlled and were not exercised.
- Cluster log, event, annotation, label, and workload text is operator data and can contain sensitive content. The application intentionally displays it; retention is bounded only for History and renderer buffers.
- Electron userData directory ownership and OS filesystem permissions were not independently verified. Persistence code uses fixed paths and atomic replacement but does not harden against an attacker who can tamper with userData.
- Existing release artifacts were not opened, rebuilt, modified, or assessed as current. Code signing and notarization are documented delivery requirements but are not verified for the committed artifacts.

## Prioritized remediation backlog

1. **P0: Harden legacy WebSocket decoding.** Catch malformed URI segments, reject safely, and add a health-after-rejection regression test. Owner: backend.
2. **P1: Define the browser WebSocket boundary.** Add Origin/capability validation compatible with desktop and development web flows. Owner: backend and desktop.
3. **P1: Bound REST and WebSocket resource use.** Cap targets, identifiers, import payloads, and `ws` `maxPayload`; add bounded concurrency. Owner: backend and frontend.
4. **P1: Make shutdown deterministic.** Close backend server/history manager on signals and add bounded child termination. Owner: backend and integration-QA.
5. **P1: Make packaging reproducible.** Align staged runtime dependencies with reviewed lockfile data and add CI audit, tests, typechecks, and artifact inspection. Owner: release maintainer.
6. **P2: Close redaction and stale-state gaps.** Sanitize generic errors and guard context responses. Owner: backend and frontend.
7. **P2: Add Electron defense in depth.** Add CSP, navigation allowlisting, and IPC/runtime smoke tests. Owner: desktop and frontend.
8. **P2: Review the moderate `ip-address` advisory.** Resolve through a deliberate dependency-chain change or record a time-bounded accepted risk. Owner: repository maintainer.

## Evidence matrix

| Area | Check | Outcome |
| --- | --- | --- |
| Worktree | `git status --short` | Pre-existing agent-file changes preserved; no product changes before report creation |
| Version baseline | `git log -1`, `git rev-parse`, tag lookup | Commit `c2df5cb`, branch `main`, tag `v1.9.0` |
| Dependency tree | `npm ls electron extract-zip express qs --all` | Electron `44.4.0`, Express `4.22.3`, qs `6.16.0`; no `extract-zip` entry returned |
| Dependency audit | `npm audit --audit-level=high` | Exit 0; no high/critical findings; one moderate `ip-address` advisory remains |
| Advisory path | `npm explain ip-address` | Production-transitive path through Kubernetes client SOCKS dependencies |
| Backend typecheck | `npm run typecheck --workspace=backend` | Passed |
| Frontend typecheck | `npm run typecheck --workspace=frontend` | Passed |
| Desktop typecheck | `npm run typecheck --workspace=desktop` | Passed |
| Backend tests | `npm test --workspace=backend` | 98 passed, 0 failed |
| Frontend tests | `npm test --workspace=frontend` | 146 passed, 0 failed; two non-failing invalid local-storage-path warnings |
| Read-only source audit | `rg` method inventory across backend and operational paths | Only list/read/metrics/log Kubernetes calls observed; no mutation call found |
| Safe-error coverage | Backend tests and source inspection | Known Kubernetes exception/header/body dumps sanitized; generic message pass-through remains |
| Malformed WebSocket probe | Isolated raw upgrade with malformed encoded segment | `uncaught_URIError`; confirms SEC-001 |
| Origin probe | Isolated `/api/logs` handshake with arbitrary Origin | Accepted; confirms SEC-002 |
| WebSocket payload baseline | `ws` source and `logsWebSocket.ts` | Library default is 100 MiB; application check is later |
| Whitespace | `git diff --check` | Passed before report edit |
| Build/package | No build or `package:*` command | Not run to avoid generated/release artifact mutation |
| Live Kubernetes | No cluster request or context switch | Unavailable by design; no kubeconfig or cluster data collected |
| Electron/browser | No launch or browser automation | Unavailable; desktop has no test script |
| Install/remediation | No `npm install`, `npm ci`, `npm update`, or audit fix | Intentionally not run |

## Unresolved questions and limitations

- Whether the product wants to treat browser pages as outside the accepted local-process trust model must be decided before resolving SEC-002.
- A clean packaging run is still required to verify the effective Electron resource graph and the staged backend runtime, but it was prohibited for this audit because it changes generated/release outputs.
- No live cluster authorization, real log stream, exec-authenticator invocation, or packaged application launch was performed.
- The audit does not claim that the moderate `ip-address` advisory is exploitable through the current UI; it records the dependency path and limits of the source review.
- Existing user changes were not reviewed or altered because they are outside the permitted security-report edit boundary.

## Change boundary confirmation

Only `docs/SECURITY-AUDIT.md` was created by this audit. No product source, test, package manifest, lockfile, generated artifact, release artifact, kubeconfig, Kubernetes context, or Kubernetes resource was changed. No dependency upgrade, automatic remediation, packaging, publishing, commit, or branch operation was performed.

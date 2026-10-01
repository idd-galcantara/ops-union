# Implementation Tasks - ops-union v1.10.0 security hardening

These tasks address SEC-001 through SEC-011 from the 2026-10-01 audit. They authorize focused
implementation and validation work only. They do not authorize Kubernetes mutation, credential or
kubeconfig collection, unrelated refactors, release publication, or changes to historical specs.
Completed history must be preserved and evidence must be added only after the task is executed.

## Ownership and sequencing

- `@ops-union-architecture-review` owns boundary mapping, contract review, and final read-only and
  residual-risk review.
- `@ops-union-backend` owns WebSocket, REST, resource, lifecycle, history, and error behavior.
- `@ops-union-frontend` owns bounded Workspace import and stale context state behavior.
- `@ops-union-integration-qa` owns cross-boundary, browser/Electron, package, and release-gate
  validation.
- `repository maintainer` owns dependency decisions, CI/release administration, and the final
  audit-document update after implementation evidence exists.

## Phase 0 - Baseline and contracts

- [x] 1.10.0-SEC-1 Capture the security remediation baseline and implementation contracts.
  - Inventory the current WebSocket upgrade paths, Origins, desktop bootstrap/preload capabilities,
    REST fan-out paths, history lifecycle, error mapper call sites, Workspace import boundary,
    context request/revision state, runtime staging, release workflow, and Electron navigation/CSP
    surfaces.
  - Record the selected numeric budgets, desktop/development handshake modes, shutdown timeout,
    dependency treatment decision criteria, CSP sources, and package inspection rules before edits.
  - Preserve existing worktree changes and confirm the implementation scope is limited to the mapped
    findings.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Requirements: SEC-BASE.1-SEC-BASE.4, SEC-001.1-SEC-011.5
  - _Validation: source/contract inventory, current focused test inventory, and a recorded baseline
    with no kubeconfig or cluster data.
  - _Definition of done: each finding has a concrete control, owner, test surface, and dependency
    path for the later tasks.

## Phase 1 - Backend WebSocket and resource boundaries

- [x] 1.10.0-SEC-2 Harden URI decoding and WebSocket transport limits.
  - Add local decode failure handling for every legacy and aggregate path segment, bounded decoded
    identifier validation, safe rejection, and recovery of the HTTP health endpoint.
  - Configure `WebSocketServer` `maxPayload` at or below the selected 512 KiB protocol ceiling and
    retain application schema/session/generation checks.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-001.1-SEC-001.4, SEC-005.1-SEC-005.3
  - _Validation: malformed legacy/aggregate upgrade tests followed by health; maxPayload assertion;
    oversized-frame integration test without recording the payload.
  - _Definition of done: malformed or oversized input cannot throw through the server or force
    application-level buffering above the configured transport ceiling.

- [x] 1.10.0-SEC-3 Enforce WebSocket Origin and capability policy.
  - Implement the selected desktop Origin plus per-process capability contract and explicit web
    development allowlist for both aggregate and legacy sockets.
  - Keep capability material in memory, out of URLs/logs/persistence/errors, and preserve the narrow
    preload boundary; reject arbitrary origins, missing/invalid capability, and malformed handshakes.
  - _Owner: @ops-union-backend and @ops-union-frontend
  - _Copilot agents: @ops-union-backend, @ops-union-frontend
  - _Dependencies: 1.10.0-SEC-1, 1.10.0-SEC-2
  - _Requirements: SEC-002.1-SEC-002.5
  - _Validation: accepted desktop/development handshake tests; rejected arbitrary Origin,
    missing/invalid capability, and both path-family cases; renderer log connection smoke.
  - _Definition of done: the intended desktop and configured development clients connect while an
    arbitrary webpage cannot open a log socket.

- [x] 1.10.0-SEC-4 Cap REST targets and bound Kubernetes read concurrency.
  - Add schema limits for contexts/clusters, targets, identifiers, and relevant request collections;
    deduplicate targets before work begins.
  - Replace unbounded namespace/pod fan-out with a shared bounded scheduler, preserving independent
    failures and safe capacity responses. Record the chosen limits in tests and safe error contracts.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-003.1-SEC-003.4
  - _Validation: over-cardinality/overlength validator tests, deduplication tests, and instrumented
    service tests proving no more than eight active operations per request.
  - _Definition of done: accepted REST requests have bounded parsing, client creation, fan-out, and
    response aggregation without losing per-target failure isolation.

## Phase 2 - Lifecycle, dependency, and error remediation

- [x] 1.10.0-SEC-5 Make backend and Electron shutdown deterministic.
  - Add one idempotent backend shutdown coordinator for signals, HTTP server, WebSockets, history
    sessions, history manager, and owned temporary data.
  - Add bounded Main child-exit waiting with escalation, and startup orphan cleanup constrained to
    the private application history root.
  - _Owner: @ops-union-backend and @ops-union-integration-qa
  - _Copilot agents: @ops-union-backend, @ops-union-integration-qa
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-004.1-SEC-004.5
  - _Validation: controlled temp-root signal/close tests, active-history cleanup, repeated-shutdown
    tests, startup orphan fixture, child timeout/escalation scenario, and no-path-traversal review.
  - _Definition of done: graceful shutdown finalizes owned history and exits within the documented
    timeout; crash remnants are cleaned only by the bounded startup policy.

- [x] 1.10.0-SEC-6 Resolve the WebSocket payload and history lifecycle integration.
  - Verify the configured transport ceiling, application frame ceiling, history session limits, and
    shutdown cancellation compose without duplicate cleanup, leaked sockets, or inconsistent terminal
    events.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Dependencies: 1.10.0-SEC-2, 1.10.0-SEC-5
  - _Requirements: SEC-004.1-SEC-004.3, SEC-005.1-SEC-005.3
  - _Validation: backend history/WebSocket regression suite, concurrent close/cancel/oversize cases,
    bounded-memory evidence, and backend typecheck/build.
  - _Definition of done: transport rejection and shutdown preserve existing history protocol
    semantics and cleanup guarantees.

- [x] 1.10.0-SEC-7 Review and remediate the moderate `ip-address` advisory.
  - Trace the production dependency chain, select a compatible fixed upgrade or reviewed override,
    and update only the required dependency material during implementation.
  - Run compatibility tests before accepting the change. If no compatible fix is supportable, record
    the owner, compensating loopback/TLS/read-only controls, review date, and explicit release block
    or approved time-bounded exception.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-006.1-SEC-006.4
  - _Validation: `npm audit --omit=dev`, `npm explain ip-address`, lockfile diff review, workspace
    typechecks, backend tests, and package smoke or a documented approved residual-risk record.
  - _Definition of done: the advisory is removed through a reviewed graph change or has an explicit,
    time-bounded, evidence-backed exception; an unreviewed moderate result remains a blocker.

- [x] 1.10.0-SEC-8 Centralize generic backend error redaction.
  - Replace arbitrary generic `Error.message` pass-through with the safe operational category/error
    contract and route details, metrics, workload, pod, namespace, and log failures through it.
  - Cover nested causes and response-shaped errors without serializing paths, URLs, headers, bodies,
    tokens, certificates, kubeconfig data, or stack traces.
  - _Owner: @ops-union-backend
  - _Copilot agent: @ops-union-backend
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-007.1-SEC-007.4
  - _Validation: injected path/URL/header/body/nested-error cases through every listed service path;
    backend tests, typecheck, and source review for remaining raw message responses.
  - _Definition of done: unknown upstream errors have bounded deterministic output and no sensitive
    diagnostic substring reaches REST/WebSocket renderer responses.

## Phase 3 - Frontend state and import boundaries

- [x] 1.10.0-SEC-9 Bound Workspace imports and guard context responses.
  - Reject oversized Workspace files before full text parsing; add documented collection, field, and
    parser-budget limits while preserving valid formats and atomic catalog state on failure.
  - Add context request identity plus configuration-revision guards so stale responses cannot overwrite
    the authoritative context list after replacement, reset, or a newer request.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.10.0-SEC-1
  - _Requirements: SEC-008.1-SEC-008.4, SEC-009.1-SEC-009.4
  - _Validation: large-file pre-read tests, boundary-size valid imports, oversized collection/field
    tests, malformed JSON no-state-change tests, deferred stale-response tests, frontend typecheck,
    and frontend test suite.
  - _Definition of done: import resource use is bounded and a late context response cannot replace
    state established by the current configuration or request.

## Phase 4 - Packaging and Electron defense in depth

- [x] 1.10.0-SEC-10 Make dependency staging and release gates reproducible.
  - Replace fresh semver-range runtime staging with a clean-install process derived from reviewed
    lockfile material and record the staged dependency manifest.
  - Add CI gates for clean install, production audit, backend/frontend/desktop typechecks, tests,
    builds, package preparation, dependency comparison, artifact inspection, and upload blocking.
  - Inspect final packages for unexpected source, kubeconfig, credentials, certificates, keys, tokens,
    and raw audit data while retaining signing/checksum requirements.
  - _Owner: repository maintainer and @ops-union-integration-qa
  - _Copilot agents: repository maintainer, @ops-union-integration-qa
  - _Dependencies: 1.10.0-SEC-7, 1.10.0-SEC-8, 1.10.0-SEC-9
  - _Requirements: SEC-010.1-SEC-010.5
  - _Validation: clean CI/package run, `npm ci`, `npm audit --omit=dev`, all workspace tests and
    typechecks/builds, staged-versus-lockfile version comparison, normalized resource inspection,
    and a deliberate failing-gate check that prevents upload.
  - _Definition of done: identical commit/lockfile inputs produce equivalent dependency/resource
    evidence and no package is uploaded after a required gate fails.

- [x] 1.10.0-SEC-11 Add CSP and Electron navigation defense in depth.
  - Add strict packaged-resource CSP, bundle or explicitly allow required fonts, and deny external,
    file/data/javascript/unexpected loopback navigation through `will-navigate`.
  - Preserve sandbox, context isolation, disabled Node integration, denied new windows, preload
    narrowing, and loopback backend routing.
  - _Owner: @ops-union-frontend and @ops-union-integration-qa
  - _Copilot agents: @ops-union-frontend, @ops-union-integration-qa
  - _Dependencies: 1.10.0-SEC-3, 1.10.0-SEC-10
  - _Requirements: SEC-011.1-SEC-011.5
  - _Validation: Electron smoke for initial URL, external link/window/navigation attempts, CSP
    violation/resource checks, desktop typecheck/build, and no-sensitive-URL review.
  - _Definition of done: required local renderer resources load, all denied navigation classes stay
    in the approved window, and remote executable content is blocked.

## Phase 5 - Cross-cutting validation and audit convergence

- [x] 1.10.0-SEC-12 Review all findings and execute focused/full validation.
  - Review the final source graph, read-only Kubernetes method inventory, loopback binding, preload
    capabilities, safe errors, resource limits, history permissions/cleanup, dependency graph,
    package contents, CSP, navigation policy, and preservation of unrelated worktree changes.
  - Run focused suites after any repair, then all required workspace tests, typechecks, builds,
    `git diff --check`, dependency gates, package inspection, and available browser/Electron smoke.
  - _Owner: @ops-union-architecture-review and @ops-union-integration-qa
  - _Copilot agents: @ops-union-architecture-review, @ops-union-integration-qa
  - _Dependencies: 1.10.0-SEC-2, 1.10.0-SEC-3, 1.10.0-SEC-4, 1.10.0-SEC-5, 1.10.0-SEC-6,
    1.10.0-SEC-7, 1.10.0-SEC-8, 1.10.0-SEC-9, 1.10.0-SEC-10, 1.10.0-SEC-11
  - _Requirements: SEC-BASE.1-SEC-BASE.4, SEC-001.1-SEC-011.5, Definition of done
  - _Validation: focused backend/frontend/desktop tests; `npm ci`; `npm audit --omit=dev`;
    `npm explain ip-address`; `npm test --workspace=backend`; `npm test --workspace=frontend`;
    `npm run typecheck`; `npm run build`; package/artifact inspection; available Electron/browser
    smoke; `git diff --check`; and a permitted-path review.
  - _Definition of done: each finding has pass/fail/unavailable evidence, residual risks are
    explicitly named, and no source boundary or release gate is unreviewed.

- [x] 1.10.0-SEC-13 Update the security audit document from validated evidence.
  - After 1.10.0-SEC-12 passes or records approved residual limitations, update only
    `docs/SECURITY-AUDIT.md` for SEC-001 through SEC-011 with current statuses, exact commands and
    scenario evidence, changed controls, residual risks, and limitations/unavailable checks.
  - Preserve the audit scope and accepted single-user localhost/read-only assumptions. Do not mark a
    finding fixed based on a proposed task, source inspection alone where runtime evidence is required,
    or a package build that was not actually run.
  - Reconcile the evidence matrix, prioritized backlog, unresolved questions, and change-boundary
    confirmation so they describe the validated current state. Include any remaining `ip-address`
    exception and any unavailable Electron/live-cluster/package checks with owners and next review.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.10.0-SEC-12
  - _Requirements: SEC-BASE.3-SEC-BASE.4, SEC-006.3, Definition of done
  - _Validation: document review against task evidence, SEC-001..SEC-011 coverage check, `git diff
    --check`, and confirmation that the audit update occurred only after implementation validation.
  - _Definition of done: `docs/SECURITY-AUDIT.md` contains current status, evidence, residual risk,
    limitations, and no unsupported completion claim for any finding.

## Definition of done

- All implementation tasks have actual evidence or remain explicitly unchecked with a reason.
- SEC-001 through SEC-011 are each mapped to a requirement, owner, focused validation, and current
  audit status.
- The single-user localhost/read-only Kubernetes model and narrow renderer boundary remain intact.
- Dependency and packaging gates are reproducible, and package inspection does not expose sensitive
  material.
- The final audit-document task is completed only after fixes are validated and records limitations
  rather than hiding unavailable checks.

## Validation record

Implementation and validation evidence recorded 2026-10-01:

- Source review preserved the localhost-only, single-user, read-only Kubernetes boundary and the
  narrow preload bridge. No Kubernetes mutation method, remote listener, credential response, or
  unrestricted IPC bridge was added.
- `npm ci --ignore-scripts`, `npm audit --omit=dev`, and `npm explain ip-address` passed. The
  production graph resolves `ip-address@10.7.2` through the Kubernetes client SOCKS chain.
- `npm run typecheck`, `npm test --workspace=backend`, `npm test --workspace=frontend`, and
  `npm run build` passed. Current focused totals are backend `104/104` and frontend `148/148`.
- Backend tests cover malformed URI recovery, origin/capability rejection and acceptance, 512 KiB
  transport configuration/application frame limits, caps, deduplication, bounded concurrency, safe
  errors, history cleanup, and HTTP close behavior. Frontend tests cover import budgets and deferred
  context revision/request guards.
- `node scripts/prepare-desktop-runtime.mjs` passed and staged direct production dependencies were
  compared to root-lock versions. `node scripts/inspect-package.mjs` passed for staged runtime,
  built outputs, and existing unpacked package roots.
- CSP, navigation, sandbox, context isolation, disabled Node integration, preload scope, package
  paths, and read-only Kubernetes method inventory were source-reviewed. Google font origins are
  explicitly listed in CSP; unexpected loopback paths and credential-bearing navigation are denied.
- Electron launch/navigation/CSP smoke, live Kubernetes authorization, real cluster log streaming,
  and final installer archive inspection were unavailable in this environment. These remain release
  validation limitations; no success claim is made for them.
- The final `git diff --check` passed before documentation convergence. No commit, tag, publication,
  Kubernetes request, kubeconfig inspection, or release upload was performed.

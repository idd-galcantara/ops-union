# Requirements - ops-union v1.10.0 security hardening

## Status and scope

Version 1.10.0 defines the remediation and validation scope for every open or accepted-follow-up
finding in `docs/SECURITY-AUDIT.md` at the v1.9.0 baseline dated 2026-10-01. It covers SEC-001
through SEC-011 and SHALL preserve the product boundary: a single-user, localhost-bound, read-only
Kubernetes inspection application. The backend remains the only Kubernetes client, the renderer
continues to use REST/WebSocket plus the narrow preload bridge, and no Kubernetes mutation or
multi-user authorization model is introduced.

This specification authorizes implementation work in backend, frontend, desktop, CI/release, and
dependency configuration. Creating this specification does not modify product source, tests,
package manifests or lockfiles, release artifacts, or `docs/SECURITY-AUDIT.md`.

## User stories

- As a local operator, I can use the desktop application after malformed, oversized, stale, or
  failed requests without losing the backend process or receiving unsafe diagnostic data.
- As a single-user desktop operator, I can view logs only through the intended renderer boundary,
  while an arbitrary browser origin cannot open the local log socket.
- As a maintainer, I can bound REST, WebSocket, import, concurrency, history, and shutdown resource
  use with deterministic behavior and focused regression tests.
- As a release maintainer, I can reproduce the packaged backend dependency graph from reviewed
  lockfile material and block publication when security or artifact gates fail.
- As a reviewer, I can trace every SEC finding to an implementation task and current validation
  evidence, including residual risk and unavailable environment checks.

## Requirements

### SEC-BASE - Preserve the product boundary

1. The implementation SHALL retain loopback-only backend binding, the single-user local trust model,
   read-only Kubernetes operations, the existing backend-as-Kubernetes-client boundary, and the
   narrow preload capability surface.
2. No remediation SHALL add Kubernetes mutation methods, remote listening, multi-user accounts,
   credential return paths, raw kubeconfig output, or a new unrestricted IPC bridge.
3. Every changed error, limit, lifecycle, dependency, packaging, or renderer behavior SHALL have a
   focused regression test or a documented unavailable validation with residual risk.
4. Existing valid REST, WebSocket, history, Workspace, context, desktop startup, and packaging
   workflows SHALL remain compatible unless a requirement below explicitly tightens unsafe input.

**Acceptance criteria:** A source and contract review finds no new Kubernetes write, remote listener,
credential exposure, or widened renderer capability, and all SEC-001 through SEC-011 requirements
have linked tasks and evidence expectations.

### SEC-001 - Malformed WebSocket URI handling

1. Each legacy and aggregate WebSocket path segment decoded from a request URI SHALL be decoded
   inside a local exception boundary.
2. Malformed percent-encoding, invalid UTF-8 decoding, invalid path shape, or overlong decoded
   identifiers SHALL produce a bounded safe HTTP/upgrade or WebSocket rejection and SHALL NOT escape
   the upgrade callback as an uncaught exception.
3. A rejected malformed upgrade SHALL leave the backend HTTP server and subsequent health requests
   operational.
4. The rejection SHALL not include the raw URI, credentials, headers, or decoded sensitive input.

**Acceptance criteria:** A test sends malformed encoded legacy and aggregate paths, observes a safe
rejection, then receives a successful health response from the same server process.

### SEC-002 - WebSocket Origin and capability policy

1. The backend SHALL enforce an explicit WebSocket handshake policy for aggregate and legacy log
   paths; accepting an arbitrary browser `Origin` SHALL not be the default.
2. Desktop connections SHALL require the expected loopback renderer Origin and a per-process,
   non-persistent WebSocket capability delivered through the existing trusted desktop boundary or
   an equally narrow bootstrap contract. The capability SHALL not appear in logs, API responses,
   persisted files, or error messages.
3. Web development connections SHALL use an explicit configured allowlist of loopback development
   origins and the same capability policy, or an explicitly documented local-development mode with
   equivalent bounded protection. Wildcard origins and ambient credential acceptance SHALL be
   prohibited.
4. The policy SHALL reject disallowed Origin, missing capability, invalid capability, and malformed
   handshake cases without exposing whether a source tuple or cluster data exists.
5. The policy SHALL preserve the single-user localhost model and SHALL not become a general remote
   authentication system.

**Acceptance criteria:** Focused tests prove accepted desktop/development handshakes, rejected
arbitrary origins, rejected missing/invalid capabilities, coverage for both socket path families,
and a successful renderer log connection under the selected policy.

### SEC-003 - REST target/resource caps and bounded concurrency

1. REST request validators SHALL cap cluster/context/namespace/pod target cardinality and identifier
   lengths before Kubernetes client creation or fan-out. Duplicate targets SHALL be removed before
   scheduling work.
2. The implementation SHALL define and document the selected caps, including a default maximum of
   32 clusters/contexts, 256 aggregate targets, and 128 characters per Kubernetes identifier unless
   a lower existing protocol limit applies.
3. Namespace and pod discovery/query fan-out SHALL use a bounded scheduler. The default maximum
   active Kubernetes read operation per request SHALL be 8, and excess work SHALL queue or return a
   safe capacity validation response rather than creating unbounded `Promise.allSettled` work.
4. Bounded responses SHALL preserve per-target failure isolation and safe error mapping for accepted
   requests.

**Acceptance criteria:** Validator tests reject over-cardinality and overlong identifiers before
client work; service tests prove deduplication and that active lister/query operations never exceed
the configured concurrency ceiling.

### SEC-004 - Deterministic backend shutdown and history cleanup

1. Backend signal handling SHALL initiate one idempotent shutdown sequence that stops accepting new
   HTTP/WebSocket work, closes active WebSocket/history sessions, closes the HTTP server, and closes
   the history manager before process exit.
2. Graceful shutdown SHALL remove or finalize owned temporary history data according to the existing
   retention contract, with no one-hour delay for data that can be deterministically closed during a
   normal signal path.
3. Ungraceful remnants SHALL be identified and cleaned on the next startup within the documented
   orphan policy, without deleting unrelated files or following attacker-controlled paths.
4. Electron Main SHALL wait for backend exit only for a bounded interval, then escalate termination
   and complete window shutdown with a safe failure record.
5. Repeated signals, close events, and cleanup calls SHALL be idempotent and SHALL not hang the
   desktop process.

**Acceptance criteria:** Controlled tests cover SIGTERM/close, active history sessions, repeated
shutdown, startup orphan cleanup, child-exit timeout/escalation, and verification that owned
history directories are removed or finalized as specified.

### SEC-005 - WebSocket transport maxPayload

1. Every `WebSocketServer` instance handling log traffic SHALL set an explicit `maxPayload` equal to
   or below the application protocol ceiling; the selected default SHALL be 512 KiB unless a smaller
   compatible limit is required.
2. Application frame validation SHALL remain in place after transport validation for schema, source,
   session, generation, and semantic limits.
3. Oversized frames SHALL be rejected by the WebSocket library before unbounded application message
   assembly, with bounded close/error behavior and no payload recording.

**Acceptance criteria:** Configuration and integration tests assert the library ceiling and prove an
oversized frame is rejected without allocating or logging the full payload in application state.

### SEC-006 - Moderate `ip-address` advisory

1. The dependency owner SHALL review the production path
   `@kubernetes/client-node -> socks-proxy-agent -> socks -> ip-address` and select a compatible
   fixed upgrade, reviewed override, or supported dependency-chain replacement.
2. No forced automatic audit fix SHALL be used without lockfile, Kubernetes-client, proxy behavior,
   and type/test review.
3. If the advisory cannot be removed without an incompatible or unreviewed change, the release
   SHALL record a time-bounded accepted risk with owner, affected path, exploitability rationale,
   compensating controls, next review date, and a clean audit result for all higher severities.
4. The chosen treatment SHALL not weaken loopback binding, TLS verification, or read-only behavior.

**Acceptance criteria:** `npm audit --omit=dev`, `npm explain ip-address`, typechecks, backend tests,
and package smoke evidence show either removal of the advisory or the complete approved residual-risk
record; an unresolved unreviewed advisory blocks release completion.

### SEC-007 - Generic error redaction

1. Backend adapters SHALL map generic upstream/library exceptions to a bounded allowlist of safe
   operational categories rather than returning arbitrary `Error.message` text.
2. Safe errors SHALL exclude local paths, URLs, query strings, authorization/header material,
   kubeconfig content, certificates, tokens, raw Kubernetes response bodies, and stack traces.
3. Details, metrics, workload summary, pod, namespace, and log failure paths SHALL use the same
   redaction contract, while retaining actionable status/category behavior for the renderer.
4. Redaction SHALL be deterministic and tested against path-, URL-, header-, body-, and nested-error
   shaped inputs.

**Acceptance criteria:** Injection tests through every listed backend path show only approved safe
text and status/category values, with no sensitive substring leakage.

### SEC-008 - Bounded Workspace import

1. Workspace import SHALL reject files larger than a documented byte limit before full text parsing;
   the default limit SHALL be 2 MiB unless platform APIs require a lower safe threshold.
2. Parsed documents SHALL enforce documented limits for Workspace count, preset count, targets per
   Workspace, target/context/namespace field lengths, and nested collection depth or equivalent
   parser budget.
3. Invalid or oversized imports SHALL leave the current catalog and operational state unchanged,
   provide a safe actionable error, and avoid filesystem paths or file contents in the message.
4. Existing valid Workspace and preset formats SHALL remain importable within the new limits.

**Acceptance criteria:** Frontend tests cover pre-read large-file rejection, oversized collections,
long fields, malformed JSON, valid boundary-size imports, and atomic no-state-change failure behavior.

### SEC-009 - Stale context response guards

1. Context loading SHALL assign a request identity and capture the active configuration revision at
   start.
2. A response SHALL update context state only when its request identity and configuration revision
   still match the current authoritative state.
3. Configuration replacement, reset, or a newer context request SHALL invalidate older responses and
   preserve the newest context list, loading state, and error semantics.
4. The guard SHALL not block a valid current response or introduce a second context state store.

**Acceptance criteria:** A deferred old response resolving after kubeconfig replacement, reset, and a
newer request cannot overwrite the authoritative context list; current responses still commit.

### SEC-010 - Reproducible packaging and dependency gates

1. Desktop backend runtime staging SHALL resolve production dependencies from reviewed lockfile
   material using a reproducible clean-install strategy; a fresh semver-range install with
   `--no-package-lock` SHALL not be the release source of truth.
2. The release workflow SHALL gate packaging on clean install, dependency audit, workspace
   typechecks, backend/frontend tests, builds, and packaged-content inspection before upload.
3. Artifact inspection SHALL verify the expected runtime dependency versions against the lockfile,
   reject kubeconfig names/content, credentials, certificates, keys, tokens, raw audit data, and
   unintended source material, and retain signing/checksum requirements.
4. Repeated clean builds from the same commit and lockfile SHALL produce equivalent dependency
   manifests and equivalent inspected resource sets, subject only to documented archive metadata.
5. A failed dependency, test, typecheck, build, or artifact-inspection gate SHALL block publication.

**Acceptance criteria:** A clean CI/package scenario records all gates, compares staged runtime
versions to lockfile resolution, inspects final package contents without secrets, and demonstrates
that a gate failure prevents artifact upload or release.

### SEC-011 - Electron CSP and navigation defense in depth

1. Packaged renderer content SHALL have a strict CSP that permits only required local scripts,
   styles, fonts, WebSocket/API connections, and images; remote script execution, object/plugin
   content, and unapproved framing SHALL be disallowed.
2. The implementation SHALL bundle required fonts or document a narrowly scoped explicit font source;
   arbitrary external font/script origins SHALL not be permitted by a broad CSP.
3. Electron navigation SHALL allow only the expected loopback renderer URL and approved in-app routes.
   `will-navigate` SHALL deny external, file, data, JavaScript, and unexpected loopback navigations.
4. Existing `setWindowOpenHandler` denial, sandbox, context isolation, disabled Node integration,
   preload narrowing, and loopback backend routing SHALL remain enabled.
5. CSP and navigation violations SHALL fail safely without exposing sensitive URLs, tokens, or page
   content, and smoke tests SHALL cover initial load, attempted external navigation, external links,
   and CSP enforcement.

**Acceptance criteria:** Desktop/frontend smoke proves the expected initial URL loads, external and
unexpected navigations are denied, required app resources load under CSP, and no remote executable
content is allowed.

## Finding coverage matrix

| Audit finding | Requirement(s) | Implementation task(s) |
| --- | --- | --- |
| SEC-001 malformed WebSocket URI | SEC-001 | 1.10.0-SEC-2, 1.10.0-SEC-11 |
| SEC-002 Origin/capability policy | SEC-002 | 1.10.0-SEC-3, 1.10.0-SEC-11 |
| SEC-003 REST caps/concurrency | SEC-003 | 1.10.0-SEC-4, 1.10.0-SEC-12 |
| SEC-004 shutdown/history cleanup | SEC-004 | 1.10.0-SEC-5, 1.10.0-SEC-12 |
| SEC-005 WebSocket maxPayload | SEC-005 | 1.10.0-SEC-4, 1.10.0-SEC-6, 1.10.0-SEC-12 |
| SEC-006 `ip-address` advisory | SEC-006 | 1.10.0-SEC-7, 1.10.0-SEC-12 |
| SEC-007 generic error redaction | SEC-007 | 1.10.0-SEC-8, 1.10.0-SEC-12 |
| SEC-008 bounded Workspace import | SEC-008 | 1.10.0-SEC-9, 1.10.0-SEC-12 |
| SEC-009 stale context response guards | SEC-009 | 1.10.0-SEC-9, 1.10.0-SEC-12 |
| SEC-010 reproducible packaging/gates | SEC-010 | 1.10.0-SEC-10, 1.10.0-SEC-12 |
| SEC-011 CSP/navigation defense in depth | SEC-011 | 1.10.0-SEC-11, 1.10.0-SEC-12 |

## Out of scope

- Multi-user authentication, remote backend access, or a change to the accepted local-process trust
  model.
- Kubernetes mutations, cluster writes, credential inspection, secret copying, or live cluster data
  collection in tests or evidence.
- Unrelated UI redesign, persistence-format migration, new product features, or broad dependency
  upgrades unrelated to SEC-006 and SEC-010.
- Updating `docs/SECURITY-AUDIT.md` during implementation; that update is reserved for the final
  validation task and SHALL occur only after fixes and evidence are actually validated.
- Publishing, committing, tagging, or modifying release artifacts as part of spec creation.

## Definition of done

- Each SEC-001 through SEC-011 requirement has an implemented owner, focused tests, and recorded
  validation evidence, or an explicitly approved residual-risk/limitation record.
- The read-only localhost/single-user boundary is unchanged and reviewed.
- Automated and available integration/package checks pass; unavailable checks are named with reason
  and residual risk.
- The final validation task updates `docs/SECURITY-AUDIT.md` with current statuses, evidence,
  residual risks, and limitations only after the implementation evidence is complete.

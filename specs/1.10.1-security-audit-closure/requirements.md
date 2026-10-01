# Requirements - ops-union v1.10.1 security audit closure

## Status and scope

Version 1.10.1 is a patch-level validation and evidence-convergence release after
`specs/1.10.0-security-hardening`. It closes the remaining executable release-validation gaps
without changing product behavior or source code as part of specification creation. The scope is
limited to Electron/runtime smoke, spawned-backend lifecycle evidence, package/archive and CI gate
validation, and reconciliation of `docs/SECURITY-AUDIT.md`.

The product boundary remains a single-user, loopback-bound, read-only Kubernetes inspection
application. The backend remains the only Kubernetes client, the renderer uses REST/WebSocket and
the narrow preload bridge, and no Kubernetes mutation, live authorization review, kubeconfig
inspection, or exec-authenticator execution is required or authorized by this specification.

This specification does not modify source code, tests, package manifests, lockfiles, release
artifacts, `docs/SECURITY-AUDIT.md`, or historical specifications. Validation may execute existing
commands and inspect existing or temporary outputs, but SHALL NOT publish, sign, replace, or commit
release artifacts.

## User stories

- As a desktop operator, I can verify that the packaged or locally built Electron application
  starts on the approved loopback renderer URL, loads required resources under CSP, and rejects
  navigation or window-opening attempts outside the application boundary.
- As a maintainer, I can verify that a real backend child responds to SIGTERM within the documented
  timing budget, cleans owned history data, and does not leave Electron waiting indefinitely when a
  child fails to exit.
- As a release maintainer, I can inspect platform-appropriate package archives and confirm that
  dependency, test, typecheck, build, and artifact gates run before upload, or record why a platform
  gate is unavailable.
- As an auditor, I can read one current SEC-001..SEC-011 status set with exact executable evidence,
  explicit unavailable checks, residual assumptions, and no ambiguous `open` finding.

## Requirements

### AUDIT-BASE - Preserve boundaries and evidence integrity

1. Validation SHALL preserve the v1.10.0 product boundary: loopback-only binding, single-user
   local trust, read-only Kubernetes operations, backend-only Kubernetes access, and the narrow
   preload surface.
2. Validation SHALL not inspect, print, upload, or persist kubeconfig contents, credentials,
   certificates, authorization headers, raw cluster responses, or full oversized payloads.
3. Every result SHALL identify the exact command or scenario, environment/platform, result, and
   limitation. A source review or proposed command SHALL not be represented as executable evidence.
4. Validation SHALL preserve unrelated worktree changes and SHALL not create a commit, tag,
   publication, release upload, package replacement, or Kubernetes operation.
5. Live Kubernetes access, kubeconfig inspection, cluster authorization checks, and
   exec-authenticator execution SHALL be recorded as `N/A by design` or an accepted assumption,
   because the application consumes supplied configuration and delegates authorization to
   Kubernetes. No requirement in this specification SHALL demand those checks.

**Acceptance criteria:** A boundary review confirms no Kubernetes mutation or new permission path,
and the evidence record distinguishes executed checks, unavailable platform checks, and the
explicitly out-of-scope Kubernetes checks.

### AUDIT-001 - Electron startup, renderer, CSP, and navigation smoke

1. A real Electron process SHALL be launched against the supported local build or packaged
   runtime where available. The smoke SHALL verify successful startup, the approved exact loopback
   renderer URL, and the expected backend health/readiness handoff without collecting credentials
   or cluster data.
2. The smoke SHALL verify that required renderer scripts, styles, fonts, images, API connections,
   and WebSocket capability bootstrap/load resources succeed under the effective CSP. CSP failures
   and resource failures SHALL be recorded by category and URL origin only, without sensitive query
   values or tokens.
3. The smoke SHALL attempt external, `file:`, `data:`, `javascript:`, credential-bearing, and
   unexpected loopback navigations. Each SHALL be rejected while the approved renderer remains
   active. Credential-bearing means a URL containing userinfo such as `https://user:pass@host`.
4. The smoke SHALL attempt a new-window or popup action and SHALL verify that Electron denies it.
5. The smoke SHALL exercise a renderer WebSocket log capability connection where the environment
   supports it, proving the intended capability/origin succeeds and an arbitrary origin or missing
   capability is rejected. No live Kubernetes stream is required; a controlled backend fixture or
   existing local protocol test MAY provide the WebSocket endpoint.
6. If Electron, a display/session, or a platform-specific runtime is unavailable, the task SHALL
   record the exact unavailable check, reason, substitute evidence, residual risk, and owner. It
   SHALL not call the unavailable smoke passed.

**Acceptance criteria:** The evidence names the startup URL, resource/CSP result, every navigation
class, new-window result, WebSocket capability result, and any platform limitation. SEC-002 and
SEC-011 can be marked `fixed/validated` only when their required available runtime evidence passes;
otherwise their status is `accepted-risk` or `N/A` with rationale and review ownership.

### AUDIT-002 - Spawned backend shutdown and history cleanup

1. A real spawned backend process SHALL be started in a controlled temporary application/history
   root with non-secret fixtures and no live cluster dependency.
2. The validation SHALL send SIGTERM, measure signal-to-exit time, and verify the documented
   bounded shutdown behavior: new work/upgrades stop, owned history sessions/resources close, and
   owned temporary history data is removed or finalized according to the implemented contract.
3. The validation SHALL repeat or otherwise prove idempotent shutdown behavior and SHALL verify
   that a subsequent health/request probe cannot be mistaken for a healthy running server after
   process exit.
4. Electron child shutdown SHALL be exercised with a real child where feasible, including the
   normal exit path and a non-exiting/stalled child fixture that proves timeout/escalation/failsafe
   behavior without hanging the test runner. The exact observed timing and escalation result SHALL
   be recorded.
5. A platform or harness that cannot safely spawn/terminate the required process SHALL be recorded
   as unavailable with a substitute controlled test result and residual risk.

**Acceptance criteria:** The record contains process IDs or non-sensitive run identifiers, exact
commands/scenarios, signal-to-exit and child-timeout measurements, history cleanup outcome, and no
unbounded wait. SEC-004 is `fixed/validated` only with the available real-process evidence or is
`accepted-risk` with an explicit limitation and owner.

### AUDIT-003 - Packaging, archive inspection, and CI gate evidence

1. For each available target platform, validation SHALL run the platform-appropriate packaging or
   archive inspection without replacing committed release artifacts. Inspection SHALL verify expected
   runtime resources, dependency manifests, archive paths, and absence of kubeconfig names/content,
   credentials, certificates, keys, tokens, raw audit data, unintended source material, and other
   sensitive development files.
2. The validation SHALL exercise the applicable clean-install, dependency-audit, workspace
   typecheck, backend/frontend/desktop test, build, runtime-staging, package-preparation, and
   package-inspection gates. It SHALL verify that a required gate failure blocks upload when that
   behavior can be tested safely without publishing.
3. Platform-specific signing, notarization, installer execution, archive inspection, or CI-host
   checks that cannot run in the current environment SHALL be listed by platform, command or job,
   reason unavailable, and residual release risk. Existing unpacked roots SHALL not be described as
   final installer/archive evidence.
4. The evidence SHALL distinguish local gate execution from source review of CI configuration and
   from an actual CI job. A source-reviewed upload block SHALL not be claimed as exercised CI
   behavior.

**Acceptance criteria:** Each supported/available platform has a pass or explicit unavailable
record, dependency/resource inspection results contain no sensitive contents, and SEC-010 is
`fixed/validated` only for exercised evidence or `accepted-risk`/`N/A` with a documented platform
boundary and release owner.

### AUDIT-004 - Current SEC status reconciliation

1. After AUDIT-001 through AUDIT-003 and the final boundary review produce executable evidence,
   `docs/SECURITY-AUDIT.md` SHALL be reconciled so the authoritative current SEC-001 through
   SEC-011 statuses contain no `open` finding.
2. Each current finding SHALL use one of `fixed/validated`, `accepted-risk`, or `N/A`, followed by
   explicit rationale, exact evidence or unavailable check, residual risk, owner, and next review
   condition where applicable.
3. SEC-001, SEC-003, SEC-005, SEC-006, SEC-007, SEC-008, and SEC-009 SHALL retain their current
   validated evidence unless a new validation result changes it. SEC-002, SEC-004, SEC-010, and
   SEC-011 SHALL be updated with the runtime, lifecycle, package, and Electron evidence from this
   specification or an explicit accepted-risk/unavailable rationale.
4. The stale v1.9.0 open-status material SHALL either be removed from the current findings flow or
   be placed beneath an unmistakable historical/superseded heading with language that it is not a
   current finding. Historical evidence SHALL not be silently rewritten as current evidence.
5. The document SHALL include residual assumptions for same-user loopback trust, Kubernetes
   kubeconfig/cluster authorization delegation, exec-authenticator behavior, Electron `userData`
   filesystem permissions, and operator-controlled log content.
6. The document SHALL state that live Kubernetes validation, kubeconfig inspection, cluster
   authorization checks, and exec-authenticator execution are `N/A by design` or accepted
   assumptions, and SHALL not imply that the application independently verifies Kubernetes
   authorization.
7. The document SHALL include a change-boundary confirmation covering source, tests, docs, package
   and release artifacts, Kubernetes operations, and unrelated worktree changes.

**Acceptance criteria:** A document review finds no current `open` status for SEC-001..SEC-011,
all unavailable checks and residual risks are explicit, historical open blocks cannot be mistaken
for current findings, and the update is traceable to executable evidence recorded before the edit.

## Finding coverage matrix

| Audit finding | Closure requirement | Evidence owner/task |
| --- | --- | --- |
| SEC-001 malformed WebSocket URI | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-002 Origin/capability policy | AUDIT-001, AUDIT-004 | @ops-union-integration-qa / 1.10.1-AUDIT-1, 5 |
| SEC-003 REST caps/concurrency | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-004 shutdown/history cleanup | AUDIT-002, AUDIT-004 | @ops-union-backend / 1.10.1-AUDIT-2, 5 |
| SEC-005 WebSocket maxPayload | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-006 dependency advisory | AUDIT-003, AUDIT-004 | @ops-union-integration-qa / 1.10.1-AUDIT-3, 5 |
| SEC-007 error redaction | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-008 Workspace import budgets | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-009 stale context guards | AUDIT-BASE, AUDIT-004 | @ops-union-architecture-review / 1.10.1-AUDIT-5 |
| SEC-010 packaging and CI gates | AUDIT-003, AUDIT-004 | @ops-union-integration-qa / 1.10.1-AUDIT-3, 5 |
| SEC-011 Electron CSP/navigation | AUDIT-001, AUDIT-004 | @ops-union-integration-qa / 1.10.1-AUDIT-1, 5 |

## Out of scope

- Live Kubernetes requests, live authorization or RBAC checks, cluster mutation, kubeconfig
  inspection, credential collection, context switching, and exec-authenticator execution.
- Product source changes, remediation implementation, unrelated refactors, dependency upgrades,
  release signing/notarization, publication, upload, commit, tag, or branch operations.
- Treating a source review, existing unpacked directory, or proposed CI command as a substitute for
  executable runtime or archive evidence.

## Definition of done

- Electron startup/navigation/CSP/new-window/WebSocket capability evidence is recorded for every
  available platform, with unavailable checks and residual risk named for the rest.
- A real spawned backend SIGTERM/history cleanup run and feasible Electron child-timeout run are
  recorded with timings and bounded outcomes.
- Platform/archive and CI gate evidence is recorded, or each unavailable platform check has an
  explicit reason and owner.
- `docs/SECURITY-AUDIT.md` is updated only after evidence exists, has no current `open` findings
  for SEC-001..SEC-011, clearly labels historical open material, and records all required residual
  assumptions and N/A-by-design Kubernetes checks.
- No source code, release artifact, Kubernetes resource, kubeconfig, commit, or publication is
  changed by this specification work.

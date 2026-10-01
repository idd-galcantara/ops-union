# Design - ops-union v1.10.1 security audit closure

## Release intent

v1.10.1 is an evidence-only patch release. It converts the remaining v1.10.0 audit limitations into
repeatable release validation and then converges the audit document. It does not add controls,
change APIs, or expand the Kubernetes or Electron trust boundaries. The authoritative sequence is:

```text
existing v1.10.0 controls
  -> real Electron/runtime smoke where available
  -> real spawned-backend lifecycle evidence
  -> package/archive and CI gate evidence
  -> boundary and residual-risk review
  -> current audit-document reconciliation
```

The final document edit is a reporting action, not validation. It is forbidden until executable
evidence has been captured and reviewed.

## Ownership boundaries

- `@ops-union-architecture-review` owns the baseline boundary review, evidence integrity, status
  mapping for already-validated findings, residual-assumption review, and final change-boundary
  confirmation.
- `@ops-union-backend` owns the real spawned-backend SIGTERM, history cleanup, timing, and
  idempotence validation, including controlled child-process fixtures where the backend lifecycle
  is involved.
- `@ops-union-frontend` owns renderer/CSP/resource and navigation contract support for Electron
  smoke and confirms the expected renderer URL/resource assumptions without changing source.
- `@ops-union-integration-qa` owns Electron smoke, WebSocket capability scenarios, package/archive
  inspection, CI gate execution evidence, platform availability matrix, and release acceptance
  evidence.
- `repository maintainer` owns the final edit to `docs/SECURITY-AUDIT.md` after the preceding tasks
  are evidenced and reviewed.

Every task records exact commands or scenarios, platform, result, unavailable checks, residual
risk, and evidence location. No task may mark Kubernetes access as required.

## Boundary and evidence decisions

| Area | Decision | Evidence rule |
| --- | --- | --- |
| Electron renderer | Exact approved loopback URL remains the only allowed initial/navigation destination | Real process smoke where available; source review is only a supplement |
| CSP/resources | Required local resources and explicitly allowed origins must load; unexpected origins must fail | Capture resource categories/origins without secrets |
| Navigation | External, `file:`, `data:`, `javascript:`, credential-bearing, and unexpected loopback URLs are denied | The original approved page must remain active after each attempt |
| New windows | Window-open attempts are denied | Verify through Electron event/result, not only source inspection |
| WebSocket capability | Intended renderer origin/capability succeeds; arbitrary origin or absent capability fails | Controlled local backend/fixture is acceptable; cluster data is not required |
| Backend shutdown | SIGTERM is measured against the implemented bounded shutdown contract | Use temporary private history root and non-secret fixtures |
| Child timeout | Normal exit and stalled child behavior are measured separately | A forced escalation must not hang the test runner |
| Package inspection | Archive/resource contents are compared to expected paths and lockfile/runtime policy | Existing unpacked roots are not final archive evidence |
| Kubernetes | No live validation or kubeconfig/exec-auth inspection | Record `N/A by design` or accepted assumption |

## Electron smoke contract

The smoke starts the real Electron runtime with a local backend fixture or supported built runtime.
It observes the dynamic backend port and exact renderer root produced by the application rather than
hardcoding a stale port. The initial page must remain at the approved loopback origin after each
navigation attempt.

The scenario order is:

1. Start the runtime and await backend readiness.
2. Assert the approved renderer URL, page readiness, required resource load, effective CSP, and
   renderer WebSocket capability bootstrap/connection where supported.
3. Attempt each denied navigation class independently: external HTTPS/HTTP, `file:`, `data:`,
   `javascript:`, credential-bearing URL, and unexpected loopback path/origin.
4. Attempt a new-window action and assert denial.
5. Assert that no denied URL becomes the active page and that no sensitive URL material appears in
   evidence.
6. Close the application and record process exit without treating close as a product change.

A browser-level WebSocket connection that lacks the desktop capability is a negative case. A
positive capability case may use the app's real bootstrap path or a controlled local test fixture.
No scenario requires a Kubernetes API response or a real log stream.

## Backend lifecycle contract

The lifecycle run uses a temporary application-owned history directory and a spawned backend with
an isolated port/configuration. It sends SIGTERM once, starts a monotonic timer, and records exit
status and elapsed time. It then inspects only the fixture directory shape and ownership-safe cleanup
result. A second shutdown request or repeated signal is used only to establish idempotence and must
not create a second cleanup failure.

The Electron child scenario has two branches:

- Normal child: the child exits and the parent observes bounded completion.
- Stalled child: the child ignores or delays termination, the configured timeout elapses, the
  escalation/failsafe path runs, and the parent completes within the documented upper bound.

Timing is evidence, not a new timeout contract. The implementation's configured values and observed
values are recorded together so a failed or unavailable run cannot be mistaken for a passing bound.

## Packaging and CI evidence model

The package matrix separates:

- local clean-install and security gates;
- local runtime staging and package/resource inspection;
- each available platform's archive or installer inspection; and
- CI configuration review versus an actually executed CI job.

The inspection uses normalized file paths, metadata, and dependency versions. It does not print
sensitive file contents. A platform may be marked unavailable only with the exact host limitation,
expected command/job, and residual risk. A pre-existing unpacked directory can support a supplemental
resource inspection but cannot close final archive inspection by itself.

The CI gate check uses a harmless failure injection or an existing dry-run/test fixture when
available. It must show that upload is blocked without publishing. A source-only review is recorded
separately as unexercised behavior.

## Audit-document status model

The current SEC-001..SEC-011 table is the sole authoritative status set. Permitted statuses are:

- `fixed/validated`: the applicable executable evidence passed;
- `accepted-risk`: a limitation or residual assumption remains, with rationale, owner, and review
  condition; or
- `N/A`: the check does not apply by design, with explicit product-boundary rationale.

The historical v1.9.0 blocks may remain only under an unmistakable `Superseded historical material`
heading. They must not use layout or wording that makes `Status: open` appear current. The final
reconciliation records exact commands/results, unavailable checks, residual risks, assumptions,
and the source/package/Kubernetes change boundary.

The following assumptions are retained explicitly: same-user loopback trust; authorization delegated
to the supplied kubeconfig and Kubernetes; operator-controlled exec-authenticator executable,
environment, and permissions; Electron `userData` filesystem ownership/permissions; and
operator-controlled log, event, annotation, label, and workload content.

## Validation and release acceptance

The release is accepted only when all available evidence tasks pass and every unavailable check has
an explicit status and owner. Release acceptance does not imply packaging publication or Kubernetes
access. The final audit update is the last task and is validated by a document review plus
`git diff --check`; it is not allowed to introduce a claim absent from the evidence record.

No source code is modified by this specification. Any implementation repair discovered during
validation belongs to a separate implementation change and must be validated before the final audit
update.

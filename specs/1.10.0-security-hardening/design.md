# Design - ops-union v1.10.0 security hardening

## Release intent

This release closes the complete security-audit backlog at the application boundaries that can be
hardened without changing the product model. It treats malformed input, browser-origin access,
resource pressure, lifecycle cleanup, dependency drift, renderer navigation, and diagnostic leakage
as separate controls with one final evidence pass. The application remains a single-user,
localhost-only, read-only Kubernetes viewer.

## Ownership and collaboration

- `@ops-union-architecture-review` owns the threat-boundary baseline, cross-cutting contract review,
  read-only operation audit, and residual-risk synthesis.
- `@ops-union-backend` owns WebSocket parsing/policy, REST validators and schedulers, WebSocket
  transport limits, shutdown/history lifecycle, and backend error redaction.
- `@ops-union-frontend` owns Workspace import budgets and stale context response guards.
- `@ops-union-integration-qa` owns browser/Electron smoke, package inspection, resource/lifecycle
  scenarios, accessibility-adjacent renderer checks, and evidence capture.
- `repository maintainer` owns dependency-chain decisions, CI/release gate changes, spec convergence,
  and the final audit-document update after implementation evidence exists.

Every implementation task names one of these exact owners and a matching `_Copilot agent:` line.
No task may claim completion from design intent alone. No implementation task may inspect or record
kubeconfig secrets, mutate Kubernetes, or overwrite a historical specification.

## Invariants and boundary decisions

| Boundary | Decision | Preserved invariant |
| --- | --- | --- |
| Kubernetes | Backend remains the only Kubernetes client and only list/read/metrics/log methods remain allowed | No cluster mutation or renderer Kubernetes client |
| Network | Backend remains bound to `127.0.0.1` | No remote listener or multi-user auth model |
| WebSocket | Origin is mandatory; desktop also uses a short-lived per-process capability carried through a narrow trusted bootstrap; development origins are explicit and configured | Local single-user operation remains usable without ambient browser access |
| Errors | Renderer receives safe categories/messages only | No paths, URLs, headers, tokens, kubeconfig, raw bodies, or stacks |
| Resource use | Application and transport limits are enforced before expensive fan-out or message assembly | Read-only does not mean unbounded |
| Lifecycle | One idempotent shutdown coordinator owns HTTP, WebSocket, history, and child-process stop | Graceful cleanup is deterministic and bounded |
| Delivery | Reviewed lockfile material is the package dependency source of truth | Package graph cannot silently drift from audited checkout |
| Electron | CSP and navigation allowlist supplement sandbox, isolation, disabled Node, and denied windows | Renderer content cannot expand the desktop boundary by default |

The capability is generated per backend process, held only in process memory, and never persisted or
printed. Its handshake representation SHALL use a header/subprotocol mechanism that avoids putting
secrets in URLs. The exact preload/bootstrap shape may follow existing desktop wiring, but it must
remain a single-purpose capability rather than a generic IPC or filesystem bridge.

## WebSocket request and handshake flow

```text
upgrade request
  -> validate upgrade path and bounded raw path shape
  -> decode each segment inside local try/catch
  -> validate Origin allowlist
  -> validate capability for the selected runtime mode
  -> create the matching aggregate/legacy socket
  -> ws maxPayload rejects oversized frames
  -> application schema/session/source/generation checks
```

Malformed paths, disallowed origins, invalid capabilities, and oversized frames terminate only the
request. They do not throw through the HTTP upgrade listener, expose source existence, or terminate
the server. Aggregate and legacy routes share policy helpers but retain their existing message and
session contracts.

The desktop renderer uses its expected dynamic loopback origin and receives the process capability
through a narrowly scoped trusted mechanism. Web development must configure explicit loopback origins
rather than relying on `*`; a development capability may be provisioned by the same bootstrap route.
Tests must exercise both modes and assert that an arbitrary `Origin` cannot connect.

## Resource limits and bounded scheduling

The initial default budgets are:

| Budget | Default | Enforcement point |
| --- | ---: | --- |
| contexts/clusters per REST request | 32 | request validator |
| aggregate targets per request | 256 | normalized target validator |
| Kubernetes identifier length | 128 characters | schema validator |
| active namespace/pod reads per request | 8 | shared bounded scheduler |
| WebSocket transport payload | 512 KiB | `WebSocketServer` `maxPayload` |
| Workspace import bytes | 2 MiB | file metadata before `file.text()` |

Workspace/preset collection and field limits must be explicit in the frontend contract and kept
consistent with the existing valid format. Recommended defaults are 100 Workspaces, 100 presets,
256 targets per Workspace, 128-character names/identifiers, 512-character descriptions, and a
bounded nesting depth of 8. The implementation may select lower values when existing protocol limits
are stricter, but it must record the chosen values in tests and user-facing safe errors.

The scheduler owns active-count accounting and release in `finally` paths. It preserves independent
failures and result ordering expected by callers. A request rejected for budget exhaustion is a
validation/capacity error, not a raw Promise or Kubernetes exception.

## Shutdown and history lifecycle

Backend `SIGTERM`/`SIGINT` handling enters a single promise shared by all shutdown callers. The
coordinator first stops accepting upgrades and new work, asks log sessions to cancel/close, closes
the history manager, then closes the HTTP server and resolves only when all owned resources have
settled. Cleanup is idempotent and has a bounded final timeout so a broken stream cannot hang exit.

Graceful session directories are finalized and removed according to the current history contract.
Startup orphan cleanup scans only the application-owned private history root, validates names and
age, and never follows arbitrary paths. The previous orphan grace behavior remains the fallback for
crash remnants, but normal signal shutdown does not depend on waiting for that grace period.

Electron Main uses a bounded wait for the child process, escalates once after the timeout, and then
completes window/app shutdown. Tests use injected child/server/history doubles and a controlled temp
root; no real cluster is needed.

## Error redaction contract

A shared backend safe-error mapper converts recognized Kubernetes statuses and system categories to
stable operational values. Unknown exceptions become a generic category such as `request-failed`
with a short fixed message. The mapper recursively handles `cause`, response body, request options,
and nested error structures without serializing them. Tests assert absence of path, URL, header,
credential, token, certificate, body, and stack-shaped substrings through pod details, metrics,
workload summaries, namespace, and log paths.

## Dependency and packaging design

SEC-006 is a deliberate dependency decision, not an automatic audit-fix exercise. The maintainer
first reviews compatible versions across the Kubernetes client and SOCKS chain. A fixed dependency
or reviewed override is preferred. If no compatible fix can be proven, the release candidate carries
a dated, owned, time-bounded residual-risk record and remains blocked until the required approval and
higher-severity audit gates are present.

SEC-010 changes staging so the backend production tree is derived from committed lockfile material.
A clean CI job runs `npm ci`, audits production dependencies, runs tests/typechecks/builds, prepares
the package, and inspects staged and final resources before upload. The inspection compares package
versions to lockfile resolution and scans for kubeconfig names, credential-like files, certificates,
keys, tokens, raw audit files, and unintended source paths. It does not print secret contents.
Reproducibility evidence records the commit, lockfile digest, dependency manifest, and normalized
resource list; archive timestamps or builder metadata are recorded as permitted differences.

## Electron renderer defense in depth

The renderer uses a strict CSP for packaged local resources. Required script/style/font/connect/image
sources are enumerated, `object-src` is disabled, framing is denied, and remote executable content
is not allowed. Required fonts should be bundled; if that is not compatible with the current design,
the exact font origin is explicitly listed rather than covered by a broad wildcard.

The main process registers `will-navigate` before loading content and allows only the expected
loopback renderer origin and approved internal paths. It denies external, `file:`, `data:`,
`javascript:`, and unexpected loopback navigations. Existing window-open denial, sandbox,
context isolation, disabled Node integration, preload narrowing, and backend loopback checks remain
in force. Smoke tests attempt each denied class and verify that the original window remains on the
approved page.

## Validation and evidence model

Each task records commands, test names/scenarios, pass/fail status, environment limitations, and
residual risk in `tasks.md` after execution. Evidence must not include kubeconfig content, tokens,
certificates, authorization headers, raw cluster responses, or full oversized payloads.

Required automated evidence includes focused backend/frontend/desktop tests where available,
workspace typechecks, relevant builds, `npm ci`, `npm audit --omit=dev`, `npm explain ip-address`,
`git diff --check`, and a permitted-path review. Required integration evidence includes malformed
upgrade recovery, Origin/capability acceptance/rejection, bounded concurrency, deterministic
shutdown/history cleanup, package inspection, and Electron navigation/CSP smoke. Live cluster checks
are optional and remain read-only; unavailable browser, Electron, or packaging checks must be
reported as unavailable rather than implied as passed.

The final task is intentionally separate from implementation. It can be completed only after all
fixes have current evidence. It then updates `docs/SECURITY-AUDIT.md` for SEC-001 through SEC-011
with current status, exact evidence, residual risks, and limitations. A spec-only creation or a
proposed command is never sufficient evidence for that update.

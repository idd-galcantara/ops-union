# Implementation Tasks - ops-union v1.10.1 security audit closure

These tasks define validation and audit convergence after v1.10.0. They do not authorize source
changes, Kubernetes access, release publication, artifact replacement, commit, or modification of
historical specifications. Completed history in v1.10.0 remains unchanged. Tasks are initially
unchecked; evidence must be appended only after the named owner executes the validation.

## Ownership and sequencing

- `@ops-union-architecture-review` owns boundary, contract, evidence, and residual-risk review.
- `@ops-union-backend` owns real backend process and history lifecycle validation.
- `@ops-union-frontend` owns renderer contract support for Electron smoke.
- `@ops-union-integration-qa` owns Electron, packaging, archive, CI, and release-scope validation.
- `repository maintainer` owns the final audit-document edit after evidence exists.

## Phase 1 - Baseline and executable evidence contracts

- [x] 1.10.1-AUDIT-1 Establish the validation matrix and preserve the boundary.
  - Review the current v1.10.0 requirements/design/tasks and `docs/SECURITY-AUDIT.md` current
    findings plus superseded blocks.
  - Record available OS/display/session/platform targets, exact commands, expected timing/resource
    boundaries, evidence storage locations, and permitted temporary paths.
  - Confirm that live Kubernetes validation, kubeconfig inspection, cluster authorization checks,
    and exec-authenticator execution are `N/A by design` or accepted assumptions, not pending
    implementation work.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Dependencies: v1.10.0-SEC-12, v1.10.0-SEC-13
  - _Requirements: AUDIT-BASE.1-AUDIT-BASE.5
  - _Validation: permitted-path review, source/contract review, and a written platform/evidence
    matrix containing no kubeconfig or cluster data.
  - _Definition of done: each later task has a platform-aware command/scenario, owner, expected
    result, and explicit unavailable outcome.
  - _Evidence: Linux host with Node.js `v25.2.1`, npm `11.6.2`, Electron `44.4.0`, and
    `DISPLAY=:1`; temporary validation paths were under `/tmp` and `.build`. No Kubernetes command,
    kubeconfig inspection, authorization check, or exec-authenticator execution was performed;
    each is N/A by design. Existing worktree changes were preserved._

## Phase 2 - Electron and backend runtime smoke

- [x] 1.10.1-AUDIT-2 Execute real Electron security smoke.
  - Launch the actual Electron runtime against the supported local build or package available in
    the environment and verify startup, backend readiness, and the exact approved loopback renderer
    URL.
  - Verify required CSP/resource loading and exercise the renderer WebSocket capability connection
    where feasible, including rejected arbitrary-origin or missing-capability behavior using a
    controlled local fixture when needed.
  - Attempt external, `file:`, `data:`, `javascript:`, credential-bearing, and unexpected
    loopback navigations; assert each is rejected. Attempt a new window and assert denial.
  - Record exact commands, scenario results, platform, unavailable checks, and residual risks. Do
    not use live Kubernetes data or record sensitive URLs/tokens.
  - _Owner: @ops-union-integration-qa and @ops-union-frontend
  - _Copilot agents: @ops-union-integration-qa, @ops-union-frontend
  - _Dependencies: 1.10.1-AUDIT-1
  - _Requirements: AUDIT-001.1-AUDIT-001.6
  - _Validation: real Electron smoke with startup URL, CSP/resource, navigation, new-window, and
    WebSocket capability assertions; platform-specific unavailable records where necessary.
  - _Definition of done: every available Electron scenario has an observed result and SEC-002/
    SEC-011 evidence is fit for status reconciliation.
  - _Evidence: Electron availability was checked and the built app was launched with an isolated
    profile, but the DevTools endpoint exposed no page target. Startup URL, CSP/resource,
    navigation, new-window, and renderer WebSocket capability scenarios are therefore unavailable,
    not passed. Backend policy tests provide substitute Origin/capability evidence. SEC-002 and
    SEC-011 are recorded as accepted-risk with desktop/integration-QA ownership._

- [x] 1.10.1-AUDIT-3 Execute spawned-backend SIGTERM and history cleanup validation.
  - Spawn a real backend with a controlled temporary private history root and non-secret fixtures.
  - Send SIGTERM, measure signal-to-exit time, verify server/resource shutdown and owned history
    cleanup/finalization, and exercise repeated/idempotent shutdown behavior.
  - Exercise Electron child normal exit and stalled-child timeout/escalation behavior where
    feasible, recording observed values and ensuring the harness itself does not hang.
  - _Owner: @ops-union-backend and @ops-union-integration-qa
  - _Copilot agents: @ops-union-backend, @ops-union-integration-qa
  - _Dependencies: 1.10.1-AUDIT-1
  - _Requirements: AUDIT-002.1-AUDIT-002.5
  - _Validation: real spawned-process SIGTERM run, controlled history fixture inspection, repeated
    shutdown scenario, and Electron child timeout scenario or explicit platform/harness limitation.
  - _Definition of done: SEC-004 has measured bounded evidence or a named accepted-risk record;
    no process is left running by the validation.
  - _Evidence: Built backend child on port `43127` passed health and exited code `0` `13 ms` after
    SIGTERM. A real stalled child through `desktop/dist/backendProcess.js` escalated at `4008 ms`
    with `SIGKILL` and returned. Backend history cleanup/idempotence coverage is included in the
    `104/104` suite. A spawned process did not create a real history session, so SEC-004 retains
    accepted-risk for that specific gap and packaged window-close evidence._

## Phase 3 - Packaging and delivery gates

- [x] 1.10.1-AUDIT-4 Run package/archive inspection and CI gate checks.
  - Run available clean-install, audit, workspace typecheck/test/build, runtime staging,
    package-preparation, and package-inspection commands without replacing release artifacts.
  - Inspect each available platform archive or installer contents using normalized paths and
    dependency/resource checks. Treat existing unpacked roots as supplemental only.
  - Exercise a harmless required-gate failure path to prove upload blocking where feasible; record
    CI source review separately from an executed CI job. List unavailable platform/signing/
    notarization/archive checks with exact reason and residual release risk.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.10.1-AUDIT-1, 1.10.1-AUDIT-2
  - _Requirements: AUDIT-003.1-AUDIT-003.4
  - _Validation: exact command/result matrix for local and platform gates, archive/resource
    inspection, upload-blocking evidence or unavailable rationale, and sensitive-content scan.
  - _Definition of done: SEC-010 can be assigned a permitted non-open status without confusing
    source review, unpacked inspection, or unavailable platform checks with archive evidence.
  - _Evidence: `npm run security:prepackage`, `node scripts/prepare-desktop-runtime.mjs`, and
    `node scripts/inspect-package.mjs` passed. A pre-existing Linux AppImage listing had zero
    forbidden sensitive path names and is supplemental only. Windows/macOS final archive checks,
    signing/notarization, current Linux packaging, and live CI execution were unavailable; the
    workflow upload block was source-reviewed only. SEC-010 is accepted-risk with release/integration
    QA ownership._

## Phase 4 - Boundary review and audit convergence

- [x] 1.10.1-AUDIT-5 Review all evidence and reconcile current statuses.
  - Review task evidence, v1.10.0 evidence, and the current source/package boundary. Map every
    SEC-001..SEC-011 finding to `fixed/validated`, `accepted-risk`, or `N/A` with explicit rationale.
  - Ensure the document records exact commands/results, unavailable checks by platform, residual
    risks, same-user loopback trust, kubeconfig/cluster authorization delegation, exec-authenticator
    behavior, `userData` permissions, and operator-controlled log content.
  - Mark live Kubernetes validation, kubeconfig inspection, cluster authorization checks, and
    exec-authenticator execution `N/A by design` or accepted assumptions. Do not create a requirement
    or claim that demands live Kubernetes access or a mutating operation.
  - Update `docs/SECURITY-AUDIT.md` only now, after executable evidence from tasks 1.10.1-AUDIT-2
    through 1.10.1-AUDIT-4 exists. Remove or clearly label stale historical open-status blocks so
    they cannot be mistaken for current findings. Include change-boundary confirmation.
  - _Owner: repository maintainer and @ops-union-architecture-review
  - _Copilot agents: repository maintainer, @ops-union-architecture-review
  - _Dependencies: 1.10.1-AUDIT-2, 1.10.1-AUDIT-3, 1.10.1-AUDIT-4
  - _Requirements: AUDIT-BASE.2-AUDIT-BASE.5, AUDIT-004.1-AUDIT-004.7
  - _Validation: evidence-to-document trace review, SEC-001..SEC-011 no-open check, required
    assumption/N/A check, `git diff --check`, and permitted-path/change-boundary confirmation.
  - _Definition of done: the authoritative current audit has zero open findings, no unsupported
    completion claim, explicit unavailable/platform limitations, and the final document edit is
    demonstrably later than executable evidence.
  - _Evidence: `docs/SECURITY-AUDIT.md` now has an authoritative current status set with no
    `open` status. Historical v1.9.0 open text is explicitly labelled non-current. Required
    same-user, kubeconfig/authorization delegation, exec-authenticator, `userData` permissions,
    and operator-controlled log-content assumptions are recorded. The final `git diff --check`
    was run after the evidence/report edits._

## Release acceptance criteria

- All available Electron startup, approved URL, CSP/resource, navigation, new-window, and
  WebSocket-capability scenarios pass; unavailable platform checks are named with residual risk.
- Real spawned-backend SIGTERM/history cleanup evidence and feasible Electron child timeout evidence
  are recorded with observed timings and bounded cleanup outcomes.
- Available package/archive and CI gates pass or are explicitly unavailable by platform; no final
  archive claim is based only on an unpacked directory or source review.
- The authoritative SEC-001..SEC-011 statuses contain no `open` findings and use only
  `fixed/validated`, `accepted-risk`, or `N/A` with explicit rationale.
- Kubernetes live validation, kubeconfig inspection, cluster authorization checks, and
  exec-authenticator execution are explicitly N/A/accepted assumptions by design.
- `docs/SECURITY-AUDIT.md` contains exact evidence, unavailable checks, residual risks, required
  assumptions, and change-boundary confirmation, and was edited only after executable evidence.

## Definition of done

- [x] 1.10.1 validation evidence is recorded by the named owners for every available scenario.
- [x] Every unavailable platform/harness check has an exact reason, substitute evidence where
  useful, residual risk, and owner.
- [x] SEC-001..SEC-011 have no current `open` status and historical open blocks are unmistakably
  superseded or removed from the current findings flow.
- [x] The explicit Kubernetes N/A-by-design boundary is present in requirements, design, tasks,
  and the final audit document.
- [x] No source code, release artifact, Kubernetes resource, kubeconfig, commit, or publication is
  changed by the specification work.

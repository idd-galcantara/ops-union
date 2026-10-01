# Implementation Tasks - ops-union v1.16.0 dependency automation

All tasks below are complete. This specification records the implemented automation and its
validated operational boundaries; it does not authorize a new dependency upgrade or release push.

## Phase 1 - Inventory and policy

- [x] 1.16.0-AUTO-1 Inventory dependency and delivery surfaces.
  - Inspect root and workspace manifests, lockfile, engine contract, scripts, workflows, Dependabot,
    Dependency Review, branch protection, and auto-merge settings.
  - _Owner: @ops-union-dependency-security and @ops-union-architecture-review
  - _Requirements: AUTO-BASE.1-AUTO-BASE.3, AUTO-001.1-AUTO-001.3
  - _Validation: Repository configuration review and current GitHub API state.
  - _Definition of done: The complete automation surface and its boundaries are documented.
  - _Evidence: `package.json`, `.github/dependabot.yml`, the four workflow files, branch protection,
    and the merged Dependabot PR history were reviewed.

- [x] 1.16.0-AUTO-2 Define the dependency maintenance policy.
  - Record update schedules, open-PR limits, engine and peer compatibility, lockfile expectations,
    vulnerability thresholds, and the informational outdated-dependency policy.
  - _Owner: @ops-union-dependency-maintainer and @ops-union-dependency-security
  - _Requirements: AUTO-001.1-AUTO-001.3, AUTO-002.1-AUTO-002.3
  - _Validation: Dependabot and root script review.
  - _Definition of done: Maintainers have a single documented policy for dependency changes.
  - _Evidence: Weekly npm updates, monthly GitHub Actions updates, npm audits at high severity,
    and the root `security:prepackage` orchestration are recorded.

## Phase 2 - Validation and merge automation

- [x] 1.16.0-AUTO-3 Record the pull-request validation contract.
  - Capture clean installation, pinned Node/npm versions, dependency validation, audits, typechecks,
    tests, build, and Dependency Review.
  - _Owner: @ops-union-dependency-maintainer and @ops-union-integration-qa
  - _Requirements: AUTO-002.1-AUTO-002.3
  - _Validation: Successful required checks on PRs #7, #9, and #13.
  - _Definition of done: The same validation contract blocks unsafe dependency merges.
  - _Evidence: `Validate pull request` and `Review dependency changes` both passed on the final
    heads of PRs #7, #9, and #13.

- [x] 1.16.0-AUTO-4 Record the security and read-only boundary.
  - Confirm high-severity audit/review failures block and workflows do not access kubeconfig or
    mutate clusters.
  - _Owner: @ops-union-dependency-security and @ops-union-architecture-review
  - _Requirements: AUTO-BASE.1-AUTO-BASE.3, AUTO-002.2-AUTO-002.3
  - _Validation: Workflow permissions and command review.
  - _Definition of done: Dependency automation cannot cross the application read-only boundary.
  - _Evidence: Validation and review workflows use repository read permissions; no Kubernetes
    command or kubeconfig access is part of the dependency pipeline.

- [x] 1.16.0-AUTO-5 Record gated Dependabot auto-merge.
  - Confirm author filtering, current head-SHA checks, native squash merge, source-branch deletion,
    and behavior for failed or stale checks.
  - _Owner: @ops-union-dependency-security and @ops-union-integration-qa
  - _Requirements: AUTO-004.1-AUTO-004.4
  - _Validation: Workflow review and merged PR history.
  - _Definition of done: Eligible Dependabot updates merge only after both required checks pass.
  - _Evidence: `.github/workflows/dependabot-auto-merge.yml` enforces the Dependabot identity and
    both required check names; PRs #7, #9, and #13 completed the path.

## Phase 3 - Packaging and release boundary

- [x] 1.16.0-AUTO-6 Record the main packaging topology.
  - Confirm one repository validation job gates Linux, Windows, and macOS packaging and artifact
    upload, while tags alone can create a GitHub Release.
  - _Owner: @ops-union-integration-qa and @ops-union-release
  - _Requirements: AUTO-003.1-AUTO-003.4
  - _Validation: Main workflow run `36927480218`.
  - _Definition of done: The packaging dependency order and artifact behavior are documented.
  - _Evidence: Validation, Linux, Windows, and macOS all passed; artifacts were uploaded and no
    release was created for the manual main dispatch.

- [x] 1.16.0-AUTO-7 Define the remaining manual actions.
  - Record conflict resolution, workflow-file merge exceptions, version/tag decisions, release
    publication, and manual dispatch as explicit operator responsibilities.
  - _Owner: @ops-union-release and @ops-union-architecture-review
  - _Requirements: AUTO-005.1-AUTO-005.3
  - _Validation: Release documentation and observed workflow behavior review.
  - _Definition of done: Operators know exactly where automation stops.
  - _Evidence: `docs/VERSIONING-AND-RELEASE.md` documents commit/tag/publish steps; the manual
    main dispatch produced artifacts without invoking `Create GitHub Release`.

- [x] 1.16.0-AUTO-8 Prepare the version record.
  - Create this convergence specification and align root version metadata and lockfile to v1.16.0.
  - _Owner: @ops-union-release
  - _Requirements: AUTO-BASE.1-AUTO-BASE.3
  - _Validation: Version consistency check, `npm ci`, `git diff --check`, and specification review.
  - _Definition of done: The repository records v1.16.0 without claiming a published tag or release.
  - _Evidence: `package.json` and `package-lock.json` resolve to `1.16.0`; no tag, push, or GitHub
    Release is performed by this task.

# Implementation Tasks - ops-union v1.14.0 CI security and dependency gates

These tasks authorize validation and delivery-control changes only. They do not authorize runtime
migrations, dependency upgrades, Kubernetes mutation, or release publication.

## Phase 1 - Baseline and policy

- [x] 1.14.0-SEC-1 Establish the current validation baseline.
  - Inspect root/workspace manifests, engines, lockfile, package workflow, and existing security gate.
  - Run the current production audit and workspace dependency tree check.
  - Record the current local runtime mismatch and the supported CI runtime.
  - _Owner: @ops-union-dependency-security and @ops-union-version-migration
  - _Requirements: SEC-BASE.1-SEC-BASE.3, SEC-001.1-SEC-001.3
  - _Validation: `node --version`, `npm --version`, `npm audit --omit=dev`, `npm ls --workspaces --depth=0`.
  - _Definition of done: baseline and blocking policy are recorded before implementation.
  - _Evidence: Node `25.2.1`/npm `11.6.2` was observed locally; `npm audit --omit=dev` reported
    `0 vulnerabilities`; workspace direct dependencies resolved without invalid entries; the root
    contract requires Node `26.10.0` and npm `11.6.2`.

## Phase 2 - Gate implementation

- [x] 1.14.0-SEC-2 Implement runtime and dependency validators.
  - Add root scripts for Node/npm engine validation and workspace dependency checks.
  - Keep outdated dependency reporting informational while failing graph/command errors.
  - Extend the pre-package gate to audit production and complete dependency trees at high severity.
  - _Owner: @ops-union-version-migration and @ops-union-dependency-maintainer
  - _Requirements: SEC-001.1-SEC-001.3, SEC-002.1-SEC-002.3, SEC-003.1-SEC-003.3
  - _Validation: `node --check`, supported-runtime validator execution, dependency validator, and
    root script review.
  - _Definition of done: all local gate logic is executable and uses no new runtime dependency.
  - _Evidence: Both scripts passed `node --check`; the toolchain validator passed under Node
    `26.10.0`/npm `11.6.2`; the root gate now includes engine, graph, production-audit, and full-audit
    checks.

- [x] 1.14.0-SEC-3 Make packaging downstream of one validation job.
  - Add the Ubuntu validation job after `npm ci`.
  - Make Linux, Windows, and macOS packaging depend on that job.
  - Preserve platform-specific package and inspection steps.
  - _Owner: @ops-union-integration-qa
  - _Requirements: SEC-005.1-SEC-005.3
  - _Validation: workflow review and YAML/action configuration check.
  - _Definition of done: package jobs cannot start after a failed repository gate.
  - _Evidence: `package-desktop.yml` now has `validate`; all three package jobs declare
    `needs: validate`, while platform packaging and artifact inspection remain unchanged.

- [x] 1.14.0-SEC-4 Add pull-request review and update automation.
  - Add high-severity GitHub Dependency Review for dependency-related pull requests.
  - Add weekly npm and monthly GitHub Actions Dependabot coverage.
  - Restrict workflow permissions to contents read for the review job.
  - _Owner: @ops-union-dependency-security and @ops-union-dependency-maintainer
  - _Requirements: SEC-004.1-SEC-004.3
  - _Validation: workflow/configuration review and YAML syntax check.
  - _Definition of done: dependency changes have advisory review and a recurring update source.
  - _Evidence: `.github/workflows/dependency-review.yml` uses `actions/dependency-review-action@v4`
    with `fail-on-severity: high`; `.github/dependabot.yml` covers npm and GitHub Actions.

## Phase 3 - Documentation and release readiness

- [x] 1.14.0-SEC-5 Converge current release and security documentation.
  - Document local runtime expectations and the new validation order.
  - Record blocking versus informational dependency policies and platform limitations.
  - Preserve historical release specifications and avoid claiming a published release.
  - _Owner: @ops-union-docs-convergence
  - _Requirements: SEC-BASE.1-SEC-BASE.3, SEC-005.1-SEC-005.3
  - _Validation: documentation review and `git diff --check`.
  - _Definition of done: current operators can understand and reproduce the validation path.
  - _Evidence: `docs/VERSIONING-AND-RELEASE.md`, `docs/SECURITY-AUDIT.md`, and `README.md` record
    the new gates; `git diff --check` passed.

- [x] 1.14.0-SEC-6 Validate the release candidate and prepare version metadata.
  - Run clean-install, toolchain, dependency, audit, typecheck, test, build, and package-input checks.
  - Update root version metadata and lockfile together to `1.14.0`.
  - Confirm no commit, tag, push, or GitHub Release is performed without explicit delivery approval.
  - _Owner: @ops-union-release and @ops-union-integration-qa
  - _Requirements: SEC-001.1-SEC-003.3, SEC-005.1-SEC-005.3
  - _Validation: full root gate, version/lockfile consistency, and final diff review.
  - _Definition of done: v1.14.0 is prepared locally with executable evidence and no publication claim.
  - _Evidence: Clean `npm ci` and the full `security:prepackage` gate passed under Node `26.10.0`
    and npm `11.6.2`; production and full-tree audits reported no blocking advisories, backend
    tests passed `104/104`, frontend tests passed `148/148`, typechecks and build passed. Root
    `package.json` and `package-lock.json` now resolve to `1.14.0`; no commit, tag, push, or
    GitHub Release was created.
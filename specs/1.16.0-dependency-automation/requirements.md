# Requirements - ops-union v1.16.0 dependency automation

## Status and scope

Version 1.16.0 records the implemented automation for dependency maintenance, pull-request
validation, security review, Dependabot auto-merge, and main-branch packaging. This specification
is a convergence record; it does not introduce new application behavior or dependency upgrades.

The release remains read-only with respect to Kubernetes clusters and does not authorize secret
collection, cluster mutation, or publication of a GitHub Release by itself.

## User stories

- As a maintainer, I receive reproducible dependency and quality validation on every pull request.
- As a security reviewer, I receive high-severity dependency review and vulnerability gates.
- As a release owner, I know that main-branch packages are built only after repository validation.
- As a maintainer, I can allow compatible Dependabot updates to merge without manual intervention.
- As an operator, I can distinguish automated actions from the remaining manual decisions.

## Requirements

### AUTO-BASE - Preserve repository and security boundaries

1. Automation SHALL use committed manifests, the lockfile, declared engine ranges, and GitHub
   status checks as its source of truth.
2. Automation SHALL preserve the application's read-only Kubernetes boundary.
3. Automation SHALL not expose kubeconfig contents, credentials, or application secrets.

**Acceptance criteria:** The documented automation operates only on repository, dependency, CI,
artifact, and pull-request surfaces.

### AUTO-001 - Maintain dependency update coverage

1. Dependabot SHALL monitor npm dependencies weekly.
2. Dependabot SHALL monitor GitHub Actions dependencies monthly.
3. npm update pull requests SHALL be capped at the configured open-pull-request limit.

**Acceptance criteria:** The repository configuration covers both ecosystems and records the
configured schedule and limit.

### AUTO-002 - Validate every pull request

1. Pull-request validation SHALL pin Node.js 26.10.0 and npm 11.6.2.
2. Validation SHALL run clean installation, toolchain validation, dependency-tree validation,
   production and complete vulnerability audits, typechecks, backend tests, frontend tests, and
   the complete build.
3. Dependency-related changes SHALL receive Dependency Review with high-severity failures blocked.

**Acceptance criteria:** A missing, failed, or incomplete required check prevents eligible merge.

### AUTO-003 - Keep packaging downstream of validation

1. Pushes to main SHALL validate the repository before platform packaging.
2. Linux, Windows, and macOS packaging jobs SHALL depend on the validation job.
3. Platform jobs SHALL inspect and upload their generated artifacts.
4. Version tags SHALL be the only trigger that can enter the automatic GitHub Release path.

**Acceptance criteria:** A failed repository gate prevents all platform package jobs; a successful
main build produces artifacts without creating a release.

### AUTO-004 - Gate Dependabot auto-merge

1. Auto-merge SHALL apply only to Dependabot-authored pull requests.
2. Both `Validate pull request` and `Review dependency changes` SHALL pass for the current head SHA.
3. The workflow SHALL request native squash auto-merge and delete the source branch.
4. The workflow SHALL not check out or execute pull-request code.

**Acceptance criteria:** Eligible Dependabot pull requests merge automatically after both checks;
failed, stale, pending, or non-Dependabot pull requests remain subject to normal review.

### AUTO-005 - Record manual boundaries

1. Humans SHALL resolve dependency conflicts, compatibility fixes, and workflow-file merge limits.
2. Humans SHALL decide when to create a version tag and publish a release.
3. Manual workflow dispatch SHALL remain available for an explicit main-branch packaging run.

**Acceptance criteria:** The current documentation identifies automated actions and remaining
operator decisions without claiming that release publication is automatic for ordinary main pushes.

## Out of scope

- New application features or Kubernetes API behavior.
- Automatic approval of pull requests.
- Automatic merging of non-Dependabot pull requests.
- Automatic creation of a version tag or publication of a release from a main push.
- Code signing, notarization, license policy, secret scanning, or live-cluster validation.

## Definition of done

- The dependency, validation, review, auto-merge, and packaging workflows are recorded accurately.
- All implementation tasks in `tasks.md` are marked complete with validation evidence.
- The root version metadata and lockfile are prepared for v1.16.0.
- The specification distinguishes automated behavior from manual release and exception handling.

# Requirements - ops-union v1.14.0 CI security and dependency gates

## Status and scope

Version 1.14.0 adds reproducible validation for the repository's runtime contract, dependency
graph, lockfile, vulnerability exposure, and dependency changes in pull requests. It does not
change application behavior, Kubernetes access, or the supported runtime contract established by
v1.13.0.

The release remains strictly read-only and does not authorize commits, tags, pushes, publication,
secret collection, or replacement of existing release artifacts as part of implementation.

## User stories

- As a maintainer, I receive a clear failure when CI runs with an unsupported Node.js or npm version.
- As a maintainer, I know when the workspace dependency tree or lockfile is invalid.
- As a release owner, high-severity vulnerabilities block packaging before an artifact is produced.
- As a reviewer, dependency changes receive an advisory review and automated update coverage.

## Requirements

### SEC-BASE - Preserve application and CI boundaries

1. The gates SHALL remain non-mutating with respect to Kubernetes, credentials, release assets, and
   user data.
2. The gates SHALL use the committed package manifests, lockfile, and declared engine ranges as
   their source of truth.
3. The gates SHALL preserve the existing read-only application boundary and package workflow.

**Acceptance criteria:** The implementation changes only validation, CI, dependency-automation, and
current operational documentation surfaces.

### SEC-001 - Validate the runtime version contract

1. CI SHALL verify the running Node.js and npm versions against the root `engines` ranges.
2. The check SHALL fail for versions below the minimum or at/above the exclusive maximum.
3. The check SHALL run before workspace tests, builds, or packaging.

**Acceptance criteria:** A supported Node/npm pair passes and the current unsupported local Node
version fails with an actionable message.

### SEC-002 - Validate dependency resolution and maintenance state

1. CI SHALL install with `npm ci` and validate all workspace dependency trees with `npm ls`.
2. CI SHALL run a workspace-aware outdated-dependency check without failing solely because a newer
   compatible version exists.
3. Dependency-tree or npm execution errors SHALL fail the validation job.

**Acceptance criteria:** Invalid, extraneous, or unresolved workspace dependencies block the gate;
outdated packages remain visible for maintenance review.

### SEC-003 - Block actionable vulnerability exposure

1. CI SHALL audit production dependencies and the complete dependency tree.
2. High and critical advisories SHALL fail the validation gate before packaging.
3. Advisory output SHALL remain available in CI logs without exposing kubeconfig contents, tokens,
   or other secrets.

**Acceptance criteria:** A clean audit passes; a high or critical advisory blocks the job.

### SEC-004 - Review dependency changes and automate updates

1. Pull requests changing dependency manifests or the lockfile SHALL run GitHub Dependency Review.
2. High-severity dependency changes SHALL fail that review.
3. Dependabot SHALL monitor npm dependencies and GitHub Actions on a recurring schedule.

**Acceptance criteria:** The review workflow is path-scoped, read-only, and has contents-read
permission; Dependabot configuration covers both ecosystems.

### SEC-005 - Keep packaging downstream of validation

1. Platform packaging jobs SHALL depend on one successful repository validation job.
2. The validation job SHALL run before Linux, Windows, and macOS packaging.
3. Platform jobs SHALL retain their platform-specific build and package inspection steps.

**Acceptance criteria:** A failed security/dependency/workspace gate prevents all platform package
jobs from starting.

## Out of scope

- Runtime, Electron, React, Vite, TypeScript, or Kubernetes feature changes.
- Automatic dependency upgrades inside the release workflow.
- License policy enforcement, secret scanning, container scanning, or live cluster validation.
- Release publication, commit, tag, push, signing, or replacement of existing artifacts.

## Definition of done

- Runtime, dependency, lockfile, and audit gates are executable from the root package scripts.
- The package workflow has a single upstream validation gate for all platforms.
- Pull-request dependency review and recurring dependency update configuration are present.
- Current release/security documentation describes the new controls.
- The spec records implementation evidence and remaining platform limitations.
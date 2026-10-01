# Requirements - ops-union v1.11.0 dependency maintenance

## Status and scope

Version 1.11.0 is a controlled dependency-maintenance release after v1.10.2. It covers the
security baseline, triage, and implementation of approved patch or minor dependency updates across
the root, backend, frontend, and desktop workspaces. It does not include major upgrades of Node,
Electron, React, Vite, TypeScript, or other platform/toolchain contracts; those belong to a separate
version-migration specification.

The application remains a single-user, loopback-bound, read-only Kubernetes inspection tool. This
specification does not authorize Kubernetes operations, release publication, commits, tags, or
changes unrelated to the approved dependency set.

## User stories

- As a maintainer, I can identify direct and transitive dependency vulnerabilities with reproducible
  evidence and a clear runtime/build reachability assessment.
- As a maintainer, I can apply compatible dependency fixes while keeping all manifests and the
  lockfile aligned.
- As a release owner, I can verify that dependency changes preserve workspace, packaging, security,
  and read-only behavior before release preparation.

## Requirements

### DEP-BASE - Preserve repository and security boundaries

1. Dependency work SHALL preserve the current Node, Electron, backend, frontend, desktop, and
   package-builder contracts unless a breaking change is explicitly handed to v1.12.0 or a later
   migration specification.
2. `package.json` files and `package-lock.json` SHALL remain synchronized and reproducible with
   `npm ci`.
3. No dependency change SHALL introduce Kubernetes mutation, secret exposure, broader Electron
   privileges, or a new network boundary.
4. Existing user worktree changes SHALL be preserved, and no commit, tag, push, publication, or
   release artifact replacement SHALL occur in this specification.

**Acceptance criteria:** A manifest/lockfile review and focused validation confirm the boundaries
remain unchanged and every changed package is in the approved scope.

### DEP-001 - Establish the dependency and advisory baseline

1. The audit SHALL cover root and all workspace manifests, the lockfile, CI, runtime staging, and
   package inspection paths.
2. It SHALL run non-mutating audit and graph checks, including `npm audit --omit=dev` and targeted
   `npm explain` commands where applicable.
3. Each material finding SHALL identify package, resolved version, dependency path, severity,
   runtime/build/test/packaging reachability, confidence, and recommended owner.

**Acceptance criteria:** The baseline distinguishes direct, transitive, development, build, and
production exposure and records limitations without exposing secrets.

### DEP-002 - Approve compatible updates

1. Every proposed update SHALL have compatible release notes, engine constraints, peer dependency
   checks, and a reason for inclusion.
2. Major upgrades, removed APIs, runtime changes, native-module rebuilds, and coordinated framework
   changes SHALL be rejected from this scope and handed to `ops-union-version-migration`.
3. Overrides SHALL be used only when the resolved graph and maintenance tradeoff are documented.

**Acceptance criteria:** An approved package list exists before manifests or lockfiles are edited.

### DEP-003 - Apply and validate the approved updates

1. The maintainer SHALL change only the approved dependency group and keep the lockfile aligned.
2. Focused tests/typechecks SHALL run before full workspace gates.
3. The full validation SHALL include audit, root typecheck, backend/frontend tests, and build; any
   unavailable package or platform check SHALL be recorded as unavailable rather than passed.

**Acceptance criteria:** Changed packages resolve to the approved versions, all applicable gates
pass, and residual risks are recorded.

### DEP-004 - Converge evidence and hand off for release

1. Security findings SHALL be updated with current status, evidence, owner, and follow-up condition.
2. Current documentation SHALL describe changed support or operational requirements without
   rewriting historical specifications.
3. The result SHALL be ready for integration QA and release preparation only after all required
   evidence is present.

**Acceptance criteria:** The handoff names changed files, commands/results, limitations, and the
next release owner; no release action is performed here.

## Out of scope

- Major upgrades or migrations of Node, npm, Electron, React, Vite, TypeScript, or package-builder.
- Product feature changes, Kubernetes access or mutation, release signing, publication, commit,
  tag, push, or replacement of existing artifacts.

## Definition of done

- The dependency baseline and approved update list are recorded.
- Manifests and lockfile are aligned and reproducible.
- Applicable audit, typecheck, test, build, and integration checks pass or have explicit limits.
- Security and current documentation evidence are converged.
- The change is ready for QA without claiming release completion.
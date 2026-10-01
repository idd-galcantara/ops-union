# Design - ops-union v1.14.0 CI security and dependency gates

## Release intent

v1.14.0 turns the existing pre-package checks into an explicit CI boundary:

```text
npm ci
  -> Node/npm contract
  -> dependency tree and outdated report
  -> production and complete vulnerability audits
  -> typecheck, tests, and build
  -> platform packaging and inspection
```

The validation job runs once on Ubuntu. Platform jobs remain responsible for their own clean
installation and platform-specific packaging after the validation job succeeds.

## Ownership boundaries

- `@ops-union-dependency-security` owns advisory policy and dependency-review interpretation.
- `@ops-union-dependency-maintainer` owns dependency tree and outdated-version follow-up.
- `@ops-union-version-migration` owns runtime engine contracts and version compatibility.
- `@ops-union-integration-qa` owns packaging, artifact inspection, and cross-platform limitations.
- `@ops-union-docs-convergence` owns current security and release documentation.

## Implementation model

### Runtime validator

`validate-toolchain.mjs` reads the root `engines` values, obtains the running Node.js and npm
versions, and evaluates the supported inclusive-minimum/exclusive-maximum range. It intentionally
supports the repository's current simple range format rather than introducing a new dependency.

### Dependency validator

`validate-dependencies.mjs` runs `npm ls --workspaces --all` as a blocking graph check and
`npm outdated --workspaces --include-workspace-root --long` as an informational maintenance check.
The npm outdated status `1`, which means packages are outdated, is reported but accepted; command
errors remain blocking.

### CI topology

The existing security gate remains the root orchestration command. A new `validate` job executes it
after `npm ci`. Linux, Windows, and macOS package jobs require `validate`, avoiding three copies of
the same full test/build/audit suite while preserving platform package checks. A separate
pull-request workflow runs `actions/dependency-review-action@v4` with a high-severity failure
threshold. Dependabot monitors npm and GitHub Actions manifests.

## Failure policy

| Check | Policy |
| --- | --- |
| Node.js/npm engine range | Blocking |
| Workspace dependency tree | Blocking |
| npm outdated | Informational |
| Production audit high/critical | Blocking |
| Full-tree audit high/critical | Blocking |
| Typecheck, tests, build | Blocking |
| Dependency Review high/critical | Blocking |

The workflow does not run Kubernetes commands and does not access kubeconfig or application
secrets. The current local shell may fail the runtime gate when it is still on Node `25.2.1`; the
supported validation command must run under Node `26.10.0` and npm `11.6.2`.

## Rollback

Rollback removes the validation job dependency, new scripts, dependency-review workflow, and
Dependabot configuration while restoring the previous `security:prepackage` command. No runtime or
application data migration is required.
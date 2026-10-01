# Design - ops-union v1.16.0 dependency automation

## Release intent

v1.16.0 records the current dependency and delivery-control topology:

```text
Dependabot
  -> pull request
  -> clean npm installation
  -> Node/npm contract
  -> dependency tree and maintenance report
  -> production and complete vulnerability audits
  -> typecheck, tests, and build
  -> Dependency Review
  -> native Dependabot auto-merge

main push or manual dispatch
  -> repository validation
  -> Linux, Windows, and macOS packaging
  -> artifact upload

tag push
  -> repository validation
  -> platform packaging
  -> automatic GitHub Release
```

## Ownership boundaries

- `@ops-union-dependency-maintainer` owns dependency updates, lockfile health, and npm tree follow-up.
- `@ops-union-dependency-security` owns vulnerability thresholds and Dependency Review policy.
- `@ops-union-version-migration` owns Node.js/npm compatibility and engine contracts.
- `@ops-union-integration-qa` owns CI execution, package inspection, and cross-platform evidence.
- `@ops-union-release` owns version preparation, tag decisions, and release delivery.
- Repository maintainers own conflict resolution and exceptions that cannot be safely automated.

## Automated validation model

The root `security:prepackage` command is the single quality gate. It validates the declared
runtime, dependency graph, audits, typechecks, tests, and build. Pull requests run this gate in
`Validate pull request`; main and tag workflows run it in `Validate repository` before packaging.

Dependency Review is a separate read-only check for dependency and workflow changes. Both required
checks use the current pull-request head SHA before the auto-merge workflow requests native GitHub
squash auto-merge.

## Failure policy

| Area | Blocking behavior |
| --- | --- |
| Node.js/npm contract | Unsupported version fails validation |
| npm installation or workspace tree | Invalid or unresolved dependency fails validation |
| High/critical vulnerability | Production or complete audit fails validation |
| Typecheck, tests, or build | Pull request and packaging gate fail |
| Dependency Review | High-severity dependency change fails review |
| Platform package job | Does not start when repository validation fails |
| Auto-merge | Does not request merge when either required check is absent or failed |

Outdated compatible packages are reported for maintenance but are not independently blocking.

## Manual boundary

The automation deliberately stops at decisions that require repository context or release intent.
Maintainers resolve lockfile conflicts and compatibility changes, review workflow-file changes when
action-token restrictions apply, and choose the version/tag to publish. A manual dispatch can run
the current main packaging workflow for confirmation; it uploads artifacts but does not create a
GitHub Release because the release job requires a version tag.

## Evidence baseline

- Main commit `74293bf` contains the merged dependency automation state.
- Pull requests #7, #9, and #13 passed both required checks and were merged automatically or after
  the required workflow path completed.
- Main packaging run `36927480218` passed repository validation and Linux, Windows, and macOS
  packaging, with artifacts uploaded.
- The previous validation failure was caused by runner npm `11.19.1` violating the declared npm
  range; workflows now pin npm `11.6.2` before installation.

## Rollback

This specification is a record and has no runtime migration. Reverting the associated version
metadata and documentation does not alter cluster state. Removing automation requires a separate,
explicit specification because it would change merge and packaging safety controls.

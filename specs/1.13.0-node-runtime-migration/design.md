# Design - ops-union v1.13.0 Node runtime migration

## Release intent

v1.13.0 moves the repository's tested runtime contract from Node `25.2.1`/npm `11.6.2` to Node
`26.10.0`/npm `11.6.2`. The exact patch is frozen by the compatibility baseline before source
changes.
The sequence is:

```text
current Node/npm and workspace baseline
  -> target LTS matrix and support decision
  -> manifest/CI/runtime contract update
  -> workspace and child-process compatibility repair
  -> clean install, tests, build, and package validation
  -> security/documentation convergence
```

## Ownership boundaries

- `@ops-union-version-migration` owns the runtime matrix, sequencing, compatibility decisions, and
  source/configuration migration.
- `@ops-union-dependency-security` owns pre/post-migration dependency and advisory evidence.
- `@ops-union-dependency-maintainer` owns compatible typings/tooling/lockfile maintenance that is
  not a runtime migration.
- `@ops-union-backend` owns backend Node behavior, HTTP/WebSocket, signals, and child-process paths.
- `@ops-union-frontend` owns frontend tooling and build compatibility.
- `@ops-union-integration-qa` owns clean install, desktop, package, cross-workspace, and read-only
  integration validation.
- `@ops-union-docs-convergence` owns current runtime and release documentation after evidence.

## Compatibility matrix

The matrix covers Node/npm exact versions, package engines, TypeScript/node typings, `tsx`, Vite,
Electron tooling, CI actions, OS/architecture hosts, install scripts, native dependencies, backend
child startup, and packaged runtime staging. Existing API, IPC, WebSocket, filesystem, and
Kubernetes read-only contracts are preserved by default.

Node `26.10.0` is compatible with the approved Electron `44.5.1` line and package-builder `26.15.3`
for this runtime-only change. If a target-runtime issue requires an Electron major, the task must
record the blocker and hand off the coordinated change rather than silently combining migrations.

## Validation model

Run baseline checks before edits, focused checks after each boundary, and full gates at the end:

- clean `npm ci` under the target runtime;
- dependency audit and graph review;
- backend/frontend/desktop typechecks and tests;
- root build and runtime staging;
- available Linux/Windows/macOS package input/archive checks;
- security and documentation convergence.

No live Kubernetes access is needed. Any cluster validation remains strictly read-only.

## Rollback

Rollback consists of restoring the prior runtime matrix, CI setup, engine/documentation entries,
manifest/lockfile state, and any runtime-specific source changes. The compatibility matrix and
validation evidence must identify the first failing boundary to make rollback actionable.
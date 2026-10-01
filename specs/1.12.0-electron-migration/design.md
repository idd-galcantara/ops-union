# Design - ops-union v1.12.0 Electron migration

## Release intent

v1.12.0 upgrades the Electron desktop runtime from the current `44.4.0` baseline only after a
compatibility matrix approves the target. The sequence is:

```text
current desktop/runtime baseline
  -> Electron target matrix and breaking-change review
  -> dependency and source migration
  -> desktop security/lifecycle validation
  -> build, staging, and package validation
  -> documentation and release handoff
```

If the target depends on a Node runtime change, implementation pauses and hands that work to
`1.13.0-node-runtime-migration` before continuing.

## Ownership boundaries

- `@ops-union-version-migration` owns the target matrix, migration sequence, and coordinated
  compatibility decisions.
- `@ops-union-dependency-security` owns the pre/post-migration dependency and advisory baseline.
- `@ops-union-dependency-maintainer` owns compatible Electron/builder transitive maintenance that
  is not itself a migration.
- `@ops-union-backend` owns desktop process/backend child contracts and backend compatibility.
- `@ops-union-frontend` owns renderer/preload consumer compatibility and UI/runtime assumptions.
- `@ops-union-integration-qa` owns desktop smoke, packaging, archive/resource inspection, and
  read-only integration evidence.
- `@ops-union-docs-convergence` owns current documentation updates after evidence exists.

## Compatibility boundaries

The matrix must cover Electron Main, preload, renderer, IPC, backend child startup, dynamic ports,
context isolation, sandbox behavior, navigation/window policy, package resources, native modules,
CI hosts, and supported architectures. Existing public channel names and payloads are preserved by
default. A changed contract requires an explicit requirement, focused tests, and migration note.

## Validation model

Validation is staged at each boundary:

1. dependency graph and advisory baseline;
2. focused desktop/main/preload/renderer typechecks and tests;
3. root typecheck, workspace tests, and build;
4. Electron startup/navigation/IPC smoke where available;
5. runtime staging and platform package/archive inspection;
6. security and documentation convergence.

Live Kubernetes validation is not required. Any cluster validation remains read-only and must not
be used to justify a new capability.

## Rollback

The compatibility matrix, manifest/lockfile diff, source diff, package inspection results, and
platform availability record form the rollback decision. Release publication remains owned by
`ops-union-release` and is outside this specification.
# Requirements - ops-union v1.12.0 Electron migration

## Status and scope

Version 1.12.0 is a coordinated Electron desktop-runtime migration. The current baseline is
Electron `44.4.0` in `desktop/package.json`, with `electron-builder` `26.15.3` at the root. The
target Electron line SHALL be selected and frozen by the compatibility-matrix task before any
manifest or source edit; it SHALL be compatible with the supported Node runtime and packaging
platforms.

The migration covers desktop main/preload behavior, renderer handoff, native/runtime packaging,
tests, CI, and current documentation. It preserves the loopback-only, single-user, read-only
Kubernetes product boundary.

## User stories

- As a desktop operator, I can launch the migrated application and reach the approved renderer
  without new privileges or navigation paths.
- As a maintainer, I can build and package the application on supported platforms with aligned
  Electron and builder dependencies.
- As a release owner, I can verify the migration's runtime, security, and packaging evidence before
  preparing a release.

## Requirements

### ELEC-BASE - Preserve desktop and security contracts

1. The migration SHALL preserve sandboxing, context isolation, disabled renderer Node integration,
   preload narrowing, IPC validation, loopback binding, internal capability checks, and read-only
   Kubernetes operations.
2. Main-process startup, backend child lifecycle, renderer URL, preload API, and shutdown behavior
   SHALL remain compatible unless a deliberate contract change is specified and tested.
3. Supported OS/architecture packaging and the root/workspace lockfile SHALL remain explicit and
   reproducible.
4. No commit, tag, push, publication, Kubernetes operation, or release artifact replacement is
   authorized by this specification.

**Acceptance criteria:** Security and desktop contract review finds no widened capability or
unplanned runtime boundary.

### ELEC-001 - Freeze the migration matrix

1. The matrix SHALL record current and target Electron, electron-builder, Node/npm, TypeScript,
   native-module, and platform versions.
2. It SHALL identify every breaking change affecting main, preload, renderer, IPC, packaging,
   sandbox/security settings, tests, CI, and generated resources.
3. It SHALL define rollback, validation gates, and an explicit decision when the target requires a
   Node runtime migration.

**Acceptance criteria:** No implementation starts before the target and compatibility decisions are
recorded.

### ELEC-002 - Preserve and validate desktop behavior

1. The migrated desktop process SHALL start the backend child, await readiness, load the approved
   renderer, and shut down within the existing bounded lifecycle contract.
2. Preload and IPC channels SHALL preserve payload validation, capability boundaries, and safe
   error behavior.
3. External, unexpected, or privilege-expanding navigation/window behavior SHALL remain rejected.

**Acceptance criteria:** Focused desktop tests and available Electron smoke scenarios pass, or each
unavailable platform/runtime check has a named limitation and owner.

### ELEC-003 - Preserve build and package outputs

1. `npm run build` and applicable Linux, Windows, and macOS package commands SHALL succeed or have
   explicit platform limitations.
2. Runtime staging SHALL include only approved backend/frontend/desktop resources and dependency
   versions.
3. Package inspection SHALL not find kubeconfig names/content, credentials, certificates, keys,
   tokens, raw audit data, or unintended source material.

**Acceptance criteria:** Build, staging, package input, and available archive evidence are recorded.

### ELEC-004 - Converge support and release evidence

1. Current documentation SHALL identify the approved Electron/runtime support matrix and migration
   limitations.
2. Security audit evidence SHALL distinguish source review, local smoke, archive evidence, and
   unavailable platform checks.
3. The migration SHALL be ready for release preparation only after integration QA and documentation
   convergence.

## Out of scope

- Unrelated UI/backend features, Node runtime migration not required by the selected Electron target,
  Kubernetes mutation, secret collection, signing/notarization setup, publication, commit, tag, or
  push.

## Definition of done

- Target and compatibility matrix are frozen with rollback and validation gates.
- Desktop behavior, security boundaries, build, runtime staging, and available packaging checks pass.
- Unavailable platform evidence and residual risks are explicit.
- Current documentation is converged and release handoff is complete without publishing.
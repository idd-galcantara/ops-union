# Requirements - ops-union v1.13.0 Node runtime migration

## Status and scope

Version 1.13.0 establishes and migrates the supported Node.js runtime from the current CI/local
baseline of Node `25.2.1` and npm `11.6.2` to Node `26.10.0` and npm `11.6.2`. The exact target,
support range, rollback, and validation gates are frozen by the compatibility task. The scope
includes npm, package engines, local setup, CI, TypeScript/node typings, backend runtime behavior,
desktop child-process behavior, packaging, and documentation.

The approved compatibility matrix is:

| Consumer | Current baseline | Target contract |
| --- | --- | --- |
| Local development and scripts | Node `25.2.1`, npm `11.6.2` | Node `26.10.0`, npm `11.6.2` |
| GitHub Actions packaging | Node `25.2.1` on Linux, Windows, and macOS hosts | Node `26.10.0` on all packaging hosts |
| Workspace TypeScript/tooling | `@types/node` `22.20.4`, TypeScript `5.7.2`, `tsx` `4.23.15` | Same versions; runtime-only migration |
| Desktop runtime/tooling | Electron `44.5.1`, electron-builder `26.15.3` | Unchanged; Node migration must not combine an Electron major |

The support contract is Node `>=26.10.0 <26.11.0` and npm `>=11.6.2 <11.7.0`. The rollback target
is Node `25.2.1` with npm `11.6.2`, restoring the prior CI, manifest, lockfile, and documentation
state. Registry evidence confirms Node `26.10.0` is available and executes with npm `11.6.2`.

The migration preserves the single-user, loopback-bound, read-only Kubernetes application boundary.
It does not authorize unrelated framework upgrades, Kubernetes operations, commits, tags, pushes,
or release publication.

## User stories

- As a maintainer, I know the exact supported Node/npm versions for local development and CI.
- As an operator, I can run the backend and packaged desktop runtime on the supported Node contract.
- As a release owner, I can reproduce dependency installation, tests, build, and packaging using
  the approved runtime matrix.

## Requirements

### NODE-BASE - Define and preserve runtime support

1. The specification SHALL freeze exact current and target Node/npm versions, OS/architecture
   assumptions, support floor/ceiling, and rollback plan before implementation.
2. Node runtime changes SHALL not add Kubernetes mutation, expose secrets, weaken Electron security,
   or silently change API behavior.
3. Root/workspace manifests, lockfile, CI, scripts, and current runtime documentation SHALL agree
   on the supported runtime contract.
4. No release publication or artifact replacement is authorized here; commit and push remain
   outside this spec's implementation work.

**Acceptance criteria:** A compatibility matrix identifies every runtime consumer and its validation
gate.

### NODE-001 - Migrate installation and CI runtime

1. CI SHALL use the approved target runtime consistently across packaging and release validation
   jobs.
2. The repository SHALL declare or document the supported Node/npm range without excluding required
   platform hosts or silently permitting an untested runtime.
3. `npm ci` SHALL resolve the committed lockfile reproducibly under the target runtime.

**Acceptance criteria:** Local and CI configuration agree, and a clean-install result is recorded.

### NODE-002 - Preserve workspace behavior

1. Backend, frontend, desktop, tests, scripts, and TypeScript configurations SHALL compile and run
   under the target runtime.
2. Child-process startup, signals, environment handling, filesystem behavior, HTTP/WebSocket paths,
   and Electron handoff SHALL preserve their existing contracts.
3. Any runtime-dependent source change SHALL have a focused regression test or documented evidence.

**Acceptance criteria:** All applicable workspace gates pass and no behavior change is unaccounted
for.

### NODE-003 - Validate delivery and support documentation

1. Build, runtime staging, package input inspection, and available platform package checks SHALL run
   under the target runtime.
2. Documentation SHALL state the supported Node/npm runtime and troubleshooting boundaries.
3. Security and dependency evidence SHALL be refreshed after the runtime migration.

**Acceptance criteria:** Delivery evidence distinguishes available, unavailable, and source-reviewed
checks and is ready for release preparation.

## Out of scope

- Unrelated Electron/framework major upgrades, feature work, Kubernetes access or mutation, signing,
  publication, commit, tag, push, or replacement of existing artifacts.
- Dropping a supported OS/architecture without an explicit separate decision and documentation.

## Definition of done

- Exact Node/npm target and support matrix are approved.
- Local, CI, workspace, desktop, and packaging validation pass or have explicit limitations.
- Lockfile and manifests remain reproducible.
- Current documentation and security/dependency evidence are converged.
- Release owner receives a complete handoff without publication occurring in this spec.
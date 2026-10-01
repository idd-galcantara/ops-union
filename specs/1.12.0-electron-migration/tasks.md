# Implementation Tasks - ops-union v1.12.0 Electron migration

These tasks authorize the approved Electron migration only. They do not authorize release
publication, Kubernetes mutation, or unrelated dependency/toolchain upgrades.

## Final disposition

**Status: Deferred.** The task is closed for the current release cycle because Electron `44.5.1`
is already the latest stable version available and `45.0.0-alpha.13` is not an approved production
target. No migration implementation, validation, or release work is authorized under this spec.

Reopen this spec when a stable Electron major newer than `44.5.1` is available. At that point,
refresh the compatibility matrix and resume the checklist from `1.12.0-ELEC-1`.

## Phase 1 - Baseline and target

- [ ] 1.12.0-ELEC-1 Freeze the Electron compatibility matrix.
  - Record current Electron `44.5.1`, electron-builder `26.15.3`, Node/npm, TypeScript, native
    modules, platform hosts, and candidate target versions.
  - Review authoritative Electron and builder breaking changes and select the exact target.
  - Decide whether Node migration is a prerequisite and record the dependency on v1.13.0.
  - _Owner: @ops-union-version-migration and @ops-union-dependency-security
  - _Copilot agents: @ops-union-version-migration, @ops-union-dependency-security
  - _Requirements: ELEC-BASE.1-ELEC-BASE.4, ELEC-001.1-ELEC-001.3
  - _Validation: current graph/audit baseline and approved compatibility matrix.
  - _Definition of done: exact target, rollback, affected boundaries, and gates are frozen.
  - _Evidence: After v1.11.0, `npm view electron version engines --json` returned Electron
    `44.5.1` with Node `>=22.12.0`; `npm view electron-builder version engines --json` returned
    `26.15.3` with Node `>=14.0.0`. `npm outdated` has no newer wanted Electron version and
    `npm view electron@45` returned `E404`; the only 45 line currently published is the
    pre-release `45.0.0-alpha.13`. The user decision is to await a stable major; the task remains
    pending and no Electron migration files were changed.

## Phase 2 - Migration implementation

- [ ] 1.12.0-ELEC-2 Update Electron/toolchain dependencies and configuration.
  - Change only approved Electron, builder, native, and required transitive dependencies.
  - Keep manifests and lockfile aligned and update configuration required by the selected target.
  - _Owner: @ops-union-version-migration and @ops-union-dependency-maintainer
  - _Copilot agents: @ops-union-version-migration, @ops-union-dependency-maintainer
  - _Dependencies: 1.12.0-ELEC-1
  - _Requirements: ELEC-001.1-ELEC-001.3, ELEC-003.1-ELEC-003.2
  - _Validation: lockfile consistency, focused typecheck/build, and migration-specific tests.
  - _Definition of done: the approved runtime target builds without unrelated upgrades.

- [ ] 1.12.0-ELEC-3 Preserve main, preload, renderer, and backend lifecycle contracts.
  - Repair only target-version compatibility issues in startup, IPC, preload, navigation, child
    process, window close, and shutdown paths.
  - Add focused regression coverage for any changed contract or previously unavailable scenario.
  - _Owner: @ops-union-backend and @ops-union-frontend
  - _Copilot agents: @ops-union-backend, @ops-union-frontend
  - _Dependencies: 1.12.0-ELEC-2
  - _Requirements: ELEC-BASE.1-ELEC-BASE.2, ELEC-002.1-ELEC-002.3
  - _Validation: desktop/backend/frontend typechecks and focused lifecycle/security tests.
  - _Definition of done: no capability, navigation, or read-only boundary is widened.

## Phase 3 - Integration and convergence

- [ ] 1.12.0-ELEC-4 Validate desktop runtime and packaging.
  - Run available Electron startup, renderer URL, navigation/window, IPC, and shutdown smoke.
  - Run build, runtime staging, package input inspection, and available platform archive checks.
  - Record unavailable display, platform, signing, or archive checks with residual risk.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.12.0-ELEC-3
  - _Requirements: ELEC-002.1-ELEC-003.3
  - _Validation: `npm run typecheck`, tests, `npm run build`, staging, and applicable package checks.
  - _Definition of done: all available desktop/package evidence passes or is explicitly limited.

- [ ] 1.12.0-ELEC-5 Converge security and current documentation.
  - Compare post-migration dependency/security evidence with the baseline.
  - Update current runtime, support, packaging, and security documentation only after validation.
  - _Owner: @ops-union-docs-convergence and @ops-union-dependency-security
  - _Copilot agents: @ops-union-docs-convergence, @ops-union-dependency-security
  - _Dependencies: 1.12.0-ELEC-4
  - _Requirements: ELEC-004.1-ELEC-004.3
  - _Validation: evidence-to-document review and `git diff --check`.
  - _Definition of done: migration is ready for release preparation, not yet published.
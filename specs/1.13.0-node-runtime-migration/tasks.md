# Implementation Tasks - ops-union v1.13.0 Node runtime migration

These tasks authorize the approved Node/npm runtime migration only. They do not authorize unrelated
framework upgrades, Kubernetes mutation, or release publication.

## Phase 1 - Baseline and target

- [x] 1.13.0-NODE-1 Freeze the Node/npm compatibility matrix.
  - Record current CI/local Node `25.2.1`, npm, workspace engines/typings, Electron/builder,
    native dependencies, OS hosts, and candidate Node 26 LTS patch.
  - Review runtime and package compatibility and approve the exact target, support floor, rollback,
    and validation gates.
  - _Owner: @ops-union-version-migration and @ops-union-dependency-security
  - _Copilot agents: @ops-union-version-migration, @ops-union-dependency-security
  - _Requirements: NODE-BASE.1-NODE-BASE.4, NODE-001.1-NODE-001.3
  - _Validation: runtime/version inventory, dependency baseline, and compatibility matrix.
  - _Definition of done: exact target and support policy are frozen before edits.
  - _Evidence: Baseline Node `25.2.1`/npm `11.6.2` passed clean install, `0 vulnerabilities`,
    backend tests `104/104`, frontend tests `148/148`, all typechecks, and the root build. The
    approved target `26.10.0` was executed with `npm exec` and reported Node `v26.10.0` and npm
    `11.6.2`; the matrix and rollback target are recorded in requirements/design.

## Phase 2 - Runtime contract and implementation

- [x] 1.13.0-NODE-2 Update runtime declarations, CI, and installation contract.
  - Update approved Node/npm setup, engines/documentation, CI jobs, and lockfile-sensitive scripts.
  - Keep all packaging jobs on the same approved runtime unless the matrix explicitly documents a
    platform exception.
  - _Owner: @ops-union-version-migration
  - _Copilot agent: @ops-union-version-migration
  - _Dependencies: 1.13.0-NODE-1
  - _Requirements: NODE-001.1-NODE-001.3
  - _Validation: clean `npm ci`, runtime/version checks, and CI configuration review.
  - _Definition of done: local and CI runtime contracts agree.
  - _Evidence: Root/package lock engines, README setup instructions, and all three CI packaging
    jobs now target Node `26.10.0` and npm `11.6.2`. Target `npm ci --ignore-scripts` completed
    without engine warnings or vulnerabilities.

- [x] 1.13.0-NODE-3 Repair and test workspace runtime compatibility.
  - Resolve only target-runtime issues in backend, frontend tooling, desktop child process,
    TypeScript/node typings, scripts, and package staging.
  - Add focused regression tests for changed signals, filesystem, HTTP/WebSocket, or Electron
    handoff behavior.
  - _Owner: @ops-union-backend, @ops-union-frontend, and @ops-union-version-migration
  - _Copilot agents: @ops-union-backend, @ops-union-frontend, @ops-union-version-migration
  - _Dependencies: 1.13.0-NODE-2
  - _Requirements: NODE-BASE.2-NODE-BASE.3, NODE-002.1-NODE-002.3
  - _Validation: workspace typechecks, focused tests, backend child lifecycle, and build.
  - _Definition of done: no runtime-dependent behavior change remains unexplained.
  - _Evidence: No runtime-dependent source repair was required. Under Node `26.10.0`, all
    workspace typechecks passed, backend tests passed `104/104`, frontend tests passed `148/148`,
    and the root build passed; Electron remains `44.5.1`.

## Phase 3 - Delivery and convergence

- [x] 1.13.0-NODE-4 Validate clean install, build, desktop, and packaging paths.
  - Run dependency audit, workspace tests/typechecks, root build, runtime staging, and available
    platform package/archive checks under the target runtime.
  - Record unavailable host/signing/archive/CI checks and residual risk explicitly.
  - Confirm no Kubernetes mutation or secret exposure was introduced.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.13.0-NODE-3
  - _Requirements: NODE-002.1-NODE-002.3, NODE-003.1
  - _Validation: full runtime gate matrix with exact commands and outcomes.
  - _Definition of done: all available delivery checks pass or are explicitly limited.
  - _Evidence: Node `26.10.0` clean install, production audit (`0 vulnerabilities`), typechecks,
    tests, build, desktop runtime staging, and five-root package inspection passed. Linux AppImage
    and `.deb` packaging passed. Windows/macOS packaging, signing, and live CI remain unavailable
    on this Linux host and are explicitly limited rather than claimed.

- [x] 1.13.0-NODE-5 Converge security and current documentation.
  - Compare post-migration dependency/security results with the baseline.
  - Update current setup, support, release, and troubleshooting documentation after evidence exists.
  - _Owner: @ops-union-docs-convergence and @ops-union-dependency-security
  - _Copilot agents: @ops-union-docs-convergence, @ops-union-dependency-security
  - _Dependencies: 1.13.0-NODE-4
  - _Requirements: NODE-003.2-NODE-003.3
  - _Validation: evidence-to-document review and `git diff --check`.
  - _Definition of done: the migration is ready for release preparation without publication.
  - _Evidence: README, package engines, lockfile, CI, requirements, design, tasks, and the
    security audit now record the Node `26.10.0`/npm `11.6.2` contract. `git diff --check` passed;
    no commit, tag, push, or release was created by this implementation.
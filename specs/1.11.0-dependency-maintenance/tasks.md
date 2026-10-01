# Implementation Tasks - ops-union v1.11.0 dependency maintenance

These tasks authorize only the approved compatible dependency work described in the requirements.
They do not authorize major migrations, Kubernetes mutation, release publication, or commits.

## Phase 1 - Baseline and triage

- [x] 1.11.0-DEP-1 Establish dependency and vulnerability baseline.
  - Inspect root/workspace manifests, lockfile, CI, runtime staging, and package inspection.
  - Run non-mutating audit and targeted graph checks; redact sensitive output.
  - Classify findings by reachability, severity, and recommended owner.
  - _Owner: @ops-union-dependency-security
  - _Copilot agent: @ops-union-dependency-security
  - _Requirements: DEP-BASE.1-DEP-BASE.4, DEP-001.1-DEP-001.3
  - _Validation: `npm audit --omit=dev`, targeted `npm explain`, manifest/lockfile review.
  - _Definition of done: a reproducible baseline and finding list exists without dependency edits.
  - _Evidence: `npm audit --omit=dev` reported `0 vulnerabilities`. The lockfile graph resolved
    `@kubernetes/client-node@1.4.0`, `express@4.22.3`, `electron@44.4.0`, and the approved
    patch/minor candidates; `npm explain ip-address`, `electron`, `express`, and `ws` showed no
    unresolved production advisory. Major/latest-only candidates were excluded from this release.

- [x] 1.11.0-DEP-2 Approve the compatible update set.
  - Review changelogs, engines, peer dependencies, advisories, and native/package-builder impact.
  - Separate patch/minor maintenance from major or runtime migration candidates.
  - Record exact package names, current versions, target versions, and exclusion reasons.
  - _Owner: @ops-union-dependency-security and @ops-union-dependency-maintainer
  - _Copilot agents: @ops-union-dependency-security, @ops-union-dependency-maintainer
  - _Dependencies: 1.11.0-DEP-1
  - _Requirements: DEP-002.1-DEP-002.3
  - _Validation: approved package list and migration handoff list.
  - _Definition of done: implementation scope is fixed before manifest changes begin.
  - _Evidence: Approved updates were `@types/node` to `^22.20.4`, `@types/ws` to `^8.18.2`,
    `tsx` to `^4.23.15`, `undici` to `^6.29.0`, `ws` to `^8.22.0`, and Electron to `^44.5.1`.
    Express 5, Vite 8, TypeScript 7, React tooling majors, and Kubernetes client 2 were excluded.

## Phase 2 - Maintenance implementation

- [x] 1.11.0-DEP-3 Apply approved updates and synchronize the lockfile.
  - Update only the approved dependency group and preserve workspace contracts.
  - Verify `package.json` and `package-lock.json` consistency and reproducible installation.
  - _Owner: @ops-union-dependency-maintainer
  - _Copilot agent: @ops-union-dependency-maintainer
  - _Dependencies: 1.11.0-DEP-2
  - _Requirements: DEP-BASE.1-DEP-BASE.4, DEP-003.1
  - _Validation: lockfile consistency, `npm ci` where permitted, focused affected checks.
  - _Definition of done: only approved packages changed and the lockfile resolves deterministically.
  - _Evidence: `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` passed;
    `npm ci --ignore-scripts --no-audit --no-fund` installed 502 packages; `npm ls --workspaces
    --depth=0` resolved the approved versions without invalid packages.

- [x] 1.11.0-DEP-4 Run workspace, package, and read-only validation.
  - Run audit, typechecks, backend/frontend tests, build, and applicable desktop/package checks.
  - Review backend/frontend regressions with the owning specialists where needed.
  - Confirm no secret exposure, privilege expansion, or Kubernetes mutation was introduced.
  - _Owner: @ops-union-dependency-maintainer and @ops-union-integration-qa
  - _Copilot agents: @ops-union-dependency-maintainer, @ops-union-integration-qa
  - _Dependencies: 1.11.0-DEP-3
  - _Requirements: DEP-003.2-DEP-003.3
  - _Validation: repository gate matrix with command, result, environment, and limitation.
  - _Definition of done: all available gates pass and unavailable checks have explicit owners.
  - _Evidence: `npm run security:prepackage` passed; backend tests passed `104/104`, frontend
    tests passed `148/148`, all workspace typechecks and `npm run build` passed. Runtime staging
    and `node scripts/inspect-package.mjs` passed for five resource roots. No Kubernetes command,
    package publication, or release artifact replacement was performed.

## Phase 3 - Convergence

- [x] 1.11.0-DEP-5 Converge security and current documentation evidence.
  - Update current security/dependency status only after executable evidence exists.
  - Reconcile current runtime/support documentation without rewriting historical specs.
  - _Owner: @ops-union-docs-convergence and @ops-union-dependency-security
  - _Copilot agents: @ops-union-docs-convergence, @ops-union-dependency-security
  - _Dependencies: 1.11.0-DEP-4
  - _Requirements: DEP-004.1-DEP-004.3
  - _Validation: evidence-to-document review and `git diff --check`.
  - _Definition of done: the handoff is ready for release preparation, with no release action taken.
  - _Evidence: Current dependency evidence was updated in `docs/SECURITY-AUDIT.md`; historical
    v1.9.0 findings were left unchanged. Final `git diff --check` passed and no commit, tag, push,
    or publication was performed.
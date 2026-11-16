# Implementation Tasks - ops-union v1.21.0 kubeconfig partial CA trust

These tasks document the local implementation of PCT-1 through PCT-4. They do not authorize a
commit, push, tag, package, or release.

## Implementation

- [x] 1.21.0-PCT-1 Add kubeconfig-scoped partial-chain TLS trust.
  - Add `PartialCaTrustKubeConfig` and use it for context-scoped clients.
  - Apply `allowPartialTrustChain` to direct and proxied REST TLS options and direct HTTPS agents.
  - Remove the system CA-bundle concatenation path.
  - _Requirements: PCT-1, PCT-2, PCT-3_

- [x] 1.21.0-PCT-2 Add focused TLS-option tests.
  - Cover direct REST, proxied REST, WebSocket HTTPS agents, absence of configured CA, and
    preservation of certificate verification.
  - _Requirements: PCT-4.1-PCT-4.2_

- [x] 1.21.0-PCT-3 Update directly related documentation.
  - Update the architecture note, repository tree, and security-audit summary to describe the
    kubeconfig CA trust-anchor behavior.
  - _Requirements: PCT-3_

- [x] 1.21.0-PCT-4 Validate backend behavior.
  - Run backend typecheck, tests, build, and whitespace validation.
  - Run a read-only TLS/API request for each affected context using the kubeconfig CA and the
    modified Undici dispatcher, without credentials or Kubernetes mutations.
  - _Requirements: PCT-4_

## Validation record

- Node.js 26.10.0 / npm 11.6.2 toolchain validation: PASS (temporary WSL toolchain).
- Backend typecheck: PASS.
- Backend tests: PASS — 116 passed, 0 failed.
- Backend build: PASS.
- `git diff --check`: PASS.
- Live TLS/API smoke check: PASS — both affected contexts returned HTTP 200 using the kubeconfig CA
  with partial-chain verification and no authentication credentials.
- System trust store: not changed.
- Packaged-runtime/Electron launch: NOT RUN.
- Installation of the new build over the existing WSL application: NOT RUN.
- Git commit/push/tag/release: NOT DONE.

## Release note

The latest existing spec is v1.20.0; this work is documented as the next minor version, v1.21.0.
The repository package version remains 1.20.0 until the separate versioning/release process.

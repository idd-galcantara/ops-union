# Design - ops-union v1.11.0 dependency maintenance

## Release intent

v1.11.0 is a focused dependency-maintenance release. Its sequence is:

```text
dependency baseline
  -> advisory and reachability triage
  -> approved compatible package list
  -> manifest/lockfile update
  -> workspace and integration validation
  -> security/documentation convergence
```

No package is updated merely because a newer version exists. The approved list is the boundary for
implementation.

## Ownership boundaries

- `@ops-union-dependency-security` owns the read-only graph, advisory, reachability, and supply-chain
  baseline.
- `@ops-union-dependency-maintainer` owns compatible patch/minor updates and lockfile alignment.
- `@ops-union-version-migration` owns any rejected major/runtime/framework migration discovered by
  the baseline.
- `@ops-union-backend` owns backend contract regressions and backend-specific validation.
- `@ops-union-frontend` owns frontend/tooling regressions and UI contract validation.
- `@ops-union-integration-qa` owns cross-workspace, desktop, package, and read-only validation.
- `@ops-union-docs-convergence` owns current documentation updates after executable evidence.

## Dependency decision rules

| Finding | Decision |
| --- | --- |
| Patch/minor with compatible API and engines | Maintain in v1.11.0 |
| Transitive fix with stable resolution | Maintain in v1.11.0 |
| Peer dependency adjustment without platform change | Maintain after focused validation |
| Major, removed API, runtime, native, or framework change | Hand off to migration spec |
| No fix or uncertain exploitability | Record accepted risk and monitoring owner |

The package graph is evaluated from the lockfile and actual import/build/package paths. A clean
audit is not treated as proof that supply-chain or maintenance risk is absent.

## Validation model

The maintainer runs the narrowest affected checks first, then the repository gates:

- `npm audit --omit=dev`;
- `npm run typecheck`;
- `npm test --workspace=backend`;
- `npm test --workspace=frontend`;
- `npm run build`;
- package/runtime inspection when the changed dependency is shipped in the desktop artifact.

No live Kubernetes request is required. Any integration check that uses a cluster remains strictly
read-only and is owned by integration QA.

## Rollback and handoff

The approved package list, manifest diff, lockfile diff, audit result, and validation evidence form
the rollback record. Release preparation is a separate action owned by `ops-union-release`.
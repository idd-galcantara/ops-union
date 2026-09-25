# Design - ops-union v1.5.3 refresh filter preservation

## Overview

The frontend pod store remains the ownership boundary for loading pod data and deciding whether a
load starts a new view query or preserves the current view. `loadPods` accepts optional
`resetView?: boolean`. Explicit target selection uses reset semantics by default; refresh, retry,
auto-refresh, and application log inventory refresh use `resetView: false` and remain non-explicit.

The implementation changes action intent at existing call sites rather than introducing a second
filter store or a separate refresh pipeline. The existing silent auto-refresh behavior remains
silent.

## Ownership and collaboration

- `@ops-union-frontend` owns the `loadPods` options contract, reset/preserve state transitions,
  target selector and launchpad routing, toolbar refresh, auto-refresh, retry, application log
  inventory refresh, and frontend tests.
- `@ops-union-integration-qa` owns read-only/non-regression checks, frontend typecheck, touched-file
  diagnostics, and the validation record.
- `@ops-union-architecture-review` may audit the state ownership and explicit-query boundary; no
  backend implementation is required.
- No backend, Kubernetes, packaging, release, commit, or push work is part of this specification.

## Load intent and state transitions

The store distinguishes two intents:

- **Explicit fetch:** a target selector or initial launchpad action requests pods for a new target.
  The call uses reset semantics, clears the current filter and covered view state, and emits the
  existing new-explicit-query signal.
- **Preserving load:** toolbar refresh, auto-refresh, error retry, and application log inventory
  refresh update their owned data while retaining the current filter and covered view state. These
  calls pass `resetView: false` and do not emit the explicit-query signal.

For compatibility, the explicit-fetch path defaults `resetView` to true when the option is omitted.
The preserve path is explicit at call sites so a refresh cannot accidentally inherit reset behavior.
A failed preserving load leaves view state available for the next retry. A later explicit fetch
clears that state as the new query begins.

## Contract

`loadPods` options gain:

- `resetView?: boolean`: controls whether the existing view reset semantics run for the load;
  omitted/true is the explicit-fetch behavior, while false preserves the view.

The contract covers the existing pod text filter and other view state already owned by the unified
Pods store, such as selection/detail or expansion state where present. It does not redefine the
filtering algorithm, sorting semantics, server query parameters, log inventory contents, or backend
responses.

## Call-site routing

1. The target selector and initial launchpad `Fetch pods` action invoke the explicit-fetch path.
2. The toolbar refresh invokes `loadPods({ resetView: false })` or the equivalent existing options
   shape.
3. Auto-refresh continues to invoke its existing silent load path with `resetView: false`.
4. Error retry invokes the preserving load path with `resetView: false`.
5. Application log inventory refresh updates its inventory through the existing path and preserves
   the unified Pods store view; it does not become an explicit pod query.

## Validation strategy

- Frontend tests exercise each load intent with a non-empty filter and representative view state,
  then verify reset, preservation, and explicit-query signaling.
- The test suite verifies the store boundary and the relevant UI/action routing without changing
  backend or Kubernetes behavior.
- Frontend typecheck and touched-file diagnostics are required. The known validation record is
  frontend tests 110/110, frontend typecheck passed, and no touched-file diagnostic errors.
- No live-cluster mutation, packaging, release, commit, or push validation is required or allowed.

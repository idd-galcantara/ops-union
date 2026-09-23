# Design - ops-union v1.5.1 pod termination history

## Overview

The existing backend `getPodDescribe` call already reads one pod and its namespace events. The
change keeps that boundary and enriches its normalized response. Kubernetes status fields are
mapped into a small state snapshot so optional fields remain optional. A second normalized array
combines terminated container snapshots and pod events, sorted by timestamp newest first.

## Ownership and collaboration

- `@ops-union-backend` owns Kubernetes state mapping, timeline normalization, and backend tests.
- `@ops-union-frontend` owns the shared describe types, collapsible PodDetailsPanel presentation,
  and frontend tests/helpers.
- `@ops-union-integration-qa` owns read-only, graceful-degradation, accessibility, and release-scope
  evidence.
- `@ops-union-docs-convergence` audits current documentation after implementation and validation.
- No release, packaging, commit, push, or Kubernetes mutation is part of this specification.

## Response model

`ContainerDetail` retains `state` and `reason` for compatibility and adds optional `message`,
`exitCode`, `signal`, `finishedAt`, and `lastState`. `lastState` uses the same normalized optional
state fields. `PodDescribe.terminationHistory` contains entries with `source: 'container' | 'event'`.
Container entries carry the container name and termination metadata; event entries carry event type,
reason, message, count, and timestamp. The timeline is a view of the current API response, not an
independent history store.

## Normalization algorithm

1. Read regular containers and native sidecars exactly as the existing describe implementation does.
2. For each status, normalize current state and last state from the Kubernetes union fields.
3. Add current and last states to the timeline only when a terminated state is present, because those
   are termination/restart evidence. Use `finishedAt` as the container timestamp.
4. Convert the already-fetched pod events into timeline entries and retain the existing `events`
   response for compatibility.
5. Sort all entries by parseable timestamp descending. Keep entries with no timestamp after dated
   entries, preserving source order for equal/unknown timestamps.
6. If event listing fails, return container-derived entries and the existing `eventsError` field.

## Presentation

The Describe tab adds a native `<details>` disclosure after the regular container/condition/event
sections. It starts closed so normal details remain compact. The summary includes the entry count,
and the body renders a short timeline with state metadata, exit code/signal, finished time, event
reason/message, and a note that the view reflects the current pod only. Existing events remain in
their established section to avoid changing current scanning behavior.

## Validation strategy

- Backend unit tests exercise the pure state/timeline normalization with representative Kubernetes
  objects, absent optional values, and undated events.
- Frontend tests exercise the presentation/formatting helper used by the disclosure, including
  empty input and optional metadata.
- Run backend and frontend focused tests, both typechecks, build if available, and `git diff --check`.
- Browser/Electron and real-cluster checks are evidence gates when available, otherwise limitations
  are recorded honestly. No collector or multi-day durability claim is made.
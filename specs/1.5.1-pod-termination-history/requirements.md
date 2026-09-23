# Requirements - ops-union v1.5.1 pod termination history

## Scope

Version 1.5.1 adds a read-only, best-effort termination and restart history to the existing pod
describe flow. The first version is limited to information Kubernetes exposes on the current pod:
container current state, last state, termination reason/message, exit code/signal, finished time,
and namespace pod events. It does not add a collector, persistence, watch, mutation, or durable
multi-day history.

## User stories

- As an operator, I can inspect why a container is currently terminated or waiting without leaving
  the existing pod details view.
- As an operator, I can expand a discreet diagnostics section to see recent container state and
  pod-event evidence ordered newest first.
- As an operator, I can still use pod details when events or optional termination fields are absent
  or inaccessible.
- As a security-conscious user, I can verify that the feature remains read-only and does not expose
  kubeconfig credentials or add Kubernetes mutation capability.

## Requirements

### PH-1 - Describe contract enrichment

1. The existing pod describe API SHALL retain all existing fields and add optional structured
   current and last container state data.
2. Container state data SHALL preserve available state, reason, message, exit code, signal, and
   finishedAt values without inventing values for fields Kubernetes omits.
3. The describe response SHALL expose a normalized `terminationHistory` timeline combining available
   terminated/current container state and pod events.
4. Timeline entries SHALL identify their source/container where applicable and SHALL be ordered
   newest first; entries without timestamps SHALL degrade predictably rather than failing the request.
5. Missing status fields, missing event timestamps, empty event lists, and event-list permission
   failures SHALL preserve the existing successful describe response shape and graceful behavior.

### PH-2 - Read-only and bounded behavior

1. The implementation SHALL use only the existing pod read and namespace event list calls.
2. It SHALL not add Kubernetes watches, mutations, long-running collectors, local persistence, or
   arbitrary command execution.
3. The timeline SHALL describe only data available in the current pod object and currently returned
   pod events; it SHALL not claim durable multi-day history.
4. Existing route status/error handling and event permission degradation SHALL remain unchanged.

### PH-3 - Pod details presentation

1. The existing Describe tab SHALL remain uncluttered by default.
2. It SHALL include a discreet, accessible collapsible section named `Advanced diagnostics` or an
   equivalent label for the termination/restart timeline.
3. The section SHALL show an empty-state message when no timeline entries are available and SHALL
   surface event-read degradation without hiding container details.
4. Timeline text SHALL fit the existing panel at supported narrow widths without introducing page
   overflow or incoherent overlap.
5. The presentation SHALL not offer mutation controls or imply that the history is durable.

### PH-4 - Focused verification

1. Backend tests SHALL cover normalization of current and last terminated states, exit code/signal,
   finishedAt, event merging, newest-first ordering, and missing fields.
2. Frontend tests SHALL cover the shared response types/normalization or presentation helpers and
   the empty/degraded timeline behavior where the repository test setup permits.
3. Existing backend/frontend typechecks and focused test suites SHALL pass.
4. Validation SHALL record that browser/Electron and real-cluster checks are unavailable when they
   cannot be run; no Kubernetes mutation is permitted.

## Definition of done

- The describe API exposes enriched container state and a normalized newest-first termination timeline.
- The PodDetailsPanel keeps the timeline behind an accessible collapsed Advanced diagnostics section.
- Missing fields and event failures degrade gracefully, and existing describe/metrics/log behavior is
  preserved.
- Focused backend/frontend tests and package checks pass with read-only boundaries intact.
- The spec task list records evidence and explicitly documents the non-durable, current-pod-only limit.
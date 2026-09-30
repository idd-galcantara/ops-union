# Design - ops-union v1.6.1 pod list logs entry

## Release status

The v1.6.1 implementation is complete. It narrows the log workflow to the pod details panel and
removes multi-pod selection from the unified pod table.

## Existing flow retained

The row click remains the table's navigation action:

```text
PodTable row click
  -> App.openPod(pod)
  -> PodDetailsPanel
  -> Logs tab
  -> ApplicationLogSourceModal
  -> LogViewer
```

The source modal remains responsible for choosing the contexts, pods, and containers that belong to
one application log session. Its checkboxes and disclosure controls are intentionally unchanged.

## Frontend changes

- `PodTable` no longer accepts `selectedPods` or `onTogglePod`.
- `PodTable` no longer renders the leading checkbox column or pod-selection cells.
- `App` no longer owns `selectedPodKeys` or the list-level `Open logs` action.
- The list-level multiple-application warning is removed with the list-selection flow.
- `openCurrentLogSources` and `PodDetailsPanel.onOpenLogs` remain the entry point for logs.
- The single-application guard remains in the details-to-source flow as a defensive invariant.

## State boundary

The removed state was only a transient convenience for launching logs from the table. The persisted
Workspace catalog, current targets, pods, filters, details selection, log source selection, and log
session state remain separate. Selecting sources in the modal is still allowed because it configures
the stream after the user has entered the Logs workflow.

## Validation record

- `npm run typecheck --workspace=frontend`: passed.
- `npm test --workspace=frontend`: passed, 116 tests.
- `git diff --check`: passed.
- Touched-file diagnostics for `frontend/src/App.tsx` and
  `frontend/src/components/PodTable.tsx`: no errors.

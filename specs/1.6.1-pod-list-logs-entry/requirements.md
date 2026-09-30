# Requirements - ops-union v1.6.1 pod list logs entry

## Status and scope

This document records the implemented v1.6.1 UX refinement. The change removes pod selection and
list-level log launching from the unified pod table. Logs remain available from the selected pod's
details panel through the Logs tab and its existing source-selection flow.

The change preserves the read-only Kubernetes boundary, the pod details flow, the aggregate logs
workspace, and the source selection controls inside the logs source modal. It does not change the
Workspace catalog, target querying, grouping, filtering, or log transport contracts.

## Requirements

### PL-1 - Pod table navigation

1. Each pod row SHALL remain clickable and SHALL open the details panel for that pod.
2. The table SHALL NOT render a pod-selection checkbox or another list-level selection control.
3. The table summary SHALL NOT expose a list-level Open logs action or a multiple-application
   selection warning.
4. Grouping, filtering, pagination, row keyboard activation, and the selected-details highlight
   SHALL remain available.

### PL-2 - Details-first logs access

1. The details panel SHALL continue to expose Describe, Metrics, and Logs sections as applicable.
2. Opening the Logs tab for a pod SHALL continue to enter the existing log-source selection flow.
3. After source confirmation, the existing aggregate log viewer SHALL open without requiring a pod
   selection from the unified table.
4. Source selection inside the log-source modal MAY continue to select contexts, pods, and containers
   because that selection defines the log stream, not pod-table navigation.

### PL-3 - State and safety

1. Removing list selection SHALL remove its related transient state and actions from the App shell.
2. No new backend route, Kubernetes operation, or log transport behavior SHALL be introduced.
3. Workspace switching, refresh, retry, and explicit pod queries SHALL retain their existing state
   reset behavior.
4. The change SHALL preserve the existing single-application source-scope guard.

## Definition of done

- The unified pod list has no pod-selection checkbox.
- The unified pod list has no list-level Open logs button.
- Clicking a pod opens details, and the Logs tab remains the supported log entry point.
- The logs source modal still supports source and container selection.
- Frontend typecheck, tests, and diff validation pass.
- Documentation and release metadata identify the change as v1.6.1.

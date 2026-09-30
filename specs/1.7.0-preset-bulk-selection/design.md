# Design - ops-union v1.7.0 preset multi-selection and bulk deletion

## Release status

This is a planned design for v1.7.0. It defines the selection and bulk-deletion contract without
claiming implementation or validation evidence.

## Overview

The Active Workspace preset library changes from row-level destructive actions plus `Delete all` to
a selection-oriented surface. Each row has a stable-id checkbox. The list header uses the same
selection semantics as the existing Workspace listing, including its eligible-row scope and
indeterminate state. A single selected-delete action opens the existing custom confirmation pattern.

Bulk deletion is a catalog operation only. It does not apply presets, reset the operational view,
fetch pods, or change Kubernetes state. If the active preset is included, the saved reference and
its dirty state are reconciled, but the live targets and all current results and controls remain.
This deliberately supersedes the v1.6.4 active-preset deletion reset behavior for this release.

## Ownership boundaries

- The existing preset-library owner owns row selection presentation, master-checkbox state,
  selection count, clear-selection, list-scope reconciliation, and deletion intent.
- A shared selection helper or the existing Workspace-list selection owner should provide the same
  eligible-row, indeterminate, and stale-id semantics; the preset library must not invent a second
  interpretation.
- A shared confirmation component owns semantic dialog markup, focus containment/restoration,
  Escape/backdrop dismissal, pending presentation, and pointer/keyboard isolation. It does not call
  the store or know preset semantics.
- `useOpsFlowStore` remains authoritative for preset records, Active Workspace scope, active-preset
  references, dirty state, persistence, and the atomic bulk-deletion boundary.
- The store operation should build and persist one next catalog from validated ids. It must not loop
  through independent UI deletions or optimistically clear the live view.
- `@ops-union-frontend` owns selection UI, store routing, copy, accessibility, and focused tests.
- `@ops-union-integration-qa` owns web/desktop interaction, accessibility, responsive, failure, and
  read-only boundary validation.
- `@ops-union-architecture-review` owns a read-only audit of selection scope, active-reference
  reconciliation, exact ids, and absence of query/Kubernetes paths.
- `@ops-union-backend` has no implementation task. A read-only boundary check is permitted only if
  review finds an unexpected backend dependency; no backend change is authorized.
- `repository maintainer` owns later documentation convergence and release administration only.

## Selection model and state transitions

Selection is ephemeral UI state:

```ts
type PresetSelection = Set<string>; // stable local preset ids
```

The list derives `eligibleIds` using the same scope and filtering rules as the Workspace listing.
The master checkbox is:

- unchecked when no eligible id is selected;
- checked when every eligible id is selected; and
- indeterminate when some, but not all, eligible ids are selected.

Select-all and clear-selection use the existing Workspace-list interaction contract. Selection is
intersected with the current valid Active Workspace ids after catalog, Workspace, or filter changes;
it is never remapped by index. Individual row toggles preserve unrelated selected ids.

The flow is:

```text
library idle
  -> selection changes (local state only)
  -> selected-delete intent (catalog unchanged)
  -> confirmation open (catalog unchanged)
  -> confirm pending (selection/list remain mounted)
  -> validated atomic delete
  -> store-backed catalog rendered
  -> selection cleared for removed ids
```

Cancel, Escape, backdrop dismissal, missing-record rejection, and persistence failure leave the last
confirmed catalog and live operational state unchanged. On successful deletion, removed ids are
cleared from selection; surviving selected ids may remain selected only if the local list contract
already preserves them, otherwise the implementation should clear all selection for a deterministic
post-operation state.

## Confirmation contract

The dialog reuses the v1.6.3 custom confirmation behavior. Its payload is tied to a snapshot of
stable ids and revalidated at submit. It shows selected count, names, target-count/summary context,
Active Workspace, and the special active-preset consequence when applicable. It says explicitly that
saved presets are removed while current targets, pods, filters, logs, query state, and other live
view state remain.

The primary library stays mounted under the dialog. While pending, the delete action, row checkboxes,
select-all, clear-selection, search changes, and competing preset actions are disabled according to
the existing modal policy. A missing id or changed Active Workspace produces safe local feedback and
no positional fallback. Confirm invokes the bulk store boundary once.

## Store and active-reference behavior

The bulk operation receives validated ids and the expected Active Workspace identity. Before commit it
must verify that each selected id still belongs to that Workspace. It creates a next catalog by
removing exactly those records, then reconciles the active reference:

```text
selected inactive presets
  -> remove saved records
  -> preserve active reference and live view
selected active preset
  -> remove saved record
  -> clear active preset id and dirty state
  -> preserve current targets, pods, filters, logs, query state, and details
```

The current targets can become live-search/outside-Workspace after the active saved reference is
cleared. The deletion path must not call `resetWorkspaceView`, `applyPresetAndLoad`, `applyPreset`,
or `loadPods`. Existing request state, pod results, log sessions, filters, and selected details are
not catalog data and remain untouched.

Persistence uses the existing platform adapter. The store should commit one validated next catalog
atomically according to the existing web/desktop boundary. A write failure restores or retains the
last confirmed catalog and produces safe local feedback; it must not report partial success.

## UI and accessibility

The library presents a compact selection toolbar only when selection exists, with selected count,
clear-selection, and selected-delete controls using the product's existing icon/label conventions.
The header checkbox has an accessible name that describes its eligible scope and exposes its
indeterminate state to assistive technology. Row checkboxes name the preset.

The confirmation dialog uses `role="dialog"`, `aria-modal="true"`, labelled title and description,
visible focus, predictable initial focus, focus containment, Escape/backdrop dismissal, and focus
restoration. Long selected-name lists use a readable summary with an accessible full value. Narrow
windows and both themes must keep the count, actions, and error status legible without overlap.

## Product boundaries and validation strategy

The implementation is frontend-only. Selection, confirmation, and deletion cannot trigger a
Kubernetes read/write, backend route, preset application, or target reset. Existing full library,
Workspace, import/export, and explicit apply paths remain reachable.

Validation must cover:

- row selection, master checked/unchecked/indeterminate states, clear-selection, filtering, and
  stale-id reconciliation against the Workspace-list contract;
- exact selected ids and one store invocation;
- inactive and active preset deletion with all live operational fields preserved;
- cancel, Escape, backdrop, missing ids, pending duplicate submits, and persistence failure;
- `Delete all` absence and no action for an empty selection;
- focus, accessible names, responsive layouts, web/desktop smoke behavior; and
- read-only/no-query architecture checks plus typecheck, tests, diagnostics, and diff checks.

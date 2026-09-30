# Requirements - ops-union v1.7.0 preset multi-selection and bulk deletion

## Status and scope

This is the planned v1.7.0 specification for selecting multiple presets in the Active Workspace and
removing them in one confirmed operation. It extends the existing preset-library listing, the
Workspace listing selection pattern, and the custom destructive confirmation contract from v1.6.3.
It changes saved-preset management only; it does not change preset application, Kubernetes access,
persistence format, or the current operational view.

The scope covers:

- one stable-id checkbox per visible preset row;
- select-all, indeterminate, and clear-selection behavior aligned with the existing Workspace list;
- one confirmed delete action for the selected presets;
- removal of the `Delete all` action;
- active-preset reference reconciliation; and
- preservation of targets, pods, filters, logs, query state, and other operational state.

## Glossary

- **Preset selection:** The local set of saved preset ids selected in the current preset listing.
- **Eligible rows:** The same list scope used by the Workspace listing's select-all control, including
  its current filtering and reconciliation rules.
- **Bulk deletion:** One persisted operation that removes the selected preset ids from the Active
  Workspace rather than issuing one user-visible delete flow per row.
- **Active preset:** The saved preset currently associated with the live target selection.
- **Operational state:** Current targets, namespaces, pods, loading/errors, query state, filters,
  selected pod/details state, logs, and related live view state.

## User stories

- As an operator, I can select several presets directly from the library and remove them with one
  clear confirmation.
- As an operator, I can select or clear the complete eligible listing using the same interaction as
  the Workspace manager.
- As an operator, I can remove the active saved preset without losing the live targets, results,
  filters, or logs I am inspecting.
- As a keyboard or assistive-technology user, I can understand selection counts and confirm or cancel
  the destructive action safely.

## Requirements

### BS-1 - Preset row selection and list behavior

1. Each eligible preset row SHALL expose a labeled checkbox bound to its stable preset id, not to its
   current array position or display name.
2. The preset listing SHALL expose the same select-all control, checked/unchecked/indeterminate
   states, clear-selection action, selection reconciliation, and list-scope semantics used by the
   existing Workspace listing.
3. Select-all SHALL select every currently eligible row in that same list scope; it SHALL not select
   hidden or filtered-out rows when the Workspace listing does not do so.
4. Clearing selection SHALL remove every selected preset id without changing the preset catalog or
   operational state.
5. When a preset disappears, is no longer eligible, or the Active Workspace changes, stale ids SHALL
   be removed from the selection. A reorder or search change SHALL not reinterpret an id as another
   preset.
6. An empty selection SHALL disable or hide the bulk-delete action and SHALL not open a confirmation.
7. Selection changes SHALL not apply a preset, change current targets, fetch pods, or mutate logs.

**Acceptance criteria:** A user can select individual rows, select all eligible rows, see an
indeterminate master checkbox for a partial selection, clear the selection, and switch list context
without stale ids or operational-state changes.

### BS-2 - Replace `Delete all` with selected deletion

1. The preset library SHALL remove the `Delete all` action from its UI and accessible action set.
2. When one or more presets are selected, the library SHALL expose one action to delete the selected
   presets and SHALL show the selected count.
3. The selected-delete action SHALL open the existing product-owned custom destructive confirmation
   pattern before any store deletion operation.
4. The confirmation SHALL identify the selected count and names, provide target context or a concise
   target-count summary, and state that only saved presets in the Active Workspace will be removed.
5. The confirmation SHALL state that current targets, pods, filters, logs, query state, and other
   operational view state remain unchanged by this deletion.
6. If the selection includes the active preset, the confirmation SHALL state that the saved active
   reference will be cleared or reconciled while the live operational state remains.
7. Cancel, Escape, and backdrop dismissal SHALL close only the confirmation and preserve the list,
   search/filter context, selection, active reference, and operational state.

**Acceptance criteria:** `Delete all` is absent; selected deletion is unavailable for zero rows; one
confirmation represents the complete selected set; and every dismissal path leaves the library and
live view intact.

### BS-3 - Exact deletion and active-preset safety

1. On confirmation, the frontend SHALL invoke one existing store-level bulk deletion operation, or
   one equivalent atomic store boundary, with the validated stable ids exactly once.
2. The operation SHALL revalidate that every id still belongs to the Active Workspace before commit.
   A missing or stale id SHALL never fall through to deletion by row position, name, or target content.
3. Deleting inactive presets SHALL remove only those saved records and SHALL preserve every field of
   the operational state.
4. If the active preset is selected, deletion SHALL remove its saved record, clear or reconcile the
   active preset reference and dirty state according to the existing store invariant, and preserve
   current targets, namespaces, pods, filters, logs, selection/details, loading/errors, and query
   state.
5. After active-preset deletion, the current targets MAY be represented as live search/outside
   Workspace, but they SHALL not be cleared, replaced, or queried solely because the saved preset was
   deleted.
6. If the operation fails or is cancelled, the last confirmed catalog, selection, active reference,
   and operational state SHALL remain intact and the UI SHALL not claim success.
7. The persisted change SHALL use the existing web localStorage or desktop Electron user-data/IPC
   boundary and SHALL not introduce a second persistence path.

**Acceptance criteria:** Confirming removes exactly the selected records once; active-preset removal
clears only the invalid saved reference while live state survives; stale ids and failed writes cause
no unrelated deletion or false success.

### BS-4 - Confirmation accessibility and pending behavior

1. The confirmation SHALL use the existing semantic dialog contract, including accessible title and
   impact description, `role="dialog"`, and `aria-modal="true"`.
2. The initiating preset listing SHALL remain mounted behind the dialog, while pointer and keyboard
   interaction with it is blocked until the dialog settles.
3. The destructive action SHALL be disabled while deletion is pending, and competing catalog actions
   SHALL be blocked until the operation settles.
4. Focus SHALL enter the dialog predictably, remain within it while open, and return to the initiating
   selected-delete control or a deterministic nearby control after dismissal.
5. Long names, target summaries, counts, and error messages SHALL wrap or expose accessible full
   values at supported narrow desktop widths and themes.
6. Pending, success, refusal, and failure states SHALL use existing live-status patterns and SHALL
   not rely only on color or animation.

**Acceptance criteria:** Keyboard users can inspect the selected set, cancel safely, confirm once,
and understand pending/failure outcomes without interacting with the underlying list.

### BS-5 - Product and platform boundaries

1. Selection and bulk deletion SHALL remain frontend-owned orchestration over the existing preset
   store and library; no backend endpoint, Kubernetes mutation, or renderer filesystem access SHALL
   be added.
2. Bulk deletion SHALL not call `applyPreset`, `applyPresetAndLoad`, `loadPods`, or any Kubernetes
   API operation.
3. The full preset editor, Workspace manager, import/export, and explicit preset application flows
   SHALL remain available after the change.
4. The implementation SHALL not change preset ids, target normalization, Workspace identity, or the
   persistence schema unless a separate approved migration is required.
5. The selection and confirmation state SHALL be local UI state and SHALL not be persisted as saved
   preset metadata.

**Acceptance criteria:** Code review and focused tests find no query/application path in selection or
bulk deletion, existing management flows remain reachable, and platform boundaries are unchanged.

## Out of scope

- Copying or moving presets between Workspaces; that is v1.7.1.
- Applying any selected preset or automatically fetching pods after deletion.
- A new delete-all confirmation or an alternate destructive action label.
- Changes to Workspace deletion, target-chip removal, namespace-chip removal, or draft editing.
- Changes to preset import/export conflict policy or persistence schemas.

## Risks

- A master checkbox can accidentally act on hidden rows if its eligible-row scope diverges from the
  Workspace listing.
- Removing the active preset can invalidate a reference while incorrectly resetting the live view.
- A stale selected id can delete a different row if deletion is implemented by array position.
- A persistence failure can leave the UI claiming that only part of a bulk operation succeeded.
- A large selected set can make confirmation copy inaccessible or difficult to scan.

## Definition of done

- Every eligible preset row has stable-id selection controls matching the Workspace listing pattern.
- Select-all, indeterminate, clear-selection, scope changes, and stale-id reconciliation are tested.
- The `Delete all` action is removed and selected deletion uses one custom confirmation.
- The exact selected ids are deleted once through the existing persistence boundary.
- Active-preset deletion clears/reconciles only the saved reference and preserves live operational
  state, including targets, pods, filters, logs, and query state.
- Cancellation, failure, accessibility, responsive, no-query, and read-only boundary behavior is
  validated and recorded.
- No source code, package version, release artifact, commit, or tag is part of this spec-authoring
  task.

# Design - ops-union v1.6.3 destructive action confirmations

## Release status

This is a planned design for v1.6.3. It describes the confirmation boundary only; it does not
claim that the frontend implementation or validation is complete.

## Overview

The frontend currently owns preset and Preset Workspace deletion through the existing
`TargetSelector` surfaces and Zustand store. The change introduces one reusable custom confirmation
contract for persisted deletion while preserving the list or manager that initiated the action.
The store remains the source of truth and is called only after an explicit confirmation.

The existing `Delete all presets` custom dialog becomes the reference behavior for semantics and is
aligned with the individual and bulk variants. The design does not turn transient target editing
into persisted deletion: target chips, selected namespace chips, and unsaved editor targets remain
immediate actions. `Clear/reset` remains immediate in v1.6.3 and is a separate follow-up decision.

## Ownership boundaries

- `frontend/src/components/TargetSelector.tsx` (or the nearest existing frontend owner) owns
  confirmation intent, operation-specific context, primary-surface layering, and the relationship
  between the Workspace manager and its confirmation.
- The existing preset-library owner owns individual preset deletion intent and keeps the preset
  library mounted while its confirmation is visible.
- A shared frontend confirmation component or a tightly scoped existing dialog primitive owns
  semantic dialog markup, focus containment, initial-focus policy, Escape/backdrop dismissal,
  restore-focus behavior, pending presentation, and accessible action names. It SHALL not call the
  store or infer deletion semantics.
- `useOpsFlowStore` remains authoritative for `deletePreset`, `clearPresets`, `deleteWorkspace`,
  and `deleteWorkspaces`. These operations SHALL retain their current invariants, persistence
  boundaries, active-preset reconciliation, and active-Workspace fallback behavior.
- The existing target-entry and preset-editor owners retain immediate removal of target and namespace
  chips. They SHALL not route draft/transient removal through the persisted-deletion dialog.
- `@ops-union-frontend` owns the component/state implementation, copy, accessibility behavior, and
  focused frontend tests.
- `@ops-union-integration-qa` owns web and desktop interaction, keyboard/focus, responsive, failure,
  and read-only boundary validation.
- `@ops-union-architecture-review` owns a read-only audit that every persisted deletion has the
  confirmation boundary and that transient/draft removals remain outside it.
- `@ops-union-backend` has no implementation ownership. A read-only contract check is allowed only
  if an existing boundary unexpectedly needs clarification; no backend change is authorized.
- `repository maintainer` owns only later spec convergence/release administration and SHALL not mark
  implementation tasks complete without repository evidence.

## Confirmation contract

The shared component is conceptually:

```ts
type DestructiveConfirmation = {
  title: string;
  description: string;
  context?: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};
```

The exact TypeScript API may follow local component conventions. The component must provide:

- a backdrop and a panel with `role="dialog"`, `aria-modal="true"`, an accessible title, and a
  description associated through `aria-labelledby`/`aria-describedby`;
- a visible cancel/close action and a clearly labelled destructive action;
- a predictable initial focus target, visible focus styling, focus containment while open, and focus
  restoration to the initiating control when possible;
- Escape and backdrop dismissal that call only `onCancel` when the operation is not pending;
- pointer and keyboard isolation from the primary listing underneath;
- a pending state that disables both duplicate submission and conflicting parent actions;
- safe handling when the initiating element or record disappears before close; and
- no direct knowledge of presets, Workspaces, targets, persistence, or Kubernetes.

The destructive action must not be visually or semantically the only way to leave the dialog. Icon
buttons require accessible labels, and text labels must remain available where an icon alone would
be ambiguous.

## Ownership of confirmation state

The initiating surface owns which confirmation is open and the operation payload. A discriminated
intent is preferred over several independent booleans:

```ts
type DeleteIntent =
  | { kind: 'preset'; id: string }
  | { kind: 'workspace'; id: string }
  | { kind: 'workspaces'; ids: string[]; mode: 'selected' | 'keep-active-only' }
  | { kind: 'all-presets'; workspaceId: string; count: number };
```

The implementation may use a different local type, but it must preserve these invariants:

1. At most one persisted-deletion confirmation is open per primary surface.
2. The dialog payload is tied to stable ids, not list indexes or display names.
3. The displayed context is derived from a defined snapshot or current validated records; submit
   revalidates ids before invoking the store.
4. Opening a confirmation does not mutate the catalog or operational state.
5. Cancel, Escape, and backdrop only clear confirmation intent.
6. Confirm invokes the matching existing store operation once, then clears intent after accepted
   completion or leaves a safe error state if the operation fails.
7. Pending state blocks repeated confirmation and competing catalog actions without unmounting the
   primary listing.

The store operations remain synchronous or asynchronous according to their existing contract. The
confirmation layer must not invent a second persistence path or optimistically remove rows before the
store has accepted the operation.

## Operation-specific context and impact

### Individual preset

The dialog is opened from the preset row and identifies the preset name. It shows target count and a
compact target summary using the existing preset data. The impact copy says that the saved preset is
removed from the Active Workspace and that current targets, pods/table results, filters, logs, and
query state remain unchanged. If the preset is active, the copy also says the saved active reference
will be reconciled while current live targets remain.

On confirmation, call the existing `deletePreset(id)`. The library remains mounted and reflects the
store result. A missing id must not fall through to a different row.

### Individual Workspace

The dialog is opened from the Workspace manager and identifies the Workspace name, preset count,
and active status. For an inactive Workspace, it explains that only that saved Workspace/catalog is
removed. For the Active Workspace, it names the deterministic fallback policy already defined by the
Workspace contract and explicitly says that no fallback preset is applied and live operational state
is not cleared.

On confirmation, call `deleteWorkspace(id)`. The last-Workspace guard is checked before opening or
submitting. The manager remains underneath and is refreshed from the store result.

### Selected Workspaces

The manager snapshots the selected stable ids when opening the confirmation, or documents that it
re-reads and validates selection at submit. The dialog shows the selected count and names, aggregate
preset count, and whether the active Workspace is included. It must state the resulting active
Workspace behavior and reject any set that would remove all Workspaces before mutation.

On confirmation, call `deleteWorkspaces(ids)` exactly once with the validated intended ids. Do not
loop through individual delete calls, because that would change failure and active-fallback
semantics.

### Keep active only

The dialog is opened with the ids of all non-active Workspaces and the stable active Workspace id.
It identifies the retained Workspace, lists or summarizes removed Workspaces, and shows the aggregate
preset impact. It calls the existing `deleteWorkspaces(nonActiveIds)` only after confirmation. If no
non-active Workspace exists, the action remains unavailable and no dialog is opened.

### Delete all presets

The existing custom dialog remains the canonical library-level variant. It identifies the number of
saved presets in the Active Workspace and says that current targets and operational view state are
unchanged. It calls `clearPresets()` once on confirmation and closes only this confirmation layer.
The library search/list context remains mounted behind it.

## Layering and dismissal contract

The primary surfaces remain mounted:

```text
Workspace manager or Preset library
`- Destructive confirmation dialog (topmost interaction layer)
```

Opening the confirmation must not close or reset the primary surface. The confirmation backdrop is a
separate event boundary. A pointer down whose target is the backdrop may cancel; a pointer down in
the panel must not bubble to a row, delete button, selection checkbox, or manager action. While the
confirmation is open, the primary surface is visually present for context but inert to pointer and
keyboard interaction.

Escape is handled by the topmost confirmation only. It clears the confirmation intent and leaves the
primary listing, search, selection, active Workspace, and live operational view unchanged. Cancel and
backdrop use the same path. When the dialog closes, focus returns to the triggering delete control if
it still exists; otherwise the parent selects a deterministic nearby control.

If deletion completes, the parent clears the confirmation after the existing operation is accepted
and then displays the store-backed result/status. If it fails, the parent keeps the manager/library
usable, reports safe local feedback, and does not claim that the catalog changed.

## State transitions

```text
primary surface idle
  -> confirmation open (no catalog mutation)
  -> cancelled by button/Escape/backdrop
  -> primary surface idle (same catalog and context)

primary surface idle
  -> confirmation open
  -> confirm pending (primary remains mounted; duplicate actions blocked)
  -> accepted deletion
  -> confirmation closed; parent renders store-backed catalog/status

primary surface idle
  -> confirmation open
  -> confirm pending
  -> persistence/operation failure
  -> confirmation closes or remains according to existing error policy;
     no false-success state and primary surface remains usable
```

Deletion intent is separate from operational state. None of the confirmation variants may clear
current targets, query pods, filters, logs, theme, or query state merely because saved data is
removed. The existing store may reconcile an active preset reference or active Workspace id as
required by its current invariants; that reconciliation must not be described as live-target deletion
or implicit preset application.

## Transient and draft removal boundary

The following remain direct actions with no confirmation:

- the `X` action on a current target chip;
- removal of a selected namespace chip or the namespace selection's `Clear all` action; and
- removal of a target inside an unsaved preset editor draft.

These mutations either update operational selection or local draft state and do not persist deletion
of a saved preset/Workspace. Their existing keyboard, pointer, and cancel behavior remains unchanged.

`Clear/reset` of current targets remains immediate in v1.6.3 and is explicitly separate. It must not
reuse copy that says a preset or Workspace will be deleted, and it must not be silently folded into
the persisted-deletion component. A future confirmation for it requires a separately designed
follow-up with operational-impact copy and its own acceptance criteria.

## Error and safety behavior

- Validate that the record or id still exists before executing a confirmation. Never delete by a
  changed list index or a display-name match.
- Preserve existing last-Workspace rejection and bulk all-Workspace rejection.
- Prevent repeated confirms while a delete operation is pending.
- Preserve the last confirmed store/catalog state on persistence failure according to the existing
  store contract. Do not optimistically claim removal.
- Show local, actionable feedback without raw filesystem paths, kubeconfig contents, credentials,
  response bodies, or response headers.
- Keep all operations within the existing web localStorage or desktop Electron user-data/IPC boundary.
  No backend route or Kubernetes operation is involved.

## Accessibility and responsive behavior

The dialog must be testable as a modal, not just visually styled as one. The implementation should
use the project's established dialog styles and status/live-region patterns while ensuring:

- accessible title and impact description;
- focus enters the dialog and is visible;
- Tab/Shift+Tab do not escape into the underlying listing;
- Escape cancels only the dialog;
- cancel and destructive actions have stable, descriptive names;
- confirmation and errors are announced without color-only meaning;
- long Workspace/preset names and target summaries wrap or expose an accessible full value;
- narrow web windows, desktop windows, and high zoom do not overlap text and actions; and
- reduced-motion or slow-operation states remain understandable without animation.

## Validation strategy

### Focused automated frontend validation

- Render each confirmation variant and assert semantic dialog attributes, context copy, and exact
  confirm/cancel callbacks.
- Assert the primary library/manager remains mounted while the dialog is open.
- Assert cancel, Escape, and backdrop invoke only dismissal and do not call deletion.
- Assert confirm invokes the matching store operation once with stable ids.
- Cover active/inactive Workspace, last-Workspace rejection, selected bulk deletion, `Keep active
  only`, active preset deletion, and `Delete all presets`.
- Assert target-chip, namespace-chip, and draft target removal do not open the dialog.
- Assert the chosen `Clear/reset` policy explicitly.
- Run `npm run typecheck --workspace=frontend` and `npm test --workspace=frontend`.

### Web and desktop validation

- Exercise the same flows in the web build and supported Electron desktop runtime.
- Verify focus entry, focus containment/restoration, keyboard dismissal, backdrop dismissal, visible
  focus, screen-reader labels, and narrow/high-zoom layout.
- Simulate or observe persistence failure and verify no false success, unsafe error disclosure, or
  stale optimistic row removal.
- Confirm no backend/Kubernetes mutation or new renderer filesystem access is introduced.
- Run touched-file diagnostics and `git diff --check` for the implementation change.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Underlying list receives an Escape or click | Make the confirmation the topmost event/focus boundary; test all dismissal paths with the primary surface open. |
| Context becomes stale before confirm | Store stable ids, revalidate on submit, and never delete by row index. |
| Bulk summary differs from submitted ids | Snapshot or explicitly re-read the id set and test exact arguments to `deleteWorkspaces`. |
| Focus is lost after parent rerender | Restore by ref when present and use a deterministic fallback when the trigger disappears. |
| Store failure is shown as success | Close/update from the existing operation result, not from the click event; retain safe error state. |
| `Clear/reset` gets conflated with persistence | Keep a separate requirement/task and separate copy/ownership boundary. |

## Out of scope

- Store schema changes, new deletion semantics, undo/recovery, or deletion history.
- Backend, Kubernetes, renderer filesystem, authentication, or synchronization changes.
- Confirmation for transient target/namespace removal or unsaved draft target removal.
- A mandatory `Clear/reset` confirmation without a separate approved decision.
- Redesign of unrelated dialogs or a broad UI component-library migration.

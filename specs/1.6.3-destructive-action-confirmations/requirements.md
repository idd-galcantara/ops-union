# Requirements - ops-union v1.6.3 destructive action confirmations

## Status and scope

This is the planned v1.6.3 specification for replacing native destructive-action confirmations with
custom, accessible confirmation dialogs. It extends the existing preset library and Preset Workspace
management flows without changing persistence semantics, Kubernetes read-only behavior, or the
meaning of target editing.

The release scope covers every persisted deletion currently exposed by the frontend:

- deleting one preset;
- deleting one Workspace;
- deleting a selected group of Workspaces;
- deleting every Workspace except the active Workspace; and
- preserving the existing `Delete all presets` flow under the same custom-dialog contract.

The scope also defines the boundary for target and namespace removal. Removing a target chip,
removing a selected namespace, or removing a target from an unsaved preset draft SHALL not require a
confirmation. `Clear`/reset of the current targets is a separate, optional decision and is not part
of the mandatory persisted-deletion rollout unless explicitly accepted as an additional task.

## Glossary

- **Persisted deletion:** An action that removes data from the saved preset or Workspace catalog and
  survives the current render, reload, or desktop application restart.
- **Confirmation dialog:** A product-owned custom modal with explicit cancel and destructive-confirm
  actions. It is not `window.confirm` and is not a browser-native prompt.
- **Primary listing:** The preset library or Workspace manager that initiated the action and remains
  rendered underneath the confirmation dialog.
- **Active Workspace:** The one local Preset Workspace currently supplying the visible preset catalog.
- **Draft target removal:** Removing a target from an editor's unsaved local form state before the
  preset is persisted.
- **Clear/reset targets:** Removing or resetting the current operational target selection. This is
  distinct from deleting saved presets or Workspaces and may require its own future confirmation
  policy.

## User stories

- As an operator, I can understand exactly what saved data a destructive action will remove before
  I confirm it.
- As an operator, I can cancel a destructive action with a button, Escape, or the backdrop without
  losing the preset search/list or Workspace manager context.
- As an operator, I can delete an individual preset or Workspace without the browser's native
  confirmation prompt interrupting the application experience.
- As an operator, I can remove targets and namespaces while composing a selection without needless
  confirmation, because those actions are not persisted deletion.
- As a keyboard or assistive-technology user, I can identify the dialog, move focus predictably,
  confirm or cancel it, and understand the result.

## Requirements

### DC-1 - Unified custom confirmation contract

1. Every persisted deletion exposed by the frontend SHALL use a custom application-owned modal before
   invoking the store deletion operation.
2. The implementation SHALL replace every `window.confirm` used for persisted deletion in the
   frontend. No persisted-deletion path may retain a browser-native confirmation fallback.
3. The confirmation modal SHALL expose an explicit destructive action and an explicit cancel/close
   action. The destructive action SHALL be disabled or otherwise protected while the deletion is
   pending.
4. The modal SHALL use semantic dialog markup with an accessible name and description, including
   `role="dialog"` and `aria-modal="true"` according to the existing modal conventions.
5. The modal SHALL be rendered above the initiating surface with a distinct stacking and pointer
   interaction layer. The underlying primary listing SHALL remain mounted while confirmation is open.
6. The confirmation contract SHALL be reusable for preset and Workspace deletion variants without
   hiding the operation-specific context or impact.

**Acceptance criteria:** A code search finds no `window.confirm` on a persisted-deletion path; each
listed destructive action opens a custom dialog; confirming invokes the existing deletion operation
once; cancelling does not invoke it; and the initiating list/manager remains visible and mounted
behind the dialog.

### DC-2 - Individual preset deletion

1. Selecting delete for one preset SHALL open a custom confirmation dialog instead of deleting
   immediately.
2. The dialog SHALL identify the preset by name and show enough target context to distinguish it
   from another preset, such as its target count and a concise cluster/namespace summary where the
   existing UI can provide it.
3. The dialog SHALL state the impact: the saved preset will be removed from the Active Workspace;
   current targets, pods/table results, filters, logs, and other operational view state SHALL remain
   unchanged solely because the preset is deleted.
4. IF the preset is the active preset THEN the dialog or surrounding status SHALL explain that the
   active saved reference will be cleared or reconciled according to the existing store contract;
   it SHALL not imply that current targets or query results will be deleted.
5. WHEN the user confirms THEN the existing `deletePreset` operation SHALL perform the deletion and
   the dialog SHALL close after the operation is accepted.
6. WHEN the user cancels, presses Escape, or dismisses the backdrop THEN only the confirmation SHALL
   close; the preset library, search query, visible rows, and active operational state SHALL remain.
7. IF the preset no longer exists when confirmation is submitted THEN the operation SHALL not delete
   another preset by position or name; the dialog SHALL close or show a safe local outcome according
   to the existing missing-record policy.

**Acceptance criteria:** Deleting a named preset shows its name, target context, and saved-data
impact; cancel paths leave the library unchanged; confirm removes exactly that preset; and active
preset deletion does not clear current targets or pods unless an existing store invariant requires
reference reconciliation.

### DC-3 - Individual Workspace deletion

1. Selecting delete for one Workspace SHALL open a custom confirmation dialog instead of calling a
   native prompt or deleting immediately.
2. The dialog SHALL identify the Workspace by name, show its preset count, and identify whether it is
   the Active Workspace.
3. The dialog SHALL explain the active/inactive impact:
   - deleting an inactive Workspace removes that Workspace and its saved presets only;
   - deleting the Active Workspace selects the existing deterministic surviving Workspace behavior;
   - deletion does not apply a fallback preset or reset current targets, pods, filters, logs, theme,
     or query state.
4. IF it is the last remaining Workspace THEN the delete control SHALL remain disabled or the action
   SHALL be rejected without opening a misleading confirmation; the existing last-Workspace safety
   rule remains authoritative.
5. WHEN the user confirms THEN the existing `deleteWorkspace` operation SHALL run once and the
   manager SHALL update only after the operation is accepted.
6. WHEN the user cancels, presses Escape, or dismisses the backdrop THEN only the confirmation SHALL
   close; the Workspace manager, selection, search, and active operational view SHALL remain.

**Acceptance criteria:** A populated active or inactive Workspace opens a context-rich custom dialog;
confirming deletes only the selected Workspace through the existing store operation; the last
Workspace cannot be deleted; and cancelling preserves the manager and operational view.

### DC-4 - Bulk Workspace deletion

1. Deleting selected Workspaces SHALL require one custom confirmation dialog that represents the
   complete selected set, rather than one native prompt per item.
2. The dialog SHALL show the number of Workspaces selected and a readable list or summary of their
   names. It SHALL show the aggregate preset impact or an equivalent count where that data is
   available.
3. The dialog SHALL identify whether the Active Workspace is included and explain the resulting
   active-Workspace behavior. The action SHALL never leave zero Workspaces.
4. The `Keep active only` action SHALL use the same custom confirmation contract and SHALL state the
   active Workspace that will be retained, the number/names of Workspaces removed, and the aggregate
   saved preset impact.
5. IF the selected set would remove every Workspace THEN the action SHALL be rejected before
   mutation and SHALL explain that at least one Workspace must remain.
6. WHEN the user confirms a valid bulk action THEN the existing `deleteWorkspaces` operation SHALL
   receive exactly the intended ids once; no implicit preset application or operational reset is
   permitted.
7. WHEN the user cancels, presses Escape, or dismisses the backdrop THEN only the confirmation SHALL
   close and the manager selection/list SHALL remain available.

**Acceptance criteria:** Selected deletion and `Keep active only` each open a single custom dialog
with names, counts, active-retention context, and impact; confirmation passes the exact id set to the
existing bulk operation; invalid all-Workspace selection does not mutate; and every cancellation path
preserves the manager.

### DC-5 - Preserve `Delete all presets`

1. The existing `Delete all presets` action SHALL remain available in the preset library when the
   Active Workspace contains saved presets.
2. It SHALL continue to use a custom confirmation dialog and SHALL not regress to `window.confirm` or
   immediate deletion.
3. The dialog SHALL show the number of presets to be removed and state that current targets, table
   results, filters, logs, and other operational view state remain unchanged.
4. Confirming SHALL call the existing `clearPresets` operation once and cancel/Escape/backdrop SHALL
   close only the confirmation while preserving the library context.
5. The dialog SHALL use the same focus, semantic, pending, and error behavior as the other
   destructive confirmation variants.

**Acceptance criteria:** `Delete all presets` still removes all saved presets only after an explicit
custom confirmation; its count and operational-state impact are visible; and all dismissal paths
leave the library open with its context intact.

### DC-6 - Non-confirmed transient and draft removals

1. Removing one target from the current target list SHALL not require a confirmation dialog.
2. Removing one selected namespace or clearing selected namespace chips in the target-entry control
   SHALL not require a confirmation dialog.
3. Removing a target from an unsaved preset editor/draft SHALL not require a confirmation because it
   changes only draft state and can be reversed by cancelling the editor.
4. These non-confirmed actions SHALL not be routed through the persisted-deletion confirmation
   component and SHALL preserve their current immediate interaction behavior.
5. The implementation SHALL distinguish these actions from `deletePreset`, `clearPresets`,
   `deleteWorkspace`, and `deleteWorkspaces` in state ownership and tests.

**Acceptance criteria:** Target-chip, namespace-chip, and draft-target removal complete immediately
without a modal, while persisted deletions always open the custom confirmation.

### DC-7 - Clear/reset targets decision boundary

1. `Clear` or reset of the current targets SHALL be treated as a separate action from persisted
   deletion.
2. v1.6.3 SHALL leave the existing immediate `Clear` behavior unchanged and SHALL keep confirmation
   for `Clear/reset` outside the mandatory scope. A future confirmation for this action requires a
   separately reviewed specification or follow-up task with its own context and acceptance criteria.
3. A persisted-deletion dialog SHALL not be reused for `Clear/reset` with copy that implies saved
   presets or Workspaces are being deleted.
4. If a future implementation adds confirmation for `Clear/reset`, it SHALL explain the operational
   impact and preserve the current target/list state on cancel, Escape, or backdrop dismissal.

**Acceptance criteria:** In v1.6.3, `Clear/reset` remains immediate and separate from saved-data
deletion; no user can confuse it with saved-data deletion; and no unapproved confirmation is added
to the mandatory persisted-deletion path.

### DC-8 - Accessibility, focus, and dismissal behavior

1. Opening a confirmation SHALL move focus into the dialog to a predictable control, preferably the
   cancel action or another documented safe initial target.
2. While the confirmation is open, keyboard focus SHALL remain within the active dialog, and the
   underlying listing SHALL not receive accidental keyboard or pointer activation.
3. Escape SHALL close only the confirmation. It SHALL not close the preset library or Workspace
   manager, change the selection, or execute the destructive action.
4. Clicking the backdrop outside the dialog panel SHALL close only the confirmation. Clicking inside
   the panel SHALL not bubble into an underlying action.
5. Closing by cancel, Escape, or backdrop SHALL restore focus to the initiating delete control when
   it still exists; otherwise it SHALL use a deterministic nearby control without throwing or
   exposing focus to an unrelated page region.
6. The dialog SHALL expose an accessible title and impact description through the appropriate ARIA
   relationships. Destructive and cancel controls SHALL have accessible names independent of icon
   rendering or color.
7. The dialog SHALL remain usable with keyboard navigation, visible focus, high zoom, narrow
   desktop windows, and supported web and desktop themes. Text SHALL wrap or truncate with an
   accessible full value and SHALL not overlap actions.
8. Screen-reader-relevant pending, success, refusal, and error states SHALL use the existing local
   status/live-region patterns and SHALL not rely only on color, animation, or a visual backdrop.

**Acceptance criteria:** Keyboard and accessibility checks can identify the dialog, move through its
controls, cancel safely, confirm exactly once, and return focus; backdrop/Escape cannot affect the
underlying list; and the dialog remains legible and operable at supported desktop/web sizes.

### DC-9 - Persistence, failure, and platform boundaries

1. Confirmation SHALL precede the existing persisted operation in both web and desktop modes; no
   backend route, Kubernetes client operation, or renderer filesystem access SHALL be added for this
   feature.
2. A cancelled confirmation SHALL perform no persistence write and SHALL leave the last confirmed
   catalog unchanged.
3. A failed deletion SHALL not report success. The initiating list/manager SHALL remain usable and
   SHALL expose safe local feedback without raw filesystem paths, kubeconfig data, credentials,
   response bodies, or response headers.
4. Pending deletion SHALL prevent duplicate confirmation submissions and competing catalog actions
   until the existing operation settles.
5. The existing Workspace invariants, preset-reference reconciliation, localStorage web boundary,
   and Electron user-data/IPC desktop boundary SHALL remain authoritative.

**Acceptance criteria:** Web and desktop controlled failure scenarios show no false success or
partial UI claim; cancellation creates no delete mutation; duplicate submits invoke one operation;
and read-only/persistence boundaries are unchanged.

## Out of scope

- Changing preset or Workspace deletion semantics, persistence schema, or active-reference rules.
- Adding a new backend endpoint, Kubernetes mutation, watch, query, or authorization scope.
- Confirming target/namespace chip removal or draft target removal.
- A confirmation for `Clear/reset` of current targets; it remains an explicitly separate follow-up.
- Redesigning the preset library, Workspace manager, import/export flows, or unrelated modals.
- Native OS/browser file-picker confirmation behavior.
- Bulk deletion of presets beyond the existing `Delete all presets` action.
- Undo, trash/recycle-bin recovery, deletion history, or cross-profile synchronization.

## Risks

- A layered dialog may accidentally allow Escape, backdrop clicks, or pointer events to reach the
  underlying library/manager and trigger a second action.
- Context-rich copy may become stale if a Workspace or preset changes between opening and confirming;
  ids and current store state must be revalidated on submit.
- Bulk count/list summaries can diverge from the exact id set if selection changes while the dialog is
  open; the dialog must snapshot or re-read a well-defined set and submit only that set.
- Existing focus behavior across web and Electron may differ, especially after a modal unmounts or
  when the initiating control disappears.
- A failed persistence write can leave the UI and saved catalog out of sync if the dialog closes
  before the existing store operation reports its result.
- Treating `Clear/reset` as a deletion confirmation without a separate decision could make the
  product feel unnecessarily blocking and obscure the distinction between live and persisted state.

## Definition of done

- All persisted deletion flows listed in this specification use custom confirmation dialogs and no
  `window.confirm` path remains for them.
- Individual preset, individual Workspace, selected Workspace, and `Keep active only` dialogs show
  the required context and impact; `Delete all presets` retains its behavior under the same contract.
- Primary listing surfaces remain mounted behind confirmations, and cancel/Escape/backdrop close only
  the confirmation.
- Target/namespace chip removal and draft target removal remain unconfirmed; the `Clear/reset`
  decision is explicitly recorded.
- Accessibility, focus, semantic-dialog, web, desktop, failure, and read-only validation evidence
  is recorded before release.
- No implementation task is marked complete based only on this proposed specification.

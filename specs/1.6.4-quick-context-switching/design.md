# Design - ops-union v1.6.4 quick Workspace, preset, and application filtering

## Release status

The current frontend implements the Workspace/preset quick controls, context reset behavior, and
application filtering described here. This document records behavior confirmed by source and tests;
browser/Electron interaction and responsive validation remain separate open work.

## Overview

The top bar exposes the active Workspace and active preset as two compact controls:

- the active Workspace name opens the existing Workspace manager; and
- the active preset name, or `Live search`, opens a recent-preset selector scoped to the active
  Workspace.

Creating or switching Workspace changes the saved preset catalog and resets the operational view
without applying a preset or querying Kubernetes. The preset selector is an operational shortcut:
choosing a preset makes it current and immediately fetches pods for its saved targets.

The full Workspace manager and preset library remain available from the top-bar control and its
preset-library action. This feature does not replace creation, editing, import/export, deletion,
search, or other library workflows.

## Interaction model

The top bar is conceptually:

```text
[ Workspace  test (imported2)  v ] [ bookmark  Live search  v ]
```

The two controls are independent entry points. The Workspace control opens the full manager; the
preset control owns recent preset application. The controls must remain usable when the active
Workspace has no presets or when no preset is active.

### Workspace control and context reset

- Clicking the Workspace control opens the existing manager, where all saved Workspaces are listed
  and the active item is marked.
- Selecting another Workspace calls the existing `switchWorkspace` operation once and changes the
  active preset catalog.
- Creating a Workspace and switching Workspace both call the store's `resetWorkspaceView` boundary.
  This clears targets, namespaces, pods, target/query errors, loading flags, query state,
  last-update state, and the textual filter. The resulting `explicitQueryRevision` causes `App` to
  clear selected pods, log state, details, and selected application filters.
- A Workspace switch reconciles an active preset that is absent from the selected catalog to null;
  it does not select a fallback preset or call `loadPods`.
- Selecting the already-active Workspace returns without switching or resetting the operational view.
- If there is only one Workspace, the manager remains available and selecting its active item is a
  no-op.

### Recent preset selector

- Clicking the preset name, bookmark, or chevron opens a compact popover for the active Workspace.
- The list contains at most five presets, ordered by the existing recent-use rule: descending
  `lastUsedAt`, with the existing collection order preserved for ties and never-used presets.
- The same five-item helper and limit are shared with the launchpad quick-access list so the home
  surface and top-bar surface do not disagree about which presets are recent.
- Each item shows the preset name and the existing concise target description. The active preset is
  visibly marked.
- Selecting a non-active preset calls the existing `applyPresetAndLoad` flow. This makes the preset
  current, records recent use, replaces the current targets with the saved targets, clears the stale
  operational result, and fetches pods.
- Selecting the already-active preset with no pending edits closes the popover without issuing a
  duplicate query.
- Selecting the already-active preset with pending edits is treated as restoring the saved preset and
  follows the pending-edit confirmation rule below.
- While preset application or pod loading is pending, duplicate preset selection and conflicting
  quick-menu actions are disabled. The menu reports which preset is loading.
- When no presets exist, the popover shows an empty state and an action to open the existing preset
  library.

### Active preset deletion

- Deleting the active preset clears its active reference and dirty state, removes it from the active
  Workspace catalog, and invokes the same `resetWorkspaceView` boundary.
- The resulting view reset also clears the application filter through the `explicitQueryRevision`
  effect in `App`.
- Deleting an inactive preset only updates the catalog and does not reset the current view.

### Multiple application filtering

- `App` derives application options from the current pod result by normalized application key and
  name, counts pods per key, and sorts options deterministically by name and key.
- The `Apps` popover in `ViewToolbar` supports multiple checkbox selections. Selected applications
  are combined with OR semantics, while the existing textual `matchesFilter` predicate is applied
  as an additional condition.
- The popover search is local, case-insensitive, and matches application name or key. It narrows
  visible options without changing selected keys.
- Clearing the application filter removes all selected keys. Context resets clear the selected keys
  alongside the textual filter.

## Pending edits and confirmation

Pending edits include either `activePresetDirty` or non-empty current targets while `Live search` is
active. Choosing a different preset, or restoring the active saved preset, would discard those
unsaved target changes. An empty `Live search` has no pending edits.

- If there are no pending edits, preset selection proceeds immediately.
- If pending edits exist, the application shows a product-owned confirmation before applying the
  selected saved preset. The confirmation identifies the current unsaved state and the preset that
  will replace it.
- Cancel, Escape, or backdrop dismissal leaves the current targets, active preset, and quick-menu
  context unchanged.
- Confirming proceeds through `applyPresetAndLoad`; the confirmation does not create a second state
  mutation or persistence path.
- The confirmation is not a persisted-deletion confirmation and must not imply that a saved preset or
  Workspace will be deleted.

## State and ownership boundaries

- `WorkspaceControls` owns preset quick-menu open state, outside click/Escape dismissal, selected
  operation context, and presentation of loading/status states; the existing manager owns Workspace
  management.
- `useOpsFlowStore` remains authoritative for `switchWorkspace`, `applyPreset`, active preset state,
  dirty state, Workspace-scoped preset data, persistence, and the Workspace reset boundary.
- `applyPresetAndLoad` remains the single frontend flow for applying a preset and loading pods.
- `orderPresetsByRecentUse` remains the ordering authority; the shared quick-access limit is raised
  to five in the owning helper rather than duplicated in the top bar.
- `App` owns selected application keys and composes them with the store-owned textual filter and pod
  result. `ViewToolbar` owns application-menu presentation, search, and checkbox interaction.
- The existing full Workspace manager and preset library remain the owners of management operations.
- No backend route, Kubernetes write, renderer filesystem access, or persistence-schema change is
  introduced.

## Operational state behavior

Workspace switching and preset application have intentionally different effects:

```text
Workspace creation or manager selection
  -> createWorkspace(name) or switchWorkspace(id)
  -> reset operational view
  -> no preset application
  -> no Kubernetes query

Active preset deletion
  -> remove preset and clear active reference
  -> reset operational view

Preset quick selection
  -> optional pending-edit confirmation
  -> applyPresetAndLoad(id)
  -> saved targets become current
  -> pods query starts
  -> selected preset remains current on success or query error
```

The existing `loadPods` error behavior remains authoritative. A failed query must not claim that the
preset was not selected, must not revert the saved catalog, and must expose the existing safe error
state. Target errors are cleared when preset application starts and are repopulated by the query as
appropriate. A later retry uses the existing retry/refresh controls.

## Accessibility and responsive behavior

- Each control is a named button with `aria-expanded` and a relationship to its popover.
- Each popover uses a semantic menu/list pattern consistent with existing frontend conventions,
  supports keyboard navigation, and closes on Escape without changing state.
- Opening one popover closes the other. Clicking outside closes only the open popover.
- Focus returns to the triggering control after dismissal when it still exists.
- Long Workspace and preset names remain readable through wrapping or accessible truncation; they
  must not overlap the chevrons, theme controls, status indicator, or loading state.
- The controls remain usable at narrow desktop widths and in both supported themes.

## Out of scope

- Redesigning the full Workspace manager or preset library.
- Changing Workspace or preset persistence schemas.
- Adding global cross-Workspace recent-preset history.
- Automatically applying a preset or fetching pods merely because a Workspace was switched.
- Changing target editing, pod refresh policy, grouping, logs, or Kubernetes API contracts beyond the
  application filter described here.
- Adding destructive actions or confirmation semantics beyond the pending-edit replacement decision.

## Validation strategy

- Verify the Workspace manager changes catalog context and does not call `loadPods`.
- Verify Workspace creation and switching reset the operational view and clear application filters.
- Verify deleting the active preset resets the operational view; deleting an inactive preset does not.
- Verify the preset popover exposes up to five recent presets using the shared ordering helper.
- Verify application options, multiple selection, application search, textual-filter composition,
  clear behavior, and reset on Workspace context change.
- Verify preset selection applies the saved targets and calls `loadPods` once.
- Verify pending-edit cancellation preserves current state and confirmation proceeds only once.
- Verify duplicate selection, empty states, keyboard dismissal, focus restoration, narrow layout, and
  both themes.
- Run focused frontend tests, frontend typecheck, touched-file diagnostics, and `git diff --check`.
- Source/test evidence currently confirms the store reset boundaries and application filtering path.
- Perform web and desktop smoke validation without any Kubernetes mutation; this remains open until
  recorded by the integration/QA owner.

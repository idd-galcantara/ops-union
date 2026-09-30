# Design - ops-union v1.6.4 quick Workspace and preset switching

## Release status

This is a planned design for v1.6.4. It describes the quick context-switching contract only; it does
not claim that the frontend implementation or validation is complete.

## Overview

The top bar currently combines the active Workspace and active preset into one interaction that opens
the full Workspace manager. v1.6.4 separates those concepts into two compact controls:

- the active Workspace name opens a quick Workspace selector; and
- the active preset name, or `Live search`, opens a recent-preset selector scoped to the active
  Workspace.

The Workspace selector changes the saved preset catalog without changing the live operational view
or querying Kubernetes. The preset selector is an operational shortcut: choosing a preset makes it
current and immediately fetches pods for its saved targets.

The full Workspace manager and preset library remain available from their respective quick menus.
This feature does not replace creation, editing, import/export, deletion, search, or other library
workflows.

## Interaction model

The top bar is conceptually:

```text
[ Workspace  test (imported2)  v ] [ bookmark  Live search  v ]
```

The two controls are independent buttons with independent expanded state. The Workspace control owns
Workspace switching. The preset control owns recent preset application. The controls must remain
usable when the active Workspace has no presets or when no preset is active.

### Quick Workspace selector

- Clicking the Workspace name or its chevron opens a compact popover listing all saved Workspaces.
- The active Workspace is visibly marked and remains the current choice.
- Selecting another Workspace calls the existing `switchWorkspace` operation once and closes the
  popover. It changes the visible preset catalog and reconciles the active preset reference without
  clearing or reloading the transient operational view.
- Switching Workspace does not select a fallback preset and does not call `loadPods`.
- Current targets, pods, filters, logs, selected details, loading/error state, theme, and query state
  remain unchanged by the Workspace switch.
- The active Workspace's preset catalog becomes the source for the preset quick menu after the switch.
- The popover contains an action to open the existing full Workspace manager.
- If there is only one Workspace, it remains selectable and the manager action remains available;
  no duplicate switch or query is issued when the active item is clicked.

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

- `WorkspaceControls` (or the nearest existing top-bar owner) owns quick-menu open state, outside
  click/Escape dismissal, selected operation context, and presentation of loading/status states.
- `useOpsFlowStore` remains authoritative for `switchWorkspace`, `applyPreset`, active preset state,
  dirty state, Workspace-scoped preset data, and persistence.
- `applyPresetAndLoad` remains the single frontend flow for applying a preset and loading pods.
- `orderPresetsByRecentUse` remains the ordering authority; the shared quick-access limit is raised
  to five in the owning helper rather than duplicated in the top bar.
- The existing full Workspace manager and preset library remain the owners of management operations.
- No backend route, Kubernetes write, renderer filesystem access, or persistence-schema change is
  introduced.

## Operational state behavior

Workspace switching and preset application have intentionally different effects:

```text
Workspace quick selection
  -> switchWorkspace(id)
  -> preserve transient operational view
  -> no preset application
  -> no Kubernetes query

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
- Changing target editing, pod refresh policy, grouping, filters, logs, or Kubernetes API contracts.
- Adding destructive actions or confirmation semantics beyond the pending-edit replacement decision.

## Validation strategy

- Verify the Workspace popover switches catalog and does not call `loadPods`.
- Verify the preset popover exposes up to five recent presets using the shared ordering helper.
- Verify preset selection applies the saved targets and calls `loadPods` once.
- Verify pending-edit cancellation preserves current state and confirmation proceeds only once.
- Verify duplicate selection, empty states, keyboard dismissal, focus restoration, narrow layout, and
  both themes.
- Run focused frontend tests, frontend typecheck, touched-file diagnostics, and `git diff --check`.
- Perform web and desktop smoke validation without any Kubernetes mutation.

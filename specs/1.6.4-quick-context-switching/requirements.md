# Requirements - ops-union v1.6.4 quick Workspace and preset switching

## Status and scope

This is the planned v1.6.4 specification for adding fast Workspace and preset switching to the top
bar. It reuses the existing Workspace catalog, recent-use metadata, preset application flow, and
full management surfaces. It does not change persistence, backend APIs, or Kubernetes read-only
behavior.

The scope covers:

- independent top-bar controls for the active Workspace and active preset;
- a quick Workspace selector with no automatic Kubernetes query;
- a five-item recent-preset selector scoped to the active Workspace;
- immediate preset application followed by a pod fetch;
- confirmation before discarding unsaved current target changes; and
- accessible, responsive dismissal and loading behavior.

## Glossary

- **Quick Workspace selector:** The compact top-bar popover used to switch among saved Workspaces.
- **Recent preset selector:** The compact top-bar popover containing at most five recently used
  presets from the active Workspace.
- **Active preset:** The saved preset currently associated with the operational target selection, or
  no preset when the view is a live search.
- **Pending edits:** `activePresetDirty` is true because current targets differ from the saved active
   preset, or current targets are non-empty while `Live search` is active. Empty `Live search` has no
   pending edits.
- **Preset application:** Applying a saved preset, making it current, and fetching pods for its saved
  targets through the existing `applyPresetAndLoad` flow.

## Requirements

### QC-1 - Independent top-bar controls

1. The top bar SHALL expose the active Workspace and active preset as two independent named controls.
2. Each control SHALL include a visible chevron or equivalent affordance indicating that it opens a
   selector.
3. Clicking the Workspace control SHALL open only the Workspace selector. Clicking the preset control
   SHALL open only the recent preset selector.
4. Opening one selector SHALL close the other, and clicking outside SHALL close the open selector
   without changing the current selection.
5. The controls SHALL preserve the existing product branding, theme toggle, read-only status, and
   full management entry points.

**Acceptance criteria:** The two names can be operated independently, each opens the correct compact
popover, and neither action accidentally opens the other selector or changes operational state.

### QC-2 - Quick Workspace switching

1. The Workspace selector SHALL list every saved Workspace and visibly identify the active Workspace.
2. Selecting an inactive Workspace SHALL call the existing `switchWorkspace` operation once with its
   stable id.
3. After a successful switch, the selector SHALL close and the visible preset catalog SHALL change
   without clearing or reloading current targets, pods, filters, logs, selected details, loading/error
   state, theme, or query state.
4. Switching Workspace SHALL not automatically select a fallback preset.
5. The active preset reference SHALL be reconciled to null when it does not resolve in the selected
   Workspace; the switch SHALL not apply a replacement preset.
6. Switching Workspace SHALL not call `loadPods`, `applyPreset`, or any Kubernetes API operation.
7. Selecting the already-active Workspace SHALL not issue a duplicate switch, reset, or query.
8. The selector SHALL provide an action to open the existing full Workspace manager.

**Acceptance criteria:** A user can switch Workspaces from the top bar, the correct preset catalog
appears afterward, current operational state is preserved, no preset is silently applied, the full
manager remains reachable, and no pod fetch starts because of the Workspace switch alone.

### QC-3 - Five recent presets in the active Workspace

1. The preset selector SHALL read presets from the active Workspace only.
2. It SHALL display at most five presets.
3. Ordering SHALL reuse the existing recent-use ordering authority: newest valid `lastUsedAt` first,
   with existing collection order preserved for ties and never-used presets.
4. The five-item limit and ordering SHALL be shared with the launchpad quick-access list; the two
   surfaces SHALL not maintain conflicting limits or sorting implementations.
5. Each item SHALL show the preset name and the existing concise target summary where available.
6. The active preset SHALL be visibly marked.
7. When the active Workspace has no presets, the selector SHALL show an empty state and an action to
   open the existing preset library.

**Acceptance criteria:** The selector displays the correct five recent presets for the current
Workspace, excludes presets from other Workspaces, marks the active one, and behaves sensibly when
there are zero to four presets. Its preset-library action opens the existing full library without
changing targets or starting a query.

### QC-4 - Apply a quick preset and fetch pods

1. Selecting a non-active preset SHALL apply the saved preset and immediately start a pod fetch.
2. The operation SHALL use the existing `applyPresetAndLoad` flow or an equivalent single path that
   preserves its ordering and error semantics.
3. The selected preset SHALL become the active preset and its `lastUsedAt` SHALL be updated through
   the existing store behavior.
4. The saved preset targets SHALL replace the current targets before the pod fetch starts.
5. The stale pod result and target errors SHALL be cleared according to the existing preset-apply
   behavior.
6. The selector SHALL close after selection is accepted and SHALL expose an appropriate loading state
   while the fetch is pending.
7. Selecting the already-active preset with no pending edits SHALL not issue a duplicate fetch.
8. If the fetch fails, the preset SHALL remain selected and the existing safe pod-error state SHALL
   be shown; the UI SHALL not claim that the query succeeded.
9. While application or loading is pending, duplicate preset selection and conflicting quick actions
   SHALL be blocked.

**Acceptance criteria:** Selecting a recent preset makes it current, starts exactly one pod fetch with
its saved targets, displays loading, handles failure without reverting the selection, and does not
start a duplicate fetch for the unchanged active preset.

### QC-5 - Protect pending target edits

1. If there are no pending edits, selecting a preset SHALL proceed without confirmation.
2. If pending edits exist, selecting another preset SHALL show a product-owned confirmation before
   replacing the current unsaved targets. Pending edits include `activePresetDirty` and non-empty
   targets during `Live search`.
3. Restoring the active saved preset while it is dirty SHALL use the same confirmation boundary.
4. The confirmation SHALL identify that unsaved current target changes will be replaced and identify
   the saved preset that will be applied.
5. Cancelling, pressing Escape, or dismissing the backdrop SHALL preserve current targets, active
   preset, dirty state, and selector context.
6. Confirming SHALL invoke the existing preset application flow exactly once.
7. The confirmation SHALL not describe the operation as deleting a saved preset or Workspace.

**Acceptance criteria:** Unsaved target changes cannot be discarded silently; all cancellation paths
preserve them; confirmation applies the intended preset once; and saved catalog data is unchanged by
this decision alone.

### QC-6 - Selector accessibility and responsive behavior

1. Each selector control SHALL expose an accessible name and `aria-expanded` state.
2. Each popover SHALL have an accessible relationship to its trigger and a semantic structure that
   supports keyboard navigation.
3. Escape SHALL close only the open selector or pending-edit confirmation and SHALL not switch
   Workspaces, apply presets, or close unrelated application surfaces.
4. Focus SHALL return to the trigger after selector dismissal when it still exists.
5. Loading and pending states SHALL announce meaningful status through existing live-region patterns
   and SHALL not rely only on color or animation.
6. Long names SHALL not overlap the chevron, neighboring control, theme toggle, or read-only status.
7. The controls and popovers SHALL remain usable at supported narrow desktop widths and in both
   supported themes.

**Acceptance criteria:** Keyboard users can open, navigate, select, and dismiss both popovers; focus
and status are understandable; and the controls remain legible without overlap at narrow widths.

### QC-7 - Preserve ownership and read-only boundaries

1. The existing store SHALL remain authoritative for Workspace switching, preset application,
   persistence, active references, and dirty-state semantics.
2. The existing full Workspace manager and preset library SHALL remain available for management
   operations.
3. No backend endpoint, Kubernetes mutation, renderer filesystem access, or persistence-schema change
   SHALL be added for this feature.
4. Workspace switching SHALL remain separate from preset application and pod querying.
5. Quick selection SHALL not create a second persistence path or duplicate recent-use metadata.

**Acceptance criteria:** Code review finds one owner for each state transition, no new backend or
Kubernetes operation exists, and full management workflows remain reachable.

## Out of scope

- Global recent presets spanning multiple Workspaces.
- Automatic preset selection or pod fetching after Workspace switching.
- Redesign of the full Workspace manager or preset library.
- Changes to preset/Workspace persistence schemas or ids.
- Changes to target editing, filters, grouping, refresh intervals, logs, or backend contracts.
- New destructive actions or confirmation flows unrelated to discarding pending target edits.

## Risks

- Separating the controls may create accidental coupling if the two popovers share one trigger or
  selection callback.
- A Workspace switch can leave a stale active-preset reference unless the selected catalog is
   reconciled after a successful switch without resetting operational state.
- Recent ordering can diverge if the launchpad and top bar implement separate limits or sorting.
- A preset query failure must not make the selected preset appear unapplied or silently restore the
  previous preset.
- Pending-edit confirmation can lose user work if it is bypassed by keyboard, outside-click, or a
  second quick-menu action.
- Long names and loading labels may collide with the theme/status controls at narrow widths.

## Definition of done

- The top bar has independent Workspace and preset selectors with chevrons.
- Workspace switching is quick, scoped, and query-free.
- The active Workspace exposes five recent presets using the shared recent ordering helper.
- Preset selection applies and fetches pods once, with loading, failure, and duplicate-action safety.
- Pending target edits require an explicit product-owned confirmation before replacement.
- Focus, keyboard dismissal, responsive layout, and both themes are validated.
- Frontend tests, typecheck, diagnostics, web/desktop smoke checks, and read-only boundary checks
  are recorded before implementation tasks are marked complete.

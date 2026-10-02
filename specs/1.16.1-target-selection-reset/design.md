# Design - ops-union v1.16.1 target selection reset

## Release intent

v1.16.1 records the converged reset contract for the target selection flow. Two entry points -
applying a preset and returning to the initial view - must leave the Target Selection panel in a
coherent, empty-of-stale-state condition. The store, not the component, owns the authoritative
reset; the panel reacts to `configurationRevision`.

## Ownership boundaries

- `@ops-union-frontend` owns the store slices, the `configurationRevision` reset signal, and the
  panel's reaction to it.
- `@ops-union-integration-qa` owns the regression evidence (focused store tests, full frontend
  suite, typecheck, diagnostics).
- The reset is purely client-side state; no backend or Kubernetes contract participates.

## State ownership and reset signal

`configurationRevision` is the single reset signal between the store and the view:

- [frontend/src/components/TargetSelectionPanel.tsx](../../frontend/src/components/TargetSelectionPanel.tsx)
  clears its local draft (`selectedClusters`, `selectedNamespaces`, `namespace`, `contextFilter`)
  in an effect keyed on `configurationRevision`.
- [frontend/src/App.tsx](../../frontend/src/App.tsx) clears the view `filter` and selected
  applications in a layout effect keyed on `configurationRevision` / `explicitQueryRevision`.

Any action that advances `configurationRevision` therefore cascades a consistent view reset without
each call site duplicating the field list.

## Apply-preset transition

`applyPreset(id)` in
[frontend/src/store/workspaceSlice.ts](../../frontend/src/store/workspaceSlice.ts):

```text
preset = presets[id]            // no-op when missing
mark preset used + persist catalog
targets            := copy(preset.targets)
activePresetId     := id
activePresetDirty  := false
configurationRevision += 1      // clears panel local draft (and filter via the view effect)
pods, targetErrors, hasQueried, podsError, lastUpdatedAt := cleared
```

The preset's targets fully replace the prior selection; the revision bump discards the local draft
the operator may have been editing.

## Return-to-initial-view transition

The Ops Union logo (`brand-lockup`) invokes `resetView` in
[frontend/src/App.tsx](../../frontend/src/App.tsx), which calls `clearTargets()` and then clears
selection, log state, the quick-preset id, and the view-reset request.

`clearTargets()` in [frontend/src/store/targetSlice.ts](../../frontend/src/store/targetSlice.ts):

```text
invalidate in-flight namespace + pod requests
targets                                   := []
namespaces, namespacesFor                 := []        // discovered namespaces
namespacesLoading, namespacesError        := cleared
activePresetId, activePresetDirty         := cleared
pods, targetErrors                        := []
podsLoading, refreshing, hasQueried       := cleared
podsError, lastUpdatedAt                  := cleared
configurationRevision += 1                            // clears local draft + filter
```

Request invalidation guarantees a late namespace or pod response cannot repopulate the cleared view.

## Why the store owns the reset

Centralizing the field list in the store (and signaling the view via `configurationRevision`) keeps
the two entry points consistent and prevents a partial reset where, for example, targets change but
the local draft or discovered namespaces linger. The panel stays a thin reactor to the revision.

## Failure and edge behavior

| Scenario | Behavior |
| --- | --- |
| Apply unknown preset id | No state change |
| Apply preset while editing a local draft | Draft discarded; preset targets applied |
| Return to initial view with in-flight discovery | Requests invalidated; view cleared |
| Late namespace/pod response after reset | Rejected by request/revision guards |

## Non-goals

No change to preset persistence, workspace catalog format, backend APIs, packaging, or release
mechanics. This record does not bump the package version.

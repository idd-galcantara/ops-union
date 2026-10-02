# Requirements - ops-union v1.16.1 target selection reset

## Status and scope

Version 1.16.1 is a PATCH convergence record for the already-implemented fix to the target
selection flow. It documents the observable behavior of applying a preset and of returning to the
initial view, so that the store's reset responsibilities are unambiguous and regression-tested.

The change lives in [frontend/src/store/workspaceSlice.ts](../../frontend/src/store/workspaceSlice.ts),
[frontend/src/store/targetSlice.ts](../../frontend/src/store/targetSlice.ts), and
[frontend/src/store.test.ts](../../frontend/src/store.test.ts). This specification introduces no new
product behavior beyond what is already implemented and verified.

The release remains read-only with respect to Kubernetes clusters. It does not authorize secret
collection, cluster mutation, dependency upgrades, version bumps, commits, tags, or a release push.

## Vocabulary

- **Targets**: the committed `cluster`/`namespace` pairs that drive pod queries (`state.targets`).
- **Local draft**: the Target Selection panel's uncommitted editor state - selected clusters,
  selected namespaces, the typed namespace, and the context filter - reset whenever
  `configurationRevision` changes.
- **Panel filter / view filter**: the unified-view text filter (`state.filter`).
- **Discovered namespaces**: namespace discovery results (`state.namespaces`, `state.namespacesFor`).
- **Operational state**: query lifecycle fields (`pods`, `targetErrors`, `hasQueried`, `podsError`,
  `lastUpdatedAt`, and the loading/refreshing flags).

## User stories

- As an operator, when I apply a preset, the panel shows the preset's targets and drops any
  half-finished local selection I was editing.
- As an operator, when I return to the initial view from the Ops Union logo, the panel starts clean
  with no targets, no local draft, no filter, no stale discovered namespaces, and no stale results.

## Requirements

### TGT-RESET-BASE - Preserve boundaries

1. The fix SHALL remain confined to client-side store state and view reset behavior.
2. The fix SHALL preserve the application's read-only Kubernetes boundary.
3. The fix SHALL NOT expose kubeconfig contents, credentials, or application secrets.

**Acceptance criteria:** Only frontend store state transitions change; no cluster call or
credential surface is affected.

### TGT-RESET-001 - Applying a preset replaces targets and clears the local draft

1. WHEN `applyPreset(id)` runs for an existing preset, the store SHALL replace `targets` with a copy
   of the preset's targets.
2. The store SHALL set `activePresetId` to the applied preset and `activePresetDirty` to `false`.
3. The store SHALL increment `configurationRevision`, which SHALL clear the Target Selection panel's
   local draft (selected clusters, selected namespaces, typed namespace, and context filter).
4. The store SHALL clear operational state (`pods`, `targetErrors`, `hasQueried`, `podsError`,
   `lastUpdatedAt`) so results do not outlive the previous selection.
5. IF the preset id does not exist, THEN the store SHALL make no change.

**Acceptance criteria:** After applying a preset, `targets` equals the preset targets,
`configurationRevision` has advanced, and the panel editor is empty.

### TGT-RESET-002 - Returning to the initial view clears the selection surface

1. WHEN the operator activates the Ops Union logo (return to the initial view), the application
   SHALL call `clearTargets()`.
2. `clearTargets()` SHALL clear `targets`, discovered namespaces (`namespaces`, `namespacesFor`),
   namespace loading/error state, `activePresetId`, `activePresetDirty`, and operational state.
3. `clearTargets()` SHALL increment `configurationRevision`, which SHALL clear the panel local draft
   and the view filter (`filter`).
4. In-flight namespace and pod requests SHALL be invalidated so late responses cannot commit.

**Acceptance criteria:** After returning to the initial view, `targets`, discovered namespaces, the
local draft, the filter, and operational state are all empty, and no stale response can apply.

### TGT-RESET-003 - Regression coverage

1. Focused store tests SHALL assert the preset-apply reset and the clear-targets reset.
2. The full frontend test suite SHALL pass.
3. The frontend typecheck SHALL pass and the changed files SHALL report no diagnostics.

**Acceptance criteria:** The documented behavior is enforced by automated tests that pass.

## Out of scope

- New selection features, UI redesign, or changes to preset persistence formats.
- Backend, packaging, dependency, or release changes.
- Any version bump, commit, tag, or push.

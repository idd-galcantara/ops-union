# Design - ops-union v1.17.0 cross-Workspace preset copy

## Release intent

v1.17.0 adds a safe, one-way catalog operation for reusing presets from another local Workspace.
The user remains in the Active Workspace, selects one source Workspace and one or more of its
presets, reviews a non-mutating plan, and copies accepted records into the Active Workspace.

This is intentionally separate from the v1.7.1 transfer direction and from the future `Move`
operation. The source is never deleted, and the operation never changes the live Kubernetes view.

## Ownership boundaries

- The preset library owner owns the entry point, source Workspace chooser, source preset selection,
  preview, conflict decision, confirmation, and ephemeral pending state.
- The Workspace catalog/store owner owns stable-id resolution, portable field extraction, fresh-id
  creation, conflict validation, active-reference reconciliation, and the single catalog commit.
- A pure copy-plan helper receives source and destination snapshots and returns accepted entries and
  conflicts without persistence, apply calls, or Kubernetes access.
- The existing dialog owner owns focus management, keyboard behavior, pending blocking, and safe
  local error presentation.
- `@ops-union-frontend` owns implementation, frontend tests, accessibility, and responsive behavior.
- `@ops-union-integration-qa` owns web/desktop persistence, failure, accessibility, responsive, and
  read-only validation.
- `@ops-union-architecture-review` owns a read-only audit of catalog ownership, active references,
  and no-apply/no-Kubernetes boundaries.
- `@ops-union-backend` has no implementation task; no backend change is authorized.

## Copy model

The UI holds ephemeral intent:

```ts
type CrossWorkspaceCopyIntent = {
  sourceWorkspaceId: string;
  sourcePresetIds: string[];
  destinationWorkspaceId: string;
};
```

The destination is captured from `activeWorkspaceId` when the flow opens. The source must be a
different Workspace that still exists when the plan is reviewed and when the copy is confirmed.
The exact local types may follow the existing store model.

The plan is also ephemeral:

```ts
type CrossWorkspaceCopyPlan = {
  intent: CrossWorkspaceCopyIntent;
  entries: Array<{
    sourcePresetId: string;
    name: string;
    description?: string;
    targets: NormalizedTarget[];
  }>;
  conflicts: CopyConflict[];
};
```

Fresh destination ids should be generated at the commit boundary, or regenerated after a final
validation, so a cancelled or stale preview never reserves or persists ids. A plan must retain
stable source and destination ids and enough catalog revision information to detect stale state.

## Flow and state transitions

```text
Active preset library
  -> source Workspace chooser
  -> source preset selection
  -> copy plan preview
  -> conflict decision, when needed
  -> confirmation
  -> pending single catalog commit
  -> destination records added; source retained
  -> Active Workspace library refreshed
```

The chooser and preview do not mutate the catalog. Cancel, invalidation, or failure returns to the
existing library with the last confirmed catalog and live operational state.

The destination Workspace remains active throughout. The UI may refresh its visible preset list after
success, but it must not apply the first copied preset, switch Workspace, reset targets, or start a
query.

## Source and destination resolution

The source chooser lists all saved Workspaces except the captured destination. It shows Workspace
name, preset count, and the destination marker. After a source is selected, the preset list resolves
only records belonging to that source id. Names are display data and never identify a source record.

Before preview and again before commit, the store must:

1. resolve the captured destination Workspace by stable id;
2. resolve the source Workspace by stable id and verify it is not the destination;
3. resolve every selected source preset by stable id;
4. verify the source and destination snapshots have not changed in a way that invalidates the plan;
5. extract only portable preset fields; and
6. calculate conflicts against the current destination catalog.

Any failed check invalidates the plan. The implementation must not substitute a same-name Workspace,
reuse a new preset at the same list position, or silently drop a missing record.

## Portable fields and catalog commit

The destination record contains the source preset's trimmed name, optional description, and normalized
target pairs. It receives a fresh local id and fresh local metadata. It does not receive the source
Workspace id, source id, `lastUsedAt`, active state, dirty state, or source-local ordering metadata.

For a copy, the store builds one next catalog from the final validated snapshots, appends or replaces
the selected destination entries according to the explicit conflict strategy, and persists that next
catalog through the existing atomic Workspace boundary. Source records are copied into the next
catalog unchanged. There is no loop of independent create calls and no source delete call.

The commit must preserve the destination's active preset reference. If an overwrite replaces a
semantic duplicate, retaining the existing destination preset id is preferred. If the local model
requires a new id, the store must reconcile the active reference in the same catalog transition and
must not alter current targets or operational state.

## Conflict behavior

The existing normalized, sorted, unique target-pair rule defines semantic equality. The plan reports
each incoming source preset that conflicts with an existing destination preset or another incoming
entry. Each conflict includes source and destination context and the target summary.

The confirmation offers:

- **Ignore conflicts:** copy only non-conflicting entries; source remains untouched.
- **Overwrite conflicts:** replace matching destination semantic records with portable source
  content, preserving destination identity where possible.
- **Cancel:** discard the plan without a catalog mutation.

Name-only collisions with different target sets are not semantic conflicts. The implementation should
preserve the existing name behavior; if the destination model requires unique names, propose a
visible deterministic suffix or ask for a new name in the preview. It must not silently overwrite a
different target set merely because names match.

If all selected entries conflict and the user chooses `Ignore conflicts`, the confirmation must state
that zero records will be created and a successful no-op must not be presented as a copied preset.

## Modal composition and accessibility

The existing preset library remains visible behind the flow according to current modal conventions.
The source chooser and preview should be one managed flow rather than unrelated nested dialogs. The
final confirmation uses the existing product-owned dialog pattern.

The flow needs:

- a clear source/destination heading;
- stable labels for Workspace and preset checkboxes;
- a selected-count summary;
- conflict and accepted-count summaries;
- a predictable initial focus and restored focus on close;
- Escape/backdrop cancellation at non-pending stages;
- disabled duplicate submission while committing; and
- wrapping behavior for long names and target summaries at narrow widths.

## Platform and validation boundaries

The web path uses the existing localStorage-backed Workspace catalog. The desktop path uses the
existing Electron user-data/IPC persistence boundary. The renderer does not read desktop files, and
no backend or Kubernetes client participates.

Validation must cover source/destination identity, multiple selected presets, fresh ids and metadata,
semantic and name-only conflicts, source preservation, active-reference preservation, cancellation,
stale plan invalidation, failed persistence, exact one-commit behavior, no apply/query/Kubernetes
calls, keyboard/focus behavior, narrow layouts, and both themes.
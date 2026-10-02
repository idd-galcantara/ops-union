# Design - ops-union v1.18.0 cross-Workspace preset move

## Release intent

v1.18.0 adds a destructive, one-destination catalog operation for moving selected presets from one
inactive local Workspace into the Active Workspace. It reuses the v1.17.0 copy flow's source
snapshot, stable-id selection, portable field extraction, conflict preview, and read-only boundary.
The defining difference is the atomic catalog transition: effective destination changes and source
removal are assembled into one next catalog and persisted once.

The destination is the `activeWorkspaceId` captured when the flow opens. The application never
switches Workspace during the flow. The source is selected from the remaining saved Workspaces and
must be inactive. A move is catalog management, not preset application: it never changes the live
selection or contacts Kubernetes.

## Ownership boundaries

- The existing preset-library owner owns the entry point, captured destination context, source
  chooser, multiple source-preset selection, plan/preview, conflict choice, confirmation, and
  ephemeral pending state.
- The Workspace catalog/store owner owns stable-id resolution, catalog revision checks, portable field
  extraction, fresh destination-id generation, conflict application, source-removal calculation,
  active-reference validation, and the single catalog commit.
- A pure move-plan helper receives source and destination snapshots plus selected ids and returns
  portable entries, conflicts, effective counts, and source-removal candidates. It performs no
  persistence, apply, query, or Kubernetes work.
- The existing dialog owner owns focus containment/restoration, keyboard and Escape behavior,
  backdrop handling, pending blocking, and safe local error presentation.
- `@ops-union-frontend` owns implementation, frontend tests, accessibility, and responsive behavior.
- `@ops-union-integration-qa` owns web/desktop persistence, failure/atomicity, accessibility,
  responsive, and read-only validation.
- `@ops-union-architecture-review` owns a read-only audit of catalog ownership, active-reference
  invariants, atomicity, and no-apply/no-Kubernetes boundaries.
- `@ops-union-backend` has no implementation task; no backend or Kubernetes change is authorized.
- `repository maintainer` owns later specification convergence and release administration only.

## Move model

The UI stores only ephemeral intent:

```ts
type CrossWorkspaceMoveIntent = {
  sourceWorkspaceId: string;
  sourcePresetIds: string[];
  destinationWorkspaceId: string;
};
```

The destination is captured from `activeWorkspaceId` when the flow opens. The source must be a
still-existing Workspace with a different stable id. The exact local types may follow the existing
store model.

The plan is also ephemeral:

```ts
type CrossWorkspaceMovePlan = {
  intent: CrossWorkspaceMoveIntent;
  sourceRevision: string | number;
  destinationRevision: string | number;
  entries: Array<{
    sourcePresetId: string;
    name: string;
    description?: string;
    targets: NormalizedTarget[];
    destinationPresetId?: string;
    status: 'create' | 'overwrite' | 'conflict';
  }>;
  conflicts: MoveConflict[];
  sourceRemovalIds: string[];
};
```

These are design contracts, not mandatory public type names. The plan must retain stable source,
destination, and preset ids plus enough catalog revision data to reject stale intent. Fresh ids are
generated for accepted creates at the commit boundary or after final validation; cancelled or stale
plans never reserve or persist them. An overwrite may retain the existing destination id to keep an
active destination reference valid. It must never reuse a source id.

## Flow and state transitions

```text
Active Workspace preset library
  -> inactive source Workspace chooser
  -> multiple source-preset selection
  -> non-mutating move plan / conflict preview
  -> reject, ignore, or overwrite decision when needed
  -> destructive confirmation
  -> final stable-id and revision revalidation
  -> one pending atomic catalog commit
  -> destination records created/replaced and eligible source records removed
  -> flow state cleared; Active Workspace remains active
```

The chooser and preview do not mutate a catalog. Cancel, invalidation, rejected conflicts, or
persistence failure returns to the existing library with the last confirmed catalogs and live
operational state. Only the final store action can commit.

## Source and destination resolution

When opened, the flow captures the current `activeWorkspaceId`. The chooser lists every saved
Workspace except that captured id and marks the captured destination in the flow header. The user
selects exactly one source. The source must remain distinct from the destination and must not become
active before confirmation.

Before preview and again immediately before commit, the store must:

1. resolve the captured destination Workspace by stable id;
2. resolve the source Workspace by stable id and verify it is still inactive and different;
3. resolve every selected source preset by stable id and verify ownership by the source id;
4. verify both catalog revisions and the selected records have not changed in a way that invalidates
   the plan;
5. verify that the active preset reference belongs to the destination catalog; and
6. extract portable fields and recalculate conflicts against the current destination catalog.

A failed check invalidates the plan. The implementation must not substitute a same-name Workspace,
reuse a new record at the same list position, silently drop a missing source id, or delete a source
record based on a stale selection.

## Portable fields and atomic catalog commit

The destination record contains the source preset's trimmed name, optional description, and normalized
unique target pairs. A non-conflicting record gets a fresh destination-local id and fresh local
metadata. It does not receive source Workspace identity, source id, `lastUsedAt`, active state, dirty
state, or source-local ordering metadata.

The store builds one next catalog from the final validated snapshots:

```text
current catalog
  -> validate captured source/destination and selected ids
  -> calculate accepted creates/replacements
  -> apply destination changes in the candidate catalog
  -> remove only sourceRemovalIds from the source catalog
  -> persist the complete next catalog once
```

The write boundary is the existing Workspace catalog persistence adapter, whether web localStorage or
the desktop user-data/IPC path. The implementation must not call independent destination create or
source delete actions. The old catalog remains authoritative until the single persistence operation
accepts the complete candidate. A rejected write leaves both source and destination exactly as last
confirmed.

For `Ignore conflicts`, `sourceRemovalIds` contains only source presets with at least one effective
accepted destination entry. In this one-destination flow, a conflicting source entry is therefore
retained. For `Overwrite conflicts`, every selected source preset with a valid matching destination
replacement is effective and is removed in the same candidate commit. A conflict-only Ignore plan is
an explicit zero-record no-op and does not need a catalog write.

## Conflict policy

The v1.17.0 semantic identity rule remains authoritative: normalize target pairs, remove duplicates,
sort deterministically, and compare the resulting target-set key. The plan compares incoming entries
with existing destination records and with other incoming entries. Every conflict retains source and
destination context.

The final confirmation exposes these outcomes:

- **Reject conflicts:** the operation cannot be confirmed while semantic conflicts remain. Cancel or
  revise the selection/plan; neither catalog changes.
- **Ignore conflicts:** omit conflicting source-to-destination entries, create only non-conflicting
  destination records, and remove only their source records in the same commit. A skipped source
  remains in the inactive source Workspace. If several selected entries form one planned duplicate
  group, the complete conflicting group is skipped so no source in that group is removed.
- **Overwrite conflicts:** replace matching destination semantic records with portable source content,
  retaining the destination record id where required. For a planned duplicate group, the last selected
  source entry is the deterministic winner. The effectively moved source records are then removed in
  the same commit.

When no semantic conflict exists, ordinary confirmation is sufficient; no strategy is inferred from a
name. Same-name/different-target entries are accepted because the existing model treats name as
presentation, not identity. The incoming name is retained and a fresh destination id is created. If a
future uniqueness invariant makes that invalid, the plan must surface a separate name validation and
require a deterministic user-visible rename; it must not silently overwrite a different target set.

If multiple incoming entries produce the same normalized target set, the plan reports a planned
semantic conflict. The selected conflict policy must be applied deterministically. Under Overwrite,
the existing destination identity is retained where possible and the last selected source entry that
wins must be explicit in the preview. Under Ignore, all entries in the conflicting planned-duplicate
group are skipped and remain in the source; ambiguity is never resolved by a best-effort delete.

## Active references and operational state

The active Workspace's `activePresetId` and `activePresetDirty` are not move targets. The source is
inactive, so under the existing Workspace-scoped invariant none of its records can be the active
preset. A final defensive check rejects the move if `activePresetId` resolves to a selected source
record or if the active reference is not owned by the captured destination. This deliberately leaves
all active-reference and dirty fields untouched rather than introducing an implicit clear or apply.

If an existing destination semantic record is overwritten, the store retains its destination id when
possible. The active reference, dirty state, current targets, and live results remain untouched even
if the saved record's portable content changes. The move does not recompute dirty state, apply the
new record, or clear a query.

Successful, cancelled, failed, and invalidated flows preserve:

- `activeWorkspaceId`, `activePresetId`, and `activePresetDirty`;
- current targets and discovered namespaces;
- pods, target errors, loading/refresh state, and last-updated information;
- filters, selected details, logs, and query state/revisions; and
- any other existing view/session state outside the ephemeral move flow.

The source Workspace's own inactive metadata may be reconciled only if the existing catalog model
requires it, and only inside the same catalog commit. It cannot change the Active Workspace's
reference or operational state.

## UI, confirmation, and accessibility

The flow should be one managed modal sequence using the existing preset-library patterns. It shows a
clear source/destination heading and captures the destination visibly. The source list presents
Workspace names and preset counts; the destination is not selectable as source. The preset list uses
stable-id-backed multi-select controls.

The preview and final confirmation show:

- move mode and source/destination Workspace names;
- selected source preset names/count;
- create, overwrite, skip, and source-removal counts;
- semantic conflict details and chosen reject/ignore/overwrite behavior;
- name-only collision details and the fact that they are not semantic conflicts; and
- the defensive active-reference rule, when relevant.

Controls use semantic labels, visible focus, keyboard navigation, predictable initial focus, focus
containment/restoration, Escape/backdrop cancellation before commit, duplicate-submit blocking, and
live pending/error feedback. Long names, target summaries, and conflict lists wrap at narrow widths
and high zoom.

## Platform and validation boundaries

Web uses the existing localStorage-backed Workspace catalog. Desktop uses the existing Electron
user-data/IPC persistence boundary. The renderer does not read desktop files. No backend route,
Kubernetes client, apply path, query path, filesystem operation, synchronization, account, or
permission feature participates.

Validation must cover inactive-source/active-destination identity, multiple stable-id selections,
portable records, fresh destination ids, source-id non-reuse, semantic conflicts, planned
duplicates, name-only collisions, reject/ignore/overwrite effects, source-removal eligibility,
final revalidation, exact one-commit behavior, failed persistence, no partial catalog state,
active-reference defense, full operational-state preservation, cancellation, keyboard/focus,
narrow layouts, both themes, web/desktop persistence, and no-apply/no-Kubernetes behavior.

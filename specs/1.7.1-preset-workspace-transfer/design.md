# Design - ops-union v1.7.1 preset copy and move between Workspaces

## Release status

The transfer implementation is included in the v1.7.1 release candidate. Focused frontend/store
validation, workspace typechecks, the complete build, and Linux packaging are recorded in `tasks.md`.
UI component/keyboard/responsive execution, architecture review, and web/desktop smoke QA remain
pending because those checks were not available in this session.

## Overview

The Active Workspace preset library gains two explicit actions for the current stable-id selection:
`Copy to Workspaces` and `Move to Workspaces`. Each opens a destination chooser for one or more
other Workspaces, builds a non-mutating transfer plan, validates conflicts, and then presents a
custom confirmation.

Copy creates independent destination records and leaves the source intact. Move uses the same plan,
but its catalog commit contains both destination creation and source removal. The store builds one
next catalog and persists it through the existing atomic boundary, so a failed destination or write
cannot expose a partially moved set.

Transfer is catalog management, not an operational action. It never applies a preset, changes the
Active Workspace, loads pods, or contacts Kubernetes. If the active source preset is moved, its saved
reference is cleared while the live operational view remains intact.

## Ownership boundaries

- The Active Workspace preset-library owner owns source selection, copy/move intent, destination
  chooser state, transfer-plan presentation, confirmation context, and ephemeral pending state.
- The existing Workspace catalog/store owner owns Workspace lookup, preset normalization, fresh-id
  creation, active-reference reconciliation, validation, and the atomic next-catalog commit.
- A shared transfer-plan helper should be pure: it receives a source snapshot, destination snapshots,
  and mode and returns planned records/conflicts without persistence or Kubernetes access.
- The existing custom dialog owner owns semantic confirmation, focus containment/restoration,
  Escape/backdrop handling, pending blocking, and safe error presentation. It does not call a store
  operation based on display names.
- `@ops-union-frontend` owns UI, store routing, plan/duplicate tests, accessibility, and responsive
  behavior.
- `@ops-union-integration-qa` owns web/desktop transfer, failure/atomicity, accessibility,
  responsive, and read-only validation.
- `@ops-union-architecture-review` owns a read-only audit of catalog ownership, active-reference
  behavior, atomic commit boundaries, and no-apply/no-Kubernetes behavior.
- `@ops-union-backend` has no implementation task. A read-only boundary check is allowed only if an
  unexpected dependency is found; no backend change is authorized.
- `repository maintainer` owns later specification convergence and release administration only.

## Transfer model and plan

The UI holds an ephemeral intent:

```ts
type TransferIntent = {
  mode: 'copy' | 'move';
  sourceWorkspaceId: string;
  presetIds: string[];
  destinationWorkspaceIds: string[];
};
```

The plan is generated from stable ids and current catalog snapshots:

```ts
type TransferPlan = {
  intent: TransferIntent;
  entries: Array<{
    sourcePresetId: string;
    destinationWorkspaceId: string;
    name: string;
    targets: NormalizedTarget[];
    newPresetId: string;
  }>;
  conflicts: TransferConflict[];
};
```

The exact local types may differ. New ids should be generated only for a valid plan or in a
reversible plan stage, and must never be persisted before confirmation. The source Workspace is the
Active Workspace captured when the flow opens. A destination must be a different, still-existing
Workspace. If the active catalog or selected records change, the plan is discarded and rebuilt.

The pure plan step:

1. Re-resolves every source id in the captured source Workspace.
2. Re-resolves every destination id and rejects the source Workspace as a destination.
3. Copies only portable preset fields: name, optional description, and normalized targets.
4. Generates independent destination ids and fresh local metadata for each destination record.
5. Checks semantic target duplicates against each destination and within the planned destination set,
  retaining the source preset plus destination Workspace identity for every conflict.
6. Allows same-name records when normalized targets differ, because names are not preset identity.
7. Returns all planned entries plus per-entry conflicts. The UI requires an explicit conflict
  strategy before confirmation rather than silently skipping or overwriting records.

No plan step calls persistence, `applyPreset`, `applyPresetAndLoad`, `loadPods`, or Kubernetes.

## Copy and move state transitions

```text
source library idle
  -> transfer chooser open
  -> valid plan / reviewable conflicts
  -> conflict decision (ignore or overwrite)
  -> confirmation open (catalog unchanged)
  -> pending atomic catalog commit
  -> copy: destinations added, source retained
  -> move: destinations added and source removed
  -> catalog settled; transfer state cleared
```

Cancel, invalidation, or failure returns to a usable source library with the last confirmed catalog
and operational state. A conflict decision does not mutate the catalog; only the final confirmation
can commit the selected entries.

### Copy commit

For copy, the store validates the source and destination ids again, appends fresh destination
records, and persists the resulting catalog once. Source records, their ids, `lastUsedAt`, active
reference, and current Workspace remain unchanged. Copied records are never activated or applied.

### Move commit

For move, the store validates every plan entry, constructs a next catalog containing all destination
records, then removes exactly the selected source records from the captured source Workspace. It
persists that complete next catalog through one atomic operation. Only after the store accepts that
commit does the UI clear transfer state and report success.

If persistence cannot atomically accept the next catalog, the old catalog remains authoritative and
no source record is removed. The implementation must not expose a destination-only intermediate
state or call individual delete operations after individual creates.

## Metadata and active references

Each destination record receives a fresh local preset id, fresh local created/updated metadata when
the model has those fields, and no inherited `lastUsedAt`. It preserves the source name,
optional description, and normalized target pairs. Destination records do not inherit source
Workspace id, active status, dirty state, or operational state.

Copying the active source preset leaves the source active reference valid. Moving it removes its
source record, so the store clears or reconciles the active reference and dirty state. In both cases,
current targets, namespaces, pods, filters, logs, query state, selected details, loading/errors, and
refresh state remain unchanged. The UI may show outside-Workspace/live-search status after a move,
but must not clear or reapply targets.

## Conflict policy

Semantic duplicate identity uses the existing normalized, sorted, unique target-pair rule. For each
destination, the plan compares every incoming target set with existing destination presets and with
other incoming entries. Any match is a conflict reported with source and destination context. The
decision is applied independently to each preset plus destination combination:

- `Ignore conflicts` commits only entries without a conflict. A move removes a source preset only
  when at least one of its entries was committed; a preset whose every destination conflicts stays
  at the source.
- `Overwrite conflicts` commits every planned entry. Existing semantic duplicates are replaced with
  the destination record identity preserved when possible and the destination usage metadata kept;
  source `lastUsedAt` is never copied. For repeated planned target keys, the last selected entry is
  deterministic and is the effective move winner.
- `Cancel` leaves the catalog and operational state unchanged.

The catalog is still committed once for the chosen action, so an explicit partial decision cannot
expose a partially persisted move.

Name-only collisions are allowed. The conflict decision and final confirmation report both the total
planned records and the records effective under the chosen strategy, and the library may show equal
names with their existing target summaries. A concurrent change invalidates the plan and requires a
new review.

## UI, confirmation, and accessibility

The destination chooser uses Workspace names, preset counts, active/source marking, and multi-select
checkboxes. The source Workspace is shown but disabled as a destination with an explanation. The
chooser exposes copy and move as explicit mode choices and a clear/cancel action.

The confirmation shows:

- `Copy` or `Move` mode;
- source Workspace and selected preset names/count;
- destination Workspace names/count;
- total destination records to create; and
- for move, the source records to remove and active-preset reference consequence.

The source list and chooser remain mounted according to the existing modal layering contract. The
custom dialog has semantic title/description, predictable initial focus, focus containment and
restoration, Escape/backdrop dismissal, disabled duplicate submission, and live pending/error
status. Long names and destination summaries wrap accessibly at narrow widths and high zoom.

## Platform and validation boundaries

The transfer store path is the existing web localStorage or desktop Electron user-data/IPC boundary.
No backend route, Kubernetes client, renderer filesystem access, synchronization, account, or
collaboration feature participates. The only operation that may change live targets or query pods
remains explicit preset application.

Validation must cover source/destination selection, copy/move plan contents, fresh ids/metadata,
name-only and semantic conflicts, active copy/move, cancellation, concurrent invalidation, failed
persistence, exact one-commit behavior, no partial catalog state, keyboard/focus/responsive behavior,
and read-only/no-apply boundaries.

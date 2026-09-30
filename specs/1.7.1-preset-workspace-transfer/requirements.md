# Requirements - ops-union v1.7.1 preset copy and move between Workspaces

## Status and scope

This is the planned v1.7.1 specification for copying and moving selected presets from the Active
Workspace to one or more other Workspaces. It builds on the v1.7.0 preset selection contract and the
existing Workspace/preset persistence and custom confirmation patterns.

The scope covers:

- selecting one or more source presets;
- choosing one or more destination Workspaces;
- copying while retaining the source records;
- moving by creating destination records and removing source records only after successful creation;
- fresh ids and local metadata for every destination record;
- deterministic conflict and duplicate handling; and
- atomic, no-apply, no-Kubernetes behavior.

The source is always the Active Workspace when the transfer flow starts. The destination chooser
may include any other saved Workspace in the local profile, but never the source Workspace itself.

## Glossary

- **Source Workspace:** The Active Workspace whose selected presets are being transferred.
- **Source selection:** Stable ids of one or more presets belonging to the source Workspace.
- **Destination Workspace:** A selected Workspace that will receive a new local preset record.
- **Copy:** Create destination records and retain every source record.
- **Move:** Create destination records successfully, then remove the source records in the same
  committed catalog transition; it is not a copy followed by best-effort independent deletes.
- **Semantic duplicate:** A preset whose normalized, sorted, unique target set matches another preset
  in the same destination, regardless of id or name.
- **Transfer plan:** The validated source snapshot, destination ids, generated destination records,
  conflict report, and operation mode shown before confirmation.

## User stories

- As an operator, I can select presets in one Workspace and copy them to several other Workspaces
  without changing the source library.
- As an operator, I can move presets to several Workspaces and know that the source is removed only
  after every required destination creation succeeds.
- As an operator, I can review destination conflicts before any catalog mutation occurs.
- As an operator, I can transfer saved presets without applying them, querying Kubernetes, or losing
  the targets and logs I am currently inspecting.

## Requirements

### TR-1 - Source selection and destination choice

1. The transfer actions SHALL operate on one or more selected stable preset ids from the Active
   Workspace and SHALL use the v1.7.0 selection semantics.
2. An empty source selection SHALL disable or hide copy and move actions and SHALL not open a chooser
   or confirmation.
3. The destination chooser SHALL list saved Workspaces other than the source Workspace, identify the
   current source, and support selecting one or more destination Workspace ids.
4. The chooser SHALL use stable Workspace ids, preserve selection while the user reviews the transfer
   plan, and reconcile removed Workspaces before confirmation.
5. The source Workspace SHALL not be an eligible destination. If a destination disappears or becomes
   the source due to a context change, the plan SHALL be invalidated safely without fallback to a
   same-name Workspace.
6. Copy and move SHALL be separate explicit actions. Choosing destinations SHALL not mutate presets,
   change the Active Workspace, apply a preset, or query Kubernetes.

**Acceptance criteria:** A user can select multiple source presets, select one or more different
Workspaces, switch between copy and move intent, and see an accurate source/destination summary before
any catalog or operational state changes.

### TR-2 - Copy semantics

1. Confirming a copy SHALL create one independent new preset in every selected destination for every
   selected source preset that passes validation.
2. The source Workspace and all source records SHALL remain unchanged, including source ids,
   descriptions, normalized targets, and `lastUsedAt` metadata.
3. Every destination record SHALL receive a fresh local preset id unique within the destination
   Workspace. Destination records SHALL preserve portable meaning: name, optional description, and
   normalized target pairs.
4. Destination records SHALL not inherit `lastUsedAt`, active status, source Workspace identity, or
   source-local created/updated metadata. They SHALL receive fresh local metadata according to the
   existing store convention.
5. Copying SHALL not select, activate, apply, or fetch any copied preset. An existing active preset in
   the source remains active if it was copied.
6. A successful copy SHALL clear or reconcile only transfer selection/plan state as defined by the UI;
   it SHALL preserve targets, pods, filters, logs, query state, and all other operational state.

**Acceptance criteria:** Copying two presets to three destinations produces six new destination
records with fresh ids, leaves the source intact, changes no active preset or live view, and persists
through the existing Workspace catalog boundary.

### TR-3 - Move semantics and active-preset handling

1. A confirmed move SHALL create the planned new records in every selected destination before removing
   any source record.
2. The source records SHALL be removed only after all destination records validate and the catalog
   persistence operation succeeds. A failed destination creation or write SHALL leave both source and
   destinations in their last confirmed state.
3. Move SHALL use one atomic catalog commit or the strongest existing transactional persistence
   boundary. It SHALL not expose a state where source records are removed while required destinations
   are missing.
4. If the active preset is moved, the source active-preset reference and dirty state SHALL be cleared
   or reconciled because the source record no longer exists. Current targets, namespaces, pods,
   filters, logs, selected details, loading/errors, and query state SHALL remain unchanged.
5. If a selected active preset is copied, its source active reference SHALL remain valid and current
   live state SHALL remain unchanged.
6. Move SHALL not apply a destination preset, switch Workspaces, call `applyPresetAndLoad`, call
   `loadPods`, or invoke any Kubernetes API operation.

**Acceptance criteria:** A move either creates every planned destination record and removes the source
records in one accepted commit, or changes nothing; moving the active preset clears only its saved
reference while preserving the live operational view.

### TR-4 - Conflict and duplicate policy

1. Before confirmation, the transfer plan SHALL detect conflicts independently for each destination
   using the existing target normalization and semantic-duplicate rules.
2. A semantic duplicate in any destination SHALL be a blocking conflict for the complete transfer
   plan. The UI SHALL identify the destination, source preset, and conflicting existing or planned
   target set.
3. Two selected source presets with the same normalized target set SHALL also be reported as a
   planned-destination conflict rather than silently creating ambiguous duplicate records.
4. Presets with the same display name but different normalized targets SHALL be allowed because name
   is not the existing preset identity. The confirmation SHALL still show the number of records that
   will be created.
5. The source Workspace SHALL be excluded from conflict planning by being ineligible as a destination;
   the operation SHALL not silently turn a copy or move into a no-op.
6. A blocking conflict SHALL prevent confirmation/commit and SHALL leave every Workspace, active
   reference, selection, and operational state unchanged. The user may revise destinations or source
   selection and rebuild the plan.
7. Concurrent catalog changes, missing source ids, or changed destination membership SHALL trigger
   revalidation and a safe plan-invalidated outcome, never a best-effort partial transfer.

**Acceptance criteria:** Existing semantic duplicates and duplicate planned target sets are visible
and block the whole operation; name-only collisions are allowed; conflicts and concurrent changes
produce no partial catalog mutation.

### TR-5 - Confirmation, failure, and accessibility

1. Copy and move SHALL each use the existing product-owned confirmation/dialog pattern after a valid
   transfer plan exists.
2. The confirmation SHALL identify mode, source Workspace, selected preset names/count, destination
   Workspace names/count, created-record count, and for move the source-removal and active-reference
   consequences.
3. Cancel, Escape, and backdrop dismissal SHALL close only the chooser/confirmation layer and SHALL
   preserve the source list, operational state, and last confirmed catalog.
4. While the operation is pending, duplicate submissions and competing catalog actions SHALL be
   blocked. The source and destination surfaces SHALL remain mounted as required by existing modal
   conventions.
5. Failed validation, conflict, persistence, or record-creation outcomes SHALL not claim success,
   shall not remove source records, and SHALL use safe local feedback without filesystem paths,
   kubeconfig data, credentials, raw response bodies, or headers.
6. Dialogs and chooser controls SHALL expose semantic labels, focus management, keyboard navigation,
   visible focus, live pending/error status, and usable wrapping at narrow desktop widths and in both
   themes.

**Acceptance criteria:** Users can inspect and cancel a copy or move, confirm exactly once, understand
its complete impact, and recover from conflicts or failures without a partial transfer or lost focus.

### TR-6 - Ownership and platform boundaries

1. Transfer orchestration SHALL remain in the frontend/store Workspace catalog boundary and SHALL
   reuse existing preset normalization and persistence behavior.
2. Copy and move SHALL not add backend routes, Kubernetes mutations, Kubernetes reads, renderer
   filesystem access, synchronization, accounts, permissions, or collaboration behavior.
3. Transfer selection, plans, confirmations, and pending state SHALL not be persisted as preset
   metadata or exported as Workspace content.
4. The existing explicit preset application path SHALL remain the only path that changes live targets
   and starts a pod query.
5. Existing Workspace identity, localStorage web boundary, Electron user-data/IPC boundary, and
   active-reference invariants SHALL remain authoritative.

**Acceptance criteria:** Architecture review finds one owner for transfer state and catalog commits,
no apply/query/Kubernetes path, no new persistence boundary, and unchanged source/read-only behavior.

## Out of scope

- Transferring Workspaces themselves or exporting all Workspaces as one document.
- Applying or preview-running copied/moved presets against Kubernetes.
- Cross-profile, cloud, team, or server synchronization.
- Partial success, per-record skip, overwrite, or automatic conflict renaming in v1.7.1.
- Changing preset name uniqueness or semantic-duplicate rules outside this transfer operation.

## Risks

- A multi-destination move can become destructive if source removal is not included in the same
  accepted catalog commit as destination creation.
- Concurrent Workspace changes can make a precomputed plan stale.
- A destination with a semantic duplicate can create confusing duplicate-looking rows if conflict
  checks use names instead of normalized targets.
- Copying an active preset must not accidentally change active reference or trigger application.
- Fresh metadata may be lost if the implementation clones the full source object rather than using
  the portable preset fields.

## Definition of done

- Multiple selected presets can be copied or moved to one or more other Workspaces through an
  explicit chooser and confirmation.
- Copy retains source records; move removes source records only after all destination creation and
  persistence succeed.
- Destination records use fresh ids and local metadata while preserving name, description, and
  normalized targets without inheriting usage/active metadata.
- Semantic conflicts block the complete plan before mutation; name-only collisions are allowed; no
  partial success or overwrite occurs.
- Active-preset copy/move behavior, operational-state preservation, no-apply/no-Kubernetes behavior,
  cancellation, failure, accessibility, and atomicity are validated and recorded.
- No source code, package version, release artifact, commit, or tag is part of this spec-authoring
  task.

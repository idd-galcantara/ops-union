# Requirements - ops-union v1.18.0 cross-Workspace preset move

## Status and scope

This is the planned v1.18.0 feature specification for moving selected presets from one inactive
local preset Workspace into the Active Workspace. It extends the v1.17.0 cross-Workspace copy flow
and preserves its stable-id selection, portable-record, conflict-preview, catalog-boundary, and
read-only operational decisions wherever they apply.

The flow has exactly one inactive Source Workspace and one destination: the Active Workspace captured
when the flow starts. The user may select multiple source presets in one operation. A successful move
creates or replaces the effective destination records and removes only the source records selected for
that successful transfer, as one persisted catalog commit. It is never implemented as an independent
copy followed by best-effort deletes.

This specification covers:

- opening a move flow from the existing preset library without changing Workspace context;
- choosing one inactive source Workspace while retaining the Active Workspace as destination;
- selecting multiple source presets by stable ids;
- previewing portable records, semantic conflicts, name-only collisions, and source-removal impact;
- revalidating stable identities and catalog revisions immediately before commit;
- atomically creating/replacing destination records and removing eligible source records;
- preserving the active Workspace and live operational state; and
- web/desktop persistence through the existing Workspace catalog boundary.

It does not authorize source code changes, package or application version changes, commits, tags,
releases, or implementation of unrelated Workspace transfer behavior.

## Glossary

- **Active Workspace:** The current destination Workspace captured from `activeWorkspaceId` when the
  move flow opens. It remains active throughout the flow.
- **Source Workspace:** The one saved Workspace selected as the move source. It MUST be different from
  and inactive relative to the captured Active Workspace.
- **Source preset:** A stable preset id belonging to the selected Source Workspace.
- **Portable preset content:** Trimmed name, optional description, and normalized unique `(cluster,
  namespace)` target pairs. Local ids, usage metadata, active state, and Workspace identity are not
  portable.
- **Semantic duplicate:** A preset whose normalized, sorted, unique target set matches an existing or
  planned preset in the Active Workspace, regardless of id or display name.
- **Name-only collision:** Equal display names with different normalized target sets. This is not a
  semantic duplicate and does not identify a record.
- **Move plan:** The non-mutating source/destination snapshots, selected source ids, proposed
  destination records, conflicts, effective counts, source-removal set, and catalog revision data
  shown before confirmation.

## User stories

- As an operator, I can move several presets from another inactive Workspace into the Workspace I am
  currently using without switching context.
- As an operator, I can see exactly which destination records will be created or overwritten and which
  source records will be removed before confirming.
- As an operator, I can choose a deterministic response to semantic conflicts without risking a
  partially moved catalog.
- As an operator, I can move presets without applying them, querying Kubernetes, or losing the
  targets, pods, filters, logs, details, or query state I am currently inspecting.
- As an operator, I can recover from a stale plan or persistence failure with both Workspaces still in
  their last confirmed state.

## Requirements

### MV-BASE - Product, platform, and operational boundaries

1. The feature SHALL operate only on locally persisted preset Workspaces belonging to the current
   profile.
2. The feature SHALL remain frontend/store-owned and SHALL reuse the existing Workspace catalog,
   preset normalization, stable-id, and persistence boundaries established by v1.17.0.
3. The feature SHALL not add backend routes, Kubernetes calls, Kubernetes mutations, credentials,
   kubeconfig access, renderer filesystem access, accounts, permissions, or synchronization.
4. The feature SHALL not apply, activate, fetch, preview-run, or query any moved preset automatically.
5. The move SHALL not switch Workspaces: `activeWorkspaceId` SHALL remain the captured destination
   before, during, and after a successful, cancelled, invalidated, or failed flow.
6. The source SHALL be inactive and the destination SHALL be the Active Workspace captured when the
   flow opens. A source/destination role reversal or context change SHALL invalidate the plan.

**Acceptance criteria:** The operation is a local catalog-only action from an inactive source to the
current Active Workspace; no backend, filesystem, apply, query, or Kubernetes path participates.

### MV-001 - Source, destination, and multiple selection

1. The preset library SHALL expose an explicit action such as `Move from another Workspace`.
2. Opening the flow SHALL capture `activeWorkspaceId` as the destination and SHALL not change it.
3. The source chooser SHALL list saved Workspaces other than the captured destination, identify the
   captured destination clearly, and allow exactly one inactive source Workspace.
4. The source chooser SHALL resolve Workspaces by stable ids, not by names or list positions. The
   destination SHALL never be eligible as the source.
5. After choosing a source, the user SHALL be able to select zero or more source presets by stable
   preset ids, with multiple selection supported.
6. Move SHALL remain unavailable until a valid source Workspace and at least one source preset are
   selected.
7. Selecting a source or presets SHALL not mutate either catalog, change active references, alter
   operational state, or invoke apply/query/Kubernetes behavior.
8. If the source Workspace, destination Workspace, selected preset, or relevant catalog revision
   disappears or changes before preview or confirmation, the plan SHALL be invalidated and rebuilt.
   The implementation SHALL not fall back to a same-name Workspace or preset.

**Acceptance criteria:** The user can select one inactive source and multiple presets while the
current Workspace remains the visible destination and no catalog mutation occurs before confirmation.

### MV-002 - Portable destination records and atomic move

1. A valid move plan SHALL extract only each source preset's trimmed name, optional description, and
   normalized unique target pairs.
2. Each non-conflicting destination record SHALL receive a fresh local id unique within the Active
   Workspace and fresh local metadata according to the existing store convention.
3. A destination record SHALL not inherit the source id, source Workspace id, `lastUsedAt`, active
   state, dirty state, or source-local created/updated/ordering metadata.
4. For an overwrite of a semantic destination conflict, the existing destination record id SHALL be
   preserved where required by the active-reference invariant; the source id SHALL never be reused as
   the destination id. The destination record remains a local destination identity.
5. The store SHALL revalidate source/destination stable ids, selected source ids, role direction, and
   the relevant catalog revision immediately before commit.
6. The store SHALL construct one complete next catalog containing the effective destination creations
   or replacements and the effective source removals, then persist that catalog through one existing
   atomic catalog commit.
7. Source records SHALL be removed only in that same candidate catalog after destination validation
   has succeeded. The implementation SHALL not issue independent create, overwrite, and delete
   persistence calls.
8. If validation, destination construction, or persistence fails, the previously persisted catalog
   SHALL remain authoritative: source and destination SHALL both remain unchanged and the UI SHALL
   not claim success.
9. After a successful move, the source identity is no longer present for removed records; before the
   commit, source ids remain the sole identity used for source resolution and are never replaced by
   names.
10. A successful move SHALL clear only ephemeral flow/selection state and MAY refresh the visible
    Active Workspace library. It SHALL not apply or select a moved destination preset.

**Acceptance criteria:** A move either persists the complete destination-plus-source-removal result
once or persists nothing; no source-removed/destination-missing intermediate state is observable.

### MV-003 - Conflict, duplicate, and name-only policy

1. The preview SHALL detect semantic conflicts independently against existing Active Workspace
   presets and among selected incoming presets after the v1.17.0 target normalization rule.
2. Each conflict SHALL identify the source Workspace/preset, destination Workspace/preset when one
   exists, normalized target set, and whether the conflict is existing or planned.
3. Name-only collisions with different normalized target sets SHALL not be treated as semantic
   duplicates. Under the existing catalog model, the incoming record SHALL retain its name, receive a
   fresh destination id, and be created; the move SHALL remove its source record only after the
   atomic commit succeeds.
4. Name-only collisions SHALL never silently cause an overwrite or source deletion beyond the
   selected source record. If a future catalog invariant requires unique names, the plan SHALL report
   the collision as an explicit validation requiring a deterministic user-visible rename; it SHALL not
   silently rename or overwrite a different target set.
5. When semantic conflicts exist, confirmation SHALL expose explicit strategies:
   - **Reject conflicts:** the move SHALL be unavailable until conflicts are resolved, or the user
     may cancel; no catalog mutation and no source removal occurs.
   - **Ignore conflicts:** conflicting source-to-destination entries SHALL be skipped. Non-conflicting
     entries SHALL move atomically. A skipped source preset SHALL remain in the source; when all
     selected entries conflict, the result is an explicit zero-record no-op and the source remains
     unchanged.
   - **Overwrite conflicts:** every selected conflict SHALL replace the matching destination semantic
       record using destination identity where required. If multiple selected source presets share the
       same normalized target-set key, the last selected source preset SHALL be the deterministic
       effective winner for that destination key. All effectively transferred source records SHALL be
       removed in the same successful commit.
6. A move with no semantic conflicts SHALL not require a conflict strategy beyond ordinary confirmation;
   `Reject`, `Ignore`, and `Overwrite` SHALL never be inferred from display names alone.
7. Concurrent catalog changes, missing ids, changed source/destination roles, or a changed target set
   SHALL invalidate the plan and require a new preview rather than performing a best-effort partial
   move.
8. Cancellation, invalidation, rejected conflicts, and a conflict-only `Ignore` result SHALL leave
   both catalogs and all operational state unchanged.

**Acceptance criteria:** Semantic conflicts are reviewable and have explicit reject/ignore/overwrite
outcomes; name-only collisions are distinguished, visible, and never used as record identity.

### MV-004 - Active references and operational-state preservation

1. The move SHALL preserve `activeWorkspaceId`, `activePresetId`, and `activePresetDirty` on the
   normal valid path, including when an existing Active Workspace semantic record is overwritten;
   destination identity SHALL be retained where necessary so the active reference remains valid.
2. Because the source MUST be inactive and the destination owns the active reference, a selected
   source preset SHALL not normally equal `activePresetId`. If final revalidation finds that the
   active reference points to a selected source record, or that Workspace scoping is inconsistent,
   the move SHALL be rejected before commit. It SHALL not clear, retarget, or silently reconcile the
   active reference for this feature.
3. Successful, failed, cancelled, and invalidated moves SHALL preserve current `targets`, `pods`,
   namespaces, selected details, filters, logs, query state, loading/error state, refresh state,
   and query revisions. The flow SHALL not call a target reset or preset-application transition.
4. Moving a source preset SHALL not mark the destination preset active, change the dirty state, or
   cause the live targets to be compared/recomputed against moved content.
5. If the Active Workspace has an active preset that is semantically overwritten, its stable
   destination id and `activePresetId` SHALL remain unchanged, and `activePresetDirty` plus the live
   operational state SHALL remain unchanged.
6. The source Workspace's own inactive active-reference metadata, if modeled separately, SHALL be
   reconciled only according to existing catalog invariants and only inside the same catalog commit;
   this SHALL not affect the active Workspace's reference or live state.

**Acceptance criteria:** The current Workspace and view remain exactly as they were, except for the
intended destination catalog records and, after success, removal of effectively moved source records.
The abnormal active-source reference case is rejected without mutation.

### MV-005 - Flow, failure, and accessibility behavior

1. The flow SHALL show source and destination Workspaces, selected preset names/count, accepted and
   skipped counts, destination create/overwrite counts, source-removal counts, name-only collisions,
   and active-reference impact before confirmation.
2. Cancel, Escape, and backdrop dismissal SHALL discard only ephemeral move state and preserve both
   last-confirmed catalogs, active references, and operational state.
3. While planning or committing, duplicate submissions and competing catalog actions SHALL be blocked
   according to existing modal conventions.
4. Persistence and validation errors SHALL use safe local feedback and SHALL not expose filesystem
   paths, kubeconfig data, credentials, headers, or raw response bodies.
5. Source/preset selection, conflict strategy, confirmation, cancel, pending, error, and success
   controls SHALL have semantic accessible names, visible focus, keyboard navigation, focus
   containment/restoration, and live status behavior matching the existing modal patterns.
6. Long names, target summaries, conflict details, and counts SHALL wrap at narrow desktop widths and
   high zoom without obscuring controls.

**Acceptance criteria:** A user can inspect the complete destructive impact, cancel safely, confirm
once, and recover from failure without partial transfer or lost focus.

## Out of scope

- Moving an entire Workspace, deleting Workspaces, or changing Workspace identity.
- Selecting multiple source Workspaces in one operation.
- Moving presets through the filesystem, JSON export/import, cloud, team, or synchronization paths.
- Backend, REST/WebSocket, Electron bridge, Kubernetes, credential, or filesystem implementation
  changes.
- Applying, preview-running, fetching, or querying any moved preset.
- Changing the preset target normalization, semantic identity, or existing single-Workspace library
  rules.
- Changing package/application version, release artifacts, commits, tags, or pushes in this task.
- Automatic rename or silent overwrite for a name-only collision.

## Risks

- A stale plan could remove the wrong source record if stable ids or catalog revisions are replaced by
  names or list positions.
- A multi-entry move could expose a partial state if source removal is persisted separately from
  destination creation.
- Overwriting an active destination semantic record could invalidate `activePresetId` unless the
  destination id is retained and the live state is left untouched.
- Treating a name-only collision as a semantic duplicate could remove or replace an unrelated target
  set.
- Cloning the complete source object could leak source Workspace identity, usage metadata, or active
  state into the destination.

## Definition of done

- One inactive source Workspace can provide multiple selected presets to the Active Workspace through
  a reviewable move flow without changing `activeWorkspaceId`.
- Fresh destination ids/local metadata and portable fields are used; source ids are used for source
  resolution only until successful removal.
- Semantic conflicts support explicit reject/ignore/overwrite outcomes, while name-only collisions
  remain distinct and deterministic.
- Destination creation/replacement and eligible source removal occur in one persisted catalog commit;
  failed validation or persistence leaves both Workspaces unchanged.
- Active references, dirty state, targets, pods, filters, logs, and query state are preserved, with
  inconsistent active-source references rejected before commit.
- Focused implementation, integration, architecture, accessibility, failure, atomicity, and
  no-apply/no-Kubernetes validation are assigned in `tasks.md`.
- This spec does not implement code or change package/version, release artifacts, commit, tag, or push.

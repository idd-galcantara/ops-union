# Requirements - ops-union v1.17.0 cross-Workspace preset copy

## Status and scope

This is the v1.17.0 feature specification for copying selected presets from another local preset
Workspace into the Active Workspace. It extends the existing Workspace-scoped preset library and
portability behavior without introducing a destructive transfer operation.

The flow has one source Workspace and one destination: the Active Workspace captured when the flow
starts. The user may select multiple presets from the source Workspace in one operation. The source
Workspace and its presets remain unchanged after a successful copy.

This specification covers:

- opening a cross-Workspace copy flow from the existing preset library;
- choosing one saved source Workspace other than the Active Workspace;
- selecting one or more source presets;
- previewing the portable records and destination conflicts;
- copying accepted presets with fresh local ids and destination metadata;
- preserving current operational state and the read-only Kubernetes boundary; and
- web/desktop persistence through the existing Workspace catalog boundary.

It does not authorize source code changes, package version changes, commits, tags, releases, or the
later `Move` operation.

## Glossary

- **Active Workspace:** The current destination Workspace whose preset library is visible after the
  flow completes.
- **Source Workspace:** The one other local Workspace selected for this copy operation.
- **Source preset:** A stable preset id belonging to the selected Source Workspace.
- **Portable preset content:** Name, optional description, and normalized `(cluster, namespace)`
  targets. Local ids, usage metadata, and Workspace identity are not portable.
- **Semantic duplicate:** A preset whose normalized, sorted, unique target set matches a preset in
  the Active Workspace, regardless of id or display name.
- **Copy plan:** The non-mutating source snapshot, selected ids, accepted entries, conflicts, and
  destination summary shown before confirmation.

## User stories

- As an operator, I can open the preset library while working in one Workspace and choose presets
  from another Workspace without switching my current Workspace.
- As an operator, I can copy several presets into the Active Workspace without changing the source
  library or applying any copied preset.
- As an operator, I can review duplicate and name conflicts before anything is persisted.
- As an operator, I can reuse presets from another Workspace without changing the targets, pods,
  filters, logs, details, or query state I am currently inspecting.

## Requirements

### CP-BASE - Product and platform boundaries

1. The feature SHALL operate only on locally persisted preset Workspaces belonging to the current
   profile.
2. The feature SHALL remain frontend/store-owned and SHALL reuse the existing Workspace catalog,
   preset normalization, and persistence boundaries.
3. The feature SHALL not add backend routes, Kubernetes calls, Kubernetes mutations, credentials,
   kubeconfig access, renderer filesystem access, accounts, permissions, or synchronization.
4. The feature SHALL not apply, activate, or fetch any copied preset automatically.
5. The source Workspace SHALL remain unchanged, including its preset ids, content, usage metadata,
   active relationship, and ordering metadata.

**Acceptance criteria:** A copy is a local catalog operation only; no backend, Kubernetes, apply, or
credential path participates; the source catalog is byte-for-byte equivalent in observable content.

### CP-001 - Source Workspace and preset selection

1. The preset library SHALL expose an explicit action such as `Import from another Workspace` or
   `Copy from Workspace`.
2. Opening the flow SHALL capture the Active Workspace id as the destination and SHALL not switch
   the Active Workspace.
3. The source chooser SHALL list saved Workspaces other than the captured destination, using stable
   Workspace ids and showing each Workspace name and preset count.
4. The destination Workspace SHALL be visible in the flow and SHALL be unavailable as a source.
5. The user SHALL select exactly one source Workspace per operation and may select zero or more
   presets after choosing it.
6. Source presets SHALL be resolved by stable preset ids, not by display names or list positions.
7. Copy actions SHALL remain unavailable until a valid source Workspace and at least one source
   preset are selected.
8. If the source Workspace, destination Workspace, or selected preset disappears or changes before
   confirmation, the copy plan SHALL be invalidated and rebuilt; the system SHALL not fall back to a
   same-name Workspace or preset.
9. Choosing a source Workspace or presets SHALL not mutate the catalog, change the Active Workspace,
   alter operational state, or query Kubernetes.

**Acceptance criteria:** A user can choose another Workspace, select multiple presets, and see the
current Workspace clearly identified as the destination before any catalog mutation occurs.

### CP-002 - Non-mutating preview and copy semantics

1. The flow SHALL show a preview before persistence containing the source Workspace, destination
   Workspace, selected preset names/count, accepted record count, and any conflicts.
2. Confirming a copy SHALL create one independent destination preset for each accepted source preset.
3. Every destination preset SHALL receive a fresh id unique within the Active Workspace and fresh
   local metadata according to the existing store convention.
4. A copied preset SHALL preserve its trimmed name, optional description, and normalized target pairs.
5. A copied preset SHALL not inherit source id, source Workspace id, `lastUsedAt`, active status,
   dirty state, or source-local created/updated metadata.
6. The copy SHALL persist the resulting Workspace catalog through one existing catalog commit.
7. The copy SHALL not select, activate, apply, or fetch any copied preset.
8. The copy SHALL leave the source Workspace and all source records unchanged.
9. After success, the Active Workspace SHALL remain the destination captured when the flow opened.

**Acceptance criteria:** Copying two presets creates two fresh records in the current Workspace,
leaves the source intact, persists once, and changes neither the active preset nor the live view.

### CP-003 - Conflict policy

1. The preview SHALL detect semantic duplicates independently against existing presets in the Active
   Workspace and among the selected incoming presets.
2. A semantic conflict SHALL identify the source Workspace, source preset, destination Workspace,
   and matching target set before confirmation.
3. A display-name collision with different normalized targets SHALL not be treated as a semantic
   duplicate. The user SHALL be offered a deterministic name choice before confirmation, such as
   retaining the name when duplicate names are allowed or renaming the incoming preset.
4. The final confirmation SHALL require an explicit strategy whenever semantic conflicts exist:
   `Ignore conflicts` or `Overwrite conflicts`.
5. `Ignore conflicts` SHALL leave conflicting source presets unchanged and SHALL copy only entries
   without conflicts.
6. `Overwrite conflicts` SHALL replace the matching destination semantic records with the imported
   portable content while preserving the destination record id when required to keep a valid active
   preset reference.
7. No conflict strategy SHALL modify the Source Workspace.
8. A conflict-only selection SHALL make clear that no records will be copied under `Ignore
   conflicts`; confirmation SHALL not report a false success.
9. Concurrent catalog changes SHALL invalidate the plan and require a new preview rather than
   performing a best-effort partial copy.

**Acceptance criteria:** Conflicts are visible before mutation, name-only collisions are handled
explicitly, semantic duplicates require a visible decision, and cancel/invalidated plans make no
catalog changes.

### CP-004 - Cancellation, failure, and operational-state preservation

1. Cancel, Escape, and backdrop dismissal SHALL discard only the copy flow state and SHALL leave the
   source catalog, destination catalog, Active Workspace, and operational state unchanged.
2. While a plan or catalog commit is pending, duplicate submissions and competing catalog actions
   SHALL be blocked.
3. A validation or persistence failure SHALL leave both source and destination Workspaces in their
   last confirmed state and SHALL not claim success.
4. Successful or failed copying SHALL preserve current targets, namespaces, pods, filters, logs,
   selected details, loading/error state, theme, refresh state, and query state.
5. If the destination has an active preset, copying SHALL leave its active reference and dirty state
   unchanged. An overwrite SHALL preserve that reference when the existing destination record is
   retained by id.
6. Local error feedback SHALL not expose filesystem paths, kubeconfig data, credentials, headers,
   or raw response bodies.

**Acceptance criteria:** The user can cancel or recover from a failure without losing the current
view, source presets, destination presets, or active reference.

### CP-005 - Modal usability and accessibility

1. Source selection, preset selection, preview, conflict strategy, cancel, and confirm controls SHALL
   have semantic accessible names and visible focus states.
2. The flow SHALL follow existing modal layering, focus containment, focus restoration, Escape, and
   backdrop behavior.
3. Long Workspace and preset names SHALL wrap at narrow desktop widths and high zoom without
   obscuring actions or counts.
4. Pending, error, conflict, and success states SHALL be announced through the existing local/live
   feedback pattern.
5. The source list SHALL remain searchable or scannable using the existing preset library patterns
   and SHALL support keyboard selection.

**Acceptance criteria:** The complete copy flow is usable with keyboard navigation, visible focus,
screen-reader labels, cancellation, and narrow responsive layouts.

## Out of scope

- Moving presets or deleting them from the Source Workspace.
- Selecting multiple source Workspaces in one operation.
- Copying or transferring complete Workspaces.
- Automatic synchronization or linked presets between Workspaces.
- Cloud, team, account, permission, or collaboration behavior.
- Automatic application or preview execution against Kubernetes.
- Changes to preset target semantics, Workspace identity rules, or existing single-Workspace import/
  export formats.
- Backend, Electron bridge, filesystem, packaging, dependency, or release changes.

## Risks

- A stale source/destination snapshot could copy the wrong records if ids are replaced by names or
  list positions.
- Overwriting a destination semantic duplicate could invalidate the active preset reference unless
  the existing destination id is retained or the reference is reconciled atomically.
- Copying the full persisted preset object could leak local usage metadata or source Workspace
  identity into the destination.
- A copy action that shares the apply path could unexpectedly change targets or start a Kubernetes
  query; the catalog path must remain separate.

## Definition of done

- A user can choose one other Workspace, select multiple presets, review a copy plan, and copy them
  into the Active Workspace.
- Source records remain unchanged and destination records receive fresh local ids/metadata while
  preserving portable preset meaning.
- Semantic conflicts and name collisions are visible and resolved explicitly before persistence.
- Copy, cancel, failure, active-reference, accessibility, responsive, no-apply, and no-Kubernetes
  behavior are covered by focused tests and recorded validation.
- The v1.17.0 specification is complete without implying a move implementation, version bump, commit,
  tag, or release publication.
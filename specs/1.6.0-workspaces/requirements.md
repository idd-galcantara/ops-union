# Requirements - ops-union v1.6.0 workspaces

## Status and scope

This document records the implemented v1.6.0 preset Workspace feature. Automated implementation and
release checks are recorded in the task specification; environment-dependent browser and desktop
checks remain explicitly identified as limitations where they were not available.

Version 1.6.0 introduces local, named Workspaces as portable organizational containers for saved
presets. A Workspace is not the current operational session and does not own or restore the current
Kubernetes targets, pod results, filters, logs, theme, or query state. The feature extends the
existing preset library and portability behavior while preserving the existing read-only
Kubernetes boundary and `applyPresetAndLoad` behavior.

The v1 scope includes one active Workspace per local profile, current-Workspace export/import,
first-launch/default migration, workspace management, and workspace-scoped preset and quick-preset
behavior. It does not include synchronization, accounts, permissions, team collaboration, backend
storage, or export/import of all Workspaces as one document.

## Glossary

- **Workspace:** A named local collection of presets, with optional description and local identity.
  It is an organizational and portability boundary, not an operational session.
- **Active Workspace:** The one Workspace whose presets are shown by the preset library, TargetSelector
  area, and launchpad quick-preset surface.
- **Preset:** A saved named target set. Its semantic meaning remains the existing normalized set of
  `(cluster, namespace)` targets.
- **Current operational state:** Current targets, pods, filters, logs, selected details, loading or
  error state, theme, and query state. Workspace actions do not own or restore this state.
- **Outside-workspace state:** Current targets or an active operational selection that is not
  represented by a preset in the Active Workspace. This is informational and non-blocking.
- **Local profile:** One browser `localStorage` profile or one desktop Electron user-data location.
  Workspace names are unique only within this profile.
- **Portable preset:** Preset content suitable for export: name, optional description, and normalized
  targets, without local ids or usage metadata.
- **Logs workspace:** The existing dedicated logs presentation/session terminology from the log
  specifications. It is unrelated to preset Workspaces and SHALL not be used as a synonym here.

## User stories

- As an operator, I can organize presets for teams or contexts such as `Payments Team` and
  `Platform Team` without changing the targets I am currently inspecting.
- As an existing user, I can upgrade to Workspaces without losing any saved presets.
- As an operator, I can create, rename, switch, import, export, manage, and delete Workspaces from
  the existing preset area.
- As an operator, I can export the active team's preset collection as a portable JSON document that
  contains no credentials or live operational state.
- As an operator, I can preview an imported Workspace, resolve its name, and add it without
  accidentally applying a target set or changing the current view.
- As an operator, I can keep using quick presets and the existing apply flow while knowing which
  Workspace owns each preset.

## Requirements

### WS-1 - Default Workspace and migration

1. On first launch after this feature is available, WHEN no Workspace store exists THEN the
   application SHALL silently create and persist one Workspace named `My Workspace` (or the
   product's documented equivalent) without blocking the first usable view.
2. The default Workspace SHALL be created lazily through the existing local persistence path and
   SHALL be available before the preset library or quick-preset surface needs to render.
3. WHEN an older flat preset library is present and no Workspace store exists THEN the application
   SHALL migrate every valid existing preset into the default Workspace without changing its
   name, description, normalized targets, or existing stable local preset id where compatibility
   permits.
4. Migration SHALL preserve all current presets, including presets with the same semantic target
   set but different names, and SHALL not silently deduplicate or discard entries.
5. Migration SHALL preserve existing usage ordering metadata locally where the old model has it, but
   that metadata SHALL remain non-portable.
6. Migration SHALL be idempotent. A reload or interrupted initialization SHALL not duplicate
   presets or overwrite a successfully migrated collection.
7. IF the old collection is malformed or storage write fails THEN the application SHALL keep the
   safe existing error behavior, show actionable local feedback where a user action is required,
   and SHALL not claim that migration completed.

**Acceptance criteria:** A clean web and desktop profile opens with one persisted default Workspace
without a blocking modal; an old flat library reloads with the same preset count and content inside
that Workspace; a second launch produces no duplicate Workspace or presets; current targets and
operational state are not reset.

### WS-2 - Workspace identity and management

1. The UI SHALL expose one clearly identified Active Workspace in or adjacent to the existing
   TargetSelector preset area.
2. The workspace surface SHALL provide actions to create, rename, switch, import, export, manage,
   and delete Workspaces, subject to the confirmation and validation rules in this specification.
3. Creating a Workspace SHALL require a trimmed, non-empty name that is unique case-insensitively
   within the local profile. Whitespace-only names and case-only duplicates SHALL be rejected.
4. A Workspace MAY have an optional description. Empty or whitespace-only descriptions SHALL be
   stored as absent or equivalent empty metadata.
5. On successful creation, the new Workspace SHALL be empty, SHALL become Active, and SHALL leave
   current targets, pods, filters, logs, query state, and other operational view state unchanged.
6. Renaming SHALL preserve the Workspace's stable local identity, description, presets, preset ids,
   usage metadata, and active-workspace relationship. The same case-insensitive uniqueness rule
   SHALL apply.
7. Switching SHALL change only the preset catalog and quick-preset scope to the selected Workspace.
   It SHALL not apply a preset, query Kubernetes, clear or reload current targets, pods, filters,
   logs, details, or query state, and SHALL not invoke the explicit fetch path.
8. The UI SHALL identify the Active Workspace and SHALL not show a preset from another Workspace as
   active in the current library.
9. The manage surface SHALL expose enough metadata to identify each Workspace, including its name
   and preset count, and SHALL make the active item apparent.
10. The UI SHALL avoid calling a preset Workspace a `logs workspace`, `session`, or equivalent
    ambiguous term. Product-facing labels SHALL use `Workspace`, `Preset Workspace`, or a similarly
    explicit label, while the existing dedicated logs surface retains `Logs workspace`.

**Acceptance criteria:** A user can create and rename two Workspaces with distinct names, switch
between them without a target/query change, and see only the selected catalog; invalid and
case-insensitive duplicate names are rejected locally; the active Workspace is unambiguous next to
preset controls.

### WS-3 - Workspace-scoped preset behavior

1. New presets SHALL be saved in the Active Workspace.
2. Existing preset editor, save, rename, delete, import-preview, search, sort, and library actions
   SHALL operate on the Active Workspace unless explicitly identified as Workspace management.
3. Quick presets and launchpad shortcuts SHALL show only presets belonging to the Active Workspace.
4. Applying a preset SHALL continue through the existing `applyPresetAndLoad` behavior, including
   its established target update, query, loading, error, and usage metadata semantics.
5. Switching Workspaces SHALL never apply a preset or implicitly call `applyPresetAndLoad`.
6. The active preset reference SHALL be workspace-scoped. It SHALL either be null or identify a
   preset in the Active Workspace; it SHALL never resolve to a preset in another Workspace.
7. If current targets are not represented by a preset in the Active Workspace, the UI MAY show a
   non-blocking `outside workspace` or `unsaved targets` status. That status SHALL not clear,
   replace, or apply targets.
8. A semantically identical normalized target set MAY exist once or multiple times within one
   Workspace according to existing preset semantics, and the same target set MAY also exist in any
   other Workspace. Duplicate detection, if used by existing library operations, SHALL be scoped to
   one Workspace and SHALL not reject a cross-Workspace match.
9. Workspace changes SHALL not change the meaning of target normalization, preset application,
   read-only access, or the existing Kubernetes query contract.

**Acceptance criteria:** A preset created while `Payments Team` is active appears only there; the
launchpad and library change scope after switching without loading pods; applying a preset still
uses the existing apply path; an active preset from the previous Workspace is cleared or marked
outside rather than displayed as active in the new Workspace.

### WS-4 - Current Workspace export contract

1. The v1 export action SHALL export the Active Workspace only. Export/import of all Workspaces as
   one document is outside this specification and SHALL be separately scoped if added later.
2. The exported document SHALL be a versioned JSON envelope with:
   - `format: "ops-union.workspace"`;
   - `version: 1`;
   - `exportedAt`, an ISO timestamp;
   - `workspace`, containing portable `name` and optional `description`; and
   - `presets`, containing portable preset entries.
3. Each portable preset SHALL contain its name, optional description, and normalized targets. It
   SHALL exclude its local id and `lastUsedAt` or equivalent usage/order metadata.
4. Export SHALL exclude Workspace local id, created/updated local timestamps when not needed for
   portable meaning, active preset state, all other Workspaces, current targets, pods, filters,
   logs, theme, current query state, kubeconfig data, credentials, filesystem paths, and secrets.
5. Export SHALL use the existing browser download/file API boundary in web and desktop modes. It
   SHALL not add backend storage, renderer filesystem access, or a new Kubernetes route.
6. Export SHALL serialize normalized target pairs deterministically enough for readable diffs and
   repeatable validation, without changing the stored preset semantics.

**Acceptance criteria:** Exporting `Payments Team` produces only the documented envelope and that
Workspace's portable presets; inspecting the JSON finds no ids, usage timestamps, live state,
credentials, or kubeconfig data; exporting in web and desktop uses the existing persistence/file
boundary.

### WS-5 - Workspace import, validation, and preview

1. Import SHALL validate the JSON document before mutating any Workspace or preset collection.
2. The importer SHALL accept the documented `ops-union.workspace` format and supported version 1;
   malformed JSON, wrong format, unsupported version, missing workspace metadata, invalid preset
   entries, or invalid targets SHALL produce safe, human-readable validation feedback.
3. Import SHALL provide a preview containing the proposed Workspace name/description, valid and
   invalid entry counts, validation reasons, and the resulting name after collision handling.
4. By default, confirming a valid import SHALL create a new Workspace rather than merge into or
   replace the Active Workspace. Accepted presets SHALL retain portable content and receive fresh
   local ids and local usage state.
5. A name collision SHALL be handled predictably. The preferred v1 behavior is to suggest a
   deterministic suffix such as `Name (imported)` and then `Name (imported 2)` until the name is
   unique case-insensitively; the user SHALL be able to accept the suggestion or rename it before
   confirmation. The importer SHALL never silently overwrite an existing Workspace.
6. Import confirmation SHALL preserve current targets, pods, filters, logs, theme, current query
   state, and active operational view. It SHALL not auto-apply any imported preset or run a
   Kubernetes query.
7. The explicit import flow MAY activate the newly created Workspace after confirmation, but this
   choice SHALL be visible and deterministic. The default preview/confirmation behavior SHALL make
   activation explicit rather than implicit.
8. Cancel, parse failure, validation failure, or storage failure SHALL leave the existing Workspace
   collection, Active Workspace, active preset reference, and operational state unchanged.
9. An import with no valid presets SHALL not create a new Workspace unless the user explicitly
   confirms a documented empty-Workspace import; the preview SHALL explain the outcome.
10. Import SHALL not accept or restore local ids, last-used metadata, credentials, kubeconfig data,
    pods, filters, logs, theme, or query state even if extra fields are present in the input.

**Acceptance criteria:** A valid document previews before mutation, creates a separate Workspace
with fresh local ids after confirmation, handles a case-insensitive name collision through the
visible suffix/rename flow, leaves the current view unchanged, and never applies an imported
preset. Invalid and cancelled imports make no changes.

### WS-6 - Delete and reference safety

1. The application SHALL always retain at least one Workspace. Delete SHALL be disabled or rejected
   for the last remaining Workspace.
2. Deleting a Workspace with presets SHALL require explicit confirmation naming the Workspace and
   preset count. Deleting an empty Workspace MAY use the same confirmation or a lighter confirmation
   consistent with the existing modal language.
3. Deleting an inactive Workspace SHALL remove only that Workspace and its presets; it SHALL not
   change current targets, pods, filters, logs, theme, or query state.
4. Deleting the Active Workspace SHALL first select a deterministic remaining Workspace, preferably
   the nearest item in the displayed order, activate it, and show its preset catalog. It SHALL not
   apply a preset or reset operational state.
5. If the deleted Workspace owns the active preset reference, the application SHALL clear that
   reference and any dirty/editor state that depends on the deleted preset. It SHALL never leave a
   dangling reference into the deleted or another Workspace.
6. If current targets came from a deleted or now-unavailable preset, the targets SHALL remain in
   the operational view and MAY be marked outside/unsaved. Delete SHALL not clear or reload them.
7. A failed delete or cancelled confirmation SHALL leave all Workspaces, references, and current
   operational state unchanged.

**Acceptance criteria:** The last Workspace cannot be deleted; deleting a populated Workspace asks
for confirmation; deleting the active Workspace activates a remaining empty or populated Workspace
without applying it; current targets and logs remain visible; active preset references are null or
valid in the resulting Active Workspace.

### WS-7 - Persistence, migration, and platform boundary

1. Web mode SHALL persist Workspaces and the Active Workspace preference through the existing
   `localStorage` boundary for the local profile.
2. Desktop mode SHALL persist Workspaces and the Active Workspace preference through the existing
   Electron user-data persistence/IPC boundary. The renderer SHALL not read or write desktop files
   directly, and no backend persistence route SHALL be introduced.
3. The persisted model SHALL distinguish Workspace data from operational/session state. It SHALL
   include stable local Workspace identity, name, description, presets, and any existing local
   preset usage metadata needed for compatibility, plus an active Workspace preference.
4. Hydration SHALL tolerate the legacy flat preset shape, the new Workspace shape, missing optional
   metadata, and unknown non-portable fields according to the existing safe storage policy.
5. Writes SHALL be atomic at the store/adapter boundary available in each platform. A failed write
   SHALL not report success or leave an in-memory active reference that cannot be resolved.
6. Rehydration SHALL resolve a missing or deleted active Workspace preference to a deterministic
   surviving Workspace and SHALL persist the repaired preference without resetting operational state.
7. The feature SHALL add no synchronization, accounts, permissions, team collaboration backend,
   cloud storage, or cross-profile sharing behavior.

**Acceptance criteria:** Web and desktop reloads restore Workspace catalog and active preference;
legacy data migrates without loss; a missing active id resolves safely; no renderer filesystem or
backend persistence path is added; storage failures remain local and actionable.

### WS-8 - UI, accessibility, errors, and read-only boundaries

1. Workspace selector, create/rename/manage/import/export/delete controls, previews, and
   confirmations SHALL have accessible names, visible focus, logical keyboard order, and usable
   Escape/cancel behavior consistent with existing dialogs.
2. The selector and management UI SHALL remain usable at narrow widths without overlapping names,
   descriptions, counts, or actions. Long names SHALL wrap or truncate with an accessible full
   value.
3. The UI SHALL announce Workspace switching, creation, rename, import, export, delete refusal,
   validation errors, and persistence errors through existing local status/live-region patterns.
4. Workspace actions SHALL show pending/disabled states where duplicate actions could race, and
   SHALL not close or mutate a preview before the operation settles.
5. Errors SHALL not expose raw filesystem paths, kubeconfig content, credentials, response bodies,
   or response headers.
6. All Kubernetes access touched by this feature SHALL remain read-only. Workspace switching,
   management, persistence, import, and export SHALL not create mutations, watches, arbitrary
   queries, or new authorization scope.
7. The feature SHALL preserve the existing `applyPresetAndLoad` behavior and SHALL keep all current
   target/pod/log/filter state boundaries explicit in the implementation.

**Acceptance criteria:** Keyboard and screen-reader users can identify and operate Workspace
controls; narrow layouts remain legible; failure states are local and safe; no Workspace operation
causes a Kubernetes mutation or changes the established apply behavior.

### WS-9 - Focused verification and evidence boundary

1. Planned implementation SHALL include focused frontend/domain tests for creation, uniqueness,
   rename identity, switching without operational reset, workspace-scoped presets, active-reference
   safety, migration, import/export validation, collision handling, delete rules, and persistence
   adapters.
2. Planned validation SHALL cover both web localStorage and desktop user-data persistence where the
   environment supports them, without exposing secrets or using Kubernetes mutation.
3. Planned validation SHALL verify current target/pod/filter/log/query state before and after create,
   switch, import, and delete operations, and SHALL verify that only explicit preset application
   invokes `applyPresetAndLoad`.
4. Planned accessibility and responsive checks SHALL cover the selector, management surface,
   dialogs, long names, keyboard interaction, and narrow viewport layout.
5. The converged release specification SHALL record implementation evidence, test counts, build
   results, completed task checkboxes, and any environment-dependent validation limitations.

## Definition of done

- A single Active Workspace is persisted per local profile with silent first-launch initialization.
- Existing flat presets migrate into the default Workspace without loss or duplicate migration.
- Workspace create, rename, switch, manage, import, export, and delete contracts are implemented
  with the stated reference and operational-state rules.
- Presets, quick presets, and launchpad shortcuts are scoped to the Active Workspace, while preset
  application retains the existing `applyPresetAndLoad` behavior.
- Current-Workspace export uses the versioned `ops-union.workspace` envelope and excludes all local
  and operational secrets/state; all-Workspace export/import remains out of scope.
- Import previews and collision handling are explicit, additive by default, non-applying, and
  operational-state preserving.
- The last Workspace cannot be deleted, populated deletion is confirmed, and active references
  cannot point across Workspaces.
- Web and desktop persistence use their existing boundaries without backend or renderer filesystem
  access, synchronization, accounts, or collaboration.
- Focused tests, typechecks/builds, accessibility/responsive checks, and read-only boundary checks
  are completed and recorded by the named owners in the implementation work.
- Implementation and validation evidence for the release candidate is recorded in `tasks.md`.

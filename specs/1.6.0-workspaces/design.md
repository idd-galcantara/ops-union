# Design - ops-union v1.6.0 workspaces

## Release status

The v1.6.0 Workspace implementation is complete. Automated tests, typechecks, builds, and known
environment-dependent validation limitations are recorded in `tasks.md`.

## Overview

The existing flat preset library becomes a collection of local preset Workspaces. A Workspace owns
organization and portability of presets; it does not own the live operational view. The frontend
keeps one `activeWorkspaceId` in the local profile and derives the visible preset catalog from that
Workspace. Workspace actions update catalog scope and local metadata only unless the user explicitly
chooses an existing preset-application action.

The design reuses the existing preset model, normalization, library/editor surfaces, portability
boundary, and `applyPresetAndLoad` path. It adds a Workspace domain/persistence layer and a small
management surface near the TargetSelector preset area. It does not add backend APIs, Kubernetes
mutations, renderer filesystem access, synchronization, accounts, permissions, or collaboration.

The product label is `Workspace` or `Preset Workspace` in the preset area. The established
`Logs workspace` name remains reserved for the dedicated logs presentation/session surface. Code
and UI should avoid an unqualified `workspace` label in places where the two concepts can appear
together; a context label such as `Preset Workspace` is preferred near logs navigation.

## Ownership boundaries

- `frontend/src` owns the Workspace domain model, active-workspace selection, name validation,
  workspace-scoped preset selectors, management UI, import/export preview, operational-state
  preservation, and frontend tests.
- The existing preset/domain helper owns target normalization, portable preset fields, semantic
  target-set identity, and the established `applyPresetAndLoad` semantics. It must not infer
  Workspace switching as preset application.
- The existing store remains the source of truth for current targets, pods, filters, logs, query
  state, theme, loading/error state, and active preset application state. Workspace state is added
  as a separate catalog concern rather than folded into a live-session reset.
- The web persistence adapter owns serialization to the existing `localStorage` boundary.
- `desktop/src` and the existing Electron bridge/persistence adapter own serialization and IPC for
  the desktop user-data store. The renderer receives validated data and commands only; it never
  reads or writes a desktop path.
- `@ops-union-frontend` owns domain, store, UI, persistence adapter integration, migration logic
  at the frontend contract, accessibility, responsive behavior, and focused frontend tests.
- `@ops-union-backend` has no planned implementation ownership. It may perform a read-only contract
  audit only if an existing boundary unexpectedly requires backend clarification; no backend route
  or Kubernetes operation is authorized by this spec.
- `@ops-union-integration-qa` owns read-only integration, web/desktop persistence checks, migration
  evidence, security/safe-error checks, accessibility/responsive validation, and regression evidence.
- `@ops-union-architecture-review` owns a read-only audit of state ownership, persistence boundary,
  active-reference invariants, and the distinction from the logs workspace.
- Repository-maintainer work is limited to specification/release administration. It does not imply
  package versioning, source edits, commit, tag, or release publication.

## Domain model and invariants

The persisted domain is conceptually:

```ts
interface Workspace {
  id: string; // local stable identity; never portable
  name: string;
  description?: string;
  presets: Preset[];
  createdAt?: string; // local metadata only, if the existing store needs it
  updatedAt?: string; // local metadata only, if the existing store needs it
}

interface WorkspaceCatalog {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

interface ActivePresetReference {
  workspaceId: string;
  presetId: string;
}
```

The exact TypeScript names may follow the existing store, but these invariants are mandatory:

1. `workspaces.length >= 1` after successful hydration/initialization.
2. `activeWorkspaceId` resolves to exactly one Workspace after hydration and after every mutation.
3. Workspace names are trimmed and unique under case-insensitive comparison within one local
   profile. Name comparison uses the normalized display name, not the local id.
4. A Workspace id is stable across rename and local persistence, and is generated fresh for import.
5. A preset id is local to its Workspace. A preset may be moved only by an explicit future feature;
   v1.6.0 has no cross-Workspace move action.
6. `ActivePresetReference` is either absent or resolves to a preset whose `workspaceId` equals the
   active Workspace id. A stale reference is cleared during the same state reconciliation that
   changes active Workspace.
7. The current target selection has no requirement to resolve to a preset. It may be represented by
   a Workspace preset, or it may be outside/unsaved without changing target state.
8. Target-set equality is based on the existing normalized, sorted, unique target-pair semantics
   within the Workspace being inspected. The same semantic set in another Workspace is independent.
9. Workspace persistence never includes Kubernetes response data, credentials, or live view state.

The implementation may retain the existing flat `presets` selector temporarily for compatibility,
but all reads and writes after hydration must resolve through the active Workspace. No component may
maintain a second, independently mutable Workspace catalog.

## Persisted storage and migration

### Web boundary

Web mode uses the existing `localStorage` adapter/key family. The adapter should write a versioned
Workspace catalog alongside or under the established preset storage key according to the existing
migration strategy. The chosen key/version must be documented in implementation evidence, and a
failed write must not be treated as successful state transition.

### Desktop boundary

Desktop mode uses the existing Electron user-data persistence and IPC contract. The desktop adapter
may change the persisted payload shape or add the minimum compatible field needed for Workspaces,
but the renderer does not receive a filesystem path and does not use Node filesystem APIs. No
backend process or Kubernetes client participates in Workspace persistence.

### Hydration order

Hydration is non-blocking to first use. The app may render its normal shell while the existing
storage adapter resolves, but the preset surfaces must not expose an uninitialized empty catalog as
if it were authoritative. The recommended order is:

1. Read and parse the new catalog shape through the existing adapter.
2. If no catalog exists, read the old flat preset shape.
3. Create `My Workspace` (or the documented equivalent) and copy every old preset without semantic
   deduplication. Preserve ids and usage timestamps only when they are valid and compatible.
4. If neither shape exists, create an empty default Workspace.
5. Validate the active Workspace preference. If missing or invalid, choose the first stable displayed
   Workspace and persist the repaired preference.
6. Persist the migrated/initialized catalog once the adapter is ready. Do not run `loadPods`, clear
   targets, or alter live query state during this process.

Migration needs an idempotence marker or equivalent atomic write behavior. A retry after a failed
write must distinguish an uncommitted old shape from a committed catalog and must not append the old
presets a second time. Malformed records should follow the existing preset hydration policy; valid
records must not be lost merely because another record is invalid, and any skipped record must be
reported through the existing safe local error path.

### Active preference

The active Workspace preference is local-only. It may be stored inside the catalog or in a separate
existing preference record, but it must be persisted through the same platform boundary and repaired
when the referenced Workspace is absent. It is not included in export.

## Portable Workspace document

The v1 current-Workspace export is:

```json
{
  "format": "ops-union.workspace",
  "version": 1,
  "exportedAt": "2026-09-30T12:00:00.000Z",
  "workspace": {
    "name": "Payments Team",
    "description": "Payment production and staging contexts"
  },
  "presets": [
    {
      "name": "Production",
      "description": "Primary payment contexts",
      "targets": [
        { "cluster": "prod-a", "namespace": "payments" }
      ]
    }
  ]
}
```

The portable contract is intentionally narrower than the persisted model:

- required envelope fields are `format`, `version`, `exportedAt`, `workspace`, and `presets`;
- `workspace.name` is required and `workspace.description` is optional;
- each preset requires a non-empty name and at least one valid normalized target;
- target values use the existing safe `(cluster, namespace)` strings and normalization rules;
- Workspace ids, preset ids, created/updated timestamps, `lastUsedAt`, active preset references,
  current targets, pods, filters, logs, theme, query state, kubeconfig, credentials, local paths,
  and unknown operational metadata are not portable;
- unknown non-sensitive fields may be ignored only after required envelope validation; they must not
  be copied into local operational state.

Export is current-Workspace-only for v1.6.0. An all-Workspace archive would need a distinct format,
collision/partial-failure policy, and broader review, so it is explicitly deferred.

## Import flow and collision policy

Import is a non-mutating parse/validate/preview flow until confirmation:

```text
Active catalog
  -> file operation pending
  -> parse and validate
  -> import preview
  -> cancel/error: Active catalog unchanged
  -> confirm name/activation choice
  -> create fresh Workspace and fresh preset ids
  -> persist catalog
  -> remain in or activate imported Workspace according to explicit choice
```

The preview reports the source name, proposed final name, description, accepted preset count,
rejected entries/reasons, and whether the result is empty. The default action is to create a new
Workspace. Import never merges into the active Workspace and never overwrites by name.

Name collision resolution is deterministic and user-visible. Compare trimmed names case-insensitively
against all local Workspaces. First propose `Name (imported)`, then `Name (imported 2)`, and continue
with the smallest available suffix. The user can edit the proposed name before confirmation; the
same uniqueness validator runs again at confirmation to handle a concurrent local change. A collision
is therefore resolved by a visible new name, not by silent replacement.

The preview may include an explicit `Activate imported Workspace` checkbox/control. If selected,
the commit atomically creates the Workspace and changes the active Workspace preference, then clears
or reconciles the active preset reference. If not selected, the new Workspace is created in the
catalog and the current Workspace remains active. Both choices preserve operational state and do
not call `applyPresetAndLoad`.

An empty import is rejected by default because it is usually an invalid or incomplete transfer. If
the product chooses to support intentionally empty Workspaces in the preview, that must be a visible
`Create empty Workspace` confirmation and must still use the same name/collision rules.

## State transitions and operational-state rules

Workspace state and operational state are separate state machines.

### Workspace state machine

```text
unhydrated
  -> hydrating
  -> ready(default-or-migrated)

ready -> creating -> ready(active-new)
ready -> renaming -> ready(same-id)
ready -> switching -> ready(active-selected)
ready -> importing -> import-preview
import-preview -> ready(unchanged) [cancel/error]
import-preview -> ready(imported-created) [remain-current]
import-preview -> ready(imported-active) [explicit activation]
ready -> deleting -> ready(active-fallback-or-same)
```

All transitions that persist state have a failure branch back to the last confirmed catalog and
preference. UI pending states prevent duplicate create/import/delete commits. A switch to the
already-active Workspace is a no-op except for closing its selector menu.

### Operational-state invariants

- Create, rename, switch, import, and delete do not call Kubernetes, query pods, clear targets,
  clear logs, reset filters, change theme, or change current query state.
- Only the existing explicit preset application path may call `applyPresetAndLoad`; switching and
  import never call it.
- Switching updates the visible catalog and quick-preset scope. It reconciles `ActivePresetReference`
  by clearing it when it does not resolve in the new Workspace. It may show outside/unsaved status
  when current targets are not represented by a preset, but it does not modify those targets.
- Deleting the active Workspace selects a deterministic remaining Workspace before exposing the new
  catalog. It clears any reference to the deleted Workspace and does not apply the fallback
  Workspace's most recent preset.
- Deleting an inactive Workspace does not change the active reference unless it is unexpectedly
  referenced; such a dangling reference is cleared rather than redirected to a same-named preset.
- Existing `applyPresetAndLoad` may update current targets, query pods, and local usage metadata
  exactly as it does today. Its preset lookup must be resolved within the active Workspace before
  it is invoked.

## UI interaction model

### TargetSelector area

The TargetSelector preset area gains a compact `Preset Workspace` selector showing the active name,
accessible expanded/collapsed state, and a menu or adjacent manage action. The surface provides:

- a list of Workspaces with name, optional description, preset count, and active state;
- `Create Workspace`, with required name and optional description;
- `Rename Workspace`, preserving id and presets;
- `Manage Workspaces`, for the complete list and destructive actions;
- `Import Workspace` and `Export Workspace`, with the active Workspace clearly identified; and
- delete actions with the last-Workspace guard and populated-count confirmation.

The preset library/editor stays the owner of preset CRUD. Its title or compact context label should
show the active Workspace so a user does not mistake a workspace-scoped list for a global list.
Quick presets and launchpad shortcuts derive from that same active selector and do not duplicate
preset data.

Switching closes the selector/menu after the catalog commit and announces the new scope. It does
not close or mutate the current Pods or Logs presentation except for the existing preset-library
layer behavior needed to show the new catalog. If a current preset no longer exists in the active
Workspace, the UI clears its active styling and may render a small non-blocking outside/unsaved
status near the preset area.

### Dialog behavior

Create, rename, import preview, and delete confirmation use existing dialog semantics: labelled
heading, `role=dialog`, `aria-modal`, visible focus, Escape cancellation, and no mutation on backdrop
or cancel. Import preview must remain a single coherent dialog layer rather than nesting a native
file chooser or a second custom modal. File-operation pending state begins before the native chooser
opens and settles on chooser cancellation, parse failure, or successful preview.

Long names/descriptions wrap within bounded controls or expose a full accessible value. The manager
must remain usable at narrow widths; counts and actions cannot overlap. Error and pending status are
local and announced through the existing live-region pattern.

## Existing preset semantics and read-only safety

Workspace boundaries do not change target normalization, target equality, preset naming semantics,
or application semantics. Within a Workspace, the existing behavior for duplicate target sets,
last-used ordering, editing, deletion, and applying remains authoritative. Cross-Workspace matching
is not a duplicate for import or local library operations unless a future feature explicitly says so.

The only route to a Kubernetes query remains the established explicit target fetch or
`applyPresetAndLoad` path. Workspace creation, rename, switch, import, export, and delete are local
catalog operations. No action is permitted to mutate Kubernetes resources, add watches, expand query
scope, persist kubeconfig/credentials, or expose raw backend errors.

## Error handling and recovery

- Invalid names show field-level feedback and retain entered form values.
- Duplicate names show the conflicting normalized name and keep the form open.
- Import errors identify malformed JSON, unsupported format/version, missing required fields,
  invalid preset/target entries, and no-importable-entry results without mutating the catalog.
- Storage errors keep the last confirmed catalog and active preference, surface a local retry/error
  state, and do not claim that the action completed.
- A missing active Workspace or active preset on hydration is repaired deterministically and does
  not reset operational state.
- Delete-last is a stable disabled/rejected state with an explanatory accessible message.
- Errors never show kubeconfig fields, credentials, local filesystem paths, raw response bodies, or
  response headers.

## Validation strategy

### Frontend/domain checks

- Test name trimming, case-insensitive uniqueness, descriptions, stable rename identity, deterministic
  fallback selection, active-reference reconciliation, scoped semantic target equality, and
  workspace-only selectors.
- Test creation, switch, rename, import, export, delete, and failure transitions while asserting
  current targets, pods, filters, logs, theme, and query state remain unchanged.
- Test that only explicit preset application invokes `applyPresetAndLoad`; switching and import do
  not call it or query Kubernetes.
- Test migration from an old flat collection, including duplicate semantic target sets, usage order,
  malformed records, reload/idempotence, missing active preference, and persistence failure.
- Test the exact v1 portable envelope, omitted local/operational fields, invalid documents, mixed
  entries, collision suffixes, fresh local ids, preview cancellation, and explicit activation.

### Web and desktop persistence checks

- Use the existing frontend tests/mocks for web `localStorage` hydration, write failure, reload,
  migration, and active preference repair.
- Exercise the desktop adapter/IPC contract with user-data fixtures, verifying renderer isolation,
  validated payloads, write failure behavior, and no path exposure.
- No check may use or reveal kubeconfig data, credentials, or a renderer filesystem API.

### UI, accessibility, and read-only checks

- Exercise selector/menu, manager, create/rename forms, import preview, export feedback, and delete
  confirmation with keyboard navigation, focus, Escape/cancel, accessible names, live status, and
  long names at narrow viewport sizes.
- Verify quick presets and launchpad scope after each Workspace switch and reload.
- Run the repository's focused frontend tests, typecheck, production build, touched-file diagnostics,
  and diff check after implementation; execute read-only integration scenarios where available.
- Record unavailable desktop/browser/environment checks as limitations. Completed task status is
  based on the implementation evidence and validation record in `tasks.md`.

## Definition of done

- The domain and UI enforce the active-Workspace and active-preset reference invariants.
- First-launch/default initialization and flat-library migration are silent, persistent, idempotent,
  and lossless for valid presets.
- Workspace management and current-Workspace portability follow the requirements and preserve live
  operational state.
- Web and desktop persistence use existing boundaries, with no backend or renderer filesystem access.
- The logs workspace remains a distinct concept and terminology is unambiguous.
- Focused automated, persistence, accessibility, responsive, read-only, typecheck, and build evidence
  is recorded by the named owners after implementation.
- Implementation and validation records are maintained in `tasks.md` for this release candidate.

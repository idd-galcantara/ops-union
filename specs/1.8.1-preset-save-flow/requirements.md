# Requirements - ops-union v1.8.1 preset save flow correction

## Status and scope

Version 1.8.1 records the already implemented frontend correction for creating a new preset from
an existing preset flow. The release makes the modal transition explicit, prevents duplicate names
before submission, retains a store-level duplicate guard, and applies the newly created preset so
the main screen is queried for it.

The scope is limited to the existing frontend preset-library/editor flow and the existing store
catalog/query boundary. It SHALL NOT add or change a backend route, REST or WebSocket contract,
Kubernetes operation, dependency, package version, persistence format, IPC contract, or release
artifact. No source implementation is authorized by this specification; it documents the completed
work and its evidence.

## User stories

- As an operator, when I choose Save as new, the preset listing closes before the create editor
  opens, so the editor has one clear modal context.
- As an operator, I receive an actionable duplicate-name alert while creating a preset, and the
  Create action stays disabled until the name is unique.
- As an operator, I can use different casing or surrounding whitespace without accidentally
  creating a name collision; comparison trims both names and ignores case.
- As an operator, after a successful creation, the create modal closes, the new preset becomes
  active, and the main screen queries using that preset.
- As a maintainer, duplicate protection remains enforced by the store even if a caller bypasses
  the modal's validation.

## Glossary

- **Preset listing:** The existing preset-library surface that lists records and exposes catalog
  actions.
- **Create modal:** The existing preset editor modal opened by Save as new for a new record.
- **Normalized name:** A preset name after trimming surrounding whitespace and applying
  case-insensitive comparison.
- **Main screen query:** The existing target/pod query path used after applying a preset; this is
  not a new API or Kubernetes capability.

## Requirements

### PSF-1 - Save as new modal transition

1. WHEN the operator activates Save as new, the preset listing SHALL close before the create modal
   opens.
2. The create modal SHALL use the existing preset-editor contract and SHALL represent a new record
   without silently changing the source preset in place.
3. The transition SHALL preserve the existing modal focus, dismissal, accessibility, and pending
   action conventions.
4. Opening the create modal SHALL not apply a preset, query the main screen, or perform a
   Kubernetes operation.

**Acceptance criteria:** The listing is no longer visible when the create modal is shown; the create
editor has one modal context; canceling it leaves the catalog and operational state unchanged.

### PSF-2 - Create-modal duplicate validation

1. The create modal SHALL compare the entered name with existing preset names using a trimmed,
   case-insensitive comparison.
2. A name SHALL be considered a duplicate when its trimmed, case-insensitive value matches an
   existing preset name's normalized value.
3. When the name is a duplicate, the modal SHALL show an actionable alert that identifies the
   correction needed, and the Create action SHALL be disabled.
4. Empty or whitespace-only names SHALL remain invalid according to the existing editor validation
   contract.
5. Changing the name to a valid unique value SHALL remove the duplicate alert and re-enable Create
   when all other existing validation conditions are satisfied.
6. Validation feedback SHALL not serialize into preset data or change the read-only Kubernetes
   boundary.

**Acceptance criteria:** Names such as ` Demo ` and `demo` cannot create two records; the alert
explains that the name must be unique; Create cannot submit while the duplicate remains.

### PSF-3 - Store defense in depth

1. The store create action SHALL repeat the normalized duplicate-name check before mutating the
   catalog or persisting the new record.
2. A store-level duplicate rejection SHALL preserve the existing catalog, active preset, targets,
   query state, and operational state.
3. The store guard SHALL use the same trim and case-insensitive semantics as the create modal.
4. The defense-in-depth check SHALL not require a new API, backend validation route, dependency, or
   persistence-format change.

**Acceptance criteria:** A direct or stale caller that reaches the store with a duplicate name is
rejected without a new catalog record or query, even if modal validation was bypassed.

### PSF-4 - Successful creation applies and queries the new preset

1. On successful creation, the create modal SHALL close.
2. The newly created preset SHALL become the active/applied preset through the existing store flow.
3. The main screen SHALL be queried using the newly created preset's targets and values.
4. The source preset, if any, SHALL remain unchanged as a distinct catalog record.
5. Failed, rejected, or cancelled creation SHALL not apply the draft, close as a success, or issue
   a query for the rejected record.

**Acceptance criteria:** A successful Save as new leaves the listing/main screen visible, identifies
the new preset as active, and produces the existing main-screen query for that preset; no duplicate
record is created and no second API contract is introduced.

### PSF-5 - Ownership and platform boundaries

1. `@ops-union-frontend` SHALL own modal composition, name validation, modal sequencing, store
   action integration, active-preset application, and focused frontend tests.
2. `@ops-union-architecture-review` SHALL own read-only review of the store/catalog boundary,
   duplicate invariants, query transition, and public contracts.
3. `@ops-union-integration-qa` SHALL own available browser/desktop smoke, keyboard/accessibility,
   responsive, and read-only boundary validation.
4. The existing frontend store SHALL remain the catalog and operational transition owner; the
   modal SHALL not create a second store or directly mutate unrelated query state.
5. No backend, REST, WebSocket, Kubernetes, dependency, package, persistence-format, IPC, or
   credential boundary SHALL change in this release.

**Acceptance criteria:** Review identifies one owner for modal state, catalog mutation, duplicate
protection, and applying/querying the new preset, with no new transport or privilege boundary.

## Out of scope

- Backend routes, REST/WebSocket changes, Kubernetes writes, cluster mutation, or credential access.
- New dependencies, package versions, IPC channels, persistence schemas, or release artifacts.
- Changes to preset import/export formats, unrelated Workspace behavior, or large-file
  modularization.
- Git commits, tags, pushes, or packaging operations.

## Definition of done

- Save as new closes the preset listing before opening the create modal.
- The create modal rejects trimmed case-insensitive duplicate names with an actionable alert and a
  disabled Create action.
- The store independently rejects duplicate names using the same normalization.
- Successful creation closes the modal, applies/loads the new preset, and queries the main screen
  for it.
- Automated frontend validation and clean diagnostics are recorded in `tasks.md`; unavailable
  browser smoke and residual risk are explicit.
- No backend/API/WebSocket/Kubernetes mutation/dependency/persistence-format change is included.

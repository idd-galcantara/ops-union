# Design - ops-union v1.8.1 preset save flow correction

## Release intent

This release documents a focused correction at the existing frontend preset-library boundary. Save
as new becomes a clear two-modal transition, duplicate names are rejected consistently at the UI and
store boundaries, and a successful creation follows the existing apply/query path for the new
record.

The design preserves the current frontend store, catalog persistence, target/query behavior, and
read-only Kubernetes architecture. It introduces no backend or transport contract.

## Ownership and collaboration

- `@ops-union-frontend` owns the preset listing and create-modal transition, normalized name
  validation, actionable alert state, Create disabled state, store integration, successful apply/
  load behavior, and frontend tests.
- `@ops-union-architecture-review` owns read-only review of modal ownership, catalog invariants,
  store defense in depth, query sequencing, and unchanged public/platform boundaries.
- `@ops-union-integration-qa` owns available browser/desktop smoke, keyboard and accessibility
  checks, responsive/theme checks, and confirmation that no Kubernetes or transport boundary changed.
- `repository maintainer` owns specification convergence and release documentation only. No package,
  tag, commit, push, or release artifact is authorized here.

No owner may infer implementation or release evidence from this design alone. The validation record
in `tasks.md` is the source for what has actually passed.

## Existing boundaries to preserve

| Concern | Owner | Contract to preserve |
| --- | --- | --- |
| Preset listing and create modal | Existing frontend Preset/Workspace flow | Existing modal ids, fields, focus, dismissal, alerts, and button semantics |
| Catalog mutation | Existing frontend store/catalog action | Existing record shape, persistence boundary, active references, and failure behavior |
| Duplicate protection | Create-modal validation plus store action guard | Trimmed, case-insensitive name identity at both boundaries |
| Apply and query | Existing store application/query transition | New preset becomes active and the main screen uses its existing query path |
| Kubernetes access | Existing read-only query path | No writes, new endpoint, direct component client access, or credential exposure |

## State transitions

The Save as new flow is ordered as follows:

```text
preset listing open
  -> Save as new activated
  -> listing closed
  -> create modal open with draft
  -> draft name edited
       -> normalized duplicate check
       -> duplicate: actionable alert + Create disabled
       -> unique and otherwise valid: Create enabled
  -> Create submitted
       -> store repeats normalized duplicate check
       -> rejected: preserve catalog/state and show existing actionable failure
       -> accepted: create record
  -> create modal closed
  -> new preset applied/loaded
  -> existing main-screen query runs for the new preset
```

The listing and create modal are not simultaneously authoritative for the same editing operation.
Closing the listing first prevents the create editor from appearing as a nested or ambiguous catalog
surface. Opening the create modal does not apply a draft or issue a query.

## Name normalization and duplicate contract

The shared behavioral rule is equivalent to:

```ts
normalizeName(name) = name.trim().toLocaleLowerCase()
```

The exact implementation may follow existing repository conventions, but both UI and store checks
must compare the normalized candidate with normalized existing names. The modal derives a duplicate
state from the current draft and catalog. A duplicate state renders an actionable alert and disables
Create. The store repeats the check immediately before catalog mutation so stale modal state or a
direct caller cannot bypass the invariant.

Duplicate rejection is local and deterministic. It does not call a backend endpoint, query
Kubernetes, alter persistence format, or expose raw catalog or credential data. Rejection preserves
the last confirmed catalog and operational state.

## Successful creation and query ownership

The existing store create/apply boundary remains responsible for committing the new record and
making it active. The modal is responsible for closing after the accepted result; it does not
manually reconstruct target or query state. The existing application/store path then loads/applies
the new preset and queries the main screen once using the new preset's values.

The source preset remains a separate record. A failed store commit, duplicate rejection, cancellation,
or validation failure does not close as a successful creation, activate the draft, or query for it.
The implementation does not add a second request path or a direct Kubernetes client call.

## UI and accessibility behavior

The existing dialog owner remains responsible for the accessible title and description, initial
focus, focus restoration, Escape and supported dismissal behavior, visible focus styling, and
status/alert semantics. The duplicate alert is actionable: it explains that the name is already in
use and tells the operator to choose a unique name. Name edits update the alert and Create disabled
state without changing modal identity or moving focus to an unrelated control.

The command area remains stable while the alert is shown. Text wraps inside the existing modal
geometry at supported narrow widths, with no overlap or hidden focus indicator. Light/dark theme,
keyboard operation, and reduced-motion behavior remain governed by the existing design system.

## Error and rollback behavior

- Duplicate or invalid names are rejected locally, and the draft remains available for correction.
- A store-level duplicate rejection leaves catalog, active preset, targets, query state, and
  operational state unchanged.
- A persistence or apply failure uses the existing safe error path and does not report successful
  creation or issue a new-preset query.
- Cancel, Escape, or supported dismissal discards only the create-flow draft and transient
  feedback; it does not mutate the confirmed catalog or operational state.
- No error or test evidence includes kubeconfig contents, credentials, tokens, raw response bodies,
  or arbitrary filesystem paths.

## Validation strategy

`@ops-union-frontend` validates the modal transition, normalized duplicate cases, disabled Create
state, store bypass protection, successful close/apply/query behavior, and failure/cancel invariants
with focused and full frontend tests plus typecheck/build. `@ops-union-architecture-review` checks
ownership and unchanged platform boundaries. `@ops-union-integration-qa` records browser/desktop
and accessibility smoke when available; unavailable checks remain explicitly unavailable with
residual risk.

The recorded worktree evidence is in `tasks.md`: focused frontend tests passed (139), the full
frontend suite passed (139), frontend typecheck and build passed, diagnostics are clean, and
`git diff --check` passed.

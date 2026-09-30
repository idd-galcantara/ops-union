# Requirements - ops-union v1.8.0 Workspace and preset flow corrections

## Status and scope

This is the v1.8.0 release specification for four frontend corrections in the Presets and
Workspaces flow. It standardizes the Save as new interaction, preserves editing state in the
Workspace import modal, clears stale operational pod state after selecting an imported Workspace,
and removes transient import feedback when the modal flow ends.

The scope is limited to existing frontend/store behavior and existing local Workspace/preset
catalog persistence. It SHALL preserve the read-only Kubernetes boundary and SHALL NOT add a
backend route, API, WebSocket contract, Kubernetes operation, persistence format, dependency,
package version, release artifact, or unrelated refactor.

Implementation and validation evidence SHALL be recorded in `tasks.md`. This specification does not
authorize source implementation during spec authoring.

## User stories

- As an operator, I can save the current preset as a new record from a stable, coherent control
  area without the modal changing layout or moving commands unexpectedly.
- As an operator, I can type the final Workspace name during import without losing focus or losing
  the value already entered.
- As an operator, when I import and select a Workspace without an active preset, I see only the
  operational state that belongs to that Workspace and not pods from the previous query.
- As an operator, after completing or closing Workspace import, I do not see stale success feedback
  left behind by the modal flow.
- As a keyboard and assistive-technology user, I can complete, cancel, and recover from these flows
  with predictable focus, labels, status announcements, and no focus trap regressions.

## Glossary

- **Save as new:** An explicit preset-catalog action that creates a new preset from the current
  editable preset values without changing the existing record in place.
- **Import modal:** The existing modal used to choose/import Workspace data and edit the final local
  Workspace name before selection.
- **Final Workspace name:** The controlled value that becomes the local name of the imported
  Workspace after validation and confirmation.
- **Operational state:** Runtime target/query state such as selected targets, loading/error state,
  pod results, selected pod/details, filters, and query revisions. It is not Workspace catalog
  metadata.
- **Transient feedback:** Modal-local or flow-local success/error/pending messaging that is valid
  only for the current import operation.

## Requirements

### WPF-1 - Stable Save as new flow and command placement

1. The Save as new action SHALL use the same modal shell, title/heading hierarchy, field layout,
   button geometry, spacing, and focus behavior as the existing preset save/edit flow unless a
   difference is required by the action semantics.
2. Save as new SHALL be presented in a coherent preset-library command area owned by the preset
   flow. It SHALL NOT be rendered in the row directly below the preset search field or otherwise
   appear to be a search control.
3. The command placement SHALL remain stable when the modal opens, when validation feedback appears,
   when the name changes, and at supported narrow desktop widths. Feedback SHALL not cause the
   command row or modal controls to jump.
4. Save as new SHALL preserve its existing catalog semantics: it creates a distinct preset record,
   does not overwrite the source record, does not apply the new preset, and does not load pods.
5. Opening, cancelling, or failing Save as new SHALL leave the existing preset catalog and
   operational state unchanged, except for the flow-local draft and feedback state.

**Acceptance criteria:** A user can open Save as new from the preset command area, sees the same
modal structure before and after editing, and can complete or cancel it without a layout shift,
search-row ambiguity, overwrite, apply, query, or Kubernetes operation.

### WPF-2 - Stable import-name editing and focus

1. The final Workspace name SHALL be a controlled input with one authoritative value for the open
   import flow.
2. Typing, deleting, selecting, or replacing any character SHALL preserve the current value and
   keep the input mounted with focus unless the user explicitly moves focus, submits, cancels, or
   the flow reports a blocking validation error according to the existing modal convention.
3. State updates caused by name editing SHALL not recreate the modal or replace the input node in a
   way that loses focus or selection.
4. Validation SHALL use the current final Workspace name at submit time, including edits made
   immediately before confirmation. A failed validation SHALL retain the user's value and return
   focus to the relevant field when the existing dialog pattern requires it.
5. The input SHALL expose an accessible label, associated validation message, visible focus style,
   and an appropriate input name/autocomplete behavior without exposing imported secrets or raw
   payloads.

**Acceptance criteria:** A keyboard user can type a complete final Workspace name continuously,
observe every character in order, correct it in place, and submit the exact current value without
focus loss or modal remount between keystrokes.

### WPF-3 - Operational reset after imported Workspace selection

1. After a Workspace is imported and selected, the selection transition SHALL reconcile operational
   state against the newly selected Workspace before the new view is considered settled.
2. If the selected Workspace has no active preset, the transition SHALL clear the prior query's pod
   results and stale operational selections, including selected pod/details and any dependent
   derived data, according to the existing reset contract.
3. The transition SHALL also invalidate or advance the existing query/configuration revision guard
   so an in-flight response from the previous Workspace cannot repopulate pods after the new
   Workspace is selected.
4. Selecting an imported Workspace without an active preset SHALL not implicitly apply a preset,
   reconstruct prior targets, call an additional Kubernetes operation, or query pods merely to
   clear state.
5. If the imported Workspace has an active preset, the existing active-preset selection/application
   semantics SHALL be preserved. Any operational reset or load SHALL follow that existing explicit
   contract and SHALL not be broadened by this requirement.
6. Import failure, cancel, stale selection, and invalid catalog data SHALL leave the last confirmed
   Workspace and operational state unchanged, apart from flow-local feedback cleanup.

**Acceptance criteria:** With pods visible from Workspace A, importing/selecting Workspace B with no
active preset leaves no pods from A, no stale selected pod/details, and no stale in-flight response
can restore them; no implicit apply or extra pod query occurs.

### WPF-4 - Transient import feedback lifecycle

1. Success, error, and pending feedback for import SHALL be owned by the current import flow and
   SHALL not become persistent Workspace or preset metadata.
2. On successful import and selection, the transient success message SHALL be cleared when the import
   modal closes or the flow reaches its existing settled completion boundary; it SHALL not remain on
   the underlying Workspace/preset screen.
3. Closing the import modal by its existing close, cancel, Escape, or backdrop behavior SHALL clear
   import-local transient feedback and pending presentation while preserving the last confirmed
   catalog and operational state.
4. Reopening the import modal SHALL start without stale success feedback from a previous completed
   flow. A new operation may display fresh pending/error/success feedback only for that operation.
5. Clearing feedback SHALL not hide an actionable validation or persistence error before the user can
   correct it, and SHALL not report success for an operation that failed or was cancelled.

**Acceptance criteria:** After import/select/close, `Workspace imported and selected.` is absent from
both the closed-modal view and the next newly opened import flow; cancellation and failure preserve
correct state and do not display false success.

### WPF-5 - Shared modal, accessibility, and regression contract

1. Save as new and import SHALL retain the product's existing modal semantics: accessible title and
   description, predictable initial focus, focus containment, focus restoration on close, Escape and
   supported dismissal behavior, and visible focus indicators.
2. Focus SHALL not move to an unrelated control during typing or after a non-blocking state update.
   When a validation error is presented, focus and status announcement SHALL follow the existing
   dialog convention and identify the field or action that needs attention.
3. Controls, labels, status messages, and error messages SHALL remain usable with keyboard input,
   screen-reader semantics, narrow desktop widths, zoom, light theme, and dark theme. Text SHALL
   wrap without overlapping commands or fields.
4. Regression coverage SHALL include successful, cancelled, failed, repeated, and reopened flows;
   empty/non-empty names; import with and without an active preset; populated prior pods; stale
   in-flight query responses; and Save as new layout stability.
5. Tests SHALL verify catalog, active-preset, target, pod, selected-detail, filter, loading/error,
   query-revision, focus, and transient-feedback invariants at the relevant boundaries.

**Acceptance criteria:** Focused automated tests and available web/desktop checks demonstrate stable
layout and focus, correct reset and stale-response behavior, correct feedback lifetime, accessible
modal controls, and no regression of existing catalog or read-only behavior.

### WPF-6 - Ownership and platform boundaries

1. Preset and Workspace modal presentation SHALL remain owned by the frontend Preset/Workspace flow;
   catalog changes SHALL use the existing store and persistence boundary.
2. Operational reset and stale-response invalidation SHALL remain owned by the existing store/query
   transition boundary. Components SHALL not create a second operational state store or directly
   mutate unrelated query state.
3. Transient modal feedback SHALL remain local to the flow or existing UI state and SHALL not be
   serialized into Workspace/preset records or sent through a new API.
4. The changes SHALL preserve read-only Kubernetes behavior: no Kubernetes mutation, no new backend
   endpoint, no new WebSocket/REST contract, and no direct renderer filesystem or credential access.
5. This release SHALL not change package versions, release configuration, persistence schema, public
   API contracts, or unrelated large-file modularization work.

**Acceptance criteria:** Architecture review identifies one owner for each state transition, finds
no new transport or privilege boundary, and confirms the existing catalog/persistence and read-only
Kubernetes boundaries remain authoritative.

## Out of scope

- New preset or Workspace capabilities, import/export format changes, cloud synchronization, sharing,
  accounts, permissions, or cross-profile behavior.
- Changes to active-preset application semantics beyond clearing stale state when the selected
  imported Workspace has no active preset.
- Backend routes, WebSocket or REST changes, Kubernetes writes, credential handling, or cluster
  mutation.
- General modal redesign, unrelated visual cleanup, large-file modularization, dependency changes,
  package version changes, release packaging, commit, tag, or release administration.

## Risks

- Recreating a modal or controlled input on every keystroke can still lose DOM focus or selection.
- Import selection can clear visible pods but fail to invalidate an in-flight response, allowing
  stale data to return asynchronously.
- Clearing feedback too early can hide a real persistence error or make a failed import look
  successful.
- Moving Save as new without reusing the established modal owner can create divergent accessibility,
  focus, or catalog semantics.

## Definition of done

- Save as new uses the established modal contract and a stable preset command area outside the row
  below search, with no catalog/apply/query regression.
- Final Workspace name editing preserves one current value and input focus through character edits,
  validation, and accessible recovery.
- Selecting an imported Workspace without an active preset clears prior pods and dependent
  operational state and invalidates stale query responses without implicit apply/query behavior.
- Import feedback is transient, is cleared at close/settled completion, and never survives into a
  fresh modal flow or falsely reports success.
- Focused tests, typechecks/builds, accessibility/regression scenarios, and platform-boundary
  evidence are recorded in `tasks.md`; unavailable checks are explicitly marked unavailable.
- No backend/Kubernetes/API/source implementation, package version, release artifact, commit, or tag
  is part of this specification-authoring task.

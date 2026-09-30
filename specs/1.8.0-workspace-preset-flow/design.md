# Design - ops-union v1.8.0 Workspace and preset flow corrections

## Release intent

This specification makes four narrow corrections at the existing frontend Presets/Workspaces
boundary. The design preserves the current catalog and read-only operational architecture while
making modal identity, operational reset, and transient feedback ownership explicit.

No backend, REST, WebSocket, Kubernetes, persistence-schema, or package change is required. The
existing store, Workspace catalog persistence, modal conventions, and query revision guards remain
the authoritative contracts.

## Ownership and collaboration

- `@ops-union-frontend` owns the preset/Workspace modal composition, Save as new placement, import
  draft input, flow-local feedback, store transition integration, focus behavior, and frontend tests.
- `@ops-union-architecture-review` owns a read-only review of ownership, state transitions, public
  contracts, stale-response invalidation, and the no-new-API/no-Kubernetes boundary.
- `@ops-union-integration-qa` owns available web/desktop smoke, keyboard/screen-reader-oriented
  scenarios, responsive/theme checks, regression scenarios, and read-only validation.
- `@ops-union-backend` has no implementation task. A read-only dependency check is allowed only if
  review finds an unexpected backend boundary; no backend change is authorized.
- `repository maintainer` owns specification convergence and release administration only after
  implementation and validation evidence exists.

No owner may mark implementation or validation complete from this design alone. No task authorizes
Kubernetes mutation, kubeconfig inspection, secret collection, source implementation during this
spec-authoring change, package versioning, commit, or release.

## Existing boundaries to preserve

| Concern | Owner | Contract to preserve |
| --- | --- | --- |
| Preset command/library and modal | Existing frontend Preset/Workspace flow | Current ids, draft fields, catalog actions, dialog semantics, focus restoration |
| Workspace import catalog | Existing Workspace store/catalog boundary | Existing import validation, local persistence, selection, and active-preset metadata |
| Operational query state | Existing Zustand/query transition boundary | Target/query revisions, pod results, selected details, filters, loading/errors, stale guards |
| Modal feedback | Current flow-local UI state or established feedback owner | Pending/error/success lifetime and safe presentation, without catalog serialization |
| Kubernetes access | Existing read-only query path | No writes, no new endpoint, no direct component client access |

The implementation should first locate the existing Save as new command, import modal component, store
import/select action, pod reset helper, and feedback close handler. It should adapt those owners
rather than introduce parallel state or a second modal implementation.

## Save as new composition and layout contract

Save as new is a catalog command, not a search action. The preset-library owner should render it in
the existing preset action/toolbar area with the other catalog commands. The row directly below the
search input remains reserved for search-related content and status; Save as new is not placed there.

The modal uses the existing save/edit shell and field components. Its stable structure is:

```text
preset library action area
  -> Save as new command
  -> existing save/edit modal shell
       -> accessible title/description
       -> preset draft fields
       -> validation/status region
       -> stable action row
```

The exact component names may follow repository conventions. The shell must not switch branches or
change geometry merely because the action is Save as new. Draft and validation updates may rerender
contents, but the modal container, command row, field order, and action placement remain stable. A
pending operation disables duplicate submission using the existing convention and does not move focus
to an unrelated element.

Save as new creates a new catalog record through the existing store action. It must not call preset
application, `loadPods`, or a Kubernetes client. Cancel and validation failure retain the existing
catalog and operational state.

## Import modal state model

The import flow owns an ephemeral state object equivalent to:

```ts
type ImportFlowState = {
  open: boolean;
  finalName: string;
  status: 'idle' | 'pending' | 'success' | 'error';
  message?: string;
};
```

The exact type may differ. The important invariants are:

1. There is one authoritative `finalName` for the mounted modal.
2. The input remains mounted while `finalName` changes.
3. `onChange` updates only the draft and does not reopen/reset the flow.
4. Submit reads the latest draft value, validates it, and preserves it on failure.
5. Success and error messages are associated with the current flow instance.
6. Close and settled completion clear flow-local feedback before the next open.

The input receives a stable key or no key that changes with the draft. The modal must not use a
state update that replaces the input node on each character. If the current component has separate
import-selection and name-editing branches, the final-name input remains in the same mounted modal
identity while editing; branch changes must be driven by explicit flow transitions, not by each
keystroke.

The dialog exposes a semantic label and error/status relationship. On a validation error, the value
remains available for correction and focus returns to the input when that matches the existing dialog
pattern. On success, the existing completion transition can select the imported Workspace, but the
success message is cleared as soon as the modal closes or the settled completion boundary is reached.

## Imported Workspace selection and operational reconciliation

Importing catalog data and selecting the resulting Workspace are catalog operations. Selecting a
Workspace without an active preset is also an explicit operational transition. The existing store
transition owner should perform the following ordered reconciliation:

```text
import/validate catalog
  -> commit imported Workspace
  -> select imported Workspace id
  -> detect active preset
  -> no active preset:
       invalidate prior query/configuration revision
       clear targets/query-derived state as defined by current reset contract
       clear pods and selected pod/details
       clear dependent loading/errors/filter state as defined by current contract
  -> settle UI and clear import feedback
```

The exact reset list must be aligned with existing store invariants rather than guessed in a
component. At minimum, prior pod results, selected pod/details, and the stale-response guard are
cleared/advanced when the selected Workspace has no active preset. A response belonging to the
previous Workspace must fail the existing request identity/revision check and cannot repopulate the
new view.

No-active-preset selection does not apply a preset and does not call `loadPods` merely to produce an
empty view. If existing behavior explicitly loads an active preset, that path remains unchanged and
is covered separately. Import failure, cancel, or invalidation must not commit a new selection or
clear the last confirmed operational state.

The component may request the store transition, but it must not manually clear pods in parallel or
maintain a second copy of query state. One store action or transition coordinator owns the ordering.

## Feedback lifecycle

Import feedback is a flow-local status, not Workspace data. The lifecycle is:

```text
closed/clean
  -> open/idle
  -> pending
  -> success or error
  -> close or settled completion
  -> closed/clean
```

`success` may be rendered while the modal is still open if that is the established UX, but it must
not survive into the underlying screen after close. Close, cancel, Escape, and supported backdrop
dismissal all clear pending presentation and stale messages. A persistence or validation error stays
visible until the user can act on it or the flow is explicitly dismissed; dismissal clears it without
claiming success.

Reopening creates a clean flow state. A new operation may produce a new message, but no previous
message is copied from the closed instance. Feedback is not persisted, exported, added to preset
metadata, or sent over a new transport.

## Accessibility, responsive behavior, and regression model

The existing dialog owner remains responsible for title/description association, initial focus,
focus containment, restoration on close, Escape handling, visible `:focus-visible` styles, and live
status/error semantics. The import final-name input is the focus target while typing; non-blocking
rerenders must not move focus. Save as new controls use semantic button names and remain reachable
from the preset command area.

Long Workspace/preset names and validation messages wrap within the existing modal width at supported
narrow desktop widths and high zoom. Light and dark theme contrast and focus indicators remain
unchanged. Reduced-motion behavior remains governed by the existing design system.

Regression tests should assert both state and DOM behavior:

- Save as new modal structure and command placement remain stable across draft/validation updates.
- Import input value and `document.activeElement` remain correct after each character update.
- Imported no-active-preset selection clears prior pods/details and rejects stale query responses.
- Success feedback is absent after close and on the next open; errors are not converted to success.
- Cancel, Escape, backdrop, failure, repeated open, and pending duplicate-submit behavior preserve
  catalog and operational invariants.

## Error and rollback behavior

Catalog validation or persistence failure retains the last confirmed catalog and Workspace selection.
The import draft may remain for correction while the modal is open. Closing the flow discards only
its draft and transient feedback. A stale import or selection event must not clear state belonging to
a newer confirmed Workspace.

The implementation must use existing safe error mapping. It must not expose filesystem paths,
kubeconfig contents, credentials, tokens, headers, raw response bodies, or imported secret data in
feedback or test evidence.

## Validation strategy

`@ops-union-frontend` should run focused store/component tests first, including DOM focus and
active-element assertions where the frontend test setup supports them, then frontend typecheck/build
and the relevant full regression suite. `@ops-union-integration-qa` should exercise available web
or desktop flows at supported desktop/narrow widths, both themes, keyboard navigation, dismissal,
reopen, populated prior pods, no-active-preset selection, and stale-response timing.

`@ops-union-architecture-review` should inspect the final ownership graph for duplicate modal state,
duplicate operational state, changed public contracts, new transport/privilege boundaries, and
read-only Kubernetes compliance. Backend checks are not required unless an unexpected dependency is
introduced. Unavailable browser, desktop, or cluster checks must be recorded as unavailable with
residual risk; no proposed command is evidence of completion.

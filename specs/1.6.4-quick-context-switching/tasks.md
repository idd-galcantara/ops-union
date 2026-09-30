# Implementation Tasks - ops-union v1.6.4 quick Workspace, preset, and application filtering

These tasks describe implementation and validation work. Checked implementation items below are
limited to behavior supported by the current source/tests; browser, Electron, responsive, and
architecture validation remain unchecked where no session evidence exists.

## Ownership and sequencing

- `@ops-union-frontend` owns top-bar controls, popovers, state routing, pending-edit confirmation,
  frontend tests, and responsive/accessibility behavior.
- `@ops-union-integration-qa` owns web/desktop interaction validation, keyboard/focus checks,
  responsive/theme checks, loading/failure scenarios, and read-only boundary validation.
- `@ops-union-architecture-review` owns a read-only audit of state ownership, Workspace/preset
  separation, shared recent ordering, and absence of backend/Kubernetes scope creep.
- `@ops-union-backend` has no implementation task. A read-only boundary check is allowed only if
  review identifies an unexpected backend dependency; no backend change is authorized.
- `repository maintainer` owns later documentation convergence and release administration only. It
  must not mark implementation tasks complete without repository evidence.

## Phase 1 - Top-bar selector structure

- [x] 1.6.4-QC-1 Split the combined Workspace/preset interaction into independent controls.
  - Preserve the existing top-bar branding, theme, read-only status, update affordance, and compact
    layout while giving Workspace and preset their own buttons and chevrons.
  - Add independent control state, accessible relationships, outside-click dismissal, Escape
    handling, and focus restoration for the preset popover and Workspace manager entry point.
  - Ensure opening or closing either surface does not mutate store state or apply a preset.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: none_
  - _Requirements: QC-1.1-QC-1.5, QC-7.1-QC-7.7_
  - _Validation: focused component tests, keyboard interaction tests, touched-file diagnostics, and
    frontend typecheck.
  - _Evidence: Independent accessible controls, outside-click/Escape dismissal, focus restoration,
    and responsive styling are implemented in `frontend/src/components/TargetSelector.tsx` and
    `frontend/src/index.css`; touched-file diagnostics and frontend typecheck passed.

- [x] 1.6.4-QC-2 Add the Workspace manager quick control and reset boundary.
  - Keep the Workspace top-bar control as the entry point to the existing manager, with the active
    item marked.
  - Call `switchWorkspace(id)` exactly once for an inactive selection and apply the existing
    complete operational reset for Workspace switching.
  - Apply the same reset boundary when `createWorkspace` creates and activates a Workspace.
  - Reconcile an active preset reference that is not present in the selected Workspace without
    applying a fallback preset or calling `loadPods`.
  - Keep the active item a no-op and preserve the manager entry point for one-Workspace catalogs.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-1_
  - _Requirements: QC-2.1-QC-2.7, QC-8.1-QC-8.5_
  - _Validation: focused Workspace manager/store tests with one/many Workspaces, active/inactive
    selection, create/switch reset assertions, active-preset reconciliation, and no-query assertions.
  - _Evidence: `frontend/src/store.ts` calls `resetWorkspaceView` from `createWorkspace` and
    `switchWorkspace`; `frontend/src/workspaces.test.ts` covers create/switch reset state, including
    targets, pods, loading/error state, textual filters, and stale active-preset reconciliation.

## Phase 2 - Recent preset selector and application

- [x] 1.6.4-QC-3 Add the active-Workspace recent preset selector.
  - Display at most five presets from the active Workspace using the shared recent ordering helper.
  - Raise the shared quick-access limit to five so launchpad and top bar use the same ordering and
    visible set; update the existing focused tests.
  - Show target summaries, active marking, an empty state, and an action to open the full preset
    library.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-1, 1.6.4-QC-2_
  - _Requirements: QC-3.1-QC-3.7_
  - _Validation: recent-order tests for zero through six presets, ties, never-used presets, and
    Workspace scoping; component tests for active/empty states.
  - _Evidence: The selector uses `getQuickPresets`, whose shared limit is now five; the updated
    recent-order test passes, including the fifth recent item. Active Workspace state supplies the
    catalog and the UI includes summaries, active marking, empty state, and library entry.

- [x] 1.6.4-QC-4 Route quick preset selection through `applyPresetAndLoad`.
  - Make a non-active preset current, update recent-use metadata, replace targets, clear stale query
    state and target errors, and start exactly one pod fetch.
  - Keep the selector open/close and loading behavior consistent with the existing preset library
    flow, prevent duplicate selection while pending, and block conflicting quick-menu actions.
  - Keep the selected preset current after a query-level failure and expose the existing safe error
    state.
  - Make selecting an unchanged active preset with no pending edits a no-op without a duplicate fetch.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-3_
  - _Requirements: QC-4.1-QC-4.9, QC-8.1-QC-8.5_
  - _Validation: focused preset-flow and component tests for exact apply/load ordering, one fetch,
    loading, duplicate blocking, active no-op, and failed query behavior.
  - _Evidence: Quick selection uses the existing single apply/load flow, blocks while loading,
    handles the clean active-preset no-op, and announces loading status. Existing preset-flow tests
    and the full frontend suite pass (122 tests).

## Phase 3 - Pending-edit protection

- [x] 1.6.4-QC-5 Protect unsaved target changes before quick preset replacement.
  - Detect pending edits before applying another preset or restoring the active saved preset. Pending
    edits include `activePresetDirty` and non-empty targets during `Live search`.
  - Add or reuse a product-owned confirmation that names the pending replacement and does not use
    deletion language.
  - Preserve targets, active preset, dirty state, and selector context on cancel, Escape, and
    backdrop dismissal.
  - Continue through `applyPresetAndLoad` exactly once after confirmation.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-4_
  - _Requirements: QC-5.1-QC-5.7, QC-6.3-QC-6.5_
  - _Validation: focused tests for clean/dirty states, active restore, alternate preset, every cancel
    path, exact confirmation callback, and duplicate-submit prevention.
  - _Evidence: Product-owned replacement confirmation covers `activePresetDirty` and non-empty Live
    search targets, with cancel/Escape/backdrop preservation and competing-action blocking. Browser
    interaction coverage remains an environment-dependent follow-up.

- [x] 1.6.4-QC-5A Record active-preset deletion reset behavior.
  - Clear the active preset reference and dirty state when the active saved preset is deleted.
  - Reset the current operational view through the shared Workspace reset boundary; leave the view
    intact when an inactive preset is deleted.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-2_
  - _Requirements: QC-6.1-QC-6.3
  - _Validation: focused store tests for active and inactive preset deletion, followed by application
    and browser reset checks.
  - _Evidence: `frontend/src/store.ts` clears the active reference and calls `resetWorkspaceView`;
    `frontend/src/store.test.ts` covers active preset deletion clearing presets, targets, pods, and
    query state. The application-filter reset is wired through `App`'s `explicitQueryRevision` effect;
    no dedicated component test is currently recorded.

- [x] 1.6.4-QC-5B Implement the multiple-application pod filter.
  - Derive normalized application options and pod counts from the current result.
  - Support multiple selection, local case-insensitive search by application name/key, clear action,
    and composition with the existing textual pod filter.
  - Clear selected applications when the existing operational reset revision changes.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-2_
  - _Requirements: QC-9.1-QC-9.6_
  - _Validation: focused ViewToolbar/App interaction tests, pod filter tests, and browser checks.
  - _Evidence: `frontend/src/App.tsx` derives options and applies application selection together with
    `matchesFilter`; `frontend/src/components/ViewToolbar.tsx` implements multi-select, search, and
    clearing; `App` clears selected applications on the reset revision. `frontend/src/podPresentation.test.ts`
    covers the textual predicate, but no dedicated application-filter component test is recorded.

## Phase 4 - Regression, accessibility, and boundary coverage

- [ ] 1.6.4-QC-6 Validate layout, focus, status, and theme behavior.
  - Verify long Workspace/preset names, loading labels, empty states, chevrons, and status controls
    at supported narrow desktop widths without overlap.
  - Verify both light and dark themes, keyboard navigation, focus restoration, Escape isolation,
    outside-click dismissal, and live status messaging.
  - _Copilot agent: @ops-union-frontend_
  - _Dependencies: 1.6.4-QC-1, 1.6.4-QC-2, 1.6.4-QC-3, 1.6.4-QC-4, 1.6.4-QC-5_
  - _Requirements: QC-1.1-QC-1.5, QC-7.1-QC-7.7_
  - _Validation: frontend tests, browser checks, screenshots at supported widths, typecheck, touched-
    file diagnostics, and `git diff --check`.

- [ ] 1.6.4-QC-7 Audit state ownership and read-only boundaries.
  - Confirm Workspace switching never applies a preset or queries Kubernetes.
  - Confirm quick preset selection uses one application/load path and the shared recent ordering
    helper, with no duplicate persistence path.
  - Confirm full Workspace/preset management remains reachable and no backend, Kubernetes mutation,
    renderer filesystem, or persistence-schema change was introduced.
  - _Copilot agent: @ops-union-architecture-review_
  - _Dependencies: 1.6.4-QC-6_
  - _Requirements: QC-2.1-QC-2.7, QC-3.1-QC-3.7, QC-8.1-QC-8.5, QC-9.1-QC-9.6_
  - _Validation: read-only code/contract audit with prioritized findings; no source mutation or
    Kubernetes action.

## Phase 5 - Web, desktop, and documentation convergence

- [ ] 1.6.4-QC-8 Validate web and desktop workflows.
  - Exercise Workspace switching, full-manager entry, empty preset state, recent preset selection,
    automatic pod fetch, pending-edit confirmation, query failure, and duplicate-action blocking.
  - Verify keyboard and responsive behavior in supported web and Electron environments.
  - Verify no Kubernetes mutation and record any unavailable environment or known limitation.
  - _Copilot agent: @ops-union-integration-qa_
  - _Dependencies: 1.6.4-QC-7_
  - _Requirements: QC-1.1-QC-1.5, QC-2.1-QC-2.7, QC-3.1-QC-3.7, QC-4.1-QC-4.9,
    QC-5.1-QC-5.7, QC-6.1-QC-6.3, QC-7.1-QC-7.7, QC-8.1-QC-8.5, QC-9.1-QC-9.6_
  - _Validation: web and desktop smoke/accessibility scenarios with a written limitation record.

- [ ] 1.6.4-QC-9 Converge current documentation with implementation evidence.
  - Update the current project plan and supported documentation only after implementation and QA
    evidence exists.
  - Update this spec's design, requirements, tasks, validation record, and approved deviations based
    on actual behavior; do not mark planned work complete from source inspection alone.
  - Keep release versioning, commits, tags, and generated artifacts outside this authoring task until
    separately approved.
  - _Copilot agent: repository maintainer_
  - _Dependencies: 1.6.4-QC-8_
  - _Requirements: Definition of done_
  - _Validation: documentation/spec consistency review and `git diff --check`.

## Definition of done

- Workspace and preset names are independent top-bar controls with an accessible Workspace manager
  entry point and preset quick selector.
- Workspace switching changes catalog context without implicit preset application or pod fetching.
- The active Workspace exposes five recent presets through the shared ordering and limit helper.
- Quick preset selection applies the saved targets and starts exactly one pod fetch with safe loading,
  failure, and duplicate-action behavior.
- Pending target edits require explicit confirmation before replacement.
- Creating or switching Workspace resets the operational view, and deleting the active preset has
  the same reset boundary.
- The pod view supports searchable multiple-application filtering composed with the textual filter,
  and context resets clear the application selection.
- Full management surfaces remain reachable, and no backend/Kubernetes/persistence boundary changed.
- Frontend automated coverage, web/desktop validation, accessibility checks, and architecture review
  are recorded before tasks are checked.

## Validation record

- `npm test --workspace=@ops-union/frontend`: passed, 122 tests.
- `npm run typecheck`: passed for backend, frontend, and desktop workspace scripts.
- `npm run build --workspace=@ops-union/frontend`: passed; Vite production build completed.
- `get_errors` for all touched frontend TypeScript/CSS files: no errors.
- `git diff --check`: passed.
- `frontend/src/workspaces.test.ts`: source-level tests cover complete operational reset on Workspace
  creation and switching.
- `frontend/src/store.test.ts`: source-level tests cover reset after deleting the active preset.
- `frontend/src/App.tsx` and `frontend/src/components/ViewToolbar.tsx`: source confirms searchable
  multi-application selection composed with the textual pod filter and reset through the query
  revision effect.
- Browser/Electron interaction, responsive screenshots, and read-only architecture audit were not
  available in this session and remain open for `@ops-union-integration-qa` and
  `@ops-union-architecture-review`.

# Implementation Tasks - ops-union v1.19.0 context capsules

This task list records the visual improvement as already implemented. All tasks are checked only for
the work and validation evidence available in the repository and the reported browser session.

## Ownership and sequencing

- `@ops-union-frontend` owns the topbar capsule styling and preservation of existing semantic
  controls and state.
- `@ops-union-integration-qa` owns browser visual, responsive, theme, accessibility, and regression
  validation.
- `repository maintainer` owns specification convergence and release administration only.
- No backend, Kubernetes, persistence, package, or release implementation is authorized.

## Phase 1 - Visual hierarchy and interaction states

- [x] 1.19.0-CC-1 Convert the topbar Workspace and Preset context into compact capsules.
  - Use a neutral Workspace surface and a soft orange Preset surface.
  - Reduce label/value density, retain integrated context icons, remove the old vertical separator,
    and preserve long-name truncation.
  - Keep `Read-only` outside the capsules as the existing green status indicator.
  - _Copilot agent: @ops-union-frontend_
  - _Requirements: CC-BASE.1-CC-BASE.3, CC-001.1-CC-001.6_
  - _Validation: reviewed `frontend/src/styles/02-shell.css`, `WorkspaceQuickControls.tsx`, and
    `App.tsx`; the worktree contains the capsule geometry and status separation.

- [x] 1.19.0-CC-2 Preserve hover, focus, disabled, accessibility, and existing labels.
  - Retain native buttons, existing `Workspace`/`Preset` visible labels, accessible names, ARIA
    relationships, decorative icon handling, busy/disabled behavior, and dirty Preset update
    semantics.
  - Keep accent feedback visible for hover/focus and reduced availability visible while busy.
  - _Copilot agent: @ops-union-frontend_
  - _Requirements: CC-002.1-CC-002.4, CC-003.1-CC-003.5_
  - _Validation: browser interaction smoke test completed; frontend typecheck passed.

## Phase 2 - Responsive, theme, and regression validation

- [x] 1.19.0-CC-3 Verify desktop/mobile layout and light/dark hierarchy.
  - Confirm Workspace and Preset remain readable and non-overlapping at narrow widths, with
    truncation for long names and reachable topbar actions.
  - Confirm neutral/orange context hierarchy, green `Read-only`, and state contrast in both themes.
  - _Copilot agent: @ops-union-integration-qa_
  - _Requirements: CC-004.1-CC-004.5, Definition of done_
  - _Validation: visual validation completed in the browser, including responsive behavior and
    theme presentation as reported for this implementation.

- [x] 1.19.0-CC-4 Converge the v1.19.0 specification and hygiene checks.
  - Keep requirements, design, and tasks consistent with the implemented CSS-only visual scope.
  - Confirm no package/version, release, source-behavior, commit, tag, or push changes are included.
  - _Copilot agent: repository maintainer_
  - _Requirements: CC-BASE.1-CC-BASE.3, Out of scope, Definition of done_
  - _Validation: `npm run typecheck --workspace=frontend` passed; `git diff --check` passed.

## Definition of done

- Workspace and Preset render as compact neutral/orange capsules with integrated icons, smaller
  typography, and no vertical divider.
- `Read-only` remains a distinct green status indicator.
- Existing labels, accessible names, controls, state, and read-only behavior are preserved.
- Desktop/mobile and light/dark visual checks show no overlap, clipping, or hierarchy loss.
- The focused frontend typecheck and diff-hygiene checks pass.
- No source behavior, package/version, release artifact, commit, tag, or push is changed by this
  spec-authoring work.

## Validation record

- Browser visual smoke test: passed; the topbar hierarchy and responsive/theme presentation were
  visually checked after implementation.
- `npm run typecheck --workspace=frontend`: passed.
- `git diff --check`: passed.
- Implementation evidence: `frontend/src/styles/02-shell.css` contains the neutral Workspace and
  soft-orange Preset capsule treatments, removes the former vertical separator, and preserves the
  compact responsive layout; existing labels and semantics remain in
  `frontend/src/components/WorkspaceQuickControls.tsx` and `frontend/src/App.tsx`.
- No package/version change, commit, tag, or push was performed for this spec.

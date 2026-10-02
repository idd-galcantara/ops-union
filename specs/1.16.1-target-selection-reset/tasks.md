# Implementation Tasks - ops-union v1.16.1 target selection reset

All tasks below are complete. This specification records the implemented fix and its validated
behavior; it does not authorize a version bump, commit, tag, or release push.

## Phase 1 - Behavior convergence

- [x] 1.16.1-TGT-1 Make applying a preset replace targets and clear the local draft.
  - Replace `targets` with the preset copy, set `activePresetId`/`activePresetDirty`, advance
    `configurationRevision` to clear the panel local draft, and reset operational state.
  - _Copilot agent: @ops-union-frontend
  - _Requirements: TGT-RESET-001.1-TGT-RESET-001.5, TGT-RESET-BASE.1-TGT-RESET-BASE.3
  - _Validation: `applyPreset` path review and the focused store test below.
  - _Definition of done: Applying a preset shows the preset targets and empties the panel editor.
  - _Evidence: `applyPreset` in [frontend/src/store/workspaceSlice.ts](../../frontend/src/store/workspaceSlice.ts)
    copies the preset targets, sets `activePresetId`, clears `activePresetDirty`, increments
    `configurationRevision`, and clears `pods`/`targetErrors`/`hasQueried`/`podsError`/`lastUpdatedAt`.

- [x] 1.16.1-TGT-2 Make returning to the initial view clear the full selection surface.
  - From the Ops Union logo, call `clearTargets()` to clear targets, discovered namespaces, the
    local draft, the view filter, and operational state, and invalidate in-flight requests.
  - _Copilot agent: @ops-union-frontend
  - _Requirements: TGT-RESET-002.1-TGT-RESET-002.4, TGT-RESET-BASE.1-TGT-RESET-BASE.3
  - _Validation: `clearTargets` path review and the focused store test below.
  - _Definition of done: The initial view starts clean with no stale selection, filter, or results.
  - _Evidence: `clearTargets` in [frontend/src/store/targetSlice.ts](../../frontend/src/store/targetSlice.ts)
    invalidates namespace/pod requests and resets targets, `namespaces`/`namespacesFor`, namespace
    loading/error, preset state, operational state, and `configurationRevision`; `resetView` in
    [frontend/src/App.tsx](../../frontend/src/App.tsx) wires it to the `brand-lockup` logo, and the
    `configurationRevision` effects clear the panel draft and `filter`.

## Phase 2 - Regression evidence

- [x] 1.16.1-TGT-3 Run the focused store tests.
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: TGT-RESET-003.1
  - _Validation: `npm --prefix frontend test -- src/store.test.ts`
  - _Definition of done: The apply-preset reset and clear-targets reset assertions pass.
  - _Evidence: `src/store.test.ts` passed (16/16), including `applying a preset resets the target
    editor revision` (targets replaced, `configurationRevision` advanced to 5, `activePresetId` set)
    and `clearing targets resets the target editor revision` (targets, `namespaces`, `namespacesFor`
    emptied, namespace loading/error cleared, `configurationRevision` advanced to 5).

- [x] 1.16.1-TGT-4 Run the full frontend test suite.
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: TGT-RESET-003.2
  - _Validation: `npm --prefix frontend test`
  - _Definition of done: The complete frontend suite passes with no regressions.
  - _Evidence: 150/150 frontend tests passed across 27 test files.

- [x] 1.16.1-TGT-5 Run the frontend typecheck and confirm clean diagnostics.
  - _Copilot agent: @ops-union-integration-qa
  - _Requirements: TGT-RESET-003.3
  - _Validation: `npm --prefix frontend run typecheck`
  - _Definition of done: Typecheck passes and the changed files report no diagnostics.
  - _Evidence: `tsc -b --noEmit` completed with no errors;
    [frontend/src/store/workspaceSlice.ts](../../frontend/src/store/workspaceSlice.ts),
    [frontend/src/store/targetSlice.ts](../../frontend/src/store/targetSlice.ts), and
    [frontend/src/store.test.ts](../../frontend/src/store.test.ts) each reported "No errors found".

## Definition of done

- Applying a preset replaces targets and clears the local draft.
- Returning to the initial view clears targets, local draft, filter, discovered namespaces, and
  operational state, and invalidates in-flight requests.
- Focused store tests, the full frontend suite, and the typecheck pass with clean diagnostics.
- No version bump, commit, tag, or release push is performed as part of this record.

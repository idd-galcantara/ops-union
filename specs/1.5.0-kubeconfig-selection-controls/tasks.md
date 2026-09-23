# Implementation Tasks - ops-union v1.5.0 kubeconfig selection controls

These tasks implement the kubeconfig picker and reset improvements without changing Kubernetes permissions, kubeconfig contents, or unrelated preferences.

## Ownership and sequencing

- `@ops-union-specs` owns this specification and acceptance criteria.
- `@ops-union-backend` owns the reset route, discovery/reload contract, cache behavior, safe errors, and backend tests.
- `@ops-union-frontend` owns the renderer store, status-panel controls, state cleanup, accessibility, and frontend validation.
- `@ops-union-desktop` owns Electron Main, preload IPC, native picker options, and preferences persistence.
- `@ops-union-integration-qa` owns Electron/manual validation, read-only boundary checks, and final evidence.
- No task authorizes a commit, push, packaging, release, or Kubernetes mutation.

## Tasks

- [x] 1.5.0-KC-1 Confirm current contracts and test fixtures.
  - Verify the existing environment, selected, and default discovery precedence.
  - Identify the existing successful kubeconfig-selection cleanup path and reusable status contracts.
  - Confirm preference fixtures do not expose kubeconfig paths or credentials.
  - _Owner: @ops-union-specs_
  - _Requirements: KC-2.3-KC-3.4, KC-VA.2_
  - _Validation: focused source/test review and baseline backend tests.
  - _Definition of done: implementation boundaries and failure policy are confirmed before source edits.

- [x] 1.5.0-KC-2 Implement backend reset contract.
  - Add protected `POST /api/kubeconfig/reset` beside the existing selection route.
  - Reuse `reloadKubeConfig(null)` and preserve transactional behavior on an unavailable environment/default config.
  - Return safe status metadata and sanitized errors.
  - Add backend tests for authorization, environment/default reset, failed reset preservation, cache invalidation, and no secret leakage.
  - _Owner: @ops-union-backend_
  - _Requirements: KC-2.3-KC-2.8, KC-4.4, KC-5.3-KC-5.4, KC-VA.1_
  - _Dependencies: 1.5.0-KC-1_
  - _Validation: `npm test --workspace=backend` and backend typecheck.
  - _Definition of done: reset has a protected, tested backend contract with explicit failure behavior.

- [x] 1.5.0-KC-3 Remove the native picker filter.
  - Remove the `filters` option from Electron's `dialog.showOpenDialog` call while retaining `openFile` behavior.
  - Preserve backend validation and persistence only after successful selection.
  - _Owner: @ops-union-desktop_
  - _Requirements: KC-1.1-KC-1.6_
  - _Dependencies: 1.5.0-KC-1_
  - _Validation: desktop typecheck and manual dialog inspection with a `.txt` kubeconfig.
  - _Definition of done: the native picker has no `Kubeconfig` filter and a valid arbitrary-extension file follows the existing selection flow.

- [x] 1.5.0-KC-4 Add desktop reset IPC and preference clearing.
  - Add a Main-process reset operation that calls the protected backend route.
  - Remove only `selectedKubeconfigPath` after successful reset while preserving theme and presets.
  - Expose the operation through preload with the existing context-isolated bridge.
  - Keep persistence and backend failures sanitized and recoverable.
  - _Owner: @ops-union-desktop_
  - _Requirements: KC-2.1-KC-2.8, KC-3.1-KC-3.3, KC-4.3-KC-4.4_
  - _Dependencies: 1.5.0-KC-2_
  - _Validation: desktop typecheck and manual restart/persistence check.
  - _Definition of done: reset works in-session and the selected path is absent after restart.

- [x] 1.5.0-KC-5 Add renderer reset state and accessible control.
  - Add the reset operation to the desktop bridge types and Zustand store.
  - Reuse successful kubeconfig-change cleanup for contexts, namespaces, targets, pods, details, and request generations.
  - Render a reset control only for an active selected source, including an unavailable selected file.
  - Provide accessible name, tooltip/label, focus state, loading state, and sanitized feedback.
  - _Owner: @ops-union-frontend_
  - _Requirements: KC-2.1, KC-2.4-KC-2.6, KC-4.1-KC-4.5, KC-5.1, KC-5.5_
  - _Dependencies: 1.5.0-KC-4_
  - _Validation: frontend typecheck, focused state tests where available, and manual desktop interaction.
  - _Definition of done: users can select, reset, and observe the resulting source without stale targets or inaccessible controls.

- [x] 1.5.0-KC-6 Run regression and integration validation.
  - Run backend tests and all workspace typechecks.
  - Build the application when the environment supports it.
  - Verify `.txt` picker selection, selected-source persistence, reset to `KUBECONFIG`/default, restart behavior, stale-state clearing, and failure recovery in Electron.
  - Confirm no kubeconfig content, credential, certificate, filesystem path, or raw cluster output appears in UI/test evidence.
  - Confirm no Kubernetes mutation and no unrelated preference changes.
  - _Owner: @ops-union-integration-qa_
  - _Requirements: KC-VA.1-KC-VA.5, KC-5.2_
  - _Dependencies: 1.5.0-KC-2, 1.5.0-KC-3, 1.5.0-KC-4, 1.5.0-KC-5_
  - _Validation: focused commands, Electron/manual evidence, `git diff --check`, and final `git status --short`.
  - _Definition of done: all available automated and manual gates pass or record explicit limitations.

## Validation record

The implementation owner SHALL append concrete command results, manual scenarios, limitations, and the validation date here after each task has evidence. Checked tasks do not imply a commit, push, release, or production approval.

- Baseline date: 2026-09-22.
- Baseline state: current checkout has local worktree changes unrelated to this spec; they SHALL be preserved and distinguished from implementation changes.
- Initial validation: source mapping completed for Electron Main/preload, backend discovery/reload/routes, renderer store, and kubeconfig panel. No implementation files were changed while creating this spec.

## Implementation evidence - 2026-09-23

- 1.5.0-KC-1: Existing precedence and transactional reload behavior confirmed in `backend/src/kube/kubeconfig.test.ts`; Windows default-path fixture was isolated from the host profile in `backend/src/app.test.ts`.
- 1.5.0-KC-2: Protected reset route added in `backend/src/routes/kubeconfig.ts`; focused route tests cover authorization, environment reset, failed-reset preservation, safe errors, context replacement, and sanitized responses. The kubeconfig suite covers client-cache invalidation and environment-to-default resolution.
- 1.5.0-KC-3: Native picker retains `openFile` and has no filters in `desktop/src/main.ts`; backend validation and post-validation persistence remain unchanged.
- 1.5.0-KC-4: Main/preload reset IPC calls the protected route and removes only `selectedKubeconfigPath`, preserving other preference keys. Desktop typecheck passed.
- 1.5.0-KC-5: Renderer bridge types, shared store cleanup, request-generation invalidation, configuration revision cleanup, unavailable-selected status messaging, and accessible disabled/loading reset control are implemented. The focused store reset test confirms derived state is cleared and only contexts reload; frontend tests passed (106) and frontend typecheck passed.
- 1.5.0-KC-6: Backend tests passed for all kubeconfig/reset cases; the full backend suite passed 89 tests and retains one unrelated pre-existing history-session failure. All workspace typechecks, the complete workspace build, and `git diff --check` passed. No Electron manual acceptance script is available in the repository, so `.txt` picker and restart behavior remain manual validation limitations. No dependency installation was required.

Documentation convergence: current normative v1.5.0 task evidence was updated; no README or release documentation changes were required. No commit, push, package, or Kubernetes operation was performed.

## Definition of done

- Every task has evidence or an explicit limitation.
- Automated checks and available Electron/manual checks cover picker, reset, persistence, precedence, stale-state cleanup, safety, and read-only boundaries.
- The final worktree review distinguishes this implementation from pre-existing user changes.
- No commit, push, package, release, or Kubernetes mutation occurs as part of implementation validation.

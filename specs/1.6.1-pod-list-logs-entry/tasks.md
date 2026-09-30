# Implementation Tasks - ops-union v1.6.1 pod list logs entry

These tasks record the completed v1.6.1 UX refinement. All tasks are checked because the behavior
was implemented in the latest approved commit and validated before release preparation.

## Phase 1 - Interaction contract

- [x] 1.6.1-PL-1 Confirm the existing pod row and details-to-logs flow.
  - Verify that clicking a row opens `PodDetailsPanel` and that the Logs tab owns the existing
    source-selection flow.
  - Preserve the single-application source-scope guard and aggregate log viewer behavior.
  - _Evidence: `frontend/src/App.tsx`, `frontend/src/components/PodDetailsPanel.tsx`, and the
    existing log source modal flow.

- [x] 1.6.1-PL-2 Remove pod selection from the unified pod table.
  - Remove the checkbox column and `selectedPods`/`onTogglePod` table props.
  - Remove the `selectedPodKeys` state and list-level selection handlers from `App`.
  - Preserve row click, keyboard activation, grouping, filtering, and pagination.
  - _Evidence: `frontend/src/components/PodTable.tsx` and `frontend/src/App.tsx`.

- [x] 1.6.1-PL-3 Remove list-level log launching.
  - Remove the summary `Open logs` button and the multiple-application warning from the pod list.
  - Keep logs available from the selected pod details panel through the Logs tab.
  - _Evidence: `frontend/src/App.tsx` and `frontend/src/components/PodDetailsPanel.tsx`.

## Phase 2 - Validation and release

- [x] 1.6.1-PL-4 Run focused frontend validation.
  - Run frontend typecheck and tests.
  - Run `git diff --check` and touched-file diagnostics.
  - _Evidence: frontend typecheck passed; 116 frontend tests passed; diff check passed.

- [x] 1.6.1-PL-5 Converge the release documentation.
  - Record the interaction contract, implementation design, validation, and release version in the
    three v1.6.1 spec files.
  - Update current README and technical documentation references from v1.6.0 to v1.6.1 where they
    identify the current release.
  - Align `package.json` and `package-lock.json`, create the release commit, and publish `v1.6.1`
    only after the version and validation checks pass.

## Definition of done

- All tasks above are checked.
- The list is navigation-only for pods.
- Logs are entered through pod details and the Logs tab.
- Source and container selection remains available inside the log-source modal.
- No Kubernetes mutation or backend API change was introduced.
- The v1.6.1 tag points to the validated release commit.

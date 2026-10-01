# Implementation Tasks - ops-union v1.8.1 preset save flow correction

These tasks document the already implemented frontend correction. They do not authorize backend
changes, API or WebSocket changes, Kubernetes mutation, dependency upgrades, package versioning,
packaging, git commits, tags, pushes, or release artifacts. Completed tasks require evidence in the
validation record below.

## Ownership and sequencing

- `@ops-union-frontend` owns modal sequencing, duplicate validation, store integration, apply/query
  behavior, and frontend tests.
- `@ops-union-architecture-review` owns read-only catalog, store, contract, and platform-boundary
  review.
- `@ops-union-integration-qa` owns available browser/desktop smoke, accessibility, responsive/theme,
  and read-only validation.
- `repository maintainer` owns spec convergence and release documentation only.

## Phase 1 - Preset create flow implementation

- [x] 1.8.1-PSF-1 Close the preset listing before opening Save as new.
  - Route Save as new through the existing preset flow so the listing closes before the create
    editor opens, while preserving the existing modal shell, focus, and dismissal behavior.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Requirements: PSF-1.1-PSF-1.4
  - _Validation: focused and full frontend tests, typecheck, build, and clean diagnostics recorded
    in the validation record.
  - _Definition of done: the create modal is the single visible modal context and opening it does
    not apply or query a draft.

- [x] 1.8.1-PSF-2 Reject duplicate names in the create modal.
  - Validate names with trimmed, case-insensitive comparison against existing presets.
  - Show an actionable duplicate-name alert and disable Create while the normalized name conflicts.
  - Preserve existing empty-name and other editor validation behavior.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.1-PSF-1
  - _Requirements: PSF-2.1-PSF-2.6, PSF-5.1-PSF-5.5
  - _Validation: focused and full frontend tests, typecheck, build, and clean diagnostics recorded
    in the validation record.
  - _Definition of done: duplicate create submission is visibly actionable and impossible through
    the enabled modal action.

- [x] 1.8.1-PSF-3 Add store-level duplicate defense in depth.
  - Repeat the same trimmed, case-insensitive duplicate check in the existing store create action
    immediately before catalog mutation.
  - Preserve catalog, active-preset, target, query, and operational state on rejection.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.1-PSF-2
  - _Requirements: PSF-3.1-PSF-3.4, PSF-5.4-PSF-5.5
  - _Validation: focused and full frontend tests, typecheck, build, and clean diagnostics recorded
    in the validation record.
  - _Definition of done: callers cannot bypass the duplicate-name invariant by skipping modal
    validation.

- [x] 1.8.1-PSF-4 Close, apply/load, and query the newly created preset.
  - On accepted creation, close the create modal, apply/load the new preset through the existing
    store flow, and query the main screen for that preset.
  - Preserve the source record and avoid apply/query behavior for rejected or cancelled creation.
  - _Owner: @ops-union-frontend
  - _Copilot agent: @ops-union-frontend
  - _Dependencies: 1.8.1-PSF-1, 1.8.1-PSF-3
  - _Requirements: PSF-4.1-PSF-4.5
  - _Validation: focused and full frontend tests, typecheck, build, and clean diagnostics recorded
    in the validation record.
  - _Definition of done: the main screen is settled on and queried for the newly created preset.

## Phase 2 - Review and release-record validation

- [x] 1.8.1-PSF-5 Review ownership and unchanged platform boundaries.
  - Confirm frontend/store ownership for modal, catalog, duplicate, apply, and query behavior.
  - Confirm no backend/API/WebSocket/Kubernetes mutation/dependency/persistence-format change is in
    scope or present in the documented correction.
  - _Owner: @ops-union-architecture-review
  - _Copilot agent: @ops-union-architecture-review
  - _Dependencies: 1.8.1-PSF-4
  - _Requirements: PSF-5.1-PSF-5.5
  - _Validation: read-only scope and contract review recorded below.
  - _Definition of done: every state transition has one owner and platform boundaries remain intact.

- [x] 1.8.1-PSF-6 Record automated validation evidence.
  - Record focused frontend tests, full frontend tests, frontend typecheck/build, diagnostics, and
    whitespace validation exactly as executed in the current worktree.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.8.1-PSF-5
  - _Requirements: PSF-1-PSF-5, Definition of done
  - _Validation: validation record below.
  - _Definition of done: no automated result is claimed without current-worktree evidence.

- [ ] 1.8.1-PSF-7 Complete browser/desktop smoke and accessibility validation.
  - Exercise listing-to-create transition, duplicate alert and disabled Create action, successful
    apply/query, keyboard focus, dismissal, responsive layout, and light/dark behavior.
  - _Owner: @ops-union-integration-qa
  - _Copilot agent: @ops-union-integration-qa
  - _Dependencies: 1.8.1-PSF-6
  - _Requirements: PSF-1.1-PSF-5.5
  - _Validation: browser/desktop smoke is unavailable in the current evidence; do not mark complete.
  - _Definition of done: available interactive checks have explicit pass/fail evidence, or remain
    recorded as unavailable with residual risk.

- [ ] 1.8.1-PSF-8 Perform package/tag/push release administration.
  - No package version, release artifact, git commit, tag, or push is authorized by this task.
  - _Owner: repository maintainer
  - _Copilot agent: repository maintainer
  - _Dependencies: 1.8.1-PSF-6
  - _Requirements: Out of scope
  - _Validation: intentionally not performed; this work only records the approved 1.8.1 scope.
  - _Definition of done: release administration remains outside the changed files and git history.

## Definition of done

- The four implemented behavior corrections and their ownership are documented.
- Automated evidence is recorded, while unavailable browser/desktop smoke is not claimed as passed.
- No application source, package version, git history, commit, tag, push, backend/API/WebSocket,
  Kubernetes, dependency, or persistence-format change is part of this specification update.

## Validation record

Implementation and validation evidence was supplied for the current worktree; proposed commands
above are not evidence of completion.

- 2026-09-30: Frontend focused tests passed: 139 passed, 0 failed.
- 2026-09-30: Frontend full test suite passed: 139 passed, 0 failed.
- 2026-09-30: Frontend typecheck passed.
- 2026-09-30: Frontend production build passed.
- 2026-09-30: `get_errors` reported a clean result for the relevant worktree files.
- 2026-09-30: `git diff --check` passed.
- 2026-09-30: Browser/desktop smoke, keyboard/accessibility, responsive/theme, and visual checks
  were unavailable in the current evidence. Residual risk remains for interactive rendering and
  narrow-width layout coverage; automated tests and static diagnostics cover the documented flow.
- 2026-09-30: No backend/API/WebSocket/Kubernetes mutation/dependency/persistence-format change,
  package version change, git history change, commit, tag, or push is claimed by this specification.

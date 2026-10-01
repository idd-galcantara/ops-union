# Implementation Tasks - ops-union v1.15.0 Dependabot auto-merge

- [x] 1.15.0-MERGE-1 Inspect repository merge policy and existing checks.
  - Confirm repository auto-merge status, branch protection, and check names.
  - _Evidence: `allow_auto_merge` was disabled; `main` had no branch protection; the checks are
    `Validate pull request` and `Review dependency changes`.

- [x] 1.15.0-MERGE-2 Implement gated Dependabot auto-merge.
  - Add a trusted `workflow_run` workflow with explicit author and head-SHA check validation.
  - Request native squash auto-merge only after both checks pass.
  - _Evidence: `.github/workflows/dependabot-auto-merge.yml` added; no PR branch checkout or code
    execution occurs.

- [x] 1.15.0-MERGE-3 Document and validate the behavior.
  - Record scope, permissions, failure behavior, and repository setting requirement.
  - Validate workflow YAML and diff hygiene.
  - _Evidence: requirements/design/tasks recorded; YAML parse and `git diff --check` passed.
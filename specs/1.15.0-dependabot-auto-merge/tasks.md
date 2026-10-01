# Implementation Tasks - ops-union v1.15.0 Dependabot auto-merge

- [x] 1.15.0-MERGE-1 Inspect repository merge policy and existing checks.
  - Confirm repository auto-merge status, branch protection, and check names.
  - _Evidence: `allow_auto_merge` is enabled; `main` requires the checks `Validate pull request`
    and `Review dependency changes`.

- [x] 1.15.0-MERGE-2 Implement gated Dependabot auto-merge.
  - Add a trusted `workflow_run` workflow with explicit author and head-SHA check validation.
  - Request native squash auto-merge only after both checks pass.
  - _Evidence: `.github/workflows/dependabot-auto-merge.yml` added; no PR branch checkout or code
    execution occurs.

- [x] 1.15.0-MERGE-3 Document and validate the behavior.
  - Record scope, permissions, failure behavior, repository settings, and required checks.
  - Validate workflow YAML, embedded Bash syntax, and diff hygiene.
  - _Evidence: requirements/design/tasks recorded; YAML parse, Bash syntax check, and
    `git diff --check` passed.
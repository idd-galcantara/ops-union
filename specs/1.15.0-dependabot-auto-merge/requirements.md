# Requirements - ops-union v1.15.0 Dependabot auto-merge

## Status and scope

Version 1.15.0 adds controlled auto-merge for Dependabot pull requests. A PR may be scheduled for
native GitHub auto-merge only after the complete pull-request validation and dependency review
checks both pass for its current head commit.

The application, Kubernetes read-only boundary, supported runtime, release workflow, and package
contents remain unchanged. No dependency is upgraded by this specification.

## Requirements

### MERGE-BASE - Preserve review and security boundaries

1. Auto-merge SHALL apply only to PRs authored by `dependabot[bot]`.
2. The workflow SHALL not check out or execute code from the pull request branch.
3. A failed, cancelled, pending, or missing check SHALL prevent auto-merge from being requested.

**Acceptance criteria:** The workflow uses a trusted `workflow_run` context, read/write permissions
only for GitHub PR operations, and an explicit Dependabot author check.

### MERGE-001 - Require complete validation

1. `Validate pull request` SHALL be completed successfully for the current PR head SHA.
2. `Review dependency changes` SHALL be completed successfully for the current PR head SHA.
3. The workflow SHALL request GitHub's native squash auto-merge only after both checks pass.

**Acceptance criteria:** A PR with either check failed or absent remains open and is not scheduled
for merge; an eligible PR receives native auto-merge.

### MERGE-002 - Preserve merge behavior

1. Auto-merge SHALL use squash merge and delete the source branch after merge.
2. The workflow SHALL not bypass repository review or status-check rules.
3. A human may still disable auto-merge or close the PR before GitHub merges it.

**Acceptance criteria:** The workflow calls `gh pr merge --auto --squash --delete-branch` and does
not force, administratively merge, or alter failed PRs.

## Out of scope

- Automatically approving PRs.
- Auto-merging non-Dependabot PRs.
- Enabling unrelated dependency upgrades, vulnerability fixes, or major migrations.
- Changing Kubernetes access, application code, package contents, or release version metadata.

## Definition of done

- Auto-merge workflow is present and scoped to completed validation/review workflows.
- Current documentation describes the gating behavior.
- The repository auto-merge setting is enabled before eligible PRs are merged.
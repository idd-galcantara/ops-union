# Design - ops-union v1.15.0 Dependabot auto-merge

## Flow

```text
Pull request validation / Dependency review
  -> workflow_run completed successfully
  -> locate PR associated with the run
  -> verify Dependabot author
  -> inspect current head SHA checks
  -> request native GitHub squash auto-merge
```

The workflow runs from the default branch through `workflow_run`, so it does not execute untrusted
PR code with write permissions. It reads check runs through the GitHub API and invokes the GitHub
CLI only after both named checks are successful for the current head SHA.

## Failure behavior

The workflow exits normally with a waiting message when either check is pending, missing, or not
successful. A later successful `workflow_run` event evaluates the same PR again. A failed validation
does not call `gh pr merge`.

## Ownership and permissions

- `pull-requests: write` permits requesting native auto-merge.
- `contents: write` permits the squash merge and source-branch deletion after GitHub approves it.
- No checkout, package installation, secret access, or Kubernetes operation occurs in this job.

Repository-level `allow_auto_merge` is enabled. The `main` branch requires both named checks, so
GitHub remains the final merge authority. Required reviews, if added later, also remain
authoritative and can hold the auto-merge request.
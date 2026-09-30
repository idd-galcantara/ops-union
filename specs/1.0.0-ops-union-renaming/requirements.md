# Requirements - Ops Union v1.0.0 application rename

## Scope

This specification records the completed transition from the `ops-union` identity
to the `Ops Union` product identity and promotes the application to its first
stable major release, `1.0.0`. The release includes the pending source,
documentation, automation, packaging, and specification updates in the working
tree.

The release does not change the application's read-only Kubernetes boundary or
its existing workload, preset, metrics, describe, and log behavior.

## Glossary

- **Product name:** The human-facing name `Ops Union` shown in the application,
  window title, and installer metadata.
- **Technical slug:** The lowercase identifier `ops-union` used by packages,
  executables, artifact filenames, storage namespaces, and repository references.
- **Stable application identity:** The Electron `appId`
  `com.opsflow.desktop`, which remains unchanged so existing installations can
  continue to receive updates.
- **Desktop bridge contract:** The internal `window.opsFlowDesktop` API exposed
  by Electron preload and consumed by the frontend.

## Requirements

### Requirement 1 - Establish the Ops Union product identity

1. All public product surfaces SHALL identify the application as `Ops Union`.
2. Package names, workspace names, executable names, artifact names, storage
   namespaces, repository links, and automation identifiers SHALL use the
   `ops-union` technical slug.
3. The installer and packaged application metadata SHALL use `Ops Union` as the
   displayed product name.
4. Generated artifact filenames SHALL remain machine-friendly and use the
   `ops-union` slug without spaces.

### Requirement 2 - Preserve installation and runtime compatibility

1. The Electron `appId` SHALL remain `com.opsflow.desktop`.
2. The unchanged `appId` SHALL be preserved in source configuration and effective
   electron-builder configuration so existing installations retain their update
   identity.
3. The `window.opsFlowDesktop` preload bridge SHALL remain available with its
   existing methods and behavior.
4. No rename-only change SHALL add Kubernetes mutation operations, new backend
   routes, renderer filesystem access, or a second persistence mechanism.

### Requirement 3 - Promote the release to version 1.0.0

1. The root `package.json` version SHALL be `1.0.0`.
2. The matching root entry in `package-lock.json` SHALL be `1.0.0`.
3. Workspace package versions that are intentionally private implementation
   packages SHALL remain unchanged unless required by their existing release
   contract.
4. The release documentation and specification SHALL identify this milestone as
   `v1.0.0`.

### Requirement 4 - Preserve existing application behavior

1. Existing frontend and backend behavior SHALL remain functionally unchanged
   except for product identity and version metadata.
2. The application SHALL remain strictly read-only against Kubernetes.
3. Existing presets, target selection, pod aggregation, metrics, describe, and
   log workflows SHALL continue to use their established code paths.
4. Existing automated tests, typechecks, production build, and desktop packaging
   SHALL pass for the release candidate.

### Requirement 5 - Commit the completed release scope

1. All pending tracked changes belonging to this rename and release preparation
   SHALL be included in the staged change set.
2. The staged diff SHALL be reviewed for accidental omissions, generated-file
   churn, whitespace errors, and unrelated destructive changes.
3. A release commit SHALL be created for `v1.0.0` after validation succeeds.
4. Tagging and pushing SHALL remain separate delivery actions unless explicitly
   requested after the commit review.

## Definition of done

- The application is publicly branded as `Ops Union`.
- Technical identifiers and distribution artifacts use `ops-union`.
- `com.opsflow.desktop` and `window.opsFlowDesktop` remain compatible contracts.
- Root version metadata is aligned at `1.0.0`.
- The rename and release scope has its own specification.
- Tests, typecheck, build, package validation, and `git diff --check` pass.
- All pending changes are staged and committed as the `1.0.0` release.

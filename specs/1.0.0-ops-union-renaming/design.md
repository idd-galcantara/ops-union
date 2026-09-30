# Design - Ops Union v1.0.0 application rename

## Overview

Version 1.0.0 establishes `Ops Union` as the product identity after the
repository and codebase transition from `ops-union`. The rename is deliberately
split between a human-facing product name and stable technical identifiers so
the installed desktop application remains update-compatible.

## Identity mapping

| Surface | Value | Rule |
| --- | --- | --- |
| Product name | `Ops Union` | Use in UI, window title, installer, and package metadata |
| Technical slug | `ops-union` | Use in packages, executables, artifacts, storage keys, and automation |
| Repository | `https://github.com/idd-galcantara/ops-union` | Canonical source link |
| Electron appId | `com.opsflow.desktop` | Preserve for installed-app update compatibility |
| Electron preload bridge | `window.opsFlowDesktop` | Preserve as an internal runtime contract |
| Release version | `1.0.0` | Root package and lockfile version |

## Ownership and boundaries

- `package.json` and `package-lock.json` own root release metadata.
- `electron-builder.yml` owns installer product metadata, executable names,
  artifact naming, and Linux desktop association.
- `frontend/index.html` and `frontend/src/App.tsx` own visible product branding.
- Backend, frontend, desktop, documentation, automation, and specification
  references use the technical slug where an identifier is required.
- `desktop/src/preload.ts` and frontend consumers preserve the existing
  `opsFlowDesktop` bridge because it is an internal compatibility boundary, not
  the public product name.
- `appId` is intentionally not renamed. Changing it would create a new desktop
  application identity and could prevent updates to installed versions.

## Versioning and delivery

The release is prepared locally as `1.0.0`. The commit contains the complete
pending rename and release scope. A tag and push are intentionally separate from
this implementation step so release publication can be reviewed independently.

Generated frontend, desktop, backend-runtime, and release artifacts are produced
by the existing build and packaging commands. They are not manually edited to
apply the rename.

## Validation strategy

The release gate combines static identity checks with the existing behavior
checks:

- assert root package and lockfile versions match `1.0.0`;
- verify `Ops Union` appears in public product surfaces;
- verify `ops-union` appears in technical distribution surfaces;
- verify `com.opsflow.desktop` and `window.opsFlowDesktop` remain present;
- run workspace tests and typechecks;
- run the production build and Linux package command;
- run `git diff --check` and review the staged diff before committing.

# Requirements - ops-union v1.5.0 kubeconfig selection controls

## Scope

Version 1.5.0 improves the desktop kubeconfig workflow. The native file picker SHALL accept kubeconfig files regardless of filename extension, including files downloaded with a `.txt` suffix. The desktop app SHALL provide a reset action that removes a manually selected kubeconfig and resumes normal kubeconfig discovery.

This specification changes selection ergonomics and persistence only. It SHALL preserve kubeconfig validation, credential boundaries, context discovery, Kubernetes read-only behavior, and the existing precedence between environment, selected, and default locations.

## User stories

- As a desktop user, I can select a valid kubeconfig downloaded as `kubeconfig.txt` without changing a file-type filter.
- As a desktop user, I can see when a manually selected kubeconfig is active and reset it to the app's normal discovery behavior.
- As a desktop user, after reset, the app uses `KUBECONFIG` when configured and otherwise uses the platform default kubeconfig path.
- As a desktop user, cancelling a picker or a failed reset does not discard the working configuration.
- As a security-conscious operator, selecting or resetting a kubeconfig never exposes its path, credentials, certificates, or raw content in UI errors or API responses.
- As a maintainer, the change remains within the existing Electron Main, preload, renderer, backend route, and kubeconfig discovery boundaries.

## Glossary

- **Selected kubeconfig:** A file path explicitly chosen through the desktop file picker and persisted in Electron preferences.
- **Normal discovery:** Existing resolution order: `KUBECONFIG` environment paths, then the platform default path (`%USERPROFILE%\\.kube\\config` on Windows or `$HOME/.kube/config` elsewhere).
- **Reset:** Removal of the persisted selected path followed by a reload using normal discovery.
- **Kubeconfig validation:** The existing backend load and parse operation. Removing the picker filter SHALL NOT weaken this validation.
- **Selection state:** The active kubeconfig source, available/context metadata, loaded contexts, namespaces, targets, pods, and dependent query state.

## Requirements

### KC-1 - Unrestricted desktop file selection

1. The desktop kubeconfig picker SHALL remain a native Electron `openFile` dialog.
2. The picker SHALL not apply a file-type filter or display a default `Kubeconfig` extension filter. Any file name and extension SHALL be selectable.
3. A selected file SHALL still be accepted only when the existing backend kubeconfig loader can read and parse it. Removing the picker filter SHALL not accept invalid content.
4. Selecting a valid kubeconfig whose filename ends in `.txt`, `.yaml`, `.yml`, or has no extension SHALL follow the same validation, reload, persistence, and status flow.
5. Cancelling the dialog SHALL leave the active kubeconfig, persisted selection, contexts, namespaces, targets, and query results unchanged.
6. The web build SHALL retain its current behavior when no native desktop picker is available.

### KC-2 - Reset to normal discovery

1. The desktop UI SHALL expose a reset action when a manually selected kubeconfig is active, including when the selected file is no longer available but the active source remains `selected`.
2. The reset action SHALL remove only the persisted selected kubeconfig path. It SHALL preserve unrelated Electron preferences, including theme and presets.
3. After a successful reset, the app SHALL resolve the active kubeconfig through normal discovery:
   - use `KUBECONFIG` when it contains configured paths;
   - otherwise use the platform default kubeconfig path.
4. The reset SHALL take effect in the current session without requiring an application restart.
5. A successful reset SHALL invalidate kubeconfig-derived clients and caches and SHALL reload the active kubeconfig status and contexts.
6. A successful reset SHALL clear contexts, namespaces, targets, pods, selected pod details, and other query state that could refer to the previous kubeconfig.
7. If normal discovery cannot load a kubeconfig, the reset SHALL either expose the resulting unavailable status without retaining the old selected path or, if the implementation uses transactional reload, preserve the old active configuration and persisted selection. The chosen behavior SHALL be explicit in the design and covered by tests.
8. A failed reset SHALL not expose the attempted path, kubeconfig content, credentials, certificates, or raw parser error.

### KC-3 - Persistence and precedence

1. Selecting a file SHALL continue to persist its path only after backend validation succeeds.
2. On restart, a persisted selected path SHALL continue to take precedence over `KUBECONFIG`, matching existing behavior, until the user resets it.
3. After a successful reset and restart, the app SHALL not recreate the removed selected-path preference automatically.
4. The backend SHALL preserve the existing `environment -> selected -> default` discovery contract, with the existing startup rule that an explicit selected path prevents an environment path from overriding it.
5. The reset implementation SHALL not modify the user's kubeconfig file or merge, rewrite, or delete contexts.

### KC-4 - Interaction, accessibility, and safe feedback

1. The reset control SHALL have an accessible name, keyboard support, visible focus, a disabled/loading state, and a tooltip or adjacent label that identifies its purpose.
2. The UI SHALL show the resulting source after reset as `KUBECONFIG` or `Default location`, without displaying the full filesystem path.
3. While selection or reset is in progress, duplicate actions SHALL be prevented and the existing status loading state SHALL remain authoritative.
4. Errors SHALL be concise and sanitized. They SHALL not include filesystem paths, kubeconfig YAML, tokens, client certificates, private keys, authorization headers, or raw Kubernetes responses.
5. The reset action SHALL not silently submit a pod query or reuse targets from the previous configuration.

### KC-5 - Compatibility and read-only boundaries

1. Existing context, namespace, pod, describe, metrics, and log queries SHALL continue to use the active kubeconfig after selection or reset.
2. The change SHALL not add Kubernetes permissions or mutation paths, including create, patch, update, delete, restart, scale, exec, attach, or port-forward operations.
3. Existing internal-token protection for desktop-to-backend kubeconfig control routes SHALL remain required.
4. Existing selected-file error handling, safe status metadata, cache invalidation, and context discovery contracts SHALL remain compatible unless explicitly changed by this specification.
5. The change SHALL not alter preset data, theme persistence, log behavior, refresh behavior, or packaging behavior beyond the kubeconfig control surface.

## Validation requirements

### KC-VA - Regression and acceptance evidence

1. Backend tests SHALL cover reset authorization, successful reset to environment/default discovery, failed reset behavior, cache invalidation, sanitized errors, and preservation of unrelated preferences at the desktop boundary where testable.
2. Discovery tests SHALL retain coverage for environment, selected, and default precedence on Windows and Linux.
3. Desktop and frontend typechecks SHALL pass.
4. An available Electron/manual check SHALL prove that the picker has no `Kubeconfig` type filter, a `.txt` kubeconfig can be selected, the selected source is persisted across restart, reset returns to normal discovery, and contexts from the previous configuration are not retained.
5. Validation SHALL confirm no kubeconfig contents, credentials, certificates, or raw cluster output are written to test reports or UI feedback.

## Definition of done

- The desktop picker accepts valid kubeconfigs with arbitrary extensions and no longer presents a `Kubeconfig` type filter.
- A selected kubeconfig can be reset to normal discovery in the same session and after restart.
- Reset and selection preserve validation, safe errors, cache invalidation, and read-only Kubernetes boundaries.
- Backend tests and available typechecks pass, and Electron/manual evidence records picker, persistence, reset, and failure behavior.
- No unrelated preferences, kubeconfig files, contexts, commits, pushes, or Kubernetes resources are modified by the feature.

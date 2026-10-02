# Requirements - ops-union v1.19.0 context capsules

## Status and scope

This specification records the visual improvement already implemented in the topbar for the planned
v1.19.0 release. The published baseline is v1.18.0. The change is primarily in
`frontend/src/styles/02-shell.css` and presents the current Workspace and Preset context as compact
capsules without changing their behavior or state.

The change covers:

- a neutral capsule for Workspace;
- a soft orange accent capsule for Preset;
- smaller, denser typography with integrated icons;
- removal of the old vertical separator between the context controls;
- continued green status treatment for `Read-only`;
- hover, focus, disabled, responsive, and light/dark theme behavior; and
- preservation of existing labels, actions, state, and read-only boundaries.

It does not authorize source-code behavior changes, package/version changes, release artifacts,
commits, tags, pushes, or unrelated visual refactors.

## User stories

- As an operator, I can identify the active Workspace and Preset at a glance without the topbar
  becoming visually heavy.
- As an operator, I can distinguish editable context controls from the green `Read-only` product
  status.
- As an operator, I can use the same Workspace and Preset controls with a keyboard, at narrow
  widths, and in either theme.

## Requirements

### CC-BASE - Product and behavior boundaries

1. The improvement SHALL remain a frontend presentation change owned by the existing topbar and
   Workspace/Preset quick-control surfaces.
2. The change SHALL preserve the existing Workspace manager action, Preset menu action, active
   Preset update action, theme toggle, and `Read-only` status behavior.
3. The change SHALL not add backend routes, Kubernetes operations, filesystem access, persistence
   changes, or new context state.

**Acceptance criteria:** The topbar looks different while the existing controls invoke the same
handlers and expose the same state.

### CC-001 - Visual hierarchy and treatment

1. Workspace SHALL be rendered as the neutral, compact capsule and remain the primary context
   location in the flexible topbar region.
2. Preset SHALL be rendered as a compact capsule with the soft orange accent treatment and an
   integrated bookmark icon.
3. Workspace and Preset SHALL use smaller, dense labels and values with ellipsis for long names;
   their existing visible labels SHALL remain `Workspace` and `Preset`.
4. The Workspace and Preset capsules SHALL not use the previous vertical border separator between
   them. Their separation SHALL come from spacing, capsule surfaces, and the existing layout.
5. The `Read-only` status SHALL remain a distinct green status indicator in the topbar actions,
   visually subordinate to context selection but clearly recognizable as an application status.
6. Existing context icons SHALL remain decorative to assistive technology, while the visible labels
   and control names remain available to users.

**Acceptance criteria:** A visual inspection shows a neutral Workspace capsule, orange Preset
capsule, integrated icons, no old vertical divider, and a separate green `Read-only` status.

### CC-002 - Interaction states

1. WHEN a Workspace or Preset capsule is hovered or receives visible keyboard focus, THEN the
   control SHALL expose the existing accent color/border treatment without losing text or icon
   legibility.
2. WHEN a capsule is disabled because its existing manager or menu operation is busy, THEN it SHALL
   retain its compact geometry, communicate reduced availability, and preserve the existing busy
   behavior rather than accepting an action.
3. Focus SHALL remain visibly distinguishable from the surrounding topbar in both themes and SHALL
   not depend on the removed vertical separator.
4. The Preset update control SHALL continue to appear only when the active Preset is dirty and SHALL
   retain its existing disabled and update semantics.

**Acceptance criteria:** Hover, keyboard focus, and disabled states are visible and do not change
which actions are available or how busy state is handled.

### CC-003 - Accessibility and existing labels

1. The Workspace control SHALL retain its accessible name in the form `Workspace: <name>` and its
   existing dialog relationship and expanded state.
2. The Preset control SHALL retain its accessible name in the form `Preset: <name>` or `Preset: Live
   search`, together with its existing menu relationship and expanded state.
3. Decorative icons SHALL remain hidden from assistive technology where already marked as such; the
   visual restyling SHALL not replace the semantic button elements with non-interactive elements.
4. Keyboard users SHALL be able to reach, identify, focus, and activate the Workspace, Preset,
   update, theme, and status-adjacent controls using the existing interaction model.
5. The visible `Workspace`, `Preset`, and `Read-only` labels SHALL not be removed, renamed, or made
   dependent on color alone.

**Acceptance criteria:** Existing accessible names, roles, relationships, labels, and keyboard
activation remain intact after the visual change.

### CC-004 - Responsive behavior and themes

1. On narrow/mobile layouts, the Workspace capsule SHALL occupy its dedicated full-width row and
   the Preset capsule SHALL remain usable in the following row without overflow or overlap.
2. Long Workspace and Preset names SHALL stay within their controls through the existing truncation
   behavior; the topbar SHALL not gain horizontal overflow because of the capsules.
3. In the light theme, the neutral Workspace surface, orange Preset surface, and green status SHALL
   use the existing semantic tokens and remain legible.
4. In the dark theme, the same hierarchy and state distinctions SHALL remain legible against dark
   surfaces, including hover, focus, disabled, and `Read-only` states.
5. Responsive layout changes SHALL preserve the existing topbar action access and SHALL not reorder
   or hide the context semantics in a way that breaks keyboard or screen-reader navigation.

**Acceptance criteria:** Desktop and narrow-browser visual checks show no clipping, overlap, or
loss of hierarchy in both light and dark themes.

## Preservation of behavior and state

The visual change SHALL preserve `activeWorkspaceId`, `activePresetId`, dirty/update state, menu and
manager open state, busy state, theme selection, and all operational data below the topbar. It SHALL
not apply a Preset, reset targets, query Kubernetes, persist a catalog, or alter the `Read-only`
boundary.

## Out of scope

- Changing Workspace or Preset selection, update, manager, menu, or persistence logic.
- Changing the `Read-only` status meaning, health mapping, color semantics, or backend behavior.
- New labels, localization, keyboard shortcuts, context state, or accessibility architecture.
- Changes to the app shell outside the affected topbar context controls and their responsive/theme
  presentation.
- Package/application version bumps, release packaging, commits, tags, or pushes.

## Definition of done

- Workspace and Preset are compact, visually distinct capsules with the specified neutral/orange
  hierarchy, integrated icons, denser typography, and no old vertical divider.
- `Read-only` remains a separate green status indicator.
- Hover, focus, disabled, keyboard, accessible-label, responsive/mobile, and light/dark behavior
  remain usable and legible.
- Existing context actions and all relevant application state remain unchanged.
- Browser visual validation, frontend typecheck, and diff hygiene are recorded.
- The v1.19.0 spec is synchronized across requirements, design, and tasks without changing source,
  package/version, release metadata, or git history.

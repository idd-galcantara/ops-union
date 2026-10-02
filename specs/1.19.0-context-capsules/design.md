# Design - ops-union v1.19.0 context capsules

## Release intent

v1.19.0 refines the topbar's context hierarchy without introducing a new interaction model. The
active Workspace and Preset become compact capsules that read as two related but distinct controls;
`Read-only` remains a separate green application-status signal.

## Ownership boundaries

- `WorkspaceQuickControls` owns the existing semantic buttons, labels, icons, expanded states,
  accessible names, busy/disabled state, and action callbacks.
- `frontend/src/styles/02-shell.css` owns the capsule geometry, density, surfaces, borders, icon
  alignment, hover/focus treatment, and topbar spacing.
- The existing responsive/theme styles own narrow-layout placement and semantic token behavior.
- `App` continues to own health-derived `Read-only` rendering and theme state.
- `@ops-union-frontend` owns the implementation and frontend accessibility/regression checks.
- `@ops-union-integration-qa` owns browser visual, responsive, theme, and interaction validation.
- `repository maintainer` owns specification convergence and release administration only.
- No backend, Kubernetes, persistence, or Electron bridge owner is needed because none of those
  boundaries change.

## Visual contract

The topbar uses one flexible context region containing two controls:

```text
[ Workspace  <active name>  grid icon ]  [ bookmark  Preset  <active name>  chevron ]

                                                     [ theme ] [ green Read-only ]
```

The Workspace control uses `var(--surface-subtle)` with the existing line token and a compact
rounded shape. The Preset control uses `var(--accent-soft)` with an accent-mixed border. Both use
smaller labels and values, retain ellipsis for long names, and align their icons inside the control.
The previous `border-left` relationship is removed; gap and independent capsule surfaces provide
separation instead.

The topbar status remains outside the context capsules. When health is `ok`, its existing green
`status-ok` treatment continues to display `Read-only`; error and loading labels retain their
existing mappings.

## Interaction and state contract

The capsule styling is state-only presentation around existing controls:

- Hover and `:focus-visible` use the existing accent color and border treatment, with no new state
  transition or action.
- Disabled controls keep their current `cursor: wait` and reduced opacity while the owning operation
  is busy.
- Workspace keeps its dialog trigger relationship and `aria-expanded` state.
- Preset keeps its menu trigger relationship, `aria-expanded` state, and `Live search` fallback.
- The dirty Preset update button remains conditional and keeps its existing update callback.
- Decorative Lucide icons remain `aria-hidden`; the buttons remain native buttons with existing
  accessible names.

No state transition is added. Opening a manager/menu, selecting a Preset, updating a dirty Preset,
toggling theme, and reporting health continue through the existing owners. The CSS cannot mutate
active references, live targets, query state, catalog state, or Kubernetes behavior.

## Responsive and theme contract

At desktop widths, the Workspace control flexes within the topbar's centered context region while
Preset keeps a bounded compact width. At widths up to the existing mobile breakpoint, the Workspace
control takes a full row and Preset remains in the next usable row; the topbar actions stay
reachable. Names continue to truncate rather than resize the shell or overlap adjacent controls.

Light and dark themes consume the established semantic surface, line, text, accent, and status
variables. The visual contract is about hierarchy and contrast, not new theme-specific state or
new color literals. Focus, hover, disabled, and green `Read-only` distinctions must remain visible
in both themes.

## Validation contract

The implementation is validated by a browser visual smoke test covering the topbar hierarchy and
narrow layout, plus `npm run typecheck --workspace=frontend` and `git diff --check`. The CSS and
existing `WorkspaceQuickControls` markup are the implementation evidence; no package/version or
source behavior change is expected.

import type { Workspace } from './workspaces';

export type WorkspaceDeleteIntent =
  | { kind: 'workspace'; id: string }
  | { kind: 'selected'; ids: string[] }
  | { kind: 'keep-active-only'; ids: string[]; activeId: string };

export function filterWorkspaces(workspaces: Workspace[], query: string): Workspace[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return workspaces;
  return workspaces.filter((workspace) => [
    workspace.name,
    workspace.description ?? '',
    ...workspace.presets.map((preset) => preset.name),
  ].join(' ').toLowerCase().includes(needle));
}

export function getSelectedVisibleWorkspaceIds(
  workspaces: readonly Workspace[],
  selectedIds: readonly string[],
): string[] {
  return workspaces.filter((workspace) => selectedIds.includes(workspace.id)).map((workspace) => workspace.id);
}

export function areAllVisibleWorkspacesSelected(
  visibleWorkspaces: readonly Workspace[],
  selectedIds: readonly string[],
): boolean {
  return visibleWorkspaces.length > 0
    && getSelectedVisibleWorkspaceIds(visibleWorkspaces, selectedIds).length === visibleWorkspaces.length;
}
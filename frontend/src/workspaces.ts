import type { Preset, PortablePreset } from './presets';
import { loadPresets } from './presets';
import { targetKey, type Target } from './types';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  presets: Preset[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkspaceCatalog {
  version: 1;
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export interface WorkspaceExportDocument {
  format: 'ops-union.workspace';
  version: 1;
  exportedAt: string;
  workspace: {
    name: string;
    description?: string;
  };
  presets: PortablePreset[];
}

export interface WorkspaceBundleExportDocument {
  format: 'ops-union.workspace-bundle';
  version: 1;
  exportedAt: string;
  workspaces: Array<{
    name: string;
    description?: string;
    presets: PortablePreset[];
  }>;
}

export interface InvalidWorkspacePreset {
  index: number;
  name?: string;
  reason: string;
}

export interface WorkspaceImportResult {
  workspaceName?: string;
  description?: string;
  accepted: PortablePreset[];
  invalid: InvalidWorkspacePreset[];
  error?: string;
  suggestedName?: string;
}

export interface WorkspaceImportFileResult {
  workspaces: WorkspaceImportResult[];
  error?: string;
}

export const WORKSPACE_STORAGE_KEY = 'ops-union.workspaces.v1';
export const WORKSPACE_EXPORT_FORMAT = 'ops-union.workspace';
export const WORKSPACE_BUNDLE_EXPORT_FORMAT = 'ops-union.workspace-bundle';
export const WORKSPACE_EXPORT_VERSION = 1;
export const MAX_WORKSPACE_NAME_LENGTH = 100;
export const DEFAULT_WORKSPACE_NAME = 'My Workspace';

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkspace(
  name: string,
  description = '',
  presets: Preset[] = [],
): Workspace {
  const now = new Date().toISOString();
  return {
    id: createLocalId('workspace'),
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    presets,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultWorkspace(presets: Preset[] = []): WorkspaceCatalog {
  const workspace = createWorkspace(DEFAULT_WORKSPACE_NAME, '', presets);
  return { version: 1, workspaces: [workspace], activeWorkspaceId: workspace.id };
}

export function validateWorkspaceName(
  name: string,
  workspaces: Workspace[],
  excludeId?: string,
): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Workspace name is required.';
  if (trimmed.length > MAX_WORKSPACE_NAME_LENGTH) return `Workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`;
  const normalized = trimmed.toLocaleLowerCase();
  if (workspaces.some((workspace) => workspace.id !== excludeId && workspace.name.toLocaleLowerCase() === normalized)) {
    return `Workspace name "${trimmed}" is already in use.`;
  }
  return undefined;
}

export function findWorkspace(catalog: WorkspaceCatalog, id: string): Workspace | undefined {
  return catalog.workspaces.find((workspace) => workspace.id === id);
}

export function activeWorkspace(catalog: WorkspaceCatalog): Workspace {
  return findWorkspace(catalog, catalog.activeWorkspaceId) ?? catalog.workspaces[0];
}

export function serializeWorkspace(
  workspace: Workspace,
  exportedAt = new Date().toISOString(),
): string {
  const document: WorkspaceExportDocument = {
    format: WORKSPACE_EXPORT_FORMAT,
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt,
    workspace: {
      name: workspace.name.trim(),
      ...(workspace.description?.trim() ? { description: workspace.description.trim() } : {}),
    },
    presets: workspace.presets.map(toPortablePreset),
  };
  return JSON.stringify(document, null, 2);
}

export function serializeWorkspaceBundle(
  workspaces: Workspace[],
  exportedAt = new Date().toISOString(),
): string {
  const document: WorkspaceBundleExportDocument = {
    format: WORKSPACE_BUNDLE_EXPORT_FORMAT,
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt,
    workspaces: workspaces.map((workspace) => ({
      name: workspace.name.trim(),
      ...(workspace.description?.trim() ? { description: workspace.description.trim() } : {}),
      presets: workspace.presets.map(toPortablePreset),
    })),
  };
  return JSON.stringify(document, null, 2);
}

function toPortablePreset(preset: Preset): PortablePreset {
  return {
    name: preset.name.trim(),
    ...(preset.description?.trim() ? { description: preset.description.trim() } : {}),
    targets: normalizeTargets(preset.targets),
  };
}

export function parseWorkspaceImport(raw: string): WorkspaceImportResult {
  const file = parseWorkspaceImportFile(raw);
  return file.workspaces[0] ?? emptyWorkspaceImport(file.error ?? 'The Workspace document contains no workspaces.');
}

export function parseWorkspaceImportFile(raw: string): WorkspaceImportFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { workspaces: [], error: 'The selected file is not valid JSON.' };
  }

  if (!isRecord(parsed)) {
    return { workspaces: [], error: `Unsupported Workspace document. Expected format "${WORKSPACE_EXPORT_FORMAT}".` };
  }

  if (parsed.format === WORKSPACE_EXPORT_FORMAT) {
    const error = validateExportMetadata(parsed);
    if (error) return { workspaces: [], error };
    return { workspaces: [parseWorkspacePayload(parsed)] };
  }

  if (parsed.format === WORKSPACE_BUNDLE_EXPORT_FORMAT) {
    const error = validateExportMetadata(parsed);
    if (error) return { workspaces: [], error };
    if (!Array.isArray(parsed.workspaces) || parsed.workspaces.length === 0) {
      return { workspaces: [], error: 'The Workspace bundle does not contain any workspaces.' };
    }
    return {
      workspaces: parsed.workspaces.map((workspace) => parseWorkspacePayload({
        workspace,
        presets: isRecord(workspace) ? workspace.presets : undefined,
      })),
    };
  }

  return { workspaces: [], error: `Unsupported Workspace document. Expected format "${WORKSPACE_EXPORT_FORMAT}".` };
}

function validateExportMetadata(value: Record<string, unknown>): string | undefined {
  if (value.version !== WORKSPACE_EXPORT_VERSION) {
    return `Unsupported Workspace document version: ${String(value.version)}.`;
  }
  if (typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) {
    return 'The Workspace document has an invalid exportedAt timestamp.';
  }
  return undefined;
}

function parseWorkspacePayload(value: Record<string, unknown>): WorkspaceImportResult {
  if (!isRecord(value.workspace) || typeof value.workspace.name !== 'string' || !value.workspace.name.trim()) {
    return emptyWorkspaceImport('The Workspace document is missing a valid workspace name.');
  }
  if (value.workspace.description !== undefined && typeof value.workspace.description !== 'string') {
    return emptyWorkspaceImport('Workspace description must be a string when provided.');
  }
  if (!Array.isArray(value.presets)) {
    return emptyWorkspaceImport('The Workspace document is missing its presets array.');
  }

  const accepted: PortablePreset[] = [];
  const invalid: InvalidWorkspacePreset[] = [];
  value.presets.forEach((preset, index) => {
    const result = normalizeImportedPreset(preset, index);
    if ('invalid' in result) invalid.push(result.invalid);
    else accepted.push(result.preset);
  });

  const workspaceName = value.workspace.name.trim();
  return {
    workspaceName,
    ...(typeof value.workspace.description === 'string' && value.workspace.description.trim()
      ? { description: value.workspace.description.trim() }
      : {}),
    accepted,
    invalid,
    suggestedName: workspaceName,
  };
}

function emptyWorkspaceImport(error: string): WorkspaceImportResult {
  return { accepted: [], invalid: [], error };
}

function normalizeImportedPreset(
  value: unknown,
  index: number,
): { preset: PortablePreset } | { invalid: InvalidWorkspacePreset } {
  if (!isRecord(value)) return { invalid: { index, reason: 'Preset entry must be an object.' } };
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) return { invalid: { index, reason: 'Preset name must be a non-empty string.' } };
  if (value.description !== undefined && typeof value.description !== 'string') {
    return { invalid: { index, name, reason: 'Preset description must be a string when provided.' } };
  }
  if (!Array.isArray(value.targets)) {
    return { invalid: { index, name, reason: 'Preset targets must be an array.' } };
  }
  const invalidTarget = value.targets.some((target) => {
    if (!isRecord(target) || typeof target.cluster !== 'string' || typeof target.namespace !== 'string') return true;
    return !target.cluster.trim() || !target.namespace.trim();
  });
  if (invalidTarget) {
    return { invalid: { index, name, reason: 'Preset contains an invalid target; each target needs a cluster and namespace.' } };
  }
  const targets = normalizeTargets(value.targets);
  if (targets.length === 0) {
    return { invalid: { index, name, reason: 'Preset must contain at least one target.' } };
  }
  return {
    preset: {
      name,
      ...(typeof value.description === 'string' && value.description.trim()
        ? { description: value.description.trim() }
        : {}),
      targets,
    },
  };
}

function normalizeTargets(value: unknown): Target[] {
  if (!Array.isArray(value)) return [];
  return [...new Map(value.map((target) => ({
    target,
    key: isRecord(target) && typeof target.cluster === 'string' && typeof target.namespace === 'string'
      ? targetKey({ cluster: target.cluster.trim(), namespace: target.namespace.trim() })
      : '',
  })).filter(({ key }) => key).map(({ target, key }) => {
    const item = target as { cluster: string; namespace: string };
    return [key, { cluster: item.cluster.trim(), namespace: item.namespace.trim() } as Target];
  })).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePreset(value: unknown): Preset | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.targets)) return null;
  if (value.description !== undefined && typeof value.description !== 'string') return null;
  if (value.lastUsedAt !== undefined && (typeof value.lastUsedAt !== 'number' || !Number.isFinite(value.lastUsedAt) || value.lastUsedAt < 0)) return null;
  const targets = normalizeTargets(value.targets);
  if (targets.length === 0) return null;
  return {
    id: value.id,
    name: value.name,
    ...(typeof value.description === 'string' && value.description.trim() ? { description: value.description } : {}),
    targets,
    ...(typeof value.lastUsedAt === 'number' ? { lastUsedAt: value.lastUsedAt } : {}),
  };
}

function normalizeWorkspace(value: unknown): Workspace | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.presets)) return null;
  const presets = value.presets.map(normalizePreset).filter((preset): preset is Preset => preset !== null);
  return {
    id: value.id,
    name: value.name.trim(),
    ...(typeof value.description === 'string' && value.description.trim() ? { description: value.description.trim() } : {}),
    presets,
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

function normalizeCatalog(value: unknown): WorkspaceCatalog | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) return null;
  const workspaces = value.workspaces.map(normalizeWorkspace).filter((workspace): workspace is Workspace => workspace !== null && Boolean(workspace.name));
  if (workspaces.length === 0) return null;
  const activeId = typeof value.activeWorkspaceId === 'string' && workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)
    ? value.activeWorkspaceId
    : workspaces[0].id;
  return { version: 1, workspaces, activeWorkspaceId: activeId };
}

function catalogFromLegacy(value: unknown): WorkspaceCatalog {
  const presets = Array.isArray(value)
    ? value.map(normalizePreset).filter((preset): preset is Preset => preset !== null)
    : [];
  return createDefaultWorkspace(presets);
}

export function getInitialWorkspaceCatalog(): WorkspaceCatalog {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const parsed = raw ? normalizeCatalog(JSON.parse(raw) as unknown) : null;
    if (parsed) return parsed;
  } catch {
    // Fall through to legacy migration or a fresh default catalog.
  }
  return catalogFromLegacy(loadPresets());
}

export async function loadWorkspaceCatalog(): Promise<WorkspaceCatalog> {
  if (typeof window !== 'undefined' && window.opsFlowDesktop) {
    try {
      const value = await window.opsFlowDesktop.loadPresets();
      const catalog = normalizeCatalog(value);
      if (catalog) return catalog;
      const migrated = catalogFromLegacy(value);
      persistWorkspaceCatalog(migrated);
      return migrated;
    } catch {
      return getInitialWorkspaceCatalog();
    }
  }
  const catalog = getInitialWorkspaceCatalog();
  persistWorkspaceCatalog(catalog);
  return catalog;
}

export function persistWorkspaceCatalog(catalog: WorkspaceCatalog): void {
  const serialized = JSON.stringify(catalog);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized);
  } catch {
    // Keep the last in-memory catalog; callers retain the existing local error behavior.
  }
  if (typeof window !== 'undefined' && window.opsFlowDesktop) {
    void window.opsFlowDesktop.savePresets(catalog).catch(() => undefined);
  }
}

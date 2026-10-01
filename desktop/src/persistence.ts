import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredPreset {
  id: string;
  name: string;
  description?: string;
  targets: Array<{ cluster: string; namespace: string }>;
  lastUsedAt?: number;
}

export interface StoredWorkspace {
  id: string;
  name: string;
  description?: string;
  presets: StoredPreset[];
  createdAt?: string;
  updatedAt?: string;
}

export interface StoredWorkspaceCatalog {
  version: 1;
  workspaces: StoredWorkspace[];
  activeWorkspaceId: string;
}

export type Theme = 'light' | 'dark';

export interface StoredPreferences {
  selectedKubeconfigPath?: string;
  theme?: Theme;
}

export interface DesktopPersistence {
  readPresets(): Promise<unknown>;
  savePresets(value: unknown): Promise<void>;
  readTheme(): Promise<Theme | null>;
  saveTheme(theme: unknown): Promise<void>;
  readSelectedKubeconfigPath(): Promise<string | undefined>;
  saveSelectedKubeconfigPath(selectedPath: string): Promise<void>;
  clearSelectedKubeconfigPath(): Promise<void>;
}

export function isStoredPreset(value: unknown): value is StoredPreset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    targets?: unknown;
    lastUsedAt?: unknown;
  };
  return typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.description === undefined || typeof candidate.description === 'string') &&
    (candidate.lastUsedAt === undefined ||
      (typeof candidate.lastUsedAt === 'number' &&
        Number.isFinite(candidate.lastUsedAt) &&
        candidate.lastUsedAt >= 0)) &&
    Array.isArray(candidate.targets) &&
    candidate.targets.every((target) => {
      if (!target || typeof target !== 'object') return false;
      const item = target as { cluster?: unknown; namespace?: unknown };
      return typeof item.cluster === 'string' && typeof item.namespace === 'string';
    });
}

export function isStoredWorkspace(value: unknown): value is StoredWorkspace {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    presets?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  return typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.description === undefined || typeof candidate.description === 'string') &&
    (candidate.createdAt === undefined || typeof candidate.createdAt === 'string') &&
    (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string') &&
    Array.isArray(candidate.presets) && candidate.presets.every(isStoredPreset);
}

export function isStoredWorkspaceCatalog(value: unknown): value is StoredWorkspaceCatalog {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { version?: unknown; workspaces?: unknown; activeWorkspaceId?: unknown };
  return candidate.version === 1 &&
    typeof candidate.activeWorkspaceId === 'string' &&
    Array.isArray(candidate.workspaces) &&
    candidate.workspaces.length > 0 &&
    candidate.workspaces.every(isStoredWorkspace);
}

async function writeAtomically(file: string, value: unknown): Promise<void> {
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryFile, file);
}

export function createDesktopPersistence(userDataPath: string): DesktopPersistence {
  const preferencesFile = path.join(userDataPath, 'preferences.json');
  const presetsFile = path.join(userDataPath, 'presets.json');

  async function readPreferences(): Promise<StoredPreferences> {
    try {
      const contents = await readFile(preferencesFile, 'utf8');
      const parsed: unknown = JSON.parse(contents);
      if (!parsed || typeof parsed !== 'object') return {};
      const candidate = parsed as { selectedKubeconfigPath?: unknown; theme?: unknown };
      return {
        ...(typeof candidate.selectedKubeconfigPath === 'string' && candidate.selectedKubeconfigPath.trim()
          ? { selectedKubeconfigPath: candidate.selectedKubeconfigPath.trim() }
          : {}),
        ...(candidate.theme === 'light' || candidate.theme === 'dark' ? { theme: candidate.theme } : {}),
      };
    } catch {
      return {};
    }
  }

  async function writePreferences(update: Partial<StoredPreferences>): Promise<void> {
    const current = await readPreferences();
    await writeAtomically(preferencesFile, { ...current, ...update });
  }

  return {
    async readPresets(): Promise<unknown> {
      try {
        const contents = await readFile(presetsFile, 'utf8');
        const parsed: unknown = JSON.parse(contents);
        if (isStoredWorkspaceCatalog(parsed)) return parsed;
        return Array.isArray(parsed) ? parsed.filter(isStoredPreset) : [];
      } catch {
        return [];
      }
    },

    async savePresets(value: unknown): Promise<void> {
      if ((!Array.isArray(value) || !value.every(isStoredPreset)) && !isStoredWorkspaceCatalog(value)) {
        throw new Error('Invalid presets.');
      }
      await writeAtomically(presetsFile, value);
    },

    async readTheme(): Promise<Theme | null> {
      const preferences = await readPreferences();
      return preferences.theme ?? null;
    },

    async saveTheme(theme: unknown): Promise<void> {
      if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid theme.');
      await writePreferences({ theme });
    },

    async readSelectedKubeconfigPath(): Promise<string | undefined> {
      return (await readPreferences()).selectedKubeconfigPath;
    },

    async saveSelectedKubeconfigPath(selectedPath: string): Promise<void> {
      await writePreferences({ selectedKubeconfigPath: selectedPath });
    },

    async clearSelectedKubeconfigPath(): Promise<void> {
      let preferences: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(await readFile(preferencesFile, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          preferences = { ...(parsed as Record<string, unknown>) };
        }
      } catch {
        preferences = {};
      }
      delete preferences.selectedKubeconfigPath;
      await writeAtomically(preferencesFile, preferences);
    },
  };
}
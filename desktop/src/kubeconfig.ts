import type { BrowserWindow } from 'electron';

import type { DesktopPersistence } from './persistence';

export interface KubeConfigStatus {
  available: boolean;
  source: 'environment' | 'selected' | 'default';
  contextCount?: number;
}

export interface SelectionResult {
  cancelled: boolean;
  status?: KubeConfigStatus;
  error?: string;
}

export interface ResetResult {
  status?: KubeConfigStatus;
  error?: string;
}

interface DialogSelection {
  canceled: boolean;
  filePaths: string[];
}

export interface KubeconfigDependencies {
  getMainWindow(): BrowserWindow | null;
  getBackendPort(): number | null;
  getInternalToken(): string;
  showOpenDialog(window: BrowserWindow, options: { title: string; properties: ['openFile'] }): Promise<DialogSelection>;
  persistence: Pick<DesktopPersistence, 'saveSelectedKubeconfigPath' | 'clearSelectedKubeconfigPath'>;
  fetchImpl?: typeof fetch;
}

export function isKubeConfigStatus(value: unknown): value is KubeConfigStatus {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { available?: unknown; source?: unknown; contextCount?: unknown };
  return typeof candidate.available === 'boolean' &&
    (candidate.source === 'environment' || candidate.source === 'selected' || candidate.source === 'default') &&
    (candidate.contextCount === undefined ||
      (typeof candidate.contextCount === 'number' &&
        Number.isInteger(candidate.contextCount) &&
        candidate.contextCount >= 0));
}

export function mapKubeConfigStatus(value: unknown): KubeConfigStatus {
  if (!isKubeConfigStatus(value)) throw new Error('Invalid kubeconfig status.');
  return value;
}

export function createKubeconfigHandlers(dependencies: KubeconfigDependencies) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  async function selectKubeconfig(): Promise<SelectionResult> {
    const mainWindow = dependencies.getMainWindow();
    const backendPort = dependencies.getBackendPort();
    const internalToken = dependencies.getInternalToken();
    if (!mainWindow || backendPort === null || !internalToken) {
      return { cancelled: false, error: 'The desktop backend is not ready.' };
    }

    const selection = await dependencies.showOpenDialog(mainWindow, {
      title: 'Select kubeconfig',
      properties: ['openFile'],
    });
    if (selection.canceled || selection.filePaths.length === 0) return { cancelled: true };

    try {
      const response = await fetchImpl(`http://127.0.0.1:${backendPort}/api/kubeconfig/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ops-union-Token': internalToken,
        },
        body: JSON.stringify({ path: selection.filePaths[0] }),
      });
      if (!response.ok) return { cancelled: false, error: 'Could not read the selected kubeconfig.' };

      const status = mapKubeConfigStatus(await response.json());
      try {
        await dependencies.persistence.saveSelectedKubeconfigPath(selection.filePaths[0]);
        return { cancelled: false, status };
      } catch {
        return {
          cancelled: false,
          status,
          error: 'Kubeconfig selected for this session, but the preference could not be saved.',
        };
      }
    } catch {
      return { cancelled: false, error: 'Could not connect to the local backend.' };
    }
  }

  async function resetKubeconfig(): Promise<ResetResult> {
    const backendPort = dependencies.getBackendPort();
    const internalToken = dependencies.getInternalToken();
    if (backendPort === null || !internalToken) {
      return { error: 'The desktop backend is not ready.' };
    }

    try {
      const response = await fetchImpl(`http://127.0.0.1:${backendPort}/api/kubeconfig/reset`, {
        method: 'POST',
        headers: { 'X-ops-union-Token': internalToken },
      });
      if (!response.ok) return { error: 'Could not reset the kubeconfig.' };

      const status = mapKubeConfigStatus(await response.json());
      try {
        await dependencies.persistence.clearSelectedKubeconfigPath();
        return { status };
      } catch {
        return {
          status,
          error: 'Kubeconfig reset for this session, but the preference could not be updated.',
        };
      }
    } catch {
      return { error: 'Could not connect to the local backend.' };
    }
  }

  return { selectKubeconfig, resetKubeconfig };
}
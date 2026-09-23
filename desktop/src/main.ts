import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { startBackend, stopBackend, waitForBackend } from './backendProcess';

interface KubeConfigStatus {
  available: boolean;
  source: 'environment' | 'selected' | 'default';
  contextCount?: number;
}

interface SelectionResult {
  cancelled: boolean;
  status?: KubeConfigStatus;
  error?: string;
}

interface ResetResult {
  status?: KubeConfigStatus;
  error?: string;
}

interface StoredPreset {
  id: string;
  name: string;
  targets: Array<{ cluster: string; namespace: string }>;
  lastUsedAt?: number;
}

type Theme = 'light' | 'dark';

interface StoredPreferences {
  selectedKubeconfigPath?: string;
  theme?: Theme;
}

let mainWindow: BrowserWindow | null = null;
let backendProcess: ReturnType<typeof startBackend> | null = null;
let shuttingDown = false;
let backendPort: number | null = null;
let internalToken = '';

function preferencesFile(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function presetsFile(): string {
  return path.join(app.getPath('userData'), 'presets.json');
}

function isStoredPreset(value: unknown): value is StoredPreset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    id?: unknown;
    name?: unknown;
    targets?: unknown;
    lastUsedAt?: unknown;
  };
  return typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
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

async function readPresets(): Promise<StoredPreset[]> {
  try {
    const contents = await readFile(presetsFile(), 'utf8');
    const parsed: unknown = JSON.parse(contents);
    return Array.isArray(parsed) ? parsed.filter(isStoredPreset) : [];
  } catch {
    return [];
  }
}

async function savePresets(value: unknown): Promise<void> {
  if (!Array.isArray(value) || !value.every(isStoredPreset)) {
    throw new Error('Invalid presets.');
  }
  await writeFile(presetsFile(), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readPreferences(): Promise<StoredPreferences> {
  try {
    const contents = await readFile(preferencesFile(), 'utf8');
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
  await writeFile(preferencesFile(), `${JSON.stringify({ ...current, ...update }, null, 2)}\n`, 'utf8');
}

async function readTheme(): Promise<Theme | null> {
  const preferences = await readPreferences();
  return preferences.theme ?? null;
}

async function saveTheme(theme: unknown): Promise<void> {
  if (theme !== 'light' && theme !== 'dark') throw new Error('Invalid theme.');
  await writePreferences({ theme });
}

async function readSelectedKubeconfigPath(): Promise<string | undefined> {
  return (await readPreferences()).selectedKubeconfigPath;
}

async function saveSelectedKubeconfigPath(selectedPath: string): Promise<void> {
  await writePreferences({ selectedKubeconfigPath: selectedPath });
}

async function clearSelectedKubeconfigPath(): Promise<void> {
  let preferences: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(await readFile(preferencesFile(), 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      preferences = { ...(parsed as Record<string, unknown>) };
    }
  } catch {
    preferences = {};
  }
  delete preferences.selectedKubeconfigPath;
  await writeFile(preferencesFile(), `${JSON.stringify(preferences, null, 2)}\n`, 'utf8');
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a local port.')));
        return;
      }
      probe.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function projectRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.resolve(app.getAppPath(), '..');
}

async function closeBackend(): Promise<void> {
  await stopBackend(backendProcess);
  backendProcess = null;
}

async function shutdownApplication(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await closeBackend();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  } else {
    app.quit();
  }
}

async function createMainWindow(): Promise<void> {
  const root = projectRoot();
  const frontendDist = app.isPackaged
    ? path.join(root, 'frontend')
    : path.join(root, 'frontend', 'dist');
  const port = await availablePort();
  const selectedKubeconfigPath = await readSelectedKubeconfigPath();
  backendPort = port;
  internalToken = randomBytes(32).toString('hex');

  backendProcess = startBackend({
    projectRoot: root,
    frontendDist,
    port,
    internalToken,
    selectedKubeconfigPath,
  });
  await waitForBackend(port);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.on('close', (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    void shutdownApplication();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function selectKubeconfig(): Promise<SelectionResult> {
  if (!mainWindow || backendPort === null || !internalToken) {
    return { cancelled: false, error: 'The desktop backend is not ready.' };
  }

  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Select kubeconfig',
    properties: ['openFile'],
  });
  if (selection.canceled || selection.filePaths.length === 0) return { cancelled: true };

  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/api/kubeconfig/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ops-union-Token': internalToken,
      },
      body: JSON.stringify({ path: selection.filePaths[0] }),
    });
    if (!response.ok) return { cancelled: false, error: 'Could not read the selected kubeconfig.' };

    const status = (await response.json()) as KubeConfigStatus;
    try {
      await saveSelectedKubeconfigPath(selection.filePaths[0]);
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
  if (backendPort === null || !internalToken) {
    return { error: 'The desktop backend is not ready.' };
  }

  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/api/kubeconfig/reset`, {
      method: 'POST',
      headers: { 'X-ops-union-Token': internalToken },
    });
    if (!response.ok) return { error: 'Could not reset the kubeconfig.' };

    const status = (await response.json()) as KubeConfigStatus;
    try {
      await clearSelectedKubeconfigPath();
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

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  process.once('SIGINT', () => void shutdownApplication());
  process.once('SIGTERM', () => void shutdownApplication());
  ipcMain.handle('select-kubeconfig', selectKubeconfig);
  ipcMain.handle('reset-kubeconfig', resetKubeconfig);
  ipcMain.handle('load-theme', readTheme);
  ipcMain.handle('save-theme', (_event, theme: unknown) => saveTheme(theme));
  ipcMain.handle('load-presets', readPresets);
  ipcMain.handle('save-presets', (_event, value: unknown) => savePresets(value));

  app.whenReady().then(async () => {
    try {
      await createMainWindow();
    } catch (error) {
      await closeBackend();
      dialog.showErrorBox(
        'Could not start ops-union',
        error instanceof Error ? error.message : 'The desktop application could not start.',
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
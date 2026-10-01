import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';

import { startBackend, stopBackend, waitForBackend } from './backendProcess';
import type { DesktopPersistence } from './persistence';

export interface DesktopRuntime {
  getMainWindow(): BrowserWindow | null;
  getBackendPort(): number | null;
  getInternalToken(): string;
  createMainWindow(): Promise<void>;
  closeBackend(): Promise<void>;
  shutdownApplication(): Promise<void>;
}

export function createDesktopRuntime(persistence: DesktopPersistence, preloadPath: string): DesktopRuntime {
  let mainWindow: BrowserWindow | null = null;
  let backendProcess: ReturnType<typeof startBackend> | null = null;
  let shuttingDown = false;
  let backendPort: number | null = null;
  let internalToken = '';

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
    const selectedKubeconfigPath = await persistence.readSelectedKubeconfigPath();
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
        preload: preloadPath,
      },
    });

    const rendererOrigin = `http://127.0.0.1:${port}`;
    mainWindow.webContents.on('will-navigate', (event, url) => {
      try {
        const target = new URL(url);
        const expected = new URL(rendererOrigin);
        if (
          target.protocol !== expected.protocol
          || target.hostname !== expected.hostname
          || target.port !== expected.port
          || target.pathname !== expected.pathname
          || target.username
          || target.password
        ) event.preventDefault();
      } catch {
        event.preventDefault();
      }
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
    await mainWindow.loadURL(rendererOrigin);
  }

  return {
    getMainWindow: () => mainWindow,
    getBackendPort: () => backendPort,
    getInternalToken: () => internalToken,
    createMainWindow,
    closeBackend,
    shutdownApplication,
  };
}
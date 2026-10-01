import { app, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { createKubeconfigHandlers } from './kubeconfig';
import { registerIpcHandlers } from './ipc';
import { createDesktopPersistence } from './persistence';
import { createDesktopRuntime } from './runtime';

const hasLock = app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  const persistence = createDesktopPersistence(app.getPath('userData'));
  const runtime = createDesktopRuntime(persistence, path.join(__dirname, 'preload.js'));
  const kubeconfigHandlers = createKubeconfigHandlers({
    getMainWindow: runtime.getMainWindow,
    getBackendPort: runtime.getBackendPort,
    getInternalToken: runtime.getInternalToken,
    showOpenDialog: (window, options) => dialog.showOpenDialog(window, options),
    persistence,
  });

  app.on('second-instance', () => {
    const mainWindow = runtime.getMainWindow();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  process.once('SIGINT', () => void runtime.shutdownApplication());
  process.once('SIGTERM', () => void runtime.shutdownApplication());
  registerIpcHandlers(ipcMain, kubeconfigHandlers, persistence);

  app.whenReady().then(async () => {
    try {
      await runtime.createMainWindow();
    } catch (error) {
      await runtime.closeBackend();
      dialog.showErrorBox(
        'Could not start ops-union',
        error instanceof Error ? error.message : 'The desktop application could not start.',
      );
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}
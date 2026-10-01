import type { IpcMain } from 'electron';

import type { ResetResult, SelectionResult } from './kubeconfig';
import type { DesktopPersistence } from './persistence';

export interface DesktopIpcHandlers {
  selectKubeconfig(): Promise<SelectionResult>;
  resetKubeconfig(): Promise<ResetResult>;
}

export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  handlers: DesktopIpcHandlers,
  persistence: DesktopPersistence,
): void {
  ipcMain.handle('select-kubeconfig', handlers.selectKubeconfig);
  ipcMain.handle('reset-kubeconfig', handlers.resetKubeconfig);
  ipcMain.handle('load-theme', () => persistence.readTheme());
  ipcMain.handle('save-theme', (_event, theme: unknown) => persistence.saveTheme(theme));
  ipcMain.handle('load-presets', () => persistence.readPresets());
  ipcMain.handle('save-presets', (_event, value: unknown) => persistence.savePresets(value));
}
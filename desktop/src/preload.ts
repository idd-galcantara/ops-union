import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('opsFlowDesktop', {
  isDesktop: true,
  platform: process.platform,
  selectKubeconfig: (): Promise<unknown> => ipcRenderer.invoke('select-kubeconfig'),
  resetKubeconfig: (): Promise<unknown> => ipcRenderer.invoke('reset-kubeconfig'),
  loadTheme: (): Promise<'light' | 'dark' | null> => ipcRenderer.invoke('load-theme'),
  saveTheme: (theme: 'light' | 'dark'): Promise<void> => ipcRenderer.invoke('save-theme', theme),
  loadPresets: (): Promise<unknown> => ipcRenderer.invoke('load-presets'),
  savePresets: (presets: unknown): Promise<void> => ipcRenderer.invoke('save-presets', presets),
});
import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  isElectron: true,
  platform: process.platform,

  // Native File Dialogs
  openPdfDialog: async (): Promise<{ name: string; path: string; data: ArrayBuffer } | null> => {
    return await ipcRenderer.invoke("dialog:open-pdf");
  },

  savePdfDialog: async (
    defaultName: string,
    arrayBuffer: ArrayBuffer
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return await ipcRenderer.invoke("dialog:save-pdf", defaultName, arrayBuffer);
  },

  // Window Controls for Windows 11/10 Titlebar
  minimizeWindow: () => {
    ipcRenderer.send("window:minimize");
  },

  maximizeWindow: () => {
    ipcRenderer.send("window:maximize");
  },

  closeWindow: () => {
    ipcRenderer.send("window:close");
  },

  isMaximized: async (): Promise<boolean> => {
    return await ipcRenderer.invoke("window:is-maximized");
  },

  onWindowStateChanged: (callback: (state: { isMaximized: boolean }) => void) => {
    const subscription = (_event: any, state: { isMaximized: boolean }) => callback(state);
    ipcRenderer.on("electron:window-state-changed", subscription);
    return () => {
      ipcRenderer.removeListener("electron:window-state-changed", subscription);
    };
  },

  // Events when a PDF file is opened externally (e.g. double-click in Windows Explorer)
  onOpenFile: (callback: (payload: { name: string; path?: string; data: ArrayBuffer }) => void) => {
    const subscription = (_event: any, payload: { name: string; path?: string; data: ArrayBuffer }) => {
      callback(payload);
    };
    ipcRenderer.on("electron:open-file", subscription);
    return () => {
      ipcRenderer.removeListener("electron:open-file", subscription);
    };
  },

  // Application Menu action triggers
  onMenuTrigger: (channel: string, callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  // Utilities
  fetchCleanArticle: async (
    url: string
  ): Promise<{ ok: boolean; article?: any; error?: string; status?: number }> => {
    return await ipcRenderer.invoke("article:fetch", url);
  },

  openExternal: (url: string) => {
    ipcRenderer.send("shell:open-external", url);
  },

  getVersion: async (): Promise<string> => {
    return await ipcRenderer.invoke("app:get-version");
  },

  getPlatform: async (): Promise<string> => {
    return await ipcRenderer.invoke("app:get-platform");
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

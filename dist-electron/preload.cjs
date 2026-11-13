// electron/preload.ts
var import_electron = require("electron");
var electronAPI = {
  isElectron: true,
  platform: process.platform,
  // Native File Dialogs
  openPdfDialog: async () => {
    return await import_electron.ipcRenderer.invoke("dialog:open-pdf");
  },
  savePdfDialog: async (defaultName, arrayBuffer) => {
    return await import_electron.ipcRenderer.invoke("dialog:save-pdf", defaultName, arrayBuffer);
  },
  // Window Controls for Windows 11/10 Titlebar
  minimizeWindow: () => {
    import_electron.ipcRenderer.send("window:minimize");
  },
  maximizeWindow: () => {
    import_electron.ipcRenderer.send("window:maximize");
  },
  closeWindow: () => {
    import_electron.ipcRenderer.send("window:close");
  },
  isMaximized: async () => {
    return await import_electron.ipcRenderer.invoke("window:is-maximized");
  },
  onWindowStateChanged: (callback) => {
    const subscription = (_event, state) => callback(state);
    import_electron.ipcRenderer.on("electron:window-state-changed", subscription);
    return () => {
      import_electron.ipcRenderer.removeListener("electron:window-state-changed", subscription);
    };
  },
  // Events when a PDF file is opened externally (e.g. double-click in Windows Explorer)
  onOpenFile: (callback) => {
    const subscription = (_event, payload) => {
      callback(payload);
    };
    import_electron.ipcRenderer.on("electron:open-file", subscription);
    return () => {
      import_electron.ipcRenderer.removeListener("electron:open-file", subscription);
    };
  },
  // Application Menu action triggers
  onMenuTrigger: (channel, callback) => {
    const subscription = () => callback();
    import_electron.ipcRenderer.on(channel, subscription);
    return () => {
      import_electron.ipcRenderer.removeListener(channel, subscription);
    };
  },
  // Utilities
  openExternal: (url) => {
    import_electron.ipcRenderer.send("shell:open-external", url);
  },
  getVersion: async () => {
    return await import_electron.ipcRenderer.invoke("app:get-version");
  },
  getPlatform: async () => {
    return await import_electron.ipcRenderer.invoke("app:get-platform");
  }
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);

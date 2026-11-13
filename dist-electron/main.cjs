var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var mainWindow = null;
var fileToOpenOnStartup = null;
function getPdfArg(argv) {
  for (const arg of argv) {
    if (arg && arg.toLowerCase().endsWith(".pdf") && import_fs.default.existsSync(arg)) {
      return arg;
    }
  }
  return null;
}
fileToOpenOnStartup = getPdfArg(process.argv.slice(1));
var gotTheLock = import_electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  import_electron.app.quit();
} else {
  import_electron.app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const secondFile = getPdfArg(commandLine);
      if (secondFile) {
        sendFileToRenderer(secondFile);
      }
    }
  });
}
async function sendFileToRenderer(filePath) {
  if (!mainWindow || !import_fs.default.existsSync(filePath)) return;
  try {
    const fileName = import_path.default.basename(filePath);
    const buffer = await import_fs.default.promises.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    mainWindow.webContents.send("electron:open-file", {
      name: fileName,
      path: filePath,
      data: arrayBuffer
    });
  } catch (err) {
    console.error("Failed to read file from argument:", err);
  }
}
function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    {
      label: "&Berkas",
      submenu: [
        {
          label: "Buka Dokumen PDF...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            if (!mainWindow) return;
            const result = await import_electron.dialog.showOpenDialog(mainWindow, {
              title: "Buka Dokumen PDF - VOXReader",
              properties: ["openFile"],
              filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              await sendFileToRenderer(result.filePaths[0]);
            }
          }
        },
        {
          label: "Simpan Salinan Dokumen...",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow?.webContents.send("menu:trigger-save");
          }
        },
        { type: "separator" },
        {
          label: "Cetak Dokumen...",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            mainWindow?.webContents.print();
          }
        },
        { type: "separator" },
        {
          label: "Keluar dari VOXReader",
          accelerator: isMac ? "Cmd+Q" : "Alt+F4",
          click: () => {
            import_electron.app.quit();
          }
        }
      ]
    },
    {
      label: "&Tampilan",
      submenu: [
        {
          label: "Perbesar (Zoom In)",
          accelerator: "CmdOrCtrl+Plus",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-in");
          }
        },
        {
          label: "Perkecil (Zoom Out)",
          accelerator: "CmdOrCtrl+-",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-out");
          }
        },
        {
          label: "Ukuran Asli (100%)",
          accelerator: "CmdOrCtrl+0",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-reset");
          }
        },
        { type: "separator" },
        {
          label: "Layar Penuh (Full Screen)",
          accelerator: "F11",
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        },
        {
          label: "Buka Alat Pengembang (DevTools)",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: "&Dokumen",
      submenu: [
        {
          label: "Halaman Berikutnya",
          accelerator: "PageDown",
          click: () => mainWindow?.webContents.send("menu:next-page")
        },
        {
          label: "Halaman Sebelumnya",
          accelerator: "PageUp",
          click: () => mainWindow?.webContents.send("menu:prev-page")
        },
        {
          label: "Halaman Pertama",
          accelerator: "Home",
          click: () => mainWindow?.webContents.send("menu:first-page")
        },
        {
          label: "Halaman Terakhir",
          accelerator: "End",
          click: () => mainWindow?.webContents.send("menu:last-page")
        }
      ]
    },
    {
      label: "&Alat AI",
      submenu: [
        {
          label: "Percakapan Suara AI",
          accelerator: "CmdOrCtrl+Shift+V",
          click: () => mainWindow?.webContents.send("menu:open-live-voice")
        },
        {
          label: "Analisis Halaman AI",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => mainWindow?.webContents.send("menu:open-ai-chat")
        },
        {
          label: "Pengaturan Gemini AI...",
          click: () => mainWindow?.webContents.send("menu:open-gemini-settings")
        }
      ]
    },
    {
      label: "&Bantuan",
      submenu: [
        {
          label: "Tentang VOXReader Windows...",
          click: () => {
            import_electron.dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Tentang VOXReader",
              message: "VOXReader v1.0.0",
              detail: "Aplikasi pembaca PDF Windows modern berbasis Electron.\nDilengkapi dengan mode malam nyaman, Gemini Flash TTS AI, analisis dokumen cerdas, dan penyimpanan offline.",
              buttons: ["Tutup"]
            });
          }
        },
        {
          label: "Dokumentasi & GitHub",
          click: () => {
            import_electron.shell.openExternal("https://github.com");
          }
        }
      ]
    }
  ];
  const menu = import_electron.Menu.buildFromTemplate(template);
  import_electron.Menu.setApplicationMenu(menu);
}
function createWindow() {
  const possibleIcons = [
    import_path.default.join(__dirname, "../dist/pwa-512x512.png"),
    import_path.default.join(__dirname, "../public/pwa-512x512.png"),
    import_path.default.join(__dirname, "../public/favicon-32x32.png")
  ];
  const iconPath = possibleIcons.find((p) => import_fs.default.existsSync(p));
  mainWindow = new import_electron.BrowserWindow({
    title: "VOXReader",
    width: 1300,
    height: 860,
    minWidth: 840,
    minHeight: 580,
    backgroundColor: "#0F1115",
    frame: false,
    // Frameless for modern Windows 11 titlebar
    titleBarStyle: "hidden",
    icon: iconPath,
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === "i" || input.key === "F12") {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("electron:window-state-changed", { isMaximized: true });
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("electron:window-state-changed", { isMaximized: false });
  });
  createApplicationMenu();
  const isDev = !import_electron.app.isPackaged;
  const possibleIndexPaths = [
    import_path.default.join(__dirname, "../dist/index.html"),
    import_path.default.join(import_electron.app.getAppPath(), "dist/index.html"),
    import_path.default.join(__dirname, "dist/index.html"),
    import_path.default.join(__dirname, "index.html")
  ];
  const indexPath = possibleIndexPaths.find((p) => import_fs.default.existsSync(p)) || possibleIndexPaths[0];
  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Electron] Gagal memuat URL: ${validatedURL} (${errorCode}: ${errorDescription})`);
    if (import_fs.default.existsSync(indexPath) && !validatedURL.endsWith("index.html")) {
      console.log("[Electron] Beralih memuat file bundle lokal:", indexPath);
      mainWindow?.loadFile(indexPath);
      return;
    }
  });
  if (isDev && devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(indexPath);
  }
  mainWindow.webContents.on("did-finish-load", () => {
    if (fileToOpenOnStartup) {
      setTimeout(() => {
        if (fileToOpenOnStartup) {
          sendFileToRenderer(fileToOpenOnStartup);
          fileToOpenOnStartup = null;
        }
      }, 800);
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(async () => {
  setupIpcHandlers();
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
function setupIpcHandlers() {
  import_electron.ipcMain.handle("dialog:open-pdf", async () => {
    if (!mainWindow) return null;
    const result = await import_electron.dialog.showOpenDialog(mainWindow, {
      title: "Buka Dokumen PDF - VOXReader",
      properties: ["openFile"],
      filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const fileName = import_path.default.basename(filePath);
    const buffer = await import_fs.default.promises.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return {
      name: fileName,
      path: filePath,
      data: arrayBuffer
    };
  });
  import_electron.ipcMain.handle("dialog:save-pdf", async (_event, defaultName, arrayBuffer) => {
    if (!mainWindow) return { success: false };
    const result = await import_electron.dialog.showSaveDialog(mainWindow, {
      title: "Simpan Salinan Dokumen PDF - VOXReader",
      defaultPath: defaultName || "VOXReader_Document.pdf",
      filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }]
    });
    if (result.canceled || !result.filePath) {
      return { success: false };
    }
    try {
      const buffer = Buffer.from(arrayBuffer);
      await import_fs.default.promises.writeFile(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err?.message || "Failed to save file" };
    }
  });
  import_electron.ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });
  import_electron.ipcMain.on("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  import_electron.ipcMain.on("window:close", () => {
    mainWindow?.close();
  });
  import_electron.ipcMain.handle("window:is-maximized", () => {
    return mainWindow?.isMaximized() || false;
  });
  import_electron.ipcMain.handle("app:get-version", () => import_electron.app.getVersion());
  import_electron.ipcMain.handle("app:get-platform", () => process.platform);
  import_electron.ipcMain.on("shell:open-external", (_event, url) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      import_electron.shell.openExternal(url);
    }
  });
}

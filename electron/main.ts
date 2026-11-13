import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import https from "https";

let mainWindow: BrowserWindow | null = null;
let fileToOpenOnStartup: string | null = null;

// Parse file argument from command line (e.g. when double-clicking a PDF in Windows)
function getPdfArg(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg && arg.toLowerCase().endsWith(".pdf") && fs.existsSync(arg)) {
      return arg;
    }
  }
  return null;
}

// Check initial args
fileToOpenOnStartup = getPdfArg(process.argv.slice(1));

// Ensure single instance lock on Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check if a PDF file was passed in the second instance
      const secondFile = getPdfArg(commandLine);
      if (secondFile) {
        sendFileToRenderer(secondFile);
      }
    }
  });
}

async function sendFileToRenderer(filePath: string) {
  if (!mainWindow || !fs.existsSync(filePath)) return;
  try {
    const fileName = path.basename(filePath);
    const buffer = await fs.promises.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    mainWindow.webContents.send("electron:open-file", {
      name: fileName,
      path: filePath,
      data: arrayBuffer,
    });
  } catch (err) {
    console.error("Failed to read file from argument:", err);
  }
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";

  const template: any[] = [
    {
      label: "&Berkas",
      submenu: [
        {
          label: "Buka Dokumen PDF...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              title: "Buka Dokumen PDF - VOXReader",
              properties: ["openFile"],
              filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              await sendFileToRenderer(result.filePaths[0]);
            }
          },
        },
        {
          label: "Simpan Salinan Dokumen...",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow?.webContents.send("menu:trigger-save");
          },
        },
        { type: "separator" },
        {
          label: "Cetak Dokumen...",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            mainWindow?.webContents.print();
          },
        },
        { type: "separator" },
        {
          label: "Keluar dari VOXReader",
          accelerator: isMac ? "Cmd+Q" : "Alt+F4",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "&Tampilan",
      submenu: [
        {
          label: "Perbesar (Zoom In)",
          accelerator: "CmdOrCtrl+Plus",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-in");
          },
        },
        {
          label: "Perkecil (Zoom Out)",
          accelerator: "CmdOrCtrl+-",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-out");
          },
        },
        {
          label: "Ukuran Asli (100%)",
          accelerator: "CmdOrCtrl+0",
          click: () => {
            mainWindow?.webContents.send("menu:zoom-reset");
          },
        },
        { type: "separator" },
        {
          label: "Layar Penuh (Full Screen)",
          accelerator: "F11",
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: "Buka Alat Pengembang (DevTools)",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          },
        },
      ],
    },
    {
      label: "&Dokumen",
      submenu: [
        {
          label: "Halaman Berikutnya",
          accelerator: "PageDown",
          click: () => mainWindow?.webContents.send("menu:next-page"),
        },
        {
          label: "Halaman Sebelumnya",
          accelerator: "PageUp",
          click: () => mainWindow?.webContents.send("menu:prev-page"),
        },
        {
          label: "Halaman Pertama",
          accelerator: "Home",
          click: () => mainWindow?.webContents.send("menu:first-page"),
        },
        {
          label: "Halaman Terakhir",
          accelerator: "End",
          click: () => mainWindow?.webContents.send("menu:last-page"),
        },
      ],
    },
    {
      label: "&Alat AI",
      submenu: [
        {
          label: "Percakapan Suara AI",
          accelerator: "CmdOrCtrl+Shift+V",
          click: () => mainWindow?.webContents.send("menu:open-live-voice"),
        },
        {
          label: "Analisis Halaman AI",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => mainWindow?.webContents.send("menu:open-ai-chat"),
        },
        {
          label: "Pengaturan Gemini AI...",
          click: () => mainWindow?.webContents.send("menu:open-gemini-settings"),
        },
      ],
    },
    {
      label: "&Bantuan",
      submenu: [
        {
          label: "Tentang VOXReader Windows...",
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: "info",
              title: "Tentang VOXReader",
              message: "VOXReader v1.0.0",
              detail:
                "Aplikasi pembaca PDF Windows modern berbasis Electron.\nDilengkapi dengan mode malam nyaman, Gemini Flash TTS AI, analisis dokumen cerdas, dan penyimpanan offline.",
              buttons: ["Tutup"],
            });
          },
        },
        {
          label: "Dokumentasi & GitHub",
          click: () => {
            shell.openExternal("https://github.com");
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const possibleIcons = [
    path.join(__dirname, "../dist/pwa-512x512.png"),
    path.join(__dirname, "../public/pwa-512x512.png"),
    path.join(__dirname, "../public/favicon-32x32.png"),
  ];
  const iconPath = possibleIcons.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    title: "VOXReader",
    width: 1300,
    height: 860,
    minWidth: 840,
    minHeight: 580,
    backgroundColor: "#0F1115",
    frame: false, // Frameless for modern Windows 11 titlebar
    titleBarStyle: "hidden",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // F12 or Ctrl+Shift+I shortcut to toggle DevTools
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control && input.shift && input.key.toLowerCase() === "i") || input.key === "F12") {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Track window state changes for custom titlebar
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("electron:window-state-changed", { isMaximized: true });
  });

  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("electron:window-state-changed", { isMaximized: false });
  });

  createApplicationMenu();

  const isDev = !app.isPackaged;
  const possibleIndexPaths = [
    path.join(__dirname, "../dist/index.html"),
    path.join(app.getAppPath(), "dist/index.html"),
    ...(process.resourcesPath
      ? [
          path.join(process.resourcesPath, "app.asar", "dist/index.html"),
          path.join(process.resourcesPath, "app", "dist/index.html"),
        ]
      : []),
    path.join(__dirname, "dist/index.html"),
    path.join(__dirname, "index.html"),
  ];
  const indexPath = possibleIndexPaths.find((p) => fs.existsSync(p)) || possibleIndexPaths[0];
  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL;
  let hasLoadedFallback = false;

  const showDiagnosticPage = (title: string, detail: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const html = `<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>${title}</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0F1115; color: #E2E8F0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { max-width: 520px; padding: 28px; border-radius: 16px; background: #161B22; border: 1px solid #2D3748; box-shadow: 0 20px 50px rgba(0,0,0,.45); }
  h1 { margin: 0 0 10px; font-size: 18px; color: #60A5FA; }
  p { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: #CBD5E1; }
  code { display: block; padding: 10px 12px; border-radius: 8px; background: #0B0E14; border: 1px solid #1E293B; color: #93C5FD; font-size: 12px; margin-top: 8px; white-space: pre-wrap; }
</style></head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${detail}</p>
    <code>npm run electron:dev</code>
  </div>
</body></html>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
  };

  // Handle load failure gracefully
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return;
    console.warn(`[Electron] Gagal memuat URL: ${validatedURL} (${errorCode}: ${errorDescription})`);

    if (!hasLoadedFallback && fs.existsSync(indexPath) && !validatedURL.endsWith("index.html")) {
      hasLoadedFallback = true;
      console.log("[Electron] Beralih memuat file bundle lokal:", indexPath);
      mainWindow?.loadFile(indexPath).catch((err) => {
        console.error("[Electron] Gagal memuat bundle lokal:", err);
      });
      return;
    }

    if (!validatedURL.startsWith("data:")) {
      showDiagnosticPage(
        "Gagal Memuat VOXReader",
        `Tidak dapat terhubung ke ${validatedURL || "halaman aplikasi"} (${errorDescription}). Jalankan perintah berikut untuk mode dev:`
      );
    }
  });

  // Load strategy:
  // 1. Packaged .exe always loads local bundled dist/index.html.
  // 2. Development mode: when devUrl is set, wait briefly for the dev server to be ready and load it;
  //    otherwise fall back cleanly to local dist/index.html if present.
  const loadTarget = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (!isDev) {
      await mainWindow.loadFile(indexPath).catch((err) => {
        console.error("[Electron] Gagal memuat file produksi:", err);
        showDiagnosticPage(
          "Berkas Aplikasi Tidak Ditemukan",
          "Pastikan aplikasi sudah di-build dengan benar sebelum dijalankan."
        );
      });
      return;
    }

    if (devUrl) {
      const ready = await waitForUrlReachable(devUrl, 8000);
      if (!mainWindow || mainWindow.isDestroyed()) return;

      if (ready) {
        try {
          await mainWindow.loadURL(devUrl);
          return;
        } catch (err) {
          console.warn("[Electron] loadURL gagal:", err);
        }
      } else {
        console.warn(`[Electron] Server dev ${devUrl} belum aktif.`);
      }
    }

    if (fs.existsSync(indexPath)) {
      hasLoadedFallback = true;
      console.log("[Electron] Memuat file bundle lokal:", indexPath);
      await mainWindow.loadFile(indexPath).catch((err) => {
        console.error("[Electron] Gagal memuat file lokal:", err);
      });
    } else {
      showDiagnosticPage(
        "Server Dev Belum Berjalan",
        `Tidak dapat terhubung ke ${devUrl || "http://localhost:3000"} dan folder dist/ belum di-build. Jalankan perintah berikut:`
      );
    }
  };

  void loadTarget();

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

function isUrlReachable(targetUrl: string, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: "/",
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve((res.statusCode || 500) < 500);
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function waitForUrlReachable(targetUrl: string, maxWaitMs = 8000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isUrlReachable(targetUrl, 800)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handler setups
function setupIpcHandlers() {
  // Native Open File Dialog
  ipcMain.handle("dialog:open-pdf", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Buka Dokumen PDF - VOXReader",
      properties: ["openFile"],
      filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    const buffer = await fs.promises.readFile(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    return {
      name: fileName,
      path: filePath,
      data: arrayBuffer,
    };
  });

  // Native Save File Dialog
  ipcMain.handle("dialog:save-pdf", async (_event, defaultName: string, arrayBuffer: ArrayBuffer) => {
    if (!mainWindow) return { success: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Simpan Salinan Dokumen PDF - VOXReader",
      defaultPath: defaultName || "VOXReader_Document.pdf",
      filters: [{ name: "Dokumen PDF (*.pdf)", extensions: ["pdf"] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false };
    }

    try {
      const buffer = Buffer.from(arrayBuffer);
      await fs.promises.writeFile(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to save file" };
    }
  });

  // Window Controls
  ipcMain.on("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.on("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on("window:close", () => {
    mainWindow?.close();
  });

  ipcMain.handle("window:is-maximized", () => {
    return mainWindow?.isMaximized() || false;
  });

  // App details
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-platform", () => process.platform);

  // Shell open external
  ipcMain.on("shell:open-external", (_event, url: string) => {
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      shell.openExternal(url);
    }
  });
}

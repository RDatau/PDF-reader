import { spawn, execFileSync } from "child_process";
import http from "http";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 3000;
const targetUrl = `http://localhost:${port}`;
const healthUrl = `${targetUrl}/api/health`;

function checkServerHealth(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed?.status === "ok");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForServer(maxWaitMs = 25000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkServerHealth(1000)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // ignore cleanup errors if process already exited
  }
}

function resolveElectronBinary() {
  try {
    const binPath = require("electron");
    if (typeof binPath === "string" && binPath.length > 0) {
      return binPath;
    }
  } catch {
    // fallback below
  }
  return null;
}

async function main() {
  let serverProc = null;
  let electronProc = null;
  let cleaningUp = false;

  const cleanup = () => {
    if (cleaningUp) return;
    cleaningUp = true;
    if (electronProc && !electronProc.killed) {
      killProcessTree(electronProc);
    }
    if (serverProc && !serverProc.killed) {
      killProcessTree(serverProc);
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  const alreadyRunning = await checkServerHealth(1000);
  if (!alreadyRunning) {
    console.log(`[electron:dev] Memulai server dev di ${targetUrl}...`);
    const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const serverTs = path.join(projectRoot, "server.ts");

    serverProc = spawn(process.execPath, [tsxCli, serverTs], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: "inherit",
    });

    serverProc.on("exit", (code) => {
      if (!cleaningUp && code !== 0) {
        console.error(`[electron:dev] Server dev berhenti (kode ${code}).`);
        cleanup();
        process.exit(code || 1);
      }
    });

    const ready = await waitForServer(25000);
    if (!ready) {
      console.error(`[electron:dev] Server dev gagal merespons di ${targetUrl}.`);
      cleanup();
      process.exit(1);
    }
  } else {
    console.log(`[electron:dev] Menggunakan server dev yang sudah berjalan di ${targetUrl}.`);
  }

  console.log("[electron:dev] Membuka Electron...");
  const electronBinary = resolveElectronBinary();
  if (electronBinary) {
    electronProc = spawn(electronBinary, ["."], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_START_URL: targetUrl,
      },
      stdio: "inherit",
    });
  } else {
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    electronProc = spawn(npxCmd, ["electron", "."], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_START_URL: targetUrl,
      },
      shell: process.platform === "win32",
      stdio: "inherit",
    });
  }

  electronProc.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[electron:dev] Error:", err);
  process.exit(1);
});

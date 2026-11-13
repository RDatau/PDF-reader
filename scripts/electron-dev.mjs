import { spawn, execFileSync } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 3000;
const targetUrl = `http://localhost:${port}`;
const healthUrl = `${targetUrl}/api/health`;

function checkServerHealth(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
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
    if (await checkServerHealth(800)) {
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

  const alreadyRunning = await checkServerHealth(800);
  if (!alreadyRunning) {
    console.log(`[electron:dev] Memulai server dev di ${targetUrl}...`);
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    serverProc = spawn(npmCmd, ["run", "dev"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
      },
      shell: process.platform === "win32",
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
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const localElectron = path.join(
    projectRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron"
  );

  electronProc = spawn(localElectron, ["."], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_START_URL: targetUrl,
    },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  electronProc.on("error", () => {
    electronProc = spawn(npxCmd, ["electron", "."], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ELECTRON_START_URL: targetUrl,
      },
      shell: process.platform === "win32",
      stdio: "inherit",
    });
  });

  electronProc.on("exit", (code) => {
    cleanup();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[electron:dev] Error:", err);
  process.exit(1);
});

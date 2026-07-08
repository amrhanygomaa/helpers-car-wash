#!/usr/bin/env node
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const VITE_URL = "http://127.0.0.1:5173";
const LOCK_DIR = path.join(ROOT, ".codex-dev");
const LOCK_FILE = path.join(LOCK_DIR, "electron-dev.lock");
const isWin = process.platform === "win32";

let viteProc = null;
let electronProc = null;
let shuttingDown = false;
let ownsLock = false;

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquireLock() {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  try {
    const existingPid = Number.parseInt(fs.readFileSync(LOCK_FILE, "utf8"), 10);
    if (existingPid !== process.pid && isProcessRunning(existingPid)) {
      console.log(`[electron:dev] Already running (launcher PID ${existingPid}). Close the existing app before starting another copy.`);
      return false;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  fs.writeFileSync(LOCK_FILE, String(process.pid), "utf8");
  ownsLock = true;
  return true;
}

function releaseLock() {
  if (!ownsLock) return;
  try {
    if (fs.readFileSync(LOCK_FILE, "utf8").trim() === String(process.pid)) {
      fs.rmSync(LOCK_FILE, { force: true });
    }
  } catch {
    // The lock may already have been cleaned up during shutdown.
  }
  ownsLock = false;
}

function isVitePortBusy() {
  return new Promise((resolve) => {
    const request = http.get(VITE_URL, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function runVite() {
  const viteEntrypoint = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  viteProc = spawn(process.execPath, [viteEntrypoint, "--host", "127.0.0.1", "--strictPort"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });

  viteProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[electron:dev] Vite exited with code ${code ?? 0}.`);
      shutdown();
    }
  });
}

function waitForVite(tries = 0) {
  return new Promise((resolve, reject) => {
    http
      .get(VITE_URL, () => resolve())
      .on("error", () => {
        if (tries >= 120) {
          reject(new Error("Vite did not become ready in time."));
          return;
        }

        setTimeout(() => {
          waitForVite(tries + 1).then(resolve).catch(reject);
        }, 500);
      });
  });
}

function runElectron() {
  const electronPath = require("electron");
  const env = { ...process.env, ELECTRON_RENDERER_URL: VITE_URL };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronArgs = ["."];
  // On Linux, disable the SUID sandbox to avoid permission issues
  // (especially on NTFS-mounted drives where chmod/chown is not possible).
  if (process.platform === "linux") {
    electronArgs.push("--no-sandbox");
  }

  electronProc = spawn(electronPath, electronArgs, {
    cwd: ROOT,
    env,
    stdio: "inherit",
    windowsHide: false,
  });

  electronProc.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[electron:dev] Electron exited with code ${code ?? 0}.`);
      shutdown();
    }
  });
}

function killProcessTree(proc) {
  if (!proc?.pid) {
    return;
  }

  try {
    if (isWin) {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" });
      return;
    }

    proc.kill("SIGTERM");
  } catch {
    // Ignore shutdown races.
  }
}

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  killProcessTree(electronProc);
  killProcessTree(viteProc);
  releaseLock();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", releaseLock);

async function main() {
  if (!acquireLock()) return;
  if (await isVitePortBusy()) {
    console.error("[electron:dev] Port 5173 is already in use. Close the existing development session and try again.");
    releaseLock();
    process.exitCode = 1;
    return;
  }

  runVite();
  await waitForVite();
  runElectron();
}

main().catch((error) => {
  console.error(`[electron:dev] ${error.message}`);
  shutdown();
});

#!/usr/bin/env node
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const VITE_URL = "http://127.0.0.1:5173";
const isWin = process.platform === "win32";

let viteProc = null;
let electronProc = null;
let shuttingDown = false;

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

  electronProc = spawn(electronPath, ["."], {
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
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runVite();
waitForVite()
  .then(() => runElectron())
  .catch((error) => {
    console.error(`[electron:dev] ${error.message}`);
    shutdown();
  });

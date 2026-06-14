#!/usr/bin/env node
/**
 * dev-live — one command that keeps the running app in sync with code changes
 * AND with GitHub, with zero rebuilds:
 *
 *   • Vite dev server  → renderer (src/**) changes hot-reload instantly (HMR).
 *   • electron/** watch → main-process changes auto-restart Electron only.
 *   • git poll (60s)   → pulls new GitHub commits with --rebase --autostash so
 *                        your uncommitted local edits are preserved. Pulled
 *                        renderer files HMR; pulled electron/** files restart.
 *
 * Run:  npm run dev:live
 * Stop: Ctrl+C (shuts down both Vite and Electron).
 */
const { spawn, exec, execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const ROOT = path.resolve(__dirname, "..");
const VITE_URL = "http://127.0.0.1:5173";
const GIT_POLL_MS = 60_000;
const isWin = process.platform === "win32";

let viteProc = null;
let electronProc = null;
let restartingElectron = false;
let shuttingDown = false;
let pullDisabled = false;

const log = (m) => console.log(`\x1b[36m[dev-live]\x1b[0m ${m}`);

function startVite() {
  const bin = path.join(ROOT, "node_modules", ".bin", isWin ? "vite.cmd" : "vite");
  viteProc = spawn(bin, ["--host", "127.0.0.1", "--strictPort"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin, // .cmd shim needs a shell on Windows
  });
  viteProc.on("exit", (code) => {
    if (shuttingDown) return;
    log(`Vite exited (code ${code}) — shutting down.`);
    shutdown();
  });
}

function waitForVite(cb, tries = 0) {
  http
    .get(VITE_URL, () => cb())
    .on("error", () => {
      if (tries > 120) return log("Vite did not become ready in time.");
      setTimeout(() => waitForVite(cb, tries + 1), 500);
    });
}

function startElectron() {
  const electronBin = require("electron"); // resolves to the electron executable path
  const env = { ...process.env, ELECTRON_RENDERER_URL: VITE_URL };
  delete env.ELECTRON_RUN_AS_NODE; // otherwise Electron runs as plain Node
  electronProc = spawn(electronBin, ["."], { cwd: ROOT, stdio: "inherit", env, shell: false });
  electronProc.on("exit", () => {
    electronProc = null;
    if (restartingElectron) {
      restartingElectron = false;
      // brief delay so the single-instance lock is released before respawn
      setTimeout(() => { if (!shuttingDown) startElectron(); }, 900);
    } else if (!shuttingDown) {
      log("Electron window closed — shutting down.");
      shutdown();
    }
  });
}

function restartElectron() {
  if (restartingElectron) return;
  if (!electronProc) { startElectron(); return; }
  restartingElectron = true;
  log("main-process change → restarting Electron…");
  try {
    if (isWin) execSync(`taskkill /pid ${electronProc.pid} /T /F`, { stdio: "ignore" });
    else electronProc.kill("SIGTERM");
  } catch { /* exit handler will respawn */ }
}

function watchMainProcess() {
  const dir = path.join(ROOT, "electron");
  let debounce = null;
  try {
    fs.watch(dir, { recursive: true }, (_evt, file) => {
      if (!file || !/\.(c?js)$/.test(String(file))) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { log(`electron/${file} changed`); restartElectron(); }, 600);
    });
    log("watching electron/** for main-process changes");
  } catch (e) {
    log(`could not watch electron/ (${e.message}) — main-process auto-restart disabled`);
  }
}

function gitPoll() {
  if (pullDisabled) return;
  exec("git fetch --quiet", { cwd: ROOT }, (e) => {
    if (e) return; // offline / transient — try again next tick
    exec("git rev-list --count HEAD..@{u}", { cwd: ROOT }, (e2, out) => {
      if (e2) return; // no upstream tracking configured
      const behind = parseInt(String(out).trim(), 10) || 0;
      if (behind <= 0) return;
      log(`${behind} new commit(s) on GitHub → git pull --rebase --autostash`);
      exec("git pull --rebase --autostash", { cwd: ROOT }, (e3, o3, er3) => {
        if (e3) {
          pullDisabled = true;
          log(`git pull failed — auto-pull PAUSED. Resolve manually then restart dev:live.\n${(er3 || e3.message || "").trim()}`);
          return;
        }
        log("pulled OK. Renderer hot-reloads; main-process changes auto-restart.");
      });
    });
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutting down…");
  try { if (electronProc?.pid) { if (isWin) execSync(`taskkill /pid ${electronProc.pid} /T /F`, { stdio: "ignore" }); else electronProc.kill("SIGTERM"); } } catch {}
  try { if (viteProc?.pid) { if (isWin) execSync(`taskkill /pid ${viteProc.pid} /T /F`, { stdio: "ignore" }); else viteProc.kill("SIGTERM"); } } catch {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

log("starting Vite…");
startVite();
waitForVite(() => {
  log("Vite ready → launching Electron");
  startElectron();
  watchMainProcess();
  setInterval(gitPoll, GIT_POLL_MS);
  log(`git auto-pull every ${GIT_POLL_MS / 1000}s`);
});

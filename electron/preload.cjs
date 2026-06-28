const { contextBridge, ipcRenderer } = require("electron");

function sync(channel, ...args) {
  return ipcRenderer.sendSync(channel, ...args);
}

contextBridge.exposeInMainWorld("desktopAPI", {
  platform: "electron",
  license: {
    getMachineCode: () => ipcRenderer.invoke("license:get-machine-code"),
    getStatus: () => ipcRenderer.invoke("license:get-status"),
    activate: (serial) => ipcRenderer.invoke("license:activate", serial),
  },
  setup: {
    createOwner: (username, password) =>
      ipcRenderer.invoke("setup:create-owner", { username, password }),
    hasOwner: () => ipcRenderer.invoke("setup:has-owner"),
    selectDirectory: () => ipcRenderer.invoke("dialog:select-directory"),
  },
  auth: {
    login: (username, password) =>
      ipcRenderer.invoke("auth:login", { username, password }),
    logout: () => ipcRenderer.invoke("auth:logout"),
    hashPassword: (password) => ipcRenderer.invoke("auth:hash-password", password),
    changePassword: (userId, currentPassword, newPassword) =>
      ipcRenderer.invoke("auth:change-password", {
        userId,
        currentPassword,
        newPassword,
      }),
    updateProfile: (userId, name, currentPassword, newPassword) =>
      ipcRenderer.invoke("auth:update-profile", {
        userId,
        name,
        currentPassword,
        newPassword,
      }),
    resetOwnerPassword: (supportCode, username, password) =>
      ipcRenderer.invoke("support:reset-owner-password", {
        supportCode,
        username,
        password,
      }),
  },
  print: {
    route: (route) => ipcRenderer.invoke("print:route", route),
    testReceipt: () => ipcRenderer.invoke("print:test-receipt"),
  },
  storage: {
    get: (key) => sync("storage:get", key),
    set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
    remove: (key) => ipcRenderer.invoke("storage:remove", key),
    clearPrefix: (prefix) => ipcRenderer.invoke("storage:clear-prefix", prefix),
    export: () => ipcRenderer.invoke("storage:export"),
    import: (payload) => ipcRenderer.invoke("storage:import", payload),
    getBatch: () => ipcRenderer.invoke("storage:get-batch"),
    setBatch: (entries) => ipcRenderer.invoke("storage:set-batch", entries),
  },
  // Relational data bridge for the car wash domain (Drizzle sqlite-proxy).
  db: {
    query: (sql, params, method) =>
      ipcRenderer.invoke("db:query", { sql, params, method }),
    batch: (queries) => ipcRenderer.invoke("db:batch", queries),
  },
  // Cloud sync (Phase 9) — optional multi-branch sync; engine runs in main.
  sync: {
    status: () => ipcRenderer.invoke("sync:status"),
    getConfig: () => ipcRenderer.invoke("sync:get-config"),
    setConfig: (cfg) => ipcRenderer.invoke("sync:set-config", cfg),
    now: () => ipcRenderer.invoke("sync:now"),
  },
  backup: {
    writeFile: (dir, fileName, content) =>
      ipcRenderer.invoke("backup:write-file", { dir, fileName, content }),
    selectDirectory: () => ipcRenderer.invoke("backup:select-directory"),
    exportDatabase: () => ipcRenderer.invoke("backup:export-database"),
    importDatabase: () => ipcRenderer.invoke("backup:import-database"),
  },
  app: {
    // Main asks the renderer to take a backup right before the window closes.
    // Returns an unsubscribe function.
    onRunCloseBackup: (cb) => {
      const handler = () => cb();
      ipcRenderer.on("app:run-close-backup", handler);
      return () => ipcRenderer.removeListener("app:run-close-backup", handler);
    },
    // Renderer signals it finished (or skipped) the close-time backup.
    closeBackupDone: () => ipcRenderer.send("app:close-backup-done"),
  },
});

// Prevent internal file:// paths from appearing in the browser status bar
// when the user hovers over navigation links. Temporarily replaces the full
// href with just the hash fragment (#/route) on mouseover, then restores it
// on mouseout. React Router navigates via onClick (pushState) so this is safe.
window.addEventListener("DOMContentLoaded", () => {
  function findAnchor(target) {
    let el = target;
    while (el && el.tagName !== "A") el = el.parentElement;
    return el || null;
  }

  document.addEventListener("mouseover", (e) => {
    const a = findAnchor(e.target);
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("file:")) return;
    const hashIdx = href.indexOf("#");
    const clean = hashIdx !== -1 ? href.slice(hashIdx) : "#";
    a._preloadSavedHref = href;
    a.setAttribute("href", clean);
  }, true);

  document.addEventListener("mouseout", (e) => {
    const a = findAnchor(e.target);
    if (!a || !a._preloadSavedHref) return;
    a.setAttribute("href", a._preloadSavedHref);
    delete a._preloadSavedHref;
  }, true);
}, { once: true });

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
  },
  storage: {
    get: (key) => sync("storage:get", key),
    set: (key, value) => ipcRenderer.invoke("storage:set", key, value),
    remove: (key) => ipcRenderer.invoke("storage:remove", key),
    clearPrefix: (prefix) => ipcRenderer.invoke("storage:clear-prefix", prefix),
    export: () => ipcRenderer.invoke("storage:export"),
    import: (payload) => ipcRenderer.invoke("storage:import", payload),
  },
});

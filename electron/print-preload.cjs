const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("invoicePrint", {
  printNow: () => ipcRenderer.invoke("print:current-window"),
  savePdf: () => ipcRenderer.invoke("print:save-current-pdf"),
});

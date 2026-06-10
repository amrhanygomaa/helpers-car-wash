import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./store/AppContext";
import { ToastProvider } from "./components/ui/Toast";
import { loadStorageCache } from "./lib/storage";
import "./index.css";

// Pre-populate the in-memory storage cache from SQLite before rendering.
// This single async IPC call replaces dozens of per-key synchronous reads
// that previously blocked the renderer and caused UI freezes.
loadStorageCache().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <HashRouter>
        <ToastProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ToastProvider>
      </HashRouter>
    </StrictMode>
  );
});

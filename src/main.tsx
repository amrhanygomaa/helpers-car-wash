import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./store/AppContext";
import { ToastProvider } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { loadStorageCache } from "./lib/storage";
import "./index.css";

// useBlocker (unsaved-changes guard on the invoice/quotation pages) only works
// inside a data router, so the app must mount via createHashRouter +
// RouterProvider — plain <HashRouter> throws an invariant the moment one of
// those pages renders. App keeps its own <Routes>; this single splat route
// delegates all matching to it.
const router = createHashRouter([
  {
    path: "*",
    element: (
      <ToastProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ToastProvider>
    ),
  },
]);

// Pre-populate the in-memory storage cache from SQLite before rendering.
// This single async IPC call replaces dozens of per-key synchronous reads
// that previously blocked the renderer and caused UI freezes.
loadStorageCache().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </StrictMode>
  );
});


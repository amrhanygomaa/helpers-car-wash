import { _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

export interface ElectronHandle {
  app: ElectronApplication;
  window: Page;
  dbPath: string;
}

export async function launchElectron(): Promise<ElectronHandle> {
  const tmpDir = path.join(os.tmpdir(), `hw-e2e-${crypto.randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, "helpers-inventory.secure.sqlite");

  const app = await electron.launch({
    args: [path.resolve("electron/main.cjs")],
    env: {
      ...process.env,
      NODE_ENV: "test",
      HW_E2E: "1",
      HW_E2E_DB_PATH: dbPath,
      // Suppress the renderer URL so Electron loads the built dist/
      ELECTRON_RENDERER_URL: undefined as unknown as string,
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  return { app, window, dbPath };
}

export async function closeElectron(handle: ElectronHandle): Promise<void> {
  try {
    await handle.app.close();
  } catch {
    // Already closed — ignore.
  }
}

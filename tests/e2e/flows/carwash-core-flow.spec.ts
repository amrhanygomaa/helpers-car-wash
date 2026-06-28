/**
 * @smoke
 * TC-E2E-CARWASH-001  Core carwash loop: first-run → login → new invoice → reports.
 *
 * Verifies that the three most critical carwash pages are reachable and render
 * correctly after owner creation.  Intentionally broad — it guards against
 * routing regressions, import crashes, and blank-screen failures rather than
 * exercising every form interaction.
 */
import { test, expect } from "@playwright/test";
import { launchElectron, closeElectron } from "../../helpers/electron-app";
import { FirstRunScreen } from "../screens/FirstRunScreen";
import { LoginScreen } from "../screens/LoginScreen";

const OWNER_USERNAME = "carwash_owner";
const OWNER_PASSWORD = "Carwash!E2E26";

test("@smoke carwash core: first-run → dashboard → new invoice page → reports page", async () => {
  const handle = await launchElectron();
  try {
    const { window } = handle;

    // ── Step 1: First-run setup ───────────────────────────────────────────
    const setup = new FirstRunScreen(window);
    await expect(setup.heading()).toBeVisible();
    await setup.createOwner(OWNER_USERNAME, OWNER_PASSWORD);
    await expect(window.getByText(/أهلاً بك في/)).toBeVisible();

    // ── Step 2: Navigate to new invoice page ─────────────────────────────
    await window.goto("http://localhost:5173/carwash/new").catch(() => {
      // In production Electron mode the base is file://; use internal navigation.
    });
    // Use sidebar nav link as a reliable navigation method
    const invoiceLink = window.getByRole("link", { name: "فاتورة غسيل جديدة" });
    if (await invoiceLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await invoiceLink.click();
    }
    // The new invoice page must show an invoice number field
    await expect(window.getByText(/رقم الفاتورة|فاتورة غسيل/i)).toBeVisible({ timeout: 10_000 });

    // ── Step 3: Navigate to carwash reports page ──────────────────────────
    const reportsLink = window.getByRole("link", { name: "تقارير الغسيل" });
    if (await reportsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reportsLink.click();
    }
    await expect(window.getByText(/تقارير الغسيل/i)).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Navigate to day-close / payroll page ──────────────────────
    const dayCloseLink = window.getByRole("link", { name: "قفلة اليوم" });
    if (await dayCloseLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dayCloseLink.click();
    }
    await expect(window.getByText(/قفلة اليوم/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeElectron(handle);
  }
});

test("@smoke logout then re-login as carwash owner", async () => {
  const handle = await launchElectron();
  try {
    const { window } = handle;

    // Setup owner
    const setup = new FirstRunScreen(window);
    await expect(setup.heading()).toBeVisible();
    await setup.createOwner(OWNER_USERNAME, OWNER_PASSWORD);
    await expect(window.getByText(/أهلاً بك في/)).toBeVisible();

    // Logout
    await window.getByRole("button", { name: "تسجيل الخروج" }).click();

    // Re-login
    const login = new LoginScreen(window);
    await expect(login.usernameInput()).toBeVisible();
    await login.loginAs(OWNER_USERNAME, OWNER_PASSWORD);
    await expect(window.getByText(/أهلاً بك في/)).toBeVisible();
  } finally {
    await closeElectron(handle);
  }
});

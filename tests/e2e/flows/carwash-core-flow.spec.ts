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
    await expect(window.getByText(/لوحة تشغيل المغسلة/)).toBeVisible();

    // ── Step 2: Navigate to new invoice page ─────────────────────────────
    // Never window.goto() here: in production Electron the app loads from
    // file://, so navigating to a dev-server URL blanks the window for good.
    const invoiceLink = window.getByRole("link", { name: "فاتورة غسيل جديدة" });
    if (await invoiceLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await invoiceLink.click();
    }
    // The new invoice page must show an invoice number field
    await expect(window.getByText("رقم الفاتورة").first()).toBeVisible({ timeout: 10_000 });

    // ── Step 3: Navigate to carwash reports page ──────────────────────────
    // Sidebar groups are open by default; Playwright auto-scrolls to the link.
    await window.getByRole("link", { name: "تقارير المغسلة" }).click();
    await expect(window.locator("h1", { hasText: "تقارير المغسلة" })).toBeVisible({ timeout: 10_000 });

    // ── Step 4: Navigate to day-close / payroll page ──────────────────────
    // Sidebar label is "تقفيل اليوم"; the page header reads "قفلة اليوم".
    await window.getByRole("link", { name: "تقفيل اليوم" }).click();
    await expect(window.getByText(/قفلة اليوم/i).first()).toBeVisible({ timeout: 10_000 });
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
    await expect(window.getByText(/لوحة تشغيل المغسلة/)).toBeVisible();

    // Logout
    await window.getByRole("button", { name: "تسجيل الخروج" }).click();

    // Re-login
    const login = new LoginScreen(window);
    await expect(login.usernameInput()).toBeVisible();
    await login.loginAs(OWNER_USERNAME, OWNER_PASSWORD);
    await expect(window.getByText(/لوحة تشغيل المغسلة/)).toBeVisible();
  } finally {
    await closeElectron(handle);
  }
});

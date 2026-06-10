/**
 * E2E-001  First-run setup → owner creation → login → dashboard.
 *
 * Covers the complete activation path for a brand-new installation:
 *   1. Fresh DB  →  FirstRunSetupPage is shown (license bypassed in E2E mode).
 *   2. Owner creates account  →  success toast, redirect to LoginPage.
 *   3. Owner logs in with the new credentials  →  DashboardPage is shown.
 *
 * TC-E2E-001 — P0 / e2e
 */
import { test, expect } from "@playwright/test";
import { launchElectron, closeElectron } from "../../helpers/electron-app";
import { FirstRunScreen } from "../screens/FirstRunScreen";
import { LoginScreen } from "../screens/LoginScreen";

const OWNER_USERNAME = "test_owner";
const OWNER_PASSWORD = "Owner!E2E26";

test("E2E-001: first-run setup → owner creation → login → dashboard", async () => {
  const handle = await launchElectron();
  try {
    const { window } = handle;

    // ── Step 1: First-run setup page is visible ─────────────────────────
    const setup = new FirstRunScreen(window);
    await expect(setup.heading()).toBeVisible();

    // ── Step 2: Create the owner account ────────────────────────────────
    await setup.createOwner(OWNER_USERNAME, OWNER_PASSWORD);

    // Success toast confirms owner was created.
    await expect(
      window.locator('[role="status"]', { hasText: /تم إنشاء المدير/ })
    ).toBeVisible();

    // ── Step 3: Login page appears after owner creation ─────────────────
    const login = new LoginScreen(window);
    await expect(login.usernameInput()).toBeVisible();

    // ── Step 4: Log in with the newly created owner ──────────────────────
    await login.loginAs(OWNER_USERNAME, OWNER_PASSWORD);

    // Success toast acknowledges the login.
    await expect(
      window.locator('[role="status"]', { hasText: /تم تسجيل الدخول/ })
    ).toBeVisible();

    // ── Step 5: Dashboard is rendered ────────────────────────────────────
    // The dashboard greeting contains "أهلاً بك في" followed by the company name.
    await expect(window.getByText(/أهلاً بك في/)).toBeVisible();
  } finally {
    await closeElectron(handle);
  }
});

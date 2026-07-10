/**
 * TC-E2E-STOCK-001  Regression: a restock must survive navigation and product
 * sync. syncCarwashProducts used to let the stale KV copy overwrite SQLite,
 * silently reverting restocks/edits made on the products page.
 */
import { test, expect } from "@playwright/test";
import { launchElectron, closeElectron } from "../../helpers/electron-app";
import { FirstRunScreen } from "../screens/FirstRunScreen";

test("restock persists across navigation and product sync", async () => {
  const handle = await launchElectron();
  try {
    const { window } = handle;
    const setup = new FirstRunScreen(window);
    await setup.createOwner("carwash_owner", "Carwash!E2E26");
    await window.getByText(/لوحة تشغيل المغسلة/).waitFor();

    // Products page → create a product with initial stock 10.
    await window.getByRole("link", { name: "المنتجات" }).click();
    await window.getByRole("button", { name: "منتج جديد" }).click();
    const dialog = window.getByRole("dialog");
    await dialog.getByPlaceholder("مثال: فوّاحة").fill("فوّاحة اختبار");
    const numberInputs = dialog.locator('input[type="number"]');
    await numberInputs.nth(0).fill("50"); // سعر البيع
    await numberInputs.nth(1).fill("20"); // التكلفة
    await numberInputs.nth(2).fill("10"); // الكمية الابتدائية (3 = حد التنبيه)
    await dialog.getByRole("button", { name: /حفظ|إضافة/ }).click();
    await expect(window.getByText("فوّاحة اختبار")).toBeVisible();

    // Restock +5 → row should show 15.
    await window.locator('button[title="إضافة كمية"]').first().click();
    const restockDialog = window.getByRole("dialog");
    await restockDialog.locator('input[type="number"]').first().fill("5");
    await restockDialog.getByRole("button", { name: "إضافة الكمية" }).click();
    await expect(window.getByText(/تم إضافة 5 وحدة/)).toBeVisible();

    // Navigate away (dashboard triggers renders) and back (load() → sync).
    await window.getByRole("link", { name: "لوحة التحكم" }).click();
    await window.getByText(/لوحة تشغيل المغسلة/).waitFor();
    await window.getByRole("link", { name: "المنتجات" }).click();

    // The stock cell must read 15 — before the fix the sync reverted it to 10.
    const row = window.locator("tr", { hasText: "فوّاحة اختبار" });
    await expect(row).toBeVisible();
    await expect(row.getByText("15", { exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeElectron(handle);
  }
});

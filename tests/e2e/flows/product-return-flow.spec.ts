/**
 * TC-E2E-RETURN-001  Products-only returns, end to end.
 *
 * Flow: create a product (stock 10) → sell 3 on a product invoice (paid in
 * full) → return 2 from the invoice detail page → the return is recorded
 * (SR number, returns card, list badge) and stock lands back at 9
 * (10 − 3 sold + 2 returned), proving the SQLite mirror too.
 */
import { test, expect } from "@playwright/test";
import { launchElectron, closeElectron } from "../../helpers/electron-app";
import { FirstRunScreen } from "../screens/FirstRunScreen";

test("product return: sell 3, return 2, stock back to 9, return recorded", async () => {
  const handle = await launchElectron();
  try {
    const { window } = handle;

    // Confirming an invoice auto-prints into a hidden iframe; stub print in
    // every future frame so no native dialog can block the run.
    await window.addInitScript(() => {
      window.print = () => {};
    });

    const setup = new FirstRunScreen(window);
    await setup.createOwner("carwash_owner", "Carwash!E2E26");
    await window.getByText(/لوحة تشغيل المغسلة/).waitFor();

    // ── Create a product with stock 10 ─────────────────────────────────────
    await window.getByRole("link", { name: "المنتجات" }).click();
    await window.getByRole("button", { name: "منتج جديد" }).click();
    const productDialog = window.getByRole("dialog");
    await productDialog.getByPlaceholder("مثال: فوّاحة").fill("فوّاحة اختبار");
    const numberInputs = productDialog.locator('input[type="number"]');
    await numberInputs.nth(0).fill("50"); // سعر البيع
    await numberInputs.nth(1).fill("20"); // التكلفة
    await numberInputs.nth(2).fill("10"); // الكمية
    await productDialog.getByRole("button", { name: /حفظ|إضافة/ }).click();
    await expect(window.locator("tr", { hasText: "فوّاحة اختبار" })).toBeVisible();

    // ── Product invoice: sell 3 units, paid in full ────────────────────────
    await window.getByRole("link", { name: "فاتورة منتجات جديدة" }).click();
    // "إضافة بند" enables once the SQLite products load, and adds a line
    // pre-selected with the first product; set its quantity to 3.
    const addLine = window.getByRole("button", { name: "إضافة بند" });
    await expect(addLine).toBeEnabled({ timeout: 10_000 });
    await addLine.click();
    const qtyInput = window.locator('input[type="number"][min="1"]').first();
    await expect(qtyInput).toBeVisible();
    await qtyInput.fill("3");
    // المبلغ المدفوع auto-syncs to the running total (150) until touched, and
    // unpaid invoices can't be confirmed — assert it caught up before saving.
    await expect(window.locator('input[title="المبلغ المدفوع"][value="150"]').last()).toBeAttached();
    await window.getByRole("button", { name: "تأكيد فاتورة المنتجات" }).first().click();

    // Lands on the invoice detail page.
    await expect(window.getByText(/فاتورة منتجات PRD/).first()).toBeVisible({ timeout: 10_000 });

    // ── Return 2 units ─────────────────────────────────────────────────────
    await window.getByRole("button", { name: "مرتجع منتجات" }).click();
    const returnDialog = window.getByRole("dialog");
    await expect(returnDialog.getByText("مرتجع منتجات")).toBeVisible();
    await returnDialog.getByLabel(/كمية إرجاع فوّاحة اختبار/).fill("2");
    await expect(returnDialog.getByText(/إجمالي المرتجع/)).toContainText("100");
    await returnDialog.getByRole("button", { name: "تسجيل المرتجع" }).click();

    // The return is recorded: card + SR number + updated status stat.
    // (.first(): the success toast also carries the SR number briefly.)
    await expect(window.getByText("المرتجعات المسجلة")).toBeVisible();
    await expect(window.getByText("SR-0001").first()).toBeVisible();
    await expect(window.getByText("فوّاحة اختبار × 2")).toBeVisible();
    await expect(window.getByText("بها مرتجع").first()).toBeVisible();

    // ── The invoices list shows the return badge ───────────────────────────
    await window.getByRole("link", { name: "الفواتير" }).click();
    await expect(window.locator("tr", { hasText: "PRD" }).getByText("بها مرتجع")).toBeVisible();

    // ── Stock is back at 9 (10 − 3 + 2), including the SQLite mirror ──────
    await window.getByRole("link", { name: "المنتجات" }).click();
    const row = window.locator("tr", { hasText: "فوّاحة اختبار" });
    await expect(row.getByText("9", { exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await closeElectron(handle);
  }
});

import type { Page } from "@playwright/test";

export class FirstRunScreen {
  constructor(private p: Page) {}

  // The setup page heading is visible on the right-hand panel.
  heading = () => this.p.getByRole("heading", { name: "إنشاء حساب المالك" });

  // Field labels are not associated via htmlFor. The username field is the
  // only non-password text input in the form.
  usernameInput = () => this.p.locator('form input:not([type="password"])').first();
  passwordInput = () => this.p.locator('input[type="password"]').first();
  confirmPasswordInput = () => this.p.locator('input[type="password"]').nth(1);

  submitButton = () =>
    this.p.getByRole("button", { name: "إنشاء المدير وفتح النظام" });

  toast = (text: string | RegExp) =>
    this.p.locator('[role="status"]', { hasText: text });

  async createOwner(username: string, password: string): Promise<void> {
    // The username field pre-fills with "admin" — clear it first.
    const uField = this.usernameInput();
    await uField.clear();
    await uField.fill(username);
    await this.passwordInput().fill(password);
    await this.confirmPasswordInput().fill(password);
    await this.submitButton().click();
  }
}

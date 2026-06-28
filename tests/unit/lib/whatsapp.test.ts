import { describe, it, expect } from "vitest";
import { normalizePhone, whatsappUrl, carReadyMessage, invoiceSummaryMessage } from "../../../src/lib/whatsapp";

describe("normalizePhone", () => {
  it("converts a local 01x number to country code", () => {
    expect(normalizePhone("01001234567")).toBe("201001234567");
  });
  it("keeps an already-prefixed 20 number", () => {
    expect(normalizePhone("201001234567")).toBe("201001234567");
  });
  it("strips a leading 00", () => {
    expect(normalizePhone("00201001234567")).toBe("201001234567");
  });
  it("strips spaces and symbols", () => {
    expect(normalizePhone("+20 100 123 4567")).toBe("201001234567");
  });
  it("returns empty for blank input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("builds an encoded wa.me link", () => {
    const url = whatsappUrl("01001234567", "أهلاً");
    expect(url.startsWith("https://wa.me/201001234567?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("أهلاً"));
  });
});

describe("carReadyMessage", () => {
  it("includes name, vehicle and company", () => {
    const msg = carReadyMessage({ customerName: "أحمد", vehicleLabel: "Toyota · ABC-1", company: "Top Gear" });
    expect(msg).toContain("أحمد");
    expect(msg).toContain("Toyota · ABC-1");
    expect(msg).toContain("Top Gear");
  });
  it("omits empty name/vehicle gracefully", () => {
    const msg = carReadyMessage({ company: "Top Gear" });
    expect(msg).toContain("Top Gear");
    expect(msg).not.toContain("()");
  });
});

describe("invoiceSummaryMessage", () => {
  it("includes total and remaining when present", () => {
    const msg = invoiceSummaryMessage({ company: "Top Gear", invoiceNumber: "INV-1", total: "100 EGP", remaining: "20 EGP" });
    expect(msg).toContain("INV-1");
    expect(msg).toContain("100 EGP");
    expect(msg).toContain("20 EGP");
  });
  it("omits remaining when not provided", () => {
    const msg = invoiceSummaryMessage({ company: "Top Gear", invoiceNumber: "INV-2", total: "50 EGP" });
    expect(msg).not.toContain("المتبقي");
  });
});

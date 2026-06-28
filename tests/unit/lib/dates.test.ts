import { describe, expect, it } from "vitest";
import {
  APP_TIMEZONE,
  businessDateInCairo,
  formatCairoDateTime,
  toUtcIso,
} from "../../../src/lib/dates";

describe("date utilities", () => {
  it("uses Africa/Cairo as the app timezone", () => {
    expect(APP_TIMEZONE).toBe("Africa/Cairo");
  });

  it("stores values as UTC ISO strings", () => {
    expect(toUtcIso("2026-06-01T10:00:00+03:00")).toBe("2026-06-01T07:00:00.000Z");
  });

  it("derives the business date in Cairo", () => {
    expect(businessDateInCairo("2026-05-31T22:30:00.000Z")).toBe("2026-06-01");
  });

  it("formats a Cairo-local date time", () => {
    expect(formatCairoDateTime("2026-06-01T07:00:00.000Z")).toMatch(/2026|٢٠٢٦/);
  });
});

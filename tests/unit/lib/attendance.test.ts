import { describe, it, expect } from "vitest";
import { hoursWorked, clockTime } from "../../../src/lib/attendance";

describe("hoursWorked", () => {
  it("computes decimal hours between check-in and check-out", () => {
    expect(hoursWorked("2026-06-28T08:00:00", "2026-06-28T12:30:00")).toBe(4.5);
  });
  it("returns 0 when still open (no check-out)", () => {
    expect(hoursWorked("2026-06-28T08:00:00")).toBe(0);
    expect(hoursWorked("2026-06-28T08:00:00", null)).toBe(0);
  });
  it("returns 0 for invalid or reversed times", () => {
    expect(hoursWorked("2026-06-28T12:00:00", "2026-06-28T08:00:00")).toBe(0);
    expect(hoursWorked("nope", "also-nope")).toBe(0);
  });
});

describe("clockTime", () => {
  it("returns a dash for missing timestamps", () => {
    expect(clockTime(undefined)).toBe("—");
    expect(clockTime(null)).toBe("—");
    expect(clockTime("invalid")).toBe("—");
  });
  it("formats a valid timestamp as HH:MM", () => {
    expect(clockTime("2026-06-28T09:05:00")).toMatch(/^\d{2}:\d{2}$/);
  });
});

import { describe, it, expect } from "vitest";
import { computeDiscount, computeServiceCommission } from "../../../src/lib/carwash";
import type { DiscountCode } from "../../../src/types";

function code(type: DiscountCode["type"], value: number): DiscountCode {
  return { id: "dc1", code: "TEST", type, value, active: true, createdAt: "2026-01-01T00:00:00Z" };
}

describe("computeDiscount", () => {
  describe("fixed_amount", () => {
    it("subtracts fixed amount from subtotal", () => {
      expect(computeDiscount(100, code("fixed_amount", 20))).toBe(20);
    });

    it("caps at subtotal (never negative)", () => {
      expect(computeDiscount(10, code("fixed_amount", 50))).toBe(10);
    });

    it("returns 0 when code value is 0", () => {
      expect(computeDiscount(100, code("fixed_amount", 0))).toBe(0);
    });
  });

  describe("percent", () => {
    it("returns exact percentage of subtotal", () => {
      expect(computeDiscount(200, code("percent", 10))).toBe(20);
    });

    it("handles fractional result (rounds to 2 decimal places)", () => {
      // 7% of 100.00 = 7.00 exactly
      expect(computeDiscount(100, code("percent", 7))).toBe(7);
    });

    it("handles non-round results correctly", () => {
      // 33% of 99 = 32.67
      expect(computeDiscount(99, code("percent", 33))).toBeCloseTo(32.67, 2);
    });

    it("100% discount returns full subtotal", () => {
      expect(computeDiscount(150, code("percent", 100))).toBe(150);
    });

    it("0% discount returns 0", () => {
      expect(computeDiscount(150, code("percent", 0))).toBe(0);
    });
  });

  describe("override", () => {
    it("returns difference between subtotal and override price", () => {
      // Override price = 80; subtotal was 120; discount = 40
      expect(computeDiscount(120, code("override", 80))).toBe(40);
    });

    it("returns 0 when override price exceeds subtotal (no extra discount)", () => {
      expect(computeDiscount(50, code("override", 100))).toBe(0);
    });

    it("returns 0 when override equals subtotal", () => {
      expect(computeDiscount(75, code("override", 75))).toBe(0);
    });
  });
});

describe("computeServiceCommission", () => {
  it("TC-UNIT-COMM-001 — basic percentage calculation", () => {
    // 10% of 100 EGP × 1 unit = 10 EGP
    expect(computeServiceCommission(100, 1, 10)).toBe(10);
  });

  it("TC-UNIT-COMM-002 — scales linearly with quantity", () => {
    // 10% of 50 EGP × 3 = 15 EGP
    expect(computeServiceCommission(50, 3, 10)).toBe(15);
  });

  it("TC-UNIT-COMM-003 — result rounds to nearest piastre", () => {
    // 15% of 33 EGP × 1 = 4.95 → rounds to 5
    expect(computeServiceCommission(33, 1, 15)).toBe(5);
  });

  it("TC-UNIT-COMM-004 — zero pct returns 0", () => {
    expect(computeServiceCommission(200, 2, 0)).toBe(0);
  });

  it("TC-UNIT-COMM-005 — undefined pct returns 0 (no commission configured)", () => {
    expect(computeServiceCommission(200, 1, undefined)).toBe(0);
  });

  it("TC-UNIT-COMM-006 — 100% commission equals the full line total", () => {
    expect(computeServiceCommission(75, 2, 100)).toBe(150);
  });

  it("TC-UNIT-COMM-007 — fractional percentage is handled correctly", () => {
    // 7.5% of 200 × 1 = 15
    expect(computeServiceCommission(200, 1, 7.5)).toBe(15);
  });

  it("TC-UNIT-COMM-008 — zero price always yields 0", () => {
    expect(computeServiceCommission(0, 5, 20)).toBe(0);
  });
});

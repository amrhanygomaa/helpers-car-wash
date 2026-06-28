import { describe, it, expect } from "vitest";
import { computeDrawerExpected, drawerVariance } from "../../../src/lib/shifts";
import type { CashEntry } from "../../../src/types";

function entry(amount: number, date: string, paymentMethod?: CashEntry["paymentMethod"]): Pick<CashEntry, "amount" | "paymentMethod" | "date"> {
  return { amount, date, paymentMethod };
}

const DAY = "2026-06-28";

describe("computeDrawerExpected", () => {
  it("adds opening float to the day's signed cash movements", () => {
    const r = computeDrawerExpected(500, [entry(100, DAY, "cash"), entry(-30, DAY, "cash")], DAY);
    expect(r).toBe(570);
  });

  it("treats entries with no payment method as cash", () => {
    expect(computeDrawerExpected(0, [entry(200, DAY)], DAY)).toBe(200);
  });

  it("excludes non-cash payment methods (bank/vodafone…)", () => {
    const r = computeDrawerExpected(100, [entry(500, DAY, "bank"), entry(50, DAY, "cash")], DAY);
    expect(r).toBe(150);
  });

  it("ignores entries from other business dates", () => {
    const r = computeDrawerExpected(100, [entry(999, "2026-06-27", "cash"), entry(20, DAY, "cash")], DAY);
    expect(r).toBe(120);
  });
});

describe("drawerVariance", () => {
  it("is zero when counted matches expected", () => {
    expect(drawerVariance(570, 570)).toBe(0);
  });
  it("is positive for a surplus and negative for a shortage", () => {
    expect(drawerVariance(600, 570)).toBe(30);
    expect(drawerVariance(550, 570)).toBe(-20);
  });
});

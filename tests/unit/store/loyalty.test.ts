import { describe, it, expect } from "vitest";
import { computeLoyaltyEarned, visitHistory } from "../../../src/store/_pure";
import type { SalesInvoice } from "../../../src/types";

describe("computeLoyaltyEarned", () => {
  it("returns 0 when loyalty is disabled", () => {
    expect(computeLoyaltyEarned(500, { enabled: false, egpPerPoint: 10 })).toBe(0);
  });

  it("floors total / egpPerPoint", () => {
    expect(computeLoyaltyEarned(255, { enabled: true, egpPerPoint: 10 })).toBe(25);
  });

  it("returns 0 for non-positive total or rate", () => {
    expect(computeLoyaltyEarned(0, { enabled: true, egpPerPoint: 10 })).toBe(0);
    expect(computeLoyaltyEarned(100, { enabled: true, egpPerPoint: 0 })).toBe(0);
  });
});

function inv(partial: Partial<SalesInvoice>): SalesInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV-1",
    date: "2026-06-20",
    customerId: "c1",
    customerName: "عميل",
    lines: [],
    total: 0,
    amountReceived: 0,
    remaining: 0,
    paymentType: "cash",
    priceType: "retail",
    status: "paid",
    invoiceKind: "service",
    createdAt: "2026-06-20T00:00:00Z",
    ...partial,
  } as SalesInvoice;
}

describe("visitHistory", () => {
  it("counts visits, sums spend, and finds the latest date", () => {
    const h = visitHistory([
      inv({ date: "2026-06-01", total: 100 }),
      inv({ date: "2026-06-15", total: 250 }),
      inv({ date: "2026-06-10", total: 50 }),
    ]);
    expect(h).toEqual({ visits: 3, totalSpent: 400, lastVisit: "2026-06-15" });
  });

  it("ignores cancelled and non-service invoices", () => {
    const h = visitHistory([
      inv({ total: 100, cancelled: true }),
      inv({ total: 100, invoiceKind: "product" }),
      inv({ date: "2026-06-05", total: 80 }),
    ]);
    expect(h).toEqual({ visits: 1, totalSpent: 80, lastVisit: "2026-06-05" });
  });

  it("returns an empty summary for no invoices", () => {
    expect(visitHistory([])).toEqual({ visits: 0, totalSpent: 0, lastVisit: undefined });
  });
});

import { describe, it, expect } from "vitest";
import { endOfDaySales, endOfDayCash } from "../../../src/lib/endOfDay";
import type { CashEntry, SalesInvoice } from "../../../src/types";

const D = "2026-06-28";

function inv(p: Partial<SalesInvoice>): SalesInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV",
    date: D,
    customerId: "c",
    customerName: "x",
    lines: [],
    total: 0,
    amountReceived: 0,
    remaining: 0,
    paymentType: "cash",
    priceType: "retail",
    status: "paid",
    invoiceKind: "service",
    ...p,
  };
}

describe("endOfDaySales", () => {
  it("sums cars, revenue, collected and outstanding for the date", () => {
    const r = endOfDaySales(
      [
        inv({ total: 100, amountReceived: 100 }),
        inv({ total: 200, amountReceived: 150, remaining: 50 }),
        inv({ total: 999, date: "2026-06-27" }),
        inv({ total: 999, cancelled: true }),
        inv({ total: 999, invoiceKind: "product" }),
      ],
      D,
    );
    expect(r).toEqual({ cars: 2, revenue: 300, collected: 250, outstanding: 50 });
  });
});

describe("endOfDayCash", () => {
  function ce(amount: number, date: string): CashEntry {
    return { id: Math.random().toString(36).slice(2), type: "manual-add", amount, description: "", date };
  }
  it("splits positive/negative into in/out and nets them", () => {
    const r = endOfDayCash([ce(300, D), ce(-120, D), ce(999, "2026-06-27")], D);
    expect(r).toEqual({ cashIn: 300, cashOut: 120, net: 180 });
  });
});

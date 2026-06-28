import { describe, it, expect } from "vitest";
import { peakHours, topServices, averageTicket, workerLeaderboard } from "../../../src/lib/analytics";
import type { InvoiceLine, SalesInvoice } from "../../../src/types";

function svc(name: string, subtotal: number, qty = 1, workers?: { workerId: string; commissionAmount: number }[]): InvoiceLine {
  return {
    id: Math.random().toString(36).slice(2),
    productId: "",
    productName: name,
    unit: "خدمة",
    quantity: qty,
    price: subtotal / qty,
    subtotal,
    kind: "service",
    serviceId: name,
    workers,
  };
}

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
    ...partial,
  };
}

describe("averageTicket", () => {
  it("computes count, total and average over service invoices", () => {
    const r = averageTicket([
      inv({ total: 100 }),
      inv({ total: 300 }),
      inv({ total: 0, cancelled: true }),
      inv({ total: 999, invoiceKind: "product" }),
    ]);
    expect(r).toEqual({ count: 2, total: 400, average: 200 });
  });

  it("average is 0 with no invoices", () => {
    expect(averageTicket([]).average).toBe(0);
  });
});

describe("topServices", () => {
  it("aggregates by service name and sorts by revenue desc", () => {
    const r = topServices([
      inv({ lines: [svc("غسيل خارجي", 50), svc("تلميع", 200)] }),
      inv({ lines: [svc("غسيل خارجي", 50, 1)] }),
    ]);
    expect(r[0]).toEqual({ name: "تلميع", count: 1, revenue: 200 });
    expect(r[1]).toEqual({ name: "غسيل خارجي", count: 2, revenue: 100 });
  });
});

describe("peakHours", () => {
  it("buckets finalized invoices by hour and ignores date-only ones", () => {
    const r = peakHours([
      inv({ finalizedAt: "2026-06-20T09:30:00", total: 100 }),
      inv({ finalizedAt: "2026-06-20T09:45:00", total: 50 }),
      inv({ finalizedAt: "2026-06-20T14:00:00", total: 80 }),
      inv({ total: 70 }), // no finalizedAt → skipped
    ]);
    const nine = r.find((b) => b.hour === 9);
    expect(nine).toEqual({ hour: 9, count: 2, revenue: 150 });
    expect(r.find((b) => b.hour === 14)?.count).toBe(1);
    expect(r.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe("workerLeaderboard", () => {
  it("ranks workers by commission, splitting shared cars", () => {
    const r = workerLeaderboard([
      inv({
        id: "i1",
        lines: [
          svc("غسيل", 100, 1, [
            { workerId: "A", commissionAmount: 10 },
            { workerId: "B", commissionAmount: 5 },
          ]),
        ],
      }),
      inv({ id: "i2", lines: [svc("تلميع", 200, 1, [{ workerId: "A", commissionAmount: 30 }])] }),
    ]);
    expect(r[0].workerId).toBe("A");
    expect(r[0].cars).toBe(2);
    expect(r[0].commission).toBe(40);
    expect(r[0].attributedRevenue).toBe(250); // 100/2 + 200
    expect(r[1]).toMatchObject({ workerId: "B", cars: 1, commission: 5, attributedRevenue: 50 });
  });
});

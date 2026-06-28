import { describe, it, expect } from "vitest";
import { lineWorkers, splitCommissionEvenly, employeeServiceStats } from "../../../src/store/_pure";
import type { InvoiceLine, SalesInvoice } from "../../../src/types";

describe("splitCommissionEvenly", () => {
  it("returns [] for zero workers", () => {
    expect(splitCommissionEvenly(100, 0)).toEqual([]);
  });

  it("gives the whole amount to a single worker", () => {
    expect(splitCommissionEvenly(75, 1)).toEqual([75]);
  });

  it("splits evenly when divisible", () => {
    expect(splitCommissionEvenly(100, 4)).toEqual([25, 25, 25, 25]);
  });

  it("puts the rounding remainder on the earliest shares and always sums to total", () => {
    const parts = splitCommissionEvenly(100, 3); // 33.34 + 33.33 + 33.33
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("handles piastre-level remainders", () => {
    const parts = splitCommissionEvenly(10, 3); // 3.34 + 3.33 + 3.33
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
  });
});

describe("lineWorkers", () => {
  it("prefers the multi-worker list when present", () => {
    const line = {
      workers: [
        { workerId: "w1", commissionAmount: 10 },
        { workerId: "w2", commissionAmount: 5 },
      ],
      employeeId: "legacy",
      commissionAmount: 99,
    };
    expect(lineWorkers(line)).toHaveLength(2);
    expect(lineWorkers(line)[0].workerId).toBe("w1");
  });

  it("falls back to the legacy single employee", () => {
    const line = { employeeId: "w1", employeeName: "أحمد", commissionAmount: 12 };
    expect(lineWorkers(line)).toEqual([{ workerId: "w1", workerName: "أحمد", commissionAmount: 12 }]);
  });

  it("returns [] for an unmanned line", () => {
    expect(lineWorkers({})).toEqual([]);
  });
});

function inv(lines: InvoiceLine[], date = "2026-06-20"): SalesInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV-1",
    date,
    customerId: "c1",
    customerName: "عميل",
    lines,
    total: 0,
    amountReceived: 0,
    remaining: 0,
    paymentType: "cash",
    priceType: "retail",
    status: "paid",
    invoiceKind: "service",
  };
}

function multiWorkerLine(workers: { workerId: string; commissionAmount: number }[], subtotal: number, quantity = 1): InvoiceLine {
  return {
    id: Math.random().toString(36).slice(2),
    productId: "",
    productName: "خدمة",
    unit: "خدمة",
    quantity,
    price: subtotal / quantity,
    subtotal,
    kind: "service",
    serviceId: "svc",
    workers,
  };
}

describe("employeeServiceStats — multi-worker", () => {
  it("splits attributed revenue equally among the line's workers", () => {
    const invoices = [inv([multiWorkerLine([{ workerId: "A", commissionAmount: 5 }, { workerId: "B", commissionAmount: 5 }], 100)])];
    const a = employeeServiceStats(invoices, "A", "2026-06-01", "2026-06-30");
    const b = employeeServiceStats(invoices, "B", "2026-06-01", "2026-06-30");
    expect(a.attributedRevenue).toBe(50);
    expect(b.attributedRevenue).toBe(50);
    expect(a.carsWashed).toBe(1);
    expect(b.carsWashed).toBe(1);
  });

  it("counts a car once for each participating worker and services per worker", () => {
    const invoices = [
      inv([
        multiWorkerLine([{ workerId: "A", commissionAmount: 5 }], 60, 2),
        multiWorkerLine([{ workerId: "A", commissionAmount: 5 }, { workerId: "B", commissionAmount: 5 }], 40),
      ]),
    ];
    const a = employeeServiceStats(invoices, "A", "2026-06-01", "2026-06-30");
    expect(a.carsWashed).toBe(1);
    expect(a.servicesPerformed).toBe(3); // 2 + 1
    expect(a.attributedRevenue).toBe(80); // 60 + 40/2
  });
});

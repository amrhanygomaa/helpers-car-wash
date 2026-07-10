import { describe, it, expect } from "vitest";
import { buildWorkerReportRows } from "../../../src/features/reports/worker-rows";
import type { InvoiceLine, LineWorker, SalesInvoice } from "../../../src/types";
import type { DailyClosure, Worker } from "../../../src/db/schema";

function svcLine(opts: {
  subtotal: number;
  quantity?: number;
  employeeId?: string;
  commissionAmount?: number;
  workers?: LineWorker[];
}): InvoiceLine {
  const quantity = opts.quantity ?? 1;
  return {
    id: Math.random().toString(36).slice(2),
    productId: "",
    productName: "خدمة",
    unit: "خدمة",
    quantity,
    price: opts.subtotal / quantity,
    subtotal: opts.subtotal,
    kind: "service",
    serviceId: "svc",
    employeeId: opts.employeeId,
    employeeName: opts.employeeId,
    commissionAmount: opts.commissionAmount,
    workers: opts.workers,
  };
}

function inv(partial: Partial<SalesInvoice>): SalesInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV-1",
    date: "2026-07-01",
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

function worker(id: string, name: string): Worker {
  return { id, name, wageType: "daily_fixed", baseWage: 0, active: true };
}

function closure(workerId: string, partial: Partial<DailyClosure> = {}): DailyClosure {
  return {
    id: Math.random().toString(36).slice(2),
    businessDate: "2026-07-01",
    workerId,
    branchId: "branch-main",
    carsCount: 0,
    commissionTotal: 0,
    baseAmount: 0,
    withdrawalsTotal: 0,
    netDue: 0,
    closedBy: null,
    closedAt: "2026-07-01T20:00:00.000Z",
    ...partial,
  };
}

const A = "w-a";
const B = "w-b";

describe("buildWorkerReportRows — TC-REP-WORKERS", () => {
  it("splits a shared line between its workers instead of crediting the first with everything", () => {
    // 100 EGP line washed by A + B together, 30 EGP total commission split 20/10.
    const invoices = [
      inv({
        lines: [
          svcLine({
            subtotal: 100,
            employeeId: A, // legacy mirror of the first worker
            commissionAmount: 30, // combined total
            workers: [
              { workerId: A, workerName: "أ", commissionAmount: 20 },
              { workerId: B, workerName: "ب", commissionAmount: 10 },
            ],
          }),
        ],
      }),
    ];
    const rows = buildWorkerReportRows([worker(A, "أ"), worker(B, "ب")], invoices, []);

    const rowA = rows.find((r) => r.id === A);
    const rowB = rows.find((r) => r.id === B);
    // Both workers appear, each with half the revenue and their own share.
    expect(rowA).toMatchObject({ cars: 1, servicesCount: 1, attributedRevenue: 5000, commission: 2000 });
    expect(rowB).toMatchObject({ cars: 1, servicesCount: 1, attributedRevenue: 5000, commission: 1000 });
  });

  it("falls back to the legacy single employeeId when the line has no workers list", () => {
    const invoices = [
      inv({ lines: [svcLine({ subtotal: 80, employeeId: A, commissionAmount: 8 })] }),
    ];
    const rows = buildWorkerReportRows([worker(A, "أ"), worker(B, "ب")], invoices, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: A, cars: 1, attributedRevenue: 8000, commission: 800 });
  });

  it("merges closure payroll data and keeps closure-only workers visible", () => {
    const rows = buildWorkerReportRows(
      [worker(A, "أ")],
      [],
      [
        closure(A, { baseAmount: 15000, commissionTotal: 2000, netDue: 12000 }),
        closure(A, { businessDate: "2026-07-02", baseAmount: 15000, commissionTotal: 0, netDue: 15000 }),
      ]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: A, payrollCost: 32000, netDue: 27000, cars: 0 });
  });

  it("hides workers with no activity and sorts by attributed revenue", () => {
    const invoices = [
      inv({ lines: [svcLine({ subtotal: 50, employeeId: B, commissionAmount: 5 })] }),
      inv({ lines: [svcLine({ subtotal: 200, employeeId: A, commissionAmount: 20 })] }),
    ];
    const rows = buildWorkerReportRows(
      [worker(A, "أ"), worker(B, "ب"), worker("w-idle", "خامل")],
      invoices,
      []
    );
    expect(rows.map((r) => r.id)).toEqual([A, B]);
  });

  it("ignores cancelled and product invoices", () => {
    const invoices = [
      inv({ cancelled: true, lines: [svcLine({ subtotal: 100, employeeId: A })] }),
      inv({ invoiceKind: "product", lines: [svcLine({ subtotal: 100, employeeId: A })] }),
    ];
    expect(buildWorkerReportRows([worker(A, "أ")], invoices, [])).toHaveLength(0);
  });
});

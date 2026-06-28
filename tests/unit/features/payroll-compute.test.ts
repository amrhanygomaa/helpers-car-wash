import { describe, it, expect } from "vitest";
import {
  monthDays,
  dailyBaseAmount,
  calcDayCloseRows,
} from "../../../src/features/payroll/compute";
import type { Worker } from "../../../src/db/schema";
import type { WorkerWithdrawal } from "../../../src/features/treasury/queries";
import type { DailyClosure } from "../../../src/features/payroll/queries";
import type { SalesInvoice } from "../../../src/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWorker(overrides: Partial<Worker> = {}): Worker {
  return {
    id: "wrk-01",
    name: "أحمد",
    wageType: "daily_fixed",
    baseWage: 10000, // 100 EGP in piastres
    active: true,
    ...overrides,
  };
}

function makeInvoice(
  id: string,
  date: string,
  lines: SalesInvoice["lines"] = []
): SalesInvoice {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    date,
    customerId: "cust-1",
    customerName: "عميل",
    lines,
    total: 0,
    amountReceived: 0,
    remaining: 0,
    paymentType: "cash",
    priceType: "retail",
    status: "paid",
    invoiceKind: "service",
    createdAt: `${date}T00:00:00Z`,
  };
}

function makeServiceLine(workerId: string, commissionAmount: number): SalesInvoice["lines"][0] {
  return {
    id: "ln-1",
    kind: "service",
    serviceId: "svc-1",
    productName: "غسيل",
    quantity: 1,
    unitPrice: 10000,
    subtotal: 10000,
    employeeId: workerId,
    commissionAmount,
  } as SalesInvoice["lines"][0];
}

function makeWithdrawal(workerId: string, amount: number, businessDate: string): WorkerWithdrawal {
  return {
    id: "wd-1",
    workerId,
    amount,
    reason: "سحب",
    businessDate,
    createdBy: null,
    createdAt: `${businessDate}T00:00:00Z`,
  };
}

// ── monthDays ─────────────────────────────────────────────────────────────────

describe("monthDays", () => {
  it("returns 31 for January", () => {
    expect(monthDays("2026-01-15")).toBe(31);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(monthDays("2026-02-10")).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(monthDays("2024-02-05")).toBe(29);
  });

  it("returns 30 for April", () => {
    expect(monthDays("2026-04-20")).toBe(30);
  });

  it("returns 30 as default for invalid input", () => {
    expect(monthDays("bad")).toBe(30);
  });
});

// ── dailyBaseAmount ───────────────────────────────────────────────────────────

describe("dailyBaseAmount", () => {
  it("returns base wage directly for daily_fixed workers", () => {
    const worker = makeWorker({ wageType: "daily_fixed", baseWage: 5000 });
    expect(dailyBaseAmount(worker, "2026-01-01")).toBe(5000);
  });

  it("divides monthly base by days in month", () => {
    // 31000 piastres / 31 days (January) = 1000 piastres/day
    const worker = makeWorker({ wageType: "monthly", baseWage: 31000 });
    expect(dailyBaseAmount(worker, "2026-01-15")).toBe(1000);
  });

  it("rounds to nearest integer for monthly workers", () => {
    // 10000 / 31 = 322.58... → rounded to 323
    const worker = makeWorker({ wageType: "monthly", baseWage: 10000 });
    expect(dailyBaseAmount(worker, "2026-01-15")).toBe(323);
  });

  it("returns 0 for commission_only workers", () => {
    const worker = makeWorker({ wageType: "commission_only", baseWage: 50000 });
    expect(dailyBaseAmount(worker, "2026-01-01")).toBe(0);
  });

  it("returns 0 when baseWage is null", () => {
    const worker = makeWorker({ wageType: "daily_fixed", baseWage: null });
    expect(dailyBaseAmount(worker, "2026-01-01")).toBe(0);
  });
});

// ── calcDayCloseRows ──────────────────────────────────────────────────────────

describe("calcDayCloseRows", () => {
  const businessDate = "2026-06-01";

  it("returns one row per active worker", () => {
    const workers = [
      makeWorker({ id: "w1", active: true }),
      makeWorker({ id: "w2", active: true }),
      makeWorker({ id: "w3", active: false }),
    ];
    const rows = calcDayCloseRows({ workers, invoices: [], withdrawals: [], closures: [], businessDate });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.worker.id)).toEqual(["w1", "w2"]);
  });

  it("counts distinct cars (one car appears once even with multiple service lines)", () => {
    const worker = makeWorker({ id: "w1" });
    // Two service lines on the same invoice → 1 car, not 2
    const invoice = makeInvoice("inv-1", businessDate, [
      makeServiceLine("w1", 5),
      makeServiceLine("w1", 5),
    ]);
    const rows = calcDayCloseRows({ workers: [worker], invoices: [invoice], withdrawals: [], closures: [], businessDate });
    expect(rows[0].carsCount).toBe(1);
    expect(rows[0].servicesCount).toBe(2);
  });

  it("sums commission from all service lines for the worker", () => {
    const worker = makeWorker({ id: "w1", wageType: "commission_only", baseWage: 0 });
    const inv1 = makeInvoice("i1", businessDate, [makeServiceLine("w1", 10)]);
    const inv2 = makeInvoice("i2", businessDate, [makeServiceLine("w1", 15)]);
    const rows = calcDayCloseRows({ workers: [worker], invoices: [inv1, inv2], withdrawals: [], closures: [], businessDate });
    // commissionTotal = egpToPiastres(10 + 15) = 2500
    expect(rows[0].commissionTotal).toBe(2500);
  });

  it("calculates netDue = baseAmount + commissionTotal - withdrawalsTotal", () => {
    const worker = makeWorker({ id: "w1", wageType: "daily_fixed", baseWage: 10000 });
    const withdrawal = makeWithdrawal("w1", 3000, businessDate);
    const invoice = makeInvoice("i1", businessDate, [makeServiceLine("w1", 20)]);
    const rows = calcDayCloseRows({ workers: [worker], invoices: [invoice], withdrawals: [withdrawal], closures: [], businessDate });
    // base=10000, commission=egpToPiastres(20)=2000, withdrawals=3000 → net=9000
    expect(rows[0].baseAmount).toBe(10000);
    expect(rows[0].commissionTotal).toBe(2000);
    expect(rows[0].withdrawalsTotal).toBe(3000);
    expect(rows[0].netDue).toBe(9000);
  });

  it("ignores invoices from other dates", () => {
    const worker = makeWorker({ id: "w1" });
    const otherDayInvoice = makeInvoice("i1", "2026-05-31", [makeServiceLine("w1", 50)]);
    const rows = calcDayCloseRows({ workers: [worker], invoices: [otherDayInvoice], withdrawals: [], closures: [], businessDate });
    expect(rows[0].carsCount).toBe(0);
    expect(rows[0].commissionTotal).toBe(0);
  });

  it("ignores cancelled invoices", () => {
    const worker = makeWorker({ id: "w1" });
    const cancelled = { ...makeInvoice("i1", businessDate, [makeServiceLine("w1", 50)]), cancelled: true };
    const rows = calcDayCloseRows({ workers: [worker], invoices: [cancelled], withdrawals: [], closures: [], businessDate });
    expect(rows[0].carsCount).toBe(0);
  });

  it("attaches closure when one exists for the worker on that date", () => {
    const worker = makeWorker({ id: "w1" });
    const closure: DailyClosure = {
      id: "cl-1",
      businessDate,
      workerId: "w1",
      carsCount: 3,
      commissionTotal: 500,
      baseAmount: 10000,
      withdrawalsTotal: 0,
      netDue: 10500,
      closedBy: null,
      closedAt: `${businessDate}T10:00:00Z`,
    };
    const rows = calcDayCloseRows({ workers: [worker], invoices: [], withdrawals: [], closures: [closure], businessDate });
    expect(rows[0].closed).toEqual(closure);
  });

  it("netDue can be negative when withdrawals exceed earnings", () => {
    const worker = makeWorker({ id: "w1", wageType: "daily_fixed", baseWage: 5000 });
    const withdrawal = makeWithdrawal("w1", 8000, businessDate);
    const rows = calcDayCloseRows({ workers: [worker], invoices: [], withdrawals: [withdrawal], closures: [], businessDate });
    expect(rows[0].netDue).toBe(-3000);
  });
});

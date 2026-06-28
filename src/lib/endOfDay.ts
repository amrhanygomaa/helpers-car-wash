/**
 * Pure aggregations for the end-of-day report (تقرير نهاية اليوم).
 * Derived from KV invoices + cash entries; no storage, fully testable.
 */
import type { CashEntry, SalesInvoice } from "../types";

export interface DaySalesSummary {
  cars: number;
  revenue: number;
  collected: number;
  outstanding: number;
}

/** Service-invoice totals for a single business date. */
export function endOfDaySales(
  invoices: Pick<SalesInvoice, "date" | "cancelled" | "invoiceKind" | "total" | "amountReceived" | "remaining">[],
  date: string,
): DaySalesSummary {
  let cars = 0;
  let revenue = 0;
  let collected = 0;
  let outstanding = 0;
  for (const inv of invoices) {
    if (inv.cancelled || inv.invoiceKind !== "service" || inv.date !== date) continue;
    cars += 1;
    revenue += inv.total;
    collected += inv.amountReceived;
    outstanding += inv.remaining;
  }
  return { cars, revenue, collected, outstanding };
}

export interface DayCashSummary {
  cashIn: number;
  cashOut: number;
  net: number;
}

/** Cash-register movement for a single business date (all payment methods). */
export function endOfDayCash(
  entries: Pick<CashEntry, "amount" | "date">[],
  date: string,
): DayCashSummary {
  let cashIn = 0;
  let cashOut = 0;
  for (const e of entries) {
    if (e.date !== date) continue;
    if (e.amount >= 0) cashIn += e.amount;
    else cashOut += -e.amount;
  }
  return { cashIn, cashOut, net: cashIn - cashOut };
}

/**
 * Pure helpers for cashier shift / drawer reconciliation (وردية وجرد الخزنة).
 * Kept free of DB/React imports for unit testing.
 */
import type { CashEntry } from "../types";

type DrawerEntry = Pick<CashEntry, "amount" | "paymentMethod" | "date">;

/**
 * Expected cash in the drawer = opening float + net of the day's CASH movements.
 * Non-cash payment methods (bank/vodafone/instapay/other) never touch the
 * drawer, so they are excluded; entries with no method are treated as cash.
 * All amounts are in the same unit as `openingFloat` (EGP).
 */
export function computeDrawerExpected(
  openingFloat: number,
  entries: DrawerEntry[],
  businessDate: string,
): number {
  let sum = openingFloat;
  for (const e of entries) {
    if (e.date !== businessDate) continue;
    if (e.paymentMethod && e.paymentMethod !== "cash") continue;
    sum += e.amount;
  }
  return sum;
}

/** Counted − expected. Positive = surplus (زيادة), negative = shortage (عجز). */
export function drawerVariance(countedCash: number, expectedCash: number): number {
  return Math.round((countedCash - expectedCash) * 100) / 100;
}

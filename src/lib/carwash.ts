import type { DiscountCode } from "../types";

export function computeDiscount(subtotal: number, code: DiscountCode): number {
  if (code.type === "percent") return Math.round(((subtotal * code.value) / 100) * 100) / 100;
  if (code.type === "override") return Math.max(0, subtotal - code.value);
  // fixed_amount: capped at subtotal
  return Math.min(code.value, subtotal);
}

/**
 * Returns the commission amount (EGP) for a service line.
 * Rounded to the nearest piastre (integer math).
 *
 * @param price      Line unit price in EGP
 * @param qty        Quantity (number of units)
 * @param pct        Commission rate as a percentage (0–100), or undefined / 0 for no commission
 */
export function computeServiceCommission(price: number, qty: number, pct: number | undefined): number {
  if (!pct) return 0;
  return Math.round(price * qty * pct / 100);
}

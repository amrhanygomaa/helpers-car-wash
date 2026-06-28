const DEFAULT_CURRENCY = "EGP";

export function egpToPiastres(value: number | string): number {
  const amount = typeof value === "string" ? Number(value.trim()) : value;
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function piastresToEgp(piastres: number): number {
  if (!Number.isFinite(piastres)) return 0;
  return piastres / 100;
}

export function formatPiastres(
  piastres: number,
  currency = DEFAULT_CURRENCY,
  locale = "ar-EG"
): string {
  const amount = piastresToEgp(piastres);
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`.trim();
}

export function multiplyUnitPrice(unitPricePiastres: number, qty: number): number {
  if (!Number.isFinite(unitPricePiastres) || !Number.isFinite(qty)) return 0;
  return Math.round(unitPricePiastres * qty);
}

/** Sum a list of piastres values, guarding against NaN/undefined. */
export function sumPiastres(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (acc, v) => acc + (Number.isFinite(v) ? (v as number) : 0),
    0
  );
}

/**
 * Discount amount for an invoice, all in piastres. Mirrors the discount_codes
 * model (FR-PRICE-3): `fixed_amount` subtracts N, `percent` subtracts %, and
 * `override` sets the target total (value) — the discount is whatever brings
 * the subtotal down to it. Result is always clamped to [0, subtotal].
 */
export function discountAmount(
  subtotal: number,
  type: "fixed_amount" | "percent" | "override",
  value: number
): number {
  if (subtotal <= 0) return 0;
  let discount: number;
  switch (type) {
    case "fixed_amount":
      discount = value;
      break;
    case "percent":
      discount = Math.round((subtotal * value) / 100);
      break;
    case "override":
      discount = subtotal - value;
      break;
    default:
      discount = 0;
  }
  return Math.max(0, Math.min(discount, subtotal));
}

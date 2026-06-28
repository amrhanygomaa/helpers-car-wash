/**
 * Pure helpers for customer wash subscriptions / packages (Car Wash — feature:
 * اشتراكات وباقات). Kept free of DB/React imports so they are unit-testable.
 *
 * Two package kinds:
 *  - "count"  : a prepaid bundle of N washes; each redemption decrements one.
 *  - "period" : unlimited washes within a date window [startDate, endDate].
 */
export type SubscriptionKind = "count" | "period";
export type SubscriptionStatus = "active" | "used_up" | "expired" | "cancelled";

export interface SubscriptionLike {
  kind: SubscriptionKind;
  remainingWashes?: number | null;
  endDate?: string | null;
  status?: string | null;
}

/** Can this subscription cover a wash on `today` (ISO date, e.g. "2026-06-28")? */
export function isSubscriptionUsable(sub: SubscriptionLike, today: string): boolean {
  if (sub.status === "cancelled") return false;
  if (sub.kind === "count") return (sub.remainingWashes ?? 0) > 0;
  return Boolean(sub.endDate) && today <= (sub.endDate as string);
}

/** Derived status for display, independent of any stored `status` flag. */
export function subscriptionStatus(sub: SubscriptionLike, today: string): SubscriptionStatus {
  if (sub.status === "cancelled") return "cancelled";
  if (sub.kind === "count") return (sub.remainingWashes ?? 0) > 0 ? "active" : "used_up";
  return Boolean(sub.endDate) && today <= (sub.endDate as string) ? "active" : "expired";
}

const STATUS_LABELS_AR: Record<SubscriptionStatus, string> = {
  active: "فعّال",
  used_up: "مُستهلك",
  expired: "منتهي",
  cancelled: "ملغي",
};

export function subscriptionStatusLabel(sub: SubscriptionLike, today: string): string {
  return STATUS_LABELS_AR[subscriptionStatus(sub, today)];
}

/** Add `days` to an ISO date (yyyy-mm-dd) and return the new ISO date. */
export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import {
  customerSubscriptions,
  subscriptionRedemptions,
  washPackages,
} from "../../db/schema";
import type {
  CustomerSubscription,
  SubscriptionRedemption,
  WashPackage,
} from "../../db/schema";
import { isSubscriptionUsable } from "../../lib/subscriptions";

export type { CustomerSubscription, SubscriptionRedemption, WashPackage };

const MAIN_BRANCH_ID = "branch-main";

// ── Packages (definitions) ──────────────────────────────────────────────────

export function listAllPackages(): Promise<WashPackage[]> {
  return db.select().from(washPackages).orderBy(asc(washPackages.name));
}

export function listActivePackages(): Promise<WashPackage[]> {
  return db
    .select()
    .from(washPackages)
    .where(eq(washPackages.active, true))
    .orderBy(asc(washPackages.name));
}

export async function createPackage(data: {
  id: string;
  name: string;
  kind: "count" | "period";
  price: number; // piastres
  washCount?: number;
  durationDays?: number;
  active?: boolean;
  notes?: string;
  createdAt: string;
}): Promise<void> {
  await db.insert(washPackages).values({
    id: data.id,
    name: data.name,
    kind: data.kind,
    price: data.price,
    washCount: data.kind === "count" ? data.washCount ?? null : null,
    durationDays: data.kind === "period" ? data.durationDays ?? null : null,
    active: data.active ?? true,
    notes: data.notes ?? null,
    createdAt: data.createdAt,
  });
}

export async function updatePackage(
  id: string,
  patch: Partial<{
    name: string;
    price: number;
    washCount: number | null;
    durationDays: number | null;
    active: boolean;
    notes: string | null;
  }>
): Promise<void> {
  await db.update(washPackages).set(patch).where(eq(washPackages.id, id));
}

// ── Customer subscriptions (purchased instances) ────────────────────────────

export function listSubscriptionsForCustomer(customerId: string): Promise<CustomerSubscription[]> {
  return db
    .select()
    .from(customerSubscriptions)
    .where(eq(customerSubscriptions.customerId, customerId))
    .orderBy(desc(customerSubscriptions.createdAt));
}

/** Active, still-usable subscriptions for a customer on `today` (ISO date). */
export async function listUsableSubscriptions(
  customerId: string,
  today: string
): Promise<CustomerSubscription[]> {
  const rows = await db
    .select()
    .from(customerSubscriptions)
    .where(
      and(
        eq(customerSubscriptions.customerId, customerId),
        eq(customerSubscriptions.status, "active")
      )
    )
    .orderBy(asc(customerSubscriptions.createdAt));
  return rows.filter((r) => isSubscriptionUsable(r, today));
}

/** Sell a package to a customer, creating a subscription row. */
export async function sellSubscription(opts: {
  id: string;
  customerId: string;
  pkg: WashPackage;
  startDate: string; // ISO business date
  endDate?: string | null;
  branchId?: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  const { pkg } = opts;
  await db.insert(customerSubscriptions).values({
    id: opts.id,
    customerId: opts.customerId,
    packageId: pkg.id,
    packageName: pkg.name,
    kind: pkg.kind,
    pricePaid: pkg.price,
    totalWashes: pkg.kind === "count" ? pkg.washCount ?? null : null,
    remainingWashes: pkg.kind === "count" ? pkg.washCount ?? null : null,
    startDate: opts.startDate,
    endDate: opts.endDate ?? null,
    status: "active",
    branchId: opts.branchId ?? MAIN_BRANCH_ID,
    createdBy: opts.createdBy ?? null,
    createdAt: opts.createdAt,
  });
}

/**
 * Redeem one or more washes from a subscription on an invoice. For "count"
 * packages it decrements `remainingWashes` (marking the sub used_up at 0); for
 * "period" packages it only records the redemption. Throws if not usable.
 */
export async function redeemSubscription(opts: {
  redemptionId: string;
  subscriptionId: string;
  orderId?: string;
  customerId?: string;
  washesUsed?: number;
  businessDate: string;
  createdAt: string;
}): Promise<void> {
  const rows = await db
    .select()
    .from(customerSubscriptions)
    .where(eq(customerSubscriptions.id, opts.subscriptionId));
  const sub = rows[0];
  if (!sub) throw new Error("subscription_not_found");
  if (!isSubscriptionUsable(sub, opts.businessDate)) throw new Error("subscription_not_usable");

  const used = opts.washesUsed ?? 1;
  const insertRedemption = db.insert(subscriptionRedemptions).values({
    id: opts.redemptionId,
    subscriptionId: opts.subscriptionId,
    orderId: opts.orderId ?? null,
    customerId: opts.customerId ?? sub.customerId,
    washesUsed: used,
    businessDate: opts.businessDate,
    createdAt: opts.createdAt,
  });

  if (sub.kind === "count") {
    const remaining = Math.max(0, (sub.remainingWashes ?? 0) - used);
    await db.batch([
      insertRedemption,
      db
        .update(customerSubscriptions)
        .set({ remainingWashes: remaining, status: remaining <= 0 ? "used_up" : "active" })
        .where(eq(customerSubscriptions.id, opts.subscriptionId)),
    ]);
  } else {
    await db.batch([insertRedemption]);
  }
}

/** Cancel a subscription (e.g. refund). Does not restore redeemed washes. */
export async function cancelSubscription(id: string): Promise<void> {
  await db.update(customerSubscriptions).set({ status: "cancelled" }).where(eq(customerSubscriptions.id, id));
}

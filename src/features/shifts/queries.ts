import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { cashShifts } from "../../db/schema";
import type { CashShift } from "../../db/schema";

export type { CashShift };

const MAIN_BRANCH_ID = "branch-main";

/** The currently open shift for a branch, or null. */
export async function getOpenShift(branchId = MAIN_BRANCH_ID): Promise<CashShift | null> {
  const rows = await db
    .select()
    .from(cashShifts)
    .where(and(eq(cashShifts.branchId, branchId), eq(cashShifts.status, "open")))
    .orderBy(desc(cashShifts.openedAt));
  return rows[0] ?? null;
}

export function listShifts(branchId = MAIN_BRANCH_ID, limit = 30): Promise<CashShift[]> {
  return db
    .select()
    .from(cashShifts)
    .where(eq(cashShifts.branchId, branchId))
    .orderBy(desc(cashShifts.openedAt))
    .limit(limit);
}

export async function openShift(opts: {
  id: string;
  businessDate: string;
  openedBy?: string;
  openingFloat: number; // piastres
  branchId?: string;
  createdAt: string;
}): Promise<void> {
  await db.insert(cashShifts).values({
    id: opts.id,
    businessDate: opts.businessDate,
    openedAt: opts.createdAt,
    openedBy: opts.openedBy ?? null,
    openingFloat: opts.openingFloat,
    status: "open",
    branchId: opts.branchId ?? MAIN_BRANCH_ID,
    createdAt: opts.createdAt,
  });
}

export async function closeShift(opts: {
  id: string;
  closedBy?: string;
  countedCash: number; // piastres
  expectedCash: number; // piastres
  variance: number; // piastres
  note?: string;
  closedAt: string;
}): Promise<void> {
  await db
    .update(cashShifts)
    .set({
      status: "closed",
      closedAt: opts.closedAt,
      closedBy: opts.closedBy ?? null,
      countedCash: opts.countedCash,
      expectedCash: opts.expectedCash,
      variance: opts.variance,
      note: opts.note ?? null,
    })
    .where(eq(cashShifts.id, opts.id));
}

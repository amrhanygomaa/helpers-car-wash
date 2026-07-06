import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { dailyClosures } from "../../db/schema";
import type { DailyClosure } from "../../db/schema";

export const MAIN_BRANCH_ID = "branch-main";

export type { DailyClosure };

export function listDailyClosuresForDate(businessDate: string, branchId = MAIN_BRANCH_ID): Promise<DailyClosure[]> {
  return db
    .select()
    .from(dailyClosures)
    .where(and(eq(dailyClosures.businessDate, businessDate), eq(dailyClosures.branchId, branchId)));
}

export function listDailyClosuresForWorker(workerId: string): Promise<DailyClosure[]> {
  return db
    .select()
    .from(dailyClosures)
    .where(eq(dailyClosures.workerId, workerId))
    .orderBy(desc(dailyClosures.businessDate));
}

type ClosureRow = {
  id: string;
  businessDate: string;
  workerId: string;
  branchId?: string;
  carsCount: number;
  commissionTotal: number;
  baseAmount: number;
  withdrawalsTotal: number;
  netDue: number;
  closedBy?: string;
  closedAt: string;
};

export async function upsertDailyClosure(row: ClosureRow): Promise<void> {
  const branchId = row.branchId ?? MAIN_BRANCH_ID;
  const existing = await db
    .select()
    .from(dailyClosures)
    .where(
      and(
        eq(dailyClosures.businessDate, row.businessDate),
        eq(dailyClosures.workerId, row.workerId),
        eq(dailyClosures.branchId, branchId)
      )
    )
    .limit(1);

  const patch = {
    carsCount: row.carsCount,
    commissionTotal: row.commissionTotal,
    baseAmount: row.baseAmount,
    withdrawalsTotal: row.withdrawalsTotal,
    netDue: row.netDue,
    closedBy: row.closedBy ?? null,
    closedAt: row.closedAt,
  };

  if (existing[0]) {
    await db.update(dailyClosures).set(patch).where(eq(dailyClosures.id, existing[0].id));
    return;
  }

  await db.insert(dailyClosures).values({
    id: row.id,
    businessDate: row.businessDate,
    workerId: row.workerId,
    branchId,
    ...patch,
  });
}

export async function upsertDailyClosures(rows: ClosureRow[]): Promise<void> {
  for (const row of rows) {
    await upsertDailyClosure(row);
  }
}

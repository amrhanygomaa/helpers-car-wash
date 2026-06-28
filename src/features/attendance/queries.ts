import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { workerAttendance } from "../../db/schema";
import type { WorkerAttendance } from "../../db/schema";

export type { WorkerAttendance };

const MAIN_BRANCH_ID = "branch-main";

export function listAttendanceForDate(
  businessDate: string,
  branchId = MAIN_BRANCH_ID,
): Promise<WorkerAttendance[]> {
  return db
    .select()
    .from(workerAttendance)
    .where(and(eq(workerAttendance.businessDate, businessDate), eq(workerAttendance.branchId, branchId)))
    .orderBy(asc(workerAttendance.checkIn));
}

/** The worker's still-open (not checked-out) record for the date, if any. */
export async function getOpenAttendance(
  workerId: string,
  businessDate: string,
  branchId = MAIN_BRANCH_ID,
): Promise<WorkerAttendance | null> {
  const rows = await db
    .select()
    .from(workerAttendance)
    .where(
      and(
        eq(workerAttendance.workerId, workerId),
        eq(workerAttendance.businessDate, businessDate),
        eq(workerAttendance.branchId, branchId),
        isNull(workerAttendance.checkOut),
      ),
    );
  return rows[0] ?? null;
}

export async function checkIn(opts: {
  id: string;
  workerId: string;
  businessDate: string;
  branchId?: string;
  createdAt: string;
}): Promise<void> {
  await db.insert(workerAttendance).values({
    id: opts.id,
    workerId: opts.workerId,
    businessDate: opts.businessDate,
    checkIn: opts.createdAt,
    branchId: opts.branchId ?? MAIN_BRANCH_ID,
    createdAt: opts.createdAt,
  });
}

export async function checkOut(id: string, checkOutAt: string): Promise<void> {
  await db.update(workerAttendance).set({ checkOut: checkOutAt }).where(eq(workerAttendance.id, id));
}

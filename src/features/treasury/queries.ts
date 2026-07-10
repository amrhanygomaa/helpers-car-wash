import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { treasuryEntries, workerWithdrawals } from "../../db/schema";
import type { TreasuryEntry, WorkerWithdrawal } from "../../db/schema";

export const MAIN_BRANCH_ID = "branch-main";

export type { TreasuryEntry, WorkerWithdrawal };

export function listTreasuryEntriesForDate(businessDate: string, branchId = MAIN_BRANCH_ID): Promise<TreasuryEntry[]> {
  return db
    .select()
    .from(treasuryEntries)
    .where(and(eq(treasuryEntries.businessDate, businessDate), eq(treasuryEntries.branchId, branchId)))
    .orderBy(desc(treasuryEntries.createdAt));
}

export function listWorkerWithdrawalsForDate(businessDate: string, branchId = MAIN_BRANCH_ID): Promise<WorkerWithdrawal[]> {
  return db
    .select()
    .from(workerWithdrawals)
    .where(and(eq(workerWithdrawals.businessDate, businessDate), eq(workerWithdrawals.branchId, branchId)))
    .orderBy(desc(workerWithdrawals.createdAt));
}

export function listWorkerWithdrawalsForWorker(workerId: string): Promise<WorkerWithdrawal[]> {
  return db
    .select()
    .from(workerWithdrawals)
    .where(eq(workerWithdrawals.workerId, workerId))
    .orderBy(desc(workerWithdrawals.createdAt));
}

export async function recordTreasuryExpense(opts: {
  id: string;
  businessDate: string;
  amount: number;
  description: string;
  branchId?: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  if (opts.amount <= 0) throw new Error("invalid_amount");
  if (!opts.description.trim()) throw new Error("missing_description");

  await db.insert(treasuryEntries).values({
    id: opts.id,
    businessDate: opts.businessDate,
    type: "expense",
    amount: opts.amount,
    description: opts.description.trim(),
    workerId: null,
    branchId: opts.branchId ?? MAIN_BRANCH_ID,
    createdBy: opts.createdBy ?? null,
    createdAt: opts.createdAt,
  });
}

export async function recordWorkerWithdrawal(opts: {
  withdrawalId: string;
  treasuryEntryId: string;
  workerId: string;
  businessDate: string;
  amount: number;
  reason?: string;
  branchId?: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  if (opts.amount <= 0) throw new Error("invalid_amount");
  if (!opts.workerId) throw new Error("missing_worker");

  const reason = opts.reason?.trim() || "سحب عامل";
  const branchId = opts.branchId ?? MAIN_BRANCH_ID;
  await db.batch([
    db.insert(workerWithdrawals).values({
      id: opts.withdrawalId,
      workerId: opts.workerId,
      amount: opts.amount,
      reason,
      businessDate: opts.businessDate,
      branchId,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
    db.insert(treasuryEntries).values({
      id: opts.treasuryEntryId,
      businessDate: opts.businessDate,
      type: "withdrawal",
      amount: opts.amount,
      description: reason,
      workerId: opts.workerId,
      branchId,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
  ]);
}

export async function recordWorkerFinancialAdjustment(opts: {
  withdrawalId: string;
  treasuryEntryId: string;
  workerId: string;
  businessDate: string;
  amount: number;
  reason: string;
  branchId?: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  if (opts.amount === 0) throw new Error("invalid_amount");
  if (!opts.workerId) throw new Error("missing_worker");

  const branchId = opts.branchId ?? MAIN_BRANCH_ID;
  await db.batch([
    db.insert(workerWithdrawals).values({
      id: opts.withdrawalId,
      workerId: opts.workerId,
      amount: opts.amount,
      reason: opts.reason.trim(),
      businessDate: opts.businessDate,
      branchId,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
    db.insert(treasuryEntries).values({
      id: opts.treasuryEntryId,
      businessDate: opts.businessDate,
      type: "withdrawal",
      amount: opts.amount,
      description: opts.reason.trim(),
      workerId: opts.workerId,
      branchId,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
  ]);
}

export function findWithdrawal(
  businessDate: string,
  workerId: string
): Promise<WorkerWithdrawal[]> {
  return db
    .select()
    .from(workerWithdrawals)
    .where(and(eq(workerWithdrawals.businessDate, businessDate), eq(workerWithdrawals.workerId, workerId)));
}

export async function deleteWorkerWithdrawal(withdrawalId: string): Promise<void> {
  const list = await db
    .select()
    .from(workerWithdrawals)
    .where(eq(workerWithdrawals.id, withdrawalId))
    .limit(1);
  if (!list[0]) return;

  const w = list[0];
  // The withdrawal and its treasury entry are inserted in one batch sharing
  // the same createdAt. Matching on it (plus type) pins the delete to that
  // single entry — (worker, date, amount) alone wiped every same-amount
  // withdrawal the worker made that day.
  await db.batch([
    db.delete(workerWithdrawals).where(eq(workerWithdrawals.id, withdrawalId)),
    db.delete(treasuryEntries).where(
      and(
        eq(treasuryEntries.type, "withdrawal"),
        eq(treasuryEntries.workerId, w.workerId),
        eq(treasuryEntries.businessDate, w.businessDate),
        eq(treasuryEntries.amount, w.amount),
        eq(treasuryEntries.createdAt, w.createdAt)
      )
    )
  ]);
}

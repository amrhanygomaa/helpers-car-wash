/**
 * Pure builder for the "تقرير العمال" tab rows on the reports page.
 *
 * Attribution is multi-worker aware via {@link workerLeaderboard}: a shared
 * service line splits its revenue among its workers and credits each worker
 * with their own commission share. The previous inline logic matched
 * `line.employeeId` only, which credited the first worker with the whole
 * line (revenue + the combined commission) and hid the other workers.
 */
import { workerLeaderboard } from "../../lib/analytics";
import { egpToPiastres } from "../../lib/money";
import type { SalesInvoice } from "../../types";
import type { DailyClosure } from "../../db/schema";
import type { Worker } from "../workers/queries";

export interface WorkerReportRow {
  id: string;
  name: string;
  cars: number;
  servicesCount: number;
  /** Piastres. */
  attributedRevenue: number;
  /** Piastres. */
  commission: number;
  /** Piastres. */
  payrollCost: number;
  /** Piastres. */
  netDue: number;
}

export function buildWorkerReportRows(
  workers: Worker[],
  serviceInvoices: SalesInvoice[],
  dailyClosures: DailyClosure[]
): WorkerReportRow[] {
  const closureMap = new Map<string, { netDue: number; payrollCost: number }>();
  for (const closure of dailyClosures) {
    const current = closureMap.get(closure.workerId) ?? { netDue: 0, payrollCost: 0 };
    current.netDue += closure.netDue;
    current.payrollCost += closure.baseAmount + closure.commissionTotal;
    closureMap.set(closure.workerId, current);
  }

  const perfByWorker = new Map(
    workerLeaderboard(serviceInvoices).map((row) => [row.workerId, row])
  );

  return workers
    .map((worker) => {
      const perf = perfByWorker.get(worker.id);
      const closure = closureMap.get(worker.id);
      return {
        id: worker.id,
        name: worker.name,
        cars: perf?.cars ?? 0,
        servicesCount: perf?.services ?? 0,
        attributedRevenue: egpToPiastres(perf?.attributedRevenue ?? 0),
        commission: egpToPiastres(perf?.commission ?? 0),
        payrollCost: closure?.payrollCost ?? 0,
        netDue: closure?.netDue ?? 0,
      };
    })
    .filter(
      (row) =>
        row.cars > 0 ||
        row.servicesCount > 0 ||
        row.commission > 0 ||
        row.payrollCost > 0 ||
        row.netDue !== 0
    )
    .sort((a, b) => b.attributedRevenue - a.attributedRevenue);
}

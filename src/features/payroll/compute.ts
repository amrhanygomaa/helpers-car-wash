import { egpToPiastres } from "../../lib/money";
import { lineWorkers } from "../../store/_pure";
import type { Worker } from "../../db/schema";
import type { WorkerWithdrawal } from "../treasury/queries";
import type { DailyClosure } from "./queries";
import type { SalesInvoice } from "../../types";

export type DayCloseRow = {
  worker: Worker;
  carsCount: number;
  servicesCount: number;
  commissionTotal: number;
  baseAmount: number;
  withdrawalsTotal: number;
  netDue: number;
  closed?: DailyClosure;
};

export function monthDays(businessDate: string): number {
  const [year, month] = businessDate.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(year, month, 0).getDate();
}

export function dailyBaseAmount(worker: Worker, businessDate: string): number {
  const base = worker.baseWage ?? 0;
  if (worker.wageType === "daily_fixed") return base;
  if (worker.wageType === "monthly") return Math.round(base / monthDays(businessDate));
  return 0;
}

export function calcDayCloseRows(opts: {
  workers: Worker[];
  invoices: SalesInvoice[];
  withdrawals: WorkerWithdrawal[];
  closures: DailyClosure[];
  businessDate: string;
}): DayCloseRow[] {
  const invoices = opts.invoices.filter(
    (invoice) =>
      invoice.invoiceKind === "service" &&
      !invoice.cancelled &&
      invoice.date === opts.businessDate
  );
  const withdrawalMap = new Map<string, number>();
  for (const withdrawal of opts.withdrawals) {
    withdrawalMap.set(
      withdrawal.workerId,
      (withdrawalMap.get(withdrawal.workerId) ?? 0) + withdrawal.amount
    );
  }
  const closureMap = new Map(opts.closures.map((closure) => [closure.workerId, closure]));

  return opts.workers
    .filter((worker) => worker.active)
    .map((worker) => {
      const carIds = new Set<string>();
      let servicesCount = 0;
      let commissionEgp = 0;
      for (const invoice of invoices) {
        for (const line of invoice.lines) {
          if (line.kind !== "service") continue;
          const share = lineWorkers(line).find((w) => w.workerId === worker.id);
          if (!share) continue;
          carIds.add(invoice.id);
          servicesCount += line.quantity;
          commissionEgp += share.commissionAmount ?? 0;
        }
      }
      const commissionTotal = egpToPiastres(commissionEgp);
      const baseAmount = dailyBaseAmount(worker, opts.businessDate);
      const withdrawalsTotal = withdrawalMap.get(worker.id) ?? 0;
      return {
        worker,
        carsCount: carIds.size,
        servicesCount,
        commissionTotal,
        baseAmount,
        withdrawalsTotal,
        netDue: baseAmount + commissionTotal - withdrawalsTotal,
        closed: closureMap.get(worker.id),
      };
    });
}

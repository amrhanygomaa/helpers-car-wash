/**
 * Pure, testable analytics for the Car Wash reports (تحليلات احترافية).
 * All functions derive from the in-range service invoices the page already has,
 * so they add no storage and stay offline.
 */
import type { SalesInvoice } from "../types";
import { lineWorkers } from "../store/_pure";

type AnalyticsInvoice = Pick<
  SalesInvoice,
  "id" | "date" | "finalizedAt" | "total" | "cancelled" | "invoiceKind" | "lines"
>;

function isCountable(inv: AnalyticsInvoice): boolean {
  return !inv.cancelled && inv.invoiceKind === "service";
}

export interface HourBucket {
  hour: number; // 0–23
  count: number;
  revenue: number;
}

/**
 * Distribution of finalized washes across the hours of the day. Only invoices
 * with a `finalizedAt` timestamp are bucketed (date-only invoices have no time).
 */
export function peakHours(invoices: AnalyticsInvoice[]): HourBucket[] {
  const buckets = new Map<number, { count: number; revenue: number }>();
  for (const inv of invoices) {
    if (!isCountable(inv) || !inv.finalizedAt) continue;
    const d = new Date(inv.finalizedAt);
    if (Number.isNaN(d.getTime())) continue;
    const hour = d.getHours();
    const b = buckets.get(hour) ?? { count: 0, revenue: 0 };
    b.count += 1;
    b.revenue += inv.total;
    buckets.set(hour, b);
  }
  return [...buckets.entries()]
    .map(([hour, v]) => ({ hour, ...v }))
    .sort((a, b) => a.hour - b.hour);
}

export interface ServiceStat {
  name: string;
  count: number;
  revenue: number;
}

/** Service popularity by total quantity + revenue, most-revenue first. */
export function topServices(invoices: AnalyticsInvoice[]): ServiceStat[] {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const inv of invoices) {
    if (!isCountable(inv)) continue;
    for (const l of inv.lines) {
      if (l.kind !== "service") continue;
      const e = map.get(l.productName) ?? { count: 0, revenue: 0 };
      e.count += l.quantity > 0 ? l.quantity : 1;
      e.revenue += l.subtotal;
      map.set(l.productName, e);
    }
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface TicketSummary {
  count: number;
  total: number;
  average: number;
}

/** Number of washes, total revenue and the average ticket value. */
export function averageTicket(invoices: AnalyticsInvoice[]): TicketSummary {
  let count = 0;
  let total = 0;
  for (const inv of invoices) {
    if (!isCountable(inv)) continue;
    count += 1;
    total += inv.total;
  }
  return { count, total, average: count ? total / count : 0 };
}

export interface WorkerLeaderRow {
  workerId: string;
  cars: number;
  services: number;
  commission: number;
  attributedRevenue: number;
}

/**
 * Per-worker performance over the invoices, multi-worker aware. A car counts
 * once per participating worker; attributed revenue splits a line equally among
 * its workers. Sorted by commission earned (highest first).
 */
export function workerLeaderboard(invoices: AnalyticsInvoice[]): WorkerLeaderRow[] {
  const map = new Map<
    string,
    { services: number; commission: number; attributedRevenue: number; cars: Set<string> }
  >();
  for (const inv of invoices) {
    if (!isCountable(inv)) continue;
    for (const l of inv.lines) {
      if (l.kind !== "service") continue;
      const workers = lineWorkers(l);
      for (const w of workers) {
        const row =
          map.get(w.workerId) ?? { services: 0, commission: 0, attributedRevenue: 0, cars: new Set<string>() };
        row.cars.add(inv.id);
        row.services += l.quantity > 0 ? l.quantity : 1;
        row.commission += w.commissionAmount ?? 0;
        row.attributedRevenue += l.subtotal / workers.length;
        map.set(w.workerId, row);
      }
    }
  }
  return [...map.entries()]
    .map(([workerId, r]) => ({
      workerId,
      cars: r.cars.size,
      services: r.services,
      commission: r.commission,
      attributedRevenue: r.attributedRevenue,
    }))
    .sort((a, b) => b.commission - a.commission);
}

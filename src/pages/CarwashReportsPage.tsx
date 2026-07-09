import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Car,
  Coins,
  Download,
  Printer,
  Wallet,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { hasDb } from "../db/client";
import {
  loadCarwashReportSnapshot,
  type CarwashReportDbSnapshot,
} from "../features/reports/carwash-report-queries";
import { listAllWorkers, type Worker } from "../features/workers/queries";
import { formatDate, formatCurrency } from "../lib/format";
import { peakHours, topServices, averageTicket, workerLeaderboard } from "../lib/analytics";
import { egpToPiastres, formatPiastres, piastresToEgp } from "../lib/money";
import { getMonthsInRange, inRange, localISODate, todayISO } from "../lib/utils";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import type { InvoiceLine, SalesInvoice, WashService } from "../types";

type DailyReportRow = {
  date: string;
  cars: number;
  revenue: number;
  collected: number;
  outstanding: number;
  problems: number;
  productCogs: number;
  materialCogs: number;
  expenses: number;
  payrollCost: number;
  netProfit: number;
};

type MonthlyReportRow = {
  month: string;
  cars: number;
  revenue: number;
  productSold: number;
  productBought: number;
  materialConsumed: number;
  expenses: number;
  payrollCost: number;
  netProfit: number;
};

const EMPTY_SNAPSHOT: CarwashReportDbSnapshot = {
  products: [],
  productMovements: [],
  rawMaterials: [],
  materialMovements: [],
  treasuryEntries: [],
  dailyClosures: [],
};

function dateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(localISODate(d));
  }
  return days;
}

function moneyCell(value: number, currency: string, tone?: "green" | "red" | "amber") {
  const color =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-rose-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-slate-900";
  return <span className={`font-medium ${color}`}>{formatPiastres(value, currency)}</span>;
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "rose" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function serviceName(line: InvoiceLine, services: WashService[]): string {
  return services.find((service) => service.id === line.serviceId)?.name ?? line.productName ?? "";
}

function classifyCar(invoice: SalesInvoice, services: WashService[]) {
  let hasInterior = false;
  let hasExterior = false;
  for (const line of invoice.lines) {
    if (line.kind !== "service") continue;
    const service = services.find((s) => s.id === line.serviceId);
    const washType = service?.washType;
    if (washType) {
      if (washType === "exterior") hasExterior = true;
      if (washType === "interior") hasInterior = true;
      if (washType === "full") { hasExterior = true; hasInterior = true; }
    } else {
      // Fallback: infer from Arabic service name for services without explicit washType
      const name = serviceName(line, services);
      const normalized = name.replace(/\s+/g, "");
      if (/داخ|جوه|جوّه|سقف|كراسي|صالون|فرش/.test(normalized)) hasInterior = true;
      if (/خار|بره|برّة|بره|موتور|جسم/.test(normalized)) hasExterior = true;
      if (/كامل|برّةوجوّه|برهوجوه|برةوجوة/.test(normalized)) {
        hasInterior = true; hasExterior = true;
      }
    }
  }
  if (hasInterior && hasExterior) return "both";
  if (hasInterior) return "interior";
  if (hasExterior) return "exterior";
  return "other";
}

function lineProductCogsPiastres(invoices: SalesInvoice[], productPurchasePrice: Map<string, number>) {
  const byDate = new Map<string, number>();
  for (const invoice of invoices) {
    let value = 0;
    for (const line of invoice.lines) {
      if (line.kind !== "product") continue;
      value += (productPurchasePrice.get(line.productId) ?? 0) * line.quantity;
    }
    byDate.set(invoice.date, (byDate.get(invoice.date) ?? 0) + value);
  }
  return byDate;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CarwashReportsPage() {
  const { salesInvoices } = useInvoicing();
  const { washServices } = useCarwash();
  const { settings } = useSettings();
  const currency = settings.currency;

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [snapshot, setSnapshot] = useState<CarwashReportDbSnapshot>(EMPTY_SNAPSHOT);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);

  const branchId = settings.currentBranchId || "branch-main";

  const loadDbData = useCallback(async () => {
    if (!hasDb()) {
      setSnapshot(EMPTY_SNAPSHOT);
      setWorkers([]);
      return;
    }
    setLoadingDb(true);
    try {
      const [reportSnapshot, allWorkers] = await Promise.all([
        loadCarwashReportSnapshot(from, to, branchId),
        listAllWorkers(),
      ]);
      setSnapshot(reportSnapshot);
      setWorkers(allWorkers);
    } finally {
      setLoadingDb(false);
    }
  }, [from, to, branchId]);

  useEffect(() => {
    loadDbData();
  }, [loadDbData]);

  const serviceInvoices = useMemo(
    () =>
      salesInvoices.filter(
        (invoice) =>
          invoice.invoiceKind === "service" &&
          !invoice.cancelled &&
          inRange(invoice.date, from, to)
      ),
    [salesInvoices, from, to]
  );

  // ── Analytics (تحليلات) — derived from the in-range service invoices ──────────
  const hourBuckets = useMemo(() => peakHours(serviceInvoices), [serviceInvoices]);
  const maxHourCount = useMemo(() => Math.max(1, ...hourBuckets.map((b) => b.count)), [hourBuckets]);
  const serviceStats = useMemo(() => topServices(serviceInvoices), [serviceInvoices]);
  const ticketSummary = useMemo(() => averageTicket(serviceInvoices), [serviceInvoices]);
  const leaderboard = useMemo(() => workerLeaderboard(serviceInvoices), [serviceInvoices]);
  const workerNameById = useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);

  const productPurchasePrice = useMemo(
    () => new Map(snapshot.products.map((product) => [product.id, product.purchasePrice])),
    [snapshot.products]
  );

  const productCogsByDate = useMemo(
    () => lineProductCogsPiastres(serviceInvoices, productPurchasePrice),
    [serviceInvoices, productPurchasePrice]
  );

  const materialCogsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const movement of snapshot.materialMovements) {
      if (movement.type !== "consumption") continue;
      const value = Math.abs(movement.qty) * movement.unitCost;
      map.set(movement.businessDate, (map.get(movement.businessDate) ?? 0) + value);
    }
    return map;
  }, [snapshot.materialMovements]);

  const expensesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of snapshot.treasuryEntries) {
      if (entry.type !== "expense") continue;
      map.set(entry.businessDate, (map.get(entry.businessDate) ?? 0) + entry.amount);
    }
    return map;
  }, [snapshot.treasuryEntries]);

  const payrollByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const closure of snapshot.dailyClosures) {
      const value = closure.baseAmount + closure.commissionTotal;
      map.set(closure.businessDate, (map.get(closure.businessDate) ?? 0) + value);
    }
    return map;
  }, [snapshot.dailyClosures]);

  const dailyRows = useMemo<DailyReportRow[]>(() => {
    return dateRange(from, to).map((date) => {
      const invoices = serviceInvoices.filter((invoice) => invoice.date === date);
      const revenue = invoices.reduce((sum, invoice) => sum + egpToPiastres(invoice.total), 0);
      const collected = invoices.reduce((sum, invoice) => sum + egpToPiastres(invoice.amountReceived), 0);
      const outstanding = invoices.reduce((sum, invoice) => sum + egpToPiastres(invoice.remaining), 0);
      const productCogs = productCogsByDate.get(date) ?? 0;
      const materialCogs = materialCogsByDate.get(date) ?? 0;
      const expenses = expensesByDate.get(date) ?? 0;
      const payrollCost = payrollByDate.get(date) ?? 0;
      return {
        date,
        cars: invoices.length,
        revenue,
        collected,
        outstanding,
        problems: invoices.filter((invoice) => Boolean(invoice.notes?.trim())).length,
        productCogs,
        materialCogs,
        expenses,
        payrollCost,
        netProfit: revenue - productCogs - materialCogs - expenses - payrollCost,
      };
    });
  }, [
    from,
    to,
    serviceInvoices,
    productCogsByDate,
    materialCogsByDate,
    expensesByDate,
    payrollByDate,
  ]);

  const monthlyRows = useMemo<MonthlyReportRow[]>(() => {
    const map = new Map<string, MonthlyReportRow>();
    for (const month of getMonthsInRange(from, to)) {
      map.set(month, {
        month,
        cars: 0,
        revenue: 0,
        productSold: 0,
        productBought: 0,
        materialConsumed: 0,
        expenses: 0,
        payrollCost: 0,
        netProfit: 0,
      });
    }
    for (const row of dailyRows) {
      const entry = map.get(row.date.slice(0, 7));
      if (!entry) continue;
      entry.cars += row.cars;
      entry.revenue += row.revenue;
      entry.materialConsumed += row.materialCogs;
      entry.expenses += row.expenses;
      entry.payrollCost += row.payrollCost;
      entry.netProfit += row.netProfit;
    }
    for (const movement of snapshot.productMovements) {
      const entry = map.get(movement.businessDate.slice(0, 7));
      if (!entry) continue;
      if (movement.type === "sale") entry.productSold += movement.qty * movement.unitPrice;
      if (movement.type === "purchase") entry.productBought += movement.qty * movement.unitPrice;
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [from, to, dailyRows, snapshot.productMovements]);

  const overview = useMemo(() => {
    return dailyRows.reduce(
      (acc, row) => ({
        cars: acc.cars + row.cars,
        revenue: acc.revenue + row.revenue,
        collected: acc.collected + row.collected,
        outstanding: acc.outstanding + row.outstanding,
        problems: acc.problems + row.problems,
        cogs: acc.cogs + row.productCogs + row.materialCogs,
        expenses: acc.expenses + row.expenses,
        payroll: acc.payroll + row.payrollCost,
        netProfit: acc.netProfit + row.netProfit,
      }),
      {
        cars: 0,
        revenue: 0,
        collected: 0,
        outstanding: 0,
        problems: 0,
        cogs: 0,
        expenses: 0,
        payroll: 0,
        netProfit: 0,
      }
    );
  }, [dailyRows]);

  const carBreakdown = useMemo(() => {
    const counts = { total: serviceInvoices.length, interior: 0, exterior: 0, both: 0, other: 0 };
    for (const invoice of serviceInvoices) {
      const kind = classifyCar(invoice, washServices);
      counts[kind] += 1;
    }
    return counts;
  }, [serviceInvoices, washServices]);

  const problemRows = useMemo(
    () =>
      serviceInvoices
        .filter((invoice) => Boolean(invoice.notes?.trim()))
        .map((invoice) => ({
          id: invoice.id,
          date: invoice.date,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          notes: invoice.notes ?? "",
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [serviceInvoices]
  );

  const workerRows = useMemo(() => {
    const closureMap = new Map<string, { netDue: number; payrollCost: number }>();
    for (const closure of snapshot.dailyClosures) {
      const current = closureMap.get(closure.workerId) ?? { netDue: 0, payrollCost: 0 };
      current.netDue += closure.netDue;
      current.payrollCost += closure.baseAmount + closure.commissionTotal;
      closureMap.set(closure.workerId, current);
    }

    return workers
      .map((worker) => {
        const carIds = new Set<string>();
        let servicesCount = 0;
        let attributedRevenue = 0;
        let commission = 0;
        for (const invoice of serviceInvoices) {
          for (const line of invoice.lines) {
            if (line.kind !== "service" || line.employeeId !== worker.id) continue;
            carIds.add(invoice.id);
            servicesCount += line.quantity;
            attributedRevenue += egpToPiastres(line.subtotal);
            commission += egpToPiastres(line.commissionAmount ?? 0);
          }
        }
        const closure = closureMap.get(worker.id);
        return {
          id: worker.id,
          name: worker.name,
          cars: carIds.size,
          servicesCount,
          attributedRevenue,
          commission,
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
  }, [workers, serviceInvoices, snapshot.dailyClosures]);

  const productRows = useMemo(() => {
    return snapshot.products
      .map((product) => {
        let boughtQty = 0;
        let boughtCost = 0;
        let soldQty = 0;
        let soldRevenue = 0;
        for (const movement of snapshot.productMovements) {
          if (movement.productId !== product.id) continue;
          if (movement.type === "purchase") {
            boughtQty += movement.qty;
            boughtCost += movement.qty * movement.unitPrice;
          }
          if (movement.type === "sale") {
            soldQty += movement.qty;
            soldRevenue += movement.qty * movement.unitPrice;
          }
        }
        const soldCogs = soldQty * product.purchasePrice;
        return {
          id: product.id,
          name: product.name,
          stock: product.stockQty,
          boughtQty,
          boughtCost,
          soldQty,
          soldRevenue,
          profit: soldRevenue - soldCogs,
        };
      })
      .sort((a, b) => b.soldRevenue - a.soldRevenue || a.name.localeCompare(b.name));
  }, [snapshot.products, snapshot.productMovements]);

  const materialRows = useMemo(() => {
    return snapshot.rawMaterials
      .map((material) => {
        let purchasedQty = 0;
        let purchasedCost = 0;
        let consumedQty = 0;
        let consumedCost = 0;
        for (const movement of snapshot.materialMovements) {
          if (movement.materialId !== material.id) continue;
          const qty = Math.abs(movement.qty);
          if (movement.type === "purchase") {
            purchasedQty += qty;
            purchasedCost += qty * movement.unitCost;
          }
          if (movement.type === "consumption") {
            consumedQty += qty;
            consumedCost += qty * movement.unitCost;
          }
        }
        return {
          id: material.id,
          name: material.name,
          unit: material.unit,
          stock: material.stockQty,
          purchasedQty,
          purchasedCost,
          consumedQty,
          consumedCost,
        };
      })
      .sort((a, b) => b.consumedCost - a.consumedCost || a.name.localeCompare(b.name));
  }, [snapshot.rawMaterials, snapshot.materialMovements]);

  function setRangeToday() {
    const t = todayISO();
    setFrom(t);
    setTo(t);
  }

  function setRangeThisMonth() {
    const now = new Date();
    setFrom(localISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setTo(todayISO());
  }

  function exportDaily() {
    downloadCsv(`carwash-daily-${from}-${to}.csv`, [
      ["التاريخ", "السيارات", "الإيراد", "المحصل", "تكلفة الخامات", "مصروفات", "أجور", "صافي الربح", "مشاكل"],
      ...dailyRows.map((row) => [
        row.date,
        String(row.cars),
        String(piastresToEgp(row.revenue)),
        String(piastresToEgp(row.collected)),
        String(piastresToEgp(row.productCogs + row.materialCogs)),
        String(piastresToEgp(row.expenses)),
        String(piastresToEgp(row.payrollCost)),
        String(piastresToEgp(row.netProfit)),
        String(row.problems),
      ]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="تقارير الغسيل"
        description="تقارير يومية وشهرية للغسيل، العمال، الإضافات، الخامات، وصافي الربح."
        actions={
          <>
            <Button variant="outline" onClick={exportDaily}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> طباعة / PDF
            </Button>
          </>
        }
      />

      <Card className="mb-4 print:hidden">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={setRangeToday}>
            اليوم
          </Button>
          <Button variant="outline" onClick={setRangeThisMonth}>
            هذا الشهر
          </Button>
          {loadingDb ? <span className="text-xs text-slate-400">جاري تحميل بيانات الإضافات والخامات...</span> : null}
        </CardBody>
      </Card>

      {!hasDb() ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>تقارير الإضافات والخامات والخزينة تحتاج نسخة سطح المكتب؛ سيتم عرض بيانات الفواتير المتاحة فقط.</span>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stat icon={<Car className="h-5 w-5" />} label="سيارات" value={String(overview.cars)} tone="blue" />
        <Stat icon={<Coins className="h-5 w-5" />} label="إيراد" value={formatPiastres(overview.revenue, currency)} tone="green" />
        <Stat icon={<Warehouse className="h-5 w-5" />} label="تكلفة الخامات" value={formatPiastres(overview.cogs, currency)} tone="amber" />
        <Stat icon={<Wallet className="h-5 w-5" />} label="مصروفات + أجور" value={formatPiastres(overview.expenses + overview.payroll, currency)} tone="rose" />
        <Stat
          icon={<BarChart3 className="h-5 w-5" />}
          label="صافي الربح"
          value={formatPiastres(overview.netProfit, currency)}
          tone={overview.netProfit >= 0 ? "green" : "rose"}
        />
      </div>

      <Tabs defaultValue="daily">
        <TabsList className="print:hidden">
          <TabsTrigger value="daily">يومي</TabsTrigger>
          <TabsTrigger value="monthly">شهري</TabsTrigger>
          <TabsTrigger value="workers">العمال</TabsTrigger>
          <TabsTrigger value="inventory">الإضافات والخامات</TabsTrigger>
          <TabsTrigger value="analytics">تحليلات</TabsTrigger>
        </TabsList>

        <TabsContent value="daily">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="التقرير اليومي" subtitle="الإيراد ناقص تكلفة الإضافات والخامات والمصروفات والأجور." />
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>التاريخ</TH>
                      <TH className="text-end">سيارات</TH>
                      <TH className="text-end">إيراد</TH>
                      <TH className="text-end">محصل</TH>
                      <TH className="text-end">تكلفة الخامات</TH>
                      <TH className="text-end">مصروفات</TH>
                      <TH className="text-end">أجور</TH>
                      <TH className="text-end">صافي</TH>
                      <TH className="text-end">مشاكل</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {dailyRows.map((row) => (
                      <TR key={row.date}>
                        <TD className="font-medium">{formatDate(row.date)}</TD>
                        <TD className="text-end">{row.cars}</TD>
                        <TD className="text-end">{moneyCell(row.revenue, currency, "green")}</TD>
                        <TD className="text-end">{moneyCell(row.collected, currency)}</TD>
                        <TD className="text-end">{moneyCell(row.productCogs + row.materialCogs, currency, "amber")}</TD>
                        <TD className="text-end">{moneyCell(row.expenses, currency, "red")}</TD>
                        <TD className="text-end">{moneyCell(row.payrollCost, currency, "red")}</TD>
                        <TD className="text-end">{moneyCell(row.netProfit, currency, row.netProfit >= 0 ? "green" : "red")}</TD>
                        <TD className="text-end">{row.problems}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="تقسيم السيارات" />
              <CardBody className="space-y-3">
                <BreakdownRow label="الإجمالي" value={carBreakdown.total} />
                <BreakdownRow label="خارجي فقط" value={carBreakdown.exterior} />
                <BreakdownRow label="داخلي فقط" value={carBreakdown.interior} />
                <BreakdownRow label="خارجي + داخلي" value={carBreakdown.both} />
                <BreakdownRow label="غير مصنف" value={carBreakdown.other} />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="الملاحظات والمشاكل المسجلة" subtitle="أي فاتورة غسيل بها ملاحظات تظهر هنا للمراجعة." />
            <CardBody className="p-0">
              {problemRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">لا توجد ملاحظات مسجلة في الفترة.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>التاريخ</TH>
                      <TH>الفاتورة</TH>
                      <TH>العميل</TH>
                      <TH>الملاحظة</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {problemRows.map((row) => (
                      <TR key={row.id}>
                        <TD>{formatDate(row.date)}</TD>
                        <TD>{row.invoiceNumber}</TD>
                        <TD>{row.customerName}</TD>
                        <TD className="text-slate-700">{row.notes}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardHeader title="التقرير الشهري" subtitle="إضافات مباعة وكميات مضافة، مع مكونات صافي الربح." />
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>الشهر</TH>
                    <TH className="text-end">سيارات</TH>
                    <TH className="text-end">إيراد</TH>
                    <TH className="text-end">إضافات مباعة</TH>
                    <TH className="text-end">كميات مضافة</TH>
                    <TH className="text-end">خامات مستهلكة</TH>
                    <TH className="text-end">مصروفات</TH>
                    <TH className="text-end">أجور</TH>
                    <TH className="text-end">صافي الربح</TH>
                  </TR>
                </THead>
                <TBody>
                  {monthlyRows.map((row) => (
                    <TR key={row.month}>
                      <TD className="font-medium">{row.month}</TD>
                      <TD className="text-end">{row.cars}</TD>
                      <TD className="text-end">{moneyCell(row.revenue, currency, "green")}</TD>
                      <TD className="text-end">{moneyCell(row.productSold, currency)}</TD>
                      <TD className="text-end">{moneyCell(row.productBought, currency, "amber")}</TD>
                      <TD className="text-end">{moneyCell(row.materialConsumed, currency, "amber")}</TD>
                      <TD className="text-end">{moneyCell(row.expenses, currency, "red")}</TD>
                      <TD className="text-end">{moneyCell(row.payrollCost, currency, "red")}</TD>
                      <TD className="text-end">{moneyCell(row.netProfit, currency, row.netProfit >= 0 ? "green" : "red")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card>
            <CardHeader title="تقرير العمال" subtitle="سيارات وخدمات وعمولات منسوبة لكل عامل خلال الفترة." />
            <CardBody className="p-0">
              {workerRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">لا يوجد نشاط منسوب للعمال في الفترة.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>العامل</TH>
                      <TH className="text-end">سيارات</TH>
                      <TH className="text-end">خدمات</TH>
                      <TH className="text-end">إيراد منسوب</TH>
                      <TH className="text-end">عمولة يدوية</TH>
                      <TH className="text-end">تكلفة أجور محفوظة</TH>
                      <TH className="text-end">صافي مستحق محفوظ</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {workerRows.map((row) => (
                      <TR key={row.id}>
                        <TD className="font-medium">{row.name}</TD>
                        <TD className="text-end">{row.cars}</TD>
                        <TD className="text-end">{row.servicesCount}</TD>
                        <TD className="text-end">{moneyCell(row.attributedRevenue, currency)}</TD>
                        <TD className="text-end">{moneyCell(row.commission, currency, "green")}</TD>
                        <TD className="text-end">{moneyCell(row.payrollCost, currency, "red")}</TD>
                        <TD className="text-end">{moneyCell(row.netDue, currency, row.netDue >= 0 ? undefined : "red")}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="تقرير إضافات الغسيل" subtitle="كميات مضافة ومباعة وربح تقديري لكل إضافة." />
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>الإضافة</TH>
                      <TH className="text-end">الرصيد</TH>
                      <TH className="text-end">مضافة</TH>
                      <TH className="text-end">مباعة</TH>
                      <TH className="text-end">إيراد بيع</TH>
                      <TH className="text-end">ربح تقديري</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {productRows.length === 0 ? (
                      <TR>
                        <TD colSpan={6} className="py-8 text-center text-slate-500">لا توجد إضافات.</TD>
                      </TR>
                    ) : (
                      productRows.map((row) => (
                        <TR key={row.id}>
                          <TD className="font-medium">{row.name}</TD>
                          <TD className="text-end">{row.stock}</TD>
                          <TD className="text-end">{row.boughtQty}</TD>
                          <TD className="text-end">{row.soldQty}</TD>
                          <TD className="text-end">{moneyCell(row.soldRevenue, currency)}</TD>
                          <TD className="text-end">{moneyCell(row.profit, currency, row.profit >= 0 ? "green" : "red")}</TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="تقرير الخامات" subtitle="توريد واستهلاك الخامات خلال الفترة." />
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>الخامة</TH>
                      <TH className="text-end">الرصيد</TH>
                      <TH className="text-end">توريد</TH>
                      <TH className="text-end">استهلاك</TH>
                      <TH className="text-end">تكلفة الاستهلاك</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {materialRows.length === 0 ? (
                      <TR>
                        <TD colSpan={5} className="py-8 text-center text-slate-500">لا توجد خامات.</TD>
                      </TR>
                    ) : (
                      materialRows.map((row) => (
                        <TR key={row.id}>
                          <TD className="font-medium">{row.name}</TD>
                          <TD className="text-end">{row.stock} {row.unit}</TD>
                          <TD className="text-end">{row.purchasedQty}</TD>
                          <TD className="text-end">{row.consumedQty}</TD>
                          <TD className="text-end">{moneyCell(row.consumedCost, currency, "amber")}</TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mb-4">
            <Card>
              <CardBody>
                <div className="text-xs text-slate-500">عدد الغسلات</div>
                <div className="text-2xl font-bold text-slate-900">{ticketSummary.count}</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="text-xs text-slate-500">إجمالي الإيراد</div>
                <div className="text-2xl font-bold text-emerald-700">{formatCurrency(ticketSummary.total, currency)}</div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="text-xs text-slate-500">متوسط الفاتورة</div>
                <div className="text-2xl font-bold text-blue-700">{formatCurrency(ticketSummary.average, currency)}</div>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="ساعات الذروة" subtitle="توزيع الغسلات على ساعات اليوم" />
              <CardBody>
                {hourBuckets.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6">لا توجد فواتير بوقت محدد في هذه الفترة</div>
                ) : (
                  <div className="space-y-1.5">
                    {hourBuckets.map((b) => (
                      <div key={b.hour} className="flex items-center gap-2 text-xs">
                        <span className="w-14 shrink-0 text-slate-500 tabular-nums">
                          {String(b.hour).padStart(2, "0")}:00
                        </span>
                        <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
                          <MiniBar pct={Math.round((b.count / maxHourCount) * 100)} />
                        </div>
                        <span className="w-8 shrink-0 text-end font-medium text-slate-700">{b.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="أكثر الخدمات طلباً" subtitle="حسب الإيراد" />
              <CardBody className="p-0">
                {serviceStats.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6">لا توجد خدمات في هذه الفترة</div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>الخدمة</TH>
                        <TH className="text-end">العدد</TH>
                        <TH className="text-end">الإيراد</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {serviceStats.slice(0, 10).map((s) => (
                        <TR key={s.name}>
                          <TD className="font-medium text-slate-900">{s.name}</TD>
                          <TD className="text-end">{s.count}</TD>
                          <TD className="text-end font-medium">{formatCurrency(s.revenue, currency)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader title="لوحة أداء الصنايعية" subtitle="السيارات والعمولات في الفترة" />
              <CardBody className="p-0">
                {leaderboard.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6">لا توجد بيانات أداء في هذه الفترة</div>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>الصنايعي</TH>
                        <TH className="text-end">سيارات</TH>
                        <TH className="text-end">خدمات</TH>
                        <TH className="text-end">إيراد منسوب</TH>
                        <TH className="text-end">العمولة</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {leaderboard.map((row, idx) => (
                        <TR key={row.workerId}>
                          <TD className="font-medium text-slate-900">
                            {idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : ""}
                            {workerNameById.get(row.workerId) ?? "—"}
                          </TD>
                          <TD className="text-end">{row.cars}</TD>
                          <TD className="text-end">{row.services}</TD>
                          <TD className="text-end">{formatCurrency(row.attributedRevenue, currency)}</TD>
                          <TD className="text-end font-medium text-amber-700">{formatCurrency(row.commission, currency)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Horizontal bar whose width is set via a CSS variable (avoids inline styles). */
function MiniBar({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty("--pct", `${Math.min(100, Math.max(0, pct))}%`);
  }, [pct]);
  return <div ref={ref} className="progress-fill h-full bg-brand-500 rounded" />;
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <Badge tone="blue">{value}</Badge>
    </div>
  );
}

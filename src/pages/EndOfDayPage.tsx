import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, CalendarDays } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency } from "../lib/format";
import { formatPiastres } from "../lib/money";
import { todayISO } from "../lib/utils";
import { hasDb } from "../db/client";
import { endOfDaySales, endOfDayCash } from "../lib/endOfDay";
import { calcDayCloseRows, type DayCloseRow } from "../features/payroll/compute";
import { listAllWorkers } from "../features/workers/queries";
import { listWorkerWithdrawalsForDate } from "../features/treasury/queries";
import { listDailyClosuresForDate } from "../features/payroll/queries";

export function EndOfDayPage() {
  const { salesInvoices, cashEntries } = useInvoicing();
  const { settings } = useSettings();
  const currency = settings.currency;
  const branchId = settings.currentBranchId || "branch-main";

  const [date, setDate] = useState(todayISO());
  const [workerRows, setWorkerRows] = useState<DayCloseRow[]>([]);

  const sales = useMemo(() => endOfDaySales(salesInvoices, date), [salesInvoices, date]);
  const cash = useMemo(() => endOfDayCash(cashEntries, date), [cashEntries, date]);

  const loadWorkers = useCallback(async () => {
    if (!hasDb()) { setWorkerRows([]); return; }
    try {
      const [workers, withdrawals, closures] = await Promise.all([
        listAllWorkers(),
        listWorkerWithdrawalsForDate(date, branchId),
        listDailyClosuresForDate(date, branchId),
      ]);
      setWorkerRows(calcDayCloseRows({ workers, invoices: salesInvoices, withdrawals, closures, businessDate: date }));
    } catch {
      setWorkerRows([]);
    }
  }, [date, branchId, salesInvoices]);

  useEffect(() => { void loadWorkers(); }, [loadWorkers]);

  const workerDuesTotal = useMemo(() => workerRows.reduce((s, r) => s + r.netDue, 0), [workerRows]);
  const company = settings.companyNameAr || settings.companyName || "Top Gear";

  return (
    <>
      <PageHeader
        title="تقرير نهاية اليوم"
        description="ملخّص شامل لليوم: المبيعات، النقدية، السيارات، ومستحقات الصنايعية."
        actions={
          <div className="flex items-end gap-2 print:hidden">
            <Field label="التاريخ">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Button onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> طباعة
            </Button>
          </div>
        }
      />

      <div className="hidden print:block mb-4 text-center">
        <div className="text-lg font-bold">{company}</div>
        <div className="text-sm text-slate-600 flex items-center justify-center gap-1">
          <CalendarDays className="w-4 h-4" /> تقرير نهاية اليوم — {date}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Metric label="سيارات مغسولة" value={String(sales.cars)} tone="blue" />
        <Metric label="إجمالي المبيعات" value={formatCurrency(sales.revenue, currency)} tone="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="حركة الخزنة" />
          <CardBody className="space-y-2 text-sm">
            <Row label="إجمالي الداخل" value={formatCurrency(cash.cashIn, currency)} tone="green" />
            <Row label="إجمالي الخارج" value={formatCurrency(cash.cashOut, currency)} tone="rose" />
            <div className="border-t pt-2">
              <Row label="صافي الحركة" value={formatCurrency(cash.net, currency)} strong />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="مستحقات الصنايعية" subtitle="صافي المستحق لكل صنايعي عن اليوم" />
          <CardBody className="p-0">
            {workerRows.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">لا توجد بيانات صنايعية لهذا اليوم</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>الصنايعي</TH>
                    <TH className="text-end">سيارات</TH>
                    <TH className="text-end">عمولة</TH>
                    <TH className="text-end">صافي المستحق</TH>
                  </TR>
                </THead>
                <TBody>
                  {workerRows.map((r) => (
                    <TR key={r.worker.id}>
                      <TD className="font-medium text-slate-900">{r.worker.name}</TD>
                      <TD className="text-end">{r.carsCount}</TD>
                      <TD className="text-end">{formatPiastres(r.commissionTotal)}</TD>
                      <TD className="text-end font-medium text-emerald-700">{formatPiastres(r.netDue)}</TD>
                    </TR>
                  ))}
                  <TR>
                    <TD className="font-bold" colSpan={3}>الإجمالي</TD>
                    <TD className="text-end font-bold">{formatPiastres(workerDuesTotal)}</TD>
                  </TR>
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "blue" | "green" | "amber" | "slate" }) {
  const tones = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-900",
  } as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "green" | "rose"; strong?: boolean }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`${color} ${strong ? "font-bold text-base" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Car, Coins, Wallet } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { useInvoicing } from "../store/InvoicingContext";
import { useUsers } from "../store/UsersContext";
import { useSettings } from "../store/SettingsContext";
import { employeeServiceStats } from "../store/_pure";
import { formatCurrency, formatDate } from "../lib/format";
import { todayISO } from "../lib/utils";

export function CarwashReportsPage() {
  const { salesInvoices } = useInvoicing();
  const { users } = useUsers();
  const { settings } = useSettings();
  const currency = settings.currency;

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());

  const serviceInvoices = useMemo(
    () =>
      salesInvoices.filter(
        (inv) =>
          inv.invoiceKind === "service" &&
          !inv.cancelled &&
          inv.date >= from &&
          inv.date <= to
      ),
    [salesInvoices, from, to]
  );

  const summary = useMemo(() => {
    let sales = 0;
    let collected = 0;
    let outstanding = 0;
    for (const inv of serviceInvoices) {
      sales += inv.total;
      collected += inv.amountReceived;
      outstanding += inv.remaining;
    }
    return { cars: serviceInvoices.length, sales, collected, outstanding };
  }, [serviceInvoices]);

  const byDay = useMemo(() => {
    const map = new Map<string, { cars: number; sales: number; collected: number }>();
    for (const inv of serviceInvoices) {
      const row = map.get(inv.date) ?? { cars: 0, sales: 0, collected: 0 };
      row.cars += 1;
      row.sales += inv.total;
      row.collected += inv.amountReceived;
      map.set(inv.date, row);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [serviceInvoices]);

  const employeeRows = useMemo(() => {
    return users
      .filter((u) => u.role === "employee")
      .map((u) => {
        const stats = employeeServiceStats(salesInvoices, u.id, from, to);
        const pct = u.salesCommissionPct ?? 0;
        return {
          id: u.id,
          name: u.name,
          ...stats,
          commissionPct: pct,
          commission: (stats.attributedRevenue * pct) / 100,
        };
      })
      .filter((r) => r.carsWashed > 0 || r.servicesPerformed > 0)
      .sort((a, b) => b.attributedRevenue - a.attributedRevenue);
  }, [users, salesInvoices, from, to]);

  function setRangeToday() {
    const t = todayISO();
    setFrom(t);
    setTo(t);
  }
  function setRangeThisMonth() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setFrom(`${first.getFullYear()}-${pad(first.getMonth() + 1)}-01`);
    setTo(todayISO());
  }

  return (
    <>
      <PageHeader
        title="تقارير الغسيل"
        description="ملخص يومي وشهري لمبيعات الغسيل وأداء الموظفين"
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="من تاريخ">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button
            className="h-9 px-3 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            onClick={setRangeToday}
          >
            اليوم
          </button>
          <button
            className="h-9 px-3 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
            onClick={setRangeThisMonth}
          >
            هذا الشهر
          </button>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <SummaryCard icon={<Car className="w-5 h-5" />} label="عدد السيارات" value={String(summary.cars)} tone="blue" />
        <SummaryCard icon={<Coins className="w-5 h-5" />} label="إجمالي المبيعات" value={formatCurrency(summary.sales, currency)} tone="green" />
        <SummaryCard icon={<Wallet className="w-5 h-5" />} label="المحصّل" value={formatCurrency(summary.collected, currency)} tone="emerald" />
        <SummaryCard icon={<Wallet className="w-5 h-5" />} label="المتبقي (آجل)" value={formatCurrency(summary.outstanding, currency)} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="التفصيل اليومي" />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>
                  <TH className="text-end">السيارات</TH>
                  <TH className="text-end">المبيعات</TH>
                  <TH className="text-end">المحصّل</TH>
                </TR>
              </THead>
              <TBody>
                {byDay.length === 0 ? (
                  <TR>
                    <TD colSpan={4} className="text-center py-8 text-slate-500">لا توجد بيانات في هذه الفترة</TD>
                  </TR>
                ) : (
                  byDay.map(([date, row]) => (
                    <TR key={date}>
                      <TD className="font-medium">{formatDate(date)}</TD>
                      <TD className="text-end">{row.cars}</TD>
                      <TD className="text-end">{formatCurrency(row.sales, currency)}</TD>
                      <TD className="text-end">{formatCurrency(row.collected, currency)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="أداء الموظفين" />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الموظف</TH>
                  <TH className="text-end">السيارات</TH>
                  <TH className="text-end">الخدمات</TH>
                  <TH className="text-end">قيمة الخدمات</TH>
                  <TH className="text-end">العمولة</TH>
                </TR>
              </THead>
              <TBody>
                {employeeRows.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="text-center py-8 text-slate-500">لا يوجد نشاط للموظفين في هذه الفترة</TD>
                  </TR>
                ) : (
                  employeeRows.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium text-slate-900">{r.name}</TD>
                      <TD className="text-end">{r.carsWashed}</TD>
                      <TD className="text-end">{r.servicesPerformed}</TD>
                      <TD className="text-end">{formatCurrency(r.attributedRevenue, currency)}</TD>
                      <TD className="text-end">
                        <span className="font-medium text-emerald-700">{formatCurrency(r.commission, currency)}</span>
                        {r.commissionPct ? <Badge tone="slate">{r.commissionPct}%</Badge> : null}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "emerald" | "amber";
}) {
  const toneClass: Record<string, string> = {
    blue: "text-blue-700 bg-blue-50",
    green: "text-green-700 bg-green-50",
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg grid place-items-center ${toneClass[tone]}`}>{icon}</div>
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="text-lg font-bold text-slate-900">{value}</div>
        </div>
      </CardBody>
    </Card>
  );
}

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  Users,
  Factory,
  ArrowLeft,
  Bell,
  Receipt,
  Coins,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useReporting } from "../store/ReportingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency, formatDate } from "../lib/format";
import { daysUntil } from "../lib/utils";

export function AlertsPage() {
  const { products, customers, suppliers } = useCatalog();
  const { purchaseInvoices, salesInvoices } = useInvoicing();
  const { customerBalance, customerCredit, supplierBalance } = useReporting();
  const { settings } = useSettings();

  const outOfStock = useMemo(
    () => products.filter((p) => p.quantity === 0),
    [products]
  );
  const lowStockOnly = useMemo(
    () => products.filter((p) => p.quantity > 0 && p.quantity <= p.minStock),
    [products]
  );
  const expiringSoon = useMemo(
    () =>
      products.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du >= 0 && du <= 14;
      }),
    [products]
  );
  const expired = useMemo(
    () =>
      products.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du < 0;
      }),
    [products]
  );
  const unpaidCustomers = useMemo(() => {
    return customers
      .map((c) => {
        const grossRemaining = salesInvoices
          .filter((s) => s.customerId === c.id && !s.cancelled && s.remaining > 0)
          .reduce((a, s) => a + s.remaining, 0);
        const credit = Math.max(0, -customerBalance(c.id));
        return { c, bal: grossRemaining, credit };
      })
      .filter((x) => x.bal > 0)
      .sort((a, b) => b.bal - a.bal);
  }, [customers, salesInvoices, customerBalance]);
  const customersWithCredit = useMemo(() => {
    return customers
      .map((c) => ({ c, credit: customerCredit(c.id) }))
      .filter((x) => x.credit > 0)
      .sort((a, b) => b.credit - a.credit);
  }, [customers, customerCredit]);
  const accountDueInvoices = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueSoonDays = 3;

    return salesInvoices
      .filter(
        (inv) =>
          inv.paymentType === "account" &&
          inv.remaining > 0 &&
          !inv.cancelled &&
          inv.paymentDueDate
      )
      .flatMap((inv) => {
        const due = new Date(inv.paymentDueDate!);
        if (Number.isNaN(due.getTime())) return [];
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil(
          (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        return [{ inv, diffDays }];
      })
      .filter(({ diffDays }) => diffDays <= dueSoonDays)
      .sort((a, b) => a.diffDays - b.diffDays);
  }, [salesInvoices]);
  const overdueAccountCount = accountDueInvoices.filter(
    ({ diffDays }) => diffDays < 0
  ).length;

  const overdueDays = settings.paymentTermDays ?? 7;
  const overdueSupplierInvoices = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - overdueDays);
    cutoff.setHours(0, 0, 0, 0);
    return purchaseInvoices
      .filter((p) => {
        if (p.remaining <= 0) return false;
        const d = new Date(p.date);
        return !Number.isNaN(d.getTime()) && d < cutoff;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [purchaseInvoices, overdueDays]);

  void suppliers;
  void supplierBalance;

  return (
    <>
      <PageHeader
        title="التنبيهات"
        description="كل ما تحتاج لمتابعته اليوم في مكان واحد"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="منتهى المخزون" value={outOfStock.length} tone="red" />
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="اقتراب انتهاء الكمية" value={lowStockOnly.length} tone="amber" />
        <Stat icon={<CalendarClock className="w-4 h-4" />} label="قريب انتهاء الصلاحية" value={expiringSoon.length} tone="rose" />
        <Stat icon={<CalendarX className="w-4 h-4" />} label="منتهي الصلاحية" value={expired.length} tone="red" />
        <Stat icon={<Receipt className="w-4 h-4" />} label="فواتير آجل متأخرة" value={overdueAccountCount} tone="red" />
        <Stat icon={<Factory className="w-4 h-4" />} label={`موردين متأخرون +${overdueDays} يوم`} value={overdueSupplierInvoices.length} tone="red" />
        <Stat icon={<Users className="w-4 h-4" />} label="عملاء مديونون" value={unpaidCustomers.length} tone="indigo" />
        <Stat icon={<Coins className="w-4 h-4" />} label="رصيد دائن للعملاء" value={customersWithCredit.length} tone="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="منتهى المخزون"
            subtitle={`عدد: ${outOfStock.length}`}
            actions={<Link to="/inventory" className="text-xs text-brand-700 hover:underline">عرض الكل</Link>}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {outOfStock.length === 0 ? (
              <EmptyState icon={<Bell className="w-5 h-5" />} title="لا توجد منتجات نفدت" description="كل المنتجات لديها كمية." />
            ) : (
              outOfStock.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 grid place-items-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">الحد الأدنى: {p.minStock}</div>
                  </div>
                  <Badge tone="red">منتهى مخزون</Badge>
                  <Link to="/purchases/new">
                    <Button variant="outline" size="sm">توريد</Button>
                  </Link>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="اقتراب انتهاء الكمية"
            subtitle={`عدد: ${lowStockOnly.length}`}
            actions={<Link to="/inventory" className="text-xs text-brand-700 hover:underline">عرض الكل</Link>}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {lowStockOnly.length === 0 ? (
              <EmptyState icon={<Bell className="w-5 h-5" />} title="لا يوجد نقص" description="كل المنتجات فوق الحد الأدنى." />
            ) : (
              lowStockOnly.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">الحد الأدنى: {p.minStock}</div>
                  </div>
                  <Badge tone="amber">{p.quantity} {p.unit}</Badge>
                  <Link to="/purchases/new">
                    <Button variant="outline" size="sm">توريد</Button>
                  </Link>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="اقتراب انتهاء الصلاحية (14 يوم)"
            subtitle={`عدد: ${expiringSoon.length}`}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {expiringSoon.length === 0 ? (
              <EmptyState icon={<CalendarClock className="w-5 h-5" />} title="لا توجد منتجات قريبة الانتهاء" />
            ) : (
              expiringSoon.slice(0, 8).map((p) => {
                const du = daysUntil(p.expiryDate);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 grid place-items-center">
                      <CalendarClock className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        ينتهي في {formatDate(p.expiryDate!)}
                      </div>
                    </div>
                    <Badge tone="rose">يتبقى {du} يوم</Badge>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="منتهية الصلاحية" subtitle={`عدد: ${expired.length}`} />
          <CardBody className="divide-y divide-slate-100 p-0">
            {expired.length === 0 ? (
              <EmptyState icon={<CalendarX className="w-5 h-5" />} title="لا يوجد منتهي الصلاحية" />
            ) : (
              expired.map((p) => {
                const du = daysUntil(p.expiryDate);
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 grid place-items-center">
                      <CalendarX className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        انتهى في {formatDate(p.expiryDate!)}
                      </div>
                    </div>
                    <Badge tone="red">منتهي منذ {Math.abs(du ?? 0)} يوم</Badge>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="فواتير آجل متأخرة أو قريبة الاستحقاق"
            subtitle={`عدد: ${accountDueInvoices.length}`}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {accountDueInvoices.length === 0 ? (
              <EmptyState
                icon={<Receipt className="w-5 h-5" />}
                title="لا توجد فواتير آجل قريبة الاستحقاق"
              />
            ) : (
              accountDueInvoices.slice(0, 8).map(({ inv, diffDays }) => (
                <div key={inv.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 grid place-items-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {inv.customerName} — {inv.invoiceNumber}
                    </div>
                    <div className="text-xs text-slate-500">
                      تاريخ الاستحقاق: {formatDate(inv.paymentDueDate!)} • المتبقي:{" "}
                      {formatCurrency(inv.remaining, settings.currency)}
                    </div>
                  </div>
                  <Badge
                    tone={diffDays < 0 ? "red" : diffDays === 0 ? "orange" : "amber"}
                  >
                    {diffDays < 0
                      ? "متأخر"
                      : diffDays === 0
                      ? "اليوم"
                      : `خلال ${diffDays} أيام`}
                  </Badge>
                  <Link to={`/sales/${inv.id}`}>
                    <Button variant="outline" size="sm">عرض</Button>
                  </Link>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="عملاء برصيد دائن (دفعوا زيادة)"
            subtitle={`عدد: ${customersWithCredit.length}`}
            actions={customersWithCredit.length > 0 ? <Link to="/sales/new" className="text-xs text-brand-700 hover:underline">فاتورة جديدة</Link> : undefined}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {customersWithCredit.length === 0 ? (
              <EmptyState icon={<Coins className="w-5 h-5" />} title="لا يوجد رصيد دائن" description="لا أحد دفع زيادة حتى الآن." />
            ) : (
              customersWithCredit.slice(0, 8).map(({ c, credit }) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 grid place-items-center">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone ?? "—"}</div>
                  </div>
                  <Badge tone="green">رصيد {formatCurrency(credit, settings.currency)}</Badge>
                  <Link to="/sales/new">
                    <Button variant="outline" size="sm">
                      استخدام <ArrowLeft className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="عملاء عليهم فلوس" subtitle={`عدد: ${unpaidCustomers.length}`} />
          <CardBody className="divide-y divide-slate-100 p-0">
            {unpaidCustomers.length === 0 ? (
              <EmptyState icon={<Users className="w-5 h-5" />} title="لا توجد أرصدة متبقية" />
            ) : (
              unpaidCustomers.slice(0, 8).map(({ c, bal, credit }) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 grid place-items-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone ?? "—"}</div>
                  </div>
                  {credit > 0 && <Badge tone="green">رصيد {formatCurrency(credit, settings.currency)}</Badge>}
                  <Badge tone="amber">{formatCurrency(bal, settings.currency)}</Badge>
                  <Link to={`/customers`}>
                    <Button variant="outline" size="sm">
                      عرض <ArrowLeft className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="فواتير موردين غير مسددة"
            subtitle={overdueSupplierInvoices.length > 0 ? `${overdueSupplierInvoices.length} متأخرة أكثر من ${overdueDays} يوم` : undefined}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {purchaseInvoices.filter(p=>p.remaining>0).length === 0 ? (
              <EmptyState icon={<Factory className="w-5 h-5" />} title="لا توجد فواتير متأخرة" />
            ) : (
              purchaseInvoices
                .filter((p) => p.remaining > 0)
                .sort((a, b) => a.date.localeCompare(b.date))
                .slice(0, 10)
                .map((p) => {
                  const isOverdue = overdueSupplierInvoices.some((o) => o.id === p.id);
                  return (
                    <div key={p.id} className={`flex items-center gap-3 p-3 ${isOverdue ? "bg-red-50/40" : ""}`}>
                      <div className={`w-9 h-9 rounded-lg grid place-items-center ${isOverdue ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                        <Factory className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {p.invoiceNumber} — {p.supplierName}
                        </div>
                        <div className="text-xs text-slate-500">{formatDate(p.date)}</div>
                      </div>
                      {isOverdue && <Badge tone="red">متأخرة</Badge>}
                      <Badge tone="amber">
                        متبقي {formatCurrency(p.remaining, settings.currency)}
                      </Badge>
                      <Link to={`/purchases/${p.id}`}>
                        <Button variant="outline" size="sm">عرض</Button>
                      </Link>
                    </div>
                  );
                })
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "amber" | "rose" | "red" | "indigo" | "blue" | "green";
}) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    red: "bg-red-50 text-red-700",
    indigo: "bg-indigo-50 text-indigo-700",
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${colors[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

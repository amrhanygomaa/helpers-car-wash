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
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { useApp } from "../store/AppContext";
import { formatCurrency, formatDate } from "../lib/format";
import { daysUntil } from "../lib/utils";

export function AlertsPage() {
  const {
    products,
    customers,
    suppliers,
    purchaseInvoices,
    customerBalance,
    supplierBalance,
    settings,
  } = useApp();

  const lowStock = useMemo(
    () => products.filter((p) => p.quantity <= p.minStock),
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
      .map((c) => ({ c, bal: customerBalance(c.id) }))
      .filter((x) => x.bal > 0)
      .sort((a, b) => b.bal - a.bal);
  }, [customers, customerBalance]);
  // supplier balances are summarized inline from purchaseInvoices below
  void suppliers;
  void supplierBalance;

  return (
    <>
      <PageHeader
        title="التنبيهات"
        description="كل ما تحتاج لمتابعته اليوم في مكان واحد"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<AlertTriangle className="w-4 h-4" />} label="مخزون منخفض" value={lowStock.length} tone="amber" />
        <Stat icon={<CalendarClock className="w-4 h-4" />} label="قريب الانتهاء" value={expiringSoon.length} tone="rose" />
        <Stat icon={<CalendarX className="w-4 h-4" />} label="منتهي الصلاحية" value={expired.length} tone="red" />
        <Stat icon={<Users className="w-4 h-4" />} label="عملاء لديهم رصيد" value={unpaidCustomers.length} tone="indigo" />
        <Stat icon={<Factory className="w-4 h-4" />} label="فواتير موردين غير مسددة" value={purchaseInvoices.filter(p=>p.remaining>0).length} tone="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="منتجات منخفضة المخزون"
            subtitle={`عدد: ${lowStock.length}`}
            actions={<Link to="/inventory" className="text-xs text-brand-700 hover:underline">عرض الكل</Link>}
          />
          <CardBody className="divide-y divide-slate-100 p-0">
            {lowStock.length === 0 ? (
              <EmptyState icon={<Bell className="w-5 h-5" />} title="لا يوجد نقص" description="كل المنتجات فوق الحد الأدنى." />
            ) : (
              lowStock.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-500">الحد الأدنى: {p.minStock}</div>
                  </div>
                  <Badge tone={p.quantity === 0 ? "red" : "amber"}>{p.quantity} {p.unit}</Badge>
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
            title="قريبة الانتهاء (14 يوم)"
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
          <CardHeader title="عملاء لديهم رصيد" subtitle={`عدد: ${unpaidCustomers.length}`} />
          <CardBody className="divide-y divide-slate-100 p-0">
            {unpaidCustomers.length === 0 ? (
              <EmptyState icon={<Users className="w-5 h-5" />} title="لا توجد أرصدة متبقية" />
            ) : (
              unpaidCustomers.slice(0, 8).map(({ c, bal }) => (
                <div key={c.id} className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 grid place-items-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone ?? "—"}</div>
                  </div>
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
          <CardHeader title="فواتير موردين غير مسددة" />
          <CardBody className="divide-y divide-slate-100 p-0">
            {purchaseInvoices.filter(p=>p.remaining>0).length === 0 ? (
              <EmptyState icon={<Factory className="w-5 h-5" />} title="لا توجد فواتير متأخرة" />
            ) : (
              purchaseInvoices
                .filter((p) => p.remaining > 0)
                .slice(0, 8)
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 grid place-items-center">
                      <Factory className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {p.invoiceNumber} — {p.supplierName}
                      </div>
                      <div className="text-xs text-slate-500">{formatDate(p.date)}</div>
                    </div>
                    <Badge tone="amber">
                      متبقي {formatCurrency(p.remaining, settings.currency)}
                    </Badge>
                    <Link to={`/purchases/${p.id}`}>
                      <Button variant="outline" size="sm">عرض</Button>
                    </Link>
                  </div>
                ))
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
  tone: "amber" | "rose" | "red" | "indigo" | "blue";
}) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    red: "bg-red-50 text-red-700",
    indigo: "bg-indigo-50 text-indigo-700",
    blue: "bg-blue-50 text-blue-700",
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

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Car,
  CheckCircle2,
  Clock,
  KeyRound,
  ListChecks,
  Package,
  Plus,
  Receipt,
  Sparkles,
  Timer,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { useAuth } from "../store/AuthContext";
import { useCarwash } from "../store/CarwashContext";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { isToday, localISODate } from "../lib/utils";
import { hasDb } from "../db/client";
import { listAllCarwashProducts, type Product as CarwashProduct } from "../features/products/carwash-queries";
import { listAllRawMaterials, type RawMaterial } from "../features/materials/queries";
import type { QueueStatus, QueueTicket, SalesInvoice } from "../types";

const STATUS_META: Record<
  QueueStatus,
  { label: string; tone: "slate" | "blue" | "amber" | "emerald" | "red"; icon: React.ReactNode }
> = {
  waiting: { label: "مستنية الدور", tone: "amber", icon: <Clock className="h-3.5 w-3.5" /> },
  in_progress: { label: "جاري الغسيل", tone: "blue", icon: <Sparkles className="h-3.5 w-3.5" /> },
  done: { label: "جاهزة للتسليم", tone: "emerald", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  delivered: { label: "اتسلّمت", tone: "slate", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  cancelled: { label: "ملغية", tone: "red", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
};

function queuePosition(ticket: QueueTicket): number {
  return ticket.queuePosition ?? ticket.number;
}

function ticketTimeLabel(raw?: string): string {
  if (!raw) return "بدون موعد";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "بدون موعد";
  return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function todayServiceInvoices(invoices: SalesInvoice[]): SalesInvoice[] {
  return invoices.filter((invoice) => invoice.invoiceKind === "service" && !invoice.cancelled && isToday(invoice.date));
}

function MetricTile({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red" | "slate";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold leading-tight text-slate-950 tabular-nums">{value}</div>
          {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function DashboardPage() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const { customers } = useCatalog();
  const { queueTickets } = useCarwash();
  const { salesInvoices, currentCashBalance } = useInvoicing();

  const canManageQueue = hasPermission(currentUser, "queue");
  const canAddQueue = hasPermission(currentUser, "queue", "add");
  const canAddInvoice = hasPermission(currentUser, "salesInvoices", "add");
  const canViewReports = hasPermission(currentUser, "reports");
  const canViewCustomers = hasPermission(currentUser, "customers");

  const [lowStockProducts, setLowStockProducts] = useState<CarwashProduct[]>([]);
  const [lowStockMaterials, setLowStockMaterials] = useState<RawMaterial[]>([]);
  useEffect(() => {
    if (!hasDb()) return;
    listAllCarwashProducts().then((ps) =>
      setLowStockProducts(ps.filter((p) => p.active && p.stockQty <= (p.lowStockThreshold ?? 5)))
    ).catch(() => {});
    listAllRawMaterials().then((ms) =>
      setLowStockMaterials(ms.filter((m) => m.active && m.stockQty <= (m.lowStockThreshold ?? 0)))
    ).catch(() => {});
  }, []);

  const todayInvoices = useMemo(() => todayServiceInvoices(salesInvoices), [salesInvoices]);

  const activeQueue = useMemo(
    () =>
      queueTickets
        .filter((ticket) => ticket.status === "waiting" || ticket.status === "in_progress" || ticket.status === "done")
        .sort((a, b) => queuePosition(a) - queuePosition(b) || a.number - b.number),
    [queueTickets]
  );

  const waiting = activeQueue.filter((ticket) => ticket.status === "waiting");
  const inProgress = activeQueue.filter((ticket) => ticket.status === "in_progress");
  const ready = activeQueue.filter((ticket) => ticket.status === "done");
  const keysHeld = activeQueue.filter((ticket) => ticket.keyReceived && !ticket.keyDeliveredAt);

  const todayRevenue = todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const todayCollected = todayInvoices.reduce((sum, invoice) => sum + invoice.amountReceived + (invoice.overpayment ?? 0), 0);
  const unpaidToday = todayInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.remaining), 0);
  const averageTicket = todayInvoices.length > 0 ? todayRevenue / todayInvoices.length : 0;

  const nextTickets = activeQueue.slice(0, 6);
  const pickupTickets = activeQueue
    .filter((ticket) => Boolean(ticket.requestedPickupAt))
    .sort((a, b) => String(a.requestedPickupAt).localeCompare(String(b.requestedPickupAt)))
    .slice(0, 5);
  const openAccountInvoices = salesInvoices
    .filter((invoice) => invoice.invoiceKind === "service" && !invoice.cancelled && invoice.remaining > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const weeklyData = useMemo(() => {
    const rows: { day: string; cars: number; revenue: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const iso = localISODate(date);
      const dayInvoices = salesInvoices.filter(
        (invoice) => invoice.invoiceKind === "service" && !invoice.cancelled && invoice.date.slice(0, 10) === iso
      );
      rows.push({
        day: date.toLocaleDateString("ar-EG", { weekday: "short" }),
        cars: dayInvoices.length,
        revenue: dayInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      });
    }
    return rows;
  }, [salesInvoices]);

  return (
    <>
      <PageHeader
        title="لوحة تشغيل المغسلة"
        description={`اليوم ${formatDate(new Date().toISOString())} · ${settings.branchName || "الفرع الرئيسي"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canAddQueue ? (
              <Link to="/queue">
                <Button size="lg">
                  <Car className="h-4 w-4" /> استقبال سيارة
                </Button>
              </Link>
            ) : null}
            {canAddInvoice ? (
              <Link to="/carwash/new">
                <Button size="lg" variant="outline">
                  <Receipt className="h-4 w-4" /> فاتورة غسيل
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">حالة الدور الآن</div>
              <div className="mt-1 text-xs text-slate-500">أهم أرقام الكاشير قبل أي خطوة.</div>
            </div>
            <Link to="/queue" className="text-xs font-semibold text-brand-700 hover:underline">
              فتح الطابور
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              label="في الانتظار"
              value={formatNumber(waiting.length)}
              detail="عربيات لسه ما دخلتش"
              icon={<Timer className="h-5 w-5" />}
              tone="amber"
            />
            <MetricTile
              label="جاري الغسيل"
              value={formatNumber(inProgress.length)}
              detail="داخل التشغيل"
              icon={<Sparkles className="h-5 w-5" />}
              tone="blue"
            />
            <MetricTile
              label="جاهزة للتسليم"
              value={formatNumber(ready.length)}
              detail="تحتاج تسليم ومحاسبة"
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="green"
            />
            <MetricTile
              label="مفاتيح معانا"
              value={formatNumber(keysHeld.length)}
              detail="لم يتم تسليمها"
              icon={<KeyRound className="h-5 w-5" />}
              tone={keysHeld.length > 0 ? "red" : "slate"}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-950">أسرع إجراءات</div>
          <div className="mt-1 text-xs text-slate-500">أزرار كبيرة للكاشير وقت الزحمة.</div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {canAddQueue ? (
              <Link to="/queue">
                <Button className="h-12 w-full justify-start text-sm">
                  <Plus className="h-4 w-4" /> دور جديد
                </Button>
              </Link>
            ) : null}
            {canAddInvoice ? (
              <Link to="/carwash/new">
                <Button className="h-12 w-full justify-start text-sm" variant="outline">
                  <Receipt className="h-4 w-4" /> تحصيل فاتورة غسيل
                </Button>
              </Link>
            ) : null}
            {canAddInvoice ? (
              <Link to="/carwash/new?type=products">
                <Button className="h-12 w-full justify-start text-sm" variant="outline">
                  <Receipt className="h-4 w-4" /> فاتورة منتجات
                </Button>
              </Link>
            ) : null}
            {canManageQueue ? (
              <Link to="/queue">
                <Button className="h-12 w-full justify-start text-sm" variant="outline">
                  <ListChecks className="h-4 w-4" /> متابعة الدور
                </Button>
              </Link>
            ) : null}
            {canViewReports ? (
              <Link to="/carwash/reports">
                <Button className="h-12 w-full justify-start text-sm" variant="outline">
                  <ArrowUpRight className="h-4 w-4" /> تقرير اليوم
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricTile
          label="عربيات اتغسلت اليوم"
          value={formatNumber(todayInvoices.length)}
          detail="فواتير غسيل مؤكدة"
          icon={<Car className="h-5 w-5" />}
          tone="blue"
        />
        <MetricTile
          label="إيراد الغسيل"
          value={formatCurrency(todayRevenue, settings.currency)}
          detail="إجمالي فواتير اليوم"
          icon={<Banknote className="h-5 w-5" />}
          tone="green"
        />
        <MetricTile
          label="المحصّل"
          value={formatCurrency(todayCollected, settings.currency)}
          detail="كاش ومدفوعات اليوم"
          icon={<Wallet className="h-5 w-5" />}
          tone="green"
        />
        <MetricTile
          label="متبقي تحصيل"
          value={formatCurrency(unpaidToday, settings.currency)}
          detail="من فواتير اليوم"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={unpaidToday > 0 ? "amber" : "slate"}
        />
        <MetricTile
          label="متوسط الفاتورة"
          value={formatCurrency(averageTicket, settings.currency)}
          detail={`الخزنة: ${formatCurrency(currentCashBalance(), settings.currency)}`}
          icon={<Receipt className="h-5 w-5" />}
          tone="slate"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader title="العربيات القادمة" subtitle="مرتبة حسب الدور الحالي" />
          <CardBody className="space-y-2">
            {nextTickets.length === 0 ? (
              <EmptyPanel>مفيش عربيات في الدور حالياً.</EmptyPanel>
            ) : (
              nextTickets.map((ticket) => {
                const status = STATUS_META[ticket.status];
                return (
                  <div key={ticket.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-50 text-sm font-bold text-slate-900">
                      {ticket.number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-950">{ticket.customerName}</div>
                        <Badge tone={status.tone}>{status.icon}{status.label}</Badge>
                        {ticket.keyReceived ? <Badge tone="blue"><KeyRound className="h-3 w-3" /> مفتاح</Badge> : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {ticket.vehicleLabel || ticket.vehicleBrand || "سيارة"} · {ticket.serviceNames?.join("، ") || "خدمة غير محددة"}
                      </div>
                    </div>
                    <div className="text-left text-xs text-slate-500">
                      <div>استلام</div>
                      <div className="font-semibold text-slate-800">{ticketTimeLabel(ticket.requestedPickupAt)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="حركة آخر 7 أيام" subtitle="عدد العربيات وإيراد الغسيل فقط" />
          <CardBody>
            <div className="h-72" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis yAxisId="cars" orientation="left" stroke="#2563eb" fontSize={12} />
                  <YAxis yAxisId="revenue" orientation="right" stroke="#059669" fontSize={12} />
                  <Tooltip
                    contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                    formatter={(value, name) =>
                      name === "الإيراد"
                        ? formatCurrency(Number(value), settings.currency)
                        : formatNumber(Number(value))
                    }
                  />
                  <Bar yAxisId="cars" dataKey="cars" name="العربيات" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="revenue" dataKey="revenue" name="الإيراد" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader title="مواعيد استلام قريبة" subtitle="العربيات اللي ليها وقت مطلوب" />
          <CardBody className="space-y-2">
            {pickupTickets.length === 0 ? (
              <EmptyPanel>لا توجد مواعيد استلام محددة.</EmptyPanel>
            ) : (
              pickupTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{ticket.customerName}</div>
                    <div className="text-xs text-slate-500">دور رقم {ticket.number}</div>
                  </div>
                  <div className="text-sm font-bold text-slate-900">{ticketTimeLabel(ticket.requestedPickupAt)}</div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="تحصيل مفتوح" subtitle="فواتير غسيل عليها متبقي" />
          <CardBody className="space-y-2">
            {openAccountInvoices.length === 0 ? (
              <EmptyPanel>لا توجد فواتير غسيل مفتوحة.</EmptyPanel>
            ) : (
              openAccountInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  to={`/sales/${invoice.id}`}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                >
                  <Receipt className="h-4 w-4 shrink-0 text-brand-700" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{invoice.customerName}</div>
                    <div className="text-xs text-slate-500">{invoice.invoiceNumber}</div>
                  </div>
                  <div className="text-sm font-bold text-amber-700">{formatCurrency(invoice.remaining, settings.currency)}</div>
                </Link>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="تنبيهات المخزون"
            subtitle="إضافات وخامات قاربت على النفاد"
            actions={
              (lowStockProducts.length > 0 || lowStockMaterials.length > 0) ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : null
            }
          />
          <CardBody className="space-y-2">
            {lowStockProducts.length === 0 && lowStockMaterials.length === 0 ? (
              <EmptyPanel>كل المخزون فوق الحد الأدنى.</EmptyPanel>
            ) : (
              <>
                {lowStockProducts.map((p) => (
                  <Link key={p.id} to="/carwash/products"
                    className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3 transition-colors hover:bg-amber-100"
                  >
                    <Package className="h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-amber-700">متبقي: {p.stockQty} · الحد: {p.lowStockThreshold ?? 5}</div>
                    </div>
                  </Link>
                ))}
                {lowStockMaterials.map((m) => (
                  <Link key={m.id} to="/carwash/materials"
                    className="flex items-center gap-3 rounded-lg border border-rose-100 bg-rose-50 p-3 transition-colors hover:bg-rose-100"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
                      <div className="text-xs text-rose-700">متبقي: {m.stockQty} {m.unit} · الحد: {m.lowStockThreshold ?? 0}</div>
                    </div>
                  </Link>
                ))}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="عملاء المغسلة" subtitle="بيانات مفيدة للتسويق والمتابعة" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <MetricTile
                label="عملاء مسجلين"
                value={canViewCustomers ? formatNumber(customers.length) : "مخفي"}
                icon={<UserRound className="h-5 w-5" />}
                tone="blue"
              />
              <MetricTile
                label="عربيات نشطة"
                value={formatNumber(activeQueue.length)}
                icon={<Car className="h-5 w-5" />}
                tone="amber"
              />
            </div>
            {canViewCustomers ? (
              <Link to="/customers/marketing" className="mt-3 block">
                <Button variant="outline" className="w-full justify-start">
                  <ArrowUpRight className="h-4 w-4" /> تجهيز رسالة للعملاء
                </Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>
      </section>
    </>
  );
}

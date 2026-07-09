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
  Wallet,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { useAuth } from "../store/AuthContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { isToday } from "../lib/utils";
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
  to,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red" | "slate";
  to?: string;
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  const content = (
    <div className="flex h-full items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-bold leading-tight text-slate-950 tabular-nums">{value}</div>
        {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
      </div>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border ${tones[tone]}`}>
        {icon}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block h-full rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-slate-50"
      >
        {content}
      </Link>
    );
  }

  return <div className="h-full rounded-lg border border-slate-200 bg-white p-4">{content}</div>;
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full min-h-24 place-items-center rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function DashboardPage() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const { queueTickets } = useCarwash();
  const { salesInvoices, currentCashBalance } = useInvoicing();

  const canManageQueue = hasPermission(currentUser, "queue");
  const canAddQueue = hasPermission(currentUser, "queue", "add");
  const canAddInvoice = hasPermission(currentUser, "salesInvoices", "add");
  const canViewReports = hasPermission(currentUser, "reports");

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
  const averageTicket = todayInvoices.length > 0 ? todayRevenue / todayInvoices.length : 0;

  const nextTickets = activeQueue.slice(0, 8);

  return (
    <>
      <PageHeader
        title="لوحة تشغيل المغسلة"
        description={`اليوم ${formatDate(new Date().toISOString())} · ${settings.branchName || "الفرع الرئيسي"}`}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {canAddQueue ? (
          <Link to="/queue?new=1" className="block">
            <Button className="h-14 w-full text-base font-semibold">
              <Plus className="h-5 w-5" /> دور جديد
            </Button>
          </Link>
        ) : null}
        {canAddInvoice ? (
          <Link to="/carwash/new" className="block">
            <Button className="h-14 w-full text-base font-semibold" variant="outline">
              <Receipt className="h-5 w-5" /> فاتورة غسيل
            </Button>
          </Link>
        ) : null}
        {canAddInvoice ? (
          <Link to="/carwash/new?type=products" className="block">
            <Button className="h-14 w-full text-base font-semibold" variant="outline">
              <Receipt className="h-5 w-5" /> فاتورة منتجات
            </Button>
          </Link>
        ) : null}
        {canManageQueue ? (
          <Link to="/queue" className="block">
            <Button className="h-14 w-full text-base font-semibold" variant="outline">
              <ListChecks className="h-5 w-5" /> متابعة الدور
            </Button>
          </Link>
        ) : null}
        {canViewReports ? (
          <Link to="/carwash/reports" className="block">
            <Button className="h-14 w-full text-base font-semibold" variant="outline">
              <ArrowUpRight className="h-5 w-5" /> تقرير اليوم
            </Button>
          </Link>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">حالة الدور الآن</div>
            <div className="mt-1 text-xs text-slate-500">أهم أرقام الكاشير قبل أي خطوة — دوس على أي كارت يفتح الطابور.</div>
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
            to="/queue"
          />
          <MetricTile
            label="جاري الغسيل"
            value={formatNumber(inProgress.length)}
            detail="داخل التشغيل"
            icon={<Sparkles className="h-5 w-5" />}
            tone="blue"
            to="/queue"
          />
          <MetricTile
            label="جاهزة للتسليم"
            value={formatNumber(ready.length)}
            detail="تحتاج تسليم ومحاسبة"
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="green"
            to="/queue"
          />
          <MetricTile
            label="مفاتيح معانا"
            value={formatNumber(keysHeld.length)}
            detail="لم يتم تسليمها"
            icon={<KeyRound className="h-5 w-5" />}
            tone={keysHeld.length > 0 ? "red" : "slate"}
            to="/queue"
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
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
          label="متوسط الفاتورة"
          value={formatCurrency(averageTicket, settings.currency)}
          detail={`الخزنة: ${formatCurrency(currentCashBalance(), settings.currency)}`}
          icon={<Receipt className="h-5 w-5" />}
          tone="slate"
        />
      </section>

      <section className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader
            title="العربيات القادمة"
            subtitle="مرتبة حسب الدور الحالي"
            actions={
              <Link to="/queue" className="text-xs font-semibold text-brand-700 hover:underline">
                فتح الطابور
              </Link>
            }
          />
          <CardBody className="flex-1 space-y-2">
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

        <Card className="flex flex-col">
          <CardHeader
            title="تنبيهات المخزون"
            subtitle="إضافات وخامات قاربت على النفاد"
            actions={
              (lowStockProducts.length > 0 || lowStockMaterials.length > 0) ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : null
            }
          />
          <CardBody className="flex-1 space-y-2">
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
      </section>
    </>
  );
}

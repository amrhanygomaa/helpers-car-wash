import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package, Warehouse, AlertTriangle, CalendarClock, TrendingUp, TrendingDown,
  Wallet, HandCoins, Receipt, Plus, ShoppingBag, Users, Clock,
  Settings2, Eye, EyeOff, GripVertical, RotateCcw, Building2, BarChart2,
  CircleDollarSign,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useReporting } from "../store/ReportingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { daysUntil, isToday, localISODate } from "../lib/utils";
import { lsGet, lsSet } from "../lib/storage";

/* ─── Types ─── */
type CardId =
  | "totalProducts" | "totalStock" | "lowStock" | "expiringSoon"
  | "todaySales" | "todayPurchases" | "monthlySales" | "monthlyPurchases"
  | "receivables" | "payables" | "cashBalance" | "accountInvoices"
  | "overdueCount" | "totalCustomers" | "totalSuppliers" | "netProfitToday";

type SectionId =
  | "trendChart" | "stockChart" | "topSellingChart"
  | "recentActivity" | "lowStockPanel" | "overduePanel" | "quickActions";

interface CardConfig { id: CardId; visible: boolean }
type SectionsConfig = Record<SectionId, boolean>;

/* ─── Defaults ─── */
const DEFAULT_CARDS: CardConfig[] = [
  { id: "totalProducts",    visible: true },
  { id: "totalStock",       visible: true },
  { id: "lowStock",         visible: true },
  { id: "expiringSoon",     visible: true },
  { id: "todaySales",       visible: true },
  { id: "monthlySales",     visible: true },
  { id: "netProfitToday",   visible: true },
  { id: "cashBalance",      visible: true },
  { id: "receivables",      visible: true },
  { id: "payables",         visible: true },
  { id: "accountInvoices",  visible: true },
  { id: "overdueCount",     visible: true },
  { id: "todayPurchases",   visible: true },
  { id: "monthlyPurchases", visible: true },
  { id: "totalCustomers",   visible: true },
  { id: "totalSuppliers",   visible: true },
];

const DEFAULT_SECTIONS: SectionsConfig = {
  trendChart: true, stockChart: true, topSellingChart: true,
  recentActivity: true, lowStockPanel: true, overduePanel: true, quickActions: true,
};

const CARD_LABELS: Record<CardId, string> = {
  totalProducts:    "إجمالي المنتجات",
  totalStock:       "إجمالي الوحدات في المخزون",
  lowStock:         "منتجات قليلة المخزون",
  expiringSoon:     "قاربت على الانتهاء",
  todaySales:       "مبيعات اليوم",
  todayPurchases:   "مشتريات اليوم",
  monthlySales:     "مبيعات الشهر",
  monthlyPurchases: "مشتريات الشهر",
  receivables:      "مستحقات من العملاء",
  payables:         "مستحقات الموردين",
  cashBalance:      "رصيد الخزينة",
  accountInvoices:  "فواتير آجل مفتوحة",
  overdueCount:     "فواتير متأخرة",
  totalCustomers:   "إجمالي العملاء",
  totalSuppliers:   "إجمالي الموردين",
  netProfitToday:   "صافي الربح الشهري",
};

const SECTION_LABELS: Record<SectionId, string> = {
  trendChart:      "رسم المبيعات والمشتريات",
  stockChart:      "رسم أكثر المنتجات مخزوناً",
  topSellingChart: "أكثر المنتجات مبيعاً",
  recentActivity:  "أحدث النشاط",
  lowStockPanel:   "أقل المنتجات مخزوناً",
  overduePanel:    "فواتير متأخرة عن الاستحقاق",
  quickActions:    "إجراءات سريعة",
};

/* ─── Config hook ─── */
function useDashboardConfig() {
  const [cards, setCards] = useState<CardConfig[]>(() => {
    const saved = lsGet<CardConfig[] | null>("dashboardCards", null);
    if (!saved) return DEFAULT_CARDS;
    const savedIds = new Set(saved.map((c) => c.id));
    const merged = [...saved];
    DEFAULT_CARDS.forEach((c) => { if (!savedIds.has(c.id)) merged.push(c); });
    return merged;
  });

  const [sections, setSections] = useState<SectionsConfig>(() =>
    lsGet<SectionsConfig>("dashboardSections", DEFAULT_SECTIONS)
  );

  function saveCards(next: CardConfig[]) { setCards(next); lsSet("dashboardCards", next); }
  function saveSections(next: SectionsConfig) { setSections(next); lsSet("dashboardSections", next); }

  function toggleCard(id: CardId) {
    saveCards(cards.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)));
  }
  function toggleSection(id: SectionId) {
    saveSections({ ...sections, [id]: !sections[id] });
  }
  function moveCard(from: number, to: number) {
    const next = [...cards];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveCards(next);
  }
  function reset() { saveCards(DEFAULT_CARDS); saveSections(DEFAULT_SECTIONS); }

  return { cards, sections, toggleCard, toggleSection, moveCard, reset };
}

/* ─── StatCard ─── */
function StatCard({
  title, value, icon, tone, delta,
}: {
  title: string; value: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red" | "slate" | "indigo" | "rose" | "violet";
  delta?: string;
}) {
  const toneMap: Record<string, string> = {
    blue:   "bg-blue-50 text-blue-700",
    green:  "bg-emerald-50 text-emerald-700",
    amber:  "bg-amber-50 text-amber-700",
    red:    "bg-red-50 text-red-700",
    slate:  "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-50 text-indigo-700",
    rose:   "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${toneMap[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums leading-tight">{value}</div>
          {delta ? (
            <div className="text-[10px] text-slate-500 mt-1 font-medium bg-slate-50 inline-block px-1.5 py-0.5 rounded-md border border-slate-100">
              {delta}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/* ─── Customize Dialog ─── */
function CustomizeDialog({
  open, onClose, cards, sections, onToggleCard, onToggleSection, onMove, onReset,
}: {
  open: boolean; onClose: () => void;
  cards: CardConfig[]; sections: SectionsConfig;
  onToggleCard: (id: CardId) => void;
  onToggleSection: (id: SectionId) => void;
  onMove: (from: number, to: number) => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<"cards" | "sections">("cards");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function handleDrop(toIdx: number) {
    if (dragIdx !== null && dragIdx !== toIdx) onMove(dragIdx, toIdx);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="تخصيص لوحة التحكم"
      subtitle="اختر الكروت التي تريد إظهارها ورتّبها حسب أولويتك"
      width="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" onClick={onReset} className="text-slate-500 gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> إعادة الضبط الافتراضي
          </Button>
          <Button onClick={onClose}>حفظ</Button>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
        {(["cards", "sections"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "cards" ? "الكروت الإحصائية" : "الأقسام والرسوم"}
          </button>
        ))}
      </div>

      {tab === "cards" && (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          <p className="text-xs text-slate-400 mb-2">اسحب الكرت لتغيير ترتيبه، أو اكتب رقم الترتيب</p>
          {cards.map((c, idx) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${
                overIdx === idx && dragIdx !== idx
                  ? "border-brand-400 bg-brand-50"
                  : dragIdx === idx
                  ? "opacity-40 border-dashed border-slate-300"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
              <span className="flex-1 text-sm text-slate-700">{CARD_LABELS[c.id]}</span>
              <div className="flex items-center gap-1">
                <input
                  key={`${c.id}-${idx}`}
                  type="number"
                  min={1}
                  max={cards.length}
                  defaultValue={idx + 1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const newPos = Math.min(cards.length, Math.max(1, Number(e.currentTarget.value))) - 1;
                      if (newPos !== idx) onMove(idx, newPos);
                    }
                  }}
                  onBlur={(e) => {
                    const newPos = Math.min(cards.length, Math.max(1, Number(e.currentTarget.value))) - 1;
                    if (newPos !== idx) onMove(idx, newPos);
                  }}
                  className="w-10 text-center text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-600 focus:outline-none focus:border-brand-400"
                />
                <button
                  onClick={() => onToggleCard(c.id)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    c.visible ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  {c.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "sections" && (
        <div className="space-y-2">
          {(Object.keys(DEFAULT_SECTIONS) as SectionId[]).map((id) => (
            <div key={id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white">
              <span className="text-sm text-slate-700">{SECTION_LABELS[id]}</span>
              <button
                onClick={() => onToggleSection(id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  sections[id] ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {sections[id] ? <><Eye className="w-3 h-3" /> ظاهر</> : <><EyeOff className="w-3 h-3" /> مخفي</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ─── Main Page ─── */
export function DashboardPage() {
  const { products, customers, suppliers } = useCatalog();
  const { purchaseInvoices, salesInvoices, currentCashBalance } = useInvoicing();
  const { customerBalance, supplierBalance } = useReporting();
  const { currentUser } = useAuth();
  const { settings } = useSettings();

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { cards, sections, toggleCard, toggleSection, moveCard, reset } = useDashboardConfig();

  const canViewProducts  = hasPermission(currentUser, "products");
  const canViewInventory = hasPermission(currentUser, "inventory");
  const canViewAlerts    = hasPermission(currentUser, "alerts");
  const canViewSales     = hasPermission(currentUser, "salesInvoices");
  const canAddSales      = hasPermission(currentUser, "salesInvoices", "add");
  const canViewPurchases = hasPermission(currentUser, "purchaseInvoices");
  const canAddPurchases  = hasPermission(currentUser, "purchaseInvoices", "add");
  const canViewCustomers = hasPermission(currentUser, "customers");
  const canAddCustomer   = hasPermission(currentUser, "customers", "add");
  const canViewSuppliers = hasPermission(currentUser, "suppliers");
  const canViewCashbox   = hasPermission(currentUser, "cashbox");
  const canAddProduct    = hasPermission(currentUser, "products", "add");

  // ── Stats ──
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = localISODate(new Date(now.getFullYear(), now.getMonth(), 1));

    const totalStockUnits = products.reduce((a, p) => a + p.quantity, 0);
    const lowStock = products.filter((p) => p.quantity <= p.minStock).length;
    const expiringSoon = products.filter((p) => {
      if (!p.hasExpiry || !p.expiryDate) return false;
      const du = daysUntil(p.expiryDate);
      return du !== null && du >= 0 && du <= 14;
    }).length;

    const todaySales = salesInvoices.filter((s) => isToday(s.date) && !s.cancelled).reduce((a, s) => a + s.total, 0);
    const todayPurchases = purchaseInvoices.filter((p) => isToday(p.date)).reduce((a, p) => a + p.total, 0);
    const monthlySales = salesInvoices.filter((s) => !s.cancelled && s.date >= monthStart).reduce((a, s) => a + s.total, 0);
    const monthlyPurchases = purchaseInvoices.filter((p) => p.date >= monthStart).reduce((a, p) => a + p.total, 0);
    const netProfitToday = monthlySales - monthlyPurchases;

    const receivables = customers.reduce((a, c) => a + customerBalance(c.id), 0);
    const payables    = suppliers.reduce((a, s) => a + supplierBalance(s.id), 0);

    return {
      totalProducts: products.length, totalStockUnits, lowStock, expiringSoon,
      todaySales, todayPurchases, monthlySales, monthlyPurchases, netProfitToday,
      receivables, payables, cashBalance: currentCashBalance(),
      totalCustomers: customers.length, totalSuppliers: suppliers.length,
    };
  }, [products, salesInvoices, purchaseInvoices, customers, suppliers, customerBalance, supplierBalance, currentCashBalance]);

  const { accountInvoicesTotal, accountInvoicesCount, overdueInvoices, overdueTotal } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const accountList = salesInvoices.filter((s) => !s.cancelled && s.remaining > 0 && s.paymentType === "account");
    const overdue = accountList
      .filter((s) => { if (!s.paymentDueDate) return false; const d = new Date(s.paymentDueDate); d.setHours(0,0,0,0); return d < today; })
      .sort((a, b) => (a.paymentDueDate! < b.paymentDueDate! ? -1 : 1));
    return {
      accountInvoicesTotal: accountList.reduce((a, s) => a + s.remaining, 0),
      accountInvoicesCount: accountList.length,
      overdueInvoices: overdue,
      overdueTotal: overdue.reduce((a, s) => a + s.remaining, 0),
    };
  }, [salesInvoices]);

  // ── Charts ──
  const chartData = useMemo(() => {
    const days: { date: string; sales: number; purchases: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = localISODate(d);
      days.push({
        date: iso.slice(5),
        sales:     canViewSales     ? salesInvoices.filter((s) => s.date.slice(0,10) === iso && !s.cancelled).reduce((a,s) => a+s.total, 0) : 0,
        purchases: canViewPurchases ? purchaseInvoices.filter((p) => p.date.slice(0,10) === iso).reduce((a,p) => a+p.total, 0) : 0,
      });
    }
    return days;
  }, [salesInvoices, purchaseInvoices, canViewSales, canViewPurchases]);

  const topProductsByStock = useMemo(() =>
    [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5).map((p) => ({ name: p.name, qty: p.quantity })),
    [products]
  );

  const topSellingProducts = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; qty: number }> = {};
    salesInvoices.filter((s) => !s.cancelled).flatMap((s) => s.lines).forEach((l) => {
      if (!map[l.productId]) map[l.productId] = { name: l.productName, revenue: 0, qty: 0 };
      map[l.productId].revenue += l.subtotal;
      map[l.productId].qty += l.quantity;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      .map((p) => ({ name: p.name, revenue: p.revenue }));
  }, [salesInvoices]);

  const lowStockList = useMemo(() =>
    products.filter((p) => p.quantity <= p.minStock).sort((a, b) => a.quantity - b.quantity).slice(0, 6),
    [products]
  );

  const recentActivity = useMemo(() => {
    const items: { id: string; title: string; sub: string; amount?: number; date: string; tone: "green"|"blue"; to?: string }[] = [];
    if (canViewSales) salesInvoices.slice(0, 6).forEach((s) => items.push({ id: s.id, title: `فاتورة مبيعات ${s.invoiceNumber}`, sub: s.customerName, amount: s.total, date: s.date, tone: "green", to: `/sales/${s.id}` }));
    if (canViewPurchases) purchaseInvoices.slice(0, 4).forEach((p) => items.push({ id: p.id, title: `فاتورة مشتريات ${p.invoiceNumber}`, sub: p.supplierName, amount: p.total, date: p.date, tone: "blue", to: `/purchases/${p.id}` }));
    return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  }, [salesInvoices, purchaseInvoices, canViewSales, canViewPurchases]);

  // ── Card permission map ──
  const cardAllowed: Record<CardId, boolean> = {
    totalProducts:    canViewProducts,
    totalStock:       canViewInventory,
    lowStock:         canViewAlerts,
    expiringSoon:     canViewAlerts,
    todaySales:       canViewSales,
    todayPurchases:   canViewPurchases,
    monthlySales:     canViewSales,
    monthlyPurchases: canViewPurchases,
    receivables:      canViewCustomers,
    payables:         canViewSuppliers,
    cashBalance:      canViewCashbox,
    accountInvoices:  canViewSales,
    overdueCount:     canViewSales,
    totalCustomers:   canViewCustomers,
    totalSuppliers:   canViewSuppliers,
    netProfitToday:   canViewSales && canViewPurchases,
  };

  function renderCard(id: CardId) {
    const cur = settings.currency;
    switch (id) {
      case "totalProducts":    return <StatCard key={id} title="إجمالي المنتجات" value={formatNumber(stats.totalProducts)} icon={<Package className="w-5 h-5" />} tone="blue" />;
      case "totalStock":       return <StatCard key={id} title="إجمالي الوحدات في المخزون" value={formatNumber(stats.totalStockUnits)} icon={<Warehouse className="w-5 h-5" />} tone="indigo" />;
      case "lowStock":         return <StatCard key={id} title="منتجات قليلة المخزون" value={formatNumber(stats.lowStock)} icon={<AlertTriangle className="w-5 h-5" />} tone="amber" />;
      case "expiringSoon":     return <StatCard key={id} title="قاربت على الانتهاء" value={formatNumber(stats.expiringSoon)} icon={<CalendarClock className="w-5 h-5" />} tone="red" />;
      case "todaySales":       return <StatCard key={id} title="مبيعات اليوم" value={formatCurrency(stats.todaySales, cur)} icon={<TrendingUp className="w-5 h-5" />} tone="green" />;
      case "todayPurchases":   return <StatCard key={id} title="مشتريات اليوم" value={formatCurrency(stats.todayPurchases, cur)} icon={<TrendingDown className="w-5 h-5" />} tone="slate" />;
      case "monthlySales":     return <StatCard key={id} title="مبيعات الشهر" value={formatCurrency(stats.monthlySales, cur)} icon={<BarChart2 className="w-5 h-5" />} tone="green" delta="هذا الشهر" />;
      case "monthlyPurchases": return <StatCard key={id} title="مشتريات الشهر" value={formatCurrency(stats.monthlyPurchases, cur)} icon={<ShoppingBag className="w-5 h-5" />} tone="slate" delta="هذا الشهر" />;
      case "receivables":      return <StatCard key={id} title="مستحقات من العملاء" value={formatCurrency(stats.receivables, cur)} icon={<HandCoins className="w-5 h-5" />} tone="amber" />;
      case "payables":         return <StatCard key={id} title="مستحقات الموردين" value={formatCurrency(stats.payables, cur)} icon={<ShoppingBag className="w-5 h-5" />} tone="slate" />;
      case "cashBalance":      return <StatCard key={id} title="رصيد الخزينة الحالي" value={formatCurrency(stats.cashBalance, cur)} icon={<Wallet className="w-5 h-5" />} tone="green" />;
      case "accountInvoices":  return <StatCard key={id} title="فواتير آجل مفتوحة" value={formatCurrency(accountInvoicesTotal, cur)} icon={<Clock className="w-5 h-5" />} tone="indigo" delta={`${accountInvoicesCount} فاتورة`} />;
      case "overdueCount":     return <StatCard key={id} title="فواتير متأخرة" value={formatNumber(overdueInvoices.length)} icon={<AlertTriangle className="w-5 h-5" />} tone="red" delta={overdueTotal > 0 ? formatCurrency(overdueTotal, cur) : "لا يوجد تأخير"} />;
      case "totalCustomers":   return <StatCard key={id} title="إجمالي العملاء" value={formatNumber(stats.totalCustomers)} icon={<Users className="w-5 h-5" />} tone="violet" />;
      case "totalSuppliers":   return <StatCard key={id} title="إجمالي الموردين" value={formatNumber(stats.totalSuppliers)} icon={<Building2 className="w-5 h-5" />} tone="slate" />;
      case "netProfitToday":   return <StatCard key={id} title="صافي الربح الشهري" value={formatCurrency(stats.netProfitToday, cur)} icon={<CircleDollarSign className="w-5 h-5" />} tone={stats.netProfitToday >= 0 ? "green" : "rose"} delta="هذا الشهر" />;
      default: return null;
    }
  }

  const visibleCards = cards.filter((c) => c.visible && cardAllowed[c.id]);
  const showTrend = sections.trendChart && (canViewSales || canViewPurchases);
  const showStock = sections.stockChart && canViewInventory;
  const showTopSelling = sections.topSellingChart && canViewSales;
  const showRecent = sections.recentActivity && (canViewSales || canViewPurchases);
  const showLowStock = sections.lowStockPanel && (canViewInventory || canViewAlerts);
  const showOverdue = sections.overduePanel && canViewSales && overdueInvoices.length > 0;
  const showQuickActions = sections.quickActions && (canAddSales || canAddPurchases || canAddProduct || canAddCustomer);

  const trendTitle = canViewSales && canViewPurchases ? "المبيعات والمشتريات — آخر 14 يوم" : canViewSales ? "المبيعات — آخر 14 يوم" : "المشتريات — آخر 14 يوم";

  return (
    <>
      <PageHeader
        title={`أهلاً بك في ${settings.companyNameAr}`}
        description="ملخص عام حسب الصلاحيات المتاحة لهذا المستخدم."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCustomizeOpen(true)} className="gap-1.5">
              <Settings2 className="w-4 h-4" />
              تخصيص
            </Button>
            {canAddSales && (
              <Link to="/sales/new">
                <Button><Plus className="w-4 h-4" />فاتورة مبيعات</Button>
              </Link>
            )}
            {canAddPurchases && (
              <Link to="/purchases/new">
                <Button variant="outline"><Plus className="w-4 h-4" />فاتورة مشتريات</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* ── Stat Cards ── */}
      {visibleCards.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleCards.map((c) => renderCard(c.id))}
        </div>
      ) : (
        <Card>
          <CardBody className="py-10 text-center text-sm text-slate-500">
            لا توجد كروت ظاهرة. اضغط <strong>تخصيص</strong> لإظهار الكروت.
          </CardBody>
        </Card>
      )}

      {/* ── Charts row 1: Trend + Stock ── */}
      {(showTrend || showStock) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showTrend && (
            <Card className={showStock ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader title={trendTitle} subtitle={`العملة: ${settings.currency}`} />
              <CardBody>
                <div className="h-64">
                  <ResponsiveContainer>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="gS" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gP" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v) => formatCurrency(Number(v), settings.currency) as string} />
                      {canViewSales    && <Area type="monotone" dataKey="sales"     name="المبيعات"    stroke="#10b981" fill="url(#gS)" />}
                      {canViewPurchases && <Area type="monotone" dataKey="purchases" name="المشتريات" stroke="#3b82f6" fill="url(#gP)" />}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          )}
          {showStock && (
            <Card>
              <CardHeader title="أكثر المنتجات مخزوناً" subtitle="أعلى 5 منتجات" />
              <CardBody>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer>
                    <BarChart data={topProductsByStock} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" width={130} fontSize={11} stroke="#475569" tick={{ fill: "#475569", fontWeight: 500 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)" }} formatter={(v) => [formatNumber(Number(v)), "الكمية"]} />
                      <defs>
                        <linearGradient id="barG" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                      <Bar dataKey="qty" name="الكمية" fill="url(#barG)" radius={[0,4,4,0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* ── Charts row 2: Top Selling ── */}
      {showTopSelling && topSellingProducts.length > 0 && (
        <Card>
          <CardHeader title="أكثر المنتجات مبيعاً" subtitle={`حسب إجمالي الإيرادات — العملة: ${settings.currency}`} />
          <CardBody>
            <div className="h-56" dir="ltr">
              <ResponsiveContainer>
                <BarChart data={topSellingProducts} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={140} fontSize={11} stroke="#475569" tick={{ fill: "#475569", fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgb(0 0 0 / 0.1)" }} formatter={(v) => [formatCurrency(Number(v), settings.currency), "الإيرادات"]} />
                  <defs>
                    <linearGradient id="barG2" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="revenue" name="الإيرادات" fill="url(#barG2)" radius={[0,4,4,0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Recent Activity + Low Stock ── */}
      {(showRecent || showLowStock) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showRecent && (
            <Card className={showLowStock ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader title="أحدث النشاط" subtitle="أحدث الفواتير والحركات" actions={<Link to={canViewSales ? "/sales" : "/purchases"} className="text-xs text-brand-700 hover:underline">عرض الكل</Link>} />
              <CardBody className="divide-y divide-slate-100 p-0">
                {recentActivity.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">لا يوجد نشاط بعد</div>
                ) : recentActivity.map((a) => (
                  <Link key={a.id} to={a.to ?? "#"} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-lg grid place-items-center ${a.tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                      {a.tone === "green" ? <Receipt className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900">{a.title}</div>
                      <div className="text-xs text-slate-500 truncate">{a.sub}</div>
                    </div>
                    <div className="text-left">
                      {a.amount !== undefined && <div className="text-sm font-medium text-slate-900">{formatCurrency(a.amount, settings.currency)}</div>}
                      <div className="text-xs text-slate-400">{formatDate(a.date)}</div>
                    </div>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
          {showLowStock && (
            <Card>
              <CardHeader title="أقل المنتجات في المخزون" subtitle="تحتاج إعادة توريد" actions={<Link to="/inventory" className="text-xs text-brand-700 hover:underline">عرض الكل</Link>} />
              <CardBody className="divide-y divide-slate-100 p-0">
                {lowStockList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">لا توجد منتجات تحت حد الأمان</div>
                ) : lowStockList.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500">الحد الأدنى: {p.minStock}</div>
                    </div>
                    <Badge tone={p.quantity === 0 ? "red" : "amber"}>{p.quantity} {p.unit}</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* ── Overdue Invoices ── */}
      {showOverdue && (
        <Card>
          <CardHeader title="فواتير آجل متأخرة عن الاستحقاق" subtitle={`${overdueInvoices.length} فاتورة — إجمالي: ${formatCurrency(overdueTotal, settings.currency)}`} actions={<Link to="/sales" className="text-xs text-brand-700 hover:underline">عرض كل الفواتير</Link>} />
          <CardBody className="divide-y divide-slate-100 p-0">
            {overdueInvoices.slice(0, 8).map((inv) => {
              const due = new Date(inv.paymentDueDate!); due.setHours(0,0,0,0);
              const today = new Date(); today.setHours(0,0,0,0);
              const daysLate = Math.floor((today.getTime() - due.getTime()) / 86400000);
              return (
                <Link key={inv.id} to={`/sales/${inv.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 grid place-items-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{inv.customerName}</div>
                    <div className="text-xs text-slate-500">{inv.invoiceNumber} — متأخر {daysLate} يوم</div>
                  </div>
                  <div className="text-start shrink-0">
                    <div className="text-sm font-bold text-rose-700">{formatCurrency(inv.remaining, settings.currency)}</div>
                    <div className="text-xs text-slate-400">استحقاق: {formatDate(inv.paymentDueDate!)}</div>
                  </div>
                </Link>
              );
            })}
          </CardBody>
        </Card>
      )}

      {/* ── Quick Actions ── */}
      {showQuickActions && (
        <Card>
          <CardHeader title="إجراءات سريعة" />
          <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {canAddSales     && <Link to="/sales/new"><Button variant="outline" className="w-full justify-start"><Receipt className="w-4 h-4" />فاتورة مبيعات جديدة</Button></Link>}
            {canAddPurchases && <Link to="/purchases/new"><Button variant="outline" className="w-full justify-start"><ShoppingBag className="w-4 h-4" />فاتورة مشتريات جديدة</Button></Link>}
            {canAddProduct   && <Link to="/products"><Button variant="outline" className="w-full justify-start"><Package className="w-4 h-4" />إضافة منتج</Button></Link>}
            {canAddCustomer  && <Link to="/customers"><Button variant="outline" className="w-full justify-start"><Users className="w-4 h-4" />إضافة عميل</Button></Link>}
          </CardBody>
        </Card>
      )}

      {/* ── Customize Dialog ── */}
      <CustomizeDialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        cards={cards}
        sections={sections}
        onToggleCard={toggleCard}
        onToggleSection={toggleSection}
        onMove={moveCard}
        onReset={reset}
      />
    </>
  );
}

import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Package,
  Warehouse,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Wallet,
  HandCoins,
  Receipt,
  Plus,
  ShoppingBag,
  Users,
  ArrowLeft,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { useApp } from "../store/AppContext";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import { hasPermission } from "../lib/permissions";
import { daysUntil, isToday } from "../lib/utils";

function StatCard({
  title,
  value,
  icon,
  tone,
  delta,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone: "blue" | "green" | "amber" | "red" | "slate" | "indigo";
  delta?: string;
}) {
  const toneMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg grid place-items-center ${toneMap[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
            {value}
          </div>
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

export function DashboardPage() {
  const {
    products,
    purchaseInvoices,
    salesInvoices,
    customers,
    suppliers,
    settings,
    currentCashBalance,
    customerBalance,
    supplierBalance,
    currentUser,
  } = useApp();

  const canViewProducts = hasPermission(currentUser, "products");
  const canViewInventory = hasPermission(currentUser, "inventory");
  const canViewAlerts = hasPermission(currentUser, "alerts");
  const canViewSales = hasPermission(currentUser, "salesInvoices");
  const canAddSalesInvoice = hasPermission(currentUser, "salesInvoices", "add");
  const canViewPurchases = hasPermission(currentUser, "purchaseInvoices");
  const canAddPurchaseInvoice = hasPermission(currentUser, "purchaseInvoices", "add");
  const canViewCustomers = hasPermission(currentUser, "customers");
  const canAddCustomer = hasPermission(currentUser, "customers", "add");
  const canViewSuppliers = hasPermission(currentUser, "suppliers");
  const canViewCashbox = hasPermission(currentUser, "cashbox");
  const canAddProduct = hasPermission(currentUser, "products", "add");

  const stats = useMemo(() => {
    const totalStockUnits = products.reduce((a, p) => a + p.quantity, 0);
    const lowStock = products.filter(
      (p) => p.quantity <= p.minStock
    ).length;
    const expiringSoon = products.filter((p) => {
      if (!p.hasExpiry || !p.expiryDate) return false;
      const du = daysUntil(p.expiryDate);
      return du !== null && du >= 0 && du <= 14;
    }).length;
    const todaySales = salesInvoices
      .filter((s) => isToday(s.date) && !s.cancelled)
      .reduce((a, s) => a + s.total, 0);
    const todayPurchases = purchaseInvoices
      .filter((p) => isToday(p.date))
      .reduce((a, p) => a + p.total, 0);
    const receivables = customers.reduce(
      (a, c) => a + customerBalance(c.id),
      0
    );
    const payables = suppliers.reduce(
      (a, s) => a + supplierBalance(s.id),
      0
    );
    return {
      totalProducts: products.length,
      totalStockUnits,
      lowStock,
      expiringSoon,
      todaySales,
      todayPurchases,
      receivables,
      payables,
      cashBalance: currentCashBalance(),
    };
  }, [
    products,
    salesInvoices,
    purchaseInvoices,
    customers,
    suppliers,
    customerBalance,
    supplierBalance,
    currentCashBalance,
  ]);

  const chartData = useMemo(() => {
    // last 14 days
    const days: { date: string; sales: number; purchases: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const sales = canViewSales
        ? salesInvoices
            .filter((s) => s.date.slice(0, 10) === iso && !s.cancelled)
            .reduce((a, s) => a + s.total, 0)
        : 0;
      const purchases = canViewPurchases
        ? purchaseInvoices
            .filter((p) => p.date.slice(0, 10) === iso)
            .reduce((a, p) => a + p.total, 0)
        : 0;
      days.push({ date: iso.slice(5), sales, purchases });
    }
    return days;
  }, [salesInvoices, purchaseInvoices, canViewSales, canViewPurchases]);

  const lowStockList = useMemo(
    () =>
      products
        .filter((p) => p.quantity <= p.minStock)
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 6),
    [products]
  );

  const topProductsByStock = useMemo(() => {
    return [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((p) => ({ name: p.name, qty: p.quantity }));
  }, [products]);

  const recentActivity = useMemo(() => {
    const items: {
      id: string;
      title: string;
      sub: string;
      amount?: number;
      date: string;
      tone: "blue" | "green" | "amber" | "red";
      to?: string;
    }[] = [];
    if (canViewSales) {
      salesInvoices.slice(0, 6).forEach((s) =>
        items.push({
          id: s.id,
          title: `فاتورة مبيعات ${s.invoiceNumber}`,
          sub: s.customerName,
          amount: s.total,
          date: s.date,
          tone: "green",
          to: `/sales/${s.id}`,
        })
      );
    }
    if (canViewPurchases) {
      purchaseInvoices.slice(0, 4).forEach((p) =>
        items.push({
          id: p.id,
          title: `فاتورة مشتريات ${p.invoiceNumber}`,
          sub: p.supplierName,
          amount: p.total,
          date: p.date,
          tone: "blue",
          to: `/purchases/${p.id}`,
        })
      );
    }
    return items
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8);
  }, [salesInvoices, purchaseInvoices, canViewSales, canViewPurchases]);

  const { accountInvoicesTotal, accountInvoicesCount, overdueInvoices, overdueTotal } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const accountList = salesInvoices.filter(
      (s) => !s.cancelled && s.remaining > 0 && s.paymentType === "account"
    );
    const overdue = accountList
      .filter((s) => {
        if (!s.paymentDueDate) return false;
        const due = new Date(s.paymentDueDate);
        due.setHours(0, 0, 0, 0);
        return due < today;
      })
      .sort((a, b) => (a.paymentDueDate! < b.paymentDueDate! ? -1 : 1));
    return {
      accountInvoicesTotal: accountList.reduce((a, s) => a + s.remaining, 0),
      accountInvoicesCount: accountList.length,
      overdueInvoices: overdue,
      overdueTotal: overdue.reduce((a, s) => a + s.remaining, 0),
    };
  }, [salesInvoices]);

  const showTrendChart = canViewSales || canViewPurchases;
  const showStockChart = canViewInventory;
  const showRecentActivity = canViewSales || canViewPurchases;
  const showLowStockPanel = canViewInventory || canViewAlerts;
  const trendChartTitle =
    canViewSales && canViewPurchases
      ? "المبيعات والمشتريات — آخر 14 يوم"
      : canViewSales
      ? "المبيعات — آخر 14 يوم"
      : "المشتريات — آخر 14 يوم";
  const recentActivityLink = canViewSales ? "/sales" : "/purchases";
  const lowStockLink = canViewInventory ? "/inventory" : "/alerts";
  const hasDashboardWidgets =
    canViewProducts ||
    canViewInventory ||
    canViewAlerts ||
    canViewSales ||
    canViewPurchases ||
    canViewCustomers ||
    canViewSuppliers ||
    canViewCashbox;

  return (
    <>
      <PageHeader
        title={`أهلاً بك في ${settings.companyNameAr}`}
        description="ملخص عام حسب الصلاحيات المتاحة لهذا المستخدم."
        actions={
          canAddSalesInvoice || canAddPurchaseInvoice ? (
            <>
              {canAddSalesInvoice ? (
                <Link to="/sales/new">
                  <Button>
                    <Plus className="w-4 h-4" />
                    فاتورة مبيعات
                  </Button>
                </Link>
              ) : null}
              {canAddPurchaseInvoice ? (
                <Link to="/purchases/new">
                  <Button variant="outline">
                    <Plus className="w-4 h-4" />
                    فاتورة مشتريات
                  </Button>
                </Link>
              ) : null}
            </>
          ) : null
        }
      />

      {hasDashboardWidgets ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {canViewProducts ? (
            <StatCard
              title="إجمالي المنتجات"
              value={formatNumber(stats.totalProducts)}
              icon={<Package className="w-5 h-5" />}
              tone="blue"
            />
          ) : null}
          {canViewInventory ? (
            <StatCard
              title="إجمالي الوحدات في المخزون"
              value={formatNumber(stats.totalStockUnits)}
              icon={<Warehouse className="w-5 h-5" />}
              tone="indigo"
            />
          ) : null}
          {canViewAlerts ? (
            <>
              <StatCard
                title="منتجات قليلة المخزون"
                value={formatNumber(stats.lowStock)}
                icon={<AlertTriangle className="w-5 h-5" />}
                tone="amber"
              />
              <StatCard
                title="قاربت على الانتهاء"
                value={formatNumber(stats.expiringSoon)}
                icon={<CalendarClock className="w-5 h-5" />}
                tone="red"
              />
            </>
          ) : null}
          {canViewSales ? (
            <StatCard
              title="مبيعات اليوم"
              value={formatCurrency(stats.todaySales, settings.currency)}
              icon={<TrendingUp className="w-5 h-5" />}
              tone="green"
            />
          ) : null}
          {canViewPurchases ? (
            <StatCard
              title="مشتريات اليوم"
              value={formatCurrency(stats.todayPurchases, settings.currency)}
              icon={<TrendingDown className="w-5 h-5" />}
              tone="slate"
            />
          ) : null}
          {canViewCustomers ? (
            <StatCard
              title="مستحقات العملاء"
              value={formatCurrency(stats.receivables, settings.currency)}
              icon={<HandCoins className="w-5 h-5" />}
              tone="amber"
            />
          ) : null}
          {canViewSuppliers ? (
            <StatCard
              title="مستحقات الموردين"
              value={formatCurrency(stats.payables, settings.currency)}
              icon={<ShoppingBag className="w-5 h-5" />}
              tone="slate"
            />
          ) : null}
          {canViewCashbox ? (
            <StatCard
              title="رصيد الخزينة الحالي"
              value={formatCurrency(stats.cashBalance, settings.currency)}
              icon={<Wallet className="w-5 h-5" />}
              tone="green"
            />
          ) : null}
          {canViewSales ? (
            <StatCard
              title="فواتير آجل مفتوحة"
              value={formatCurrency(accountInvoicesTotal, settings.currency)}
              icon={<Clock className="w-5 h-5" />}
              tone="indigo"
              delta={`${accountInvoicesCount} فاتورة`}
            />
          ) : null}
          {canViewSales ? (
            <StatCard
              title="فواتير متأخرة عن الاستحقاق"
              value={formatNumber(overdueInvoices.length)}
              icon={<AlertTriangle className="w-5 h-5" />}
              tone="red"
              delta={overdueTotal > 0 ? formatCurrency(overdueTotal, settings.currency) : "لا يوجد تأخير"}
            />
          ) : null}
        </div>
      ) : (
        <Card>
          <CardBody className="py-10 text-center text-sm text-slate-500">
            لا توجد عناصر متاحة في لوحة التحكم لهذا المستخدم. يمكن للمدير تعديل الصلاحيات من صفحة المستخدمين.
          </CardBody>
        </Card>
      )}

      {showTrendChart || showStockChart ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showTrendChart ? (
            <Card className={showStockChart ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader
                title={trendChartTitle}
                subtitle={`العملة: ${settings.currency}`}
              />
              <CardBody>
                <div className="h-72">
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
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                        }}
                        formatter={(v) => formatCurrency(Number(v), settings.currency) as string}
                      />
                      {canViewSales ? (
                        <Area
                          type="monotone"
                          dataKey="sales"
                          name="المبيعات"
                          stroke="#10b981"
                          fill="url(#gS)"
                        />
                      ) : null}
                      {canViewPurchases ? (
                        <Area
                          type="monotone"
                          dataKey="purchases"
                          name="المشتريات"
                          stroke="#3b82f6"
                          fill="url(#gP)"
                        />
                      ) : null}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {showStockChart ? (
            <Card>
              <CardHeader
                title="أكثر المنتجات مخزوناً"
                subtitle="أعلى 5 منتجات"
              />
              <CardBody>
                <div className="h-72" dir="ltr">
                  <ResponsiveContainer>
                    <BarChart 
                      data={topProductsByStock} 
                      layout="vertical"
                      margin={{ left: 10, right: 30, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        fontSize={12}
                        stroke="#475569"
                        tick={{ fill: "#475569", fontWeight: 500, fontFamily: 'Cairo' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#f8fafc" }}
                        contentStyle={{ fontSize: 12, borderRadius: 12, border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                        formatter={(v) => [formatNumber(Number(v)), "الكمية"]}
                      />
                      <Bar 
                        dataKey="qty" 
                        name="الكمية" 
                        fill="url(#barGradient)" 
                        radius={[0, 4, 4, 0]} 
                        barSize={20}
                      />
                      <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#818cf8" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}

      {showRecentActivity || showLowStockPanel ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {showRecentActivity ? (
            <Card className={showLowStockPanel ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader
                title="أحدث النشاط"
                subtitle="أحدث الفواتير والحركات حسب الصلاحيات"
                actions={
                  <Link to={recentActivityLink} className="text-xs text-brand-700 hover:underline">
                    عرض الكل
                  </Link>
                }
              />
              <CardBody className="divide-y divide-slate-100 p-0">
                {recentActivity.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    لا يوجد نشاط بعد
                  </div>
                ) : (
                  recentActivity.map((a) => (
                    <Link
                      key={a.id}
                      to={a.to ?? "#"}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg grid place-items-center ${
                          a.tone === "green"
                            ? "bg-emerald-50 text-emerald-600"
                            : a.tone === "blue"
                            ? "bg-blue-50 text-blue-600"
                            : a.tone === "amber"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {a.tone === "green" ? (
                          <Receipt className="w-4 h-4" />
                        ) : (
                          <ShoppingBag className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-900">{a.title}</div>
                        <div className="text-xs text-slate-500 truncate">{a.sub}</div>
                      </div>
                      <div className="text-left">
                        {a.amount !== undefined ? (
                          <div className="text-sm font-medium text-slate-900">
                            {formatCurrency(a.amount, settings.currency)}
                          </div>
                        ) : null}
                        <div className="text-xs text-slate-400">{formatDate(a.date)}</div>
                      </div>
                      <ArrowLeft className="w-4 h-4 text-slate-300" />
                    </Link>
                  ))
                )}
              </CardBody>
            </Card>
          ) : null}

          {showLowStockPanel ? (
            <Card>
              <CardHeader
                title="أقل المنتجات في المخزون"
                subtitle="منتجات تحتاج إعادة توريد"
                actions={
                  <Link to={lowStockLink} className="text-xs text-brand-700 hover:underline">
                    عرض الكل
                  </Link>
                }
              />
              <CardBody className="divide-y divide-slate-100 p-0">
                {lowStockList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    لا توجد منتجات تحت حد الأمان
                  </div>
                ) : (
                  lowStockList.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-900 truncate">{p.name}</div>
                        <div className="text-xs text-slate-500">
                          الحد الأدنى: {p.minStock}
                        </div>
                      </div>
                      <Badge tone={p.quantity === 0 ? "red" : "amber"}>
                        {p.quantity} {p.unit}
                      </Badge>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}

      {canViewSales && overdueInvoices.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader
              title="فواتير آجل متأخرة عن الاستحقاق"
              subtitle={`${overdueInvoices.length} فاتورة — إجمالي متأخر: ${formatCurrency(overdueTotal, settings.currency)}`}
              actions={
                <Link to="/sales" className="text-xs text-brand-700 hover:underline">
                  عرض كل الفواتير
                </Link>
              }
            />
            <CardBody className="divide-y divide-slate-100 p-0">
              {overdueInvoices.slice(0, 8).map((inv) => {
                const due = new Date(inv.paymentDueDate!);
                due.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const daysLate = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <Link
                    key={inv.id}
                    to={`/sales/${inv.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors"
                  >
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
                    <ArrowLeft className="w-4 h-4 text-slate-300 shrink-0" />
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {canAddSalesInvoice || canAddPurchaseInvoice || canAddProduct || canAddCustomer ? (
        <Card>
          <CardHeader title="إجراءات سريعة" />
          <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {canAddSalesInvoice ? (
              <Link to="/sales/new">
                <Button variant="outline" className="w-full justify-start">
                  <Receipt className="w-4 h-4" />
                  فاتورة مبيعات جديدة
                </Button>
              </Link>
            ) : null}
            {canAddPurchaseInvoice ? (
              <Link to="/purchases/new">
                <Button variant="outline" className="w-full justify-start">
                  <ShoppingBag className="w-4 h-4" />
                  فاتورة مشتريات جديدة
                </Button>
              </Link>
            ) : null}
            {canAddProduct ? (
              <Link to="/products">
                <Button variant="outline" className="w-full justify-start">
                  <Package className="w-4 h-4" />
                  إضافة منتج
                </Button>
              </Link>
            ) : null}
            {canAddCustomer ? (
              <Link to="/customers">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4" />
                  إضافة عميل
                </Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

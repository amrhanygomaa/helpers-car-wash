import { useMemo, useState } from "react";
import {
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Coins,
  UserRound,
  Users,
  UserRoundMinus,
  HandCoins,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Field, Select } from "../components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCatalog } from "../store/CatalogContext";
import { useUsers } from "../store/UsersContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useReporting } from "../store/ReportingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { daysUntil, getMonthsInRange, inRange, localISODate, todayISO } from "../lib/utils";
import { employeeCollectedCash } from "../store/_pure";

type PrintMode =
  | "full"
  | "sales"
  | "purchases"
  | "stock"
  | "customers"
  | "suppliers"
  | "supplierDues"
  | "commissions"
  | "monthlyProfit"
  | "customerDues";

export function ReportsPage() {
  const { products, customers, suppliers } = useCatalog();
  const { users } = useUsers();
  const { salesInvoices, purchaseInvoices, salesReturns, cashEntries } = useInvoicing();
  const { settings } = useSettings();
  const {
    customerBalance,
    supplierBalance,
    calculateSupplierCommission,
    exportToExcel,
  } = useReporting();
  const { currentUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return localISODate(d);
  });
  const [to, setTo] = useState<string>(() => todayISO());
  const [printMode, setPrintMode] = useState<PrintMode>("full");
  const canViewEmployeeBonuses = currentUser?.role === "owner";

  const salesInRange = useMemo(
    () => salesInvoices.filter((s) => !s.cancelled && inRange(s.date, from, to)),
    [salesInvoices, from, to]
  );
  const purchasesInRange = useMemo(
    () => purchaseInvoices.filter((p) => inRange(p.date, from, to)),
    [purchaseInvoices, from, to]
  );

  const invoiceById = useMemo(
    () => new Map(salesInvoices.map((s) => [s.id, s])),
    [salesInvoices]
  );

  // OBS-01: returns reverse revenue and profit. Returns on cancelled invoices
  // are excluded because the cancellation already reversed the whole invoice.
  const salesReturnsInRange = useMemo(
    () =>
      salesReturns.filter(
        (r) => inRange(r.date, from, to) && !invoiceById.get(r.originalInvoiceId)?.cancelled
      ),
    [salesReturns, from, to, invoiceById]
  );

  // Cost of a returned line: original invoice line (by sourceLineId, then by
  // product), falling back to the product's current purchase price.
  const returnLineCost = (originalInvoiceId: string, rl: { sourceLineId?: string; productId: string }) => {
    const orig = invoiceById.get(originalInvoiceId);
    const origLine =
      orig?.lines.find((l) => l.id === rl.sourceLineId) ??
      orig?.lines.find((l) => l.productId === rl.productId);
    return origLine?.costPrice ?? products.find((x) => x.id === rl.productId)?.purchasePrice ?? 0;
  };

  const returnsTotalInRange = salesReturnsInRange.reduce((a, r) => a + r.total, 0);
  const returnsByPriceType = salesReturnsInRange.reduce(
    (acc, r) => {
      const type = invoiceById.get(r.originalInvoiceId)?.priceType === "retail" ? "retail" : "wholesale";
      acc[type] += r.total;
      return acc;
    },
    { wholesale: 0, retail: 0 }
  );

  // Net sales: invoice totals are already net of their discount; returns in
  // the period are deducted so the report shows what was actually kept.
  const totalSales = salesInRange.reduce((a, s) => a + s.total, 0) - returnsTotalInRange;
  const totalPurchases = purchasesInRange.reduce((a, p) => a + p.total, 0);
  const wholesaleSalesTotal =
    salesInRange
      .filter((s) => s.priceType === "wholesale")
      .reduce((a, s) => a + s.total, 0) - returnsByPriceType.wholesale;
  const retailSalesTotal =
    salesInRange
      .filter((s) => s.priceType === "retail")
      .reduce((a, s) => a + s.total, 0) - returnsByPriceType.retail;

  const totalCommissions = useMemo(() => {
    return suppliers.reduce((sum, s) => {
      const comms = calculateSupplierCommission(s.id);
      return sum + comms.reduce((a, c) => a + c.earned, 0);
    }, 0);
  }, [suppliers, calculateSupplierCommission]);

  // OBS-01: estimated GROSS profit = Σ(line price − cost) − invoice discounts
  // − profit reversed by returns in the period.
  const estimatedProfit = useMemo(() => {
    let p = 0;
    salesInRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const cost = l.costPrice ?? products.find((x) => x.id === l.productId)?.purchasePrice ?? 0;
        p += (l.price - cost) * l.quantity;
      });
      p -= inv.discount ?? 0;
    });
    salesReturnsInRange.forEach((r) => {
      r.lines.forEach((rl) => {
        p -= (rl.price - returnLineCost(r.originalInvoiceId, rl)) * rl.quantity;
      });
    });
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesInRange, salesReturnsInRange, invoiceById, products]);

  const monthlyProfitData = useMemo(() => {
    const map = new Map<string, { month: string; sales: number; purchases: number; profit: number }>();
    const entryOf = (key: string) =>
      map.get(key) ?? { month: key, sales: 0, purchases: 0, profit: 0 };
    salesInvoices.filter((s) => !s.cancelled).forEach((s) => {
      const entry = entryOf(s.date.slice(0, 7));
      entry.sales += s.total;
      let invProfit = -(s.discount ?? 0);
      s.lines.forEach((l) => {
        const cost = l.costPrice ?? products.find((x) => x.id === l.productId)?.purchasePrice ?? 0;
        invProfit += (l.price - cost) * l.quantity;
      });
      entry.profit += invProfit;
      map.set(entry.month, entry);
    });
    salesReturns.forEach((r) => {
      if (invoiceById.get(r.originalInvoiceId)?.cancelled) return;
      const entry = entryOf(r.date.slice(0, 7));
      entry.sales -= r.total;
      r.lines.forEach((rl) => {
        entry.profit -= (rl.price - returnLineCost(r.originalInvoiceId, rl)) * rl.quantity;
      });
      map.set(entry.month, entry);
    });
    purchaseInvoices.forEach((p) => {
      const entry = entryOf(p.date.slice(0, 7));
      entry.purchases += p.total;
      map.set(entry.month, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesInvoices, salesReturns, purchaseInvoices, invoiceById, products]);

  const monthlyTotals = useMemo(
    () =>
      monthlyProfitData.reduce(
        (acc, m) => ({
          sales: acc.sales + m.sales,
          purchases: acc.purchases + m.purchases,
          profit: acc.profit + m.profit,
        }),
        { sales: 0, purchases: 0, profit: 0 }
      ),
    [monthlyProfitData]
  );

  const employeeBonusRows = useMemo(() => {
    const months = getMonthsInRange(from, to);
    return users
      .filter((user) => user.role === "employee")
      .map((employee) => {
        const invoices = salesInRange.filter((invoice) => invoice.createdByUserId === employee.id);
        const employeeTotalSales = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

        // Calculate commission month-by-month to respect per-month rates
        let bonus = 0;
        let totalTarget = 0;
        const hasMonthlyConfigs = employee.monthlyConfigs && Object.keys(employee.monthlyConfigs).length > 0;
        const collected = employeeCollectedCash(salesInvoices, salesReturns, cashEntries, employee.id, from, to);

        if (hasMonthlyConfigs) {
          months.forEach((m) => {
            const [yr, mn] = m.split("-").map(Number);
            const mStart = localISODate(new Date(yr, mn - 1, 1));
            const mEnd = localISODate(new Date(yr, mn, 0));
            const mFrom = mStart < from ? from : mStart;
            const mTo = mEnd > to ? to : mEnd;
            const cfg = employee.monthlyConfigs?.[m];
            const mPct = cfg?.commissionPct ?? employee.salesCommissionPct ?? 0;
            const mTarget = cfg?.target ?? employee.monthlySalesTarget ?? 0;
            const mCollected = employeeCollectedCash(salesInvoices, salesReturns, cashEntries, employee.id, mFrom, mTo);
            bonus += (mCollected * mPct) / 100;
            totalTarget += mTarget;
          });
        } else {
          const commissionPct = employee.salesCommissionPct ?? 0;
          bonus = (collected * commissionPct) / 100;
          totalTarget = (employee.monthlySalesTarget ?? 0) * months.length;
        }

        const salary = employee.monthlySalary ?? 0;
        const effectivePct = collected > 0 ? (bonus / collected) * 100 : (employee.salesCommissionPct ?? 0);
        const remainingTarget = totalTarget > 0 ? Math.max(0, totalTarget - employeeTotalSales) : 0;
        const exceededTarget = totalTarget > 0 ? Math.max(0, employeeTotalSales - totalTarget) : 0;

        return {
          employee,
          invoiceCount: invoices.length,
          totalSales: employeeTotalSales,
          collected,
          commissionPct: effectivePct,
          bonus,
          salary,
          target: totalTarget,
          remainingTarget,
          exceededTarget,
          achievedTarget: totalTarget > 0 && employeeTotalSales >= totalTarget,
          totalEarnings: salary + bonus,
        };
      })
      .sort((a, b) => b.bonus - a.bonus || b.totalSales - a.totalSales);
  }, [users, salesInRange, salesInvoices, salesReturns, cashEntries, from, to]);

  const totalEmployeeBonuses = employeeBonusRows.reduce((sum, row) => sum + row.bonus, 0);
  const totalEmployeeSales = employeeBonusRows.reduce((sum, row) => sum + row.totalSales, 0);
  const employeesWithSales = employeeBonusRows.filter((row) => row.invoiceCount > 0).length;
  const employeesTargetAchieved = employeeBonusRows.filter((row) => row.achievedTarget).length;
  const unattributedEmployeeInvoices = salesInRange.filter((invoice) => !invoice.createdByUserId);
  const unattributedEmployeeSales = unattributedEmployeeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  // Supplier bonuses are income the store EARNS from suppliers (they were
  // wrongly subtracted before); employee bonuses are an expense.
  const estimatedProfitAfterBonuses = estimatedProfit + totalCommissions - totalEmployeeBonuses;

  const totalReceivables = useMemo(
    () => customers.reduce((sum, c) => sum + Math.max(0, customerBalance(c.id)), 0),
    [customers, customerBalance]
  );

  const customerCredits = useMemo(
    () => customers.reduce((sum, c) => sum + Math.max(0, -customerBalance(c.id)), 0),
    [customers, customerBalance]
  );

  const supplierLookup = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  const supplierDueInvoices = useMemo(
    () =>
      purchaseInvoices
        .filter((invoice) => invoice.remaining > 0)
        .sort((a, b) => {
          const byDate = a.date.localeCompare(b.date);
          return byDate !== 0 ? byDate : b.remaining - a.remaining;
        }),
    [purchaseInvoices]
  );

  const supplierPayableRows = useMemo(() => {
    const rows = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierCode?: string;
        phone?: string;
        invoiceCount: number;
        total: number;
        paid: number;
        remaining: number;
        oldestDate: string;
      }
    >();

    supplierDueInvoices.forEach((invoice) => {
      const supplier = supplierLookup.get(invoice.supplierId);
      const current = rows.get(invoice.supplierId) ?? {
        supplierId: invoice.supplierId,
        supplierName: invoice.supplierName,
        supplierCode: supplier?.code,
        phone: supplier?.phone,
        invoiceCount: 0,
        total: 0,
        paid: 0,
        remaining: 0,
        oldestDate: invoice.date,
      };

      current.invoiceCount += 1;
      current.total += invoice.total;
      current.paid += invoice.amountPaid;
      current.remaining += invoice.remaining;
      if (invoice.date < current.oldestDate) current.oldestDate = invoice.date;
      rows.set(invoice.supplierId, current);
    });

    return Array.from(rows.values()).sort((a, b) => b.remaining - a.remaining);
  }, [supplierDueInvoices, supplierLookup]);

  const supplierPayablesTotal = supplierDueInvoices.reduce((sum, invoice) => sum + invoice.remaining, 0);
  const supplierDuePaidTotal = supplierDueInvoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0);
  const largestSupplierPayable = supplierPayableRows[0];
  const oldestSupplierDue = supplierDueInvoices[0];

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; purchases: number }>();
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = localISODate(d);
      map.set(iso, { date: iso.slice(5), sales: 0, purchases: 0 });
    }
    salesInRange.forEach((s) => {
      const key = s.date.slice(0, 10);
      const e = map.get(key);
      if (e) e.sales += s.total;
    });
    purchasesInRange.forEach((p) => {
      const key = p.date.slice(0, 10);
      const e = map.get(key);
      if (e) e.purchases += p.total;
    });
    return Array.from(map.values());
  }, [from, to, salesInRange, purchasesInRange]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; grossProfit: number }>();
    salesInRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const e = map.get(l.productId) ?? { name: l.productName, qty: 0, revenue: 0, grossProfit: 0 };
        const cost = l.costPrice ?? products.find((x) => x.id === l.productId)?.purchasePrice ?? 0;
        e.qty += l.quantity;
        e.revenue += l.subtotal;
        e.grossProfit += (l.price - cost) * l.quantity;
        map.set(l.productId, e);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [salesInRange, products]);

  const categoryShare = useMemo(() => {
    const map = new Map<string, number>();
    salesInRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const prod = products.find((p) => p.id === l.productId);
        if (!prod) return;
        map.set(prod.category, (map.get(prod.category) ?? 0) + l.subtotal);
      });
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [salesInRange, products]);

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="التقارير"
          description="تقارير عملية لأداء الأعمال"
          actions={
            <>
              {currentUser?.role === "owner" ? (
                <Button variant="outline" onClick={() => navigate("/reports/employees")}>
                  <UserRound className="w-4 h-4" /> تقرير الموظفين
                </Button>
              ) : null}
              <Button 
                variant="outline" 
                onClick={() => {
                  const excelModes = ["products", "customers", "suppliers", "sales", "purchases", "stock", "commissions"] as const;
                  type ExcelMode = typeof excelModes[number];
                  if (printMode === "full" || printMode === "supplierDues" || printMode === "monthlyProfit") {
                    toast.info("تصدير", "يرجى اختيار تقرير محدد (مبيعات، مشتريات، إلخ) للتصدير إلى Excel");
                  } else if ((excelModes as readonly string[]).includes(printMode)) {
                    exportToExcel(printMode as ExcelMode);
                  }
                }}
              >
                <Download className="w-4 h-4" /> تصدير
              </Button>
            </>
          }
        />
      </div>

      <div className="no-print">
        <Card>
          <CardBody className="flex flex-wrap gap-3 items-end">
            <Field label="من تاريخ">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </Field>
            <Field label="إلى تاريخ">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-7); setFrom(localISODate(d)); setTo(todayISO());}}>
                آخر 7 أيام
              </Button>
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-30); setFrom(localISODate(d)); setTo(todayISO());}}>
                آخر 30 يوم
              </Button>
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-90); setFrom(localISODate(d)); setTo(todayISO());}}>
                آخر 90 يوم
              </Button>
            </div>
            <div className="flex items-center gap-2 ms-auto">
              <Select 
                value={printMode} 
                onChange={(e) => setPrintMode(e.target.value as PrintMode)}
                className="w-48 text-xs h-9"
              >
                <option value="full">التقرير التحليلي الشامل</option>
                <option value="sales">تقرير مبيعات الفترة</option>
                <option value="purchases">تقرير مشتريات الفترة</option>
                <option value="stock">كشف حالة المخزون</option>
                <option value="customers">كشف أرصدة العملاء</option>
                <option value="suppliers">كشف أرصدة الموردين</option>
                <option value="supplierDues">كشف فلوس علينا للموردين</option>
                <option value="commissions">تقرير عمولات الموردين</option>
                <option value="monthlyProfit">تقرير الربح الشهري</option>
                <option value="customerDues">كشف فلوس لدينا من عملاء</option>
              </Select>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> طباعة
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="no-print grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<TrendingUp className="w-5 h-5" />} tone="green" label="صافي المبيعات (بعد المرتجعات)" value={formatCurrency(totalSales, settings.currency)} />
        <Stat icon={<TrendingDown className="w-5 h-5" />} tone="blue" label="إجمالي المشتريات" value={formatCurrency(totalPurchases, settings.currency)} />
        <Stat icon={<Coins className="w-5 h-5" />} tone="amber" label="الربح التقديري" value={formatCurrency(estimatedProfit, settings.currency)} />
        <Stat icon={<TrendingUp className="w-5 h-5" />} tone="emerald" label="بونص الموردين" value={formatCurrency(totalCommissions, settings.currency)} />
        {canViewEmployeeBonuses ? (
          <Stat icon={<UserRound className="w-5 h-5" />} tone="rose" label="بونص الموظفين" value={formatCurrency(totalEmployeeBonuses, settings.currency)} />
        ) : null}
        <Stat icon={<Users className="w-5 h-5" />} tone="indigo" label="مستحقات من العملاء" value={formatCurrency(totalReceivables, settings.currency)} />
        <Stat icon={<UserRoundMinus className="w-5 h-5" />} tone="violet" label="فلوس علينا للعملاء" value={formatCurrency(customerCredits, settings.currency)} />
        <Stat icon={<HandCoins className="w-5 h-5" />} tone="rose" label="فلوس علينا للموردين" value={formatCurrency(supplierPayablesTotal, settings.currency)} />
      </div>

      <div className="no-print">
        <Tabs defaultValue="sales">
        <TabsList className="flex w-full flex-wrap justify-center">
          <TabsTrigger value="sales">تقرير المبيعات</TabsTrigger>
          <TabsTrigger value="purchases">تقرير المشتريات</TabsTrigger>
          <TabsTrigger value="stock">تقرير المخزون</TabsTrigger>
          <TabsTrigger value="lowstock">نفذ المخزون</TabsTrigger>
          <TabsTrigger value="expiredstock">منتهي الصلاحية</TabsTrigger>
          <TabsTrigger value="customers">أرصدة العملاء</TabsTrigger>
          <TabsTrigger value="suppliers">أرصدة الموردين</TabsTrigger>
          <TabsTrigger value="supplierDues">فلوس علينا للموردين</TabsTrigger>
          <TabsTrigger value="commissions">عمولات الموردين</TabsTrigger>
          <TabsTrigger value="monthlyProfit">الربح الشهري</TabsTrigger>
          <TabsTrigger value="customerDues">فلوس لدينا من عملاء</TabsTrigger>
          {canViewEmployeeBonuses ? <TabsTrigger value="employeeBonuses">بونص الموظفين</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="sales">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title="المبيعات اليومية" />
              <CardBody className="h-72">
                <ResponsiveContainer>
                  <LineChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" tick={{ fill: "#64748b" }} />
                    <YAxis fontSize={12} stroke="#94a3b8" tick={{ fill: "#64748b" }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                      formatter={(v) => [formatCurrency(Number(v), settings.currency), "مبيعات"]} 
                    />
                    <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="توزيع المبيعات حسب الفئة" />
              <CardBody className="h-72">
                {categoryShare.length === 0 ? (
                  <div className="h-full grid place-items-center text-sm text-slate-500">لا توجد بيانات</div>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie 
                        data={categoryShare} 
                        dataKey="value" 
                        nameKey="name" 
                        innerRadius={60} 
                        outerRadius={80} 
                        paddingAngle={5}
                      >
                        {categoryShare.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                        formatter={(v) => formatCurrency(Number(v), settings.currency) as string} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader title="تفصيل المبيعات حسب نوع السعر" />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">مبيعات الجملة</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(wholesaleSalesTotal, settings.currency)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">مبيعات التجزئة</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    {formatCurrency(retailSalesTotal, settings.currency)}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card className="mt-4">
            <CardHeader title="أعلى المنتجات مبيعاً" />
            <CardBody>
              {topProducts.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد بيانات</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>المنتج</TH>
                      <TH className="text-end">الكمية المباعة</TH>
                      <TH className="text-end">الإيراد</TH>
                      <TH className="text-end">هامش الربح</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {topProducts.map((t) => (
                      <TR key={t.name}>
                        <TD className="font-medium text-slate-900">{t.name}</TD>
                        <TD className="text-end">{t.qty}</TD>
                        <TD className="text-end">{formatCurrency(t.revenue, settings.currency)}</TD>
                        <TD className={`text-end font-medium ${t.grossProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {formatCurrency(t.grossProfit, settings.currency)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card>
            <CardHeader title="المشتريات اليومية" />
            <CardBody className="h-72">
              <ResponsiveContainer>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                  <YAxis fontSize={12} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatCurrency(Number(v), settings.currency) as string} />
                  <Bar dataKey="purchases" name="مشتريات" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card className="mt-4">
            <CardHeader title={`فواتير المشتريات (${purchasesInRange.length})`} />
            <CardBody>
              {purchasesInRange.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد فواتير في الفترة</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>الرقم</TH>
                      <TH>التاريخ</TH>
                      <TH>المورد</TH>
                      <TH className="text-end">الإجمالي</TH>
                      <TH className="text-end">المتبقي</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {purchasesInRange.map((p) => (
                      <TR key={p.id}>
                        <TD className="font-mono text-xs">{p.invoiceNumber}</TD>
                        <TD>{formatDate(p.date)}</TD>
                        <TD>{p.supplierName}</TD>
                        <TD className="text-end">{formatCurrency(p.total, settings.currency)}</TD>
                        <TD className="text-end">
                          {p.remaining > 0 ? (
                            <Badge tone="amber">{formatCurrency(p.remaining, settings.currency)}</Badge>
                          ) : (
                            <Badge tone="green">مسدد</Badge>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card>
            <CardHeader title={`قائمة المخزون (${products.length} منتج)`} />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>الكود</TH>
                    <TH>المنتج</TH>
                    <TH>الفئة</TH>
                    <TH className="text-end">الكمية</TH>
                    <TH className="text-end">قيمة الشراء</TH>
                    <TH className="text-end">قيمة البيع</TH>
                  </TR>
                </THead>
                <TBody>
                  {products.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD className="font-medium text-slate-900">{p.name}</TD>
                      <TD className="text-slate-600">{p.category}</TD>
                      <TD className="text-end">{p.quantity} {p.unit}</TD>
                      <TD className="text-end">{formatCurrency(p.quantity * p.purchasePrice, settings.currency)}</TD>
                      <TD className="text-end">{formatCurrency(p.quantity * p.retailPrice, settings.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="lowstock">
          <Card>
            <CardHeader title="نفذ المخزون" subtitle="منتجات وصلت أو تجاوزت الحد الأدنى للمخزون" />
            <CardBody>
              {products.filter((p) => p.quantity <= p.minStock).length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد منتجات منخفضة المخزون</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>المنتج</TH>
                      <TH>الفئة</TH>
                      <TH className="text-end">الكمية الحالية</TH>
                      <TH className="text-end">الحد الأدنى</TH>
                      <TH>الحالة</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {products
                      .filter((p) => p.quantity <= p.minStock)
                      .sort((a, b) => a.quantity - b.quantity)
                      .map((p) => (
                        <TR key={p.id}>
                          <TD className="font-medium text-slate-900">{p.name}</TD>
                          <TD className="text-slate-500 text-xs">{p.category}</TD>
                          <TD className="text-end font-mono font-semibold text-rose-700">
                            {p.quantity} {p.unit}
                          </TD>
                          <TD className="text-end text-slate-500">{p.minStock} {p.unit}</TD>
                          <TD>
                            {p.quantity === 0
                              ? <Badge tone="red">نفذ تماماً</Badge>
                              : <Badge tone="amber">منخفض</Badge>}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="expiredstock">
          <Card>
            <CardHeader title="منتهي الصلاحية" subtitle="منتجات منتهية الصلاحية أو تنتهي خلال 14 يوم" />
            <CardBody>
              {products.filter((p) => {
                if (!p.hasExpiry || !p.expiryDate) return false;
                const du = daysUntil(p.expiryDate);
                return du !== null && du <= 14;
              }).length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد منتجات منتهية أو قاربت على الانتهاء</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>المنتج</TH>
                      <TH>الفئة</TH>
                      <TH className="text-end">الكمية</TH>
                      <TH>تاريخ الانتهاء</TH>
                      <TH>الحالة</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {products
                      .filter((p) => {
                        if (!p.hasExpiry || !p.expiryDate) return false;
                        const du = daysUntil(p.expiryDate);
                        return du !== null && du <= 14;
                      })
                      .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""))
                      .map((p) => {
                        const du = daysUntil(p.expiryDate);
                        return (
                          <TR key={p.id}>
                            <TD className="font-medium text-slate-900">{p.name}</TD>
                            <TD className="text-slate-500 text-xs">{p.category}</TD>
                            <TD className="text-end font-mono">{p.quantity} {p.unit}</TD>
                            <TD className="text-xs font-medium">
                              {p.expiryDate ? formatDate(p.expiryDate) : "—"}
                            </TD>
                            <TD>
                              {du !== null && du < 0
                                ? <Badge tone="red">منتهي منذ {Math.abs(du)} يوم</Badge>
                                : du !== null && du === 0
                                ? <Badge tone="red">ينتهي اليوم</Badge>
                                : <Badge tone="rose">يتبقى {du} يوم</Badge>}
                            </TD>
                          </TR>
                        );
                      })}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="customers">
          <Card>
            <CardHeader title="أرصدة العملاء" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>العميل</TH>
                    <TH>الهاتف</TH>
                    <TH className="text-end">الرصيد المستحق</TH>
                  </TR>
                </THead>
                <TBody>
                  {customers.map((c) => {
                    const bal = customerBalance(c.id);
                    return (
                      <TR key={c.id}>
                        <TD className="font-medium">{c.name}</TD>
                        <TD className="text-slate-600">{c.phone ?? "—"}</TD>
                        <TD className="text-end">
                          {bal > 0 ? (
                            <Badge tone="amber">{formatCurrency(bal, settings.currency)}</Badge>
                          ) : bal < 0 ? (
                            <Badge tone="green">رصيد دائن {formatCurrency(-bal, settings.currency)}</Badge>
                          ) : (
                            <Badge tone="green">لا يوجد</Badge>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader title="أرصدة الموردين" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>المورد</TH>
                    <TH>الهاتف</TH>
                    <TH className="text-end">الرصيد المتبقي</TH>
                  </TR>
                </THead>
                <TBody>
                  {suppliers.map((s) => {
                    const bal = supplierBalance(s.id);
                    return (
                      <TR key={s.id}>
                        <TD className="font-medium">{s.name}</TD>
                        <TD className="text-slate-600">{s.phone ?? "—"}</TD>
                        <TD className="text-end">
                          {bal > 0 ? (
                            <Badge tone="amber">{formatCurrency(bal, settings.currency)}</Badge>
                          ) : (
                            <Badge tone="green">مسدد</Badge>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="supplierDues">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs font-bold text-rose-500">إجمالي المطلوب دفعه</div>
              <div className="mt-1 text-xl font-bold text-rose-700">
                {formatCurrency(supplierPayablesTotal, settings.currency)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold text-slate-400">فواتير مفتوحة</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{supplierDueInvoices.length}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold text-slate-400">أكبر مورد مستحق</div>
              <div className="mt-1 text-sm font-bold text-slate-900 truncate">
                {largestSupplierPayable ? largestSupplierPayable.supplierName : "—"}
              </div>
              <div className="mt-1 text-sm font-semibold text-rose-700">
                {largestSupplierPayable ? formatCurrency(largestSupplierPayable.remaining, settings.currency) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold text-slate-400">أقدم فاتورة مفتوحة</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {oldestSupplierDue ? oldestSupplierDue.invoiceNumber : "—"}
              </div>
              <div className="mt-1 text-sm font-semibold text-amber-700">
                {oldestSupplierDue
                  ? `${formatDate(oldestSupplierDue.date)} - ${invoiceAgeLabel(invoiceAgeDays(oldestSupplierDue.date))}`
                  : "—"}
              </div>
            </div>
          </div>

          <Card className="mt-4">
            <CardHeader
              title="تفصيل حسب المورد"
              subtitle={`إجمالي المدفوع من هذه الفواتير: ${formatCurrency(supplierDuePaidTotal, settings.currency)}`}
            />
            <CardBody>
              {supplierPayableRows.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد مستحقات مفتوحة للموردين</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>كود المورد</TH>
                      <TH>المورد</TH>
                      <TH>الهاتف</TH>
                      <TH className="text-end">عدد الفواتير</TH>
                      <TH className="text-end">إجمالي الفواتير</TH>
                      <TH className="text-end">المدفوع</TH>
                      <TH className="text-end">المطلوب دفعه</TH>
                      <TH>أقدم فاتورة</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {supplierPayableRows.map((row) => (
                      <TR key={row.supplierId}>
                        <TD className="font-mono text-xs">{row.supplierCode || "—"}</TD>
                        <TD className="font-medium text-slate-900">{row.supplierName}</TD>
                        <TD className="text-slate-600">{row.phone || "—"}</TD>
                        <TD className="text-end">{row.invoiceCount}</TD>
                        <TD className="text-end">{formatCurrency(row.total, settings.currency)}</TD>
                        <TD className="text-end">{formatCurrency(row.paid, settings.currency)}</TD>
                        <TD className="text-end font-bold text-rose-700">
                          {formatCurrency(row.remaining, settings.currency)}
                        </TD>
                        <TD>
                          <div className="text-sm">{formatDate(row.oldestDate)}</div>
                          <div className="text-xs text-slate-500">{invoiceAgeLabel(invoiceAgeDays(row.oldestDate))}</div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="الفواتير المطلوب سدادها"
              subtitle="يعرض كل فواتير الموردين المفتوحة حالياً، حتى لو كانت خارج فترة التقرير المختارة"
            />
            <CardBody>
              {supplierDueInvoices.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">كل فواتير الموردين مسددة</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>رقم الفاتورة</TH>
                      <TH>التاريخ</TH>
                      <TH>العمر</TH>
                      <TH>المورد</TH>
                      <TH>الهاتف</TH>
                      <TH className="text-end">الإجمالي</TH>
                      <TH className="text-end">المدفوع</TH>
                      <TH className="text-end">المتبقي</TH>
                      <TH>الحالة</TH>
                      <TH className="text-end">إجراء</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {supplierDueInvoices.map((invoice) => {
                      const supplier = supplierLookup.get(invoice.supplierId);
                      const age = invoiceAgeDays(invoice.date);
                      return (
                        <TR key={invoice.id}>
                          <TD className="font-mono text-xs">{invoice.invoiceNumber}</TD>
                          <TD>{formatDate(invoice.date)}</TD>
                          <TD>
                            <Badge tone={invoiceAgeTone(age)}>{invoiceAgeLabel(age)}</Badge>
                          </TD>
                          <TD className="font-medium text-slate-900">{invoice.supplierName}</TD>
                          <TD className="text-slate-600">{supplier?.phone || "—"}</TD>
                          <TD className="text-end">{formatCurrency(invoice.total, settings.currency)}</TD>
                          <TD className="text-end">{formatCurrency(invoice.amountPaid, settings.currency)}</TD>
                          <TD className="text-end font-bold text-rose-700">
                            {formatCurrency(invoice.remaining, settings.currency)}
                          </TD>
                          <TD>
                            <Badge tone={invoice.status === "partial" ? "amber" : "rose"}>
                              {purchaseStatusLabel(invoice.status)}
                            </Badge>
                          </TD>
                          <TD className="text-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/purchases/${invoice.id}`)}
                            >
                              فتح
                            </Button>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardHeader title="تفاصيل عمولات وبونص الموردين" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>المورد</TH>
                    <TH>الشريحة</TH>
                    <TH className="text-end">المشتريات الحالية</TH>
                    <TH className="text-end">البونص المستحق</TH>
                  </TR>
                </THead>
                <TBody>
                  {suppliers.map((s) => {
                    const comms = calculateSupplierCommission(s.id);
                    if (comms.length === 0) return null;
                    return comms.map((c, idx) => (
                      <TR key={`${s.id}-${c.tierId}`}>
                        <TD className={idx === 0 ? "font-medium" : "opacity-0"}>{idx === 0 ? s.name : ""}</TD>
                        <TD className="text-xs text-slate-600">
                          {formatCurrency(c.threshold, settings.currency)} ({c.periodDays} يوم)
                        </TD>
                        <TD className="text-end">{formatCurrency(c.totalPurchases, settings.currency)}</TD>
                        <TD className="text-end font-bold text-emerald-600">
                          {c.earned > 0 ? formatCurrency(c.earned, settings.currency) : "—"}
                        </TD>
                      </TR>
                    ));
                  })}
                  {suppliers.every(s => calculateSupplierCommission(s.id).length === 0) && (
                    <TR>
                      <TD colSpan={4} className="text-center py-8 text-slate-500">لا توجد شرائح عمولة مسجلة</TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>
        <TabsContent value="monthlyProfit">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-bold text-emerald-600">صافي المبيعات (كل الشهور)</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(monthlyTotals.sales, settings.currency)}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-bold text-blue-600">إجمالي المشتريات (كل الشهور)</div>
              <div className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(monthlyTotals.purchases, settings.currency)}</div>
            </div>
            <div className={`rounded-xl border p-4 ${monthlyTotals.profit >= 0 ? "border-green-200 bg-green-50" : "border-rose-200 bg-rose-50"}`}>
              <div className={`text-xs font-bold ${monthlyTotals.profit >= 0 ? "text-green-600" : "text-rose-600"}`}>هامش الربح الإجمالي</div>
              <div className={`mt-1 text-xl font-bold ${monthlyTotals.profit >= 0 ? "text-green-700" : "text-rose-700"}`}>
                {formatCurrency(monthlyTotals.profit, settings.currency)}
              </div>
            </div>
          </div>
          <Card>
            <CardHeader title="الربح الشهري" subtitle="صافي المبيعات والمشتريات وهامش الربح (سعر البيع − التكلفة − الخصومات − المرتجعات) لكل شهر" />
            <CardBody className="h-72">
              <ResponsiveContainer>
                <BarChart data={monthlyProfitData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} stroke="#94a3b8" tick={{ fill: "#64748b" }} />
                  <YAxis fontSize={12} stroke="#94a3b8" tick={{ fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }}
                    formatter={(v, name) => [formatCurrency(Number(v), settings.currency), String(name)]}
                  />
                  <Bar dataKey="sales" name="مبيعات" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="purchases" name="مشتريات" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="profit" name="هامش الربح" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card className="mt-4">
            <CardHeader title="تفصيل شهري" />
            <CardBody>
              {monthlyProfitData.length === 0 ? (
                <div className="text-sm text-slate-500 text-center py-6">لا توجد بيانات</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>الشهر</TH>
                      <TH className="text-end">المبيعات</TH>
                      <TH className="text-end">المشتريات</TH>
                      <TH className="text-end">هامش الربح</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {monthlyProfitData.map((row) => (
                      <TR key={row.month}>
                        <TD className="font-medium">{row.month}</TD>
                        <TD className="text-end text-emerald-700">{formatCurrency(row.sales, settings.currency)}</TD>
                        <TD className="text-end text-blue-700">{formatCurrency(row.purchases, settings.currency)}</TD>
                        <TD className={`text-end font-bold ${row.profit >= 0 ? "text-green-700" : "text-rose-700"}`}>
                          {formatCurrency(row.profit, settings.currency)}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="customerDues">
          <Card>
            <CardHeader
              title="فلوس لدينا من عملاء"
              subtitle={`الإجمالي المستحق: ${formatCurrency(totalReceivables, settings.currency)}`}
            />
            <CardBody>
              {customers.every((c) => customerBalance(c.id) <= 0) ? (
                <div className="text-sm text-slate-500 text-center py-6">لا يوجد عملاء لديهم أرصدة مستحقة</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>الكود</TH>
                      <TH>العميل</TH>
                      <TH>الهاتف</TH>
                      <TH className="text-end">المبلغ المستحق</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {customers
                      .map((c) => ({ c, bal: customerBalance(c.id) }))
                      .filter(({ bal }) => bal > 0)
                      .sort((a, b) => b.bal - a.bal)
                      .map(({ c, bal }) => (
                        <TR key={c.id}>
                          <TD className="font-mono text-xs text-slate-500">{c.code ?? "—"}</TD>
                          <TD className="font-medium text-slate-900">{c.name}</TD>
                          <TD className="text-slate-600">{c.phone ?? "—"}</TD>
                          <TD className="text-end font-bold text-rose-700">
                            {formatCurrency(bal, settings.currency)}
                          </TD>
                        </TR>
                      ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </TabsContent>

        {canViewEmployeeBonuses ? (
          <TabsContent value="employeeBonuses">
            <Card>
              <CardHeader
                title="بونص الموظفين"
                subtitle="حساب البونص من فواتير البيع داخل الفترة المختارة"
              />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">إجمالي بونص الموظفين</div>
                    <div className="text-lg font-bold text-rose-700 mt-1">
                      {formatCurrency(totalEmployeeBonuses, settings.currency)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">مبيعات الموظفين</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {formatCurrency(totalEmployeeSales, settings.currency)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">موظفون لديهم مبيعات</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {employeesWithSales} / {employeeBonusRows.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">محققين التارجت</div>
                    <div className="text-lg font-bold text-emerald-700 mt-1">
                      {employeesTargetAchieved}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">صافي تقديري بعد البونصات</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {formatCurrency(estimatedProfitAfterBonuses, settings.currency)}
                    </div>
                  </div>
                </div>

                {unattributedEmployeeInvoices.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    توجد {unattributedEmployeeInvoices.length} فواتير بيع بدون موظف مسجل بقيمة{" "}
                    <span className="font-bold">{formatCurrency(unattributedEmployeeSales, settings.currency)}</span>.
                    هذه الفواتير لا تدخل في بونص أي موظف.
                  </div>
                ) : null}

                <Table>
                  <THead>
                    <TR>
                      <TH>الموظف</TH>
                      <TH className="text-end">عدد الفواتير</TH>
                      <TH className="text-end">إجمالي المبيعات</TH>
                      <TH className="text-end">المحصَّل في الفترة</TH>
                      <TH className="text-end">نسبة العمولة</TH>
                      <TH className="text-end">البونص (من المحصَّل)</TH>
                      <TH className="text-end">الراتب الشهري</TH>
                      <TH className="text-end">التارجت الشهري</TH>
                      <TH>الحالة</TH>
                      <TH className="text-end">إجمالي مستحقات تقديري</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {employeeBonusRows.length === 0 ? (
                      <TR>
                        <TD colSpan={10} className="text-center py-8 text-slate-500">
                          لا يوجد موظفون مسجلون
                        </TD>
                      </TR>
                    ) : (
                      employeeBonusRows.map((row) => (
                        <TR key={row.employee.id}>
                          <TD className="font-medium text-slate-900">
                            {row.employee.name || row.employee.username}
                          </TD>
                          <TD className="text-end tabular-nums">{row.invoiceCount}</TD>
                          <TD className="text-end">{formatCurrency(row.totalSales, settings.currency)}</TD>
                          <TD className="text-end font-medium text-emerald-700">
                            {formatCurrency(row.collected, settings.currency)}
                          </TD>
                          <TD className="text-end tabular-nums">{row.commissionPct}%</TD>
                          <TD className="text-end font-bold text-rose-700">
                            {formatCurrency(row.bonus, settings.currency)}
                          </TD>
                          <TD className="text-end">{formatCurrency(row.salary, settings.currency)}</TD>
                          <TD className="text-end">
                            {row.target > 0 ? formatCurrency(row.target, settings.currency) : "—"}
                          </TD>
                          <TD>
                            {row.target <= 0 ? (
                              <Badge tone="slate">بدون تارجت</Badge>
                            ) : row.achievedTarget ? (
                              <Badge tone="green">
                                محقق
                                {row.exceededTarget > 0
                                  ? ` +${formatCurrency(row.exceededTarget, settings.currency)}`
                                  : ""}
                              </Badge>
                            ) : (
                              <Badge tone="amber">
                                متبقي {formatCurrency(row.remainingTarget, settings.currency)}
                              </Badge>
                            )}
                          </TD>
                          <TD className="text-end font-bold text-slate-900">
                            {formatCurrency(row.totalEarnings, settings.currency)}
                          </TD>
                        </TR>
                      ))
                    )}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
      </div>

      {/* Print-Only Layout (Statement Style) */}
      <div className="print-only font-sans text-slate-900">
        <div className="border-b-2 border-slate-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold">{settings.companyNameAr}</h1>
            <p className="text-lg text-slate-600 mt-1">{settings.companyName}</p>
            <div className="mt-4 space-y-1 text-sm text-slate-500">
              <p>تاريخ استخراج التقرير: {formatDate(new Date().toISOString())}</p>
              {printMode === "supplierDues" ? (
                <p>النطاق: كل فواتير الموردين المفتوحة حتى تاريخ الاستخراج</p>
              ) : (
                <p>الفترة من: {formatDate(from)} إلى: {formatDate(to)}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="w-20 h-20 bg-slate-900 text-white rounded-2xl grid place-items-center text-3xl font-bold mb-3 ms-auto">
              {settings.logoText}
            </div>
            <h2 className="text-xl font-bold tracking-widest uppercase">
              {printMode === "full" && "كشف حساب مالي تحليلي"}
              {printMode === "sales" && "تقرير مبيعات تفصيلي"}
              {printMode === "purchases" && "تقرير مشتريات تفصيلي"}
              {printMode === "stock" && "تقرير جرد المخزون"}
              {printMode === "customers" && "كشف أرصدة مديونيات العملاء"}
              {printMode === "suppliers" && "كشف مستحقات الموردين"}
              {printMode === "supplierDues" && "كشف الفلوس المطلوبة للموردين"}
              {printMode === "commissions" && "تقرير عمولات الموردين"}
              {printMode === "monthlyProfit" && "تقرير الربح الشهري"}
              {printMode === "customerDues" && "كشف فلوس لدينا من العملاء"}
            </h2>
            <p className="text-xs opacity-50">نظام الهلبرز لإدارة المستودعات</p>
          </div>
        </div>

        {printMode === "full" && (
          <>
            <div className="grid grid-cols-2 gap-8 mb-10">
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b pb-1">الخلاصة المالية</h3>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <TR_Print label="إجمالي قيمة المبيعات" value={formatCurrency(totalSales, settings.currency)} />
                    <TR_Print label="إجمالي قيمة المشتريات" value={formatCurrency(totalPurchases, settings.currency)} />
                    <TR_Print label="إجمالي مرتجعات البيع" value={formatCurrency(salesInRange.reduce((a, s) => a + (s.total < 0 ? s.total : 0), 0), settings.currency)} />
                    <TR_Print label="الربح التشغيلي التقديري" value={formatCurrency(estimatedProfit, settings.currency)} highlight />
                    <TR_Print label="إجمالي العمولات المستحقة" value={formatCurrency(totalCommissions, settings.currency)} highlight />
                    {canViewEmployeeBonuses ? (
                      <>
                        <TR_Print label="إجمالي بونص الموظفين" value={formatCurrency(totalEmployeeBonuses, settings.currency)} highlight />
                        <TR_Print label="صافي تقديري بعد البونصات" value={formatCurrency(estimatedProfitAfterBonuses, settings.currency)} highlight />
                      </>
                    ) : null}
                  </tbody>
                </table>
              </section>
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 border-b pb-1">إحصائيات العمليات</h3>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <TR_Print label="عدد فواتير البيع" value={salesInRange.length.toString()} />
                    <TR_Print label="عدد فواتير الشراء" value={purchasesInRange.length.toString()} />
                    <TR_Print label="أعلى فئة مبيعاً" value={categoryShare[0]?.name || "—"} />
                    <TR_Print label="متوسط قيمة الفاتورة" value={formatCurrency(totalSales / (salesInRange.length || 1), settings.currency)} />
                  </tbody>
                </table>
              </section>
            </div>

            <div className="space-y-10">
              <section className="break-inside-avoid">
                <h3 className="text-sm font-bold mb-4 bg-slate-100 p-2 border-r-4 border-slate-900">أداء المنتجات (الأكثر مبيعاً)</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="py-2 text-right">المنتج</th>
                      <th className="py-2 text-center">الكمية المباعة</th>
                      <th className="py-2 text-left">إجمالي الإيراد</th>
                      <th className="py-2 text-left">هامش الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topProducts.map((p, i) => (
                      <tr key={i}>
                        <td className="py-2 text-right font-medium">{p.name}</td>
                        <td className="py-2 text-center tabular-nums">{p.qty}</td>
                        <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(p.revenue, settings.currency)}</td>
                        <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(p.grossProfit, settings.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="break-inside-avoid">
                <h3 className="text-sm font-bold mb-4 bg-slate-100 p-2 border-r-4 border-slate-900">مديونيات العملاء والموردين</h3>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2">أعلى 5 مديونيات عملاء</h4>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-50">
                        {customers.map(c => ({ name: c.name, bal: customerBalance(c.id) }))
                          .filter(x => x.bal > 0)
                          .sort((a,b) => b.bal - a.bal)
                          .slice(0, 5)
                          .map((x, i) => (
                            <tr key={i}><td className="py-1 text-right">{x.name}</td><td className="py-1 text-left tabular-nums font-mono font-semibold">{formatCurrency(x.bal, settings.currency)}</td></tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-2">أعلى 5 مستحقات موردين</h4>
                    <table className="w-full text-xs">
                      <tbody className="divide-y divide-slate-50">
                        {suppliers.map(s => ({ name: s.name, bal: supplierBalance(s.id) }))
                          .filter(x => x.bal > 0)
                          .sort((a,b) => b.bal - a.bal)
                          .slice(0, 5)
                          .map((x, i) => (
                            <tr key={i}><td className="py-1 text-right">{x.name}</td><td className="py-1 text-left tabular-nums font-mono font-semibold">{formatCurrency(x.bal, settings.currency)}</td></tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}

        {printMode === "sales" && (
          <section>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">رقم الفاتورة</th>
                  <th className="py-2 text-right">التاريخ</th>
                  <th className="py-2 text-right">العميل</th>
                  <th className="py-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesInRange.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 text-right font-mono tabular-nums">{s.invoiceNumber}</td>
                    <td className="py-2 text-right tabular-nums">{formatDate(s.date)}</td>
                    <td className="py-2 text-right">{s.customerName}</td>
                    <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(s.total, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={3} className="py-3 text-right">الإجمالي الكلي للمبيعات</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(totalSales, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "purchases" && (
          <section>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">رقم الفاتورة</th>
                  <th className="py-2 text-right">التاريخ</th>
                  <th className="py-2 text-right">المورد</th>
                  <th className="py-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchasesInRange.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 text-right font-mono tabular-nums">{p.invoiceNumber}</td>
                    <td className="py-2 text-right tabular-nums">{formatDate(p.date)}</td>
                    <td className="py-2 text-right">{p.supplierName}</td>
                    <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(p.total, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={3} className="py-3 text-right">الإجمالي الكلي للمشتريات</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(totalPurchases, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "stock" && (
          <section>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">الكود</th>
                  <th className="py-2 text-right">المنتج</th>
                  <th className="py-2 text-center">الكمية</th>
                  <th className="py-2 text-left">قيمة المخزون (شراء)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 text-right font-mono tabular-nums">{p.code}</td>
                    <td className="py-2 text-right">{p.name}</td>
                    <td className="py-2 text-center tabular-nums">{p.quantity} {p.unit}</td>
                    <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(p.quantity * p.purchasePrice, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={3} className="py-3 text-right">قيمة المخزون الكلية (سعر الشراء)</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(products.reduce((a,p) => a + (p.quantity * p.purchasePrice), 0), settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "customers" && (
          <section>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">العميل</th>
                  <th className="py-2 text-right">الهاتف</th>
                  <th className="py-2 text-left">الرصيد المستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c, i) => {
                  const bal = customerBalance(c.id);
                  if (bal === 0) return null;
                  return (
                    <tr key={i}>
                      <td className="py-2 text-right font-medium">{c.name}</td>
                      <td className="py-2 text-right text-slate-500 tabular-nums">{c.phone || "—"}</td>
                      <td className="py-2 text-left font-bold tabular-nums font-mono">{formatCurrency(bal, settings.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={2} className="py-3 text-right">إجمالي أرصدة العملاء المستحقة</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(customers.reduce((a,c) => a + customerBalance(c.id), 0), settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "suppliers" && (
          <section>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">المورد</th>
                  <th className="py-2 text-right">الهاتف</th>
                  <th className="py-2 text-left">الرصيد المستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s, i) => {
                  const bal = supplierBalance(s.id);
                  if (bal === 0) return null;
                  return (
                    <tr key={i}>
                      <td className="py-2 text-right font-medium">{s.name}</td>
                      <td className="py-2 text-right text-slate-500 tabular-nums">{s.phone || "—"}</td>
                      <td className="py-2 text-left font-bold tabular-nums font-mono">{formatCurrency(bal, settings.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={2} className="py-3 text-right">إجمالي مستحقات الموردين</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(suppliers.reduce((a,s) => a + supplierBalance(s.id), 0), settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "supplierDues" && (
          <section>
            <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">إجمالي المطلوب دفعه</div>
                <div className="font-bold text-lg">{formatCurrency(supplierPayablesTotal, settings.currency)}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">عدد الفواتير المفتوحة</div>
                <div className="font-bold text-lg">{supplierDueInvoices.length}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">عدد الموردين</div>
                <div className="font-bold text-lg">{supplierPayableRows.length}</div>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">رقم الفاتورة</th>
                  <th className="py-2 text-right">التاريخ</th>
                  <th className="py-2 text-right">العمر</th>
                  <th className="py-2 text-right">المورد</th>
                  <th className="py-2 text-left">الإجمالي</th>
                  <th className="py-2 text-left">المدفوع</th>
                  <th className="py-2 text-left">المتبقي</th>
                  <th className="py-2 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierDueInvoices.map((invoice, i) => {
                  const age = invoiceAgeDays(invoice.date);
                  return (
                    <tr key={i}>
                      <td className="py-2 text-right font-mono tabular-nums">{invoice.invoiceNumber}</td>
                      <td className="py-2 text-right tabular-nums">{formatDate(invoice.date)}</td>
                      <td className="py-2 text-right">{invoiceAgeLabel(age)}</td>
                      <td className="py-2 text-right">{invoice.supplierName}</td>
                      <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(invoice.total, settings.currency)}</td>
                      <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(invoice.amountPaid, settings.currency)}</td>
                      <td className="py-2 text-left tabular-nums font-mono font-bold">{formatCurrency(invoice.remaining, settings.currency)}</td>
                      <td className="py-2 text-right">{purchaseStatusLabel(invoice.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={6} className="py-3 text-right">إجمالي المطلوب دفعه للموردين</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(supplierPayablesTotal, settings.currency)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "commissions" && (
          <section>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">المورد</th>
                  <th className="py-2 text-right">الشريحة (الهدف)</th>
                  <th className="py-2 text-center">المشتريات الحالية</th>
                  <th className="py-2 text-left">البونص المستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.flatMap(s => calculateSupplierCommission(s.id).map(c => ({ sName: s.name, ...c }))).map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 text-right font-medium">{row.sName}</td>
                    <td className="py-2 text-right">{formatCurrency(row.threshold, settings.currency)} ({row.periodDays} يوم)</td>
                    <td className="py-2 text-center">{formatCurrency(row.totalPurchases, settings.currency)}</td>
                    <td className="py-2 text-left font-bold text-emerald-700 tabular-nums font-mono">{formatCurrency(row.earned, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={3} className="py-3 text-right">إجمالي البونص المستحق لجميع الموردين</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(totalCommissions, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "monthlyProfit" && (
          <section>
            <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">صافي المبيعات</div>
                <div className="font-bold text-lg">{formatCurrency(monthlyTotals.sales, settings.currency)}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">إجمالي المشتريات</div>
                <div className="font-bold text-lg">{formatCurrency(monthlyTotals.purchases, settings.currency)}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">هامش الربح</div>
                <div className="font-bold text-lg">{formatCurrency(monthlyTotals.profit, settings.currency)}</div>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">الشهر</th>
                  <th className="py-2 text-left">المبيعات</th>
                  <th className="py-2 text-left">المشتريات</th>
                  <th className="py-2 text-left">هامش الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyProfitData.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 text-right font-medium">{row.month}</td>
                    <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(row.sales, settings.currency)}</td>
                    <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(row.purchases, settings.currency)}</td>
                    <td className="py-2 text-left tabular-nums font-mono font-bold">{formatCurrency(row.profit, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td className="py-3 text-right">الإجمالي</td>
                  <td className="py-3 text-left tabular-nums font-mono">{formatCurrency(monthlyTotals.sales, settings.currency)}</td>
                  <td className="py-3 text-left tabular-nums font-mono">{formatCurrency(monthlyTotals.purchases, settings.currency)}</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(monthlyTotals.profit, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {printMode === "customerDues" && (
          <section>
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">إجمالي المستحق من العملاء</div>
                <div className="font-bold text-lg">{formatCurrency(totalReceivables, settings.currency)}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <div className="text-slate-500">عدد العملاء لديهم أرصدة</div>
                <div className="font-bold text-lg">{customers.filter((c) => customerBalance(c.id) > 0).length}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-2 text-right">الكود</th>
                  <th className="py-2 text-right">العميل</th>
                  <th className="py-2 text-right">الهاتف</th>
                  <th className="py-2 text-left">المبلغ المستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers
                  .map((c) => ({ c, bal: customerBalance(c.id) }))
                  .filter(({ bal }) => bal > 0)
                  .sort((a, b) => b.bal - a.bal)
                  .map(({ c, bal }, i) => (
                    <tr key={i}>
                      <td className="py-2 text-right font-mono text-xs">{c.code || "—"}</td>
                      <td className="py-2 text-right font-medium">{c.name}</td>
                      <td className="py-2 text-right text-slate-500">{c.phone || "—"}</td>
                      <td className="py-2 text-left font-bold tabular-nums font-mono">{formatCurrency(bal, settings.currency)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 font-bold bg-slate-50">
                  <td colSpan={3} className="py-3 text-right">الإجمالي المستحق من العملاء</td>
                  <td className="py-3 text-left tabular-nums font-mono text-lg">{formatCurrency(totalReceivables, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        <div className="mt-20 pt-10 border-t border-slate-200 flex justify-between text-xs text-slate-400">
          <p>هذا التقرير تم استخراجه آلياً ولا يحتاج لختم رسمي.</p>
          <div className="text-center">
            <p className="mb-8 font-bold text-slate-900">توقيع المسؤول</p>
            <p>.........................................</p>
          </div>
        </div>
      </div>
    </>
  );
}

function invoiceAgeDays(date: string): number {
  const issuedAt = new Date(date);
  if (Number.isNaN(issuedAt.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  issuedAt.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - issuedAt.getTime()) / (1000 * 60 * 60 * 24)));
}

function invoiceAgeLabel(days: number): string {
  if (days === 0) return "اليوم";
  if (days === 1) return "منذ يوم";
  return `منذ ${days} يوم`;
}

function invoiceAgeTone(days: number): "blue" | "amber" | "orange" | "rose" {
  if (days >= 60) return "rose";
  if (days >= 30) return "orange";
  if (days >= 14) return "amber";
  return "blue";
}

function purchaseStatusLabel(status: string): string {
  if (status === "partial") return "مدفوع جزئياً";
  if (status === "unpaid") return "غير مدفوع";
  return "مفتوح";
}

function TR_Print({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr>
      <td className="py-2 text-slate-600">{label}</td>
      <td className={`py-2 text-left tabular-nums font-mono ${highlight ? "text-lg font-bold text-slate-900" : "text-sm font-medium"}`}>{value}</td>
    </tr>
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
  value: string;
  tone: "green" | "blue" | "amber" | "indigo" | "emerald" | "rose" | "violet";
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${colors[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-4">{label}</div>
        <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums leading-tight">{value}</div>
      </div>
    </div>
  );
}

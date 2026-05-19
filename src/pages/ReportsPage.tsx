import { useMemo, useState } from "react";
import {
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Coins,
  UserRound,
  Users,
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
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { daysUntil, inRange } from "../lib/utils";

type PrintMode = "full" | "sales" | "purchases" | "stock" | "customers" | "suppliers" | "commissions";

export function ReportsPage() {
  const {
    products,
    customers,
    suppliers,
    users,
    salesInvoices,
    purchaseInvoices,
    settings,
    customerBalance,
    supplierBalance,
    calculateSupplierCommission,
    exportToCSV,
    currentUser,
  } = useApp();
  const toast = useToast();
  const navigate = useNavigate();

  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
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

  const totalSales = salesInRange.reduce((a, s) => a + s.total, 0);
  const totalPurchases = purchasesInRange.reduce((a, p) => a + p.total, 0);
  const wholesaleSalesTotal = salesInRange
    .filter((s) => s.priceType === "wholesale")
    .reduce((a, s) => a + s.total, 0);
  const retailSalesTotal = salesInRange
    .filter((s) => s.priceType === "retail")
    .reduce((a, s) => a + s.total, 0);

  const totalCommissions = useMemo(() => {
    return suppliers.reduce((sum, s) => {
      const comms = calculateSupplierCommission(s.id);
      return sum + comms.reduce((a, c) => a + c.earned, 0);
    }, 0);
  }, [suppliers, calculateSupplierCommission]);

  const estimatedProfit = useMemo(() => {
    // approximate profit based on productId cost vs sale price per line
    let p = 0;
    salesInRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const prod = products.find((x) => x.id === l.productId);
        if (!prod) return;
        p += (l.price - prod.purchasePrice) * l.quantity;
      });
    });
    return p;
  }, [salesInRange, products]);

  const employeeBonusRows = useMemo(() => {
    return users
      .filter((user) => user.role === "employee")
      .map((employee) => {
        const invoices = salesInRange.filter((invoice) => invoice.createdByUserId === employee.id);
        const employeeTotalSales = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
        const commissionPct = employee.salesCommissionPct ?? 0;
        const bonus = (employeeTotalSales * commissionPct) / 100;
        const salary = employee.monthlySalary ?? 0;
        const target = employee.monthlySalesTarget ?? 0;
        const remainingTarget = target > 0 ? Math.max(0, target - employeeTotalSales) : 0;
        const exceededTarget = target > 0 ? Math.max(0, employeeTotalSales - target) : 0;

        return {
          employee,
          invoiceCount: invoices.length,
          totalSales: employeeTotalSales,
          commissionPct,
          bonus,
          salary,
          target,
          remainingTarget,
          exceededTarget,
          achievedTarget: target > 0 && employeeTotalSales >= target,
          totalEarnings: salary + bonus,
        };
      })
      .sort((a, b) => b.bonus - a.bonus || b.totalSales - a.totalSales);
  }, [users, salesInRange]);

  const totalEmployeeBonuses = employeeBonusRows.reduce((sum, row) => sum + row.bonus, 0);
  const totalEmployeeSales = employeeBonusRows.reduce((sum, row) => sum + row.totalSales, 0);
  const employeesWithSales = employeeBonusRows.filter((row) => row.invoiceCount > 0).length;
  const employeesTargetAchieved = employeeBonusRows.filter((row) => row.achievedTarget).length;
  const unattributedEmployeeInvoices = salesInRange.filter((invoice) => !invoice.createdByUserId);
  const unattributedEmployeeSales = unattributedEmployeeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const estimatedProfitAfterBonuses = estimatedProfit - totalCommissions - totalEmployeeBonuses;

  const totalReceivables = useMemo(
    () => customers.reduce((sum, c) => sum + Math.max(0, customerBalance(c.id)), 0),
    [customers, customerBalance]
  );

  const dailyData = useMemo(() => {
    const map = new Map<string, { date: string; sales: number; purchases: number }>();
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
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
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    salesInRange.forEach((inv) => {
      inv.lines.forEach((l) => {
        const e = map.get(l.productId) ?? {
          name: l.productName,
          qty: 0,
          revenue: 0,
        };
        e.qty += l.quantity;
        e.revenue += l.subtotal;
        map.set(l.productId, e);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [salesInRange]);

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
                  if (printMode === "full") {
                    toast.info("تصدير", "يرجى اختيار تقرير محدد (مبيعات، مشتريات، إلخ) للتصدير إلى Excel");
                  } else {
                    exportToCSV(printMode);
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
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-7); setFrom(d.toISOString().slice(0,10)); setTo(new Date().toISOString().slice(0,10));}}>
                آخر 7 أيام
              </Button>
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-30); setFrom(d.toISOString().slice(0,10)); setTo(new Date().toISOString().slice(0,10));}}>
                آخر 30 يوم
              </Button>
              <Button variant="outline" size="sm" onClick={() => { const d=new Date(); d.setDate(d.getDate()-90); setFrom(d.toISOString().slice(0,10)); setTo(new Date().toISOString().slice(0,10));}}>
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
                <option value="commissions">تقرير عمولات الموردين</option>
              </Select>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4" /> طباعة
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="no-print grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat icon={<TrendingUp className="w-5 h-5" />} tone="green" label="إجمالي المبيعات" value={formatCurrency(totalSales, settings.currency)} />
        <Stat icon={<TrendingDown className="w-5 h-5" />} tone="blue" label="إجمالي المشتريات" value={formatCurrency(totalPurchases, settings.currency)} />
        <Stat icon={<Coins className="w-5 h-5" />} tone="amber" label="الربح التقديري" value={formatCurrency(estimatedProfit, settings.currency)} />
        <Stat icon={<TrendingUp className="w-5 h-5" />} tone="emerald" label="بونص الموردين" value={formatCurrency(totalCommissions, settings.currency)} />
        {canViewEmployeeBonuses ? (
          <Stat icon={<UserRound className="w-5 h-5" />} tone="rose" label="بونص الموظفين" value={formatCurrency(totalEmployeeBonuses, settings.currency)} />
        ) : null}
        <Stat icon={<Users className="w-5 h-5" />} tone="indigo" label="مستحقات العملاء" value={formatCurrency(totalReceivables, settings.currency)} />
      </div>

      <div className="no-print">
        <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">تقرير المبيعات</TabsTrigger>
          <TabsTrigger value="purchases">تقرير المشتريات</TabsTrigger>
          <TabsTrigger value="stock">تقرير المخزون</TabsTrigger>
          <TabsTrigger value="lowstock">منخفض/منتهي</TabsTrigger>
          <TabsTrigger value="customers">أرصدة العملاء</TabsTrigger>
          <TabsTrigger value="suppliers">أرصدة الموردين</TabsTrigger>
          <TabsTrigger value="commissions">عمولات الموردين</TabsTrigger>
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
                    </TR>
                  </THead>
                  <TBody>
                    {topProducts.map((t) => (
                      <TR key={t.name}>
                        <TD className="font-medium text-slate-900">{t.name}</TD>
                        <TD className="text-end">{t.qty}</TD>
                        <TD className="text-end">{formatCurrency(t.revenue, settings.currency)}</TD>
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
            <CardHeader title="منتجات منخفضة أو منتهية" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>المنتج</TH>
                    <TH className="text-end">الكمية</TH>
                    <TH className="text-end">الحد الأدنى</TH>
                    <TH>الصلاحية</TH>
                    <TH>الحالة</TH>
                  </TR>
                </THead>
                <TBody>
                  {products
                    .filter((p) => {
                      const du = daysUntil(p.expiryDate);
                      return p.quantity <= p.minStock || (p.hasExpiry && du !== null && du <= 14);
                    })
                    .map((p) => {
                      const du = daysUntil(p.expiryDate);
                      return (
                        <TR key={p.id}>
                          <TD className="font-medium">{p.name}</TD>
                          <TD className="text-end">{p.quantity}</TD>
                          <TD className="text-end">{p.minStock}</TD>
                          <TD className="text-slate-600 text-xs">
                            {p.hasExpiry && p.expiryDate ? formatDate(p.expiryDate) : "—"}
                          </TD>
                          <TD>
                            {p.quantity <= p.minStock && <Badge tone="amber">منخفض</Badge>}
                            {p.hasExpiry && du !== null && du < 0 && <Badge tone="red">منتهي</Badge>}
                            {p.hasExpiry && du !== null && du >= 0 && du <= 14 && (
                              <Badge tone="rose">قارب ينتهي</Badge>
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
                      <TH className="text-end">نسبة العمولة</TH>
                      <TH className="text-end">البونص</TH>
                      <TH className="text-end">الراتب الشهري</TH>
                      <TH className="text-end">التارجت الشهري</TH>
                      <TH>الحالة</TH>
                      <TH className="text-end">إجمالي مستحقات تقديري</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {employeeBonusRows.length === 0 ? (
                      <TR>
                        <TD colSpan={9} className="text-center py-8 text-slate-500">
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
              <p>الفترة من: {formatDate(from)} إلى: {formatDate(to)}</p>
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
              {printMode === "commissions" && "تقرير عمولات الموردين"}
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topProducts.map((p, i) => (
                      <tr key={i}>
                        <td className="py-2 text-right font-medium">{p.name}</td>
                        <td className="py-2 text-center tabular-nums">{p.qty}</td>
                        <td className="py-2 text-left tabular-nums font-mono">{formatCurrency(p.revenue, settings.currency)}</td>
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
  tone: "green" | "blue" | "amber" | "indigo" | "emerald" | "rose";
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${colors[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</div>
        <div className="text-lg font-bold text-slate-900 mt-0.5 tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}

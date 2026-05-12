import { useMemo, useState } from "react";
import {
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Package,
  Coins,
} from "lucide-react";
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
import { Input, Field } from "../components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { daysUntil, inRange } from "../lib/utils";

export function ReportsPage() {
  const {
    products,
    customers,
    suppliers,
    salesInvoices,
    purchaseInvoices,
    settings,
    customerBalance,
    supplierBalance,
  } = useApp();
  const toast = useToast();

  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

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
      <PageHeader
        title="التقارير"
        description="تقارير عملية لأداء الأعمال"
        actions={
          <Button variant="outline" onClick={() => toast.info("تصدير", "في النسخة الكاملة سيتم التصدير إلى Excel/PDF")}>
            <Download className="w-4 h-4" /> تصدير
          </Button>
        }
      />

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
          <Button variant="outline" className="ms-auto" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> طباعة
          </Button>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<TrendingUp className="w-5 h-5" />} tone="green" label="إجمالي المبيعات" value={formatCurrency(totalSales, settings.currency)} />
        <Stat icon={<TrendingDown className="w-5 h-5" />} tone="blue" label="إجمالي المشتريات" value={formatCurrency(totalPurchases, settings.currency)} />
        <Stat icon={<Coins className="w-5 h-5" />} tone="amber" label="الربح التقديري" value={formatCurrency(estimatedProfit, settings.currency)} />
        <Stat icon={<Package className="w-5 h-5" />} tone="indigo" label="عدد الفواتير" value={`${salesInRange.length} / ${purchasesInRange.length}`} />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">تقرير المبيعات</TabsTrigger>
          <TabsTrigger value="purchases">تقرير المشتريات</TabsTrigger>
          <TabsTrigger value="stock">تقرير المخزون</TabsTrigger>
          <TabsTrigger value="lowstock">منخفض/منتهي</TabsTrigger>
          <TabsTrigger value="customers">أرصدة العملاء</TabsTrigger>
          <TabsTrigger value="suppliers">أرصدة الموردين</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title="المبيعات اليومية" />
              <CardBody className="h-72">
                <ResponsiveContainer>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" fontSize={12} stroke="#94a3b8" />
                    <YAxis fontSize={12} stroke="#94a3b8" />
                    <Tooltip formatter={(v) => formatCurrency(Number(v), settings.currency) as string} />
                    <Line type="monotone" dataKey="sales" name="مبيعات" stroke="#10b981" strokeWidth={2} dot={false} />
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
                      <Pie data={categoryShare} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                        {categoryShare.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(v) => formatCurrency(Number(v), settings.currency) as string} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardBody>
            </Card>
          </div>
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
                      <TD className="text-end">{formatCurrency(p.quantity * p.sellingPrice, settings.currency)}</TD>
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
      </Tabs>
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
  value: string;
  tone: "green" | "blue" | "amber" | "indigo";
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${colors[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  Package,
  Plus,
  Minus,
  Search,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Select, Field, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Dialog } from "../components/ui/Dialog";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { daysUntil } from "../lib/utils";
import { formatDate } from "../lib/format";
import type { Product } from "../types";

export function InventoryPage() {
  const { products, suppliers, stockMovements, adjustStock, settings } = useApp();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [filter, setFilter] = useState<
    "all" | "low" | "soon" | "expired"
  >("all");

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<"in" | "out">("in");
  const [adjQty, setAdjQty] = useState(0);
  const [adjReason, setAdjReason] = useState("");

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products]
  );

  const counts = useMemo(() => {
    const low = products.filter((p) => p.quantity <= p.minStock).length;
    const soon = products.filter((p) => {
      if (!p.hasExpiry || !p.expiryDate) return false;
      const du = daysUntil(p.expiryDate);
      return du !== null && du >= 0 && du <= 14;
    }).length;
    const expired = products.filter((p) => {
      if (!p.hasExpiry || !p.expiryDate) return false;
      const du = daysUntil(p.expiryDate);
      return du !== null && du < 0;
    }).length;
    return { low, soon, expired };
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t)
      );
    }
    if (category) list = list.filter((p) => p.category === category);
    if (supplier) list = list.filter((p) => p.supplierId === supplier);
    if (filter === "low") list = list.filter((p) => p.quantity <= p.minStock);
    if (filter === "soon")
      list = list.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du >= 0 && du <= 14;
      });
    if (filter === "expired")
      list = list.filter((p) => {
        if (!p.hasExpiry || !p.expiryDate) return false;
        const du = daysUntil(p.expiryDate);
        return du !== null && du < 0;
      });
    return list;
  }, [products, q, category, supplier, filter]);

  function submitAdjust() {
    if (!adjustTarget) return;
    if (!adjQty || adjQty <= 0) {
      toast.error("الكمية يجب أن تكون أكبر من صفر");
      return;
    }
    if (!adjReason.trim()) {
      toast.error("السبب مطلوب");
      return;
    }
    const delta = adjType === "in" ? adjQty : -adjQty;
    adjustStock(adjustTarget.id, delta, adjReason.trim());
    toast.success(
      adjType === "in" ? "تم إضافة الكمية" : "تم خصم الكمية",
      `${adjustTarget.name}: ${delta > 0 ? "+" : ""}${delta}`
    );
    setAdjustTarget(null);
    setAdjQty(0);
    setAdjReason("");
    setAdjType("in");
  }

  const recentMovements = useMemo(
    () => stockMovements.slice(0, 10),
    [stockMovements]
  );

  return (
    <>
      <PageHeader
        title="المخزون"
        description="الكميات الحالية، التنبيهات، وضبط المخزون اليدوي"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">منتجات قليلة المخزون</div>
              <div className="text-xl font-semibold">{counts.low}</div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 grid place-items-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">قارب على الانتهاء (14 يوم)</div>
              <div className="text-xl font-semibold">{counts.soon}</div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 grid place-items-center">
              <CalendarX className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500">منتهي الصلاحية</div>
              <div className="text-xl font-semibold">{counts.expired}</div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="قائمة المخزون"
          subtitle="كمية، وحدة، حد أدنى، حالة"
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="بحث عن منتج..."
                className="pe-9"
              />
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
              <option value="">كل الفئات</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-52">
              <option value="">كل الموردين</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {[
                { key: "all", label: "الكل" },
                { key: "low", label: "منخفض" },
                { key: "soon", label: "قارب ينتهي" },
                { key: "expired", label: "منتهي" },
              ].map((b) => (
                <button
                  key={b.key}
                  onClick={() => setFilter(b.key as typeof filter)}
                  className={`px-3 h-8 text-xs rounded-md ${
                    filter === b.key
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Warehouse className="w-5 h-5" />}
              title="لا توجد منتجات"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الكود</TH>
                  <TH>المنتج</TH>
                  <TH>الفئة</TH>
                  <TH className="text-end">الكمية</TH>
                  <TH className="text-end">الحد الأدنى</TH>
                  <TH>الصلاحية</TH>
                  <TH>الحالة</TH>
                  <TH className="text-end">ضبط المخزون</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const du = daysUntil(p.expiryDate);
                  const low = p.quantity <= p.minStock;
                  const expired = p.hasExpiry && du !== null && du < 0;
                  const soon =
                    p.hasExpiry && du !== null && du >= 0 && du <= 14;
                  return (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.code}</TD>
                      <TD className="font-medium text-slate-900">{p.name}</TD>
                      <TD className="text-slate-600">{p.category}</TD>
                      <TD className="text-end font-semibold">
                        {p.quantity} {p.unit}
                      </TD>
                      <TD className="text-end text-slate-500">{p.minStock}</TD>
                      <TD className="text-slate-600 text-xs">
                        {p.hasExpiry && p.expiryDate ? formatDate(p.expiryDate) : "—"}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1 flex-wrap">
                          {low && <Badge tone="amber">منخفض</Badge>}
                          {expired && <Badge tone="red">منتهي</Badge>}
                          {soon && !expired && <Badge tone="rose">قريب ينتهي</Badge>}
                          {!low && !expired && !soon && (
                            <Badge tone="green">متوفر</Badge>
                          )}
                        </div>
                      </TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdjustTarget(p);
                              setAdjType("in");
                            }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            إضافة
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAdjustTarget(p);
                              setAdjType("out");
                            }}
                          >
                            <Minus className="w-3.5 h-3.5" />
                            خصم
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="سجل حركات المخزون" subtitle="آخر 10 حركات" />
        <CardBody>
          {recentMovements.length === 0 ? (
            <EmptyState
              icon={<Package className="w-5 h-5" />}
              title="لا توجد حركات"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>
                  <TH>المنتج</TH>
                  <TH>النوع</TH>
                  <TH className="text-end">الكمية</TH>
                  <TH>السبب / المرجع</TH>
                </TR>
              </THead>
              <TBody>
                {recentMovements.map((m) => (
                  <TR key={m.id}>
                    <TD>{formatDate(m.date)}</TD>
                    <TD className="text-slate-800">{m.productName}</TD>
                    <TD>
                      <Badge
                        tone={
                          m.type === "purchase"
                            ? "blue"
                            : m.type === "sale"
                            ? "green"
                            : m.type === "adjustment-in"
                            ? "emerald"
                            : m.type === "adjustment-out"
                            ? "rose"
                            : "amber"
                        }
                      >
                        {m.type === "purchase"
                          ? "شراء"
                          : m.type === "sale"
                          ? "بيع"
                          : m.type === "adjustment-in"
                          ? "تعديل زائد"
                          : m.type === "adjustment-out"
                          ? "تعديل ناقص"
                          : "مرتجع"}
                      </Badge>
                    </TD>
                    <TD
                      className={`text-end font-medium ${
                        m.quantity >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </TD>
                    <TD className="text-xs text-slate-500">
                      {m.reason ?? m.referenceId ?? "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`ضبط مخزون: ${adjustTarget?.name ?? ""}`}
        subtitle={`الكمية الحالية: ${adjustTarget?.quantity} ${adjustTarget?.unit}`}
        width="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              إلغاء
            </Button>
            <Button onClick={submitAdjust}>حفظ</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="نوع التعديل">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjType === "in"}
                  onChange={() => setAdjType("in")}
                />
                إضافة للمخزون
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={adjType === "out"}
                  onChange={() => setAdjType("out")}
                />
                خصم من المخزون
              </label>
            </div>
          </Field>
          <Field label="الكمية" required>
            <Input
              type="number"
              min={1}
              value={adjQty || ""}
              onChange={(e) => setAdjQty(Number(e.target.value))}
              placeholder="مثل: 10"
            />
          </Field>
          <Field label="السبب" required>
            <Textarea
              rows={2}
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder={`مثل: ${adjType === "in" ? "مرتجع عميل، جرد أعلى" : "تلف، فقد، جرد أقل"}`}
            />
          </Field>
        </div>
      </Dialog>

      {settings /* keep for hot reload refs */ && null}
    </>
  );
}

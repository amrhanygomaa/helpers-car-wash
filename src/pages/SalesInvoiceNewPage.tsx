import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { uid } from "../lib/utils";
import type { InvoiceLine, Product, SalesPaymentType } from "../types";
import { formatCurrency } from "../lib/format";
import { Badge } from "../components/ui/Badge";

interface LineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  expiryDate?: string;
}

function nextInvoiceNumber(existing: string[]): string {
  const nums = existing
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `INV-${max + 1}`;
}

export function SalesInvoiceNewPage() {
  const { products, customers, salesInvoices, addSalesInvoice, settings } = useApp();
  const navigate = useNavigate();
  const toast = useToast();

  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber))
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [driverName, setDriverName] = useState("");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>("cash");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
  }, [customers, customerId]);

  const total = useMemo(
    () => lines.reduce((a, l) => a + (l.quantity || 0) * (l.price || 0), 0),
    [lines]
  );

  useEffect(() => {
    if (paymentType === "cash") setAmountReceived(total);
  }, [paymentType, total]);

  const stockWarnings = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (!l.productId) return;
      map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
    });
    const out: { productId: string; requested: number; available: number; name: string }[] = [];
    map.forEach((req, pid) => {
      const p = products.find((x) => x.id === pid);
      if (!p) return;
      if (req > p.quantity) {
        out.push({ productId: pid, requested: req, available: p.quantity, name: p.name });
      }
    });
    return out;
  }, [lines, products]);

  function addLine(productId?: string) {
    const p = productId ? products.find((x) => x.id === productId) : undefined;
    setLines((l) => [
      ...l,
      {
        id: uid("line"),
        productId: p?.id ?? "",
        quantity: 1,
        price: p?.sellingPrice ?? 0,
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<LineDraft>) {
    setLines((arr) =>
      arr.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.productId) {
          const p = products.find((x) => x.id === patch.productId);
          if (p) {
            next.price = next.price || p.sellingPrice;
          }
        }
        return next;
      })
    );
  }

  function removeLine(id: string) {
    setLines((arr) => arr.filter((l) => l.id !== id));
  }

  function submit() {
    if (!customerId) {
      toast.error("اختر العميل");
      return;
    }
    if (lines.length === 0) {
      toast.error("أضف بنود الفاتورة");
      return;
    }
    const invalid = lines.find((l) => !l.productId || l.quantity <= 0);
    if (invalid) {
      toast.error("تأكد من اختيار المنتج وإدخال كمية صحيحة لكل سطر");
      return;
    }
    if (stockWarnings.length > 0) {
      toast.error(
        "الكمية المطلوبة تتجاوز المخزون",
        stockWarnings
          .map((w) => `${w.name}: متاح ${w.available} / مطلوب ${w.requested}`)
          .join(" • ")
      );
      return;
    }
    if (amountReceived < 0 || amountReceived > total) {
      toast.error("المبلغ المستلم غير صحيح");
      return;
    }

    const customer = customers.find((c) => c.id === customerId)!;
    const invLines: InvoiceLine[] = lines.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      return {
        id: l.id,
        productId: p.id,
        productName: p.name,
        unit: p.unit,
        quantity: l.quantity,
        price: l.price,
        expiryDate: l.expiryDate,
        subtotal: l.quantity * l.price,
      };
    });

    const inv = addSalesInvoice({
      invoiceNumber,
      date,
      customerId,
      customerName: customer.name,
      driverName: driverName.trim() || undefined,
      lines: invLines,
      total,
      amountReceived,
      paymentType,
      notes: notes.trim() || undefined,
    });
    toast.success("تم حفظ الفاتورة", `رقم ${inv.invoiceNumber}`);
    navigate(`/sales/${inv.id}`);
  }

  const customer = customers.find((c) => c.id === customerId);

  return (
    <>
      <PageHeader
        title="فاتورة مبيعات جديدة"
        description="أدخل بنود الفاتورة — يتم خصم الكميات من المخزون تلقائياً عند الحفظ."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/sales")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" />
              حفظ الفاتورة
            </Button>
          </>
        }
      />

      {stockWarnings.length > 0 ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-lg p-3 text-sm">
          <div className="font-semibold mb-1">⚠ تحذير: الكمية تتجاوز المخزون</div>
          <ul className="list-disc ps-5 space-y-0.5 text-xs">
            {stockWarnings.map((w) => (
              <li key={w.productId}>
                {w.name}: المتاح {w.available} / المطلوب {w.requested}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader title="بيانات الفاتورة" />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="رقم الفاتورة" required>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="العميل" required>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="اسم السائق (اختياري)">
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="مثل: محمود السائق" />
            </Field>
          </div>
          {customer ? (
            <div className="mt-3 text-xs text-slate-500">
              الهاتف: {customer.phone ?? "—"} • العنوان: {customer.address ?? "—"}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="بنود الفاتورة"
          actions={
            <Button onClick={() => addLine()} size="sm">
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </Button>
          }
        />
        <CardBody>
          {lines.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              لا توجد بنود — ابدأ بإضافة منتج.
              <div className="mt-3">
                <Button onClick={() => addLine()}>
                  <Plus className="w-4 h-4" /> إضافة بند
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>المنتج</TH>
                  <TH className="w-20 text-center">متاح</TH>
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-28">سعر البيع</TH>
                  <TH className="w-28 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  const available = p?.quantity ?? 0;
                  const exceeds = l.quantity > available && !!p;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <ProductCombo
                          products={products}
                          value={l.productId}
                          onChange={(pid) => updateLine(l.id, { productId: pid })}
                        />
                      </TD>
                      <TD className="text-center text-xs">
                        {p ? (
                          <Badge tone={available <= p.minStock ? "amber" : "slate"}>
                            {available} {p.unit}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.id, { quantity: Math.max(0, Number(e.target.value)) })
                          }
                          className={exceeds ? "border-rose-400" : ""}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.price}
                          onChange={(e) =>
                            updateLine(l.id, { price: Number(e.target.value) })
                          }
                        />
                      </TD>
                      <TD className="text-end font-medium">
                        {formatCurrency(l.quantity * l.price, settings.currency)}
                      </TD>
                      <TD>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => removeLine(l.id)}
                        >
                          <Trash2 className="w-4 h-4" />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="الدفع" />
          <CardBody className="space-y-3">
            <Field label="طريقة الدفع">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={paymentType === "cash"}
                    onChange={() => setPaymentType("cash")}
                  />
                  نقدي
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={paymentType === "account"}
                    onChange={() => setPaymentType("account")}
                  />
                  آجل (حساب)
                </label>
              </div>
            </Field>
            <Field label="المبلغ المستلم">
              <Input
                type="number"
                min={0}
                step="0.01"
                max={total}
                value={amountReceived}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
              />
            </Field>
            <Field label="ملاحظات">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات اختيارية..."
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الملخص" />
          <CardBody className="space-y-2">
            <Row label="إجمالي الفاتورة" value={formatCurrency(total, settings.currency)} />
            <Row
              label="المستلم"
              value={formatCurrency(amountReceived, settings.currency)}
            />
            <div className="border-t border-slate-200 pt-2">
              <Row
                label="المتبقي"
                bold
                value={formatCurrency(Math.max(0, total - amountReceived), settings.currency)}
                tone="amber"
              />
            </div>
            <div className="pt-2">
              <Button onClick={submit} size="lg" className="w-full">
                <Save className="w-4 h-4" /> حفظ الفاتورة
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function ProductCombo({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full">
      <option value="">— اختر منتجاً —</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {p.code}
        </option>
      ))}
    </Select>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "amber";
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        bold ? "text-lg font-bold" : "text-sm"
      } ${tone === "amber" ? "text-amber-700" : "text-slate-700"}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

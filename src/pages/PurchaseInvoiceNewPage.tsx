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
import type { InvoiceLine, Product } from "../types";
import { formatCurrency } from "../lib/format";

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
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `PO-${String(next).padStart(5, "0")}`;
}

export function PurchaseInvoiceNewPage() {
  const { products, suppliers, purchaseInvoices, addPurchaseInvoice, settings } =
    useApp();
  const navigate = useNavigate();
  const toast = useToast();

  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    nextInvoiceNumber(purchaseInvoices.map((s) => s.invoiceNumber))
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  useEffect(() => {
    if (!supplierId && suppliers[0]) setSupplierId(suppliers[0].id);
  }, [suppliers, supplierId]);

  const total = useMemo(
    () => lines.reduce((a, l) => a + (l.quantity || 0) * (l.price || 0), 0),
    [lines]
  );

  function addLine(productId?: string) {
    const p = productId ? products.find((x) => x.id === productId) : undefined;
    setLines((l) => [
      ...l,
      {
        id: uid("line"),
        productId: p?.id ?? "",
        quantity: 1,
        price: p?.purchasePrice ?? 0,
        expiryDate: p?.expiryDate,
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
            next.price = next.price || p.purchasePrice;
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
    if (!supplierId) {
      toast.error("اختر المورد");
      return;
    }
    if (lines.length === 0) {
      toast.error("أضف بنود الفاتورة");
      return;
    }
    const invalid = lines.find((l) => !l.productId || l.quantity <= 0);
    if (invalid) {
      toast.error("تأكد من اختيار المنتج وإدخال كمية صحيحة");
      return;
    }
    if (amountPaid < 0 || amountPaid > total) {
      toast.error("المبلغ المدفوع غير صحيح");
      return;
    }

    const supplier = suppliers.find((s) => s.id === supplierId)!;
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

    const inv = addPurchaseInvoice({
      invoiceNumber,
      date,
      supplierId,
      supplierName: supplier.name,
      lines: invLines,
      total,
      amountPaid,
      notes: notes.trim() || undefined,
    });
    toast.success("تم حفظ الفاتورة", `تم إضافة الكميات للمخزون`);
    navigate(`/purchases/${inv.id}`);
  }

  return (
    <>
      <PageHeader
        title="فاتورة مشتريات جديدة"
        description="أدخل بنود فاتورة المورد — يتم زيادة الكميات في المخزون تلقائياً عند الحفظ."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/purchases")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" /> حفظ الفاتورة
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader title="بيانات الفاتورة" />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="رقم الفاتورة" required>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="المورد" required>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
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
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-28">سعر الشراء</TH>
                  <TH className="w-40">تاريخ صلاحية (اختياري)</TH>
                  <TH className="w-28 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  return (
                    <TR key={l.id}>
                      <TD>
                        <ProductCombo
                          products={products}
                          value={l.productId}
                          onChange={(pid) => updateLine(l.id, { productId: pid })}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.price}
                          onChange={(e) => updateLine(l.id, { price: Number(e.target.value) })}
                        />
                      </TD>
                      <TD>
                        <Input
                          type="date"
                          value={l.expiryDate ?? ""}
                          onChange={(e) =>
                            updateLine(l.id, { expiryDate: e.target.value || undefined })
                          }
                          disabled={!p?.hasExpiry}
                          title={!p?.hasExpiry ? "هذا المنتج بدون صلاحية" : ""}
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
            <Field label="المبلغ المدفوع للمورد">
              <Input
                type="number"
                min={0}
                step="0.01"
                max={total}
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmountPaid(0)}>
                آجل بالكامل
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAmountPaid(total)}>
                مدفوع بالكامل
              </Button>
            </div>
            <Field label="ملاحظات">
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="شروط السداد أو ملاحظات..."
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الملخص" />
          <CardBody className="space-y-2">
            <Row label="إجمالي الفاتورة" value={formatCurrency(total, settings.currency)} />
            <Row label="المدفوع" value={formatCurrency(amountPaid, settings.currency)} />
            <div className="border-t border-slate-200 pt-2">
              <Row
                label="المتبقي للمورد"
                bold
                value={formatCurrency(Math.max(0, total - amountPaid), settings.currency)}
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

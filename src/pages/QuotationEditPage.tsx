import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useCatalog } from "../store/CatalogContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { uid } from "../lib/utils";
import type { InvoiceLine, Product } from "../types";
import { formatCurrency } from "../lib/format";
import { ConfirmDialog } from "../components/ui/Dialog";
import { BarcodeScanInput } from "../features/products/BarcodeScanInput";
import { parseNumericInput } from "../lib/numberInput";
import { findProductByBarcode } from "../lib/barcode";

interface LineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number;
}

export function QuotationEditPage() {
  const { id } = useParams();
  const { products: allProducts, customers: allCustomers } = useCatalog();
  const products = useMemo(() => allProducts.filter((p) => !p.archived), [allProducts]);
  const customers = useMemo(() => allCustomers.filter((c) => !c.archived), [allCustomers]);
  const { quotations, updateQuotation } = useInvoicing();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();

  const quot = quotations.find((q) => q.id === id);

  const [date, setDate] = useState(() => quot?.date ?? "");
  const [validUntil, setValidUntil] = useState(() => quot?.validUntil ?? "");
  const [customerId, setCustomerId] = useState(() => quot?.customerId ?? "");
  const [discount, setDiscount] = useState<number>(() => quot?.discount ?? 0);
  const [notes, setNotes] = useState(() => quot?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (quot?.lines ?? []).map((l) => ({
      id: l.id,
      productId: l.productId,
      quantity: l.quantity,
      price: l.price,
    }))
  );

  const isDirtyRef = useRef(false);
  useEffect(() => { isDirtyRef.current = true; }, [date, validUntil, customerId, discount, notes, lines]);
  const blocker = useBlocker(useCallback(() => isDirtyRef.current, []));

  const customer = customers.find((c) => c.id === customerId);

  const subtotal = useMemo(
    () => lines.reduce((a, l) => a + l.quantity * l.price, 0),
    [lines]
  );
  const total = Math.max(0, subtotal - (discount || 0));

  function productForLine(productId: string): Product | undefined {
    return products.find((p) => p.id === productId);
  }

  function addLine() {
    setLines((prev) => [...prev, { id: uid("ql"), productId: "", quantity: 1, price: 0 }]);
  }

  function updateLine(lineId: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const updated = { ...l, ...patch };
        if (patch.productId !== undefined) {
          const prod = productForLine(patch.productId);
          if (prod) updated.price = prod.wholesalePrice;
        }
        return updated;
      })
    );
  }

  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  function handleBarcodeScanned(barcode: string) {
    const prod = findProductByBarcode(products, barcode);
    if (!prod) { toast.error("لم يُعثر على المنتج", `الباركود: ${barcode}`); return; }
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === prod.id);
      if (existing) return prev.map((l) => l.productId === prod.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { id: uid("ql"), productId: prod.id, quantity: 1, price: prod.wholesalePrice }];
    });
  }

  function handleSave() {
    if (!customerId) { toast.error("اختر العميل"); return; }
    if (lines.length === 0) { toast.error("أضف بند واحداً على الأقل"); return; }
    if (lines.some((l) => !l.productId || l.quantity <= 0 || l.price < 0)) {
      toast.error("تحقق من بيانات البنود");
      return;
    }
    const invoiceLines: InvoiceLine[] = lines.map((l) => {
      const prod = productForLine(l.productId)!;
      return {
        id: l.id,
        productId: l.productId,
        productName: prod.name,
        unit: prod.unit,
        quantity: l.quantity,
        price: l.price,
        subtotal: l.quantity * l.price,
      };
    });
    isDirtyRef.current = false;
    updateQuotation(id!, {
      date,
      validUntil: validUntil || undefined,
      customerId,
      customerName: customer!.name,
      lines: invoiceLines,
      total,
      discount: discount || undefined,
      notes: notes.trim() || undefined,
    });
    toast.success("تم تحديث عرض السعر");
    navigate(`/quotations/${id}`);
  }

  if (!quot) {
    return (
      <Card><CardBody>
        <div className="text-center py-8">
          <div className="text-slate-900 font-medium">عرض السعر غير موجود</div>
          <Button className="mt-4" onClick={() => navigate("/quotations")}>العودة للقائمة</Button>
        </div>
      </CardBody></Card>
    );
  }

  if (quot.status === "converted") {
    return (
      <Card><CardBody>
        <div className="text-center py-8">
          <div className="text-slate-900 font-medium">لا يمكن تعديل عرض سعر محول إلى فاتورة</div>
          <Button className="mt-4" onClick={() => navigate(`/quotations/${id}`)}>العودة للعرض</Button>
        </div>
      </CardBody></Card>
    );
  }

  return (
    <>
      <PageHeader
        title={`تعديل عرض سعر ${quot.quotationNumber}`}
        description={quot.customerName}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/quotations/${id}`)}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button onClick={handleSave} disabled={lines.length === 0}>
              <Save className="w-4 h-4" /> حفظ التعديلات
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="بيانات العرض" />
          <CardBody className="space-y-3">
            <Field label="رقم العرض">
              <Input value={quot.quotationNumber} readOnly className="bg-slate-50 text-slate-500" />
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="صالح حتى">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            <Field label="العميل" required>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">-- اختر العميل --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="خصم">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </Field>
            <Field label="ملاحظات">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="مسح باركود" />
          <CardBody>
            <BarcodeScanInput onScan={handleBarcodeScanned} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="البنود"
          actions={
            <Button size="sm" onClick={addLine}>
              <Plus className="w-4 h-4" /> إضافة بند
            </Button>
          }
        />
        <CardBody>
          {lines.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              لا توجد بنود — اضغط «إضافة بند» أو امسح باركود
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>المنتج</TH>
                  <TH className="w-28">الكمية</TH>
                  <TH className="w-36">السعر</TH>
                  <TH className="text-end w-36">الإجمالي</TH>
                  <TH className="w-10" />
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Select value={l.productId} onChange={(e) => updateLine(l.id, { productId: e.target.value })}>
                        <option value="">-- اختر --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <Input
                        type="number" min={0.01} step="0.01"
                        value={l.quantity || ""}
                        onChange={(e) => updateLine(l.id, { quantity: parseNumericInput(e.target.value) })}
                      />
                    </TD>
                    <TD>
                      <Input
                        type="number" min={0} step="0.01"
                        value={l.price || ""}
                        onChange={(e) => updateLine(l.id, { price: parseNumericInput(e.target.value) })}
                      />
                    </TD>
                    <TD className="text-end font-medium text-slate-900">
                      {formatCurrency(l.quantity * l.price, settings.currency)}
                    </TD>
                    <TD>
                      <button type="button" className="text-rose-500 hover:text-rose-700" onClick={() => removeLine(l.id)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          {lines.length > 0 && (
            <div className="mt-4 flex flex-col items-end gap-1 text-sm">
              {discount > 0 && (
                <>
                  <div className="flex gap-6">
                    <span className="text-slate-500">المجموع الفرعي</span>
                    <span className="font-medium w-32 text-end">{formatCurrency(subtotal, settings.currency)}</span>
                  </div>
                  <div className="flex gap-6 text-rose-600">
                    <span>الخصم</span>
                    <span className="font-medium w-32 text-end">- {formatCurrency(discount, settings.currency)}</span>
                  </div>
                </>
              )}
              <div className="flex gap-6 text-lg font-bold">
                <span>الإجمالي</span>
                <span className="w-32 text-end">{formatCurrency(total, settings.currency)}</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="الخروج بدون حفظ؟"
        message="لديك تعديلات غير محفوظة. هل تريد الخروج؟"
        confirmText="خروج"
        variant="danger"
      />
    </>
  );
}

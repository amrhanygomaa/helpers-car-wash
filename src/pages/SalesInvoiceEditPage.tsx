import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/Dialog";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useSettings } from "../store/SettingsContext";
import { useReporting } from "../store/ReportingContext";
import { useToast } from "../components/ui/Toast";
import { uid } from "../lib/utils";
import type { InvoiceLine, SalesPaymentType } from "../types";
import { formatCurrency } from "../lib/format";
import { parseNumericInput } from "../lib/numberInput";

interface LineDraft {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  expiryDate?: string;
}

export function SalesInvoiceEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { salesInvoices, salesReturns, updateSalesInvoice } = useInvoicing();
  const { products, drivers } = useCatalog();
  const { settings } = useSettings();
  const { customerBalance } = useReporting();

  const inv = salesInvoices.find((s) => s.id === id);
  const hasReturns = salesReturns.some((r) => r.originalInvoiceId === id);

  const [invoiceNumber] = useState(inv?.invoiceNumber ?? "");
  const [date, setDate] = useState(inv?.date ?? "");
  const [driverId, setDriverId] = useState(inv?.driverId ?? "");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>(inv?.paymentType ?? "cash");
  const [paymentDueDate, setPaymentDueDate] = useState(inv?.paymentDueDate ?? "");
  const [discount, setDiscount] = useState<number>(inv?.discount ?? 0);
  const [amountReceived, setAmountReceived] = useState(inv?.amountReceived ?? 0);
  const [notes, setNotes] = useState(inv?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    () =>
      inv?.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        price: l.price,
        expiryDate: l.expiryDate,
      })) ?? []
  );

  useEffect(() => {
    if (paymentType === "cash") setPaymentDueDate("");
  }, [paymentType]);

  const initializedRef = useRef(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) { initializedRef.current = true; return; }
    dirtyRef.current = true;
  }, [date, invoiceNumber, driverId, paymentType, paymentDueDate, discount, amountReceived, notes, lines]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  const blocker = useBlocker(useCallback(() => dirtyRef.current, []));

  const gross = useMemo(
    () => lines.reduce((a, l) => a + (l.quantity || 0) * (l.price || 0), 0),
    [lines]
  );
  const invoiceNet = Math.max(0, gross - (discount || 0));

  const stockWarnings = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((l) => {
      if (!l.productId) return;
      map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
    });
    const out: { productId: string; requested: number; available: number; name: string; unit: string }[] = [];
    map.forEach((req, pid) => {
      const p = products.find((x) => x.id === pid);
      if (!p) return;
      const origLine = inv?.lines.find((l) => l.productId === pid);
      const isRetailLine = inv?.priceType === "retail" && !!p.piecesPerUnit;
      const originalQty = origLine?.quantity ?? 0;
      const effectiveAvailable = isRetailLine
        ? p.quantity * p.piecesPerUnit! + (p.looseQuantity ?? 0) + originalQty
        : p.quantity + originalQty;
      if (req > effectiveAvailable) {
        out.push({ productId: pid, requested: req, available: effectiveAvailable, name: p.name, unit: isRetailLine ? (p.retailUnit ?? "قطعة") : p.unit });
      }
    });
    return out;
  }, [lines, products, inv]);

  function addLine() {
    setLines((l) => [...l, { id: uid("line"), productId: "", quantity: 1, price: 0 }]);
  }

  function updateLine(lineId: string, patch: Partial<LineDraft>) {
    setLines((arr) =>
      arr.map((l) => {
        if (l.id !== lineId) return l;
        const next = { ...l, ...patch };
        if (patch.productId) {
          const p = products.find((x) => x.id === patch.productId);
          if (p) next.price = next.price || (inv?.priceType === "retail" ? p.retailPrice : p.wholesalePrice);
        }
        return next;
      })
    );
  }

  function removeLine(lineId: string) {
    setLines((arr) => arr.filter((l) => l.id !== lineId));
  }

  function submit() {
    if (!inv) return;
    if (lines.length === 0) {
      toast.error("أضف بنود الفاتورة");
      return;
    }
    const invalidIdx = lines.findIndex((l) => !l.productId || l.quantity <= 0);
    if (invalidIdx >= 0) {
      toast.error(`السطر ${invalidIdx + 1}: تأكد من اختيار المنتج وإدخال كمية صحيحة`);
      return;
    }
    if (stockWarnings.length > 0) {
      toast.error(
        "الكمية تتجاوز المخزون",
        stockWarnings.map((w) => `${w.name}: متاح ${w.available} / مطلوب ${w.requested}`).join(" • ")
      );
      return;
    }
    if (discount < 0 || discount > gross) {
      toast.error("قيمة الخصم غير صحيحة");
      return;
    }
    if (amountReceived < 0) {
      toast.error("المبلغ المستلم غير صحيح");
      return;
    }
    if (paymentType === "cash" && amountReceived <= 0) {
      toast.error("أدخل المبلغ المستلم");
      return;
    }
    if (paymentType === "account" && !paymentDueDate) {
      toast.error("أدخل تاريخ الاستحقاق");
      return;
    }

    const invLines: InvoiceLine[] = lines.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      const isRetailUnit = inv.priceType === "retail" && !!p.piecesPerUnit;
      return {
        id: l.id,
        productId: p.id,
        productName: p.name,
        unit: isRetailUnit ? (p.retailUnit ?? "قطعة") : p.unit,
        quantity: l.quantity,
        price: l.price,
        expiryDate: l.expiryDate,
        subtotal: l.quantity * l.price,
        isRetailUnit: isRetailUnit || undefined,
      };
    });

    const receivedForInvoice = Math.min(amountReceived, invoiceNet);
    const effectivePaymentType: SalesPaymentType = paymentType;
    const effectiveDueDate = effectivePaymentType === "account" && paymentDueDate ? paymentDueDate : undefined;

    updateSalesInvoice(inv.id, {
      invoiceNumber,
      date,
      driverId: driverId || undefined,
      driverName: driverId ? drivers.find((d) => d.id === driverId)?.name : undefined,
      lines: invLines,
      total: invoiceNet,
      discount: discount > 0 ? discount : undefined,
      amountReceived: receivedForInvoice,
      paymentType: effectivePaymentType,
      priceType: inv.priceType,
      paymentDueDate: effectiveDueDate,
      notes: notes.trim() || undefined,
      cancelled: inv.cancelled,
      createdByUserId: inv.createdByUserId,
    });

    dirtyRef.current = false;
    toast.success("تم تحديث الفاتورة");
    navigate(`/sales/${inv.id}`);
  }

  if (!inv) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8 text-slate-500">الفاتورة غير موجودة</div>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={`تعديل فاتورة ${inv.invoiceNumber}`}
        description="تعديل بنود الفاتورة وبيانات الدفع — العميل لا يمكن تغييره"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/sales/${inv.id}`)}>
              <ArrowRight className="w-4 h-4" /> إلغاء
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" /> حفظ التعديلات
            </Button>
          </>
        }
      />

      {stockWarnings.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-lg p-3 text-sm">
          <div className="font-semibold mb-1">⚠ تحذير: الكمية تتجاوز المخزون</div>
          <ul className="list-disc ps-5 space-y-0.5 text-xs">
            {stockWarnings.map((w) => (
              <li key={w.productId}>
                {w.name}: المتاح {w.available} {w.unit} / المطلوب {w.requested} {w.unit}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader title="بيانات الفاتورة" />
        <CardBody>
          {/* Customer — read-only */}
          <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700">
            <span className="text-slate-400 text-xs block mb-0.5">العميل (غير قابل للتعديل)</span>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">{inv.customerName}</span>
              {(() => {
                const bal = customerBalance(inv.customerId);
                if (bal === 0) return null;
                return (
                  <span className={`text-xs font-semibold ${bal > 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {bal > 0
                      ? `مديون: ${formatCurrency(bal, settings.currency)}`
                      : `رصيد دائن: ${formatCurrency(-bal, settings.currency)}`}
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="رقم الفاتورة">
              <Input
                value={invoiceNumber}
                readOnly
                className="bg-gray-100 cursor-not-allowed text-gray-600 font-mono"
              />
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="السائق">
              <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">— بدون سائق —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
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
            <Button size="sm" onClick={addLine}>
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </Button>
          }
        />
        <CardBody>
          {lines.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              لا توجد بنود.
              <div className="mt-3">
                <Button onClick={addLine}><Plus className="w-4 h-4" /> إضافة بند</Button>
              </div>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>المنتج</TH>
                  <TH className="w-20 text-center">متاح</TH>
                  <TH className="w-24">الكمية</TH>
                  <TH className="w-28">السعر</TH>
                  <TH className="w-28 text-end">الإجمالي</TH>
                  <TH className="w-10"></TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => {
                  const p = products.find((x) => x.id === l.productId);
                  const origLine = inv.lines.find((ol) => ol.productId === l.productId);
                  const isRetailLine = inv.priceType === "retail" && !!p?.piecesPerUnit;
                  const originalQty = origLine?.quantity ?? 0;
                  const available = isRetailLine
                    ? p!.quantity * p!.piecesPerUnit! + (p!.looseQuantity ?? 0) + originalQty
                    : (p?.quantity ?? 0) + originalQty;
                  const availUnit = isRetailLine ? (p!.retailUnit ?? "قطعة") : (p?.unit ?? "");
                  const exceeds = !!p && l.quantity > available;
                  return (
                    <TR key={l.id}>
                      <TD>
                        <Select
                          value={l.productId}
                          onChange={(e) => updateLine(l.id, { productId: e.target.value })}
                          className="w-full"
                        >
                          <option value="">— اختر منتجاً —</option>
                          {products.map((pr) => (
                            <option key={pr.id} value={pr.id}>
                              {pr.name}{pr.category ? ` (${pr.category})` : ""} — {pr.code}
                            </option>
                          ))}
                        </Select>
                      </TD>
                      <TD className="text-center text-xs">
                        {p ? (
                          <Badge tone={available <= p.minStock ? "amber" : "slate"}>
                            {available} {availUnit}
                          </Badge>
                        ) : "—"}
                      </TD>
                      <TD>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.id, {
                              quantity: Math.max(1, parseNumericInput(e.target.value, l.quantity)),
                            })
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
                            updateLine(l.id, {
                              price: Math.max(0, parseNumericInput(e.target.value, l.price)),
                            })
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
            <Field label="طريقة الدفع" required>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={paymentType === "cash"} onChange={() => setPaymentType("cash")} />
                  نقدي
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={paymentType === "account"} onChange={() => setPaymentType("account")} />
                  آجل (حساب)
                </label>
              </div>
            </Field>
            {paymentType === "account" && (
              <Field label="تاريخ الاستحقاق" required>
                <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} required />
              </Field>
            )}
            <Field label="المبلغ المستلم" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                readOnly={hasReturns}
                className={hasReturns ? "bg-gray-100 cursor-not-allowed text-gray-600" : ""}
                onChange={(e) => {
                  if (hasReturns) return;
                  setAmountReceived(Math.max(0, parseNumericInput(e.target.value, amountReceived)));
                }}
              />
            </Field>
            {hasReturns && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                لا يمكن تعديل المبلغ المستلم بعد وجود مرتجع. استخدم <strong>تسجيل دفعة</strong> أو <strong>حركة خزنة</strong> من صفحة الفاتورة.
              </div>
            )}
            <Field label="ملاحظات">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الملخص" />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-700">
              <span>إجمالي البنود</span>
              <span className="font-mono">{formatCurrency(gross, settings.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">خصم</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ""}
                onChange={(e) =>
                  setDiscount(Math.max(0, parseNumericInput(e.target.value, discount)))
                }
                placeholder="0.00"
                className="w-28 h-8"
              />
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-slate-900 font-semibold">
                <span>صافي الفاتورة</span>
                <span className="font-mono">{formatCurrency(invoiceNet, settings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-700">
              <span>المبلغ المستلم</span>
              <span className="font-mono">{formatCurrency(Math.min(amountReceived, invoiceNet), settings.currency)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between text-lg font-bold text-amber-700">
              <span>المتبقي</span>
              <span className="font-mono">{formatCurrency(Math.max(0, invoiceNet - amountReceived), settings.currency)}</span>
            </div>
            <div className="pt-2">
              <Button onClick={submit} size="lg" className="w-full">
                <Save className="w-4 h-4" /> حفظ التعديلات
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="الخروج بدون حفظ؟"
        message="لديك تعديلات غير محفوظة. هل تريد الخروج وفقدان التغييرات؟"
        confirmText="خروج"
        variant="danger"
      />
    </>
  );
}

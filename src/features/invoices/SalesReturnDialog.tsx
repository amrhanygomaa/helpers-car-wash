/**
 * مرتجع منتجات — create a products-only return against a sales invoice.
 *
 * Services are never returnable (the wash already happened); the dialog only
 * lists product lines, capped at each line's remaining returnable quantity
 * (FR: returns are on products only). Stock restoration, invoice settlement,
 * the cash refund entry and the SQLite mirror all happen inside
 * `addSalesReturn` — this dialog just collects quantities.
 */
import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input } from "../../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { useToast } from "../../components/ui/Toast";
import { useInvoicing } from "../../store/InvoicingContext";
import { useSettings } from "../../store/SettingsContext";
import { returnableProductLines } from "../../store/_pure";
import { formatCurrency } from "../../lib/format";
import { todayISO, uid } from "../../lib/utils";
import type { ReturnLine, SalesInvoice } from "../../types";

export function SalesReturnDialog({
  open,
  invoice,
  onClose,
}: {
  open: boolean;
  invoice: SalesInvoice;
  onClose: () => void;
}) {
  const { salesReturns, addSalesReturn } = useInvoicing();
  const { settings } = useSettings();
  const toast = useToast();

  const returnable = useMemo(
    () => returnableProductLines(invoice, salesReturns).filter((r) => r.returnableQty > 0),
    [invoice, salesReturns]
  );

  const [qtyByLine, setQtyByLine] = useState<Record<string, number>>({});
  const [refundCash, setRefundCash] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setQtyByLine({});
    setNotes("");
    // Cash back only makes sense when something was actually collected;
    // otherwise the return just reduces the outstanding balance (الآجل).
    setRefundCash(invoice.amountReceived + (invoice.overpayment ?? 0) > 0);
  }, [open, invoice]);

  const setQty = (lineId: string, raw: string, max: number) => {
    const n = parseInt(raw, 10);
    const clamped = Number.isFinite(n) ? Math.min(Math.max(0, n), max) : 0;
    setQtyByLine((prev) => ({ ...prev, [lineId]: clamped }));
  };

  const returnLines: ReturnLine[] = useMemo(
    () =>
      returnable
        .filter((r) => (qtyByLine[r.line.id] ?? 0) > 0)
        .map((r) => {
          const quantity = qtyByLine[r.line.id] ?? 0;
          return {
            id: uid("rl"),
            sourceLineId: r.line.id,
            productId: r.line.productId,
            productName: r.line.productName,
            unit: r.line.unit,
            quantity,
            price: r.line.price,
            subtotal: r.line.price * quantity,
            isRetailUnit: r.line.isRetailUnit,
          };
        }),
    [returnable, qtyByLine]
  );

  const total = useMemo(
    () => returnLines.reduce((sum, l) => sum + l.subtotal, 0),
    [returnLines]
  );

  function handleConfirm() {
    if (returnLines.length === 0) return;
    try {
      const ret = addSalesReturn({
        date: todayISO(),
        originalInvoiceId: invoice.id,
        originalInvoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        lines: returnLines,
        total,
        refundCash,
        notes: notes.trim() || undefined,
      });
      toast.success("تم تسجيل المرتجع", `رقم ${ret.returnNumber}`);
      onClose();
    } catch (err) {
      toast.error("تعذر تسجيل المرتجع", err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="مرتجع منتجات"
      subtitle={`فاتورة ${invoice.invoiceNumber} — المنتجات فقط قابلة للإرجاع، خدمات الغسيل لا تُرجع.`}
      width="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-sm text-slate-600">
            إجمالي المرتجع:{" "}
            <span className="font-bold text-slate-900">
              {formatCurrency(total, settings.currency)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button onClick={handleConfirm} disabled={returnLines.length === 0}>
              <RotateCcw className="w-4 h-4" /> تسجيل المرتجع
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4" dir="rtl">
        {returnable.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-500">
            لا توجد منتجات متاحة للإرجاع في هذه الفاتورة.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>المنتج</TH>
                <TH className="text-end">المباع</TH>
                <TH className="text-end">مرتجع سابقاً</TH>
                <TH className="text-end w-28">كمية الإرجاع</TH>
                <TH className="text-end">المبلغ</TH>
              </TR>
            </THead>
            <TBody>
              {returnable.map((r) => {
                const qty = qtyByLine[r.line.id] ?? 0;
                return (
                  <TR key={r.line.id}>
                    <TD className="font-medium text-slate-900">{r.line.productName}</TD>
                    <TD className="text-end">{r.soldQty}</TD>
                    <TD className="text-end">{r.returnedQty > 0 ? r.returnedQty : "—"}</TD>
                    <TD className="text-end">
                      <Input
                        type="number"
                        min={0}
                        max={r.returnableQty}
                        step={1}
                        value={qty === 0 ? "" : String(qty)}
                        placeholder="0"
                        aria-label={`كمية إرجاع ${r.line.productName}`}
                        onChange={(e) => setQty(r.line.id, e.target.value, r.returnableQty)}
                      />
                    </TD>
                    <TD className="text-end font-medium">
                      {formatCurrency(r.line.price * qty, settings.currency)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-brand-600"
            checked={refundCash}
            onChange={(e) => setRefundCash(e.target.checked)}
          />
          رد المبلغ نقداً من الخزنة (وإلا يُخصم من المتبقي على العميل)
        </label>

        <Field label="ملاحظات (اختياري)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: عبوة تالفة"
          />
        </Field>
      </div>
    </Dialog>
  );
}

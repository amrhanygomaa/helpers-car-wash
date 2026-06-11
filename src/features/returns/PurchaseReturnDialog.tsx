import { useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { useInvoicing } from "../../store/InvoicingContext";
import { useSettings } from "../../store/SettingsContext";
import { useToast } from "../../components/ui/Toast";
import type { PurchaseInvoice, ReturnLine } from "../../types";
import { formatCurrency } from "../../lib/format";
import { todayISO, uid } from "../../lib/utils";

export function PurchaseReturnDialog({
  open,
  onClose,
  invoice,
}: {
  open: boolean;
  onClose: () => void;
  invoice: PurchaseInvoice;
}) {
  const { addPurchaseReturn } = useInvoicing();
  const { settings } = useSettings();
  const toast = useToast();

  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const selectedLines = invoice.lines.filter((l) => (quantities[l.id] || 0) > 0);
  const total = selectedLines.reduce(
    (acc, l) => acc + (quantities[l.id] || 0) * l.price,
    0
  );

  function handleSave() {
    if (selectedLines.length === 0) {
      toast.error("الرجاء تحديد كميات للإرجاع");
      return;
    }

    const returnLines: ReturnLine[] = selectedLines.map((l) => {
      const q = quantities[l.id] || 0;
      return {
        id: uid("rl"),
        sourceLineId: l.id,
        productId: l.productId,
        productName: l.productName,
        unit: l.unit,
        quantity: q,
        price: l.price,
        subtotal: q * l.price,
      };
    });

    addPurchaseReturn({
      date: todayISO(),
      originalInvoiceId: invoice.id,
      originalInvoiceNumber: invoice.invoiceNumber,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      lines: returnLines,
      total,
    });

    toast.success("تم إنشاء مرتجع توريد بنجاح");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`إنشاء مرتجع - فاتورة ${invoice.invoiceNumber}`}
      width="lg"
      footer={
        <>
          <div className="flex-1 text-right text-lg font-bold text-slate-900">
            الإجمالي: {formatCurrency(total, settings.currency)}
          </div>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={total === 0}>
            اعتماد المرتجع
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Table>
          <THead>
            <TR>
              <TH>المنتج</TH>
              <TH>السعر</TH>
              <TH>الكمية المتاحة</TH>
              <TH className="w-32">كمية الإرجاع</TH>
              <TH className="text-end">القيمة</TH>
            </TR>
          </THead>
          <TBody>
            {invoice.lines.map((l) => {
              const q = quantities[l.id] || 0;
              return (
                <TR key={l.id}>
                  <TD>{l.productName}</TD>
                  <TD>{formatCurrency(l.price, settings.currency)}</TD>
                  <TD>{l.quantity}</TD>
                  <TD>
                    <input
                      type="number"
                      min={0}
                      max={l.quantity}
                      className="w-full border-slate-200 rounded-md text-sm p-1.5 focus:border-brand-500 focus:ring-brand-500"
                      value={q || ""}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (val < 0) val = 0;
                        if (val > l.quantity) val = l.quantity;
                        setQuantities((prev) => ({ ...prev, [l.id]: val }));
                      }}
                    />
                  </TD>
                  <TD className="text-end font-medium">
                    {formatCurrency(q * l.price, settings.currency)}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-600">
          سيتم خصم قيمة المرتجع تلقائياً من رصيد حساب المورد.
        </div>
      </div>
    </Dialog>
  );
}

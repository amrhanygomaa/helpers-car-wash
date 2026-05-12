import { useParams } from "react-router-dom";
import { useApp } from "../store/AppContext";
import { InvoicePrintLayout } from "../features/invoices/InvoicePrintLayout";

export function PurchaseInvoicePrintPage() {
  const { id } = useParams();
  const { purchaseInvoices } = useApp();
  const inv = purchaseInvoices.find((s) => s.id === id);
  if (!inv) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        الفاتورة غير موجودة
      </div>
    );
  }
  return (
    <InvoicePrintLayout
      kind="purchase"
      invoiceNumber={inv.invoiceNumber}
      date={inv.date}
      partyLabel="المورد"
      partyName={inv.supplierName}
      lines={inv.lines}
      total={inv.total}
      amountPaid={inv.amountPaid}
      remaining={inv.remaining}
      notes={inv.notes}
      paymentLabel={inv.status === "paid" ? "مسدد" : inv.status === "partial" ? "جزئي" : "آجل"}
    />
  );
}

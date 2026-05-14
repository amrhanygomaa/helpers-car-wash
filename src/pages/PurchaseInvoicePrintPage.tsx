import { useParams } from "react-router-dom";
import { useApp } from "../store/AppContext";
import { InvoicePrintLayout } from "../features/invoices/InvoicePrintLayout";
import { hasPermission } from "../lib/permissions";

export function PurchaseInvoicePrintPage() {
  const { id } = useParams();
  const { purchaseInvoices, currentUser, auth } = useApp();
  if (!auth.isAuthenticated || !hasPermission(currentUser, "purchaseInvoices")) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        ليس لديك صلاحية لعرض الفاتورة
      </div>
    );
  }
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

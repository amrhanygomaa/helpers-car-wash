import { useParams } from "react-router-dom";
import { useApp } from "../store/AppContext";
import { InvoicePrintLayout } from "../features/invoices/InvoicePrintLayout";

export function SalesInvoicePrintPage() {
  const { id } = useParams();
  const { salesInvoices } = useApp();
  const inv = salesInvoices.find((s) => s.id === id);
  if (!inv) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        الفاتورة غير موجودة
      </div>
    );
  }
  return (
    <InvoicePrintLayout
      kind="sales"
      invoiceNumber={inv.invoiceNumber}
      date={inv.date}
      partyLabel="العميل"
      partyName={inv.customerName}
      driverName={inv.driverName}
      lines={inv.lines}
      total={inv.total}
      amountPaid={inv.amountReceived}
      remaining={inv.remaining}
      notes={inv.notes}
      paymentLabel={inv.paymentType === "cash" ? "نقدي" : "آجل (حساب)"}
    />
  );
}

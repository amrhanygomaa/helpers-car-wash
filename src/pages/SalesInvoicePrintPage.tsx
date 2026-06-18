import { useParams } from "react-router-dom";
import { useInvoicing } from "../store/InvoicingContext";
import { useAuth } from "../store/AuthContext";
import { useReporting } from "../store/ReportingContext";
import { InvoicePrintLayout } from "../features/invoices/InvoicePrintLayout";
import { hasPermission } from "../lib/permissions";

export function SalesInvoicePrintPage() {
  const { id } = useParams();
  const { salesInvoices, salesReturns } = useInvoicing();
  const { currentUser, auth } = useAuth();
  const { customerBalance } = useReporting();
  if (!auth.isAuthenticated || !hasPermission(currentUser, "salesInvoices")) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        ليس لديك صلاحية لعرض الفاتورة
      </div>
    );
  }
  const inv = salesInvoices.find((s) => s.id === id);
  if (!inv) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        الفاتورة غير موجودة
      </div>
    );
  }
  const invoiceReturns = salesReturns.filter((r) => r.originalInvoiceId === inv.id);
  const effectiveRemaining = inv.remaining;
  const totalBalance = customerBalance(inv.customerId);
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
      discount={inv.discount}
      amountPaid={inv.amountReceived}
      remaining={effectiveRemaining}
      notes={inv.notes}
      paymentLabel={inv.paymentType === "cash" ? "نقدي" : "آجل (حساب)"}
      priceTypeLabel={inv.priceType === "retail" ? "تجزئة" : "جملة"}
      returns={invoiceReturns.length > 0 ? invoiceReturns : undefined}
      paymentDueDate={inv.paymentDueDate}
      customerBalance={totalBalance}
      customerName={inv.customerName}
      paymentLog={inv.paymentLog}
      overpayment={inv.overpayment}
    />
  );
}

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { hasPermission } from "../lib/permissions";
import { StatementPrintLayout, type StatementRow } from "../features/invoices/StatementPrintLayout";

export function CustomerStatementPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { salesInvoices, salesReturns, cashEntries } = useInvoicing();
  const { customers } = useCatalog();
  const { currentUser, auth } = useAuth();

  const customer = customers.find((c) => c.id === id);

  const rows = useMemo<StatementRow[]>(() => {
    if (!id) return [];
    const invoices = salesInvoices.filter((inv) => inv.customerId === id && !inv.cancelled);
    const invoiceIds = new Set(invoices.map((inv) => inv.id));
    const partyReturns = salesReturns.filter(
      (r) => r.customerId === id && invoiceIds.has(r.originalInvoiceId)
    );

    const raw: Omit<StatementRow, "balance">[] = [
      // Debit: invoices
      ...invoices.map((inv) => ({
        key: `inv-${inv.id}`,
        date: inv.date,
        sortKey: `${inv.date}-0-${inv.invoiceNumber}`,
        description: `فاتورة ${inv.invoiceNumber}`,
        madin: inv.total,
        daen: 0,
      })),
      // Credit: cash entries linked to invoices (payments / update-deltas)
      ...cashEntries
        .filter((ce) => ce.referenceId != null && invoiceIds.has(ce.referenceId))
        .map((ce) => ({
          key: `cash-${ce.id}`,
          date: ce.date,
          sortKey: `${ce.date}-5-${ce.id}`,
          description: ce.description,
          madin: ce.amount < 0 ? Math.abs(ce.amount) : 0,
          daen: ce.amount > 0 ? ce.amount : 0,
        })),
      // Credit-only returns (refundCash = false)
      ...partyReturns
        .filter((r) => !r.refundCash)
        .map((r) => ({
          key: `ret-${r.id}`,
          date: r.date,
          sortKey: `${r.date}-3-${r.returnNumber}`,
          description: `مرتجع ${r.returnNumber}`,
          madin: 0,
          daen: r.total,
        })),
      // Cash returns: both madin and daen (net 0 change to balance — goods back + cash returned)
      ...partyReturns
        .filter((r) => r.refundCash)
        .map((r) => ({
          key: `ret-cash-${r.id}`,
          date: r.date,
          sortKey: `${r.date}-3-${r.returnNumber}`,
          description: `مرتجع نقدي ${r.returnNumber}`,
          madin: r.total,
          daen: r.total,
        })),
    ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    let balance = 0;
    return raw.map((r) => {
      balance += r.madin - r.daen;
      return { ...r, balance };
    });
  }, [id, salesInvoices, salesReturns, cashEntries]);

  if (!auth.isAuthenticated || !hasPermission(currentUser, "salesInvoices")) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500" dir="rtl">
        ليس لديك صلاحية لعرض هذا التقرير
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500" dir="rtl">
        العميل غير موجود
      </div>
    );
  }

  return (
    <StatementPrintLayout
      kind="customer"
      partyName={customer.name}
      partyCode={customer.code}
      partyPhone={customer.phone}
      rows={rows}
    />
  );
}

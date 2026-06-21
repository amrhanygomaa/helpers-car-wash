import type {
  Product,
  InvoiceLine,
  SalesInvoice,
  PurchaseInvoice,
  SalesReturn,
  PurchaseReturn,
  ReturnLine,
  CashEntry,
  WashService,
  ID,
} from "../types";

export type PaymentStatusResult = "paid" | "partial" | "unpaid";

export function computeStatus(total: number, paid: number): PaymentStatusResult {
  if (total <= 0) return "paid";
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

export function applyPieceDeduction(p: Product, pieces: number): Partial<Product> {
  const ppu = p.piecesPerUnit!;
  const loose = p.looseQuantity ?? 0;
  if (loose >= pieces) {
    return { quantity: p.quantity, looseQuantity: loose - pieces };
  }
  const needed = pieces - loose;
  const cartonsToOpen = Math.ceil(needed / ppu);
  return {
    quantity: Math.max(0, p.quantity - cartonsToOpen),
    looseQuantity: cartonsToOpen * ppu - needed,
  };
}

export function applyPieceAddition(p: Product, pieces: number): Partial<Product> {
  const ppu = p.piecesPerUnit!;
  const newLoose = (p.looseQuantity ?? 0) + pieces;
  const fullCartons = Math.floor(newLoose / ppu);
  return {
    quantity: p.quantity + fullCartons,
    looseQuantity: newLoose - fullCartons * ppu,
  };
}

/** A net inventory deduction caused by performing service lines on an invoice. */
export interface MaterialConsumption {
  productId: ID;
  /** Total quantity to consume, already multiplied by each service line's quantity. */
  quantity: number;
  /** When true, quantity is in pieces (piece-aware deduction); else in base units. */
  isRetailUnit?: boolean;
}

/**
 * Expands the service lines of an invoice into the aggregated inventory
 * consumption from each service's linked materials (BOM). Product lines and
 * services without materials contribute nothing. Quantities are summed per
 * (product, unit-mode) so a material shared by two services is deducted once.
 * Pure + side-effect free so it can be unit-tested in isolation (Car Wash —
 * feature 7).
 */
export function expandServiceMaterials(
  lines: Pick<InvoiceLine, "kind" | "serviceId" | "quantity">[],
  services: Pick<WashService, "id" | "materials">[],
): MaterialConsumption[] {
  const byKey = new Map<string, MaterialConsumption>();
  for (const line of lines) {
    if (line.kind !== "service" || !line.serviceId) continue;
    const svc = services.find((s) => s.id === line.serviceId);
    if (!svc?.materials?.length) continue;
    const lineQty = line.quantity > 0 ? line.quantity : 1;
    for (const m of svc.materials) {
      if (!m.productId || m.quantity <= 0) continue;
      const key = `${m.productId}__${m.isRetailUnit ? "piece" : "unit"}`;
      const qty = m.quantity * lineQty;
      const existing = byKey.get(key);
      if (existing) existing.quantity += qty;
      else byKey.set(key, { productId: m.productId, quantity: qty, isRetailUnit: m.isRetailUnit });
    }
  }
  return [...byKey.values()];
}

/** Per-employee service performance over a date range (Car Wash — features 5 + 8). */
export interface EmployeeServiceStats {
  carsWashed: number;
  servicesPerformed: number;
  attributedRevenue: number;
}

/**
 * Sums the work a single employee performed on car-wash service invoices in
 * [from, to] (inclusive). A "car washed" is a distinct non-cancelled service
 * invoice on which the employee performed at least one line; "services
 * performed" counts the service lines (× their quantity); "attributed revenue"
 * sums those lines' subtotals — the base for that employee's commission. Pure +
 * testable.
 */
export function employeeServiceStats(
  invoices: Pick<SalesInvoice, "id" | "date" | "cancelled" | "invoiceKind" | "lines">[],
  userId: string,
  from: string,
  to: string,
): EmployeeServiceStats {
  let carsWashed = 0;
  let servicesPerformed = 0;
  let attributedRevenue = 0;
  for (const inv of invoices) {
    if (inv.cancelled) continue;
    if (inv.invoiceKind !== "service") continue;
    if (inv.date < from || inv.date > to) continue;
    let touchedThisInvoice = false;
    for (const line of inv.lines) {
      if (line.kind !== "service" || line.employeeId !== userId) continue;
      touchedThisInvoice = true;
      servicesPerformed += line.quantity > 0 ? line.quantity : 1;
      attributedRevenue += line.subtotal;
    }
    if (touchedThisInvoice) carsWashed += 1;
  }
  return { carsWashed, servicesPerformed, attributedRevenue };
}

export function applyReturnToInvoiceLines(lines: InvoiceLine[], returns: ReturnLine[]) {
  const remainingByLine = new Map<string, number>();
  const remainingByProduct = new Map<string, number>();

  returns.forEach((line) => {
    if (line.sourceLineId) {
      remainingByLine.set(
        line.sourceLineId,
        (remainingByLine.get(line.sourceLineId) ?? 0) + line.quantity,
      );
      return;
    }
    remainingByProduct.set(
      line.productId,
      (remainingByProduct.get(line.productId) ?? 0) + line.quantity,
    );
  });

  let appliedTotal = 0;
  const nextLines = lines
    .map((line) => {
      const lineReturnQty = remainingByLine.get(line.id);
      const productReturnQty =
        lineReturnQty === undefined ? remainingByProduct.get(line.productId) : undefined;
      const requestedReturnQty = lineReturnQty ?? productReturnQty ?? 0;
      const appliedQty = Math.min(line.quantity, Math.max(0, requestedReturnQty));

      if (lineReturnQty !== undefined) {
        remainingByLine.set(line.id, Math.max(0, lineReturnQty - appliedQty));
      } else if (productReturnQty !== undefined) {
        remainingByProduct.set(line.productId, Math.max(0, productReturnQty - appliedQty));
      }

      appliedTotal += appliedQty * line.price;
      const quantity = Math.max(0, line.quantity - appliedQty);
      return { ...line, quantity, subtotal: quantity * line.price };
    })
    .filter((line) => line.quantity > 0);

  const total = nextLines.reduce((sum, line) => sum + line.subtotal, 0);
  return { lines: nextLines, total, appliedTotal };
}

export function quotationConversionFields(
  quot: { total: number },
  amountReceived: number,
) {
  // quot.total is already net of the quotation discount (QuotationNewPage stores
  // subtotal − discount), so the invoice total must NOT subtract it again.
  const requested = Math.max(0, amountReceived);
  const received = Math.min(requested, quot.total);
  return {
    total: quot.total,
    amountReceived: received,
    overpayment: Math.max(0, requested - quot.total),
  };
}

/**
 * Net cash an employee actually collected in [from, to] (inclusive):
 * receipts + edit/cancellation adjustments on the employee's invoices, plus
 * refund adjustments on returns of those invoices. This is THE single
 * definition of the employee commission base — EmployeeReportPage (quarters)
 * and ReportsPage (free date range) must both use it (OBS-02, report 09).
 */
export function employeeCollectedCash(
  salesInvoices: Pick<SalesInvoice, "id" | "createdByUserId" | "cancelled">[],
  salesReturns: Pick<SalesReturn, "id" | "originalInvoiceId">[],
  cashEntries: Pick<CashEntry, "referenceId" | "date" | "type" | "amount">[],
  userId: string,
  from: string,
  to: string,
): number {
  const empInvoiceIds = new Set(
    salesInvoices
      .filter((inv) => inv.createdByUserId === userId && !inv.cancelled)
      .map((inv) => inv.id),
  );
  const empReturnIds = new Set(
    salesReturns
      .filter((r) => r.originalInvoiceId != null && empInvoiceIds.has(r.originalInvoiceId))
      .map((r) => r.id),
  );
  return cashEntries
    .filter(
      (ce) =>
        ce.referenceId != null &&
        ce.date >= from &&
        ce.date <= to &&
        ((empInvoiceIds.has(ce.referenceId) &&
          (ce.type === "sales-receipt" || ce.type === "adjustment")) ||
          (empReturnIds.has(ce.referenceId) && ce.type === "adjustment")),
    )
    .reduce((sum, ce) => sum + ce.amount, 0);
}

export function settleSalesInvoiceReturn(
  invoice: SalesInvoice,
  ret: Pick<SalesReturn, "lines" | "total" | "refundCash">,
  /** Cumulative total of ALL previous returns on this invoice (FIX-02). */
  previousReturnsTotal = 0,
) {
  // Keep original lines and total unchanged — returns are shown as separate records.
  // FIX-02: effectiveTotal must account for ALL returns (previous + current),
  // not just the current one. Without this, a 2nd return on the same invoice
  // would compute effectiveTotal = originalTotal − currentReturn, ignoring
  // the amount already reduced by earlier returns.
  const totalReturned = previousReturnsTotal + ret.total;
  const returnTotal = Math.min(invoice.total, totalReturned);
  const paidAndCredit = invoice.amountReceived + (invoice.overpayment ?? 0);
  const cashRefund = ret.refundCash ? Math.min(ret.total, paidAndCredit) : 0;
  const paidAndCreditAfterReturn = Math.max(0, paidAndCredit - cashRefund);
  const effectiveTotal = Math.max(0, invoice.total - returnTotal);
  const amountReceived = Math.min(effectiveTotal, paidAndCreditAfterReturn);
  const overpayment = Math.max(0, paidAndCreditAfterReturn - amountReceived);
  const remaining = Math.max(0, effectiveTotal - amountReceived);

  return {
    invoice: {
      ...invoice,
      amountReceived,
      remaining,
      status: computeStatus(effectiveTotal, amountReceived),
      overpayment: overpayment > 0 ? overpayment : undefined,
      paymentDueDate: remaining > 0 ? invoice.paymentDueDate : undefined,
    },
    cashRefund,
  };
}

export function settlePurchaseInvoiceReturn(
  invoice: PurchaseInvoice,
  ret: Pick<PurchaseReturn, "lines" | "total">,
) {
  const adjusted = applyReturnToInvoiceLines(invoice.lines, ret.lines);
  const paidAndCredit = invoice.amountPaid + (invoice.overpayment ?? 0);
  const amountPaid = Math.min(adjusted.total, paidAndCredit);
  const overpayment = Math.max(0, paidAndCredit - amountPaid);
  const remaining = Math.max(0, adjusted.total - amountPaid);

  return {
    ...invoice,
    lines: adjusted.lines,
    total: adjusted.total,
    amountPaid,
    remaining,
    status: computeStatus(adjusted.total, amountPaid),
    overpayment: overpayment > 0 ? overpayment : undefined,
  };
}

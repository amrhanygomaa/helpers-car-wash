import type {
  Product,
  InvoiceLine,
  SalesInvoice,
  PurchaseInvoice,
  SalesReturn,
  PurchaseReturn,
  ReturnLine,
  CashEntry,
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
  ret: Pick<SalesReturn, "total" | "refundCash">,
) {
  let cashRefund = 0;
  let remaining = invoice.remaining;
  let amountReceived = invoice.amountReceived;
  let overpayment = invoice.overpayment ?? 0;

  // 1. The return reduces what the customer owes first.
  const deductFromRemaining = Math.min(remaining, ret.total);
  remaining -= deductFromRemaining;
  const leftToApply = ret.total - deductFromRemaining;

  // 2. If there's still return value left, it means it eats into what they already paid.
  if (leftToApply > 0) {
    const deductFromReceived = Math.min(amountReceived, leftToApply);
    amountReceived -= deductFromReceived;
    overpayment += leftToApply; // It turns into credit
  }

  // 3. If refundCash is requested, we refund from the available credit (overpayment)
  if (ret.refundCash && overpayment > 0) {
    cashRefund = Math.min(ret.total, overpayment);
    overpayment -= cashRefund;
  }

  return {
    invoice: {
      ...invoice,
      amountReceived,
      remaining,
      status: (remaining <= 0 ? "paid" : amountReceived <= 0 ? "unpaid" : "partial") as "paid" | "unpaid" | "partial",
      overpayment: overpayment > 0 ? overpayment : undefined,
      paymentDueDate: remaining > 0 ? invoice.paymentDueDate : undefined,
    },
    cashRefund,
  };
}

export function settlePurchaseInvoiceReturn(
  invoice: PurchaseInvoice,
  ret: Pick<PurchaseReturn, "total">,
) {
  let remaining = invoice.remaining;
  let amountPaid = invoice.amountPaid;
  let overpayment = invoice.overpayment ?? 0;

  // 1. The return reduces what we owe the supplier first.
  const deductFromRemaining = Math.min(remaining, ret.total);
  remaining -= deductFromRemaining;
  const leftToApply = ret.total - deductFromRemaining;

  // 2. If there's still return value left, it eats into what we already paid.
  if (leftToApply > 0) {
    const deductFromPaid = Math.min(amountPaid, leftToApply);
    amountPaid -= deductFromPaid;
    overpayment += leftToApply; // It turns into supplier credit
  }

  // Purchase returns don't handle cash refunds natively yet.
  // Overpayment remains as supplier credit.

  return {
    ...invoice,
    amountPaid,
    remaining,
    status: (remaining <= 0 ? "paid" : amountPaid <= 0 ? "unpaid" : "partial") as "paid" | "unpaid" | "partial",
    overpayment: overpayment > 0 ? overpayment : undefined,
  };
}

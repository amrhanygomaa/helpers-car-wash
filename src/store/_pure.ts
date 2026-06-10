import type {
  Product,
  InvoiceLine,
  SalesInvoice,
  PurchaseInvoice,
  SalesReturn,
  PurchaseReturn,
  ReturnLine,
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

export function settleSalesInvoiceReturn(
  invoice: SalesInvoice,
  ret: Pick<SalesReturn, "lines" | "total" | "refundCash">,
) {
  // Keep original lines and total unchanged — returns are shown as separate records.
  const returnTotal = Math.min(invoice.total, ret.total);
  const paidAndCredit = invoice.amountReceived + (invoice.overpayment ?? 0);
  const cashRefund = ret.refundCash ? Math.min(returnTotal, paidAndCredit) : 0;
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

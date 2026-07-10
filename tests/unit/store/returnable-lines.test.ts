import { describe, it, expect } from "vitest";
import { returnableProductLines } from "../../../src/store/_pure";
import type { InvoiceLine, ReturnLine, SalesInvoice, SalesReturn } from "../../../src/types";

function line(partial: Partial<InvoiceLine> & { id: string }): InvoiceLine {
  return {
    productId: "",
    productName: "بند",
    unit: "قطعة",
    quantity: 1,
    price: 10,
    subtotal: 10,
    ...partial,
  };
}

function productLine(id: string, productId: string, quantity: number): InvoiceLine {
  return line({ id, productId, quantity, kind: "product", productName: `منتج ${productId}` });
}

function serviceLine(id: string): InvoiceLine {
  return line({ id, kind: "service", serviceId: "svc", productName: "غسيل خارجي" });
}

function invoice(partial: Partial<SalesInvoice>): Pick<SalesInvoice, "id" | "lines" | "cancelled"> {
  return { id: "inv-1", lines: [], cancelled: undefined, ...partial };
}

function ret(
  originalInvoiceId: string,
  lines: Array<Partial<ReturnLine> & { productId: string; quantity: number }>
): Pick<SalesReturn, "originalInvoiceId" | "lines"> {
  return {
    originalInvoiceId,
    lines: lines.map((l, i) => ({
      id: `rl-${i}`,
      productName: "منتج",
      unit: "قطعة",
      price: 10,
      subtotal: 10 * l.quantity,
      ...l,
    })),
  };
}

describe("returnableProductLines — TC-RET-LINES", () => {
  it("returns product lines only — services are never returnable", () => {
    const inv = invoice({
      lines: [serviceLine("l1"), productLine("l2", "p1", 2), serviceLine("l3")],
    });
    const rows = returnableProductLines(inv, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ soldQty: 2, returnedQty: 0, returnableQty: 2 });
    expect(rows[0].line.id).toBe("l2");
  });

  it("subtracts previous returns matched by sourceLineId", () => {
    const inv = invoice({ lines: [productLine("l1", "p1", 5)] });
    const prior = [ret("inv-1", [{ productId: "p1", quantity: 3, sourceLineId: "l1" }])];
    const rows = returnableProductLines(inv, prior);
    expect(rows[0]).toMatchObject({ soldQty: 5, returnedQty: 3, returnableQty: 2 });
  });

  it("falls back to productId matching for legacy returns without sourceLineId", () => {
    const inv = invoice({ lines: [productLine("l1", "p1", 4)] });
    const prior = [ret("inv-1", [{ productId: "p1", quantity: 4 }])];
    expect(returnableProductLines(inv, prior)[0].returnableQty).toBe(0);
  });

  it("ignores returns that belong to other invoices", () => {
    const inv = invoice({ lines: [productLine("l1", "p1", 3)] });
    const prior = [ret("inv-OTHER", [{ productId: "p1", quantity: 3, sourceLineId: "l1" }])];
    expect(returnableProductLines(inv, prior)[0].returnableQty).toBe(3);
  });

  it("never goes negative when over-returned data exists", () => {
    const inv = invoice({ lines: [productLine("l1", "p1", 2)] });
    const prior = [ret("inv-1", [{ productId: "p1", quantity: 99, sourceLineId: "l1" }])];
    expect(returnableProductLines(inv, prior)[0].returnableQty).toBe(0);
  });

  it("returns nothing for a cancelled invoice — its stock was already restored", () => {
    const inv = invoice({ cancelled: true, lines: [productLine("l1", "p1", 2)] });
    expect(returnableProductLines(inv, [])).toHaveLength(0);
  });

  it("accumulates multiple partial returns on the same line", () => {
    const inv = invoice({ lines: [productLine("l1", "p1", 6)] });
    const prior = [
      ret("inv-1", [{ productId: "p1", quantity: 2, sourceLineId: "l1" }]),
      ret("inv-1", [{ productId: "p1", quantity: 3, sourceLineId: "l1" }]),
    ];
    expect(returnableProductLines(inv, prior)[0]).toMatchObject({
      returnedQty: 5,
      returnableQty: 1,
    });
  });
});

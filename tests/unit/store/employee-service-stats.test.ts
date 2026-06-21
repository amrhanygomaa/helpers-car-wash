import { describe, it, expect } from "vitest";
import { employeeServiceStats } from "../../../src/store/_pure";
import type { InvoiceLine, SalesInvoice } from "../../../src/types";

function svcLine(employeeId: string | undefined, subtotal: number, quantity = 1): InvoiceLine {
  return {
    id: Math.random().toString(36).slice(2),
    productId: "",
    productName: "خدمة",
    unit: "خدمة",
    quantity,
    price: subtotal / quantity,
    subtotal,
    kind: "service",
    serviceId: "svc",
    employeeId,
    employeeName: employeeId,
  };
}

function inv(partial: Partial<SalesInvoice>): SalesInvoice {
  return {
    id: Math.random().toString(36).slice(2),
    invoiceNumber: "INV-1",
    date: "2026-06-20",
    customerId: "c1",
    customerName: "عميل",
    lines: [],
    total: 0,
    amountReceived: 0,
    remaining: 0,
    paymentType: "cash",
    priceType: "retail",
    status: "paid",
    invoiceKind: "service",
    ...partial,
  };
}

const A = "emp-a";
const B = "emp-b";

describe("employeeServiceStats", () => {
  it("attributes lines to the performing employee", () => {
    const invoices = [
      inv({ date: "2026-06-20", lines: [svcLine(A, 100), svcLine(B, 50)] }),
      inv({ date: "2026-06-20", lines: [svcLine(A, 80)] }),
    ];
    const a = employeeServiceStats(invoices, A, "2026-06-01", "2026-06-30");
    expect(a).toEqual({ carsWashed: 2, servicesPerformed: 2, attributedRevenue: 180 });
    const b = employeeServiceStats(invoices, B, "2026-06-01", "2026-06-30");
    expect(b).toEqual({ carsWashed: 1, servicesPerformed: 1, attributedRevenue: 50 });
  });

  it("counts service quantity in servicesPerformed", () => {
    const invoices = [inv({ lines: [svcLine(A, 200, 2)] })];
    expect(employeeServiceStats(invoices, A, "2026-06-01", "2026-06-30").servicesPerformed).toBe(2);
  });

  it("excludes cancelled invoices, product invoices and out-of-range dates", () => {
    const invoices = [
      inv({ cancelled: true, lines: [svcLine(A, 100)] }),
      inv({ invoiceKind: "product", lines: [svcLine(A, 100)] }),
      inv({ date: "2026-05-30", lines: [svcLine(A, 100)] }),
    ];
    expect(employeeServiceStats(invoices, A, "2026-06-01", "2026-06-30")).toEqual({
      carsWashed: 0,
      servicesPerformed: 0,
      attributedRevenue: 0,
    });
  });

  it("counts one car even when an employee performs multiple lines on it", () => {
    const invoices = [inv({ lines: [svcLine(A, 100), svcLine(A, 60)] })];
    const a = employeeServiceStats(invoices, A, "2026-06-01", "2026-06-30");
    expect(a.carsWashed).toBe(1);
    expect(a.servicesPerformed).toBe(2);
    expect(a.attributedRevenue).toBe(160);
  });
});

import { describe, it, expect } from "vitest";
import { expandServiceMaterials } from "../../../src/store/_pure";
import type { InvoiceLine, WashService } from "../../../src/types";

function line(partial: Partial<InvoiceLine>): InvoiceLine {
  return {
    id: "l1",
    productId: "",
    productName: "x",
    unit: "خدمة",
    quantity: 1,
    price: 0,
    subtotal: 0,
    ...partial,
  };
}

const shampoo = "mat-shampoo";
const wax = "mat-wax";

const services: Pick<WashService, "id" | "materials">[] = [
  {
    id: "svc-ext",
    materials: [
      { id: "m1", materialId: shampoo, quantity: 50 },
      { id: "m2", materialId: wax, quantity: 20, isRetailUnit: true },
    ],
  },
  {
    id: "svc-int",
    materials: [{ id: "m3", materialId: shampoo, quantity: 30 }],
  },
  { id: "svc-nomat", materials: [] },
];

describe("expandServiceMaterials", () => {
  it("ignores product lines and services without materials", () => {
    const result = expandServiceMaterials(
      [
        line({ kind: "product", productId: "p1", quantity: 5 }),
        line({ kind: "service", serviceId: "svc-nomat" }),
      ],
      services,
    );
    expect(result).toEqual([]);
  });

  it("expands a single service line into its materials", () => {
    const result = expandServiceMaterials([line({ kind: "service", serviceId: "svc-ext" })], services);
    expect(result).toEqual([
      { materialId: shampoo, quantity: 50, isRetailUnit: undefined },
      { materialId: wax, quantity: 20, isRetailUnit: true },
    ]);
  });

  it("multiplies material quantity by the service line quantity", () => {
    const result = expandServiceMaterials(
      [line({ kind: "service", serviceId: "svc-ext", quantity: 3 })],
      services,
    );
    expect(result.find((r) => r.materialId === shampoo)?.quantity).toBe(150);
    expect(result.find((r) => r.materialId === wax)?.quantity).toBe(60);
  });

  it("aggregates the same material across services but keeps unit modes separate", () => {
    const result = expandServiceMaterials(
      [
        line({ id: "a", kind: "service", serviceId: "svc-ext" }), // shampoo 50 (unit) + wax 20 (piece)
        line({ id: "b", kind: "service", serviceId: "svc-int" }), // shampoo 30 (unit)
      ],
      services,
    );
    // shampoo combined into one unit-mode row, wax stays its own piece-mode row
    expect(result.find((r) => r.materialId === shampoo && !r.isRetailUnit)?.quantity).toBe(80);
    expect(result.find((r) => r.materialId === wax && r.isRetailUnit)?.quantity).toBe(20);
  });

  it("skips materials with non-positive quantity and lines without a serviceId", () => {
    const dirty: Pick<WashService, "id" | "materials">[] = [
      { id: "svc-x", materials: [{ id: "m", materialId: "p", quantity: 0 }] },
    ];
    expect(expandServiceMaterials([line({ kind: "service", serviceId: "svc-x" })], dirty)).toEqual([]);
    expect(expandServiceMaterials([line({ kind: "service" })], services)).toEqual([]);
  });
});

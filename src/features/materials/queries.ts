import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { materialMovements, rawMaterials } from "../../db/schema";
import type { MaterialMovement, RawMaterial } from "../../db/schema";

export type { MaterialMovement, RawMaterial };

export function listAllRawMaterials(): Promise<RawMaterial[]> {
  return db.select().from(rawMaterials).orderBy(asc(rawMaterials.name));
}

export function listActiveRawMaterials(): Promise<RawMaterial[]> {
  return db
    .select()
    .from(rawMaterials)
    .where(eq(rawMaterials.active, true))
    .orderBy(asc(rawMaterials.name));
}

export async function createRawMaterial(data: {
  id: string;
  name: string;
  unit: string;
  unitCost?: number;
  stockQty?: number;
  lowStockThreshold?: number;
  active?: boolean;
}): Promise<void> {
  await db.insert(rawMaterials).values({
    id: data.id,
    name: data.name,
    unit: data.unit || "piece",
    unitCost: data.unitCost ?? 0,
    stockQty: data.stockQty ?? 0,
    lowStockThreshold: data.lowStockThreshold ?? 5,
    active: data.active ?? true,
  });
}

export async function updateRawMaterial(
  id: string,
  patch: Partial<{
    name: string;
    unit: string;
    unitCost: number;
    stockQty: number;
    lowStockThreshold: number;
    active: boolean;
  }>
): Promise<void> {
  await db.update(rawMaterials).set(patch).where(eq(rawMaterials.id, id));
}

const MAIN_BRANCH_ID = "branch-main";

export async function recordMaterialPurchase(opts: {
  movementId: string;
  materialId: string;
  qty: number;
  unitCost: number;
  branchId?: string;
  businessDate: string;
  byUserId?: string;
  createdAt: string;
}): Promise<void> {
  if (opts.qty <= 0) throw new Error("invalid_quantity");

  const rows = await db.select().from(rawMaterials).where(eq(rawMaterials.id, opts.materialId));
  const material = rows[0];
  if (!material) throw new Error("material_not_found");

  await db.batch([
    db
      .update(rawMaterials)
      .set({ stockQty: material.stockQty + opts.qty, unitCost: opts.unitCost })
      .where(eq(rawMaterials.id, opts.materialId)),
    db.insert(materialMovements).values({
      id: opts.movementId,
      materialId: opts.materialId,
      type: "purchase",
      qty: opts.qty,
      unitCost: opts.unitCost,
      branchId: opts.branchId ?? MAIN_BRANCH_ID,
      byUserId: opts.byUserId ?? null,
      businessDate: opts.businessDate,
      createdAt: opts.createdAt,
    }),
  ]);
}

export async function recordMaterialConsumption(opts: {
  movementId: string;
  materialId: string;
  qty: number;
  unitCost: number;
  branchId?: string;
  businessDate: string;
  byWorkerId?: string;
  byUserId?: string;
  createdAt: string;
}): Promise<void> {
  const rows = await db.select().from(rawMaterials).where(eq(rawMaterials.id, opts.materialId));
  const material = rows[0];
  if (!material) throw new Error("material_not_found");
  if (opts.qty <= 0) throw new Error("invalid_quantity");
  if (material.stockQty < opts.qty) throw new Error("insufficient_stock");

  await db.batch([
    db
      .update(rawMaterials)
      .set({ stockQty: material.stockQty - opts.qty })
      .where(eq(rawMaterials.id, opts.materialId)),
    db.insert(materialMovements).values({
      id: opts.movementId,
      materialId: opts.materialId,
      type: "consumption",
      qty: -opts.qty,
      unitCost: opts.unitCost,
      branchId: opts.branchId ?? MAIN_BRANCH_ID,
      byWorkerId: opts.byWorkerId ?? null,
      byUserId: opts.byUserId ?? null,
      businessDate: opts.businessDate,
      createdAt: opts.createdAt,
    }),
  ]);
}

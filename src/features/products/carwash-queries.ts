import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { products, productMovements } from "../../db/schema";
import type { Product } from "../../db/schema";

export type { Product };

export function listAllCarwashProducts(): Promise<Product[]> {
  return db.select().from(products);
}

export function listActiveCarwashProducts(): Promise<Product[]> {
  return db.select().from(products).where(eq(products.active, true));
}

export async function createCarwashProduct(data: {
  id: string;
  name: string;
  salePrice: number;
  purchasePrice?: number;
  lowStockThreshold?: number;
  active?: boolean;
}): Promise<void> {
  await db.insert(products).values({
    id: data.id,
    name: data.name,
    salePrice: data.salePrice,
    purchasePrice: data.purchasePrice ?? 0,
    stockQty: 0,
    lowStockThreshold: data.lowStockThreshold ?? 5,
    active: data.active ?? true,
  });
}

export async function updateCarwashProduct(
  id: string,
  patch: Partial<{
    name: string;
    salePrice: number;
    purchasePrice: number;
    stockQty: number;
    lowStockThreshold: number;
    active: boolean;
  }>
): Promise<void> {
  await db.update(products).set(patch).where(eq(products.id, id));
}

const MAIN_BRANCH_ID = "branch-main";

/** Increment stock + write a purchase movement in one batch (FR-PROD-3). */
export async function recordRestock(opts: {
  movementId: string;
  productId: string;
  qty: number;
  unitPrice: number;
  branchId?: string;
  businessDate: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  await db.batch([
    db
      .update(products)
      .set({ stockQty: sql`stock_qty + ${opts.qty}` })
      .where(eq(products.id, opts.productId)),
    db.insert(productMovements).values({
      id: opts.movementId,
      productId: opts.productId,
      type: "purchase",
      qty: opts.qty,
      unitPrice: opts.unitPrice,
      branchId: opts.branchId ?? MAIN_BRANCH_ID,
      businessDate: opts.businessDate,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
  ]);
}

/** Decrement stock + write a sale movement in one batch (FR-PROD-3). Stock floor = 0. */
export async function recordProductSale(opts: {
  movementId: string;
  productId: string;
  qty: number;
  unitPrice: number;
  orderId?: string;
  branchId?: string;
  businessDate: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  await db.batch([
    db
      .update(products)
      .set({ stockQty: sql`MAX(0, stock_qty - ${opts.qty})` })
      .where(eq(products.id, opts.productId)),
    db.insert(productMovements).values({
      id: opts.movementId,
      productId: opts.productId,
      type: "sale",
      qty: opts.qty,
      unitPrice: opts.unitPrice,
      orderId: opts.orderId ?? null,
      branchId: opts.branchId ?? MAIN_BRANCH_ID,
      businessDate: opts.businessDate,
      createdBy: opts.createdBy ?? null,
      createdAt: opts.createdAt,
    }),
  ]);
}

export interface ProductProfit {
  productId: string;
  revenue: number;
  cost: number;
  unitsSold: number;
}

/** Aggregate profit per product from all movements. Prices are in piastres. */
export async function getProductProfits(): Promise<ProductProfit[]> {
  const rows = await db
    .select({
      productId: productMovements.productId,
      type: productMovements.type,
      qty: productMovements.qty,
      unitPrice: productMovements.unitPrice,
    })
    .from(productMovements);

  const map = new Map<string, { revenue: number; cost: number; unitsSold: number }>();
  for (const row of rows) {
    const entry = map.get(row.productId) ?? { revenue: 0, cost: 0, unitsSold: 0 };
    if (row.type === "sale") {
      entry.revenue += row.qty * row.unitPrice;
      entry.unitsSold += row.qty;
    } else if (row.type === "purchase") {
      entry.cost += row.qty * row.unitPrice;
    }
    map.set(row.productId, entry);
  }

  return Array.from(map.entries()).map(([productId, data]) => ({ productId, ...data }));
}

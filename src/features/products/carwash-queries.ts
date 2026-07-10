import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { products, productMovements } from "../../db/schema";
import type { Product } from "../../db/schema";
import { todayISO } from "../../lib/utils";

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
  stockQty?: number;
  branchId?: string;
  businessDate?: string;
  createdBy?: string;
  createdAt?: string;
}): Promise<void> {
  const initialQty = data.stockQty ?? 0;
  if (initialQty > 0) {
    const movementId = `mov_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
    await db.batch([
      db.insert(products).values({
        id: data.id,
        name: data.name,
        salePrice: data.salePrice,
        purchasePrice: data.purchasePrice ?? 0,
        stockQty: initialQty,
        lowStockThreshold: data.lowStockThreshold ?? 5,
        active: data.active ?? true,
      }),
      db.insert(productMovements).values({
        id: movementId,
        productId: data.id,
        type: "purchase",
        qty: initialQty,
        unitPrice: data.purchasePrice ?? 0,
        branchId: data.branchId ?? "branch-main",
        // Cairo business date, not UTC — between midnight and 2am local the
        // two differ and the movement would land on the wrong report day.
        businessDate: data.businessDate ?? todayISO(),
        createdBy: data.createdBy ?? null,
        createdAt: data.createdAt ?? new Date().toISOString(),
      }),
    ]);
  } else {
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

/**
 * Mirror a legacy KV-store stock change (invoice cancel/edit/return restores)
 * into the relational products table so SQLite stays the source of truth for
 * stock. Writes an "adjustment" movement, which the purchase/sale statistics
 * in reports deliberately ignore. Unknown product ids no-op — legacy retail
 * products that never existed in the carwash table are skipped.
 */
export async function recordProductAdjustment(opts: {
  movementId: string;
  productId: string;
  /** Positive restores stock, negative deducts. Whole units. */
  deltaQty: number;
  branchId?: string;
  businessDate: string;
  createdBy?: string;
  createdAt: string;
}): Promise<void> {
  if (!opts.deltaQty) return;
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, opts.productId))
    .limit(1);
  if (!existing[0]) return;
  await db.batch([
    db
      .update(products)
      .set({ stockQty: sql`MAX(0, stock_qty + ${opts.deltaQty})` })
      .where(eq(products.id, opts.productId)),
    db.insert(productMovements).values({
      id: opts.movementId,
      productId: opts.productId,
      type: "adjustment",
      qty: opts.deltaQty,
      unitPrice: 0,
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

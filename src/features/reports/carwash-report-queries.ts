import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/client";
import {
  dailyClosures,
  materialMovements,
  productMovements,
  products,
  rawMaterials,
  treasuryEntries,
} from "../../db/schema";
import type {
  DailyClosure,
  MaterialMovement,
  Product,
  ProductMovement,
  RawMaterial,
  TreasuryEntry,
} from "../../db/schema";

const MAIN_BRANCH_ID = "branch-main";

export type CarwashReportDbSnapshot = {
  products: Product[];
  productMovements: ProductMovement[];
  rawMaterials: RawMaterial[];
  materialMovements: MaterialMovement[];
  treasuryEntries: TreasuryEntry[];
  dailyClosures: DailyClosure[];
};

export async function loadCarwashReportSnapshot(
  from: string,
  to: string,
  branchId = MAIN_BRANCH_ID
): Promise<CarwashReportDbSnapshot> {
  const [
    allProducts,
    productMovementRows,
    allMaterials,
    materialMovementRows,
    treasuryRows,
    closureRows,
  ] = await Promise.all([
    db.select().from(products).orderBy(asc(products.name)),
    db
      .select()
      .from(productMovements)
      .where(
        and(
          gte(productMovements.businessDate, from),
          lte(productMovements.businessDate, to),
          eq(productMovements.branchId, branchId)
        )
      )
      .orderBy(asc(productMovements.businessDate)),
    db.select().from(rawMaterials).orderBy(asc(rawMaterials.name)),
    db
      .select()
      .from(materialMovements)
      .where(
        and(
          gte(materialMovements.businessDate, from),
          lte(materialMovements.businessDate, to),
          eq(materialMovements.branchId, branchId)
        )
      )
      .orderBy(asc(materialMovements.businessDate)),
    db
      .select()
      .from(treasuryEntries)
      .where(
        and(
          gte(treasuryEntries.businessDate, from),
          lte(treasuryEntries.businessDate, to),
          eq(treasuryEntries.branchId, branchId)
        )
      )
      .orderBy(asc(treasuryEntries.businessDate)),
    db
      .select()
      .from(dailyClosures)
      .where(
        and(
          gte(dailyClosures.businessDate, from),
          lte(dailyClosures.businessDate, to),
          eq(dailyClosures.branchId, branchId)
        )
      )
      .orderBy(asc(dailyClosures.businessDate)),
  ]);

  return {
    products: allProducts,
    productMovements: productMovementRows,
    rawMaterials: allMaterials,
    materialMovements: materialMovementRows,
    treasuryEntries: treasuryRows,
    dailyClosures: closureRows,
  };
}

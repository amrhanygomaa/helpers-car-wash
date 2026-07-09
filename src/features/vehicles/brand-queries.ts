import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { carBrands } from "../../db/schema";
import type { CarBrandRow } from "../../db/schema";

export type { CarBrandRow };

export function listAllCarBrands(): Promise<CarBrandRow[]> {
  return db.select().from(carBrands).orderBy(asc(carBrands.nameAr));
}

export async function createCarBrand(data: {
  id: string;
  nameAr: string;
  nameEn: string;
  logoImage?: string | null;
  createdAt: string;
}): Promise<void> {
  await db.insert(carBrands).values({
    id: data.id,
    nameAr: data.nameAr,
    nameEn: data.nameEn,
    logoImage: data.logoImage ?? null,
    createdAt: data.createdAt,
  });
}

export async function updateCarBrand(
  id: string,
  patch: Partial<{ nameAr: string; nameEn: string; logoImage: string | null }>
): Promise<void> {
  await db.update(carBrands).set(patch).where(eq(carBrands.id, id));
}

export async function deleteCarBrand(id: string): Promise<void> {
  await db.delete(carBrands).where(eq(carBrands.id, id));
}

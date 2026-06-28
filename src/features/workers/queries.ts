import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { workers } from "../../db/schema";
import type { Worker } from "../../db/schema";

export type WageType = Worker["wageType"];

export function listAllWorkers(): Promise<Worker[]> {
  return db.select().from(workers).orderBy(asc(workers.name));
}

/** All active workers ordered by name — used for per-line assignment on invoices. */
export function listActiveWorkers(): Promise<Worker[]> {
  return db.select().from(workers).where(eq(workers.active, true)).orderBy(asc(workers.name));
}

export async function createWorker(data: {
  id: string;
  name: string;
  wageType: WageType;
  baseWage?: number | null;
  active?: boolean;
}): Promise<void> {
  await db.insert(workers).values({
    id: data.id,
    name: data.name,
    wageType: data.wageType,
    baseWage: data.baseWage ?? null,
    active: data.active ?? true,
  });
}

export async function updateWorker(
  id: string,
  patch: Partial<{
    name: string;
    wageType: WageType;
    baseWage: number | null;
    active: boolean;
  }>
): Promise<void> {
  await db.update(workers).set(patch).where(eq(workers.id, id));
}

export type { Worker };

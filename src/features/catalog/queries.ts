import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { services, type Service, type NewService } from "../../db/schema";

/**
 * Data access for the wash-services catalog (relational layer).
 * All reads/writes go through the Drizzle client (CLAUDE.md §5) — never raw SQL
 * in components. This is the canonical services source going forward; it lives
 * in real SQLite tables, not the legacy KV store.
 */

/** All services ordered for display (active + inactive). */
export function listServices(): Promise<Service[]> {
  return db.select().from(services).orderBy(asc(services.sortOrder));
}

/** Only active services — used when adding lines to an invoice. */
export function listActiveServices(): Promise<Service[]> {
  return db
    .select()
    .from(services)
    .where(eq(services.active, true))
    .orderBy(asc(services.sortOrder));
}

export async function createService(input: NewService): Promise<void> {
  await db.insert(services).values(input);
}

export async function updateService(id: string, patch: Partial<NewService>): Promise<void> {
  await db.update(services).set(patch).where(eq(services.id, id));
}

/** Soft-deactivate (DATA_MODEL.md integrity rule) — never hard-delete services. */
export async function deactivateService(id: string): Promise<void> {
  await db.update(services).set({ active: false }).where(eq(services.id, id));
}

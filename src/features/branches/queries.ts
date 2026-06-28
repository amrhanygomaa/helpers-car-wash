import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { branches, settings, type Branch, type NewBranch } from "../../db/schema";

export const MAIN_BRANCH_ID = "branch-main";

export function listBranches(): Promise<Branch[]> {
  return db.select().from(branches).orderBy(asc(branches.name));
}

export function listActiveBranches(): Promise<Branch[]> {
  return db
    .select()
    .from(branches)
    .where(eq(branches.active, true))
    .orderBy(asc(branches.name));
}

export async function ensureDefaultBranch(): Promise<void> {
  const existing = await listBranches();
  if (existing.length > 0) return;
  await db.insert(branches).values({
    id: MAIN_BRANCH_ID,
    name: "الفرع الرئيسي",
    active: true,
    createdAt: new Date().toISOString(),
  });
}

export async function createBranch(input: NewBranch): Promise<void> {
  await db.insert(branches).values(input);
}

export async function updateBranch(id: string, patch: Partial<NewBranch>): Promise<void> {
  await db.update(branches).set(patch).where(eq(branches.id, id));
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
    return;
  }
  await db.insert(settings).values({ key, value });
}

export async function saveCurrentBranch(branch: Pick<Branch, "id" | "name">): Promise<void> {
  await upsertSetting("current_branch_id", branch.id);
  await upsertSetting("branch_name", branch.name);
}

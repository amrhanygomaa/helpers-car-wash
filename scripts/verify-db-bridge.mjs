// Throwaway verification: exercises the Drizzle sqlite-proxy contract end-to-end
// against a real better-sqlite3 DB using the actual migration SQL + the exact
// runRendererSql logic from electron/main.cjs. Run: node scripts/verify-db-bridge.mjs
// Uses node:sqlite (built-in, no native build) as a stand-in for the
// Electron-native encrypted driver. The runRendererSql shape mirrors
// electron/main.cjs; node:sqlite returns row objects, so we map to value
// arrays in column order (Object.values preserves SELECT order) to match
// better-sqlite3's .raw() output that the real bridge produces.
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as schema from "../src/db/schema.ts";

import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(":memory:");
// Apply every migration in order, exactly like runCarwashMigrations() in main.cjs.
const migrationsDir = join(__dirname, "../electron/migrations");
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
}

function runRendererSql(sql, params, method) {
  const stmt = db.prepare(String(sql));
  const args = Array.isArray(params) ? params : [];
  if (method === "run") {
    stmt.run(...args);
    return { rows: [] };
  }
  if (method === "get") {
    const row = stmt.get(...args);
    return { rows: row ? Object.values(row) : [] };
  }
  return { rows: stmt.all(...args).map((r) => Object.values(r)) };
}

const orm = drizzle(
  async (sql, params, method) => runRendererSql(sql, params, method),
  async (queries) => queries.map((q) => runRendererSql(q.sql, q.params, q.method)),
  { schema }
);

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures++;
}

// 1) select all seeded services
const all = await orm.select().from(schema.services);
check(`12 services seeded (got ${all.length})`, all.length === 12);

// 2) ordered + typed: first service is the no-commission basic wash
const ordered = await orm.select().from(schema.services).orderBy(schema.services.sortOrder);
check("first service = basic wash, no commission", ordered[0]?.id === "svc-01" && ordered[0]?.hasCommission === false);
check("chemical services flagged commission", ordered.filter((s) => s.category === "chemical").every((s) => s.hasCommission === true));

// 3) get single row
const one = await orm.select().from(schema.services).where(eq(schema.services.id, "svc-08")).limit(1);
check("get svc-08 = موتور (extra, commission)", one[0]?.nameAr === "موتور" && one[0]?.category === "extra");

// 4) insert + read back (write path)
await orm.insert(schema.customers).values({ id: "cust-test", name: "عميل تجريبي", phone: "01000000000", createdAt: new Date().toISOString() });
const custs = await orm.select().from(schema.customers);
check("inserted customer reads back", custs.length === 1 && custs[0].name === "عميل تجريبي");

// 5) settings + workers seeded
const settings = await orm.select().from(schema.settings);
check("settings seeded (currency=EGP)", settings.find((s) => s.key === "currency")?.value === "EGP");
check(
  "current branch setting seeded",
  settings.find((s) => s.key === "current_branch_id")?.value === "branch-main"
);
const branches = await orm.select().from(schema.branches);
check(
  "main branch seeded",
  branches.length === 1 && branches[0].id === "branch-main" && branches[0].active === true
);
const workers = await orm.select().from(schema.workers);
check(`2 workers seeded (got ${workers.length})`, workers.length === 2);

// 6) batch transaction
await orm.batch([
  orm.insert(schema.workers).values({ id: "wrk-batch", name: "صنايعي باتش", wageType: "commission_only", baseWage: null, active: true }),
  orm.insert(schema.discountCodes).values({ id: "disc-1", code: "VIP10", type: "percent", value: 10, active: true }),
]);
const workers2 = await orm.select().from(schema.workers);
check(`batch insert worked (3 workers, got ${workers2.length})`, workers2.length === 3);

// 7) 0002 migration: roles + role_permissions seeded, cashier scoped
const roles = await orm.select().from(schema.roles);
check(`2 roles seeded (got ${roles.length})`, roles.length === 2);
const cashierPerms = await orm
  .select()
  .from(schema.rolePermissions)
  .where(eq(schema.rolePermissions.roleId, "cashier"));
check("cashier has exactly 3 permissions", cashierPerms.length === 3);
const ownerPerms = await orm
  .select()
  .from(schema.rolePermissions)
  .where(eq(schema.rolePermissions.roleId, "owner"));
check("owner has all 15 permissions", ownerPerms.length === 15);

db.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

/**
 * Drizzle client for the car wash relational domain.
 *
 * The typed query builder runs here in the renderer; the generated SQL + params
 * are shipped over IPC (`window.desktopAPI.db`) and executed by better-sqlite3
 * in the Electron main process against the encrypted DB. This is Drizzle's
 * official `sqlite-proxy` pattern — full type-safety in feature code, real SQL
 * (transactions + constraints) on the backend.
 *
 * Not available in a plain browser (no Electron) — guard with {@link hasDb}.
 */
function getBridge() {
  const api = typeof window !== "undefined" ? window.desktopAPI : undefined;
  if (!api?.db) {
    throw new Error(
      "Car wash data bridge unavailable (desktopAPI.db). This build must run inside Electron."
    );
  }
  return api.db;
}

export function hasDb(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopAPI?.db);
}

export const db = drizzle(
  // single-query callback
  async (sql, params, method) => {
    const res = await getBridge().query(sql, params, method);
    return { rows: res.rows as unknown[] };
  },
  // batch callback — runs all queries in one transaction on the backend
  async (queries) => {
    const results = await getBridge().batch(
      queries.map((q) => ({ sql: q.sql, params: q.params, method: q.method }))
    );
    return results.map((r) => ({ rows: r.rows as unknown[] }));
  },
  { schema }
);

export { schema };

// Multi-branch cloud sync engine (Phase 9) — runs in the Electron MAIN process.
//
// Offline-first: this engine is entirely optional and non-blocking. It only does
// anything when the owner has configured + enabled sync (Supabase URL + key +
// orgId in the `sync_state` table). With sync disabled the app is 100% offline;
// the change-capture triggers (migration 0009) still fill `sync_outbox`, which is
// simply drained on the next successful sync.
//
// Conflict rules mirror src/lib/sync.ts (the unit-tested spec): last-write-wins
// by `updated_at`; on a tie a delete tombstone wins.

const SYNC_ENTITIES = [
  "branches",
  "services",
  "discount_codes",
  "workers",
  "products",
  "product_movements",
  "raw_materials",
  "material_movements",
  "treasury_entries",
  "worker_withdrawals",
  "daily_closures",
  "wash_packages",
  "customer_subscriptions",
  "subscription_redemptions",
  "cash_shifts",
  "worker_attendance",
];

const BATCH = 200;

function newer(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return String(a) > String(b);
  return ta > tb;
}

/**
 * @param {object} opts
 * @param {import('better-sqlite3-multiple-ciphers').Database} opts.db
 * @param {() => string} [opts.deviceId]
 * @param {(...a:any[])=>void} [opts.log]
 */
function createSyncEngine({ db, deviceId, log = () => {} }) {
  const getState = (key, fallback = null) => {
    const row = db.prepare("SELECT value FROM sync_state WHERE key=?").get(key);
    return row ? row.value : fallback;
  };
  const setState = (key, value) => {
    db.prepare(
      "INSERT INTO sync_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(key, value);
  };

  function getConfig() {
    return {
      enabled: getState("enabled") === "1",
      url: getState("supabase_url"),
      key: getState("supabase_key"),
      orgId: getState("org_id"),
      branchId: getState("branch_id") || "branch-main",
    };
  }

  function setConfig(cfg) {
    if (cfg.enabled !== undefined) setState("enabled", cfg.enabled ? "1" : "0");
    if (cfg.url !== undefined) setState("supabase_url", cfg.url || "");
    if (cfg.key !== undefined) setState("supabase_key", cfg.key || "");
    if (cfg.orgId !== undefined) setState("org_id", cfg.orgId || "");
    if (cfg.branchId !== undefined) setState("branch_id", cfg.branchId || "branch-main");
  }

  // ── Push: drain the outbox to Supabase ────────────────────────────────────
  async function push(transport, cfg) {
    const rows = db
      .prepare("SELECT * FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?")
      .all(BATCH * 5);
    if (rows.length === 0) return { pushed: 0 };

    // Collapse to the latest op per (entity,row_id) — a row edited many times
    // offline pushes once. Older outbox rows for the same key are still marked
    // synced so they don't replay.
    const latest = new Map();
    for (const r of rows) {
      const k = `${r.entity}:${r.row_id}`;
      const prev = latest.get(k);
      if (!prev || newer(r.created_at, prev.created_at) || r.created_at === prev.created_at) latest.set(k, r);
    }

    let pushed = 0;
    for (const r of latest.values()) {
      let record;
      if (r.op === "delete") {
        record = { id: r.row_id, deleted_at: new Date().toISOString() };
      } else {
        const live = db.prepare(`SELECT * FROM ${r.entity} WHERE id=?`).get(r.row_id);
        if (!live) {
          // Row vanished after enqueue → treat as delete.
          record = { id: r.row_id, deleted_at: new Date().toISOString() };
        } else {
          record = live;
        }
      }
      record.org_id = cfg.orgId;
      record.branch_id = record.branch_id || cfg.branchId;
      if (!record.updated_at) record.updated_at = new Date().toISOString();
      await transport.upsert(r.entity, record);
      pushed += 1;
    }

    const now = new Date().toISOString();
    const mark = db.prepare("UPDATE sync_outbox SET synced_at=? WHERE synced_at IS NULL AND created_at<=?");
    mark.run(now, rows[rows.length - 1].created_at);
    return { pushed };
  }

  // ── Pull: fetch remote changes and merge locally ──────────────────────────
  async function pull(transport, cfg) {
    let pulled = 0;
    for (const entity of SYNC_ENTITIES) {
      const cursorKey = `cursor_${entity}`;
      const cursor = getState(cursorKey, "1970-01-01T00:00:00Z");
      const remoteRows = await transport.pullSince(entity, cursor, cfg.orgId);
      if (!remoteRows || remoteRows.length === 0) continue;

      const cols = db.prepare(`PRAGMA table_info(${entity})`).all().map((c) => c.name);
      const upsertCols = cols.filter((c) => c !== undefined);

      const applyOne = db.transaction((remote) => {
        const local = db.prepare(`SELECT updated_at, deleted_at FROM ${entity} WHERE id=?`).get(remote.id);
        // last-write-wins; skip if local is newer.
        if (local && !newer(remote.updated_at, local.updated_at) && remote.updated_at !== local.updated_at) return;
        const isDelete = Boolean(remote.deleted_at);
        if (isDelete) {
          // Soft-delete locally so the tombstone persists and re-propagates.
          if (cols.includes("deleted_at")) {
            db.prepare(`UPDATE ${entity} SET deleted_at=?, updated_at=? WHERE id=?`).run(
              remote.deleted_at, remote.updated_at, remote.id,
            );
          } else {
            db.prepare(`DELETE FROM ${entity} WHERE id=?`).run(remote.id);
          }
          return;
        }
        // Upsert only the columns this table actually has.
        const present = upsertCols.filter((c) => remote[c] !== undefined);
        const placeholders = present.map(() => "?").join(",");
        const updates = present.filter((c) => c !== "id").map((c) => `${c}=excluded.${c}`).join(",");
        const values = present.map((c) => remote[c]);
        db.prepare(
          `INSERT INTO ${entity}(${present.join(",")}) VALUES(${placeholders}) ` +
          `ON CONFLICT(id) DO UPDATE SET ${updates}`,
        ).run(...values);
      });

      let maxCursor = cursor;
      // Suppress re-capturing pulled changes back into the outbox during apply.
      db.prepare("UPDATE sync_state SET value='1' WHERE key='applying'").run();
      setState("applying", "1");
      try {
        for (const remote of remoteRows) {
          applyOne(remote);
          if (newer(remote.updated_at, maxCursor)) maxCursor = remote.updated_at;
          pulled += 1;
        }
      } finally {
        setState("applying", "0");
      }
      setState(cursorKey, maxCursor);
    }
    return { pulled };
  }

  async function runSync(transportFactory = createSupabaseTransport) {
    const cfg = getConfig();
    if (!cfg.enabled) return { ok: false, reason: "disabled" };
    if (!cfg.url || !cfg.key || !cfg.orgId) return { ok: false, reason: "not_configured" };
    let transport;
    try {
      transport = transportFactory(cfg);
    } catch (e) {
      return { ok: false, reason: "transport_unavailable", error: String(e && e.message) };
    }
    try {
      const p = await push(transport, cfg);
      const q = await pull(transport, cfg);
      setState("last_sync_at", new Date().toISOString());
      setState("last_error", "");
      log("[sync] ok", p, q);
      return { ok: true, ...p, ...q };
    } catch (e) {
      const msg = String(e && e.message);
      setState("last_error", msg);
      log("[sync] error", msg);
      return { ok: false, reason: "error", error: msg };
    }
  }

  function status() {
    const cfg = getConfig();
    const pending = db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE synced_at IS NULL").get().n;
    return {
      enabled: cfg.enabled,
      configured: Boolean(cfg.url && cfg.key && cfg.orgId),
      branchId: cfg.branchId,
      orgId: cfg.orgId,
      url: cfg.url,
      pending,
      lastSyncAt: getState("last_sync_at"),
      lastError: getState("last_error"),
    };
  }

  void deviceId;
  return { push, pull, runSync, status, getConfig, setConfig, SYNC_ENTITIES };
}

/**
 * Real transport over Supabase REST. Lazily requires @supabase/supabase-js so
 * the dependency is only needed once sync is actually enabled.
 *
 * All entities share ONE generic table `sync_rows(entity, id, org_id, branch_id,
 * updated_at, deleted_at, data jsonb)` — this avoids maintaining 16 mirror
 * schemas in lock-step with SQLite and keeps the full row available as JSON for
 * any future dashboard. `updated_at`/`deleted_at` are stored as text in the
 * exact ISO-UTC format the SQLite triggers emit, so cursor `gt` and merge
 * comparisons are byte-consistent across devices.
 */
function createSupabaseTransport(cfg) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
  return {
    async upsert(entity, record) {
      const row = {
        entity,
        id: record.id,
        org_id: cfg.orgId,
        branch_id: record.branch_id || cfg.branchId,
        updated_at: record.updated_at,
        deleted_at: record.deleted_at ?? null,
        data: record,
      };
      const { error } = await client.from("sync_rows").upsert(row, { onConflict: "entity,id" });
      if (error) throw new Error(`${entity} upsert: ${error.message}`);
    },
    async pullSince(entity, cursor, orgId) {
      const { data, error } = await client
        .from("sync_rows")
        .select("data,updated_at,deleted_at")
        .eq("entity", entity)
        .eq("org_id", orgId)
        .gt("updated_at", cursor)
        .order("updated_at", { ascending: true })
        .limit(1000);
      if (error) throw new Error(`${entity} pull: ${error.message}`);
      return (data || []).map((r) => ({ ...(r.data || {}), updated_at: r.updated_at, deleted_at: r.deleted_at }));
    },
  };
}

module.exports = { createSyncEngine, createSupabaseTransport, SYNC_ENTITIES };

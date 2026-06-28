/**
 * Pure sync logic for multi-branch cloud sync (Phase 9). No DB/network/React
 * imports — all I/O lives in `electron/sync.cjs`. This module owns the rules:
 * conflict resolution, outbox batching, and payload (de)serialization, so they
 * can be unit-tested offline.
 *
 * Model: each syncable row carries `updated_at` (ISO-8601 UTC) and a nullable
 * `deleted_at` (soft delete / tombstone). Reconciliation is last-write-wins by
 * `updated_at`; on an exact tie a delete tombstone wins (safer to converge to
 * "removed" than to resurrect a row).
 */

export type SyncOp = "upsert" | "delete";

export interface SyncRecord {
  /** Stable row id (UUID), identical local and remote. */
  id: string;
  /** ISO-8601 UTC timestamp of the last change. */
  updated_at: string;
  /** ISO-8601 UTC tombstone; present ⇒ the row is deleted. */
  deleted_at?: string | null;
  [key: string]: unknown;
}

export interface OutboxRow {
  id: string;
  entity: string;
  row_id: string;
  op: SyncOp;
  payload: string; // JSON string of the row
  updated_at: string;
  device_id: string;
  branch_id: string;
  created_at: string;
  synced_at?: string | null;
}

/** True when `a` is the same logical change time-or-newer than `b`. */
function isNewer(a: string, b: string): boolean {
  // ISO-8601 UTC sorts lexicographically, but compare as time to be safe.
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}

function isDeleted(r: SyncRecord): boolean {
  return Boolean(r.deleted_at);
}

/**
 * Reconcile a local and a remote version of the same row. Returns whichever
 * should win. Newer `updated_at` wins; on an exact tie, a tombstone wins, else
 * local is kept (idempotent, avoids needless writes).
 */
export function resolveConflict<T extends SyncRecord>(local: T | null, remote: T | null): T | null {
  if (!local) return remote;
  if (!remote) return local;
  if (isNewer(remote.updated_at, local.updated_at)) return remote;
  if (isNewer(local.updated_at, remote.updated_at)) return local;
  // Tie on timestamp: prefer the tombstone so all replicas converge to deleted.
  if (isDeleted(remote) && !isDeleted(local)) return remote;
  return local;
}

/** Whether a resolved record represents a deletion that should be applied. */
export function shouldApplyDelete(record: SyncRecord): boolean {
  return isDeleted(record);
}

/** Split outbox rows into fixed-size batches for transport. */
export function batchOutbox<T>(rows: T[], size: number): T[][] {
  if (size <= 0) throw new Error("batch size must be positive");
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size));
  }
  return batches;
}

/**
 * Collapse multiple outbox entries for the same (entity,row_id) down to the
 * latest one, so a row edited several times offline pushes once. Order within
 * the result follows the latest `updated_at` ascending (stable enough for push).
 */
export function dedupeOutbox(rows: OutboxRow[]): OutboxRow[] {
  const latest = new Map<string, OutboxRow>();
  for (const row of rows) {
    const key = `${row.entity}:${row.row_id}`;
    const prev = latest.get(key);
    if (!prev || isNewer(row.updated_at, prev.updated_at) || row.updated_at === prev.updated_at) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
}

/** Parse an outbox payload back into a record; throws on malformed JSON. */
export function parsePayload<T extends SyncRecord = SyncRecord>(payload: string): T {
  return JSON.parse(payload) as T;
}

export function serializePayload(record: SyncRecord): string {
  return JSON.stringify(record);
}

/** The greatest `updated_at` across records — used to advance the pull cursor. */
export function maxUpdatedAt(records: SyncRecord[], current?: string | null): string | null {
  let max = current ?? null;
  for (const r of records) {
    if (!max || isNewer(r.updated_at, max)) max = r.updated_at;
  }
  return max;
}

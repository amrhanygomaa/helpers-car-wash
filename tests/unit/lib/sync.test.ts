import { describe, it, expect } from "vitest";
import {
  resolveConflict,
  shouldApplyDelete,
  batchOutbox,
  dedupeOutbox,
  parsePayload,
  serializePayload,
  maxUpdatedAt,
  type OutboxRow,
  type SyncRecord,
} from "../../../src/lib/sync";

function rec(id: string, updated_at: string, deleted_at?: string | null): SyncRecord {
  return { id, updated_at, deleted_at: deleted_at ?? null };
}

describe("resolveConflict", () => {
  it("returns the present side when the other is null", () => {
    const a = rec("1", "2026-06-28T10:00:00Z");
    expect(resolveConflict(a, null)).toBe(a);
    expect(resolveConflict(null, a)).toBe(a);
    expect(resolveConflict(null, null)).toBeNull();
  });

  it("newer updated_at wins", () => {
    const local = rec("1", "2026-06-28T10:00:00Z");
    const remote = rec("1", "2026-06-28T11:00:00Z");
    expect(resolveConflict(local, remote)).toBe(remote);
    expect(resolveConflict(remote, local)).toBe(remote);
  });

  it("on an exact tie a delete tombstone wins", () => {
    const live = rec("1", "2026-06-28T10:00:00Z");
    const dead = rec("1", "2026-06-28T10:00:00Z", "2026-06-28T10:00:00Z");
    expect(resolveConflict(live, dead)).toBe(dead);
    expect(resolveConflict(dead, live)).toBe(dead);
  });

  it("keeps local on a tie with no tombstone (idempotent)", () => {
    const local = rec("1", "2026-06-28T10:00:00Z");
    const remote = rec("1", "2026-06-28T10:00:00Z");
    expect(resolveConflict(local, remote)).toBe(local);
  });
});

describe("shouldApplyDelete", () => {
  it("detects tombstones", () => {
    expect(shouldApplyDelete(rec("1", "t", "2026-06-28T10:00:00Z"))).toBe(true);
    expect(shouldApplyDelete(rec("1", "t", null))).toBe(false);
  });
});

describe("batchOutbox", () => {
  it("splits into fixed-size chunks", () => {
    expect(batchOutbox([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("empty input yields no batches", () => {
    expect(batchOutbox([], 10)).toEqual([]);
  });
  it("throws on non-positive size", () => {
    expect(() => batchOutbox([1], 0)).toThrow();
  });
});

function ob(entity: string, row_id: string, updated_at: string): OutboxRow {
  return {
    id: Math.random().toString(36).slice(2),
    entity,
    row_id,
    op: "upsert",
    payload: "{}",
    updated_at,
    device_id: "dev",
    branch_id: "branch-main",
    created_at: updated_at,
  };
}

describe("dedupeOutbox", () => {
  it("keeps only the latest entry per (entity,row_id)", () => {
    const rows = [
      ob("workers", "w1", "2026-06-28T10:00:00Z"),
      ob("workers", "w1", "2026-06-28T12:00:00Z"),
      ob("workers", "w2", "2026-06-28T09:00:00Z"),
    ];
    const out = dedupeOutbox(rows);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.row_id === "w1")?.updated_at).toBe("2026-06-28T12:00:00Z");
  });
});

describe("payload (de)serialization", () => {
  it("round-trips a record", () => {
    const r = { id: "1", updated_at: "t", name: "أحمد", n: 5 };
    expect(parsePayload(serializePayload(r))).toEqual(r);
  });
  it("throws on malformed JSON", () => {
    expect(() => parsePayload("{not json")).toThrow();
  });
});

describe("maxUpdatedAt", () => {
  it("returns the greatest timestamp, honoring the current cursor", () => {
    const recs = [rec("1", "2026-06-28T10:00:00Z"), rec("2", "2026-06-28T12:00:00Z")];
    expect(maxUpdatedAt(recs)).toBe("2026-06-28T12:00:00Z");
    expect(maxUpdatedAt(recs, "2026-06-28T15:00:00Z")).toBe("2026-06-28T15:00:00Z");
    expect(maxUpdatedAt([], "2026-06-28T01:00:00Z")).toBe("2026-06-28T01:00:00Z");
    expect(maxUpdatedAt([])).toBeNull();
  });
});

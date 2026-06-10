import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lsGet, lsSet, lsRemove, lsClearAll } from "../../../src/lib/storage";

const PREFIX = "helpers_inventory_v1::";

// ── localStorage path ──────────────────────────────────────────────────────────

function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    get length() { return Object.keys(store).length; },
    _store: store,
  };
}

describe("storage — localStorage path (no desktopAPI)", () => {
  let ls: ReturnType<typeof makeLocalStorage>;

  beforeEach(() => {
    ls = makeLocalStorage();
    vi.stubGlobal("window", { desktopAPI: undefined });
    vi.stubGlobal("localStorage", ls);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("lsGet", () => {
    it("returns the parsed value when key exists", () => {
      ls._store[PREFIX + "products"] = JSON.stringify([{ id: "p1" }]);
      expect(lsGet("products", [])).toEqual([{ id: "p1" }]);
    });

    it("returns the fallback when key is absent", () => {
      expect(lsGet("missing", "default")).toBe("default");
    });

    it("returns the fallback when stored value is corrupt JSON", () => {
      ls._store[PREFIX + "broken"] = "{not-json}";
      expect(lsGet("broken", null)).toBeNull();
    });

    it("returns the fallback for null stored values", () => {
      expect(lsGet("nokey", 42)).toBe(42);
    });
  });

  describe("lsSet", () => {
    it("stores a JSON-serialised value under the prefixed key", () => {
      lsSet("products", [{ id: "p1" }]);
      expect(ls.setItem).toHaveBeenCalledWith(
        PREFIX + "products",
        JSON.stringify([{ id: "p1" }]),
      );
    });

    it("stores numbers and booleans correctly", () => {
      lsSet("count", 7);
      expect(ls._store[PREFIX + "count"]).toBe("7");
      lsSet("flag", false);
      expect(ls._store[PREFIX + "flag"]).toBe("false");
    });
  });

  describe("lsRemove", () => {
    it("removes the prefixed key from localStorage", () => {
      ls._store[PREFIX + "old"] = "x";
      lsRemove("old");
      expect(ls.removeItem).toHaveBeenCalledWith(PREFIX + "old");
      expect(ls._store[PREFIX + "old"]).toBeUndefined();
    });
  });

  describe("lsClearAll", () => {
    it("removes all prefixed keys and leaves others untouched", () => {
      ls._store[PREFIX + "products"] = "[]";
      ls._store[PREFIX + "customers"] = "[]";
      ls._store["other_key"] = "keep";
      lsClearAll();
      expect(ls._store[PREFIX + "products"]).toBeUndefined();
      expect(ls._store[PREFIX + "customers"]).toBeUndefined();
      expect(ls._store["other_key"]).toBe("keep");
    });

    it("does not throw when no prefixed keys exist", () => {
      expect(() => lsClearAll()).not.toThrow();
    });
  });
});

// ── desktopAPI (IPC) path ─────────────────────────────────────────────────────

describe("storage — desktopAPI (IPC) path", () => {
  const mockStorage = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clearPrefix: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("window", { desktopAPI: { storage: mockStorage } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("lsGet", () => {
    it("reads from desktopAPI.storage.get and parses JSON", () => {
      mockStorage.get.mockReturnValue(JSON.stringify({ id: "p1" }));
      expect(lsGet("item", null)).toEqual({ id: "p1" });
      expect(mockStorage.get).toHaveBeenCalledWith(PREFIX + "item");
    });

    it("returns fallback when desktopAPI.storage.get returns null", () => {
      mockStorage.get.mockReturnValue(null);
      expect(lsGet("item", "fallback")).toBe("fallback");
    });
  });

  describe("lsSet", () => {
    it("calls desktopAPI.storage.set with prefixed key and JSON value", () => {
      lsSet("products", [1, 2, 3]);
      expect(mockStorage.set).toHaveBeenCalledWith(PREFIX + "products", "[1,2,3]");
    });
  });

  describe("lsRemove", () => {
    it("calls desktopAPI.storage.remove with prefixed key", () => {
      lsRemove("old");
      expect(mockStorage.remove).toHaveBeenCalledWith(PREFIX + "old");
    });
  });

  describe("lsClearAll", () => {
    it("calls desktopAPI.storage.clearPrefix with the correct prefix", () => {
      lsClearAll();
      expect(mockStorage.clearPrefix).toHaveBeenCalledWith(PREFIX);
    });
  });
});

const PREFIX = "helpers_inventory_v1::";

// ── In-memory cache: populated once at startup via loadStorageCache() ──
// After that, lsGet reads from cache instantly (no IPC), eliminating the
// synchronous IPC bottleneck that caused UI freezes.
const _cache = new Map<string, string>();
let _cacheReady = false;

/**
 * Call once at app startup (before rendering) to pre-populate the cache
 * with all storage keys from the main process in a single async IPC call.
 * This replaces the per-key sendSync reads that blocked the renderer.
 */
export async function loadStorageCache(): Promise<void> {
  if (!window.desktopAPI?.storage?.getBatch) {
    _cacheReady = true;
    return;
  }
  try {
    const batch: Record<string, string> = await window.desktopAPI.storage.getBatch();
    for (const [key, value] of Object.entries(batch)) {
      _cache.set(key, value);
    }
  } catch {
    // Fallback: cache stays empty, lsGet falls back to sync reads (old behaviour).
  }
  _cacheReady = true;
}

export function lsGet<T>(key: string, fallback: T): T {
  try {
    if (window.desktopAPI?.storage) {
      const fullKey = PREFIX + key;

      // Read from in-memory cache (instant — no IPC)
      if (_cacheReady && _cache.has(fullKey)) {
        const raw = _cache.get(fullKey)!;
        return JSON.parse(raw) as T;
      }

      // Cache miss or not yet loaded: fall back to sync IPC (legacy path)
      const raw = window.desktopAPI.storage.get(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    }
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function lsSet<T>(key: string, value: T): void {
  const fullKey = PREFIX + key;
  const json = JSON.stringify(value);
  try {
    // Always update the in-memory cache so subsequent lsGet calls see
    // the new value immediately (no round-trip needed).
    _cache.set(fullKey, json);

    if (window.desktopAPI?.storage) {
      window.desktopAPI.storage.set(fullKey, json);
      return;
    }
    localStorage.setItem(fullKey, json);
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Write all keys to persistent storage in a single IPC + SQLite transaction.
 * Falls back to per-key writes if the batch API is unavailable.
 */
export function lsSetBatch(entries: Record<string, unknown>): void {
  const batch: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) {
    const fullKey = PREFIX + key;
    const json = JSON.stringify(value);
    // Update in-memory cache immediately
    _cache.set(fullKey, json);
    batch[fullKey] = json;
  }
  try {
    if (window.desktopAPI?.storage?.setBatch) {
      window.desktopAPI.storage.setBatch(batch);
      return;
    }
    // Fallback: per-key writes (web mode or old Electron)
    if (window.desktopAPI?.storage) {
      for (const [fullKey, json] of Object.entries(batch)) {
        window.desktopAPI.storage.set(fullKey, json);
      }
      return;
    }
    for (const [fullKey, json] of Object.entries(batch)) {
      localStorage.setItem(fullKey, json);
    }
  } catch {
    /* ignore */
  }
}

export function lsRemove(key: string): void {
  const fullKey = PREFIX + key;
  _cache.delete(fullKey);
  if (window.desktopAPI?.storage) {
    window.desktopAPI.storage.remove(fullKey);
    return;
  }
  localStorage.removeItem(fullKey);
}

export function lsClearAll(): void {
  // Clear the in-memory cache for all app keys
  for (const key of [..._cache.keys()]) {
    if (key.startsWith(PREFIX)) _cache.delete(key);
  }
  if (window.desktopAPI?.storage) {
    window.desktopAPI.storage.clearPrefix(PREFIX);
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

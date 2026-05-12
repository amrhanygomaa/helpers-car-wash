const PREFIX = "helpers_inventory_v1::";

export function lsGet<T>(key: string, fallback: T): T {
  try {
    if (window.desktopAPI?.storage) {
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
  try {
    if (window.desktopAPI?.storage) {
      window.desktopAPI.storage.set(PREFIX + key, JSON.stringify(value));
      return;
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

export function lsRemove(key: string): void {
  if (window.desktopAPI?.storage) {
    window.desktopAPI.storage.remove(PREFIX + key);
    return;
  }
  localStorage.removeItem(PREFIX + key);
}

export function lsClearAll(): void {
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

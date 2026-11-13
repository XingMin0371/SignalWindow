/**
 * localStorage can throw in private mode, blocked WebViews or constrained
 * Android browsers. A memory fallback keeps the app usable for the session.
 */
const memory = new Map<string, string>();

export function safeGet(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key);
    return value ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function safeSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Session-only fallback.
  }
}

export function safeRemove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to do.
  }
}

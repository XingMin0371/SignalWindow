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

/**
 * 会话级草稿：优先 sessionStorage（按标签页隔离），不可用时回退内存/localStorage。
 * CHANGELOG 声称用 sessionStorage，这里让实现与文档一致。
 */
export function safeGetDraft(key: string): string | null {
  try {
    const value = window.sessionStorage.getItem(key);
    if (value !== null) return value;
  } catch {}
  return safeGet(key);
}
export function safeSetDraft(key: string, value: string): void {
  memory.set(key, value);
  try { window.sessionStorage.setItem(key, value); return; } catch {}
  safeSet(key, value);
}

export function safeRemove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to do.
  }
}

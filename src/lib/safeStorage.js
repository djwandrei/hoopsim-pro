// Shared browser-storage guard: returns localStorage when available, or null
// in private-browsing / blocked-storage contexts (used by favorites, pack
// history, and spin templates).
export function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
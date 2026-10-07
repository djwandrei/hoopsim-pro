// Playbook favorites: a browser-local pin list shared by the library list.
// No account, no server — the same storage pattern as pack history.
const FAVORITES_KEY = 'swishiq-playbook-favorites';

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readFavorites() {
  try {
    const parsed = JSON.parse(safeStorage()?.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch { return []; }
}

export function toggleFavorite(id) {
  const current = readFavorites();
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  try { safeStorage()?.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* memory-only */ }
  return next;
}
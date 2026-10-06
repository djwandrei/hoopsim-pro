// Persistent shelf for Game Lab results: a completed game or series can be
// pinned by its full call (kind, teams, seed, neutral court, season) and
// re-opened later — sims are deterministic, so the same call replays the same
// result. Newest first, capped to keep storage tidy.
const KEY = 'swishiq-game-lab-shelf';
const LIMIT = 12;

export function loadSavedResults() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveSavedResult(entry) {
  const list = [entry, ...loadSavedResults().filter(item => item.id !== entry.id)].slice(0, LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* shelf stays in memory */ }
  return list;
}

export function removeSavedResult(id) {
  const list = loadSavedResults().filter(item => item.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* shelf stays in memory */ }
  return list;
}
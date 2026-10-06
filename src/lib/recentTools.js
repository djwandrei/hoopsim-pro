// Session memory for "pick up where you left off": remembers the last few
// studio tools visited, newest first, capped so the strip stays tidy.
const KEY = 'swishiq-recent-tools-v1';
const LIMIT = 4;

export function recordToolVisit(path, label) {
  if (!path || path === '/') return;
  try {
    const current = JSON.parse(sessionStorage.getItem(KEY) || '[]')
      .filter(item => item.path !== path);
    current.unshift({ path, label: label || path, at: Date.now() });
    sessionStorage.setItem(KEY, JSON.stringify(current.slice(0, LIMIT)));
  } catch { /* Memory stays session-only if storage is unavailable. */ }
}

export function recentTools() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(0, LIMIT);
  } catch { return []; }
}
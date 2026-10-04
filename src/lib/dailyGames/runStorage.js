// Shared localStorage run storage for the daily games: each board seed keeps
// its picks/outcome so a refresh picks the run back up where it left off.
export function createRunStore(storageKey, version = 1) {
  const readAll = () => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      return stored && stored.version === version && stored.runs && typeof stored.runs === 'object' ? stored.runs : {};
    } catch {
      return {};
    }
  };
  return {
    read: seed => readAll()[seed] || {},
    write: (seed, run) => {
      const runs = readAll();
      runs[seed] = run;
      try { window.localStorage.setItem(storageKey, JSON.stringify({ version, runs })); } catch { /* visit-only */ }
    },
  };
}
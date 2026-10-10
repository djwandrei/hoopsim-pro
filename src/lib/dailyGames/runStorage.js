// Shared localStorage run storage for the daily games: the seed points to the
// most recent run, while revision slots keep earlier pinned boards resumable.
export function createRunStore(storageKey, version = 1) {
  const revisionKey = (seed, boardSha256) => `${seed}::board:${String(boardSha256 || '').toLowerCase()}`;
  const readAll = () => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      return stored && stored.version === version && stored.runs && typeof stored.runs === 'object' ? stored.runs : {};
    } catch {
      return {};
    }
  };
  return {
    read: (seed, boardSha256 = '') => {
      const runs = readAll();
      if (!boardSha256) return runs[seed] || {};
      const normalizedHash = String(boardSha256).trim().toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(normalizedHash)) return {};
      const revisionRun = runs[revisionKey(seed, normalizedHash)];
      if (revisionRun) return revisionRun;
      const latestRun = runs[seed] || {};
      const latestHash = String(latestRun.boardRef?.boardSha256 || '').toLowerCase();
      // A pre-revision run has no board identity; callers may bind its picks
      // once to the loaded board, but must re-evaluate any saved result.
      return !latestHash || latestHash === normalizedHash ? latestRun : {};
    },
    write: (seed, run) => {
      const runs = readAll();
      const boardSha256 = String(run?.boardRef?.boardSha256 || '').trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(boardSha256)) runs[revisionKey(seed, boardSha256)] = run;
      runs[seed] = run;
      try { window.localStorage.setItem(storageKey, JSON.stringify({ version, runs })); } catch { /* visit-only */ }
    },
  };
}

// ?result= links for the daily games: a finished run is shared by its locked
// picks (game kind, board seed, per-round player refs). The recipient's page
// replays those picks and re-verifies them against the evaluator — the
// evaluation is deterministic, so the scores match the sender's exactly.
const encode = value => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decode = text => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
};

export function encodeSharedRun({ gameKind, seed, picks }) {
  return encode({ v: 1, g: gameKind, s: seed, p: picks });
}

export function decodeSharedRun(search) {
  try {
    const raw = new URLSearchParams(search).get('result');
    if (!raw) return null;
    const run = decode(raw);
    if (run?.v !== 1 || typeof run.g !== 'string' || typeof run.s !== 'string') return null;
    if (!run.p || typeof run.p !== 'object' || Array.isArray(run.p)) return null;
    const picks = {};
    for (const [key, value] of Object.entries(run.p)) {
      if (key && value && typeof value === 'string') picks[key] = value;
    }
    return Object.keys(picks).length ? { gameKind: run.g, seed: run.s, picks } : null;
  } catch { return null; }
}
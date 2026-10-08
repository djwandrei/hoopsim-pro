// ?build= links for the forge drafts: a finished build is shared by its locked
// picks (mode, per-key player ref and rating). The recipient's page rebuilds
// the same composite from the same season package; the season sim itself is
// re-run on their side, so sim records travel with the build, not the link.
const encode = value => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decode = text => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
};

// picks: { key: [playerRef, value?] }
function encodeForgeBuild(mode, picks, editions) {
  return encode({ v: 1, m: mode, p: picks, e: editions });
}

export function decodeForgeBuild(search) {
  try {
    const raw = new URLSearchParams(search).get('build');
    if (!raw) return null;
    const build = decode(raw);
    if (build?.v !== 1 || typeof build.m !== 'string' || !build.p || typeof build.p !== 'object' || Array.isArray(build.p)) return null;
    const picks = {};
    for (const [key, value] of Object.entries(build.p)) {
      if (key && Array.isArray(value) && typeof value[0] === 'string'
        && (value.length === 1 || Number.isFinite(value[1]))) {
        picks[key] = { playerRef: value[0], value: value.length > 1 ? value[1] : null };
      }
    }
    const validEditions = ['association', 'icon', 'statement'];
    const editions = Object.fromEntries(['jersey', 'shorts'].map(element => [element, validEditions.includes(build.e?.[element]) ? build.e[element] : 'icon']));
    return Object.keys(picks).length ? { mode: build.m, picks, editions } : null;
  } catch { return null; }
}

export const forgeBuildQuery = payload => new URLSearchParams({ build: encodeForgeBuild(payload.mode, payload.picks, payload.editions) }).toString();
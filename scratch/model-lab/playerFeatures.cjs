// Player-games-derived team features for the scratch model-lab harness.
// Strict chronology: every feature for a prediction on local date d uses only
// player-games strictly before d. Ranking ("top-5 by minutes") is itself
// computed from minutes strictly before each game, with a prior-season
// fallback so early-season ranks aren't noise.
'use strict';

const DATA_BASE = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';
const V4 = 'v4/releases/v4-site-12ad90dc8710';
const Q = 'v=20261002b';

// Fetch one season's player-games and reduce to the fields we need:
// { ref: [{ team, playerRef, minutes }] } grouped per game.
async function fetchSeason(year) {
  const registry = await (await fetch(`${DATA_BASE}${V4}/registry.json?${Q}`)).json();
  const entry = (registry.packages || []).find(p => p?.modelId === 'swishiq-canonical-v4'
    && p?.scope?.kind === 'exact-season' && Number(p?.scope?.seasonStartYear) === year);
  if (!entry) throw new Error(`no package for ${year}`);
  const packageRoot = `${V4}/${String(entry.projectionIndexPath).split('/').slice(0, -1).join('/')}`;
  const index = await (await fetch(`${DATA_BASE}${packageRoot}/index.json?${Q}`)).json();
  const part = (index.artifacts || []).find(a => a.artifactId === 'player-games');
  if (!part) throw new Error(`no player-games artifact for ${year}`);
  const data = await (await fetch(`${DATA_BASE}${V4}/${part.path}?${Q}`)).json();
  const byRef = new Map();
  for (const row of (data.records || [])) {
    if (row.time?.phase !== 'regular') continue;
    const e = row.entities || {};
    if (!e.gameRef || !e.teamCode) continue;
    let g = byRef.get(e.gameRef);
    if (!g) { g = new Map(); byRef.set(e.gameRef, g); }
    let side = g.get(e.teamCode);
    if (!side) { side = []; g.set(e.teamCode, side); }
    side.push({ playerRef: e.playerRef, minutes: Number(row.values?.minutes) || 0 });
  }
  return byRef;
}

// db.games: chronological [{ ref, date, season, home, away, ... }].
// Returns Map gameRef -> { home: feats, away: feats } where each feats object
// holds strictly-prior trailing availability stats for that side:
//   a5roll3 / a5roll5 — mean share of the then-top-5 (by prior minutes) that
//     appeared, over the team's last 3 / 5 games before this one.
//   a8roll3 — same for the top-8.
//   miss10 — count of top-5 absences over the team's last 10 games before it.
//   minTop5roll5 — share of team minutes logged by top-5 players, last 5 games
//     (rotation concentration; spikes when the rotation is shorthanded).
//   nPrior — number of prior team games observed (0 at a team's first game).
async function attachPlayerFeatures(db) {
  const years = [...db.WARMUP_YEARS, ...db.EVAL_YEARS];
  const seasons = await Promise.all(years.map(fetchSeason));
  const pgByRef = new Map();
  for (const s of seasons) for (const [ref, sides] of s) pgByRef.set(ref, sides);

  // team -> chronological list of { ref, date, season, side: Map playerRef->minutes }
  const byTeam = new Map();
  for (const g of db.games) {
    const sides = pgByRef.get(g.ref);
    if (!sides) continue;
    for (const [team, side] of sides) {
      if (team !== g.home && team !== g.away) continue;
      let list = byTeam.get(team);
      if (!list) { list = []; byTeam.set(team, list); }
      list.push({ ref: g.ref, date: g.date, season: g.season, minutes: side });
    }
  }

  const out = new Map(); // ref -> { home: {}, away: {} }
  for (const [team, list] of byTeam) {
    const curTotals = new Map();   // playerRef -> minutes, current season
    const prevTotals = new Map();  // playerRef -> minutes, prior season
    let curSeason = null;
    const trail = []; // per prior game: { a5, a8, miss5, topMin5 }
    for (const g of list) {
      if (g.season !== curSeason) {
        if (curSeason != null) { prevTotals.clear(); for (const [p, m] of curTotals) prevTotals.set(p, m); }
        curTotals.clear();
        curSeason = g.season;
      }
      const scoreOf = p => (curTotals.get(p) || 0) + 0.7 * (prevTotals.get(p) || 0);
      const ranked = [...new Set([...curTotals.keys(), ...prevTotals.keys()])]
        .sort((a, b) => scoreOf(b) - scoreOf(a));
      const top5 = ranked.slice(0, 5), top8 = ranked.slice(0, 8);
      const played = new Set(g.minutes.map(x => x.playerRef));
      const a5 = top5.length ? top5.filter(p => played.has(p)).length / top5.length : null;
      const a8 = top8.length ? top8.filter(p => played.has(p)).length / top8.length : null;
      const miss5 = top5.filter(p => !played.has(p)).length;
      let totMin = 0, topMin = 0;
      for (const x of g.minutes) { totMin += x.minutes; if (top5.includes(x.playerRef)) topMin += x.minutes; }
      const topMin5 = totMin > 0 ? topMin / totMin : null;

      // strictly-prior trailing aggregates
      const prior = trail.slice(-10);
      const meanOf = (arr, k, key) => {
        const use = arr.slice(-k).filter(x => x[key] != null);
        return use.length ? use.reduce((s, x) => s + x[key], 0) / use.length : null;
      };
      const feats = {
        nPrior: prior.length,
        a5roll3: meanOf(prior, 3, 'a5'),
        a5roll5: meanOf(prior, 5, 'a5'),
        a8roll3: meanOf(prior, 3, 'a8'),
        miss10: prior.reduce((s, x) => s + (x.miss5 || 0), 0),
        minTop5roll5: meanOf(prior, 5, 'topMin5'),
      };
      let slot = out.get(g.ref);
      if (!slot) { slot = {}; out.set(g.ref, slot); }
      slot[team] = feats;

      // postgame update
      trail.push({ a5, a8, miss5, topMin5 });
      if (trail.length > 12) trail.shift();
      for (const x of g.minutes) curTotals.set(x.playerRef, (curTotals.get(x.playerRef) || 0) + x.minutes);
    }
  }

  // The per-ref slot needs to know which side is home: db.games carries that.
  const fixed = new Map();
  for (const g of db.games) {
    const slot = out.get(g.ref);
    if (!slot) continue;
    fixed.set(g.ref, { home: slot[g.home] || null, away: slot[g.away] || null });
  }
  return fixed;
}

module.exports = { attachPlayerFeatures };
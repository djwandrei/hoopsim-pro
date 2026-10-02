// SwishIQ Studio — shared modeling helpers for the lab tools (client-side Monte Carlo).
import { mulberry32 } from '@/lib/season/simEngine';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function gauss(rng) {
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function observedPlayers(source) {
  const byRef = new Map();
  for (const row of source.playerSeasons || []) {
    if (!row.playerRef || !row.games || !row.minutes) continue;
    const prev = byRef.get(row.playerRef);
    if (prev) {
      prev.games += row.games; prev.minutes += row.minutes;
      prev.points += row.points; prev.rebounds += row.rebounds; prev.assists += row.assists;
      prev.turnovers += row.turnovers; prev.steals += row.steals; prev.blocks += row.blocks;
    } else {
      byRef.set(row.playerRef, {
        playerRef: row.playerRef, name: row.name, teamCode: row.teamCode, positions: row.positions || [], headshotPath:row.headshotPath || null,
        games: row.games, minutes: row.minutes, points: row.points, rebounds: row.rebounds,
        assists: row.assists, turnovers: row.turnovers, steals: row.steals, blocks: row.blocks,
      });
    }
  }
  return [...byRef.values()].filter(p => p.minutes > 0).sort((a, b) => b.minutes - a.minutes);
}

export function perGameStats(p) {
  const g = Math.max(1, p.games);
  return {
    mpg: p.minutes / g,
    pts: p.points / g, reb: p.rebounds / g, ast: p.assists / g,
    stl: p.steals / g, blk: p.blocks / g, tov: p.turnovers / g,
  };
}

export function per36Stats(p) {
  const m = Math.max(1, p.minutes);
  return {
    pts: p.points / m * 36, reb: p.rebounds / m * 36, ast: p.assists / m * 36,
    stl: p.steals / m * 36, blk: p.blocks / m * 36, tov: p.turnovers / m * 36,
  };
}

export function rosterLine(p) {
  const g = Math.max(1, p.games);
  return {
    playerRef: p.playerRef, name: p.name, positions: p.positions || [], games: p.games, minutes: p.minutes,
    pts: p.points / g, reb: p.rebounds / g, ast: p.assists / g, stl: p.steals / g, blk: p.blocks / g,
  };
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function band(sorted) {
  return {
    p10: percentile(sorted, 0.1), p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75), p90: percentile(sorted, 0.9),
  };
}

export function projectNextGame(player, opponent, league, { trials = 2000, seed = 11 } = {}) {
  const rates = per36Stats(player);
  const mpg = perGameStats(player).mpg;
  const defAvg = league.defAvg || 112;
  const teams = league.teams || [];
  const drbAvg = teams.reduce((sum, t) => sum + t.drb, 0) / (teams.length || 1);
  const ptsMult = opponent ? clamp(1 + (opponent.def - defAvg) / 100, 0.85, 1.15) : 1;
  const rebMult = opponent ? clamp(1 + (drbAvg - opponent.drb) * 2, 0.85, 1.15) : 1;
  const rng = mulberry32(seed >>> 0);
  const pts = []; const reb = []; const ast = [];
  for (let i = 0; i < trials; i += 1) {
    const min = clamp(mpg + gauss(rng) * 5.5, 8, 44);
    pts.push(min * rates.pts / 36 * ptsMult * Math.exp(gauss(rng) * 0.3));
    reb.push(min * rates.reb / 36 * rebMult * Math.exp(gauss(rng) * 0.32));
    ast.push(min * rates.ast / 36 * Math.exp(gauss(rng) * 0.38));
  }
  const dd = pts.reduce((count, v, i) => {
    const ddThis = (v >= 10 && (reb[i] >= 10 || ast[i] >= 10)) || (reb[i] >= 10 && ast[i] >= 10);
    return count + (ddThis ? 1 : 0);
  }, 0);
  return {
    mpg,
    pts: band([...pts].sort((a, b) => a - b)),
    reb: band([...reb].sort((a, b) => a - b)),
    ast: band([...ast].sort((a, b) => a - b)),
    p20: pts.filter(v => v >= 20).length / trials,
    p30: pts.filter(v => v >= 30).length / trials,
    pDoubleDouble: dd / trials,
  };
}

// Aging curves: [age, multiplier relative to a player's current per-36 rate].
const PTS_CURVE = [[20, 0.88], [22, 0.95], [24, 0.98], [26, 1.0], [28, 1.0], [30, 0.97], [32, 0.92], [34, 0.84], [36, 0.73], [38, 0.62], [40, 0.5]];
const REB_CURVE = [[20, 0.9], [24, 0.98], [27, 1.0], [30, 0.96], [33, 0.88], [36, 0.76], [38, 0.62], [40, 0.5]];
const AST_CURVE = [[20, 0.85], [24, 0.97], [27, 1.0], [31, 0.98], [34, 0.9], [37, 0.78], [40, 0.6]];
const MIN_CURVE = [[20, 0.75], [22, 0.88], [24, 0.96], [26, 1.0], [30, 0.98], [32, 0.9], [34, 0.78], [36, 0.62], [38, 0.45], [40, 0.3]];

function lookup(curve, age) {
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i += 1) {
    if (age <= curve[i][0]) {
      const [a0, v0] = curve[i - 1];
      const [a1, v1] = curve[i];
      return v0 + (v1 - v0) * (age - a0) / (a1 - a0);
    }
  }
  return curve[curve.length - 1][1];
}

export function projectCareer(player, { startAge = 24, seasons = 6, trials = 300, seed = 5 } = {}) {
  const rates = per36Stats(player);
  const mpg = perGameStats(player).mpg;
  const rng = mulberry32(seed >>> 0);
  const rows = Array.from({ length: seasons }, (_, i) => ({ age: startAge + i, minutes: [], pts: [], reb: [], ast: [] }));
  for (let t = 0; t < trials; t += 1) {
    for (const row of rows) {
      const minMult = lookup(MIN_CURVE, row.age) * Math.exp(gauss(rng) * 0.1);
      row.minutes.push(clamp(mpg * minMult, 8, 40));
      row.pts.push(rates.pts * lookup(PTS_CURVE, row.age) * Math.exp(gauss(rng) * 0.08));
      row.reb.push(rates.reb * lookup(REB_CURVE, row.age) * Math.exp(gauss(rng) * 0.09));
      row.ast.push(rates.ast * lookup(AST_CURVE, row.age) * Math.exp(gauss(rng) * 0.1));
    }
  }
  const median = list => percentile([...list].sort((a, b) => a - b), 0.5);
  const out = rows.map(row => {
    const sPts = [...row.pts].sort((a, b) => a - b);
    return {
      age: row.age,
      mpg: median(row.minutes),
      pts36: { p10: percentile(sPts, 0.1), p50: percentile(sPts, 0.5), p90: percentile(sPts, 0.9) },
      reb36: median(row.reb),
      ast36: median(row.ast),
    };
  });
  const peak = out.reduce((best, row) => (row.pts36.p50 > best.pts36.p50 ? row : best), out[0]);
  return { seasons: out, peak };
}

export function lineupChemistry(lineup) {
  if (lineup.length !== 5) return null;
  let guards = 0; let wings = 0; let bigs = 0;
  for (const p of lineup) {
    const pos = (p.positions || []).join(' ').toUpperCase();
    if (pos.includes('G')) guards += 1;
    if (pos.includes('F')) wings += 1;
    if (pos.includes('C')) bigs += 1;
  }
  const coverage = (guards > 0 ? 25 : 0) + (wings > 0 ? 25 : 0) + (bigs > 0 ? 25 : 0) + (guards >= 2 && bigs >= 1 ? 25 : 0);
  // Roster lines carry per-game fields plus season minutes.
  const r36 = lineup.map(p => ({
    pts: p.pts / Math.max(1, p.minutes) * 36,
    reb: p.reb / Math.max(1, p.minutes) * 36,
    ast: p.ast / Math.max(1, p.minutes) * 36,
  }));
  const sumPts = r36.reduce((s, x) => s + x.pts, 0) || 1;
  const shares = r36.map(x => x.pts / sumPts);
  const spread = shares.reduce((s, sh) => s + (sh - 0.2) ** 2, 0);
  const balance = clamp(1 - spread / 0.65, 0, 1) * 100;
  const playmaking = clamp(r36.reduce((s, x) => s + x.ast, 0) / 22, 0, 1) * 100;
  const rebounding = clamp(r36.reduce((s, x) => s + x.reb, 0) / 60, 0, 1) * 100;
  const experience = lineup.reduce((s, p) => s + clamp(p.games / 60, 0, 1), 0) / 5 * 100;
  const overall = Math.round(coverage * 0.3 + balance * 0.2 + playmaking * 0.175 + rebounding * 0.175 + experience * 0.15);
  return {
    overall,
    parts: [
      { label: 'Position coverage', value: coverage },
      { label: 'Scoring balance', value: Math.round(balance) },
      { label: 'Playmaking', value: Math.round(playmaking) },
      { label: 'Rebounding', value: Math.round(rebounding) },
      { label: 'Experience', value: Math.round(experience) },
    ],
  };
}

export function lineupTeam(baseTeam, lineup, chemistry) {
  const delta = clamp((chemistry - 55) / 45, -1, 1);
  const chosenRefs = new Set(lineup.map(p => p.playerRef));
  const bench = baseTeam.roster.filter(p => !chosenRefs.has(p.playerRef)).slice(0, 3);
  return {
    ...baseTeam,
    name: `${baseTeam.name} selected five`,
    off: baseTeam.off + delta * 3,
    def: baseTeam.def - delta * 2.4,
    roster: [...lineup, ...bench].map(p => ({ ...p })),
  };
}
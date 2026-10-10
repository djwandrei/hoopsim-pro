import { SKILLS } from './bapSkills.js';
import { forgePlayerScore } from './forgePool.js';

export const FORGE_SIM_MODEL = 'djhc-forge-four-factor-v3';
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const mean = (rows, key, fallback) => { const values = rows.map(r => r[key]).filter(Number.isFinite); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback; };
const binomial = (n, p, rng) => { let count = 0; for (let i = 0; i < n; i++) if (rng() < p) count++; return count; };
export const TEAM_SLOTS = [
  { key: 'PG', label: 'PG', starter: true, minutes: 36 }, { key: 'SG', label: 'SG', starter: true, minutes: 35 },
  { key: 'SF', label: 'SF', starter: true, minutes: 34 }, { key: 'PF', label: 'PF', starter: true, minutes: 33 },
  { key: 'C', label: 'C', starter: true, minutes: 32 }, { key: 'bench1', label: 'Bench 1', minutes: 27 },
  { key: 'bench2', label: 'Bench 2', minutes: 23 }, { key: 'bench3', label: 'Bench 3', minutes: 20 },
];
export function positionFits(positions, slot) {
  if (slot.startsWith('bench')) return true;
  const compatible = { PG: ['G', 'PG'], SG: ['G', 'SG', 'SF'], SF: ['F', 'SF', 'SG'], PF: ['F', 'PF', 'C'], C: ['C', 'PF'] };
  return positions.some(p => compatible[slot]?.includes(p));
}
export function rotationValid(slots, picks) {
  return slots.length === 8 && slots.every(s => picks[s.key]?.player && Number.isFinite(s.minutes) && s.minutes >= 0 && s.minutes <= 48) && slots.reduce((s, r) => s + r.minutes, 0) === 240 && new Set(slots.filter(s => s.minutes > 0).map(s => picks[s.key].player.playerRef)).size === slots.filter(s => s.minutes > 0).length;
}

// Skills affect the factors that create points, rather than decorating a donor-team average.
export function buildForgeProfile(league, ratings, { code = 'CMP', name = 'Composite', conference = 'EAST', roster = [], fitPenalty = 0 } = {}) {
  const teams = league.teams, d = key => ((Number.isFinite(ratings[key]) ? ratings[key] : 75) - 75) / 24;
  const efg = clamp(mean(teams, 'efg', .54) + .045 * d('jumpShot') + .03 * d('finishing') + .012 * d('playmaking'), .42, .66);
  const tov = clamp(mean(teams, 'tov', .13) - .025 * d('decision') - .008 * d('playmaking') + fitPenalty * .002, .075, .22);
  const ftr = clamp(mean(teams, 'ftr', .25) + .05 * d('finishing') + .025 * d('scoring'), .12, .42);
  const orb = clamp(mean(teams, 'orb', .27) + .045 * d('rebounding') + .008 * d('body'), .16, .4);
  const drb = clamp(mean(teams, 'drb', .73) + .06 * d('rebounding') + .008 * d('body'), .58, .85);
  const oppEfg = clamp(mean(teams, 'oppEfg', .54) - .025 * d('rimProtection') - .016 * d('perimeterDefense') - .004 * d('body'), .43, .63);
  const oppTov = clamp(mean(teams, 'oppTov', .13) + .025 * d('perimeterDefense'), .08, .2);
  const off = (league.offAvg || 112) + 100 * (efg - mean(teams, 'efg', .54)) - 115 * (tov - mean(teams, 'tov', .13)) + 30 * (orb - mean(teams, 'orb', .27)) + 15 * (ftr - mean(teams, 'ftr', .25)) + 2 * d('scoring') - fitPenalty * .5;
  const def = (league.defAvg || 112) + 100 * (oppEfg - mean(teams, 'oppEfg', .54)) - 115 * (oppTov - mean(teams, 'oppTov', .13)) - 30 * (drb - mean(teams, 'drb', .73)) + fitPenalty * .5;
  return { code, name, conference, roster, ratings, off, def, net: off - def, efg, tov, ftr, orb, drb, oppEfg, oppTov, oppFtr: mean(teams, 'oppFtr', .25), pace: clamp(mean(teams, 'pace', 99) + 1.5 * d('playmaking') + .5 * d('perimeterDefense'), 90, 106), threeShare: clamp(.38 + .07 * d('jumpShot'), .23, .5), ftRate: .77, clutch: clamp(d('clutch'), -1, 1), assistRate: clamp(.6 + .08 * d('playmaking'), .4, .78) };
}
export function rosterRatings(picks, slots) {
  return Object.fromEntries(SKILLS.map(skill => [skill.key, slots.reduce((s, slot) => s + (Number.isFinite(picks[slot.key]?.player?.[skill.key]) ? picks[slot.key].player[skill.key] : 75) * slot.minutes, 0) / 240]));
}

function shooting(team, opponent, poss, rng, league, homeBoost = 0, clutch = 0) {
  const leagueEfg = mean(league.teams, 'efg', .54), leagueTov = mean(league.teams, 'tov', .13), leagueFtr = mean(league.teams, 'ftr', .25);
  const efg = clamp(team.efg + opponent.oppEfg - leagueEfg + homeBoost + ((team.off - league.offAvg) + (opponent.def - league.defAvg)) * .00035 + .012 * clutch, .4, .68);
  const tovRate = clamp(team.tov + opponent.oppTov - leagueTov - .003 * clutch, .07, .24), ftr = clamp(team.ftr + opponent.oppFtr - leagueFtr, .1, .48);
  const orb = clamp((team.orb + 1 - opponent.drb) / 2, .12, .42), share = team.threeShare ?? .38, threeRate = clamp(.365 + (efg - leagueEfg) * .4, .25, .46);
  const twoRate = clamp((efg - 1.5 * threeRate * share) / (1 - share), .36, .72);
  const tov = binomial(poss, tovRate, rng), fga = Math.max(1, Math.round((poss - tov) / (1 + .44 * ftr - orb * (1 - (twoRate * (1 - share) + threeRate * share)))));
  const threeA = binomial(fga, share, rng), twoA = fga - threeA, threeM = binomial(threeA, threeRate, rng), twoM = binomial(twoA, twoRate, rng);
  const fta = Math.round(fga * ftr), ftm = binomial(fta, clamp((team.ftRate ?? .77) + .018 * clutch, .5, .96), rng);
  return { fga, fgm: threeM + twoM, threeA, threeM, twoA, twoM, fta, ftm, tov, pts: threeM * 3 + twoM * 2 + ftm, orbRate: orb };
}
function allocate(total, weights, caps = weights.map(() => Infinity)) {
  const out = weights.map(() => 0);
  for (let left = total; left > 0; left--) {
    let best = -1, priority = -Infinity;
    for (let i = 0; i < weights.length; i++) if (out[i] < caps[i]) { const score = weights[i] / (out[i] + 1); if (score > priority) { priority = score; best = i; } }
    if (best < 0) break; out[best]++;
  }
  return out;
}
function box(team, totals, rebounds, assists, steals, blocks, minutes) {
  if (!team.roster?.length) return [];
  const roster = team.roster.filter(p => (p.rotationMinutes ?? p.minutes) > 0).slice(0, 12), min = roster.map(p => p.rotationMinutes ?? p.minutes), sum = min.reduce((s, x) => s + x, 0);
  const weights = key => roster.map((p, i) => min[i] * Math.max(.1, (p.ratings?.[key] ?? p[key] ?? 75) / 75));
  const threeA = allocate(totals.threeA, weights('jumpShot')), twoA = allocate(totals.twoA, weights('finishing')), fta = allocate(totals.fta, weights('finishing'));
  const threeM = allocate(totals.threeM, weights('jumpShot'), threeA), twoM = allocate(totals.twoM, weights('finishing'), twoA), ftm = allocate(totals.ftm, weights('scoring'), fta);
  const reb = allocate(rebounds, weights('rebounding')), ast = allocate(assists, weights('playmaking')), stl = allocate(steals, weights('perimeterDefense')), blk = allocate(blocks, weights('rimProtection')), tov = allocate(totals.tov, weights('scoring'));
  return roster.map((p, i) => ({ playerRef: p.playerRef, name: p.name, min: minutes * 5 * min[i] / sum, pts: twoM[i] * 2 + threeM[i] * 3 + ftm[i], fga: twoA[i] + threeA[i], fgm: twoM[i] + threeM[i], threeA: threeA[i], threeM: threeM[i], fta: fta[i], ftm: ftm[i], reb: reb[i], ast: ast[i], stl: stl[i], blk: blk[i], tov: tov[i] }));
}
export function simulateForgeGame(league, home, away, rng, { neutral = false, includeBox = false } = {}) {
  let poss = Math.round(clamp((home.pace + away.pace) / 2 + (rng() + rng() - 1) * 8, 85, 115)), ot = 0;
  const early = Math.round(poss * 43 / 48);
  const hs = shooting(home, away, early, rng, league, neutral ? 0 : .007), as = shooting(away, home, early, rng, league);
  const merge = (target, extra) => { for (const key of ['fga', 'fgm', 'threeA', 'threeM', 'twoA', 'twoM', 'fta', 'ftm', 'tov', 'pts']) target[key] += extra[key]; };
  // A bounded game heuristic for a close final period; not a possession-level
  // reconstruction or a calibrated claim about future clutch performance.
  const close = Math.abs(hs.pts - as.pts) <= 5;
  merge(hs, shooting(home, away, poss - early, rng, league, neutral ? 0 : .007, close ? home.clutch || 0 : 0));
  merge(as, shooting(away, home, poss - early, rng, league, 0, close ? away.clutch || 0 : 0));
  while (hs.pts === as.pts && ot < 12) {
    ot++; const extra = Math.max(8, Math.round(poss * 5 / 48));
    merge(hs, shooting(home, away, extra, rng, league, neutral ? 0 : .007, home.clutch || 0));
    merge(as, shooting(away, home, extra, rng, league, 0, away.clutch || 0));
  }
  // Extremely rare repeated ties resolve with a scored free throw; box totals stay coherent.
  if (hs.pts === as.pts) { const winner = rng() < .5 ? hs : as; winner.fta++; winner.ftm++; winner.pts++; }
  poss = Math.round(poss * (48 + ot * 5) / 48);
  const hm = hs.fga - hs.fgm, am = as.fga - as.fgm, horb = binomial(hm, hs.orbRate, rng), aorb = binomial(am, as.orbRate, rng);
  const hAst = binomial(hs.fgm, home.assistRate ?? .6, rng), aAst = binomial(as.fgm, away.assistRate ?? .6, rng);
  const hStl = binomial(as.tov, .52, rng), aStl = binomial(hs.tov, .52, rng), hBlk = binomial(am, .1, rng), aBlk = binomial(hm, .1, rng);
  return { home: home.code, away: away.code, homePts: hs.pts, awayPts: as.pts, poss, ot, totalsHome: hs, totalsAway: as, ortgH: 100 * hs.pts / poss, ortgA: 100 * as.pts / poss,
    boxHome: includeBox ? box(home, hs, horb + am - aorb, hAst, hStl, hBlk, 48 + ot * 5) : [], boxAway: includeBox ? box(away, as, aorb + hm - horb, aAst, aStl, aBlk, 48 + ot * 5) : [] };
}

function series(league, hi, lo, rng) {
  let hw = 0, lw = 0; const games = [];
  while (hw < 4 && lw < 4) { const homeHigher = [0, 1, 4, 6].includes(games.length), game = simulateForgeGame(league, homeHigher ? hi : lo, homeHigher ? lo : hi, rng); games.push(game); if ((homeHigher ? game.homePts : game.awayPts) > (homeHigher ? game.awayPts : game.homePts)) hw++; else lw++; }
  return { higher: hi.code, lower: lo.code, winner: hw > lw ? hi.code : lo.code, winsHigher: hw, winsLower: lw, games };
}
export function forgePlayoffs(league, standings, rng) {
  const rounds = [], champs = [], reach = {};
  for (const conference of ['EAST', 'WEST']) {
    const ranked = standings.filter(r => r.conference === conference).map(r => league.byCode.get(r.code));
    if (ranked.length < 8) return null;
    const playIn = [];
    let seeds = ranked.slice(0, 8);
    if (ranked.length >= 10) {
      const play = (home, away) => { const game = simulateForgeGame(league, home, away, rng), winner = game.homePts > game.awayPts ? home : away; playIn.push({ ...game, winner: winner.code }); return winner; };
      const w78 = play(ranked[6], ranked[7]), loser = w78 === ranked[6] ? ranked[7] : ranked[6], w910 = play(ranked[8], ranked[9]), w8 = play(loser, w910);
      ranked.slice(6, 10).forEach(t => { reach[t.code] = 'playIn'; }); seeds = [...ranked.slice(0, 6), w78, w8];
    }
    let pairs = [[seeds[0], seeds[7]], [seeds[3], seeds[4]], [seeds[1], seeds[6]], [seeds[2], seeds[5]]]; const log = [];
    for (const name of ['First round', 'Conference semifinals', 'Conference finals']) {
      const winners = pairs.map(([hi, lo]) => { const played = series(league, hi, lo, rng); log.push({ ...played, round: name }); reach[hi.code] = name; reach[lo.code] = name; return league.byCode.get(played.winner); });
      if (winners.length === 1) champs.push(winners[0]);
      pairs = winners.length === 4 ? [[winners[0], winners[1]], [winners[2], winners[3]]] : winners.length === 2 ? [[winners[0], winners[1]]] : [];
    }
    rounds.push({ conference, playIn, series: log });
  }
  const finals = series(league, champs[0], champs[1], rng); reach[champs[0].code] = 'finals'; reach[champs[1].code] = 'finals'; reach[finals.winner] = 'champion';
  return { rounds, finals, champion: finals.winner, reach };
}

export function forgeSeason(league, schedule, seed, detailed = true) {
  const rng = seededRandom(seed), state = new Map(league.teams.map(t => [t.code, { ...t, wins: 0, losses: 0, games: 0, pf: 0, pa: 0, poss: 0 }])), games = [];
  for (const entry of schedule) {
    const home = league.byCode.get(entry.home), away = league.byCode.get(entry.away); if (!home || !away) continue;
    const game = simulateForgeGame(league, home, away, rng, { includeBox: detailed && (home.code === 'FRG' || away.code === 'FRG') });
    for (const [team, pts, allowed] of [[home, game.homePts, game.awayPts], [away, game.awayPts, game.homePts]]) { const s = state.get(team.code); s.games++; s.pf += pts; s.pa += allowed; s.poss += game.poss; if (pts > allowed) s.wins++; else s.losses++; }
    if (detailed && (home.code === 'FRG' || away.code === 'FRG')) games.push({ ...game, at: entry.at, gameId: entry.id });
  }
  const standings = [...state.values()].map(s => ({ code: s.code, name: s.name, conference: s.conference, wins: s.wins, losses: s.losses, games: s.games, winPct: s.wins / (s.games || 1), pd: s.pf - s.pa, ortg: 100 * s.pf / (s.poss || 1), drtg: 100 * s.pa / (s.poss || 1) })).sort((a, b) => b.winPct - a.winPct || b.pd - a.pd || a.code.localeCompare(b.code));
  return { standings, games, bracket: forgePlayoffs(league, standings, rng), seed, model: FORGE_SIM_MODEL };
}
export function teamGrade(ratings) { return forgePlayerScore(ratings); }

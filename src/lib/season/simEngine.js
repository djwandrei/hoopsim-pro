// SwishIQ Season Lab — possession/four-factor simulation engine (client-side).
// Team profiles come from the published SwishIQ package (observed rates);
// every simulated line is modeled, never observed.
import { buildGamePeriods } from '@/lib/season/gamePeriods';
import { buildGameReplay } from '@/lib/season/gameReplay';
import { replayBoxScores } from '@/lib/season/replayBoxScores';

export const CONFERENCE_BY_TEAM = {
  ATL: 'EAST', BKN: 'EAST', BOS: 'EAST', CHA: 'EAST', CHI: 'EAST', CLE: 'EAST', DET: 'EAST',
  IND: 'EAST', MIA: 'EAST', MIL: 'EAST', NYK: 'EAST', ORL: 'EAST', PHI: 'EAST', TOR: 'EAST', WAS: 'EAST',
  DAL: 'WEST', DEN: 'WEST', GSW: 'WEST', HOU: 'WEST', LAC: 'WEST', LAL: 'WEST', MEM: 'WEST',
  MIN: 'WEST', NOP: 'WEST', OKC: 'WEST', PHX: 'WEST', POR: 'WEST', SAC: 'WEST', SAS: 'WEST', UTA: 'WEST',
};

export const TEAM_NAMES = {
  ATL: 'Atlanta Hawks', BKN: 'Brooklyn Nets', BOS: 'Boston Celtics', CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons', GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'Los Angeles Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves', NOP: 'New Orleans Pelicans',
  NYK: 'New York Knicks', OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers',
  PHX: 'Phoenix Suns', POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs',
  TOR: 'Toronto Raptors', UTA: 'Utah Jazz', WAS: 'Washington Wizards',
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng) {
  let u = 0; let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

const num = value => (Number.isFinite(Number(value)) ? Number(value) : null);

export function buildLeague(source) {
  const seasonRows = (source.teamStyles || []).filter(row => row.phase === 'regular' && row.metrics);
  const seasonByPlayer = new Map((source.playerSeasons || []).map(row => [row.playerRef, row]));
  const membershipsByPlayer = new Map();
  for (const row of source.memberships || []) {
    if (!membershipsByPlayer.has(row.playerRef)) membershipsByPlayer.set(row.playerRef, row);
  }
  const teams = seasonRows
    .filter(row => num(row.metrics.offense) !== null && num(row.metrics.defense) !== null)
    .map(row => {
      const m = row.metrics;
      const roster = (source.playerSeasons || [])
        .filter(p => p.teamCode === row.teamCode && p.games > 0 && p.minutes > 0)
        .map(p => {
          const member = membershipsByPlayer.get(p.playerRef);
          return {
            playerRef: p.playerRef,
            name: p.name,
            positions: member?.positions || p.positions || [],
            games: p.games,
            minutes: p.minutes,
            pts: p.points / p.games,
            reb: p.rebounds / p.games,
            ast: p.assists / p.games,
            stl: p.steals / p.games,
            blk: p.blocks / p.games,
          };
        })
        .sort((a, b) => b.minutes - a.minutes);
      return {
        code: row.teamCode,
        name: TEAM_NAMES[row.teamCode] || row.teamCode,
        conference: CONFERENCE_BY_TEAM[row.teamCode] || 'EAST',
        off: num(m.offense) || 112,
        def: num(m.defense) || 112,
        net: num(m.net) ?? (num(m.offense) || 112) - (num(m.defense) || 112),
        pace: num(m.pace48) || 99,
        ppg: num(m.pointsPerGame),
        papg: num(m.pointsAllowedPerGame),
        efg: num(m.effectiveFieldGoal) || 0.53,
        ftr: num(m.freeThrowAttemptRate) || 0.25,
        orb: num(m.offensiveReboundRate) || 0.28,
        drb: num(m.defensiveReboundRate) || 0.72,
        tov: num(m.turnoverRate) || 0.13,
        oppEfg: num(m.opponentEffectiveFieldGoal) || 0.53,
        oppFtr: num(m.opponentFreeThrowAttemptRate) || 0.25,
        oppTov: num(m.opponentTurnoverRate) || 0.13,
        roster,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  const byCode = new Map(teams.map(team => [team.code, team]));
  const defAvg = teams.reduce((sum, t) => sum + t.def, 0) / (teams.length || 1);
  const offAvg = teams.reduce((sum, t) => sum + t.off, 0) / (teams.length || 1);
  const seasonYear = Number(source.entry?.scope?.seasonStartYears?.[0]) || null;
  return {
    label: seasonYear ? seasonLabel(seasonYear) : 'Season',
    seasonStartYear: seasonYear,
    teams,
    byCode,
    defAvg,
    offAvg,
    packagePin: source.entry || null,
    hasActualResults: (source.schedule || []).some(game => game.actual),
  };
}

export function seasonLabel(year) {
  return `${year}\u2013${String(Number(year) + 1).slice(-2)}`;
}

// Live pinned model (season-lab-model): matchup weights are 0.5 own-offense /
// 0.5 opponent-defense at rate scale 2 — each side's delta from the league
// mean is applied at full strength, so strong teams keep their real gap.
// Managed blends (0.35 / 0.65) tilt one side up and the other down.
function expectedOrtg(off, oppDef, leagueOff, leagueDef, offenseWeight, defenseWeight) {
  return leagueOff
    + (off - leagueOff) * offenseWeight * 2
    + (oppDef - leagueDef) * defenseWeight * 2;
}

function shootTotals(team, opp, poss, pts, rng) {
  const tov = clamp((team.tov + opp.oppTov) / 2, 0.08, 0.24) * poss;
  const fga = Math.max(15, (poss - tov) * 0.775);
  const fta = clamp((team.ftr + opp.oppFtr) / 2, 0.08, 0.5) * fga;
  const ftm = fta * 0.77;
  const efg = clamp((team.efg + opp.oppEfg) / 2, 0.4, 0.68);
  const fgPts = Math.max(0, pts - ftm);
  const fgm = clamp(fgPts / 2.15, fga * 0.25, fga * 0.62);
  return { tov, fga, fta, ftm, fgm, efg };
}

function rebTotals(shootHome, shootAway, home, away) {
  const missHome = shootHome.fga - shootHome.fgm;
  const missAway = shootAway.fga - shootAway.fgm;
  const drbRateHome = clamp((home.drb + (1 - away.orb)) / 2, 0.55, 0.9);
  const drbRateAway = clamp((away.drb + (1 - home.orb)) / 2, 0.55, 0.9);
  return {
    orebH: missHome * (1 - drbRateAway), drebH: missAway * drbRateHome,
    orebA: missAway * (1 - drbRateHome), drebA: missHome * drbRateAway,
  };
}

function buildBox(team, rng, totals, teamPts, teamReb, teamAst, teamStl, teamBlk, gameMinutes = 48) {
  const rotation = team.roster.slice(0, 10);
  if (!rotation.length) return { minutes: [], lines: [] };
  // Include every overtime period in player minutes and team minutes.
  const minutes = rotation.length <= 5
    ? distribute(gameMinutes * 5, rotation.map(() => 1), () => 0.5)
    : distribute(gameMinutes * 5, rotation.map(p => p.minutes), rng);
  const perMin = p => i => (minutes[i] / Math.max(8, p.minutes || 1));
  const ptsArr = distribute(Math.round(teamPts), rotation.map((p, i) => (p.pts + 1.0) * perMin(p)(i)), rng);
  const rebArr = distribute(Math.round(teamReb), rotation.map((p, i) => (p.reb + 0.5) * perMin(p)(i)), rng);
  const astArr = distribute(Math.round(teamAst), rotation.map((p, i) => (p.ast + 0.3) * perMin(p)(i)), rng);
  const stlArr = distribute(Math.round(teamStl), rotation.map((p, i) => (p.stl + 0.1) * perMin(p)(i)), rng);
  const blkArr = distribute(Math.round(teamBlk), rotation.map((p, i) => (p.blk + 0.1) * perMin(p)(i)), rng);
  return {
    minutes,
    lines: rotation.map((p, i) => ({
      name: p.name,
      positions: p.positions,
      min: minutes[i],
      pts: ptsArr[i],
      reb: rebArr[i],
      ast: astArr[i],
      stl: stlArr[i],
      blk: blkArr[i],
    })).sort((a, b) => b.min - a.min || b.pts - a.pts),
  };
}

function distribute(total, weights, rng) {
  if (!weights.length || total <= 0) return weights.map(() => 0);
  const noise = weights.map(w => Math.max(0.01, w) * (0.75 + rng() * 0.5));
  const sum = noise.reduce((a, b) => a + b, 0);
  const raw = noise.map(w => (w / sum) * total);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => [value - floors[index], index]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) floors[order[k % order.length][1]] += 1;
  return floors;
}

function scorePoints(ortg, poss, rng) {
  return Math.max(62, Math.round(ortg * poss / 100 + gauss(rng) * 11));
}

function simGame(home, away, rng, { defenseWeight = 0.5, offenseWeight = 0.5, homeCourt = 1.6, neutral = false, log = false, leagueDef = 112, leagueOff = 112 } = {}) {
  // Live pace envelope (NATIVE_PACE): floor 70, ceiling 110.
  const poss = clamp((home.pace + away.pace) / 2, 70, 110);
  const hca = neutral ? 0 : homeCourt;
  const ortgH = expectedOrtg(home.off, away.def, leagueOff, leagueDef, offenseWeight, defenseWeight) + hca;
  const ortgA = expectedOrtg(away.off, home.def, leagueOff, leagueDef, offenseWeight, defenseWeight);
  const regulationHome = scorePoints(ortgH, poss, rng);
  const regulationAway = scorePoints(ortgA, poss, rng);
  let hp = regulationHome; let ap = regulationAway;
  const overtime = [];
  // Live policy caps overtime at six periods (maxOvertimes: 6); any residue
  // resolves with a seeded coin flip so records never contain ties.
  while (hp === ap && overtime.length < 6) {
    const otPoss = poss * 5 / 48;
    const period = {
      home: Math.max(0, Math.round(ortgH * otPoss / 100 + gauss(rng) * 3)),
      away: Math.max(0, Math.round(ortgA * otPoss / 100 + gauss(rng) * 3)),
    };
    overtime.push(period); hp += period.home; ap += period.away;
  }
  if (hp === ap) { if (rng() < 0.5) hp += 1; else ap += 1; }
  const ot = overtime.length;
  const gameMinutes = 48 + ot * 5;
  const totalPoss = poss * gameMinutes / 48;
  const sh = shootTotals(home, away, totalPoss, hp, rng);
  const sa = shootTotals(away, home, totalPoss, ap, rng);
  const rebs = rebTotals(sh, sa, home, away);
  const rebH = Math.round(rebs.orebH) + Math.round(rebs.drebH);
  const rebA = Math.round(rebs.orebA) + Math.round(rebs.drebA);
  const astH = Math.round(sh.fgm * 0.6 * (0.9 + rng() * 0.2));
  const astA = Math.round(sa.fgm * 0.6 * (0.9 + rng() * 0.2));
  const stlH = Math.round(sa.tov * 0.55);
  const stlA = Math.round(sh.tov * 0.55);
  const blkH = Math.round((sa.fga - sa.fgm) * 0.062);
  const blkA = Math.round((sh.fga - sh.fgm) * 0.062);
  const result = {
    poss: totalPoss, ot, ortgH, ortgA,
    homePts: hp, awayPts: ap,
    boxHome: buildBox(home, rng, sh, hp, rebH, astH, stlH, blkH, gameMinutes),
    boxAway: buildBox(away, rng, sa, ap, rebA, astA, stlA, blkA, gameMinutes),
  };
  if (!log) return result;
  const periods = buildGamePeriods(regulationHome, regulationAway, overtime, rng);
  const pbp = buildGameReplay(home, away, periods, rng);
  return { ...result, ...replayBoxScores(result.boxHome, result.boxAway, pbp), pbp };
}

export function runRepeat(league, schedule, { seed = 1, playoffs = true, defenseWeight = 0.8, bestOf = 7 } = {}) {
  const rng = mulberry32(seed >>> 0);
  const state = new Map(league.teams.map(team => [team.code, {
    wins: 0, losses: 0, pf: 0, pa: 0, poss: 0, ortgSum: 0, games: 0,
  }]));
  const games = [];
  for (const g of schedule) {
    const home = league.byCode.get(g.home);
    const away = league.byCode.get(g.away);
    if (!home || !away) continue;
    const game = simGame(home, away, rng, { defenseWeight, leagueDef: league.defAvg });
    const hs = state.get(home.code);
    const as = state.get(away.code);
    if (game.homePts > game.awayPts) { hs.wins += 1; as.losses += 1; } else { as.wins += 1; hs.losses += 1; }
    hs.pf += game.homePts; hs.pa += game.awayPts; hs.poss += game.poss; hs.ortgSum += game.ortgH; hs.games += 1;
    as.pf += game.awayPts; as.pa += game.homePts; as.poss += game.poss; as.ortgSum += game.ortgA; as.games += 1;
    games.push({
      at: g.at || null, home: home.code, away: away.code,
      homePts: game.homePts, awayPts: game.awayPts, ot: game.ot, poss: game.poss,
      ortgH: game.ortgH, ortgA: game.ortgA,
      boxHome: game.boxHome, boxAway: game.boxAway,
      actual: g.actual || null,
    });
  }
  const standings = league.teams.map(team => {
    const s = state.get(team.code);
    return {
      code: team.code, name: team.name, conference: team.conference,
      wins: s.wins, losses: s.losses, games: s.games, pf: s.pf, pa: s.pa,
      pd: s.pf - s.pa, winPct: s.games ? s.wins / s.games : 0,
      ortg: s.games ? 100 * s.pf / s.poss : 0,
      drtg: s.games ? 100 * s.pa / s.poss : 0,
      pace: s.games ? s.poss / s.games : 0,
    };
  }).sort((a, b) => b.winPct - a.winPct || b.pd - a.pd);
  const bracket = playoffs ? simulatePlayoffs(league, standings, rng, { defenseWeight, bestOf }) : null;
  return { seed, standings, games, bracket };
}

function simSeries(higher, lower, bestOf, rng, options) {
  const need = Math.ceil((bestOf + 1) / 2);
  const homeGames = bestOf === 7 ? [1, 2, 5, 7] : [1, 2, 5];
  const hiTeam = higher.team || higher;
  const loTeam = lower.team || lower;
  let hw = 0; let lw = 0; const results = [];
  for (let gameNo = 1; hw < need && lw < need; gameNo += 1) {
    const homeHigher = homeGames.includes(gameNo);
    const game = homeHigher ? simGame(hiTeam, loTeam, rng, options) : simGame(loTeam, hiTeam, rng, options);
    const hi = homeHigher ? game.homePts : game.awayPts;
    const lo = homeHigher ? game.awayPts : game.homePts;
    if (hi > lo) hw += 1; else lw += 1;
    results.push({
      game: gameNo,
      home: homeHigher ? higher.code : lower.code,
      away: homeHigher ? lower.code : higher.code,
      homePts: game.homePts, awayPts: game.awayPts,
    });
  }
  return { winner: hw > lw ? higher : lower, loser: hw > lw ? lower : higher, higher, lower, results };
}

function bracketPairs(count) {
  let slots = [0];
  while (slots.length < count) {
    const size = slots.length * 2;
    const next = [];
    for (const slot of slots) { next.push(slot); next.push(size - 1 - slot); }
    slots = next;
  }
  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i], slots[i + 1]]);
  return pairs;
}

function simulatePlayoffs(league, standings, rng, { defenseWeight, leagueDef, bestOf: seriesBestOf }) {
  const options = { defenseWeight, homeCourt: 1.6, leagueDef };
  const bestOf = seriesBestOf || 7;
  const reach = {};
  const rounds = [];
  const conferenceChamps = [];
  let playIn = [];
  const conferenceRows = { EAST: standings.filter(row => row.conference === 'EAST'), WEST: standings.filter(row => row.conference === 'WEST') };
  if (Object.values(conferenceRows).some(rows => rows.length < 2)) return null;
  for (const conference of ['EAST', 'WEST']) {
    const rows = standings.filter(row => row.conference === conference).slice(0, 10)
      .map((row, index) => ({ ...row, seed: index + 1, team: league.byCode.get(row.code) }));
    let bracketSeeds;
    if (rows.length >= 10) {
      const seed7 = rows[6]; const seed8 = rows[7]; const seed9 = rows[8]; const seed10 = rows[9];
      const g1 = simGame(seed7.team, seed8.team, rng, options);
      const w78 = g1.homePts > g1.awayPts ? seed7 : seed8;
      const l78 = w78 === seed7 ? seed8 : seed7;
      const g2 = simGame(seed9.team, seed10.team, rng, options);
      const w910 = g2.homePts > g2.awayPts ? seed9 : seed10;
      const g3 = simGame(l78.team, w910.team, rng, options);
      const seed8Winner = g3.homePts > g3.awayPts ? l78 : w910;
      for (const row of [seed7, seed8, seed9, seed10]) reach[row.code] = 'playIn';
      reach[w78.code] = 'r1';
      reach[seed8Winner.code] = 'r1';
      playIn = [
        { home: seed7.code, homeSeed: 7, away: seed8.code, awaySeed: 8, homePts: g1.homePts, awayPts: g1.awayPts, winner: w78.code, label: 'Seeds 7 vs 8 — winner advances to the first round' },
        { home: seed9.code, homeSeed: 9, away: seed10.code, awaySeed: 10, homePts: g2.homePts, awayPts: g2.awayPts, winner: w910.code, label: 'Seeds 9 vs 10 — winner stays alive' },
        { home: l78.code, homeSeed: seed7.code === l78.code ? 7 : 8, away: w910.code, awaySeed: seed9.code === w910.code ? 9 : 10, homePts: g3.homePts, awayPts: g3.awayPts, winner: seed8Winner.code, label: 'Play-in final — winner takes the last bracket seed' },
      ];
      bracketSeeds = [...rows.slice(0, 6), w78, seed8Winner];
    } else {
      bracketSeeds = rows.slice(0, 8);
    }
    const seededCount = 2 ** Math.floor(Math.log2(bracketSeeds.length));
    // Standard NBA bracket: 1v8 / 4v5 / 2v7 / 3v6 in the first round, and
    // winners cross instead of re-seeding (so the 1 and 2 seeds can only meet
    // in the conference finals). Round names follow the rounds remaining.
    const totalRounds = Math.max(1, Math.round(Math.log2(seededCount)));
    const roundName = left => (left >= 3 ? 'First round' : left === 2 ? 'Conference semifinals' : 'Conference finals');
    const reachName = left => (left >= 3 ? 'r1' : left === 2 ? 'sf' : 'cf');
    let pending = bracketPairs(seededCount).map(([a, b]) => [bracketSeeds[a], bracketSeeds[b]]);
    const seriesLog = [];
    let roundIndex = 0;
    let conferenceChamp = null;
    while (pending.length > 0) {
      const left = totalRounds - roundIndex;
      const name = roundName(left);
      const winners = [];
      for (const [first, second] of pending) {
        const series = simSeries(first, second, bestOf, rng, options);
        seriesLog.push({ round: name, higher: series.higher.code, lower: series.lower.code, higherSeed: series.higher.seed, lowerSeed: series.lower.seed, winner: series.winner.code, games: series.results });
        reach[series.loser.code] = reachName(left);
        winners.push(series.winner);
      }
      // Winners stay in bracket order: adjacent winners meet in the next round.
      pending = [];
      for (let i = 0; i + 1 < winners.length; i += 2) pending.push([winners[i], winners[i + 1]]);
      if (winners.length === 1) conferenceChamp = winners[0];
      roundIndex += 1;
    }
    rounds.push({ conference, playIn, series: seriesLog });
    conferenceChamps.push(conferenceChamp);
  }
  const finals = simSeries(conferenceChamps[0], conferenceChamps[1], bestOf, rng, options);
  reach[finals.loser.code] = 'finals';
  reach[finals.winner.code] = 'champion';
  return { rounds, finals: { higher: finals.higher.code, lower: finals.lower.code, higherSeed: finals.higher.seed, lowerSeed: finals.lower.seed, games: finals.results, winner: finals.winner.code }, champion: finals.winner.code, reach };
}

export function actualStandings(source) {
  const wins = new Map(); const losses = new Map();
  for (const game of source.schedule || []) {
    if (!game.actual) continue;
    for (const code of [game.home, game.away]) {
      if (!wins.has(code)) { wins.set(code, 0); losses.set(code, 0); }
    }
    if (game.actual.home > game.actual.away) { wins.set(game.home, wins.get(game.home) + 1); losses.set(game.away, losses.get(game.away) + 1); }
    else { wins.set(game.away, wins.get(game.away) + 1); losses.set(game.home, losses.get(game.home) + 1); }
  }
  return wins;
}

export function aggregateRepeats(previous, repeat) {
  const agg = previous || { repeats: 0, teams: {} };
  agg.repeats += 1;
  for (const row of repeat.standings) {
    const slot = agg.teams[row.code] || (agg.teams[row.code] = { wins: [], playoff: 0, confFinals: 0, champion: 0, ortg: [], drtg: [], pace: [] });
    slot.wins.push(row.wins);
    slot.ortg.push(row.ortg); slot.drtg.push(row.drtg); slot.pace.push(row.pace);
    const reach = repeat.bracket?.reach?.[row.code];
    if (reach && reach !== 'playIn') slot.playoff += 1;
    if (reach === 'cf' || reach === 'finals' || reach === 'champion') slot.confFinals += 1;
    if (reach === 'champion') slot.champion += 1;
  }
  return agg;
}

const median = list => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function summarizeAggregate(agg) {
  return Object.entries(agg.teams).map(([code, slot]) => ({
    code, wins: median(slot.wins), playoff: slot.playoff / agg.repeats,
    confFinals: slot.confFinals / agg.repeats, title: slot.champion / agg.repeats,
    ortg: median(slot.ortg), drtg: median(slot.drtg), pace: median(slot.pace),
    winsList: slot.wins,
  }));
}

export function buildGeneratedSchedule(teams, seed) {
  const rng = mulberry32(seed >>> 0);
  const codes = teams.map(team => team.code);
  const n = codes.length;
  const anchor = codes[n - 1];
  const circle = codes.slice(0, n - 1);
  const games = [];
  const pairCount = Math.floor(n / 2);
  const anchorSlot = Math.floor((n - 1) / 2);
  for (let round = 0; round < 82; round += 1) {
    const rotated = circle.map((_, i) => circle[(i + round) % (n - 1)]);
    for (let i = 0; i < pairCount; i += 1) {
      let home; let away;
      if (i < pairCount - 1) {
        const a = rotated[i]; const b = rotated[(n - 2) - i];
        home = (i + round) % 2 === 0 ? a : b;
        away = home === a ? b : a;
      } else {
        const a = rotated[anchorSlot];
        home = round % 2 === 0 ? anchor : a;
        away = home === anchor ? a : anchor;
      }
      games.push({ at: null, home, away, actual: null });
    }
  }
  // The rotation method can drift several home games off a fair 41/41 split,
  // so rebalance in schedule order: the team with fewer home games hosts.
  const homeCount = new Map(codes.map(code => [code, 0]));
  for (const game of games) {
    if (homeCount.get(game.home) - homeCount.get(game.away) > 0) {
      const team = game.home;
      game.home = game.away;
      game.away = team;
    }
    homeCount.set(game.home, homeCount.get(game.home) + 1);
  }
  return games;
}

export function nextLeague(league, year) {
  return {
    ...league,
    label: seasonLabel(year),
    seasonStartYear: year,
    generated: true,
  };
}

export function simSingleGame(league, home, away, { seed = 1, neutral = false, defenseWeight = 0.8, log = false } = {}) {
  const rng = mulberry32(seed >>> 0);
  return simGame(home, away, rng, { defenseWeight, neutral, log, leagueDef: league.defAvg });
}
// SwishIQ Season Lab — possession/four-factor simulation engine (client-side).
// Team profiles come from the published SwishIQ package (observed rates);
// every simulated line is modeled, never observed.

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

function expectedOrtg(off, oppDef, leagueDef, weight) {
  return off + (oppDef - leagueDef) * weight;
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
    orebH: missAway * (1 - drbRateAway), drebH: missAway * drbRateAway,
    orebA: missHome * (1 - drbRateHome), drebA: missHome * drbRateHome,
  };
}

function buildBox(team, rng, totals, teamPts, teamReb, teamAst, teamStl, teamBlk) {
  const rotation = team.roster.slice(0, 10);
  if (!rotation.length) return { minutes: [], lines: [] };
  const minutes = distribute(240, rotation.map(p => p.minutes), rng);
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

// ---- Play-by-play feed (only generated for watched games) ----
const QUARTER_SECONDS = 720;
const TWO_SHOTS = ['a driving layup', 'a pull-up jumper', 'a floater in the lane', 'a fadeaway from the elbow', 'a contested runner'];
const THREE_SHOTS = ['a corner 3', 'a stepback 3', 'a catch-and-shoot 3', 'a transition 3'];
const RIM_DUNKS = ['throws down a one-hand dunk', 'elevates for a two-hand slam', 'finishes an alley-oop flush'];

function splitPeriods(total, periods, rng) {
  const weights = Array.from({ length: periods }, () => 0.7 + rng() * 0.6);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (w / sum) * total);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => [value - floors[index], index]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k += 1) floors[order[k % order.length][1]] += 1;
  return floors;
}

function pickPlayer(team, rng, notName) {
  const rotation = team.roster.slice(0, 10);
  if (!rotation.length) return null;
  const filtered = notName ? rotation.filter(p => p.name !== notName) : [];
  const pool = filtered.length ? filtered : rotation;
  const weights = pool.map(p => Math.max(0.5, p.minutes || 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function buildPbp(home, away, hp, ap, ot, rng) {
  const periods = 4 + ot;
  const hTargets = splitPeriods(hp, periods, rng);
  const aTargets = splitPeriods(ap, periods, rng);
  const events = [];
  let hs = 0; let as = 0;
  const push = (q, clock, side, type, text, pts, stat) => events.push({ q, clock: fmtClock(clock), side, type, text, pts: pts || 0, score: [hs, as], stat });
  for (let q = 0; q < periods; q += 1) {
    const label = q < 4 ? `Q${q + 1}` : `OT${q - 3}`;
    let clock = QUARTER_SECONDS;
    let hq = hTargets[q]; let aq = aTargets[q];
    push(label, clock, null, 'period', `${label} is underway`);
    let guard = 0;
    while ((hq > 0 || aq > 0) && guard < 240) {
      guard += 1;
      const side = hq <= 0 ? 'away' : aq <= 0 ? 'home' : (rng() < 0.5 ? 'home' : 'away');
      const team = side === 'home' ? home : away;
      const opp = side === 'home' ? away : home;
      const remain = side === 'home' ? hq : aq;
      const player = pickPlayer(team, rng);
      if (!player) break;
      clock = Math.max(2, clock - (9 + Math.floor(rng() * 17)));
      const r = rng();
      let scored = 0; let text = ''; let type = 'made'; let stat = null;
      if (remain <= 0 || r < 0.09) {
        type = 'to';
        const thief = rng() < 0.3 ? pickPlayer(opp, rng) : null;
        stat = thief ? { turnover: player.name, steal: thief.name } : { turnover: player.name };
        text = thief ? `${player.name} turns it over — ${thief.name} jumps the lane for ${opp.code}` : `${player.name} loses the handle — turnover, ${opp.code} ball`;
      } else if (remain === 1 || r < 0.24) {
        type = 'ft';
        stat = { scorer: player.name };
        if (remain === 1 || rng() < 0.4) {
          if (rng() < 0.72) { scored = 1; text = `${player.name} hits 1 of 2 at the line`; }
          else { text = `${player.name} misfires from the stripe`; }
        } else { scored = 2; text = `${player.name} sinks both free throws`; }
      } else if (r < 0.4) {
        type = 'miss';
        const board = pickPlayer(opp, rng);
        const shot = rng() < 0.42 ? THREE_SHOTS[Math.floor(rng() * THREE_SHOTS.length)] : TWO_SHOTS[Math.floor(rng() * TWO_SHOTS.length)];
        stat = board ? { rebound: board.name } : null;
        text = `${player.name} misses ${shot}${board ? ` — ${board.name} corrals the board` : ''}`;
      } else if (r < 0.62) {
        const helper = rng() < 0.55 ? pickPlayer(team, rng, player.name) : null;
        scored = 2;
        const dunk = rng() < 0.22;
        stat = helper ? { scorer: player.name, assist: helper.name } : { scorer: player.name };
        text = dunk ? `${player.name} ${RIM_DUNKS[Math.floor(rng() * RIM_DUNKS.length)]}${helper ? ` off the ${helper.name} feed` : ''}` : `${player.name} finishes ${TWO_SHOTS[Math.floor(rng() * TWO_SHOTS.length)]}${helper ? ` (assist: ${helper.name})` : ''}`;
      } else if (remain >= 3) {
        scored = 3;
        const helper = rng() < 0.6 ? pickPlayer(team, rng, player.name) : null;
        stat = helper ? { scorer: player.name, assist: helper.name } : { scorer: player.name };
        text = `${player.name} splashes ${THREE_SHOTS[Math.floor(rng() * THREE_SHOTS.length)]}${helper ? ` (assist: ${helper.name})` : ''}`;
      } else {
        scored = 2;
        stat = { scorer: player.name };
        text = `${player.name} punches in ${TWO_SHOTS[Math.floor(rng() * TWO_SHOTS.length)]}`;
      }
      if (scored) {
        if (side === 'home') { hs += scored; hq -= scored; } else { as += scored; aq -= scored; }
      }
      push(label, clock, side, type, text, scored, stat);
    }
    push(label, clock, null, 'period', `End of ${label} — ${home.code} ${hs}, ${away.code} ${as}`);
  }
  const winner = hp > ap ? home : away;
  const loser = hp > ap ? away : home;
  push(ot ? `${ot}OT` : 'FINAL', 0, null, 'final', `FINAL — ${winner.code} ${Math.max(hp, ap)}, ${loser.code} ${Math.min(hp, ap)}`);
  return events;
}

function simGame(home, away, rng, { defenseWeight = 0.8, homeCourt = 1.6, neutral = false, log = false } = {}) {
  const poss = clamp((home.pace + away.pace) / 2, 88, 112);
  const hca = neutral ? 0 : homeCourt;
  const ortgH = expectedOrtg(home.off, away.def, LEAGUE.defAvg, defenseWeight) + hca;
  const ortgA = expectedOrtg(away.def, home.def, LEAGUE.defAvg, defenseWeight);
  let hp = scorePoints(ortgH, poss, rng);
  let ap = scorePoints(ortgA, poss, rng);
  let ot = 0;
  while (hp === ap) {
    ot += 1;
    const otPoss = 5 * (poss / 48);
    hp += Math.round(((ortgH + ortgA) / 2) * otPoss / 200 + gauss(rng) * 2);
    ap += Math.round(((ortgH + ortgA) / 2) * otPoss / 200 + gauss(rng) * 2);
  }
  const sh = shootTotals(home, away, poss, hp, rng);
  const sa = shootTotals(away, home, poss, ap, rng);
  const rebs = rebTotals(sh, sa, home, away);
  const rebH = Math.round(rebs.orebH + rebs.drebH);
  const rebA = Math.round(rebs.orebA + rebs.drebA);
  const astH = Math.round(sh.fgm * 0.6 * (0.9 + rng() * 0.2));
  const astA = Math.round(sa.fgm * 0.6 * (0.9 + rng() * 0.2));
  const stlH = Math.round(sa.tov * 0.55);
  const stlA = Math.round(sh.tov * 0.55);
  const blkH = Math.round((sa.fga - sa.fgm) * 0.062);
  const blkA = Math.round((sh.fga - sh.fgm) * 0.062);
  const result = {
    poss, ot, ortgH, ortgA,
    homePts: hp, awayPts: ap,
    boxHome: buildBox(home, rng, sh, hp, rebH, astH, stlH, blkH),
    boxAway: buildBox(away, rng, sa, ap, rebA, astA, stlA, blkA),
  };
  if (!log) return result;
  return {
    ...result,
    statsHome: { ...sh, orb: Math.round(rebs.orebH), dreb: Math.round(rebs.drebH), reb: rebH, ast: astH, stl: stlH, blk: blkH },
    statsAway: { ...sa, orb: Math.round(rebs.orebA), dreb: Math.round(rebs.drebA), reb: rebA, ast: astA, stl: stlA, blk: blkA },
    pbp: buildPbp(home, away, hp, ap, ot, rng),
  };
}

let LEAGUE = { defAvg: 112 };

export function runRepeat(league, schedule, { seed = 1, playoffs = true, defenseWeight = 0.8 } = {}) {
  LEAGUE = league;
  const rng = mulberry32(seed >>> 0);
  const state = new Map(league.teams.map(team => [team.code, {
    wins: 0, losses: 0, pf: 0, pa: 0, poss: 0, ortgSum: 0, games: 0,
  }]));
  const games = [];
  for (const g of schedule) {
    const home = league.byCode.get(g.home);
    const away = league.byCode.get(g.away);
    if (!home || !away) continue;
    const game = simGame(home, away, rng, { defenseWeight });
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
  const bracket = playoffs ? simulatePlayoffs(league, standings, rng, { defenseWeight }) : null;
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
  return { winner: hw > lw ? higher : lower, loser: hw > lw ? lower : higher, results };
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

function simulatePlayoffs(league, standings, rng, { defenseWeight }) {
  const options = { defenseWeight, homeCourt: 1.6 };
  const reach = {};
  const rounds = [];
  const conferenceChamps = [];
  const conferenceRows = { EAST: standings.filter(row => row.conference === 'EAST'), WEST: standings.filter(row => row.conference === 'WEST') };
  if (Object.values(conferenceRows).some(rows => rows.length < 2)) return null;
  for (const conference of ['EAST', 'WEST']) {
    const rows = standings.filter(row => row.conference === conference).slice(0, 10)
      .map(row => ({ ...row, team: league.byCode.get(row.code) }));
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
      bracketSeeds = [...rows.slice(0, 6), w78, seed8Winner];
    } else {
      bracketSeeds = rows.slice(0, 8);
    }
    const seededCount = 2 ** Math.floor(Math.log2(bracketSeeds.length));
    let survivors = bracketSeeds.slice(0, seededCount);
    const roundNames = ['First round', 'Conference semifinals', 'Conference finals', 'Semifinals', 'Finals'];
    const reachNames = ['r1', 'sf', 'cf', 'semis', 'finals'];
    const seriesLog = [];
    let roundIndex = 0;
    while (survivors.length > 1) {
      const name = roundNames[Math.min(roundIndex, roundNames.length - 1)];
      const winners = [];
      for (let i = 0; i < survivors.length; i += 2) {
        const series = simSeries(survivors[i], survivors[i + 1], 7, rng, options);
        seriesLog.push({ round: name, higher: series.winner.code, lower: series.loser.code, games: series.results, winner: series.winner.code });
        reach[series.loser.code] = reachNames[Math.min(roundIndex, reachNames.length - 1)];
        winners.push(series.winner);
      }
      survivors = winners;
      roundIndex += 1;
    }
    rounds.push({ conference, series: seriesLog });
    conferenceChamps.push(survivors[0]);
  }
  const finals = simSeries(conferenceChamps[0], conferenceChamps[1], 7, rng, options);
  reach[finals.loser.code] = 'finals';
  reach[finals.winner.code] = 'champion';
  return { rounds, finals: { higher: finals.winner.code, lower: finals.loser.code, games: finals.results, winner: finals.winner.code }, champion: finals.winner.code, reach };
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
  LEAGUE = league;
  const rng = mulberry32(seed >>> 0);
  return simGame(home, away, rng, { defenseWeight, neutral, log });
}
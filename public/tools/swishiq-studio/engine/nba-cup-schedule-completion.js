/*
 * Seeded scenario completion for the 2026-27 NBA regular-season calendar.
 *
 * The published NBA schedule fixes 80 games per club and leaves two games per
 * club to be assigned from Emirates NBA Cup Group Play results. This module
 * never edits those 80 rows. It validates them, resolves Cup standings and
 * qualifiers from explicit simulated results, and compiles a separate set of
 * 30 scenario game slots. Quarterfinal-dependent semifinal and consolation
 * participants are resolved after quarterfinal scores are supplied.
 *
 * Pairing detail: NBA publishes constraints, but not every internal value of
 * its formulaic 22-team matchup algorithm or all travel inputs. Therefore the
 * non-qualifier matchups here are a declared, seeded model: a low-cost path
 * heavily favors pairs already scheduled three times, uses two bottom-team
 * cross-conference games, and labels travel as unmodeled unless a complete
 * distance matrix is supplied. These are not claimed to be the NBA's final
 * announced matchups.
 */

import {
  NBA_TEAM_CODES,
  NBA_TEAM_CONFERENCES,
} from './nba-schedule-source.js?v=20260925c&rev=structure-v1';

export const NBA_CUP_COMPLETION_VERSION = 'nba-cup-2026-schedule-completion-v1';
export const NBA_CUP_RULE_SOURCES = Object.freeze({
  schedule: 'https://www.nba.com/news/2026-27-nba-regular-season-schedule',
  cupRules: 'https://www.nba.com/news/nba-cup-101',
  asOf: '2026-09-25',
});

const TEAM_SET = new Set(NBA_TEAM_CODES);
const CONFERENCES = Object.freeze(['east', 'west']);
const DEFAULT_GROUP_GAMES = 60;
const ANNOUNCED_GAMES_PER_TEAM = 80;
const COMPLETED_GAMES_PER_TEAM = 82;
const GENERATED_GAME_COUNT = 30;
const fail = message => { throw new Error(message); };
const isInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const normalizeId = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const pairKey = (left, right) => [left, right].sort().join('|');

function hash32(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateSeed(seed) {
  if (typeof seed !== 'string' || !/^[A-Za-z0-9:._-]{1,80}$/.test(seed)) {
    fail('NBA Cup schedule completion needs an explicit replayable seed.');
  }
  return seed;
}

function validateSeason(seasonStartYear) {
  if (Number(seasonStartYear) !== 2026) {
    fail('This NBA Cup completion contract is source-pinned to the 2026-27 season; later seasons need their own accepted schedule and ruleset.');
  }
  return 2026;
}

function validateTeamIds(teamIds = NBA_TEAM_CODES) {
  if (!Array.isArray(teamIds) || teamIds.length !== 30) fail('NBA Cup completion requires all thirty NBA teams.');
  const teams = [...teamIds].map(team => String(team || '').trim().toUpperCase()).sort();
  if (new Set(teams).size !== 30 || teams.some(team => !TEAM_SET.has(team))) fail('NBA Cup completion received unknown or duplicate NBA teams.');
  return teams;
}

function validateAnnouncedGames(announcedGames, teams, seasonStartYear) {
  if (!Array.isArray(announcedGames) || announcedGames.length !== 1200) {
    fail('The published 2026-27 schedule must contain exactly 1,200 immutable games (80 appearances per team) before Cup completion.');
  }
  const teamSet = new Set(teams);
  const ids = new Set();
  const appearances = Object.fromEntries(teams.map(team => [team, 0]));
  const homeGames = Object.fromEntries(teams.map(team => [team, 0]));
  const pairCounts = new Map();
  const games = announcedGames.map((raw, index) => {
    if (!raw || typeof raw !== 'object') fail(`Published schedule row ${index + 1} is invalid.`);
    const id = normalizeId(raw.id);
    if (!id || ids.has(id)) fail(`Published schedule row ${index + 1} has a missing or duplicate game ID.`);
    if (!teamSet.has(raw.home) || !teamSet.has(raw.away) || raw.home === raw.away) fail(`Published schedule game ${id} has invalid home/away teams.`);
    if (raw.seasonStartYear != null && Number(raw.seasonStartYear) !== seasonStartYear) fail(`Published schedule game ${id} escapes the 2026-27 season.`);
    if (!['regular', 'in_season_tournament'].includes(raw.phase || 'regular')) fail(`Published schedule game ${id} is not a regular-season or Cup Group Play game.`);
    if (raw.standingsEligible === false || raw.countsTowardStandings === false) fail(`Published schedule game ${id} is not eligible for the regular-season ledger.`);
    ids.add(id);
    appearances[raw.home] += 1;
    appearances[raw.away] += 1;
    homeGames[raw.home] += 1;
    const key = pairKey(raw.home, raw.away);
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    // Preserve announced rows exactly; only validate them before use.
    return { ...raw };
  });
  const invalid = teams.filter(team => appearances[team] !== ANNOUNCED_GAMES_PER_TEAM);
  if (invalid.length) fail(`Published schedule coverage is incomplete; every NBA team must have exactly 80 announced games. First mismatch: ${invalid[0]} has ${appearances[invalid[0]]}.`);
  const cupGroupGames = games.filter(game => (game.phase || 'regular') === 'in_season_tournament');
  if (cupGroupGames.length !== DEFAULT_GROUP_GAMES) {
    fail('The published schedule must contain exactly sixty NBA Cup Group Play games.');
  }
  return { games, ids, appearances, homeGames, pairCounts };
}

function normalizeGroups(groups, teams) {
  if (!Array.isArray(groups) || groups.length !== 6) fail('Cup Group Play requires six explicitly simulated groups of five teams.');
  const assigned = new Map();
  const normalized = groups.map((group, index) => {
    const groupId = normalizeId(group?.groupId || group?.id);
    const conference = String(group?.conference || '').trim().toLowerCase();
    if (!groupId || !CONFERENCES.includes(conference) || !Array.isArray(group.teams) || group.teams.length !== 5) fail(`Cup group ${index + 1} is missing a unique ID, conference, or five team IDs.`);
    const members = group.teams.map(team => String(team || '').trim().toUpperCase()).sort();
    if (new Set(members).size !== 5 || members.some(team => !teams.includes(team))) fail(`Cup group ${groupId} has unknown or duplicate teams.`);
    for (const team of members) {
      if (NBA_TEAM_CONFERENCES[team] !== conference) fail(`Cup group ${groupId} crosses the NBA conference boundary.`);
      if (assigned.has(team)) fail(`NBA team ${team} appears in multiple Cup groups.`);
      assigned.set(team, groupId);
    }
    return { groupId, conference, teams: members };
  }).sort((a, b) => a.groupId.localeCompare(b.groupId));
  if (new Set(normalized.map(group => group.groupId)).size !== 6 || assigned.size !== 30 || teams.some(team => !assigned.has(team))) {
    fail('Cup Group Play must assign all thirty NBA teams exactly once across six groups.');
  }
  return { groups: normalized, groupById: new Map(normalized.map(group => [group.groupId, group])), groupByTeam: assigned };
}

function normalizePriorRecords(priorSeasonRecords, teams) {
  const records = new Map();
  if (Array.isArray(priorSeasonRecords)) {
    for (const row of priorSeasonRecords) {
      const teamId = String(row?.teamId || row?.team || '').trim().toUpperCase();
      if (!teamId || records.has(teamId)) fail('Prior-season NBA records have a missing or duplicate team key.');
      records.set(teamId, { wins: Number(row.wins), losses: Number(row.losses) });
    }
  } else if (priorSeasonRecords && typeof priorSeasonRecords === 'object') {
    for (const [rawTeam, row] of Object.entries(priorSeasonRecords)) {
      const teamId = rawTeam.trim().toUpperCase();
      if (records.has(teamId)) fail('Prior-season NBA records have a duplicate team key.');
      records.set(teamId, { wins: Number(row?.wins), losses: Number(row?.losses) });
    }
  } else fail('Cup tiebreaking needs the source season’s complete regular-season records.');
  if (records.size !== 30 || teams.some(team => !records.has(team))) fail('Cup tiebreaking needs one prior-season record for every NBA team.');
  for (const team of teams) {
    const row = records.get(team);
    if (!isInteger(row.wins, 0, 82) || !isInteger(row.losses, 0, 82) || row.wins + row.losses !== 82) {
      fail(`Cup tiebreaking needs an exact 82-game prior-season record for ${team}.`);
    }
  }
  return records;
}

function normalizeGroupResults(groupResults, { teams, groups, groupById, groupByTeam, announced }) {
  if (!Array.isArray(groupResults) || groupResults.length !== DEFAULT_GROUP_GAMES) fail('Cup Group Play needs all sixty explicit simulated game results.');
  const seen = new Set();
  const playedPairs = new Set();
  const normalized = groupResults.map((game, index) => {
    const id = normalizeId(game?.id || game?.gameId);
    const groupId = normalizeId(game?.groupId);
    if (!id || seen.has(id) || !announced.ids.has(id)) fail(`Cup result ${index + 1} must map to one unique published 2026-27 schedule game.`);
    const group = groupById.get(groupId);
    const home = String(game.home || '').trim().toUpperCase();
    const away = String(game.away || '').trim().toUpperCase();
    const scheduled = announced.games.find(row => row.id === id);
    if (scheduled.phase !== 'in_season_tournament') fail(`Cup result ${id} must map to a published Cup Group Play game.`);
    if (scheduled.groupId != null && normalizeId(scheduled.groupId) !== groupId) {
      fail(`Cup result ${id} does not match its immutable published group assignment.`);
    }
    if (!group || !groupByTeam.has(home) || !group.teams.includes(home) || !group.teams.includes(away) || home === away) fail(`Cup result ${id} has invalid group participants.`);
    if (scheduled.home !== home || scheduled.away !== away) fail(`Cup result ${id} does not match its immutable published home/away assignment.`);
    if (!isInteger(game.homeScore, 0, 250) || !isInteger(game.awayScore, 0, 250) || game.homeScore === game.awayScore) fail(`Cup result ${id} needs a valid non-tied final score.`);
    const homeOvertimePoints = Number(game.homeOvertimePoints);
    const awayOvertimePoints = Number(game.awayOvertimePoints);
    const overtimePeriods = Number(game.overtimePeriods);
    if (!isInteger(homeOvertimePoints, 0, game.homeScore) || !isInteger(awayOvertimePoints, 0, game.awayScore)
      || !isInteger(overtimePeriods, 0, 10) || (overtimePeriods === 0 && (homeOvertimePoints > 0 || awayOvertimePoints > 0))) {
      fail(`Cup result ${id} has invalid overtime scoring for NBA tiebreak calculations.`);
    }
    if (overtimePeriods > 0 && game.homeScore - homeOvertimePoints !== game.awayScore - awayOvertimePoints) {
      fail(`Cup result ${id} must have tied regulation scores when overtime is recorded.`);
    }
    const pair = pairKey(home, away);
    if (playedPairs.has(pair)) fail(`Cup Group Play repeats the same pair: ${home} vs ${away}.`);
    seen.add(id); playedPairs.add(pair);
    return {
      id, groupId, conference: group.conference, home, away,
      homeScore: game.homeScore, awayScore: game.awayScore,
      homeOvertimePoints, awayOvertimePoints, overtimePeriods,
    };
  }).sort((a, b) => a.groupId.localeCompare(b.groupId) || a.id.localeCompare(b.id));

  const appearanceCounts = Object.fromEntries(teams.map(team => [team, 0]));
  const groupPairs = new Map();
  for (const game of normalized) {
    appearanceCounts[game.home] += 1; appearanceCounts[game.away] += 1;
    const key = pairKey(game.home, game.away);
    groupPairs.set(key, (groupPairs.get(key) || 0) + 1);
  }
  if (teams.some(team => appearanceCounts[team] !== 4) || [...groupPairs.values()].some(count => count !== 1)) {
    fail('Cup Group Play must contain exactly four games per team and one game against each of its four group opponents.');
  }
  for (const group of groups) {
    const games = normalized.filter(game => game.groupId === group.groupId);
    if (games.length !== 10) fail(`Cup group ${group.groupId} must contain ten round-robin results.`);
  }
  return normalized;
}

function createStats(teams, groupByTeam, priorRecords) {
  return new Map(teams.map(team => [team, {
    teamId: team,
    groupId: groupByTeam.get(team),
    conference: NBA_TEAM_CONFERENCES[team],
    wins: 0,
    losses: 0,
    pointDifferential: 0,
    totalPoints: 0,
    priorWins: priorRecords.get(team).wins,
    priorLosses: priorRecords.get(team).losses,
    headToHeadWins: new Map(),
  }]));
}

function accumulateCupStats(stats, groupResults) {
  for (const game of groupResults) {
    const home = stats.get(game.home), away = stats.get(game.away);
    const homeTieBreakPoints = game.homeScore - game.homeOvertimePoints;
    const awayTieBreakPoints = game.awayScore - game.awayOvertimePoints;
    const overtime = game.overtimePeriods > 0;
    const margin = overtime ? 0 : homeTieBreakPoints - awayTieBreakPoints;
    home.totalPoints += homeTieBreakPoints; away.totalPoints += awayTieBreakPoints;
    home.pointDifferential += margin; away.pointDifferential -= margin;
    if (game.homeScore > game.awayScore) {
      home.wins += 1; away.losses += 1;
      home.headToHeadWins.set(game.away, (home.headToHeadWins.get(game.away) || 0) + 1);
    } else {
      away.wins += 1; home.losses += 1;
      away.headToHeadWins.set(game.home, (away.headToHeadWins.get(game.home) || 0) + 1);
    }
  }
}

function tieCompare(left, right, seed, scope) {
  const numeric = right.wins - left.wins
    || right.pointDifferential - left.pointDifferential
    || right.totalPoints - left.totalPoints
    || right.priorWins - left.priorWins
    || left.priorLosses - right.priorLosses;
  if (numeric) return numeric;
  const leftDraw = hash32(`${seed}|${scope}|${left.teamId}`);
  const rightDraw = hash32(`${seed}|${scope}|${right.teamId}`);
  return leftDraw - rightDraw || left.teamId.localeCompare(right.teamId);
}

function compareByMetric(left, right, metric) {
  const a = metric.value(left), b = metric.value(right);
  if (a === b) return 0;
  return metric.direction === 'asc' ? (a < b ? -1 : 1) : (a > b ? -1 : 1);
}

function buildOrderingTrace(rows, metrics) {
  let buckets = [rows.slice()];
  const criteria = [];
  for (const metric of metrics) {
    const nextBuckets = [];
    for (const bucket of buckets) {
      const sorted = bucket.slice().sort((left, right) => compareByMetric(left, right, metric));
      const partitions = [];
      for (const row of sorted) {
        const value = metric.value(row);
        let partition = partitions.at(-1);
        if (!partition || partition.value !== value) {
          partition = { value, rows: [] };
          partitions.push(partition);
        }
        partition.rows.push(row);
      }
      nextBuckets.push(...partitions.map(partition => partition.rows));
    }
    buckets = nextBuckets;
    criteria.push({
      criterion: metric.criterion,
      scoresByTeam: rows.map(row => ({ teamId: row.teamId, value: metric.value(row) })),
      orderedTeamIds: buckets.flatMap(bucket => bucket.map(row => row.teamId)),
      unresolvedTeamIds: buckets.filter(bucket => bucket.length > 1).map(bucket => bucket.map(row => row.teamId)),
    });
  }
  const orderedRows = buckets.flat();
  const decisions = orderedRows.slice(1).map((row, index) => {
    const previous = orderedRows[index];
    const decidingMetric = metrics.find(metric => metric.value(previous) !== metric.value(row));
    return {
      higherTeamId: previous.teamId,
      lowerTeamId: row.teamId,
      resolvedBy: decidingMetric?.criterion || 'unresolved',
    };
  });
  const decisionCriteria = [...new Set(decisions.map(decision => decision.resolvedBy))];
  return {
    orderedRows,
    trace: {
      orderedTeamIds: orderedRows.map(row => row.teamId),
      resolvedBy: decisionCriteria.length === 1 ? decisionCriteria[0] : decisionCriteria.length ? 'multiple-criteria' : 'not-tied',
      criteria,
      orderDecisions: decisions,
    },
  };
}

function rankGroup(group, stats, seed) {
  const entries = group.teams.map(team => stats.get(team));
  const winBuckets = new Map();
  for (const row of entries) {
    if (!winBuckets.has(row.wins)) winBuckets.set(row.wins, []);
    winBuckets.get(row.wins).push(row);
  }
  const ranked = [];
  const tieTraces = [];
  for (const wins of [...winBuckets.keys()].sort((a, b) => b - a)) {
    const tied = winBuckets.get(wins);
    if (tied.length === 1) {
      ranked.push(...tied);
      continue;
    }
    const headToHead = row => tied.reduce((total, other) => total + (row.headToHeadWins.get(other.teamId) || 0), 0);
    const ordering = buildOrderingTrace(tied, [
      { criterion: 'head-to-head-record-within-tied-group', value: headToHead, direction: 'desc' },
      { criterion: 'group-point-differential', value: row => row.pointDifferential, direction: 'desc' },
      { criterion: 'group-total-points-excluding-overtime', value: row => row.totalPoints, direction: 'desc' },
      { criterion: 'prior-season-wins', value: row => row.priorWins, direction: 'desc' },
      { criterion: 'prior-season-losses', value: row => row.priorLosses, direction: 'asc' },
      { criterion: 'seeded-random-draw', value: row => hash32(`${seed}|group-draw|${group.groupId}|${row.teamId}`), direction: 'asc' },
      { criterion: 'team-id-final-fallback', value: row => row.teamId, direction: 'asc' },
    ]);
    ranked.push(...ordering.orderedRows);
    tieTraces.push({ tiedTeamIds: tied.map(row => row.teamId).sort(), ...ordering.trace });
  }
  return {
    rows: ranked.map((row, index) => ({ ...row, groupRank: index + 1, groupId: group.groupId, conference: group.conference })),
    trace: {
      groupId: group.groupId,
      conference: group.conference,
      orderedTeamIds: ranked.map(row => row.teamId),
      ties: tieTraces,
    },
  };
}

function summarizeStanding(row) {
  return {
    teamId: row.teamId, groupId: row.groupId, conference: row.conference,
    groupRank: row.groupRank, wins: row.wins, losses: row.losses,
    pointDifferential: row.pointDifferential, totalPoints: row.totalPoints,
    priorSeasonRecord: { wins: row.priorWins, losses: row.priorLosses },
  };
}

function costForPair(left, right, pairCounts, standingsByTeam) {
  const count = pairCounts.get(pairKey(left.teamId || left, right.teamId || right)) || 0;
  // The NBA states that these games use existing three-times opponents where
  // possible. Prefer a 3x existing pair, then the nearest available frequency.
  const pairPenalty = count === 3 ? 0 : count === 2 ? 100 : count === 1 ? 200 : count === 0 ? 300 : 500;
  const a = standingsByTeam.get(left.teamId || left), b = standingsByTeam.get(right.teamId || right);
  const rankPenalty = a && b ? Math.abs(a.conferenceRank - b.conferenceRank) : 0;
  return pairPenalty * 100 + rankPenalty;
}

function comparePathOrder(left, right, seed, scope) {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftPriority = hash32(`${seed}|${scope}|${left[index]}`);
    const rightPriority = hash32(`${seed}|${scope}|${right[index]}`);
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  }
  return left.length - right.length;
}

function minimumCostConferencePath({ start, end, middle, pairCounts, standingsByTeam, seed, conference }) {
  const nodes = [...middle].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const fullMask = (1 << nodes.length) - 1;
  const memo = new Map();
  const solve = (mask, lastIndex) => {
    const key = `${mask}:${lastIndex}`;
    if (memo.has(key)) return memo.get(key);
    const last = nodes[lastIndex];
    if (mask === fullMask) {
      const terminal = { cost: costForPair(last, end, pairCounts, standingsByTeam), order: [last.teamId] };
      memo.set(key, terminal); return terminal;
    }
    let best = null;
    for (let next = 0; next < nodes.length; next += 1) {
      if (mask & (1 << next)) continue;
      const remainder = solve(mask | (1 << next), next);
      const candidate = {
        cost: costForPair(last, nodes[next], pairCounts, standingsByTeam) + remainder.cost,
        order: [last.teamId, ...remainder.order],
      };
      if (!best || candidate.cost < best.cost
        || (candidate.cost === best.cost && comparePathOrder(candidate.order, best.order, seed, `${conference}|path`) < 0)) best = candidate;
    }
    memo.set(key, best);
    return best;
  };
  let best = null;
  for (let first = 0; first < nodes.length; first += 1) {
    const candidate = solve(1 << first, first);
    const total = { cost: costForPair(start, nodes[first], pairCounts, standingsByTeam) + candidate.cost,
      order: [start.teamId, ...candidate.order, end.teamId] };
    if (!best || total.cost < best.cost
      || (total.cost === best.cost && comparePathOrder(total.order, best.order, seed, `${conference}|path`) < 0)) best = total;
  }
  return { order: best.order, cost: best.cost };
}

function travelDistance(travelMiles, left, right) {
  if (!travelMiles || typeof travelMiles !== 'object') return null;
  const value = travelMiles[pairKey(left, right)] ?? travelMiles[`${left}-${right}`] ?? travelMiles[`${right}-${left}`];
  if (typeof value === 'string' && !value.trim()) return null;
  const miles = Number(value);
  return Number.isFinite(miles) && miles >= 0 ? miles : null;
}

function selectCrossPairing(eastBottom, westBottom, travelMiles, seed) {
  const alternatives = [
    { mode: 'same-standing-rank', pairs: [[eastBottom[0], westBottom[0]], [eastBottom[1], westBottom[1]]] },
    { mode: 'crossed-standing-rank', pairs: [[eastBottom[0], westBottom[1]], [eastBottom[1], westBottom[0]]] },
  ];
  const scored = alternatives.map(option => {
    const distances = option.pairs.map(([east, west]) => travelDistance(travelMiles, east.teamId, west.teamId));
    const complete = distances.every(Number.isFinite);
    return { ...option, complete, distance: complete ? distances.reduce((sum, value) => sum + value, 0) : null,
      tie: hash32(`${seed}|cross-pairing|${option.mode}`) };
  });
  const allRoutesKnown = alternatives.flatMap(option => option.pairs)
    .every(([east, west]) => Number.isFinite(travelDistance(travelMiles, east.teamId, west.teamId)));
  if (allRoutesKnown) return scored.sort((a, b) => a.distance - b.distance || a.tie - b.tie)[0];
  return scored.sort((a, b) => a.tie - b.tie)[0];
}

function gameId(year, suffix) { return `nba-cup-${year}-${suffix}`; }

function orientNonQualifierCycle(cycle, baseHome, seed) {
  const size = cycle.length;
  if (size !== 22) fail('The Cup non-qualifier schedule cycle must include all twenty-two eliminated teams.');
  const memo = new Map();
  const solve = (index, previousEdgeHomeLeft, firstEdgeHomeLeft) => {
    const key = `${index}|${previousEdgeHomeLeft}|${firstEdgeHomeLeft}`;
    if (memo.has(key)) return memo.get(key);
    if (index === size) {
      const generatedHome = firstEdgeHomeLeft + (1 - previousEdgeHomeLeft);
      const homeTotal = baseHome[cycle[0]] + generatedHome;
      return { imbalance: Math.abs(homeTotal - 41), nonAlternating: generatedHome === 1 ? 0 : 1, edges: [] };
    }
    let best = null;
    for (const edgeHomeLeft of [0, 1]) {
      const generatedHome = edgeHomeLeft + (1 - previousEdgeHomeLeft);
      const homeTotal = baseHome[cycle[index]] + generatedHome;
      const rest = solve(index + 1, edgeHomeLeft, firstEdgeHomeLeft);
      const candidate = {
        imbalance: Math.abs(homeTotal - 41) + rest.imbalance,
        nonAlternating: (generatedHome === 1 ? 0 : 1) + rest.nonAlternating,
        edges: [edgeHomeLeft, ...rest.edges],
      };
      const candidateHash = hash32(`${seed}|home-orientation|${candidate.edges.join('')}`);
      const bestHash = best ? hash32(`${seed}|home-orientation|${best.edges.join('')}`) : 0;
      if (!best || candidate.imbalance < best.imbalance
        || (candidate.imbalance === best.imbalance && candidate.nonAlternating < best.nonAlternating)
        || (candidate.imbalance === best.imbalance && candidate.nonAlternating === best.nonAlternating && candidateHash < bestHash)) best = candidate;
    }
    memo.set(key, best);
    return best;
  };
  let best = null;
  for (const firstEdgeHomeLeft of [0, 1]) {
    const tail = solve(1, firstEdgeHomeLeft, firstEdgeHomeLeft);
    const candidate = { imbalance: tail.imbalance, nonAlternating: tail.nonAlternating, edges: [firstEdgeHomeLeft, ...tail.edges] };
    const tie = hash32(`${seed}|home-orientation|${candidate.edges.join('')}`);
    if (!best || candidate.imbalance < best.imbalance
      || (candidate.imbalance === best.imbalance && candidate.nonAlternating < best.nonAlternating)
      || (candidate.imbalance === best.imbalance && candidate.nonAlternating === best.nonAlternating && tie < best.tie)) best = { ...candidate, tie };
  }
  return { edgeHomeLeft: best.edges, homeImbalance: best.imbalance, teamsWithOneNewHomeGame: size - best.nonAlternating };
}

function createGame({ id, seasonStartYear, phase, round, home = null, away = null, homeSeed = null, awaySeed = null,
  participants = null, scheduleWindow, standingsEligible = true }) {
  return {
    id, seasonStartYear, phase, round, home, away,
    homeSeed, awaySeed, participants: participants ? participants.map(slot => ({ ...slot })) : undefined,
    scheduledAt: null, scheduleWindow,
    standingsEligible,
    result: null,
    scenarioGenerated: true,
    evidenceStatus: 'scenario-generated',
  };
}

function buildNonQualifierGames({ year, eliminatedByConference, pairCounts, baseHome, seed, travelMiles }) {
  const east = eliminatedByConference.east;
  const west = eliminatedByConference.west;
  const eastBottom = east.slice(-2);
  const westBottom = west.slice(-2);
  const cross = selectCrossPairing(eastBottom, westBottom, travelMiles, seed);
  const paths = {};
  const pathCosts = {};
  for (const conference of CONFERENCES) {
    const rows = eliminatedByConference[conference];
    const bottoms = rows.slice(-2);
    const middle = rows.slice(0, -2);
    const selectedPath = minimumCostConferencePath({
      start: bottoms[0], end: bottoms[1], middle, pairCounts,
      standingsByTeam: new Map(rows.map(row => [row.teamId, row])), seed, conference,
    });
    paths[conference] = selectedPath.order;
    pathCosts[conference] = selectedPath.cost;
  }
  const eastPath = paths.east;
  const westPath = cross.mode === 'same-standing-rank' ? [...paths.west].reverse() : paths.west;
  const cycle = [...eastPath, ...westPath];
  const orientation = orientNonQualifierCycle(cycle, baseHome, seed);
  const games = [];
  for (let edge = 0; edge < cycle.length; edge += 1) {
    const home = orientation.edgeHomeLeft[edge] === 1 ? cycle[edge] : cycle[(edge + 1) % cycle.length];
    const away = orientation.edgeHomeLeft[edge] === 1 ? cycle[(edge + 1) % cycle.length] : cycle[edge];
    const stage = edge % 2 === 0 ? 1 : 2;
    const id = gameId(year, `non-qualifier-${stage}-${String(Math.floor(edge / 2) + 1).padStart(2, '0')}`);
    const game = createGame({
      id, seasonStartYear: year, phase: 'regular', round: 'cup-group-elimination',
      home, away, scheduleWindow: stage === 1 ? '2026-12-06/07' : '2026-12-09/10',
    });
    game.existingOpponentMeetings = pairCounts.get(pairKey(home, away)) || 0;
    game.matchupMethod = NBA_TEAM_CONFERENCES[home] !== NBA_TEAM_CONFERENCES[away]
      ? 'bottom-finisher-cross-conference-pairing'
      : game.existingOpponentMeetings === 3 ? 'existing-three-meeting-opponent'
        : 'seeded-fallback-where-no-three-meeting-path-edge-was-selected';
    games.push(game);
  }
  const crossGames = games.filter(game => NBA_TEAM_CONFERENCES[game.home] !== NBA_TEAM_CONFERENCES[game.away]);
  const intraConferenceGames = games.length - crossGames.length;
  if (games.length !== 22 || crossGames.length !== 2 || intraConferenceGames !== 20) fail('Cup scenario pairing did not satisfy the published 22-team matchup shape.');
  const appearanceCounts = Object.fromEntries([...east, ...west].map(row => [row.teamId, 0]));
  const homeCounts = Object.fromEntries([...east, ...west].map(row => [row.teamId, 0]));
  for (const game of games) { appearanceCounts[game.home] += 1; appearanceCounts[game.away] += 1; homeCounts[game.home] += 1; }
  const actualHomeImbalance = [...east, ...west].reduce((sum, row) => sum + Math.abs(baseHome[row.teamId] + homeCounts[row.teamId] - 41), 0);
  if (Object.values(appearanceCounts).some(count => count !== 2) || actualHomeImbalance !== orientation.homeImbalance) {
    fail('Cup scenario elimination path must give each non-qualifier two games and use the best available home/away orientation.');
  }
  return {
    games,
    crossConference: {
      count: crossGames.length,
      pairingMode: cross.mode,
      travelMode: cross.complete ? 'complete-caller-supplied-distance-matrix' : 'not-modeled',
      totalDistanceMiles: cross.complete ? cross.distance : null,
    },
    intraConferenceGameCount: intraConferenceGames,
    threeMeetingPairsUsed: games.filter(game => game.existingOpponentMeetings === 3 && NBA_TEAM_CONFERENCES[game.home] === NBA_TEAM_CONFERENCES[game.away]).length,
    homeImbalanceFrom41: orientation.homeImbalance,
    teamsWithOneNewHomeGame: orientation.teamsWithOneNewHomeGame,
    pathCosts,
  };
}

function crossGroupRankingMetrics(seed, scope) {
  return [
    { criterion: 'group-play-wins', value: row => row.wins, direction: 'desc' },
    { criterion: 'group-point-differential', value: row => row.pointDifferential, direction: 'desc' },
    { criterion: 'group-total-points-excluding-overtime', value: row => row.totalPoints, direction: 'desc' },
    { criterion: 'prior-season-wins', value: row => row.priorWins, direction: 'desc' },
    { criterion: 'prior-season-losses', value: row => row.priorLosses, direction: 'asc' },
    { criterion: 'seeded-random-draw', value: row => hash32(`${seed}|${scope}|${row.teamId}`), direction: 'asc' },
    { criterion: 'team-id-final-fallback', value: row => row.teamId, direction: 'asc' },
  ];
}

function buildQualifiers({ groups, groupRankings, stats, seed }) {
  const qualifiersByConference = { east: [], west: [] };
  for (const group of groups) {
    const winner = groupRankings.get(group.groupId).rows[0];
    qualifiersByConference[group.conference].push({ ...winner, qualification: 'group-winner' });
  }
  const runnerUpsByConference = { east: [], west: [] };
  for (const group of groups) runnerUpsByConference[group.conference].push(groupRankings.get(group.groupId).rows[1]);
  const wildcardTraces = [];
  for (const conference of CONFERENCES) {
    const wildcardOrdering = buildOrderingTrace(runnerUpsByConference[conference], crossGroupRankingMetrics(seed, `${conference}|wild-card`));
    const wildcard = wildcardOrdering.orderedRows[0];
    wildcardTraces.push({
      conference,
      candidateTeamIds: runnerUpsByConference[conference].map(row => row.teamId).sort(),
      selectedTeamId: wildcard.teamId,
      ...wildcardOrdering.trace,
    });
    qualifiersByConference[conference].push({ ...wildcard, qualification: 'wild-card' });
  }
  const qualifiers = [];
  const quarterfinals = [];
  const semifinals = [];
  const conferenceRankings = {};
  const conferenceSeedTraces = [];
  for (const conference of CONFERENCES) {
    const rows = qualifiersByConference[conference];
    const groupWinners = rows.filter(row => row.qualification === 'group-winner');
    const seedOrdering = buildOrderingTrace(groupWinners, crossGroupRankingMetrics(seed, `${conference}|group-winner-seed`));
    const orderedGroupWinners = seedOrdering.orderedRows;
    const wildcard = rows.find(row => row.qualification === 'wild-card');
    const seedOrder = [orderedGroupWinners[0], orderedGroupWinners[1], orderedGroupWinners[2], wildcard];
    conferenceSeedTraces.push({
      ...seedOrdering.trace,
      conference,
      candidateTeamIds: seedOrder.map(row => row.teamId).sort(),
      orderedTeamIds: seedOrder.map(row => row.teamId),
      groupWinnerOrder: orderedGroupWinners.map(row => row.teamId),
      wildcardTeamId: wildcard.teamId,
    });
    const seedByTeam = new Map(seedOrder.map((row, index) => [row.teamId, index + 1]));
    qualifiers.push(...seedOrder.map((row, index) => ({ ...summarizeStanding(row), qualification: row.qualification, conferenceSeed: index + 1 })));
    const qf1 = gameId(2026, `${conference}-quarterfinal-1`);
    const qf2 = gameId(2026, `${conference}-quarterfinal-2`);
    quarterfinals.push(createGame({ id: qf1, seasonStartYear: 2026, phase: 'in_season_tournament', round: 'quarterfinal',
      home: orderedGroupWinners[0].teamId, away: wildcard.teamId, homeSeed: 1, awaySeed: 4, scheduleWindow: '2026-12-04/05' }));
    quarterfinals.push(createGame({ id: qf2, seasonStartYear: 2026, phase: 'in_season_tournament', round: 'quarterfinal',
      home: orderedGroupWinners[1].teamId, away: orderedGroupWinners[2].teamId, homeSeed: 2, awaySeed: 3, scheduleWindow: '2026-12-04/05' }));
    semifinals.push(createGame({
      id: gameId(2026, `${conference}-semifinal`), seasonStartYear: 2026, phase: 'in_season_tournament', round: 'semifinal',
      participants: [{ outcome: 'winner', gameId: qf1 }, { outcome: 'winner', gameId: qf2 }], scheduleWindow: '2026-12-08/09',
    }));
    semifinals.at(-1).conference = conference;
    semifinals.at(-1).seedByTeam = Object.fromEntries(seedByTeam);
    const loserGame = createGame({
      id: gameId(2026, `${conference}-quarterfinal-loser-game`), seasonStartYear: 2026, phase: 'regular', round: 'cup-quarterfinal-loser-game',
      participants: [{ outcome: 'loser', gameId: qf1 }, { outcome: 'loser', gameId: qf2 }], scheduleWindow: '2026-12-07/09/10',
    });
    loserGame.conference = conference;
    loserGame.seedByTeam = Object.fromEntries(seedByTeam);
    quarterfinals.push(loserGame);

    const elimination = [...stats.values()].filter(row => row.conference === conference && !seedByTeam.has(row.teamId))
      .sort((a, b) => tieCompare(a, b, seed, `${conference}|elimination-rank`));
    if (elimination.length !== 11) fail(`The ${conference} Cup elimination pool does not contain eleven teams.`);
    conferenceRankings[conference] = {
      qualifiers: seedOrder.map((row, index) => ({ ...summarizeStanding(row), qualification: row.qualification, conferenceRank: index + 1 })),
      eliminated: elimination.map((row, index) => ({ ...summarizeStanding(row), conferenceRank: index + 5 })),
    };
  }
  return {
    qualifiers,
    quarterfinals,
    semifinals,
    conferenceRankings,
    tiebreakTrace: { wildCards: wildcardTraces, conferenceSeeds: conferenceSeedTraces },
  };
}

function validateCompletionPlan(plan) {
  if (!plan || plan.format !== NBA_CUP_COMPLETION_VERSION || !Array.isArray(plan.games) || plan.games.length !== GENERATED_GAME_COUNT) {
    fail('Cup completion plan is missing or has an unsupported format.');
  }
  if (!Array.isArray(plan.announcedGames) || plan.announcedGames.length !== 1200) fail('Cup completion plan does not preserve the complete published 80-game schedule.');
}

/**
 * Compile 30 2026-27 scenario schedule slots from all published games and all
 * simulated Cup Group Play results. Inputs are:
 * - `announcedGames`: the 1,200 published rows, with `id`, `home`, `away`, and
 *   a regular/Cup phase; rows are copied without normalization or edits.
 * - `groups`: six selected Cup groups `{ groupId, conference, teams }`.
 * - `groupResults`: sixty schedule-linked results with final scores and
 *   explicit `overtimePeriods`, `homeOvertimePoints`, and `awayOvertimePoints`.
 * - `priorSeasonRecords`: exact 2025-26 `{ wins, losses }` for every team.
 * - `travelMiles` (optional): all four candidate bottom-team interconference
 *   distances keyed by sorted `TEAM|TEAM` pairs to enable travel comparison.
 *
 * Groups and game outcomes remain caller-supplied simulation evidence; this
 * function does not invent a Cup draw or simulate Cup games.
 */
export function generateNbaCupScheduleCompletion({
  seasonStartYear = 2026,
  teamIds = NBA_TEAM_CODES,
  announcedGames,
  groups: rawGroups,
  groupResults: rawGroupResults,
  priorSeasonRecords,
  seed,
  travelMiles,
} = {}) {
  const year = validateSeason(seasonStartYear);
  const replaySeed = validateSeed(seed);
  const teams = validateTeamIds(teamIds);
  const announced = validateAnnouncedGames(announcedGames, teams, year);
  const { groups, groupById, groupByTeam } = normalizeGroups(rawGroups, teams);
  const priorRecords = normalizePriorRecords(priorSeasonRecords, teams);
  const groupResults = normalizeGroupResults(rawGroupResults, { teams, groups, groupById, groupByTeam, announced });
  const stats = createStats(teams, groupByTeam, priorRecords);
  accumulateCupStats(stats, groupResults);
  const groupRankings = new Map(groups.map(group => [group.groupId, rankGroup(group, stats, replaySeed)]));
  const { qualifiers, quarterfinals, semifinals, conferenceRankings, tiebreakTrace: advancementTiebreakTrace } = buildQualifiers({ groups, groupRankings, stats, seed: replaySeed });
  const elimination = Object.fromEntries(CONFERENCES.map(conference => [conference, conferenceRankings[conference].eliminated]));
  const nonQualifiers = buildNonQualifierGames({
    year, eliminatedByConference: elimination,
    pairCounts: announced.pairCounts, baseHome: announced.homeGames, seed: replaySeed, travelMiles,
  });
  const slotGames = [...nonQualifiers.games, ...quarterfinals, ...semifinals]
    .sort((a, b) => a.id.localeCompare(b.id));
  if (slotGames.length !== GENERATED_GAME_COUNT) fail('Cup completion must produce exactly thirty scenario game slots.');
  const groupStandings = groups.flatMap(group => groupRankings.get(group.groupId).rows.map(summarizeStanding))
    .sort((a, b) => a.groupId.localeCompare(b.groupId) || a.groupRank - b.groupRank);
  const tiebreakTrace = {
    groups: groups.map(group => groupRankings.get(group.groupId).trace),
    ...advancementTiebreakTrace,
  };
  const groupDrawSource = 'simulated-cup-group-results';
  const note = 'Scenario-generated Cup completion, not an official post-Group Play NBA fixture list. The published 1,200 games are preserved unchanged. Official 2026 rules determine qualifiers, knockout game counts, conference-local Cup rounds, and non-qualifier constraints; seeded path pairing approximates the formulaic 22-team schedule and does not claim the NBA’s exact internal matchup algorithm. Travel is not optimized unless complete caller-supplied distances are available.';
  const result = {
    status: 'ready',
    kind: 'nba-cup-schedule-completion-plan',
    format: NBA_CUP_COMPLETION_VERSION,
    seasonStartYear: year,
    teams,
    seed: replaySeed,
    sourceReceipt: {
      kind: 'modeled-scenario',
      ruleset: 'emirates-nba-cup-2026',
      sources: { ...NBA_CUP_RULE_SOURCES },
      inputEvidence: groupDrawSource,
      generatedPairingModel: 'seeded-minimum-cost-conference-path-v1',
      historicalScheduleRowsPreserved: announced.games.length,
      groupResultGameIds: groupResults.map(game => game.id).sort(),
    },
    announcedGames: announced.games,
    games: slotGames,
    groupStandings,
    tiebreakTrace,
    conferenceRankings,
    qualifiers,
    coverage: {
      announcedGames: announced.games.length,
      announcedAppearancesPerTeam: ANNOUNCED_GAMES_PER_TEAM,
      cupGroupResults: groupResults.length,
      generatedGameSlots: slotGames.length,
      generatedConcreteGames: slotGames.filter(game => game.home && game.away).length,
      conditionalGameIds: slotGames.filter(game => !game.home || !game.away).map(game => game.id),
      nonQualifierGames: nonQualifiers.games.length,
      nonQualifierGamesPerTeam: 2,
      nonQualifierHomeAwayPerTeam: 'minimized against each team\'s published 80-game home count',
      nonQualifierHomeImbalanceFrom41: nonQualifiers.homeImbalanceFrom41,
      nonQualifierTeamsWithOneNewHomeGame: nonQualifiers.teamsWithOneNewHomeGame,
      nonQualifierCrossConferenceGames: nonQualifiers.crossConference.count,
      nonQualifierIntraConferenceGames: nonQualifiers.intraConferenceGameCount,
      travelMode: nonQualifiers.crossConference.travelMode,
    },
    pairingModel: {
      method: 'cup-standings-seeded-hamilton-path-with-two-cross-conference-bottom-pairs',
      prioritizesExistingThreeMeetingPairs: true,
      crossConferencePairingMode: nonQualifiers.crossConference.pairingMode,
      travelMode: nonQualifiers.crossConference.travelMode,
      travelTotalMiles: nonQualifiers.crossConference.totalDistanceMiles,
      limitations: [
        'NBA publishes matchup constraints but not the full internal formula or a travel-distance dataset; this is a scenario method, not an official matchup reconstruction.',
        'Quarterfinal winners and losers are unresolved until simulated quarterfinal scores are passed to resolveNbaCupScheduleCompletion.',
      ],
    },
    note,
  };
  validateCompletionPlan(result);
  return result;
}

function normalizeQuarterfinalResults(plan, quarterfinalResults) {
  const qfs = plan.games.filter(game => game.round === 'quarterfinal');
  if (!Array.isArray(quarterfinalResults) || quarterfinalResults.length !== qfs.length) fail('Schedule completion needs one simulated result for each of the four NBA Cup Quarterfinals.');
  const byId = new Map();
  for (const result of quarterfinalResults) {
    const id = normalizeId(result?.gameId || result?.id);
    const qf = qfs.find(game => game.id === id);
    if (!qf || byId.has(id) || !isInteger(result.homeScore, 0, 250) || !isInteger(result.awayScore, 0, 250) || result.homeScore === result.awayScore) {
      fail('Quarterfinal results must contain four unique, valid, non-tied Cup game scores.');
    }
    byId.set(id, { homeScore: result.homeScore, awayScore: result.awayScore });
  }
  if (byId.size !== qfs.length) fail('Schedule completion is missing one or more Quarterfinal results.');
  return byId;
}

/**
 * Resolve all conditional Cup slots after simulated Quarterfinal results.
 * Returns a concrete 1,230-game 2026-27 schedule: the published 1,200 rows
 * byte-for-value preserved at the front, followed by the 30 scenario rows.
 */
export function resolveNbaCupScheduleCompletion(plan, { quarterfinalResults } = {}) {
  validateCompletionPlan(plan);
  const resultById = normalizeQuarterfinalResults(plan, quarterfinalResults);
  const qfs = plan.games.filter(game => game.round === 'quarterfinal');
  const seedByTeam = new Map(plan.qualifiers.map(row => [row.teamId, row.conferenceSeed]));
  const outcomeByGame = new Map();
  for (const game of qfs) {
    const result = resultById.get(game.id);
    const homeWon = result.homeScore > result.awayScore;
    outcomeByGame.set(game.id, {
      winner: homeWon ? game.home : game.away,
      loser: homeWon ? game.away : game.home,
      result,
    });
  }
  const baseHome = Object.fromEntries(plan.teams.map(team => [team, 0]));
  const baseAppearances = Object.fromEntries(plan.teams.map(team => [team, 0]));
  for (const game of plan.announcedGames) {
    baseHome[game.home] += 1;
    baseAppearances[game.home] += 1; baseAppearances[game.away] += 1;
  }
  const generatedGames = plan.games.map(game => {
    if (game.round === 'quarterfinal') {
      const result = resultById.get(game.id);
      return { ...game, result: { ...result } };
    }
    if (game.round === 'semifinal') {
      const [firstSlot, secondSlot] = game.participants;
      const firstWinner = outcomeByGame.get(firstSlot.gameId)?.winner;
      const secondWinner = outcomeByGame.get(secondSlot.gameId)?.winner;
      if (!firstWinner || !secondWinner) fail(`Semifinal ${game.id} cannot resolve a Quarterfinal winner.`);
      const home = seedByTeam.get(firstWinner) < seedByTeam.get(secondWinner) ? firstWinner : secondWinner;
      const away = home === firstWinner ? secondWinner : firstWinner;
      return { ...game, home, away, homeSeed: seedByTeam.get(home), awaySeed: seedByTeam.get(away), participants: undefined };
    }
    if (game.round === 'cup-quarterfinal-loser-game') {
      const [firstSlot, secondSlot] = game.participants;
      const firstLoser = outcomeByGame.get(firstSlot.gameId)?.loser;
      const secondLoser = outcomeByGame.get(secondSlot.gameId)?.loser;
      if (!firstLoser || !secondLoser) fail(`Quarterfinal loser game ${game.id} cannot resolve its Cup participants.`);
      const firstQf = qfs.find(row => row.id === firstSlot.gameId);
      const secondQf = qfs.find(row => row.id === secondSlot.gameId);
      const currentHome = team => baseHome[team] + [firstQf, secondQf].filter(row => row.home === team).length;
      const options = [
        { home: firstLoser, away: secondLoser },
        { home: secondLoser, away: firstLoser },
      ].map(option => ({ ...option,
        imbalance: Math.abs(currentHome(option.home) + 1 - 41) + Math.abs(currentHome(option.away) - 41),
        tie: hash32(`${plan.seed}|loser-game-home|${game.id}|${option.home}`),
      })).sort((a, b) => a.imbalance - b.imbalance || a.tie - b.tie)[0];
      return { ...game, home: options.home, away: options.away, participants: undefined,
        homeSeed: seedByTeam.get(options.home), awaySeed: seedByTeam.get(options.away) };
    }
    return { ...game };
  });
  const knownPairs = new Set();
  for (const game of generatedGames) {
    if (!game.home || !game.away || game.home === game.away) fail(`Scenario game ${game.id} has an unresolved or self matchup.`);
    const key = pairKey(game.home, game.away);
    if (knownPairs.has(key)) fail(`Generated Cup completion repeats a matchup: ${game.home} vs ${game.away}.`);
    knownPairs.add(key);
  }
  if (generatedGames.length !== 30) fail('Resolved NBA Cup completion must contain thirty games.');
  const generatedAppearances = Object.fromEntries(plan.teams.map(team => [team, 0]));
  const homeGames = { ...baseHome };
  for (const game of generatedGames) {
    generatedAppearances[game.home] += 1; generatedAppearances[game.away] += 1; homeGames[game.home] += 1;
  }
  const badTeam = plan.teams.find(team => baseAppearances[team] + generatedAppearances[team] !== COMPLETED_GAMES_PER_TEAM);
  if (badTeam) fail(`Resolved Cup completion did not produce exactly 82 regular-season games for ${badTeam}.`);
  const homeAway = Object.fromEntries(plan.teams.map(team => [team, { home: homeGames[team], away: 82 - homeGames[team] }]));
  const scheduleGames = [...plan.announcedGames.map(game => ({ ...game })), ...generatedGames.map(game => ({ ...game }))];
  return {
    status: 'ready',
    kind: 'nba-cup-schedule-completion-scenario',
    format: plan.format,
    seasonStartYear: plan.seasonStartYear,
    seed: plan.seed,
    sourceReceipt: { ...plan.sourceReceipt, quarterfinalResultsUsed: qfs.map(game => game.id).sort() },
    games: generatedGames,
    scheduleGames,
    groupStandings: plan.groupStandings,
    tiebreakTrace: plan.tiebreakTrace,
    conferenceRankings: plan.conferenceRankings,
    qualifiers: plan.qualifiers,
    coverage: {
      announcedGamesPreserved: plan.announcedGames.length,
      generatedGames: generatedGames.length,
      totalGames: scheduleGames.length,
      appearancesPerTeam: Object.fromEntries(plan.teams.map(team => [team, baseAppearances[team] + generatedAppearances[team]])),
      generatedAppearancesPerTeam: generatedAppearances,
      homeAwayByTeam: homeAway,
      teamsAt41Home41Away: plan.teams.filter(team => homeAway[team].home === 41 && homeAway[team].away === 41).length,
      teamsNotAt41Home41Away: plan.teams.filter(team => homeAway[team].home !== 41 || homeAway[team].away !== 41),
      crossConferenceNonQualifierGames: plan.coverage.nonQualifierCrossConferenceGames,
      intraConferenceNonQualifierGames: plan.coverage.nonQualifierIntraConferenceGames,
    },
    sourceNote: plan.note,
  };
}

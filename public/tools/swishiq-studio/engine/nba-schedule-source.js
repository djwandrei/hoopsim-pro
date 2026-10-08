/*
 * Exact historical and deterministic future NBA schedule adapter.
 *
 * Historical schedules are immutable source evidence. Future schedules are
 * explicitly generated scenarios: they preserve the modern 82-game opponent
 * matrix and home/away balance, but they never masquerade as an announced NBA
 * calendar or as observed games.
 */

// The artifact format remains v1; this revision identifies the source/model
// contract so browser caches cannot retain a pre-Cup or pre-balanced-calendar
// schedule after the source data is rebuilt.
export const NBA_SCHEDULE_SOURCE_VERSION = 'nba-schedule-source-v2';
export const NBA_SCHEDULE_ARTIFACT_FORMAT = 'djhc-nba-actual-schedules-v1';

export const NBA_TEAM_CODES = Object.freeze([
  'ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);

const DIVISIONS = Object.freeze({
  atlantic: Object.freeze(['BOS', 'BKN', 'NYK', 'PHI', 'TOR']),
  central: Object.freeze(['CHI', 'CLE', 'DET', 'IND', 'MIL']),
  southeast: Object.freeze(['ATL', 'CHA', 'MIA', 'ORL', 'WAS']),
  northwest: Object.freeze(['DEN', 'MIN', 'OKC', 'POR', 'UTA']),
  pacific: Object.freeze(['GSW', 'LAC', 'LAL', 'PHX', 'SAC']),
  southwest: Object.freeze(['DAL', 'HOU', 'MEM', 'NOP', 'SAS']),
});
const DIVISION_BY_TEAM = new Map(Object.entries(DIVISIONS).flatMap(([division, teams]) => teams.map(team => [team, division])));
const CONFERENCE_BY_DIVISION = new Map([
  ['atlantic', 'east'], ['central', 'east'], ['southeast', 'east'],
  ['northwest', 'west'], ['pacific', 'west'], ['southwest', 'west'],
]);

// Public, immutable structure metadata shared by the season simulator and
// schedule adapters.  Keeping this beside the schedule mechanics prevents a
// second, subtly different conference/division map from drifting into a UI or
// model module.  The values are normalized lowercase labels; team codes remain
// the canonical uppercase NBA abbreviations used by the schedule artifact.
export const NBA_TEAM_DIVISIONS = Object.freeze(Object.fromEntries(
  [...DIVISION_BY_TEAM.entries()].map(([team, division]) => [team, division]),
));
export const NBA_TEAM_CONFERENCES = Object.freeze(Object.fromEntries(
  [...DIVISION_BY_TEAM.entries()].map(([team, division]) => [team, CONFERENCE_BY_DIVISION.get(division)]),
));
export const NBA_DIVISIONS = Object.freeze(Object.fromEntries(
  Object.entries(DIVISIONS).map(([division, teams]) => [division, Object.freeze([...teams])]),
));

/** Return canonical NBA structure metadata for a team code, or null for a
 * custom/non-NBA team identifier. */
export function classifyNbaTeam(teamId) {
  const code = String(teamId || '').trim().toUpperCase();
  const division = NBA_TEAM_DIVISIONS[code];
  const conference = NBA_TEAM_CONFERENCES[code];
  return division && conference ? { teamId: code, division, conference } : null;
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const ordered = values => [...values].sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true }));
const fail = message => { throw new Error(message); };

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function validateTeams(teamIds, { requireFullLeague = false } = {}) {
  if (!Array.isArray(teamIds) || teamIds.length < 2 || teamIds.length > NBA_TEAM_CODES.length) fail('NBA schedules need two through thirty valid NBA team codes.');
  const teams = ordered(teamIds.map(value => String(value).trim()));
  if (new Set(teams).size !== teams.length || teams.some(team => !DIVISION_BY_TEAM.has(team))) fail('NBA schedules contain an unknown or duplicate NBA team code.');
  if (requireFullLeague && (teams.length !== 30 || teams.some(team => !NBA_TEAM_CODES.includes(team)))) fail('The current NBA schedule mechanics require all thirty NBA teams.');
  return teams;
}

function normalizeGame(game, index, seasonStartYear, allowedTeams) {
  if (!game || !allowedTeams.has(game.home) || !allowedTeams.has(game.away) || game.home === game.away) fail(`NBA schedule game ${index + 1} has invalid home/away teams.`);
  const phase = ['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(game.phase) ? game.phase : null;
  if (!phase) fail(`NBA schedule game ${index + 1} has an unsupported phase.`);
  const id = text(game.id);
  if (!id || id.length > 80) fail(`NBA schedule game ${index + 1} has no bounded game ID.`);
  const scheduledAt = game.scheduledAt == null ? null : new Date(game.scheduledAt);
  if (scheduledAt && !Number.isFinite(scheduledAt.getTime())) fail(`NBA schedule game ${index + 1} has an invalid scheduled time.`);
  if (game.seasonStartYear != null && Number(game.seasonStartYear) !== seasonStartYear) fail(`NBA schedule game ${index + 1} escapes the selected season.`);
  const result = game.result == null ? null : {
    homeScore: Number(game.result.homeScore), awayScore: Number(game.result.awayScore),
  };
  if (result && (!integer(result.homeScore, 0, 300) || !integer(result.awayScore, 0, 300))) fail(`NBA schedule game ${index + 1} has an invalid observed score.`);
  return { id, seasonStartYear, phase, scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    home: game.home, away: game.away, result, sourceGameCode: text(game.sourceGameCode) };
}

/** Validate one generated/downloaded artifact without trusting its row count. */
export function normalizeNbaScheduleArtifact(artifact) {
  if (!artifact || artifact.format !== NBA_SCHEDULE_ARTIFACT_FORMAT || !Array.isArray(artifact.seasons) || !artifact.seasons.length) {
    fail('The NBA schedule artifact is unavailable or has an unsupported format.');
  }
  const seasons = artifact.seasons.map(season => {
    const seasonStartYear = Number(season.seasonStartYear);
    if (!integer(seasonStartYear, 1947, 2200) || season.status !== 'complete' || !Array.isArray(season.games) || !season.games.length) {
      fail('The NBA schedule artifact contains an invalid or incomplete historical season.');
    }
    const games = season.games.map((game, index) => normalizeGame(game, index, seasonStartYear, new Set(NBA_TEAM_CODES)));
    if (new Set(games.map(game => game.id)).size !== games.length) fail(`The ${seasonStartYear} NBA schedule contains duplicate game IDs.`);
    return Object.freeze({ ...season, seasonStartYear, games: Object.freeze(games) });
  });
  if (new Set(seasons.map(season => season.seasonStartYear)).size !== seasons.length) fail('The NBA schedule artifact contains duplicate seasons.');
  return Object.freeze({ ...artifact, seasons: Object.freeze(seasons) });
}

function seasonEntry(artifact, seasonStartYear) {
  const normalized = artifact?.format === NBA_SCHEDULE_ARTIFACT_FORMAT ? artifact : normalizeNbaScheduleArtifact(artifact);
  return normalized.seasons.find(item => item.seasonStartYear === Number(seasonStartYear)) || null;
}

/** Return the exact observed schedule for a published historical season. */
export function selectActualNbaSchedule(artifact, { seasonStartYear, teamIds = NBA_TEAM_CODES, phases = ['regular'] } = {}) {
  const teams = validateTeams(teamIds);
  const entry = seasonEntry(artifact, seasonStartYear);
  if (!entry) return { status: 'unavailable', kind: 'actual', seasonStartYear: Number(seasonStartYear), teams, structure: Object.fromEntries(teams.map(team => [team, classifyNbaTeam(team)])), reason: 'The exact historical NBA schedule is not present in the accepted schedule artifact.' };
  const phaseSet = new Set(phases);
  if ([...phaseSet].some(phase => !['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(phase))) fail('NBA schedule phase selection is unsupported.');
  const allowed = new Set(teams);
  const games = entry.games.filter(game => phaseSet.has(game.phase) && allowed.has(game.home) && allowed.has(game.away));
  if (!games.length) return { status: 'unavailable', kind: 'actual', seasonStartYear: Number(seasonStartYear), teams, structure: Object.fromEntries(teams.map(team => [team, classifyNbaTeam(team)])), reason: 'The selected exact-season schedule has no games for the requested teams and phases.' };
  const appearances = Object.fromEntries(teams.map(team => [team, 0]));
  games.forEach(game => { appearances[game.home]++; appearances[game.away]++; });
  // A phase-specific all-league request (for example, the playoffs) is
  // intentionally allowed to return only the teams that actually appeared.
  // A smaller explicit team scope, however, must not silently return a
  // partial matchup calendar when one requested team has no games.
  if (teams.length < NBA_TEAM_CODES.length && Object.values(appearances).some(count => count === 0)) {
    const missingTeams = teams.filter(team => appearances[team] === 0);
    return {
      status: 'unavailable', kind: 'actual', seasonStartYear: Number(seasonStartYear), teams,
      structure: Object.fromEntries(teams.map(team => [team, classifyNbaTeam(team)])),
      reason: `The selected exact-season schedule has no ${[...phaseSet].join(' or ')} games for ${missingTeams.join(', ')}; no partial team scope was returned.`,
    };
  }
  const counts = Object.values(appearances);
  return {
    status: 'ready', kind: 'actual', seasonStartYear: Number(seasonStartYear), teams,
    structure: Object.fromEntries(teams.map(team => [team, classifyNbaTeam(team)])),
    games: games.map(game => ({ ...game })), gamesPerTeam: Math.min(...counts),
    coverage: { games: games.length, teamAppearances: appearances, minGamesPerTeam: Math.min(...counts), maxGamesPerTeam: Math.max(...counts), sourceStatus: entry.status },
    sourceReceipt: { format: artifact.format, seasonStartYear: entry.seasonStartYear, source: entry.source || null, scheduleId: `nba-actual-${entry.seasonStartYear}` },
    note: 'Exact schedule declarations are observed source evidence. Scores are retained for comparison only; simulation draws new outcomes.',
  };
}

function observedFinalScore(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const score = Number(value);
  return integer(score, 0, 300) ? score : null;
}

/**
 * Derive standings-style records only from completed scores in an exact
 * historical schedule selection.  This intentionally fails closed: one
 * missing, malformed, or tied score means no partial record table is
 * returned.  A team subset is also explicit in the receipt, because its
 * records cover only games where both teams are inside that selected scope.
 */
export function deriveActualNbaTeamRecords(artifact, options = {}) {
  const selected = selectActualNbaSchedule(artifact, options);
  const base = {
    kind: 'actual-records',
    seasonStartYear: selected.seasonStartYear,
    teams: selected.teams || [],
    structure: selected.structure || {},
    scheduleCoverage: selected.coverage || null,
    sourceReceipt: selected.sourceReceipt || null,
  };
  if (selected.status !== 'ready') {
    return { ...base, status: 'unavailable', reason: selected.reason || 'The exact historical NBA schedule is unavailable.' };
  }

  const invalidGames = selected.games.filter(game => {
    const homeScore = observedFinalScore(game?.result?.homeScore);
    const awayScore = observedFinalScore(game?.result?.awayScore);
    return homeScore == null || awayScore == null || homeScore === awayScore;
  });
  if (invalidGames.length) {
    return {
      ...base,
      status: 'unavailable',
      reason: `The selected exact-season schedule has ${invalidGames.length} missing, invalid, or non-final score${invalidGames.length === 1 ? '' : 's'}; no partial team records were derived.`,
      invalidGameIds: invalidGames.map(game => game.id),
    };
  }

  const records = Object.fromEntries(selected.teams.map(team => [team, {
    wins: 0,
    losses: 0,
    games: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    differential: 0,
  }]));
  selected.games.forEach(game => {
    const homeScore = observedFinalScore(game.result.homeScore);
    const awayScore = observedFinalScore(game.result.awayScore);
    const home = records[game.home];
    const away = records[game.away];
    // selectActualNbaSchedule limits games to the selected team set. Keep the
    // guard so malformed external artifacts cannot create an unscoped record.
    if (!home || !away) fail('The selected exact-season schedule contains a game outside its declared team scope.');
    home.games += 1;
    away.games += 1;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  });
  Object.values(records).forEach(record => {
    if (record.games !== record.wins + record.losses) fail('The exact historical record derivation did not conserve games.');
    record.differential = record.pointsFor - record.pointsAgainst;
  });

  return {
    ...base,
    status: 'ready',
    records,
    coverage: {
      games: selected.games.length,
      scoredGames: selected.games.length,
      teamAppearances: { ...selected.coverage.teamAppearances },
      phases: [...new Set(selected.games.map(game => game.phase))],
    },
    note: 'Exact historical records are derived only from observed final scores. For a subset of teams, the records cover only games where both opponents are inside that declared scope.',
  };
}

function pairKey(a, b) { return ordered([a, b]).join('|'); }
function homeAway(pair, count, seed) {
  const [first, second] = ordered(pair);
  if (count === 2) return [{ home: first, away: second }, { home: second, away: first }];
  if (count === 4) return [{ home: first, away: second }, { home: first, away: second }, { home: second, away: first }, { home: second, away: first }];
  const firstHome = (hashSeed(`${seed}:${first}:${second}`) & 1) === 0;
  return firstHome
    ? [{ home: first, away: second }, { home: second, away: first }, { home: first, away: second }]
    : [{ home: second, away: first }, { home: first, away: second }, { home: second, away: first }];
}

/**
 * Orient the three-game pairings so every full-league forecast has the NBA's
 * 41-home/41-away balance.  Two- and four-game pairings are already balanced;
 * each three-game pairing contributes one unavoidable extra home date to one
 * endpoint.  A tiny deterministic max-flow assigns those extras without
 * changing the opponent matrix.
 */
function orientThreeGamePairs(edges, fixedHome, seed) {
  const teams = NBA_TEAM_CODES;
  const degree = Object.fromEntries(teams.map(team => [team, 0]));
  for (const edge of edges) { degree[edge.first]++; degree[edge.second]++; }
  const demand = Object.fromEntries(teams.map(team => [team, 41 - fixedHome[team] - degree[team]]));
  for (const team of teams) {
    if (!Number.isInteger(demand[team]) || demand[team] < 0 || demand[team] > degree[team]) {
      throw new Error('The future NBA schedule could not derive a valid 41-home/41-away orientation.');
    }
  }
  const source = 0, edgeOffset = 1, teamOffset = edgeOffset + edges.length, sink = teamOffset + teams.length;
  const size = sink + 1, capacity = Array.from({ length: size }, () => Array(size).fill(0));
  const link = (from, to, amount) => { capacity[from][to] += amount; };
  edges.forEach((edge, index) => {
    const node = edgeOffset + index; link(source, node, 1);
    const preferred = (hashSeed(`${seed}:${edge.first}:${edge.second}`) & 1) === 0 ? edge.first : edge.second;
    const other = preferred === edge.first ? edge.second : edge.first;
    link(node, teamOffset + teams.indexOf(preferred), 1);
    link(node, teamOffset + teams.indexOf(other), 1);
  });
  teams.forEach((team, index) => link(teamOffset + index, sink, demand[team]));
  let flow = 0;
  while (true) {
    const parent = Array(size).fill(-1), queue = [source]; parent[source] = source;
    for (let cursor = 0; cursor < queue.length && parent[sink] === -1; cursor++) {
      const from = queue[cursor];
      for (let to = 0; to < size; to += 1) if (capacity[from][to] > 0 && parent[to] === -1) {
        parent[to] = from; queue.push(to); if (to === sink) break;
      }
    }
    if (parent[sink] === -1) break;
    let amount = Number.MAX_SAFE_INTEGER;
    for (let node = sink; node !== source; node = parent[node]) amount = Math.min(amount, capacity[parent[node]][node]);
    for (let node = sink; node !== source; node = parent[node]) { capacity[parent[node]][node] -= amount; capacity[node][parent[node]] += amount; }
    flow += amount;
  }
  if (flow !== edges.length) throw new Error('The future NBA schedule could not satisfy the 41-home/41-away orientation.');
  return edges.map((edge, index) => {
    const node = edgeOffset + index;
    // A saturated edge->team residual means that endpoint owns the extra
    // home assignment.  Looking at the reverse residual can point to a
    // rerouted intermediate edge and would create a self-matchup.
    const extraTeam = [edge.first, edge.second].find(team => capacity[node][teamOffset + teams.indexOf(team)] === 0);
    if (!extraTeam) throw new Error('The future NBA schedule lost a three-game home assignment.');
    return extraTeam === edge.first
      ? [{ home: edge.first, away: edge.second }, { home: edge.second, away: edge.first }, { home: edge.first, away: edge.second }]
      : [{ home: edge.second, away: edge.first }, { home: edge.first, away: edge.second }, { home: edge.second, away: edge.first }];
  });
}

function pairCount(a, b, seed) {
  const divisionA = DIVISION_BY_TEAM.get(a), divisionB = DIVISION_BY_TEAM.get(b);
  const conferenceA = CONFERENCE_BY_DIVISION.get(divisionA), conferenceB = CONFERENCE_BY_DIVISION.get(divisionB);
  if (divisionA === divisionB) return 4;
  if (conferenceA !== conferenceB) return 2;
  const [firstDivision, secondDivision] = ordered([divisionA, divisionB]);
  const firstTeam = divisionA === firstDivision ? a : b;
  const secondTeam = divisionA === firstDivision ? b : a;
  const firstIndex = DIVISIONS[firstDivision].indexOf(firstTeam);
  const secondIndex = DIVISIONS[secondDivision].indexOf(secondTeam);
  const offset = (secondIndex - firstIndex + (hashSeed(`${seed}:${firstDivision}:${secondDivision}`) % 5) + 5) % 5;
  return [0, 1, 2].includes(offset) ? 4 : 3;
}

function roundGames(games) {
  const rounds = [];
  for (const game of games) {
    let round = rounds.find(item => !item.teams.has(game.home) && !item.teams.has(game.away));
    if (!round) { round = { games: [], teams: new Set() }; rounds.push(round); }
    round.games.push(game); round.teams.add(game.home); round.teams.add(game.away);
  }
  return rounds;
}

/**
 * Generate a future NBA-style 82-game matrix. This is deliberately a
 * forecast/scenario source: it does not claim to know the announced dates,
 * NBA Cup exceptions, travel, arena conflicts or future transactions.
 */
export function generateFutureNbaSchedule({ seasonStartYear, teamIds = NBA_TEAM_CODES, seed = 'nba-future-schedule' } = {}) {
  if (!integer(Number(seasonStartYear), 1947, 2200)) fail('Future NBA schedules need a valid season start year.');
  const teams = validateTeams(teamIds, { requireFullLeague: true });
  if (typeof seed !== 'string' || !/^[A-Za-z0-9:._-]{1,80}$/.test(seed)) fail('Future NBA schedules need a short deterministic seed.');
  const pairGames = [], threeGameEdges = [], fixedHome = Object.fromEntries(teams.map(team => [team, 0]));
  for (let left = 0; left < teams.length; left += 1) for (let right = left + 1; right < teams.length; right += 1) {
    const first = teams[left], second = teams[right], count = pairCount(first, second, `${seed}:${seasonStartYear}`);
    if (count === 3) threeGameEdges.push({ first, second });
    else {
      const homeAwayGames = homeAway([first, second], count, `${seed}:${seasonStartYear}`);
      pairGames.push(...homeAwayGames);
      homeAwayGames.forEach(game => { fixedHome[game.home]++; });
    }
  }
  const threeGameHomeAway = orientThreeGamePairs(threeGameEdges, fixedHome, `${seed}:${seasonStartYear}`);
  pairGames.push(...threeGameHomeAway.flat());
  const rounds = roundGames(pairGames);
  const start = Date.UTC(Number(seasonStartYear), 9, 20);
  const seasonWindowDays = 176; // October 20 through the mid-April regular-season window.
  const games = rounds.flatMap((round, roundIndex) => round.games.map((game, gameIndex) => ({
    id: `future-${seasonStartYear}-${String(roundIndex + 1).padStart(3, '0')}-${String(gameIndex + 1).padStart(2, '0')}`,
    seasonStartYear: Number(seasonStartYear), phase: 'regular', round: roundIndex + 1,
    scheduledAt: new Date(start + (rounds.length <= 1 ? 0 : Math.round(roundIndex * seasonWindowDays / (rounds.length - 1))) * 24 * 60 * 60 * 1000).toISOString(),
    home: game.home, away: game.away, result: null,
  })));
  const appearances = Object.fromEntries(teams.map(team => [team, 0]));
  const homeGames = Object.fromEntries(teams.map(team => [team, 0]));
  games.forEach(game => { appearances[game.home]++; appearances[game.away]++; homeGames[game.home]++; });
  if (Object.values(appearances).some(value => value !== 82)) fail(`The future NBA schedule generator did not conserve an 82-game season (${games.length} games; ${Math.min(...Object.values(appearances))}-${Math.max(...Object.values(appearances))} appearances).`);
  if (Object.values(homeGames).some(value => value !== 41)) fail('The future NBA schedule generator did not conserve a 41-home/41-away season.');
  return {
    status: 'ready', kind: 'generated-future', seasonStartYear: Number(seasonStartYear), teams,
    structure: Object.fromEntries(teams.map(team => [team, classifyNbaTeam(team)])), games,
    gamesPerTeam: 82, coverage: { games: games.length, teamAppearances: appearances, homeGames, awayGames: Object.fromEntries(teams.map(team => [team, 82 - homeGames[team]])), rounds: rounds.length,
      calendarWindowDays: seasonWindowDays, calendarStart: games[0]?.scheduledAt || null, calendarEnd: games.at(-1)?.scheduledAt || null },
    sourceReceipt: { format: 'djhc-nba-generated-schedule-v1', model: NBA_SCHEDULE_SOURCE_VERSION, seed, seasonStartYear: Number(seasonStartYear) },
    note: 'Generated NBA-style forecast schedule: opponent matrix, 41/41 home/away counts, and an October-to-mid-April calendar window are deterministic; announced dates, NBA Cup, travel, arena conflicts and future events are not observed.',
  };
}

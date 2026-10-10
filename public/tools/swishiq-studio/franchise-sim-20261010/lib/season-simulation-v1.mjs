import { simulateGame } from './game-simulator-v2.mjs';
import { applyTransaction } from './transaction-engine-v1.mjs';
import { projectNextSeasonRating } from './career-progression-v1.mjs';
import { normalizeCanonicalPlayerName, validateLeagueState } from './simulation-contracts-v1.mjs';
import { simulateSeasonAwards } from './season-awards-v1.mjs';
import { simulateNbaPostseason } from './nba-postseason-v1.mjs';
import { derivePayrollStateForLeague } from './payroll-state-v1.mjs';
import { applyCapAccountingToLeague, captureTeamCapSnapshot, calculateTeamCapAccounting } from './cap-accounting-v1.mjs';
import { prepareLeagueGameInput } from './league-game-roster-v1.mjs';
import { NBA_TEAM_GROUPS_2026_27, generateNbaRegularSeasonSchedule, validateNbaRegularSeasonSchedule } from './nba-schedule-v1.mjs';

export const LEAGUE_SEASON_WINDOWS = Object.freeze([
  'preseason',
  'option-decisions',
  'draft',
  'free-agency',
  'trade-window',
  'roster-finalization',
  'games',
  'season-end',
]);

function clone(value) { return structuredClone(value); }

function windowIndex(value) { return LEAGUE_SEASON_WINDOWS.indexOf(value); }

const NBA_SCHEDULE_STATE_FORMAT = 'djhc-league-season-schedule-state-v1';
const SEASON_GAME_REQUEST_ADAPTER_FORMAT = 'djhc-season-game-request-adapter-v1';
const NBA_SCHEDULE_GENERATOR_OPTIONS = new Set(['cupFlex', 'calendar', 'constraints', 'cupGroupPlayDates', 'cupGroupPlayFixtures', 'seed']);
const NBA_ARENA_SOURCE_STATUSES = new Set(['verified-2026-27-team-schedule', 'verified-team-arena-reference']);

function normalizeTeamCodeSet(teams = []) {
  return [...new Set(teams.map(team => String(team.teamCode ?? '').trim().toUpperCase()).filter(Boolean))].sort();
}

function sameTeamCodeSet(left, right) {
  return left.length === right.length && left.every((teamCode, index) => teamCode === right[index]);
}

function summarizeNextSeasonSchedule(schedule, { sourceKind, scenarioMode = 'nba-cup', leagueTeamCodes }) {
  const validation = validateNbaRegularSeasonSchedule(schedule);
  if (!validation.valid) throw new Error(`Next-season NBA schedule is invalid: ${validation.errors.join(' ')}`);
  const pendingCup = schedule.cupFlex?.status === 'pending-group-play-matchups';
  const noCupScenario = schedule.cupFlex?.status === 'disabled';
  const teamRows = schedule.teams ?? [];
  const placeholderVenueTeams = teamRows.filter(team => team.arenaIdSourceStatus === 'simulator-unique-venue-placeholder').map(team => team.teamCode);
  const unresolvedVenueTeams = teamRows.filter(team => !team.arenaId || !NBA_ARENA_SOURCE_STATUSES.has(team.arenaIdSourceStatus)).map(team => team.teamCode);
  const cupGroupPlayStatus = schedule.cupFlex?.groupPlayStatus ?? (noCupScenario ? 'not-applicable-user-selected-no-cup' : 'unknown');
  const cupGroupPlayResolved = noCupScenario || cupGroupPlayStatus === 'scenario-group-play-fixtures-placed-from-supplied-group-draw-scenario';
  const venueResolved = unresolvedVenueTeams.length === 0;
  const fullyResolved = validation.complete && cupGroupPlayResolved && venueResolved;
  const scheduledByTeam = Object.fromEntries(teamRows.map(team => {
    const games = (schedule.games ?? []).filter(game => game.homeTeamCode === team.teamCode || game.awayTeamCode === team.teamCode);
    return [team.teamCode, {
      games: games.length,
      home: games.filter(game => game.homeTeamCode === team.teamCode).length,
      away: games.filter(game => game.awayTeamCode === team.teamCode).length,
      pendingCupGames: (schedule.cupFlex?.slots ?? []).filter(slot => slot.teamCode === team.teamCode).length,
    }];
  }));
  const assumptions = [
    'Generated or caller-supplied schedule is not authenticated as an official NBA schedule.',
    'Future calendar, schedule placement, and opponent allocation remain scenario assumptions.',
  ];
  if (pendingCup) assumptions.push('Thirty Cup-result-dependent regular-season games (60 team slots) remain unresolved; the slate is not an 82-game completed schedule.');
  if (!cupGroupPlayResolved) assumptions.push('Cup group-play matchups are not configured; the dated baseline does not assert the season-specific group draw.');
  if (noCupScenario) assumptions.push('No-Cup schedule was explicitly selected as a user scenario and does not represent the default NBA Cup format.');
  if (placeholderVenueTeams.length) assumptions.push(`${placeholderVenueTeams.length} team venue IDs are simulator placeholders, not verified arenas.`);
  else if (unresolvedVenueTeams.length) assumptions.push(`${unresolvedVenueTeams.length} team venue IDs lack a recognized verified source status.`);
  if (sourceKind === 'caller-supplied') assumptions.push('Caller-supplied schedule content was preserved and validated; source authenticity was not independently verified here.');
  return {
    format: NBA_SCHEDULE_STATE_FORMAT,
    schemaVersion: '1.0.0',
    seasonStartYear: schedule.seasonStartYear,
    status: pendingCup ? 'cup-flex-pending' : !cupGroupPlayResolved ? 'cup-group-play-unresolved'
      : !venueResolved ? noCupScenario ? 'no-cup-scenario-venue-provisional' : 'venue-evidence-unresolved'
        : noCupScenario ? 'completed-no-cup-scenario' : 'completed-generated-scenario',
    complete: fullyResolved,
    gameCountComplete: validation.complete,
    cupFlexResolved: !pendingCup,
    cupGroupPlayResolved,
    venueResolved,
    officialSchedule: false,
    sourceKind,
    sourceModule: sourceKind === 'local-generator' ? 'lib/nba-schedule-v1.mjs' : null,
    seed: schedule.seed ?? null,
    scheduleFormat: schedule.format,
    scheduleSchemaVersion: schedule.schemaVersion ?? null,
    scheduledGameCount: validation.gameCount,
    expectedGamesPerTeam: 82,
    scheduledByTeam,
    pendingCupGameCount: pendingCup ? 30 : 0,
    pendingCupTeamSlotCount: validation.pendingCupTeamSlots,
    cupGroupPlayStatus,
    venueStatus: placeholderVenueTeams.length ? 'placeholder-venue-assumptions-present'
      : unresolvedVenueTeams.length ? 'venue-source-unresolved' : 'venue-source-status-provided',
    placeholderVenueTeamCodes: placeholderVenueTeams,
    unresolvedVenueTeamCodes: unresolvedVenueTeams,
    leagueTeamCodes,
    scenarioMode,
    assumptions,
  };
}

function buildNextSeasonSchedule(state, seasonStartYear, {
  nextSeasonSchedule = null,
  nextSeasonScheduleOptions = null,
} = {}) {
  if (seasonStartYear < 2027) return null;
  const leagueTeamCodes = normalizeTeamCodeSet(state.teams);
  const nbaTeamCodes = normalizeTeamCodeSet(NBA_TEAM_GROUPS_2026_27);
  const isNbaLeague = sameTeamCodeSet(leagueTeamCodes, nbaTeamCodes);
  const options = nextSeasonScheduleOptions ?? {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('nextSeasonScheduleOptions must be an object when supplied.');
  const unknownOption = Object.keys(options).find(key => !NBA_SCHEDULE_GENERATOR_OPTIONS.has(key) && key !== 'scenarioMode');
  if (unknownOption) throw new Error(`Unsupported next-season schedule option: ${unknownOption}.`);
  const scenarioMode = options.scenarioMode ?? 'nba-cup';
  if (!['nba-cup', 'no-cup'].includes(scenarioMode)) throw new Error('Schedule scenarioMode must be nba-cup or no-cup.');
  if ((scenarioMode === 'no-cup') !== (options.cupFlex === false)) {
    throw new Error('No-Cup scheduling is available only when the caller explicitly supplies scenarioMode: no-cup and cupFlex: false.');
  }
  const suppliedSchedule = nextSeasonSchedule !== null && nextSeasonSchedule !== undefined;
  if (suppliedSchedule) {
    if (!isNbaLeague) throw new Error('A supplied NBA schedule cannot be attached to a non-NBA/custom LeagueState team set.');
    if (nextSeasonSchedule?.seasonStartYear !== seasonStartYear) throw new Error('Caller-supplied schedule seasonStartYear must match the rollover target.');
    if (!sameTeamCodeSet(normalizeTeamCodeSet(nextSeasonSchedule?.teams), leagueTeamCodes)) throw new Error('Caller-supplied schedule teams must match the LeagueState team set exactly.');
    if (nextSeasonSchedule?.policy?.officialSchedule === true || nextSeasonSchedule?.officialSchedule === true) {
      throw new Error('Caller-supplied schedule claims official status without an authenticated source contract.');
    }
    if (nextSeasonSchedule?.cupFlex?.status === 'disabled' && scenarioMode !== 'no-cup') {
      throw new Error('A disabled-Cup schedule requires the explicit no-cup scenario selection.');
    }
    if (nextSeasonSchedule?.cupFlex?.status !== 'disabled' && scenarioMode === 'no-cup') {
      throw new Error('The explicit no-cup scenario conflicts with the supplied Cup-enabled schedule.');
    }
    const schedule = clone(nextSeasonSchedule);
    return { schedule, scheduleState: summarizeNextSeasonSchedule(schedule, {
      sourceKind: 'caller-supplied', scenarioMode, leagueTeamCodes,
    }) };
  }
  if (!isNbaLeague) {
    return {
      schedule: null,
      scheduleState: {
        format: NBA_SCHEDULE_STATE_FORMAT,
        schemaVersion: '1.0.0',
        seasonStartYear,
        status: 'blocked-custom-league-requires-explicit-schedule',
        complete: false,
        officialSchedule: false,
        sourceKind: 'not-generated',
        scheduledGameCount: 0,
        expectedGamesPerTeam: 82,
        pendingCupGameCount: null,
        pendingCupTeamSlotCount: null,
        leagueTeamCodes,
        assumptions: ['Automatic NBA scheduling requires the exact 30-team NBA team-code set; no schedule was invented for this custom league.'],
      },
    };
  }
  const seed = options.seed ?? (seasonStartYear >>> 0);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Future schedule seed must be an unsigned 32-bit integer.');
  const generatorOptions = { seasonStartYear, teams: NBA_TEAM_GROUPS_2026_27, seed };
  for (const key of ['cupFlex', 'calendar', 'constraints', 'cupGroupPlayDates', 'cupGroupPlayFixtures']) {
    if (Object.hasOwn(options, key)) generatorOptions[key] = clone(options[key]);
  }
  const schedule = generateNbaRegularSeasonSchedule(generatorOptions);
  return { schedule, scheduleState: summarizeNextSeasonSchedule(schedule, {
    sourceKind: 'local-generator', scenarioMode, leagueTeamCodes,
  }) };
}

function findTeam(state, teamCode) {
  return state.teams.find(team => team.teamCode === String(teamCode ?? '').toUpperCase()) ?? null;
}

function seasonBucket(parent, seasonStartYear) {
  parent[String(seasonStartYear)] ??= { gamesPlayed: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, minutes: 0 };
  return parent[String(seasonStartYear)];
}

const boxScoreStatAliases = Object.freeze({
  points: ['points'],
  fieldGoalAttempts: ['fieldGoalAttempts', 'fieldGoalsAttempted'],
  fieldGoalsMade: ['fieldGoalsMade'],
  fieldGoalsMissed: ['fieldGoalsMissed'],
  threePointAttempts: ['threePointAttempts', 'threePointersAttempted'],
  threePointersMade: ['threePointersMade'],
  threePointMisses: ['threePointMisses', 'threePointersMissed'],
  twoPointAttempts: ['twoPointAttempts', 'twoPointersAttempted'],
  twoPointMakes: ['twoPointMakes', 'twoPointersMade'],
  twoPointMisses: ['twoPointMisses', 'twoPointersMissed'],
  freeThrowAttempts: ['freeThrowAttempts', 'freeThrowsAttempted'],
  freeThrowsMade: ['freeThrowsMade'],
  freeThrowsMissed: ['freeThrowsMissed'],
  rebounds: ['rebounds'],
  offensiveRebounds: ['offensiveRebounds'],
  defensiveRebounds: ['defensiveRebounds'],
  assists: ['assists'],
  turnovers: ['turnovers'],
  steals: ['steals'],
  blocks: ['blocks'],
  personalFouls: ['personalFouls'],
  minutes: ['minutes'],
});

function readBoxScoreStat(row, stat) {
  if (!row || typeof row !== 'object') return null;
  for (const field of boxScoreStatAliases[stat] ?? [stat]) {
    if (!Object.hasOwn(row, field) || row[field] === null || row[field] === '') continue;
    const value = Number(row[field]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Box-score ${stat} must be finite and nonnegative.`);
    return value;
  }
  return null;
}

function aggregatePlayerBoxStats(boxes) {
  if (!Array.isArray(boxes) || !boxes.length) return null;
  const stats = {};
  for (const stat of Object.keys(boxScoreStatAliases)) {
    const values = boxes.map(box => readBoxScoreStat(box, stat));
    const present = values.filter(value => value !== null).length;
    if (!present) continue;
    if (present !== boxes.length) throw new Error(`Player boxes contain partial ${stat} values.`);
    stats[stat] = values.reduce((sum, value) => sum + value, 0);
  }
  const deriveMisses = (missStat, attemptStat, madeStat) => {
    if (stats[missStat] !== undefined || stats[attemptStat] === undefined || stats[madeStat] === undefined) return;
    stats[missStat] = stats[attemptStat] - stats[madeStat];
  };
  deriveMisses('fieldGoalsMissed', 'fieldGoalAttempts', 'fieldGoalsMade');
  deriveMisses('threePointMisses', 'threePointAttempts', 'threePointersMade');
  deriveMisses('twoPointMisses', 'twoPointAttempts', 'twoPointMakes');
  deriveMisses('freeThrowsMissed', 'freeThrowAttempts', 'freeThrowsMade');
  for (const [index, box] of boxes.entries()) {
    const points = readBoxScoreStat(box, 'points');
    const fieldGoalAttempts = readBoxScoreStat(box, 'fieldGoalAttempts');
    const fieldGoalsMade = readBoxScoreStat(box, 'fieldGoalsMade');
    const fieldGoalsMissed = readBoxScoreStat(box, 'fieldGoalsMissed');
    const threePointAttempts = readBoxScoreStat(box, 'threePointAttempts');
    const threePointersMade = readBoxScoreStat(box, 'threePointersMade');
    const twoPointAttempts = readBoxScoreStat(box, 'twoPointAttempts');
    const twoPointMakes = readBoxScoreStat(box, 'twoPointMakes');
    const freeThrowAttempts = readBoxScoreStat(box, 'freeThrowAttempts');
    const freeThrowsMade = readBoxScoreStat(box, 'freeThrowsMade');
    const rebounds = readBoxScoreStat(box, 'rebounds');
    const offensiveRebounds = readBoxScoreStat(box, 'offensiveRebounds');
    const defensiveRebounds = readBoxScoreStat(box, 'defensiveRebounds');
    const bad = (fieldGoalAttempts !== null && fieldGoalsMade !== null && fieldGoalsMissed !== null &&
        fieldGoalAttempts !== fieldGoalsMade + fieldGoalsMissed) ||
      (fieldGoalAttempts !== null && threePointAttempts !== null && twoPointAttempts !== null &&
        fieldGoalAttempts !== threePointAttempts + twoPointAttempts) ||
      (fieldGoalAttempts !== null && fieldGoalsMade !== null && fieldGoalsMade > fieldGoalAttempts) ||
      (threePointAttempts !== null && threePointersMade !== null && threePointersMade > threePointAttempts) ||
      (twoPointAttempts !== null && twoPointMakes !== null && twoPointMakes > twoPointAttempts) ||
      (points !== null && threePointersMade !== null && twoPointMakes !== null && freeThrowsMade !== null &&
        points !== 3 * threePointersMade + 2 * twoPointMakes + freeThrowsMade) ||
      (freeThrowAttempts !== null && freeThrowsMade !== null && freeThrowsMade > freeThrowAttempts) ||
      (rebounds !== null && offensiveRebounds !== null && defensiveRebounds !== null &&
        rebounds !== offensiveRebounds + defensiveRebounds);
    if (bad) throw new Error(`Player box ${index + 1} has inconsistent shot, point, or rebound arithmetic.`);
  }
  return stats;
}

function reconcilePlayerAndTeamBoxes(boxes, declaredTeamStats, expectedScore, gameId, side) {
  const stats = aggregatePlayerBoxStats(boxes);
  if (!stats) return null;
  if (stats.points !== undefined && stats.points !== expectedScore) {
    throw new Error(`Game ${gameId} ${side} player points do not equal the simulated team score.`);
  }
  for (const stat of Object.keys(boxScoreStatAliases)) {
    const declared = readBoxScoreStat(declaredTeamStats, stat);
    if (declared === null) continue;
    if (stats[stat] === undefined) throw new Error(`Game ${gameId} ${side} team stats include ${stat}, but player boxes omit it.`);
    if (Math.abs(stats[stat] - declared) > 1e-8) {
      throw new Error(`Game ${gameId} ${side} player ${stat} totals do not match the simulated team total.`);
    }
  }
  return stats;
}

function validateTeamBoxScoreLinks(home, away, gameId) {
  for (const [side, own, opponent] of [['home', home, away], ['away', away, home]]) {
    if (own?.assists !== undefined && own.fieldGoalsMade !== undefined && own.assists > own.fieldGoalsMade) {
      throw new Error(`Game ${gameId} ${side} assists exceed made field goals.`);
    }
    if (own?.steals !== undefined && opponent?.turnovers !== undefined && own.steals > opponent.turnovers) {
      throw new Error(`Game ${gameId} ${side} steals exceed opponent turnovers.`);
    }
    if (own?.blocks !== undefined && opponent?.fieldGoalsMissed !== undefined && own.blocks > opponent.fieldGoalsMissed) {
      throw new Error(`Game ${gameId} ${side} blocks exceed opponent missed field goals.`);
    }
  }
  if (home?.rebounds !== undefined && away?.rebounds !== undefined &&
      home.fieldGoalsMissed !== undefined && away.fieldGoalsMissed !== undefined) {
    const allMisses = home.fieldGoalsMissed + away.fieldGoalsMissed +
      (home.freeThrowsMissed ?? 0) + (away.freeThrowsMissed ?? 0);
    if (home.rebounds + away.rebounds > allMisses) {
      throw new Error(`Game ${gameId} team rebounds exceed the available missed shots.`);
    }
  }
}

function applySampledGameToLeagueState(state, { gameId, input, sample, seasonStartYear, modelId, seed }) {
  if ((state.completedGames ?? []).some(game => game.gameId === gameId && game.seasonStartYear === seasonStartYear)) {
    throw new Error(`Game ${gameId} was already recorded for this season.`);
  }
  if (![sample.homeScore, sample.awayScore].every(value => Number.isInteger(value) && value >= 0)) throw new Error(`Game ${gameId} scores must be nonnegative integers.`);
  const overtimePeriods = sample.overtimePeriods ?? 0;
  if (!Number.isInteger(overtimePeriods) || overtimePeriods < 0) throw new Error(`Game ${gameId} overtimePeriods must be a nonnegative integer.`);
  const elapsedGameMinutes = 48 + 5 * overtimePeriods;
  const expectedTeamMinutes = elapsedGameMinutes * 5;
  const homeTeamCode = input.homeTeamCode ?? input.home?.teamCode ?? input.home?.teamCodeAbbreviation;
  const awayTeamCode = input.awayTeamCode ?? input.away?.teamCode ?? input.away?.teamCodeAbbreviation;
  const gameRef = typeof input.gameRef === 'string' && input.gameRef.trim() ? input.gameRef.trim() : null;
  const gameLocalDate = typeof input.gameLocalDate === 'string' ? input.gameLocalDate
    : typeof input.date === 'string' ? input.date : null;
  const gameIdentityMetadata = {
    ...(gameRef ? { gameRef } : {}),
    ...(gameLocalDate ? { gameLocalDate } : {}),
  };
  if (!homeTeamCode || !awayTeamCode || String(homeTeamCode).toUpperCase() === String(awayTeamCode).toUpperCase()) {
    throw new Error(`Game ${gameId} must resolve distinct home and away team codes before it can update LeagueState.`);
  }
  const homeTeam = findTeam(state, homeTeamCode);
  const awayTeam = findTeam(state, awayTeamCode);
  if (!homeTeam || !awayTeam) throw new Error(`Game ${gameId} references a team outside LeagueState.`);
  const homeBoxes = sample.homeBox ?? [];
  const awayBoxes = sample.awayBox ?? [];
  const homeBoxStats = reconcilePlayerAndTeamBoxes(homeBoxes, sample.homeTeamStats, sample.homeScore, gameId, 'home');
  const awayBoxStats = reconcilePlayerAndTeamBoxes(awayBoxes, sample.awayTeamStats, sample.awayScore, gameId, 'away');
  validateTeamBoxScoreLinks(homeBoxStats, awayBoxStats, gameId);
  for (const [boxes, stats, declared] of [[homeBoxes, homeBoxStats, sample.homeTeamStats], [awayBoxes, awayBoxStats, sample.awayTeamStats]]) {
    for (const total of [stats?.minutes, readBoxScoreStat(declared, 'minutes')]) {
      if (total !== undefined && total !== null && Math.abs(total - expectedTeamMinutes) > 1e-7) throw new Error(`Game ${gameId} team minutes do not match its regulation/overtime duration.`);
    }
    for (const box of boxes) {
      const minutes = readBoxScoreStat(box, 'minutes');
      if (minutes !== null && minutes > elapsedGameMinutes + 1e-7) throw new Error(`Game ${gameId} player minutes exceed game duration.`);
    }
  }
  const resolveBoxPlayers = (team, roster, boxes) => {
    const rosterRows = roster?.players ?? [], seen = new Set();
    return boxes.map((box, index) => {
      const explicitName = box.canonicalName ?? box.name;
      const refMatches = box.playerRef === null || box.playerRef === undefined ? []
        : rosterRows.filter(player => String(player.playerRef) === String(box.playerRef));
      const displayMatches = box.displayName ? rosterRows.filter(player => normalizeCanonicalPlayerName(player.canonicalName) === normalizeCanonicalPlayerName(box.displayName)) : [];
      if (refMatches.length > 1 || displayMatches.length > 1) throw new Error(`Game ${gameId} has ambiguous player box identity.`);
      if (box.playerRef !== null && box.playerRef !== undefined && refMatches.length !== 1) throw new Error(`Game ${gameId} player box reference does not resolve to the input roster.`);
      const name = explicitName ?? refMatches[0]?.canonicalName ?? displayMatches[0]?.canonicalName ?? null;
      const normalizedName = normalizeCanonicalPlayerName(name);
      const inputMatches = rosterRows.filter(player => normalizeCanonicalPlayerName(player.canonicalName) === normalizedName);
      const matchingPlayers = normalizedName ? state.players.filter(player => normalizeCanonicalPlayerName(player.canonicalName) === normalizedName) : [];
      if (inputMatches.length !== 1 || matchingPlayers.length !== 1 || String(matchingPlayers[0].teamCode).toUpperCase() !== team.teamCode ||
          (refMatches.length && normalizeCanonicalPlayerName(refMatches[0].canonicalName) !== normalizedName) ||
          (displayMatches.length && normalizeCanonicalPlayerName(displayMatches[0].canonicalName) !== normalizedName)) {
        throw new Error(`Game ${gameId} player box does not resolve to one current input-roster player on ${team.teamCode}.`);
      }
      if (seen.has(normalizedName)) throw new Error(`Game ${gameId} has duplicate player box rows for ${name}.`);
      seen.add(normalizedName);
      return { box, player: matchingPlayers[0] };
    });
  };
  const homeResolved = resolveBoxPlayers(homeTeam, input.home, homeBoxes);
  const awayResolved = resolveBoxPlayers(awayTeam, input.away, awayBoxes);
  const homeWon = sample.homeScore > sample.awayScore ? true : sample.homeScore < sample.awayScore ? false : null;
  const awayWon = homeWon === null ? null : !homeWon;
  const updateTeam = (team, ownScore, opponentScore, won, boxStats) => {
    const stats = seasonBucket(team.seasonStatsByYear ??= {}, seasonStartYear);
    stats.gamesPlayed += 1;
    stats.wins += Number(won);
    stats.losses += Number(won === false);
    stats.ties += Number(won === null);
    stats.pointsFor += ownScore;
    stats.pointsAgainst += opponentScore;
    stats.minutes += boxStats?.minutes ?? expectedTeamMinutes;
    if (boxStats) {
      stats.boxScoreStats ??= {};
      for (const [key, value] of Object.entries(boxStats)) {
        stats.boxScoreStats[key] = (stats.boxScoreStats[key] ?? 0) + value;
      }
    }
  };
  updateTeam(homeTeam, sample.homeScore, sample.awayScore, homeWon, homeBoxStats);
  updateTeam(awayTeam, sample.awayScore, sample.homeScore, awayWon, awayBoxStats);
  state.playerGameLogs ??= [];
  state.teamGameLogs ??= [];
  const unresolvedPlayerRows = [];
  const updatePlayerBoxes = (team, resolved, side) => {
    for (const { box, player } of resolved) {
      const totals = seasonBucket(player.seasonStatsByYear ??= {}, seasonStartYear);
      const playerStats = aggregatePlayerBoxStats([box]) ?? {};
      const minutes = playerStats.minutes ?? 0;
      if (minutes > 0) totals.gamesPlayed += 1;
      for (const [key, value] of Object.entries(playerStats)) totals[key] = (totals[key] ?? 0) + value;
      state.playerGameLogs.push({
        gameId, ...gameIdentityMetadata, seasonStartYear, teamCode: team.teamCode, canonicalName: player.canonicalName,
        side, stats: structuredClone(box), aggregateStats: playerStats, sourceModelId: modelId, seed,
      });
    }
  };
  updatePlayerBoxes(homeTeam, homeResolved, 'home');
  updatePlayerBoxes(awayTeam, awayResolved, 'away');
  for (const [team, opponent, side, boxStats, declaredTeamStats] of [
    [homeTeam, awayTeam, 'home', homeBoxStats, sample.homeTeamStats],
    [awayTeam, homeTeam, 'away', awayBoxStats, sample.awayTeamStats],
  ]) {
    state.teamGameLogs.push({
      gameId, ...gameIdentityMetadata, seasonStartYear, teamCode: team.teamCode, opponentTeamCode: opponent.teamCode,
      side, stats: boxStats, declaredTeamStats: clone(declaredTeamStats ?? null),
      boxScoreStatus: boxStats?.points !== undefined ? 'exact-player-sum' : boxStats ? 'partial-player-sum' : 'player-box-not-generated',
      unresolvedPlayerRows: unresolvedPlayerRows.filter(row => row.teamCode === team.teamCode),
      sourceModelId: modelId, seed,
    });
  }
  state.completedGames ??= [];
  state.completedGames.push({
    gameId,
    ...gameIdentityMetadata,
    seasonStartYear,
    homeTeamCode: homeTeam.teamCode,
    awayTeamCode: awayTeam.teamCode,
    homeScore: sample.homeScore,
    awayScore: sample.awayScore,
    homeMargin: sample.homeScore - sample.awayScore,
    totalPoints: sample.homeScore + sample.awayScore,
    overtimePeriods,
    elapsedGameMinutes,
    teamMinuteSource: homeBoxStats?.minutes !== undefined && awayBoxStats?.minutes !== undefined ? 'generated-player-boxes' : 'regulation-and-overtime-duration',
    homeWin: homeWon ? true : awayWon ? false : null,
    playerBoxScoreStatus: homeBoxStats?.points !== undefined && awayBoxStats?.points !== undefined ? 'exact-player-team-reconciliation' : 'partial-or-not-generated',
    modelId,
    seed,
  });
  state.revision += 1;
  return { homeTeamCode: homeTeam.teamCode, awayTeamCode: awayTeam.teamCode, unresolvedPlayerRows };
}

function termForSeason(player, seasonStartYear) {
  return (player.contractSeasons ?? player.contract?.seasons ?? [])
    .find(term => Number(term.seasonStartYear ?? term.fromYear) === seasonStartYear) ?? null;
}

function assessNextSeasonContract(player, targetSeasonStartYear) {
  const term = termForSeason(player, targetSeasonStartYear);
  const priorTerm = termForSeason(player, targetSeasonStartYear - 1);
  if (!player.teamCode) return { seasonStartYear: targetSeasonStartYear, status: 'unattached', term: term ? clone(term) : null };
  if (!term && priorTerm) {
    return {
      seasonStartYear: targetSeasonStartYear,
      status: 'expiring-contract-review-required',
      priorTermSeasonStartYear: targetSeasonStartYear - 1,
      term: null,
      note: 'Roster rights, qualifying-offer status, cap holds, and free-agency outcome must be resolved in the offseason windows.',
    };
  }
  if (!term) return { seasonStartYear: targetSeasonStartYear, status: 'contract-state-unknown', term: null };
  const read = value => value && typeof value === 'object' && Object.hasOwn(value, 'value') ? value.value : value;
  const optionStatus = String(read(term.optionDecisionStatus ?? term.optionStatus ?? term.option?.status) ?? '').toLowerCase();
  const optionExists = read(term.playerOption) === true || read(term.teamOption) === true;
  const inactive = ['declined', 'expired', 'terminated', 'void'].includes(optionStatus) || ['expired', 'terminated', 'void'].includes(String(term.status).toLowerCase()) || term.active === false;
  const financialTermsUnresolved = ['salary', 'capHit'].some(field => {
    const raw = term[field];
    const value = read(raw);
    const status = raw?.valueStatus ?? raw?.status ?? term.status ?? 'unknown';
    return value === null || value === undefined || ['candidate', 'conflict', 'unknown', 'unreported', 'unresolved'].includes(status) || String(status).startsWith('unknown');
  });
  const status = inactive ? 'inactive-contract-review-required'
    : ['pending', 'unknown', 'unresolved'].includes(optionStatus) || (optionExists && !['exercised', 'accepted', 'active'].includes(optionStatus))
    ? 'option-decision-required'
    : financialTermsUnresolved || ['candidate', 'unknown', 'unresolved'].includes(String(term.status ?? '').toLowerCase())
      ? 'term-candidate-unreconciled'
      : 'contracted-next-season';
  return { seasonStartYear: targetSeasonStartYear, status, term: clone(term), source: clone(term.source ?? null) };
}

export function inspectLeagueRosterReadiness(state) {
  const unresolved = [];
  const inactive = [];
  for (const player of state.players ?? []) {
    if (!player.teamCode) continue;
    const assessment = assessNextSeasonContract(player, state.seasonStartYear);
    if (player.retired === true || player.rosterStatus === 'retired' || assessment.status === 'inactive-contract-review-required') {
      inactive.push({ canonicalName: player.canonicalName, teamCode: player.teamCode, reason: assessment.status });
    } else if (assessment.status !== 'contracted-next-season') {
      unresolved.push({ canonicalName: player.canonicalName, teamCode: player.teamCode, reason: assessment.status });
    }
  }
  return { format: 'djhc-roster-readiness-v1', seasonStartYear: state.seasonStartYear,
    status: inactive.length ? 'blocked-inactive-roster' : unresolved.length ? 'provisional' : 'contract-screen-ready', unresolved, inactive };
}

function enforceRosterReadiness(state) {
  const readiness = inspectLeagueRosterReadiness(state);
  if (readiness.inactive.length) throw Object.assign(new Error('Inactive or retired players must be removed from active rosters before games.'), { readiness });
  if (readiness.unresolved.length && state.mode === 'exact') throw Object.assign(new Error('Exact league games require resolved current-season roster contracts and option decisions.'), { readiness });
  return readiness;
}

export function advanceLeagueWindow(state, nextWindow) {
  validateLeagueState(state);
  if ((state.offerSheetLedger ?? []).some(sheet => ['pending', 'resolving'].includes(sheet.status))) throw new Error('Resolve outstanding restricted offer sheets before advancing the league window.');
  const current = windowIndex(state.transactionWindow);
  const next = windowIndex(nextWindow);
  if (next < 0) throw new Error(`Unknown league transaction window: ${nextWindow}`);
  if (next !== current + 1) throw new Error(`League windows must advance one step at a time (${state.transactionWindow} -> ${nextWindow}).`);
  let result = clone(state);
  if (nextWindow === 'games') {
    result.rosterReadiness = enforceRosterReadiness(state);
    if (result.rosterReadiness.status === 'provisional') result.stateQuality = {
      status: 'provisional', reasons: [...new Set([...(result.stateQuality?.reasons ?? []), 'Games use an explicitly provisional roster with unresolved contract or option state.'])],
    };
    const configuredCodes = result.teams.filter(team => team.capLedger).map(team => team.teamCode);
    for (const code of configuredCodes) {
      let team = findTeam(result, code);
      if (!team.capLedger.snapshotsBySeason?.[String(result.seasonStartYear)]?.openingDay) {
        const accounting = calculateTeamCapAccounting(result, code);
        if (accounting.totals.mtsCapHoldTeamSalaryUsd !== null) result = captureTeamCapSnapshot(result, code, {
          stage: 'opening-day', snapshotRef: `simulation-${result.seasonStartYear}-regular-season-opening`,
          source: { sourceSystem: 'djhc-league-window', sourceVersion: 'djhc-league-window-v1', sourceClass: 'generated-scenario', seasonStartYear: result.seasonStartYear },
        }).state;
        else if (result.mode === 'exact') throw new Error(`${code} opening-day MTS salary is unresolved.`);
      }
      team = findTeam(result, code);
      team.capLedger.rosterChargePolicyBySeason ??= {};
      team.capLedger.rosterChargePolicyBySeason[String(result.seasonStartYear)] = {
        ...(team.capLedger.rosterChargePolicyBySeason[String(result.seasonStartYear)] ?? {}), period: 'regular-season' };
    }
    result = applyCapAccountingToLeague(result, { teamCodes: configuredCodes }).state;
    if (configuredCodes.some(code => findTeam(result, code).capAccounting.status !== 'calculated')) {
      if (result.mode === 'exact') throw new Error('Exact games require complete configured cap-component accounting.');
      result.stateQuality = { status: 'provisional', reasons: [...new Set([...(result.stateQuality?.reasons ?? []), 'Regular-season component accounting has unresolved inputs.'])] };
    }
  }
  result.transactionWindow = nextWindow;
  result.revision = state.revision + 1;
  return result;
}

/** Build explicit game-request shells from the current LeagueState's attached schedule.
 * This adapter only validates and maps scheduled fixtures; it does not simulate games,
 * produce game inputs, or resolve pending Cup matchups. */
export function buildLeagueGameRequestsFromSeasonSchedule(state, { allowPartialScenario = false } = {}) {
  validateLeagueState(state);
  if (typeof allowPartialScenario !== 'boolean') throw new Error('allowPartialScenario must be a boolean.');
  const schedule = state.seasonSchedule;
  const scheduleState = state.seasonScheduleState;
  if (!schedule || !Array.isArray(schedule.games)) throw new Error('LeagueState has no attached seasonSchedule.games array.');
  if (scheduleState?.format !== NBA_SCHEDULE_STATE_FORMAT) throw new Error('LeagueState is missing a supported seasonScheduleState receipt.');
  if (typeof scheduleState.gameCountComplete !== 'boolean') throw new Error('Schedule receipt must explicitly declare whether the league game count is complete.');
  if (!Number.isInteger(state.seasonStartYear) || schedule.seasonStartYear !== state.seasonStartYear ||
      scheduleState.seasonStartYear !== state.seasonStartYear) {
    throw new Error('Attached season schedule and schedule receipt must match the current LeagueState season.');
  }
  const leagueTeamCodes = normalizeTeamCodeSet(state.teams);
  const scheduleTeamCodes = normalizeTeamCodeSet(schedule.teams);
  if (!sameTeamCodeSet(leagueTeamCodes, scheduleTeamCodes) || !Array.isArray(scheduleState.leagueTeamCodes) ||
      !sameTeamCodeSet(leagueTeamCodes, scheduleState.leagueTeamCodes)) {
    throw new Error('Attached season schedule and schedule receipt team identities must match LeagueState exactly.');
  }
  if (scheduleState.scheduledGameCount !== schedule.games.length) throw new Error('Schedule receipt game count does not match seasonSchedule.games.');
  if (scheduleState.expectedGamesPerTeam !== 82) throw new Error('NBA schedule receipt must declare 82 expected games per team.');

  const validation = validateNbaRegularSeasonSchedule(schedule);
  if (!validation.valid) throw new Error(`Attached season schedule is invalid: ${validation.errors.join(' ')}`);
  const teamCounts = new Map(schedule.teams.map(team => [team.teamCode, { games: 0, home: 0, away: 0, pendingCupGames: 0 }]));
  for (const game of schedule.games) {
    if (game.seasonStartYear !== state.seasonStartYear) {
      throw new Error(`Scheduled game ${game.gameId} belongs to a different season.`);
    }
    const homeTeamCode = String(game.homeTeamCode ?? '').trim().toUpperCase();
    const awayTeamCode = String(game.awayTeamCode ?? '').trim().toUpperCase();
    if (homeTeamCode !== game.homeTeamCode || awayTeamCode !== game.awayTeamCode ||
        !teamCounts.has(homeTeamCode) || !teamCounts.has(awayTeamCode) || homeTeamCode === awayTeamCode) {
      throw new Error(`Scheduled game ${game.gameId} has unresolved or noncanonical team identities.`);
    }
    teamCounts.get(homeTeamCode).games += 1;
    teamCounts.get(homeTeamCode).home += 1;
    teamCounts.get(awayTeamCode).games += 1;
    teamCounts.get(awayTeamCode).away += 1;
  }
  for (const slot of schedule.cupFlex?.slots ?? []) {
    const count = teamCounts.get(slot.teamCode);
    if (!count) throw new Error(`Pending Cup slot ${slot.slotId} references an unknown team.`);
    count.pendingCupGames += 1;
  }
  if (!scheduleState.scheduledByTeam || typeof scheduleState.scheduledByTeam !== 'object' ||
      !sameTeamCodeSet(Object.keys(scheduleState.scheduledByTeam), leagueTeamCodes)) {
    throw new Error('Schedule receipt must include exactly one per-team game-count row for the LeagueState team set.');
  }
  for (const [teamCode, counts] of teamCounts) {
    const receiptCounts = scheduleState.scheduledByTeam[teamCode];
    if (!receiptCounts || ['games', 'home', 'away', 'pendingCupGames'].some(field => receiptCounts[field] !== counts[field])) {
      throw new Error(`Schedule receipt counts do not match attached games and Cup slots for ${teamCode}.`);
    }
  }

  const pendingCup = schedule.cupFlex?.status === 'pending-group-play-matchups';
  const partialScenario = scheduleState.gameCountComplete !== true;
  if (partialScenario) {
    if (!allowPartialScenario) throw new Error('Attached schedule is not game-count complete; set allowPartialScenario: true only to run its current Cup-pending partial slate.');
    if (!pendingCup || scheduleState.status !== 'cup-flex-pending' || validation.complete || validation.gameCount !== 1200 ||
        validation.pendingCupTeamSlots !== 60 || scheduleState.pendingCupGameCount !== 30 || scheduleState.pendingCupTeamSlotCount !== 60 ||
        [...teamCounts.values()].some(row => row.games !== 80 || row.home !== 40 || row.away !== 40 || row.pendingCupGames !== 2)) {
      throw new Error('Partial scenario is allowed only for the validated 80-game-per-team Cup-pending NBA slate.');
    }
  } else if (pendingCup || !validation.complete || validation.pendingCupTeamSlots !== 0 || validation.gameCount !== 1230 ||
      scheduleState.status === 'cup-flex-pending' ||
      scheduleState.pendingCupGameCount !== 0 || scheduleState.pendingCupTeamSlotCount !== 0 ||
      [...teamCounts.values()].some(row => row.games !== 82 || row.home !== 41 || row.away !== 41 || row.pendingCupGames !== 0)) {
    throw new Error('Schedule receipt claims complete game counts, but the attached schedule is not a resolved 82-game, 41/41 slate.');
  }

  const requests = schedule.games.map(game => ({
    gameId: game.gameId,
    gameLocalDate: game.date,
    homeTeamCode: game.homeTeamCode,
    awayTeamCode: game.awayTeamCode,
  })).sort((left, right) => left.gameLocalDate < right.gameLocalDate ? -1
    : left.gameLocalDate > right.gameLocalDate ? 1
      : left.gameId < right.gameId ? -1 : left.gameId > right.gameId ? 1 : 0);
  return {
    format: SEASON_GAME_REQUEST_ADAPTER_FORMAT,
    status: partialScenario ? 'partial-cup-pending-scenario-ready' : 'game-count-complete-schedule-ready',
    seasonStartYear: state.seasonStartYear,
    scheduleStateStatus: scheduleState.status,
    gameCountComplete: scheduleState.gameCountComplete,
    scheduleProvenanceComplete: scheduleState.complete === true,
    officialSchedule: scheduleState.officialSchedule === true,
    partialScenario,
    partialStatus: partialScenario ? 'cup-flex-matchups-unresolved; 30-games-not-included' : null,
    scheduledGameCount: requests.length,
    expectedGamesPerTeam: 82,
    pendingCupGameCount: scheduleState.pendingCupGameCount,
    pendingCupTeamSlotCount: scheduleState.pendingCupTeamSlotCount,
    requests,
    disclosure: 'Produces dated game-request shells only. Caller must provide game inputs and execute a simulator; this adapter does not simulate games or resolve Cup results.',
  };
}

export function applyWindowTransactions(state, proposals, { ruleEngine = null, allowProvisionalSandbox = true } = {}) {
  const next = clone(state);
  const evaluations = [];
  for (const proposal of proposals ?? []) {
    const current = { ...proposal, seasonStartYear: proposal.seasonStartYear ?? next.seasonStartYear,
      transactionWindow: proposal.transactionWindow ?? next.transactionWindow };
    const applied = applyTransaction(next, current, { ruleEngine, allowProvisionalSandbox });
    Object.assign(next, applied.state);
    evaluations.push(applied.evaluation);
  }
  return { state: next, evaluations };
}

export function simulateLeagueGames(state, gameModel, gameRequests = [], {
  seed = 1,
  sampleCount = 1,
  statePathSampleIndex = 0,
  gameInputForState = request => request.input,
  beforeEachGame = null,
  simulateGameFn = simulateGame,
  commissionerMode = false,
} = {}) {
  if (state.transactionWindow !== 'games') throw new Error('Games may only be simulated in the games window.');
  enforceRosterReadiness(state);
  if (!Array.isArray(gameRequests)) throw new Error('Game requests must be an array.');
  const effectiveIds = gameRequests.map((request, index) => request?.gameId ?? `${state.seasonStartYear}-${index + 1}`);
  if (effectiveIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(effectiveIds).size !== effectiveIds.length) throw new Error('Game requests require unique nonempty game IDs.');
  if (effectiveIds.some(id => (state.completedGames ?? []).some(game => game.gameId === id && game.seasonStartYear === state.seasonStartYear))) throw new Error('A requested game was already recorded for this season.');
  const resultingState = clone(state);
  const gameResults = [];
  for (let index = 0; index < (gameRequests ?? []).length; index += 1) {
    const request = gameRequests[index];
    if (beforeEachGame) beforeEachGame({ state: resultingState, request, index, priorResults: gameResults });
    if (resultingState.transactionWindow !== 'games') throw new Error('The before-game hook must leave LeagueState in the games window.');
    if (resultingState.seasonStartYear !== state.seasonStartYear) throw new Error('The before-game hook cannot change the current season.');
    enforceRosterReadiness(resultingState);
    const suppliedInput = gameInputForState(request, resultingState);
    if (!suppliedInput) throw new Error(`No game input could be produced for game ${request.gameId ?? index + 1}.`);
    const preparation = prepareLeagueGameInput({ state: resultingState, input: suppliedInput, commissionerMode });
    Object.assign(resultingState, preparation.state);
    const input = preparation.input;
    if (input.coachingControlReceipt?.liveExecutionRequired &&
        !simulateGameFn.supportedScenarioControls?.includes('djhc-franchise-coaching-v1')) {
      throw new Error('Nonneutral coaching plans require a coaching-capable possession game engine.');
    }
    const gameSeed = (Number(seed) + index) >>> 0;
    const result = simulateGameFn(gameModel, input, { seed: gameSeed, sampleCount });
    if (!result.simulations?.length) throw new Error(`Game ${request.gameId ?? index + 1} returned no simulation sample.`);
    const selectedIndex = Math.min(result.simulations.length - 1, Math.max(0, Math.floor(Number(statePathSampleIndex) || 0)));
    const selectedSample = result.simulations[selectedIndex];
    const executedModelId = result.modelId ?? gameModel.modelId;
    const stateUpdate = applySampledGameToLeagueState(resultingState, {
      gameId: effectiveIds[index],
      input,
      sample: selectedSample,
      seasonStartYear: state.seasonStartYear,
      modelId: executedModelId,
      seed: gameSeed,
    });
    gameResults.push({
      gameId: effectiveIds[index],
      target: request.target ?? { seasonStartYear: state.seasonStartYear },
      modelId: executedModelId,
      modelVersion: result.modelVersion ?? gameModel.version,
      modelStatus: result.status ?? gameModel.status,
      result,
      statePathSampleIndex: selectedIndex,
      stateUpdate,
      rosterPreparation: { receipt: preparation.receipt, controlActions: preparation.controlActions },
      coachingControls: clone(input.coachingControlReceipt),
      disclosure: 'Simulation output from a development-candidate game model; not a certified forecast. Player box-score consistency limits are described in the model bundle.',
    });
  }
  return createSeasonSimulationResult(resultingState, gameResults, {
    initialStateRevision: state.revision,
    resultingStateRevision: resultingState.revision,
    statePathSampleIndex: Math.max(0, Math.floor(Number(statePathSampleIndex) || 0)),
  });
}

/** Simulate a selected batch from the LeagueState's validated dated schedule.
 * Schedule rows only identify fixtures: callers still supply player/rotation inputs.
 * The returned result retains whether the source slate or this submitted batch is partial. */
export function simulateLeagueScheduleRequestBatch(state, gameModel, {
  allowPartialScenario = false,
  requests = null,
  gameInputForState,
  ...simulationOptions
} = {}) {
  const plan = buildLeagueGameRequestsFromSeasonSchedule(state, { allowPartialScenario });
  if (typeof gameInputForState !== 'function') {
    throw new Error('Schedule request shells need a gameInputForState resolver to supply player and rotation inputs.');
  }
  const selectedRequests = requests ?? plan.requests;
  if (!Array.isArray(selectedRequests) || selectedRequests.length === 0) {
    throw new Error('Schedule execution requires a nonempty selected request batch.');
  }
  const canonicalById = new Map(plan.requests.map((request, index) => [request.gameId, { request, index }]));
  let previousIndex = -1;
  for (const request of selectedRequests) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Selected schedule requests must be objects.');
    const row = canonicalById.get(request.gameId);
    if (!row || ['gameId', 'gameLocalDate', 'homeTeamCode', 'awayTeamCode'].some(field => request[field] !== row.request[field]) ||
        Object.keys(request).some(field => !['gameId', 'gameLocalDate', 'homeTeamCode', 'awayTeamCode'].includes(field))) {
      throw new Error(`Selected request ${String(request.gameId ?? '<missing>')} does not exactly match a validated schedule shell.`);
    }
    if (row.index <= previousIndex) throw new Error('Selected schedule requests must preserve deterministic date order without duplicates.');
    previousIndex = row.index;
  }

  const resolveInput = (request, currentState) => {
    const input = gameInputForState(clone(request), clone(currentState));
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error(`Game-input resolver did not provide an object for scheduled game ${request.gameId}.`);
    }
    const rootHome = input.homeTeamCode == null ? null : String(input.homeTeamCode).trim().toUpperCase();
    const rootAway = input.awayTeamCode == null ? null : String(input.awayTeamCode).trim().toUpperCase();
    const nestedHome = input.home?.teamCode == null ? null : String(input.home.teamCode).trim().toUpperCase();
    const nestedAway = input.away?.teamCode == null ? null : String(input.away.teamCode).trim().toUpperCase();
    const resolvedDate = input.gameLocalDate ?? input.date;
    if ((rootHome && rootHome !== request.homeTeamCode) || (nestedHome && nestedHome !== request.homeTeamCode) ||
        (rootAway && rootAway !== request.awayTeamCode) || (nestedAway && nestedAway !== request.awayTeamCode)) {
      throw new Error(`Game-input resolver team identities disagree with scheduled game ${request.gameId}.`);
    }
    if (resolvedDate != null && resolvedDate !== request.gameLocalDate) {
      throw new Error(`Game-input resolver date disagrees with scheduled game ${request.gameId}.`);
    }
    if (input.seasonStartYear != null && input.seasonStartYear !== state.seasonStartYear) {
      throw new Error(`Game-input resolver season disagrees with scheduled game ${request.gameId}.`);
    }
    return {
      ...clone(input),
      seasonStartYear: state.seasonStartYear,
      gameLocalDate: request.gameLocalDate,
      homeTeamCode: request.homeTeamCode,
      awayTeamCode: request.awayTeamCode,
    };
  };

  const seasonResult = simulateLeagueGames(state, gameModel, selectedRequests, {
    ...simulationOptions,
    gameInputForState: resolveInput,
  });
  const completedById = new Map((seasonResult.resultingState.completedGames ?? [])
    .filter(game => game.seasonStartYear === state.seasonStartYear)
    .map(game => [game.gameId, game]));
  let scheduledGamesRecordedCount = 0;
  for (const request of plan.requests) {
    const completed = completedById.get(request.gameId);
    if (!completed) continue;
    if (completed.gameLocalDate !== request.gameLocalDate || completed.homeTeamCode !== request.homeTeamCode ||
        completed.awayTeamCode !== request.awayTeamCode) {
      throw new Error(`Recorded game ${request.gameId} conflicts with the attached schedule identity.`);
    }
    scheduledGamesRecordedCount += 1;
  }
  const scheduleExecution = {
    format: 'djhc-season-schedule-execution-v1',
    status: plan.partialScenario ? 'cup-pending-partial-schedule' : 'game-count-complete-schedule',
    scheduleStateStatus: plan.scheduleStateStatus,
    gameCountComplete: plan.gameCountComplete,
    scheduleProvenanceComplete: plan.scheduleProvenanceComplete,
    officialSchedule: plan.officialSchedule,
    partialScenario: plan.partialScenario,
    partialStatus: plan.partialStatus,
    scheduledGameCount: plan.scheduledGameCount,
    requestsSubmitted: selectedRequests.length,
    gamesSimulated: seasonResult.summary.gamesSimulated,
    scheduledGamesRecordedCount,
    remainingScheduledGameCount: Math.max(0, plan.scheduledGameCount - scheduledGamesRecordedCount),
    allDatedScheduleGamesRecorded: scheduledGamesRecordedCount === plan.scheduledGameCount,
    requestBatchContainsWholeDatedSchedule: selectedRequests.length === plan.scheduledGameCount,
    pendingCupGameCount: plan.pendingCupGameCount,
    pendingCupTeamSlotCount: plan.pendingCupTeamSlotCount,
    disclosure: 'The schedule supplied fixture dates and teams only. Player and rotation inputs were supplied separately; no Cup results were inferred, and a partial batch or partial slate is not a completed season.',
  };
  return {
    ...seasonResult,
    scheduleExecution,
    summary: { ...seasonResult.summary, scheduleExecution: clone(scheduleExecution) },
  };
}

export function createSeasonSimulationResult(state, games = [], extra = {}) {
  const awardSeed = extra.awardSeed ?? extra.seed ?? extra.seasonAwards?.seed ?? 1;
  const awardPolicy = extra.awardPolicy ?? extra.seasonAwards?.policy ?? null;
  const extraSummary = extra.summary && typeof extra.summary === 'object' && !Array.isArray(extra.summary)
    ? clone(extra.summary) : {};
  const seasonAwards = state.transactionWindow === 'season-end'
    ? state.seasonScheduleState
      // A receipt-backed season must pass the same schedule gate whether awards
      // are generated here or supplied by a caller. Recomputing preserves a
      // provisional label for generated, unauthenticated schedule scenarios.
      ? simulateSeasonAwards(state, { seed: awardSeed, policy: awardPolicy, seasonComplete: extra.seasonComplete })
      : extra.seasonAwards
        ? clone(extra.seasonAwards)
        : simulateSeasonAwards(state, { seed: awardSeed, policy: awardPolicy, seasonComplete: extra.seasonComplete })
    : extra.seasonAwards
      ? clone(extra.seasonAwards)
      : {
        format: 'djhc-season-awards-simulation-v1',
        status: 'not-assigned-season-not-at-end',
        seasonStartYear: state.seasonStartYear,
        reason: 'Awards are generated only when the league state reaches its season-end window.',
      };
  const resultingState = clone(state);
  if (state.transactionWindow === 'season-end' && seasonAwards.historyRecord) {
    resultingState.awardHistoryBySeason ??= {};
    resultingState.awardHistoryBySeason[String(state.seasonStartYear)] = clone(seasonAwards.historyRecord);
  }
  const postseason = extra.postseason ? clone(extra.postseason) : null;
  if (postseason) {
    if (state.transactionWindow !== 'season-end') throw new Error('Postseason results can only be attached at the season-end window.');
    if (postseason.seasonStartYear !== state.seasonStartYear) throw new Error('Postseason results must match the LeagueState season.');
    if (!postseason.champion?.teamCode) throw new Error('Postseason results must identify a champion before they are attached to a season result.');
    resultingState.postseasonHistoryBySeason ??= {};
    resultingState.postseasonHistoryBySeason[String(state.seasonStartYear)] = {
      format: postseason.format,
      status: postseason.status,
      champion: clone(postseason.champion),
      finalsMvp: clone(postseason.finalsMvp ?? { status: 'not-generated', winner: null }),
      playoffGameCount: postseason.summary?.playoffGames ?? postseason.games?.filter(game => game.stage === 'playoffs').length ?? 0,
      playInGameCount: postseason.summary?.playInGames ?? postseason.games?.filter(game => game.stage === 'play-in').length ?? 0,
      gameModelId: postseason.summary?.simulatedGameModelId ?? null,
      playerStatisticsStatus: postseason.playerStatistics?.status ?? 'not-generated',
      playerCountWithPostseasonStats: postseason.playerStatistics?.playerCount ?? 0,
    };
    if (postseason.playerStatistics) {
      resultingState.playerPostseasonStatsByYear ??= {};
      resultingState.playerPostseasonStatsByYear[String(state.seasonStartYear)] = clone(postseason.playerStatistics);
    }
    resultingState.revision += 1;
  }
  const summary = {
    ...extraSummary,
    gamesSimulated: games.length,
    modelStatus: 'development-candidate-not-certified',
    provisionalState: resultingState.stateQuality?.status !== 'reconciled',
    seasonAwardsStatus: seasonAwards.status,
    seasonComplete: seasonAwards.seasonCoverage?.seasonComplete ?? null,
    scheduleProvenanceComplete: seasonAwards.seasonCoverage?.scheduleProvenanceComplete ?? null,
    postseasonStatus: postseason?.status ?? 'not-simulated',
    postseasonChampionTeamCode: postseason?.champion?.teamCode ?? null,
    postseasonGamesSimulated: postseason?.summary?.totalPostseasonGames ?? 0,
    postseasonPlayerStatisticsStatus: postseason?.playerStatistics?.status ?? 'not-generated',
    finalsMvpStatus: postseason?.finalsMvp?.status ?? 'not-generated',
    finalsMvpCanonicalName: postseason?.finalsMvp?.winner?.canonicalName ?? null,
  };
  return {
    // Preserve caller annotations and operation metadata, then reapply every
    // result-owned field so extras cannot replace the state or its receipts.
    ...clone(extra),
    format: 'djhc-season-simulation-result-v1',
    schemaVersion: '1.0.0',
    seasonStartYear: resultingState.seasonStartYear,
    stateQuality: clone(resultingState.stateQuality),
    transactionCount: resultingState.transactionLedger.length,
    provisionalTransactionCount: resultingState.transactionLedger.filter(row => row.status === 'provisional').length,
    resultingStateRevision: resultingState.revision,
    games: clone(games),
    resultingState,
    seasonComplete: seasonAwards.seasonCoverage?.seasonComplete ?? null,
    summary,
    seasonAwards,
  };
}

function defaultExpectedGamesPerTeam(seasonStartYear) {
  if (seasonStartYear === 2019) return null;
  if (seasonStartYear === 2020) return 72;
  return 82;
}

/** Simulate postseason from a season-end LeagueState and return a season result with championship history. */
export function simulateLeaguePostseason(state, gameModel, options = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'season-end') throw new Error('NBA postseason may only be simulated after the regular season reaches its season-end window.');
  const regularSeasonGames = options.regularSeasonGames ?? state.completedGames ?? [];
  const expectedGamesPerTeam = Object.prototype.hasOwnProperty.call(options, 'expectedGamesPerTeam')
    ? options.expectedGamesPerTeam
    : defaultExpectedGamesPerTeam(state.seasonStartYear);
  const postseason = simulateNbaPostseason({
    seasonStartYear: state.seasonStartYear,
    gameModel,
    teams: state.teams,
    regularSeasonGames,
    gameInputForMatchup: options.gameInputForMatchup,
    seed: options.seed ?? 1,
    expectedGamesPerTeam,
    expectedGamesByTeam: options.expectedGamesByTeam
      ?? state.expectedGamesByTeamBySeason?.[String(state.seasonStartYear)]
      ?? state.scheduleState?.expectedGamesByTeam
      ?? null,
    playInPolicy: options.playInPolicy ?? 'auto',
    finalsHomeCourtTeamCode: options.finalsHomeCourtTeamCode ?? null,
    restDaysForMatchup: options.restDaysForMatchup ?? null,
    simulateGameFn: options.simulateGameFn ?? null,
    gameOptions: options.gameOptions ?? {},
    maxTieRedraws: options.maxTieRedraws ?? 20,
  });
  return createSeasonSimulationResult(state, options.seasonGameResults ?? [], {
    seed: options.seed ?? 1,
    awardSeed: options.awardSeed ?? options.seed ?? 1,
    awardPolicy: options.awardPolicy ?? null,
    seasonComplete: options.seasonComplete,
    initialStateRevision: state.revision,
    resultingStateRevision: state.revision + 1,
    postseason,
  });
}

/** Complete a schedule-backed league season from recorded regular-season games.
 * This verifies each scheduled game identity, advances games -> season-end,
 * simulates standings/playoffs, assigns awards, and stores separate postseason
 * statistics and championship history. All game inputs remain caller-supplied. */
export function completeLeagueSeason(state, gameModel, options = {}) {
  validateLeagueState(state);
  if (!['games', 'season-end'].includes(state.transactionWindow)) {
    throw new Error('A league season can be completed only from the games or season-end window.');
  }
  const plan = buildLeagueGameRequestsFromSeasonSchedule(state);
  if (!plan.gameCountComplete || plan.partialScenario || plan.pendingCupGameCount !== 0 || plan.pendingCupTeamSlotCount !== 0) {
    throw new Error('League season completion requires a resolved 82-game schedule; pending Cup flex slots cannot enter postseason seeding.');
  }
  const scheduledById = new Map(plan.requests.map(request => [request.gameId, request]));
  const recordedById = new Map();
  for (const game of state.completedGames ?? []) {
    if (game.seasonStartYear !== state.seasonStartYear || !scheduledById.has(game.gameId)) continue;
    if (recordedById.has(game.gameId)) throw new Error(`Scheduled game ${game.gameId} has more than one completed result.`);
    recordedById.set(game.gameId, game);
  }
  const missingIds = [];
  for (const [gameId, request] of scheduledById) {
    const game = recordedById.get(gameId);
    if (!game) {
      missingIds.push(gameId);
      continue;
    }
    const gameLocalDate = game.gameLocalDate ?? game.date ?? null;
    if (gameLocalDate !== request.gameLocalDate || game.homeTeamCode !== request.homeTeamCode || game.awayTeamCode !== request.awayTeamCode) {
      throw new Error(`Completed game ${gameId} does not match the schedule date and home/away identities.`);
    }
  }
  if (missingIds.length) {
    throw new Error(`Cannot complete the season: ${missingIds.length} of ${plan.scheduledGameCount} dated schedule games are missing (first missing: ${missingIds.slice(0, 5).join(', ')}).`);
  }
  const incompleteTeamStats = state.teams.filter(team =>
    Number(team.seasonStatsByYear?.[String(state.seasonStartYear)]?.gamesPlayed) !== 82,
  ).map(team => team.teamCode);
  if (incompleteTeamStats.length) {
    throw new Error(`Cannot complete the season until all team regular-season ledgers show exactly 82 games: ${incompleteTeamStats.slice(0, 8).join(', ')}.`);
  }
  const seasonEndState = state.transactionWindow === 'games' ? advanceLeagueWindow(state, 'season-end') : state;
  const completion = {
    format: 'djhc-league-season-completion-v1',
    status: 'completed-from-dated-schedule-and-recorded-results',
    seasonStartYear: state.seasonStartYear,
    scheduledGameCount: plan.scheduledGameCount,
    recordedScheduledGameCount: recordedById.size,
    expectedGamesPerTeam: plan.expectedGamesPerTeam,
    complete: true,
    officialSchedule: plan.officialSchedule,
    scheduleProvenanceComplete: plan.scheduleProvenanceComplete,
    scheduleStateStatus: plan.scheduleStateStatus,
    postseasonSeed: options.seed ?? 1,
    disclosure: 'Regular-season completion is checked against dated schedule IDs, dates, teams, and team game totals. Generated schedules remain scenario evidence; postseason and awards are simulated from the supplied game results and candidate model.',
  };
  const result = simulateLeaguePostseason(seasonEndState, gameModel, options);
  return {
    ...result,
    scheduleCompletion: completion,
    summary: { ...result.summary, scheduleCompletion: clone(completion) },
  };
}

export function advanceLeagueSeason(state, nextSeasonStartYear, {
  progressionModel = null,
  allowExperimentalProgression = false,
  capScenario = null,
  ageResolver = null,
  nextSeasonRulesReference = null,
  nextSeasonSchedule = null,
  nextSeasonScheduleOptions = null,
} = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'season-end') throw new Error('A season can advance only after the season-end window.');
  if ((state.offerSheetLedger ?? []).some(sheet => ['pending', 'resolving'].includes(sheet.status))) throw new Error('Resolve outstanding restricted offer sheets before advancing the season.');
  if (nextSeasonStartYear !== state.seasonStartYear + 1) throw new Error('Advance one season at a time so age, contracts, and roster state update exactly once.');
  if (state.lastSeasonAged === state.seasonStartYear) throw new Error(`Season ${state.seasonStartYear} has already advanced player ages.`);
  const next = clone(state);
  const nextSchedule = buildNextSeasonSchedule(state, nextSeasonStartYear, {
    nextSeasonSchedule,
    nextSeasonScheduleOptions,
  });
  if (nextSchedule) {
    next.seasonSchedule = nextSchedule.schedule ? clone(nextSchedule.schedule) : null;
    next.seasonScheduleState = clone(nextSchedule.scheduleState);
  }
  next.rulesReference = nextSeasonRulesReference
    ? clone(nextSeasonRulesReference)
    : {
      ...(state.rulesReference ?? {}),
      status: 'incomplete',
      seasonStartYear: nextSeasonStartYear,
      ruleVersionId: null,
      sourceRefs: [],
      missingReason: 'No season-specific CBA rule reference was supplied for the target season.',
    };
  const rulesResolvedForTargetSeason = next.rulesReference?.status === 'complete' &&
    Number(next.rulesReference.seasonStartYear) === nextSeasonStartYear &&
    Boolean(next.rulesReference.ruleVersionId) &&
    Array.isArray(next.rulesReference.sourceRefs) && next.rulesReference.sourceRefs.length > 0;
  const progression = [];
  const ageResolutionRows = [];
  for (const player of next.players) {
    const priorAge = player.age;
    const hasKnownAge = priorAge !== null && priorAge !== undefined && !(typeof priorAge === 'string' && !priorAge.trim()) && Number.isFinite(Number(priorAge));
    player.nextSeasonContractState = assessNextSeasonContract(player, nextSeasonStartYear);
    let ageResolution;
    if (typeof ageResolver === 'function') {
      ageResolution = ageResolver(player, nextSeasonStartYear);
      if (!ageResolution || !['available', 'unavailable'].includes(ageResolution.status)) {
        throw new Error(`Age resolver returned an invalid result for ${player.canonicalName}.`);
      }
      if (ageResolution.status === 'available' && (!Number.isInteger(ageResolution.age) || ageResolution.age < 0 || ageResolution.age > 120)) {
        throw new Error(`Age resolver returned an invalid age for ${player.canonicalName}.`);
      }
      player.age = ageResolution.status === 'available' ? ageResolution.age : null;
    } else {
      player.age = hasKnownAge ? Number(priorAge) + 1 : null;
      ageResolution = {
        status: hasKnownAge ? 'available' : 'unavailable',
        age: player.age,
        source: hasKnownAge ? 'prior-season-age-plus-one' : null,
        reason: hasKnownAge ? null : 'no-prior-age-anchor',
      };
    }
    player.ageEvidence = clone(ageResolution);
    ageResolutionRows.push({ canonicalName: player.canonicalName, ...clone(ageResolution) });
    player.lastAgedSeasonStartYear = state.seasonStartYear;
    const hasKnownRating = player.overallRating !== null && player.overallRating !== undefined && !(typeof player.overallRating === 'string' && !player.overallRating.trim()) && Number.isFinite(Number(player.overallRating));
    const rating = hasKnownRating ? Number(player.overallRating) : null;
    if (rating !== null) {
      const projected = projectNextSeasonRating({
        canonicalName: player.canonicalName,
        completedSeasonStartYear: state.seasonStartYear,
        overallRating: rating,
        age: hasKnownAge ? Number(priorAge) : null,
        priorRatingChange: player.priorRatingChange,
        games: player.games,
        minutesPerGame: player.minutesPerGame,
        minutesChange: player.minutesChange,
        pointsPer36: player.pointsPer36,
        pointsPer36Change: player.pointsPer36Change,
        reboundsPer36: player.reboundsPer36,
        assistsPer36: player.assistsPer36,
        scoringDomain: player.scoringDomain,
        creationDomain: player.creationDomain,
        shootingDomain: player.shootingDomain,
        defenseDomain: player.defenseDomain,
        reboundingDomain: player.reboundingDomain,
        priorWorkload: player.priorWorkload,
        experienceSeasons: player.experienceSeasons,
        ratingSourceReliability: player.ratingSourceReliability,
        priorSeasonsObserved: player.priorSeasonsObserved,
      }, nextSeasonStartYear, progressionModel, { allowExperimental: allowExperimentalProgression });
      progression.push(projected);
      player.ratingProjection = projected;
      player.overallRating = projected.rating;
      player.priorRatingChange = projected.change;
      player.ratingProjectionStatus = projected.status;
    }
    player.currentSeasonStartYear = nextSeasonStartYear;
  }
  next.lastSeasonAged = state.seasonStartYear;
  next.seasonStartYear = nextSeasonStartYear;
  if (next.simulationClock) next.simulationClock = { seasonStartYear: nextSeasonStartYear, dayIndex: 0,
    minuteOfDayEastern: 0, phase: 'moratorium', calendarDate: `${nextSeasonStartYear}-07-01`,
    valueStatus: 'generated-scenario', source: { sourceSystem: 'djhc-season-transition', sourceVersion: 'v1', sourceClass: 'generated-scenario' } };
  next.transactionWindow = 'preseason';
  next.revision += 1;
  const contractUnresolved = next.players.filter(player => ['expiring-contract-review-required', 'contract-state-unknown', 'term-candidate-unreconciled', 'option-decision-required', 'inactive-contract-review-required'].includes(player.nextSeasonContractState?.status));
  const qualityReasons = [...(next.stateQuality?.reasons ?? [])];
  if (contractUnresolved.length) qualityReasons.push(`${contractUnresolved.length} player contract transition(s) require offseason resolution for ${nextSeasonStartYear}-${nextSeasonStartYear + 1}.`);
  if (capScenario?.provisional) {
    qualityReasons.push(`Future cap scenario for ${nextSeasonStartYear} is estimated.`);
  }
  if (!rulesResolvedForTargetSeason) qualityReasons.push(`Season-specific CBA rules for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} were not supplied with version and source references.`);
  if (nextSchedule) {
    if (nextSchedule.schedule) {
      qualityReasons.push(`Future NBA schedule for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} is a validated scenario, not an authenticated official schedule.`);
      if (nextSchedule.scheduleState.pendingCupGameCount) qualityReasons.push(`Future NBA schedule for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} still has Cup flex games pending.`);
      if (!nextSchedule.scheduleState.cupGroupPlayResolved) qualityReasons.push(`Future NBA schedule for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} does not resolve its Cup group-play draw.`);
      if (nextSchedule.scheduleState.placeholderVenueTeamCodes?.length) qualityReasons.push(`Future NBA schedule for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} uses placeholder venue IDs.`);
    } else {
      qualityReasons.push(`Future NBA schedule for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} was blocked; no schedule was attached for this custom league.`);
    }
    for (const assumption of nextSchedule.scheduleState.assumptions ?? []) qualityReasons.push(`Schedule assumption: ${assumption}`);
  }
  for (const team of next.teams) {
    const payroll = team.payrollState ?? {};
    const payrollReconciledForTargetSeason = payroll.status === 'reconciled' &&
      Number(payroll.seasonStartYear) === nextSeasonStartYear &&
      payroll.rulesVersionId === next.rulesReference?.ruleVersionId &&
      Array.isArray(payroll.sourceRefs) && payroll.sourceRefs.length > 0 &&
      rulesResolvedForTargetSeason && !capScenario?.provisional;
    if (!payrollReconciledForTargetSeason) {
      // Compute against the target terms before relabeling payroll; otherwise
      // an old total would become an apparently current-season cap input.
      const recalculated = derivePayrollStateForLeague(next, { seasonStartYear: nextSeasonStartYear, teamCodes: [team.teamCode] });
      team.priorSeasonPayrollState = clone(team.payrollState);
      team.payrollState = clone(findTeam(recalculated.state, team.teamCode).payrollState);
      team.payrollState.status = 'provisional';
      if (team.capLedger) team.capAccounting = clone(findTeam(recalculated.state, team.teamCode).capAccounting);
      else {
        team.payrollState.apronTeamSalaryUsd = null;
        team.payrollState.taxTeamSalaryUsd = null;
      }
      team.payrollState.hardCapTriggers = [];
      team.payrollState.seasonStartYear = nextSeasonStartYear;
      team.payrollState.rulesVersionId = next.rulesReference?.ruleVersionId ?? null;
      team.payrollState.provisionalReasons = [...new Set([...(team.payrollState.provisionalReasons ?? []), `Reconciled team payroll for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} was not supplied.`])];
    }
    const affectedContractRows = contractUnresolved.filter(player => player.teamCode === team.teamCode);
    if (affectedContractRows.length) {
      team.payrollState.status = 'provisional';
      team.payrollState.provisionalReasons = [...new Set([...(team.payrollState.provisionalReasons ?? []), `${affectedContractRows.length} roster contract transition(s) require resolution for ${nextSeasonStartYear}-${nextSeasonStartYear + 1}.`])];
    }
  }
  const payrollUnreconciled = next.teams.some(team => team.payrollState.status !== 'reconciled');
  const scheduleRequiresProvisional = Boolean(nextSchedule && (
    nextSchedule.scheduleState.complete !== true || nextSchedule.scheduleState.officialSchedule !== true
  ));
  if (contractUnresolved.length || capScenario?.provisional || payrollUnreconciled || scheduleRequiresProvisional) {
    if ((contractUnresolved.length || capScenario?.provisional || payrollUnreconciled) && !qualityReasons.some(reason => /next-season payroll/i.test(reason))) {
      qualityReasons.push(`Next-season payroll and roster state for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} has not been fully reconciled.`);
    }
    next.stateQuality = { status: 'provisional', reasons: [...new Set(qualityReasons)] };
  }
  validateLeagueState(next);
  return {
    state: next,
    progression,
    result: {
      format: 'djhc-season-transition-result-v1',
      fromSeasonStartYear: state.seasonStartYear,
      toSeasonStartYear: nextSeasonStartYear,
      playerAgeTransitions: next.players.length,
      agesUpdatedOnce: next.players.every(player => player.lastAgedSeasonStartYear === state.seasonStartYear),
      contractTransitionCounts: Object.fromEntries([...new Set(next.players.map(player => player.nextSeasonContractState?.status ?? 'unknown'))].map(status => [status, next.players.filter(player => (player.nextSeasonContractState?.status ?? 'unknown') === status).length])),
      unresolvedContractTransitions: contractUnresolved.length,
      progressionModelStatus: progressionModel?.status ?? 'no-selected-progression-model',
      futureCapStatus: capScenario?.status ?? 'not-supplied',
      ageResolutionCounts: Object.fromEntries([...new Set(ageResolutionRows.map(row => row.status))].map(status => [status, ageResolutionRows.filter(row => row.status === status).length])),
      ageResolutionSourceCounts: Object.fromEntries([...new Set(ageResolutionRows.map(row => row.source ?? 'unknown'))].map(source => [source, ageResolutionRows.filter(row => (row.source ?? 'unknown') === source).length])),
      stateQuality: clone(next.stateQuality),
      nextSeasonScheduleState: clone(next.seasonScheduleState ?? null),
      note: typeof ageResolver === 'function'
        ? 'Age uses the supplied exact-name season resolver; unresolved names remain age-unknown. Rating change uses only a selected development candidate; otherwise the current rating carries forward with an explicit uncertainty interval.'
        : 'Known age advances once for this season. A supplied package-age resolver can replace the increment with exact-name season-age evidence. Rating change uses only a selected development candidate; otherwise the current rating carries forward with an explicit uncertainty interval.',
    },
  };
}

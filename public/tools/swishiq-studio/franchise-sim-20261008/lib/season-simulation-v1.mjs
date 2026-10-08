import { simulateGame } from './game-simulator-v2.mjs';
import { applyTransaction } from './transaction-engine-v1.mjs';
import { projectNextSeasonRating } from './career-progression-v1.mjs';
import { normalizeCanonicalPlayerName, validateLeagueState } from './simulation-contracts-v1.mjs';
import { simulateSeasonAwards } from './season-awards-v1.mjs';
import { simulateNbaPostseason } from './nba-postseason-v1.mjs';
import { derivePayrollStateForLeague } from './payroll-state-v1.mjs';
import { applyCapAccountingToLeague, captureTeamCapSnapshot, calculateTeamCapAccounting } from './cap-accounting-v1.mjs';
import { prepareLeagueGameInput } from './league-game-roster-v1.mjs';

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
        gameId, seasonStartYear, teamCode: team.teamCode, canonicalName: player.canonicalName,
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
      gameId, seasonStartYear, teamCode: team.teamCode, opponentTeamCode: opponent.teamCode,
      side, stats: boxStats, declaredTeamStats: clone(declaredTeamStats ?? null),
      boxScoreStatus: boxStats?.points !== undefined ? 'exact-player-sum' : boxStats ? 'partial-player-sum' : 'player-box-not-generated',
      unresolvedPlayerRows: unresolvedPlayerRows.filter(row => row.teamCode === team.teamCode),
      sourceModelId: modelId, seed,
    });
  }
  state.completedGames ??= [];
  state.completedGames.push({
    gameId,
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

export function createSeasonSimulationResult(state, games = [], extra = {}) {
  const seasonAwards = extra.seasonAwards
    ? clone(extra.seasonAwards)
    : state.transactionWindow === 'season-end'
      ? simulateSeasonAwards(state, { seed: extra.awardSeed ?? extra.seed ?? 1, policy: extra.awardPolicy ?? null, seasonComplete: extra.seasonComplete })
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
  return {
    format: 'djhc-season-simulation-result-v1',
    schemaVersion: '1.0.0',
    seasonStartYear: state.seasonStartYear,
    stateQuality: clone(state.stateQuality),
    transactionCount: state.transactionLedger.length,
    provisionalTransactionCount: state.transactionLedger.filter(row => row.status === 'provisional').length,
    games: clone(games),
    resultingState,
    summary: {
      gamesSimulated: games.length,
      modelStatus: 'development-candidate-not-certified',
      provisionalState: state.stateQuality?.status !== 'reconciled',
      seasonAwardsStatus: seasonAwards.status,
      postseasonStatus: postseason?.status ?? 'not-simulated',
      postseasonChampionTeamCode: postseason?.champion?.teamCode ?? null,
      postseasonGamesSimulated: postseason?.summary?.totalPostseasonGames ?? 0,
      postseasonPlayerStatisticsStatus: postseason?.playerStatistics?.status ?? 'not-generated',
    },
    ...clone(extra),
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

export function advanceLeagueSeason(state, nextSeasonStartYear, {
  progressionModel = null,
  allowExperimentalProgression = false,
  capScenario = null,
  ageResolver = null,
  nextSeasonRulesReference = null,
} = {}) {
  validateLeagueState(state);
  if (state.transactionWindow !== 'season-end') throw new Error('A season can advance only after the season-end window.');
  if ((state.offerSheetLedger ?? []).some(sheet => ['pending', 'resolving'].includes(sheet.status))) throw new Error('Resolve outstanding restricted offer sheets before advancing the season.');
  if (nextSeasonStartYear !== state.seasonStartYear + 1) throw new Error('Advance one season at a time so age, contracts, and roster state update exactly once.');
  if (state.lastSeasonAged === state.seasonStartYear) throw new Error(`Season ${state.seasonStartYear} has already advanced player ages.`);
  const next = clone(state);
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
  if (contractUnresolved.length || capScenario?.provisional || next.teams.some(team => team.payrollState.status !== 'reconciled')) {
    if (!qualityReasons.some(reason => /next-season payroll/i.test(reason))) qualityReasons.push(`Next-season payroll and roster state for ${nextSeasonStartYear}-${nextSeasonStartYear + 1} has not been fully reconciled.`);
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
      note: typeof ageResolver === 'function'
        ? 'Age uses the supplied exact-name season resolver; unresolved names remain age-unknown. Rating change uses only a selected development candidate; otherwise the current rating carries forward with an explicit uncertainty interval.'
        : 'Known age advances once for this season. A supplied package-age resolver can replace the increment with exact-name season-age evidence. Rating change uses only a selected development candidate; otherwise the current rating carries forward with an explicit uncertainty interval.',
    },
  };
}

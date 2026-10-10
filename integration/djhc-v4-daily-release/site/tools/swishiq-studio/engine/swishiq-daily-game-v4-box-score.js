/*
 * Observed V4 player-game production for Daily boards. This is a descriptive
 * ranking of source box scores, not a forecast of a future game.
 */

import { normalizeCanonicalV4PlayerNameKey } from './canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1';
import { SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT } from './swishiq-daily-game-v4-contract.js';

export const SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_FORMAT = 'djhc-swishiq-v4-daily-game-evaluator-v2';
export const SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_VERSION = 'swishiq-v4-daily-observed-box-score-rank-v1';
export const SWISHIQ_DAILY_GAME_V4_BOX_SCORE_METRIC_ID = 'hollinger-game-score-per-40-v1';
export const SWISHIQ_DAILY_GAME_V4_BOX_SCORE_UNIT = 'game-score-per-40-minutes';
export const SWISHIQ_DAILY_GAME_V4_BOX_SCORE_ATTRIBUTION = 'same-team-season-phase-box-score';

const YEAR_MIN = 2017;
const YEAR_MAX = 2025;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const BOX_FIELDS = Object.freeze([
  'points', 'rebounds', 'assists', 'steals', 'blocks',
  'fieldGoalAttempts', 'fieldGoalsMade', 'freeThrowAttempts', 'freeThrowsMade', 'turnovers',
  'offensiveRebounds', 'defensiveRebounds', 'personalFouls',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizedName(value) {
  return normalizeCanonicalV4PlayerNameKey(value);
}

function validExactSeasonScope(scope, seasonStartYear, phase) {
  return isRecord(scope)
    && scope.kind === 'exact-season'
    && Array.isArray(scope.seasonStartYears)
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYears[0] === seasonStartYear
    && scope.seasonStartYear === seasonStartYear
    && scope.seasonEndYear === seasonStartYear + 1
    && Array.isArray(scope.phases)
    && scope.phases.includes(phase)
    && scope.pooledFitIsSeasonSpecific === true;
}

function statsFor(record) {
  const box = record?.values?.box;
  const stats = {};
  let complete = isRecord(box);
  for (const field of BOX_FIELDS) {
    const value = box?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      stats[field] = null;
      complete = false;
    } else {
      stats[field] = value;
    }
  }
  return { stats, complete };
}

function gameScore(stats) {
  return stats.points
    + 0.4 * stats.fieldGoalsMade
    - 0.7 * stats.fieldGoalAttempts
    - 0.4 * (stats.freeThrowAttempts - stats.freeThrowsMade)
    + 0.7 * stats.offensiveRebounds
    + 0.3 * stats.defensiveRebounds
    + stats.steals
    + 0.7 * stats.assists
    + 0.7 * stats.blocks
    - 0.4 * stats.personalFouls
    - stats.turnovers;
}

function positionList(value) {
  const candidates = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return [...new Set(candidates
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim().toUpperCase()))].sort();
}

function rowSignature(row) {
  return JSON.stringify({
    minutes: row.minutes,
    positions: row.positions,
    stats: row.stats,
  });
}

/**
 * Aggregate verified, observed player-game rows by canonical name and team.
 * `score` is the sum of per-game Hollinger Game Scores divided by the same
 * observed minutes and multiplied by 40. No value is rounded here. A profile
 * with any incomplete positive-minute game row has a null score so a partial
 * season rate cannot enter a board.
 */
export function aggregateV4BoxScorePlayers(part, {
  seasonStartYear,
  phase = 'regular',
} = {}) {
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < YEAR_MIN || seasonStartYear > YEAR_MAX
    || !PHASES.has(phase)) {
    fail('v4-box-score-scope-invalid', 'An exact V4 season and supported phase are required.');
  }
  if (!isRecord(part) || part.status !== 'verified' || part.artifactId !== 'player-games'
    || !Array.isArray(part.records)) {
    fail('v4-box-score-input-unverified', 'A verified player-games part is required.');
  }
  if (!isRecord(part.package) || typeof part.package.packageId !== 'string' || !part.package.packageId.trim()
    || typeof part.package.packageVersion !== 'string' || !part.package.packageVersion.trim()
    || !validExactSeasonScope(part.package.scope, seasonStartYear, phase)) {
    fail('v4-box-score-package-scope-mismatch', 'The verified player-games package does not match the requested exact season and phase.');
  }

  const uniqueRows = new Map();
  const gameTeamsByPlayer = new Map();
  for (const record of part.records) {
    if (record?.time?.seasonStartYear !== seasonStartYear || record?.time?.phase !== phase
      || record?.evidence?.status !== 'available') continue;
    const minutes = record?.values?.minutes;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) continue;

    const displayName = typeof record?.values?.displayName === 'string' ? record.values.displayName.trim()
      : typeof record?.entities?.displayName === 'string' ? record.entities.displayName.trim() : '';
    const normalizedPlayerNameKey = normalizedName(displayName);
    const teamCode = typeof record?.entities?.teamCode === 'string' ? record.entities.teamCode.trim().toUpperCase() : '';
    const gameRef = typeof record?.entities?.gameRef === 'string' ? record.entities.gameRef.trim() : '';
    if (!displayName || !normalizedPlayerNameKey || !/^[A-Z]{3}$/.test(teamCode) || !gameRef) {
      fail('v4-box-score-row-invalid', 'An available positive-minute player-game row is missing its canonical name, team, or game reference.');
    }

    const playerGameKey = JSON.stringify([normalizedPlayerNameKey, teamCode, gameRef]);
    const playerGameContextKey = JSON.stringify([normalizedPlayerNameKey, gameRef]);
    const priorTeam = gameTeamsByPlayer.get(playerGameContextKey);
    if (priorTeam && priorTeam !== teamCode) {
      fail('v4-box-score-team-conflict', 'One normalized player appears for multiple teams in the same game.');
    }
    gameTeamsByPlayer.set(playerGameContextKey, teamCode);

    const { stats, complete } = statsFor(record);
    const row = {
      displayName,
      normalizedPlayerNameKey,
      teamCode,
      gameRef,
      minutes,
      positions: positionList(record?.values?.positions),
      stats,
      complete,
    };
    const signature = rowSignature(row);
    const prior = uniqueRows.get(playerGameKey);
    if (prior) {
      if (prior.signature !== signature) {
        fail('v4-box-score-duplicate-conflict', 'Duplicate player-team-game rows contain conflicting box-score evidence.');
      }
      continue;
    }
    uniqueRows.set(playerGameKey, { ...row, signature });
  }

  const profiles = new Map();
  for (const row of uniqueRows.values()) {
    const key = `${row.normalizedPlayerNameKey}|${row.teamCode}`;
    let profile = profiles.get(key);
    if (!profile) {
      profile = {
        displayName: row.displayName,
        normalizedPlayerNameKey: row.normalizedPlayerNameKey,
        teamCode: row.teamCode,
        seasonStartYear,
        phase,
        games: 0,
        minutes: 0,
        positions: new Set(),
        completeGames: 0,
        completeMinutes: 0,
        gameScoreTotal: 0,
        boxScoreTotals: Object.fromEntries(BOX_FIELDS.map(field => [field, 0])),
      };
      profiles.set(key, profile);
    }
    profile.games += 1;
    profile.minutes += row.minutes;
    row.positions.forEach(position => profile.positions.add(position));
    if (!row.complete) continue;

    const score = gameScore(row.stats);
    if (!Number.isFinite(score)) fail('v4-box-score-value-invalid', 'An observed game score is not finite.');
    profile.completeGames += 1;
    profile.completeMinutes += row.minutes;
    profile.gameScoreTotal += score;
    for (const field of BOX_FIELDS) profile.boxScoreTotals[field] += row.stats[field];
  }

  for (const [key, profile] of profiles) {
    const complete = profile.completeGames === profile.games;
    const score = complete && profile.minutes > 0
      ? profile.gameScoreTotal / profile.minutes * 40
      : null;
    profiles.set(key, Object.freeze({
      displayName: profile.displayName,
      normalizedPlayerNameKey: profile.normalizedPlayerNameKey,
      teamCode: profile.teamCode,
      seasonStartYear: profile.seasonStartYear,
      phase: profile.phase,
      games: profile.games,
      minutes: profile.minutes,
      positions: Object.freeze([...profile.positions].sort()),
      completeGames: profile.completeGames,
      complete,
      completeMinutes: profile.completeMinutes,
      gameScoreTotal: complete ? profile.gameScoreTotal : null,
      boxScoreTotals: complete ? Object.freeze({ ...profile.boxScoreTotals }) : null,
      score,
    }));
  }
  return profiles;
}

function sameScope(left, right) {
  return isRecord(left) && isRecord(right)
    && left.kind === right.kind
    && left.seasonStartYear === right.seasonStartYear
    && left.seasonEndYear === right.seasonEndYear
    && left.pooledFitIsSeasonSpecific === right.pooledFitIsSeasonSpecific
    && Array.isArray(left.seasonStartYears) && Array.isArray(right.seasonStartYears)
    && left.seasonStartYears.length === right.seasonStartYears.length
    && left.seasonStartYears.every((year, index) => year === right.seasonStartYears[index])
    && Array.isArray(left.phases) && Array.isArray(right.phases)
    && left.phases.length === right.phases.length
    && left.phases.every((item, index) => item === right.phases[index]);
}

function validateEvaluationContext({ request, board, playerGamesPart } = {}) {
  if (!isRecord(request) || !isRecord(board)) {
    fail('v4-box-score-request-invalid', 'A V4 board and evaluation request are required.');
  }
  if (board.contractVersion !== 2 || board.scoringContract !== SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT
    || request.resultContract?.scoringContract !== SWISHIQ_DAILY_GAME_V4_BOX_SCORE_CONTRACT) {
    fail('v4-box-score-scoring-contract-mismatch', 'The board and request must select the observed box-score production contract.');
  }
  const seasonStartYear = board.scope?.seasonStartYears?.[0];
  const phase = board.phase;
  const packageRef = board.packageRef;
  const boardRef = request.boardRef;
  if (!Number.isSafeInteger(seasonStartYear) || !PHASES.has(phase)
    || !validExactSeasonScope(board.scope, seasonStartYear, phase)
    || !isRecord(packageRef) || !isRecord(boardRef)
    || packageRef.packageId !== playerGamesPart?.package?.packageId
    || packageRef.packageVersion !== playerGamesPart?.package?.packageVersion
    || packageRef.phase !== phase || !sameScope(packageRef.scope, board.scope)
    || boardRef.packageId !== packageRef.packageId
    || boardRef.packageVersion !== packageRef.packageVersion
    || boardRef.phase !== phase || !sameScope(boardRef.scope, board.scope)
    || boardRef.gameKind !== board.gameKind
    || (board.boardId && boardRef.boardId !== board.boardId)) {
    fail('v4-box-score-package-scope-mismatch', 'The request, board, and player-games package are not bound to one exact scope.');
  }
  if (board.gameKind !== 'fix-the-five' && board.gameKind !== 'draft-night') {
    fail('v4-box-score-board-invalid', 'The V4 box-score evaluator supports Fix the Five and Draft Night only.');
  }
  return { seasonStartYear, phase };
}

function validatedBoardRow(row, { seasonStartYear, phase, teamCode }, label) {
  const displayName = typeof row?.displayName === 'string' ? row.displayName.trim() : '';
  const key = typeof row?.normalizedPlayerNameKey === 'string' ? row.normalizedPlayerNameKey : '';
  if (!displayName || !key || normalizedName(displayName) !== key
    || row.seasonStartYear !== seasonStartYear || row.phase !== phase || row.teamCode !== teamCode
    || !/^[A-Z]{3}$/.test(teamCode)) {
    fail('v4-box-score-board-row-invalid', `${label} is not a canonical player row in the exact team, season, and phase.`);
  }
  return { displayName, normalizedPlayerNameKey: key, teamCode };
}

function getEligibleProfile(profiles, row) {
  const profile = profiles.get(`${row.normalizedPlayerNameKey}|${row.teamCode}`);
  if (!profile || profile.complete !== true || profile.completeGames !== profile.games
    || profile.games < 20 || profile.minutes < 200 || !Number.isFinite(profile.score)) {
    fail('v4-box-score-player-ineligible', `A board player lacks 20 complete games, 200 minutes, or a complete observed score: ${row.normalizedPlayerNameKey}.`);
  }
  return profile;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function completeEvaluation(ranked, selectedIndex, profiles, { seasonStartYear, phase }) {
  const selected = ranked[selectedIndex];
  const bestValue = ranked[0].value;
  const value = selected.value;
  const gameCount = profiles.reduce((total, profile) => total + profile.games, 0);
  return Object.freeze({
    format: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_FORMAT,
    version: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_EVALUATOR_VERSION,
    status: 'complete',
    evaluationKind: 'descriptive-box-score-production-ranking',
    scope: Object.freeze({ kind: 'exact-season', seasonStartYear, phase }),
    decision: Object.freeze({ rank: selectedIndex + 1, optionCount: ranked.length, countComplete: true }),
    observedProduction: Object.freeze({
      value,
      bestValue,
      gapToBest: Math.max(0, bestValue - value),
      unit: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_UNIT,
      metricId: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_METRIC_ID,
    }),
    evidence: Object.freeze({
      playerCount: profiles.length,
      gameCount,
      attributionScope: SWISHIQ_DAILY_GAME_V4_BOX_SCORE_ATTRIBUTION,
      predictiveEligibility: false,
    }),
  });
}

/** Rank one board selection using verified observed player-game production. */
export function evaluateV4BoxScoreSelection({ request, board, playerGamesPart } = {}) {
  const { seasonStartYear, phase } = validateEvaluationContext({ request, board, playerGamesPart });
  if (playerGamesPart?.status !== 'verified' || playerGamesPart?.artifactId !== 'player-games'
    || !Array.isArray(playerGamesPart.records)) {
    fail('v4-box-score-input-unverified', 'A verified player-games part is required.');
  }
  const profiles = aggregateV4BoxScorePlayers(playerGamesPart, { seasonStartYear, phase });

  if (board.gameKind === 'fix-the-five') {
    const matches = Array.isArray(board.challenges)
      ? board.challenges.filter(row => row?.challengeId === request.selection?.challengeId)
      : [];
    if (matches.length !== 1) fail('v4-box-score-selection-invalid', 'The selected Fix the Five challenge is not on the verified board.');
    const challenge = matches[0];
    if (!Array.isArray(challenge.lineup) || challenge.lineup.length !== 5
      || !Array.isArray(challenge.candidates) || challenge.candidates.length !== 3) {
      fail('v4-box-score-board-invalid', 'Fix the Five requires five lineup players and three replacement candidates.');
    }
    const rows = [
      ...challenge.lineup.map((row, index) => validatedBoardRow(row, { seasonStartYear, phase, teamCode: challenge.teamCode }, `lineup[${index}]`)),
      ...challenge.candidates.map((row, index) => validatedBoardRow(row, { seasonStartYear, phase, teamCode: challenge.teamCode }, `candidates[${index}]`)),
    ];
    const keys = rows.map(row => row.normalizedPlayerNameKey);
    if (new Set(keys).size !== keys.length || !keys.slice(0, 5).includes(challenge.removeNormalizedPlayerNameKey)) {
      fail('v4-box-score-board-invalid', 'Fix the Five repeats a player or does not name an outgoing lineup player.');
    }
    const scoredProfiles = rows.map(row => getEligibleProfile(profiles, row));
    if (request.selection?.kind !== 'fix-the-five'
      || !challenge.candidates.some(row => row.normalizedPlayerNameKey === request.selection.normalizedPlayerNameKey)) {
      fail('v4-box-score-selection-invalid', 'The selected Fix the Five replacement is not a listed candidate.');
    }
    const removedIndex = challenge.lineup.findIndex(row => row.normalizedPlayerNameKey === challenge.removeNormalizedPlayerNameKey);
    const retainedTotal = scoredProfiles.slice(0, 5)
      .filter((_, index) => index !== removedIndex)
      .reduce((sum, profile) => sum + profile.score, 0);
    const ranked = challenge.candidates.map(row => {
      const profileIndex = 5 + challenge.candidates.indexOf(row);
      return {
        key: row.normalizedPlayerNameKey,
        value: (retainedTotal + scoredProfiles[profileIndex].score) / 5,
      };
    }).sort((left, right) => right.value - left.value || compareText(left.key, right.key));
    const selectedIndex = ranked.findIndex(row => row.key === request.selection.normalizedPlayerNameKey);
    return completeEvaluation(ranked, selectedIndex, scoredProfiles, { seasonStartYear, phase });
  }

  const rounds = board.deck?.rounds;
  if (!Array.isArray(rounds) || rounds.length !== 5 || !Array.isArray(request.selection) || request.selection.length !== 5) {
    fail('v4-box-score-board-invalid', 'Draft Night requires five ordered rounds and five selected picks.');
  }
  const roundRows = rounds.map((round, index) => {
    if (round?.roundNumber !== index + 1 || !Array.isArray(round.candidates) || round.candidates.length !== 3) {
      fail('v4-box-score-board-invalid', `Draft Night round ${index + 1} must contain three candidates in order.`);
    }
    return round.candidates.map((row, candidateIndex) => validatedBoardRow(row, {
      seasonStartYear, phase, teamCode: round.teamCode,
    }, `round[${index}].candidates[${candidateIndex}]`));
  });
  const boardRows = roundRows.flat();
  const boardKeys = boardRows.map(row => row.normalizedPlayerNameKey);
  if (new Set(boardKeys).size !== boardKeys.length) {
    fail('v4-box-score-board-invalid', 'Draft Night candidate rows must use distinct canonical name keys.');
  }
  const scoredProfiles = boardRows.map(row => getEligibleProfile(profiles, row));
  const profileByKey = new Map(boardRows.map((row, index) => [row.normalizedPlayerNameKey, scoredProfiles[index]]));
  const selectedKeys = [];
  request.selection.forEach((pick, index) => {
    const round = rounds[index];
    if (pick?.roundId !== round.roundId
      || !round.candidates.some(row => row.normalizedPlayerNameKey === pick.normalizedPlayerNameKey)) {
      fail('v4-box-score-selection-invalid', 'Draft Night picks must match one legal candidate in each ordered round.');
    }
    selectedKeys.push(pick.normalizedPlayerNameKey);
  });
  if (new Set(selectedKeys).size !== selectedKeys.length) {
    fail('v4-box-score-selection-invalid', 'Draft Night selections must contain distinct players.');
  }

  const ranked = [];
  const visit = (roundIndex, picks, total) => {
    if (roundIndex === roundRows.length) {
      ranked.push({ keys: [...picks], tieKey: picks.join('|'), value: total / roundRows.length });
      return;
    }
    for (const row of roundRows[roundIndex]) {
      picks.push(row.normalizedPlayerNameKey);
      visit(roundIndex + 1, picks, total + profileByKey.get(row.normalizedPlayerNameKey).score);
      picks.pop();
    }
  };
  visit(0, [], 0);
  ranked.sort((left, right) => right.value - left.value || compareText(left.tieKey, right.tieKey));
  const selectedIndex = ranked.findIndex(row => row.keys.every((key, index) => key === selectedKeys[index]));
  if (selectedIndex < 0) fail('v4-box-score-selection-invalid', 'Draft Night selection does not match a legal board combination.');
  return completeEvaluation(ranked, selectedIndex, scoredProfiles, { seasonStartYear, phase });
}

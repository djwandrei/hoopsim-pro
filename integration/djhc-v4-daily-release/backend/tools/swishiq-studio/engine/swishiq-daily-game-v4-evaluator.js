/*
 * Descriptive V4 Daily evaluator. It ranks only exact-season impact rows that
 * are display-eligible and holdout-validated, and requires same-team,
 * same-season, same-phase player-game box-score evidence for every board row.
 * This is an additive source-impact comparison, not a game outcome forecast.
 */

import { normalizeCanonicalV4PlayerNameKey } from './canonical-v4-player-name-identity.js?v=20261001d&rev=canonical-v4-player-name-identity-v1';

export const SWISHIQ_DAILY_GAME_V4_EVALUATOR_FORMAT = 'djhc-swishiq-v4-daily-game-evaluator-v1';
export const SWISHIQ_DAILY_GAME_V4_EVALUATOR_VERSION = 'swishiq-v4-daily-exact-season-impact-boxscore-rank-v1';
export const SWISHIQ_DAILY_GAME_V4_ATTRIBUTION_SCOPE = 'source-reported-context-only / not-a-proven-team-split';

const IMPACT_UNIT = 'points-per-100-possessions';
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function impactRowsByName(records, names, seasonStartYear, phase) {
  const wanted = new Set(names);
  const candidatesByName = new Map([...wanted].map(key => [key, []]));
  for (const record of records) {
    const values = record?.values;
    const key = normalizeCanonicalV4PlayerNameKey(values?.displayName || record?.entities?.displayName || '');
    if (!candidatesByName.has(key)) continue;
    const fitScope = values?.fitScope;
    const years = fitScope?.seasonStartYears;
    const phases = fitScope?.phases;
    const isTargetFitScope = isRecord(fitScope) && fitScope.kind === 'exact-season'
      && Array.isArray(years) && years.length === 1 && years[0] === seasonStartYear
      && fitScope.seasonStartYear === seasonStartYear && fitScope.seasonEndYear === seasonStartYear + 1
      && Array.isArray(phases) && phases.length === 1 && phases[0] === phase
      && fitScope.pooledFitIsSeasonSpecific === true;
    if (!isTargetFitScope) continue;
    if ((record?.time?.seasonStartYear != null && record.time.seasonStartYear !== seasonStartYear)
      || (record?.time?.phase != null && record.time.phase !== phase)) {
      fail('v4-daily-impact-scope-unavailable', `Impact row metadata conflicts with its exact fit scope for ${key}.`);
    }
    const combined = values?.combined;
    if (record?.evidence?.status !== 'available'
      || values?.displayEligible !== true
      || values?.holdoutStatus !== 'validated'
      || values?.pairedPossessions <= 0
      || !isRecord(combined) || combined.status !== 'available'
      || combined.unit !== IMPACT_UNIT || !finite(combined.value)) {
      fail('v4-daily-impact-row-unavailable', `A display-eligible, holdout-validated impact value is unavailable for ${key}.`);
    }
    candidatesByName.get(key).push({ value: combined.value, displayName: values.displayName });
  }
  for (const [key, matches] of candidatesByName) {
    if (matches.length !== 1) {
      fail(matches.length ? 'v4-daily-impact-row-ambiguous' : 'v4-daily-impact-row-unavailable',
        `Expected one exact-season, exact-phase impact row for ${key}; found ${matches.length}.`);
    }
  }
  return new Map([...candidatesByName].map(([key, matches]) => [key, matches[0]]));
}

function boxScoreMembership(records, rows, seasonStartYear, phase) {
  const required = new Set(rows.map(row => JSON.stringify([row.normalizedPlayerNameKey, row.teamCode])));
  const evidence = new Map([...required].map(key => [key, new Set()]));
  for (const record of records) {
    const key = normalizeCanonicalV4PlayerNameKey(record?.values?.displayName || '');
    const teamCode = record?.entities?.teamCode;
    const membershipKey = JSON.stringify([key, teamCode]);
    if (!evidence.has(membershipKey)
      || record?.time?.seasonStartYear !== seasonStartYear
      || record?.time?.phase !== phase
      || record?.evidence?.status !== 'available'
      || typeof record?.entities?.gameRef !== 'string' || !record.entities.gameRef.trim()
      || !finite(record?.values?.minutes) || record.values.minutes <= 0) continue;
    evidence.get(membershipKey).add(record.entities.gameRef);
  }
  for (const [membership, games] of evidence) {
    if (!games.size) fail('v4-daily-box-score-context-unavailable', 'A board player lacks same-team, exact-season, same-phase box-score evidence.');
  }
  return evidence;
}

function scoreRows(gameKind, board, request, impactByName) {
  if (gameKind === 'fix-the-five') {
    const challenge = board.challenges.find(row => row.challengeId === request.selection.challengeId);
    if (!challenge) fail('v4-daily-selection-invalid', 'The selected Fix the Five challenge is not on the verified board.');
    const lineupKeys = challenge.lineup.map(row => row.normalizedPlayerNameKey);
    const outgoingKey = challenge.removeNormalizedPlayerNameKey;
    if (!lineupKeys.includes(outgoingKey)) fail('v4-daily-board-invalid', 'The outgoing player is not in the baseline lineup.');
    const baseline = lineupKeys.reduce((sum, key) => sum + impactByName.get(key).value, 0);
    const retained = lineupKeys.filter(key => key !== outgoingKey);
    const ranked = challenge.candidates.map(candidate => ({
      key: candidate.normalizedPlayerNameKey,
      value: retained.reduce((sum, key) => sum + impactByName.get(key).value, 0)
        + impactByName.get(candidate.normalizedPlayerNameKey).value - baseline,
    })).sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
    const selected = ranked.findIndex(row => row.key === request.selection.normalizedPlayerNameKey);
    if (selected < 0) fail('v4-daily-selection-invalid', 'The selected player is not a legal candidate for this challenge.');
    return {
      decision: { rank: selected + 1, optionCount: ranked.length, countComplete: true },
      selectedValue: ranked[selected].value,
      bestValue: ranked[0].value,
      gapToBest: Math.max(0, ranked[0].value - ranked[selected].value),
      comparison: 'selected replacement impact minus baseline lineup impact',
      impactRowCount: new Set([...lineupKeys, ...challenge.candidates.map(row => row.normalizedPlayerNameKey)]).size,
    };
  }

  const rounds = board.deck.rounds;
  const choices = rounds.map((round, index) => ({
    roundId: round.roundId,
    key: request.selection[index].normalizedPlayerNameKey,
    candidates: round.candidates.map(row => row.normalizedPlayerNameKey),
  }));
  const byRound = rounds.map(round => round.candidates.map(candidate => ({
    key: candidate.normalizedPlayerNameKey,
    value: impactByName.get(candidate.normalizedPlayerNameKey).value,
  })));
  const ranked = [];
  const visit = (index, picks, score) => {
    if (index === byRound.length) {
      ranked.push({ keys: [...picks], value: score / picks.length });
      return;
    }
    for (const candidate of byRound[index]) {
      picks.push(candidate.key);
      visit(index + 1, picks, score + candidate.value);
      picks.pop();
    }
  };
  visit(0, [], 0);
  ranked.sort((left, right) => right.value - left.value || left.keys.join('|').localeCompare(right.keys.join('|')));
  const selectedKeys = choices.map(row => row.key);
  const selected = ranked.findIndex(row => row.keys.every((key, index) => key === selectedKeys[index]));
  if (selected < 0) fail('v4-daily-selection-invalid', 'The selected Draft Night picks do not match one legal board combination.');
  return {
    decision: { rank: selected + 1, optionCount: ranked.length, countComplete: true },
    selectedValue: ranked[selected].value,
    bestValue: ranked[0].value,
    gapToBest: Math.max(0, ranked[0].value - ranked[selected].value),
    comparison: 'selected five-player mean impact among all legal board combinations',
    impactRowCount: new Set(byRound.flatMap(rows => rows.map(row => row.key))).size,
  };
}

/** Rank one hash-bound Daily V4 choice using only verified exact-scope parts. */
export function evaluateSwishIqV4DailyGameSelection({ request, board, impactPart, playerGamesPart } = {}) {
  if (!isRecord(request) || !isRecord(board)
    || impactPart?.status !== 'verified' || impactPart?.artifactId !== 'player-impact'
    || playerGamesPart?.status !== 'verified' || playerGamesPart?.artifactId !== 'player-games'
    || !Array.isArray(impactPart.records) || !Array.isArray(playerGamesPart.records)) {
    fail('v4-daily-evaluator-input-unverified', 'Verified player-impact and player-games parts are required.');
  }
  const seasonStartYear = board.scope?.seasonStartYears?.[0];
  const phase = board.phase;
  if (!Number.isSafeInteger(seasonStartYear) || !PHASES.has(phase)
    || request.boardRef?.packageId !== impactPart.package?.packageId
    || request.boardRef?.packageVersion !== impactPart.package?.packageVersion
    || request.boardRef?.packageId !== playerGamesPart.package?.packageId
    || request.boardRef?.packageVersion !== playerGamesPart.package?.packageVersion
    || JSON.stringify(request.boardRef?.scope) !== JSON.stringify(board.scope)
    || request.boardRef?.phase !== phase) {
    fail('v4-daily-package-scope-mismatch', 'The verified source parts do not match the board package, season, and phase.');
  }
  const boardRows = board.gameKind === 'fix-the-five'
    ? (() => {
      const challenge = board.challenges.find(row => row.challengeId === request.selection?.challengeId);
      if (!challenge) fail('v4-daily-selection-invalid', 'The selected Fix the Five challenge is not on the board.');
      return [...challenge.lineup, ...challenge.candidates];
    })()
    : board.deck.rounds.flatMap(round => round.candidates);
  const uniqueRows = new Map();
  for (const row of boardRows) {
    if (uniqueRows.has(row.normalizedPlayerNameKey)) fail('v4-daily-board-invalid', 'Daily V4 scoring requires distinct exact-season name keys.');
    uniqueRows.set(row.normalizedPlayerNameKey, row);
  }
  const impactByName = impactRowsByName(impactPart.records, [...uniqueRows.keys()], seasonStartYear, phase);
  const membershipCounts = boxScoreMembership(playerGamesPart.records, [...uniqueRows.values()], seasonStartYear, phase);
  const scored = scoreRows(board.gameKind, board, request, impactByName);
  const boxScoreRows = [...membershipCounts.values()].reduce((sum, games) => sum + games.size, 0);
  return Object.freeze({
    format: SWISHIQ_DAILY_GAME_V4_EVALUATOR_FORMAT,
    version: SWISHIQ_DAILY_GAME_V4_EVALUATOR_VERSION,
    status: 'complete',
    evaluationKind: 'descriptive-source-impact-ranking',
    scope: Object.freeze({ kind: 'exact-season', seasonStartYear, phase }),
    decision: Object.freeze(scored.decision),
    estimatedImpact: Object.freeze({
      value: scored.selectedValue,
      bestValue: scored.bestValue,
      gapToBest: scored.gapToBest,
      unit: IMPACT_UNIT,
      comparison: scored.comparison,
    }),
    evidence: Object.freeze({
      impactRows: scored.impactRowCount,
      sameTeamPhaseBoxScorePlayers: uniqueRows.size,
      sameTeamPhaseBoxScoreGames: boxScoreRows,
      attributionScope: SWISHIQ_DAILY_GAME_V4_ATTRIBUTION_SCOPE,
      predictiveEligibility: false,
      calibrationStatus: 'not-validated-for-game-outcome-prediction',
      uncertainty: 'not-available',
    }),
  });
}

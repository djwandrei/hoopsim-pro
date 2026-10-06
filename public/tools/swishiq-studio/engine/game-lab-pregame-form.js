/*
 * Exact-season, cutoff-safe Game Lab form features derived from V4 team-games.
 * This module builds descriptive pregame features only; it does not forecast
 * points, update the live simulator, or claim model calibration.
 */

export const GAME_LAB_PREGAME_FORM_VERSION = 'swishiq-v4-game-lab-pregame-form-v2-opponent-adjusted';

const SHA256 = /^[a-f0-9]{64}$/;
const NBA_TEAM_COUNT = 30;
const OPPONENT_ADJUSTED_ITERATIONS = 12;
const OPPONENT_ADJUSTED_PRIOR_GAMES = 6;
const OPPONENT_ADJUSTED_DAMPING = 0.5;
const fail = message => { throw new Error(message); };
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const utcDay = value => Date.parse(`${value}T00:00:00Z`);

function dateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(utcDay(value)) || new Date(utcDay(value)).toISOString().slice(0, 10) !== value) {
    fail(`${label} must be a valid YYYY-MM-DD local game date.`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    || !Number.isFinite(Date.parse(value))) fail(`${label} must be a valid timezone-qualified timestamp.`);
  return Date.parse(value);
}

function packageIdentity(packageIndex) {
  if (!isObject(packageIndex) || packageIndex.scope?.kind !== 'exact-season'
    || !Number.isSafeInteger(packageIndex.scope.seasonStartYear)
    || !Array.isArray(packageIndex.scope.seasonStartYears)
    || packageIndex.scope.seasonStartYears.length !== 1
    || packageIndex.scope.seasonStartYears[0] !== packageIndex.scope.seasonStartYear
    || typeof packageIndex.packageId !== 'string' || !packageIndex.packageId.startsWith('nba-swishiq-v4-')
    || typeof packageIndex.packageVersion !== 'string' || !Array.isArray(packageIndex.artifacts)) {
    fail('Pregame form requires one exact-season SwishIQ V4 package index.');
  }
  for (const key of ['packageManifestSha256', 'contentSha256', 'sourceLockSha256']) {
    if (!SHA256.test(packageIndex[key] || '')) fail(`Package index is missing a valid ${key}.`);
  }
  const seasonEndYear = packageIndex.scope.seasonEndYear ?? packageIndex.scope.seasonStartYear + 1;
  if (seasonEndYear !== packageIndex.scope.seasonStartYear + 1) fail('Package season end year does not match its exact-season key.');
  return Object.freeze({ seasonStartYear: packageIndex.scope.seasonStartYear,
    seasonEndYear,
    packageId: packageIndex.packageId, packageVersion: packageIndex.packageVersion,
    packageManifestSha256: packageIndex.packageManifestSha256,
    contentSha256: packageIndex.contentSha256, sourceLockSha256: packageIndex.sourceLockSha256 });
}

function validateTeamGames(packageIndex, artifact, identity) {
  const descriptor = packageIndex.artifacts.find(row => row?.artifactId === 'team-games');
  if (!isObject(artifact) || artifact.artifactId !== 'team-games' || !Array.isArray(artifact.records)
    || !descriptor || !SHA256.test(descriptor.sha256 || '') || descriptor.rows !== artifact.records.length
    || artifact.packageId !== identity.packageId || artifact.packageVersion !== identity.packageVersion
    || artifact.packageManifestSha256 !== identity.packageManifestSha256
    || artifact.sourceLockSha256 !== identity.sourceLockSha256
    || artifact.scope?.kind !== 'exact-season' || artifact.scope.seasonStartYear !== identity.seasonStartYear
    || !Array.isArray(artifact.scope.seasonStartYears) || artifact.scope.seasonStartYears.length !== 1
    || artifact.scope.seasonStartYears[0] !== identity.seasonStartYear
    || artifact.coverage?.status !== 'available' || artifact.coverage?.coverageState !== 'complete') {
    fail('team-games must be complete, hash-pinned, and scoped to the exact V4 season.');
  }
  return Object.freeze({ artifactId: descriptor.artifactId, path: descriptor.path,
    sha256: descriptor.sha256, rows: descriptor.rows, coverage: Object.freeze({ status: artifact.coverage.status,
      coverageState: artifact.coverage.coverageState, rowCount: artifact.coverage.rowCount ?? descriptor.rows,
      expectedSeasonStartYears: Object.freeze([...(artifact.coverage.expectedSeasonStartYears || [])]),
      includedSeasonStartYears: Object.freeze([...(artifact.coverage.includedSeasonStartYears || [])]) }) });
}

function teamGameRow(row, seasonStartYear, rowNumber) {
  const gameRef = row?.entities?.gameRef;
  const teamCode = row?.entities?.teamCode || row?.values?.teamCode;
  const opponentTeamCode = row?.entities?.opponentTeamCode || row?.values?.opponentTeamCode;
  const scheduledAtUtc = row?.time?.scheduledAtUtc || row?.values?.scheduledAt;
  const localGameDate = row?.time?.gameDateLocal || row?.values?.localGameDate;
  const phase = row?.time?.phase || row?.values?.phase;
  const rowSeason = row?.time?.seasonStartYear ?? row?.values?.seasonStartYear;
  if (typeof gameRef !== 'string' || !gameRef || typeof teamCode !== 'string' || !teamCode
    || typeof opponentTeamCode !== 'string' || !opponentTeamCode || rowSeason !== seasonStartYear
    || typeof row?.values?.isHome !== 'boolean') {
    fail(`team-games row ${rowNumber} lacks a usable exact-season game/team identity.`);
  }
  const scheduledAtMs = timestamp(scheduledAtUtc, `team-games row ${rowNumber} scheduledAtUtc`);
  const gameDate = dateOnly(localGameDate, `team-games row ${rowNumber} gameDateLocal`);
  return { row, gameRef, teamCode, opponentTeamCode, isHome: row.values.isHome,
    phase, seasonStartYear: rowSeason, scheduledAtUtc, scheduledAtMs, gameDate };
}

function validCompletedScore(game) {
  const values = game.row.values;
  return typeof game.row.recordId === 'string' && Boolean(game.row.recordId)
    && game.row.evidence?.status === 'available' && game.row.temporalUse?.role === 'target'
    && values.reconciliationStatus === 'matched' && values.trainingEligible === true
    && finite(values.pointsFor) && values.pointsFor >= 0
    && finite(values.pointsAgainst) && values.pointsAgainst >= 0;
}

function completionBeforeTip(game, target) {
  const row = game.row;
  const completedAt = row.time?.completedAtUtc || row.time?.gameCompletedAtUtc
    || row.values?.completedAtUtc || row.values?.gameCompletedAtUtc;
  if (completedAt == null) return false;
  const completedAtMs = timestamp(completedAt, `team-game ${game.gameRef} completion timestamp`);
  return completedAtMs >= game.scheduledAtMs && completedAtMs < target.scheduledAtMs;
}

function eligibleBeforeTarget(game, target) {
  if (game.gameRef === target.gameRef || game.phase !== 'regular'
    || game.scheduledAtMs >= target.scheduledAtMs || !validCompletedScore(game)) return false;
  if (game.gameDate < target.gameDate) return true;
  if (game.gameDate > target.gameDate) return false;
  return completionBeforeTip(game, target);
}

function opponentAdjustedStrength(rowsByGame, target) {
  const results = [];
  for (const [gameRef, rows] of rowsByGame) {
    if (rows.length !== 2 || !eligibleBeforeTarget(rows[0], target)
      || !eligibleBeforeTarget(rows[1], target)
      || !validCompletedScore(rows[0]) || !validCompletedScore(rows[1])) continue;
    const first = rows[0];
    const second = rows[1];
    if (first.opponentTeamCode !== second.teamCode || second.opponentTeamCode !== first.teamCode
      || first.row.values.pointsFor !== second.row.values.pointsAgainst
      || first.row.values.pointsAgainst !== second.row.values.pointsFor) continue;
    results.push({ gameRef, teamCode: first.teamCode, opponentTeamCode: second.teamCode,
      margin: first.row.values.pointsFor - first.row.values.pointsAgainst });
    results.push({ gameRef, teamCode: second.teamCode, opponentTeamCode: first.teamCode,
      margin: second.row.values.pointsFor - second.row.values.pointsAgainst });
  }
  const teams = [...new Set(results.flatMap(result => [result.teamCode, result.opponentTeamCode]))].sort();
  if (!teams.length) return new Map();
  const gamesByTeam = new Map(teams.map(teamCode => [teamCode,
    results.filter(result => result.teamCode === teamCode)]));
  let ratings = new Map(teams.map(teamCode => [teamCode, 0]));
  for (let iteration = 0; iteration < OPPONENT_ADJUSTED_ITERATIONS; iteration += 1) {
    const updated = new Map();
    for (const teamCode of teams) {
      const teamResults = gamesByTeam.get(teamCode);
      const adjustedMarginTotal = teamResults.reduce((sum, result) =>
        sum + result.margin + (ratings.get(result.opponentTeamCode) || 0), 0);
      const regularized = adjustedMarginTotal / (teamResults.length + OPPONENT_ADJUSTED_PRIOR_GAMES);
      updated.set(teamCode, OPPONENT_ADJUSTED_DAMPING * (ratings.get(teamCode) || 0)
        + (1 - OPPONENT_ADJUSTED_DAMPING) * regularized);
    }
    const center = [...updated.values()].reduce((sum, value) => sum + value, 0) / updated.size;
    ratings = new Map([...updated].map(([teamCode, value]) => [teamCode, value - center]));
  }
  return new Map(teams.map(teamCode => {
    const gameCount = gamesByTeam.get(teamCode).length;
    return [teamCode, Object.freeze({ value: round(ratings.get(teamCode)), gameCount,
      shrinkageWeight: round(gameCount / (gameCount + OPPONENT_ADJUSTED_PRIOR_GAMES)) })];
  }));
}

function teamFeature(teamCode, games, target, windowSize, recentDays, strengthByTeam) {
  const history = games.filter(game => game.teamCode === teamCode)
    .filter(game => eligibleBeforeTarget(game, target))
    .sort((left, right) => right.gameDate.localeCompare(left.gameDate)
      || right.scheduledAtMs - left.scheduledAtMs || right.gameRef.localeCompare(left.gameRef));
  const window = history.slice(0, windowSize);
  const count = window.length;
  const pointsFor = window.map(game => game.row.values.pointsFor);
  const pointsAgainst = window.map(game => game.row.values.pointsAgainst);
  const wins = window.reduce((sum, game) => sum + (game.row.values.pointsFor > game.row.values.pointsAgainst ? 1
    : game.row.values.pointsFor === game.row.values.pointsAgainst ? 0.5 : 0), 0);
  const last = history[0] || null;
  const dayGap = last ? Math.floor((utcDay(target.gameDate) - utcDay(last.gameDate)) / 86400000) : null;
  const gamesLast7Days = history.filter(game => {
    const gap = Math.floor((utcDay(target.gameDate) - utcDay(game.gameDate)) / 86400000);
    return gap >= 0 && gap < 7;
  }).length;
  const gamesInRecentDaysWindow = history.filter(game => {
    const gap = Math.floor((utcDay(target.gameDate) - utcDay(game.gameDate)) / 86400000);
    return gap >= 0 && gap < recentDays;
  }).length;
  const adjustedStrength = strengthByTeam.get(teamCode) || null;
  return Object.freeze({
    teamCode,
    status: count > 0 ? 'available' : 'insufficient-history',
    reason: count > 0 ? null : 'no-eligible-matched-prior-team-games-before-local-target-date',
    priorGameCount: history.length,
    windowGameCount: count,
    requestedWindowGameCount: windowSize,
    windowComplete: count === windowSize,
    priorGameRefs: Object.freeze(window.map(game => game.gameRef)),
    priorGameEvidence: Object.freeze(window.map(game => Object.freeze({ gameRef: game.gameRef,
      recordId: game.row.recordId, gameDateLocal: game.gameDate, scheduledAtUtc: game.scheduledAtUtc,
      pointsFor: game.row.values.pointsFor, pointsAgainst: game.row.values.pointsAgainst }))),
    lastPriorGameDateLocal: last?.gameDate || null,
    restDays: dayGap == null ? null : Math.max(0, dayGap - 1),
    backToBack: dayGap == null ? null : dayGap <= 1,
    gamesLast7Days,
    gamesInRecentDaysWindow,
    recentDaysWindow: recentDays,
    pointsForPerGameLastN: count ? round(pointsFor.reduce((sum, value) => sum + value, 0) / count) : null,
    pointsAgainstPerGameLastN: count ? round(pointsAgainst.reduce((sum, value) => sum + value, 0) / count) : null,
    pointDifferentialPerGameLastN: count ? round((pointsFor.reduce((sum, value) => sum + value, 0)
      - pointsAgainst.reduce((sum, value) => sum + value, 0)) / count) : null,
    winRateLastN: count ? round(wins / count) : null,
    opponentAdjustedStrengthPoints: adjustedStrength?.value ?? null,
    opponentAdjustedStrengthGameCount: adjustedStrength?.gameCount ?? 0,
    opponentAdjustedStrengthShrinkageWeight: adjustedStrength?.shrinkageWeight ?? null,
    opponentAdjustedStrengthStatus: adjustedStrength ? 'available' : 'insufficient-history',
    metricWindow: `most-recent-${count}-eligible-exact-season-games`,
  });
}

/**
 * Build home/away team-form features for one scheduled regular-season game.
 * Only matched, training-eligible scores from earlier exact-season games are
 * used. Same-day history is accepted only with an explicit completion time
 * earlier than tip; the target rows provide schedule/team identity only.
 */
export function deriveV4GameLabPregameForm({ packageIndex, teamGamesArtifact, targetGameRef,
  windowSize = 10, recentDays = 7 } = {}) {
  const identity = packageIdentity(packageIndex);
  if (typeof targetGameRef !== 'string' || !targetGameRef.trim()
    || !Number.isInteger(windowSize) || windowSize < 1 || windowSize > 20
    || !Number.isInteger(recentDays) || recentDays < 1 || recentDays > 30) {
    fail('Provide a game reference, a 1–20 game form window, and a 1–30 day recent window.');
  }
  const source = validateTeamGames(packageIndex, teamGamesArtifact, identity);
  const normalized = teamGamesArtifact.records.map((row, index) => teamGameRow(row, identity.seasonStartYear, index + 1));
  const rowsByGame = new Map();
  const uniqueTeamGames = new Set();
  for (const game of normalized) {
    const key = `${game.gameRef}\u0000${game.teamCode}`;
    if (uniqueTeamGames.has(key)) fail(`Duplicate team-game row for ${game.gameRef} and ${game.teamCode}.`);
    uniqueTeamGames.add(key);
    const gameRows = rowsByGame.get(game.gameRef) || [];
    gameRows.push(game);
    rowsByGame.set(game.gameRef, gameRows);
  }
  for (const [gameRef, rows] of rowsByGame) {
    if (rows.length !== 2 || new Set(rows.map(game => game.teamCode)).size !== 2
      || new Set(rows.map(game => game.isHome)).size !== 2
      || rows[0].scheduledAtUtc !== rows[1].scheduledAtUtc || rows[0].gameDate !== rows[1].gameDate
      || rows[0].opponentTeamCode !== rows[1].teamCode || rows[1].opponentTeamCode !== rows[0].teamCode
      || rows[0].phase !== rows[1].phase) {
      fail(`team-games rows for ${gameRef} are incomplete or internally inconsistent.`);
    }
  }
  const targetRows = normalized.filter(game => game.gameRef === targetGameRef);
  if (targetRows.length !== 2 || targetRows.some(game => game.phase !== 'regular')
    || new Set(targetRows.map(game => game.teamCode)).size !== 2
    || new Set(targetRows.map(game => game.isHome)).size !== 2
    || targetRows[0].scheduledAtUtc !== targetRows[1].scheduledAtUtc
    || targetRows[0].gameDate !== targetRows[1].gameDate
    || targetRows[0].opponentTeamCode !== targetRows[1].teamCode
    || targetRows[1].opponentTeamCode !== targetRows[0].teamCode) {
    fail('Target must resolve to exactly two reciprocal team rows for one scheduled regular-season game.');
  }
  const target = targetRows.find(game => game.isHome);
  const away = targetRows.find(game => !game.isHome);
  const adjustedStrengthByTeam = opponentAdjustedStrength(rowsByGame, target);
  const homeForm = teamFeature(target.teamCode, normalized, target, windowSize, recentDays, adjustedStrengthByTeam);
  const awayForm = teamFeature(away.teamCode, normalized, target, windowSize, recentDays, adjustedStrengthByTeam);
  const availableSides = [homeForm, awayForm].filter(feature => feature.status === 'available').length;
  return Object.freeze({
    format: GAME_LAB_PREGAME_FORM_VERSION,
    status: availableSides === 2 ? 'available' : availableSides === 1 ? 'partial' : 'insufficient-history',
    interpretation: 'descriptive exact-season pregame team form and opponent-adjusted point differential; not a score forecast, calibrated prediction, or causal rest/fatigue effect',
    season: Object.freeze({ seasonStartYear: identity.seasonStartYear, seasonEndYear: identity.seasonEndYear,
      seasonKey: `${identity.seasonStartYear}-${String((identity.seasonStartYear + 1) % 100).padStart(2, '0')}` }),
    package: Object.freeze({ packageId: identity.packageId, packageVersion: identity.packageVersion,
      packageManifestSha256: identity.packageManifestSha256, contentSha256: identity.contentSha256,
      sourceLockSha256: identity.sourceLockSha256 }),
    sourceArtifact: source,
    target: Object.freeze({ gameRef: target.gameRef, scheduledAtUtc: target.scheduledAtUtc,
      gameDateLocal: target.gameDate, phase: target.phase,
      homeTeamCode: target.teamCode, awayTeamCode: away.teamCode }),
    cutoffPolicy: Object.freeze({
      beforeTipRequired: true,
      priorGameRule: 'same exact season and regular phase; scheduled before target tip; matched observed final score; trainingEligible true',
      sameDayRule: 'excluded unless explicit completedAtUtc/gameCompletedAtUtc is earlier than target scheduledAtUtc',
      sourceHasNoCompletionTimestampFallback: 'time.observedThrough and scheduledAtUtc alone do not prove same-day game completion',
      targetScoreConsumed: false,
      priorWindowFormula: 'latest N eligible team-game rows ordered by local game date, scheduled timestamp, then gameRef',
      opponentAdjustedStrengthFormula: '12 damped iterations of regularized team point margin plus prior opponent ratings; six prior-game equivalent shrinkage; ratings recentered to a zero league mean',
      opponentAdjustedStrengthUsesReciprocalRows: true,
      opponentAdjustedStrengthHomeCourtAdjustment: false,
      opponentAdjustedStrengthPaceAdjustment: false,
      opponentAdjustedStrengthForecastUse: false,
      recentDayWindowFormula: 'count prior eligible games with local-date gap from 0 through recentDays minus 1',
      restDaysFormula: 'max(0, target local date - last prior local game date - 1)',
    }),
    settings: Object.freeze({ windowSize, recentDays }),
    teams: Object.freeze({ home: homeForm, away: awayForm }),
    support: Object.freeze({ artifactCoverage: 'complete', artifactRows: source.rows,
      targetTeamRows: targetRows.length, pregameSidesAvailable: availableSides,
      pooledSubstitution: false, sameSeasonOnly: true }),
    unavailableForModeling: Object.freeze(['point forecast coefficient', 'learned home/rest effect',
      'fatigue/workload effect', 'travel/location effect', 'calibrated uncertainty']),
  });
}

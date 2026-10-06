/*
 * Typed boundary from pinned V4 Game Lab input features to the existing
 * possession simulator. The simulator consumes synthetic rate samples here;
 * this adapter does not create observed possession or shot-event evidence.
 */

export const GAME_LAB_V4_INPUT_ADAPTER_FORMAT = 'djhc-swishiq-game-lab-v4-input-adapter-v1';
export const GAME_LAB_V4_INPUT_ADAPTER_VERSION = 'swishiq-v4-inputfeatures-last10-ppg-to-synthetic-team-rate-v1';

const EXACT_SEASON_YEARS = Object.freeze(Array.from({ length: 9 }, (_, index) => 2017 + index));
const HASHED_SNAPSHOT = /^s[a-f0-9]{24}$/;
const TEAM_CODE = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SIDE_POSSESSIONS = 200;
const POSSESSIONS_PER_ADAPTER_GAME = 100;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function unavailable(reasonCode, message, details = {}) {
  return Object.freeze({
    format: GAME_LAB_V4_INPUT_ADAPTER_FORMAT,
    version: GAME_LAB_V4_INPUT_ADAPTER_VERSION,
    status: 'unavailable',
    reasonCode,
    reason: message,
    predictorInput: null,
    source: Object.freeze({ ...details }),
    targetLabelUsed: false,
    scheduleScoreUsed: false,
    predictiveApprovalStatus: 'not-approved',
  });
}

function sameScope(left, right) {
  return isObject(left) && isObject(right)
    && left.kind === right.kind
    && JSON.stringify(left.seasonStartYears) === JSON.stringify(right.seasonStartYears)
    && JSON.stringify(left.phases) === JSON.stringify(right.phases)
    && left.seasonStartYear === right.seasonStartYear
    && left.seasonEndYear === right.seasonEndYear;
}

function validatePackageScope(packageRef, seasonStartYear, acceptPooled) {
  if (!isObject(packageRef) || typeof packageRef.packageId !== 'string' || !packageRef.packageId.trim()
    || typeof packageRef.packageVersion !== 'string' || !packageRef.packageVersion.trim()
    || !isObject(packageRef.scope)) {
    fail('package-scope-invalid', 'A package identity and declared exact-season or pooled-window scope are required.');
  }
  const scope = packageRef.scope;
  if (!Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length
    || scope.seasonStartYears.some((year, index) => !Number.isSafeInteger(year)
      || !EXACT_SEASON_YEARS.includes(year)
      || (index > 0 && year !== scope.seasonStartYears[index - 1] + 1))) {
    fail('package-scope-invalid', 'Package scope must name supported, ascending, contiguous season start years.');
  }
  if (!Array.isArray(scope.phases) || !scope.phases.includes('regular')) {
    fail('package-scope-invalid', 'Package scope must explicitly include regular-season rows.');
  }
  if (scope.kind === 'exact-season') {
    if (scope.seasonStartYears.length !== 1 || scope.seasonStartYears[0] !== seasonStartYear
      || scope.seasonStartYear !== seasonStartYear || scope.seasonEndYear !== seasonStartYear + 1) {
      fail('exact-season-scope-mismatch', 'The game row must belong to the one season in its exact-season package scope.');
    }
    if (acceptPooled === true) fail('pooled-acceptance-invalid', 'Exact-season access cannot carry pooled acceptance.');
    return Object.freeze({ kind: 'exact-season', seasonStartYears: Object.freeze([...scope.seasonStartYears]) });
  }
  if (scope.kind === 'pooled-window') {
    if (scope.seasonStartYears.length !== EXACT_SEASON_YEARS.length
      || scope.seasonStartYears.some((year, index) => year !== EXACT_SEASON_YEARS[index])
      || !scope.seasonStartYears.includes(seasonStartYear)
      || scope.seasonStartYear !== EXACT_SEASON_YEARS[0]
      || scope.seasonEndYear !== EXACT_SEASON_YEARS.at(-1) + 1) {
      fail('pooled-scope-invalid', 'Pooled access must name the complete 2017–26 window and contain the game row season.');
    }
    if (acceptPooled !== true) fail('pooled-acceptance-required', 'Pooled V4 input access requires explicit acceptPooled: true.');
    return Object.freeze({ kind: 'pooled-window', seasonStartYears: Object.freeze([...scope.seasonStartYears]) });
  }
  fail('package-scope-invalid', 'Package scope must be exact-season or pooled-window.');
}

function validateEnvelopeAgreement(gameArtifact, scheduleArtifact, gameRow, scheduleRow) {
  if (!isObject(gameArtifact) || !isObject(scheduleArtifact)
    || gameArtifact.artifactId !== 'game-lab-inputs'
    || scheduleArtifact.artifactId !== 'schedule-reconciliation'
    || gameArtifact.packageId !== scheduleArtifact.packageId
    || gameArtifact.packageVersion !== scheduleArtifact.packageVersion
    || !sameScope(gameArtifact.scope, scheduleArtifact.scope)) {
    fail('artifact-identity-mismatch', 'Game Lab inputs and schedule reconciliation must share the same pinned package identity and scope.');
  }
  if (!isObject(gameRow) || !isObject(scheduleRow)) {
    fail('source-record-invalid', 'Both the Game Lab input row and matching schedule reconciliation row are required.');
  }
}

function matchedScheduleUnavailable(gameRow, scheduleRow) {
  const gameRef = gameRow.entities?.gameRef;
  const rowTeams = [gameRow.entities?.homeTeamCode, gameRow.entities?.awayTeamCode];
  const scheduleTeams = scheduleRow.entities?.teamCodes;
  if (scheduleRow.entities?.gameRef !== gameRef
    || Number(scheduleRow.time?.seasonStartYear) !== Number(gameRow.time?.seasonStartYear)
    || scheduleRow.time?.phase !== gameRow.time?.phase
    || scheduleRow.time?.scheduledAtUtc !== gameRow.time?.scheduledAtUtc
    || scheduleRow.time?.gameDateLocal !== gameRow.time?.gameDateLocal
    || !Array.isArray(scheduleTeams) || scheduleTeams.length !== 2
    || scheduleTeams[0] !== rowTeams[0] || scheduleTeams[1] !== rowTeams[1]) {
    fail('schedule-identity-mismatch', `Schedule reconciliation identity differs for Game Lab row ${gameRef || '(missing gameRef)'}.`);
  }
  if (scheduleRow.evidence?.status !== 'available' || scheduleRow.values?.status !== 'matched'
    || scheduleRow.values?.targetEligible !== true
    || scheduleRow.values?.eligibleForGameLabBacktest !== true
    || (scheduleRow.values?.gameLabIneligibilityReason != null)
    || ['teamMismatch', 'localDateMismatch', 'identityConflict', 'scoreMismatch', 'phaseMismatch']
      .some(field => scheduleRow.values?.[field] === true)) {
    return unavailable('schedule-not-matched', 'The target schedule row is held, mismatched, or not explicitly eligible.', {
      gameRef,
      seasonStartYear: gameRow.time?.seasonStartYear,
      phase: gameRow.time?.phase,
    });
  }
  return null;
}

function boundedCounts(points, possessions) {
  let remainingPoints = points;
  const fourPlus = Math.min(possessions, Math.max(0, remainingPoints - (3 * possessions)));
  remainingPoints -= fourPlus * 4;
  let slots = possessions - fourPlus;
  const three = Math.min(slots, Math.floor(remainingPoints / 3));
  remainingPoints -= three * 3;
  slots -= three;
  const two = Math.min(slots, Math.floor(remainingPoints / 2));
  remainingPoints -= two * 2;
  slots -= two;
  const one = Math.min(slots, remainingPoints);
  remainingPoints -= one;
  const empty = slots - one;
  if (remainingPoints !== 0 || empty < 0) fail('rate-adaptation-failed', 'Synthetic sample could not reconcile the source rate to a bounded possession count.');
  return { empty, one, two, three, fourPlus };
}

function syntheticOutcome(pointsPerGame, windowGameCount) {
  const adapterGames = Math.max(2, windowGameCount);
  const exactPoints = pointsPerGame * adapterGames;
  const points = Math.round(exactPoints);
  if (!Number.isSafeInteger(points) || Math.abs(exactPoints - points) > 1e-8) {
    fail('rate-adaptation-failed', 'V4 points-per-game rate does not reconcile to an integer over its declared feature window.');
  }
  const possessions = adapterGames * POSSESSIONS_PER_ADAPTER_GAME;
  return Object.freeze({
    possessions,
    points,
    counts: Object.freeze(boundedCounts(points, possessions)),
    inputMode: 'synthetic-team-rate-adapter',
    adapterVersion: GAME_LAB_V4_INPUT_ADAPTER_VERSION,
    sourceWindowGameCount: windowGameCount,
  });
}

function validateSide(side, sideName) {
  if (!isObject(side) || !Number.isSafeInteger(side.windowGameCount) || side.windowGameCount < 0 || side.windowGameCount > 10
    || !Number.isSafeInteger(side.priorGameCount) || side.priorGameCount < side.windowGameCount
    || !Array.isArray(side.priorGameRefs) || side.priorGameRefs.length !== side.windowGameCount
    || new Set(side.priorGameRefs).size !== side.priorGameRefs.length
    || side.priorGameRefs.some(ref => typeof ref !== 'string' || !ref.trim())) {
    fail('feature-side-invalid', `V4 ${sideName} side has inconsistent prior/window game counts or references.`);
  }
  if (side.windowGameCount === 0) {
    if (side.pointsForPerGameLast10 !== null || side.pointsAgainstPerGameLast10 !== null) {
      fail('feature-history-imputed', `V4 ${sideName} side has no matched source history but contains a non-null score rate.`);
    }
    return { status: 'unavailable', reasonCode: 'no-prior-matched-source-history' };
  }
  for (const field of ['pointsForPerGameLast10', 'pointsAgainstPerGameLast10']) {
    if (typeof side[field] !== 'number' || !Number.isFinite(side[field]) || side[field] < 0) {
      fail('feature-rate-invalid', `V4 ${sideName} ${field} must be a finite non-negative number when source history exists.`);
    }
  }
  return { status: 'available', reasonCode: null };
}

function teamPayload({ sideFeature, team, snapshot, seasonStartYear }) {
  const windowGameCount = sideFeature.windowGameCount;
  const offense = syntheticOutcome(sideFeature.pointsForPerGameLast10, windowGameCount);
  const defense = syntheticOutcome(sideFeature.pointsAgainstPerGameLast10, windowGameCount);
  const offensiveRating = offense.points / offense.possessions * 100;
  const defensiveRating = defense.points / defense.possessions * 100;
  const netRating = offensiveRating - defensiveRating;
  return Object.freeze({
    snapshot,
    team,
    contexts: Object.freeze([Object.freeze({
      key: `season:${seasonStartYear}`,
      status: 'observed',
      games: windowGameCount,
      offensePossessions: offense.possessions,
      defensePossessions: defense.possessions,
      minimumCombinedPossessions: 1,
      offensiveRating,
      defensiveRating,
      netRating,
      interval: Object.freeze({ lower: netRating, upper: netRating }),
      adapterVersion: GAME_LAB_V4_INPUT_ADAPTER_VERSION,
      outcomes: Object.freeze({ offense, defense }),
    })]),
  });
}

/**
 * Adapt one source-backed V4 input record after the caller has verified its
 * package/artifact hashes. Only pre-tip regular-season inputFeatures are
 * mapped. Target labels and schedule scores are never copied to predictorInput.
 */
export function adaptV4GameLabInputRecord({
  gameArtifact,
  scheduleArtifact,
  gameRow,
  scheduleRow,
  packageRef,
  snapshot,
  acceptPooled = false,
} = {}) {
  validateEnvelopeAgreement(gameArtifact, scheduleArtifact, gameRow, scheduleRow);
  const gameRef = gameRow.entities?.gameRef;
  const seasonStartYear = Number(gameRow.time?.seasonStartYear);
  const phase = gameRow.time?.phase;
  const scope = validatePackageScope(packageRef, seasonStartYear, acceptPooled);
  if (!sameScope(packageRef.scope, gameArtifact.scope)) {
    fail('package-artifact-scope-mismatch', 'Package manifest scope differs from its Game Lab input artifact scope.');
  }
  if (typeof snapshot !== 'string' || !HASHED_SNAPSHOT.test(snapshot)) {
    fail('snapshot-invalid', 'A stable hash-derived simulator snapshot is required.');
  }
  if (typeof gameRef !== 'string' || !gameRef.trim()
    || !TEAM_CODE.test(gameRow.entities?.homeTeamCode || '')
    || !TEAM_CODE.test(gameRow.entities?.awayTeamCode || '')
    || gameRow.entities.homeTeamCode === gameRow.entities.awayTeamCode) {
    fail('game-identity-invalid', 'Game Lab row must declare a gameRef and two distinct NBA team codes.');
  }
  if (phase !== 'regular') {
    return unavailable('unsupported-phase', 'This adapter currently exposes regular-season prediction input only.', {
      gameRef, seasonStartYear, phase,
    });
  }
  const scheduleFailure = matchedScheduleUnavailable(gameRow, scheduleRow);
  if (scheduleFailure) return scheduleFailure;

  const feature = gameRow.values?.inputFeatures;
  const cutoff = Date.parse(feature?.temporalUse?.asOf);
  const tip = Date.parse(gameRow.time?.scheduledAtUtc);
  const localDate = gameRow.time?.gameDateLocal;
  const observedThrough = feature?.temporalUse?.observedThrough;
  if (gameRow.temporalUse?.role !== 'target' || gameRow.temporalUse?.eligibleForPredictiveFeatures !== false
    || gameRow.evidence?.status !== 'available' || gameRow.evidence?.scheduleReconciliationStatus !== 'matched'
    || gameRow.values?.eligibleForHistoricalBacktest !== true
    || feature?.temporalUse?.role !== 'feature' || feature.temporalUse.eligibleForPredictiveFeatures !== true
    || feature.phase !== 'regular'
    || !Number.isFinite(cutoff) || !Number.isFinite(tip) || cutoff >= tip
    || typeof localDate !== 'string' || !DATE.test(localDate)
    || typeof observedThrough !== 'string' || !DATE.test(observedThrough) || observedThrough >= localDate
    || gameRow.time?.asOfUtc !== feature.temporalUse.asOf
    || gameRow.time?.observedThrough !== observedThrough) {
    return unavailable('feature-eligibility-failed', 'The row lacks a matched regular-season, pre-tip, explicitly predictive-eligible feature boundary.', {
      gameRef, seasonStartYear, phase,
    });
  }
  if (!Array.isArray(gameArtifact.scope?.seasonStartYears)
    || !gameArtifact.scope.seasonStartYears.includes(seasonStartYear)
    || !Array.isArray(gameArtifact.scope?.phases)
    || !gameArtifact.scope.phases.includes(phase)) {
    fail('artifact-scope-mismatch', 'Game Lab input artifact scope does not contain the row season and phase.');
  }

  const sideValidation = {
    home: validateSide(feature.home, 'home'),
    away: validateSide(feature.away, 'away'),
  };
  const unavailableSides = Object.entries(sideValidation)
    .filter(([, result]) => result.status !== 'available')
    .map(([side, result]) => Object.freeze({ side, reason: result.reasonCode,
      teamCode: side === 'home' ? gameRow.entities.homeTeamCode : gameRow.entities.awayTeamCode,
      windowGameCount: feature[side].windowGameCount }));
  if (unavailableSides.length) {
    return unavailable('no-prior-matched-source-history', 'One or both teams have no prior matched source games; no rate is imputed.', {
      gameRef, seasonStartYear, phase, excludedSides: Object.freeze(unavailableSides), scope,
    });
  }

  return Object.freeze({
    format: GAME_LAB_V4_INPUT_ADAPTER_FORMAT,
    version: GAME_LAB_V4_INPUT_ADAPTER_VERSION,
    status: 'diagnostic-adapted',
    claimScope: 'regular-season-game-lab-input-to-existing-simulator-diagnostic-only',
    predictorInput: Object.freeze({
      a: teamPayload({ sideFeature: feature.home, team: 't0', snapshot, seasonStartYear }),
      b: teamPayload({ sideFeature: feature.away, team: 't1', snapshot, seasonStartYear }),
      season: seasonStartYear,
    }),
    source: Object.freeze({
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      scope,
      gameArtifactId: gameArtifact.artifactId,
      scheduleArtifactId: scheduleArtifact.artifactId,
      gameRef,
      seasonStartYear,
      phase,
      homeTeamCode: gameRow.entities.homeTeamCode,
      awayTeamCode: gameRow.entities.awayTeamCode,
      scheduledAtUtc: gameRow.time.scheduledAtUtc,
      gameDateLocal: localDate,
      predictionCutoff: feature.temporalUse.asOf,
      observedThrough,
      inputFeatureRole: feature.temporalUse.role,
      eligibleForPredictiveFeatures: feature.temporalUse.eligibleForPredictiveFeatures,
      sourceWindowGameCounts: Object.freeze({ home: feature.home.windowGameCount, away: feature.away.windowGameCount }),
      sourcePriorGameRefCounts: Object.freeze({ home: feature.home.priorGameRefs.length, away: feature.away.priorGameRefs.length }),
    }),
    mapping: Object.freeze({
      sourceFields: Object.freeze(['home.pointsForPerGameLast10', 'home.pointsAgainstPerGameLast10', 'home.windowGameCount',
        'away.pointsForPerGameLast10', 'away.pointsAgainstPerGameLast10', 'away.windowGameCount']),
      omittedFeatureFields: Object.freeze(['restDays', 'backToBack', 'gamesLast7Days', 'winRateLast10', 'homeAwayDifference']),
      targetLabelUsed: false,
      scheduleScoreUsed: false,
      syntheticPossessionGamesPerSide: Object.freeze({
        home: Math.max(2, feature.home.windowGameCount), away: Math.max(2, feature.away.windowGameCount),
      }),
      syntheticPossessionsPerSide: Object.freeze({
        home: Math.max(2, feature.home.windowGameCount) * POSSESSIONS_PER_ADAPTER_GAME,
        away: Math.max(2, feature.away.windowGameCount) * POSSESSIONS_PER_ADAPTER_GAME,
      }),
      minRequiredSidePossessions: MIN_SIDE_POSSESSIONS,
      possessionInputsObserved: false,
      eventShapeVerified: false,
      limitations: Object.freeze([
        'V4 supplies last-window team points-for/against rates, not possession counts or possession-event distributions.',
        'Synthetic possession denominators only adapt the observed rates to the existing simulator interface.',
        'The simulator derives a maximum-entropy 0–3 point profile from the adapted rate; shot-level outcomes are not inferred.',
        'This adapter and its predictions are diagnostic and do not establish production readiness or predictive approval.',
      ]),
    }),
    targetLabelUsed: false,
    scheduleScoreUsed: false,
    predictiveApprovalStatus: 'not-approved',
  });
}

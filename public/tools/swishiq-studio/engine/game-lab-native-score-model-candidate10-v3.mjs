/*
 * Candidate-10: isolated native V4 score-model development module.
 *
 * Research/development only. This file is intentionally disconnected from
 * Candidate-09, the package, evaluators, gates, site runtime, and deployment.
 * The feature builder accepts only the V4 inputFeatures object. Training labels
 * are read only by fitCandidate10ScoreModel after feature construction.
 * V3 adds versioned prior-history feature families for compact ablations.
 * Team matchup contrasts still reverse sign when team identities are swapped;
 * venue advantage remains attached to the home role.
 */

export const CANDIDATE10_FORMAT = 'djhc-swishiq-v4-native-candidate10-score-model-v1';
export const CANDIDATE10_VERSION = 'swishiq-v4-candidate10-prior-history-total-margin-v3';
export const CANDIDATE10_STATUS = 'research-development-only-not-evaluated';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPSILON = 1e-9;

const INPUT_FEATURE_KEYS = new Set(['temporalUse', 'home', 'away', 'homeAwayDifference', 'phase', 'historicalContext']);
const TEMPORAL_KEYS = new Set(['role', 'asOf', 'observedThrough', 'eligibleForPredictiveFeatures', 'eligibilityReason']);
const FIT_CONFIG_KEYS = new Set(['fitRows', 'ridgeLambda', 'featureFamilies']);
const PREDICT_CONFIG_KEYS = new Set(['model', 'inputFeatures']);
const SIDE_KEYS = new Set([
  'historyStatus', 'priorGameCount', 'windowGameCount', 'priorGameRefs', 'restDays',
  'backToBack', 'gamesLast7Days', 'pointsForPerGameLast10',
  'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10',
  'nullReason',
]);
const DIFFERENCE_KEYS = new Set([
  'pointsForPerGameLast10', 'pointsAgainstPerGameLast10',
  'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays',
]);
const SIDE_VALUE_PATHS = Object.freeze({
  pointsFor: 'pointsForPerGameLast10',
  pointsAgainst: 'pointsAgainstPerGameLast10',
  pointDifferential: 'pointDifferentialPerGameLast10',
  winRate: 'winRateLast10',
  restDays: 'restDays',
  gamesLast7Days: 'gamesLast7Days',
});

const TOTAL_BASE_NAMES = Object.freeze([
  'meanPointsForLast10',
  'meanPointsAgainstLast10',
  'meanWinRateLast10',
  'meanRestDays',
  'meanGamesLast7Days',
  'meanWindowGameCount',
  'missingSharePointsForLast10',
  'missingSharePointsAgainstLast10',
  'missingShareWinRateLast10',
  'missingShareRestDays',
  'missingShareGamesLast7Days',
]);
const MARGIN_BASE_NAMES = Object.freeze([
  'pointsForAdvantageLast10',
  'defenseAllowanceAdvantageLast10',
  'winRateAdvantageLast10',
  'restAdvantageDays',
  'scheduleDensityAdvantageLast7',
  'windowGameCountAdvantage',
  'missingnessAdvantagePointsFor',
  'missingnessAdvantagePointsAgainst',
  'missingnessAdvantageWinRate',
  'missingnessAdvantageRestDays',
  'missingnessAdvantageGamesLast7Days',
]);

const HISTORY_FAMILIES = Object.freeze({
  'multi-window': Object.freeze({
    total: ['meanPointsFor5Shrunk', 'meanPointsAgainst5Shrunk', 'meanPointsFor20Shrunk',
      'meanPointsAgainst20Shrunk', 'meanPointsForSeasonShrunk', 'meanPointsAgainstSeasonShrunk'],
    margin: ['pointsForAdvantage5Shrunk', 'defenseAllowanceAdvantage5Shrunk', 'pointsForAdvantage20Shrunk',
      'defenseAllowanceAdvantage20Shrunk', 'pointsForAdvantageSeasonShrunk', 'defenseAllowanceAdvantageSeasonShrunk'],
  }),
  strength: Object.freeze({ total: [], margin: ['opponentAdjustedStrengthAdvantage'] }),
  environment: Object.freeze({ total: ['leaguePointsPerSide'], margin: ['leagueHomeMargin'] }),
  schedule: Object.freeze({ total: ['meanGamesLast4Days', 'meanGamesLast6Days'],
    margin: ['scheduleDensityAdvantageLast4', 'scheduleDensityAdvantageLast6'] }),
});

function validateHistoryContext(context, temporal) {
  if (!isObject(context) || context.format !== 'swishiq-game-prior-history-context-v1'
      || !validDate(context.gameDateLocal)
      || !Number.isSafeInteger(context.sourcePriorGameCount) || context.sourcePriorGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough)
        || context.observedThrough >= context.gameDateLocal || context.observedThrough > temporal.observedThrough))
      || (context.sourcePriorGameCount > 0 && context.observedThrough == null)) {
    fail('history-context-invalid', 'Versioned historical context must use games strictly earlier than the target local date.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || !Number.isSafeInteger(side.priorSeasonGameCount) || side.priorSeasonGameCount < 0
        || !Array.isArray(side.priorGameRefs) || side.priorGameRefs.length !== Math.min(20, side.historyGameCount)
        || new Set(side.priorGameRefs).size !== side.priorGameRefs.length) {
      fail('history-context-invalid', 'Historical context has inconsistent side sample counts or references.');
    }
    for (const field of ['pointsFor5Shrunk', 'pointsAgainst5Shrunk', 'pointsFor20Shrunk',
      'pointsAgainst20Shrunk', 'pointsForSeasonShrunk', 'pointsAgainstSeasonShrunk',
      'opponentAdjustedStrength', 'pointsForSd20Shrunk', 'pointsAgainstSd20Shrunk', 'marginSd20Shrunk',
      'gamesLast4Days', 'gamesLast6Days']) {
      if (!isFiniteNumber(side[field]) || Math.abs(side[field]) > 300
          || (field !== 'opponentAdjustedStrength' && side[field] < 0)) {
        fail('history-context-invalid', 'Historical context values must be finite and in range.');
      }
    }
  }
  if (!isObject(context.league) || ['pointsPerSide', 'homeMargin', 'pointsSd', 'marginSd']
    .some(name => !isFiniteNumber(context.league[name]))) {
    fail('history-context-invalid', 'Historical league context is incomplete.');
  }
  return context;
}

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyKeys(value, allowed, label) {
  if (!isObject(value)) fail('record-invalid', `${label} must be an object.`);
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) fail('field-not-allowed', `${label} has unsupported field(s): ${unexpected.join(', ')}.`);
}

function requireFields(value, fields, label) {
  const missing = fields.filter(field => !Object.hasOwn(value, field));
  if (missing.length) fail('field-missing', `${label} is missing required field(s): ${missing.join(', ')}.`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validUtc(value) {
  if (typeof value !== 'string' || !UTC_RE.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function approximatelyEqual(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return isFiniteNumber(left) && isFiniteNumber(right) && Math.abs(left - right) <= EPSILON;
}

function assertNumericOrNull(value, { name, min, max, integer = false } = {}) {
  if (value == null) return;
  if (!isFiniteNumber(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) {
    fail('feature-value-invalid', `${name} must be null or a finite ${integer ? 'integer' : 'number'} in [${min}, ${max}].`);
  }
}

function sideValue(side, semanticName) {
  return side[SIDE_VALUE_PATHS[semanticName]];
}

function expectedDifference(homeValue, awayValue) {
  return homeValue == null || awayValue == null ? null : homeValue - awayValue;
}

function validateSide(side, sideName) {
  assertOnlyKeys(side, SIDE_KEYS, `inputFeatures.${sideName}`);
  requireFields(side, [...SIDE_KEYS], `inputFeatures.${sideName}`);
  if (!Number.isSafeInteger(side.priorGameCount) || side.priorGameCount < 0
      || !Number.isSafeInteger(side.windowGameCount) || side.windowGameCount < 0
      || side.windowGameCount > 10 || side.priorGameCount < side.windowGameCount
      || side.windowGameCount !== Math.min(10, side.priorGameCount)) {
    fail('history-contract-invalid', `inputFeatures.${sideName} prior/window game counts violate the rolling-last-10 contract.`);
  }
  if (!Array.isArray(side.priorGameRefs) || side.priorGameRefs.length !== side.windowGameCount
      || side.priorGameRefs.some(ref => typeof ref !== 'string' || !ref.trim())
      || new Set(side.priorGameRefs).size !== side.priorGameRefs.length) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.priorGameRefs must be unique and match windowGameCount.`);
  }
  const expectedHistoryStatus = side.windowGameCount > 0 ? 'available' : 'insufficient-history';
  if (side.historyStatus !== expectedHistoryStatus) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.historyStatus conflicts with its windowGameCount.`);
  }
  if (side.nullReason != null && (typeof side.nullReason !== 'string' || !side.nullReason.trim())) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.nullReason must be a nonempty string or null.`);
  }
  if ((side.windowGameCount > 0 && side.nullReason != null)
      || (side.windowGameCount === 0 && side.nullReason == null)) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.nullReason does not match the cold-start state.`);
  }

  assertNumericOrNull(side.pointsForPerGameLast10, { name: `${sideName}.pointsForPerGameLast10`, min: 0, max: 200 });
  assertNumericOrNull(side.pointsAgainstPerGameLast10, { name: `${sideName}.pointsAgainstPerGameLast10`, min: 0, max: 200 });
  assertNumericOrNull(side.pointDifferentialPerGameLast10, { name: `${sideName}.pointDifferentialPerGameLast10`, min: -200, max: 200 });
  assertNumericOrNull(side.winRateLast10, { name: `${sideName}.winRateLast10`, min: 0, max: 1 });
  assertNumericOrNull(side.restDays, { name: `${sideName}.restDays`, min: 0, max: 365, integer: true });
  assertNumericOrNull(side.gamesLast7Days, { name: `${sideName}.gamesLast7Days`, min: 0, max: 7, integer: true });
  if (side.backToBack != null && typeof side.backToBack !== 'boolean') {
    fail('history-contract-invalid', `${sideName}.backToBack must be boolean or null.`);
  }
  if ((side.restDays == null) !== (side.backToBack == null)
      || (side.restDays != null && side.backToBack !== (side.restDays === 0))) {
    fail('history-contract-invalid', `${sideName}.backToBack must agree with restDays, including null handling.`);
  }
  if (side.windowGameCount === 0) {
    for (const field of ['pointsForPerGameLast10', 'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays', 'backToBack']) {
      if (side[field] != null) fail('history-contract-invalid', `${sideName}.${field} must be null for a cold start.`);
    }
    if (side.gamesLast7Days != null && side.gamesLast7Days !== 0) {
      fail('history-contract-invalid', `${sideName}.gamesLast7Days must be zero or null for a cold start.`);
    }
  } else {
    for (const field of ['pointsForPerGameLast10', 'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays', 'backToBack', 'gamesLast7Days']) {
      if (side[field] == null) fail('history-contract-invalid', `${sideName}.${field} is required when rolling history is populated.`);
    }
    if (!approximatelyEqual(side.pointDifferentialPerGameLast10, side.pointsForPerGameLast10 - side.pointsAgainstPerGameLast10)) {
      fail('difference-contract-invalid', `${sideName} point differential must equal points-for minus points-against.`);
    }
  }
}

function validateTemporalContract(inputFeatures) {
  const temporal = inputFeatures.temporalUse;
  assertOnlyKeys(temporal, TEMPORAL_KEYS, 'inputFeatures.temporalUse');
  requireFields(temporal, ['role', 'asOf', 'observedThrough'], 'inputFeatures.temporalUse');
  if (!isObject(temporal) || temporal.role !== 'feature'
      || !validUtc(temporal.asOf) || !validDate(temporal.observedThrough)) {
    fail('temporal-contract-invalid', 'inputFeatures.temporalUse must identify role=feature with canonical UTC asOf and a valid observedThrough date.');
  }
  if (temporal.eligibleForPredictiveFeatures != null && typeof temporal.eligibleForPredictiveFeatures !== 'boolean') {
    fail('temporal-contract-invalid', 'eligibleForPredictiveFeatures must be boolean when present; its value is not treated as evidence.');
  }
  if (temporal.eligibilityReason != null && typeof temporal.eligibilityReason !== 'string') {
    fail('temporal-contract-invalid', 'eligibilityReason must be a string or null when present.');
  }
  const asOfUtcDate = temporal.asOf.slice(0, 10);
  if (temporal.observedThrough >= asOfUtcDate
      || Date.parse(`${temporal.observedThrough}T23:59:59.999Z`) >= Date.parse(temporal.asOf)) {
    fail('temporal-contract-invalid', 'observedThrough must end before the declared asOf instant.');
  }
  // eligibleForPredictiveFeatures is deliberately not treated as evidence.
  // This inputFeatures-only API cannot compare asOf with scheduledAtUtc; the
  // caller/evaluator must do that check from the target schedule metadata.
  return temporal;
}

function validateDifferenceRecord(inputFeatures) {
  const record = inputFeatures.homeAwayDifference;
  assertOnlyKeys(record, DIFFERENCE_KEYS, 'inputFeatures.homeAwayDifference');
  requireFields(record, [...DIFFERENCE_KEYS], 'inputFeatures.homeAwayDifference');
  const home = inputFeatures.home;
  const away = inputFeatures.away;
  const pairs = {
    pointsForPerGameLast10: [home.pointsForPerGameLast10, away.pointsForPerGameLast10],
    pointsAgainstPerGameLast10: [home.pointsAgainstPerGameLast10, away.pointsAgainstPerGameLast10],
    pointDifferentialPerGameLast10: [home.pointDifferentialPerGameLast10, away.pointDifferentialPerGameLast10],
    winRateLast10: [home.winRateLast10, away.winRateLast10],
    restDays: [home.restDays, away.restDays],
  };
  for (const [field, [homeValue, awayValue]] of Object.entries(pairs)) {
    const expected = expectedDifference(homeValue, awayValue);
    if (!approximatelyEqual(record[field], expected)) {
      fail('difference-contract-invalid', `homeAwayDifference.${field} must equal home minus away with null propagation.`);
    }
  }
  return record;
}

function meanAvailable(values) {
  const present = values.filter(isFiniteNumber);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function halfDifference(homeValue, awayValue) {
  return isFiniteNumber(homeValue) && isFiniteNumber(awayValue) ? (homeValue - awayValue) / 2 : 0;
}

function isMissing(value) {
  return value == null ? 1 : 0;
}

function buildFeatureBasis(inputFeatures) {
  const home = inputFeatures.home;
  const away = inputFeatures.away;
  const h = {
    pf: sideValue(home, 'pointsFor'), pa: sideValue(home, 'pointsAgainst'),
    win: sideValue(home, 'winRate'), rest: sideValue(home, 'restDays'),
    g7: sideValue(home, 'gamesLast7Days'), window: home.windowGameCount,
  };
  const a = {
    pf: sideValue(away, 'pointsFor'), pa: sideValue(away, 'pointsAgainst'),
    win: sideValue(away, 'winRate'), rest: sideValue(away, 'restDays'),
    g7: sideValue(away, 'gamesLast7Days'), window: away.windowGameCount,
  };
  const total = {
    meanPointsForLast10: meanAvailable([h.pf, a.pf]),
    meanPointsAgainstLast10: meanAvailable([h.pa, a.pa]),
    meanWinRateLast10: meanAvailable([h.win, a.win]),
    meanRestDays: meanAvailable([h.rest, a.rest]),
    meanGamesLast7Days: meanAvailable([h.g7, a.g7]),
    meanWindowGameCount: (h.window + a.window) / 2,
    missingSharePointsForLast10: (isMissing(h.pf) + isMissing(a.pf)) / 2,
    missingSharePointsAgainstLast10: (isMissing(h.pa) + isMissing(a.pa)) / 2,
    missingShareWinRateLast10: (isMissing(h.win) + isMissing(a.win)) / 2,
    missingShareRestDays: (isMissing(h.rest) + isMissing(a.rest)) / 2,
    missingShareGamesLast7Days: (isMissing(h.g7) + isMissing(a.g7)) / 2,
  };
  const margin = {
    pointsForAdvantageLast10: halfDifference(h.pf, a.pf),
    defenseAllowanceAdvantageLast10: halfDifference(a.pa, h.pa),
    winRateAdvantageLast10: halfDifference(h.win, a.win),
    restAdvantageDays: halfDifference(h.rest, a.rest),
    scheduleDensityAdvantageLast7: halfDifference(a.g7, h.g7),
    windowGameCountAdvantage: halfDifference(h.window, a.window),
    missingnessAdvantagePointsFor: (isMissing(a.pf) - isMissing(h.pf)) / 2,
    missingnessAdvantagePointsAgainst: (isMissing(a.pa) - isMissing(h.pa)) / 2,
    missingnessAdvantageWinRate: (isMissing(a.win) - isMissing(h.win)) / 2,
    missingnessAdvantageRestDays: (isMissing(a.rest) - isMissing(h.rest)) / 2,
    missingnessAdvantageGamesLast7Days: (isMissing(a.g7) - isMissing(h.g7)) / 2,
  };
  const context = inputFeatures.historicalContext;
  for (const suffix of ['5Shrunk', '20Shrunk', 'SeasonShrunk']) {
    total['meanPointsFor' + suffix] = (context.home['pointsFor' + suffix] + context.away['pointsFor' + suffix]) / 2;
    total['meanPointsAgainst' + suffix] = (context.home['pointsAgainst' + suffix] + context.away['pointsAgainst' + suffix]) / 2;
    margin['pointsForAdvantage' + suffix] = (context.home['pointsFor' + suffix] - context.away['pointsFor' + suffix]) / 2;
    margin['defenseAllowanceAdvantage' + suffix] = (context.away['pointsAgainst' + suffix] - context.home['pointsAgainst' + suffix]) / 2;
  }
  margin.opponentAdjustedStrengthAdvantage = (context.home.opponentAdjustedStrength - context.away.opponentAdjustedStrength) / 2;
  total.leaguePointsPerSide = context.league.pointsPerSide;
  margin.leagueHomeMargin = context.league.homeMargin;
  for (const days of [4, 6]) {
    total['meanGamesLast' + days + 'Days'] = (context.home['gamesLast' + days + 'Days'] + context.away['gamesLast' + days + 'Days']) / 2;
    margin['scheduleDensityAdvantageLast' + days] = (context.away['gamesLast' + days + 'Days'] - context.home['gamesLast' + days + 'Days']) / 2;
  }
  return { total, margin };
}

function featureMissingNames(basis) {
  return {
    total: TOTAL_BASE_NAMES.filter(name => basis.total[name] == null),
    margin: [],
  };
}

/**
 * Deterministically validates and transforms a V4 inputFeatures object.
 * This API does not accept targets, game metadata, fitted statistics, or labels.
 */
export function buildCandidate10Features(inputFeatures) {
  assertOnlyKeys(inputFeatures, INPUT_FEATURE_KEYS, 'inputFeatures');
  requireFields(inputFeatures, [...INPUT_FEATURE_KEYS], 'inputFeatures');
  if (inputFeatures.phase !== 'regular') {
    fail('phase-not-supported', 'Candidate-10 development features currently support regular-season inputFeatures only.');
  }
  const temporal = validateTemporalContract(inputFeatures);
  validateHistoryContext(inputFeatures.historicalContext, temporal);
  validateSide(inputFeatures.home, 'home');
  validateSide(inputFeatures.away, 'away');
  validateDifferenceRecord(inputFeatures);
  const basis = buildFeatureBasis(inputFeatures);
  const missing = featureMissingNames(basis);
  const coldStart = inputFeatures.home.windowGameCount === 0 || inputFeatures.away.windowGameCount === 0;
  const bothSidesColdStart = inputFeatures.home.windowGameCount === 0 && inputFeatures.away.windowGameCount === 0;
  const lineage = {
    developmentOnly: true,
    builderVersion: CANDIDATE10_VERSION,
    inputContract: 'V4 values.inputFeatures with temporalUse, home, away, homeAwayDifference, and phase',
    inputRoot: 'inputFeatures',
    phase: inputFeatures.phase,
    asOf: temporal.asOf,
    observedThrough: temporal.observedThrough,
    inputFieldsUsedForPredictionBasis: [
      'home.pointsForPerGameLast10', 'home.pointsAgainstPerGameLast10', 'home.winRateLast10', 'home.restDays', 'home.gamesLast7Days', 'home.windowGameCount',
      'away.pointsForPerGameLast10', 'away.pointsAgainstPerGameLast10', 'away.winRateLast10', 'away.restDays', 'away.gamesLast7Days', 'away.windowGameCount',
    ],
    contractFieldsCheckedButNotModeled: ['phase', 'temporalUse.asOf', 'temporalUse.observedThrough'],
    inputFieldsCheckedButNotModeled: [
      'home.pointDifferentialPerGameLast10', 'away.pointDifferentialPerGameLast10',
      'home.backToBack', 'away.backToBack', 'homeAwayDifference.*',
    ],
    inputFieldsNeverReadAsProof: ['temporalUse.eligibleForPredictiveFeatures'],
    outcomeOrTargetFieldsRead: [],
    historyRefs: {
      home: [...inputFeatures.home.priorGameRefs],
      away: [...inputFeatures.away.priorGameRefs],
      usedAsModelFeatures: false,
    },
    historyCounts: {
      homePrior: inputFeatures.home.priorGameCount,
      awayPrior: inputFeatures.away.priorGameCount,
      homeWindow: inputFeatures.home.windowGameCount,
      awayWindow: inputFeatures.away.windowGameCount,
    },
    coldStartPolicy: bothSidesColdStart ? 'both-sides-cold-start; fit-mean-imputation-plus-missingness-features; team margin contrasts are zero and learned home-court advantage remains' : coldStart ? 'one-side-cold-start; fit-mean-imputation-plus-side-missingness-contrast and learned home-court advantage' : 'observed-window-values; missing fields still use fit-mean-imputation-plus-missingness-features',
    nullFeaturesBeforeFit: missing.total,
    historicalContext: {
      format: inputFeatures.historicalContext.format,
      observedThrough: inputFeatures.historicalContext.observedThrough,
      sourcePriorGameCount: inputFeatures.historicalContext.sourcePriorGameCount,
      homeHistoryCount: inputFeatures.historicalContext.home.historyGameCount,
      awayHistoryCount: inputFeatures.historicalContext.away.historyGameCount,
      parameters: inputFeatures.historicalContext.parameters,
    },
    availabilityCaveat: 'The inputFeatures-only API validates internal role/cutoff/date shape. It cannot compare asOf against scheduledAtUtc or independently prove source availability; the caller must validate target schedule chronology and source evidence.',
  };
  return deepFreeze({
    format: 'djhc-swishiq-v4-candidate10-feature-basis-v1',
    total: Object.freeze({ ...basis.total }),
    margin: Object.freeze({ ...basis.margin }),
    featureLineage: lineage,
  });
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(rows[pivot][column]) || Math.abs(rows[pivot][column]) < 1e-12) {
      fail('fit-singular', `Candidate-10 ridge system is singular at column ${column}.`);
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let cell = column; cell <= size; cell += 1) rows[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (factor === 0) continue;
      for (let cell = column; cell <= size; cell += 1) rows[row][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map(row => row[size]);
}

function ridgeFit(designRows, targets, ridgeLambda, { unpenalizedFirstColumn = false } = {}) {
  if (!designRows.length || designRows.length !== targets.length) fail('fit-rows-invalid', 'Each ridge head requires aligned nonempty fit rows and targets.');
  const width = designRows[0].length;
  if (!width || designRows.some(row => row.length !== width || row.some(value => !isFiniteNumber(value)))) {
    fail('fit-design-invalid', 'Candidate-10 ridge design rows must have one finite, fixed-width basis.');
  }
  const gram = Array.from({ length: width }, () => Array(width).fill(0));
  const cross = Array(width).fill(0);
  for (let rowIndex = 0; rowIndex < designRows.length; rowIndex += 1) {
    const row = designRows[rowIndex];
    const target = targets[rowIndex];
    if (!isFiniteNumber(target)) fail('fit-target-invalid', 'Candidate-10 ridge targets must be finite.');
    for (let left = 0; left < width; left += 1) {
      cross[left] += row[left] * target;
      for (let right = 0; right < width; right += 1) gram[left][right] += row[left] * row[right];
    }
  }
  for (let index = 0; index < width; index += 1) {
    if (unpenalizedFirstColumn && index === 0) continue;
    gram[index][index] += ridgeLambda;
  }
  return solveLinearSystem(gram, cross);
}

function fitCenterScale(values) {
  const present = values.filter(isFiniteNumber);
  const center = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : 0;
  const variance = present.length ? present.reduce((sum, value) => sum + ((value - center) ** 2), 0) / present.length : 0;
  const standardDeviation = Math.sqrt(variance);
  return { center, scale: standardDeviation > EPSILON ? standardDeviation : 1, observedCount: present.length };
}

function fitTotalHead(featureRows, targetTotals, ridgeLambda, featureNames) {
  const stats = {};
  for (const name of featureNames) stats[name] = fitCenterScale(featureRows.map(row => row.total[name]));
  const columns = ['intercept', ...featureNames];
  const design = featureRows.map(row => {
    const vector = [1];
    for (const name of featureNames) {
      const value = row.total[name] == null ? stats[name].center : row.total[name];
      vector.push((value - stats[name].center) / stats[name].scale);
    }
    return vector;
  });
  const coefficients = ridgeFit(design, targetTotals, ridgeLambda, { unpenalizedFirstColumn: true });
  return { featureNames: columns, fitStatistics: stats, coefficients };
}

function fitMarginHead(featureRows, targetMargins, ridgeLambda, featureNames) {
  const stats = {};
  for (const name of featureNames) {
    const values = featureRows.map(row => row.margin[name]);
    const rms = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value ** 2), 0) / values.length) : 0;
    stats[name] = { center: 0, scale: rms > EPSILON ? rms : 1, statistic: 'fit-row root-mean-square with zero center to preserve antisymmetry' };
  }
  const design = featureRows.map(row => [1, ...featureNames.map(name => row.margin[name] / stats[name].scale)]);
  const coefficients = ridgeFit(design, targetMargins, ridgeLambda, { unpenalizedFirstColumn: true });
  return {
    featureNames: ['homeCourtIntercept', ...featureNames],
    fitStatistics: stats,
    intercept: coefficients[0],
    coefficients,
  };
}

function validateFitTarget(target, rowIndex) {
  if (!isObject(target) || target.status !== 'available'
      || !Number.isSafeInteger(target.homeScore) || target.homeScore < 0 || target.homeScore > 300
      || !Number.isSafeInteger(target.awayScore) || target.awayScore < 0 || target.awayScore > 300) {
    fail('fit-target-invalid', `Fit row ${rowIndex} must contain available integer home/away scores in [0, 300].`);
  }
  if (target.margin != null && target.margin !== target.homeScore - target.awayScore) {
    fail('fit-target-invalid', `Fit row ${rowIndex} target margin conflicts with its scores.`);
  }
  return { total: target.homeScore + target.awayScore, margin: target.homeScore - target.awayScore };
}

/**
 * Fits two ridge heads from the supplied fit rows only. It does not accept a
 * tune set, outer set, evaluation labels, probability calibration, or a
 * feature-statistics override. Pass the previously frozen lambda explicitly.
 */
export function fitCandidate10ScoreModel(options = {}) {
  assertOnlyKeys(options, FIT_CONFIG_KEYS, 'Candidate-10 fit configuration');
  requireFields(options, ['fitRows', 'ridgeLambda', 'featureFamilies'], 'Candidate-10 fit configuration');
  const { fitRows, ridgeLambda, featureFamilies } = options;
  if (!Array.isArray(featureFamilies) || new Set(featureFamilies).size !== featureFamilies.length
      || featureFamilies.some(name => !Object.hasOwn(HISTORY_FAMILIES, name))) {
    fail('feature-family-invalid', 'Select unique declared historical feature families.');
  }
  if (!Array.isArray(fitRows) || fitRows.length < 2) fail('fit-rows-invalid', 'Candidate-10 requires at least two fit rows.');
  if (!isFiniteNumber(ridgeLambda) || ridgeLambda <= 0 || ridgeLambda > 100) {
    fail('ridge-penalty-invalid', 'ridgeLambda must be provided, finite, > 0, and <= 100; this module does not tune it.');
  }
  const gameRefs = new Set();
  const featureRows = [];
  const targetTotals = [];
  const targetMargins = [];
  const seasons = new Set();
  for (const [index, row] of fitRows.entries()) {
    if (!isObject(row) || !isObject(row.inputFeatures) || !isObject(row.target)) {
      fail('fit-row-invalid', `Fit row ${index + 1} must provide inputFeatures and target separately.`);
    }
    if (typeof row.gameRef === 'string') {
      if (gameRefs.has(row.gameRef)) fail('fit-row-invalid', `Duplicate fit gameRef ${row.gameRef}.`);
      gameRefs.add(row.gameRef);
    }
    if (Number.isSafeInteger(row.seasonStartYear)) seasons.add(row.seasonStartYear);
    const built = buildCandidate10Features(row.inputFeatures);
    const target = validateFitTarget(row.target, index + 1);
    featureRows.push({ total: built.total, margin: built.margin });
    targetTotals.push(target.total);
    targetMargins.push(target.margin);
  }
  const totalNames = [...TOTAL_BASE_NAMES, ...featureFamilies.flatMap(name => HISTORY_FAMILIES[name].total)];
  const marginNames = [...MARGIN_BASE_NAMES, ...featureFamilies.flatMap(name => HISTORY_FAMILIES[name].margin)];
  const totalHead = fitTotalHead(featureRows, targetTotals, ridgeLambda, totalNames);
  const marginHead = fitMarginHead(featureRows, targetMargins, ridgeLambda, marginNames);
  const freezeStatistics = statistics => Object.freeze(Object.fromEntries(
    Object.entries(statistics).map(([name, value]) => [name, Object.freeze({ ...value })]),
  ));
  return deepFreeze({
    format: CANDIDATE10_FORMAT,
    version: CANDIDATE10_VERSION,
    status: CANDIDATE10_STATUS,
    algorithm: 'two-head-standardized-ridge; symmetric-total; home-court-intercept-plus-antisymmetric-team-margin; coherent-score-reconstruction',
    ridgeLambda,
    featureFamilies: [...featureFamilies],
    fitRowCount: fitRows.length,
    fitSeasonStartYears: [...seasons].sort((a, b) => a - b),
    totalHead: { ...totalHead, coefficients: [...totalHead.coefficients], featureNames: [...totalHead.featureNames], fitStatistics: freezeStatistics(totalHead.fitStatistics) },
    marginHead: { ...marginHead, coefficients: [...marginHead.coefficients], featureNames: [...marginHead.featureNames], fitStatistics: freezeStatistics(marginHead.fitStatistics) },
    fitTargetSummary: {
      totalMean: targetTotals.reduce((sum, value) => sum + value, 0) / targetTotals.length,
      marginMean: targetMargins.reduce((sum, value) => sum + value, 0) / targetMargins.length,
      totalMin: Math.min(...targetTotals),
      totalMax: Math.max(...targetTotals),
      marginMin: Math.min(...targetMargins),
      marginMax: Math.max(...targetMargins),
    },
    trainingUse: {
      featureStatisticsFitRowsOnly: true,
      targetLabelsUsedOnlyForHeadFit: true,
      targetLabelsUsedInFeatureConstruction: false,
      tuneSetAccepted: false,
      outerSetAccepted: false,
      lambdaTunedHere: false,
      developmentOnly: true,
    },
  });
}

function multiplyRow(row, coefficients) {
  return row.reduce((sum, value, index) => sum + value * coefficients[index], 0);
}

function projectTotalHead(features, head) {
  const vector = [1];
  for (const name of head.featureNames.slice(1)) {
    const stat = head.fitStatistics[name];
    const value = features.total[name] == null ? stat.center : features.total[name];
    vector.push((value - stat.center) / stat.scale);
  }
  return multiplyRow(vector, head.coefficients);
}

function projectMarginHead(features, head) {
  const vector = [1, ...head.featureNames.slice(1).map(name => features.margin[name] / head.fitStatistics[name].scale)];
  return multiplyRow(vector, head.coefficients);
}

/** Predicts a coherent home/away score pair from inputFeatures only. */
export function predictCandidate10Score(options = {}) {
  assertOnlyKeys(options, PREDICT_CONFIG_KEYS, 'Candidate-10 prediction request');
  requireFields(options, ['model', 'inputFeatures'], 'Candidate-10 prediction request');
  const { model, inputFeatures } = options;
  if (!isObject(model) || model.format !== CANDIDATE10_FORMAT || model.version !== CANDIDATE10_VERSION
      || !model.totalHead || !model.marginHead || !isObject(inputFeatures)) {
    fail('model-or-input-invalid', 'Candidate-10 prediction requires a fitted Candidate-10 model and a V4 inputFeatures object.');
  }
  const features = buildCandidate10Features(inputFeatures);
  const totalUnbounded = projectTotalHead(features, model.totalHead);
  const marginUnbounded = projectMarginHead(features, model.marginHead);
  const total = Math.max(0, Math.min(600, totalUnbounded));
  const margin = Math.max(-total, Math.min(total, marginUnbounded));
  const homeScore = (total + margin) / 2;
  const awayScore = (total - margin) / 2;
  return deepFreeze({
    format: 'djhc-swishiq-v4-candidate10-score-prediction-v1',
    status: CANDIDATE10_STATUS,
    total,
    margin,
    homeScore,
    awayScore,
    raw: { total: totalUnbounded, margin: marginUnbounded },
    coherence: {
      scoreSumEqualsTotal: Math.abs(homeScore + awayScore - total) <= EPSILON,
      scoreDifferenceEqualsMargin: Math.abs(homeScore - awayScore - margin) <= EPSILON,
      scoresNonnegative: homeScore >= 0 && awayScore >= 0,
      totalClippedToRange: total !== totalUnbounded,
      marginClippedToTotal: margin !== marginUnbounded,
    },
    featureLineage: {
      ...features.featureLineage,
      modelVersion: model.version,
      ridgeLambda: model.ridgeLambda,
      fitRowCount: model.fitRowCount,
      fitStatisticsSource: 'fit rows only',
      totalFeatureNames: [...model.totalHead.featureNames],
      marginFeatureNames: [...model.marginHead.featureNames],
      totalFeaturesAreSideSwapInvariant: true,
      marginTeamFeaturesAreSideSwapAntisymmetric: true,
      leagueHomeMarginRemainsAttachedToHomeRole: model.featureFamilies.includes('environment'),
      homeCourtInterceptRemainsAttachedToHomeRole: true,
      fittedHomeCourtMargin: model.marginHead.intercept,
    },
  });
}

export const CANDIDATE10_CONTRACT = Object.freeze({
  inputContract: 'V4 values.inputFeatures only',
  additionalInputNamespace: 'historicalContext: swishiq-game-prior-history-context-v1',
  availableHistoricalFeatureFamilies: HISTORY_FAMILIES,
  supportedPhase: 'regular',
  temporalRequirements: Object.freeze(['temporalUse.role=feature', 'canonical UTC temporalUse.asOf', 'valid observedThrough strictly before asOf']),
  historyRequirements: Object.freeze(['unique priorGameRefs matching windowGameCount', 'windowGameCount=min(10, priorGameCount)', 'cold-start nulls consistent with historyStatus']),
  differenceValidation: 'Recompute all five home-minus-away fields with null propagation; verify side point differential equals PF minus PA.',
  symmetricTotalBasis: TOTAL_BASE_NAMES,
  antisymmetricMarginBasis: MARGIN_BASE_NAMES,
  omittedRedundantInputs: Object.freeze(['side pointDifferentialPerGameLast10 as a separate model column', 'homeAwayDifference numeric fields as additional model columns', 'backToBack as a separate model column']),
  coldStartPolicy: 'Fit-row mean imputation and scaling for total head, with symmetric side-missingness shares as explicit features; margin numeric contrasts are zero when either side value is missing and retain only antisymmetric missingness contrasts.',
  antisymmetricMarginHead: 'Zero-center fit-row RMS scaling for team contrasts plus an unpenalized fitted home-court intercept in home-minus-away orientation. Swapping team identities reverses team contrasts while retaining the home venue effect.',
  asOfScheduleCheck: 'Unresolved at this API boundary: inputFeatures does not carry scheduledAtUtc, so the caller must compare asOf with schedule tip and establish source evidence.',
  predictiveValidationStatus: 'not-run',
  productionApprovalStatus: 'not-approved',
});

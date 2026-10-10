/* V4 validates only declared selected predictors; omitted unselected source fields never become invented zeros. Full-feature equations remain unchanged. */
/*
 * Candidate 57: joint Candidate 51 / edited outside-model feature basis.
 *
 * Candidate 51's retained team/boxscore/player/venue/schedule/rotation inputs
 * are joined to the edited Pass-6 inputs. Both heads are refit jointly using
 * weighted ridge. This is a new model, not unchanged Candidate 51 equations.
 * Original Candidate 51 calibrated rotation outputs are evaluated separately
 * by the forecast-blend experiment. Production models are not altered.
 */

export const CANDIDATE57_FORMAT = 'swishiq-v4-game-lab-candidate57-hybrid-v4';
export const CANDIDATE57_VERSION = 'swishiq-v4-game-lab-candidate57-c51-pass6-hybrid-v4';
export const CANDIDATE57_STATUS = 'research-hybrid-development-only';
export const CANDIDATE57_RIDGE_LAMBDA = 8;
export const CANDIDATE57_DECAY_HALF_LIFE_DAYS = 270;
export const CANDIDATE57_RESIDUAL_WINDOW = 1000;
export const CANDIDATE57_RESIDUAL_DRAWS = 300;
export const CANDIDATE57_RESIDUAL_STRATA_MINIMUM = 100;

// The full union has 51 total and 47 margin predictors plus two intercepts.
// Prefixes preserve distinct definitions even when predictors are correlated.
export const CANDIDATE57_TOTAL_FEATURE_NAMES = Object.freeze([
  "c51:meanPointsForLast10",
  "c51:meanPointsAgainstLast10",
  "c51:meanWinRateLast10",
  "c51:meanRestDays",
  "c51:meanGamesLast7Days",
  "c51:meanPointsFor20Shrunk",
  "c51:meanPointsAgainst20Shrunk",
  "c51:meanAdjustedOffense",
  "c51:meanAdjustedDefenseAllowance",
  "c51:meanBoxscoreThreePointAttemptRate20",
  "c51:meanBoxscoreThreePointPct20",
  "c51:meanBoxscoreOpponentThreePointAttemptRate20",
  "c51:meanBoxscoreOpponentThreePointPct20",
  "c51:meanBoxscoreTwoPointPct20",
  "c51:meanBoxscoreOpponentTwoPointPct20",
  "c51:meanBoxscoreAssistPerMadeFieldGoal20",
  "c51:meanBoxscoreOpponentAssistPerMadeFieldGoal20",
  "c51:meanBoxscoreStealsPer100Possessions20",
  "c51:meanBoxscoreOpponentStealsPer100Possessions20",
  "c51:meanBoxscoreBlocksPer100OpponentPossessions20",
  "c51:meanBoxscoreOpponentBlocksPer100OpponentPossessions20",
  "c51:meanBoxscorePersonalFoulsPer100Possessions20",
  "c51:meanBoxscoreOpponentPersonalFoulsPer100Possessions20",
  "c51:meanTopScorerPointsShare20",
  "c51:meanTopUsagePlayerLoadShare20",
  "c51:meanTopThreeUsagePlayersTrueShooting20",
  "c51:meanVenueOffenseDeviation10",
  "c51:meanVenueDefenseAllowanceDeviation10",
  "c51:meanVenueOffenseDeviation20",
  "c51:meanVenueDefenseAllowanceDeviation20",
  "c51:meanBackToBackPressure",
  "c51:meanThreeInFourPressure",
  "c51:meanFourInSixPressure",
  "c51:meanFiveInSevenPressure",
  "c51:meanActivePlayerCount5",
  "c51:meanMinuteShareHhi5",
  "c51:meanActivePlayerOverlap5",
  "c51:meanStarterOverlap5",
  "c51:meanMinuteShareOverlap5",
  "pass6:hp10",
  "pass6:ap10",
  "pass6:hpa10",
  "pass6:apa10",
  "pass6:hp20",
  "pass6:ap20",
  "pass6:hpa20",
  "pass6:apa20",
  "pass6:restMean",
  "pass6:g7Mean",
  "pass6:etMean",
  "pass6:venueTotMean"
]);
export const CANDIDATE57_MARGIN_FEATURE_NAMES = Object.freeze([
  "c51:pointsForAdvantageLast10",
  "c51:defenseAllowanceAdvantageLast10",
  "c51:winRateAdvantageLast10",
  "c51:restAdvantageDays",
  "c51:scheduleDensityAdvantageLast7",
  "c51:pointsForAdvantage20Shrunk",
  "c51:defenseAllowanceAdvantage20Shrunk",
  "c51:opponentAdjustedStrengthAdvantage",
  "c51:boxscoreThreePointAttemptRateAdvantage20",
  "c51:boxscoreThreePointMatchupAdvantage20",
  "c51:boxscoreTwoPointMatchupAdvantage20",
  "c51:boxscoreAssistRateAdvantage20",
  "c51:boxscoreStealsRateAdvantage20",
  "c51:boxscoreBlocksRateAdvantage20",
  "c51:boxscorePersonalFoulsAvoidedAdvantage20",
  "c51:topScorerPointsShareAdvantage20",
  "c51:topUsagePlayerLoadShareAdvantage20",
  "c51:topThreeUsagePlayersTrueShootingAdvantage20",
  "c51:venueOffenseDeviationAdvantage10",
  "c51:venueDefenseAllowanceAdvantage10",
  "c51:venueOffenseDeviationAdvantage20",
  "c51:venueDefenseAllowanceAdvantage20",
  "c51:backToBackPressureAdvantage",
  "c51:threeInFourPressureAdvantage",
  "c51:fourInSixPressureAdvantage",
  "c51:fiveInSevenPressureAdvantage",
  "c51:adjustedOffenseAdvantage",
  "c51:activePlayerCountAdvantage5",
  "c51:minuteShareHhiAdvantage5",
  "c51:activePlayerOverlapAdvantage5",
  "c51:starterOverlapAdvantage5",
  "c51:minuteShareOverlapAdvantage5",
  "pass6:pfAdv10",
  "pass6:defAdv10",
  "pass6:wrAdv10",
  "pass6:pfAdv20",
  "pass6:defAdv20",
  "pass6:wrAdv20",
  "pass6:restAdv",
  "pass6:g7Adv",
  "pass6:rStrAdv90",
  "pass6:eloAdv",
  "pass6:venueAdv",
  "pass6:availAdv5",
  "pass6:availAdv8",
  "pass6:missAdv10",
  "pass6:minTop5Adv"
]);

const EPSILON = 1e-12;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function fail(message) { throw new TypeError(message); }

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeExperimentalFeatureNames(value) {
  if (value == null) return { total: [], margin: [] };
  if (!isPlainRecord(value) || Object.keys(value).some(key => !['total', 'margin'].includes(key))) {
    fail('Candidate 57 experimental feature names must be a total/margin record.');
  }
  const result = {};
  for (const head of ['total', 'margin']) {
    const names = value[head] ?? [];
    if (!Array.isArray(names) || names.some(name => typeof name !== 'string'
      || !/^[a-z][a-z0-9-]*:[A-Za-z0-9_.:-]+$/.test(name))) {
      fail(`Candidate 57 experimental ${head} feature names are invalid.`);
    }
    if (new Set(names).size !== names.length) fail(`Candidate 57 experimental ${head} feature names repeat.`);
    const builtIn = head === 'total' ? CANDIDATE57_TOTAL_FEATURE_NAMES : CANDIDATE57_MARGIN_FEATURE_NAMES;
    if (names.some(name => builtIn.includes(name))) fail(`Candidate 57 experimental ${head} feature duplicates a built-in name.`);
    result[head] = [...names];
  }
  return result;
}

function allowedFeatureNames(head, experimentalFeatureNames = null) {
  const builtIn = head === 'total' ? CANDIDATE57_TOTAL_FEATURE_NAMES : CANDIDATE57_MARGIN_FEATURE_NAMES;
  const experimental = normalizeExperimentalFeatureNames(experimentalFeatureNames)[head];
  return [...builtIn, ...experimental];
}

function standardizationAllowedFeatureNames(standardization, head) {
  return allowedFeatureNames(head, standardization?.experimentalFeatureNames ?? null);
}

function featureNamesOrDefault(value, allowed, label) {
  const names = value == null ? [...allowed] : [...value];
  if (!names.length || names.some(name => !allowed.includes(name)) || new Set(names).size !== names.length) {
    fail(`Candidate 57 ${label} feature-name selection is invalid.`);
  }
  return names;
}

function validateFeatureObject(features, totalNames = CANDIDATE57_TOTAL_FEATURE_NAMES, marginNames = CANDIDATE57_MARGIN_FEATURE_NAMES) {
  if (!features || typeof features !== 'object' || !features.total || !features.margin) {
    fail('Candidate 57 features require total and margin objects.');
  }
  for (const name of totalNames) {
    if (features.total[name] !== null && !finite(features.total[name])) fail(`Candidate 57 total feature ${name} must be finite or an explicit null.`);
  }
  for (const name of marginNames) {
    if (!finite(features.margin[name])) fail(`Candidate 57 margin feature ${name} must be finite.`);
  }
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (!finite(rows[pivot][column]) || Math.abs(rows[pivot][column]) < EPSILON) {
      fail(`Candidate 57 ridge system is singular at column ${column}.`);
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

function emptyNormalEquations(width) {
  return {
    gram: Array.from({ length: width }, () => Array(width).fill(0)),
    cross: Array(width).fill(0),
    weight: 0,
    observations: 0,
  };
}

function addObservation(equations, vector, target, weight) {
  if (!Array.isArray(vector) || vector.some(value => !finite(value)) || !finite(target) || !finite(weight) || weight <= 0) {
    fail('Candidate 57 normal-equation observation must be finite and positively weighted.');
  }
  for (let row = 0; row < vector.length; row += 1) {
    equations.cross[row] += weight * vector[row] * target;
    for (let column = 0; column < vector.length; column += 1) {
      equations.gram[row][column] += weight * vector[row] * vector[column];
    }
  }
  equations.weight += weight;
  equations.observations += 1;
}

function validateStats(stats, names, mode) {
  if (!stats || typeof stats !== 'object') fail(`Candidate 57 ${mode} standardization statistics are required.`);
  for (const name of names) {
    const row = stats[name];
    if (!row || !finite(row.center) || !finite(row.scale) || row.scale <= 0) {
      fail(`Candidate 57 ${mode} standardization for ${name} is invalid.`);
    }
  }
}

function makeStats(rows, names, mode) {
  if (!rows.length) fail(`Candidate 57 ${mode} standardization needs at least one row.`);
  const stats = {};
  for (const name of names) {
    const values = rows.map(row => {
      validateFeatureObject(row.features, mode === 'total' ? names : [], mode === 'margin' ? names : []);
      return row.features[mode][name];
    }).filter(finite);
    if (!values.length) fail(`Candidate 57 ${mode} ${name} has no observed warmup values.`);
    if (mode === 'total') {
      const center = mean(values);
      const variance = mean(values.map(value => (value - center) ** 2));
      stats[name] = { center, scale: Math.sqrt(variance) || 1, observedCount: values.length };
    } else {
      // The handoff explicitly scales margin predictors by RMS, not by a
      // centered standard deviation.
      const rms = Math.sqrt(mean(values.map(value => value ** 2))) || 1;
      stats[name] = { center: 0, scale: rms, observedCount: values.length };
    }
  }
  return Object.freeze(stats);
}

export function buildCandidate57Standardization({ warmupRows, totalFeatureNames, marginFeatureNames,
  experimentalFeatureNames = null } = {}) {
  if (!Array.isArray(warmupRows) || !warmupRows.length) fail('Candidate 57 warmupRows must be a nonempty array.');
  const normalizedExperimental = normalizeExperimentalFeatureNames(experimentalFeatureNames);
  const selectedTotal = featureNamesOrDefault(totalFeatureNames, allowedFeatureNames('total', normalizedExperimental), 'total');
  const selectedMargin = featureNamesOrDefault(marginFeatureNames, allowedFeatureNames('margin', normalizedExperimental), 'margin');
  const result = {
    total: makeStats(warmupRows, selectedTotal, 'total'),
    margin: makeStats(warmupRows, selectedMargin, 'margin'),
    totalFeatureNames: Object.freeze(selectedTotal),
    marginFeatureNames: Object.freeze(selectedMargin),
    source: 'warmup rows supplied by caller; total centered mean/SD and margin RMS',
  };
  if (normalizedExperimental.total.length || normalizedExperimental.margin.length) {
    result.experimentalFeatureNames = Object.freeze({
      total: Object.freeze(normalizedExperimental.total),
      margin: Object.freeze(normalizedExperimental.margin),
    });
  }
  return Object.freeze(result);
}

export function buildCandidate57Design({ features, standardization } = {}) {
  const totalNames = featureNamesOrDefault(standardization?.totalFeatureNames, standardizationAllowedFeatureNames(standardization, 'total'), 'total');
  const marginNames = featureNamesOrDefault(standardization?.marginFeatureNames, standardizationAllowedFeatureNames(standardization, 'margin'), 'margin');
  validateFeatureObject(features, totalNames, marginNames);
  validateStats(standardization?.total, totalNames, 'total');
  validateStats(standardization?.margin, marginNames, 'margin');
  const total = [1, ...totalNames.map(name =>
    ((features.total[name] ?? standardization.total[name].center) - standardization.total[name].center) / standardization.total[name].scale)];
  const margin = [1, ...marginNames.map(name =>
    features.margin[name] / standardization.margin[name].scale)];
  return { total, margin };
}

function solveRidge(gram, cross, ridgeLambda) {
  if (!Array.isArray(gram) || !Array.isArray(cross) || gram.length !== cross.length || !finite(ridgeLambda) || ridgeLambda <= 0) {
    fail('Candidate 57 ridge normal equations are invalid.');
  }
  const regularized = gram.map((row, index) => row.map((value, column) => {
    if (!finite(value)) fail('Candidate 57 ridge normal equations contain a non-finite value.');
    return value + (index === column && index !== 0 ? ridgeLambda : 0);
  }));
  return solveLinearSystem(regularized, cross);
}

export function fitCandidate57FromNormalEquations({ total, margin, standardization, ridgeLambda = CANDIDATE57_RIDGE_LAMBDA,
  totalRidgeLambda = ridgeLambda, marginRidgeLambda = ridgeLambda } = {}) {
  const totalNames = featureNamesOrDefault(standardization?.totalFeatureNames, standardizationAllowedFeatureNames(standardization, 'total'), 'total');
  const marginNames = featureNamesOrDefault(standardization?.marginFeatureNames, standardizationAllowedFeatureNames(standardization, 'margin'), 'margin');
  validateStats(standardization?.total, totalNames, 'total');
  validateStats(standardization?.margin, marginNames, 'margin');
  const totalCoefficients = solveRidge(total.gram, total.cross, totalRidgeLambda);
  const marginCoefficients = solveRidge(margin.gram, margin.cross, marginRidgeLambda);
  return Object.freeze({
    format: CANDIDATE57_FORMAT,
    version: CANDIDATE57_VERSION,
    status: CANDIDATE57_STATUS,
    algorithm: 'two-head-standardized-ridge; decayed normal equations; unpenalized intercepts',
    ridgeLambda,
    totalRidgeLambda, marginRidgeLambda,
    totalHead: Object.freeze({
      featureNames: Object.freeze(['intercept', ...totalNames]),
      coefficients: Object.freeze([...totalCoefficients]),
      standardization: standardization.total,
      observations: total.observations,
      effectiveWeight: total.weight,
    }),
    marginHead: Object.freeze({
      featureNames: Object.freeze(['intercept', ...marginNames]),
      coefficients: Object.freeze([...marginCoefficients]),
      standardization: standardization.margin,
      observations: margin.observations,
      effectiveWeight: margin.weight,
    }),
    standardization,
    solverAudit: {
      totalRelativeEquationError: equationError(total, totalCoefficients, totalRidgeLambda),
      marginRelativeEquationError: equationError(margin, marginCoefficients, marginRidgeLambda),
    },
  });
}

function equationError(equations, coefficients, ridgeLambda) {
  const errors = equations.cross.map((expected, index) => {
    const actual = equations.gram[index].reduce((sum, value, column) => sum + value * coefficients[column], 0)
      + (index ? ridgeLambda * coefficients[index] : 0);
    return Math.abs(actual - expected);
  });
  const relative = Math.max(...errors) / Math.max(1, ...equations.cross.map(Math.abs));
  if (!finite(relative) || relative > 1e-8) fail(`Candidate 57 ridge solver residual too large: ${relative}`);
  return relative;
}

// Full paired empirical support preserves the supplied probability equation.
// Official CRPS is evaluated exactly rather than approximated with 300 draws.
export function buildCandidate57Distribution({ prediction, residualPool, targetDate,
  residualWindowGames = 1000, regimeThreshold = 6, poolMode = 'stratified',
  totalResidualScale = 1, marginResidualScale = 1 } = {}) {
  if (!prediction || !finite(prediction.total) || !finite(prediction.margin)
      || !Array.isArray(residualPool) || !residualPool.length || !targetDate) {
    fail('Candidate 57 distribution needs a prediction, prior residuals, and target date.');
  }
  if (!Number.isSafeInteger(residualWindowGames) || residualWindowGames < 100 || residualWindowGames > 5000
      || !finite(regimeThreshold) || regimeThreshold <= 0 || !['stratified', 'full'].includes(poolMode)
      || !finite(totalResidualScale) || totalResidualScale <= 0 || !finite(marginResidualScale) || marginResidualScale <= 0) {
    fail('Candidate 57 residual-distribution settings are invalid.');
  }
  const window = residualPool.slice(-residualWindowGames);
  if (window.some(row => !row.gameDateLocal || row.gameDateLocal >= targetDate
      || !finite(row.total) || !finite(row.margin) || !finite(row.predictedMargin))) {
    fail('Candidate 57 residuals must be finite and strictly earlier than target date.');
  }
  const regime = Math.abs(prediction.margin) < regimeThreshold ? 'close' : 'blowout';
  const matching = poolMode === 'full' ? window : window.filter(row => (Math.abs(row.predictedMargin) < regimeThreshold ? 'close' : 'blowout') === regime);
  const fallback = matching.length < CANDIDATE57_RESIDUAL_STRATA_MINIMUM;
  const selected = fallback ? window : matching;
  const totalCenter = mean(selected.map(row => row.total));
  const marginCenter = mean(selected.map(row => row.margin));
  const pairs = selected.map(row => {
    const total = prediction.total + totalResidualScale * (row.total - totalCenter);
    const margin = prediction.margin + marginResidualScale * (row.margin - marginCenter);
    return { total, margin, home: (total + margin) / 2, away: (total - margin) / 2 };
  });
  const distribution = field => {
    const counts = new Map();
    for (const pair of pairs) counts.set(pair[field], (counts.get(pair[field]) || 0) + 1);
    const support = [...counts].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, probability: count / pairs.length }));
    return { mean: mean(pairs.map(pair => pair[field])), support };
  };
  return {
    home: distribution('home'), away: distribution('away'), margin: distribution('margin'),
    homeWinProbability: mean(pairs.map(pair => Number(pair.margin > 0))),
    tieProbability: mean(pairs.map(pair => Number(pair.margin === 0))),
    residualPoolCount: selected.length, residualDrawCount: selected.length,
    stratumEligibleCount: matching.length, regime, poolSelection: poolMode === 'full' ? 'full-window' : fallback ? 'full-window-fallback' : regime,
    settings: { residualWindowGames, regimeThreshold, poolMode, totalResidualScale, marginResidualScale },
    residualObservedThrough: window.map(row => row.gameDateLocal).sort().at(-1),
    coherence: { winProbabilityUsesSameScorePairWeights: true, probabilityUsesFullCenteredEmpiricalMargin: true },
  };
}

export function fitCandidate57Heads({ rows, warmupRows, standardization, ridgeLambda = CANDIDATE57_RIDGE_LAMBDA,
  weights, experimentalFeatureNames = null } = {}) {
  if (!Array.isArray(rows) || !rows.length) fail('Candidate 57 fit rows must be nonempty.');
  const stats = standardization || buildCandidate57Standardization({ warmupRows: warmupRows || rows, experimentalFeatureNames });
  const totalNames = featureNamesOrDefault(stats.totalFeatureNames, standardizationAllowedFeatureNames(stats, 'total'), 'total');
  const marginNames = featureNamesOrDefault(stats.marginFeatureNames, standardizationAllowedFeatureNames(stats, 'margin'), 'margin');
  const total = emptyNormalEquations(totalNames.length + 1);
  const margin = emptyNormalEquations(marginNames.length + 1);
  rows.forEach((row, index) => {
    validateFeatureObject(row.features);
    const design = buildCandidate57Design({ features: row.features, standardization: stats });
    const weight = weights?.[index] ?? row.weight ?? 1;
    const targetTotal = row.target?.total ?? row.target?.homeScore + row.target?.awayScore;
    const targetMargin = row.target?.margin ?? row.target?.homeScore - row.target?.awayScore;
    addObservation(total, design.total, targetTotal, weight);
    addObservation(margin, design.margin, targetMargin, weight);
  });
  return fitCandidate57FromNormalEquations({ total, margin, standardization: stats, ridgeLambda });
}

export function predictCandidate57Score({ model, features } = {}) {
  if (!model || model.version !== CANDIDATE57_VERSION) fail('Candidate 57 model version is invalid.');
  const design = buildCandidate57Design({ features, standardization: model.standardization });
  const dot = (coefficients, vector) => coefficients.reduce((sum, coefficient, index) => sum + coefficient * vector[index], 0);
  const total = dot(model.totalHead.coefficients, design.total);
  const margin = dot(model.marginHead.coefficients, design.margin);
  if (!finite(total) || !finite(margin)) fail('Candidate 57 prediction is non-finite.');
  return Object.freeze({
    total,
    margin,
    homeScore: (total + margin) / 2,
    awayScore: (total - margin) / 2,
    design,
    modelVersion: CANDIDATE57_VERSION,
  });
}

export const CANDIDATE57_CONTRACT = Object.freeze({
  format: CANDIDATE57_FORMAT,
  version: CANDIDATE57_VERSION,
  status: CANDIDATE57_STATUS,
  totalPredictors: [...CANDIDATE57_TOTAL_FEATURE_NAMES],
  marginPredictors: [...CANDIDATE57_MARGIN_FEATURE_NAMES],
  actualTotalDesignColumns: CANDIDATE57_TOTAL_FEATURE_NAMES.length + 1,
  actualMarginDesignColumns: CANDIDATE57_MARGIN_FEATURE_NAMES.length + 1,
  ridgeLambda: CANDIDATE57_RIDGE_LAMBDA,
  decayHalfLifeDays: CANDIDATE57_DECAY_HALF_LIFE_DAYS,
  residualWindowGames: CANDIDATE57_RESIDUAL_WINDOW,
  residualDrawLimit: CANDIDATE57_RESIDUAL_WINDOW,
  outsideApproximationDrawLimit: CANDIDATE57_RESIDUAL_DRAWS,
  probability: 'empirical residual pool; close/blowout strata; pool mean centered; probScale=1',
  chronology: 'features and residuals are observed only through dates strictly before each target local date',
});

/*
 * Pass-6 scratch champion reimplementation.
 *
 * This module is a local, reproducible reimplementation of the equations in
 * the 2026-10-07 outside handoff.  It is deliberately not presented as the
 * outside source's executable model: that source code and its fitted state
 * were not supplied.  The runner that consumes this module is research-only.
 */

export const PASS6_FORMAT = 'swishiq-v4-game-lab-pass6-scratch-challenger-v2';
export const PASS6_VERSION = 'swishiq-v4-game-lab-pass6-scratch-reimplementation-v2';
export const PASS6_STATUS = 'research-reimplementation-not-external-source';
export const PASS6_RIDGE_LAMBDA = 8;
export const PASS6_DECAY_HALF_LIFE_DAYS = 270;
export const PASS6_RESIDUAL_WINDOW = 1000;
export const PASS6_RESIDUAL_DRAWS = 300;
export const PASS6_RESIDUAL_STRATA_MINIMUM = 100;

// The handoff text says “12 columns including the intercept” but lists twelve
// named total predictors.  We preserve every listed predictor, so the actual
// total design is 13 columns including its intercept.  The margin list has 20
// named predictors and therefore 21 design columns including its intercept.
export const PASS6_TOTAL_FEATURE_NAMES = Object.freeze([
  'hp10', 'ap10', 'hpa10', 'apa10',
  'hp20', 'ap20', 'hpa20', 'apa20',
  'restMean', 'g7Mean', 'etMean', 'venueTotMean',
]);
export const PASS6_MARGIN_FEATURE_NAMES = Object.freeze([
  'pfAdv10', 'defAdv10', 'wrAdv10',
  'pfAdv20', 'defAdv20', 'wrAdv20',
  'pfAdv5', 'defAdv5',
  'restAdv', 'g7Adv', 'strAdv', 'rStrAdv90', 'emAdv',
  'eloAdv', 'eloAdv_12h50m', 'venueAdv',
  'availAdv5', 'availAdv8', 'missAdv10', 'minTop5Adv',
]);

const EPSILON = 1e-12;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function fail(message) { throw new TypeError(message); }

function featureNamesOrDefault(value, allowed, label) {
  const names = value == null ? [...allowed] : [...value];
  if (!names.length || names.some(name => !allowed.includes(name)) || new Set(names).size !== names.length) {
    fail(`Pass-6 ${label} feature-name selection is invalid.`);
  }
  return names;
}

function validateFeatureObject(features) {
  if (!features || typeof features !== 'object' || !features.total || !features.margin) {
    fail('Pass-6 features require total and margin objects.');
  }
  for (const name of PASS6_TOTAL_FEATURE_NAMES) {
    if (!finite(features.total[name])) fail(`Pass-6 total feature ${name} must be finite.`);
  }
  for (const name of PASS6_MARGIN_FEATURE_NAMES) {
    if (!finite(features.margin[name])) fail(`Pass-6 margin feature ${name} must be finite.`);
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
      fail(`Pass-6 ridge system is singular at column ${column}.`);
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
    fail('Pass-6 normal-equation observation must be finite and positively weighted.');
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
  if (!stats || typeof stats !== 'object') fail(`Pass-6 ${mode} standardization statistics are required.`);
  for (const name of names) {
    const row = stats[name];
    if (!row || !finite(row.center) || !finite(row.scale) || row.scale <= 0) {
      fail(`Pass-6 ${mode} standardization for ${name} is invalid.`);
    }
  }
}

function makeStats(rows, names, mode) {
  if (!rows.length) fail(`Pass-6 ${mode} standardization needs at least one row.`);
  const stats = {};
  for (const name of names) {
    const values = rows.map(row => {
      validateFeatureObject(row.features);
      return row.features[mode][name];
    });
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

export function buildPass6Standardization({ warmupRows, totalFeatureNames, marginFeatureNames } = {}) {
  if (!Array.isArray(warmupRows) || !warmupRows.length) fail('Pass-6 warmupRows must be a nonempty array.');
  const selectedTotal = featureNamesOrDefault(totalFeatureNames, PASS6_TOTAL_FEATURE_NAMES, 'total');
  const selectedMargin = featureNamesOrDefault(marginFeatureNames, PASS6_MARGIN_FEATURE_NAMES, 'margin');
  return Object.freeze({
    total: makeStats(warmupRows, selectedTotal, 'total'),
    margin: makeStats(warmupRows, selectedMargin, 'margin'),
    totalFeatureNames: Object.freeze(selectedTotal),
    marginFeatureNames: Object.freeze(selectedMargin),
    source: 'warmup rows supplied by caller; total centered mean/SD and margin RMS',
  });
}

export function buildPass6Design({ features, standardization } = {}) {
  validateFeatureObject(features);
  const totalNames = featureNamesOrDefault(standardization?.totalFeatureNames, PASS6_TOTAL_FEATURE_NAMES, 'total');
  const marginNames = featureNamesOrDefault(standardization?.marginFeatureNames, PASS6_MARGIN_FEATURE_NAMES, 'margin');
  validateStats(standardization?.total, totalNames, 'total');
  validateStats(standardization?.margin, marginNames, 'margin');
  const total = [1, ...totalNames.map(name =>
    (features.total[name] - standardization.total[name].center) / standardization.total[name].scale)];
  const margin = [1, ...marginNames.map(name =>
    features.margin[name] / standardization.margin[name].scale)];
  return { total, margin };
}

function solveRidge(gram, cross, ridgeLambda) {
  if (!Array.isArray(gram) || !Array.isArray(cross) || gram.length !== cross.length || !finite(ridgeLambda) || ridgeLambda <= 0) {
    fail('Pass-6 ridge normal equations are invalid.');
  }
  const regularized = gram.map((row, index) => row.map((value, column) => {
    if (!finite(value)) fail('Pass-6 ridge normal equations contain a non-finite value.');
    return value + (index === column && index !== 0 ? ridgeLambda : 0);
  }));
  return solveLinearSystem(regularized, cross);
}

export function fitPass6FromNormalEquations({ total, margin, standardization, ridgeLambda = PASS6_RIDGE_LAMBDA } = {}) {
  const totalNames = featureNamesOrDefault(standardization?.totalFeatureNames, PASS6_TOTAL_FEATURE_NAMES, 'total');
  const marginNames = featureNamesOrDefault(standardization?.marginFeatureNames, PASS6_MARGIN_FEATURE_NAMES, 'margin');
  validateStats(standardization?.total, totalNames, 'total');
  validateStats(standardization?.margin, marginNames, 'margin');
  const totalCoefficients = solveRidge(total.gram, total.cross, ridgeLambda);
  const marginCoefficients = solveRidge(margin.gram, margin.cross, ridgeLambda);
  return Object.freeze({
    format: PASS6_FORMAT,
    version: PASS6_VERSION,
    status: PASS6_STATUS,
    algorithm: 'two-head-standardized-ridge; decayed normal equations; unpenalized intercepts',
    ridgeLambda,
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
      totalRelativeEquationError: equationError(total, totalCoefficients, ridgeLambda),
      marginRelativeEquationError: equationError(margin, marginCoefficients, ridgeLambda),
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
  if (!finite(relative) || relative > 1e-8) fail(`Pass-6 ridge solver residual too large: ${relative}`);
  return relative;
}

// Full paired empirical support preserves the supplied probability equation.
// Official CRPS is evaluated exactly rather than approximated with 300 draws.
export function buildPass6Distribution({ prediction, residualPool, targetDate } = {}) {
  if (!prediction || !finite(prediction.total) || !finite(prediction.margin)
      || !Array.isArray(residualPool) || !residualPool.length || !targetDate) {
    fail('Pass-6 distribution needs a prediction, prior residuals, and target date.');
  }
  const window = residualPool.slice(-PASS6_RESIDUAL_WINDOW);
  if (window.some(row => !row.gameDateLocal || row.gameDateLocal >= targetDate
      || !finite(row.total) || !finite(row.margin) || !finite(row.predictedMargin))) {
    fail('Pass-6 residuals must be finite and strictly earlier than target date.');
  }
  const regime = Math.abs(prediction.margin) < 6 ? 'close' : 'blowout';
  const matching = window.filter(row => (Math.abs(row.predictedMargin) < 6 ? 'close' : 'blowout') === regime);
  const fallback = matching.length < PASS6_RESIDUAL_STRATA_MINIMUM;
  const selected = fallback ? window : matching;
  const totalCenter = mean(selected.map(row => row.total));
  const marginCenter = mean(selected.map(row => row.margin));
  const pairs = selected.map(row => {
    const total = prediction.total + row.total - totalCenter;
    const margin = prediction.margin + row.margin - marginCenter;
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
    stratumEligibleCount: matching.length, regime, poolSelection: fallback ? 'full-window-fallback' : regime,
    residualObservedThrough: window.map(row => row.gameDateLocal).sort().at(-1),
    coherence: { winProbabilityUsesSameScorePairWeights: true, probabilityUsesFullCenteredEmpiricalMargin: true },
  };
}

export function fitPass6Heads({ rows, warmupRows, standardization, ridgeLambda = PASS6_RIDGE_LAMBDA, weights } = {}) {
  if (!Array.isArray(rows) || !rows.length) fail('Pass-6 fit rows must be nonempty.');
  const stats = standardization || buildPass6Standardization({ warmupRows: warmupRows || rows });
  const totalNames = featureNamesOrDefault(stats.totalFeatureNames, PASS6_TOTAL_FEATURE_NAMES, 'total');
  const marginNames = featureNamesOrDefault(stats.marginFeatureNames, PASS6_MARGIN_FEATURE_NAMES, 'margin');
  const total = emptyNormalEquations(totalNames.length + 1);
  const margin = emptyNormalEquations(marginNames.length + 1);
  rows.forEach((row, index) => {
    validateFeatureObject(row.features);
    const design = buildPass6Design({ features: row.features, standardization: stats });
    const weight = weights?.[index] ?? row.weight ?? 1;
    const targetTotal = row.target?.total ?? row.target?.homeScore + row.target?.awayScore;
    const targetMargin = row.target?.margin ?? row.target?.homeScore - row.target?.awayScore;
    addObservation(total, design.total, targetTotal, weight);
    addObservation(margin, design.margin, targetMargin, weight);
  });
  return fitPass6FromNormalEquations({ total, margin, standardization: stats, ridgeLambda });
}

export function predictPass6Score({ model, features } = {}) {
  if (!model || model.version !== PASS6_VERSION) fail('Pass-6 model version is invalid.');
  const design = buildPass6Design({ features, standardization: model.standardization });
  const dot = (coefficients, vector) => coefficients.reduce((sum, coefficient, index) => sum + coefficient * vector[index], 0);
  const total = dot(model.totalHead.coefficients, design.total);
  const margin = dot(model.marginHead.coefficients, design.margin);
  if (!finite(total) || !finite(margin)) fail('Pass-6 prediction is non-finite.');
  return Object.freeze({
    total,
    margin,
    homeScore: (total + margin) / 2,
    awayScore: (total - margin) / 2,
    design,
    modelVersion: PASS6_VERSION,
  });
}

export const PASS6_CONTRACT = Object.freeze({
  format: PASS6_FORMAT,
  version: PASS6_VERSION,
  status: PASS6_STATUS,
  totalPredictors: [...PASS6_TOTAL_FEATURE_NAMES],
  marginPredictors: [...PASS6_MARGIN_FEATURE_NAMES],
  actualTotalDesignColumns: PASS6_TOTAL_FEATURE_NAMES.length + 1,
  actualMarginDesignColumns: PASS6_MARGIN_FEATURE_NAMES.length + 1,
  ridgeLambda: PASS6_RIDGE_LAMBDA,
  decayHalfLifeDays: PASS6_DECAY_HALF_LIFE_DAYS,
  residualWindowGames: PASS6_RESIDUAL_WINDOW,
  residualDrawLimit: PASS6_RESIDUAL_WINDOW,
  outsideApproximationDrawLimit: PASS6_RESIDUAL_DRAWS,
  probability: 'empirical residual pool; close/blowout strata; pool mean centered; probScale=1',
  chronology: 'features and residuals are observed only through dates strictly before each target local date',
});

/*
 * Candidate10 exact empirical paired-residual distribution.
 * Score coefficients use fit rows; residuals and probability map use T-1.
 * Coherent probability calibration tilts the same score-pair weights.
 */
import { fitCandidate10ScoreModel, predictCandidate10Score } from './game-lab-native-score-model-candidate10-v3.mjs';
export const DISTRIBUTION_VERSION = 'swishiq-candidate10-exact-paired-residual-odds-tilt-v1';
const state = new WeakMap();
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
function fail(message) { throw new TypeError(message); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function objective(rows, intercept, slope) {
  return rows.reduce((sum, row) => {
    const p = Math.max(1e-12, Math.min(1 - 1e-12, sigmoid(intercept + slope * row.x)));
    return sum + (row.y ? Math.log(p) : Math.log(1 - p));
  }, -0.5 * slope * slope);
}
function logistic(rows) {
  const wins = rows.reduce((sum, row) => sum + row.y, 0);
  if (!wins || wins === rows.length) fail('Probability calibration needs both outcomes');
  let intercept = Math.log((wins + 0.5) / (rows.length - wins + 0.5));
  let slope = 0.1;
  let value = objective(rows, intercept, slope);
  let converged = false;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    let g0 = 0; let g1 = -slope; let h00 = 0; let h01 = 0; let h11 = 1;
    for (const row of rows) {
      const p = sigmoid(intercept + slope * row.x);
      const variance = p * (1 - p);
      g0 += row.y - p; g1 += (row.y - p) * row.x;
      h00 += variance; h01 += variance * row.x; h11 += variance * row.x * row.x;
    }
    const determinant = h00 * h11 - h01 * h01;
    if (!Number.isFinite(determinant) || determinant <= 1e-12) fail('Singular probability calibration');
    const d0 = (g0 * h11 - g1 * h01) / determinant;
    const d1 = (g1 * h00 - g0 * h01) / determinant;
    let accepted = false;
    for (let step = 1; step >= 1e-7; step /= 2) {
      const nextIntercept = intercept + step * d0;
      const nextSlope = Math.max(0, slope + step * d1);
      const nextValue = objective(rows, nextIntercept, nextSlope);
      if (nextValue >= value - 1e-12) {
        converged = Math.abs(nextIntercept - intercept) + Math.abs(nextSlope - slope) < 1e-9;
        intercept = nextIntercept; slope = nextSlope; value = nextValue; accepted = true;
        break;
      }
    }
    if (converged || !accepted) break;
  }
  if (!converged) fail('Probability calibration did not converge');
  return { intercept, slope, ridgeLambda: 1, converged };
}

export function fitCandidate10Distribution({ fitRows, calibrationRows, ridgeLambda = 8,
  featureFamilies = ['multi-window', 'strength'] } = {}) {
  if (!Array.isArray(fitRows) || !Array.isArray(calibrationRows) || calibrationRows.length < 20) fail('Separate fit and calibration rows required');
  const fitRefs = new Set(fitRows.map(row => row.gameRef));
  const endDate = fitRows.map(row => row.gameDateLocal).sort().at(-1);
  if (new Set(calibrationRows.map(row => row.gameRef)).size !== calibrationRows.length
      || calibrationRows.some(row => fitRefs.has(row.gameRef) || row.gameDateLocal <= endDate)) fail('Calibration must be disjoint and later than fitting');
  const base = fitCandidate10ScoreModel({ fitRows, ridgeLambda, featureFamilies });
  const pairs = calibrationRows.map(row => {
    const p = predictCandidate10Score({ model: base, inputFeatures: row.inputFeatures });
    return { gameRef: row.gameRef, home: row.target.homeScore - p.homeScore,
      away: row.target.awayScore - p.awayScore, expectedMargin: p.margin,
      win: Number(row.target.homeScore > row.target.awayScore) };
  });
  const marginCenter = mean(pairs.map(row => row.expectedMargin));
  const marginScale = Math.sqrt(mean(pairs.map(row => (row.expectedMargin - marginCenter) ** 2))) || 1;
  const probabilityMap = { ...logistic(pairs.map(row => ({ x: (row.expectedMargin - marginCenter) / marginScale, y: row.win }))),
    marginCenter, marginScale };
  const model = freeze({
    version: DISTRIBUTION_VERSION,
    status: 'development-candidate-predictive-validation-pending',
    base,
    residualPairCount: pairs.length,
    calibrationGameRefs: pairs.map(row => row.gameRef),
    calibrationDateRange: { start: calibrationRows.map(row => row.gameDateLocal).sort()[0],
      end: calibrationRows.map(row => row.gameDateLocal).sort().at(-1) },
    residualMean: { home: mean(pairs.map(row => row.home)), away: mean(pairs.map(row => row.away)) },
    probabilityMap,
    predictionMethod: 'exact empirical paired T-1 residuals; optional coherent win/loss odds tilt',
    roundingRule: 'round each score to nearest integer and clip below zero',
  });
  state.set(model, pairs);
  return model;
}

function summarize(pairs, field) {
  const mass = new Map();
  let weightSum = 0;
  for (const pair of pairs) {
    const value = field === 'margin' ? pair.home - pair.away : pair[field];
    mass.set(value, (mass.get(value) || 0) + pair.weight);
    weightSum += pair.weight;
  }
  const support = [...mass].sort((a, b) => a[0] - b[0]).map(([value, weight]) => ({ value, probability: weight / weightSum }));
  return {
    mean: support.reduce((sum, row) => sum + row.value * row.probability, 0),
    support,
  };
}

export function predictCandidate10Distribution({ model, inputFeatures, probabilityMode = 'raw' } = {}) {
  const residuals = state.get(model);
  if (!residuals || model.version !== DISTRIBUTION_VERSION) fail('A fitted distribution model is required');
  if (!['raw', 'logistic-coherent'].includes(probabilityMode)) fail('Unknown probability mode');
  const expected = predictCandidate10Score({ model: model.base, inputFeatures });
  const pairs = residuals.map(row => ({
    home: Math.max(0, Math.round(expected.homeScore + row.home)),
    away: Math.max(0, Math.round(expected.awayScore + row.away)),
    weight: 1,
  }));
  const wins = pairs.filter(row => row.home > row.away).length;
  const losses = pairs.filter(row => row.home < row.away).length;
  const ties = pairs.length - wins - losses;
  const rawProbability = (wins + ties / 2) / pairs.length;
  const map = model.probabilityMap;
  const calibrated = sigmoid(map.intercept + map.slope * (expected.margin - map.marginCenter) / map.marginScale);
  if (probabilityMode === 'logistic-coherent') {
    if (!wins || !losses) fail('Residual pool cannot support both winner outcomes');
    let lower = -60; let upper = 60;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const tilt = (lower + upper) / 2;
      const winMass = wins * Math.exp(tilt / 2);
      const lossMass = losses * Math.exp(-tilt / 2);
      const p = (winMass + ties / 2) / (winMass + lossMass + ties);
      if (p < calibrated) lower = tilt; else upper = tilt;
    }
    const tilt = (lower + upper) / 2;
    for (const pair of pairs) pair.weight = pair.home > pair.away ? Math.exp(tilt / 2)
      : pair.home < pair.away ? Math.exp(-tilt / 2) : 1;
  }
  const totalWeight = pairs.reduce((sum, row) => sum + row.weight, 0);
  const homeWinProbability = pairs.reduce((sum, row) => sum + row.weight
    * (row.home > row.away ? 1 : row.home === row.away ? 0.5 : 0), 0) / totalWeight;
  return freeze({
    version: DISTRIBUTION_VERSION, probabilityMode,
    home: summarize(pairs, 'home'), away: summarize(pairs, 'away'), margin: summarize(pairs, 'margin'),
    homeWinProbability, rawDistributionHomeWinProbability: rawProbability,
    logisticCalibrationTarget: calibrated,
    tieProbability: pairs.filter(row => row.home === row.away).reduce((sum, row) => sum + row.weight, 0) / totalWeight,
    residualPairCount: pairs.length,
    coherence: {
      winProbabilityUsesSameScorePairWeights: true,
      calibratedProbabilityMatched: probabilityMode === 'raw' || Math.abs(homeWinProbability - calibrated) < 1e-9,
    },
  });
}

export function scoreEmpiricalDistribution({ support }, actual) {
  let cumulative = 0;
  let priorValueSum = 0;
  let pairDistance = 0;
  let absolute = 0;
  for (const row of support) {
    absolute += row.probability * Math.abs(row.value - actual);
    pairDistance += row.probability * (row.value * cumulative - priorValueSum);
    cumulative += row.probability;
    priorValueSum += row.probability * row.value;
  }
  if (Math.abs(cumulative - 1) > 1e-8) fail('Empirical probabilities do not sum to one');
  const quantile = probability => {
    let total = 0;
    for (const row of support) {
      total += row.probability;
      if (total >= probability - 1e-12) return row.value;
    }
    return support.at(-1).value;
  };
  const intervals = Object.fromEntries([0.5, 0.8, 0.9, 0.95].map(level => {
    const alpha = 1 - level;
    const lower = quantile(alpha / 2); const upper = quantile(1 - alpha / 2);
    return [String(level), { lower, upper, covered: actual >= lower && actual <= upper,
      width: upper - lower,
      score: upper - lower + (actual < lower ? 2 * (lower - actual) / alpha : 0)
        + (actual > upper ? 2 * (actual - upper) / alpha : 0) }];
  }));
  return { crps: absolute - pairDistance, intervals };
}

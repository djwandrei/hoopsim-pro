/* Conditional total/margin uncertainty; fixed coefficients and lagged feedback. */
import { fitCandidate10ScoreModel, predictCandidate10Score } from './game-lab-native-score-model-candidate10-v3.mjs';
import { scoreEmpiricalDistribution as scoreSortedEmpirical } from './game-lab-candidate10-paired-distribution-v1.mjs';
export const DISTRIBUTION_VERSION = 'swishiq-candidate10-conditional-total-margin-rolling-residual-v3';
export const RESIDUAL_WINDOW = 500;
const VARIANCE_RIDGE = 16;
const states = new WeakMap();
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
function fail(message) { throw new TypeError(message); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function proxy(inputFeatures, field) {
  const { home: h, away: a } = inputFeatures.historicalContext;
  return field === 'total' ? Math.sqrt((h.pointsForSd20Shrunk ** 2 + h.pointsAgainstSd20Shrunk ** 2
    + a.pointsForSd20Shrunk ** 2 + a.pointsAgainstSd20Shrunk ** 2) / 2)
    : Math.sqrt((h.marginSd20Shrunk ** 2 + a.marginSd20Shrunk ** 2) / 2);
}
function completed(base, row) {
  if (typeof row.gameRef !== 'string' || row.gameDateLocal !== row.inputFeatures?.historicalContext?.gameDateLocal
      || !Number.isSafeInteger(row.target?.homeScore) || !Number.isSafeInteger(row.target?.awayScore)
      || row.target.homeScore < 0 || row.target.awayScore < 0 || row.target.homeScore === row.target.awayScore) {
    fail('Invalid completed game for conditional residual feedback');
  }
  const p = predictCandidate10Score({ model: base, inputFeatures: row.inputFeatures });
  const home = row.target.homeScore - p.homeScore; const away = row.target.awayScore - p.awayScore;
  return { gameRef: row.gameRef, date: row.gameDateLocal, total: home + away, margin: home - away,
    totalProxy: proxy(row.inputFeatures, 'total'), marginProxy: proxy(row.inputFeatures, 'margin') };
}
function fitScale(rows, field) {
  const offset = mean(rows.map(row => row[field]));
  const logs = rows.map(row => Math.log(row[field + 'Proxy']));
  const center = mean(logs); const scale = Math.sqrt(mean(logs.map(x => (x - center) ** 2))) || 1;
  const data = rows.map((row, i) => ({ x: (logs[i] - center) / scale, square: (row[field] - offset) ** 2 }));
  let intercept = Math.log(Math.max(25, mean(data.map(row => row.square)))); let slope = 0;
  const objective = (a, b) => data.reduce((sum, row) => {
    const eta = a + b * row.x; return sum + 0.5 * (eta + row.square * Math.exp(-eta));
  }, 0.5 * VARIANCE_RIDGE * b * b);
  let value = objective(intercept, slope); let converged = false;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    let g0 = 0; let g1 = VARIANCE_RIDGE * slope; let h00 = 0; let h01 = 0; let h11 = VARIANCE_RIDGE;
    for (const row of data) {
      const ratio = row.square * Math.exp(-intercept - slope * row.x);
      g0 += 0.5 * (1 - ratio); g1 += 0.5 * (1 - ratio) * row.x;
      h00 += 0.5 * ratio; h01 += 0.5 * ratio * row.x; h11 += 0.5 * ratio * row.x * row.x;
    }
    const determinant = h00 * h11 - h01 * h01;
    if (!Number.isFinite(determinant) || determinant <= 1e-12) fail('Singular conditional-variance fit');
    const d0 = (g0 * h11 - g1 * h01) / determinant; const d1 = (g1 * h00 - g0 * h01) / determinant;
    let accepted = false;
    for (let step = 1; step >= 1e-7; step /= 2) {
      const a = intercept - step * d0; const b = Math.max(-1.5, Math.min(1.5, slope - step * d1));
      const next = objective(a, b);
      if (next <= value + 1e-12) {
        converged = Math.abs(a - intercept) + Math.abs(b - slope) < 1e-9;
        intercept = a; slope = b; value = next; accepted = true; break;
      }
    }
    if (converged || !accepted) break;
  }
  if (!converged) fail('Conditional-variance fit did not converge');
  return { offset, intercept, slope, logProxyCenter: center, logProxyScale: scale,
    ridgeLambda: VARIANCE_RIDGE, converged };
}
function predictedScale(model, inputFeatures, field) {
  const head = model.scales[field];
  const x = (Math.log(proxy(inputFeatures, field)) - head.logProxyCenter) / head.logProxyScale;
  const sigma = Math.exp((head.intercept + head.slope * x) / 2);
  return Math.max(5, Math.min(field === 'total' ? 60 : 40, sigma));
}
function standardize(model, row, inputFeatures) {
  return { gameRef: row.gameRef, date: row.date,
    total: (row.total - model.scales.total.offset) / predictedScale(model, inputFeatures, 'total'),
    margin: (row.margin - model.scales.margin.offset) / predictedScale(model, inputFeatures, 'margin') };
}
export function fitCandidate10Distribution({ fitRows, calibrationRows, ridgeLambda = 8,
  featureFamilies = ['multi-window', 'strength'] } = {}) {
  if (!Array.isArray(fitRows) || !Array.isArray(calibrationRows) || calibrationRows.length < 20) fail('Fit and calibration rows required');
  const fitRefs = new Set(fitRows.map(row => row.gameRef));
  const fitEnd = fitRows.map(row => row.gameDateLocal).sort().at(-1);
  const ordered = [...calibrationRows].sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  if (new Set(ordered.map(row => row.gameRef)).size !== ordered.length
      || ordered.some(row => fitRefs.has(row.gameRef) || row.gameDateLocal <= fitEnd)) fail('Calibration must be disjoint and after fitting');
  const base = fitCandidate10ScoreModel({ fitRows, ridgeLambda, featureFamilies });
  const residuals = ordered.map(row => completed(base, row));
  const model = freeze({ version: DISTRIBUTION_VERSION, status: 'development-candidate-predictive-validation-pending',
    base, scales: { total: fitScale(residuals, 'total'), margin: fitScale(residuals, 'margin') },
    residualWindowGames: RESIDUAL_WINDOW, initialResidualPairCount: Math.min(RESIDUAL_WINDOW, residuals.length),
    calibrationDateRange: { start: ordered[0].gameDateLocal, end: ordered.at(-1).gameDateLocal },
    coefficientUpdatesOnTargetOutcomes: false,
    varianceInputs: 'prior20 shrunk points-for, points-against and margin standard deviations',
    scaleFitData: 'T-1 out-of-fit residuals only; 2 log-variance parameters per total/margin head',
    residualStateUpdate: 'append completed whole local dates; retain latest500standardized paired residual vectors',
    predictionMethod: 'exact paired standardized total/margin residuals with target-specific scales',
    roundingRule: 'transform paired total/margin into home/away; nearest integer; clip below zero' });
  const pairs = residuals.map((row, i) => standardize(model, row, ordered[i].inputFeatures)).slice(-RESIDUAL_WINDOW);
  states.set(model, { pairs, lastObservedDate: ordered.at(-1).gameDateLocal,
    consumed: new Set([...fitRefs, ...ordered.map(row => row.gameRef)]) });
  return model;
}
function summarize(pairs, field) {
  const counts = new Map();
  for (const pair of pairs) { const value = field === 'margin' ? pair.home - pair.away : pair[field];
    counts.set(value, (counts.get(value) || 0) + 1); }
  const support = [...counts].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, probability: count / pairs.length }));
  return { mean: support.reduce((sum, row) => sum + row.value * row.probability, 0), support };
}
export function predictCandidate10Distribution({ model, inputFeatures } = {}) {
  const state = states.get(model);
  if (!state || inputFeatures?.historicalContext?.gameDateLocal <= state.lastObservedDate) fail('Prediction requires strictly prior-date state');
  const expected = predictCandidate10Score({ model: model.base, inputFeatures });
  const scales = { total: predictedScale(model, inputFeatures, 'total'), margin: predictedScale(model, inputFeatures, 'margin') };
  const pairs = state.pairs.map(row => {
    const total = expected.homeScore + expected.awayScore + model.scales.total.offset + row.total * scales.total;
    const margin = expected.margin + model.scales.margin.offset + row.margin * scales.margin;
    return { home: Math.max(0, Math.round((total + margin) / 2)), away: Math.max(0, Math.round((total - margin) / 2)) };
  });
  return freeze({ version: DISTRIBUTION_VERSION, probabilityMode: 'conditional-total-margin-rolling500',
    home: summarize(pairs, 'home'), away: summarize(pairs, 'away'), margin: summarize(pairs, 'margin'),
    homeWinProbability: pairs.reduce((sum, row) => sum + Number(row.home > row.away) + 0.5 * Number(row.home === row.away), 0) / pairs.length,
    tieProbability: pairs.filter(row => row.home === row.away).length / pairs.length,
    residualPairCount: pairs.length, residualObservedThrough: state.lastObservedDate, scales,
    coherence: { winProbabilityUsesSameScorePairWeights: true, calibratedProbabilityMatched: true } });
}
export function observeCandidate10Distribution({ model, rows } = {}) {
  const state = states.get(model);
  if (!state || !Array.isArray(rows) || !rows.length) fail('Fitted model and whole-date feedback required');
  const date = rows[0].gameDateLocal;
  if (date <= state.lastObservedDate || rows.some(row => row.gameDateLocal !== date || state.consumed.has(row.gameRef))
      || new Set(rows.map(row => row.gameRef)).size !== rows.length) fail('New unique whole-date feedback required');
  const next = [...rows].sort((a, b) => a.gameRef.localeCompare(b.gameRef))
    .map(row => standardize(model, completed(model.base, row), row.inputFeatures));
  state.pairs = [...state.pairs, ...next].slice(-RESIDUAL_WINDOW);
  state.lastObservedDate = date;
  for (const row of rows) state.consumed.add(row.gameRef);
  return freeze({ observedThrough: date, residualPairCount: state.pairs.length, observedGameCount: next.length });
}
export function scoreEmpiricalDistribution(distribution, actual) {
  if (!distribution || !Array.isArray(distribution.support) || !distribution.support.length || !Number.isFinite(actual)
      || distribution.support.some((row, i, rows) => !Number.isFinite(row.value) || !Number.isFinite(row.probability)
        || row.probability <= 0 || (i > 0 && row.value <= rows[i - 1].value))) fail('Sorted unique finite empirical support required');
  return scoreSortedEmpirical(distribution, actual);
}

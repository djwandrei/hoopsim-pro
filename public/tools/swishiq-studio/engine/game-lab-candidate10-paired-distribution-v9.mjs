/* Frozen score coefficients with a strictly prior-date rolling residual state. */
import { fitCandidate10ScoreModel, predictCandidate10Score } from './game-lab-native-score-model-candidate10-v5.mjs';
export { scoreEmpiricalDistribution } from './game-lab-candidate10-paired-distribution-v3.mjs';
export const DISTRIBUTION_VERSION = 'swishiq-candidate10-stable-shape-checkpointed-raw-v9';
export const RESIDUAL_WINDOW = 500;
const states = new WeakMap();
function fail(message) { throw new TypeError(message); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function residual(model, row) {
  if (typeof row.gameRef !== 'string' || !row.gameRef || row.gameDateLocal !== row.inputFeatures?.historicalContext?.gameDateLocal
      || !Number.isSafeInteger(row.target?.homeScore) || !Number.isSafeInteger(row.target?.awayScore)
      || row.target.homeScore < 0 || row.target.awayScore < 0 || row.target.homeScore === row.target.awayScore) {
    fail('Invalid completed game for residual feedback');
  }
  const expected = predictCandidate10Score({ model, inputFeatures: row.inputFeatures });
  return { gameRef: row.gameRef, date: row.gameDateLocal,
    home: row.target.homeScore - expected.homeScore, away: row.target.awayScore - expected.awayScore };
}
function moments(pairs) {
  const meanTotal = pairs.reduce((sum, row) => sum + row.home + row.away, 0) / pairs.length;
  const meanMargin = pairs.reduce((sum, row) => sum + row.home - row.away, 0) / pairs.length;
  return { meanTotal, meanMargin,
    totalVariance: Math.max(1, pairs.reduce((sum, row) => sum + (row.home + row.away - meanTotal) ** 2, 0) / (pairs.length - 1)),
    marginVariance: Math.max(1, pairs.reduce((sum, row) => sum + (row.home - row.away - meanMargin) ** 2, 0) / (pairs.length - 1)) };
}
export function fitCandidate10Distribution({ fitRows, calibrationRows, ridgeLambda = 8,
  featureFamilies = ['multi-window', 'strength', 'adjusted-total'] } = {}) {
  if (!Array.isArray(fitRows) || !Array.isArray(calibrationRows) || calibrationRows.length < 20) {
    fail('Separate fit and initial calibration rows required');
  }
  const fitRefs = new Set(fitRows.map(row => row.gameRef));
  const fitEnd = fitRows.map(row => row.gameDateLocal).sort().at(-1);
  const ordered = [...calibrationRows].sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal)
    || a.gameRef.localeCompare(b.gameRef));
  if (new Set(ordered.map(row => row.gameRef)).size !== ordered.length
      || ordered.some(row => fitRefs.has(row.gameRef) || row.gameDateLocal <= fitEnd)) {
    fail('Initial calibration must be disjoint and later than coefficient fitting');
  }
  const base = fitCandidate10ScoreModel({ fitRows, ridgeLambda, featureFamilies });
  const fullPairs = ordered.map(row => residual(base, row));
  const pairs = fullPairs.slice(-RESIDUAL_WINDOW);
  const initialMoments = moments(fullPairs);
  const shape = fullPairs.map(row => ({
    total: (row.home + row.away - initialMoments.meanTotal) / Math.sqrt(initialMoments.totalVariance),
    margin: (row.home - row.away - initialMoments.meanMargin) / Math.sqrt(initialMoments.marginVariance) }));
  const model = freeze({ version: DISTRIBUTION_VERSION,
    status: 'development-candidate-predictive-validation-pending', base,
    residualWindowGames: RESIDUAL_WINDOW, initialResidualPairCount: pairs.length,
    calibrationResidualMoments: initialMoments, shapeResidualPairCount: shape.length, variancePriorGameWeight: 200,
    calibrationDateRange: { start: ordered[0].gameDateLocal, end: ordered.at(-1).gameDateLocal },
    coefficientUpdatesOnTargetOutcomes: false,
    residualStateUpdate: 'append completed whole local dates only; retain latest 500 residual vectors',
    predictionMethod: 'T-1 paired standardized total/margin shape; recent500means; variance shrinkage toward T-1 with200gameweight',
    roundingRule: 'round each score to nearest integer and clip below zero',
  });
  states.set(model, { pairs, shape, lastObservedDate: ordered.at(-1).gameDateLocal,
    consumed: new Set([...fitRefs, ...ordered.map(row => row.gameRef)]), pending: new Set(), pendingDate: null });
  return model;
}
function summarize(pairs, field) {
  const counts = new Map();
  for (const pair of pairs) {
    const value = field === 'margin' ? pair.home - pair.away : pair[field];
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  const support = [...counts].sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, probability: count / pairs.length }));
  return { mean: support.reduce((sum, row) => sum + row.value * row.probability, 0), support };
}
export function predictCandidate10Distribution({ model, inputFeatures, gameRef } = {}) {
  const state = states.get(model);
  const date = inputFeatures?.historicalContext?.gameDateLocal;
  if (!state || !date || date <= state.lastObservedDate || typeof gameRef !== 'string' || !gameRef
      || state.consumed.has(gameRef) || state.pending.has(gameRef)) fail('Unique future-date prediction required');
  if (state.pendingDate != null && date !== state.pendingDate) fail('Complete pending-date feedback first');
  const expected = predictCandidate10Score({ model: model.base, inputFeatures });
  const recent = moments(state.pairs);
  const initial = model.calibrationResidualMoments;
  const count = state.pairs.length - 1;
  const totalScale = Math.sqrt((200 * initial.totalVariance + count * recent.totalVariance) / (200 + count));
  const marginScale = Math.sqrt((200 * initial.marginVariance + count * recent.marginVariance) / (200 + count));
  const pairs = state.shape.map(row => {
    const total = expected.homeScore + expected.awayScore + recent.meanTotal + totalScale * row.total;
    const margin = expected.margin + recent.meanMargin + marginScale * row.margin;
    return { home: Math.max(0, Math.round((total + margin) / 2)), away: Math.max(0, Math.round((total - margin) / 2)) };
  });
  const ties = pairs.filter(row => row.home === row.away).length;
  const probability = pairs.reduce((sum, row) => sum + Number(row.home > row.away)
    + 0.5 * Number(row.home === row.away), 0) / pairs.length;
  const result = freeze({ version: DISTRIBUTION_VERSION, probabilityMode: 'stable-shape-adaptive-moments',
    home: summarize(pairs, 'home'), away: summarize(pairs, 'away'), margin: summarize(pairs, 'margin'),
    homeWinProbability: probability, tieProbability: ties / pairs.length, residualPairCount: state.pairs.length, shapeResidualPairCount: pairs.length,
    residualObservedThrough: state.lastObservedDate,
    coherence: { winProbabilityUsesSameScorePairWeights: true, marginMeanMatchesScoreDifference: true } });
  state.pending.add(gameRef); state.pendingDate = date;
  return result;
}
export function observeCandidate10Distribution({ model, rows } = {}) {
  const state = states.get(model);
  if (!state || !Array.isArray(rows) || !rows.length || rows.length !== state.pending.size) fail('Feedback must cover complete pending predictions');
  const date = rows[0].gameDateLocal;
  if (date !== state.pendingDate || date <= state.lastObservedDate || rows.some(row => row.gameDateLocal !== date || !state.pending.has(row.gameRef) || state.consumed.has(row.gameRef))
      || new Set(rows.map(row => row.gameRef)).size !== rows.length) {
    fail('Feedback must contain a new whole date without duplicate games');
  }
  // Validate and calculate all residuals before any state mutation.
  const next = [...rows].sort((a, b) => a.gameRef.localeCompare(b.gameRef)).map(row => residual(model.base, row));
  state.pairs = [...state.pairs, ...next].slice(-RESIDUAL_WINDOW);
  state.lastObservedDate = date;
  for (const row of rows) state.consumed.add(row.gameRef);
  state.pending.clear(); state.pendingDate = null;
  return freeze({ observedThrough: date, residualPairCount: state.pairs.length, observedGameCount: next.length });
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function exportCandidate10Distribution({ model } = {}) {
  const state = states.get(model);
  if (!state || state.pending.size) fail('Export requires complete-date feedback');
  return freeze(clone({ format: 'swishiq-candidate10-raw-checkpoint-v1', model,
    runtime: { pairs: state.pairs, shape: state.shape, lastObservedDate: state.lastObservedDate,
      consumedGameRefs: [...state.consumed].sort() } }));
}
export function hydrateCandidate10Distribution({ artifact } = {}) {
  const value = clone(artifact); const model = value?.model; const runtime = value?.runtime;
  if (value?.format !== 'swishiq-candidate10-raw-checkpoint-v1' || model?.version !== DISTRIBUTION_VERSION
      || model.residualWindowGames !== RESIDUAL_WINDOW || model.variancePriorGameWeight !== 200
      || !runtime || !Array.isArray(runtime.pairs) || runtime.pairs.length < 20 || runtime.pairs.length > RESIDUAL_WINDOW
      || !Array.isArray(runtime.shape) || runtime.shape.length !== model.shapeResidualPairCount
      || !Array.isArray(runtime.consumedGameRefs) || runtime.consumedGameRefs.some(ref => typeof ref !== 'string' || !ref)
      || new Set(runtime.consumedGameRefs).size !== runtime.consumedGameRefs.length
      || typeof runtime.lastObservedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(runtime.lastObservedDate)
      || !Object.values(model.calibrationResidualMoments || {}).every(Number.isFinite)
      || !(model.calibrationResidualMoments?.totalVariance >= 1) || !(model.calibrationResidualMoments?.marginVariance >= 1)) fail('Invalid distribution checkpoint');
  const consumed = new Set(runtime.consumedGameRefs);
  if (runtime.pairs.some(row => !consumed.has(row.gameRef) || typeof row.date !== 'string'
      || row.date > runtime.lastObservedDate || !Number.isFinite(row.home) || !Number.isFinite(row.away))
      || new Set(runtime.pairs.map(row => row.gameRef)).size !== runtime.pairs.length
      || runtime.shape.some(row => !Number.isFinite(row.total) || !Number.isFinite(row.margin))) fail('Invalid checkpoint observation state');
  freeze(model);
  states.set(model, { pairs: runtime.pairs, shape: runtime.shape, lastObservedDate: runtime.lastObservedDate,
    consumed, pending: new Set(), pendingDate: null });
  return model;
}

/* Browser-safe Candidate57 checkpoint codec. Entry wrappers supply a frozen
 * configuration. Site activation belongs to a separately approved adapter. */
import { buildCandidate57Design, predictCandidate57Score,
  CANDIDATE57_TOTAL_FEATURE_NAMES, CANDIDATE57_MARGIN_FEATURE_NAMES, CANDIDATE57_VERSION } from './game-lab-candidate57-c51-pass6-hybrid-v4.mjs';
import { buildCandidate57ConfiguredDistribution, DEFAULT_SETTINGS } from './game-lab-candidate57-configurable-uncertainty-v7.mjs';
import { fitCandidate57WithFeaturePenalties } from './game-lab-candidate57-feature-penalty-fit-v3.mjs';

export const CHECKPOINT_FORMAT = 'swishiq-candidate57-runtime-checkpoint-v1';
const states = new WeakMap();
const copy = value => structuredClone(value);
const finite = Number.isFinite;
const dateTime = date => Date.parse(date + 'T00:00:00Z');
const days = (a, b) => (dateTime(b) - dateTime(a)) / 86400000;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v);
function fail(message) { throw new TypeError('Candidate57 checkpoint: ' + message); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !finite(dateTime(value)) || new Date(dateTime(value)).toISOString().slice(0, 10) !== value) fail('invalid local date');
  return value;
}
function equations(value, width, minimum) {
  if (!value || !Number.isSafeInteger(value.observations) || value.observations < minimum || !finite(value.weight) || value.weight <= 0
    || !Array.isArray(value.cross) || value.cross.length !== width || value.cross.some(v => !finite(v))
    || !Array.isArray(value.gram) || value.gram.length !== width || value.gram.some(r => !Array.isArray(r) || r.length !== width || r.some(v => !finite(v)))) fail('invalid normal equations');
  for (let i = 0; i < width; i++) for (let j = 0; j < width; j++)
    if (Math.abs(value.gram[i][j] - value.gram[j][i]) > 1e-8 * Math.max(1, Math.abs(value.gram[i][j]))) fail('asymmetric Gram matrix');
}
function configuration(value) {
  if (!value || typeof value.version !== 'string' || !value.version || !finite(value.totalRidgeLambda) || value.totalRidgeLambda <= 0
    || !finite(value.marginRidgeLambda) || value.marginRidgeLambda <= 0 || !finite(value.trainingHalfLifeDays) || value.trainingHalfLifeDays <= 0
    || !Number.isSafeInteger(value.refitIntervalDays) || value.refitIntervalDays < 1 || value.minimumTrainingRows !== 100) fail('invalid frozen configuration');
  for (const [key, names] of [['totalFeatureNames', CANDIDATE57_TOTAL_FEATURE_NAMES], ['marginFeatureNames', CANDIDATE57_MARGIN_FEATURE_NAMES]])
    if (!Array.isArray(value[key]) || !value[key].length || new Set(value[key]).size !== value[key].length || value[key].some(n => !names.includes(n))) fail('invalid selected features');
  if (Object.hasOwn(value, 'featureRidgePenaltyMultipliers') && (!value.featureRidgePenaltyMultipliers || typeof value.featureRidgePenaltyMultipliers !== 'object' || Object.getPrototypeOf(value.featureRidgePenaltyMultipliers) !== Object.prototype || Object.keys(value.featureRidgePenaltyMultipliers).some(k=>!['total','margin'].includes(k)))) fail('invalid feature-penalty map');
  if (Object.hasOwn(value, 'featureRidgePenaltyMultipliers')) for (const head of ['total', 'margin']) {
    const penalties = Object.hasOwn(value.featureRidgePenaltyMultipliers, head) ? value.featureRidgePenaltyMultipliers[head] : {};
    if (!penalties || typeof penalties !== 'object' || Object.getPrototypeOf(penalties) !== Object.prototype
      || Object.keys(penalties).some(n => !value[head + 'FeatureNames'].includes(n))
      || Object.values(penalties).some(v => !finite(v) || v <= 0)) fail('invalid feature penalties');
  }
  if (value.postMeanCalibration && (value.postMeanCalibration.kind !== 'total-prior-last10-blend'
    || !finite(value.postMeanCalibration.modelWeight) || value.postMeanCalibration.modelWeight < 0 || value.postMeanCalibration.modelWeight > 1.5)) fail('unsupported post-mean calibration');
  if (Object.hasOwn(value, 'postMeanAffine')) {
    const a = value.postMeanAffine;
    if (!a || typeof a !== 'object' || Object.getPrototypeOf(a) !== Object.prototype || a.order !== 'after-total-prior-last10-blend' || !finite(a.marginScale) || a.marginScale <= 0 || a.marginScale > 2
      || !finite(a.marginOffset) || Math.abs(a.marginOffset)>10 || !finite(a.totalOffset) || Math.abs(a.totalOffset)>10) fail('invalid mean affine calibration');
  }
  const u = value.uncertainty;
  if (!u || typeof u !== 'object' || Array.isArray(u) || Object.keys(u).some(k => !(k in DEFAULT_SETTINGS))
    || Object.keys(DEFAULT_SETTINGS).some(k => !(k in u))) fail('complete pinned uncertainty configuration required');
  for (const key of ['residualWindowGames', 'varianceWindowGames', 'biasWindowGames'])
    if (!Number.isSafeInteger(u[key]) || u[key] < 100) fail('invalid uncertainty window');
  for (const key of ['regimeThreshold', 'kernelBandwidthMargin', 'totalResidualScale', 'marginResidualScale', 'conditionalVarianceRidge'])
    if (!finite(u[key]) || u[key] <= 0) fail('invalid positive uncertainty setting');
  for (const key of ['totalMarginCorrelationRetention', 'varianceAdaptationBlend', 'gaussianBlend', 'conditionalVarianceBlend', 'totalBiasRetention', 'marginBiasRetention'])
    if (!finite(u[key]) || u[key] < 0 || u[key] > 1) fail('invalid uncertainty blend');
  if (u.minimumStratumResiduals !== 100 || !finite(u.stratumPriorGames) || u.stratumPriorGames < 0
    || (u.residualAgeHalfLifeDays !== null && (!finite(u.residualAgeHalfLifeDays) || u.residualAgeHalfLifeDays <= 0))
    || !['stratified', 'full', 'kernel'].includes(u.poolMode) || !['scores', 'total-margin'].includes(u.conditionalVarianceHeads)
    || !['rolling', 'prior-season'].includes(u.residualCalendarMode) || !['split-point', 'condition-no-tie'].includes(u.integerTieMode)
    || typeof u.integerScoreSupport !== 'boolean' || (u.integerScoreSupport && u.gaussianBlend !== 0)) fail('invalid uncertainty configuration');
}
function get(runtime) { const state = states.get(runtime); if (!state) fail('unknown runtime handle'); return state; }
function assertFeatures(features, cutoff, targetDate, stats) {
  if (date(cutoff) >= date(targetDate)) fail('features must precede the target local date');
  return buildCandidate57Design({ features, standardization: stats });
}
function calibratedPrediction(model, features, settings) {
  const p = { ...predictCandidate57Score({ model, features }) };
  if (settings.postMeanCalibration) {
    const pf = features.total['c51:meanPointsForLast10'], pa = features.total['c51:meanPointsAgainstLast10'];
    if (pf !== null && pa !== null) {
      const weight = settings.postMeanCalibration.modelWeight;
      p.total = weight * p.total + (1 - weight) * (pf + pa);
      p.homeScore = (p.total + p.margin) / 2; p.awayScore = (p.total - p.margin) / 2;
    }
  }
  if (settings.postMeanAffine) {
    p.total += settings.postMeanAffine.totalOffset;
    p.margin = settings.postMeanAffine.marginScale*p.margin + settings.postMeanAffine.marginOffset;
    p.homeScore=(p.total+p.margin)/2; p.awayScore=(p.total-p.margin)/2;
  }
  return p;
}
function advance(state, targetDate) {
  const c = state.configuration;
  if (state.pendingDate && state.pendingDate !== targetDate) fail('seal the pending local date before predicting another date');
  if (targetDate <= state.lastObservedLocalDate || targetDate < state.lastEquationLocalDate) fail('target is not later than observed history');
  if (!state.pendingDate) {
    const decay = 2 ** (-days(state.lastEquationLocalDate, targetDate) / c.trainingHalfLifeDays);
    for (const eq of [state.totalNormalEquations, state.marginNormalEquations]) {
      eq.cross = eq.cross.map(v => v * decay); eq.gram = eq.gram.map(r => r.map(v => v * decay)); eq.weight *= decay;
    }
    state.lastEquationLocalDate = targetDate;
    if (days(state.lastFittedLocalDate, targetDate) >= c.refitIntervalDays) {
      state.lastFittedModel = { ...fitCandidate57WithFeaturePenalties({ total: state.totalNormalEquations, margin: state.marginNormalEquations,
        standardization: state.standardization, ridgeLambda: c.totalRidgeLambda,
        totalRidgeLambda: c.totalRidgeLambda, marginRidgeLambda: c.marginRidgeLambda,
        featureRidgePenaltyMultipliers: c.featureRidgePenaltyMultipliers ?? { total: {}, margin: {} } }), frozenVersion: c.version };
      state.coefficientObservedThrough = state.lastObservedLocalDate; state.lastFittedLocalDate = targetDate;
    }
    state.pendingDate = targetDate; state.pending = new Map();
  }
}

export async function hydrateCandidate57Runtime({ artifact, configuration: frozen } = {}) {
  configuration(frozen);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(frozen))))]
    .map(v => v.toString(16).padStart(2, '0')).join('');
  if (artifact?.format !== CHECKPOINT_FORMAT || artifact.modelVersion !== frozen.version || artifact.configurationSha256 !== digest
    || !Array.isArray(artifact.sourcePins) || !artifact.sourcePins.length) fail('checkpoint identity/configuration pins');
  const state = copy(artifact.runtimeState);
  if (!state || date(state.lastObservedLocalDate) !== date(artifact.lastObservedLocalDate)
    || date(state.lastEquationLocalDate) < state.lastObservedLocalDate || date(state.lastFittedLocalDate) > state.lastEquationLocalDate
    || date(state.coefficientObservedThrough) > state.lastObservedLocalDate || date(state.standardizationObservedThrough) > state.coefficientObservedThrough) fail('checkpoint date boundaries');
  if (!same(state.standardization?.totalFeatureNames, frozen.totalFeatureNames)
    || !same(state.standardization?.marginFeatureNames, frozen.marginFeatureNames)
    || !same(state.lastFittedModel?.standardization, state.standardization)
    || state.lastFittedModel?.version !== CANDIDATE57_VERSION
    || state.lastFittedModel.frozenVersion !== frozen.version
    || !same(state.lastFittedModel.featureRidgePenaltyMultipliers ?? { total: {}, margin: {} }, frozen.featureRidgePenaltyMultipliers ?? { total: {}, margin: {} })
    || state.lastFittedModel.totalRidgeLambda !== frozen.totalRidgeLambda || state.lastFittedModel.marginRidgeLambda !== frozen.marginRidgeLambda) fail('checkpoint fitted-model contract');
  equations(state.totalNormalEquations, frozen.totalFeatureNames.length + 1, frozen.minimumTrainingRows);
  equations(state.marginNormalEquations, frozen.marginFeatureNames.length + 1, frozen.minimumTrainingRows);
  if (!Array.isArray(state.residualPool) || state.residualPool.length < 100 || state.residualPool.some((r, i) => date(r.gameDateLocal) > state.lastObservedLocalDate
    || !finite(r.total) || !finite(r.margin) || !finite(r.predictedTotal) || !finite(r.predictedMargin)
    || (i > 0 && r.gameDateLocal < state.residualPool[i - 1].gameDateLocal))) fail('checkpoint residual history');
  for (const [key, names] of [['totalHead', frozen.totalFeatureNames], ['marginHead', frozen.marginFeatureNames]])
    if (!same(state.lastFittedModel[key].featureNames, ['intercept', ...names]) || state.lastFittedModel[key].coefficients.length !== names.length + 1
      || state.lastFittedModel[key].coefficients.some(v => !finite(v))) fail('checkpoint coefficient dimensions');
  state.configuration = copy(frozen); state.sourcePins = copy(artifact.sourcePins); state.configurationSha256 = digest;
  state.pending = new Map(); state.pendingDate = null;
  const runtime = Object.freeze({ modelVersion: frozen.version,
    get lastObservedLocalDate() { return state.lastObservedLocalDate; }, activationAllowed: false });
  states.set(runtime, state); return runtime;
}

export function predictCandidate57Game({ runtime, inputFeatures, targetGameRef, targetDate, featureObservedThrough, seasonStartYear } = {}) {
  const state = get(runtime); date(targetDate);
  if (typeof targetGameRef !== 'string' || !targetGameRef || !Number.isSafeInteger(seasonStartYear)) fail('target identity/season');
  assertFeatures(inputFeatures, featureObservedThrough, targetDate, state.standardization);
  const existing = state.pending.get(targetGameRef);
  if (existing) { if (state.pendingDate !== targetDate || existing.seasonStartYear !== seasonStartYear
    || !same(existing.features, inputFeatures) || existing.featureObservedThrough !== featureObservedThrough) fail('same game changed after prediction'); return copy(existing.result); }
  // A failed forecast must leave the hydrated checkpoint usable. Advance a
  // private draft and commit it only after prediction/distribution succeed.
  const working = state.pendingDate ? state : { ...state,
    totalNormalEquations: copy(state.totalNormalEquations), marginNormalEquations: copy(state.marginNormalEquations) };
  advance(working, targetDate);
  const prediction = calibratedPrediction(working.lastFittedModel, inputFeatures, working.configuration);
  const distribution = buildCandidate57ConfiguredDistribution({ prediction, residualPool: working.residualPool, targetDate,
    targetSeasonStartYear: seasonStartYear, settings: working.configuration.uncertainty });
  const result = { modelVersion: state.configuration.version, gameRef: targetGameRef, gameDateLocal: targetDate,
    expectedHomeScore: distribution.home.mean, expectedAwayScore: distribution.away.mean, expectedMargin: distribution.margin.mean,
    homeWinProbability: distribution.homeWinProbability, distribution, featureObservedThrough,
    coefficientObservedThrough: working.coefficientObservedThrough, standardizationObservedThrough: working.standardizationObservedThrough,
    residualObservedThrough: distribution.residualObservedThrough,
    status: state.configuration.developmentNumericalGateStatus === 'passed'
      ? 'development-passed-independent-confirmation-pending' : 'development-preparation-unapproved' };
  working.pending.set(targetGameRef, { result, features: copy(inputFeatures), featureObservedThrough, prediction, seasonStartYear });
  if (working !== state) Object.assign(state, working);
  return copy(result);
}

export function observeCandidate57Date({ runtime, date: observedDate, rows, expectedGameRefs } = {}) {
  const state = get(runtime); date(observedDate);
  if (observedDate !== state.pendingDate || !Array.isArray(rows) || !rows.length || !Array.isArray(expectedGameRefs)
    || new Set(expectedGameRefs).size !== expectedGameRefs.length || expectedGameRefs.length !== rows.length
    || state.pending.size !== rows.length || new Set(rows.map(r => r.gameRef)).size !== rows.length
    || expectedGameRefs.some(ref => !state.pending.has(ref) || !rows.some(r => r.gameRef === ref))) fail('complete pre-predicted date batch required');
  const prepared = rows.map(row => {
    const pending = state.pending.get(row.gameRef), t = row.target;
    if (!pending || row.gameDateLocal !== observedDate || row.seasonStartYear !== pending.seasonStartYear || !same(pending.features, row.features)
      || !Number.isSafeInteger(t?.homeScore) || t.homeScore < 0 || !Number.isSafeInteger(t?.awayScore) || t.awayScore < 0
      || t.homeScore === t.awayScore || t.total !== t.homeScore + t.awayScore || t.margin !== t.homeScore - t.awayScore) fail('invalid observed target/feature identity');
    return { row, pending, design: buildCandidate57Design({ features: row.features, standardization: state.standardization }) };
  }).sort((a, b) => a.row.gameRef.localeCompare(b.row.gameRef));
  for (const { row, pending, design } of prepared) {
    for (const [head, eq] of [['total', state.totalNormalEquations], ['margin', state.marginNormalEquations]]) {
      const vector = design[head], target = row.target[head];
      for (let i = 0; i < vector.length; i++) { eq.cross[i] += vector[i] * target;
        for (let j = 0; j < vector.length; j++) eq.gram[i][j] += vector[i] * vector[j]; }
      eq.observations++; eq.weight++;
    }
    state.residualPool.push({ gameRef: row.gameRef, gameDateLocal: observedDate, seasonStartYear: pending.seasonStartYear,
      predictedTotal: pending.prediction.total, predictedMargin: pending.prediction.margin,
      total: row.target.total - pending.prediction.total, margin: row.target.margin - pending.prediction.margin });
  }
  // Preserve enough prior-season rows if that calendar mode is selected.
  const keep = Math.max(state.configuration.uncertainty.residualWindowGames, 3000);
  state.residualPool = state.residualPool.slice(-keep); state.lastObservedLocalDate = observedDate;
  state.lastEquationLocalDate = observedDate; state.pendingDate = null; state.pending = new Map();
  return { observedLocalDate: observedDate, updatedGames: prepared.length, sameDatePredictionBeforeFeedback: true };
}

export function exportCandidate57Runtime({ runtime } = {}) {
  const state = get(runtime);
  if (state.pendingDate) fail('seal all predicted date outcomes before exporting an observed checkpoint');
  return { format: CHECKPOINT_FORMAT, modelVersion: state.configuration.version,
    configurationSha256: state.configurationSha256, lastObservedLocalDate: state.lastObservedLocalDate, sourcePins: copy(state.sourcePins),
    runtimeState: copy(Object.fromEntries(['totalNormalEquations', 'marginNormalEquations', 'standardization', 'lastFittedModel', 'residualPool',
      'lastObservedLocalDate', 'lastEquationLocalDate', 'lastFittedLocalDate', 'coefficientObservedThrough', 'standardizationObservedThrough'].map(k => [k, state[k]]))) };
}

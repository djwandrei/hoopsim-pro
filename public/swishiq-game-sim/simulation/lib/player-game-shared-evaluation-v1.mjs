import { predictRidge } from './ridge-regression.mjs';
import { PLAYER_RATE_STATISTICS } from './player-game-development-features-v1.mjs';

export const PLAYER_FORM_CANDIDATES = Object.freeze(['legacyForm', 'exposureShrunk', 'ewma5', 'ewma10', 'ewma20']);
const contextField = { points: 'priorPointsPer36', rebounds: 'priorReboundsPer36', assists: 'priorAssistsPer36',
  threePointersMade: 'priorThreesPer36', turnovers: 'priorTurnoversPer36' };

/** Each candidate changes the target's form estimate only. Context, rating,
 * role and shooting-process features retain the same parent-model formulas. */
export function sharedRateFeatures(row, statistic, candidate = 'legacyForm') {
  if (!PLAYER_FORM_CANDIDATES.includes(candidate)) throw new Error('Unknown player form candidate.');
  if (!PLAYER_RATE_STATISTICS.includes(statistic)) throw new Error('Unknown player rate statistic.');
  const features = statistic === 'points' ? { ...row.pointsFeatures }
    : { ...row.boxCommonFeatures, ...row.boxRateFeatures[statistic] };
  if (candidate !== 'legacyForm') {
    const source = candidate === 'exposureShrunk' ? row.candidateRateFeatures.exposureShrunk
      : row.candidateRateFeatures.ewma[Number(candidate.slice(4))];
    const value = source[statistic];
    if (!(value === null || Number.isFinite(value))) throw new Error('Missing candidate form estimate.');
    features[statistic === 'points' ? 'priorPointsPer36' : 'priorTargetRate'] = value ?? 0;
  }
  return features;
}

export function predictSharedPlayerCount(regression, features, projectedMinutes, upperRateBound) {
  if (!Number.isFinite(projectedMinutes) || projectedMinutes < 0 || projectedMinutes > 108 ||
      !Number.isFinite(upperRateBound) || upperRateBound <= 0) throw new Error('Count prediction requires explicit nonnegative projected minutes and a finite rate cap.');
  if (!regression || !Array.isArray(regression.featureNames) || !regression.featureNames.length ||
      new Set(regression.featureNames).size !== regression.featureNames.length ||
      !Number.isFinite(regression.intercept) || !regression.coefficients ||
      regression.featureNames.some(name => typeof name !== 'string' || !name || !Number.isFinite(regression.coefficients[name]))) throw new Error('Player production regression is incomplete or nonfinite.');
  if (regression.featureNames.some(name => !Object.hasOwn(features, name) || !Number.isFinite(features[name]))) throw new Error('Player production feature contract is incomplete.');
  const rawRate = predictRidge(regression, features);
  if (!Number.isFinite(rawRate)) throw new Error('Player production regression returned a nonfinite prediction.');
  const ratePer36 = Math.max(0, Math.min(upperRateBound, rawRate));
  const expectedCount = ratePer36 * (projectedMinutes / 36);
  if (!Number.isFinite(expectedCount)) throw new Error('Player production expected count is nonfinite.');
  return { ratePer36, expectedCount,
    exposure: { projectedMinutes, type: 'explicit-projected-minutes; conditional-on-appearance' } };
}

export function createErrorSummary() { return { rows: 0, absolute: 0, squared: 0, signed: 0 }; }

function validateErrorSummary(summary) {
  if (!summary || !Number.isSafeInteger(summary.rows) || summary.rows < 0 ||
      !Number.isFinite(summary.absolute) || summary.absolute < 0 ||
      !Number.isFinite(summary.squared) || summary.squared < 0 || !Number.isFinite(summary.signed)) {
    throw new Error('Evaluation summary totals must be finite and valid.');
  }
}

export function addPredictionError(summary, prediction, target) {
  validateErrorSummary(summary);
  const error = prediction - target;
  if (!Number.isFinite(error)) throw new Error('Evaluation error must be finite.');
  const squared = error * error;
  const nextRows = summary.rows + 1;
  const nextAbsolute = summary.absolute + Math.abs(error);
  const nextSquared = summary.squared + squared;
  const nextSigned = summary.signed + error;
  if (!Number.isFinite(squared) || !Number.isSafeInteger(nextRows) || !Number.isFinite(nextAbsolute) ||
      !Number.isFinite(nextSquared) || !Number.isFinite(nextSigned)) {
    throw new Error('Evaluation error totals must remain finite.');
  }
  summary.rows = nextRows; summary.absolute = nextAbsolute; summary.squared = nextSquared; summary.signed = nextSigned;
}
export function summarizeErrors(summary) {
  validateErrorSummary(summary);
  const metrics = { rows: summary.rows, mae: summary.rows ? summary.absolute / summary.rows : null,
    rmse: summary.rows ? Math.sqrt(summary.squared / summary.rows) : null,
    meanError: summary.rows ? summary.signed / summary.rows : null };
  if (metrics.rows && [metrics.mae, metrics.rmse, metrics.meanError].some(value => !Number.isFinite(value))) {
    throw new Error('Evaluation summary metrics must be finite.');
  }
  return metrics;
}
export function mergeErrorSummaries(target, source) {
  validateErrorSummary(target); validateErrorSummary(source);
  const nextRows = target.rows + source.rows;
  const nextAbsolute = target.absolute + source.absolute;
  const nextSquared = target.squared + source.squared;
  const nextSigned = target.signed + source.signed;
  if (!Number.isSafeInteger(nextRows) || !Number.isFinite(nextAbsolute) || !Number.isFinite(nextSquared) ||
      !Number.isFinite(nextSigned)) throw new Error('Merged evaluation totals must remain finite.');
  target.rows = nextRows; target.absolute = nextAbsolute; target.squared = nextSquared; target.signed = nextSigned;
}
export function empiricalQuantile(values, probability) {
  if (!Array.isArray(values) || !values.length || values.some(value => !Number.isFinite(value)) ||
      !Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('Quantile requires finite values and a probability in [0,1].');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * probability)];
}
/** Resample seasons, then team clusters within each sampled season. Every
 * sampled cluster carries paired errors from exactly the same cohort rows. */
export function pairedSeasonTeamInterval(clusters, repetitions = 1000, seed = 271828) {
  if (!Number.isInteger(repetitions) || repetitions < 1) throw new Error('Bootstrap repetitions must be positive.');
  const seasons = new Map();
  for (const item of clusters) {
    if (!Number.isInteger(item.seasonStartYear) || !Number.isInteger(item.rows) || item.rows <= 0 ||
        !Number.isFinite(item.improvementSum)) throw new Error('Invalid paired-error cluster.');
    const list = seasons.get(item.seasonStartYear) ?? []; list.push(item); seasons.set(item.seasonStartYear, list);
  }
  const groups = [...seasons.values()];
  if (groups.length < 2) return { low: null, high: null, repetitions: 0, clusters: clusters.length, seasons: groups.length };
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const estimates = [];
  for (let repeat = 0; repeat < repetitions; repeat += 1) {
    let sum = 0, rows = 0;
    for (let seasonIndex = 0; seasonIndex < groups.length; seasonIndex += 1) {
      const group = groups[Math.floor(random() * groups.length)];
      for (let teamIndex = 0; teamIndex < group.length; teamIndex += 1) {
        const item = group[Math.floor(random() * group.length)]; sum += item.improvementSum; rows += item.rows;
      }
    }
    estimates.push(sum / rows);
  }
  return { low: empiricalQuantile(estimates, 0.025), high: empiricalQuantile(estimates, 0.975), repetitions,
    clusters: clusters.length, seasons: groups.length, seed, method: 'hierarchical-season-then-team-cluster; paired-row-loss' };
}
export function rateContextName(statistic) { return contextField[statistic] ?? null; }

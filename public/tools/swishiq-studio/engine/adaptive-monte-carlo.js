/*
 * Reusable adaptive categorical Monte Carlo runner for simulation outcomes.
 * It reports finite-sample uncertainty only; it cannot establish model
 * uncertainty, calibration, or forecast skill.
 */

export const ADAPTIVE_MONTE_CARLO_VERSION = 'swishiq-adaptive-categorical-monte-carlo-v2';

const SUPPORTED_CONFIDENCE_LEVELS = new Set(['0.9', '0.95', '0.99']);

function fail(message) { throw new Error(message); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function round(value) { return finite(value) ? Math.round(value * 1000000) / 1000000 : null; }
function roundDown(value) { return finite(value) ? Math.floor(value * 1000000) / 1000000 : null; }
function roundUp(value) { return finite(value) ? Math.ceil(value * 1000000) / 1000000 : null; }
function validName(value) { return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(value); }

function validateOptions({ drawTrial, seed, categories, targetHalfWidth, confidenceLevel, minimumTrials, maximumTrials, batchSize }) {
  if (typeof drawTrial !== 'function') fail('A deterministic drawTrial(trialIndex, seed) function is required.');
  if (typeof seed !== 'string' || !/^[a-zA-Z0-9:._-]{1,80}$/.test(seed)) fail('Provide a valid reproducible Monte Carlo seed.');
  if (!Array.isArray(categories) || categories.length < 2 || categories.length > 20
    || categories.some(category => !validName(category)) || new Set(categories).size !== categories.length) {
    fail('Provide 2–20 unique lowercase outcome category names.');
  }
  if (!finite(targetHalfWidth) || targetHalfWidth <= 0 || targetHalfWidth >= 0.5) fail('targetHalfWidth must be between 0 and 0.5.');
  if (!SUPPORTED_CONFIDENCE_LEVELS.has(String(confidenceLevel))) fail('Supported confidence levels are 0.90, 0.95, and 0.99.');
  if (!Number.isInteger(minimumTrials) || minimumTrials < 1 || !Number.isInteger(maximumTrials)
    || maximumTrials < minimumTrials || maximumTrials > 10000000
    || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > maximumTrials) {
    fail('Use positive trial limits with minimumTrials <= maximumTrials and a valid batchSize.');
  }
}

function wilsonInterval(successes, trials, z) {
  if (!trials) return Object.freeze({ lower: null, upper: null, halfWidth: null });
  const probability = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (probability + z2 / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt((probability * (1 - probability) / trials) + (z2 / (4 * trials * trials))) / denominator;
  return Object.freeze({ lower: round(Math.max(0, center - halfWidth)),
    upper: round(Math.min(1, center + halfWidth)), halfWidth: round(halfWidth) });
}

function anytimeHoeffdingInterval(successes, trials, categoryCount, lookNumber, confidenceLevel) {
  if (!trials) return Object.freeze({ lower: null, upper: null, halfWidth: null, allocatedAlpha: null });
  // Spend alpha over an unbounded sequence of looks using sum 1/(k(k+1)) = 1.
  // Bonferroni across categories plus Hoeffding's inequality then bounds the
  // probability of any interval miss at any batch look by 1 - confidenceLevel.
  const alpha = 1 - confidenceLevel;
  const allocatedAlpha = alpha / (categoryCount * lookNumber * (lookNumber + 1));
  const halfWidth = Math.sqrt(Math.log(2 / allocatedAlpha) / (2 * trials));
  const probability = successes / trials;
  return Object.freeze({ lower: roundDown(Math.max(0, probability - halfWidth)),
    upper: roundUp(Math.min(1, probability + halfWidth)), halfWidth: roundUp(halfWidth),
    allocatedAlpha: Number(allocatedAlpha.toPrecision(12)) });
}

function summarize(counts, categories, trials, confidenceLevel, lookNumber) {
  const results = categories.map(category => {
    const count = counts[category];
    const probability = trials ? count / trials : null;
    // Retain the familiar fixed-look Wilson diagnostic, but do not use it for
    // adaptive stopping because its nominal coverage is not time-uniform.
    const nominalZ = confidenceLevel === 0.9 ? 1.6448536269514722
      : confidenceLevel === 0.99 ? 2.5758293035489004 : 1.959963984540054;
    return Object.freeze({ category, count, probability: round(probability),
      standardError: trials ? round(Math.sqrt(probability * (1 - probability) / trials)) : null,
      wilsonInterval: wilsonInterval(count, trials, nominalZ),
      anytimeInterval: anytimeHoeffdingInterval(count, trials, categories.length, lookNumber, confidenceLevel) });
  });
  const maximumHalfWidth = trials ? Math.max(...results.map(row => row.wilsonInterval.halfWidth)) : null;
  const maximumAnytimeHalfWidth = trials ? Math.max(...results.map(row => row.anytimeInterval.halfWidth)) : null;
  return Object.freeze({ categories: Object.freeze(results),
    maximumPointwiseWilsonHalfWidth: round(maximumHalfWidth),
    maximumAnytimeHoeffdingHalfWidth: roundUp(maximumAnytimeHalfWidth) });
}

/**
 * Sample a categorical simulation result until every marginal outcome share
 * reaches a requested alpha-spent Hoeffding half-width, or the trial ceiling is met.
 * The callback owns the actual simulation and must be reproducible from seed
 * and trialIndex. Each trial should represent one complete independent replay.
 */
export async function runAdaptiveCategoricalMonteCarlo({ drawTrial, seed, categories = ['a', 'b', 'unresolved'],
  targetHalfWidth = 0.02, confidenceLevel = 0.95, minimumTrials = 100, maximumTrials = 5000,
  batchSize = 100 } = {}, { signal, yieldEveryBatch = async () => {}, onProgress = () => {} } = {}) {
  validateOptions({ drawTrial, seed, categories, targetHalfWidth, confidenceLevel, minimumTrials, maximumTrials, batchSize });
  const numericConfidenceLevel = Number(confidenceLevel);
  const counts = Object.fromEntries(categories.map(category => [category, 0]));
  let trials = 0, stoppingReason = 'maximum-trials-reached';
  let lookNumber = 0;
  let summary = summarize(counts, categories, trials, numericConfidenceLevel, lookNumber);
  while (trials < maximumTrials) {
    if (signal?.aborted) {
      const error = new Error('Adaptive Monte Carlo run cancelled.');
      error.name = 'AbortError';
      throw error;
    }
    const batchEnd = Math.min(maximumTrials, trials + batchSize);
    while (trials < batchEnd) {
      const category = await drawTrial(trials, seed);
      if (!Object.hasOwn(counts, category)) fail(`drawTrial returned unknown outcome category: ${String(category)}.`);
      counts[category]++;
      trials++;
    }
    lookNumber++;
    summary = summarize(counts, categories, trials, numericConfidenceLevel, lookNumber);
    onProgress(trials / maximumTrials);
    if (trials >= minimumTrials && summary.maximumAnytimeHoeffdingHalfWidth <= targetHalfWidth) {
      stoppingReason = 'all-anytime-hoeffding-half-widths-at-or-below-target';
      break;
    }
    if (trials >= maximumTrials) {
      stoppingReason = 'maximum-trials-reached-target-not-met';
      break;
    }
    await yieldEveryBatch();
  }
  if (signal?.aborted) {
    const error = new Error('Adaptive Monte Carlo run cancelled.');
    error.name = 'AbortError';
    throw error;
  }
  const precisionTargetMet = stoppingReason === 'all-anytime-hoeffding-half-widths-at-or-below-target';
  return Object.freeze({
    format: ADAPTIVE_MONTE_CARLO_VERSION,
    status: 'complete',
    interpretation: 'Monte Carlo sampling uncertainty for categorical shares only; model uncertainty and calibration are not assessed. The alpha-spent Hoeffding intervals cover all requested categories across adaptive batch looks under independent simulation draws.',
    seed,
    trials,
    counts: Object.freeze({ ...counts }),
    outcomeShares: Object.freeze(Object.fromEntries(categories.map(category => [category, round(counts[category] / trials)]))),
    uncertainty: summary,
    stopping: Object.freeze({ method: 'batchwise-alpha-spent-hoeffding-half-width', confidenceLevel,
      targetHalfWidth, minimumTrials, maximumTrials, batchSize, precisionTargetMet, stoppingReason,
      simultaneousCoverageClaim: true,
      coverageScope: 'all-categories-across-all-batch-looks-under-independent-simulation-draws',
      nominalWilsonIntervalsAreDiagnosticOnly: true,
      reproducibilityContract: 'drawTrial must return the same category for a given seed and zero-based trialIndex' }),
  });
}

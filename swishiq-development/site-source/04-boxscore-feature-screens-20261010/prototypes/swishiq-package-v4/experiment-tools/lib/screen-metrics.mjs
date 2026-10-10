/* One-pass, read-only SCREEN aggregation over already-scored rows. */
import { probabilityMetrics } from '../../models/game-lab-candidate10-predictive-metrics-v2.mjs';

const SIDES = ['home', 'away', 'margin'];
const INTERVAL_LEVELS = [0.5, 0.8, 0.9, 0.95];
const PROBABILITY_EPSILON = 1e-12;

function finiteNumber(value, description) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${description} must be a finite number.`);
  }
  return value;
}

function addFinite(current, amount, description) {
  const next = current + amount;
  if (!Number.isFinite(next)) throw new RangeError(`${description} overflowed during SCREEN aggregation.`);
  return next;
}

function makeAccumulator(includeCalibrationSlope) {
  return {
    n: 0,
    probability: {
      brierSum: 0,
      logLikelihoodSum: 0,
      probabilitySum: 0,
      outcomeSum: 0,
      bins: Array.from({ length: 10 }, () => ({ count: 0, probabilitySum: 0, outcomeSum: 0 })),
      calibrationRows: includeCalibrationSlope ? [] : null,
    },
    sides: Object.fromEntries(SIDES.map(side => [side, {
      absoluteErrorSum: 0,
      squaredErrorSum: 0,
      errorSum: 0,
      crpsSum: 0,
      equalWeightIntervalScoreSum: 0,
      intervals: Object.fromEntries(INTERVAL_LEVELS.map(level => [String(level), {
        coveredCount: 0,
        widthSum: 0,
        scoreSum: 0,
      }])),
    }])),
  };
}

function validateScreenRow(row, index) {
  const label = `SCREEN row ${index + 1}`;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError(`${label} must be an object.`);
  }
  if (!Number.isSafeInteger(row.seasonStartYear)) {
    throw new TypeError(`${label}.seasonStartYear must be a safe integer.`);
  }
  if (typeof row.probability !== 'number' || !Number.isFinite(row.probability)
      || row.probability < 0 || row.probability > 1) {
    throw new TypeError(`${label}.probability must be finite and in [0, 1].`);
  }
  if (row.homeWin !== 0 && row.homeWin !== 1) {
    throw new TypeError(`${label}.homeWin must be binary.`);
  }
  if (!row.sides || typeof row.sides !== 'object' || Array.isArray(row.sides)) {
    throw new TypeError(`${label}.sides must be an object.`);
  }

  for (const side of SIDES) {
    const value = row.sides[side];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`${label}.sides.${side} must be an object.`);
    }
    const error = finiteNumber(value.error, `${label}.sides.${side}.error`);
    const squaredError = error ** 2;
    finiteNumber(squaredError, `${label}.sides.${side}.error squared`);
    const crps = finiteNumber(value.crps, `${label}.sides.${side}.crps`);
    if (crps < 0) throw new TypeError(`${label}.sides.${side}.crps must be non-negative.`);
    const equalWeightIntervalScore = finiteNumber(
      value.equalWeightIntervalScore,
      `${label}.sides.${side}.equalWeightIntervalScore`,
    );
    if (equalWeightIntervalScore < 0) {
      throw new TypeError(`${label}.sides.${side}.equalWeightIntervalScore must be non-negative.`);
    }
    if (!value.intervals || typeof value.intervals !== 'object' || Array.isArray(value.intervals)) {
      throw new TypeError(`${label}.sides.${side}.intervals must be an object.`);
    }
    for (const level of INTERVAL_LEVELS) {
      const key = String(level);
      const interval = value.intervals[key];
      if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
        throw new TypeError(`${label}.sides.${side}.intervals.${key} must be an object.`);
      }
      const width = finiteNumber(interval.width, `${label}.sides.${side}.intervals.${key}.width`);
      const score = finiteNumber(interval.score, `${label}.sides.${side}.intervals.${key}.score`);
      if (width < 0 || score < 0) {
        throw new TypeError(`${label}.sides.${side}.intervals.${key} width and score must be non-negative.`);
      }
      if (typeof interval.covered !== 'boolean') {
        throw new TypeError(`${label}.sides.${side}.intervals.${key}.covered must be a boolean.`);
      }
    }
  }
  return row;
}

function updateAccumulator(accumulator, row) {
  const probability = row.probability;
  const outcome = row.homeWin;
  const difference = probability - outcome;
  const probabilityForLogLoss = Math.max(PROBABILITY_EPSILON, Math.min(1 - PROBABILITY_EPSILON, probability));
  const logLikelihood = outcome * Math.log(probabilityForLogLoss)
    + (1 - outcome) * Math.log(1 - probabilityForLogLoss);
  const binIndex = Math.min(9, Math.floor(probability * 10));
  const bin = accumulator.probability.bins[binIndex];

  accumulator.n += 1;
  accumulator.probability.brierSum = addFinite(
    accumulator.probability.brierSum,
    difference ** 2,
    'Brier sum',
  );
  accumulator.probability.logLikelihoodSum = addFinite(
    accumulator.probability.logLikelihoodSum,
    logLikelihood,
    'Log-loss sum',
  );
  accumulator.probability.probabilitySum = addFinite(
    accumulator.probability.probabilitySum,
    probability,
    'Probability sum',
  );
  accumulator.probability.outcomeSum = addFinite(
    accumulator.probability.outcomeSum,
    outcome,
    'Outcome sum',
  );
  bin.count += 1;
  bin.probabilitySum = addFinite(bin.probabilitySum, probability, 'ECE probability-bin sum');
  bin.outcomeSum = addFinite(bin.outcomeSum, outcome, 'ECE outcome-bin sum');
  accumulator.probability.calibrationRows?.push({ probability, outcome });

  for (const side of SIDES) {
    const value = row.sides[side];
    const target = accumulator.sides[side];
    target.absoluteErrorSum = addFinite(target.absoluteErrorSum, Math.abs(value.error), `${side} absolute-error sum`);
    target.squaredErrorSum = addFinite(target.squaredErrorSum, value.error ** 2, `${side} squared-error sum`);
    target.errorSum = addFinite(target.errorSum, value.error, `${side} bias sum`);
    target.crpsSum = addFinite(target.crpsSum, value.crps, `${side} CRPS sum`);
    target.equalWeightIntervalScoreSum = addFinite(
      target.equalWeightIntervalScoreSum,
      value.equalWeightIntervalScore,
      `${side} equal-weight interval-score sum`,
    );

    for (const level of INTERVAL_LEVELS) {
      const key = String(level);
      const interval = value.intervals[key];
      const intervalTarget = target.intervals[key];
      intervalTarget.coveredCount = addFinite(
        intervalTarget.coveredCount,
        Number(interval.covered),
        `${side} ${key} interval-coverage count`,
      );
      intervalTarget.widthSum = addFinite(intervalTarget.widthSum, interval.width, `${side} ${key} interval-width sum`);
      intervalTarget.scoreSum = addFinite(intervalTarget.scoreSum, interval.score, `${side} ${key} interval-score sum`);
    }
  }
}

function summarizeProbability(accumulator, includeCalibrationSlope) {
  const n = accumulator.n;
  const probability = accumulator.probability;
  const ece = probability.bins.reduce((sum, bin) => (
    sum + (bin.count ? Math.abs(bin.probabilitySum - bin.outcomeSum) / n : 0)
  ), 0);
  const result = {
    n,
    brier: probability.brierSum / n,
    logLoss: -probability.logLikelihoodSum / n,
    calibrationInLarge: Math.abs(probability.probabilitySum / n - probability.outcomeSum / n),
    ece,
    calibrationSlope: null,
    calibrationSlopeIntercept: null,
    calibrationSlopeConverged: null,
    calibrationSlopeStatus: 'not-requested',
  };

  if (includeCalibrationSlope) {
    const canonical = probabilityMetrics(probability.calibrationRows);
    result.calibrationSlope = canonical.calibrationSlope;
    result.calibrationSlopeIntercept = canonical.calibrationSlopeIntercept;
    result.calibrationSlopeConverged = canonical.calibrationSlopeConverged;
    result.calibrationSlopeStatus = canonical.calibrationSlopeConverged ? 'converged' : 'not-converged';
  }
  return result;
}

function summarizeSides(accumulator) {
  const n = accumulator.n;
  return Object.fromEntries(SIDES.map(side => {
    const value = accumulator.sides[side];
    const intervals = Object.fromEntries(INTERVAL_LEVELS.map(level => {
      const key = String(level);
      const interval = value.intervals[key];
      return [key, {
        coverage: interval.coveredCount / n,
        meanWidth: interval.widthSum / n,
        intervalScore: interval.scoreSum / n,
      }];
    }));
    return [side, {
      mae: value.absoluteErrorSum / n,
      rmse: Math.sqrt(value.squaredErrorSum / n),
      bias: value.errorSum / n,
      crps: value.crpsSum / n,
      intervals,
      equalWeightIntervalScore: value.equalWeightIntervalScoreSum / n,
    }];
  }));
}

function summarizeAccumulator(accumulator, includeCalibrationSlope) {
  return {
    n: accumulator.n,
    probability: summarizeProbability(accumulator, includeCalibrationSlope),
    sides: summarizeSides(accumulator),
  };
}

export function summarizeScreenRows(rows, { includeCalibrationSlope = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('summarizeScreenRows requires a nonempty array of scored rows.');
  }
  if (typeof includeCalibrationSlope !== 'boolean') {
    throw new TypeError('includeCalibrationSlope must be a boolean.');
  }

  const pooled = makeAccumulator(includeCalibrationSlope);
  const seasons = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = validateScreenRow(rows[index], index);
    let season = seasons.get(row.seasonStartYear);
    if (!season) {
      season = makeAccumulator(includeCalibrationSlope);
      seasons.set(row.seasonStartYear, season);
    }
    updateAccumulator(pooled, row);
    updateAccumulator(season, row);
  }

  const perSeason = Object.fromEntries([...seasons].map(([seasonStartYear, accumulator]) => [
    String(seasonStartYear),
    summarizeAccumulator(accumulator, includeCalibrationSlope),
  ]));
  return { pooled: summarizeAccumulator(pooled, includeCalibrationSlope), perSeason };
}

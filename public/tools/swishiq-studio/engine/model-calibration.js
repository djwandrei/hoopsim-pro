/*
 * Small, browser-safe calibration helpers shared by the forward models.
 *
 * These functions are deliberately record-oriented.  A caller must provide
 * an explicit held-out row (or an explicit rolling-origin split) rather than
 * allowing the model to score the same observations used to fit it.  The
 * helpers return bounded, JSON-safe diagnostics and never turn missing
 * evidence into a zero.
 */

export const CALIBRATION_MODEL_VERSION = 'model-calibration-v2';
export const CALIBRATION_LIMITS = Object.freeze({ maxRecords: 100000, maxBins: 20 });

const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const rounded = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const fail = message => { throw new Error(message); };

function recordObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function usableRecords(records, label) {
  if (!Array.isArray(records)) fail(`${label} must be an array.`);
  if (records.length > CALIBRATION_LIMITS.maxRecords) fail(`${label} exceeds the bounded calibration record limit.`);
  return records;
}

/**
 * Standard error for a Bernoulli repeat rate.  It is kept separate from
 * confidence intervals because callers may want to pair the value with a
 * Wilson interval or a continuous Monte Carlo summary.
 */
export function monteCarloStandardError(probability, repeats) {
  if (!finite(probability) || probability < 0 || probability > 1) return null;
  if (!integer(repeats, 1, Number.MAX_SAFE_INTEGER)) return null;
  return rounded(Math.sqrt(Math.max(0, probability * (1 - probability)) / repeats));
}

/**
 * Create leakage-safe rolling-origin splits.  Each split trains only on
 * rows strictly before the holdout season and holds out the next available
 * season(s).  `trainEnd` is the last observed time in the training window,
 * rather than `holdoutStart - Number.EPSILON`; the latter rounds back to the
 * holdout start for ordinary integer season keys and makes a strict cutoff
 * look inclusive in audit receipts. Rows are returned as cloned references so
 * browser consumers cannot mutate the caller's source while scoring.
 */
export function rollingOriginSplits(rows, { timeKey = 'seasonStartYear', minTrain = 1, horizon = 1 } = {}) {
  const source = usableRecords(rows, 'Rolling-origin rows');
  if (typeof timeKey !== 'string' || !timeKey.trim()) fail('Rolling-origin timeKey must be a non-empty string.');
  if (!integer(minTrain, 1, 10000) || !integer(horizon, 1, 10000)) fail('Rolling-origin minTrain and horizon must be positive whole numbers.');
  const sorted = source.map((row, index) => {
    const entry = recordObject(row, `Rolling-origin row ${index + 1}`);
    const rawTime = entry[timeKey];
    const time = typeof rawTime === 'number' ? rawTime
      : typeof rawTime === 'string' && rawTime.trim() ? Number(rawTime) : Number.NaN;
    if (!finite(time)) fail(`Rolling-origin row ${index + 1} has no finite ${timeKey}.`);
    return { row, time, index };
  }).sort((left, right) => left.time - right.time || left.index - right.index);
  const times = [...new Set(sorted.map(entry => entry.time))];
  const splits = [];
  for (let cursor = minTrain; cursor < times.length; cursor += 1) {
    const holdoutWindow = times.slice(cursor, cursor + horizon);
    if (holdoutWindow.length !== horizon) continue;
    const holdoutTimes = new Set(holdoutWindow);
    const trainRows = sorted.filter(entry => entry.time < times[cursor]).map(entry => entry.row);
    const holdoutRows = sorted.filter(entry => holdoutTimes.has(entry.time)).map(entry => entry.row);
    if (trainRows.length && holdoutRows.length) {
      splits.push({ index: splits.length + 1, trainEnd: times[cursor - 1],
        holdoutStart: holdoutWindow[0], holdoutEnd: holdoutWindow.at(-1),
        train: trainRows.slice(), holdout: holdoutRows.slice() });
    }
  }
  return splits;
}

function binIndex(probability, bins) {
  return Math.min(bins - 1, Math.max(0, Math.floor(probability * bins)));
}

/**
 * Summarize binary forecasts on an explicitly held-out set.  Records use
 * `{ probability, outcome }`; outcome may be 0/1 or false/true.
 */
export function binaryCalibrationSummary(records, { bins = 10, scope = 'held-out' } = {}) {
  const source = usableRecords(records, 'Binary calibration records');
  if (!integer(bins, 2, CALIBRATION_LIMITS.maxBins)) fail('Binary calibration bins must be between 2 and 20.');
  const rows = source.map((row, index) => {
    const entry = recordObject(row, `Binary calibration row ${index + 1}`);
    const probability = Number(entry.probability);
    const rawOutcome = entry.outcome;
    if (rawOutcome === null || rawOutcome === undefined || entry.probability === null || entry.probability === undefined) {
      fail(`Binary calibration row ${index + 1} cannot use a missing probability or outcome.`);
    }
    const outcome = rawOutcome === true ? 1 : rawOutcome === false ? 0 : Number(rawOutcome);
    if (!finite(probability) || probability < 0 || probability > 1 || !finite(outcome) || ![0, 1].includes(outcome)) {
      fail(`Binary calibration row ${index + 1} needs a probability in [0,1] and a binary outcome.`);
    }
    if (entry.holdout !== true) fail(`Binary calibration row ${index + 1} is not marked held-out.`);
    return { probability, outcome };
  });
  if (!rows.length) return { status: 'unavailable', version: CALIBRATION_MODEL_VERSION, scope, sample: 0, brier: null, logLoss: null, bins: [] };
  const epsilon = 1e-12;
  const brier = rows.reduce((sum, row) => sum + ((row.probability - row.outcome) ** 2), 0) / rows.length;
  const logLoss = -rows.reduce((sum, row) => sum + row.outcome * Math.log(Math.max(epsilon, row.probability))
    + (1 - row.outcome) * Math.log(Math.max(epsilon, 1 - row.probability)), 0) / rows.length;
  const grouped = Array.from({ length: bins }, (_, index) => ({ bin: index, lower: index / bins, upper: (index + 1) / bins,
    count: 0, meanPredicted: null, observedRate: null }));
  rows.forEach(row => { const bucket = grouped[binIndex(row.probability, bins)]; bucket.count += 1; bucket.meanPredicted = (bucket.meanPredicted ?? 0) + row.probability; bucket.observedRate = (bucket.observedRate ?? 0) + row.outcome; });
  grouped.forEach(bucket => { if (bucket.count) { bucket.meanPredicted = rounded(bucket.meanPredicted / bucket.count); bucket.observedRate = rounded(bucket.observedRate / bucket.count); } });
  return { status: 'complete', version: CALIBRATION_MODEL_VERSION, scope, sample: rows.length,
    prevalence: rounded(rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length), brier: rounded(brier), logLoss: rounded(logLoss), bins: grouped,
    note: 'Scores are computed only from the supplied held-out records; they are not in-sample fit statistics.' };
}

/**
 * Summarize continuous forecasts.  Each row needs `{ prediction, actual }`;
 * optional `{ lower, upper, interval }` fields produce empirical coverage.
 */
export function continuousCalibrationSummary(records, { scope = 'held-out' } = {}) {
  const source = usableRecords(records, 'Continuous calibration records');
  const rows = source.map((row, index) => {
    const entry = recordObject(row, `Continuous calibration row ${index + 1}`);
    if (entry.prediction === null || entry.prediction === undefined || entry.actual === null || entry.actual === undefined) {
      fail(`Continuous calibration row ${index + 1} cannot use a missing prediction or actual value.`);
    }
    const prediction = Number(entry.prediction), actual = Number(entry.actual);
    if (!finite(prediction) || !finite(actual)) fail(`Continuous calibration row ${index + 1} needs finite prediction and actual values.`);
    if (entry.holdout !== true) fail(`Continuous calibration row ${index + 1} is not marked held-out.`);
    const lower = entry.lower === undefined || entry.lower === null ? null : Number(entry.lower);
    const upper = entry.upper === undefined || entry.upper === null ? null : Number(entry.upper);
    if ((lower !== null && !finite(lower)) || (upper !== null && !finite(upper)) || (lower !== null && upper !== null && lower > upper)) {
      fail(`Continuous calibration row ${index + 1} has an invalid interval.`);
    }
    return { prediction, actual, lower, upper, interval: entry.interval ?? null };
  });
  if (!rows.length) return { status: 'unavailable', version: CALIBRATION_MODEL_VERSION, scope, sample: 0, mae: null, rmse: null, intervals: [] };
  const errors = rows.map(row => row.prediction - row.actual);
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / rows.length;
  const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / rows.length);
  const intervalKeys = [...new Set(rows.filter(row => row.lower !== null && row.upper !== null).map(row => row.interval ?? 'unspecified'))];
  const intervals = intervalKeys.map(interval => {
    const selected = rows.filter(row => row.lower !== null && row.upper !== null && (row.interval ?? 'unspecified') === interval);
    const covered = selected.filter(row => row.actual >= row.lower && row.actual <= row.upper).length;
    return { interval, sample: selected.length, coverage: selected.length ? rounded(covered / selected.length) : null, covered, expected: null };
  });
  return { status: 'complete', version: CALIBRATION_MODEL_VERSION, scope, sample: rows.length, mae: rounded(mae), rmse: rounded(rmse), intervals,
    note: 'Errors and interval coverage are computed only from the supplied held-out records.' };
}

export function calibrationReceipt({ scope, status = 'complete', heldOut = null, cutoffs = [], modelVersion = CALIBRATION_MODEL_VERSION } = {}) {
  if (typeof scope !== 'string' || !scope.trim()) fail('Calibration receipts need a scope.');
  if (!['complete', 'unavailable', 'blocked'].includes(status)) fail('Calibration receipt status is unsupported.');
  if (!Array.isArray(cutoffs) || cutoffs.some(value => !finite(Number(value)))) fail('Calibration receipt cutoffs must be finite.');
  return Object.freeze({ version: CALIBRATION_MODEL_VERSION, modelVersion: String(modelVersion), scope: scope.trim(), status,
    heldOut: heldOut && typeof heldOut === 'object' ? { ...heldOut } : null, cutoffs: [...cutoffs], leakageGuard: 'strict-before-holdout-v1' });
}

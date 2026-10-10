/* Independent scoring helpers with fail-closed input guards; no prediction-model imports. */
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const PROBABILITY_EPSILON = 1e-12;
// Clip p=0/1 to [1e-12, 1-1e-12] only for log loss and logistic calibration numerics.
// Brier score and ECE bins continue to use the original validated probability.
const clampForNumerics = p => Math.max(PROBABILITY_EPSILON, Math.min(1 - PROBABILITY_EPSILON, p));
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));

function validateProbabilityRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new TypeError('probabilityMetrics requires a nonempty array of rows.');
  }
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || typeof row.probability !== 'number' || !Number.isFinite(row.probability)
        || row.probability < 0 || row.probability > 1
        || (row.outcome !== 0 && row.outcome !== 1)) {
      throw new TypeError(`Probability row ${index + 1} must have a finite probability in [0, 1] and a binary outcome.`);
    }
  }
}

export function probabilityMetrics(rows) {
  validateProbabilityRows(rows);
  const bins = Array.from({ length: 10 }, () => ({ count: 0, p: 0, y: 0 }));
  const points = rows.map(row => {
    const p = row.probability;
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.count += 1; bin.p += p; bin.y += row.outcome;
    const pForNumerics = clampForNumerics(p);
    return { x: Math.log(pForNumerics / (1 - pForNumerics)), y: row.outcome };
  });
  let intercept = 0; let slope = 1; let converged = false;
  const objective = (a, b) => points.reduce((sum, row) => {
    const p = clampForNumerics(sigmoid(a + b * row.x));
    return sum + (row.y ? Math.log(p) : Math.log(1 - p));
  }, 0);
  let value = objective(intercept, slope);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    let g0 = 0; let g1 = 0; let h00 = 0; let h01 = 0; let h11 = 0;
    for (const row of points) {
      const p = sigmoid(intercept + slope * row.x);
      const variance = p * (1 - p);
      g0 += row.y - p; g1 += (row.y - p) * row.x;
      h00 += variance; h01 += variance * row.x; h11 += variance * row.x * row.x;
    }
    const determinant = h00 * h11 - h01 * h01;
    if (!Number.isFinite(determinant) || determinant <= 1e-12) break;
    const d0 = (g0 * h11 - g1 * h01) / determinant;
    const d1 = (g1 * h00 - g0 * h01) / determinant;
    let accepted = false;
    for (let step = 1; step >= 1e-7; step /= 2) {
      const a = intercept + step * d0; const b = slope + step * d1;
      const next = objective(a, b);
      if (next >= value - 1e-12) {
        converged = Math.abs(a - intercept) + Math.abs(b - slope) < 1e-9;
        intercept = a; slope = b; value = next; accepted = true; break;
      }
    }
    if (converged || !accepted) break;
  }
  return {
    n: rows.length,
    brier: mean(rows.map(row => (row.probability - row.outcome) ** 2)),
    logLoss: -mean(rows.map(row => row.outcome * Math.log(clampForNumerics(row.probability))
      + (1 - row.outcome) * Math.log(1 - clampForNumerics(row.probability)))),
    calibrationInLarge: Math.abs(mean(rows.map(row => row.probability)) - mean(rows.map(row => row.outcome))),
    ece: bins.reduce((sum, bin) => sum + (bin.count ? Math.abs(bin.p - bin.y) / rows.length : 0), 0),
    calibrationSlope: converged ? slope : null,
    calibrationSlopeIntercept: converged ? intercept : null,
    calibrationSlopeConverged: converged,
  };
}

export function pointMetrics(errors) {
  if (!Array.isArray(errors) || errors.length === 0
      || errors.some(error => typeof error !== 'number' || !Number.isFinite(error))) {
    throw new TypeError('pointMetrics requires a nonempty array of finite numeric errors.');
  }
  return { mae: mean(errors.map(Math.abs)), rmse: Math.sqrt(mean(errors.map(value => value ** 2))), bias: mean(errors) };
}

// Experimental infrastructure port of the frozen original inference.
// Only draw generation is replaced with a reusable pinned plan. Numerical parity is pending.
import { verifyCanonicalPlan } from './canonical-plan.mjs';
export const PORTED_ORIGINAL_SHA256 = '42b23ee808b0fcd392556bcddce6a6d9c1ff43af04179005cdbcd793015020cd';
/* Exact paired losses; bootstrap only the uncertainty, not the predictions. */
import { createHash } from 'node:crypto';
import { probabilityMetrics } from '../../models/game-lab-candidate10-predictive-metrics-v2.mjs';
export const INFERENCE_VERSION = 'swishiq-candidate57-calendar-block-shared-team-maxT-v1';
const SIDES = ['home', 'away', 'margin'];
const LEVELS = ['0.5', '0.8', '0.9', '0.95'];
const WIDTH = 40;
const DAY = 86400000;
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const clamp = p => Math.max(1e-12, Math.min(1 - 1e-12, p));
const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
function fail(message) { throw new TypeError(message); }
function quantile(values, p) {
  const ordered = Array.from(values).sort((a, b) => a - b);
  const index = (ordered.length - 1) * p; const lower = Math.floor(index);
  return ordered[lower] + (index - lower) * (ordered[Math.ceil(index)] - ordered[lower]);
}
function sd(values) {
  const center = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / (values.length - 1));
}
function probabilityValues(sums, slope) {
  let signed = 0; let ece = 0;
  for (let index = 27; index < 37; index += 1) { signed += sums[index]; ece += Math.abs(sums[index]); }
  return [Math.abs(signed), ece, sums[37], sums[38], slope + sums[39]];
}
function contrastValues(sums) {
  return [...sums.slice(0, 3), ...SIDES.map((_, i) => Math.sqrt(sums[3 + i]) - Math.sqrt(sums[6 + i])),
    ...sums.slice(9, 15)];
}
function buildSeason(rows, mode, teamIndex) {
  const first = Math.min(...rows.map(row => Date.parse(row.gameDateLocal + 'T00:00:00.000Z')));
  const last = Math.max(...rows.map(row => Date.parse(row.gameDateLocal + 'T00:00:00.000Z')));
  const dates = new Set(rows.map(row => row.gameDateLocal));
  const probability = probabilityMetrics(rows.map(row => ({ probability: row[mode].probability, outcome: row.homeWin })));
  if (!probability.calibrationSlopeConverged) fail('Calibration slope must be available');
  const slope = probability.calibrationSlope; const intercept = probability.calibrationSlopeIntercept;
  let h00 = 0; let h01 = 0; let h11 = 0;
  for (const row of rows) {
    const p = clamp(row[mode].probability); const x = Math.log(p / (1 - p));
    const q = sigmoid(intercept + slope * x); const w = q * (1 - q) / rows.length;
    h00 += w; h01 += w * x; h11 += w * x * x;
  }
  const determinant = h00 * h11 - h01 * h01;
  if (determinant <= 1e-12) fail('Singular calibration-slope influence calculation');
  const indexed = rows.map(row => {
    const value = new Float64Array(WIDTH);
    SIDES.forEach((side, i) => {
      const x = row[mode].sides[side];
      value[i] = Math.abs(x.error) - Math.abs(x.baselineError);
      value[3 + i] = x.error ** 2; value[6 + i] = x.baselineError ** 2;
      value[9 + i] = x.crps - x.baselineCrps;
      value[12 + i] = average(LEVELS.map(level => x.intervals[level].score - x.baselineIntervals[level].score));
      LEVELS.forEach((level, j) => { value[15 + i * 4 + j] = Number(x.intervals[level].covered); });
    });
    const p = clamp(row[mode].probability); const y = row.homeWin; const base = clamp(row.constantProbability);
    value[27 + Math.min(9, Math.floor(p * 10))] = p - y;
    value[37] = (p - y) ** 2 - (base - y) ** 2;
    value[38] = -(y * Math.log(p) + (1 - y) * Math.log(1 - p))
      + y * Math.log(base) + (1 - y) * Math.log(1 - base);
    const logit = Math.log(p / (1 - p)); const g0 = y - sigmoid(intercept + slope * logit);
    value[39] = (-h01 * g0 + h00 * g0 * logit) / determinant;
    const day = Math.round((Date.parse(row.gameDateLocal + 'T00:00:00.000Z') - first) / DAY);
    const home = teamIndex.get(String(row.homeTeamId)); const away = teamIndex.get(String(row.awayTeamId));
    if (value.some(v => !Number.isFinite(v)) || !Number.isSafeInteger(day)
        || !Number.isSafeInteger(home) || !Number.isSafeInteger(away) || home === away) fail('Invalid inference row');
    return { day, home, away, value };
  });
  const point = new Float64Array(WIDTH);
  for (const row of indexed) for (let i = 0; i < WIDTH; i += 1) point[i] += row.value[i] / rows.length;
  return { year: rows[0].seasonStartYear, rows: indexed, point, slope, probability,
    dateSpan: Math.round((last - first) / DAY) + 1, dateClusters: dates.size };
}
function simultaneous(point, samples, indices, correction, name) {
  const errors = indices.map(index => sd(samples[index]));
  if (errors.some(value => !Number.isFinite(value) || value <= 1e-12)) fail('Invalid bootstrap standard error');
  const maxT = new Float64Array(samples[0].length);
  for (let r = 0; r < maxT.length; r += 1) {
    maxT[r] = Math.max(...indices.map((index, i) => Math.abs(samples[index][r] - point[index]) / errors[i]));
  }
  const critical = quantile(maxT, 0.95);
  return { family: name, criticalValue: critical, contrasts: indices.map((index, i) => ({
    id: index < 3 ? SIDES[index] + '-mae-delta' : index < 6 ? SIDES[index - 3] + '-rmse-delta'
      : index < 9 ? SIDES[index - 6] + '-crps-delta' : SIDES[index - 9] + '-equal-interval-score-delta',
    estimate: point[index], standardError: errors[i] * correction,
    lower: point[index] - critical * errors[i] * correction,
    upper: point[index] + critical * errors[i] * correction,
  })) };
}
export function inferPlannedPairedLosses({ rows, mode, resamplingPlan, replicates = 10000, seed = 20261005,
  blockLengths = [7, 14] } = {}) {
  if (!Array.isArray(rows) || !rows.length || new Set(rows.map(row => row.gameId)).size !== rows.length
      || !Number.isSafeInteger(replicates) || replicates < 20) fail('Unique paired rows and resamples required');
  if (!Array.isArray(blockLengths) || !blockLengths.length
      || blockLengths.some(value => !Number.isSafeInteger(value) || value < 1)) fail('Positive integer block lengths required');
  verifyCanonicalPlan(resamplingPlan, rows, { replicates, seed, blockLengths });
  const teams = [...new Set(rows.flatMap(row => [String(row.homeTeamId), String(row.awayTeamId)]))].sort();
  if (teams.length < 2) fail('At least two shared franchise nodes required');
  const teamIndex = new Map(teams.map((team, i) => [team, i]));
  const years = [...new Set(rows.map(row => row.seasonStartYear))].sort((a, b) => a - b);
  const seasons = years.map(year => buildSeason(rows.filter(row => row.seasonStartYear === year), mode, teamIndex));
  if (seasons.some(season => season.dateClusters < 2)) fail('Each fold requires at least two game dates');
  const point = new Float64Array(12);
  for (const season of seasons) contrastValues(season.point).forEach((value, i) => { point[i] += value / seasons.length; });
  const minDates = Math.min(...seasons.map(s => s.dateClusters));
  const correction = Math.sqrt(teams.length / (teams.length - 1) * minDates / (minDates - 1));
  const methods = [];
  for (const blockLength of blockLengths) {
    const planMethod = resamplingPlan.methods.find(method => method.blockLengthDays === blockLength);
    const samples = Array.from({ length: 12 }, () => new Float64Array(replicates));
    const foldSamples = seasons.map(() => Array.from({ length: 17 }, () => new Float64Array(replicates)));
    for (let replicate = 0; replicate < replicates; replicate += 1) {
      const planOffset = replicate * planMethod.stride;
      const teamCounts = planMethod.counts.subarray(planOffset, planOffset + teams.length);
      seasons.forEach((season, fold) => {
        const dateOffset = planOffset + planMethod.seasonOffsets[fold];
        const dates = planMethod.counts.subarray(dateOffset, dateOffset + season.dateSpan);
        const sums = new Float64Array(WIDTH); let total = 0;
        for (const row of season.rows) {
          const weight = dates[row.day] * teamCounts[row.home] * teamCounts[row.away];
          if (!weight) continue;
          total += weight;
          for (let i = 0; i < WIDTH; i += 1) sums[i] += weight * row.value[i];
        }
        if (!total) fail('Empty weighted fold');
        for (let i = 0; i < WIDTH; i += 1) sums[i] /= total;
        contrastValues(sums).forEach((value, i) => { samples[i][replicate] += value / seasons.length; });
        [...sums.slice(15, 27), ...probabilityValues(sums, season.slope)].forEach((value, i) => {
          foldSamples[fold][i][replicate] = value;
        });
      });
    }
    const families = [simultaneous(point, samples, [0, 1, 2], correction, 'mae'),
      simultaneous(point, samples, [3, 4, 5], correction, 'rmse'),
      simultaneous(point, samples, [6, 7, 8, 9, 10, 11], correction, 'proper-distribution-loss')];
    const sampleHash = createHash('sha256');
    for (const column of samples) sampleHash.update(Buffer.from(column.buffer));
    methods.push({ blockLengthDays: blockLength, replicateCount: replicates, seed: seed + blockLength,
      bootstrapContrastSamplesSha256: sampleHash.digest('hex'), finiteClusterCorrection: correction, families,
      perFoldUncertainty: seasons.map((season, fold) => ({ year: season.year,
        intervals: foldSamples[fold].map((values, i) => ({
          id: i < 12 ? SIDES[Math.floor(i / 4)] + '-coverage-' + LEVELS[i % 4]
            : ['calibration-in-large', 'ece10', 'brier-delta', 'logloss-delta', 'calibration-slope-linearized'][i - 12],
          lower: quantile(values, 0.025), upper: quantile(values, 0.975), standardError: sd(values),
          method: i === 16 ? 'linearized influence bootstrap; descriptive' : 'paired crossed bootstrap percentile; descriptive',
        })) })) });
  }
  return { version: INFERENCE_VERSION, n: rows.length, mode, seasons: years, teams,
    estimand: 'equal fold mean of within-fold differences; RMSE calculated before averaging folds',
    dateDesign: 'moving calendar blocks with replacement; include off-days; shorten final block',
    teamDesign: 'one shared franchise-node draw across all folds; game weight = date count * home count * away count',
    confidenceFamily: '95% max-absolute-T; fixed bootstrap SE; finite cluster correction applied to interval SE',
    perFoldProbability: seasons.map(season => ({ year: season.year, ...season.probability })), methods };
}

import { sharedLineupOpportunityProbabilities } from './shared-production-game-input-v1.mjs';

export const SHARED_POSSESSION_MAPPING_V4 = 'prior-pf-linked-possession-v4';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const fields = ['points', 'fieldGoalAttempts', 'fieldGoalsMade', 'freeThrowAttempts', 'freeThrowsMade',
  'threePointAttempts', 'threePointersMade', 'offensiveRebounds', 'opponentDefensiveRebounds',
  'personalFoulsDrawn', 'commonFoulsDrawn', 'shootingFoulsDrawn', 'bonusCommonFoulsDrawn'];
const zeros = () => new Float64Array(fields.length);
function review(reason) {
  throw Object.assign(new Error(`Shared V4 possession mapping requires review: ${reason}`), {
    productionReview: { status: 'requires-review', reason },
  });
}

function shotComponents(offense, defense, shift, baseShotMix, foulWeights) {
  const fga = offense.reduce((sum, row) => sum + row.fgaPer36, 0);
  const weights = defense.map(row => foulWeights ? row.personalFoulsPer36 : row.blocksPer36);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const result = { points: 0, makes: 0, threeMakes: 0, threeAttempts: 0,
    freeThrowAttempts: 0, freeThrowsMade: 0, missedLastFreeThrows: 0 };
  for (const row of offense) {
    const mix = baseShotMix ? row.baseThreeAttemptShare ?? row.threeAttemptShare : row.threeAttemptShare;
    if (![mix, row.freeThrowPct].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) review('invalid-shot-input');
    for (const [index, defender] of defense.entries()) {
      const rating = defender.player?.defenseRating ?? 50;
      if (!Number.isFinite(rating) || rating < 0 || rating > 100) review('invalid-defense-rating');
      const defenderShare = totalWeight > 0 ? weights[index] / totalWeight : 1 / defense.length;
      for (const [shotShare, value, pct, ceiling] of [[mix, 3, row.threePointPct, 0.53], [1 - mix, 2, row.twoPointPct, 0.75]]) {
        const weight = row.fgaPer36 / fga * defenderShare * shotShare;
        const q = clamp(pct + shift - (rating - 50) * 0.0008, 0, ceiling);
        const awards = q + (1 - q) * value;
        result.points += weight * q * value;
        result.makes += weight * q;
        result.freeThrowAttempts += weight * awards;
        result.freeThrowsMade += weight * awards * row.freeThrowPct;
        result.missedLastFreeThrows += weight * (1 - row.freeThrowPct);
        if (value === 3) { result.threeMakes += weight * q; result.threeAttempts += weight; }
      }
    }
  }
  return result;
}

function validateContext(offense, defense, possessions, options) {
  const opportunities = sharedLineupOpportunityProbabilities(offense, defense, possessions);
  for (const row of [...offense, ...defense]) {
    if (!Number.isFinite(row.personalFoulsPer36) || row.personalFoulsPer36 < 0) review('missing-or-invalid-total-pf-rate');
    if (!Number.isFinite(row.freeThrowPct) || row.freeThrowPct < 0 || row.freeThrowPct > 1) review('invalid-free-throw-efficiency');
  }
  const { shift, commonFoulProbability: common, shootingFoulProbability: shooting, offensiveReboundChance: retention } = options;
  if (!Number.isInteger(possessions) || possessions < 4 || possessions > 400 || !Number.isFinite(shift) ||
      ![common, shooting, retention].every(value => Number.isFinite(value) && value >= 0 && value <= 1) ||
      common + shooting >= 1 || retention >= 1) review('unsupported-moment-context');
  return opportunities;
}

/** Absorbing attack process for a fixed five and a declared regulation clock
 * approximation. Initial turnovers occur once per possession; below-bonus
 * common fouls retain control, and every final missed ordinary FT or clean
 * missed FG can recover offensively. All foul events advance the quota state.
 * The period clock is quantized to team-possession midpoints. This is exact
 * for that approximation, not for the live engine's within-turn event clock,
 * substitutions, technical penalties, or overtime. */
export function sharedPossessionMomentsV4(offense, defense, possessions, {
  shift = 0, commonFoulProbability = 0, shootingFoulProbability = 0,
  offensiveReboundChance = 0.24, baseShotMix = false,
} = {}) {
  const options = { shift, commonFoulProbability, shootingFoulProbability, offensiveReboundChance };
  const opportunities = validateContext(offense, defense, possessions, options);
  const clean = shotComponents(offense, defense, shift, baseShotMix, false);
  const shooting = shotComponents(offense, defense, shift, baseShotMix, true);
  const recipientWeight = offense.reduce((sum, row) => sum + row.fgaPer36 + row.assistsPer36, 0);
  const commonFtPct = offense.reduce((sum, row) => sum +
    (row.fgaPer36 + row.assistsPer36) / recipientWeight * row.freeThrowPct, 0);
  const c = commonFoulProbability, s = shootingFoulProbability, n = 1 - c - s;
  const r = offensiveReboundChance, t = opportunities.turnoverChance;
  const cleanMake = (1 - opportunities.blockChance) * clean.makes;
  const cleanMiss = 1 - cleanMake;
  const transitions = new Map();

  function kernel(late) {
    if (transitions.has(late)) return transitions.get(late);
    const size = late ? 18 : 6, kernels = [];
    // q=5 and late=2 saturate only state memory, never event counts.
    for (let index = size - 1; index >= 0; index -= 1) {
      const q = late ? Math.floor(index / 3) : index, l = late ? index % 3 : 0;
      const nextQ = Math.min(5, q + 1), nextL = late ? Math.min(2, l + 1) : 0;
      const next = late ? nextQ * 3 + nextL : nextQ;
      const bonus = nextQ >= 5 || (late && nextL >= 2);
      const commonMiss = bonus ? 1 - commonFtPct : 0;
      const cleanContinue = n * cleanMiss * r;
      const foulContinue = c * (bonus ? commonMiss * r : 1) + s * shooting.missedLastFreeThrows * r;
      const denominator = 1 - cleanContinue - (next === index ? foulContinue : 0);
      if (denominator <= 1e-10) review('nonabsorbing-attack-process');
      const reward = zeros();
      reward[0] = n * (1 - opportunities.blockChance) * clean.points +
        s * (shooting.points + shooting.freeThrowsMade) + c * (bonus ? 2 * commonFtPct : 0);
      reward[1] = n + s * shooting.makes;
      reward[2] = n * cleanMake + s * shooting.makes;
      reward[3] = s * shooting.freeThrowAttempts + (bonus ? 2 * c : 0);
      reward[4] = s * shooting.freeThrowsMade + (bonus ? 2 * c * commonFtPct : 0);
      reward[5] = n * clean.threeAttempts + s * shooting.threeMakes;
      reward[6] = n * (1 - opportunities.blockChance) * clean.threeMakes + s * shooting.threeMakes;
      const misses = n * cleanMiss + s * shooting.missedLastFreeThrows + c * commonMiss;
      reward[7] = misses * r; reward[8] = misses * (1 - r);
      reward[9] = c + s; reward[10] = c; reward[11] = s; reward[12] = bonus ? c : 0;
      const endings = new Float64Array(size);
      endings[index] += n * (1 - cleanMiss * r);
      endings[next] += c * (bonus ? 1 - commonMiss * r : 0) + s * (1 - shooting.missedLastFreeThrows * r);
      if (next !== index) {
        const successor = kernels[next];
        for (let j = 0; j < size; j += 1) endings[j] += foulContinue * successor.endings[j];
        for (let j = 0; j < reward.length; j += 1) reward[j] += foulContinue * successor.reward[j];
      }
      for (let j = 0; j < size; j += 1) endings[j] /= denominator;
      for (let j = 0; j < reward.length; j += 1) reward[j] /= denominator;
      // The turnover is outside the retained-attack process.
      kernels[index] = { endings, reward };
    }
    transitions.set(late, kernels); return kernels;
  }

  const total = zeros();
  for (let period = 0; period < 4; period += 1) {
    const count = Math.floor(possessions / 4) + (period < possessions % 4 ? 1 : 0);
    let distribution = new Float64Array(6); distribution[0] = 1;
    let inLateWindow = false;
    for (let i = 0; i < count; i += 1) {
      const late = 720 - (i + 0.5) * 720 / count <= 120;
      if (late && !inLateWindow) {
        const expanded = new Float64Array(18);
        for (let q = 0; q < 6; q += 1) expanded[q * 3] = distribution[q];
        distribution = expanded; inLateWindow = true;
      }
      const nextDistribution = new Float64Array(distribution.length), matrix = kernel(late);
      for (let state = 0; state < distribution.length; state += 1) {
        const probability = distribution[state]; if (probability === 0) continue;
        nextDistribution[state] += probability * t;
        for (let j = 0; j < distribution.length; j += 1) nextDistribution[j] += probability * (1 - t) * matrix[state].endings[j];
        for (let j = 0; j < total.length; j += 1) total[j] += probability * (1 - t) * matrix[state].reward[j];
      }
      if (Math.abs(nextDistribution.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) review('quota-transition-probability-does-not-reconcile');
      distribution = nextDistribution;
    }
  }
  if ([...total].some(value => !Number.isFinite(value) || value < -1e-10)) review('nonfinite-expected-counts');
  const perPossession = Object.fromEntries(fields.map((field, i) => [field, total[i] / possessions]));
  return { ...opportunities, commonFoulProbability: c, shootingFoulProbability: s,
    offensiveReboundChance: r, perPossession, regulation: Object.fromEntries(fields.map((field, i) => [field, total[i]])),
    method: 'quota-state-linked-retained-attack-expectation-v4',
    clockApproximation: 'uniform-team-possession-midpoints; all-retained-attacks-use-the-same-quota-clock-bin',
    omittedProcesses: ['live-within-turn-clock-crossings', 'lineup-and-foul-out-changes', 'technical-and-offensive-fouls', 'overtime'],
    empiricallySelected: false };
}

function linearSolve(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < vector.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < vector.length; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-14) return null;
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    const divisor = rows[column][column];
    for (let j = column; j <= vector.length; j += 1) rows[column][j] /= divisor;
    for (let row = 0; row < vector.length; row += 1) if (row !== column) {
      const factor = rows[row][column];
      for (let j = column; j <= vector.length; j += 1) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map(row => row[vector.length]);
}

function neutralShiftPlateau(rows, params) {
  let minimum = -1, maximum = 1, active = false;
  const blocks = rows.reduce((sum, row) => sum + row.blocksPer36, 0);
  const fouls = rows.reduce((sum, row) => sum + row.personalFoulsPer36, 0);
  for (const row of rows) {
    if (row.fgaPer36 === 0) continue;
    const mix = row.baseThreeAttemptShare ?? row.threeAttemptShare;
    for (const defender of rows) {
      if (blocks > 0 && defender.blocksPer36 === 0 &&
          (params[2] === 0 || (fouls > 0 && defender.personalFoulsPer36 === 0))) continue;
      const adjustment = ((defender.player?.defenseRating ?? 50) - 50) * 0.0008;
      for (const [weight, pct, ceiling] of [[mix, row.threePointPct, 0.53], [1 - mix, row.twoPointPct, 0.75]]) {
        if (weight === 0) continue;
        active = true;
        const raw = pct + params[0] - adjustment;
        if (raw >= ceiling) minimum = Math.max(minimum, ceiling - pct + adjustment);
        else if (raw <= 0) maximum = Math.min(maximum, -pct + adjustment);
        else return null;
      }
    }
  }
  return active && maximum - minimum > 1e-8 ? { minimum, maximum,
    canonicalShift: clamp(0, minimum, maximum), policy: 'closest-to-zero-shift-in-the-active-neutral-clamp-plateau' } : null;
}

/** Four linked neutral targets: points, FTA, total PF and player ORB. A latent
 * common/shooting split is fitted to these means, not claimed to be observed.
 * Inconsistent means remain a constrained numerical result with every gap.
 * Actual opponents/coaching keep the frozen neutral parameters as effects. */
export function calibrateSharedPossessionMappingV4(rows, possessions) {
  const targetFields = ['points', 'freeThrowAttempts', 'personalFoulsDrawn', 'offensiveRebounds'];
  const sourceFields = ['pointsPer36', 'ftAttPer36', 'personalFoulsPer36', 'offensiveReboundsPer36'];
  const targets = sourceFields.map(field => rows.reduce((sum, row) => {
    if (!Number.isFinite(row[field]) || row[field] < 0) review(`invalid-neutral-${field}`);
    return sum + row[field];
  }, 0) * (48 / 36) / possessions);
  const scales = [0.1, 0.05, 0.05, 0.04];
  function bounded(params) {
    const result = [clamp(params[0], -1, 1), clamp(params[1], 0, 0.98), clamp(params[2], 0, 0.98), clamp(params[3], 0, 0.95)];
    if (result[1] + result[2] > 0.98) { const scale = 0.98 / (result[1] + result[2]); result[1] *= scale; result[2] *= scale; }
    return result;
  }
  const expected = params => sharedPossessionMomentsV4(rows, rows, possessions, { shift: params[0],
    commonFoulProbability: params[1], shootingFoulProbability: params[2], offensiveReboundChance: params[3], baseShotMix: true });
  const losses = moments => targetFields.map((field, i) => (moments.perPossession[field] - targets[i]) / scales[i]);
  const norm = values => values.reduce((sum, value) => sum + value * value, 0);
  let params = [0, 0.06, 0.08, 0.24], moments = expected(params), residual = losses(moments), score = norm(residual), damping = 0.001;
  let iterations = 0;
  for (; iterations < 24 && score > 1e-12; iterations += 1) {
    const jacobian = Array.from({ length: 4 }, () => Array(4).fill(0));
    for (let j = 0; j < 4; j += 1) {
      const trial = [...params];
      const upper = j === 0 ? 1 : j === 3 ? 0.95 : 0.98;
      const backward = params[j] >= upper - 1e-4 || ([1, 2].includes(j) && params[1] + params[2] >= 0.98 - 1e-4);
      trial[j] += backward ? -1e-4 : 1e-4;
      const changed = bounded(trial), delta = changed[j] - params[j];
      if (Math.abs(delta) < 1e-12) continue;
      const next = losses(expected(changed));
      for (let i = 0; i < 4; i += 1) jacobian[i][j] = (next[i] - residual[i]) / delta;
    }
    const normal = Array.from({ length: 4 }, (_, j) => Array.from({ length: 4 }, (_, k) =>
      jacobian.reduce((sum, row) => sum + row[j] * row[k], 0) + (j === k ? damping : 0)));
    const gradient = Array.from({ length: 4 }, (_, j) => -jacobian.reduce((sum, row, i) => sum + row[j] * residual[i], 0));
    const step = linearSolve(normal, gradient); if (!step) break;
    const trial = bounded(params.map((value, i) => value + step[i])), nextMoments = expected(trial);
    const nextResidual = losses(nextMoments), nextScore = norm(nextResidual);
    if (nextScore < score) { params = trial; moments = nextMoments; residual = nextResidual; score = nextScore; damping = Math.max(1e-8, damping / 3); }
    else damping = Math.min(1e8, damping * 10);
  }
  const plateau = neutralShiftPlateau(rows, params);
  if (plateau) {
    params[0] = plateau.canonicalShift;
    moments = expected(params); residual = losses(moments); score = norm(residual);
  }
  const gaps = Object.fromEntries(targetFields.map((field, i) => [field, moments.perPossession[field] - targets[i]]));
  const requestedFga = rows.reduce((sum, row) => sum + row.fgaPer36, 0) * (48 / 36) / possessions;
  return { method: SHARED_POSSESSION_MAPPING_V4, makeProbabilityShift: params[0], commonFoulProbability: params[1],
    shootingFoulProbability: params[2], offensiveReboundChance: params[3],
    requestedPointsPerPossession: targets[0], requestedFreeThrowAttemptsPerPossession: targets[1],
    requestedPersonalFoulsPerPossession: targets[2], requestedOffensiveReboundsPerPossession: targets[3],
    requestedFieldGoalAttemptsPerPossession: requestedFga, appliedNeutralPointsPerPossession: moments.perPossession.points,
    neutralFieldGoalAttemptGap: moments.perPossession.fieldGoalAttempts - requestedFga,
    neutralFreeThrowAttemptGap: gaps.freeThrowAttempts, targetGaps: gaps, scaledSquaredError: score,
    constrained: score > 1e-6 || plateau !== null, iterations, neutralMoments: moments,
    neutralConversionIdentifiability: { activeMakeShiftClampPlateau: plateau,
      neutralEquivalentShiftChosenCanonically: plateau !== null,
      fullParameterIdentifiabilityEstablished: false,
      disclosure: 'A small target error is not proof of parameter identification. Active neutral clipping plateaus use the closest-to-zero equivalent shift and are flagged constrained; global uniqueness of the remaining decomposition is not established.' },
    shotMixBasis: 'base-before-coaching-shot-emphasis', empiricallySelected: false,
    disclosure: 'Development joint points/FTA/total-PF/ORB mean conversion. The common/shooting decomposition is generated, not observed subtype evidence. Regulation quota timing is approximated by team-possession midpoints; rotations, actual event clocks, technicals and OT can shift realized means. Absolute FGA drift and all target gaps remain visible.' };
}

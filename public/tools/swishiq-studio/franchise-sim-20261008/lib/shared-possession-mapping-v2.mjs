import { sharedLineupOpportunityProbabilities } from './shared-production-game-input-v1.mjs';

export const SHARED_POSSESSION_MAPPING_V2 = 'self-reference-possession-v2';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function review(reason) {
  throw Object.assign(new Error(`Shared possession mapping requires review: ${reason}`), {
    productionReview: { status: 'requires-review', reason },
  });
}
function components(offense, defense, shift, baseShotMix) {
  const fga = offense.reduce((sum, row) => sum + row.fgaPer36, 0);
  const blockWeights = defense.map(row => row.blocksPer36), blockSum = blockWeights.reduce((sum, value) => sum + value, 0);
  const shots = [];
  for (const row of offense) {
    const share = baseShotMix ? row.baseThreeAttemptShare ?? row.threeAttemptShare : row.threeAttemptShare;
    if (![share, row.freeThrowPct].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) review('invalid-v2-shot-components');
    for (const [index, defender] of defense.entries()) {
      const rating = defender.player?.defenseRating ?? 50;
      if (!Number.isFinite(rating) || rating < 0 || rating > 100) review('invalid-v2-defender-rating');
      const defenseAdjustment = (rating - 50) * 0.0008;
      const defenderWeight = blockSum > 0 ? blockWeights[index] / blockSum : 1 / defense.length;
      for (const [mix, points, make, ceiling] of [[share, 3, row.threePointPct, 0.53], [1 - share, 2, row.twoPointPct, 0.75]]) {
        shots.push({ weight: row.fgaPer36 / fga * mix * defenderWeight, points,
          q: clamp(make + shift - defenseAdjustment, 0, ceiling), ft: row.freeThrowPct });
      }
    }
  }
  return shots;
}

/** Exact expectation of the implemented development shot branch. A foul on a
 * made basket awards one FT; a missed two/three awards two/three. Its FTA/FGA
 * ratio is solved from those awards, including non-counted missed foul shots.
 * This is an arithmetic mapping, not an empirical causal or legality claim. */
export function sharedPossessionMomentsV2(offense, defense, possessions, {
  shift = 0, offensiveReboundChance = 0.24, baseShotMix = false,
} = {}) {
  const opportunities = sharedLineupOpportunityProbabilities(offense, defense, possessions);
  if (!Number.isFinite(shift) || !Number.isFinite(offensiveReboundChance) ||
      offensiveReboundChance < 0 || offensiveReboundChance >= 1) review('invalid-v2-moment-context');
  const shots = components(offense, defense, shift, baseShotMix);
  const fga = offense.reduce((sum, row) => sum + row.fgaPer36, 0), fta = offense.reduce((sum, row) => sum + row.ftAttPer36, 0);
  const ratio = fta / fga;
  const Q = shots.reduce((sum, shot) => sum + shot.weight * shot.q, 0);
  const L = shots.reduce((sum, shot) => sum + shot.weight * (shot.q + (1 - shot.q) * shot.points), 0);
  const denominator = L + ratio * (1 - Q);
  const foulChance = denominator > 0 ? ratio / denominator : 0;
  if (!Number.isFinite(ratio) || !Number.isFinite(foulChance) || foulChance < 0 || foulChance > 1) review('unsupported-v2-free-throw-ratio');
  const blockChance = opportunities.blockChance;
  let points = 0, fieldGoalsMade = 0, fieldGoalAttempts = 0, freeThrowAttempts = 0,
    freeThrowsMade = 0, threePointersMade = 0, threePointAttempts = 0, missedFieldGoals = 0, missedLastFreeThrows = 0;
  for (const shot of shots) {
    const cleanMade = (1 - blockChance) * shot.q;
    const make = (1 - foulChance) * cleanMade + foulChance * shot.q;
    const attempt = 1 - foulChance + foulChance * shot.q;
    const ftAttempts = foulChance * (shot.q + (1 - shot.q) * shot.points);
    fieldGoalsMade += shot.weight * make;
    fieldGoalAttempts += shot.weight * attempt;
    freeThrowAttempts += shot.weight * ftAttempts;
    freeThrowsMade += shot.weight * ftAttempts * shot.ft;
    points += shot.weight * (make * shot.points + ftAttempts * shot.ft);
    if (shot.points === 3) { threePointAttempts += shot.weight * attempt; threePointersMade += shot.weight * make; }
    missedFieldGoals += shot.weight * (1 - foulChance) * (1 - cleanMade);
    missedLastFreeThrows += shot.weight * foulChance * (1 - shot.ft);
  }
  const reboundingMisses = missedFieldGoals + missedLastFreeThrows;
  const continuation = reboundingMisses * offensiveReboundChance;
  const multiplier = (1 - opportunities.turnoverChance) / (1 - continuation);
  const perPossession = Object.fromEntries(Object.entries({ points, fieldGoalAttempts, fieldGoalsMade,
    freeThrowAttempts, freeThrowsMade, threePointAttempts, threePointersMade,
    offensiveRebounds: reboundingMisses * offensiveReboundChance,
    opponentDefensiveRebounds: reboundingMisses * (1 - offensiveReboundChance),
    shootingFoulsDrawn: foulChance }).map(([name, value]) => [name, value * multiplier]));
  if (Object.values(perPossession).some(value => !Number.isFinite(value) || value < 0)) review('nonfinite-v2-moments');
  return { ...opportunities, shotFoulChance: foulChance, continuationChance: continuation,
    requestedFreeThrowAttemptRatio: ratio, appliedFreeThrowAttemptRatio: fieldGoalAttempts > 0 ? freeThrowAttempts / fieldGoalAttempts : null,
    perPossession, method: 'linked-shot-and-free-throw-award-expectation-v2',
    omittedProcesses: ['non-shooting-fouls-and-bonus', 'dead-ball-and-team-rebounds', 'turnovers-after-offensive-rebounds'],
    empiricallySelected: false };
}

/** Each lineup's own turnover/block/rebound/defense context is the reference
 * for its fitted point mean. Actual opposing defenders and blocks remain in the
 * event branch. No historical outcome is needed; inputs are prior/scenario
 * player rates and ratings. Same-team symmetry is a mathematical invariant. */
export function calibrateSharedPossessionMappingV2(rows, possessions, { offensiveReboundChance = 0.24 } = {}) {
  const requestedPointsPerPossession = rows.reduce((sum, row) => sum + row.pointsPer36, 0) * (48 / 36) / possessions;
  if (!Number.isFinite(requestedPointsPerPossession) || requestedPointsPerPossession < 0 ||
      rows.some(row => !Number.isFinite(row.pointsPer36) || row.pointsPer36 < 0)) review('invalid-v2-point-budget');
  const expected = shift => sharedPossessionMomentsV2(rows, rows, possessions, { shift, offensiveReboundChance, baseShotMix: true });
  let low = -1, high = 1;
  const minimum = expected(low).perPossession.points, maximum = expected(high).perPossession.points;
  const target = clamp(requestedPointsPerPossession, minimum, maximum);
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (low + high) / 2;
    if (expected(middle).perPossession.points < target) low = middle; else high = middle;
  }
  const makeProbabilityShift = (low + high) / 2;
  const neutralMoments = expected(makeProbabilityShift);
  const appliedMoments = sharedPossessionMomentsV2(rows, rows, possessions, { shift: makeProbabilityShift, offensiveReboundChance });
  const requestedFieldGoalAttemptsPerPossession = rows.reduce((sum, row) => sum + row.fgaPer36, 0) * (48 / 36) / possessions;
  const requestedFreeThrowAttemptsPerPossession = rows.reduce((sum, row) => sum + row.ftAttPer36, 0) * (48 / 36) / possessions;
  return { method: SHARED_POSSESSION_MAPPING_V2, makeProbabilityShift, requestedPointsPerPossession,
    appliedNeutralPointsPerPossession: neutralMoments.perPossession.points,
    appliedShotMixNeutralPointsPerPossession: appliedMoments.perPossession.points,
    coachingShotMixMeanDrift: appliedMoments.perPossession.points - neutralMoments.perPossession.points,
    requestedFieldGoalAttemptsPerPossession, requestedFreeThrowAttemptsPerPossession,
    neutralFieldGoalAttemptGap: neutralMoments.perPossession.fieldGoalAttempts - requestedFieldGoalAttemptsPerPossession,
    neutralFreeThrowAttemptGap: neutralMoments.perPossession.freeThrowAttempts - requestedFreeThrowAttemptsPerPossession,
    neutralContext: { source: 'current-lineup-self-reference; prior-or-explicit-scenario-rates',
      turnoverChance: neutralMoments.turnoverChance, blockChance: neutralMoments.blockChance,
      offensiveReboundChance, defenseRatingCoefficient: 0.0008 }, neutralMoments,
    constrained: requestedPointsPerPossession < minimum || requestedPointsPerPossession > maximum,
    feasibleRange: [minimum, maximum], iterations: 28, shotMixBasis: 'base-before-coaching-shot-emphasis',
    empiricallySelected: false,
    disclosure: 'Experimental self-reference mean conversion and solved FT award ratio. Opponent effects remain active. Foul timing, bonus and rebound ownership still need separate models; fitted means do not guarantee observed accuracy.' };
}

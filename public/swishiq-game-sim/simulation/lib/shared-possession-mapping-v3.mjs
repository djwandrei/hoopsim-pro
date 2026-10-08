import { sharedPossessionMomentsV2 } from './shared-possession-mapping-v2.mjs';
import { estimateReboundOwnershipBudgetV1 } from './rebound-ownership-v1.mjs';

export const SHARED_POSSESSION_MAPPING_V3 = 'rate-linked-recovery-possession-v3';
// Numerical support for an absorbing possession process, not an NBA rule.
export const RATE_LINKED_RETENTION_CEILING_V3 = 0.95;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function review(reason) {
  throw Object.assign(new Error(`Shared possession mapping requires review: ${reason}`), {
    productionReview: { status: 'requires-review', reason },
  });
}
function requestedRate(rows, key, possessions) {
  if (!Array.isArray(rows) || rows.length !== 5 || !Number.isFinite(possessions) || possessions <= 0) {
    review('invalid-v3-lineup-context');
  }
  const sum = rows.reduce((total, row) => {
    if (!Number.isFinite(row?.[key]) || row[key] < 0) review(`invalid-v3-${key}`);
    return total + row[key];
  }, 0);
  const rate = sum * (48 / 36) / possessions;
  if (!Number.isFinite(rate)) review(`nonfinite-v3-${key}-budget`);
  return rate;
}

/** For a self-reference lineup, T is the initial turnover probability, M the
 * recoverable-miss probability per reached shot and O the projected ORB rate.
 * The required continuation is c=O/(1-T+O), with retention r=c/M. Therefore
 * reached shots per possession equal 1-T+O when the budget is feasible.
 * All offensive recoveries are player boards in this generated branch; no
 * unobserved extra offensive team-board population is fitted or asserted. */
export function deriveRateLinkedOffensiveRecoveryV3(rows, possessions, { shift = 0, baseShotMix = true } = {}) {
  const requestedOffensiveReboundsPerPossession = requestedRate(rows, 'offensiveReboundsPer36', possessions);
  const initial = sharedPossessionMomentsV2(rows, rows, possessions,
    { shift, baseShotMix, offensiveReboundChance: 0 });
  const nonTurnoverChance = 1 - initial.turnoverChance;
  if (nonTurnoverChance <= 0) review('unsupported-v3-all-turnover-lineup');
  const recoverableMissProbability = initial.perPossession.opponentDefensiveRebounds / nonTurnoverChance;
  const continuationTarget = requestedOffensiveReboundsPerPossession /
    (nonTurnoverChance + requestedOffensiveReboundsPerPossession);
  const rawRetention = recoverableMissProbability > 0 ? continuationTarget / recoverableMissProbability :
    requestedOffensiveReboundsPerPossession === 0 ? 0 : null;
  const offensiveReboundChance = rawRetention === null ? RATE_LINKED_RETENTION_CEILING_V3 :
    clamp(rawRetention, 0, RATE_LINKED_RETENTION_CEILING_V3);
  const continuationChance = recoverableMissProbability * offensiveReboundChance;
  const reachedShotsPerPossession = nonTurnoverChance / (1 - continuationChance);
  const appliedOffensiveReboundsPerPossession = reachedShotsPerPossession * continuationChance;
  if (![recoverableMissProbability, continuationTarget, continuationChance, reachedShotsPerPossession,
    appliedOffensiveReboundsPerPossession].every(value => Number.isFinite(value) && value >= 0)) {
    review('nonfinite-v3-recovery-volume');
  }
  return { method: 'prior-or-scenario-player-orb-linked-offensive-control-v3',
    offensiveReboundChance, requestedOffensiveReboundsPerPossession, appliedOffensiveReboundsPerPossession,
    continuationChance, requestedContinuationChance: continuationTarget, recoverableMissProbability,
    rawOffensiveReboundChance: rawRetention, reachedShotsPerPossession,
    numericalRetentionCeiling: RATE_LINKED_RETENTION_CEILING_V3,
    constrained: rawRetention === null || rawRetention > RATE_LINKED_RETENTION_CEILING_V3,
    source: 'current-five-prior-or-explicit-scenario-player-offensive-rebound-rates',
    empiricalOffensiveTeamRecoveryFrequencyAvailable: false,
    empiricallySelected: false };
}

export function sharedPossessionMomentsV3(offense, defense, possessions,
  { shift = 0, baseShotMix = false, offensiveReboundChance } = {}) {
  const recoveryVolume = deriveRateLinkedOffensiveRecoveryV3(offense, possessions, { shift, baseShotMix: true });
  const retention = offensiveReboundChance === undefined ? recoveryVolume.offensiveReboundChance : offensiveReboundChance;
  const moments = sharedPossessionMomentsV2(offense, defense, possessions,
    { shift, baseShotMix, offensiveReboundChance: retention });
  return { ...moments, method: 'linked-shot-ft-and-rate-linked-recovery-expectation-v3',
    offensiveReboundChance: retention, recoveryVolume: { ...recoveryVolume,
      appliedMatchupOffensiveReboundsPerPossession: moments.perPossession.offensiveRebounds,
      appliedMatchupRetentionProbability: retention,
      selection: offensiveReboundChance === undefined ? 'self-reference-rate-linked' : 'supplied-calibrated-matchup-or-scenario' },
    omittedProcesses: ['non-shooting-fouls-and-bonus', 'empirical-dead-ball-and-team-recovery-population',
      'turnovers-after-offensive-rebounds'], empiricallySelected: false };
}

export function calibrateSharedPossessionMappingV3(rows, possessions) {
  const requestedPointsPerPossession = requestedRate(rows, 'pointsPer36', possessions);
  const expected = shift => sharedPossessionMomentsV3(rows, rows, possessions, { shift, baseShotMix: true });
  let low = -1, high = 1;
  const minimum = expected(low).perPossession.points, maximum = expected(high).perPossession.points;
  if (minimum > maximum) review('nonmonotone-v3-calibration-range');
  const target = clamp(requestedPointsPerPossession, minimum, maximum);
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const middle = (low + high) / 2;
    if (expected(middle).perPossession.points < target) low = middle; else high = middle;
  }
  const makeProbabilityShift = (low + high) / 2;
  const neutralMoments = expected(makeProbabilityShift);
  const offensiveReboundChance = neutralMoments.offensiveReboundChance;
  // Freeze the neutral conversion; coaching shot mix remains a real scenario effect.
  const appliedMoments = sharedPossessionMomentsV3(rows, rows, possessions,
    { shift: makeProbabilityShift, offensiveReboundChance });
  const requestedFieldGoalAttemptsPerPossession = requestedRate(rows, 'fgaPer36', possessions);
  const requestedFreeThrowAttemptsPerPossession = requestedRate(rows, 'ftAttPer36', possessions);
  return { method: SHARED_POSSESSION_MAPPING_V3, makeProbabilityShift, requestedPointsPerPossession,
    offensiveReboundChance, recoveryVolume: neutralMoments.recoveryVolume,
    appliedNeutralPointsPerPossession: neutralMoments.perPossession.points,
    appliedShotMixNeutralPointsPerPossession: appliedMoments.perPossession.points,
    coachingShotMixMeanDrift: appliedMoments.perPossession.points - neutralMoments.perPossession.points,
    requestedFieldGoalAttemptsPerPossession, requestedFreeThrowAttemptsPerPossession,
    neutralFieldGoalAttemptGap: neutralMoments.perPossession.fieldGoalAttempts - requestedFieldGoalAttemptsPerPossession,
    neutralFreeThrowAttemptGap: neutralMoments.perPossession.freeThrowAttempts - requestedFreeThrowAttemptsPerPossession,
    neutralContext: { source: 'current-lineup-self-reference; prior-or-explicit-scenario-rates',
      turnoverChance: neutralMoments.turnoverChance, blockChance: neutralMoments.blockChance,
      offensiveReboundChance, defenseRatingCoefficient: 0.0008 }, neutralMoments,
    constrained: requestedPointsPerPossession < minimum || requestedPointsPerPossession > maximum ||
      neutralMoments.recoveryVolume.constrained,
    feasibleRange: [minimum, maximum], iterations: 28, shotMixBasis: 'base-before-coaching-shot-emphasis',
    empiricallySelected: false,
    disclosure: 'Development rate-linked offensive recovery volume with player credit for generated offensive boards. Neutral scoring and FT/FGA ratio are solved; absolute FGA/FTA gaps remain visible. Opponent and explicit scenario effects are retained. No empirical team-recovery population or predictive selection is established.' };
}

/** Keep opponent/coaching ORB effects rather than cancelling them through a
 * second player-ORB credit budget. Defensive attribution retains the parent
 * budget, with all remaining misses explicitly recovered by the team. */
export function estimateRateLinkedReboundOwnershipBudgetV3(context = {}) {
  const budget = estimateReboundOwnershipBudgetV1(context);
  if (Object.values(budget).some(value => typeof value === 'number' && !Number.isFinite(value))) {
    review('nonfinite-v3-player-rebound-budget');
  }
  const retention = context.offensiveRecoveryProbability === undefined ? 0.24 : context.offensiveRecoveryProbability;
  const offensiveRecoveries = context.expectedReboundOpportunitiesPerPossession * retention;
  const defensiveRecoveries = context.expectedReboundOpportunitiesPerPossession * (1 - retention);
  const appliedPlayerReboundsPerPossession = offensiveRecoveries +
    defensiveRecoveries * budget.defensivePlayerCreditProbability;
  return { ...budget, offensivePlayerCreditProbability: 1, appliedPlayerReboundsPerPossession,
    playerCreditProbability: context.expectedReboundOpportunitiesPerPossession > 0
      ? Math.min(1, appliedPlayerReboundsPerPossession / context.expectedReboundOpportunitiesPerPossession) : 0,
    appliedOffensiveReboundsPerPossession: offensiveRecoveries,
    offensiveReboundBudgetDrift: offensiveRecoveries - budget.requestedOffensiveReboundsPerPossession,
    source: 'rate-linked-offensive-control-with-player-credit; parent-defensive-attribution-budget-v3',
    disclosure: 'Generated offensive recoveries receive player credit. Defensive team recoveries remain generated attribution assumptions, not observed NBA frequencies.' };
}

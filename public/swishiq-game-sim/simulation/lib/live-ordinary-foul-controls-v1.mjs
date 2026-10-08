export const LIVE_ORDINARY_FOUL_SCENARIO_V1_FORMAT = 'djhc-live-ordinary-foul-scenario-v1';
const ruleProfile = 'nba-current-rule-scenario';
const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1;
function samePortableValue(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => samePortableValue(value, right[index]));
  if (!plain(left) || !plain(right)) return false;
  const keys = Object.keys(left).sort(), otherKeys = Object.keys(right).sort();
  return keys.length === otherKeys.length && keys.every((key, index) => key === otherKeys[index] &&
    samePortableValue(left[key], right[key]));
}
function review(reason) {
  throw Object.assign(new Error(`Live ordinary foul scenario requires review: ${reason}`), {
    foulReview: { status: 'requires-review', reason },
  });
}

/** Explicit generated-event probabilities, not estimates of historical foul
 * subtypes from total personal-foul boxes. Teams are the fouling defense.
 * The mutually exclusive draw occurs at each post-turnover attack opportunity;
 * a below-bonus common foul retains control and creates another opportunity. */
export function normalizeLiveOrdinaryFoulScenarioV1(scenario) {
  if (scenario === undefined) return null;
  if (!plain(scenario) || scenario.format !== LIVE_ORDINARY_FOUL_SCENARIO_V1_FORMAT ||
      scenario.version !== 1 || scenario.ruleProfile !== ruleProfile ||
      Object.keys(scenario).some(key => !['format', 'version', 'ruleProfile', 'teams', 'evidence'].includes(key)) ||
      !plain(scenario.teams) || Object.keys(scenario.teams).some(side => !['home', 'away'].includes(side)) ||
      !plain(scenario.evidence) || scenario.evidence.kind !== 'explicit-scenario' ||
      typeof scenario.evidence.source !== 'string' || !scenario.evidence.source.trim()) {
    review('invalid-explicit-ordinary-foul-scenario');
  }
  for (const side of ['home', 'away']) {
    const team = scenario.teams[side];
    if (!plain(team) || Object.keys(team).some(key => !['commonFoulProbability', 'shootingFoulProbability'].includes(key)) ||
        !probability(team.commonFoulProbability) || !probability(team.shootingFoulProbability) ||
        team.commonFoulProbability + team.shootingFoulProbability > 1) {
      review('invalid-or-overlapping-ordinary-foul-probabilities');
    }
  }
  return { ...structuredClone(scenario), empiricallySelected: false,
    opportunityDefinition: 'one-exclusive-common-shooting-or-no-foul-draw-per-post-turnover-attack; inbounds-and-offensive-recoveries-create-new-attacks',
    disclosure: 'Explicit simulator scenario. These subtype probabilities are not inferred from total personal-foul counts, and the existing neutral shooting conversion is not recalibrated for them. The standalone uniform-midpoint foul budget does not identify expected totals for this live opportunity sequence.' };
}

/** Total-PF actor weights remain distinct from the scenario's foul subtype
 * probabilities. Prefer a bound current-window rate, then the immediately
 * prior window. Missing coverage never becomes an observed zero. */
export function resolveLivePersonalFoulInputV1(player, { seasonStartYear, gameLocalDate } = {}) {
  for (const field of ['personalFoulsPer36', 'priorPersonalFoulsPer36']) {
    if (player[field] !== undefined && player[field] !== null && (!Number.isFinite(player[field]) || player[field] < 0)) {
      review('invalid-supplied-personal-foul-rate');
    }
  }
  if (player.personalFoulsPer36 !== undefined && player.personalFoulsPer36 !== null &&
      player.priorPersonalFoulsPer36 !== undefined && player.priorPersonalFoulsPer36 !== null &&
      player.personalFoulsPer36 !== player.priorPersonalFoulsPer36) review('conflicting-supplied-personal-foul-rates');
  const profile = player.priorPersonalFoulProfile ?? player.sharedProductionFeatures?.personalFoulHistory;
  if (player.priorPersonalFoulProfile !== undefined && player.sharedProductionFeatures?.personalFoulHistory !== undefined &&
      !samePortableValue(player.priorPersonalFoulProfile, player.sharedProductionFeatures.personalFoulHistory)) {
    review('conflicting-prior-personal-foul-profiles');
  }
  const suppliedRate = player.priorPersonalFoulsPer36 ?? player.personalFoulsPer36 ?? null;
  if (profile !== undefined) {
    validatePriorPersonalFoulRateV1(profile, { canonicalName: player.canonicalName ?? player.displayName ?? player.name,
      seasonStartYear, gameLocalDate });
    const summary = profile.currentSeason.ratePer36 !== null ? profile.currentSeason : profile.priorSeason;
    const ratePer36 = summary.ratePer36;
    if (suppliedRate !== null && (ratePer36 === null || suppliedRate !== ratePer36)) review('supplied-rate-conflicts-with-bound-history');
    return { ratePer36, source: ratePer36 === null ? 'unknown-prior-total-pf; uniform-actor-scenario'
      : 'validated-prior-total-personal-foul-window', support: structuredClone(summary),
      profileTargetDateExclusive: profile.targetDateExclusive, canonicalNameKey: profile.canonicalNameKey,
      categoryEvidence: 'total-personal-foul-only; common-shooting-assignment-is-scenario', empiricallySelected: false };
  }
  return { ratePer36: suppliedRate, source: suppliedRate === null ? 'missing-total-pf; uniform-actor-scenario'
    : 'explicit-supplied-total-personal-foul-rate', support: null, profileTargetDateExclusive: null,
    categoryEvidence: 'total-personal-foul-only; common-shooting-assignment-is-scenario', empiricallySelected: false };
}
import { validatePriorPersonalFoulRateV1 } from './prior-personal-foul-rate-v1.mjs';

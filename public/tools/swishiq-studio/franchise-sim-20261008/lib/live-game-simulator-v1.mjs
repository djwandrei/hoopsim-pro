import {
  predictGame,
  predictPlayerBoxRate,
  predictPlayerScoringRateDetails,
  resolveGameInputSeasonAges,
} from './game-simulator-v2.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { resolveRotationPlayerAvailability } from './franchise-controls-v1.mjs';
import { createRotationSchedule } from './rotation-schedule-v1.mjs';
import { normalizeLiveRotationControls, selectLiveRotation } from './live-rotation-controls-v1.mjs';
import { evaluatePersonalFoulDisqualification } from './nba-foul-disqualification-v1.mjs';
import { normalizeGameCoachingPlan } from './franchise-coaching-v1.mjs';
import { selectMinuteBudgetLineup } from './live-minute-budget-v1.mjs';
import { createNbaTimeoutState, chargeNbaTimeout, dueNbaMandatoryTimeout } from './nba-timeout-state-v1.mjs';
import { forecastGamePlayerProduction, projectSharedProductionShotRates,
  sharedLineupOpportunityProbabilities, calibrateSharedLineupScoring } from './shared-production-game-input-v1.mjs';
import { SHARED_POSSESSION_MAPPING_V2, sharedPossessionMomentsV2,
  calibrateSharedPossessionMappingV2 } from './shared-possession-mapping-v2.mjs';
import { SHARED_POSSESSION_MAPPING_V3, RATE_LINKED_RETENTION_CEILING_V3, sharedPossessionMomentsV3,
  calibrateSharedPossessionMappingV3, estimateRateLinkedReboundOwnershipBudgetV3 } from './shared-possession-mapping-v3.mjs';
import { SHARED_POSSESSION_MAPPING_V4, sharedPossessionMomentsV4,
  calibrateSharedPossessionMappingV4 } from './shared-possession-mapping-v4.mjs';
import { REBOUND_OWNERSHIP_BUDGET_V1, estimateReboundOwnershipBudgetV1, chooseReboundOwnershipV1,
  createReboundRecoveryLedgerV1, claimReboundRecoveryV1, finalizeReboundRecoveryLedgerV1 } from './rebound-ownership-v1.mjs';
import { PRIOR_REBOUND_SPLIT_V1, allocatePriorReboundSplitV1 } from './prior-rebound-split-v1.mjs';
import { readSharedEventCalibrationCacheV1, memoizeSharedEventCalibrationV1 } from './shared-event-calibration-cache-v1.mjs';
import { normalizeLiveOrdinaryFoulScenarioV1, resolveLivePersonalFoulInputV1 } from './live-ordinary-foul-controls-v1.mjs';
import { createNbaTeamFoulStateV1, evaluateNbaTeamFoulPenaltyV1 } from './nba-team-foul-penalty-v1.mjs';

const countFields = [
  'points', 'fieldGoalAttempts', 'fieldGoalsMade', 'fieldGoalsMissed', 'threePointAttempts',
  'threePointersMade', 'threePointMisses', 'twoPointAttempts', 'twoPointMakes', 'twoPointMisses',
  'freeThrowAttempts', 'freeThrowsMade', 'freeThrowsMissed', 'rebounds',
  'offensiveRebounds', 'defensiveRebounds', 'assists', 'turnovers', 'steals', 'blocks',
  'personalFouls',
];

const REBOUND_PRIOR_CHANCE = 0.24;
const REBOUND_PRIOR_SHRINKAGE = 0.5;
const REBOUND_CHANCE_BOUNDS = Object.freeze([0.12, 0.36]);

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }

function scaleProbabilityOdds(probability, multiplier) {
  if (multiplier === 1 || probability <= 0 || probability >= 1) return probability;
  return probability * multiplier / (1 - probability + probability * multiplier);
}

function nonnegativeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) ? Math.max(0, rate) : 0;
}

export function normalizePlayerReboundRateComponents(totalReboundsPer36, offensiveReboundsPer36, defensiveReboundsPer36) {
  const total = nonnegativeRate(totalReboundsPer36);
  const offensive = nonnegativeRate(offensiveReboundsPer36);
  const defensive = nonnegativeRate(defensiveReboundsPer36);
  const componentTotal = offensive + defensive;
  if (total === 0) {
    return { totalReboundsPer36: 0, offensiveReboundsPer36: 0, defensiveReboundsPer36: 0,
      adjusted: componentTotal > 0 };
  }
  if (componentTotal === 0) {
    return { totalReboundsPer36: total, offensiveReboundsPer36: total * 0.23,
      defensiveReboundsPer36: total * 0.77, adjusted: true };
  }
  const scale = total / componentTotal;
  return {
    totalReboundsPer36: total,
    offensiveReboundsPer36: offensive * scale,
    defensiveReboundsPer36: defensive * scale,
    adjusted: Math.abs(componentTotal - total) > 1e-9,
  };
}

export function estimateOffensiveReboundChance({
  offensiveRebounds = 0,
  opponentDefensiveRebounds = 0,
  explicitRate = null,
  priorChance = REBOUND_PRIOR_CHANCE,
  priorShrinkage = REBOUND_PRIOR_SHRINKAGE,
} = {}) {
  let suppliedRate = explicitRate === null || explicitRate === undefined || explicitRate === ''
    ? null : Number(explicitRate);
  if (Number.isFinite(suppliedRate) && suppliedRate > 1 && suppliedRate <= 100) suppliedRate /= 100;
  const [minimum, maximum] = REBOUND_CHANCE_BOUNDS;
  if (Number.isFinite(suppliedRate) && suppliedRate >= 0 && suppliedRate <= 1) {
    return { chance: clamp(suppliedRate, minimum, maximum), source: 'explicit-team-rate', rawMatchupRate: null };
  }
  const offense = nonnegativeRate(offensiveRebounds);
  const defense = nonnegativeRate(opponentDefensiveRebounds);
  const denominator = offense + defense;
  const rawMatchupRate = denominator > 0 ? offense / denominator : null;
  const center = clamp(Number(priorChance) || REBOUND_PRIOR_CHANCE, minimum, maximum);
  const shrinkage = clamp(Number(priorShrinkage) || 0, 0, 1);
  const chance = rawMatchupRate === null
    ? center
    : center + ((rawMatchupRate - center) * shrinkage);
  return {
    chance: clamp(chance, minimum, maximum),
    source: rawMatchupRate === null ? 'league-prior-no-rebound-rate-evidence' : 'opponent-adjusted-rebound-rates-shrunk-to-league-prior',
    rawMatchupRate,
  };
}

function seededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normalizedMinutes(players, availability) {
  if (players.length < 5) throw new Error('A live game requires at least five players for each team.');
  const requested = players.map(player => Number(player.projectedMinutes ?? player.minutes ?? 0));
  if (requested.some(minutes => !Number.isFinite(minutes) || minutes < 0)) {
    throw new Error('Live projected minutes must be finite nonnegative numbers.');
  }
  if (!requested.some(minutes => minutes > 0)) throw new Error('A live rotation needs positive projected minutes; an all-zero plan cannot be replaced silently.');
  const result = Array(players.length).fill(0);
  let open = players.map((_, index) => index).filter(index => requested[index] > 0);
  const reserves = players.map((_, index) => index).filter(index => requested[index] === 0 &&
    players[index].gameEligible !== false && availability[index].status !== 'unavailable' &&
    (players[index].gameEligible === true || ['available', 'limited'].includes(availability[index].status)));
  const caps = players.map((_, index) => availability[index].minutesLimit ?? 48);
  if (open.length + reserves.length < 5 || [...open, ...reserves].reduce((sum, index) => sum + caps[index], 0) < 240 - 1e-8) {
    throw new Error('Explicit minute capacity of the eligible rotation cannot cover 240 regulation team minutes.');
  }
  let remaining = 240;
  // Keep zero targets unchanged when the planned players can cover regulation.
  // Only an explicitly eligible reserve can supply otherwise missing capacity.
  let reservePoolUsed = false;
  while (remaining > 1e-8) {
    if (!open.length) {
      if (reservePoolUsed) throw new Error('Eligible reserve capacity cannot cover regulation minutes.');
      open = [...reserves];
      reservePoolUsed = true;
    }
    const weightSum = open.reduce((sum, index) => sum + requested[index], 0);
    const weightFor = index => weightSum > 0 ? requested[index] / weightSum : 1 / open.length;
    const capped = open.filter(index => remaining * weightFor(index) > caps[index]);
    if (!capped.length) {
      for (const index of open) result[index] = remaining * weightFor(index);
      remaining = 0;
      break;
    }
    for (const index of capped) {
      result[index] = caps[index];
      remaining -= caps[index];
    }
    open = open.filter(index => !capped.includes(index));
  }
  return result;
}

function percentage(player, keys, fallback) {
  for (const key of keys) {
    if (!Number.isFinite(player[key])) continue;
    const raw = player[key] > 1 ? player[key] / 100 : player[key];
    return clamp(raw, 0, 1);
  }
  return fallback;
}

function firstRate(player, keys, fallback = 0) {
  for (const key of keys) if (Number.isFinite(player[key])) return Math.max(0, player[key]);
  return fallback;
}

function chooseWeighted(rows, weight, random, excludedRef = null) {
  const eligible = rows.filter(row => row.player.playerRef !== excludedRef);
  if (!eligible.length) return rows.find(row => row.player.playerRef !== excludedRef) ?? rows[0];
  const weights = eligible.map(row => Math.max(0, Number(weight(row)) || 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return eligible[Math.floor(random() * eligible.length)];
  let position = random() * total;
  for (let index = 0; index < eligible.length; index += 1) {
    position -= weights[index];
    if (position <= 0) return eligible[index];
  }
  return eligible[eligible.length - 1];
}

export function normalizedShotRecipientWeights(players) {
  if (!Array.isArray(players) || !players.length) throw new Error('Shot-usage weights need an active lineup.');
  const baseWeights = players.map(row => {
    const rate = Number(row.shotUsageBaseWeight ?? row.fgaPer36);
    const multiplier = row.shotUsageMultiplier === undefined ? 1 : Number(row.shotUsageMultiplier);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(multiplier) || multiplier < 0 || multiplier > 2) {
      throw new Error('Shot-usage weights require finite nonnegative attempt rates and multipliers from 0 through 2.');
    }
    return { rate, multiplier, weight: rate * multiplier };
  });
  const total = baseWeights.reduce((sum, row) => sum + row.weight, 0);
  if (!Number.isFinite(total) || total <= 0) {
    if (baseWeights.every(row => row.rate === 0)) return players.map(() => 1 / players.length);
    throw new Error('The current five-player lineup has no positive shot-recipient weight.');
  }
  return baseWeights.map(row => row.weight / total);
}

function chooseShotRecipient(lineup, random) {
  const probabilities = normalizedShotRecipientWeights(lineup);
  let position = random();
  for (let index = 0; index < lineup.length; index += 1) {
    position -= probabilities[index];
    if (position <= 0) return lineup[index];
  }
  return lineup[lineup.length - 1];
}

function playerRates(model, player, minutesTarget, sharedForecast = null, reboundSplitSelection = 'generated-or-scenario-v1') {
  if (sharedForecast) {
    const shots = projectSharedProductionShotRates(sharedForecast, player);
    const rate = stat => sharedForecast.statistics[stat].ratePer36;
    const componentFields = ['offensiveReboundsPer36', 'priorOffensiveReboundsPer36',
      'defensiveReboundsPer36', 'priorDefensiveReboundsPer36'];
    const suppliedFields = componentFields.filter(field => Object.hasOwn(player, field));
    const allowScenarioComponents = sharedForecast.evidence.kind === 'explicit-scenario';
    if (allowScenarioComponents && suppliedFields.some(field => !Number.isFinite(player[field]) || player[field] < 0)) {
      throw Object.assign(new Error('Invalid explicit player rebound component rates.'), { reboundReview: {
        status: 'requires-review', reason: 'invalid-explicit-player-rebound-components' } });
    }
    let rebounds = normalizePlayerReboundRateComponents(rate('rebounds'),
      allowScenarioComponents ? firstRate(player, componentFields.slice(0, 2), rate('rebounds') * 0.23) : rate('rebounds') * 0.23,
      allowScenarioComponents ? firstRate(player, componentFields.slice(2), rate('rebounds') * 0.77) : rate('rebounds') * 0.77);
    let priorSplit = null;
    if (reboundSplitSelection === PRIOR_REBOUND_SPLIT_V1) {
      if (allowScenarioComponents) throw new Error('Prior rebound split selection requires a bound prior-history profile.');
      priorSplit = allocatePriorReboundSplitV1(player.sharedProductionFeatures.reboundSplit, {
        canonicalName: sharedForecast.canonicalName, seasonStartYear: sharedForecast.seasonStartYear,
        gameLocalDate: sharedForecast.gameLocalDate }, rate('rebounds'), minutesTarget);
      rebounds = { ...priorSplit, adjusted: false };
    }
    return { ...shots, player, minutesTarget, sharedProductionForecast: sharedForecast,
      shotProjectionDiagnostics: shots.diagnostics,
      reboundSplitDiagnostics: { source: allowScenarioComponents && suppliedFields.length
        ? 'explicit-player-rebound-component-scenario; rescaled-to-predicted-total'
        : 'generated-23-percent-offensive-split-fallback', adjusted: rebounds.adjusted,
        historyStatus: 'no-validated-prior-split-history',
        ignoredUnboundPlayerFields: allowScenarioComponents ? [] : suppliedFields,
        totalReboundsPer36: rate('rebounds'), offensiveReboundsPer36: rebounds.offensiveReboundsPer36,
        defensiveReboundsPer36: rebounds.defensiveReboundsPer36, empiricallySelected: false,
        ...(priorSplit ? { source: priorSplit.source, historyStatus: priorSplit.historyStatus,
          evidence: priorSplit.evidence, expectedCounts: priorSplit.expectedCounts } : {}) },
      basePointsPer36: shots.pointsPer36, fatiguePerformancePenalty: 0, fatiguePerformanceMultiplier: 1,
      fatiguePerformanceAdjustmentSource: 'shared-fitted-workload-feature; no-extra-fatigue-transform',
      scoringRateSource: 'shared-player-production-candidate; legacy-regressions-bypassed',
      reboundsPer36: rate('rebounds'), assistsPer36: rate('assists'), turnoversPer36: rate('turnovers'),
      stealsPer36: rate('steals'), blocksPer36: rate('blocks'),
      offensiveReboundsPer36: rebounds.offensiveReboundsPer36, defensiveReboundsPer36: rebounds.defensiveReboundsPer36 };
  }
  const rawPoints = firstRate(player, ['pointsPer36', 'priorPointsPer36'], 0);
  const scoringDetails = predictPlayerScoringRateDetails(model, player);
  const pointsPer36 = scoringDetails.rate;
  const rate = stat => {
    const predicted = predictPlayerBoxRate(model, player, stat);
    if (!Number.isFinite(predicted)) throw new Error(`Live player ${stat} prediction is nonfinite.`);
    return Math.max(0, predicted);
  };
  const threesPer36 = rate('threePointersMade',
    ['threesPer36', 'threePointersMadePer36', 'priorThreesPer36']);
  const threesAttPer36 = firstRate(player,
    ['threePointAttemptsPer36', 'threePointersAttemptedPer36'], threesPer36 / 0.36);
  const fgaPer36 = firstRate(player,
    ['fieldGoalAttemptsPer36', 'fieldGoalsAttemptedPer36'],
    Math.max(threesAttPer36 + 1, (rawPoints || scoringDetails.baseRate || pointsPer36) / 1.2));
  const twoPointAttPer36 = firstRate(player,
    ['twoPointAttemptsPer36', 'twoPointFieldGoalAttemptsPer36'],
    Math.max(0, fgaPer36 - threesAttPer36));
  const totalShotAttemptsPer36 = threesAttPer36 + twoPointAttPer36;
  const threeAttemptShare = totalShotAttemptsPer36 > 0
    ? clamp(threesAttPer36 / totalShotAttemptsPer36, 0, 1)
    : 0;
  const ftAttPer36 = firstRate(player,
    ['freeThrowAttemptsPer36', 'freeThrowsAttemptedPer36'], Math.max(0, pointsPer36 * 0.18));
  const threePointPct = percentage(player,
    ['threePointPercentage', 'threePointPct', 'threePPercentage'],
    threesAttPer36 > 0 ? clamp(threesPer36 / threesAttPer36, 0.2, 0.5) : 0.36);
  const twoPointPct = percentage(player, ['twoPointPercentage', 'twoPointPct'], 0.52);
  const freeThrowPct = percentage(player,
    ['freeThrowPercentage', 'freeThrowPct'], 0.78);
  const reboundsPer36 = rate('rebounds', ['reboundsPer36', 'priorReboundsPer36']);
  const assistsPer36 = rate('assists', ['assistsPer36', 'priorAssistsPer36']);
  const turnoversPer36 = rate('turnovers', ['turnoversPer36', 'priorTurnoversPer36']);
  const stealsPer36 = rate('steals', ['stealsPer36', 'priorStealsPer36']);
  const blocksPer36 = rate('blocks', ['blocksPer36', 'priorBlocksPer36']);
  const rawOffensiveReboundsPer36 = firstRate(player,
    ['offensiveReboundsPer36', 'priorOffensiveReboundsPer36'], reboundsPer36 * 0.23);
  const rawDefensiveReboundsPer36 = firstRate(player,
    ['defensiveReboundsPer36', 'priorDefensiveReboundsPer36'], Math.max(0, reboundsPer36 - rawOffensiveReboundsPer36));
  const reboundRates = normalizePlayerReboundRateComponents(
    reboundsPer36, rawOffensiveReboundsPer36, rawDefensiveReboundsPer36);
  const offensiveReboundsPer36 = reboundRates.offensiveReboundsPer36;
  const defensiveReboundsPer36 = reboundRates.defensiveReboundsPer36;
  const freeThrowsMadePer36 = firstRate(player,
    ['freeThrowsMadePer36', 'freeThrowsMadeRatePer36'], ftAttPer36 * freeThrowPct);
  return {
    player,
    minutesTarget,
    pointsPer36,
    basePointsPer36: scoringDetails.baseRate,
    fatiguePerformancePenalty: scoringDetails.fatigueAdjustment.performancePenalty,
    fatiguePerformanceMultiplier: scoringDetails.fatigueAdjustment.baseRateMultiplier,
    fatiguePerformanceAdjustmentSource: scoringDetails.fatigueAdjustment.source,
    scoringRateSource: scoringDetails.source,
    fgaPer36,
    twoPointAttPer36,
    threesAttPer36,
    threeAttemptShare,
    threesPer36,
    ftAttPer36,
    freeThrowsMadePer36,
    threePointPct,
    twoPointPct,
    freeThrowPct,
    reboundsPer36,
    assistsPer36,
    turnoversPer36,
    stealsPer36,
    blocksPer36,
    offensiveReboundsPer36,
    defensiveReboundsPer36,
  };
}

function emptyLine(player) {
  return { playerRef: player.playerRef ?? null, displayName: player.displayName ?? null,
    ...(player.seasonAgeStatus ? {
      age: player.age,
      ageStatus: player.seasonAgeStatus,
      ageReferenceDate: player.seasonAgeReferenceDate,
      ageSource: player.seasonAgeSource,
    } : {}),
    ...Object.fromEntries(countFields.map(field => [field, 0])), minutes: 0 };
}

function scoreOf(state) { return { home: state.teams.home.totals.points, away: state.teams.away.totals.points }; }

function clockText(secondsRemaining) {
  const seconds = Math.max(0, Math.ceil(secondsRemaining));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function snapshot(state) {
  const teamView = side => ({
    teamCode: state.teams[side].teamCode,
    stats: { ...state.teams[side].totals },
    players: [...state.teams[side].lines.values()].map(line => ({ ...line })),
    onCourtPlayerRefs: (state.currentLineups?.[side] ?? []).map(row => row.player.playerRef),
    rotationReason: state.teams[side].rotationReason ?? null,
  });
  return { score: scoreOf(state), home: teamView('home'), away: teamView('away') };
}

function weightedExpectedRate(rows, key) {
  const sum = rows.reduce((total, row) => total + row[key] * row.minutesTarget / 36, 0);
  return sum;
}

function prepareTeam(model, inputTeam, side, productionContext = null) {
  const suppliedPlayers = Array.isArray(inputTeam.players) ? inputTeam.players : [];
  const players = suppliedPlayers.map((player, index) => ({
    ...player,
    playerRef: player.playerRef ?? player.displayName ?? `${side}-player-${index + 1}`,
    canonicalName: player.canonicalName ?? player.displayName ?? player.name ?? `${side} Player ${index + 1}`,
  }));
  if (new Set(players.map(player => player.playerRef)).size !== players.length) {
    throw new Error(`${inputTeam.teamCode ?? side} contains duplicate player identities.`);
  }
  const nameKeys = players.map(player => normalizeCanonicalPlayerName(player.canonicalName));
  if (nameKeys.some(name => !name) || new Set(nameKeys).size !== nameKeys.length) {
    throw new Error(`${inputTeam.teamCode ?? side} contains duplicate or blank exact normalized player names.`);
  }
  const availability = players.map(resolveRotationPlayerAvailability);
  for (const [index, player] of players.entries()) {
    if (player.gameEligible !== undefined && typeof player.gameEligible !== 'boolean') throw new Error('gameEligible must be an explicit boolean when supplied.');
    if (player.gameEligible === false && Number(player.projectedMinutes ?? player.minutes ?? 0) > 0) throw new Error('A game-ineligible player cannot have positive projected minutes.');
  }
  if (availability.some(row => row.reason === 'limited-status-without-valid-minutes-limit')) {
    throw new Error('Explicit limited availability requires a valid hard minute limit before simulation.');
  }
  const minutes = normalizedMinutes(players, availability);
  for (const [index, status] of availability.entries()) {
    if (status.status === 'unavailable' && minutes[index] > 0) throw new Error(`${players[index].canonicalName} is explicitly unavailable/inactive.`);
    if (status.minutesLimit !== null && minutes[index] > status.minutesLimit + 1e-8) {
      throw new Error(`${players[index].canonicalName} normalized target exceeds the explicit minutes limit.`);
    }
  }
  const rotationPlayers = players.map((player, index) => ({ ...player, minutesTarget: minutes[index],
    gameEligible: availability[index].status !== 'unavailable' && player.gameEligible !== false &&
      (minutes[index] > 0 || player.gameEligible === true || ['available', 'limited'].includes(availability[index].status)),
    hardMinutesLimit: availability[index].minutesLimit }));
  const rotation = normalizeLiveRotationControls({ players: rotationPlayers, controls: inputTeam.rotationControls ?? {} });
  if (rotation.status !== 'pass') throw Object.assign(new Error('Live rotation controls require review.'), { rotation });
  const shotUsageByRef = new Map(rotation.controls.shotUsageMultipliers.map(row => [row.playerRef, row.multiplier]));
  const rotationSchedule = createRotationSchedule({ players: rotationPlayers, starters: rotation.controls.starters,
    openingStintMinutes: rotation.controls.openingStintMinutes });
  if (rotationSchedule.status !== 'pass') throw Object.assign(new Error('Live rotation schedule requires review.'), { rotationSchedule });
  const coaching = normalizeGameCoachingPlan({ plan: inputTeam.coachingPlan });
  if (coaching.status !== 'pass') throw Object.assign(new Error('Live coaching plan requires review.'), { coaching });
  const roster = players.map((player, index) => {
    const forecast = productionContext ? forecastGamePlayerProduction(productionContext.candidate, player,
      { ...productionContext, projectedMinutes: minutes[index] }) : null;
    const rates = playerRates(model, player, minutes[index], forecast, productionContext?.reboundSplitSelection);
    return { ...rates, shotUsageMultiplier: shotUsageByRef.get(String(player.playerRef)) ?? 1,
      shotUsageBaseWeight: Math.max(productionContext ? 0 : 0.1, rates.fgaPer36),
      baseThreeAttemptShare: rates.threeAttemptShare,
      threeAttemptShare: scaleProbabilityOdds(rates.threeAttemptShare, coaching.controls.threePointAttemptMultiplier),
      availabilityMinutesLimit: availability[index].minutesLimit };
  });
  const rosterByRef = new Map(roster.map(row => [String(row.player.playerRef), row]));
  for (const stint of rotationSchedule.stints) {
    normalizedShotRecipientWeights(stint.playerRefs.map(ref => rosterByRef.get(String(ref))).filter(Boolean));
  }
  const teamExpectedPoints = weightedExpectedRate(roster, 'pointsPer36');
  const fga = weightedExpectedRate(roster, 'fgaPer36');
  const fta = weightedExpectedRate(roster, 'ftAttPer36');
  const turnovers = weightedExpectedRate(roster, 'turnoversPer36');
  const steals = weightedExpectedRate(roster, 'stealsPer36');
  const blocks = weightedExpectedRate(roster, 'blocksPer36');
  const rebounds = weightedExpectedRate(roster, 'reboundsPer36');
  const offensiveRebounds = weightedExpectedRate(roster, 'offensiveReboundsPer36');
  const defensiveRebounds = weightedExpectedRate(roster, 'defensiveReboundsPer36');
  const scoringRateRows = roster.filter(row => Number.isFinite(row.minutesTarget) && row.minutesTarget > 0);
  const scoringRateWeight = scoringRateRows.reduce((sum, row) => sum + row.minutesTarget, 0);
  const fatiguePenaltyWeighted = scoringRateWeight > 0
    ? scoringRateRows.reduce((sum, row) => sum + row.fatiguePerformancePenalty * row.minutesTarget, 0) / scoringRateWeight
    : 0;
  const fatigueAdjustedRows = scoringRateRows.filter(row => row.fatiguePerformancePenalty > 0);
  const possessions = clamp(Number(inputTeam.pace) || 100, 80, 120);
  const threeAttempts = weightedExpectedRate(roster, 'threesAttPer36');
  const returnValue = {
    side,
    sharedScoringCalibrations: productionContext ? new Map() : null,
    sharedOpportunityCache: productionContext ? new Map() : null,
    hasExplicitMinuteCaps: availability.some(row => row.minutesLimit !== null),
    minuteBudget: null,
    emergencyActivatedRefs: [],
    emergencyActivations: players.flatMap((player, index) => Number(player.projectedMinutes ?? player.minutes ?? 0) === 0 && minutes[index] > 0
      ? [{ playerRef: player.playerRef, canonicalName: player.canonicalName, elapsedMinutes: 0,
        reason: 'regulation-minute-capacity', adjustedTargetMinutes: minutes[index],
        disclosure: 'Explicitly game-eligible zero-target reserve was assigned a target because planned players cannot cover regulation under their minute caps.' }] : []),
    coachingPlan: coaching.controls,
    teamCode: inputTeam.teamCode ?? side.toUpperCase(),
    players,
    roster,
    actualMinutes: new Map(players.map(player => [player.playerRef, 0])),
    consecutiveMinutes: new Map(players.map(player => [player.playerRef, 0])),
    restMinutes: new Map(players.map(player => [player.playerRef, Infinity])),
    fatigueHoldRefs: [], retainedPlayerRefs: [],
    rotationPlayers, rotationControls: rotation.controls, rotationSchedule,
    rotationReason: null, rotationChanges: [],
    availabilityDisclosures: players.map((player, index) => ({ canonicalName: player.canonicalName, ...availability[index] })),
    lines: new Map(players.map(player => [player.playerRef, emptyLine(player)])),
    totals: { ...Object.fromEntries(countFields.map(field => [field, 0])), minutes: 0 },
    expectedPoints: !productionContext && Number.isFinite(inputTeam.expectedPlayerPoints) ? inputTeam.expectedPlayerPoints : teamExpectedPoints,
    expectedRebounds: rebounds,
    expectedOffensiveRebounds: offensiveRebounds,
    expectedDefensiveRebounds: defensiveRebounds,
    scoringRateDiagnostics: {
      playerCount: scoringRateRows.length,
      adjustedPlayerCount: fatigueAdjustedRows.length,
      minuteWeightedPerformancePenalty: fatiguePenaltyWeighted,
      minuteWeightedPerformanceMultiplier: 1 - fatiguePenaltyWeighted,
      sources: [...new Set(scoringRateRows.map(row => row.fatiguePerformanceAdjustmentSource))],
    },
    suppliedOffensiveReboundRate: inputTeam.offensiveReboundPct ?? inputTeam.offensiveReboundRate ?? null,
    possessions,
    shotFoulChance: clamp(0.32 * (fta / Math.max(1, fga)), 0.04, 0.18),
    turnoverChance: clamp(turnovers / possessions, 0.055, 0.2),
    stealGivenTurnoverChance: clamp(steals / Math.max(1, turnovers), 0.2, 0.85),
    blockChance: clamp(blocks / possessions, 0.005, 0.14),
    offensiveReboundChance: REBOUND_PRIOR_CHANCE,
    offensiveReboundChanceSource: 'pending-opponent-matchup',
    threeAttemptShare: clamp(threeAttempts / Math.max(1, fga), 0.12, 0.58),
  };
  return returnValue;
}

function selectLineup(state, side, period, protectedPlayerRefs = []) {
  const team = state.teams[side];
  const selection = selectLiveRotation({ players: team.rotationPlayers, controls: team.rotationControls,
    schedule: team.rotationSchedule, elapsedMinutes: team.totals.minutes / 5, period,
    margin: state.score[side] - state.score[side === 'home' ? 'away' : 'home'],
    actualMinutes: team.actualMinutes, fouls: new Map([...team.lines].map(([ref, line]) => [ref, line.personalFouls])),
    consecutiveMinutes: team.consecutiveMinutes, restMinutes: team.restMinutes,
    fatigueHoldRefs: team.fatigueHoldRefs, protectedPlayerRefs, retainedPlayerRefs: team.retainedPlayerRefs,
    emergencyPlayerRefs: team.rotationPlayers.filter(row => row.gameEligible && row.minutesTarget === 0).map(row => row.playerRef),
    activatedEmergencyPlayerRefs: team.emergencyActivatedRefs,
    ...(state.timeoutState ? minuteBudgetContext(state, side, period) : {}) });
  if (selection.status !== 'pass') throw Object.assign(new Error(`${team.teamCode} live lineup requires review.`), { selection });
  team.fatigueHoldRefs = selection.fatigueHoldRefs;
  team.rotationReason = selection.reason;
  team.conditionalHolds = selection.conditionalHolds;
  team.minuteBudget = selection.minuteBudget ?? null;
  for (const ref of selection.playerRefs) {
    const player = team.rotationPlayers.find(row => row.playerRef === ref);
    if (player.minutesTarget === 0 && !team.emergencyActivatedRefs.includes(ref)) {
      team.emergencyActivatedRefs.push(ref);
      team.emergencyActivations.push({ playerRef: ref, canonicalName: player.canonicalName,
        elapsedMinutes: team.totals.minutes / 5,
        reason: selection.reason.includes('hard-minute-budget') ? 'hard-minute-capacity' : 'five-player-foul-replacement',
        disclosure: 'Explicitly game-eligible reserve had zero planned minutes; hard minute capacity or foul disqualification required emergency participation.' });
    }
  }
  return selection.playerRefs.map(ref => team.roster.find(row => row.player.playerRef === ref));
}

function minuteBudgetContext(state, side, period, turnsToReserve = 1) {
  const remainingPeriodSeconds = Math.max(0, state.clockStart - state.possessionElapsed);
  return { remainingGameMinutes: period.startsWith('OT') ? remainingPeriodSeconds / 60
    : Math.max(0, 48 - state.teams[side].totals.minutes / 5),
    minimumStintMinutes: Math.min(remainingPeriodSeconds,
      Math.max(0, state.possessionSeconds - state.possessionElapsed) + turnsToReserve * state.possessionSeconds) / 60 };
}

function currentMinuteBudget(state, side, period, turnsToReserve = 1) {
  const team = state.teams[side];
  return selectMinuteBudgetLineup({ players: team.rotationPlayers,
    preferredPlayerRefs: state.currentLineups[side].map(row => row.player.playerRef),
    eligiblePlayerRefs: team.rotationPlayers.filter(row => row.gameEligible &&
      (team.lines.get(row.playerRef).personalFouls < 6 || team.retainedPlayerRefs.includes(row.playerRef))).map(row => row.playerRef),
    actualMinutes: team.actualMinutes, ...minuteBudgetContext(state, side, period, turnsToReserve) });
}

function* emitChargedTimeout(state, { side, period, clockSeconds, possessionId, ballDead, possessionSide, cause }) {
  const result = chargeNbaTimeout({ state: state.timeoutState, side, period, clockSeconds,
    ballDead, possessionSide, cause });
  if (result.status !== 'charged') throw Object.assign(new Error('A legal timeout is unavailable for the required minute-cap substitution.'), { timeoutReview: result.evaluation });
  state.timeoutState = result.state;
  const event = { eventId: state.nextEventId++, possessionId, period, clock: clockText(clockSeconds),
    type: 'timeout', offenseTeam: null, defenseTeam: null, teamCode: state.teams[side].teamCode,
    cause, ballDead, possessionSide: possessionSide ? state.teams[possessionSide].teamCode : null,
    timeoutReceipt: result.receipt, score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined };
  state.eventIndex.set(event.eventId, { type: event.type });
  yield event;
}

function* changeLineups(state, { period, clock, possessionId, opportunity, sides = ['home', 'away'], protectedPlayerRefs = {} }) {
  const clockSeconds = Math.max(0, state.clockStart - state.possessionElapsed);
  const due = state.timeoutState && dueNbaMandatoryTimeout({ state: state.timeoutState, period, clockSeconds,
    ballDead: opportunity !== 'period-start' && !opportunity.endsWith('timeout') });
  if (due?.status === 'requires-review') throw Object.assign(new Error('Mandatory timeout state requires review.'), { timeoutReview: due });
  if (due) {
    yield* emitChargedTimeout(state, { ...due, period, clockSeconds, possessionId, ballDead: true });
    opportunity = 'mandatory-timeout';
    sides = ['home', 'away'];
  }
  for (const side of sides) {
    const oldLineup = state.currentLineups[side], next = selectLineup(state, side, period, protectedPlayerRefs[side] ?? []);
    const oldRefs = oldLineup.map(row => row.player.playerRef), nextRefs = next.map(row => row.player.playerRef);
    if (oldRefs.length === nextRefs.length && oldRefs.every(ref => nextRefs.includes(ref))) continue;
    oldLineup.splice(0, oldLineup.length, ...next);
    const event = { eventId: state.nextEventId++, possessionId, period, clock, type: 'substitution',
      offenseTeam: null, defenseTeam: null, teamCode: state.teams[side].teamCode,
      leavingPlayerRefs: oldRefs.filter(ref => !nextRefs.includes(ref)),
      enteringPlayerRefs: nextRefs.filter(ref => !oldRefs.includes(ref)),
      onCourtPlayerRefs: nextRefs, opportunity, reason: state.teams[side].rotationReason,
      conditionalHolds: structuredClone(state.teams[side].conditionalHolds),
      ...(state.teams[side].minuteBudget ? { minuteBudget: structuredClone(state.teams[side].minuteBudget) } : {}),
      score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined };
    state.teams[side].rotationChanges.push({ elapsedMinutes: state.teams[side].totals.minutes / 5,
      opportunity, playerRefs: nextRefs, reason: event.reason });
    state.eventIndex.set(event.eventId, { type: event.type });
    yield event;
  }
}

function advancePossessionMinutes(state, lineups, elapsedSeconds) {
  const elapsed = clamp(Number(elapsedSeconds) || 0, 0, state.possessionSeconds);
  const deltaMinutes = Math.max(0, elapsed - state.possessionElapsed) / 60;
  if (!deltaMinutes) return;
  for (const side of ['home', 'away']) {
    const onCourt = new Set(lineups[side].map(row => row.player.playerRef));
    if (onCourt.size !== 5) throw new Error('Every live lineup must have five unique players.');
    for (const row of state.teams[side].roster) {
      const ref = row.player.playerRef;
      if (onCourt.has(ref)) {
        state.teams[side].consecutiveMinutes.set(ref, state.teams[side].consecutiveMinutes.get(ref) + deltaMinutes);
        state.teams[side].restMinutes.set(ref, 0);
      } else {
        state.teams[side].consecutiveMinutes.set(ref, 0);
        state.teams[side].restMinutes.set(ref, state.teams[side].restMinutes.get(ref) + deltaMinutes);
      }
    }
    for (const row of lineups[side]) {
      const playerRef = row.player.playerRef;
      const limit = row.availabilityMinutesLimit;
      if (limit !== null && limit !== undefined && state.teams[side].actualMinutes.get(playerRef) + deltaMinutes > limit + 1e-8) {
        throw new Error(`${row.player.canonicalName} would exceed its explicit minutes limit; rotation review is required.`);
      }
      state.teams[side].actualMinutes.set(playerRef,
        state.teams[side].actualMinutes.get(playerRef) + deltaMinutes);
      state.teams[side].lines.get(playerRef).minutes += deltaMinutes;
      state.teams[side].totals.minutes += deltaMinutes;
    }
  }
  state.possessionElapsed = elapsed;
}

function increment(state, side, playerRef, stat, amount = 1) {
  if (!amount) return;
  const team = state.teams[side];
  const line = team.lines.get(playerRef);
  if (!line) throw new Error(`Cannot assign ${stat} to unknown ${side} player ${playerRef}.`);
  if (!state.currentLineups[side].some(row => row.player.playerRef === playerRef)) {
    throw new Error(`Cannot assign ${stat} to off-court ${side} player ${playerRef}.`);
  }
  line[stat] += amount;
  team.totals[stat] += amount;
  if (stat === 'points') state.score[side] += amount;
}

function currentOffensiveReboundChance(state, offense, defense) {
  const team = state.teams[offense];
  if (!state.sharedProductionEnabled) return team.offensiveReboundChance;
  if ([SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)) {
    return rateLinkedRetentionContext(state, offense, defense).offensiveReboundChance;
  }
  const estimate = estimateOffensiveReboundChance({
    offensiveRebounds: state.currentLineups[offense].reduce((sum, row) => sum + row.offensiveReboundsPer36, 0),
    opponentDefensiveRebounds: state.currentLineups[defense].reduce((sum, row) => sum + row.defensiveReboundsPer36, 0),
    explicitRate: team.suppliedOffensiveReboundRate,
  });
  return clamp(scaleProbabilityOdds(estimate.chance, team.coachingPlan.offensiveReboundMultiplier), ...REBOUND_CHANCE_BOUNDS);
}

function sharedScoringCalibration(state, offense, lineup) {
  if (!state.sharedProductionEnabled) return null;
  const cache = state.teams[offense].sharedScoringCalibrations;
  const key = JSON.stringify(lineup.map(row => row.player.playerRef).sort());
  if (!cache.has(key)) {
    const possessions = state.regulationPossessionsPerTeam;
    const context = { mapping: state.sharedProductionMapping, rows: lineup, possessions };
    if (state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V2) {
      context.offensiveReboundChance = estimateOffensiveReboundChance({
        offensiveRebounds: lineup.reduce((sum, row) => sum + row.offensiveReboundsPer36, 0),
        opponentDefensiveRebounds: lineup.reduce((sum, row) => sum + row.defensiveReboundsPer36, 0),
      }).chance;
    }
    const compute = () => state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V4
      ? calibrateSharedPossessionMappingV4(lineup, possessions)
      : state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V3
        ? calibrateSharedPossessionMappingV3(lineup, possessions)
      : state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V2
        ? calibrateSharedPossessionMappingV2(lineup, possessions, { offensiveReboundChance: context.offensiveReboundChance })
        : calibrateSharedLineupScoring(lineup, possessions);
    // Keep the per-game used-conversion map and its diagnostics unchanged.
    // The optional batch lookup binds ordered numerical inputs across draws.
    cache.set(key, state.playerEventCalibrationCache
      ? memoizeSharedEventCalibrationV1(state.playerEventCalibrationCache, context, compute) : compute());
  }
  return cache.get(key);
}

function rateLinkedRetentionContext(state, offense, defense) {
  const team = state.teams[offense], own = state.currentLineups[offense], opposing = state.currentLineups[defense];
  const reference = sharedScoringCalibration(state, offense, own).offensiveReboundChance;
  const supplied = team.suppliedOffensiveReboundRate;
  let base = reference, opponentOddsMultiplier = 1, source = 'self-reference-player-orb-volume; opponent-relative-odds';
  if (supplied !== null && supplied !== undefined && supplied !== '') {
    base = Number(supplied);
    if (base > 1 && base <= 100) base /= 100;
    if (!Number.isFinite(base) || base < 0 || base > RATE_LINKED_RETENTION_CEILING_V3) {
      throw Object.assign(new Error('V3 supplied offensive rebound rate is outside supported numerical retention.'), {
        reboundReview: { status: 'requires-review', reason: 'unsupported-v3-supplied-retention' } });
    }
    source = 'explicit-team-offensive-rebound-rate';
  } else {
    const offensiveRebounds = own.reduce((sum, row) => sum + row.offensiveReboundsPer36, 0);
    const self = estimateOffensiveReboundChance({ offensiveRebounds,
      opponentDefensiveRebounds: own.reduce((sum, row) => sum + row.defensiveReboundsPer36, 0) }).chance;
    const matchup = estimateOffensiveReboundChance({ offensiveRebounds,
      opponentDefensiveRebounds: opposing.reduce((sum, row) => sum + row.defensiveReboundsPer36, 0) }).chance;
    opponentOddsMultiplier = (matchup / (1 - matchup)) / (self / (1 - self));
    base = scaleProbabilityOdds(base, opponentOddsMultiplier);
  }
  const unbounded = scaleProbabilityOdds(base, team.coachingPlan.offensiveReboundMultiplier);
  return { offensiveReboundChance: clamp(unbounded, 0, RATE_LINKED_RETENTION_CEILING_V3),
    referenceRetentionProbability: reference, opponentOddsMultiplier,
    coachingOddsMultiplier: team.coachingPlan.offensiveReboundMultiplier, suppliedRate: supplied,
    source, numericalRetentionCeiling: RATE_LINKED_RETENTION_CEILING_V3,
    constrained: unbounded > RATE_LINKED_RETENTION_CEILING_V3, empiricallySelected: false };
}

function sharedCurrentOpportunities(state, offense, defense, offenseLineup, defenseLineup) {
  if (![SHARED_POSSESSION_MAPPING_V2, SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)) {
    return sharedLineupOpportunityProbabilities(offenseLineup, defenseLineup, state.regulationPossessionsPerTeam);
  }
  // Rates, ratings and coaching are fixed within this game. Cache by both
  // current fives; substitution changes either side's key immediately.
  const key = JSON.stringify([offenseLineup.map(row => row.player.playerRef).sort(),
    defenseLineup.map(row => row.player.playerRef).sort()]);
  const cache = state.teams[offense].sharedOpportunityCache;
  if (!cache.has(key)) {
    const retentionContext = [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)
      ? rateLinkedRetentionContext(state, offense, defense) : null;
    const ownershipScenario = state.reboundOwnershipScenarios[offense];
    const effectiveRetention = retentionContext && ownershipScenario
      ? ownershipScenario.playerCreditProbability * retentionContext.offensiveReboundChance +
        (1 - ownershipScenario.playerCreditProbability) *
          (ownershipScenario.teamOffensiveRetentionProbability ?? retentionContext.offensiveReboundChance)
      : retentionContext?.offensiveReboundChance;
    const moments = state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V4 ? sharedPossessionMomentsV4
      : state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V3 ? sharedPossessionMomentsV3 : sharedPossessionMomentsV2;
    const foulConversion = state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V4
      ? sharedScoringCalibration(state, defense, defenseLineup) : null;
    const ownFoulConversion = foulConversion && state.playerFoulMatchupSplit === 'offense-share-defense-frequency-v1'
      ? sharedScoringCalibration(state, offense, offenseLineup) : null;
    const defensiveFoulFrequency = foulConversion ? foulConversion.commonFoulProbability + foulConversion.shootingFoulProbability : 0;
    const ownFoulFrequency = ownFoulConversion ? ownFoulConversion.commonFoulProbability + ownFoulConversion.shootingFoulProbability : 0;
    const shootingProbability = ownFoulConversion ? defensiveFoulFrequency *
      (ownFoulFrequency > 0 ? ownFoulConversion.shootingFoulProbability / ownFoulFrequency : 0) : foulConversion?.shootingFoulProbability;
    cache.set(key, { ...moments(offenseLineup, defenseLineup, state.regulationPossessionsPerTeam, {
      shift: sharedScoringCalibration(state, offense, offenseLineup).makeProbabilityShift,
      offensiveReboundChance: effectiveRetention ?? currentOffensiveReboundChance(state, offense, defense),
      ...(foulConversion ? { commonFoulProbability: defensiveFoulFrequency - shootingProbability,
        shootingFoulProbability: shootingProbability } : {}),
    }), ...(retentionContext ? { retentionContext: { ...retentionContext,
      effectiveRecoveryProbability: effectiveRetention,
      ownershipScenarioOverride: Boolean(ownershipScenario) } } : {}) });
  }
  return cache.get(key);
}

function reboundOwnership(state, offense, defense, offenseLineup, defenseLineup, random) {
  const retention = currentOffensiveReboundChance(state, offense, defense);
  if (state.reboundOwnershipMode === 'all-player-v1') {
    return chooseReboundOwnershipV1({ offenseSide: offense, playerCreditProbability: 1,
      playerOffensiveRetentionProbability: retention }, random);
  }
  const key = JSON.stringify([offense, offenseLineup.map(row => row.player.playerRef).sort(),
    defenseLineup.map(row => row.player.playerRef).sort()]);
  if (!state.reboundOwnershipBudgets.has(key)) {
    const scenario = state.reboundOwnershipScenarios[offense];
    if (scenario) state.reboundOwnershipBudgets.set(key, { ...scenario, source: 'explicit-rebound-ownership-scenario',
      empiricallySelected: false });
    else {
      const opportunities = sharedCurrentOpportunities(state, offense, defense, offenseLineup, defenseLineup);
      const budget = [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)
        ? estimateRateLinkedReboundOwnershipBudgetV3 : estimateReboundOwnershipBudgetV1;
      state.reboundOwnershipBudgets.set(key, budget({ offense: offenseLineup, defense: defenseLineup,
        possessions: state.regulationPossessionsPerTeam, offensiveRecoveryProbability: retention,
        expectedReboundOpportunitiesPerPossession: opportunities.perPossession.offensiveRebounds +
          opportunities.perPossession.opponentDefensiveRebounds }));
    }
  }
  return chooseReboundOwnershipV1({ offenseSide: offense, playerOffensiveRetentionProbability: retention,
    ...state.reboundOwnershipBudgets.get(key) }, random);
}

function* playPossession(state, offense, defense, lineups, context, random, targetMultiplier) {
  const { period, clockStart, possessionSeconds, possessionId } = context;
  const offenseLineup = lineups[offense];
  const defenseLineup = lineups[defense];
  const currentOpportunities = () => state.sharedProductionEnabled
    ? sharedCurrentOpportunities(state, offense, defense, offenseLineup, defenseLineup)
    : { turnoverChance: state.teams[offense].turnoverChance,
      stealGivenTurnoverChance: state.teams[defense].stealGivenTurnoverChance,
      blockChance: state.teams[defense].blockChance,
      shotFoulChance: state.teams[defense].shotFoulChance, assistedMakeChance: 0.64 };
  let opportunities = currentOpportunities();
  const offsets = { possession_start: 0, turnover: 0.58, shot: 0.52, block: 0.58,
    assist: 0.67, foul: 0.59, rebound: 0.9 };
  const clockCursor = { elapsed: -0.05 };
  const foulActorWeight = row => state.ordinaryPlayerFoulInputs.get(row.player.playerRef).ratePer36 ?? 1;
  const penaltyAt = (kind, offset, shooting = {}) => {
    if (!state.ordinaryFoulScenario) return null;
    const elapsed = clamp(Math.max(clockCursor.elapsed + 0.05, possessionSeconds * offset), 0, possessionSeconds);
    const decision = evaluateNbaTeamFoulPenaltyV1(state.ordinaryTeamFoulState, {
      eventId: state.nextEventId, period: period.startsWith('OT') ? 4 + Number(period.slice(2)) : Number(period.slice(1)),
      clockSecondsRemaining: Math.max(0, clockStart - elapsed), team: defense, kind, ...shooting,
    });
    state.ordinaryTeamFoulState = decision.resultingState;
    return decision;
  };
  const penaltyPayload = penalty => penalty ? { foulKind: penalty.countsTeamFoul ? 'ordinary-defensive' : 'ordinary-other',
    teamFoulsAfter: penalty.periodTeamFouls, lastTwoMinuteTeamFoulsAfter: penalty.lastTwoMinuteTeamFouls,
    ruleClockSecondsRemaining: penalty.resultingState.lastEvent.clockSecondsRemaining,
    penaltyReason: penalty.penaltyReason, freeThrowsAwarded: penalty.freeThrowAttempts,
    possessionDisposition: penalty.possessionDisposition, ruleSource: penalty.source } : {};
  const recordPenalty = (eventId, kind, actorPlayerRef, recipientPlayerRef, penalty) => {
    if (!penalty) return;
    state.ordinaryFoulLedger.push({ eventId, kind, foulingSide: defense, actorPlayerRef, recipientPlayerRef,
      freeThrowAttempts: penalty.freeThrowAttempts, period, teamFoulsAfter: penalty.periodTeamFouls,
      lastTwoMinuteTeamFoulsAfter: penalty.lastTwoMinuteTeamFouls, penaltyReason: penalty.penaltyReason,
      source: penalty.source });
  };
  state.ballDeadAtPossessionEnd = false;
  const emit = function* (type, payload, deltas = [], offsetKey = type) {
    let recovery;
    if (['rebound', 'team_rebound'].includes(type)) {
      const missedEventId = payload.missedFieldGoalEventId;
      recovery = claimReboundRecoveryV1(state.reboundRecoveryLedger, { eventId: state.nextEventId,
        missedEventId, recoverySide: payload.reboundType === 'offensive' ? offense : defense,
        creditType: type === 'rebound' ? 'player' : 'team', playerRef: payload.actorPlayerRef ?? null },
      { ...state.eventIndex.get(missedEventId), eventId: missedEventId });
    }
    for (const delta of deltas) increment(state, delta.side, delta.playerRef, delta.stat, delta.amount ?? 1);
    const offset = Number.isFinite(offsetKey) ? offsetKey : (offsets[offsetKey] ?? 0.9);
    const requestedElapsed = possessionSeconds * offset;
    const elapsed = clamp(Math.max(clockCursor.elapsed + 0.05, requestedElapsed), 0, possessionSeconds);
    clockCursor.elapsed = elapsed;
    advancePossessionMinutes(state, lineups, elapsed);
    const eventId = state.nextEventId++;
    const event = {
      eventId, possessionId, period,
      clock: clockText(clockStart - elapsed), offenseTeam: state.teams[offense].teamCode,
      defenseTeam: state.teams[defense].teamCode, type, ...payload,
      score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined,
    };
    state.eventIndex.set(eventId, { type, ...payload, ...(recovery ? { recoverySide: recovery.recoverySide,
      creditType: recovery.creditType } : {}) });
    if (type === 'block') state.blockedShotLinks.push(payload.missedFieldGoalEventId);
    if (type === 'steal') state.stealLinks.push(payload.turnoverEventId);
    if (['rebound', 'team_rebound'].includes(type) && payload.missedFieldGoalEventId) {
      state.reboundLinks.push(payload.missedFieldGoalEventId);
    }
    yield event;
  };
  // Minutes are tracked independently because a team has five active players during every turn.
  yield* emit('possession_start', {
    offenseLineup: offenseLineup.map(row => row.player.playerRef),
    defenseLineup: defenseLineup.map(row => row.player.playerRef),
  }, [], 'possession_start');

  if (random() < opportunities.turnoverChance) {
    const handler = chooseWeighted(offenseLineup, row => row.turnoversPer36 + row.assistsPer36 * 0.08, random);
    const stolen = random() < opportunities.stealGivenTurnoverChance;
    const turnoverEventId = state.nextEventId;
    yield* emit('turnover', { actorPlayerRef: handler.player.playerRef,
      result: stolen ? 'stolen' : 'lost_ball' },
    [{ side: offense, playerRef: handler.player.playerRef, stat: 'turnovers' }], 'turnover');
    if (stolen) {
      const stealer = chooseWeighted(defenseLineup, row => row.stealsPer36 +
        (state.sharedProductionEnabled ? 0 : Math.max(0, Number(row.player.defenseRating ?? 50) - 50) * 0.015), random);
      yield* emit('steal', { actorPlayerRef: stealer.player.playerRef,
        relatedPlayerRef: handler.player.playerRef, turnoverEventId },
      [{ side: defense, playerRef: stealer.player.playerRef, stat: 'steals' }], 'turnover');
    } else {
      // This generated lost-ball branch ends in an out-of-bounds/violation
      // stoppage. A stolen live ball does not create a substitution opportunity.
      yield* changeLineups(state, { period, clock: clockText(clockStart - clockCursor.elapsed), possessionId,
        opportunity: 'dead-ball-turnover' });
      state.ballDeadAtPossessionEnd = true;
    }
    return;
  }

  // A rebound retains control even after four shots. Keep a finite safety guard,
  // but never turn that guard into an unexplained opponent possession.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    if (attempt > 0) opportunities = currentOpportunities();
    state.ballDeadAtPossessionEnd = false;
    const shotClockOffset = attempt < 4 ? 0.34 + attempt * 0.14
      : 0.8 + 0.18 * (1 - 0.5 ** (attempt - 3));
    const foulScenario = state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V4
      ? { commonFoulProbability: opportunities.commonFoulProbability, shootingFoulProbability: opportunities.shootingFoulProbability }
      : state.ordinaryFoulScenario?.teams[defense];
    const foulDraw = foulScenario ? random() : null;
    if (foulScenario && foulDraw < foulScenario.commonFoulProbability) {
      const recipient = chooseWeighted(offenseLineup, row => row.fgaPer36 + row.assistsPer36, random);
      const fouler = chooseWeighted(defenseLineup, foulActorWeight, random);
      const penalty = penaltyAt('defensive-common', shotClockOffset);
      const personalFoulEventId = state.nextEventId;
      recordPenalty(personalFoulEventId, 'defensive-common', fouler.player.playerRef, recipient.player.playerRef, penalty);
      yield* emit('common_foul', { actorPlayerRef: fouler.player.playerRef, relatedPlayerRef: recipient.player.playerRef,
        shotsAwarded: penalty.freeThrowAttempts, ...penaltyPayload(penalty),
        actorWeightSource: state.ordinaryPlayerFoulInputs.get(fouler.player.playerRef).source },
      [{ side: defense, playerRef: fouler.player.playerRef, stat: 'personalFouls' }], shotClockOffset);
      yield* processPersonalFoulRoster(state, { offense, defense, offenseLineup, defenseLineup,
        defender: fouler, shooter: recipient, period, clockStart, clockCursor, possessionId, personalFoulEventId }, random);
      if (penalty.freeThrowAttempts > 0) {
        const freeThrowResult = yield* takeFreeThrows(state, offense, defense, recipient, offenseLineup, defenseLineup,
          penalty.freeThrowAttempts, period, clockStart, possessionSeconds, possessionId, clockCursor, random,
          { personalFoulEventId, freeThrowType: 'ordinary', ordinaryFoulKind: 'defensive-common' });
        state.ballDeadAtPossessionEnd = freeThrowResult.ballDead === true;
        if (freeThrowResult.offensiveRebound) continue;
        return;
      }
      yield* changeLineups(state, { period, clock: clockText(clockStart - clockCursor.elapsed), possessionId,
        opportunity: 'common-foul-inbound' });
      yield* emit('inbound', { teamCode: state.teams[offense].teamCode, retainedPossession: true,
        personalFoulEventId, reason: 'ordinary-common-foul-below-bonus' }, [], shotClockOffset + 0.09);
      continue;
    }
    const shooter = chooseShotRecipient(offenseLineup, random);
    const shotType = random() < shooter.threeAttemptShare ? 'three' : 'two';
    const scenarioShootingFoul = foulScenario && foulDraw < foulScenario.commonFoulProbability + foulScenario.shootingFoulProbability;
    const defender = chooseWeighted(defenseLineup, scenarioShootingFoul ? foulActorWeight : row => row.blocksPer36 +
      (state.sharedProductionEnabled ? 0 : Math.max(0, Number(row.player.defenseRating ?? 50) - 50) * 0.015 + 0.1), random);
    const isFoul = foulScenario ? foulDraw < foulScenario.commonFoulProbability + foulScenario.shootingFoulProbability
      : random() < opportunities.shotFoulChance;
    const isBlocked = !isFoul && random() < opportunities.blockChance *
      (state.sharedProductionEnabled ? 1 : clamp(0.6 + defender.blocksPer36 / 5, 0.65, 1.6));
    const baseMake = shotType === 'three' ? shooter.threePointPct : shooter.twoPointPct;
    const sharedConversion = sharedScoringCalibration(state, offense, offenseLineup);
    const shootingAdjustment = state.sharedProductionEnabled ? 0 : (Number(shooter.player.shootingRating ?? 50) - 50) * 0.0012;
    const defenseAdjustment = (Number(defender.player.defenseRating ?? 50) - 50) * 0.0008;
    const environmentAdjustment = sharedConversion ? sharedConversion.makeProbabilityShift : (targetMultiplier - 1) * 0.24;
    const fatigueAdjustment = shooter.fatiguePerformancePenalty ?? 0;
    const fatigueAdjustedBaseMake = baseMake * (1 - fatigueAdjustment);
    const makeChance = clamp(fatigueAdjustedBaseMake + shootingAdjustment - defenseAdjustment + environmentAdjustment,
      state.sharedProductionEnabled ? 0 : shotType === 'three' ? 0.18 : 0.32, shotType === 'three' ? 0.53 : 0.75);
    const made = !isBlocked && random() < makeChance;
    const result = isBlocked ? 'blocked' : isFoul ? (made ? 'made_and_fouled' : 'shooting_foul') : made ? 'made' : 'missed';
    const countsAsFieldGoalAttempt = !isFoul || made;
    const shotDeltas = countsAsFieldGoalAttempt ? [{ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalAttempts' },
      { side: offense, playerRef: shooter.player.playerRef, stat: shotType === 'three' ? 'threePointAttempts' : 'twoPointAttempts' }] : [];
    if (!made && countsAsFieldGoalAttempt) {
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalsMissed' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef,
        stat: shotType === 'three' ? 'threePointMisses' : 'twoPointMisses' });
    }
    const points = made ? (shotType === 'three' ? 3 : 2) : 0;
    const shotEventId = state.nextEventId;
    if (made) {
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'fieldGoalsMade' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef,
        stat: shotType === 'three' ? 'threePointersMade' : 'twoPointMakes' });
      shotDeltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'points', amount: points });
    }
    yield* emit('field_goal_attempt', {
      actorPlayerRef: shooter.player.playerRef,
      countsAsFieldGoalAttempt,
      shotType: shotType === 'three' ? '3PT' : '2PT',
      shotResult: result, points, blockedByPlayerRef: isBlocked ? defender.player.playerRef : null,
    }, shotDeltas, shotClockOffset);
    if (isBlocked) {
      yield* emit('block', { actorPlayerRef: defender.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, missedFieldGoalEventId: shotEventId },
      [{ side: defense, playerRef: defender.player.playerRef, stat: 'blocks' }], shotClockOffset + 0.05);
    }
    if (isFoul) {
      const personalFoulEventId = state.nextEventId;
      const penalty = penaltyAt('shooting', shotClockOffset + 0.08,
        { madeFieldGoal: made, shootingPoints: shotType === 'three' ? 3 : 2 });
      recordPenalty(personalFoulEventId, 'shooting', defender.player.playerRef, shooter.player.playerRef, penalty);
      yield* emit('shooting_foul', { actorPlayerRef: defender.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, shotsAwarded: made ? 1 : shotType === 'three' ? 3 : 2,
        ...penaltyPayload(penalty), ...(penalty ? { fieldGoalEventId: shotEventId,
          actorWeightSource: state.ordinaryPlayerFoulInputs.get(defender.player.playerRef).source } : {}) },
      [{ side: defense, playerRef: defender.player.playerRef, stat: 'personalFouls' }], shotClockOffset + 0.08);
      yield* processPersonalFoulRoster(state, { offense, defense, offenseLineup, defenseLineup,
        defender, shooter, period, clockStart, clockCursor, possessionId, personalFoulEventId }, random);
      const attempts = made ? 1 : shotType === 'three' ? 3 : 2;
      if (made) {
        const teammates = offenseLineup.filter(row => row.player.playerRef !== shooter.player.playerRef);
        if (teammates.length && random() < (state.sharedProductionEnabled &&
            !teammates.some(row => row.assistsPer36 > 0) ? 0 : opportunities.assistedMakeChance)) {
          const assister = chooseWeighted(teammates, row => row.assistsPer36, random);
          yield* emit('assist', { actorPlayerRef: assister.player.playerRef,
            relatedPlayerRef: shooter.player.playerRef, fieldGoalEventId: shotEventId },
          [{ side: offense, playerRef: assister.player.playerRef, stat: 'assists' }], shotClockOffset + 0.12);
        }
      }
      const freeThrowResult = yield* takeFreeThrows(state, offense, defense, shooter, offenseLineup,
        defenseLineup, attempts,
        period, clockStart, possessionSeconds, possessionId, clockCursor, random,
        penalty ? { personalFoulEventId, freeThrowType: 'ordinary', ordinaryFoulKind: 'shooting' } : null);
      state.ballDeadAtPossessionEnd = freeThrowResult.ballDead === true;
      if (freeThrowResult.offensiveRebound) continue;
      return;
    }
    if (made) {
      state.ballDeadAtPossessionEnd = true;
      const teammates = offenseLineup.filter(row => row.player.playerRef !== shooter.player.playerRef);
      if (teammates.length && random() < (state.sharedProductionEnabled &&
          !teammates.some(row => row.assistsPer36 > 0) ? 0 : opportunities.assistedMakeChance)) {
        const assister = chooseWeighted(teammates, row => row.assistsPer36, random);
      yield* emit('assist', { actorPlayerRef: assister.player.playerRef,
        relatedPlayerRef: shooter.player.playerRef, fieldGoalEventId: shotEventId },
      [{ side: offense, playerRef: assister.player.playerRef, stat: 'assists' }], shotClockOffset + 0.12);
      }
      return;
    }
    const recovery = reboundOwnership(state, offense, defense, offenseLineup, defenseLineup, random);
    const offensiveRebound = recovery.offensive;
    const rebounder = recovery.creditType === 'team' ? null : offensiveRebound
      ? chooseWeighted(offenseLineup, row => row.offensiveReboundsPer36 +
        (state.sharedProductionEnabled ? 0 : Math.max(0, Number(row.player.reboundingRating ?? 50) - 50) * 0.015), random)
      : chooseWeighted(defenseLineup, row => row.defensiveReboundsPer36 +
        (state.sharedProductionEnabled ? 0 : Math.max(0, Number(row.player.reboundingRating ?? 50) - 50) * 0.015), random);
    yield* emit(rebounder ? 'rebound' : 'team_rebound', { ...(rebounder ? { actorPlayerRef: rebounder.player.playerRef }
      : { creditType: 'team', recoveryTeam: state.teams[recovery.recoverySide].teamCode,
        recoverySide: recovery.recoverySide, ballDead: true, attributionSource: 'generated-unattributed-recovery-assumption' }),
      reboundType: offensiveRebound ? 'offensive' : 'defensive',
      missedFieldGoalEventId: shotEventId },
    rebounder ? [
      { side: offensiveRebound ? offense : defense, playerRef: rebounder.player.playerRef, stat: 'rebounds' },
      { side: offensiveRebound ? offense : defense, playerRef: rebounder.player.playerRef,
        stat: offensiveRebound ? 'offensiveRebounds' : 'defensiveRebounds' },
    ] : [], shotClockOffset + 0.18);
    state.ballDeadAtPossessionEnd = recovery.ballDead;
    if (offensiveRebound && recovery.ballDead) {
      yield* changeLineups(state, { period, clock: clockText(clockStart - clockCursor.elapsed), possessionId,
        opportunity: 'generated-team-recovery-stoppage' });
    }
    if (!offensiveRebound) return;
  }
  throw Object.assign(new Error('Repeated offensive rebounds exceeded the possession safety guard.'), {
    possessionReview: { status: 'requires-review', possessionId, reason: 'unresolved-possession-after-64-attempts' } });
}

function* processPersonalFoulRoster(state, context, random) {
  const { offense, defense, offenseLineup, defenseLineup, defender, shooter,
    period, clockStart, clockCursor, possessionId, personalFoulEventId } = context;
  const foulDecision = evaluatePersonalFoulDisqualification({ foulingPlayerRef: defender.player.playerRef,
    foulsByRef: new Map([...state.teams[defense].lines].map(([ref, line]) => [ref, line.personalFouls])),
    currentLineupRefs: defenseLineup.map(row => row.player.playerRef),
    eligiblePlayerRefs: state.teams[defense].rotationPlayers.filter(row => row.gameEligible).map(row => row.playerRef),
    retainedPlayerRefs: state.teams[defense].retainedPlayerRefs });
  if (foulDecision.status !== 'supported') throw Object.assign(new Error('Personal-foul roster decision requires review.'), { foulDecision });
  state.teams[defense].retainedPlayerRefs = foulDecision.retainedPlayerRefs;
  if (foulDecision.action === 'disqualify-and-replace') {
    yield* changeLineups(state, { period, clock: clockText(clockStart - clockCursor.elapsed), possessionId,
      opportunity: 'personal-foul-disqualification', sides: [defense], protectedPlayerRefs: { [offense]: [shooter.player.playerRef] } });
  } else if (foulDecision.action === 'retain-with-team-technical') {
    yield* takeDepletedRosterTechnical(state, { offense, defense, offenseLineup, defender,
      period, clock: clockText(clockStart - clockCursor.elapsed), possessionId, personalFoulEventId,
      sourceRefs: foulDecision.sourceRefs }, random);
  }
}

function* takeDepletedRosterTechnical(state, context, random) {
  const { offense, defense, offenseLineup, defender, period, clock, possessionId, personalFoulEventId, sourceRefs } = context;
  const eligibleShooterRefs = offenseLineup.map(row => row.player.playerRef);
  const shooter = [...offenseLineup].sort((a, b) => b.freeThrowPct - a.freeThrowPct ||
    String(a.player.canonicalName).localeCompare(String(b.player.canonicalName)))[0];
  const technicalEventId = state.nextEventId++;
  const technicalEvent = { eventId: technicalEventId, possessionId, period, clock, type: 'team_technical_foul',
    offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
    teamCode: state.teams[defense].teamCode, personalFoulEventId, retainedPlayerRef: defender.player.playerRef,
    technicalReason: 'depleted-roster-sixth-or-subsequent-personal-foul', freeThrowsAwarded: 1,
    eligibleShooterRefs, sourceRefs: structuredClone(sourceRefs), score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined };
  state.teamPenaltyLedger.push({ eventId: technicalEventId, teamCode: state.teams[defense].teamCode,
    personalFoulEventId, retainedPlayerRef: defender.player.playerRef, type: 'team-technical-foul',
    sourceRefs: structuredClone(sourceRefs) });
  state.eventIndex.set(technicalEventId, { type: technicalEvent.type, eligibleShooterRefs });
  yield technicalEvent;
  const made = random() < shooter.freeThrowPct;
  increment(state, offense, shooter.player.playerRef, 'freeThrowAttempts');
  increment(state, offense, shooter.player.playerRef, made ? 'freeThrowsMade' : 'freeThrowsMissed');
  if (made) increment(state, offense, shooter.player.playerRef, 'points');
  const event = { eventId: state.nextEventId++, possessionId, period, clock, type: 'free_throw',
    offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
    actorPlayerRef: shooter.player.playerRef, attempt: 1, attempts: 1, freeThrowType: 'technical',
    technicalFoulEventId: technicalEventId, result: made ? 'made' : 'missed', points: made ? 1 : 0,
    ballRemainsLive: false, score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined };
  state.eventIndex.set(event.eventId, { type: event.type, result: event.result, attempt: 1, attempts: 1,
    freeThrowType: 'technical', actorPlayerRef: event.actorPlayerRef, ballRemainsLive: false });
  const technicalShots = state.technicalFreeThrowsByFoul.get(technicalEventId) ?? [];
  technicalShots.push(event.eventId); state.technicalFreeThrowsByFoul.set(technicalEventId, technicalShots);
  yield event;
}

function* takeFreeThrows(state, offense, defense, shooter, offenseLineup, defenseLineup, attempts,
  period, clockStart, possessionSeconds, possessionId, clockCursor, random, foulContext = null) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt === attempts) {
      yield* changeLineups(state, { period, clock: clockText(clockStart - Math.max(0, clockCursor.elapsed)), possessionId,
        opportunity: 'before-final-free-throw', protectedPlayerRefs: { [offense]: [shooter.player.playerRef] } });
    }
    const made = random() < shooter.freeThrowPct;
    const freeThrowEventId = state.nextEventId;
    const deltas = [{ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowAttempts' }];
    if (made) {
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowsMade' });
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'points' });
    } else {
      deltas.push({ side: offense, playerRef: shooter.player.playerRef, stat: 'freeThrowsMissed' });
    }
    const requestedElapsed = possessionSeconds * (0.68 + 0.08 * attempt / attempts);
    const elapsed = clamp(Math.max(clockCursor.elapsed + 0.05, requestedElapsed), 0, possessionSeconds);
    clockCursor.elapsed = elapsed;
    advancePossessionMinutes(state, state.currentLineups, elapsed);
    for (const delta of deltas) increment(state, delta.side, delta.playerRef, delta.stat, delta.amount ?? 1);
    const event = {
      eventId: state.nextEventId++, possessionId, period,
      clock: clockText(clockStart - elapsed), offenseTeam: state.teams[offense].teamCode,
      defenseTeam: state.teams[defense].teamCode, type: 'free_throw',
      actorPlayerRef: shooter.player.playerRef, attempt, attempts,
      ...(foulContext ?? {}),
      result: made ? 'made' : 'missed', points: made ? 1 : 0,
      score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined,
    };
    state.eventIndex.set(event.eventId, { type: event.type, attempt, attempts, result: event.result,
      ...(foulContext ? { ...foulContext, actorPlayerRef: shooter.player.playerRef, ballRemainsLive: attempt === attempts } : {}) });
    if (foulContext) {
      const shots = state.ordinaryFreeThrowsByFoul.get(foulContext.personalFoulEventId) ?? [];
      shots.push(event.eventId); state.ordinaryFreeThrowsByFoul.set(foulContext.personalFoulEventId, shots);
    }
    yield event;
    if (attempt === attempts && !made) {
      const recovery = reboundOwnership(state, offense, defense, offenseLineup, defenseLineup, random);
      const offensiveRebound = recovery.offensive;
      const reboundSide = offensiveRebound ? offense : defense;
      const reboundLineup = offensiveRebound ? offenseLineup : defenseLineup;
      const rebounder = recovery.creditType === 'team' ? null : chooseWeighted(reboundLineup,
        row => offensiveRebound ? row.offensiveReboundsPer36 : row.defensiveReboundsPer36, random);
      claimReboundRecoveryV1(state.reboundRecoveryLedger, { eventId: state.nextEventId, missedEventId: freeThrowEventId,
        recoverySide: reboundSide, creditType: recovery.creditType, playerRef: rebounder?.player.playerRef ?? null },
      { ...state.eventIndex.get(freeThrowEventId), eventId: freeThrowEventId });
      if (rebounder) {
        increment(state, reboundSide, rebounder.player.playerRef, 'rebounds');
        increment(state, reboundSide, rebounder.player.playerRef,
          offensiveRebound ? 'offensiveRebounds' : 'defensiveRebounds');
      }
      const reboundElapsed = clamp(Math.max(clockCursor.elapsed + 0.05, possessionSeconds * 0.96),
        0, possessionSeconds);
      clockCursor.elapsed = reboundElapsed;
      advancePossessionMinutes(state, state.currentLineups, reboundElapsed);
      const reboundEvent = {
        eventId: state.nextEventId++, possessionId, period,
        clock: clockText(clockStart - reboundElapsed),
        offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
        type: rebounder ? 'rebound' : 'team_rebound', ...(rebounder ? { actorPlayerRef: rebounder.player.playerRef }
          : { creditType: 'team', recoveryTeam: state.teams[reboundSide].teamCode, recoverySide: reboundSide,
            ballDead: true, attributionSource: 'generated-unattributed-recovery-assumption' }),
        reboundType: offensiveRebound ? 'offensive' : 'defensive',
        missedFreeThrowEventId: freeThrowEventId,
        score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined,
      };
      state.eventIndex.set(reboundEvent.eventId, { type: reboundEvent.type,
        missedFreeThrowEventId: freeThrowEventId, reboundType: reboundEvent.reboundType,
        actorPlayerRef: rebounder?.player.playerRef, recoverySide: reboundSide, creditType: recovery.creditType });
      state.reboundLinks.push(freeThrowEventId);
      yield reboundEvent;
      if (offensiveRebound && recovery.ballDead) {
        yield* changeLineups(state, { period, clock: clockText(clockStart - clockCursor.elapsed), possessionId,
          opportunity: 'generated-team-recovery-stoppage' });
      }
      return { offensiveRebound, ballDead: recovery.ballDead };
    }
  }
  return { offensiveRebound: false, ballDead: true };
}

function finalSummary(state, prediction, options) {
  const reboundRecoverySummary = finalizeReboundRecoveryLedgerV1(state.reboundRecoveryLedger, state.eventIndex);
  const verifyTeam = side => {
    const team = state.teams[side];
    const playerTotals = Object.fromEntries(countFields.map(field => [field, 0]));
    let playerMinutes = 0;
    for (const line of team.lines.values()) {
      for (const field of countFields) playerTotals[field] += line[field];
      playerMinutes += line.minutes;
      if (!Number.isFinite(line.minutes) || line.minutes < 0 || line.minutes > 48 + 5 * state.overtimePeriods + 1e-7) {
        throw new Error(`Invalid elapsed player minutes for ${side}/${line.playerRef}.`);
      }
      if (line.fieldGoalAttempts !== line.fieldGoalsMade + line.fieldGoalsMissed ||
          line.fieldGoalAttempts !== line.threePointAttempts + line.twoPointAttempts ||
          line.fieldGoalsMade !== line.threePointersMade + line.twoPointMakes ||
          line.threePointAttempts !== line.threePointersMade + line.threePointMisses ||
          line.twoPointAttempts !== line.twoPointMakes + line.twoPointMisses ||
          line.freeThrowAttempts !== line.freeThrowsMade + line.freeThrowsMissed ||
          line.rebounds !== line.offensiveRebounds + line.defensiveRebounds ||
          line.points !== 3 * line.threePointersMade + 2 * line.twoPointMakes + line.freeThrowsMade) {
        throw new Error(`Player box-score identity failed for ${side}/${line.playerRef}: ${JSON.stringify({
          points: line.points, threes: line.threePointersMade, twos: line.twoPointMakes,
          ftm: line.freeThrowsMade, fga: line.fieldGoalAttempts, fgm: line.fieldGoalsMade,
          fgmMissed: line.fieldGoalsMissed, threePa: line.threePointAttempts,
          threePmMissed: line.threePointMisses, twoPa: line.twoPointAttempts,
          twoPmMissed: line.twoPointMisses, fta: line.freeThrowAttempts,
          ftmMissed: line.freeThrowsMissed, rebounds: line.rebounds,
          oreb: line.offensiveRebounds, dreb: line.defensiveRebounds, assists: line.assists,
        })}`);
      }
    }
    for (const field of countFields) {
      if (playerTotals[field] !== team.totals[field]) {
        throw new Error(`Team/player ${field} totals do not reconcile for ${side}.`);
      }
    }
    if (Math.abs(playerMinutes - team.totals.minutes) > 1e-7 ||
        Math.abs(team.totals.minutes - 240 - 25 * state.overtimePeriods) > 1e-7) {
      throw new Error(`Team/player minutes do not reconcile for ${side}.`);
    }
    if (team.totals.fieldGoalAttempts !== team.totals.fieldGoalsMade + team.totals.fieldGoalsMissed ||
        team.totals.points !== state.score[side] || team.totals.assists > team.totals.fieldGoalsMade) {
      throw new Error(`Team box-score identity failed for ${side}.`);
    }
  };
  verifyTeam('home');
  verifyTeam('away');
  for (const side of ['home', 'away']) {
    if (reboundRecoverySummary.bySide[side].playerRecoveries !== state.teams[side].totals.rebounds) {
      throw new Error(`Credited rebound ledger does not reconcile to player/team boxes for ${side}.`);
    }
  }
  if (state.teams.home.totals.steals > state.teams.away.totals.turnovers ||
      state.teams.away.totals.steals > state.teams.home.totals.turnovers) {
    throw new Error('A steal must correspond to an opposing-team turnover.');
  }
  if (state.teams.home.totals.blocks > state.teams.away.totals.fieldGoalsMissed ||
      state.teams.away.totals.blocks > state.teams.home.totals.fieldGoalsMissed) {
    throw new Error('A block must correspond to a missed opponent field goal.');
  }
  for (const shotId of state.blockedShotLinks) {
    if (state.eventIndex.get(shotId)?.type !== 'field_goal_attempt' ||
        state.eventIndex.get(shotId)?.shotResult !== 'blocked') {
      throw new Error(`Block event does not link to a blocked, missed field goal (${shotId}).`);
    }
  }
  for (const turnoverId of state.stealLinks) {
    if (state.eventIndex.get(turnoverId)?.type !== 'turnover' ||
        state.eventIndex.get(turnoverId)?.result !== 'stolen') {
      throw new Error(`Steal event does not link to an opposing turnover (${turnoverId}).`);
    }
  }
  for (const missedEventId of state.reboundLinks) {
    const missed = state.eventIndex.get(missedEventId);
    if (!missed || !((missed.type === 'field_goal_attempt' &&
        ['blocked', 'missed'].includes(missed.shotResult)) ||
        (missed.type === 'free_throw' && missed.result === 'missed' && missed.ballRemainsLive !== false))) {
      throw new Error(`Rebound event does not link to a missed shot or free throw (${missedEventId}).`);
    }
  }
  for (const penalty of state.teamPenaltyLedger) {
    const foul = state.eventIndex.get(penalty.personalFoulEventId);
    const technical = state.eventIndex.get(penalty.eventId);
    const shots = (state.technicalFreeThrowsByFoul.get(penalty.eventId) ?? []).map(id => state.eventIndex.get(id));
    if (!['shooting_foul', 'common_foul'].includes(foul?.type) || technical?.type !== 'team_technical_foul' ||
        foul.actorPlayerRef !== penalty.retainedPlayerRef || shots.length !== 1 ||
        shots[0].freeThrowType !== 'technical' || shots[0].ballRemainsLive !== false ||
        !technical.eligibleShooterRefs.includes(shots[0].actorPlayerRef)) {
      throw new Error('Depleted-roster technical foul and eligible free-throw attribution do not reconcile.');
    }
  }
  if (state.ordinaryFoulScenario) {
    const foulCounts = { home: 0, away: 0 };
    for (const foul of state.ordinaryFoulLedger) {
      const event = state.eventIndex.get(foul.eventId);
      const shots = (state.ordinaryFreeThrowsByFoul.get(foul.eventId) ?? []).map(id => state.eventIndex.get(id));
      const expectedType = foul.kind === 'shooting' ? 'shooting_foul' : 'common_foul';
      if (event?.type !== expectedType || event.actorPlayerRef !== foul.actorPlayerRef ||
          event.relatedPlayerRef !== foul.recipientPlayerRef || event.shotsAwarded !== foul.freeThrowAttempts ||
          shots.length !== foul.freeThrowAttempts || shots.some((shot, index) => shot?.type !== 'free_throw' ||
            shot.personalFoulEventId !== foul.eventId || shot.actorPlayerRef !== foul.recipientPlayerRef ||
            shot.attempt !== index + 1 || shot.attempts !== foul.freeThrowAttempts ||
            shot.freeThrowType !== 'ordinary' || shot.ordinaryFoulKind !== foul.kind ||
            shot.ballRemainsLive !== (index + 1 === foul.freeThrowAttempts))) {
        throw new Error('Ordinary foul, free-throw award and player attribution do not reconcile.');
      }
      foulCounts[foul.foulingSide] += 1;
    }
    for (const side of ['home', 'away']) {
      const quotaCount = Object.values(state.ordinaryTeamFoulState.periods).reduce((sum, period) => sum + period[side].teamFouls, 0);
      if (quotaCount !== foulCounts[side] || foulCounts[side] !== state.teams[side].totals.personalFouls) {
        throw new Error('Ordinary foul quota and player/team personal fouls do not reconcile.');
      }
    }
  }
  const homeScore = state.teams.home.totals.points;
  const awayScore = state.teams.away.totals.points;
  return {
    modelId: state.modelId,
    modelVersion: state.modelVersion,
    status: state.status,
    score: { home: homeScore, away: awayScore },
    winner: homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'tied',
    pregamePrediction: prediction,
    homeTeamStats: { ...state.teams.home.totals },
    awayTeamStats: { ...state.teams.away.totals },
    homePlayerBoxes: [...state.teams.home.lines.values()].map(line => ({ ...line })),
    awayPlayerBoxes: [...state.teams.away.lines.values()].map(line => ({ ...line })),
    possessionsPerTeam: { home: state.possessions.home, away: state.possessions.away },
    simulationDiagnostics: {
      ...(state.ordinaryFoulScenario ? { ordinaryFouls: { format: 'djhc-live-ordinary-foul-result-v1',
        scenario: structuredClone(state.ordinaryFoulScenario), teamFoulState: structuredClone(state.ordinaryTeamFoulState),
        foulLedger: structuredClone(state.ordinaryFoulLedger),
        freeThrowsByFoul: Object.fromEntries([...state.ordinaryFreeThrowsByFoul].map(([id, events]) => [id, [...events]])),
        playerRateInputs: Object.fromEntries([...state.ordinaryPlayerFoulInputs].map(([ref, value]) => [ref, structuredClone(value)])),
        neutralConversionCalibrationApplies: false,
        ...(state.sharedProductionMapping === SHARED_POSSESSION_MAPPING_V4 ? {
          neutralMeanConversion: 'joint-points-FTA-total-PF-ORB; fixed-five-midpoint-clock-approximation',
          matchupSplit: state.playerFoulMatchupSplit,
          actualLiveClockAndRotationMeanGuarantee: false } : {}), empiricallySelected: false,
        disclosure: 'Generated common/shooting foul mechanics use explicit scenario probabilities. Quotas, awards, possession retention and boxes are checked; foul frequency, timing and resulting score distributions are not empirically selected.' } } : {}),
      reboundOwnership: { mode: state.reboundOwnershipMode, ...reboundRecoverySummary,
        ...(state.reboundOwnershipMode === REBOUND_OWNERSHIP_BUDGET_V1 ? {
          lineupBudgets: [...state.reboundOwnershipBudgets].map(([key, budget]) => ({ lineupKey: JSON.parse(key), ...budget })),
          empiricallySelected: false,
          disclosure: 'Unattributed recoveries are generated assumptions. Player rebound budgets use prior/scenario rates and event expectations; possession control is preserved unless an explicit scenario changes retention. No observed NBA team-rebound labels are inferred.' } : {}) },
      reboundChance: Object.fromEntries(['home', 'away'].map(side => [side, {
        value: [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping) ? null : state.teams[side].offensiveReboundChance,
        source: [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)
          ? 'lineup-specific-rate-linked-retention; see-lineupRecoveryContexts' : state.teams[side].offensiveReboundChanceSource,
        rawMatchupRate: [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping) ? null : state.teams[side].rawMatchupOffensiveReboundRate,
      }])),
      reboundChanceBounds: [SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping)
        ? [0, RATE_LINKED_RETENTION_CEILING_V3] : [...REBOUND_CHANCE_BOUNDS],
      reboundChanceShrinkageToLeaguePrior: REBOUND_PRIOR_SHRINKAGE,
      playerScoringRate: Object.fromEntries(['home', 'away'].map(side => [side,
        { ...state.teams[side].scoringRateDiagnostics }])),
      rotations: Object.fromEntries(['home', 'away'].map(side => {
        const team = state.teams[side];
        return [side, { format: 'djhc-live-rotation-result-v1', controls: structuredClone(team.rotationControls),
          shotUsageWeights: team.roster.map(player => ({ playerRef: player.player.playerRef,
            canonicalName: player.player.canonicalName, multiplier: player.shotUsageMultiplier })),
          shotUsageDisclosure: 'Scenario assumption for relative field-goal attempt allocation; not a measured efficiency effect.',
          plannedMinutes: structuredClone(team.rotationSchedule.plannedMinutes),
          minuteDeviations: team.rotationPlayers.map(player => ({ canonicalName: player.canonicalName,
            playerRef: player.playerRef, requestedMinutes: Number(player.projectedMinutes ?? player.minutes ?? 0), targetMinutes: player.minutesTarget,
            actualMinutes: team.actualMinutes.get(player.playerRef),
            difference: team.actualMinutes.get(player.playerRef) - player.minutesTarget })),
          openingStintMinutes: team.rotationSchedule.openingStintMinutes,
          retainedSixFoulPlayerRefs: [...team.retainedPlayerRefs],
          emergencyActivations: structuredClone(team.emergencyActivations),
          substitutions: structuredClone(team.rotationChanges), availabilityDisclosures: structuredClone(team.availabilityDisclosures),
          disclosure: 'Planned minutes are exact; actual minutes follow eligible modeled stoppages and optional coaching. Overtime minutes are extra. No empirical rotation model is selected.' }];
      })),
      teamPenaltyLedger: structuredClone(state.teamPenaltyLedger),
      minuteLimitTimeouts: state.timeoutState ? structuredClone(state.timeoutState) : null,
      timeoutRuleContext: state.timeoutState ? structuredClone(state.timeoutRuleContext) : null,
      coaching: structuredClone(state.coachingDiagnostics),
      scoringEnvironmentMultiplier: state.scoringEnvironmentMultiplier ?? null,
      ...(state.sharedProductionEnabled ? { sharedPlayerProduction: {
        format: 'djhc-live-shared-production-result-v1', modelId: state.playerProductionModelId,
        eventMapping: state.sharedProductionMapping,
        status: 'isolated-development; joint-game-selection-pending',
        legacyRateRegressionsBypassed: true, independentPredictiveCertification: false,
        teams: Object.fromEntries(['home', 'away'].map(side => [side, {
          expectedPlayerPoints: state.teams[side].expectedPoints,
          forecasts: state.teams[side].roster.map(row => ({ ...row.sharedProductionForecast,
            shotProjection: row.shotProjectionDiagnostics, reboundSplit: row.reboundSplitDiagnostics })),
          lineupScoringConversions: [...state.teams[side].sharedScoringCalibrations].map(([playerRefs, conversion]) => ({
            playerRefs: JSON.parse(playerRefs), ...conversion })),
          ...([SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(state.sharedProductionMapping) ? {
            lineupRecoveryContexts: [...state.teams[side].sharedOpportunityCache].map(([lineupKey, opportunities]) => ({
              lineupKey: JSON.parse(lineupKey), ...opportunities.retentionContext,
              recoveryVolume: opportunities.recoveryVolume })),
          } : {}),
        }])),
        opportunityPolicy: 'recompute-from-current-five-player-lineups; shared-possession-and-linked-event-budgets',
        scoreEnvironmentSource: 'current-five-player-means-to-neutral-possession-conversion; opponent-effects-remain-active',
        disclosure: 'The all-data player candidate and mean-to-event mappings are for isolated development. No historical OOF, independent validity, or realistic event calibration is established by this runtime.',
      } } : {}),
    },
    overtimePeriods: state.overtimePeriods,
    boxScoreConsistency: 'verified-exact-player-to-team-totals-and-event-identities',
    streamMode: options.streamMode ?? 'precomputed-events',
    disclosure: 'Event sequence is generated by this simulator from prior performance, player ratings, matchups, and team prediction context. It is a simulated play-by-play, not an observed NBA play record.',
  };
}

function* liveEvents(model, input, options = {}, summaryOnly = false) {
  const random = seededRandom(options.seed ?? 1);
  const preparedInput = resolveGameInputSeasonAges(input, model);
  const productionContext = options.playerProductionCandidate ? { candidate: options.playerProductionCandidate,
    seasonStartYear: preparedInput.seasonStartYear, gameLocalDate: preparedInput.gameLocalDate ?? preparedInput.date ?? null } : null;
  const eventMapping = options.playerEventMapping ?? 'legacy-neutral-v1';
  if (!['legacy-neutral-v1', SHARED_POSSESSION_MAPPING_V2, SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(eventMapping) ||
      (!productionContext && eventMapping !== 'legacy-neutral-v1')) {
    throw Object.assign(new Error('Unsupported player event mapping selection.'), {
      productionReview: { status: 'requires-review', reason: 'unsupported-player-event-mapping' } });
  }
  if (options.playerEventCalibrationCache !== undefined) {
    if (!productionContext) throw Object.assign(new Error('Calibration cache requires shared player production.'), {
      productionReview: { status: 'requires-review', reason: 'calibration-cache-without-player-production' } });
    readSharedEventCalibrationCacheV1(options.playerEventCalibrationCache);
  }
  const reboundOwnershipMode = options.playerReboundOwnership ?? 'all-player-v1';
  if (!['all-player-v1', REBOUND_OWNERSHIP_BUDGET_V1].includes(reboundOwnershipMode) ||
      (reboundOwnershipMode === REBOUND_OWNERSHIP_BUDGET_V1 &&
        ![SHARED_POSSESSION_MAPPING_V2, SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(eventMapping))) {
    throw Object.assign(new Error('Unsupported player rebound ownership selection.'), {
      reboundReview: { status: 'requires-review', reason: 'unsupported-player-rebound-ownership' } });
  }
  const reboundSplitSelection = options.playerReboundSplit ?? 'generated-or-scenario-v1';
  if (!['generated-or-scenario-v1', PRIOR_REBOUND_SPLIT_V1].includes(reboundSplitSelection) ||
      (reboundSplitSelection === PRIOR_REBOUND_SPLIT_V1 && reboundOwnershipMode !== REBOUND_OWNERSHIP_BUDGET_V1)) {
    throw Object.assign(new Error('Unsupported player rebound split selection.'), { reboundReview: {
      status: 'requires-review', reason: 'unsupported-player-rebound-split' } });
  }
  if (productionContext) productionContext.reboundSplitSelection = reboundSplitSelection;
  if ((eventMapping === SHARED_POSSESSION_MAPPING_V4 && options.ordinaryFoulScenario !== undefined) ||
      (options.playerFoulUnknownRatePer36 !== undefined && (eventMapping !== SHARED_POSSESSION_MAPPING_V4 ||
        !Number.isFinite(options.playerFoulUnknownRatePer36) || options.playerFoulUnknownRatePer36 < 0))) {
    throw Object.assign(new Error('Incompatible or invalid V4 foul conversion options.'), {
      productionReview: { status: 'requires-review', reason: 'invalid-v4-foul-conversion-options' } });
  }
  const playerFoulMatchupSplit = options.playerFoulMatchupSplit ?? 'defense-self-split-v1';
  if (!['defense-self-split-v1', 'offense-share-defense-frequency-v1'].includes(playerFoulMatchupSplit) ||
      (options.playerFoulMatchupSplit !== undefined && eventMapping !== SHARED_POSSESSION_MAPPING_V4)) {
    throw Object.assign(new Error('Unsupported V4 foul matchup split.'), {
      productionReview: { status: 'requires-review', reason: 'unsupported-v4-foul-matchup-split' } });
  }
  const ordinaryFoulScenario = eventMapping === SHARED_POSSESSION_MAPPING_V4
    ? { format: 'djhc-joint-prior-pf-foul-model-v4', version: 1, ruleProfile: 'nba-current-rule-scenario',
      evidence: { kind: 'generated-latent-decomposition', source: 'current-five-neutral-points-FTA-PF-ORB-conversion' },
      unknownPersonalFoulFallbackPer36: options.playerFoulUnknownRatePer36 ?? null,
      empiricallySelected: false, opportunityDefinition: 'one-exclusive-common-shooting-or-no-foul-draw-per-post-turnover-attack',
      disclosure: 'Lineup-specific probabilities are generated by the joint neutral solver, not observed foul subtypes. The solver approximates regulation quota clocks by possession midpoints; live substitutions, precise clocks and overtime can change realized means.' }
    : normalizeLiveOrdinaryFoulScenarioV1(options.ordinaryFoulScenario);
  const reboundOwnershipScenarios = {};
  for (const side of ['home', 'away']) {
    const scenario = preparedInput[side]?.reboundOwnershipScenario;
    if (scenario === undefined) continue;
    if (reboundOwnershipMode !== REBOUND_OWNERSHIP_BUDGET_V1 || !scenario ||
        scenario.evidence?.kind !== 'explicit-scenario' || typeof scenario.evidence.source !== 'string' || !scenario.evidence.source.trim() ||
        !Number.isFinite(scenario.playerCreditProbability) || scenario.playerCreditProbability < 0 || scenario.playerCreditProbability > 1 ||
        (scenario.teamOffensiveRetentionProbability !== undefined && (!Number.isFinite(scenario.teamOffensiveRetentionProbability) ||
          scenario.teamOffensiveRetentionProbability < 0 || scenario.teamOffensiveRetentionProbability > 1)) ||
        Object.keys(scenario).some(key => !['playerCreditProbability', 'teamOffensiveRetentionProbability', 'evidence'].includes(key))) {
      throw Object.assign(new Error('Invalid rebound ownership scenario.'), { reboundReview: {
        status: 'requires-review', reason: 'invalid-rebound-ownership-scenario' } });
    }
    reboundOwnershipScenarios[side] = structuredClone(scenario);
    if ([SHARED_POSSESSION_MAPPING_V3, SHARED_POSSESSION_MAPPING_V4].includes(eventMapping) && scenario.teamOffensiveRetentionProbability !== undefined &&
        scenario.teamOffensiveRetentionProbability > RATE_LINKED_RETENTION_CEILING_V3) {
      throw Object.assign(new Error('V3 team recovery scenario exceeds supported numerical retention.'), { reboundReview: {
        status: 'requires-review', reason: 'unsupported-v3-team-retention-scenario' } });
    }
  }
  const homeTeam = prepareTeam(model, preparedInput.home ?? {}, 'home', productionContext);
  const awayTeam = prepareTeam(model, preparedInput.away ?? {}, 'away', productionContext);
  const capEnabled = homeTeam.hasExplicitMinuteCaps || awayTeam.hasExplicitMinuteCaps;
  if (options.timeoutRuleProfile !== undefined && options.timeoutRuleProfile !== 'nba-2017-onward') {
    throw Object.assign(new Error('Unsupported live timeout rule profile.'), { timeoutReview: {
      status: 'requires-review', reason: 'unsupported-timeout-rule-profile' } });
  }
  if (capEnabled && Number.isInteger(preparedInput.seasonStartYear) && preparedInput.seasonStartYear < 2017 &&
      options.timeoutRuleProfile === undefined) {
    throw Object.assign(new Error('Historical timeout rules before 2017 are unsupported; select an explicit current-rule scenario to use this prototype.'), {
      timeoutReview: { status: 'requires-review', reason: 'historical-timeout-profile-unresolved',
        seasonStartYear: preparedInput.seasonStartYear } });
  }
  const allPlayers = [...homeTeam.players, ...awayTeam.players];
  if (new Set(allPlayers.map(player => normalizeCanonicalPlayerName(player.canonicalName))).size !== allPlayers.length ||
      new Set(allPlayers.map(player => String(player.playerRef).trim())).size !== allPlayers.length) {
    throw new Error('A live game cannot place one player identity on both teams.');
  }
  const ordinaryPlayerFoulInputs = new Map(ordinaryFoulScenario ? allPlayers.map(player => [player.playerRef,
    resolveLivePersonalFoulInputV1(player, { seasonStartYear: preparedInput.seasonStartYear,
      gameLocalDate: preparedInput.gameLocalDate ?? preparedInput.date ?? null })]) : []);
  if (eventMapping === SHARED_POSSESSION_MAPPING_V4) {
    for (const team of [homeTeam, awayTeam]) for (const row of team.roster) {
      const prior = ordinaryPlayerFoulInputs.get(row.player.playerRef);
      if (prior.ratePer36 === null && options.playerFoulUnknownRatePer36 === undefined) {
        throw Object.assign(new Error('V4 foul conversion needs an explicit fallback for unknown PF history.'), {
          productionReview: { status: 'requires-review', reason: 'unknown-v4-personal-foul-rate' } });
      }
      row.personalFoulsPer36 = prior.ratePer36 ?? options.playerFoulUnknownRatePer36;
      if (prior.ratePer36 === null) ordinaryPlayerFoulInputs.set(row.player.playerRef, { ...prior,
        ratePer36: row.personalFoulsPer36, source: 'explicit-generated-unknown-total-PF-fallback',
        missingPriorHistory: true, empiricallySelected: false });
    }
  }
  let predictionInput = preparedInput;
  if (productionContext) {
    predictionInput = { ...preparedInput, features: { ...preparedInput.features } };
    for (const field of ['playerProductionDiff', 'playerProductionTotal']) delete predictionInput.features[field];
    for (const [side, team] of [['home', homeTeam], ['away', awayTeam]]) {
      predictionInput[side] = { ...preparedInput[side], expectedPlayerPoints: team.expectedPoints,
        players: team.roster.map(row => ({ ...row.player, projectedMinutes: row.minutesTarget,
          pointsPer36: row.pointsPer36 })) };
    }
  }
  const prediction = predictGame(model, predictionInput);
  if (preparedInput.featureEvidence !== undefined) {
    prediction.featureEvidence = structuredClone(preparedInput.featureEvidence);
  }
  if (productionContext) {
    prediction.scoringInterpretation = {
      format: 'djhc-live-scoring-interpretation-v1',
      frozenScoreModelRole: 'comparison-context-not-direct-sample-target',
      realizedPlayerAndEventPointsSource: 'shared-production-lineup-means-and-event-mapping',
      frozenScorePredictionUsedAsDirectSampleTarget: false,
      disclosure: 'The frozen score-model prediction is comparison context. Shared player-production lineup means and the event mapping drive realized player points and the sample score.',
    };
  }
  for (const [team, opponent] of [[homeTeam, awayTeam], [awayTeam, homeTeam]]) {
    const reboundEstimate = estimateOffensiveReboundChance({
      offensiveRebounds: team.expectedOffensiveRebounds,
      opponentDefensiveRebounds: opponent.expectedDefensiveRebounds,
      explicitRate: team.suppliedOffensiveReboundRate,
    });
    team.baseOffensiveReboundChance = reboundEstimate.chance;
    team.offensiveReboundChance = clamp(scaleProbabilityOdds(reboundEstimate.chance, team.coachingPlan.offensiveReboundMultiplier), ...REBOUND_CHANCE_BOUNDS);
    team.offensiveReboundChanceSource = reboundEstimate.source;
    team.rawMatchupOffensiveReboundRate = reboundEstimate.rawMatchupRate;
  }
  const state = {
    modelId: productionContext ? `${model.modelId}+${productionContext.candidate.modelId}${eventMapping !== 'legacy-neutral-v1' ? `+${eventMapping}` : ''}${reboundOwnershipMode === REBOUND_OWNERSHIP_BUDGET_V1 ? `+${reboundOwnershipMode}` : ''}${reboundSplitSelection === PRIOR_REBOUND_SPLIT_V1 ? `+${reboundSplitSelection}` : ''}` : model.modelId,
    modelVersion: model.version, status: productionContext ? 'isolated-development; joint-game-selection-pending' : model.status,
    sharedProductionEnabled: Boolean(productionContext), playerProductionModelId: productionContext?.candidate.modelId ?? null,
    sharedProductionMapping: eventMapping,
    playerFoulMatchupSplit,
    playerEventCalibrationCache: options.playerEventCalibrationCache ?? null,
    reboundOwnershipMode, reboundOwnershipScenarios, reboundOwnershipBudgets: new Map(),
    reboundRecoveryLedger: createReboundRecoveryLedgerV1(),
    ordinaryFoulScenario, ordinaryTeamFoulState: ordinaryFoulScenario ? createNbaTeamFoulStateV1() : null,
    ordinaryPlayerFoulInputs,
    ordinaryFoulLedger: [], ordinaryFreeThrowsByFoul: new Map(),
    nextEventId: 1, score: { home: 0, away: 0 },
    teams: {
      home: homeTeam,
      away: awayTeam,
    },
    possessions: { home: 0, away: 0 }, overtimePeriods: 0,
    eventIndex: new Map(), blockedShotLinks: [], reboundLinks: [], stealLinks: [],
    includeBoxScoreSnapshots: !summaryOnly, technicalFreeThrowsByFoul: new Map(),
    teamPenaltyLedger: [],
    timeoutState: capEnabled ? createNbaTimeoutState() : null,
    timeoutRuleContext: { ruleProfile: 'nba-2017-onward', seasonStartYear: preparedInput.seasonStartYear ?? null,
      selection: options.timeoutRuleProfile === undefined ? 'default-current-rule-scenario' : 'explicit-current-rule-scenario',
      historicalRulesVerified: false,
      disclosure: 'This profile uses the current sourced timeout rule scenario. It does not certify reconstruction of historical or future season timeout rules.' },
    scoringEnvironmentMultiplier: null,
  };
  if (ordinaryFoulScenario) state.modelId += '+ordinary-foul-scenario-v1';
  if (eventMapping === SHARED_POSSESSION_MAPPING_V4 && playerFoulMatchupSplit === 'offense-share-defense-frequency-v1') {
    state.modelId += '+offense-share-defense-frequency-v1';
  }
  const targetPoints = {
    home: Math.max(1, productionContext ? homeTeam.expectedPoints : prediction.expectedHomePoints),
    away: Math.max(1, productionContext ? awayTeam.expectedPoints : prediction.expectedAwayPoints),
  };
  const multipliers = {
    // The parent path uses its pregame environment. The opt-in development path
    // takes its environment from accepted rotation-weighted player means.
    home: clamp(targetPoints.home / 110, 0.86, 1.14),
    away: clamp(targetPoints.away / 110, 0.86, 1.14),
  };
  state.scoringEnvironmentMultiplier = productionContext ? null : { ...multipliers };
  const maxOT = clamp(Math.floor(options.maxOvertimePeriods ?? 8), 1, 12);
  const regulationPace = clamp(Math.round((homeTeam.possessions * homeTeam.coachingPlan.paceMultiplier +
    awayTeam.possessions * awayTeam.coachingPlan.paceMultiplier) / 2), 80, 120);
  state.regulationPossessionsPerTeam = regulationPace;
  state.coachingDiagnostics = { format: 'djhc-live-coaching-effects-v1', regulationPossessionsPerTeam: regulationPace,
    teams: Object.fromEntries(['home', 'away'].map(side => {
      const team = state.teams[side];
      return [side, { controls: structuredClone(team.coachingPlan), basePossessions: team.possessions,
        requestedPossessions: team.possessions * team.coachingPlan.paceMultiplier,
        baseOffensiveReboundChance: team.baseOffensiveReboundChance, appliedOffensiveReboundChance: team.offensiveReboundChance,
        playerShotMix: team.roster.map(row => ({ canonicalName: row.player.canonicalName,
          baseThreeAttemptShare: row.baseThreeAttemptShare, appliedThreeAttemptShare: row.threeAttemptShare })) }];
    })),
    unclampedMeanRequestedPossessions: (homeTeam.possessions * homeTeam.coachingPlan.paceMultiplier + awayTeam.possessions * awayTeam.coachingPlan.paceMultiplier) / 2,
    possessionBudgetBounds: [80, 120],
    disclosure: productionContext
      ? 'Explicit coaching controls alter the shared possession and shot/rebound budgets. Player means set a neutral possession conversion; actual opponent defense, blocks, steals and rebounds still affect outcomes. On-court rates determine shared opportunities. These mappings are development assumptions, not selected causal effects.'
      : 'Explicit scenario controls change opportunity counts and shot/rebound choices, not player skill or shooting efficiency. Multipliers are heuristic, not learned causal effects. Pace is shared and bounded; rebound probabilities keep existing bounds. Baseline turnover/block chances stay per-possession, so event opportunities change with tempo. The pregame score prediction remains the unchanged baseline.' };
  const periodLengths = [720, 720, 720, 720];
  let nextOffense = 'home';
  let possessionId = 1;

  const runPeriod = function* (periodNumber, periodSeconds, possessionsPerTeam) {
    const safePossessions = Math.max(1, Math.floor(possessionsPerTeam));
    const totalTurns = safePossessions * 2;
    const secondsPerTurn = periodSeconds / totalTurns;
    const period = periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`;
    state.possessionSeconds = secondsPerTurn;
    state.possessionElapsed = 0;
    state.clockStart = periodSeconds;
    if (!state.currentLineups) state.currentLineups = {
      home: selectLineup(state, 'home', period), away: selectLineup(state, 'away', period) };
    else yield* changeLineups(state, { period, clock: clockText(periodSeconds), possessionId,
      opportunity: 'period-start' });
    let secondsPlayed = 0;
    for (let turn = 0; turn < totalTurns; turn += 1) {
      const offense = nextOffense;
      const defense = offense === 'home' ? 'away' : 'home';
      nextOffense = defense;
      const lineups = state.currentLineups;
      state.possessionSeconds = secondsPerTurn;
      state.possessionElapsed = 0;
      const clockStart = periodSeconds - secondsPlayed;
      state.clockStart = clockStart;
      if (state.timeoutState) {
        const budget = currentMinuteBudget(state, offense, period);
        if (budget.status !== 'pass') throw Object.assign(new Error('Live minute capacity requires review before the next possession.'), { minuteReview: budget });
        const current = lineups[offense].map(row => row.player.playerRef);
        if (budget.playerRefs.some(ref => !current.includes(ref))) {
          yield* emitChargedTimeout(state, { side: offense, period, clockSeconds: clockStart,
            possessionId, ballDead: state.ballDeadAtPossessionEnd === true,
            possessionSide: offense, cause: 'hard-minute-limit' });
          yield* changeLineups(state, { period, clock: clockText(clockStart), possessionId, opportunity: 'team-timeout' });
        }
        const defensiveBudget = currentMinuteBudget(state, defense, period, 0);
        const currentDefense = lineups[defense].map(row => row.player.playerRef);
        if (defensiveBudget.status !== 'pass' || defensiveBudget.playerRefs.some(ref => !currentDefense.includes(ref))) {
          throw Object.assign(new Error('Defensive minute capacity has no legal substitution opportunity before this possession.'), { minuteReview: defensiveBudget });
        }
      }
      state.possessions[offense] += 1;
      yield* playPossession(state, offense, defense, lineups, {
        period: periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`,
        clockStart, possessionSeconds: secondsPerTurn, possessionId,
      }, random, multipliers[offense]);
      advancePossessionMinutes(state, lineups, secondsPerTurn);
      const endEvent = {
        eventId: state.nextEventId++, possessionId, period,
        clock: clockText(clockStart - secondsPerTurn),
        offenseTeam: state.teams[offense].teamCode, defenseTeam: state.teams[defense].teamCode,
        type: 'possession_end', score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined,
      };
      state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
      yield endEvent;
      const due = state.timeoutState && dueNbaMandatoryTimeout({ state: state.timeoutState, period,
        clockSeconds: Math.max(0, clockStart - secondsPerTurn), ballDead: state.ballDeadAtPossessionEnd });
      if (due?.status === 'requires-review') throw Object.assign(new Error('Mandatory timeout state requires review.'), { timeoutReview: due });
      if (due) {
        yield* emitChargedTimeout(state, { ...due, period, clockSeconds: Math.max(0, clockStart - secondsPerTurn),
          possessionId, ballDead: true });
        yield* changeLineups(state, { period, clock: endEvent.clock, possessionId, opportunity: 'mandatory-timeout' });
      }
      secondsPlayed += secondsPerTurn;
      possessionId += 1;
    }
    const endEvent = {
      eventId: state.nextEventId++, possessionId: null,
      period: periodNumber <= 4 ? `Q${periodNumber}` : `OT${periodNumber - 4}`,
      clock: '0:00', offenseTeam: null, defenseTeam: null, type: 'period_end',
      score: scoreOf(state), boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined,
    };
    state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
    yield endEvent;
  };

  for (let index = 0; index < periodLengths.length; index += 1) {
    const base = Math.floor(regulationPace / 4);
    const extra = index < regulationPace % 4 ? 1 : 0;
    yield* runPeriod(index + 1, periodLengths[index], base + extra);
  }
  let overtime = 0;
  while (state.score.home === state.score.away && overtime < maxOT) {
    overtime += 1;
    state.overtimePeriods = overtime;
    const otPossessions = Math.max(4, Math.round(regulationPace * 5 / 48));
    yield* runPeriod(4 + overtime, 300, otPossessions);
  }
  if (state.score.home === state.score.away) {
    throw new Error(`The live simulator remained tied after ${maxOT} overtime periods.`);
  }
  const summary = finalSummary(state, prediction, options);
  const endEvent = {
    eventId: state.nextEventId++, possessionId: null, period: 'FINAL', clock: '0:00',
    offenseTeam: null, defenseTeam: null, type: 'game_end', score: scoreOf(state),
    boxScore: state.includeBoxScoreSnapshots ? snapshot(state) : undefined, summary,
  };
  state.eventIndex.set(endEvent.eventId, { type: endEvent.type });
  yield endEvent;
  return summary;
}

export function* simulateGameLiveEvents(model, input, options = {}) {
  yield* liveEvents(model, input, options);
}

export async function* streamGameLive(model, input, options = {}) {
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 0));
  const iterator = liveEvents(model, input, { ...options, streamMode: 'incremental-event-stream' });
  for (;;) {
    const step = iterator.next();
    if (step.done) return step.value;
    yield step.value;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

export function simulateGameLive(model, input, options = {}) {
  const iterator = liveEvents(model, input, options);
  const events = [];
  for (;;) {
    const step = iterator.next();
    if (step.done) return { ...step.value, events };
    events.push(step.value);
  }
}

/** Adapt one generated possession-game result to the regular-season game-sample contract. */
export function simulateGameLiveSeasonSample(model, input, options = {}) {
  // Season accounting consumes the same transitions and compact causal checks,
  // without allocating or retaining each public live box snapshot/event array.
  const iterator = liveEvents(model, input, options, true);
  let game, liveEventCount = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) { game = step.value; break; }
    liveEventCount += 1;
  }
  const sample = {
    homeScore: game.score.home,
    awayScore: game.score.away,
    margin: game.score.home - game.score.away,
    total: game.score.home + game.score.away,
    overtimePeriods: game.overtimePeriods,
    possessionsPerTeam: game.possessionsPerTeam,
    homeBox: game.homePlayerBoxes,
    awayBox: game.awayPlayerBoxes,
    homeTeamStats: game.homeTeamStats,
    awayTeamStats: game.awayTeamStats,
    boxScoreConsistency: game.boxScoreConsistency,
  };
  return {
    modelId: game.modelId,
    modelVersion: game.modelVersion,
    status: game.status,
    prediction: game.pregamePrediction,
    sampleCount: 1,
    simulatedHomeWinRate: sample.margin > 0 ? 1 : sample.margin < 0 ? 0 : 0.5,
    simulations: [sample],
    liveEventCount,
    coachingDiagnostics: game.simulationDiagnostics.coaching,
    minuteLimitDiagnostics: game.simulationDiagnostics.minuteLimitTimeouts,
    timeoutRuleContext: game.simulationDiagnostics.timeoutRuleContext,
    rotationDiagnostics: game.simulationDiagnostics.rotations,
    reboundOwnershipDiagnostics: game.simulationDiagnostics.reboundOwnership,
    ...(game.simulationDiagnostics.ordinaryFouls ? { ordinaryFoulDiagnostics: game.simulationDiagnostics.ordinaryFouls } : {}),
    ...(game.simulationDiagnostics.sharedPlayerProduction
      ? { sharedPlayerProductionDiagnostics: game.simulationDiagnostics.sharedPlayerProduction } : {}),
    eventSequenceIncluded: false,
    boxScoreConsistency: game.boxScoreConsistency,
    disclosure: 'One generated player-driven possession game adapted for season-state accounting. It remains an experimental candidate, not a calibrated or selected replacement; use streamGameLive() to present the event sequence.',
  };
}

Object.defineProperty(simulateGameLiveSeasonSample, 'supportedScenarioControls', {
  value: Object.freeze(['djhc-franchise-coaching-v1']), enumerable: true,
});

/** Bind a read-only candidate copy to the existing season simulator callback.
 * Accepted roster/rotation preparation happens upstream for each game. */
export function createSharedProductionGameSimulator(candidate) {
  if (candidate?.format !== 'djhc-shared-player-production-candidate-v1' ||
      candidate.version !== '1.0.0-development' ||
      candidate.status !== 'isolated-development-candidate; joint-game-selection-pending') {
    throw new Error('A supported isolated player-production candidate is required.');
  }
  const snapshot = structuredClone(candidate);
  const simulate = (model, input, options = {}) => simulateGameLiveSeasonSample(model, input,
    { ...options, playerProductionCandidate: snapshot });
  Object.defineProperty(simulate, 'supportedScenarioControls', {
    value: simulateGameLiveSeasonSample.supportedScenarioControls, enumerable: true,
  });
  Object.defineProperty(simulate, 'playerProductionCandidateInfo', {
    value: Object.freeze({ modelId: snapshot.modelId, status: snapshot.status }), enumerable: true,
  });
  return simulate;
}

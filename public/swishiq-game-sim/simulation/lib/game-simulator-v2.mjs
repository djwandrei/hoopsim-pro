import { predictRidge } from './ridge-regression.mjs';
import { resolveSeasonAge, resolveSeasonAgeByName } from './season-age-transition-v1.mjs';
import { summarizeProjectedRosterRatings } from './game-feature-blocks-v1.mjs';

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
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

function sampleParametricScoreResidual(distribution, random) {
  const u1 = Math.max(1e-12, random());
  const u2 = random();
  const radius = Math.sqrt(-2 * Math.log(u1));
  const angle = 2 * Math.PI * u2;
  const zMargin = radius * Math.cos(angle);
  const zIndependentTotal = radius * Math.sin(angle);
  const marginSd = Math.max(0, Number(distribution.marginResidualSd) || 0);
  const totalSd = Math.max(0, Number(distribution.totalResidualSd) || 0);
  const correlation = clamp(Number(distribution.marginTotalCorrelation) || 0, -0.995, 0.995);
  const zTotal = (correlation * zMargin) +
    (Math.sqrt(Math.max(0, 1 - (correlation * correlation))) * zIndependentTotal);
  return {
    margin: Number(distribution.marginResidualMean ?? 0) + (marginSd * zMargin),
    total: Number(distribution.totalResidualMean ?? 0) + (totalSd * zTotal),
  };
}

function parametricProbabilitySeed(prediction, distribution) {
  const marginPart = Math.round((prediction.expectedHomeMargin + 1000) * 1000);
  const totalPart = Math.round((prediction.expectedTotalPoints + 1000) * 1000);
  return (Number(distribution.probabilitySeed ?? 0x51f15e) ^ marginPart ^
    (totalPart << 1)) >>> 0;
}

function finiteInputNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function teamRatingInputs(team = {}) {
  const roster = summarizeProjectedRosterRatings(team.players, {
    includeUnprovenancedScenarioRatings: true,
  });
  const choose = (teamFields, rosterSummary, fallback) => {
    for (const field of teamFields) {
      const value = finiteInputNumber(team[field]);
      if (value !== null) return { value, source: `team.${field}`, playerCount: 0, minuteCoverage: null };
    }
    if (Number.isFinite(rosterSummary?.value)) {
      return {
        value: rosterSummary.value,
        source: rosterSummary.scenarioPlayerCount
          ? 'minute-weighted-roster-including-scenario-inputs'
          : 'minute-weighted-resolved-roster',
        playerCount: rosterSummary.playerCount,
        minuteCoverage: rosterSummary.minuteCoverage,
        scenarioPlayerCount: rosterSummary.scenarioPlayerCount,
        unprovenancedPlayerCount: rosterSummary.unprovenancedPlayerCount,
      };
    }
    return { value: fallback, source: 'neutral-default', playerCount: 0, minuteCoverage: 0 };
  };
  const overallRating = choose(['overallRating'], roster.overallRating, 75);
  const attackRating = choose(['attackRating', 'offenseRating'], roster.attackRating, 50);
  const defenseRating = choose(['defenseRating'], roster.defenseRating, 50);
  return {
    overallRating,
    attackRating,
    defenseRating,
    diagnostics: { overallRating, attackRating, defenseRating },
  };
}

function createFeatures(input, model, teamRatings = null) {
  const home = input.home ?? {};
  const away = input.away ?? {};
  const resolvedHomeRatings = teamRatings?.home ?? teamRatingInputs(home);
  const resolvedAwayRatings = teamRatings?.away ?? teamRatingInputs(away);
  const homePlayerProduction = projectedTeamPlayerPoints(home);
  const awayPlayerProduction = projectedTeamPlayerPoints(away);
  const features = {
    homeCourt: Number.isFinite(input.homeCourt) ? input.homeCourt : 1,
    recentMarginDiff: (home.recentMargin ?? 0) - (away.recentMargin ?? 0),
    scoringDiff: (home.recentPointsFor ?? 110) - (away.recentPointsFor ?? 110),
    defenseDiff: (away.recentPointsAgainst ?? 110) - (home.recentPointsAgainst ?? 110),
    restDiff: (home.restDays ?? 3) - (away.restDays ?? 3),
    teamFatigueDiff: (home.fatigue ?? 0) - (away.fatigue ?? 0),
    overallRatingDiff: resolvedHomeRatings.overallRating.value - resolvedAwayRatings.overallRating.value,
    offenseDefenseMatchupDiff:
      ((resolvedHomeRatings.attackRating.value - resolvedAwayRatings.defenseRating.value) -
      (resolvedAwayRatings.attackRating.value - resolvedHomeRatings.defenseRating.value)),
    defenseRatingDiff: resolvedHomeRatings.defenseRating.value - resolvedAwayRatings.defenseRating.value,
    playerProductionDiff: homePlayerProduction - awayPlayerProduction,
    playerProductionTotal: homePlayerProduction + awayPlayerProduction,
    chemistryDiff: (home.chemistry ?? 0) - (away.chemistry ?? 0),
    opponentAdjustedStrengthDiff:
      (home.opponentAdjustedStrength ?? 0) - (away.opponentAdjustedStrength ?? 0),
  };
  return { ...features, ...(input.features ?? {}) };
}

export function resolveGameInputSeasonAges(input = {}, model = null) {
  const seasonStartYear = input?.seasonStartYear;
  if (!Number.isInteger(seasonStartYear)) return input;
  const resolveTeam = team => {
    if (!team || !Array.isArray(team.players)) return team ?? {};
    return {
      ...team,
      players: team.players.map(player => {
        const ageState = player.careerStateRow
          ? resolveSeasonAge({
            targetSeasonStartYear: seasonStartYear,
            careerStateRow: player.careerStateRow,
            birthDate: player.birthDate ?? null,
          })
          : model?.seasonAgeAnchorIndex &&
            (player.displayName || player.name || player.playerNameKey)
            ? resolveSeasonAgeByName({
              index: model.seasonAgeAnchorIndex,
              playerName: player.displayName ?? player.name ?? null,
              playerNameKey: player.playerNameKey ?? null,
              targetSeasonStartYear: seasonStartYear,
              birthDate: player.birthDate ?? null,
            })
            : resolveSeasonAge({
              targetSeasonStartYear: seasonStartYear,
              birthDate: player.birthDate ?? null,
            });
        return {
          ...player,
          age: ageState.status === 'available' ? ageState.age : null,
          seasonAgeStatus: ageState.status,
          seasonAgeReferenceDate: ageState.referenceDate,
          seasonAgeSource: ageState.status === 'available' ? ageState.source : null,
          seasonAgeUnavailableReason: ageState.status === 'unavailable' ? ageState.reason : null,
        };
      }),
    };
  };
  return { ...input, home: resolveTeam(input.home), away: resolveTeam(input.away) };
}

function allocateInteger(total, players, weights) {
  if (!players.length) return [];
  const safeWeights = weights.map(value => Math.max(0, Number.isFinite(value) ? value : 0));
  const weightSum = safeWeights.reduce((sum, value) => sum + value, 0);
  const normalized = weightSum > 0 ? safeWeights.map(value => value / weightSum) :
    safeWeights.map(() => 1 / safeWeights.length);
  const exact = normalized.map(value => Math.max(0, total) * value);
  const base = exact.map(Math.floor);
  let remainder = Math.max(0, Math.round(total) - base.reduce((sum, value) => sum + value, 0));
  const order = exact.map((value, index) => ({ index, rest: value - base[index] }))
    .sort((a, b) => b.rest - a.rest);
  for (let index = 0; index < remainder; index += 1) base[order[index % order.length].index] += 1;
  return base;
}

function allocateProjectedMinutes(players) {
  if (!players.length) return [];
  const minutes = players.map(player => Math.max(0, Number(player.projectedMinutes ?? player.minutes ?? 0)));
  const allocated = Array(players.length).fill(0);
  let open = players.map((_, index) => index);
  let remaining = players.length >= 5 ? 240 : Math.min(240, players.length * 48);
  while (open.length && remaining > 1e-8) {
    const weightSum = open.reduce((sum, index) => sum + minutes[index], 0);
    const weightFor = index => weightSum > 0 ? minutes[index] / weightSum : 1 / open.length;
    const capped = open.filter(index => remaining * weightFor(index) > 48);
    if (!capped.length) {
      for (const index of open) allocated[index] = remaining * weightFor(index);
      remaining = 0;
      break;
    }
    for (const index of capped) {
      allocated[index] = 48;
      remaining -= 48;
    }
    open = open.filter(index => !capped.includes(index));
  }
  return allocated;
}

function fatiguePerformanceAdjustment(rateModel, player, options = {}) {
  const controls = rateModel?.runtimeControls?.fatiguePerformance;
  const load = Number(player?.fatigueLoad7);
  if (!controls || controls.mode !== 'bounded-one-sided-performance-candidate') {
    return {
      baseRateMultiplier: 1,
      performancePenalty: 0,
      excessLoadStandardized: null,
      source: 'fitted-workload-only',
    };
  }
  if (options.applyRuntimeFatigueAdjustment === false) {
    return {
      baseRateMultiplier: 1,
      performancePenalty: 0,
      excessLoadStandardized: null,
      source: 'runtime-adjustment-disabled',
    };
  }
  const reference = Number(controls.referenceLoad7 ?? rateModel.regression?.means?.fatigueLoad7);
  const scale = Number(controls.scaleLoad7 ?? rateModel.regression?.scales?.fatigueLoad7);
  if (!Number.isFinite(load) || !Number.isFinite(reference) || !Number.isFinite(scale) || scale <= 0) {
    return {
      baseRateMultiplier: 1,
      performancePenalty: 0,
      excessLoadStandardized: null,
      source: 'runtime-adjustment-missing-load-or-scale',
    };
  }
  const excessLoadStandardized = Math.max(0, (load - reference) / scale);
  const penaltyPerScale = Math.max(0, Number(controls.penaltyPerExcessScale) || 0);
  const maximumPenalty = clamp(Number(controls.maximumPenalty) || 0, 0, 0.5);
  // Use a reciprocal response so an already-heavy workload does not saturate a
  // linear cap and then allow the fitted positive workload term to reverse the
  // intended monotonic fatigue response. The penalty remains bounded and
  // approaches one smoothly as excess load grows.
  const rawPenalty = penaltyPerScale > 0
    ? 1 - (1 / (1 + (excessLoadStandardized * penaltyPerScale)))
    : 0;
  const performancePenalty = clamp(rawPenalty, 0, maximumPenalty);
  return {
    baseRateMultiplier: 1 - performancePenalty,
    performancePenalty,
    excessLoadStandardized,
    source: 'bounded-one-sided-performance-candidate',
    referenceLoad7: reference,
    scaleLoad7: scale,
  };
}

export function predictPlayerScoringRateDetails(model, player, options = {}) {
  const rateModel = model?.playerScoringRateModel;
  if (!rateModel?.regression) {
    const fallbackRate = Math.max(0, Number(player.pointsPer36 ?? 0));
    return {
      rate: fallbackRate,
      baseRate: fallbackRate,
      fatigueAdjustment: { baseRateMultiplier: 1, performancePenalty: 0,
        excessLoadStandardized: null, source: 'no-rate-model' },
      source: 'player-input-fallback',
    };
  }
  const requiredInputs = rateModel.inputRequirements?.requiredFields ?? [];
  const inputAliases = {
    fieldGoalAttemptsPer36: ['fieldGoalAttemptsPer36', 'priorFieldGoalAttemptsPer36'],
    freeThrowAttemptsPer36: ['freeThrowAttemptsPer36', 'priorFreeThrowAttemptsPer36'],
    threePointAttemptsPer36: ['threePointAttemptsPer36', 'priorThreePointAttemptsPer36'],
    twoPointAttemptsPer36: ['twoPointAttemptsPer36', 'priorTwoPointAttemptsPer36'],
  };
  if (requiredInputs.some(field => !(inputAliases[field] ?? [field])
    .some(alias => Number.isFinite(player[alias])))) {
    if (rateModel.fallbackModel?.regression) {
      // Preserve the parent runtime controls when a player lacks the selected
      // model's shot-process inputs and the explicitly pinned fallback is used.
      // Otherwise the fatigue candidate would silently disappear for the most
      // common sparse-roster path.
      const fallbackModel = {
        ...rateModel.fallbackModel,
        ...(rateModel.runtimeControls ? { runtimeControls: rateModel.runtimeControls } : {}),
      };
      const fallback = predictPlayerScoringRateDetails({ playerScoringRateModel: fallbackModel }, player, options);
      return { ...fallback, source: `fallback:${fallback.source}` };
    }
    const fallbackRate = Math.max(0, Number(player.pointsPer36 ?? player.priorPointsPer36 ?? 0));
    return {
      rate: fallbackRate,
      baseRate: fallbackRate,
      fatigueAdjustment: { baseRateMultiplier: 1, performancePenalty: 0,
        excessLoadStandardized: null, source: 'missing-required-inputs' },
      source: 'player-input-fallback-missing-required-inputs',
    };
  }
  const features = {
    priorPointsPer36: Number(player.pointsPer36 ?? player.priorPointsPer36 ?? 0),
    priorPointsTrendPer36: Number(player.pointsTrendPer36 ?? player.priorPointsTrendPer36 ?? 0),
    priorReboundsPer36: Number(player.reboundsPer36 ?? player.priorReboundsPer36 ?? 0),
    priorAssistsPer36: Number(player.assistsPer36 ?? player.priorAssistsPer36 ?? 0),
    priorThreesPer36: Number(player.threesPer36 ?? player.priorThreesPer36 ?? 0),
    priorGames: clamp(Number(player.priorGames ?? 0), 0, 20),
    fatigueLoad7: Number(player.fatigueLoad7 ?? 0),
    fatigueLoad7DeviationFromPriorAppearanceMean: firstFinite(player,
      ['fatigueLoad7DeviationFromPriorAppearanceMean'], 0),
    fatigueWorkloadHistoryCount: clamp(firstFinite(player,
      ['fatigueWorkloadHistoryCount'], 0), 0, 20),
    overallRating: Number(player.overallRating ?? player.rating ?? 75) - 75,
    scoringRating: Number(player.scoringRating ?? 50) - 50,
    shootingRating: Number(player.shootingRating ?? 50) - 50,
    creationRating: Number(player.creationRating ?? 50) - 50,
    defenseRating: Number(player.defenseRating ?? 50) - 50,
    fieldGoalAttemptsPer36: firstFinite(player, ['fieldGoalAttemptsPer36', 'priorFieldGoalAttemptsPer36']),
    freeThrowAttemptsPer36: firstFinite(player, ['freeThrowAttemptsPer36', 'priorFreeThrowAttemptsPer36']),
    threePointAttemptsPer36: firstFinite(player, ['threePointAttemptsPer36', 'priorThreePointAttemptsPer36']),
    twoPointAttemptsPer36: firstFinite(player, ['twoPointAttemptsPer36', 'priorTwoPointAttemptsPer36']),
    effectiveFieldGoalPctAbove050: firstFinite(player, ['effectiveFieldGoalPctAbove050']),
    trueShootingPctAbove055: firstFinite(player, ['trueShootingPctAbove055']),
    threePointPctAbove035: firstFinite(player, ['threePointPctAbove035']),
    freeThrowPctAbove075: firstFinite(player, ['freeThrowPctAbove075']),
    twoPointPctAbove050: firstFinite(player, ['twoPointPctAbove050']),
  };
  const controls = rateModel.runtimeControls?.fatiguePerformance;
  const configuredLoadReference = Number(controls?.referenceLoad7 ?? rateModel.regression.means?.fatigueLoad7);
  const runtimeFatigueEnabled = controls?.mode === 'bounded-one-sided-performance-candidate';
  const observedLoad7 = features.fatigueLoad7;
  if (runtimeFatigueEnabled && Number.isFinite(configuredLoadReference)) {
    // In the historical per-36 regression, workload is a predictor associated
    // with scoring, but it is not an identified causal fatigue effect. Center it
    // at its training reference before applying the separately configured
    // monotonic fatigue adjustment below.
    features.fatigueLoad7 = configuredLoadReference;
  }
  const baseRate = clamp(predictRidge(rateModel.regression, features),
    rateModel.lowerPredictionBoundPer36 ?? 0,
    rateModel.upperPredictionBoundPer36 ?? 48);
  const fatigueAdjustment = fatiguePerformanceAdjustment(rateModel, player, options);
  const rate = clamp(baseRate * fatigueAdjustment.baseRateMultiplier,
    rateModel.lowerPredictionBoundPer36 ?? 0,
    rateModel.upperPredictionBoundPer36 ?? 48);
  return {
    rate,
    baseRate,
    fatigueAdjustment: {
      ...fatigueAdjustment,
      fittedWorkloadCentered: runtimeFatigueEnabled,
      observedLoad7: Number.isFinite(observedLoad7) ? observedLoad7 : null,
    },
    source: 'fitted-player-rate-model',
  };
}

export function predictPlayerScoringRate(model, player, options = {}) {
  return predictPlayerScoringRateDetails(model, player, options).rate;
}

function projectedTeamPlayerPoints(team) {
  if (Number.isFinite(team.expectedPlayerPoints)) return team.expectedPlayerPoints;
  const players = Array.isArray(team.players) ? team.players : [];
  const hasScoringRates = players.some(player => Number.isFinite(player.pointsPer36) ||
    Number.isFinite(player.priorPointsPer36));
  if (!players.length || !hasScoringRates) return 110;
  const minutes = allocateProjectedMinutes(players);
  return players.reduce((sum, player, index) =>
    sum + Math.max(0, Number(player.pointsPer36 ?? player.priorPointsPer36 ?? 0)) * minutes[index] / 36, 0);
}

const boxRateDefinitions = {
  rebounds: { rateFields: ['reboundsPer36', 'priorReboundsPer36'], trendFields: ['reboundsTrendPer36'] },
  assists: { rateFields: ['assistsPer36', 'priorAssistsPer36'], trendFields: ['assistsTrendPer36'] },
  threePointersMade: {
    rateFields: ['threesPer36', 'threePointersMadePer36', 'priorThreesPer36'],
    trendFields: ['threePointersMadeTrendPer36', 'threesTrendPer36'],
  },
  turnovers: { rateFields: ['turnoversPer36', 'priorTurnoversPer36'], trendFields: ['turnoversTrendPer36'] },
  steals: { rateFields: ['stealsPer36', 'priorStealsPer36'], trendFields: ['stealsTrendPer36'] },
  blocks: { rateFields: ['blocksPer36', 'priorBlocksPer36'], trendFields: ['blocksTrendPer36'] },
};

function firstFinite(player, keys, fallback = 0) {
  for (const key of keys) if (Number.isFinite(player[key])) return player[key];
  return fallback;
}

function boxRateFeatures(player, statistic, fatigueControls = null) {
  const definition = boxRateDefinitions[statistic];
  const rateFor = (fields, fallback = 0) => firstFinite(player, fields, fallback);
  const trendByStat = player.rateTrendsPer36?.[statistic];
  const features = {
    priorTargetRate: rateFor(definition.rateFields),
    targetTrendPer36: Number.isFinite(trendByStat) ? trendByStat : rateFor(definition.trendFields),
    priorMinutesPerGame: firstFinite(player,
      ['priorMinutesPerGame', 'minutesPerGame', 'averageMinutes', 'projectedMinutes']),
    priorGames: clamp(firstFinite(player, ['priorGames', 'gamesPlayed']), 0, 20),
    fatigueLoad7: firstFinite(player, ['fatigueLoad7']) ||
      firstFinite(player.fatigue ?? {}, ['load7']),
    priorPointsPer36: rateFor(['pointsPer36', 'priorPointsPer36']),
    priorReboundsPer36: rateFor(['reboundsPer36', 'priorReboundsPer36']),
    priorAssistsPer36: rateFor(['assistsPer36', 'priorAssistsPer36']),
    priorThreesPer36: rateFor(['threesPer36', 'threePointersMadePer36', 'priorThreesPer36']),
    priorTurnoversPer36: rateFor(['turnoversPer36', 'priorTurnoversPer36']),
    overallRating: firstFinite(player, ['overallRating', 'rating'], 75) - 75,
    scoringRating: firstFinite(player, ['scoringRating'], 50) - 50,
    shootingRating: firstFinite(player, ['shootingRating'], 50) - 50,
    creationRating: firstFinite(player, ['creationRating'], 50) - 50,
    reboundingRating: firstFinite(player, ['reboundingRating'], 50) - 50,
    defenseRating: firstFinite(player, ['defenseRating'], 50) - 50,
  };
  const suppliedFeatures = player.boxRateFeatures?.[statistic] ?? {};
  const observedLoad7 = Number.isFinite(suppliedFeatures.fatigueLoad7)
    ? suppliedFeatures.fatigueLoad7 : features.fatigueLoad7;
  const referenceLoad7 = Number(fatigueControls?.referenceLoad7);
  if (fatigueControls?.mode === 'bounded-one-sided-performance-candidate' && Number.isFinite(referenceLoad7)) {
    // Workload is an exposure/opportunity proxy in these per-36 models too.
    // The optional performance candidate prevents the positive/negative
    // observational workload coefficients from acting like causal fatigue
    // effects on every box-score category.
    features.fatigueLoad7 = referenceLoad7;
  }
  const merged = { ...features, ...suppliedFeatures };
  if (fatigueControls?.mode === 'bounded-one-sided-performance-candidate' && Number.isFinite(referenceLoad7)) {
    merged.fatigueLoad7 = referenceLoad7;
  }
  return {
    ...merged,
    ...(Number.isFinite(observedLoad7) ? { observedFatigueLoad7: observedLoad7 } : {}),
  };
}

export function predictPlayerBoxRate(model, player, statistic) {
  const definition = boxRateDefinitions[statistic];
  if (!definition) throw new Error(`Unsupported player box-rate statistic: ${statistic}`);
  const candidate = model?.playerBoxRateModel?.targetStatisticModels?.[statistic];
  const regression = candidate?.regression;
  const fallback = firstFinite(player, definition.rateFields);
  // Require an observed/prior category rate before applying the fitted model;
  // otherwise its learned intercept would be used as if history were present.
  if (!regression || !definition.rateFields.some(key => Number.isFinite(player[key]))) {
    return Math.max(0, fallback);
  }
  return clamp(predictRidge(regression, boxRateFeatures(player, statistic,
    model?.playerScoringRateModel?.runtimeControls?.fatiguePerformance)), 0,
    candidate.upperPredictionBoundPer36 ?? Number.POSITIVE_INFINITY);
}

function poisson(lambda, random) {
  const mean = Math.max(0, lambda);
  if (mean < 30) {
    const limit = Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= random();
    } while (product > limit);
    return Math.max(0, count - 1);
  }
  const u1 = Math.max(1e-12, random());
  const u2 = random();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal));
}

function simulatePlayerBox(model, team, score, random) {
  const players = Array.isArray(team.players) ? team.players : [];
  if (!players.length) return [];
  const normalizedMinutes = allocateProjectedMinutes(players);
  const scoringRates = players.map(player => predictPlayerScoringRate(model, player));
  const boxRates = players.map(player => Object.fromEntries(Object.keys(boxRateDefinitions)
    .map(statistic => [statistic, predictPlayerBoxRate(model, player, statistic)])));
  const scoringWeights = players.map((player, index) => {
    const per36 = Math.max(0.1, scoringRates[index]);
    return normalizedMinutes[index] * per36 / 36;
  });
  const points = allocateInteger(score, players, scoringWeights);
  return players.map((player, index) => {
    const minutesPlayed = normalizedMinutes[index];
    const rate = key => Math.max(0, Number(player[key] ?? 0)) * minutesPlayed / 36;
    return {
      playerRef: player.playerRef ?? null,
      canonicalName: player.canonicalName ?? player.name ?? player.displayName ?? null,
      displayName: player.displayName ?? player.canonicalName ?? player.name ?? null,
      ...(player.seasonAgeStatus ? {
        age: player.age,
        ageStatus: player.seasonAgeStatus,
        ageReferenceDate: player.seasonAgeReferenceDate,
        ageSource: player.seasonAgeSource,
      } : {}),
      // Round for display at the interface; independent row rounding would
      // break the allocated team-minute budget stored in season ledgers.
      minutes: minutesPlayed,
      points: points[index],
      expectedPointsPer36: Math.round(scoringRates[index] * 100) / 100,
      expectedReboundsPer36: Math.round(boxRates[index].rebounds * 100) / 100,
      expectedAssistsPer36: Math.round(boxRates[index].assists * 100) / 100,
      expectedThreePointersMadePer36: Math.round(boxRates[index].threePointersMade * 100) / 100,
      expectedTurnoversPer36: Math.round(boxRates[index].turnovers * 100) / 100,
      expectedStealsPer36: Math.round(boxRates[index].steals * 100) / 100,
      expectedBlocksPer36: Math.round(boxRates[index].blocks * 100) / 100,
      rebounds: poisson(boxRates[index].rebounds * minutesPlayed / 36, random),
      assists: poisson(boxRates[index].assists * minutesPlayed / 36, random),
      threePointersMade: Math.min(
        poisson(boxRates[index].threePointersMade * minutesPlayed / 36, random),
        Math.floor(points[index] / 3)),
      turnovers: poisson(boxRates[index].turnovers * minutesPlayed / 36, random),
      steals: poisson(boxRates[index].steals * minutesPlayed / 36, random),
      blocks: poisson(boxRates[index].blocks * minutesPlayed / 36, random),
    };
  });
}

function capPlayerCountStat(boxes, statistic, maximumTotal) {
  if (!boxes.length) return boxes;
  const counts = boxes.map(row => Math.max(0, Math.floor(Number(row[statistic]) || 0)));
  const total = counts.reduce((sum, value) => sum + value, 0);
  const cap = Math.max(0, Math.floor(Number(maximumTotal) || 0));
  if (total <= cap) return boxes;
  const exact = counts.map(value => value * cap / total);
  const result = exact.map(Math.floor);
  let remaining = cap - result.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - result[index] }))
    .filter(item => result[item.index] < counts[item.index])
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  while (remaining > 0) {
    let advanced = false;
    for (const { index } of order) {
      if (result[index] >= counts[index]) continue;
      result[index] += 1;
      remaining -= 1;
      advanced = true;
      if (remaining === 0) break;
    }
    if (!advanced) throw new Error(`Could not cap ${statistic} to its opponent-supported total.`);
  }
  return boxes.map((row, index) => ({ ...row, [statistic]: result[index] }));
}

function aggregateTeamBox(playerBoxes) {
  const totals = {
    points: 0, rebounds: 0, assists: 0, threePointersMade: 0,
    turnovers: 0, steals: 0, blocks: 0,
  };
  for (const player of playerBoxes) {
    for (const statistic of Object.keys(totals)) totals[statistic] += player[statistic] ?? 0;
  }
  return totals;
}

function scoreFromResidual(prediction, residual) {
  const margin = prediction.expectedHomeMargin + Number(residual.margin ?? 0);
  const total = Math.max(Math.abs(margin), prediction.expectedTotalPoints + Number(residual.total ?? 0));
  const homeScore = Math.round(Math.max(0, (total + margin) / 2));
  const awayScore = Math.round(Math.max(0, (total - margin) / 2));
  return { homeScore, awayScore, margin: homeScore - awayScore, total: homeScore + awayScore };
}

function pairedScoreDistributionProbability(model, prediction) {
  const distribution = model.distribution ?? {};
  if (distribution.method === 'parametric-bivariate-normal-score-residuals-v1') {
    const probabilitySamples = clamp(Math.floor(distribution.probabilitySamples ?? 4096), 512, 16384);
    const random = seededRandom(parametricProbabilitySeed(prediction, distribution));
    let homeWins = 0;
    for (let index = 0; index < probabilitySamples; index += 1) {
      const residual = sampleParametricScoreResidual(distribution, random);
      const score = scoreFromResidual(prediction, residual);
      homeWins += score.margin > 0 ? 1 : score.margin === 0 ? 0.5 : 0;
    }
    return { probability: homeWins / probabilitySamples,
      method: 'parametric-bivariate-normal-monte-carlo', rows: probabilitySamples };
  }
  const residuals = model.distribution?.residualPairs ?? [];
  if (!residuals.length) {
    const marginSd = Math.max(1, model.distribution?.marginResidualSd ?? 12);
    return { probability: normalCdf(prediction.expectedHomeMargin / marginSd), method: 'normal-margin-fallback' };
  }
  const probability = residuals.reduce((sum, residual) => {
    const score = scoreFromResidual(prediction, residual);
    return sum + (score.margin > 0 ? 1 : score.margin === 0 ? 0.5 : 0);
  }, 0) / residuals.length;
  return { probability, method: 'paired-residual-score-distribution', rows: residuals.length };
}

export function predictGame(model, input) {
  if (!model?.marginModel || !model?.totalModel) throw new Error('A trained game-sim v1 model is required.');
  const preparedInput = resolveGameInputSeasonAges(input, model);
  const teamRatings = {
    home: teamRatingInputs(preparedInput.home),
    away: teamRatingInputs(preparedInput.away),
  };
  const features = createFeatures(preparedInput, model, teamRatings);
  const margin = predictRidge(model.marginModel, features);
  const total = predictRidge(model.totalModel, features);
  const probability = pairedScoreDistributionProbability(model, {
    expectedHomeMargin: margin, expectedTotalPoints: total,
  });
  const homeWinProbability = probability.probability;
  return { homeTeam: preparedInput.homeTeam ?? preparedInput.home?.teamCode ?? null,
    awayTeam: preparedInput.awayTeam ?? preparedInput.away?.teamCode ?? null,
    expectedHomeMargin: margin,
    expectedTotalPoints: total,
    expectedHomePoints: (total + margin) / 2,
    expectedAwayPoints: (total - margin) / 2,
    homeWinProbability,
    probabilityMethod: probability.method,
    probabilityDistributionRows: probability.rows ?? 0,
    inputDiagnostics: {
      rosterRatingInputs: { home: teamRatings.home.diagnostics, away: teamRatings.away.diagnostics },
      explicitRatingFeatureOverrides: ['overallRatingDiff', 'offenseDefenseMatchupDiff', 'defenseRatingDiff']
        .filter(field => Object.hasOwn(preparedInput.features ?? {}, field)),
    },
    features };
}

export function simulateGame(model, input, options = {}) {
  const preparedInput = resolveGameInputSeasonAges(input, model);
  const prediction = predictGame(model, preparedInput);
  const random = seededRandom(options.seed ?? 1);
  const sampleCount = clamp(Math.floor(options.sampleCount ?? 1), 1, 10000);
  const residuals = model.distribution?.residualPairs ?? [];
  const simulations = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const residual = model.distribution?.method === 'parametric-bivariate-normal-score-residuals-v1'
      ? sampleParametricScoreResidual(model.distribution, random)
      : residuals.length ? residuals[Math.floor(random() * residuals.length)] : { margin: 0, total: 0 };
    const { homeScore: roundedHome, awayScore: roundedAway } = scoreFromResidual(prediction, residual);
    let homeBox = simulatePlayerBox(model, preparedInput.home ?? {}, roundedHome, random);
    let awayBox = simulatePlayerBox(model, preparedInput.away ?? {}, roundedAway, random);
    const homeTurnovers = awayBox.reduce((sum, row) => sum + row.turnovers, 0);
    const awayTurnovers = homeBox.reduce((sum, row) => sum + row.turnovers, 0);
    homeBox = capPlayerCountStat(homeBox, 'steals', homeTurnovers);
    awayBox = capPlayerCountStat(awayBox, 'steals', awayTurnovers);
    simulations.push({
      homeScore: roundedHome,
      awayScore: roundedAway,
      margin: roundedHome - roundedAway,
      total: roundedHome + roundedAway,
      homeBox,
      awayBox,
      homeTeamStats: aggregateTeamBox(homeBox),
      awayTeamStats: aggregateTeamBox(awayBox),
    });
  }
  const homeWins = simulations.reduce((sum, row) => sum + (row.margin > 0 ? 1 : row.margin === 0 ? 0.5 : 0), 0);
  return { modelId: model.modelId, modelVersion: model.version, status: model.status,
    prediction, sampleCount, simulatedHomeWinRate: homeWins / sampleCount, simulations };
}

function maximumEntropyPossessionProbabilities(expectedPointsPerPossession) {
  const target = clamp(Number(expectedPointsPerPossession) || 0, 0, 3);
  let lower = -32;
  let upper = 32;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const beta = (lower + upper) / 2;
    const weights = [0, 1, 2, 3].map(points => Math.exp(beta * points));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const mean = weights.reduce((sum, value, points) => sum + (points * value), 0) / total;
    if (mean < target) lower = beta;
    else upper = beta;
  }
  const weights = [0, 1, 2, 3].map(points => Math.exp(((lower + upper) / 2) * points));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / total);
}

function samplePossessionPoints(expectedPoints, possessions, random) {
  const probabilities = maximumEntropyPossessionProbabilities(expectedPoints / possessions);
  const points = Array.from({ length: possessions }, () => {
    const value = random();
    if (value < probabilities[0]) return 0;
    if (value < probabilities[0] + probabilities[1]) return 1;
    if (value < probabilities[0] + probabilities[1] + probabilities[2]) return 2;
    return 3;
  });
  let delta = expectedPoints - points.reduce((sum, value) => sum + value, 0);
  const order = points.map((_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  let cursor = 0;
  let stalled = 0;
  while (delta !== 0) {
    const index = order[cursor % order.length];
    cursor += 1;
    if (delta > 0 && points[index] < 3) {
      points[index] += 1;
      delta -= 1;
      stalled = 0;
    } else if (delta < 0 && points[index] > 0) {
      points[index] -= 1;
      delta += 1;
      stalled = 0;
    } else {
      stalled += 1;
      if (stalled >= order.length && Math.abs(delta) > 0) {
        throw new Error('A native score sample cannot be reconciled to the requested reconstructed possession count.');
      }
    }
  }
  return points;
}

function replayClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function replayWinProbability({ margin, expectedMargin, remainingFraction, marginSd, final = false }) {
  if (final) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const predictedFinalMargin = margin + (expectedMargin * remainingFraction);
  const remainingSd = Math.max(0.05, marginSd * Math.sqrt(Math.max(remainingFraction, 0.0001)));
  return clamp(normalCdf(predictedFinalMargin / remainingSd), 0, 1);
}

function possessionText(teamLabel, points) {
  if (points === 0) return `Reconstructed ${teamLabel} possession ends without scoring.`;
  if (points === 1) return `Reconstructed ${teamLabel} possession scores 1 point.`;
  return `Reconstructed ${teamLabel} possession scores ${points} points.`;
}

function reconstructedReplay(model, prediction, sample, options) {
  const requestedPossessions = clamp(Math.floor(Number(options.possessions) || 100), 60, 140);
  const possessions = Math.max(requestedPossessions,
    Math.ceil(Math.max(sample.homeScore, sample.awayScore) / 3));
  const seed = (Number(options.seed) >>> 0) || 1;
  const random = seededRandom(seed ^ 0xa511e9b3);
  const homePoints = samplePossessionPoints(sample.homeScore, possessions, random);
  const awayPoints = samplePossessionPoints(sample.awayScore, possessions, random);
  const homeLabel = String(options.homeLabel || 'home team');
  const awayLabel = String(options.awayLabel || 'away team');
  const marginSd = Math.max(1, Number(model.distribution?.marginResidualSd) || 12);
  const events = [];
  const timeline = [];
  let homeScore = 0;
  let awayScore = 0;
  let possessionIndex = 0;

  for (let quarterIndex = 0; quarterIndex < 4; quarterIndex += 1) {
    const start = Math.round(quarterIndex * possessions / 4);
    const end = Math.round((quarterIndex + 1) * possessions / 4);
    const quarterPossessions = Math.max(1, end - start);
    const quarter = `Q${quarterIndex + 1}`;
    for (let index = start; index < end; index += 1) {
      const elapsedInQuarter = index - start + 1;
      const clock = replayClock(12 * 60 * (1 - (elapsedInQuarter / quarterPossessions)));
      homeScore += homePoints[index];
      const homeMargin = homeScore - awayScore;
      const afterHomeFraction = (possessionIndex + 0.5) / possessions;
      events.push({
        q: quarter,
        clock,
        side: 'home',
        pts: homePoints[index],
        score: [homeScore, awayScore],
        type: 'play',
        text: possessionText(homeLabel, homePoints[index]),
        homeWinProbability: replayWinProbability({ margin: homeMargin,
          expectedMargin: prediction.expectedHomeMargin,
          remainingFraction: 1 - afterHomeFraction, marginSd }),
      });
      awayScore += awayPoints[index];
      const margin = homeScore - awayScore;
      const elapsedFraction = (possessionIndex + 1) / possessions;
      events.push({
        q: quarter,
        clock,
        side: 'away',
        pts: awayPoints[index],
        score: [homeScore, awayScore],
        type: 'play',
        text: possessionText(awayLabel, awayPoints[index]),
        homeWinProbability: replayWinProbability({ margin,
          expectedMargin: prediction.expectedHomeMargin,
          remainingFraction: 1 - elapsedFraction, marginSd }),
      });
      possessionIndex += 1;
    }
    timeline.push({ period: quarter, a: homeScore, b: awayScore });
    events.push({
      q: quarter,
      clock: '0:00',
      side: null,
      pts: 0,
      score: [homeScore, awayScore],
      type: 'period',
      text: `End of ${quarter} · reconstructed score ${homeScore}–${awayScore}.`,
      homeWinProbability: replayWinProbability({ margin: homeScore - awayScore,
        expectedMargin: prediction.expectedHomeMargin,
        remainingFraction: 1 - ((quarterIndex + 1) / 4), marginSd }),
    });
  }

  if (homeScore !== sample.homeScore || awayScore !== sample.awayScore) {
    throw new Error('The reconstructed replay score does not match its native model sample.');
  }
  const margin = homeScore - awayScore;
  events.push({
    q: 'Q4',
    clock: 'FINAL',
    side: null,
    pts: 0,
    score: [homeScore, awayScore],
    type: 'final',
    text: margin === 0 ? 'Native model sample ended tied; this candidate does not simulate overtime.' : 'Native model score sample complete.',
    homeWinProbability: replayWinProbability({ margin, final: true }),
  });

  return {
    events,
    timeline,
    requestedPossessions,
    possessions,
    pregameHomeWinProbability: prediction.homeWinProbability,
    probabilityMethod: 'illustrative-gaussian-remaining-game-v1',
    disclosure: 'This is a local replay of a development-candidate DJHC model sample, not a live or observed game. The native model samples an end-game score; the possession sequence is reconstructed to reconcile exactly to that sampled score. Possession outcomes are synthetic and have no player attribution.',
    probabilityDisclosure: 'Win probability is an illustrative in-game estimate using the candidate model’s full-game margin mean and residual spread over the remaining clock. It has not been calibrated against in-game states.',
  };
}

export function simulateGameReplay(model, input, options = {}) {
  const sampleCount = clamp(Math.floor(options.sampleCount ?? 200), 1, 10000);
  const seed = (Number(options.seed) >>> 0) || 1;
  const result = simulateGame(model, input, { ...options, seed, sampleCount });
  const sample = result.simulations[0];
  if (!sample) throw new Error('The DJHC native model did not return a score sample for the replay.');
  const replay = reconstructedReplay(model, result.prediction, sample, {
    ...options,
    seed,
    homeLabel: input.homeTeam ?? input.home?.teamCode,
    awayLabel: input.awayTeam ?? input.away?.teamCode,
  });
  const game = {
    a: sample.homeScore,
    b: sample.awayScore,
    margin: sample.margin,
    winner: sample.margin > 0 ? 'a' : sample.margin < 0 ? 'b' : 'unresolved',
    resolutionStatus: sample.margin === 0 ? 'unresolved' : 'decided',
    timeline: replay.timeline,
    pbp: replay.events,
    replay: {
      kind: 'djhc-native-score-reconstruction-v1',
      observed: false,
      sampledEventLevelOutcomes: false,
      playerAttribution: 'unavailable',
      probabilityMethod: replay.probabilityMethod,
      pregameHomeWinProbability: replay.pregameHomeWinProbability,
      probabilityDisclosure: replay.probabilityDisclosure,
      disclosure: replay.disclosure,
    },
  };
  return { ...result, example: { winner: game.winner, resolutionStatus: game.resolutionStatus, games: [game] }, replay };
}

export function inspectRatingSensitivity(model, input, ratingPoints = 5) {
  const base = predictGame(model, input);
  const features = createFeatures(input, model);
  const adjustedFeatures = { ...features, overallRatingDiff: (features.overallRatingDiff ?? 0) + ratingPoints };
  const adjusted = predictGame(model, { features: adjustedFeatures,
    homeTeam: input.homeTeam, awayTeam: input.awayTeam });
  return { ratingPoints, baseExpectedHomeMargin: base.expectedHomeMargin,
    adjustedExpectedHomeMargin: adjusted.expectedHomeMargin,
    predictedMarginChange: adjusted.expectedHomeMargin - base.expectedHomeMargin };
}

import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';
import { predictSharedPlayerProduction } from './shared-player-production-v1.mjs';
import { validatePriorShotEfficiency } from './prior-shot-efficiency-v1.mjs';

export const SHARED_PRODUCTION_GAME_PROFILE_FORMAT = 'djhc-shared-production-game-profile-v1';
// A numerical/support gate for this development mapping, not an NBA rule.
export const SHARED_PRODUCTION_MAX_ATTEMPTS_PER36 = 120;

function review(reason) {
  throw Object.assign(new Error(`Shared player production requires review: ${reason}`), {
    productionReview: { status: 'requires-review', reason },
  });
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Explicit profiles remain prior/scenario inputs. This boundary does not
 * manufacture histories, participation labels, or unseen target boxes. */
export function forecastGamePlayerProduction(candidate, player, {
  projectedMinutes, seasonStartYear, gameLocalDate = null,
} = {}) {
  const profile = player?.sharedProductionFeatures;
  if (profile?.format !== SHARED_PRODUCTION_GAME_PROFILE_FORMAT) review('missing-or-unsupported-player-profile');
  const playerName = normalizeCanonicalPlayerName(player.canonicalName ?? player.displayName ?? player.name);
  if (!playerName || normalizeCanonicalPlayerName(profile.canonicalName) !== playerName) review('profile-player-name-mismatch');
  if (!Number.isInteger(seasonStartYear) || profile.seasonStartYear !== seasonStartYear) review('profile-season-mismatch');
  if (!['explicit-scenario', 'prior-history'].includes(profile.evidence?.kind) ||
      typeof profile.evidence.source !== 'string' || !profile.evidence.source.trim()) review('unresolved-profile-evidence');
  if (profile.evidence.kind === 'prior-history' &&
      (!validDate(gameLocalDate) || !validDate(profile.evidence.cutoffLocalDate) ||
       profile.evidence.cutoffLocalDate >= gameLocalDate)) review('prior-profile-cutoff-must-precede-game-date');
  if (gameLocalDate !== null && (!validDate(gameLocalDate) ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(gameLocalDate.slice(0, 4))))) review('game-date-season-mismatch');
  if (profile.evidence.kind === 'prior-history' && candidate.trainingSeasons.some(year => year >= seasonStartYear)) review('candidate-training-overlaps-prior-history-simulation-season');
  // Only feature namespaces cross this boundary; target boxes/counts are ignored.
  const features = Object.fromEntries(['minutesFeatures', 'pointsFeatures', 'boxCommonFeatures', 'boxRateFeatures',
    'candidateRateFeatures'].map(key => [key, profile[key]]));
  const forecast = predictSharedPlayerProduction(candidate, features, { projectedMinutes });
  return { ...forecast, canonicalName: playerName, seasonStartYear, gameLocalDate,
    evidence: structuredClone(profile.evidence),
    boundary: { ...forecast.boundary, exactNameAndSeasonBound: true,
      priorCutoffChecked: profile.evidence.kind === 'prior-history',
      modelTrainingPrecedesSimulationSeason: candidate.trainingSeasons.every(year => year < seasonStartYear),
      featureLineageIndependentlyVerified: false } };
}

function rate(player, features, names, featureName, fallback, allowPlayerInputs) {
  for (const name of allowPlayerInputs ? names : []) {
    if (!Object.hasOwn(player, name) || player[name] === null || player[name] === undefined) continue;
    if (!Number.isFinite(player[name]) || player[name] < 0) review(`invalid-shot-input-${name}`);
    return { value: player[name], source: `player.${name}` };
  }
  if (Object.hasOwn(features, featureName)) {
    if (!Number.isFinite(features[featureName]) || features[featureName] < 0) review(`invalid-shot-feature-${featureName}`);
    return { value: features[featureName], source: `profile.pointsFeatures.${featureName}` };
  }
  return { value: fallback, source: 'generated-shot-process-prior' };
}

function pct(player, features, names, centeredFeature, center, fallback, allowPlayerInputs) {
  for (const name of allowPlayerInputs ? names : []) {
    if (!Object.hasOwn(player, name) || player[name] === null || player[name] === undefined) continue;
    const value = player[name];
    if (!Number.isFinite(value) || value < 0 || value > 100) review(`invalid-shooting-percentage-${name}`);
    return { value: value > 1 ? value / 100 : value, source: `player.${name}` };
  }
  if (Object.hasOwn(features, centeredFeature)) {
    const value = features[centeredFeature] + center;
    if (!Number.isFinite(features[centeredFeature]) || !Number.isFinite(value) || value < -1e-12 || value > 1 + 1e-12) review(`invalid-shooting-feature-${centeredFeature}`);
    return { value: Math.max(0, Math.min(1, value)), source: `profile.pointsFeatures.${centeredFeature}` };
  }
  return { value: fallback, source: 'generated-shot-process-prior' };
}

/** Reconcile mean shot components before they become event weights. These
 * projected attempts are assumptions, not a selected empirical usage model.
 * Event opportunities constrain the eventual sampled counts separately. */
export function projectSharedProductionShotRates(forecast, player) {
  const points = forecast.statistics.points.ratePer36;
  const requestedThrees = forecast.statistics.threePointersMade.ratePer36;
  const features = player.sharedProductionFeatures?.pointsFeatures ?? {};
  // Unbound raw supplements cannot enter a prior-only history run. Explicit
  // scenarios may supply them, and remain visibly scenarios rather than facts.
  const allowPlayerInputs = forecast.evidence?.kind === 'explicit-scenario';
  let threePct = pct(player, features, ['threePointPercentage', 'threePointPct', 'threePPercentage'], 'threePointPctAbove035', 0.35, 0.36, allowPlayerInputs);
  let twoPct = pct(player, features, ['twoPointPercentage', 'twoPointPct'], 'twoPointPctAbove050', 0.5, 0.52, allowPlayerInputs);
  let ftPct = pct(player, features, ['freeThrowPercentage', 'freeThrowPct'], 'freeThrowPctAbove075', 0.75, 0.78, allowPlayerInputs);
  const shotEstimate = player.sharedProductionFeatures?.shotEfficiency;
  if (shotEstimate !== undefined) {
    if (allowPlayerInputs) review('prior-shooting-estimate-cannot-override-explicit-player-scenario');
    try { validatePriorShotEfficiency(shotEstimate, { canonicalName: forecast.canonicalName,
      seasonStartYear: forecast.seasonStartYear, gameLocalDate: forecast.gameLocalDate }); }
    catch (error) { review(`invalid-prior-shooting-estimate:${error.message}`); }
    threePct = { value: shotEstimate.rates.threePointPct, source: 'prior-shot-counts-and-prior-league-shrinkage-v1' };
    twoPct = { value: shotEstimate.rates.twoPointPct, source: 'prior-shot-counts-and-prior-league-shrinkage-v1' };
    ftPct = { value: shotEstimate.rates.freeThrowPct, source: 'prior-shot-counts-and-prior-league-shrinkage-v1' };
  }
  const requestedFta = rate(player, features, ['freeThrowAttemptsPer36', 'freeThrowsAttemptedPer36'], 'freeThrowAttemptsPer36', points * 0.18, allowPlayerInputs);
  const threes = threePct.value > 0 ? Math.min(requestedThrees, points / 3) : 0;
  const remainingPoints = Math.max(0, points - 3 * threes);
  const freeThrowsMade = Math.min(requestedFta.value * ftPct.value, remainingPoints);
  const twoMakes = Math.max(0, remainingPoints - freeThrowsMade) / 2;
  if (twoMakes > 0 && twoPct.value === 0) review('positive-two-point-production-with-zero-shooting-efficiency');
  const threeAttempts = threePct.value > 0 ? threes / threePct.value : 0;
  const twoAttempts = twoPct.value > 0 ? twoMakes / twoPct.value : 0;
  const freeThrowAttempts = ftPct.value > 0 ? freeThrowsMade / ftPct.value : 0;
  const fieldGoalAttempts = threeAttempts + twoAttempts;
  const projected = { pointsPer36: points, threesPer36: threes,
    threesAttPer36: threeAttempts, twoPointAttPer36: twoAttempts, fgaPer36: fieldGoalAttempts,
    ftAttPer36: freeThrowAttempts, freeThrowsMadePer36: freeThrowsMade,
    threePointPct: threePct.value, twoPointPct: twoPct.value, freeThrowPct: ftPct.value,
    threeAttemptShare: fieldGoalAttempts > 0 ? threeAttempts / fieldGoalAttempts : 0 };
  if (Object.values(projected).some(value => !Number.isFinite(value) || value < 0)) review('nonfinite-projected-shot-process');
  if ([fieldGoalAttempts, freeThrowAttempts].some(value => value > SHARED_PRODUCTION_MAX_ATTEMPTS_PER36)) review('projected-shot-rate-outside-development-support');
  return { ...projected, diagnostics: {
    method: 'points-threes-and-efficiency-constrained-mean-shot-projection',
    requestedThreesPer36: requestedThrees, appliedThreesPer36: threes,
    threesAdjusted: threes !== requestedThrees,
    rawPlayerShotSupplementsUsed: allowPlayerInputs,
    maximumAttemptsPer36: SHARED_PRODUCTION_MAX_ATTEMPTS_PER36,
    priorShotEfficiency: shotEstimate === undefined ? null : structuredClone(shotEstimate),
    requestedFreeThrowAttemptsPer36: requestedFta.value, appliedFreeThrowAttemptsPer36: freeThrowAttempts,
    source: { threePointPct: threePct.source, twoPointPct: twoPct.source,
      freeThrowPct: ftPct.source, freeThrowAttempts: requestedFta.source },
    meanPointIdentity: 3 * threes + 2 * twoMakes + freeThrowsMade,
    empiricallySelected: false,
    disclosure: 'Mean shot volumes are projected from fitted production and supplied/prior efficiency. Shared possession, foul and conversion events determine realized counts; the fitted means are not guaranteed sampled box totals.',
  } };
}

/** On-court rates share one finite opportunity budget. A zero rate is valid;
 * probabilities never invent a positive floor for the new candidate path. */
export function sharedLineupOpportunityProbabilities(offense, defense, possessions) {
  if (!Number.isFinite(possessions) || possessions <= 0) review('invalid-possession-budget');
  if (!Array.isArray(offense) || !Array.isArray(defense) || offense.length !== 5 || defense.length !== 5) review('opportunity-budget-requires-five-player-lineups');
  for (const row of offense) {
    if (['fgaPer36', 'threesAttPer36', 'twoPointAttPer36', 'ftAttPer36'].some(key => !Number.isFinite(row[key]) || row[key] < 0 ||
        row[key] > SHARED_PRODUCTION_MAX_ATTEMPTS_PER36) ||
        ['threePointPct', 'twoPointPct'].some(key => !Number.isFinite(row[key]) || row[key] < 0 || row[key] > 1) ||
        Math.abs(row.fgaPer36 - row.threesAttPer36 - row.twoPointAttPer36) > 1e-9) review('invalid-lineup-shot-components');
  }
  const sum = (rows, key) => rows.reduce((total, row) => {
    if (!Number.isFinite(row[key]) || row[key] < 0) review(`invalid-lineup-rate-${key}`);
    return total + row[key];
  }, 0);
  const fga = sum(offense, 'fgaPer36'), turnovers = sum(offense, 'turnoversPer36');
  const steals = sum(defense, 'stealsPer36'), blocks = sum(defense, 'blocksPer36');
  const ftAttempts = sum(offense, 'ftAttPer36'), assists = sum(offense, 'assistsPer36');
  const expectedMakes = offense.reduce((total, row) => total +
    row.threesAttPer36 * row.threePointPct + row.twoPointAttPer36 * row.twoPointPct, 0);
  if (![fga, turnovers, steals, blocks, ftAttempts, assists, expectedMakes].every(Number.isFinite)) review('nonfinite-lineup-budget');
  if (fga <= 0) review('lineup-has-no-field-goal-opportunity');
  const bounded = value => Math.max(0, Math.min(1, value));
  return { turnoverChance: bounded(turnovers * (48 / 36) / possessions),
    stealGivenTurnoverChance: turnovers > 0 ? bounded(steals / turnovers) : 0,
    blockChance: bounded(blocks / fga),
    assistedMakeChance: expectedMakes > 0 ? bounded(assists / expectedMakes) : 0,
    // Borrowed baseline mapping until the foul process has its own selected fit.
    shotFoulChance: Math.max(0, Math.min(0.18, 0.32 * ftAttempts / fga)) };
}

/** Map finite lineup production onto a neutral possession process, then leave
 * actual opponent turnovers/blocks/rebounds and defense free to affect play.
 * These neutral constants are explicit development assumptions. This is an
 * arithmetic conversion, not calibration against held-out NBA outcomes. */
export function calibrateSharedLineupScoring(rows, possessions) {
  const opportunities = sharedLineupOpportunityProbabilities(rows, rows, possessions);
  if (rows.some(row => !Number.isFinite(row.pointsPer36) || row.pointsPer36 < 0)) review('invalid-lineup-point-budget');
  const totalAttempts = rows.reduce((sum, row) => sum + row.fgaPer36, 0);
  const requestedPointsPerPossession = rows.reduce((sum, row) => sum + row.pointsPer36, 0) * (48 / 36) / possessions;
  if (!Number.isFinite(requestedPointsPerPossession) || requestedPointsPerPossession < 0) review('invalid-lineup-point-budget');
  const neutral = { turnoverChance: 0.13, blockChance: 0.04, offensiveReboundChance: 0.24 };
  const components = rows.flatMap(row => {
    const share = row.baseThreeAttemptShare ?? row.threeAttemptShare;
    if (![share, row.threeAttemptShare, row.threePointPct, row.twoPointPct, row.freeThrowPct].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) review('invalid-lineup-conversion-input');
    return [{ weight: row.fgaPer36 / totalAttempts * share, appliedWeight: row.fgaPer36 / totalAttempts * row.threeAttemptShare,
      points: 3, make: row.threePointPct, ft: row.freeThrowPct, ceiling: 0.53 },
      { weight: row.fgaPer36 / totalAttempts * (1 - share), appliedWeight: row.fgaPer36 / totalAttempts * (1 - row.threeAttemptShare),
        points: 2, make: row.twoPointPct, ft: row.freeThrowPct, ceiling: 0.75 }];
  });
  const expected = (shift, appliedShotMix = false) => {
    let points = 0, continuation = 0;
    for (const shot of components) {
      const q = Math.max(0, Math.min(shot.ceiling, shot.make + shift));
      const f = opportunities.shotFoulChance;
      const cleanMake = (1 - neutral.blockChance) * q;
      const weight = appliedShotMix ? shot.appliedWeight : shot.weight;
      points += weight * ((1 - f) * cleanMake * shot.points +
        f * (q * shot.points + (q + (1 - q) * shot.points) * shot.ft));
      continuation += weight * ((1 - f) * (1 - cleanMake) + f * (1 - shot.ft)) * neutral.offensiveReboundChance;
    }
    return (1 - neutral.turnoverChance) * points / (1 - continuation);
  };
  let low = -1, high = 1;
  const minimum = expected(low), maximum = expected(high);
  const target = Math.max(minimum, Math.min(maximum, requestedPointsPerPossession));
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (expected(middle) < target) low = middle; else high = middle;
  }
  const makeProbabilityShift = (low + high) / 2;
  const appliedNeutralPointsPerPossession = expected(makeProbabilityShift);
  const appliedShotMixNeutralPointsPerPossession = expected(makeProbabilityShift, true);
  if (![makeProbabilityShift, minimum, maximum, appliedNeutralPointsPerPossession].every(Number.isFinite)) review('nonfinite-neutral-conversion');
  return { method: 'neutral-possession-mean-conversion-v1', makeProbabilityShift,
    requestedPointsPerPossession, appliedNeutralPointsPerPossession,
    shotMixBasis: 'base-before-coaching-shot-emphasis',
    appliedShotMixNeutralPointsPerPossession,
    coachingShotMixMeanDrift: appliedShotMixNeutralPointsPerPossession - appliedNeutralPointsPerPossession,
    disclosure: 'The neutral conversion preserves the pre-coaching production mean. Explicit coaching shot choices can change expected scoring; their effect is shown, not silently calibrated away.',
    constrained: requestedPointsPerPossession < minimum || requestedPointsPerPossession > maximum,
    feasibleRange: [minimum, maximum], neutralContext: neutral, iterations: 24,
    empiricallySelected: false };
}

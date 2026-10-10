import { scoreCandidate57FastGaussian } from '../../models/game-lab-candidate57-fast-gaussian-scoring-v1.mjs';
import { scoreCandidate57FastEmpirical } from '../../models/game-lab-candidate57-fast-empirical-scoring-v1.mjs';
import { buildCandidate57ConfiguredDistribution, scoreCandidate57Distribution, DEFAULT_SETTINGS } from '../../models/game-lab-candidate57-configurable-uncertainty-v7.mjs';

export function normalizeSettings(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))) throw Error('Unknown uncertainty setting');
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const finite = Number.isFinite, s = settings;
  if (!['stratified', 'full', 'kernel'].includes(s.poolMode) || !Number.isSafeInteger(s.residualWindowGames) || s.residualWindowGames < 100
    || !finite(s.regimeThreshold) || s.regimeThreshold <= 0 || s.minimumStratumResiduals !== 100
    || !finite(s.stratumPriorGames) || s.stratumPriorGames < 0 || !finite(s.kernelBandwidthMargin) || s.kernelBandwidthMargin <= 0
    || s.residualAgeHalfLifeDays !== null && (!finite(s.residualAgeHalfLifeDays) || s.residualAgeHalfLifeDays <= 0)
    || !finite(s.totalResidualScale) || s.totalResidualScale <= 0 || !finite(s.marginResidualScale) || s.marginResidualScale <= 0
    || !finite(s.totalMarginCorrelationRetention) || s.totalMarginCorrelationRetention < 0 || s.totalMarginCorrelationRetention > 1
    || !finite(s.varianceAdaptationBlend) || s.varianceAdaptationBlend < 0 || s.varianceAdaptationBlend > 1
    || !Number.isSafeInteger(s.varianceWindowGames) || s.varianceWindowGames < 100
    || !finite(s.gaussianBlend) || s.gaussianBlend < 0 || s.gaussianBlend > 1
    || !finite(s.conditionalVarianceBlend) || s.conditionalVarianceBlend < 0 || s.conditionalVarianceBlend > 1
    || !finite(s.conditionalVarianceRidge) || s.conditionalVarianceRidge <= 0 || !['scores', 'total-margin'].includes(s.conditionalVarianceHeads)
    || !finite(s.totalBiasRetention) || s.totalBiasRetention < 0 || s.totalBiasRetention > 1
    || !finite(s.marginBiasRetention) || s.marginBiasRetention < 0 || s.marginBiasRetention > 1
    || !Number.isSafeInteger(s.biasWindowGames) || s.biasWindowGames < 100
    || !['split-point', 'condition-no-tie'].includes(s.integerTieMode) || typeof s.integerScoreSupport !== 'boolean'
    || s.integerScoreSupport && s.gaussianBlend !== 0 || !['rolling', 'prior-season'].includes(s.residualCalendarMode)) throw Error('Invalid uncertainty settings');
  return settings;
}
export function scorerName(settings, forceCanonical = false) {
  if (forceCanonical) return 'configured-canonical';
  if (settings.poolMode === 'full' && settings.gaussianBlend === 1 && !settings.integerScoreSupport
    && settings.residualCalendarMode === 'rolling' && settings.conditionalVarianceBlend === 0 && settings.residualAgeHalfLifeDays === null) return 'existing-fast-gaussian';
  if (settings.poolMode === 'full' && settings.gaussianBlend === 0 && settings.residualCalendarMode === 'rolling'
    && !settings.integerScoreSupport && settings.conditionalVarianceBlend === 0 && settings.varianceAdaptationBlend === 0
    && settings.residualAgeHalfLifeDays === null && settings.totalMarginCorrelationRetention === 1) return 'existing-fast-empirical';
  return 'configured-canonical';
}
export function scoreForecasts({ forecasts, settings, years, chronology, forceCanonical = false }) {
  const implementation = scorerName(settings, forceCanonical);
  if (implementation === 'existing-fast-gaussian') return { ...scoreCandidate57FastGaussian({ forecasts, settings, targetSeasonStartYears: years }), implementation };
  if (implementation === 'existing-fast-empirical') return { ...scoreCandidate57FastEmpirical({ forecasts, settings, targetSeasonStartYears: years }), implementation };
  const pool = [], scored = [], ledger = [], selected = new Set(years);
  for (const batch of chronology.dates) {
    const day = forecasts.slice(batch.start, batch.end);
    if (selected.has(day[0].seasonStartYear)) for (const row of day) {
      const distribution = buildCandidate57ConfiguredDistribution({ prediction: row.prediction, residualPool: pool,
        targetDate: batch.date, targetSeasonStartYear: row.seasonStartYear, settings });
      const actual = { home: row.target.homeScore, away: row.target.awayScore, margin: row.target.margin };
      scored.push({ gameRef: row.gameRef, gameDateLocal: batch.date, seasonStartYear: row.seasonStartYear,
        probability: distribution.homeWinProbability, homeWin: Number(row.target.margin > 0),
        sides: Object.fromEntries(['home', 'away', 'margin'].map(side => [side, scoreCandidate57Distribution(distribution[side], actual[side])])) });
      ledger.push({ gameRef: row.gameRef, gameDateLocal: batch.date, seasonStartYear: row.seasonStartYear,
        expectedTotal: distribution.home.mean + distribution.away.mean, expectedMargin: distribution.margin.mean,
        homeWinProbability: distribution.homeWinProbability, featureObservedThrough: row.featureObservedThrough,
        coefficientObservedThrough: row.coefficientObservedThrough, standardizationObservedThrough: row.standardizationObservedThrough,
        residualObservedThrough: distribution.residualObservedThrough, residualPoolCount: distribution.residualPoolCount });
    }
    // Feedback starts only after the complete local-date batch is predicted.
    for (const row of day) pool.push({ gameRef: row.gameRef, gameDateLocal: batch.date, seasonStartYear: row.seasonStartYear,
      predictedMargin: row.prediction.margin, predictedTotal: row.prediction.total,
      total: row.target.total - row.prediction.total, margin: row.target.margin - row.prediction.margin });
    if (settings.residualCalendarMode === 'rolling' && pool.length > settings.residualWindowGames) pool.splice(0, pool.length - settings.residualWindowGames);
  }
  return { scored, ledger, implementation };
}
export function compactLossRows(scored, forecastByRef) {
  const clip = probability => Math.min(1 - 1e-12, Math.max(1e-12, probability));
  return scored.map(row => {
    const source = forecastByRef.get(row.gameRef), p = clip(row.probability);
    return { gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear,
      homeTeamRef: source.homeTeamRef, awayTeamRef: source.awayTeamRef,
      probability: row.probability, homeWin: row.homeWin,
      brier: (row.probability - row.homeWin) ** 2,
      logLoss: -(row.homeWin * Math.log(p) + (1 - row.homeWin) * Math.log(1 - p)),
      marginAbsoluteError: Math.abs(row.sides.margin.error),
      sides: Object.fromEntries(['home', 'away', 'margin'].map(side => [side, { error: row.sides[side].error,
        crps: row.sides[side].crps, intervalScore: row.sides[side].equalWeightIntervalScore }])) };
  });
}

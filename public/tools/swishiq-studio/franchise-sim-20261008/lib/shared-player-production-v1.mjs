import { PLAYER_RATE_STATISTICS } from './player-game-development-features-v1.mjs';
import { predictRidge } from './ridge-regression.mjs';
import { predictSharedPlayerCount, sharedRateFeatures } from './player-game-shared-evaluation-v1.mjs';

export const SHARED_PLAYER_PRODUCTION_FORMAT = 'djhc-shared-player-production-candidate-v1';

/** Forecast means are inputs to a later coherent event/rotation process, not
 * sampled independent box counts. User-projected minutes take precedence over
 * the conditional model. No target game outcome or box is required. */
export function predictSharedPlayerProduction(candidate, input, { projectedMinutes = null } = {}) {
  if (candidate?.format !== SHARED_PLAYER_PRODUCTION_FORMAT || candidate.version !== '1.0.0-development' ||
      candidate.status !== 'isolated-development-candidate; joint-game-selection-pending' || !candidate.models?.minutes ||
      !Array.isArray(candidate.trainingSeasons) || candidate.trainingSeasons.some(year => !Number.isInteger(year))) throw new Error('Unsupported player production candidate.');
  let exposure, exposureSource;
  if (projectedMinutes !== null) {
    if (!Number.isFinite(projectedMinutes) || projectedMinutes < 0 || projectedMinutes > 108) throw new Error('Projected minutes must be explicit and in [0,108].');
    exposure = projectedMinutes; exposureSource = 'user-or-rotation-supplied';
  } else {
    const model = candidate.models.minutes.regression;
    if (!model || !Array.isArray(model.featureNames) || !model.featureNames.length || !Number.isFinite(model.intercept) ||
        new Set(model.featureNames).size !== model.featureNames.length || !model.coefficients ||
        model.featureNames.some(name => typeof name !== 'string' || !name || !Number.isFinite(model.coefficients[name]))) throw new Error('Conditional minutes regression is incomplete or nonfinite.');
    if (!input?.minutesFeatures || model.featureNames.some(name => !Object.hasOwn(input.minutesFeatures, name) || !Number.isFinite(input.minutesFeatures[name]))) throw new Error('Conditional minutes forecast requires its complete feature contract.');
    const rawMinutes = predictRidge(model, input.minutesFeatures);
    if (!Number.isFinite(rawMinutes)) throw new Error('Conditional minutes regression returned a nonfinite prediction.');
    exposure = Math.max(0, Math.min(108, rawMinutes)); exposureSource = 'conditional-model-mean';
  }
  const statistics = {};
  for (const stat of PLAYER_RATE_STATISTICS) {
    const model = candidate.models[stat];
    if (!model?.regression || !Number.isFinite(model.upperRateBoundPer36)) throw new Error('Player statistic model is incomplete.');
    const features = sharedRateFeatures(input, stat, model.formCandidate);
    statistics[stat] = predictSharedPlayerCount(model.regression, features, exposure, model.upperRateBoundPer36);
  }
  return { format: 'djhc-shared-player-production-forecast-v1', modelId: candidate.modelId, status: 'development-conditional-mean',
    projectedMinutes: exposure, exposureSource, statistics,
    boundary: { targetGameOutcomesRequired: false, availabilityOrAppearanceForecast: false, teamMinuteAllocation: false,
      overtimeProbability: false, coherentSampledBox: false, independentPredictiveCertification: false },
    provenance: { featurePolicy: candidate.featurePolicy, trainingSeasons: [...candidate.trainingSeasons] } };
}

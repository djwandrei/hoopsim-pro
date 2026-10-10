// Numerical mean-fit identity is separate from labels and uncertainty settings.
function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function validateDevelopmentFeatureContract(contract) {
  if (!isPlainRecord(contract) || contract.format !== 'swishiq-development-feature-contract-v1'
    || typeof contract.source !== 'string' || !contract.source.trim()
    || typeof contract.formula !== 'string' || !contract.formula.trim()
    || typeof contract.observedThroughRule !== 'string' || !contract.observedThroughRule.trim()
    || !isPlainRecord(contract.featureNames)) {
    throw Error('Invalid development feature contract');
  }
  for (const head of ['total', 'margin']) {
    const names = contract.featureNames[head];
    if (!Array.isArray(names) || names.some(name => typeof name !== 'string'
      || !/^[a-z][a-z0-9-]*:[A-Za-z0-9_.:-]+$/.test(name)) || new Set(names).size !== names.length) {
      throw Error('Invalid development feature contract names: ' + head);
    }
  }
  return contract;
}

export function meanSettings(config) {
  const result = {};
  for (const key of ['totalFeatureNames', 'marginFeatureNames', 'totalRidgeLambda', 'marginRidgeLambda',
    'trainingHalfLifeDays', 'refitIntervalDays', 'minimumTrainingRows', 'featureRidgePenaltyMultipliers',
    'postMeanCalibration', 'postMeanAffine', 'standardizationWarmupPrefixGames', 'headFeaturePolicy',
    'developmentFeatureContract']) result[key] = config[key] ?? null;
  if (config.postMeanCalibration) result.postMeanCalibration = { kind: config.postMeanCalibration.kind, modelWeight: config.postMeanCalibration.modelWeight };
  if (config.postMeanAffine) result.postMeanAffine = Object.fromEntries(['totalOffset', 'marginScale', 'marginOffset'].map(key => [key, config.postMeanAffine[key]]));
  return result;
}

export function validateMeanConfiguration(config) {
  if (!config || typeof config.version !== 'string' || !config.version.length) throw Error('Versioned mean configuration required');
  for (const head of ['total', 'margin']) {
    const names = config[head + 'FeatureNames'];
    if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !name.length)
      || new Set(names).size !== names.length) throw Error('Unique active head features required');
    if (!Number.isFinite(config[head + 'RidgeLambda']) || config[head + 'RidgeLambda'] <= 0) throw Error('Positive ridge setting required');
  }
  if (!Number.isFinite(config.trainingHalfLifeDays) || config.trainingHalfLifeDays <= 0 || !Number.isSafeInteger(config.refitIntervalDays)
    || config.refitIntervalDays < 1 || !Number.isSafeInteger(config.minimumTrainingRows) || config.minimumTrainingRows < 1
    || !Number.isSafeInteger(config.standardizationWarmupPrefixGames) || config.standardizationWarmupPrefixGames < 100) throw Error('Invalid mean fit settings');
  if (config.featureRidgePenaltyMultipliers) for (const head of ['total', 'margin']) {
    const penalties = config.featureRidgePenaltyMultipliers[head] ?? {};
    for (const [name, value] of Object.entries(penalties)) if (!config[head + 'FeatureNames'].includes(name)
      || !Number.isFinite(value) || value <= 0) throw Error('Invalid feature penalty: ' + head + '/' + name);
  }
  if (config.postMeanCalibration && (config.postMeanCalibration.kind !== 'total-prior-last10-blend'
    || !Number.isFinite(config.postMeanCalibration.modelWeight) || config.postMeanCalibration.modelWeight < 0 || config.postMeanCalibration.modelWeight > 1)) throw Error('Unsupported calibration contract');
  if (config.postMeanAffine && ['totalOffset', 'marginScale', 'marginOffset'].some(key => !Number.isFinite(config.postMeanAffine[key]))) throw Error('Finite affine calibration required');
  if (config.developmentFeatureContract !== undefined) validateDevelopmentFeatureContract(config.developmentFeatureContract);
}

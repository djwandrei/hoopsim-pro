import { fitRidge, predictRidge } from './ridge-regression.mjs';
import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

function seededRandom(seed = 1) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function metrics(rows, predicted) {
  if (!rows.length) return { rows: 0, mae: null, rmse: null, signAccuracy: null };
  const errors = rows.map((row, index) => predicted[index] - row.ratingChange);
  const directions = rows.filter(row => Math.abs(row.ratingChange) > 1e-9);
  return {
    rows: rows.length,
    mae: errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length,
    rmse: Math.sqrt(errors.reduce((sum, error) => sum + (error * error), 0) / errors.length),
    signAccuracy: directions.length ? directions.reduce((sum, row) => {
      const index = rows.indexOf(row);
      return sum + (Math.sign(predicted[index]) === Math.sign(row.ratingChange) ? 1 : 0);
    }, 0) / directions.length : null,
  };
}

function clusterBootstrapMaeImprovement(rows, predictions, baselinePredictions, {
  replicates = 1000,
  seed = 73021,
} = {}) {
  const clusterFor = row => normalizeCanonicalPlayerName(row.canonicalName ?? row.playerName ?? row.playerKey);
  const groups = new Map();
  rows.forEach((row, index) => {
    const key = clusterFor(row) || `row-${index}`;
    const values = groups.get(key) ?? [];
    values.push(index);
    groups.set(key, values);
  });
  const keys = [...groups.keys()];
  if (!keys.length) return { lower95: null, median: null, upper95: null, clusters: 0, replicates: 0 };
  const random = seededRandom(seed);
  const improvements = [];
  for (let iteration = 0; iteration < replicates; iteration += 1) {
    const sampleIndices = [];
    for (let draw = 0; draw < keys.length; draw += 1) {
      const sampled = keys[Math.floor(random() * keys.length)];
      sampleIndices.push(...groups.get(sampled));
    }
    const candidateMae = sampleIndices.reduce((sum, index) => sum + Math.abs(predictions[index] - rows[index].ratingChange), 0) / sampleIndices.length;
    const baselineMae = sampleIndices.reduce((sum, index) => sum + Math.abs(baselinePredictions[index] - rows[index].ratingChange), 0) / sampleIndices.length;
    improvements.push(baselineMae - candidateMae);
  }
  improvements.sort((a, b) => a - b);
  const pick = probability => improvements[Math.max(0, Math.min(improvements.length - 1, Math.floor(probability * (improvements.length - 1))))];
  return { lower95: pick(0.025), median: pick(0.5), upper95: pick(0.975), clusters: keys.length, replicates };
}

function validateTransitionRows(rows) {
  return (rows ?? []).filter(row => Number.isInteger(row.toSeasonStartYear) &&
    Number.isFinite(row.ratingChange) && row.features && typeof row.features === 'object');
}

/** Expanding chronological folds for next-season rating-change experiments. */
export function evaluateRatingProgressionFeatureSets(rows, {
  featureSets,
  folds = null,
  recentFoldStartYear = 2023,
  minimumFoldImprovementShare = 0.7,
  clusterBootstrapReplicates = 1000,
  ridgeLambda = 8,
} = {}) {
  const transitions = validateTransitionRows(rows);
  const foldYears = [...new Set(folds ?? transitions.map(row => row.toSeasonStartYear))].sort((a, b) => a - b);
  const modelResults = {};
  const featureSetEntries = Object.entries(featureSets ?? {});
  if (!featureSetEntries.length) throw new Error('At least one progression feature set is required.');
  for (const [featureSetName, featureNames] of featureSetEntries) {
    const oofRows = [];
    const oofPredictions = [];
    const noChangePredictions = [];
    const meanChangePredictions = [];
    const foldReports = [];
    for (const targetYear of foldYears) {
      const training = transitions.filter(row => row.toSeasonStartYear < targetYear);
      const test = transitions.filter(row => row.toSeasonStartYear === targetYear);
      if (!training.length || !test.length) continue;
      const model = fitRidge(training, featureNames, 'ratingChange', ridgeLambda);
      const predictions = test.map(row => predictRidge(model, row.features));
      const meanChange = training.reduce((sum, row) => sum + row.ratingChange, 0) / training.length;
      const zero = test.map(() => 0);
      const meanPredictions = test.map(() => meanChange);
      const candidateMetrics = metrics(test, predictions);
      const noChangeMetrics = metrics(test, zero);
      const meanChangeMetrics = metrics(test, meanPredictions);
      foldReports.push({
        toSeasonStartYear: targetYear,
        trainingRows: training.length,
        testRows: test.length,
        maxTrainingTargetSeasonStartYear: Math.max(...training.map(row => row.toSeasonStartYear)),
        candidate: candidateMetrics,
        noChange: noChangeMetrics,
        trainingMeanChange: meanChangeMetrics,
      });
      oofRows.push(...test);
      oofPredictions.push(...predictions);
      noChangePredictions.push(...zero);
      meanChangePredictions.push(...meanPredictions);
    }
    const candidate = metrics(oofRows, oofPredictions);
    const noChange = metrics(oofRows, noChangePredictions);
    const trainingMeanBaseline = metrics(oofRows, meanChangePredictions);
    const bestBaselinePredictions = noChange.mae <= trainingMeanBaseline.mae ? noChangePredictions : meanChangePredictions;
    const bestBaselineName = noChange.mae <= trainingMeanBaseline.mae ? 'no-change' : 'training-mean-change';
    const ci = clusterBootstrapMaeImprovement(oofRows, oofPredictions, bestBaselinePredictions, { replicates: clusterBootstrapReplicates });
    const foldsImproved = foldReports.filter(fold => {
      const best = Math.min(fold.noChange.mae ?? Infinity, fold.trainingMeanChange.mae ?? Infinity);
      return fold.candidate.mae < best;
    }).length;
    const recent = foldReports.filter(fold => fold.toSeasonStartYear >= recentFoldStartYear);
    const recentImproved = recent.filter(fold => fold.candidate.mae < Math.min(fold.noChange.mae ?? Infinity, fold.trainingMeanChange.mae ?? Infinity)).length;
    const requiredFoldCount = Math.ceil(foldReports.length * minimumFoldImprovementShare);
    const selected = foldReports.length > 0 && foldsImproved >= requiredFoldCount &&
      (recent.length === 0 || recentImproved >= Math.ceil(recent.length * minimumFoldImprovementShare)) &&
      ci.lower95 > 0;
    modelResults[featureSetName] = {
      featureNames: [...featureNames],
      status: selected ? 'selected-development-candidate' : 'not-selected',
      metrics: { candidate, noChange, trainingMeanChange: trainingMeanBaseline },
      bestBaselineForPairedComparison: bestBaselineName,
      clusteredMaeImprovement95: ci,
      foldsImproved,
      requiredFoldCount,
      recentFoldsImproved: recentImproved,
      recentFoldCount: recent.length,
      folds: foldReports,
      oofPredictions: oofRows.map((row, index) => ({
        canonicalName: row.canonicalName ?? row.playerName ?? row.playerKey ?? null,
        fromSeasonStartYear: row.fromSeasonStartYear ?? null,
        toSeasonStartYear: row.toSeasonStartYear,
        actualRatingChange: row.ratingChange,
        predictedRatingChange: oofPredictions[index],
        noChangePrediction: noChangePredictions[index],
        trainingMeanPrediction: meanChangePredictions[index],
      })),
    };
  }
  return {
    format: 'djhc-rating-progression-evaluation-v1',
    status: 'chronological-development-evaluation',
    target: 'Next-season change in DJHC overall rating. Current or future target-season data is excluded from each fold fit.',
    protocol: { foldYears, ridgeLambda, minimumFoldImprovementShare, recentFoldStartYear, clusterBootstrapReplicates, bootstrapUnit: 'canonical player name, normalized exactly' },
    featureSets: modelResults,
    overallBoundary: 'A selected result is a development candidate for future confirmation, not proof of predictive validity. Feature sources still require their own identity, timing, and reliability checks.',
  };
}

export function createProgressionModel(evaluation, featureSetName, trainingRows, {
  residualQuantiles = null,
  residualSd = null,
} = {}) {
  const result = evaluation?.featureSets?.[featureSetName];
  if (!result || result.status !== 'selected-development-candidate') {
    return { format: 'djhc-rating-progression-model-v1', modelId: `career-progression-${featureSetName ?? 'unselected'}`, status: 'no-selected-progression-model', selectedForUse: false, featureSetName: featureSetName ?? null };
  }
  const featureNames = result.featureNames;
  const model = fitRidge(validateTransitionRows(trainingRows), featureNames, 'ratingChange', evaluation.protocol.ridgeLambda);
  return {
    format: 'djhc-rating-progression-model-v1',
    modelId: `career-progression-${featureSetName}`,
    modelVersion: '1.0.0-development-candidate',
    status: 'selected-development-candidate',
    selectedForUse: true,
    featureSetName,
    featureNames,
    regression: model,
    trainingSeasonMax: Math.max(...trainingRows.map(row => row.toSeasonStartYear)),
    forecastContract: { format: 'djhc-rating-progression-forecast-contract-v1', horizonSeasons: 1,
      ageConvention: 'completed-from-season', target: 'next-season-rating-change' },
    residualQuantiles: residualQuantiles ? { ...residualQuantiles } : null,
    residualSd: Number.isFinite(residualSd) ? residualSd : null,
    evaluationRef: { status: evaluation.status, protocol: evaluation.protocol },
    limitation: 'Development selection is not independent validation. Prediction is for a later season than the training rows only.',
  };
}

export function buildProgressionFeatures(player = {}) {
  const features = {
    ratingLevel: player.overallRating ?? null,
    priorRatingChange: player.priorRatingChange ?? null,
    hasPriorRatingChange: Number.isFinite(player.priorRatingChange) ? 1 : 0,
    games: player.games ?? null,
    minutesPerGame: player.minutesPerGame ?? null,
    minutesChange: player.minutesChange ?? null,
    pointsPer36: player.pointsPer36 ?? null,
    pointsPer36Change: player.pointsPer36Change ?? null,
    reboundsPer36: player.reboundsPer36 ?? null,
    assistsPer36: player.assistsPer36 ?? null,
    scoringDomain: player.scoringDomain ?? null,
    creationDomain: player.creationDomain ?? null,
    shootingDomain: player.shootingDomain ?? null,
    defenseDomain: player.defenseDomain ?? null,
    reboundingDomain: player.reboundingDomain ?? null,
    ageCentered: Number.isFinite(player.age) ? player.age - 27 : null,
    priorWorkload: player.priorWorkload ?? null,
    experienceSeasons: player.experienceSeasons ?? null,
    ratingSourceReliability: player.ratingSourceReliability ?? null,
  };
  return features;
}

export function projectNextSeasonRating(player, targetSeasonStartYear, model, {
  allowExperimental = false,
  defaultNoChangeInterval = 8,
} = {}) {
  if (!Number.isInteger(targetSeasonStartYear)) throw new Error('Projection target must be a season start year.');
  if (!Number.isFinite(defaultNoChangeInterval) || defaultNoChangeInterval < 0) throw new Error('Progression fallback interval must be finite and nonnegative.');
  if (!Number.isInteger(player.completedSeasonStartYear) || targetSeasonStartYear <= player.completedSeasonStartYear) {
    throw new Error('Rating progression may only project a season after the player’s last completed season.');
  }
  const baseRating = Number(player.overallRating);
  if (!Number.isFinite(baseRating)) throw new Error('Player progression requires a completed-season overall rating.');
  const selected = model?.selectedForUse === true && model?.regression;
  const permittedCandidate = allowExperimental && model?.regression;
  if (!selected && !permittedCandidate) {
    return {
      canonicalName: player.canonicalName ?? player.name,
      targetSeasonStartYear,
      rating: baseRating,
      change: 0,
      uncertainty: { lower: Math.max(0, baseRating - defaultNoChangeInterval), upper: Math.min(100, baseRating + defaultNoChangeInterval), level: 'fallback-range-not-calibrated' },
      status: 'no-selected-model-carry-forward',
      source: { fromSeasonStartYear: player.completedSeasonStartYear, modelId: model?.modelId ?? null },
    };
  }
  if (targetSeasonStartYear !== player.completedSeasonStartYear + 1) throw new Error('Fitted progression predicts one season ahead; advance multi-year careers sequentially.');
  if (!Number.isInteger(model.trainingSeasonMax) || model.trainingSeasonMax >= targetSeasonStartYear) throw new Error('Progression requires a resolved training cutoff strictly before the forecast season.');
  if (!model.forecastContract || model.forecastContract.format !== 'djhc-rating-progression-forecast-contract-v1' ||
      model.forecastContract.horizonSeasons !== 1 || model.forecastContract.ageConvention !== 'completed-from-season' ||
      model.forecastContract.target !== 'next-season-rating-change') throw new Error('Missing or unsupported progression forecast contract.');
  // Built-in chronological fits use the completed/from-season age. The league
  // advances display/state age separately; do not advance this feature again.
  const features = buildProgressionFeatures(player);
  const unsupportedFeatures = (model.regression.featureNames ?? []).filter(name => !Object.hasOwn(features, name));
  if (unsupportedFeatures.length) throw new Error(`Unsupported progression runtime features: ${unsupportedFeatures.join(', ')}.`);
  const missingFeatureNames = model.regression.featureNames.filter(name => !Number.isFinite(features[name]));
  if (missingFeatureNames.length) return {
    canonicalName: player.canonicalName ?? player.name,
    targetSeasonStartYear, rating: baseRating, change: 0,
    uncertainty: { lower: clamp(baseRating - defaultNoChangeInterval, 0, 100), upper: clamp(baseRating + defaultNoChangeInterval, 0, 100),
      level: 'fallback-range-not-calibrated', residualBasis: 'configured-fallback-not-calibrated' },
    status: 'missing-required-model-inputs-carry-forward',
    source: { fromSeasonStartYear: player.completedSeasonStartYear, modelId: model.modelId,
      missingFeatureNames, features, reason: 'The fitted model was not evaluated with missing required inputs.' },
  };
  const rawChange = predictRidge(model.regression, features);
  const historyCount = Math.max(0, Number(player.priorSeasonsObserved ?? player.experienceSeasons ?? 0));
  const shrinkage = historyCount < 2 ? 0.45 : historyCount < 4 ? 0.7 : historyCount < 6 ? 0.85 : 1;
  const change = rawChange * shrinkage;
  const rating = clamp(baseRating + change, 0, 100);
  let lowerResidual = -defaultNoChangeInterval;
  let upperResidual = defaultNoChangeInterval;
  let residualBasis = 'configured-fallback-not-calibrated';
  if (model.residualQuantiles != null) {
    const { p10, p90 } = model.residualQuantiles;
    if (!Number.isFinite(p10) || !Number.isFinite(p90) || p10 > p90) throw new Error('Progression residual quantiles must be finite and ordered.');
    lowerResidual = p10;
    upperResidual = p90;
    residualBasis = 'unverified-supplied-residual-quantiles';
  } else if (model.residualSd != null) {
    if (!Number.isFinite(model.residualSd) || model.residualSd < 0) throw new Error('Progression residual SD must be finite and nonnegative.');
    lowerResidual = -model.residualSd;
    upperResidual = model.residualSd;
    residualBasis = 'unverified-supplied-residual-sd';
  }
  return {
    canonicalName: player.canonicalName ?? player.name,
    targetSeasonStartYear,
    rating,
    change: rating - baseRating,
    uncertainty: {
      lower: clamp(baseRating + (change + lowerResidual * shrinkage), 0, 100),
      upper: clamp(baseRating + (change + upperResidual * shrinkage), 0, 100),
      level: residualBasis === 'configured-fallback-not-calibrated' ? 'fallback-range-not-calibrated' : 'development-residual-range',
      residualBasis,
    },
    status: selected ? 'selected-development-candidate-projection' : 'experimental-projection-explicitly-enabled',
    source: { fromSeasonStartYear: player.completedSeasonStartYear, modelId: model.modelId, shrinkage, features },
  };
}

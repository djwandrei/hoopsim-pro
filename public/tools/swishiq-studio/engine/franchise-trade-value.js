/*
 * Evidence-first value model for Franchise trade assets.
 *
 * Player profiles and contract commitments remain separate from projected
 * on-court value. Draft curves are fitted only from accepted, fixed-horizon
 * historical outcomes and must beat a chronological holdout baseline before
 * they can produce a numerical estimate. This module does not assign an
 * overall trade grade or determine pick ownership / CBA eligibility.
 */

export const FRANCHISE_TRADE_VALUE_MODEL_VERSION = 'franchise-trade-value-v2';

export const FRANCHISE_TRADE_VALUE_REFERENCES = Object.freeze({
  nbaDraftHistory: {
    title: 'NBA Draft Lottery: How it works, odds and where to watch',
    sourceUrl: 'https://www.nba.com/news/nba-draft-lottery-explainer',
    note: 'Official source for selection order, tie handling, pick order, and lottery process; not a pick-rights ledger.',
  },
  nbpaCba: {
    title: '2023 NBA-NBPA Collective Bargaining Agreement',
    sourceUrl: 'https://www.nbpa.com/cba',
    note: 'Official source for employment and contract rules; transaction legality is evaluated separately.',
  },
  draftValueResearch: {
    title: 'Exploring various NBA draft value curves',
    sourceUrl: 'https://wsb.wharton.upenn.edu/exploring-various-nba-draft-value-curves/',
    paperUrl: 'https://wsb.wharton.upenn.edu/wp-content/uploads/2024/12/NBA_draft_curves-6.pdf',
    note: 'Research guidance: fixed outcome horizons, out-of-time testing, multiple value metrics, and visible uncertainty; curves vary substantially by target.',
  },
});

const PICK_COUNT = 60;
const METRICS = Object.freeze(['points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers']);
const HASH = /^[a-f0-9]{64}$/i;

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value) {
  return finite(value) && value >= 0;
}

function integer(value) {
  return Number.isInteger(value);
}

function sourceReceipt(value) {
  if (!isRecord(value) || value.status !== 'verified-source') return null;
  const sourceId = text(value.sourceId || value.id || value.packageId || value.datasetId);
  const sourceVersion = text(value.sourceVersion || value.version || value.packageVersion || value.datasetVersion);
  const sourceRef = text(value.sourceRef || value.reference || value.ref);
  const sourceUrl = text(value.sourceUrl || value.url);
  if (!sourceId || !sourceVersion || !sourceRef || !/^https:\/\//i.test(sourceUrl)) return null;
  return { status: 'verified-source', sourceId, sourceVersion, sourceRef, sourceUrl };
}

function scenarioReceipt(value) {
  if (!isRecord(value) || value.status !== 'declared-scenario') return null;
  const scenarioId = text(value.scenarioId || value.sourceId);
  const scenarioVersion = text(value.scenarioVersion || value.version || value.sourceVersion);
  const scenarioRef = text(value.scenarioRef || value.sourceRef || value.reference);
  if (!scenarioId || !scenarioVersion || !scenarioRef) return null;
  return { status: 'declared-scenario', scenarioId, scenarioVersion, scenarioRef };
}

function summarizeSource(value) {
  const source = sourceReceipt(value);
  return source ? {
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    sourceRef: source.sourceRef,
    sourceUrl: source.sourceUrl,
  } : null;
}

function describeEvidenceSource(value) {
  if (!isRecord(value)) return null;
  const sourceId = text(value.id || value.packageId || value.datasetId || value.sourceId);
  const sourceVersion = text(value.version || value.packageVersion || value.datasetVersion || value.sourceVersion);
  if (!sourceId || !sourceVersion) return null;
  return { sourceId, sourceVersion, scope: text(value.scope) || null };
}

function acceptedImpactPackage(value, seasonStartYear) {
  if (!isRecord(value) || value.accepted !== true) return null;
  const ref = isRecord(value.packageRef) ? value.packageRef : value;
  const scope = ref.scope;
  const years = Array.isArray(scope?.seasonStartYears) ? scope.seasonStartYears.map(Number) : [];
  const capability = value.capabilities?.publicAdvancedImpact;
  const capabilityAvailable = capability === 'available' || capability?.status === 'available';
  if (!text(ref.packageId) || !text(ref.packageVersion)
    || !HASH.test(text(ref.packageManifestSha256)) || !HASH.test(text(ref.sourceLockSha256))
    || !capabilityAvailable || !isRecord(scope)
    || !['exact-season', 'pooled-window'].includes(scope.kind)
    || !Array.isArray(scope.phases) || !scope.phases.includes('regular')
    || !years.includes(seasonStartYear) || years.some(year => !integer(year))
    || new Set(years).size !== years.length) return null;
  if (scope.kind === 'exact-season'
    && (Number(scope.seasonStartYear) !== seasonStartYear || years.length !== 1 || years[0] !== seasonStartYear)) return null;
  return {
    packageId: text(ref.packageId),
    packageVersion: text(ref.packageVersion),
    packageManifestSha256: text(ref.packageManifestSha256).toLowerCase(),
    sourceLockSha256: text(ref.sourceLockSha256).toLowerCase(),
    scope: { kind: scope.kind, seasonStartYear, seasonStartYears: years },
  };
}

function observedNativeImpact(evidence, playerRef) {
  const bundle = evidence.nativeImpact;
  const recent = evidence.recentProduction;
  if (!isRecord(bundle)) return unavailable('unavailable', 'accepted-native-impact-evidence-required');
  const row = bundle.row;
  if (!isRecord(row) || row.observed !== true || row.displayEligible !== true) {
    return unavailable('unavailable', 'observed-display-eligible-impact-row-required');
  }
  if (text(row.playerRef) !== text(playerRef)) return unavailable('unavailable', 'impact-row-player-reference-mismatch');
  const seasonStartYear = integer(row.seasonStartYear) && row.seasonStartYear >= 1947 && row.seasonStartYear <= 2200
    ? row.seasonStartYear : null;
  const packageSource = acceptedImpactPackage(bundle.packagePin, seasonStartYear);
  if (!packageSource) return unavailable('unavailable', 'accepted-package-public-impact-capability-required');
  const productionSource = describeEvidenceSource(evidence.source);
  if (!productionSource || productionSource.sourceId !== packageSource.packageId
    || productionSource.sourceVersion !== packageSource.packageVersion) {
    return unavailable('unavailable', 'impact-and-production-must-share-accepted-package');
  }
  const impact = row.impact;
  const coverage = row.coverage;
  if (row.phase !== 'regular' || !/^[A-Z]{3}$/.test(text(row.teamCode))
    || recent?.status !== 'observed' || recent.seasonStartYear !== seasonStartYear
    || (text(recent.teamCode) && recent.teamCode !== row.teamCode)) {
    return unavailable('unavailable', 'impact-season-team-and-phase-must-match-observed-player-season');
  }
  if (!isRecord(impact) || impact.alreadyRegularized !== true
    || !finite(impact.offensePer100) || !finite(impact.defensePer100)
    || Math.abs(impact.offensePer100) > 100 || Math.abs(impact.defensePer100) > 100
    || !finite(impact.reliability) || impact.reliability < 0 || impact.reliability > 1) {
    return unavailable('unavailable', 'regularized-impact-components-and-reliability-required');
  }
  if (!isRecord(coverage) || !integer(coverage.games) || coverage.games < 1
    || !nonNegative(coverage.minutes) || coverage.minutes <= 0
    || !nonNegative(coverage.possessions) || coverage.possessions <= 0) {
    return unavailable('unavailable', 'impact-game-minute-and-possession-coverage-required');
  }
  const combinedPer100 = Number((impact.offensePer100 + impact.defensePer100).toFixed(4));
  return {
    status: 'observed-regularized-impact-estimate',
    seasonStartYear,
    teamCode: row.teamCode,
    phase: row.phase,
    offensePer100: Number(impact.offensePer100),
    defensePer100: Number(impact.defensePer100),
    combinedPer100,
    combinedUnit: 'impact-points-per-100-support-possessions',
    reliability: Number(impact.reliability),
    alreadyRegularized: true,
    coverage: {
      games: coverage.games,
      minutes: Number(coverage.minutes),
      possessions: Number(coverage.possessions),
      ledger: 'native-impact-support',
    },
    supportWindowNetImpactPointEstimate: Number((combinedPer100 * coverage.possessions / 100).toFixed(2)),
    supportWindowEstimateUnit: 'regularized-impact-points-over-native-support-window',
    source: packageSource,
    method: 'sum-native-offense-and-defense-impact-then-scale-by-native-impact-support-possessions-v1',
    uncertainty: [
      'Reliability is the native impact reliability measure, not a confidence interval or calibrated probability.',
      'The support-window point estimate is regularized impact rate multiplied by its own eligible possession coverage; it is not an observed team point margin, future projection, salary value, or pick value.',
      'Official production totals and native impact-support coverage can use different ledgers; their game counts are disclosed separately and are not forced to reconcile.',
    ],
  };
}

function quantile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return Number(sortedValues[lower].toFixed(4));
  const value = sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower);
  return Number(value.toFixed(4));
}

function sortedNumbers(values) {
  return values.slice().sort((a, b) => a - b);
}

function unavailable(status, reasonCode, details = {}) {
  return { status, reasonCode, ...details };
}

function validOutcome(row, horizon) {
  return isRecord(row)
    && integer(row.draftYear) && row.draftYear >= 1947
    && integer(row.pickNumber) && row.pickNumber >= 1 && row.pickNumber <= PICK_COUNT
    && finite(row.outcomeValue)
    && integer(row.outcomeHorizonSeasons) && row.outcomeHorizonSeasons === horizon
    && row.observationStatus === 'observed'
    && text(row.playerRef);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function holdoutMae(rows, predict) {
  if (!rows.length) return null;
  return Number(average(rows.map(row => Math.abs(row.outcomeValue - predict(row))).filter(finite)).toFixed(4));
}

function fitMonotoneDecreasingPickMeans(byPick) {
  const blocks = [];
  for (const item of byPick) {
    blocks.push({
      firstPick: item.pickNumber,
      lastPick: item.pickNumber,
      weight: item.n,
      weightedSum: item.mean * item.n,
      values: item.values.slice(),
    });
    while (blocks.length > 1) {
      const left = blocks.at(-2);
      const right = blocks.at(-1);
      const leftMean = left.weightedSum / left.weight;
      const rightMean = right.weightedSum / right.weight;
      if (leftMean >= rightMean) break;
      blocks.splice(-2, 2, {
        firstPick: left.firstPick,
        lastPick: right.lastPick,
        weight: left.weight + right.weight,
        weightedSum: left.weightedSum + right.weightedSum,
        values: left.values.concat(right.values),
      });
    }
  }
  return blocks;
}

/**
 * Fit a pick-outcome curve from accepted historical draft data.
 *
 * Each outcome must represent exactly `targetHorizonSeasons` after the draft.
 * Draft years through `trainingThroughDraftYear` fit the curve; a later,
 * explicitly bounded date range tests it. It returns diagnostic estimates
 * even when holdout performance is poor, but only `validated` curves may be
 * used by `assessDraftPickAsset`.
 */
export function fitFranchiseDraftPickValueCurve({
  outcomes,
  source,
  outcomeMetric,
  outcomeUnit,
  targetHorizonSeasons,
  trainingThroughDraftYear,
  validationFromDraftYear,
  validationThroughDraftYear,
  minimumRowsPerPick = 4,
  minimumTrainingDraftYears = 4,
  minimumValidationDraftYears = 2,
} = {}) {
  const receipt = sourceReceipt(source);
  if (!receipt) return unavailable('unavailable', 'verified-draft-history-source-required');
  if (!Array.isArray(outcomes) || !text(outcomeMetric) || !text(outcomeUnit)
    || !integer(targetHorizonSeasons) || targetHorizonSeasons < 1
    || !integer(trainingThroughDraftYear) || !integer(validationFromDraftYear)
    || !integer(validationThroughDraftYear) || validationFromDraftYear <= trainingThroughDraftYear
    || validationThroughDraftYear < validationFromDraftYear
    || !integer(minimumRowsPerPick) || minimumRowsPerPick < 1) {
    return unavailable('unavailable', 'explicit-metric-horizon-and-chronological-split-required');
  }

  const rows = outcomes.filter(row => validOutcome(row, targetHorizonSeasons));
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.draftYear}:${row.pickNumber}`;
    if (seen.has(key)) return unavailable('unavailable', 'duplicate-draft-year-pick-observation');
    seen.add(key);
  }
  const training = rows.filter(row => row.draftYear <= trainingThroughDraftYear);
  const validation = rows.filter(row => row.draftYear >= validationFromDraftYear && row.draftYear <= validationThroughDraftYear);
  const trainYears = [...new Set(training.map(row => row.draftYear))].sort((a, b) => a - b);
  const validationYears = [...new Set(validation.map(row => row.draftYear))].sort((a, b) => a - b);
  if (trainYears.length < minimumTrainingDraftYears || validationYears.length < minimumValidationDraftYears) {
    return unavailable('unavailable', 'insufficient-distinct-draft-years-for-holdout', {
      trainingDraftYears: trainYears.length,
      validationDraftYears: validationYears.length,
      minimumTrainingDraftYears,
      minimumValidationDraftYears,
    });
  }
  if (!training.length || !validation.length) return unavailable('unavailable', 'empty-chronological-training-or-validation-window');

  const byPick = [];
  for (let pickNumber = 1; pickNumber <= PICK_COUNT; pickNumber += 1) {
    const values = training.filter(row => row.pickNumber === pickNumber).map(row => Number(row.outcomeValue));
    if (values.length < minimumRowsPerPick) {
      return unavailable('unavailable', 'insufficient-training-outcomes-for-pick-position', {
        pickNumber,
        observedRows: values.length,
        minimumRowsPerPick,
        trainingDraftYears: trainYears,
        validationDraftYears: validationYears,
      });
    }
    byPick.push({ pickNumber, values, n: values.length, mean: average(values) });
  }
  const blocks = fitMonotoneDecreasingPickMeans(byPick);
  const curve = Array(PICK_COUNT + 1);
  for (const block of blocks) {
    const blockValues = sortedNumbers(block.values);
    const projectedMean = Number((block.weightedSum / block.weight).toFixed(4));
    const row = {
      blockFirstPick: block.firstPick,
      blockLastPick: block.lastPick,
      expectedOutcome: projectedMean,
      empiricalOutcomeRange: {
        p10: quantile(blockValues, 0.1),
        p50: quantile(blockValues, 0.5),
        p90: quantile(blockValues, 0.9),
        interpretation: 'training-sample outcome quantiles; not a confidence interval',
      },
      trainingSampleSize: block.weight,
    };
    for (let pickNumber = block.firstPick; pickNumber <= block.lastPick; pickNumber += 1) {
      curve[pickNumber] = { pickNumber, ...row };
    }
  }
  const globalMean = average(training.map(row => Number(row.outcomeValue)));
  const candidateMae = holdoutMae(validation, row => curve[row.pickNumber]?.expectedOutcome ?? NaN);
  const baselineMae = holdoutMae(validation, () => globalMean);
  const validated = finite(candidateMae) && finite(baselineMae) && candidateMae < baselineMae;
  return {
    status: validated ? 'validated' : 'not-validated',
    modelId: FRANCHISE_TRADE_VALUE_MODEL_VERSION,
    method: 'chronological-fixed-horizon-isotonic-mean-with-empirical-outcome-quantiles',
    outcomeMetric: text(outcomeMetric),
    outcomeUnit: text(outcomeUnit),
    targetHorizonSeasons,
    source: summarizeSource(receipt),
    training: {
      draftYearStart: trainYears[0],
      draftYearEnd: trainYears.at(-1),
      distinctDraftYears: trainYears.length,
      observations: training.length,
    },
    validation: {
      draftYearStart: validationYears[0],
      draftYearEnd: validationYears.at(-1),
      distinctDraftYears: validationYears.length,
      observations: validation.length,
      mae: candidateMae,
      globalMeanBaselineMae: baselineMae,
      improvedOverGlobalMeanBaseline: validated,
      selection: 'out-of-time draft classes; no validation rows were used to fit the curve',
    },
    curve: curve.slice(1),
    uncertainty: [
      'Historical outcome spread is large and is shown as empirical training-sample quantiles, not a calibrated player-specific interval.',
      'The model is a proxy for the declared outcome metric, not championship probability or the NBA market clearing price for picks.',
      validated ? '' : 'The out-of-time holdout did not outperform the training global-mean baseline; numeric pick estimates are withheld.' ,
    ].filter(Boolean),
  };
}

function validProjection(projection, calibration) {
  if (!isRecord(projection) || projection.status !== 'validated-projection') return null;
  const source = sourceReceipt(projection.source);
  if (!source || !calibration || calibration.status !== 'validated'
    || !text(projection.modelId) || !text(projection.modelVersion)
    || !isRecord(projection.validation) || projection.validation.status !== 'passed'
    || !text(projection.validation.method) || !integer(projection.validation.trainingN) || projection.validation.trainingN < 1
    || !integer(projection.validation.holdoutN) || projection.validation.holdoutN < 1
    || !finite(projection.validation.holdoutMae) || projection.validation.holdoutMae < 0
    || projection.outcomeMetric !== calibration.outcomeMetric
    || projection.outcomeUnit !== calibration.outcomeUnit
    || projection.horizonSeasons !== calibration.targetHorizonSeasons
    || !finite(projection.expectedValue) || !finite(projection.lowerValue) || !finite(projection.upperValue)
    || projection.lowerValue > projection.expectedValue || projection.expectedValue > projection.upperValue) return null;
  return {
    expectedValue: Number(projection.expectedValue),
    lowerValue: Number(projection.lowerValue),
    upperValue: Number(projection.upperValue),
    outcomeMetric: text(projection.outcomeMetric),
    outcomeUnit: text(projection.outcomeUnit),
    horizonSeasons: projection.horizonSeasons,
    modelId: text(projection.modelId),
    modelVersion: text(projection.modelVersion),
    source: summarizeSource(source),
  };
}

function contractCommitment(contract, salaryCapHistory) {
  const source = sourceReceipt(contract?.source);
  const terms = Array.isArray(contract?.salaryTerms) ? contract.salaryTerms : [];
  if (!source || !terms.length) return unavailable('unavailable', 'verified-contract-terms-required');
  const years = new Set();
  for (const term of terms) {
    if (!isRecord(term) || !integer(term.seasonStartYear) || !nonNegative(term.salaryUsd)
      || !['observed', 'imputed', 'scenario-default'].includes(term.observationStatus) || years.has(term.seasonStartYear)) {
      return unavailable('unavailable', 'invalid-or-duplicate-contract-salary-term');
    }
    years.add(term.seasonStartYear);
  }
  const ordered = terms.filter(term => term.observationStatus === 'observed').slice().sort((a, b) => a.seasonStartYear - b.seasonStartYear);
  const excludedTerms = terms.filter(term => term.observationStatus !== 'observed').slice().sort((a, b) => a.seasonStartYear - b.seasonStartYear);
  const capSource = sourceReceipt(salaryCapHistory?.source);
  const caps = Array.isArray(salaryCapHistory?.entries) ? salaryCapHistory.entries : [];
  const capByYear = new Map(caps.filter(row => isRecord(row) && row.observationStatus === 'observed'
    && integer(row.seasonStartYear) && nonNegative(row.salaryCapUsd) && row.salaryCapUsd > 0)
    .map(row => [row.seasonStartYear, Number(row.salaryCapUsd)]));
  const capShare = capSource ? ordered.map(term => ({
    seasonStartYear: term.seasonStartYear,
    salaryCapShare: capByYear.has(term.seasonStartYear) ? Number((term.salaryUsd / capByYear.get(term.seasonStartYear)).toFixed(4)) : null,
  })) : [];
  const guaranteeComplete = ordered.length > 0 && ordered.every(term => nonNegative(term.guaranteedUsd));
  return {
    status: ordered.length === terms.length ? 'verified-terms-summary' : ordered.length ? 'partial-source-summary' : 'scenario-or-imputed-terms-only',
    source: summarizeSource(source),
    observedNominalSalaryUsd: Number(ordered.reduce((sum, term) => sum + Number(term.salaryUsd), 0).toFixed(2)),
    excludedSalaryTerms: excludedTerms.map(term => ({
      seasonStartYear: term.seasonStartYear,
      salaryUsd: Number(term.salaryUsd),
      observationStatus: term.observationStatus,
    })),
    guaranteedSalaryUsd: guaranteeComplete
      ? Number(ordered.reduce((sum, term) => sum + Number(term.guaranteedUsd), 0).toFixed(2))
      : null,
    salaryYears: ordered.map(term => term.seasonStartYear),
    salaryCapShares: capShare,
    salaryCapSource: capSource ? summarizeSource(capSource) : null,
    uncertainty: [
      ...(guaranteeComplete ? [] : ['Guaranteed salary is incomplete; only observed nominal salary terms are totaled.']),
      ...(excludedTerms.length ? ['Imputed or scenario-default salary terms are disclosed but excluded from observed commitment totals.'] : []),
      ...(capSource && capShare.some(row => row.salaryCapShare === null) ? ['Salary-cap history is missing an observed value for one or more contract years.'] : []),
    ],
    interpretation: 'Observed cash and cap-share commitments; not a performance-to-salary conversion or player market value.',
  };
}

/** Describe observed player value components; project a common value only when
 * a source-pinned, horizon-matched projection is supplied. */
export function assessFranchisePlayerAsset({
  playerRef,
  playerEvidence,
  contract,
  salaryCapHistory,
  projection,
  calibration,
} = {}) {
  const evidence = isRecord(playerEvidence) ? playerEvidence : {};
  const recent = isRecord(evidence.recentProduction) ? evidence.recentProduction : {};
  const recentValues = isRecord(recent.valuesPerGame) ? recent.valuesPerGame : {};
  const peakRows = isRecord(evidence.observedPeakByMetric?.seasonByMetric) ? evidence.observedPeakByMetric.seasonByMetric : {};
  const production = {
    recentSeasonStartYear: integer(recent.seasonStartYear) ? recent.seasonStartYear : null,
    games: integer(recent.games) ? recent.games : null,
    minutes: nonNegative(recent.minutes) ? recent.minutes : null,
    perGame: Object.fromEntries(METRICS.map(metric => [metric, nonNegative(recentValues[metric]) ? Number(recentValues[metric]) : null])),
    observedPeakByMetric: Object.fromEntries(METRICS.map(metric => {
      const row = isRecord(peakRows[metric]) ? peakRows[metric] : {};
      return [metric, finite(row.valuePerGame) ? {
        seasonStartYear: integer(row.seasonStartYear) ? row.seasonStartYear : null,
        valuePerGame: row.valuePerGame,
        games: integer(row.games) ? row.games : null,
      } : null];
    })),
    evidenceSource: describeEvidenceSource(evidence.source),
    status: recent.status === 'observed' ? 'observed-production-profile' : 'partial-or-unavailable',
  };
  const acceptedProjection = validProjection(projection, calibration);
  const impact = observedNativeImpact(evidence, playerRef);
  return {
    assetRef: text(playerRef),
    kind: 'player',
    status: acceptedProjection ? 'calibrated-estimate' : 'descriptive-only',
    observedProduction: production,
    observedImpact: impact,
    ageTrajectory: isRecord(evidence.ageTrajectory) ? {
      status: text(evidence.ageTrajectory.status) || 'unavailable',
      ages: Array.isArray(evidence.ageTrajectory.ages) ? evidence.ageTrajectory.ages.map(row => ({
        seasonStartYear: integer(row?.seasonStartYear) ? row.seasonStartYear : null,
        age: nonNegative(row?.age) ? Number(row.age) : null,
      })) : [],
      perSeasonChangeByMetric: isRecord(evidence.ageTrajectory.perSeasonChangeByMetric)
        ? evidence.ageTrajectory.perSeasonChangeByMetric : null,
      doesNotProject: evidence.ageTrajectory.doesNotProject !== false,
    } : unavailable('unavailable', 'age-history-unavailable'),
    workloadReliability: isRecord(evidence.workloadReliability) ? {
      status: text(evidence.workloadReliability.status) || 'unavailable',
      observedSeasons: integer(evidence.workloadReliability.observedSeasons) ? evidence.workloadReliability.observedSeasons : null,
      games: integer(evidence.workloadReliability.games) ? evidence.workloadReliability.games : null,
      minutes: nonNegative(evidence.workloadReliability.minutes) ? evidence.workloadReliability.minutes : null,
    } : unavailable('unavailable', 'workload-evidence-unavailable'),
    rosterFit: isRecord(evidence.rosterFit) ? {
      status: text(evidence.rosterFit.status) || 'unavailable',
      primaryPosition: text(evidence.rosterFit.primaryPosition) || null,
      roleNeedComparison: text(evidence.rosterFit.roleNeedComparison) || null,
    } : unavailable('unavailable', 'roster-fit-evidence-unavailable'),
    contractCommitment: contractCommitment(contract, salaryCapHistory),
    projectedContribution: acceptedProjection
      ? { ...acceptedProjection, calibrationModelId: calibration.modelId }
      : unavailable('unavailable', 'matching-validated-player-projection-required', {
        expectedOutcomeMetric: calibration?.outcomeMetric || null,
        expectedOutcomeUnit: calibration?.outcomeUnit || null,
        expectedHorizonSeasons: calibration?.targetHorizonSeasons || null,
      }),
    valueInterpretation: acceptedProjection
      ? 'Projected player contribution in the declared historical-outcome unit; roster fit and contract cost are reported separately.'
      : 'Observed production, age, workload, role, contract, and accepted native impact are separate evidence components; they are not collapsed into an uncalibrated overall grade or market value.',
  };
}

function validPickOutcomes(evidence) {
  const rows = Array.isArray(evidence?.outcomes) ? evidence.outcomes : [];
  if (!rows.length) return null;
  let total = 0;
  const normalized = [];
  for (const row of rows) {
    if (!isRecord(row) || !finite(row.probability) || row.probability < 0 || !finite(row.pickNumber)
      || !integer(row.pickNumber) || row.pickNumber < 1 || row.pickNumber > PICK_COUNT
      || !integer(row.draftYear) || row.draftYear < 1947 || typeof row.conveysToAcquirer !== 'boolean') return null;
    total += row.probability;
    normalized.push({
      draftYear: row.draftYear,
      pickNumber: row.pickNumber,
      probability: row.probability,
      conveysToAcquirer: row.conveysToAcquirer,
      branchId: text(row.branchId) || null,
      condition: text(row.condition) || null,
    });
  }
  if (Math.abs(total - 1) > 0.0001) return null;
  return normalized;
}

/**
 * Value a draft-pick right from an explicit rights receipt and scenario
 * distribution. Protections, rollovers, and swaps are represented by their
 * complete, caller-resolved outcome branches rather than guessed here.
 */
export function assessFranchiseDraftPickAsset({ pickRef, pickEvidence, calibration } = {}) {
  const evidence = isRecord(pickEvidence) ? pickEvidence : {};
  const rightsSource = sourceReceipt(evidence.rightsSource);
  const rightsScenario = scenarioReceipt(evidence.rightsSource);
  const distributionSource = evidence.outcomesSource
    ? sourceReceipt(evidence.outcomesSource) || scenarioReceipt(evidence.outcomesSource)
    : rightsSource || rightsScenario;
  const outcomes = validPickOutcomes(evidence);
  const curveReady = calibration?.status === 'validated'
    && text(calibration.modelId)
    && Array.isArray(calibration.curve)
    && text(calibration.outcomeMetric) && text(calibration.outcomeUnit)
    && integer(calibration.targetHorizonSeasons)
    && isRecord(calibration.validation) && calibration.validation.improvedOverGlobalMeanBaseline === true
    && Array.isArray(calibration.curve) && calibration.curve.length === PICK_COUNT
    && calibration.curve.every((row, index) => row?.pickNumber === index + 1 && finite(row.expectedOutcome)
      && isRecord(row.empiricalOutcomeRange) && finite(row.empiricalOutcomeRange.p10)
      && finite(row.empiricalOutcomeRange.p50) && finite(row.empiricalOutcomeRange.p90)
      && integer(row.trainingSampleSize) && row.trainingSampleSize > 0);
  const curveByPick = new Map((curveReady ? calibration.curve : []).map(row => [row.pickNumber, row]));
  const valuedBranches = outcomes && curveReady ? outcomes.map(outcome => {
    const curveRow = curveByPick.get(outcome.pickNumber);
    if (!curveRow || !finite(curveRow.expectedOutcome)) return null;
    return {
      ...outcome,
      expectedContribution: outcome.conveysToAcquirer ? Number(curveRow.expectedOutcome) : 0,
      historicalOutcomeRange: outcome.conveysToAcquirer ? curveRow.empiricalOutcomeRange : null,
      trainingSampleSize: outcome.conveysToAcquirer ? curveRow.trainingSampleSize : 0,
    };
  }) : null;
  const canValue = Boolean((rightsSource || rightsScenario) && distributionSource && outcomes && curveReady
    && valuedBranches?.every(Boolean));
  const scenarioBacked = Boolean(rightsScenario || distributionSource?.status === 'declared-scenario');
  const conveyedProbability = outcomes
    ? Number(outcomes.filter(row => row.conveysToAcquirer).reduce((sum, row) => sum + row.probability, 0).toFixed(4))
    : null;
  const expectedValue = canValue
    ? Number(valuedBranches.reduce((sum, row) => sum + row.probability * row.expectedContribution, 0).toFixed(4))
    : null;
  const lowerValue = canValue
    ? Number(valuedBranches.reduce((sum, row) => sum + row.probability * (row.conveysToAcquirer
      ? Math.min(row.historicalOutcomeRange.p10, row.expectedContribution) : 0), 0).toFixed(4))
    : null;
  const upperValue = canValue
    ? Number(valuedBranches.reduce((sum, row) => sum + row.probability * (row.conveysToAcquirer
      ? Math.max(row.historicalOutcomeRange.p90, row.expectedContribution) : 0), 0).toFixed(4))
    : null;
  return {
    assetRef: text(pickRef),
    kind: 'draft-pick',
    status: canValue ? scenarioBacked ? 'scenario-estimate' : 'calibrated-estimate' : 'unavailable',
    rights: {
      status: rightsSource ? 'source-backed-rights-receipt' : rightsScenario ? 'declared-scenario-rights' : 'unavailable',
      ownerTeamId: text(evidence.ownerTeamId) || null,
      draftYear: integer(evidence.draftYear) ? evidence.draftYear : null,
      round: integer(evidence.round) && evidence.round >= 1 && evidence.round <= 2 ? evidence.round : null,
      encumbrances: Array.isArray(evidence.encumbrances) ? evidence.encumbrances.map(text).filter(Boolean) : [],
      source: rightsSource ? summarizeSource(rightsSource) : rightsScenario,
    },
    outcomes: outcomes ? {
      source: distributionSource?.status === 'verified-source' ? summarizeSource(distributionSource) : distributionSource,
      scenarioCount: outcomes.length,
      conveyProbability: conveyedProbability,
      branches: canValue ? valuedBranches : outcomes,
      status: 'complete-explicit-scenario-distribution',
    } : unavailable('unavailable', 'complete-source-backed-or-declared-scenario-pick-outcome-distribution-required'),
    projectedContribution: canValue ? {
      expectedValue,
      lowerValue,
      upperValue,
      outcomeMetric: calibration.outcomeMetric,
      outcomeUnit: calibration.outcomeUnit,
      horizonSeasons: calibration.targetHorizonSeasons,
      calibrationModelId: calibration.modelId,
      interpretation: 'Expected fixed-horizon historical outcome of the right conveyed to the acquirer; not championship odds or a universal pick price.',
      uncertainty: scenarioBacked
        ? 'Conditional estimate: future pick ownership or selection branches include a declared scenario assumption; historical outcome quantiles do not measure rights uncertainty.'
        : 'Historical outcome quantiles are reported per branch; branch probabilities are supplied by the rights/lottery source.',
    } : unavailable('unavailable', !rightsSource && !rightsScenario
      ? 'source-backed-or-explicit-scenario-pick-rights-required'
      : !outcomes || !distributionSource
        ? 'complete-source-backed-pick-outcome-distribution-required'
        : 'validated-matching-fixed-horizon-draft-curve-required'),
  };
}

function projectionRange(value) {
  if (!isRecord(value) || !['calibrated-estimate', 'scenario-estimate'].includes(value.status)
    || !isRecord(value.projectedContribution) || !finite(value.projectedContribution.expectedValue)) return null;
  const result = value.projectedContribution;
  if (!text(result.outcomeMetric) || !text(result.outcomeUnit) || !integer(result.horizonSeasons)
    || !finite(result.lowerValue) || !finite(result.upperValue)
    || result.lowerValue > result.expectedValue || result.expectedValue > result.upperValue) return null;
  return result;
}

/** Combine incoming/outgoing asset contribution only when all assets share a
 * validated outcome metric, unit, horizon, and calibration model. */
export function evaluateFranchiseTradeValue({
  teams,
  pickAssetsByRef = {},
  playerEvidenceByRef = {},
  contractsByPlayerRef = {},
  salaryCapHistory,
  playerProjectionsByRef = {},
  pickCalibration,
} = {}) {
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some(team => !isRecord(team) || !text(team.teamId) || !Array.isArray(team.assets))) {
    return unavailable('unavailable', 'bilateral-trade-sides-required');
  }
  if (teams[0].teamId === teams[1].teamId
    || teams.some(team => team.assets.some(asset => !isRecord(asset) || !['player', 'draft-pick'].includes(asset.kind) || !text(asset.ref)))) {
    return unavailable('unavailable', 'unique-teams-and-valid-player-or-pick-assets-required');
  }
  const submittedAssetKeys = teams.flatMap(team => team.assets.map(asset => `${asset.kind}:${text(asset.ref)}`));
  if (new Set(submittedAssetKeys).size !== submittedAssetKeys.length) {
    return unavailable('unavailable', 'trade-value-assets-must-be-unique');
  }
  const assetMap = new Map();
  const teamRows = teams.map(team => ({ teamId: text(team.teamId), sentAssetKeys: team.assets.map(asset => `${asset?.kind}:${asset?.ref}`) }));
  for (const team of teams) {
    for (const asset of team.assets) {
      if (!isRecord(asset) || !['player', 'draft-pick'].includes(asset.kind) || !text(asset.ref)) continue;
      const key = `${asset.kind}:${text(asset.ref)}`;
      const details = asset.kind === 'player'
        ? assessFranchisePlayerAsset({
          playerRef: text(asset.ref),
          playerEvidence: playerEvidenceByRef[asset.ref],
          contract: contractsByPlayerRef[asset.ref],
          salaryCapHistory,
          projection: playerProjectionsByRef[asset.ref],
          calibration: pickCalibration,
        })
        : assessFranchiseDraftPickAsset({ pickRef: text(asset.ref), pickEvidence: pickAssetsByRef[asset.ref], calibration: pickCalibration });
      assetMap.set(key, { ...details, sentByTeamId: text(team.teamId), kind: asset.kind, assetRef: text(asset.ref) });
    }
  }
  const bothTeams = teamRows.map((team, index) => {
    const opponent = teamRows[1 - index];
    const sent = team.sentAssetKeys.map(key => assetMap.get(key)).filter(Boolean);
    const received = opponent.sentAssetKeys.map(key => assetMap.get(key)).filter(Boolean);
    const allAssets = sent.concat(received);
    const comparable = allAssets.map(projectionRange);
    const first = comparable[0];
    const sameCalibration = Boolean(first) && comparable.every(row => row
      && row.outcomeMetric === first.outcomeMetric
      && row.outcomeUnit === first.outcomeUnit
      && row.horizonSeasons === first.horizonSeasons
      && row.calibrationModelId === first.calibrationModelId);
    const estimate = sameCalibration ? {
      outcomeMetric: first.outcomeMetric,
      outcomeUnit: first.outcomeUnit,
      horizonSeasons: first.horizonSeasons,
      calibrationModelId: first.calibrationModelId,
      sentExpectedValue: Number(sent.reduce((sum, row) => sum + projectionRange(row).expectedValue, 0).toFixed(4)),
      receivedExpectedValue: Number(received.reduce((sum, row) => sum + projectionRange(row).expectedValue, 0).toFixed(4)),
      netExpectedValue: Number((received.reduce((sum, row) => sum + projectionRange(row).expectedValue, 0)
        - sent.reduce((sum, row) => sum + projectionRange(row).expectedValue, 0)).toFixed(4)),
      netRange: {
        lowerValue: Number((received.reduce((sum, row) => sum + row.lowerValue, 0)
          - sent.reduce((sum, row) => sum + row.upperValue, 0)).toFixed(4)),
        upperValue: Number((received.reduce((sum, row) => sum + row.upperValue, 0)
          - sent.reduce((sum, row) => sum + row.lowerValue, 0)).toFixed(4)),
        interpretation: 'sum of supplied marginal ranges; not a joint confidence interval',
      },
    } : null;
    return {
      teamId: team.teamId,
      outgoing: sent,
      incoming: received,
      comparison: estimate ? {
        status: allAssets.some(row => row.status === 'scenario-estimate') ? 'scenario-estimate' : 'calibrated-estimate',
        ...estimate,
        interpretation: allAssets.some(row => row.status === 'scenario-estimate')
          ? 'Conditional projected contribution balance; future pick ownership or selection includes a declared scenario assumption.'
          : 'Projected contribution balance for the selected horizon; does not determine whether either team should accept the trade.',
      } : unavailable('uncalibrated', 'all-player-and-pick-assets-need-the-same-validated-value-unit'),
    };
  });
  const everyAssetModeled = [...assetMap.values()].length > 0 && [...assetMap.values()].every(row => projectionRange(row));
  const scenarioEstimate = [...assetMap.values()].some(row => row.status === 'scenario-estimate');
  return {
    modelVersion: FRANCHISE_TRADE_VALUE_MODEL_VERSION,
    status: everyAssetModeled ? scenarioEstimate ? 'scenario-estimate' : 'calibrated-estimate' : 'evidence-components-only',
    method: 'component-report-with-validated-common-unit-comparison-when-available',
    teams: bothTeams,
    calibration: pickCalibration?.status === 'validated' ? {
      modelId: pickCalibration.modelId,
      outcomeMetric: pickCalibration.outcomeMetric,
      outcomeUnit: pickCalibration.outcomeUnit,
      targetHorizonSeasons: pickCalibration.targetHorizonSeasons,
      validation: pickCalibration.validation,
      source: pickCalibration.source,
    } : unavailable('unavailable', 'validated-common-unit-player-and-pick-calibration-required'),
    caveats: [
      'This output is an analytical estimate, not a trade recommendation or a 0–100 grade.',
      'Pick rights, protection clauses, swaps, and legal availability must be resolved by a complete source-backed rights ledger before trade validation.',
      'A shared historical production unit does not capture team-specific fit, coaching, championship odds, contract surplus, or player preferences.',
    ],
  };
}

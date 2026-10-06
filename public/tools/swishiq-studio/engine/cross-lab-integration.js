/*
 * Cross-lab handoff contract.
 *
 * Chemistry, Career, and Player Builder use different evidence layers. This
 * module deliberately passes context between them without silently merging
 * observed rows, synthetic output, or modeled futures into one claimed data
 * source. A consumer must opt into the required capability before it can run
 * a scenario from one of these handoffs.
 */

export const CROSS_LAB_INTEGRATION_VERSION = 'swishiq-cross-lab-integration-v3';
export const CROSS_LAB_TARGETS = Object.freeze(['chemistry', 'career', 'season']);

const TARGET_CAPABILITIES = Object.freeze({
  chemistry: Object.freeze(['chemistry', 'syntheticPlayerInput']),
  career: Object.freeze(['careerSimulation', 'syntheticCareerInput']),
  season: Object.freeze(['compositeSimulation', 'seasonSimulation']),
});
const SEASON_SOURCE_KINDS = new Set(['exact-season', 'pooled-window', 'forecast-season']);

const TEAM_CODE = /^[A-Z]{3}$/;
const SEED = /^[A-Za-z0-9:._-]{1,80}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const FORECAST_HOLDOUT_POLICY = 'strict-before-holdout-v1';
const FORECAST_ISSUANCE_POLICY = 'forecast-issued-before-holdout-season-v1';
const CAREER_MIN_REPEATS = 50;
const CAREER_MAX_REPEATS = 500;
const CAREER_MAX_HORIZON = 15;
const PRIVATE_KEY = /^(?:player(?:id|ref|seasonref)|profilekey|canonicalid|provider(?:id|ref)?|nativeprovenance)$/i;
const SAFE_PAIR_METRICS = Object.freeze([
  'pointsPerGame', 'assistsPerGame', 'reboundsPerGame', 'trueShootingPercentage',
  'threePointAttemptShare', 'stealsPerGame', 'blocksPerGame', 'turnoversPerGame', 'minutesPerGame',
]);
const EXPECTED_WIN_COVERAGE_STATUSES = new Set(['available', 'partial', 'unavailable', 'unverified']);
const MAX_REPEATED_ELIGIBLE_GAMES = 30_000_000;

const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const text = (value, maximum = 240) => typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const sha256 = value => {
  const candidate = text(value, 64);
  return candidate && SHA256.test(candidate) ? candidate : null;
};

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !PRIVATE_KEY.test(key))
    .map(([key, nested]) => [key, sanitize(nested)]));
}

function normalizedScope(scope) {
  if (!object(scope)) return null;
  const kind = text(scope.kind, 40);
  const rawYears = Array.isArray(scope.seasonStartYears)
    ? scope.seasonStartYears
    : integer(scope.seasonStartYear) ? [scope.seasonStartYear] : [];
  const seasonStartYears = [...new Set(rawYears.map(Number).filter(year => integer(year) && year >= 1947 && year <= 2200))].sort((left, right) => left - right);
  const phases = [...new Set((Array.isArray(scope.phases) ? scope.phases : []).map(phase => text(phase, 40)).filter(Boolean))].sort();
  if (!['exact-season', 'pooled-window'].includes(kind) || !seasonStartYears.length || !phases.length) return null;
  if (kind === 'exact-season' && seasonStartYears.length !== 1) return null;
  return { kind, seasonStartYears, phases };
}

function publicPackagePin(source) {
  const packageId = text(source?.packageId, 160);
  const packageVersion = text(source?.packageVersion, 160);
  const scope = normalizedScope(source?.scope);
  if (!packageId || !packageVersion || !scope) return null;
  // A pooled package is a materially different evidence lane from an exact
  // package. Preserve the caller's explicit acceptance on the public pin and
  // fail closed when a downstream handoff cannot prove that acceptance.
  const acceptedPooledPackage = source?.acceptedPooledPackage === true;
  if (scope.kind === 'pooled-window' && !acceptedPooledPackage) return null;
  const sourceGeneration = text(source?.sourceGeneration, 8);
  if (sourceGeneration && sourceGeneration !== 'V4') return null;
  const pin = {
    packageId,
    packageVersion,
    packageManifestSha256: text(source?.packageManifestSha256, 160),
    sourceLockSha256: text(source?.sourceLockSha256, 160),
    projectionContentSha256: text(source?.projectionContentSha256, 160),
    acceptedPooledPackage,
    scope,
  };
  if (sourceGeneration === 'V4') {
    const requiredHashes = ['registrySha256', 'registryRevisionSha256', 'indexSha256', 'capabilityMapSha256',
      'packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256',
      'reviewReceiptSha256', 'authorizationReferenceSha256'];
    if (!text(source?.releaseId, 160) || !text(source?.capabilityId, 80)
      || requiredHashes.some(key => !SHA256.test(String(pin[key] || source?.[key] || '')))) return null;
    pin.sourceGeneration = 'V4';
    pin.releaseId = text(source.releaseId, 160);
    pin.registrySha256 = text(source.registrySha256, 64);
    pin.registryRevisionSha256 = text(source.registryRevisionSha256, 64);
    pin.indexSha256 = text(source.indexSha256, 64);
    pin.capabilityMapSha256 = text(source.capabilityMapSha256, 64);
    pin.capabilityId = text(source.capabilityId, 80);
    pin.reviewReceiptSha256 = text(source.reviewReceiptSha256, 64);
    pin.authorizationReferenceSha256 = text(source.authorizationReferenceSha256, 64);
  }
  return pin;
}

function packageScopeSignature(packagePin) {
  if (!packagePin) return null;
  const scope = packagePin.scope;
  return [packagePin.sourceGeneration || 'V3', packagePin.packageId, packagePin.packageVersion,
    scope.kind, scope.seasonStartYears.join(','), scope.phases.join(',')].join('|');
}

function packagePinsAgree(left, right) {
  if (!left || !right || packageScopeSignature(left) !== packageScopeSignature(right)) return false;
  // ID/version/scope identify the lane; immutable content pins identify the
  // actual evidence behind that lane. Compare every hash that both receipts
  // expose so a stale result cannot be paired with a rebuilt package carrying
  // the same human-facing version.
  return ['packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256',
    'registrySha256', 'registryRevisionSha256', 'indexSha256', 'capabilityMapSha256',
    'releaseId', 'capabilityId', 'reviewReceiptSha256', 'authorizationReferenceSha256']
    .every(key => !left[key] || !right[key] || left[key] === right[key]);
}

function capabilityAvailable(capabilities, key) {
  const value = capabilities?.[key];
  return value === true || value?.status === 'available';
}

function safeNumbers(value, keys) {
  return Object.fromEntries(keys.map(key => [key, finite(value?.[key]) ? round(value[key]) : null]));
}

function safeTendencies(value) {
  return Array.isArray(value) ? value.map(tendency => ({
    key: text(tendency?.key, 80), label: text(tendency?.label, 120), metric: text(tendency?.metric, 80),
    value: finite(tendency?.value) ? round(tendency.value) : null, unit: text(tendency?.unit, 40),
    source: text(tendency?.source, 80), status: text(tendency?.status, 40),
  })) : [];
}

function safeOutputRanges(value) {
  return Array.isArray(value) ? value.map(range => ({
    key: text(range?.key, 80), metric: text(range?.metric, 80), status: text(range?.status, 50),
    value: finite(range?.value) ? round(range.value) : null,
    minimum: finite(range?.minimum) ? round(range.minimum) : null,
    maximum: finite(range?.maximum) ? round(range.maximum) : null,
    donorMinimum: finite(range?.donorMinimum) ? round(range.donorMinimum) : null,
    donorMaximum: finite(range?.donorMaximum) ? round(range.donorMaximum) : null,
    outsideDonorRange: range?.outsideDonorRange === true,
  })) : [];
}

function canonicalUtcBeforeSeason(value, seasonStartYear) {
  const sourceCutoffUtc = text(value, 40);
  if (!sourceCutoffUtc || !integer(seasonStartYear)) return false;
  const timestamp = Date.parse(sourceCutoffUtc);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString() === sourceCutoffUtc
    && timestamp < Date.UTC(seasonStartYear, 9, 1);
}

function validForecastMetric(value, kind) {
  if (!object(value) || !integer(Number(value.sample), 1)) return false;
  const number = key => finite(Number(value[key]));
  if (kind === 'binary') {
    return ['brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError'].every(number)
      && Number(value.brier) >= 0 && Number(value.brier) <= 1
      && Number(value.logLoss) >= 0 && Number(value.baselineLogLoss) >= 0
      && Number(value.baselineBrier) >= 0 && Number(value.baselineBrier) <= 1
      && Number(value.calibrationError) >= 0 && Number(value.calibrationError) <= 1;
  }
  const interval = value.interval;
  return ['mae', 'rmse', 'baselineMae', 'baselineRmse'].every(number)
    && Number(value.mae) >= 0 && Number(value.rmse) >= Number(value.mae)
    && Number(value.baselineMae) >= 0 && Number(value.baselineRmse) >= Number(value.baselineMae)
    && object(interval)
    && integer(Number(interval.sample), 1)
    && Number(interval.sample) === Number(value.sample)
    && finite(Number(interval.nominalCoverage)) && Number(interval.nominalCoverage) > 0 && Number(interval.nominalCoverage) < 1
    && finite(Number(interval.empiricalCoverage)) && Number(interval.empiricalCoverage) >= 0 && Number(interval.empiricalCoverage) <= 1;
}

// Keep the calibration receipt useful after it crosses the Season Lab
// boundary.  The model report retains the full validation object, but a
// cross-lab handoff used to reduce it to a status and count.  That made a
// downstream consumer unable to distinguish a genuinely calibrated forecast
// from one that merely passed the structural gate.  This view is deliberately
// aggregate/holdout-level only: it carries enough evidence to audit quality,
// while never exposing raw source rows or private model inputs.
function publicForecastMetric(value, kind) {
  if (!validForecastMetric(value, kind)) return null;
  const summary = { sample: Number(value.sample) };
  const keys = kind === 'binary'
    ? ['brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError']
    : ['mae', 'rmse', 'baselineMae', 'baselineRmse'];
  keys.forEach(key => { summary[key] = round(Number(value[key])); });
  if (kind !== 'binary') {
    summary.interval = {
      sample: Number(value.interval.sample),
      nominalCoverage: round(Number(value.interval.nominalCoverage)),
      empiricalCoverage: round(Number(value.interval.empiricalCoverage)),
    };
  }
  return summary;
}

function forecastIntervalCalibration(value) {
  if (!validForecastMetric(value, 'continuous')) return null;
  const nominalCoverage = Number(value.interval.nominalCoverage);
  const empiricalCoverage = Number(value.interval.empiricalCoverage);
  const sample = Number(value.interval.sample);
  const standardError = Math.sqrt(Math.max(Number.EPSILON, nominalCoverage * (1 - nominalCoverage)) / sample);
  const coverageGap = empiricalCoverage - nominalCoverage;
  const zScore = coverageGap / standardError;
  return {
    nominalCoverage: round(nominalCoverage),
    empiricalCoverage: round(empiricalCoverage),
    coverageGap: round(coverageGap),
    standardError: round(standardError),
    zScore: round(zScore),
    status: zScore < -2 ? 'under-covered' : zScore > 2 ? 'over-covered' : 'within-sampling-error',
  };
}

// Recompute the receipt label at the handoff boundary. A caller cannot make
// an under-covered forecast look improved by editing only its quality string;
// the aggregate metrics and interval diagnostics must agree with the label.
function forecastQualityStatus(aggregate) {
  if (!object(aggregate)
    || !validForecastMetric(aggregate.winProbability, 'binary')
    || !validForecastMetric(aggregate.teamWins, 'continuous')
    || !validForecastMetric(aggregate.teamNetRating, 'continuous')) return null;
  const improvements = [
    Number(aggregate.winProbability.baselineBrier) - Number(aggregate.winProbability.brier),
    Number(aggregate.winProbability.baselineLogLoss) - Number(aggregate.winProbability.logLoss),
    Number(aggregate.teamWins.baselineMae) - Number(aggregate.teamWins.mae),
    Number(aggregate.teamWins.baselineRmse) - Number(aggregate.teamWins.rmse),
    Number(aggregate.teamNetRating.baselineMae) - Number(aggregate.teamNetRating.mae),
    Number(aggregate.teamNetRating.baselineRmse) - Number(aggregate.teamNetRating.rmse),
  ];
  const improved = improvements.filter(value => value > 0).length;
  const pointRegressed = improvements.filter(value => value < 0).length;
  const intervalRegressed = ['teamWins', 'teamNetRating']
    .map(metric => forecastIntervalCalibration(aggregate[metric]))
    .filter(value => value && value.status !== 'within-sampling-error').length;
  const regressed = pointRegressed + intervalRegressed;
  return regressed === 0 && improved > 0 ? 'improved-versus-declared-baselines'
    : improved > 0 ? 'mixed-versus-declared-baselines' : 'not-improved-versus-declared-baselines';
}

function forecastAggregateReconciles(aggregate, holdouts) {
  if (!object(aggregate) || !Array.isArray(holdouts) || !holdouts.length) return false;
  const closeEnough = (left, right) => Math.abs(Number(left) - Number(right))
    <= 0.00001 * Math.max(1, Math.abs(Number(left)), Math.abs(Number(right)));
  const weightedMean = (metric, key) => {
    const total = holdouts.reduce((sum, row) => sum + Number(row.metrics[metric].sample), 0);
    return total ? holdouts.reduce((sum, row) => sum + Number(row.metrics[metric][key]) * Number(row.metrics[metric].sample), 0) / total : null;
  };
  const weightedRmse = (metric, key) => {
    const total = holdouts.reduce((sum, row) => sum + Number(row.metrics[metric].sample), 0);
    return total ? Math.sqrt(holdouts.reduce((sum, row) => sum + Number(row.metrics[metric][key]) ** 2 * Number(row.metrics[metric].sample), 0) / total) : null;
  };
  for (const key of ['brier', 'logLoss', 'baselineBrier', 'baselineLogLoss', 'calibrationError']) {
    if (!closeEnough(aggregate.winProbability[key], weightedMean('winProbability', key))) return false;
  }
  for (const metric of ['teamWins', 'teamNetRating']) {
    for (const key of ['mae', 'baselineMae']) {
      if (!closeEnough(aggregate[metric][key], weightedMean(metric, key))) return false;
    }
    for (const key of ['rmse', 'baselineRmse']) {
      if (!closeEnough(aggregate[metric][key], weightedRmse(metric, key))) return false;
    }
    const sample = Number(aggregate[metric].sample);
    const empiricalCoverage = holdouts.reduce((sum, row) => sum
      + Number(row.metrics[metric].interval.empiricalCoverage) * Number(row.metrics[metric].sample), 0) / sample;
    if (!closeEnough(aggregate[metric].interval.empiricalCoverage, empiricalCoverage)) return false;
    const nominalCoverage = Number(holdouts[0].metrics[metric].interval.nominalCoverage);
    if (holdouts.some(row => !closeEnough(row.metrics[metric].interval.nominalCoverage, nominalCoverage))
      || !closeEnough(aggregate[metric].interval.nominalCoverage, nominalCoverage)) return false;
  }
  return true;
}

function publicSyntheticPlayer(result) {
  if (!object(result)) return { status: 'unavailable', reason: 'No Player Builder result was supplied.' };
  const packagePin = publicPackagePin(result.package || result.recipe?.packageRef);
  const recipePackagePin = result.recipe?.packageRef ? publicPackagePin(result.recipe.packageRef) : null;
  // The public result and its replay recipe are two receipts for the same
  // evidence scope. If both are present, do not let a stale/mismatched result
  // package make a synthetic player look eligible for a different package
  // than the one used to build its recipe hash.
  if (result.package && (!recipePackagePin || !packagePin || !packagePinsAgree(packagePin, recipePackagePin))) {
    return { status: 'unavailable', reason: 'The Player Builder result and recipe are bound to different package scopes.' };
  }
  const profile = result.playerProfile;
  const statistics = result.syntheticStatistics;
  const recipeHash = text(result.recipeHash, 80);
  const scenarioId = text(result.scenarioId, 120);
  const placementSeedValue = text(result.placementSeed, 80);
  const placementSeed = placementSeedValue && SEED.test(placementSeedValue) ? placementSeedValue : null;
  if (!packagePin || !recipeHash || !object(profile) || !object(statistics)) {
    return { status: 'unavailable', reason: 'The Player Builder result has no complete public package, replay, or modeled-player receipt.' };
  }
  if (!scenarioId) {
    return { status: 'unavailable', reason: 'The Player Builder result needs a deterministic scenarioId bound to its recipe and placement.' };
  }
  if (scenarioId !== `forge-scenario-${recipeHash}`) {
    return { status: 'unavailable', reason: 'The Player Builder scenarioId does not match its recipe hash.' };
  }
  if (result.recipe?.placementSeed !== result.placementSeed) {
    return { status: 'unavailable', reason: 'The Player Builder placementSeed does not match its versioned recipe.' };
  }
  if (result.placementSeed && !placementSeed) {
    return { status: 'unavailable', reason: 'The Player Builder result has an invalid placementSeed.' };
  }
  const modeled = profile.status === 'modeled' && statistics.status !== 'unavailable';
  const simulationReady = result.validation?.simulationReady === true;
  const evidence = object(statistics.inputEvidence) ? sanitize(statistics.inputEvidence) : null;
  return {
    status: modeled && simulationReady ? 'ready' : modeled ? 'needs-resolution' : 'unavailable',
    kind: 'synthetic-player',
    modeled: true,
    eligibleForSimulation: simulationReady,
    modelVersion: text(result.modelVersion, 120),
    recipeHash,
    scenarioId,
    placementSeed,
    simulationSeed: null,
    package: packagePin,
    syntheticId: text(profile.syntheticId, 80),
    profile: {
      archetype: text(profile.archetype, 80),
      roleFamilies: Array.isArray(profile.roleFamilies) ? profile.roleFamilies.map(value => text(value, 40)).filter(Boolean) : [],
      skillVector: safeNumbers(profile.skillVector, ['scoring', 'shooting', 'creation', 'playmaking', 'rebounding', 'defensiveActivity', 'efficiency', 'workload']),
      qualities: Array.isArray(profile.qualities) ? profile.qualities.map(quality => ({
        component: text(quality?.component, 80), metric: text(quality?.metric, 80), value: finite(quality?.value) ? round(quality.value) : null,
        cohortPercentile: finite(quality?.cohortPercentile) ? round(quality.cohortPercentile) : null, band: text(quality?.band, 80),
      })) : [],
      tendencies: safeTendencies(profile.tendencies),
      roleFit: object(profile.roleFit) ? {
        status: text(profile.roleFit.status, 50), archetype: text(profile.roleFit.archetype, 80),
        roleFamilies: Array.isArray(profile.roleFit.roleFamilies) ? profile.roleFit.roleFamilies.map(value => text(value, 40)).filter(Boolean) : [],
        checks: Array.isArray(profile.roleFit.checks) ? profile.roleFit.checks.map(check => ({
          type: text(check?.type, 40), component: text(check?.component, 80), passed: check?.passed === true,
          value: finite(check?.value) ? round(check.value) : null, minimum: finite(check?.minimum) ? round(check.minimum) : null,
        })) : [],
      } : null,
      skillInteractions: Array.isArray(profile.skillInteractions) ? profile.skillInteractions.map(interaction => ({
        leftKey: text(interaction?.leftKey, 80), rightKey: text(interaction?.rightKey, 80),
        relationship: text(interaction?.relationship, 80), status: text(interaction?.status, 40),
        observedCorrelation: finite(interaction?.observedCorrelation) ? round(interaction.observedCorrelation) : null,
      })) : [],
    },
    statistics: {
      perGame: safeNumbers(statistics.perGame, ['points', 'assists', 'turnovers', 'rebounds', 'steals', 'blocks']),
      workload: safeNumbers(statistics.workload, ['games', 'minutesPerGame', 'minutes']),
      derived: safeNumbers(statistics.derived, ['assistToTurnover', 'stocksPerGame', 'stocksPer36', 'scoringPer36', 'creationToWorkload', 'efficiencySpread']),
      tendencies: safeTendencies(statistics.tendencies),
      uncertainty: object(statistics.uncertainty) ? {
        status: text(statistics.uncertainty.status, 40), method: text(statistics.uncertainty.method, 120),
        ranges: safeOutputRanges(statistics.uncertainty.ranges),
      } : null,
      inputEvidence: evidence,
    },
    restrictions: [
      'Synthetic statistics are modeled from named donors and cannot be relabeled as observed player rows.',
      'This handoff carries no claimed RAPM, chemistry effect, health model, contract, or historical lineup result.',
      'Output ranges describe selected-donor dispersion and bounded synthesis only; they are not calibrated prediction intervals.',
    ],
  };
}

/** Public boundary for browser adapters that need to persist a safe handoff. */
export function createSyntheticPlayerHandoff(result) {
  return Object.freeze(sanitize(publicSyntheticPlayer(result)));
}

function publicCareerPath(receipt) {
  if (!object(receipt)) return { status: 'unavailable', reason: 'No Career Simulator receipt was supplied.' };
  const packagePin = publicPackagePin(receipt.package || receipt.packageRef);
  const asOf = object(receipt.asOf) ? receipt.asOf : object(receipt.targetState) ? receipt.targetState : null;
  const seedValue = text(receipt.seed, 80);
  const seed = seedValue && SEED.test(seedValue) ? seedValue : null;
  const frozen = asOf?.frozen === true;
  const asOfSeasonStartYear = integer(asOf?.seasonStartYear) ? asOf.seasonStartYear
    : integer(asOf?.sourceSeasonStartYear) ? asOf.sourceSeasonStartYear : null;
  // A package and seed alone do not make a replayable career path. The
  // simulator's completed receipt must carry both bounded replay dimensions;
  // otherwise a downstream lab could mark a path ready while having no
  // declared horizon or repeat count to reproduce.
  const horizon = integer(receipt.horizon, 1, CAREER_MAX_HORIZON) ? receipt.horizon : null;
  const repeats = integer(receipt.repeats, CAREER_MIN_REPEATS, CAREER_MAX_REPEATS) ? receipt.repeats : null;
  const completedRepeats = integer(receipt.completedRepeats, repeats ?? 0, repeats ?? 0) ? receipt.completedRepeats : null;
  const cutoffInScope = asOfSeasonStartYear !== null
    && packagePin?.scope?.seasonStartYears.includes(asOfSeasonStartYear);
  if (!seed) {
    return { status: 'unavailable', reason: 'The Career Simulator receipt needs a deterministic replay seed using letters, numbers, colon, dot, underscore, or hyphen.' };
  }
  if (!packagePin || !asOf || !frozen || horizon === null || repeats === null || completedRepeats === null || !cutoffInScope) {
    return { status: 'unavailable', reason: 'The Career Simulator receipt needs a pinned package, a frozen as-of state, a deterministic replay seed, bounded horizon/repeats, and all repeats completed.' };
  }
  return {
    status: receipt.status === 'complete' || receipt.status === 'modeled' ? 'ready' : 'needs-resolution',
    kind: 'career-path',
    modeled: true,
    modelVersion: text(receipt.modelVersion, 120),
    seed,
    package: packagePin,
    asOf: {
      frozen: true,
      seasonStartYear: asOfSeasonStartYear,
      age: finite(asOf.age) ? round(asOf.age) : null,
      experience: integer(asOf.experience) ? asOf.experience : null,
      stage: text(asOf.stage, 80),
    },
    horizon,
    repeats,
    completedRepeats,
    restrictions: [
      'Observed history remains separate from modeled future paths.',
      'The path cannot supply hindsight, injury stories, coaching explanations, or an unpinned future season.',
    ],
  };
}

/** Public boundary for browser adapters that need to persist a safe handoff. */
export function createCareerPathHandoff(receipt) {
  return Object.freeze(sanitize(publicCareerPath(receipt)));
}

function seasonYears(report) {
  const setupYears = report?.setup?.horizon?.seasonStartYears;
  const resultYears = Array.isArray(report?.seasons)
    ? report.seasons.map(season => season?.seasonStartYear)
    : [];
  const values = (Array.isArray(setupYears) && setupYears.length ? setupYears : resultYears)
    .map(Number)
    .filter(year => integer(year) && year >= 1947 && year <= 2200);
  return [...new Set(values)].sort((left, right) => left - right);
}

function seasonPackagePin(raw, kind, year, years, acceptedPooledPackage = false) {
  if (!object(raw)) return null;
  const source = object(raw.packageRef) ? raw.packageRef : raw;
  const packageId = text(source.packageId, 160);
  const packageVersion = text(source.packageVersion, 160);
  if (!packageId || !packageVersion) return null;
  const declaredScope = normalizedScope(source.scope);
  const fallbackScope = kind === 'exact-season' && integer(year)
    ? { kind, seasonStartYears: [year], phases: ['regular'] }
    : kind === 'pooled-window' && years.length
      ? { kind, seasonStartYears: years, phases: ['regular'] }
      : null;
  const scope = declaredScope || fallbackScope;
  if (!scope || scope.kind !== kind || !scope.seasonStartYears.length) return null;
  if (kind === 'exact-season' && scope.seasonStartYears.length !== 1) return null;
  // A package pin is evidence for the report's declared seasons, not merely a
  // structurally valid package. Reject an exact pin for a different season
  // (and a pooled pin that does not contain every selected year) before the
  // handoff can be marked ready.
  const selectedYears = kind === 'exact-season' ? [year] : years;
  if (!selectedYears.length || selectedYears.some(selectedYear => !scope.seasonStartYears.includes(selectedYear))) return null;
  const accepted = source.acceptedPooledPackage === true || raw.acceptedPooledPackage === true || acceptedPooledPackage === true;
  if (kind === 'pooled-window' && !accepted) return null;
  return {
    packageId,
    packageVersion,
    packageManifestSha256: text(source.packageManifestSha256, 160),
    sourceLockSha256: text(source.sourceLockSha256, 160),
    projectionContentSha256: text(source.projectionContentSha256, 160),
    acceptedPooledPackage: accepted,
    scope,
    scopeSource: declaredScope ? 'package-proof' : 'season-setup-declaration',
  };
}

function seasonPackageInputs(source, explicitPackageRef, years) {
  const kind = text(source?.kind, 40);
  if (!SEASON_SOURCE_KINDS.has(kind) || kind === 'forecast-season') return [];
  const explicit = Array.isArray(explicitPackageRef)
    ? explicitPackageRef
    : Array.isArray(explicitPackageRef?.packageRefs)
      ? explicitPackageRef.packageRefs
      : explicitPackageRef
        ? [explicitPackageRef]
        : [];
  if (kind === 'pooled-window') {
    const raw = explicit[0] || source.packageRef || source;
    const pin = seasonPackagePin(raw, kind, years[0], years, source.acceptedPooledPackage === true);
    return pin ? [pin] : [];
  }
  const declared = Array.isArray(source.seasonPackages) ? source.seasonPackages : [];
  return years.map((year, index) => {
    const raw = explicit.find(item => Number(item?.seasonStartYear ?? item?.scope?.seasonStartYears?.[0]) === year)
      || declared.find(item => Number(item?.seasonStartYear ?? item?.scope?.seasonStartYears?.[0]) === year)
      || (years.length === 1 ? explicit[0] || source : null);
    return seasonPackagePin(raw, kind, year, years, false);
  }).filter(Boolean);
}

function publicSeasonSource(source, years, packagePins) {
  if (!SEASON_SOURCE_KINDS.has(source?.kind)) return null;
  if (source.kind === 'forecast-season') {
    const model = source.projectionModel;
    const manifest = source.forecastManifest;
    const validation = source.forecastValidation;
    const holdouts = Array.isArray(validation?.backtests) ? validation.backtests : [];
    const holdoutCount = integer(validation?.holdoutCount) ? validation.holdoutCount : null;
    const holdoutYears = holdouts.map(row => Number(row?.holdoutSeasonStartYear));
    const chronologicalHoldouts = holdoutYears.every((year, index) => Number.isInteger(year)
      && (index === 0 || year > holdoutYears[index - 1]));
    const targetSeasonStartYear = years.length === 1 ? years[0] : null;
    const forecastYears = Array.isArray(source.forecastSeasonStartYears)
      ? source.forecastSeasonStartYears.map(Number) : [];
    const projectionRefs = Array.isArray(source.projectionRefs) ? source.projectionRefs : [];
    const holdoutMetricNames = ['winProbability', 'teamWins', 'teamNetRating'];
    const holdoutMetricKinds = { winProbability: 'binary', teamWins: 'continuous', teamNetRating: 'continuous' };
    const holdoutMetricsValid = holdouts.map(row => Object.fromEntries(holdoutMetricNames.map(metric => [
      metric, validForecastMetric(row?.metrics?.[metric], holdoutMetricKinds[metric]),
    ])));
    const holdoutSamples = holdouts.map(row => Object.fromEntries(holdoutMetricNames.map(metric => [
      metric, integer(Number(row?.metrics?.[metric]?.sample), 1) ? Number(row.metrics[metric].sample) : null,
    ])));
    const holdoutReceipt = holdoutCount !== null && holdoutCount >= 2
      && holdouts.length === holdoutCount
      && new Set(holdoutYears).size === holdoutYears.length
      && chronologicalHoldouts
      && targetSeasonStartYear !== null
      && holdouts.every((row, index) => object(row) && row.status === 'complete'
        && integer(Number(row.holdoutSeasonStartYear), 1947, targetSeasonStartYear - 1)
        && integer(Number(row.trainedThroughSeasonStartYear), 1947, Number(row.holdoutSeasonStartYear) - 1)
        && canonicalUtcBeforeSeason(row.sourceCutoffUtc, Number(row.holdoutSeasonStartYear))
        && holdoutMetricNames.every(metric => holdoutMetricsValid[index][metric])
        && holdoutMetricNames.every(metric => holdoutSamples[index][metric] !== null));
    const expectedSamples = holdoutMetricNames.map(metric => holdoutSamples.reduce((sum, row) => sum + (row[metric] || 0), 0));
    const aggregateReceipt = object(validation?.aggregate)
      && holdoutMetricNames.every((key, index) => validForecastMetric(validation.aggregate[key], holdoutMetricKinds[key])
        && integer(Number(validation.aggregate[key]?.sample), 1)
        && Number(validation.aggregate[key].sample) === expectedSamples[index]);
    const aggregateReconciles = holdoutReceipt && aggregateReceipt
      && forecastAggregateReconciles(validation.aggregate, holdouts);
    const expectedQualityStatus = aggregateReceipt ? forecastQualityStatus(validation.aggregate) : null;
    const manifestId = text(manifest?.manifestId, 160);
    const modelArtifactSha256 = sha256(model?.artifactSha256);
    const manifestSha256 = sha256(manifest?.contentSha256);
    const ledgerSha256 = sha256(manifest?.backtestLedgerSha256);
    const validationLedgerSha256 = sha256(validation?.ledgerSha256);
    const projectionRefMatches = projectionRefs.length === 1
      && projectionRefs[0]?.id === manifestId
      && projectionRefs[0]?.hash === manifestSha256;
    const accepted = source.forecastEvidence === true && source.acceptedForecastManifest === true
      && model?.status === 'accepted' && text(model.modelId, 120) && text(model.version, 120)
      && text(model.artifactSha256, 160)
      && targetSeasonStartYear !== null && forecastYears.length === years.length
      && forecastYears.every((year, index) => year === years[index])
      && integer(Number(manifest?.seasonStartYear)) && Number(manifest.seasonStartYear) === targetSeasonStartYear
      && manifestId && manifestSha256 && ledgerSha256 && validationLedgerSha256 === ledgerSha256
      && sha256(manifest?.modelArtifactSha256) === modelArtifactSha256
      && projectionRefMatches && validation?.holdoutPolicy === FORECAST_HOLDOUT_POLICY
      && validation?.issuancePolicy === FORECAST_ISSUANCE_POLICY
      && ['improved-versus-declared-baselines', 'mixed-versus-declared-baselines', 'not-improved-versus-declared-baselines'].includes(validation?.quality?.status)
      && validation?.quality?.status === expectedQualityStatus
      && holdoutReceipt && aggregateReceipt && aggregateReconciles
      && integer(Number(validation.completedThroughSeasonStartYear), 1947, targetSeasonStartYear - 1)
      && holdoutYears.length > 0
      && Number(validation.completedThroughSeasonStartYear) === holdoutYears.at(-1);
    const validationView = accepted ? {
      status: text(validation.status, 40),
      ledgerSha256: validationLedgerSha256,
      holdoutPolicy: text(validation.holdoutPolicy, 120),
      issuancePolicy: text(validation.issuancePolicy, 120),
      holdoutCount,
      completedThroughSeasonStartYear: Number(validation.completedThroughSeasonStartYear),
      holdouts: holdouts.map(row => ({
        holdoutSeasonStartYear: Number(row.holdoutSeasonStartYear),
        trainedThroughSeasonStartYear: Number(row.trainedThroughSeasonStartYear),
        sourceCutoffUtc: text(row.sourceCutoffUtc, 40),
        status: text(row.status, 40),
        metrics: Object.fromEntries(holdoutMetricNames.map(metric => [
          metric, publicForecastMetric(row.metrics?.[metric], holdoutMetricKinds[metric]),
        ])),
      })),
      aggregate: Object.fromEntries(holdoutMetricNames.map(metric => [
        metric, publicForecastMetric(validation.aggregate[metric], holdoutMetricKinds[metric]),
      ])),
      quality: {
        status: text(validation.quality?.status, 80),
        note: text(validation.quality?.note, 320),
        intervalCalibration: Object.fromEntries(['teamWins', 'teamNetRating'].map(metric => [
          metric, forecastIntervalCalibration(validation.aggregate[metric]),
        ])),
      },
    } : null;
    return {
      kind: source.kind,
      seasonStartYears: years,
      forecast: accepted ? {
        modelId: text(model.modelId, 120),
        version: text(model.version, 120),
        artifactSha256: modelArtifactSha256,
        manifestId,
        manifestSha256,
        validationStatus: text(source.forecastValidation?.status, 40),
        holdoutCount,
        validation: validationView,
      } : null,
    };
  }
  return {
    kind: source.kind,
    seasonStartYears: years,
    packageCount: packagePins.length,
    accepted: source.kind === 'pooled-window' ? source.acceptedPooledPackage === true : source.exactSeasonEvidence === true,
  };
}

function publicSeasonStanding(row) {
  if (!object(row)) return null;
  const team = text(row.displayTeam || row.team || row.name, 160);
  if (!team) return null;
  return {
    team,
    teamId: text(row.teamId || row.id, 80),
    conference: text(row.conference, 20),
    division: text(row.division, 40),
    wins: integer(Number(row.wins), 0, 300) ? Number(row.wins) : null,
    losses: integer(Number(row.losses), 0, 300) ? Number(row.losses) : null,
    ties: integer(Number(row.ties), 0, 300) ? Number(row.ties) : null,
    winRate: finite(row.winRate) ? round(row.winRate) : null,
    seed: integer(Number(row.seed), 1, 64) ? Number(row.seed) : null,
    expectedWins: finite(row.expectedWins) ? round(row.expectedWins) : null,
    expectedWinProbabilityCoverage: publicExpectedWinProbabilityCoverage(row.expectedWinProbabilityCoverage),
    pointDifferential: finite(row.pointDifferential) ? round(row.pointDifferential) : null,
    scheduleStrength: object(row.scheduleStrength) ? sanitize(row.scheduleStrength) : null,
    nativeMetrics: object(row.nativeMetrics) ? sanitize(row.nativeMetrics) : null,
  };
}

function publicSeasonDistribution(row) {
  if (!object(row)) return null;
  const team = text(row.team || row.displayTeam, 160);
  if (!team) return null;
  const seasonStartYear = integer(Number(row.seasonStartYear), 1947, 2200) ? Number(row.seasonStartYear) : null;
  return {
    team,
    teamId: text(row.teamId, 80),
    ...(seasonStartYear === null ? {} : { seasonStartYear }),
    averageWins: finite(row.averageWins) ? round(row.averageWins) : null,
    averageWinRate: finite(row.averageWinRate) ? round(row.averageWinRate) : null,
    averageExpectedWins: finite(row.averageExpectedWins) ? round(row.averageExpectedWins) : null,
    expectedWinsCoverage: publicExpectedWinsRepeatCoverage(row.expectedWinsCoverage),
    expectedWinProbabilityCoverage: publicExpectedWinProbabilityCoverage(row.expectedWinProbabilityCoverage),
    winQuantiles: object(row.winQuantiles) ? sanitize(row.winQuantiles) : null,
    pointDifferentialQuantiles: object(row.pointDifferentialQuantiles) ? sanitize(row.pointDifferentialQuantiles) : null,
    playoffAppearanceRate: finite(row.playoffAppearanceRate) ? round(row.playoffAppearanceRate) : null,
    titleRate: finite(row.titleRate) ? round(row.titleRate) : null,
  };
}

function publicExpectedWinProbabilityCoverage(value) {
  if (!object(value)) return {
    status: 'unverified', eligibleGames: null, availableGames: null,
    reason: 'source-model-did-not-report-expected-win-probability-coverage',
  };
  const rawEligibleGames = value.eligibleGames ?? value.standingsGames;
  const eligibleGames = Number.isSafeInteger(rawEligibleGames) && rawEligibleGames >= 0
    && rawEligibleGames <= MAX_REPEATED_ELIGIBLE_GAMES ? rawEligibleGames : null;
  const rawAvailableGames = value.availableGames;
  const availableGames = Number.isSafeInteger(rawAvailableGames) && rawAvailableGames >= 0
    && rawAvailableGames <= MAX_REPEATED_ELIGIBLE_GAMES ? rawAvailableGames : null;
  const status = text(value.status, 24);
  if (!EXPECTED_WIN_COVERAGE_STATUSES.has(status) || eligibleGames === null || availableGames === null
    || availableGames > eligibleGames) return {
    status: 'unverified', eligibleGames, availableGames: null,
    reason: 'source-provided-expected-win-probability-coverage-is-invalid',
  };
  const countsMatchStatus = status === 'available'
    ? eligibleGames > 0 && availableGames === eligibleGames
    : status === 'partial'
      ? eligibleGames > 0 && availableGames > 0 && availableGames < eligibleGames
      : status === 'unavailable'
        ? availableGames === 0
        : true;
  if (!countsMatchStatus) return {
    status: 'unverified', eligibleGames, availableGames,
    reason: 'source-provided-expected-win-probability-coverage-is-inconsistent',
  };
  return {
    status,
    eligibleGames,
    availableGames,
    reason: status === 'available' ? null : text(value.reason, 200)
      || 'expected-win-probability-coverage-is-incomplete',
  };
}

function publicExpectedWinsRepeatCoverage(value) {
  if (!object(value)) return {
    status: 'unverified', availableRepeats: null, totalRepeats: null,
    reason: 'source-model-did-not-report-expected-wins-repeat-coverage',
  };
  const availableRepeats = Number.isSafeInteger(value.availableRepeats) && value.availableRepeats >= 0
    && value.availableRepeats <= 100_000 ? value.availableRepeats : null;
  const totalRepeats = Number.isSafeInteger(value.totalRepeats) && value.totalRepeats >= 1
    && value.totalRepeats <= 100_000 ? value.totalRepeats : null;
  const status = text(value.status, 24);
  if (!EXPECTED_WIN_COVERAGE_STATUSES.has(status) || availableRepeats === null || totalRepeats === null
    || availableRepeats > totalRepeats) return {
    status: 'unverified', availableRepeats, totalRepeats,
    reason: 'source-provided-expected-wins-repeat-coverage-is-invalid',
  };
  const countsMatchStatus = status === 'available'
    ? availableRepeats === totalRepeats
    : status === 'partial'
      ? availableRepeats > 0 && availableRepeats < totalRepeats
      : status === 'unavailable'
        ? availableRepeats === 0
        : true;
  if (!countsMatchStatus) return {
    status: 'unverified', availableRepeats, totalRepeats,
    reason: 'source-provided-expected-wins-repeat-coverage-is-inconsistent',
  };
  return {
    status,
    availableRepeats,
    totalRepeats,
    reason: status === 'available' ? null : text(value.reason, 200)
      || 'expected-wins-are-unavailable-for-one-or-more-repeats',
  };
}

/**
 * Convert a completed Season Lab report into a bounded cross-lab input. The
 * handoff carries package/source proof, replay identity, and aggregate
 * scenario summaries; it intentionally excludes player identities and raw
 * simulated ledgers. A consumer must keep this modeled lane separate from
 * observed package rows unless an accepted bridge model says otherwise.
 */
export function createSeasonLabHandoff({ report, packageRef = null } = {}) {
  if (!object(report)) return { version: CROSS_LAB_INTEGRATION_VERSION, status: 'unavailable', reason: 'No Season Lab report was supplied.' };
  const source = report.setup?.source;
  const years = seasonYears(report);
  const seed = text(report.seed || report.setup?.seed, 80);
  const sourceKind = text(source?.kind, 40);
  const packagePins = seasonPackageInputs(source, packageRef, years);
  const sourceView = publicSeasonSource(source, years, packagePins);
  const rawResultYears = Array.isArray(report.seasons)
    ? report.seasons.map(season => Number(season?.seasonStartYear)).filter(year => integer(year, 1947, 2200))
    : [];
  const resultYears = [...new Set(rawResultYears)].sort((left, right) => left - right);
  const reportSeasonScopeMatches = !Array.isArray(report.seasons) || report.seasons.length === 0
    || rawResultYears.length === report.seasons.length
      && resultYears.length === years.length
      && resultYears.every((year, index) => year === years[index]);
  const complete = report.status === 'complete' && years.length > 0 && reportSeasonScopeMatches
    && SEED.test(seed || '') && integer(report.repeatCount, 1, 100000);
  const sourceAccepted = sourceView?.kind === 'forecast-season'
    ? Boolean(sourceView.forecast?.validationStatus === 'validated'
      && sourceView.forecast?.holdoutCount >= 2
      && sourceView.forecast.manifestId && sourceView.forecast.manifestSha256)
    : Boolean(sourceView?.accepted && packagePins.length && (sourceView.kind === 'pooled-window' || packagePins.length === years.length));
  const status = complete && sourceAccepted ? 'ready' : complete ? 'needs-resolution' : 'unavailable';
  const seasonRows = Array.isArray(report.seasons) ? report.seasons.map(season => ({
    seasonStartYear: integer(Number(season?.seasonStartYear)) ? Number(season.seasonStartYear) : null,
    gamesPerTeam: integer(Number(season?.gamesPerTeam), 0, 300) ? Number(season.gamesPerTeam) : null,
    scenario: season?.scenario === true,
    champion: text(season?.champion || season?.championName, 160),
  })).filter(row => row.seasonStartYear != null) : [];
  const standings = (Array.isArray(report.standings) ? report.standings : []).map(publicSeasonStanding).filter(Boolean);
  // Multi-season simulation reports retain each season's repeated runs under
  // seasons[*].repeatedRuns, while the legacy top-level field is a summary of
  // only the first season. Prefer the season-scoped receipts so a handoff does
  // not silently present one season as the distribution for every season.
  const seasonDistributionSources = [];
  if (Array.isArray(report.seasons)) {
    report.seasons.forEach(season => {
      if (!Array.isArray(season?.repeatedRuns)) return;
      const seasonStartYear = Number(season.seasonStartYear);
      season.repeatedRuns.forEach(row => seasonDistributionSources.push({
        row,
        seasonStartYear: integer(seasonStartYear, 1947, 2200) ? seasonStartYear : null,
      }));
    });
  }
  const distributionSources = seasonDistributionSources.length
    ? seasonDistributionSources
    : (Array.isArray(report.repeatedRunDistributions) ? report.repeatedRunDistributions : [])
      .map(row => ({
        row,
        // A legacy top-level summary is unambiguous only for a single-season
        // report. Multi-season rows without their own season pin must not be
        // presented as if they covered every declared season.
        seasonStartYear: integer(Number(row?.seasonStartYear), 1947, 2200)
          ? Number(row.seasonStartYear)
          : row?.seasonStartYear == null && years.length === 1 ? years[0] : null,
      }));
  const distributions = distributionSources.map(({ row, seasonStartYear }) => publicSeasonDistribution({
    ...row,
    ...(integer(seasonStartYear, 1947, 2200) ? { seasonStartYear } : {}),
  })).filter(row => row && integer(Number(row.seasonStartYear), 1947, 2200)
    && years.includes(Number(row.seasonStartYear)));
  const reason = !complete
    ? 'Season Lab must provide a completed deterministic report before it can be handed to another lab.'
    : !sourceAccepted
      ? 'Season Lab source proof is incomplete. Supply explicit exact package pins, an accepted pooled package, or a validated forecast manifest.'
      : null;
  const scopeSignature = sourceView?.kind === 'forecast-season'
    ? ['forecast-season', years.join(','), sourceView.forecast?.modelId || '', sourceView.forecast?.version || ''].join('|')
    : packagePins.map(packageScopeSignature).filter(Boolean).sort().join('||') || null;
  return Object.freeze(sanitize({
    version: CROSS_LAB_INTEGRATION_VERSION,
    status,
    kind: 'season-lab-scenario',
    modeled: true,
    modelVersion: text(report.modelVersion, 120),
    source: sourceView,
    package: packagePins.length === 1 ? packagePins[0] : null,
    packages: packagePins,
    scopeSignature,
    seed,
    repeatCount: integer(report.repeatCount, 1, 100000) ? report.repeatCount : null,
    scenario: report.scenario === true || seasonRows.some(row => row.scenario),
    seasons: seasonRows,
    standings,
    repeatedRunDistributions: distributions,
    uncertainty: object(report.uncertainty) ? sanitize(report.uncertainty) : null,
    assumptions: Array.isArray(report.assumptions) ? report.assumptions.map(value => text(value, 320)).filter(Boolean).slice(0, 40) : [],
    blockers: reason ? [reason] : [],
    restrictions: [
      'Season Lab standings, records, player allocations, and playoff outcomes are conditional modeled results, not observed historical facts.',
      'A short, custom, forecast, or multi-season run remains a scenario even when its package evidence is exact or pooled.',
      'This handoff carries no raw player IDs, injury story, transaction story, coaching explanation, or hidden future information.',
      'Cross-lab consumers may display this scenario beside observed or synthetic evidence, but may not numerically fuse it without an accepted bridge model.',
    ],
  }));
}

function publicPairMetric(row, key) {
  const metric = row?.metrics?.[key];
  if (!object(metric) || !['available', 'observed', 'limited_sample'].includes(metric.status) || !finite(metric.value)) return null;
  return { value: round(metric.value), unit: text(metric.unit, 80), status: metric.status, denominator: finite(metric.denominator) ? round(metric.denominator) : null };
}

function publicPairPlayer(row) {
  const displayName = text(row?.displayName, 160);
  const teamCode = text(row?.teamCode, 8);
  if (!displayName || !TEAM_CODE.test(teamCode || '') || !integer(Number(row?.seasonStartYear)) || row?.phase !== 'regular' || row?.observed !== true) return null;
  return {
    displayName,
    teamCode,
    seasonStartYear: Number(row.seasonStartYear),
    positions: Array.isArray(row.positions) ? row.positions.map(value => text(value, 12)).filter(Boolean).slice(0, 8) : [],
    games: integer(Number(row.games)) && Number(row.games) > 0 ? Number(row.games) : null,
    minutes: finite(Number(row.minutes)) && Number(row.minutes) > 0 ? round(Number(row.minutes)) : null,
    metrics: Object.fromEntries(SAFE_PAIR_METRICS.map(key => [key, publicPairMetric(row, key)]).filter(([, value]) => value !== null)),
  };
}

/**
 * Make an observed same-team Pair Profile available to a later consumer. It
 * deliberately conveys comparison context only; it never manufactures a
 * shared-floor chemistry score or a player identity handle.
 */
export function createObservedPairHandoff({ packageRef, first, second } = {}) {
  const packagePin = publicPackagePin(packageRef);
  const firstPlayer = publicPairPlayer(first);
  const secondPlayer = publicPairPlayer(second);
  if (!packagePin || packagePin.scope.kind !== 'exact-season' || !packagePin.scope.phases.includes('regular') || !firstPlayer || !secondPlayer) {
    return { version: CROSS_LAB_INTEGRATION_VERSION, status: 'unavailable', reason: 'A Pair Profile handoff needs one exact regular-season package and two observed regular-season rows.' };
  }
  if (firstPlayer.teamCode !== secondPlayer.teamCode || firstPlayer.seasonStartYear !== secondPlayer.seasonStartYear
    || firstPlayer.seasonStartYear !== packagePin.scope.seasonStartYears[0] || firstPlayer.displayName === secondPlayer.displayName) {
    return { version: CROSS_LAB_INTEGRATION_VERSION, status: 'unavailable', reason: 'Pair Profile handoff players must be two different rows from the selected exact team-season.' };
  }
  return Object.freeze({
    version: CROSS_LAB_INTEGRATION_VERSION,
    status: 'ready',
    kind: 'observed-pair-profile',
    modeled: false,
    package: packagePin,
    teamCode: firstPlayer.teamCode,
    seasonStartYear: firstPlayer.seasonStartYear,
    players: [firstPlayer, secondPlayer],
    restrictions: [
      'This is a side-by-side observed player-season comparison, not a shared-floor chemistry result.',
      'A consumer may show role context but may not turn this handoff into a chemistry, lineup, or impact estimate without accepted supporting evidence.',
    ],
  });
}

function scopeCompatibility(inputs) {
  const pins = inputs.flatMap(input => {
    const own = input.package ? [input.package] : [];
    const many = Array.isArray(input.packages) ? input.packages : [];
    return own.concat(many).filter(Boolean);
  });
  // Forecast Season Lab output has no native package pin by design. Keep its
  // explicit forecast scope in the compatibility check so a package-backed
  // Player Builder/Career handoff cannot accidentally make a forecast lane
  // look directly mergeable merely because it is the only pin present.
  const scopeSignatures = inputs.flatMap(input => {
    const explicit = text(input?.scopeSignature, 320);
    if (explicit) return [explicit];
    const own = input?.package ? [input.package] : [];
    const many = Array.isArray(input?.packages) ? input.packages : [];
    return own.concat(many).map(packageScopeSignature).filter(Boolean);
  });
  const uniqueScopes = [...new Set(scopeSignatures)];
  if (!pins.length) return { status: 'unavailable', directMergeAllowed: false, packageSignatures: [], scopeSignatures: uniqueScopes };
  const signatures = [...new Set(pins.map(packageScopeSignature).filter(Boolean))];
  const laneSignatures = [...new Set(inputs.map(input => {
    if (!input?.kind) return null;
    return `${input.modeled === true ? 'modeled' : 'observed'}:${input.kind}`;
  }).filter(Boolean))];
  if (signatures.length === 1 && uniqueScopes.length === 1 && laneSignatures.length === 1) {
    return { status: 'shared-package-scope', directMergeAllowed: true, packageSignatures: signatures,
      scopeSignatures: uniqueScopes, evidenceLaneSignatures: laneSignatures };
  }
  return { status: 'separate-evidence-lanes', directMergeAllowed: false, packageSignatures: signatures,
    scopeSignatures: uniqueScopes, evidenceLaneSignatures: laneSignatures,
    note: 'The source packages, forecast scopes, or evidence lanes differ. A consumer can display the lanes together, but may not numerically fuse them without an explicit accepted bridge model.' };
}

/**
 * Build a capability-gated integration plan. This is a framework only: it
 * declares safe handoffs and the exact gates a future Chemistry, Career, or
 * Season consumer must satisfy before it runs. It does not execute a model.
 */
export function createCrossLabIntegrationPlan({
  target,
  seed,
  compositeResult = null,
  careerReceipt = null,
  pairHandoff = null,
  seasonHandoff = null,
  capabilities = {},
} = {}) {
  if (!CROSS_LAB_TARGETS.includes(target)) throw new Error('Choose a supported cross-lab integration target.');
  if (!text(seed, 80) || !SEED.test(seed)) throw new Error('Cross-lab integration needs an explicit deterministic seed.');
  const composite = publicSyntheticPlayer(compositeResult);
  const career = publicCareerPath(careerReceipt);
  const pair = object(pairHandoff) && pairHandoff.kind === 'observed-pair-profile' ? sanitize(pairHandoff) : { status: 'unavailable', reason: 'No observed Pair Profile handoff was supplied.' };
  const season = object(seasonHandoff) && seasonHandoff.kind === 'season-lab-scenario' ? sanitize(seasonHandoff) : { status: 'unavailable', reason: 'No Season Lab scenario handoff was supplied.' };
  const inputs = [composite, career, pair, season].filter(input => input.status !== 'unavailable');
  const requirements = TARGET_CAPABILITIES[target];
  const missingCapabilities = requirements.filter(key => !capabilityAvailable(capabilities, key));
  const compatibility = scopeCompatibility(inputs);
  const blockers = [];
  if (!inputs.length) blockers.push('No usable Player Builder, Career Simulator, or Pair Profile handoff was supplied.');
  if (target === 'chemistry' && pair.status === 'unavailable' && composite.status === 'unavailable') {
    blockers.push('Chemistry integration needs an observed Pair Profile or a simulation-eligible synthetic player handoff.');
  }
  if (target === 'career' && career.status === 'unavailable' && composite.status === 'unavailable') {
    blockers.push('Career integration needs a frozen Career Simulator receipt or a simulation-eligible synthetic player handoff.');
  }
  if (target === 'season' && season.status === 'unavailable' && composite.status === 'unavailable') {
    blockers.push('Season integration needs a completed Season Lab scenario or a simulation-eligible synthetic player handoff.');
  }
  if (composite.status === 'needs-resolution') blockers.push('The Player Builder recipe is not yet eligible for a downstream simulation.');
  if (career.status === 'needs-resolution') blockers.push('The Career Simulator receipt is not complete.');
  if (season.status === 'needs-resolution') blockers.push('The Season Lab scenario is not complete or its package/forecast proof is unresolved.');
  if (missingCapabilities.length) blockers.push(`Target is missing accepted capability: ${missingCapabilities.join(', ')}.`);
  if (compatibility.status === 'separate-evidence-lanes') blockers.push('The selected inputs use separate evidence lanes and cannot be numerically fused.');
  const status = blockers.length ? 'unavailable' : 'ready';
  return Object.freeze(sanitize({
    version: CROSS_LAB_INTEGRATION_VERSION,
    status,
    target,
    seed,
    requirements,
    missingCapabilities,
    compatibility,
     inputs: { composite, career, pair, season },
    blockers,
    note: status === 'ready'
      ? 'The target may consume these explicitly labeled handoffs. Observed rows, synthetic player output, and modeled career paths remain separate evidence layers.'
      : 'This plan is a truthful unavailable state until its source, scope, and capability gates are satisfied.',
  }));
}

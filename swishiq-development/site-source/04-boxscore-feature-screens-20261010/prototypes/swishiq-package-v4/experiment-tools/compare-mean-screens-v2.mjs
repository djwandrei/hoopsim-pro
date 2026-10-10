import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import {
  hash,
  pin,
  loadPinnedJson,
  loadPinnedJsonl,
  readJson,
  writeJson,
  pinModuleClosure,
  verifyManifest,
  withArtifactCache,
} from './lib/artifacts.mjs';
import { meanSettings, validateMeanConfiguration } from './lib/configuration.mjs';
import { createResamplingPlan, applyResamplingPlan } from './lib/resampling-plan.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';

export const CROSS_MEAN_COMPARISON_FORMAT = 'swishiq-cross-mean-screen-comparison-v1';
export const CROSS_MEAN_PLAN_FORMAT = 'swishiq-cross-mean-screen-comparison-plan-v1';

const toolsRoot = import.meta.dirname;
const runsRoot = path.resolve(toolsRoot, 'runs');
const CACHE_ROOT = path.join(runsRoot, 'cache', 'cross-mean-comparison');
const DEFAULT_OUTPUT_ROOT = path.join(runsRoot, 'cross-mean-comparisons');
const REQUIRED_STAGE_FILES = ['scored-rows.jsonl', 'forecast-ledger.jsonl', 'losses.json.gz', 'metrics.json'];
const SIDES = ['home', 'away', 'margin'];

function fail(message) {
  throw new TypeError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number`);
  return value;
}

function safeId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)) {
    fail(`${label} must be a safe non-empty identifier`);
  }
  return value;
}

function assertPinEqual(actual, expected, label) {
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    if (actual !== expected) fail(`${label} does not match its recorded byte/hash pin`);
    return;
  }
  if (!isRecord(actual) || !isRecord(expected) || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    fail(`${label} does not match its recorded byte/hash pin`);
  }
}

function assertPathWithin(root, location, label) {
  const relative = path.relative(root, location);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${label} escapes its permitted directory`);
}

function resolvePinnedPath(baseDirectory, pinDescriptor, label) {
  if (!isRecord(pinDescriptor) || typeof pinDescriptor.path !== 'string' || !pinDescriptor.path.length
    || !Number.isSafeInteger(pinDescriptor.bytes) || typeof pinDescriptor.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/i.test(pinDescriptor.sha256)) fail(`${label} is not a valid file pin`);
  const file = path.isAbsolute(pinDescriptor.path) ? path.resolve(pinDescriptor.path) : path.resolve(baseDirectory, pinDescriptor.path);
  assertPinEqual(pin(file), pinDescriptor, label);
  return file;
}

function assertTargetSeasonContract(index, expectedCoverage, label) {
  if (!Array.isArray(index.targetSeasonStartYears) || !index.targetSeasonStartYears.length
    || index.targetSeasonStartYears.some((year, at) => !Number.isSafeInteger(year) || at > 0 && year <= index.targetSeasonStartYears[at - 1])) {
    fail(`${label} needs ascending unique target seasons`);
  }
  if (!isRecord(index.chronology) || typeof index.chronology.targetIdentitySha256 !== 'string'
    || !/^[a-f0-9]{64}$/i.test(index.chronology.targetIdentitySha256)) fail(`${label} needs an ordered target identity hash`);
  if (!Number.isSafeInteger(index.expectedTargets) || index.expectedTargets < 1) fail(`${label} needs a positive target count`);
  if (hash(index.targetSeasonStartYears) !== hash(expectedCoverage.targetSeasonStartYears)
    || index.expectedTargets !== expectedCoverage.expectedTargets) fail(`${label} does not match the plan's declared target coverage`);
  const declared = expectedCoverage.perSeason;
  const summary = index.results;
  if (!isRecord(declared) || !summary.length) fail('Plan needs a per-season coverage contract');
  const declaredYears = Object.keys(declared).sort((left, right) => Number(left) - Number(right));
  if (hash(declaredYears.map(Number)) !== hash(index.targetSeasonStartYears)) fail('Plan per-season coverage years do not match its target seasons');
  let total = 0;
  for (const year of declaredYears) {
    const count = declared[year];
    if (!Number.isSafeInteger(count) || count < 1) fail(`Plan coverage for season ${year} must be a positive integer`);
    total += count;
  }
  if (total !== expectedCoverage.expectedTargets) fail('Plan per-season coverage does not sum to its declared target count');
}

function assertScreenIndex(index, expectedCoverage, label) {
  if (!isRecord(index) || index.format !== 'swishiq-batched-uncertainty-screen-v1'
    || index.status !== 'opened-label-screen-only; not-independent-validation' || !Array.isArray(index.results) || !index.results.length) {
    fail(`${label} is not a supported full screen index`);
  }
  assertTargetSeasonContract(index, expectedCoverage, label);
}

function verifyReceiptFiles(directory, receipt, label) {
  if (!Array.isArray(receipt.files) || !receipt.files.length) fail(`${label} cache receipt has no output pins`);
  const verified = new Map();
  for (const descriptor of receipt.files) {
    if (!isRecord(descriptor) || typeof descriptor.path !== 'string' || !descriptor.path.length
      || !Number.isSafeInteger(descriptor.bytes) || typeof descriptor.sha256 !== 'string') fail(`${label} contains an invalid output pin`);
    const output = path.resolve(directory, descriptor.path);
    assertPathWithin(directory, output, `${label} output ${descriptor.path}`);
    assertPinEqual(pin(output), descriptor, `${label} output ${descriptor.path}`);
    verified.set(descriptor.path.replaceAll('\\', '/'), pin(output));
  }
  for (const required of REQUIRED_STAGE_FILES) if (!verified.has(required)) fail(`${label} full receipt is missing ${required}`);
  return verified;
}

function selectedForecastRows(forecasts, index, expectedCoverage, label) {
  const years = new Set(index.targetSeasonStartYears);
  const rows = forecasts.filter(row => years.has(row.seasonStartYear));
  if (rows.length !== index.expectedTargets) fail(`${label} forecast input has incomplete target coverage`);
  const seen = new Set();
  let previous = null;
  const identities = [];
  const targetRecords = [];
  rows.forEach((row, rowIndex) => {
    if (!isRecord(row) || typeof row.gameRef !== 'string' || !row.gameRef.trim()
      || typeof row.gameDateLocal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.gameDateLocal)
      || !Number.isSafeInteger(row.seasonStartYear) || !years.has(row.seasonStartYear)) fail(`${label} has an invalid target identity at row ${rowIndex}`);
    const dateMs = Date.parse(`${row.gameDateLocal}T00:00:00.000Z`);
    if (!Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== row.gameDateLocal) fail(`${label} has an invalid local date at row ${rowIndex}`);
    if (seen.has(row.gameRef)) fail(`${label} has duplicate gameRef ${row.gameRef}`);
    seen.add(row.gameRef);
    if (previous && (previous.gameDateLocal > row.gameDateLocal
      || previous.gameDateLocal === row.gameDateLocal && previous.gameRef.localeCompare(row.gameRef) > 0)) {
      fail(`${label} is not in canonical date/gameRef order`);
    }
    previous = row;
    const validTeam = value => typeof value === 'string' && value.trim().length > 0 || Number.isSafeInteger(value);
    if (!validTeam(row.homeTeamRef) || !validTeam(row.awayTeamRef) || row.homeTeamRef === row.awayTeamRef) {
      fail(`${label} needs distinct home and away team references at ${row.gameRef}`);
    }
    const target = row.target;
    if (!isRecord(target)) fail(`${label} is missing target labels for ${row.gameRef}`);
    const homeScore = finite(target.homeScore, `${label}.${row.gameRef}.target.homeScore`);
    const awayScore = finite(target.awayScore, `${label}.${row.gameRef}.target.awayScore`);
    const total = finite(target.total, `${label}.${row.gameRef}.target.total`);
    const margin = finite(target.margin, `${label}.${row.gameRef}.target.margin`);
    if (homeScore < 0 || awayScore < 0 || homeScore === awayScore || total !== homeScore + awayScore || margin !== homeScore - awayScore) {
      fail(`${label} has incoherent target labels for ${row.gameRef}`);
    }
    identities.push([row.gameRef, row.gameDateLocal, row.seasonStartYear]);
    targetRecords.push({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear,
      homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, target: { homeScore, awayScore, total, margin } });
  });
  if (hash(identities) !== index.chronology.targetIdentitySha256) fail(`${label} ordered targets do not match the screen index`);
  const seasonCounts = Object.fromEntries(index.targetSeasonStartYears.map(year => [String(year), 0]));
  rows.forEach(row => { seasonCounts[String(row.seasonStartYear)] += 1; });
  for (const year of index.targetSeasonStartYears) {
    if (seasonCounts[String(year)] !== expectedCoverage.perSeason[String(year)]) {
      fail(`${label} per-season rows disagree with the plan coverage for ${year}`);
    }
  }
  return { rows, identities, targetRecords, seasonCounts };
}

function compareScoredRows(rows, expected, label) {
  if (rows.length !== expected.length) fail(`${label} scored rows are incomplete`);
  rows.forEach((row, index) => {
    const target = expected[index];
    if (!isRecord(row) || row.gameRef !== target.gameRef || row.gameDateLocal !== target.gameDateLocal
      || row.seasonStartYear !== target.seasonStartYear || typeof row.probability !== 'number'
      || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1
      || row.homeWin !== Number(target.target.margin > 0) || !isRecord(row.sides)) {
      fail(`${label} scored row identity or outcome does not match the pinned forecast input at row ${index}`);
    }
    for (const side of SIDES) {
      const values = row.sides[side];
      if (!isRecord(values) || !Number.isFinite(values.error) || !Number.isFinite(values.crps)
        || !Number.isFinite(values.equalWeightIntervalScore)) fail(`${label} scored row has incomplete ${side} distribution scores at row ${index}`);
    }
  });
}

function validateLossRows(rows, expected, scored, label) {
  if (rows.length !== expected.length) fail(`${label} compact loss rows are incomplete`);
  rows.forEach((row, index) => {
    const source = expected[index], score = scored[index];
    if (!isRecord(row) || row.gameRef !== source.gameRef || row.gameDateLocal !== source.gameDateLocal
      || row.seasonStartYear !== source.seasonStartYear || row.homeTeamRef !== source.homeTeamRef
      || row.awayTeamRef !== source.awayTeamRef || row.homeWin !== Number(source.target.margin > 0)
      || row.homeWin !== score.homeWin || row.probability !== score.probability) {
      fail(`${label} compact loss identity/labels do not match the pinned forecast input at row ${index}`);
    }
    const p = Math.min(1 - 1e-12, Math.max(1e-12, row.probability));
    const brier = (row.probability - row.homeWin) ** 2;
    const logLoss = -(row.homeWin * Math.log(p) + (1 - row.homeWin) * Math.log(1 - p));
    if (!Number.isFinite(row.brier) || !Number.isFinite(row.logLoss) || !Number.isFinite(row.marginAbsoluteError)
      || row.brier !== brier || row.logLoss !== logLoss
      || row.marginAbsoluteError !== Math.abs(score.sides.margin.error)) fail(`${label} loss values do not match their scored rows at row ${index}`);
    if (!isRecord(row.sides)) fail(`${label} distribution losses are missing at row ${index}`);
    for (const side of SIDES) {
      if (!isRecord(row.sides[side]) || row.sides[side].error !== score.sides[side].error
        || !Number.isFinite(row.sides[side].crps) || !Number.isFinite(row.sides[side].intervalScore)) {
        fail(`${label} ${side} distribution losses are incomplete or inconsistent at row ${index}`);
      }
    }
  });
}

function loadScreen(descriptor, expectedCoverage, baseDirectory, label) {
  if (!isRecord(descriptor) || typeof descriptor.screenIndex !== 'string') fail(`${label} needs a screenIndex path`);
  safeId(descriptor.resultId, `${label}.resultId`);
  const screenIndexPath = path.resolve(baseDirectory, descriptor.screenIndex);
  const loadedIndex = loadPinnedJson(screenIndexPath), index = loadedIndex.value;
  assertScreenIndex(index, expectedCoverage, label);
  const result = index.results.find(item => isRecord(item) && item.id === descriptor.resultId);
  if (!result || result.fullReceipt !== true || !isRecord(result.settings) || typeof result.implementation !== 'string') {
    fail(`${label} result must name a full screen receipt`);
  }

  const inputPath = resolvePinnedPath(baseDirectory, index.inputPin, `${label} forecast input`);
  if (!isRecord(index.sourceManifestPin)) fail(`${label} screen index has no source manifest pin`);
  const sourceManifestPath = resolvePinnedPath(baseDirectory, index.sourceManifestPin, `${label} source manifest`);
  const sourcePathMap = descriptor.sourcePathMap ?? {};
  if (!isRecord(sourcePathMap) || Object.entries(sourcePathMap).some(([original, relocated]) =>
    !path.isAbsolute(original) || typeof relocated !== 'string' || !path.isAbsolute(relocated))) {
    fail(label + ' sourcePathMap needs absolute original and relocated paths');
  }
  const verifiedSource = verifyManifest(sourceManifestPath, { pathMap: sourcePathMap });
  if (!verifiedSource.verified || !verifiedSource.checked.some(item => item.bytes === index.inputPin.bytes && item.sha256 === index.inputPin.sha256)) {
    fail(`${label} source manifest does not verify and pin the forecast input`);
  }
  if (index.configurationPin) {
    const configurationPath = resolvePinnedPath(baseDirectory, index.configurationPin, `${label} mean configuration`);
    const configuration = readJson(configurationPath);
    validateMeanConfiguration(configuration);
    const meanIdentity = verifiedSource.manifest.signature?.meanSettings;
    if (meanIdentity && hash(meanSettings(configuration)) !== hash(meanIdentity)) fail(`${label} mean configuration differs from its source manifest signature`);
    if (!meanIdentity && !verifiedSource.checked.some(item => item.bytes === index.configurationPin.bytes && item.sha256 === index.configurationPin.sha256)) {
      fail(`${label} mean configuration is not pinned by its source manifest`);
    }
  }

  const directory = path.resolve(result.directory);
  const loadedReceipt = loadPinnedJson(path.join(directory, 'receipt.json'));
  const receipt = loadedReceipt.value, signature = receipt?.signature;
  if (!isRecord(receipt) || receipt.format !== 'swishiq-experiment-cache-v1' || receipt.stage !== 'uncertainty'
    || receipt.key !== result.resultKey || hash(signature) !== receipt.key
    || signature?.format !== 'swishiq-uncertainty-screen-result-v1' || signature.fullReceipt !== true
    || signature.expectedTargets !== index.expectedTargets || signature.expectedIdentity !== index.chronology.targetIdentitySha256
    || signature.implementation !== result.implementation || hash(signature.settings) !== hash(result.settings)
    || hash(signature.years) !== hash(index.targetSeasonStartYears)) fail(`${label} uncertainty receipt signature does not match the screen index`);
  if (!isRecord(receipt.metadata) || receipt.metadata.targets !== index.expectedTargets
    || receipt.metadata.implementation !== result.implementation || receipt.metadata.fullReceipt !== true
    || receipt.metadata.targetIdentitySha256 !== index.chronology.targetIdentitySha256
    || !Array.isArray(index.codePins) || hash(signature.codePins) !== hash(index.codePins)) {
    fail(`${label} uncertainty receipt metadata/code pins do not match the screen index`);
  }
  assertPinEqual(signature.inputPin, index.inputPin, `${label} receipt forecast input`);
  assertPinEqual(signature.sourceManifestPin, index.sourceManifestPin, `${label} receipt source manifest`);
  assertPinEqual(signature.configurationPin, index.configurationPin, `${label} receipt configuration`);
  const verifiedFiles = verifyReceiptFiles(directory, receipt, label);
  for (const descriptor of signature.codePins ?? []) resolvePinnedPath(baseDirectory, descriptor, `${label} scorer code pin`);

  const scored = loadPinnedJsonl(path.join(directory, 'scored-rows.jsonl'));
  const ledger = loadPinnedJsonl(path.join(directory, 'forecast-ledger.jsonl'));
  const lossesPin = pin(path.join(directory, 'losses.json.gz'));
  const losses = JSON.parse(gunzipSync(fs.readFileSync(lossesPin.path)).toString('utf8'));
  const metrics = loadPinnedJson(path.join(directory, 'metrics.json'));
  for (const [fileName, actualPin] of [
    ['scored-rows.jsonl', scored.inputPin], ['forecast-ledger.jsonl', ledger.inputPin], ['losses.json.gz', lossesPin], ['metrics.json', metrics.inputPin],
  ]) assertPinEqual(verifiedFiles.get(fileName), actualPin, `${label} ${fileName}`);

  const forecasts = loadPinnedJsonl(inputPath);
  const modelVersions = new Set(forecasts.rows.map(row => row?.modelVersion));
  if (modelVersions.size !== 1 || typeof [...modelVersions][0] !== 'string' || ![...modelVersions][0].trim()) {
    fail(`${label} forecast input must contain one model version`);
  }
  if (index.configurationPin) {
    const configuration = readJson(resolvePinnedPath(baseDirectory, index.configurationPin, `${label} mean configuration`));
    const configuredVersion = configuration.version;
    const meanIdentity = verifiedSource.manifest.signature?.meanSettings;
    const cachedVersion = meanIdentity ? `experiment-mean-signature-${verifiedSource.manifest.key}` : null;
    if ([...modelVersions][0] !== configuredVersion && [...modelVersions][0] !== cachedVersion) {
      fail(`${label} forecast model version does not match its pinned mean configuration/source receipt`);
    }
  }
  const selected = selectedForecastRows(forecasts.rows, index, expectedCoverage, `${label} forecast input`);
  compareScoredRows(scored.rows, selected.targetRecords, `${label} scored rows`);
  if (ledger.rows.length !== selected.targetRecords.length) fail(`${label} forecast ledger is incomplete`);
  ledger.rows.forEach((row, rowIndex) => {
    const target = selected.targetRecords[rowIndex];
    if (!isRecord(row) || row.gameRef !== target.gameRef || row.gameDateLocal !== target.gameDateLocal
      || row.seasonStartYear !== target.seasonStartYear || !Number.isFinite(row.expectedTotal)
      || !Number.isFinite(row.expectedMargin) || !Number.isFinite(row.homeWinProbability)
      || row.homeWinProbability !== scored.rows[rowIndex].probability) fail(`${label} forecast ledger does not align with the scored cohort at row ${rowIndex}`);
  });
  validateLossRows(losses, selected.targetRecords, scored.rows, `${label} losses`);

  if (metrics.value?.format !== 'swishiq-development-screen-metrics-v1'
    || metrics.value.status !== 'opened-label-screen-only' || metrics.value.independentValidation !== false
    || metrics.value.canonicalParityEstablished !== false || metrics.value.implementation !== result.implementation
    || metrics.value.sourceProvenanceVerified !== true
    || hash(metrics.value.settings) !== hash(result.settings)
    || hash(metrics.value.summary) !== hash(result.summary)
    || metrics.value.targetIdentitySha256 !== index.chronology.targetIdentitySha256) fail(`${label} screen metrics provenance differs from its index`);
  const perSeason = metrics.value.summary?.perSeason;
  for (const [year, count] of Object.entries(expectedCoverage.perSeason)) {
    if (perSeason?.[year]?.n !== count) fail(`${label} metrics coverage differs from the plan for season ${year}`);
  }

  const scoredPin = verifiedFiles.get('scored-rows.jsonl');
  const ledgerPin = verifiedFiles.get('forecast-ledger.jsonl');
  const lossArtifactPin = verifiedFiles.get('losses.json.gz');
  return {
    label,
    screenIndex: { ...loadedIndex.inputPin },
    screenIndexPath,
    resultId: result.id,
    resultKey: result.resultKey,
    implementation: result.implementation,
    settings: result.settings,
    index: { expectedTargets: index.expectedTargets, targetSeasonStartYears: index.targetSeasonStartYears,
      targetIdentitySha256: index.chronology.targetIdentitySha256 },
    inputPin: { ...forecasts.inputPin },
    sourceManifestPin: { ...verifiedSource.manifestPin },
    sourcePathMap: { ...sourcePathMap },
    configurationPin: index.configurationPin ? { bytes: index.configurationPin.bytes, sha256: index.configurationPin.sha256 } : null,
    stageReceiptPin: { ...loadedReceipt.inputPin },
    outputs: { scoredRows: scoredPin, forecastLedger: ledgerPin, losses: lossArtifactPin, metrics: verifiedFiles.get('metrics.json') },
    sourceRows: selected.targetRecords,
    forecastRows: selected.rows,
    scoredRows: scored.rows,
    lossRows: losses,
    seasonCounts: selected.seasonCounts,
  };
}

function summarizeRawMeanErrors(screen) {
  const summary = {};
  for (const head of ['total', 'margin']) {
    let absolute = 0, squared = 0, signed = 0;
    const perGame = new Array(screen.sourceRows.length);
    screen.sourceRows.forEach((row, index) => {
      const error = finite(row.forecast.prediction[head], `${screen.label}.${row.gameRef}.prediction.${head}`)
        - row.target[head];
      perGame[index] = error;
      absolute += Math.abs(error);
      squared += error * error;
      signed += error;
    });
    const n = screen.sourceRows.length;
    summary[head] = { n, mae: absolute / n, rmse: Math.sqrt(squared / n), bias: signed / n,
      errorConvention: 'prediction minus observed target' };
    screen[head + 'MeanErrors'] = perGame;
  }
  return summary;
}

function summarizeRawMeanErrorsBySeason(screen) {
  const groups = new Map();
  for (const row of screen.sourceRows) {
    if (!groups.has(row.seasonStartYear)) groups.set(row.seasonStartYear, []);
    groups.get(row.seasonStartYear).push(row);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left - right).map(([year, rows]) => {
    const heads = {};
    for (const head of ['total', 'margin']) {
      let absolute = 0, squared = 0, signed = 0;
      for (const row of rows) {
        const error = finite(row.forecast.prediction[head], `${screen.label}.${row.gameRef}.prediction.${head}`)
          - row.target[head];
        absolute += Math.abs(error);
        squared += error * error;
        signed += error;
      }
      heads[head] = { n: rows.length, mae: absolute / rows.length, rmse: Math.sqrt(squared / rows.length),
        bias: signed / rows.length, errorConvention: 'prediction minus observed target' };
    }
    return [String(year), heads];
  }));
}

function summarizeDistributionLossRows(rows) {
  if (!rows.length) fail('Cannot summarize an empty distribution-loss cohort');
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const result = {
    n: rows.length,
    probability: { brier: mean(rows.map(row => row.brier)), logLoss: mean(rows.map(row => row.logLoss)) },
    marginAbsoluteError: mean(rows.map(row => row.marginAbsoluteError)),
    sides: {},
  };
  for (const side of SIDES) {
    const errors = rows.map(row => row.sides[side].error);
    result.sides[side] = {
      mae: mean(errors.map(Math.abs)),
      rmse: Math.sqrt(mean(errors.map(error => error * error))),
      bias: mean(errors),
      crps: mean(rows.map(row => row.sides[side].crps)),
      intervalScore: mean(rows.map(row => row.sides[side].intervalScore)),
    };
  }
  return result;
}

function summarizeDistributionLosses(screen) {
  const bySeason = new Map();
  for (const row of screen.lossRows) {
    if (!bySeason.has(row.seasonStartYear)) bySeason.set(row.seasonStartYear, []);
    bySeason.get(row.seasonStartYear).push(row);
  }
  return {
    pooledGameWeighted: summarizeDistributionLossRows(screen.lossRows),
    perSeasonGameWeighted: Object.fromEntries([...bySeason.entries()]
      .sort(([left], [right]) => left - right)
      .map(([year, rows]) => [String(year), summarizeDistributionLossRows(rows)])),
  };
}

function buildSourceRows(screen) {
  // Keep raw model means and observed labels distinct from uncertainty scores.
  const predictionsByRef = new Map(screen.forecastRows.map(row => [row.gameRef, row]));
  return screen.sourceRows.map(row => {
    const forecast = predictionsByRef.get(row.gameRef);
    if (!forecast || !isRecord(forecast.prediction)) fail(`${screen.label} raw mean forecast is missing for ${row.gameRef}`);
    return { ...row, forecast };
  });
}

function makePairedColumns(baseline, candidates, includeDistribution) {
  const base = baseline.lossRows, columns = {};
  const baseTotalErrors = baseline.totalMeanErrors, baseMarginErrors = baseline.marginMeanErrors;
  for (const candidate of candidates) {
    const id = candidate.label;
    const losses = candidate.lossRows;
    const metric = name => columns[`${id}:${name}`] = new Array(base.length);
    const brier = metric('brier'), logLoss = metric('logLoss'), marginAbsoluteError = metric('marginDistributionMae');
    const rawTotalMae = metric('rawTotalMae'), rawTotalSquared = metric('rawTotalSquaredError'), rawTotalBias = metric('rawTotalSignedError');
    const rawMarginMae = metric('rawMarginMae'), rawMarginSquared = metric('rawMarginSquaredError'), rawMarginBias = metric('rawMarginSignedError');
    for (let index = 0; index < base.length; index++) {
      brier[index] = losses[index].brier - base[index].brier;
      logLoss[index] = losses[index].logLoss - base[index].logLoss;
      marginAbsoluteError[index] = losses[index].marginAbsoluteError - base[index].marginAbsoluteError;
      const totalError = candidate.totalMeanErrors[index], baseTotalError = baseTotalErrors[index];
      rawTotalMae[index] = Math.abs(totalError) - Math.abs(baseTotalError);
      rawTotalSquared[index] = totalError ** 2 - baseTotalError ** 2;
      rawTotalBias[index] = totalError - baseTotalError;
      const marginError = candidate.marginMeanErrors[index], baseMarginError = baseMarginErrors[index];
      rawMarginMae[index] = Math.abs(marginError) - Math.abs(baseMarginError);
      rawMarginSquared[index] = marginError ** 2 - baseMarginError ** 2;
      rawMarginBias[index] = marginError - baseMarginError;
    }
    if (includeDistribution) for (const side of SIDES) {
      for (const metricName of ['mae', 'crps', 'intervalScore']) {
        const column = metric(`${side}:distribution:${metricName}`);
        for (let index = 0; index < base.length; index++) {
          const left = base[index].sides[side], right = losses[index].sides[side];
          const leftValue = metricName === 'mae' ? Math.abs(left.error) : metricName === 'crps' ? left.crps : left.intervalScore;
          const rightValue = metricName === 'mae' ? Math.abs(right.error) : metricName === 'crps' ? right.crps : right.intervalScore;
          column[index] = rightValue - leftValue;
        }
      }
    }
  }
  return columns;
}

function describePairedColumnDirections(columns) {
  const metricNames = [...new Set(Object.keys(columns).map(name => name.slice(name.indexOf(':') + 1)))].sort();
  return Object.fromEntries(metricNames.map(metricName => [metricName,
    metricName === 'rawTotalSignedError' || metricName === 'rawMarginSignedError'
      ? { direction: 'directional-signed-error', interpretation: 'Candidate-minus-baseline signed prediction error; evaluate relative to the baseline bias and zero. A negative delta is not inherently favorable.' }
      : { direction: 'lower-is-better', interpretation: 'Candidate-minus-baseline loss/error contribution; a negative delta favors the candidate.' }]));
}

function summarizePairedPointDifferencesBySeason(columns, rows) {
  const groupedIndices = new Map();
  rows.forEach((row, index) => {
    if (!groupedIndices.has(row.seasonStartYear)) groupedIndices.set(row.seasonStartYear, []);
    groupedIndices.get(row.seasonStartYear).push(index);
  });
  return Object.fromEntries([...groupedIndices.entries()].sort(([left], [right]) => left - right).map(([year, indices]) => {
    const differences = {};
    for (const [name, values] of Object.entries(columns)) {
      differences[name] = indices.reduce((sum, index) => sum + values[index], 0) / indices.length;
    }
    return [String(year), { n: indices.length, weighting: 'game-weighted arithmetic mean', differences }];
  }));
}

function validatePlan(plan) {
  if (!isRecord(plan) || plan.format !== CROSS_MEAN_PLAN_FORMAT || !isRecord(plan.baseline)
    || !Array.isArray(plan.candidates) || !plan.candidates.length || !isRecord(plan.expectedCoverage)
    || !isRecord(plan.comparison)) fail(`Expected ${CROSS_MEAN_PLAN_FORMAT}`);
  safeId(plan.baseline.resultId, 'baseline.resultId');
  if (typeof plan.baseline.screenIndex !== 'string') fail('baseline.screenIndex path is required');
  const ids = new Set(['baseline']);
  for (const candidate of plan.candidates) {
    if (!isRecord(candidate) || typeof candidate.screenIndex !== 'string') fail('Every candidate needs a screenIndex path');
    safeId(candidate.id, 'candidate.id');
    safeId(candidate.resultId, `candidate ${candidate.id}.resultId`);
    if (ids.has(candidate.id)) fail(`Duplicate candidate id: ${candidate.id}`);
    ids.add(candidate.id);
  }
  if (!Array.isArray(plan.expectedCoverage.targetSeasonStartYears) || !plan.expectedCoverage.targetSeasonStartYears.length
    || plan.expectedCoverage.targetSeasonStartYears.some((year, at, values) => !Number.isSafeInteger(year) || at > 0 && year <= values[at - 1])
    || !Number.isSafeInteger(plan.expectedCoverage.expectedTargets) || plan.expectedCoverage.expectedTargets < 1
    || !isRecord(plan.expectedCoverage.perSeason)) fail('expectedCoverage requires seasons, expectedTargets, and perSeason counts');
  for (const key of ['seed', 'repetitions', 'blockLengthDates']) {
    if (!Number.isSafeInteger(plan.comparison[key])) fail(`comparison.${key} must be an explicit safe integer`);
  }
  if (plan.comparison.repetitions < 2 || plan.comparison.blockLengthDates < 1) fail('Invalid date-block resampling dimensions');
}

export function compareMeanScreens(plan, { baseDirectory = process.cwd(), planPin = null } = {}) {
  validatePlan(plan);
  const screens = [{ label: 'baseline', descriptor: plan.baseline },
    ...plan.candidates.map(candidate => ({ label: candidate.id, descriptor: candidate }))]
    .map(item => ({ ...loadScreen(item.descriptor, plan.expectedCoverage, baseDirectory, item.label) }));
  const baseline = screens[0], candidates = screens.slice(1);
  for (const candidate of candidates) {
    if (candidate.implementation !== baseline.implementation || hash(candidate.settings) !== hash(baseline.settings)) {
      fail(`Scoring implementation/settings differ between baseline and ${candidate.label}`);
    }
    if (hash(candidate.index.targetSeasonStartYears) !== hash(baseline.index.targetSeasonStartYears)
      || candidate.index.expectedTargets !== baseline.index.expectedTargets
      || candidate.index.targetIdentitySha256 !== baseline.index.targetIdentitySha256
      || hash(candidate.sourceRows.map(row => ({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal,
        seasonStartYear: row.seasonStartYear, homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, target: row.target })))
        !== hash(baseline.sourceRows.map(row => ({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal,
          seasonStartYear: row.seasonStartYear, homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, target: row.target })))) {
      fail(`Target order, coverage, labels, or home/away team references differ for ${candidate.label}`);
    }
  }

  // Attach pinned mean predictions after truth/team parity has been established.
  for (const screen of screens) {
    screen.sourceRows = buildSourceRows(screen);
    screen.rawMeanErrors = summarizeRawMeanErrors(screen);
    screen.rawMeanErrorsBySeason = summarizeRawMeanErrorsBySeason(screen);
    screen.distributionLossSummaries = summarizeDistributionLosses(screen);
  }

  const includeDistribution = true;
  const targetRowsHash = hash(baseline.sourceRows.map(row => ({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal,
    seasonStartYear: row.seasonStartYear, homeTeamRef: row.homeTeamRef, awayTeamRef: row.awayTeamRef, target: row.target })));
  const resamplingCodePins = pinModuleClosure([path.join(toolsRoot, 'lib/resampling-plan.mjs')]);
  const resamplingSignature = { format: 'swishiq-cross-mean-date-block-cache-v1', targetRowsHash,
    targetIdentitySha256: baseline.index.targetIdentitySha256, options: plan.comparison, codePins: resamplingCodePins };
  const resampling = withArtifactCache(CACHE_ROOT, 'cross-mean-resampling', resamplingSignature, directory => {
    const rows = baseline.sourceRows.map(row => ({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear }));
    const resamplingPlan = createResamplingPlan(rows, plan.comparison);
    writeJson(path.join(directory, 'plan.json'), resamplingPlan);
    return { targetRowsHash, targetIdentitySha256: baseline.index.targetIdentitySha256, options: plan.comparison };
  });
  const resamplingPlan = readJson(path.join(resampling.directory, 'plan.json'));
  const pairedColumns = makePairedColumns(baseline, candidates, includeDistribution);
  const pairedColumnDirections = describePairedColumnDirections(pairedColumns);
  const resultKeys = screens.map(screen => [screen.label, screen.resultKey]);
  const sourcePins = screens.map(screen => ({ label: screen.label, screenIndex: screen.screenIndex,
    input: screen.inputPin, sourceManifest: screen.sourceManifestPin, configuration: screen.configurationPin,
    stageReceipt: screen.stageReceiptPin, outputs: screen.outputs, sourcePathMap: screen.sourcePathMap }));
  const comparisonCodePins = pinModuleClosure([import.meta.filename, path.join(toolsRoot, 'lib/artifacts.mjs'),
    path.join(toolsRoot, 'lib/configuration.mjs'), path.join(toolsRoot, 'lib/resampling-plan.mjs'), path.join(toolsRoot, 'lib/output.mjs')]);
  const comparisonSignature = { format: CROSS_MEAN_COMPARISON_FORMAT, targetRowsHash, resultKeys,
    sourcePins, implementation: baseline.implementation, settings: baseline.settings,
    expectedCoverage: plan.expectedCoverage, resamplingKey: resampling.key,
    pairedColumnNames: Object.keys(pairedColumns), codePins: comparisonCodePins };
  const comparison = withArtifactCache(CACHE_ROOT, 'cross-mean-comparison', comparisonSignature, directory => {
    const paired = applyResamplingPlan(resamplingPlan,
      baseline.sourceRows.map(row => ({ gameRef: row.gameRef, gameDateLocal: row.gameDateLocal, seasonStartYear: row.seasonStartYear })), pairedColumns);
    const summaries = Object.fromEntries(screens.map(screen => [screen.label, screen.rawMeanErrors]));
    const report = { format: CROSS_MEAN_COMPARISON_FORMAT,
      status: 'opened-label-screen-only; not-independent-validation',
      inferenceScope: 'SCREEN ONLY',
      scoring: { implementation: baseline.implementation, settings: baseline.settings },
      coverage: plan.expectedCoverage,
      targets: { n: baseline.index.expectedTargets, targetSeasonStartYears: baseline.index.targetSeasonStartYears,
        targetIdentitySha256: baseline.index.targetIdentitySha256, targetRowsSha256: targetRowsHash },
      provenance: { sourcePins, resultKeys, resamplingKey: resampling.key },
      rawMeanForecastErrors: summaries,
      rawMeanForecastErrorsBySeason: Object.fromEntries(screens.map(screen => [screen.label, screen.rawMeanErrorsBySeason])),
      distributionLossSummaries: Object.fromEntries(screens.map(screen => [screen.label, screen.distributionLossSummaries])),
      pairedDifferences: { reference: 'baseline', differenceConvention: 'candidate minus baseline',
        columnDirections: pairedColumnDirections,
        rawMeanErrorColumns: 'Per-game differences in MAE contribution, squared error, and signed error; squared-error columns are MSE contributions, not RMSE differences. Signed-error columns are directional, not lower-is-better.',
        perSeasonGameWeightedPointDifferences: summarizePairedPointDifferencesBySeason(pairedColumns, baseline.sourceRows),
        perSeasonIntervalEstimates: false,
        distributionLossesIncluded: includeDistribution, ...paired },
      limitations: ['This is a paired opened-label screen, not independent validation or formal model inference.',
        'Source relocation maps are explicit and preserve exact hashes and byte lengths for all original pins.',
        'Date-block draws are same-season circular blocks over game-date clusters and are shared across all candidate contrasts.',
        'Raw total/margin head mean errors are computed from the pinned mean forecast inputs; distribution scores come from the pinned uncertainty screen outputs.',
        'The resampling API is SCREEN ONLY and does not implement shared-team resampling or maxT correction.'] };
    writeJson(path.join(directory, 'comparison.json'), report);
    return { targetRowsHash, targetIdentitySha256: baseline.index.targetIdentitySha256,
      contrasts: Object.keys(pairedColumns).length, resultKeys };
  });

  const outputRoot = plan.outputDirectory
    ? path.resolve(baseDirectory, plan.outputDirectory)
    : DEFAULT_OUTPUT_ROOT;
  assertDiagnosticOutput(outputRoot);
  assertPathWithin(runsRoot, outputRoot, 'Comparison output directory');
  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, `run-${Date.now()}-${process.pid}`);
  fs.mkdirSync(invocation, { recursive: false });
  const invocationReport = { format: CROSS_MEAN_COMPARISON_FORMAT,
    status: 'opened-label-screen-only; not-independent-validation',
    planSha256: hash(plan), planPin,
    comparisonKey: comparison.key, comparisonReceiptPin: pin(path.join(comparison.directory, 'receipt.json')),
    comparisonOutputPin: pin(path.join(comparison.directory, 'comparison.json')),
    resamplingKey: resampling.key, resamplingReceiptPin: pin(path.join(resampling.directory, 'receipt.json')),
    resamplingPlanPin: pin(path.join(resampling.directory, 'plan.json')),
    coverage: plan.expectedCoverage, sourcePins, implementation: baseline.implementation,
    scoringSettings: baseline.settings, cacheHits: { resampling: resampling.cacheHit, comparison: comparison.cacheHit },
    comparison: readJson(path.join(comparison.directory, 'comparison.json')),
    outputs: { comparisonDirectory: comparison.directory, resamplingDirectory: resampling.directory,
      invocationDirectory: invocation }, promotionAllowed: false, requiresCanonicalFinalRerun: true };
  writeJson(path.join(invocation, 'comparison-index.json'), invocationReport);
  return { outputDirectory: invocation, ...invocationReport };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const planPath = process.argv[2];
  if (!planPath || process.argv.includes('--help')) {
    console.log('Usage: node compare-mean-screens.mjs <versioned-plan.json>\nCompares full screen receipts from separate mean-model runs; writes only under experiment-tools/runs.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const resolvedPlan = path.resolve(planPath);
  const loadedPlan = loadPinnedJson(resolvedPlan);
  const result = compareMeanScreens(loadedPlan.value, { baseDirectory: path.dirname(resolvedPlan), planPin: loadedPlan.inputPin });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, comparisonKey: result.comparisonKey,
    resamplingKey: result.resamplingKey, candidates: result.comparison.pairedDifferences.columns
      ? Object.keys(result.comparison.pairedDifferences.columns).length : 0,
    targetGames: result.coverage.expectedTargets }));
}

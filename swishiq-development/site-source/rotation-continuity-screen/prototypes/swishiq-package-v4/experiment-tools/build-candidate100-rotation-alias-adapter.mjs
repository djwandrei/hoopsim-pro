import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import { assertDiagnosticOutput } from './lib/output.mjs';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, '..');
const REPOSITORY_DIRECTORY = path.resolve(PACKAGE_DIRECTORY, '..', '..');
const RUNS_DIRECTORY = path.join(SCRIPT_DIRECTORY, 'runs');
const EXPECTED_CACHE_ROWS = 7230;
const EXPECTED_SEASON_COUNTS = Object.freeze({
  2020: 1080,
  2021: 1230,
  2022: 1230,
  2023: 1230,
  2024: 1230,
  2025: 1230,
});
const DEVELOPMENT_SEASONS = Object.freeze([2021, 2022, 2023, 2024, 2025]);
const ROTATION_ALIASES = Object.freeze([
  Object.freeze({
    head: 'total',
    metric: 'activePlayerOverlap',
    semanticFeature: 'meanActivePlayerOverlap5',
    modelSlot: 'c51:meanActivePlayerOverlap5',
    minimum: 0,
    maximum: 1,
  }),
  Object.freeze({
    head: 'total',
    metric: 'starterOverlap',
    semanticFeature: 'meanStarterOverlap5',
    modelSlot: 'c51:meanStarterOverlap5',
    minimum: 0,
    maximum: 1,
  }),
  Object.freeze({
    head: 'total',
    metric: 'minuteShareOverlap',
    semanticFeature: 'meanMinuteShareOverlap5',
    modelSlot: 'c51:meanMinuteShareOverlap5',
    minimum: 0,
    maximum: 1,
  }),
  Object.freeze({
    head: 'margin',
    metric: 'activePlayerOverlap',
    semanticFeature: 'activePlayerOverlapAdvantage5',
    modelSlot: 'c51:activePlayerOverlapAdvantage5',
    minimum: -1,
    maximum: 1,
  }),
  Object.freeze({
    head: 'margin',
    metric: 'starterOverlap',
    semanticFeature: 'starterOverlapAdvantage5',
    modelSlot: 'c51:starterOverlapAdvantage5',
    minimum: -1,
    maximum: 1,
  }),
  Object.freeze({
    head: 'margin',
    metric: 'minuteShareOverlap',
    semanticFeature: 'minuteShareOverlapAdvantage5',
    modelSlot: 'c51:minuteShareOverlapAdvantage5',
    minimum: -1,
    maximum: 1,
  }),
]);
const PINNED_INPUTS = Object.freeze({
  candidate57FeatureRows: Object.freeze({
    relativePath: 'diagnostics/game-lab-candidate57-source-cache-20261007/feature-rows.jsonl',
    bytes: 34346629,
    sha256: '3e9c5e6b3102464b686dea5e43277e80166e67702628e74b14ba56b0c23ede3d',
  }),
  candidate57FeatureManifest: Object.freeze({
    relativePath: 'diagnostics/game-lab-candidate57-source-cache-20261007/manifest.json',
    bytes: 18213,
    sha256: 'cd0ddcbc5f9bb147d48adf502f7f0a47f015200b19a0c6a9490ba41798c1d749',
  }),
  candidate57Builder: Object.freeze({
    relativePath: 'diagnostics/game-lab-candidate57-source-cache-20261007.mjs',
    bytes: 31542,
    sha256: '70a22e00814759948bc616f3a5cd333e90578e5ad5aba4bab0ceff2f1e1077af',
  }),
  candidate16RotationContext: Object.freeze({
    relativePath: 'models/game-lab-candidate16-rotation-context-v1.mjs',
    bytes: 13231,
    sha256: '10ebe60429004e61f40a72c33e7b926371e562e167cf4b23ead1ec88b4d4c695',
  }),
  candidate16ScoreModel: Object.freeze({
    relativePath: 'models/game-lab-candidate16-rotation-score-model-v1.mjs',
    bytes: 16266,
    sha256: 'c9302fe9c8701198b673d5a121f89af13be26596b6b3f180a9f63eea728a97ff',
  }),
  candidate16RotationAudit: Object.freeze({
    relativePath: 'diagnostics/game-lab-candidate16-rotation-context-audit-20261005-a.json',
    bytes: 2748,
    sha256: '01717c28273fce1a47fb1929f72dd579b06a0717d42ba6a66c49b3d7fc07b517',
  }),
  candidate100Configuration: Object.freeze({
    relativePath: 'diagnostics/game-lab-candidate100-pruned-total-model-blend090-v1-20261008/configuration.json',
    bytes: 7763,
    sha256: '6e7fa2868fb9bcf4716603a15a953f42f1f6faa0b70e3ecd7f1ea56b45992e94',
  }),
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function resolvePackagePath(relativePath) {
  return path.resolve(PACKAGE_DIRECTORY, relativePath);
}

function resolveExpectedPin(descriptor) {
  return {
    path: resolvePackagePath(descriptor.relativePath),
    bytes: descriptor.bytes,
    sha256: descriptor.sha256,
  };
}

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function pinFile(file) {
  const absolute = path.resolve(file);
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(absolute)) digest.update(chunk);
  return {
    path: absolute,
    bytes: fs.statSync(absolute).size,
    sha256: digest.digest('hex'),
  };
}

function assertPin(actual, expected, label) {
  if (!isRecord(actual) || !samePath(actual.path, expected.path)
    || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw Error(label + ' pin differs from the reviewed source/cache');
  }
}

async function verifyExpectedFile(descriptor, label) {
  const expected = resolveExpectedPin(descriptor);
  const actual = await pinFile(expected.path);
  assertPin(actual, expected, label);
  return actual;
}

async function readPinnedJson(descriptor, label) {
  const inputPin = await verifyExpectedFile(descriptor, label);
  const value = JSON.parse(fs.readFileSync(inputPin.path, 'utf8').replace(/^\uFEFF/, ''));
  return { value, inputPin };
}

function parseJsonLine(line, file, lineNumber) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw Error('Invalid JSONL row ' + lineNumber + ' in ' + file + ': ' + error.message);
  }
}

async function verifyPinnedFeatureRows(file, expected) {
  const absolute = path.resolve(file);
  const digest = createHash('sha256');
  const decoder = new StringDecoder('utf8');
  const seasonCounts = new Map();
  const perAlias = new Map(ROTATION_ALIASES.map(alias => [alias.modelSlot, 0]));
  const gameRefs = new Set();
  let pending = '';
  let bytes = 0;
  let lineNumber = 0;
  let priorDateRows = 0;
  let pairedRows = 0;
  let developmentRows = 0;
  const acceptLine = line => {
    if (!line.trim()) return;
    lineNumber += 1;
    const row = parseJsonLine(line, absolute, lineNumber);
    if (!isRecord(row) || typeof row.gameRef !== 'string' || !row.gameRef
      || !Number.isSafeInteger(row.seasonStartYear) || !validDate(row.gameDateLocal)
      || !validDate(row.observedThrough) || row.observedThrough >= row.gameDateLocal
      || !isRecord(row.features) || !isRecord(row.features.total) || !isRecord(row.features.margin)) {
      throw Error('Invalid identity, date provenance, or paired feature structure at source row ' + lineNumber);
    }
    if (gameRefs.has(row.gameRef)) throw Error('Duplicate gameRef at source row ' + lineNumber);
    gameRefs.add(row.gameRef);
    priorDateRows += 1;
    seasonCounts.set(row.seasonStartYear, (seasonCounts.get(row.seasonStartYear) ?? 0) + 1);
    if (DEVELOPMENT_SEASONS.includes(row.seasonStartYear)) developmentRows += 1;
    let rowIsPaired = true;
    for (const alias of ROTATION_ALIASES) {
      if (alias.modelSlot.slice('c51:'.length) !== alias.semanticFeature) {
        throw Error('Rotation alias is not a name-preserving semantic-to-model-slot mapping');
      }
      const value = row.features[alias.head][alias.modelSlot];
      if (!Number.isFinite(value) || value < alias.minimum || value > alias.maximum) {
        rowIsPaired = false;
        throw Error('Missing or out-of-range ' + alias.head + '.' + alias.modelSlot + ' at source row ' + lineNumber);
      }
      perAlias.set(alias.modelSlot, perAlias.get(alias.modelSlot) + 1);
    }
    if (rowIsPaired) pairedRows += 1;
  };

  for await (const chunk of fs.createReadStream(absolute)) {
    bytes += chunk.length;
    digest.update(chunk);
    pending += decoder.write(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) acceptLine(line);
  }
  pending += decoder.end();
  acceptLine(pending);
  const inputPin = { path: absolute, bytes, sha256: digest.digest('hex') };
  assertPin(inputPin, expected, 'Candidate57 feature rows');
  const observedSeasons = Object.fromEntries([...seasonCounts].sort(([left], [right]) => left - right));
  if (lineNumber !== EXPECTED_CACHE_ROWS
    || JSON.stringify(observedSeasons) !== JSON.stringify(EXPECTED_SEASON_COUNTS)
    || priorDateRows !== EXPECTED_CACHE_ROWS || pairedRows !== EXPECTED_CACHE_ROWS
    || developmentRows !== 6150
    || [...perAlias.values()].some(count => count !== EXPECTED_CACHE_ROWS)) {
    throw Error('Candidate57 rotation continuity cache coverage differs from the pinned 2020–25 cohort');
  }
  return {
    inputPin,
    rows: lineNumber,
    seasonCounts: observedSeasons,
    developmentTargetRows: developmentRows,
    strictPriorDateRows: priorDateRows,
    pairedRowsWithAllSixRotationValues: pairedRows,
    perAliasCoverage: ROTATION_ALIASES.map(alias => ({
      head: alias.head,
      semanticFeature: alias.semanticFeature,
      modelSlot: alias.modelSlot,
      coveredRows: perAlias.get(alias.modelSlot),
      missingRows: EXPECTED_CACHE_ROWS - perAlias.get(alias.modelSlot),
    })),
  };
}

function assertCandidate100Slots(configuration, cacheManifest) {
  const expectedVersion = 'swishiq-v4-game-lab-candidate100-pruned-total-model-blend090-v1';
  if (!isRecord(configuration) || configuration.version !== expectedVersion
    || configuration.status !== 'development-unvalidated'
    || configuration.totalFeatureNames?.length !== 40 || configuration.marginFeatureNames?.length !== 39
    || configuration.totalPredictorCount !== 40 || configuration.marginPredictorCount !== 39) {
    throw Error('Pinned Candidate100 configuration no longer matches its unvalidated 40/39 baseline');
  }
  const totalSet = new Set(configuration.totalFeatureNames);
  const marginSet = new Set(configuration.marginFeatureNames);
  for (const alias of ROTATION_ALIASES) {
    const selected = alias.head === 'total' ? totalSet : marginSet;
    if (!configuration.excludedFeatures?.includes(alias.modelSlot) || selected.has(alias.modelSlot)) {
      throw Error('Candidate100 rotation-continuity slot must remain explicitly excluded: ' + alias.modelSlot);
    }
    if (!cacheManifest.featureNames?.[alias.head]?.includes(alias.modelSlot)
      || !cacheManifest.candidate51Inputs?.[alias.head]?.includes(alias.semanticFeature)) {
      throw Error('Candidate57 cache feature allowlist omits ' + alias.modelSlot);
    }
  }
}

function assertSourceAudit(audit, cacheManifest, sourcePins) {
  if (!isRecord(audit) || audit.format !== 'swishiq-candidate16-rotation-context-audit-v1'
    || audit.status !== 'development-source-audit-only'
    || audit.counts?.rotationContexts !== 10749 || audit.counts?.scoreContexts !== 10749
    || audit.counts?.supportMismatches !== 0
    || audit.rotationContextAudit?.gameCount !== 10749 || audit.rotationContextAudit?.contextCount !== 10749
    || audit.rotationContextAudit?.sameLocalDateOutcomesExcluded !== true
    || audit.rotationContextAudit?.regularSeasonOnly !== true
    || audit.sourceUse?.sameLocalDatePlayerOutcomesExcluded !== true
    || audit.sourceUse?.targetScoresUsedInRotationFeatureConstruction !== false) {
    throw Error('Pinned Candidate16 rotation audit does not certify the required source-only context');
  }
  const cachePins = cacheManifest.sourcePins;
  const auditSourcePins = Object.values(audit.sourcePins ?? {});
  if (!Array.isArray(cachePins) || auditSourcePins.length !== 3
    || auditSourcePins.some(pin => !cachePins.some(source => samePath(source.path, pin.path)
      && source.bytes === pin.bytes && source.sha256 === pin.sha256))) {
    throw Error('Candidate16 audit source pins do not match the Candidate57 cache source pins');
  }
  const verifiedByPath = new Map(sourcePins.map(pin => [path.resolve(pin.path).toLowerCase(), pin]));
  if (auditSourcePins.some(pin => !verifiedByPath.has(path.resolve(pin.path).toLowerCase()))) {
    throw Error('Candidate16 audit package input was not verified against the pinned Candidate57 source cache');
  }
}

function verifySemanticAndStarterRules(candidate16ModelSource, rotationContextSource, candidate57BuilderSource) {
  if (!candidate16ModelSource.includes("'rotation-continuity': Object.freeze({")) {
    throw Error('Pinned Candidate16 model does not define the rotation-continuity family');
  }
  for (const alias of ROTATION_ALIASES) {
    if (!candidate16ModelSource.includes("'" + alias.semanticFeature + "'")) {
      throw Error('Candidate16 semantic feature is absent from its pinned model: ' + alias.semanticFeature);
    }
  }
  if (!rotationContextSource.includes("(player.isStarter != null && typeof player.isStarter !== 'boolean')")
    || !rotationContextSource.includes('const starters = active.filter(player => player.isStarter === true);')
    || !rotationContextSource.includes('|| starters.length !== 5)')
    || !rotationContextSource.includes('const starterSet = new Set(starters.map(player => player.playerRef));')
    || !rotationContextSource.includes('starterOverlap: jaccard(rotation.starterSet, previous.starterSet),')) {
    throw Error('Candidate16 starter rule must require five known true starter labels and map their overlap');
  }
  if (!candidate57BuilderSource.includes('buildCandidate16RotationContexts')
    || !candidate57BuilderSource.includes('rotation: buildCandidate16RotationContexts({ games: rotationGames })')) {
    throw Error('Pinned Candidate57 source cache is not built from the pinned Candidate16 rotation contexts');
  }
}

export async function buildCandidate100RotationAliasAdapter() {
  const expected = Object.fromEntries(Object.entries(PINNED_INPUTS).map(([key, value]) => [
    key, resolveExpectedPin(value),
  ]));
  const [
    candidate57FeatureManifest,
    candidate16Audit,
    candidate100Configuration,
    candidate57BuilderPin,
    candidate16ContextPin,
    candidate16ModelPin,
  ] = await Promise.all([
    readPinnedJson(PINNED_INPUTS.candidate57FeatureManifest, 'Candidate57 feature manifest'),
    readPinnedJson(PINNED_INPUTS.candidate16RotationAudit, 'Candidate16 rotation audit'),
    readPinnedJson(PINNED_INPUTS.candidate100Configuration, 'Candidate100 configuration'),
    verifyExpectedFile(PINNED_INPUTS.candidate57Builder, 'Candidate57 source builder'),
    verifyExpectedFile(PINNED_INPUTS.candidate16RotationContext, 'Candidate16 rotation context code'),
    verifyExpectedFile(PINNED_INPUTS.candidate16ScoreModel, 'Candidate16 score model code'),
  ]);
  const manifest = candidate57FeatureManifest.value;
  const audit = candidate16Audit.value;
  if (!isRecord(manifest) || manifest.format !== 'swishiq-candidate57-union-feature-cache-v1'
    || manifest.status !== 'prior-date-research-inputs'
    || manifest.rows !== EXPECTED_CACHE_ROWS
    || JSON.stringify(manifest.perSeason) !== JSON.stringify(EXPECTED_SEASON_COUNTS)
    || manifest.observedThroughRule !== 'every context excludes the target local date; all same-date features captured before feedback'
    || manifest.contextAudits?.rotation?.gameCount !== 10749
    || manifest.contextAudits?.rotation?.contextCount !== 10749
    || manifest.contextAudits?.rotation?.sameLocalDateOutcomesExcluded !== true
    || manifest.contextAudits?.rotation?.regularSeasonOnly !== true) {
    throw Error('Pinned Candidate57 feature manifest does not match its prior-date rotation cohort');
  }

  const upstreamSourcePins = [];
  if (!Array.isArray(manifest.sourcePins) || manifest.sourcePins.length !== 12) {
    throw Error('Candidate57 manifest must retain the complete twelve-file source pin set');
  }
  for (const descriptor of manifest.sourcePins) {
    if (!isRecord(descriptor) || typeof descriptor.path !== 'string'
      || !path.isAbsolute(descriptor.path) || !inside(REPOSITORY_DIRECTORY, descriptor.path)
      || !Number.isSafeInteger(descriptor.bytes) || typeof descriptor.sha256 !== 'string') {
      throw Error('Candidate57 source manifest contains an invalid or out-of-repository pin');
    }
    const actual = await pinFile(descriptor.path);
    assertPin(actual, descriptor, 'Candidate57 upstream source');
    upstreamSourcePins.push(actual);
  }
  const expectedBuilder = expected.candidate57Builder;
  const expectedContext = expected.candidate16RotationContext;
  for (const [label, expectedPin] of [
    ['Candidate57 source builder', expectedBuilder],
    ['Candidate16 rotation context', expectedContext],
  ]) {
    if (!manifest.sourcePins.some(source => samePath(source.path, expectedPin.path)
      && source.bytes === expectedPin.bytes && source.sha256 === expectedPin.sha256)) {
      throw Error(label + ' is not directly pinned by the Candidate57 feature cache');
    }
  }

  assertSourceAudit(audit, manifest, upstreamSourcePins);
  assertCandidate100Slots(candidate100Configuration.value, manifest);
  const candidate16ModelSource = fs.readFileSync(expected.candidate16ScoreModel.path, 'utf8');
  const rotationContextSource = fs.readFileSync(expectedContext.path, 'utf8');
  const candidate57BuilderSource = fs.readFileSync(expectedBuilder.path, 'utf8');
  verifySemanticAndStarterRules(candidate16ModelSource, rotationContextSource, candidate57BuilderSource);

  const coverage = await verifyPinnedFeatureRows(expected.candidate57FeatureRows.path, expected.candidate57FeatureRows);
  const pinByName = {
    candidate100Configuration: candidate100Configuration.inputPin,
    candidate57FeatureRows: coverage.inputPin,
    candidate57FeatureManifest: candidate57FeatureManifest.inputPin,
    candidate16RotationAudit: candidate16Audit.inputPin,
    candidate57SourceBuilder: candidate57BuilderPin,
    candidate16RotationContext: candidate16ContextPin,
    candidate16ScoreModel: candidate16ModelPin,
    candidate57UpstreamSourceFiles: upstreamSourcePins,
  };
  const aliasMap = {
    format: 'swishiq-candidate100-rotation-continuity-semantic-to-model-slot-map-v1',
    status: 'experiment-only-model-slot-aliases; development-unvalidated',
    mappings: ROTATION_ALIASES.map(alias => ({
      head: alias.head,
      metric: alias.metric,
      semanticFeature: alias.semanticFeature,
      modelSlot: alias.modelSlot,
      sourceFeature: alias.modelSlot,
      namePreservingAlias: true,
      candidate100SlotExplicitlyExcluded: true,
    })),
    note: 'The pinned Candidate57 feature rows already contain these exact c51 model-slot values. This adapter attaches the pinned Candidate16 semantic names to the Candidate100 excluded slots without rewriting source rows or selecting a slot.',
  };
  const result = {
    format: 'swishiq-candidate100-rotation-alias-adapter-run-v1',
    status: 'candidate100-rotation-continuity-alias-prepared; development-unvalidated; model-screen-not-run',
    promotionAllowed: false,
    modelFitExecuted: false,
    modelScreenExecuted: false,
    generatedAtUtc: new Date().toISOString(),
    sourcePins: pinByName,
    candidate100: {
      version: candidate100Configuration.value.version,
      configuration: candidate100Configuration.inputPin,
      baselinePredictorCounts: {
        total: candidate100Configuration.value.totalFeatureNames.length,
        margin: candidate100Configuration.value.marginFeatureNames.length,
      },
      rotationContinuitySlotsRemainUnselectedAndExcluded: true,
    },
    semanticToModelSlotMap: aliasMap,
    coverage: {
      sourceRows: coverage.rows,
      seasonCounts: coverage.seasonCounts,
      developmentTargetRows2021To2025: coverage.developmentTargetRows,
      strictPriorDateProvenance: {
        rowsVerified: coverage.strictPriorDateRows,
        invalidOrSameDateRows: 0,
        manifestRule: manifest.observedThroughRule,
        candidate16SameLocalDateOutcomesExcluded: audit.rotationContextAudit.sameLocalDateOutcomesExcluded,
      },
      fullPairedRotationCoverage: {
        rowsWithAllSixFiniteValues: coverage.pairedRowsWithAllSixRotationValues,
        requiredRows: coverage.rows,
        perAlias: coverage.perAliasCoverage,
      },
      knownStarterHandling: {
        status: 'verified-from-pinned-Candidate16-source-rule',
        rule: 'Each normalized active rotation must include exactly five players with isStarter === true. Null labels are allowed on other active players but do not satisfy the five-starter count; overlap uses the five known-true starter labels.',
        sourcePin: candidate16ContextPin,
        gameLevelKnownStarterCountsInFeatureCache: 'not-emitted-by-the-pinned-feature-row-schema',
      },
    },
    skipOutcome: {
      skippedRows: 0,
      skippedAliasValues: 0,
      skipReasons: [],
      outcome: 'No rows skipped: all six paired rotation-continuity model slots are finite in all 7,230 pinned source rows.',
      limitation: 'The existing feature cache stores the model values but not per-row starter-label or starter-overlap window counts; this preparation verifies the pinned upstream five-known-true-starters rule but cannot report those game-level counts.',
    },
    writeScope: {
      candidate100ConfigurationChanged: false,
      otherModelsChanged: false,
      packageDataChanged: false,
      siteFilesChanged: false,
      sourceFeatureRowsChanged: false,
      predictiveScreenRun: false,
    },
  };

  const outputRoot = assertDiagnosticOutput(path.join(RUNS_DIRECTORY, 'candidate100-rotation-alias-adapters'));
  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, 'run-' + Date.now() + '-' + process.pid + '-' + randomUUID());
  fs.mkdirSync(invocation, { recursive: false });
  const runJson = path.join(invocation, 'run.json');
  fs.writeFileSync(runJson, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return { result, runJson, runJsonPin: await pinFile(runJson) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildCandidate100RotationAliasAdapter().then(({ result, runJson, runJsonPin }) => {
    console.log(JSON.stringify({
      status: result.status,
      runJson,
      runJsonPin,
      coverage: result.coverage,
      skipOutcome: result.skipOutcome,
      modelScreenExecuted: result.modelScreenExecuted,
    }, null, 2));
  }).catch(error => {
    console.error(error.stack ?? error.message ?? String(error));
    process.exitCode = 1;
  });
}

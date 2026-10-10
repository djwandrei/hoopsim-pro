import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  atomicWrite, hash, loadPinnedBytes, loadPinnedJson, loadPinnedJsonl, pin, pinModuleClosure, stable,
  verifyManifest, withArtifactCache, writeJson,
} from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { indexChronology } from './lib/chronology.mjs';
import { validateMeanConfiguration } from './lib/configuration.mjs';
import {
  CANDIDATE57_TOTAL_FEATURE_NAMES,
  CANDIDATE57_MARGIN_FEATURE_NAMES,
} from '../models/game-lab-candidate57-c51-pass6-hybrid-v4.mjs';

const PLAN_FORMAT = 'swishiq-candidate100-hustle-alias-adapter-plan-v1';
const ADAPTER_FORMAT = 'swishiq-candidate100-hustle-alias-adapter-v1';
const CACHE_STAGE = 'candidate100-hustle-alias-features';
const FEATURE_NAMES = Object.freeze({
  contestedShots: Object.freeze({
    total: 'hustle:contestedShotsPer36MinuteRoleWeightedProfileSumHomeAwayPriorSeason',
    margin: 'hustle:contestedShotsPer36MinuteRoleWeightedProfileDifferenceHomeMinusAwayPriorSeason',
  }),
  deflections: Object.freeze({
    total: 'hustle:deflectionsPer36MinuteRoleWeightedProfileSumHomeAwayPriorSeason',
    margin: 'hustle:deflectionsPer36MinuteRoleWeightedProfileDifferenceHomeMinusAwayPriorSeason',
  }),
  defensiveLooseBallRecoveries: Object.freeze({
    total: 'hustle:defensiveLooseBallRecoveriesPer36MinuteRoleWeightedProfileSumHomeAwayPriorSeason',
    margin: 'hustle:defensiveLooseBallRecoveriesPer36MinuteRoleWeightedProfileDifferenceHomeMinusAwayPriorSeason',
  }),
  chargesDrawn: Object.freeze({
    total: 'hustle:chargesDrawnPer36MinuteRoleWeightedProfileSumHomeAwayPriorSeason',
    margin: 'hustle:chargesDrawnPer36MinuteRoleWeightedProfileDifferenceHomeMinusAwayPriorSeason',
  }),
});
const ALIAS_SLOTS = Object.freeze({
  total: Object.freeze({
    contestedShots: 'c51:meanBoxscoreStealsPer100Possessions20',
    deflections: 'c51:meanBoxscoreOpponentStealsPer100Possessions20',
    defensiveLooseBallRecoveries: 'c51:meanBoxscoreBlocksPer100OpponentPossessions20',
    chargesDrawn: 'c51:meanBoxscorePersonalFoulsPer100Possessions20',
  }),
  margin: Object.freeze({
    contestedShots: 'c51:boxscoreStealsRateAdvantage20',
    deflections: 'c51:boxscoreBlocksRateAdvantage20',
    defensiveLooseBallRecoveries: 'c51:boxscorePersonalFoulsAvoidedAdvantage20',
    chargesDrawn: 'c51:minuteShareOverlapAdvantage5',
  }),
});
const IDENTITY_FIELDS = Object.freeze([
  'gameRef', 'gameDateLocal', 'seasonStartYear', 'homeTeamRef', 'awayTeamRef', 'observedThrough', 'target',
]);
const METRICS = Object.freeze(Object.keys(FEATURE_NAMES));
const VARIANTS = Object.freeze([
  { id: 'baseline', heads: [] },
  { id: 'total-only', heads: ['total'] },
  { id: 'margin-only', heads: ['margin'] },
  { id: 'both', heads: ['total', 'margin'] },
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function requireFile(baseDirectory, value, label) {
  if (typeof value !== 'string' || !value.trim()) throw Error(label + ' path is required');
  const file = path.resolve(baseDirectory, value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw Error(label + ' is not a readable file: ' + file);
  return file;
}

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function assertSamePin(actual, expected, label) {
  if (!isRecord(actual) || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes
    || !samePath(actual.path, expected.path)) throw Error(`${label} pin differs from the supplied input`);
}

function assertManifestPin(verified, inputFile, inputPin, label) {
  const manifest = verified.manifest;
  const descriptors = [];
  const collect = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.path === 'string' && typeof value.sha256 === 'string' && Number.isSafeInteger(value.bytes)) {
      descriptors.push(value);
      return;
    }
    for (const item of Object.values(value)) collect(item);
  };
  collect(manifest);
  const direct = descriptors.some(descriptor => {
    const resolved = path.isAbsolute(descriptor.path)
      ? descriptor.path : path.resolve(path.dirname(verified.manifestPin.path), descriptor.path);
    return samePath(resolved, inputFile) && descriptor.sha256 === inputPin.sha256 && descriptor.bytes === inputPin.bytes;
  });
  const checked = verified.checked.some(item => samePath(item.path, inputFile)
    && item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes);
  if (!direct || !checked) throw Error(`${label} manifest must directly pin and verify the exact input`);
}

function validatePlan(plan) {
  if (!isRecord(plan) || plan.format !== PLAN_FORMAT) throw Error(`Expected ${PLAN_FORMAT}`);
  if (plan.warmupSeasonStartYear !== 2020 || plan.throughSeasonStartYear !== 2025
    || stable(plan.screenTargetSeasonStartYears) !== stable([2021, 2022, 2023, 2024, 2025])) {
    throw Error('This isolated adapter is pinned to Candidate 100 warmup 2020 and development seasons 2021–25');
  }
  if (stable(plan.aliasSlots) !== stable(ALIAS_SLOTS)) throw Error('Plan alias slots differ from the reviewed adapter allowlist map');
}

function validateFamilyReceipt(receipt, { basePin, hustlePin, screenPin, baselinePin, baselineManifestPin, plan }) {
  if (!isRecord(receipt) || receipt.format !== 'swishiq-player-hustle-feature-family-v1'
    || receipt.status !== 'isolated-prior-season-feature-artifact; model-screen-not-run') {
    throw Error('Expected the pinned isolated NBA.com player-hustle feature-family receipt');
  }
  assertSamePin(receipt.sourcePins?.baseFeatures, basePin, 'Hustle base-feature source');
  if (receipt.featureRows?.sha256 !== hustlePin.sha256 || receipt.featureRows?.bytes !== hustlePin.bytes) {
    throw Error('Hustle feature-family receipt does not pin the supplied feature rows');
  }
  assertSamePin(receipt.candidateCohort?.screenIndex, screenPin, 'Hustle baseline screen index');
  assertSamePin(receipt.candidateCohort?.screenForecastInput, baselinePin, 'Hustle Candidate 100 reference forecasts');
  assertSamePin(receipt.candidateCohort?.baselineMeanManifest, baselineManifestPin, 'Hustle baseline mean manifest');
  if (stable(receipt.featureNames) !== stable(FEATURE_NAMES)) throw Error('Hustle receipt semantic feature names differ from the adapter map');
  const temporal = receipt.temporalUse;
  if (temporal?.sourceSeasonRule !== 'For target season T, use NBA.com player-hustle from completed regular season T-1 only.'
    || temporal?.sameTargetDateGamesUsed !== false
    || !String(temporal?.roleWindowCutoff ?? '').includes('strictly earlier than target gameDateLocal')) {
    throw Error('Hustle family receipt lacks the strict prior-season and prior-date contract');
  }
  const cohort = receipt.candidateCohort;
  if (stable(cohort?.screenTargetSeasonStartYears) !== stable(plan.screenTargetSeasonStartYears)
    || cohort?.screenTargetRows !== 6150
    || stable(cohort?.warmupTargetSeasonStartYears) !== stable([plan.warmupSeasonStartYear])
    || cohort?.warmupTargetRowsBySeason?.[String(plan.warmupSeasonStartYear)] !== 1080
    || stable(cohort?.featureTargetSeasonStartYears) !== stable([2020, 2021, 2022, 2023, 2024, 2025])) {
    throw Error('Hustle receipt cohort or warmup counts differ from the required Candidate 100 screen');
  }
}

function validateSelectedBaselineFeatures(baseRows, adaptedRows, config) {
  const selected = { total: config.totalFeatureNames, margin: config.marginFeatureNames };
  for (let index = 0; index < baseRows.length; index++) {
    for (const head of ['total', 'margin']) for (const name of selected[head]) {
      const before = baseRows[index].features?.[head], after = adaptedRows[index].features?.[head];
      if (!isRecord(before) || !isRecord(after) || !Object.hasOwn(before, name) || !Object.hasOwn(after, name)) {
        throw Error(`Selected baseline feature ${head}.${name} is absent at row ${index}`);
      }
      const value = before[name];
      if (head === 'total' ? value !== null && !Number.isFinite(value) : !Number.isFinite(value)) {
        throw Error(`Selected baseline feature ${head}.${name} has invalid missingness at row ${index}`);
      }
      if (stable(before[name]) !== stable(after[name])) throw Error(`Selected baseline feature ${head}.${name} changed at row ${index}`);
    }
  }
}

function validateIdentityAndTemporal({ baseRows, hustleRows, baselineRows, receipt, screenIndex, config, plan }) {
  if (baseRows.length !== hustleRows.length || baseRows.length !== 7230) throw Error('Base and hustle feature row counts differ from the pinned cohort');
  const baseChronology = indexChronology(baseRows, { kind: 'feature' });
  const hustleChronology = indexChronology(hustleRows, { kind: 'feature' });
  if (baseChronology.targetIdentitySha256 !== hustleChronology.targetIdentitySha256) throw Error('Base and hustle feature chronology/target identities differ');
  const seasonCounts = new Map();
  const targetIdentity = [];
  for (let index = 0; index < baseRows.length; index++) {
    const base = baseRows[index], hustle = hustleRows[index], targetSeason = hustle.seasonStartYear;
    if (targetSeason < plan.warmupSeasonStartYear || targetSeason > plan.throughSeasonStartYear) throw Error(`Unexpected hustle target season ${targetSeason}`);
    for (const field of IDENTITY_FIELDS) if (stable(base[field]) !== stable(hustle[field])) throw Error(`Identity field ${field} differs at row ${index}`);
    const provenance = hustle.hustleFeatureProvenance;
    if (!isRecord(provenance) || provenance.sourceSeasonStartYear !== targetSeason - 1
      || !String(provenance.cutoff ?? '').includes('strictly earlier than target gameDateLocal')) {
      throw Error(`Strict prior-season/source-date contract failed at ${hustle.gameRef}`);
    }
    for (const side of ['home', 'away']) {
      const role = provenance[side];
      if (!isRecord(role) || role.priorTeamGames !== 10 || typeof role.latestPriorTeamGameDate !== 'string'
        || role.latestPriorTeamGameDate >= hustle.gameDateLocal || typeof role.firstPriorTeamGameDate !== 'string'
        || role.firstPriorTeamGameDate > role.latestPriorTeamGameDate) {
        throw Error(`Invalid prior-date ten-game ${side} role window at ${hustle.gameRef}`);
      }
    }
    for (const metric of METRICS) for (const head of ['total', 'margin']) {
      const name = FEATURE_NAMES[metric][head], value = hustle.features?.[head]?.[name];
      if (!Number.isFinite(value)) throw Error(`Hustle feature ${head}.${name} is not finite at ${hustle.gameRef}`);
    }
    seasonCounts.set(targetSeason, (seasonCounts.get(targetSeason) ?? 0) + 1);
    if (plan.screenTargetSeasonStartYears.includes(targetSeason)) targetIdentity.push([hustle.gameRef, hustle.gameDateLocal, targetSeason]);
  }
  const expectedCounts = { 2020: 1080, 2021: 1230, 2022: 1230, 2023: 1230, 2024: 1230, 2025: 1230 };
  for (const [season, expected] of Object.entries(expectedCounts)) if (seasonCounts.get(Number(season)) !== expected) {
    throw Error(`Hustle target count mismatch for season ${season}`);
  }
  const screenIdentitySha256 = hash(targetIdentity);
  if (screenIdentitySha256 !== receipt.candidateCohort.screenIdentitySha256
    || screenIdentitySha256 !== screenIndex.chronology?.targetIdentitySha256) {
    throw Error('Hustle, feature-family receipt and Candidate 100 screen target identities differ');
  }
  const forecastChronology = indexChronology(baselineRows, { kind: 'forecast' });
  if (forecastChronology.rowCount !== screenIndex.chronology?.rows || forecastChronology.dates.length !== screenIndex.chronology?.dates) {
    throw Error('Pinned Candidate 100 baseline forecast chronology dimensions differ from the screen receipt');
  }
  const forecastsByRef = new Map(baselineRows.map(row => [row.gameRef, row]));
  const baseByRef = new Map(baseRows.map(row => [row.gameRef, row]));
  let baselineScreenCount = 0;
  for (const season of plan.screenTargetSeasonStartYears) {
    const rowsInSeason = hustleRows.filter(row => row.seasonStartYear === season);
    for (const hustle of rowsInSeason) {
      const forecast = forecastsByRef.get(hustle.gameRef), base = baseByRef.get(hustle.gameRef);
      if (!forecast || !base) throw Error(`Candidate 100 baseline forecast absent for ${hustle.gameRef}`);
      for (const [forecastField, sourceField] of [
        ['gameDateLocal', 'gameDateLocal'], ['seasonStartYear', 'seasonStartYear'], ['homeTeamRef', 'homeTeamRef'],
        ['awayTeamRef', 'awayTeamRef'], ['target', 'target'], ['featureObservedThrough', 'observedThrough'],
      ]) if (stable(forecast[forecastField]) !== stable(hustle[sourceField])
        || stable(forecast[forecastField]) !== stable(base[sourceField])) {
        throw Error(`Baseline forecast ${hustle.gameRef} differs from source identity/cutoff ${sourceField}`);
      }
      if (forecast.modelVersion !== config.version) throw Error('Pinned Candidate 100 forecast model version differs from configuration');
      baselineScreenCount++;
    }
  }
  if (baselineScreenCount !== screenIndex.expectedTargets || baselineScreenCount !== 6150) throw Error('Pinned baseline forecast lacks the complete 2021–25 screen cohort');
  return {
    rowCount: hustleRows.length,
    seasonCounts: Object.fromEntries([...seasonCounts].sort(([a], [b]) => a - b)),
    developmentTargetIdentitySha256: screenIdentitySha256,
    baseChronologySha256: baseChronology.targetIdentitySha256,
    hustleChronologySha256: hustleChronology.targetIdentitySha256,
    baselineForecastChronologySha256: forecastChronology.targetIdentitySha256,
    baselineDevelopmentForecastRows: baselineScreenCount,
    allRoleWindowsAreTenGamesStrictlyPriorDate: true,
    sourceSeasonIsTargetSeasonMinusOne: true,
  };
}

function validateBaselineReuse({ config, configPin, basePin, baselinePin, baselineManifest, baselineScreen, baselineScreenPin, hustleReceipt, plan }) {
  assertManifestPin(baselineManifest, baselinePin.path, baselinePin, 'Candidate 100 baseline forecast');
  assertManifestPin(baselineManifest, configPin.path, configPin, 'Candidate 100 configuration');
  const screen = baselineScreen;
  if (!isRecord(screen) || screen.format !== 'swishiq-batched-uncertainty-screen-v1'
    || screen.inputPin?.sha256 !== baselinePin.sha256 || screen.inputPin?.bytes !== baselinePin.bytes
    || screen.sourceManifestPin?.sha256 !== baselineManifest.manifestPin.sha256
    || screen.sourceManifestPin?.bytes !== baselineManifest.manifestPin.bytes
    || !samePath(screen.sourceManifestPin?.path, baselineManifest.manifestPin.path)
    || screen.configurationPin?.sha256 !== configPin.sha256 || screen.configurationPin?.bytes !== configPin.bytes
    || !samePath(screen.configurationPin?.path, configPin.path)
    || stable(screen.targetSeasonStartYears) !== stable(plan.screenTargetSeasonStartYears)
    || screen.expectedTargets !== hustleReceipt.candidateCohort.screenTargetRows
    || !Array.isArray(screen.results) || !screen.results.length
    || screen.results.some(result => !result.settings || result.summary?.pooled?.probability?.n !== screen.expectedTargets)) {
    throw Error('Existing Candidate 100 screen does not match pinned forecasts/configuration/cohort');
  }
  return {
    targetSeasonStartYears: screen.targetSeasonStartYears,
    expectedTargets: screen.expectedTargets,
    baselineForecasts: baselinePin,
    baselineScreenIndex: baselineScreenPin,
    baselineSettings: screen.results.map(result => ({ id: result.id, settings: result.settings })),
    sourceFeaturePin: basePin,
    reuseStatus: 'passed-preparation-checks; baseline screen reused; no baseline fit or scoring performed',
  };
}

function adaptedRows(hustleRows) {
  return hustleRows.map(row => {
    const total = { ...row.features.total }, margin = { ...row.features.margin };
    for (const metric of METRICS) {
      total[ALIAS_SLOTS.total[metric]] = row.features.total[FEATURE_NAMES[metric].total];
      margin[ALIAS_SLOTS.margin[metric]] = row.features.margin[FEATURE_NAMES[metric].margin];
    }
    return { ...row, features: { ...row.features, total, margin } };
  });
}

function buildVariantConfiguration(baseConfig, variant) {
  const config = structuredClone(baseConfig);
  const activatedSlots = new Set();
  for (const head of variant.heads) for (const slot of Object.values(ALIAS_SLOTS[head])) {
    if (config[head + 'FeatureNames'].includes(slot)) throw Error(`Alias slot is already selected: ${head}.${slot}`);
    config[head + 'FeatureNames'].push(slot);
    activatedSlots.add(slot);
    config.featureRidgePenaltyMultipliers ??= { total: {}, margin: {} };
    config.featureRidgePenaltyMultipliers[head] ??= {};
    config.featureRidgePenaltyMultipliers[head][slot] = 1;
  }
  config.totalPredictorCount = config.totalFeatureNames.length;
  config.marginPredictorCount = config.marginFeatureNames.length;
  if (Array.isArray(config.excludedFeatures)) config.excludedFeatures = config.excludedFeatures.filter(name => !activatedSlots.has(name));
  config.version = `swishiq-v4-game-lab-candidate100-hustle-${variant.id}-v1`;
  config.status = 'development-unvalidated';
  config.developmentNumericalGateStatus = 'prepared-only; model-screen-not-run';
  config.independentPredictiveValidityEstablished = false;
  config.prospectiveValidityEstablished = false;
  config.promotionAllowed = false;
  config.experimentPreparation = {
    featureFamily: 'NBA.com player-hustle defensive activity rates',
    status: 'development-unvalidated; preparation-only',
    selectedHeads: variant.heads,
    aliasedExperimentalSlots: [...activatedSlots],
    modelScreenExecuted: false,
    promotionAllowed: false,
  };
  validateMeanConfiguration(config);
  for (const name of config.totalFeatureNames) if (!CANDIDATE57_TOTAL_FEATURE_NAMES.includes(name)) throw Error('Total feature outside Candidate57 allowlist: ' + name);
  for (const name of config.marginFeatureNames) if (!CANDIDATE57_MARGIN_FEATURE_NAMES.includes(name)) throw Error('Margin feature outside Candidate57 allowlist: ' + name);
  return config;
}

function writeVariant({ invocation, variant, config, baselineBytes }) {
  const directory = path.join(invocation, 'configurations');
  const file = path.join(directory, `candidate100-hustle-${variant.id}.json`);
  if (variant.id === 'baseline') {
    fs.mkdirSync(directory, { recursive: true });
    atomicWrite(file, baselineBytes);
    return { id: variant.id, configuration: pin(file), heads: variant.heads, developmentUnvalidated: true, promotionAllowed: false };
  }
  writeJson(file, config);
  return { id: variant.id, configuration: pin(file), heads: variant.heads, developmentUnvalidated: true, promotionAllowed: false };
}

export function buildCandidate100HustleAliasAdapter(plan, { baseDirectory = process.cwd(), planFile = null } = {}) {
  validatePlan(plan);
  const baseFile = requireFile(baseDirectory, plan.baseFeatures, 'baseFeatures');
  const hustleFile = requireFile(baseDirectory, plan.hustleFeatures, 'hustleFeatures');
  const hustleManifestFile = requireFile(baseDirectory, plan.hustleManifest, 'hustleManifest');
  const hustleReceiptFile = requireFile(baseDirectory, plan.hustleFamilyReceipt, 'hustleFamilyReceipt');
  const configFile = requireFile(baseDirectory, plan.candidate100Configuration, 'candidate100Configuration');
  const baselineForecastsFile = requireFile(baseDirectory, plan.baselineReferenceForecasts, 'baselineReferenceForecasts');
  const baselineManifestFile = requireFile(baseDirectory, plan.baselineReferenceManifest, 'baselineReferenceManifest');
  const baselineScreenFile = requireFile(baseDirectory, plan.baselineReferenceScreenIndex, 'baselineReferenceScreenIndex');
  const cacheRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.cacheRoot ?? '../runs/cache'));
  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/hustle-alias-adapters'));

  const planPin = planFile ? pin(planFile) : null;
  const configBytes = loadPinnedBytes(configFile);
  const config = JSON.parse(configBytes.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  validateMeanConfiguration(config);
  if (!/candidate100/i.test(config.version ?? '') || config.status !== 'development-unvalidated') throw Error('Pinned configuration is not an unvalidated Candidate 100 development configuration');
  if (config.totalFeatureNames.length !== 40 || config.marginFeatureNames.length !== 39
    || config.totalPredictorCount !== 40 || config.marginPredictorCount !== 39) throw Error('Candidate 100 baseline feature counts differ from the pinned 40/39 model');
  for (const head of ['total', 'margin']) {
    const allowlist = head === 'total' ? CANDIDATE57_TOTAL_FEATURE_NAMES : CANDIDATE57_MARGIN_FEATURE_NAMES;
    const slots = Object.values(ALIAS_SLOTS[head]);
    if (new Set(slots).size !== slots.length) throw Error(`Duplicate ${head} alias slots`);
    for (const slot of slots) {
      if (!allowlist.includes(slot)) throw Error(`Hustle slot is outside Candidate57 ${head} allowlist: ${slot}`);
      if (config[head + 'FeatureNames'].includes(slot)) throw Error(`Hustle slot is already selected by Candidate100: ${slot}`);
      if (!config.excludedFeatures?.includes(slot)) throw Error(`Hustle slot is not explicitly excluded by baseline Candidate100: ${slot}`);
    }
  }

  const base = loadPinnedJsonl(baseFile), hustle = loadPinnedJsonl(hustleFile);
  const hustleManifest = verifyManifest(hustleManifestFile);
  assertManifestPin(hustleManifest, hustleFile, hustle.inputPin, 'Hustle feature-family');
  const familyReceipt = loadPinnedJson(hustleReceiptFile);
  assertManifestPin(hustleManifest, hustleReceiptFile, familyReceipt.inputPin, 'Hustle feature-family receipt');
  const baseline = loadPinnedJsonl(baselineForecastsFile);
  const baselineManifest = verifyManifest(baselineManifestFile);
  const screenIndexInput = loadPinnedJson(baselineScreenFile);
  const baselineScreenPin = screenIndexInput.inputPin;
  const basePin = base.inputPin, hustlePin = hustle.inputPin;
  validateFamilyReceipt(familyReceipt.value, {
    basePin, hustlePin, screenPin: baselineScreenPin, baselinePin: baseline.inputPin,
    baselineManifestPin: baselineManifest.manifestPin, plan,
  });
  const screenIndex = screenIndexInput.value;
  const identityAudit = validateIdentityAndTemporal({ baseRows: base.rows, hustleRows: hustle.rows,
    baselineRows: baseline.rows, receipt: familyReceipt.value, screenIndex, config, plan });
  validateSelectedBaselineFeatures(base.rows, hustle.rows, config);
  const baselineReuse = validateBaselineReuse({ config, configPin: configBytes.inputPin, basePin,
    baselinePin: baseline.inputPin, baselineManifest, baselineScreen: screenIndex,
    baselineScreenPin, hustleReceipt: familyReceipt.value, plan });

  for (const head of ['total', 'margin']) for (const metric of METRICS) {
    const slot = ALIAS_SLOTS[head][metric];
    for (const row of config[head + 'FeatureNames']) if (row === slot) throw Error('Alias slot collided with a selected Candidate 100 predictor');
  }
  const rows = adaptedRows(hustle.rows);
  indexChronology(rows, { kind: 'feature' });
  validateSelectedBaselineFeatures(base.rows, rows, config);
  for (const row of rows) for (const head of ['total', 'margin']) for (const metric of METRICS) {
    if (!Number.isFinite(row.features[head][ALIAS_SLOTS[head][metric]])) throw Error(`Adapted hustle alias is nonfinite at ${row.gameRef}/${head}/${metric}`);
  }

  const codePins = pinModuleClosure([import.meta.filename]);
  const signature = {
    format: ADAPTER_FORMAT,
    planPin,
    candidate100ConfigurationPin: configBytes.inputPin,
    baseFeaturePin: basePin,
    hustleFeaturePin: hustlePin,
    hustleManifestPin: hustleManifest.manifestPin,
    // This is a descriptive evidence document, not a recursively traversable
    // artifact manifest. The verified hustleManifestPin pins its exact bytes.
    hustleFamilyEvidencePin: familyReceipt.inputPin,
    baselineReferenceForecastsPin: baseline.inputPin,
    baselineReferenceManifestPin: baselineManifest.manifestPin,
    baselineReferenceScreenIndexPin: baselineScreenPin,
    semanticFeatureNames: FEATURE_NAMES,
    aliasSlots: ALIAS_SLOTS,
    warmupSeasonStartYear: plan.warmupSeasonStartYear,
    screenTargetSeasonStartYears: plan.screenTargetSeasonStartYears,
    throughSeasonStartYear: plan.throughSeasonStartYear,
    codePins,
    nodeVersion: process.version,
  };
  const artifact = withArtifactCache(cacheRoot, CACHE_STAGE, signature, directory => {
    const rowsFile = path.join(directory, 'feature-rows.jsonl');
    const mapFile = path.join(directory, 'semantic-to-model-slot-map.json');
    const manifestFile = path.join(directory, 'adapter-manifest.json');
    const serializedRows = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(rowsFile, serializedRows, { flag: 'wx' });
    const outputPin = pin(rowsFile);
    const aliasMap = {
      format: 'swishiq-semantic-feature-alias-map-v1',
      status: 'experiment-only-model-slot-aliases; development-unvalidated',
      mappings: ['total', 'margin'].flatMap(head => METRICS.map(metric => ({
        head, metric, semanticFeature: FEATURE_NAMES[metric][head], modelSlot: ALIAS_SLOTS[head][metric],
        penaltyMultiplier: 1, overwrittenBaselineSlotWasUnselectedAndExcluded: true,
      }))),
      note: 'All four source metrics are retained in the semantic columns. Candidate57 sees an alias only when a prepared configuration selects that head. Decode coefficient labels with this map. This is development-only; promotionAllowed=false.',
    };
    writeJson(mapFile, aliasMap);
    writeJson(manifestFile, {
      format: ADAPTER_FORMAT,
      status: 'prepared; development-unvalidated; model-screen-not-run',
      promotionAllowed: false,
      sourcePins: {
        plan: planPin,
        candidate100Configuration: configBytes.inputPin,
        baseFeatures: basePin,
        hustleFeatures: hustlePin,
        hustleManifest: hustleManifest.manifestPin,
        hustleFamilyReceipt: familyReceipt.inputPin,
        baselineReferenceForecasts: baseline.inputPin,
        baselineReferenceManifest: baselineManifest.manifestPin,
        baselineReferenceScreenIndex: baselineScreenPin,
      },
      codePins,
      temporalUse: familyReceipt.value.temporalUse,
      aliasMap,
      validation: {
        ...identityAudit,
        baselineReuse,
        selectedBaselinePredictorsUnchanged: true,
        allFourHustleFeaturesFiniteForEveryRow: true,
        onlyExplicitlyExcludedAllowlistedSlotsAliased: true,
        modelScreenExecuted: false,
        promotionAllowed: false,
      },
      outputFeatures: { path: 'feature-rows.jsonl', rows: rows.length, bytes: outputPin.bytes, sha256: outputPin.sha256 },
      limitation: 'Preparation only: no mean fit, uncertainty screen, candidate comparison, promotion or predictive-validity claim was executed.',
    });
    return { rows: rows.length, outputFeaturePin: outputPin, developmentTargetIdentitySha256: identityAudit.developmentTargetIdentitySha256,
      seasonCounts: identityAudit.seasonCounts };
  });

  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, `run-${Date.now()}-${process.pid}-${randomUUID()}`);
  fs.mkdirSync(invocation, { recursive: false });
  const variants = VARIANTS.map(variant => writeVariant({ invocation, variant,
    config: variant.id === 'baseline' ? config : buildVariantConfiguration(config, variant), baselineBytes: configBytes.buffer }));
  const variantConfigs = variants.filter(item => item.id !== 'baseline');
  const featureRowsFile = path.join(artifact.directory, 'feature-rows.jsonl');
  const featureManifestFile = path.join(artifact.directory, 'receipt.json');
  const meansPlanFile = path.join(invocation, 'plans', 'candidate100-hustle-three-variant-means.json');
  writeJson(meansPlanFile, {
    format: 'swishiq-mean-batch-plan-v1',
    status: 'prepared; development-unvalidated; scoring-not-run',
    features: featureRowsFile,
    sourceManifest: featureManifestFile,
    warmupSeasonStartYear: plan.warmupSeasonStartYear,
    throughSeasonStartYear: plan.throughSeasonStartYear,
    cacheRoot: path.join(invocation, 'mean-cache'),
    outputDirectory: path.join(invocation, 'means'),
    fullCoefficientRefits: false,
    maxWorkers: 1,
    configurations: variantConfigs.map(item => ({ id: item.id, configuration: item.configuration.path })),
    promotionAllowed: false,
  });
  const baselineReusePlanFile = path.join(invocation, 'plans', 'candidate100-hustle-baseline-reuse-gate.json');
  writeJson(baselineReusePlanFile, {
    format: 'swishiq-candidate100-hustle-baseline-reuse-gate-v1',
    status: 'passed-preparation-checks; existing-baseline-reused; scoring-not-run',
    referenceForecasts: baseline.inputPin,
    referenceManifest: baselineManifest.manifestPin,
    existingBaselineScreenIndex: baselineScreenPin,
    candidate100Configuration: configBytes.inputPin,
    baselineConfiguration: variants[0].configuration,
    assessment: baselineReuse,
    noBaselineRefitOrScreenRun: true,
    developmentUnvalidated: true,
    promotionAllowed: false,
  });
  const pairedPlanFile = path.join(invocation, 'plans', 'candidate100-hustle-paired-screen-plan.json');
  writeJson(pairedPlanFile, {
    format: 'swishiq-candidate100-hustle-paired-screen-plan-v1',
    status: 'prepared; model-screen-not-run; development-unvalidated',
    executionContract: 'After separate mean forecasts are produced, apply the same pinned Candidate 100 screen settings to each forecast and compare on identical 2021–25 targets. This plan itself does not run a scorer.',
    targetSeasonStartYears: plan.screenTargetSeasonStartYears,
    expectedTargetGames: 6150,
    warmupSeasonStartYear: plan.warmupSeasonStartYear,
    meansPlan: pin(meansPlanFile),
    baselineReuseGate: pin(baselineReusePlanFile),
    variants: [
      { id: 'baseline', member: 'reuse-pinned-candidate100-forecast-and-screen', configuration: variants[0].configuration,
        forecast: baseline.inputPin, screenIndex: baselineScreenPin },
      ...variantConfigs.map(item => ({ id: item.id, member: 'prepared-hustle-alias-mean-plan', configuration: item.configuration,
        forecast: null, screenIndex: null })),
    ],
    headIsolationInvariants: [
      { left: 'baseline.margin', right: 'total-only.margin', predictionField: 'margin' },
      { left: 'baseline.total', right: 'margin-only.total', predictionField: 'total' },
      { left: 'total-only.total', right: 'both.total', predictionField: 'total' },
      { left: 'margin-only.margin', right: 'both.margin', predictionField: 'margin' },
    ],
    requiredPointMetrics: ['totalMae', 'totalRmse', 'totalBias', 'marginMae', 'marginRmse', 'marginBias'],
    reusedBaselineScreenSettings: baselineReuse.baselineSettings,
    developmentEvidenceOnly: true,
    promotionAllowed: false,
    modelScreenExecuted: false,
  });
  const result = {
    format: `${ADAPTER_FORMAT}-run-v1`,
    status: 'candidate100-hustle-alias-prepared; development-unvalidated; model-screen-not-run',
    promotionAllowed: false,
    invocation,
    cacheHit: artifact.cacheHit,
    cacheKey: artifact.key,
    cacheDirectory: artifact.directory,
    cacheReceipt: pin(featureManifestFile),
    featureRows: pin(featureRowsFile),
    semanticToModelSlotMap: pin(path.join(artifact.directory, 'semantic-to-model-slot-map.json')),
    adapterManifest: pin(path.join(artifact.directory, 'adapter-manifest.json')),
    variants,
    meansPlan: pin(meansPlanFile),
    baselineReuseGate: pin(baselineReusePlanFile),
    pairedScreenPlan: pin(pairedPlanFile),
    sourcePins: {
      plan: planPin, candidate100Configuration: configBytes.inputPin, baseFeatures: basePin,
      hustleFeatures: hustlePin, hustleManifest: hustleManifest.manifestPin, hustleFamilyReceipt: familyReceipt.inputPin,
      baselineReferenceForecasts: baseline.inputPin, baselineReferenceManifest: baselineManifest.manifestPin,
      baselineReferenceScreenIndex: baselineScreenPin, code: codePins,
    },
    baselineReuse,
    modelScreenExecuted: false,
  };
  writeJson(path.join(invocation, 'run.json'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const planFile = process.argv[2];
  if (!planFile || process.argv.includes('--help')) {
    console.log('Usage: node build-candidate100-hustle-alias-adapter.mjs <plan.json>\nPrepares isolated Candidate100 hustle alias rows/configs/plans under experiment-tools/runs; does not score or promote.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const absolutePlan = path.resolve(planFile);
  const { value: plan } = loadPinnedJson(absolutePlan);
  const result = buildCandidate100HustleAliasAdapter(plan, { baseDirectory: path.dirname(absolutePlan), planFile: absolutePlan });
  console.log(JSON.stringify({ status: result.status, cacheHit: result.cacheHit, featureRows: result.featureRows,
    invocation: result.invocation, variants: result.variants.map(({ id, configuration, heads }) => ({ id, configuration, heads })),
    pairedScreenPlan: result.pairedScreenPlan, modelScreenExecuted: false, promotionAllowed: false }));
}

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readJson, writeJson, pin, verifyManifest, withArtifactCache } from './lib/artifacts.mjs';
import { validateMeanConfiguration } from './lib/configuration.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { candidate21FeatureSet } from './build-candidate100-candidate21-boxscore-feature-artifact-v2.mjs';

const EXPECTED_ARTIFACT_FORMAT = 'swishiq-candidate100-candidate21-boxscore-feature-artifact-v1-run-v1';
const HEADS = ['total', 'margin'];
const SCREEN_SEASONS = [2022, 2023, 2024, 2025];

function verifyPin(saved, label) {
  if (!saved || typeof saved.path !== 'string') throw Error('Expected a pinned ' + label);
  const actual = pin(saved.path);
  if (actual.bytes !== saved.bytes || actual.sha256 !== saved.sha256) throw Error(label + ' changed: ' + saved.path);
  return saved.path;
}

function requireArtifact(runFile) {
  const artifact = readJson(runFile);
  const featureSet = artifact.featureSet ?? 'raw';
  const screenFeatures = candidate21FeatureSet(featureSet);
  if (artifact.format !== EXPECTED_ARTIFACT_FORMAT || artifact.modelFitExecuted || artifact.modelScreenExecuted
    || artifact.promotionAllowed || artifact.status !== 'completed-feature-artifact; model-screen-not-run') {
    throw Error('Expected the completed non-fitting Candidate100/Candidate21 feature artifact');
  }
  const featureRows = verifyPin(artifact.featureRows, 'Candidate21 feature rows');
  const receipt = verifyPin(artifact.receipt, 'Candidate21 artifact receipt');
  const familyFile = verifyPin(artifact.featureFamily, 'Candidate21 feature-family contract');
  const verified = verifyManifest(receipt);
  if (!verified.checked.some(item => item.sha256 === artifact.featureRows.sha256 && item.bytes === artifact.featureRows.bytes)) {
    throw Error('Candidate21 artifact receipt does not pin its feature rows');
  }
  const family = readJson(familyFile);
  if (family.format !== 'swishiq-candidate100-candidate21-boxscore-feature-artifact-v1'
    || (family.featureSet ?? 'raw') !== featureSet
    || family.featureRows?.sha256 !== artifact.featureRows.sha256 || family.featureRows?.bytes !== artifact.featureRows.bytes
    || family.coverage?.allRowsHaveStrictlyPriorContext !== true
    || family.coverage?.allSelectedCandidate100FeaturesPreserved !== true) {
    throw Error('Candidate21 artifact family contract is incomplete or mismatched');
  }
  for (const head of HEADS) for (const group of Object.keys(screenFeatures[head])) {
    const names = family.featureNames?.[head]?.[group];
    if (JSON.stringify(names) !== JSON.stringify(screenFeatures[head][group])) {
      throw Error('Candidate21 feature-name contract changed: ' + head + '/' + group);
    }
  }
  return { artifact, featureRows, receipt, family, familyFile };
}

function createBaseInputBridge({ cacheRoot, artifactRunFile, artifact, baseFeatureRows, baseSourceManifest }) {
  const featurePin = pin(baseFeatureRows);
  const sourceManifestPin = pin(baseSourceManifest);
  verifyManifest(baseSourceManifest);
  const bridge = withArtifactCache(cacheRoot, 'candidate21-baseline-input', {
    format: 'swishiq-candidate100-candidate21-baseline-input-bridge-v1',
    sourceFeatureRows: featurePin,
    sourceManifest: sourceManifestPin,
    candidate21ArtifactRun: pin(artifactRunFile),
    candidate100Configuration: artifact.sourcePins?.candidate100Configuration ?? null,
  }, directory => {
    writeJson(path.join(directory, 'baseline-input.json'), {
      format: 'swishiq-candidate100-candidate21-baseline-input-bridge-v1',
      sourceFeatureRows: featurePin,
      sourceManifest: sourceManifestPin,
      candidate21ArtifactRun: pin(artifactRunFile),
      note: 'Pins the original Candidate57 rows and their upstream source manifest for an unchanged Candidate100 comparison; no source rows were copied or changed.',
    });
  });
  const receipt = path.join(bridge.directory, 'receipt.json');
  const verified = verifyManifest(receipt);
  if (!verified.checked.some(item => item.sha256 === featurePin.sha256 && item.bytes === featurePin.bytes)) {
    throw Error('Candidate21 baseline-input bridge does not pin the original feature rows');
  }
  return { ...bridge, receipt, featurePin, sourceManifestPin };
}

function candidateSpecs(family) {
  const specs = [];
  const screenFeatures = candidate21FeatureSet(family.featureSet);
  const prefix = family.featureSet === 'opponent-adjusted-pace' ? 'c21-adjusted-'
    : family.featureSet === 'opponent-adjusted' ? 'c21-adjusted-' : 'c21-';
  for (const [group, features] of Object.entries(screenFeatures.total)) {
    specs.push({ id: prefix + group + '-total', group, head: 'total', features });
  }
  for (const [group, features] of Object.entries(screenFeatures.margin)) {
    specs.push({ id: prefix + group + '-margin', group, head: 'margin', features });
  }
  return specs;
}

function makeConfigurations({ baseline, baselineFile, family, output }) {
  const specs = candidateSpecs(family);
  const featureNames = {
    total: [...new Set(specs.filter(item => item.head === 'total').flatMap(item => item.features))],
    margin: [...new Set(specs.filter(item => item.head === 'margin').flatMap(item => item.features))],
  };
  const formula = Object.entries(family.featureDefinitions).map(([name, value]) => name + ': ' + value).join('; ');
  const developmentFeatureContract = {
    format: 'swishiq-development-feature-contract-v1',
    source: family.contract.inputSource,
    formula,
    observedThroughRule: family.contract.observedThroughRule,
    featureNames,
  };
  const configurations = [];
  for (const spec of specs) {
    const config = structuredClone(baseline);
    const key = spec.head + 'FeatureNames';
    if (spec.features.some(feature => baseline[key].includes(feature))) throw Error('Candidate feature already exists in Candidate100: ' + spec.id);
    config.version = 'swishiq-v4-game-lab-candidate100-' + spec.id + '-development-v1';
    config[key] = [...baseline[key], ...spec.features];
    config[spec.head + 'PredictorCount'] = config[key].length;
    for (const feature of spec.features) config.featureRidgePenaltyMultipliers[spec.head][feature] = 1;
    config.developmentFeatureContract = structuredClone(developmentFeatureContract);
    config.status = 'development-unvalidated';
    config.independentPredictiveValidityEstablished = false;
    config.prospectiveValidityEstablished = false;
    config.promotionAllowed = false;
    config.experimentPreparation = {
      family: 'candidate21-boxscore-history',
      group: spec.group,
      head: spec.head,
      features: spec.features,
      featureDefinition: family.featureDefinitions[spec.group],
      parentConfiguration: pin(baselineFile),
    };
    validateMeanConfiguration(config);
    const otherHead = spec.head === 'total' ? 'margin' : 'total';
    if (JSON.stringify(config[otherHead + 'FeatureNames']) !== JSON.stringify(baseline[otherHead + 'FeatureNames'])) {
      throw Error('Non-target head changed for ' + spec.id);
    }
    const configuration = path.join(output, 'configurations', spec.id + '.json');
    writeJson(configuration, config);
    configurations.push({ ...spec, configuration });
  }
  return { configurations, developmentFeatureContract };
}

function canonicalScreen(outputDirectory, cacheRoot) {
  return {
    format: 'swishiq-uncertainty-screen-plan-v1',
    cacheRoot,
    outputDirectory,
    targetSeasonStartYears: SCREEN_SEASONS,
    includeCalibrationSlope: true,
    maxWorkers: 3,
    fullReceiptIds: ['configured-canonical'],
    variants: [{ id: 'configured-canonical', settings: {}, forceCanonical: true }],
  };
}

export function prepareCandidate100Candidate21BoxscoreScreen(artifactRunFile, baselineScreenIndex, baselineParityReceipt) {
  const artifactRun = path.resolve(artifactRunFile);
  const input = requireArtifact(artifactRun);
  const baselineFile = verifyPin(input.artifact.sourcePins?.candidate100Configuration, 'Candidate100 configuration');
  const baseline = readJson(baselineFile);
  validateMeanConfiguration(baseline);
  if (!/candidate100/i.test(baseline.version ?? '') || baseline.totalFeatureNames.length !== 40
    || baseline.marginFeatureNames.length !== 39 || baseline.developmentFeatureContract !== undefined) {
    throw Error('Expected the unchanged pinned 40/39 Candidate100 baseline configuration');
  }
  const baseFeatureRows = verifyPin(input.artifact.sourcePins?.baseFeatureRows, 'base Candidate57 feature rows');
  const baseSourceManifest = verifyPin(input.artifact.sourcePins?.baseSourceManifest, 'base Candidate57 source manifest');
  const baselineIndexFile = path.resolve(baselineScreenIndex);
  const baselineParityFile = path.resolve(baselineParityReceipt);
  const baselineIndex = readJson(baselineIndexFile);
  const parity = readJson(baselineParityFile);
  if (baselineIndex.format !== 'swishiq-batched-uncertainty-screen-v1'
    || baselineIndex.status !== 'opened-label-screen-only; not-independent-validation'
    || JSON.stringify(baselineIndex.targetSeasonStartYears) !== JSON.stringify(SCREEN_SEASONS)) {
    throw Error('Candidate100 baseline screen does not cover the required 2022-26 development cohort');
  }
  if (parity.status !== 'passed; unchanged Candidate100 score means are numerically identical through the development path'
    || parity.comparison?.exactPredictionValueParity !== true || parity.comparison?.rows !== 6824
    || parity.comparison?.maximumAbsoluteDifference?.total !== 0
    || parity.comparison?.maximumAbsoluteDifference?.margin !== 0
    || parity.configuration?.sha256 !== pin(baselineFile).sha256
    || parity.configuration?.bytes !== pin(baselineFile).bytes) {
    throw Error('A current exact Candidate100 parity receipt is required before the new feature screen');
  }
  const cacheRoot = path.resolve(import.meta.dirname, 'runs/cache');
  const outputFamily = input.family.featureSet === 'opponent-adjusted-pace' ? 'adjusted-pace-screen'
    : input.family.featureSet === 'opponent-adjusted'
      ? 'candidate100-candidate21-adjusted-individual' : 'candidate100-candidate21-boxscore-individual';
  const output = assertDiagnosticOutput(path.join(import.meta.dirname, 'runs', outputFamily,
    'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(output, { recursive: true });
  const baselineBridge = createBaseInputBridge({
    cacheRoot,
    artifactRunFile: artifactRun,
    artifact: input.artifact,
    baseFeatureRows,
    baseSourceManifest,
  });
  const { configurations, developmentFeatureContract } = makeConfigurations({
    baseline,
    baselineFile,
    family: input.family,
    output,
  });
  const expectedConfigurations = { raw: 7, 'opponent-adjusted': 8, 'opponent-adjusted-pace': 1 }[input.family.featureSet ?? 'raw'];
  if (configurations.length !== expectedConfigurations) throw Error('Unexpected Candidate21 feature screen count');
  if (configurations.some(item => JSON.stringify(readJson(item.configuration).developmentFeatureContract) !== JSON.stringify(developmentFeatureContract))) {
    throw Error('Experimental feature contract must remain identical across the candidate screen batch');
  }
  const candidatePipeline = {
    format: 'swishiq-experiment-plan-v1',
    outputDirectory: path.join(output, 'candidate-pipeline'),
    means: {
      format: 'swishiq-mean-batch-plan-v1',
      features: input.featureRows,
      sourceManifest: input.receipt,
      warmupSeasonStartYear: 2020,
      throughSeasonStartYear: 2025,
      maxWorkers: 4,
      cacheRoot,
      outputDirectory: path.join(output, 'candidate-means'),
      configurations: configurations.map(({ id, configuration }) => ({ id, configuration })),
    },
    screen: canonicalScreen(path.join(output, 'candidate-screens'), cacheRoot),
  };
  const candidatePipelineFile = path.join(output, 'candidate-pipeline-plan.json');
  writeJson(candidatePipelineFile, candidatePipeline);
  const result = {
    format: 'swishiq-candidate100-candidate21-boxscore-individual-screen-v1',
    featureSet: input.family.featureSet ?? 'raw',
    status: 'prepared; baseline-parity-and-same-cohort-required',
    outputDirectory: output,
    artifactRun: pin(artifactRun),
    baseline: {
      configuration: pin(baselineFile),
      featureRows: pin(baseFeatureRows),
      sourceManifest: pin(baseSourceManifest),
      inputBridge: pin(baselineBridge.receipt),
      screenIndex: pin(baselineIndexFile),
      parityReceipt: pin(baselineParityFile),
    },
    candidateInputs: {
      featureRows: pin(input.featureRows),
      artifactReceipt: pin(input.receipt),
      featureFamily: pin(input.familyFile),
      developmentFeatureContract,
    },
    candidatePipelineFile,
    candidates: configurations.map(({ id, group, head, features, configuration }) => ({
      id, group, head, features, configuration: pin(configuration),
    })),
    targetSeasonStartYears: SCREEN_SEASONS,
    targetGamesExpected: 4920,
    perSeasonGamesExpected: { 2022: 1230, 2023: 1230, 2024: 1230, 2025: 1230 },
    developmentOnly: true,
    promotionAllowed: false,
    decision: input.family.featureSet === 'opponent-adjusted-pace'
      ? 'Run one total-head opponent-adjusted pace addition against the same Candidate100 development cohort. Keep all other mean and uncertainty settings fixed; report raw total errors and paired uncertainty before retaining it.'
      : input.family.featureSet === 'opponent-adjusted'
      ? 'Run eight one-feature, one-head opponent-adjusted Four-Factor additions against the same Candidate100 development cohort. Keep all other means and uncertainty settings fixed; combine only individually useful additions.'
      : 'Run one-family-at-a-time pace and raw Four-Factor additions against the same Candidate100 development cohort; compare each head addition separately.',
  };
  writeJson(path.join(output, 'preparation.json'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [artifactRunFile, baselineScreenIndex, baselineParityReceipt] = process.argv.slice(2);
  if (!artifactRunFile || !baselineScreenIndex || !baselineParityReceipt || process.argv.includes('--help')) {
    console.log('Usage: node prepare-candidate100-candidate21-boxscore-screen.mjs <artifact-run.json> <baseline-screen-index.json> <baseline-parity.json>');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  console.log(JSON.stringify(prepareCandidate100Candidate21BoxscoreScreen(
    path.resolve(artifactRunFile), path.resolve(baselineScreenIndex), path.resolve(baselineParityReceipt))));
}

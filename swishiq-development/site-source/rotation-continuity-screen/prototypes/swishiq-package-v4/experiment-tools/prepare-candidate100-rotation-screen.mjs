import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readJson, writeJson, pin, stable, verifyManifest, withArtifactCache } from './lib/artifacts.mjs';
import { validateMeanConfiguration } from './lib/configuration.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';

function verifyPin(saved) {
  if (!saved || typeof saved.path !== 'string') throw Error('Expected a pinned source descriptor');
  const actual = pin(saved.path);
  if (actual.bytes !== saved.bytes || actual.sha256 !== saved.sha256) {
    throw Error('Prepared source changed: ' + saved.path);
  }
  return saved.path;
}

function requireRotationMappings(adapter) {
  const map = adapter.semanticToModelSlotMap;
  if (!map || map.format !== 'swishiq-candidate100-rotation-continuity-semantic-to-model-slot-map-v1'
    || !Array.isArray(map.mappings)) {
    throw Error('Expected the verified rotation-continuity semantic-to-slot map');
  }
  if (map.mappings.length !== 6) throw Error('Expected exactly six individual rotation-continuity mappings');
  const ids = new Set();
  for (const mapping of map.mappings) {
    if (!['total', 'margin'].includes(mapping.head) || typeof mapping.metric !== 'string'
      || typeof mapping.modelSlot !== 'string' || !mapping.modelSlot.length
      || !mapping.namePreservingAlias || !mapping.candidate100SlotExplicitlyExcluded) {
      throw Error('Invalid rotation-continuity mapping: ' + JSON.stringify(mapping));
    }
    const id = 'rotation-' + mapping.metric + '-' + mapping.head;
    if (ids.has(id)) throw Error('Duplicate rotation-continuity screen ID: ' + id);
    ids.add(id);
  }
  return map.mappings;
}

export function prepareRotationContinuityScreen(adapterFile) {
  const adapter = readJson(adapterFile);
  if (adapter.format !== 'swishiq-candidate100-rotation-alias-adapter-run-v1'
    || adapter.modelFitExecuted || adapter.modelScreenExecuted || adapter.promotionAllowed) {
    throw Error('Expected the completed, non-fitting, non-promoting rotation adapter receipt');
  }
  const featureFile = verifyPin(adapter.sourcePins?.candidate57FeatureRows);
  const featureManifest = verifyPin(adapter.sourcePins?.candidate57FeatureManifest);
  const sourceVerification = verifyManifest(featureManifest);
  const featurePin = pin(featureFile);
  // The Candidate57 source manifest correctly pins its upstream package inputs but predates
  // the reusable experiment-receipt convention and therefore does not list its own JSONL
  // output. Create a content-addressed bridge receipt that pins both artifacts without
  // copying or changing the source feature rows.
  const bridge = withArtifactCache(path.join(import.meta.dirname, 'runs', 'cache'), 'rotation-input', {
    format: 'swishiq-candidate100-rotation-input-bridge-v1',
    featureRows: featurePin,
    sourceManifestPin: pin(featureManifest),
    adapterPin: pin(adapterFile),
  }, directory => {
    writeJson(path.join(directory, 'rotation-input.json'), {
      format: 'swishiq-candidate100-rotation-input-bridge-v1',
      sourceFeatureRows: featurePin,
      sourceManifest: pin(featureManifest),
      adapter: pin(adapterFile),
      note: 'Pins a pre-existing feature JSONL and its upstream source manifest; no source rows were rewritten.',
    });
  });
  const reusableFeatureManifest = path.join(bridge.directory, 'receipt.json');
  const reusableVerification = verifyManifest(reusableFeatureManifest);
  if (!reusableVerification.checked.some(item => item.sha256 === featurePin.sha256 && item.bytes === featurePin.bytes)) {
    throw Error('Rotation bridge receipt does not pin the Candidate57 feature rows');
  }
  const baselineFile = verifyPin(adapter.sourcePins?.candidate100Configuration);
  const baselineDirectory = path.dirname(baselineFile);
  const baselineForecasts = path.join(baselineDirectory, 'mean-cache', 'forecast-means.jsonl');
  const baselineManifest = path.join(baselineDirectory, 'mean-cache', 'manifest.json');
  const baselineForecastPin = pin(baselineForecasts);
  const baselineManifestPin = pin(baselineManifest);
  verifyManifest(baselineManifest);
  const baseline = readJson(baselineFile);
  const mappings = requireRotationMappings(adapter);
  const output = assertDiagnosticOutput(path.join(import.meta.dirname, 'runs', 'rotation-continuity-individual',
    'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(output, { recursive: true });

  const cases = [];
  for (const mapping of mappings) {
    const { head, metric, modelSlot, semanticFeature } = mapping;
    const featureKey = head + 'FeatureNames';
    if (!baseline.excludedFeatures.includes(modelSlot) || baseline[featureKey].includes(modelSlot)) {
      throw Error('Rotation slot is not an excluded Candidate100 feature: ' + modelSlot);
    }
    const id = 'rotation-' + metric + '-' + head;
    const config = structuredClone(baseline);
    config.version = 'swishiq-v4-game-lab-candidate100-' + id + '-development-v1';
    config[featureKey].push(modelSlot);
    config[head + 'PredictorCount'] = config[featureKey].length;
    config.featureRidgePenaltyMultipliers[head][modelSlot] = 1;
    config.excludedFeatures = config.excludedFeatures.filter(name => name !== modelSlot);
    config.status = 'development-unvalidated';
    config.independentPredictiveValidityEstablished = false;
    config.prospectiveValidityEstablished = false;
    config.promotionAllowed = false;
    config.experimentPreparation = {
      family: 'rotation-continuity',
      head,
      metric,
      semanticFeature,
      modelSlot,
      source: 'strictly prior-game Candidate16 continuity context carried by pinned Candidate57 feature rows',
      parentConfiguration: pin(baselineFile),
    };
    validateMeanConfiguration(config);
    const otherHead = head === 'total' ? 'margin' : 'total';
    if (stable(config[otherHead + 'FeatureNames']) !== stable(baseline[otherHead + 'FeatureNames'])) {
      throw Error('Non-target head changed for ' + id);
    }
    const configuration = path.join(output, 'configurations', id + '.json');
    writeJson(configuration, config);
    cases.push({ id, head, metric, semanticFeature, modelSlot, configuration });
  }

  if (cases.length !== 6 || new Set(cases.map(item => item.id)).size !== 6) {
    throw Error('Expected six distinct individual rotation-continuity screens');
  }
  const screen = {
    format: 'swishiq-uncertainty-screen-plan-v1',
    cacheRoot: path.join(import.meta.dirname, 'runs', 'cache'),
    outputDirectory: path.join(output, 'screens'),
    targetSeasonStartYears: [2022, 2023, 2024, 2025],
    includeCalibrationSlope: true,
    maxWorkers: 3,
    fullReceiptIds: ['configured-canonical'],
    variants: [{ id: 'configured-canonical', settings: {}, forceCanonical: true }],
  };
  const baselinePlan = {
    ...screen,
    forecasts: baselineForecasts,
    sourceManifest: baselineManifest,
    configuration: baselineFile,
    outputDirectory: path.join(output, 'baseline-screen'),
  };
  const pipeline = {
    format: 'swishiq-experiment-plan-v1',
    outputDirectory: path.join(output, 'pipeline'),
    means: {
      format: 'swishiq-mean-batch-plan-v1',
      features: featureFile,
      sourceManifest: reusableFeatureManifest,
      warmupSeasonStartYear: 2020,
      throughSeasonStartYear: 2025,
      maxWorkers: 4,
      cacheRoot: path.join(import.meta.dirname, 'runs', 'cache'),
      outputDirectory: path.join(output, 'means'),
      configurations: cases.map(({ id, configuration }) => ({ id, configuration })),
    },
    screen,
  };
  const baselinePlanFile = path.join(output, 'baseline-plan.json');
  const pipelineFile = path.join(output, 'pipeline-plan.json');
  writeJson(baselinePlanFile, baselinePlan);
  writeJson(pipelineFile, pipeline);
  const result = {
    format: 'swishiq-candidate100-rotation-continuity-individual-screen-v1',
    status: 'prepared',
    outputDirectory: output,
    adapterPin: pin(adapterFile),
    inputs: {
      featureRows: pin(featureFile),
      featureManifest: pin(featureManifest),
      reusableFeatureManifest: pin(reusableFeatureManifest),
      baselineConfiguration: pin(baselineFile),
      baselineForecasts: baselineForecastPin,
      baselineManifest: baselineManifestPin,
    },
    baselinePlanFile,
    pipelineFile,
    cases,
    developmentOnly: true,
    promotionAllowed: false,
    decision: 'Screen each prior-game rotation-continuity input independently on the fixed development cohort. Candidate100 remains unchanged; any later combination requires an individually justified result.',
  };
  writeJson(path.join(output, 'preparation.json'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node prepare-candidate100-rotation-screen.mjs <rotation-adapter-run.json>');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  console.log(JSON.stringify(prepareRotationContinuityScreen(path.resolve(process.argv[2]))));
}

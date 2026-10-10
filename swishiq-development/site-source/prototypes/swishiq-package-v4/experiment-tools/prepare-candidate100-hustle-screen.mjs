import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { readJson, writeJson, pin, stable, verifyManifest } from './lib/artifacts.mjs';
import { validateMeanConfiguration } from './lib/configuration.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';

function verifyPin(saved) {
  const actual = pin(saved.path);
  if (actual.bytes !== saved.bytes || actual.sha256 !== saved.sha256) throw Error('Prepared source changed: ' + saved.path);
  return saved.path;
}

export function prepareHustleScreen(adapterFile) {
  const adapter = readJson(adapterFile);
  if (adapter.format !== 'swishiq-candidate100-hustle-alias-adapter-v1-run-v1') throw Error('Expected verified hustle adapter run');
  const featureFile = verifyPin(adapter.featureRows);
  const manifestFile = verifyPin(adapter.cacheReceipt);
  verifyManifest(manifestFile);
  const baselineFile = verifyPin(adapter.sourcePins.candidate100Configuration);
  const baselineForecasts = verifyPin(adapter.sourcePins.baselineReferenceForecasts);
  const baselineManifest = verifyPin(adapter.sourcePins.baselineReferenceManifest);
  const baseline = readJson(baselineFile);
  const map = readJson(verifyPin(adapter.semanticToModelSlotMap));
  const output = assertDiagnosticOutput(path.join(import.meta.dirname, 'runs/hustle-individual',
    'run-' + Date.now() + '-' + randomUUID()));
  fs.mkdirSync(output, { recursive: true });
  const cases = [];
  for (const mapping of map.mappings) {
    const { head, metric, modelSlot, semanticFeature } = mapping;
    if (!['total', 'margin'].includes(head) || !baseline.excludedFeatures.includes(modelSlot)
      || baseline[head + 'FeatureNames'].includes(modelSlot)) throw Error('Alias is not an excluded baseline feature');
    const id = 'hustle-' + metric + '-' + head;
    const config = structuredClone(baseline);
    config.version = 'swishiq-v4-game-lab-candidate100-' + id + '-development-v1';
    config[head + 'FeatureNames'].push(modelSlot);
    config[head + 'PredictorCount'] = config[head + 'FeatureNames'].length;
    config.featureRidgePenaltyMultipliers[head][modelSlot] = 1;
    config.excludedFeatures = config.excludedFeatures.filter(name => name !== modelSlot);
    config.status = 'development-unvalidated';
    config.independentPredictiveValidityEstablished = false;
    config.promotionAllowed = false;
    config.experimentPreparation = { family: 'hustle', head, metric, semanticFeature, modelSlot,
      source: 'prior-season per36 weighted by ten strictly prior team-game minute shares' };
    validateMeanConfiguration(config);
    const other = head === 'total' ? 'margin' : 'total';
    if (stable(config[other + 'FeatureNames']) !== stable(baseline[other + 'FeatureNames'])) throw Error('Other head changed');
    const configuration = path.join(output, 'configurations', id + '.json');
    writeJson(configuration, config);
    cases.push({ id, head, metric, semanticFeature, configuration });
  }
  if (cases.length !== 8 || new Set(cases.map(item => item.id)).size !== 8) throw Error('Expected eight distinct individual screens');
  const screen = { format: 'swishiq-uncertainty-screen-plan-v1',
    cacheRoot: path.join(import.meta.dirname, 'runs/cache'), outputDirectory: path.join(output, 'screens'),
    targetSeasonStartYears: [2022, 2023, 2024, 2025], includeCalibrationSlope: true, maxWorkers: 3,
    fullReceiptIds: ['configured-canonical'],
    variants: [{ id: 'configured-canonical', settings: {}, forceCanonical: true }] };
  const baselinePlan = { ...screen, forecasts: baselineForecasts, sourceManifest: baselineManifest,
    configuration: baselineFile, outputDirectory: path.join(output, 'baseline-screen') };
  const pipeline = { format: 'swishiq-experiment-plan-v1', outputDirectory: path.join(output, 'pipeline'),
    means: { format: 'swishiq-mean-batch-plan-v1', features: featureFile, sourceManifest: manifestFile,
      warmupSeasonStartYear: 2020, throughSeasonStartYear: 2025, maxWorkers: 4,
      cacheRoot: path.join(import.meta.dirname, 'runs/cache'), outputDirectory: path.join(output, 'means'),
      configurations: cases.map(({ id, configuration }) => ({ id, configuration })) }, screen };
  const baselinePlanFile = path.join(output, 'baseline-plan.json'), pipelineFile = path.join(output, 'pipeline-plan.json');
  writeJson(baselinePlanFile, baselinePlan); writeJson(pipelineFile, pipeline);
  const result = { format: 'swishiq-candidate100-hustle-individual-screen-v1', status: 'prepared',
    outputDirectory: output, adapterPin: pin(adapterFile), baselinePlanFile, pipelineFile, cases,
    developmentOnly: true, promotionAllowed: false,
    decision: 'Retain intended-metric gains without clear repeated primary harm; mixed evidence remains provisional.' };
  writeJson(path.join(output, 'preparation.json'), result);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node prepare-candidate100-hustle-screen.mjs <adapter-run.json>');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  console.log(JSON.stringify(prepareHustleScreen(path.resolve(process.argv[2]))));
}

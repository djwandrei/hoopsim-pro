import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { hash, readJson, loadPinnedJson, loadPinnedJsonl, writeJson, pinModuleClosure, verifyManifest, withArtifactCache, lookupArtifactCache } from './lib/artifacts.mjs';
import { indexChronology, validateSeasons } from './lib/chronology.mjs';
import { normalizeSettings, scorerName } from './lib/uncertainty-batch.mjs';
import { computeScreenVariant } from './lib/screen-stage.mjs';
import { createTelemetry } from './lib/telemetry.mjs';
import { createResamplingPlan, applyResamplingPlan } from './lib/resampling-plan.mjs';
import { meanSettings, validateMeanConfiguration } from './lib/configuration.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { workerLimit, runWorkerBatch } from './lib/worker-pool.mjs';
import { shareJson } from './lib/shared-input.mjs';

const toolsRoot = import.meta.dirname;
function resolveFile(base, file) { return path.resolve(base, file); }
export async function runScreen(plan, { baseDirectory = process.cwd() } = {}) {
  if (plan.format !== 'swishiq-uncertainty-screen-plan-v1' || typeof plan.forecasts !== 'string'
    || !Array.isArray(plan.variants) || !plan.variants.length) throw Error('Expected an uncertainty-screen plan with forecasts and variants');
  const telemetry = createTelemetry(), counters = { forecastParses: 0, variantsComputed: 0, screenCacheHits: 0 };
  telemetry.start();
  const input = resolveFile(baseDirectory, plan.forecasts), cacheRoot = assertDiagnosticOutput(resolveFile(baseDirectory, plan.cacheRoot ?? '../runs/cache'));
  const outputRoot = assertDiagnosticOutput(resolveFile(baseDirectory, plan.outputDirectory ?? '../runs/screens'));
  const workerUrl = new URL('./lib/screen-worker.mjs', import.meta.url);
  const codePins = pinModuleClosure([import.meta.filename, fileURLToPath(workerUrl)]);
  const sourceManifest = plan.sourceManifest ? telemetry.measure('verify-source-manifest', () => verifyManifest(resolveFile(baseDirectory, plan.sourceManifest), { pathMap: plan.sourcePathMap ?? {} })) : null;
  const { rows: forecasts, inputPin } = telemetry.measure('load-pin-forecast-rows-once', () => { counters.forecastParses++; return loadPinnedJsonl(input); });
  if (sourceManifest && !sourceManifest.checked.some(item => item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes)) throw Error('Forecast input is not pinned by the supplied source manifest');
  const configInput = plan.configuration ? loadPinnedJson(resolveFile(baseDirectory, plan.configuration)) : null;
  const configurationPin = configInput?.inputPin ?? null, configuration = configInput?.value ?? null;
  const meanIdentity = sourceManifest?.manifest.signature?.meanSettings ?? null;
  if (configuration) {
    validateMeanConfiguration(configuration);
    if (meanIdentity && hash(meanSettings(configuration)) !== hash(meanIdentity)) throw Error('Cached mean settings differ from the supplied configuration');
    if (sourceManifest && !meanIdentity && !sourceManifest.checked.some(item => item.sha256 === configurationPin.sha256
      && item.bytes === configurationPin.bytes)) throw Error('Mean configuration is not pinned by the supplied source manifest');
  }
  const settingsBase = normalizeSettings({ ...(configuration?.uncertainty ?? {}), ...(plan.baseSettings ?? {}) });
  const includeCalibrationSlope = plan.includeCalibrationSlope === true, fullReceiptIds = new Set(plan.fullReceiptIds ?? []);
  const variantIds = new Set();
  const variants = plan.variants.map(item => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(item.id) || variantIds.has(item.id)) throw Error('Unique safe variant IDs required');
    variantIds.add(item.id);
    return { id: item.id, settings: normalizeSettings({ ...settingsBase, ...(item.settings ?? {}) }), forceCanonical: item.forceCanonical === true };
  });
  if ([...fullReceiptIds].some(id => !variantIds.has(id))) throw Error('Full receipt references an unknown variant');
  if (new Set(forecasts.map(row => row.modelVersion)).size !== 1) throw Error('One mean-model signature is required per forecast input');
  if (configuration && forecasts.some(row => row.modelVersion !== configuration.version
    && !(meanIdentity && row.modelVersion === 'experiment-mean-signature-' + sourceManifest.manifest.key))) throw Error('Forecast/configuration version mismatch');
  if (sourceManifest?.manifest.signature?.resumeCheckpointSha256) throw Error('A resumed mean cache lacks the complete residual warmup sequence; compose a separately pinned full forecast input before scoring');
  const chronology = telemetry.measure('index-chronology-once', () => indexChronology(forecasts));
  const years = validateSeasons(plan.targetSeasonStartYears, chronology.seasons), selected = new Set(years);
  const expected = forecasts.filter(row => selected.has(row.seasonStartYear)), expectedIdentity = hash(expected.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear]));
  const forecastByRef = new Map(forecasts.map(row => [row.gameRef, row]));
  const locations = new Map(), requests = [], tasksByKey = new Map(), artifacts = new Map(), workerReports = [];
  workerLimit(plan.maxWorkers ?? 1, variants.length);
  for (const variant of variants) {
    const full = fullReceiptIds.has(variant.id), signature = { format: 'swishiq-uncertainty-screen-result-v1',
      inputPin, sourceManifestPin: sourceManifest?.manifestPin ?? null, configurationPin,
      codePins, years, settings: variant.settings, implementation: scorerName(variant.settings, variant.forceCanonical),
      includeCalibrationSlope, fullReceipt: full, expectedIdentity, expectedTargets: expected.length, nodeVersion: process.version };
    const key = hash(signature);
    if (!tasksByKey.has(key)) tasksByKey.set(key, { id: key, payload: { signature, forceCanonical: variant.forceCanonical } });
    requests.push({ variant, key, full });
  }
  const tasks = [];
  for (const task of tasksByKey.values()) {
    const cached = telemetry.measure('inspect-screen-cache-' + task.id, () => lookupArtifactCache(cacheRoot, 'uncertainty', task.payload.signature));
    if (cached) artifacts.set(task.id, cached); else tasks.push(task);
  }
  const workers = workerLimit(plan.maxWorkers ?? 1, tasks.length);
  if (workers > 1) {
    const sharedForecasts = telemetry.measure('share-forecast-input', () => shareJson(forecasts));
    const completed = await telemetry.measure('parallel-uncertainty-batch', () => runWorkerBatch({ workerUrl, tasks,
      workerData: { forecasts: sharedForecasts, chronology, cacheRoot }, maxWorkers: workers }));
    completed.forEach((result, index) => { artifacts.set(tasks[index].id, result.artifact); workerReports.push({ key: tasks[index].id, telemetry: result.telemetry }); });
    counters.workerForecastParses = workers;
  } else for (const task of tasks) artifacts.set(task.id, telemetry.measure('score-or-reuse-' + task.id, () => computeScreenVariant({
    cacheRoot, signature: task.payload.signature, forecasts, chronology, forecastByRef, forceCanonical: task.payload.forceCanonical })));
  counters.uniqueVariantTasks = tasksByKey.size; counters.duplicateVariantTasksAvoided = variants.length - tasksByKey.size;
  for (const artifact of artifacts.values()) {
    counters.screenCacheHits += Number(artifact.cacheHit);
    if (!artifact.cacheHit) {
      counters.variantsComputed++;
      counters.predictionsScored = (counters.predictionsScored ?? 0) + artifact.receipt.metadata.targets;
      counters.cacheBytesWritten = (counters.cacheBytesWritten ?? 0) + artifact.receipt.files.reduce((sum, item) => sum + item.bytes, 0);
    }
  }
  const results = requests.map(({ variant, key, full }) => {
    const artifact = artifacts.get(key);
    locations.set(variant.id, artifact.directory);
    const metrics = readJson(path.join(artifact.directory, 'metrics.json'));
    return { id: variant.id, resultKey: artifact.key, directory: artifact.directory, cacheHit: artifact.cacheHit,
      implementation: metrics.implementation, settings: variant.settings, summary: metrics.summary, fullReceipt: full };
  });
  let comparison = null;
  if (plan.comparison) {
    const referenceId = plan.comparison.referenceId;
    if (!locations.has(referenceId)) throw Error('Comparison reference must name a screened variant');
    const lossRows = id => JSON.parse(gunzipSync(fs.readFileSync(path.join(locations.get(id), 'losses.json.gz'))).toString('utf8'));
    if (variants.length < 2) throw Error('A comparison needs another variant');
    let reference = null;
    const referenceRows = () => reference ??= lossRows(referenceId);
    const options = { seed: plan.comparison.seed ?? 20261008, repetitions: plan.comparison.repetitions ?? 1000,
      blockLengthDates: plan.comparison.blockLengthDates ?? 7 };
    const bootstrapArtifact = telemetry.measure('resampling-plan-or-reuse', () => withArtifactCache(cacheRoot, 'resampling',
      { expectedIdentity, options, codePins: pinModuleClosure([path.join(toolsRoot, 'lib/resampling-plan.mjs')]) }, directory => {
        const resampling = createResamplingPlan(referenceRows(), options);
        writeJson(path.join(directory, 'plan.json'), resampling);
        return { expectedIdentity, options, method: 'screen-date-cluster-only' };
      }));
    const comparisonArtifact = telemetry.measure('paired-screen-comparison-or-reuse', () => withArtifactCache(cacheRoot, 'comparison',
      { resamplingKey: bootstrapArtifact.key, resultKeys: results.map(item => [item.id, item.resultKey]), referenceId,
        includeDistributionLosses: plan.comparison.includeDistributionLosses === true,
        codePins: pinModuleClosure([path.join(toolsRoot, 'lib/resampling-plan.mjs')]) }, directory => {
        const base = referenceRows(), columns = {};
        for (const variant of variants) if (variant.id !== referenceId) {
          const candidate = lossRows(variant.id);
          if (hash(candidate.map(row => [row.gameRef, row.gameDateLocal, row.seasonStartYear])) !== expectedIdentity) throw Error('Unpaired losses');
          for (const metric of ['brier', 'logLoss', 'marginAbsoluteError']) columns[variant.id + ':' + metric] = candidate.map((row, index) => row[metric] - base[index][metric]);
          if (plan.comparison.includeDistributionLosses === true) for (const side of ['home', 'away', 'margin']) {
            columns[variant.id + ':' + side + ':mae'] = candidate.map((row, index) => Math.abs(row.sides[side].error) - Math.abs(base[index].sides[side].error));
            for (const metric of ['crps', 'intervalScore']) columns[variant.id + ':' + side + ':' + metric] = candidate.map((row, index) => row.sides[side][metric] - base[index].sides[side][metric]);
          }
        }
        const paired = applyResamplingPlan(readJson(path.join(bootstrapArtifact.directory, 'plan.json')), base, columns);
        writeJson(path.join(directory, 'comparison.json'), paired);
        return { resamplingKey: bootstrapArtifact.key, contrasts: Object.keys(columns).length };
      }));
    counters.comparisonCacheHits = Number(comparisonArtifact.cacheHit);
    comparison = { referenceId, negativeDifferenceFavorsCandidate: true, resamplingKey: bootstrapArtifact.key,
      comparisonKey: comparisonArtifact.key, cacheHit: comparisonArtifact.cacheHit,
      screenOnly: true, ...readJson(path.join(comparisonArtifact.directory, 'comparison.json')) };
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, 'run-' + Date.now() + '-' + process.pid);
  fs.mkdirSync(invocation, { recursive: false });
  const report = { format: 'swishiq-batched-uncertainty-screen-v1', status: 'opened-label-screen-only; not-independent-validation',
    planSha256: hash(plan), inputPin, sourceManifestPin: sourceManifest?.manifestPin ?? null, configurationPin, codePins,
    chronology: { dates: chronology.dates.length, rows: chronology.rowCount, targetIdentitySha256: expectedIdentity },
    targetSeasonStartYears: years, expectedTargets: expected.length, scorerParityPolicy: plan.scorerParityPolicy ?? null, results, comparison,
    execution: { requestedMaxWorkers: plan.maxWorkers ?? 1, workerThreadsUsed: workers > 1 ? workers : 0,
      mode: tasks.length ? workers > 1 ? 'managed-worker-threads' : 'in-process' : 'cache-only' },
    promotionAllowed: false, requiresCanonicalFinalRerun: true };
  writeJson(path.join(invocation, 'screen-index.json'), report);
  writeJson(path.join(invocation, 'telemetry.json'), telemetry.finish({ counters, workerReports,
    notes: ['Worker RSS and CPU counters cover the process; do not sum overlapping worker snapshots.'] }));
  return { outputDirectory: invocation, ...report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node run-screen.mjs <plan.json>\nLoads forecasts once; caches compact development screens. No model files are changed.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planPath = path.resolve(process.argv[2]);
  const result = await runScreen(readJson(planPath), { baseDirectory: path.dirname(planPath) });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, variants: result.results.length, targetGames: result.expectedTargets }));
}

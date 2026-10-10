import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { hash, readJson, loadPinnedJson, loadPinnedJsonl, writeJson, pinModuleClosure, verifyManifest, lookupArtifactCache } from './lib/artifacts.mjs';
import { prepareDesignCache, fitMeanCache, meanCacheSignature } from './lib/mean-batch.mjs';
import { validateMeanConfiguration, meanSettings } from './lib/configuration.mjs';
import { loadDesignCache, createDesignResumeProof } from './lib/design-cache.mjs';
import { createTelemetry } from './lib/telemetry.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { workerLimit, runWorkerBatch } from './lib/worker-pool.mjs';
import { shareDesign } from './lib/shared-input.mjs';

export async function runMeans(plan, { baseDirectory = process.cwd() } = {}) {
  if (plan.format !== 'swishiq-mean-batch-plan-v1' || typeof plan.features !== 'string' || !Array.isArray(plan.configurations)
    || !plan.configurations.length || !Number.isSafeInteger(plan.warmupSeasonStartYear) || !Number.isSafeInteger(plan.throughSeasonStartYear)
    || plan.throughSeasonStartYear <= plan.warmupSeasonStartYear) throw Error('Versioned mean-batch plan and explicit season range required');
  const telemetry = createTelemetry(), counters = { featureParses: 0 };
  telemetry.start();
  const workerUrl = new URL('./lib/mean-worker.mjs', import.meta.url);
  const input = path.resolve(baseDirectory, plan.features), codePins = telemetry.measure('pin-mean-code-closure', () => pinModuleClosure([import.meta.filename, fileURLToPath(workerUrl)]));
  const { rows, inputPin } = telemetry.measure('load-pin-feature-rows-once', () => { counters.featureParses++; return loadPinnedJsonl(input); });
  const sourceManifest = plan.sourceManifest ? telemetry.measure('verify-feature-source-manifest', () => verifyManifest(path.resolve(baseDirectory, plan.sourceManifest), { pathMap: plan.sourcePathMap ?? {} })) : null;
  if (sourceManifest && !sourceManifest.checked.some(item => item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes)) throw Error('Feature source is not pinned by the supplied manifest');
  const sourceIdentity = { inputPin, sourceManifestPin: sourceManifest?.manifestPin ?? null, sourcePathMap: plan.sourcePathMap ?? {} };
  const cacheRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.cacheRoot ?? '../runs/cache'));
  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/means'));
  workerLimit(plan.maxWorkers ?? 1, plan.configurations.length);
  const designs = new Map(), parentDesigns = new Map(), ids = new Set(), requests = [], tasksByKey = new Map();
  const loadParent = file => {
    const location = path.resolve(baseDirectory, file);
    if (!parentDesigns.has(location)) parentDesigns.set(location, telemetry.measure('verify-parent-design', () => loadDesignCache(location)));
    return parentDesigns.get(location);
  };
  for (const request of plan.configurations) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(request.id) || ids.has(request.id) || typeof request.configuration !== 'string') throw Error('Unique mean IDs and configuration paths required');
    ids.add(request.id);
    const configurationPath = path.resolve(baseDirectory, request.configuration);
    const { value: config, inputPin: configurationPin } = telemetry.measure('read-pin-configuration-' + request.id, () => loadPinnedJson(configurationPath));
    validateMeanConfiguration(config);
    const parentDesign = request.parentDesignManifest ? loadParent(request.parentDesignManifest) : null;
    const designSignature = hash({ total: config.totalFeatureNames, margin: config.marginFeatureNames,
      policy: config.headFeaturePolicy ?? null, prefix: config.standardizationWarmupPrefixGames,
      parentDesignReceiptPin: parentDesign?.receiptPin ?? null });
    if (!designs.has(designSignature)) designs.set(designSignature, telemetry.measure('prepare-design-' + request.id, () => prepareDesignCache({ rows,
      sourceIdentity, config, warmupYear: plan.warmupSeasonStartYear, throughYear: plan.throughSeasonStartYear,
      cacheRoot, codePins, counters, parentDesign })));
    const design = designs.get(designSignature);
    let resume = null, resumeDesignProof = null;
    if (request.resumeCheckpoint) {
      if (!request.resumeManifest) throw Error('A resume checkpoint requires its cache receipt manifest');
      const manifest = verifyManifest(path.resolve(baseDirectory, request.resumeManifest));
      if (manifest.manifest.stage !== 'mean' || manifest.manifest.signature?.format !== 'swishiq-batched-mean-v1'
        || hash(manifest.manifest.signature.codePins) !== hash(codePins)
        || hash(manifest.manifest.signature.meanSettings) !== hash(meanSettings(config))) throw Error('Checkpoint fitting code or mean settings differ from this run');
      const { value: checkpoint, inputPin: checkpointPin } = loadPinnedJson(path.resolve(baseDirectory, request.resumeCheckpoint));
      if (!manifest.checked.some(item => item.sha256 === checkpointPin.sha256 && item.bytes === checkpointPin.bytes)) throw Error('Checkpoint is not pinned by the supplied receipt');
      if (!manifest.manifest.files.some(item => path.resolve(path.dirname(manifest.manifestPin.path), item.path) === checkpointPin.path
        && item.sha256 === checkpointPin.sha256 && item.bytes === checkpointPin.bytes)
        || checkpoint.designKey !== manifest.manifest.signature.designKey) throw Error('Checkpoint must be a direct output of its mean receipt/design');
      resume = checkpoint;
      if (checkpoint.designKey !== design.key) {
        const previous = loadParent(manifest.manifest.signature.designReceiptPin.path);
        resumeDesignProof = createDesignResumeProof({ design, parentDesign: previous, checkpoint, checkpointPin,
          parentMeanReceiptPin: manifest.manifestPin });
        counters.designTransfersVerified = (counters.designTransfersVerified ?? 0) + 1;
      }
    }
    const payload = { config, designKey: design.key, fullRefits: plan.fullCoefficientRefits === true,
      resumeCheckpoint: resume, resumeDesignProof };
    const signature = meanCacheSignature({ design, config, codePins, fullRefits: payload.fullRefits,
      resumeCheckpoint: resume, resumeDesignProof });
    const key = hash(signature);
    if (!tasksByKey.has(key)) tasksByKey.set(key, { id: key, payload, signature });
    requests.push({ request, config, configurationPin, design, key });
  }
  const artifacts = new Map(), workerReports = [], tasks = [];
  for (const task of tasksByKey.values()) {
    const cached = telemetry.measure('inspect-mean-cache-' + task.id, () => lookupArtifactCache(cacheRoot, 'mean', task.signature));
    if (cached) { artifacts.set(task.id, cached); counters.meanCacheHits = (counters.meanCacheHits ?? 0) + 1; }
    else tasks.push(task);
  }
  const workers = workerLimit(plan.maxWorkers ?? 1, tasks.length);
  counters.uniqueMeanTasks = tasksByKey.size; counters.configurationsRequested = requests.length;
  counters.duplicateMeanTasksAvoided = requests.length - tasksByKey.size;
  if (workers > 1) {
    const activeDesignKeys = new Set(tasks.map(task => task.payload.designKey));
    const shared = telemetry.measure('share-designs', () => [...designs.values()].filter(design => activeDesignKeys.has(design.key)).map(shareDesign));
    const completed = await telemetry.measure('parallel-mean-batch', () => runWorkerBatch({ workerUrl, tasks,
      workerData: { designs: shared, cacheRoot, codePins }, maxWorkers: workers }));
    completed.forEach((result, index) => {
      artifacts.set(tasks[index].id, result.artifact); workerReports.push({ key: tasks[index].id, telemetry: result.telemetry });
      for (const [name, value] of Object.entries(result.counters)) counters[name] = (counters[name] ?? 0) + value;
    });
  } else for (const task of tasks) {
    const design = requests.find(request => request.key === task.id).design;
    artifacts.set(task.id, telemetry.measure('fit-or-reuse-' + task.id, () => fitMeanCache({ design,
      config: task.payload.config, cacheRoot, codePins, counters, fullRefits: task.payload.fullRefits,
      resumeCheckpoint: task.payload.resumeCheckpoint, resumeDesignProof: task.payload.resumeDesignProof })));
  }
  const results = requests.map(({ request, config, configurationPin, design, key }) => {
    const artifact = artifacts.get(key);
    return { id: request.id, requestedModelVersion: config.version, configurationPin, designKey: design.key,
      resultKey: artifact.key, directory: artifact.directory, cacheHit: artifact.cacheHit,
      forecastFile: path.join(artifact.directory, 'forecast-means.jsonl'), metadata: artifact.receipt.metadata };
  });
  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, 'run-' + Date.now() + '-' + process.pid); fs.mkdirSync(invocation);
  const report = { format: 'swishiq-mean-batch-index-v1', status: 'development-tooling; canonical-parity-not-established',
    planSha256: hash(plan), sourceIdentity, codePins, results, promotionAllowed: false,
    meanVersionsAreNeutralSignatures: true, requiresCanonicalFinalRerun: true, execution: { requestedMaxWorkers: plan.maxWorkers ?? 1,
      workerThreadsUsed: workers > 1 ? workers : 0, mode: tasks.length ? workers > 1 ? 'managed-worker-threads' : 'in-process' : 'cache-only' },
    notes: ['No existing configuration or model file was edited.', 'Same ordered Gram additions and original ridge solver are retained.',
      'Cached design dot products need paired numerical parity before promotion.', 'A resumed mean cache contains only new forecasts; scoring requires prior residual warmup forecasts too.'] };
  writeJson(path.join(invocation, 'mean-index.json'), report);
  writeJson(path.join(invocation, 'telemetry.json'), telemetry.finish({ counters, workerReports,
    notes: ['Worker RSS and CPU counters cover the process; do not sum overlapping worker snapshots.'] }));
  return { outputDirectory: invocation, ...report };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node run-means.mjs <plan.json>\nCaches designs and batches exact-setting mean refits without model-file edits.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planPath = path.resolve(process.argv[2]), result = await runMeans(readJson(planPath), { baseDirectory: path.dirname(planPath) });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, configurations: result.results.length }));
}

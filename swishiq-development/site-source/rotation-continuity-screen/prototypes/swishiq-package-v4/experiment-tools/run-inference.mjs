import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inferCandidate57PairedLosses, INFERENCE_VERSION } from '../models/game-lab-candidate57-dependence-inference-v1.mjs';
import { inferPlannedPairedLosses, PORTED_ORIGINAL_SHA256 } from './lib/dependence-planned.mjs';
import { prepareCanonicalPlan } from './lib/canonical-plan.mjs';
import { hash, pin, loadPinnedBytes, parseJsonlBytes, readJson, writeJson, verifyManifest, pinModuleClosure, withArtifactCache } from './lib/artifacts.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { createTelemetry } from './lib/telemetry.mjs';

// Retains the original calendar-block/shared-team/maxT method, including its estimand.
export async function runInference(plan, { baseDirectory = process.cwd() } = {}) {
  if (plan.format !== 'swishiq-canonical-inference-plan-v1' || typeof plan.rows !== 'string'
    || typeof plan.mode !== 'string' || !plan.mode) throw Error('Versioned inference plan, paired rows and mode required');
  const telemetry = createTelemetry(); telemetry.start();
  const implementation = plan.implementation ?? 'original';
  if (!['original', 'planned'].includes(implementation)) throw Error('Inference implementation must be original or planned');
  if (implementation === 'planned' && pin(path.join(import.meta.dirname, '../models/game-lab-candidate57-dependence-inference-v1.mjs')).sha256 !== PORTED_ORIGINAL_SHA256) throw Error('Original inference changed; refresh and review the experimental port before using planned draws');
  const source = path.resolve(baseDirectory, plan.rows);
  const { buffer, inputPin } = telemetry.measure('load-pin-paired-bytes-once', () => loadPinnedBytes(source));
  const sourceManifest = plan.sourceManifest ? telemetry.measure('verify-paired-source', () => verifyManifest(path.resolve(baseDirectory, plan.sourceManifest))) : null;
  if (sourceManifest && !sourceManifest.checked.some(item => item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes)) throw Error('Paired input is not pinned by the supplied manifest');
  const options = { mode: plan.mode, replicates: plan.replicates ?? 10000, seed: plan.seed ?? 20261005, blockLengths: plan.blockLengths ?? [7, 14] };
  if (!Number.isSafeInteger(options.replicates) || options.replicates < 20 || !Number.isSafeInteger(options.seed)
    || !Array.isArray(options.blockLengths) || !options.blockLengths.length || options.blockLengths.some(n => !Number.isSafeInteger(n) || n < 1)
    || new Set(options.blockLengths).size !== options.blockLengths.length) throw Error('Invalid inference resampling settings');
  const cacheRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.cacheRoot ?? '../runs/cache'));
  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/inference'));
  const codePins = pinModuleClosure([import.meta.filename]);
  let rowsParsed = 0, drawPlan = null;
  const artifact = telemetry.measure('canonical-inference-or-reuse', () => withArtifactCache(cacheRoot, 'canonical-inference',
    { inputPin, sourceManifestPin: sourceManifest?.manifestPin ?? null, options, implementation, codePins, nodeVersion: process.version }, directory => {
      const rows = parseJsonlBytes(buffer, source); rowsParsed = rows.length;
      let result;
      if (implementation === 'planned') {
        drawPlan = telemetry.measure('prepare-shared-canonical-draws', () => prepareCanonicalPlan({ rows, ...options, cacheRoot }));
        result = inferPlannedPairedLosses({ rows, ...options, resamplingPlan: drawPlan });
      } else result = inferCandidate57PairedLosses({ rows, ...options });
      writeJson(path.join(directory, 'inference.json'), { format: 'swishiq-cached-canonical-inference-v1', method: INFERENCE_VERSION,
        sourceProvenanceVerified: !!sourceManifest, options, implementation, rows: rows.length, result,
        drawPlanKey: drawPlan?.resultKey ?? null, drawPlanReceiptPin: drawPlan ? pin(drawPlan.receiptFile) : null,
        plannedImplementationParityEstablished: false,
        status: 'inference-only; predictive-validity-gates-not-evaluated', promotionAllowed: false });
      return { rows: rows.length, method: INFERENCE_VERSION, implementation, drawPlanKey: drawPlan?.resultKey ?? null };
    }));
  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, 'run-' + Date.now() + '-' + process.pid); fs.mkdirSync(invocation);
  const report = { format: 'swishiq-inference-invocation-v1', planSha256: hash(plan), inputPin, codePins,
    resultKey: artifact.key, cacheHit: artifact.cacheHit, resultFile: path.join(artifact.directory, 'inference.json'), implementation,
    status: 'canonical-method-inference-only; no-candidate-promotion', promotionAllowed: false };
  writeJson(path.join(invocation, 'inference-index.json'), report);
  writeJson(path.join(invocation, 'telemetry.json'), telemetry.finish({ counters: { rowsParsed, cacheHits: Number(artifact.cacheHit),
    bootstrapReplicatesComputed: artifact.cacheHit ? 0 : options.replicates * options.blockLengths.length,
    sharedDrawPlanCacheHits: Number(drawPlan?.cacheHit ?? false), sharedDrawReplicatesGenerated: drawPlan && !drawPlan.cacheHit ? options.replicates * options.blockLengths.length : 0 } }));
  return { outputDirectory: invocation, ...report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node run-inference.mjs <plan.json>\nReuses exact canonical calendar-block/shared-team/maxT inference for identical pinned inputs.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const file = path.resolve(process.argv[2]), result = await runInference(readJson(file), { baseDirectory: path.dirname(file) });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, cacheHit: result.cacheHit, resultFile: result.resultFile }));
}

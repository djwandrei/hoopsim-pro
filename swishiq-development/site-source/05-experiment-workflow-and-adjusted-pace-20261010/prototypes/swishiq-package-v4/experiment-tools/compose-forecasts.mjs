import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARTIFACT_FORMAT, hash, loadPinnedJson, loadPinnedJsonl, readJson, verifyManifest, withArtifactCache, writeJson, writeJsonl, pinModuleClosure } from './lib/artifacts.mjs';
import { indexChronology, validLocalDate } from './lib/chronology.mjs';
import { assertDiagnosticOutput } from './lib/output.mjs';
import { loadDesignCache, validateDesignResumeProof } from './lib/design-cache.mjs';

const MEAN_SIGNATURE_FORMAT = 'swishiq-batched-mean-v1';
const CHECKPOINT_FORMAT = 'swishiq-experiment-mean-state-v1';
const COMPOSITION_FORMAT = 'swishiq-compose-forecasts-v1';

function samePath(left, right) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function resolveInput(baseDirectory, file, label) {
  if (typeof file !== 'string' || !file.trim()) throw Error(label + ' path required');
  return path.resolve(baseDirectory, file);
}

function descriptorPath(manifestPath, descriptor) {
  if (typeof descriptor.path !== 'string' || !descriptor.path) throw Error('Invalid manifest output path');
  return path.resolve(path.dirname(manifestPath), descriptor.path);
}

function hasDirectPin(manifestPath, manifest, inputPin) {
  return manifest.files.some(item => samePath(descriptorPath(manifestPath, item), inputPin.path)
    && item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes);
}

function hasVerifiedPin(verified, inputPin) {
  return verified.checked.some(item => samePath(item.path, inputPin.path)
    && item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes);
}

function verifyMeanSource(spec, baseDirectory, label) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw Error(label + ' source object required');
  const forecastsPath = resolveInput(baseDirectory, spec.forecasts, label + ' forecasts');
  const manifestPath = resolveInput(baseDirectory, spec.manifest, label + ' manifest');
  const verified = verifyManifest(manifestPath);
  const manifest = verified.manifest, signature = manifest.signature;
  const completeComposition = label === 'Prefix' && manifest.stage === 'compose-forecasts'
    && signature?.format === COMPOSITION_FORMAT && manifest.metadata?.completeResidualWarmup === true;
  if (manifest.format !== ARTIFACT_FORMAT || !(manifest.stage === 'mean' && signature?.format === MEAN_SIGNATURE_FORMAT || completeComposition)
    || !signature.meanSettings || !signature.designKey
    || !Array.isArray(signature.codePins) || typeof signature.fullRefits !== 'boolean'
    || !signature.designReceiptPin || typeof signature.designReceiptPin.path !== 'string') {
    throw Error(label + ' manifest is not a complete mean-cache receipt');
  }
  const { rows, inputPin } = loadPinnedJsonl(forecastsPath);
  if (!hasDirectPin(manifestPath, manifest, inputPin) || !hasVerifiedPin(verified, inputPin)) {
    throw Error(label + ' forecast bytes are not directly pinned by the supplied mean receipt');
  }
  if (!manifest.files.some(item => item.path === 'forecast-means.jsonl'
    && item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes)) {
    throw Error(label + ' receipt does not identify its forecast-means.jsonl output');
  }
  if (!rows.length) throw Error(label + ' forecast input is empty');
  indexChronology(rows);
  validateFittedDates(rows, label);
  if (new Set(rows.map(row => row.modelVersion)).size !== 1) throw Error(label + ' source has mixed model versions');
  if (rows.some(row => row.modelVersion !== 'experiment-mean-signature-' + manifest.key)) throw Error(label + ' neutral version does not match its mean receipt');
  return { forecastsPath, manifestPath, verified, manifest, signature, rows, inputPin };
}

function validateFittedDates(rows, label) {
  for (const row of rows) {
    if (!validLocalDate(row.fittedOnDate) || row.fittedOnDate > row.gameDateLocal
      || row.coefficientObservedThrough >= row.fittedOnDate
      || row.standardizationObservedThrough >= row.fittedOnDate) {
      throw Error(label + ' fit cutoff failed: ' + row.gameRef);
    }
  }
}

function loadDesign(source) {
  const reference = source.signature.designReceiptPin;
  const loaded = loadDesignCache(reference.path);
  if (loaded.receiptPin.sha256 !== reference.sha256 || loaded.receiptPin.bytes !== reference.bytes
    || loaded.key !== source.signature.designKey) {
    throw Error('Mean source does not identify its verified design receipt');
  }
  return { ...loaded, design: loaded };
}

function assertSameMeanIdentity(prefix, resumed) {
  const fields = ['meanSettings', 'codePins', 'fullRefits'];
  for (const field of fields) if (hash(prefix.signature[field]) !== hash(resumed.signature[field])) {
    throw Error('Prefix and resumed mean sources differ in ' + field);
  }
  if (prefix.manifest.stage === 'mean' && prefix.signature.resumeCheckpointSha256 !== null) throw Error('Prefix source must be an unresumed run or a complete composition');
  if (prefix.signature.designKey === resumed.signature.designKey) {
    if (hash(prefix.signature.designReceiptPin) !== hash(resumed.signature.designReceiptPin)) throw Error('Same-key design receipt changed');
  } else if (resumed.signature.resumeDesignProof?.parentDesignKey !== prefix.signature.designKey
    || resumed.signature.resumeDesignProof?.newDesignKey !== resumed.signature.designKey) throw Error('Changed design requires a verified checkpoint transfer');
  if (!/^[a-f0-9]{64}$/.test(resumed.signature.resumeCheckpointSha256 ?? '')) {
    throw Error('Resumed mean receipt lacks resumeCheckpointSha256');
  }
}

function loadCheckpoint(spec, baseDirectory, prefix, resumed) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw Error('Checkpoint {path, manifest} required');
  const checkpointPath = resolveInput(baseDirectory, spec.path, 'Checkpoint');
  const manifestPath = resolveInput(baseDirectory, spec.manifest, 'Checkpoint manifest');
  const verified = verifyManifest(manifestPath), manifest = verified.manifest;
  const { value: checkpoint, inputPin } = loadPinnedJson(checkpointPath);
  if (!hasDirectPin(manifestPath, manifest, inputPin) || !hasVerifiedPin(verified, inputPin)
    || !hasVerifiedPin(prefix.verified, inputPin)) {
    throw Error('Checkpoint is not pinned by both its supplied receipt and the prefix mean receipt');
  }
  if (prefix.manifest.stage === 'mean' ? verified.manifestPin.sha256 !== prefix.verified.manifestPin.sha256
    || verified.manifestPin.bytes !== prefix.verified.manifestPin.bytes : !hasVerifiedPin(prefix.verified, verified.manifestPin)) throw Error('Checkpoint manifest must belong to the prefix source receipt chain');
  if (manifest.stage !== 'mean' || manifest.signature?.format !== MEAN_SIGNATURE_FORMAT
    || manifest.signature.designKey !== prefix.signature.designKey
    || hash(manifest.signature.meanSettings) !== hash(prefix.signature.meanSettings)
    || hash(manifest.signature.codePins) !== hash(prefix.signature.codePins)) throw Error('Checkpoint receipt does not match the prefix fitting identity');
  if (resumed.signature.resumeDesignProof && (resumed.signature.resumeDesignProof.parentMeanReceiptPin.sha256 !== verified.manifestPin.sha256
    || resumed.signature.resumeDesignProof.checkpointPin.sha256 !== inputPin.sha256)) throw Error('Design transfer identifies a different checkpoint receipt');
  if (checkpoint.format !== CHECKPOINT_FORMAT || checkpoint.completeLocalDateBatch !== true
    || checkpoint.designKey !== prefix.signature.designKey
    || hash(checkpoint.meanSettings) !== hash(prefix.signature.meanSettings)
    || hash(checkpoint) !== resumed.signature.resumeCheckpointSha256
    || !validLocalDate(checkpoint.state?.outcomeDate)
    || checkpoint.state.equationDate !== checkpoint.state.outcomeDate) {
    throw Error('Checkpoint does not match the resumed mean receipt/design/settings');
  }
  return { checkpoint, inputPin, manifestPin: verified.manifestPin };
}

function dateBatches(rows) {
  const batches = [];
  for (let index = 0; index < rows.length; index++) {
    const date = rows[index].gameDateLocal;
    if (!batches.length || batches.at(-1).date !== date) batches.push({ date, start: index, end: index + 1 });
    else batches.at(-1).end = index + 1;
  }
  return batches;
}

function rowIdentity(row) {
  return [row.gameRef, row.gameDateLocal, row.seasonStartYear, row.homeTeamRef ?? null, row.awayTeamRef ?? null, row.target];
}

function assertCoverage(actual, expected, label) {
  if (actual.length !== expected.length || hash(actual.map(rowIdentity)) !== hash(expected.map(rowIdentity))) {
    throw Error(label + ' forecasts do not exactly cover the design rows in date/game order');
  }
}

function composeRows({ prefix, resumed, checkpoint, design }) {
  const outcomeDate = checkpoint.state.outcomeDate;
  const designRows = design.rowMetadata, batches = dateBatches(designRows);
  const boundaryIndex = batches.findIndex(batch => batch.date === outcomeDate);
  if (boundaryIndex < 0) throw Error('Checkpoint outcomeDate is absent from the pinned design chronology');
  const boundary = batches[boundaryIndex];
  for (const head of ['total', 'margin']) {
    if (checkpoint.state.normal?.[head]?.observations !== boundary.end) throw Error('Checkpoint observations do not end at its complete design date');
  }
  if (!checkpoint.state.model) throw Error('Checkpoint has no fitted model for next-design-date continuation');
  const nextBatch = batches[boundaryIndex + 1];
  if (!nextBatch) throw Error('Checkpoint is already at the end of the pinned design');

  const minimumTrainingRows = resumed.signature.meanSettings.minimumTrainingRows;
  if (!Number.isSafeInteger(minimumTrainingRows) || minimumTrainingRows < 1) throw Error('Mean signature lacks a valid minimumTrainingRows setting');
  let trained = false;
  const expectedPrefix = [];
  for (const batch of batches.slice(0, boundaryIndex + 1)) {
    if (!trained && batch.date > design.design.warmupThrough && batch.start >= minimumTrainingRows) trained = true;
    if (trained) expectedPrefix.push(...designRows.slice(batch.start, batch.end));
  }
  if (!expectedPrefix.length) throw Error('Pinned design has no complete prefix forecast warmup');
  const expectedResumed = [];
  trained = Boolean(checkpoint.state.model);
  for (const batch of batches.slice(boundaryIndex + 1)) {
    if (!trained && batch.date > design.design.warmupThrough && batch.start >= minimumTrainingRows) trained = true;
    if (trained) expectedResumed.push(...designRows.slice(batch.start, batch.end));
  }
  if (!expectedResumed.length || expectedResumed[0].gameDateLocal !== nextBatch.date) {
    throw Error('Pinned design does not begin resumed forecasting on the next design date');
  }

  const prefixRows = prefix.rows.filter(row => row.gameDateLocal <= outcomeDate);
  if (resumed.rows.some(row => row.gameDateLocal <= outcomeDate)) throw Error('Resumed source contains forecasts on/before the checkpoint boundary');
  const resumedRows = resumed.rows.filter(row => row.gameDateLocal > outcomeDate);
  assertCoverage(prefixRows, expectedPrefix, 'Prefix');
  assertCoverage(resumedRows, expectedResumed, 'Resumed');
  const ids = new Set(prefixRows.map(row => row.gameRef));
  if (resumedRows.some(row => ids.has(row.gameRef))) throw Error('Duplicate game IDs across composed forecast sources');
  const merged = [...prefixRows, ...resumedRows];
  indexChronology(merged);
  validateFittedDates(merged, 'Composed');
  return { merged, outcomeDate, prefixRows, resumedRows, expectedPrefix, expectedResumed };
}

export async function composeForecasts(plan, { baseDirectory = process.cwd() } = {}) {
  if (!plan || plan.format !== 'swishiq-compose-forecasts-plan-v1') throw Error('Versioned compose-forecasts plan required');
  const prefix = verifyMeanSource(plan.prefix, baseDirectory, 'Prefix');
  const resumed = verifyMeanSource(plan.resumed, baseDirectory, 'Resumed');
  assertSameMeanIdentity(prefix, resumed);
  const checkpointInfo = loadCheckpoint(plan.checkpoint, baseDirectory, prefix, resumed);
  const design = loadDesign(resumed);
  validateDesignResumeProof({ design: design.design, checkpoint: checkpointInfo.checkpoint,
    proof: resumed.signature.resumeDesignProof ?? null });
  const composition = composeRows({ prefix, resumed, checkpoint: checkpointInfo.checkpoint, design });

  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/composed-forecasts'));
  const signature = {
    format: COMPOSITION_FORMAT,
    prefixManifestPin: prefix.verified.manifestPin,
    resumedManifestPin: resumed.verified.manifestPin,
    checkpointManifestPin: checkpointInfo.manifestPin,
    designReceiptPin: design.receiptPin,
    prefixForecastPin: prefix.inputPin,
    resumedForecastPin: resumed.inputPin,
    checkpointFilePin: checkpointInfo.inputPin,
    checkpointContentSha256: hash(checkpointInfo.checkpoint),
    meanSettings: prefix.signature.meanSettings,
    designKey: resumed.signature.designKey,
    designTransferProof: resumed.signature.resumeDesignProof ?? null,
    codePins: prefix.signature.codePins,
    composerCodePins: pinModuleClosure([import.meta.filename]),
    fullRefits: prefix.signature.fullRefits,
    checkpointOutcomeDate: composition.outcomeDate,
    prefixTargetIdentitySha256: hash(composition.prefixRows.map(rowIdentity)),
    resumedTargetIdentitySha256: hash(composition.resumedRows.map(rowIdentity)),
    fullTargetIdentitySha256: hash(composition.merged.map(rowIdentity)),
    forecastCount: composition.merged.length,
  };
  const modelVersion = 'experiment-mean-signature-' + hash(signature);
  const composed = composition.merged.map(row => ({ ...row, modelVersion }));
  if (hash(composed.map(row => row.prediction)) !== hash(composition.merged.map(row => row.prediction))) {
    throw Error('Composed predictions changed during model-version normalization');
  }
  const chronology = indexChronology(composed);
  const artifact = withArtifactCache(outputRoot, 'compose-forecasts', signature, directory => {
    writeJsonl(path.join(directory, 'forecast-means.jsonl'), composed);
    writeJson(path.join(directory, 'composition.json'), {
      format: COMPOSITION_FORMAT,
      status: 'development-composition; canonical-parity-not-established',
      modelVersion,
      completeResidualWarmup: true,
      independentValidation: 'not-performed',
      promotionAllowed: false,
      checkpointOutcomeDate: composition.outcomeDate,
      counts: { prefix: composition.prefixRows.length, resumed: composition.resumedRows.length, total: composed.length },
      chronology,
      predictionValuesPreserved: true,
      sourceReceipts: {
        prefix: { path: prefix.verified.manifestPin.path, sha256: prefix.verified.manifestPin.sha256, key: prefix.manifest.key },
        resumed: { path: resumed.verified.manifestPin.path, sha256: resumed.verified.manifestPin.sha256, key: resumed.manifest.key },
        checkpoint: { path: checkpointInfo.inputPin.path, sha256: checkpointInfo.inputPin.sha256, meanStateSha256: hash(checkpointInfo.checkpoint) },
        design: { path: design.receiptPin.path, sha256: design.receiptPin.sha256, key: design.receipt.key },
      },
      notes: ['Prediction numbers are copied unchanged; only modelVersion is normalized to the composition signature.',
        'The complete forecast sequence remains experiment-only and has no independent predictive validation.'],
    });
    return { format: COMPOSITION_FORMAT, completeResidualWarmup: true, forecastCount: composed.length,
      prefixForecasts: composition.prefixRows.length, resumedForecasts: composition.resumedRows.length,
      checkpointOutcomeDate: composition.outcomeDate, targetIdentitySha256: chronology.targetIdentitySha256,
      independentValidation: 'not-performed', promotionAllowed: false };
  });
  return { outputDirectory: artifact.directory, resultKey: artifact.key, cacheHit: artifact.cacheHit,
    forecastFile: path.join(artifact.directory, 'forecast-means.jsonl'), manifestFile: path.join(artifact.directory, 'receipt.json'),
    ...artifact.receipt.metadata };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2] || process.argv.includes('--help')) {
    console.log('Usage: node compose-forecasts.mjs <plan.json>\nComposes separately pinned mean-cache forecasts across a verified checkpoint.');
    process.exit(process.argv.includes('--help') ? 0 : 1);
  }
  const planPath = path.resolve(process.argv[2]);
  const result = await composeForecasts(readJson(planPath), { baseDirectory: path.dirname(planPath) });
  console.log(JSON.stringify({ outputDirectory: result.outputDirectory, cacheHit: result.cacheHit,
    forecastCount: result.forecastCount, manifestFile: result.manifestFile }));
}

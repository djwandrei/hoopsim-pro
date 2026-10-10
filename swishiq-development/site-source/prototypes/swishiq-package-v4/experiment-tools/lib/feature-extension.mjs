import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  atomicWrite, hash, loadPinnedBytes, loadPinnedJson, pinModuleClosure,
  verifyManifest, withArtifactCache, writeJson,
} from './artifacts.mjs';
import { indexChronology } from './chronology.mjs';
import { assertDiagnosticOutput } from './output.mjs';

const FEATURE_EXTENSION_FORMAT = 'swishiq-feature-extension-v1';
const PLAN_FORMAT = 'swishiq-feature-extension-plan-v1';
const REQUIRED_CONTRACT_FIELDS = ['inputSource', 'version', 'formula', 'window', 'shrinkage', 'missingBehavior'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function hasContractValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'boolean';
}

function validateContract(contract) {
  if (!isRecord(contract)) throw Error('Feature contract JSON must be an object');
  for (const field of REQUIRED_CONTRACT_FIELDS) {
    if (!Object.hasOwn(contract, field) || !hasContractValue(contract[field])) {
      throw Error(`Feature contract must supply nonempty ${field} semantics`);
    }
  }
  // Ensure the complete supplied JSON value is finite and serializable without
  // supplying or transforming any of its domain semantics.
  hash(contract);
  return contract;
}

function parseJsonl(buffer, file) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) throw Error('Empty JSONL: ' + file);
  const rawRows = text.split(/\r?\n/);
  if (rawRows.at(-1) === '') rawRows.pop();
  const rows = rawRows.map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw Error(`${file}:${index + 1}: ${error.message}`); }
  });
  if (!rows.length) throw Error('Empty JSONL: ' + file);
  return { rows, rawRows };
}

function validateFeatureObjects(rows, label) {
  let schema = null;
  for (let index = 0; index < rows.length; index++) {
    const features = rows[index]?.features;
    if (!isRecord(features) || Object.keys(features).sort().join('\0') !== 'margin\0total'
      || !isRecord(features.total) || !isRecord(features.margin)) {
      throw Error(`${label}: total and margin head feature objects required at row ${index}`);
    }
    const rowSchema = {};
    for (const head of ['total', 'margin']) {
      const values = features[head], names = Object.keys(values).sort();
      if (!names.length || names.some(name => !name.trim())) throw Error(`${label}: nonempty ${head} feature schema required at row ${index}`);
      for (const name of names) {
        const value = values[name];
        if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
          throw Error(`${label}: ${head}.${name} must be finite or null at row ${index}`);
        }
      }
      rowSchema[head] = names;
    }
    if (schema && hash(rowSchema) !== hash(schema)) throw Error(`${label}: head feature schema changed at row ${index}`);
    schema ??= rowSchema;
  }
  return schema;
}

function declaredContractHash(manifest, label) {
  const candidates = [
    ['featureContractHash', manifest.featureContractHash],
    ['contractHash', manifest.contractHash],
    ['featureContractHash', manifest.signature?.featureContractHash],
    ['contractHash', manifest.signature?.contractHash],
    ['featureContractHash', manifest.metadata?.featureContractHash],
    ['contractHash', manifest.metadata?.contractHash],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  const distinct = [...new Set(candidates.map(([, value]) => value))];
  if (distinct.length > 1) throw Error(`${label}: conflicting declared contract hashes`);
  if (!distinct.length) return { value: null, field: null };
  const [field, value] = candidates[0];
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    throw Error(`${label}: declared ${field} must be a SHA-256 hex digest`);
  }
  return { value: value.toLowerCase(), field };
}

function physicalPath(file) {
  return fs.existsSync(file) ? fs.realpathSync.native(file) : path.resolve(file);
}

function directPinMatches(manifestFile, manifest, pathMap, inputFile, inputPin) {
  const descriptors = [...(manifest.sourcePins ?? []), ...(manifest.artifactPins ?? []), ...(manifest.files ?? [])];
  const target = physicalPath(inputFile);
  return descriptors.some(descriptor => {
    if (typeof descriptor?.path !== 'string' || !descriptor.path) return false;
    const mapped = pathMap?.[descriptor.path]
      ?? (path.isAbsolute(descriptor.path) ? descriptor.path : path.resolve(path.dirname(manifestFile), descriptor.path));
    const resolved = path.resolve(mapped);
    let sameFile = resolved === path.resolve(inputFile);
    if (!sameFile && fs.existsSync(resolved) && fs.existsSync(inputFile)) sameFile = physicalPath(resolved) === target;
    return sameFile && descriptor.sha256 === inputPin.sha256
      && (descriptor.bytes ?? descriptor.byteLength) === inputPin.bytes;
  });
}

function loadSource(source, label, baseDirectory) {
  if (!isRecord(source) || typeof source.features !== 'string' || !source.features.trim()
    || typeof source.manifest !== 'string' || !source.manifest.trim()) {
    throw Error(`${label} source requires features and manifest paths`);
  }
  if (source.pathMap !== undefined && !isRecord(source.pathMap)) throw Error(`${label} pathMap must be an object`);
  const featuresFile = path.resolve(baseDirectory, source.features);
  const manifestFile = path.resolve(baseDirectory, source.manifest);
  const { buffer, inputPin } = loadPinnedBytes(featuresFile);
  const verified = verifyManifest(manifestFile, { pathMap: source.pathMap ?? {} });
  const manifest = verified.manifest, manifestPin = verified.manifestPin;
  if (!directPinMatches(manifestFile, manifest, source.pathMap ?? {}, featuresFile, inputPin)) {
    throw Error(`${label} manifest must directly pin its exact feature JSONL file`);
  }
  if (!verified.checked.some(item => item.sha256 === inputPin.sha256 && item.bytes === inputPin.bytes)) {
    throw Error(`${label} feature JSONL is absent from the verified manifest pins`);
  }
  const parsed = parseJsonl(buffer, featuresFile);
  const featureSchema = validateFeatureObjects(parsed.rows, label);
  const chronology = indexChronology(parsed.rows, { kind: 'feature' });
  return {
    label,
    featuresFile,
    manifestFile,
    inputPin,
    buffer,
    manifestPin,
    manifest,
    verified,
    rows: parsed.rows,
    rawRows: parsed.rawRows,
    chronology,
    featureSchema,
    stableRowSha256: hash(parsed.rows),
    declaredContract: declaredContractHash(manifest, label),
    pathMap: source.pathMap ?? {},
  };
}

function sourceSummary(source) {
  const first = source.rows[0], last = source.rows.at(-1);
  return {
    features: source.inputPin,
    manifest: source.manifestPin,
    manifestFormat: source.manifest.format ?? null,
    manifestVerifiedPins: source.verified.checked,
    declaredContractHash: source.declaredContract.value,
    declaredContractHashField: source.declaredContract.field,
    rows: source.rows.length,
    firstDate: first.gameDateLocal,
    lastDate: last.gameDateLocal,
    firstGameRef: first.gameRef,
    lastGameRef: last.gameRef,
    stableRowSha256: source.stableRowSha256,
  };
}

function ensureContractProvenance(base, tail, contractPin, contract, allowLegacyContractAcknowledgment) {
  const declared = [base.declaredContract.value, tail.declaredContract.value];
  for (const [index, value] of declared.entries()) {
    if (value && value !== contractPin.sha256) {
      throw Error(`${index === 0 ? 'base' : 'tail'} declared contract hash does not match the supplied contract JSON SHA-256`);
    }
  }
  if (declared[0] && declared[1] && declared[0] !== declared[1]) {
    throw Error('Base and tail source receipts declare different feature contract hashes');
  }
  const unprovenSources = [base, tail].filter(source => !source.declaredContract.value).map(source => source.label);
  if (unprovenSources.length && allowLegacyContractAcknowledgment !== true) {
    throw Error('A legacy source receipt has no declared feature contract hash; set allowLegacyContractAcknowledgment: true only after acknowledging the supplied contract semantics');
  }
  return {
    suppliedContractSha256: contractPin.sha256,
    suppliedContractSemanticSha256: hash(contract),
    sourceHashStatus: unprovenSources.length ? 'unproven-legacy-source-hash' : 'both-declared-hashes-match',
    callerAcknowledgedLegacyContractSemantics: unprovenSources.length > 0 && allowLegacyContractAcknowledgment === true,
    unprovenSources,
    baseDeclaredContractHash: declared[0],
    tailDeclaredContractHash: declared[1],
  };
}

function outputRowsBytes(baseBuffer, tailRawRows) {
  const endsWithNewline = /(?:\r?\n)$/.test(baseBuffer.toString('utf8'));
  const prefix = endsWithNewline ? baseBuffer : Buffer.concat([baseBuffer, Buffer.from('\n')]);
  return Buffer.concat([prefix, Buffer.from(tailRawRows.join('\n') + '\n', 'utf8')]);
}

export function extendFeatureArtifact(plan, { baseDirectory = process.cwd(), entryFile = null } = {}) {
  if (!isRecord(plan) || plan.format !== PLAN_FORMAT || !isRecord(plan.base) || !isRecord(plan.tail)
    || typeof plan.contract !== 'string' || !plan.contract.trim()) {
    throw Error(`Expected ${PLAN_FORMAT} with base, tail, and contract paths`);
  }
  for (const field of ['cacheRoot', 'outputDirectory']) {
    if (plan[field] !== undefined && (typeof plan[field] !== 'string' || !plan[field].trim())) {
      throw Error(`${field} must be a nonempty path when supplied`);
    }
  }
  if (plan.allowLegacyContractAcknowledgment !== undefined && typeof plan.allowLegacyContractAcknowledgment !== 'boolean') {
    throw Error('allowLegacyContractAcknowledgment must be a boolean when supplied');
  }
  const allowLegacy = plan.allowLegacyContractAcknowledgment === true;

  // Read and validate inputs in dependency order. Parsing uses the exact pinned
  // buffers returned here, so hashes and rows cannot refer to different reads.
  const base = loadSource(plan.base, 'base', baseDirectory);
  const tail = loadSource(plan.tail, 'tail', baseDirectory);
  const sourcePathMap = { ...base.pathMap };
  for (const [original, relocated] of Object.entries(tail.pathMap)) {
    if (Object.hasOwn(sourcePathMap, original) && sourcePathMap[original] !== relocated) throw Error('Conflicting source path relocation: ' + original);
    sourcePathMap[original] = relocated;
  }
  const contractFile = path.resolve(baseDirectory, plan.contract);
  const { value: contract, inputPin: contractPin } = loadPinnedJson(contractFile);
  validateContract(contract);
  const contractProvenance = ensureContractProvenance(base, tail, contractPin, contract, allowLegacy);

  const baseLastDate = base.rows.at(-1).gameDateLocal;
  const tailFirstDate = tail.rows[0].gameDateLocal;
  if (tailFirstDate <= baseLastDate) throw Error('Tail local dates must be strictly later than the final base local date');
  const featureSchema = base.featureSchema;
  const tailSchema = tail.featureSchema;
  if (hash(featureSchema) !== hash(tailSchema)) throw Error('Base and tail head feature schemas differ');
  const extendedRows = [...base.rows, ...tail.rows];
  const chronology = indexChronology(extendedRows, { kind: 'feature' });
  if (hash(extendedRows.slice(0, base.rows.length)) !== base.stableRowSha256) {
    throw Error('Extended rows do not preserve the exact base row prefix');
  }

  const codeEntryFiles = [import.meta.filename, ...(entryFile ? [path.resolve(entryFile)] : [])];
  const codePins = pinModuleClosure(codeEntryFiles);
  const signature = {
    format: FEATURE_EXTENSION_FORMAT,
    baseManifestPin: base.manifestPin,
    tailManifestPin: tail.manifestPin,
    base: { inputPin: base.inputPin, manifestPin: base.manifestPin, verifiedPins: base.verified.checked, pathMap: base.pathMap,
      declaredContractHash: base.declaredContract.value, stableRowSha256: base.stableRowSha256 },
    tail: { inputPin: tail.inputPin, manifestPin: tail.manifestPin, verifiedPins: tail.verified.checked, pathMap: tail.pathMap,
      declaredContractHash: tail.declaredContract.value, stableRowSha256: tail.stableRowSha256 },
    contractPin,
    contractSemanticSha256: hash(contract),
    contractProvenance,
    allowLegacyContractAcknowledgment: allowLegacy,
    sourcePathMap,
    codePins,
    nodeVersion: process.version,
  };
  const cacheRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.cacheRoot ?? '../runs/cache'));
  const outputRoot = assertDiagnosticOutput(path.resolve(baseDirectory, plan.outputDirectory ?? '../runs/feature-extensions'));
  const artifact = withArtifactCache(cacheRoot, 'feature-extension', signature, directory => {
    const rowsFile = path.join(directory, 'feature-rows.jsonl');
    const manifestFile = path.join(directory, 'feature-extension.json');
    const outputBytes = outputRowsBytes(base.buffer, tail.rawRows);
    atomicWrite(rowsFile, outputBytes);
    const outputPin = { path: rowsFile, bytes: outputBytes.length, sha256: hash(outputBytes) };
    const parsedOutput = parseJsonl(outputBytes, rowsFile);
    if (hash(parsedOutput.rows) !== hash(extendedRows)
      || !outputBytes.subarray(0, base.inputPin.bytes).equals(base.buffer)) {
      throw Error('Cached extended JSONL failed base-prefix or complete-row verification');
    }
    const extension = {
      format: FEATURE_EXTENSION_FORMAT,
      featureContractHash: contractPin.sha256,
      status: 'experiment-infrastructure; parity-not-established',
      parityEstablished: false,
      createdAt: new Date().toISOString(),
      prefixRows: base.rows.length,
      rowCount: extendedRows.length,
      baseLastDate,
      tailBounds: { firstDate: tailFirstDate, lastDate: tail.rows.at(-1).gameDateLocal, rows: tail.rows.length,
        firstGameRef: tail.rows[0].gameRef, lastGameRef: tail.rows.at(-1).gameRef },
      base: sourceSummary(base),
      tail: sourceSummary(tail),
      contract: { value: contract, inputPin: contractPin, stableSemanticSha256: hash(contract) },
      contractProvenance,
      featureSchema,
      chronology: { rows: chronology.rowCount, dates: chronology.dates.length, targetIdentitySha256: chronology.targetIdentitySha256 },
      extendedRowsSha256: hash(extendedRows),
      extendedJsonlPin: { path: 'feature-rows.jsonl', bytes: outputPin.bytes, sha256: outputPin.sha256 },
      artifactPins: [{ path: 'feature-rows.jsonl', bytes: outputPin.bytes, sha256: outputPin.sha256 }],
      codePins,
      cacheSignatureSha256: hash(signature),
      notes: [
        'The base JSONL bytes are retained as the exact output prefix; tail row objects are appended without feature-policy transformations.',
        'Source contract hashes establish only declared contract-file identity. A legacy acknowledgment records supplied semantics but does not prove historical source construction.',
        'Parity with the canonical source builder or any model-scoring path has not been established.',
      ],
    };
    writeJson(manifestFile, extension);
    return { prefixRows: base.rows.length, tailRows: tail.rows.length, rowCount: extendedRows.length,
      featureContractHash: contractPin.sha256,
      baseLastDate, tailFirstDate, tailLastDate: tail.rows.at(-1).gameDateLocal,
      stableRowSha256: extension.extendedRowsSha256, featureRowsSha256: outputPin.sha256 };
  });

  fs.mkdirSync(outputRoot, { recursive: true });
  const invocation = path.join(outputRoot, `run-${Date.now()}-${process.pid}-${randomUUID()}`);
  fs.mkdirSync(invocation, { recursive: false });
  const featureRowsFile = path.join(artifact.directory, 'feature-rows.jsonl');
  const featureExtensionFile = path.join(artifact.directory, 'feature-extension.json');
  const index = {
    format: 'swishiq-feature-extension-run-v1',
    status: 'experiment-infrastructure; parity-not-established',
    cacheHit: artifact.cacheHit,
    cacheKey: artifact.key,
    cacheDirectory: artifact.directory,
    receiptFile: path.join(artifact.directory, 'receipt.json'),
    sourcePathMap,
    featureRowsFile,
    featureExtensionFile,
    outputDirectory: invocation,
    prefixRows: base.rows.length,
    rowCount: extendedRows.length,
    baseLastDate,
    tailBounds: { firstDate: tailFirstDate, lastDate: tail.rows.at(-1).gameDateLocal, rows: tail.rows.length },
    contractProvenance,
    parityEstablished: false,
  };
  writeJson(path.join(invocation, 'feature-extension-run.json'), index);
  return index;
}

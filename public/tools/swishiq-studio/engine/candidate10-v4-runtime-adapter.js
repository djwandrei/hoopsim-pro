/*
 * Browser-only Candidate10 V9 runtime loader.
 *
 * Bundle, checkpoint, approval, and data assets are fetched as bytes and pinned
 * with Web Crypto SHA-256. The default model loader also verifies and rebuilds
 * a Blob-module graph; standalone Candidate12 can instead provide a module
 * closure verified and bundled at build time into its same-origin lazy route.
 */

export const CANDIDATE10_V4_RUNTIME_ADAPTER_FORMAT = 'djhc-swishiq-game-lab-candidate10-v4-runtime-adapter-v1';
export const CANDIDATE10_V4_RUNTIME_ADAPTER_VERSION = 'swishiq-game-lab-candidate10-v4-runtime-adapter-v1';
export const CANDIDATE10_V4_MODEL_BUNDLE_PATH = './game-lab-candidate10-v9-model-bundle.json';
export const CANDIDATE10_V4_MODEL_BUNDLE_SHA256 = '6e773a953e38daf2a0d6d605a1a8d9796021d02f72a4455c831713430b66aecf';
export const CANDIDATE10_V4_MANUAL_APPROVAL_SHA256 = '7eb99fb2bed37e0b10325303242bb8f161b9302ffe509ac4f1a0ec19ed79601a';

const BUNDLE_FORMAT = 'djhc-swishiq-game-lab-candidate10-browser-model-bundle-v1';
const MODEL_ID = 'game-lab-candidate10-v9';
const CHECKPOINT_FORMAT = 'swishiq-candidate10-raw-checkpoint-v1';
const DISTRIBUTION_VERSION = 'swishiq-candidate10-stable-shape-checkpointed-raw-v9';
const HASH_RE = /^[a-f0-9]{64}$/;
const FLAT_MODULE_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mjs$/;
const FLAT_JSON_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
const FROM_SPECIFIER_RE = /\bfrom\s*(["'])([^"']+)\1/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(/;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) {
    fail('candidate10-runtime-pin-invalid', `${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requireByteLength(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('candidate10-runtime-pin-invalid', `${label} must be a positive integer byte length.`);
  }
  return value;
}

function requireFlatPath(value, expression, label) {
  if (typeof value !== 'string' || !expression.test(value)) {
    fail('candidate10-runtime-path-invalid', `${label} must be a flat, relative asset filename.`);
  }
  return value;
}

function asUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    fail('candidate10-runtime-url-invalid', `${label} must be an absolute URL.`);
  }
}

async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    fail('candidate10-runtime-web-crypto-unavailable', 'Web Crypto SHA-256 is unavailable in this browser context.');
  }
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = new Uint8Array(await subtle.digest('SHA-256', view));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchPinnedBytes({ fetchImpl, url, expectedSha256, expectedByteLength, signal, label }) {
  if (typeof fetchImpl !== 'function') {
    fail('candidate10-runtime-fetch-unavailable', 'A browser-compatible fetch implementation is required.');
  }
  let response;
  try {
    response = await fetchImpl(url, { credentials: 'same-origin', signal });
  } catch (error) {
    fail('candidate10-runtime-fetch-failed', `Unable to fetch ${label}: ${error?.message || String(error)}`);
  }
  if (!response || response.ok !== true || typeof response.arrayBuffer !== 'function') {
    fail('candidate10-runtime-fetch-failed', `Unable to fetch ${label}: the server did not return a successful byte response.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== expectedByteLength) {
    fail('candidate10-runtime-byte-length-mismatch', `${label} byte length does not match its reviewed content pin.`);
  }
  const actualSha256 = await sha256Hex(bytes);
  if (actualSha256 !== expectedSha256) {
    fail('candidate10-runtime-sha256-mismatch', `${label} SHA-256 does not match its reviewed content pin.`);
  }
  return bytes;
}

function parseJson(bytes, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('candidate10-runtime-json-invalid', `${label} is not valid UTF-8 JSON.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail('candidate10-runtime-json-invalid', `${label} is not valid JSON.`);
  }
}

function normalizeModuleDescriptor(value, label) {
  if (!isObject(value)) fail('candidate10-runtime-bundle-invalid', `${label} must be an object.`);
  return Object.freeze({
    path: requireFlatPath(value.path, FLAT_MODULE_PATH_RE, `${label}.path`),
    sha256: requireHash(value.sha256, `${label}.sha256`),
    byteLength: requireByteLength(value.byteLength, `${label}.byteLength`),
  });
}

function normalizeBundle(value) {
  if (!isObject(value)
    || value.format !== BUNDLE_FORMAT
    || value.modelId !== MODEL_ID
    || value.releaseStatus !== 'owner-manual-override-approved'
    || value.predictiveReleaseStatus !== 'owner-approved-predictive-use') {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 bundle does not contain the reviewed owner-approved V9 release metadata.');
  }
  if (typeof value.manualApprovalPath !== 'string' || !value.manualApprovalPath.trim()
    || typeof value.sourceModelStatus !== 'string' || !value.sourceModelStatus
    || typeof value.frozenEmpiricalStatus !== 'string' || !value.frozenEmpiricalStatus) {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 bundle is missing required approval provenance.');
  }
  if (!Array.isArray(value.modules) || !value.modules.length) {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 bundle must pin a nonempty module closure.');
  }
  const modules = value.modules.map((entry, index) => normalizeModuleDescriptor(entry, `modules[${index}]`));
  if (new Set(modules.map(entry => entry.path)).size !== modules.length) {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 bundle contains duplicate module paths.');
  }
  const entryModule = normalizeModuleDescriptor(value.entryModule, 'entryModule');
  const matchingEntry = modules.find(entry => entry.path === entryModule.path);
  if (!matchingEntry || matchingEntry.sha256 !== entryModule.sha256 || matchingEntry.byteLength !== entryModule.byteLength
    || !Array.isArray(value.entryModule.exports)
    || !value.entryModule.exports.includes('hydrateCandidate10Distribution')
    || !value.entryModule.exports.includes('predictCandidate10Distribution')
    || !value.entryModule.exports.includes('observeCandidate10Distribution')) {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 entry module is not fully pinned or lacks its required runtime exports.');
  }
  const checkpoint = value.checkpoint;
  if (!isObject(checkpoint)
    || checkpoint.format !== CHECKPOINT_FORMAT
    || checkpoint.distributionVersion !== DISTRIBUTION_VERSION) {
    fail('candidate10-runtime-bundle-invalid', 'The Candidate10 bundle checkpoint is not a V9 raw checkpoint.');
  }
  const checkpointDescriptor = Object.freeze({
    path: requireFlatPath(checkpoint.path, FLAT_JSON_PATH_RE, 'checkpoint.path'),
    sha256: requireHash(checkpoint.sha256, 'checkpoint.sha256'),
    byteLength: requireByteLength(checkpoint.byteLength, 'checkpoint.byteLength'),
    format: checkpoint.format,
    distributionVersion: checkpoint.distributionVersion,
    lastObservedDate: typeof checkpoint.lastObservedDate === 'string' ? checkpoint.lastObservedDate : null,
    residualPairCount: Number.isSafeInteger(checkpoint.residualPairCount) ? checkpoint.residualPairCount : null,
    shapeResidualPairCount: Number.isSafeInteger(checkpoint.shapeResidualPairCount) ? checkpoint.shapeResidualPairCount : null,
  });
  return Object.freeze({
    format: value.format,
    version: typeof value.version === 'string' ? value.version : null,
    modelId: value.modelId,
    releaseStatus: value.releaseStatus,
    predictiveReleaseStatus: value.predictiveReleaseStatus,
    runtimeStatus: typeof value.runtimeStatus === 'string' ? value.runtimeStatus : null,
    manualApprovalPath: value.manualApprovalPath,
    sourceModelStatus: value.sourceModelStatus,
    frozenEmpiricalStatus: value.frozenEmpiricalStatus,
    entryModule,
    modules: Object.freeze(modules),
    checkpoint: checkpointDescriptor,
    consumerRequirements: isObject(value.consumerRequirements) ? Object.freeze({ ...value.consumerRequirements }) : Object.freeze({}),
  });
}

function normalizeManualApproval(value, bundle) {
  const approval = value?.approval;
  if (!isObject(value)
    || value.format !== 'djhc-swishiq-v4-manual-predictive-approval-v1'
    || !isObject(approval)
    || approval.status !== 'owner-manual-override-approved'
    || approval.predictiveReleaseStatus !== 'owner-approved-predictive-use'
    || approval.objectiveValidationStatus !== 'criteria-not-fully-passed'
    || approval.packageWideValidityEstablished !== false
    || approval.prospectiveValidityEstablished !== false) {
    fail('candidate10-runtime-approval-invalid', 'The pinned Candidate10 manual approval does not match the reviewed owner-approved release decision.');
  }
  const model = value.model;
  const v5 = bundle.modules.find(entry => entry.path === 'game-lab-native-score-model-candidate10-v5.mjs');
  if (!isObject(model)
    || model.modelId !== 'game-lab-candidate10-v5'
    || !v5
    || model.sourceSha256 !== v5.sha256) {
    fail('candidate10-runtime-approval-invalid', 'The manual approval model pin does not match the verified Candidate10 V5 module.');
  }
  return Object.freeze({
    format: value.format,
    version: typeof value.version === 'string' ? value.version : null,
    createdAtUtc: typeof value.createdAtUtc === 'string' ? value.createdAtUtc : null,
    status: approval.status,
    predictiveReleaseStatus: approval.predictiveReleaseStatus,
    objectiveValidationStatus: approval.objectiveValidationStatus,
    packageWideValidityEstablished: approval.packageWideValidityEstablished,
    prospectiveValidityEstablished: approval.prospectiveValidityEstablished,
    scope: typeof approval.scope === 'string' ? approval.scope : null,
    authority: typeof approval.authority === 'string' ? approval.authority : null,
    model: Object.freeze({ modelId: model.modelId, sourcePath: model.sourcePath, sourceSha256: model.sourceSha256 }),
  });
}

function resolveBuildPinnedEntry(moduleRuntime, bundle) {
  if (!isObject(moduleRuntime) || !Array.isArray(moduleRuntime.modules) || !isObject(moduleRuntime.entry)) {
    fail('candidate10-runtime-module-runtime-invalid', 'The standalone Candidate10 module runtime is incomplete.');
  }
  if (moduleRuntime.entryPath !== bundle.entryModule.path || moduleRuntime.modules.length !== bundle.modules.length) {
    fail('candidate10-runtime-module-runtime-mismatch', 'The standalone Candidate10 module entry or closure differs from the pinned bundle.');
  }
  const buildPins = new Map();
  for (const [index, value] of moduleRuntime.modules.entries()) {
    if (!isObject(value)
      || typeof value.path !== 'string'
      || typeof value.sha256 !== 'string'
      || !Number.isSafeInteger(value.byteLength)
      || buildPins.has(value.path)) {
      fail('candidate10-runtime-module-runtime-invalid', `The standalone Candidate10 module pin at index ${index} is invalid.`);
    }
    buildPins.set(value.path, value);
  }
  for (const descriptor of bundle.modules) {
    const pinned = buildPins.get(descriptor.path);
    if (!pinned || pinned.sha256 !== descriptor.sha256 || pinned.byteLength !== descriptor.byteLength) {
      fail('candidate10-runtime-module-runtime-mismatch', `The built Candidate10 module pin for ${descriptor.path} does not match the pinned bundle.`);
    }
  }
  return moduleRuntime.entry;
}

function createVerifiedModuleGraph(moduleSources, entryPath) {
  if (typeof Blob !== 'function' || !globalThis.URL || typeof URL.createObjectURL !== 'function') {
    fail('candidate10-runtime-module-loader-unavailable', 'This browser cannot construct verified Blob modules.');
  }
  const urls = new Map();
  const visiting = new Set();
  const create = path => {
    if (urls.has(path)) return urls.get(path);
    if (visiting.has(path)) fail('candidate10-runtime-module-cycle', `Candidate10 module closure contains an import cycle at ${path}.`);
    const source = moduleSources.get(path);
    if (typeof source !== 'string') fail('candidate10-runtime-module-missing', `Candidate10 module ${path} was not fetched from the reviewed closure.`);
    if (DYNAMIC_IMPORT_RE.test(source)) {
      fail('candidate10-runtime-module-invalid', `Candidate10 module ${path} contains a dynamic import outside the reviewed closure.`);
    }
    visiting.add(path);
    const rewritten = source.replace(FROM_SPECIFIER_RE, (match, quote, specifier) => {
      if (!specifier.startsWith('./') || specifier.includes('/') && specifier.slice(2).includes('/')) {
        fail('candidate10-runtime-module-invalid', `Candidate10 module ${path} imports an unsupported path ${specifier}.`);
      }
      const dependencyPath = specifier.slice(2);
      if (!moduleSources.has(dependencyPath)) {
        fail('candidate10-runtime-module-missing', `Candidate10 module ${path} imports ${specifier}, which is absent from the reviewed closure.`);
      }
      return `from ${quote}${create(dependencyPath)}${quote}`;
    });
    const url = URL.createObjectURL(new Blob([rewritten], { type: 'text/javascript' }));
    urls.set(path, url);
    visiting.delete(path);
    return url;
  };
  try {
    return Object.freeze({
      entryUrl: create(entryPath),
      revoke() {
        for (const url of urls.values()) URL.revokeObjectURL(url);
      },
    });
  } catch (error) {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    throw error;
  }
}

function normalizePredictionRequest(value) {
  if (!isObject(value)
    || !isObject(value.inputFeatures)
    || typeof value.targetGameRef !== 'string'
    || !value.targetGameRef.trim()) {
    fail('candidate10-runtime-request-invalid', 'Prediction requires inputFeatures and a nonempty targetGameRef.');
  }
  if (!isObject(value.inputFeatures.historicalContext)
    || value.inputFeatures.historicalContext.format !== 'swishiq-game-prior-history-context-v2') {
    fail('candidate10-runtime-input-contract-unavailable', 'Candidate10 requires dated inputFeatures.historicalContext v2; the caller must build it from strictly prior whole-date game history.');
  }
  return Object.freeze({ inputFeatures: value.inputFeatures, targetGameRef: value.targetGameRef.trim() });
}

function normalizeObservationRequest(value) {
  if (!isObject(value) || !Array.isArray(value.rows) || !value.rows.length) {
    fail('candidate10-runtime-request-invalid', 'Outcome feedback requires a nonempty rows array for one complete predicted local date.');
  }
  return Object.freeze({ rows: value.rows });
}

function makeReleaseProvenance(bundle, approval, urls, bundleSha256) {
  return Object.freeze({
    modelId: bundle.modelId,
    releaseStatus: bundle.releaseStatus,
    predictiveReleaseStatus: bundle.predictiveReleaseStatus,
    sourceModelStatus: bundle.sourceModelStatus,
    frozenEmpiricalStatus: bundle.frozenEmpiricalStatus,
    objectiveValidationStatus: approval.objectiveValidationStatus,
    packageWideValidityEstablished: approval.packageWideValidityEstablished,
    prospectiveValidityEstablished: approval.prospectiveValidityEstablished,
    approval: Object.freeze({
      status: approval.status,
      predictiveReleaseStatus: approval.predictiveReleaseStatus,
      objectiveValidationStatus: approval.objectiveValidationStatus,
      packageWideValidityEstablished: approval.packageWideValidityEstablished,
      prospectiveValidityEstablished: approval.prospectiveValidityEstablished,
      scope: approval.scope,
      authority: approval.authority,
      createdAtUtc: approval.createdAtUtc,
      sha256: urls.approvalSha256,
    }),
    bundle: Object.freeze({ url: urls.bundle.href, sha256: bundleSha256 }),
    checkpoint: Object.freeze({
      url: urls.checkpoint.href,
      sha256: bundle.checkpoint.sha256,
      lastObservedDate: bundle.checkpoint.lastObservedDate,
      distributionVersion: bundle.checkpoint.distributionVersion,
    }),
    manualApprovalUrl: urls.approval.href,
  });
}

/**
 * Loads a pinned Candidate10 V9 browser runtime for one chronological game
 * stream. `predict` mutates its pending-date state; callers must call
 * `observe` with each complete predicted local date before predicting another.
 * `run({ source, targetGameRef })` is a compatibility alias for callers whose
 * Game Lab source wrapper stores the dated inputFeatures under `.inputFeatures`.
 */
export async function loadCandidate10V4Runtime({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal,
  bundleUrl = new URL(CANDIDATE10_V4_MODEL_BUNDLE_PATH, import.meta.url),
  moduleRuntime = null,
} = {}) {
  const selectedBundleUrl = asUrl(bundleUrl, 'bundleUrl');
  const selectedBundleSha256 = CANDIDATE10_V4_MODEL_BUNDLE_SHA256;
  const bundleBytes = await fetchPinnedBytes({
    fetchImpl,
    url: selectedBundleUrl,
    expectedSha256: selectedBundleSha256,
    expectedByteLength: 2828,
    signal,
    label: 'Candidate10 V9 model bundle',
  });
  const bundle = normalizeBundle(parseJson(bundleBytes, 'Candidate10 V9 model bundle'));
  const moduleUrls = new Map(bundle.modules.map(entry => [entry.path, new URL(entry.path, selectedBundleUrl)]));
  const checkpointUrl = new URL(bundle.checkpoint.path, selectedBundleUrl);
  const approvalUrl = new URL(bundle.manualApprovalPath, selectedBundleUrl);
  if (approvalUrl.origin !== selectedBundleUrl.origin) {
    fail('candidate10-runtime-approval-url-invalid', 'The manual approval record must be fetched from the same origin as the reviewed bundle.');
  }
  const buildPinnedEntry = moduleRuntime ? resolveBuildPinnedEntry(moduleRuntime, bundle) : null;
  const [moduleRecords, checkpointBytes, approvalBytes] = await Promise.all([
    moduleRuntime ? Promise.resolve(null) : Promise.all(bundle.modules.map(async descriptor => Object.freeze({
      path: descriptor.path,
      text: new TextDecoder('utf-8', { fatal: true }).decode(await fetchPinnedBytes({
        fetchImpl,
        url: moduleUrls.get(descriptor.path),
        expectedSha256: descriptor.sha256,
        expectedByteLength: descriptor.byteLength,
        signal,
        label: `Candidate10 module ${descriptor.path}`,
      })),
    }))),
    fetchPinnedBytes({
      fetchImpl,
      url: checkpointUrl,
      expectedSha256: bundle.checkpoint.sha256,
      expectedByteLength: bundle.checkpoint.byteLength,
      signal,
      label: 'Candidate10 V9 model checkpoint',
    }),
    fetchPinnedBytes({
      fetchImpl,
      url: approvalUrl,
      expectedSha256: CANDIDATE10_V4_MANUAL_APPROVAL_SHA256,
      expectedByteLength: 3075,
      signal,
      label: 'Candidate10 manual predictive approval',
    }),
  ]);
  const checkpoint = parseJson(checkpointBytes, 'Candidate10 V9 model checkpoint');
  const approval = normalizeManualApproval(parseJson(approvalBytes, 'Candidate10 manual predictive approval'), bundle);
  if (!isObject(checkpoint)
    || checkpoint.format !== bundle.checkpoint.format
    || checkpoint.model?.version !== bundle.checkpoint.distributionVersion
    || checkpoint.runtime?.lastObservedDate !== bundle.checkpoint.lastObservedDate) {
    fail('candidate10-runtime-checkpoint-invalid', 'The pinned Candidate10 checkpoint does not match its bundle declaration.');
  }
  let entry = buildPinnedEntry;
  if (!entry) {
    const sources = new Map(moduleRecords.map(record => [record.path, record.text]));
    const graph = createVerifiedModuleGraph(sources, bundle.entryModule.path);
    try {
      entry = await import(graph.entryUrl);
    } catch (error) {
      fail('candidate10-runtime-module-import-failed', `The verified Candidate10 module closure could not load: ${error?.message || String(error)}`);
    } finally {
      graph.revoke();
    }
  }
  if (typeof entry?.hydrateCandidate10Distribution !== 'function'
    || typeof entry.predictCandidate10Distribution !== 'function'
    || typeof entry.observeCandidate10Distribution !== 'function') {
    fail('candidate10-runtime-module-export-invalid', 'The Candidate10 entry module does not expose the required V9 runtime functions.');
  }
  let model;
  try {
    model = entry.hydrateCandidate10Distribution({ artifact: checkpoint });
  } catch (error) {
    fail('candidate10-runtime-hydration-failed', `The pinned Candidate10 checkpoint could not hydrate: ${error?.message || String(error)}`);
  }
  const provenance = makeReleaseProvenance(bundle, approval, {
    bundle: selectedBundleUrl,
    checkpoint: checkpointUrl,
    approval: approvalUrl,
    approvalSha256: CANDIDATE10_V4_MANUAL_APPROVAL_SHA256,
  }, selectedBundleSha256);
  const runtime = {
    format: CANDIDATE10_V4_RUNTIME_ADAPTER_FORMAT,
    version: CANDIDATE10_V4_RUNTIME_ADAPTER_VERSION,
    status: bundle.predictiveReleaseStatus,
    requirements: bundle.consumerRequirements,
    provenance,
    predict(request) {
      const { inputFeatures, targetGameRef } = normalizePredictionRequest(request);
      const prediction = entry.predictCandidate10Distribution({ model, inputFeatures, gameRef: targetGameRef });
      return Object.freeze({ ...prediction, releaseProvenance: provenance });
    },
    run({ source, targetGameRef } = {}) {
      const inputFeatures = isObject(source?.inputFeatures) ? source.inputFeatures : source;
      return runtime.predict({ inputFeatures, targetGameRef });
    },
    observe(request) {
      const { rows } = normalizeObservationRequest(request);
      const result = entry.observeCandidate10Distribution({ model, rows });
      return Object.freeze({ ...result, releaseProvenance: provenance });
    },
  };
  return Object.freeze(runtime);
}

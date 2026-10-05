/*
 * Browser network loader for one caller-pinned immutable SwishIQ V4 site
 * release. This module has no V3 registry lookup or fallback path.
 */

import {
  resolveCanonicalV4PublicPackage,
} from './canonical-v4-projection-resolver.js?v=20261002e&rev=canonical-v4-projection-resolver-v4-dependency-cache-closure';
import {
  canonicalV4IdentityJson,
  v4Sha256Hex,
} from './canonical-v4-identity.js?v=20260927s&rev=canonical-v4-identity-v1';

export const CANONICAL_V4_PUBLIC_NETWORK_LOADER_FORMAT = 'djhc-swishiq-v4-public-network-loader-v2';
export const CANONICAL_V4_PUBLIC_NETWORK_LOADER_VERSION = 'swishiq-v4-public-network-loader-v2';

const REGISTRY_FORMAT = 'djhc-swishiq-v4-public-registry-v1';
const REGISTRY_VERSION = 'swishiq-v4-public-registry-v1';
const INDEX_FORMAT = 'djhc-swishiq-v4-public-projection-v1';
const PART_FORMAT = 'djhc-swishiq-v4-public-projection-part-v1';
const MODEL_ID = 'swishiq-canonical-v4';
const HASH_RE = /^[a-f0-9]{64}$/;
const RELEASE_PATH_RE = /^\/tools\/swishiq-studio\/data\/v4\/releases\/(v4-site-[a-f0-9]{12})\/registry\.json$/;
const EXACT_YEAR_MIN = 2017;
const EXACT_YEAR_MAX = 2025;
const POOLED_START_YEARS = Object.freeze(Array.from(
  { length: EXACT_YEAR_MAX - EXACT_YEAR_MIN + 1 },
  (_, index) => EXACT_YEAR_MIN + index,
));
const ALLOWED_PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const VERIFIED_PROOFS = new WeakMap();

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('invalid-request', `${label} is required.`);
  return value.trim();
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) {
    fail('invalid-request', `${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function sameJson(left, right) {
  try {
    return canonicalV4IdentityJson(left) === canonicalV4IdentityJson(right);
  } catch {
    return false;
  }
}

function parseJsonBytes(bytes, label) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    fail('projection-json-invalid', `${label} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isObject(value)) fail('projection-json-invalid', `${label} must contain a JSON object.`);
  return value;
}

function normalizeRequestScope(scope) {
  if (!isObject(scope) || !['exact-season', 'pooled-window'].includes(scope.kind)) {
    fail('scope-invalid', 'An explicit exact-season or pooled-window request is required.');
  }
  if (!Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length) {
    fail('scope-invalid', 'Request scope must list its season start years explicitly.');
  }
  const years = [...scope.seasonStartYears];
  if (years.some((year, index) => !Number.isSafeInteger(year)
    || year < EXACT_YEAR_MIN || year > EXACT_YEAR_MAX
    || (index > 0 && year !== years[index - 1] + 1))) {
    fail('scope-invalid', 'Request seasons must be supported, ascending, and contiguous.');
  }
  if (scope.kind === 'exact-season' && years.length !== 1) {
    fail('scope-invalid', 'Exact-season requests must contain exactly one season.');
  }
  if (scope.kind === 'pooled-window' && !sameJson(years, POOLED_START_YEARS)) {
    fail('scope-invalid', 'The supported pooled package covers the complete 2017–26 window.');
  }
  if (!Array.isArray(scope.phases) || !scope.phases.length
    || new Set(scope.phases).size !== scope.phases.length
    || scope.phases.some(phase => !ALLOWED_PHASES.has(phase))) {
    fail('scope-invalid', 'Request phases must be a distinct, nonempty subset of the V4 phase set.');
  }
  return Object.freeze({
    kind: scope.kind,
    seasonStartYears: Object.freeze(years),
    phases: Object.freeze([...scope.phases]),
  });
}

function packageIdForScope(scope) {
  if (scope.kind === 'pooled-window') return 'nba-swishiq-v4-2017-26';
  const year = scope.seasonStartYears[0];
  return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
}

function resolveRegistryLocation(registryUrl, baseUrl) {
  let url;
  let base;
  try {
    base = new URL(baseUrl || import.meta.url);
    url = new URL(requiredText(registryUrl, 'registryUrl'), base);
  } catch (error) {
    fail('registry-url-invalid', `registryUrl is invalid: ${error.message}`);
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail('registry-url-invalid', 'registryUrl must be an uncredentialed HTTP(S) URL without query or fragment.');
  }
  if (url.origin !== base.origin) {
    fail('registry-origin-invalid', 'The immutable V4 registry must be same-origin with this loader.');
  }
  const match = RELEASE_PATH_RE.exec(url.pathname);
  if (!match) {
    fail('registry-url-not-immutable', 'registryUrl must point to a versioned v4-site release registry.');
  }
  const releaseRootUrl = new URL('./', url);
  return Object.freeze({
    registryUrl: url,
    releaseId: match[1],
    releaseRootUrl,
    releaseRootPath: releaseRootUrl.pathname,
  });
}

function safeReleasePath(value, expectedPrefix, label) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')
    || value.includes('%') || value.startsWith('/')) {
    fail('unsafe-projection-path', `${label} must be a safe relative V4 path.`);
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || !value.startsWith(expectedPrefix)) {
    fail('unsafe-projection-path', `${label} must stay inside its versioned V4 package path.`);
  }
  return value;
}

function releaseFileUrl(location, relativePath, expectedPrefix, label) {
  const safePath = safeReleasePath(relativePath, expectedPrefix, label);
  const url = new URL(safePath, location.releaseRootUrl);
  if (url.origin !== location.registryUrl.origin || !url.pathname.startsWith(location.releaseRootPath)
    || url.search || url.hash) {
    fail('unsafe-projection-path', `${label} resolves outside the immutable V4 release.`);
  }
  return url;
}

function requestSignal(parentSignal, timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    fail('invalid-request', 'requestTimeoutMs must be a positive integer.');
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('V4 package request timed out.'));
  }, timeoutMs);
  const relayAbort = () => controller.abort(parentSignal.reason || new Error('V4 package request was aborted.'));
  if (parentSignal?.aborted) relayAbort();
  else parentSignal?.addEventListener('abort', relayAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', relayAbort);
    },
  };
}

async function fetchBytes(url, {
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal,
  requestTimeoutMs = 30000,
  label,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('fetch-unavailable', 'A browser fetch implementation is required.');
  const request = requestSignal(signal, requestTimeoutMs);
  try {
    const response = await fetchImpl(url.href, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: request.signal,
    });
    if (!response?.ok) {
      fail('projection-fetch-failed', `${label} returned HTTP ${response?.status || 'error'}.`, {
        status: response?.status || null,
        url: url.href,
      });
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error?.code) throw error;
    if (request.timedOut()) fail('projection-fetch-timeout', `${label} request timed out.`, { url: url.href });
    if (signal?.aborted) fail('projection-fetch-aborted', `${label} request was aborted.`, { url: url.href });
    fail('projection-fetch-failed', `${label} could not be fetched: ${error?.message || String(error)}`, { url: url.href });
  } finally {
    request.cleanup();
  }
}

function findExpectedPackagePin(expectedIdentity, packageId) {
  if (!isObject(expectedIdentity) || !Array.isArray(expectedIdentity.packages)) {
    fail('identity-pin-missing', 'Caller-pinned V4 expectedIdentity package pins are required.');
  }
  const matches = expectedIdentity.packages.filter(row => row?.packageId === packageId);
  if (matches.length !== 1) fail('identity-pin-invalid', `Expected exactly one caller pin for ${packageId}.`);
  return matches[0];
}

function validateArtifactDescriptors(index, packageId, packageVersion) {
  if (!Array.isArray(index.artifacts) || !index.artifacts.length) {
    fail('index-artifacts-missing', `${packageId} index has no public artifacts.`);
  }
  const ids = new Set();
  const descriptors = new Map();
  const prefix = `packages/${packageId}/${packageVersion}/parts/`;
  for (const artifact of index.artifacts) {
    if (!isObject(artifact) || typeof artifact.artifactId !== 'string' || !artifact.artifactId.trim()
      || ids.has(artifact.artifactId) || !Number.isSafeInteger(artifact.rows) || artifact.rows < 0
      || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0 || !HASH_RE.test(String(artifact.sha256 || ''))) {
      fail('index-artifact-invalid', `${packageId} contains a malformed or duplicate artifact descriptor.`);
    }
    const path = safeReleasePath(artifact.path, prefix, `${packageId}/${artifact.artifactId} part path`);
    if (!path.endsWith('.json')) fail('index-artifact-invalid', `${packageId}/${artifact.artifactId} is not a JSON part.`);
    ids.add(artifact.artifactId);
    descriptors.set(artifact.artifactId, Object.freeze({ ...artifact, path }));
  }
  return descriptors;
}

function validateV4IndexAgainstRegistry(index, entry, packageId, packageVersion) {
  const requiredPins = [
    'packageId', 'packageVersion', 'buildRecipeDigest', 'packageManifestSha256',
    'sourceLockDigestKind', 'sourceLockSha256', 'sourceLockEmbeddedSha256', 'sourceLockFileSha256',
    'sourceLockFileByteLength', 'sourceLockSchemaSha256', 'modelId', 'normalizerVersion', 'metricsVersion',
    'contractVersion', 'interfaceVersion', 'scopeResolutionPolicy', 'capabilitySummary', 'capabilityMapSha256', 'scope',
  ];
  if (index.format !== INDEX_FORMAT || index.packageId !== packageId || index.packageVersion !== packageVersion
    || index.modelId !== MODEL_ID) {
    fail('index-identity-invalid', `${packageId} index is not a canonical V4 package index.`);
  }
  for (const key of requiredPins) {
    if (!(key in entry) || !(key in index) || !sameJson(index[key], entry[key])) {
      fail('index-pin-mismatch', `${packageId} index pin ${key} differs from its caller-pinned registry entry.`);
    }
  }
  if (typeof index.contentSha256 !== 'string' || !HASH_RE.test(index.contentSha256)
    || entry.projectionContentSha256 !== index.contentSha256) {
    fail('index-content-pin-invalid', `${packageId} index content hash differs from its registry pin.`);
  }
  if (entry.approvalReceiptSha256 && index.approvalReceiptSha256
    && entry.approvalReceiptSha256 !== index.approvalReceiptSha256) {
    fail('index-approval-pin-mismatch', `${packageId} index approval pin differs from its registry entry.`);
  }
  return validateArtifactDescriptors(index, packageId, packageVersion);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

/**
 * Fetch and verify one exact-season or explicitly accepted pooled V4 package.
 * The caller must pin the immutable registry byte hash and the full V4
 * expectedIdentity record. No V3 registry or package is consulted.
 */
export async function loadCanonicalV4PublicPackageProof({
  registryUrl,
  expectedRegistrySha256,
  expectedIdentity,
  scope,
  packageId = null,
  requiredCapabilities,
  acceptPooled = false,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal,
  requestTimeoutMs = 30000,
  baseUrl,
} = {}) {
  const normalizedScope = normalizeRequestScope(scope);
  const selectedPackageId = packageIdForScope(normalizedScope);
  if (packageId !== null && packageId !== selectedPackageId) {
    fail('package-scope-mismatch', 'Requested V4 package ID does not match its explicit season scope.');
  }
  if (normalizedScope.kind === 'pooled-window' && acceptPooled !== true) {
    fail('pooled-acceptance-required', 'Pooled V4 package loading requires acceptPooled: true.');
  }
  const expectedRegistryHash = requiredHash(expectedRegistrySha256, 'expectedRegistrySha256');
  const location = resolveRegistryLocation(registryUrl, baseUrl);
  const expectedPackage = findExpectedPackagePin(expectedIdentity, selectedPackageId);
  const registryBytes = await fetchBytes(location.registryUrl, {
    fetchImpl, signal, requestTimeoutMs, label: 'V4 public registry',
  });
  const actualRegistryHash = await v4Sha256Hex(registryBytes);
  if (actualRegistryHash !== expectedRegistryHash) {
    fail('registry-byte-hash-mismatch', 'V4 registry bytes do not match the caller-supplied SHA-256 pin.');
  }
  const registry = parseJsonBytes(registryBytes, 'V4 public registry');
  if (registry.format !== REGISTRY_FORMAT || registry.registryVersion !== REGISTRY_VERSION
    || !Array.isArray(registry.packages)) {
    fail('registry-format-invalid', 'The caller-pinned registry is not a canonical V4 public registry.');
  }
  const registryRows = registry.packages.filter(row => row?.packageId === selectedPackageId);
  if (registryRows.length !== 1) fail('package-unavailable', `The V4 registry does not contain exactly one ${selectedPackageId} entry.`);
  const entry = registryRows[0];
  if (entry.packageVersion !== expectedPackage.packageVersion
    || entry.projectionIndexPath !== `packages/${selectedPackageId}/${expectedPackage.packageVersion}/index.json`
    || !HASH_RE.test(String(entry.indexSha256 || ''))) {
    fail('package-identity-mismatch', `${selectedPackageId} registry entry differs from its caller-pinned package identity.`);
  }
  const indexUrl = releaseFileUrl(
    location,
    entry.projectionIndexPath,
    `packages/${selectedPackageId}/${expectedPackage.packageVersion}/`,
    `${selectedPackageId} index path`,
  );
  const indexBytes = await fetchBytes(indexUrl, {
    fetchImpl, signal, requestTimeoutMs, label: `${selectedPackageId} public index`,
  });
  const resolution = await resolveCanonicalV4PublicPackage({
    registryBytes,
    expectedRegistrySha256: expectedRegistryHash,
    indexBytesByPath: new Map([[entry.projectionIndexPath, indexBytes]]),
    expectedIdentity,
    scope: normalizedScope,
    packageId: selectedPackageId,
    requiredCapabilities,
    acceptPooled,
  });
  const index = parseJsonBytes(indexBytes, `${selectedPackageId} public index`);
  const artifacts = validateV4IndexAgainstRegistry(index, entry, selectedPackageId, expectedPackage.packageVersion);
  const verifiedIndex = deepFreeze(index);
  const verifiedEntry = deepFreeze({ ...entry });
  const publicProof = Object.freeze({
    format: CANONICAL_V4_PUBLIC_NETWORK_LOADER_FORMAT,
    loaderVersion: CANONICAL_V4_PUBLIC_NETWORK_LOADER_VERSION,
    status: 'verified',
    releaseId: location.releaseId,
    registryUrl: location.registryUrl.href,
    registrySha256: actualRegistryHash,
    registryRevisionSha256: resolution.integrity.registryRevisionSha256,
    indexUrl: indexUrl.href,
    indexSha256: resolution.integrity.indexSha256,
    package: Object.freeze({
      ...resolution.package,
      sourceLockDigestKind: index.sourceLockDigestKind,
      sourceLockSha256: index.sourceLockSha256,
      sourceLockEmbeddedSha256: index.sourceLockEmbeddedSha256,
      sourceLockFileSha256: index.sourceLockFileSha256,
      sourceLockFileByteLength: index.sourceLockFileByteLength,
      sourceLockSchemaSha256: index.sourceLockSchemaSha256,
      capabilityMapSha256: index.capabilityMapSha256,
      modelId: index.modelId,
      normalizerVersion: index.normalizerVersion,
      metricsVersion: index.metricsVersion,
      contractVersion: index.contractVersion,
      interfaceVersion: index.interfaceVersion,
      scope: verifiedIndex.scope,
      capabilitySummary: index.capabilitySummary,
    }),
    scope: resolution.scope,
    capabilities: resolution.capabilities,
    integrity: resolution.integrity,
    approvalClaimsMade: false,
    index: verifiedIndex,
    artifacts: Object.freeze([...artifacts.values()]),
  });
  VERIFIED_PROOFS.set(publicProof, {
    location,
    entry: verifiedEntry,
    index: verifiedIndex,
    artifacts,
    package: publicProof.package,
    fetchImpl,
  });
  return publicProof;
}

/** Load one part from a proof returned by loadCanonicalV4PublicPackageProof. */
export async function loadCanonicalV4PublicPart(proof, {
  artifactId,
  fetchImpl,
  signal,
  requestTimeoutMs = 30000,
} = {}) {
  const state = proof && VERIFIED_PROOFS.get(proof);
  if (!state) fail('package-proof-unverified', 'A loader-created V4 package proof is required before loading parts.');
  const id = requiredText(artifactId, 'artifactId');
  const descriptor = state.artifacts.get(id);
  if (!descriptor) fail('artifact-unavailable', `${state.package.packageId} has no ${id} artifact.`);
  const partUrl = releaseFileUrl(
    state.location,
    descriptor.path,
    `packages/${state.package.packageId}/${state.package.packageVersion}/parts/`,
    `${state.package.packageId}/${id} part path`,
  );
  const bytes = await fetchBytes(partUrl, {
    fetchImpl: fetchImpl || state.fetchImpl,
    signal,
    requestTimeoutMs,
    label: `${state.package.packageId}/${id} public part`,
  });
  if (bytes.byteLength !== descriptor.bytes) {
    fail('part-byte-length-mismatch', `${state.package.packageId}/${id} part byte length differs from its descriptor.`);
  }
  const sha256 = await v4Sha256Hex(bytes);
  if (sha256 !== descriptor.sha256) {
    fail('part-byte-hash-mismatch', `${state.package.packageId}/${id} part bytes do not match the index hash.`);
  }
  const part = parseJsonBytes(bytes, `${state.package.packageId}/${id} public part`);
  const index = state.index;
  const requiredPins = [
    ['packageId', state.package.packageId],
    ['packageVersion', state.package.packageVersion],
    ['packageManifestSha256', state.package.packageManifestSha256],
    ['sourceLockSha256', index.sourceLockSha256],
    ['modelId', index.modelId],
    ['normalizerVersion', index.normalizerVersion],
    ['metricsVersion', index.metricsVersion],
    ['contractVersion', index.contractVersion],
    ['interfaceVersion', index.interfaceVersion],
  ];
  if (part.format !== PART_FORMAT || !Array.isArray(part.records) || part.records.length !== descriptor.rows) {
    fail('part-envelope-invalid', `${state.package.packageId}/${id} part format or record count is invalid.`);
  }
  for (const [key, expected] of requiredPins) {
    if (!(key in part) || !sameJson(part[key], expected)) {
      fail('part-pin-mismatch', `${state.package.packageId}/${id} part pin ${key} differs from its verified index.`);
    }
  }
  if (!sameJson(part.scope, state.package.scope)) {
    fail('part-scope-mismatch', `${state.package.packageId}/${id} part scope differs from its verified package scope.`);
  }
  if (descriptor.kind && part.kind && descriptor.kind !== part.kind) {
    fail('part-kind-mismatch', `${state.package.packageId}/${id} part kind differs from its descriptor.`);
  }
  if (part.artifactId && part.artifactId !== id) {
    fail('part-artifact-id-mismatch', `${state.package.packageId}/${id} part identifies a different artifact.`);
  }
  const verifiedPart = deepFreeze(part);
  return Object.freeze({
    format: 'djhc-swishiq-v4-verified-public-part-v1',
    status: 'verified',
    artifactId: id,
    kind: descriptor.kind || part.kind || null,
    path: descriptor.path,
    bytes: bytes.byteLength,
    sha256,
    rows: descriptor.rows,
    package: state.package,
    scope: state.package.scope,
    part: verifiedPart,
    records: verifiedPart.records,
    source: Object.freeze({
      releaseId: state.location.releaseId,
      registryUrl: state.location.registryUrl.href,
      registrySha256: proof.registrySha256,
      indexUrl: proof.indexUrl,
      indexSha256: proof.indexSha256,
      partUrl: partUrl.href,
    }),
  });
}

/** Load several requested artifacts; any missing or invalid part rejects the entire call. */
export async function loadCanonicalV4PublicParts(proof, {
  artifactIds,
  fetchImpl,
  signal,
  requestTimeoutMs = 30000,
} = {}) {
  if (!Array.isArray(artifactIds) || !artifactIds.length
    || new Set(artifactIds).size !== artifactIds.length) {
    fail('invalid-request', 'artifactIds must be a nonempty list of distinct artifact IDs.');
  }
  const parts = await Promise.all(artifactIds.map(artifactId => loadCanonicalV4PublicPart(proof, {
    artifactId, fetchImpl, signal, requestTimeoutMs,
  })));
  return Object.freeze(Object.fromEntries(parts.map(part => [part.artifactId, part])));
}

/** Resolve a single supported exact season. Exact requests never widen to pooled data. */
export async function loadCanonicalV4ExactSeasonPackageProof({
  seasonStartYear,
  phases = ['regular'],
  ...options
} = {}) {
  if (!Number.isSafeInteger(seasonStartYear)) fail('scope-invalid', 'seasonStartYear must be an integer.');
  return loadCanonicalV4PublicPackageProof({
    ...options,
    scope: { kind: 'exact-season', seasonStartYears: [seasonStartYear], phases },
    packageId: packageIdForScope({ kind: 'exact-season', seasonStartYears: [seasonStartYear] }),
    acceptPooled: false,
  });
}

/** Resolve only the full pooled window and require explicit pooled acceptance. */
export async function loadCanonicalV4PooledPackageProof({
  phases = ['regular'],
  acceptPooled,
  ...options
} = {}) {
  if (acceptPooled !== true) fail('pooled-acceptance-required', 'Pooled V4 package loading requires acceptPooled: true.');
  return loadCanonicalV4PublicPackageProof({
    ...options,
    scope: { kind: 'pooled-window', seasonStartYears: POOLED_START_YEARS, phases },
    packageId: 'nba-swishiq-v4-2017-26',
    acceptPooled: true,
  });
}

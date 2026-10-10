/*
 * Additive, browser-compatible resolver for an approved SwishIQ V4 public
 * projection. This is metadata-only: it selects one exact/pooled package,
 * verifies bytes and pins, and returns reported evidence/model/approval states
 * without issuing or inferring any approval.
 */

import {
  canonicalV4IdentityJson,
  v4BuildRecipeDigest,
  v4BundleVersionForDigest,
  v4CanonicalContentDigest,
  v4IdentityDigestIsValid,
  v4PackageVersionForDigest,
  v4Sha256Hex,
} from './canonical-v4-identity.js?v=20260927s&rev=canonical-v4-identity-v1';
import { canonicalV4ProjectionCapabilityMapIssues } from './canonical-v4-projection-capability-map.js?v=20261001d&rev=capability-map-v1';

export const CANONICAL_V4_PROJECTION_RESOLVER_FORMAT = 'djhc-swishiq-v4-public-projection-resolution-v2';
export const CANONICAL_V4_PROJECTION_RESOLVER_VERSION = 'swishiq-v4-public-projection-resolver-v2';

const REGISTRY_FORMAT = 'djhc-swishiq-v4-public-registry-v1';
const REGISTRY_VERSION = 'swishiq-v4-public-registry-v1';
const INDEX_FORMAT = 'djhc-swishiq-v4-public-projection-v1';
const FULL_PHASES = ['regular', 'in_season_tournament', 'play_in', 'playoffs'];
const HASH_RE = /^[a-f0-9]{64}$/;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail('invalid-request', `${label} is required.`);
  return value.trim();
}

function hash(value, label) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) fail('invalid-identity-pin', `${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function bytesOf(value, label) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('invalid-projection-input', `${label} must be UTF-8 text or bytes.`);
}

function parseJsonBytes(value, label) {
  const bytes = bytesOf(value, label);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    fail('projection-json-invalid', `${label} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isObject(parsed)) fail('projection-json-invalid', `${label} must contain a JSON object.`);
  return { bytes, parsed };
}

function expectedPackageIds() {
  const exact = [];
  for (let year = 2017; year <= 2025; year += 1) {
    exact.push(`nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`);
  }
  exact.push('nba-swishiq-v4-2017-26');
  return exact;
}

function validateYears(value, label, minimum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > 100) {
    fail('scope-invalid', `${label} must contain ${minimum === 1 ? 'one or more' : 'multiple'} season start years.`);
  }
  const years = value.map((year) => {
    if (!Number.isSafeInteger(year) || year < 1947 || year > 2200) fail('scope-invalid', `${label} contains an invalid season start year.`);
    return year;
  });
  if (new Set(years).size !== years.length || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    fail('scope-invalid', `${label} must be distinct, ascending, and contiguous.`);
  }
  return years;
}

function normalizePackageScope(value, label) {
  if (!isObject(value) || !['exact-season', 'pooled-window'].includes(value.kind)) {
    fail('scope-invalid', `${label} has an unsupported scope kind.`);
  }
  const years = validateYears(value.seasonStartYears, `${label}.seasonStartYears`, value.kind === 'exact-season' ? 1 : 2);
  if ((value.kind === 'exact-season' && years.length !== 1)
    || value.seasonStartYear !== years[0]
    || value.seasonEndYear !== years.at(-1) + 1
    || value.pooledFitIsSeasonSpecific !== (value.kind === 'exact-season')
    || canonicalV4IdentityJson(value.phases) !== canonicalV4IdentityJson(FULL_PHASES)) {
    fail('scope-invalid', `${label} is not a canonical V4 season scope.`);
  }
  return {
    kind: value.kind,
    seasonStartYears: years,
    seasonStartYear: years[0],
    seasonEndYear: years.at(-1) + 1,
    phases: [...FULL_PHASES],
    pooledFitIsSeasonSpecific: value.kind === 'exact-season',
  };
}

function scopeResolutionPolicy(scope) {
  return scope.kind === 'exact-season'
    ? 'exact-season-only-no-pooled-substitution'
    : 'pooled-window-requires-explicit-acceptance';
}

function normalizeRequestScope(value) {
  if (!isObject(value) || !['exact-season', 'pooled-window'].includes(value.kind)) {
    fail('scope-invalid', 'An explicit exact-season or pooled-window request is required.');
  }
  const years = validateYears(value.seasonStartYears, 'request.scope.seasonStartYears', value.kind === 'exact-season' ? 1 : 2);
  if (value.kind === 'exact-season' && years.length !== 1) fail('scope-invalid', 'Exact-season requests must contain one season.');
  const phases = Array.isArray(value.phases) ? value.phases : [];
  if (!phases.length || new Set(phases).size !== phases.length || phases.some((phase) => !FULL_PHASES.includes(phase))) {
    fail('scope-invalid', 'Request phases must be a distinct, nonempty subset of the canonical V4 phase set.');
  }
  return {
    kind: value.kind,
    seasonStartYears: years,
    seasonStartYear: years[0],
    seasonEndYear: years.at(-1) + 1,
    phases: FULL_PHASES.filter((phase) => phases.includes(phase)),
    pooledFitIsSeasonSpecific: value.kind === 'exact-season',
  };
}

function safeProjectionPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.includes('%') || value.startsWith('/')) {
    fail('unsafe-index-path', 'Projection index path must be a safe relative POSIX path.');
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..') || /^[a-z]:/i.test(value)) {
    fail('unsafe-index-path', 'Projection index path contains traversal or drive syntax.');
  }
  return value;
}

function mapValues(value, label) {
  if (value instanceof Map) return value;
  if (isObject(value)) return new Map(Object.entries(value));
  fail('invalid-projection-input', `${label} must be a Map or object keyed by package/path.`);
}

function normalizeExpectedIdentity(value) {
  if (!isObject(value) || !isObject(value.bundle) || !Array.isArray(value.packages)) {
    fail('identity-pin-missing', 'Expected bundle and ten package identity pins are required.');
  }
  const bundle = {
    bundleId: text(value.bundle.bundleId, 'expectedIdentity.bundle.bundleId'),
    bundleVersion: text(value.bundle.bundleVersion, 'expectedIdentity.bundle.bundleVersion'),
    buildRecipeDigest: hash(value.bundle.buildRecipeDigest, 'expectedIdentity.bundle.buildRecipeDigest'),
    manifestSha256: hash(value.bundle.manifestSha256, 'expectedIdentity.bundle.manifestSha256'),
    buildRecipe: value.bundle.buildRecipe,
  };
  if (!isObject(bundle.buildRecipe)) fail('identity-pin-invalid', 'Expected bundle build recipe is required to verify its full digest.');
  const expectedIds = expectedPackageIds();
  if (value.packages.length !== expectedIds.length) fail('identity-pin-invalid', 'Expected exactly ten V4 package identity pins.');
  const packages = value.packages.map((row, index) => {
    if (!isObject(row)) fail('identity-pin-invalid', `Expected package identity ${index} is malformed.`);
    const packageId = text(row.packageId, `expectedIdentity.packages[${index}].packageId`);
    if (!expectedIds.includes(packageId)) fail('identity-pin-invalid', `Unexpected package identity ID ${packageId}.`);
    const normalized = {
      packageId,
      packageVersion: text(row.packageVersion, `${packageId}.packageVersion`),
      buildRecipeDigest: hash(row.buildRecipeDigest, `${packageId}.buildRecipeDigest`),
      manifestSha256: hash(row.manifestSha256, `${packageId}.manifestSha256`),
      sourceLockDigestKind: text(row.sourceLockDigestKind, `${packageId}.sourceLockDigestKind`),
      sourceLockSha256: hash(row.sourceLockSha256, `${packageId}.sourceLockSha256`),
      sourceLockEmbeddedSha256: hash(row.sourceLockEmbeddedSha256, `${packageId}.sourceLockEmbeddedSha256`),
      sourceLockFileSha256: hash(row.sourceLockFileSha256, `${packageId}.sourceLockFileSha256`),
      sourceLockFileByteLength: row.sourceLockFileByteLength,
      sourceLockSchemaSha256: hash(row.sourceLockSchemaSha256, `${packageId}.sourceLockSchemaSha256`),
      scope: normalizePackageScope(row.scope, `${packageId}.scope`),
      scopeResolutionPolicy: text(row.scopeResolutionPolicy, `${packageId}.scopeResolutionPolicy`),
      capabilitySummary: row.capabilitySummary,
      buildRecipe: row.buildRecipe,
    };
    if (!isObject(row.buildRecipe)) fail('identity-pin-invalid', `${packageId} build recipe is required to verify its full digest.`);
    if (normalized.sourceLockDigestKind !== 'full-lock-object'
      || !Number.isSafeInteger(normalized.sourceLockFileByteLength) || normalized.sourceLockFileByteLength < 1
      || normalized.scopeResolutionPolicy !== scopeResolutionPolicy(normalized.scope)
      || !isObject(row.capabilitySummary) || !Object.keys(row.capabilitySummary).length) {
      fail('identity-pin-invalid', `${packageId} requires explicit scope intent and capability-state pins.`);
    }
    for (const capabilityId of Object.keys(row.capabilitySummary)) reportedStates(row.capabilitySummary, capabilityId);
    return normalized;
  });
  const ids = packages.map((row) => row.packageId);
  if (new Set(ids).size !== expectedIds.length || expectedIds.some((id) => !ids.includes(id))) {
    fail('identity-pin-invalid', 'Expected package pins must contain each of the nine exact seasons and pooled window once.');
  }
  return { bundle, packages, expectedIds };
}

function reportedStates(summary, capabilityId) {
  const row = summary?.[capabilityId];
  if (!isObject(row)) fail('capability-metadata-missing', `Capability ${capabilityId} has no separately reported state metadata.`);
  const fields = [
    ['evidence', 'evidenceStatus'],
    ['modelValidation', 'modelValidationStatus'],
    ['productionApproval', 'productionApprovalStatus'],
    ['upstreamApproval', 'upstreamApprovalStatus'],
  ];
  const states = {};
  for (const [stateName, fieldName] of fields) {
    if (typeof row[fieldName] !== 'string' || !row[fieldName].trim()) {
      fail('capability-metadata-invalid', `Capability ${capabilityId} is missing ${fieldName}.`);
    }
    states[stateName] = { status: row[fieldName] };
  }
  return states;
}

function sameJson(left, right) {
  return canonicalV4IdentityJson(left) === canonicalV4IdentityJson(right);
}

function canonicalBundleRecipePackageId(packageId) {
  const publicIds = expectedPackageIds();
  if (publicIds.includes(packageId)) return packageId;
  if (packageId === 'swishiq-v4-2017-26-pooled') return 'nba-swishiq-v4-2017-26';
  const privateExact = /^swishiq-v4-(20\d{2}-\d{2})$/.exec(String(packageId || ''));
  return privateExact ? `nba-swishiq-v4-${privateExact[1]}` : null;
}

function compareBundleRecipePackagePins(bundlePackages, expectedPackages) {
  if (!Array.isArray(bundlePackages) || bundlePackages.length !== expectedPackages.length) return false;
  const sourceLockFields = [
    'sourceLockSchemaSha256', 'sourceLockSha256', 'sourceLockFileSha256',
    'sourceLockFileByteLength', 'sourceLockEmbeddedSha256',
  ];
  const allSourceLocksPresent = bundlePackages.every((row) => (
    sourceLockFields.every((field) => Object.prototype.hasOwnProperty.call(row || {}, field))
  ));
  const allSourceLocksAbsent = bundlePackages.every((row) => (
    sourceLockFields.every((field) => !Object.prototype.hasOwnProperty.call(row || {}, field))
  ));
  if (!allSourceLocksPresent && !allSourceLocksAbsent) return false;
  const comparableFields = [
    'packageVersion', 'buildRecipeDigest', 'manifestSha256', 'scope',
    ...(allSourceLocksPresent ? sourceLockFields : []),
  ];
  const actual = bundlePackages.map((row) => Object.fromEntries(
    [
      ['packageId', canonicalBundleRecipePackageId(row?.packageId)],
      ...comparableFields.map((field) => [field, row?.[field]]),
    ],
  ));
  const expected = expectedPackages.map((row) => ({
    packageId: row.packageId,
    ...Object.fromEntries(comparableFields.map((field) => [field, row[field]])),
  }));
  if (actual.some((row) => typeof row.packageId !== 'string')) return false;
  const sortByPackageId = (rows) => rows.sort((left, right) => (
    left.packageId < right.packageId ? -1 : left.packageId > right.packageId ? 1 : 0
  ));
  if (new Set(actual.map((row) => row.packageId)).size !== actual.length
    || new Set(expected.map((row) => row.packageId)).size !== expected.length) return false;
  return sameJson(sortByPackageId(actual), sortByPackageId(expected));
}

/**
 * Resolve one V4 public projection. Inputs are bytes from the caller's network
 * layer; this module does not fetch, write, register, publish, or deploy.
 * `expectedIdentity` is a separately pinned native/release identity record.
 * The current site-projection contract does not yet emit all full 64-hex
 * digests/status fields required here; see the integration handoff findings.
 */
export async function resolveCanonicalV4PublicPackage({
  registryBytes,
  expectedRegistrySha256 = null,
  indexBytesByPath,
  expectedIdentity,
  scope,
  packageId = null,
  requiredCapabilities,
  acceptPooled = false,
} = {}) {
  const identity = normalizeExpectedIdentity(expectedIdentity);
  if (await v4BuildRecipeDigest(identity.bundle.buildRecipe) !== identity.bundle.buildRecipeDigest
    || identity.bundle.buildRecipe.format !== 'swishiq-v4-bundle-build-recipe-v1'
    || identity.bundle.buildRecipe.bundleId !== identity.bundle.bundleId) {
    fail('bundle-identity-mismatch', 'Expected bundle recipe does not match its full digest or bundle ID.');
  }
  if (!compareBundleRecipePackagePins(identity.bundle.buildRecipe.packages, identity.packages)) {
    fail('bundle-identity-mismatch', 'Expected bundle recipe package pins do not match the ten package identities and source-lock pins.');
  }
  for (const row of identity.packages) {
    if (await v4BuildRecipeDigest(row.buildRecipe) !== row.buildRecipeDigest
      || row.buildRecipe.format !== 'swishiq-v4-package-build-recipe-v1'
      || canonicalBundleRecipePackageId(row.buildRecipe.package?.packageId) !== row.packageId
      || !sameJson(row.buildRecipe.package?.scope, row.scope)) {
      fail('package-identity-mismatch', `${row.packageId} expected recipe does not match its full digest, ID, or scope.`);
    }
  }
  const requestedScope = normalizeRequestScope(scope);
  if (requestedScope.kind === 'pooled-window' && acceptPooled !== true) {
    fail('pooled-acceptance-required', 'Pooled package resolution requires acceptPooled: true; exact requests never widen to pooled data.');
  }
  if (!Array.isArray(requiredCapabilities) || !requiredCapabilities.length) {
    fail('capability-request-invalid', 'At least one required capability must be listed explicitly.');
  }
  const required = [...new Set(requiredCapabilities.map((value, index) => text(value, `requiredCapabilities[${index}]`)))].sort();
  if (required.length !== requiredCapabilities.length) fail('capability-request-invalid', 'Required capability IDs must be distinct.');
  const requestedPackageId = packageId === null ? null : text(packageId, 'packageId');
  const indexInputs = mapValues(indexBytesByPath, 'indexBytesByPath');

  const registryRead = parseJsonBytes(registryBytes, 'V4 public registry');
  const registrySha256 = await v4Sha256Hex(registryRead.bytes);
  if (expectedRegistrySha256 !== null && registrySha256 !== hash(expectedRegistrySha256, 'expectedRegistrySha256')) {
    fail('registry-byte-hash-mismatch', 'Public registry bytes do not match the caller registry hash pin.');
  }
  const registry = registryRead.parsed;
  if (registry.format !== REGISTRY_FORMAT || registry.registryVersion !== REGISTRY_VERSION) {
    fail('registry-format-invalid', 'Public registry format/version is not canonical V4.');
  }
  const registryRevisionSha256 = hash(registry.registryRevisionSha256, 'registry.registryRevisionSha256');
  if (await v4CanonicalContentDigest(registry, 'registryRevisionSha256') !== registryRevisionSha256) {
    fail('registry-revision-mismatch', 'Public registry revision hash does not match its canonical contents.');
  }
  if (!isObject(registry.bundleIdentity)) fail('bundle-identity-missing', 'Public V4 registry must carry the separately pinned full bundle identity.');
  const expectedBundleVersion = v4BundleVersionForDigest(identity.bundle.buildRecipeDigest);
  if (identity.bundle.bundleVersion !== expectedBundleVersion
    || registry.bundleIdentity.bundleId !== identity.bundle.bundleId
    || registry.bundleIdentity.bundleVersion !== identity.bundle.bundleVersion
    || registry.bundleIdentity.buildRecipeDigest !== identity.bundle.buildRecipeDigest
    || registry.bundleIdentity.manifestSha256 !== identity.bundle.manifestSha256) {
    fail('bundle-identity-mismatch', 'Public registry bundle identity does not match the caller full-digest/version/manifest pins.');
  }

  if (!Array.isArray(registry.packages) || registry.packages.length !== identity.expectedIds.length) {
    fail('package-set-invalid', 'Public registry must contain exactly the nine exact seasons and one pooled package.');
  }
  const registryById = new Map();
  for (const row of registry.packages) {
    if (!isObject(row) || !identity.expectedIds.includes(row.packageId) || registryById.has(row.packageId)) {
      fail('package-set-invalid', 'Public registry contains an unexpected or duplicate V4 package ID.');
    }
    registryById.set(row.packageId, row);
  }
  if (identity.expectedIds.some((id) => !registryById.has(id))) fail('package-set-invalid', 'Public registry is missing one or more exact/pooled package IDs.');

  const expectedById = new Map(identity.packages.map((row) => [row.packageId, row]));
  for (const id of identity.expectedIds) {
    const row = registryById.get(id);
    const expected = expectedById.get(id);
    if (!HASH_RE.test(String(row.capabilityMapSha256 || ''))) {
      fail('capability-map-pin-invalid', id + ' registry entry is missing its capability-map hash.');
    }
    const versionFromDigest = v4PackageVersionForDigest(expected.buildRecipeDigest);
    if (expected.packageVersion !== versionFromDigest
      || row.packageVersion !== expected.packageVersion
      || row.buildRecipeDigest !== expected.buildRecipeDigest
      || row.packageManifestSha256 !== expected.manifestSha256
      || row.sourceLockDigestKind !== expected.sourceLockDigestKind
      || row.sourceLockSha256 !== expected.sourceLockSha256
      || row.sourceLockEmbeddedSha256 !== expected.sourceLockEmbeddedSha256
      || row.sourceLockFileSha256 !== expected.sourceLockFileSha256
      || row.sourceLockFileByteLength !== expected.sourceLockFileByteLength
      || row.sourceLockSchemaSha256 !== expected.sourceLockSchemaSha256
      || row.scopeResolutionPolicy !== expected.scopeResolutionPolicy
      || !sameJson(row.capabilitySummary, expected.capabilitySummary)
      || !sameJson(normalizePackageScope(row.scope, `${id}.registryScope`), expected.scope)) {
      fail('package-identity-mismatch', `${id} registry entry does not match its full package identity pins.`);
    }
    safeProjectionPath(row.projectionIndexPath);
  }

  const candidates = identity.expectedIds.map((id) => registryById.get(id)).filter((row) => {
    const rowScope = normalizePackageScope(row.scope, `${row.packageId}.scope`);
    return rowScope.kind === requestedScope.kind
      && sameJson(rowScope.seasonStartYears, requestedScope.seasonStartYears)
      && requestedScope.phases.every((phase) => rowScope.phases.includes(phase))
      && (requestedPackageId === null || row.packageId === requestedPackageId);
  });
  if (candidates.length !== 1) fail(candidates.length ? 'package-ambiguous' : 'package-unavailable', 'No unique package matches the explicit requested scope; no exact/pooled fallback was used.');
  const selected = candidates[0];
  const expectedSelected = expectedById.get(selected.packageId);
  if (selected.scope.kind === 'pooled-window' && acceptPooled !== true) {
    fail('pooled-acceptance-required', 'Pooled package resolution requires explicit acceptance.');
  }

  const indexPath = safeProjectionPath(selected.projectionIndexPath);
  const indexInput = indexInputs.get(indexPath);
  if (indexInput === undefined) fail('index-missing', `${selected.packageId} public index bytes were not supplied.`);
  const indexRead = parseJsonBytes(indexInput, `${selected.packageId} public index`);
  const indexSha256 = await v4Sha256Hex(indexRead.bytes);
  if (indexSha256 !== hash(selected.indexSha256, `${selected.packageId}.indexSha256`)) {
    fail('index-byte-hash-mismatch', `${selected.packageId} public index bytes do not match the registry pin.`);
  }
  const index = indexRead.parsed;
  if (!HASH_RE.test(String(selected.capabilityMapSha256 || ''))
    || !HASH_RE.test(String(index.capabilityMapSha256 || ''))) {
    fail('capability-map-pin-invalid', selected.packageId + ' is missing a registry or index capability-map SHA-256 pin.');
  }
  if (!isObject(index.capabilityMap)) {
    fail('capability-map-invalid', selected.packageId + ' public index has no projection capability map.');
  }
  const capabilityMapSha256 = await v4Sha256Hex(canonicalV4IdentityJson(index.capabilityMap));
  if (capabilityMapSha256 !== index.capabilityMapSha256
    || capabilityMapSha256 !== selected.capabilityMapSha256) {
    fail('capability-map-hash-mismatch', selected.packageId + ' capability-map hash differs between index contents and registry pin.');
  }
  const projectionContentSha256 = hash(index.contentSha256, `${selected.packageId}.index.contentSha256`);
  if (index.format !== INDEX_FORMAT
    || await v4CanonicalContentDigest(index, 'contentSha256') !== projectionContentSha256
    || selected.projectionContentSha256 !== projectionContentSha256) {
    fail('projection-content-hash-mismatch', `${selected.packageId} public index canonical content hash is invalid.`);
  }
  const selectedScope = normalizePackageScope(index.scope, `${selected.packageId}.index.scope`);
  if (!sameJson(selectedScope, expectedSelected.scope)
    || index.packageId !== selected.packageId
    || index.packageVersion !== expectedSelected.packageVersion
    || index.buildRecipeDigest !== expectedSelected.buildRecipeDigest
    || index.packageManifestSha256 !== expectedSelected.manifestSha256
    || index.sourceLockDigestKind !== expectedSelected.sourceLockDigestKind
    || index.sourceLockSha256 !== expectedSelected.sourceLockSha256
    || index.sourceLockEmbeddedSha256 !== expectedSelected.sourceLockEmbeddedSha256
    || index.sourceLockFileSha256 !== expectedSelected.sourceLockFileSha256
    || index.sourceLockFileByteLength !== expectedSelected.sourceLockFileByteLength
    || index.sourceLockSchemaSha256 !== expectedSelected.sourceLockSchemaSha256
    || index.scopeResolutionPolicy !== expectedSelected.scopeResolutionPolicy
    || !sameJson(index.capabilitySummary, expectedSelected.capabilitySummary)
    || index.capabilityMapSha256 !== selected.capabilityMapSha256
    || !sameJson(index.scope, selected.scope)) {
    fail('index-pin-mismatch', `${selected.packageId} index identity/scope differs from registry and native pins.`);
  }
  if (!Array.isArray(index.artifacts) || !index.artifacts.length) fail('index-artifacts-missing', `${selected.packageId} public index has no artifacts.`);
  const indexedArtifactIds = index.artifacts.map((artifact) => artifact?.artifactId);
  if (indexedArtifactIds.some((artifactId) => typeof artifactId !== 'string' || !artifactId.trim())
    || new Set(indexedArtifactIds).size !== indexedArtifactIds.length) {
    fail('index-artifacts-invalid', selected.packageId + ' index has a missing or duplicate artifact ID.');
  }
  const capabilitySummary = index.capabilitySummary;
  const capabilityMapIssues = canonicalV4ProjectionCapabilityMapIssues(
    index.capabilityMap,
    new Set(indexedArtifactIds),
    capabilitySummary,
    selectedScope,
  );
  if (capabilityMapIssues.length) {
    fail('capability-map-invalid', selected.packageId + ' projection capability map is invalid: ' + capabilityMapIssues.slice(0, 8).join('; ') + '.');
  }
  const capabilities = {};
  for (const capabilityId of required) {
    const projectedCapability = index.capabilityMap.capabilities[capabilityId];
    if (!projectedCapability) {
      fail('capability-unavailable', selected.packageId + ' has no public projection map entry for ' + capabilityId + '.');
    }
    if (projectedCapability.evidenceState !== 'evidence'
      || projectedCapability.executionReadiness.descriptiveDataAccess !== 'available') {
      fail('capability-unavailable', selected.packageId + ' public projection is partial or unavailable for ' + capabilityId + '.');
    }
    const nativeStates = projectedCapability.nativeCapabilityId === null
      ? null
      : reportedStates(capabilitySummary, projectedCapability.nativeCapabilityId);
    if (nativeStates && nativeStates.evidence.status !== 'available') {
      fail('capability-unavailable', `${selected.packageId} does not report evidence as available for ${capabilityId}.`);
    }
    capabilities[capabilityId] = Object.freeze({
      ...(nativeStates || {}),
      projection: Object.freeze({
        capabilityMapSha256,
        nativeCapabilityId: projectedCapability.nativeCapabilityId,
        artifactIds: Object.freeze([...projectedCapability.artifactIds]),
      }),
      ...(nativeStates ? {} : {
        descriptiveDataAccess: Object.freeze({ status: 'available' }),
        predictiveValidationStatus: projectedCapability.predictiveValidationStatus,
        approvalClaimsMade: false,
      }),
    });
  }

  return Object.freeze({
    format: CANONICAL_V4_PROJECTION_RESOLVER_FORMAT,
    resolverVersion: CANONICAL_V4_PROJECTION_RESOLVER_VERSION,
    status: 'resolved',
    scope: Object.freeze({ ...requestedScope, seasonStartYears: Object.freeze([...requestedScope.seasonStartYears]), phases: Object.freeze([...requestedScope.phases]) }),
    package: Object.freeze({
      packageId: selected.packageId,
      packageVersion: expectedSelected.packageVersion,
      buildRecipeDigest: expectedSelected.buildRecipeDigest,
      packageManifestSha256: expectedSelected.manifestSha256,
      sourceLockDigestKind: expectedSelected.sourceLockDigestKind,
      sourceLockSha256: expectedSelected.sourceLockSha256,
      sourceLockEmbeddedSha256: expectedSelected.sourceLockEmbeddedSha256,
      sourceLockFileSha256: expectedSelected.sourceLockFileSha256,
      sourceLockFileByteLength: expectedSelected.sourceLockFileByteLength,
      sourceLockSchemaSha256: expectedSelected.sourceLockSchemaSha256,
      capabilityMapSha256,
      indexPath,
      indexSha256,
      projectionContentSha256,
    }),
    bundleIdentity: Object.freeze({
      bundleId: identity.bundle.bundleId,
      bundleVersion: identity.bundle.bundleVersion,
      buildRecipeDigest: identity.bundle.buildRecipeDigest,
      manifestSha256: identity.bundle.manifestSha256,
    }),
    integrity: Object.freeze({
      registrySha256,
      registryRevisionSha256,
      indexSha256,
      projectionContentSha256,
      capabilityMapSha256,
      status: 'bytes-and-pins-verified',
    }),
    capabilities: Object.freeze(capabilities),
    approvalClaimsMade: false,
  });
}

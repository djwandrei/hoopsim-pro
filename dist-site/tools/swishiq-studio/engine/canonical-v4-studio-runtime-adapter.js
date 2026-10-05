/*
 * Opt-in data loader for a reviewed, immutable SwishIQ V4 Studio release.
 * Consumers use its embedded immutable V4 release pin and fail closed on
 * unsupported capabilities or missing release evidence.
 */

import {
  loadCanonicalV4PublicPackageProof,
  loadCanonicalV4PublicParts,
} from './canonical-v4-public-network-loader.js?v=20261002e&rev=canonical-v4-public-network-loader-v4-dependency-cache-closure';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN as REVIEWED_V4_RELEASE_PIN } from './canonical-v4-studio-runtime-release-pin.js?v=20261002e&rev=canonical-v4-release-pin-v5-dependency-cache-closure';

export const CANONICAL_V4_STUDIO_RUNTIME_ADAPTER_FORMAT = 'djhc-swishiq-v4-studio-runtime-adapter-v2';
export const CANONICAL_V4_STUDIO_RUNTIME_ADAPTER_VERSION = 'swishiq-v4-studio-runtime-adapter-v2';
export const CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT = 'djhc-swishiq-v4-studio-runtime-release-pin-v2';
export const CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION = 'swishiq-v4-studio-runtime-release-pin-v2';

const HASH_RE = /^[a-f0-9]{64}$/;
const PACKAGE_IDS = Object.freeze([
  ...Array.from({ length: 9 }, (_, index) => {
    const year = 2017 + index;
    return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
  }),
  'nba-swishiq-v4-2017-26',
]);
const POOLED_YEARS = Object.freeze(Array.from({ length: 9 }, (_, index) => 2017 + index));
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const SUPPLEMENTAL_ARTIFACT_ALLOWLIST = Object.freeze({
  // Player profile snapshots stay outside this typed view: the current source
  // rows have no season/as-of or resolved player identity. Exact-season player
  // observations can still be loaded beside the complete franchise proof.
  franchiseInputs: new Set(['player-seasons']),
});

/** Reviewed immutable identity and package pins for the V4 site release. */
export const CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN = REVIEWED_V4_RELEASE_PIN;

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
    fail('release-pin-invalid', `${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function normalizeScope(scope, acceptPooled) {
  if (!isObject(scope) || !['exact-season', 'pooled-window'].includes(scope.kind)) {
    fail('scope-invalid', 'An explicit exact-season or pooled-window request is required.');
  }
  if (!Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length
    || scope.seasonStartYears.some((year, index) => !Number.isSafeInteger(year)
      || year < 2017 || year > 2025
      || (index > 0 && year !== scope.seasonStartYears[index - 1] + 1))) {
    fail('scope-invalid', 'Request scope must list supported, ascending, contiguous season start years.');
  }
  if (!Array.isArray(scope.phases) || !scope.phases.length
    || new Set(scope.phases).size !== scope.phases.length
    || scope.phases.some(phase => !PHASES.has(phase))) {
    fail('scope-invalid', 'Request scope must list distinct, supported phases explicitly.');
  }
  if (scope.kind === 'exact-season' && scope.seasonStartYears.length !== 1) {
    fail('scope-invalid', 'An exact-season request must contain one season start year.');
  }
  if (scope.kind === 'pooled-window') {
    if (scope.seasonStartYears.length !== POOLED_YEARS.length
      || scope.seasonStartYears.some((year, index) => year !== POOLED_YEARS[index])) {
      fail('scope-invalid', 'The pooled request must name the complete 2017–26 season window.');
    }
    if (acceptPooled !== true) {
      fail('pooled-acceptance-required', 'Pooled V4 access requires acceptPooled: true.');
    }
  } else if (acceptPooled === true) {
    fail('scope-invalid', 'Exact-season access cannot carry pooled acceptance.');
  }
  return Object.freeze({
    kind: scope.kind,
    seasonStartYears: Object.freeze([...scope.seasonStartYears]),
    phases: Object.freeze([...scope.phases]),
  });
}

function normalizeReleasePin(pin) {
  if (!isObject(pin)
    || pin.format !== CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT
    || pin.version !== CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION
    || pin.status !== 'reviewed') {
    fail('release-pin-unavailable', 'A reviewed V4 runtime release pin is not configured.');
  }
  if (typeof pin.registryUrl !== 'string' || !pin.registryUrl.trim()) {
    fail('release-pin-invalid', 'registryUrl is required.');
  }
  requireHash(pin.registrySha256, 'registrySha256');
  requireHash(pin.registryRevisionSha256, 'registryRevisionSha256');
  requireHash(pin.reviewReceiptSha256, 'reviewReceiptSha256');
  requireHash(pin.authorizationReferenceSha256, 'authorizationReferenceSha256');
  if (!isObject(pin.expectedIdentity) || !Array.isArray(pin.expectedIdentity.packages)) {
    fail('release-pin-invalid', 'A separately reviewed expectedIdentity object is required.');
  }
  if (!Array.isArray(pin.packagePins) || pin.packagePins.length !== PACKAGE_IDS.length) {
    fail('release-pin-invalid', 'The release pin must contain all ten reviewed V4 package pins.');
  }
  const packagePins = new Map();
  for (const row of pin.packagePins) {
    if (!isObject(row) || !PACKAGE_IDS.includes(row.packageId) || packagePins.has(row.packageId)) {
      fail('release-pin-invalid', 'The release pin contains an unexpected or duplicate package pin.');
    }
    requireHash(row.indexSha256, `${row.packageId}.indexSha256`);
    requireHash(row.capabilityMapSha256, `${row.packageId}.capabilityMapSha256`);
    if (row.sourceLockDigestKind !== 'full-lock-object') {
      fail('release-pin-invalid', `${row.packageId}.sourceLockDigestKind must be full-lock-object.`);
    }
    requireHash(row.sourceLockSha256, `${row.packageId}.sourceLockSha256`);
    requireHash(row.sourceLockEmbeddedSha256, `${row.packageId}.sourceLockEmbeddedSha256`);
    requireHash(row.sourceLockFileSha256, `${row.packageId}.sourceLockFileSha256`);
    requireHash(row.sourceLockSchemaSha256, `${row.packageId}.sourceLockSchemaSha256`);
    if (!Number.isSafeInteger(row.sourceLockFileByteLength) || row.sourceLockFileByteLength < 1) {
      fail('release-pin-invalid', `${row.packageId}.sourceLockFileByteLength must be a positive integer.`);
    }
    packagePins.set(row.packageId, Object.freeze({
      packageId: row.packageId,
      indexSha256: row.indexSha256,
      capabilityMapSha256: row.capabilityMapSha256,
      sourceLockDigestKind: row.sourceLockDigestKind,
      sourceLockSha256: row.sourceLockSha256,
      sourceLockEmbeddedSha256: row.sourceLockEmbeddedSha256,
      sourceLockFileSha256: row.sourceLockFileSha256,
      sourceLockFileByteLength: row.sourceLockFileByteLength,
      sourceLockSchemaSha256: row.sourceLockSchemaSha256,
    }));
  }
  const expectedIdentityIds = pin.expectedIdentity.packages.map(row => row?.packageId);
  if (expectedIdentityIds.length !== PACKAGE_IDS.length
    || PACKAGE_IDS.some(id => !expectedIdentityIds.includes(id))
    || PACKAGE_IDS.some(id => !packagePins.has(id))) {
    fail('release-pin-invalid', 'Reviewed package pins must match all ten expectedIdentity package IDs.');
  }
  return Object.freeze({
    registryUrl: pin.registryUrl.trim(),
    registrySha256: pin.registrySha256,
    registryRevisionSha256: pin.registryRevisionSha256,
    reviewReceiptSha256: pin.reviewReceiptSha256,
    authorizationReferenceSha256: pin.authorizationReferenceSha256,
    expectedIdentity: pin.expectedIdentity,
    packagePins,
  });
}

/**
 * Load descriptive data for exactly one declared capability. Any missing,
 * partial, unpinned, or mismatched release/package/artifact fails without V3
 * fallback. The returned boundary never asserts predictive eligibility.
 */
export async function loadCanonicalV4StudioCapabilityData({
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  scope,
  capabilityId,
  additionalArtifactIds = [],
  acceptPooled = false,
  fetchImpl,
  signal,
  requestTimeoutMs,
  baseUrl,
} = {}) {
  const selectedPin = normalizeReleasePin(releasePin);
  const selectedScope = normalizeScope(scope, acceptPooled);
  if (typeof capabilityId !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]{0,79}$/.test(capabilityId)) {
    fail('capability-request-invalid', 'A single explicit capabilityId is required.');
  }
  if (!Array.isArray(additionalArtifactIds)
    || new Set(additionalArtifactIds).size !== additionalArtifactIds.length
    || additionalArtifactIds.some(artifactId => typeof artifactId !== 'string'
      || !SUPPLEMENTAL_ARTIFACT_ALLOWLIST[capabilityId]?.has(artifactId))) {
    fail('supplemental-artifact-not-allowed', `${capabilityId} does not allow the requested supplemental artifacts.`);
  }

  const proof = await loadCanonicalV4PublicPackageProof({
    registryUrl: selectedPin.registryUrl,
    expectedRegistrySha256: selectedPin.registrySha256,
    expectedIdentity: selectedPin.expectedIdentity,
    scope: selectedScope,
    requiredCapabilities: [capabilityId],
    acceptPooled,
    fetchImpl,
    signal,
    requestTimeoutMs,
    baseUrl,
  });
  if (proof.registryRevisionSha256 !== selectedPin.registryRevisionSha256) {
    fail('registry-revision-pin-mismatch', 'Verified V4 registry revision differs from the reviewed release pin.');
  }

  const packagePin = selectedPin.packagePins.get(proof.package.packageId);
  if (!packagePin
    || packagePin.indexSha256 !== proof.indexSha256
    || packagePin.capabilityMapSha256 !== proof.package.capabilityMapSha256
    || packagePin.sourceLockDigestKind !== proof.package.sourceLockDigestKind
    || packagePin.sourceLockSha256 !== proof.package.sourceLockSha256
    || packagePin.sourceLockEmbeddedSha256 !== proof.package.sourceLockEmbeddedSha256
    || packagePin.sourceLockFileSha256 !== proof.package.sourceLockFileSha256
    || packagePin.sourceLockFileByteLength !== proof.package.sourceLockFileByteLength
    || packagePin.sourceLockSchemaSha256 !== proof.package.sourceLockSchemaSha256) {
    fail('package-review-pin-mismatch', `${proof.package.packageId} index or capability-map hash differs from the reviewed package pin.`);
  }

  const mappedCapability = proof.index.capabilityMap?.capabilities?.[capabilityId];
  if (!isObject(mappedCapability)
    || mappedCapability.evidenceState !== 'evidence'
    || mappedCapability.executionReadiness?.descriptiveDataAccess !== 'available'
    || !Array.isArray(mappedCapability.artifactIds)
    || !mappedCapability.artifactIds.length) {
    fail('capability-unavailable', `${capabilityId} is missing or partial in the reviewed public capability map.`);
  }
  const parts = await loadCanonicalV4PublicParts(proof, {
    artifactIds: [...mappedCapability.artifactIds, ...additionalArtifactIds],
    fetchImpl,
    signal,
    requestTimeoutMs,
  });
  return Object.freeze({
    format: CANONICAL_V4_STUDIO_RUNTIME_ADAPTER_FORMAT,
    version: CANONICAL_V4_STUDIO_RUNTIME_ADAPTER_VERSION,
    status: 'verified-data-access',
    capabilityId,
    capability: Object.freeze({
      capabilityId,
      capabilityClass: mappedCapability.capabilityClass || 'native-model-capability',
      nativeCapabilityId: mappedCapability.nativeCapabilityId,
      evidenceState: mappedCapability.evidenceState,
      descriptiveDataAccess: mappedCapability.executionReadiness.descriptiveDataAccess,
      modelExecution: mappedCapability.executionReadiness.modelExecution,
      predictiveValidationStatus: mappedCapability.predictiveValidationStatus,
      artifactIds: Object.freeze([...mappedCapability.artifactIds]),
      seasonCoverage: mappedCapability.seasonCoverage,
    }),
    supplementalArtifactIds: Object.freeze([...additionalArtifactIds]),
    scope: proof.scope,
    package: proof.package,
    parts,
    source: Object.freeze({
      releaseId: proof.releaseId,
      registryUrl: proof.registryUrl,
      registrySha256: proof.registrySha256,
      registryRevisionSha256: proof.registryRevisionSha256,
      reviewReceiptSha256: selectedPin.reviewReceiptSha256,
      authorizationReferenceSha256: selectedPin.authorizationReferenceSha256,
      indexSha256: proof.indexSha256,
      capabilityMapSha256: proof.package.capabilityMapSha256,
    }),
    useBoundary: Object.freeze({
      descriptiveDataAccess: 'verified',
      modelExecution: 'not-performed-by-adapter',
      predictiveEligibility: 'ineligible-by-default',
      supplementalArtifactAccess: additionalArtifactIds.length ? 'same-package-index-and-hash-verified' : 'not-requested',
      approvalClaimsMade: false,
    }),
  });
}

/** Exact-season data access never widens to pooled scope. */
export function loadCanonicalV4StudioExactSeasonData({ seasonStartYear, phases, ...options } = {}) {
  if (!Number.isSafeInteger(seasonStartYear)) {
    fail('scope-invalid', 'seasonStartYear must be an integer.');
  }
  return loadCanonicalV4StudioCapabilityData({
    ...options,
    scope: { kind: 'exact-season', seasonStartYears: [seasonStartYear], phases },
    acceptPooled: false,
  });
}

/** Pooled data access is available only when the caller explicitly opts in. */
export function loadCanonicalV4StudioPooledData({ acceptPooled, phases, ...options } = {}) {
  if (acceptPooled !== true) {
    fail('pooled-acceptance-required', 'Pooled V4 access requires acceptPooled: true.');
  }
  return loadCanonicalV4StudioCapabilityData({
    ...options,
    scope: { kind: 'pooled-window', seasonStartYears: [...POOLED_YEARS], phases },
    acceptPooled: true,
  });
}

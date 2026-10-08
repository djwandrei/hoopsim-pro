import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT,
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION,
  loadCanonicalV4StudioExactSeasonData,
  loadCanonicalV4StudioPooledData,
} from './canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';

export const CANONICAL_V4_PLAYER_BASE_CAPABILITY = 'nbaStatsPlayerBase';
export const CANONICAL_V4_PLAYER_BASE_ARTIFACT = 'stats-nba-com-player-base';
export const CANONICAL_V4_PLAYER_BASE_CONSUMER_FORMAT = 'djhc-swishiq-v4-player-base-descriptive-consumer-v1';
export const CANONICAL_V4_PLAYER_BASE_CONSUMER_VERSION = 'swishiq-v4-player-base-descriptive-consumer-v1';

const FIRST_SEASON = 2017;
const LAST_SEASON = 2025;
const POOLED_SEASONS = Object.freeze(Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, index) => FIRST_SEASON + index));
const DISPLAY_METRICS = Object.freeze(['PTS', 'REB', 'AST', 'GP']);
const EXPECTED_PACKAGE_IDS = Object.freeze([
  ...Array.from({ length: 9 }, (_, index) => {
    const year = FIRST_SEASON + index;
    return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
  }),
  'nba-swishiq-v4-2017-26',
]);
const HASH_RE = /^[a-f0-9]{64}$/;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function copyFiniteMetrics(metrics) {
  if (!object(metrics)) return Object.freeze({});
  const output = {};
  for (const key of DISPLAY_METRICS) {
    const value = metrics[key];
    output[key] = Number.isFinite(value) ? value : null;
  }
  return Object.freeze(output);
}

function expectedPackageId(scope) {
  if (scope.kind === 'pooled-window') return 'nba-swishiq-v4-2017-26';
  const year = scope.seasonStartYears[0];
  return `nba-swishiq-v4-${year}-${String(year + 1).slice(-2)}`;
}

function validateScope(scope, pooled) {
  if (!object(scope) || !Array.isArray(scope.seasonStartYears)) {
    fail('scope-invalid', 'Verified V4 data must include an explicit package scope.');
  }
  if (pooled) {
    if (scope.kind !== 'pooled-window'
      || scope.seasonStartYears.length !== POOLED_SEASONS.length
      || scope.seasonStartYears.some((year, index) => year !== POOLED_SEASONS[index])) {
      fail('scope-mismatch', 'The pooled descriptive view must contain exactly the 2017–26 window.');
    }
    return;
  }
  if (scope.kind !== 'exact-season' || scope.seasonStartYears.length !== 1
    || !Number.isSafeInteger(scope.seasonStartYears[0])
    || scope.seasonStartYears[0] < FIRST_SEASON || scope.seasonStartYears[0] > LAST_SEASON) {
    fail('scope-mismatch', 'The descriptive view requires one supported exact-season package.');
  }
}

/**
 * Convert only verified NBA.com Player Base source rows to a descriptive view.
 * This mapping does not assign player identity, derive rates, or create model inputs.
 */
export function mapCanonicalV4PlayerBaseObservations(verifiedData, { pooled = false } = {}) {
  if (!object(verifiedData) || verifiedData.status !== 'verified-data-access'
    || verifiedData.format !== 'djhc-swishiq-v4-studio-runtime-adapter-v2') {
    fail('verified-data-required', 'A verified V4 descriptive data result is required.');
  }
  if (verifiedData.capabilityId !== CANONICAL_V4_PLAYER_BASE_CAPABILITY
    || verifiedData.capability?.capabilityClass !== 'descriptive-source-observation'
    || verifiedData.capability?.evidenceState !== 'evidence'
    || verifiedData.capability?.descriptiveDataAccess !== 'available'
    || verifiedData.capability?.modelExecution !== 'not-applicable'
    || verifiedData.capability?.predictiveValidationStatus !== 'not-applicable-descriptive-only'
    || !verifiedData.capability?.artifactIds?.includes(CANONICAL_V4_PLAYER_BASE_ARTIFACT)) {
    fail('capability-contract-mismatch', 'The verified capability is not complete descriptive Player Base source data.');
  }
  validateScope(verifiedData.scope, pooled);
  const packageId = expectedPackageId(verifiedData.scope);
  if (verifiedData.package?.packageId !== packageId
    || verifiedData.package?.scope?.kind !== verifiedData.scope.kind
    || verifiedData.package?.scope?.seasonStartYears?.length !== verifiedData.scope.seasonStartYears.length
    || verifiedData.package.scope.seasonStartYears.some((year, index) => year !== verifiedData.scope.seasonStartYears[index])) {
    fail('package-scope-mismatch', 'The verified package identity does not match the requested exact or pooled scope.');
  }
  const part = verifiedData.parts?.[CANONICAL_V4_PLAYER_BASE_ARTIFACT];
  if (!object(part) || part.status !== 'verified'
    || part.artifactId !== CANONICAL_V4_PLAYER_BASE_ARTIFACT
    || !Array.isArray(part.records) || part.records.length !== part.rows) {
    fail('artifact-contract-mismatch', 'The verified Player Base artifact is missing or has an invalid record count.');
  }

  const allowedYears = new Set(verifiedData.scope.seasonStartYears);
  const observations = part.records.map((record, index) => {
    const year = record?.time?.seasonStartYear;
    if (!Number.isSafeInteger(year) || !allowedYears.has(year)
      || record?.time?.phase !== 'regular'
      || record?.temporalUse?.role !== 'descriptive'
      || record?.temporalUse?.eligibleForPredictiveFeatures !== false
      || record?.evidence?.kind !== 'nba-stats-source-observation'
      || record?.evidence?.identityStatus !== 'unresolved'
      || record?.values?.statFamily !== 'player-base'
      || !['player', 'team'].includes(record?.values?.entityLevel)) {
      fail('observation-contract-mismatch', `Player Base row ${index + 1} is outside the descriptive source contract.`);
    }
    const displayName = typeof record.values.displayName === 'string' ? record.values.displayName : '';
    const teamCode = typeof record.values.teamCode === 'string' && /^[A-Z]{2,4}$/.test(record.values.teamCode)
      ? record.values.teamCode : null;
    const metrics = copyFiniteMetrics(record.values.metrics);
    if (typeof record.recordId !== 'string' || !record.recordId
      || !DISPLAY_METRICS.some(key => Number.isFinite(metrics[key]))) {
      fail('observation-contract-mismatch', `Player Base row ${index + 1} has no stable public row ID or supported numeric metrics.`);
    }
    return Object.freeze({
      recordId: record.recordId,
      entityLevel: record.values.entityLevel,
      displayName,
      sourceReportedTeamCode: teamCode,
      teamAttribution: record.values.teamAttribution === 'source-reported-context-only' ? 'source-reported-context-only' : null,
      seasonStartYear: year,
      seasonLabel: typeof record.time.seasonLabel === 'string' ? record.time.seasonLabel : String(year),
      phase: 'regular',
      metrics,
      identityStatus: 'unresolved',
      predictiveEligible: false,
    });
  });

  return Object.freeze({
    format: CANONICAL_V4_PLAYER_BASE_CONSUMER_FORMAT,
    version: CANONICAL_V4_PLAYER_BASE_CONSUMER_VERSION,
    status: 'verified-descriptive-source-observations',
    package: verifiedData.package,
    scope: verifiedData.scope,
    source: verifiedData.source,
    capability: verifiedData.capability,
    rowCount: observations.length,
    observations: Object.freeze(observations),
    useBoundary: Object.freeze({
      descriptiveDataAccess: 'verified',
      playerIdentity: 'unresolved-source-name-only',
      teamAttribution: 'source-reported-context-only',
      modelExecution: 'not-performed',
      predictiveEligibility: 'ineligible',
      approvalClaimsMade: false,
    }),
  });
}

export function canonicalV4PlayerBaseConsumerAvailability(releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN) {
  const packagePins = Array.isArray(releasePin?.packagePins) ? releasePin.packagePins : [];
  const packageIds = packagePins.map(row => row?.packageId);
  const expectedPackages = Array.isArray(releasePin?.expectedIdentity?.packages) ? releasePin.expectedIdentity.packages : [];
  const expectedIds = expectedPackages.map(row => row?.packageId);
  const packagePinsComplete = packagePins.length === EXPECTED_PACKAGE_IDS.length
    && new Set(packageIds).size === EXPECTED_PACKAGE_IDS.length
    && EXPECTED_PACKAGE_IDS.every(id => packageIds.includes(id))
    && Array.isArray(expectedIds)
    && expectedIds.length === EXPECTED_PACKAGE_IDS.length
    && new Set(expectedIds).size === EXPECTED_PACKAGE_IDS.length
    && EXPECTED_PACKAGE_IDS.every(id => expectedIds.includes(id))
    && packagePins.every(row => row?.sourceLockDigestKind === 'full-lock-object'
      && HASH_RE.test(String(row?.indexSha256 || ''))
      && HASH_RE.test(String(row?.capabilityMapSha256 || ''))
      && HASH_RE.test(String(row?.sourceLockSha256 || ''))
      && HASH_RE.test(String(row?.sourceLockEmbeddedSha256 || ''))
      && HASH_RE.test(String(row?.sourceLockFileSha256 || ''))
      && Number.isSafeInteger(row?.sourceLockFileByteLength) && row.sourceLockFileByteLength > 0
      && HASH_RE.test(String(row?.sourceLockSchemaSha256 || '')));
  const expectedIdentityComplete = object(releasePin?.expectedIdentity?.bundle)
    && typeof releasePin.expectedIdentity.bundle.bundleId === 'string'
    && typeof releasePin.expectedIdentity.bundle.bundleVersion === 'string'
    && HASH_RE.test(String(releasePin.expectedIdentity.bundle.buildRecipeDigest || ''))
    && HASH_RE.test(String(releasePin.expectedIdentity.bundle.manifestSha256 || ''))
    && object(releasePin.expectedIdentity.bundle.buildRecipe)
    && expectedPackages.length === EXPECTED_PACKAGE_IDS.length
    && expectedPackages.every(row => EXPECTED_PACKAGE_IDS.includes(row?.packageId)
      && typeof row.packageVersion === 'string'
      && HASH_RE.test(String(row.buildRecipeDigest || ''))
      && HASH_RE.test(String(row.manifestSha256 || ''))
      && row.sourceLockDigestKind === 'full-lock-object'
      && HASH_RE.test(String(row.sourceLockSha256 || ''))
      && HASH_RE.test(String(row.sourceLockEmbeddedSha256 || ''))
      && HASH_RE.test(String(row.sourceLockFileSha256 || ''))
      && Number.isSafeInteger(row.sourceLockFileByteLength) && row.sourceLockFileByteLength > 0
      && HASH_RE.test(String(row.sourceLockSchemaSha256 || ''))
      && object(row.scope) && typeof row.scopeResolutionPolicy === 'string'
      && object(row.capabilitySummary) && object(row.buildRecipe));
  const releasePinComplete = releasePin?.format === CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_FORMAT
    && releasePin?.version === CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN_VERSION
    && releasePin?.status === 'reviewed'
    && typeof releasePin?.registryUrl === 'string'
    && /^https?:\/\/[^/?#]+\/tools\/swishiq-studio\/data\/v4\/releases\/v4-site-[a-f0-9]{12}\/registry\.json$/.test(releasePin.registryUrl)
    && HASH_RE.test(String(releasePin?.registrySha256 || ''))
    && HASH_RE.test(String(releasePin?.registryRevisionSha256 || ''))
    && HASH_RE.test(String(releasePin?.reviewReceiptSha256 || ''))
    && HASH_RE.test(String(releasePin?.authorizationReferenceSha256 || ''))
    && expectedIdentityComplete
    && packagePinsComplete;
  if (releasePinComplete) return Object.freeze({
    status: 'ready-to-attempt-reviewed-descriptive-access',
    enabled: true,
    reason: 'The V4 descriptive loader will verify the reviewed release pins before returning source observations.',
  });
  return Object.freeze({
    status: 'disabled-release-pin-incomplete',
    enabled: false,
    reason: 'A complete reviewed, immutable V4 site release pin is not configured. Descriptive source data remains unavailable here.',
  });
}

/** Load one explicit exact season, or an explicitly accepted pooled window. */
export async function loadCanonicalV4PlayerBaseObservations({
  seasonStartYear = null,
  acceptPooled = false,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  ...options
} = {}) {
  const availability = canonicalV4PlayerBaseConsumerAvailability(releasePin);
  if (!availability.enabled) fail('release-pin-unavailable', availability.reason);
  if (acceptPooled === true) {
    if (seasonStartYear !== null) fail('scope-invalid', 'A pooled request cannot also select an exact season.');
    const verified = await loadCanonicalV4StudioPooledData({
      ...options,
      releasePin,
      capabilityId: CANONICAL_V4_PLAYER_BASE_CAPABILITY,
      phases: ['regular'],
      acceptPooled: true,
    });
    return mapCanonicalV4PlayerBaseObservations(verified, { pooled: true });
  }
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < FIRST_SEASON || seasonStartYear > LAST_SEASON) {
    fail('scope-invalid', 'Choose one exact season from 2017–18 through 2025–26, or explicitly accept the pooled window.');
  }
  const verified = await loadCanonicalV4StudioExactSeasonData({
    ...options,
    releasePin,
    capabilityId: CANONICAL_V4_PLAYER_BASE_CAPABILITY,
    seasonStartYear,
    phases: ['regular'],
  });
  return mapCanonicalV4PlayerBaseObservations(verified, { pooled: false });
}

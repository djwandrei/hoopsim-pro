/*
 * Hash-pinned, browser-safe resolver for a separately versioned V4 Impact
 * companion release. The caller owns fetching policy and must pin the
 * immutable manifest identity; this module only reads and validates bytes.
 */

export const CANONICAL_V4_IMPACT_MODEL_RESOLVER_FORMAT = 'djhc-swishiq-v4-impact-companion-resolution-v1';
export const CANONICAL_V4_IMPACT_MODEL_RESOLVER_VERSION = 'swishiq-v4-impact-companion-resolver-v1';

const MANIFEST_FORMAT = 'djhc-swishiq-v4-impact-overlay-manifest-v1';
const CONTRACT_FORMAT = 'djhc-player-impact-v4-additive-contract-v1';
const CONTRACT_VERSION = '1.0.1';
const SEASON_FORMAT = 'djhc-player-impact-v4-additive-season-v1';
const ROW_FORMAT = 'djhc-player-impact-v4-additive-row-v1';
const PLAYER_NAME_NORMALIZER = 'canonical-v4-player-name-identity-v1';
const VALIDATION_CLAIM_SCOPE = 'historical conditional scoring for specified observed paired lineups';
const PHASE = 'regular';
const HASH_RE = /^[a-f0-9]{64}$/;
const MAX_ADDITIVITY_TOLERANCE = 1e-8;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredText(value, label, code = 'invalid-request') {
  if (typeof value !== 'string' || !value.trim()) fail(code, `${label} is required.`);
  return value.trim();
}

function requiredHash(value, label, code = 'invalid-request') {
  if (typeof value !== 'string' || !HASH_RE.test(value)) {
    fail(code, `${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requiredByteLength(value, label, code = 'invalid-request') {
  if (!Number.isSafeInteger(value) || value < 1) fail(code, `${label} must be a positive byte length.`);
  return value;
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string'
    || !value
    || value.includes('\\')
    || value.includes('\0')
    || value.includes('%')
    || value.includes('?')
    || value.includes('#')
    || value.startsWith('/')
    || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    fail('unsafe-artifact-path', `${label} must be a safe relative POSIX path.`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    fail('unsafe-artifact-path', `${label} contains traversal or empty path segments.`);
  }
  return value;
}

function artifactBytes(value, label) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('artifact-bytes-invalid', `${label} must be UTF-8 text or bytes.`);
}

function parseJsonBytes(bytes, label) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    fail('artifact-json-invalid', `${label} is not valid UTF-8 JSON: ${error.message}`);
  }
  if (!isObject(value)) fail('artifact-json-invalid', `${label} must contain a JSON object.`);
  return value;
}

async function browserSha256Hex(bytes) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest) fail('sha256-unavailable', 'Web Crypto SHA-256 is unavailable; inject sha256Hex.');
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalSeasonPackageId(value, seasonStartYear) {
  const suffix = String(seasonStartYear + 1).slice(-2);
  return value === `nba-swishiq-v4-${seasonStartYear}-${suffix}`;
}

function normalizeRequest(options) {
  if (!isObject(options)) fail('invalid-request', 'Resolver options are required.');
  const baseUrlText = requiredText(options.baseUrl, 'baseUrl');
  let baseUrl;
  try {
    baseUrl = new URL(baseUrlText);
  } catch {
    fail('invalid-request', 'baseUrl must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    fail('invalid-request', 'baseUrl must be an absolute HTTP(S) URL without credentials.');
  }
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';

  const manifestPath = safeRelativePath(options.manifestPath, 'manifestPath');
  const expectedManifestSha256 = requiredHash(options.expectedManifestSha256, 'expectedManifestSha256');
  const expectedManifestBytes = requiredByteLength(options.expectedManifestBytes, 'expectedManifestBytes');
  const expectedReleaseId = requiredText(options.expectedReleaseId, 'expectedReleaseId');
  const seasonStartYear = options.seasonStartYear;
  if (!Number.isSafeInteger(seasonStartYear) || seasonStartYear < 1947 || seasonStartYear > 2199) {
    fail('invalid-request', 'seasonStartYear must be a valid NBA season start year.');
  }
  const phase = options.phase ?? PHASE;
  if (phase !== PHASE) fail('scope-invalid', 'The V4 Impact companion resolver only accepts regular-season scope.');
  const packageId = requiredText(options.packageId, 'packageId');
  if (!canonicalSeasonPackageId(packageId, seasonStartYear)) {
    fail('scope-invalid', 'packageId must be the exact canonical V4 package ID for the requested season.');
  }
  const packageVersion = requiredText(options.packageVersion, 'packageVersion');
  const additivityTolerance = options.additivityTolerance ?? 1e-12;
  if (!Number.isFinite(additivityTolerance) || additivityTolerance < 0 || additivityTolerance > MAX_ADDITIVITY_TOLERANCE) {
    fail('invalid-request', `additivityTolerance must be between 0 and ${MAX_ADDITIVITY_TOLERANCE}.`);
  }
  // Browser fetch is receiver-sensitive in several engines.  Keep an injected
  // implementation exactly as supplied for testability, but bind the default
  // global implementation before storing it on the request object so later
  // `request.fetchImpl(...)` calls cannot lose the Window/global receiver.
  const fetchImpl = options.fetchImpl ?? (
    typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null
  );
  if (typeof fetchImpl !== 'function') fail('invalid-request', 'A fetch implementation is required.');
  const sha256Hex = options.sha256Hex ?? browserSha256Hex;
  if (typeof sha256Hex !== 'function') fail('invalid-request', 'sha256Hex must be a function.');

  return {
    baseUrl,
    manifestPath,
    expectedManifestSha256,
    expectedManifestBytes,
    expectedReleaseId,
    seasonStartYear,
    seasonEndYear: seasonStartYear + 1,
    phase,
    packageId,
    packageVersion,
    additivityTolerance,
    fetchImpl,
    sha256Hex,
    signal: options.signal,
  };
}

async function fetchPinnedArtifact(request, relativePath, expectedSha256, expectedBytes, label) {
  const path = safeRelativePath(relativePath, `${label} path`);
  const url = new URL(path, request.baseUrl);
  let response;
  try {
    response = await request.fetchImpl(url.href, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch (error) {
    fail('artifact-fetch-failed', `${label} could not be fetched: ${error.message}`);
  }
  if (!response || response.ok !== true || typeof response.arrayBuffer !== 'function') {
    fail('artifact-fetch-failed', `${label} request did not return a successful byte response.`, {
      status: response?.status ?? null,
      path,
    });
  }

  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    fail('artifact-fetch-failed', `${label} response bytes could not be read: ${error.message}`);
  }
  if (bytes.byteLength !== expectedBytes) {
    fail('artifact-byte-length-mismatch', `${label} byte length does not match its immutable pin.`, {
      expectedBytes,
      actualBytes: bytes.byteLength,
      path,
    });
  }
  const actualSha256 = await request.sha256Hex(bytes);
  if (typeof actualSha256 !== 'string' || !HASH_RE.test(actualSha256)) {
    fail('sha256-invalid', `${label} SHA-256 implementation returned an invalid digest.`);
  }
  if (actualSha256 !== expectedSha256) {
    fail('artifact-hash-mismatch', `${label} bytes do not match their immutable SHA-256 pin.`, {
      expectedSha256,
      actualSha256,
      path,
    });
  }
  return { bytes, sha256: actualSha256, byteLength: bytes.byteLength, path };
}

function verifyManifest(manifest, request) {
  if (manifest.format !== MANIFEST_FORMAT
    || manifest.contractFormat !== CONTRACT_FORMAT
    || manifest.contractVersion !== CONTRACT_VERSION) {
    fail('manifest-contract-mismatch', 'Impact manifest format or additive contract version is unsupported.');
  }
  if (manifest.releaseId !== request.expectedReleaseId) {
    fail('manifest-release-mismatch', 'Impact manifest releaseId does not match the caller pin.');
  }
  if (typeof manifest.modelId !== 'string' || !manifest.modelId.trim()
    || typeof manifest.modelVersion !== 'string' || !manifest.modelVersion.trim()
    || manifest.unit !== 'points-per-100-possessions'
    || manifest.predictiveEligibility !== false) {
    fail('manifest-model-metadata-invalid', 'Impact manifest must identify its model, points-per-100 unit, and non-predictive eligibility.');
  }
  if (!isObject(manifest.sourceRelease)
    || typeof manifest.sourceRelease.canonicalModelId !== 'string'
    || !manifest.sourceRelease.canonicalModelId.trim()
    || typeof manifest.sourceRelease.releaseId !== 'string'
    || !manifest.sourceRelease.releaseId.trim()
    || manifest.sourceRelease.exactSeasonsOnly !== true) {
    fail('manifest-source-release-invalid', 'Impact manifest must pin one exact-season canonical V4 source release.');
  }
  if (!isObject(manifest.identity)
    || manifest.identity.primaryKey !== 'playerRef'
    || manifest.identity.normalizer !== PLAYER_NAME_NORMALIZER) {
    fail('manifest-identity-invalid', 'Impact manifest does not declare the canonical V4 playerRef identity contract.');
  }
  requiredHash(manifest.identity.sourceNameMapSha256, 'manifest.identity.sourceNameMapSha256', 'manifest-identity-invalid');
  if (!isObject(manifest.validation)
    || manifest.validation.noProspectiveValidityClaim !== true
    || !isObject(manifest.nativeValidation)
    || manifest.nativeValidation.acceptedScope !== VALIDATION_CLAIM_SCOPE
    || manifest.nativeValidation.doesNotValidateIndividualPlayerRanksOrOptimizerCounterfactuals !== true) {
    fail('validation-claim-invalid', 'Impact manifest validation must be limited to historical conditional observed-lineup evaluation.');
  }
  if (!Array.isArray(manifest.seasons)) fail('manifest-seasons-invalid', 'Impact manifest seasons must be an array.');
}

function selectSeason(manifest, request) {
  const matches = manifest.seasons.filter((season) => (
    isObject(season)
    && season.seasonStartYear === request.seasonStartYear
    && season.phase === request.phase
  ));
  if (matches.length === 0) fail('season-unavailable', 'The manifest has no exact requested regular-season artifact.');
  if (matches.length !== 1) fail('season-ambiguous', 'The manifest has multiple artifacts for the exact requested season and phase.');
  const selected = matches[0];
  if (selected.seasonEndYear !== request.seasonEndYear
    || selected.packageId !== request.packageId
    || selected.packageVersion !== request.packageVersion) {
    fail('package-scope-mismatch', 'Manifest season package ID, version, or exact-season scope differs from the request.');
  }
  if (!canonicalSeasonPackageId(selected.packageId, request.seasonStartYear)) {
    fail('package-scope-mismatch', 'Manifest season package ID is not the exact canonical V4 package for the request.');
  }
  safeRelativePath(selected.path, 'manifest season path');
  requiredHash(selected.sha256, 'manifest season sha256', 'manifest-season-pin-invalid');
  requiredByteLength(selected.bytes, 'manifest season bytes', 'manifest-season-pin-invalid');
  if (!Number.isSafeInteger(selected.records) || selected.records < 0) {
    fail('manifest-season-pin-invalid', 'Manifest season record count must be a nonnegative integer.');
  }
  if (!isObject(selected.coverage)
    || !Number.isSafeInteger(selected.coverage.numericRows)
    || selected.coverage.numericRows < 0
    || selected.coverage.numericRows > selected.records) {
    fail('manifest-season-pin-invalid', 'Manifest season coverage must pin a valid numeric row count.');
  }
  for (const field of ['limitedExposureRows', 'explicitZeroCenteredPriorRows']) {
    if (selected.coverage[field] !== undefined
      && (!Number.isSafeInteger(selected.coverage[field]) || selected.coverage[field] < 0)) {
      fail('manifest-season-pin-invalid', `Manifest season coverage ${field} must be a nonnegative integer.`);
    }
  }
  requiredHash(selected.modelSha256, 'manifest season modelSha256', 'manifest-season-pin-invalid');
  requiredHash(selected.modelVariantSha256, 'manifest season modelVariantSha256', 'manifest-season-pin-invalid');
  requiredHash(selected.crosswalkSha256, 'manifest season crosswalkSha256', 'manifest-season-pin-invalid');
  return selected;
}

function sameScope(scope, request) {
  return isObject(scope)
    && scope.kind === 'exact-season'
    && scope.seasonStartYear === request.seasonStartYear
    && scope.seasonEndYear === request.seasonEndYear
    && scope.phase === PHASE
    && scope.pooled === false;
}

function verifyPackageScope(scope, request) {
  return isObject(scope)
    && scope.kind === 'exact-season'
    && Array.isArray(scope.seasonStartYears)
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYears[0] === request.seasonStartYear
    && scope.seasonStartYear === request.seasonStartYear
    && scope.seasonEndYear === request.seasonEndYear
    && scope.pooledFitIsSeasonSpecific === true;
}

function verifySeasonArtifact(season, manifest, selected, request) {
  if (season.format !== SEASON_FORMAT
    || season.schemaVersion !== 1
    || season.artifactId !== 'player-impact'
    || season.artifactKind !== 'additive-player-coefficient-overlay'
    || season.impactReleaseId !== manifest.releaseId
    || season.contractFormat !== CONTRACT_FORMAT
    || season.contractVersion !== CONTRACT_VERSION
    || season.modelId !== manifest.modelId
    || season.modelVersion !== manifest.modelVersion) {
    fail('season-contract-mismatch', 'Season artifact format, contract, model, or release does not match the pinned manifest.');
  }
  if (!sameScope(season.scope, request)) {
    fail('season-scope-mismatch', 'Season artifact scope is not the exact requested regular season.');
  }
  if (!isObject(season.packageRef)
    || season.packageRef.modelId !== manifest.sourceRelease.canonicalModelId
    || season.packageRef.releaseId !== manifest.sourceRelease.releaseId
    || season.packageRef.packageId !== selected.packageId
    || season.packageRef.packageVersion !== selected.packageVersion
    || season.packageRef.phase !== PHASE
    || !verifyPackageScope(season.packageRef.scope, request)) {
    fail('season-package-mismatch', 'Season artifact V4 source package identity or exact-season scope does not match the manifest.');
  }
  const packageHashFields = [
    'sourceLockSha256',
    'indexSha256',
    'packageManifestSha256',
    'playerEntitiesSha256',
    'playerSeasonsSha256',
    'rosterMembershipsSha256',
    'playerGamesSha256',
    'originalPlayerImpactSha256',
  ];
  for (const field of packageHashFields) requiredHash(season.packageRef[field], `season.packageRef.${field}`, 'season-package-pin-invalid');

  if (!isObject(season.model)
    || season.model.frozenModelSha256 !== selected.modelSha256
    || season.model.modelVariantSha256 !== selected.modelVariantSha256
    || season.model.unit !== manifest.unit) {
    fail('season-model-pin-mismatch', 'Season artifact model variant or frozen model hash differs from the manifest.');
  }
  if (!isObject(season.identity)
    || season.identity.primaryKey !== 'playerRef'
    || season.identity.normalizer !== PLAYER_NAME_NORMALIZER
    || typeof season.identity.crosswalkVersion !== 'string'
    || !season.identity.crosswalkVersion.trim()
    || season.identity.crosswalkSha256 !== selected.crosswalkSha256) {
    fail('season-crosswalk-pin-mismatch', 'Season artifact crosswalk identity or hash differs from the manifest.');
  }
  if (!isObject(season.coverage)
    || !Array.isArray(season.records)
    || season.records.length !== selected.records
    || !Number.isSafeInteger(season.coverage.numericRows)
    || season.coverage.numericRows < 0
    || season.coverage.numericRows > selected.records
    || season.coverage.numericRows !== selected.coverage.numericRows) {
    fail('season-record-count-mismatch', 'Season artifact rows do not match the manifest and coverage counts.');
  }
  if (!isObject(season.validation)
    || !isObject(season.validation.conditionalLineupSourceChecks)
    || !Number.isSafeInteger(season.validation.conditionalLineupSourceChecks.passed)
    || !Number.isSafeInteger(season.validation.conditionalLineupSourceChecks.total)
    || season.validation.conditionalLineupSourceChecks.passed < 0
    || season.validation.conditionalLineupSourceChecks.total < season.validation.conditionalLineupSourceChecks.passed) {
    fail('validation-claim-invalid', 'Season artifact must report only bounded conditional-lineup source checks.');
  }
}

function assertNullConfidence(record) {
  if (!isObject(record.confidence)
    || record.confidence.offense !== null
    || record.confidence.defense !== null
    || record.confidence.combined !== null) {
    fail('confidence-claim-invalid', `${record.recordId} contains an estimated or false confidence value.`);
  }
}

function assertUnestimatedUncertainty(record) {
  const uncertainty = record.uncertainty;
  const allowedFields = new Set([
    'status', 'standardError', 'intervals', 'odCovariance', 'method', 'calibrated',
    'posteriorDraws', 'covariance', 'interval',
  ]);
  if (!isObject(uncertainty)
    || uncertainty.status !== 'not-estimated'
    || uncertainty.calibrated !== false
    || uncertainty.method !== null
    || uncertainty.odCovariance !== null
    || !Array.isArray(uncertainty.intervals)
    || uncertainty.intervals.length !== 0
    || !isObject(uncertainty.standardError)
    || uncertainty.standardError.offense !== null
    || uncertainty.standardError.defense !== null
    || uncertainty.standardError.combined !== null) {
    fail('uncertainty-claim-invalid', `${record.recordId} must declare per-player uncertainty as not estimated.`);
  }
  for (const [field, value] of Object.entries(uncertainty)) {
    if (!allowedFields.has(field)) fail('uncertainty-claim-invalid', `${record.recordId} contains unsupported uncertainty field ${field}.`);
    if (['posteriorDraws', 'covariance', 'interval'].includes(field)
      && value !== null
      && !(Array.isArray(value) && value.length === 0)) {
      fail('uncertainty-claim-invalid', `${record.recordId} must not publish per-player uncertainty estimates.`);
    }
  }
}

function assertRecordIdentity(record, seasonIdentity, selected, seenPlayerRefs, seenNameKeys, seenRecordIds) {
  if (!isObject(record.player)) fail('record-identity-invalid', 'Impact row must carry a player identity object.');
  const { player } = record;
  const playerRef = requiredText(player.playerRef, `${record.recordId || 'Impact row'}.player.playerRef`, 'identity-unresolved');
  const playerNameKey = requiredText(player.playerNameKey, `${record.recordId || playerRef}.playerNameKey`, 'identity-unresolved');
  requiredText(player.sourceDisplayName, `${record.recordId || playerRef}.sourceDisplayName`, 'identity-unresolved');
  if (player.canonicalDisplayName !== null) requiredText(player.canonicalDisplayName, `${record.recordId || playerRef}.canonicalDisplayName`, 'identity-unresolved');
  if (!isObject(player.identityMatch)) fail('identity-unresolved', `${playerRef} has no identity crosswalk receipt.`);
  const status = player.identityMatch.status;
  const method = player.identityMatch.method;
  const validPair = (status === 'unique-exact-name-match' && method === 'exact-normalized-name')
    || (status === 'unique-reviewed-alias-match' && typeof method === 'string' && method.trim().length > 0);
  if (!validPair) fail('identity-ambiguous', `${playerRef} does not have one supported unique identity match.`);
  if (player.identityMatch.crosswalkVersion !== seasonIdentity.crosswalkVersion
    || player.identityMatch.crosswalkSha256 !== selected.crosswalkSha256) {
    fail('identity-crosswalk-mismatch', `${playerRef} identity match does not use the season's pinned crosswalk.`);
  }
  if (seenPlayerRefs.has(playerRef)) fail('duplicate-player-ref', `playerRef ${playerRef} occurs more than once in one season/phase.`);
  if (seenNameKeys.has(playerNameKey)) fail('duplicate-player-name-key', `playerNameKey ${playerNameKey} is ambiguous in one season/phase.`);
  if (typeof record.recordId !== 'string' || !record.recordId.trim() || seenRecordIds.has(record.recordId)) {
    fail('record-id-invalid', 'Impact record IDs must be nonempty and unique.');
  }
  seenPlayerRefs.add(playerRef);
  seenNameKeys.add(playerNameKey);
  seenRecordIds.add(record.recordId);
  return { playerRef, playerNameKey };
}

function validateRowScope(record, request) {
  if (!sameScope(record.scope, request)) {
    fail('record-scope-mismatch', `${record.recordId} does not match the exact requested regular season.`);
  }
}

function classifyRecord(record, manifest, seasonIdentity, selected, request, seenPlayerRefs, seenNameKeys, seenRecordIds) {
  if (!isObject(record)
    || record.format !== ROW_FORMAT
    || record.artifactId !== 'player-impact'
    || record.contractVersion !== CONTRACT_VERSION) {
    fail('record-contract-mismatch', 'Season artifact contains a row with an unsupported Impact contract.');
  }
  validateRowScope(record, request);
  const identity = assertRecordIdentity(
    record,
    seasonIdentity,
    selected,
    seenPlayerRefs,
    seenNameKeys,
    seenRecordIds,
  );
  const status = record.availability?.status;
  const estimateKind = record.estimateKind;
  if (status === 'not-fitted') {
    const values = record.values;
    const allValuesNull = values === null || (
      isObject(values)
      && ['offense', 'defense', 'combined'].every((field) => values[field]?.value === null)
    );
    if (estimateKind !== 'not-fitted'
      || record.availability.displayEligible !== false
      || record.exposure?.sourceDisplayEligible !== false
      || record.fit?.pairedPossessions !== 0
      || record.exposure?.pairedPossessions !== 0
      || !allValuesNull) {
      fail('unavailable-row-invalid', `${record.recordId} not-fitted row must remain explicitly unavailable with null values and zero fit exposure.`);
    }
    return { kind: 'excluded', reason: 'unavailable', playerRef: identity.playerRef };
  }
  const isPriorOnly = status === 'prior-only' || estimateKind === 'model-declared-zero-centered-ridge-prior';
  if (isPriorOnly) {
    if (status !== 'prior-only'
      || estimateKind !== 'model-declared-zero-centered-ridge-prior'
      || record.availability.displayEligible !== false
      || record.exposure?.sourceDisplayEligible !== false
      || record.fit?.priorApplied !== true
      || record.fit?.pairedPossessions !== 0
      || record.exposure?.pairedPossessions !== 0) {
      fail('prior-only-row-invalid', `${record.recordId} declares an inconsistent prior-only row.`);
    }
    return { kind: 'excluded', reason: 'prior-only', playerRef: identity.playerRef };
  }
  if (status === 'limited-exposure') {
    if (record.availability.displayEligible !== false || record.exposure?.sourceDisplayEligible !== false) {
      fail('availability-invalid', `${record.recordId} limited-exposure status conflicts with its eligibility flags.`);
    }
    return { kind: 'excluded', reason: 'limited-exposure', playerRef: identity.playerRef };
  }
  if (status !== 'available' || record.availability.displayEligible !== true || record.exposure?.sourceDisplayEligible !== true) {
    fail('availability-invalid', `${record.recordId} is not explicitly available and display eligible.`);
  }
  if (!['fitted-coefficient', 'fitted-coefficient-with-prior-season-shrinkage'].includes(estimateKind)) {
    fail('estimate-kind-invalid', `${record.recordId} is not a fitted-coefficient estimate.`);
  }
  if (!isObject(record.evidence)
    || record.evidence.kind !== 'fitted-player-coefficient'
    || record.evidence.individualEvidenceClaim !== false
    || record.evidence.individualCausalEffectClaim !== false
    || record.evidence.individualValidationClaim !== false) {
    fail('individual-evidence-claim-invalid', `${record.recordId} carries unsupported individual evidence claims.`);
  }
  assertNullConfidence(record);
  assertUnestimatedUncertainty(record);

  const values = record.values;
  const offense = values?.offense?.value;
  const defense = values?.defense?.value;
  const combined = values?.combined?.value;
  if (!isObject(values)
    || ![offense, defense, combined].every(Number.isFinite)
    || values.offense.unit !== manifest.unit
    || values.defense.unit !== manifest.unit
    || values.combined.unit !== manifest.unit
    || values.combined.formula !== 'offense + defense') {
    fail('record-values-invalid', `${record.recordId} must carry finite O/D/combined values in the contract unit.`);
  }
  const expectedCombined = offense + defense;
  if (Math.abs(combined - expectedCombined) > request.additivityTolerance) {
    fail('record-additivity-mismatch', `${record.recordId} combined value is not the stored-precision sum of offense and defense.`, {
      offense,
      defense,
      combined,
      tolerance: request.additivityTolerance,
    });
  }

  const exposure = record.exposure;
  const pairedPossessions = exposure?.pairedPossessions;
  if (!isObject(exposure)
    || !Number.isFinite(pairedPossessions)
    || pairedPossessions <= 0
    || pairedPossessions !== record.fit?.pairedPossessions
    || typeof exposure.sampleSizeTier !== 'string'
    || !exposure.sampleSizeTier.trim()) {
    fail('exposure-invalid', `${record.recordId} must have positive, finite, matching paired-possession exposure.`);
  }
  if (!isObject(record.validation)
    || record.validation.claimScope !== VALIDATION_CLAIM_SCOPE
    || record.validation.playerDisjointHoldout !== false
    || record.validation.individualEvidenceClaim !== false
    || record.validation.individualValidationClaim !== false
    || record.validation.prospectiveValidityEstablished !== false) {
    fail('validation-claim-invalid', `${record.recordId} validation scope must stay limited to chronological conditional observed lineups.`);
  }
  if (!isObject(record.model)
    || record.model.modelVersion !== manifest.modelVersion
    || record.model.currentSeasonModelSha256 !== selected.modelSha256
    || record.model.unit !== manifest.unit) {
    fail('record-model-pin-mismatch', `${record.recordId} model identity does not match its season manifest.`, { playerRef: identity.playerRef });
  }
  const sourceHashes = record.sourceHashes;
  const sourceHashFields = [
    'frozenArtifactSha256',
    'sourceDatasetSha256',
    'fitSourceSha256',
    'ridgeSourceSha256',
    'protocolSha256',
    'splitMembershipSha256',
    'validationReportSha256',
    'validationReceiptSha256',
    'v4RosterMembershipSha256',
  ];
  if (!isObject(sourceHashes)) fail('record-source-pins-missing', `${record.recordId} has no source hash passport.`);
  for (const field of sourceHashFields) requiredHash(sourceHashes[field], `${record.recordId}.sourceHashes.${field}`, 'record-source-pin-invalid');
  if (sourceHashes.playerNameMapSha256 !== manifest.identity.sourceNameMapSha256) {
    fail('record-source-pin-mismatch', `${record.recordId} player-name map hash does not match the manifest.`);
  }

  return {
    kind: 'usable',
    record: {
      recordId: record.recordId,
      player: {
        playerRef: identity.playerRef,
        playerNameKey: identity.playerNameKey,
        sourceDisplayName: record.player.sourceDisplayName,
        canonicalDisplayName: record.player.canonicalDisplayName,
        teamCode: typeof record.player.teamCode === 'string' ? record.player.teamCode : null,
        teamCodes: Array.isArray(record.player.teamCodes) ? [...record.player.teamCodes] : [],
        identityMatch: {
          status: record.player.identityMatch.status,
          method: record.player.identityMatch.method,
          crosswalkVersion: record.player.identityMatch.crosswalkVersion,
          crosswalkSha256: record.player.identityMatch.crosswalkSha256,
        },
      },
      scope: { ...record.scope },
      estimateKind,
      fit: { priorApplied: record.fit.priorApplied === true },
      values: {
        offense: { value: offense, unit: manifest.unit },
        defense: { value: defense, unit: manifest.unit },
        combined: { value: combined, unit: manifest.unit, formula: 'offense + defense' },
      },
      exposure: {
        pairedPossessions,
        sampleSizeTier: exposure.sampleSizeTier,
        sourceDisplayEligible: true,
      },
      availability: { status: 'available', displayEligible: true },
      uncertainty: { status: 'not-estimated', permittedUse: 'mean-only' },
      validation: {
        status: 'chronological-conditional-lineup-evaluation-only',
        claimScope: VALIDATION_CLAIM_SCOPE,
        individualPlayerImpactValidated: false,
        individualRanksValidated: false,
        prospectiveValidityEstablished: false,
      },
    },
  };
}

/**
 * Fetch and resolve one exact-season regular-phase Impact companion artifact.
 * All network and SHA-256 operations can be injected for deterministic tests.
 * `expectedManifestSha256` and `expectedManifestBytes` bind the manifest as an
 * immutable release; its self-reported digest is never trusted.
 */
export async function resolveCanonicalV4ImpactModel(options = {}) {
  const request = normalizeRequest(options);
  const manifestArtifact = await fetchPinnedArtifact(
    request,
    request.manifestPath,
    request.expectedManifestSha256,
    request.expectedManifestBytes,
    'Impact manifest',
  );
  const manifest = parseJsonBytes(manifestArtifact.bytes, 'Impact manifest');
  verifyManifest(manifest, request);
  const selected = selectSeason(manifest, request);
  const seasonArtifact = await fetchPinnedArtifact(
    request,
    selected.path,
    selected.sha256,
    selected.bytes,
    'Impact season artifact',
  );
  const season = parseJsonBytes(seasonArtifact.bytes, 'Impact season artifact');
  verifySeasonArtifact(season, manifest, selected, request);

  const seenPlayerRefs = new Set();
  const seenNameKeys = new Set();
  const seenRecordIds = new Set();
  const usableRecords = [];
  const excluded = { limitedExposure: 0, priorOnly: 0, unavailable: 0 };
  for (const record of season.records) {
    const result = classifyRecord(record, manifest, season.identity, selected, request, seenPlayerRefs, seenNameKeys, seenRecordIds);
    if (result.kind === 'usable') usableRecords.push(result.record);
    else if (result.reason === 'limited-exposure') excluded.limitedExposure += 1;
    else if (result.reason === 'prior-only') excluded.priorOnly += 1;
    else if (result.reason === 'unavailable') excluded.unavailable += 1;
  }
  if (season.coverage.numericRows !== usableRecords.length + excluded.limitedExposure + excluded.priorOnly) {
    fail('season-coverage-mismatch', 'Season numeric-row coverage does not match available, limited-exposure, and prior-only rows.');
  }
  for (const [coverageField, excludedCount] of [
    ['limitedExposureRows', excluded.limitedExposure],
    ['explicitZeroCenteredPriorRows', excluded.priorOnly],
  ]) {
    if (selected.coverage[coverageField] !== undefined
      && (season.coverage[coverageField] !== excludedCount || selected.coverage[coverageField] !== excludedCount)) {
      fail('season-coverage-mismatch', `Season ${coverageField} does not match the classified rows.`);
    }
  }

  const scope = {
    kind: 'exact-season',
    seasonStartYear: request.seasonStartYear,
    seasonEndYear: request.seasonEndYear,
    phase: PHASE,
    pooled: false,
  };
  const sourcePassport = {
    format: 'djhc-swishiq-v4-impact-source-passport-v1',
    immutableManifest: true,
    manifest: {
      path: manifestArtifact.path,
      sha256: manifestArtifact.sha256,
      bytes: manifestArtifact.byteLength,
      releaseId: manifest.releaseId,
      format: manifest.format,
      contractFormat: manifest.contractFormat,
      contractVersion: manifest.contractVersion,
    },
    seasonArtifact: {
      path: seasonArtifact.path,
      sha256: seasonArtifact.sha256,
      bytes: seasonArtifact.byteLength,
      records: season.records.length,
    },
    sourceRelease: {
      modelId: manifest.sourceRelease.canonicalModelId,
      releaseId: manifest.sourceRelease.releaseId,
      packageId: selected.packageId,
      packageVersion: selected.packageVersion,
      scope: { ...season.packageRef.scope },
      phase: PHASE,
      sourceLockSha256: season.packageRef.sourceLockSha256,
      indexSha256: season.packageRef.indexSha256,
      packageManifestSha256: season.packageRef.packageManifestSha256,
    },
    model: {
      modelId: manifest.modelId,
      modelVersion: manifest.modelVersion,
      modelSha256: selected.modelSha256,
      modelVariantSha256: selected.modelVariantSha256,
      crosswalkVersion: season.identity.crosswalkVersion,
      crosswalkSha256: season.identity.crosswalkSha256,
      sourceNameMapSha256: manifest.identity.sourceNameMapSha256,
    },
    validation: {
      claimScope: VALIDATION_CLAIM_SCOPE,
      playerDisjointHoldout: false,
      individualPlayerImpactValidated: false,
      individualRanksValidated: false,
      optimizerCounterfactualsValidated: false,
      prospectiveValidityEstablished: false,
    },
    uncertainty: {
      status: 'not-estimated',
      permittedUse: 'mean-only',
      confidenceScoresAvailable: false,
      intervalsAvailable: false,
    },
  };
  const lineupEvidence = {
    format: 'djhc-swishiq-v4-lineup-impact-evidence-v1',
    status: usableRecords.length ? 'available' : 'unavailable',
    scope,
    model: {
      modelId: manifest.modelId,
      modelVersion: manifest.modelVersion,
      modelSha256: selected.modelSha256,
      modelVariantSha256: selected.modelVariantSha256,
      unit: manifest.unit,
    },
    playerEvidence: usableRecords.map((record) => ({
      playerRef: record.player.playerRef,
      playerNameKey: record.player.playerNameKey,
      offensePer100: record.values.offense.value,
      defensePer100: record.values.defense.value,
      combinedPer100: record.values.combined.value,
      estimateKind: record.estimateKind,
      pairedPossessions: record.exposure.pairedPossessions,
      sampleSizeTier: record.exposure.sampleSizeTier,
      displayEligible: true,
      uncertaintyStatus: 'not-estimated',
      permittedUse: 'mean-only',
    })),
    validation: {
      status: 'chronological-conditional-lineup-evaluation-only',
      claimScope: VALIDATION_CLAIM_SCOPE,
      playerDisjointHoldout: false,
      individualPlayerImpactValidated: false,
      individualRanksValidated: false,
      optimizerCounterfactualsValidated: false,
      prospectiveValidityEstablished: false,
    },
    useBoundary: {
      playerImpactValidated: false,
      individualRanksValidated: false,
      prospectiveValidityEstablished: false,
      confidenceScoresAvailable: false,
      uncertaintyStatus: 'not-estimated',
      permittedUse: 'mean-only',
    },
    sourcePassport,
  };

  return {
    format: CANONICAL_V4_IMPACT_MODEL_RESOLVER_FORMAT,
    resolverVersion: CANONICAL_V4_IMPACT_MODEL_RESOLVER_VERSION,
    status: 'resolved',
    scope,
    v4Context: {
      format: 'djhc-swishiq-v4-impact-context-v1',
      modelId: manifest.sourceRelease.canonicalModelId,
      releaseId: manifest.sourceRelease.releaseId,
      packageId: selected.packageId,
      packageVersion: selected.packageVersion,
      scope: { ...season.packageRef.scope },
      phase: PHASE,
      impactReleaseId: manifest.releaseId,
      impactModelId: manifest.modelId,
      impactModelVersion: manifest.modelVersion,
      sourcePassport,
    },
    lineupEvidence,
    records: usableRecords,
    counts: {
      manifestRecords: season.records.length,
      usableRecords: usableRecords.length,
      excludedLimitedExposure: excluded.limitedExposure,
      excludedPriorOnly: excluded.priorOnly,
      excludedUnavailable: excluded.unavailable,
    },
  };
}

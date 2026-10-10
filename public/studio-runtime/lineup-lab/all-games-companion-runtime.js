/*
 * Runtime reader for the All Games companion in the integrated SwishIQ V4
 * site release. This source remains distinct from canonical V4 capabilities.
 */

export const ALL_GAMES_COMPANION_RUNTIME_PIN_FORMAT = 'djhc-swishiq-v4-all-games-companion-runtime-pin-v1';
export const ALL_GAMES_COMPANION_RUNTIME_PIN_VERSION = 'swishiq-v4-all-games-companion-runtime-pin-v1';
export const ALL_GAMES_COMPANION_PACKAGE_ID = 'nba-swishiq-all-games-context';
export const ALL_GAMES_COMPANION_ARTIFACT_ID = 'all-games-player-seasons';

// Exact byte/content pin for the standalone full-season dataset while it
// remains outside the canonical V4 companion registry. This does not assert
// V4 registry membership or model validation.
export const ALL_GAMES_LOCAL_PACKAGE_PIN = Object.freeze({
  format: 'djhc-lineup-lab-local-all-games-package-pin-v1',
  status: 'locally-pinned-descriptive-data',
  artifactPath: 'data/swishiq-all-games-player-seasons-v1.json',
  artifactSha256: '264c67de6f42816d19ff51b29bbe942f038413c4fadee9108fcc2efa827a7cb7',
  artifactByteLength: 12426474,
  packageId: ALL_GAMES_COMPANION_PACKAGE_ID,
  packageVersion: 'v1-4593a6019370',
  contentHash: '4593a6019370ea6b0cc4a1c9c5042570aadeb10742cd0b366ce218a3abda9922',
  sourceContextSha256: '1a2a66c4e46221e9d39d59974412ff815d95d7769a5c288cf3fd7059a213345c',
});

const HASH_RE = /^[a-f0-9]{64}$/;
const ROOT_RE = /^https?:\/\/[^/?#]+\/tools\/swishiq-studio\/data\/v4\/releases\/(v4-site-[a-f0-9]{12})\/$/;
const PACKAGE_VERSION_RE = /^v1-[a-f0-9]{12}$/;
const SEASON_START_YEARS = Object.freeze(Array.from({ length: 9 }, (_, index) => 2017 + index));
const PHASES = Object.freeze(['regular', 'playoffs']);
const COVERAGE_PHASES = Object.freeze(['playoffs', 'regular']);
const PACKAGE_FORMAT = 'djhc-lineup-lab-all-games-player-seasons-v1';
const INDEX_FORMAT = 'djhc-swishiq-v4-companion-package-index-v1';
const REGISTRY_FORMAT = 'djhc-swishiq-v4-companion-package-registry-v1';
const NBA_TEAM_CODES = Object.freeze([
  'ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);

/**
 * The reviewed site-release process supplies this pin after the companion
 * registry, index, artifact and approval receipt are included in the same
 * immutable release as all canonical packages and consumer adapters.
 */
export const ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN = Object.freeze({
  format: ALL_GAMES_COMPANION_RUNTIME_PIN_FORMAT,
  version: ALL_GAMES_COMPANION_RUNTIME_PIN_VERSION,
  status: 'unconfigured',
  releaseId: null,
  releaseRootUrl: null,
  registryPath: 'companions/registry.json',
  registrySha256: null,
  registryByteLength: null,
  registryRevisionSha256: null,
  reviewReceiptSha256: null,
  authorizationReferenceSha256: null,
  productionApproved: false,
  publicDistributionApproved: false,
  companionPackages: Object.freeze([]),
});

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('companion-json-invalid', 'The All Games companion contains a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!object(value)) fail('companion-json-invalid', 'The All Games companion contains an unsupported value.');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) fail('companion-crypto-unavailable', 'The browser cannot verify the All Games companion hashes.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) fail('companion-pin-invalid', `${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function safeReleasePath(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value)
    || value.startsWith('/') || value.includes('\\')
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('companion-pin-invalid', `${label} must be a canonical relative release path.`);
  }
  return value;
}

function expectedScopeCoverage(scopeCoverage) {
  const exact = scopeCoverage?.exact;
  if (!Array.isArray(exact?.seasonStartYears)
    || exact.seasonStartYears.length !== SEASON_START_YEARS.length
    || exact.seasonStartYears.some((year, index) => year !== SEASON_START_YEARS[index])
    || stableJson(exact.phases) !== stableJson(['regular', 'playoffs'])
    || !Array.isArray(exact.rowsBySeasonPhase)
    || exact.rowsBySeasonPhase.length !== SEASON_START_YEARS.length) return false;
  const totals = { regular: 0, playoffs: 0 };
  for (const [index, season] of exact.rowsBySeasonPhase.entries()) {
    const year = SEASON_START_YEARS[index];
    if (season?.seasonStartYear !== year
      || season.seasonLabel !== `${year}-${String(year + 1).slice(-2)}`
      || !Array.isArray(season.phases)
      || stableJson(season.phases.map(row => row?.phase)) !== stableJson(COVERAGE_PHASES)) return false;
    for (const row of season.phases) {
      const expectedTeams = row.phase === 'regular' ? 30 : 16;
      if (!Number.isSafeInteger(row.rows) || row.rows < expectedTeams
        || row.teamCount !== expectedTeams || !Array.isArray(row.teamCodes)
        || row.teamCodes.length !== expectedTeams
        || row.teamCodes.some(code => !NBA_TEAM_CODES.includes(code))
        || new Set(row.teamCodes).size !== expectedTeams
        || stableJson(row.teamCodes) !== stableJson([...row.teamCodes].sort())) return false;
      if (row.phase === 'regular' && stableJson(row.teamCodes) !== stableJson(NBA_TEAM_CODES)) return false;
      if (row.phase === 'playoffs'
        && row.teamCodes.some(code => !season.phases.find(candidate => candidate.phase === 'regular')?.teamCodes.includes(code))) return false;
      totals[row.phase] += row.rows;
    }
  }
  return scopeCoverage?.totalRowsByPhase?.regular === totals.regular
    && scopeCoverage?.totalRowsByPhase?.playoffs === totals.playoffs
    && scopeCoverage?.pooledRegularOnly?.seasonStartYears?.length === SEASON_START_YEARS.length
    && scopeCoverage.pooledRegularOnly.seasonStartYears.every((year, index) => year === SEASON_START_YEARS[index])
    && scopeCoverage.pooledRegularOnly.phase === 'regular'
    && scopeCoverage.pooledRegularOnly.rows === totals.regular
    && scopeCoverage.pooledRegularOnly.excludesPlayoffs === true
    && scopeCoverage.pooledRegularOnly.requiresExplicitAcceptance === true;
}

/**
 * Resolve the reviewed All Games companion from a separately pinned V4 site
 * release. The package never becomes a canonical V4 capability.
 */
export function resolveAllGamesCompanionPackage(releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN, {
  packageId = ALL_GAMES_COMPANION_PACKAGE_ID,
  packageVersion,
} = {}) {
  if (!object(releasePin)
    || releasePin.format !== ALL_GAMES_COMPANION_RUNTIME_PIN_FORMAT
    || releasePin.version !== ALL_GAMES_COMPANION_RUNTIME_PIN_VERSION
    || releasePin.status !== 'reviewed') {
    fail('companion-release-pin-unavailable', 'The reviewed All Games companion release pin is not configured.');
  }
  const rootMatch = typeof releasePin.releaseRootUrl === 'string' ? releasePin.releaseRootUrl.match(ROOT_RE) : null;
  if (!rootMatch || releasePin.releaseId !== rootMatch[1]) {
    fail('companion-release-pin-invalid', 'The All Games companion pin must identify the immutable V4 release root.');
  }
  if (releasePin.registryPath !== 'companions/registry.json') {
    fail('companion-release-pin-invalid', 'The All Games companion registry must use the reviewed companions/registry.json path.');
  }
  requireHash(releasePin.registrySha256, 'registrySha256');
  if (!Number.isSafeInteger(releasePin.registryByteLength) || releasePin.registryByteLength < 1) {
    fail('companion-release-pin-invalid', 'registryByteLength must be a positive integer.');
  }
  requireHash(releasePin.registryRevisionSha256, 'registryRevisionSha256');
  requireHash(releasePin.reviewReceiptSha256, 'reviewReceiptSha256');
  requireHash(releasePin.authorizationReferenceSha256, 'authorizationReferenceSha256');
  if (releasePin.productionApproved !== true || releasePin.publicDistributionApproved !== true) {
    fail('companion-approval-unavailable', 'The All Games companion lacks production and public-distribution approval.');
  }
  if (!Array.isArray(releasePin.companionPackages) || !releasePin.companionPackages.length) {
    fail('companion-release-pin-invalid', 'The reviewed V4 site release does not declare companion packages.');
  }
  const candidates = releasePin.companionPackages.filter(entry => entry?.packageId === packageId);
  if (candidates.length !== 1) fail('companion-release-pin-invalid', 'The site release must contain one unique All Games companion entry.');
  const entry = candidates[0];
  if (entry.packageVersion !== packageVersion && packageVersion !== undefined) {
    fail('companion-release-pin-mismatch', 'The requested All Games package version differs from the reviewed companion pin.');
  }
  if (!PACKAGE_VERSION_RE.test(String(entry.packageVersion || ''))
    || entry.contractFormat !== PACKAGE_FORMAT || entry.contractSchemaVersion !== 1
    || entry.nativeV4CapabilityId !== null) {
    fail('companion-release-pin-invalid', 'The companion package identity or separate capability boundary is invalid.');
  }
  safeReleasePath(entry.indexPath, 'indexPath');
  safeReleasePath(entry.artifactPath, 'artifactPath');
  requireHash(entry.indexSha256, 'indexSha256');
  requireHash(entry.indexContentSha256, 'indexContentSha256');
  if (!Number.isSafeInteger(entry.indexByteLength) || entry.indexByteLength < 1) {
    fail('companion-release-pin-invalid', 'indexByteLength must be a positive integer.');
  }
  requireHash(entry.artifactSha256, 'artifactSha256');
  if (!Number.isSafeInteger(entry.artifactByteLength) || entry.artifactByteLength < 1) {
    fail('companion-release-pin-invalid', 'artifactByteLength must be a positive integer.');
  }
  requireHash(entry.embeddedContentHash, 'embeddedContentHash');
  requireHash(entry.sourceContextSha256, 'sourceContextSha256');
  if (!expectedScopeCoverage(entry.scopeCoverage)) {
    fail('companion-release-pin-invalid', 'The companion pin must declare complete exact 2017–2025 season-phase/team coverage and a separately accepted regular-only pooled view.');
  }
  return Object.freeze({
    releaseId: releasePin.releaseId,
    releaseRootUrl: releasePin.releaseRootUrl,
    registryUrl: new URL(releasePin.registryPath, releasePin.releaseRootUrl).toString(),
    registrySha256: releasePin.registrySha256,
    registryByteLength: releasePin.registryByteLength,
    registryRevisionSha256: releasePin.registryRevisionSha256,
    reviewReceiptSha256: releasePin.reviewReceiptSha256,
    authorizationReferenceSha256: releasePin.authorizationReferenceSha256,
    entry: deepFreeze(JSON.parse(JSON.stringify(entry))),
  });
}

async function fetchPinnedBytes(fetchImpl, url, sha256Pin, byteLengthPin, label) {
  let response;
  try { response = await fetchImpl(url, { cache: 'no-store' }); }
  catch { fail('companion-fetch-failed', `The pinned All Games ${label} could not be fetched.`); }
  if (!response?.ok) fail('companion-fetch-failed', `The pinned All Games ${label} could not be loaded (${response?.status || 'network error'}).`);
  let bytes;
  try { bytes = await response.arrayBuffer(); }
  catch { fail('companion-fetch-failed', `The pinned All Games ${label} response could not be read as bytes.`); }
  if (bytes.byteLength !== byteLengthPin || await sha256(bytes) !== sha256Pin) {
    fail('companion-byte-pin-mismatch', `The All Games ${label} bytes differ from the reviewed release pin.`);
  }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('companion-json-invalid', `The pinned All Games ${label} is not valid UTF-8 JSON.`); }
  return { value, bytes };
}

function actualCoverage(packageValue) {
  const bySeason = new Map(SEASON_START_YEARS.map(year => [year, {
    seasonStartYear: year,
    seasonLabel: `${year}-${String(year + 1).slice(-2)}`,
    phases: Object.fromEntries(COVERAGE_PHASES.map(phase => [phase, { rows: 0, teamCodes: new Set() }])),
  }]));
  for (const row of packageValue.records) {
    if (!Number.isSafeInteger(row?.seasonStartYear) || !Number.isSafeInteger(row?.seasonEndYear)
      || row.seasonEndYear !== row.seasonStartYear + 1 || !PHASES.includes(row.phase)
      || !NBA_TEAM_CODES.includes(row.teamCode)) {
      fail('companion-record-invalid', 'An All Games record has invalid season, phase or team coverage.');
    }
    const season = bySeason.get(row.seasonStartYear);
    if (!season) fail('companion-record-invalid', 'An All Games record is outside the reviewed exact-season scope.');
    season.phases[row.phase].rows += 1;
    season.phases[row.phase].teamCodes.add(row.teamCode);
  }
  const rowsBySeasonPhase = [...bySeason.values()].map(season => ({
    seasonStartYear: season.seasonStartYear,
    seasonLabel: season.seasonLabel,
    phases: COVERAGE_PHASES.map(phase => {
      const result = season.phases[phase];
      const teamCodes = [...result.teamCodes].sort();
      if (result.rows < 1 || teamCodes.length !== (phase === 'regular' ? 30 : 16)) {
        fail('companion-coverage-incomplete', `All Games ${season.seasonLabel} ${phase} coverage is incomplete.`);
      }
      return { phase, rows: result.rows, teamCount: teamCodes.length, teamCodes };
    }),
  }));
  const totals = { regular: 0, playoffs: 0 };
  for (const season of rowsBySeasonPhase) for (const phase of season.phases) totals[phase.phase] += phase.rows;
  return {
    exact: { seasonStartYears: [...SEASON_START_YEARS], phases: ['regular', 'playoffs'], rowsBySeasonPhase },
    pooledRegularOnly: {
      seasonStartYears: [...SEASON_START_YEARS],
      phase: 'regular',
      rows: totals.regular,
      excludesPlayoffs: true,
      requiresExplicitAcceptance: true,
    },
    totalRowsByPhase: totals,
  };
}

/** Load and verify the separately pinned registry and exact-coverage index. */
export async function loadAllGamesCompanionIndex({
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  packageId = ALL_GAMES_COMPANION_PACKAGE_ID,
  packageVersion,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('companion-fetch-unavailable', 'The All Games companion fetcher is unavailable.');
  const resolved = resolveAllGamesCompanionPackage(releasePin, { packageId, packageVersion });
  const cacheKey = [resolved.releaseId, resolved.releaseRootUrl, resolved.registrySha256,
    resolved.registryRevisionSha256, resolved.reviewReceiptSha256,
    resolved.authorizationReferenceSha256, resolved.entry.indexSha256].join('|');
  const cached = indexPromises.get(cacheKey);
  if (cached) return cached;
  const loading = (async () => {
    const registryResult = await fetchPinnedBytes(fetchImpl, resolved.registryUrl,
      resolved.registrySha256, resolved.registryByteLength, 'companion registry');
    const registry = registryResult.value;
    if (!object(registry) || registry.format !== REGISTRY_FORMAT
      || registry.schemaVersion?.major !== 1 || registry.schemaVersion?.minor !== 0
      || registry.registryRevisionSha256 !== resolved.registryRevisionSha256) {
      fail('companion-registry-invalid', 'The All Games companion registry identity or revision pin is invalid.');
    }
    const registryWithoutHash = { ...registry };
    delete registryWithoutHash.registryRevisionSha256;
    if (await sha256(new TextEncoder().encode(stableJson(registryWithoutHash))) !== resolved.registryRevisionSha256) {
      fail('companion-registry-invalid', 'The All Games companion registry revision hash does not verify.');
    }
    const registryEntries = Array.isArray(registry.companionPackages)
      ? registry.companionPackages.filter(row => row?.packageId === packageId) : [];
    if (registryEntries.length !== 1) fail('companion-registry-invalid', 'The pinned companion registry must contain one unique All Games package.');
    const entry = resolved.entry;
    const registryEntry = registryEntries[0];
    for (const key of ['packageId', 'packageVersion', 'contractFormat', 'contractSchemaVersion', 'indexPath', 'indexSha256',
      'indexByteLength', 'indexContentSha256', 'artifactPath', 'artifactSha256', 'artifactByteLength', 'embeddedContentHash',
      'sourceContextSha256', 'nativeV4CapabilityId']) {
      if (registryEntry[key] !== entry[key]) fail('companion-registry-pin-mismatch', `The All Games registry differs from its site release pin at ${key}.`);
    }
    if (registryEntry.nativeV4CapabilityId !== null || stableJson(registryEntry.scopeCoverage) !== stableJson(entry.scopeCoverage)) {
      fail('companion-registry-pin-mismatch', 'The All Games registry changes the separate capability or scope contract.');
    }
    const indexUrl = new URL(entry.indexPath, resolved.releaseRootUrl).toString();
    const indexResult = await fetchPinnedBytes(fetchImpl, indexUrl, entry.indexSha256, entry.indexByteLength, 'companion index');
    const index = indexResult.value;
    if (!object(index) || index.format !== INDEX_FORMAT
      || index.schemaVersion?.major !== 1 || index.schemaVersion?.minor !== 0
      || index.packageId !== entry.packageId || index.packageVersion !== entry.packageVersion
      || index.contract?.format !== entry.contractFormat || index.contract?.schemaVersion !== entry.contractSchemaVersion
      || index.indexContentSha256 !== entry.indexContentSha256) {
      fail('companion-index-invalid', 'The All Games companion index identity or contract is invalid.');
    }
    const indexWithoutHash = { ...index };
    delete indexWithoutHash.indexContentSha256;
    if (await sha256(new TextEncoder().encode(stableJson(indexWithoutHash))) !== entry.indexContentSha256) {
      fail('companion-index-invalid', 'The All Games companion index content hash does not verify.');
    }
    if (index.artifact?.artifactId !== ALL_GAMES_COMPANION_ARTIFACT_ID
      || index.artifact?.path !== entry.artifactPath || index.artifact?.sha256 !== entry.artifactSha256
      || index.artifact?.byteLength !== entry.artifactByteLength
      || index.artifact?.embeddedContentHash !== entry.embeddedContentHash
      || index.artifact?.sourceContextSha256 !== entry.sourceContextSha256
      || index.artifact?.recordCount !== entry.scopeCoverage.totalRowsByPhase.regular + entry.scopeCoverage.totalRowsByPhase.playoffs
      || stableJson(index.scopeCoverage) !== stableJson(entry.scopeCoverage)
      || index.access?.nativeV4CapabilityId !== null) {
      fail('companion-index-pin-mismatch', 'The All Games companion index differs from the reviewed release pin.');
    }
    return Object.freeze({
      resolved,
      index: deepFreeze(index),
      scopeCoverage: deepFreeze(entry.scopeCoverage),
      release: Object.freeze({
        releaseId: resolved.releaseId,
        releaseRootUrl: resolved.releaseRootUrl,
        reviewReceiptSha256: resolved.reviewReceiptSha256,
        authorizationReferenceSha256: resolved.authorizationReferenceSha256,
        registrySha256: resolved.registrySha256,
        registryRevisionSha256: resolved.registryRevisionSha256,
        indexSha256: entry.indexSha256,
        indexContentSha256: entry.indexContentSha256,
        artifactSha256: entry.artifactSha256,
        artifactByteLength: entry.artifactByteLength,
        embeddedContentHash: entry.embeddedContentHash,
        sourceContextSha256: entry.sourceContextSha256,
        entry: Object.freeze({
          indexSha256: entry.indexSha256,
          artifactSha256: entry.artifactSha256,
        }),
      }),
    });
  })().catch(error => {
    indexPromises.delete(cacheKey);
    throw error;
  });
  indexPromises.set(cacheKey, loading);
  return loading;
}

/** Load and verify registry, index, approval pin, raw bytes and embedded content. */
export async function loadAllGamesCompanionPackage({
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  packageId = ALL_GAMES_COMPANION_PACKAGE_ID,
  packageVersion,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('companion-fetch-unavailable', 'The All Games companion fetcher is unavailable.');
  const indexProof = await loadAllGamesCompanionIndex({ releasePin, packageId, packageVersion, fetchImpl });
  const { resolved, index } = indexProof;
  const entry = resolved.entry;
  const cacheKey = [resolved.releaseId, resolved.releaseRootUrl, resolved.registrySha256,
    resolved.registryRevisionSha256, resolved.reviewReceiptSha256,
    resolved.authorizationReferenceSha256, entry.indexSha256, entry.artifactSha256].join('|');
  const cached = packagePromises.get(cacheKey);
  if (cached) return cached;
  const loading = (async () => {
    const artifactUrl = new URL(entry.artifactPath, resolved.releaseRootUrl).toString();
    const artifactResult = await fetchPinnedBytes(fetchImpl, artifactUrl, entry.artifactSha256, entry.artifactByteLength, 'player-season artifact');
    const packageValue = artifactResult.value;
    if (!object(packageValue) || packageValue.format !== PACKAGE_FORMAT || packageValue.schemaVersion !== 1
      || packageValue.packageId !== entry.packageId || packageValue.packageVersion !== entry.packageVersion
      || packageValue.contentHash !== entry.embeddedContentHash
      || packageValue.source?.sourceContextSha256 !== entry.sourceContextSha256
      || !Array.isArray(packageValue.records)
      || packageValue.scope?.kind !== 'exact-season'
      || packageValue.scope?.seasonEndYear !== 2026
      || packageValue.coverage?.records !== entry.scopeCoverage.totalRowsByPhase.regular + entry.scopeCoverage.totalRowsByPhase.playoffs
      || packageValue.coverage?.seasons !== SEASON_START_YEARS.length
      || packageValue.coverage?.teams !== 30
      || packageValue.coverage?.phases?.regular !== entry.scopeCoverage.totalRowsByPhase.regular
      || packageValue.coverage?.phases?.playoffs !== entry.scopeCoverage.totalRowsByPhase.playoffs
      || stableJson(packageValue.scope?.seasonStartYears) !== stableJson(SEASON_START_YEARS)
      || stableJson([...(packageValue.scope?.phases || [])].sort()) !== stableJson([...PHASES].sort())) {
      fail('companion-artifact-invalid', 'The All Games companion artifact identity or embedded source pin is invalid.');
    }
    const embeddedHash = await sha256(new TextEncoder().encode(stableJson({
      packageId: packageValue.packageId,
      scope: packageValue.scope,
      records: packageValue.records,
    })));
    if (embeddedHash !== entry.embeddedContentHash) fail('companion-content-hash-mismatch', 'The All Games embedded contentHash does not verify.');
    const coverage = actualCoverage(packageValue);
    if (packageValue.records.length !== index.artifact.recordCount
      || stableJson(coverage) !== stableJson(entry.scopeCoverage)
      || stableJson(coverage) !== stableJson(index.scopeCoverage)) {
      fail('companion-coverage-mismatch', 'The All Games artifact rows differ from the exact season/phase coverage pin.');
    }
    return Object.freeze({
      ...packageValue,
      release: indexProof.release,
      scopeCoverage: deepFreeze(coverage),
      coverage: deepFreeze(coverage),
    });
  })().catch(error => {
    packagePromises.delete(cacheKey);
    throw error;
  });
  packagePromises.set(cacheKey, loading);
  return loading;
}

const packagePromises = new Map();
const indexPromises = new Map();

/** Resolve a single exact season/phase or the expressly accepted pooled regular view. */
export async function loadAllGamesCompanionRecords({
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  seasonStartYear,
  phase = 'regular',
  acceptPooled = false,
  packageVersion,
  fetchImpl,
} = {}) {
  const packageValue = await loadAllGamesCompanionPackage({ releasePin, packageVersion, fetchImpl });
  if (acceptPooled === true) {
    if (phase !== 'regular' || seasonStartYear !== undefined) {
      fail('companion-scope-invalid', 'The pooled All Games view is regular-season-only and cannot carry an exact season.');
    }
    const years = packageValue.scopeCoverage.pooledRegularOnly.seasonStartYears;
    const records = packageValue.records.filter(row => years.includes(row.seasonStartYear) && row.phase === 'regular');
    if (records.length !== packageValue.scopeCoverage.pooledRegularOnly.rows) {
      fail('companion-coverage-incomplete', 'The explicitly accepted All Games pooled regular view is incomplete.');
    }
    return Object.freeze({
      package: packageValue,
      records: Object.freeze(records),
      scope: Object.freeze({ kind: 'pooled-window', seasonStartYears: Object.freeze([...years]), phases: Object.freeze(['regular']) }),
      explicitPooledAcceptance: true,
    });
  }
  if (!Number.isSafeInteger(seasonStartYear) || !SEASON_START_YEARS.includes(seasonStartYear)
    || !['regular', 'playoffs'].includes(phase)) {
    fail('companion-scope-invalid', 'Select one exact supported All Games season and regular/playoffs phase.');
  }
  const rows = packageValue.records.filter(row => row.seasonStartYear === seasonStartYear && row.phase === phase);
  if (!rows.length) fail('companion-coverage-incomplete', 'The selected exact All Games season and phase has no verified rows.');
  return Object.freeze({
    package: packageValue,
    records: Object.freeze(rows),
    scope: Object.freeze({ kind: 'exact-season', seasonStartYears: Object.freeze([seasonStartYear]), phases: Object.freeze([phase]) }),
    explicitPooledAcceptance: false,
  });
}

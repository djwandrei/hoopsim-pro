import { createHash } from 'node:crypto';

/**
 * The static public boundary for SwishIQ packages.
 *
 * This module intentionally has no database, network, candidate-package, or
 * legacy-adapter dependency. It describes only an accepted production
 * projection that may be placed beneath the public SwishIQ Studio directory.
 */
export const SWISHIQ_PUBLIC_REGISTRY_FORMAT = 'djhc-swishiq-public-registry-v1';
export const SWISHIQ_PUBLIC_REGISTRY_VERSION = 'swishiq-public-registry-v1';
export const SWISHIQ_PUBLIC_PROJECTION_FORMAT = 'djhc-swishiq-public-projection-v1';
export const SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT = 'djhc-swishiq-public-projection-part-v1';
export const SWISHIQ_PUBLIC_MODEL_ID = 'swishiq-v3';
export const SWISHIQ_PUBLIC_NORMALIZER = 'swishiq-v3-canonical-normalizer';
export const SWISHIQ_PUBLIC_METRICS = 'swishiq-v3-metrics-v1.2';
export const SWISHIQ_PUBLIC_V3_METRICS_VERSIONS = Object.freeze([
  SWISHIQ_PUBLIC_METRICS,
]);
export const SWISHIQ_PUBLIC_MODEL_CONTRACTS = Object.freeze({
  'swishiq-v3': Object.freeze({ normalizer: SWISHIQ_PUBLIC_NORMALIZER, metricsVersion: SWISHIQ_PUBLIC_METRICS, packageVersionPrefix: 'v3' }),
});
export const SWISHIQ_PUBLIC_PLAYER_REF = /^p_[a-f0-9]{32}$/;
export const SWISHIQ_PUBLIC_ROSTER_REF = /^r_[a-f0-9]{32}$/;
export const SWISHIQ_PUBLIC_PHASES = Object.freeze([
  'regular',
  'in_season_tournament',
  'play_in',
  'playoffs',
]);
export const SWISHIQ_PUBLIC_TEAM_CODES = Object.freeze([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
export const SWISHIQ_PUBLIC_CAPABILITIES = Object.freeze([
  'swishiqStudio',
  'lineupLab',
  'publicAdvancedImpact',
  'chemistry',
  'shotProfile',
  'playType',
  'historicalSeason',
  'seasonSimulation',
  'compositeRecipe',
  'compositeSimulation',
  'careerHistory',
  'careerSimulation',
  'crossEraGames',
  'challengePools',
  'franchise',
  'commissioner',
  'probabilities',
  'virtualPacks',
  'collector',
]);
export const SWISHIQ_PUBLIC_ARTIFACT_KINDS = Object.freeze([
  'roster-memberships',
  'lineup-evidence',
  'exact-five-evidence',
  'player-impact',
  'players',
  'player-seasons',
  'career-lookup',
  'career-history',
  'skill-components',
  'chemistry',
  'schedule',
  'team-styles',
  'era-baselines',
  'career-transitions',
  'challenge-pools',
  'rules',
  'boards',
]);

const HASH = /^[a-f0-9]{64}$/;
const PACKAGE_ID = /^nba-swishiq-v3-\d{4}-\d{2}$/;
const PACKAGE_VERSION = /^v3-\d{4}-\d{2}-[a-f0-9]{12}$/;
const ARTIFACT_ID = /^[a-z][a-z0-9-]{1,63}$/;
const RELATIVE_JSON_PATH = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.json$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const UUID_IN_TEXT = /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;
const PRIVATE_FIELD = /provider|canonical|crosswalk|mapping|archive|coefficient|rapm|raw|private|secret|token|password|identitysource|positionsource|reviewedby|source(?!locksha256$)|(?:^|[_-])(?:player|team|game)id$|(?:^|[_-])(?:path|url|uri|href)$/i;
const PUBLIC_EVIDENCE_NOTE = /^(?:sourceNote|sourceNotes)$/;
const PUBLIC_EVIDENCE_TEXT_MAX = 320;
const PUBLIC_EVIDENCE_NOTES_MAX = 8;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;
const CAPABILITY_SET = new Set(SWISHIQ_PUBLIC_CAPABILITIES);
const ARTIFACT_KIND_SET = new Set(SWISHIQ_PUBLIC_ARTIFACT_KINDS);
const PHASE_SET = new Set(SWISHIQ_PUBLIC_PHASES);
const TEAM_SET = new Set(SWISHIQ_PUBLIC_TEAM_CODES);
// Public consumers receive the normalized role set used by the constrained
// optimizer. Source-specific hybrid labels are resolved privately into one or
// more of these roles before projection.
const ROLE_SET = new Set(['G', 'F', 'C']);
const MAX_INDEX_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export class SwishIqStaticProjectionError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SwishIqStaticProjectionError';
    this.issues = [...(issues.length ? issues : [message])];
  }
}

function fail(message, issues = []) {
  throw new SwishIqStaticProjectionError(message, issues);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, allowed, label) {
  if (!plainObject(value)) fail(label + ' must be a plain object.');
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length) fail(label + ' contains unsupported field(s): ' + unexpected.join(', ') + '.');
}

function nonemptyText(value, label, pattern = null, { lower = false, max = 240 } = {}) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(label + ' is invalid.');
  const normalized = lower ? value.trim().toLowerCase() : value.trim();
  if (pattern && !pattern.test(normalized)) fail(label + ' is invalid.');
  return normalized;
}

function hash(value, label) {
  return nonemptyText(value, label, HASH, { lower: true, max: 64 });
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label + ' is invalid.');
  return value;
}

function instant(value, label) {
  const normalized = nonemptyText(value, label, ISO_INSTANT, { max: 40 });
  if (!Number.isFinite(Date.parse(normalized))) fail(label + ' is invalid.');
  return normalized;
}

export function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'Non-finite JSON number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const values = [];
    for (let index = 0; index < value.length; index += 1) {
      assert(Object.hasOwn(value, index), 'Sparse JSON array.');
      values.push(stableJson(value[index]));
    }
    return '[' + values.join(',') + ']';
  }
  assert(plainObject(value), 'Expected a plain JSON value.');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

export function sha256Text(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function sha256Bytes(value) {
  if (!(typeof value === 'string' || value instanceof Uint8Array)) {
    fail('Hash input must be text or bytes.');
  }
  return createHash('sha256').update(value).digest('hex');
}

function omit(value, field) {
  const result = { ...value };
  delete result[field];
  return result;
}

export function projectionContentSha256(value) {
  return sha256Text(stableJson(omit(value, 'contentSha256')));
}

export function registryRevisionSha256(value) {
  return sha256Text(stableJson(omit(value, 'registryRevisionSha256')));
}

export function makeSwishIqPublicScope(seasonStartYears, phases = SWISHIQ_PUBLIC_PHASES) {
  if (!Array.isArray(seasonStartYears) || !seasonStartYears.length || seasonStartYears.length > 100) {
    fail('Scope requires one or more season start years.');
  }
  const years = seasonStartYears.map(year => integer(Number(year), 'Scope season start year', { min: 1947, max: 2200 }));
  if (new Set(years).size !== years.length) fail('Scope contains repeated season start years.');
  years.sort((left, right) => left - right);
  if (years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    fail('Pooled SwishIQ windows must be contiguous.');
  }
  if (!Array.isArray(phases) || !phases.length || new Set(phases).size !== phases.length) {
    fail('Scope phases are invalid.');
  }
  const normalizedPhases = phases.map(phase => nonemptyText(phase, 'Scope phase', null, { lower: true, max: 40 }));
  if (normalizedPhases.some(phase => !PHASE_SET.has(phase))) fail('Scope contains an unsupported phase.');
  return {
    kind: years.length === 1 ? 'exact-season' : 'pooled-window',
    seasonStartYears: years,
    seasonStartYear: years[0],
    seasonEndYear: years.at(-1) + 1,
    phases: SWISHIQ_PUBLIC_PHASES.filter(phase => normalizedPhases.includes(phase)),
    pooledFitIsSeasonSpecific: years.length === 1,
  };
}

function normalizeScope(value, label = 'scope') {
  exactKeys(value, ['kind', 'seasonStartYears', 'seasonStartYear', 'seasonEndYear', 'phases', 'pooledFitIsSeasonSpecific'], label);
  const expected = makeSwishIqPublicScope(value.seasonStartYears, value.phases);
  if (stableJson(value) !== stableJson(expected)) fail(label + ' is not canonical.');
  return expected;
}

export function swishIqScopeLabel(scope) {
  const normalized = normalizeScope(scope);
  return String(normalized.seasonStartYear) + '-' + String(normalized.seasonEndYear).slice(-2);
}

export function expectedSwishIqPackageId(scope, modelId = SWISHIQ_PUBLIC_MODEL_ID) {
  const model = nonemptyText(modelId, 'package ID modelId', /^swishiq-v3$/, { lower: true, max: 40 });
  if (!SWISHIQ_PUBLIC_MODEL_CONTRACTS[model]) fail('Package ID modelId is unsupported.');
  return 'nba-' + model + '-' + swishIqScopeLabel(scope);
}

export function makeSwishIqPackageVersion({ scope, sourceLockSha256, modelId = SWISHIQ_PUBLIC_MODEL_ID, metricsVersion = null } = {}) {
  const normalizedScope = normalizeScope(scope);
  const model = nonemptyText(modelId, 'package version modelId', null, { lower: true, max: 40 });
  const contract = SWISHIQ_PUBLIC_MODEL_CONTRACTS[model];
  if (!contract) fail('Package version modelId is unsupported.');
  const sourceLockDigest = hash(sourceLockSha256, 'sourceLockSha256');
  const selectedMetricsVersion = metricsVersion ?? contract.metricsVersion;
  const supportedMetricsVersions = SWISHIQ_PUBLIC_V3_METRICS_VERSIONS;
  if (!supportedMetricsVersions.includes(selectedMetricsVersion)) {
    fail('Package version metricsVersion is unsupported.');
  }
  const versionDigest = createHash('sha256').update([
    model,
    sourceLockDigest,
    contract.normalizer,
    selectedMetricsVersion,
  ].join('|'), 'utf8').digest('hex');
  return contract.packageVersionPrefix + '-' + swishIqScopeLabel(normalizedScope) + '-'
    + versionDigest.slice(0, 12);
}

function normalizePackagePins(value, label) {
  const scope = normalizeScope(value.scope, label + ' scope');
  const packageId = nonemptyText(value.packageId, label + ' packageId', PACKAGE_ID, { lower: true, max: 80 });
  const sourceLockSha256 = hash(value.sourceLockSha256, label + ' sourceLockSha256');
  const packageVersion = nonemptyText(value.packageVersion, label + ' packageVersion', PACKAGE_VERSION, { lower: true, max: 120 });
  const modelId = nonemptyText(value.modelId, label + ' modelId', null, { lower: true, max: 40 });
  const modelContract = SWISHIQ_PUBLIC_MODEL_CONTRACTS[modelId];
  if (!modelContract) fail(label + ' modelId is unsupported.');
  const result = {
    packageId,
    packageVersion,
    packageManifestSha256: hash(value.packageManifestSha256, label + ' packageManifestSha256'),
    sourceLockSha256,
    modelId,
    normalizer: nonemptyText(value.normalizer, label + ' normalizer', null, { max: 100 }),
    metricsVersion: nonemptyText(value.metricsVersion, label + ' metricsVersion', null, { max: 100 }),
    scope,
  };
  const supportedMetricsVersions = modelId === 'swishiq-v3'
    ? SWISHIQ_PUBLIC_V3_METRICS_VERSIONS
    : [modelContract.metricsVersion];
  if (result.normalizer !== modelContract.normalizer || !supportedMetricsVersions.includes(result.metricsVersion))
    fail(label + ' normalizer or metricsVersion does not match its model contract.');
  if (result.packageId !== expectedSwishIqPackageId(scope, modelId)) fail(label + ' packageId does not match its model and scope.');
  if (result.packageVersion !== makeSwishIqPackageVersion({ scope, sourceLockSha256, modelId, metricsVersion: result.metricsVersion })) {
    fail(label + ' packageVersion is not bound to the source lock.');
  }
  return result;
}

function relativeJsonPath(value, label) {
  const normalized = nonemptyText(value, label, RELATIVE_JSON_PATH, { lower: true, max: 360 });
  if (normalized !== value.trim() || normalized.includes('..') || normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('%')) {
    fail(label + ' is not safe.');
  }
  return normalized;
}

function expectedProjectionIndexPath(pins) {
  return 'packages/' + pins.packageId + '/' + pins.packageVersion + '/index.json';
}

function normalizeArtifacts(value, { requireCanonical = true } = {}) {
  if (!Array.isArray(value) || !value.length || value.length > 10_000) fail('Projection artifacts are invalid.');
  const artifacts = value.map((artifact, index) => {
    exactKeys(artifact, ['artifactId', 'kind', 'path', 'bytes', 'sha256', 'rows'], 'artifact ' + String(index + 1));
    const result = {
      artifactId: nonemptyText(artifact.artifactId, 'artifact ' + String(index + 1) + ' artifactId', ARTIFACT_ID, { lower: true, max: 64 }),
      kind: nonemptyText(artifact.kind, 'artifact ' + String(index + 1) + ' kind', null, { lower: true, max: 64 }),
      path: relativeJsonPath(artifact.path, 'artifact ' + String(index + 1) + ' path'),
      bytes: integer(artifact.bytes, 'artifact ' + String(index + 1) + ' bytes', { min: 1, max: MAX_ARTIFACT_BYTES }),
      sha256: hash(artifact.sha256, 'artifact ' + String(index + 1) + ' sha256'),
      rows: integer(artifact.rows, 'artifact ' + String(index + 1) + ' rows', { min: 0, max: 200_000_000 }),
    };
    if (!ARTIFACT_KIND_SET.has(result.kind)) fail('artifact ' + String(index + 1) + ' kind is unsupported.');
    return result;
  });
  const ids = new Set();
  const paths = new Set();
  for (const artifact of artifacts) {
    if (ids.has(artifact.artifactId)) fail('Projection artifacts repeat an artifactId.');
    if (paths.has(artifact.path.toLowerCase())) fail('Projection artifacts repeat or case-collide on a path.');
    ids.add(artifact.artifactId);
    paths.add(artifact.path.toLowerCase());
  }
  const ordered = [...artifacts].sort((left, right) => left.path.localeCompare(right.path) || left.artifactId.localeCompare(right.artifactId));
  if (requireCanonical && stableJson(value) !== stableJson(ordered)) fail('Projection artifacts are not in canonical order.');
  return ordered;
}

function normalizeCapabilities(value, artifactIds, { modelId = null, metricsVersion = null } = {}) {
  if (!plainObject(value)) fail('Projection capabilities are invalid.');
  const keys = Object.keys(value).sort();
  const capabilityNames = SWISHIQ_PUBLIC_CAPABILITIES;
  const expectedKeys = [...capabilityNames].sort();
  if (stableJson(keys) !== stableJson(expectedKeys)) fail('Projection capabilities must explicitly cover every public capability.');
  const available = new Set();
  const normalized = {};
  for (const capability of capabilityNames) {
    if (!CAPABILITY_SET.has(capability)) fail('Projection capability is unsupported.');
    const descriptor = value[capability];
    exactKeys(descriptor, ['status', 'evidenceSha256', 'artifactIds'], 'capability ' + capability);
    const status = nonemptyText(descriptor.status, 'capability ' + capability + ' status', /^(available|unavailable)$/, { lower: true, max: 20 });
    if (status === 'unavailable') {
      if (Object.hasOwn(descriptor, 'evidenceSha256') || Object.hasOwn(descriptor, 'artifactIds')) {
        fail('Unavailable capability ' + capability + ' cannot carry public evidence.');
      }
      normalized[capability] = { status };
      continue;
    }
    const evidenceSha256 = hash(descriptor.evidenceSha256, 'capability ' + capability + ' evidenceSha256');
    if (!Array.isArray(descriptor.artifactIds) || !descriptor.artifactIds.length) {
      fail('Available capability ' + capability + ' needs public artifact evidence.');
    }
    const artifactIdsForCapability = descriptor.artifactIds.map(id => nonemptyText(id, 'capability ' + capability + ' artifactId', ARTIFACT_ID, { lower: true, max: 64 }));
    if (new Set(artifactIdsForCapability).size !== artifactIdsForCapability.length
      || artifactIdsForCapability.some(id => !artifactIds.has(id))) {
      fail('Capability ' + capability + ' has invalid public artifact evidence.');
    }
    const orderedIds = [...artifactIdsForCapability].sort();
    if (stableJson(descriptor.artifactIds) !== stableJson(orderedIds)) {
      fail('Capability ' + capability + ' artifact IDs are not in canonical order.');
    }
    normalized[capability] = { status, evidenceSha256, artifactIds: orderedIds };
    available.add(capability);
  }
  if (!available.size) fail('A published projection needs at least one available public capability.');
  if (available.has('publicAdvancedImpact') && !available.has('lineupLab')) {
    fail('publicAdvancedImpact requires lineupLab.');
  }
  return normalized;
}

function exactProjectionFields() {
  return [
    'format',
    'projectionVersion',
    'generatedAt',
    'packageId',
    'packageVersion',
    'packageManifestSha256',
    'sourceLockSha256',
    'modelId',
    'normalizer',
    'metricsVersion',
    'scope',
    'capabilities',
    'artifacts',
    'contentSha256',
  ];
}

export function validateSwishIqPublicProjectionIndex(value) {
  exactKeys(value, exactProjectionFields(), 'projection index');
  if (value.format !== SWISHIQ_PUBLIC_PROJECTION_FORMAT || value.projectionVersion !== 1) {
    fail('Projection index format is unsupported.');
  }
  const generatedAt = instant(value.generatedAt, 'projection index generatedAt');
  const pins = normalizePackagePins(value, 'projection index');
  const artifacts = normalizeArtifacts(value.artifacts);
  const capabilities = normalizeCapabilities(value.capabilities, new Set(artifacts.map(artifact => artifact.artifactId)), pins);
  const normalized = {
    format: SWISHIQ_PUBLIC_PROJECTION_FORMAT,
    projectionVersion: 1,
    generatedAt,
    ...pins,
    capabilities,
    artifacts,
    contentSha256: hash(value.contentSha256, 'projection index contentSha256'),
  };
  if (normalized.contentSha256 !== projectionContentSha256(normalized)) {
    fail('Projection index contentSha256 does not match canonical content.');
  }
  return normalized;
}

export function buildSwishIqPublicProjectionIndex(input = {}) {
  exactKeys(input, exactProjectionFields().filter(field => !['format', 'projectionVersion', 'contentSha256'].includes(field)), 'projection input');
  const pins = normalizePackagePins(input, 'projection input');
  const artifacts = normalizeArtifacts(input.artifacts, { requireCanonical: false });
  const capabilities = normalizeCapabilities(input.capabilities, new Set(artifacts.map(artifact => artifact.artifactId)), pins);
  const draft = {
    format: SWISHIQ_PUBLIC_PROJECTION_FORMAT,
    projectionVersion: 1,
    generatedAt: instant(input.generatedAt, 'projection input generatedAt'),
    ...pins,
    capabilities,
    artifacts,
  };
  return validateSwishIqPublicProjectionIndex({
    ...draft,
    contentSha256: projectionContentSha256(draft),
  });
}

function exactRegistryEntryFields() {
  return [
    'packageId',
    'packageVersion',
    'packageManifestSha256',
    'sourceLockSha256',
    'modelId',
    'normalizer',
    'metricsVersion',
    'scope',
    'status',
    'capabilities',
    'projectionIndexPath',
    'projectionContentSha256',
  ];
}

function normalizeRegistryEntry(value, label) {
  exactKeys(value, exactRegistryEntryFields(), label);
  const pins = normalizePackagePins(value, label);
  const status = nonemptyText(value.status, label + ' status', /^published$/, { lower: true, max: 20 });
  const projectionIndexPath = relativeJsonPath(value.projectionIndexPath, label + ' projectionIndexPath');
  if (projectionIndexPath !== expectedProjectionIndexPath(pins)) {
    fail(label + ' projectionIndexPath is not in its versioned package directory.');
  }
  const capabilities = normalizeCapabilities(value.capabilities, new Set(
    Object.values(value.capabilities).flatMap(capability => Array.isArray(capability?.artifactIds) ? capability.artifactIds : []),
  ), pins);
  return {
    ...pins,
    status,
    capabilities,
    projectionIndexPath,
    projectionContentSha256: hash(value.projectionContentSha256, label + ' projectionContentSha256'),
  };
}

export function validateSwishIqPublicRegistry(value) {
  exactKeys(value, ['format', 'registryVersion', 'generatedAt', 'packages', 'registryRevisionSha256'], 'public registry');
  if (value.format !== SWISHIQ_PUBLIC_REGISTRY_FORMAT || value.registryVersion !== SWISHIQ_PUBLIC_REGISTRY_VERSION) {
    fail('Public registry format is unsupported.');
  }
  if (!Array.isArray(value.packages) || value.packages.length > 200) {
    fail('Public registry packages are invalid.');
  }
  const packages = value.packages.map((entry, index) => normalizeRegistryEntry(entry, 'public registry package ' + String(index + 1)));
  const ids = new Set();
  for (const entry of packages) {
    if (ids.has(entry.packageId)) fail('Public registry has multiple published versions for one packageId.');
    ids.add(entry.packageId);
  }
  const ordered = [...packages].sort((left, right) => left.packageId.localeCompare(right.packageId));
  if (stableJson(value.packages) !== stableJson(ordered)) fail('Public registry packages are not in canonical order.');
  const normalized = {
    format: SWISHIQ_PUBLIC_REGISTRY_FORMAT,
    registryVersion: SWISHIQ_PUBLIC_REGISTRY_VERSION,
    generatedAt: instant(value.generatedAt, 'public registry generatedAt'),
    packages: ordered,
    registryRevisionSha256: hash(value.registryRevisionSha256, 'public registry registryRevisionSha256'),
  };
  if (normalized.registryRevisionSha256 !== registryRevisionSha256(normalized)) {
    fail('Public registry registryRevisionSha256 does not match canonical content.');
  }
  return normalized;
}

export function buildSwishIqPublicRegistry({ generatedAt, packages } = {}) {
  if (!Array.isArray(packages)) fail('Registry input packages are invalid.');
  const entries = packages.map((item, index) => {
    exactKeys(item, ['projection', 'projectionIndexPath'], 'registry input package ' + String(index + 1));
    const projection = validateSwishIqPublicProjectionIndex(item.projection);
    const projectionIndexPath = relativeJsonPath(item.projectionIndexPath, 'registry input package ' + String(index + 1) + ' projectionIndexPath');
    const pins = normalizePackagePins(projection, 'registry input package ' + String(index + 1));
    if (projectionIndexPath !== expectedProjectionIndexPath(pins)) {
      fail('Registry input package ' + String(index + 1) + ' projectionIndexPath is not in its versioned package directory.');
    }
    return {
      ...pins,
      status: 'published',
      capabilities: projection.capabilities,
      projectionIndexPath,
      projectionContentSha256: projection.contentSha256,
    };
  }).sort((left, right) => left.packageId.localeCompare(right.packageId));
  const draft = {
    format: SWISHIQ_PUBLIC_REGISTRY_FORMAT,
    registryVersion: SWISHIQ_PUBLIC_REGISTRY_VERSION,
    generatedAt: instant(generatedAt, 'registry input generatedAt'),
    packages: entries,
  };
  return validateSwishIqPublicRegistry({
    ...draft,
    registryRevisionSha256: registryRevisionSha256(draft),
  });
}

export function validateSwishIqPublicProjectionBinding(registryEntry, projectionIndex) {
  const entry = normalizeRegistryEntry(registryEntry, 'registry entry');
  const projection = validateSwishIqPublicProjectionIndex(projectionIndex);
  for (const field of [
    'packageId',
    'packageVersion',
    'packageManifestSha256',
    'sourceLockSha256',
    'modelId',
    'normalizer',
    'metricsVersion',
    'scope',
    'capabilities',
  ]) {
    if (stableJson(entry[field]) !== stableJson(projection[field])) {
      fail('Projection index ' + field + ' does not match the public registry.');
    }
  }
  if (entry.projectionContentSha256 !== projection.contentSha256) {
    fail('Projection index content hash does not match the public registry.');
  }
  return { entry, projection };
}

function normalizeResolutionRequest(value) {
  exactKeys(value, ['scope', 'phase', 'packageId', 'packageVersion', 'modelId', 'requiredCapabilities'], 'package resolution request');
  const scope = normalizeScope(value.scope, 'package resolution request scope');
  const phase = nonemptyText(value.phase, 'package resolution request phase', null, { lower: true, max: 40 });
  if (!scope.phases.includes(phase)) fail('Package resolution request phase is outside the requested scope.');
  const requestedCapabilities = Array.isArray(value.requiredCapabilities) ? value.requiredCapabilities : [];
  if (new Set(requestedCapabilities).size !== requestedCapabilities.length) fail('Package resolution request repeats a capability.');
  const capabilities = requestedCapabilities.map(capability => nonemptyText(capability, 'package resolution request capability', null, { max: 80 }));
  if (capabilities.some(capability => !CAPABILITY_SET.has(capability))) fail('Package resolution request contains an unsupported capability.');
  const result = { scope, phase, requiredCapabilities: [...capabilities].sort() };
  if (value.packageId !== undefined) result.packageId = nonemptyText(value.packageId, 'package resolution request packageId', PACKAGE_ID, { lower: true, max: 80 });
  if (value.packageVersion !== undefined) result.packageVersion = nonemptyText(value.packageVersion, 'package resolution request packageVersion', PACKAGE_VERSION, { lower: true, max: 120 });
  if (value.modelId !== undefined) {
    result.modelId = nonemptyText(value.modelId, 'package resolution request modelId', null, { lower: true, max: 40 });
    if (!SWISHIQ_PUBLIC_MODEL_CONTRACTS[result.modelId]) fail('Package resolution request modelId is unsupported.');
  }
  return result;
}

/**
 * Resolve one published package without ever widening an exact-season request
 * to the pooled package. The requested scope must match byte-for-byte after
 * canonicalization, so a caller must deliberately ask for a pooled window.
 */
export function resolveSwishIqPublicPackage(registry, request) {
  const normalizedRegistry = validateSwishIqPublicRegistry(registry);
  const normalizedRequest = normalizeResolutionRequest(request);
  const matches = normalizedRegistry.packages.filter(entry => {
    if (stableJson(entry.scope) !== stableJson(normalizedRequest.scope)) return false;
    if (normalizedRequest.packageId && entry.packageId !== normalizedRequest.packageId) return false;
    if (normalizedRequest.packageVersion && entry.packageVersion !== normalizedRequest.packageVersion) return false;
    if (normalizedRequest.modelId && entry.modelId !== normalizedRequest.modelId) return false;
    return normalizedRequest.requiredCapabilities.every(capability => entry.capabilities[capability]?.status === 'available');
  });
  if (matches.length !== 1) {
    fail('No single published SwishIQ package satisfies the exact scope and capability request.');
  }
  return matches[0];
}

function normalizePositions(value, label) {
  if (!Array.isArray(value) || !value.length || value.length > 3) fail(label + ' are invalid.');
  const positions = value.map(position => nonemptyText(position, label + ' position', null, { max: 8 }));
  if (new Set(positions).size !== positions.length || positions.some(position => !ROLE_SET.has(position))) {
    fail(label + ' are invalid.');
  }
  const ordered = [...positions].sort();
  if (stableJson(value) !== stableJson(ordered)) fail(label + ' are not in canonical order.');
  return ordered;
}

export function publicRosterRefForMembership({ playerRef, teamCode, seasonStartYear, phase } = {}) {
  const player = nonemptyText(playerRef, 'roster membership playerRef', SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 40 });
  const team = nonemptyText(teamCode, 'roster membership teamCode', /^[A-Z]{3}$/, { max: 3 });
  if (!TEAM_SET.has(team)) fail('roster membership teamCode is invalid.');
  const season = integer(seasonStartYear, 'roster membership seasonStartYear', { min: 1947, max: 2200 });
  const normalizedPhase = nonemptyText(phase, 'roster membership phase', null, { lower: true, max: 40 });
  if (!PHASE_SET.has(normalizedPhase)) fail('roster membership phase is invalid.');
  return 'r_' + sha256Text('djhc-roster-v1:' + [player, team, season, normalizedPhase].join(':')).slice(0, 32);
}

function normalizeRosterIdentity(value, label, scope = null) {
  const result = {
    rosterRef: nonemptyText(value.rosterRef, label + ' rosterRef', SWISHIQ_PUBLIC_ROSTER_REF, { lower: true, max: 40 }),
    playerRef: nonemptyText(value.playerRef, label + ' playerRef', SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 40 }),
    displayName: nonemptyText(value.displayName, label + ' displayName', null, { max: 120 }),
    teamCode: nonemptyText(value.teamCode, label + ' teamCode', /^[A-Z]{3}$/, { max: 3 }),
    seasonStartYear: integer(value.seasonStartYear, label + ' seasonStartYear', { min: 1947, max: 2200 }),
    phase: nonemptyText(value.phase, label + ' phase', null, { lower: true, max: 40 }),
    positions: normalizePositions(value.positions, label + ' positions'),
    displayEligible: value.displayEligible,
  };
  if (!TEAM_SET.has(result.teamCode) || !PHASE_SET.has(result.phase) || typeof result.displayEligible !== 'boolean') {
    fail(label + ' contains an invalid roster membership.');
  }
  if (scope && (!scope.seasonStartYears.includes(result.seasonStartYear) || !scope.phases.includes(result.phase))) {
    fail(label + ' is outside the artifact scope.');
  }
  if (result.rosterRef !== publicRosterRefForMembership(result)) {
    fail(label + ' rosterRef is not bound to the public membership.');
  }
  return result;
}

export function validateSwishIqPublicRosterRecord(value, { scope = null } = {}) {
  exactKeys(value, ['rosterRef', 'playerRef', 'displayName', 'teamCode', 'seasonStartYear', 'phase', 'positions', 'displayEligible'], 'roster record');
  return normalizeRosterIdentity(value, 'roster record', scope);
}

const CAREER_METRIC_KEYS = Object.freeze(['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks']);

function validateSwishIqPublicCareerLookupRecord(value, { scope = null } = {}) {
  exactKeys(value, ['playerRef', 'displayName', 'seasonStartYear', 'teamCode'], 'career lookup record');
  const result = {
    playerRef: nonemptyText(value.playerRef, 'career lookup playerRef', SWISHIQ_PUBLIC_PLAYER_REF, { lower: true, max: 40 }),
    displayName: nonemptyText(value.displayName, 'career lookup displayName', null, { max: 120 }),
    seasonStartYear: integer(value.seasonStartYear, 'career lookup seasonStartYear', { min: 1947, max: 2200 }),
    teamCode: nonemptyText(value.teamCode, 'career lookup teamCode', /^[A-Z]{3}$/, { max: 3 }),
  };
  if (!TEAM_SET.has(result.teamCode) || (scope && !scope.seasonStartYears.includes(result.seasonStartYear))) {
    fail('career lookup record is outside the package scope.');
  }
  return result;
}

function validateSwishIqPublicCareerHistoryRecord(value, { scope = null } = {}) {
  exactKeys(value, [
    'playerRef', 'displayName', 'teamCode', 'seasonStartYear', 'phase', 'observed',
    'games', 'minutes', 'positions', 'age', 'experience', 'careerMetrics',
  ], 'career history record');
  const lookup = validateSwishIqPublicCareerLookupRecord({
    playerRef: value.playerRef,
    displayName: value.displayName,
    seasonStartYear: value.seasonStartYear,
    teamCode: value.teamCode,
  }, { scope });
  if (value.phase !== 'regular' || value.observed !== true || (scope && !scope.phases.includes(value.phase))) {
    fail('career history record must be an observed regular-season row.');
  }
  const games = integer(value.games, 'career history games', { min: 0, max: 300 });
  const minutes = finite(value.minutes, 'career history minutes', { min: 0, max: 100_000 });
  if (!Array.isArray(value.positions) || value.positions.length > 3
    || value.positions.some(position => typeof position !== 'string' || !ROLE_SET.has(position))
    || new Set(value.positions).size !== value.positions.length
    || stableJson(value.positions) !== stableJson([...value.positions].sort())) {
    fail('career history positions are invalid.');
  }
  const age = value.age === null ? null : finite(value.age, 'career history age', { min: 0, max: 100 });
  const experience = value.experience === null ? null : integer(value.experience, 'career history experience', { min: 0, max: 60 });
  exactKeys(value.careerMetrics, CAREER_METRIC_KEYS, 'career history metrics');
  const careerMetrics = Object.fromEntries(CAREER_METRIC_KEYS.map(key => [
    key,
    value.careerMetrics[key] === null
      ? null
      : finite(value.careerMetrics[key], 'career history ' + key, { min: 0, max: 1000 }),
  ]));
  return { ...lookup, phase: value.phase, observed: true, games, minutes,
    positions: [...value.positions], age, experience, careerMetrics };
}

export function validateSwishIqPublicLineupEvidenceRecord(value, { scope = null } = {}) {
  exactKeys(value, [
    'rosterRef',
    'playerRef',
    'displayName',
    'teamCode',
    'seasonStartYear',
    'phase',
    'positions',
    'displayEligible',
    'age',
    'starts',
    'observed',
    'coverage',
    'box',
    'impact',
  ], 'lineup evidence record');
  const roster = normalizeRosterIdentity(value, 'lineup evidence record', scope);
  if (value.observed !== true) fail('lineup evidence record must be observed.');
  const age = value.age === null ? null : integer(value.age, 'lineup evidence age', { min: 0, max: 100 });
  exactKeys(value.coverage, ['games', 'minutes', 'possessions'], 'lineup evidence coverage');
  const coverage = {
    games: integer(value.coverage.games, 'lineup evidence games', { min: 1, max: 200 }),
    minutes: finite(value.coverage.minutes, 'lineup evidence minutes', { min: 0.0001, max: 20_000 }),
    possessions: integer(value.coverage.possessions, 'lineup evidence possessions', { min: 1, max: 200_000 }),
  };
  exactKeys(value.box, [
    'points',
    'totalRebounds',
    'assists',
    'steals',
    'blocks',
    'turnovers',
    'fieldGoalsMade',
    'fieldGoalsAttempted',
    'threePointersMade',
    'threePointersAttempted',
    'freeThrowsMade',
    'freeThrowsAttempted',
  ], 'lineup evidence box');
  const box = Object.fromEntries(Object.entries(value.box).map(([key, number]) => [
    key,
    integer(number, 'lineup evidence box ' + key, { min: 0, max: 100_000 }),
  ]));
  if (box.fieldGoalsMade > box.fieldGoalsAttempted
    || box.threePointersMade > box.threePointersAttempted
    || box.freeThrowsMade > box.freeThrowsAttempted) {
    fail('lineup evidence box makes exceed attempts.');
  }
  const starts = value.starts === null ? null : integer(value.starts, 'lineup evidence starts', { min: 0, max: coverage.games });
  exactKeys(value.impact, ['offensePer100', 'defensePer100', 'reliability', 'alreadyRegularized'], 'lineup evidence impact');
  const impact = {
    offensePer100: finite(value.impact.offensePer100, 'lineup evidence offensePer100', { min: -100, max: 100 }),
    defensePer100: finite(value.impact.defensePer100, 'lineup evidence defensePer100', { min: -100, max: 100 }),
    reliability: finite(value.impact.reliability, 'lineup evidence reliability', { min: 0, max: 1 }),
    alreadyRegularized: value.impact.alreadyRegularized,
  };
  if (typeof impact.alreadyRegularized !== 'boolean') fail('lineup evidence regularization flag is invalid.');
  return { ...roster, age, starts, observed: true, coverage, box, impact };
}

export function assertSwishIqPublicSafe(value, label = 'public') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail(label + '[' + String(index) + '] is a sparse array.');
      assertSwishIqPublicSafe(value[index], label + '[' + String(index) + ']');
    }
    return value;
  }
  if (plainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_FIELD.test(key)) {
        if (!PUBLIC_EVIDENCE_NOTE.test(key)) fail(label + '.' + key + ' is private or unsafe.');
        if (key === 'sourceNote') {
          if (typeof item !== 'string' || !item.trim() || item.length > PUBLIC_EVIDENCE_TEXT_MAX || PRIVATE_TEXT.test(item)) {
            fail(label + '.' + key + ' is private or unsafe.');
          }
        } else if (!Array.isArray(item) || item.length > PUBLIC_EVIDENCE_NOTES_MAX
          || item.some(note => typeof note !== 'string' || !note.trim() || note.length > PUBLIC_EVIDENCE_TEXT_MAX || PRIVATE_TEXT.test(note))) {
          fail(label + '.' + key + ' is private or unsafe.');
        }
      }
      if (UUID_IN_TEXT.test(key)) fail(label + '.' + key + ' is private or unsafe.');
      assertSwishIqPublicSafe(item, label + '.' + key);
    }
    return value;
  }
  if (typeof value === 'string') {
    if (UUID_IN_TEXT.test(value) || PRIVATE_TEXT.test(value)) fail(label + ' contains a private value.');
    return value;
  }
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  fail(label + ' is not JSON-safe.');
}

function exactPartFields() {
  return [
    'format',
    'packageId',
    'packageVersion',
    'packageManifestSha256',
    'sourceLockSha256',
    'modelId',
    'normalizer',
    'metricsVersion',
    'scope',
    'artifactId',
    'kind',
    'records',
  ];
}

export function validateSwishIqPublicProjectionPart(value, { projectionIndex = null, descriptor = null } = {}) {
  exactKeys(value, exactPartFields(), 'projection part');
  if (value.format !== SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT) fail('Projection part format is unsupported.');
  const pins = normalizePackagePins(value, 'projection part');
  const artifactId = nonemptyText(value.artifactId, 'projection part artifactId', ARTIFACT_ID, { lower: true, max: 64 });
  const kind = nonemptyText(value.kind, 'projection part kind', null, { lower: true, max: 64 });
  if (!ARTIFACT_KIND_SET.has(kind)) fail('Projection part kind is unsupported.');
  if (!Array.isArray(value.records) || value.records.length > 1_000_000) fail('Projection part records are invalid.');
  let records;
  if (kind === 'roster-memberships') {
    records = value.records.map(record => validateSwishIqPublicRosterRecord(record, { scope: pins.scope }));
  } else if (kind === 'career-lookup') {
    if (pins.scope.kind !== 'pooled-window') fail('career-lookup requires a pooled package scope.');
    records = value.records.map(record => validateSwishIqPublicCareerLookupRecord(record, { scope: pins.scope }));
  } else if (kind === 'career-history') {
    if (pins.scope.kind !== 'pooled-window') fail('career-history requires a pooled package scope.');
    records = value.records.map(record => validateSwishIqPublicCareerHistoryRecord(record, { scope: pins.scope }));
  } else if (kind === 'lineup-evidence') {
    if (pins.scope.kind !== 'exact-season') fail('lineup-evidence requires an exact-season scope.');
    records = value.records.map(record => validateSwishIqPublicLineupEvidenceRecord(record, { scope: pins.scope }));
  } else {
    records = value.records.map((record, index) => {
      if (!plainObject(record)) fail('Projection part record ' + String(index + 1) + ' must be an object.');
      return assertSwishIqPublicSafe(record, 'projection part record ' + String(index + 1));
    });
  }
  const refs = new Set();
  const careerRows = new Set();
  for (const record of records) {
    if (record.rosterRef) {
      if (refs.has(record.rosterRef)) fail('Projection part repeats a public rosterRef.');
      refs.add(record.rosterRef);
    }
    if (kind === 'career-lookup' || kind === 'career-history') {
      const key = [record.playerRef, record.seasonStartYear, record.teamCode].join('|');
      if (careerRows.has(key)) fail('Projection part repeats a Career player/team/season row.');
      careerRows.add(key);
    }
  }
  const normalized = {
    format: SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT,
    ...pins,
    artifactId,
    kind,
    records,
  };
  assertSwishIqPublicSafe(normalized, 'projection part');
  if (projectionIndex || descriptor) {
    const projection = projectionIndex ? validateSwishIqPublicProjectionIndex(projectionIndex) : null;
    const expectedDescriptor = descriptor ?? projection?.artifacts.find(artifact => artifact.artifactId === artifactId);
    if (!expectedDescriptor) fail('Projection part has no matching artifact descriptor.');
    if (expectedDescriptor.artifactId !== artifactId || expectedDescriptor.kind !== kind) {
      fail('Projection part does not match the artifact descriptor.');
    }
    if (expectedDescriptor.rows !== records.length) fail('Projection part row count does not match the artifact descriptor.');
    if (projection) {
      for (const field of [
        'packageId',
        'packageVersion',
        'packageManifestSha256',
        'sourceLockSha256',
        'modelId',
        'normalizer',
        'metricsVersion',
        'scope',
      ]) {
        if (stableJson(normalized[field]) !== stableJson(projection[field])) {
          fail('Projection part ' + field + ' does not match its index.');
        }
      }
    }
  }
  return normalized;
}

export function buildSwishIqPublicProjectionPart(input = {}) {
  exactKeys(input, exactPartFields().filter(field => field !== 'format'), 'projection part input');
  return validateSwishIqPublicProjectionPart({
    format: SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT,
    ...input,
  });
}

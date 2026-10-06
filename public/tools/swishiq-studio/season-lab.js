import {
  SWISHIQ_PUBLIC_PROJECTION_FORMAT,
  SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT,
  SWISHIQ_PUBLIC_REGISTRY_FORMAT,
  SWISHIQ_PUBLIC_REGISTRY_REVISION,
  SWISHIQ_PUBLIC_ASSET_VERSION,
  SWISHIQ_PUBLIC_REGISTRY_VERSION,
  projectionContentSha256,
  registryRevisionSha256,
  sha256Text,
  stableJson,
  assertSwishIqV3SourceAllowed,
} from '../swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1';
import { createLeagueLab } from './engine/league-lab.js?v=20261001c&rev=league-lab-v10-fixed16-franchise-v1';
import { projectPublicResultShareV1 } from './engine/public-result-share.js?v=20260929e&rev=game-points-v2-public-share-20260929e';
import {
  createSignedPublicResultShareLink,
  isSignedPublicResultShareAvailable,
} from './engine/public-result-share-client.js?v=20261001f&rev=public-share-client-v4-contract-pin-closure-v1';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import {
  deriveActualNbaTeamRecords,
  NBA_TEAM_CODES,
  normalizeNbaScheduleArtifact,
  selectActualNbaSchedule,
} from './engine/nba-schedule-source.js?v=20260926h&rev=cup-scenario-records-v1';
import { publishSwishIqLabHandoff } from './integration-bridge.js?v=20261002b&rev=swishiq-studio-cross-lab-v4-reviewed-release-pin-v1';
import {
  appendSeasonLabSeason,
  buildSeasonLabNextSeasonInput,
  createSeasonLabLeagueState,
  parseSeasonLabLeagueState,
  serializeSeasonLabLeagueState,
  SEASON_LAB_POLICY,
} from './engine/season-lab-model.js?v=20261001b&rev=season-model-v26-fixed-16-team-playoffs-20261001b';

const REGISTRY_URL = new URL(`./data/registry.json?v=${SWISHIQ_PUBLIC_ASSET_VERSION}&rev=${SWISHIQ_PUBLIC_REGISTRY_REVISION}`, import.meta.url).toString();
const REQUIRED_ARTIFACTS = Object.freeze([
  ['team-styles', 'team-styles'],
  ['player-seasons', 'player-seasons'],
  ['roster-memberships', 'roster-memberships'],
]);
const TEAM_CODE = /^[A-Z]{3}$/;
const V3_PACKAGE_ID = /^nba-swishiq-v3-(\d{4})-(\d{2})$/;
const V3_PACKAGE_VERSION = /^v3-(\d{4})-(\d{2})-([a-f0-9]{12})$/;
const V3_PLAYER_REF = /^p_[a-f0-9]{32}$/;
const V3_PLAYER_SEASON_REF = /^ps_[a-f0-9]{32}$/;
const V3_ROSTER_REF = /^r_[a-f0-9]{32}$/;
const V3_MODEL = 'swishiq-v3';
const V3_NORMALIZER = 'swishiq-v3-canonical-normalizer';
const V3_LEGACY_METRICS = 'swishiq-v3-metrics-v1.1';
const V3_METRICS = 'swishiq-v3-metrics-v1.2';
const V3_METRICS_VERSIONS = new Set([V3_LEGACY_METRICS, V3_METRICS]);
const SUPPORTED_PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);

export const SEASON_LAB_REQUIRED_CAPABILITIES = Object.freeze(['seasonSimulation']);
export const SEASON_LAB_SCOPE_KINDS = Object.freeze(['exact-season', 'pooled-window']);
export const SEASON_LAB_LOAD_TIMEOUT_MS = 15_000;
export const SEASON_LAB_CHALLENGE_STORAGE_PREFIX = 'djhc:swishiq:season-challenge:v1:';
export const SEASON_LAB_LEAGUE_STORAGE_PREFIX = 'djhc:swishiq:season-league:v1:';
const SEASON_LAB_CHALLENGE_SCHEMA = 'djhc-season-challenge-v1';
const SEASON_LAB_CHALLENGE_MAX_SAVE_LENGTH = 20_000;
const SEASON_LAB_CHALLENGE_PREDICTIONS = new Set(['more', 'fewer', 'same']);
const SEASON_LAB_CHALLENGE_PLANS = new Set(['0.5', '0.65', '0.35']);

function seasonLabTimeoutMs(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : SEASON_LAB_LOAD_TIMEOUT_MS;
}

function seasonLabAbortError() {
  const error = new Error('The Season Lab source check was cancelled.');
  error.name = 'AbortError';
  return error;
}

function seasonLabTimeoutError() {
  const error = new Error('The Season Lab source check timed out. Check your connection and retry.');
  error.name = 'TimeoutError';
  error.code = 'SEASON_LAB_LOAD_TIMEOUT';
  return error;
}

export const SEASON_LAB_NATIVE_RECEIPT = Object.freeze({
  receiptId: 'djhc-season-lab-native-package-adapter-v1',
  status: 'implementation-ready',
  modelRules: 'djhc-season-lab-v1',
  packageContract: 'registry-declared-native-season-simulation-v1',
  requiredArtifacts: Object.freeze(REQUIRED_ARTIFACTS.map(item => item[0])),
  requiredCapabilities: SEASON_LAB_REQUIRED_CAPABILITIES,
  note: 'Season Lab resolves a separately selected, registry-declared native exact package. It supplies exact observed schedules when the reviewed NBA calendar artifact covers the selected season; accepted forecast sources may use the deterministic NBA-style future generator. The package supplies observed team rates and minutes.',
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedPhase(value) {
  return String(value || 'regular').trim().toLowerCase();
}

function fail(message) {
  throw new Error(message);
}

function same(left, right) {
  return stableJson(left) === stableJson(right);
}

async function readText(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  } catch {
    fail(`${label} could not be reached.`);
  }
  if (!response?.ok) fail(`${label} is unavailable.`);
  try {
    return await response.text();
  } catch {
    fail(`${label} could not be read.`);
  }
}

async function readJson(fetchImpl, url, label) {
  const source = await readText(fetchImpl, url, label);
  try {
    return { source, value: JSON.parse(source) };
  } catch {
    fail(`${label} is malformed.`);
  }
}

async function loadScheduleArtifact(fetchImpl, registryUrl) {
  // The schedule is an independent, reviewed public artifact. A missing or
  // malformed artifact must not make the package itself disappear; it keeps
  // the exact-schedule control visibly unavailable instead of falling back to
  // a generated or pooled calendar.
  const url = new URL('./nba-actual-schedules-v1.json?v=20260920c&rev=nba-schedule-source-v2', registryUrl).toString();
  try {
    const { source, value } = await readJson(fetchImpl, url, 'The NBA schedule artifact');
    return Object.freeze({
      artifact: normalizeNbaScheduleArtifact(value),
      sourceReceipt: Object.freeze({
        id: 'djhc-nba-actual-schedules-v1',
        version: String(value.revision || 'nba-schedule-source-v2'),
        contentSha256: await sha256Text(source),
        url,
      }),
    });
  } catch (error) {
    return Object.freeze({ artifact: null, sourceReceipt: Object.freeze({
      id: 'djhc-nba-actual-schedules-v1', version: 'unavailable', contentSha256: null, url,
      reason: error instanceof Error ? error.message : 'The schedule artifact could not be loaded.',
    }) });
  }
}

async function loadNbaCupScheduleArtifact(fetchImpl, registryUrl) {
  const url = new URL('./nba-cup-2026-27-published-schedule-v1.json?v=20260926i&rev=nba-cup-2026-27-published-v1-phase8-release-i', registryUrl).toString();
  try {
    const { source, value } = await readJson(fetchImpl, url, 'The published 2026–27 NBA Cup schedule');
    if (value?.format !== 'djhc-nba-cup-published-schedule-v1'
      || value?.status !== 'published' || Number(value?.seasonStartYear) !== 2026
      || !Array.isArray(value?.announcedGames) || value.announcedGames.length !== 1200
      || !Array.isArray(value?.groups) || value.groups.length !== 6) {
      fail('The published 2026–27 NBA Cup schedule does not match its declared contract.');
    }
    return Object.freeze({
      artifact: value,
      sourceReceipt: Object.freeze({
        id: 'djhc-nba-cup-2026-27-published-schedule-v1',
        version: String(value.revision || 'nba-cup-2026-27-published-v1'),
        contentSha256: await sha256Text(stableJson(value)),
        url,
      }),
    });
  } catch (error) {
    return Object.freeze({ artifact: null, sourceReceipt: Object.freeze({
      id: 'djhc-nba-cup-2026-27-published-schedule-v1', version: 'unavailable', contentSha256: null, url,
      reason: error instanceof Error ? error.message : 'The published 2026–27 NBA Cup schedule could not be loaded.',
    }) });
  }
}

function packageRef(entry, registry) {
  return {
    format: 'djhc-swishiq-package-v3',
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    packageManifestSha256: entry.packageManifestSha256,
    sourceLockSha256: entry.sourceLockSha256,
    registryVersion: registry.registryVersion,
    registryRevisionSha256: registry.registryRevisionSha256,
    projectionContentSha256: entry.projectionContentSha256,
    projectionIndexPath: entry.projectionIndexPath,
    modelId: entry.modelId,
    normalizer: entry.normalizer,
    metricsVersion: entry.metricsVersion,
    scope: entry.scope,
  };
}

function validateRegistry(registry) {
  if (!isObject(registry) || registry.format !== SWISHIQ_PUBLIC_REGISTRY_FORMAT
    || registry.registryVersion !== SWISHIQ_PUBLIC_REGISTRY_VERSION || !Array.isArray(registry.packages)
    || typeof registry.generatedAt !== 'string' || !/^[a-f0-9]{64}$/.test(String(registry.registryRevisionSha256 || ''))) {
    fail('The native Season Lab registry is malformed.');
  }
  return registry;
}

async function loadRegistry(fetchImpl, registryUrl) {
  const { value } = await readJson(fetchImpl, registryUrl, 'The native Season Lab registry');
  const registry = validateRegistry(value);
  if (registry.registryRevisionSha256 !== SWISHIQ_PUBLIC_REGISTRY_REVISION
    || await registryRevisionSha256(registry) !== registry.registryRevisionSha256) {
    fail('The native Season Lab registry failed its integrity check.');
  }
  await Promise.all(registry.packages
    .filter(entry => entry?.status === 'published' && entry?.modelId === V3_MODEL)
    .map(validateNativeSeasonLabPackageVersion));
  return registry;
}

function validateEntry(entry) {
  if (!isObject(entry) || entry.status !== 'published' || !isObject(entry.scope)
    || !Array.isArray(entry.scope.seasonStartYears) || !entry.scope.seasonStartYears.length
    || typeof entry.projectionIndexPath !== 'string'
    || !String(entry.packageId || '').trim() || !String(entry.packageVersion || '').trim()) {
    fail('The selected native Season Lab package is malformed.');
  }
  if (entry.scope.kind !== 'exact-season' && entry.scope.kind !== 'pooled-window') {
    fail('The native Season Lab package scope is unsupported.');
  }
  const seasonYears = entry.scope.seasonStartYears.map(Number);
  if (seasonYears.some(year => !Number.isSafeInteger(year) || year < 1947 || year > 2200)
    || new Set(seasonYears).size !== seasonYears.length
    || seasonYears.some((year, index) => index > 0 && year <= seasonYears[index - 1])) {
    fail('The native Season Lab package season scope is malformed.');
  }
  if (entry.scope.kind === 'exact-season'
    && (!Number.isSafeInteger(Number(entry.scope.seasonStartYear))
      || Number(entry.scope.seasonStartYear) !== seasonYears[0]
      || seasonYears.length !== 1)) {
    fail('The exact native Season Lab package must declare one matching season start year.');
  }
  const first = seasonYears[0];
  const end = seasonYears.at(-1) + 1;
  const label = `${first}-${String(end).slice(-2)}`;
  const packageId = `nba-swishiq-v3-${label}`;
  const versionMatch = V3_PACKAGE_VERSION.exec(entry.packageVersion);
  const versionHasScope = versionMatch?.[1] === String(first) && versionMatch?.[2] === String(end).slice(-2);
  const versionMatchesMetrics = entry.metricsVersion === V3_LEGACY_METRICS
    ? entry.packageVersion === `v3-${label}-${String(entry.sourceLockSha256 || '').slice(0, 12)}`
    : versionHasScope;
  if (entry.modelId !== V3_MODEL || entry.normalizer !== V3_NORMALIZER || !V3_METRICS_VERSIONS.has(entry.metricsVersion)
    || !/^[a-f0-9]{64}$/.test(String(entry.sourceLockSha256 || ''))
    || entry.packageId !== packageId || !versionMatchesMetrics
    || !V3_PACKAGE_ID.test(entry.packageId) || !versionMatch) {
    fail('The selected Season Lab package is not bound to SwishIQ V3 IDs, versions, and projection metrics.');
  }
  return entry;
}

/**
 * Verify the package-version identity used by the public projection contract.
 * V1.1 retains its source-lock prefix; V1.2 binds the model, source lock,
 * normalizer, and metrics version into the canonical SHA-256 digest.
 */
export async function validateNativeSeasonLabPackageVersion(entry) {
  validateEntry(entry);
  const seasonYears = entry.scope.seasonStartYears.map(Number);
  const first = seasonYears[0];
  const end = seasonYears.at(-1) + 1;
  const label = `${first}-${String(end).slice(-2)}`;
  const versionDigest = entry.metricsVersion === V3_LEGACY_METRICS
    ? entry.sourceLockSha256
    : await sha256Text([entry.modelId, entry.sourceLockSha256, entry.normalizer, entry.metricsVersion].join('|'));
  const expectedPackageVersion = `v3-${label}-${versionDigest.slice(0, 12)}`;
  if (entry.packageVersion !== expectedPackageVersion) {
    fail('The selected Season Lab package version does not match its SwishIQ V3 metrics identity.');
  }
  return entry;
}

function packageKey(entry) {
  return `${entry?.packageId || ''}@${entry?.packageVersion || ''}`;
}

function normalizeSelectionYears(value, label = 'Season Lab seasonStartYears') {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    fail(`${label} must contain one through twenty season start years.`);
  }
  const years = value.map(Number);
  if (years.some(year => !Number.isSafeInteger(year) || year < 1947 || year > 2200)
    || new Set(years).size !== years.length) {
    fail(`${label} must contain distinct valid season start years.`);
  }
  const orderedYears = [...years].sort((left, right) => left - right);
  if (!same(years, orderedYears)) fail(`${label} must be ordered.`);
  return years;
}

function selectionPackageRef(value) {
  const candidate = value?.packageRef && isObject(value.packageRef) ? value.packageRef : value;
  return candidate && isObject(candidate)
    ? { packageId: String(candidate.packageId || '').trim(), packageVersion: String(candidate.packageVersion || '').trim() }
    : { packageId: '', packageVersion: '' };
}

function capabilityIsAvailable(entry, capability) {
  return entry?.capabilities?.[capability]?.status === 'available';
}

function hasDeclaredArtifacts(entry, capability, artifactIds) {
  const declared = entry?.capabilities?.[capability]?.artifactIds;
  return Array.isArray(declared) && artifactIds.every(artifactId => declared.includes(artifactId));
}

function selectionBlocked(reason, code = 'package-unavailable', extras = {}) {
  return Object.freeze({
    status: 'blocked', available: false, code, reason,
    entries: Object.freeze([]), packageRefs: Object.freeze([]), ...extras,
  });
}

/**
 * Resolve a native Season Lab package selection without loading any package
 * parts. Exact requests are matched one season at a time; the pooled package
 * is considered only when the caller explicitly requests pooled scope and
 * accepts that scope. A missing capability is a blocked state, never a
 * fallback to another season or to the pooled window.
 */
export function resolveNativeSeasonLabSelection(registryOrSource, {
  scope = 'exact-season',
  seasonStartYears = null,
  packageRefs = null,
  acceptedPooledPackage = false,
  requiredCapabilities = [],
} = {}) {
  const registry = registryOrSource?.packageRegistry || registryOrSource;
  if (!isObject(registry) || !Array.isArray(registry.packages)) {
    fail('The native Season Lab package registry is unavailable.');
  }
  const scopeKind = String(scope || '').trim().toLowerCase();
  if (!SEASON_LAB_SCOPE_KINDS.includes(scopeKind)) fail('Native Season Lab scope must be exact-season or pooled-window.');
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.some(capability => !String(capability || '').trim())) {
    fail('Native Season Lab required capabilities are invalid.');
  }
  const capabilities = [...new Set(requiredCapabilities.map(capability => String(capability).trim()))];
  const entries = registry.packages.filter(entry => {
    try { validateEntry(entry); return isNativeFamilyEntry(entry); } catch { return false; }
  });
  if (!entries.length) return selectionBlocked('The native Season Lab package registry has no published package entries.', 'registry-empty');
  const refs = packageRefs == null ? null : (Array.isArray(packageRefs) ? packageRefs.map(selectionPackageRef) : fail('Native Season Lab packageRefs must be an array.'));
  if (refs && refs.some(ref => !ref.packageId || !ref.packageVersion)) {
    fail('Native Season Lab packageRefs must include package IDs and versions.');
  }

  if (scopeKind === 'exact-season') {
    if (acceptedPooledPackage === true) {
      return selectionBlocked('Exact Season Lab scope cannot accept a pooled package.', 'scope-mismatch');
    }
    const exactEntries = entries.filter(entry => entry.scope.kind === 'exact-season');
    // A single package reference is already an exact selection. Derive its
    // declared season before loading package parts so consumers that already
    // have an immutable package ID/version do not need a second proof/index
    // request merely to discover the year. Multi-season requests still need
    // their explicit ordered year list to preserve the existing contract.
    const referencedSingleYear = seasonStartYears == null && refs?.length === 1
      ? exactEntries.find(entry => entry.packageId === refs[0].packageId && entry.packageVersion === refs[0].packageVersion)?.scope?.seasonStartYear
      : null;
    const years = seasonStartYears == null
      ? referencedSingleYear !== null && referencedSingleYear !== undefined
        ? [Number(referencedSingleYear)]
        : [...new Set(exactEntries.map(entry => Number(entry.scope.seasonStartYear)))].sort((left, right) => left - right)
      : normalizeSelectionYears(seasonStartYears);
    if (!years.length) return selectionBlocked('No exact Season Lab seasons are published.', 'exact-package-unavailable', { scope: scopeKind, seasonStartYears: Object.freeze([]) });
    if (refs && refs.length !== years.length) fail('Exact native Season Lab packageRefs must contain one reference per requested season.');
    const selected = [];
    for (const [index, year] of years.entries()) {
      let candidates = exactEntries.filter(entry => Number(entry.scope.seasonStartYear) === year);
      if (refs) candidates = candidates.filter(entry => entry.packageId === refs[index].packageId && entry.packageVersion === refs[index].packageVersion);
      if (candidates.length !== 1) {
        return selectionBlocked(
          `No unique exact native Season Lab package is published for ${year}; no pooled or other-season fallback was used.`,
          'exact-package-unavailable',
          { scope: scopeKind, seasonStartYears: Object.freeze([...years]) },
        );
      }
      selected.push(candidates[0]);
    }
    const missingCapability = selected.find(entry => capabilities.some(capability => !capabilityIsAvailable(entry, capability)));
    if (missingCapability) {
      const missing = capabilities.filter(capability => !capabilityIsAvailable(missingCapability, capability));
      return selectionBlocked(
        `The exact native Season Lab package ${packageKey(missingCapability)} does not publish ${missing.join(' and ')}; no other scope was used.`,
        'capability-unavailable',
        { scope: scopeKind, seasonStartYears: Object.freeze([...years]) },
      );
    }
    const packageRefsOut = selected.map(entry => Object.freeze({
      ...packageRef(entry, registry),
      seasonStartYear: entry.scope.seasonStartYear,
    }));
    return Object.freeze({
      status: 'ready', available: true, code: null, scope: scopeKind,
      seasonStartYears: Object.freeze([...years]), entries: Object.freeze([...selected]),
      packageRefs: Object.freeze(packageRefsOut), requiredCapabilities: Object.freeze(capabilities),
      selectionKey: `exact-season:${packageRefsOut.map(packageKey).join('|')}`,
    });
  }

  if (acceptedPooledPackage !== true) {
    return selectionBlocked('Choose the pooled window explicitly. It never replaces an exact season.', 'pooled-acceptance-required', { scope: scopeKind });
  }
  const pooledEntries = entries.filter(entry => entry.scope.kind === 'pooled-window');
  let candidates = pooledEntries;
  if (refs) {
    if (refs.length !== 1) fail('A pooled native Season Lab selection accepts exactly one packageRef.');
    candidates = candidates.filter(entry => entry.packageId === refs[0].packageId && entry.packageVersion === refs[0].packageVersion);
  }
  if (candidates.length !== 1) return selectionBlocked('No unique accepted pooled native Season Lab package is published.', 'pooled-package-unavailable', { scope: scopeKind });
  const selected = candidates[0];
  const years = normalizeSelectionYears(selected.scope.seasonStartYears);
  if (seasonStartYears != null && !same(normalizeSelectionYears(seasonStartYears), years)) {
    return selectionBlocked('The accepted pooled native Season Lab package does not match the requested season window.', 'scope-mismatch', { scope: scopeKind, seasonStartYears: Object.freeze([...years]) });
  }
  const missing = capabilities.filter(capability => !capabilityIsAvailable(selected, capability));
    if (missing.length) return selectionBlocked(`The pooled Season Lab package is missing ${missing.join(' and ')}.`, 'capability-unavailable', { scope: scopeKind, seasonStartYears: Object.freeze([...years]) });
  const selectedRef = Object.freeze({ ...packageRef(selected, registry), seasonStartYears: Object.freeze([...years]) });
  return Object.freeze({
    status: 'ready', available: true, code: null, scope: scopeKind,
    seasonStartYears: Object.freeze([...years]), entries: Object.freeze([selected]),
    packageRefs: Object.freeze([selectedRef]), requiredCapabilities: Object.freeze(capabilities),
    selectionKey: `pooled-window:${packageKey(selected)}`,
  });
}

function isNativeFamilyEntry(entry) {
  // The package ID is not the contract. A rebuilt native package may have a
  // new immutable ID/version, so admit only a registry entry that explicitly
  // declares the full native Season Lab evidence bundle. This stays narrow:
  // a player-stat source has neither this registry entry nor these team
  // artifacts and can never become a fallback source.
  const kind = entry?.scope?.kind;
  if (kind !== 'exact-season' && kind !== 'pooled-window') return false;
  try { validateEntry(entry); } catch { return false; }
  const artifactIds = REQUIRED_ARTIFACTS.map(([artifactId]) => artifactId);
  return hasDeclaredArtifacts(entry, 'seasonSimulation', artifactIds)
    && hasDeclaredArtifacts(entry, 'historicalSeason', artifactIds);
}

function exactSeasonLabel(entry) {
  const start = Number(entry?.scope?.seasonStartYear);
  const end = Number(entry?.scope?.seasonEndYear);
  const season = Number.isSafeInteger(start) && Number.isSafeInteger(end)
    ? `${start}\u2013${String(end).slice(-2)}`
    : 'Exact season';
  const versionHint = String(entry?.packageVersion || '').split('-').at(-1)?.slice(0, 8);
  return `${season} \u00b7 Exact${versionHint ? ` \u00b7 ${versionHint}` : ''}`;
}

/**
 * Enumerate immutable native exact-season choices from the native registry.
 * This is intentionally registry-owned instead of deriving a request from
 * the Studio season picker or from package-name conventions.
 */
export function listNativeSeasonLabExactChoices(registryOrSource, {
  requiredCapabilities = SEASON_LAB_REQUIRED_CAPABILITIES,
} = {}) {
  assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-season-lab' });
  const registry = registryOrSource?.packageRegistry || registryOrSource;
  if (!isObject(registry) || !Array.isArray(registry.packages)) {
    fail('The native Season Lab package registry is unavailable.');
  }
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.some(capability => !String(capability || '').trim())) {
    fail('Native Season Lab required capabilities are invalid.');
  }
  const requestedCapabilities = Object.freeze([...new Set(requiredCapabilities.map(capability => String(capability).trim()))]);
  const entries = registry.packages.filter(entry => {
    try { validateEntry(entry); return entry.scope.kind === 'exact-season' && isNativeFamilyEntry(entry); } catch { return false; }
  }).sort((left, right) => (
    Number(right.scope.seasonStartYear) - Number(left.scope.seasonStartYear)
    || String(right.packageVersion).localeCompare(String(left.packageVersion))
    || String(right.packageId).localeCompare(String(left.packageId))
  ));
  return Object.freeze(entries.map(entry => {
    const request = Object.freeze({
      scope: 'exact-season',
      seasonStartYears: Object.freeze([Number(entry.scope.seasonStartYear)]),
      packageRefs: Object.freeze([Object.freeze({ packageId: entry.packageId, packageVersion: entry.packageVersion })]),
      requiredCapabilities: requestedCapabilities,
    });
    const selection = resolveNativeSeasonLabSelection(registry, request);
    return Object.freeze({
      key: `exact-season:${packageKey(entry)}`,
      label: exactSeasonLabel(entry),
      packageId: entry.packageId,
      packageVersion: entry.packageVersion,
      seasonStartYear: Number(entry.scope.seasonStartYear),
      available: selection.available,
      reason: selection.available ? null : selection.reason,
      request,
      selection,
    });
  }));
}

async function loadNativeSeasonLabExactChoices({
  registryUrl = REGISTRY_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  requiredCapabilities = SEASON_LAB_REQUIRED_CAPABILITIES,
} = {}) {
  assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-season-lab' });
  if (typeof fetchImpl !== 'function') fail('The native Season Lab registry is unavailable.');
  const registry = await loadRegistry(fetchImpl, registryUrl);
  return Object.freeze({
    registry,
    choices: listNativeSeasonLabExactChoices(registry, { requiredCapabilities }),
  });
}

async function loadIndex(fetchImpl, entry, registry, registryUrl) {
  const indexUrl = new URL(entry.projectionIndexPath, registryUrl);
  const { value: index } = await readJson(fetchImpl, indexUrl.toString(), 'The native Season Lab projection index');
  if (!isObject(index) || index.format !== SWISHIQ_PUBLIC_PROJECTION_FORMAT || index.projectionVersion !== 1
    || index.packageId !== entry.packageId || index.packageVersion !== entry.packageVersion
    || index.packageManifestSha256 !== entry.packageManifestSha256 || index.sourceLockSha256 !== entry.sourceLockSha256
    || index.modelId !== entry.modelId || index.normalizer !== entry.normalizer || index.metricsVersion !== entry.metricsVersion
    || !same(index.scope, entry.scope) || !Array.isArray(index.artifacts)
    || !isObject(index.capabilities) || await projectionContentSha256(index) !== index.contentSha256
    || index.contentSha256 !== entry.projectionContentSha256) {
    fail('The native Season Lab projection index failed its integrity check.');
  }
  return { index, indexUrl: indexUrl.toString(), packageRef: packageRef(entry, registry) };
}

function descriptorFor(index, artifactId, kind) {
  const descriptor = index.artifacts.find(item => item.artifactId === artifactId && item.kind === kind);
  if (!descriptor || typeof descriptor.path !== 'string' || !Number.isSafeInteger(descriptor.bytes)
    || !Number.isSafeInteger(descriptor.rows) || !/^[a-f0-9]{64}$/.test(String(descriptor.sha256 || ''))) {
    fail(`The native Season Lab package is missing its ${kind} artifact.`);
  }
  return descriptor;
}

async function loadPart(fetchImpl, packageData, artifactId, kind) {
  const descriptor = descriptorFor(packageData.index, artifactId, kind);
  const url = new URL(descriptor.path, packageData.indexUrl);
  const packageRoot = new URL('.', packageData.indexUrl);
  if (url.origin !== packageRoot.origin || !url.pathname.startsWith(packageRoot.pathname)) {
    fail(`The native ${kind} artifact escapes its package.`);
  }
  const source = await readText(fetchImpl, url.toString(), `The native ${kind} artifact`);
  if (new TextEncoder().encode(source).byteLength !== descriptor.bytes || await sha256Text(source) !== descriptor.sha256) {
    fail(`The native ${kind} artifact failed its byte-integrity check.`);
  }
  let value;
  try { value = JSON.parse(source); } catch { fail(`The native ${kind} artifact is malformed.`); }
  if (!isObject(value) || value.format !== SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT
    || value.artifactId !== artifactId || value.kind !== kind
    || value.packageId !== packageData.packageRef.packageId || value.packageVersion !== packageData.packageRef.packageVersion
    || value.packageManifestSha256 !== packageData.packageRef.packageManifestSha256
    || value.sourceLockSha256 !== packageData.packageRef.sourceLockSha256
    || value.modelId !== packageData.packageRef.modelId || value.normalizer !== packageData.packageRef.normalizer
    || value.metricsVersion !== packageData.packageRef.metricsVersion || !same(value.scope, packageData.packageRef.scope)
    || !Array.isArray(value.records) || value.records.length !== descriptor.rows) {
    fail(`The native ${kind} artifact does not match its package pins.`);
  }
  return value.records;
}

function buildPayloads(packageData, parts) {
  // Keep every verified phase profile. The Season Lab resolver chooses the
  // requested phase later and falls back to regular only when that team has
  // no phase-specific row; dropping playoff/tournament rows here would make
  // the fallback indistinguishable from missing package evidence.
  const styles = parts.get('team-styles').filter(row => isObject(row) && TEAM_CODE.test(String(row.teamCode || ''))
    && isObject(row.metrics)
    && SUPPORTED_PHASES.has(normalizedPhase(row.phase)));
  const memberships = parts.get('roster-memberships').filter(row => isObject(row) && V3_ROSTER_REF.test(String(row.rosterRef || ''))
    && V3_PLAYER_REF.test(String(row.playerRef || '')) && TEAM_CODE.test(String(row.teamCode || ''))
    && Array.isArray(row.positions) && row.phase === 'regular');
  const playerSeasons = parts.get('player-seasons').filter(row => isObject(row)
    && V3_PLAYER_SEASON_REF.test(String(row.playerSeasonRef || '')) && V3_PLAYER_REF.test(String(row.playerRef || ''))
    && TEAM_CODE.test(String(row.teamCode || '')) && row.phase === 'regular' && row.observed === true
    && (!row.scope || row.scope === 'team')
    && isObject(row.box) && isObject(row.metrics));
  const teams = [...new Set(styles.map(row => row.teamCode))].sort();
  if (teams.length !== 30 || new Set(memberships.map(row => row.teamCode)).size !== 30
    || new Set(playerSeasons.map(row => row.teamCode)).size !== 30) {
    fail('The native Season Lab package does not provide all 30 teams for regular-season use.');
  }
  const payloads = teams.map(team => {
    const seasonProfiles = {};
    for (const row of playerSeasons.filter(item => item.teamCode === team && typeof item.playerRef === 'string')) {
      const rows = seasonProfiles[row.playerRef] || [];
      const metricValue = name => {
        const candidate = row.metrics?.[name];
        return candidate?.status === 'available' && Number.isFinite(Number(candidate.value)) ? Number(candidate.value) : null;
      };
      const totalValue = (name, metricName) => Number.isFinite(Number(row.box?.[name]))
        ? Number(row.box[name])
        : Number.isFinite(Number(row.metrics?.[metricName]?.numerator)) ? Number(row.metrics[metricName].numerator) : null;
      rows.push({ seasonStartYear: row.seasonStartYear, phase: row.phase, scope: 'team', teamCode: row.teamCode,
        playerRef: row.playerRef, playerName: row.displayName, positions: row.positions,
        minutes: row.minutes,
        games: row.games, age: row.age ?? null, experience: row.experience ?? null,
        perGame: { points: metricValue('pointsPerGame'), assists: metricValue('assistsPerGame'), rebounds: metricValue('reboundsPerGame'),
          turnovers: metricValue('turnoversPerGame'), steals: metricValue('stealsPerGame'), blocks: metricValue('blocksPerGame') },
        totals: { points: totalValue('points', 'pointsPerGame'), assists: totalValue('assists', 'assistsPerGame'), rebounds: totalValue('rebounds', 'reboundsPerGame'),
          turnovers: totalValue('turnovers', 'turnoversPerGame'), steals: totalValue('steals', 'stealsPerGame'), blocks: totalValue('blocks', 'blocksPerGame') },
        source: 'published-player-seasons' });
      seasonProfiles[row.playerRef] = rows;
    }
    return {
      team,
      snapshot: `${packageData.packageRef.packageId}@${packageData.packageRef.packageVersion}`,
      nativeProfiles: styles.filter(row => row.teamCode === team).map(row => ({
        team,
        seasonStartYear: row.seasonStartYear,
        phase: row.phase,
        // The native team-style contract keeps the observed game count as
        // the points-per-game denominator. Carry it at the profile boundary
        // because the Season Lab simulator reports it from `profile.games`.
        // Do not infer a schedule count from the selected simulation setup.
        games: Number.isSafeInteger(row.metrics?.pointsPerGame?.denominator)
          ? row.metrics.pointsPerGame.denominator
          : null,
        metrics: row.metrics,
      })),
      seasonProfiles,
    };
  });
  return { teams, payloads };
}

async function loadPackage(fetchImpl, entry, registry, registryUrl) {
  const packageData = await loadIndex(fetchImpl, entry, registry, registryUrl);
  const parts = new Map();
  for (const [artifactId, kind] of REQUIRED_ARTIFACTS) {
    parts.set(artifactId, await loadPart(fetchImpl, packageData, artifactId, kind));
  }
  const built = buildPayloads(packageData, parts);
  return {
    entry,
    packageRef: packageData.packageRef,
    payloads: built.payloads,
    teams: built.teams,
  };
}

export async function loadNativeSeasonLabSource({
  registryUrl = REGISTRY_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  scope = null,
  seasonStartYears = null,
  packageRefs = null,
  acceptedPooledPackage = false,
  requiredCapabilities = [],
  includeNbaCupSchedule = false,
} = {}) {
  assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-season-lab' });
  if (typeof fetchImpl !== 'function') fail('The native Season Lab registry is unavailable.');
  const normalizedRequiredCapabilities = requiredCapabilities == null ? [] : requiredCapabilities;
  if (!Array.isArray(normalizedRequiredCapabilities)) fail('Native Season Lab required capabilities are invalid.');
  const registry = await loadRegistry(fetchImpl, registryUrl);
  const [scheduleSource, cupScheduleSource] = await Promise.all([
    loadScheduleArtifact(fetchImpl, registryUrl),
    includeNbaCupSchedule
      ? loadNbaCupScheduleArtifact(fetchImpl, registryUrl)
      : Promise.resolve({ artifact: null, sourceReceipt: Object.freeze({
        id: 'djhc-nba-cup-2026-27-published-schedule-v1', version: 'not-requested', contentSha256: null, url: null,
        reason: 'NBA Cup scenario inputs were not requested by this caller.',
      }) }),
  ]);
  const cupPriorSeasonRecords = includeNbaCupSchedule && scheduleSource.artifact
    ? deriveActualNbaTeamRecords(scheduleSource.artifact, {
      seasonStartYear: 2025,
      teamIds: NBA_TEAM_CODES,
      phases: ['regular'],
    })
    : { status: includeNbaCupSchedule ? 'unavailable' : 'not-requested', seasonStartYear: 2025,
      reason: includeNbaCupSchedule ? (scheduleSource.sourceReceipt?.reason || 'The exact 2025–26 schedule is unavailable.') : 'NBA Cup scenario inputs were not requested by this caller.' };
  const explicitSelection = scope !== null || seasonStartYears !== null || packageRefs !== null || acceptedPooledPackage === true || normalizedRequiredCapabilities.length > 0;
  const selection = explicitSelection
    ? resolveNativeSeasonLabSelection(registry, {
      scope: scope || (acceptedPooledPackage ? 'pooled-window' : 'exact-season'),
      seasonStartYears,
      packageRefs,
      acceptedPooledPackage,
      requiredCapabilities: normalizedRequiredCapabilities,
    })
    : null;
  if (selection && !selection.available) fail(selection.reason);
  const entries = (selection ? selection.entries : registry.packages.filter(isNativeFamilyEntry).map(validateEntry));
  if (!entries.length) fail('The complete native 2017–26 Season Lab package is not published in the local registry.');
  const packages = await Promise.all(entries.map(entry => loadPackage(fetchImpl, entry, registry, registryUrl)));
  const exact = packages.filter(item => item.entry.scope.kind === 'exact-season').sort((a, b) => a.entry.scope.seasonStartYear - b.entry.scope.seasonStartYear);
  const pooled = packages.find(item => item.entry.scope.kind === 'pooled-window');
  // Exact Season Lab pages remain usable when the separately scoped pooled
  // package has not published the Season Lab capability yet.  Pooled career
  // and composite capabilities do not authorize a pooled league simulation;
  // keep that scope unavailable instead of making every exact season fail to
  // load.  A pooled request still fails closed through the selection gate.
  if (!selection && (!exact.length
    || new Set(exact.map(item => item.entry.scope.seasonStartYear)).size !== exact.length)) {
    fail('The native Season Lab package set has no complete exact-season coverage.');
  }
  const teams = selection?.scope === 'pooled-window' ? pooled?.teams || [] : exact[0]?.teams || pooled?.teams || [];
  if (!teams.length) fail('The selected native Season Lab package has no verified teams.');
  const loadedPackageRefs = packages.map(item => Object.freeze({
    ...item.packageRef,
    seasonStartYear: item.entry.scope.seasonStartYear,
  }));
  const sourceYears = selection?.seasonStartYears
    || pooled?.entry.scope.seasonStartYears
    || exact.map(item => item.entry.scope.seasonStartYear);
  const selectedSource = selection
    ? Object.freeze({
      kind: selection.scope,
      packageId: packages.length === 1 ? packages[0].packageRef.packageId : null,
      packageVersion: packages.length === 1 ? packages[0].packageRef.packageVersion : null,
      packageRefs: Object.freeze(loadedPackageRefs),
      seasonStartYears: Object.freeze([...sourceYears]),
      seasonPackages: Object.freeze(loadedPackageRefs.filter(item => item.scope?.kind === 'exact-season')),
      acceptedPooledPackage: selection.scope === 'pooled-window',
      exactSeasonEvidence: selection.scope === 'exact-season',
    })
    : Object.freeze({
      kind: 'native-family',
      seasonStartYears: Object.freeze([...sourceYears]),
      packageRefs: Object.freeze(loadedPackageRefs),
    });
  return Object.freeze({
    phase: 'ready',
    receipt: SEASON_LAB_NATIVE_RECEIPT,
    packageRegistry: registry,
    source: selectedSource,
    teams: Object.freeze(teams.map(team => Object.freeze({ id: team, name: team }))),
    nativePackages: Object.freeze(packages),
    selection: selection || Object.freeze({ status: 'ready', available: true, scope: 'native-family', seasonStartYears: Object.freeze([...sourceYears]), entries: Object.freeze(entries), packageRefs: Object.freeze(loadedPackageRefs) }),
    scheduleArtifact: scheduleSource.artifact,
    scheduleSourceReceipt: scheduleSource.sourceReceipt,
    cupScheduleArtifact: cupScheduleSource.artifact,
    cupScheduleSourceReceipt: cupScheduleSource.sourceReceipt,
    cupPriorSeasonRecords: Object.freeze(cupPriorSeasonRecords),
  });
}

/**
 * Select already loaded native package wrappers for a concrete Season Lab
 * request and merge only the explicitly selected exact seasons. This keeps a
 * multi-season roster payload traceable to each package instead of treating a
 * pooled window as an implicit historical substitute.
 */
export function selectNativeSeasonLabPackages(source, options = {}) {
  const loadedSelection = source?.selection;
  const hasExplicitOptions = isObject(options) && Object.keys(options).length > 0;
  const request = !hasExplicitOptions && loadedSelection?.scope && loadedSelection.scope !== 'native-family'
    ? {
      scope: loadedSelection.scope,
      seasonStartYears: loadedSelection.seasonStartYears,
      packageRefs: loadedSelection.packageRefs,
      acceptedPooledPackage: loadedSelection.scope === 'pooled-window',
      requiredCapabilities: loadedSelection.requiredCapabilities || [],
    }
    : options;
  const selection = resolveNativeSeasonLabSelection(source, request);
  if (!selection.available) fail(selection.reason);
  const loadedPackages = Array.isArray(source?.nativePackages) ? source.nativePackages : [];
  const packages = selection.entries.map(entry => loadedPackages.find(item => packageKey(item.entry) === packageKey(entry))).filter(Boolean);
  if (packages.length !== selection.entries.length) fail('The selected native Season Lab package parts are not loaded.');
  const byTeam = new Map();
  for (const item of packages) {
    for (const payload of item.payloads || []) {
      const existing = byTeam.get(payload.team) || { ...payload, nativeProfiles: [], seasonProfiles: {} };
      const packagePin = Object.freeze({ ...item.packageRef, seasonStartYear: item.entry.scope.seasonStartYear });
      existing.nativeProfiles.push(...(payload.nativeProfiles || []).map(profile => ({ ...profile, packageRef: packagePin })));
      for (const [playerRef, rows] of Object.entries(payload.seasonProfiles || {})) {
        const current = existing.seasonProfiles[playerRef] || [];
        existing.seasonProfiles[playerRef] = current.concat((Array.isArray(rows) ? rows : []).map(row => ({ ...row, packageRef: packagePin })));
      }
      existing.packageRefs = [...(existing.packageRefs || []), packagePin];
      byTeam.set(payload.team, existing);
    }
  }
  const payloads = [...byTeam.values()].map(payload => ({
    ...payload,
    packageRefs: Object.freeze(payload.packageRefs || []),
    nativeProfiles: Object.freeze(payload.nativeProfiles || []),
    seasonProfiles: Object.freeze(Object.fromEntries(Object.entries(payload.seasonProfiles || {}).map(([id, rows]) => [id, Object.freeze(rows)]))),
  }));
  return Object.freeze({
    status: 'ready', available: true, selection,
    packages: Object.freeze(packages), payloads: Object.freeze(payloads),
    teams: Object.freeze([...new Set(payloads.map(payload => payload.team))].sort()),
  });
}

export function nativeLabIsPublished(source) {
  // The adapter receipt describes the implementation contract. Publication is
  // decided by the selected package entries and their capability receipts, so
  // a future registry promotion can open this panel without a code change.
  if (source?.phase !== 'ready') return false;
  const packages = Array.isArray(source.nativePackages) ? source.nativePackages : [];
  const requiredCapabilities = Array.isArray(source.selection?.requiredCapabilities)
    && source.selection.requiredCapabilities.length
    ? source.selection.requiredCapabilities
    : SEASON_LAB_REQUIRED_CAPABILITIES;
  return packages.length > 0 && packages.every(item => requiredCapabilities.every(capability => item.entry?.capabilities?.[capability]?.status === 'available'));
}

function setNativeSourceState(element, label, state = '') {
  if (!element) return;
  element.textContent = label;
  if (state) element.dataset.state = state;
  else delete element.dataset.state;
  element.classList.toggle('swishiq-state--ready', state === 'available');
}

/**
 * Add the Season Lab-only visual contract without changing the shared Studio
 * shell. The engine owns the result tables, so this decorator supplies the
 * column labels that let the dedicated stylesheet switch compact evidence
 * tables into readable cards on narrow screens.
 */
function decorateSeasonLabDom(documentRef, root) {
  if (!root) return;
  root.classList?.add('swishiq-season-lab--visual-v2');
  root.dataset.visualsReady = 'true';

  const addClass = (selector, className) => root.querySelector(selector)?.classList?.add(className);
  addClass(':scope > form', 'season-lab-setup');
  addClass(':scope > form > .studio-league-teams', 'season-lab-team-selector');
  addClass(':scope > form > .season-setup-groups', 'season-lab-scope-grid');
  addClass(':scope > form > .studio-panel', 'season-lab-advanced');
  addClass(':scope > form > .studio-team-form', 'season-lab-actions');
  addClass(':scope > #leagueStatus', 'season-lab-status');
  addClass(':scope > #leagueResults', 'season-lab-results');
  addClass(':scope > .studio-franchise-panel', 'season-lab-franchise');
  root.querySelectorAll('.season-setup-group').forEach((group, index) => group.classList.add(index ? 'season-lab-setup-group--run' : 'season-lab-setup-group--scope'));
  root.querySelectorAll('.season-setup-group').forEach(group => group.classList.add('season-lab-setup-group'));

  // The engine intentionally owns these nodes, but the visual layer can still
  // give the setup a mockup-style hero without changing any source semantics.
  const heading = root.querySelector('#leagueLabTitle');
  if (heading && !root.querySelector('.season-lab-hero')) {
    const hero = documentRef.createElement('header');
    hero.className = 'season-lab-hero';
    const copy = documentRef.createElement('div');
    copy.className = 'season-lab-hero__copy';
    const kicker = documentRef.createElement('span');
    kicker.className = 'season-lab-hero__kicker';
    kicker.textContent = 'Season outlook';
    const description = heading.nextElementSibling;
    const note = description?.nextElementSibling;
    copy.append(kicker, heading);
    if (description) { description.classList.add('season-lab-hero__description'); copy.append(description); }
    if (note) { note.classList.add('season-lab-hero__note'); copy.append(note); }
    const meta = documentRef.createElement('div');
    meta.className = 'season-lab-hero__meta';
    ['Built from game data', 'Replayable scenarios', 'Responsive by design'].forEach(label => {
      const badge = documentRef.createElement('span');
      badge.className = 'season-lab-hero__badge';
      badge.textContent = label;
      meta.append(badge);
    });
    hero.append(copy, meta);
    root.insertBefore(hero, root.firstChild);
  }

  const ensureTeamHeader = () => {
    const field = root.querySelector(':scope > form > .studio-league-teams');
    if (!field || field.querySelector('.season-lab-team-selector__header')) return;
    const header = documentRef.createElement('div');
    header.className = 'season-lab-team-selector__header';
    const kicker = documentRef.createElement('span');
    kicker.className = 'season-lab-team-selector__kicker';
    kicker.textContent = 'League scope';
    const title = documentRef.createElement('h3');
    title.className = 'season-lab-team-selector__title';
    title.textContent = 'Choose your teams';
    header.append(kicker, title);
    field.prepend(header);
  };
  ensureTeamHeader();
  const teamHelp = root.querySelector('#leagueTeamHelp');
  if (teamHelp) teamHelp.textContent = 'Select teams for this mini-league. Use Ctrl/Command or Shift to choose multiple.';

  const decorateTables = () => {
    root.querySelectorAll?.('.season-results-table .studio-table').forEach(tableNode => {
      const labels = [...tableNode.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
      tableNode.querySelectorAll('tbody tr').forEach(row => {
        [...row.children].forEach((cell, index) => {
          if (labels[index] && !cell.dataset.label) cell.dataset.label = labels[index];
          if (cell.dataset.columnIndex !== String(index)) cell.dataset.columnIndex = String(index);
        });
      });
      if (tableNode.dataset.visualLayout !== 'evidence-table') tableNode.dataset.visualLayout = 'evidence-table';
    });
    root.querySelectorAll('.season-result-section').forEach(section => {
      const tableKind = section.querySelector('[data-season-table]')?.dataset.seasonTable;
      if (tableKind) section.dataset.primaryTable = tableKind;
    });
  };

  decorateTables();
  const Observer = documentRef?.defaultView?.MutationObserver || globalThis.MutationObserver;
  // Reports invoke the decorator again after the engine replaces its result
  // subtree. Keep one panel observer alive instead of attaching another
  // observer for every completed simulation.
  if (typeof Observer === 'function' && !root.__seasonLabVisualObserver) {
    const observer = new Observer(() => { ensureTeamHeader(); decorateTables(); });
    observer.observe(root, { childList: true, subtree: true });
    root.__seasonLabVisualObserver = observer;
  }
}

function shareFail(message) {
  throw new TypeError(`Season Lab public share: ${message}`);
}

function typedV4SeasonShareUnavailable(cause) {
  const error = new TypeError('Season Lab V4 sharing is unavailable because the V4 input adapter does not provide an approved Season Lab model result.');
  error.name = 'V4SeasonLabShareUnavailableError';
  error.code = 'v4-season-share-unavailable';
  error.status = 'unavailable';
  error.cause = cause;
  return error;
}

function assertSeasonLabShareSourceAllowed(releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN) {
  try {
    return assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-season-lab', releasePin });
  } catch (cause) {
    if (cause?.code === 'v4-required') throw typedV4SeasonShareUnavailable(cause);
    throw cause;
  }
}

function samePackagePin(left, right) {
  return Boolean(left && right)
    && ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
      'projectionContentSha256', 'modelId', 'normalizer', 'metricsVersion',
      'registryVersion', 'registryRevisionSha256'].every(key => String(left[key] || '') === String(right[key] || ''))
    && left.scope?.kind === right.scope?.kind
    && Number(left.scope?.seasonStartYear) === Number(right.scope?.seasonStartYear)
    && Number(left.scope?.seasonEndYear) === Number(right.scope?.seasonEndYear);
}

/**
 * Build only the Phase 8 public allowlist for one completed exact-season run.
 * The report itself, team rows, rates, and simulation frequencies never enter
 * the public summary. Package bytes and capabilities have already been
 * validated by loadNativeSeasonLabSource; the retained report receipt must
 * still match that exact loaded pin.
 */
export function buildSeasonLabPublicResultShareSummary({ report, source, releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } = {}) {
  assertSeasonLabShareSourceAllowed(releasePin);
  if (report?.status !== 'complete' || !Array.isArray(report.seasons) || report.seasons.length !== 1) {
    shareFail('only one completed exact-season result can be shared.');
  }
  const year = Number(report.setup?.horizon?.seasonStartYears?.[0]);
  const season = report.seasons[0];
  const setupSource = report.setup?.source;
  const receipt = season?.provenance?.source;
  const selection = source?.selection;
  if (!Number.isSafeInteger(year) || season?.status !== 'complete'
    || Number(season.seasonStartYear) !== year
    || Number(report.setup?.horizon?.seasonStartYears?.length) !== 1
    || setupSource?.kind !== 'exact-season' || setupSource.exactSeasonEvidence !== true
    || !Array.isArray(setupSource.seasonPackages) || setupSource.seasonPackages.length !== 1
    || Number(setupSource.seasonPackages[0]?.seasonStartYear) !== year
    || receipt?.kind !== 'exact-season' || Number(receipt.seasonStartYear) !== year
    || !Array.isArray(season.provenance?.phases) || !season.provenance.phases.includes('regular')) {
    shareFail('the result does not retain a single completed regular-phase exact-season receipt.');
  }
  if (selection?.status !== 'ready' || selection.available !== true || selection.scope !== 'exact-season'
    || !Array.isArray(selection.entries) || selection.entries.length !== 1
    || !Array.isArray(selection.packageRefs) || selection.packageRefs.length !== 1
    || Number(selection.seasonStartYears?.length) !== 1 || Number(selection.seasonStartYears[0]) !== year) {
    shareFail('the loaded exact-season package selection is unavailable or ambiguous.');
  }
  const entry = selection.entries[0];
  const packageRef = selection.packageRefs[0];
  const reportRef = receipt.packageRef;
  const setupRef = setupSource.seasonPackages[0];
  const registry = source.packageRegistry;
  if (entry?.scope?.kind !== 'exact-season' || Number(entry.scope.seasonStartYear) !== year
    || Number(entry.scope.seasonEndYear) !== year + 1
    || !entry.scope.phases?.includes('regular')
    || entry.capabilities?.historicalSeason?.status !== 'available'
    || entry.capabilities?.seasonSimulation?.status !== 'available'
    || !registry?.registryVersion || !/^[a-f0-9]{64}$/.test(String(registry.registryRevisionSha256 || ''))
    || !samePackagePin(packageRef, reportRef) || !samePackagePin(packageRef, setupRef)
    || String(packageRef.registryVersion || '') !== String(registry.registryVersion)
    || String(packageRef.registryRevisionSha256 || '') !== String(registry.registryRevisionSha256)) {
    shareFail('the completed result is not bound to the loaded exact-season package proof.');
  }
  return projectPublicResultShareV1({
    tool: 'swishiq-studio',
    scenarioKind: 'season',
    packagePin: {
      packageId: packageRef.packageId,
      packageVersion: packageRef.packageVersion,
      modelId: packageRef.modelId,
      metricsVersion: packageRef.metricsVersion,
      packageManifestSha256: packageRef.packageManifestSha256,
      sourceLockSha256: packageRef.sourceLockSha256,
      registryVersion: packageRef.registryVersion,
      registryRevisionSha256: packageRef.registryRevisionSha256,
      projectionContentSha256: packageRef.projectionContentSha256,
      normalizer: packageRef.normalizer,
      scope: {
        kind: 'exact-season',
        seasonStartYear: year,
        seasonEndYear: year + 1,
        phase: 'regular',
      },
    },
    result: { status: 'complete' },
  });
}

function preferredSeasonShareMethod(windowRef) {
  if (typeof windowRef?.navigator?.share === 'function') return 'native';
  if (typeof windowRef?.navigator?.clipboard?.writeText === 'function') return 'clipboard';
  return '';
}

/** Mount an accessible status-only share action after a completed report. */
export function renderSeasonLabPublicShareAction(documentRef, resultsRoot, report, source, {
  windowRef = globalThis.window,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} = {}) {
  if (!documentRef?.createElement || !resultsRoot?.append) return null;
  let summary = null;
  let unavailableError = null;
  let resultEligible = true;
  try { summary = buildSeasonLabPublicResultShareSummary({ report, source, releasePin }); }
  catch (error) {
    resultEligible = false;
    if (error?.code === 'v4-season-share-unavailable') unavailableError = error;
  }
  const shareMethod = preferredSeasonShareMethod(windowRef);
  const available = Boolean(resultEligible && summary && shareMethod
    && isSignedPublicResultShareAvailable({ windowRef, shareMethod }));
  const section = documentRef.createElement('section');
  section.className = 'season-result-section season-result-section--provenance season-result-section--public-share';
  section.dataset.seasonPublicShare = 'true';
  section.dataset.resultShareStatus = resultEligible ? 'ready' : 'unavailable';
  if (unavailableError) section.dataset.resultShareErrorCode = unavailableError.code;
  section.setAttribute('aria-labelledby', 'seasonLabPublicShareTitle');
  const header = documentRef.createElement('div');
  header.className = 'season-result-section__header';
  const eyebrow = documentRef.createElement('span');
  eyebrow.className = 'studio-eyebrow';
  eyebrow.textContent = 'Privacy-limited result';
  const heading = documentRef.createElement('h4');
  heading.id = 'seasonLabPublicShareTitle';
  heading.textContent = 'Share a completed result';
  header.append(eyebrow, heading);
  section.append(header);
  const explanation = documentRef.createElement('p');
  explanation.className = 'studio-muted';
  explanation.textContent = !resultEligible
    ? unavailableError
      ? 'V4 source inputs do not approve the Season Lab model output. No V3 share summary is used after V4 is selected.'
      : 'Only one completed regular-phase result with a current exact-season package pin can be shared.'
    : available
      ? 'Only completion status and package ID, version, hashes, and exact-season scope checked against the current registry are shared. Team and player details, scenario inputs, rates, and simulation probabilities are omitted. The signature authenticates this submitted status; the service checks approved fields and package pins/capability but does not rerun the season simulation or independently verify its evidence.'
      : 'If secure sharing is configured, only completion status and the exact-season package pin would be included. Team and player details, scenario inputs, rates, and simulation probabilities would be omitted. No link has been created.';
  section.append(explanation);
  const actions = documentRef.createElement('div');
  actions.className = 'season-result-public-share__actions';
  const button = documentRef.createElement('button');
  button.className = available ? 'button' : 'button-secondary';
  button.type = 'button';
  button.textContent = available ? 'Share completion status' : 'Secure sharing unavailable';
  button.disabled = !available;
  button.dataset.action = 'share-season-result';
  const status = documentRef.createElement('p');
  status.className = 'studio-muted';
  status.id = 'seasonLabPublicShareStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = unavailableError
    ? `V4 result share unavailable (${unavailableError.code}). No V3 result was shared.`
    : resultEligible
    ? available
      ? 'No link is created until you activate Share completion status.'
      : shareMethod
        ? 'Secure sharing requires a reviewed trusted public signing key and the configured share service. No link has been created.'
        : 'Secure sharing is unavailable in this browser. No link has been created.'
    : 'No public share link is available for this result.';
  button.setAttribute('aria-describedby', status.id);
  actions.append(button, status);
  section.append(actions);
  resultsRoot.append(section);

  button.addEventListener('click', async () => {
    if (button.disabled || !summary || !available) return;
    button.disabled = true;
    try {
      const signedShare = await createSignedPublicResultShareLink(summary, {
        toolId: 'swishiq-studio',
        shareMethod,
        windowRef,
      });
      if (shareMethod === 'native') {
        await windowRef.navigator.share({
          title: 'Season Lab · SwishIQ',
          text: 'A signed Season Lab completion summary with its current exact-season package pin. The signer did not rerun the simulation or verify its evidence.',
          url: signedShare.url,
        });
      } else {
        await windowRef.navigator.clipboard.writeText(signedShare.url);
      }
      signedShare.recordShared();
      status.textContent = shareMethod === 'native' ? 'Signed completion summary shared.' : 'Signed completion summary link copied.';
    } catch (error) {
      status.textContent = error?.name === 'AbortError'
        ? 'Sharing canceled. No completed share was recorded.'
        : 'Sharing failed. No public link was shared.';
    } finally {
      button.disabled = false;
    }
  });
  return section;
}

function seasonCupLabel(value, fallback = 'Unavailable') {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const labels = {
    groupWins: 'Group wins',
    headToHead: 'Head-to-head',
    headToHeadWinRate: 'Head-to-head win rate',
    pointDifferential: 'Point differential',
    totalPoints: 'Total points',
    priorSeasonRecord: 'Prior-season record',
    seededDraw: 'Seeded draw',
    teamId: 'Team',
    qualification: 'Qualification',
    'group-play-wins': 'Group Play wins',
    'head-to-head-record-within-tied-group': 'Head-to-head record within tied group',
    'group-point-differential': 'Group point differential',
    'group-total-points-excluding-overtime': 'Group total points excluding overtime',
    'prior-season-wins': 'Prior-season wins',
    'prior-season-losses': 'Prior-season losses',
    'seeded-random-draw': 'Seeded random draw',
    'team-id-final-fallback': 'Team code final fallback',
  };
  return labels[text] || text.replace(/[-_]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function seasonCupValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(seasonCupValue).join(' / ');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${seasonCupLabel(key)} ${seasonCupValue(item)}`).join(', ');
  return String(value);
}

function seasonCupTiebreakRows(receipt) {
  const trace = receipt?.tiebreakTrace;
  const rows = [];
  const addTie = (scope, teams, outcome, criteria) => {
    const contenders = Array.isArray(teams) ? teams.join(', ') : seasonCupValue(teams);
    const steps = Array.isArray(criteria) ? criteria : [];
    if (!steps.length) {
      rows.push([scope, contenders, 'Resolution', seasonCupLabel(outcome), '—', '—', '—']);
      return;
    }
    steps.forEach(step => rows.push([
      scope,
      contenders,
      seasonCupLabel(step.criterion),
      seasonCupValue(step.scoresByTeam),
      Array.isArray(step.orderedTeamIds) ? step.orderedTeamIds.join(' → ') : '—',
      Array.isArray(step.unresolvedTeamIds) && step.unresolvedTeamIds.length ? step.unresolvedTeamIds.join(', ') : '—',
      seasonCupLabel(outcome),
    ]));
  };

  (Array.isArray(trace?.groups) ? trace.groups : []).forEach(group => {
    (Array.isArray(group?.ties) ? group.ties : []).forEach(tie => addTie(
      `${String(group.conference || '').toUpperCase()} · ${group.groupId || 'Group'}`,
      tie.tiedTeamIds,
      tie.resolvedBy || tie.orderedTeamIds?.join(' → '),
      tie.criteria,
    ));
  });
  (Array.isArray(trace?.wildCards) ? trace.wildCards : []).forEach(wildCard => addTie(
    `${String(wildCard.conference || '').toUpperCase()} wildcard`,
    wildCard.candidateTeamIds,
    wildCard.resolvedBy || wildCard.selectedTeamId,
    wildCard.criteria,
  ));
  (Array.isArray(trace?.conferenceSeeds) ? trace.conferenceSeeds : []).forEach(seed => {
    const ties = Array.isArray(seed?.ties) ? seed.ties : [seed];
    ties.forEach(tie => {
      const teams = tie.tiedTeamIds || tie.candidateTeamIds || tie.teamIds;
      if (!Array.isArray(tie?.criteria) && !teams) return;
      addTie(
        `${String(seed?.conference || tie?.conference || '').toUpperCase()} conference seed`,
        teams,
        tie.resolvedBy || tie.orderedTeamIds?.join(' → '),
        tie.criteria,
      );
    });
  });
  return rows;
}

function seasonCupTable(documentRef, { title, headers, rows, kind }) {
  const block = documentRef.createElement('div');
  block.className = 'season-results-table season-cup-replay-results__table-block';
  block.dataset.seasonTable = kind;
  const wrap = documentRef.createElement('div');
  wrap.className = 'studio-table-wrap season-cup-replay-results__table-wrap';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', `${title}; scroll horizontally to see all columns`);
  const table = documentRef.createElement('table');
  table.className = 'studio-table season-cup-replay-results__table';
  table.dataset.visualLayout = 'evidence-table';
  const caption = documentRef.createElement('caption');
  caption.textContent = title;
  table.append(caption);
  const thead = documentRef.createElement('thead');
  const headerRow = documentRef.createElement('tr');
  headers.forEach(label => {
    const cell = documentRef.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  });
  thead.append(headerRow);
  table.append(thead);
  const tbody = documentRef.createElement('tbody');
  if (!rows.length) {
    const tableRow = documentRef.createElement('tr');
    const cell = documentRef.createElement('td');
    cell.colSpan = headers.length;
    cell.textContent = 'No rows are available for this replay.';
    tableRow.append(cell);
    tbody.append(tableRow);
  }
  rows.forEach(row => {
    const tableRow = documentRef.createElement('tr');
    row.forEach((value, index) => {
      const cell = documentRef.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      cell.textContent = String(value ?? '—');
      cell.dataset.label = headers[index] || '';
      tableRow.append(cell);
    });
    tbody.append(tableRow);
  });
  table.append(tbody);
  wrap.append(table);
  block.append(wrap);
  const hint = documentRef.createElement('p');
  hint.className = 'studio-table-hint studio-muted';
  hint.textContent = 'Scroll this table sideways on narrow screens.';
  block.append(hint);
  return block;
}

function seasonCupDisclosure(documentRef, summary, content) {
  const disclosure = documentRef.createElement('details');
  disclosure.className = 'season-cup-replay-results__disclosure';
  const summaryNode = documentRef.createElement('summary');
  summaryNode.textContent = summary;
  disclosure.append(summaryNode, content);
  return disclosure;
}

function renderSeasonCupReplayResults(documentRef, root, report) {
  const cup = report?.seasons?.[0]?.cupCompletion;
  const legacyTitle = root?.querySelector?.('#seasonCupCompletionTitle');
  const legacySection = legacyTitle?.closest?.('.season-result-section');
  const oldRegion = root?.querySelector?.('[data-season-cup-results]');
  const results = root?.querySelector?.('#leagueResults');
  if (!cup || !results) {
    oldRegion?.remove();
    legacySection?.remove();
    return;
  }

  const receipts = (Array.isArray(cup.replayReceipts) ? cup.replayReceipts : [])
    .filter(receipt => receipt && Number.isInteger(Number(receipt.repeat)))
    .sort((left, right) => Number(left.repeat) - Number(right.repeat));
  const sourceReceipt = cup.publishedSchedule?.sourceReceipt || {};
  const priorReceipt = cup.priorSeasonRecordsSourceReceipt || {};
  const section = documentRef.createElement('section');
  section.className = 'season-result-section season-cup-replay-results';
  section.dataset.seasonCupResults = 'true';
  section.setAttribute('aria-labelledby', 'seasonLabCupReplayTitle');
  const header = documentRef.createElement('div');
  header.className = 'season-result-section__header';
  const eyebrow = documentRef.createElement('span');
  eyebrow.className = 'studio-eyebrow';
  eyebrow.textContent = 'Modeled competition';
  const heading = documentRef.createElement('h4');
  heading.id = 'seasonLabCupReplayTitle';
  heading.textContent = 'NBA Cup replay results';
  const replayCount = Math.max(1, Number(report.repeatCount) || receipts.length || 1);
  header.append(eyebrow, heading);
  section.append(header);

  const controls = documentRef.createElement('div');
  controls.className = 'season-cup-replay-results__controls';
  let selectedRepeat = String(receipts[0]?.repeat ?? 1);
  if (receipts.length > 1) {
    const label = documentRef.createElement('label');
    label.htmlFor = 'seasonLabCupReplaySelect';
    label.textContent = 'Replay';
    const select = documentRef.createElement('select');
    select.id = 'seasonLabCupReplaySelect';
    receipts.forEach(receipt => {
      const option = documentRef.createElement('option');
      option.value = String(receipt.repeat);
      option.textContent = `Replay ${receipt.repeat} · seed ${receipt.seed || 'unavailable'}`;
      select.append(option);
    });
    select.value = selectedRepeat;
    controls.append(label, select);
    select.addEventListener('change', () => {
      selectedRepeat = select.value;
      renderSelectedReplay();
    });
  }
  const status = documentRef.createElement('p');
  status.className = 'season-cup-replay-results__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  controls.append(status);
  section.append(controls);

  const summary = documentRef.createElement('p');
  summary.className = 'studio-muted season-cup-replay-results__summary';
  summary.textContent = 'No roster moves are modeled for this 2026–27 scenario.';
  section.append(summary);
  const coverage = cup.coverage || {};
  const appearances = Object.values(coverage.appearancesPerTeam || {});
  const appearanceText = appearances.length && appearances.every(count => Number(count) === 82)
    ? '82 standings games per team'
    : 'per-team schedule coverage unavailable';
  const coverageLine = documentRef.createElement('p');
  coverageLine.className = 'studio-muted season-cup-replay-results__coverage';
  coverageLine.textContent = `${coverage.announcedGamesPreserved ?? cup.publishedSchedule?.announcedGames ?? '1,200'} published games preserved · ${coverage.standingsEligibleGames ?? report.seasons?.[0]?.standingsGames ?? '—'} standings-eligible games · ${coverage.generatedGames ?? receipts[0]?.games?.length ?? cup.games?.length ?? '—'} completion games · ${appearanceText} · up to ${coverage.maximumOvertimePeriods ?? '—'} OT periods.`;
  section.append(coverageLine);
  const sourceLine = documentRef.createElement('p');
  sourceLine.className = 'studio-muted season-cup-replay-results__receipts';
  const scheduleId = sourceReceipt.id || sourceReceipt.version || cup.sourceReceipt?.id || 'unavailable';
  const priorId = priorReceipt.scheduleId || priorReceipt.id || priorReceipt.source?.provider || 'unavailable';
  sourceLine.textContent = `Sources: 2026–27 schedule ${scheduleId} · exact 2025–26 records ${priorId}.`;
  section.append(sourceLine);
  const methodNote = documentRef.createElement('p');
  methodNote.className = 'studio-muted season-cup-replay-results__method-note';
  methodNote.textContent = 'Completion matchups are seeded, not NBA-published fixtures.';
  section.append(methodNote);

  const content = documentRef.createElement('div');
  content.className = 'season-cup-replay-results__content';
  section.append(content);

  function renderSelectedReplay() {
    const receipt = receipts.find(item => String(item.repeat) === selectedRepeat) || receipts[0] || {
      repeat: 1,
      replayKey: report.seasons?.[0]?.replayKey || null,
      seed: cup.seed || null,
      groupPlayLedger: null,
      groupStandings: cup.groupStandings,
      conferenceRankings: cup.conferenceRankings,
      qualifiers: cup.qualifiers,
      games: cup.games,
      coverage: cup.coverage,
      tiebreakTrace: null,
    };
    const currentRun = Number(receipt.repeat) || 1;
    status.textContent = `Replay ${currentRun} of ${replayCount} · seed ${receipt.seed || 'unavailable'}${receipt.replayKey ? ` · key ${receipt.replayKey}` : ''}.`;
    content.replaceChildren();

    const qualifierRows = (Array.isArray(receipt.qualifiers) ? receipt.qualifiers : []).map(row => [
      row.conference?.toUpperCase() || '—',
      row.conferenceSeed ?? '—',
      row.teamId || '—',
      row.qualification === 'group-winner' ? 'Group winner' : row.qualification === 'wild-card' ? 'Wildcard' : seasonCupLabel(row.qualification),
      row.groupId || '—',
      `${row.wins ?? '—'}–${row.losses ?? '—'}`,
    ]);
    const qualifierHeading = documentRef.createElement('h5');
    qualifierHeading.textContent = 'Cup qualifiers';
    content.append(qualifierHeading, seasonCupTable(documentRef, {
      title: `Replay ${currentRun} Cup qualifiers and conference seeds`,
      headers: ['Conference', 'Seed', 'Team', 'Qualification', 'Group', 'Group record'],
      rows: qualifierRows,
      kind: 'cup-qualifiers',
    }));

    const conferenceRankByTeam = new Map();
    Object.entries(receipt.conferenceRankings || {}).forEach(([conference, ranking]) => {
      [...(ranking?.qualifiers || []), ...(ranking?.eliminated || [])].forEach(row => {
        if (row.teamId) conferenceRankByTeam.set(row.teamId, { conference: conference.toUpperCase(), rank: row.conferenceRank });
      });
    });
    const standingRows = (Array.isArray(receipt.groupStandings) ? receipt.groupStandings : []).map(row => [
      row.groupId || '—',
      row.conference?.toUpperCase() || '—',
      row.groupRank ?? '—',
      row.teamId || '—',
      `${row.wins ?? '—'}–${row.losses ?? '—'}`,
      `${Number(row.pointDifferential) > 0 ? '+' : ''}${row.pointDifferential ?? '—'}`,
      row.totalPoints ?? '—',
      `${row.priorSeasonRecord?.wins ?? '—'}–${row.priorSeasonRecord?.losses ?? '—'}`,
      conferenceRankByTeam.get(row.teamId)?.rank ?? '—',
    ]);
    const standingsHeading = documentRef.createElement('h5');
    standingsHeading.textContent = 'Group standings';
    const standingsNote = documentRef.createElement('p');
    standingsNote.className = 'studio-muted';
    standingsNote.textContent = 'Cup differential and total-points tiebreak values exclude overtime points; prior record is the exact 2025–26 baseline.';
    content.append(standingsHeading, standingsNote, seasonCupTable(documentRef, {
      title: `Replay ${currentRun} NBA Cup group standings`,
      headers: ['Group', 'Conference', 'Group rank', 'Team', 'W–L', 'Point differential', 'Total points', '2025–26 prior W–L', 'Cup conference rank'],
      rows: standingRows,
      kind: 'cup-standings',
    }));

    const tiebreakRows = seasonCupTiebreakRows(receipt);
    const tiebreakHeading = documentRef.createElement('h5');
    tiebreakHeading.textContent = 'Tiebreak evidence';
    content.append(tiebreakHeading);
    if (tiebreakRows.length) {
      content.append(seasonCupTable(documentRef, {
        title: `Replay ${currentRun} Cup tiebreak steps`,
        headers: ['Scope', 'Teams compared', 'Criterion', 'Scores', 'Order after step', 'Still tied', 'Resolution'],
        rows: tiebreakRows,
        kind: 'cup-tiebreaks',
      }));
    } else {
      const noTies = documentRef.createElement('p');
      noTies.className = 'studio-muted';
      noTies.textContent = receipt.tiebreakTrace
        ? 'No secondary group, wildcard, or conference-seed tiebreak was needed in this replay.'
        : 'Tiebreak trace is unavailable for this model response.';
      content.append(noTies);
    }

    const groupGames = receipt.groupPlayLedger?.games;
    const groupRows = Array.isArray(groupGames) ? groupGames.map(game => [
      game.groupId || '—',
      game.conference?.toUpperCase() || '—',
      game.id || '—',
      `${game.home || '—'} vs ${game.away || '—'}`,
      `${game.homeScore ?? '—'}–${game.awayScore ?? '—'}`,
      Number(game.overtimePeriods) > 0 ? game.overtimePeriods : '—',
      `${game.homeOvertimePoints ?? 0}–${game.awayOvertimePoints ?? 0}`,
    ]) : [];
    const groupBlock = documentRef.createElement('div');
    if (groupRows.length) {
      groupBlock.append(seasonCupTable(documentRef, {
        title: `Replay ${currentRun} Group Play results`,
        headers: ['Group', 'Conference', 'Published game ID', 'Matchup', 'Final score', 'OT periods', 'OT points H–A'],
        rows: groupRows,
        kind: 'cup-group-games',
      }));
    } else {
      const unavailable = documentRef.createElement('p');
      unavailable.className = 'studio-muted';
      unavailable.textContent = 'Group Play game results are unavailable for this model response.';
      groupBlock.append(unavailable);
    }
    const groupCount = receipt.groupPlayLedger?.count ?? groupRows.length;
    const groupDisclosure = seasonCupDisclosure(documentRef, `Group Play game ledger · ${groupCount} results`, groupBlock);
    groupDisclosure.dataset.seasonCupGroupLedger = 'true';
    content.append(groupDisclosure);

    const completionGames = Array.isArray(receipt.games) ? receipt.games : [];
    const completionRows = completionGames.map(game => [
      seasonCupLabel(game.round || game.cupRound || game.stage, 'Completion'),
      seasonCupLabel(game.phase),
      game.conference?.toUpperCase() || '—',
      `${game.home || game.homeTeamId || '—'}${game.homeSeed ? ` (#${game.homeSeed})` : ''}`,
      `${game.away || game.awayTeamId || '—'}${game.awaySeed ? ` (#${game.awaySeed})` : ''}`,
      `${game.scoreHome ?? '—'}–${game.scoreAway ?? '—'}`,
      game.winner || '—',
      game.overtimes ?? '—',
      game.standingsEligible === true ? 'Yes' : 'No',
    ]);
    const completionBlock = documentRef.createElement('div');
    if (completionRows.length) {
      completionBlock.append(seasonCupTable(documentRef, {
        title: `Replay ${currentRun} NBA Cup bracket and season-completion games`,
        headers: ['Round', 'Phase', 'Conference', 'Home', 'Away', 'Final score', 'Winner', 'OT periods', 'In 82-game standings'],
        rows: completionRows,
        kind: 'cup-completion-games',
      }));
    } else {
      const unavailable = documentRef.createElement('p');
      unavailable.className = 'studio-muted';
      unavailable.textContent = 'Scenario completion-game results are unavailable for this replay.';
      completionBlock.append(unavailable);
    }
    const completionCoverage = receipt.coverage || {};
    const generatedCount = completionCoverage.generatedGames ?? completionGames.length;
    const completionDisclosure = seasonCupDisclosure(documentRef, `Bracket and season completion · ${generatedCount} games`, completionBlock);
    completionDisclosure.dataset.seasonCupCompletionLedger = 'true';
    content.append(completionDisclosure);
  }

  renderSelectedReplay();
  if (legacySection?.parentElement) legacySection.replaceWith(section);
  else if (oldRegion?.parentElement) oldRegion.replaceWith(section);
  else results.append(section);
}

const SEASON_LAB_REPEAT_WORK_BUDGET = 500_000;
const SEASON_LAB_REPEAT_OPTIONS = Object.freeze([1, 2, 5, 10, 25, 50, 100, 250, 500]);

function seasonLabLimitedCalendarCount(games, teamIds, gamesPerTeam) {
  const target = Number(gamesPerTeam);
  if (!Array.isArray(games) || !Number.isInteger(target) || target < 1) return 0;
  const appearances = new Map(teamIds.map(teamId => [teamId, 0]));
  const ordered = games.map((game, inputOrder) => ({ game, inputOrder })).sort((left, right) => {
    const leftTime = left.game.scheduledAt && Number.isFinite(Date.parse(left.game.scheduledAt))
      ? Date.parse(left.game.scheduledAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.game.scheduledAt && Number.isFinite(Date.parse(right.game.scheduledAt))
      ? Date.parse(right.game.scheduledAt) : Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.inputOrder - right.inputOrder;
  });
  let selected = 0;
  for (const { game } of ordered) {
    if (!appearances.has(game.home) || !appearances.has(game.away)
      || appearances.get(game.home) >= target || appearances.get(game.away) >= target) continue;
    selected += 1;
    appearances.set(game.home, appearances.get(game.home) + 1);
    appearances.set(game.away, appearances.get(game.away) + 1);
    if ([...appearances.values()].every(count => count >= target)) break;
  }
  return selected;
}

function mountSeasonLabRepeatBudget(documentRef, root, source) {
  const form = root?.querySelector?.('#seasonLabSimulationView form');
  const repeats = form?.querySelector?.('#leagueTrials');
  const run = form?.querySelector?.('#leagueRun');
  if (!form || !repeats || !run) return null;

  let note = form.querySelector('#leagueRepeatBudget');
  if (!note) {
    note = documentRef.createElement('p');
    note.id = 'leagueRepeatBudget';
    note.className = 'studio-muted season-lab-repeat-budget';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.setAttribute('aria-atomic', 'true');
    const repeatLabel = repeats.closest?.('label');
    if (repeatLabel?.parentElement) repeatLabel.parentElement.insertBefore(note, repeatLabel.nextSibling);
  }

  const estimate = () => {
    const count = Number(form.querySelector('#leagueTeamCount')?.value) || 0;
    const picker = form.querySelector('#leagueTeams');
    const availableTeams = Array.isArray(source?.teams) ? source.teams : [];
    const selectedTeams = count >= availableTeams.length
      ? availableTeams.map(team => team.id)
      : [...(picker?.selectedOptions || [])].map(option => option.value);
    const years = String(form.querySelector('#leagueSeasons')?.value || '').split(',')
      .map(value => Number(value.trim())).filter(Number.isFinite);
    const horizon = form.querySelector('#leagueHorizon')?.value || 'full';
    const scheduleKind = form.querySelector('#leagueScheduleKind')?.value || 'actual';
    const gamesPerTeam = Number(form.querySelector('#leagueGamesPerTeam')?.value) || 0;
    const playoffTeams = selectedTeams.length >= 16 ? 16 : 0;
    const seriesLength = Number(form.querySelector('#leagueSeriesLength')?.value);
    if (selectedTeams.length < 2 || selectedTeams.length !== count) {
      return { ready: false, reason: `Choose exactly ${count || 'the requested number of'} teams to calculate the repeat limit.` };
    }
    if (!years.length || !Number.isInteger(seriesLength)) {
      return { ready: false, reason: 'Enter a valid season and playoff series length to calculate the repeat limit.' };
    }

    let scheduledGames = 0;
    if (scheduleKind === 'actual') {
      if (!source?.scheduleArtifact) return { ready: false, reason: 'The exact schedule is not loaded; the repeat limit cannot be calculated yet.' };
      const selectedSchedules = years.map(year => selectActualNbaSchedule(source.scheduleArtifact, {
        seasonStartYear: year, teamIds: selectedTeams, phases: ['regular'],
      }));
      const unavailable = selectedSchedules.find(item => item.status !== 'ready');
      if (unavailable) return { ready: false, reason: unavailable.reason || 'The exact schedule is unavailable for this setup.' };
      const games = selectedSchedules.flatMap(item => item.games);
      scheduledGames = horizon === 'game'
        ? seasonLabLimitedCalendarCount(games, selectedTeams, gamesPerTeam)
        : games.length;
    } else if (scheduleKind === 'round-robin') {
      scheduledGames = Math.round(gamesPerTeam * selectedTeams.length / 2);
    } else if (scheduleKind === 'custom') {
      const declaredText = String(form.querySelector('#leagueDeclaredSchedule')?.value || '').trim();
      if (!declaredText) return { ready: false, reason: 'Declare custom games to calculate the repeat limit.' };
      let declared;
      try { declared = JSON.parse(declaredText); } catch { return { ready: false, reason: 'Fix the custom schedule JSON to calculate the repeat limit.' }; }
      if (!Array.isArray(declared)) return { ready: false, reason: 'Custom schedule must be a game array before the repeat limit can be calculated.' };
      scheduledGames = declared.length;
    } else {
      return { ready: false, reason: 'The selected schedule does not have a repeat-budget estimate.' };
    }
    const playoffGames = playoffTeams > 1 ? (playoffTeams - 1) * seriesLength : 0;
    const workPerRepeat = years.length * (scheduledGames + playoffGames);
    if (!Number.isSafeInteger(workPerRepeat) || workPerRepeat < 1) {
      return { ready: false, reason: 'This setup has no calculable scheduled games.' };
    }
    const maxRepeats = Math.min(500, Math.floor(SEASON_LAB_REPEAT_WORK_BUDGET / workPerRepeat));
    return { ready: true, years: years.length, scheduledGames, playoffGames, workPerRepeat, maxRepeats };
  };

  const update = () => {
    const selectedValue = String(repeats.value);
    const current = estimate();
    if (!current.ready) {
      [...repeats.options].forEach(option => { option.disabled = true; });
      note.textContent = `${current.reason} The run is blocked until the workload can be verified.`;
      note.dataset.state = 'blocked';
      run.disabled = true;
      return current;
    }

    const maxValue = String(current.maxRepeats);
    [...repeats.options].filter(option => option.dataset.workBudgetOption === 'true')
      .forEach(option => {
        if (option.value !== selectedValue && option.value !== maxValue) option.remove();
      });
    if (current.maxRepeats > 0 && ![...repeats.options].some(option => option.value === maxValue)) {
      const option = documentRef.createElement('option');
      option.value = maxValue;
      option.dataset.workBudgetOption = 'true';
      repeats.append(option);
    }
    [...repeats.options].forEach(option => {
      const value = Number(option.value);
      const overBudget = !Number.isInteger(value) || value > current.maxRepeats;
      option.disabled = overBudget;
      if (option.dataset.workBudgetOption === 'true') {
        option.textContent = overBudget
          ? `${value} runs · above this setup limit`
          : value === current.maxRepeats
            ? `${value} runs · maximum for this setup`
            : `${value} runs`;
      }
    });
    const requested = Number(repeats.value);
    const validSelection = Number.isInteger(requested) && requested >= 1 && requested <= current.maxRepeats;
    const busy = form.querySelector('#leagueCancel')?.hidden === false;
    note.textContent = validSelection
      ? `Maximum ${current.maxRepeats} repeats · ${current.workPerRepeat.toLocaleString()} work units per repeat · ${SEASON_LAB_REPEAT_WORK_BUDGET.toLocaleString()} total work-unit budget.`
      : `Selected ${requested || 'repeat count'} exceeds this setup’s maximum of ${current.maxRepeats} repeats (${current.workPerRepeat.toLocaleString()} work units per repeat; ${SEASON_LAB_REPEAT_WORK_BUDGET.toLocaleString()} total). Choose a lower count or reduce the schedule/playoff scope.`;
    note.dataset.state = validSelection ? 'available' : 'blocked';
    run.disabled = !source || !validSelection || busy;
    return current;
  };

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();
  return Object.freeze({ refresh: update });
}

function syncNativeLab(documentRef, panel, sourcePanel, source) {
  const active = documentRef.querySelector('.swishiq-tabs button[data-workbench="season"]')?.getAttribute('aria-pressed') === 'true';
  const published = nativeLabIsPublished(source);
  if (sourcePanel) sourcePanel.hidden = !active;
  panel.hidden = !(active && published);
  if (active && published) {
    const workspace = documentRef.getElementById('workspace');
    const workbenchLabel = documentRef.getElementById('workbenchLabel');
    const workspaceTitle = documentRef.getElementById('workspaceTitle');
    const workbenchState = documentRef.getElementById('workbenchState');
    const workbenchDescription = documentRef.getElementById('workbenchDescription');
    if (workspace) workspace.dataset.ready = 'true';
    if (workbenchLabel) workbenchLabel.textContent = 'Season Lab';
    if (workspaceTitle) workspaceTitle.textContent = 'Season Lab';
    if (workbenchState) { workbenchState.textContent = 'Available'; workbenchState.dataset.state = 'available'; workbenchState.classList.add('swishiq-state--ready'); }
    if (workbenchDescription) workbenchDescription.textContent = 'Run all 30 teams with season-tested team profiles and player rotations.';
  }
}

function readSeasonChallengeProgress(storage, storageKey, selectionKey, allowedTeams) {
  let raw;
  try { raw = storage?.getItem?.(storageKey) ?? null; }
  catch { return { value: null, notice: 'Saved challenge progress could not be read. This session will continue without local saving.' }; }
  if (raw === null) return { value: null, notice: '' };
  try {
    if (typeof raw !== 'string' || raw.length > SEASON_LAB_CHALLENGE_MAX_SAVE_LENGTH) throw new Error('Save is invalid or too large.');
    const value = JSON.parse(raw);
    if (!isObject(value) || value.schema !== SEASON_LAB_CHALLENGE_SCHEMA || value.selectionKey !== selectionKey
      || !isObject(value.teams) || (value.activeTeamId !== null && !allowedTeams.has(value.activeTeamId))) {
      throw new Error('Save does not match this package.');
    }
    const entries = Object.entries(value.teams);
    if (entries.length > allowedTeams.size || entries.some(([teamId, row]) => !allowedTeams.has(teamId)
      || !isObject(row) || !Number.isSafeInteger(row.attempts) || row.attempts < 0 || row.attempts > 1_000_000
      || !Number.isSafeInteger(row.correct) || row.correct < 0 || row.correct > row.attempts
      || !Number.isSafeInteger(row.streak) || row.streak < 0 || row.streak > row.correct
      || !SEASON_LAB_CHALLENGE_PREDICTIONS.has(row.prediction)
      || !SEASON_LAB_CHALLENGE_PLANS.has(row.plan))) {
      throw new Error('Save has invalid team progress.');
    }
    return { value, notice: '' };
  } catch {
    try { storage?.removeItem?.(storageKey); } catch { /* local storage may be read-only */ }
    return { value: null, notice: 'Invalid saved challenge progress was reset for this season package.' };
  }
}

function createSeasonChallengePanel(documentRef, seasonView, { storage, selectionKey, teamIds } = {}) {
  const allowedTeams = new Set((teamIds || []).filter(teamId => TEAM_CODE.test(teamId)));
  const storageKey = `${SEASON_LAB_CHALLENGE_STORAGE_PREFIX}${encodeURIComponent(selectionKey)}`;
  const restored = readSeasonChallengeProgress(storage, storageKey, selectionKey, allowedTeams);
  const records = Object.assign(Object.create(null), restored.value?.teams || {});
  let currentTeamId = restored.value?.activeTeamId || null;
  const element = documentRef.createElement('section');
  element.id = 'seasonLabChallenge';
  element.className = 'studio-panel season-challenge-panel';
  element.hidden = true;
  const actions = documentRef.createElement('section');
  actions.id = 'seasonLabChallengeActions';
  actions.className = 'season-challenge-actions';
  actions.setAttribute('aria-labelledby', 'seasonLabChallengeTitle');
  const title = documentRef.createElement('h3');
  title.id = 'seasonLabChallengeTitle';
  title.textContent = 'Next replay challenge';
  const progress = documentRef.createElement('p');
  progress.id = 'seasonLabChallengeProgress';
  progress.setAttribute('role', 'status');
  const storageStatus = documentRef.createElement('p');
  storageStatus.id = 'seasonLabChallengeStorageStatus';
  storageStatus.setAttribute('role', 'status');
  storageStatus.textContent = restored.notice;
  const reset = documentRef.createElement('button');
  reset.id = 'seasonLabChallengeReset';
  reset.type = 'button';
  reset.className = 'button button-secondary';
  reset.textContent = 'Reset this team’s record';
  const teamLabel = documentRef.createElement('label');
  teamLabel.textContent = 'Back a team';
  const teamSelect = documentRef.createElement('select');
  teamSelect.id = 'seasonLabChallengeTeam';
  teamLabel.append(teamSelect);
  const predictionLabel = documentRef.createElement('label');
  predictionLabel.textContent = 'Predict wins in the next replay';
  const predictionSelect = documentRef.createElement('select');
  predictionSelect.id = 'seasonLabChallengePrediction';
  [['more', 'More wins'], ['fewer', 'Fewer wins'], ['same', 'Same wins']].forEach(([value, label]) => {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    predictionSelect.append(option);
  });
  predictionLabel.append(predictionSelect);
  const planLabel = documentRef.createElement('label');
  planLabel.textContent = 'Scoring mix for all matchups';
  const planSelect = documentRef.createElement('select');
  planSelect.id = 'seasonLabChallengePlan';
  [['0.5', 'Balanced · 50% own offense'], ['0.65', 'Lean into own offense · 65%'], ['0.35', 'Lean into opponent defense · 35%']].forEach(([value, label]) => {
    const option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    planSelect.append(option);
  });
  planLabel.append(planSelect);
  const play = documentRef.createElement('button');
  play.id = 'seasonLabChallengePlay';
  play.type = 'button';
  play.className = 'button';
  play.textContent = 'Play next outcome';
  const message = documentRef.createElement('p');
  message.id = 'seasonLabChallengeMessage';
  message.setAttribute('role', 'status');
  const controls = documentRef.createElement('div');
  controls.className = 'studio-team-form season-challenge-actions__controls';
  controls.append(teamLabel, predictionLabel, planLabel, play);
  const tape = documentRef.createElement('section');
  tape.id = 'seasonLabGameTape';
  tape.className = 'season-challenge-tape';
  tape.setAttribute('aria-labelledby', 'seasonLabGameTapeTitle');
  const tapeTitle = documentRef.createElement('h4');
  tapeTitle.id = 'seasonLabGameTapeTitle';
  tapeTitle.textContent = 'Game tape · first replay';
  const gameLabel = documentRef.createElement('label');
  gameLabel.textContent = 'Inspect a completed game';
  const gameSelect = documentRef.createElement('select');
  gameSelect.id = 'seasonLabChallengeGame';
  gameLabel.append(gameSelect);
  const previousGame = documentRef.createElement('button');
  previousGame.id = 'seasonLabPreviousGame';
  previousGame.type = 'button';
  previousGame.className = 'button button-secondary';
  previousGame.textContent = 'Previous game';
  const nextGame = documentRef.createElement('button');
  nextGame.id = 'seasonLabNextGame';
  nextGame.type = 'button';
  nextGame.className = 'button button-secondary';
  nextGame.textContent = 'Next game';
  const tapeControls = documentRef.createElement('div');
  tapeControls.className = 'studio-team-form season-challenge-tape__controls';
  tapeControls.setAttribute('role', 'group');
  tapeControls.setAttribute('aria-label', 'Game tape navigation');
  tapeControls.append(gameLabel, previousGame, nextGame);
  const gameSummary = documentRef.createElement('p');
  gameSummary.id = 'seasonLabChallengeGameSummary';
  gameSummary.setAttribute('role', 'status');
  gameSummary.setAttribute('aria-live', 'polite');
  gameSummary.setAttribute('aria-atomic', 'true');
  const boxSummary = documentRef.createElement('div');
  boxSummary.id = 'seasonLabChallengeBoxSummary';
  boxSummary.className = 'season-challenge-tape__box';
  tape.append(tapeTitle, tapeControls, gameSummary, boxSummary);
  actions.append(title, progress, controls, reset, message, storageStatus);
  element.append(actions, tape);
  const setupForm = seasonView.querySelector('form');
  if (setupForm) seasonView.insertBefore(element, setupForm);
  else seasonView.append(element);

  let latest = null;
  let pending = null;
  let gameLogs = new Map();
  const summarize = report => ({
    teams: (report.setup?.teams || []).map(team => team.id).sort().join(','),
    seasons: (report.seasons || []).map(season => season.seasonStartYear).join(','),
    horizon: report.setup?.horizon?.kind,
    schedule: report.setup?.schedule?.kind,
    standingsGames: report.scheduleAudit?.standingsGames,
    standings: (report.standings || []).map(row => ({ teamId: row.teamId, name: row.displayTeam, wins: row.wins, games: row.games })),
  });
  const comparable = (first, second) => first.teams === second.teams && first.seasons === second.seasons
    && first.horizon === second.horizon && first.schedule === second.schedule && first.standingsGames === second.standingsGames;
  const defaultRecord = () => ({ attempts: 0, correct: 0, streak: 0, prediction: 'more', plan: '0.5' });
  const recordFor = teamId => !allowedTeams.has(teamId) ? defaultRecord()
    : records[teamId] || (records[teamId] = defaultRecord());
  const rememberPreferences = teamId => {
    if (!allowedTeams.has(teamId)) return;
    const row = recordFor(teamId);
    if (SEASON_LAB_CHALLENGE_PREDICTIONS.has(predictionSelect.value)) row.prediction = predictionSelect.value;
    if (SEASON_LAB_CHALLENGE_PLANS.has(planSelect.value)) row.plan = planSelect.value;
  };
  const persist = () => {
    if (!storage?.setItem) {
      storageStatus.textContent = 'Challenge progress stays in this tab because local storage is unavailable.';
      return;
    }
    try {
      const serialized = JSON.stringify({ schema: SEASON_LAB_CHALLENGE_SCHEMA, selectionKey,
        activeTeamId: currentTeamId, teams: records });
      if (serialized.length > SEASON_LAB_CHALLENGE_MAX_SAVE_LENGTH) throw new Error('Challenge save is too large.');
      storage.setItem(storageKey, serialized);
    } catch {
      storageStatus.textContent = 'Challenge progress could not be saved locally; it remains available in this tab.';
    }
  };
  const restorePreferences = teamId => {
    const row = recordFor(teamId);
    predictionSelect.value = row.prediction;
    planSelect.value = row.plan;
    progress.textContent = row.attempts
      ? `Season replay picks: ${row.correct}/${row.attempts} correct${row.streak ? ` · ${row.streak} in a row` : ''}.`
      : 'Season replay picks: none scored yet.';
  };
  const renderGame = () => {
    const games = gameLogs.get(teamSelect.value) || [];
    const index = Number(gameSelect.value);
    const game = Number.isSafeInteger(index) ? games[index] : null;
    previousGame.disabled = !game || index === 0;
    nextGame.disabled = !game || index >= games.length - 1;
    if (!game) {
      gameSummary.textContent = 'No game tape is available for this team.';
      boxSummary.replaceChildren();
      return;
    }
    const played = games.slice(0, index + 1);
    const wins = played.filter(row => row.score > row.opponentScore).length;
    const losses = played.filter(row => row.score < row.opponentScore).length;
    const teamScore = Number.isFinite(game.score) ? game.score : '—';
    const opponentScore = Number.isFinite(game.opponentScore) ? game.opponentScore : '—';
    const decision = Number.isFinite(game.score) && Number.isFinite(game.opponentScore)
      ? (game.score > game.opponentScore ? 'Win' : game.score < game.opponentScore ? 'Loss' : 'Tie') : 'Result unavailable';
    gameSummary.textContent = `Game ${index + 1}/${games.length} · ${game.home ? 'vs' : '@'} ${game.opponent} · simulated ${teamScore}–${opponentScore} · ${decision} · running record ${wins}–${losses}.`;
    const leaders = [...(game.players || [])].filter(player => Number(player.minutes) > 0)
      .sort((a, b) => Number(b.totals?.points || 0) - Number(a.totals?.points || 0)).slice(0, 5);
    const metric = (player, key) => player.totals?.[key] ?? '—';
    if (!leaders.length) {
      boxSummary.textContent = 'A player box allocation is unavailable for this game.';
      return;
    }
    const boxTitle = documentRef.createElement('p');
    boxTitle.textContent = 'Modeled player box · scoring leaders';
    const lines = documentRef.createElement('ol');
    lines.className = 'season-challenge-tape__box-lines';
    leaders.forEach(player => {
      const line = documentRef.createElement('li');
      line.textContent = `${player.name} · ${metric(player, 'points')} PTS · ${metric(player, 'rebounds')} REB · ${metric(player, 'assists')} AST · ${player.minutes} MIN`;
      lines.append(line);
    });
    const evidence = documentRef.createElement('p');
    evidence.className = 'studio-muted';
    evidence.textContent = 'Player lines are allocated from simulated totals; missing stats show —.';
    boxSummary.replaceChildren(boxTitle, lines, evidence);
  };
  const renderGameChoices = (preserveIndex = false) => {
    const games = gameLogs.get(teamSelect.value) || [];
    const selectedIndex = preserveIndex ? Number(gameSelect.value) : 0;
    gameSelect.replaceChildren(...games.map((game, index) => {
      const option = documentRef.createElement('option');
      option.value = index;
      const score = Number.isFinite(game.score) && Number.isFinite(game.opponentScore) ? ` · ${game.score}–${game.opponentScore}` : '';
      option.textContent = `Game ${index + 1} · ${game.home ? 'vs' : '@'} ${game.opponent}${score}`;
      return option;
    }));
    gameSelect.value = games.length ? String(Math.min(games.length - 1, Number.isSafeInteger(selectedIndex) ? selectedIndex : 0)) : '';
    renderGame();
  };
  teamSelect.addEventListener('change', () => {
    rememberPreferences(currentTeamId);
    currentTeamId = teamSelect.value;
    restorePreferences(currentTeamId);
    message.textContent = '';
    persist();
    renderGameChoices();
  });
  predictionSelect.addEventListener('change', () => { rememberPreferences(currentTeamId); persist(); });
  planSelect.addEventListener('change', () => { rememberPreferences(currentTeamId); persist(); });
  reset.addEventListener('click', () => {
    if (!allowedTeams.has(currentTeamId)) return;
    if (pending?.teamId === currentTeamId) pending = null;
    const previous = recordFor(currentTeamId);
    records[currentTeamId] = { ...defaultRecord(), prediction: previous.prediction, plan: previous.plan };
    restorePreferences(currentTeamId);
    message.textContent = `${teamSelect.selectedOptions?.[0]?.textContent || currentTeamId} challenge record reset.`;
    persist();
  });
  gameSelect.addEventListener('change', renderGame);
  const moveGame = offset => {
    const nextIndex = Number(gameSelect.value) + offset;
    if (nextIndex < 0 || nextIndex >= (gameLogs.get(teamSelect.value) || []).length) return;
    gameSelect.value = String(nextIndex);
    renderGame();
  };
  previousGame.addEventListener('click', () => moveGame(-1));
  nextGame.addEventListener('click', () => moveGame(1));
  play.addEventListener('click', () => {
    const next = seasonView.querySelector('#leagueNextOutcome');
    const form = seasonView.querySelector('form');
    if (!latest || !next || next.hidden || next.disabled || !form?.requestSubmit) {
      message.textContent = 'Finish a Season Lab run with this setup before playing the next outcome.';
      return;
    }
    const baseline = latest.standings.find(row => row.teamId === teamSelect.value);
    if (!baseline) {
      message.textContent = 'Choose a team from the completed replay.';
      return;
    }
    if (currentTeamId !== baseline.teamId) {
      rememberPreferences(currentTeamId);
      currentTeamId = baseline.teamId;
    }
    rememberPreferences(currentTeamId);
    persist();
    pending = { baseline: latest, teamId: baseline.teamId, teamName: baseline.name, wins: baseline.wins, games: baseline.games, prediction: predictionSelect.value };
    const blend = seasonView.querySelector('#leagueBlend');
    if (blend && blend.value !== planSelect.value) {
      blend.value = planSelect.value;
      blend.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const seed = seasonView.querySelector('#leagueSeed');
    if (seed) seed.value = '';
    message.textContent = `${baseline.name}: ${baseline.wins} wins in the last replay. Running another outcome…`;
    form.requestSubmit();
  });
  return {
    record(report) {
      const current = summarize(report);
      if (pending) {
        const predictedTeamId = pending.teamId;
        const row = current.standings.find(item => item.teamId === pending.teamId);
        if (!comparable(pending.baseline, current) || !row || row.games !== pending.games) {
          message.textContent = 'The league or schedule changed, so this prediction was not scored.';
        } else {
          const direction = row.wins > pending.wins ? 'more' : row.wins < pending.wins ? 'fewer' : 'same';
          const won = direction === pending.prediction;
          const tally = recordFor(pending.teamId);
          tally.attempts += 1;
          if (won) { tally.correct += 1; tally.streak += 1; } else tally.streak = 0;
          message.textContent = `${pending.teamName}: ${pending.wins} → ${row.wins} first-replay wins. ${won ? 'Prediction correct.' : `Prediction missed; the result was ${direction} wins.`}`;
        }
        pending = null;
        if (currentTeamId !== predictedTeamId) message.textContent = '';
      } else {
        message.textContent = '';
      }
      if (latest) rememberPreferences(currentTeamId);
      const selected = currentTeamId || teamSelect.value;
      teamSelect.replaceChildren(...current.standings.map(row => {
        const option = documentRef.createElement('option');
        option.value = row.teamId;
        option.textContent = row.name;
        return option;
      }));
      if (current.standings.some(row => row.teamId === selected)) teamSelect.value = selected;
      currentTeamId = allowedTeams.has(teamSelect.value) ? teamSelect.value : null;
      restorePreferences(currentTeamId);
      latest = current;
      gameLogs = new Map((report.playerGameLogs || []).map(row => [row.teamId, row.games || []]));
      element.hidden = false;
      persist();
      renderGameChoices(true);
    },
  };
}

function buildSeasonLabSavedLeague(report, selectionKey) {
  if (report?.status !== 'complete' || !report.setup || !Array.isArray(report.seasons) || !report.seasons.length) {
    throw new Error('Only completed Season Lab seasons can be saved.');
  }
  let state = createSeasonLabLeagueState({
    leagueId: String(selectionKey || 'season-lab-league').slice(0, 120),
    setup: report.setup,
    teams: (report.setup.teams || []).map(team => ({ id: team.id, team: team.id, roster: team.roster || null })),
  });
  for (const season of report.seasons) state = appendSeasonLabSeason(state, season);
  return state;
}

function createSeasonLabLeagueStoragePanel(documentRef, seasonView, {
  storage, selectionKey, onAdvance, cupScheduleArtifact = null, cupScheduleSourceReceipt = null, cupPriorSeasonRecords = null,
} = {}) {
  const leagueId = String(selectionKey || 'season-lab-league').slice(0, 120);
  const storageKey = `${SEASON_LAB_LEAGUE_STORAGE_PREFIX}${encodeURIComponent(String(selectionKey || ''))}`;
  const element = documentRef.createElement('section');
  element.id = 'seasonLabLeagueStorage';
  element.className = 'season-result-section season-lab-league-storage';
  const header = documentRef.createElement('div');
  header.className = 'season-result-section__header';
  const title = documentRef.createElement('h3');
  title.id = 'seasonLabLeagueStorageTitle';
  title.textContent = 'Saved season history';
  element.setAttribute('aria-labelledby', title.id);
  const description = documentRef.createElement('p');
  description.className = 'studio-muted';
  description.textContent = 'Save completed seasons to this browser, then reload their standings after a return to the selected package.';
  header.append(title, description);
  const controls = documentRef.createElement('div');
  controls.className = 'studio-team-form season-lab-reference-actions';
  const save = documentRef.createElement('button');
  save.id = 'seasonLabLeagueSave';
  save.type = 'button';
  save.className = 'button';
  save.textContent = 'Save completed seasons';
  save.disabled = true;
  const load = documentRef.createElement('button');
  load.id = 'seasonLabLeagueLoad';
  load.type = 'button';
  load.className = 'button button-secondary';
  load.textContent = 'Load saved history';
  load.disabled = !storage?.getItem;
  const advance = documentRef.createElement('button');
  advance.id = 'seasonLabLeagueAdvance';
  advance.type = 'button';
  advance.className = 'button button-secondary';
  advance.textContent = 'Advance to next season';
  advance.disabled = true;
  const advanceCup = documentRef.createElement('button');
  advanceCup.id = 'seasonLabLeagueAdvanceCup';
  advanceCup.type = 'button';
  advanceCup.className = 'button button-secondary';
  advanceCup.textContent = 'Advance with 2026–27 NBA Cup';
  advanceCup.disabled = true;
  advanceCup.setAttribute('aria-describedby', 'seasonLabLeagueCupHelp');
  controls.append(save, load, advance, advanceCup);
  const status = documentRef.createElement('p');
  status.id = 'seasonLabLeagueStorageStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.tabIndex = -1;
  status.textContent = storage?.getItem
    ? 'One saved league is kept per selected package version.'
    : 'Local storage is unavailable; season history stays in this tab.';
  const summary = documentRef.createElement('p');
  summary.id = 'seasonLabLeagueStorageSummary';
  summary.className = 'studio-muted';
  const progressionReceipt = documentRef.createElement('p');
  progressionReceipt.id = 'seasonLabLeagueAdvanceReceipt';
  progressionReceipt.className = 'studio-muted';
  progressionReceipt.setAttribute('role', 'status');
  progressionReceipt.setAttribute('aria-live', 'polite');
  progressionReceipt.textContent = 'Run an exact or accepted pooled native season to make its pinned team-rate evidence available for a separate next-season scenario.';
  const cupHelp = documentRef.createElement('p');
  cupHelp.id = 'seasonLabLeagueCupHelp';
  cupHelp.className = 'studio-muted';
  cupHelp.textContent = cupScheduleArtifact && cupPriorSeasonRecords?.status === 'ready'
    ? 'Available after a full exact 2025–26 run with all 30 teams. Uses its rates and records with the published 2026–27 schedule; modeled, not exact future player data or a forecast.'
    : cupScheduleSourceReceipt?.reason || cupPriorSeasonRecords?.reason || 'The published NBA Cup calendar or exact 2025–26 schedule records are unavailable.';
  const history = documentRef.createElement('ol');
  history.id = 'seasonLabLeagueStorageSeasons';
  element.append(header, controls, status, progressionReceipt, cupHelp, summary, history);
  const setupForm = seasonView.querySelector('form');
  if (setupForm) seasonView.insertBefore(element, setupForm);
  else seasonView.append(element);

  let pendingState = null, latestRun = null;
  function cupAdvanceReason(run = latestRun) {
    if (!cupScheduleArtifact || cupScheduleArtifact.status !== 'published') return cupScheduleSourceReceipt?.reason || 'The published NBA Cup schedule is unavailable.';
    if (cupPriorSeasonRecords?.status !== 'ready' || !cupPriorSeasonRecords.records) return cupPriorSeasonRecords?.reason || 'Exact 2025–26 prior-season records are unavailable.';
    const setup = run?.report?.setup;
    const years = setup?.horizon?.seasonStartYears || [];
    if (!setup || setup.source?.kind !== 'exact-season' || setup.source?.exactSeasonEvidence !== true
      || setup.horizon?.kind !== 'full' || years.length !== 1 || Number(years[0]) !== 2025) {
      return 'Run one full exact 2025–26 season before using this NBA Cup scenario.';
    }
    const teamIds = setup.teams?.map(team => team.id) || [];
    if (teamIds.length !== NBA_TEAM_CODES.length || new Set(teamIds).size !== NBA_TEAM_CODES.length
      || NBA_TEAM_CODES.some(team => !teamIds.includes(team))
      || run?.teams?.length !== NBA_TEAM_CODES.length) {
      return 'The NBA Cup scenario requires the complete 30-team NBA league and evidence payloads.';
    }
    const repeats = Number(run?.report?.repeatCount ?? setup.randomness?.repeats);
    if (Number.isInteger(repeats) && repeats > SEASON_LAB_POLICY.maxCupRepeats) {
      return `NBA Cup replay receipts are capped at ${SEASON_LAB_POLICY.maxCupRepeats} to bound browser memory. Rerun this exact 2025–26 season with ${SEASON_LAB_POLICY.maxCupRepeats} or fewer replays before advancing.`;
    }
    return '';
  }
  function updateAdvanceAvailability() {
    const hasRun = Boolean(latestRun?.teams?.length && typeof onAdvance === 'function');
    advance.disabled = !hasRun;
    const reason = cupAdvanceReason();
    advanceCup.disabled = !hasRun || Boolean(reason);
    cupHelp.textContent = reason || 'Published 2026–27 schedule · seeded completion · exact 2025–26 rates. The Cup Championship is excluded from regular-season standings.';
  }
  const renderState = state => {
    const seed = state.replay?.seed || 'Unavailable';
    summary.textContent = `${state.setup?.label || 'Season Lab league'} · ${state.seasons.length} completed season${state.seasons.length === 1 ? '' : 's'} · seed ${seed}.`;
    history.replaceChildren(...state.seasons.map(season => {
      const item = documentRef.createElement('li');
      const details = documentRef.createElement('details');
      const seasonSummary = documentRef.createElement('summary');
      const champion = season.championId
        ? state.teams.find(team => team.id === season.championId)?.name || season.championId
        : 'No champion recorded';
      const year = Number(season.seasonStartYear);
      seasonSummary.textContent = `${year}–${String(year + 1).slice(-2)} · ${champion}`;
      const standings = documentRef.createElement('ol');
      standings.className = 'season-lab-saved-standings';
      season.standings.forEach(row => {
        const standing = documentRef.createElement('li');
        standing.textContent = `${row.displayTeam || row.teamId} · ${row.wins}–${row.losses}–${row.ties}`;
        standings.append(standing);
      });
      details.append(seasonSummary, standings);
      item.append(details);
      return item;
    }));
  };

  save.addEventListener('click', () => {
    if (!pendingState || !storage?.setItem) return;
    try {
      const serialized = serializeSeasonLabLeagueState(pendingState);
      storage.setItem(storageKey, serialized);
      renderState(pendingState);
      status.textContent = `Saved ${pendingState.seasons.length} completed season${pendingState.seasons.length === 1 ? '' : 's'} in this browser.`;
    } catch (error) {
      status.textContent = error instanceof Error ? `Season history could not be saved: ${error.message}` : 'Season history could not be saved locally.';
    }
  });
  load.addEventListener('click', () => {
    if (!storage?.getItem) return;
    try {
      const serialized = storage.getItem(storageKey);
      if (!serialized) {
        status.textContent = 'No saved season history exists for this package yet.';
        pendingState = null;
        save.disabled = true;
        summary.textContent = '';
        history.replaceChildren();
        return;
      }
      const restored = parseSeasonLabLeagueState(serialized);
      if (restored.leagueId !== leagueId) throw new Error('The saved league belongs to a different package selection.');
      pendingState = restored;
      save.disabled = !storage?.setItem;
      renderState(restored);
      status.textContent = `Loaded ${restored.seasons.length} saved completed season${restored.seasons.length === 1 ? '' : 's'} from this browser.`;
    } catch (error) {
      pendingState = null;
      save.disabled = true;
      status.textContent = error instanceof Error ? `Saved season history could not be loaded: ${error.message}` : 'Saved season history could not be loaded.';
      summary.textContent = '';
      history.replaceChildren();
    }
  });

  async function runAdvance({ includeCup = false } = {}) {
    const button = includeCup ? advanceCup : advance;
    if (!latestRun || typeof onAdvance !== 'function' || button.disabled) return;
    const restoreFocus = documentRef.activeElement === button;
    advance.disabled = true;
    advanceCup.disabled = true;
    try {
      const completedYear = Number(latestRun.report.seasons?.at(-1)?.seasonStartYear);
      const prepared = buildSeasonLabNextSeasonInput({
        setup: latestRun.report.setup,
        teams: latestRun.teams,
      }, completedYear, includeCup ? { cupCompletion: {
        artifact: cupScheduleArtifact,
        sourceReceipt: cupScheduleSourceReceipt,
        priorSeasonRecords: cupPriorSeasonRecords,
      } } : undefined);
      const receipt = prepared.progression;
      const evidence = receipt.evidenceSource || {};
      const packagePin = [evidence.packageId, evidence.packageVersion].filter(Boolean).join(' @ ');
      const evidenceLabel = evidence.kind === 'pooled-window'
        ? `accepted pooled package${packagePin ? ` ${packagePin}` : ''}`
        : evidence.kind === 'exact-season'
          ? `exact native package${packagePin ? ` ${packagePin}` : ''}`
          : 'declared native evidence';
      progressionReceipt.textContent = includeCup
        ? `2026–27 NBA Cup · rates pinned to ${evidenceLabel} from ${receipt.evidenceSeasonStartYear} · seed ${receipt.seed}. Not exact player data or a forecast.`
        : `Season ${receipt.seasonStartYear} is a generated round-robin no-roster-moves scenario. Team rates remain pinned to ${evidenceLabel} from ${receipt.evidenceSeasonStartYear}; the seed is ${receipt.seed}. Contracts, transactions, injuries, development, and retirements are not modeled.`;
      status.textContent = `Prepared season ${receipt.seasonStartYear} from completed season ${receipt.fromSeasonStartYear}. Running the declared scenario…`;
      if (restoreFocus) status.focus?.({ preventScroll: true });
      await onAdvance(prepared);
    } catch (error) {
      progressionReceipt.textContent = error instanceof Error ? error.message : 'The next-season scenario could not be prepared.';
      status.textContent = `Next-season scenario could not run: ${progressionReceipt.textContent}`;
    } finally {
      updateAdvanceAvailability();
      if (restoreFocus) (button.disabled ? status : button).focus?.({ preventScroll: true });
    }
  }
  advance.addEventListener('click', () => runAdvance());
  advanceCup.addEventListener('click', () => runAdvance({ includeCup: true }));

  return {
    invalidateRun() {
      latestRun = null;
      updateAdvanceAvailability();
      progressionReceipt.textContent = 'Setup changed. Run Season Lab again to pin evidence and enable a next-season scenario.';
    },
    stage(report, context = {}) {
      try {
        const nextState = buildSeasonLabSavedLeague(report, selectionKey);
        if (pendingState && pendingState.leagueId === nextState.leagueId
          && pendingState.replay?.seed === nextState.replay?.seed
          && pendingState.teams.map(team => team.id).join('|') === nextState.teams.map(team => team.id).join('|')) {
          let merged = pendingState;
          for (const season of report.seasons) merged = appendSeasonLabSeason(merged, season);
          // Keep the latest validated controls/source pin for the next advance,
          // while preserving the entire committed history and its original seed.
          merged.setup = nextState.setup;
          pendingState = merged;
        } else {
          pendingState = nextState;
        }
        latestRun = { report, teams: Array.isArray(context.teams) ? context.teams : [] };
        updateAdvanceAvailability();
        save.disabled = !storage?.setItem;
        status.textContent = `${pendingState.seasons.length} completed season${pendingState.seasons.length === 1 ? '' : 's'} ready to save in this browser.`;
      } catch (error) {
        latestRun = null;
        updateAdvanceAvailability();
        status.textContent = error instanceof Error ? error.message : 'Completed season history is unavailable.';
      }
    },
  };
}

export function startNativeSeasonLab({
  documentRef = globalThis.document,
  fetchImpl,
  registryUrl = REGISTRY_URL,
  loadTimeoutMs = SEASON_LAB_LOAD_TIMEOUT_MS,
  storage,
} = {}) {
  if (!documentRef) return null;
  let challengeStorage = storage;
  if (challengeStorage === undefined) {
    try { challengeStorage = globalThis.localStorage; } catch { challengeStorage = null; }
  }
  const panel = documentRef.getElementById('seasonLabPanel');
  const sourcePanel = documentRef.getElementById('seasonLabSourcePanel');
  const sourceSelect = documentRef.getElementById('seasonLabPackageSelect');
  const sourceState = documentRef.getElementById('seasonLabSourceState');
  const sourceNote = documentRef.getElementById('seasonLabSourceNote');
  if (!panel || !sourcePanel || !sourceSelect) return null;
  let lab = null, challenge = null, leagueStoragePanel = null, source = null, loading = false, choicesLoaded = false, loadToken = 0;
  let choices = Object.freeze([]);
  let activeLoadController = null;
  let activeLoadTimeoutId = null;
  let pendingSetupRestore = null;
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button')];
  const activeWorkbench = () => documentRef.querySelector('.swishiq-tabs button[aria-pressed="true"]')?.dataset.workbench || '';
  const choiceForValue = () => choices.find(choice => choice.key === sourceSelect.value) || null;

  function captureSeasonSetup() {
    const form = panel.querySelector('#seasonLabSimulationView form');
    if (!form) return null;
    const fields = Object.create(null);
    const controls = [...form.querySelectorAll('input'), ...form.querySelectorAll('select'), ...form.querySelectorAll('textarea')];
    controls.filter(field => field.id).forEach(field => {
      if (field.id === 'leagueSeasons') return;
      if (field.type === 'checkbox') fields[field.id] = { checked: field.checked };
      else if (field.multiple) fields[field.id] = { values: [...field.selectedOptions].map(option => option.value) };
      else fields[field.id] = { value: field.value };
    });
    return fields;
  }

  function restoreSeasonSetup(fields) {
    if (!fields) return;
    const form = panel.querySelector('#seasonLabSimulationView form');
    if (!form) return;
    const eventType = documentRef?.defaultView?.Event || globalThis.Event;
    const teamCount = form.querySelector('#leagueTeamCount');
    const requestedCount = fields.leagueTeamCount?.value;
    if (teamCount && requestedCount && [...teamCount.options].some(option => option.value === requestedCount && !option.disabled)) {
      teamCount.value = requestedCount;
      if (typeof eventType === 'function') teamCount.dispatchEvent(new eventType('change', { bubbles: true }));
    }
    const teamPicker = form.querySelector('#leagueTeams');
    if (teamPicker?.multiple && Array.isArray(fields.leagueTeams?.values)) {
      const selectedTeams = new Set(fields.leagueTeams.values);
      [...teamPicker.options].forEach(option => { option.selected = selectedTeams.has(option.value); });
    }
    for (const [id, state] of Object.entries(fields)) {
      if (id === 'leagueSeasons' || id === 'leagueTeamCount' || id === 'leagueTeams') continue;
      const field = form.querySelector(`#${id}`);
      if (!field) continue;
      if (field.type === 'checkbox') {
        field.checked = Boolean(state.checked);
      } else if (Array.isArray(state.values) && field.multiple) {
        const selected = new Set(state.values);
        [...field.options].forEach(option => { option.selected = selected.has(option.value); });
      } else if (state.value !== undefined) {
        if (field.tagName !== 'SELECT' || [...field.options].some(option => option.value === state.value && !option.disabled)) {
          field.value = state.value;
        }
      }
    }
    if (typeof eventType === 'function') form.dispatchEvent(new eventType('change', { bubbles: true }));
  }

  function clearActiveLoadTimeout() {
    if (activeLoadTimeoutId !== null) globalThis.clearTimeout(activeLoadTimeoutId);
    activeLoadTimeoutId = null;
  }

  function abortActiveLoad() {
    clearActiveLoadTimeout();
    activeLoadController?.abort();
    activeLoadController = null;
  }

  function fetchForLoad(controller) {
    if (!controller || typeof fetchImpl !== 'function') return fetchImpl;
    return (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal });
  }

  async function withLoadTimeout(promise, controller, token) {
    const timeoutMs = seasonLabTimeoutMs(loadTimeoutMs);
    let timeoutId = null;
    let timedOut = false;
    let removeAbortListener = () => {};
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller?.abort();
        reject(seasonLabTimeoutError());
      }, timeoutMs);
      activeLoadTimeoutId = timeoutId;
    });
    const abortPromise = new Promise((_, reject) => {
      const signal = controller?.signal;
      if (!signal) return;
      const onAbort = () => {
        if (!timedOut) reject(seasonLabAbortError());
      };
      if (signal.aborted) onAbort();
      else {
        signal.addEventListener('abort', onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      }
    });
    try {
      return await Promise.race([promise, timeoutPromise, abortPromise]);
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      if (activeLoadTimeoutId === timeoutId) activeLoadTimeoutId = null;
      removeAbortListener();
      if (token !== loadToken && controller && !controller.signal.aborted) controller.abort();
    }
  }

  function clearLoadRetry() {
    sourcePanel.querySelector?.('[data-season-lab-load-retry]')?.remove();
  }

  function showLoadRetry(message) {
    clearLoadRetry();
    if (sourceNote) sourceNote.textContent = `${message} Choose Retry Season Lab data to try again.`;
    const retry = documentRef.createElement('button');
    retry.type = 'button';
    retry.className = 'button button-secondary season-lab-source-retry';
    retry.dataset.seasonLabLoadRetry = 'true';
    retry.textContent = 'Retry Season Lab data';
    retry.addEventListener('click', () => { void reload(); });
    sourcePanel.append(retry);
  }

  function renderChoiceOptions() {
    const previous = sourceSelect.value;
    const readyChoices = choices.filter(choice => choice.available);
    sourceSelect.replaceChildren();
    if (!choices.length) {
      const option = documentRef.createElement('option');
      option.value = '';
      option.textContent = 'No exact season source is available';
      sourceSelect.append(option);
      sourceSelect.disabled = true;
      setNativeSourceState(sourceState, 'Unavailable', 'unavailable');
      if (sourceNote) sourceNote.textContent = 'This season is not ready yet because team profiles, player rotations, or schedules are missing.';
      return;
    }
    choices.forEach(choice => {
      const option = documentRef.createElement('option');
      option.value = choice.key;
      option.disabled = !choice.available;
      option.textContent = choice.available ? choice.label : `${choice.label} \u00b7 unavailable`;
      sourceSelect.append(option);
    });
    const selected = readyChoices.find(choice => choice.key === previous) || readyChoices[0] || null;
    sourceSelect.disabled = !selected;
    sourceSelect.value = selected?.key || '';
    if (!selected) {
      const reason = choices.find(choice => choice.reason)?.reason || 'No exact season source includes everything needed for the Season Lab.';
      setNativeSourceState(sourceState, 'Blocked', 'blocked');
      if (sourceNote) sourceNote.textContent = reason;
      return;
    }
    setNativeSourceState(sourceState, 'Ready to load', 'ready');
    if (sourceNote) sourceNote.textContent = 'Choose an exact season here; it stays separate from the Studio player-stat selection.';
  }

  async function ensureChoices(loadFetchImpl, token, controller) {
    if (choicesLoaded) return choices;
    sourceSelect.disabled = true;
    sourceSelect.replaceChildren(Object.assign(documentRef.createElement('option'), { value: '', textContent: 'Checking season sources…' }));
    setNativeSourceState(sourceState, 'Checking', 'checking');
    if (sourceNote) sourceNote.textContent = 'Checking available season sources…';
    try {
      const result = await withLoadTimeout(
        loadNativeSeasonLabExactChoices({ registryUrl, fetchImpl: loadFetchImpl }),
        controller,
        token,
      );
      if (token !== loadToken || controller?.signal.aborted) return null;
      choices = result.choices;
      choicesLoaded = true;
      renderChoiceOptions();
      return choices;
    } catch (error) {
      if (token !== loadToken || controller?.signal.aborted) throw error;
      choices = Object.freeze([]);
      choicesLoaded = false;
      sourceSelect.replaceChildren(Object.assign(documentRef.createElement('option'), { value: '', textContent: 'Season sources unavailable' }));
      sourceSelect.disabled = true;
      const message = error instanceof Error ? error.message : 'The native Season Lab registry is unavailable.';
      setNativeSourceState(sourceState, 'Failed', 'failed');
      if (sourceNote) sourceNote.textContent = message;
      throw error;
    }
  }

  const queueSync = () => queueMicrotask(() => {
    if (activeWorkbench() !== 'season') {
      loadToken += 1;
      loading = false;
      abortActiveLoad();
      lab?.cancel?.('Season Lab paused because another workbench is active. No partial result was saved.');
      lab?.cancelFranchise?.('Season Lab paused because another workbench is active. No partial champion was assigned.');
      panel.removeAttribute('aria-busy');
    }
    syncNativeLab(documentRef, panel, sourcePanel, source);
    if (activeWorkbench() === 'season') void loadSelected();
  });
  tabs.forEach(tab => tab.addEventListener('click', queueSync));
  sourceSelect.addEventListener('change', () => {
    pendingSetupRestore = captureSeasonSetup() || pendingSetupRestore;
    loadToken += 1;
    loading = false;
    abortActiveLoad();
    lab?.destroy?.();
    lab = null;
    challenge = null;
    leagueStoragePanel = null;
    source = null;
    clearLoadRetry();
    panel.removeAttribute('aria-busy');
    panel.replaceChildren();
    void loadSelected();
  });
  panel.hidden = true;
  sourcePanel.hidden = true;
  panel.replaceChildren();

  async function loadSelected({ force = false } = {}) {
    if (activeWorkbench() !== 'season') {
      loading = false;
      panel.removeAttribute('aria-busy');
      panel.hidden = true;
      return null;
    }
    const currentChoice = choiceForValue();
    if (!force && currentChoice && source?.selection?.selectionKey === currentChoice.selection.selectionKey && nativeLabIsPublished(source)) {
      syncNativeLab(documentRef, panel, sourcePanel, source);
      return source;
    }
    if (loading && !force) return null;
    if (force) {
      loadToken += 1;
      loading = false;
      abortActiveLoad();
      lab?.destroy?.();
      lab = null;
      challenge = null;
      leagueStoragePanel = null;
      source = null;
      panel.replaceChildren();
    }
    const token = ++loadToken;
    const AbortControllerRef = documentRef?.defaultView?.AbortController || globalThis.AbortController;
    const controller = typeof AbortControllerRef === 'function' ? new AbortControllerRef() : null;
    activeLoadController = controller;
    const loadFetchImpl = fetchForLoad(controller);
    loading = true;
    source = null;
    panel.hidden = false;
    panel.setAttribute('aria-busy', 'true');
    setNativeSourceState(sourceState, 'Loading', 'loading');
    clearLoadRetry();
    if (sourceNote) sourceNote.textContent = 'Checking the selected season before loading team data.';
    panel.replaceChildren(Object.assign(documentRef.createElement('p'), {
      className: 'swishiq-native-lab-status',
      textContent: 'Checking the selected season…',
    }));
    try {
      await ensureChoices(loadFetchImpl, token, controller);
      if (token !== loadToken || activeWorkbench() !== 'season' || controller?.signal.aborted) return null;
      const choice = choiceForValue();
      if (!choice || !choice.available) {
        source = null;
        loading = false;
        panel.removeAttribute('aria-busy');
        panel.hidden = true;
        return null;
      }
      setNativeSourceState(sourceState, 'Loading', 'loading');
      if (sourceNote) sourceNote.textContent = 'Loading the selected exact-season package…';
      // The resolver checks the lightweight registry and capability before it
      // reads any large package part. Exact selection is pinned to the native
      // package choice above; player data and pooled data cannot
      // become a substitute source.
      const loadedSource = await withLoadTimeout(
        loadNativeSeasonLabSource({ registryUrl, fetchImpl: loadFetchImpl, ...choice.request, includeNbaCupSchedule: true }),
        controller,
        token,
      );
      if (token !== loadToken || activeWorkbench() !== 'season' || controller?.signal.aborted) return null;
      source = loadedSource;
      loading = false;
      panel.removeAttribute('aria-busy');
      if (!nativeLabIsPublished(source)) {
        panel.replaceChildren();
        panel.hidden = true;
        setNativeSourceState(sourceState, 'Blocked', 'blocked');
        if (sourceNote) sourceNote.textContent = 'The selected season source is missing information needed for this simulation.';
        syncNativeLab(documentRef, panel, sourcePanel, source);
        return source;
      }
      panel.replaceChildren();
      lab = createLeagueLab(panel, null, {
        onSetupChanged: () => leagueStoragePanel?.invalidateRun(),
        onReport: (report, context) => {
          decorateSeasonLabDom(documentRef, panel);
          renderSeasonCupReplayResults(documentRef, panel, report);
          renderSeasonLabPublicShareAction(
            documentRef,
            panel.querySelector('#leagueResults'),
            report,
            context?.source || source,
            { windowRef: documentRef.defaultView || globalThis.window },
          );
          challenge?.record(report);
          leagueStoragePanel?.stage(report, context);
          const packageRefs = source?.selection?.packageRefs
            || source?.source?.packageRefs
            || source?.source?.packageRef
            || null;
          publishSwishIqLabHandoff('season', { report, packageRef: packageRefs });
        },
      });
      decorateSeasonLabDom(documentRef, panel);
      lab.setSource(source);
      const repeatBudget = mountSeasonLabRepeatBudget(documentRef, panel, source);
      const seasonView = panel.querySelector('#seasonLabSimulationView');
      challenge = seasonView ? createSeasonChallengePanel(documentRef, seasonView, {
        storage: challengeStorage,
        selectionKey: source.selection.selectionKey,
        teamIds: source.teams.map(team => team.id),
      }) : null;
      leagueStoragePanel = seasonView ? createSeasonLabLeagueStoragePanel(documentRef, seasonView, {
        storage: challengeStorage,
        selectionKey: source.selection.selectionKey,
        onAdvance: input => lab?.runPreparedInput(input),
        cupScheduleArtifact: source.cupScheduleArtifact,
        cupScheduleSourceReceipt: source.cupScheduleSourceReceipt,
        cupPriorSeasonRecords: source.cupPriorSeasonRecords,
      }) : null;
      restoreSeasonSetup(pendingSetupRestore);
      pendingSetupRestore = null;
      repeatBudget?.refresh();
      setNativeSourceState(sourceState, 'Available', 'available');
      if (sourceNote) sourceNote.textContent = 'Ready. The full exact-package pin appears with each result.';
      syncNativeLab(documentRef, panel, sourcePanel, source);
      return source;
    } catch (error) {
      if (token !== loadToken || activeWorkbench() !== 'season') return null;
      loading = false;
      source = null;
      panel.removeAttribute('aria-busy');
      const message = error instanceof Error ? error.message : 'The native Season Lab package is unavailable.';
      const state = /does not publish|not published|no unique exact/i.test(message) ? 'blocked' : 'failed';
      setNativeSourceState(sourceState, state === 'blocked' ? 'Blocked' : 'Failed', state);
      panel.hidden = true;
      panel.replaceChildren();
      if (state === 'failed') showLoadRetry(message);
      else if (sourceNote) sourceNote.textContent = message;
      return null;
    } finally {
      if (token === loadToken) {
        loading = false;
        clearActiveLoadTimeout();
        if (activeLoadController === controller) activeLoadController = null;
        panel.removeAttribute('aria-busy');
      }
    }
  }

  async function reload() {
    choicesLoaded = false;
    return loadSelected({ force: true });
  }

  return Object.freeze({
    reload,
    activate: loadSelected,
  });
}

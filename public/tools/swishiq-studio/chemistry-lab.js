/**
 * Native-package Pair Profile.
 *
 * Pair Profile uses the selected exact package's complete player-season
 * totals and remains the default comparison. The optional observed-combination
 * explorer opens only the separately verified exact-season lineupLab parts;
 * observed-combination rows are descriptive and never presented as causal
 * chemistry, a forecast, or together/apart impact.
 */

import {
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  SWISHIQ_PUBLIC_V3_METRICS_VERSIONS,
  loadSwishIqPublicPart,
  loadSwishIqPublishedPackageProof,
} from './studio-runtime/modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-studio-runtime-v1';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { publishSwishIqLabHandoff } from './integration-bridge.js?v=20261002b&rev=swishiq-studio-cross-lab-v4-reviewed-release-pin-v1';
import { loadSwishIqPlayerMetadata } from './player-metadata.js?v=20260927s&rev=player-metadata-source-v2';
import { createPlayerAvatar } from './selector-system.js?v=20260927s&rev=transparent-player-webp-v1';
import { bindKeyboardScrollableTables, markKeyboardScrollableTable } from './advanced-labs.js?v=20261007b&rev=advanced-labs-v40-career-approved-avatar-v1';
import {
  loadSwishIqPublicPlayerSeasonStats,
  playerContextForPlayer,
  publicStatsForPlayerSeason,
} from './player-context.js?v=20261001e&rev=player-context-v4-source-gate-v1';

export const SWISHIQ_CHEMISTRY_LAB_VERSION = 'swishiq-pair-profile-v3-lineuplab-observed-v1';
export const SWISHIQ_CHEMISTRY_REGISTRY_URL = SWISHIQ_PUBLIC_REGISTRY_PATH;

const TEAM_CODE = /^[A-Z]{3}$/;
const METRIC_STATUSES = new Set(['available', 'unavailable']);
const CHEMISTRY_METRIC_STATUSES = new Set(['available', 'unavailable']);
const CHEMISTRY_RATE_UNIT = 'points-per-100';
const CHEMISTRY_KINDS = new Set(['shared-floor', 'exact-five']);
const V3_PLAYER_BOX_FIELDS = Object.freeze([
  'points', 'assists', 'blocks', 'defensiveRebounds', 'fieldGoalAttempts', 'fieldGoalsMade',
  'freeThrowAttempts', 'freeThrowsMade', 'offensiveRebounds', 'personalFouls', 'rebounds',
  'steals', 'threePointAttempts', 'threePointersMade', 'turnovers', 'twoPointAttempts', 'twoPointMakes',
]);
export const OBSERVED_COMBINATION_GROUP_SIZES = Object.freeze([2, 3, 4, 5]);
export const OBSERVED_COMBINATION_KINDS = Object.freeze(['shared-floor', 'exact-five']);
const CHEMISTRY_PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const OBSERVED_COMBINATION_PAGE_SIZE = 4;
const PAIR_PROFILE_ROSTER_PAGE_SIZE = 40;
const TRUE_SHOOTING_MAX = 1.5;
const PAIR_PROFILE_ROSTER_SORTS = Object.freeze({
  games: { label: 'GP', metric: 'games' },
  minutes: { label: 'MPG', metric: 'minutesPerGame' },
  points: { label: 'PPG', metric: 'pointsPerGame' },
  assists: { label: 'APG', metric: 'assistsPerGame' },
  rebounds: { label: 'RPG', metric: 'reboundsPerGame' },
  trueShooting: { label: 'TS%', metric: 'trueShootingPct' },
});
const CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH = 256;
const SWISHIQ_V3_NORMALIZER = 'swishiq-v3-canonical-normalizer';
const SWISHIQ_V3_LEGACY_METRICS_VERSION = 'swishiq-v3-metrics-v1.1';
const SWISHIQ_V3_PACKAGE_ID = /^nba-swishiq-v3-(\d{4})-(\d{2})$/;
const SWISHIQ_V3_PACKAGE_VERSION = /^v3-(\d{4})-(\d{2})-([a-f0-9]{12})$/;
export const CHEMISTRY_SESSION_KEY = 'djhc:swishiq:chemistry-session:v1';
const CHEMISTRY_SESSION_MAX_BYTES = 4096;
export const CHEMISTRY_SELECTIONS_KEY = 'djhc:swishiq:chemistry-selections:v1';
const CHEMISTRY_SELECTIONS_MAX_BYTES = 1_000_000;
const CHEMISTRY_SELECTIONS_MAX_SCOPES = 128;
const CHEMISTRY_SELECTIONS_MAX_IDS_PER_SCOPE = 10_000;
const OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MS = 15_000;
const OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MESSAGE = 'Observed lineup loading timed out. Check your connection and try again.';

const chemistryPublicStatsCaches = new WeakMap();

function loadPublicSeasonStatsForYear(seasonStartYear, fetchImpl) {
  let cache = typeof fetchImpl === 'function' ? chemistryPublicStatsCaches.get(fetchImpl) : null;
  if (!cache) {
    cache = { records: new Map(), promises: new Map() };
    if (typeof fetchImpl === 'function') chemistryPublicStatsCaches.set(fetchImpl, cache);
  }
  if (cache.records.has(seasonStartYear)) return Promise.resolve({ records: cache.records.get(seasonStartYear), sourceAvailable: true });
  if (cache.promises.has(seasonStartYear)) return cache.promises.get(seasonStartYear);
  const request = (async () => {
    try {
      const records = await loadSwishIqPublicPlayerSeasonStats({ seasonStartYear, fetchImpl });
      cache.records.set(seasonStartYear, records);
      return { records, sourceAvailable: true };
    }
    catch {
      // Do not cache failures: a later tab activation can retry the same year.
      return { records: new Map(), sourceAvailable: false };
    }
  })().then(result => {
    cache.promises.delete(seasonStartYear);
    return result;
  });
  cache.promises.set(seasonStartYear, request);
  return request;
}

function attachPublicSeasonDisplayStats(dataset, publicStatsResult) {
  const recordsByName = publicStatsResult?.records instanceof Map ? publicStatsResult.records : new Map();
  return {
    ...dataset,
    publicStatsSourceAvailable: publicStatsResult?.sourceAvailable !== false,
    rows: dataset.rows.map(row => ({
      ...row,
      displayStats: publicStatsForPlayerSeason(
        playerContextForPlayer(recordsByName, row.displayName),
        { seasonStartYear: row.seasonStartYear, teamCode: row.teamCode },
      ),
    })),
  };
}
const OBSERVED_SORT_PLAYER_NAMES = Symbol('observedSortPlayerNames');
const PAIR_PROFILE_RECEIPT_VERSION = 'swishiq-pair-profile-replay-v1';
const PROFILE_METRICS = Object.freeze([
  Object.freeze({ key: 'pointsPerGame', label: 'Points / game', shortLabel: 'PPG', units: ['points-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'assistsPerGame', label: 'Assists / game', shortLabel: 'APG', units: ['assists-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'reboundsPerGame', label: 'Rebounds / game', shortLabel: 'RPG', units: ['rebounds-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'trueShootingPct', label: 'True shooting', shortLabel: 'TS%', units: ['rate'], type: 'fraction', minimum: 0, maximum: TRUE_SHOOTING_MAX }),
  Object.freeze({ key: 'threePointAttemptRate', label: '3-point attempt rate', shortLabel: '3PA rate', units: ['rate'], type: 'fraction', minimum: 0, maximum: 1 }),
  Object.freeze({ key: 'stealsPerGame', label: 'Steals / game', shortLabel: 'SPG', units: ['steals-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'blocksPerGame', label: 'Blocks / game', shortLabel: 'BPG', units: ['blocks-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'turnoversPerGame', label: 'Turnovers / game', shortLabel: 'TOPG', units: ['turnovers-per-game'], type: 'rate', minimum: 0 }),
  Object.freeze({ key: 'minutesPerGame', label: 'Minutes / game', shortLabel: 'MPG', units: ['minutes-per-game'], type: 'rate', minimum: 0 }),
]);
const CHEMISTRY_INTERPRETATION = Object.freeze({
  outcomeValidationStatus: 'not-established',
  causalClaimsSupported: false,
  calibratedForecastSupported: false,
});

const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonNegative = value => finite(value) && value >= 0;
const publicString = value => typeof value === 'string' && value.trim() ? value.trim() : '';

function validPairProfileStoragePin(pin) {
  if (!object(pin) || !publicString(pin.packageId) || !publicString(pin.packageVersion)) return false;
  if (/^[a-f0-9]{64}$/i.test(publicString(pin.packageContentSha256))) return true;
  return pin.sourceGeneration === 'V4'
    && ['packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256', 'indexSha256', 'registryRevisionSha256']
      .every(key => /^[a-f0-9]{64}$/i.test(publicString(pin[key])));
}

function chemistrySessionChallenge(value, allowedMetrics) {
  return value === null || (object(value)
    && Number.isSafeInteger(value.step) && value.step >= 0 && value.step <= 5
    && Number.isSafeInteger(value.score) && value.score >= 0 && value.score <= value.step
    && (value.hasNext === undefined || typeof value.hasNext === 'boolean')
    && publicString(value.firstId) && publicString(value.firstId).length <= CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH
    && publicString(value.secondId) && publicString(value.secondId).length <= CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH
    && Array.isArray(value.metricIds) && value.metricIds.length >= 1 && value.metricIds.length <= 5
    && value.step <= value.metricIds.length
    && new Set(value.metricIds).size === value.metricIds.length
    && value.metricIds.every(id => allowedMetrics.has(id)));
}

export function parseChemistrySessionSnapshot(raw) {
  if (typeof raw !== 'string' || raw.length > CHEMISTRY_SESSION_MAX_BYTES
    || new TextEncoder().encode(raw).byteLength > CHEMISTRY_SESSION_MAX_BYTES) return null;
  let record;
  try { record = JSON.parse(raw); } catch { return null; }
  const snapshot = record?.snapshot;
  const pairMetrics = new Set(PROFILE_METRICS.map(metric => metric.key));
  const observedMetrics = new Set(['net', 'offense', 'defense']);
  const short = value => typeof value === 'string' && value.length <= CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH;
  const selectedIdsValid = snapshot?.pair?.selectedIds === undefined
    || (Array.isArray(snapshot.pair.selectedIds) && snapshot.pair.selectedIds.length <= 64
      && snapshot.pair.selectedIds.every(id => short(id) && id.length > 0)
      && new Set(snapshot.pair.selectedIds).size === snapshot.pair.selectedIds.length);
  if (record?.version !== 1 || !object(snapshot) || typeof snapshot.key !== 'string'
    || snapshot.key.length < 1 || snapshot.key.length > 1024
    || !['pair', 'combinations'].includes(snapshot.view)
    || !object(snapshot.pair) || !['team', 'playerA', 'playerB'].every(field => short(snapshot.pair[field]))
    || (snapshot.pair.position !== undefined && !short(snapshot.pair.position))
    || (snapshot.pair.query !== undefined && !short(snapshot.pair.query))
    || !selectedIdsValid
    || !chemistrySessionChallenge(snapshot.pairChallenge, pairMetrics)
    || !object(snapshot.observed)
    || !['team', 'groupSize', 'kind', 'playerRef', 'query'].every(field => short(snapshot.observed[field]))
    || !Number.isSafeInteger(snapshot.observed.offset) || snapshot.observed.offset < 0
    || !chemistrySessionChallenge(snapshot.observed.challenge, observedMetrics)
    || (snapshot.observed.challenge !== null && (!Number.isSafeInteger(snapshot.observed.challenge.matchupIndex)
      || snapshot.observed.challenge.matchupIndex < 0 || snapshot.observed.challenge.matchupIndex > 1))) return null;
  try {
    const pin = JSON.parse(snapshot.key);
    if (!validPairProfileStoragePin(pin)) return null;
  } catch { return null; }
  return snapshot;
}

export function parseChemistrySelectionLedger(raw) {
  if (typeof raw !== 'string' || raw.length > CHEMISTRY_SELECTIONS_MAX_BYTES
    || new TextEncoder().encode(raw).byteLength > CHEMISTRY_SELECTIONS_MAX_BYTES) return null;
  let record;
  try { record = JSON.parse(raw); } catch { return null; }
  if (record?.version !== 1 || !Array.isArray(record.entries)
    || record.entries.length > CHEMISTRY_SELECTIONS_MAX_SCOPES) return null;
  const ledger = new Map();
  for (const entry of record.entries) {
    if (!object(entry) || typeof entry.key !== 'string' || entry.key.length > 1024
      || !Array.isArray(entry.ids) || entry.ids.length > CHEMISTRY_SELECTIONS_MAX_IDS_PER_SCOPE
      || entry.ids.some(id => typeof id !== 'string' || id.length < 1 || id.length > CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH)
      || new Set(entry.ids).size !== entry.ids.length || ledger.has(entry.key)) return null;
    try {
      const pin = JSON.parse(entry.key);
      if (!validPairProfileStoragePin(pin)) return null;
    } catch { return null; }
    ledger.set(entry.key, [...entry.ids]);
  }
  return ledger;
}

function persistChemistrySelectionLedger(storage, ledger) {
  if (!storage) return;
  try {
    const entries = [...ledger.entries()].filter(([, ids]) => ids.length)
      .map(([key, ids]) => ({ key, ids }));
    if (!entries.length) {
      storage.removeItem(CHEMISTRY_SELECTIONS_KEY);
      return;
    }
    const raw = JSON.stringify({ version: 1, entries });
    if (parseChemistrySelectionLedger(raw)) storage.setItem(CHEMISTRY_SELECTIONS_KEY, raw);
  } catch { /* A private session can deny storage writes. */ }
}

function createElement(documentRef, tag, textContent = '', className = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (textContent !== '') element.textContent = textContent;
  return element;
}

function addOption(documentRef, select, value, label) {
  const option = createElement(documentRef, 'option', label);
  option.value = value;
  select.append(option);
}

function currentSelection(documentRef) {
  const value = documentRef.getElementById('packageSelect')?.value || '';
  const [packageId = '', packageVersion = ''] = value.split('|');
  return packageId && packageVersion ? { packageId, packageVersion } : null;
}

function labelSeason(scope) {
  const start = Number(scope?.seasonStartYear);
  const end = Number(scope?.seasonEndYear);
  return Number.isInteger(start) && Number.isInteger(end)
    ? `${start}–${String(end).slice(-2)}`
    : 'selected season';
}

function setWorkspace(documentRef, visible, title = 'Player comparison ready', {
  state = 'available',
  description = 'Recorded player comparison; no on-court chemistry score.',
} = {}) {
  const panel = documentRef.getElementById('chemistryLabPanel');
  if (panel) panel.hidden = !visible;
  if (!visible) return;
  documentRef.getElementById('workbenchPlaceholder')?.setAttribute('hidden', 'hidden');
  const workspaceTitle = documentRef.getElementById('workspaceTitle');
  const workbenchState = documentRef.getElementById('workbenchState');
  const workbenchDescription = documentRef.getElementById('workbenchDescription');
  if (workspaceTitle) workspaceTitle.textContent = title;
  if (workbenchState) {
    const label = state === 'available' ? 'Available'
      : state === 'loading' ? 'Loading'
        : 'Unavailable';
    workbenchState.textContent = label;
    workbenchState.dataset.state = state;
    workbenchState.classList.toggle('swishiq-state--ready', state === 'available');
  }
  if (workbenchDescription) workbenchDescription.textContent = description;
}

export function pairProfileRowId(row) {
  const publishedRef = publicString(row?.playerSeasonRef) || publicString(row?.id);
  if (publishedRef) return publishedRef;
  const playerRef = publicString(row?.playerRef);
  const teamCode = publicString(row?.teamCode);
  const phase = publicString(row?.phase);
  if (playerRef && TEAM_CODE.test(teamCode) && Number.isInteger(row?.seasonStartYear) && phase) {
    return `${playerRef}|${teamCode}|${row.seasonStartYear}|${phase}`;
  }
  return '';
}

function validRows(records, scope) {
  if (!Array.isArray(records)) return [];
  return records.filter(row => object(row)
    && /^p_[a-f0-9]{32}$/.test(publicString(row.playerRef))
    && publicString(row.displayName)
    && /^ps_[a-f0-9]{32}$/.test(publicString(row.playerSeasonRef))
    && pairProfileRowId(row)
    && TEAM_CODE.test(publicString(row.teamCode))
    && row.seasonStartYear === scope.seasonStartYear
    && (row.seasonEndYear == null || row.seasonEndYear === scope.seasonEndYear)
    && row.phase === 'regular'
    && row.observed === true
    && Number.isSafeInteger(row.games)
    && row.games > 0
    && finite(row.minutes)
    && row.minutes >= 0
    && (row.starts == null || (Number.isSafeInteger(row.starts) && row.starts >= 0))
    && object(row.box)
    && V3_PLAYER_BOX_FIELDS.every(key => Number.isSafeInteger(row.box[key]) && row.box[key] >= 0)
    && object(row.metrics)
    && object(row.metricNullReasons));
}

function metricForDefinition(row, definition) {
  const { key, units } = definition || {};
  const metric = row?.metrics?.[key];
  if (!object(metric)
    || !METRIC_STATUSES.has(metric.status)
    || !Array.isArray(units)
    || !units.includes(metric.unit)
    || !finite(metric.value)
    || (finite(definition.minimum) && metric.value < definition.minimum)
    || (finite(definition.maximum) && metric.value > definition.maximum)) return null;
  return metric;
}

export function pairProfileMetricValue(row, definition) {
  return metricForDefinition(row, definition)?.value ?? null;
}

export function pairProfileRosterMetricValue(row, rosterKey) {
  const spec = PAIR_PROFILE_ROSTER_SORTS[rosterKey];
  if (spec?.metric === 'games') return Number.isSafeInteger(row?.games) && row.games >= 0 ? row.games : null;
  const definition = PROFILE_METRICS.find(metric => metric.key === spec?.metric);
  return definition ? pairProfileMetricValue(row, definition) : null;
}

function publicDisplayMetricValue(publicStats, key, units, { minimum = 0, maximum = Number.POSITIVE_INFINITY } = {}) {
  const metric = publicStats?.metrics?.[key];
  return object(metric)
    && metric.status === 'available'
    && Array.isArray(units)
    && units.includes(metric.unit)
    && finite(metric.value)
    && metric.value >= minimum
    && metric.value <= maximum
    ? metric.value
    : null;
}

/** Keep the public metric's denominator, source status, and coverage beside its value. */
export function pairProfileMetricEvidence(row, definition) {
  const rawMetric = object(row?.metrics?.[definition?.key]) ? row.metrics[definition.key] : null;
  const metric = metricForDefinition(row, definition);
  const knownGames = Number.isSafeInteger(rawMetric?.knownGames) && rawMetric.knownGames >= 0
    ? rawMetric.knownGames
    : (Number.isSafeInteger(row?.games) && row.games >= 0 ? row.games : null);
  const denominator = nonNegative(rawMetric?.denominator) ? rawMetric.denominator : null;
  return Object.freeze({
    status: publicString(rawMetric?.status) || 'unavailable',
    value: metric?.value ?? null,
    unit: publicString(rawMetric?.unit) || null,
    numerator: nonNegative(rawMetric?.numerator) ? rawMetric.numerator : null,
    denominator,
    knownGames,
    exposure: Object.freeze({ games: knownGames, metricDenominator: denominator }),
    evidenceKind: publicString(rawMetric?.evidenceKind) || null,
    coverage: publicString(rawMetric?.coverage) || null,
    sourceMetric: publicString(rawMetric?.sourceMetric) || null,
    reason: publicString(rawMetric?.reason) || null,
    interpretation: Object.freeze({ kind: 'descriptive-player-season-record', ...CHEMISTRY_INTERPRETATION }),
  });
}

/**
 * Pair Profile deliberately has a smaller scope than the selected package.
 * A pooled window or a postseason view must not be shown as one team-season.
 */
export function pairProfileScope(proof) {
  const scope = proof?.scope || proof?.package?.scope;
  const seasonStartYears = Array.isArray(scope?.seasonStartYears) ? scope.seasonStartYears : [];
  const start = Number.isInteger(scope?.seasonStartYear) ? scope.seasonStartYear : seasonStartYears[0];
  const end = Number.isInteger(scope?.seasonEndYear) ? scope.seasonEndYear : start + 1;
  const phases = Array.isArray(scope?.phases) ? scope.phases : [];
  const exactRegular = scope?.kind === 'exact-season'
    && Number.isInteger(start)
    && Number.isInteger(end)
    && end === start + 1
    && seasonStartYears.length === 1
    && seasonStartYears[0] === start
    && phases.length === 1
    && phases[0] === 'regular';
  if (!exactRegular) {
    throw new Error('Pair Profile requires one verified exact regular season. Pooled views are unavailable because they cannot be represented as one team-season.');
  }
  return Object.freeze({
    kind: 'exact-season',
    seasonStartYear: start,
    seasonEndYear: end,
    phases: Object.freeze(['regular']),
  });
}

/** Keep the V4 proof envelope intact when publishing an observed Pair Profile. */
export function pairProfileHandoffPackageRef(proof, scope = pairProfileScope(proof)) {
  if (!object(proof?.package)) throw new Error('Pair Profile handoff requires a verified package proof.');
  const packageRef = { ...proof.package, scope };
  if (proof.status !== 'verified-data-access') return packageRef;
  return {
    ...packageRef,
    ...proof.source,
    sourceGeneration: 'V4',
    capabilityId: proof.capabilityId,
    projectionContentSha256: proof.package.projectionContentSha256,
  };
}

/**
 * Observed combination chunks use the dedicated V3 chemistry artifact grant,
 * while their exact-season boundary is established independently by the
 * lineupLab holdout and lineup-evidence grants. Require both proof layers.
 */
export function assertVerifiedExactLineupEvidenceProof(proof) {
  const entry = proof?.package;
  const index = proof?.index;
  const scope = entry?.scope;
  const start = scope?.seasonStartYear;
  const end = scope?.seasonEndYear;
  const idMatch = SWISHIQ_V3_PACKAGE_ID.exec(publicString(entry?.packageId));
  const versionMatch = SWISHIQ_V3_PACKAGE_VERSION.exec(publicString(entry?.packageVersion));
  const seasonLabel = Number.isInteger(end) ? String(end).slice(-2) : '';
  const sourceLockSha256 = publicString(entry?.sourceLockSha256);
  const exactRegular = scope?.kind === 'exact-season'
    && Number.isInteger(start)
    && Number.isInteger(end)
    && end === start + 1
    && Array.isArray(scope.seasonStartYears)
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYears[0] === start
    && Array.isArray(scope.phases)
    && scope.phases.includes('regular');
  const validIdentity = entry?.format === 'djhc-swishiq-package-v3'
    && entry?.modelId === 'swishiq-v3'
    && entry?.normalizer === SWISHIQ_V3_NORMALIZER
    && SWISHIQ_PUBLIC_V3_METRICS_VERSIONS.includes(entry?.metricsVersion)
    && idMatch?.[1] === String(start)
    && idMatch?.[2] === seasonLabel
    && versionMatch?.[1] === String(start)
    && versionMatch?.[2] === seasonLabel
    && /^[a-f0-9]{64}$/.test(sourceLockSha256)
    // V1.1 versions use the legacy source-lock prefix. V1.2's combined
    // model/source-lock/normalizer/metrics digest is verified by the package
    // proof loader before this synchronous consumer assertion runs.
    && (entry?.metricsVersion !== SWISHIQ_V3_LEGACY_METRICS_VERSION
      || versionMatch?.[3] === sourceLockSha256.slice(0, 12))
    && index?.packageId === entry.packageId
    && index?.packageVersion === entry.packageVersion
    && index?.modelId === entry.modelId
    && index?.normalizer === entry.normalizer
    && index?.metricsVersion === entry.metricsVersion
    && index?.sourceLockSha256 === sourceLockSha256;
  const packageCapability = entry?.capabilities?.lineupLab;
  const indexCapability = index?.capabilities?.lineupLab;
  const requiredLineupArtifacts = ['exact-five-evidence', 'lineup-evidence'];
  const verifiedLineupCapability = packageCapability?.status === 'available'
    && indexCapability?.status === 'available'
    && Array.isArray(packageCapability.artifactIds)
    && Array.isArray(indexCapability.artifactIds)
    && requiredLineupArtifacts.every(id => packageCapability.artifactIds.includes(id)
      && indexCapability.artifactIds.includes(id))
    && requiredLineupArtifacts.every(id => index.artifacts?.some(artifact => artifact.artifactId === id && artifact.kind === id));
  const packageChemistryCapability = entry?.capabilities?.chemistry;
  const indexChemistryCapability = index?.capabilities?.chemistry;
  const verifiedChemistryCapability = packageChemistryCapability?.status === 'available'
    && indexChemistryCapability?.status === 'available'
    && Array.isArray(packageChemistryCapability.artifactIds)
    && Array.isArray(indexChemistryCapability.artifactIds)
    && packageChemistryCapability.artifactIds.some(id => indexChemistryCapability.artifactIds.includes(id))
    && chemistryArtifacts(proof).length > 0;
  if (!exactRegular || !validIdentity || !verifiedLineupCapability || !verifiedChemistryCapability) {
    throw new Error('Observed combinations require exact-season V3 lineupLab evidence (exact-five holdout and lineup artifact) plus matching chemistry artifacts.');
  }
  return Object.freeze({
    kind: 'exact-season',
    seasonStartYear: start,
    seasonEndYear: end,
    phases: Object.freeze(['regular']),
  });
}

function pairProfilePackage(proof) {
  const packageId = publicString(proof?.package?.packageId);
  const packageVersion = publicString(proof?.package?.packageVersion);
  if (proof?.status === 'verified-data-access') {
    const packageManifestSha256 = publicString(proof?.package?.packageManifestSha256);
    const sourceLockSha256 = publicString(proof?.package?.sourceLockSha256);
    const projectionContentSha256 = publicString(proof?.package?.projectionContentSha256);
    const indexSha256 = publicString(proof?.source?.indexSha256);
    const registryRevisionSha256 = publicString(proof?.source?.registryRevisionSha256);
    const crossLabHashes = [
      proof?.source?.registrySha256,
      proof?.source?.capabilityMapSha256,
      proof?.source?.reviewReceiptSha256,
      proof?.source?.authorizationReferenceSha256,
    ].map(publicString);
    if (!packageId || !packageVersion
      || ![packageManifestSha256, sourceLockSha256, projectionContentSha256, indexSha256, registryRevisionSha256]
        .concat(crossLabHashes).every(value => /^[a-f0-9]{64}$/i.test(value))) {
      throw new Error('V4 Pair Profile requires verified package, index, source-lock, projection, and registry-revision pins.');
    }
    return Object.freeze({
      sourceGeneration: 'V4',
      packageId,
      packageVersion,
      packageManifestSha256,
      sourceLockSha256,
      projectionContentSha256,
      indexSha256,
      capabilityMapSha256: publicString(proof?.source?.capabilityMapSha256),
      registryRevisionSha256,
      registrySha256: publicString(proof?.source?.registrySha256),
      releaseId: publicString(proof?.source?.releaseId),
      capabilityId: publicString(proof?.capabilityId),
      reviewReceiptSha256: publicString(proof?.source?.reviewReceiptSha256),
      authorizationReferenceSha256: publicString(proof?.source?.authorizationReferenceSha256),
    });
  }
  const packageContentSha256 = publicString(proof?.package?.packageContentSha256)
    || publicString(proof?.package?.projectionContentSha256);
  if (!packageId || !packageVersion || !packageContentSha256) {
    throw new Error('Pair Profile requires a verified public package identifier, version, and content pin.');
  }
  const nativePins = [
    ['packageManifestSha256', proof?.package?.packageManifestSha256],
    ['sourceLockSha256', proof?.package?.sourceLockSha256],
    ['projectionContentSha256', proof?.package?.projectionContentSha256],
  ].filter(([, value]) => publicString(value));
  return Object.freeze(nativePins.length
    ? { packageId, packageVersion, packageContentSha256, ...Object.fromEntries(nativePins) }
    : { packageId, packageVersion, packageContentSha256 });
}

function scopeMatchesPairProfile(partScope, scope) {
  return object(partScope)
    && partScope.kind === scope.kind
    && partScope.seasonStartYear === scope.seasonStartYear
    && partScope.seasonEndYear === scope.seasonEndYear
    && Array.isArray(partScope.seasonStartYears)
    && partScope.seasonStartYears.length === 1
    && partScope.seasonStartYears[0] === scope.seasonStartYear
    && Array.isArray(partScope.phases)
    && partScope.phases.includes('regular');
}

function pairProfileTeams(rows) {
  const byTeam = new Map();
  rows.forEach(row => {
    const teamRows = byTeam.get(row.teamCode) || [];
    teamRows.push(row);
    byTeam.set(row.teamCode, teamRows);
  });
  return new Map([...byTeam.entries()]
    .sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Validate the part against its proof before it becomes selectable.  This
 * prevents a stale or pooled part from being presented under an exact season.
 */
export function buildPairProfileDataset(proof, part) {
  const scope = pairProfileScope(proof);
  const packagePin = pairProfilePackage(proof);
  const value = object(part?.value) ? part.value : part;
  if (!object(value) || !Array.isArray(value.records)) {
    throw new Error('The verified exact package did not supply player-season records for Pair Profile.');
  }
  const partContentPin = publicString(value.packageContentSha256 || value.projectionContentSha256);
  const contentMatches = partContentPin
    ? partContentPin === packagePin.packageContentSha256
    : Boolean(packagePin.packageManifestSha256);
  const nativePinsMatch = !packagePin.packageManifestSha256
    || (publicString(value.packageManifestSha256) === packagePin.packageManifestSha256
      && publicString(value.sourceLockSha256) === packagePin.sourceLockSha256);
  if (publicString(value.packageId) !== packagePin.packageId
    || publicString(value.packageVersion) !== packagePin.packageVersion
    || !contentMatches
    || !nativePinsMatch
    || !scopeMatchesPairProfile(value.scope, scope)) {
    throw new Error('The selected player-season part does not match the verified Pair Profile package scope.');
  }
  const seen = new Set();
  const rows = validRows(value.records, scope).sort((left, right) => (
    left.teamCode.localeCompare(right.teamCode)
    || left.displayName.localeCompare(right.displayName)
    || pairProfileRowId(left).localeCompare(pairProfileRowId(right))
  ));
  rows.forEach(row => {
    const id = pairProfileRowId(row);
    if (seen.has(id)) throw new Error('The verified player-season part contains duplicate comparison row identifiers.');
    seen.add(id);
  });
  const teams = pairProfileTeams(rows);
  if (rows.length < 2) {
    throw new Error('The verified exact package has fewer than two usable regular-season player rows for this season.');
  }
  return Object.freeze({
    proof,
    scope,
    package: packagePin,
    rows: Object.freeze(rows),
    teams,
  });
}

/** Map verified V4 franchise roster rows plus the same-package player-season supplement. */
export function buildCanonicalV4PairProfileDataset(data) {
  const scope = pairProfileScope(data);
  const packagePin = pairProfilePackage(data);
  const part = data?.parts?.['player-seasons'];
  if (!part || part.format !== 'djhc-swishiq-v4-verified-public-part-v1'
    || part.status !== 'verified'
    || part.artifactId !== 'player-seasons'
    || data?.capabilityId !== 'franchiseInputs'
    || !data?.supplementalArtifactIds?.includes('player-seasons')
    || part.package?.packageId !== data.package?.packageId
    || part.package?.packageVersion !== data.package?.packageVersion
    || part.package?.packageManifestSha256 !== data.package?.packageManifestSha256
    || part.package?.sourceLockSha256 !== data.package?.sourceLockSha256
    || part.package?.projectionContentSha256 !== data.package?.projectionContentSha256
    || part.scope?.kind !== 'exact-season'
    || !Array.isArray(part.scope.seasonStartYears)
    || part.scope.seasonStartYears.length !== 1
    || part.scope.seasonStartYears[0] !== scope.seasonStartYear
    || !Array.isArray(part.scope.phases)
    || !part.scope.phases.includes('regular')
    || !Array.isArray(part.records)) {
    throw new Error('The V4 player-season part does not match the verified Pair Profile package and exact scope.');
  }
  const sourceRows = part.records
    .filter(record => record?.time?.seasonStartYear === scope.seasonStartYear && record?.time?.phase === 'regular')
    .map(record => {
      const values = object(record?.values) ? record.values : {};
      const entities = object(record?.entities) ? record.entities : {};
      const playerRef = publicString(entities.playerRef) || publicString(values.playerRef);
      const playerSeasonRef = publicString(entities.playerSeasonRef) || publicString(values.playerSeasonRef);
      const teamCode = publicString(entities.teamCode) || publicString(values.teamCode);
      if ((publicString(entities.playerRef) && publicString(values.playerRef)
          && publicString(entities.playerRef) !== publicString(values.playerRef))
        || (publicString(entities.playerSeasonRef) && publicString(values.playerSeasonRef)
          && publicString(entities.playerSeasonRef) !== publicString(values.playerSeasonRef))
        || (publicString(entities.teamCode) && publicString(values.teamCode)
          && publicString(entities.teamCode) !== publicString(values.teamCode))
        || values.seasonStartYear !== scope.seasonStartYear || values.phase !== 'regular') {
        throw new Error('A V4 player-season row has conflicting entity and value identity fields.');
      }
      if (record?.evidence?.status !== 'available' || values.observed !== true) return null;
      return { ...values, playerSeasonRef, playerRef, teamCode };
    })
    .filter(Boolean);
  const rows = validRows(sourceRows, scope).map(row => ({
    ...row,
    // In V4 the paired season statistics are already in the same verified
    // player-season artifact. Keep them separate from observed lineup outcomes
    // while allowing the lineup cards to show each player's individual rates.
    displayStats: Object.freeze({ metrics: row.metrics }),
  })).sort((left, right) => (
    left.teamCode.localeCompare(right.teamCode)
    || left.displayName.localeCompare(right.displayName)
    || pairProfileRowId(left).localeCompare(pairProfileRowId(right))
  ));
  const seen = new Set();
  rows.forEach(row => {
    const id = pairProfileRowId(row);
    if (seen.has(id)) throw new Error('The verified V4 player-season part contains duplicate Pair Profile row identifiers.');
    seen.add(id);
  });
  if (rows.length < 2) throw new Error('The verified V4 package has fewer than two usable exact regular-season player rows.');
  return Object.freeze({ proof: data, scope, package: packagePin, rows: Object.freeze(rows), teams: pairProfileTeams(rows) });
}

/** A public, deterministic receipt for reproducing a displayed pair table. */
export function pairProfileReplayReceipt(proof, first, second) {
  const scope = pairProfileScope(proof);
  const packagePin = pairProfilePackage(proof);
  const firstId = pairProfileRowId(first);
  const secondId = pairProfileRowId(second);
  if (!firstId || !secondId || firstId === secondId
    || !validRows([first], scope).length
    || !validRows([second], scope).length) {
    throw new Error('Replay requires two different verified players from the selected season.');
  }
  return Object.freeze({
    kind: PAIR_PROFILE_RECEIPT_VERSION,
    package: packagePin,
    scope,
    firstPlayerSeasonRef: firstId,
    secondPlayerSeasonRef: secondId,
    differenceOrder: 'first-minus-second',
  });
}

function packagePinFromProof(proof) {
  if (proof?.status === 'verified-data-access') return pairProfilePackage(proof);
  const packageEntry = proof?.package;
  const packageId = publicString(packageEntry?.packageId);
  const packageVersion = publicString(packageEntry?.packageVersion);
  const packageManifestSha256 = publicString(packageEntry?.packageManifestSha256);
  const sourceLockSha256 = publicString(packageEntry?.sourceLockSha256);
  const projectionContentSha256 = publicString(packageEntry?.projectionContentSha256);
  if (!packageId || !packageVersion || !packageManifestSha256 || !sourceLockSha256 || !projectionContentSha256) {
    throw new Error('Observed combinations require a verified exact package pin.');
  }
  return Object.freeze({
    packageId,
    packageVersion,
    packageManifestSha256,
    sourceLockSha256,
    projectionContentSha256,
  });
}

function chemistryScopeMatches(rowScope, packageScope, requestedScope = null) {
  if (!object(rowScope) || !object(packageScope)
    || rowScope.kind !== 'exact-season'
    || rowScope.seasonStartYear !== packageScope.seasonStartYear
    || rowScope.seasonEndYear !== packageScope.seasonEndYear
    || !Array.isArray(rowScope.seasonStartYears)
    || rowScope.seasonStartYears.length !== 1
    || rowScope.seasonStartYears[0] !== packageScope.seasonStartYear
    || !Array.isArray(rowScope.phases)
    || !rowScope.phases.length
    || rowScope.phases.some(phase => !CHEMISTRY_PHASES.has(phase) || !packageScope.phases.includes(phase))) return false;
  if (!requestedScope) return true;
  return rowScope.seasonStartYear === requestedScope.seasonStartYear
    && rowScope.seasonEndYear === requestedScope.seasonEndYear
    && Array.isArray(requestedScope.phases)
    && rowScope.phases.length === requestedScope.phases.length
    && requestedScope.phases.every(phase => rowScope.phases.includes(phase));
}

function chemistryMetricEvidence(metric, { derivedFrom = null } = {}) {
  const status = publicString(metric?.status).toLowerCase();
  const value = finite(metric?.value) ? metric.value : null;
  const denominator = nonNegative(metric?.denominator) ? metric.denominator : null;
  const numerator = nonNegative(metric?.numerator) ? metric.numerator : null;
  const unit = publicString(metric?.unit) || null;
  const validStatus = CHEMISTRY_METRIC_STATUSES.has(status);
  let reason = publicString(metric?.reason) || (validStatus ? null : 'invalid-published-status');
  let valid = validStatus;
  if (valid && unit !== CHEMISTRY_RATE_UNIT) {
    valid = false;
    reason = 'unsupported-published-unit';
  }
  if (valid && status === 'available' && value === null) {
    valid = false;
    reason = 'missing-published-value';
  }
  if (valid && status === 'unavailable' && metric?.value !== null && metric?.value !== undefined) {
    valid = false;
    reason = 'unexpected-published-value';
  }
  if (valid && status === 'available' && derivedFrom === null) {
    if (numerator === null || denominator === null || denominator <= 0) {
      valid = false;
      reason = 'missing-or-zero-denominator';
    } else if (Math.abs(value - (100 * numerator) / denominator) > Math.max(1e-9, Math.abs(value) * 1e-10)) {
      valid = false;
      reason = 'published-rate-does-not-reconcile';
    }
  }
  if (valid && status === 'available' && derivedFrom) {
    const expected = derivedFrom.offense?.status === 'available' && derivedFrom.defense?.status === 'available'
      ? derivedFrom.offense.value - derivedFrom.defense.value
      : null;
    if (!finite(expected) || Math.abs(value - expected) > Math.max(1e-9, Math.abs(expected) * 1e-10)) {
      valid = false;
      reason = 'published-net-does-not-reconcile';
    }
  }
  if (valid && status === 'unavailable' && derivedFrom
    && derivedFrom.offense?.status === 'available' && derivedFrom.defense?.status === 'available') {
    valid = false;
    reason = 'published-net-status-does-not-reconcile';
  }
  if (!valid && !reason) reason = 'invalid-published-metric';
  return Object.freeze({
    status: valid && status === 'available' ? 'available' : 'unavailable',
    value: valid && status === 'available' ? value : null,
    unit,
    numerator: valid ? numerator : null,
    denominator: valid ? denominator : null,
    evidenceKind: publicString(metric?.evidenceKind) || null,
    coverage: publicString(metric?.coverage) || null,
    reason: valid ? reason : (reason || 'invalid-published-metric'),
  });
}

function playerNameFromLookup(playerRef, playerByRef) {
  const player = playerByRef instanceof Map ? playerByRef.get(playerRef) : playerByRef?.[playerRef];
  const displayName = publicString(player?.displayName) || publicString(player?.name);
  return displayName || `Unknown published player (${playerRef})`;
}

function chemistryPlayerLookup(records) {
  const lookup = new Map();
  (Array.isArray(records) ? records : []).forEach(row => {
    if (object(row) && publicString(row.playerRef) && publicString(row.displayName)) {
      lookup.set(row.playerRef, Object.freeze({
        playerRef: row.playerRef,
        displayName: row.displayName.trim(),
        positions: Array.isArray(row.positions) ? Object.freeze(row.positions.filter(Boolean)) : Object.freeze([]),
      }));
    }
  });
  return lookup;
}

function chemistryPlayerRecordsFromV4Part(records) {
  return (Array.isArray(records) ? records : []).flatMap(record => {
    const entities = object(record?.entities) ? record.entities : {};
    const values = object(record?.values) ? record.values : {};
    const fields = ['playerRef', 'playerSeasonRef', 'teamCode'];
    if (fields.some(field => publicString(entities[field]) && publicString(values[field])
      && publicString(entities[field]) !== publicString(values[field]))) {
      throw new Error('A V4 player-season row has conflicting entity and value identity fields.');
    }
    const playerRef = publicString(entities.playerRef) || publicString(values.playerRef);
    if (!playerRef) return [];
    return [{
      ...values,
      playerRef,
      playerSeasonRef: publicString(entities.playerSeasonRef) || publicString(values.playerSeasonRef),
      teamCode: publicString(entities.teamCode) || publicString(values.teamCode),
    }];
  });
}

function isObservedChemistryRow(row, packageScope, requestedScope) {
  const groupSize = Array.isArray(row?.players) ? row.players.length : 0;
  return object(row)
    && /^(?:chem-[a-f0-9]{24}|v4p-[a-f0-9]{32})$/.test(publicString(row.id))
    && row.observed === true
    && TEAM_CODE.test(publicString(row.team))
    && CHEMISTRY_KINDS.has(publicString(row.kind))
    && OBSERVED_COMBINATION_GROUP_SIZES.includes(groupSize)
    && (row.kind === 'exact-five' ? groupSize === 5 : groupSize < 5)
    && new Set(row.players.map(publicString)).size === row.players.length
    && row.players.every(playerRef => /^p_[a-f0-9]{32}$/.test(publicString(playerRef)))
    && row.players.every((playerRef, index, players) => index === 0 || players[index - 1] < playerRef)
    && row.minutes === null
    && row.unseenCombinationInferenceAllowed === false
    && chemistryScopeMatches(row.scope, packageScope, requestedScope);
}

function supportedCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sumExactFiveSupport(rows, field, { positive = false } = {}) {
  if (!rows.length) return null;
  let total = 0;
  for (const row of rows) {
    const value = supportedCount(row.values?.[field]);
    if (value === null || (positive && value <= 0) || !Number.isSafeInteger(total + value)) return null;
    total += value;
  }
  return total;
}

function indexExactFiveSupportRecords(records, seasonStartYear) {
  const byTeamPlayer = new Map();
  (Array.isArray(records) ? records : []).forEach(record => {
    if (record?.time?.seasonStartYear !== seasonStartYear || record?.time?.phase !== 'regular') return;
    const values = object(record.values) ? record.values : {};
    if ((values.seasonStartYear !== undefined && values.seasonStartYear !== seasonStartYear)
      || (values.phase !== undefined && values.phase !== 'regular')) return;
    const entities = object(record.entities) ? record.entities : {};
    const teamCode = publicString(entities.teamCode) || publicString(values.teamCode) || publicString(values.team);
    const rawRefs = entities.playerRefs || values.playerRefs || values.players;
    if (!TEAM_CODE.test(teamCode) || !Array.isArray(rawRefs) || rawRefs.length !== 5) return;
    const playerRefs = [...new Set(rawRefs.map(publicString))].sort();
    if (playerRefs.length !== 5 || playerRefs.some(ref => !/^p_[a-f0-9]{32}$/.test(ref))) return;
    const status = publicString(record.evidence?.status).toLowerCase();
    const sourceStatus = publicString(record.evidence?.sourceStatus).toLowerCase();
    const held = status.includes('held') || sourceStatus.includes('held')
      || record.evidence?.held === true || record.provenance?.held === true;
    const observed = !held
      && ['available', 'observed'].includes(status)
      && ['available', 'observed'].includes(sourceStatus)
      && publicString(record.evidence?.kind) === 'observed-exact-five'
      && publicString(values.evidenceKind) === 'observed-exact-five';
    const indexed = { playerRefs, values, held, observed };
    playerRefs.forEach(playerRef => {
      const key = `${teamCode}|${playerRef}`;
      if (!byTeamPlayer.has(key)) byTeamPlayer.set(key, []);
      byTeamPlayer.get(key).push(indexed);
    });
  });
  return byTeamPlayer;
}

function summarizeExactFiveSupport(teamCode, playerRefs, byTeamPlayer) {
  const candidates = playerRefs
    .map(playerRef => byTeamPlayer.get(`${teamCode}|${playerRef}`) || [])
    .sort((left, right) => left.length - right.length)[0] || [];
  const matching = candidates.filter(row => playerRefs.every(ref => row.playerRefs.includes(ref)));
  const observed = matching.filter(row => row.observed);
  const heldLineupRows = matching.filter(row => row.held).length;
  const unavailableLineupRows = matching.length - observed.length - heldLineupRows;
  const exactFiveCount = sumExactFiveSupport(observed, 'exactFiveCount', { positive: true });
  const games = sumExactFiveSupport(observed, 'games', { positive: true });
  const possessionsFor = sumExactFiveSupport(observed, 'possessionsFor', { positive: true });
  const possessionsAgainst = sumExactFiveSupport(observed, 'possessionsAgainst', { positive: true });
  const complete = observed.length > 0
    && exactFiveCount !== null && games !== null && possessionsFor !== null && possessionsAgainst !== null
    && heldLineupRows === 0 && unavailableLineupRows === 0;
  const status = observed.length
    ? (complete ? 'available' : 'partial')
    : (heldLineupRows ? 'held' : 'unavailable');
  return Object.freeze({
    status,
    exactFiveCount,
    exactFiveLineupRows: observed.length,
    games,
    possessionsFor,
    possessionsAgainst,
    heldLineupRows,
    unavailableLineupRows,
    sourceArtifactId: 'exact-five-observations',
    reason: observed.length
      ? (complete ? null : 'some-matching-exact-five-support-is-incomplete-or-excluded')
      : (heldLineupRows ? 'matching-exact-five-support-is-held' : 'no-matching-observed-exact-five-support'),
  });
}

function normalizeChemistryHeadlineEvidence(row, offense, defense, net) {
  const exposure = object(row.canonicalChemistry?.observedExposure)
    ? row.canonicalChemistry.observedExposure
    : {};
  const support = object(row.exactFiveSupport) ? row.exactFiveSupport : {};
  const supportStatus = ['available', 'partial', 'held', 'unavailable'].includes(publicString(support.status))
    ? publicString(support.status)
    : 'unavailable';
  return Object.freeze({
    evidenceStatus: publicString(row.sourceEvidenceStatus).toLowerCase() || 'not-reported',
    supportStatus,
    scope: Object.freeze({
      kind: row.scope?.kind === 'exact-season' ? 'exact-season' : null,
      seasonStartYear: Number.isSafeInteger(row.scope?.seasonStartYear) ? row.scope.seasonStartYear : null,
      seasonEndYear: Number.isSafeInteger(row.scope?.seasonEndYear) ? row.scope.seasonEndYear : null,
      phase: Array.isArray(row.scope?.phases) && row.scope.phases.length === 1
        ? publicString(row.scope.phases[0]) || null
        : null,
    }),
    exactFiveSupport: Object.freeze({
      status: supportStatus,
      exactFiveCount: supportedCount(exposure.exactFiveCount) ?? supportedCount(support.exactFiveCount),
      exactFiveLineupRows: supportedCount(exposure.exactFiveLineupRows) ?? supportedCount(support.exactFiveLineupRows),
      games: supportedCount(support.games),
      possessionsFor: supportedCount(support.possessionsFor),
      possessionsAgainst: supportedCount(support.possessionsAgainst),
      heldLineupRows: supportedCount(support.heldLineupRows) ?? 0,
      unavailableLineupRows: supportedCount(support.unavailableLineupRows) ?? 0,
      sourceArtifactId: publicString(support.sourceArtifactId) || null,
      reason: publicString(support.reason) || null,
    }),
    observedExposure: Object.freeze({
      exactFiveLineupRows: supportedCount(exposure.exactFiveLineupRows),
      games: supportedCount(exposure.games),
      minutes: nonNegative(exposure.minutes) ? exposure.minutes : null,
      offensivePossessions: supportedCount(exposure.offensivePossessions),
      defensivePossessions: supportedCount(exposure.defensivePossessions),
    }),
    metricDenominators: Object.freeze({
      offense: nonNegative(offense?.denominator) ? offense.denominator : null,
      defense: nonNegative(defense?.denominator) ? defense.denominator : null,
      net: nonNegative(net?.denominator) ? net.denominator : null,
      unit: 'possessions',
    }),
  });
}

function normalizeObservedChemistryRow(row, playerByRef) {
  const offense = chemistryMetricEvidence(row.offense);
  const defense = chemistryMetricEvidence(row.defense);
  const playerNames = Object.freeze(row.players.map(playerRef => playerNameFromLookup(publicString(playerRef), playerByRef)));
  const normalized = {
    id: publicString(row.id),
    team: publicString(row.team),
    players: Object.freeze(row.players.map(publicString)),
    playerNames,
    kind: publicString(row.kind),
    observed: true,
    interpretation: Object.freeze({ kind: 'descriptive-observed-lineup', ...CHEMISTRY_INTERPRETATION }),
    context: publicString(row.context) || null,
    minutes: finite(row.minutes) ? row.minutes : null,
    offense,
    defense,
    net: chemistryMetricEvidence(row.net, { derivedFrom: { offense, defense } }),
    scope: Object.freeze({
      kind: row.scope.kind,
      seasonStartYear: row.scope.seasonStartYear,
      seasonEndYear: row.scope.seasonEndYear,
      seasonStartYears: Object.freeze([...row.scope.seasonStartYears]),
      phases: Object.freeze([...row.scope.phases]),
    }),
    unseenCombinationInferenceAllowed: row.unseenCombinationInferenceAllowed === true,
  };
  normalized.headlineEvidence = normalizeChemistryHeadlineEvidence(row, offense, defense, normalized.net);
  Object.defineProperty(normalized, OBSERVED_SORT_PLAYER_NAMES, { value: playerNames.join('|') });
  return Object.freeze(normalized);
}

function compareObservedChemistryRows(left, right) {
  return left.team.localeCompare(right.team)
    || left.players.length - right.players.length
    || left[OBSERVED_SORT_PLAYER_NAMES].localeCompare(right[OBSERVED_SORT_PLAYER_NAMES])
    || left.id.localeCompare(right.id);
}

/**
 * Normalize only rows that were published as observed exact-season chemistry.
 * The row kind and metric cells are carried through; no chemistry is inferred
 * from player totals, group size, or missing denominators.
 */
export function normalizeObservedChemistryRows(
  records,
  { packageScope, requestedScope = null, playerByRef = new Map() } = {},
) {
  if (!object(packageScope)) return [];
  return (Array.isArray(records) ? records : [])
    .filter(row => isObservedChemistryRow(row, packageScope, requestedScope))
    .map(row => normalizeObservedChemistryRow(row, playerByRef))
    .sort(compareObservedChemistryRows);
}

const OBSERVED_NORMALIZE_CHUNK_SIZE = 2048;
const OBSERVED_SORT_CHUNK_SIZE = 4096;
const OBSERVED_MERGE_YIELD_INTERVAL = 8192;

function yieldChemistryWorkToMainThread() {
  return new Promise((resolve, reject) => {
    if (typeof globalThis.setTimeout === 'function') globalThis.setTimeout(resolve, 0);
    else resolve();
  });
}

async function yieldObservedChemistryWork(yieldToMainThread) {
  try {
    await yieldToMainThread();
  } catch {
    await yieldChemistryWorkToMainThread();
  }
}

async function mergeObservedChemistryRuns(left, right, {
  yieldToMainThread,
  shouldContinue,
  yieldInterval,
}) {
  const merged = new Array(left.length + right.length);
  let leftIndex = 0;
  let rightIndex = 0;
  let outputIndex = 0;
  let workSinceYield = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    // Taking the left row for ties preserves Array.sort's stable order across
    // the original, contiguous chunks.
    if (compareObservedChemistryRows(left[leftIndex], right[rightIndex]) <= 0) {
      merged[outputIndex] = left[leftIndex];
      leftIndex += 1;
    } else {
      merged[outputIndex] = right[rightIndex];
      rightIndex += 1;
    }
    outputIndex += 1;
    workSinceYield += 1;
    if (workSinceYield >= yieldInterval) {
      if (!shouldContinue()) return null;
      await yieldObservedChemistryWork(yieldToMainThread);
      if (!shouldContinue()) return null;
      workSinceYield = 0;
    }
  }
  while (leftIndex < left.length) merged[outputIndex++] = left[leftIndex++];
  while (rightIndex < right.length) merged[outputIndex++] = right[rightIndex++];
  return merged;
}

/** Normalize and stably order large published rows in cooperative main-thread slices. */
export async function normalizeObservedChemistryRowsCooperatively(
  records,
  {
    packageScope,
    requestedScope = null,
    playerByRef = new Map(),
    yieldToMainThread = yieldChemistryWorkToMainThread,
    shouldContinue = () => true,
    onProgress = () => {},
    normalizeChunkSize = OBSERVED_NORMALIZE_CHUNK_SIZE,
    sortChunkSize = OBSERVED_SORT_CHUNK_SIZE,
    mergeYieldInterval = OBSERVED_MERGE_YIELD_INTERVAL,
  } = {},
) {
  if (!object(packageScope)) return [];
  const source = Array.isArray(records) ? records : [];
  const normalizeSize = Math.max(1, Math.floor(Number(normalizeChunkSize) || OBSERVED_NORMALIZE_CHUNK_SIZE));
  const sortSize = Math.max(1, Math.floor(Number(sortChunkSize) || OBSERVED_SORT_CHUNK_SIZE));
  const yieldInterval = Math.max(1, Math.floor(Number(mergeYieldInterval) || OBSERVED_MERGE_YIELD_INTERVAL));
  const continueWork = typeof shouldContinue === 'function' ? shouldContinue : () => true;
  const yieldWork = typeof yieldToMainThread === 'function' ? yieldToMainThread : yieldChemistryWorkToMainThread;
  const rows = [];
  for (let index = 0; index < source.length; index += 1) {
    const row = source[index];
    if (isObservedChemistryRow(row, packageScope, requestedScope)) rows.push(normalizeObservedChemistryRow(row, playerByRef));
    if ((index + 1) % normalizeSize === 0) {
      if (!continueWork()) return null;
      await yieldObservedChemistryWork(yieldWork);
      if (!continueWork()) return null;
    }
  }
  if (!continueWork()) return null;
  if (source.length % normalizeSize) await yieldObservedChemistryWork(yieldWork);
  if (!continueWork()) return null;

  if (rows.length <= sortSize) return rows.sort(compareObservedChemistryRows);
  let runs = [];
  for (let start = 0; start < rows.length; start += sortSize) {
    runs.push(rows.slice(start, start + sortSize).sort(compareObservedChemistryRows));
    if (!continueWork()) return null;
    await yieldObservedChemistryWork(yieldWork);
    if (!continueWork()) return null;
  }
  while (runs.length > 1) {
    const nextRuns = [];
    for (let index = 0; index < runs.length; index += 2) {
      if (index + 1 >= runs.length) {
        nextRuns.push(runs[index]);
        continue;
      }
      const merged = await mergeObservedChemistryRuns(runs[index], runs[index + 1], {
        yieldToMainThread: yieldWork,
        shouldContinue: continueWork,
        yieldInterval,
      });
      if (!merged) return null;
      nextRuns.push(merged);
    }
    runs = nextRuns;
    if (!continueWork()) return null;
  }
  return runs[0] || [];
}

/**
 * Apply explorer filters to already verified rows. `query` searches published
 * player names and never changes the underlying combination or metric cells.
 */
export function filterObservedChemistryRows(
  rows,
  { team = '', groupSize = '', kind = '', query = '', playerRef = '', seasonStartYear = '' } = {},
  indexes = null,
) {
  const normalizedTeam = publicString(team).toUpperCase();
  const normalizedKind = publicString(kind);
  const normalizedQuery = publicString(query).toLocaleLowerCase();
  const normalizedPlayerRef = publicString(playerRef);
  const normalizedSeason = seasonStartYear === '' || seasonStartYear === null || seasonStartYear === undefined
    ? null : Number(seasonStartYear);
  const size = groupSize === '' || groupSize === null || groupSize === undefined ? null : Number(groupSize);
  const allRows = Array.isArray(rows) ? rows : [];
  const indexedTeamRows = normalizedTeam && indexes?.rowsByTeam instanceof Map
    ? indexes.rowsByTeam.get(normalizedTeam)
    : null;
  const sourceRows = indexedTeamRows || allRows;
  if (!normalizedTeam && size === null && !normalizedKind && !normalizedPlayerRef && normalizedSeason === null && !normalizedQuery) {
    return allRows;
  }
  if (indexedTeamRows && size === null && !normalizedKind && !normalizedPlayerRef && normalizedSeason === null && !normalizedQuery) {
    return indexedTeamRows;
  }
  return sourceRows.filter(row => (
    !normalizedTeam || row.team === normalizedTeam
  ) && (
    size === null || row.players.length === size
  ) && (
    !normalizedKind || row.kind === normalizedKind
  ) && (
    !normalizedPlayerRef || row.players.includes(normalizedPlayerRef)
  ) && (
    normalizedSeason === null || row.scope?.seasonStartYear === normalizedSeason
  ) && (
    !normalizedQuery || row.playerNames.some(name => name.toLocaleLowerCase().includes(normalizedQuery))
  ));
}

export function indexObservedChemistryRows(rows) {
  const rowsByTeam = new Map();
  const playerRefsByTeam = new Map();
  const allPlayerRefs = new Set();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const team = publicString(row?.team);
    if (!team) return;
    if (!rowsByTeam.has(team)) {
      rowsByTeam.set(team, []);
      playerRefsByTeam.set(team, new Set());
    }
    rowsByTeam.get(team).push(row);
    const teamPlayerRefs = playerRefsByTeam.get(team);
    (Array.isArray(row.players) ? row.players : []).forEach(playerRef => {
      allPlayerRefs.add(playerRef);
      teamPlayerRefs.add(playerRef);
    });
  });
  return Object.freeze({ rowsByTeam, playerRefsByTeam, allPlayerRefs });
}

export function observedChemistryScopeLabel(scope) {
  const season = labelSeason(scope);
  const phases = Array.isArray(scope?.phases) ? scope.phases : [];
  const phaseLabel = phases.length ? phases.map(phase => phase.replaceAll('_', ' ')).join(', ') : 'scope unavailable';
  return `${season} · ${scope?.kind || 'scope unavailable'} · ${phaseLabel}`;
}

function chemistryArtifacts(proof) {
  const allowed = new Set(proof?.index?.capabilities?.chemistry?.artifactIds || []);
  return [...(proof?.index?.artifacts || [])]
    .filter(artifact => artifact.kind === 'chemistry' && allowed.has(artifact.artifactId))
    .sort((left, right) => left.artifactId.localeCompare(right.artifactId, undefined, { numeric: true }));
}

function canonicalV4ChemistryParts(data) {
  const allowedArtifactIds = new Set(data?.capability?.artifactIds || []);
  return Object.entries(data?.parts || {})
    .filter(([artifactId, part]) => allowedArtifactIds.has(artifactId)
      && part?.artifactId === artifactId
      && /^chemistry-part-\d{3}$/.test(artifactId)
      && (part.kind == null || part.kind === 'chemistry'))
    .map(([, part]) => part);
}

function createObservedChemistryDataset(chemistryProof, packagePin, packageScope, requestedScope, playerByRef, rows) {
  const artifactCount = chemistryProof?.status === 'verified-data-access'
    ? canonicalV4ChemistryParts(chemistryProof).length
    : chemistryArtifacts(chemistryProof).length;
  return Object.freeze({
    proof: chemistryProof,
    package: packagePin,
    scope: Object.freeze({
      kind: packageScope.kind,
      seasonStartYear: packageScope.seasonStartYear,
      seasonEndYear: packageScope.seasonEndYear,
      seasonStartYears: Object.freeze([...packageScope.seasonStartYears]),
      phases: Object.freeze([...packageScope.phases]),
    }),
    requestedScope: requestedScope ? Object.freeze({
      kind: requestedScope.kind,
      seasonStartYear: requestedScope.seasonStartYear,
      seasonEndYear: requestedScope.seasonEndYear,
      phases: Object.freeze([...requestedScope.phases]),
    }) : null,
    playerByRef,
    rows: Object.freeze(rows),
    artifactCount,
  });
}

/**
 * Build the explorer dataset from native package parts while keeping the
 * selected exact proof as the requested regular-season boundary.
 */
export function buildObservedChemistryDataset(
  chemistryProof,
  { playerRecords = [], chemistryRecords = [], requestedScope = null } = {},
) {
  const packagePin = packagePinFromProof(chemistryProof);
  const packageScope = chemistryProof?.package?.scope;
  assertVerifiedExactLineupEvidenceProof(chemistryProof);
  const playerByRef = chemistryPlayerLookup(playerRecords);
  const rows = normalizeObservedChemistryRows(chemistryRecords, {
    packageScope,
    requestedScope,
    playerByRef,
  });
  return createObservedChemistryDataset(chemistryProof, packagePin, packageScope, requestedScope, playerByRef, rows);
}

/** Async companion for large exact packages; yields between normalize/sort slices. */
export async function buildObservedChemistryDatasetCooperatively(
  chemistryProof,
  {
    playerRecords = [],
    chemistryRecords = [],
    requestedScope = null,
    yieldToMainThread = yieldChemistryWorkToMainThread,
    shouldContinue = () => true,
    onProgress = () => {},
    normalizeChunkSize = OBSERVED_NORMALIZE_CHUNK_SIZE,
    sortChunkSize = OBSERVED_SORT_CHUNK_SIZE,
    mergeYieldInterval = OBSERVED_MERGE_YIELD_INTERVAL,
  } = {},
) {
  const packagePin = packagePinFromProof(chemistryProof);
  const packageScope = chemistryProof?.package?.scope;
  assertVerifiedExactLineupEvidenceProof(chemistryProof);
  const playerByRef = chemistryPlayerLookup(playerRecords);
  onProgress('Preparing observed lineup results…');
  const rows = await normalizeObservedChemistryRowsCooperatively(chemistryRecords, {
    packageScope,
    requestedScope,
    playerByRef,
    yieldToMainThread,
    shouldContinue,
    onProgress,
    normalizeChunkSize,
    sortChunkSize,
    mergeYieldInterval,
  });
  if (!rows || !shouldContinue()) return null;
  return createObservedChemistryDataset(chemistryProof, packagePin, packageScope, requestedScope, playerByRef, rows);
}

/** Normalize V4 chemistry plus matching V4 lineup-support evidence descriptively. */
export async function buildCanonicalV4ObservedChemistryDatasetCooperatively(
  chemistryData,
  lineupData,
  playerRecords = [],
  requestedScope = null,
  { shouldContinue = () => true, onProgress = () => {} } = {},
) {
  const chemistryScope = pairProfileScope(chemistryData);
  const lineupScope = pairProfileScope(lineupData);
  const chemistryPin = pairProfilePackage(chemistryData);
  const lineupPin = pairProfilePackage(lineupData);
  const samePin = ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256', 'projectionContentSha256', 'indexSha256', 'registryRevisionSha256']
    .every(key => chemistryPin[key] === lineupPin[key]);
  if (chemistryData?.capabilityId !== 'chemistry' || lineupData?.capabilityId !== 'lineupEvidence'
    || !samePin
    || chemistryScope.seasonStartYear !== lineupScope.seasonStartYear
    || chemistryScope.seasonEndYear !== lineupScope.seasonEndYear) {
    throw new Error('V4 observed Chemistry and lineup evidence do not share the same verified exact package and season.');
  }
  const scope = Object.freeze({
    kind: 'exact-season',
    seasonStartYear: chemistryScope.seasonStartYear,
    seasonEndYear: chemistryScope.seasonEndYear,
    seasonStartYears: Object.freeze([chemistryScope.seasonStartYear]),
    phases: Object.freeze(['regular']),
  });
  if (requestedScope && (requestedScope.kind !== 'exact-season'
    || requestedScope.seasonStartYear !== scope.seasonStartYear
    || requestedScope.seasonEndYear !== scope.seasonEndYear
    || !Array.isArray(requestedScope.phases)
    || requestedScope.phases.length !== 1
    || requestedScope.phases[0] !== 'regular')) {
    throw new Error('V4 observed Chemistry requires the selected exact regular-season scope.');
  }
  const chemistryParts = canonicalV4ChemistryParts(chemistryData);
  const coveragePart = lineupData.parts?.['lineup-coverage'];
  const exactFivePart = lineupData.parts?.['exact-five-observations'];
  if (!chemistryParts.length
    || !coveragePart || coveragePart.format !== 'djhc-swishiq-v4-verified-public-part-v1'
    || coveragePart.status !== 'verified' || !Array.isArray(coveragePart.records)
    || !exactFivePart || exactFivePart.format !== 'djhc-swishiq-v4-verified-public-part-v1'
    || exactFivePart.status !== 'verified' || !Array.isArray(exactFivePart.records)) {
    throw new Error('The V4 package does not contain complete chemistry, lineup-coverage, and exact-five evidence parts.');
  }
  const rowAtScope = record => record?.time?.seasonStartYear === scope.seasonStartYear
    && record?.time?.phase === 'regular'
    && record?.evidence?.status !== 'held';
  const coverage = new Set();
  coveragePart.records.filter(rowAtScope).forEach(record => {
    const playerRef = publicString(record?.entities?.playerRef) || publicString(record?.values?.playerRef);
    const teamCode = publicString(record?.entities?.teamCode) || publicString(record?.values?.teamCode) || publicString(record?.values?.team);
    if (/^p_[a-f0-9]{32}$/.test(playerRef) && TEAM_CODE.test(teamCode)) coverage.add(`${teamCode}|${playerRef}`);
  });
  if (!coverage.size) throw new Error('The exact V4 package has no usable regular-season lineup-coverage rows.');
  const exactFives = new Set();
  const exactFiveSupportByTeamPlayer = indexExactFiveSupportRecords(
    exactFivePart.records,
    scope.seasonStartYear,
  );
  exactFivePart.records.filter(rowAtScope).forEach(record => {
    const refs = record?.entities?.playerRefs || record?.values?.playerRefs || record?.values?.players;
    const teamCode = publicString(record?.entities?.teamCode) || publicString(record?.values?.teamCode) || publicString(record?.values?.team);
    if (Array.isArray(refs) && refs.length === 5 && TEAM_CODE.test(teamCode)
      && refs.every(ref => /^p_[a-f0-9]{32}$/.test(publicString(ref)))) {
      exactFives.add(`${teamCode}|${[...refs].sort().join('|')}`);
    }
  });
  const sourceRecords = [];
  for (const part of chemistryParts) {
    if (part.format !== 'djhc-swishiq-v4-verified-public-part-v1'
      || part.status !== 'verified' || !Array.isArray(part.records)
      || part.package?.packageId !== chemistryData.package.packageId
      || part.package?.packageVersion !== chemistryData.package.packageVersion
      || part.scope?.kind !== 'exact-season'
      || part.scope?.seasonStartYears?.[0] !== scope.seasonStartYear
      || !Array.isArray(part.scope?.phases) || !part.scope.phases.includes('regular')) {
      throw new Error('A V4 chemistry part does not match the selected package and exact regular-season scope.');
    }
    for (const record of part.records) {
      if (!rowAtScope(record)) continue;
      const values = record.values || {};
      const canonical = values.canonicalChemistry;
      const refs = record?.entities?.playerRefs || values.playerRefs || values.players;
      const teamCode = publicString(record?.entities?.teamCode) || publicString(values.teamCode) || publicString(values.team);
      const kind = publicString(canonical?.combinationKind) || publicString(values.kind);
      if (!Array.isArray(refs) || !OBSERVED_COMBINATION_GROUP_SIZES.includes(refs.length)
        || refs.some(ref => !/^p_[a-f0-9]{32}$/.test(publicString(ref)))
        || !TEAM_CODE.test(teamCode)
        || !['shared-floor', 'exact-five'].includes(kind)
        || values.observed !== true
        || canonical?.causalStatus !== 'not-established'
        || canonical?.unseenCombinationInferenceAllowed !== false
        || (kind === 'exact-five' && (refs.length !== 5 || !exactFives.has(`${teamCode}|${[...refs].sort().join('|')}`)))
        || (kind === 'shared-floor' && refs.length === 5)
        || !refs.every(ref => coverage.has(`${teamCode}|${ref}`))) continue;
      sourceRecords.push({
        ...values,
        id: publicString(values.id) || publicString(record.recordId),
        team: teamCode,
        players: [...refs].sort(),
        kind,
        scope,
        sourceEvidenceStatus: publicString(record.evidence?.status) || null,
        exactFiveSupport: summarizeExactFiveSupport(teamCode, refs, exactFiveSupportByTeamPlayer),
        unseenCombinationInferenceAllowed: canonical.unseenCombinationInferenceAllowed,
      });
    }
  }
  if (!shouldContinue()) return null;
  onProgress('Preparing exact-season observed combinations…');
  const playerByRef = chemistryPlayerLookup(playerRecords);
  const rows = await normalizeObservedChemistryRowsCooperatively(sourceRecords, {
    packageScope: scope,
    requestedScope: requestedScope || scope,
    playerByRef,
    shouldContinue,
    onProgress,
  });
  if (!rows || !shouldContinue()) return null;
  const packagePin = chemistryPin;
  return createObservedChemistryDataset(chemistryData, packagePin, scope, requestedScope, playerByRef, rows);
}

function formatMetric(value, type) {
  if (!finite(value)) return 'Unavailable';
  return type === 'fraction' ? `${(value * 100).toFixed(1)}%` : value.toFixed(1);
}

function formatDifference(value, type, suffix = '') {
  if (!finite(value)) return 'Unavailable';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  const absolute = Math.abs(value);
  if (type === 'fraction') return `${sign}${(absolute * 100).toFixed(1)} pp`;
  return `${sign}${absolute.toFixed(1)}${suffix}`;
}

function formatTotal(value, kind) {
  if (!finite(value)) return 'Unavailable';
  if (kind === 'games') return Math.round(value).toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function metricEvidenceText(evidence) {
  const parts = [];
  if (evidence.status === 'limited_sample') parts.push('Limited sample');
  const games = evidence.exposure?.games ?? evidence.knownGames;
  if (Number.isSafeInteger(games) && games >= 0) {
    parts.push(`${games} ${games === 1 ? 'game' : 'games'}`);
  }
  const denominator = evidence.exposure?.metricDenominator ?? evidence.denominator;
  if (nonNegative(denominator)) {
    parts.push(`denominator ${formatTotal(denominator)}`);
  }
  if (!finite(evidence?.value)) return parts.length ? `Unavailable · ${parts.join(' · ')}` : 'Unavailable';
  return parts.length ? parts.join(' · ') : 'Sample size unavailable';
}

function metricPairEvidenceText(row, first, second) {
  return `${first.displayName}: ${metricEvidenceText(row.firstEvidence)}; ${second.displayName}: ${metricEvidenceText(row.secondEvidence)}.`;
}

function initials(name) {
  const letters = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
  return letters || 'PL';
}

function positionsLabel(row) {
  const positions = Array.isArray(row?.positions) ? row.positions.filter(position => typeof position === 'string' && position) : [];
  return positions.length ? positions.join(' / ') : 'Position unavailable';
}

function playerLabel(row) {
  const positions = Array.isArray(row?.positions) && row.positions.length ? ` · ${row.positions.join('/')}` : '';
  return `${row.displayName}${positions}`;
}

export function pairProfileMetricRows(first, second) {
  return PROFILE_METRICS.map(definition => {
    const firstEvidence = pairProfileMetricEvidence(first, definition);
    const secondEvidence = pairProfileMetricEvidence(second, definition);
    const firstValue = firstEvidence.value;
    const secondValue = secondEvidence.value;
    return {
      ...definition,
      interpretation: Object.freeze({ kind: 'descriptive-player-season-comparison', ...CHEMISTRY_INTERPRETATION }),
      firstValue,
      secondValue,
      firstEvidence,
      secondEvidence,
      difference: finite(firstValue) && finite(secondValue) ? firstValue - secondValue : null,
    };
  });
}

function renderIdentityCard(documentRef, row, ordinal, metadata = null) {
  const card = createElement(documentRef, 'article', '', `swishiq-pair-profile__identity swishiq-pair-profile__identity--${ordinal}`);
  const label = createElement(documentRef, 'span', ordinal === 'first' ? 'Player one' : 'Player two', 'swishiq-pair-profile__identity-label');
  const identity = createElement(documentRef, 'div', '', 'swishiq-pair-profile__identity-head');
  const avatar = createPlayerAvatar(documentRef, row, {
    metadata,
    className: 'swishiq-pair-profile__avatar',
    alt: `${row.displayName} headshot`,
  });
  const copy = createElement(documentRef, 'div', '', 'swishiq-pair-profile__identity-copy');
  copy.append(createElement(documentRef, 'h4', row.displayName), createElement(documentRef, 'p', `${row.teamCode} · regular season record`));
  identity.append(avatar, copy);
  const role = createElement(documentRef, 'div', '', 'swishiq-pair-profile__role');
  role.append(createElement(documentRef, 'span', 'Recorded position'), createElement(documentRef, 'strong', positionsLabel(row)));
  const workload = createElement(documentRef, 'dl', '', 'swishiq-pair-profile__workload');
  [
    ['Games', formatTotal(row.games, 'games')],
    ['Minutes', formatTotal(row.minutes, 'minutes')],
  ].forEach(([term, value]) => {
    const item = createElement(documentRef, 'div');
    item.append(createElement(documentRef, 'dt', term), createElement(documentRef, 'dd', value));
    workload.append(item);
  });
  card.append(label, identity, role, workload);
  return card;
}

function renderMetricVisual(documentRef, row, first, second) {
  const card = createElement(documentRef, 'article', '', 'swishiq-pair-profile__metric');
  const head = createElement(documentRef, 'div', '', 'swishiq-pair-profile__metric-head');
  const titleLine = createElement(documentRef, 'div', '', 'swishiq-pair-profile__metric-title');
  const title = createElement(documentRef, 'strong', row.label);
  titleLine.append(title, createElement(documentRef, 'span', row.shortLabel, 'swishiq-pair-profile__metric-code'));
  const delta = createElement(documentRef, 'span', finite(row.difference)
    ? `${first.displayName} − ${second.displayName}: ${formatDifference(row.difference, row.type)}`
    : 'Difference unavailable', 'swishiq-pair-profile__metric-delta');
  head.append(titleLine, delta);
  card.append(head);

  const validValues = [row.firstValue, row.secondValue].filter(finite);
  const maxValue = Math.max(...validValues, 0);
  const renderBar = (player, value, ordinal) => {
    const item = createElement(documentRef, 'div', '', `swishiq-pair-profile__bar-row swishiq-pair-profile__bar-row--${ordinal}`);
    const name = createElement(documentRef, 'span', player.displayName, 'swishiq-pair-profile__bar-name');
    const track = createElement(documentRef, 'span', '', 'swishiq-pair-profile__bar-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = createElement(documentRef, 'span', '', 'swishiq-pair-profile__bar-fill');
    const percent = finite(value) && maxValue > 0 ? Math.max(0, Math.min(100, value / maxValue * 100)) : 0;
    fill.style.setProperty('--pair-profile-bar', `${percent}%`);
    track.append(fill);
    item.append(name, track, createElement(documentRef, 'strong', formatMetric(value, row.type)));
    return item;
  };
  const visual = createElement(documentRef, 'div', '', 'swishiq-pair-profile__metric-bars');
  visual.setAttribute('aria-label', `${row.label}: ${first.displayName} ${formatMetric(row.firstValue, row.type)}; ${second.displayName} ${formatMetric(row.secondValue, row.type)}.`);
  visual.append(renderBar(first, row.firstValue, 'first'), renderBar(second, row.secondValue, 'second'));
  const exposure = createElement(documentRef, 'p', `${first.displayName}: ${metricEvidenceText(row.firstEvidence)}; ${second.displayName}: ${metricEvidenceText(row.secondEvidence)}.`, 'swishiq-advanced-muted swishiq-pair-profile__metric-exposure');
  card.append(visual, exposure);
  return card;
}

function renderComparison(documentRef, root, dataset, first, second) {
  const { scope } = dataset;
  root.hidden = false;
  root.replaceChildren();
  const result = createElement(documentRef, 'section', '', 'swishiq-pair-profile');
  result.setAttribute('aria-labelledby', 'pairProfileComparisonTitle');
  const heading = createElement(documentRef, 'div', '', 'swishiq-pair-profile__heading');
  const headingCopy = createElement(documentRef, 'div');
  headingCopy.append(createElement(documentRef, 'span', 'Recorded measures', 'swishiq-kicker'));
  const title = createElement(documentRef, 'h3', `${first.displayName} vs ${second.displayName}`);
  title.id = 'pairProfileComparisonTitle';
  const teamPair = first.teamCode === second.teamCode ? first.teamCode : `${first.teamCode} vs ${second.teamCode}`;
  headingCopy.append(title, createElement(documentRef, 'p', `${labelSeason(scope)} regular season · ${teamPair} · each difference is player one minus player two.`, 'swishiq-advanced-muted'));
  headingCopy.append(createElement(documentRef, 'p', 'Recorded values from the selected exact-season package. This is a descriptive player comparison, not causal chemistry, lineup impact, or a forecast.', 'swishiq-advanced-muted'));
  heading.append(headingCopy);
  const identities = createElement(documentRef, 'div', '', 'swishiq-pair-profile__identities');
  identities.append(renderIdentityCard(documentRef, first, 'first', dataset.metadata), renderIdentityCard(documentRef, second, 'second', dataset.metadata));
  const visualSection = createElement(documentRef, 'section', '', 'swishiq-pair-profile__visuals');
  const visualTitle = createElement(documentRef, 'h4', 'Same-metric comparison');
  visualTitle.id = 'pairProfileMetricTitle';
  visualSection.setAttribute('aria-labelledby', visualTitle.id);
  visualSection.append(visualTitle);
  const metricGrid = createElement(documentRef, 'div', '', 'swishiq-pair-profile__metric-grid');
  pairProfileMetricRows(first, second).forEach(row => metricGrid.append(renderMetricVisual(documentRef, row, first, second)));
  visualSection.append(metricGrid);
  result.append(heading, identities, visualSection);

  const details = createElement(documentRef, 'details', '', 'swishiq-pair-profile__details');
  const detailsSummary = createElement(documentRef, 'summary', 'Exact values, sample sizes, and differences');
  details.append(detailsSummary, createElement(documentRef, 'p', '“pp” means percentage points; sample sizes are shown per rate.', 'swishiq-advanced-muted'));
  const table = createElement(documentRef, 'table', '', 'swishiq-advanced-table');
  table.append(createElement(documentRef, 'caption', `${first.displayName} and ${second.displayName}: season values`));
  const head = createElement(documentRef, 'thead');
  const headRow = createElement(documentRef, 'tr');
  ['Measure', first.displayName, second.displayName, `${first.displayName} − ${second.displayName}`, 'Sample / denominator'].forEach(label => headRow.append(createElement(documentRef, 'th', label)));
  head.append(headRow);
  const body = createElement(documentRef, 'tbody');
  [['Games', first.games, second.games, 'games'], ['Total minutes', first.minutes, second.minutes, 'minutes']].forEach(([label, left, right, kind]) => {
    const row = createElement(documentRef, 'tr');
    const difference = finite(left) && finite(right) ? left - right : null;
    [label, formatTotal(left, kind), formatTotal(right, kind), finite(difference) ? formatDifference(difference, 'rate', kind === 'minutes' ? ' min' : '') : 'Unavailable', 'Season-row total'].forEach((value, index) => {
      const cell = createElement(documentRef, index === 0 ? 'th' : 'td', String(value));
      if (index === 0) cell.scope = 'row';
      row.append(cell);
    });
    body.append(row);
  });
  pairProfileMetricRows(first, second).forEach(metric => {
    const row = createElement(documentRef, 'tr');
    [metric.label, formatMetric(metric.firstValue, metric.type), formatMetric(metric.secondValue, metric.type), formatDifference(metric.difference, metric.type), metricPairEvidenceText(metric, first, second)].forEach((value, index) => {
      const cell = createElement(documentRef, index === 0 ? 'th' : 'td', value);
      if (index === 0) cell.scope = 'row';
      row.append(cell);
    });
    body.append(row);
  });
  table.append(head, body);
  const wrap = createElement(documentRef, 'div', '', 'swishiq-advanced-table-wrap');
  markKeyboardScrollableTable(wrap, 'Exact season values');
  wrap.append(table);
  details.append(wrap);
  result.append(details);
  root.append(result);
}

export function pairProfileChallengeRounds(first, second) {
  return pairProfileMetricRows(first, second)
    .filter(metric => finite(metric.firstValue) && finite(metric.secondValue) && metric.firstValue !== metric.secondValue)
    .slice(0, 5);
}

function renderPairChallenge(documentRef, root, first, second, saved = null, matchup = null, onChange = () => {}) {
  const rounds = pairProfileChallengeRounds(first, second);
  root.hidden = false;
  root.replaceChildren();
  delete root.dataset.challengeStep;
  delete root.dataset.challengeScore;
  delete root.dataset.challengeFirst;
  delete root.dataset.challengeSecond;
  delete root.dataset.challengeMetricIds;
  delete root.dataset.challengeHasNext;
  if (!rounds.length) {
    root.append(createElement(documentRef, 'p', 'No different recorded measures are available for a comparison challenge.', 'swishiq-advanced-muted'));
    if (typeof matchup?.onNext === 'function') {
      const nextAvailable = createElement(documentRef, 'button', 'Next matchup', 'button-secondary');
      nextAvailable.type = 'button';
      nextAvailable.addEventListener('click', matchup.onNext);
      root.append(nextAvailable);
    }
    return;
  }
  const firstId = pairProfileRowId(first);
  const secondId = pairProfileRowId(second);
  const canRestore = saved?.firstId === firstId && saved?.secondId === secondId
    && Array.isArray(saved.metricIds) && saved.metricIds.join('|') === rounds.map(round => round.key).join('|')
    && Number.isSafeInteger(saved.step) && saved.step >= 0 && saved.step <= rounds.length
    && Number.isSafeInteger(saved.score) && saved.score >= 0 && saved.score <= saved.step;
  let step = canRestore ? saved.step : 0;
  let score = canRestore ? saved.score : 0;
  let pendingCorrect = false;
  const progress = createElement(documentRef, 'p', '', 'swishiq-advanced-status');
  const question = createElement(documentRef, 'h4');
  const choices = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__challenge-choices');
  const feedback = createElement(documentRef, 'p', '', 'swishiq-advanced-status');
  feedback.setAttribute('role', 'status');
  const advance = createElement(documentRef, 'button', 'Next measure', 'button-secondary');
  advance.type = 'button';
  const replay = createElement(documentRef, 'button', 'Play again', 'button-secondary');
  replay.type = 'button';
  const nextMatchup = createElement(documentRef, 'button', 'Next matchup', 'button-secondary');
  nextMatchup.type = 'button';
  const sync = () => {
    root.dataset.challengeStep = String(step);
    root.dataset.challengeScore = String(score);
    root.dataset.challengeFirst = firstId;
    root.dataset.challengeSecond = secondId;
    root.dataset.challengeMetricIds = rounds.map(round => round.key).join(',');
    root.dataset.challengeHasNext = typeof matchup?.onNext === 'function' ? 'true' : 'false';
    onChange();
  };
  const draw = (moveFocus = false) => {
    sync();
    choices.replaceChildren();
    feedback.textContent = '';
    pendingCorrect = false;
    advance.hidden = true;
    replay.hidden = step < rounds.length;
    nextMatchup.hidden = step < rounds.length || typeof matchup?.onNext !== 'function';
    const scopeLabel = `${first.teamCode} · ${labelSeason(matchup?.scope || first)} regular season`;
    progress.textContent = `Matchup ${matchup?.number || 1} of ${matchup?.total || 1} · ${scopeLabel} · measure ${Math.min(step + 1, rounds.length)} of ${rounds.length} · ${score} correct`;
    if (step === rounds.length) {
      question.textContent = `Round complete: ${score} of ${rounds.length} correct`;
      progress.textContent = `Matchup ${matchup?.number || 1} of ${matchup?.total || 1} · ${scopeLabel} complete.`;
      if (moveFocus) replay.focus();
      return;
    }
    const metric = rounds[step];
    question.textContent = `Who recorded the higher ${metric.label.toLowerCase()}?`;
    [[first, 'first'], [second, 'second']].forEach(([player, answer]) => {
      const button = createElement(documentRef, 'button', player.displayName, 'button-secondary');
      button.type = 'button';
      button.dataset.challengeAnswer = answer;
      button.addEventListener('click', () => {
        const correct = metric.firstValue > metric.secondValue ? 'first' : 'second';
        pendingCorrect = answer === correct;
        [...choices.children].forEach(choice => { choice.disabled = true; });
        feedback.textContent = `${answer === correct ? 'Correct.' : 'Not this time.'} ${first.displayName}: ${formatMetric(metric.firstValue, metric.type)}; ${second.displayName}: ${formatMetric(metric.secondValue, metric.type)}. ${metricPairEvidenceText(metric, first, second)}. These values describe each player's season; they do not show how the two performed together.`;
        advance.textContent = step + 1 === rounds.length ? 'See result' : 'Next measure';
        advance.hidden = false;
        advance.focus();
      });
      choices.append(button);
    });
    if (moveFocus) choices.querySelector('button')?.focus();
  };
  advance.addEventListener('click', () => { if (pendingCorrect) score += 1; step += 1; draw(true); });
  replay.addEventListener('click', () => { step = 0; score = 0; draw(true); });
  nextMatchup.addEventListener('click', () => matchup?.onNext?.());
  root.append(progress, question, choices, feedback, advance, replay, nextMatchup);
  draw();
}

function renderPairProfileControls(
  documentRef,
  root,
  dataset,
  initialSelection = {},
  onChange = () => {},
  selectionLedger = new Map(),
  onSelectionChange = () => {},
) {
  const form = createElement(documentRef, 'form', '', 'swishiq-advanced-form swishiq-chemistry-lab__form');
  const grid = createElement(documentRef, 'div', '', 'swishiq-advanced-grid swishiq-chemistry-lab__filter-grid');
  const teamLabel = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
  const teamSelect = createElement(documentRef, 'select');
  teamSelect.id = 'chemistryPairTeam';
  teamSelect.name = teamSelect.id;
  teamLabel.append(createElement(documentRef, 'span', 'Team'), teamSelect);
  grid.append(teamLabel);
  const positionLabel = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
  const positionSelect = createElement(documentRef, 'select');
  positionSelect.id = 'chemistryPairPosition';
  positionSelect.name = positionSelect.id;
  positionLabel.append(createElement(documentRef, 'span', 'Position'), positionSelect);
  grid.append(positionLabel);
  const searchLabel = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
  const search = createElement(documentRef, 'input');
  search.type = 'search';
  search.id = 'chemistryPairSearch';
  search.autocomplete = 'off';
  search.placeholder = 'Name, team, or position';
  search.setAttribute('aria-label', 'Search players, teams, or positions');
  searchLabel.append(createElement(documentRef, 'span', 'Search'), search);
  grid.append(searchLabel);
  const buildPlayerControl = (heading, id) => {
    const label = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
    const select = createElement(documentRef, 'select');
    select.id = id;
    select.name = id;
    select.hidden = true;
    select.setAttribute('aria-hidden', 'true');
    label.append(createElement(documentRef, 'span', heading), select);
    form.append(label);
    return select;
  };
  const playerA = buildPlayerControl('Player one', 'chemistryPairPlayerA');
  const playerB = buildPlayerControl('Player two', 'chemistryPairPlayerB');
  const roster = createElement(documentRef, 'section', '', 'swishiq-chemistry-lab__roster');
  roster.setAttribute('aria-label', 'Player-season table and filters');
  const rosterTitle = createElement(documentRef, 'h4', 'Player-season table');
  const rosterScope = createElement(documentRef, 'p', `${labelSeason(dataset.scope)} regular season`, 'swishiq-chemistry-lab__roster-scope');
  const rosterStatus = createElement(documentRef, 'p', 'Loading player rows…', 'swishiq-chemistry-lab__roster-status');
  rosterStatus.setAttribute('role', 'status');
  const sourceGeneration = dataset?.package?.sourceGeneration === 'V4' ? 'V4' : 'V3';
  const rosterSourceNote = createElement(documentRef, 'p', `Roster values, sorting, and player comparisons all use the selected SwishIQ ${sourceGeneration} exact-season player-season package; — means unavailable.`, 'swishiq-table-source-note');
  const tableWrap = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__roster-table-wrap');
  markKeyboardScrollableTable(tableWrap, 'Player-season stats table');
  const table = createElement(documentRef, 'table', '', 'swishiq-chemistry-lab__roster-table');
  table.setAttribute('aria-label', `${labelSeason(dataset.scope)} regular-season player stats`);
  const head = createElement(documentRef, 'thead');
  const headRow = createElement(documentRef, 'tr');
  const rosterSort = { key: 'player', direction: 'ascending' };
  const rosterSortHeaders = new Map();
  const rosterSortLabels = { team: 'Team', player: 'Player', ...Object.fromEntries(Object.entries(PAIR_PROFILE_ROSTER_SORTS).map(([key, spec]) => [key, spec.label])) };
  const rosterNumericSortKeys = new Set(Object.keys(PAIR_PROFILE_ROSTER_SORTS));
  const defaultRosterSortDirection = key => rosterNumericSortKeys.has(key) ? 'descending' : 'ascending';
  const headingSpecs = [
    { label: '', ariaLabel: 'Select player' },
    { label: 'Team', key: 'team' },
    { label: 'Player', key: 'player' },
    { label: 'Pos' },
    ...Object.entries(PAIR_PROFILE_ROSTER_SORTS).map(([key, spec]) => ({ label: spec.label, key })),
  ];
  const updateRosterSortHeaders = () => {
    rosterSortHeaders.forEach(({ header, button, label }, key) => {
      const active = rosterSort.key === key;
      if (active) header.setAttribute('aria-sort', rosterSort.direction);
      else header.removeAttribute('aria-sort');
      button.textContent = active
        ? `${label} ${rosterSort.direction === 'ascending' ? '↑' : '↓'}`
        : label;
      const nextDirection = active
        ? rosterSort.direction === 'ascending' ? 'descending' : 'ascending'
        : defaultRosterSortDirection(key);
      button.setAttribute('aria-label', active
        ? `Sort by ${label}; currently ${rosterSort.direction}. Activate to sort ${nextDirection}.`
        : `Sort by ${label} ${nextDirection}.`);
    });
  };
  headingSpecs.forEach(({ label, key, ariaLabel }) => {
    const cell = createElement(documentRef, 'th');
    cell.setAttribute('scope', 'col');
    if (ariaLabel) cell.setAttribute('aria-label', ariaLabel);
    if (key) {
      const button = createElement(documentRef, 'button', label, 'swishiq-table-sort');
      button.type = 'button';
      button.dataset.rosterSort = key;
      button.addEventListener('click', () => {
        const horizontalScroll = tableWrap.scrollLeft;
        rosterSort.direction = rosterSort.key === key
          ? rosterSort.direction === 'ascending' ? 'descending' : 'ascending'
          : defaultRosterSortDirection(key);
        rosterSort.key = key;
        updateRosterSortHeaders();
        rosterPageIndex = 0;
        renderRoster(true);
        tableWrap.scrollLeft = horizontalScroll;
      });
      cell.append(button);
      rosterSortHeaders.set(key, { header: cell, button, label });
    } else {
      cell.textContent = label;
    }
    headRow.append(cell);
  });
  updateRosterSortHeaders();
  head.append(headRow);
  const body = createElement(documentRef, 'tbody');
  const caption = createElement(documentRef, 'caption', 'Player-season rows');
  table.append(caption, head, body);
  tableWrap.append(table);
  const pager = createElement(documentRef, 'nav', '', 'swishiq-chemistry-lab__roster-pager');
  pager.setAttribute('aria-label', 'Player table pages');
  const previousPage = createElement(documentRef, 'button', 'Previous', 'button-secondary swishiq-chemistry-lab__roster-page-control');
  previousPage.type = 'button';
  previousPage.setAttribute('aria-label', 'Previous player table page');
  const pageStatus = createElement(documentRef, 'span', '', 'swishiq-chemistry-lab__roster-page-status');
  pageStatus.setAttribute('role', 'status');
  const nextPage = createElement(documentRef, 'button', 'Next', 'button-secondary swishiq-chemistry-lab__roster-page-control');
  nextPage.type = 'button';
  nextPage.setAttribute('aria-label', 'Next player table page');
  pager.append(previousPage, pageStatus, nextPage);
  pager.hidden = true;
  roster.append(rosterTitle, rosterScope, rosterStatus, rosterSourceNote, tableWrap);
  roster.append(pager);
  const submit = createElement(documentRef, 'button', 'Compare selected players', 'button');
  submit.type = 'submit';
  submit.disabled = true;
  const status = createElement(documentRef, 'p', 'Select players in the table.', 'swishiq-advanced-status');
  status.setAttribute('role', 'status');
  const results = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__result');
  results.hidden = true;
  results.setAttribute('aria-live', 'polite');
  results.setAttribute('role', 'region');
  results.setAttribute('aria-label', 'Observed lineup results');
  form.append(createElement(documentRef, 'h3', 'Select any two players'), grid, roster, submit, status);
  const workbench = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__workbench-grid swishiq-chemistry-lab__workbench-grid--pair');
  form.classList.add('swishiq-chemistry-lab__workbench-controls');
  results.classList.add('swishiq-chemistry-lab__workbench-evidence');
  workbench.append(form, results);
  root.append(workbench);

  const selectionKey = JSON.stringify(pairProfilePackage(dataset.proof));
  const allRows = dataset.rows.slice();
  const rowById = new Map(allRows.map(row => [pairProfileRowId(row), row]));
  const sortedRows = allRows.slice().sort((left, right) => left.teamCode.localeCompare(right.teamCode)
    || left.displayName.localeCompare(right.displayName)
    || pairProfileRowId(left).localeCompare(pairProfileRowId(right)));
  const baseRowOrder = new Map(sortedRows.map((row, index) => [pairProfileRowId(row), index]));
  const teams = [...new Set(allRows.map(row => row.teamCode))].sort();
  addOption(documentRef, teamSelect, '', 'All teams');
  teams.forEach(team => addOption(documentRef, teamSelect, team, team));
  teamSelect.value = teams.includes(initialSelection.team) ? initialSelection.team : '';
  addOption(documentRef, positionSelect, '', 'All positions');
  const positions = [...new Set(allRows.flatMap(row => Array.isArray(row.positions)
    ? row.positions.map(position => String(position).trim().toUpperCase()).filter(Boolean)
    : []))].sort();
  positions.forEach(position => addOption(documentRef, positionSelect, position, position));
  if (allRows.some(row => !Array.isArray(row.positions) || !row.positions.some(position => String(position).trim()))) {
    addOption(documentRef, positionSelect, '__unavailable__', 'Position unavailable');
  }
  if (positions.includes(initialSelection.position) || initialSelection.position === '__unavailable__') {
    positionSelect.value = initialSelection.position;
  }
  search.value = typeof initialSelection.query === 'string' ? initialSelection.query : '';
  const persistedIds = selectionLedger.get(selectionKey) || [];
  let rosterPageIndex = 0;
  let selectedIds = [...new Set([
    ...persistedIds,
    ...(Array.isArray(initialSelection.selectedIds) ? initialSelection.selectedIds : []),
    initialSelection.playerA,
    initialSelection.playerB,
  ].filter(id => typeof id === 'string' && rowById.has(id)))].slice(0, 2);

  const teamRows = () => sortedRows;
  const filteredRows = () => teamRows().filter(row => (!teamSelect.value || row.teamCode === teamSelect.value)
    && (!positionSelect.value
      || (positionSelect.value === '__unavailable__'
        ? !Array.isArray(row.positions) || !row.positions.some(position => String(position).trim())
        : Array.isArray(row.positions) && row.positions.some(position => String(position).trim().toUpperCase() === positionSelect.value)))
    && (!search.value.trim()
      || [row.displayName, row.teamCode, positionsLabel(row)].some(value => String(value).toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))));
  const rosterSortValue = row => {
    if (rosterSort.key === 'team') return row.teamCode;
    if (rosterSort.key === 'player') return row.displayName;
    const spec = PAIR_PROFILE_ROSTER_SORTS[rosterSort.key];
    return spec ? pairProfileRosterMetricValue(row, rosterSort.key) : null;
  };
  const sortedFilteredRows = () => filteredRows().sort((left, right) => {
    const leftValue = rosterSortValue(left);
    const rightValue = rosterSortValue(right);
    const leftUnavailable = leftValue === null || leftValue === undefined;
    const rightUnavailable = rightValue === null || rightValue === undefined;
    if (leftUnavailable || rightUnavailable) {
      if (leftUnavailable !== rightUnavailable) return leftUnavailable ? 1 : -1;
      return (baseRowOrder.get(pairProfileRowId(left)) ?? 0) - (baseRowOrder.get(pairProfileRowId(right)) ?? 0);
    }
    const compare = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: 'base' });
    if (compare !== 0) return compare * (rosterSort.direction === 'ascending' ? 1 : -1);
    return (baseRowOrder.get(pairProfileRowId(left)) ?? 0) - (baseRowOrder.get(pairProfileRowId(right)) ?? 0);
  });
  const compatiblePairs = () => {
    const rows = selectedIds.map(id => rowById.get(id)).filter(Boolean);
    return rows.length === 2 ? [[rows[0], rows[1]]] : [];
  };
  const saveSelectedIds = () => {
    if (selectedIds.length) selectionLedger.set(selectionKey, selectedIds.slice());
    else selectionLedger.delete(selectionKey);
    onSelectionChange(selectionKey, selectedIds.slice());
  };
  const syncPairControls = (pair = null) => {
    const eligiblePairs = compatiblePairs();
    const isCompatible = candidate => candidate?.length === 2
      && rowById.has(candidate[0]) && rowById.has(candidate[1])
      && candidate[0] !== candidate[1]
      && rowById.get(candidate[0]).seasonStartYear === rowById.get(candidate[1]).seasonStartYear
      && rowById.get(candidate[0]).seasonEndYear === rowById.get(candidate[1]).seasonEndYear
      && rowById.get(candidate[0]).phase === rowById.get(candidate[1]).phase;
    const current = [playerA.value, playerB.value];
    const chosen = (isCompatible(pair) && pair)
      || (isCompatible(current) && current)
      || eligiblePairs[0]?.map(pairProfileRowId)
      || [];
    playerA.value = chosen[0] || '';
    playerB.value = chosen[1] || '';
    form.dataset.selectedPlayerIds = JSON.stringify(selectedIds);
  };
  const renderRoster = (announceSort = false) => {
    const matchingRows = sortedFilteredRows();
    const pageCount = Math.max(1, Math.ceil(matchingRows.length / PAIR_PROFILE_ROSTER_PAGE_SIZE));
    rosterPageIndex = Math.min(rosterPageIndex, pageCount - 1);
    const start = rosterPageIndex * PAIR_PROFILE_ROSTER_PAGE_SIZE;
    const rows = matchingRows.slice(start, start + PAIR_PROFILE_ROSTER_PAGE_SIZE);
    body.replaceChildren();
    rows.forEach(row => {
      const id = pairProfileRowId(row);
      const tr = createElement(documentRef, 'tr');
      const selectCell = createElement(documentRef, 'td');
      const checkbox = createElement(documentRef, 'input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedIds.includes(id);
      checkbox.dataset.playerSeasonId = id;
      checkbox.setAttribute('aria-label', `Select ${row.displayName}`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (selectedIds.length >= 2) {
            checkbox.checked = false;
            status.textContent = 'Choose two players. Deselect one before choosing another.';
            return;
          }
          if (!selectedIds.includes(id)) selectedIds.push(id);
        } else {
          selectedIds = selectedIds.filter(selected => selected !== id);
        }
        saveSelectedIds();
        syncPairControls();
        updateReady();
        renderRoster();
        clearComparison();
      });
      selectCell.append(checkbox);
      const name = createElement(documentRef, 'th', row.displayName);
      name.setAttribute('scope', 'row');
      const values = [
        positionsLabel(row) === 'Position unavailable' ? '—' : positionsLabel(row),
        pairProfileRosterMetricValue(row, 'games'),
        pairProfileRosterMetricValue(row, 'minutes'),
        pairProfileRosterMetricValue(row, 'points'),
        pairProfileRosterMetricValue(row, 'assists'),
        pairProfileRosterMetricValue(row, 'rebounds'),
        pairProfileRosterMetricValue(row, 'trueShooting'),
      ].map((value, index) => value === null || value === undefined ? '—'
        : typeof value === 'number' ? index === 1 ? formatTotal(value, 'games') : index === 6 ? `${(value * 100).toFixed(1)}%` : Number(value).toFixed(1)
          : String(value));
      tr.append(selectCell, createElement(documentRef, 'td', row.teamCode), name, ...values.map((value, index) => {
        const cell = createElement(documentRef, 'td', value);
        if (index >= 1) cell.classList.add('swishiq-table-numeric');
        return cell;
      }));
      body.append(tr);
    });
    const pairs = compatiblePairs();
    const otherScopeSelections = [...selectionLedger.entries()]
      .filter(([key]) => key !== selectionKey)
      .reduce((count, [, ids]) => count + ids.length, 0);
    const end = Math.min(start + rows.length, matchingRows.length);
    pageStatus.textContent = matchingRows.length
      ? `Showing ${start + 1}–${end} of ${matchingRows.length}`
      : 'No rows';
    previousPage.disabled = rosterPageIndex === 0;
    nextPage.disabled = rosterPageIndex >= pageCount - 1;
    pager.hidden = pageCount <= 1;
    rosterStatus.textContent = `${matchingRows.length} match${matchingRows.length === 1 ? '' : 'es'} · ${selectedIds.length} of 2 players selected${pairs.length ? ' · ready to compare' : ''}`
      + (otherScopeSelections ? ` · ${otherScopeSelections} saved from other seasons` : '')
      + (announceSort ? ` · Sorted by ${rosterSortLabels[rosterSort.key]} ${rosterSort.direction}.` : '');
    if (matchingRows.length === 0) rosterStatus.textContent = `No player rows match these filters.${otherScopeSelections ? ` ${otherScopeSelections} players remain saved from other seasons.` : ''}`;
  };
  const refreshPlayers = () => {
    const rows = teamRows();
    playerA.replaceChildren();
    playerB.replaceChildren();
    addOption(documentRef, playerA, '', 'Choose player');
    addOption(documentRef, playerB, '', 'Choose player');
    rows.forEach(row => {
      const id = pairProfileRowId(row);
      addOption(documentRef, playerA, id, playerLabel(row));
      addOption(documentRef, playerB, id, playerLabel(row));
    });
    selectedIds = selectedIds.filter(id => rowById.has(id));
    syncPairControls();
    renderRoster();
    updateReady();
  };
  const updateReady = () => {
    const pairs = compatiblePairs();
    const ready = pairs.length === 1 && rowById.has(playerA.value) && rowById.has(playerB.value);
    submit.disabled = !ready;
    submit.textContent = 'Compare selected players';
    status.textContent = ready
      ? 'Ready to compare these two players.'
      : selectedIds.length
        ? `${selectedIds.length} of 2 selected · choose a player from any team in this season.`
        : 'Select any two players from this season.';
  };
  const clearComparison = () => {
    results.replaceChildren();
    results.hidden = true;
    onChange();
  };
  teamSelect.addEventListener('change', () => { rosterPageIndex = 0; renderRoster(); updateReady(); });
  positionSelect.addEventListener('change', () => { rosterPageIndex = 0; renderRoster(); });
  search.addEventListener('input', () => { rosterPageIndex = 0; renderRoster(); });
  previousPage.addEventListener('click', () => { rosterPageIndex = Math.max(0, rosterPageIndex - 1); renderRoster(); });
  nextPage.addEventListener('click', () => { rosterPageIndex += 1; renderRoster(); });
  const syncFromPairControls = () => {
    const first = rowById.get(playerA.value);
    const second = rowById.get(playerB.value);
    if (first && second && first.seasonStartYear === second.seasonStartYear
      && first.seasonEndYear === second.seasonEndYear && first.phase === second.phase) {
      selectedIds = [...new Set([pairProfileRowId(first), pairProfileRowId(second)])];
      syncPairControls([pairProfileRowId(first), pairProfileRowId(second)]);
      saveSelectedIds();
    } else {
      syncPairControls();
    }
    updateReady();
    renderRoster();
    clearComparison();
  };
  playerA.addEventListener('change', syncFromPairControls);
  playerB.addEventListener('change', syncFromPairControls);
  refreshPlayers();
  const restoredPair = [initialSelection.playerA, initialSelection.playerB];
  if (restoredPair.every(id => typeof id === 'string' && rowById.has(id))) syncPairControls(restoredPair);
  else syncPairControls();
  saveSelectedIds();
  renderRoster();
  updateReady();
  const showPair = (first, second, publish = true) => {
    syncPairControls([pairProfileRowId(first), pairProfileRowId(second)]);
    renderRoster();
    updateReady();
    const pairScope = pairProfileScope(dataset.proof);
    renderComparison(documentRef, results, dataset, first, second);
    results.hidden = false;
    onChange();
    if (!publish) return;
    publishSwishIqLabHandoff('pair', {
      packageRef: pairProfileHandoffPackageRef(dataset.proof, pairScope),
      first: { ...first, observed: true, phase: 'regular', seasonStartYear: pairScope.seasonStartYear },
      second: { ...second, observed: true, phase: 'regular', seasonStartYear: pairScope.seasonStartYear },
    });
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const first = rowById.get(playerA.value);
    const second = rowById.get(playerB.value);
    const compatible = first && second && first.seasonStartYear === second.seasonStartYear
      && first.seasonEndYear === second.seasonEndYear && first.phase === second.phase;
    if (!compatible) {
      clearComparison();
      results.replaceChildren(createElement(documentRef, 'p', 'Choose two different players from the selected season.', 'swishiq-advanced-notice swishiq-advanced-notice--error'));
      status.textContent = 'Select two compatible players to compare.';
      results.hidden = false;
      return;
    }
    showPair(first, second, true);
    status.textContent = '';
  });
  const restoredFirst = rowById.get(playerA.value);
  const restoredSecond = rowById.get(playerB.value);
  if (restoredFirst && restoredSecond && restoredFirst !== restoredSecond) {
    showPair(restoredFirst, restoredSecond, false);
  }
}

function chemistryKindLabel(kind) {
  return kind === 'exact-five' ? 'Exact five' : kind === 'shared-floor' ? 'Shared floor' : kind;
}

function chemistryMetricValueText(metric) {
  if (metric?.status !== 'available' || !finite(metric.value)) return 'Unavailable';
  const unit = metric.unit === CHEMISTRY_RATE_UNIT ? 'points per 100' : metric.unit || '';
  return `${Number(metric.value.toFixed(1))} ${unit}`.trim();
}

function chemistryMetricEvidenceText(metric) {
  const parts = [];
  const reason = publicString(metric?.reason);
  if (metric?.status !== 'available' && reason) parts.push(`Unavailable: ${reason.slice(0, 120)}`);
  if (metric?.status === 'limited_sample') parts.push('Publisher marks limited sample');
  if (nonNegative(metric?.numerator) && nonNegative(metric?.denominator)) {
    parts.push(`${formatTotal(metric.numerator)} / ${formatTotal(metric.denominator)} published numerator / denominator`);
  }
  if (publicString(metric?.coverage)) parts.push(`Coverage: ${publicString(metric.coverage)}`);
  if (publicString(metric?.evidenceKind)) parts.push(`Evidence: ${publicString(metric.evidenceKind)}`);
  return parts.length ? parts.join(' · ') : 'Published sample details unavailable';
}

function renderChemistryMetricList(documentRef, row) {
  const list = createElement(documentRef, 'dl', '', 'swishiq-chemistry-combination__metrics');
  [['Offense', row.offense], ['Defense', row.defense], ['Net', row.net]].forEach(([label, metric]) => {
    const item = createElement(documentRef, 'div');
    const term = createElement(documentRef, 'dt', label);
    const detail = createElement(documentRef, 'dd');
    detail.append(
      createElement(documentRef, 'strong', chemistryMetricValueText(metric)),
      createElement(documentRef, 'span', ` · ${chemistryHeadlineEvidenceText(metric, label, row.headlineEvidence)}`, 'swishiq-chemistry-combination__headline-evidence'),
    );
    item.append(term, detail);
    list.append(item);
  });
  return list;
}

function chemistryHeadlineEvidenceText(metric, label, evidence) {
  const exposure = evidence?.observedExposure || {};
  const support = evidence?.exactFiveSupport || {};
  const denominator = nonNegative(metric?.denominator) ? `${formatTotal(metric.denominator)} possessions` : 'unavailable';
  const parts = [label === 'Net'
    ? 'standalone denominator not published (net is derived from offense and defense rates)'
    : `published denominator ${denominator}`];
  const observedPossessions = label === 'Offense' ? exposure.offensivePossessions
    : label === 'Defense' ? exposure.defensivePossessions : null;
  if (nonNegative(observedPossessions)) {
    parts.push(`observed exposure ${formatTotal(observedPossessions)} ${label.toLowerCase()} possessions`);
  } else if (label !== 'Net') {
    parts.push(`${label.toLowerCase()} possession exposure unavailable`);
  }
  const count = supportedCount(support.exactFiveCount);
  const lineupRows = supportedCount(support.exactFiveLineupRows);
  if (count !== null || lineupRows !== null) {
    parts.push(`exact-five count ${count === null ? 'unavailable' : formatTotal(count)} across ${lineupRows === null ? 'unavailable' : formatTotal(lineupRows)} matching lineup rows`);
  } else {
    parts.push('exact-five count unavailable');
  }
  const supportPossessions = label === 'Offense' ? support.possessionsFor
    : label === 'Defense' ? support.possessionsAgainst : null;
  if (nonNegative(supportPossessions)) {
    parts.push(`support exposure ${formatTotal(supportPossessions)} exact-five ${label.toLowerCase()} possessions`);
  }
  if (publicString(evidence?.evidenceStatus) && evidence.evidenceStatus !== 'not-reported') {
    parts.push(`Chemistry evidence ${publicString(evidence.evidenceStatus)}`);
  }
  if (supportedCount(support.heldLineupRows) > 0) {
    parts.push(`${formatTotal(support.heldLineupRows)} matching exact-five source rows held and excluded`);
  }
  if (supportedCount(support.unavailableLineupRows) > 0) {
    parts.push(`${formatTotal(support.unavailableLineupRows)} matching exact-five rows unavailable`);
  }
  parts.push(`support ${publicString(support.status) || 'unavailable'}`);
  return parts.join(' · ');
}

function renderChemistryMetricEvidence(documentRef, row) {
  const details = createElement(documentRef, 'details', '', 'swishiq-chemistry-combination__evidence');
  details.append(createElement(documentRef, 'summary', 'Metric evidence & coverage'));
  const list = createElement(documentRef, 'dl', '', 'swishiq-chemistry-combination__evidence-list');
  [['Offense', row.offense], ['Defense', row.defense], ['Net', row.net]].forEach(([label, metric]) => {
    const item = createElement(documentRef, 'div');
    item.append(
      createElement(documentRef, 'dt', label),
      createElement(documentRef, 'dd', chemistryMetricEvidenceText(metric)),
    );
    list.append(item);
  });
  details.append(list);
  return details;
}

export function observedCombinationSamplePresentation(rows) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  const unavailableCount = visibleRows.filter(row => !finite(row?.minutes)).length;
  const allUnavailable = visibleRows.length > 0 && unavailableCount === visibleRows.length;
  return {
    showRowNotes: !allUnavailable,
    sharedNotice: allUnavailable
      ? `Published sample minutes are unavailable for all ${visibleRows.length.toLocaleString()} displayed lineups.`
      : '',
  };
}

export function renderObservedCombinationRow(documentRef, row, { showSampleMinutes = true, playerStatsByTeamRef = null } = {}) {
  const card = createElement(documentRef, 'article', '', 'swishiq-chemistry-combination');
  const heading = createElement(documentRef, 'div', '', 'swishiq-chemistry-combination__heading');
  const copy = createElement(documentRef, 'div');
  copy.append(
    createElement(documentRef, 'span', 'Observed lineup', 'swishiq-kicker'),
    createElement(documentRef, 'h4', `${row.team} · ${row.playerNames.join(' + ')}`),
  );
  const kindLabel = chemistryKindLabel(row.kind);
  const kind = createElement(documentRef, 'span', kindLabel, 'swishiq-chemistry-combination__kind');
  kind.setAttribute('aria-label', `Observed lineup kind: ${row.kind}`);
  heading.append(copy, kind);

  const sample = createElement(
    documentRef,
    'p',
    `Published sample minutes: ${finite(row.minutes) ? `${formatTotal(row.minutes, 'minutes')} minutes` : 'unavailable'}.`,
    'swishiq-chemistry-combination__sample',
  );
  const averageValues = [
    ['PPG', 'pointsPerGame'],
    ['APG', 'assistsPerGame'],
    ['RPG', 'reboundsPerGame'],
  ].map(([label, metric]) => {
    const values = row.players.map(playerRef => publicDisplayMetricValue(
      playerStatsByTeamRef instanceof Map ? playerStatsByTeamRef.get(`${row.team}|${playerRef}`) : null,
      metric,
      ['per-game'],
    ));
    return [label, values.length && values.every(finite) ? values.reduce((sum, value) => sum + value, 0) : null];
  });
  const averagesHeading = createElement(documentRef, 'h5', 'Combined player averages', 'swishiq-chemistry-combination__averages-heading');
  const averages = createElement(documentRef, 'dl', '', 'swishiq-chemistry-combination__metrics swishiq-chemistry-combination__player-averages');
  averageValues.forEach(([label, value]) => {
    const item = createElement(documentRef, 'div');
    const detail = createElement(documentRef, 'dd');
    detail.append(createElement(documentRef, 'strong', finite(value) ? value.toFixed(1) : 'Unavailable'));
    item.append(createElement(documentRef, 'dt', label), detail);
    averages.append(item);
  });
  const hasPlayerAverages = averageValues.some(([, value]) => finite(value));
  card.append(heading);
  if (showSampleMinutes) card.append(sample);
  if (hasPlayerAverages) {
    card.append(
      averagesHeading,
      averages,
      createElement(documentRef, 'p', 'Sum of each player’s individual season average.', 'swishiq-chemistry-combination__note'),
    );
  }
  card.append(renderChemistryMetricList(documentRef, row), renderChemistryMetricEvidence(documentRef, row));
  return card;
}

export function observedLineupChallengeRounds(rows) {
  const source = Array.isArray(rows) ? rows : [];
  for (let firstIndex = 0; firstIndex < source.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < source.length; secondIndex += 1) {
      const first = source[firstIndex];
      const second = source[secondIndex];
      if (first.team !== second.team || first.kind !== second.kind || first.id === second.id
        || !Array.isArray(first.playerNames) || !Array.isArray(second.playerNames)
        || first.playerNames.join('|') === second.playerNames.join('|')) continue;
      const rounds = [['Net', 'net'], ['Offense', 'offense'], ['Defense', 'defense']]
        .filter(([, key]) => first[key]?.status === 'available' && second[key]?.status === 'available'
          && finite(first[key].value) && finite(second[key].value) && first[key].value !== second[key].value)
        .map(([label, key]) => ({ label, key, first, second }));
      if (rounds.length) return rounds;
    }
  }
  return [];
}

function observedLineupChallengeMatchups(rows) {
  let remaining = Array.isArray(rows) ? rows : [];
  const matchups = [];
  while (remaining.length >= 2) {
    const rounds = observedLineupChallengeRounds(remaining);
    if (!rounds.length) break;
    matchups.push(rounds);
    const { first, second } = rounds[0];
    remaining = remaining.filter(row => row.id !== first.id && row.id !== second.id);
  }
  return matchups;
}

function renderObservedLineupChallenge(documentRef, root, rows, saved = null, onNextPage = null, onChange = () => {}) {
  root.replaceChildren();
  delete root.dataset.challengeStep;
  delete root.dataset.challengeScore;
  delete root.dataset.challengeFirst;
  delete root.dataset.challengeSecond;
  delete root.dataset.challengeMatchupIndex;
  delete root.dataset.challengeMetricIds;
  delete root.dataset.challengeHasNext;
  const matchups = observedLineupChallengeMatchups(rows);
  if (!matchups.length) {
    root.append(createElement(documentRef, 'p', 'This page has no same-team, same-kind published rows with different available rates to challenge.', 'swishiq-advanced-muted'));
    if (typeof onNextPage === 'function') {
      const nextAvailable = createElement(documentRef, 'button', 'Next observed page', 'button-secondary');
      nextAvailable.type = 'button';
      nextAvailable.addEventListener('click', onNextPage);
      root.append(nextAvailable);
    }
    return;
  }
  const savedMatchupIndex = Number.isSafeInteger(saved?.matchupIndex) && saved.matchupIndex >= 0 && saved.matchupIndex < matchups.length
    ? saved.matchupIndex : 0;
  let matchupIndex = savedMatchupIndex;
  let rounds = matchups[matchupIndex];
  let { first, second } = rounds[0];
  const canRestore = saved?.firstId === first.id && saved?.secondId === second.id
    && Array.isArray(saved.metricIds) && saved.metricIds.join('|') === rounds.map(round => round.key).join('|')
    && Number.isSafeInteger(saved.step) && saved.step >= 0 && saved.step <= rounds.length
    && Number.isSafeInteger(saved.score) && saved.score >= 0 && saved.score <= saved.step;
  let step = canRestore ? saved.step : 0;
  let score = canRestore ? saved.score : 0;
  let pendingCorrect = false;
  const progress = createElement(documentRef, 'p', '', 'swishiq-advanced-status');
  const question = createElement(documentRef, 'h4');
  const choices = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__challenge-choices');
  const feedback = createElement(documentRef, 'p', '', 'swishiq-advanced-status');
  feedback.setAttribute('role', 'status');
  const next = createElement(documentRef, 'button', 'Next rate', 'button-secondary');
  next.type = 'button';
  const replay = createElement(documentRef, 'button', 'Play again', 'button-secondary');
  replay.type = 'button';
  const continuePath = createElement(documentRef, 'button', 'Next lineup matchup', 'button-secondary');
  continuePath.type = 'button';
  const draw = (moveFocus = false) => {
    root.dataset.challengeStep = String(step);
    root.dataset.challengeScore = String(score);
    root.dataset.challengeFirst = first.id;
    root.dataset.challengeSecond = second.id;
    root.dataset.challengeMatchupIndex = String(matchupIndex);
    root.dataset.challengeMetricIds = rounds.map(round => round.key).join(',');
    root.dataset.challengeHasNext = matchupIndex + 1 < matchups.length || typeof onNextPage === 'function' ? 'true' : 'false';
    onChange();
    choices.replaceChildren();
    feedback.textContent = '';
    pendingCorrect = false;
    next.hidden = true;
    replay.hidden = step < rounds.length;
    continuePath.hidden = step < rounds.length || (matchupIndex + 1 >= matchups.length && typeof onNextPage !== 'function');
    continuePath.textContent = matchupIndex + 1 < matchups.length ? 'Next lineup matchup' : 'Next observed page';
    progress.textContent = `Matchup ${matchupIndex + 1} of ${matchups.length} on this page · rate ${Math.min(step + 1, rounds.length)} of ${rounds.length} · ${score} correct`;
    if (step === rounds.length) {
      question.textContent = `Round complete: ${score} of ${rounds.length} correct`;
      progress.textContent = `Matchup ${matchupIndex + 1} of ${matchups.length} on this page complete.`;
      if (moveFocus) replay.focus();
      return;
    }
    const round = rounds[step];
    question.textContent = `Which ${first.team} ${chemistryKindLabel(first.kind).toLowerCase()} row has the higher published ${round.label.toLowerCase()} rate?`;
    [[first, 'first'], [second, 'second']].forEach(([row, answer], index) => {
      const button = createElement(documentRef, 'button', `Lineup ${index + 1}: ${row.playerNames.join(' + ')}`, 'button-secondary');
      button.type = 'button';
      button.dataset.challengeAnswer = answer;
      button.addEventListener('click', () => {
        const correct = first[round.key].value > second[round.key].value ? 'first' : 'second';
        pendingCorrect = answer === correct;
        [...choices.children].forEach(choice => { choice.disabled = true; });
        feedback.textContent = `${answer === correct ? 'Correct.' : 'Not this time.'} Lineup 1: ${chemistryMetricValueText(first[round.key])}; lineup 2: ${chemistryMetricValueText(second[round.key])}. Samples: ${finite(first.minutes) ? formatTotal(first.minutes, 'minutes') : 'unavailable'} and ${finite(second.minutes) ? formatTotal(second.minutes, 'minutes') : 'unavailable'} minutes. These are published observations, not a causal chemistry estimate.`;
        next.textContent = step + 1 === rounds.length ? 'See result' : 'Next rate';
        next.hidden = false;
        next.focus();
      });
      choices.append(button);
    });
    if (moveFocus) choices.querySelector('button')?.focus();
  };
  next.addEventListener('click', () => { if (pendingCorrect) score += 1; step += 1; draw(true); });
  replay.addEventListener('click', () => { step = 0; score = 0; draw(true); });
  continuePath.addEventListener('click', () => {
    if (matchupIndex + 1 < matchups.length) {
      matchupIndex += 1;
      rounds = matchups[matchupIndex];
      ({ first, second } = rounds[0]);
      step = 0;
      score = 0;
      draw(true);
    } else onNextPage?.();
  });
  root.append(progress, question, choices, feedback, next, replay, continuePath);
  draw();
}

function renderObservedCombinationResults(documentRef, root, rows, visibleOffset, onPreviousPage, onNextPage, playerStatsByTeamRef = null) {
  const pageStart = Math.min(visibleOffset, Math.max(0, rows.length - 1));
  renderObservedCombinationPage(
    documentRef,
    root,
    rows.slice(pageStart, pageStart + OBSERVED_COMBINATION_PAGE_SIZE),
    rows.length,
    pageStart,
    onPreviousPage,
    onNextPage,
    playerStatsByTeamRef,
  );
}

export function renderObservedCombinationError(documentRef, root, error, { focus = false } = {}) {
  const heading = createElement(documentRef, 'h4', 'Observed lineups unavailable', 'swishiq-advanced-notice');
  heading.tabIndex = -1;
  root.replaceChildren(
    heading,
    createElement(documentRef, 'p', 'Lineup results could not be loaded for this season.', 'swishiq-advanced-notice swishiq-advanced-notice--error'),
  );
  if (focus) heading.focus();
  return heading;
}

function renderObservedCombinationPage(documentRef, root, visibleRows, totalCount, pageStart, onPreviousPage, onNextPage, playerStatsByTeamRef = null) {
  root.replaceChildren();
  const heading = createElement(documentRef, 'h4', totalCount ? 'Results' : 'No matching observed lineups');
  heading.tabIndex = -1;
  root.append(heading);
  if (!totalCount || !visibleRows.length) {
    root.append(createElement(documentRef, 'p', 'No observed lineup matches these filters.', 'swishiq-advanced-notice'));
    return;
  }
  const firstRow = pageStart + 1;
  const lastRow = pageStart + visibleRows.length;
  root.append(createElement(documentRef, 'p', `Showing ${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${totalCount.toLocaleString()} matching observed lineup${totalCount === 1 ? '' : 's'}.`, 'swishiq-advanced-muted'));
  const samplePresentation = observedCombinationSamplePresentation(visibleRows);
  if (samplePresentation.sharedNotice) {
    root.append(createElement(documentRef, 'p', samplePresentation.sharedNotice, 'swishiq-chemistry-combination__sample'));
  }
  const grid = createElement(documentRef, 'div', '', 'swishiq-chemistry-combination-grid');
  visibleRows.forEach(row => grid.append(renderObservedCombinationRow(documentRef, row, {
    showSampleMinutes: samplePresentation.showRowNotes,
    playerStatsByTeamRef,
  })));
  root.append(grid);
  const pager = createElement(documentRef, 'div', '', 'swishiq-chemistry-combination__pager');
  pager.setAttribute('role', 'group');
  pager.setAttribute('aria-label', 'Observed lineup pages');
  if (pageStart > 0) {
    const previous = createElement(documentRef, 'button', 'Previous page', 'button-secondary swishiq-chemistry-combination__page');
    previous.type = 'button';
    previous.dataset.observedLineupPage = 'previous';
    previous.addEventListener('click', onPreviousPage);
    pager.append(previous);
  }
  if (pageStart + visibleRows.length < totalCount) {
    const next = createElement(documentRef, 'button', 'Next page', 'button-secondary swishiq-chemistry-combination__page');
    next.type = 'button';
    next.dataset.observedLineupPage = 'next';
    next.addEventListener('click', onNextPage);
    pager.append(next);
  }
  if (pager.childElementCount) root.append(pager);
}

function renderCombinationExplorerControls(documentRef, root, dataset, initialSelection = {}, isCurrent = () => true, onChange = () => {}, playerStatsByTeamRef = null) {
  root.replaceChildren();
  const headingTitle = createElement(documentRef, 'h3', 'Observed lineups');
  headingTitle.id = 'combinationViewTitle';
  root.append(
    headingTitle,
    createElement(documentRef, 'p', 'Observed lineup results are descriptive; they do not show causal chemistry effects or forecasts.', 'swishiq-advanced-muted'),
  );

  const form = createElement(documentRef, 'form', '', 'swishiq-advanced-form swishiq-chemistry-combination__form');
  form.addEventListener('submit', event => event.preventDefault());
  const grid = createElement(documentRef, 'div', '', 'swishiq-advanced-grid');
  const buildSelect = (labelText, id, options) => {
    const label = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
    label.htmlFor = id;
    const select = createElement(documentRef, 'select');
    select.id = id;
    select.name = id;
    options.forEach(option => addOption(documentRef, select, option.value, option.label));
    label.append(createElement(documentRef, 'span', labelText), select);
    grid.append(label);
    return select;
  };
  const indexes = dataset.indexes || indexObservedChemistryRows(dataset.rows);
  const teams = dataset.teams || [...indexes.rowsByTeam.keys()].sort();
  const teamSelect = buildSelect('Team', 'chemistryCombinationTeam', [
    { value: '', label: 'All teams' },
    ...teams.map(team => ({ value: team, label: team })),
  ]);
  const groupSizeSelect = buildSelect('Group size', 'chemistryCombinationGroupSize', [
    { value: '', label: 'All groups (2–5)' },
    ...OBSERVED_COMBINATION_GROUP_SIZES.map(size => ({ value: String(size), label: `${size} players` })),
  ]);
  const kindSelect = buildSelect('Kind', 'chemistryCombinationKind', [
    { value: '', label: 'All kinds' },
    ...OBSERVED_COMBINATION_KINDS.map(kind => ({ value: kind, label: chemistryKindLabel(kind) })),
  ]);
  const players = (dataset.players || [...(dataset.playerByRef instanceof Map ? dataset.playerByRef.values() : [])])
    .filter(player => player?.playerRef && player?.displayName)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const initialPlayer = players.find(player => player.playerRef === initialSelection.playerRef);
  const playerSelect = buildSelect('Player', 'chemistryCombinationPlayer', [
    { value: '', label: 'Choose a team or search a name' },
    ...(initialPlayer ? [{ value: initialPlayer.playerRef, label: initialPlayer.displayName }] : []),
  ]);
  const playerMenuStatus = createElement(documentRef, 'small', '', 'swishiq-advanced-muted');
  playerMenuStatus.id = 'chemistryCombinationPlayerStatus';
  playerMenuStatus.setAttribute('role', 'status');
  playerSelect.setAttribute('aria-describedby', playerMenuStatus.id);
  playerSelect.parentElement.append(playerMenuStatus);
  if (teams.includes(initialSelection.team)) teamSelect.value = initialSelection.team;
  if (OBSERVED_COMBINATION_GROUP_SIZES.some(size => String(size) === initialSelection.groupSize)) groupSizeSelect.value = initialSelection.groupSize;
  if (OBSERVED_COMBINATION_KINDS.includes(initialSelection.kind)) kindSelect.value = initialSelection.kind;
  if (Array.from(playerSelect.options).some(option => option.value === initialSelection.playerRef)) playerSelect.value = initialSelection.playerRef;
  const refreshPlayerOptions = () => {
    const prior = playerSelect.value;
    const eligibleRefs = teamSelect.value
      ? indexes.playerRefsByTeam.get(teamSelect.value) || new Set()
      : indexes.allPlayerRefs;
    const nameQuery = search.value.trim().toLocaleLowerCase();
    const matches = players.filter(player => eligibleRefs.has(player.playerRef)
      && (!nameQuery || player.displayName.toLocaleLowerCase().includes(nameQuery)));
    const eligiblePlayers = teamSelect.value || nameQuery ? matches.slice(0, 40)
      : matches.filter(player => player.playerRef === prior);
    if (prior && matches.some(player => player.playerRef === prior)
      && !eligiblePlayers.some(player => player.playerRef === prior)) {
      if (eligiblePlayers.length === 40) eligiblePlayers.pop();
      eligiblePlayers.push(matches.find(player => player.playerRef === prior));
    }
    const selectedOutsideFirstPage = prior && matches.length > 40
      && !matches.slice(0, 40).some(player => player.playerRef === prior);
    playerMenuStatus.textContent = !teamSelect.value && !nameQuery
      ? prior
        ? 'Selected player remains available. Choose a team or search a name to browse more players.'
        : 'Choose a team or search a name to browse players. Name search also filters lineups.'
      : matches.length > 40
        ? `Showing 40 of ${matches.length} matching published players${selectedOutsideFirstPage ? ', including your selected player' : ''}. Narrow the name search to find another player.`
        : matches.length
          ? `${matches.length} matching published player${matches.length === 1 ? '' : 's'}. Name search also filters lineups.`
          : 'No published players match. Choose another team or search term.';
    playerSelect.replaceChildren();
    addOption(documentRef, playerSelect, '', !teamSelect.value && !nameQuery && !prior
      ? 'Choose a team or search a name'
      : matches.length > 40 && (teamSelect.value || nameQuery) ? 'All players · 40 matches shown'
        : matches.length ? 'All players in the row' : 'No players match');
    eligiblePlayers.forEach(player => addOption(documentRef, playerSelect, player.playerRef, player.displayName));
    if (prior && eligiblePlayers.some(player => player.playerRef === prior)) playerSelect.value = prior;
    else playerSelect.value = '';
    playerSelect.disabled = eligiblePlayers.length === 0;
  };
  const searchLabel = createElement(documentRef, 'label', '', 'swishiq-advanced-field');
  const search = createElement(documentRef, 'input');
  search.type = 'search';
  search.id = 'chemistryCombinationPlayerSearch';
  search.name = search.id;
  search.autocomplete = 'off';
  search.placeholder = 'Search player names';
  search.maxLength = CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH;
  search.value = typeof initialSelection.query === 'string'
    && initialSelection.query.length <= CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH
    ? initialSelection.query
    : '';
  searchLabel.htmlFor = search.id;
  searchLabel.append(createElement(documentRef, 'span', 'Player name'), search);
  grid.append(searchLabel);
  const status = createElement(documentRef, 'p', 'Filtering combinations.', 'swishiq-advanced-status sr-only');
  status.setAttribute('role', 'status');
  const resultRoot = createElement(documentRef, 'div', '', 'swishiq-chemistry-combination__results');
  resultRoot.setAttribute('aria-live', 'polite');
  resultRoot.setAttribute('role', 'region');
  resultRoot.setAttribute('aria-label', 'Observed lineup results');
  form.append(createElement(documentRef, 'h4', 'Filter observed lineups'), grid, status);
  const workbench = createElement(documentRef, 'div', '', 'swishiq-chemistry-lab__workbench-grid swishiq-chemistry-lab__workbench-grid--observed');
  form.classList.add('swishiq-chemistry-lab__workbench-controls');
  resultRoot.classList.add('swishiq-chemistry-lab__workbench-evidence');
  workbench.append(form, resultRoot);
  root.append(workbench);

  let visibleOffset = Number.isSafeInteger(initialSelection.offset) && initialSelection.offset >= 0
    ? Math.floor(initialSelection.offset / OBSERVED_COMBINATION_PAGE_SIZE) * OBSERVED_COMBINATION_PAGE_SIZE
    : 0;
  let updateGeneration = 0;
  let searchTimer = null;
  const update = async ({ resetPage = true, restorePageFocus = '' } = {}) => {
    const generation = ++updateGeneration;
    if (resetPage) visibleOffset = 0;
    resultRoot.dataset.pageOffset = String(visibleOffset);
    const filters = {
      team: teamSelect.value,
      groupSize: groupSizeSelect.value,
      kind: kindSelect.value,
      playerRef: playerSelect.value,
      query: search.value,
    };
    resultRoot.setAttribute('aria-busy', 'true');
    status.textContent = 'Filtering observed lineups…';
    let page;
    try {
      if (typeof dataset.query === 'function') {
        page = await dataset.query(filters, visibleOffset);
      } else {
        const rows = filterObservedChemistryRows(dataset.rows, filters, indexes);
        page = {
          rows: rows.slice(visibleOffset, visibleOffset + OBSERVED_COMBINATION_PAGE_SIZE),
          filteredRows: rows,
          totalCount: rows.length,
          pageStart: Math.min(visibleOffset, Math.max(0, rows.length - 1)),
        };
      }
    } catch (error) {
      if (generation !== updateGeneration || !isCurrent()) return;
      status.textContent = 'Observed lineup results could not be refreshed.';
      renderObservedCombinationError(documentRef, resultRoot, error, { focus: Boolean(restorePageFocus) });
      resultRoot.removeAttribute('aria-busy');
      return;
    }
    if (generation !== updateGeneration || !isCurrent()) return;
    resultRoot.removeAttribute('aria-busy');
    const groupLabel = filters.groupSize ? `${filters.groupSize}-player` : '2–5-player';
    status.textContent = `${page.totalCount.toLocaleString()} ${groupLabel} combination${page.totalCount === 1 ? '' : 's'} match the current filters.`;
    const previousPage = () => {
      visibleOffset = Math.max(0, visibleOffset - OBSERVED_COMBINATION_PAGE_SIZE);
      void update({ resetPage: false, restorePageFocus: 'previous' });
    };
    const nextPage = () => {
      visibleOffset += OBSERVED_COMBINATION_PAGE_SIZE;
      void update({ resetPage: false, restorePageFocus: 'next' });
    };
    if (typeof dataset.query === 'function') {
      renderObservedCombinationPage(documentRef, resultRoot, page.rows, page.totalCount, page.pageStart, previousPage, nextPage, playerStatsByTeamRef);
    } else {
      renderObservedCombinationResults(documentRef, resultRoot, page.filteredRows, visibleOffset, previousPage, nextPage, playerStatsByTeamRef);
    }
    if (restorePageFocus) {
      const focusTarget = resultRoot.querySelector(`[data-observed-lineup-page="${restorePageFocus}"]`) || resultRoot.querySelector('h4');
      focusTarget?.focus();
    }
  };
  teamSelect.addEventListener('change', () => { refreshPlayerOptions(); void update(); });
  [groupSizeSelect, kindSelect, playerSelect].forEach(control => control.addEventListener('change', () => { void update(); }));
  search.addEventListener('input', () => {
    refreshPlayerOptions();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void update(); }, 120);
  });
  refreshPlayerOptions();
  void update({ resetPage: false });
}

function loadObservedChemistryDatasetInWorker(nativeProof, requestedScope, onProgress, shouldContinue, playerRecords = null) {
  if (typeof globalThis.Worker !== 'function') return Promise.resolve(undefined);
  let worker;
  try {
    worker = new Worker(new URL('./chemistry-observed-worker.js?v=20261002i&rev=chemistry-observed-worker-v16-v4-artifact-identities', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let ready = false;
    let workerError = null;
    let nextRequestId = 1;
    let loadTimeoutId = null;
    let workerTerminated = false;
    const pendingQueries = new Map();
    const terminateWorker = () => {
      if (workerTerminated) return;
      workerTerminated = true;
      worker.terminate();
    };
    const cleanup = (terminate = true) => {
      clearInterval(cancellationPoll);
      if (loadTimeoutId !== null) globalThis.clearTimeout(loadTimeoutId);
      if (terminate) terminateWorker();
    };
    const finish = (value, terminate = true) => {
      if (settled) return;
      settled = true;
      cleanup(terminate);
      resolve(value);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const failPendingQueries = error => {
      workerError = error;
      pendingQueries.forEach(pending => pending.reject(error));
      pendingQueries.clear();
    };
    const dispose = () => {
      if (workerTerminated) return;
      failPendingQueries(new Error('Observed lineup worker was released with its Chemistry view.'));
      cleanup();
    };
    const cancellationPoll = setInterval(() => {
      if (!shouldContinue()) finish(null);
    }, 50);
    loadTimeoutId = globalThis.setTimeout(() => {
      fail(new Error(OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MESSAGE));
    }, OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MS);
    worker.onmessage = event => {
      const message = event.data;
      if (message?.type === 'progress' && typeof message.message === 'string') {
        onProgress(message.message);
      } else if (message?.type === 'ready' && !ready) {
        if (!object(message.metadata)) {
          fail(new Error('Verified observed lineup metadata could not be loaded.'));
          return;
        }
        ready = true;
        const metadata = message.metadata;
        const players = Object.freeze((Array.isArray(metadata.players) ? metadata.players : [])
          .filter(player => object(player) && publicString(player.playerRef) && publicString(player.displayName))
          .map(player => Object.freeze({ playerRef: player.playerRef, displayName: player.displayName })));
        const playerByRef = new Map(players.map(player => [player.playerRef, player]));
        const indexes = Object.freeze({
          allPlayerRefs: new Set(Array.isArray(metadata.allPlayerRefs) ? metadata.allPlayerRefs : []),
          playerRefsByTeam: new Map((Array.isArray(metadata.playerRefsByTeam) ? metadata.playerRefsByTeam : [])
            .filter(entry => Array.isArray(entry) && entry.length === 2)
            .map(([team, refs]) => [team, new Set(Array.isArray(refs) ? refs : [])])),
        });
        const query = (filters, offset) => {
          if (workerError) return Promise.reject(workerError);
          const requestId = nextRequestId++;
          return new Promise((resolveQuery, rejectQuery) => {
            const queryTimeoutId = globalThis.setTimeout(() => {
              if (!pendingQueries.has(requestId)) return;
              const error = new Error('Observed lineup filtering timed out. Try the filter again.');
              failPendingQueries(error);
              cleanup();
            }, OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MS);
            const pending = {
              resolve: value => { globalThis.clearTimeout(queryTimeoutId); resolveQuery(value); },
              reject: error => { globalThis.clearTimeout(queryTimeoutId); rejectQuery(error); },
            };
            pendingQueries.set(requestId, pending);
            try {
              worker.postMessage({ type: 'query-observed-chemistry', requestId, filters, offset });
            } catch (error) {
              pendingQueries.delete(requestId);
              pending.reject(error);
            }
          });
        };
        finish(Object.freeze({
          package: metadata.package,
          scope: metadata.scope,
          requestedScope: metadata.requestedScope,
          artifactCount: metadata.artifactCount,
          teams: Object.freeze(Array.isArray(metadata.teams) ? metadata.teams : []),
          players,
          playerByRef,
          indexes,
          query,
          dispose,
        }), false);
      } else if (message?.type === 'cancelled') {
        finish(null);
      } else if (message?.type === 'query-result') {
        const pending = pendingQueries.get(message.requestId);
        if (!pending) return;
        pendingQueries.delete(message.requestId);
        pending.resolve({
          rows: Array.isArray(message.rows) ? message.rows : [],
          totalCount: Number.isFinite(message.count) ? message.count : 0,
          pageStart: Number.isFinite(message.offset) ? message.offset : 0,
        });
      } else if (message?.type === 'error') {
        const error = new Error(typeof message.message === 'string' ? message.message : 'Chemistry data could not be loaded.');
        if (!ready) fail(error);
        else {
          failPendingQueries(error);
          cleanup();
        }
      }
    };
    worker.onerror = event => {
      event.preventDefault?.();
      const error = new Error('The observed lineup worker stopped before it could finish filtering.');
      if (!ready) finish(undefined);
      else {
        failPendingQueries(error);
        cleanup();
      }
    };
    worker.onmessageerror = () => {
      if (!ready) finish(undefined);
      else {
        failPendingQueries(new Error('The observed lineup response could not be read.'));
        cleanup();
      }
    };
    try {
      if (nativeProof?.status === 'verified-data-access') {
        worker.postMessage({
          type: 'load-observed-chemistry-v4',
          seasonStartYear: requestedScope.seasonStartYear,
          playerRecords: Array.isArray(playerRecords) ? playerRecords.map(row => ({
            playerRef: row.playerRef,
            displayName: row.displayName,
            positions: row.positions,
          })) : [],
          requestedScope,
        });
      } else {
        worker.postMessage({
          type: 'load-observed-chemistry',
          proof: nativeProof,
          requestedScope,
        });
      }
    } catch {
      finish(undefined);
    }
  });
}

async function loadObservedChemistryDataset(selectedProof, fetchImpl, onProgress = () => {}, shouldContinue = () => true) {
  if (selectedProof?.status === 'verified-data-access') {
    if (selectedProof.capabilityId !== 'franchiseInputs'
      || !selectedProof.supplementalArtifactIds?.includes('player-seasons')
      || CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'reviewed') {
      throw new Error('A reviewed V4 franchise proof with its player-season supplement is required for the V4 Chemistry explorer.');
    }
    const selectedScope = pairProfileScope(selectedProof);
    const requestedScope = {
      kind: 'exact-season',
      seasonStartYear: selectedScope.seasonStartYear,
      seasonEndYear: selectedScope.seasonEndYear,
      phases: ['regular'],
    };
    const playerRecords = chemistryPlayerRecordsFromV4Part(
      selectedProof.parts?.['player-seasons']?.records || [],
    );
    const workerDataset = await loadObservedChemistryDatasetInWorker(
      selectedProof, requestedScope, onProgress, shouldContinue, playerRecords,
    );
    if (workerDataset !== undefined) return workerDataset;
    if (!shouldContinue()) return null;
    onProgress('Loading verified V4 lineup evidence…');
    const chemistryData = await loadCanonicalV4StudioExactSeasonData({
      seasonStartYear: selectedScope.seasonStartYear,
      phases: ['regular'],
      capabilityId: 'chemistry',
      fetchImpl,
    });
    if (!shouldContinue()) return null;
    const lineupData = await loadCanonicalV4StudioExactSeasonData({
      seasonStartYear: selectedScope.seasonStartYear,
      phases: ['regular'],
      capabilityId: 'lineupEvidence',
      fetchImpl,
    });
    if (!shouldContinue()) return null;
    return buildCanonicalV4ObservedChemistryDatasetCooperatively(
      chemistryData, lineupData, playerRecords, requestedScope, { shouldContinue, onProgress },
    );
  }
  const selectedScope = assertVerifiedExactLineupEvidenceProof(selectedProof);
  const nativeProof = selectedProof;
  const requestedScope = {
    kind: 'exact-season',
    seasonStartYear: selectedScope.seasonStartYear,
    seasonEndYear: selectedScope.seasonEndYear,
    phases: ['regular'],
  };
  const workerDataset = await loadObservedChemistryDatasetInWorker(nativeProof, requestedScope, onProgress, shouldContinue);
  if (workerDataset !== undefined) return workerDataset;
  if (!shouldContinue()) return null;

  const controller = typeof globalThis.AbortController === 'function' ? new AbortController() : null;
  const fallbackFetch = controller && typeof fetchImpl === 'function'
    ? (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal })
    : fetchImpl;
  let timeoutId = null;
  let cancellationPollId = null;
  const loadFallback = async () => {
    const playersPart = await loadSwishIqPublicPart(nativeProof, {
      artifactId: 'players', kind: 'players', capability: 'swishiqStudio', fetchImpl: fallbackFetch,
    });
    if (!shouldContinue()) return null;
    const artifacts = chemistryArtifacts(nativeProof);
    if (!artifacts.length) throw new Error('The selected season has no chemistry data.');
    const records = [];
    for (let index = 0; index < artifacts.length; index += 1) {
      const artifact = artifacts[index];
      onProgress('Loading lineup results…');
      const part = await loadSwishIqPublicPart(nativeProof, {
        artifactId: artifact.artifactId,
        kind: 'chemistry',
        capability: 'chemistry',
        fetchImpl: fallbackFetch,
      });
      if (!shouldContinue()) return null;
      records.push(...part.value.records.filter(row => object(row)
        && row.scope?.kind === 'exact-season'
        && Array.isArray(row.scope?.phases)
        && row.scope.phases.length === 1
        && row.scope.phases[0] === 'regular'));
    }
    return buildObservedChemistryDatasetCooperatively(nativeProof, {
      playerRecords: playersPart.value.records,
      chemistryRecords: records,
      requestedScope,
      shouldContinue,
      onProgress,
    });
  };
  const timeout = new Promise((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller?.abort();
      reject(new Error(OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MESSAGE));
    }, OBSERVED_CHEMISTRY_LOAD_TIMEOUT_MS);
  });
  const cancelled = new Promise(resolve => {
    cancellationPollId = globalThis.setInterval(() => {
      if (!shouldContinue()) {
        controller?.abort();
        resolve(null);
      }
    }, 50);
  });
  try {
    return await Promise.race([loadFallback(), timeout, cancelled]);
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    if (cancellationPollId !== null) globalThis.clearInterval(cancellationPollId);
  }
}

async function renderObservedCombinationExplorer(documentRef, root, selectedProof, fetchImpl, state, initialSelection = {}, playerStatsByTeamRef = null, playerRecords = []) {
  const requestToken = ++state.requestToken;
  const isCurrent = () => requestToken === state.requestToken && state.isCurrent();
  root.setAttribute('aria-busy', 'true');
  const loadingTitle = createElement(documentRef, 'h3', 'Observed lineups');
  loadingTitle.id = 'combinationViewTitle';
  const loadingStatus = createElement(documentRef, 'p', 'Loading published observed lineup rows…', 'swishiq-advanced-notice');
  loadingStatus.setAttribute('role', 'status');
  loadingStatus.setAttribute('aria-live', 'polite');
  loadingStatus.setAttribute('aria-atomic', 'true');
  root.replaceChildren(
    loadingTitle,
    loadingStatus,
  );
  try {
    const cacheKey = `${selectedProof.package.packageId}|${selectedProof.package.packageVersion}`;
    let dataset = state.datasetCache.get(cacheKey);
    if (!dataset) {
      dataset = await loadObservedChemistryDataset(selectedProof, fetchImpl, message => {
        if (isCurrent()) loadingStatus.textContent = message;
      }, isCurrent, playerRecords);
      if (!dataset) return;
      state.datasetCache.set(cacheKey, dataset);
    }
    if (!isCurrent()) return;
    renderCombinationExplorerControls(documentRef, root, dataset, initialSelection, isCurrent, state.onChange, playerStatsByTeamRef);
    state.initialObservedSelection = null;
    setWorkspace(documentRef, true, 'Observed lineups ready', {
      state: 'available',
      description: `Explore observed lineup results for ${labelSeason(dataset.scope)}. Differences are descriptive, not causal or predictive.`,
    });
  } catch (error) {
    if (isCurrent()) {
      const unavailableTitle = createElement(documentRef, 'h3', 'Observed lineups unavailable');
      unavailableTitle.id = 'combinationViewTitle';
      root.replaceChildren(
        unavailableTitle,
        createElement(documentRef, 'p', 'Lineup results could not be loaded for this season.', 'swishiq-advanced-notice swishiq-advanced-notice--error'),
      );
      setWorkspace(documentRef, true, 'Observed lineups unavailable', {
        state: 'unavailable',
        description: 'Lineup results are unavailable for this season.',
      });
    }
  } finally {
    if (isCurrent()) root.removeAttribute('aria-busy');
  }
}

function renderChemistryViews(
  documentRef,
  root,
  dataset,
  fetchImpl,
  isCurrent = () => true,
  snapshot = null,
  onChange = () => {},
  selectionLedger = new Map(),
  onSelectionChange = () => {},
) {
  root.replaceChildren();
  const title = createElement(documentRef, 'h2', 'Chemistry Lab');
  title.id = 'chemistryLabTitle';
  root.append(title);

  const chooser = createElement(documentRef, 'fieldset', '', 'swishiq-chemistry-lab__view-chooser');
  chooser.append(createElement(documentRef, 'legend', 'Choose a view'));
  const buildChoice = (value, labelText, description, checked) => {
    const label = createElement(documentRef, 'label', '', 'swishiq-chemistry-lab__view-choice');
    const input = createElement(documentRef, 'input');
    input.type = 'radio';
    input.name = 'chemistryView';
    input.value = value;
    input.checked = checked;
    const copy = createElement(documentRef, 'span');
    copy.append(createElement(documentRef, 'strong', labelText), createElement(documentRef, 'small', description));
    label.append(input, copy);
    chooser.append(label);
    return input;
  };
  const selectedView = snapshot?.view === 'combinations' ? 'combinations' : 'pair';
  const pairChoice = buildChoice('pair', 'Player comparison', 'Compare any two players from the selected season.', selectedView === 'pair');
  const combinationChoice = buildChoice('combinations', 'Observed lineups', 'Descriptive observed combinations; not causal or forecast.', selectedView === 'combinations');
  root.append(chooser);

  const pairPanel = createElement(documentRef, 'section', '', 'swishiq-chemistry-lab__view-panel swishiq-chemistry-lab__view-panel--pair');
  pairPanel.setAttribute('aria-label', 'Player comparison');
  renderPairProfileControls(documentRef, pairPanel, dataset, snapshot?.pair, onChange, selectionLedger, onSelectionChange);

  const combinationPanel = createElement(documentRef, 'section', '', 'swishiq-chemistry-lab__view-panel');
  combinationPanel.hidden = true;
  combinationPanel.setAttribute('aria-labelledby', 'combinationViewTitle');
  const combinationHeading = createElement(documentRef, 'h3', 'Observed lineups');
  combinationHeading.id = 'combinationViewTitle';
  combinationPanel.append(combinationHeading);
  root.append(pairPanel, combinationPanel);

  const playerStatsByTeamRef = new Map((Array.isArray(dataset.rows) ? dataset.rows : [])
    .filter(row => row?.playerRef && row?.teamCode)
    .map(row => [`${row.teamCode}|${row.playerRef}`, row.displayStats]));
  const state = { requestToken: 0, datasetCache: new Map(), isCurrent, onChange, initialObservedSelection: snapshot?.observed || null };
  const updateView = () => {
    const showCombinations = combinationChoice.checked;
    pairPanel.hidden = showCombinations;
    combinationPanel.hidden = !showCombinations;
    if (showCombinations) {
      const loaded = Boolean(combinationPanel.querySelector('.swishiq-chemistry-combination__form'));
      setWorkspace(documentRef, true, loaded ? 'Observed lineups ready' : 'Observed lineups loading', {
        state: loaded ? 'available' : 'loading',
        description: loaded
          ? `Explore observed lineups for ${labelSeason(dataset.scope)}. Differences are descriptive, not causal or predictive.`
          : 'Loading lineup results for this season…',
      });
      if (!loaded) void renderObservedCombinationExplorer(documentRef, combinationPanel, dataset.proof, fetchImpl, state, state.initialObservedSelection || undefined, playerStatsByTeamRef, dataset.rows);
    } else if (!showCombinations) {
      state.requestToken += 1;
      combinationPanel.removeAttribute('aria-busy');
      setWorkspace(documentRef, true, 'Player comparison ready', {
        state: 'available',
        description: 'Season stats and comparisons are ready.',
      });
    }
    onChange();
  };
  pairChoice.addEventListener('change', updateView);
  combinationChoice.addEventListener('change', updateView);
  updateView();
  return Object.freeze({
    dispose() {
      state.requestToken += 1;
      state.datasetCache.forEach(dataset => dataset.dispose?.());
      state.datasetCache.clear();
    },
  });
}

export function startSwishIqChemistryLab({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  sessionStorageRef = null,
} = {}) {
  if (!documentRef) return null;
  const root = documentRef.getElementById('chemistryLabPanel');
  if (!root) return null;
  bindKeyboardScrollableTables(root);
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button')];
  let token = 0;
  const active = () => documentRef.querySelector('.swishiq-tabs button[aria-pressed="true"]')?.dataset.workbench || '';
  let cachedPairDataset = null;
  let sessionStore = sessionStorageRef;
  if (!sessionStore) {
    try { sessionStore = globalThis.sessionStorage; } catch { sessionStore = null; }
  }
  let chemistrySnapshot = null;
  try { chemistrySnapshot = parseChemistrySessionSnapshot(sessionStore?.getItem(CHEMISTRY_SESSION_KEY)); } catch { /* Session storage can be disabled. */ }
  let pairFilterPreferences = { team: '', position: '', query: '' };
  let selectionLedger = new Map();
  try { selectionLedger = parseChemistrySelectionLedger(sessionStore?.getItem(CHEMISTRY_SELECTIONS_KEY)) || new Map(); } catch { /* Session storage can be disabled. */ }
  const saveSelectionScope = (key, ids) => {
    if (ids.length) selectionLedger.set(key, ids.slice());
    else selectionLedger.delete(key);
    persistChemistrySelectionLedger(sessionStore, selectionLedger);
  };
  let chemistryViewsController = null;
  let displayedPackageKey = '';
  const disposeChemistryViews = () => {
    chemistryViewsController?.dispose();
    chemistryViewsController = null;
  };
  const captureChemistrySnapshot = () => {
    if (!displayedPackageKey || !root.querySelector('.swishiq-chemistry-lab__view-chooser')) return;
    const selectedView = [...root.querySelectorAll('input')]
      .find(input => input.name === 'chemistryView' && input.checked)?.value;
    const pairTeam = documentRef.getElementById('chemistryPairTeam');
    const pairPosition = documentRef.getElementById('chemistryPairPosition');
    const pairSearch = documentRef.getElementById('chemistryPairSearch');
    const pairPlayerA = documentRef.getElementById('chemistryPairPlayerA');
    const pairPlayerB = documentRef.getElementById('chemistryPairPlayerB');
    if (!pairTeam || !pairPosition || !pairSearch || !pairPlayerA || !pairPlayerB) return;
    pairFilterPreferences = { team: pairTeam.value, position: pairPosition.value, query: pairSearch.value };

    const priorObserved = chemistrySnapshot?.key === displayedPackageKey
      ? chemistrySnapshot.observed
      : { team: '', groupSize: '', kind: '', playerRef: '', query: '', offset: 0, challenge: null };
    const observedTeam = documentRef.getElementById('chemistryCombinationTeam');
    const observedGroupSize = documentRef.getElementById('chemistryCombinationGroupSize');
    const observedKind = documentRef.getElementById('chemistryCombinationKind');
    const observedPlayer = documentRef.getElementById('chemistryCombinationPlayer');
    const observedSearch = documentRef.getElementById('chemistryCombinationPlayerSearch');
    const observedResults = root.querySelector('.swishiq-chemistry-combination__results');
    const observedChallenge = root.querySelector('.swishiq-chemistry-lab__observed-challenge');
    let observed = priorObserved;
    if (observedTeam && observedGroupSize && observedKind && observedPlayer && observedSearch && observedResults) {
      if (observedSearch.value.length > CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH) {
        chemistrySnapshot = null;
        return;
      }
      const offset = Number(observedResults.dataset.pageOffset);
      observed = {
        team: observedTeam.value,
        groupSize: observedGroupSize.value,
        kind: observedKind.value,
        playerRef: observedPlayer.value,
        query: observedSearch.value,
        offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
        challenge: observedChallenge && Number.isSafeInteger(Number(observedChallenge.dataset.challengeStep))
          ? {
            step: Number(observedChallenge.dataset.challengeStep),
            score: Number(observedChallenge.dataset.challengeScore),
            firstId: observedChallenge.dataset.challengeFirst,
            secondId: observedChallenge.dataset.challengeSecond,
            matchupIndex: Number(observedChallenge.dataset.challengeMatchupIndex),
            metricIds: observedChallenge.dataset.challengeMetricIds?.split(',') || [],
            hasNext: observedChallenge.dataset.challengeHasNext === 'true',
          }
          : null,
      };
    }
    const pair = {
      team: pairTeam.value,
      playerA: pairPlayerA.value,
      playerB: pairPlayerB.value,
      position: pairPosition.value,
      query: pairSearch.value,
    };
    const challenge = root.querySelector('.swishiq-chemistry-lab__challenge');
    const pairChallenge = challenge && Number.isSafeInteger(Number(challenge.dataset.challengeStep))
      ? {
        step: Number(challenge.dataset.challengeStep),
        score: Number(challenge.dataset.challengeScore),
        firstId: challenge.dataset.challengeFirst,
        secondId: challenge.dataset.challengeSecond,
        metricIds: challenge.dataset.challengeMetricIds?.split(',') || [],
        hasNext: challenge.dataset.challengeHasNext === 'true',
      }
      : null;
    if ([pair.team, pair.playerA, pair.playerB, pair.position, pair.query, observed.team, observed.groupSize, observed.kind, observed.playerRef]
      .some(value => typeof value !== 'string' || value.length > CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH)
      || pair.query.length > CHEMISTRY_VIEW_SNAPSHOT_MAX_VALUE_LENGTH) {
      chemistrySnapshot = null;
      return;
    }
    chemistrySnapshot = {
      key: displayedPackageKey,
      view: selectedView === 'combinations' ? 'combinations' : 'pair',
      pair,
      pairChallenge,
      observed: { ...observed },
    };
  };
  const persistChemistrySnapshot = () => {
    captureChemistrySnapshot();
    if (!sessionStore) return;
    const unfinished = [chemistrySnapshot?.pairChallenge, chemistrySnapshot?.observed.challenge]
      .some(challenge => challenge && (challenge.step < challenge.metricIds?.length
        || challenge.hasNext === true
        || (challenge.hasNext === undefined && challenge.step === challenge.metricIds?.length)));
    try {
      if (!unfinished) {
        sessionStore.removeItem(CHEMISTRY_SESSION_KEY);
        return;
      }
      const serialized = JSON.stringify({ version: 1, snapshot: chemistrySnapshot });
      if (parseChemistrySessionSnapshot(serialized)) sessionStore.setItem(CHEMISTRY_SESSION_KEY, serialized);
    } catch { /* A private session can deny storage writes. */ }
  };
  const render = async () => {
    disposeChemistryViews();
    const current = ++token;
    const isCurrentChemistryLoad = () => current === token && active() === 'chemistry';
    displayedPackageKey = '';
    if (active() !== 'chemistry') {
      root.removeAttribute('aria-busy');
      setWorkspace(documentRef, false);
      return;
    }
    const selection = currentSelection(documentRef);
    setWorkspace(documentRef, true, 'Player comparison loading', {
      state: 'loading',
      description: 'Checking the selected season…',
    });
    if (!selection) {
      root.removeAttribute('aria-busy');
      root.replaceChildren(createElement(documentRef, 'h2', 'Player comparison'), createElement(documentRef, 'p', 'Choose a season before comparing players.', 'swishiq-advanced-notice'));
      setWorkspace(documentRef, true, 'Player comparison unavailable', {
        state: 'unavailable',
        description: 'Select a season to compare players.',
      });
      return;
    }
    root.setAttribute('aria-busy', 'true');
    root.replaceChildren(createElement(documentRef, 'p', 'Loading player totals for the selected season…', 'swishiq-advanced-notice'));
    try {
      const useV4 = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'unconfigured';
      let proof;
      if (useV4) {
        const exactMatch = /^nba-swishiq-v4-(\d{4})-(\d{2})$/.exec(selection.packageId);
        const seasonStartYear = exactMatch ? Number(exactMatch[1]) : NaN;
        const pinnedSelection = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.expectedIdentity?.packages?.some(row => (
          row?.packageId === selection.packageId
          && row?.packageVersion === selection.packageVersion
          && row?.scope?.kind === 'exact-season'
          && row.scope.seasonStartYears?.length === 1
          && row.scope.seasonStartYears[0] === seasonStartYear
        ));
        if (!Number.isInteger(seasonStartYear) || !pinnedSelection
          || exactMatch[2] !== String(seasonStartYear + 1).slice(-2)) {
          throw new Error('V4 Pair Profile requires one exact season selected from the season list; pooled packages are unavailable.');
        }
        proof = await loadCanonicalV4StudioExactSeasonData({
          seasonStartYear,
          phases: ['regular'],
          capabilityId: 'franchiseInputs',
          additionalArtifactIds: ['player-seasons'],
          fetchImpl,
        });
        if (proof.package?.packageId !== selection.packageId
          || proof.package?.packageVersion !== selection.packageVersion) {
          throw new Error('V4 Pair Profile refused a package that does not match the selected reviewed season.');
        }
      } else {
        proof = await loadSwishIqPublishedPackageProof({
          ...selection,
          requiredCapabilities: ['swishiqStudio'],
          registryUrl: SWISHIQ_PUBLIC_REGISTRY_PATH,
          fetchImpl,
        });
      }
      pairProfileScope(proof);
      const cacheKey = JSON.stringify(pairProfilePackage(proof));
      if (chemistrySnapshot && chemistrySnapshot.key !== cacheKey) {
        pairFilterPreferences = {
          team: chemistrySnapshot.pair?.team || pairFilterPreferences.team,
          position: chemistrySnapshot.pair?.position || pairFilterPreferences.position,
          query: chemistrySnapshot.pair?.query || pairFilterPreferences.query,
        };
        chemistrySnapshot = null;
        try { sessionStore?.removeItem(CHEMISTRY_SESSION_KEY); } catch { /* Ignore disabled storage. */ }
      }
      let dataset;
      if (cachedPairDataset?.key === cacheKey) {
        dataset = Object.freeze({ ...cachedPairDataset.dataset, proof });
        if (!useV4 && dataset.publicStatsSourceAvailable === false) {
          const publicStatsResult = await loadPublicSeasonStatsForYear(proof.package.scope.seasonStartYear, fetchImpl);
          if (current !== token) return;
          dataset = attachPublicSeasonDisplayStats(dataset, publicStatsResult);
          cachedPairDataset = { key: cacheKey, dataset };
        }
      } else if (useV4) {
        dataset = buildCanonicalV4PairProfileDataset(proof);
        cachedPairDataset = { key: cacheKey, dataset };
      } else {
        const [part, publicStatsResult] = await Promise.all([
          loadSwishIqPublicPart(proof, {
            artifactId: 'player-seasons', kind: 'player-seasons', capability: 'swishiqStudio', fetchImpl,
          }),
          loadPublicSeasonStatsForYear(proof.package.scope.seasonStartYear, fetchImpl),
        ]);
        if (current !== token) return;
        dataset = attachPublicSeasonDisplayStats(buildPairProfileDataset(proof, part), publicStatsResult);
        cachedPairDataset = { key: cacheKey, dataset };
      }
      if (useV4) {
        dataset = Object.assign({}, dataset, { metadata: null });
      } else {
        try {
          dataset = Object.assign({}, dataset, { metadata: await loadSwishIqPlayerMetadata({ fetchImpl }) });
        } catch { dataset = Object.assign({}, dataset, { metadata: null }); }
      }
      if (!isCurrentChemistryLoad()) return;
      chemistryViewsController = renderChemistryViews(
        documentRef,
        root,
        dataset,
        fetchImpl,
        isCurrentChemistryLoad,
        chemistrySnapshot?.key === cacheKey ? chemistrySnapshot : { pair: pairFilterPreferences },
        persistChemistrySnapshot,
        selectionLedger,
        saveSelectionScope,
      );
      displayedPackageKey = cacheKey;
      if (chemistrySnapshot?.key === cacheKey) {
        const startOver = createElement(documentRef, 'button', 'Start over', 'button-secondary');
        startOver.type = 'button';
        startOver.addEventListener('click', () => {
          chemistrySnapshot = null;
          try { sessionStore?.removeItem(CHEMISTRY_SESSION_KEY); } catch { /* Ignore disabled storage. */ }
          void render();
        });
        root.append(startOver);
      }
      setWorkspace(documentRef, true, 'Player comparison ready', {
        state: 'available',
        description: 'Season stats and comparisons are ready.',
      });
    } catch (error) {
      if (isCurrentChemistryLoad()) {
        root.replaceChildren(createElement(documentRef, 'h2', 'Player comparison'), createElement(documentRef, 'p', 'Player stats could not be loaded for this season.', 'swishiq-advanced-notice swishiq-advanced-notice--error'));
        const retry = createElement(documentRef, 'button', 'Retry loading', 'button-secondary');
        retry.type = 'button';
        retry.addEventListener('click', () => { void render(); });
        root.append(retry);
        setWorkspace(documentRef, true, 'Player comparison unavailable', {
          state: 'unavailable',
          description: 'Player stats are unavailable for this season.',
        });
      }
    } finally {
      if (current === token) root.removeAttribute('aria-busy');
    }
  };
  // Tab modules load independently. Defer this read until every click
  // listener has had a chance to update aria-pressed, so registration order
  // cannot leave a newly selected panel hidden.
  const handle = () => queueMicrotask(() => {
    if (active() === 'chemistry') {
      void render();
    }
    else {
      captureChemistrySnapshot();
      disposeChemistryViews();
      displayedPackageKey = '';
      // Invalidate a pending metadata request when the user leaves Pair
      // Profile so its response cannot repaint the hidden panel.
      token += 1;
      root.removeAttribute('aria-busy');
      setWorkspace(documentRef, false);
    }
  });
  tabs.forEach(tab => tab.addEventListener('click', handle));
  documentRef.getElementById('packageSelect')?.addEventListener('change', () => {
    captureChemistrySnapshot();
    displayedPackageKey = '';
    handle();
  });
  root.hidden = true;
  return Object.freeze({ reload: render, activate: render });
}

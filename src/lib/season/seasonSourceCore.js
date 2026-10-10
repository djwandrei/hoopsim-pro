import { DATA_PINS } from '../site/dataPins.js';
import { verifiedBytes, verifiedJson, safeRelativePath } from '../site/verifiedAssets.js';
import { loadForgeEvidence } from '../../components/forge/forgeEvidenceLoader.js';
// Standalone season-source builder: reproduces the published exact-season and
// pooled career reductions in the browser against the site's own published
// data — no server code required when the app is self-hosted on the site.
const DATA_BASE = '/tools/swishiq-studio/data/';
// The site's reviewed canonical V4 release pin. A new site release updates this id.
const V4_RELEASE = 'v4/releases/v4-site-12ad90dc8710';
const REGISTRY_FILE = `${V4_RELEASE}/registry.json?v=20261002b`;
const SCHEDULE_FILE = 'nba-actual-schedules-v1.json?v=20260920c&rev=nba-schedule-source-v2';
const PLAYER_METADATA_FILE = 'player-metadata.json?v=20260920c&rev=20260919b';
const PUBLIC_CONTEXT_FILE = 'public-player-context-v2.json?v=20260920c&rev=20260918f';
const SUPPORTED_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const METRIC_KEYS = [
  'offense', 'defense', 'net', 'pace48', 'pointsPerGame', 'pointsAllowedPerGame',
  'effectiveFieldGoal', 'freeThrowAttemptRate', 'offensiveReboundRate', 'defensiveReboundRate',
  'turnoverRate', 'opponentEffectiveFieldGoal', 'opponentFreeThrowAttemptRate',
  'opponentTurnoverRate',
];
// Row metrics the workbenches consume (forge attributes, blueprint stats).
const BLUEPRINT_METRIC_KEYS = [
  'pointsPerGame', 'assistsPerGame', 'reboundsPerGame', 'minutesPerGame',
  'stealsPer36', 'blocksPer36', 'stealsPerGame', 'blocksPerGame',
  'assistTurnoverRatio', 'threePointPercentage', 'fieldGoalPercentage', 'trueShootingPercentage',
];
const SEASON_ROW_KEYS = ['playerRef', 'displayName', 'teamCode', 'seasonStartYear', 'phase', 'positions', 'playerSeasonRef', 'observed', 'age', 'games', 'starts', 'minutes', 'box', 'metrics'];
const PUBLIC_SEASON_KEYS = ['seasonStartYear', 'seasonEndYear', 'seasonPhase', 'teamCode', 'sourceTeamCode', 'isMultiTeamAggregate', 'totals', 'advanced', 'provenance'];
const PER_GAME_KEYS = ['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks'];

const cache = new Map();
let publicContextPromise = null;
let careerCache = null;

export function clearSeasonSourceCache() {
  cache.clear();
  publicContextPromise = null;
  careerCache = null;
}

async function readJson(path, label, descriptor = DATA_PINS[path.split('?')[0]]) {
  const key = `${path.split('?')[0]}|${descriptor?.sha256 || ''}`;
  if (!cache.has(key)) {
    const promise = verifiedJson(DATA_BASE + path, descriptor, label);
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return cache.get(key);
}
const finite = value => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2020*]+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function metricValue(metric) {
  return metric?.status === 'available' ? finite(metric.value) : null;
}

// Canonical V4 records keep identity in `entities`, the season window in `time`,
// and the observation itself in `values`.
function rowYear(row) { return Number(row.time?.seasonStartYear); }
function rowPhase(row) { return row.time?.phase || 'regular'; }
function rowValues(row) { return row.values || {}; }
function rowRef(row, key) { return row.entities?.[key] ?? row.values?.[key] ?? null; }

async function publishedPackage(kind, year = null) {
  const registry = await readJson(REGISTRY_FILE, 'The SwishIQ registry');
  const entry = (registry.packages || []).find(item =>
    item?.modelId === 'swishiq-canonical-v4'
    && item?.scope?.kind === kind
    && (kind === 'pooled-window' || Number(item.scope.seasonStartYear) === year));
  if (!entry) throw new Error(kind === 'pooled-window'
    ? 'No published pooled-window package.'
    : `No published exact-season package for ${year}.`);
  const indexPath = safeRelativePath(entry.projectionIndexPath);
  const packageRoot = `${V4_RELEASE}/${indexPath.split('/').slice(0, -1).join('/')}`;
  const index = await readJson(`${V4_RELEASE}/${indexPath}`, 'The projection index', { sha256: entry.indexSha256 });
  if (index.packageId !== entry.packageId || index.packageVersion !== entry.packageVersion || index.modelId !== entry.modelId || index.scope?.kind !== kind
      || (kind === 'exact-season' && Number(index.scope.seasonStartYear) !== year)) {
    throw new Error('The projection index does not match the selected package identity and scope.');
  }
  return { registry, entry, index, packageRoot };
}

async function packagePart(index, packageRoot, artifactId) {
  const descriptor = (index.artifacts || []).find(item => item.artifactId === artifactId);
  if (!descriptor?.path) throw new Error(`The package is missing its ${artifactId} artifact.`);
  return {
    descriptor,
    value: await readJson(`${V4_RELEASE}/${safeRelativePath(descriptor.path)}`, `The ${artifactId} artifact`, descriptor),
  };
}

async function playerMetadata() {
  const value = await readJson(PLAYER_METADATA_FILE, 'The player metadata');
  const map = new Map();
  for (const record of value.records || []) {
    if (record?.name) map.set(normalizeName(record.name), record);
  }
  return map;
}

function headshotFor(map, name) {
  return map.get(normalizeName(name))?.headshotPath || null;
}

async function publicContext() {
  if (!publicContextPromise) {
    publicContextPromise = readJson(PUBLIC_CONTEXT_FILE, 'The public player context').catch(error => {
      publicContextPromise = null;
      throw error;
    });
  }
  return publicContextPromise;
}

function publicStatsForYear(context, year, nameSet) {
  return (context.records || [])
    .map(record => ({
      name: record.name,
      normalizedName: record.normalizedName,
      seasons: (record.basketballReference?.seasons || [])
        .filter(season => season.seasonStartYear === year)
        .map(season => Object.fromEntries(PUBLIC_SEASON_KEYS.map(key => [key, season[key]]))),
    }))
    .filter(row => row.seasons.length && nameSet.has(normalizeName(row.name)));
}

// Streams canonical records out of one very large JSON part so it never has to
// be parsed as a single document: the scanner tracks string/brace depth and
// hands each top-level `records` element to `onRecord` as its own small JSON.
async function streamCanonicalRecords(response, onRecord) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let inString = false;
  let escape = false;
  let depth = 0;
  let pendingKey = '';
  let keyBuffer = '';
  let capture = '';
  let capturing = false;
  let sawRecords = false;

  const commit = () => {
    if (!capturing) return;
    capturing = false;
    const text = capture;
    capture = '';
    onRecord(JSON.parse(text));
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];
      if (inString) {
        if (escape) { escape = false; if (capturing) capture += char; else if (depth === 1) keyBuffer += char; continue; }
        if (char === '\\') { escape = true; if (capturing) capture += char; else if (depth === 1) keyBuffer += char; continue; }
        if (char === '"') {
          inString = false;
          if (capturing) capture += char;
          else if (depth === 1) { pendingKey = keyBuffer; keyBuffer = ''; }
          continue;
        }
        if (capturing) capture += char;
        else if (depth === 1) keyBuffer += char;
        continue;
      }
      if (char === '"') {
        inString = true;
        keyBuffer = '';
        if (capturing) capture += char;
        continue;
      }
      if (char === '{' || char === '[') {
        const openDepth = depth;
        depth += 1;
        if (capturing) capture += char;
        else if (openDepth === 2 && char === '{' && sawRecords) { capturing = true; capture = char; }
        else if (openDepth === 1 && char === '[' && pendingKey === 'records') sawRecords = true;
        continue;
      }
      if (char === '}' || char === ']') {
        if (capturing) capture += char;
        depth -= 1;
        if (capturing && depth === 2) commit();
        else if (depth === 1 && sawRecords && char === ']') sawRecords = false;
        continue;
      }
      if (capturing) capture += char;
    }
  }
  if (capturing || inString || depth !== 0) throw new Error('The career archive is truncated.');
}

// The pooled V4 player-seasons artifact is very large (over 100MB); it is
// streamed record-by-record and reduced to the career rows the workbenches
// consume. The browser caches the artifact, so repeat visits are cheap.
async function careerArchive() {
  if (careerCache) return careerCache;
  const { registry, entry, index } = await publishedPackage('pooled-window');
  const descriptor = (index.artifacts || []).find(item => item.artifactId === 'player-seasons');
  if (!descriptor?.path) throw new Error('The pooled package is missing its player-seasons artifact.');
  const bytes = await verifiedBytes(`${DATA_BASE}${V4_RELEASE}/${safeRelativePath(descriptor.path)}`, descriptor, 'The pooled player-seasons artifact');
  const response = new Response(bytes);
  const metadata = await playerMetadata();
  const records = [];
  await streamCanonicalRecords(response, row => {
    const item = rowValues(row);
    if (item.observed !== true || rowPhase(row) !== 'regular') return;
    const metrics = item.metrics || {};
    records.push({
      playerRef: rowRef(row, 'playerRef'),
      displayName: item.displayName,
      seasonStartYear: Number(row.time?.seasonStartYear),
      teamCode: item.teamCode,
      phase: rowPhase(row),
      observed: item.observed === true,
      games: finite(item.games),
      minutes: finite(item.minutes),
      positions: Array.isArray(item.positions) ? item.positions : [],
      age: item.age ?? null,
      experience: null,
      careerMetrics: Object.fromEntries(PER_GAME_KEYS.map(key => [key, metricValue(metrics[`${key}PerGame`])])),
      headshotPath: headshotFor(metadata, item.displayName),
    });
  });
  careerCache = { registry, entry, descriptor, records };
  return careerCache;
}

function entrySummary(entry, index) {
  return {
    packageId: entry.packageId,
    packageVersion: entry.packageVersion,
    packageManifestSha256: entry.packageManifestSha256,
    sourceLockSha256: entry.sourceLockSha256,
    projectionContentSha256: entry.projectionContentSha256 ?? index.contentSha256 ?? null,
    modelId: entry.modelId,
    normalizer: entry.normalizerVersion ?? null,
    metricsVersion: entry.metricsVersion,
    scope: entry.scope,
    status: entry.status,
    capabilities: index.capabilities || index.capabilitySummary || null,
  };
}

// Exact-season source: every published package part plus the public
// companion sources, built in the browser.
export async function loadSeasonSourceCore(year, { profile = 'full' } = {}) {
  year = Number(year);
  if (!SUPPORTED_YEARS.includes(year)) throw new Error('Choose a published exact season.');
  const { registry, entry, index, packageRoot } = await publishedPackage('exact-season', year);

  const [teamStylesPart, membershipsPart, playerSeasonsPart, playersPart, metadata, context, scheduleDoc, forgeEvidence] = await Promise.all([
    packagePart(index, packageRoot, 'team-styles'),
    packagePart(index, packageRoot, 'roster-memberships'),
    packagePart(index, packageRoot, 'player-seasons'),
    packagePart(index, packageRoot, 'player-entities'),
    playerMetadata(),
    profile === 'forge' ? Promise.resolve(null) : publicContext(),
    readJson(SCHEDULE_FILE, 'The NBA schedule artifact'),
    profile === 'forge' ? loadForgeEvidence(year, entry.packageVersion) : Promise.resolve(null),
  ]);

  const styles = (teamStylesPart.value.records || [])
    .filter(row => rowYear(row) === year)
    .map(row => {
      const metrics = rowValues(row).metrics || {};
      return {
        teamCode: rowValues(row).teamCode || row.entities?.teamCode,
        phase: rowPhase(row),
        games: Number.isSafeInteger(metrics.pointsPerGame?.denominator) ? metrics.pointsPerGame.denominator : null,
        metrics: Object.fromEntries(METRIC_KEYS.map(key => [key, metricValue(metrics[key])])),
      };
    });

  const players = (playersPart.value.records || []).map(row => ({
    playerRef: rowRef(row, 'playerRef'),
    displayName: rowValues(row).displayName,
    positions: Array.isArray(rowValues(row).positions) ? rowValues(row).positions : [],
  }));

  const playerSeasons = (playerSeasonsPart.value.records || [])
    .filter(row => rowYear(row) === year && rowPhase(row) === 'regular' && rowValues(row).observed === true)
    .map(row => {
      const item = rowValues(row);
      const box = item.box || {};
      return {
        playerRef: rowRef(row, 'playerRef'),
        name: item.displayName,
        seasonStartYear: rowYear(row),
        phase: rowPhase(row),
        teamCode: item.teamCode,
        positions: Array.isArray(item.positions) ? item.positions : [],
        games: finite(item.games),
        minutes: finite(item.minutes),
        points: finite(box.points),
        rebounds: finite(box.rebounds),
        assists: finite(box.assists),
        turnovers: finite(box.turnovers),
        steals: finite(box.steals),
        blocks: finite(box.blocks),
        headshotPath: headshotFor(metadata, item.displayName),
      };
    });

  const memberships = (membershipsPart.value.records || [])
    .filter(row => rowYear(row) === year && rowPhase(row) === 'regular')
    .map(row => {
      const item = rowValues(row);
      return { playerRef: rowRef(row, 'playerRef'), name: item.displayName, teamCode: item.teamCode, positions: Array.isArray(item.positions) ? item.positions : [] };
    });

  const blueprintRows = (playerSeasonsPart.value.records || [])
    .filter(row => rowYear(row) === year)
    .map(row => {
      const item = rowValues(row);
      return {
        ...Object.fromEntries(SEASON_ROW_KEYS.map(key => [key, key === 'metrics' ? null : key === 'playerRef' ? rowRef(row, 'playerRef') : key === 'seasonStartYear' ? rowYear(row) : key === 'phase' ? rowPhase(row) : key === 'playerSeasonRef' ? row.entities?.playerSeasonRef ?? null : item[key] ?? null])),
        headshotPath: headshotFor(metadata, item.displayName),
        metrics: Object.fromEntries(BLUEPRINT_METRIC_KEYS.map(key => {
          const metric = item.metrics?.[key];
          return [key, { status: metric?.status || 'unavailable', value: metricValue(metric) }];
        })),
      };
    });

  const playerNameSet = new Set(players.map(row => normalizeName(row.displayName)));
  const publicStats = context ? publicStatsForYear(context, year, playerNameSet) : [];

  const scheduleSeason = (scheduleDoc.seasons || []).find(item => Number(item.seasonStartYear) === year);
  const schedule = ((scheduleSeason?.games || []))
    .filter(game => game.phase === 'regular' && game.home && game.away)
    .map(game => ({
      id: game.id || game.gameId || null,
      at: game.scheduledAt || null,
      home: game.home,
      away: game.away,
      actual: game.result ? { home: Number(game.result.homeScore), away: Number(game.result.awayScore) } : null,
    }));

  return {
    registry: {
      format: registry.format,
      registryVersion: registry.registryVersion,
      registryRevisionSha256: registry.registryRevisionSha256,
      generatedAt: registry.generatedAt,
    },
    entry: entrySummary(entry, index),
    teamStyles: styles,
    playerSeasons,
    memberships,
    blueprintRows,
    forgeEvidence,
    players,
    publicStats,
    schedule,
    supportedYears: SUPPORTED_YEARS,
    scheduleStatus: scheduleSeason?.status || 'unknown',
    loadingProfile: profile,
  };
}

export async function loadCareerArchiveCore() {
  const { registry, entry, descriptor, records } = await careerArchive();
  return {
    registry: {
      format: registry.format,
      registryVersion: registry.registryVersion,
      registryRevisionSha256: registry.registryRevisionSha256,
      generatedAt: registry.generatedAt,
    },
    entry: entrySummary(entry, { contentSha256: null, capabilities: null }),
    sourceReceipt: {
      copiedAt: new Date().toISOString().slice(0, 10),
      artifactHashesChecked: true,
      artifactSha256: descriptor.sha256,
      url: `${DATA_BASE}${V4_RELEASE}/${descriptor.path}`,
    },
    records,
  };
}

export async function loadPlayerContextCore(name) {
  if (!String(name || '').trim() || String(name).length > 120) {
    throw new Error('A player name is required for the context lookup.');
  }
  const context = await publicContext();
  const key = normalizeName(name);
  const record = (context.records || []).find(item => normalizeName(item?.name) === key) || null;
  return {
    format: context.format || 'djhc-public-player-context-v2',
    generatedAt: context.generatedAt || null,
    record,
  };
}

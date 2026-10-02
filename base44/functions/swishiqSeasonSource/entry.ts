// Studio source relay: the site's current canonical V4 published data plus pinned native gameplay assets.
import { readStudioNativeAsset } from '../../shared/studioNativeAssets.ts';

const DATA_BASE = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';
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

async function readJson(path, label) {
  const key = path.split('?')[0];
  if (cache.has(key)) return cache.get(key);
  let response;
  try {
    response = await fetch(DATA_BASE + path, { cache: 'no-store' });
  } catch {
    throw new Error(`${label} could not be reached.`);
  }
  if (!response.ok) throw new Error(`${label} is unavailable (${response.status}).`);
  const value = await response.json();
  cache.set(key, value);
  return value;
}

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
  return metric?.status === 'available' && Number.isFinite(Number(metric.value)) ? Number(metric.value) : null;
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
  const packageRoot = `${V4_RELEASE}/${String(entry.projectionIndexPath).split('/').slice(0, -1).join('/')}`;
  const index = await readJson(`${packageRoot}/index.json?v=20261002b`, 'The projection index');
  return { registry, entry, index, packageRoot };
}

async function packagePart(index, packageRoot, artifactId) {
  const descriptor = (index.artifacts || []).find(item => item.artifactId === artifactId);
  if (!descriptor?.path) throw new Error(`The package is missing its ${artifactId} artifact.`);
  return {
    descriptor,
    value: await readJson(`${V4_RELEASE}/${descriptor.path}?v=20261002b`, `The ${artifactId} artifact`),
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

// The pooled V4 player-seasons artifact is very large (over 100MB); it is
// streamed record-by-record and reduced to the career rows the workbenches
// consume, and only that reduction is cached.
let careerCache = null;

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
    try {
      onRecord(JSON.parse(text));
    } catch {
      // A malformed record is skipped rather than failing the archive.
    }
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
        depth += 1;
        if (capturing) capture += char;
        else if (depth === 3 && sawRecords) { capturing = true; capture = char; }
        else if (depth === 1 && char === '[' && pendingKey === 'records') sawRecords = true;
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
  commit();
}

async function careerArchive() {
  if (careerCache) return careerCache;
  const { registry, entry, index } = await publishedPackage('pooled-window');
  const descriptor = (index.artifacts || []).find(item => item.artifactId === 'player-seasons');
  if (!descriptor?.path) throw new Error('The pooled package is missing its player-seasons artifact.');
  let response;
  try {
    response = await fetch(`${DATA_BASE}${V4_RELEASE}/${descriptor.path}?v=20261002b`, { cache: 'no-store' });
  } catch {
    throw new Error('The pooled player-seasons artifact could not be reached.');
  }
  if (!response.ok || !response.body) throw new Error(`The pooled player-seasons artifact is unavailable (${response.status}).`);
  const metadata = await playerMetadata();
  const records = [];
  await streamCanonicalRecords(response, row => {
    const item = rowValues(row);
    if (item.observed !== true || rowPhase(row) !== 'regular') return;
    const metrics = item.metrics || {};
      return {
        playerRef: rowRef(row, 'playerRef'),
        displayName: item.displayName,
        seasonStartYear: Number(row.time?.seasonStartYear),
        teamCode: item.teamCode,
        phase: rowPhase(row),
        observed: item.observed === true,
        games: Number(item.games) || 0,
        minutes: Number(item.minutes) || 0,
        positions: Array.isArray(item.positions) ? item.positions : [],
        age: item.age ?? null,
        experience: null,
        careerMetrics: Object.fromEntries(PER_GAME_KEYS.map(key => [key, metricValue(metrics[`${key}PerGame`])])),
        headshotPath: headshotFor(metadata, item.displayName),
      };
    });
  careerCache = {
    registry,
    entry,
    descriptor,
    records,
  };
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

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    if (typeof body.assetPath === 'string') return Response.json(await readStudioNativeAsset(body.assetPath));

    // Player context slice: one record from the live public player-context source.
    if (typeof body.playerContextName === 'string') {
      if (!body.playerContextName.trim() || body.playerContextName.length > 120) {
        return Response.json({ error: 'A player name is required for the context lookup.' }, { status: 400 });
      }
      const context = await publicContext();
      const key = normalizeName(body.playerContextName);
      const record = (context.records || []).find(item => normalizeName(item?.name) === key) || null;
      return Response.json({
        format: context.format || 'djhc-public-player-context-v2',
        generatedAt: context.generatedAt || null,
        record,
      });
    }

    // Pooled 2017–26 career archive, rebuilt from the live pooled V4 package.
    if (body.career === true) {
      const { registry, entry, descriptor, records } = await careerArchive();
      return Response.json({
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
          url: DATA_BASE + `${descriptor.path}`,
        },
        records,
      });
    }

    // Exact-season source: every published package part plus the public
    // companion sources, rebuilt live on each request.
    const year = Number(body.seasonStartYear);
    if (!SUPPORTED_YEARS.includes(year)) {
      return Response.json({ error: `Season ${body.seasonStartYear || '(missing)'} is not published. Supported: 2017–2025 start years.` }, { status: 400 });
    }
    const { registry, entry, index, packageRoot } = await publishedPackage('exact-season', year);

    const [teamStylesPart, membershipsPart, playerSeasonsPart, playersPart, metadata, context, scheduleDoc] = await Promise.all([
      packagePart(index, packageRoot, 'team-styles'),
      packagePart(index, packageRoot, 'roster-memberships'),
      packagePart(index, packageRoot, 'player-seasons'),
      packagePart(index, packageRoot, 'player-entities'),
      playerMetadata(),
      publicContext(),
      readJson(SCHEDULE_FILE, 'The NBA schedule artifact'),
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
          teamCode: item.teamCode,
          positions: Array.isArray(item.positions) ? item.positions : [],
          games: Number(item.games) || 0,
          minutes: Number(item.minutes) || 0,
          points: Number(box.points) || 0,
          rebounds: Number(box.rebounds) || 0,
          assists: Number(box.assists) || 0,
          turnovers: Number(box.turnovers) || 0,
          steals: Number(box.steals) || 0,
          blocks: Number(box.blocks) || 0,
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
            return [key, { status: metric?.status || 'unavailable', value: Number.isFinite(Number(metric?.value)) ? Number(metric.value) : null }];
          })),
        };
      });

    const playerNameSet = new Set(players.map(row => normalizeName(row.displayName)));
    const publicStats = publicStatsForYear(context, year, playerNameSet);

    const scheduleSeason = (scheduleDoc.seasons || []).find(item => Number(item.seasonStartYear) === year);
    const schedule = ((scheduleSeason?.games || []))
      .filter(game => game.phase === 'regular' && game.home && game.away)
      .map(game => ({
        at: game.scheduledAt || null,
        home: game.home,
        away: game.away,
        actual: game.result ? { home: Number(game.result.homeScore), away: Number(game.result.awayScore) } : null,
      }));

    return Response.json({
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
      players,
      publicStats,
      schedule,
      supportedYears: SUPPORTED_YEARS,
      scheduleStatus: scheduleSeason?.status || 'unknown',
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The Season Lab source could not be loaded.' }, { status: 500 });
  }
}
// Studio source relay: current published package data plus pinned native gameplay assets.
import { readStudioNativeAsset } from '../../shared/studioNativeAssets.ts';

const DATA_BASE = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';
const REGISTRY_FILE = 'registry.json?v=20260929d&rev=registry-v3-fetch-timeout-v1-20260929d';
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
const PER_GAME_KEYS = ['points', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks'];

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

async function publishedPackage(kind, year = null) {
  const registry = await readJson(REGISTRY_FILE, 'The SwishIQ registry');
  const entry = (registry.packages || []).find(item =>
    item?.status === 'published' && item?.modelId === 'swishiq-v3'
    && item?.scope?.kind === kind
    && (kind === 'pooled-window' || Number(item.scope.seasonStartYear) === year));
  if (!entry) throw new Error(kind === 'pooled-window'
    ? 'No published pooled-window package.'
    : `No published exact-season package for ${year}.`);
  const index = await readJson(`${entry.projectionIndexPath}?v=20260929d`, 'The projection index');
  const packageRoot = entry.projectionIndexPath.split('/').slice(0, -1).join('/');
  return { registry, entry, index, packageRoot };
}

async function packagePart(index, packageRoot, artifactId) {
  const descriptor = (index.artifacts || []).find(item => item.artifactId === artifactId);
  if (!descriptor?.path) throw new Error(`The package is missing its ${artifactId} artifact.`);
  return {
    descriptor,
    value: await readJson(`${packageRoot}/${descriptor.path}?v=20260929d`, `The ${artifactId} artifact`),
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

    // Pooled 2017–26 career archive, rebuilt from the live pooled package.
    if (body.career === true) {
      const { registry, entry, index, packageRoot } = await publishedPackage('pooled-window');
      const [{ descriptor, value }, metadata] = await Promise.all([
        packagePart(index, packageRoot, 'career-history'),
        playerMetadata(),
      ]);
      const records = (value.records || []).map(row => ({ ...row, headshotPath: headshotFor(metadata, row.displayName) }));
      return Response.json({
        registry: {
          format: registry.format,
          registryVersion: registry.registryVersion,
          registryRevisionSha256: registry.registryRevisionSha256,
          generatedAt: registry.generatedAt,
        },
        entry: {
          packageId: entry.packageId,
          packageVersion: entry.packageVersion,
          packageManifestSha256: entry.packageManifestSha256,
          sourceLockSha256: entry.sourceLockSha256,
          modelId: entry.modelId,
          normalizer: entry.normalizer,
          metricsVersion: entry.metricsVersion,
          scope: entry.scope,
          status: entry.status,
        },
        sourceReceipt: {
          copiedAt: new Date().toISOString().slice(0, 10),
          artifactHashesChecked: true,
          artifactSha256: descriptor.sha256,
          url: DATA_BASE + `${packageRoot}/${descriptor.path}`,
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
      packagePart(index, packageRoot, 'players'),
      playerMetadata(),
      publicContext(),
      readJson(SCHEDULE_FILE, 'The NBA schedule artifact'),
    ]);

    const styles = (teamStylesPart.value.records || [])
      .filter(row => Number(row.seasonStartYear) === year)
      .map(row => ({
        teamCode: row.teamCode,
        phase: row.phase || 'regular',
        games: Number.isSafeInteger(row.metrics?.pointsPerGame?.denominator) ? row.metrics.pointsPerGame.denominator : null,
        metrics: Object.fromEntries(METRIC_KEYS.map(key => [key, metricValue(row.metrics?.[key])])),
      }));

    const players = (playersPart.value.records || []).map(row => ({
      playerRef: row.playerRef,
      displayName: row.displayName,
      positions: Array.isArray(row.positions) ? row.positions : [],
    }));

    const playerSeasons = (playerSeasonsPart.value.records || [])
      .filter(row => Number(row.seasonStartYear) === year && row.phase === 'regular' && row.observed === true)
      .map(row => ({
        playerRef: row.playerRef,
        name: row.displayName,
        teamCode: row.teamCode,
        positions: Array.isArray(row.positions) ? row.positions : [],
        games: Number(row.games) || 0,
        minutes: Number(row.minutes) || 0,
        points: Number(row.box?.points) || 0,
        rebounds: Number(row.box?.rebounds) || 0,
        assists: Number(row.box?.assists) || 0,
        turnovers: Number(row.box?.turnovers) || 0,
        steals: Number(row.box?.steals) || 0,
        blocks: Number(row.box?.blocks) || 0,
        headshotPath: headshotFor(metadata, row.displayName),
      }));

    const memberships = (membershipsPart.value.records || [])
      .filter(row => Number(row.seasonStartYear) === year && row.phase === 'regular')
      .map(row => ({ playerRef: row.playerRef, name: row.displayName, teamCode: row.teamCode, positions: Array.isArray(row.positions) ? row.positions : [] }));

    const blueprintRows = (playerSeasonsPart.value.records || [])
      .filter(row => Number(row.seasonStartYear) === year)
      .map(row => ({
        ...Object.fromEntries(SEASON_ROW_KEYS.map(key => [key, row[key]])),
        headshotPath: headshotFor(metadata, row.displayName),
        metrics: Object.fromEntries(BLUEPRINT_METRIC_KEYS.map(key => {
          const metric = row.metrics?.[key];
          return [key, { status: metric?.status || 'unavailable', value: Number.isFinite(Number(metric?.value)) ? Number(metric.value) : null }];
        })),
      }));

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
      entry: {
        packageId: entry.packageId,
        packageVersion: entry.packageVersion,
        packageManifestSha256: entry.packageManifestSha256,
        sourceLockSha256: entry.sourceLockSha256,
        projectionContentSha256: entry.projectionContentSha256,
        modelId: entry.modelId,
        normalizer: entry.normalizer,
        metricsVersion: entry.metricsVersion,
        scope: entry.scope,
        status: entry.status,
        capabilities: index.capabilities || null,
      },
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
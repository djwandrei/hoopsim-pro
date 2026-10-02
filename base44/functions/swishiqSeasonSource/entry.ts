import { readStudioNativeAsset } from '../../shared/studioNativeAssets.ts';

const DATA_BASE = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/data/';
const REGISTRY_FILE = 'registry.json?v=20260929d&rev=registry-v3-fetch-timeout-v1-20260929d';
const SCHEDULE_FILE = 'nba-actual-schedules-v1.json?v=20260920c&rev=nba-schedule-source-v2';
const SUPPORTED_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const METRIC_KEYS = [
  'offense', 'defense', 'net', 'pace48', 'pointsPerGame', 'pointsAllowedPerGame',
  'effectiveFieldGoal', 'freeThrowAttemptRate', 'offensiveReboundRate', 'defensiveReboundRate',
  'turnoverRate', 'opponentEffectiveFieldGoal', 'opponentFreeThrowAttemptRate',
  'opponentTurnoverRate',
];

const cache = new Map();

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

function metricValue(metric) {
  return metric?.status === 'available' && Number.isFinite(Number(metric.value)) ? Number(metric.value) : null;
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    if (typeof body.assetPath === 'string') return Response.json(await readStudioNativeAsset(body.assetPath));
    const year = Number(body.seasonStartYear);
    if (!SUPPORTED_YEARS.includes(year)) {
      return Response.json({ error: `Season ${body.seasonStartYear || '(missing)'} is not published. Supported: 2017–2025 start years.` }, { status: 400 });
    }
    const registry = await readJson(REGISTRY_FILE, 'The SwishIQ registry');
    const entry = (registry.packages || []).find(item =>
      item?.status === 'published' && item?.modelId === 'swishiq-v3'
      && item?.scope?.kind === 'exact-season' && Number(item.scope.seasonStartYear) === year);
    if (!entry) return Response.json({ error: `No published exact-season package for ${year}.` }, { status: 404 });

    const index = await readJson(entry.projectionIndexPath + '?v=20260929d', 'The projection index');
    const packageRoot = entry.projectionIndexPath.split('/').slice(0, -1).join('/');
    const part = async artifactId => {
      const descriptor = (index.artifacts || []).find(item => item.artifactId === artifactId);
      if (!descriptor?.path) throw new Error(`The package is missing its ${artifactId} artifact.`);
      return readJson(`${packageRoot}/${descriptor.path}?v=20260929d`, `The ${artifactId} artifact`);
    };

    const [teamStyles, rosterMemberships, playerSeasons, scheduleDoc] = await Promise.all([
      part('team-styles'), part('roster-memberships'), part('player-seasons'),
      readJson(SCHEDULE_FILE, 'The NBA schedule artifact'),
    ]);

    const styles = (teamStyles.records || [])
      .filter(row => Number(row.seasonStartYear) === year)
      .map(row => ({
        teamCode: row.teamCode,
        phase: row.phase || 'regular',
        games: Number.isSafeInteger(row.metrics?.pointsPerGame?.denominator) ? row.metrics.pointsPerGame.denominator : null,
        metrics: Object.fromEntries(METRIC_KEYS.map(key => [key, metricValue(row.metrics?.[key])])),
      }));

    const players = (playerSeasons.records || [])
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
      }));

    const memberships = (rosterMemberships.records || [])
      .filter(row => Number(row.seasonStartYear) === year && row.phase === 'regular')
      .map(row => ({ playerRef: row.playerRef, name: row.displayName, teamCode: row.teamCode, positions: Array.isArray(row.positions) ? row.positions : [] }));

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
      },
      teamStyles: styles,
      playerSeasons: players,
      memberships,
      schedule,
      supportedYears: SUPPORTED_YEARS,
      scheduleStatus: scheduleSeason?.status || 'unknown',
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The Season Lab source could not be loaded.' }, { status: 500 });
  }
}
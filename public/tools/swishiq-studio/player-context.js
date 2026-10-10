import { normalizePlayerName } from './player-metadata.js?v=20260927s&rev=player-metadata-source-v2';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from './engine/canonical-v4-site-consumer-policy.js?v=20261002e&rev=canonical-v4-site-consumer-policy-v2-dependency-cache-closure';

const PUBLIC_CONTEXT_FORMAT = 'djhc-public-player-context-v2';
const MAX_CONTEXT_RECORDS = 20_000;
const PUBLIC_PLAYER_SEASON_STATS_INDEX_FORMAT = 'djhc-public-player-season-stats-index-v1';
const PUBLIC_PLAYER_SEASON_STATS_FORMAT = 'djhc-public-player-season-stats-v1';
const PUBLIC_PLAYER_SEASON_STATS_CACHE_QUERY = 'v=20260927s&rev=public-team-season-stats-v1';
const MAX_PUBLIC_PLAYER_SEASON_STATS_RECORDS = 2_000;
const TEAM_CODE_ALIASES = Object.freeze({ BRK: 'BKN', CHO: 'CHA', PHO: 'PHX' });
const NBA_TEAM_CODES = new Set([
  'ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW',
  'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK',
  'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
const TOTAL_FIELDS = Object.freeze([
  'gamesPlayed',
  'gamesStarted',
  'minutesPlayed',
  'fieldGoalsMade',
  'fieldGoalsAttempted',
  'threePointFieldGoalsMade',
  'threePointFieldGoalsAttempted',
  'freeThrowsMade',
  'freeThrowsAttempted',
  'offensiveRebounds',
  'defensiveRebounds',
  'totalRebounds',
  'assists',
  'steals',
  'blocks',
  'turnovers',
  'points',
]);

export const SWISHIQ_PUBLIC_PLAYER_CONTEXT_URL = new URL(
  './data/public-player-context-v2.json?v=20260920c&rev=20260918f',
  import.meta.url,
).toString();

export const SWISHIQ_PUBLIC_PLAYER_SEASON_STATS_INDEX_URL = new URL(
  `./data/public-player-season-stats-index-v1.json?${PUBLIC_PLAYER_SEASON_STATS_CACHE_QUERY}`,
  import.meta.url,
).toString();

/**
 * Keep the historical supplemental shards explicitly pre-cutover only. Once
 * a V4 source is selected, callers must use a V4-pinned capability instead
 * of retrying these independently hashed V3-era files.
 */
export function assertLegacyPlayerContextSourceAllowed({
  releasePin,
  search = globalThis.location?.search || '',
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({
    releasePin,
    consumerId: 'supplemental-player-context-shards',
  });
  const requested = new URLSearchParams(search).get('source')?.trim().toLowerCase();
  if (policy.v4Required || requested === 'v4') {
    const error = new Error('The unpinned supplemental player-context shards are unavailable after V4 selection. Use the reviewed V4 capability source; no V3 fallback was loaded.');
    error.code = 'v4-player-context-shard-fallback-blocked';
    throw error;
  }
  return policy;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function safeRegularRows(record) {
  const rows = record?.basketballReference?.seasons;
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => (
    isObject(row)
    && row.seasonPhase === 'regular'
    && Number.isInteger(row.seasonStartYear)
    && isObject(row.totals)
  ));
}

function sumTotals(rows) {
  return TOTAL_FIELDS.reduce((totals, field) => {
    // A missing field is unknown, not a verified zero. Keeping that
    // distinction prevents a partial public record from overwriting a native
    // package value with an invented zero during the context merge.
    const values = rows
      .map(row => finite(row?.totals?.[field]))
      .filter(value => value !== null);
    totals[field] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    return totals;
  }, {});
}

/**
 * Basketball Reference records team stints and a multi-team aggregate for a
 * traded player's season. Prefer that aggregate when it exists; otherwise
 * add the published stints once. This keeps a career total from double
 * counting a player's traded season.
 */
export function collapseRegularSeasonHistory(record) {
  const groups = new Map();
  safeRegularRows(record).forEach(row => {
    const rows = groups.get(row.seasonStartYear) || [];
    rows.push(row);
    groups.set(row.seasonStartYear, rows);
  });
  return [...groups.entries()].map(([seasonStartYear, rows]) => {
    const aggregate = rows.find(row => row.isMultiTeamAggregate === true) || null;
    const source = aggregate ? [aggregate] : rows;
    const teamCodes = [...new Set(rows
      .map(row => String(row.teamCode || '').trim().toUpperCase())
      .filter(code => /^[A-Z]{3}$/.test(code) && code !== 'TOT'))];
    return {
      seasonStartYear,
      seasonEndYear: seasonStartYear + 1,
      teamCodes,
      totals: sumTotals(source),
      sourceRows: source.length,
      hasAggregate: Boolean(aggregate),
      source: aggregate?.provenance || rows.flatMap(row => Array.isArray(row.provenance) ? row.provenance : []),
    };
  }).sort((left, right) => left.seasonStartYear - right.seasonStartYear);
}

export function careerRegularSeasonSummary(record) {
  const seasons = collapseRegularSeasonHistory(record);
  if (!seasons.length) return null;
  const totals = sumTotals(seasons.map(season => ({ totals: season.totals })));
  const games = totals.gamesPlayed;
  const perGame = games > 0 ? {
    points: totals.points / games,
    rebounds: totals.totalRebounds / games,
    assists: totals.assists / games,
    steals: totals.steals / games,
    blocks: totals.blocks / games,
    turnovers: totals.turnovers / games,
    minutes: totals.minutesPlayed / games,
  } : null;
  return {
    seasons,
    totals,
    perGame,
    firstSeasonStartYear: seasons[0].seasonStartYear,
    lastSeasonStartYear: seasons[seasons.length - 1].seasonStartYear,
    teamCodes: [...new Set(seasons.flatMap(season => season.teamCodes))],
  };
}

export function selectedRegularSeasonSummary(record, seasonStartYear) {
  const year = Number(seasonStartYear);
  if (!Number.isInteger(year)) return null;
  return collapseRegularSeasonHistory(record).find(season => season.seasonStartYear === year) || null;
}

function normalizedTeamCode(value) {
  const team = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(team) ? TEAM_CODE_ALIASES[team] || team : '';
}

function publicRegularRowsForSeason(record, seasonStartYear) {
  const year = Number(seasonStartYear);
  if (!Number.isInteger(year)) return [];
  return safeRegularRows(record).filter(row => row.seasonStartYear === year);
}

function choosePublicSeasonRows(record, seasonStartYear, teamCode = '') {
  const rows = publicRegularRowsForSeason(record, seasonStartYear);
  if (!rows.length) return [];
  const team = normalizedTeamCode(teamCode);
  if (team) {
    const exact = rows.filter(row => normalizedTeamCode(row.teamCode) === team && row.isMultiTeamAggregate !== true);
    // Team-specific package rows must never inherit a traded player's pooled
    // season total. Only the exact NBA team code or a reviewed franchise-code
    // alias is a defensible source for this row.
    return exact;
  }
  const aggregate = rows.filter(row => row.isMultiTeamAggregate === true || ['TOT', '2TM', '3TM', 'ALL'].includes(normalizedTeamCode(row.teamCode)));
  return aggregate.length ? aggregate : rows;
}

function sumPublicRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return sumTotals(rows.map(row => ({ totals: row.totals })));
}

function publicMetric(value, unit, numerator, denominator, sourceMetric) {
  return {
    status: 'available',
    value,
    unit,
    numerator: Number.isFinite(numerator) ? numerator : null,
    denominator: Number.isFinite(denominator) ? denominator : null,
    evidenceKind: 'observed',
    coverage: 'official-public-season',
    sourceMetric,
  };
}

/**
 * Return current, public season totals for a package row when the reviewed
 * companion record has an exact team-season row. This is a display/model
 * correction layer only: package identity, scope, and capability pins remain
 * owned by the native projection proof.
 */
export function publicStatsForPlayerSeason(record, { seasonStartYear, teamCode } = {}) {
  const rows = choosePublicSeasonRows(record, seasonStartYear, teamCode);
  const totals = sumPublicRows(rows);
  if (!totals || !Number.isFinite(totals.gamesPlayed) || totals.gamesPlayed <= 0) return null;
  const games = totals.gamesPlayed;
  const minutes = Number.isFinite(totals.minutesPlayed) ? totals.minutesPlayed : null;
  const fga = Number.isFinite(totals.fieldGoalsAttempted) ? totals.fieldGoalsAttempted : null;
  const fgm = Number.isFinite(totals.fieldGoalsMade) ? totals.fieldGoalsMade : null;
  const threePa = Number.isFinite(totals.threePointFieldGoalsAttempted) ? totals.threePointFieldGoalsAttempted : null;
  const threePm = Number.isFinite(totals.threePointFieldGoalsMade) ? totals.threePointFieldGoalsMade : null;
  const fta = Number.isFinite(totals.freeThrowsAttempted) ? totals.freeThrowsAttempted : null;
  const ftm = Number.isFinite(totals.freeThrowsMade) ? totals.freeThrowsMade : null;
  const points = Number.isFinite(totals.points) ? totals.points : null;
  const advanced = rows.length === 1 && isObject(rows[0]?.advanced) ? rows[0].advanced : {};
  const shootingDenominator = Number.isFinite(fga) && Number.isFinite(fta) ? (2 * (fga + 0.44 * fta)) : null;
  const trueShooting = Number.isFinite(advanced.true_shooting_percentage)
    ? advanced.true_shooting_percentage
    : Number.isFinite(points) && shootingDenominator > 0 ? points / shootingDenominator : null;
  const metrics = {};
  const perGame = [
    ['pointsPerGame', points, 'points'],
    ['assistsPerGame', totals.assists, 'assists'],
    ['reboundsPerGame', totals.totalRebounds, 'totalRebounds'],
    ['stealsPerGame', totals.steals, 'steals'],
    ['blocksPerGame', totals.blocks, 'blocks'],
    ['turnoversPerGame', totals.turnovers, 'turnovers'],
  ];
  perGame.forEach(([key, numerator, sourceMetric]) => {
    if (Number.isFinite(numerator)) metrics[key] = publicMetric(numerator / games, 'per-game', numerator, games, sourceMetric);
  });
  if (Number.isFinite(minutes)) metrics.minutesPerGame = publicMetric(minutes / games, 'minutes-per-game', minutes, games, 'minutesPlayed');
  if (Number.isFinite(fgm) && Number.isFinite(fga) && fga > 0) metrics.fieldGoalPercentage = publicMetric(fgm / fga, 'fraction', fgm, fga, 'fieldGoalsMade/fieldGoalsAttempted');
  if (Number.isFinite(threePm) && Number.isFinite(threePa) && threePa > 0) metrics.threePointPercentage = publicMetric(threePm / threePa, 'fraction', threePm, threePa, 'threePointFieldGoalsMade/threePointFieldGoalsAttempted');
  if (Number.isFinite(ftm) && Number.isFinite(fta) && fta > 0) metrics.freeThrowPercentage = publicMetric(ftm / fta, 'fraction', ftm, fta, 'freeThrowsMade/freeThrowsAttempted');
  if (Number.isFinite(threePa) && Number.isFinite(fga) && fga > 0) metrics.threePointAttemptShare = publicMetric(threePa / fga, 'fraction', threePa, fga, 'threePointFieldGoalsAttempted/fieldGoalsAttempted');
  if (Number.isFinite(trueShooting)) metrics.trueShootingPercentage = publicMetric(trueShooting, 'fraction', points, shootingDenominator, 'true_shooting_percentage');
  if (Number.isFinite(points) && Number.isFinite(minutes) && minutes > 0) metrics.pointsPer36 = publicMetric(points / minutes * 36, 'per-36-minutes', points, minutes, 'points/minutesPlayed');
  return Object.freeze({
    totals: Object.freeze(totals),
    metrics: Object.freeze(metrics),
    rows: Object.freeze(rows),
    source: Object.freeze({
      provider: rows[0]?.provenance?.[0]?.provider || 'basketball-reference.com',
      kind: 'public-season-totals',
      coverage: 'official-public-season',
    }),
  });
}

/** Merge reviewed public totals into a buyer-safe native row for display/model
 * consumers while retaining every package pin and non-box evidence field. */
export function mergePublicStatsIntoPlayerSeason(row, record) {
  if (!isObject(row) || !isObject(record)) return row;
  const current = publicStatsForPlayerSeason(record, {
    seasonStartYear: row.seasonStartYear,
    teamCode: row.teamCode,
  });
  if (!current) return row;
  const totals = current.totals;
  const box = isObject(row.box) ? { ...row.box } : {};
  const boxMap = {
    points: 'points', assists: 'assists', rebounds: 'totalRebounds', steals: 'steals',
    blocks: 'blocks', turnovers: 'turnovers', fieldGoalsMade: 'fieldGoalsMade',
    fieldGoalAttempts: 'fieldGoalsAttempted', threePointersMade: 'threePointFieldGoalsMade',
    threePointAttempts: 'threePointFieldGoalsAttempted', freeThrowsMade: 'freeThrowsMade',
    freeThrowAttempts: 'freeThrowsAttempted', offensiveRebounds: 'offensiveRebounds',
    defensiveRebounds: 'defensiveRebounds',
  };
  Object.entries(boxMap).forEach(([target, source]) => {
    if (Number.isFinite(totals[source])) box[target] = totals[source];
  });
  if (Number.isFinite(box.fieldGoalAttempts) && Number.isFinite(box.threePointAttempts)) box.twoPointAttempts = box.fieldGoalAttempts - box.threePointAttempts;
  if (Number.isFinite(box.fieldGoalsMade) && Number.isFinite(box.threePointersMade)) box.twoPointMakes = box.fieldGoalsMade - box.threePointersMade;
  return {
    ...row,
    games: totals.gamesPlayed,
    minutes: Number.isFinite(totals.minutesPlayed) ? totals.minutesPlayed : row.minutes,
    box,
    metrics: { ...(row.metrics || {}), ...current.metrics },
    statsSource: current.source,
  };
}

export function profileForPlayerContext(record, seasonStartYear) {
  if (!isObject(record)) return null;
  const profiles = Array.isArray(record?.nba?.profiles) ? record.nba.profiles.filter(isObject) : [];
  const year = Number(seasonStartYear);
  const exactProfile = profiles.find(profile => Number.isFinite(year)
    && isObject(profile?.ageBySeason)
    && Number.isFinite(profile.ageBySeason[String(year)]));
  const profile = exactProfile || profiles[0] || record?.nba?.roster || null;
  if (!profile) return null;
  const age = Number(profile?.ageBySeason?.[String(year)]);
  return { ...profile, age: Number.isFinite(age) ? age : null };
}

export async function loadSwishIqPublicPlayerContext({
  url = SWISHIQ_PUBLIC_PLAYER_CONTEXT_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  assertLegacyPlayerContextSourceAllowed();
  if (typeof fetchImpl !== 'function') throw new Error('Player context is unavailable.');
  const response = await fetchImpl(url, { cache: 'force-cache', credentials: 'omit' });
  if (!response?.ok) throw new Error('Player context is unavailable.');
  const value = JSON.parse(await response.text());
  if (!isObject(value) || value.format !== PUBLIC_CONTEXT_FORMAT || !Array.isArray(value.records) || value.records.length > MAX_CONTEXT_RECORDS) {
    throw new Error('Player context is malformed.');
  }
  const records = new Map();
  const ambiguousNames = new Set();
  value.records.forEach(record => {
    if (!isObject(record) || typeof record.name !== 'string' || !record.name.trim()) return;
    const name = normalizePlayerName(record.name);
    if (!name || ambiguousNames.has(name)) return;
    if (records.has(name)) {
      records.delete(name);
      ambiguousNames.add(name);
      return;
    }
    records.set(name, record);
  });
  return records;
}

function isSafeBasketballReferenceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['basketball-reference.com', 'www.basketball-reference.com'].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

async function sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder !== 'function') {
    throw new Error('Public player-season stats cannot be verified in this browser.');
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readPublicJson(url, fetchImpl, unavailableMessage) {
  const response = await fetchImpl(url, { cache: 'force-cache', credentials: 'omit' });
  if (!response?.ok) throw new Error(unavailableMessage);
  const text = await response.text();
  try { return { text, value: JSON.parse(text) }; }
  catch { throw new Error('Public player-season stats are malformed.'); }
}

function publicSeasonStatsIndexEntry(index, seasonStartYear) {
  if (!isObject(index)
    || index.format !== PUBLIC_PLAYER_SEASON_STATS_INDEX_FORMAT
    || index.schemaVersion !== 1
    || !isObject(index.source)
    || index.source.file !== 'public-player-context-v2.json'
    || index.source.format !== PUBLIC_CONTEXT_FORMAT
    || !/^[a-f0-9]{64}$/i.test(String(index.source.sha256 || ''))
    || !Array.isArray(index.seasons)) {
    throw new Error('Public player-season stats index is malformed.');
  }
  const matches = index.seasons.filter(entry => entry?.seasonStartYear === seasonStartYear);
  if (matches.length > 1) throw new Error('Public player-season stats index repeats a season.');
  if (!matches.length) return null;
  const entry = matches[0];
  if (!isObject(entry)
    || entry.path !== `public-player-season-stats-${seasonStartYear}.json`
    || !Number.isSafeInteger(entry.rows) || entry.rows < 0 || entry.rows > MAX_PUBLIC_PLAYER_SEASON_STATS_RECORDS
    || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
    || !/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ''))) {
    throw new Error('Public player-season stats index entry is malformed.');
  }
  return entry;
}

function canonicalPublicSeasonRecord(record, seasonStartYear) {
  if (!isObject(record) || typeof record.name !== 'string' || !record.name.trim()) return null;
  const normalizedName = normalizePlayerName(record.name);
  if (!normalizedName || record.normalizedName !== normalizedName || !Array.isArray(record.seasons) || !record.seasons.length) return null;
  const seasons = [];
  const seenTeams = new Set();
  for (const row of record.seasons) {
    if (!isObject(row)
      || row.seasonStartYear !== seasonStartYear
      || row.seasonPhase !== 'regular'
      || row.isMultiTeamAggregate !== false) return null;
    const teamCode = normalizedTeamCode(row.teamCode);
    const sourceTeamCode = normalizedTeamCode(row.sourceTeamCode || row.teamCode);
    if (!teamCode || !NBA_TEAM_CODES.has(teamCode) || teamCode !== sourceTeamCode || seenTeams.has(teamCode)) return null;
    seenTeams.add(teamCode);
    if (!isObject(row.totals)
      || !Number.isFinite(row.totals.gamesPlayed) || row.totals.gamesPlayed <= 0
      || !Array.isArray(row.provenance)
      || !row.provenance.some(source => source?.kind === 'season-totals'
        && source.provider === 'basketball-reference.com'
        && isSafeBasketballReferenceUrl(source.url))) return null;
    const provenance = row.provenance.filter(source => source?.provider === 'basketball-reference.com'
      && ['season-totals', 'season-advanced'].includes(source.kind)
      && isSafeBasketballReferenceUrl(source.url));
    const totals = Object.fromEntries(TOTAL_FIELDS.flatMap(field => Number.isFinite(row.totals[field])
      ? [[field, Number(row.totals[field])]] : []));
    if (!Number.isFinite(totals.gamesPlayed) || totals.gamesPlayed <= 0) return null;
    const advanced = isObject(row.advanced) && Number.isFinite(row.advanced.true_shooting_percentage)
      ? { true_shooting_percentage: row.advanced.true_shooting_percentage }
      : {};
    seasons.push({
      seasonStartYear,
      seasonEndYear: seasonStartYear + 1,
      seasonPhase: 'regular',
      teamCode,
      sourceTeamCode: String(row.sourceTeamCode || row.teamCode).trim().toUpperCase(),
      isMultiTeamAggregate: false,
      totals,
      advanced,
      provenance,
    });
  }
  if (!seasons.length) return null;
  seasons.sort((left, right) => left.teamCode.localeCompare(right.teamCode));
  return {
    normalizedName,
    value: {
      name: record.name.trim(),
      basketballReference: { seasons },
    },
  };
}

/**
 * Load only one exact regular-season box-score shard. The result is keyed by
 * normalized public name and contains no multi-team aggregates, so consumers
 * can merge only an exact team-season row without fetching the full player
 * context document.
 */
export async function loadSwishIqPublicPlayerSeasonStats({
  seasonStartYear,
  indexUrl = SWISHIQ_PUBLIC_PLAYER_SEASON_STATS_INDEX_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  assertLegacyPlayerContextSourceAllowed();
  const year = Number(seasonStartYear);
  if (!Number.isSafeInteger(year) || year < 1947 || year > 2200) {
    throw new Error('Public player-season stats need one valid season start year.');
  }
  if (typeof fetchImpl !== 'function') throw new Error('Public player-season stats are unavailable.');
  const { value: index } = await readPublicJson(indexUrl, fetchImpl, 'Public player-season stats are unavailable.');
  const entry = publicSeasonStatsIndexEntry(index, year);
  if (!entry) return new Map();
  const shardUrl = new URL(entry.path, indexUrl);
  shardUrl.search = `?${PUBLIC_PLAYER_SEASON_STATS_CACHE_QUERY}`;
  const { text, value: shard } = await readPublicJson(shardUrl.toString(), fetchImpl, 'Public player-season stats are unavailable.');
  if (await sha256Hex(text) !== String(entry.sha256).toLowerCase()) {
    throw new Error('Public player-season stats shard failed its hash check.');
  }
  if (new TextEncoder().encode(text).byteLength !== entry.bytes) {
    throw new Error('Public player-season stats shard does not match its index.');
  }
  if (!isObject(shard)
    || shard.format !== PUBLIC_PLAYER_SEASON_STATS_FORMAT
    || shard.schemaVersion !== 1
    || shard.seasonStartYear !== year
    || String(shard.source?.sha256 || '').toLowerCase() !== String(index.source.sha256).toLowerCase()
    || !Array.isArray(shard.records)
    || shard.records.length !== entry.rows
    || shard.records.length > MAX_PUBLIC_PLAYER_SEASON_STATS_RECORDS) {
    throw new Error('Public player-season stats shard does not match its index.');
  }
  const records = new Map();
  const ambiguousNames = new Set();
  const nameCounts = new Map();
  shard.records.forEach(record => {
    const normalizedName = normalizePlayerName(record?.name);
    if (normalizedName) nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
  });
  shard.records.forEach(record => {
    const parsed = canonicalPublicSeasonRecord(record, year);
    if (!parsed) return;
    const { normalizedName, value } = parsed;
    if (nameCounts.get(normalizedName) > 1) {
      records.delete(normalizedName);
      ambiguousNames.add(normalizedName);
      return;
    }
    if (ambiguousNames.has(normalizedName)) return;
    if (records.has(normalizedName)) {
      records.delete(normalizedName);
      ambiguousNames.add(normalizedName);
      return;
    }
    records.set(normalizedName, value);
  });
  return records;
}

export function playerContextForPlayer(records, name) {
  return records?.get?.(normalizePlayerName(name)) || null;
}

/**
 * Approved public stats + headshot hydration for daily-game boards. The
 * evaluator boundary accepts only the original validated board object, so
 * stats attach to a presentation clone (exactly like the original pages).
 */
import { originalFetch } from '@/components/native/nativeTransport';
import { SITE_ORIGIN } from '@/lib/deployConfig';
import { normalizePlayerName } from '@/lib/normalizePlayerName';

const SWISHIQ_PLAYER_METADATA_PATH = '/tools/swishiq-studio/data/player-metadata.json';

export async function loadSwishIqPlayerMetadata() {
  const response = await originalFetch(new URL(SWISHIQ_PLAYER_METADATA_PATH, SITE_ORIGIN.replace(/\/$/, '')));
  if (!response?.ok) throw new Error('SwishIQ player metadata is unavailable.');
  const value = await response.json();
  if (!value || value.format !== 'djhc-swishiq-player-metadata-v1' || !Array.isArray(value.records)) {
    throw new Error('SwishIQ player metadata is malformed.');
  }
  const records = new Map();
  value.records.forEach(record => {
    if (!record || typeof record.name !== 'string' || !record.name.trim()) return;
    records.set(normalizePlayerName(record.name), record);
  });
  return records;
}

export function metadataForPlayer(records, name, seasonStartYear) {
  const record = records?.get?.(normalizePlayerName(name));
  if (!record) return null;
  const season = Number(seasonStartYear);
  const profiles = Array.isArray(record.profiles) ? record.profiles : [];
  const profile = profiles.find(item => (
    Number.isFinite(season)
      && Number.isFinite(item?.startYear)
      && Number.isFinite(item?.endYear)
      && season >= item.startYear
      && season <= item.endYear
  )) || null;
  const age = profile?.ageBySeason?.[String(season)];
  return { ...record, profile, age: Number.isFinite(age) ? age : null };
}

const CANDIDATE_STAT_FIELDS = ['points', 'rebounds', 'assists', 'minutes'];
const COMPARISON_STAT_FIELDS = [...CANDIDATE_STAT_FIELDS, 'turnovers', 'steals', 'blocks'];

export const hasPublicStats = (player, fields = CANDIDATE_STAT_FIELDS) => Boolean(player)
  && fields.every(field => typeof player?.publicStats?.[field] === 'number' && Number.isFinite(player.publicStats[field]));

export const statNumber = (player, key) => hasPublicStats(player, [key]) ? player.publicStats[key] : null;
export const statDisplay = value => Number.isFinite(value) ? value.toFixed(1) : '—';

/**
 * Build the presentation clone of a validated board with observed per-game
 * stats from the exact-season source rows (phase-filtered, summed per
 * playerRef) plus headshot/age metadata.
 */
export function hydratePresentationBoard(board, { playerSeasons = [], metadata } = {}) {
  const byRef = new Map();
  const v4 = board.format === 'djhc-swishiq-static-daily-board-v4';
  const year = board.packageRef.scope.seasonStartYear ?? board.packageRef.scope.seasonStartYears?.[0];
  const nameKey = name => String(name ?? '').normalize('NFC').replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'").toLowerCase().trim().replace(/\s+/g, ' ');
  const scopedKey = (name, team, season, phase) => `${nameKey(name)}|${team}|${season}|${phase}`;
  const fields = ['games', ...COMPARISON_STAT_FIELDS];
  for (const row of playerSeasons || []) {
    if (!row.playerRef || !row.games || !row.minutes) continue;
    if (board.packageRef.phase && row.phase && row.phase !== board.packageRef.phase) continue;
    if (v4 && (row.seasonStartYear !== year || row.phase !== board.packageRef.phase)) continue;
    const key = v4 ? scopedKey(row.name, row.teamCode, row.seasonStartYear, row.phase) : row.playerRef;
    const prev = byRef.get(key);
    if (prev) {
      for (const field of fields) prev[field] = Number.isFinite(prev[field]) && Number.isFinite(row[field]) ? prev[field] + row[field] : null;
    } else {
      byRef.set(key, Object.fromEntries(fields.map(field => [field, Number.isFinite(row[field]) ? row[field] : null])));
    }
  }
  const decorate = (player) => {
    const key = v4 ? scopedKey(player.displayName, player.teamCode, player.seasonStartYear, player.phase) : player.playerRef;
    const totals = byRef.get(key);
    const games = totals?.games || 0;
    const publicStats = games > 0 ? Object.fromEntries(COMPARISON_STAT_FIELDS.map(field => [field, Number.isFinite(totals[field]) ? totals[field] / games : null])) : null;
    const meta = metadata ? metadataForPlayer(metadata, player.displayName, player.seasonStartYear) : null;
    return { ...player, publicStats, headshotPath: meta?.headshotPath || null, age: meta?.age ?? null };
  };
  const clone = { ...board };
  if (board.challenges) {
    clone.challenges = board.challenges.map(challenge => ({
      ...challenge,
      lineup: challenge.lineup.map(decorate),
      candidates: challenge.candidates.map(decorate),
    }));
  }
  if (board.deck) {
    clone.deck = {
      ...board.deck,
      rounds: board.deck.rounds.map(round => ({ ...round, candidates: round.candidates.map(decorate) })),
    };
  }
  return clone;
}

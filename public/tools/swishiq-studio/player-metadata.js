const METADATA_FORMAT = 'djhc-swishiq-player-metadata-v1';

export const SWISHIQ_PLAYER_METADATA_URL = new URL(
  './data/player-metadata.json?v=20260920c&rev=20260919b',
  import.meta.url,
).toString();

export function normalizePlayerName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[†*]+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function loadSwishIqPlayerMetadata({
  url = SWISHIQ_PLAYER_METADATA_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('SwishIQ player metadata is unavailable.');
  const response = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  if (!response?.ok) throw new Error('SwishIQ player metadata is unavailable.');
  const value = JSON.parse(await response.text());
  if (!value || value.format !== METADATA_FORMAT || !Array.isArray(value.records)) {
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
  return {
    ...record,
    profile,
    age: Number.isFinite(age) ? age : null,
  };
}

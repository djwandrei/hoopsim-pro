export const CANONICAL_V4_PLAYER_NAME_IDENTITY_FORMAT = 'djhc-swishiq-v4-player-name-identity-v1';
export const CANONICAL_V4_PLAYER_NAME_IDENTITY_VERSION = 'swishiq-v4-player-name-identity-v1';
export const CANONICAL_V4_PLAYER_NAME_KEY_VERSION = 'nfc-case-insensitive-whitespace-apostrophe-typography-v1';
export const CANONICAL_V4_PLAYER_NAME_MATCH_KEY_VERSION = 'player-name-match-key-v1-nfkd-diacritic-fold-punctuation-collapse';

const APOSTROPHE_TYPOGRAPHY = /[\u2018\u2019\u201B\u0060\u00B4]/g;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);

/** Canonical name identity: preserve diacritics, periods, hyphens, suffixes, and punctuation. */
export function normalizeCanonicalV4PlayerNameKey(value) {
  return String(value ?? '').normalize('NFC')
    .replace(APOSTROPHE_TYPOGRAPHY, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Lookup-only exact-season candidate key. Never use as a player ID. */
export function canonicalV4PlayerNameMatchKey(value) {
  return String(value ?? '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(APOSTROPHE_TYPOGRAPHY, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function rowName(row) {
  return firstText(row?.displayName, row?.values?.displayName, row?.entities?.displayName, row?.name);
}

function rowSeason(row) {
  const value = row?.seasonStartYear ?? row?.time?.seasonStartYear ?? row?.values?.seasonStartYear;
  return Number.isSafeInteger(value) ? value : null;
}

function rowTeam(row) {
  const direct = firstText(row?.teamCode, row?.values?.teamCode, row?.entities?.teamCode).toUpperCase();
  if (direct) return direct;
  const teams = Array.isArray(row?.teamCodes) ? row.teamCodes
    : Array.isArray(row?.values?.teamCodes) ? row.values.teamCodes
      : Array.isArray(row?.entities?.teamCodes) ? row.entities.teamCodes : [];
  return teams.length === 1 ? String(teams[0] || '').toUpperCase() : '';
}

function rowHasTeam(row, team) {
  if (!team) return true;
  const direct = rowTeam(row);
  if (direct) return direct === team;
  const teams = Array.isArray(row?.teamCodes) ? row.teamCodes
    : Array.isArray(row?.values?.teamCodes) ? row.values.teamCodes
      : Array.isArray(row?.entities?.teamCodes) ? row.entities.teamCodes : [];
  return teams.some(value => String(value || '').toUpperCase() === team);
}

function rowPhase(row) {
  return firstText(row?.phase, row?.time?.phase, row?.values?.phase);
}

/**
 * Match one exact-season canonical name to rows from another source. Strict
 * normalized names win. The separately versioned lossy key is accepted only
 * when unique in the requested season/team/phase context. Provider IDs are
 * deliberately ignored.
 */
export function resolveCanonicalV4PlayerNameSeasonMatch({
  canonicalDisplayName,
  seasonStartYear,
  teamCode = null,
  phase = null,
  candidates = [],
} = {}) {
  const canonicalName = String(canonicalDisplayName ?? '').trim();
  const canonicalKey = normalizeCanonicalV4PlayerNameKey(canonicalName);
  const year = Number(seasonStartYear);
  const team = typeof teamCode === 'string' && teamCode.trim() ? teamCode.trim().toUpperCase() : null;
  const requestedPhase = typeof phase === 'string' && phase.trim() ? phase.trim() : null;
  if (!canonicalName || !canonicalKey || !Number.isSafeInteger(year) || year < 2017 || year > 2025
    || (team !== null && !/^[A-Z]{2,4}$/.test(team))
    || (requestedPhase !== null && !PHASES.has(requestedPhase))
    || !Array.isArray(candidates)) {
    return Object.freeze({ status: 'invalid-request', canonicalDisplayName: canonicalName, seasonStartYear: year });
  }

  const seasonScoped = candidates.filter(row => rowName(row)
    && rowSeason(row) === year
    && (!requestedPhase || rowPhase(row) === requestedPhase));
  const strictBeforeTeam = seasonScoped.filter(row => normalizeCanonicalV4PlayerNameKey(rowName(row)) === canonicalKey);
  const strictMatches = strictBeforeTeam.filter(row => rowHasTeam(row, team));
  if (strictMatches.length === 1) {
    return Object.freeze({
      status: 'matched',
      candidate: strictMatches[0],
      canonicalDisplayName: canonicalName,
      canonicalNormalizedPlayerNameKey: canonicalKey,
      sourceDisplayName: rowName(strictMatches[0]),
      sourceNormalizedPlayerNameKey: normalizeCanonicalV4PlayerNameKey(rowName(strictMatches[0])),
      seasonStartYear: year,
      teamCode: team || rowTeam(strictMatches[0]) || null,
      phase: requestedPhase || rowPhase(strictMatches[0]) || null,
      matchType: 'exact-normalized-name',
      playerNameMatchKeyVersion: null,
      playerNameMatchKey: null,
      candidateCountBeforeTeamContext: strictBeforeTeam.length,
      candidateCountAfterTeamContext: strictMatches.length,
      teamContextUsed: Boolean(team && strictBeforeTeam.length !== strictMatches.length),
      providerIdsUsed: false,
      personContinuityProven: false,
    });
  }
  if (strictMatches.length > 1) {
    return Object.freeze({
      status: 'ambiguous',
      reason: 'duplicate-exact-name-in-requested-scope',
      canonicalDisplayName: canonicalName,
      canonicalNormalizedPlayerNameKey: canonicalKey,
      seasonStartYear: year,
      candidateCount: strictMatches.length,
      providerIdsUsed: false,
    });
  }

  const lookupKey = canonicalV4PlayerNameMatchKey(canonicalName);
  if (!lookupKey) {
    return Object.freeze({ status: 'unmatched', reason: 'empty-lossy-match-key', canonicalDisplayName: canonicalName, canonicalNormalizedPlayerNameKey: canonicalKey, seasonStartYear: year });
  }
  const broadCandidates = candidates.filter(row => rowName(row)
    && rowSeason(row) === year
    && (!requestedPhase || rowPhase(row) === requestedPhase)
    && canonicalV4PlayerNameMatchKey(rowName(row)) === lookupKey);
  const narrowed = broadCandidates.filter(row => rowHasTeam(row, team));
  if (narrowed.length !== 1) {
    return Object.freeze({
      status: narrowed.length ? 'ambiguous' : 'unmatched',
      reason: narrowed.length ? 'lossy-match-not-unique-in-requested-scope' : 'no-exact-season-lossy-match',
      canonicalDisplayName: canonicalName,
      canonicalNormalizedPlayerNameKey: canonicalKey,
      seasonStartYear: year,
      playerNameMatchKeyVersion: CANONICAL_V4_PLAYER_NAME_MATCH_KEY_VERSION,
      playerNameMatchKey: lookupKey,
      candidateCountBeforeTeamContext: broadCandidates.length,
      candidateCountAfterTeamContext: narrowed.length,
      teamContextUsed: Boolean(team && broadCandidates.length !== narrowed.length),
      providerIdsUsed: false,
      personContinuityProven: false,
    });
  }
  const source = narrowed[0];
  return Object.freeze({
    status: 'matched',
    candidate: source,
    canonicalDisplayName: canonicalName,
    canonicalNormalizedPlayerNameKey: canonicalKey,
    sourceDisplayName: rowName(source),
    sourceNormalizedPlayerNameKey: normalizeCanonicalV4PlayerNameKey(rowName(source)),
    seasonStartYear: year,
    teamCode: team || rowTeam(source) || null,
    phase: requestedPhase || rowPhase(source) || null,
    matchType: 'lookup-only-lossy-name-key',
    playerNameMatchKeyVersion: CANONICAL_V4_PLAYER_NAME_MATCH_KEY_VERSION,
    playerNameMatchKey: lookupKey,
    candidateCountBeforeTeamContext: broadCandidates.length,
    candidateCountAfterTeamContext: narrowed.length,
    teamContextUsed: Boolean(team && broadCandidates.length !== narrowed.length),
    providerIdsUsed: false,
    personContinuityProven: false,
  });
}

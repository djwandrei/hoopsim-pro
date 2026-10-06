/*
 * Package-adjacent career state adapter.
 *
 * Player-season projections do not always repeat age or experience. This
 * adapter joins only the compact public state index, keyed by normalized
 * display name and season, and keeps the provenance of each state separate
 * from production metrics. A missing state stays missing; it is never inferred
 * from the order of a package window.
 */

export const CAREER_STATE_INDEX_FORMAT = 'djhc-career-state-index-v1';
export const CAREER_STATE_SOURCE_VERSION = 'career-state-source-v1';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value);
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizedIndexCache = new WeakMap();
const stateMapCache = new WeakMap();

function sameStateNumber(left, right) {
  return left === null && right === null
    || finite(left) && finite(right) && Math.abs(left - right) <= 0.01;
}

/** Native package rows sometimes encode an unavailable age as zero. Treat
 * that sentinel as missing so an exact player-season source can supply it. */
export function normalizeCareerAgeEvidence(value) {
  if (value === undefined || value === null || value === '') return null;
  const age = Number(value);
  return age === 0 ? null : age;
}

function normalizeCareerExperienceEvidence(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return null;
  return Number(value);
}

export function normalizeCareerStateName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[†*]+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Find normalized display names that identify more than one stable package
 * player reference. State-index rows have no package playerRef, so callers
 * must withhold name-based enrichment for these names.
 */
export function careerStateNameRefConflicts(rows) {
  if (!Array.isArray(rows)) throw new Error('Career state identity rows must be an array.');
  const refsByName = new Map();
  for (const row of rows) {
    const name = text(row?.displayName || row?.player || row?.playerName);
    const playerRef = text(row?.playerRef || row?.playerId);
    const normalizedName = normalizeCareerStateName(name);
    if (!normalizedName || !playerRef) continue;
    const refs = refsByName.get(normalizedName) || new Set();
    refs.add(playerRef);
    refsByName.set(normalizedName, refs);
  }
  return new Map([...refsByName]
    .filter(([, refs]) => refs.size > 1)
    .map(([name, refs]) => [name, Object.freeze([...refs].sort())]));
}

function normalizeState(state, name, seasonStartYear) {
  const season = Number(seasonStartYear);
  if (!integer(season) || season < 1947 || season > 2200) return null;
  const age = normalizeCareerAgeEvidence(state?.age);
  const experience = normalizeCareerExperienceEvidence(state?.experience);
  if (age !== null && (!finite(age) || age < 12 || age > 60)) return null;
  if (experience !== null && (!integer(experience) || experience < 0 || experience > 40)) return null;
  if (age === null && experience === null) return null;
  return Object.freeze({
    player: text(name), seasonStartYear: season,
    age: age === null ? null : Math.round(age * 100) / 100,
    experience,
    ageSource: text(state?.ageSource) || (age === null ? null : 'public-state-index'),
    experienceSource: text(state?.experienceSource) || (experience === null ? null : 'public-state-index'),
    source: text(state?.source) || 'accepted-public-state-index',
  });
}

/** Validate a compact generated state index before using it in a browser run. */
export function normalizeCareerStateIndex(index) {
  if (!index || index.format !== CAREER_STATE_INDEX_FORMAT || !Array.isArray(index.records)) {
    throw new Error('The public career state index is unavailable or malformed.');
  }
  const recordNames = new Set();
  const records = index.records.map(record => {
    const name = text(record?.name);
    const normalizedName = normalizeCareerStateName(name);
    const suppliedNormalizedName = record?.normalizedName === undefined || record?.normalizedName === null
      ? normalizedName : normalizeCareerStateName(record.normalizedName);
    if (name && (!normalizedName || suppliedNormalizedName !== normalizedName)) {
      throw new Error('The public career state index contains a player-name normalization mismatch.');
    }
    if (normalizedName && recordNames.has(normalizedName)) {
      throw new Error('The public career state index contains duplicate player records.');
    }
    if (normalizedName) recordNames.add(normalizedName);
    if (!name || !normalizedName || !Array.isArray(record?.seasons)) return null;
    const seasonYears = new Set();
    const seasons = record.seasons.map(state => {
      const normalized = normalizeState(state, name, state?.seasonStartYear);
      if (!normalized) return null;
      if (seasonYears.has(normalized.seasonStartYear)) {
        throw new Error('The public career state index contains duplicate player-season states.');
      }
      seasonYears.add(normalized.seasonStartYear);
      return normalized;
    }).filter(Boolean);
    return seasons.length ? Object.freeze({ name, normalizedName, seasons: Object.freeze(seasons) }) : null;
  }).filter(Boolean);
  if (!records.length) throw new Error('The public career state index contains no usable player seasons.');
  const normalized = Object.freeze({ ...index, records: Object.freeze(records) });
  normalizedIndexCache.set(index, normalized);
  return normalized;
}

function stateMap(index) {
  if (!index) return new Map();
  const cached = typeof index === 'object' ? normalizedIndexCache.get(index) : null;
  const normalized = cached || normalizeCareerStateIndex(index);
  const cachedMap = stateMapCache.get(normalized);
  if (cachedMap) return cachedMap;
  const map = new Map(normalized.records.map(record => [record.normalizedName, record]));
  stateMapCache.set(normalized, map);
  return map;
}

/** Return the exact public state for one player-season, when available. */
export function careerStateForPlayerSeason(index, { player, seasonStartYear, nameIdentityConflicts = null } = {}) {
  if (!index) return null;
  const normalizedName = normalizeCareerStateName(player);
  if (nameIdentityConflicts?.has(normalizedName)) return null;
  const record = stateMap(index).get(normalizedName);
  if (!record) return null;
  const season = Number(seasonStartYear);
  const state = record.seasons.find(item => item.seasonStartYear === season);
  return state ? { ...state, player: record.name } : null;
}

/**
 * Audit a package's observed player-season rows against the exact state index.
 *
 * The join is intentionally limited to the player name and the selected
 * season. It never carries age or experience forward from a neighboring row:
 * a null field remains null unless that same player-season has a sourced value
 * in the state index. Duplicate team rows are counted once for coverage while
 * their presence is reported separately.
 */
export function auditCareerStateCoverage(rows, index, {
  asOfSeasonStartYear,
  phase = 'regular',
  observedOnly = true,
  maxIssues = 100,
} = {}) {
  if (!Array.isArray(rows)) throw new Error('Career state coverage rows must be an array.');
  const cutoff = Number(asOfSeasonStartYear);
  if (!Number.isSafeInteger(cutoff) || cutoff < 1947 || cutoff > 2200) {
    throw new Error('Career state coverage needs a whole-number cutoff from 1947 to 2200.');
  }
  const issueLimit = Number(maxIssues);
  if (!Number.isSafeInteger(issueLimit) || issueLimit < 1 || issueLimit > 1000) {
    throw new Error('Career state coverage issue limit must be a whole number from 1 to 1000.');
  }
  const normalizedIndex = normalizeCareerStateIndex(index);
  const nameIdentityConflicts = careerStateNameRefConflicts(rows);
  const seen = new Set();
  const unmatched = [];
  const ambiguous = [];
  const conflicts = [];
  const malformed = [];
  let consideredRows = 0;
  let duplicateRows = 0;
  let matchedPlayerSeasons = 0;
  let sourcedAge = 0;
  let sourcedExperience = 0;
  let missingAge = 0;
  let missingExperience = 0;

  const addIssue = (list, value) => {
    if (list.length < issueLimit) list.push(Object.freeze(value));
  };
  for (const row of rows) {
    if (observedOnly && row?.observed !== true) continue;
    if (phase !== null && row?.phase !== phase) continue;
    const season = Number(row?.seasonStartYear);
    if (!Number.isSafeInteger(season) || season < 1947) {
      if (row?.seasonStartYear !== undefined && row?.seasonStartYear !== null) {
        addIssue(malformed, { player: text(row?.displayName || row?.player || row?.playerName), seasonStartYear: row?.seasonStartYear ?? null });
      }
      continue;
    }
    if (season > cutoff) continue;
    const player = text(row?.displayName || row?.player || row?.playerName);
    if (!player) {
      addIssue(malformed, { player: null, seasonStartYear: season });
      continue;
    }
    consideredRows += 1;
    const normalizedName = normalizeCareerStateName(player);
    const playerRef = text(row?.playerRef || row?.playerId);
    const key = `${playerRef || normalizedName}|${season}`;
    const duplicate = seen.has(key);
    if (duplicate) duplicateRows += 1;
    else seen.add(key);
    const ambiguousRefs = nameIdentityConflicts.get(normalizedName);
    const state = careerStateForPlayerSeason(normalizedIndex, {
      player, seasonStartYear: season, nameIdentityConflicts,
    });
    const rowAge = normalizeCareerAgeEvidence(row?.age);
    const rowExperience = normalizeCareerExperienceEvidence(row?.experience);
    if (rowAge !== null && (!finite(rowAge) || rowAge < 12 || rowAge > 60)) {
      addIssue(malformed, { player, seasonStartYear: season, field: 'age', value: row?.age });
    }
    if (rowExperience !== null && (!integer(rowExperience) || rowExperience < 0 || rowExperience > 40)) {
      addIssue(malformed, { player, seasonStartYear: season, field: 'experience', value: row?.experience });
    }
    const age = rowAge === null ? state?.age ?? null : rowAge;
    const experience = rowExperience === null ? state?.experience ?? null : rowExperience;
    if (state) {
      if (rowAge !== null && state.age !== null && Math.abs(rowAge - state.age) > 0.01) {
        addIssue(conflicts, { field: 'age', player, seasonStartYear: season, rowValue: rowAge, indexValue: state.age });
      }
      if (rowExperience !== null && state.experience !== null && rowExperience !== state.experience) {
        addIssue(conflicts, { field: 'experience', player, seasonStartYear: season, rowValue: rowExperience, indexValue: state.experience });
      }
      if (!duplicate && rowAge === null && state.age !== null) sourcedAge += 1;
      if (!duplicate && rowExperience === null && state.experience !== null) sourcedExperience += 1;
    } else if (!ambiguousRefs) {
      if (!duplicate) addIssue(unmatched, { player, seasonStartYear: season });
    } else if (!duplicate) {
      addIssue(ambiguous, { player, playerRef, seasonStartYear: season, playerRefs: ambiguousRefs });
    }
    if (duplicate) continue;
    if (state) matchedPlayerSeasons += 1;
    if (age === null) missingAge += 1;
    if (experience === null) missingExperience += 1;
  }
  const uniquePlayerSeasons = seen.size;
  const status = malformed.length || unmatched.length || ambiguous.length || conflicts.length ? 'needs-review' : 'complete';
  return Object.freeze({
    status,
    asOfSeasonStartYear: cutoff,
    phase,
    consideredRows,
    uniquePlayerSeasons,
    duplicateRows,
    matchedPlayerSeasons,
    sourcedAge,
    sourcedExperience,
    missingAge,
    missingExperience,
    unmatched: Object.freeze(unmatched),
    ambiguous: Object.freeze(ambiguous),
    conflicts: Object.freeze(conflicts),
    malformed: Object.freeze(malformed),
    note: 'Age and experience are joined only from the exact player-season state; ambiguous name-to-playerRef joins and unavailable fields remain explicit.',
  });
}

/** Add sourced state to observed rows without changing their metric values. */
export function augmentCareerProfiles(profiles, index, { player, nameIdentityConflicts = null } = {}) {
  if (!Array.isArray(profiles)) throw new Error('Career profiles must be an array.');
  if (!index) return profiles.map(profile => {
    const age = normalizeCareerAgeEvidence(profile?.age);
    const experience = normalizeCareerExperienceEvidence(profile?.experience);
    return {
      ...profile,
      age,
      experience,
      ageSource: age === null ? null : profile.ageSource || 'package-observed',
      experienceSource: experience === null ? null : profile.experienceSource || 'package-observed',
    };
  });
  return profiles.map(profile => {
    const playerName = player || profile.player || profile.playerName || profile.displayName;
    const normalizedName = normalizeCareerStateName(playerName);
    const identityRefs = nameIdentityConflicts?.get(normalizedName) || profile.stateIdentityConflict || null;
    const identityAmbiguous = profile.stateJoin === 'ambiguous-player-name' || Boolean(identityRefs);
    const state = identityAmbiguous ? null : careerStateForPlayerSeason(index, {
      player: playerName,
      seasonStartYear: profile.seasonStartYear,
      nameIdentityConflicts,
    });
    if (!state) {
      const age = normalizeCareerAgeEvidence(profile.age);
      const experience = normalizeCareerExperienceEvidence(profile.experience);
      const hasAge = finite(age) && age >= 12 && age <= 60;
      const hasExperience = integer(experience) && experience >= 0 && experience <= 40;
      return { ...profile, age, experience,
        ageSource: age === null ? null : profile.ageSource || 'package-observed',
        experienceSource: experience === null ? null : profile.experienceSource || 'package-observed',
        stateJoin: identityAmbiguous ? 'ambiguous-player-name' : 'unmatched-player-season',
        stateQuality: hasAge && hasExperience ? 'complete' : hasAge || hasExperience ? 'partial' : 'missing',
        stateIdentityConflict: identityRefs,
        stateConflict: null };
    }
    const rowAge = normalizeCareerAgeEvidence(profile.age);
    const rowExperience = normalizeCareerExperienceEvidence(profile.experience);
    const conflicts = [];
    if (rowAge !== null && state.age !== null && !sameStateNumber(rowAge, state.age)) {
      conflicts.push({ field: 'age', rowValue: rowAge, indexValue: state.age, indexSource: state.ageSource });
    }
    if (rowExperience !== null && state.experience !== null && rowExperience !== state.experience) {
      conflicts.push({ field: 'experience', rowValue: rowExperience, indexValue: state.experience, indexSource: state.experienceSource });
    }
    const hasSourcedField = (rowAge === null && state.age !== null)
      || (rowExperience === null && state.experience !== null);
    const resolvedAge = rowAge === null ? state.age : rowAge;
    const resolvedExperience = rowExperience === null ? state.experience : rowExperience;
    const stateQuality = conflicts.length ? 'conflict'
      : resolvedAge !== null && resolvedExperience !== null ? (hasSourcedField ? 'sourced-complete' : 'complete')
        : resolvedAge !== null || resolvedExperience !== null ? 'partial' : 'missing';
    return {
      ...profile,
      age: resolvedAge,
      experience: resolvedExperience,
      ageSource: rowAge !== null ? (profile.ageSource || 'package-observed') : state.ageSource,
      experienceSource: rowExperience !== null ? (profile.experienceSource || 'package-observed') : state.experienceSource,
      stateSource: state.source,
      stateJoin: conflicts.length ? 'conflict' : hasSourcedField ? 'exact-augmented' : 'exact-verified',
      stateQuality,
      stateConflict: conflicts.length ? Object.freeze(conflicts) : null,
    };
  });
}

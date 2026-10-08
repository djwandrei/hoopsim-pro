const CAREER_STATE_AGE_SOURCE = 'basketball-reference-season-age';
const MIN_SEASON_START_YEAR = 1900;
const MAX_SEASON_START_YEAR = 2099;
const MIN_AGE = 0;
const MAX_AGE = 120;

export const SEASON_AGE_INDEX_FORMAT = 'djhc-season-age-anchor-index-v1';
export const SEASON_AGE_INDEX_SOURCE_PART_SHA256 = '017b69dbfaada9de731c5d4051ec158361ec0e163217f67007260ce5fed895ce';
export const SEASON_AGE_INDEX_WORKBOOK_SHA256 = '67f3c728b7a5279256cf9ecdedc024f9a588bb5b5f22e6df0fec890d772a56e4';
const SEASON_AGE_INDEX_PACKAGE_ID = 'nba-swishiq-v4-2017-26';
const SEASON_AGE_INDEX_PACKAGE_VERSION = 'v4-canonical-20260929-aa835b795d8c';
const SEASON_AGE_INDEX_NORMALIZATION = 'nfc-case-insensitive-whitespace-apostrophe-typography-v1';
const seasonAgeIndexLookupCache = new WeakMap();

/**
 * Resolve a player's age for one NBA season without mutating input state.
 *
 * Season convention: `seasonStartYear: 2024` means the 2024-25 season. The
 * package's Basketball-Reference season age is age on January 31 of that
 * season's second calendar year, so its reference date is January 31 of
 * `seasonStartYear + 1`.
 *
 * A complete `careerStateRow` anchor must contain `values.age`,
 * `values.ageSource`, and `time.seasonStartYear`; the source must be
 * `basketball-reference-season-age`, the evidence status must be available,
 * and the row must carry a unique exact-season name-resolution receipt. The
 * caller must pass the row matched to this player; this helper does not do
 * player identity joins.
 * The target season must be the anchor season or a later season. The helper
 * adds the difference in season-start years to the anchor exactly once. Each
 * game in the same season should request the same target season and receive
 * the same age; callers must not increment a mutable age field per game.
 *
 * A valid `birthDate` (YYYY-MM-DD) can derive the season age when no
 * `careerStateRow` was supplied. When both are supplied, the DOB must agree
 * with the anchor's source-season age. A supplied but incomplete/invalid row
 * returns unavailable rather than silently falling back to another value.
 *
 * @param {{targetSeasonStartYear: number, careerStateRow?: {values?: {age?: number, ageSource?: string, identityStatus?: string, matchKeyType?: string, matchKeyEvidence?: object}, time?: {seasonStartYear?: number}, evidence?: {status?: string}}|null, birthDate?: string|null}} input
 * @returns {{status: 'available', age: number, targetSeasonStartYear: number, referenceDate: string, source: string, anchorSeasonStartYear: number|null, seasonsAdvanced: number|null}|{status: 'unavailable', age: null, targetSeasonStartYear: number|null, referenceDate: string|null, reason: string}}
 */
export function resolveSeasonAge(input = {}) {
  const options = input && typeof input === 'object' ? input : {};
  const targetSeasonStartYear = options.targetSeasonStartYear;
  const validTargetYear = isSeasonStartYear(targetSeasonStartYear);
  const referenceDate = validTargetYear
    ? `${String(targetSeasonStartYear + 1).padStart(4, '0')}-01-31`
    : null;
  if (!validTargetYear) return unavailable('invalid-target-season-start-year');

  const birthDateSupplied = options.birthDate !== undefined && options.birthDate !== null;
  const birthDateParts = birthDateSupplied ? parseDateOnly(options.birthDate) : null;
  if (birthDateSupplied && !birthDateParts) {
    return unavailable('invalid-birth-date', targetSeasonStartYear, referenceDate);
  }

  const careerStateRowSupplied = options.careerStateRow !== undefined && options.careerStateRow !== null;
  if (!careerStateRowSupplied) {
    if (!birthDateParts) {
      return unavailable('missing-age-anchor-and-birth-date', targetSeasonStartYear, referenceDate);
    }
    const age = ageOnReferenceDate(birthDateParts, referenceDate);
    if (!isAge(age)) return unavailable('derived-age-out-of-range', targetSeasonStartYear, referenceDate);
    return {
      status: 'available', age, targetSeasonStartYear, referenceDate,
      source: 'birthDate-derived', anchorSeasonStartYear: null, seasonsAdvanced: null,
    };
  }

  const anchor = {
    age: options.careerStateRow?.values?.age,
    ageSource: options.careerStateRow?.values?.ageSource,
    seasonStartYear: options.careerStateRow?.time?.seasonStartYear,
  };
  if (!anchor || typeof anchor !== 'object'
      || !isAge(anchor.age)
      || !isSeasonStartYear(anchor.seasonStartYear)
      || anchor.ageSource !== CAREER_STATE_AGE_SOURCE
      || !hasUniqueExactSeasonIdentityEvidence(options.careerStateRow)) {
    return unavailable('invalid-career-state-age-anchor', targetSeasonStartYear, referenceDate);
  }
  if (targetSeasonStartYear < anchor.seasonStartYear) {
    return unavailable('target-season-before-age-anchor', targetSeasonStartYear, referenceDate);
  }
  if (birthDateParts && ageOnReferenceDate(
    birthDateParts,
    `${String(anchor.seasonStartYear + 1).padStart(4, '0')}-01-31`,
  ) !== anchor.age) {
    return unavailable('birth-date-conflicts-with-age-anchor', targetSeasonStartYear, referenceDate);
  }

  const seasonsAdvanced = targetSeasonStartYear - anchor.seasonStartYear;
  const age = anchor.age + seasonsAdvanced;
  if (!isAge(age)) return unavailable('derived-age-out-of-range', targetSeasonStartYear, referenceDate);
  return {
    status: 'available', age, targetSeasonStartYear, referenceDate,
    source: 'career-state-age-anchor',
    anchorSeasonStartYear: anchor.seasonStartYear,
    seasonsAdvanced,
  };
}

/**
 * Normalize a player name using the exact-name rules used by the package
 * Career_State table. This deliberately preserves punctuation and diacritics;
 * it performs no accent folding, punctuation removal, token reordering, or
 * fuzzy matching.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeSeasonAgeNameKey(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFC')
    .replace(/[\u2018\u2019\u02bc\u02bb]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
  return normalized || null;
}

/**
 * Resolve age by an exact normalized name/key using the compact package
 * index. Index anchors are source-backed Career_State values; an unlisted
 * named player may use DOB as an explicit synthetic-player fallback.
 *
 * @param {{index?: object|null, playerName?: string|null, playerNameKey?: string|null, targetSeasonStartYear: number, birthDate?: string|null}} input
 * @returns {{status:'available',age:number,targetSeasonStartYear:number,referenceDate:string,source:string,anchorSeasonStartYear:number|null,seasonsAdvanced:number|null,playerNameKey:string,anchorProvenance?:object}|{status:'unavailable',age:null,targetSeasonStartYear:number|null,referenceDate:string|null,reason:string,playerNameKey?:string|null}}
 */
export function resolveSeasonAgeByName(input = {}) {
  const options = input && typeof input === 'object' ? input : {};
  const targetSeasonStartYear = options.targetSeasonStartYear;
  if (!isSeasonStartYear(targetSeasonStartYear)) return unavailable('invalid-target-season-start-year');
  const referenceDate = `${String(targetSeasonStartYear + 1).padStart(4, '0')}-01-31`;
  const fromName = normalizeSeasonAgeNameKey(options.playerName);
  const fromKey = normalizeSeasonAgeNameKey(options.playerNameKey);
  if (!fromName && !fromKey) {
    return unavailable('missing-player-name', targetSeasonStartYear, referenceDate);
  }
  if (fromName && fromKey && fromName !== fromKey) {
    return { ...unavailable('conflicting-player-name-and-key', targetSeasonStartYear, referenceDate), playerNameKey: null };
  }
  const playerNameKey = fromKey || fromName;
  if (!hasPinnedSeasonAgeIndex(options.index)) {
    return { ...unavailable('invalid-or-unpinned-season-age-index', targetSeasonStartYear, referenceDate), playerNameKey };
  }

  const birthDateSupplied = options.birthDate !== undefined && options.birthDate !== null;
  const birthDateParts = birthDateSupplied ? parseDateOnly(options.birthDate) : null;
  if (birthDateSupplied && !birthDateParts) {
    return { ...unavailable('invalid-birth-date', targetSeasonStartYear, referenceDate), playerNameKey };
  }

  const indexLookup = getSeasonAgeIndexLookup(options.index);
  const anchors = indexLookup.anchorsByNameKey.get(playerNameKey) ?? [];
  const ambiguities = (indexLookup.ambiguitiesByNameKey.get(playerNameKey) ?? [])
    .filter((entry) => isSeasonStartYear(entry.seasonStartYear)
      && entry.seasonStartYear <= targetSeasonStartYear);
  const anchorsAtOrBeforeTarget = anchors.filter((anchor) => anchor.seasonStartYear <= targetSeasonStartYear);

  const anchorsBySeason = new Map();
  for (const anchor of anchorsAtOrBeforeTarget) {
    if (!isValidIndexAnchor(anchor)) {
      return { ...unavailable('invalid-season-age-index-anchor', targetSeasonStartYear, referenceDate), playerNameKey };
    }
    const rows = anchorsBySeason.get(anchor.seasonStartYear) ?? [];
    rows.push(anchor);
    anchorsBySeason.set(anchor.seasonStartYear, rows);
  }
  const duplicateAnchorSeason = [...anchorsBySeason.entries()].find(([, rows]) => rows.length > 1)?.[0];
  if (duplicateAnchorSeason !== undefined) {
    return { ...unavailable('duplicate-season-age-index-anchor', targetSeasonStartYear, referenceDate), playerNameKey };
  }

  const latestAnchor = [...anchorsBySeason.keys()].sort((a, b) => b - a)[0];
  const latestAmbiguity = ambiguities.reduce((latest, entry) => Math.max(latest, entry.seasonStartYear), -Infinity);
  if (Number.isFinite(latestAmbiguity) && latestAmbiguity >= (latestAnchor ?? -Infinity)) {
    return { ...unavailable('ambiguous-player-name-key-at-or-after-latest-anchor', targetSeasonStartYear, referenceDate), playerNameKey };
  }

  if (latestAnchor === undefined) {
    const nameHasAnyAnchor = anchors.length > 0 || (indexLookup.ambiguitiesByNameKey.get(playerNameKey)?.length ?? 0) > 0;
    if (nameHasAnyAnchor) {
      return { ...unavailable('target-season-before-age-anchor', targetSeasonStartYear, referenceDate), playerNameKey };
    }
    if (!birthDateParts) {
      return { ...unavailable('unlisted-player-needs-birth-date', targetSeasonStartYear, referenceDate), playerNameKey };
    }
    const age = ageOnReferenceDate(birthDateParts, referenceDate);
    if (!isAge(age)) {
      return { ...unavailable('derived-age-out-of-range', targetSeasonStartYear, referenceDate), playerNameKey };
    }
    return {
      status: 'available', age, targetSeasonStartYear, referenceDate,
      source: 'birthDate-derived-unlisted-player', anchorSeasonStartYear: null,
      seasonsAdvanced: null, playerNameKey,
    };
  }

  const anchor = anchorsBySeason.get(latestAnchor)[0];
  if (birthDateParts && ageOnReferenceDate(
    birthDateParts,
    `${String(anchor.seasonStartYear + 1).padStart(4, '0')}-01-31`,
  ) !== anchor.age) {
    return { ...unavailable('birth-date-conflicts-with-age-anchor', targetSeasonStartYear, referenceDate), playerNameKey };
  }
  const seasonsAdvanced = targetSeasonStartYear - anchor.seasonStartYear;
  const age = anchor.age + seasonsAdvanced;
  if (!isAge(age)) {
    return { ...unavailable('derived-age-out-of-range', targetSeasonStartYear, referenceDate), playerNameKey };
  }
  return {
    status: 'available', age, targetSeasonStartYear, referenceDate,
    source: 'package-career-state-age-index',
    anchorSeasonStartYear: anchor.seasonStartYear,
    seasonsAdvanced,
    playerNameKey,
    anchorProvenance: {
      recordId: anchor.recordId,
      workbookRecordRef: anchor.workbookRecordRef,
      packagePartSha256: options.index.provenance.sourcePartSha256,
      workbookSha256: options.index.provenance.sourceWorkbookSha256,
      sourceSystem: options.index.provenance.sourceSystem,
      sourceVersion: options.index.provenance.sourceVersion,
      sourceTable: options.index.provenance.sourceTable,
      matchKeyType: anchor.matchKeyType,
      matchKeyVersion: anchor.matchKeyVersion,
    },
  };
}

/** Create the exact-name age resolver accepted by advanceLeagueSeason(). */
export function createPackageSeasonAgeResolver(index) {
  return (player, targetSeasonStartYear) => resolveSeasonAgeByName({
    index,
    playerName: player?.canonicalName ?? player?.name ?? null,
    birthDate: player?.birthDate ?? null,
    targetSeasonStartYear,
  });
}

function hasPinnedSeasonAgeIndex(index) {
  return index?.format === SEASON_AGE_INDEX_FORMAT
    && index?.version === 1
    && index?.provenance?.sourcePartSha256 === SEASON_AGE_INDEX_SOURCE_PART_SHA256
    && index?.provenance?.sourceWorkbookSha256 === SEASON_AGE_INDEX_WORKBOOK_SHA256
    && index?.provenance?.packageId === SEASON_AGE_INDEX_PACKAGE_ID
    && index?.provenance?.packageVersion === SEASON_AGE_INDEX_PACKAGE_VERSION
    && index?.provenance?.normalizationContract === SEASON_AGE_INDEX_NORMALIZATION
    && Array.isArray(index.anchors)
    && Array.isArray(index.ambiguousNameKeySeasons);
}

function getSeasonAgeIndexLookup(index) {
  const cached = seasonAgeIndexLookupCache.get(index);
  if (cached
      && cached.anchorsRef === index.anchors
      && cached.ambiguitiesRef === index.ambiguousNameKeySeasons
      && cached.anchorCount === index.anchors.length
      && cached.ambiguityCount === index.ambiguousNameKeySeasons.length) {
    return cached;
  }
  const anchorsByNameKey = new Map();
  for (const anchor of index.anchors) {
    const key = anchor?.playerNameKey;
    if (typeof key !== 'string') continue;
    const rows = anchorsByNameKey.get(key) ?? [];
    rows.push(anchor);
    anchorsByNameKey.set(key, rows);
  }
  const ambiguitiesByNameKey = new Map();
  for (const entry of index.ambiguousNameKeySeasons) {
    const key = entry?.playerNameKey;
    if (typeof key !== 'string') continue;
    const rows = ambiguitiesByNameKey.get(key) ?? [];
    rows.push(entry);
    ambiguitiesByNameKey.set(key, rows);
  }
  const lookup = {
    anchorsRef: index.anchors,
    ambiguitiesRef: index.ambiguousNameKeySeasons,
    anchorCount: index.anchors.length,
    ambiguityCount: index.ambiguousNameKeySeasons.length,
    anchorsByNameKey,
    ambiguitiesByNameKey,
  };
  seasonAgeIndexLookupCache.set(index, lookup);
  return lookup;
}

function isValidIndexAnchor(anchor) {
  const evidence = anchor?.identityEvidence ?? {};
  const allowedMatchKeyType = anchor?.matchKeyType === 'exact-normalized-player-name'
    || anchor?.matchKeyType === 'unique-exact-season-folded-name-key';
  const lossyUsedExpected = anchor?.matchKeyType === 'unique-exact-season-folded-name-key';
  return typeof anchor?.playerNameKey === 'string'
    && normalizeSeasonAgeNameKey(anchor.playerNameKey) === anchor.playerNameKey
    && isSeasonStartYear(anchor.seasonStartYear)
    && isAge(anchor.age)
    && anchor.ageSource === CAREER_STATE_AGE_SOURCE
    && typeof anchor.recordId === 'string'
    && typeof anchor.workbookRecordRef === 'string'
    && anchor.sourceWorkbookSha256 === SEASON_AGE_INDEX_WORKBOOK_SHA256
    && allowedMatchKeyType
    && evidence.exactSeason === true
    && evidence.candidateCount === 1
    && evidence.uniqueCandidate === true
    && evidence.lossyLookupKeyUsed === lossyUsedExpected
    && evidence.lossyLookupKeyEmittedAsIdentity === false;
}

function isSeasonStartYear(value) {
  return Number.isInteger(value)
    && value >= MIN_SEASON_START_YEAR
    && value <= MAX_SEASON_START_YEAR;
}

function isAge(value) {
  return Number.isInteger(value) && value >= MIN_AGE && value <= MAX_AGE;
}

function hasUniqueExactSeasonIdentityEvidence(row) {
  const values = row?.values ?? {};
  const evidence = values.matchKeyEvidence ?? {};
  const exactNameResolution = values.matchKeyType === 'exact-normalized-player-name'
    && evidence.lossyLookupKeyUsed === false;
  const uniqueFoldedResolution = values.matchKeyType === 'unique-exact-season-folded-name-key'
    && evidence.lossyLookupKeyUsed === true;
  return row?.evidence?.status === 'available'
    && values.identityStatus === 'unique-exact-season-candidate'
    && (exactNameResolution || uniqueFoldedResolution)
    && evidence.exactSeason === true
    && evidence.candidateCount === 1
    && evidence.uniqueCandidate === true
    && evidence.lossyLookupKeyEmittedAsIdentity === false;
}

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_SEASON_START_YEAR || year > MAX_SEASON_START_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function ageOnReferenceDate(birthDate, referenceDate) {
  const [year, month, day] = referenceDate.split('-').map(Number);
  let age = year - birthDate.year;
  if (month < birthDate.month || (month === birthDate.month && day < birthDate.day)) age -= 1;
  return age;
}

function unavailable(reason, targetSeasonStartYear = null, referenceDate = null) {
  return { status: 'unavailable', age: null, targetSeasonStartYear, referenceDate, reason };
}

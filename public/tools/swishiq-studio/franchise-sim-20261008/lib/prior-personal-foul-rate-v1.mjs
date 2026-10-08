import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const PRIOR_PERSONAL_FOUL_RATE_V1 = 'djhc-prior-personal-foul-rate-v1';
export const PRIOR_PERSONAL_FOUL_WINDOW_MAX_ROWS_V1 = 10;
export const PRIOR_PERSONAL_FOUL_RECENT_APPEARANCES_V1 = 5;

const currentScope = 'supplied-current-season-window';
const recentScope = 'last-five-positive-appearances-in-supplied-current-season-window';
const priorScope = 'supplied-immediately-prior-season-window';
const disclosure = 'Total personal fouls only. Box-score counts do not identify defensive, shooting, common, or technical foul categories.';
const missingPolicy = 'Missing personalFouls is unknown: it adds neither personal-foul count nor known-PF minutes; positive appearance minutes remain visible in missing-coverage evidence.';
const estimateDisclosure = 'Unshrunk descriptive personal fouls per 36 matched known-PF minutes; no calibrated uncertainty interval or reliability threshold is claimed.';

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function review(message) {
  throw new Error(`Prior personal-foul rate requires review: ${message}`);
}

function nameKey(value) {
  if (typeof value !== 'string' || !value.trim()) review('canonical name is required');
  const key = normalizeCanonicalPlayerName(value);
  if (!key) review('canonical name has no normalized identity key');
  return key;
}

function finiteNonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0) review(`${label} must be finite and nonnegative`);
  return value;
}

function safeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) review(`${label} must be a nonnegative safe integer`);
  return value;
}

function addSafeCount(total, value, label) {
  const next = total + value;
  if (!Number.isSafeInteger(next)) review(`${label} sum exceeds safe count range`);
  return next;
}

function addFinite(total, value, label) {
  const next = total + value;
  if (!Number.isFinite(next)) review(`${label} sum is nonfinite`);
  return next;
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function validateWindow(window, expectedYear, targetDate, expectedNameKey, seenGameRefs) {
  if (!isPlainRecord(window) || window.seasonStartYear !== expectedYear ||
      !Array.isArray(window.observations) || window.observations.length > PRIOR_PERSONAL_FOUL_WINDOW_MAX_ROWS_V1) {
    review('unsupported or oversized history window');
  }
  let previousDate = null;
  const rows = [];
  for (let index = 0; index < window.observations.length; index += 1) {
    const row = window.observations[index];
    if (!isPlainRecord(row) || !validDate(row.date) || row.date >= targetDate ||
        ![expectedYear, expectedYear + 1].includes(Number(row.date.slice(0, 4))) ||
        (previousDate !== null && row.date < previousDate) ||
        typeof row.gameRef !== 'string' || !row.gameRef.trim() || seenGameRefs.has(row.gameRef) ||
        (row.seasonStartYear !== undefined && row.seasonStartYear !== expectedYear)) {
      review(`unbound, out-of-order, duplicated or date-leaking appearance row ${index}`);
    }
    const rowNameKey = nameKey(row.canonicalName);
    if (rowNameKey !== expectedNameKey || row.canonicalNameKey !== expectedNameKey) {
      review(`canonical-name key mismatch in appearance row ${index}`);
    }
    if (row.observedAppearance !== undefined && typeof row.observedAppearance !== 'boolean') {
      review(`observedAppearance must be boolean in appearance row ${index}`);
    }
    const minutes = finiteNonnegative(row.minutes, `appearance row ${index} minutes`);
    if (minutes > 108) review(`appearance row ${index} minutes exceed source support`);
    const appears = minutes > 0;
    if (row.observedAppearance !== undefined && row.observedAppearance !== appears) {
      review(`observedAppearance disagrees with positive-minute support in row ${index}`);
    }
    if (!isPlainRecord(row.counts)) review(`counts must be an object in appearance row ${index}`);
    const personalFouls = row.counts.personalFouls;
    const knownPersonalFouls = personalFouls !== undefined && personalFouls !== null;
    if (knownPersonalFouls) safeCount(personalFouls, `appearance row ${index} personalFouls`);
    if (!appears && knownPersonalFouls && personalFouls > 0) {
      review(`positive personal fouls have zero minutes in appearance row ${index}`);
    }
    rows.push({ date: row.date, gameRef: row.gameRef, minutes, personalFouls: knownPersonalFouls ? personalFouls : null,
      appears });
    seenGameRefs.add(row.gameRef);
    previousDate = row.date;
  }
  return { seasonStartYear: expectedYear, rows };
}

function summarizeRows(window, scope) {
  const rows = window.rows;
  let appearances = 0, zeroMinuteRows = 0;
  let personalFouls = 0, knownPersonalFoulAppearances = 0, missingPersonalFoulAppearances = 0;
  let appearanceMinutes = 0, knownPersonalFoulMinutes = 0, missingPersonalFoulMinutes = 0;
  let lastKnownPersonalFoulDate = null;
  const appearanceGameRefs = [];
  for (const row of rows) {
    if (row.personalFouls !== null) lastKnownPersonalFoulDate = row.date;
    if (!row.appears) {
      zeroMinuteRows += 1;
      continue;
    }
    appearances += 1;
    appearanceMinutes = addFinite(appearanceMinutes, row.minutes, 'appearance minutes');
    appearanceGameRefs.push(row.gameRef);
    if (row.personalFouls === null) {
      missingPersonalFoulAppearances += 1;
      missingPersonalFoulMinutes = addFinite(missingPersonalFoulMinutes, row.minutes, 'missing-PF minutes');
    } else {
      knownPersonalFoulAppearances += 1;
      knownPersonalFoulMinutes = addFinite(knownPersonalFoulMinutes, row.minutes, 'known-PF minutes');
      personalFouls = addSafeCount(personalFouls, row.personalFouls, 'personal-foul count');
    }
  }
  const ratePer36 = knownPersonalFoulMinutes > 0
    ? finiteNonnegative(personalFouls / knownPersonalFoulMinutes * 36, 'personal fouls per 36')
    : null;
  const knownPersonalFoulCoverage = appearanceMinutes > 0
    ? finiteNonnegative(knownPersonalFoulMinutes / appearanceMinutes, 'known-PF minute coverage')
    : null;
  return {
    scope,
    seasonStartYear: window.seasonStartYear,
    observationRows: rows.length,
    appearances,
    zeroMinuteRows,
    personalFouls,
    knownPersonalFoulAppearances,
    missingPersonalFoulAppearances,
    appearanceMinutes,
    knownPersonalFoulMinutes,
    missingPersonalFoulMinutes,
    knownPersonalFoulCoverage,
    ratePer36,
    lastObservedDate: rows.at(-1)?.date ?? null,
    lastKnownPersonalFoulDate,
    observationGameRefs: rows.map(row => row.gameRef),
    appearanceGameRefs,
  };
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function assertSummary(summary, { expectedYear, targetDate, scope }) {
  if (!isPlainRecord(summary) || summary.scope !== scope || summary.seasonStartYear !== expectedYear ||
      !Number.isSafeInteger(summary.observationRows) || summary.observationRows < 0 || summary.observationRows > 10 ||
      !Number.isSafeInteger(summary.appearances) || summary.appearances < 0 || summary.appearances > summary.observationRows ||
      !Number.isSafeInteger(summary.zeroMinuteRows) || summary.zeroMinuteRows !== summary.observationRows - summary.appearances ||
      !Number.isSafeInteger(summary.knownPersonalFoulAppearances) || summary.knownPersonalFoulAppearances < 0 ||
      !Number.isSafeInteger(summary.missingPersonalFoulAppearances) || summary.missingPersonalFoulAppearances < 0 ||
      summary.knownPersonalFoulAppearances + summary.missingPersonalFoulAppearances !== summary.appearances ||
      !Number.isSafeInteger(summary.personalFouls) || summary.personalFouls < 0 ||
      !Number.isFinite(summary.appearanceMinutes) || summary.appearanceMinutes < 0 ||
      !Number.isFinite(summary.knownPersonalFoulMinutes) || summary.knownPersonalFoulMinutes < 0 ||
      !Number.isFinite(summary.missingPersonalFoulMinutes) || summary.missingPersonalFoulMinutes < 0 ||
      !Array.isArray(summary.observationGameRefs) || summary.observationGameRefs.length !== summary.observationRows ||
      !summary.observationGameRefs.every(ref => typeof ref === 'string' && ref.trim()) ||
      new Set(summary.observationGameRefs).size !== summary.observationRows ||
      !Array.isArray(summary.appearanceGameRefs) || summary.appearanceGameRefs.length !== summary.appearances ||
      !summary.appearanceGameRefs.every(ref => summary.observationGameRefs.includes(ref))) {
    review('invalid aggregate support summary');
  }
  if (summary.lastObservedDate !== null && (!validDate(summary.lastObservedDate) || summary.lastObservedDate >= targetDate ||
      ![expectedYear, expectedYear + 1].includes(Number(summary.lastObservedDate.slice(0, 4)))) ||
      (summary.observationRows === 0 ? summary.lastObservedDate !== null : summary.lastObservedDate === null) ||
      summary.lastKnownPersonalFoulDate !== null && (!validDate(summary.lastKnownPersonalFoulDate) ||
        summary.lastKnownPersonalFoulDate >= targetDate || summary.lastKnownPersonalFoulDate > summary.lastObservedDate ||
        ![expectedYear, expectedYear + 1].includes(Number(summary.lastKnownPersonalFoulDate.slice(0, 4)))) ||
      (summary.knownPersonalFoulAppearances === 0 && (summary.knownPersonalFoulMinutes !== 0 || summary.personalFouls !== 0)) ||
      (summary.missingPersonalFoulAppearances === 0 && summary.missingPersonalFoulMinutes !== 0)) {
    review('invalid aggregate dates or known/missing exposure support');
  }
  const minuteTotal = summary.knownPersonalFoulMinutes + summary.missingPersonalFoulMinutes;
  if (!Number.isFinite(minuteTotal) || Math.abs(minuteTotal - summary.appearanceMinutes) > 1e-9 * (1 + summary.appearanceMinutes)) {
    review('known and missing PF minutes do not reconcile to appearance exposure');
  }
  const expectedCoverage = summary.appearanceMinutes > 0
    ? summary.knownPersonalFoulMinutes / summary.appearanceMinutes
    : null;
  const expectedRate = summary.knownPersonalFoulMinutes > 0
    ? summary.personalFouls / summary.knownPersonalFoulMinutes * 36
    : null;
  if (summary.knownPersonalFoulCoverage !== expectedCoverage || summary.ratePer36 !== expectedRate ||
      (summary.appearances === 0 && (summary.appearanceMinutes !== 0 || summary.knownPersonalFoulCoverage !== null || summary.ratePer36 !== null)) ||
      (summary.knownPersonalFoulAppearances === 0 && summary.ratePer36 !== null)) {
    review('summary rate or coverage does not reproduce its counts and minutes');
  }
  return summary;
}

/** Build three unshrunk, prior-only descriptive total-PF rates from bounded
 * supplied box history. Positive minutes define appearances. */
export function createPriorPersonalFoulRateV1({ canonicalName, seasonStartYear, targetDateExclusive, current, prior } = {}) {
  const canonicalNameKey = nameKey(canonicalName);
  if (!Number.isInteger(seasonStartYear) || !validDate(targetDateExclusive) ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(targetDateExclusive.slice(0, 4)))) {
    review('unbound target season or local date');
  }
  const seenGameRefs = new Set();
  const currentWindow = validateWindow(current, seasonStartYear, targetDateExclusive, canonicalNameKey, seenGameRefs);
  const priorWindow = validateWindow(prior, seasonStartYear - 1, targetDateExclusive, canonicalNameKey, seenGameRefs);
  const currentSeason = summarizeRows(currentWindow, currentScope);
  const currentAppearances = currentWindow.rows.filter(row => row.appears);
  const recentRows = currentAppearances.slice(-PRIOR_PERSONAL_FOUL_RECENT_APPEARANCES_V1);
  const recentCurrentSeason = summarizeRows({ seasonStartYear, rows: recentRows }, recentScope);
  const priorSeason = summarizeRows(priorWindow, priorScope);
  return {
    format: PRIOR_PERSONAL_FOUL_RATE_V1,
    version: 1,
    canonicalNameKey,
    seasonStartYear,
    targetDateExclusive,
    lastObservedDate: latestDate([currentSeason.lastObservedDate, priorSeason.lastObservedDate]),
    lastKnownPersonalFoulDate: latestDate([currentSeason.lastKnownPersonalFoulDate, priorSeason.lastKnownPersonalFoulDate]),
    currentSeason,
    recentCurrentSeason,
    priorSeason,
    provenance: {
      derivedFromTargetGame: false,
      wholeLocalDateEmbargo: true,
      window: 'up to ten supplied box rows per current and immediately prior season; positive minutes define appearances',
      currentSeasonScope: 'supplied bounded window, not full season-to-date unless complete season evidence was supplied',
      recentWindow: 'last five positive-minute appearances contained in the supplied current-season window',
      priorSeasonScope: 'up to ten supplied immediately prior-season box rows, not a full season unless complete evidence was supplied',
      missingPolicy,
      estimate: estimateDisclosure,
      empiricallySelected: false,
      disclosure,
    },
  };
}

/** Validate the identity/date binding and the profile's reproduced aggregate
 * counts, exposures, coverage and rates. */
export function validatePriorPersonalFoulRateV1(profile, { canonicalName, seasonStartYear, gameLocalDate } = {}) {
  const expectedNameKey = nameKey(canonicalName);
  if (profile?.format !== PRIOR_PERSONAL_FOUL_RATE_V1 || profile.version !== 1 ||
      profile.canonicalNameKey !== expectedNameKey || profile.seasonStartYear !== seasonStartYear ||
      !Number.isInteger(seasonStartYear) || !validDate(gameLocalDate) || profile.targetDateExclusive !== gameLocalDate ||
      ![seasonStartYear, seasonStartYear + 1].includes(Number(gameLocalDate.slice(0, 4)))) {
    review('profile is not bound to the exact normalized name, season and game-local date');
  }
  const provenance = profile.provenance;
  if (provenance?.derivedFromTargetGame !== false || provenance.wholeLocalDateEmbargo !== true ||
      provenance.window !== 'up to ten supplied box rows per current and immediately prior season; positive minutes define appearances' ||
      provenance.currentSeasonScope !== 'supplied bounded window, not full season-to-date unless complete season evidence was supplied' ||
      provenance.recentWindow !== 'last five positive-minute appearances contained in the supplied current-season window' ||
      provenance.priorSeasonScope !== 'up to ten supplied immediately prior-season box rows, not a full season unless complete evidence was supplied' ||
      provenance.missingPolicy !== missingPolicy || provenance.estimate !== estimateDisclosure ||
      provenance.empiricallySelected !== false || provenance.disclosure !== disclosure) {
    review('profile provenance or limitation disclosure changed');
  }
  const current = assertSummary(profile.currentSeason, { expectedYear: seasonStartYear, targetDate: gameLocalDate, scope: currentScope });
  const recent = assertSummary(profile.recentCurrentSeason, { expectedYear: seasonStartYear, targetDate: gameLocalDate, scope: recentScope });
  const previous = assertSummary(profile.priorSeason, { expectedYear: seasonStartYear - 1, targetDate: gameLocalDate, scope: priorScope });
  const expectedRecentRefs = current.appearanceGameRefs.slice(-PRIOR_PERSONAL_FOUL_RECENT_APPEARANCES_V1);
  if (JSON.stringify(recent.appearanceGameRefs) !== JSON.stringify(expectedRecentRefs) ||
      recent.observationRows !== recent.appearances || recent.zeroMinuteRows !== 0 ||
      current.observationGameRefs.some(ref => previous.observationGameRefs.includes(ref))) {
    review('recent suffix or cross-season game identity does not reproduce');
  }
  if (profile.lastObservedDate !== latestDate([current.lastObservedDate, previous.lastObservedDate]) ||
      profile.lastKnownPersonalFoulDate !== latestDate([current.lastKnownPersonalFoulDate, previous.lastKnownPersonalFoulDate])) {
    review('last observed and last known-PF dates do not reproduce window summaries');
  }
  return profile;
}

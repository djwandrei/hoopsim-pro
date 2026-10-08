import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const PLAYER_GAME_COHORT_FORMAT = 'djhc-chronological-player-game-cohort-v1';
export const COHORT_COUNT_FIELDS = Object.freeze(['points', 'rebounds', 'assists', 'threePointersMade',
  'turnovers', 'steals', 'blocks', 'fieldGoalAttempts', 'fieldGoalsMade', 'threePointAttempts',
  'freeThrowAttempts', 'freeThrowsMade', 'twoPointAttempts', 'twoPointMakes', 'offensiveRebounds', 'defensiveRebounds', 'personalFouls']);
const RATE_NAMES = { points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threePointersMade: 'Threes',
  turnovers: 'Turnovers', steals: 'Steals', blocks: 'Blocks' };
const RATING_DOMAINS = { scoringRating: 'scoring', shootingRating: 'shooting', creationRating: 'creation',
  reboundingRating: 'rebounding', defenseRating: 'defensiveActivity' };
const SHOT_PAIRS = { fieldGoalPct: ['fieldGoalsMade', 'fieldGoalAttempts'],
  threePointPct: ['threePointersMade', 'threePointAttempts'], twoPointPct: ['twoPointMakes', 'twoPointAttempts'],
  freeThrowPct: ['freeThrowsMade', 'freeThrowAttempts'] };
const key = (...parts) => JSON.stringify(parts);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const dayOf = date => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(dayOf(date)) && new Date(dayOf(date) * 86400000).toISOString().slice(0, 10) === date;
const mean = rows => rows.length ? rows.reduce((sum, row) => sum + row.minutes, 0) / rows.length : null;
const review = (violations, recordId = null) => ({ status: 'requires-review', violations, recordId });

function provenance(record) {
  return { recordId: record.recordId ?? null, sourceLabel: record.evidence?.sourceLabel ?? null,
    sourceSystem: record.provenance?.sourceSystem ?? null, sourceVersion: record.provenance?.sourceVersion ?? null,
    retrievedAt: record.provenance?.retrievedAt ?? null, evidenceKind: record.evidence?.kind ?? null,
    evidenceStatus: record.evidence?.status ?? null, provenanceComplete: record.provenance?.provenanceComplete ?? false };
}

/** Only the pinned training-eligible regular-game population is admitted.
 * Original team scores stay targets; they never enter player features. */
export function normalizeCohortTeamGameRecord(record) {
  const values = record?.values ?? {}, time = record?.time ?? {}, entities = record?.entities ?? {};
  if (values.trainingEligible !== true || values.phase !== 'regular' || time.phase !== 'regular') return { status: 'ignored', reason: 'outside-training-eligible-regular-population' };
  const row = { gameRef: entities.gameRef ?? values.gameRef, teamCode: entities.teamCode ?? values.teamCode,
    opponentTeamCode: entities.opponentTeamCode ?? values.opponentTeamCode, date: time.gameDateLocal ?? values.localGameDate,
    seasonStartYear: time.seasonStartYear ?? values.seasonStartYear, isHome: values.isHome,
    pointsFor: values.pointsFor ?? null, pointsAgainst: values.pointsAgainst ?? null, source: provenance(record) };
  if (![row.gameRef, row.teamCode, row.opponentTeamCode].every(value => typeof value === 'string' && value.trim()) ||
      !validDate(row.date) || !Number.isInteger(row.seasonStartYear) || typeof row.isHome !== 'boolean') return review(['Invalid regular team-game identity/date/home side.'], record.recordId);
  if (![row.seasonStartYear, row.seasonStartYear + 1].includes(Number(row.date.slice(0, 4)))) return review(['Game date is outside its declared season years.'], record.recordId);
  for (const [entityField, valueField] of [['gameRef', 'gameRef'], ['teamCode', 'teamCode'], ['opponentTeamCode', 'opponentTeamCode']]) {
    if (entities[entityField] !== undefined && values[valueField] !== undefined && entities[entityField] !== values[valueField]) return review(['Conflicting team-game identity fields.'], record.recordId);
  }
  if ((time.gameDateLocal && values.localGameDate && time.gameDateLocal !== values.localGameDate) ||
      (time.seasonStartYear !== undefined && values.seasonStartYear !== undefined && time.seasonStartYear !== values.seasonStartYear)) return review(['Conflicting team-game season/date fields.'], record.recordId);
  if ([row.pointsFor, row.pointsAgainst].some(value => !finite(value) || value < 0 || !Number.isInteger(value))) return review(['Team targets need nonnegative integer scores.'], record.recordId);
  return { status: 'accepted', row };
}

export function buildCohortGameIndex(teamRows) {
  const groups = new Map(), games = new Map(), audit = { acceptedGames: 0, rejectedGames: 0, duplicateRows: 0, examples: [] };
  for (const row of teamRows) {
    const group = groups.get(row.gameRef) ?? [];
    group.push(row); groups.set(row.gameRef, group);
  }
  for (const [gameRef, group] of groups) {
    const unique = new Map();
    let conflicting = false;
    for (const row of group) {
      const old = unique.get(row.teamCode);
      if (!old) unique.set(row.teamCode, row);
      else if (key(old.date, old.seasonStartYear, old.opponentTeamCode, old.isHome, old.pointsFor, old.pointsAgainst) ===
          key(row.date, row.seasonStartYear, row.opponentTeamCode, row.isHome, row.pointsFor, row.pointsAgainst)) audit.duplicateRows += 1;
      else conflicting = true;
    }
    const rows = [...unique.values()], home = rows.find(row => row.isHome), away = rows.find(row => !row.isHome);
    if (conflicting || rows.length !== 2 || !home || !away || home.teamCode === away.teamCode ||
        home.opponentTeamCode !== away.teamCode || away.opponentTeamCode !== home.teamCode ||
        home.date !== away.date || home.seasonStartYear !== away.seasonStartYear ||
        home.pointsFor !== away.pointsAgainst || away.pointsFor !== home.pointsAgainst) {
      audit.rejectedGames += 1;
      if (audit.examples.length < 10) audit.examples.push({ gameRef, reason: 'nonreciprocal-or-conflicting-team-game-pair' });
      continue;
    }
    games.set(gameRef, { gameRef, date: home.date, day: dayOf(home.date), seasonStartYear: home.seasonStartYear,
      homeTeam: home.teamCode, awayTeam: away.teamCode, homeScore: home.pointsFor, awayScore: away.pointsFor });
  }
  audit.acceptedGames = games.size;
  return { games, audit };
}

export function normalizeCohortPlayerRecord(record, games) {
  const values = record?.values ?? {}, time = record?.time ?? {}, entities = record?.entities ?? {};
  const gameRef = entities.gameRef ?? values.gameRef, game = games.get(gameRef);
  if (!game || time.phase !== 'regular') return { status: 'ignored', reason: 'outside-accepted-game-population' };
  const canonicalName = values.canonicalName ?? values.displayName ?? entities.displayName;
  const canonicalNameKey = typeof canonicalName === 'string' ? normalizeCanonicalPlayerName(canonicalName) : '';
  const teamCode = entities.teamCode ?? values.teamCode;
  if (!canonicalNameKey || ![game.homeTeam, game.awayTeam].includes(teamCode) ||
      time.gameDateLocal !== game.date || time.seasonStartYear !== game.seasonStartYear ||
      (entities.gameRef && values.gameRef && entities.gameRef !== values.gameRef) ||
      (entities.teamCode && values.teamCode && entities.teamCode !== values.teamCode)) return review(['Player name, team, season or date does not match the accepted game.'], record.recordId);
  if ([values.canonicalName, values.displayName, entities.displayName].some(value => value !== undefined && value !== null &&
      (typeof value !== 'string' || normalizeCanonicalPlayerName(value) !== canonicalNameKey))) return review(['Conflicting exact player name fields.'], record.recordId);
  const minutes = values.minutes;
  if (!finite(minutes) || minutes < 0 || minutes > 108) return review(['Invalid observed player minutes.'], record.recordId);
  if (values.isStarter !== undefined && values.isStarter !== null && typeof values.isStarter !== 'boolean') return review(['Invalid observed starting-status type.'], record.recordId);
  const box = {}, missingFields = [];
  for (const field of COHORT_COUNT_FIELDS) {
    const value = values.box?.[field];
    if (value === undefined || value === null) { box[field] = null; missingFields.push(field); }
    else if (!finite(value) || value < 0 || !Number.isInteger(value)) return review([`Invalid observed count: ${field}.`], record.recordId);
    else box[field] = value;
  }
  for (const [made, attempted] of Object.values(SHOT_PAIRS)) {
    if (box[made] !== null && box[attempted] !== null && box[made] > box[attempted]) return review([`Observed ${made} exceeds ${attempted}.`], record.recordId);
  }
  if (box.rebounds !== null && box.offensiveRebounds !== null && box.defensiveRebounds !== null &&
      box.rebounds !== box.offensiveRebounds + box.defensiveRebounds) return review(['Observed rebound counts do not reconcile.'], record.recordId);
  if (box.fieldGoalsMade !== null && box.threePointersMade !== null && box.threePointersMade > box.fieldGoalsMade) return review(['Observed threes exceed all made field goals.'], record.recordId);
  if (box.fieldGoalAttempts !== null && box.threePointAttempts !== null && box.threePointAttempts > box.fieldGoalAttempts) return review(['Observed three-point attempts exceed all field-goal attempts.'], record.recordId);
  for (const [two, three, total] of [['twoPointAttempts', 'threePointAttempts', 'fieldGoalAttempts'], ['twoPointMakes', 'threePointersMade', 'fieldGoalsMade']]) {
    if ([two, three, total].every(field => box[field] !== null) && box[two] + box[three] !== box[total]) return review(['Observed two/three/total shot counts do not reconcile.'], record.recordId);
  }
  if (['points', 'fieldGoalsMade', 'threePointersMade', 'freeThrowsMade'].every(field => box[field] !== null) &&
      box.points !== 2 * box.fieldGoalsMade + box.threePointersMade + box.freeThrowsMade) return review(['Observed shot points do not reconcile.'], record.recordId);
  if (minutes === 0 && COHORT_COUNT_FIELDS.some(field => box[field] > 0)) return review(['Zero-minute row carries nonzero recorded counts; it is not a DNP label.'], record.recordId);
  return { status: 'accepted', row: { canonicalName: canonicalName.trim(), canonicalNameKey,
    seasonStartYear: game.seasonStartYear, gameRef, teamCode,
    opponentTeamCode: teamCode === game.homeTeam ? game.awayTeam : game.homeTeam,
    isHome: teamCode === game.homeTeam, date: game.date, day: game.day,
    playerRef: entities.playerRef ?? null, minutes, isStarter: values.isStarter ?? null,
    box, missingFields, source: provenance(record) } };
}

/** Deduplicate exact observations; quarantine every conflicting observation,
 * including same-name players on both sides. Provider refs support identity;
 * they cannot rename a canonical player or silently choose a conflicting row. */
export function reconcileCohortObservations(rows) {
  const byKey = new Map(), conflicts = new Set(), identityConflicts = new Set(), byProvider = new Map(), byName = new Map(), byAppearance = new Map();
  const audit = { duplicateRows: 0, conflictRows: 0, identityConflictRows: 0, multipleSupportingRefNames: 0, acceptedRows: 0, examples: [] };
  for (const row of rows) {
    const observationKey = key(row.seasonStartYear, row.gameRef, row.teamCode, row.canonicalNameKey);
    const appearanceKey = key(row.seasonStartYear, row.gameRef, row.canonicalNameKey);
    const appearanceKeys = byAppearance.get(appearanceKey) ?? new Set();
    appearanceKeys.add(observationKey); byAppearance.set(appearanceKey, appearanceKeys);
    const prior = byKey.get(observationKey);
    if (!prior) byKey.set(observationKey, row);
    else if (key(prior.teamCode, prior.playerRef, prior.minutes, prior.isStarter, prior.box) ===
        key(row.teamCode, row.playerRef, row.minutes, row.isStarter, row.box)) audit.duplicateRows += 1;
    else conflicts.add(observationKey);
    if (!row.playerRef) continue;
    const providerKey = key(row.seasonStartYear, row.playerRef), nameKey = key(row.seasonStartYear, row.canonicalNameKey);
    const names = byProvider.get(providerKey) ?? new Set(), refs = byName.get(nameKey) ?? new Set();
    names.add(nameKey); refs.add(providerKey); byProvider.set(providerKey, names); byName.set(nameKey, refs);
  }
  for (const keys of byAppearance.values()) if (keys.size > 1) for (const observationKey of keys) conflicts.add(observationKey);
  for (const names of byProvider.values()) if (names.size > 1) for (const name of names) identityConflicts.add(name);
  // Several supporting refs do not invalidate a consistent canonical name.
  // Same-name opposing players in one game still need explicit reconciliation.
  for (const refs of byName.values()) if (refs.size > 1) audit.multipleSupportingRefNames += 1;
  const accepted = [];
  for (const [observationKey, row] of byKey) {
    const reason = conflicts.has(observationKey) ? 'conflicting-player-game-observation'
      : identityConflicts.has(key(row.seasonStartYear, row.canonicalNameKey)) ? 'ambiguous-name-provider-evidence' : null;
    if (reason) {
      audit[reason.startsWith('ambiguous') ? 'identityConflictRows' : 'conflictRows'] += 1;
      if (audit.examples.length < 10) audit.examples.push({ canonicalName: row.canonicalName, gameRef: row.gameRef, reason });
    } else accepted.push(row);
  }
  accepted.sort((a, b) => a.date.localeCompare(b.date) || a.gameRef.localeCompare(b.gameRef) ||
    a.teamCode.localeCompare(b.teamCode) || a.canonicalNameKey.localeCompare(b.canonicalNameKey));
  audit.acceptedRows = accepted.length;
  return { observations: accepted, audit };
}

export function normalizeCohortRatingRecord(record) {
  const values = record?.values ?? {}, entities = record?.entities ?? {}, year = record?.time?.seasonStartYear;
  const canonicalName = values.canonicalName ?? values.displayName ?? entities.displayName;
  const canonicalNameKey = typeof canonicalName === 'string' ? normalizeCanonicalPlayerName(canonicalName) : '';
  if (!canonicalNameKey || !Number.isInteger(year) || !finite(values.value) || values.value < 0 || values.value > 100) return review(['Invalid named player-season rating.'], record?.recordId);
  if ([values.canonicalName, values.displayName, entities.displayName].some(value => value !== undefined && value !== null &&
      (typeof value !== 'string' || normalizeCanonicalPlayerName(value) !== canonicalNameKey))) return review(['Conflicting exact rating player name fields.'], record.recordId);
  if ([values.normalizedPlayerNameKey, entities.normalizedPlayerNameKey].some(value =>
    value !== undefined && normalizeCanonicalPlayerName(value) !== canonicalNameKey)) return review(['Rating name fields conflict; no fuzzy join is permitted.'], record.recordId);
  const ratings = { overallRating: values.value };
  for (const [field, domain] of Object.entries(RATING_DOMAINS)) {
    const value = values.components?.domainPercentiles?.[domain];
    if (value === undefined || value === null) ratings[field] = null;
    else if (!finite(value) || value < 0 || value > 100) return review([`Invalid rating domain ${domain}.`], record.recordId);
    else ratings[field] = value;
  }
  return { status: 'accepted', row: { canonicalName: canonicalName.trim(), canonicalNameKey, seasonStartYear: year,
    playerRef: entities.playerRef ?? null, ratings, source: provenance(record),
    modelId: record.evidence?.modelId ?? values.ratingSystemId ?? null, modelVersion: record.evidence?.modelVersion ?? null,
    baselineType: values.baseline?.type ?? null, temporalRole: record.temporalUse?.role ?? null,
    modelTrainingCutoff: record.provenance?.modelTrainingCutoff ?? null,
    interpretation: 'Lagged retrospective derived rating; source/model historical availability is not established by this join.' } };
}

export function buildLaggedRatingIndex(rows) {
  const ratings = new Map(), conflicts = new Set(), audit = { duplicateRows: 0, conflictingKeys: 0, acceptedRows: 0 };
  for (const row of rows) {
    const ratingKey = key(row.seasonStartYear, row.canonicalNameKey), old = ratings.get(ratingKey);
    if (!old) ratings.set(ratingKey, row);
    else if (key(old.ratings, old.modelId, old.modelVersion, old.playerRef) === key(row.ratings, row.modelId, row.modelVersion, row.playerRef)) audit.duplicateRows += 1;
    else conflicts.add(ratingKey);
  }
  for (const ratingKey of conflicts) ratings.delete(ratingKey);
  audit.conflictingKeys = conflicts.size; audit.acceptedRows = ratings.size;
  return { ratings, audit };
}

function emptySums() { return { ...Object.fromEntries(COHORT_COUNT_FIELDS.map(field => [field, { count: 0, minutes: 0, appearances: 0 }])),
  shooting: Object.fromEntries(Object.keys(SHOT_PAIRS).map(field => [field, { made: 0, attempted: 0, minutes: 0, appearances: 0 }])) }; }
function appendSums(sums, row, decay = 1) {
  for (const field of COHORT_COUNT_FIELDS) {
    const item = sums[field]; item.count *= decay; item.minutes *= decay; item.appearances *= decay;
    if (row.box[field] !== null) { item.count += row.box[field]; item.minutes += row.minutes; item.appearances += 1; }
  }
  for (const [field, [made, attempted]] of Object.entries(SHOT_PAIRS)) {
    const item = sums.shooting[field];
    for (const value of ['made', 'attempted', 'minutes', 'appearances']) item[value] *= decay;
    if (row.box[made] !== null && row.box[attempted] !== null) {
      item.made += row.box[made]; item.attempted += row.box[attempted]; item.minutes += row.minutes; item.appearances += 1;
    }
  }
}
function summarizeSums(sums, appearances, minutes) {
  const rates = {}, denominators = {};
  for (const field of COHORT_COUNT_FIELDS) {
    const item = sums[field]; rates[field] = item.minutes > 0 ? 36 * item.count / item.minutes : null;
    denominators[field] = { count: item.count, exposureMinutes: item.minutes, appearances: item.appearances };
  }
  const shootingDenominators = Object.fromEntries(Object.keys(SHOT_PAIRS).map(field => [field, { ...sums.shooting[field] }]));
  return { appearances, minutes, rates, denominators, shootingDenominators,
    efficiency: Object.fromEntries(Object.entries(shootingDenominators).map(([field, item]) => [field,
      item.attempted > 0 ? item.made / item.attempted : null])) };
}
function summarizeRows(rows) {
  const sums = emptySums(); for (const row of rows) appendSums(sums, row);
  return summarizeSums(sums, rows.length, rows.reduce((sum, row) => sum + row.minutes, 0));
}
function createSeasonHistory(halfLives) {
  return { recent: [], sums: emptySums(), appearances: 0, minutes: 0, teams: new Map(),
    ewma: new Map(halfLives.map(half => [half, { sums: emptySums(), weight: 0, squareWeight: 0, minutes: 0 }])) };
}
function appendSeason(history, row) {
  history.appearances += 1; history.minutes += row.minutes; appendSums(history.sums, row);
  history.recent.push(row); if (history.recent.length > 20) history.recent.shift();
  const teamRows = history.teams.get(row.teamCode) ?? []; teamRows.push(row); if (teamRows.length > 20) teamRows.shift();
  history.teams.set(row.teamCode, teamRows);
  for (const [half, state] of history.ewma) {
    const decay = 2 ** (-1 / half); appendSums(state.sums, row, decay);
    state.weight = state.weight * decay + 1; state.squareWeight = state.squareWeight * decay * decay + 1;
    state.minutes = state.minutes * decay + row.minutes;
  }
}

/** Pure chronological builder. Target boxes/minutes/starts live under targets;
 * feature history is appended only after the entire local date is emitted. */
export function* iterateChronologicalPlayerCohort(observations, ratingIndex = new Map(), {
  windows = [5, 10, 20], ewmaHalfLives = [5, 10, 20], shrinkagePriorMinutes = 180,
} = {}) {
  if (!Array.isArray(observations) || !(ratingIndex instanceof Map) ||
      windows.some(value => ![5, 10, 20].includes(value)) || ewmaHalfLives.some(value => !finite(value) || value <= 0) ||
      !finite(shrinkagePriorMinutes) || shrinkagePriorMinutes < 0) throw new Error('Invalid chronological cohort configuration.');
  const players = new Map(); let previousDate = null;
  for (let start = 0; start < observations.length;) {
    const date = observations[start].date;
    if (!validDate(date) || (previousDate !== null && date < previousDate)) throw new Error('Cohort observations must be sorted by valid local date.');
    let end = start + 1; while (end < observations.length && observations[end].date === date) end += 1;
    for (let index = start; index < end; index += 1) {
      const row = observations[index], history = players.get(row.canonicalNameKey);
      const current = history?.seasons.get(row.seasonStartYear), prior = history?.seasons.get(row.seasonStartYear - 1);
      const recent = current?.appearances ? current : prior, selectedSeason = current?.appearances ? row.seasonStartYear : prior ? row.seasonStartYear - 1 : null;
      const windowSummaries = Object.fromEntries(windows.map(window => [window, summarizeRows((recent?.recent ?? []).slice(-window))]));
      const seasonToDate = current ? summarizeSums(current.sums, current.appearances, current.minutes) : summarizeRows([]);
      const priorSeason = prior ? summarizeSums(prior.sums, prior.appearances, prior.minutes) : summarizeRows([]);
      const ewma = Object.fromEntries(ewmaHalfLives.map(half => {
        const state = recent?.ewma.get(half);
        return [half, { ...(state ? summarizeSums(state.sums, state.weight, state.minutes) : summarizeRows([])),
          effectiveAppearances: state?.squareWeight > 0 ? state.weight ** 2 / state.squareWeight : 0 }];
      }));
      const current10 = summarizeRows(current?.recent.slice(-10) ?? []), current5 = summarizeRows(current?.recent.slice(-5) ?? []);
      const prior10 = summarizeRows(prior?.recent.slice(-10) ?? []), default10 = windowSummaries[10] ?? summarizeRows(recent?.recent.slice(-10) ?? []);
      const shrunkRates = {}, features = {};
      for (const [field, label] of Object.entries(RATE_NAMES)) {
        const currentRate = current10.rates[field], priorRate = prior10.rates[field], exposure = current10.denominators[field].exposureMinutes;
        const weight = exposure > 0 && priorRate !== null ? exposure / (exposure + shrinkagePriorMinutes) : currentRate !== null ? 1 : 0;
        const value = currentRate !== null && priorRate !== null ? weight * currentRate + (1 - weight) * priorRate : currentRate ?? priorRate;
        shrunkRates[field] = { value, currentExposureMinutes: exposure, priorExposureMinutes: prior10.denominators[field].exposureMinutes,
          priorWeightMinutes: priorRate !== null ? shrinkagePriorMinutes : 0, source: value === null ? 'no-supported-history' : 'prior-date-exposure-shrunk-history' };
        features[`prior${label}Per36`] = value;
        features[`${field}TrendPer36`] = current5.rates[field] !== null && default10.rates[field] !== null
          ? current5.rates[field] - default10.rates[field] : null;
      }
      const recentRows = recent?.recent ?? [], careerRows = history?.recent ?? [];
      const currentTeamRows = current?.teams.get(row.teamCode) ?? [], priorTeamRows = prior?.teams.get(row.teamCode) ?? [];
      const sameTeamRows = currentTeamRows.length ? currentTeamRows : priorTeamRows;
      const knownStarts = recentRows.slice(-10).filter(item => item.isStarter !== null);
      const loadRows = (history?.load ?? []).filter(item => row.day - item.day >= 1 && row.day - item.day <= 7);
      Object.assign(features, { priorMinutesPerGame: mean(recentRows.slice(-10)), priorGames: recent?.appearances ?? 0,
        priorMinutesLastAppearance: history?.last?.minutes ?? null, priorMinutesLastFiveMean: mean(careerRows.slice(-5)),
        priorMinutesLastTenMean: mean(careerRows.slice(-10)), priorPlayerMinutesMean: history?.appearances ? history.minutes / history.appearances : null,
        priorPlayerAppearances: history?.appearances ?? 0, priorPlayerRestDays: history?.last ? row.day - history.last.day : null,
        priorPlayerLoadMinutesLast3Days: loadRows.filter(item => row.day - item.day <= 3).reduce((sum, item) => sum + item.minutes, 0),
        priorPlayerLoadMinutesLast7Days: loadRows.reduce((sum, item) => sum + item.minutes, 0),
        priorStartsShareLastTen: knownStarts.length ? knownStarts.filter(item => item.isStarter).length / knownStarts.length : null,
        priorKnownStartCount: knownStarts.length, sameTeamMinutesLastFiveMean: mean(sameTeamRows.slice(-5)),
        sameTeamMinutesLastTenMean: mean(sameTeamRows.slice(-10)), sameTeamPriorAppearances: sameTeamRows.length,
        hasPriorPlayerAppearance: history?.appearances > 0 ? 1 : 0, hasSameTeamPriorRole: sameTeamRows.length ? 1 : 0 });
      const rating = ratingIndex.get(key(row.seasonStartYear - 1, row.canonicalNameKey)) ?? null;
      Object.assign(features, Object.fromEntries(['overallRating', ...Object.keys(RATING_DOMAINS)].map(field => [field, rating?.ratings[field] ?? null])),
        { hasPriorSeasonRating: rating ? 1 : 0 });
      const eligibility = Object.fromEntries(Object.keys(RATE_NAMES).map(field => [field, {
        conditionalRate: row.minutes > 0 && row.box[field] !== null, conditionalCount: row.minutes > 0 && row.box[field] !== null }]));
      yield { format: PLAYER_GAME_COHORT_FORMAT, cohortKey: key(row.seasonStartYear, row.gameRef, row.teamCode, row.canonicalNameKey),
        canonicalName: row.canonicalName, canonicalNameKey: row.canonicalNameKey, supportingPlayerRef: row.playerRef,
        seasonStartYear: row.seasonStartYear, gameRef: row.gameRef, teamCode: row.teamCode, opponentTeamCode: row.opponentTeamCode,
        isHome: row.isHome, date: row.date, historyCutoff: { targetDateExclusive: row.date, lastPriorAppearanceDate: history?.last?.date ?? null,
          sameLocalDateEmbargo: true, ratingSeasonStartYear: rating?.seasonStartYear ?? null },
        features, form: { recentSourceSeasonStartYear: selectedSeason, windows: windowSummaries, ewma, seasonToDate, priorSeason, shrunkRates },
        ratingEvidence: rating ? { ...rating, ratings: { ...rating.ratings }, source: { ...rating.source } } : null,
        targets: { observedMinutes: row.minutes, observedAppearance: row.minutes > 0, observedIsStarter: row.isStarter,
          counts: { ...row.box }, ratesPer36: Object.fromEntries(Object.keys(RATE_NAMES).map(field => [field, row.minutes > 0 && row.box[field] !== null ? row.box[field] / row.minutes * 36 : null])) },
        eligibility: { byStatistic: eligibility, fullParticipationForecast: false,
          population: 'recorded-player-box-rows; conditional-on-observed-appearance, not an eligible-roster risk set',
          zeroMinuteInterpretation: row.minutes === 0 ? 'observed-zero-minute-row; availability-and-DNP-reason-unknown' : null },
        missingFields: [...row.missingFields], source: { ...row.source },
        forecastProvenance: { features: 'strict-prior-local-date-observed-history-and-exactly-prior-season-ratings',
          targetExposureIsFeature: false, historicalSourceAvailabilityVerified: false,
          derivedRatingModelTrainingCutoffVerified: rating?.modelTrainingCutoff !== null && rating?.modelTrainingCutoff !== undefined } };
    }
    for (let index = start; index < end; index += 1) {
      const row = observations[index]; if (row.minutes <= 0) continue;
      const history = players.get(row.canonicalNameKey) ?? { seasons: new Map(), recent: [], load: [], last: null, appearances: 0, minutes: 0 };
      const season = history.seasons.get(row.seasonStartYear) ?? createSeasonHistory(ewmaHalfLives);
      appendSeason(season, row); history.seasons.set(row.seasonStartYear, season);
      for (const year of history.seasons.keys()) if (year < row.seasonStartYear - 1) history.seasons.delete(year);
      history.recent.push(row); if (history.recent.length > 20) history.recent.shift();
      history.load = history.load.filter(item => row.day - item.day <= 7); history.load.push(row);
      history.last = row; history.appearances += 1; history.minutes += row.minutes; players.set(row.canonicalNameKey, history);
    }
    previousDate = date; start = end;
  }
}

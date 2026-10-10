import { COHORT_COUNT_FIELDS } from './player-game-cohort-v1.mjs';

export const PLAYER_DEVELOPMENT_FEATURE_FORMAT = 'djhc-player-game-development-features-v1';
export const PLAYER_RATE_STATISTICS = Object.freeze(['points', 'rebounds', 'assists', 'threePointersMade', 'turnovers', 'steals', 'blocks']);
const ratingFields = ['overallRating', 'scoringRating', 'shootingRating', 'creationRating', 'reboundingRating', 'defenseRating'];
const contextFields = { points: 'priorPointsPer36', rebounds: 'priorReboundsPer36', assists: 'priorAssistsPer36',
  threePointersMade: 'priorThreesPer36', turnovers: 'priorTurnoversPer36' };
const mean = rows => rows.length ? rows.reduce((sum, row) => sum + row.minutes, 0) / rows.length : 0;
const starts = rows => rows.filter(row => row.isStarter !== null);
const startShare = rows => rows.length ? rows.filter(row => row.isStarter).length / rows.length : 0;
const dayOf = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
const blend = (current, prior, weight) => current !== null && prior !== null
  ? weight * current + (1 - weight) * prior : current ?? prior ?? 0;
function total(rows, field) {
  return rows.length && rows.every(row => Number.isFinite(row.counts[field]))
    ? rows.reduce((sum, row) => sum + row.counts[field], 0) : null;
}
function rate(rows, field) {
  const count = total(rows, field), minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  return count !== null && minutes > 0 ? count / minutes * 36 : null;
}
function efficiency(rows, fields, compute) {
  const sums = Object.fromEntries(fields.map(field => [field, total(rows, field)]));
  return fields.every(field => sums[field] !== null) ? compute(sums) : null;
}
function seasonState() { return { appearances: 0, recent: [] }; }
function teamState() { return { appearances: 0, recent: [], seasons: new Map() }; }

/** Reconstruct the prior evaluators' formulas from one reconciled names-first
 * cohort. Positive short appearances update history; targets never enter their
 * own features. Only a date's small buffer is held before history is appended. */
export async function* iteratePlayerDevelopmentFeatures(cohortRows) {
  const histories = new Map(); let dateRows = [], date = null;
  function* emit(rows) {
    for (const row of rows) {
      const history = histories.get(row.canonicalNameKey);
      const current = history?.seasons.get(row.seasonStartYear), prior = history?.seasons.get(row.seasonStartYear - 1);
      const recent = current?.appearances ? current : prior;
      const recent10 = recent?.recent.slice(-10) ?? [], recent5 = recent?.recent.slice(-5) ?? [];
      const current10 = current?.recent.slice(-10) ?? [], current5 = current?.recent.slice(-5) ?? [];
      const prior10 = prior?.recent.slice(-10) ?? [];
      const currentCount = current?.appearances ?? 0, weight = currentCount / (currentCount + 5);
      const allRecent = history?.recent ?? [], all10 = allRecent.slice(-10);
      const knownStarts = starts(all10), team = history?.teams.get(row.teamCode), team10 = team?.recent.slice(-10) ?? [];
      const priorTeam = team?.seasons.get(row.seasonStartYear - 1);
      const day = dayOf(row.date), loadRows = (history?.load ?? []).filter(item => day - item.day >= 1 && day - item.day <= 7);
      const load7 = loadRows.reduce((sum, item) => sum + item.minutes, 0);
      const centeredRatings = Object.fromEntries(ratingFields.map(field => [field,
        Number.isFinite(row.features[field]) ? row.features[field] - (field === 'overallRating' ? 75 : 50) : 0]));
      const minutesFeatures = {
        priorMinutesLastAppearance: history?.last?.minutes ?? 0,
        priorMinutesLastFiveMean: mean(allRecent.slice(-5)), priorMinutesLastTenMean: mean(all10),
        priorPlayerMinutesMean: history?.appearances ? history.minutes / history.appearances : 0,
        priorPlayerAppearancesLog: Math.log1p(history?.appearances ?? 0), hasPriorPlayerAppearance: history ? 1 : 0,
        priorPlayerRestDays: history ? Math.max(0, Math.min(14, day - history.last.day)) : 14,
        priorPlayerLoadMinutesLast3Days: loadRows.filter(item => day - item.day <= 3).reduce((sum, item) => sum + item.minutes, 0),
        priorPlayerLoadMinutesLast7Days: load7, priorStartsShareLastTen: startShare(knownStarts),
        priorKnownStartCountLog: Math.log1p(knownStarts.length), priorWasStarterLastKnown: knownStarts.at(-1)?.isStarter === true ? 1 : 0,
        sameTeamMinutesLastFiveMean: mean(team?.recent.slice(-5) ?? []), sameTeamMinutesLastTenMean: mean(team10),
        sameTeamPriorSeasonMinutesMean: priorTeam?.appearances ? priorTeam.minutes / priorTeam.appearances : 0,
        sameTeamPriorAppearancesLog: Math.log1p(team?.appearances ?? 0), sameTeamStartsShareLastTen: startShare(starts(team10)),
        hasSameTeamPriorRole: team ? 1 : 0, hasPriorSeasonRating: row.ratingEvidence ? 1 : 0,
        ...Object.fromEntries(ratingFields.map(field => [`priorSeason${field[0].toUpperCase()}${field.slice(1)}Centered`, centeredRatings[field]])),
      };
      minutesFeatures.priorPlayerMinutesLastTenByStartShare = minutesFeatures.priorMinutesLastTenMean * minutesFeatures.priorStartsShareLastTen;
      minutesFeatures.sameTeamMinutesLastTenByStartShare = minutesFeatures.sameTeamMinutesLastTenMean * minutesFeatures.sameTeamStartsShareLastTen;
      minutesFeatures.priorMinutesLastFiveByRestDays = minutesFeatures.priorMinutesLastFiveMean * Math.min(7, minutesFeatures.priorPlayerRestDays);
      minutesFeatures.sameTeamMinutesByPriorOverallRating = minutesFeatures.sameTeamMinutesLastTenMean * centeredRatings.overallRating / 10;

      const boxCommonFeatures = { ...centeredRatings, priorMinutesPerGame: mean(recent10),
        priorGames: Math.min(20, currentCount + (prior?.appearances ?? 0)), fatigueLoad7: load7,
        ...Object.fromEntries(Object.entries(contextFields).map(([field, label]) => [label, blend(rate(current10, field), rate(prior10, field), weight)])) };
      const boxRateFeatures = Object.fromEntries(PLAYER_RATE_STATISTICS.filter(field => field !== 'points').map(field => {
        const shortRate = rate(current5, field), recentRate = rate(recent10, field);
        return [field, { priorTargetRate: blend(rate(current10, field), rate(prior10, field), weight),
          targetTrendPer36: shortRate !== null && recentRate !== null ? shortRate - recentRate : 0 }];
      }));
      const selectedPoints10 = rate(recent10, 'points'), points5 = rate(recent5, 'points');
      const pointsFeatures = { ...centeredRatings,
        priorPointsPer36: blend(selectedPoints10, rate(prior10, 'points'), weight),
        priorPointsTrendPer36: points5 !== null && selectedPoints10 !== null ? points5 - selectedPoints10 : 0,
        priorReboundsPer36: rate(recent10, 'rebounds') ?? rate(prior10, 'rebounds') ?? 0,
        priorAssistsPer36: rate(recent10, 'assists') ?? rate(prior10, 'assists') ?? 0,
        priorThreesPer36: rate(recent10, 'threePointersMade') ?? rate(prior10, 'threePointersMade') ?? 0,
        priorGames: boxCommonFeatures.priorGames, fatigueLoad7: load7,
        ...Object.fromEntries(['fieldGoalAttempts', 'freeThrowAttempts', 'threePointAttempts', 'twoPointAttempts'].map(field =>
          [`${field}Per36`, blend(rate(recent10, field), rate(prior10, field), weight)])),
      };
      const pctDefinitions = {
        effectiveFieldGoalPctAbove050: { fields: ['fieldGoalsMade', 'threePointersMade', 'fieldGoalAttempts'], center: 0.5,
          compute: s => s.fieldGoalAttempts > 0 ? (s.fieldGoalsMade + 0.5 * s.threePointersMade) / s.fieldGoalAttempts : null },
        trueShootingPctAbove055: { fields: ['points', 'fieldGoalAttempts', 'freeThrowAttempts'], center: 0.55,
          compute: s => s.fieldGoalAttempts + 0.44 * s.freeThrowAttempts > 0 ? s.points / (2 * (s.fieldGoalAttempts + 0.44 * s.freeThrowAttempts)) : null },
        threePointPctAbove035: { fields: ['threePointersMade', 'threePointAttempts'], center: 0.35,
          compute: s => s.threePointAttempts > 0 ? s.threePointersMade / s.threePointAttempts : null },
        freeThrowPctAbove075: { fields: ['freeThrowsMade', 'freeThrowAttempts'], center: 0.75,
          compute: s => s.freeThrowAttempts > 0 ? s.freeThrowsMade / s.freeThrowAttempts : null },
        twoPointPctAbove050: { fields: ['twoPointMakes', 'twoPointAttempts'], center: 0.5,
          compute: s => s.twoPointAttempts > 0 ? s.twoPointMakes / s.twoPointAttempts : null },
      };
      for (const [field, definition] of Object.entries(pctDefinitions)) {
        const currentPct = efficiency(recent10, definition.fields, definition.compute), priorPct = efficiency(prior10, definition.fields, definition.compute);
        pointsFeatures[field] = blend(currentPct === null ? null : currentPct - definition.center,
          priorPct === null ? null : priorPct - definition.center, weight);
      }
      const candidateRateFeatures = { exposureShrunk: Object.fromEntries(PLAYER_RATE_STATISTICS.map(field => [field, row.form.shrunkRates[field].value])),
        ewma: Object.fromEntries([5, 10, 20].map(half => [half, Object.fromEntries(PLAYER_RATE_STATISTICS.map(field => [field, row.form.ewma[half].rates[field]]))])) };
      yield { format: PLAYER_DEVELOPMENT_FEATURE_FORMAT, cohortKey: row.cohortKey,
        canonicalName: row.canonicalName, canonicalNameKey: row.canonicalNameKey, supportingPlayerRef: row.supportingPlayerRef,
        seasonStartYear: row.seasonStartYear, gameRef: row.gameRef, teamCode: row.teamCode, opponentTeamCode: row.opponentTeamCode,
        isHome: row.isHome, date: row.date, historyCutoff: { ...row.historyCutoff },
        minutesFeatures, pointsFeatures, boxCommonFeatures, boxRateFeatures, candidateRateFeatures,
        targets: structuredClone(row.targets), sourceRecordId: row.source.recordId,
        ratingEvidence: row.ratingEvidence ? { seasonStartYear: row.ratingEvidence.seasonStartYear,
          modelTrainingCutoff: row.ratingEvidence.modelTrainingCutoff ?? null,
          modelId: row.ratingEvidence.modelId, modelVersion: row.ratingEvidence.modelVersion } : null,
        forecastProvenance: { targetExposureIsFeature: false, historicalSourceAvailabilityVerified: false,
          derivedRatingModelTrainingCutoffVerified: false, mode: 'names-first-reconstruction-of-legacy-formulas; opened-development-cohort' } };
    }
  }
  function append(rows) {
    for (const row of rows) {
      const minutes = row.targets.observedMinutes;
      if (minutes <= 0) continue;
      const item = { date: row.date, day: dayOf(row.date), seasonStartYear: row.seasonStartYear, teamCode: row.teamCode,
        minutes, isStarter: row.targets.observedIsStarter, counts: { ...row.targets.counts } };
      const history = histories.get(row.canonicalNameKey) ?? { appearances: 0, minutes: 0, recent: [], load: [], last: null, seasons: new Map(), teams: new Map() };
      const season = history.seasons.get(row.seasonStartYear) ?? seasonState();
      season.appearances += 1; season.recent.push(item); if (season.recent.length > 20) season.recent.shift();
      history.seasons.set(row.seasonStartYear, season);
      for (const year of history.seasons.keys()) if (year < row.seasonStartYear - 1) history.seasons.delete(year);
      const team = history.teams.get(row.teamCode) ?? teamState();
      team.appearances += 1; team.recent.push(item); if (team.recent.length > 10) team.recent.shift();
      const teamSeason = team.seasons.get(row.seasonStartYear) ?? { appearances: 0, minutes: 0 };
      teamSeason.appearances += 1; teamSeason.minutes += minutes; team.seasons.set(row.seasonStartYear, teamSeason);
      for (const year of team.seasons.keys()) if (year < row.seasonStartYear - 1) team.seasons.delete(year);
      history.teams.set(row.teamCode, team); history.appearances += 1; history.minutes += minutes;
      history.recent.push(item); if (history.recent.length > 10) history.recent.shift();
      history.load = history.load.filter(prior => item.day - prior.day <= 7); history.load.push(item);
      history.last = item; histories.set(row.canonicalNameKey, history);
    }
  }
  for await (const row of cohortRows) {
    if (row.date !== date) {
      if (date !== null && row.date < date) throw new Error('Development cohort must be sorted by date.');
      if (dateRows.length) { yield* emit(dateRows); append(dateRows); }
      date = row.date; dateRows = [];
    }
    if (!Number.isFinite(row.targets?.observedMinutes) || row.targets.observedMinutes < 0 || row.targets.observedMinutes > 108 || !row.form ||
        !row.features || ratingFields.some(field => !Object.hasOwn(row.features, field) ||
          (row.features[field] !== null && !Number.isFinite(row.features[field]))) ||
        !(row.targets.observedIsStarter === null || typeof row.targets.observedIsStarter === 'boolean') ||
        COHORT_COUNT_FIELDS.some(field => row.targets.counts?.[field] !== null &&
          (!Number.isInteger(row.targets.counts?.[field]) || row.targets.counts[field] < 0))) throw new Error('Development features require full validated cohort rows.');
    dateRows.push(row);
  }
  if (dateRows.length) { yield* emit(dateRows); append(dateRows); }
}

const FEATURE_BLOCKS = Object.freeze({
  teamForm5: ['marginDiffLast5', 'pointsForDiffLast5', 'pointsAgainstDiffLast5'],
  teamForm10: ['recentMarginDiff', 'pointsForDiffLast10', 'pointsAgainstDiffLast10'],
  teamForm20: ['marginDiffLast20', 'pointsForDiffLast20', 'pointsAgainstDiffLast20'],
  teamFormEwmaHalfLife5: ['ewmaMarginDiffHalfLife5', 'ewmaPointsForDiffHalfLife5', 'ewmaPointsAgainstDiffHalfLife5'],
  teamFormEwmaHalfLife10: ['ewmaMarginDiffHalfLife10', 'ewmaPointsForDiffHalfLife10', 'ewmaPointsAgainstDiffHalfLife10'],
  teamSeasonToDate: ['seasonMarginDiff', 'seasonPointsForDiff', 'seasonPointsAgainstDiff'],
  homeCourtAndRest: ['homeCourt', 'restDiff'],
  leagueScoringEnvironmentAndPace: ['leagueScoringEnvironment', 'paceDiffLast10'],
  opponentAdjustedStrength: ['opponentAdjustedStrengthDiff'],
  teamEfficiency: ['eFgDiff', 'turnoverRateDiff', 'offensiveReboundRateDiff', 'freeThrowRateDiff', 'offensiveEfficiencyDiff', 'defensiveEfficiencyDiff', 'netEfficiencyDiff', 'threePointAttemptRateDiff'],
  priorSeasonNetRating: ['priorSeasonNetRatingDiff'],
  priorSeasonFourFactors: ['priorSeasonFourFactorEfgDiff', 'priorSeasonFourFactorTurnoverAdvantageDiff', 'priorSeasonFourFactorOffensiveReboundDiff', 'priorSeasonFourFactorFreeThrowRateDiff', 'priorSeasonFourFactorOpponentEfgAdvantageDiff', 'priorSeasonFourFactorForcedTurnoverDiff', 'priorSeasonFourFactorOpponentReboundAdvantageDiff', 'priorSeasonFourFactorOpponentFreeThrowAdvantageDiff'],
  priorSeasonPaceAndEfficiency: ['priorSeasonPaceMean', 'priorSeasonExpectedPointsPer100', 'priorSeasonPaceRatingExpectedTotal'],
  playerRatingAndRole: ['overallRatingDiff', 'attackRatingDiff', 'defenseRatingDiff'],
  playerScoringRate: ['pointsPer36Diff'],
  playerSixStatRates: ['reboundsPer36Diff', 'assistsPer36Diff', 'threesPer36Diff', 'turnoversPer36Diff', 'stealsPer36Diff', 'blocksPer36Diff'],
  projectedMinutesAndRotation: ['projectedMinutesDiff', 'rotationDepthDiff'],
  matchups: ['offenseDefenseMatchupDiff', 'reboundingMatchupDiff', 'rotationAttackDefenseDiff', 'roleAdjustedRatingMatchupDiff'],
  shotVolumeAndEfficiency: ['shotVolumeEfficiencyDiff'],
  fatigueAndRotation: ['teamFatigueDiff', 'priorWorkload3DaysDiff', 'priorWorkload7DaysDiff', 'gamesLast3DaysDiff', 'gamesLast7DaysDiff', 'threeInFourDiff'],
  chemistryAndLineupFit: ['chemistryDiff', 'sharedLineupExposureDiff', 'lineupContinuityDiff'],
  rotationWeightedChemistry: ['rotationChemistryDiff'],
  rotationContinuityWeightedChemistry: ['rotationContinuityChemistryDiff'],
  physicalTraits: ['heightMatchupDiff', 'wingspanMatchupDiff', 'speedMatchupDiff', 'agilityMatchupDiff', 'strengthMatchupDiff', 'verticalMatchupDiff'],
  interactionStrengthByOpponentStrength: ['strengthByOpponentStrength'],
  interactionPaceByShootingEfficiency: ['paceByShootingEfficiency'],
  interactionFourFactorsByOpponentDefense: ['fourFactorsByOpponentDefense'],
  interactionRatingByProjectedMinutes: ['ratingByProjectedMinutes'],
  interactionRatingMatchupByRole: ['ratingMatchupByRole'],
  interactionShotVolumeByEfficiency: ['shotVolumeByEfficiency'],
  interactionFatigueByMinutes: ['fatigueByMinutes'],
  interactionFatigueByRotationDepth: ['fatigueByRotationDepth'],
  interactionChemistryByExposure: ['chemistryByExposure'],
  interactionPhysicalTraitsByRole: ['physicalTraitsByRole'],
  interactionAgeByRatingTrendByWorkload: ['ageByRatingTrendByWorkload'],
});

const METRIC_ALIASES = Object.freeze({
  points: ['points', 'pts', 'score'],
  fieldGoalsMade: ['fieldGoalsMade', 'fgm'],
  fieldGoalsAttempted: ['fieldGoalsAttempted', 'fga'],
  threesMade: ['threePointersMade', 'fg3m', 'threesMade'],
  threesAttempted: ['threePointersAttempted', 'fg3a', 'threesAttempted'],
  freeThrowsAttempted: ['freeThrowsAttempted', 'fta'],
  turnovers: ['turnovers', 'tov'],
  offensiveRebounds: ['offensiveRebounds', 'orb'],
  defensiveRebounds: ['defensiveRebounds', 'drb'],
  rebounds: ['rebounds', 'reb'],
  possessions: ['possessions', 'poss'],
  minutes: ['minutes', 'teamMinutes'],
});

function finiteNumber(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = finiteNumber(source?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function stat(side, name) {
  const keys = METRIC_ALIASES[name] ?? [name];
  return firstNumber(side?.stats ?? side?.teamStats ?? side?.box ?? side, keys);
}

function dateValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getSides(game) {
  const home = game.home ?? game.homeTeam ?? {};
  const away = game.away ?? game.awayTeam ?? {};
  const homeCode = home.teamCode ?? game.homeTeamCode ?? game.homeCode ?? null;
  const awayCode = away.teamCode ?? game.awayTeamCode ?? game.awayCode ?? null;
  return {
    home: { ...home, teamCode: homeCode, stats: home.stats ?? home.teamStats ?? game.homeStats ?? {}, points: home.points ?? game.homePoints ?? null },
    away: { ...away, teamCode: awayCode, stats: away.stats ?? away.teamStats ?? game.awayStats ?? {}, points: away.points ?? game.awayPoints ?? null },
  };
}

function gameResultForTeam(game, teamCode) {
  const { home, away } = getSides(game);
  const isHome = home.teamCode === teamCode;
  const team = isHome ? home : away;
  const opponent = isHome ? away : home;
  const pointsFor = finiteNumber(team.points) ?? stat(team, 'points');
  const pointsAgainst = finiteNumber(opponent.points) ?? stat(opponent, 'points');
  if (pointsFor === null || pointsAgainst === null) return null;
  return { team, opponent, pointsFor, pointsAgainst, margin: pointsFor - pointsAgainst };
}

function mean(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function shrunk(current, prior, n, priorWeight = 10) {
  if (current === null && prior === null) return null;
  if (current === null) return prior;
  if (prior === null) return current;
  return ((n * current) + (priorWeight * prior)) / (n + priorWeight);
}

function exponentiallyWeightedMean(values, halfLife) {
  const rows = values.filter(Number.isFinite);
  if (!rows.length) return { mean: null, effectiveN: 0 };
  let weightedSum = 0;
  let weightSum = 0;
  let squaredWeightSum = 0;
  rows.forEach((value, index) => {
    const weight = 2 ** (-(rows.length - index - 1) / halfLife);
    weightedSum += weight * value;
    weightSum += weight;
    squaredWeightSum += weight * weight;
  });
  return {
    mean: weightedSum / weightSum,
    effectiveN: squaredWeightSum > 0 ? weightSum * weightSum / squaredWeightSum : 0,
  };
}

function factorsForSide(side, opponent) {
  const fga = stat(side, 'fieldGoalsAttempted');
  const fgm = stat(side, 'fieldGoalsMade');
  const fg3m = stat(side, 'threesMade');
  const fg3a = stat(side, 'threesAttempted');
  const fta = stat(side, 'freeThrowsAttempted');
  const tov = stat(side, 'turnovers');
  const orb = stat(side, 'offensiveRebounds');
  const opponentDrb = stat(opponent, 'defensiveRebounds');
  const possessions = stat(side, 'possessions');
  return {
    eFg: fga > 0 && fgm !== null && fg3m !== null ? (fgm + 0.5 * fg3m) / fga : null,
    turnoverRate: fga !== null && fta !== null && tov !== null && (fga + 0.44 * fta + tov) > 0 ? tov / (fga + 0.44 * fta + tov) : null,
    offensiveReboundRate: orb !== null && opponentDrb !== null && orb + opponentDrb > 0 ? orb / (orb + opponentDrb) : null,
    freeThrowRate: fga > 0 && fta !== null ? fta / fga : null,
    offensiveEfficiency: possessions > 0 && finiteNumber(side.points) !== null ? 100 * Number(side.points) / possessions : null,
    threePointAttemptRate: fga > 0 && fg3a !== null ? fg3a / fga : null,
  };
}

function teamHistory(historyGames, teamCode, targetTime, targetSeason, shrinkageGames = 10) {
  const eligible = historyGames
    .filter(game => {
      const time = dateValue(game.gameDate ?? game.date ?? game.gameTime);
      const season = finiteNumber(game.seasonStartYear);
      return time !== null && time < targetTime && season !== null && season <= targetSeason &&
        [getSides(game).home.teamCode, getSides(game).away.teamCode].includes(teamCode);
    })
    .sort((a, b) => dateValue(a.gameDate ?? a.date ?? a.gameTime) - dateValue(b.gameDate ?? b.date ?? b.gameTime));
  const priorSeason = eligible.filter(game => Number(game.seasonStartYear) === targetSeason - 1);
  const currentSeason = eligible.filter(game => Number(game.seasonStartYear) === targetSeason);
  const rows = currentSeason.map(game => ({ game, result: gameResultForTeam(game, teamCode) })).filter(row => row.result);
  const priorRows = priorSeason.map(game => ({ game, result: gameResultForTeam(game, teamCode) })).filter(row => row.result);
  const windowValues = count => rows.slice(-count).map(row => row.result);
  const form = {};
  const priorFor = mean(priorRows.map(row => row.result.pointsFor));
  const priorAgainst = mean(priorRows.map(row => row.result.pointsAgainst));
  const priorMargin = mean(priorRows.map(row => row.result.margin));
  for (const [name, count] of [['5', 5], ['10', 10], ['20', 20]]) {
    const values = windowValues(count);
    form[`margin${name}`] = shrunk(mean(values.map(row => row.margin)), priorMargin, values.length, shrinkageGames);
    form[`pointsFor${name}`] = shrunk(mean(values.map(row => row.pointsFor)), priorFor, values.length, shrinkageGames);
    form[`pointsAgainst${name}`] = shrunk(mean(values.map(row => row.pointsAgainst)), priorAgainst, values.length, shrinkageGames);
    form[`n${name}`] = values.length;
  }
  for (const halfLife of [5, 10]) {
    for (const [featureName, field, prior] of [
      ['margin', 'margin', priorMargin],
      ['pointsFor', 'pointsFor', priorFor],
      ['pointsAgainst', 'pointsAgainst', priorAgainst],
    ]) {
      const estimate = exponentiallyWeightedMean(rows.map(row => row.result[field]), halfLife);
      form[`ewma${halfLife}${featureName}`] = shrunk(estimate.mean, prior, estimate.effectiveN, shrinkageGames);
    }
  }
  form.seasonPointsFor = shrunk(mean(rows.map(row => row.result.pointsFor)), priorFor, rows.length, shrinkageGames);
  form.seasonPointsAgainst = shrunk(mean(rows.map(row => row.result.pointsAgainst)), priorAgainst, rows.length, shrinkageGames);
  form.seasonMargin = shrunk(mean(rows.map(row => row.result.margin)), priorMargin, rows.length, shrinkageGames);
  form.priorGames = eligible;
  form.currentRows = rows;
  return form;
}

function eloStrength(historyGames, targetTime) {
  const ratings = new Map();
  const games = historyGames.map(game => ({ game, time: dateValue(game.gameDate ?? game.date ?? game.gameTime) }))
    .filter(row => row.time !== null && row.time < targetTime)
    .sort((a, b) => a.time - b.time);
  let previousSeason = null;
  for (const { game } of games) {
    const season = Number(game.seasonStartYear);
    if (previousSeason !== null && season > previousSeason) {
      const carry = 0.75 ** (season - previousSeason);
      for (const [team, rating] of ratings) ratings.set(team, 1500 + ((rating - 1500) * carry));
    }
    previousSeason = season;
    const { home, away } = getSides(game);
    const a = home.teamCode; const b = away.teamCode;
    const homePoints = finiteNumber(home.points) ?? stat(home, 'points');
    const awayPoints = finiteNumber(away.points) ?? stat(away, 'points');
    if (!a || !b || homePoints === null || awayPoints === null) continue;
    const ra = ratings.get(a) ?? 1500; const rb = ratings.get(b) ?? 1500;
    const expected = 1 / (1 + (10 ** ((rb - ra - 65) / 400)));
    const actual = homePoints > awayPoints ? 1 : homePoints < awayPoints ? 0 : 0.5;
    const marginMultiplier = Math.log(Math.abs(homePoints - awayPoints) + 1) * (2.2 / ((Math.abs(ra - rb) * 0.001) + 2.2));
    const change = 20 * marginMultiplier * (actual - expected);
    ratings.set(a, ra + change);
    ratings.set(b, rb - change);
  }
  return ratings;
}

function teamEfficiency(history, teamCode) {
  const rows = history.currentRows;
  const perGame = rows.map(({ game }) => {
    const sides = getSides(game);
    const isHome = sides.home.teamCode === teamCode;
    return factorsForSide(isHome ? sides.home : sides.away, isHome ? sides.away : sides.home);
  });
  const opponentRows = rows.map(({ game }) => {
    const sides = getSides(game);
    const isHome = sides.home.teamCode === teamCode;
    const opponent = isHome ? sides.away : sides.home;
    const team = isHome ? sides.home : sides.away;
    return factorsForSide(opponent, team);
  });
  const average = key => mean(perGame.map(row => row[key]));
  const defense = key => mean(opponentRows.map(row => row[key]));
  const offensiveEfficiency = average('offensiveEfficiency');
  const defensiveEfficiency = defense('offensiveEfficiency');
  return {
    eFg: average('eFg'), turnoverRate: average('turnoverRate'),
    offensiveReboundRate: average('offensiveReboundRate'), freeThrowRate: average('freeThrowRate'),
    offensiveEfficiency, defensiveEfficiency,
    netEfficiency: offensiveEfficiency !== null && defensiveEfficiency !== null ? offensiveEfficiency - defensiveEfficiency : null,
    threePointAttemptRate: average('threePointAttemptRate'),
  };
}

export function summarizeProjectedRosterRatings(players = [], {
  includeUnprovenancedScenarioRatings = false,
} = {}) {
  const scenarioRatingStatuses = new Set([
    'scenario', 'custom', 'user-supplied', 'user-provided', 'generated', 'derived',
    'model-derived', 'provisional-scenario',
  ]);
  const available = players.filter(player => finiteNumber(player.projectedMinutes) !== null && Number(player.projectedMinutes) > 0);
  const resolved = available.filter(player => player.ratingSourceStatus === 'resolved' || player.ratingProvenance?.status === 'resolved');
  const resolvedSet = new Set(resolved);
  const eligible = available.filter(player => {
    if (resolvedSet.has(player)) return true;
    const hasRatingStatus = player.ratingSourceStatus !== undefined && player.ratingSourceStatus !== null;
    const hasProvenance = player.ratingProvenance !== undefined && player.ratingProvenance !== null;
    const declaredStatus = String(player.ratingSourceStatus ?? player.ratingProvenance?.status ?? '').trim().toLowerCase();
    return includeUnprovenancedScenarioRatings &&
      ((!hasRatingStatus && !hasProvenance) || scenarioRatingStatuses.has(declaredStatus));
  });
  const rotationMinutes = available.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
  const unprovenancedSet = new Set(eligible.filter(player => !resolvedSet.has(player) &&
    player.ratingSourceStatus === undefined && player.ratingProvenance === undefined));
  const weighted = field => {
    const rows = eligible.filter(player => finiteNumber(player[field]) !== null);
    const denominator = rows.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
    return {
      value: denominator ? rows.reduce((sum, player) => sum + finiteNumber(player[field]) * finiteNumber(player.projectedMinutes), 0) / denominator : null,
      playerCount: rows.length,
      projectedMinutes: denominator,
      minuteCoverage: rotationMinutes ? denominator / rotationMinutes : 0,
      scenarioPlayerCount: rows.filter(player => !resolvedSet.has(player)).length,
      unprovenancedPlayerCount: rows.filter(player => unprovenancedSet.has(player)).length,
    };
  };
  const attackRating = weighted('attackRating');
  const offenseRating = weighted('offenseRating');
  return {
    overallRating: weighted('overallRating'),
    attackRating: attackRating.value !== null ? attackRating : offenseRating,
    defenseRating: weighted('defenseRating'),
    resolvedPlayerCount: resolved.length,
    scenarioPlayerCount: eligible.filter(player => !resolvedSet.has(player)).length,
    unprovenancedPlayerCount: unprovenancedSet.size,
  };
}

function rosterSummary(players = []) {
  const available = players.filter(player => finiteNumber(player.projectedMinutes) !== null && Number(player.projectedMinutes) > 0);
  const weightSum = available.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
  const weighted = field => {
    if (!weightSum) return null;
    const rows = available.filter(player => finiteNumber(player[field]) !== null);
    const denominator = rows.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
    return denominator ? rows.reduce((sum, player) => sum + finiteNumber(player[field]) * finiteNumber(player.projectedMinutes), 0) / denominator : null;
  };
  const rosterRatings = summarizeProjectedRosterRatings(players);
  const roles = new Map();
  for (const player of available) {
    const role = String(player.role ?? player.positionGroup ?? 'unknown').toLowerCase();
    roles.set(role, (roles.get(role) ?? 0) + finiteNumber(player.projectedMinutes));
  }
  const roleShare = (role, share) => [...roles].filter(([key]) => key.includes(role)).reduce((sum, [, value]) => sum + value, 0) / (weightSum || 1) >= share;
  const chemistryRows = players.filter(player => String(player.chemistry?.identityStatus ?? '').startsWith('resolved') &&
    (finiteNumber(player.chemistry.sharedPossessions) ?? finiteNumber(player.chemistry.sharedMinutes)) > 0 && finiteNumber(player.chemistry.score) !== null);
  const chemistryExposure = chemistryRows.reduce((sum, player) => sum +
    (finiteNumber(player.chemistry.sharedPossessions) ?? finiteNumber(player.chemistry.sharedMinutes)), 0);
  const chemistryMean = chemistryExposure ? chemistryRows.reduce((sum, player) => sum +
    finiteNumber(player.chemistry.score) * (finiteNumber(player.chemistry.sharedPossessions) ?? finiteNumber(player.chemistry.sharedMinutes)), 0) / chemistryExposure : null;
  const rotationChemistryRows = available.filter(player => chemistryRows.includes(player));
  const rotationChemistryMinutes = rotationChemistryRows.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
  const rotationChemistry = rotationChemistryMinutes ? rotationChemistryRows.reduce((sum, player) =>
    sum + finiteNumber(player.chemistry.score) * finiteNumber(player.projectedMinutes), 0) / rotationChemistryMinutes : null;
  const rotationContinuityChemistry = rotationChemistryMinutes ? rotationChemistryRows.reduce((sum, player) =>
    sum + finiteNumber(player.chemistry.score) * (finiteNumber(player.lineupContinuity) ?? 0) * finiteNumber(player.projectedMinutes), 0) / rotationChemistryMinutes : null;
  const rotationChemistryCoverage = weightSum ? rotationChemistryMinutes / weightSum : null;
  const physical = field => {
    const resolved = available.filter(player => (player.physicalIdentityStatus === 'resolved' || player.physicalTraits?.identityStatus === 'resolved') && finiteNumber(player[field] ?? player.physicalTraits?.[field]) !== null);
    const denominator = resolved.reduce((sum, player) => sum + finiteNumber(player.projectedMinutes), 0);
    return denominator ? resolved.reduce((sum, player) => sum + finiteNumber(player[field] ?? player.physicalTraits?.[field]) * finiteNumber(player.projectedMinutes), 0) / denominator : null;
  };
  return {
    playerCount: available.length,
    projectedMinutes: weightSum,
    overallRating: rosterRatings.overallRating.value,
    attackRating: rosterRatings.attackRating.value,
    defenseRating: rosterRatings.defenseRating.value, pointsPer36: weighted('pointsPer36'),
    reboundsPer36: weighted('reboundsPer36'), offensiveReboundsPer36: weighted('offensiveReboundsPer36'),
    defensiveReboundsPer36: weighted('defensiveReboundsPer36'), assistsPer36: weighted('assistsPer36'),
    threesPer36: weighted('threesPer36'), turnoversPer36: weighted('turnoversPer36'),
    stealsPer36: weighted('stealsPer36'), blocksPer36: weighted('blocksPer36'),
    shotVolumePer36: weighted('fieldGoalAttemptsPer36'), shootingEfficiency: weighted('trueShootingPct') ?? weighted('effectiveFieldGoalPct'),
    fatigue: weighted('fatigueLoad'), age: weighted('age'), priorRatingTrend: weighted('priorRatingChange'),
    workload3Days: weighted('priorWorkload3Days'), workload: weighted('priorWorkload7Days'), chemistry: chemistryMean,
    rotationChemistry, rotationContinuityChemistry, rotationChemistryCoverage,
    sharedLineupExposure: chemistryRows.length ? chemistryExposure / chemistryRows.length : null,
    continuity: weighted('lineupContinuity'),
    chemistrySourceCoverage: chemistryRows.length,
    height: physical('heightInches'), wingspan: physical('wingspanInches'), speed: physical('speed'),
    agility: physical('agility'), strength: physical('strength'), vertical: physical('verticalInches'),
    ratingSourceCoverage: rosterRatings.resolvedPlayerCount,
    roleBigShare: roleShare('big', 0.35), roleGuardShare: roleShare('guard', 0.35),
  };
}

function difference(home, away) {
  return home === null || home === undefined || away === null || away === undefined ? null : Number(home) - Number(away);
}

function teamCounts(history, targetTime) {
  const times = history.priorGames.map(game => dateValue(game.gameDate ?? game.date ?? game.gameTime)).filter(Number.isFinite);
  const recentDays = days => times.filter(time => targetTime - time <= days * 86400000).length;
  const daysSinceLast = times.length ? (targetTime - Math.max(...times)) / 86400000 : null;
  return { gamesLast3Days: recentDays(3), gamesLast7Days: recentDays(7), daysSinceLast };
}

/** Build auditable pre-game feature blocks from strictly prior games and supplied roster projections. */
export function buildGameFeatureBlocks({
  target = {}, historyGames = [], homeRoster = [], awayRoster = [],
  leaguePriorScoring = null,
  priorSeasonTeamMetrics = null,
  shrinkageGames = 10,
} = {}) {
  const targetTime = dateValue(target.gameDate ?? target.date);
  const seasonStartYear = Number(target.seasonStartYear);
  if (targetTime === null || !Number.isInteger(seasonStartYear)) throw new Error('Feature builder requires a valid target game date and seasonStartYear.');
  const homeCode = target.homeTeamCode ?? target.home?.teamCode;
  const awayCode = target.awayTeamCode ?? target.away?.teamCode;
  if (!homeCode || !awayCode || homeCode === awayCode) throw new Error('Feature builder requires distinct home and away team codes.');

  const homeHistory = teamHistory(historyGames, homeCode, targetTime, seasonStartYear, shrinkageGames);
  const awayHistory = teamHistory(historyGames, awayCode, targetTime, seasonStartYear, shrinkageGames);
  const priorMetricFor = teamCode => {
    const row = priorSeasonTeamMetrics instanceof Map ? priorSeasonTeamMetrics.get(teamCode) : priorSeasonTeamMetrics?.[teamCode];
    if (!row || row.targetSeasonStartYear !== seasonStartYear || row.sourceSeasonStartYear !== seasonStartYear - 1 || row.identityStatus !== 'exact-display-name-crosswalk-candidate') return null;
    return row;
  };
  const homePriorMetric = priorMetricFor(homeCode);
  const awayPriorMetric = priorMetricFor(awayCode);
  const home = rosterSummary(homeRoster);
  const away = rosterSummary(awayRoster);
  const homeEfficiency = teamEfficiency(homeHistory, homeCode);
  const awayEfficiency = teamEfficiency(awayHistory, awayCode);
  const elo = eloStrength(historyGames, targetTime);
  const homeElo = elo.get(homeCode) ?? 1500;
  const awayElo = elo.get(awayCode) ?? 1500;
  const homeCounts = teamCounts(homeHistory, targetTime);
  const awayCounts = teamCounts(awayHistory, targetTime);
  const allPriorGames = historyGames.filter(game => {
    const time = dateValue(game.gameDate ?? game.date ?? game.gameTime);
    return time !== null && time < targetTime;
  });
  const scoringForGames = games => games.flatMap(game => {
    const sides = getSides(game);
    return [finiteNumber(sides.home.points) ?? stat(sides.home, 'points'), finiteNumber(sides.away.points) ?? stat(sides.away, 'points')];
  }).filter(Number.isFinite);
  const currentSeasonScores = scoringForGames(allPriorGames.filter(game => Number(game.seasonStartYear) === seasonStartYear));
  const priorSeasonScores = scoringForGames(allPriorGames.filter(game => Number(game.seasonStartYear) === seasonStartYear - 1));
  const leagueEnvironment = currentSeasonScores.length
    ? shrunk(mean(currentSeasonScores), mean(priorSeasonScores), currentSeasonScores.length, 50)
    : mean(priorSeasonScores) ?? finiteNumber(leaguePriorScoring);
  const homePace = mean(homeHistory.currentRows.slice(-10).map(({ game }) => {
    const sides = getSides(game); return stat(sides.home.teamCode === homeCode ? sides.home : sides.away, 'possessions');
  }));
  const awayPace = mean(awayHistory.currentRows.slice(-10).map(({ game }) => {
    const sides = getSides(game); return stat(sides.home.teamCode === awayCode ? sides.home : sides.away, 'possessions');
  }));
  const homeRest = homeCounts.daysSinceLast === null ? null : Math.min(7, Math.max(0, homeCounts.daysSinceLast - 1));
  const awayRest = awayCounts.daysSinceLast === null ? null : Math.min(7, Math.max(0, awayCounts.daysSinceLast - 1));
  const homeFatigue = home.workload ?? (homeCounts.gamesLast7Days * 1.25);
  const awayFatigue = away.workload ?? (awayCounts.gamesLast7Days * 1.25);
  const priorStats = homePriorMetric && awayPriorMetric ? (() => {
    const hf = homePriorMetric.fourFactors; const af = awayPriorMetric.fourFactors;
    const ha = homePriorMetric.advanced; const aa = awayPriorMetric.advanced;
    const paceMean = (ha.PACE + aa.PACE) / 2;
    const expectedPointsPer100 = ((ha.OFF_RATING + aa.DEF_RATING) + (aa.OFF_RATING + ha.DEF_RATING)) / 2;
    return {
      priorSeasonNetRatingDiff: ha.NET_RATING - aa.NET_RATING,
      priorSeasonFourFactorEfgDiff: hf.EFG_PCT - af.EFG_PCT,
      priorSeasonFourFactorTurnoverAdvantageDiff: af.TM_TOV_PCT - hf.TM_TOV_PCT,
      priorSeasonFourFactorOffensiveReboundDiff: hf.OREB_PCT - af.OREB_PCT,
      priorSeasonFourFactorFreeThrowRateDiff: hf.FTA_RATE - af.FTA_RATE,
      priorSeasonFourFactorOpponentEfgAdvantageDiff: af.OPP_EFG_PCT - hf.OPP_EFG_PCT,
      priorSeasonFourFactorForcedTurnoverDiff: hf.OPP_TOV_PCT - af.OPP_TOV_PCT,
      priorSeasonFourFactorOpponentReboundAdvantageDiff: af.OPP_OREB_PCT - hf.OPP_OREB_PCT,
      priorSeasonFourFactorOpponentFreeThrowAdvantageDiff: af.OPP_FTA_RATE - hf.OPP_FTA_RATE,
      priorSeasonPaceMean: paceMean,
      priorSeasonExpectedPointsPer100: expectedPointsPer100,
      priorSeasonPaceRatingExpectedTotal: paceMean * expectedPointsPer100 / 100,
    };
  })() : {};

  const homeForm = { ...homeHistory };
  const awayForm = { ...awayHistory };
  const attackMatchup = difference(home.attackRating, away.defenseRating);
  const reverseAttackMatchup = difference(away.attackRating, home.defenseRating);
  const offenseDefenseMatchup = attackMatchup === null || reverseAttackMatchup === null ? null : attackMatchup - reverseAttackMatchup;
  const features = {
    homeCourt: 1,
    marginDiffLast5: difference(homeForm.margin5, awayForm.margin5),
    recentMarginDiff: difference(homeForm.margin10, awayForm.margin10),
    marginDiffLast20: difference(homeForm.margin20, awayForm.margin20),
    ewmaMarginDiffHalfLife5: difference(homeForm.ewma5margin, awayForm.ewma5margin),
    ewmaMarginDiffHalfLife10: difference(homeForm.ewma10margin, awayForm.ewma10margin),
    pointsForDiffLast5: difference(homeForm.pointsFor5, awayForm.pointsFor5),
    pointsForDiffLast10: difference(homeForm.pointsFor10, awayForm.pointsFor10),
    pointsForDiffLast20: difference(homeForm.pointsFor20, awayForm.pointsFor20),
    ewmaPointsForDiffHalfLife5: difference(homeForm.ewma5pointsFor, awayForm.ewma5pointsFor),
    ewmaPointsForDiffHalfLife10: difference(homeForm.ewma10pointsFor, awayForm.ewma10pointsFor),
    pointsAgainstDiffLast5: difference(awayForm.pointsAgainst5, homeForm.pointsAgainst5),
    pointsAgainstDiffLast20: difference(awayForm.pointsAgainst20, homeForm.pointsAgainst20),
    ewmaPointsAgainstDiffHalfLife5: difference(awayForm.ewma5pointsAgainst, homeForm.ewma5pointsAgainst),
    ewmaPointsAgainstDiffHalfLife10: difference(awayForm.ewma10pointsAgainst, homeForm.ewma10pointsAgainst),
    seasonMarginDiff: difference(homeForm.seasonMargin, awayForm.seasonMargin),
    seasonPointsForDiff: difference(homeForm.seasonPointsFor, awayForm.seasonPointsFor),
    pointsAgainstDiffLast10: difference(awayForm.pointsAgainst10, homeForm.pointsAgainst10),
    seasonPointsAgainstDiff: difference(awayForm.seasonPointsAgainst, homeForm.seasonPointsAgainst),
    restDiff: difference(homeRest, awayRest),
    leagueScoringEnvironment: leagueEnvironment,
    paceDiffLast10: difference(homePace, awayPace),
    opponentAdjustedStrengthDiff: (homeElo - awayElo) / 25,
    gamesLast3DaysDiff: homeCounts.gamesLast3Days - awayCounts.gamesLast3Days,
    gamesLast7DaysDiff: homeCounts.gamesLast7Days - awayCounts.gamesLast7Days,
    threeInFourDiff: Number(homeCounts.gamesLast3Days >= 3) - Number(awayCounts.gamesLast3Days >= 3),
    eFgDiff: difference(homeEfficiency.eFg, awayEfficiency.eFg),
    turnoverRateDiff: difference(awayEfficiency.turnoverRate, homeEfficiency.turnoverRate),
    offensiveReboundRateDiff: difference(homeEfficiency.offensiveReboundRate, awayEfficiency.offensiveReboundRate),
    freeThrowRateDiff: difference(homeEfficiency.freeThrowRate, awayEfficiency.freeThrowRate),
    offensiveEfficiencyDiff: difference(homeEfficiency.offensiveEfficiency, awayEfficiency.offensiveEfficiency),
    defensiveEfficiencyDiff: difference(awayEfficiency.defensiveEfficiency, homeEfficiency.defensiveEfficiency),
    netEfficiencyDiff: difference(homeEfficiency.netEfficiency, awayEfficiency.netEfficiency),
    threePointAttemptRateDiff: difference(homeEfficiency.threePointAttemptRate, awayEfficiency.threePointAttemptRate),
    ...Object.fromEntries([
      'priorSeasonNetRatingDiff', 'priorSeasonFourFactorEfgDiff', 'priorSeasonFourFactorTurnoverAdvantageDiff',
      'priorSeasonFourFactorOffensiveReboundDiff', 'priorSeasonFourFactorFreeThrowRateDiff',
      'priorSeasonFourFactorOpponentEfgAdvantageDiff', 'priorSeasonFourFactorForcedTurnoverDiff',
      'priorSeasonFourFactorOpponentReboundAdvantageDiff', 'priorSeasonFourFactorOpponentFreeThrowAdvantageDiff',
      'priorSeasonPaceMean', 'priorSeasonExpectedPointsPer100', 'priorSeasonPaceRatingExpectedTotal',
    ].map(key => [key, Number.isFinite(priorStats[key]) ? priorStats[key] : null])),
    overallRatingDiff: difference(home.overallRating, away.overallRating),
    attackRatingDiff: difference(home.attackRating, away.attackRating),
    defenseRatingDiff: difference(home.defenseRating, away.defenseRating),
    projectedMinutesDiff: difference(home.projectedMinutes, away.projectedMinutes),
    pointsPer36Diff: difference(home.pointsPer36, away.pointsPer36),
    reboundsPer36Diff: difference(home.reboundsPer36, away.reboundsPer36),
    assistsPer36Diff: difference(home.assistsPer36, away.assistsPer36),
    threesPer36Diff: difference(home.threesPer36, away.threesPer36),
    turnoversPer36Diff: difference(away.turnoversPer36, home.turnoversPer36),
    stealsPer36Diff: difference(home.stealsPer36, away.stealsPer36),
    blocksPer36Diff: difference(home.blocksPer36, away.blocksPer36),
    offenseDefenseMatchupDiff: offenseDefenseMatchup,
    reboundingMatchupDiff: home.offensiveReboundsPer36 === null || away.defensiveReboundsPer36 === null || away.offensiveReboundsPer36 === null || home.defensiveReboundsPer36 === null ? null : home.offensiveReboundsPer36 - away.defensiveReboundsPer36 - away.offensiveReboundsPer36 + home.defensiveReboundsPer36,
    rotationAttackDefenseDiff: difference(home.attackRating, away.defenseRating),
    roleAdjustedRatingMatchupDiff: home.overallRating === null || away.overallRating === null ? null : (home.overallRating - away.overallRating) * ((home.roleBigShare || home.roleGuardShare) ? 1 : 0.75),
    shotVolumeEfficiencyDiff: home.shotVolumePer36 === null || home.shootingEfficiency === null || away.shotVolumePer36 === null || away.shootingEfficiency === null ? null : home.shotVolumePer36 * home.shootingEfficiency - away.shotVolumePer36 * away.shootingEfficiency,
    teamFatigueDiff: difference(homeFatigue, awayFatigue),
    rotationDepthDiff: home.playerCount - away.playerCount,
    priorWorkload3DaysDiff: difference(home.workload3Days, away.workload3Days),
    priorWorkload7DaysDiff: difference(home.workload, away.workload),
    chemistryDiff: difference(home.chemistry, away.chemistry),
    sharedLineupExposureDiff: difference(home.sharedLineupExposure, away.sharedLineupExposure),
    lineupContinuityDiff: difference(home.continuity, away.continuity),
    rotationChemistryDiff: difference(home.rotationChemistry, away.rotationChemistry),
    rotationContinuityChemistryDiff: difference(home.rotationContinuityChemistry, away.rotationContinuityChemistry),
    heightMatchupDiff: difference(home.height, away.height),
    wingspanMatchupDiff: difference(home.wingspan, away.wingspan),
    speedMatchupDiff: difference(home.speed, away.speed),
    agilityMatchupDiff: difference(home.agility, away.agility),
    strengthMatchupDiff: difference(home.strength, away.strength),
    verticalMatchupDiff: difference(home.vertical, away.vertical),
  };

  features.strengthByOpponentStrength = features.opponentAdjustedStrengthDiff === null ? null : features.opponentAdjustedStrengthDiff * ((homeElo + awayElo - 3000) / 400);
  features.paceByShootingEfficiency = features.paceDiffLast10 === null || home.shootingEfficiency === null || away.shootingEfficiency === null ? null : features.paceDiffLast10 * (home.shootingEfficiency - away.shootingEfficiency);
  features.fourFactorsByOpponentDefense = [features.eFgDiff, features.turnoverRateDiff, features.offensiveReboundRateDiff, features.freeThrowRateDiff, features.defensiveEfficiencyDiff].some(value => value === null) ? null : features.eFgDiff - features.turnoverRateDiff + features.offensiveReboundRateDiff + features.freeThrowRateDiff - features.defensiveEfficiencyDiff;
  features.ratingByProjectedMinutes = features.overallRatingDiff === null || features.projectedMinutesDiff === null ? null : features.overallRatingDiff * (features.projectedMinutesDiff / 48);
  features.ratingMatchupByRole = features.roleAdjustedRatingMatchupDiff === null ? null : features.roleAdjustedRatingMatchupDiff * Number(Boolean(home.roleBigShare || home.roleGuardShare || away.roleBigShare || away.roleGuardShare));
  features.shotVolumeByEfficiency = features.shotVolumeEfficiencyDiff;
  features.fatigueByMinutes = features.teamFatigueDiff === null || features.projectedMinutesDiff === null ? null : features.teamFatigueDiff * (features.projectedMinutesDiff / 48);
  features.fatigueByRotationDepth = features.teamFatigueDiff === null ? null : features.teamFatigueDiff * (home.playerCount - away.playerCount);
  features.chemistryByExposure = features.chemistryDiff === null ? null : features.chemistryDiff * Math.log1p(Math.max(0, home.sharedLineupExposure + away.sharedLineupExposure));
  features.physicalTraitsByRole = features.wingspanMatchupDiff === null ? null : features.wingspanMatchupDiff * Number(Boolean(home.roleBigShare || away.roleBigShare));
  features.ageByRatingTrendByWorkload = home.age === null || away.age === null || home.priorRatingTrend === null || away.priorRatingTrend === null || home.workload === null || away.workload === null ? null : (home.age - away.age) * (home.priorRatingTrend - away.priorRatingTrend) * (home.workload + away.workload);

  const available = Object.fromEntries(Object.entries(features).map(([key, value]) => [key, Number.isFinite(value)]));
  const ratingFeatureNames = new Set(['overallRatingDiff', 'attackRatingDiff', 'defenseRatingDiff', 'offenseDefenseMatchupDiff', 'roleAdjustedRatingMatchupDiff', 'ratingByProjectedMinutes', 'ratingMatchupByRole']);
  const physicalFeatureNames = new Set(['heightMatchupDiff', 'wingspanMatchupDiff', 'speedMatchupDiff', 'agilityMatchupDiff', 'strengthMatchupDiff', 'verticalMatchupDiff', 'physicalTraitsByRole']);
  const chemistryFeatureNames = new Set(['chemistryDiff', 'sharedLineupExposureDiff', 'lineupContinuityDiff', 'rotationChemistryDiff', 'rotationContinuityChemistryDiff', 'chemistryByExposure']);
  const sourceStatus = Object.fromEntries(Object.keys(features).map(key => [key,
    !available[key] ? 'unknown-or-insufficient-history' : key.startsWith('priorSeason') ? 'prior-completed-season-exact-display-name-crosswalk-candidate' : ratingFeatureNames.has(key) && home.ratingSourceCoverage + away.ratingSourceCoverage === 0 ? 'rating-source-unresolved' : physicalFeatureNames.has(key) ? 'resolved-player-season-physical-inputs-only' : chemistryFeatureNames.has(key) ? 'lagged-exact-five-prior-season-v4-descriptive-source-candidate' : key === 'leagueScoringEnvironment' ? 'observed-prior-games' : 'derived-from-prior-games-or-supplied-roster-projection']));
  const priorGamesUsed = [...new Set([...homeHistory.priorGames, ...awayHistory.priorGames])].length;
  return {
    format: 'djhc-game-feature-blocks-v1',
    target: { gameDate: target.gameDate ?? target.date, seasonStartYear, homeTeamCode: homeCode, awayTeamCode: awayCode },
    temporalBoundary: 'Only games with gameDate strictly earlier than target gameDate are used. Same-date rows are excluded.',
    modelUse: 'feature-generation-candidate-not-fitted-or-selected; these features must pass chronological ablation before prediction use',
    blocks: Object.fromEntries(Object.entries(FEATURE_BLOCKS).map(([block, names]) => [block, names.map(name => ({ name, value: Number.isFinite(features[name]) ? features[name] : null, available: available[name], sourceStatus: sourceStatus[name] }))])),
    features,
    availability: available,
    sourceStatus,
    sampleSupport: {
      homePriorGames: homeHistory.priorGames.length,
      awayPriorGames: awayHistory.priorGames.length,
      targetDateGamesExcluded: historyGames.filter(game => dateValue(game.gameDate ?? game.date ?? game.gameTime) === targetTime).length,
      homeTeamPriorGameCount: homeHistory.currentRows.length,
      awayTeamPriorGameCount: awayHistory.currentRows.length,
      uniquePriorGameCount: priorGamesUsed,
      homeRatingResolvedPlayers: home.ratingSourceCoverage,
      awayRatingResolvedPlayers: away.ratingSourceCoverage,
      homeChemistryResolvedPlayers: home.chemistrySourceCoverage,
      awayChemistryResolvedPlayers: away.chemistrySourceCoverage,
      priorSeasonTeamMetricsMatched: Number(Boolean(homePriorMetric)) + Number(Boolean(awayPriorMetric)),
    },
    assumptions: [
      `Rate windows shrink toward available prior-season evidence with ${shrinkageGames} prior-game weight; no synthetic observations are created.`,
      'Elo-like opponent strength is an experimental score-margin rating, not an independently validated team-strength model.',
      'Provisional or unresolved player, combine, chemistry, and availability inputs are expected to remain marked upstream; their metadata is not upgraded here.',
      'Exact-five chemistry may enter only as a strictly lagged prior-season development candidate; the source package still classifies these season aggregates as descriptive-only and has no asOf date.',
      'NBA Stats team factors are eligible only from a complete prior season with exact display-name crosswalk coverage; source rows are still explicitly labeled as candidate evidence.',
    ],
  };
}

export function getGameFeatureBlockDefinitions() {
  return structuredClone(FEATURE_BLOCKS);
}

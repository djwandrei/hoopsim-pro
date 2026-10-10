import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const SEASON_AWARDS_FORMAT = 'djhc-season-awards-simulation-v1';

const NBA_CBA_2023_SOURCE = 'https://imgix.cosmicjs.com/25da5eb0-15eb-11ee-b5b3-fbd321202bdf-Final-2023-NBA-Collective-Bargaining-Agreement-6-28-23.pdf';
const CBA_COVERED_AWARDS = Object.freeze([
  'NBA Most Valuable Player',
  'NBA Defensive Player of the Year',
  'NBA Most Improved Player',
  'All-NBA First Team',
  'All-NBA Second Team',
  'All-NBA Third Team',
  'NBA All-Defensive First Team',
  'NBA All-Defensive Second Team',
]);

const MAJOR_AWARD_WEIGHTS = Object.freeze([
  ['pointsPerGame', 0.24], ['assistsPerGame', 0.14], ['reboundsPerGame', 0.09],
  ['trueShootingPct', 0.10], ['threesPerGame', 0.04], ['stealsPerGame', 0.03],
  ['blocksPerGame', 0.03], ['gamesPlayed', 0.08], ['playerWinPct', 0.12],
  ['overallRating', 0.11], ['turnoversPerGame', -0.02],
]);

const DEFENSIVE_AWARD_WEIGHTS = Object.freeze([
  ['stealsPerGame', 0.17], ['blocksPerGame', 0.20], ['defensiveReboundsPerGame', 0.14],
  ['teamPointsAllowedPerGame', -0.10], ['playerWinPct', 0.07], ['defenseDomain', 0.20],
  ['overallRating', 0.05], ['gamesPlayed', 0.07],
]);

const ALL_ROOKIE_WEIGHTS = Object.freeze([
  ['pointsPerGame', 0.22], ['assistsPerGame', 0.12], ['reboundsPerGame', 0.10],
  ['trueShootingPct', 0.10], ['threesPerGame', 0.06], ['stealsPerGame', 0.05],
  ['blocksPerGame', 0.05], ['gamesPlayed', 0.10], ['playerWinPct', 0.10],
  ['overallRating', 0.08], ['turnoversPerGame', -0.02],
]);

const TWO_TEAM_BALLOT_SOURCES = Object.freeze({
  allDefensive: 'https://pr.nba.com/2025-26-kia-nba-all-defensive-team/',
  allRookie: 'https://pr.nba.com/2025-26-kia-nba-all-rookie-team/',
});

const ALL_STAR_VOTER_WEIGHTS = Object.freeze({
  fans: Object.freeze([
    ['pointsPerGame', 0.26], ['assistsPerGame', 0.13], ['reboundsPerGame', 0.09],
    ['threesPerGame', 0.10], ['overallRating', 0.12], ['playerWinPct', 0.10], ['mvpScore', 0.20],
  ]),
  players: Object.freeze([
    ['overallRating', 0.17], ['defenseDomain', 0.15], ['assistsPerGame', 0.14],
    ['reboundsPerGame', 0.12], ['stealsPerGame', 0.10], ['blocksPerGame', 0.10],
    ['trueShootingPct', 0.12], ['gamesPlayed', 0.10],
  ]),
  media: Object.freeze([
    ['mvpScore', 0.20], ['pointsPerGame', 0.16], ['assistsPerGame', 0.12],
    ['reboundsPerGame', 0.10], ['trueShootingPct', 0.12], ['gamesPlayed', 0.10],
    ['playerWinPct', 0.10], ['defenseDomain', 0.10],
  ]),
  coaches: Object.freeze([
    ['overallRating', 0.18], ['defenseDomain', 0.16], ['mvpScore', 0.18],
    ['pointsPerGame', 0.14], ['assistsPerGame', 0.10], ['reboundsPerGame', 0.10],
    ['playerWinPct', 0.08], ['minutesPerGame', 0.06],
  ]),
});

const STAT_ALIASES = Object.freeze({
  points: ['points', 'pts'],
  rebounds: ['rebounds', 'reb'],
  assists: ['assists', 'ast'],
  threePointersMade: ['threePointersMade', 'threesMade', 'fg3m', 'threes'],
  turnovers: ['turnovers', 'tov'],
  steals: ['steals', 'stl'],
  blocks: ['blocks', 'blk'],
  minutes: ['minutes', 'min'],
  fieldGoalsMade: ['fieldGoalsMade', 'fgm'],
  fieldGoalsAttempted: ['fieldGoalsAttempted', 'fieldGoalAttempts', 'fga'],
  freeThrowsAttempted: ['freeThrowsAttempted', 'freeThrowAttempts', 'fta'],
  defensiveRebounds: ['defensiveRebounds', 'defensiveReboundsTotal', 'drb'],
});

function finite(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueFrom(source, aliases) {
  for (const key of aliases) {
    const result = finite(source?.[key]);
    if (result !== null) return result;
  }
  return null;
}

function seasonRows(state, seasonStartYear) {
  return (state.playerGameLogs ?? []).filter(row => Number(row.seasonStartYear) === seasonStartYear);
}

function teamRows(state, seasonStartYear) {
  return (state.completedGames ?? []).filter(row => Number(row.seasonStartYear) === seasonStartYear);
}

function playerLogIndex(state, seasonStartYear) {
  const byName = new Map();
  for (const row of seasonRows(state, seasonStartYear)) {
    const key = normalizeCanonicalPlayerName(row.canonicalName);
    if (!key) continue;
    const rows = byName.get(key) ?? [];
    rows.push(row);
    byName.set(key, rows);
  }
  return byName;
}

function teamGameIndex(state, seasonStartYear) {
  const rows = new Map();
  for (const game of teamRows(state, seasonStartYear)) rows.set(String(game.gameId), game);
  return rows;
}

function addTotals(logs, bucket, expectedGameRows) {
  const totals = {};
  const fieldCoverage = {};
  for (const [field, aliases] of Object.entries(STAT_ALIASES)) {
    const values = logs.map(row => valueFrom(row.stats, aliases));
    const observedGameRows = values.filter(value => value !== null).length;
    const aggregateValue = valueFrom(bucket, aliases);
    const completeGameLog = logs.length === expectedGameRows && observedGameRows === expectedGameRows;
    let sourcePath = null;
    let status;
    if (completeGameLog) {
      totals[field] = values.reduce((sum, value) => sum + value, 0);
      sourcePath = 'LeagueState.playerGameLogs[].stats';
      status = 'complete-game-log';
    } else if (aggregateValue !== null) {
      // A season aggregate can rescue a partial box-score log, but does not prove
      // that the missing game-level fields were observed. Preserve that gap.
      totals[field] = aggregateValue;
      sourcePath = 'LeagueState.players[].seasonStatsByYear';
      status = logs.length ? 'aggregate-fallback-game-log-incomplete' : 'aggregate-only-game-logs-unavailable';
    } else {
      totals[field] = null;
      sourcePath = logs.length ? 'LeagueState.playerGameLogs[].stats' : null;
      status = 'unresolved-stat-field-coverage';
    }
    fieldCoverage[field] = {
      status,
      complete: completeGameLog,
      sourcePath,
      expectedGameRows,
      loggedGameRows: logs.length,
      observedGameRows,
      aggregateFallbackUsed: !completeGameLog && aggregateValue !== null,
    };
  }
  return { totals, fieldCoverage };
}

function seasonTeamDefenseContext(state, player, logs, seasonStartYear, expectedGameRows) {
  const appearancesByTeam = new Map();
  let unresolvedTeamRows = 0;
  for (const row of logs) {
    const teamCode = String(row.teamCode ?? '').trim().toUpperCase();
    if (!teamCode) {
      unresolvedTeamRows += 1;
      continue;
    }
    appearancesByTeam.set(teamCode, (appearancesByTeam.get(teamCode) ?? 0) + 1);
  }
  if (!logs.length) {
    const teamCode = String(player.teamCode ?? '').trim().toUpperCase();
    if (teamCode) appearancesByTeam.set(teamCode, expectedGameRows || 1);
  }
  const teamRows = [...appearancesByTeam.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([teamCode, playerAppearances]) => {
    const team = state.teams.find(row => String(row.teamCode ?? '').trim().toUpperCase() === teamCode) ?? null;
    const record = team?.seasonStatsByYear?.[String(seasonStartYear)] ?? null;
    const teamGames = finite(record?.gamesPlayed);
    const pointsAgainst = finite(record?.pointsAgainst);
    return {
      teamCode,
      playerAppearances,
      teamGamesPlayed: teamGames,
      pointsAgainst,
      pointsAllowedPerGame: teamGames > 0 && pointsAgainst !== null ? pointsAgainst / teamGames : null,
      sourcePath: `LeagueState.teams[${teamCode}].seasonStatsByYear.${seasonStartYear}`,
      complete: Boolean(team && teamGames > 0 && pointsAgainst !== null),
    };
  });
  const totalAppearances = teamRows.reduce((sum, row) => sum + row.playerAppearances, 0);
  const complete = logs.length > 0 && unresolvedTeamRows === 0 && totalAppearances === expectedGameRows
    && teamRows.length > 0 && teamRows.every(row => row.complete);
  const pointsAllowedPerGame = complete
    ? teamRows.reduce((sum, row) => sum + row.pointsAllowedPerGame * row.playerAppearances, 0) / totalAppearances
    : null;
  return {
    pointsAllowedPerGame,
    coverage: {
      status: complete ? 'complete-player-season-team-exposures' : 'unresolved-team-season-defense-context',
      complete,
      sourcePath: 'LeagueState.teams[].seasonStatsByYear',
      expectedPlayerAppearances: expectedGameRows,
      resolvedPlayerAppearances: totalAppearances,
      unresolvedTeamRows,
      teams: teamRows,
    },
  };
}

function winRateForPlayer(playerLogs, gamesById, fallbackTeam, seasonStartYear) {
  let wins = 0;
  let games = 0;
  for (const row of playerLogs) {
    const game = gamesById.get(String(row.gameId));
    if (!game || game.homeWin === null || game.homeWin === undefined) continue;
    const teamCode = String(row.teamCode ?? '').toUpperCase();
    const won = teamCode === String(game.homeTeamCode).toUpperCase()
      ? game.homeWin === true
      : teamCode === String(game.awayTeamCode).toUpperCase()
        ? game.homeWin === false
        : null;
    if (won === null) continue;
    games += 1;
    wins += Number(won);
  }
  if (games) return {
    value: wins / games,
    coverage: {
      status: games === playerLogs.length ? 'complete-player-game-results' : 'partial-player-game-results',
      complete: games === playerLogs.length && playerLogs.length > 0,
      sourcePath: 'LeagueState.completedGames',
      expectedPlayerGames: playerLogs.length,
      resolvedPlayerGames: games,
    },
  };
  const record = fallbackTeam?.seasonStatsByYear?.[String(seasonStartYear)];
  const teamGames = finite(record?.gamesPlayed) ?? 0;
  return {
    value: teamGames > 0 ? (finite(record?.wins) ?? 0) / teamGames : null,
    coverage: {
      status: teamGames > 0 ? 'team-season-record-fallback' : 'unresolved-player-win-rate',
      complete: false,
      sourcePath: teamGames > 0 ? 'LeagueState.teams[].seasonStatsByYear' : null,
      expectedPlayerGames: playerLogs.length,
      resolvedPlayerGames: 0,
    },
  };
}

function conferenceForPlayer(player, team) {
  const evidence = [player.allStarConference, player.conference, team?.conference, team?.conferenceCode]
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
    .map(value => {
      const raw = String(value).trim().toLowerCase();
      if (['east', 'eastern', 'e'].includes(raw)) return 'East';
      if (['west', 'western', 'w'].includes(raw)) return 'West';
      return null;
    });
  if (!evidence.length || evidence.some(value => value === null)) return null;
  const distinct = [...new Set(evidence)];
  return distinct.length === 1 ? distinct[0] : null;
}

function positionGroupsForPlayer(player) {
  const raw = player.positionGroups ?? player.positionGroup ?? player.position ?? player.positions ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  const values = list.map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean);
  const groups = new Set();
  for (const value of values) {
    if (['g', 'pg', 'sg', 'guard', 'guards', 'point guard', 'shooting guard'].includes(value)) groups.add('guard');
    if (['f', 'pf', 'sf', 'forward', 'forwards', 'small forward', 'power forward'].includes(value)) {
      groups.add('forward');
      groups.add('frontcourt');
    }
    if (['c', 'center', 'centre'].includes(value)) {
      groups.add('center');
      groups.add('frontcourt');
    }
    if (['frontcourt', 'front court'].includes(value)) groups.add('frontcourt');
  }
  return [...groups];
}

function buildCandidate(state, player, logs, gamesById, seasonStartYear) {
  const bucket = player.seasonStatsByYear?.[String(seasonStartYear)] ?? {};
  const explicitGames = finite(bucket.gamesPlayed);
  const gamesPlayed = explicitGames !== null && explicitGames > 0 ? explicitGames : logs.length;
  const { totals, fieldCoverage } = addTotals(logs, bucket, gamesPlayed);
  const logMinutes = logs.map(row => valueFrom(row.stats, STAT_ALIASES.minutes)).filter(value => value !== null);
  const metric = key => totals[key] === null || gamesPlayed <= 0 ? null : totals[key] / gamesPlayed;
  const denominator = totals.fieldGoalsAttempted === null || totals.freeThrowsAttempted === null
    ? null
    : 2 * (totals.fieldGoalsAttempted + 0.44 * totals.freeThrowsAttempted);
  const trueShootingPct = denominator > 0 && totals.points !== null ? totals.points / denominator : null;
  const teamContext = seasonTeamDefenseContext(state, player, logs, seasonStartYear, gamesPlayed);
  const fallbackTeamCode = String(logs.at(-1)?.teamCode ?? player.teamCode ?? '').toUpperCase();
  const fallbackTeam = state.teams.find(team => String(team.teamCode ?? '').toUpperCase() === fallbackTeamCode) ?? null;
  const playerWinEvidence = winRateForPlayer(logs, gamesById, fallbackTeam, seasonStartYear);
  const minutesTotal = totals.minutes;
  const metricCoverage = {};
  const fieldForMetric = {
    pointsPerGame: ['points'], reboundsPerGame: ['rebounds'], assistsPerGame: ['assists'],
    threesPerGame: ['threePointersMade'], turnoversPerGame: ['turnovers'], stealsPerGame: ['steals'],
    blocksPerGame: ['blocks'], defensiveReboundsPerGame: ['defensiveRebounds'], minutesPerGame: ['minutes'],
    trueShootingPct: ['points', 'fieldGoalsAttempted', 'freeThrowsAttempted'],
  };
  for (const [metricName, fields] of Object.entries(fieldForMetric)) {
    const rows = fields.map(field => fieldCoverage[field]);
    const complete = rows.every(row => row?.complete === true);
    metricCoverage[metricName] = {
      status: complete ? 'complete-game-log' : 'incomplete-source-coverage',
      complete,
      sourcePath: [...new Set(rows.map(row => row?.sourcePath).filter(Boolean))],
      sourceFields: fields,
      fields: structuredClone(Object.fromEntries(fields.map(field => [field, fieldCoverage[field]]))),
    };
  }
  metricCoverage.gamesPlayed = {
    status: explicitGames !== null && explicitGames > 0 ? 'season-aggregate-games-played-present' : 'game-log-count',
    complete: explicitGames !== null && explicitGames > 0 || logs.length > 0,
    sourcePath: explicitGames !== null && explicitGames > 0 ? 'LeagueState.players[].seasonStatsByYear.gamesPlayed' : 'LeagueState.playerGameLogs[]',
  };
  metricCoverage.playerWinPct = playerWinEvidence.coverage;
  metricCoverage.teamPointsAllowedPerGame = teamContext.coverage;
  const overallRating = finite(player.overallRating ?? player.rating ?? player.overall);
  metricCoverage.overallRating = {
    status: overallRating === null ? 'missing-rating-input' : 'rating-input-present',
    complete: overallRating !== null,
    sourcePath: overallRating === null ? null : 'LeagueState.players[].overallRating|rating|overall',
    sourceRef: player.overallRatingSource ?? player.ratingSource ?? null,
  };
  const defenseDomain = finite(player.defenseDomain ?? player.defenseRating ?? player.defensiveRating);
  metricCoverage.defenseDomain = {
    status: defenseDomain === null ? 'missing-defense-rating-input' : 'defense-rating-input-present',
    complete: defenseDomain !== null,
    sourcePath: defenseDomain === null ? null : 'LeagueState.players[].defenseDomain|defenseRating|defensiveRating',
    sourceRef: player.defenseDomainSource ?? player.defenseRatingSource ?? null,
  };
  const candidate = {
    canonicalName: player.canonicalName,
    teamCode: String(player.teamCode ?? fallbackTeam?.teamCode ?? '').toUpperCase() || null,
    conference: conferenceForPlayer(player, fallbackTeam),
    positionGroups: positionGroupsForPlayer(player),
    gamesPlayed,
    metrics: {
      gamesPlayed,
      pointsPerGame: metric('points'),
      reboundsPerGame: metric('rebounds'),
      assistsPerGame: metric('assists'),
      threesPerGame: metric('threePointersMade'),
      turnoversPerGame: metric('turnovers'),
      stealsPerGame: metric('steals'),
      blocksPerGame: metric('blocks'),
      defensiveReboundsPerGame: metric('defensiveRebounds'),
      minutesPerGame: minutesTotal === null || gamesPlayed <= 0 ? null : minutesTotal / gamesPlayed,
      trueShootingPct,
      playerWinPct: playerWinEvidence.value,
      teamPointsAllowedPerGame: teamContext.pointsAllowedPerGame,
      overallRating,
      defenseDomain,
    },
    fieldCoverage,
    metricCoverage,
    teamDefenseContext: teamContext.coverage,
    _logs: logs,
  };
  return candidate;
}

function makeRandom(seed) {
  let value = Number(seed) >>> 0;
  if (!value) value = 0x9e3779b9;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileLookup(candidates, metricKey, direction) {
  const valid = candidates
    .filter(candidate => finite(candidate.metrics?.[metricKey]) !== null)
    .map(candidate => ({ key: normalizeCanonicalPlayerName(candidate.canonicalName), value: direction < 0 ? -Number(candidate.metrics[metricKey]) : Number(candidate.metrics[metricKey]) }))
    .sort((left, right) => left.value - right.value || left.key.localeCompare(right.key));
  const result = new Map();
  for (let index = 0; index < valid.length;) {
    let end = index + 1;
    while (end < valid.length && valid[end].value === valid[index].value) end += 1;
    const percentile = valid.length <= 1 ? 0.5 : ((index + end - 1) / 2) / (valid.length - 1);
    for (let position = index; position < end; position += 1) result.set(valid[position].key, percentile);
    index = end;
  }
  return result;
}

function scoreCandidates(candidates, weights) {
  const totalWeight = weights.reduce((sum, [, weight]) => sum + Math.abs(weight), 0);
  const percentiles = new Map(weights.map(([key, weight]) => [key, percentileLookup(candidates, key, Math.sign(weight))]));
  return candidates.map(candidate => {
    const key = normalizeCanonicalPlayerName(candidate.canonicalName);
    const available = weights.filter(([metricKey]) => percentiles.get(metricKey).has(key));
    const denominator = available.reduce((sum, [, weight]) => sum + Math.abs(weight), 0);
    const components = {};
    let rawScore = 0;
    let completeEvidenceWeight = 0;
    if (denominator > 0) {
      for (const [metricKey, weight] of available) {
        const percentile = percentiles.get(metricKey).get(key);
        const coverage = candidate.metricCoverage?.[metricKey] ?? {
          status: 'metric-input-provenance-unavailable', complete: false, sourcePath: null,
        };
        if (coverage.complete === true) completeEvidenceWeight += Math.abs(weight);
        const contribution = (Math.abs(weight) / denominator) * percentile;
        rawScore += contribution;
        components[metricKey] = {
          value: candidate.metrics[metricKey],
          percentile: Number(percentile.toFixed(4)),
          normalizedWeight: Number((Math.abs(weight) / denominator).toFixed(4)),
          contribution: Number(contribution.toFixed(4)),
          direction: weight < 0 ? 'lower-is-better' : 'higher-is-better',
          inputCoverage: {
            status: coverage.status,
            complete: coverage.complete === true,
            sourcePath: coverage.sourcePath ?? null,
            sourceRef: coverage.sourceRef ?? null,
          },
        };
      }
    }
    const evidenceCoverage = totalWeight ? completeEvidenceWeight / totalWeight : 0;
    return {
      ...candidate,
      modelScore: Number((rawScore * 100).toFixed(4)),
      modelScoreCoverage: totalWeight ? Number((denominator / totalWeight).toFixed(4)) : 0,
      modelScoreEvidenceCoverage: Number(evidenceCoverage.toFixed(4)),
      modelScoreEvidenceStatus: evidenceCoverage >= 0.9999 ? 'complete-weighted-input-coverage' : 'provisional-weighted-input-coverage',
      scoreComponents: components,
    };
  });
}

function sortedByScore(candidates, field = 'modelScore') {
  return [...candidates].sort((left, right) => Number(right[field] ?? 0) - Number(left[field] ?? 0)
    || left.canonicalName.localeCompare(right.canonicalName));
}

function simulateAwardBallots(candidates, { voterCount, seed, noiseScale, pointsSchedule }) {
  const random = makeRandom(seed);
  const tally = new Map(candidates.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), {
    firstPlaceVotes: 0, votingPoints: 0, rankSum: 0,
  }]));
  for (let voter = 0; voter < voterCount; voter += 1) {
    const ballot = candidates.map(candidate => ({
      key: normalizeCanonicalPlayerName(candidate.canonicalName),
      score: Number(candidate.modelScore ?? 0) / 100 + ((random() * 2) - 1) * noiseScale,
      name: candidate.canonicalName,
    })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
    ballot.forEach((row, index) => {
      const result = tally.get(row.key);
      result.rankSum += index + 1;
      if (index === 0) result.firstPlaceVotes += 1;
      result.votingPoints += pointsSchedule[index] ?? 0;
    });
  }
  return candidates.map(candidate => {
    const result = tally.get(normalizeCanonicalPlayerName(candidate.canonicalName));
    return {
      ...candidate,
      firstPlaceVotes: result.firstPlaceVotes,
      firstPlaceVoteShare: voterCount ? Number((result.firstPlaceVotes / voterCount).toFixed(4)) : 0,
      votingPoints: result.votingPoints,
      averageBallotRank: voterCount ? Number((result.rankSum / voterCount).toFixed(4)) : null,
      simulatedVoterCount: voterCount,
    };
  }).sort((left, right) => right.votingPoints - left.votingPoints
    || right.modelScore - left.modelScore
    || left.canonicalName.localeCompare(right.canonicalName));
}

function defaultPolicy(seasonStartYear) {
  const currentPositionlessAllStar = seasonStartYear >= 2025;
  const cbaEligibilityApplies = seasonStartYear >= 2023;
  return {
    policyId: `nba-season-awards-simulation-${seasonStartYear}-v1`,
    seasonStartYear,
    sourceReferences: {
      majorAwardEligibility: NBA_CBA_2023_SOURCE,
      majorAwardEligibilitySection: '2023 NBA/NBPA CBA Article XXIX, Section 6(a)(i)(B)',
      cbaCoveredHonors: [...CBA_COVERED_AWARDS],
      allStarVoting2026: 'https://www.nba.com/news/2026-all-star-voting-first-results',
      allStarSelections2026: 'https://www.nba.com/news/2026-all-star-teams-announcement',
      allDefensiveSelections2026: TWO_TEAM_BALLOT_SOURCES.allDefensive,
      allRookieSelections2026: TWO_TEAM_BALLOT_SOURCES.allRookie,
    },
    expectedRegularSeasonGames: null,
    majorAwardEligibility: {
      minimumCountedGames: cbaEligibilityApplies ? 65 : 1,
      minimumMinutesForCountedGame: cbaEligibilityApplies ? 20 : null,
      shortGameMinimumMinutes: cbaEligibilityApplies ? 15 : null,
      shortGameAllowance: cbaEligibilityApplies ? 2 : 0,
      cbaRuleEffectiveFromSeasonStartYear: 2023,
      ruleSource: NBA_CBA_2023_SOURCE,
      ruleSection: 'Article XXIX Section 6(a)',
      appliesToHonors: [...CBA_COVERED_AWARDS],
      excludesHonors: ['NBA All-Star selection', 'NBA All-Rookie Team'],
      seasonEndingInjuryException: { minimumCountedGames: 62, minimumPreInjuryTeamGameShare: 0.85 },
    },
    awardBallots: { voterCount: 100, pointsSchedule: [10, 7, 5, 3, 1], noiseScale: 0.12 },
    allNba: {
      teamCount: 3,
      playersPerTeam: 5,
      positionMode: seasonStartYear >= 2023 ? 'positionless' : 'classic-five',
      classicSlots: [{ group: 'guard', count: 2 }, { group: 'forward', count: 2 }, { group: 'center', count: 1 }],
    },
    allDefensive: {
      teamCount: 2,
      playersPerTeam: 5,
      positionMode: seasonStartYear >= 2023 ? 'positionless' : 'classic-five',
      classicSlots: [{ group: 'guard', count: 2 }, { group: 'forward', count: 2 }, { group: 'center', count: 1 }],
      voterCount: 100,
      noiseScale: 0.10,
      futureFormatAssumption: seasonStartYear >= 2026,
    },
    allRookie: {
      teamCount: 2,
      playersPerTeam: 5,
      positionMode: 'positionless',
      voterCount: 100,
      noiseScale: 0.10,
      futureFormatAssumption: seasonStartYear >= 2026,
      sourceContract: 'Require explicit rookieEligibilityBySeason evidence or a sourced nbaDebutSeasonStartYear; unknown rookie status is not inferred from a package window that may begin after a player debut.',
      scoreWeights: ALL_ROOKIE_WEIGHTS,
    },
    allStar: {
      playersPerConference: 12,
      startersPerConference: 5,
      reservesPerConference: 7,
      positionMode: currentPositionlessAllStar ? 'positionless' : 'guard-frontcourt',
      starterSlots: [{ group: 'guard', count: 2 }, { group: 'frontcourt', count: 3 }],
      voterCounts: { fans: 100, players: 100, media: 100, coaches: 30 },
      voterWeights: { fans: 0.5, players: 0.25, media: 0.25 },
      noiseScale: 0.12,
      futureFormatAssumption: seasonStartYear >= 2026,
    },
    majorAwardWeights: MAJOR_AWARD_WEIGHTS,
    defensiveAwardWeights: DEFENSIVE_AWARD_WEIGHTS,
  };
}

export function createSeasonAwardsPolicy(seasonStartYear, overrides = {}) {
  if (!Number.isInteger(seasonStartYear)) throw new Error('Season award policy requires an integer seasonStartYear.');
  const base = defaultPolicy(seasonStartYear);
  const policy = {
    ...base,
    ...structuredClone(overrides),
    majorAwardEligibility: {
      ...base.majorAwardEligibility,
      ...(overrides.majorAwardEligibility ?? {}),
      seasonEndingInjuryException: {
        ...base.majorAwardEligibility.seasonEndingInjuryException,
        ...(overrides.majorAwardEligibility?.seasonEndingInjuryException ?? {}),
      },
    },
    awardBallots: { ...base.awardBallots, ...(overrides.awardBallots ?? {}) },
    allNba: { ...base.allNba, ...(overrides.allNba ?? {}) },
    allDefensive: {
      ...base.allDefensive,
      ...(overrides.allDefensive ?? {}),
      classicSlots: overrides.allDefensive?.classicSlots ?? base.allDefensive.classicSlots,
    },
    allRookie: { ...base.allRookie, ...(overrides.allRookie ?? {}) },
    allStar: {
      ...base.allStar,
      ...(overrides.allStar ?? {}),
      voterCounts: { ...base.allStar.voterCounts, ...(overrides.allStar?.voterCounts ?? {}) },
      voterWeights: { ...base.allStar.voterWeights, ...(overrides.allStar?.voterWeights ?? {}) },
    },
  };
  policy.seasonStartYear = seasonStartYear;
  if (seasonStartYear >= 2023) {
    const requested = overrides.majorAwardEligibility ?? {};
    const lockedCbaFields = [
      'minimumCountedGames', 'minimumMinutesForCountedGame', 'shortGameMinimumMinutes',
      'shortGameAllowance', 'cbaRuleEffectiveFromSeasonStartYear', 'ruleSource', 'ruleSection',
      'appliesToHonors', 'excludesHonors',
    ];
    const rejectedEligibilityOverrides = lockedCbaFields.filter(field => {
      if (requested[field] === undefined) return false;
      return JSON.stringify(requested[field]) !== JSON.stringify(base.majorAwardEligibility[field]);
    });
    // Article XXIX §6 is a CBA requirement, not a user-tunable simulation knob.
    // The All-Star ballot and All-Rookie teams are outside its enumerated scope.
    policy.majorAwardEligibility = {
      ...policy.majorAwardEligibility,
      minimumCountedGames: 65,
      minimumMinutesForCountedGame: 20,
      shortGameMinimumMinutes: 15,
      shortGameAllowance: 2,
      cbaRuleEffectiveFromSeasonStartYear: 2023,
      ruleSource: NBA_CBA_2023_SOURCE,
      ruleSection: 'Article XXIX Section 6(a)',
      appliesToHonors: [...CBA_COVERED_AWARDS],
      excludesHonors: ['NBA All-Star selection', 'NBA All-Rookie Team'],
      seasonEndingInjuryException: { minimumCountedGames: 62, minimumPreInjuryTeamGameShare: 0.85 },
      rejectedEligibilityOverrides,
    };
    policy.sourceReferences = {
      ...policy.sourceReferences,
      majorAwardEligibility: NBA_CBA_2023_SOURCE,
      majorAwardEligibilitySection: '2023 NBA/NBPA CBA Article XXIX, Section 6(a)',
      cbaCoveredHonors: [...CBA_COVERED_AWARDS],
    };
  }
  return policy;
}

function eligibilityOverrideFor(player, state, seasonStartYear) {
  const key = normalizeCanonicalPlayerName(player.canonicalName);
  return state.awardEligibilityOverrides?.[String(seasonStartYear)]?.[key]
    ?? player.awardEligibilityBySeason?.[String(seasonStartYear)]
    ?? player.awardEligibilityOverride
    ?? null;
}

function hasEligibilitySource(source) {
  if (typeof source === 'string') return Boolean(source.trim());
  if (!source || typeof source !== 'object') return false;
  return Object.values(source).some(value => typeof value === 'string' && value.trim().length > 0);
}

function hasDecisionSource(source, requiredKind) {
  return Boolean(source && typeof source === 'object'
    && source.kind === requiredKind
    && typeof source.sourceRef === 'string' && source.sourceRef.trim()
    && typeof source.locator === 'string' && source.locator.trim());
}

function cbaDecisionException(override) {
  const exception = override?.cbaException;
  if (!exception || exception.status !== 'resolved' || exception.outcome !== 'granted') return null;
  if (!['award-eligibility-grievance', 'extraordinary-circumstances-challenge'].includes(exception.type)) return null;
  if (typeof exception.decisionId !== 'string' || !exception.decisionId.trim()
      || !hasDecisionSource(exception.source, 'official-cba-decision')) return null;
  return exception;
}

function seasonEndingInjuryEvidence(override, rule, counted) {
  const exception = override?.cbaException;
  if (!exception || exception.type !== 'season-ending-injury' || exception.status !== 'resolved') return null;
  const evidence = exception.evidence;
  const playerCountedGamesBeforeInjury = Number(evidence?.playerCountedGamesBeforeInjury);
  const teamGamesPlayedBeforeInjury = Number(evidence?.teamGamesPlayedBeforeInjury);
  const validCounts = Number.isInteger(playerCountedGamesBeforeInjury)
    && Number.isInteger(teamGamesPlayedBeforeInjury)
    && teamGamesPlayedBeforeInjury > 0
    && playerCountedGamesBeforeInjury >= 0
    && playerCountedGamesBeforeInjury <= teamGamesPlayedBeforeInjury;
  const preInjuryShare = validCounts ? playerCountedGamesBeforeInjury / teamGamesPlayedBeforeInjury : null;
  if (exception.outcome !== 'granted'
      || counted < rule.seasonEndingInjuryException.minimumCountedGames
      || evidence?.physicianDetermination !== 'jointly-selected-nba-nbpa-physician'
      || !hasDecisionSource(evidence?.source, 'joint-physician-medical-determination')
      || !validCounts
      || preInjuryShare < rule.seasonEndingInjuryException.minimumPreInjuryTeamGameShare) return null;
  return { exception, preInjuryShare };
}

function majorAwardEligibility(candidate, player, state, seasonStartYear, policy) {
  const rule = policy.majorAwardEligibility;
  const gp = candidate.gamesPlayed;
  const override = eligibilityOverrideFor(player, state, seasonStartYear);
  const cbaApplies = seasonStartYear >= 2023;
  if (cbaApplies) {
    const decision = cbaDecisionException(override);
    if (decision) return {
      eligible: true,
      status: 'eligible-by-resolved-cba-decision',
      basis: { type: decision.type, decisionId: decision.decisionId, source: structuredClone(decision.source) },
    };
  } else {
    if (override?.eligible === true) {
      return hasEligibilitySource(override.source)
        ? { eligible: true, status: 'eligible-by-explicit-override', basis: override.source }
        : { eligible: false, status: 'override-source-required', basis: 'eligibility override did not include source evidence' };
    }
    if (override?.eligible === false) {
      return { eligible: false, status: 'ineligible-by-explicit-override', basis: override.source ?? override.status ?? 'caller-supplied-eligibility-override' };
    }
  }
  if (rule.minimumMinutesForCountedGame === null || rule.minimumMinutesForCountedGame === undefined) {
    return gp >= rule.minimumCountedGames
      ? { eligible: true, status: 'eligible', basis: 'season-policy-minimum-games' }
      : { eligible: false, status: 'below-minimum-games', basis: `requires-${rule.minimumCountedGames}-counted-games` };
  }
  const gameRows = candidate._logs;
  const minuteRows = gameRows.map(row => valueFrom(row.stats, STAT_ALIASES.minutes));
  const hasCompleteMinutes = gameRows.length === gp && minuteRows.length > 0 && minuteRows.every(value => value !== null);
  if (!hasCompleteMinutes) return {
    eligible: true,
    status: 'provisional-minutes-unverified',
    basis: 'CBA counted games cannot be established because season game rows or minute values are incomplete',
    genericOverrideIgnored: Boolean(override?.eligible === true || override?.seasonEndingInjury === true),
  };
  const twentyPlus = minuteRows.filter(minutes => minutes >= rule.minimumMinutesForCountedGame).length;
  const shortMinutes = minuteRows.filter(minutes => minutes >= rule.shortGameMinimumMinutes && minutes < rule.minimumMinutesForCountedGame).length;
  const counted = twentyPlus + Math.min(rule.shortGameAllowance, shortMinutes);
  if (counted >= rule.minimumCountedGames) {
    return { eligible: true, status: 'eligible', basis: 'CBA-counted-games-and-minutes-rule' };
  }
  const injuryException = seasonEndingInjuryEvidence(override, rule, counted);
  if (injuryException) {
    return {
      eligible: true,
      status: 'eligible-season-ending-injury-exception',
      basis: {
        type: injuryException.exception.type,
        source: structuredClone(injuryException.exception.evidence.source),
        playerCountedGamesBeforeInjury: injuryException.exception.evidence.playerCountedGamesBeforeInjury,
        teamGamesPlayedBeforeInjury: injuryException.exception.evidence.teamGamesPlayedBeforeInjury,
        preInjuryTeamGameShare: Number(injuryException.preInjuryShare.toFixed(6)),
      },
    };
  }
  if (override?.cbaException?.type === 'season-ending-injury'
      || override?.cbaException?.type === 'award-eligibility-grievance'
      || override?.cbaException?.type === 'extraordinary-circumstances-challenge') {
    return {
      eligible: true,
      status: 'provisional-cba-exception-evidence-unverified',
      basis: 'A CBA exception was asserted but its required resolution or decision-scoped evidence is incomplete.',
    };
  }
  return {
    eligible: false,
    status: 'below-cba-counted-games',
    basis: `counted-${counted}-games; ${twentyPlus}-games-at-least-${rule.minimumMinutesForCountedGame}-minutes; ${shortMinutes}-short-games`,
  };
}

function rookieEligibilityFor(player, state, seasonStartYear) {
  const key = normalizeCanonicalPlayerName(player?.canonicalName);
  const bySeason = state.rookieEligibilityOverridesBySeason?.[String(seasonStartYear)]?.[key]
    ?? player?.rookieEligibilityBySeason?.[String(seasonStartYear)]
    ?? null;
  const priorAppearance = (state.playerGameLogs ?? []).some(row =>
    normalizeCanonicalPlayerName(row.canonicalName) === key
      && Number(row.seasonStartYear) < seasonStartYear);
  const priorSeasonWithGames = Object.entries(player?.seasonStatsByYear ?? {}).some(([year, stats]) =>
    Number(year) < seasonStartYear && (finite(stats?.gamesPlayed) ?? 0) > 0);
  const debutYear = finite(player?.nbaDebutSeasonStartYear);
  const debutSource = player?.nbaDebutSeasonSource ?? player?.nbaDebutSeasonEvidence ?? null;
  if (bySeason && typeof bySeason.eligible === 'boolean') {
    if (!hasEligibilitySource(bySeason.source)) return { eligible: false, status: 'rookie-eligibility-source-required', basis: 'season-specific rookie decision has no source reference' };
    if (bySeason.eligible && (priorAppearance || priorSeasonWithGames)) {
      return { eligible: false, status: 'rookie-evidence-conflict', basis: 'explicit rookie eligibility conflicts with prior NBA season game records', source: structuredClone(bySeason.source) };
    }
    return {
      eligible: bySeason.eligible,
      status: bySeason.eligible ? 'eligible-by-season-evidence' : 'ineligible-by-season-evidence',
      basis: bySeason.basis ?? 'season-specific rookie eligibility input',
      source: structuredClone(bySeason.source),
    };
  }
  if (Number.isInteger(debutYear)) {
    if (!hasEligibilitySource(debutSource)) return { eligible: false, status: 'rookie-debut-source-required', basis: 'nbaDebutSeasonStartYear has no source reference' };
    if (debutYear !== seasonStartYear) return { eligible: false, status: 'not-rookie-by-debut-season', basis: 'sourced first NBA season differs from target season', source: structuredClone(debutSource) };
    if (priorAppearance || priorSeasonWithGames) return { eligible: false, status: 'rookie-evidence-conflict', basis: 'sourced debut season conflicts with prior NBA season game records', source: structuredClone(debutSource) };
    return { eligible: true, status: 'eligible-by-sourced-debut-season', basis: 'sourced first NBA season matches target season', source: structuredClone(debutSource) };
  }
  if (priorAppearance || priorSeasonWithGames) {
    return { eligible: false, status: 'not-rookie-by-prior-season-appearance', basis: 'prior NBA season game records exist' };
  }
  return { eligible: false, status: 'rookie-eligibility-unknown', basis: 'rookie status cannot be established from the supplied career history' };
}

function supportsSeasonScheduleReceipt(state, seasonStartYear, receipt) {
  if (!receipt
      || receipt.format !== 'djhc-league-season-schedule-state-v1'
      || receipt.schemaVersion !== '1.0.0'
      || receipt.seasonStartYear !== seasonStartYear
      || typeof receipt.gameCountComplete !== 'boolean'
      || typeof receipt.complete !== 'boolean'
      || typeof receipt.officialSchedule !== 'boolean'
      || receipt.status === null || receipt.status === undefined
      || finite(receipt.expectedGamesPerTeam) !== 82
      || !Array.isArray(receipt.leagueTeamCodes)
      || !receipt.scheduledByTeam || typeof receipt.scheduledByTeam !== 'object' || Array.isArray(receipt.scheduledByTeam)) {
    return false;
  }

  const teamCodes = (state.teams ?? []).map(team => String(team.teamCode ?? '').trim().toUpperCase());
  const receiptTeamCodes = receipt.leagueTeamCodes.map(teamCode => String(teamCode ?? '').trim().toUpperCase());
  if (!teamCodes.length || teamCodes.some(teamCode => !teamCode)
      || new Set(teamCodes).size !== teamCodes.length
      || receiptTeamCodes.some(teamCode => !teamCode)
      || new Set(receiptTeamCodes).size !== receiptTeamCodes.length) {
    return false;
  }
  const sortedTeamCodes = [...teamCodes].sort();
  const sortedReceiptTeamCodes = [...receiptTeamCodes].sort();
  if (sortedTeamCodes.length !== sortedReceiptTeamCodes.length
      || sortedTeamCodes.some((teamCode, index) => teamCode !== sortedReceiptTeamCodes[index])) {
    return false;
  }

  const scheduledByTeamCodes = Object.keys(receipt.scheduledByTeam).sort();
  if (scheduledByTeamCodes.length !== sortedTeamCodes.length
      || scheduledByTeamCodes.some((teamCode, index) => teamCode !== sortedTeamCodes[index])) {
    return false;
  }

  let scheduledTeamGames = 0;
  let pendingTeamSlots = 0;
  for (const teamCode of sortedTeamCodes) {
    const counts = receipt.scheduledByTeam[teamCode];
    if (!counts || !['games', 'home', 'away', 'pendingCupGames'].every(field =>
      Number.isInteger(counts[field]) && counts[field] >= 0)) {
      return false;
    }
    if (counts.home + counts.away !== counts.games || counts.games + counts.pendingCupGames !== 82) return false;
    if (receipt.gameCountComplete && (counts.games !== 82 || counts.pendingCupGames !== 0)) return false;
    if (!receipt.gameCountComplete && counts.pendingCupGames === 0) return false;
    scheduledTeamGames += counts.games;
    pendingTeamSlots += counts.pendingCupGames;
  }

  const scheduledGameCount = receipt.scheduledGameCount;
  const pendingCupGameCount = receipt.pendingCupGameCount;
  const pendingCupTeamSlotCount = receipt.pendingCupTeamSlotCount;
  if (!Number.isInteger(scheduledGameCount) || scheduledGameCount < 0
      || !Number.isInteger(pendingCupGameCount) || pendingCupGameCount < 0
      || !Number.isInteger(pendingCupTeamSlotCount) || pendingCupTeamSlotCount < 0
      || scheduledTeamGames % 2 !== 0
      || scheduledGameCount !== scheduledTeamGames / 2
      || pendingTeamSlots !== pendingCupTeamSlotCount
      || pendingTeamSlots !== pendingCupGameCount * 2
      || scheduledGameCount + pendingCupGameCount !== 82 * sortedTeamCodes.length / 2) {
    return false;
  }

  if (receipt.gameCountComplete) {
    if (pendingTeamSlots !== 0 || pendingCupGameCount !== 0 || receipt.status === 'cup-flex-pending') return false;
  } else if (pendingTeamSlots === 0 || receipt.status !== 'cup-flex-pending' || receipt.complete || receipt.officialSchedule) {
    return false;
  }
  if (receipt.officialSchedule && !receipt.complete) return false;
  return true;
}

function seasonCoverage(state, seasonStartYear, policy, requestedComplete) {
  const seasonTeams = state.teams.map(team => ({
    teamCode: team.teamCode,
    gamesPlayed: finite(team.seasonStatsByYear?.[String(seasonStartYear)]?.gamesPlayed) ?? 0,
  }));
  const scheduleReceipt = state.seasonScheduleState ?? null;
  const hasScheduleReceipt = Boolean(scheduleReceipt);
  const scheduleReceiptSupported = hasScheduleReceipt && supportsSeasonScheduleReceipt(state, seasonStartYear, scheduleReceipt);
  const expected = hasScheduleReceipt
    ? scheduleReceiptSupported ? finite(scheduleReceipt.expectedGamesPerTeam) : null
    : finite(policy.expectedRegularSeasonGames ?? state.expectedRegularSeasonGames ?? state.scheduleState?.regularSeasonGames);
  const inferredComplete = expected !== null && seasonTeams.length > 0 && seasonTeams.every(team => team.gamesPlayed >= expected);
  const declaredComplete = state.scheduleState?.status === 'complete' || state.seasonSchedule?.status === 'complete';
  // A versioned schedule receipt is stronger evidence than a caller override.
  // Do not let `seasonComplete: true` turn an unresolved Cup slate into a final season.
  const scheduleGameCountComplete = hasScheduleReceipt ? scheduleReceiptSupported && scheduleReceipt.gameCountComplete === true : null;
  const complete = hasScheduleReceipt
    ? requestedComplete === false ? false : scheduleGameCountComplete === true && inferredComplete
    : typeof requestedComplete === 'boolean' ? requestedComplete : inferredComplete || declaredComplete;
  const scheduleProvenanceComplete = hasScheduleReceipt
    ? scheduleReceiptSupported && scheduleReceipt.complete === true && scheduleReceipt.officialSchedule === true
    : true;
  return {
    seasonComplete: complete,
    completionEvidence: hasScheduleReceipt
      ? scheduleGameCountComplete !== true ? 'schedule-receipt-incomplete-game-count'
        : !inferredComplete ? 'all-teams-have-not-reached-expected-game-count'
          : requestedComplete === false ? 'caller-declared-incomplete'
            : 'schedule-receipt-and-team-game-count'
      : typeof requestedComplete === 'boolean' ? 'caller-supplied' : declaredComplete ? 'league-schedule-state' : inferredComplete ? 'all-teams-reached-expected-game-count' : 'not-established',
    expectedRegularSeasonGames: expected,
    teamGamesPlayed: seasonTeams,
    teamsWithExpectedGames: expected === null ? null : seasonTeams.filter(team => team.gamesPlayed >= expected).length,
    teamCount: seasonTeams.length,
    playerGameLogCount: seasonRows(state, seasonStartYear).length,
    scheduleReceiptStatus: scheduleReceipt?.status ?? null,
    scheduleReceiptSupported,
    scheduleGameCountComplete,
    scheduleProvenanceComplete,
    officialSchedule: hasScheduleReceipt ? scheduleReceipt.officialSchedule === true : null,
    scheduleScenarioMode: scheduleReceipt?.scenarioMode ?? null,
    assignmentBlocked: hasScheduleReceipt && !complete,
  };
}

function notAssignedSeasonAwards(state, seasonStartYear, policy, seed, coverage) {
  const section = (award, offset = 0) => ({
    award,
    status: 'not-assigned-incomplete-season-schedule',
    winner: null,
    candidates: [],
    ballot: { seed: (Number(seed) + offset) >>> 0, status: 'not-run-incomplete-season-schedule' },
  });
  const assumptions = [
    'Season-end award assignments were not run because the attached schedule receipt is incomplete or not all teams reached the expected regular-season game count.',
  ];
  if (coverage.scheduleReceiptStatus) assumptions.push(`Attached schedule status is ${coverage.scheduleReceiptStatus}; caller completion flags cannot override its incomplete game-count evidence.`);
  return {
    format: SEASON_AWARDS_FORMAT,
    schemaVersion: '1.0.0',
    modelId: 'djhc-simulated-season-awards-v1',
    status: 'not-assigned-incomplete-season-schedule',
    seasonStartYear,
    seasonLabel: `${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`,
    seed: Number(seed) >>> 0,
    policyId: policy.policyId,
    policy: structuredClone(policy),
    seasonCoverage: coverage,
    mvp: section('Most Valuable Player', 101),
    defensivePlayerOfTheYear: section('Defensive Player of the Year', 211),
    allNba: { status: 'not-assigned-incomplete-season-schedule', teams: [], candidateCount: 0 },
    allDefensive: { status: 'not-assigned-incomplete-season-schedule', teams: [], candidateCount: 0 },
    allRookie: { status: 'not-assigned-incomplete-season-schedule', teams: [], candidateCount: 0 },
    allStar: { status: 'not-assigned-incomplete-season-schedule', conferences: [], candidateCount: 0 },
    candidatePool: {
      playerCount: state.players.length,
      withSeasonAppearances: null,
      majorAwardEligible: null,
      majorAwardIneligible: null,
      note: 'Candidate scoring and ballots were not run because the season schedule completion gate failed.',
    },
    assumptions,
  };
}

function publicCandidate(candidate) {
  const { _logs, ...row } = candidate;
  return structuredClone(row);
}

function hasProvisionalScoreEvidence(candidates) {
  return candidates.some(candidate => candidate.modelScoreEvidenceCoverage < 0.9999
    || String(candidate.eligibility?.status ?? '').startsWith('provisional'));
}

function buildAwardResult(name, scored, state, seasonStartYear, policy, seed) {
  const eligible = scored.filter(candidate => candidate.eligibility.eligible);
  if (!eligible.length) {
    return { award: name, status: 'no-eligible-candidates', winner: null, candidates: [], ballot: { voterCount: policy.awardBallots.voterCount, seed } };
  }
  const ballotRows = simulateAwardBallots(eligible, {
    voterCount: policy.awardBallots.voterCount,
    seed,
    noiseScale: policy.awardBallots.noiseScale,
    pointsSchedule: policy.awardBallots.pointsSchedule,
  });
  const candidates = ballotRows.map(row => ({
    ...publicCandidate(row),
    eligibility: structuredClone(row.eligibility),
  }));
  const provisionalEvidence = hasProvisionalScoreEvidence(eligible);
  return {
    award: name,
    status: provisionalEvidence ? 'provisional-simulated-vote-inputs' : 'simulated-vote',
    inputEvidenceStatus: provisionalEvidence ? 'provisional' : 'complete',
    winner: candidates[0],
    candidates,
    ballot: {
      modelVoterCount: policy.awardBallots.voterCount,
      pointSchedule: [...policy.awardBallots.pointsSchedule],
      seed,
      noiseScale: policy.awardBallots.noiseScale,
      voterPopulation: 'synthetic-modelled-voters-not-real-ballots',
    },
  };
}

function allNbaSelections(scored, policy) {
  const eligible = scored.filter(candidate => candidate.eligibility.eligible);
  const positionMode = policy.allNba.positionMode;
  const teams = [];
  let remaining = sortedByScore(eligible, 'allNbaScore');
  for (let teamIndex = 1; teamIndex <= policy.allNba.teamCount; teamIndex += 1) {
    const selected = [];
    if (positionMode === 'positionless') {
      selected.push(...remaining.splice(0, policy.allNba.playersPerTeam));
    } else {
      for (const slot of policy.allNba.classicSlots ?? []) {
        const matching = remaining.filter(candidate => candidate.positionGroups.includes(slot.group));
        const chosen = matching.slice(0, slot.count);
        selected.push(...chosen);
        const chosenNames = new Set(chosen.map(candidate => candidate.canonicalName));
        remaining = remaining.filter(candidate => !chosenNames.has(candidate.canonicalName));
      }
    }
    teams.push({
      team: `All-NBA ${['First', 'Second', 'Third'][teamIndex - 1] ?? teamIndex}`,
      players: selected.map(candidate => publicCandidate(candidate)),
      requiredPlayerCount: policy.allNba.playersPerTeam,
      status: selected.length === policy.allNba.playersPerTeam ? 'complete' : 'partial-roster',
    });
  }
  const complete = teams.every(team => team.status === 'complete');
  const provisionalEvidence = hasProvisionalScoreEvidence(eligible);
  return {
    status: complete ? provisionalEvidence ? 'provisional-selection-inputs' : 'simulated-selection' : positionMode === 'positionless' ? 'partial-candidate-pool' : 'position-data-or-candidate-pool-incomplete',
    inputEvidenceStatus: provisionalEvidence ? 'provisional' : 'complete',
    positionMode,
    teams,
    eligibilityRule: structuredClone(policy.majorAwardEligibility),
  };
}

function selectTwoTeamRosters(rankedCandidates, policy, awardLabel) {
  const { positionMode, playersPerTeam } = policy;
  if (!['positionless', 'classic-five'].includes(positionMode)) throw new Error(`${awardLabel} positionMode must be positionless or classic-five.`);
  const remaining = [...rankedCandidates];
  const teams = [];
  for (let teamIndex = 0; teamIndex < 2; teamIndex += 1) {
    let selected = [];
    if (positionMode === 'positionless') {
      selected = remaining.splice(0, playersPerTeam);
    } else {
      const chosenKeys = new Set();
      for (const slot of policy.classicSlots ?? []) {
        const matching = remaining.filter(candidate => candidate.positionGroups.includes(slot.group)
          && !chosenKeys.has(normalizeCanonicalPlayerName(candidate.canonicalName)));
        const chosen = matching.slice(0, slot.count);
        selected.push(...chosen);
        for (const candidate of chosen) chosenKeys.add(normalizeCanonicalPlayerName(candidate.canonicalName));
      }
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (chosenKeys.has(normalizeCanonicalPlayerName(remaining[index].canonicalName))) remaining.splice(index, 1);
      }
    }
    teams.push({
      team: `${awardLabel} ${teamIndex === 0 ? 'First' : 'Second'} Team`,
      players: selected.map(candidate => publicCandidate(candidate)),
      requiredPlayerCount: playersPerTeam,
      status: selected.length === playersPerTeam ? 'complete' : 'partial-roster',
    });
  }
  return teams;
}

function simulateTwoTeamAward(candidates, {
  awardLabel,
  policy,
  seed,
  scoreField = 'modelScore',
  noCandidateStatus = 'no-eligible-candidates',
  eligibilitySummary = null,
} = {}) {
  const voterCount = Math.max(0, Math.floor(Number(policy.voterCount) || 0));
  if (!candidates.length) {
    return {
      status: noCandidateStatus,
      positionMode: policy.positionMode,
      teams: [
        { team: `${awardLabel} First Team`, players: [], requiredPlayerCount: policy.playersPerTeam, status: 'partial-roster' },
        { team: `${awardLabel} Second Team`, players: [], requiredPlayerCount: policy.playersPerTeam, status: 'partial-roster' },
      ],
      candidateCount: 0,
      eligibilitySummary,
      ballot: { modelVoterCount: voterCount, seed, voterPopulation: 'synthetic-modelled-voters-not-real-ballots' },
    };
  }
  const random = makeRandom(seed);
  const tally = new Map(candidates.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), {
    firstTeamVotes: 0, secondTeamVotes: 0, votingPoints: 0,
  }]));
  for (let voter = 0; voter < voterCount; voter += 1) {
    const ballot = candidates.map(candidate => ({
      candidate,
      score: Number(candidate[scoreField] ?? candidate.modelScore ?? 0) / 100 + ((random() * 2) - 1) * (Number(policy.noiseScale) || 0),
    })).sort((left, right) => right.score - left.score || left.candidate.canonicalName.localeCompare(right.candidate.canonicalName));
    ballot.slice(0, policy.playersPerTeam).forEach(({ candidate }) => {
      const row = tally.get(normalizeCanonicalPlayerName(candidate.canonicalName));
      row.firstTeamVotes += 1;
      row.votingPoints += 2;
    });
    ballot.slice(policy.playersPerTeam, policy.playersPerTeam * 2).forEach(({ candidate }) => {
      const row = tally.get(normalizeCanonicalPlayerName(candidate.canonicalName));
      if (!row) return;
      row.secondTeamVotes += 1;
      row.votingPoints += 1;
    });
  }
  const ranked = candidates.map(candidate => ({
    ...candidate,
    firstTeamVotes: tally.get(normalizeCanonicalPlayerName(candidate.canonicalName)).firstTeamVotes,
    secondTeamVotes: tally.get(normalizeCanonicalPlayerName(candidate.canonicalName)).secondTeamVotes,
    votingPoints: tally.get(normalizeCanonicalPlayerName(candidate.canonicalName)).votingPoints,
  })).sort((left, right) => right.votingPoints - left.votingPoints
    || right.firstTeamVotes - left.firstTeamVotes
    || Number(right[scoreField] ?? right.modelScore ?? 0) - Number(left[scoreField] ?? left.modelScore ?? 0)
    || left.canonicalName.localeCompare(right.canonicalName));
  const teams = selectTwoTeamRosters(ranked, policy, awardLabel);
  const complete = teams.every(team => team.status === 'complete');
  const provisionalEvidence = hasProvisionalScoreEvidence(candidates);
  const status = complete ? provisionalEvidence ? 'provisional-selection-inputs' : 'simulated-selection' : policy.positionMode === 'positionless' ? 'partial-candidate-pool' : 'position-data-or-candidate-pool-incomplete';
  return {
    status,
    inputEvidenceStatus: provisionalEvidence ? 'provisional' : 'complete',
    positionMode: policy.positionMode,
    teams,
    candidateCount: candidates.length,
    eligibilitySummary,
    rankedCandidates: ranked.map(candidate => publicCandidate(candidate)),
    ballot: {
      modelVoterCount: voterCount,
      pointSchedule: { firstTeam: 2, secondTeam: 1 },
      seed,
      noiseScale: Number(policy.noiseScale) || 0,
      voterPopulation: 'synthetic-modelled-voters-not-real-ballots',
    },
  };
}

function allDefensiveSelections(scored, policy, seed) {
  const eligible = scored.filter(candidate => candidate.eligibility.eligible)
    .map(candidate => ({ ...candidate, allDefensiveScore: candidate.modelScore }));
  return simulateTwoTeamAward(eligible, {
    awardLabel: 'All-Defensive',
    policy,
    seed,
    scoreField: 'allDefensiveScore',
    noCandidateStatus: 'no-eligible-candidates',
  });
}

function allRookieSelections(candidates, policy, seed) {
  const rookieCandidates = candidates.filter(candidate => candidate.rookieEligibility?.eligible === true);
  const scored = scoreCandidates(rookieCandidates, policy.scoreWeights).map(candidate => ({
    ...candidate,
    allRookieScore: candidate.modelScore,
  }));
  const eligibilitySummary = {
    eligible: candidates.filter(candidate => candidate.rookieEligibility?.eligible === true).length,
    ineligible: candidates.filter(candidate => candidate.rookieEligibility?.status?.startsWith('not-rookie')).length,
    unresolved: candidates.filter(candidate => !candidate.rookieEligibility?.eligible
      && !candidate.rookieEligibility?.status?.startsWith('not-rookie')).length,
  };
  const status = scored.length ? undefined : eligibilitySummary.unresolved ? 'rookie-eligibility-unresolved' : 'no-eligible-rookies';
  return simulateTwoTeamAward(scored, {
    awardLabel: 'All-Rookie',
    policy,
    seed,
    scoreField: 'allRookieScore',
    noCandidateStatus: status,
    eligibilitySummary,
  });
}

function simulateVotingGroup(candidates, { voterCount, seed, noiseScale }) {
  const random = makeRandom(seed);
  const rankSums = new Map(candidates.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), 0]));
  for (let voter = 0; voter < voterCount; voter += 1) {
    const ballot = candidates.map(candidate => ({
      key: normalizeCanonicalPlayerName(candidate.canonicalName),
      value: Number(candidate.modelScore ?? 0) / 100 + ((random() * 2) - 1) * noiseScale,
      name: candidate.canonicalName,
    })).sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
    ballot.forEach((row, index) => rankSums.set(row.key, rankSums.get(row.key) + index + 1));
  }
  return candidates.map(candidate => {
    const meanRank = voterCount ? rankSums.get(normalizeCanonicalPlayerName(candidate.canonicalName)) / voterCount : candidates.length + 1;
    return { ...candidate, averageRank: Number(meanRank.toFixed(4)), modelSupportIndex: candidates.length <= 1 ? 100 : Number((100 * (1 - (meanRank - 1) / (candidates.length - 1))).toFixed(4)) };
  });
}

function rankAllStarCandidates(candidates, policy, seed, seedOffset = 0) {
  const groupRows = {};
  for (const group of ['fans', 'players', 'media']) {
    const voterCount = Math.max(0, Math.floor(Number(policy.voterCounts[group]) || 0));
    const scored = scoreCandidates(candidates, ALL_STAR_VOTER_WEIGHTS[group]);
    groupRows[group] = simulateVotingGroup(scored, { voterCount, seed: (seed + seedOffset + (group === 'fans' ? 101 : group === 'players' ? 211 : 307)) >>> 0, noiseScale: Number(policy.noiseScale) || 0 });
  }
  const rankByGroup = new Map();
  for (const group of Object.keys(groupRows)) {
    for (const row of groupRows[group]) {
      const key = normalizeCanonicalPlayerName(row.canonicalName);
      const entry = rankByGroup.get(key) ?? { candidate: row, ranks: {} };
      entry.ranks[group] = row.averageRank;
      entry.ranks[`${group}SupportIndex`] = row.modelSupportIndex;
      rankByGroup.set(key, entry);
    }
  }
  const totalVoterWeight = ['fans', 'players', 'media'].reduce((sum, group) => sum + Number(policy.voterWeights[group] ?? 0), 0);
  return [...rankByGroup.values()].map(({ candidate, ranks }) => {
    const weightedAverageRank = totalVoterWeight > 0
      ? ['fans', 'players', 'media'].reduce((sum, group) => sum + (ranks[group] ?? candidates.length + 1) * Number(policy.voterWeights[group] ?? 0), 0) / totalVoterWeight
      : candidates.length + 1;
    return {
      ...candidate,
      voterRanks: ranks,
      weightedAverageRank: Number(weightedAverageRank.toFixed(4)),
      syntheticVoteSupportIndex: candidates.length <= 1 ? 100 : Number((100 * (1 - (weightedAverageRank - 1) / (candidates.length - 1))).toFixed(4)),
    };
  }).sort((left, right) => left.weightedAverageRank - right.weightedAverageRank || left.canonicalName.localeCompare(right.canonicalName));
}

function starterGroup(candidate, mode) {
  if (mode === 'positionless') return 'any';
  return candidate.positionGroups.includes('guard') ? 'guard' : candidate.positionGroups.includes('frontcourt') ? 'frontcourt' : null;
}

function chooseStarters(voteRows, policy) {
  if (policy.positionMode === 'positionless') return voteRows.slice(0, policy.startersPerConference);
  const selected = [];
  for (const slot of policy.starterSlots ?? []) {
    const rows = voteRows.filter(row => starterGroup(row, policy.positionMode) === slot.group);
    selected.push(...rows.slice(0, slot.count));
  }
  return selected;
}

function simulateAllStar(candidates, policy, seed) {
  const missingConference = candidates.filter(candidate => !candidate.conference).length;
  const conferences = ['East', 'West'];
  const results = [];
  for (let index = 0; index < conferences.length; index += 1) {
    const conference = conferences[index];
    const conferenceCandidates = candidates.filter(candidate => candidate.conference === conference);
    const voteRows = rankAllStarCandidates(conferenceCandidates, policy, seed, index * 1009);
    const starters = chooseStarters(voteRows, policy);
    const starterKeys = new Set(starters.map(row => normalizeCanonicalPlayerName(row.canonicalName)));
    const remaining = voteRows.filter(row => !starterKeys.has(normalizeCanonicalPlayerName(row.canonicalName)));
    const coachRows = simulateVotingGroup(scoreCandidates(remaining, ALL_STAR_VOTER_WEIGHTS.coaches), {
      voterCount: Math.max(0, Math.floor(Number(policy.voterCounts.coaches) || 0)),
      seed: (seed + 4099 + index * 1237) >>> 0,
      noiseScale: Number(policy.noiseScale) || 0,
    }).sort((left, right) => left.averageRank - right.averageRank || left.canonicalName.localeCompare(right.canonicalName));
    const reserves = coachRows.slice(0, policy.reservesPerConference);
    const selectionCount = starters.length + reserves.length;
    const requiredCount = policy.playersPerConference;
    const selectedRows = [...starters, ...reserves];
    const provisionalEvidence = hasProvisionalScoreEvidence(selectedRows);
    results.push({
      conference,
      status: selectionCount !== requiredCount ? 'partial-roster' : provisionalEvidence ? 'provisional-selection-inputs' : 'simulated-selection',
      inputEvidenceStatus: provisionalEvidence ? 'provisional' : 'complete',
      starters: starters.map(row => ({ ...publicCandidate(row), voterRanks: structuredClone(row.voterRanks), weightedAverageRank: row.weightedAverageRank, syntheticVoteSupportIndex: row.syntheticVoteSupportIndex, selectionType: 'starter' })),
      reserves: reserves.map(row => ({ ...publicCandidate(row), averageCoachRank: row.averageRank, modelSupportIndex: row.modelSupportIndex, selectionType: 'reserve' })),
      rankedStarterBallot: voteRows.map(row => ({
        canonicalName: row.canonicalName,
        teamCode: row.teamCode,
        weightedAverageRank: row.weightedAverageRank,
        syntheticVoteSupportIndex: row.syntheticVoteSupportIndex,
        voterRanks: structuredClone(row.voterRanks),
      })),
      requiredCount,
      voterCounts: structuredClone(policy.voterCounts),
      voterWeights: structuredClone(policy.voterWeights),
    });
  }
  const complete = missingConference === 0 && results.every(row => row.status === 'simulated-selection');
  const provisionalEvidence = results.some(row => row.inputEvidenceStatus === 'provisional');
  const partialRoster = results.some(row => row.status === 'partial-roster');
  return {
    status: complete ? 'simulated-selection'
      : missingConference ? 'conference-data-incomplete'
        : partialRoster ? 'partial-rosters-or-voting-pool'
          : provisionalEvidence ? 'provisional-selection-inputs' : 'partial-rosters-or-voting-pool',
    inputEvidenceStatus: provisionalEvidence ? 'provisional' : 'complete',
    positionMode: policy.positionMode,
    futureFormatAssumption: Boolean(policy.futureFormatAssumption),
    selectionDisclosure: 'Ballots are generated from on-court production and ratings; actual fan popularity, player ballots, media ballots, coach ballots, injury replacements, and official vote counts are not available in this simulation.',
    voters: 'synthetic-modelled-voters-not-real-ballots',
    missingConferencePlayerCount: missingConference,
    conferences: results,
  };
}

function compactHistory(awards) {
  const toWinner = row => row?.winner ? { canonicalName: row.winner.canonicalName, teamCode: row.winner.teamCode, status: row.status } : null;
  return {
    seasonStartYear: awards.seasonStartYear,
    status: awards.status,
    policyId: awards.policyId,
    seed: awards.seed,
    mvp: toWinner(awards.mvp),
    defensivePlayerOfTheYear: toWinner(awards.defensivePlayerOfTheYear),
    allNba: (awards.allNba?.teams ?? []).map(team => ({ team: team.team, players: team.players.map(player => player.canonicalName), status: team.status })),
    allDefensive: (awards.allDefensive?.teams ?? []).map(team => ({ team: team.team, players: team.players.map(player => player.canonicalName), status: team.status })),
    allRookie: (awards.allRookie?.teams ?? []).map(team => ({ team: team.team, players: team.players.map(player => player.canonicalName), status: team.status })),
    allStar: (awards.allStar?.conferences ?? []).map(conference => ({
      conference: conference.conference,
      starters: conference.starters.map(player => player.canonicalName),
      reserves: conference.reserves.map(player => player.canonicalName),
      status: conference.status,
    })),
  };
}

export function simulateSeasonAwards(state, {
  seed = 1,
  policy: policyInput = null,
  seasonComplete = undefined,
} = {}) {
  if (!Number.isInteger(state?.seasonStartYear)) throw new Error('Season award simulation requires a LeagueState seasonStartYear.');
  const seasonStartYear = state.seasonStartYear;
  const policy = createSeasonAwardsPolicy(seasonStartYear, policyInput ?? {});
  const coverage = seasonCoverage(state, seasonStartYear, policy, seasonComplete);
  if (coverage.assignmentBlocked) return notAssignedSeasonAwards(state, seasonStartYear, policy, seed, coverage);
  const logsByName = playerLogIndex(state, seasonStartYear);
  const gamesById = teamGameIndex(state, seasonStartYear);
  const baseCandidates = state.players.map(player => buildCandidate(
    state,
    player,
    logsByName.get(normalizeCanonicalPlayerName(player.canonicalName)) ?? [],
    gamesById,
    seasonStartYear,
  )).filter(candidate => candidate.gamesPlayed > 0);
  const playerByName = new Map(state.players.map(player => [normalizeCanonicalPlayerName(player.canonicalName), player]));
  const candidatesWithRookieStatus = baseCandidates.map(candidate => ({
    ...candidate,
    rookieEligibility: rookieEligibilityFor(
      playerByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)),
      state,
      seasonStartYear,
    ),
  }));
  const eligibilityFor = candidate => majorAwardEligibility(
    candidate,
    playerByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)),
    state,
    seasonStartYear,
    policy,
  );
  const eligibleCandidates = candidatesWithRookieStatus.map(candidate => ({ ...candidate, eligibility: eligibilityFor(candidate) }));
  const mvpScored = scoreCandidates(eligibleCandidates, policy.majorAwardWeights);
  const dpoyScored = scoreCandidates(eligibleCandidates, policy.defensiveAwardWeights);
  const mvpByName = new Map(mvpScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate]));
  const dpoyByName = new Map(dpoyScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate]));
  const mvpScoreByName = new Map(mvpScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate.modelScore]));
  const dpoyScoreByName = new Map(dpoyScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate.modelScore]));
  const allNbaScored = mvpScored.map(candidate => {
    const key = normalizeCanonicalPlayerName(candidate.canonicalName);
    const defenseCandidate = dpoyByName.get(key);
    const allNbaEvidenceCoverage = Math.min(candidate.modelScoreEvidenceCoverage ?? 0, defenseCandidate?.modelScoreEvidenceCoverage ?? 0);
    return {
      ...candidate,
      allNbaScore: candidate.modelScore * 0.8 + (dpoyScoreByName.get(key) ?? 50) * 0.2,
      allNbaEvidenceCoverage: Number(allNbaEvidenceCoverage.toFixed(4)),
      metricCoverage: {
        ...candidate.metricCoverage,
        allNbaScore: {
          status: allNbaEvidenceCoverage >= 0.9999 ? 'complete-derived-all-nba-score-inputs' : 'provisional-derived-all-nba-score-inputs',
          complete: allNbaEvidenceCoverage >= 0.9999,
          sourcePath: 'derived-from-mvp-and-dpoy-score-components',
        },
      },
    };
  });
  const allStarCandidates = baseCandidates.map(candidate => ({
    ...candidate,
    metrics: {
      ...candidate.metrics,
      mvpScore: mvpScoreByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)) ?? null,
      dpoyScore: dpoyScoreByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)) ?? null,
    },
    metricCoverage: {
      ...candidate.metricCoverage,
      mvpScore: {
        status: (mvpByName.get(normalizeCanonicalPlayerName(candidate.canonicalName))?.modelScoreEvidenceCoverage ?? 0) >= 0.9999
          ? 'complete-derived-mvp-score-inputs' : 'provisional-derived-mvp-score-inputs',
        complete: (mvpByName.get(normalizeCanonicalPlayerName(candidate.canonicalName))?.modelScoreEvidenceCoverage ?? 0) >= 0.9999,
        sourcePath: 'derived-from-mvp-score-components',
      },
      dpoyScore: {
        status: (dpoyByName.get(normalizeCanonicalPlayerName(candidate.canonicalName))?.modelScoreEvidenceCoverage ?? 0) >= 0.9999
          ? 'complete-derived-dpoy-score-inputs' : 'provisional-derived-dpoy-score-inputs',
        complete: (dpoyByName.get(normalizeCanonicalPlayerName(candidate.canonicalName))?.modelScoreEvidenceCoverage ?? 0) >= 0.9999,
        sourcePath: 'derived-from-dpoy-score-components',
      },
    },
  }));
  const mvp = buildAwardResult('Most Valuable Player', mvpScored, state, seasonStartYear, policy, (Number(seed) + 101) >>> 0);
  const defensivePlayerOfTheYear = buildAwardResult('Defensive Player of the Year', dpoyScored, state, seasonStartYear, policy, (Number(seed) + 211) >>> 0);
  const allNba = allNbaSelections(allNbaScored, policy);
  const allDefensive = allDefensiveSelections(dpoyScored, policy.allDefensive, (Number(seed) + 401) >>> 0);
  const allRookie = allRookieSelections(candidatesWithRookieStatus, policy.allRookie, (Number(seed) + 503) >>> 0);
  const allStar = simulateAllStar(allStarCandidates, policy.allStar, (Number(seed) + 307) >>> 0);
  const assumptions = [];
  if (!coverage.seasonComplete) assumptions.push('Season completion was not established from the supplied schedule state or expected game count; award assignments are provisional for partial-season data.');
  if (!coverage.scheduleProvenanceComplete) assumptions.push('The season has a completed game count, but the schedule receipt remains scenario-based or unauthenticated; awards are computed as a provisional scenario.');
  if (policy.allStar.futureFormatAssumption) assumptions.push('The All-Star selection structure is carried forward as an editable scenario assumption because the season-specific future event format may change.');
  if (policy.allDefensive.futureFormatAssumption) assumptions.push('The All-Defensive panel size, team size, and selection format are carried forward as editable future-season assumptions.');
  if (policy.allRookie.futureFormatAssumption) assumptions.push('The All-Rookie panel size, team size, and selection format are carried forward as editable future-season assumptions.');
  if (mvpScored.some(candidate => candidate.eligibility.status === 'provisional-minutes-unverified')) assumptions.push('Some major-award eligibility depends on unavailable game-level minutes and is provisional.');
  if ([...mvpScored, ...dpoyScored, ...allNbaScored].some(candidate => candidate.modelScoreEvidenceCoverage < 0.9999)) assumptions.push('One or more weighted award-score components use incomplete or aggregate-fallback source coverage; affected score components and source paths are shown per candidate, and the award output is provisional.');
  if (eligibleCandidates.some(candidate => String(candidate.eligibility.status).startsWith('provisional'))) assumptions.push('One or more candidates have unresolved CBA eligibility evidence; their simulated inclusion is provisional and does not establish official eligibility.');
  if (allStar.status !== 'simulated-selection') assumptions.push('All-Star conference or candidate coverage is incomplete; only available simulated ballot evidence is shown.');
  if (allDefensive.status !== 'simulated-selection') assumptions.push('All-Defensive candidate coverage, eligibility, or position data is incomplete; the output is partial or unresolved.');
  if (allRookie.status !== 'simulated-selection') assumptions.push('All-Rookie selections require sourced rookie eligibility; missing or conflicting rookie evidence is not treated as eligible.');
  if (allNba.status !== 'simulated-selection') assumptions.push('All-NBA candidate coverage, eligibility, or position data is incomplete; the output is partial.');
  const awardSectionsComplete = [allNba, allDefensive, allRookie, allStar].every(section => section.status === 'simulated-selection');
  const majorAwardSectionsComplete = [mvp, defensivePlayerOfTheYear].every(section => section.status === 'simulated-vote');
  const scoreEvidenceComplete = ![...mvpScored, ...dpoyScored, ...allNbaScored].some(candidate => candidate.modelScoreEvidenceCoverage < 0.9999)
    && !eligibleCandidates.some(candidate => String(candidate.eligibility.status).startsWith('provisional'));
  const result = {
    format: SEASON_AWARDS_FORMAT,
    schemaVersion: '1.0.0',
    modelId: 'djhc-simulated-season-awards-v1',
    status: coverage.seasonComplete && coverage.scheduleProvenanceComplete && scoreEvidenceComplete && majorAwardSectionsComplete && !policy.allStar.futureFormatAssumption
      && !policy.allDefensive.futureFormatAssumption && !policy.allRookie.futureFormatAssumption && awardSectionsComplete
      ? 'simulated-season-awards' : 'provisional-simulated-season-awards',
    seasonStartYear,
    seasonLabel: `${seasonStartYear}-${String(seasonStartYear + 1).slice(-2)}`,
    seed: Number(seed) >>> 0,
    policyId: policy.policyId,
    policy: structuredClone(policy),
    seasonCoverage: coverage,
    mvp,
    defensivePlayerOfTheYear,
    allNba,
    allDefensive,
    allRookie,
    allStar,
    candidatePool: {
      playerCount: state.players.length,
      withSeasonAppearances: baseCandidates.length,
      majorAwardEligible: eligibleCandidates.filter(candidate => candidate.eligibility.eligible).length,
      majorAwardIneligible: eligibleCandidates.filter(candidate => !candidate.eligibility.eligible).length,
    },
    inputProvenance: {
      status: 'candidate-field-source-paths-attached-content-hashes-unavailable',
      sourceHashStatus: 'not-provided-by-current-LeagueState-input-contract',
      note: 'Candidate outputs include per-field and score-component source paths and coverage. The current LeagueState inputs do not carry source-content hashes for these award inputs.',
    },
    assumptions,
    disclosure: 'These are reproducible simulated awards and ballots based on the supplied simulated season, box scores, team results, and available DJHC ratings. They are not official NBA results, predictions of actual voters, or calibrated award forecasts. Historical NBA awards are not used as player-skill inputs.',
  };
  result.historyRecord = compactHistory(result);
  return result;
}

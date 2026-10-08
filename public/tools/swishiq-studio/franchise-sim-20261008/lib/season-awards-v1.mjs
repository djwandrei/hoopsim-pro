import { normalizeCanonicalPlayerName } from './simulation-contracts-v1.mjs';

export const SEASON_AWARDS_FORMAT = 'djhc-season-awards-simulation-v1';

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

function addTotals(logs, bucket) {
  const result = {};
  for (const [field, aliases] of Object.entries(STAT_ALIASES)) {
    const values = logs.map(row => valueFrom(row.stats, aliases)).filter(value => value !== null);
    result[field] = values.length ? values.reduce((sum, value) => sum + value, 0) : valueFrom(bucket, aliases);
  }
  return result;
}

function teamForPlayer(state, player, logs) {
  const currentTeamCode = String(player.teamCode ?? '').toUpperCase();
  const currentTeam = state.teams.find(team => team.teamCode === currentTeamCode) ?? null;
  const lastTeamCode = String(logs.at(-1)?.teamCode ?? '').toUpperCase();
  const lastTeam = state.teams.find(team => team.teamCode === lastTeamCode) ?? null;
  return currentTeam ?? lastTeam;
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
  if (games) return wins / games;
  const record = fallbackTeam?.seasonStatsByYear?.[String(seasonStartYear)];
  const teamGames = finite(record?.gamesPlayed) ?? 0;
  return teamGames > 0 ? (finite(record?.wins) ?? 0) / teamGames : null;
}

function conferenceForPlayer(player, team) {
  const raw = String(player.allStarConference ?? player.conference ?? team?.conference ?? team?.conferenceCode ?? '').trim().toLowerCase();
  if (['east', 'eastern', 'e'].includes(raw)) return 'East';
  if (['west', 'western', 'w'].includes(raw)) return 'West';
  return null;
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
  const totals = addTotals(logs, bucket);
  const logMinutes = logs.map(row => valueFrom(row.stats, STAT_ALIASES.minutes)).filter(value => value !== null);
  const explicitGames = finite(bucket.gamesPlayed);
  const gamesPlayed = explicitGames !== null && explicitGames > 0
    ? explicitGames
    : logs.length;
  const metric = key => totals[key] === null || gamesPlayed <= 0 ? null : totals[key] / gamesPlayed;
  const denominator = totals.fieldGoalsAttempted === null || totals.freeThrowsAttempted === null
    ? null
    : 2 * (totals.fieldGoalsAttempted + 0.44 * totals.freeThrowsAttempted);
  const trueShootingPct = denominator > 0 && totals.points !== null ? totals.points / denominator : null;
  const currentTeam = teamForPlayer(state, player, logs);
  const record = currentTeam?.seasonStatsByYear?.[String(seasonStartYear)] ?? {};
  const teamGames = finite(record.gamesPlayed) ?? 0;
  const pointsAllowedPerGame = teamGames > 0 && finite(record.pointsAgainst) !== null
    ? Number(record.pointsAgainst) / teamGames
    : null;
  const playerWinPct = winRateForPlayer(logs, gamesById, currentTeam, seasonStartYear);
  const minutesTotal = totals.minutes ?? (logMinutes.length ? logMinutes.reduce((sum, value) => sum + value, 0) : null);
  const candidate = {
    canonicalName: player.canonicalName,
    teamCode: String(player.teamCode ?? currentTeam?.teamCode ?? logs.at(-1)?.teamCode ?? '').toUpperCase() || null,
    conference: conferenceForPlayer(player, currentTeam),
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
      playerWinPct,
      teamPointsAllowedPerGame: pointsAllowedPerGame,
      overallRating: finite(player.overallRating ?? player.rating ?? player.overall),
      defenseDomain: finite(player.defenseDomain ?? player.defenseRating ?? player.defensiveRating),
    },
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
    if (denominator > 0) {
      for (const [metricKey, weight] of available) {
        const percentile = percentiles.get(metricKey).get(key);
        const contribution = (Math.abs(weight) / denominator) * percentile;
        rawScore += contribution;
        components[metricKey] = {
          value: candidate.metrics[metricKey],
          percentile: Number(percentile.toFixed(4)),
          normalizedWeight: Number((Math.abs(weight) / denominator).toFixed(4)),
          contribution: Number(contribution.toFixed(4)),
          direction: weight < 0 ? 'lower-is-better' : 'higher-is-better',
        };
      }
    }
    return {
      ...candidate,
      modelScore: Number((rawScore * 100).toFixed(4)),
      modelScoreCoverage: totalWeight ? Number((denominator / totalWeight).toFixed(4)) : 0,
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
      majorAwardEligibility: 'https://cms.nba.com/wp-content/uploads/sites/4/2024/11/2024-25-CBA-101.pdf',
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

function majorAwardEligibility(candidate, player, state, seasonStartYear, policy) {
  const rule = policy.majorAwardEligibility;
  const gp = candidate.gamesPlayed;
  const override = eligibilityOverrideFor(player, state, seasonStartYear);
  if (override?.eligible === true) {
    return hasEligibilitySource(override.source)
      ? { eligible: true, status: 'eligible-by-explicit-override', basis: override.source }
      : { eligible: false, status: 'override-source-required', basis: 'eligibility override did not include source evidence' };
  }
  if (override?.eligible === false) {
    return { eligible: false, status: 'ineligible-by-explicit-override', basis: override.source ?? override.status ?? 'caller-supplied-eligibility-override' };
  }
  if (rule.minimumMinutesForCountedGame === null || rule.minimumMinutesForCountedGame === undefined) {
    return gp >= rule.minimumCountedGames
      ? { eligible: true, status: 'eligible', basis: 'season-policy-minimum-games' }
      : { eligible: false, status: 'below-minimum-games', basis: `requires-${rule.minimumCountedGames}-counted-games` };
  }
  const gameRows = candidate._logs;
  const minuteRows = gameRows.map(row => valueFrom(row.stats, STAT_ALIASES.minutes));
  const hasCompleteMinutes = gameRows.length >= gp && minuteRows.length > 0 && minuteRows.every(value => value !== null);
  if (!hasCompleteMinutes) return gp >= rule.minimumCountedGames
    ? { eligible: true, status: 'provisional-minutes-unverified', basis: 'games-played-threshold-met-but-minute-level-evidence-incomplete' }
    : { eligible: false, status: override?.seasonEndingInjury === true ? 'injury-exception-evidence-unresolved' : 'below-minimum-games', basis: 'insufficient-counted-game-or-minute-level-evidence' };
  const twentyPlus = minuteRows.filter(minutes => minutes >= rule.minimumMinutesForCountedGame).length;
  const shortMinutes = minuteRows.filter(minutes => minutes >= rule.shortGameMinimumMinutes && minutes < rule.minimumMinutesForCountedGame).length;
  const counted = twentyPlus + Math.min(rule.shortGameAllowance, shortMinutes);
  if (counted >= rule.minimumCountedGames) {
    return { eligible: true, status: 'eligible', basis: 'CBA-counted-games-and-minutes-rule' };
  }
  const injuryException = override?.seasonEndingInjury === true
    && counted >= rule.seasonEndingInjuryException.minimumCountedGames
    && finite(override.preInjuryTeamGameShare) >= rule.seasonEndingInjuryException.minimumPreInjuryTeamGameShare
    && hasEligibilitySource(override.source);
  if (injuryException) {
    return { eligible: true, status: 'eligible-season-ending-injury-exception', basis: override.source ?? 'caller-supplied-injury-eligibility-evidence' };
  }
  return {
    eligible: false,
    status: counted >= rule.seasonEndingInjuryException.minimumCountedGames ? 'injury-exception-evidence-unresolved' : 'below-cba-counted-games',
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

function seasonCoverage(state, seasonStartYear, policy, requestedComplete) {
  const seasonTeams = state.teams.map(team => ({
    teamCode: team.teamCode,
    gamesPlayed: finite(team.seasonStatsByYear?.[String(seasonStartYear)]?.gamesPlayed) ?? 0,
  }));
  const expected = finite(policy.expectedRegularSeasonGames ?? state.expectedRegularSeasonGames ?? state.scheduleState?.regularSeasonGames);
  const inferredComplete = expected !== null && seasonTeams.length > 0 && seasonTeams.every(team => team.gamesPlayed >= expected);
  const declaredComplete = state.scheduleState?.status === 'complete' || state.seasonSchedule?.status === 'complete';
  const complete = typeof requestedComplete === 'boolean' ? requestedComplete : inferredComplete || declaredComplete;
  return {
    seasonComplete: complete,
    completionEvidence: typeof requestedComplete === 'boolean' ? 'caller-supplied' : declaredComplete ? 'league-schedule-state' : inferredComplete ? 'all-teams-reached-expected-game-count' : 'not-established',
    expectedRegularSeasonGames: expected,
    teamGamesPlayed: seasonTeams,
    teamsWithExpectedGames: expected === null ? null : seasonTeams.filter(team => team.gamesPlayed >= expected).length,
    teamCount: seasonTeams.length,
    playerGameLogCount: seasonRows(state, seasonStartYear).length,
  };
}

function publicCandidate(candidate) {
  const { _logs, ...row } = candidate;
  return structuredClone(row);
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
  return {
    award: name,
    status: 'simulated-vote',
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
  return {
    status: complete ? 'simulated-selection' : positionMode === 'positionless' ? 'partial-candidate-pool' : 'position-data-or-candidate-pool-incomplete',
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
  const status = complete ? 'simulated-selection' : policy.positionMode === 'positionless' ? 'partial-candidate-pool' : 'position-data-or-candidate-pool-incomplete';
  return {
    status,
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
    results.push({
      conference,
      status: selectionCount === requiredCount ? 'simulated-selection' : 'partial-roster',
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
  return {
    status: complete ? 'simulated-selection' : missingConference ? 'conference-data-incomplete' : 'partial-rosters-or-voting-pool',
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
  const mvpScoreByName = new Map(mvpScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate.modelScore]));
  const dpoyScoreByName = new Map(dpoyScored.map(candidate => [normalizeCanonicalPlayerName(candidate.canonicalName), candidate.modelScore]));
  const allNbaScored = mvpScored.map(candidate => ({ ...candidate, allNbaScore: candidate.modelScore * 0.8 + (dpoyScoreByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)) ?? 50) * 0.2 }));
  const allStarCandidates = baseCandidates.map(candidate => ({
    ...candidate,
    metrics: {
      ...candidate.metrics,
      mvpScore: mvpScoreByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)) ?? null,
      dpoyScore: dpoyScoreByName.get(normalizeCanonicalPlayerName(candidate.canonicalName)) ?? null,
    },
  }));
  const coverage = seasonCoverage(state, seasonStartYear, policy, seasonComplete);
  const mvp = buildAwardResult('Most Valuable Player', mvpScored, state, seasonStartYear, policy, (Number(seed) + 101) >>> 0);
  const defensivePlayerOfTheYear = buildAwardResult('Defensive Player of the Year', dpoyScored, state, seasonStartYear, policy, (Number(seed) + 211) >>> 0);
  const allNba = allNbaSelections(allNbaScored, policy);
  const allDefensive = allDefensiveSelections(dpoyScored, policy.allDefensive, (Number(seed) + 401) >>> 0);
  const allRookie = allRookieSelections(candidatesWithRookieStatus, policy.allRookie, (Number(seed) + 503) >>> 0);
  const allStar = simulateAllStar(allStarCandidates, policy.allStar, (Number(seed) + 307) >>> 0);
  const assumptions = [];
  if (!coverage.seasonComplete) assumptions.push('Season completion was not established from the supplied schedule state or expected game count; award assignments are provisional for partial-season data.');
  if (policy.allStar.futureFormatAssumption) assumptions.push('The All-Star selection structure is carried forward as an editable scenario assumption because the season-specific future event format may change.');
  if (policy.allDefensive.futureFormatAssumption) assumptions.push('The All-Defensive panel size, team size, and selection format are carried forward as editable future-season assumptions.');
  if (policy.allRookie.futureFormatAssumption) assumptions.push('The All-Rookie panel size, team size, and selection format are carried forward as editable future-season assumptions.');
  if (mvpScored.some(candidate => candidate.eligibility.status === 'provisional-minutes-unverified')) assumptions.push('Some major-award eligibility depends on unavailable game-level minutes and is provisional.');
  if (allStar.status !== 'simulated-selection') assumptions.push('All-Star conference or candidate coverage is incomplete; only available simulated ballot evidence is shown.');
  if (allDefensive.status !== 'simulated-selection') assumptions.push('All-Defensive candidate coverage, eligibility, or position data is incomplete; the output is partial or unresolved.');
  if (allRookie.status !== 'simulated-selection') assumptions.push('All-Rookie selections require sourced rookie eligibility; missing or conflicting rookie evidence is not treated as eligible.');
  if (allNba.status !== 'simulated-selection') assumptions.push('All-NBA candidate coverage, eligibility, or position data is incomplete; the output is partial.');
  const awardSectionsComplete = [allNba, allDefensive, allRookie, allStar].every(section => section.status === 'simulated-selection');
  const result = {
    format: SEASON_AWARDS_FORMAT,
    schemaVersion: '1.0.0',
    modelId: 'djhc-simulated-season-awards-v1',
    status: coverage.seasonComplete && !policy.allStar.futureFormatAssumption
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
    assumptions,
    disclosure: 'These are reproducible simulated awards and ballots based on the supplied simulated season, box scores, team results, and available DJHC ratings. They are not official NBA results, predictions of actual voters, or calibrated award forecasts. Historical NBA awards are not used as player-skill inputs.',
  };
  result.historyRecord = compactHistory(result);
  return result;
}

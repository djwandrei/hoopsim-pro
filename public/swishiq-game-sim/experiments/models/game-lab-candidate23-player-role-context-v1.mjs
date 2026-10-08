/*
 * Candidate 23 prior-game player scoring and offensive-load concentration.
 * Player-game lines are deduplicated and points are reconciled to eligible
 * team-game rows before any feature is rolled forward by complete local dates.
 */
export const CANDIDATE23_ROLE_CONTEXT_FORMAT = 'swishiq-candidate23-player-role-history-context-v1';
const WINDOW = 20;
const PRIOR_TEAM_GAMES = 8;
const PLAYER_FIELDS = Object.freeze([
  'points', 'fieldGoalAttempts', 'freeThrowAttempts', 'turnovers',
]);
const FEATURE_FIELDS = Object.freeze([
  'topScorerPointsShare20',
  'topThreeScorersPointsShare20',
  'scoringConcentrationHhi20',
  'topUsagePlayerLoadShare20',
  'topThreeUsagePlayersLoadShare20',
  'usageConcentrationHhi20',
  'topThreeUsagePlayersTrueShooting20',
]);
const COLD_START_PRIORS = Object.freeze({
  topScorerPointsShare20: 0.29,
  topThreeScorersPointsShare20: 0.72,
  scoringConcentrationHhi20: 0.15,
  topUsagePlayerLoadShare20: 0.29,
  topThreeUsagePlayersLoadShare20: 0.72,
  usageConcentrationHhi20: 0.15,
  topThreeUsagePlayersTrueShooting20: 0.55,
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
function fail(message) { throw new TypeError(message); }
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function normalizeScorelessTargets(targets, historicalRefs) {
  if (targets === undefined) return [];
  if (!Array.isArray(targets)) fail('Candidate 23 scoreless targets must be an array.');
  const seen = new Set();
  return targets.map(target => {
    if (!target || typeof target !== 'object' || typeof target.gameRef !== 'string' || !target.gameRef
        || !Number.isSafeInteger(target.seasonStartYear) || !validDate(target.gameDateLocal)
        || target.phase !== 'regular'
        || typeof target.homeTeamRef !== 'string' || !target.homeTeamRef
        || typeof target.awayTeamRef !== 'string' || !target.awayTeamRef
        || target.homeTeamRef === target.awayTeamRef) {
      fail('Candidate 23 scoreless target requires regular-season schedule identity only.');
    }
    if (seen.has(target.gameRef) || historicalRefs.has(target.gameRef)) {
      fail('Candidate 23 scoreless target references must be unique and absent from history.');
    }
    seen.add(target.gameRef);
    return {
      gameRef: target.gameRef,
      seasonStartYear: target.seasonStartYear,
      gameDateLocal: target.gameDateLocal,
      phase: 'regular',
      homeTeamRef: target.homeTeamRef,
      awayTeamRef: target.awayTeamRef,
    };
  });
}

function summarizeTeamGame(players, date) {
  const points = players.reduce((sum, player) => sum + player.points, 0);
  if (!(points > 0)) fail('Candidate 23 team-game points denominator must be positive.');
  const usagePlayers = players.map(player => ({
    ...player,
    usageLoad: player.fieldGoalAttempts + 0.44 * player.freeThrowAttempts + player.turnovers,
  })).filter(player => player.usageLoad > 0);
  const totalUsageLoad = usagePlayers.reduce((sum, player) => sum + player.usageLoad, 0);
  if (!(totalUsageLoad > 0)) fail('Candidate 23 team-game usage-proxy denominator must be positive.');
  const scoringShares = players.map(player => player.points / points).sort((a, b) => b - a);
  const usageShares = usagePlayers.map(player => player.usageLoad / totalUsageLoad).sort((a, b) => b - a);
  const topThreeUsage = usagePlayers.slice().sort((a, b) => b.usageLoad - a.usageLoad).slice(0, 3);
  const topThreeShotLoad = topThreeUsage.reduce((sum, player) => sum + player.fieldGoalAttempts + 0.44 * player.freeThrowAttempts, 0);
  const topThreePoints = topThreeUsage.reduce((sum, player) => sum + player.points, 0);
  const topThreeUsageLoad = topThreeUsage.reduce((sum, player) => sum + player.usageLoad, 0);
  if (!(topThreeShotLoad > 0) || !(topThreeUsageLoad > 0)) {
    fail('Candidate 23 top-three usage efficiency denominator must be positive.');
  }
  const values = {
    topScorerPointsShare20: scoringShares[0] ?? 0,
    topThreeScorersPointsShare20: scoringShares.slice(0, 3).reduce((sum, share) => sum + share, 0),
    scoringConcentrationHhi20: scoringShares.reduce((sum, share) => sum + share * share, 0),
    topUsagePlayerLoadShare20: usageShares[0] ?? 0,
    topThreeUsagePlayersLoadShare20: usageShares.slice(0, 3).reduce((sum, share) => sum + share, 0),
    usageConcentrationHhi20: usageShares.reduce((sum, share) => sum + share * share, 0),
    topThreeUsagePlayersTrueShooting20: topThreePoints / (2 * topThreeShotLoad),
  };
  if (Object.entries(values).some(([field, value]) => !finite(value) || value < 0
      || value > (field === 'topThreeUsagePlayersTrueShooting20' ? 1.6 : 1))) {
    fail('Candidate 23 derived role context must be finite and within its statistical range.');
  }
  return { gameDateLocal: date, values };
}

function shrink(values, globalMean) {
  const tail = values.slice(-WINDOW);
  const denominator = tail.length + PRIOR_TEAM_GAMES;
  return Object.fromEntries(FEATURE_FIELDS.map(field => [field,
    (tail.reduce((sum, row) => sum + row.values[field], 0) + globalMean[field] * PRIOR_TEAM_GAMES) / denominator,
  ]));
}

export function buildCandidate23PlayerRoleContexts({ playerGameRows, teamGameRows, targets } = {}) {
  if (!Array.isArray(playerGameRows) || !playerGameRows.length
      || !Array.isArray(teamGameRows) || !teamGameRows.length) {
    fail('Candidate 23 requires player-game and team-game V4 records.');
  }
  const playerGroups = new Map();
  const seenPlayers = new Set();
  let sourcePlayerRows = 0;
  let duplicatePlayerRowsRejected = 0;
  for (const row of playerGameRows) {
    if (row?.time?.phase !== 'regular' || row?.evidence?.status !== 'available') continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const playerRef = row.entities?.playerRef;
    const date = row.time.gameDateLocal;
    const box = row.values?.box;
    if (typeof gameRef !== 'string' || !gameRef || typeof teamCode !== 'string' || !teamCode
        || typeof playerRef !== 'string' || !playerRef || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')
        || !box || PLAYER_FIELDS.some(field => !finite(box[field]) || box[field] < 0)) {
      fail('Candidate 23 player-game row lacks a valid identity, date, or offensive-load field.');
    }
    const playerKey = gameRef + '|' + teamCode + '|' + playerRef;
    if (seenPlayers.has(playerKey)) {
      duplicatePlayerRowsRejected += 1;
      fail('Candidate 23 source contains duplicate player-game identity ' + playerKey);
    }
    seenPlayers.add(playerKey);
    const key = gameRef + '|' + teamCode;
    const group = playerGroups.get(key) || { gameRef, teamCode, date, seasonStartYear: row.time.seasonStartYear, players: [] };
    if (group.date !== date || group.seasonStartYear !== row.time.seasonStartYear) {
      fail('Candidate 23 player-game rows disagree on local game date or season.');
    }
    group.players.push({ playerRef, ...Object.fromEntries(PLAYER_FIELDS.map(field => [field, box[field]])) });
    playerGroups.set(key, group);
    sourcePlayerRows += 1;
  }

  const paired = new Map();
  for (const row of teamGameRows) {
    if (row?.time?.phase !== 'regular' || row?.values?.reconciliationStatus !== 'matched'
        || row?.values?.trainingEligible !== true) continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const key = gameRef + '|' + teamCode;
    const group = playerGroups.get(key);
    if (!group || group.date !== row.time.gameDateLocal || group.seasonStartYear !== row.time.seasonStartYear) {
      fail('Candidate 23 has no date-matched player-game group for eligible team-game ' + key);
    }
    const playerPoints = group.players.reduce((sum, player) => sum + player.points, 0);
    if (playerPoints !== row.values.pointsFor) {
      fail('Candidate 23 player-game points do not reconcile to team-game points for ' + key);
    }
    const sides = paired.get(gameRef) || [];
    sides.push({ row, context: summarizeTeamGame(group.players, group.date) });
    paired.set(gameRef, sides);
  }

  const games = [];
  for (const [gameRef, sides] of paired) {
    if (sides.length !== 2) fail('Candidate 23 requires exactly two eligible team sides for ' + gameRef);
    const home = sides.find(item => item.row.values.isHome === true);
    const away = sides.find(item => item.row.values.isHome === false);
    if (!home || !away || home.row.entities.teamCode !== away.row.entities.opponentTeamCode
        || away.row.entities.teamCode !== home.row.entities.opponentTeamCode
        || home.row.time.gameDateLocal !== away.row.time.gameDateLocal
        || home.row.values.pointsFor !== away.row.values.pointsAgainst
        || away.row.values.pointsFor !== home.row.values.pointsAgainst) {
      fail('Candidate 23 paired team-game identities or scores are inconsistent for ' + gameRef);
    }
    games.push({
      gameRef,
      gameDateLocal: home.row.time.gameDateLocal,
      homeTeam: home.row.entities.teamCode,
      awayTeam: away.row.entities.teamCode,
      home: home.context,
      away: away.context,
    });
  }
  games.sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  const normalizedTargets = normalizeScorelessTargets(targets, new Set(games.map(game => game.gameRef)));

  const contexts = new Map();
  const targetContexts = new Map();
  const teamHistory = new Map();
  const global = Object.fromEntries(FEATURE_FIELDS.map(field => [field, { sum: 0, count: 0 }]));
  let observedThrough = null;
  const captureSide = teamCode => {
    const history = teamHistory.get(teamCode) || [];
    const globalMean = Object.fromEntries(FEATURE_FIELDS.map(field => [field,
      global[field].count ? global[field].sum / global[field].count : COLD_START_PRIORS[field],
    ]));
    return { historyGameCount: history.length, ...shrink(history, globalMean) };
  };
  const gamesByDate = new Map();
  for (const game of games) {
    const day = gamesByDate.get(game.gameDateLocal) || [];
    day.push(game);
    gamesByDate.set(game.gameDateLocal, day);
  }
  const targetsByDate = new Map();
  for (const target of normalizedTargets) {
    const day = targetsByDate.get(target.gameDateLocal) || [];
    day.push(target);
    targetsByDate.set(target.gameDateLocal, day);
  }
  const eventDates = [...new Set([...gamesByDate.keys(), ...targetsByDate.keys()])].sort();
  for (const date of eventDates) {
    const day = gamesByDate.get(date) || [];
    const dayTargets = targetsByDate.get(date) || [];
    for (const game of day) {
      const context = {
        format: CANDIDATE23_ROLE_CONTEXT_FORMAT,
        gameDateLocal: game.gameDateLocal,
        observedThrough,
        sourcePriorTeamGameCount: global[FEATURE_FIELDS[0]].count,
        home: captureSide(game.homeTeam),
        away: captureSide(game.awayTeam),
      };
      if ((observedThrough != null && observedThrough >= game.gameDateLocal)
          || FEATURE_FIELDS.some(field => !finite(context.home[field]) || !finite(context.away[field]))) {
        fail('Candidate 23 context is incomplete or contains same-date/future outcomes.');
      }
      contexts.set(game.gameRef, context);
    }
    for (const target of dayTargets) {
      const context = {
        format: CANDIDATE23_ROLE_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough,
        sourcePriorTeamGameCount: global[FEATURE_FIELDS[0]].count,
        home: captureSide(target.homeTeamRef),
        away: captureSide(target.awayTeamRef),
      };
      if ((observedThrough != null && observedThrough >= date)
          || FEATURE_FIELDS.some(field => !finite(context.home[field]) || !finite(context.away[field]))) {
        fail('Candidate 23 scoreless target context is incomplete or contains same-date/future outcomes.');
      }
      targetContexts.set(target.gameRef, context);
    }
    for (const game of day) {
      for (const [teamCode, values] of [[game.homeTeam, game.home], [game.awayTeam, game.away]]) {
        const history = teamHistory.get(teamCode) || [];
        history.push(values);
        teamHistory.set(teamCode, history);
        for (const field of FEATURE_FIELDS) {
          global[field].sum += values.values[field];
          global[field].count += 1;
        }
      }
    }
    if (day.length) observedThrough = day[day.length - 1].gameDateLocal;
  }
  const result = {
    contexts,
    audit: Object.freeze({
      format: CANDIDATE23_ROLE_CONTEXT_FORMAT,
      sourcePlayerRows,
      duplicatePlayerRowsRejected,
      pairedGameCount: games.length,
      contextCount: contexts.size,
      teamScoreReconciliationChecks: games.length * 2,
      sameLocalDateOutcomesExcluded: true,
      contextCapture: 'all target contexts on a local date are captured before that date is added to history',
      rollingWindowTeamGames: WINDOW,
      shrinkagePriorTeamGames: PRIOR_TEAM_GAMES,
      usageProxy: 'fieldGoalAttempts + 0.44 * freeThrowAttempts + turnovers; derived from prior player-game box-score lines',
      featureFields: FEATURE_FIELDS,
    }),
  };
  if (normalizedTargets.length) result.targetContexts = targetContexts;
  return result;
}

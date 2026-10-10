/*
 * Candidate 21 prior-game team box-score context.
 *
 * Player-game box scores are aggregated to team-game records, checked against
 * the paired team-game point totals, converted to Four Factors / efficiency
 * proxies, then rolled forward by whole local dates. Contexts are captured
 * before any game on a date is added to history.
 */
export const CANDIDATE21_BOXSCORE_CONTEXT_FORMAT = 'swishiq-candidate21-boxscore-history-context-v2';
const PRIOR_WEIGHT = 8;
const WINDOW = 20;
const FIELDS = Object.freeze([
  'effectiveFieldGoalPct20',
  'turnoverRate20',
  'offensiveReboundRate20',
  'freeThrowRate20',
  'opponentEffectiveFieldGoalPct20',
  'opponentTurnoverRate20',
  'opponentOffensiveReboundRate20',
  'opponentFreeThrowRate20',
  'estimatedPossessions20',
  'pace20',
  'offensiveRating20',
  'defensiveRatingAllowance20',
  'opponentAdjustedEffectiveFieldGoalPct20',
  'opponentAdjustedTurnoverRate20',
  'opponentAdjustedOffensiveReboundRate20',
  'opponentAdjustedFreeThrowRate20',
]);
const ANCHORS = Object.freeze({
  effectiveFieldGoalPct20: 0.52,
  turnoverRate20: 0.13,
  offensiveReboundRate20: 0.25,
  freeThrowRate20: 0.24,
  opponentEffectiveFieldGoalPct20: 0.52,
  opponentTurnoverRate20: 0.13,
  opponentOffensiveReboundRate20: 0.25,
  opponentFreeThrowRate20: 0.24,
  estimatedPossessions20: 100,
  pace20: 100,
  offensiveRating20: 110,
  defensiveRatingAllowance20: 110,
  opponentAdjustedEffectiveFieldGoalPct20: 0.52,
  opponentAdjustedTurnoverRate20: 0.13,
  opponentAdjustedOffensiveReboundRate20: 0.25,
  opponentAdjustedFreeThrowRate20: 0.24,
});
const BOX_FIELDS = Object.freeze([
  'points', 'fieldGoalAttempts', 'fieldGoalsMade', 'threePointersMade',
  'freeThrowAttempts', 'offensiveRebounds', 'defensiveRebounds', 'turnovers',
]);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
function fail(message) { throw new TypeError(message); }

function computeSideMetrics(own, opponent) {
  const attempts = own.fieldGoalAttempts;
  const freeThrows = own.freeThrowAttempts;
  const possessions = attempts + 0.44 * freeThrows - own.offensiveRebounds + own.turnovers;
  const opponentPossessions = opponent.fieldGoalAttempts + 0.44 * opponent.freeThrowAttempts
    - opponent.offensiveRebounds + opponent.turnovers;
  if (!(attempts > 0) || !(freeThrows >= 0) || !(possessions > 0) || !(opponentPossessions > 0)
      || !(own.offensiveRebounds + opponent.defensiveRebounds > 0)
      || !(opponent.offensiveRebounds + own.defensiveRebounds > 0)) {
    fail('A paired team-game box score has a zero or invalid Four Factors denominator.');
  }
  const efg = (own.fieldGoalsMade + 0.5 * own.threePointersMade) / attempts;
  const opponentEfg = (opponent.fieldGoalsMade + 0.5 * opponent.threePointersMade) / opponent.fieldGoalAttempts;
  const ownTov = own.turnovers / possessions;
  const opponentTov = opponent.turnovers / opponentPossessions;
  const ownOrb = own.offensiveRebounds / (own.offensiveRebounds + opponent.defensiveRebounds);
  const opponentOrb = opponent.offensiveRebounds / (opponent.offensiveRebounds + own.defensiveRebounds);
  const ownFtr = freeThrows / attempts;
  const opponentFtr = opponent.freeThrowAttempts / opponent.fieldGoalAttempts;
  return {
    effectiveFieldGoalPct: efg,
    turnoverRate: ownTov,
    offensiveReboundRate: ownOrb,
    freeThrowRate: ownFtr,
    opponentEffectiveFieldGoalPct: opponentEfg,
    opponentTurnoverRate: opponentTov,
    opponentOffensiveReboundRate: opponentOrb,
    opponentFreeThrowRate: opponentFtr,
    estimatedPossessions: possessions,
    pace: (possessions + opponentPossessions) / 2,
    offensiveRating: 100 * own.points / possessions,
    defensiveRatingAllowance: 100 * opponent.points / opponentPossessions,
  };
}

function shrinkTail(rows, sourceField, outputField, leagueAnchor) {
  const tail = rows.slice(-WINDOW);
  const sum = tail.reduce((total, row) => total + row[sourceField], 0);
  return (sum + PRIOR_WEIGHT * leagueAnchor) / (tail.length + PRIOR_WEIGHT);
}

function finiteBoxscoreContext(side, date, observedThrough) {
  if (!side || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
      || !FIELDS.every(field => isFiniteNumber(side[field]))
      || FIELDS.some(field => Math.abs(side[field]) > 400)
      || (observedThrough != null && observedThrough >= date)) {
    fail('Candidate 21 box-score context is incomplete or not strictly prior to its target date.');
  }
}

export function buildCandidate21BoxscoreContexts({ playerGameRows, teamGameRows } = {}) {
  if (!Array.isArray(playerGameRows) || !playerGameRows.length
      || !Array.isArray(teamGameRows) || !teamGameRows.length) {
    fail('Player-game and team-game V4 records are required.');
  }
  const playerAggregates = new Map();
  let eligiblePlayerRows = 0;
  for (const row of playerGameRows) {
    if (row?.time?.phase !== 'regular' || row?.evidence?.status !== 'available') continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const box = row.values?.box;
    if (typeof gameRef !== 'string' || !gameRef || typeof teamCode !== 'string' || !teamCode || !box) {
      fail('Candidate 21 player-game row is missing a team-game identity or box score.');
    }
    if (!BOX_FIELDS.every(field => isFiniteNumber(box[field]) && box[field] >= 0)) {
      fail('Candidate 21 player-game row is missing a required four-factor box-score field.');
    }
    const key = gameRef + '|' + teamCode;
    const aggregate = playerAggregates.get(key) || {
      gameRef,
      teamCode,
      seasonStartYear: row.time.seasonStartYear,
      gameDateLocal: row.time.gameDateLocal,
      playerRowCount: 0,
      stats: Object.fromEntries(BOX_FIELDS.map(field => [field, 0])),
    };
    if (aggregate.seasonStartYear !== row.time.seasonStartYear
        || aggregate.gameDateLocal !== row.time.gameDateLocal) {
      fail('Candidate 21 player-game rows disagree on team-game date or season.');
    }
    aggregate.playerRowCount += 1;
    for (const field of BOX_FIELDS) aggregate.stats[field] += box[field];
    playerAggregates.set(key, aggregate);
    eligiblePlayerRows += 1;
  }

  const paired = new Map();
  for (const row of teamGameRows) {
    if (row?.time?.phase !== 'regular' || row?.values?.reconciliationStatus !== 'matched'
        || row?.values?.trainingEligible !== true) continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const key = gameRef + '|' + teamCode;
    const aggregate = playerAggregates.get(key);
    if (!aggregate) fail('No player-game aggregate exists for eligible team-game ' + key);
    if (aggregate.seasonStartYear !== row.time.seasonStartYear
        || aggregate.gameDateLocal !== row.time.gameDateLocal
        || aggregate.stats.points !== row.values.pointsFor) {
      fail('Player box-score sum does not reconcile to eligible team-game points/date for ' + key);
    }
    const sides = paired.get(gameRef) || [];
    sides.push({ row, aggregate });
    paired.set(gameRef, sides);
  }

  const games = [];
  for (const [gameRef, sides] of paired) {
    if (sides.length !== 2) fail('Expected exactly two eligible team sides for ' + gameRef);
    const home = sides.find(item => item.row.values.isHome === true);
    const away = sides.find(item => item.row.values.isHome === false);
    if (!home || !away || home.row.entities.teamCode !== away.row.entities.opponentTeamCode
        || away.row.entities.teamCode !== home.row.entities.opponentTeamCode
        || home.row.time.gameDateLocal !== away.row.time.gameDateLocal
        || home.row.time.seasonStartYear !== away.row.time.seasonStartYear
        || home.row.values.pointsFor !== away.row.values.pointsAgainst
        || away.row.values.pointsFor !== home.row.values.pointsAgainst) {
      fail('Candidate 21 paired team-game identity is inconsistent for ' + gameRef);
    }
    const common = {
      gameRef,
      seasonStartYear: home.row.time.seasonStartYear,
      gameDateLocal: home.row.time.gameDateLocal,
    };
    const homeStats = computeSideMetrics(home.aggregate.stats, away.aggregate.stats);
    const awayStats = computeSideMetrics(away.aggregate.stats, home.aggregate.stats);
    games.push({
      ...common,
      sides: [
        { teamCode: home.row.entities.teamCode, ...homeStats },
        { teamCode: away.row.entities.teamCode, ...awayStats },
      ],
    });
  }
  games.sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));

  const contexts = new Map();
  const teamHistory = new Map();
  const global = { count: 0, sums: Object.fromEntries(FIELDS.map(field => [field, 0])) };
  let observedThrough = null;
  const globalMean = field => global.count ? global.sums[field] / global.count : ANCHORS[field];
  const sideContext = teamCode => {
    const history = teamHistory.get(teamCode) || [];
    const context = { historyGameCount: history.length };
    for (const field of FIELDS) context[field] = shrinkTail(history, field.slice(0, -2), field, globalMean(field));
    return context;
  };
  for (let first = 0; first < games.length;) {
    let end = first + 1;
    while (end < games.length && games[end].gameDateLocal === games[first].gameDateLocal) end += 1;
    const day = games.slice(first, end);
    for (const game of day) {
      const home = game.sides.find(side => side.teamCode !== undefined && side === game.sides[0]);
      const away = game.sides[1];
      const context = {
        format: CANDIDATE21_BOXSCORE_CONTEXT_FORMAT,
        gameDateLocal: game.gameDateLocal,
        observedThrough,
        sourcePriorTeamGameCount: global.count,
        home: sideContext(home.teamCode),
        away: sideContext(away.teamCode),
      };
      finiteBoxscoreContext(context.home, game.gameDateLocal, observedThrough);
      finiteBoxscoreContext(context.away, game.gameDateLocal, observedThrough);
      contexts.set(game.gameRef, context);
    }
    // Calculate every adjustment from one as-of-date snapshot before adding
    // any result from this date to either the team histories or league means.
    const dayRows = day.map(game => {
      const [home, away] = game.sides;
      const homeOpponentPrior = sideContext(away.teamCode);
      const awayOpponentPrior = sideContext(home.teamCode);
      const leagueAllowance = {
        effectiveFieldGoalPct: globalMean('opponentEffectiveFieldGoalPct20'),
        turnoverRate: globalMean('opponentTurnoverRate20'),
        offensiveReboundRate: globalMean('opponentOffensiveReboundRate20'),
        freeThrowRate: globalMean('opponentFreeThrowRate20'),
      };
      const adjusted = (own, opponentPrior) => ({
        opponentAdjustedEffectiveFieldGoalPct: own.effectiveFieldGoalPct
          - (opponentPrior.opponentEffectiveFieldGoalPct20 - leagueAllowance.effectiveFieldGoalPct),
        opponentAdjustedTurnoverRate: own.turnoverRate
          - (opponentPrior.opponentTurnoverRate20 - leagueAllowance.turnoverRate),
        opponentAdjustedOffensiveReboundRate: own.offensiveReboundRate
          - (opponentPrior.opponentOffensiveReboundRate20 - leagueAllowance.offensiveReboundRate),
        opponentAdjustedFreeThrowRate: own.freeThrowRate
          - (opponentPrior.opponentFreeThrowRate20 - leagueAllowance.freeThrowRate),
      });
      return {
        home,
        away,
        homeAdjusted: adjusted(home, homeOpponentPrior),
        awayAdjusted: adjusted(away, awayOpponentPrior),
      };
    });
    for (const { home, away, homeAdjusted, awayAdjusted } of dayRows) {
      for (const [team, own, opponent, adjusted] of [
        [home, home, away, homeAdjusted], [away, away, home, awayAdjusted],
      ]) {
        const row = {
          effectiveFieldGoalPct: own.effectiveFieldGoalPct,
          turnoverRate: own.turnoverRate,
          offensiveReboundRate: own.offensiveReboundRate,
          freeThrowRate: own.freeThrowRate,
          opponentEffectiveFieldGoalPct: opponent.effectiveFieldGoalPct,
          opponentTurnoverRate: opponent.turnoverRate,
          opponentOffensiveReboundRate: opponent.offensiveReboundRate,
          opponentFreeThrowRate: opponent.freeThrowRate,
          estimatedPossessions: own.estimatedPossessions,
          pace: (own.estimatedPossessions + opponent.estimatedPossessions) / 2,
          offensiveRating: own.offensiveRating,
          defensiveRatingAllowance: own.defensiveRatingAllowance,
          ...adjusted,
        };
        const destination = teamHistory.get(team.teamCode) || [];
        destination.push(row);
        teamHistory.set(team.teamCode, destination);
        for (const field of FIELDS) global.sums[field] += row[field.slice(0, -2)];
        global.count += 1;
      }
    }
    observedThrough = gameDateLocalOf(day[day.length - 1]);
    first = end;
  }

  return {
    contexts,
    audit: Object.freeze({
      format: CANDIDATE21_BOXSCORE_CONTEXT_FORMAT,
      sourceEligiblePlayerRows: eligiblePlayerRows,
      pairedGameCount: games.length,
      contextCount: contexts.size,
      sameLocalDateOutcomesExcluded: true,
      contextCapture: 'all target contexts on a date are captured before player-game outcomes from that date are applied',
      rollingWindowTeamGames: WINDOW,
      shrinkagePriorTeamGames: PRIOR_WEIGHT,
        pointReconciliations: 'every eligible player aggregate points sum equals the paired team-games pointsFor value',
        opponentAdjustedFourFactors: 'each prior game factor is adjusted by subtracting the opponent\'s strictly prior defensive allowance above the league allowance snapshot from before that game date; target-date outcomes are excluded',
        opponentAdjustedFactorRollingWindow: 'last 20 prior team games, shrunk by eight prior-equivalent team games toward the prior league adjusted-factor mean',
        formulas: Object.freeze({
        effectiveFieldGoalPct: '(FGM + 0.5 * 3PM) / FGA',
        turnoverRate: 'TOV / (FGA + 0.44 * FTA - OREB + TOV)',
        offensiveReboundRate: 'OREB / (OREB + opponent DREB)',
        freeThrowRate: 'FTA / FGA',
        estimatedPossessions: 'FGA + 0.44 * FTA - OREB + TOV',
        offensiveRating: '100 * points / estimated possessions',
        defensiveRatingAllowance: '100 * opponent points / opponent estimated possessions',
        opponentAdjustedEffectiveFieldGoalPct: 'team eFG - (opponent prior allowed eFG - prior league allowed eFG)',
        opponentAdjustedTurnoverRate: 'team turnover rate - (opponent prior opponent-turnover rate - prior league opponent-turnover rate)',
        opponentAdjustedOffensiveReboundRate: 'team offensive-rebound rate - (opponent prior opponent-offensive-rebound rate - prior league opponent-offensive-rebound rate)',
        opponentAdjustedFreeThrowRate: 'team free-throw rate - (opponent prior opponent-free-throw rate - prior league opponent-free-throw rate)',
      }),
    }),
  };
}

function gameDateLocalOf(game) {
  return game.gameDateLocal;
}

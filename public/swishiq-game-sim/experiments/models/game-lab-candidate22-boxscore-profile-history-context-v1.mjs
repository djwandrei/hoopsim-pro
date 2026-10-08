/*
 * Candidate 22 prior-game shooting, creation, defensive-event, and foul
 * profile context. Player-game rows are aggregated and reconciled to matched
 * team-game points, then rolled forward by complete local game dates.
 */
export const CANDIDATE22_PROFILE_CONTEXT_FORMAT = 'swishiq-candidate22-boxscore-profile-history-context-v1';
const PRIOR_WEIGHT = 8;
const WINDOW = 20;
const RATE_SPECS = Object.freeze({
  threePointAttemptRate20: ['own', 'threePointAttempts', 'fieldGoalAttempts', 0.39, 88],
  threePointPct20: ['own', 'threePointersMade', 'threePointAttempts', 0.36, 35],
  opponentThreePointAttemptRate20: ['opponent', 'threePointAttempts', 'fieldGoalAttempts', 0.39, 88],
  opponentThreePointPct20: ['opponent', 'threePointersMade', 'threePointAttempts', 0.36, 35],
  twoPointAttemptRate20: ['own', 'twoPointAttempts', 'fieldGoalAttempts', 0.61, 88],
  twoPointPct20: ['own', 'twoPointMakes', 'twoPointAttempts', 0.54, 53],
  opponentTwoPointAttemptRate20: ['opponent', 'twoPointAttempts', 'fieldGoalAttempts', 0.61, 88],
  opponentTwoPointPct20: ['opponent', 'twoPointMakes', 'twoPointAttempts', 0.54, 53],
  assistPerMadeFieldGoal20: ['own', 'assists', 'fieldGoalsMade', 0.60, 40],
  opponentAssistPerMadeFieldGoal20: ['opponent', 'assists', 'fieldGoalsMade', 0.60, 40],
  stealsPer100Possessions20: ['own', 'steals', 'possessions', 7.5, 100, 100],
  opponentStealsPer100Possessions20: ['opponent', 'steals', 'possessions', 7.5, 100, 100],
  blocksPer100OpponentPossessions20: ['own', 'blocks', 'opponentPossessions', 4.5, 100, 100],
  opponentBlocksPer100OpponentPossessions20: ['opponent', 'blocks', 'opponentPossessions', 4.5, 100, 100],
  personalFoulsPer100Possessions20: ['own', 'personalFouls', 'possessions', 20, 100, 100],
  opponentPersonalFoulsPer100Possessions20: ['opponent', 'personalFouls', 'possessions', 20, 100, 100],
});
const FIELDS = Object.freeze(Object.keys(RATE_SPECS));
const SOURCE_FIELDS = Object.freeze([
  'points', 'fieldGoalAttempts', 'fieldGoalsMade', 'threePointAttempts',
  'threePointersMade', 'twoPointAttempts', 'twoPointMakes',
  'freeThrowAttempts', 'freeThrowsMade', 'offensiveRebounds', 'defensiveRebounds',
  'turnovers', 'assists', 'steals', 'blocks', 'personalFouls',
]);
const finite = value => typeof value === 'number' && Number.isFinite(value);
function fail(message) { throw new TypeError(message); }
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function normalizeScorelessTargets(targets, historicalRefs) {
  if (targets === undefined) return [];
  if (!Array.isArray(targets)) fail('Candidate 22 scoreless targets must be an array.');
  const seen = new Set();
  return targets.map(target => {
    if (!target || typeof target !== 'object' || typeof target.gameRef !== 'string' || !target.gameRef
        || !Number.isSafeInteger(target.seasonStartYear) || !validDate(target.gameDateLocal)
        || target.phase !== 'regular'
        || typeof target.homeTeamRef !== 'string' || !target.homeTeamRef
        || typeof target.awayTeamRef !== 'string' || !target.awayTeamRef
        || target.homeTeamRef === target.awayTeamRef) {
      fail('Candidate 22 scoreless target requires regular-season schedule identity only.');
    }
    if (seen.has(target.gameRef) || historicalRefs.has(target.gameRef)) {
      fail('Candidate 22 scoreless target references must be unique and absent from history.');
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

function deriveSide(own, opponent) {
  const possessions = own.fieldGoalAttempts + 0.44 * own.freeThrowAttempts
    - own.offensiveRebounds + own.turnovers;
  const opponentPossessions = opponent.fieldGoalAttempts + 0.44 * opponent.freeThrowAttempts
    - opponent.offensiveRebounds + opponent.turnovers;
  if (!(own.fieldGoalAttempts > 0) || !(own.threePointAttempts > 0) || !(own.twoPointAttempts > 0)
      || !(own.fieldGoalsMade > 0) || !(opponent.fieldGoalAttempts > 0)
      || !(opponent.threePointAttempts > 0) || !(opponent.twoPointAttempts > 0)
      || !(opponent.fieldGoalsMade > 0) || !(possessions > 0) || !(opponentPossessions > 0)) {
    fail('A paired player-box-score aggregate has a zero or invalid profile denominator.');
  }
  const sources = {
    own: { ...own, possessions, opponentPossessions },
    opponent: { ...opponent, possessions: opponentPossessions, opponentPossessions: possessions },
  };
  return Object.fromEntries(Object.entries(RATE_SPECS).map(([field, [side, numeratorField, denominatorField, , , multiplier = 1]]) => {
    const source = sources[side];
    return [field, { numerator: source[numeratorField] * multiplier, denominator: source[denominatorField] }];
  }));
}

function shrinkProfile(rows, global, field) {
  const [,, , anchor, fallbackExposure] = RATE_SPECS[field];
  const tail = rows.slice(-WINDOW);
  const numerator = tail.reduce((sum, row) => sum + row[field].numerator, 0);
  const denominator = tail.reduce((sum, row) => sum + row[field].denominator, 0);
  const leagueNumerator = global.sums[field].numerator;
  const leagueDenominator = global.sums[field].denominator;
  const leagueRate = leagueDenominator > 0 ? leagueNumerator / leagueDenominator : anchor;
  const averageExposure = global.count > 0 ? leagueDenominator / global.count : fallbackExposure;
  const priorExposure = PRIOR_WEIGHT * averageExposure;
  return (numerator + leagueRate * priorExposure) / (denominator + priorExposure);
}

function validateContextSide(side, date, observedThrough) {
  if (!side || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
      || !FIELDS.every(field => finite(side[field]))
      || (observedThrough != null && observedThrough >= date)) {
    fail('Candidate 22 profile context is incomplete or not strictly prior to its target date.');
  }
  for (const field of FIELDS) {
    if (side[field] < 0 || side[field] > 300) fail('Candidate 22 profile feature is outside its allowed range: ' + field);
  }
}

export function buildCandidate22BoxscoreProfileContexts({ playerGameRows, teamGameRows, targets } = {}) {
  if (!Array.isArray(playerGameRows) || !playerGameRows.length
      || !Array.isArray(teamGameRows) || !teamGameRows.length) {
    fail('Candidate 22 requires player-game and team-game V4 records.');
  }
  const aggregates = new Map();
  let eligiblePlayerRows = 0;
  let fieldGoalSplitChecks = 0;
  let pointsFormulaChecks = 0;
  for (const row of playerGameRows) {
    if (row?.time?.phase !== 'regular' || row?.evidence?.status !== 'available') continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const box = row.values?.box;
    if (typeof gameRef !== 'string' || !gameRef || typeof teamCode !== 'string' || !teamCode || !box
        || !SOURCE_FIELDS.every(field => finite(box[field]) && box[field] >= 0)) {
      fail('Candidate 22 player-game row is missing a required profile box-score field.');
    }
    if (box.fieldGoalAttempts !== box.twoPointAttempts + box.threePointAttempts
        || box.fieldGoalsMade !== box.twoPointMakes + box.threePointersMade
        || box.points !== 2 * box.twoPointMakes + 3 * box.threePointersMade + box.freeThrowsMade
        || box.twoPointMakes > box.twoPointAttempts || box.threePointersMade > box.threePointAttempts) {
      fail('Candidate 22 player-game box-score arithmetic does not reconcile.');
    }
    fieldGoalSplitChecks += 1;
    pointsFormulaChecks += 1;
    const key = gameRef + '|' + teamCode;
    const aggregate = aggregates.get(key) || {
      gameRef,
      teamCode,
      seasonStartYear: row.time.seasonStartYear,
      gameDateLocal: row.time.gameDateLocal,
      stats: Object.fromEntries(SOURCE_FIELDS.map(field => [field, 0])),
    };
    if (aggregate.seasonStartYear !== row.time.seasonStartYear
        || aggregate.gameDateLocal !== row.time.gameDateLocal) {
      fail('Candidate 22 player-game rows disagree on team-game season or local date.');
    }
    for (const field of SOURCE_FIELDS) aggregate.stats[field] += box[field];
    aggregates.set(key, aggregate);
    eligiblePlayerRows += 1;
  }

  const paired = new Map();
  for (const row of teamGameRows) {
    if (row?.time?.phase !== 'regular' || row?.values?.reconciliationStatus !== 'matched'
        || row?.values?.trainingEligible !== true) continue;
    const gameRef = row.entities?.gameRef;
    const teamCode = row.entities?.teamCode;
    const key = gameRef + '|' + teamCode;
    const aggregate = aggregates.get(key);
    if (!aggregate) fail('No Candidate 22 player aggregate exists for eligible team-game ' + key);
    if (aggregate.seasonStartYear !== row.time.seasonStartYear
        || aggregate.gameDateLocal !== row.time.gameDateLocal
        || aggregate.stats.points !== row.values.pointsFor) {
      fail('Candidate 22 player-game points do not reconcile to team-game records for ' + key);
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
      fail('Candidate 22 paired team-game identity is inconsistent for ' + gameRef);
    }
    games.push({
      gameRef,
      seasonStartYear: home.row.time.seasonStartYear,
      gameDateLocal: home.row.time.gameDateLocal,
      home: deriveSide(home.aggregate.stats, away.aggregate.stats),
      away: deriveSide(away.aggregate.stats, home.aggregate.stats),
    });
  }
  games.sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  const normalizedTargets = normalizeScorelessTargets(targets, new Set(games.map(game => game.gameRef)));

  const contexts = new Map();
  const targetContexts = new Map();
  const teamHistory = new Map();
  const global = {
    count: 0,
    sums: Object.fromEntries(FIELDS.map(field => [field, { numerator: 0, denominator: 0 }])),
  };
  let observedThrough = null;
  const sideContext = teamCode => {
    const history = teamHistory.get(teamCode) || [];
    const side = { historyGameCount: history.length };
    for (const field of FIELDS) {
      side[field] = shrinkProfile(history, global, field);
    }
    return side;
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
      const gameRows = paired.get(game.gameRef);
      const homeTeam = gameRows.find(item => item.row.values.isHome === true).row.entities.teamCode;
      const awayTeam = gameRows.find(item => item.row.values.isHome === false).row.entities.teamCode;
      const context = {
        format: CANDIDATE22_PROFILE_CONTEXT_FORMAT,
        gameDateLocal: game.gameDateLocal,
        observedThrough,
        sourcePriorTeamGameCount: global.count,
        home: sideContext(homeTeam),
        away: sideContext(awayTeam),
      };
      validateContextSide(context.home, game.gameDateLocal, observedThrough);
      validateContextSide(context.away, game.gameDateLocal, observedThrough);
      contexts.set(game.gameRef, context);
    }
    for (const target of dayTargets) {
      const context = {
        format: CANDIDATE22_PROFILE_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough,
        sourcePriorTeamGameCount: global.count,
        home: sideContext(target.homeTeamRef),
        away: sideContext(target.awayTeamRef),
      };
      validateContextSide(context.home, date, observedThrough);
      validateContextSide(context.away, date, observedThrough);
      targetContexts.set(target.gameRef, context);
    }
    for (const game of day) {
      const gameRows = paired.get(game.gameRef);
      const homeTeam = gameRows.find(item => item.row.values.isHome === true).row.entities.teamCode;
      const awayTeam = gameRows.find(item => item.row.values.isHome === false).row.entities.teamCode;
      for (const [teamCode, values] of [[homeTeam, game.home], [awayTeam, game.away]]) {
        const history = teamHistory.get(teamCode) || [];
        history.push(values);
        teamHistory.set(teamCode, history);
        for (const field of FIELDS) {
          global.sums[field].numerator += values[field].numerator;
          global.sums[field].denominator += values[field].denominator;
        }
        global.count += 1;
      }
    }
    if (day.length) observedThrough = day[day.length - 1].gameDateLocal;
  }
  const result = {
    contexts,
    audit: Object.freeze({
      format: CANDIDATE22_PROFILE_CONTEXT_FORMAT,
      sourceEligiblePlayerRows: eligiblePlayerRows,
      pairedGameCount: games.length,
      contextCount: contexts.size,
      sameLocalDateOutcomesExcluded: true,
      fieldGoalSplitChecks,
      pointsFormulaChecks,
      contextCapture: 'all target contexts on a local date are captured before that date is added to history',
      rollingWindowTeamGames: WINDOW,
      shrinkagePriorTeamGames: PRIOR_WEIGHT,
      shrinkageMethod: 'ratio of pooled counts over prior team games with an eight-team-game league prior weighted by prior-date denominator exposure',
      featureFields: FIELDS,
    }),
  };
  if (normalizedTargets.length) result.targetContexts = targetContexts;
  return result;
}

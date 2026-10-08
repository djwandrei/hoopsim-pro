/*
 * Candidate 16: strictly prior-date team rotation context.
 *
 * Player-game rows are postgame observations, so they are never read as
 * same-game inputs.  This builder accepts reconciled regular-season games and
 * captures every target-date context before applying any player minutes or
 * starter outcomes from that date.  It is development-only and intentionally
 * does not change the V4 package or Candidate 10 input contract.
 */

export const ROTATION_CONTEXT_FORMAT = 'swishiq-game-prior-rotation-context-v1';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;
const METRICS = Object.freeze([
  'activePlayerCount',
  'topFiveMinutesShare',
  'minuteShareHhi',
  'activePlayerOverlap',
  'starterOverlap',
  'minuteShareOverlap',
]);
const DEFAULTS = Object.freeze({
  activePlayerCount: 10,
  topFiveMinutesShare: 0.66,
  minuteShareHhi: 0.13,
  activePlayerOverlap: 0.66,
  starterOverlap: 0.62,
  minuteShareOverlap: 0.68,
});

function fail(message) { throw new TypeError(message); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function validDate(value) {
  return typeof value === 'string' && DATE_RE.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return null;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

function normalizeRotation(rotation, label) {
  if (!rotation || typeof rotation !== 'object' || !Array.isArray(rotation.players)) {
    fail(`${label} requires a player rotation.`);
  }
  const players = rotation.players.map((player, index) => {
    if (!player || typeof player !== 'object' || typeof player.playerRef !== 'string' || !player.playerRef
        || !finite(player.minutes) || player.minutes < 0 || player.minutes > 100
        || (player.isStarter != null && typeof player.isStarter !== 'boolean')) {
      fail(`${label}.players[${index}] is invalid.`);
    }
    return { playerRef: player.playerRef, minutes: player.minutes, isStarter: player.isStarter };
  });
  if (new Set(players.map(player => player.playerRef)).size !== players.length) {
    fail(`${label} has duplicate player references.`);
  }
  const active = players.filter(player => player.minutes > 0);
  const totalMinutes = active.reduce((sum, player) => sum + player.minutes, 0);
  const starters = active.filter(player => player.isStarter === true);
  if (active.length < 5 || active.length > 20 || totalMinutes < 200 || totalMinutes > 400
      || starters.length !== 5) {
    fail(`${label} has invalid active-player, minute-total, or starter coverage.`);
  }
  const shares = new Map(active.map(player => [player.playerRef, player.minutes / totalMinutes]));
  const activeSet = new Set(active.map(player => player.playerRef));
  const starterSet = new Set(starters.map(player => player.playerRef));
  const topFiveMinutes = [...active].sort((left, right) => right.minutes - left.minutes || left.playerRef.localeCompare(right.playerRef))
    .slice(0, 5).reduce((sum, player) => sum + player.minutes, 0);
  return {
    activeSet,
    starterSet,
    shares,
    activePlayerCount: active.length,
    topFiveMinutesShare: topFiveMinutes / totalMinutes,
    minuteShareHhi: [...shares.values()].reduce((sum, share) => sum + share ** 2, 0),
  };
}

function normalizeGame(game) {
  if (!game || typeof game !== 'object' || typeof game.gameRef !== 'string' || !game.gameRef
      || !Number.isSafeInteger(game.seasonStartYear) || !validDate(game.gameDateLocal)
      || game.phase !== 'regular' || game.reconciliationStatus !== 'matched' || game.trainingEligible !== true
      || typeof game.homeTeamRef !== 'string' || !game.homeTeamRef
      || typeof game.awayTeamRef !== 'string' || !game.awayTeamRef || game.homeTeamRef === game.awayTeamRef) {
    fail('Invalid reconciled regular-season rotation game record.');
  }
  return {
    ...game,
    homeRotation: normalizeRotation(game.homeRotation, `${game.gameRef} home rotation`),
    awayRotation: normalizeRotation(game.awayRotation, `${game.gameRef} away rotation`),
  };
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object' || typeof target.gameRef !== 'string' || !target.gameRef
      || !Number.isSafeInteger(target.seasonStartYear) || !validDate(target.gameDateLocal)
      || target.phase !== 'regular'
      || typeof target.homeTeamRef !== 'string' || !target.homeTeamRef
      || typeof target.awayTeamRef !== 'string' || !target.awayTeamRef
      || target.homeTeamRef === target.awayTeamRef) {
    fail('Invalid scoreless regular-season rotation context target.');
  }
  return {
    gameRef: target.gameRef,
    seasonStartYear: target.seasonStartYear,
    gameDateLocal: target.gameDateLocal,
    phase: 'regular',
    homeTeamRef: target.homeTeamRef,
    awayTeamRef: target.awayTeamRef,
  };
}

function overlapSummary(rotation, previous) {
  if (!previous) {
    return {
      activePlayerOverlap: null,
      starterOverlap: null,
      minuteShareOverlap: null,
    };
  }
  let minuteShareOverlap = 0;
  for (const [playerRef, share] of rotation.shares) {
    minuteShareOverlap += Math.min(share, previous.shares.get(playerRef) ?? 0);
  }
  return {
    activePlayerOverlap: jaccard(rotation.activeSet, previous.activeSet),
    starterOverlap: jaccard(rotation.starterSet, previous.starterSet),
    minuteShareOverlap,
  };
}

function metricSummary(rows) {
  if (!rows.length) return null;
  const summary = { count: rows.length };
  for (const metric of METRICS) {
    const values = rows.map(row => row[metric]).filter(finite);
    summary[metric] = mean(values);
    summary[`${metric}Count`] = values.length;
  }
  return summary;
}

function shrunkAverage(rows, metric, anchor, priorWeight = 5) {
  const tail = rows.slice(-5).map(row => row[metric]).filter(finite);
  return (tail.reduce((sum, value) => sum + value, 0) + priorWeight * anchor) / (tail.length + priorWeight);
}

function sideContext(team, date, histories, previous, league) {
  const rows = histories.get(team) || [];
  const prior = previous.get(team);
  const values = Object.fromEntries(METRICS.map(metric => [`${metric}5Shrunk`,
    shrunkAverage(rows, metric, prior?.[metric] ?? league[metric]) ]));
  const continuitySamples = Object.fromEntries(METRICS.slice(3).map(metric => [
    `${metric}WindowCount`, rows.slice(-5).filter(row => finite(row[metric])).length,
  ]));
  const day = Date.parse(`${date}T00:00:00.000Z`);
  return {
    historyGameCount: rows.length,
    priorSeasonGameCount: prior?.count ?? 0,
    priorGameRefs: rows.slice(-20).map(row => row.gameRef),
    ...values,
    ...continuitySamples,
    gamesLast4Days: rows.filter(row => day - row.day <= 4 * DAY).length,
    gamesLast6Days: rows.filter(row => day - row.day <= 6 * DAY).length,
  };
}

function leagueContext(rows, priorLeague) {
  const current = metricSummary(rows);
  return Object.fromEntries(METRICS.map(metric => [metric,
    current?.[metric] ?? priorLeague?.[metric] ?? DEFAULTS[metric],
  ]));
}

/**
 * Build pregame rotation contexts. `games` must contain complete, reconciled
 * regular-season player rotations for both sides of each game.
 */
export function buildCandidate16RotationContexts({ games, targets } = {}) {
  if (!Array.isArray(games) || !games.length) fail('Reconciled rotation games are required.');
  const normalized = games.map(normalizeGame).sort((left, right) => left.gameDateLocal.localeCompare(right.gameDateLocal)
    || left.gameRef.localeCompare(right.gameRef));
  if (new Set(normalized.map(game => game.gameRef)).size !== normalized.length) fail('Duplicate gameRef in rotation context source.');
  const normalizedTargets = targets === undefined ? [] : (() => {
    if (!Array.isArray(targets)) fail('Scoreless rotation context targets must be an array.');
    return targets.map(normalizeTarget);
  })();
  const historicalRefs = new Set(normalized.map(game => game.gameRef));
  const targetRefs = new Set();
  for (const target of normalizedTargets) {
    if (targetRefs.has(target.gameRef) || historicalRefs.has(target.gameRef)) {
      fail('Scoreless rotation context targets must be unique and absent from history.');
    }
    targetRefs.add(target.gameRef);
  }

  const histories = new Map();
  const previous = new Map();
  const lastRotations = new Map();
  const contexts = new Map();
  const targetContexts = new Map();
  let season = null;
  let currentLeagueRows = [];
  let previousLeague = null;
  let lastObservedDate = null;
  let sourcePriorGameCount = 0;

  const gamesByDate = new Map();
  for (const game of normalized) {
    const dayGames = gamesByDate.get(game.gameDateLocal) || [];
    dayGames.push(game);
    gamesByDate.set(game.gameDateLocal, dayGames);
  }
  const targetsByDate = new Map();
  for (const target of normalizedTargets) {
    const dayTargets = targetsByDate.get(target.gameDateLocal) || [];
    dayTargets.push(target);
    targetsByDate.set(target.gameDateLocal, dayTargets);
  }
  const eventDates = [...new Set([...gamesByDate.keys(), ...targetsByDate.keys()])].sort();
  for (const date of eventDates) {
    const dayGames = gamesByDate.get(date) || [];
    const dayTargets = targetsByDate.get(date) || [];
    const events = [...dayGames, ...dayTargets];
    const nextSeason = events[0].seasonStartYear;
    if (events.some(event => event.seasonStartYear !== nextSeason)) fail('Mixed seasons on one local date.');
    if (nextSeason !== season) {
      if (season != null) {
        previous.clear();
        for (const [team, rows] of histories) previous.set(team, metricSummary(rows));
        previousLeague = leagueContext(currentLeagueRows, previousLeague);
      }
      histories.clear();
      lastRotations.clear();
      currentLeagueRows = [];
      season = nextSeason;
    }
    const league = leagueContext(currentLeagueRows, previousLeague);
    for (const game of dayGames) {
      contexts.set(game.gameRef, freeze({
        format: ROTATION_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough: lastObservedDate,
        sourcePriorGameCount,
        home: sideContext(game.homeTeamRef, date, histories, previous, league),
        away: sideContext(game.awayTeamRef, date, histories, previous, league),
        league: { ...league },
        parameters: { windowGames: 5, meanPriorWeight: 5, continuity: 'Jaccard active/starter overlap and bounded player-minute-share overlap' },
      }));
    }
    for (const target of dayTargets) {
      targetContexts.set(target.gameRef, freeze({
        format: ROTATION_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough: lastObservedDate,
        sourcePriorGameCount,
        home: sideContext(target.homeTeamRef, date, histories, previous, league),
        away: sideContext(target.awayTeamRef, date, histories, previous, league),
        league: { ...league },
        parameters: { windowGames: 5, meanPriorWeight: 5, continuity: 'Jaccard active/starter overlap and bounded player-minute-share overlap' },
      }));
    }
    // Apply every target-date rotation only after the entire date was captured.
    for (const game of dayGames) {
      for (const [team, rotation] of [[game.homeTeamRef, game.homeRotation], [game.awayTeamRef, game.awayRotation]]) {
        const overlap = overlapSummary(rotation, lastRotations.get(team));
        const rows = histories.get(team) || [];
        const metrics = {
          gameRef: game.gameRef,
          day: Date.parse(`${date}T00:00:00.000Z`),
          activePlayerCount: rotation.activePlayerCount,
          topFiveMinutesShare: rotation.topFiveMinutesShare,
          minuteShareHhi: rotation.minuteShareHhi,
          ...overlap,
        };
        rows.push(metrics);
        histories.set(team, rows);
        currentLeagueRows.push(metrics);
        lastRotations.set(team, rotation);
      }
      sourcePriorGameCount += 1;
    }
    if (dayGames.length) lastObservedDate = date;
  }
  const result = {
    contexts,
    audit: freeze({
      gameCount: normalized.length,
      contextCount: contexts.size,
      sameLocalDateOutcomesExcluded: true,
      regularSeasonOnly: true,
      featureUpdateOrder: 'capture whole-date rotation contexts, then apply that date player-minute/starter outcomes',
      metrics: [...METRICS],
      defaultAnchors: { ...DEFAULTS },
    }),
  };
  if (normalizedTargets.length) result.targetContexts = targetContexts;
  return result;
}

export const CANDIDATE16_ROTATION_CONTEXT_CONTRACT = Object.freeze({
  format: ROTATION_CONTEXT_FORMAT,
  source: 'reconciled regular-season player-game minutes and starter flags',
  targetLabelsUsedInContextConstruction: false,
  sameLocalDatePlayerOutcomesExcluded: true,
  productionApprovalStatus: 'not-approved',
});

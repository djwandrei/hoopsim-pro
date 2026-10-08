/*
 * Candidate 24 prior-game home/road scoring residuals.
 * Every target-date context is captured before any game on that local date is
 * added to team history. Venue rates are shrunk toward the team's all-venue
 * rate, isolating team-specific home/road effects from ordinary form.
 */
export const CANDIDATE24_VENUE_CONTEXT_FORMAT = 'swishiq-candidate24-venue-form-history-context-v1';
const PRIOR_EQUIVALENT_GAMES = 8;
const WINDOWS = Object.freeze([10, 20]);
const FEATURES = Object.freeze(WINDOWS.flatMap(window => [
  'targetVenuePointsForDelta' + window,
  'targetVenuePointsAgainstDelta' + window,
]));
const finite = value => typeof value === 'number' && Number.isFinite(value);
function fail(message) { throw new TypeError(message); }
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function normalizeTargets(targets, historicalRefs) {
  if (targets === undefined) return [];
  if (!Array.isArray(targets)) fail('Candidate 24 scoreless targets must be an array.');
  const seen = new Set();
  return targets.map(target => {
    if (!target || typeof target !== 'object' || typeof target.gameRef !== 'string' || !target.gameRef
        || !Number.isSafeInteger(target.seasonStartYear) || !validDate(target.gameDateLocal)
        || target.phase !== 'regular' || target.neutralSite !== false
        || typeof target.homeTeamRef !== 'string' || !target.homeTeamRef
        || typeof target.awayTeamRef !== 'string' || !target.awayTeamRef
        || target.homeTeamRef === target.awayTeamRef) {
      fail('Candidate 24 scoreless targets require assigned, non-neutral regular-season schedule identity only.');
    }
    if (seen.has(target.gameRef) || historicalRefs.has(target.gameRef)) {
      fail('Candidate 24 scoreless target references must be unique and absent from history.');
    }
    seen.add(target.gameRef);
    return {
      gameRef: target.gameRef,
      seasonStartYear: target.seasonStartYear,
      gameDateLocal: target.gameDateLocal,
      homeTeamRef: target.homeTeamRef,
      awayTeamRef: target.awayTeamRef,
    };
  });
}

function average(rows, field, fallback, priorWeight = 0) {
  const total = rows.reduce((sum, row) => sum + row[field], 0);
  return (total + fallback * priorWeight) / Math.max(1, rows.length + priorWeight);
}

function sideContext({ teamCode, targetVenue, teamHistory, league }) {
  const rows = teamHistory.get(teamCode) || [];
  const allTail = rows.slice(-20);
  const leaguePointsFor = league.count ? league.pointsFor / league.count : 110;
  const leaguePointsAgainst = league.count ? league.pointsAgainst / league.count : 110;
  const overallPointsFor = average(allTail, 'pointsFor', leaguePointsFor, PRIOR_EQUIVALENT_GAMES);
  const overallPointsAgainst = average(allTail, 'pointsAgainst', leaguePointsAgainst, PRIOR_EQUIVALENT_GAMES);
  const venueRows = rows.filter(row => row.venue === targetVenue);
  const out = {
    historyGameCount: rows.length,
    targetVenueGameCount: venueRows.length,
  };
  for (const window of WINDOWS) {
    const venueTail = venueRows.slice(-window);
    const venuePointsFor = average(venueTail, 'pointsFor', overallPointsFor, PRIOR_EQUIVALENT_GAMES);
    const venuePointsAgainst = average(venueTail, 'pointsAgainst', overallPointsAgainst, PRIOR_EQUIVALENT_GAMES);
    out['targetVenuePointsForDelta' + window] = venuePointsFor - overallPointsFor;
    out['targetVenuePointsAgainstDelta' + window] = venuePointsAgainst - overallPointsAgainst;
  }
  if (FEATURES.some(field => !finite(out[field]) || Math.abs(out[field]) > 300)) {
    fail('Candidate 24 venue-form context contains an invalid scoring residual.');
  }
  return out;
}

export function buildCandidate24VenueContexts({ games, targets } = {}) {
  if (!Array.isArray(games) || !games.length) fail('Candidate 24 requires eligible paired team-game score records.');
  const seen = new Set();
  const ordered = games.map((game, index) => {
    if (!game || typeof game.gameRef !== 'string' || !game.gameRef
        || !validDate(game.gameDateLocal)
        || typeof game.homeTeamRef !== 'string' || !game.homeTeamRef
        || typeof game.awayTeamRef !== 'string' || !game.awayTeamRef
        || game.homeTeamRef === game.awayTeamRef
        || !Number.isSafeInteger(game.homeScore) || game.homeScore < 0
        || !Number.isSafeInteger(game.awayScore) || game.awayScore < 0) {
      fail('Candidate 24 requires paired integer scores, distinct teams, and valid local dates at row ' + index);
    }
    if (seen.has(game.gameRef)) fail('Candidate 24 contains duplicate gameRef ' + game.gameRef);
    seen.add(game.gameRef);
    return game;
  }).sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  const normalizedTargets = normalizeTargets(targets, seen);

  const contexts = new Map();
  const targetContexts = new Map();
  const teamHistory = new Map();
  const league = { count: 0, pointsFor: 0, pointsAgainst: 0 };
  let observedThrough = null;
  let sameDateOutcomeExclusionChecks = 0;
  const gamesByDate = new Map();
  for (const game of ordered) {
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
        format: CANDIDATE24_VENUE_CONTEXT_FORMAT,
        gameDateLocal: game.gameDateLocal,
        observedThrough,
        sourcePriorTeamGameCount: league.count,
        home: sideContext({ teamCode: game.homeTeamRef, targetVenue: 'home', teamHistory, league }),
        away: sideContext({ teamCode: game.awayTeamRef, targetVenue: 'away', teamHistory, league }),
      };
      if (observedThrough != null && observedThrough >= game.gameDateLocal) {
        fail('Candidate 24 context observed a same-date or future score.');
      }
      if (FEATURES.some(field => !finite(context.home[field]) || !finite(context.away[field]))) {
        fail('Candidate 24 failed to construct a complete prior venue context.');
      }
      contexts.set(game.gameRef, context);
      sameDateOutcomeExclusionChecks += 1;
    }
    for (const target of dayTargets) {
      const context = {
        format: CANDIDATE24_VENUE_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough,
        sourcePriorTeamGameCount: league.count,
        home: sideContext({ teamCode: target.homeTeamRef, targetVenue: 'home', teamHistory, league }),
        away: sideContext({ teamCode: target.awayTeamRef, targetVenue: 'away', teamHistory, league }),
      };
      if (observedThrough != null && observedThrough >= date) {
        fail('Candidate 24 target context observed a same-date or future score.');
      }
      if (FEATURES.some(field => !finite(context.home[field]) || !finite(context.away[field]))) {
        fail('Candidate 24 failed to construct a complete prior venue context for a scoreless target.');
      }
      targetContexts.set(target.gameRef, context);
    }
    for (const game of day) {
      for (const [teamCode, venue, pointsFor, pointsAgainst] of [
        [game.homeTeamRef, 'home', game.homeScore, game.awayScore],
        [game.awayTeamRef, 'away', game.awayScore, game.homeScore],
      ]) {
        const history = teamHistory.get(teamCode) || [];
        history.push({ gameDateLocal: game.gameDateLocal, venue, pointsFor, pointsAgainst });
        teamHistory.set(teamCode, history);
        league.count += 1;
        league.pointsFor += pointsFor;
        league.pointsAgainst += pointsAgainst;
      }
    }
    if (day.length) observedThrough = day[day.length - 1].gameDateLocal;
  }
  const result = {
    contexts,
    audit: Object.freeze({
      format: CANDIDATE24_VENUE_CONTEXT_FORMAT,
      eligiblePairedGameCount: ordered.length,
      contextCount: contexts.size,
      sameLocalDateOutcomesExcluded: sameDateOutcomeExclusionChecks === ordered.length,
      contextCapture: 'all target contexts on a local date are captured before outcomes from that date are appended',
      windows: WINDOWS,
      shrinkagePriorEquivalentGames: PRIOR_EQUIVALENT_GAMES,
      featureFields: FEATURES,
      featureDefinition: 'recent target-venue scoring/allowance deviations from a shrunk all-venue team baseline',
    }),
  };
  if (normalizedTargets.length) result.targetContexts = targetContexts;
  return result;
}

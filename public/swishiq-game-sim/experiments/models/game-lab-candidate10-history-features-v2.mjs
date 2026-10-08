/*
 * Score-only historical context shared by external and canonical V4 inputs.
 * A date's context is captured before any outcome on that date is applied.
 */
export const HISTORY_CONTEXT_FORMAT = 'swishiq-game-prior-history-context-v2';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;
const SHA256_RE = /^[a-f0-9]{64}$/;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function fail(message) { throw new TypeError(message); }
export class Candidate10HistoryContextError extends TypeError {
  constructor(code, message) {
    super(message);
    this.name = 'Candidate10HistoryContextError';
    this.code = code;
  }
}
function failCoded(code, message) { throw new Candidate10HistoryContextError(code, message); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function validDate(value) {
  return typeof value === 'string' && DATE_RE.test(value)
    && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;
}
function validTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && Number.isFinite(Date.parse(value));
}
function summary(rows) {
  if (!rows.length) return null;
  const pf = rows.map(row => row.pf);
  const pa = rows.map(row => row.pa);
  return { pf: mean(pf), pa: mean(pa), count: rows.length };
}
function shrunkMean(rows, field, count, anchor, priorWeight) {
  const tail = rows.slice(-count);
  return (tail.reduce((sum, row) => sum + row[field], 0) + priorWeight * anchor) / (tail.length + priorWeight);
}
function shrunkSd(rows, field, anchorVariance) {
  const tail = rows.slice(-20).map(row => row[field]);
  const center = mean(tail) ?? 0;
  const squares = tail.reduce((sum, value) => sum + (value - center) ** 2, 0);
  return Math.sqrt((squares + 10 * anchorVariance) / (Math.max(0, tail.length - 1) + 10));
}
function leagueSummary(state, prior) {
  const priorMean = prior?.pointsMean ?? 100;
  const priorMargin = prior?.marginMean ?? 2.5;
  const count = state.count;
  const pointMean = count ? state.pointSum / (count * 2) : priorMean;
  const marginMean = count ? state.marginSum / count : priorMargin;
  const pointVariance = count > 1 ? Math.max(0, state.pointSquares / (count * 2) - pointMean ** 2) : prior?.pointVariance ?? 121;
  const marginVariance = count > 1 ? Math.max(0, state.marginSquares / count - marginMean ** 2) : prior?.marginVariance ?? 169;
  return {
    gameCount: count,
    pointsMean: (state.pointSum / 2 + 50 * priorMean) / (count + 50),
    marginMean: (state.marginSum + 50 * priorMargin) / (count + 50),
    pointVariance,
    marginVariance,
  };
}

export function buildCandidate10HistoryContexts({ games, targets } = {}) {
  if (!Array.isArray(games) || !games.length) fail('Historical games are required');
  const normalized = games.map(game => {
    if (!game || typeof game.gameRef !== 'string' || !game.gameRef
        || !Number.isSafeInteger(game.seasonStartYear) || !validDate(game.gameDateLocal)
        || typeof game.homeTeamRef !== 'string' || !game.homeTeamRef
        || typeof game.awayTeamRef !== 'string' || !game.awayTeamRef || game.homeTeamRef === game.awayTeamRef
        || !Number.isSafeInteger(game.homeScore) || !Number.isSafeInteger(game.awayScore)
        || game.homeScore < 0 || game.awayScore < 0 || game.homeScore > 300 || game.awayScore > 300) {
      fail('Invalid historical score record');
    }
    return { ...game };
  }).sort((a, b) => a.gameDateLocal.localeCompare(b.gameDateLocal) || a.gameRef.localeCompare(b.gameRef));
  if (new Set(normalized.map(game => game.gameRef)).size !== normalized.length) fail('Duplicate historical game reference');
  const normalizedTargets = targets === undefined ? [] : (() => {
    if (!Array.isArray(targets)) fail('Target games must be an array');
    return targets.map(target => {
      if (!target || typeof target.gameRef !== 'string' || !target.gameRef
          || !Number.isSafeInteger(target.seasonStartYear) || !validDate(target.gameDateLocal)
          || typeof target.homeTeamRef !== 'string' || !target.homeTeamRef
          || typeof target.awayTeamRef !== 'string' || !target.awayTeamRef
          || target.homeTeamRef === target.awayTeamRef) {
        fail('Invalid scoreless target record');
      }
      // Copy only schedule identity; target score-like fields are never read or retained.
      return {
        gameRef: target.gameRef,
        seasonStartYear: target.seasonStartYear,
        gameDateLocal: target.gameDateLocal,
        homeTeamRef: target.homeTeamRef,
        awayTeamRef: target.awayTeamRef,
      };
    });
  })();
  const gameRefs = new Set(normalized.map(game => game.gameRef));
  const targetRefs = new Set();
  for (const target of normalizedTargets) {
    if (targetRefs.has(target.gameRef)) fail('Duplicate scoreless target reference');
    if (gameRefs.has(target.gameRef)) fail('A scoreless target cannot also be a historical game');
    targetRefs.add(target.gameRef);
  }
  const histories = new Map();
  const previous = new Map();
  const strengths = new Map();
  const offense = new Map();
  const defense = new Map();
  const contexts = new Map();
  const targetContexts = new Map();
  let season = null;
  let state = { count: 0, pointSum: 0, pointSquares: 0, marginSum: 0, marginSquares: 0 };
  let priorLeague = null;
  let globalCount = 0;
  let lastObservedDate = null;
  const side = (team, date, league) => {
    const rows = histories.get(team) || [];
    const prior = previous.get(team);
    const pfAnchor = prior?.pf ?? priorLeague?.pointsMean ?? 100;
    const paAnchor = prior?.pa ?? priorLeague?.pointsMean ?? 100;
    const day = Date.parse(date + 'T00:00:00.000Z');
    const recentCount = span => rows.filter(row => day - row.day <= span * DAY).length;
    return {
      historyGameCount: rows.length,
      priorSeasonGameCount: prior?.count ?? 0,
      priorGameRefs: rows.slice(-20).map(row => row.gameRef),
      pointsFor5Shrunk: shrunkMean(rows, 'pf', 5, pfAnchor, 5),
      pointsAgainst5Shrunk: shrunkMean(rows, 'pa', 5, paAnchor, 5),
      pointsFor20Shrunk: shrunkMean(rows, 'pf', 20, pfAnchor, 5),
      pointsAgainst20Shrunk: shrunkMean(rows, 'pa', 20, paAnchor, 5),
      pointsForSeasonShrunk: shrunkMean(rows, 'pf', rows.length, pfAnchor, 10),
      pointsAgainstSeasonShrunk: shrunkMean(rows, 'pa', rows.length, paAnchor, 10),
      opponentAdjustedStrength: strengths.get(team) ?? 0,
      opponentAdjustedOffense: offense.get(team) ?? 0,
      opponentAdjustedDefenseAllowance: defense.get(team) ?? 0,
      pointsForSd20Shrunk: shrunkSd(rows, 'pf', league.pointVariance),
      pointsAgainstSd20Shrunk: shrunkSd(rows, 'pa', league.pointVariance),
      marginSd20Shrunk: shrunkSd(rows, 'margin', league.marginVariance),
      gamesLast4Days: recentCount(4),
      gamesLast6Days: recentCount(6),
    };
  };
  const gamesByDate = new Map();
  for (const game of normalized) {
    const rows = gamesByDate.get(game.gameDateLocal) || [];
    rows.push(game);
    gamesByDate.set(game.gameDateLocal, rows);
  }
  const targetsByDate = new Map();
  for (const target of normalizedTargets) {
    const rows = targetsByDate.get(target.gameDateLocal) || [];
    rows.push(target);
    targetsByDate.set(target.gameDateLocal, rows);
  }
  const eventDates = [...new Set([...gamesByDate.keys(), ...targetsByDate.keys()])].sort();
  for (const date of eventDates) {
    const dayGames = gamesByDate.get(date) || [];
    const dayTargets = targetsByDate.get(date) || [];
    const dayEvents = [...dayGames, ...dayTargets];
    const nextSeason = dayEvents[0].seasonStartYear;
    if (dayEvents.some(event => event.seasonStartYear !== nextSeason)) fail('Mixed seasons on a game date');
    if (nextSeason !== season) {
      if (season != null) {
        previous.clear();
        for (const [team, rows] of histories) previous.set(team, summary(rows));
        priorLeague = leagueSummary(state, priorLeague);
        for (const [team, strength] of strengths) strengths.set(team, strength * 0.65);
        for (const [team, value] of offense) offense.set(team, value * 0.65);
        for (const [team, value] of defense) defense.set(team, value * 0.65);
      }
      histories.clear();
      state = { count: 0, pointSum: 0, pointSquares: 0, marginSum: 0, marginSquares: 0 };
      season = nextSeason;
    }
    const league = leagueSummary(state, priorLeague);
    const makeContext = (homeTeamRef, awayTeamRef) => freeze({
        format: HISTORY_CONTEXT_FORMAT,
        gameDateLocal: date,
        observedThrough: lastObservedDate,
        sourcePriorGameCount: globalCount,
        home: side(homeTeamRef, date, league),
        away: side(awayTeamRef, date, league),
        league: {
          priorSeasonGameCount: priorLeague?.gameCount ?? 0,
          currentSeasonPriorGameCount: league.gameCount,
          pointsPerSide: league.pointsMean,
          homeMargin: league.marginMean,
          pointsSd: Math.sqrt(league.pointVariance),
          marginSd: Math.sqrt(league.marginVariance),
        },
        parameters: { meanPriorWeightShort: 5, meanPriorWeightSeason: 10, variancePriorWeight: 10,
          leaguePriorWeight: 50, strengthGain: 0.08, strengthUpdateCap: 4, seasonStrengthRetention: 0.65,
          scoringComponentGain: 0.04, scoringComponentUpdateCap: 2 },
      });
    for (const game of dayGames) contexts.set(game.gameRef, makeContext(game.homeTeamRef, game.awayTeamRef));
    for (const target of dayTargets) targetContexts.set(target.gameRef, makeContext(target.homeTeamRef, target.awayTeamRef));
    // Only this phase reads and applies the current date's score outcomes.
    for (const game of dayGames) {
      const home = game.homeTeamRef;
      const away = game.awayTeamRef;
      const margin = game.homeScore - game.awayScore;
      const expectedHome = league.pointsMean + league.marginMean / 2 + (offense.get(home) ?? 0) + (defense.get(away) ?? 0);
      const expectedAway = league.pointsMean - league.marginMean / 2 + (offense.get(away) ?? 0) + (defense.get(home) ?? 0);
      const homeUpdate = Math.max(-2, Math.min(2, 0.04 * (game.homeScore - expectedHome)));
      const awayUpdate = Math.max(-2, Math.min(2, 0.04 * (game.awayScore - expectedAway)));
      offense.set(home, (offense.get(home) ?? 0) + homeUpdate);
      defense.set(away, (defense.get(away) ?? 0) + homeUpdate);
      offense.set(away, (offense.get(away) ?? 0) + awayUpdate);
      defense.set(home, (defense.get(home) ?? 0) + awayUpdate);
      const expectedMargin = league.marginMean + (strengths.get(home) ?? 0) - (strengths.get(away) ?? 0);
      const update = Math.max(-4, Math.min(4, 0.08 * (margin - expectedMargin)));
      strengths.set(home, (strengths.get(home) ?? 0) + update);
      strengths.set(away, (strengths.get(away) ?? 0) - update);
      for (const [team, pf, pa] of [[home, game.homeScore, game.awayScore], [away, game.awayScore, game.homeScore]]) {
        const rows = histories.get(team) || [];
        rows.push({ gameRef: game.gameRef, day: Date.parse(date + 'T00:00:00.000Z'), pf, pa, margin: pf - pa });
        histories.set(team, rows);
      }
      state.count += 1;
      state.pointSum += game.homeScore + game.awayScore;
      state.pointSquares += game.homeScore ** 2 + game.awayScore ** 2;
      state.marginSum += margin;
      state.marginSquares += margin ** 2;
      globalCount += 1;
    }
    if (dayGames.length) lastObservedDate = date;
  }
  const result = {
    contexts,
    audit: freeze({
      gameCount: normalized.length,
      contextCount: contexts.size,
      sameLocalDateOutcomesExcluded: true,
      featureUpdateOrder: 'capture whole-date contexts, then apply that date outcomes',
      firstSeasonInitialValues: { pointsPerSide: 100, homeMargin: 2.5, pointVariance: 121, marginVariance: 169 },
      claim: 'lagged feature derivation only; no model validation or source-availability attestation',
    }),
  };
  if (normalizedTargets.length) result.targetContexts = targetContexts;
  return result;
}

function exactSeasonScope(scope) {
  return Boolean(scope && scope.kind === 'exact-season'
    && Number.isSafeInteger(scope.seasonStartYear)
    && scope.seasonEndYear === scope.seasonStartYear + 1
    && Array.isArray(scope.seasonStartYears)
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYears[0] === scope.seasonStartYear);
}

function verifiedPart(input, expectedArtifactId) {
  const part = input?.part;
  const records = input?.records;
  const sourcePackage = input?.package;
  if (!input || input.status !== 'verified' || input.artifactId !== expectedArtifactId
      || !Array.isArray(records) || !part || part.records !== records
      || input.rows !== records.length || !Number.isSafeInteger(input.bytes) || input.bytes < 1
      || !SHA256_RE.test(input.sha256 || '')
      || (part.artifactId != null && part.artifactId !== expectedArtifactId)
      || !part.coverage || part.coverage.status !== 'available'
      || part.coverage.coverageState !== 'complete'
      || (part.coverage.rowCount != null && part.coverage.rowCount !== records.length)
      || !sourcePackage || typeof sourcePackage.packageId !== 'string'
      || !sourcePackage.packageId.startsWith('nba-swishiq-v4-')
      || typeof sourcePackage.packageVersion !== 'string' || !sourcePackage.packageVersion
      || !SHA256_RE.test(sourcePackage.packageManifestSha256 || '')
      || !SHA256_RE.test(sourcePackage.sourceLockSha256 || '')
      || !exactSeasonScope(sourcePackage.scope)
      || !exactSeasonScope(input.scope)
      || !exactSeasonScope(part.scope)) {
    failCoded('verified-part-invalid', `A loader-verified complete ${expectedArtifactId} part is required.`);
  }
  const scope = sourcePackage.scope;
  for (const otherScope of [input.scope, part.scope]) {
    if (otherScope.seasonStartYear !== scope.seasonStartYear
        || otherScope.seasonEndYear !== scope.seasonEndYear
        || otherScope.seasonStartYears[0] !== scope.seasonStartYear) {
      failCoded('verified-part-scope-mismatch', `${expectedArtifactId} scope differs from its verified package.`);
    }
  }
  return { input, part, records, sourcePackage, seasonStartYear: scope.seasonStartYear };
}

function requireSamePackage(left, right) {
  const a = left.sourcePackage;
  const b = right.sourcePackage;
  if (a.packageId !== b.packageId || a.packageVersion !== b.packageVersion
      || a.packageManifestSha256 !== b.packageManifestSha256
      || a.sourceLockSha256 !== b.sourceLockSha256
      || a.scope.seasonStartYear !== b.scope.seasonStartYear) {
    failCoded('verified-package-mismatch', 'team-games and schedule-reconciliation must come from one exact V4 package.');
  }
}

function completedMatchedEvidence(row) {
  return typeof row?.recordId === 'string' && Boolean(row.recordId)
    && row.evidence?.status === 'available'
    && row.temporalUse?.role === 'target'
    && row.values?.reconciliationStatus === 'matched'
    && row.values?.trainingEligible === true;
}

function normalizeHistoryPair(gameRef, rows, seasonStartYear) {
  if (rows.length !== 2) {
    failCoded('history-pair-cardinality', `Regular-season history ${gameRef} must have exactly two paired sides.`);
  }
  const completed = rows.map(completedMatchedEvidence);
  if (completed[0] !== completed[1]) {
    failCoded('history-pair-completion-mismatch', `Regular-season history ${gameRef} has only one completed matched side.`);
  }
  if (!completed[0]) return null;
  const sides = rows.map((row, index) => {
    const time = row.time;
    const values = row.values;
    const entities = row.entities;
    const aligned = entities?.gameRef === gameRef && values?.gameRef === gameRef
      && time?.seasonStartYear === seasonStartYear && values?.seasonStartYear === seasonStartYear
      && time?.phase === 'regular' && values?.phase === 'regular'
      && typeof time?.scheduledAtUtc === 'string' && time.scheduledAtUtc === values?.scheduledAt
      && validTimestamp(time.scheduledAtUtc)
      && validDate(time?.gameDateLocal) && time.gameDateLocal === values?.localGameDate
      && typeof entities?.teamCode === 'string' && entities.teamCode
      && entities.teamCode === values?.teamCode
      && typeof entities?.opponentTeamCode === 'string' && entities.opponentTeamCode
      && entities.opponentTeamCode === values?.opponentTeamCode
      && typeof values?.isHome === 'boolean'
      && values.safeAsSameGamePregameFeature === false
      && Number.isSafeInteger(values.pointsFor) && values.pointsFor >= 0 && values.pointsFor <= 300
      && Number.isSafeInteger(values.pointsAgainst) && values.pointsAgainst >= 0 && values.pointsAgainst <= 300;
    if (!aligned) {
      failCoded('history-row-invalid', `Regular-season history ${gameRef} side ${index + 1} is incomplete or misaligned.`);
    }
    return {
      teamCode: entities.teamCode,
      opponentTeamCode: entities.opponentTeamCode,
      isHome: values.isHome,
      scheduledAtUtc: time.scheduledAtUtc,
      gameDateLocal: time.gameDateLocal,
      pointsFor: values.pointsFor,
      pointsAgainst: values.pointsAgainst,
    };
  });
  const [first, second] = sides;
  if (first.teamCode === second.teamCode || first.opponentTeamCode !== second.teamCode
      || second.opponentTeamCode !== first.teamCode || first.isHome === second.isHome
      || first.scheduledAtUtc !== second.scheduledAtUtc || first.gameDateLocal !== second.gameDateLocal
      || first.pointsFor !== second.pointsAgainst || first.pointsAgainst !== second.pointsFor) {
    failCoded('history-pair-mismatch', `Regular-season history ${gameRef} sides are not reciprocal and score-matched.`);
  }
  const home = first.isHome ? first : second;
  const away = first.isHome ? second : first;
  return {
    gameRef,
    seasonStartYear,
    gameDateLocal: home.gameDateLocal,
    homeTeamRef: home.teamCode,
    awayTeamRef: away.teamCode,
    homeScore: home.pointsFor,
    awayScore: away.pointsFor,
  };
}

function normalizeScheduleTarget(row, seasonStartYear) {
  const values = row?.values;
  if (values?.status !== 'matched' || values.targetEligible !== true
      || values.eligibleForGameLabBacktest !== true) return null;
  const gameRef = row?.entities?.gameRef;
  const time = row?.time;
  const homeTeamRef = values.homeTeamCode;
  const awayTeamRef = values.awayTeamCode;
  if (typeof gameRef !== 'string' || !gameRef || values.gameRef !== gameRef
      || !Array.isArray(row?.entities?.teamCodes) || row.entities.teamCodes.length !== 2
      || !Number.isSafeInteger(time?.seasonStartYear) || time.seasonStartYear !== seasonStartYear
      || values.seasonStartYear !== seasonStartYear
      || time.phase !== values.phase
      || time.scheduledAtUtc !== values.scheduledAt || !validTimestamp(time.scheduledAtUtc)
      || !validDate(time.gameDateLocal) || time.gameDateLocal !== values.localGameDate
      || typeof homeTeamRef !== 'string' || !homeTeamRef || typeof awayTeamRef !== 'string' || !awayTeamRef
      || homeTeamRef === awayTeamRef || row.entities.teamCodes[0] !== homeTeamRef
      || row.entities.teamCodes[1] !== awayTeamRef) {
    failCoded('schedule-target-invalid', 'An eligible schedule target has misaligned identity or timing metadata.');
  }
  if (time.phase !== 'regular') return null;
  return {
    gameRef,
    seasonStartYear,
    gameDateLocal: time.gameDateLocal,
    homeTeamRef,
    awayTeamRef,
    phase: 'regular',
    scheduledAtUtc: time.scheduledAtUtc,
  };
}

/**
 * Build V2 prior-history contexts for scoreless regular-season schedule targets.
 * Inputs must be loader-verified parts from the same exact-season package.
 */
export function buildCandidate10V4HistoryContexts({ verifiedTeamGames, verifiedSchedule, checkpointDate } = {}) {
  if (!validDate(checkpointDate)) {
    failCoded('checkpoint-date-invalid', 'A valid local checkpoint date is required.');
  }
  const teamPart = verifiedPart(verifiedTeamGames, 'team-games');
  const schedulePart = verifiedPart(verifiedSchedule, 'schedule-reconciliation');
  requireSamePackage(teamPart, schedulePart);

  const scheduleTargets = [];
  const targetRefs = new Set();
  for (const row of schedulePart.records) {
    const target = normalizeScheduleTarget(row, teamPart.seasonStartYear);
    if (!target || target.gameDateLocal <= checkpointDate) continue;
    if (targetRefs.has(target.gameRef)) {
      failCoded('schedule-target-duplicate', `Schedule target ${target.gameRef} appears more than once.`);
    }
    targetRefs.add(target.gameRef);
    scheduleTargets.push(target);
  }
  if (!scheduleTargets.length) {
    failCoded('no-eligible-targets', 'No eligible post-checkpoint regular-season schedule targets are available.');
  }

  const rowsByGame = new Map();
  for (const row of teamPart.records) {
    const gameRef = row?.entities?.gameRef;
    // Exclude target-game team rows before touching their phase or any score field.
    if (targetRefs.has(gameRef)) continue;
    const timePhase = row?.time?.phase;
    const valuePhase = row?.values?.phase;
    if (timePhase !== 'regular' && valuePhase !== 'regular') continue;
    if (timePhase !== 'regular' || valuePhase !== 'regular') {
      failCoded('history-phase-mismatch', 'A regular-season history row has mismatched phase metadata.');
    }
    if (typeof gameRef !== 'string' || !gameRef) {
      failCoded('history-game-reference-invalid', 'A regular-season history row has no game reference.');
    }
    const rows = rowsByGame.get(gameRef) || [];
    rows.push(row);
    rowsByGame.set(gameRef, rows);
  }
  const historyGames = [...rowsByGame].map(([gameRef, rows]) =>
    normalizeHistoryPair(gameRef, rows, teamPart.seasonStartYear)).filter(Boolean);
  if (!historyGames.length) {
    failCoded('no-completed-history', 'No completed, matched regular-season team-game pairs are available.');
  }
  const derived = buildCandidate10HistoryContexts({
    games: historyGames,
    targets: scheduleTargets.map(target => ({
      gameRef: target.gameRef,
      seasonStartYear: target.seasonStartYear,
      gameDateLocal: target.gameDateLocal,
      homeTeamRef: target.homeTeamRef,
      awayTeamRef: target.awayTeamRef,
    })),
  });
  for (const target of scheduleTargets) {
    const context = derived.targetContexts.get(target.gameRef);
    if (!context || context.home.historyGameCount < 1 || context.away.historyGameCount < 1) {
      failCoded('target-prior-history-missing', `Target ${target.gameRef} lacks prior local-date history for both teams.`);
    }
  }
  return {
    format: 'swishiq-candidate10-v4-history-contexts-v1',
    package: Object.freeze({
      packageId: teamPart.sourcePackage.packageId,
      packageVersion: teamPart.sourcePackage.packageVersion,
      packageManifestSha256: teamPart.sourcePackage.packageManifestSha256,
      sourceLockSha256: teamPart.sourcePackage.sourceLockSha256,
      seasonStartYear: teamPart.seasonStartYear,
    }),
    checkpointDate,
    targets: Object.freeze(scheduleTargets.map(target => Object.freeze({ ...target }))),
    contexts: derived.targetContexts,
    audit: Object.freeze({
      teamGamesArtifactId: teamPart.input.artifactId,
      teamGamesSha256: teamPart.input.sha256,
      teamGamesRows: teamPart.records.length,
      completedRegularSeasonGamesUsed: historyGames.length,
      scheduleArtifactId: schedulePart.input.artifactId,
      scheduleSha256: schedulePart.input.sha256,
      scheduleRows: schedulePart.records.length,
      eligiblePostCheckpointRegularTargets: scheduleTargets.length,
      sameLocalDateOutcomesExcluded: true,
      targetScoresRead: false,
      targetScoresSynthesized: false,
      contextFormat: HISTORY_CONTEXT_FORMAT,
      runtimeInputFeaturesBuilt: false,
    }),
  };
}

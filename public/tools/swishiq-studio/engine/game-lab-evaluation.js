export const GAME_LAB_ROLLING_ORIGIN_FOLD_FORMAT = 'swishiq-game-lab-rolling-origin-fold-v1';
export const GAME_LAB_SCORE_METRIC_SCOPE = 'final-regular-season-score-margin-winner-probability-only';
export const GAME_LAB_EVALUATION_POLICY = Object.freeze({
  version: 'game-lab-adaptive-win-probability-se-v1',
  initialTrials: 100,
  maxTrials: 1000,
  trialStep: 100,
  targetWinProbabilityStandardError: 0.02,
  seedScheme: 'holdout-{targetSeasonStartYear}-{gameId}',
});

const ARCHIVE_FORMAT = 'djhc-nba-actual-schedules-v1';
const EXPECTED_REGULAR_GAME_COUNTS = Object.freeze({
  2017: 1230,
  2018: 1230,
  2019: 1059,
  2020: 1080,
  2021: 1230,
  2022: 1230,
  2023: 1230,
  2024: 1230,
  2025: 1230,
});
const EXPECTED_SEASON_START_YEARS = Object.freeze(Object.keys(EXPECTED_REGULAR_GAME_COUNTS).map(Number));
const NBA_TEAM_TIME_ZONES = Object.freeze({
  ATL: 'America/New_York', BKN: 'America/New_York', BOS: 'America/New_York',
  CHA: 'America/New_York', CHI: 'America/Chicago', CLE: 'America/New_York',
  DAL: 'America/Chicago', DEN: 'America/Denver', DET: 'America/Detroit',
  GSW: 'America/Los_Angeles', HOU: 'America/Chicago', IND: 'America/Indiana/Indianapolis',
  LAC: 'America/Los_Angeles', LAL: 'America/Los_Angeles', MEM: 'America/Chicago',
  MIA: 'America/New_York', MIL: 'America/Chicago', MIN: 'America/Chicago',
  NOP: 'America/Chicago', NYK: 'America/New_York', OKC: 'America/Chicago',
  ORL: 'America/New_York', PHI: 'America/New_York', PHX: 'America/Phoenix',
  POR: 'America/Los_Angeles', SAC: 'America/Los_Angeles', SAS: 'America/Chicago',
  TOR: 'America/Toronto', UTA: 'America/Denver', WAS: 'America/New_York',
});
const NBA_TEAM_CODES = new Set(Object.keys(NBA_TEAM_TIME_ZONES));
const LOCAL_DATE_FORMATTERS = new Map();
const EXPECTED_GAMES_PER_TEAM = Object.freeze({
  2017: 82,
  2018: 82,
  2020: 72,
  2021: 82,
  2022: 82,
  2023: 82,
  2024: 82,
  2025: 82,
});

function fail(message) {
  throw new Error(message);
}

export function nextGameLabEvaluationTrialCount(homeWinProbability, currentTrials) {
  const probability = Number(homeWinProbability);
  const trials = Number(currentTrials);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1
    || !Number.isSafeInteger(trials) || trials < GAME_LAB_EVALUATION_POLICY.initialTrials
    || trials > GAME_LAB_EVALUATION_POLICY.maxTrials) {
    fail('Adaptive Game Lab trials need a valid home-win probability and current bounded trial count.');
  }
  const standardError = Math.sqrt(probability * (1 - probability) / trials);
  if (standardError <= GAME_LAB_EVALUATION_POLICY.targetWinProbabilityStandardError
    || trials >= GAME_LAB_EVALUATION_POLICY.maxTrials) return trials;
  const required = Math.ceil(probability * (1 - probability)
    / (GAME_LAB_EVALUATION_POLICY.targetWinProbabilityStandardError ** 2));
  const stepped = Math.ceil(required / GAME_LAB_EVALUATION_POLICY.trialStep) * GAME_LAB_EVALUATION_POLICY.trialStep;
  return Math.min(GAME_LAB_EVALUATION_POLICY.maxTrials, Math.max(trials + GAME_LAB_EVALUATION_POLICY.trialStep, stepped));
}

function seasonYear(value, label) {
  const year = Number(value);
  if (!Number.isSafeInteger(year) || year < 1900 || year > 2200) fail(`${label} must be a valid NBA season start year.`);
  return year;
}

function finalScore(value, label) {
  const score = Number(value);
  if (!Number.isSafeInteger(score) || score < 0 || score > 250) fail(`${label} must be a final NBA score from 0 to 250.`);
  return score;
}

function homeLocalScheduleDate(scheduledAtMs, home) {
  const timeZone = NBA_TEAM_TIME_ZONES[home];
  if (!timeZone) fail(`Game schedule date cannot be normalized for unknown NBA team ${home}.`);
  let formatter = LOCAL_DATE_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    LOCAL_DATE_FORMATTERS.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(scheduledAtMs)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function canonicalTeamPairKeys(scheduledAtMs, home, away) {
  const pair = [home, away].sort().join('|');
  return {
    date: `${homeLocalScheduleDate(scheduledAtMs, home)}|${pair}`,
    instant: `${scheduledAtMs}|${pair}`,
  };
}

function normalizedRegularGame(raw, year, index, seen, seenPairDates, seenPairInstants) {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const home = typeof raw?.home === 'string' ? raw.home.trim().toUpperCase() : '';
  const away = typeof raw?.away === 'string' ? raw.away.trim().toUpperCase() : '';
  const scheduledAt = typeof raw?.scheduledAt === 'string' ? raw.scheduledAt : '';
  const scheduledAtMs = Date.parse(scheduledAt);
  if (!id || seen.has(id)) fail(`Target regular-season game ${index + 1} has a missing or duplicate ID.`);
  if (Number(raw?.seasonStartYear) !== year || raw?.phase !== 'regular') fail(`Target game ${id} escapes its full regular season.`);
  if (!home || !away || home === away) fail(`Target game ${id} has invalid home/away teams.`);
  if (!NBA_TEAM_CODES.has(home) || !NBA_TEAM_CODES.has(away)) fail(`Target game ${id} references an unknown NBA team code.`);
  if (!scheduledAt.endsWith('Z') || !Number.isFinite(scheduledAtMs)) fail(`Target game ${id} needs a UTC schedule timestamp.`);
  const pairKeys = canonicalTeamPairKeys(scheduledAtMs, home, away);
  if (seenPairDates.has(pairKeys.date) || seenPairInstants.has(pairKeys.instant)) {
    fail(`Target regular season repeats a canonical team-pair/date fixture (${pairKeys.date}).`);
  }
  const result = raw?.result;
  if (!result || typeof result !== 'object') fail(`Target game ${id} is missing its final-score label.`);
  const homeScore = finalScore(result.homeScore, `Target game ${id} homeScore`);
  const awayScore = finalScore(result.awayScore, `Target game ${id} awayScore`);
  if (homeScore === awayScore) fail(`Target game ${id} must have a decided final score.`);
  seen.add(id);
  seenPairDates.add(pairKeys.date);
  seenPairInstants.add(pairKeys.instant);
  return {
    schedule: Object.freeze({ id, seasonStartYear: year, phase: 'regular', scheduledAt, home, away }),
    label: Object.freeze({ gameId: id, targetSeasonStartYear: year, homeScore, awayScore }),
    scheduledAtMs,
  };
}

/**
 * Build one full-season, next-season fold for each adjacent pair of complete
 * exact seasons in the published actual-schedule archive. Prediction callers
 * receive a score-free `schedule`; final scores live separately in `labels`
 * and must not be sent to the prediction model.
 */
export function buildGameLabRollingOriginFolds(archive) {
  if (archive?.format !== ARCHIVE_FORMAT) fail('Game Lab evaluation needs the exact-season NBA actual schedule archive.');
  if (archive?.scope?.kind !== 'exact-season' || !Array.isArray(archive.scope.seasonStartYears)) {
    fail('Game Lab evaluation needs an exact-season archive scope.');
  }
  if (!Array.isArray(archive.seasons) || archive.seasons.length < 2) fail('Game Lab rolling-origin evaluation needs at least two complete seasons.');

  const scopeYears = archive.scope.seasonStartYears.map((value, index) => seasonYear(value, `Archive scope season ${index + 1}`));
  const seasons = archive.seasons.map((season, index) => {
    const year = seasonYear(season?.seasonStartYear, `Archive season ${index + 1}`);
    if (season?.status !== 'complete' || !Array.isArray(season.games)) fail(`Archive season ${year} is not a complete labeled season.`);
    return { ...season, seasonStartYear: year };
  }).sort((left, right) => left.seasonStartYear - right.seasonStartYear);
  const years = seasons.map(season => season.seasonStartYear);
  if (new Set(years).size !== years.length || new Set(scopeYears).size !== scopeYears.length) fail('Game Lab archive has duplicate season keys.');
  if (scopeYears.length !== years.length || [...scopeYears].sort((a, b) => a - b).some((year, index) => year !== years[index])) {
    fail('Game Lab archive scope does not match its available complete seasons.');
  }
  if (years.length !== EXPECTED_SEASON_START_YEARS.length
    || EXPECTED_SEASON_START_YEARS.some((year, index) => years[index] !== year)) {
    fail('Game Lab archive must cover the complete canonical 2017–18 through 2025–26 season range.');
  }
  if (years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    fail('Game Lab rolling-origin seasons must be chronological and consecutive.');
  }

  const normalizedByYear = new Map();
  for (const season of seasons) {
    const { seasonStartYear: year } = season;
    const regularGames = season.games.filter(game => game?.phase === 'regular');
    const expectedGameCount = EXPECTED_REGULAR_GAME_COUNTS[year];
    if (!Number.isSafeInteger(expectedGameCount) || regularGames.length !== expectedGameCount
      || !Number.isSafeInteger(Number(season.regularGames)) || Number(season.regularGames) !== expectedGameCount) {
      fail(`Archive season ${year} needs ${expectedGameCount || 'a canonical number of'} regular-season games; found ${regularGames.length}.`);
    }
    const seen = new Set();
    const seenPairDates = new Set();
    const seenPairInstants = new Set();
    const normalized = regularGames.map((game, index) => normalizedRegularGame(game, year, index, seen, seenPairDates, seenPairInstants))
      .sort((left, right) => left.scheduledAtMs - right.scheduledAtMs || left.schedule.id.localeCompare(right.schedule.id));
    const teamAppearances = new Map([...NBA_TEAM_CODES].map(team => [team, 0]));
    for (const game of normalized) {
      teamAppearances.set(game.schedule.home, teamAppearances.get(game.schedule.home) + 1);
      teamAppearances.set(game.schedule.away, teamAppearances.get(game.schedule.away) + 1);
    }
    if (teamAppearances.size !== NBA_TEAM_CODES.size || [...teamAppearances.values()].some(count => count === 0)) {
      fail(`Archive season ${year} does not cover all thirty NBA teams.`);
    }
    const expectedPerTeam = EXPECTED_GAMES_PER_TEAM[year];
    if (Number.isSafeInteger(expectedPerTeam) && [...teamAppearances.values()].some(count => count !== expectedPerTeam)) {
      fail(`Archive season ${year} does not have ${expectedPerTeam} regular-season games for every team.`);
    }
    normalizedByYear.set(year, normalized);
  }

  return Object.freeze(seasons.slice(1).map((target, index) => {
    const source = seasons[index];
    if (source.seasonStartYear >= target.seasonStartYear) fail('Game Lab source season must be earlier than its target season.');
    const normalized = normalizedByYear.get(target.seasonStartYear);
    return Object.freeze({
      format: GAME_LAB_ROLLING_ORIGIN_FOLD_FORMAT,
      sourceSeasonStartYear: source.seasonStartYear,
      targetSeasonStartYear: target.seasonStartYear,
      labelScope: GAME_LAB_SCORE_METRIC_SCOPE,
      schedule: Object.freeze(normalized.map(game => game.schedule)),
      labels: Object.freeze(normalized.map(game => game.label)),
    });
  }));
}

function assertFold(fold) {
  if (fold?.format !== GAME_LAB_ROLLING_ORIGIN_FOLD_FORMAT) fail('Game Lab evaluator needs a validated rolling-origin fold.');
  const sourceYear = seasonYear(fold.sourceSeasonStartYear, 'Source season');
  const targetYear = seasonYear(fold.targetSeasonStartYear, 'Target season');
  if (sourceYear >= targetYear) fail('Game Lab evaluation rejects same-season or future source evidence.');
  if (targetYear !== sourceYear + 1) fail('Game Lab full-season evaluation requires the exact prior season as its source.');
  if (fold.labelScope !== GAME_LAB_SCORE_METRIC_SCOPE) fail('Game Lab evaluation is limited to final-score labels.');
  if (!Array.isArray(fold.schedule) || !fold.schedule.length || !Array.isArray(fold.labels)
    || fold.labels.length !== fold.schedule.length) fail('Game Lab fold needs one final-score label for every target schedule row.');
  const expectedGameCount = EXPECTED_REGULAR_GAME_COUNTS[targetYear];
  if (!Number.isSafeInteger(expectedGameCount) || fold.schedule.length !== expectedGameCount) {
    fail(`Game Lab target ${targetYear} requires ${expectedGameCount || 'a canonical number of'} regular-season games.`);
  }
  const scheduleIds = new Set();
  const pairDateKeys = new Set();
  const pairInstantKeys = new Set();
  const teamAppearances = new Map([...NBA_TEAM_CODES].map(team => [team, 0]));
  let previousOrder = null;
  for (const [index, game] of fold.schedule.entries()) {
    const scheduleKeys = ['id', 'seasonStartYear', 'phase', 'scheduledAt', 'home', 'away'];
    if (!game || Object.keys(game).length !== scheduleKeys.length || Object.keys(game).some(key => !scheduleKeys.includes(key))) {
      fail(`Target schedule row ${index + 1} contains result data or unsupported fields.`);
    }
    const scheduledAtMs = typeof game.scheduledAt === 'string' && game.scheduledAt.endsWith('Z') ? Date.parse(game.scheduledAt) : Number.NaN;
    const home = typeof game.home === 'string' ? game.home.trim().toUpperCase() : '';
    const away = typeof game.away === 'string' ? game.away.trim().toUpperCase() : '';
    const order = [scheduledAtMs, game.id];
    if (Number(game.seasonStartYear) !== targetYear || game.phase !== 'regular'
      || typeof game.id !== 'string' || !game.id.trim() || scheduleIds.has(game.id)
      || !Number.isFinite(scheduledAtMs) || !home || !away || home === away
      || !NBA_TEAM_CODES.has(home) || !NBA_TEAM_CODES.has(away)
      || (previousOrder && (order[0] < previousOrder[0] || (order[0] === previousOrder[0] && order[1].localeCompare(previousOrder[1]) < 0)))) {
      fail(`Target schedule row ${index + 1} does not belong to the declared full target season.`);
    }
    const pairKeys = canonicalTeamPairKeys(scheduledAtMs, home, away);
    if (pairDateKeys.has(pairKeys.date) || pairInstantKeys.has(pairKeys.instant)) {
      fail(`Target schedule repeats a canonical team-pair/date fixture (${pairKeys.date}).`);
    }
    pairDateKeys.add(pairKeys.date);
    pairInstantKeys.add(pairKeys.instant);
    scheduleIds.add(game.id);
    teamAppearances.set(home, teamAppearances.get(home) + 1);
    teamAppearances.set(away, teamAppearances.get(away) + 1);
    previousOrder = order;
  }
  if (teamAppearances.size !== NBA_TEAM_CODES.size || [...teamAppearances.values()].some(count => count === 0)) {
    fail('Game Lab target schedule must include all thirty NBA teams.');
  }
  const expectedPerTeam = EXPECTED_GAMES_PER_TEAM[targetYear];
  if (Number.isSafeInteger(expectedPerTeam) && [...teamAppearances.values()].some(count => count !== expectedPerTeam)) {
    fail(`Game Lab target ${targetYear} must include ${expectedPerTeam} regular-season games for every team.`);
  }
  const labelsById = new Map();
  for (const [index, label] of fold.labels.entries()) {
    if (!label || Object.keys(label).some(key => !['gameId', 'targetSeasonStartYear', 'homeScore', 'awayScore'].includes(key))) {
      fail(`Target label ${index + 1} contains unsupported fields.`);
    }
    if (!scheduleIds.has(label.gameId) || Number(label.targetSeasonStartYear) !== targetYear || labelsById.has(label.gameId)) {
      fail(`Target label ${index + 1} does not map one-to-one to the declared target schedule.`);
    }
    const homeScore = finalScore(label.homeScore, `Target label ${label.gameId} homeScore`);
    const awayScore = finalScore(label.awayScore, `Target label ${label.gameId} awayScore`);
    if (homeScore === awayScore) fail(`Target label ${label.gameId} must have a decided final score.`);
    labelsById.set(label.gameId, { homeScore, awayScore });
  }
  if (labelsById.size !== scheduleIds.size) fail('Target labels do not cover the full target schedule.');
  return { sourceYear, targetYear, scheduleIds, labelsById };
}

/**
 * Score seeded final-score means and home-win probabilities against a full
 * regular-season fold. Probability scores use only the final winner label;
 * this is not possession-level calibration.
 */
export function evaluateGameLabScoreFold({ fold, predictions } = {}) {
  const contract = assertFold(fold);
  if (!Array.isArray(predictions) || predictions.length !== contract.scheduleIds.size) {
    fail('Game Lab predictions must cover every target game exactly once.');
  }
  const predictionById = new Map();
  for (const [index, raw] of predictions.entries()) {
    const allowedKeys = ['gameId', 'sourceSeasonStartYear', 'targetSeasonStartYear', 'seed', 'initialTrials', 'trials',
      'predictedHomeScore', 'predictedAwayScore', 'winProbabilities', 'scoreMeanStandardErrors'];
    if (!raw || Object.keys(raw).some(key => !allowedKeys.includes(key))) fail(`Prediction ${index + 1} contains unsupported or actual-result fields.`);
    const gameId = typeof raw.gameId === 'string' ? raw.gameId.trim() : '';
    if (!contract.scheduleIds.has(gameId) || predictionById.has(gameId)) fail(`Prediction ${index + 1} has an unknown or duplicate target game ID.`);
    if (Number(raw.sourceSeasonStartYear) !== contract.sourceYear || Number(raw.targetSeasonStartYear) !== contract.targetYear) {
      fail(`Prediction ${gameId} does not use the exact prior season and declared target season.`);
    }
    const predictedHomeScore = Number(raw.predictedHomeScore);
    const predictedAwayScore = Number(raw.predictedAwayScore);
    if (!Number.isFinite(predictedHomeScore) || predictedHomeScore < 0 || predictedHomeScore > 300
      || !Number.isFinite(predictedAwayScore) || predictedAwayScore < 0 || predictedAwayScore > 300) {
      fail(`Prediction ${gameId} needs finite nonnegative final-score estimates.`);
    }
    const expectedSeed = `holdout-${contract.targetYear}-${gameId}`;
    const initialTrials = Number(raw.initialTrials), trials = Number(raw.trials);
    if (raw.seed !== expectedSeed) fail(`Prediction ${gameId} does not use its deterministic target-season seed.`);
    if (initialTrials !== GAME_LAB_EVALUATION_POLICY.initialTrials
      || !Number.isSafeInteger(trials) || trials < initialTrials || trials > GAME_LAB_EVALUATION_POLICY.maxTrials
      || trials % GAME_LAB_EVALUATION_POLICY.trialStep !== 0) {
      fail(`Prediction ${gameId} needs its declared adaptive trial count within the evaluation bound.`);
    }
    const winProbabilities = raw.winProbabilities;
    if (!winProbabilities || Object.keys(winProbabilities).length !== 3
      || !['home', 'away', 'unresolved'].every(key => Number.isFinite(Number(winProbabilities[key]))
        && Number(winProbabilities[key]) >= 0 && Number(winProbabilities[key]) <= 1)
      || Math.abs(Number(winProbabilities.home) + Number(winProbabilities.away) + Number(winProbabilities.unresolved) - 1) > 1e-6) {
      fail(`Prediction ${gameId} needs complete home, away, and unresolved win probabilities.`);
    }
    const scoreMeanStandardErrors = raw.scoreMeanStandardErrors;
    if (!scoreMeanStandardErrors || Object.keys(scoreMeanStandardErrors).length !== 2
      || !['home', 'away'].every(key => Number.isFinite(Number(scoreMeanStandardErrors[key]))
        && Number(scoreMeanStandardErrors[key]) >= 0)) {
      fail(`Prediction ${gameId} needs finite home and away score-mean standard errors.`);
    }
    predictionById.set(gameId, { predictedHomeScore, predictedAwayScore, seed: raw.seed, initialTrials, trials,
      winProbabilities: { home: Number(winProbabilities.home), away: Number(winProbabilities.away), unresolved: Number(winProbabilities.unresolved) },
      scoreMeanStandardErrors: { home: Number(scoreMeanStandardErrors.home), away: Number(scoreMeanStandardErrors.away) } });
  }
  if (predictionById.size !== contract.scheduleIds.size) fail('Game Lab predictions do not cover the complete target schedule.');

  let scoreAbsoluteError = 0;
  let scoreSquaredError = 0;
  let marginAbsoluteError = 0;
  let marginSquaredError = 0;
  let marginBias = 0;
  let correctWinners = 0;
  let winProbabilityBrierScore = 0;
  let winProbabilityLogLoss = 0;
  let totalTrials = 0;
  let homeWinStandardErrorTotal = 0;
  let homeWinStandardErrorMaximum = 0;
  let scoreMeanStandardErrorTotal = 0;
  let scoreMeanStandardErrorMaximum = 0;
  let scoreMeanStandardErrorCount = 0;
  let gamesAtTrialCap = 0;
  let gamesAboveWinProbabilityStandardErrorTarget = 0;
  const perGameReceipt = [];
  for (const game of fold.schedule) {
    const actual = contract.labelsById.get(game.id);
    const predicted = predictionById.get(game.id);
    const predictedMargin = predicted.predictedHomeScore - predicted.predictedAwayScore;
    const actualMargin = actual.homeScore - actual.awayScore;
    const homeError = predicted.predictedHomeScore - actual.homeScore;
    const awayError = predicted.predictedAwayScore - actual.awayScore;
    const marginError = predictedMargin - actualMargin;
    scoreAbsoluteError += Math.abs(homeError) + Math.abs(awayError);
    scoreSquaredError += (homeError ** 2) + (awayError ** 2);
    marginAbsoluteError += Math.abs(marginError);
    marginSquaredError += marginError ** 2;
    marginBias += marginError;
    if (Math.sign(predictedMargin) === Math.sign(actualMargin)) correctWinners += 1;
    const actualHomeWin = actual.homeScore > actual.awayScore ? 1 : 0;
    const homeWinProbability = predicted.winProbabilities.home;
    winProbabilityBrierScore += (homeWinProbability - actualHomeWin) ** 2;
    const boundedHomeProbability = Math.max(1e-12, Math.min(1 - 1e-12, homeWinProbability));
    winProbabilityLogLoss += actualHomeWin
      ? -Math.log(boundedHomeProbability) : -Math.log(1 - boundedHomeProbability);
    const homeWinStandardError = Math.sqrt(homeWinProbability * (1 - homeWinProbability) / predicted.trials);
    homeWinStandardErrorTotal += homeWinStandardError;
    homeWinStandardErrorMaximum = Math.max(homeWinStandardErrorMaximum, homeWinStandardError);
    if (homeWinStandardError > GAME_LAB_EVALUATION_POLICY.targetWinProbabilityStandardError) {
      gamesAboveWinProbabilityStandardErrorTarget += 1;
    }
    totalTrials += predicted.trials;
    if (predicted.trials === GAME_LAB_EVALUATION_POLICY.maxTrials) gamesAtTrialCap += 1;
    for (const side of ['home', 'away']) {
      const value = predicted.scoreMeanStandardErrors[side];
      scoreMeanStandardErrorTotal += value;
      scoreMeanStandardErrorMaximum = Math.max(scoreMeanStandardErrorMaximum, value);
      scoreMeanStandardErrorCount += 1;
    }
    perGameReceipt.push(Object.freeze({
      gameId: game.id,
      sourceSeasonStartYear: contract.sourceYear,
      targetSeasonStartYear: contract.targetYear,
      seed: predicted.seed,
      initialTrials: predicted.initialTrials,
      trials: predicted.trials,
      predictedHomeScore: predicted.predictedHomeScore,
      predictedAwayScore: predicted.predictedAwayScore,
      winProbabilities: Object.freeze({ ...predicted.winProbabilities }),
      scoreMeanStandardErrors: Object.freeze({ ...predicted.scoreMeanStandardErrors }),
      homeWinProbabilityStandardError: homeWinStandardError,
    }));
  }
  const games = fold.schedule.length;
  const scoreObservations = games * 2;
  const rounded = value => Number(value.toFixed(6));
  return Object.freeze({
    format: 'swishiq-game-lab-score-evaluation-v2',
    sourceSeasonStartYear: contract.sourceYear,
    targetSeasonStartYear: contract.targetYear,
    metricScope: GAME_LAB_SCORE_METRIC_SCOPE,
    games,
    metrics: Object.freeze({
      scoreMae: rounded(scoreAbsoluteError / scoreObservations),
      scoreRmse: rounded(Math.sqrt(scoreSquaredError / scoreObservations)),
      marginMae: rounded(marginAbsoluteError / games),
      marginRmse: rounded(Math.sqrt(marginSquaredError / games)),
      marginBias: rounded(marginBias / games),
      winnerAccuracy: rounded(correctWinners / games),
      homeWinProbabilityBrierScore: rounded(winProbabilityBrierScore / games),
      homeWinProbabilityLogLoss: rounded(winProbabilityLogLoss / games),
    }),
    simulationReceipt: Object.freeze({
      format: 'swishiq-game-lab-adaptive-simulation-receipt-v1',
      policyVersion: GAME_LAB_EVALUATION_POLICY.version,
      method: 'same-seed-prefix-adaptive-win-probability-standard-error',
      sourceSeasonStartYear: contract.sourceYear,
      targetSeasonStartYear: contract.targetYear,
      seedScheme: GAME_LAB_EVALUATION_POLICY.seedScheme,
      initialTrials: GAME_LAB_EVALUATION_POLICY.initialTrials,
      targetWinProbabilityStandardError: GAME_LAB_EVALUATION_POLICY.targetWinProbabilityStandardError,
      maxTrials: GAME_LAB_EVALUATION_POLICY.maxTrials,
      trialStep: GAME_LAB_EVALUATION_POLICY.trialStep,
      totalTrials,
      averageTrials: rounded(totalTrials / games),
      gamesAtTrialCap,
      gamesAboveWinProbabilityStandardErrorTarget,
      meanHomeWinProbabilityStandardError: rounded(homeWinStandardErrorTotal / games),
      maxHomeWinProbabilityStandardError: rounded(homeWinStandardErrorMaximum),
      meanScoreMeanStandardError: rounded(scoreMeanStandardErrorTotal / scoreMeanStandardErrorCount),
      maxScoreMeanStandardError: rounded(scoreMeanStandardErrorMaximum),
      errorScope: 'Monte Carlo run sampling only; input, model, lineup, and possession-structure uncertainty are not included.',
      possessionCalibration: 'not evaluated',
      games: Object.freeze(perGameReceipt),
    }),
  });
}

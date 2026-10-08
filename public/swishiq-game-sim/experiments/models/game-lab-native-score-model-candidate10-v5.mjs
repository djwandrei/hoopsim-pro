/*
 * Candidate-10: isolated native V4 score-model development module.
 *
 * Research/development only. This file is intentionally disconnected from
 * Candidate-09, the package, evaluators, gates, site runtime, and deployment.
 * The feature builder accepts only the V4 inputFeatures object. Training labels
 * are read only by fitCandidate10ScoreModel after feature construction.
 * V3 adds versioned prior-history feature families for compact ablations.
 * Team matchup contrasts still reverse sign when team identities are swapped;
 * venue advantage remains attached to the home role.
 */

export const CANDIDATE10_FORMAT = 'djhc-swishiq-v4-native-candidate10-score-model-v1';
export const CANDIDATE10_VERSION = 'swishiq-v4-candidate10-opponent-adjusted-scoring-head-selection-v5';
export const CANDIDATE10_STATUS = 'research-development-only-not-evaluated';
export const CANDIDATE21_FORMAT = 'djhc-swishiq-v4-native-candidate21-boxscore-score-model-v1';
export const CANDIDATE21_VERSION = 'swishiq-v4-candidate21-prior-game-four-factors-and-efficiency-v1';
export const CANDIDATE21_STATUS = 'research-development-only-not-evaluated';
export const CANDIDATE22_FORMAT = 'djhc-swishiq-v4-native-candidate22-boxscore-profile-score-model-v1';
export const CANDIDATE22_VERSION = 'swishiq-v4-candidate22-prior-game-boxscore-profile-v1';
export const CANDIDATE22_STATUS = 'research-development-only-not-evaluated';
export const CANDIDATE23_FORMAT = 'djhc-swishiq-v4-native-candidate23-player-role-score-model-v1';
export const CANDIDATE23_VERSION = 'swishiq-v4-candidate23-prior-game-player-role-concentration-v1';
export const CANDIDATE23_STATUS = 'research-development-only-not-evaluated';
export const CANDIDATE24_FORMAT = 'djhc-swishiq-v4-native-candidate24-venue-form-score-model-v1';
export const CANDIDATE24_VERSION = 'swishiq-v4-candidate24-prior-home-road-form-v1';
export const CANDIDATE24_STATUS = 'research-development-only-not-evaluated';
export const CANDIDATE25_FORMAT = 'djhc-swishiq-v4-native-candidate25-travel-score-model-v1';
export const CANDIDATE25_VERSION = 'swishiq-v4-candidate25-prior-schedule-travel-burden-v1';
export const CANDIDATE25_STATUS = 'research-development-only-not-evaluated';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EPSILON = 1e-9;

const INPUT_FEATURE_KEYS = new Set(['temporalUse', 'home', 'away', 'homeAwayDifference', 'phase', 'historicalContext']);
const TEMPORAL_KEYS = new Set(['role', 'asOf', 'observedThrough', 'eligibleForPredictiveFeatures', 'eligibilityReason']);
const FIT_CONFIG_KEYS = new Set(['fitRows', 'ridgeLambda', 'featureFamilies', 'excludedBaseFeatures', 'excludedFeatures']);
const PREDICT_CONFIG_KEYS = new Set(['model', 'inputFeatures']);
const SIDE_KEYS = new Set([
  'historyStatus', 'priorGameCount', 'windowGameCount', 'priorGameRefs', 'restDays',
  'backToBack', 'gamesLast7Days', 'pointsForPerGameLast10',
  'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10',
  'nullReason',
]);
const DIFFERENCE_KEYS = new Set([
  'pointsForPerGameLast10', 'pointsAgainstPerGameLast10',
  'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays',
]);
const SIDE_VALUE_PATHS = Object.freeze({
  pointsFor: 'pointsForPerGameLast10',
  pointsAgainst: 'pointsAgainstPerGameLast10',
  pointDifferential: 'pointDifferentialPerGameLast10',
  winRate: 'winRateLast10',
  restDays: 'restDays',
  gamesLast7Days: 'gamesLast7Days',
});

const TOTAL_BASE_NAMES = Object.freeze([
  'meanPointsForLast10',
  'meanPointsAgainstLast10',
  'meanWinRateLast10',
  'meanRestDays',
  'meanGamesLast7Days',
  'meanWindowGameCount',
  'missingSharePointsForLast10',
  'missingSharePointsAgainstLast10',
  'missingShareWinRateLast10',
  'missingShareRestDays',
  'missingShareGamesLast7Days',
]);
const MARGIN_BASE_NAMES = Object.freeze([
  'pointsForAdvantageLast10',
  'defenseAllowanceAdvantageLast10',
  'winRateAdvantageLast10',
  'restAdvantageDays',
  'scheduleDensityAdvantageLast7',
  'windowGameCountAdvantage',
  'missingnessAdvantagePointsFor',
  'missingnessAdvantagePointsAgainst',
  'missingnessAdvantageWinRate',
  'missingnessAdvantageRestDays',
  'missingnessAdvantageGamesLast7Days',
]);
export const CANDIDATE10_TOTAL_BASE_FEATURE_NAMES = TOTAL_BASE_NAMES;
export const CANDIDATE10_MARGIN_BASE_FEATURE_NAMES = MARGIN_BASE_NAMES;

const HISTORY_FAMILIES = Object.freeze({
  'multi-window': Object.freeze({
    total: ['meanPointsFor5Shrunk', 'meanPointsAgainst5Shrunk', 'meanPointsFor20Shrunk',
      'meanPointsAgainst20Shrunk', 'meanPointsForSeasonShrunk', 'meanPointsAgainstSeasonShrunk'],
    margin: ['pointsForAdvantage5Shrunk', 'defenseAllowanceAdvantage5Shrunk', 'pointsForAdvantage20Shrunk',
      'defenseAllowanceAdvantage20Shrunk', 'pointsForAdvantageSeasonShrunk', 'defenseAllowanceAdvantageSeasonShrunk'],
  }),
  strength: Object.freeze({ total: [], margin: ['opponentAdjustedStrengthAdvantage'] }),
  'adjusted-total': Object.freeze({ total: ['meanAdjustedOffense', 'meanAdjustedDefenseAllowance'], margin: [] }),
  'adjusted-scoring': Object.freeze({
    total: ['meanAdjustedOffense', 'meanAdjustedDefenseAllowance'],
    margin: ['adjustedOffenseAdvantage', 'adjustedDefenseAllowanceAdvantage'],
  }),
  // The total-side adjusted-scoring fields are already supplied by
  // `adjusted-total`; this family adds only the two margin-side predictors.
  'adjusted-scoring-margin': Object.freeze({
    total: [],
    margin: ['adjustedOffenseAdvantage', 'adjustedDefenseAllowanceAdvantage'],
  }),
  environment: Object.freeze({ total: ['leaguePointsPerSide'], margin: ['leagueHomeMargin'] }),
  schedule: Object.freeze({ total: ['meanGamesLast4Days', 'meanGamesLast6Days'],
    margin: ['scheduleDensityAdvantageLast4', 'scheduleDensityAdvantageLast6'] }),
  'schedule-pressure': Object.freeze({
    total: ['meanBackToBackPressure', 'meanThreeInFourPressure', 'meanFourInSixPressure', 'meanFiveInSevenPressure'],
    margin: ['backToBackPressureAdvantage', 'threeInFourPressureAdvantage',
      'fourInSixPressureAdvantage', 'fiveInSevenPressureAdvantage'],
  }),
  'boxscore-efficiency': Object.freeze({
    total: ['meanBoxscoreOffensiveRating20', 'meanBoxscoreDefensiveRatingAllowance20'],
    margin: ['boxscoreOffensiveRatingAdvantage20', 'boxscoreDefenseQualityAdvantage20'],
  }),
  'boxscore-pace': Object.freeze({
    total: ['meanBoxscorePace20'],
    margin: ['boxscorePaceAdvantage20'],
  }),
  'boxscore-efg': Object.freeze({
    total: ['meanBoxscoreEfgPct20', 'meanBoxscoreOpponentEfgPct20'],
    margin: ['boxscoreEfgMatchupAdvantage20'],
  }),
  'boxscore-turnovers': Object.freeze({
    total: ['meanBoxscoreTovRate20', 'meanBoxscoreOpponentTovRate20'],
    margin: ['boxscoreTurnoverMatchupAdvantage20'],
  }),
  'boxscore-rebounds': Object.freeze({
    total: ['meanBoxscoreOrbRate20', 'meanBoxscoreOpponentOrbRate20'],
    margin: ['boxscoreOrbMatchupAdvantage20'],
  }),
  'boxscore-free-throws': Object.freeze({
    total: ['meanBoxscoreFtr20', 'meanBoxscoreOpponentFtr20'],
    margin: ['boxscoreFtrMatchupAdvantage20'],
  }),
  'boxscore-opponent-adjusted-efg': Object.freeze({
    total: ['meanOpponentAdjustedBoxscoreEfgPct20'],
    margin: ['opponentAdjustedBoxscoreEfgAdvantage20'],
  }),
  'boxscore-opponent-adjusted-turnovers': Object.freeze({
    total: ['meanOpponentAdjustedBoxscoreTovRate20'],
    margin: ['opponentAdjustedBoxscoreTovRateAdvantage20'],
  }),
  'boxscore-opponent-adjusted-rebounds': Object.freeze({
    total: ['meanOpponentAdjustedBoxscoreOrbRate20'],
    margin: ['opponentAdjustedBoxscoreOrbRateAdvantage20'],
  }),
  'boxscore-opponent-adjusted-free-throws': Object.freeze({
    total: ['meanOpponentAdjustedBoxscoreFtr20'],
    margin: ['opponentAdjustedBoxscoreFtrAdvantage20'],
  }),
  'boxscore-profile-three-point': Object.freeze({
    total: ['meanBoxscoreThreePointAttemptRate20', 'meanBoxscoreThreePointPct20',
      'meanBoxscoreOpponentThreePointAttemptRate20', 'meanBoxscoreOpponentThreePointPct20'],
    margin: ['boxscoreThreePointAttemptRateAdvantage20', 'boxscoreThreePointMatchupAdvantage20'],
  }),
  'boxscore-profile-two-point': Object.freeze({
    total: ['meanBoxscoreTwoPointAttemptRate20', 'meanBoxscoreTwoPointPct20',
      'meanBoxscoreOpponentTwoPointAttemptRate20', 'meanBoxscoreOpponentTwoPointPct20'],
    margin: ['boxscoreTwoPointAttemptRateAdvantage20', 'boxscoreTwoPointMatchupAdvantage20'],
  }),
  'boxscore-profile-assists': Object.freeze({
    total: ['meanBoxscoreAssistPerMadeFieldGoal20', 'meanBoxscoreOpponentAssistPerMadeFieldGoal20'],
    margin: ['boxscoreAssistRateAdvantage20'],
  }),
  'boxscore-profile-steals': Object.freeze({
    total: ['meanBoxscoreStealsPer100Possessions20', 'meanBoxscoreOpponentStealsPer100Possessions20'],
    margin: ['boxscoreStealsRateAdvantage20'],
  }),
  'boxscore-profile-blocks': Object.freeze({
    total: ['meanBoxscoreBlocksPer100OpponentPossessions20', 'meanBoxscoreOpponentBlocksPer100OpponentPossessions20'],
    margin: ['boxscoreBlocksRateAdvantage20'],
  }),
  'boxscore-profile-fouls': Object.freeze({
    total: ['meanBoxscorePersonalFoulsPer100Possessions20', 'meanBoxscoreOpponentPersonalFoulsPer100Possessions20'],
    margin: ['boxscorePersonalFoulsAvoidedAdvantage20'],
  }),
  'player-concentration-scoring': Object.freeze({
    total: ['meanTopScorerPointsShare20', 'meanTopThreeScorersPointsShare20', 'meanScoringConcentrationHhi20'],
    margin: ['topScorerPointsShareAdvantage20', 'scoringConcentrationHhiAdvantage20'],
  }),
  'player-concentration-usage': Object.freeze({
    total: ['meanTopUsagePlayerLoadShare20', 'meanTopThreeUsagePlayersLoadShare20', 'meanUsageConcentrationHhi20'],
    margin: ['topUsagePlayerLoadShareAdvantage20', 'usageConcentrationHhiAdvantage20'],
  }),
  'player-concentration-star-efficiency': Object.freeze({
    total: ['meanTopThreeUsagePlayersTrueShooting20'],
    margin: ['topThreeUsagePlayersTrueShootingAdvantage20'],
  }),
  'venue-conditional-10': Object.freeze({
    total: ['meanVenueOffenseDeviation10', 'meanVenueDefenseAllowanceDeviation10'],
    margin: ['venueOffenseDeviationAdvantage10', 'venueDefenseAllowanceAdvantage10'],
  }),
  'venue-conditional-20': Object.freeze({
    total: ['meanVenueOffenseDeviation20', 'meanVenueDefenseAllowanceDeviation20'],
    margin: ['venueOffenseDeviationAdvantage20', 'venueDefenseAllowanceAdvantage20'],
  }),
  'travel-last-leg': Object.freeze({
    total: ['meanLogLastLegTravelMiles'],
    margin: ['lastLegTravelMilesLogAdvantage'],
  }),
  'travel-7d': Object.freeze({
    total: ['meanLogTravelMilesLast7Days'],
    margin: ['travelMilesLast7DaysLogAdvantage'],
  }),
  'travel-time-zone': Object.freeze({
    total: ['meanEastwardTimeZoneShiftHours', 'meanWestwardTimeZoneShiftHours'],
    margin: ['eastwardTimeZoneShiftHoursAdvantage', 'westwardTimeZoneShiftHoursAdvantage'],
  }),
  'travel-history-support': Object.freeze({
    total: ['meanTravelColdStartShare', 'meanTravelPriorGameCount'],
    margin: ['travelColdStartAdvantage', 'travelPriorGameCountAdvantage'],
  }),
});
export const CANDIDATE10_MODEL_FEATURE_NAMES = Object.freeze([...new Set([
  ...TOTAL_BASE_NAMES,
  ...MARGIN_BASE_NAMES,
  ...Object.values(HISTORY_FAMILIES).flatMap(family => [...family.total, ...family.margin]),
])]);
const CANDIDATE10_MODEL_FEATURE_NAME_SET = new Set(CANDIDATE10_MODEL_FEATURE_NAMES);

const CANDIDATE21_BOXSCORE_FIELDS = Object.freeze([
  'effectiveFieldGoalPct20', 'turnoverRate20', 'offensiveReboundRate20', 'freeThrowRate20',
  'opponentEffectiveFieldGoalPct20', 'opponentTurnoverRate20', 'opponentOffensiveReboundRate20',
  'opponentFreeThrowRate20', 'estimatedPossessions20', 'pace20', 'offensiveRating20',
  'defensiveRatingAllowance20', 'opponentAdjustedEffectiveFieldGoalPct20',
  'opponentAdjustedTurnoverRate20', 'opponentAdjustedOffensiveReboundRate20',
  'opponentAdjustedFreeThrowRate20',
]);
const CANDIDATE22_PROFILE_FIELDS = Object.freeze([
  'threePointAttemptRate20', 'threePointPct20',
  'opponentThreePointAttemptRate20', 'opponentThreePointPct20',
  'twoPointAttemptRate20', 'twoPointPct20',
  'opponentTwoPointAttemptRate20', 'opponentTwoPointPct20',
  'assistPerMadeFieldGoal20', 'opponentAssistPerMadeFieldGoal20',
  'stealsPer100Possessions20', 'opponentStealsPer100Possessions20',
  'blocksPer100OpponentPossessions20', 'opponentBlocksPer100OpponentPossessions20',
  'personalFoulsPer100Possessions20', 'opponentPersonalFoulsPer100Possessions20',
]);
const CANDIDATE23_ROLE_FIELDS = Object.freeze([
  'topScorerPointsShare20', 'topThreeScorersPointsShare20', 'scoringConcentrationHhi20',
  'topUsagePlayerLoadShare20', 'topThreeUsagePlayersLoadShare20', 'usageConcentrationHhi20',
  'topThreeUsagePlayersTrueShooting20',
]);

function validateCandidate21BoxscoreContext(inputFeatures) {
  const date = inputFeatures?.historicalContext?.gameDateLocal;
  const context = inputFeatures?.historicalContext?.boxscore;
  if (!isObject(context) || context.format !== 'swishiq-candidate21-boxscore-history-context-v2'
      || context.gameDateLocal !== date || !Number.isSafeInteger(context.sourcePriorTeamGameCount)
      || context.sourcePriorTeamGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough) || context.observedThrough >= date))) {
    fail('candidate21-boxscore-context-invalid', 'Candidate 21 requires its versioned, strictly prior box-score history context.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || CANDIDATE21_BOXSCORE_FIELDS.some(field => !isFiniteNumber(side[field]) || Math.abs(side[field]) > 400)) {
      fail('candidate21-boxscore-context-invalid', 'Candidate 21 box-score side features must be finite, shrunk, and complete.');
    }
    for (const field of ['effectiveFieldGoalPct20', 'opponentEffectiveFieldGoalPct20',
      'offensiveReboundRate20', 'opponentOffensiveReboundRate20']) {
      if (side[field] < 0 || side[field] > 2) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
    for (const field of ['turnoverRate20', 'opponentTurnoverRate20']) {
      if (side[field] < 0 || side[field] > 1) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
    for (const field of ['freeThrowRate20', 'opponentFreeThrowRate20']) {
      if (side[field] < 0 || side[field] > 3) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
    for (const field of ['estimatedPossessions20', 'pace20']) {
      if (side[field] <= 0 || side[field] > 200) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
    for (const field of ['offensiveRating20', 'defensiveRatingAllowance20']) {
      if (side[field] < 0 || side[field] > 300) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
    for (const field of ['opponentAdjustedEffectiveFieldGoalPct20', 'opponentAdjustedTurnoverRate20',
      'opponentAdjustedOffensiveReboundRate20', 'opponentAdjustedFreeThrowRate20']) {
      if (Math.abs(side[field]) > 4) fail('candidate21-boxscore-context-invalid', field + ' is out of range.');
    }
  }
  return context;
}

function validateCandidate22ProfileContext(inputFeatures) {
  const date = inputFeatures?.historicalContext?.gameDateLocal;
  const context = inputFeatures?.historicalContext?.boxscoreProfile;
  if (!isObject(context) || context.format !== 'swishiq-candidate22-boxscore-profile-history-context-v1'
      || context.gameDateLocal !== date || !Number.isSafeInteger(context.sourcePriorTeamGameCount)
      || context.sourcePriorTeamGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough) || context.observedThrough >= date))) {
    fail('candidate22-profile-context-invalid', 'Candidate 22 requires its versioned, strictly prior box-score profile context.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || CANDIDATE22_PROFILE_FIELDS.some(field => !isFiniteNumber(side[field]) || side[field] < 0 || side[field] > 300)) {
      fail('candidate22-profile-context-invalid', 'Candidate 22 profile fields must be finite, shrunk, complete, and in range.');
    }
    for (const field of [
      'threePointAttemptRate20', 'threePointPct20', 'opponentThreePointAttemptRate20', 'opponentThreePointPct20',
      'twoPointAttemptRate20', 'twoPointPct20', 'opponentTwoPointAttemptRate20', 'opponentTwoPointPct20',
    ]) {
      if (side[field] > 1) fail('candidate22-profile-context-invalid', field + ' is out of range.');
    }
  }
  return context;
}

function validateCandidate23RoleContext(inputFeatures) {
  const date = inputFeatures?.historicalContext?.gameDateLocal;
  const temporalObservedThrough = inputFeatures?.temporalUse?.observedThrough;
  const context = inputFeatures?.historicalContext?.playerConcentration;
  if (!isObject(context) || context.format !== 'swishiq-candidate23-player-role-history-context-v1'
      || context.gameDateLocal !== date || !Number.isSafeInteger(context.sourcePriorTeamGameCount)
      || context.sourcePriorTeamGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough)
        || context.observedThrough >= date || context.observedThrough > temporalObservedThrough))) {
    fail('candidate23-role-context-invalid', 'Candidate 23 requires versioned, strictly prior player-role context.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || CANDIDATE23_ROLE_FIELDS.some(field => !isFiniteNumber(side[field]) || side[field] < 0
          || side[field] > (field === 'topThreeUsagePlayersTrueShooting20' ? 1.6 : 1))) {
      fail('candidate23-role-context-invalid', 'Candidate 23 player-role fields must be complete and within their statistical ranges.');
    }
  }
  return context;
}

function validateCandidate24VenueContext(inputFeatures) {
  const date = inputFeatures?.historicalContext?.gameDateLocal;
  const temporalObservedThrough = inputFeatures?.temporalUse?.observedThrough;
  const context = inputFeatures?.historicalContext?.venueProfile;
  if (!isObject(context) || context.format !== 'swishiq-candidate24-venue-form-history-context-v1'
      || context.gameDateLocal !== date || !Number.isSafeInteger(context.sourcePriorTeamGameCount)
      || context.sourcePriorTeamGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough)
        || context.observedThrough >= date || context.observedThrough > temporalObservedThrough))) {
    fail('candidate24-venue-context-invalid', 'Candidate 24 requires versioned, strictly prior venue-form context.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || !Number.isSafeInteger(side.targetVenueGameCount) || side.targetVenueGameCount < 0
        || side.targetVenueGameCount > side.historyGameCount
        || [10, 20].some(window => ['targetVenuePointsForDelta' + window, 'targetVenuePointsAgainstDelta' + window]
          .some(field => !isFiniteNumber(side[field]) || Math.abs(side[field]) > 300))) {
      fail('candidate24-venue-context-invalid', 'Candidate 24 venue-form values must be complete and within scoring bounds.');
    }
  }
  return context;
}

function validateHistoryContext(context, temporal) {
  if (!isObject(context) || context.format !== 'swishiq-game-prior-history-context-v2'
      || !validDate(context.gameDateLocal)
      || !Number.isSafeInteger(context.sourcePriorGameCount) || context.sourcePriorGameCount < 0
      || (context.observedThrough != null && (!validDate(context.observedThrough)
        || context.observedThrough >= context.gameDateLocal || context.observedThrough > temporal.observedThrough))
      || (context.sourcePriorGameCount > 0 && context.observedThrough == null)) {
    fail('history-context-invalid', 'Versioned historical context must use games strictly earlier than the target local date.');
  }
  for (const name of ['home', 'away']) {
    const side = context[name];
    if (!isObject(side) || !Number.isSafeInteger(side.historyGameCount) || side.historyGameCount < 0
        || !Number.isSafeInteger(side.priorSeasonGameCount) || side.priorSeasonGameCount < 0
        || !Array.isArray(side.priorGameRefs) || side.priorGameRefs.length !== Math.min(20, side.historyGameCount)
        || new Set(side.priorGameRefs).size !== side.priorGameRefs.length) {
      fail('history-context-invalid', 'Historical context has inconsistent side sample counts or references.');
    }
    for (const field of ['pointsFor5Shrunk', 'pointsAgainst5Shrunk', 'pointsFor20Shrunk',
      'pointsAgainst20Shrunk', 'pointsForSeasonShrunk', 'pointsAgainstSeasonShrunk',
      'opponentAdjustedStrength', 'opponentAdjustedOffense', 'opponentAdjustedDefenseAllowance', 'pointsForSd20Shrunk', 'pointsAgainstSd20Shrunk', 'marginSd20Shrunk',
      'gamesLast4Days', 'gamesLast6Days']) {
      if (!isFiniteNumber(side[field]) || Math.abs(side[field]) > 300
          || (!['opponentAdjustedStrength', 'opponentAdjustedOffense', 'opponentAdjustedDefenseAllowance'].includes(field) && side[field] < 0)) {
        fail('history-context-invalid', 'Historical context values must be finite and in range.');
      }
    }
  }
  if (!isObject(context.league) || ['pointsPerSide', 'homeMargin', 'pointsSd', 'marginSd']
    .some(name => !isFiniteNumber(context.league[name]))) {
    fail('history-context-invalid', 'Historical league context is incomplete.');
  }
  if (context.travelProfile != null) {
    const travel = context.travelProfile;
    if (!isObject(travel) || travel.format !== 'swishiq-candidate25-travel-context-v1'
        || travel.gameDateLocal !== context.gameDateLocal || !Number.isSafeInteger(travel.seasonStartYear)
        || (travel.observedThrough != null && (!validDate(travel.observedThrough)
          || travel.observedThrough >= context.gameDateLocal || travel.observedThrough > temporal.observedThrough))
        || typeof travel.sourceVenueMapVersion !== 'string' || !travel.sourceVenueMapVersion.trim()) {
      fail('candidate25-travel-context-invalid', 'Travel context must be versioned and strictly prior to the target local date.');
    }
    for (const sideName of ['home', 'away']) {
      const side = travel[sideName];
      if (!isObject(side) || !Number.isSafeInteger(side.priorGameCount) || side.priorGameCount < 0
          || typeof side.coldStart !== 'boolean'
          || !['available', 'cold-start-no-prior-game-in-season'].includes(side.historyStatus)
          || (side.coldStart !== (side.historyStatus === 'cold-start-no-prior-game-in-season'))
          || ['lastLegDistanceMiles', 'travelMilesLast7Days', 'eastwardTimeZoneShiftHours', 'westwardTimeZoneShiftHours']
            .some(field => !isFiniteNumber(side[field]) || side[field] < 0
              || side[field] > (field.includes('Hours') ? 24 : 25000))) {
        fail('candidate25-travel-context-invalid', 'Travel side values must include bounded route measures and explicit cold-start status.');
      }
      if (side.coldStart && (side.priorGameCount !== 0 || side.lastLegDistanceMiles !== 0
          || side.travelMilesLast7Days !== 0 || side.eastwardTimeZoneShiftHours !== 0
          || side.westwardTimeZoneShiftHours !== 0)) {
        fail('candidate25-travel-context-invalid', 'Travel cold-start defaults must remain zero and explicitly marked.');
      }
    }
  }
  return context;
}

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOnlyKeys(value, allowed, label) {
  if (!isObject(value)) fail('record-invalid', `${label} must be an object.`);
  const unexpected = Object.keys(value).filter(key => !allowed.has(key));
  if (unexpected.length) fail('field-not-allowed', `${label} has unsupported field(s): ${unexpected.join(', ')}.`);
}

function requireFields(value, fields, label) {
  const missing = fields.filter(field => !Object.hasOwn(value, field));
  if (missing.length) fail('field-missing', `${label} is missing required field(s): ${missing.join(', ')}.`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validUtc(value) {
  if (typeof value !== 'string' || !UTC_RE.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function approximatelyEqual(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return isFiniteNumber(left) && isFiniteNumber(right) && Math.abs(left - right) <= EPSILON;
}

function assertNumericOrNull(value, { name, min, max, integer = false } = {}) {
  if (value == null) return;
  if (!isFiniteNumber(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) {
    fail('feature-value-invalid', `${name} must be null or a finite ${integer ? 'integer' : 'number'} in [${min}, ${max}].`);
  }
}

function sideValue(side, semanticName) {
  return side[SIDE_VALUE_PATHS[semanticName]];
}

function expectedDifference(homeValue, awayValue) {
  return homeValue == null || awayValue == null ? null : homeValue - awayValue;
}

function validateSide(side, sideName) {
  assertOnlyKeys(side, SIDE_KEYS, `inputFeatures.${sideName}`);
  requireFields(side, [...SIDE_KEYS], `inputFeatures.${sideName}`);
  if (!Number.isSafeInteger(side.priorGameCount) || side.priorGameCount < 0
      || !Number.isSafeInteger(side.windowGameCount) || side.windowGameCount < 0
      || side.windowGameCount > 10 || side.priorGameCount < side.windowGameCount
      || side.windowGameCount !== Math.min(10, side.priorGameCount)) {
    fail('history-contract-invalid', `inputFeatures.${sideName} prior/window game counts violate the rolling-last-10 contract.`);
  }
  if (!Array.isArray(side.priorGameRefs) || side.priorGameRefs.length !== side.windowGameCount
      || side.priorGameRefs.some(ref => typeof ref !== 'string' || !ref.trim())
      || new Set(side.priorGameRefs).size !== side.priorGameRefs.length) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.priorGameRefs must be unique and match windowGameCount.`);
  }
  const expectedHistoryStatus = side.windowGameCount > 0 ? 'available' : 'insufficient-history';
  if (side.historyStatus !== expectedHistoryStatus) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.historyStatus conflicts with its windowGameCount.`);
  }
  if (side.nullReason != null && (typeof side.nullReason !== 'string' || !side.nullReason.trim())) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.nullReason must be a nonempty string or null.`);
  }
  if ((side.windowGameCount > 0 && side.nullReason != null)
      || (side.windowGameCount === 0 && side.nullReason == null)) {
    fail('history-contract-invalid', `inputFeatures.${sideName}.nullReason does not match the cold-start state.`);
  }

  assertNumericOrNull(side.pointsForPerGameLast10, { name: `${sideName}.pointsForPerGameLast10`, min: 0, max: 200 });
  assertNumericOrNull(side.pointsAgainstPerGameLast10, { name: `${sideName}.pointsAgainstPerGameLast10`, min: 0, max: 200 });
  assertNumericOrNull(side.pointDifferentialPerGameLast10, { name: `${sideName}.pointDifferentialPerGameLast10`, min: -200, max: 200 });
  assertNumericOrNull(side.winRateLast10, { name: `${sideName}.winRateLast10`, min: 0, max: 1 });
  assertNumericOrNull(side.restDays, { name: `${sideName}.restDays`, min: 0, max: 365, integer: true });
  assertNumericOrNull(side.gamesLast7Days, { name: `${sideName}.gamesLast7Days`, min: 0, max: 7, integer: true });
  if (side.backToBack != null && typeof side.backToBack !== 'boolean') {
    fail('history-contract-invalid', `${sideName}.backToBack must be boolean or null.`);
  }
  if ((side.restDays == null) !== (side.backToBack == null)
      || (side.restDays != null && side.backToBack !== (side.restDays === 0))) {
    fail('history-contract-invalid', `${sideName}.backToBack must agree with restDays, including null handling.`);
  }
  if (side.windowGameCount === 0) {
    for (const field of ['pointsForPerGameLast10', 'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays', 'backToBack']) {
      if (side[field] != null) fail('history-contract-invalid', `${sideName}.${field} must be null for a cold start.`);
    }
    if (side.gamesLast7Days != null && side.gamesLast7Days !== 0) {
      fail('history-contract-invalid', `${sideName}.gamesLast7Days must be zero or null for a cold start.`);
    }
  } else {
    for (const field of ['pointsForPerGameLast10', 'pointsAgainstPerGameLast10', 'pointDifferentialPerGameLast10', 'winRateLast10', 'restDays', 'backToBack', 'gamesLast7Days']) {
      if (side[field] == null) fail('history-contract-invalid', `${sideName}.${field} is required when rolling history is populated.`);
    }
    if (!approximatelyEqual(side.pointDifferentialPerGameLast10, side.pointsForPerGameLast10 - side.pointsAgainstPerGameLast10)) {
      fail('difference-contract-invalid', `${sideName} point differential must equal points-for minus points-against.`);
    }
  }
}

function validateTemporalContract(inputFeatures) {
  const temporal = inputFeatures.temporalUse;
  assertOnlyKeys(temporal, TEMPORAL_KEYS, 'inputFeatures.temporalUse');
  requireFields(temporal, ['role', 'asOf', 'observedThrough'], 'inputFeatures.temporalUse');
  if (!isObject(temporal) || temporal.role !== 'feature'
      || !validUtc(temporal.asOf) || !validDate(temporal.observedThrough)) {
    fail('temporal-contract-invalid', 'inputFeatures.temporalUse must identify role=feature with canonical UTC asOf and a valid observedThrough date.');
  }
  if (temporal.eligibleForPredictiveFeatures != null && typeof temporal.eligibleForPredictiveFeatures !== 'boolean') {
    fail('temporal-contract-invalid', 'eligibleForPredictiveFeatures must be boolean when present; its value is not treated as evidence.');
  }
  if (temporal.eligibilityReason != null && typeof temporal.eligibilityReason !== 'string') {
    fail('temporal-contract-invalid', 'eligibilityReason must be a string or null when present.');
  }
  const asOfUtcDate = temporal.asOf.slice(0, 10);
  if (temporal.observedThrough >= asOfUtcDate
      || Date.parse(`${temporal.observedThrough}T23:59:59.999Z`) >= Date.parse(temporal.asOf)) {
    fail('temporal-contract-invalid', 'observedThrough must end before the declared asOf instant.');
  }
  // eligibleForPredictiveFeatures is deliberately not treated as evidence.
  // This inputFeatures-only API cannot compare asOf with scheduledAtUtc; the
  // caller/evaluator must do that check from the target schedule metadata.
  return temporal;
}

function validateDifferenceRecord(inputFeatures) {
  const record = inputFeatures.homeAwayDifference;
  assertOnlyKeys(record, DIFFERENCE_KEYS, 'inputFeatures.homeAwayDifference');
  requireFields(record, [...DIFFERENCE_KEYS], 'inputFeatures.homeAwayDifference');
  const home = inputFeatures.home;
  const away = inputFeatures.away;
  const pairs = {
    pointsForPerGameLast10: [home.pointsForPerGameLast10, away.pointsForPerGameLast10],
    pointsAgainstPerGameLast10: [home.pointsAgainstPerGameLast10, away.pointsAgainstPerGameLast10],
    pointDifferentialPerGameLast10: [home.pointDifferentialPerGameLast10, away.pointDifferentialPerGameLast10],
    winRateLast10: [home.winRateLast10, away.winRateLast10],
    restDays: [home.restDays, away.restDays],
  };
  for (const [field, [homeValue, awayValue]] of Object.entries(pairs)) {
    const expected = expectedDifference(homeValue, awayValue);
    if (!approximatelyEqual(record[field], expected)) {
      fail('difference-contract-invalid', `homeAwayDifference.${field} must equal home minus away with null propagation.`);
    }
  }
  return record;
}

function meanAvailable(values) {
  const present = values.filter(isFiniteNumber);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function halfDifference(homeValue, awayValue) {
  return isFiniteNumber(homeValue) && isFiniteNumber(awayValue) ? (homeValue - awayValue) / 2 : 0;
}

function isMissing(value) {
  return value == null ? 1 : 0;
}

function buildFeatureBasis(inputFeatures) {
  const home = inputFeatures.home;
  const away = inputFeatures.away;
  const h = {
    pf: sideValue(home, 'pointsFor'), pa: sideValue(home, 'pointsAgainst'),
    win: sideValue(home, 'winRate'), rest: sideValue(home, 'restDays'),
    g7: sideValue(home, 'gamesLast7Days'), window: home.windowGameCount,
  };
  const a = {
    pf: sideValue(away, 'pointsFor'), pa: sideValue(away, 'pointsAgainst'),
    win: sideValue(away, 'winRate'), rest: sideValue(away, 'restDays'),
    g7: sideValue(away, 'gamesLast7Days'), window: away.windowGameCount,
  };
  const total = {
    meanPointsForLast10: meanAvailable([h.pf, a.pf]),
    meanPointsAgainstLast10: meanAvailable([h.pa, a.pa]),
    meanWinRateLast10: meanAvailable([h.win, a.win]),
    meanRestDays: meanAvailable([h.rest, a.rest]),
    meanGamesLast7Days: meanAvailable([h.g7, a.g7]),
    meanWindowGameCount: (h.window + a.window) / 2,
    missingSharePointsForLast10: (isMissing(h.pf) + isMissing(a.pf)) / 2,
    missingSharePointsAgainstLast10: (isMissing(h.pa) + isMissing(a.pa)) / 2,
    missingShareWinRateLast10: (isMissing(h.win) + isMissing(a.win)) / 2,
    missingShareRestDays: (isMissing(h.rest) + isMissing(a.rest)) / 2,
    missingShareGamesLast7Days: (isMissing(h.g7) + isMissing(a.g7)) / 2,
  };
  const margin = {
    pointsForAdvantageLast10: halfDifference(h.pf, a.pf),
    defenseAllowanceAdvantageLast10: halfDifference(a.pa, h.pa),
    winRateAdvantageLast10: halfDifference(h.win, a.win),
    restAdvantageDays: halfDifference(h.rest, a.rest),
    scheduleDensityAdvantageLast7: halfDifference(a.g7, h.g7),
    windowGameCountAdvantage: halfDifference(h.window, a.window),
    missingnessAdvantagePointsFor: (isMissing(a.pf) - isMissing(h.pf)) / 2,
    missingnessAdvantagePointsAgainst: (isMissing(a.pa) - isMissing(h.pa)) / 2,
    missingnessAdvantageWinRate: (isMissing(a.win) - isMissing(h.win)) / 2,
    missingnessAdvantageRestDays: (isMissing(a.rest) - isMissing(h.rest)) / 2,
    missingnessAdvantageGamesLast7Days: (isMissing(a.g7) - isMissing(h.g7)) / 2,
  };
  const context = inputFeatures.historicalContext;
  for (const suffix of ['5Shrunk', '20Shrunk', 'SeasonShrunk']) {
    total['meanPointsFor' + suffix] = (context.home['pointsFor' + suffix] + context.away['pointsFor' + suffix]) / 2;
    total['meanPointsAgainst' + suffix] = (context.home['pointsAgainst' + suffix] + context.away['pointsAgainst' + suffix]) / 2;
    margin['pointsForAdvantage' + suffix] = (context.home['pointsFor' + suffix] - context.away['pointsFor' + suffix]) / 2;
    margin['defenseAllowanceAdvantage' + suffix] = (context.away['pointsAgainst' + suffix] - context.home['pointsAgainst' + suffix]) / 2;
  }
  margin.opponentAdjustedStrengthAdvantage = (context.home.opponentAdjustedStrength - context.away.opponentAdjustedStrength) / 2;
  total.meanAdjustedOffense = (context.home.opponentAdjustedOffense + context.away.opponentAdjustedOffense) / 2;
  total.meanAdjustedDefenseAllowance = (context.home.opponentAdjustedDefenseAllowance + context.away.opponentAdjustedDefenseAllowance) / 2;
  margin.adjustedOffenseAdvantage = (context.home.opponentAdjustedOffense - context.away.opponentAdjustedOffense) / 2;
  margin.adjustedDefenseAllowanceAdvantage = (context.away.opponentAdjustedDefenseAllowance - context.home.opponentAdjustedDefenseAllowance) / 2;
  total.leaguePointsPerSide = context.league.pointsPerSide;
  margin.leagueHomeMargin = context.league.homeMargin;
  for (const days of [4, 6]) {
    total['meanGamesLast' + days + 'Days'] = (context.home['gamesLast' + days + 'Days'] + context.away['gamesLast' + days + 'Days']) / 2;
    margin['scheduleDensityAdvantageLast' + days] = (context.away['gamesLast' + days + 'Days'] - context.home['gamesLast' + days + 'Days']) / 2;
  }
  const pressure = sideName => {
    const side = inputFeatures[sideName];
    const recent = context[sideName];
    return {
      backToBack: side.backToBack == null ? 0 : Number(side.backToBack),
      threeInFour: Number(recent.gamesLast4Days >= 2),
      fourInSix: Number(recent.gamesLast6Days >= 3),
      fiveInSeven: Number(side.gamesLast7Days >= 4),
    };
  };
  const homePressure = pressure('home');
  const awayPressure = pressure('away');
  for (const [name, field] of [
    ['BackToBack', 'backToBack'], ['ThreeInFour', 'threeInFour'],
    ['FourInSix', 'fourInSix'], ['FiveInSeven', 'fiveInSeven'],
  ]) {
    total['mean' + name + 'Pressure'] = (homePressure[field] + awayPressure[field]) / 2;
    margin[name.charAt(0).toLowerCase() + name.slice(1) + 'PressureAdvantage'] =
      (awayPressure[field] - homePressure[field]) / 2;
  }
  const travel = context.travelProfile;
  if (isObject(travel?.home) && isObject(travel?.away)) {
    const homeTravel = travel.home;
    const awayTravel = travel.away;
    const homeLastLegLog = Math.log1p(homeTravel.lastLegDistanceMiles);
    const awayLastLegLog = Math.log1p(awayTravel.lastLegDistanceMiles);
    const homeTravel7dLog = Math.log1p(homeTravel.travelMilesLast7Days);
    const awayTravel7dLog = Math.log1p(awayTravel.travelMilesLast7Days);
    total.meanLogLastLegTravelMiles = (homeLastLegLog + awayLastLegLog) / 2;
    margin.lastLegTravelMilesLogAdvantage = (awayLastLegLog - homeLastLegLog) / 2;
    total.meanLogTravelMilesLast7Days = (homeTravel7dLog + awayTravel7dLog) / 2;
    margin.travelMilesLast7DaysLogAdvantage = (awayTravel7dLog - homeTravel7dLog) / 2;
    total.meanEastwardTimeZoneShiftHours = (homeTravel.eastwardTimeZoneShiftHours
      + awayTravel.eastwardTimeZoneShiftHours) / 2;
    total.meanWestwardTimeZoneShiftHours = (homeTravel.westwardTimeZoneShiftHours
      + awayTravel.westwardTimeZoneShiftHours) / 2;
    margin.eastwardTimeZoneShiftHoursAdvantage = (awayTravel.eastwardTimeZoneShiftHours
      - homeTravel.eastwardTimeZoneShiftHours) / 2;
    margin.westwardTimeZoneShiftHoursAdvantage = (awayTravel.westwardTimeZoneShiftHours
      - homeTravel.westwardTimeZoneShiftHours) / 2;
    total.meanTravelColdStartShare = (Number(homeTravel.coldStart) + Number(awayTravel.coldStart)) / 2;
    total.meanTravelPriorGameCount = (homeTravel.priorGameCount + awayTravel.priorGameCount) / 2;
    margin.travelColdStartAdvantage = (Number(awayTravel.coldStart) - Number(homeTravel.coldStart)) / 2;
    margin.travelPriorGameCountAdvantage = (awayTravel.priorGameCount - homeTravel.priorGameCount) / 2;
  }
  const boxscore = context.boxscore;
  if (isObject(boxscore?.home) && isObject(boxscore?.away)) {
    const h = boxscore.home;
    const a = boxscore.away;
    total.meanBoxscoreOffensiveRating20 = (h.offensiveRating20 + a.offensiveRating20) / 2;
    total.meanBoxscoreDefensiveRatingAllowance20 = (h.defensiveRatingAllowance20 + a.defensiveRatingAllowance20) / 2;
    total.meanBoxscorePace20 = (h.pace20 + a.pace20) / 2;
    margin.boxscoreOffensiveRatingAdvantage20 = (h.offensiveRating20 - a.offensiveRating20) / 2;
    margin.boxscoreDefenseQualityAdvantage20 = (a.defensiveRatingAllowance20 - h.defensiveRatingAllowance20) / 2;
    margin.boxscorePaceAdvantage20 = (h.pace20 - a.pace20) / 2;
    total.meanBoxscoreEfgPct20 = (h.effectiveFieldGoalPct20 + a.effectiveFieldGoalPct20) / 2;
    total.meanBoxscoreOpponentEfgPct20 = (h.opponentEffectiveFieldGoalPct20 + a.opponentEffectiveFieldGoalPct20) / 2;
    const homeEfgMatchup = (h.effectiveFieldGoalPct20 + a.opponentEffectiveFieldGoalPct20) / 2;
    const awayEfgMatchup = (a.effectiveFieldGoalPct20 + h.opponentEffectiveFieldGoalPct20) / 2;
    margin.boxscoreEfgMatchupAdvantage20 = (homeEfgMatchup - awayEfgMatchup) / 2;
    total.meanBoxscoreTovRate20 = (h.turnoverRate20 + a.turnoverRate20) / 2;
    total.meanBoxscoreOpponentTovRate20 = (h.opponentTurnoverRate20 + a.opponentTurnoverRate20) / 2;
    const homeTurnoverDrag = (h.turnoverRate20 + a.opponentTurnoverRate20) / 2;
    const awayTurnoverDrag = (a.turnoverRate20 + h.opponentTurnoverRate20) / 2;
    margin.boxscoreTurnoverMatchupAdvantage20 = (awayTurnoverDrag - homeTurnoverDrag) / 2;
    total.meanBoxscoreOrbRate20 = (h.offensiveReboundRate20 + a.offensiveReboundRate20) / 2;
    total.meanBoxscoreOpponentOrbRate20 = (h.opponentOffensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2;
    const homeOrbMatchup = (h.offensiveReboundRate20 + a.opponentOffensiveReboundRate20) / 2;
    const awayOrbMatchup = (a.offensiveReboundRate20 + h.opponentOffensiveReboundRate20) / 2;
    margin.boxscoreOrbMatchupAdvantage20 = (homeOrbMatchup - awayOrbMatchup) / 2;
    total.meanBoxscoreFtr20 = (h.freeThrowRate20 + a.freeThrowRate20) / 2;
    total.meanBoxscoreOpponentFtr20 = (h.opponentFreeThrowRate20 + a.opponentFreeThrowRate20) / 2;
    const homeFtrMatchup = (h.freeThrowRate20 + a.opponentFreeThrowRate20) / 2;
    const awayFtrMatchup = (a.freeThrowRate20 + h.opponentFreeThrowRate20) / 2;
    margin.boxscoreFtrMatchupAdvantage20 = (homeFtrMatchup - awayFtrMatchup) / 2;
    total.meanOpponentAdjustedBoxscoreEfgPct20 =
      (h.opponentAdjustedEffectiveFieldGoalPct20 + a.opponentAdjustedEffectiveFieldGoalPct20) / 2;
    margin.opponentAdjustedBoxscoreEfgAdvantage20 =
      (h.opponentAdjustedEffectiveFieldGoalPct20 - a.opponentAdjustedEffectiveFieldGoalPct20) / 2;
    total.meanOpponentAdjustedBoxscoreTovRate20 =
      (h.opponentAdjustedTurnoverRate20 + a.opponentAdjustedTurnoverRate20) / 2;
    margin.opponentAdjustedBoxscoreTovRateAdvantage20 =
      (h.opponentAdjustedTurnoverRate20 - a.opponentAdjustedTurnoverRate20) / 2;
    total.meanOpponentAdjustedBoxscoreOrbRate20 =
      (h.opponentAdjustedOffensiveReboundRate20 + a.opponentAdjustedOffensiveReboundRate20) / 2;
    margin.opponentAdjustedBoxscoreOrbRateAdvantage20 =
      (h.opponentAdjustedOffensiveReboundRate20 - a.opponentAdjustedOffensiveReboundRate20) / 2;
    total.meanOpponentAdjustedBoxscoreFtr20 =
      (h.opponentAdjustedFreeThrowRate20 + a.opponentAdjustedFreeThrowRate20) / 2;
    margin.opponentAdjustedBoxscoreFtrAdvantage20 =
      (h.opponentAdjustedFreeThrowRate20 - a.opponentAdjustedFreeThrowRate20) / 2;
  }
  const profile = context.boxscoreProfile;
  if (isObject(profile?.home) && isObject(profile?.away)) {
    const ph = profile.home;
    const pa = profile.away;
    total.meanBoxscoreThreePointAttemptRate20 =
      (ph.threePointAttemptRate20 + pa.threePointAttemptRate20) / 2;
    total.meanBoxscoreThreePointPct20 = (ph.threePointPct20 + pa.threePointPct20) / 2;
    total.meanBoxscoreOpponentThreePointAttemptRate20 =
      (ph.opponentThreePointAttemptRate20 + pa.opponentThreePointAttemptRate20) / 2;
    total.meanBoxscoreOpponentThreePointPct20 =
      (ph.opponentThreePointPct20 + pa.opponentThreePointPct20) / 2;
    const homeThreePointMatchup = (ph.threePointPct20 + pa.opponentThreePointPct20) / 2;
    const awayThreePointMatchup = (pa.threePointPct20 + ph.opponentThreePointPct20) / 2;
    margin.boxscoreThreePointAttemptRateAdvantage20 =
      (ph.threePointAttemptRate20 - pa.threePointAttemptRate20) / 2;
    margin.boxscoreThreePointMatchupAdvantage20 =
      (homeThreePointMatchup - awayThreePointMatchup) / 2;

    total.meanBoxscoreTwoPointAttemptRate20 =
      (ph.twoPointAttemptRate20 + pa.twoPointAttemptRate20) / 2;
    total.meanBoxscoreTwoPointPct20 = (ph.twoPointPct20 + pa.twoPointPct20) / 2;
    total.meanBoxscoreOpponentTwoPointAttemptRate20 =
      (ph.opponentTwoPointAttemptRate20 + pa.opponentTwoPointAttemptRate20) / 2;
    total.meanBoxscoreOpponentTwoPointPct20 =
      (ph.opponentTwoPointPct20 + pa.opponentTwoPointPct20) / 2;
    const homeTwoPointMatchup = (ph.twoPointPct20 + pa.opponentTwoPointPct20) / 2;
    const awayTwoPointMatchup = (pa.twoPointPct20 + ph.opponentTwoPointPct20) / 2;
    margin.boxscoreTwoPointAttemptRateAdvantage20 =
      (ph.twoPointAttemptRate20 - pa.twoPointAttemptRate20) / 2;
    margin.boxscoreTwoPointMatchupAdvantage20 =
      (homeTwoPointMatchup - awayTwoPointMatchup) / 2;

    total.meanBoxscoreAssistPerMadeFieldGoal20 =
      (ph.assistPerMadeFieldGoal20 + pa.assistPerMadeFieldGoal20) / 2;
    total.meanBoxscoreOpponentAssistPerMadeFieldGoal20 =
      (ph.opponentAssistPerMadeFieldGoal20 + pa.opponentAssistPerMadeFieldGoal20) / 2;
    margin.boxscoreAssistRateAdvantage20 =
      (ph.assistPerMadeFieldGoal20 - pa.assistPerMadeFieldGoal20) / 2;
    total.meanBoxscoreStealsPer100Possessions20 =
      (ph.stealsPer100Possessions20 + pa.stealsPer100Possessions20) / 2;
    total.meanBoxscoreOpponentStealsPer100Possessions20 =
      (ph.opponentStealsPer100Possessions20 + pa.opponentStealsPer100Possessions20) / 2;
    margin.boxscoreStealsRateAdvantage20 =
      (ph.stealsPer100Possessions20 - pa.stealsPer100Possessions20) / 2;
    total.meanBoxscoreBlocksPer100OpponentPossessions20 =
      (ph.blocksPer100OpponentPossessions20 + pa.blocksPer100OpponentPossessions20) / 2;
    total.meanBoxscoreOpponentBlocksPer100OpponentPossessions20 =
      (ph.opponentBlocksPer100OpponentPossessions20 + pa.opponentBlocksPer100OpponentPossessions20) / 2;
    margin.boxscoreBlocksRateAdvantage20 =
      (ph.blocksPer100OpponentPossessions20 - pa.blocksPer100OpponentPossessions20) / 2;
    total.meanBoxscorePersonalFoulsPer100Possessions20 =
      (ph.personalFoulsPer100Possessions20 + pa.personalFoulsPer100Possessions20) / 2;
    total.meanBoxscoreOpponentPersonalFoulsPer100Possessions20 =
      (ph.opponentPersonalFoulsPer100Possessions20 + pa.opponentPersonalFoulsPer100Possessions20) / 2;
    margin.boxscorePersonalFoulsAvoidedAdvantage20 =
      (pa.personalFoulsPer100Possessions20 - ph.personalFoulsPer100Possessions20) / 2;
  }
  const playerConcentration = context.playerConcentration;
  if (isObject(playerConcentration?.home) && isObject(playerConcentration?.away)) {
    const ph = playerConcentration.home;
    const pa = playerConcentration.away;
    total.meanTopScorerPointsShare20 = (ph.topScorerPointsShare20 + pa.topScorerPointsShare20) / 2;
    total.meanTopThreeScorersPointsShare20 = (ph.topThreeScorersPointsShare20 + pa.topThreeScorersPointsShare20) / 2;
    total.meanScoringConcentrationHhi20 = (ph.scoringConcentrationHhi20 + pa.scoringConcentrationHhi20) / 2;
    margin.topScorerPointsShareAdvantage20 = (ph.topScorerPointsShare20 - pa.topScorerPointsShare20) / 2;
    margin.scoringConcentrationHhiAdvantage20 = (ph.scoringConcentrationHhi20 - pa.scoringConcentrationHhi20) / 2;

    total.meanTopUsagePlayerLoadShare20 = (ph.topUsagePlayerLoadShare20 + pa.topUsagePlayerLoadShare20) / 2;
    total.meanTopThreeUsagePlayersLoadShare20 = (ph.topThreeUsagePlayersLoadShare20 + pa.topThreeUsagePlayersLoadShare20) / 2;
    total.meanUsageConcentrationHhi20 = (ph.usageConcentrationHhi20 + pa.usageConcentrationHhi20) / 2;
    margin.topUsagePlayerLoadShareAdvantage20 = (ph.topUsagePlayerLoadShare20 - pa.topUsagePlayerLoadShare20) / 2;
    margin.usageConcentrationHhiAdvantage20 = (ph.usageConcentrationHhi20 - pa.usageConcentrationHhi20) / 2;

    total.meanTopThreeUsagePlayersTrueShooting20 =
      (ph.topThreeUsagePlayersTrueShooting20 + pa.topThreeUsagePlayersTrueShooting20) / 2;
    margin.topThreeUsagePlayersTrueShootingAdvantage20 =
      (ph.topThreeUsagePlayersTrueShooting20 - pa.topThreeUsagePlayersTrueShooting20) / 2;
  }
  const venueProfile = context.venueProfile;
  if (isObject(venueProfile?.home) && isObject(venueProfile?.away)) {
    const home = venueProfile.home;
    const away = venueProfile.away;
    for (const window of [10, 20]) {
      const homeOffense = home['targetVenuePointsForDelta' + window];
      const awayOffense = away['targetVenuePointsForDelta' + window];
      const homeDefense = home['targetVenuePointsAgainstDelta' + window];
      const awayDefense = away['targetVenuePointsAgainstDelta' + window];
      total['meanVenueOffenseDeviation' + window] = (homeOffense + awayOffense) / 2;
      total['meanVenueDefenseAllowanceDeviation' + window] = (homeDefense + awayDefense) / 2;
      margin['venueOffenseDeviationAdvantage' + window] = (homeOffense - awayOffense) / 2;
      margin['venueDefenseAllowanceAdvantage' + window] = (awayDefense - homeDefense) / 2;
    }
  }
  return { total, margin };
}

function featureMissingNames(basis) {
  return {
    total: TOTAL_BASE_NAMES.filter(name => basis.total[name] == null),
    margin: [],
  };
}

/**
 * Deterministically validates and transforms a V4 inputFeatures object.
 * This API does not accept targets, game metadata, fitted statistics, or labels.
 */
export function buildCandidate10Features(inputFeatures) {
  assertOnlyKeys(inputFeatures, INPUT_FEATURE_KEYS, 'inputFeatures');
  requireFields(inputFeatures, [...INPUT_FEATURE_KEYS], 'inputFeatures');
  if (inputFeatures.phase !== 'regular') {
    fail('phase-not-supported', 'Candidate-10 development features currently support regular-season inputFeatures only.');
  }
  const temporal = validateTemporalContract(inputFeatures);
  validateHistoryContext(inputFeatures.historicalContext, temporal);
  validateSide(inputFeatures.home, 'home');
  validateSide(inputFeatures.away, 'away');
  validateDifferenceRecord(inputFeatures);
  const basis = buildFeatureBasis(inputFeatures);
  const missing = featureMissingNames(basis);
  const coldStart = inputFeatures.home.windowGameCount === 0 || inputFeatures.away.windowGameCount === 0;
  const bothSidesColdStart = inputFeatures.home.windowGameCount === 0 && inputFeatures.away.windowGameCount === 0;
  const lineage = {
    developmentOnly: true,
    builderVersion: CANDIDATE10_VERSION,
    inputContract: 'V4 values.inputFeatures with temporalUse, home, away, homeAwayDifference, and phase',
    inputRoot: 'inputFeatures',
    phase: inputFeatures.phase,
    asOf: temporal.asOf,
    observedThrough: temporal.observedThrough,
    inputFieldsUsedForPredictionBasis: [
      'home.pointsForPerGameLast10', 'home.pointsAgainstPerGameLast10', 'home.winRateLast10', 'home.restDays', 'home.gamesLast7Days', 'home.windowGameCount',
      'away.pointsForPerGameLast10', 'away.pointsAgainstPerGameLast10', 'away.winRateLast10', 'away.restDays', 'away.gamesLast7Days', 'away.windowGameCount',
    ],
    contractFieldsCheckedButNotModeled: ['phase', 'temporalUse.asOf', 'temporalUse.observedThrough'],
    inputFieldsCheckedButNotModeled: [
      'home.pointDifferentialPerGameLast10', 'away.pointDifferentialPerGameLast10',
      'home.backToBack', 'away.backToBack', 'homeAwayDifference.*',
    ],
    inputFieldsNeverReadAsProof: ['temporalUse.eligibleForPredictiveFeatures'],
    outcomeOrTargetFieldsRead: [],
    historyRefs: {
      home: [...inputFeatures.home.priorGameRefs],
      away: [...inputFeatures.away.priorGameRefs],
      usedAsModelFeatures: false,
    },
    historyCounts: {
      homePrior: inputFeatures.home.priorGameCount,
      awayPrior: inputFeatures.away.priorGameCount,
      homeWindow: inputFeatures.home.windowGameCount,
      awayWindow: inputFeatures.away.windowGameCount,
    },
    coldStartPolicy: bothSidesColdStart ? 'both-sides-cold-start; fit-mean-imputation-plus-missingness-features; team margin contrasts are zero and learned home-court advantage remains' : coldStart ? 'one-side-cold-start; fit-mean-imputation-plus-side-missingness-contrast and learned home-court advantage' : 'observed-window-values; missing fields still use fit-mean-imputation-plus-missingness-features',
    nullFeaturesBeforeFit: missing.total,
    historicalContext: {
      format: inputFeatures.historicalContext.format,
      observedThrough: inputFeatures.historicalContext.observedThrough,
      sourcePriorGameCount: inputFeatures.historicalContext.sourcePriorGameCount,
      homeHistoryCount: inputFeatures.historicalContext.home.historyGameCount,
      awayHistoryCount: inputFeatures.historicalContext.away.historyGameCount,
      parameters: inputFeatures.historicalContext.parameters,
    },
    availabilityCaveat: 'The inputFeatures-only API validates internal role/cutoff/date shape. It cannot compare asOf against scheduledAtUtc or independently prove source availability; the caller must validate target schedule chronology and source evidence.',
  };
  return deepFreeze({
    format: 'djhc-swishiq-v4-candidate10-feature-basis-v1',
    total: Object.freeze({ ...basis.total }),
    margin: Object.freeze({ ...basis.margin }),
    featureLineage: lineage,
  });
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(rows[pivot][column]) || Math.abs(rows[pivot][column]) < 1e-12) {
      fail('fit-singular', `Candidate-10 ridge system is singular at column ${column}.`);
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let cell = column; cell <= size; cell += 1) rows[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (factor === 0) continue;
      for (let cell = column; cell <= size; cell += 1) rows[row][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map(row => row[size]);
}

function ridgeFit(designRows, targets, ridgeLambda, { unpenalizedFirstColumn = false } = {}) {
  if (!designRows.length || designRows.length !== targets.length) fail('fit-rows-invalid', 'Each ridge head requires aligned nonempty fit rows and targets.');
  const width = designRows[0].length;
  if (!width) fail('fit-design-invalid', 'Candidate-10 ridge design basis cannot be empty.');
  const invalidRow = designRows.findIndex(row => row.length !== width || row.some(value => !isFiniteNumber(value)));
  if (invalidRow !== -1) {
    const row = designRows[invalidRow];
    const invalidColumns = row.flatMap((value, column) => isFiniteNumber(value) ? [] : [column]);
    fail('fit-design-invalid', `Candidate-10 ridge design row ${invalidRow} must have width ${width} and finite values; received width ${row.length}, invalid columns ${invalidColumns.join(',') || 'none'}.`);
  }
  const gram = Array.from({ length: width }, () => Array(width).fill(0));
  const cross = Array(width).fill(0);
  for (let rowIndex = 0; rowIndex < designRows.length; rowIndex += 1) {
    const row = designRows[rowIndex];
    const target = targets[rowIndex];
    if (!isFiniteNumber(target)) fail('fit-target-invalid', 'Candidate-10 ridge targets must be finite.');
    for (let left = 0; left < width; left += 1) {
      cross[left] += row[left] * target;
      for (let right = 0; right < width; right += 1) gram[left][right] += row[left] * row[right];
    }
  }
  for (let index = 0; index < width; index += 1) {
    if (unpenalizedFirstColumn && index === 0) continue;
    gram[index][index] += ridgeLambda;
  }
  return solveLinearSystem(gram, cross);
}

function fitCenterScale(values) {
  const present = values.filter(isFiniteNumber);
  const center = present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : 0;
  const variance = present.length ? present.reduce((sum, value) => sum + ((value - center) ** 2), 0) / present.length : 0;
  const standardDeviation = Math.sqrt(variance);
  return { center, scale: standardDeviation > EPSILON ? standardDeviation : 1, observedCount: present.length };
}

function fitTotalHead(featureRows, targetTotals, ridgeLambda, featureNames) {
  const stats = {};
  for (const name of featureNames) stats[name] = fitCenterScale(featureRows.map(row => row.total[name]));
  const columns = ['intercept', ...featureNames];
  const design = featureRows.map(row => {
    const vector = [1];
    for (const name of featureNames) {
      const value = row.total[name] == null ? stats[name].center : row.total[name];
      vector.push((value - stats[name].center) / stats[name].scale);
    }
    return vector;
  });
  const coefficients = ridgeFit(design, targetTotals, ridgeLambda, { unpenalizedFirstColumn: true });
  return { featureNames: columns, fitStatistics: stats, coefficients };
}

function fitMarginHead(featureRows, targetMargins, ridgeLambda, featureNames) {
  const invalidValue = featureRows.findIndex(row => featureNames.some(name => !isFiniteNumber(row.margin[name])));
  if (invalidValue !== -1) {
    const row = featureRows[invalidValue];
    const invalidNames = featureNames.filter(name => !isFiniteNumber(row.margin[name]));
    fail('fit-margin-feature-invalid', `Candidate-10 margin fit row ${invalidValue} (${row.gameRef ?? 'unknown gameRef'}, ${row.gameDateLocal ?? 'unknown date'}) has non-finite features: ${invalidNames.join(', ')}.`);
  }
  const stats = {};
  for (const name of featureNames) {
    const values = featureRows.map(row => row.margin[name]);
    const rms = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value ** 2), 0) / values.length) : 0;
    stats[name] = { center: 0, scale: rms > EPSILON ? rms : 1, statistic: 'fit-row root-mean-square with zero center to preserve antisymmetry' };
  }
  const design = featureRows.map(row => [1, ...featureNames.map(name => row.margin[name] / stats[name].scale)]);
  const coefficients = ridgeFit(design, targetMargins, ridgeLambda, { unpenalizedFirstColumn: true });
  return {
    featureNames: ['homeCourtIntercept', ...featureNames],
    fitStatistics: stats,
    intercept: coefficients[0],
    coefficients,
  };
}

function validateFitTarget(target, rowIndex) {
  if (!isObject(target) || target.status !== 'available'
      || !Number.isSafeInteger(target.homeScore) || target.homeScore < 0 || target.homeScore > 300
      || !Number.isSafeInteger(target.awayScore) || target.awayScore < 0 || target.awayScore > 300) {
    fail('fit-target-invalid', `Fit row ${rowIndex} must contain available integer home/away scores in [0, 300].`);
  }
  if (target.margin != null && target.margin !== target.homeScore - target.awayScore) {
    fail('fit-target-invalid', `Fit row ${rowIndex} target margin conflicts with its scores.`);
  }
  return { total: target.homeScore + target.awayScore, margin: target.homeScore - target.awayScore };
}

/**
 * Fits two ridge heads from the supplied fit rows only. It does not accept a
 * tune set, outer set, evaluation labels, probability calibration, or a
 * feature-statistics override. Pass the previously frozen lambda explicitly.
 */
export function fitCandidate10ScoreModel(options = {}) {
  assertOnlyKeys(options, FIT_CONFIG_KEYS, 'Candidate-10 fit configuration');
  requireFields(options, ['fitRows', 'ridgeLambda', 'featureFamilies'], 'Candidate-10 fit configuration');
  const { fitRows, ridgeLambda, featureFamilies } = options;
  if (options.excludedBaseFeatures !== undefined && options.excludedFeatures !== undefined) {
    fail('feature-exclusion-invalid', 'Use either excludedFeatures or legacy excludedBaseFeatures, not both.');
  }
  const excludedFeatures = options.excludedFeatures ?? options.excludedBaseFeatures ?? [];
  if (!Array.isArray(excludedFeatures) || new Set(excludedFeatures).size !== excludedFeatures.length
      || excludedFeatures.some(name => !CANDIDATE10_MODEL_FEATURE_NAME_SET.has(name))) {
    fail('feature-exclusion-invalid', 'Feature exclusions must be unique names from the declared Candidate 10 feature map.');
  }
  if (!Array.isArray(featureFamilies) || new Set(featureFamilies).size !== featureFamilies.length
      || featureFamilies.some(name => !Object.hasOwn(HISTORY_FAMILIES, name))) {
    fail('feature-family-invalid', 'Select unique declared historical feature families.');
  }
  if (!Array.isArray(fitRows) || fitRows.length < 2) fail('fit-rows-invalid', 'Candidate-10 requires at least two fit rows.');
  if (!isFiniteNumber(ridgeLambda) || ridgeLambda <= 0 || ridgeLambda > 100) {
    fail('ridge-penalty-invalid', 'ridgeLambda must be provided, finite, > 0, and <= 100; this module does not tune it.');
  }
  const usesCandidate21Boxscore = featureFamilies.some(name => name.startsWith('boxscore-')
    && !name.startsWith('boxscore-profile-'));
  const usesCandidate22Profile = featureFamilies.some(name => name.startsWith('boxscore-profile-'));
  const usesCandidate23Role = featureFamilies.some(name => name.startsWith('player-concentration-'));
  const usesCandidate24Venue = featureFamilies.some(name => name.startsWith('venue-conditional-'));
  const gameRefs = new Set();
  const featureRows = [];
  const targetTotals = [];
  const targetMargins = [];
  const seasons = new Set();
  for (const [index, row] of fitRows.entries()) {
    if (!isObject(row) || !isObject(row.inputFeatures) || !isObject(row.target)) {
      fail('fit-row-invalid', `Fit row ${index + 1} must provide inputFeatures and target separately.`);
    }
    if (typeof row.gameRef !== 'string' || !row.gameRef || !validDate(row.gameDateLocal)
        || row.gameDateLocal !== row.inputFeatures.historicalContext?.gameDateLocal) {
      fail('fit-row-identity-invalid', 'Fit rows require unique game references and matching declared/context dates.');
    }
    if (typeof row.gameRef === 'string') {
      if (gameRefs.has(row.gameRef)) fail('fit-row-invalid', `Duplicate fit gameRef ${row.gameRef}.`);
      gameRefs.add(row.gameRef);
    }
    if (Number.isSafeInteger(row.seasonStartYear)) seasons.add(row.seasonStartYear);
    if (usesCandidate21Boxscore) validateCandidate21BoxscoreContext(row.inputFeatures);
    if (usesCandidate22Profile) validateCandidate22ProfileContext(row.inputFeatures);
    if (usesCandidate23Role) validateCandidate23RoleContext(row.inputFeatures);
    if (usesCandidate24Venue) validateCandidate24VenueContext(row.inputFeatures);
    const built = buildCandidate10Features(row.inputFeatures);
    const target = validateFitTarget(row.target, index + 1);
    featureRows.push({ total: built.total, margin: built.margin, gameRef: row.gameRef, gameDateLocal: row.gameDateLocal });
    targetTotals.push(target.total);
    targetMargins.push(target.margin);
  }
  const excluded = new Set(excludedFeatures);
  const totalNames = [
    ...TOTAL_BASE_NAMES.filter(name => !excluded.has(name)),
    ...featureFamilies.flatMap(name => HISTORY_FAMILIES[name].total).filter(name => !excluded.has(name)),
  ];
  const marginNames = [
    ...MARGIN_BASE_NAMES.filter(name => !excluded.has(name)),
    ...featureFamilies.flatMap(name => HISTORY_FAMILIES[name].margin).filter(name => !excluded.has(name)),
  ];
  const totalHead = fitTotalHead(featureRows, targetTotals, ridgeLambda, totalNames);
  const marginHead = fitMarginHead(featureRows, targetMargins, ridgeLambda, marginNames);
  const freezeStatistics = statistics => Object.freeze(Object.fromEntries(
    Object.entries(statistics).map(([name, value]) => [name, Object.freeze({ ...value })]),
  ));
  return deepFreeze({
    format: usesCandidate24Venue ? CANDIDATE24_FORMAT : usesCandidate23Role ? CANDIDATE23_FORMAT : usesCandidate22Profile ? CANDIDATE22_FORMAT : usesCandidate21Boxscore ? CANDIDATE21_FORMAT : CANDIDATE10_FORMAT,
    version: usesCandidate24Venue ? CANDIDATE24_VERSION : usesCandidate23Role ? CANDIDATE23_VERSION : usesCandidate22Profile ? CANDIDATE22_VERSION : usesCandidate21Boxscore ? CANDIDATE21_VERSION : CANDIDATE10_VERSION,
    status: usesCandidate24Venue ? CANDIDATE24_STATUS : usesCandidate23Role ? CANDIDATE23_STATUS : usesCandidate22Profile ? CANDIDATE22_STATUS : usesCandidate21Boxscore ? CANDIDATE21_STATUS : CANDIDATE10_STATUS,
    algorithm: 'two-head-standardized-ridge; symmetric-total; home-court-intercept-plus-antisymmetric-team-margin; coherent-score-reconstruction',
    ridgeLambda,
    featureFamilies: [...featureFamilies],
    excludedFeatures: [...excludedFeatures],
    fitRowCount: fitRows.length,
    fitSeasonStartYears: [...seasons].sort((a, b) => a - b),
    totalHead: { ...totalHead, coefficients: [...totalHead.coefficients], featureNames: [...totalHead.featureNames], fitStatistics: freezeStatistics(totalHead.fitStatistics) },
    marginHead: { ...marginHead, coefficients: [...marginHead.coefficients], featureNames: [...marginHead.featureNames], fitStatistics: freezeStatistics(marginHead.fitStatistics) },
    fitTargetSummary: {
      totalMean: targetTotals.reduce((sum, value) => sum + value, 0) / targetTotals.length,
      marginMean: targetMargins.reduce((sum, value) => sum + value, 0) / targetMargins.length,
      totalMin: Math.min(...targetTotals),
      totalMax: Math.max(...targetTotals),
      marginMin: Math.min(...targetMargins),
      marginMax: Math.max(...targetMargins),
    },
    trainingUse: {
      featureStatisticsFitRowsOnly: true,
      targetLabelsUsedOnlyForHeadFit: true,
      targetLabelsUsedInFeatureConstruction: false,
      tuneSetAccepted: false,
      outerSetAccepted: false,
      lambdaTunedHere: false,
      developmentOnly: true,
    },
  });
}

function multiplyRow(row, coefficients) {
  return row.reduce((sum, value, index) => sum + value * coefficients[index], 0);
}

function projectTotalHead(features, head) {
  const vector = [1];
  for (const name of head.featureNames.slice(1)) {
    const stat = head.fitStatistics[name];
    const value = features.total[name] == null ? stat.center : features.total[name];
    vector.push((value - stat.center) / stat.scale);
  }
  return multiplyRow(vector, head.coefficients);
}

function projectMarginHead(features, head) {
  const vector = [1, ...head.featureNames.slice(1).map(name => features.margin[name] / head.fitStatistics[name].scale)];
  return multiplyRow(vector, head.coefficients);
}

/** Predicts a coherent home/away score pair from inputFeatures only. */
export function predictCandidate10Score(options = {}) {
  assertOnlyKeys(options, PREDICT_CONFIG_KEYS, 'Candidate-10 prediction request');
  requireFields(options, ['model', 'inputFeatures'], 'Candidate-10 prediction request');
  const { model, inputFeatures } = options;
  const isCandidate10 = isObject(model) && model.format === CANDIDATE10_FORMAT && model.version === CANDIDATE10_VERSION;
  const isCandidate21 = isObject(model) && model.format === CANDIDATE21_FORMAT && model.version === CANDIDATE21_VERSION;
  const isCandidate22 = isObject(model) && model.format === CANDIDATE22_FORMAT && model.version === CANDIDATE22_VERSION;
  const isCandidate23 = isObject(model) && model.format === CANDIDATE23_FORMAT && model.version === CANDIDATE23_VERSION;
  const isCandidate24 = isObject(model) && model.format === CANDIDATE24_FORMAT && model.version === CANDIDATE24_VERSION;
  if ((!isCandidate10 && !isCandidate21 && !isCandidate22 && !isCandidate23 && !isCandidate24)
      || !model.totalHead || !model.marginHead || !isObject(inputFeatures)) {
    fail('model-or-input-invalid', 'Candidate-10 prediction requires a fitted Candidate-10 model and a V4 inputFeatures object.');
  }
  const usesCandidate21Boxscore = isCandidate21 || model.featureFamilies?.some(name => name.startsWith('boxscore-')
    && !name.startsWith('boxscore-profile-'));
  const usesCandidate22Profile = isCandidate22 || model.featureFamilies?.some(name => name.startsWith('boxscore-profile-'));
  const usesCandidate23Role = isCandidate23 || model.featureFamilies?.some(name => name.startsWith('player-concentration-'));
  const usesCandidate24Venue = isCandidate24 || model.featureFamilies?.some(name => name.startsWith('venue-conditional-'));
  if (usesCandidate21Boxscore) validateCandidate21BoxscoreContext(inputFeatures);
  if (usesCandidate22Profile) validateCandidate22ProfileContext(inputFeatures);
  if (usesCandidate23Role) validateCandidate23RoleContext(inputFeatures);
  if (usesCandidate24Venue) validateCandidate24VenueContext(inputFeatures);
  const features = buildCandidate10Features(inputFeatures);
  const totalUnbounded = projectTotalHead(features, model.totalHead);
  const marginUnbounded = projectMarginHead(features, model.marginHead);
  const total = Math.max(0, Math.min(600, totalUnbounded));
  const margin = Math.max(-total, Math.min(total, marginUnbounded));
  const homeScore = (total + margin) / 2;
  const awayScore = (total - margin) / 2;
  return deepFreeze({
    format: isCandidate24 ? 'djhc-swishiq-v4-candidate24-score-prediction-v1'
      : isCandidate23 ? 'djhc-swishiq-v4-candidate23-score-prediction-v1'
      : isCandidate22 ? 'djhc-swishiq-v4-candidate22-score-prediction-v1'
      : isCandidate21 ? 'djhc-swishiq-v4-candidate21-score-prediction-v1'
      : 'djhc-swishiq-v4-candidate10-score-prediction-v1',
    status: model.status,
    total,
    margin,
    homeScore,
    awayScore,
    raw: { total: totalUnbounded, margin: marginUnbounded },
    coherence: {
      scoreSumEqualsTotal: Math.abs(homeScore + awayScore - total) <= EPSILON,
      scoreDifferenceEqualsMargin: Math.abs(homeScore - awayScore - margin) <= EPSILON,
      scoresNonnegative: homeScore >= 0 && awayScore >= 0,
      totalClippedToRange: total !== totalUnbounded,
      marginClippedToTotal: margin !== marginUnbounded,
    },
    featureLineage: {
      ...features.featureLineage,
      modelVersion: model.version,
      ridgeLambda: model.ridgeLambda,
      fitRowCount: model.fitRowCount,
      fitStatisticsSource: 'fit rows only',
      totalFeatureNames: [...model.totalHead.featureNames],
      marginFeatureNames: [...model.marginHead.featureNames],
      totalFeaturesAreSideSwapInvariant: true,
      marginTeamFeaturesAreSideSwapAntisymmetric: true,
      leagueHomeMarginRemainsAttachedToHomeRole: model.featureFamilies.includes('environment'),
      homeCourtInterceptRemainsAttachedToHomeRole: true,
      fittedHomeCourtMargin: model.marginHead.intercept,
    },
  });
}

export function fitCandidate21ScoreModel(options = {}) {
  const model = fitCandidate10ScoreModel(options);
  if (model.format !== CANDIDATE21_FORMAT || model.version !== CANDIDATE21_VERSION) {
    fail('candidate21-feature-family-required', 'Candidate 21 fitting requires at least one box-score feature family.');
  }
  return model;
}

export function predictCandidate21Score(options = {}) {
  const model = options?.model;
  if (model?.format !== CANDIDATE21_FORMAT || model?.version !== CANDIDATE21_VERSION) {
    fail('candidate21-model-required', 'Candidate 21 prediction requires its fitted four-factor/box-score mean model.');
  }
  return predictCandidate10Score(options);
}

export function fitCandidate22ScoreModel(options = {}) {
  const model = fitCandidate10ScoreModel(options);
  if (model.format !== CANDIDATE22_FORMAT || model.version !== CANDIDATE22_VERSION) {
    fail('candidate22-profile-family-required', 'Candidate 22 fitting requires at least one box-score profile feature family.');
  }
  return model;
}

export function predictCandidate22Score(options = {}) {
  const model = options?.model;
  if (model?.format !== CANDIDATE22_FORMAT || model?.version !== CANDIDATE22_VERSION) {
    fail('candidate22-model-required', 'Candidate 22 prediction requires its fitted box-score profile mean model.');
  }
  return predictCandidate10Score(options);
}

export function fitCandidate23ScoreModel(options = {}) {
  const model = fitCandidate10ScoreModel(options);
  if (model.format !== CANDIDATE23_FORMAT || model.version !== CANDIDATE23_VERSION) {
    fail('candidate23-player-role-family-required', 'Candidate 23 fitting requires at least one player-concentration family.');
  }
  return model;
}

export function predictCandidate23Score(options = {}) {
  const model = options?.model;
  if (model?.format !== CANDIDATE23_FORMAT || model?.version !== CANDIDATE23_VERSION) {
    fail('candidate23-model-required', 'Candidate 23 prediction requires its fitted player-role mean model.');
  }
  return predictCandidate10Score(options);
}

export function fitCandidate24ScoreModel(options = {}) {
  const model = fitCandidate10ScoreModel(options);
  if (model.format !== CANDIDATE24_FORMAT || model.version !== CANDIDATE24_VERSION) {
    fail('candidate24-venue-family-required', 'Candidate 24 fitting requires at least one venue-conditional family.');
  }
  return model;
}

export function predictCandidate24Score(options = {}) {
  const model = options?.model;
  if (model?.format !== CANDIDATE24_FORMAT || model?.version !== CANDIDATE24_VERSION) {
    fail('candidate24-model-required', 'Candidate 24 prediction requires its fitted venue-form mean model.');
  }
  return predictCandidate10Score(options);
}

export const CANDIDATE10_CONTRACT = Object.freeze({
  inputContract: 'V4 values.inputFeatures only',
  additionalInputNamespace: 'historicalContext: swishiq-game-prior-history-context-v2',
  availableHistoricalFeatureFamilies: HISTORY_FAMILIES,
  supportedPhase: 'regular',
  temporalRequirements: Object.freeze(['temporalUse.role=feature', 'canonical UTC temporalUse.asOf', 'valid observedThrough strictly before asOf']),
  historyRequirements: Object.freeze(['unique priorGameRefs matching windowGameCount', 'windowGameCount=min(10, priorGameCount)', 'cold-start nulls consistent with historyStatus']),
  differenceValidation: 'Recompute all five home-minus-away fields with null propagation; verify side point differential equals PF minus PA.',
  symmetricTotalBasis: TOTAL_BASE_NAMES,
  antisymmetricMarginBasis: MARGIN_BASE_NAMES,
  omittedRedundantInputs: Object.freeze(['side pointDifferentialPerGameLast10 as a separate model column', 'homeAwayDifference numeric fields as additional model columns', 'backToBack as a separate model column']),
  coldStartPolicy: 'Fit-row mean imputation and scaling for total head, with symmetric side-missingness shares as explicit features; margin numeric contrasts are zero when either side value is missing and retain only antisymmetric missingness contrasts.',
  antisymmetricMarginHead: 'Zero-center fit-row RMS scaling for team contrasts plus an unpenalized fitted home-court intercept in home-minus-away orientation. Swapping team identities reverses team contrasts while retaining the home venue effect.',
  asOfScheduleCheck: 'Unresolved at this API boundary: inputFeatures does not carry scheduledAtUtc, so the caller must compare asOf with schedule tip and establish source evidence.',
  predictiveValidationStatus: 'not-run',
  productionApprovalStatus: 'not-approved',
});

/*
 * Career Simulator model boundary.
 *
 * This module is intentionally separate from career-simulator.js. The older
 * module is an observed-history viewer and descriptive bootstrap. This module
 * is the forward model: it requires an explicit as-of snapshot, an accepted
 * career-history cohort, a bounded progression policy, and a replay seed.
 *
 * It never treats an archive edge as retirement, never invents an injury or
 * coaching explanation, and never reports a milestone probability without a
 * validated held-out calibration receipt.
 */

import { buildCareerTimeline } from './career-simulator.js?v=20260928i&rev=career-output-cleanup-v18-phase9-share-v1-20260928i';
import {
  careerStateForPlayerSeason,
  careerStateNameRefConflicts,
  normalizeCareerAgeEvidence,
  normalizeCareerStateName,
} from './career-state-source.js?v=20260927s&rev=career-state-v8-identity-collision-guard';

export const CAREER_SIMULATION_POLICY = Object.freeze({
  version: 'swishiq-career-simulation-v13',
  asOfGuard: 'frozen-cutoff-and-cohort-binding-v3',
  timelineIntegrity: 'ordered-unique-season-rows-v1',
  censoringRule: 'retirement-requires-observed-or-dated-evidence-v1',
  minRepeats: 50,
  maxRepeats: 500,
  maxHorizon: 15,
  maxCohort: 240,
  minComparables: 3,
  minTransitions: 3,
  maxWorkloadExpansion: 1.35,
  maxMinutesPerGame: 48,
  // Traded-player regular-season team rows can sum above the 82-game
  // schedule (for example, 83-84 games after a mid-season move). Keep the
  // observed denominator separate from the future schedule cap.
  maxObservedGamesPerSeason: 90,
  maxGamesPerSeason: 82,
  transitionSelection: 'role-age-workload-exposure-similarity-weighted-v3',
  // A reliable transition needs both enough game opportunities and enough
  // cumulative minutes. The 1,500-minute reference is the rounded 75th
  // percentile of minimum-endpoint exposure in the accepted 2017-26 pool.
  transitionExposureReferenceMinutes: 1500,
  transitionExposureFloor: 0.1,
  transitionExposureWeighting: 'minimum-endpoint-games-and-minutes-sqrt-reliability-v2',
  transitionShrinkage: 'selected-pool-exposure-equivalent-sample-toward-exposure-weighted-cohort-mean-v4',
  transitionDispersion: 'selected-pool-variance-shrunk-to-cohort-prior-v1',
  transitionDispersionPriorStrength: 12,
  transitionInnovation: 'empirical-pool-variance-matched-to-posterior-v1',
  persistentInnovationShare: 0.15,
  stageCurve: 'experience-conditioned-progression-v1',
  ageCurve: 'age-and-experience-conditioned-progression-v1',
  roleState: 'minutes-availability-production-thresholds-v2',
  trajectoryCorrelation: 'repeat-level-local-scale-persistent-shock-v2',
  metricTrajectory: 'workload-coupled-per36-transition-v1',
  metricProgressionDirection: 'benefit-oriented-observed-delta-v1',
  comparatorAnchor: 'exact-cutoff-preferred-with-explicit-lag-v1',
  availabilityUncertainty: 'validated-games-noise-v1',
  minimumRateMinutesPerGame: 8,
});

export const CAREER_CALIBRATION_POLICY = Object.freeze({
  version: 'career-milestone-rolling-holdout-v1',
  holdoutPolicy: 'strict-before-holdout-v1',
  minHoldouts: 2,
  minAggregateSample: 30,
});

export const CAREER_SIMULATION_RECIPE_VERSION = 1;
export const CAREER_PUBLIC_RECEIPT_VERSION = 'career-simulation-public-receipt-v2';
export const CAREER_RECIPE_LIMITS = Object.freeze({ maxBytes: 32768, maxRows: 100000 });

export const CAREER_STAGES = Object.freeze([
  'prospect',
  'rookie',
  'early-career',
  'prime',
  'late-career',
  'custom',
]);

export const CAREER_METRICS = Object.freeze([
  'points',
  'assists',
  'rebounds',
  'turnovers',
  'steals',
  'blocks',
]);

// Progression presets describe improvement versus regression, not the sign of
// every raw stat delta. Production metrics are benefit-positive, while a
// lower turnover rate is an improvement. Keep this direction explicit so a
// breakout cannot accidentally amplify a worsening turnover transition.
const CAREER_METRIC_DIRECTIONS = Object.freeze({
  points: 1,
  assists: 1,
  rebounds: 1,
  turnovers: -1,
  steals: 1,
  blocks: 1,
});

export const CAREER_ROLE_STATES = Object.freeze(['star', 'starter', 'rotation', 'fringe', 'out']);

const PROGRESSION_PRESETS = Object.freeze({
  conservative: Object.freeze({ positive: 0.5, negative: 0.5, volatility: 0.5 }),
  typical: Object.freeze({ positive: 1, negative: 1, volatility: 1 }),
  breakout: Object.freeze({ positive: 1.5, negative: 0.35, volatility: 1.15 }),
  decline: Object.freeze({ positive: 0.35, negative: 1.5, volatility: 0.8 }),
});

const CENSORING_VALUES = new Set(['observed-retirement', 'archive-edge', 'unknown']);
const CAREER_PACKAGE_KINDS = new Set(['exact-season', 'pooled-window']);
const CAREER_PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim() && value.length <= 160 ? value.trim() : null;
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function sameNullableNumber(left, right) {
  if (left === null && right === null) return true;
  return finite(left) && finite(right) && Math.abs(round(left) - round(right)) <= 0.0001;
}

function sameNullableInteger(left, right) {
  return (left === null && right === null) || (integer(left) && integer(right) && left === right);
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!finite(value)) throw new Error('Career recipes cannot contain non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  throw new Error('Career recipes cannot contain unsupported values.');
}

function hashText(value) {
  let hash = 1469598103934665603n;
  for (const character of String(value)) {
    hash ^= BigInt(character.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

function requireSeed(seed) {
  if (typeof seed !== 'string' || !/^[A-Za-z0-9:._-]{1,80}$/.test(seed)) {
    throw new Error('Use a short alphanumeric replay seed.');
  }
  return seed;
}

function requireRange(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function requireIntegerRange(value, minimum, maximum, label) {
  if (!integer(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return value;
}

function randomStream(seed) {
  requireSeed(seed);
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const first = Math.max(random(), Number.MIN_VALUE);
  const second = Math.max(random(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function summarizeDistribution(values) {
  const usable = values.filter(finite).sort((left, right) => left - right);
  const at = percentile => usable.length
    ? round(usable[Math.max(0, Math.ceil(usable.length * percentile) - 1)])
    : null;
  return {
    quantiles: { 10: at(0.1), 50: at(0.5), 90: at(0.9) },
    availableRuns: usable.length,
  };
}

function standardDeviation(values) {
  const usable = values.filter(finite);
  if (usable.length < 2) return 0;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  return Math.sqrt(usable.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (usable.length - 1));
}

function seasonLabel(year) {
  return `${year}–${String(year + 1).slice(-2)}`;
}

function stageForExperience(experience) {
  if (!integer(experience) || experience < 0) return null;
  if (experience === 0) return 'rookie';
  if (experience <= 3) return 'early-career';
  if (experience <= 9) return 'prime';
  return 'late-career';
}

function roleStateFor({ minutesPerGame = null, games = null, metrics = {} } = {}) {
  const minutes = finite(minutesPerGame) ? minutesPerGame : 0;
  const points = finite(metrics.points) ? metrics.points : null;
  const availability = integer(games) ? games : 0;
  if (!(minutes > 0) || availability <= 0) return 'out';
  // A high-minute row is not enough evidence for a star role.  If the
  // primary production metric is unresolved, keep the state at starter so
  // role matching cannot turn missing data into a positive classification.
  if (minutes >= 30 && points !== null && points >= 16) return 'star';
  if (minutes >= 24) return 'starter';
  if (minutes >= 12) return 'rotation';
  return 'fringe';
}

function comparisonStage(stage) {
  // Accepted NBA career histories begin at a player's rookie season. A
  // prospect therefore uses the rookie transition anchor without pretending
  // that an unobserved pre-draft season is an NBA observation.
  return stage === 'prospect' ? 'rookie' : stage;
}

function validateStage(value) {
  const stage = String(value || '').trim().toLowerCase();
  if (!CAREER_STAGES.includes(stage)) throw new Error('Choose a supported career stage.');
  return stage;
}

function metricValue(row, key) {
  const value = row?.perGame?.[key];
  return finite(value) && value >= 0 ? value : null;
}

function minutesPerGame(row) {
  if (!integer(row?.games) || row.games <= 0 || !finite(row.minutes) || row.minutes < 0) return null;
  return round(row.minutes / row.games);
}

function rowState(row) {
  const state = {
    age: normalizeCareerAgeEvidence(row?.age),
    experience: integer(row?.experience) && row.experience >= 0 ? row.experience : null,
    stage: stageForExperience(row?.experience),
    positions: Array.isArray(row?.positions) ? [...row.positions].sort() : [],
    minutesPerGame: minutesPerGame(row),
    games: integer(row?.games) && row.games >= 0 ? row.games : null,
    metrics: Object.fromEntries(CAREER_METRICS.map(key => [key, metricValue(row, key)])),
  };
  state.ageSource = state.age === null ? null : text(row?.ageSource) || 'observed-season-row';
  state.experienceSource = text(row?.experienceSource) || (state.experience === null ? null : 'observed-season-row');
  state.stateJoin = text(row?.stateJoin) || (state.age !== null || state.experience !== null ? 'observed' : 'missing');
  state.stateQuality = text(row?.stateQuality) || (row?.stateConflict?.length ? 'conflict'
    : state.age !== null && state.experience !== null ? 'complete'
      : state.age !== null || state.experience !== null ? 'partial' : 'missing');
  state.stateConflict = Array.isArray(row?.stateConflict) ? row.stateConflict.map(conflict => ({ ...conflict })) : [];
  state.roleState = roleStateFor(state);
  return state;
}

function stateHasConflict(state) {
  return state?.stateQuality === 'conflict'
    || (Array.isArray(state?.stateConflict) && state.stateConflict.length > 0);
}

function metricDelta(from, to) {
  return Object.fromEntries(CAREER_METRICS.map(key => {
    const left = metricValue(from, key), right = metricValue(to, key);
    return [key, finite(left) && finite(right) ? round(right - left) : null];
  }));
}

function metricPer36(metrics, minutesPerGame, key) {
  if (!finite(metrics?.[key]) || !finite(minutesPerGame)
    || minutesPerGame < CAREER_SIMULATION_POLICY.minimumRateMinutesPerGame) return null;
  return round(metrics[key] * 36 / minutesPerGame);
}

function metricRateDelta(fromState, toState) {
  return Object.fromEntries(CAREER_METRICS.map(key => {
    const left = metricPer36(fromState.metrics, fromState.minutesPerGame, key);
    const right = metricPer36(toState.metrics, toState.minutesPerGame, key);
    return [key, finite(left) && finite(right) ? round(right - left) : null];
  }));
}

function stateMetricDelta(fromState, toState) {
  return Object.fromEntries(CAREER_METRICS.map(key => {
    const left = fromState?.metrics?.[key], right = toState?.metrics?.[key];
    return [key, finite(left) && finite(right) ? round(right - left) : null];
  }));
}

function validStateReceipt(state) {
  if (!object(state) || !object(state.metrics) || !Array.isArray(state.positions)
    || !CAREER_METRICS.every(key => owns(state.metrics, key)
      && (state.metrics[key] === null || (finite(state.metrics[key]) && state.metrics[key] >= 0)))) return false;
  if (state.age !== null && (!finite(state.age) || state.age < 12 || state.age > 60)) return false;
  if (state.experience !== null && (!integer(state.experience) || state.experience < 0 || state.experience > 40)) return false;
  if (state.minutesPerGame !== null && (!finite(state.minutesPerGame) || state.minutesPerGame < 0
    || state.minutesPerGame > CAREER_SIMULATION_POLICY.maxMinutesPerGame)) return false;
  if (state.games !== null && (!integer(state.games) || state.games < 0 || state.games > CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason)) return false;
  if (state.positions.some(position => !text(position)) || new Set(state.positions).size !== state.positions.length
    || state.positions.some((position, index) => index > 0 && position < state.positions[index - 1])) return false;
  if (state.ageSource !== null && !text(state.ageSource)
    || state.experienceSource !== null && !text(state.experienceSource)
    || !text(state.stateJoin)
    || !['complete', 'sourced-complete', 'partial', 'missing', 'conflict', 'observed'].includes(state.stateQuality)
    || !Array.isArray(state.stateConflict)) return false;
  const expectedStage = state.experience === null ? null : stageForExperience(state.experience);
  if (state.stage !== expectedStage) return false;
  return CAREER_ROLE_STATES.includes(state.roleState) && state.roleState === roleStateFor(state);
}

function sameCareerState(left, right) {
  if (!validStateReceipt(left) || !validStateReceipt(right)
    || !sameNullableNumber(left.age, right.age)
    || !sameNullableInteger(left.experience, right.experience)
    || left.stage !== right.stage
    || !sameNullableNumber(left.minutesPerGame, right.minutesPerGame)
    || !sameNullableInteger(left.games, right.games)
    || left.roleState !== right.roleState
    || left.stateJoin !== right.stateJoin
    || left.stateQuality !== right.stateQuality
    || stableJson(left.stateConflict) !== stableJson(right.stateConflict)
    || JSON.stringify(left.positions) !== JSON.stringify(right.positions)) return false;
  return CAREER_METRICS.every(key => sameNullableNumber(left.metrics[key], right.metrics[key]));
}

function sameMetricMap(left, right) {
  return object(left) && object(right) && CAREER_METRICS.every(key => owns(left, key)
    && owns(right, key) && sameNullableNumber(left[key], right[key]));
}

function sameTransitionReceipt(left, right) {
  return left?.fromSeasonStartYear === right?.fromSeasonStartYear
    && left?.toSeasonStartYear === right?.toSeasonStartYear
    && sameCareerState(left?.from, right?.from)
    && sameCareerState(left?.to, right?.to)
    && sameMetricMap(left?.metricDelta, right?.metricDelta)
    && sameMetricMap(left?.metricRateDelta, right?.metricRateDelta)
    && sameNullableNumber(left?.minutesDelta, right?.minutesDelta)
    && sameNullableInteger(left?.gamesDelta, right?.gamesDelta);
}

function transitionReceiptKey(transition, playerId = '') {
  return [playerId, transition?.fromSeasonStartYear, transition?.toSeasonStartYear].join('|');
}

function normalizeCensoring(value, retired = false) {
  if (retired === true) return 'observed-retirement';
  const normalized = String(value || 'unknown').trim().toLowerCase();
  return CENSORING_VALUES.has(normalized) ? normalized : 'unknown';
}

function historyIdentity(history, index) {
  if (!object(history) || !text(history.playerId) || !text(history.player)) {
    throw new Error(`Accepted career history ${index + 1} has no bounded player identity.`);
  }
  if (history.acceptedCareerHistory !== true) {
    throw new Error(`Career history for ${history.player} is not marked accepted.`);
  }
  if (!Array.isArray(history.profiles) || !history.profiles.length) {
    throw new Error(`Accepted career history for ${history.player} has no season profiles.`);
  }
  return { playerId: history.playerId.trim(), player: history.player.trim() };
}

function validateExplicitStateAgainstObserved(state, latestState, latestSeasonStartYear, asOfSeasonStartYear) {
  if (!object(state)) return;
  // Validate the explicit receipt even when the selected cutoff is a gap. A
  // malformed value must fail closed rather than being silently ignored by
  // the fallback to the latest observed row.
  if (Object.prototype.hasOwnProperty.call(state, 'age') && state.age !== null
    && (!finite(state.age) || state.age < 12 || state.age > 60)) {
    throw new Error('Explicit as-of age is unavailable or invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(state, 'experience') && state.experience !== null
    && !integer(state.experience, 0, 40)) {
    throw new Error('Explicit as-of experience is unavailable or invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(state, 'positions')) {
    if (!Array.isArray(state.positions)
      || state.positions.some(position => !text(position))
      || new Set(state.positions).size !== state.positions.length
      || state.positions.some((position, index) => index > 0 && position < state.positions[index - 1])) {
      throw new Error('Explicit as-of positions are unavailable or invalid.');
    }
  }
  if (state.metrics !== undefined && !object(state.metrics)) {
    throw new Error('An explicit as-of state metrics receipt must be an object.');
  }
  for (const key of CAREER_METRICS) {
    if (!owns(state.metrics, key)) continue;
    const supplied = state.metrics[key];
    if (supplied !== null && (!finite(supplied) || supplied < 0)) {
      throw new Error(`Explicit as-of ${key} must be a non-negative observed value or null.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(state, 'minutesPerGame') && state.minutesPerGame !== null
    && (!finite(state.minutesPerGame) || state.minutesPerGame < 0
      || state.minutesPerGame > CAREER_SIMULATION_POLICY.maxMinutesPerGame)) {
    throw new Error('Explicit as-of minutes per game is unavailable or invalid.');
  }
  if (Object.prototype.hasOwnProperty.call(state, 'games') && state.games !== null
    && !integer(state.games, 0, CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason)) {
    throw new Error('Explicit as-of games is unavailable or invalid.');
  }

  // Inputs may complete an as-of gap, but they may not silently overwrite a
  // package-observed value at the selected cutoff. This keeps the frozen
  // state from becoming a back door for revised or future production.
  const hasObservedCutoffRow = latestSeasonStartYear === asOfSeasonStartYear;
  if (!hasObservedCutoffRow) return;
  for (const key of CAREER_METRICS) {
    if (!owns(state.metrics, key)) continue;
    const supplied = state.metrics[key];
    if (finite(supplied) && finite(latestState.metrics[key])
      && !sameNullableNumber(supplied, latestState.metrics[key])) {
      throw new Error(`Explicit as-of ${key} does not match the observed cutoff record.`);
    }
  }
  if (owns(state, 'minutesPerGame')) {
    if (finite(state.minutesPerGame) && finite(latestState.minutesPerGame)
      && !sameNullableNumber(state.minutesPerGame, latestState.minutesPerGame)) {
      throw new Error('Explicit as-of minutes per game does not match the observed cutoff record.');
    }
  }
  if (owns(state, 'games')) {
    if (integer(state.games) && integer(latestState.games) && state.games !== latestState.games) {
      throw new Error('Explicit as-of games does not match the observed cutoff record.');
    }
  }
  if (finite(state.age) && finite(latestState.age) && !sameNullableNumber(state.age, latestState.age)) {
    throw new Error('Explicit as-of age does not match the observed cutoff record.');
  }
  if (integer(state.experience) && integer(latestState.experience) && state.experience !== latestState.experience) {
    throw new Error('Explicit as-of experience does not match the observed cutoff record.');
  }
}

function resolveAsOfState(timeline, {
  asOfSeasonStartYear,
  asOfStage,
  asOfAge,
  asOfExperience,
  state: explicitState,
} = {}) {
  const cutoff = requireIntegerRange(asOfSeasonStartYear, 1947, 2200, 'As-of season start year');
  const observed = timeline.rows.filter(row => row.status === 'observed' && row.seasonStartYear <= cutoff);
  const latest = observed.at(-1) || null;
  const latestState = rowState(latest);
  const state = object(explicitState) ? explicitState : {};
  if (explicitState !== undefined
    && (state.frozen !== true || !integer(state.sourceSeasonStartYear)
      || state.sourceSeasonStartYear < 1947 || state.sourceSeasonStartYear > cutoff)) {
    throw new Error('An explicit as-of state must be frozen and sourced on or before the selected season.');
  }
  validateExplicitStateAgainstObserved(state, latestState, latest?.seasonStartYear ?? null, cutoff);
  const hasObservedCutoffRow = latest?.seasonStartYear === cutoff;
  if (explicitState !== undefined && hasObservedCutoffRow
    && state.sourceSeasonStartYear !== cutoff) {
    throw new Error('An explicit as-of state must be sourced on the selected season when an observed cutoff row exists.');
  }
  if (hasObservedCutoffRow && finite(asOfAge) && finite(latestState.age)
    && !sameNullableNumber(asOfAge, latestState.age)) {
    throw new Error('The supplied as-of age does not match the observed cutoff record.');
  }
  if (hasObservedCutoffRow && integer(asOfExperience) && integer(latestState.experience)
    && asOfExperience !== latestState.experience) {
    throw new Error('The supplied as-of experience does not match the observed cutoff record.');
  }
  const age = finite(asOfAge) ? asOfAge : finite(state.age) ? state.age : latestState.age;
  const experience = integer(asOfExperience) ? asOfExperience
    : integer(state.experience) ? state.experience : latestState.experience;
  const ageSource = finite(asOfAge) ? 'explicit-input'
    : finite(state.age) ? text(state.ageSource) || 'explicit-as-of-state' : latestState.ageSource;
  const experienceSource = integer(asOfExperience) ? 'explicit-input'
    : integer(state.experience) ? text(state.experienceSource) || 'explicit-as-of-state' : latestState.experienceSource;
  const stage = asOfStage ? validateStage(asOfStage)
    : text(state.stage) ? validateStage(state.stage) : stageForExperience(experience);
  if (!stage) throw new Error('Career simulation needs an explicit career stage or sourced experience.');
  if (!finite(age) || age < 12 || age > 60) throw new Error('Career simulation needs a sourced as-of age from 12 through 60.');
  if (!integer(experience) || experience < 0 || experience > 40) throw new Error('Career simulation needs a sourced as-of experience from 0 through 40.');
  if (stage === 'custom' && (!finite(age) || !integer(experience))) {
    throw new Error('Custom career stages require explicit age and experience.');
  }
  if (stage !== 'prospect' && stageForExperience(experience) !== stage && stage !== 'custom') {
    throw new Error('The selected career stage does not match the sourced experience.');
  }
  if (stage === 'prospect' && experience !== 0) {
    throw new Error('The prospect stage requires zero NBA experience; use the sourced career stage for an observed NBA season.');
  }
  const metrics = Object.fromEntries(CAREER_METRICS.map(key => [
    key,
    owns(state.metrics, key) && (!hasObservedCutoffRow || state.metrics[key] !== null)
      ? (state.metrics[key] === null ? null : Math.max(0, Number(state.metrics[key])))
      : latestState.metrics[key],
  ]));
  const minutes = owns(state, 'minutesPerGame') && (!hasObservedCutoffRow || state.minutesPerGame !== null)
    ? state.minutesPerGame : latestState.minutesPerGame;
  const games = owns(state, 'games') && (!hasObservedCutoffRow || state.games !== null)
    ? state.games : latestState.games;
  const resolved = {
    frozen: true,
    sourceSeasonStartYear: cutoff,
    age: round(age),
    ageSource,
    experience,
    experienceSource,
    stage,
    positions: Array.isArray(state.positions) ? [...state.positions].sort() : latestState.positions,
    minutesPerGame: finite(minutes) ? clamp(minutes, 0, CAREER_SIMULATION_POLICY.maxMinutesPerGame) : null,
    games: integer(games) ? clamp(games, 0, CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason) : null,
    metrics,
    evidenceSourceSeasonStartYear: latest?.seasonStartYear ?? null,
    stateJoin: text(state.stateJoin) || text(latestState.stateJoin) || 'observed',
    stateQuality: text(state.stateQuality) || text(latestState.stateQuality) || 'complete',
    stateConflict: Array.isArray(state.stateConflict) ? state.stateConflict.map(conflict => ({ ...conflict }))
      : Array.isArray(latestState.stateConflict) ? latestState.stateConflict.map(conflict => ({ ...conflict })) : [],
  };
  resolved.roleState = roleStateFor(resolved);
  return resolved;
}

function normalizeCareerPackageRef(packageRef) {
  if (!object(packageRef) || !text(packageRef.packageId) || !text(packageRef.packageVersion)) {
    throw new Error('Career Lab requires a verified published package reference.');
  }
  const scope = packageRef.scope;
  if (!object(scope) || !CAREER_PACKAGE_KINDS.has(scope.kind) || !Array.isArray(scope.seasonStartYears)
    || !scope.seasonStartYears.length || scope.seasonStartYears.some(year => !integer(year, 1947, 2200))
    || new Set(scope.seasonStartYears).size !== scope.seasonStartYears.length) {
    throw new Error('Career Lab package scope is unavailable or malformed.');
  }
  const years = [...scope.seasonStartYears].sort((left, right) => left - right);
  if (years.some((year, index) => index > 0 && year <= years[index - 1])) {
    throw new Error('Career Lab package seasons must be ordered and unique.');
  }
  if (!Array.isArray(scope.phases) || !scope.phases.length || scope.phases.some(phase => !CAREER_PHASES.has(phase))) {
    throw new Error('Career Lab package phases are unavailable or malformed.');
  }
  return { ...packageRef, scope: { ...scope, seasonStartYears: years, phases: [...scope.phases] } };
}

function publicCareerScope(scope) {
  return {
    kind: scope.kind,
    seasonStartYears: [...scope.seasonStartYears],
    phases: [...scope.phases],
  };
}

/**
 * Validate the public Career Lab scope before any player-season rows are
 * grouped. Pooled history is opt-in and never satisfies an exact selection.
 */
export function validatePublicCareerSelection(packageRef, selection = {}) {
  const normalizedPackage = normalizeCareerPackageRef(packageRef);
  if (!object(selection) || !Array.isArray(selection.seasonStartYears) || !selection.seasonStartYears.length) {
    throw new Error('Career Lab needs an explicit package season selection.');
  }
  const years = selection.seasonStartYears.map(Number);
  if (years.some(year => !integer(year, 1947, 2200)) || new Set(years).size !== years.length) {
    throw new Error('Career Lab package seasons must be distinct whole years.');
  }
  const orderedYears = [...years].sort((left, right) => left - right);
  if (orderedYears.some(year => !normalizedPackage.scope.seasonStartYears.includes(year))) {
    throw new Error('Career Lab package season selection escapes its published scope.');
  }
  if (normalizedPackage.scope.kind === 'exact-season' && (orderedYears.length !== 1 || orderedYears[0] !== normalizedPackage.scope.seasonStartYears[0])) {
    throw new Error('An exact Career Lab package requires its one published season explicitly.');
  }
  if (normalizedPackage.scope.kind === 'pooled-window' && selection.acceptedPooledPackage !== true) {
    throw new Error('Cross-season Career Lab work requires explicit acceptance of the pooled package.');
  }
  const phase = text(selection.phase);
  if (!phase || !normalizedPackage.scope.phases.includes(phase)) {
    throw new Error('Career Lab needs an explicit phase inside the package scope.');
  }
  const cutoff = Number(selection.asOfSeasonStartYear);
  if (!integer(cutoff, 1947, 2200) || !orderedYears.includes(cutoff)) {
    throw new Error('Career Lab needs an explicit as-of season from the selected package years.');
  }
  const teamCodes = selection.teamCodes === undefined || selection.teamCodes === null ? null
    : (Array.isArray(selection.teamCodes) ? selection.teamCodes : [selection.teamCodes]);
  if (teamCodes?.some(team => !/^[A-Z]{3}$/.test(String(team).trim().toUpperCase()))) {
    throw new Error('Career Lab team selection contains an invalid team code.');
  }
  const normalizedAge = selection.asOfAge === undefined || selection.asOfAge === null || selection.asOfAge === '' ? null : Number(selection.asOfAge);
  const normalizedExperience = selection.asOfExperience === undefined || selection.asOfExperience === null || selection.asOfExperience === '' ? null : Number(selection.asOfExperience);
  if (normalizedAge !== null && (!finite(normalizedAge) || normalizedAge < 12 || normalizedAge > 60)) {
    throw new Error('Career Lab as-of age must be between 12 and 60.');
  }
  if (normalizedExperience !== null && (!integer(normalizedExperience) || normalizedExperience < 0 || normalizedExperience > 40)) {
    throw new Error('Career Lab as-of experience must be a whole number from 0 through 40.');
  }
  const asOfStage = selection.asOfStage === undefined || selection.asOfStage === null || selection.asOfStage === ''
    ? null : validateStage(selection.asOfStage);
  return Object.freeze({ packageRef: normalizedPackage, seasonStartYears: Object.freeze(orderedYears), phase,
    teamCodes: teamCodes ? Object.freeze([...new Set(teamCodes.map(team => String(team).trim().toUpperCase()))]) : null,
    asOfSeasonStartYear: cutoff, asOfAge: normalizedAge, asOfExperience: normalizedExperience, asOfStage,
    acceptedPooledPackage: normalizedPackage.scope.kind === 'pooled-window' });
}

function careerPartRecords(part, packageRef) {
  const records = Array.isArray(part) ? part : part?.records;
  if (!Array.isArray(records) || records.length > CAREER_RECIPE_LIMITS.maxRows) {
    throw new Error('The published Career Lab player-season part is unavailable or too large.');
  }
  if (object(part)) {
    for (const key of ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256', 'modelId', 'normalizer', 'metricsVersion']) {
      if (part[key] !== undefined && part[key] !== packageRef[key]) throw new Error(`The Career Lab part does not match its ${key} pin.`);
    }
    if (part.scope !== undefined && stableJson(part.scope) !== stableJson(packageRef.scope)) {
      throw new Error('The Career Lab part scope does not match the selected package.');
    }
  }
  return records;
}

function publicCareerMetric(row, key) {
  const metric = row?.metrics?.[`${key}PerGame`];
  return metric?.status === 'available' && metric.unit === 'per-game' && finite(metric.value) && metric.value >= 0
    ? metric.value : null;
}

function publicCareerProfile(row, packageRef, selection, stateIndex = null, nameIdentityConflicts = null) {
  const playerRef = text(row?.playerRef), displayName = text(row?.displayName), team = text(row?.teamCode)?.toUpperCase();
  if (!playerRef || !displayName || !team || !/^[A-Z]{3}$/.test(team)
    || !integer(row?.seasonStartYear, 1947, 2200) || !selection.seasonStartYears.includes(row.seasonStartYear)
    || row.phase !== selection.phase || !integer(row?.games, 0, 300)
    || (selection.teamCodes && !selection.teamCodes.includes(team))
    || row.observed !== true || !finite(row?.minutes) || row.minutes < 0) return null;
  const positions = Array.isArray(row.positions) ? [...new Set(row.positions.map(value => text(value, 20)).filter(Boolean))] : [];
  const stateIdentityConflict = stateIndex ? nameIdentityConflicts?.get(normalizeCareerStateName(displayName)) || null : null;
  const stateIdentityAmbiguous = Boolean(stateIdentityConflict);
  const state = careerStateForPlayerSeason(stateIndex, {
    player: displayName,
    seasonStartYear: row.seasonStartYear,
    nameIdentityConflicts,
  });
  const packageAge = normalizeCareerAgeEvidence(row.age);
  const age = packageAge === null ? state?.age ?? null : packageAge;
  const experience = row.experience === null || row.experience === undefined ? state?.experience ?? null : Number(row.experience);
  const stateConflicts = [];
  if (packageAge !== null && state?.age !== null && state?.age !== undefined
    && finite(packageAge) && !sameNullableNumber(packageAge, state.age)) {
    stateConflicts.push({ field: 'age', rowValue: packageAge, indexValue: state.age, indexSource: state.ageSource });
  }
  if (row.experience !== null && row.experience !== undefined && state?.experience !== null && state?.experience !== undefined
    && integer(Number(row.experience)) && Number(row.experience) !== state.experience) {
    stateConflicts.push({ field: 'experience', rowValue: Number(row.experience), indexValue: state.experience, indexSource: state.experienceSource });
  }
  const hasAge = finite(age) && age >= 12 && age <= 60;
  const hasExperience = integer(experience) && experience >= 0 && experience <= 40;
  const stateJoin = stateIdentityAmbiguous ? 'ambiguous-player-name'
    : state ? stateConflicts.length ? 'conflict' : (hasAge && hasExperience) ? 'exact-verified' : 'exact-augmented'
    : hasAge || hasExperience ? 'package-observed' : 'unmatched-player-season';
  const stateQuality = stateConflicts.length ? 'conflict' : hasAge && hasExperience ? (state ? 'sourced-complete' : 'complete')
    : hasAge || hasExperience ? 'partial' : 'missing';
  return { seasonStartYear: row.seasonStartYear, phase: row.phase, team, scope: 'team', games: row.games,
    minutes: round(row.minutes), positions, age: hasAge ? round(age) : null,
    experience: hasExperience ? experience : null,
    ageSource: packageAge === null ? state?.ageSource || null : 'package-observed',
    experienceSource: row.experience === null || row.experience === undefined ? state?.experienceSource || null : 'package-observed',
    stateSource: state?.source || (hasAge || hasExperience ? 'package-observed' : null),
    stateJoin, stateQuality,
    stateIdentityConflict,
    stateConflict: stateConflicts.length ? stateConflicts : null,
    perGame: Object.fromEntries(CAREER_METRICS.map(key => [key, publicCareerMetric(row, key)])),
    censoring: 'unknown', retired: false };
}

/**
 * Adapt a verified public player-seasons part into Career Simulator histories.
 * Missing age/experience is returned as an explicit input requirement; it is
 * never inferred from the season year or from the player's observed rows.
 */
export function adaptPublishedCareerHistories({ proof, part, records, selection, targetPlayerRef, stateIndex = null } = {}) {
  if (!object(proof) || proof.package?.status !== 'published') throw new Error('Career Lab needs a verified published package proof.');
  const selected = validatePublicCareerSelection(proof.package, selection);
  const packageRef = { ...proof.package, registryVersion: proof.registry?.registryVersion,
    registryRevisionSha256: proof.registry?.registryRevisionSha256, acceptedPooledPackage: selected.acceptedPooledPackage };
  const rows = careerPartRecords(part || records, packageRef);
  const nameIdentityConflicts = careerStateNameRefConflicts(rows);
  const targetRef = text(targetPlayerRef);
  if (!targetRef) throw new Error('Career Lab needs an explicit target player from the selected package.');
  const groups = new Map(), seen = new Set(), skipped = {};
  for (const row of rows) {
    const profile = publicCareerProfile(row, packageRef, selected, stateIndex, nameIdentityConflicts);
    const inSelection = row?.observed === true && selected.seasonStartYears.includes(Number(row?.seasonStartYear)) && row?.phase === selected.phase
      && (!selected.teamCodes || selected.teamCodes.includes(String(row?.teamCode || '').trim().toUpperCase()));
    if (!profile) {
      if (inSelection) skipped.invalid = (skipped.invalid || 0) + 1;
      continue;
    }
    const key = `${row.playerRef}|${profile.seasonStartYear}|${profile.phase}|${profile.team}`;
    if (seen.has(key)) throw new Error('The Career Lab part contains duplicate player-season team rows.');
    seen.add(key);
    const existing = groups.get(row.playerRef) || { acceptedCareerHistory: true, playerId: row.playerRef, player: row.displayName, censoring: 'unknown', profiles: [] };
    existing.profiles.push(profile);
    groups.set(row.playerRef, existing);
  }
  const histories = [...groups.values()].filter(history => history.profiles.length).sort((left, right) => left.playerId.localeCompare(right.playerId));
  const targetHistory = histories.find(history => history.playerId === targetRef) || null;
  if (!targetHistory) throw new Error('The selected target player has no observed rows in the requested package scope.');
  const timeline = buildCareerTimeline(targetHistory.profiles, {
    seasonStartYears: selected.seasonStartYears,
    asOfSeasonStartYear: selected.asOfSeasonStartYear,
    stateIndex,
    player: targetHistory.player,
  });
  const latest = timeline.rows.filter(row => row.status === 'observed').at(-1) || null;
  const inputRequirements = [];
  if (selected.asOfAge === null && !finite(latest?.age)) inputRequirements.push('asOfAge');
  if (selected.asOfExperience === null && !integer(latest?.experience)) inputRequirements.push('asOfExperience');
  const targetState = inputRequirements.length ? null : resolveAsOfState(timeline, {
    asOfSeasonStartYear: selected.asOfSeasonStartYear, asOfStage: selected.asOfStage,
    asOfAge: selected.asOfAge, asOfExperience: selected.asOfExperience,
  });
  return Object.freeze({ status: inputRequirements.length ? 'needs-input' : 'ready', packageRef, selection: selected,
    targetPlayer: { player: targetHistory.player, selected: true }, targetHistory, histories: Object.freeze(histories), timeline,
    targetState, inputRequirements: Object.freeze(inputRequirements), skipped: Object.freeze(skipped),
    coverage: Object.freeze({ inputRows: rows.length, selectedRows: seen.size, histories: histories.length, skippedByReason: skipped }),
    privacy: Object.freeze({ version: 'swishiq-public-career-privacy-v1', nativeJoinHandles: 'internal-only' }),
  });
}

function publicCareerPackageRef(packageRef) {
  if (!object(packageRef)) return null;
  const allowed = ['format', 'packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
    'sourceManifestSetSha256', 'projectionContentSha256', 'registryVersion', 'registryRevisionSha256',
    'projectionIndexPath', 'modelId', 'normalizer', 'metricsVersion', 'acceptedPooledPackage', 'scope'];
  const result = {};
  for (const key of allowed) if (packageRef[key] !== undefined) result[key] = packageRef[key];
  if (object(result.scope)) result.scope = {
    kind: result.scope.kind,
    seasonStartYears: Array.isArray(result.scope.seasonStartYears) ? [...result.scope.seasonStartYears] : [],
    phases: Array.isArray(result.scope.phases) ? [...result.scope.phases] : [],
  };
  return result;
}

function publicCareerSelection(selection) {
  if (!object(selection)) return null;
  return {
    seasonStartYears: Array.isArray(selection.seasonStartYears) ? [...selection.seasonStartYears] : [],
    phase: selection.phase || null,
    teamCodes: Array.isArray(selection.teamCodes) ? [...selection.teamCodes] : null,
    asOfSeasonStartYear: selection.asOfSeasonStartYear ?? null,
    asOfAge: selection.asOfAge ?? null,
    asOfExperience: selection.asOfExperience ?? null,
    asOfStage: selection.asOfStage || null,
    acceptedPooledPackage: selection.acceptedPooledPackage === true,
  };
}

function stripCareerJoinHandles(value) {
  if (Array.isArray(value)) return value.map(stripCareerJoinHandles);
  if (!object(value)) return value;
  const blocked = /^(?:player(?:id|ref|seasonref)|targetplayer(?:id|ref)|profilekey|canonicalid|provider(?:id|ref)?|nativeprovenance)$/i;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blocked.test(key))
    .map(([key, entry]) => [key, stripCareerJoinHandles(entry)]));
}

function publicMetricMap(value) {
  return Object.fromEntries(CAREER_METRICS.map(key => [
    key, finite(value?.[key]) && value[key] >= 0 ? round(value[key]) : null,
  ]));
}

function publicCareerState(state) {
  if (!object(state)) return null;
  return stripCareerJoinHandles({
    frozen: state.frozen === true,
    sourceSeasonStartYear: integer(state.sourceSeasonStartYear) ? state.sourceSeasonStartYear : null,
    evidenceSourceSeasonStartYear: integer(state.evidenceSourceSeasonStartYear) ? state.evidenceSourceSeasonStartYear : null,
    age: finite(state.age) ? round(state.age) : null,
    ageSource: text(state.ageSource) || null,
    experience: integer(state.experience) ? state.experience : null,
    experienceSource: text(state.experienceSource) || null,
    stateJoin: text(state.stateJoin) || null,
    stateQuality: text(state.stateQuality) || null,
    stateConflict: Array.isArray(state.stateConflict) ? state.stateConflict.map(conflict => ({
      field: text(conflict?.field) || null,
      rowValue: finite(conflict?.rowValue) ? round(conflict.rowValue) : null,
      indexValue: finite(conflict?.indexValue) ? round(conflict.indexValue) : null,
      indexSource: text(conflict?.indexSource) || null,
    })) : [],
    stage: state.stage || null,
    positions: Array.isArray(state.positions) ? [...state.positions] : [],
    minutesPerGame: finite(state.minutesPerGame) ? round(state.minutesPerGame) : null,
    games: integer(state.games) ? state.games : null,
    roleState: CAREER_ROLE_STATES.includes(state.roleState) ? state.roleState : null,
    metrics: publicMetricMap(state.metrics),
  });
}

function publicCareerStateHasEvidence(state) {
  return object(state) && Object.keys(state).length > 0;
}

function validateCareerStateForCutoff(state, cutoff, label, { exactSourceSeason = true } = {}) {
  if (!publicCareerStateHasEvidence(state)) return;
  const sourceSeasonStartYear = Number(state.sourceSeasonStartYear);
  if (state.frozen !== true || !integer(sourceSeasonStartYear, 1947, cutoff)
    || (exactSourceSeason && sourceSeasonStartYear !== cutoff)) {
    throw new Error(`${label} must be frozen at the selected as-of season.`);
  }
  if (state.evidenceSourceSeasonStartYear !== null && state.evidenceSourceSeasonStartYear !== undefined) {
    const evidenceSeasonStartYear = Number(state.evidenceSourceSeasonStartYear);
    if (!integer(evidenceSeasonStartYear, 1947, cutoff)) {
      throw new Error(`${label} contains evidence after the selected as-of season.`);
    }
  }
}

function publicCareerRow(row) {
  if (!object(row)) return null;
  const safe = {
    seasonStartYear: integer(row.seasonStartYear) ? row.seasonStartYear : null,
    season: text(row.season) || (integer(row.seasonStartYear) ? seasonLabel(row.seasonStartYear) : null),
    status: ['observed', 'gap', 'simulated', 'retired', 'unavailable'].includes(row.status) ? row.status : 'unknown',
    source: text(row.source) || null,
    gap: row.gap === true,
    games: integer(row.games) ? row.games : null,
    minutes: finite(row.minutes) ? round(row.minutes) : null,
    teams: Array.isArray(row.teams) ? row.teams.map(value => text(value)).filter(Boolean) : [],
    team: text(row.team) || null,
    phases: Array.isArray(row.phases) ? row.phases.map(value => text(value)).filter(Boolean) : [],
    phase: text(row.phase) || null,
    positions: Array.isArray(row.positions) ? row.positions.map(value => text(value)).filter(Boolean) : [],
    age: finite(normalizeCareerAgeEvidence(row.age)) ? round(normalizeCareerAgeEvidence(row.age)) : null,
    ageSource: text(row.ageSource) || null,
    experience: integer(row.experience) ? row.experience : null,
    experienceSource: text(row.experienceSource) || null,
    stateSource: text(row.stateSource) || null,
    stateJoin: text(row.stateJoin) || null,
    stateQuality: text(row.stateQuality) || null,
    stateConflict: Array.isArray(row.stateConflict) ? row.stateConflict.map(conflict => ({
      field: text(conflict?.field) || null,
      rowValue: finite(conflict?.rowValue) ? round(conflict.rowValue) : null,
      indexValue: finite(conflict?.indexValue) ? round(conflict.indexValue) : null,
      indexSource: text(conflict?.indexSource) || null,
    })) : [],
    stage: text(row.stage) || null,
    perGame: publicMetricMap(row.perGame),
    metrics: publicMetricMap(row.metrics),
    productionRatesPer36: publicMetricMap(row.productionRatesPer36),
    totals: publicMetricMap(row.totals),
    minutesPerGame: finite(row.minutesPerGame) ? round(row.minutesPerGame) : null,
    teamContext: text(row.teamContext) || null,
    role: text(row.role) || null,
    roleState: CAREER_ROLE_STATES.includes(row.roleState) ? row.roleState : null,
    opportunityStatus: ['modeled-opportunity', 'no-modeled-opportunity', 'retired'].includes(row.opportunityStatus)
      ? row.opportunityStatus : null,
    transitionComponentSources: object(row.transitionComponentSources)
      ? Object.fromEntries(CAREER_METRICS.map(key => [key,
        ['selected-rate-transition', 'conditional-rate-pool', 'selected-metric-transition',
          'conditional-metric-pool', 'carry-forward-no-support', 'unavailable-no-current-value'].includes(row.transitionComponentSources[key])
          ? row.transitionComponentSources[key] : null])) : {},
    continuationProbability: finite(row.continuationProbability) && row.continuationProbability >= 0 && row.continuationProbability <= 1
      ? round(row.continuationProbability) : null,
    censoring: normalizeCensoring(row.censoring, row.retired === true),
    retired: row.retired === true,
    retirementTreatment: text(row.retirementTreatment) || null,
    caveat: text(row.caveat) || null,
  };
  return stripCareerJoinHandles(safe);
}

function publicSurvivalRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(object).map(row => ({
    seasonStartYear: integer(row.seasonStartYear) ? row.seasonStartYear : null,
    season: text(row.season) || (integer(row.seasonStartYear) ? seasonLabel(row.seasonStartYear) : null),
    availableRuns: integer(row.availableRuns, 0) ? row.availableRuns : null,
    totalRuns: integer(row.totalRuns, 0) ? row.totalRuns : null,
    continuationRate: finite(row.continuationRate) && row.continuationRate >= 0 && row.continuationRate <= 1
      ? round(row.continuationRate) : null,
    status: ['modeled', 'descriptive-availability'].includes(row.status) ? row.status : 'unavailable',
    note: text(row.note) || null,
  }));
}

function publicCareerRows(rows, asOfSeasonStartYear = null) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => asOfSeasonStartYear === null
    || (integer(Number(row?.seasonStartYear), 1947, 2200) && Number(row.seasonStartYear) <= asOfSeasonStartYear))
    .map(publicCareerRow).filter(Boolean);
}

function publicCareerTimeline(timeline, asOfSeasonStartYear = null) {
  if (!object(timeline)) return null;
  const sourceYears = [
    ...(Array.isArray(timeline.seasonStartYears) ? timeline.seasonStartYears : []),
    ...(Array.isArray(timeline.rows) ? timeline.rows.map(row => row?.seasonStartYear) : []),
    ...(Array.isArray(timeline.observedRows) ? timeline.observedRows.map(row => row?.seasonStartYear) : []),
    ...(Array.isArray(timeline.gapRows) ? timeline.gapRows.map(row => row?.seasonStartYear) : []),
  ];
  const excludedFutureYears = new Set(sourceYears.filter(year => integer(Number(year), 1947, 2200)
    && asOfSeasonStartYear !== null && Number(year) > asOfSeasonStartYear));
  const existingFutureRowsExcluded = integer(timeline.asOf?.futureRowsExcluded, 0) ? timeline.asOf.futureRowsExcluded : 0;
  return stripCareerJoinHandles({
    version: text(timeline.version) || CAREER_SIMULATION_POLICY.timelineIntegrity,
    seasonStartYears: Array.isArray(timeline.seasonStartYears)
      ? timeline.seasonStartYears.filter(year => asOfSeasonStartYear === null
        || (integer(Number(year), 1947, 2200) && Number(year) <= asOfSeasonStartYear)) : [],
    rows: publicCareerRows(timeline.rows, asOfSeasonStartYear),
    observedRows: publicCareerRows(Array.isArray(timeline.observedRows)
      ? timeline.observedRows.map(row => ({ ...row, status: row?.status || 'observed' })) : [], asOfSeasonStartYear),
    gapRows: publicCareerRows(Array.isArray(timeline.gapRows)
      ? timeline.gapRows.map(row => ({ ...row, status: row?.status || 'gap' })) : [], asOfSeasonStartYear),
    asOf: object(timeline.asOf) || asOfSeasonStartYear !== null ? {
      frozen: asOfSeasonStartYear !== null ? true : timeline.asOf.frozen === true,
      seasonStartYear: asOfSeasonStartYear !== null ? asOfSeasonStartYear
        : integer(timeline.asOf.seasonStartYear) ? timeline.asOf.seasonStartYear : null,
      futureRowsExcluded: asOfSeasonStartYear !== null
        ? Math.max(existingFutureRowsExcluded, excludedFutureYears.size) : existingFutureRowsExcluded,
      note: text(timeline.asOf?.note) || (asOfSeasonStartYear !== null
        ? 'Rows after the selected as-of season were excluded from this public timeline.' : null),
    } : null,
    note: text(timeline.note) || null,
  });
}

function publicCareerHistory(history, asOfSeasonStartYear = null, timelineHasUnboundedOrFutureEvidence = false) {
  if (!object(history)) return null;
  const sourceProfiles = Array.isArray(history.profiles) ? history.profiles : [];
  const profiles = publicCareerRows(sourceProfiles.map(row => ({ ...row, status: row?.status || 'observed' })), asOfSeasonStartYear);
  const boundedProfiles = sourceProfiles.filter(row => integer(Number(row?.seasonStartYear), 1947, asOfSeasonStartYear)
    && Number(row.seasonStartYear) <= asOfSeasonStartYear)
    .map(row => ({ ...row, status: row?.status || 'observed' }));
  const hasUnboundedOrFutureProfiles = timelineHasUnboundedOrFutureEvidence
    || sourceProfiles.some(row => !integer(Number(row?.seasonStartYear), 1947, 2200)
      || Number(row.seasonStartYear) > asOfSeasonStartYear);
  const boundedHistoryCensoring = censoringFor({
    retirementSeasonStartYear: history.retirementSeasonStartYear,
    censoring: history.censoring === 'archive-edge' && !hasUnboundedOrFutureProfiles && boundedProfiles.length
      ? 'archive-edge' : 'unknown',
  }, { rows: boundedProfiles }, asOfSeasonStartYear);
  return stripCareerJoinHandles({
    player: text(history.player) || null,
    acceptedCareerHistory: history.acceptedCareerHistory === true,
    censoring: boundedHistoryCensoring,
    profiles,
  });
}

function careerCensoringCounts(comparables = []) {
  return Object.fromEntries([...CENSORING_VALUES].map(value => [value,
    comparables.filter(comparable => comparable.censoring === value).length]));
}

function careerEvidenceBeyondCutoff(value, asOfSeasonStartYear) {
  if (asOfSeasonStartYear === null || value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(entry => careerEvidenceBeyondCutoff(entry, asOfSeasonStartYear));
  if (!object(value)) return false;
  return Object.entries(value).some(([key, entry]) => {
    if (/^(?:seasonStartYear|sourceSeasonStartYear|evidenceSourceSeasonStartYear|retirementSeasonStartYear|asOfSeasonStartYear|fromSeasonStartYear|toSeasonStartYear)$/i.test(key)) {
      const year = Number(entry);
      if (integer(year, 1947, 2200) && year > asOfSeasonStartYear) return true;
    }
    return careerEvidenceBeyondCutoff(entry, asOfSeasonStartYear);
  });
}

function publicCareerTransitionRows(rows, asOfSeasonStartYear) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => object(row)
    && !careerEvidenceBeyondCutoff(row, asOfSeasonStartYear)
    && integer(Number(row.fromSeasonStartYear), 1947, 2200)
    && integer(Number(row.toSeasonStartYear), 1947, 2200)
    && Number(row.fromSeasonStartYear) < Number(row.toSeasonStartYear)
    && (asOfSeasonStartYear === null || Number(row.fromSeasonStartYear) <= asOfSeasonStartYear
      && Number(row.toSeasonStartYear) <= asOfSeasonStartYear))
    .map(row => stripCareerJoinHandles(row));
}

function publicCareerComparableArcs(rows, asOfSeasonStartYear) {
  if (!Array.isArray(rows) || asOfSeasonStartYear === null) return [];
  const safeArcs = [];
  for (const arc of rows) {
    if (!object(arc)) continue;
    const anchorYear = Number(arc.asOfSeasonStartYear);
    if (!integer(anchorYear, 1947, asOfSeasonStartYear)
      || careerEvidenceBeyondCutoff(arc.asOf, asOfSeasonStartYear)) continue;
    const observedSource = Array.isArray(arc.observedRows) ? arc.observedRows : [];
    const gapSource = Array.isArray(arc.gapRows) ? arc.gapRows : [];
    const transitionSource = Array.isArray(arc.transitions) ? arc.transitions : [];
    const observedRows = publicCareerRows(observedSource.map(row => ({ ...row, status: row?.status || 'observed' })), asOfSeasonStartYear)
      .filter(row => row.status === 'observed')
      .sort((left, right) => left.seasonStartYear - right.seasonStartYear);
    const gapRows = publicCareerRows(arc.gapRows, asOfSeasonStartYear)
      .filter(row => row.status === 'gap')
      .sort((left, right) => left.seasonStartYear - right.seasonStartYear);
    const transitions = publicCareerTransitionRows(arc.transitions, asOfSeasonStartYear);
    const hasUnboundedOrFutureRows = [...observedSource, ...gapSource].some(row => !integer(Number(row?.seasonStartYear), 1947, 2200)
      || Number(row.seasonStartYear) > asOfSeasonStartYear)
      || transitionSource.some(row => careerEvidenceBeyondCutoff(row, asOfSeasonStartYear)
        || !integer(Number(row?.fromSeasonStartYear), 1947, 2200)
        || !integer(Number(row?.toSeasonStartYear), 1947, 2200));
    const censoring = censoringFor({
      retirementSeasonStartYear: integer(Number(arc.retirementSeasonStartYear), 1947, asOfSeasonStartYear)
        ? Number(arc.retirementSeasonStartYear) : null,
      censoring: arc.censoring === 'archive-edge' && !hasUnboundedOrFutureRows && observedRows.length
        ? 'archive-edge' : 'unknown',
    }, { rows: observedRows }, asOfSeasonStartYear);
    const safeArc = {
      player: text(arc.player) || null,
      asOfSeasonStartYear: anchorYear,
      anchorLagSeasons: asOfSeasonStartYear - anchorYear,
      asOf: object(arc.asOf) ? stripCareerJoinHandles(arc.asOf) : null,
      observedRows,
      gapRows,
      transitions,
      censoring,
      futureRowsExcluded: integer(arc.futureRowsExcluded, 0) ? arc.futureRowsExcluded : 0,
    };
    safeArcs.push(safeArc);
  }
  return safeArcs;
}

function publicCareerCohort(cohort, asOfSeasonStartYear, comparableArcs, hasComparableSource) {
  if (!object(cohort)) return null;
  if (asOfSeasonStartYear !== null && cohort.asOfSeasonStartYear !== null
    && cohort.asOfSeasonStartYear !== undefined) {
    const cohortCutoff = Number(cohort.asOfSeasonStartYear);
    if (!integer(cohortCutoff, 1947, 2200) || cohortCutoff !== asOfSeasonStartYear) {
      throw new Error('Career simulation receipt cohort and report cutoffs do not match.');
    }
  }
  if (asOfSeasonStartYear !== null && object(cohort.target?.state)) {
    validateCareerStateForCutoff(cohort.target.state, asOfSeasonStartYear, 'Career simulation cohort target state');
  }
  const directTransitions = publicCareerTransitionRows(cohort.transitions, asOfSeasonStartYear);
  const safeComparables = Array.isArray(comparableArcs) ? comparableArcs : [];
  const skipped = Array.isArray(cohort.skipped) ? cohort.skipped.filter(object).map(entry => {
    const safe = stripCareerJoinHandles(entry);
    if (Array.isArray(entry.excludedRows)) {
      safe.excludedRows = entry.excludedRows.filter(row => object(row)
        && integer(Number(row.seasonStartYear), 1947, 2200)
        && !careerEvidenceBeyondCutoff(row, asOfSeasonStartYear)
        && (asOfSeasonStartYear === null || Number(row.seasonStartYear) <= asOfSeasonStartYear))
        .map(row => ({
          seasonStartYear: Number(row.seasonStartYear),
          games: integer(row.games, 0) ? row.games : null,
        }));
    }
    return safe;
  }) : [];
  const transitionCount = Array.isArray(cohort.transitions)
    ? directTransitions.length
    : hasComparableSource ? safeComparables.reduce((sum, comparable) => sum + comparable.transitions.length, 0) : 0;
  const safeCohort = {
    status: text(cohort.status) || 'unavailable',
    comparables: hasComparableSource ? safeComparables.length : 0,
    transitions: transitionCount,
    skipped,
    censoring: careerCensoringCounts(safeComparables),
  };
  const advertisedComparables = Array.isArray(cohort.comparables) ? cohort.comparables.length
    : integer(cohort.comparables, 1) ? cohort.comparables : 0;
  const advertisedTransitions = Array.isArray(cohort.transitions) ? cohort.transitions.length
    : integer(cohort.transitions, 1) ? cohort.transitions : 0;
  if (safeCohort.status === 'ready' && (advertisedComparables > safeCohort.comparables
    || advertisedTransitions > safeCohort.transitions || advertisedComparables > 0 && !hasComparableSource)) {
    safeCohort.status = 'insufficient';
  }
  if (integer(Number(cohort.asOfSeasonStartYear), 1947, 2200) && asOfSeasonStartYear !== null) {
    safeCohort.asOfSeasonStartYear = asOfSeasonStartYear;
  }
  if (object(cohort.target)) {
    safeCohort.target = {
      state: object(cohort.target.state) ? publicCareerState(cohort.target.state) : null,
    };
  }
  if (Array.isArray(cohort.transitions)) safeCohort.transitionRows = directTransitions;
  return stripCareerJoinHandles(safeCohort);
}

function publicCareerSimulationPaths(paths, asOfSeasonStartYear) {
  if (!Array.isArray(paths)) return [];
  return paths.filter(object).map(path => {
    const seasons = Array.isArray(path.seasons) ? path.seasons.filter(row => {
      if (!object(row)) return false;
      const year = Number(row.seasonStartYear);
      const modeledFuture = row.source === 'model-estimate'
        && (row.status === 'simulated' || row.status === 'retired');
      if (modeledFuture) return asOfSeasonStartYear === null
        || integer(year, asOfSeasonStartYear + 1, 2200);
      return asOfSeasonStartYear !== null && integer(year, 1947, asOfSeasonStartYear);
    }).map(row => publicCareerRow(row)).filter(Boolean) : [];
    return { repeat: integer(path.repeat, 1) ? path.repeat : null, seasons };
  });
}

function publicCareerSimulationCensoring(censoring, observedRows, comparableArcs, asOfSeasonStartYear) {
  if (!object(censoring)) return null;
  if (asOfSeasonStartYear === null) {
    return stripCareerJoinHandles({
      target: 'unknown',
      cohort: careerCensoringCounts([]),
      note: text(censoring.note) || null,
    });
  }
  const boundedObservedRows = Array.isArray(observedRows) ? [...observedRows]
    .filter(row => row?.status === 'observed' && integer(Number(row.seasonStartYear), 1947, asOfSeasonStartYear))
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear) : [];
  return stripCareerJoinHandles({
    target: censoringFor({}, { rows: boundedObservedRows }, asOfSeasonStartYear),
    cohort: careerCensoringCounts(Array.isArray(comparableArcs) ? comparableArcs : []),
    note: text(censoring.note) || null,
  });
}

function publicCareerSimulationDiagnostics(diagnostics) {
  if (!object(diagnostics)) return null;
  const safe = stripCareerJoinHandles(diagnostics);
  // This summary is an undated aggregate of observed comparator transitions;
  // the public receipt keeps the bounded arcs instead of repeating a value
  // that cannot independently be clipped to the selected cutoff.
  delete safe.transitionPoolEvidence;
  return safe;
}

function careerHistoryHasObservedEvidence(adapter) {
  const timeline = adapter.timeline;
  const hasTimelineRows = [timeline?.rows, timeline?.observedRows, timeline?.gapRows, timeline?.seasonStartYears]
    .some(rows => Array.isArray(rows) && rows.length > 0);
  return object(adapter.targetHistory) || Array.isArray(adapter.histories) || hasTimelineRows
    || publicCareerStateHasEvidence(adapter.targetState);
}

function careerHistoryReceiptContext(adapter) {
  const hasSelection = object(adapter.selection);
  const selection = hasSelection ? validatePublicCareerSelection(adapter.packageRef, adapter.selection) : null;
  const selectionYear = selection?.asOfSeasonStartYear ?? null;
  const rawTimelineYear = adapter.timeline?.asOf?.seasonStartYear;
  const timelineYear = rawTimelineYear === null || rawTimelineYear === undefined ? null : Number(rawTimelineYear);
  if (timelineYear !== null && !integer(timelineYear, 1947, 2200)) {
    throw new Error('Career history receipt timeline cutoff is invalid.');
  }
  if (timelineYear !== null && selectionYear === null && adapter.timeline?.asOf?.frozen !== true) {
    throw new Error('Career history receipt needs a frozen timeline cutoff or a validated selection cutoff.');
  }
  if (selectionYear !== null && timelineYear !== null && selectionYear !== timelineYear) {
    throw new Error('Career history receipt selection and timeline cutoffs do not match.');
  }
  const asOfSeasonStartYear = selectionYear ?? timelineYear;
  if (careerHistoryHasObservedEvidence(adapter) && asOfSeasonStartYear === null) {
    throw new Error('Career history receipts need an explicit as-of season cutoff.');
  }
  if (asOfSeasonStartYear !== null) {
    validateCareerStateForCutoff(adapter.targetState, asOfSeasonStartYear, 'Career history target state');
  }
  return { asOfSeasonStartYear, selection };
}

function careerTimelineHasUnboundedOrFutureEvidence(timeline, asOfSeasonStartYear) {
  if (!object(timeline) || asOfSeasonStartYear === null) return false;
  if (integer(timeline.asOf?.futureRowsExcluded, 1)) return true;
  const sourceRows = [
    ...(Array.isArray(timeline.seasonStartYears) ? timeline.seasonStartYears : []),
    ...(Array.isArray(timeline.rows) ? timeline.rows : []),
    ...(Array.isArray(timeline.observedRows) ? timeline.observedRows : []),
    ...(Array.isArray(timeline.gapRows) ? timeline.gapRows : []),
  ];
  return sourceRows.some(row => {
    const year = Number(object(row) ? row.seasonStartYear : row);
    return !integer(year, 1947, 2200) || year > asOfSeasonStartYear;
  });
}

/**
 * Convert the package-bound Career adapter into a browser receipt. Internal
 * player join handles are deliberately removed while observed rows, cutoff
 * state, censoring, and explicit missing inputs remain visible.
 */
export function buildPublicCareerHistoryReceipt(adapter) {
  if (!object(adapter)) return {
    version: CAREER_PUBLIC_RECEIPT_VERSION,
    status: 'unavailable',
    reason: 'Career package history is unavailable.',
  };
  const { asOfSeasonStartYear, selection } = careerHistoryReceiptContext(adapter);
  const timelineHasUnboundedOrFutureEvidence = careerTimelineHasUnboundedOrFutureEvidence(adapter.timeline, asOfSeasonStartYear);
  const receipt = {
    version: CAREER_PUBLIC_RECEIPT_VERSION,
    status: adapter.status || 'unavailable',
    package: publicCareerPackageRef(adapter.packageRef),
    selection: publicCareerSelection(selection || adapter.selection),
    targetPlayer: adapter.targetPlayer ? { player: text(adapter.targetPlayer.player) || null, selected: adapter.targetPlayer.selected === true } : null,
    targetHistory: publicCareerHistory(adapter.targetHistory, asOfSeasonStartYear, timelineHasUnboundedOrFutureEvidence),
    histories: Array.isArray(adapter.histories) ? adapter.histories.map(history => publicCareerHistory(history, asOfSeasonStartYear)).filter(Boolean) : [],
    timeline: publicCareerTimeline(adapter.timeline, asOfSeasonStartYear),
    targetState: publicCareerState(adapter.targetState),
    inputRequirements: Array.isArray(adapter.inputRequirements) ? [...adapter.inputRequirements] : [],
    skipped: stripCareerJoinHandles(adapter.skipped || {}),
    coverage: stripCareerJoinHandles(adapter.coverage || {}),
    privacy: { version: 'swishiq-public-career-privacy-v1', nativeJoinHandles: 'internal-only' },
    note: 'Source scope remains as published, including an accepted pooled window; player histories and the observed timeline stop at the selected as-of season. Missing age or experience stays an input requirement; it is never inferred from a season label.',
  };
  return Object.freeze(stripCareerJoinHandles(receipt));
}

/**
 * Convert a forward Career Simulator report into a public receipt. The
 * modeled future remains clearly labeled, while provider/native player keys
 * are removed from comparable arcs, paths, and diagnostics.
 */
export function buildPublicCareerSimulationReceipt(report, {
  packageRef = null,
  selection = null,
  includePaths = true,
} = {}) {
  if (!object(report)) return {
    version: CAREER_PUBLIC_RECEIPT_VERSION,
    status: 'unavailable',
    reason: 'Career simulation report is unavailable.',
  };
  const scope = publicCareerReceiptScope(packageRef, selection);
  const selectionCutoff = Number(scope.selection?.asOfSeasonStartYear);
  const reportCutoff = Number(report.asOf?.seasonStartYear ?? report.asOfSeasonStartYear);
  const hasSelectionCutoff = integer(selectionCutoff, 1947, 2200);
  const hasReportCutoff = integer(reportCutoff, 1947, 2200);
  if (hasSelectionCutoff && hasReportCutoff && selectionCutoff !== reportCutoff) {
    throw new Error('Career simulation receipt report and selection cutoffs do not match.');
  }
  const asOfSeasonStartYear = hasSelectionCutoff ? selectionCutoff : hasReportCutoff ? reportCutoff : null;
  if (asOfSeasonStartYear === null && careerSimulationReportCarriesObservedHistory(report)) {
    throw new Error('Career simulation receipts with observed history need an explicit as-of season cutoff.');
  }
  if (asOfSeasonStartYear !== null) {
    validateCareerStateForCutoff(report.targetState, asOfSeasonStartYear, 'Career simulation target state');
  }
  const rawComparableSource = Array.isArray(report.comparableArcs) ? report.comparableArcs
    : Array.isArray(report.cohort?.comparables) ? report.cohort.comparables : null;
  const comparableArcs = rawComparableSource && asOfSeasonStartYear !== null
    ? publicCareerComparableArcs(rawComparableSource, asOfSeasonStartYear) : [];
  const observedRows = Array.isArray(report.observedToDate) && asOfSeasonStartYear !== null
    ? report.observedToDate.filter(row => integer(Number(row?.seasonStartYear), 1947, asOfSeasonStartYear)
      && Number(row.seasonStartYear) <= asOfSeasonStartYear)
      .map(row => ({ ...row, status: row?.status || 'observed' })) : [];
  const cohort = publicCareerCohort(report.cohort, asOfSeasonStartYear, comparableArcs,
    rawComparableSource !== null);
  const receipt = {
    version: CAREER_PUBLIC_RECEIPT_VERSION,
    modelVersion: report.version || CAREER_SIMULATION_POLICY.version,
    status: report.status || 'unavailable',
    package: scope.packageRef,
    selection: scope.selection,
    reason: report.reason || null,
    missingCapabilities: Array.isArray(report.missingCapabilities) ? [...report.missingCapabilities] : [],
    seed: report.seed || null,
    repeats: report.repeats ?? null,
    horizon: report.horizon ?? null,
    completedRepeats: report.completedRepeats ?? null,
    asOf: stripCareerJoinHandles(report.asOf || null),
    observedToDate: publicCareerRows(observedRows, asOfSeasonStartYear),
    targetState: publicCareerState(report.targetState),
    progression: stripCareerJoinHandles(report.progression || null),
    progressionBySeason: Array.isArray(report.progressionBySeason) ? [...report.progressionBySeason] : null,
    workload: stripCareerJoinHandles(report.workload || null),
    availability: stripCareerJoinHandles(report.availability || null),
    teamContext: stripCareerJoinHandles(report.teamContext || null),
    paths: includePaths ? publicCareerSimulationPaths(report.paths, asOfSeasonStartYear) : [],
    trajectories: stripCareerJoinHandles(report.trajectories || {}),
    survival: publicSurvivalRows(report.survival),
    comparableArcs,
    cohort,
    censoring: publicCareerSimulationCensoring(report.censoring, observedRows, comparableArcs, asOfSeasonStartYear),
    retirement: stripCareerJoinHandles(report.retirement || null),
    milestoneReport: stripCareerJoinHandles(report.milestoneReport || null),
    sensitivity: stripCareerJoinHandles(report.sensitivity || []),
    diagnostics: publicCareerSimulationDiagnostics(report.diagnostics),
    assumptions: Array.isArray(report.assumptions) ? report.assumptions.map(value => text(value)).filter(Boolean) : [],
    note: report.note || 'Observed history and modeled future remain separate layers.',
  };
  return Object.freeze(stripCareerJoinHandles(receipt));
}

function careerRecipeBody(recipe) {
  if (!object(recipe)) throw new Error('Career simulation recipe must be an object.');
  const { recipeHash, ...body } = recipe;
  return body;
}

function careerRecipeHash(recipe) {
  return hashText(stableJson(careerRecipeBody(recipe)));
}

function publicRecipeSelection(selection) {
  const safe = publicCareerSelection(selection);
  return safe || {};
}

function normalizeCareerPlayerListTeamCode(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const teamCode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{3}$/.test(teamCode)) {
    throw new Error('Career simulation player-list team must be a three-letter team code.');
  }
  return teamCode;
}

function publicCareerReceiptScope(packageRef, selection) {
  if (!packageRef && !selection) return { packageRef: null, selection: null };
  if (!packageRef) throw new Error('A public career receipt selection requires a package reference.');
  const normalizedPackage = normalizeCareerPackageRef(packageRef);
  const selected = selection ? validatePublicCareerSelection(normalizedPackage, selection) : null;
  return { packageRef: publicCareerPackageRef(normalizedPackage), selection: publicCareerSelection(selected) };
}

function careerSimulationReportCarriesObservedHistory(report) {
  const hasRows = rows => Array.isArray(rows) && rows.length > 0;
  const comparables = Array.isArray(report.cohort?.comparables) ? report.cohort.comparables : [];
  const observedPathRows = Array.isArray(report.paths) && report.paths.some(path =>
    hasRows(path?.observedRows) || hasRows(path?.observedToDate)
    || (Array.isArray(path?.seasons) && path.seasons.some(row => row?.status !== 'simulated'
      && !(row?.status === 'retired' && row?.source === 'model-estimate'))));
  const hasObservedTransitions = rows => hasRows(rows) || integer(rows, 1);
  const hasPositiveNumericEvidence = value => {
    if (finite(value)) return value > 0;
    if (Array.isArray(value)) return value.some(hasPositiveNumericEvidence);
    if (object(value)) return Object.values(value).some(hasPositiveNumericEvidence);
    return false;
  };
  const hasObservedCohortCounts = cohort => object(cohort) && (
    integer(cohort.comparables, 1) || integer(cohort.transitions, 1)
    || hasRows(cohort.comparables) || hasRows(cohort.transitions)
    || (Array.isArray(cohort.skipped) && cohort.skipped.some(entry => hasRows(entry?.excludedRows)))
  );
  const hasCensoringEvidence = censoring => object(censoring) && (
    ['observed-retirement', 'archive-edge'].includes(censoring.target)
    || (object(censoring.cohort) && [...CENSORING_VALUES].some(value => integer(censoring.cohort[value], 1)))
    || hasPositiveNumericEvidence(censoring)
  );
  const diagnosticEvidence = report.diagnostics?.transitionPoolEvidence;
  return hasRows(report.observedToDate)
    || hasRows(report.comparableArcs)
    || integer(report.comparableArcs, 1)
    || integer(report.comparables, 1)
    || integer(report.transitions, 1)
    || hasObservedCohortCounts(report.cohort)
    || comparables.some(comparable => hasRows(comparable?.observedRows)
      || hasObservedTransitions(comparable?.transitions))
    || (object(report.targetState) && Object.keys(report.targetState).length > 0)
    || publicCareerStateHasEvidence(report.cohort?.target?.state)
    || hasCensoringEvidence(report.censoring)
    || hasCensoringEvidence(report.cohort?.censoring)
    || hasPositiveNumericEvidence(diagnosticEvidence)
    || observedPathRows;
}

function normalizeRecipeCalibration(calibration) {
  const normalized = normalizeCalibration(calibration);
  return normalized.status === 'calibrated'
    ? normalized
    : { status: 'uncalibrated', version: null };
}

/**
 * Build a bounded, package-pinned Career Simulator recipe. Records are not
 * copied into the recipe; replay resolves the target against the same verified
 * package and explicit selection.
 */
export function buildCareerSimulationRecipe(input = {}) {
  if (!object(input)) throw new Error('Career simulation recipe input must be an object.');
  const normalizedPackage = normalizeCareerPackageRef(input.packageRef);
  const selected = validatePublicCareerSelection(normalizedPackage, input.selection);
  const playerListTeamCode = Object.hasOwn(input, 'playerListTeamCode')
    ? normalizeCareerPlayerListTeamCode(input.playerListTeamCode) : undefined;
  const targetPlayerRef = text(input.targetPlayerRef);
  if (!targetPlayerRef) throw new Error('Career simulation recipes need an explicit target player reference.');
  const progression = progressionProfile(input.progression, input.customProgression);
  const workload = normalizeWorkload(input.workload, { minutesPerGame: null, games: null });
  const teamContext = normalizeTeamContext(input.teamContext);
  const availabilityModel = normalizeAvailabilityModel(input.availabilityModel);
  const retirementModel = normalizeRetirementModel(input.retirementModel);
  const milestones = normalizeMilestones(input.milestones);
  const milestoneCalibration = normalizeRecipeCalibration(input.milestoneCalibration);
  const horizon = requireIntegerRange(input.horizon ?? 5, 1, CAREER_SIMULATION_POLICY.maxHorizon, 'Simulation horizon');
  const progressionBySeason = normalizeProgressionBySeason(input.progressionBySeason, horizon);
  const plannedHorizon = input.plannedHorizon === undefined ? null
    : requireIntegerRange(input.plannedHorizon, horizon, CAREER_SIMULATION_POLICY.maxHorizon, 'Planned career horizon');
  const body = {
    kind: 'career-simulation-recipe',
    version: CAREER_SIMULATION_RECIPE_VERSION,
    modelVersion: CAREER_SIMULATION_POLICY.version,
    packageRef: publicCareerPackageRef(normalizedPackage),
    selection: publicRecipeSelection(selected),
    ...(playerListTeamCode === undefined ? {} : { playerListTeamCode }),
    targetPlayerRef,
    progression: progression.mode,
    ...(progressionBySeason ? { progressionBySeason } : {}),
    ...(plannedHorizon === null ? {} : { plannedHorizon }),
    customProgression: progression.mode === 'custom'
      ? { progression: progression.positive, regression: progression.negative, volatility: progression.volatility } : null,
    workload,
    teamContext,
    availabilityModel,
    retirementModel,
    horizon,
    repeats: requireIntegerRange(input.repeats ?? 100, CAREER_SIMULATION_POLICY.minRepeats, CAREER_SIMULATION_POLICY.maxRepeats, 'Simulation repeats'),
    seed: requireSeed(input.seed ?? 'career-simulation'),
    milestones,
    milestoneCalibration,
  };
  return Object.freeze({ ...body, recipeHash: careerRecipeHash(body) });
}

export function serializeCareerSimulationRecipe(recipe) {
  const serialized = stableJson(recipe);
  if (serialized.length > CAREER_RECIPE_LIMITS.maxBytes) throw new Error('Career simulation recipe exceeds the bounded save size.');
  return serialized;
}

function validateCareerRecipeContext(packageRef, contextPackageRef) {
  if (!contextPackageRef) return;
  const expected = normalizeCareerPackageRef(contextPackageRef);
  for (const key of ['packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256']) {
    if (expected[key] !== undefined && packageRef[key] !== expected[key]) {
      throw new Error(`Career simulation recipe does not match the supplied ${key} pin.`);
    }
  }
  if (expected.scope && stableJson(publicCareerScope(expected.scope)) !== stableJson(publicCareerScope(packageRef.scope))) {
    throw new Error('Career simulation recipe does not match the supplied package scope.');
  }
}

export function parseCareerSimulationRecipe(serialized, context = {}) {
  if (typeof serialized !== 'string' || serialized.length > CAREER_RECIPE_LIMITS.maxBytes) {
    throw new Error('Career simulation saved recipe is invalid or too large.');
  }
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new Error('Career simulation saved recipe is not valid JSON.'); }
  if (!object(parsed) || parsed.kind !== 'career-simulation-recipe' || parsed.version !== CAREER_SIMULATION_RECIPE_VERSION
    || !text(parsed.targetPlayerRef) || !text(parsed.seed)) {
    throw new Error('Career simulation saved recipe has an unsupported shape.');
  }
  if (parsed.recipeHash !== careerRecipeHash(parsed)) throw new Error('Career simulation saved recipe failed its integrity check.');
  const packageRef = normalizeCareerPackageRef(parsed.packageRef);
  validateCareerRecipeContext(packageRef, context.packageRef);
  const selected = validatePublicCareerSelection(packageRef, parsed.selection);
  const playerListTeamCode = Object.hasOwn(parsed, 'playerListTeamCode')
    ? normalizeCareerPlayerListTeamCode(parsed.playerListTeamCode) : undefined;
  const progression = progressionProfile(parsed.progression, parsed.customProgression);
  const workload = normalizeWorkload(parsed.workload, { minutesPerGame: null, games: null });
  const teamContext = parsed.teamContext?.applied && parsed.teamContext.model
    ? normalizeTeamContext({
      label: parsed.teamContext.label, role: parsed.teamContext.role,
      model: { status: 'validated', version: parsed.teamContext.model.version, heldOut: { passed: true },
        metricMultipliers: parsed.teamContext.model.metricMultipliers },
    })
    : normalizeTeamContext(parsed.teamContext);
  const availabilityModel = parsed.availabilityModel?.status === 'modeled'
    ? normalizeAvailabilityModel({ status: 'validated', version: parsed.availabilityModel.version, heldOut: { passed: true },
      gamesMultiplier: parsed.availabilityModel.gamesMultiplier,
      gamesStandardDeviation: parsed.availabilityModel.gamesStandardDeviation })
    : normalizeAvailabilityModel(null);
  const retirementModel = parsed.retirementModel?.status === 'modeled'
    ? normalizeRetirementModel({ status: 'validated', version: parsed.retirementModel.version, heldOut: { passed: true },
      annualProbability: parsed.retirementModel.annualProbability })
    : normalizeRetirementModel(null);
  const milestones = normalizeMilestones(parsed.milestones);
  const milestoneCalibration = parsed.milestoneCalibration?.status === 'calibrated'
    ? normalizeCalibration({ ...parsed.milestoneCalibration, scope: 'career-milestones' })
    : normalizeRecipeCalibration(null);
  const horizon = requireIntegerRange(parsed.horizon, 1, CAREER_SIMULATION_POLICY.maxHorizon, 'Simulation horizon');
  const progressionBySeason = normalizeProgressionBySeason(parsed.progressionBySeason, horizon);
  const plannedHorizon = parsed.plannedHorizon === undefined ? null
    : requireIntegerRange(parsed.plannedHorizon, horizon, CAREER_SIMULATION_POLICY.maxHorizon, 'Planned career horizon');
  const body = {
    kind: 'career-simulation-recipe',
    version: CAREER_SIMULATION_RECIPE_VERSION,
    modelVersion: CAREER_SIMULATION_POLICY.version,
    packageRef: publicCareerPackageRef(packageRef),
    selection: publicRecipeSelection(selected),
    ...(playerListTeamCode === undefined ? {} : { playerListTeamCode }),
    targetPlayerRef: parsed.targetPlayerRef,
    progression: progression.mode,
    ...(progressionBySeason ? { progressionBySeason } : {}),
    ...(plannedHorizon === null ? {} : { plannedHorizon }),
    customProgression: progression.mode === 'custom'
      ? { progression: progression.positive, regression: progression.negative, volatility: progression.volatility } : null,
    workload,
    teamContext,
    availabilityModel,
    retirementModel,
    horizon,
    repeats: requireIntegerRange(parsed.repeats, CAREER_SIMULATION_POLICY.minRepeats, CAREER_SIMULATION_POLICY.maxRepeats, 'Simulation repeats'),
    seed: requireSeed(parsed.seed),
    milestones,
    milestoneCalibration,
  };
  const recipe = Object.freeze({ ...body, recipeHash: careerRecipeHash(body) });
  if (recipe.recipeHash !== parsed.recipeHash) throw new Error('Career simulation saved recipe normalization changed its integrity hash.');
  return recipe;
}

export function saveCareerSimulationRecipe(storage, storageKey, recipe) {
  if (!storage || typeof storage.setItem !== 'function' || !text(storageKey)) {
    throw new Error('Career simulation storage is unavailable.');
  }
  const normalized = parseCareerSimulationRecipe(serializeCareerSimulationRecipe(recipe));
  const payload = { recipe: normalized, recipeHash: normalized.recipeHash };
  const serialized = stableJson(payload);
  if (serialized.length > CAREER_RECIPE_LIMITS.maxBytes) throw new Error('Career simulation saved recipe exceeds the bounded save size.');
  storage.setItem(storageKey, serialized);
  return Object.freeze({ status: 'saved', key: storageKey, recipeHash: normalized.recipeHash, bytes: serialized.length });
}

export function loadCareerSimulationRecipe(storage, storageKey, context = {}) {
  if (!storage || typeof storage.getItem !== 'function' || !text(storageKey)) {
    return { status: 'unavailable', recipe: null };
  }
  try {
    const serialized = storage.getItem(storageKey);
    if (!serialized || serialized.length > CAREER_RECIPE_LIMITS.maxBytes) return { status: 'empty', recipe: null };
    const payload = JSON.parse(serialized);
    if (!object(payload) || payload.recipeHash !== payload.recipe?.recipeHash) return { status: 'invalid', recipe: null };
    const recipe = parseCareerSimulationRecipe(JSON.stringify(payload.recipe), context);
    if (payload.recipeHash !== recipe.recipeHash) return { status: 'invalid', recipe: null };
    return { status: 'loaded', recipe };
  } catch {
    return { status: 'invalid', recipe: null };
  }
}

function observedRowsUntilCensoring(timeline) {
  const rows = (Array.isArray(timeline?.rows) ? timeline.rows : [])
    .filter(row => row.status === 'observed')
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear);
  const censoringIndex = rows.findIndex(row => row.retired === true
    || row.censoring === 'observed-retirement' || row.censoring === 'archive-edge');
  return censoringIndex >= 0 ? rows.slice(0, censoringIndex + 1) : rows;
}

function selectedComparatorRow(timeline, targetState, asOfSeasonStartYear) {
  const targetComparisonStage = comparisonStage(targetState.stage);
  // An archive/retirement label is a terminal evidence boundary. If a
  // malformed package carries rows after it, do not let those later rows
  // become a comparator anchor or leak a post-censoring transition.
  const eligibleRows = observedRowsUntilCensoring(timeline);
  const rows = eligibleRows
    .filter(row => row.retired !== true && row.censoring !== 'observed-retirement')
    .filter(row => {
      const state = rowState(row);
      // A comparator with disagreeing age/experience sources cannot be safely
      // matched to the target state. Keep the row visible in its history
      // receipt, but do not let it supply an anchor or transition.
      if (stateHasConflict(state)) return false;
      if (state.experience === null) return false;
      if (targetComparisonStage !== 'custom' && state.stage !== targetComparisonStage) return false;
      if (targetState.positions.length && state.positions.length
        && !targetState.positions.some(position => state.positions.includes(position))) return false;
      return true;
    });
  // A forward transition needs a next observed season. Prefer an exact-cutoff
  // row only when the bounded timeline carries an accepted next-year arc;
  // otherwise use the latest eligible pre-cutoff row that can actually supply
  // a transition. The resulting lag is retained in the receipt and penalized
  // during sampling, rather than hidden behind a nominal cutoff label.
  const observedYears = new Set(eligibleRows.map(row => row.seasonStartYear));
  const withNextArc = rows.filter(row => observedYears.has(row.seasonStartYear + 1));
  const exactWithNextArc = withNextArc.filter(row => row.seasonStartYear === asOfSeasonStartYear);
  const candidates = exactWithNextArc.length ? exactWithNextArc : withNextArc.length ? withNextArc : rows;
  return [...candidates].sort((left, right) => {
    const leftState = rowState(left), rightState = rowState(right);
    const leftDistance = Math.abs(leftState.experience - targetState.experience)
      + (finite(leftState.age) ? Math.abs(leftState.age - targetState.age) * 0.25 : 10);
    const rightDistance = Math.abs(rightState.experience - targetState.experience)
      + (finite(rightState.age) ? Math.abs(rightState.age - targetState.age) * 0.25 : 10);
    return leftDistance - rightDistance || right.seasonStartYear - left.seasonStartYear;
  })[0] || null;
}

function transitionRows(timeline, anchor) {
  if (!anchor) return [];
  const observed = observedRowsUntilCensoring(timeline);
  const anchorIndex = observed.findIndex(row => row.seasonStartYear === anchor.seasonStartYear);
  if (anchorIndex < 0) return [];
  const transitions = [];
  for (let index = anchorIndex; index < observed.length - 1; index += 1) {
    const from = observed[index], to = observed[index + 1];
    // A dated retirement is a terminal observed boundary. Archive-edge is a
    // right-censoring boundary: an observed change into it may be retained,
    // but no later row is allowed to create a post-censoring career arc.
    if (from.retired === true || from.censoring === 'observed-retirement' || from.censoring === 'archive-edge') break;
    if (to.seasonStartYear !== from.seasonStartYear + 1) continue;
    const fromState = rowState(from), toState = rowState(to);
    // State conflicts are an evidence boundary, not a value to interpolate.
    // Stop here so a later clean row cannot create an apparently contiguous
    // career arc across an unresolved age/experience disagreement.
    if (stateHasConflict(fromState) || stateHasConflict(toState)) break;
    transitions.push({
      fromSeasonStartYear: from.seasonStartYear,
      toSeasonStartYear: to.seasonStartYear,
      from: fromState,
      to: toState,
      metricDelta: metricDelta(from, to),
      metricRateDelta: metricRateDelta(fromState, toState),
      minutesDelta: finite(fromState.minutesPerGame) && finite(toState.minutesPerGame)
        ? round(toState.minutesPerGame - fromState.minutesPerGame) : null,
      gamesDelta: integer(fromState.games) && integer(toState.games) ? toState.games - fromState.games : null,
    });
    if (to.retired === true || to.censoring === 'observed-retirement' || to.censoring === 'archive-edge') break;
  }
  return transitions;
}

function censoringFor(history, timeline, asOfSeasonStartYear) {
  // Respect the first observed terminal boundary before classifying censoring.
  // A malformed history can contain rows after an archive edge; those rows
  // must not override the earlier right-censoring label with a later retirement.
  const rows = observedRowsUntilCensoring(timeline)
    .filter(row => row.seasonStartYear <= asOfSeasonStartYear);
  const last = rows.at(-1);
  const retirementRow = rows.find(row => row.retired === true || row.censoring === 'observed-retirement');
  const archiveRow = rows.find(row => row.censoring === 'archive-edge');
  const lastExplicit = last?.censoring && last.censoring !== 'unknown' ? last.censoring : null;
  // A row-level retirement flag is observed evidence even when the upstream
  // package omitted a redundant censoring label.  Keep history-level flags
  // gated below so an undated future retirement cannot leak into the cutoff.
  if (retirementRow) return 'observed-retirement';
  if (archiveRow) return 'archive-edge';
  if (lastExplicit) return normalizeCensoring(lastExplicit, last?.retired === true);
  const retirementYear = Number(history.retirementSeasonStartYear);
  const datedRetirement = integer(retirementYear) && retirementYear >= 1947 && retirementYear <= asOfSeasonStartYear;
  // An undated history boundary may refer to a later archive edge. Only a
  // dated retirement can safely affect this cutoff; archive edges must be on
  // an observed row at or before it.
  const explicit = datedRetirement ? 'observed-retirement' : null;
  return normalizeCensoring(explicit, explicit === 'observed-retirement');
}

function aggregateTransitionStats(transitions) {
  const deltas = Object.fromEntries(CAREER_METRICS.map(key => [key, []]));
  const rateDeltas = Object.fromEntries(CAREER_METRICS.map(key => [key, []]));
  const minutes = [], games = [];
  for (const transition of transitions) {
    const weight = transitionExposureSupport(transition);
    for (const key of CAREER_METRICS) if (finite(transition.metricDelta[key])) deltas[key].push({ value: transition.metricDelta[key], weight });
    for (const key of CAREER_METRICS) if (finite(transition.metricRateDelta?.[key])) rateDeltas[key].push({ value: transition.metricRateDelta[key], weight });
    if (finite(transition.minutesDelta)) minutes.push({ value: transition.minutesDelta, weight });
    if (finite(transition.gamesDelta)) games.push({ value: transition.gamesDelta, weight });
  }
  const mean = Object.fromEntries(CAREER_METRICS.map(key => [key, round(weightedMean(deltas[key]))]));
  return {
    mean,
    sampleCounts: Object.fromEntries(CAREER_METRICS.map(key => [key, deltas[key].length])),
    standardDeviation: Object.fromEntries(CAREER_METRICS.map(key => [key, round(weightedStandardDeviation(deltas[key]))])),
    rateMean: Object.fromEntries(CAREER_METRICS.map(key => [key, round(weightedMean(rateDeltas[key]))])),
    rateSampleCounts: Object.fromEntries(CAREER_METRICS.map(key => [key, rateDeltas[key].length])),
    rateStandardDeviation: Object.fromEntries(CAREER_METRICS.map(key => [key, round(weightedStandardDeviation(rateDeltas[key]))])),
    minutesStandardDeviation: round(weightedStandardDeviation(minutes)),
    gamesStandardDeviation: round(weightedStandardDeviation(games)),
  };
}

function weightedRows(rows = []) {
  return rows.filter(row => finite(row?.value) && finite(row?.weight) && row.weight > 0);
}

function weightedMean(rows = []) {
  const usable = weightedRows(rows);
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  return totalWeight > 0 ? usable.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight : 0;
}

function weightedStandardDeviation(rows = []) {
  const usable = weightedRows(rows);
  if (usable.length < 2) return 0;
  const totalWeight = usable.reduce((sum, row) => sum + row.weight, 0);
  const squaredWeight = usable.reduce((sum, row) => sum + row.weight ** 2, 0);
  const degreesOfFreedom = totalWeight - squaredWeight / totalWeight;
  if (!(degreesOfFreedom > 0)) return 0;
  const mean = weightedMean(usable);
  const weightedSquares = usable.reduce((sum, row) => sum + row.weight * ((row.value - mean) ** 2), 0);
  return Math.sqrt(weightedSquares / degreesOfFreedom);
}

/**
 * Build a forward-time comparable cohort. Every comparator is trimmed to the
 * target's as-of season before it is matched, so no comparator's later career
 * can leak into a target snapshot. Only contiguous observed seasons create a
 * transition; gaps and archive edges do not become synthetic retirements.
 */
export function buildCareerCohort({
  targetPlayerId = null,
  targetState,
  histories,
  asOfSeasonStartYear,
  minComparables = CAREER_SIMULATION_POLICY.minComparables,
  minTransitions = CAREER_SIMULATION_POLICY.minTransitions,
} = {}) {
  if (!integer(asOfSeasonStartYear) || asOfSeasonStartYear < 1947) {
    throw new Error('Career cohort selection needs an exact as-of season start year.');
  }
  if (!object(targetState) || targetState.frozen !== true
    || targetState.sourceSeasonStartYear !== asOfSeasonStartYear
    || !CAREER_STAGES.includes(targetState.stage)
    || !integer(targetState.experience) || !finite(targetState.age)
    || targetState.age < 12 || targetState.age > 60) {
    throw new Error('Career cohort selection needs a frozen target state sourced on the selected as-of season.');
  }
  if (stateHasConflict(targetState)) {
    throw new Error('Career cohort selection cannot use a target state with conflicting age or experience evidence.');
  }
  if (targetState.stage !== 'custom' && targetState.stage !== 'prospect'
    && stageForExperience(targetState.experience) !== targetState.stage) {
    throw new Error('Career cohort target stage does not match the sourced experience.');
  }
  if (targetState.stage === 'prospect' && targetState.experience !== 0) {
    throw new Error('Career cohort prospect stage requires zero NBA experience.');
  }
  const normalizedTargetState = {
    ...targetState,
    positions: Array.isArray(targetState.positions)
      ? [...new Set(targetState.positions.filter(value => text(value)).map(value => value.trim()))].sort()
      : [],
  };
  if (!Array.isArray(histories) || histories.length < 1 || histories.length > CAREER_SIMULATION_POLICY.maxCohort) {
    throw new Error(`Career cohorts accept one through ${CAREER_SIMULATION_POLICY.maxCohort} histories.`);
  }
  const requiredComparables = requireIntegerRange(minComparables, 1, CAREER_SIMULATION_POLICY.maxCohort, 'Minimum comparables');
  const requiredTransitions = requireIntegerRange(minTransitions, 1, 10000, 'Minimum transitions');
  const ids = new Set();
  const comparables = [], transitions = [], skipped = [];
  for (let index = 0; index < histories.length; index += 1) {
    const history = histories[index];
    let identity;
    try { identity = historyIdentity(history, index); }
    catch (error) { skipped.push({ index, reason: error.message }); continue; }
    if (ids.has(identity.playerId)) {
      skipped.push({ playerId: identity.playerId, reason: 'duplicate accepted player history' });
      continue;
    }
    ids.add(identity.playerId);
    if (targetPlayerId && identity.playerId === targetPlayerId) {
      skipped.push({ playerId: identity.playerId, reason: 'target player is not an eligible comparator' });
      continue;
    }
    let timeline;
    try {
      timeline = buildCareerTimeline(history.profiles, { asOfSeasonStartYear });
    } catch (error) {
      skipped.push({ playerId: identity.playerId, reason: error.message });
      continue;
    }
    const invalidExposureRows = timeline.rows.filter(row => row.status === 'observed'
      && row.seasonStartYear <= asOfSeasonStartYear
      && integer(row.games)
      && row.games > CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason);
    if (invalidExposureRows.length) {
      const seasons = invalidExposureRows.map(row => ({ seasonStartYear: row.seasonStartYear, games: row.games }));
      skipped.push({
        playerId: identity.playerId,
        player: identity.player,
        reason: `observed season exposure exceeds the ${CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason}-game receipt limit`,
        excludedRows: seasons,
      });
      continue;
    }
    const anchor = selectedComparatorRow(timeline, normalizedTargetState, asOfSeasonStartYear);
    if (!anchor) {
      skipped.push({ playerId: identity.playerId, reason: 'no as-of row matches stage, experience, and role' });
      continue;
    }
    const state = rowState(anchor);
    const playerTransitions = transitionRows(timeline, anchor);
    const acceptedObservedRows = observedRowsUntilCensoring(timeline);
    const entry = {
      playerId: identity.playerId,
      player: identity.player,
      asOfSeasonStartYear: anchor.seasonStartYear,
      anchorLagSeasons: asOfSeasonStartYear - anchor.seasonStartYear,
      asOf: state,
      observedRows: acceptedObservedRows,
      gapRows: timeline.gapRows,
      transitions: playerTransitions,
      censoring: censoringFor(history, timeline, asOfSeasonStartYear),
      futureRowsExcluded: timeline.asOf?.futureRowsExcluded || 0,
    };
    comparables.push(entry);
    transitions.push(...playerTransitions.map(transition => ({ ...transition, playerId: identity.playerId, player: identity.player,
      anchorLagSeasons: asOfSeasonStartYear - anchor.seasonStartYear })));
  }
  comparables.sort((left, right) => left.playerId.localeCompare(right.playerId));
  transitions.sort((left, right) => left.fromSeasonStartYear - right.fromSeasonStartYear || left.playerId.localeCompare(right.playerId));
  const censoring = Object.fromEntries([...CENSORING_VALUES].map(value => [value, comparables.filter(row => row.censoring === value).length]));
  const status = comparables.length >= requiredComparables && transitions.length >= requiredTransitions ? 'ready' : 'insufficient';
  return Object.freeze({
    version: CAREER_SIMULATION_POLICY.version,
    status,
    asOfSeasonStartYear,
    requested: { minComparables: requiredComparables, minTransitions: requiredTransitions },
    target: Object.freeze({ playerId: text(targetPlayerId), state: Object.freeze(normalizedTargetState) }),
    comparables: Object.freeze(comparables),
    transitions: Object.freeze(transitions),
    transitionStats: aggregateTransitionStats(transitions),
    censoring: Object.freeze(censoring),
    skipped: Object.freeze(skipped),
    reason: status === 'ready' ? null : `Need at least ${requiredComparables} comparables and ${requiredTransitions} contiguous observed transitions; received ${comparables.length} and ${transitions.length}.`,
    note: 'Comparators are accepted career histories trimmed to the target as-of season. Archive-edge rows are not treated as observed retirements. Rows with conflicting age or experience evidence remain visible in the history receipt but cannot anchor or bridge a modeled transition.',
  });
}

function progressionProfile(mode, custom = {}) {
  const normalized = String(mode || 'typical').trim().toLowerCase();
  if (normalized !== 'custom' && !PROGRESSION_PRESETS[normalized]) throw new Error('Choose conservative, typical, breakout, decline, or custom progression.');
  if (normalized !== 'custom') return { mode: normalized, ...PROGRESSION_PRESETS[normalized] };
  if (!object(custom)) throw new Error('Custom progression needs progression, regression, and volatility values.');
  return {
    mode: 'custom',
    positive: requireRange(custom.progression, 0, 2, 'Custom progression'),
    negative: requireRange(custom.regression, 0, 2, 'Custom regression'),
    volatility: requireRange(custom.volatility, 0, 2, 'Custom volatility'),
  };
}

function normalizeProgressionBySeason(value, horizon) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length !== horizon) {
    throw new Error('Season progression choices must contain one supported policy for each future season.');
  }
  return value.map(mode => {
    if (typeof mode !== 'string' || mode === 'custom') {
      throw new Error('Each future season must choose conservative, typical, breakout, or decline progression.');
    }
    return progressionProfile(mode).mode;
  });
}

function normalizeWorkload(workload, base) {
  const value = object(workload) ? workload : { mode: 'observed' };
  const mode = String(value.mode || 'observed').trim().toLowerCase();
  if (!['observed', 'custom'].includes(mode)) throw new Error('Workload mode must be observed or custom.');
  if (mode === 'observed') return { mode, maxExpansion: CAREER_SIMULATION_POLICY.maxWorkloadExpansion };
  const minutesPerGame = requireRange(value.minutesPerGame, 0, CAREER_SIMULATION_POLICY.maxMinutesPerGame, 'Custom minutes per game');
  const gamesPerSeason = requireIntegerRange(value.gamesPerSeason, 0, CAREER_SIMULATION_POLICY.maxGamesPerSeason, 'Custom games per season');
  const maxExpansion = requireRange(value.maxExpansion ?? CAREER_SIMULATION_POLICY.maxWorkloadExpansion, 0.1, CAREER_SIMULATION_POLICY.maxWorkloadExpansion, 'Workload expansion limit');
  if (finite(base.minutesPerGame) && base.minutesPerGame > 0 && minutesPerGame > base.minutesPerGame * maxExpansion) {
    throw new Error('Custom workload exceeds the declared evidence-bounded expansion limit.');
  }
  if (integer(base.games) && base.games > 0 && gamesPerSeason > base.games * maxExpansion) {
    throw new Error('Custom workload exceeds the declared evidence-bounded expansion limit.');
  }
  return { mode, minutesPerGame: round(minutesPerGame), gamesPerSeason: round(gamesPerSeason), maxExpansion };
}

function normalizeTeamContext(teamContext) {
  const value = object(teamContext) ? teamContext : {};
  const result = {
    label: text(value.label) || 'Unspecified team context',
    role: text(value.role) || null,
    applied: false,
    model: null,
    note: 'Team context is descriptive. No coaching, contract, roster, or chemistry effect is invented.',
  };
  if (value.model === undefined || value.model === null) return result;
  if (!object(value.model) || value.model.status !== 'validated' || !text(value.model.version)
    || value.model.heldOut?.passed !== true) {
    throw new Error('A team-context effect requires a validated held-out model.');
  }
  const multipliers = object(value.model.metricMultipliers) ? value.model.metricMultipliers : {};
  for (const key of CAREER_METRICS) if (multipliers[key] !== undefined) requireRange(multipliers[key], 0.5, 1.5, `Team-context ${key} multiplier`);
  result.applied = true;
  result.model = { version: value.model.version, metricMultipliers: Object.fromEntries(CAREER_METRICS.map(key => [key, multipliers[key] ?? 1])) };
  result.note = 'Team context uses only the supplied validated held-out model; it does not infer coaching or teammate effects.';
  return result;
}

function normalizeRetirementModel(model) {
  if (model === undefined || model === null) return { status: 'not-modeled', version: null, annualProbability: null };
  if (!object(model) || model.status !== 'validated' || !text(model.version) || model.heldOut?.passed !== true) {
    throw new Error('Retirement treatment requires a validated held-out model.');
  }
  const annualProbability = requireRange(model.annualProbability, 0, 1, 'Retirement probability');
  return { status: 'modeled', version: model.version, annualProbability };
}

function normalizeAvailabilityModel(model) {
  if (model === undefined || model === null) return { status: 'not-modeled', version: null, gamesMultiplier: 1, gamesStandardDeviation: 0 };
  if (!object(model) || model.status !== 'validated' || !text(model.version) || model.heldOut?.passed !== true) {
    throw new Error('Availability treatment requires a validated held-out model.');
  }
  return {
    status: 'modeled',
    version: model.version,
    gamesMultiplier: requireRange(model.gamesMultiplier ?? 1, 0, 1.25, 'Availability games multiplier'),
    // Optional dispersion is accepted only as part of the same validated
    // model receipt. A missing value means deterministic adjustment, never a
    // silently invented injury or availability story.
    gamesStandardDeviation: requireRange(model.gamesStandardDeviation ?? 0, 0, 30, 'Availability games standard deviation'),
  };
}

function normalizeMilestones(milestones) {
  if (milestones === undefined) return [];
  if (!Array.isArray(milestones) || milestones.length > 20) throw new Error('Milestones must contain at most 20 entries.');
  const keys = new Set();
  return milestones.map((milestone, index) => {
    if (!object(milestone) || !text(milestone.key) || !text(milestone.label) || !CAREER_METRICS.includes(milestone.metric)
      || !finite(milestone.threshold) || !['at-least', 'at-most'].includes(milestone.direction)) {
      throw new Error(`Milestone ${index + 1} is malformed.`);
    }
    const key = milestone.key.trim();
    if (keys.has(key)) throw new Error(`Milestone ${index + 1} duplicates an earlier key.`);
    keys.add(key);
    const threshold = Number(milestone.threshold);
    if (threshold < 0) throw new Error(`Milestone ${index + 1} cannot use a negative threshold for a non-negative metric.`);
    return { key, label: milestone.label.trim(), metric: milestone.metric, threshold, direction: milestone.direction };
  });
}

function canonicalCalibrationUtc(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null;
}

function normalizeCalibration(calibration) {
  if (calibration === undefined || calibration === null) return { status: 'uncalibrated', version: null };
  const validStatus = calibration?.status === 'validated' || calibration?.status === 'calibrated';
  const holdoutPolicy = calibration?.holdoutPolicy || calibration?.heldOut?.holdoutPolicy;
  const rawHoldouts = Array.isArray(calibration?.holdouts) ? calibration.holdouts
    : Array.isArray(calibration?.heldOut?.holdouts) ? calibration.heldOut.holdouts : [];
  if (!object(calibration) || !validStatus || calibration.scope !== 'career-milestones'
    || !text(calibration.version) || holdoutPolicy !== CAREER_CALIBRATION_POLICY.holdoutPolicy
    || rawHoldouts.length < CAREER_CALIBRATION_POLICY.minHoldouts) {
    return { status: 'uncalibrated', version: null, reason: 'Milestone probabilities require multiple strict pre-season rolling holdouts.' };
  }
  const holdouts = rawHoldouts.map((holdout, index) => {
    const holdoutSeasonStartYear = Number(holdout?.holdoutSeasonStartYear);
    const trainedThroughSeasonStartYear = Number(holdout?.trainedThroughSeasonStartYear);
    const sourceCutoffUtc = canonicalCalibrationUtc(holdout?.sourceCutoffUtc);
    const sample = Number(holdout?.sample);
    const complete = holdout?.status === 'complete' || holdout?.passed === true;
    if (!integer(holdoutSeasonStartYear, 1947, 2200)
      || !integer(trainedThroughSeasonStartYear, 1947, holdoutSeasonStartYear - 1)
      || !sourceCutoffUtc || Date.parse(sourceCutoffUtc) >= Date.UTC(holdoutSeasonStartYear, 9, 1)
      || !integer(sample, 1) || !complete) {
      return null;
    }
    return { holdoutSeasonStartYear, trainedThroughSeasonStartYear, sourceCutoffUtc, sample, status: 'complete' };
  });
  if (holdouts.some(holdout => !holdout)
    || new Set(holdouts.map(holdout => holdout.holdoutSeasonStartYear)).size !== holdouts.length) {
    return { status: 'uncalibrated', version: null, reason: 'Milestone calibration holdouts must be unique, complete, and issued before each holdout season.' };
  }
  const heldOutSample = holdouts.reduce((sum, holdout) => sum + holdout.sample, 0);
  const aggregateSample = Number(calibration.aggregate?.sample ?? calibration.heldOut?.aggregate?.sample);
  if (!integer(aggregateSample, CAREER_CALIBRATION_POLICY.minAggregateSample)
    || aggregateSample !== heldOutSample) {
    return { status: 'uncalibrated', version: null, reason: 'Milestone calibration aggregate sample does not reconcile to its rolling holdouts.' };
  }
  return { status: 'calibrated', version: calibration.version, holdoutPolicy, holdoutCount: holdouts.length,
    heldOutSample, holdouts, aggregate: { sample: aggregateSample } };
}

function transitionPool(cohort, state) {
  const targetComparisonStage = comparisonStage(state.stage);
  const exact = cohort.transitions.filter(transition => {
    // Missing comparator experience is not equivalent to the target's
    // experience.  Keep it out of the exact-match pool; if no fully sourced
    // transition remains, the explicit fallback receipt below discloses that
    // the broader transition pool was used.
    if (!integer(transition.from.experience, 0, 40)) return false;
    const experienceDistance = Math.abs(transition.from.experience - state.experience);
    const stageMatch = targetComparisonStage === 'custom' || transition.from.stage === targetComparisonStage;
    const roleMatch = !state.positions.length || !transition.from.positions.length
      || state.positions.some(position => transition.from.positions.includes(position));
    return stageMatch && roleMatch && experienceDistance <= 1;
  });
  const rows = exact.length ? exact : cohort.transitions;
  const exposureSupports = rows.map(transitionExposureSupport);
  const weights = rows.map((transition, index) => transitionSimilarityWeight(transition, state, exposureSupports[index]));
  // A selected pool can contain incomplete metric transitions. Count only the
  // rows that actually carry each delta instead of treating pool cardinality
  // as usable evidence for every metric. This keeps missing stats from
  // inheriting the confidence of unrelated component transitions.
  const metricSampleCounts = Object.fromEntries(CAREER_METRICS.map(key => [key,
    rows.filter(transition => finite(transition.metricDelta?.[key])).length]));
  const rateSampleCounts = Object.fromEntries(CAREER_METRICS.map(key => [key,
    rows.filter(transition => finite(transition.metricRateDelta?.[key])).length]));
  const metricExposureEquivalentSamples = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  const rateExposureEquivalentSamples = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  rows.forEach((transition, index) => {
    const support = exposureSupports[index];
    for (const key of CAREER_METRICS) {
      if (finite(transition.metricDelta?.[key])) metricExposureEquivalentSamples[key] += support;
      if (finite(transition.metricRateDelta?.[key])) rateExposureEquivalentSamples[key] += support;
    }
  });
  return { rows, weights, metricSampleCounts, rateSampleCounts, metricExposureEquivalentSamples,
    rateExposureEquivalentSamples, exposureSupports, fallback: !exact.length,
    selection: exact.length ? 'similarity-weighted-exact' : 'similarity-weighted-broader' };
}

function transitionExposureSupport(transition) {
  const fromGames = transition?.from?.games;
  const toGames = transition?.to?.games;
  const floor = CAREER_SIMULATION_POLICY.transitionExposureFloor;
  if (!integer(fromGames, 1) || !integer(toGames, 1)) return floor;
  const minimumGames = Math.min(fromGames, toGames);
  const gameSupport = Math.sqrt(minimumGames / CAREER_SIMULATION_POLICY.maxGamesPerSeason);
  const fromMinutes = finite(transition?.from?.minutesPerGame) && transition.from.minutesPerGame >= 0
    ? fromGames * transition.from.minutesPerGame : null;
  const toMinutes = finite(transition?.to?.minutesPerGame) && transition.to.minutesPerGame >= 0
    ? toGames * transition.to.minutesPerGame : null;
  // Missing workload evidence must not turn a low-minute or incomplete arc
  // into a full-confidence production transition. Keep it eligible at floor.
  if (!finite(fromMinutes) || !finite(toMinutes)) return floor;
  const minimumMinutes = Math.min(fromMinutes, toMinutes);
  const minuteSupport = Math.sqrt(minimumMinutes / CAREER_SIMULATION_POLICY.transitionExposureReferenceMinutes);
  return clamp(Math.min(gameSupport, minuteSupport), floor, 1);
}

function transitionSimilarityWeight(transition, state, exposureSupport = transitionExposureSupport(transition)) {
  const from = transition?.from || {};
  let distance = 0;
  if (integer(from.experience, 0, 40) && integer(state.experience, 0, 40)) distance += Math.abs(from.experience - state.experience);
  else distance += 3;
  if (finite(from.age) && finite(state.age)) distance += Math.abs(from.age - state.age) * 0.35;
  else distance += 1.5;
  if (finite(from.minutesPerGame) && finite(state.minutesPerGame)) distance += Math.abs(from.minutesPerGame - state.minutesPerGame) / 12;
  if (integer(from.games) && integer(state.games)) distance += Math.abs(from.games - state.games) / 40;
  const targetPositions = Array.isArray(state.positions) ? state.positions : [];
  const sourcePositions = Array.isArray(from.positions) ? from.positions : [];
  if (targetPositions.length && sourcePositions.length && !targetPositions.some(position => sourcePositions.includes(position))) distance += 2;
  for (const key of ['points', 'assists', 'rebounds']) {
    const left = from.metrics?.[key], right = state.metrics?.[key];
    if (finite(left) && finite(right)) distance += Math.min(3, Math.abs(left - right) / Math.max(1, Math.abs(right)));
  }
  // A positive floor preserves a non-zero chance for every accepted transition
  // while making nearby role/workload arcs much more likely than a random era.
  const anchorLag = integer(transition?.anchorLagSeasons, 0) ? transition.anchorLagSeasons : 0;
  // A lagged comparator is still usable evidence, but it should not be as
  // likely as an exact-cutoff arc when both are in the accepted pool.
  distance += Math.min(3, anchorLag * 0.75);
  return exposureSupport / ((1 + distance) ** 2);
}

function sampleTransition(pool, random) {
  if (!pool.rows.length) return null;
  const weights = Array.isArray(pool.weights) && pool.weights.length === pool.rows.length ? pool.weights : pool.rows.map(() => 1);
  const total = weights.reduce((sum, value) => sum + (finite(value) && value > 0 ? value : 0), 0);
  if (!(total > 0)) return pool.rows[Math.floor(random() * pool.rows.length)];
  let cursor = random() * total;
  for (let index = 0; index < pool.rows.length; index += 1) {
    cursor -= Math.max(0, weights[index] || 0);
    if (cursor <= 0) return pool.rows[index];
  }
  return pool.rows.at(-1);
}

function sampleTransitionComponent(pool, hasComponent, random) {
  if (!Array.isArray(pool?.rows) || !Array.isArray(pool.weights)) return null;
  const rows = [];
  const weights = [];
  for (let index = 0; index < pool.rows.length; index += 1) {
    const transition = pool.rows[index];
    const weight = pool.weights[index];
    if (!hasComponent(transition) || !finite(weight) || weight <= 0) continue;
    rows.push(transition);
    weights.push(weight);
  }
  return rows.length ? sampleTransition({ rows, weights }, random) : null;
}

function selectedTransitionDispersion(pool, valueForTransition, priorStandardDeviation) {
  const rows = pool.rows.map((transition, index) => ({
    value: valueForTransition(transition),
    weight: pool.weights[index],
    exposureSupport: pool.exposureSupports[index],
  })).filter(row => finite(row.value) && finite(row.weight) && row.weight > 0);
  const prior = finite(priorStandardDeviation) && priorStandardDeviation >= 0 ? priorStandardDeviation : 0;
  if (!rows.length) return {
    standardDeviation: prior, localStandardDeviation: null, priorStandardDeviation: prior,
    sampleCount: 0, effectiveSamples: 0, exposureEquivalentSamples: 0, priorWeight: 1,
  };

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const normalizedWeights = rows.map(row => row.weight / totalWeight);
  const mean = rows.reduce((sum, row, index) => sum + row.value * normalizedWeights[index], 0);
  const squaredWeightShare = normalizedWeights.reduce((sum, weight) => sum + weight ** 2, 0);
  const effectiveSamples = squaredWeightShare > 0 ? 1 / squaredWeightShare : 0;
  const populationVariance = rows.reduce((sum, row, index) => (
    sum + normalizedWeights[index] * ((row.value - mean) ** 2)
  ), 0);
  const sampleCorrection = 1 - squaredWeightShare;
  const localVariance = sampleCorrection > 1e-9 ? populationVariance / sampleCorrection : 0;
  const exposureEquivalentSamples = rows.reduce((sum, row) => (
    sum + (finite(row.exposureSupport) && row.exposureSupport > 0 ? row.exposureSupport : 0)
  ), 0);
  const evidence = Math.min(effectiveSamples, exposureEquivalentSamples);
  const priorWeight = CAREER_SIMULATION_POLICY.transitionDispersionPriorStrength /
    (CAREER_SIMULATION_POLICY.transitionDispersionPriorStrength + evidence);
  const variance = (priorWeight * prior ** 2) + ((1 - priorWeight) * localVariance);
  return {
    standardDeviation: Math.sqrt(Math.max(0, variance)),
    sampledStandardDeviation: Math.sqrt(Math.max(0, populationVariance)),
    localStandardDeviation: Math.sqrt(Math.max(0, localVariance)),
    priorStandardDeviation: prior,
    sampleCount: rows.length,
    effectiveSamples,
    exposureEquivalentSamples,
    priorWeight,
  };
}

function transitionInnovationPlan(pool, valueForTransition, targetStandardDeviation, includeTransition = () => true) {
  const rows = pool.rows.map((transition, index) => ({
    value: valueForTransition(transition),
    weight: pool.weights[index],
    included: includeTransition(transition),
  })).filter(row => row.included && finite(row.value) && finite(row.weight) && row.weight > 0);
  const target = finite(targetStandardDeviation) && targetStandardDeviation >= 0 ? targetStandardDeviation : 0;
  if (!rows.length) return {
    mean: 0, sampledStandardDeviation: 0, targetStandardDeviation: target,
    empiricalScale: 1, residualStandardDeviation: target, sampleCount: 0,
  };
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!(totalWeight > 0)) return {
    mean: 0, sampledStandardDeviation: 0, targetStandardDeviation: target,
    empiricalScale: 1, residualStandardDeviation: target, sampleCount: 0,
  };
  const mean = rows.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;
  const variance = rows.reduce((sum, row) => sum + row.weight * ((row.value - mean) ** 2), 0) / totalWeight;
  const sampledStandardDeviation = Math.sqrt(Math.max(0, variance));
  const empiricalScale = sampledStandardDeviation > target && sampledStandardDeviation > 0
    ? target / sampledStandardDeviation : 1;
  const scaledSampleVariance = (sampledStandardDeviation * empiricalScale) ** 2;
  const residualStandardDeviation = Math.sqrt(Math.max(0, (target ** 2) - scaledSampleVariance));
  return { mean, sampledStandardDeviation, targetStandardDeviation: target, empiricalScale,
    residualStandardDeviation, sampleCount: rows.length };
}

function applyTransitionInnovationPlan(plan, sampledValue, random, persistentShock = null, step = 1) {
  if (!finite(sampledValue)) return null;
  const centered = sampledValue - plan.mean;
  const adjusted = plan.mean + centered * plan.empiricalScale;
  if (!(plan.residualStandardDeviation > 0)) return adjusted;
  const persistentShare = finite(persistentShock)
    ? CAREER_SIMULATION_POLICY.persistentInnovationShare * Math.min(1, step / 3) : 0;
  const independentShare = Math.sqrt(Math.max(0, 1 - (persistentShare ** 2)));
  let noise = normal(random) * plan.residualStandardDeviation * independentShare;
  if (persistentShare > 0) noise += persistentShock * plan.residualStandardDeviation * persistentShare;
  return adjusted + noise;
}

function progressionAdjustedDelta(delta, profile, direction = 1) {
  if (!finite(delta)) return null;
  const improving = direction >= 0 ? delta >= 0 : delta <= 0;
  const multiplier = improving ? profile.positive : profile.negative;
  return delta * multiplier;
}

function innovationPlanSummary(plan) {
  return {
    conditionalSampleCount: plan.sampleCount,
    sampledStandardDeviation: round(plan.sampledStandardDeviation),
    targetStandardDeviation: round(plan.targetStandardDeviation),
    empiricalScale: round(plan.empiricalScale),
    residualStandardDeviation: round(plan.residualStandardDeviation),
    method: CAREER_SIMULATION_POLICY.transitionInnovation,
  };
}

function transitionPoolDispersion(pool, cohort) {
  const metricDeltas = Object.fromEntries(CAREER_METRICS.map(key => [key,
    selectedTransitionDispersion(pool, transition => transition.metricDelta?.[key], cohort.transitionStats.standardDeviation[key])]));
  const rateDeltas = Object.fromEntries(CAREER_METRICS.map(key => [key,
    selectedTransitionDispersion(pool, transition => transition.metricRateDelta?.[key], cohort.transitionStats.rateStandardDeviation?.[key])]));
  const minutes = selectedTransitionDispersion(pool, transition => transition.minutesDelta,
    cohort.transitionStats.minutesStandardDeviation);
  const games = selectedTransitionDispersion(pool, transition => transition.gamesDelta,
    cohort.transitionStats.gamesStandardDeviation);
  return { metricDeltas, rateDeltas, minutes, games };
}

function transitionDispersionSummary(dispersion) {
  const summarize = value => ({
    selectedStandardDeviation: round(value.standardDeviation),
    sampledStandardDeviation: round(value.sampledStandardDeviation),
    localStandardDeviation: value.localStandardDeviation === null ? null : round(value.localStandardDeviation),
    priorStandardDeviation: round(value.priorStandardDeviation),
    effectiveSamples: round(value.effectiveSamples),
    exposureEquivalentSamples: round(value.exposureEquivalentSamples),
    priorWeight: round(value.priorWeight),
  });
  return {
    metricDeltas: Object.fromEntries(CAREER_METRICS.map(key => [key, summarize(dispersion.metricDeltas[key])])),
    rateDeltas: Object.fromEntries(CAREER_METRICS.map(key => [key, summarize(dispersion.rateDeltas[key])])),
    minutesPerGame: summarize(dispersion.minutes),
    games: summarize(dispersion.games),
    method: CAREER_SIMULATION_POLICY.transitionDispersion,
  };
}

function stateProgression(profile, state) {
  const stage = state?.stage || stageForExperience(state?.experience);
  const factors = {
    prospect: { positive: 1.2, negative: 0.55 },
    rookie: { positive: 1.15, negative: 0.65 },
    'early-career': { positive: 1.05, negative: 0.82 },
    prime: { positive: 0.82, negative: 1.0 },
    'late-career': { positive: 0.55, negative: 1.2 },
    custom: { positive: 1, negative: 1 },
  }[stage] || { positive: 1, negative: 1 };
  // Experience is a useful career-stage anchor, but it is not a substitute
  // for age.  A player can enter the league older or younger than the stage
  // midpoint, and applying only stage multipliers made those paths converge
  // too quickly.  Use a small, bounded age adjustment so age influences the
  // direction without overwhelming the observed transition evidence.
  const age = finite(state?.age) ? state.age : 27;
  const agePosition = clamp((age - 27) / 8, -1, 1);
  const agePositive = clamp(1 - agePosition * 0.18, 0.72, 1.18);
  const ageNegative = clamp(1 + agePosition * 0.18, 0.82, 1.36);
  return {
    ...profile,
    positive: profile.positive * factors.positive * agePositive,
    negative: profile.negative * factors.negative * ageNegative,
    ageCurve: { age: round(age), positive: round(agePositive), negative: round(ageNegative), version: CAREER_SIMULATION_POLICY.ageCurve },
  };
}

function shrinkTransitionDelta(delta, key, cohort, poolSize, availableSample = null) {
  if (!finite(delta)) return null;
  // Workload is bounded explicitly after the transition is sampled. Keep the
  // observed minutes/games movement intact so the evidence bound, rather
  // than a production prior, decides whether an exposure jump is allowed.
  if (key === 'minutesPerGame' || key === 'games') return delta;
  const mean = finite(cohort.transitionStats?.mean?.[key]) ? cohort.transitionStats.mean[key] : 0;
  const observed = finite(cohort.transitionStats?.sampleCounts?.[key]) ? cohort.transitionStats.sampleCounts[key] : 0;
  // Global transition counts describe the cohort prior, not the amount of
  // support for this target's matched pool. Use only the selected-pool count,
  // capped by metric availability, so a broad fallback cannot masquerade as
  // a reliable exact transition.
  const selectedSample = finite(availableSample) ? availableSample : observed;
  const localSample = Math.min(Math.max(0, poolSize), Math.max(0, selectedSample));
  // Do not impose a fixed confidence floor: a single low-exposure arc should
  // not receive the same minimum pull as a full season's evidence.
  const reliability = clamp(localSample / (localSample + 12), 0, 0.9);
  return mean + reliability * (delta - mean);
}

function shrinkTransitionRateDelta(delta, key, cohort, poolSize, availableSample = null) {
  if (!finite(delta)) return null;
  const mean = finite(cohort.transitionStats?.rateMean?.[key]) ? cohort.transitionStats.rateMean[key] : 0;
  const observed = finite(cohort.transitionStats?.rateSampleCounts?.[key]) ? cohort.transitionStats.rateSampleCounts[key] : 0;
  const selectedSample = finite(availableSample) ? availableSample : observed;
  const localSample = Math.min(Math.max(0, poolSize), Math.max(0, selectedSample));
  const reliability = clamp(localSample / (localSample + 12), 0, 0.9);
  return mean + reliability * (delta - mean);
}

function validTransitionShape(transition) {
  if (!object(transition) || !integer(transition.fromSeasonStartYear, 1947, 2200)
    || !integer(transition.toSeasonStartYear, 1947, 2200)
    || transition.toSeasonStartYear !== transition.fromSeasonStartYear + 1
    || !validStateReceipt(transition.from) || !validStateReceipt(transition.to)
    || !sameMetricMap(transition.metricDelta, stateMetricDelta(transition.from, transition.to))
    || !sameMetricMap(transition.metricRateDelta, metricRateDelta(transition.from, transition.to))) return false;
  const expectedMinutesDelta = finite(transition.from.minutesPerGame) && finite(transition.to.minutesPerGame)
    ? round(transition.to.minutesPerGame - transition.from.minutesPerGame) : null;
  const expectedGamesDelta = integer(transition.from.games) && integer(transition.to.games)
    ? transition.to.games - transition.from.games : null;
  return sameNullableNumber(transition.minutesDelta, expectedMinutesDelta)
    && sameNullableInteger(transition.gamesDelta, expectedGamesDelta);
}

function validTransitionStats(stats) {
  return object(stats) && object(stats.mean) && object(stats.sampleCounts) && object(stats.standardDeviation)
    && object(stats.rateMean) && object(stats.rateSampleCounts) && object(stats.rateStandardDeviation)
    && CAREER_METRICS.every(key => finite(stats.mean[key])
      && integer(stats.sampleCounts[key], 0)
      && finite(stats.standardDeviation[key]) && stats.standardDeviation[key] >= 0
      && finite(stats.rateMean[key])
      && integer(stats.rateSampleCounts[key], 0)
      && finite(stats.rateStandardDeviation[key]) && stats.rateStandardDeviation[key] >= 0)
    && finite(stats.minutesStandardDeviation) && stats.minutesStandardDeviation >= 0
    && finite(stats.gamesStandardDeviation) && stats.gamesStandardDeviation >= 0;
}

function sameTransitionStats(left, right) {
  if (!validTransitionStats(left) || !validTransitionStats(right)
    || !sameNullableNumber(left.minutesStandardDeviation, right.minutesStandardDeviation)
    || !sameNullableNumber(left.gamesStandardDeviation, right.gamesStandardDeviation)) return false;
  return CAREER_METRICS.every(key => sameNullableNumber(left.mean[key], right.mean[key])
    && sameNullableInteger(left.sampleCounts[key], right.sampleCounts[key])
    && sameNullableNumber(left.standardDeviation[key], right.standardDeviation[key])
    && sameNullableNumber(left.rateMean[key], right.rateMean[key])
    && sameNullableInteger(left.rateSampleCounts[key], right.rateSampleCounts[key])
    && sameNullableNumber(left.rateStandardDeviation[key], right.rateStandardDeviation[key]));
}

function validTargetStateReceipt(state, asOfSeasonStartYear) {
  if (!object(state) || state.frozen !== true || state.sourceSeasonStartYear !== asOfSeasonStartYear
    || !object(state.metrics) || !Array.isArray(state.positions)
    || !CAREER_STAGES.includes(state.stage)
    || !finite(state.age) || state.age < 12 || state.age > 60
    || !integer(state.experience, 0, 40)
    || !CAREER_METRICS.every(key => owns(state.metrics, key)
      && (state.metrics[key] === null || (finite(state.metrics[key]) && state.metrics[key] >= 0)))) return false;
  if (state.stage !== 'prospect' && state.stage !== 'custom'
    && state.stage !== stageForExperience(state.experience)) return false;
  if (state.stage === 'prospect' && state.experience !== 0) return false;
  if (state.minutesPerGame !== null && (!finite(state.minutesPerGame) || state.minutesPerGame < 0
    || state.minutesPerGame > CAREER_SIMULATION_POLICY.maxMinutesPerGame)) return false;
  if (state.games !== null && !integer(state.games, 0, CAREER_SIMULATION_POLICY.maxObservedGamesPerSeason)) return false;
  if (state.positions.some(position => !text(position)) || new Set(state.positions).size !== state.positions.length
    || state.positions.some((position, index) => index > 0 && position < state.positions[index - 1])) return false;
  if (state.ageSource !== null && !text(state.ageSource)
    || state.experienceSource !== null && !text(state.experienceSource)
    || !text(state.stateJoin)
    || !['complete', 'sourced-complete', 'partial', 'missing', 'conflict', 'observed', 'explicit'].includes(state.stateQuality)
    || !Array.isArray(state.stateConflict)) return false;
  if (stateHasConflict(state)) return false;
  return CAREER_ROLE_STATES.includes(state.roleState) && state.roleState === roleStateFor(state);
}

function sameTargetState(left, right, asOfSeasonStartYear) {
  if (!validTargetStateReceipt(left, asOfSeasonStartYear) || !validTargetStateReceipt(right, asOfSeasonStartYear)
    || !sameNullableNumber(left.age, right.age)
    || !sameNullableInteger(left.experience, right.experience)
    || left.stage !== right.stage
    || !sameNullableNumber(left.minutesPerGame, right.minutesPerGame)
    || !sameNullableInteger(left.games, right.games)
    || left.roleState !== right.roleState
    || left.stateJoin !== right.stateJoin
    || left.stateQuality !== right.stateQuality
    || stableJson(left.stateConflict) !== stableJson(right.stateConflict)
    || JSON.stringify(left.positions) !== JSON.stringify(right.positions)) return false;
  return CAREER_METRICS.every(key => sameNullableNumber(left.metrics[key], right.metrics[key]));
}

function cohortComparableReceiptReason(cohort, asOfSeasonStartYear) {
  if (!Array.isArray(cohort.comparables) || cohort.comparables.length > CAREER_SIMULATION_POLICY.maxCohort) {
    return 'The accepted comparable cohort has an invalid comparable-history receipt.';
  }
  const comparableByPlayer = new Map();
  const localTransitions = new Map();
  for (const comparable of cohort.comparables) {
    const playerId = text(comparable?.playerId);
    if (!playerId || comparableByPlayer.has(playerId) || !text(comparable?.player)
      || !integer(comparable?.asOfSeasonStartYear, 1947, asOfSeasonStartYear)
      || !integer(comparable?.anchorLagSeasons, 0, asOfSeasonStartYear - 1947)
      || comparable.anchorLagSeasons !== asOfSeasonStartYear - comparable.asOfSeasonStartYear
      || !Array.isArray(comparable?.observedRows) || !Array.isArray(comparable?.transitions)
      || !integer(comparable?.futureRowsExcluded, 0)
      || !CENSORING_VALUES.has(normalizeCensoring(comparable?.censoring))) {
      return 'The accepted comparable cohort has an invalid comparable-history receipt.';
    }
    const observedBySeason = new Map();
    for (const row of comparable.observedRows) {
      if (!object(row) || row.status !== 'observed' || !integer(row.seasonStartYear, 1947, asOfSeasonStartYear)
        || observedBySeason.has(row.seasonStartYear)) {
        return 'The accepted comparable cohort contains observed rows after the explicit as-of season.';
      }
      observedBySeason.set(row.seasonStartYear, row);
    }
    const anchor = observedBySeason.get(comparable.asOfSeasonStartYear);
    if (!anchor || stateHasConflict(comparable.asOf) || stateHasConflict(rowState(anchor))
      || !sameCareerState(comparable.asOf, rowState(anchor))) {
      return 'The accepted comparable cohort contains a comparator state that does not reconcile to its observed cutoff row.';
    }
    comparableByPlayer.set(playerId, { comparable, observedBySeason });
    for (const transition of comparable.transitions) {
      const key = transitionReceiptKey(transition, playerId);
      const fromRow = observedBySeason.get(transition?.fromSeasonStartYear);
      const toRow = observedBySeason.get(transition?.toSeasonStartYear);
      if (localTransitions.has(key) || (transition.anchorLagSeasons !== undefined
        && transition.anchorLagSeasons !== comparable.anchorLagSeasons)
        || !validTransitionShape(transition)
        || stateHasConflict(transition.from) || stateHasConflict(transition.to)
        || !fromRow || !toRow
        || !sameCareerState(transition.from, rowState(fromRow))
        || !sameCareerState(transition.to, rowState(toRow))) {
        return 'The accepted comparable cohort contains a transition that does not reconcile to observed rows.';
      }
      localTransitions.set(key, transition);
    }
  }
  if (!Array.isArray(cohort.transitions) || cohort.transitions.length !== localTransitions.size) {
    return 'The accepted comparable cohort contains an invalid transition receipt that does not reconcile to its comparable histories.';
  }
  const globalTransitions = new Set();
  for (const transition of cohort.transitions) {
    const playerId = text(transition?.playerId);
    const key = transitionReceiptKey(transition, playerId);
    const local = localTransitions.get(key);
    if (!playerId || playerId === cohort?.target?.playerId || globalTransitions.has(key)
      || !comparableByPlayer.has(playerId) || !validTransitionShape(transition)
      || !local || !sameTransitionReceipt(transition, local)) {
      return 'The accepted comparable cohort contains an invalid transition receipt.';
    }
    globalTransitions.add(key);
  }
  const expectedCensoring = Object.fromEntries([...CENSORING_VALUES].map(value => [value,
    cohort.comparables.filter(row => normalizeCensoring(row.censoring) === value).length]));
  if (!object(cohort.censoring) || [...CENSORING_VALUES].some(value => cohort.censoring[value] !== expectedCensoring[value])) {
    return 'The accepted comparable cohort censoring receipt does not reconcile to its comparable histories.';
  }
  if (!sameTransitionStats(cohort.transitionStats, aggregateTransitionStats(cohort.transitions))) {
    return 'The accepted comparable cohort transition-statistics receipt does not reconcile to its transitions.';
  }
  return null;
}

function cohortIntegrityReason(cohort, asOfSeasonStartYear) {
  if (!object(cohort)) return null;
  if (cohort.version !== CAREER_SIMULATION_POLICY.version) {
    return 'The accepted comparable cohort was built by a different career model version.';
  }
  if (!object(cohort.target) || !text(cohort.target.playerId)
    || !validTargetStateReceipt(cohort.target.state, asOfSeasonStartYear)) {
    return 'The accepted comparable cohort is missing a frozen target-state receipt.';
  }
  if (!Array.isArray(cohort.comparables) || !Array.isArray(cohort.skipped) || !object(cohort.censoring)
    || !validTransitionStats(cohort.transitionStats)) {
    return 'The accepted comparable cohort is missing a complete transition-statistics receipt.';
  }
  if (Array.isArray(cohort.transitions) && cohort.transitions.some(transition => transition?.toSeasonStartYear > asOfSeasonStartYear)) {
    return 'The accepted comparable cohort contains a transition after the explicit as-of season.';
  }
  if (Array.isArray(cohort.comparables) && cohort.comparables.some(comparable => Array.isArray(comparable?.observedRows)
    && comparable.observedRows.some(row => row?.seasonStartYear > asOfSeasonStartYear))) {
    return 'The accepted comparable cohort contains observed rows after the explicit as-of season.';
  }
  return cohortComparableReceiptReason(cohort, asOfSeasonStartYear);
}

function cohortBindingReason(cohort, target, targetPlayerId, asOfSeasonStartYear) {
  const cohortTarget = cohort?.target;
  if (!text(targetPlayerId)) {
    return 'Career simulation needs a bounded target player identity to bind the comparable cohort.';
  }
  if (!text(cohortTarget?.playerId) || cohortTarget.playerId !== targetPlayerId) {
    return 'The accepted comparable cohort is bound to a different target player.';
  }
  const state = cohortTarget?.state;
  if (!sameTargetState(state, target, asOfSeasonStartYear)) {
    return 'The accepted comparable cohort is bound to a different frozen as-of state.';
  }
  return null;
}

function applyContext(metrics, teamContext) {
  if (!teamContext.applied) return metrics;
  return Object.fromEntries(CAREER_METRICS.map(key => [key,
    finite(metrics[key]) ? round(Math.max(0, metrics[key] * teamContext.model.metricMultipliers[key])) : null]));
}

function milestoneReport(paths, milestones, calibration, completedRuns) {
  if (!milestones.length) return { status: 'not-requested', probabilities: [], calibration: null };
  if (calibration.status !== 'calibrated') {
    return { status: 'unavailable-uncalibrated', probabilities: [], calibration, note: 'Milestone probabilities stay hidden until a validated held-out calibration is supplied.' };
  }
  const probabilities = milestones.map(milestone => {
    let hits = 0;
    for (const path of paths) {
      if (path.seasons.some(row => {
        const value = row.status === 'simulated' ? row.metrics[milestone.metric] : null;
        if (!finite(value)) return false;
        return milestone.direction === 'at-least'
          ? value >= milestone.threshold
          : value <= milestone.threshold;
      })) hits++;
    }
    return { ...milestone, probability: completedRuns ? round(hits / completedRuns) : null, hits, denominator: completedRuns };
  });
  return { status: 'calibrated', probabilities, calibration };
}

function summarizePaths(paths, horizon, asOfSeasonStartYear, completedRuns) {
  const metrics = [...CAREER_METRICS, 'minutesPerGame', 'games', 'totalPoints', 'totalAssists', 'totalRebounds', 'totalMinutes'];
  const trajectories = Object.fromEntries(metrics.map(metric => [metric, []]));
  const rateTrajectories = Object.fromEntries(CAREER_METRICS.map(metric => [metric, []]));
  for (let step = 1; step <= horizon; step += 1) {
    const seasonStartYear = asOfSeasonStartYear + step;
    for (const metric of metrics) {
      const values = paths.map(path => {
        const current = path.seasons[step - 1];
        if (metric === 'minutesPerGame' || metric === 'games') return current?.[metric];
        const bucket = metric.startsWith('total') ? current?.totals : current?.metrics;
        const key = metric === 'totalPoints' ? 'points' : metric === 'totalAssists' ? 'assists'
          : metric === 'totalRebounds' ? 'rebounds' : metric === 'totalMinutes' ? 'minutes' : metric;
        return bucket?.[key];
      });
      const summary = summarizeDistribution(values);
      trajectories[metric].push({ seasonStartYear, season: seasonLabel(seasonStartYear), ...summary, totalRuns: completedRuns });
    }
    for (const metric of CAREER_METRICS) {
      const values = paths.map(path => path.seasons[step - 1]?.productionRatesPer36?.[metric]);
      const summary = summarizeDistribution(values);
      rateTrajectories[metric].push({ seasonStartYear, season: seasonLabel(seasonStartYear), ...summary, totalRuns: completedRuns });
    }
  }
  return { ...trajectories, productionRatesPer36: rateTrajectories };
}

function summarizeSensitivitySamples(samples, asOfSeasonStartYear, completedRuns) {
  const metrics = ['points', 'minutesPerGame', 'games'];
  return Object.fromEntries(metrics.map(metric => [metric, samples[metric].map((values, index) => {
    const seasonStartYear = asOfSeasonStartYear + index + 1;
    return {
      seasonStartYear,
      season: seasonLabel(seasonStartYear),
      ...summarizeDistribution(values),
      totalRuns: completedRuns,
    };
  })]));
}

function summarizeSurvival(paths, horizon, asOfSeasonStartYear, completedRuns, retirement) {
  const rows = [];
  for (let step = 1; step <= horizon; step += 1) {
    // A simulated placeholder with zero games/minutes is not a surviving
    // opportunity.  Count only rows that actually carry modeled production;
    // this keeps continuation bands from treating no-opportunity paths as
    // available while retaining retirement/censoring semantics separately.
    const available = paths.filter(path => {
      const row = path.seasons[step - 1];
      return row?.status === 'simulated'
        && row.opportunityStatus === 'modeled-opportunity'
        && integer(row.games, 1, CAREER_SIMULATION_POLICY.maxGamesPerSeason)
        && finite(row.minutesPerGame) && row.minutesPerGame > 0;
    }).length;
    rows.push({ seasonStartYear: asOfSeasonStartYear + step, season: seasonLabel(asOfSeasonStartYear + step),
      availableRuns: available, totalRuns: completedRuns,
      continuationRate: completedRuns ? round(available / completedRuns) : null,
      status: retirement.status === 'modeled' ? 'modeled' : 'descriptive-availability',
      note: retirement.status === 'modeled'
        ? 'Continuation uses the supplied validated annual retirement model; zero-opportunity rows are excluded.'
        : 'No retirement model was supplied; this is the share of paths with a simulated modeled opportunity (zero-opportunity rows are excluded), not a retirement probability.' });
  }
  return rows;
}

function checkCancelled(signal) {
  if (signal?.aborted) {
    const error = new Error('Career simulation cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

function simulatePaths({ target, asOfSeasonStartYear, cohort, progression, progressionBySeason = null, workload, teamContext, availability, retirement, horizon, repeats, seed, signal, onProgress, retainPaths = true, onSeason }) {
  const sharedRandom = randomStream(seed);
  const paths = [];
  let fallbackTransitions = 0;
  let weightedTransitionSteps = 0;
  let shrinkageApplications = 0;
  let workloadBoundsApplied = 0;
  let retirementStops = 0;
  let roleTransitions = 0;
  let persistentShockSteps = 0;
  let rateCoupledMetricSteps = 0;
  let availabilityShockSteps = 0;
  const conditionalMetricDraws = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  const conditionalRateDraws = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  const carryForwardNoSupport = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  const unavailableCurrentValues = Object.fromEntries(CAREER_METRICS.map(key => [key, 0]));
  let firstTransitionPoolEvidence = null;
  let completedRepeats = 0;
  try {
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      checkCancelled(signal);
      // Scheduled decisions must preserve every earlier checkpoint when the
      // horizon grows. A repeat-local stream keeps later repeats independent
      // of how many seasons a preceding repeat simulated.
      const random = progressionBySeason ? randomStream(`${seed}:repeat:${repeat + 1}`) : sharedRandom;
      let current = { ...target, metrics: { ...target.metrics }, baseMetrics: { ...target.metrics } };
      // A small repeat-level trajectory shock keeps adjacent future seasons
      // correlated.  Without this persistent draw, every season would receive
      // independent noise and long-horizon uncertainty would be understated.
      const trajectoryShock = Object.fromEntries(CAREER_METRICS.map(key => [key, normal(random)]));
      const rateTrajectoryShock = Object.fromEntries(CAREER_METRICS.map(key => [key, normal(random)]));
      const seasons = retainPaths ? [] : null;
      for (let step = 1; step <= horizon; step += 1) {
        checkCancelled(signal);
        const pool = transitionPool(cohort, current);
        if (!pool.rows.length) break;
        const dispersion = transitionPoolDispersion(pool, cohort);
        if (retainPaths && !firstTransitionPoolEvidence) {
          const exposureSupports = pool.exposureSupports.filter(value => finite(value));
          const selectionWeights = pool.weights.filter(value => finite(value) && value > 0);
          firstTransitionPoolEvidence = {
            selection: pool.selection,
            poolSize: pool.rows.length,
            metricSampleCounts: { ...pool.metricSampleCounts },
            rateSampleCounts: { ...pool.rateSampleCounts },
            metricExposureEquivalentSamples: Object.fromEntries(CAREER_METRICS.map(key => [key,
              round(pool.metricExposureEquivalentSamples[key])])),
            rateExposureEquivalentSamples: Object.fromEntries(CAREER_METRICS.map(key => [key,
              round(pool.rateExposureEquivalentSamples[key])])),
            exposureSupport: {
              minimum: exposureSupports.length ? round(Math.min(...exposureSupports)) : null,
              maximum: exposureSupports.length ? round(Math.max(...exposureSupports)) : null,
              limitedRows: exposureSupports.filter(value => value < 1).length,
              method: CAREER_SIMULATION_POLICY.transitionExposureWeighting,
            },
            selectionWeight: {
              minimum: selectionWeights.length ? round(Math.min(...selectionWeights)) : null,
              maximum: selectionWeights.length ? round(Math.max(...selectionWeights)) : null,
              method: CAREER_SIMULATION_POLICY.transitionSelection,
            },
            dispersion: transitionDispersionSummary(dispersion),
          };
        }
        if (pool.fallback) fallbackTransitions++;
        weightedTransitionSteps++;
        const transition = sampleTransition(pool, random);
        const currentProgression = stateProgression(progressionBySeason ? progressionProfile(progressionBySeason[step - 1]) : progression, current);
        const innovationDiagnostics = { workload: {}, metricDeltas: {}, rateDeltas: {} };
        const minutesPlan = transitionInnovationPlan(pool, candidate => {
          const delta = shrinkTransitionDelta(candidate.minutesDelta, 'minutesPerGame', cohort, pool.rows.length);
          return progressionAdjustedDelta(delta, currentProgression);
        }, dispersion.minutes.standardDeviation * currentProgression.volatility);
        const sampledMinutesDelta = finite(transition.minutesDelta)
          ? progressionAdjustedDelta(shrinkTransitionDelta(transition.minutesDelta, 'minutesPerGame', cohort, pool.rows.length), currentProgression)
          : null;
        innovationDiagnostics.workload.minutesPerGame = innovationPlanSummary(minutesPlan);
        const gamesPlan = transitionInnovationPlan(pool, candidate => {
          const delta = shrinkTransitionDelta(candidate.gamesDelta, 'games', cohort, pool.rows.length);
          return progressionAdjustedDelta(delta, currentProgression);
        }, dispersion.games.standardDeviation * currentProgression.volatility);
        const sampledGamesDelta = finite(transition.gamesDelta)
          ? progressionAdjustedDelta(shrinkTransitionDelta(transition.gamesDelta, 'games', cohort, pool.rows.length), currentProgression)
          : null;
        innovationDiagnostics.workload.games = innovationPlanSummary(gamesPlan);
        let nextMinutes = workload.mode === 'custom' ? workload.minutesPerGame
          : finite(current.minutesPerGame) && finite(sampledMinutesDelta)
            ? clamp(round(Math.max(0, current.minutesPerGame + applyTransitionInnovationPlan(minutesPlan, sampledMinutesDelta, random))), 0, CAREER_SIMULATION_POLICY.maxMinutesPerGame)
            : current.minutesPerGame;
        let nextGames = workload.mode === 'custom' ? workload.gamesPerSeason
          : integer(current.games) && finite(sampledGamesDelta)
            ? Math.round(clamp(current.games + applyTransitionInnovationPlan(gamesPlan, sampledGamesDelta, random), 0, CAREER_SIMULATION_POLICY.maxGamesPerSeason))
            : current.games;
        if (workload.mode === 'observed') {
          const expansion = CAREER_SIMULATION_POLICY.maxWorkloadExpansion;
          if (finite(current.minutesPerGame) && current.minutesPerGame > 0 && finite(nextMinutes)) {
            const bounded = clamp(nextMinutes, current.minutesPerGame / expansion, current.minutesPerGame * expansion);
            if (bounded !== nextMinutes) workloadBoundsApplied++;
            nextMinutes = round(bounded);
          }
          if (integer(current.games, 1) && integer(nextGames)) {
            const bounded = Math.round(clamp(nextGames, current.games / expansion, current.games * expansion));
            if (bounded !== nextGames) workloadBoundsApplied++;
            nextGames = bounded;
          }
        }
        if (availability.status === 'modeled' && integer(nextGames)) {
          const adjustedGames = nextGames * availability.gamesMultiplier;
          const noisyGames = availability.gamesStandardDeviation > 0
            ? adjustedGames + normal(random) * availability.gamesStandardDeviation : adjustedGames;
          const boundedGames = Math.round(clamp(noisyGames, 0, CAREER_SIMULATION_POLICY.maxGamesPerSeason));
          if (boundedGames !== Math.round(clamp(adjustedGames, 0, CAREER_SIMULATION_POLICY.maxGamesPerSeason))) availabilityShockSteps++;
          nextGames = boundedGames;
        }
        const transitionComponentSources = {};
        const nextBaseMetrics = Object.fromEntries(CAREER_METRICS.map(key => {
          if (!finite(current.baseMetrics[key])) {
            transitionComponentSources[key] = 'unavailable-no-current-value';
            unavailableCurrentValues[key] += 1;
            return [key, null];
          }
          const priorRate = metricPer36(current.baseMetrics, current.minutesPerGame, key);
          const rateDeviation = dispersion.rateDeltas[key].standardDeviation;
          const rateBranchEligible = finite(priorRate) && finite(nextMinutes)
            && nextMinutes >= CAREER_SIMULATION_POLICY.minimumRateMinutesPerGame;
          const hasRateSupport = finite(pool.rateSampleCounts?.[key]) && pool.rateSampleCounts[key] > 0;
          const useRate = rateBranchEligible && hasRateSupport && finite(rateDeviation);
          if (useRate) {
            const rateTransition = finite(transition.metricRateDelta?.[key]) ? transition
              : sampleTransitionComponent(pool, candidate => finite(candidate.metricRateDelta?.[key]), random);
            if (!rateTransition) {
              transitionComponentSources[key] = 'carry-forward-no-support';
              carryForwardNoSupport[key] += 1;
              innovationDiagnostics.rateDeltas[key] = innovationPlanSummary(transitionInnovationPlan(pool, () => null, 0));
              return [key, current.baseMetrics[key]];
            }
            const source = rateTransition === transition ? 'selected-rate-transition' : 'conditional-rate-pool';
            transitionComponentSources[key] = source;
            if (source === 'conditional-rate-pool') conditionalRateDraws[key] += 1;
            const rateDelta = rateTransition.metricRateDelta[key];
            const ratePlan = transitionInnovationPlan(pool, candidate => {
              if (!finite(candidate.metricRateDelta?.[key])) return null;
              const candidateDelta = shrinkTransitionRateDelta(candidate.metricRateDelta[key], key, cohort, pool.rows.length,
                pool.rateExposureEquivalentSamples?.[key]);
              return progressionAdjustedDelta(candidateDelta, currentProgression, CAREER_METRIC_DIRECTIONS[key]);
            }, rateDeviation * currentProgression.volatility,
            candidate => finite(candidate.metricRateDelta?.[key]));
            const selectedRateDelta = progressionAdjustedDelta(
              shrinkTransitionRateDelta(rateDelta, key, cohort, pool.rows.length, pool.rateExposureEquivalentSamples?.[key]),
              currentProgression, CAREER_METRIC_DIRECTIONS[key]);
            const delta = applyTransitionInnovationPlan(ratePlan, selectedRateDelta, random, rateTrajectoryShock[key], step);
            if (ratePlan.residualStandardDeviation > 0 && step > 0) persistentShockSteps++;
            innovationDiagnostics.rateDeltas[key] = innovationPlanSummary(ratePlan);
            const nextRate = round(Math.max(0, priorRate + (finite(delta) ? delta : 0)));
            rateCoupledMetricSteps++;
            return [key, round(nextRate * nextMinutes / 36)];
          }
          const hasMetricSupport = finite(pool.metricSampleCounts?.[key]) && pool.metricSampleCounts[key] > 0;
          if (!hasMetricSupport) {
            transitionComponentSources[key] = 'carry-forward-no-support';
            carryForwardNoSupport[key] += 1;
            innovationDiagnostics.metricDeltas[key] = innovationPlanSummary(transitionInnovationPlan(pool, () => null, 0));
            return [key, current.baseMetrics[key]];
          }
          const metricTransition = finite(transition.metricDelta?.[key]) ? transition
            : sampleTransitionComponent(pool, candidate => finite(candidate.metricDelta?.[key]), random);
          if (!metricTransition) {
            transitionComponentSources[key] = 'carry-forward-no-support';
            carryForwardNoSupport[key] += 1;
            innovationDiagnostics.metricDeltas[key] = innovationPlanSummary(transitionInnovationPlan(pool, () => null, 0));
            return [key, current.baseMetrics[key]];
          }
          const source = metricTransition === transition ? 'selected-metric-transition' : 'conditional-metric-pool';
          transitionComponentSources[key] = source;
          if (source === 'conditional-metric-pool') conditionalMetricDraws[key] += 1;
          const metricPlan = transitionInnovationPlan(pool, candidate => {
            if (!finite(candidate.metricDelta?.[key])) return null;
            const candidateDelta = shrinkTransitionDelta(candidate.metricDelta[key], key, cohort, pool.rows.length,
              pool.metricExposureEquivalentSamples?.[key]);
            return progressionAdjustedDelta(candidateDelta, currentProgression, CAREER_METRIC_DIRECTIONS[key]);
          }, dispersion.metricDeltas[key].standardDeviation * currentProgression.volatility);
          const selectedMetricDelta = finite(metricTransition.metricDelta[key])
            ? progressionAdjustedDelta(shrinkTransitionDelta(metricTransition.metricDelta[key], key, cohort, pool.rows.length,
              pool.metricExposureEquivalentSamples?.[key]), currentProgression, CAREER_METRIC_DIRECTIONS[key])
            : null;
          const delta = applyTransitionInnovationPlan(metricPlan, selectedMetricDelta, random, trajectoryShock[key], step);
          if (finite(delta) && metricPlan.residualStandardDeviation > 0 && step > 0) persistentShockSteps++;
          innovationDiagnostics.metricDeltas[key] = innovationPlanSummary(metricPlan);
          const nextValue = round(Math.max(0, current.baseMetrics[key] + (finite(delta) ? delta : 0)));
          return [key, nextValue];
        }));
        if (retainPaths && firstTransitionPoolEvidence && !firstTransitionPoolEvidence.innovationAdjustment) {
          firstTransitionPoolEvidence.innovationAdjustment = {
            method: CAREER_SIMULATION_POLICY.transitionInnovation,
            persistentInnovationShare: CAREER_SIMULATION_POLICY.persistentInnovationShare,
            workload: innovationDiagnostics.workload,
            metricDeltas: innovationDiagnostics.metricDeltas,
            rateDeltas: innovationDiagnostics.rateDeltas,
          };
        }
        shrinkageApplications += Object.values(transitionComponentSources)
          .some(source => source?.startsWith('selected-') || source?.startsWith('conditional-')) ? 1 : 0;
        const contextMetrics = applyContext(nextBaseMetrics, teamContext);
        const outputMetrics = finite(nextMinutes) && nextMinutes > 0 && integer(nextGames, 1)
          ? contextMetrics
          : Object.fromEntries(CAREER_METRICS.map(key => [key, null]));
        const outputRatesPer36 = retainPaths
          ? finite(nextMinutes) && nextMinutes >= CAREER_SIMULATION_POLICY.minimumRateMinutesPerGame && integer(nextGames, 1)
            ? Object.fromEntries(CAREER_METRICS.map(key => [key, metricPer36(contextMetrics, nextMinutes, key)]))
            : Object.fromEntries(CAREER_METRICS.map(key => [key, null]))
          : null;
        const year = asOfSeasonStartYear + step;
        const nextState = {
          ...current,
          age: round(current.age + 1),
          experience: current.experience + 1,
          stage: stageForExperience(current.experience + 1) || current.stage,
          minutesPerGame: nextMinutes,
          games: nextGames,
          baseMetrics: nextBaseMetrics,
          metrics: contextMetrics,
        };
        nextState.roleState = roleStateFor(nextState);
        const retire = retirement.status === 'modeled' && random() < retirement.annualProbability;
        const emittedRoleState = retire ? 'out' : nextState.roleState;
        if (emittedRoleState !== current.roleState) roleTransitions++;
        if (retainPaths) {
          const row = {
            seasonStartYear: year,
            season: year === null ? `Future ${step}` : seasonLabel(year),
            status: retire ? 'retired' : 'simulated',
            source: 'model-estimate',
            age: nextState.age,
            experience: nextState.experience,
            stage: nextState.stage,
            roleState: emittedRoleState,
            teamContext: teamContext.label,
            role: teamContext.role,
            transitionComponentSources: { ...transitionComponentSources },
            minutesPerGame: retire ? null : nextState.minutesPerGame,
            games: retire ? null : nextState.games,
            metrics: retire ? Object.fromEntries(CAREER_METRICS.map(key => [key, null])) : outputMetrics,
            productionRatesPer36: retire ? Object.fromEntries(CAREER_METRICS.map(key => [key, null])) : outputRatesPer36,
            opportunityStatus: retire ? 'retired' : Object.values(outputMetrics).some(finite) ? 'modeled-opportunity' : 'no-modeled-opportunity',
            totals: retire ? Object.fromEntries(['points', 'assists', 'rebounds', 'minutes'].map(key => [key, null])) : {
              ...Object.fromEntries(['points', 'assists', 'rebounds'].map(key => [key, finite(outputMetrics[key]) && integer(nextState.games) ? round(outputMetrics[key] * nextState.games) : null])),
              minutes: finite(nextState.minutesPerGame) && integer(nextState.games, 1)
                ? round(nextState.minutesPerGame * nextState.games) : null,
            },
            continuationProbability: retirement.status === 'modeled' ? round(1 - retirement.annualProbability) : null,
            retirementTreatment: retirement.status === 'modeled' ? 'validated-retirement-model' : 'retirement-not-modeled',
          };
          seasons.push(row);
        } else {
          onSeason?.({
            repeat: repeat + 1,
            step: step - 1,
            points: retire ? null : outputMetrics.points,
            minutesPerGame: retire ? null : nextState.minutesPerGame,
            games: retire ? null : nextState.games,
          });
        }
        current = nextState;
        if (retire) { retirementStops++; break; }
      }
      if (retainPaths) paths.push({ repeat: repeat + 1, seasons });
      completedRepeats = repeat + 1;
      onProgress?.({ completedRepeats, totalRepeats: repeats });
    }
  } catch (error) {
    if (error?.name === 'AbortError') error.completedRepeats = completedRepeats;
    throw error;
  }
  return { paths, fallbackTransitions, weightedTransitionSteps, shrinkageApplications, workloadBoundsApplied, retirementStops,
    roleTransitions, persistentShockSteps, rateCoupledMetricSteps, availabilityShockSteps, conditionalMetricDraws,
    conditionalRateDraws, carryForwardNoSupport, unavailableCurrentValues, firstTransitionPoolEvidence, completedRepeats };
}

function sensitivity({ target, cohort, progression, workload, teamContext, availability, retirement, horizon, repeats, seed, signal }) {
  const modes = progression.mode === 'custom' ? ['conservative', 'typical', 'decline'] : ['conservative', 'typical', 'breakout', 'decline'];
  return modes.map(mode => {
    checkCancelled(signal);
    const profile = progressionProfile(mode);
    const maxRepeats = Math.min(repeats, 100);
    const samples = Object.fromEntries(['points', 'minutesPerGame', 'games'].map(metric => [
      metric,
      Array.from({ length: horizon }, () => []),
    ]));
    const result = simulatePaths({ target, asOfSeasonStartYear: target.asOfSeasonStartYear, cohort, progression: profile, workload, teamContext, availability, retirement,
      horizon, repeats: maxRepeats, seed: `${seed}:${mode}`, signal, onProgress: null, retainPaths: false,
      onSeason: sample => {
        for (const metric of ['points', 'minutesPerGame', 'games']) samples[metric][sample.step].push(sample[metric]);
      } });
    const trajectories = summarizeSensitivitySamples(samples, target.asOfSeasonStartYear, result.completedRepeats);
    return { mode, trajectories: { points: trajectories.points, minutesPerGame: trajectories.minutesPerGame, games: trajectories.games }, note: 'Same as-of state, cohort, horizon, and bounded seed family; only the progression policy changes.' };
  });
}

/**
 * Run a seeded career simulation from an explicit frozen as-of timeline.
 *
 * The function returns a truthful unavailable/cancelled result when the
 * accepted cohort or model inputs cannot support a future path. It never
 * fills missing observed metrics with zero and never labels archive censoring
 * as retirement.
 */
export function simulateCareer({
  timeline,
  targetPlayerId = null,
  asOfSeasonStartYear,
  asOfStage,
  asOfAge,
  asOfExperience,
  asOfState: explicitAsOfState,
  cohort,
  progression = 'typical',
  progressionBySeason,
  customProgression,
  workload,
  teamContext,
  availabilityModel,
  retirementModel,
  horizon = 5,
  repeats = 100,
  seed = 'career-simulation',
  milestones,
  milestoneCalibration,
  signal,
  onProgress,
} = {}) {
  if (!object(timeline) || !Array.isArray(timeline.rows) || timeline.asOf?.frozen !== true) {
    throw new Error('Career simulation requires a timeline frozen at an explicit as-of season.');
  }
  const cutoff = requireIntegerRange(asOfSeasonStartYear ?? timeline.asOf.seasonStartYear, 1947, 2200, 'As-of season start year');
  if (timeline.asOf.seasonStartYear !== cutoff) throw new Error('Timeline and simulation as-of seasons do not match.');
  if (timeline.rows.some(row => !integer(row?.seasonStartYear) || row.seasonStartYear > cutoff)) {
    throw new Error('Career simulation timeline contains rows after the explicit as-of season. Rebuild it with the cutoff applied.');
  }
  const seenTimelineSeasons = new Set();
  for (let index = 0; index < timeline.rows.length; index += 1) {
    const seasonStartYear = Number(timeline.rows[index].seasonStartYear);
    if (seenTimelineSeasons.has(seasonStartYear)) {
      throw new Error('Career simulation timeline contains duplicate season rows.');
    }
    if (index > 0 && seasonStartYear < Number(timeline.rows[index - 1].seasonStartYear)) {
      throw new Error('Career simulation timeline rows must be chronologically ordered.');
    }
    seenTimelineSeasons.add(seasonStartYear);
  }
  const target = resolveAsOfState(timeline, { asOfSeasonStartYear: cutoff, asOfStage, asOfAge, asOfExperience, state: explicitAsOfState });
  target.asOfSeasonStartYear = cutoff;
  const targetId = text(targetPlayerId) || null;
  const integrityReason = cohortIntegrityReason(cohort, cutoff);
  const bindingReason = integrityReason || cohortBindingReason(cohort, target, targetId, cutoff);
  if (!object(cohort) || cohort.status !== 'ready' || cohort.asOfSeasonStartYear !== cutoff
    || !Array.isArray(cohort.transitions) || !cohort.transitions.length || bindingReason) {
    const reason = bindingReason || ((cohort?.asOfSeasonStartYear !== undefined && cohort.asOfSeasonStartYear !== cutoff)
      ? 'The accepted comparable cohort was built for a different as-of season.'
      : cohort?.reason || 'An accepted comparable cohort with contiguous transitions is required.');
    return {
      version: CAREER_SIMULATION_POLICY.version,
      status: 'unavailable',
      reason,
      asOfSeasonStartYear: cutoff,
      observedToDate: timeline.rows,
      simulated: [],
      censoring: { target: 'unknown', cohort: cohort?.censoring || {} },
      milestoneReport: { status: 'unavailable-uncalibrated', probabilities: [] },
      assumptions: ['No future path was generated because the accepted career-history cohort was insufficient.'],
    };
  }
  const policy = progressionProfile(progression, customProgression);
  const boundedHorizon = requireIntegerRange(horizon, 1, CAREER_SIMULATION_POLICY.maxHorizon, 'Simulation horizon');
  const seasonPolicies = normalizeProgressionBySeason(progressionBySeason, boundedHorizon);
  const boundedRepeats = requireIntegerRange(repeats, CAREER_SIMULATION_POLICY.minRepeats, CAREER_SIMULATION_POLICY.maxRepeats, 'Simulation repeats');
  const replaySeed = requireSeed(seed);
  const workloadPolicy = normalizeWorkload(workload, target);
  const contextPolicy = normalizeTeamContext(teamContext);
  const availability = normalizeAvailabilityModel(availabilityModel);
  const retirement = normalizeRetirementModel(retirementModel);
  const requestedMilestones = normalizeMilestones(milestones);
  const calibration = normalizeCalibration(milestoneCalibration);
  if (target.metrics.points === null && target.metrics.assists === null && target.metrics.rebounds === null) {
    return {
      version: CAREER_SIMULATION_POLICY.version,
      status: 'unavailable',
      reason: 'No observed production metric is available at the explicit as-of point.',
      asOfSeasonStartYear: cutoff,
      observedToDate: timeline.rows,
      simulated: [],
      censoring: { target: 'unknown', cohort: cohort.censoring },
      milestoneReport: { status: 'unavailable-uncalibrated', probabilities: [] },
      assumptions: ['No future path was generated because the as-of record has no usable production metric.'],
    };
  }
  let result, sensitivityReport;
  try {
    checkCancelled(signal);
    result = simulatePaths({ target, asOfSeasonStartYear: cutoff, cohort, progression: policy, progressionBySeason: seasonPolicies, workload: workloadPolicy, teamContext: contextPolicy,
      availability, retirement, horizon: boundedHorizon, repeats: boundedRepeats, seed: replaySeed, signal, onProgress });
    // The sensitivity pass is part of this run's receipt.  Honor a late abort
    // here too, rather than returning a complete-looking report after the
    // user has cancelled its remaining work.
    checkCancelled(signal);
    sensitivityReport = seasonPolicies ? [] : sensitivity({ target, cohort, progression: policy, workload: workloadPolicy, teamContext: contextPolicy,
      availability, retirement, horizon: boundedHorizon, repeats: boundedRepeats, seed: replaySeed, signal });
    checkCancelled(signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { version: CAREER_SIMULATION_POLICY.version, status: 'cancelled', seed: replaySeed,
        completedRepeats: result?.completedRepeats ?? error.completedRepeats ?? 0,
        asOfSeasonStartYear: cutoff, observedToDate: timeline.rows, simulated: [],
        assumptions: ['The run was cancelled before a complete future distribution, including its sensitivity receipt, was available.'] };
    }
    throw error;
  }
  // Derive the target disclosure from every observed row at the frozen cutoff,
  // not just the last row.  A dated retirement or explicit archive boundary
  // can occur before a later observed row, and silently reducing that history
  // to the last label makes the censoring receipt depend on row ordering.
  const targetCensoring = censoringFor({}, timeline, cutoff);
  const summary = summarizePaths(result.paths, boundedHorizon, cutoff, result.paths.length);
  const milestonesReport = milestoneReport(result.paths, requestedMilestones, calibration, result.paths.length);
  const conditionalTransitionDrawCount = Object.values(result.conditionalMetricDraws)
    .reduce((sum, count) => sum + count, 0) + Object.values(result.conditionalRateDraws)
    .reduce((sum, count) => sum + count, 0);
  const noSupportCarryForwardCount = Object.values(result.carryForwardNoSupport)
    .reduce((sum, count) => sum + count, 0);
  const assumptions = [
    'Observed rows at or before the explicit as-of season are frozen; later rows are excluded from the target state.',
    'Future paths are model estimates derived from accepted comparator transitions, not observed facts.',
    seasonPolicies ? 'Each future season uses its selected progression policy. Earlier modeled state carries into later seasons within each seeded path; no observed future row is used.' : null,
    'Comparator transitions are weighted by as-of role, age, experience, workload, and observed production similarity; every accepted transition retains a non-zero chance.',
    `Transition selection, cohort moments, and production shrinkage use minimum-endpoint games plus cumulative minutes (square-root support; 82-game, ${CAREER_SIMULATION_POLICY.transitionExposureReferenceMinutes}-minute reference; ${CAREER_SIMULATION_POLICY.transitionExposureFloor.toFixed(2)} floor). Limited-exposure arcs remain eligible, but contribute less to the prior and effective sample size.`,
    'Comparator rows with conflicting age or experience evidence are excluded from anchors and transitions; no conflict is resolved by interpolation.',
    'Observed transition deltas are shrunk toward the accepted cohort mean according to available transition exposure before progression noise is applied.',
    `When comparable rows provide at least ${CAREER_SIMULATION_POLICY.minimumRateMinutesPerGame} minutes per game, production transitions are modeled per 36 minutes and then converted through the modeled workload; unsupported rate evidence falls back to the observed per-game transition.`,
    `The selected transition supplies empirical outcome dispersion. Its progression-adjusted deviations are rescaled around their conditional mean when they exceed the selected posterior SD; independent residual noise fills only any remaining variance (prior strength ${CAREER_SIMULATION_POLICY.transitionDispersionPriorStrength}). The repeat-level shock allocates ${Math.round(CAREER_SIMULATION_POLICY.persistentInnovationShare * 100)}% of that residual SD to adjacent-season correlation without increasing marginal variance. Workload and nonnegative-output bounds can narrow realized variance.`,
    conditionalTransitionDrawCount > 0
      ? 'When the shared transition lacks a metric component, that component is conditionally drawn from finite deltas in the same cutoff-safe weighted pool and exposure-shrunk; cross-metric dependence is not preserved for conditionally drawn components.' : null,
    noSupportCarryForwardCount > 0
      ? 'A metric with no finite delta in the selected pool is explicitly carried forward without an invented prior residual.' : null,
    'Progression and regression multipliers follow each metric\'s benefit direction; lower turnover deltas are improvements, while higher turnover deltas are regressions.',
    'Role state is derived from modeled minutes, availability, and observed production thresholds; it is a descriptive state label, not a hidden coaching or injury explanation.',
    'Progression and regression strength changes with the modeled career stage and a bounded age curve; this is a transparent model curve, not a hidden injury or coaching story.',
    `Observed workload paths are bounded to at most ${CAREER_SIMULATION_POLICY.maxWorkloadExpansion.toFixed(2)}× the prior season before availability adjustments.`,
    'Season gaps interrupt transitions and remain gaps; no zero season or missing metric is inferred.',
    workloadPolicy.mode === 'custom' ? 'Custom workload is bounded by the declared minutes/games envelope.' : 'Observed workload transitions are descriptive availability evidence, not an injury explanation.',
    target.stage === 'prospect' ? 'Prospect paths use accepted rookie transition rows; no pre-draft production or evaluation outcome is inferred.' : null,
    contextPolicy.note,
    availability.status === 'modeled'
      ? availability.gamesStandardDeviation > 0
        ? `Availability uses the supplied validated model with seeded games dispersion of ${availability.gamesStandardDeviation.toFixed(2)} games; this is not an injury attribution.`
        : 'Availability uses the supplied validated model without additional games dispersion.'
      : 'No injury or availability model was supplied; availability is not attributed to injuries.',
    retirement.status === 'modeled' ? 'Retirement uses the supplied validated model.' : 'Archive-edge censoring is not treated as retirement; no retirement path was modeled or inferred in this run.',
  ];
  const report = {
    version: CAREER_SIMULATION_POLICY.version,
    status: 'complete',
    seed: replaySeed,
    repeats: boundedRepeats,
    horizon: boundedHorizon,
    asOf: { seasonStartYear: cutoff, stage: target.stage, age: target.age, experience: target.experience, targetPlayerId: targetId,
      excludedFutureRows: timeline.asOf.futureRowsExcluded || 0 },
    observedToDate: timeline.rows,
    targetState: target,
    progression: policy,
    progressionBySeason: seasonPolicies,
    workload: workloadPolicy,
    availability,
    teamContext: contextPolicy,
    paths: result.paths,
    trajectories: summary,
    survival: summarizeSurvival(result.paths, boundedHorizon, cutoff, result.paths.length, retirement),
    comparableArcs: cohort.comparables,
    cohort: { status: cohort.status, comparables: cohort.comparables.length, transitions: cohort.transitions.length, skipped: cohort.skipped, censoring: cohort.censoring },
    censoring: { target: normalizeCensoring(targetCensoring), cohort: cohort.censoring,
      note: 'Archive-edge and unknown rows are retained as censoring disclosures; they do not become retirements.' },
    retirement: retirement.status === 'modeled' ? retirement : { ...retirement, note: 'Retirement was not modeled or inferred from archive coverage.' },
    milestoneReport: milestonesReport,
    sensitivity: sensitivityReport,
    diagnostics: { fallbackTransitionSteps: result.fallbackTransitions, weightedTransitionSteps: result.weightedTransitionSteps,
      shrinkageApplications: result.shrinkageApplications,
      shrinkageApplicationsUnit: 'simulated-path-steps-with-at-least-one-supported-production-component',
      transitionSelection: CAREER_SIMULATION_POLICY.transitionSelection,
      transitionExposureWeighting: CAREER_SIMULATION_POLICY.transitionExposureWeighting,
      transitionShrinkage: CAREER_SIMULATION_POLICY.transitionShrinkage,
      transitionDispersion: CAREER_SIMULATION_POLICY.transitionDispersion,
      transitionInnovation: CAREER_SIMULATION_POLICY.transitionInnovation,
      persistentInnovationShare: CAREER_SIMULATION_POLICY.persistentInnovationShare,
      stageCurve: CAREER_SIMULATION_POLICY.stageCurve,
      ageCurve: CAREER_SIMULATION_POLICY.ageCurve,
      metricProgressionDirection: CAREER_SIMULATION_POLICY.metricProgressionDirection,
      workloadBoundsApplied: result.workloadBoundsApplied,
      retirementStops: result.retirementStops,
      roleTransitions: result.roleTransitions,
      persistentShockSteps: result.persistentShockSteps,
      availabilityShockSteps: result.availabilityShockSteps,
      rateCoupledMetricSteps: result.rateCoupledMetricSteps,
      conditionalTransitionComponents: {
        method: 'same-cutoff-safe-weighted-pool-component-resampling-v1',
        metricDeltas: { ...result.conditionalMetricDraws },
        rateDeltas: { ...result.conditionalRateDraws },
        carryForwardNoSupport: { ...result.carryForwardNoSupport },
        unavailableCurrentValues: { ...result.unavailableCurrentValues },
        crossMetricDependencePreserved: false,
        note: 'Only a missing component is conditionally drawn; its cross-metric dependence on the shared transition is not preserved.',
      },
      transitionPoolEvidence: result.firstTransitionPoolEvidence,
      metricTrajectory: CAREER_SIMULATION_POLICY.metricTrajectory,
      roleStateModel: CAREER_SIMULATION_POLICY.roleState,
      noHindsightLeakage: timeline.asOf.frozen === true
        && timeline.rows.every(row => row.seasonStartYear <= cutoff)
        && cohort.asOfSeasonStartYear === cutoff
        && cohort.comparables.every(row => row.futureRowsExcluded >= 0
          && row.observedRows.every(observedRow => observedRow.seasonStartYear <= cutoff)) },
    assumptions: assumptions.filter(Boolean),
    note: 'Observed history and simulated future are separate layers. This result is not a player grade, injury story, coaching explanation, or guaranteed career outcome.',
  };
  return Object.freeze(report);
}

export { resolveAsOfState as resolveCareerAsOfState };

import { sampleEvidence, validStudioScope } from './studio-analysis.js?v=20260920c&rev=swishiq-engine-v1';
import { swishIqContextDescriptor } from './context-contract.js?v=20260920c';

export const GAME_LAB_POLICY = Object.freeze({ version: 'swishiq-possession-scenario-v3', outcomeModel: 'maximum-entropy-bounded-possession-v4-event-reconciled-stochastic-overtime',
  overtimePossessionRounding: 'seeded-stochastic-five-minute-equivalent-v1', seasons: Object.freeze([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]),
  minSidePossessions: 200, minPossessions: 60, maxPossessions: 140, minTrials: 100, maxTrials: 5000, maxOvertimes: 6,
  regulationMinutes: 48, overtimeMinutes: 5, minExpectedPpp: 0.45, maxExpectedPpp: 1.65 });
export const GAME_LAB_MATCHUP_POLICY = Object.freeze({
  version: 'swishiq-game-lab-matchup-v3',
  outcomeModel: 'maximum-entropy-over-0-to-3-blended-ppp-v3-stochastic-overtime',
  scoringEventRule: 'maximum-entropy-over-0-to-3-points-at-final-blended-ppp-v1',
});
const count = value => Number.isSafeInteger(value) && value >= 0;
const round = value => Math.round(value * 10000) / 10000;
const validSeed = value => typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,80}$/.test(value);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const EVENT_KEYS = Object.freeze(['zero', 'one', 'two', 'three']);

// Game and League selectors store the NBA season's start year (for example,
// 2024 represents 2024–25). The package registry addresses that same season
// by its end year, so keep this conversion at the package boundary only.
export function seasonEndYearForStartYear(seasonStartYear) {
  const year = Number(seasonStartYear);
  if (!Number.isSafeInteger(year) || !GAME_LAB_POLICY.seasons.includes(year)) {
    throw new Error('Choose a supported game season.');
  }
  return year + 1;
}

function seedNumber(seed) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
function randomStream(seed) {
  let value = seedNumber(seed);
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let bits = value;
    bits = Math.imul(bits ^ (bits >>> 15), bits | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

export function createScenarioRandom(seed) {
  if (!validSeed(seed)) throw new Error('Use a valid repeatable seed.');
  return randomStream(seed);
}

export function dailyMatchup(teams, snapshot, date) {
  if (!Array.isArray(teams) || teams.length < 2 || teams.length > 30
    || teams.some(team => !validStudioScope({ snapshot, team: team?.id }))
    || new Set(teams.map(team => team.id)).size !== teams.length) throw new Error('Load the SwishIQ team list first.');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Choose a valid challenge date.');
  const ordered = [...teams].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const seed = `game-v1-${date}-${snapshot}`, random = randomStream(seed);
  const first = Math.floor(random() * ordered.length);
  let second = Math.floor(random() * (ordered.length - 1)); if (second >= first) second++;
  return { a: ordered[first].id, b: ordered[second].id,
    season: GAME_LAB_POLICY.seasons[Math.floor(random() * GAME_LAB_POLICY.seasons.length)], seed, date, modelVersion: GAME_LAB_POLICY.version };
}

function boundedOutcomeProfile(requestedPpp) {
  const requestedExpectedPpp = Number(requestedPpp);
  const boundedExpectedPpp = clamp(requestedExpectedPpp, GAME_LAB_POLICY.minExpectedPpp, GAME_LAB_POLICY.maxExpectedPpp);
  // The package gives team PPP, not a verified possession-event shape. Use
  // the maximum-entropy categorical distribution on the existing bounded
  // 0–3 point support, constrained only by that mean; do not infer shot types
  // or turn adapted bucket counts into event probabilities.
  const probabilitiesAt = tilt => {
    const logWeights = EVENT_KEYS.map((_, points) => tilt * points);
    const offset = Math.max(...logWeights);
    const weights = logWeights.map(value => Math.exp(value - offset));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => value / total);
  };
  let lowerTilt = -40, upperTilt = 40;
  for (let iteration = 0; iteration < 72; iteration++) {
    const tilt = (lowerTilt + upperTilt) / 2;
    const probabilities = probabilitiesAt(tilt);
    const mean = probabilities.reduce((sum, probability, points) => sum + (probability * points), 0);
    if (mean < boundedExpectedPpp) lowerTilt = tilt;
    else upperTilt = tilt;
  }
  const probabilities = probabilitiesAt((lowerTilt + upperTilt) / 2);
  const expectedPpp = probabilities.reduce((sum, probability, points) => sum + (probability * points), 0);
  let cumulative = 0;
  const outcomes = EVENT_KEYS.map((key, points) => ({ key, points, probability: probabilities[points], cumulative: cumulative += probabilities[points] }));
  outcomes.at(-1).cumulative = 1;
  return {
    outcomes,
    distributionMethod: 'maximum-entropy-over-0-to-3-points',
    scoringEventRule: GAME_LAB_MATCHUP_POLICY.scoringEventRule,
    pppBounds: { floor: GAME_LAB_POLICY.minExpectedPpp, ceiling: GAME_LAB_POLICY.maxExpectedPpp },
    requestedExpectedPpp: round(requestedExpectedPpp),
    boundedExpectedPpp: round(boundedExpectedPpp),
    expectedPpp: round(expectedPpp),
    clampApplied: requestedExpectedPpp < GAME_LAB_POLICY.minExpectedPpp || requestedExpectedPpp > GAME_LAB_POLICY.maxExpectedPpp,
    realizedMinusRequested: round(expectedPpp - requestedExpectedPpp),
  };
}

export function possessionDistribution(raw, expectedPossessions) {
  const inputProvenance = raw?.inputMode === 'synthetic-team-rate-adapter'
    ? { mode: 'synthetic-team-rate-adapter', shape: 'constructed-from-team-rate-and-denominator',
      verifiedEventShape: false, adapterVersion: typeof raw.adapterVersion === 'string' ? raw.adapterVersion : null }
    : { mode: 'unclassified-bucket-counts', shape: 'provided-bucket-counts', verifiedEventShape: false, adapterVersion: null };
  const unavailable = reason => ({ status: 'unavailable', reason, outcomes: [], inputBucketOutcomes: [], inputProvenance, mean: null });
  if (!raw || !count(raw.possessions) || !Number.isSafeInteger(expectedPossessions) || raw.possessions !== expectedPossessions
    || raw.possessions < GAME_LAB_POLICY.minSidePossessions || !count(raw.points)) {
    return unavailable('This side needs at least 200 accepted possessions and a valid point total.');
  }
  const keys = ['empty', 'one', 'two', 'three', 'fourPlus'];
  if (keys.some(key => !count(raw.counts?.[key]))
    || keys.reduce((sum, key) => sum + raw.counts[key], 0) !== raw.possessions) {
    return unavailable('The possession outcome counts do not reconcile to the sample.');
  }
  const tailCount = raw.counts.fourPlus;
  const tailPoints = raw.points - raw.counts.one - 2 * raw.counts.two - 3 * raw.counts.three;
  if (tailPoints < 4 * tailCount || (!tailCount && tailPoints !== 0) || tailPoints > 20 * tailCount) {
    return unavailable('The point total does not reconcile to the bounded possession outcomes.');
  }
  const weights = new Map(keys.slice(0, 4).map((key, points) => [points, raw.counts[key] / raw.possessions]));
  // The input format has one 4+ bucket. Two neighboring integer totals preserve the
  // input mean without claiming that its unavailable tail shape is known.
  const tailMean = tailCount ? tailPoints / tailCount : null;
  if (tailCount) {
    const lower = Math.floor(tailMean), fraction = tailMean - lower, mass = tailCount / raw.possessions;
    weights.set(lower, mass * (1 - fraction));
    if (fraction > 0) weights.set(lower + 1, mass * fraction);
  }
  const inputMean = raw.points / raw.possessions;
  const inputBucketOutcomes = [...weights].filter(([, probability]) => probability > 0)
    .map(([points, probability]) => ({ points, probability }));
  const simulation = boundedOutcomeProfile(inputMean);
  return { status: 'ready', possessions: raw.possessions, points: raw.points, mean: inputMean,
    inputMean, observedMean: inputMean, simulationMean: simulation.expectedPpp, boundedMean: simulation.boundedExpectedPpp,
    // `outcomes` stays as a generic compatibility alias; the explicit name is
    // preferred because these buckets may be synthetic or otherwise unverified.
    outcomes: inputBucketOutcomes, inputBucketOutcomes, inputProvenance,
    simulationOutcomes: simulation.outcomes, boundedOutcomes: simulation.outcomes,
    outcomeProfile: simulation, tailCount, tailMean,
    reconciliation: { status: 'reconciled', possessions: raw.possessions,
      eventCount: keys.reduce((sum, key) => sum + raw.counts[key], 0), points: raw.points,
      eventPoints: raw.points, delta: 0 },
    reason: 'Supplied possession buckets reconcile to the point total, but their event shape is unverified. Simulation uses the maximum-entropy 0–3 point distribution from the bounded mean only; shot-level outcomes and the 4+ tail are not inferred.' };
}

export function teamGameEvidence(payload, season) {
  if (!validStudioScope(payload) || !GAME_LAB_POLICY.seasons.includes(season)
    || !Array.isArray(payload.contexts) || payload.contexts.length > 64) throw new Error('Choose a supported team, snapshot and game season.');
  const keys = new Set();
  for (const row of payload.contexts) {
    if (!swishIqContextDescriptor(row?.key) || keys.has(row.key)) throw new Error('Team context evidence is unsupported or duplicated.');
    keys.add(row.key);
  }
  const row = payload.contexts.find(row => row.key === `season:${season}`);
  const sample = sampleEvidence(row);
  const offense = possessionDistribution(row?.outcomes?.offense, sample.offensePossessions);
  const defense = possessionDistribution(row?.outcomes?.defense, sample.defensePossessions);
  const ready = sample.status === 'observed' && offense.status === 'ready' && defense.status === 'ready'
    && Math.abs(offense.mean * 100 - sample.offensiveRating) <= 0.011
    && Math.abs(defense.mean * 100 - sample.defensiveRating) <= 0.011;
  return { snapshot: payload.snapshot, team: payload.team, season, sample, offense, defense,
    status: ready ? 'ready' : 'unavailable', reason: ready ? 'Recorded scoring and points-allowed samples reconcile.'
      : !row ? 'No validated possession inputs are available for this team and season.'
        : offense.status !== 'ready' ? offense.reason : defense.status !== 'ready' ? defense.reason
          : 'Sample ratings and supplied bucket counts do not clear the same checks.' };
}

function blendGameLabScoringProfile(first, second, weight) {
  // The matchup controls select a rate blend, not a random choice between
  // scoring regimes. Blend the supplied PPP means first, then derive the
  // maximum-entropy 0–3 point profile for that single bounded mean.
  const observedMean = weight * first.mean + (1 - weight) * second.mean;
  const outcomeProfile = boundedOutcomeProfile(observedMean);
  return { mean: outcomeProfile.expectedPpp, observedMean,
    outcomes: outcomeProfile.outcomes, outcomeProfile };
}
function draw(distribution, random) {
  if (!distribution || !Array.isArray(distribution.outcomes) || !distribution.outcomes.length) {
    throw new Error('A non-empty possession outcome distribution is required.');
  }
  if (typeof random !== 'function') throw new Error('A seeded random stream is required.');
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('The seeded random stream must return a finite value from 0 through 1.');
  }
  // A custom stream can legitimately return exactly 1 at the floating-point
  // boundary.  Select the final bucket instead of dereferencing undefined.
  const outcome = distribution.outcomes.find(entry => value < entry.cumulative) || distribution.outcomes.at(-1);
  if (!Number.isSafeInteger(outcome.points) || outcome.points < 0) throw new Error('A possession outcome must be a non-negative integer point value.');
  return outcome.points;
}

function stochasticRoundCount(expected, random) {
  const lower = Math.floor(expected), fraction = expected - lower;
  if (fraction <= 0) return lower;
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('The seeded random stream must return a finite value from 0 through 1.');
  }
  return lower + (value < fraction ? 1 : 0);
}

function emptyEventLedger() {
  return Object.fromEntries(EVENT_KEYS.map(key => [key, 0]));
}

function recordEvent(ledger, points) {
  const key = EVENT_KEYS[points];
  if (!key) throw new Error('A possession outcome must be a non-negative integer point value.');
  ledger[key] += 1;
}

function reconcileEvents(ledger, points, possessions) {
  const eventCount = EVENT_KEYS.reduce((sum, key) => sum + ledger[key], 0);
  const eventPoints = ledger.one + (2 * ledger.two) + (3 * ledger.three);
  return { status: eventCount === possessions && eventPoints === points ? 'reconciled' : 'mismatch',
    possessions, eventCount, points, eventPoints, delta: eventPoints - points };
}

function formatReplayClock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function replayClock(index, total, minutes = GAME_LAB_POLICY.regulationMinutes) {
  return formatReplayClock((minutes * 60) * Math.max(0, 1 - (index / Math.max(1, total))));
}

function addReplayEvent(replay, { q, clock, side, points, score, type = 'play', text }) {
  replay.push({ q, clock, side, pts: points, score: [score[0], score[1]], type, text });
}

function playGame(first, second, possessions, random, keepTimeline = false) {
  let a = 0, b = 0, overtimes = 0;
  const eventsA = emptyEventLedger(), eventsB = emptyEventLedger();
  const timeline = [];
  const replay = keepTimeline ? [] : null;
  const addPossessionReplay = (q, clock, side, points, score) => {
    if (!replay) return;
    const team = side === 'home' ? 'Team A' : 'Team B';
    addReplayEvent(replay, { q, clock, side, points, score,
      text: points ? `Modeled ${team} possession: +${points}` : `Modeled ${team} possession: no points` });
  };
  for (let index = 1; index <= possessions; index++) {
    const pointsA = draw(first, random), pointsB = draw(second, random);
    a += pointsA; recordEvent(eventsA, pointsA);
    const quarter = Math.min(4, Math.ceil((index * 4) / possessions));
    const clock = replayClock(index - ((quarter - 1) * possessions / 4), possessions / 4, GAME_LAB_POLICY.regulationMinutes / 4);
    addPossessionReplay(`Q${quarter}`, clock, 'home', pointsA, [a, b]);
    b += pointsB; recordEvent(eventsB, pointsB);
    addPossessionReplay(`Q${quarter}`, clock, 'away', pointsB, [a, b]);
    if (keepTimeline && [1, 2, 3, 4].some(quarter => index === Math.round(quarter * possessions / 4))) {
      const period = `Q${timeline.length + 1}`;
      timeline.push({ period, a, b });
      addReplayEvent(replay, { q: period, clock: '0:00', side: null, points: 0, score: [a, b], type: 'period', text: `End of ${period}` });
    }
  }
  const regulation = { possessions, a, b,
    eventsA: { ...eventsA }, eventsB: { ...eventsB },
    reconciliationA: reconcileEvents(eventsA, a, possessions), reconciliationB: reconcileEvents(eventsB, b, possessions) };
  const overtimePeriods = [];
  const expectedOvertimePossessions = possessions * GAME_LAB_POLICY.overtimeMinutes / GAME_LAB_POLICY.regulationMinutes;
  // Keep the legacy integer field useful when a game does not reach overtime;
  // if it does, replace it with this game's seeded, expectation-preserving
  // integer count and use that pace consistently for every OT period.
  let overtimePossessions = Math.max(1, Math.round(expectedOvertimePossessions));
  while (a === b && overtimes < GAME_LAB_POLICY.maxOvertimes) {
    if (overtimes === 0) overtimePossessions = Math.max(1, stochasticRoundCount(expectedOvertimePossessions, random));
    overtimes++;
    const periodEventsA = emptyEventLedger(), periodEventsB = emptyEventLedger();
    let periodA = 0, periodB = 0;
    for (let index = 0; index < overtimePossessions; index++) {
      const pointsA = draw(first, random), pointsB = draw(second, random);
      periodA += pointsA; a += pointsA; recordEvent(eventsA, pointsA);
      const clock = replayClock(index + 1, overtimePossessions, GAME_LAB_POLICY.overtimeMinutes);
      addPossessionReplay(`OT${overtimes}`, clock, 'home', pointsA, [a, b]);
      periodB += pointsB; b += pointsB; recordEvent(eventsB, pointsB);
      addPossessionReplay(`OT${overtimes}`, clock, 'away', pointsB, [a, b]);
      recordEvent(periodEventsA, pointsA); recordEvent(periodEventsB, pointsB);
    }
    overtimePeriods.push({ period: `OT${overtimes}`, possessions: overtimePossessions, a: periodA, b: periodB,
      eventsA: periodEventsA, eventsB: periodEventsB,
      reconciliationA: reconcileEvents(periodEventsA, periodA, overtimePossessions),
      reconciliationB: reconcileEvents(periodEventsB, periodB, overtimePossessions) });
    if (keepTimeline) {
      const period = `OT${overtimes}`;
      timeline.push({ period, a, b });
      addReplayEvent(replay, { q: period, clock: '0:00', side: null, points: 0, score: [a, b], type: 'period', text: `End of ${period}` });
    }
  }
  const totalPossessions = possessions + (overtimes * overtimePossessions);
  const unresolved = a === b;
  if (replay) addReplayEvent(replay, {
    q: overtimes ? `OT${overtimes}` : 'Q4', clock: 'FINAL', side: null, points: 0, score: [a, b], type: 'final',
    text: unresolved ? 'Simulation ended at the overtime cap' : 'Modeled simulation complete',
  });
  return { a, b, margin: a - b, winner: unresolved ? null : a > b ? 'a' : 'b',
    resolutionStatus: unresolved ? 'unresolved' : 'decided',
    resolutionReason: unresolved ? 'overtime-cap-tie' : null,
    overtimePeriodsPlayed: overtimes, overtimePeriodLimit: GAME_LAB_POLICY.maxOvertimes,
    overtimeCapReached: unresolved && overtimes >= GAME_LAB_POLICY.maxOvertimes,
    overtimes, overtimePossessions,
    expectedOvertimePossessions, possessions: totalPossessions, regulation, overtime: overtimePeriods, eventsA, eventsB,
    reconciliationA: reconcileEvents(eventsA, a, totalPossessions), reconciliationB: reconcileEvents(eventsB, b, totalPossessions), timeline,
    ...(replay ? { pbp: replay, replay: { kind: 'modeled-possession-replay-v1', observed: false,
      disclosure: 'Seeded possession outcomes rendered as a replay; this is not observed play-by-play.' } } : {}) };
}

// Reusable validated matchup for bounded season experiments. Compile once per
// pairing, then draw games without reparsing contexts or changing the model.
export function createGameSampler({ a, b, season, possessions = 100, attackWeight = 0.5 }) {
  if (!Number.isInteger(possessions) || possessions < 60 || possessions > 140
    || !Number.isFinite(attackWeight) || attackWeight < 0 || attackWeight > 1) throw new Error('Invalid game assumptions.');
  if (a?.snapshot !== b?.snapshot || a?.team === b?.team) throw new Error('Use different teams from one SwishIQ snapshot.');
  const first = teamGameEvidence(a, season), second = teamGameEvidence(b, season);
  if (first.status !== 'ready' || second.status !== 'ready') throw new Error(first.status !== 'ready' ? first.reason : second.reason);
  const offense = blendGameLabScoringProfile(first.offense, second.defense, attackWeight);
  const defense = blendGameLabScoringProfile(second.offense, first.defense, attackWeight);
  return Object.freeze({
    metadata: Object.freeze({ modelVersion: GAME_LAB_MATCHUP_POLICY.version,
      outcomeModel: GAME_LAB_MATCHUP_POLICY.outcomeModel, scoringEventRule: GAME_LAB_MATCHUP_POLICY.scoringEventRule,
      attackWeight, outcomeProfile: Object.freeze({ a: offense.outcomeProfile, b: defense.outcomeProfile }) }),
    play(random) {
      if (typeof random !== 'function') throw new Error('A seeded random stream is required.');
      return playGame(offense, defense, possessions, random);
    },
  });
}
function quantiles(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return Object.fromEntries([10, 50, 90].map(percent => [percent, ordered[Math.max(0, Math.ceil(ordered.length * percent / 100) - 1)]]));
}
function meanStandardError(values) {
  if (!Array.isArray(values) || values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleVariance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return round(Math.sqrt(Math.max(0, sampleVariance) / values.length));
}
const MARGIN_BINS = Object.freeze([
  ['B by 20+', -Infinity, -20], ['B by 10–19', -19, -10], ['B by 1–9', -9, -1],
  ['Unresolved tie', 0, 0], ['A by 1–9', 1, 9], ['A by 10–19', 10, 19], ['A by 20+', 20, Infinity],
]);

export async function simulateMatchup({ a, b, season, seed, possessions = 100, trials = 1000, attackWeight = 0.5, format = 'game' },
  { yieldEveryBatch = async () => {}, signal, onProgress = () => {} } = {}) {
  if (!validSeed(seed) || !Number.isInteger(possessions) || possessions < GAME_LAB_POLICY.minPossessions || possessions > GAME_LAB_POLICY.maxPossessions
    || !Number.isInteger(trials) || trials < GAME_LAB_POLICY.minTrials || trials > GAME_LAB_POLICY.maxTrials
    || !Number.isFinite(attackWeight) || attackWeight < 0 || attackWeight > 1 || !['game', 'best_of_7'].includes(format)) {
    throw new Error('Use 60–140 possessions, 100–5,000 trials, an offense weight from 0 to 1, and a valid seed.');
  }
  if (a?.snapshot !== b?.snapshot || a?.team === b?.team) throw new Error('Use two different teams from the same SwishIQ snapshot.');
  const first = teamGameEvidence(a, season), second = teamGameEvidence(b, season);
  if (first.status !== 'ready' || second.status !== 'ready') throw new Error(first.status !== 'ready' ? `Team A: ${first.reason}` : `Team B: ${second.reason}`);
  const scoringA = blendGameLabScoringProfile(first.offense, second.defense, attackWeight);
  const scoringB = blendGameLabScoringProfile(second.offense, first.defense, attackWeight);
  const random = randomStream(seed), wins = { a: 0, b: 0, unresolved: 0 }, lengths = { 4: 0, 5: 0, 6: 0, 7: 0 };
  const margins = [], scoresA = [], scoresB = [];
  let example = null, sumA = 0, sumB = 0, overtimeGames = 0, gamesPlayed = 0, unresolvedGames = 0;
  for (let trial = 0; trial < trials; trial++) {
    if (signal?.aborted) throw new DOMException('Simulation cancelled.', 'AbortError');
    const seriesWins = { a: 0, b: 0 }, series = [];
    let winner = null, resolutionStatus = 'unresolved';
    for (let game = 0; game < (format === 'game' ? 1 : 7); game++) {
      const result = playGame(scoringA, scoringB, possessions, random, trial === 0 && game === 0);
      gamesPlayed++; if (result.overtimes) overtimeGames++;
      if (result.resolutionStatus === 'unresolved') unresolvedGames++;
      if (trial === 0) series.push(result);
      if (game === 0) { scoresA.push(result.a); scoresB.push(result.b); margins.push(result.margin); sumA += result.a; sumB += result.b; }
      if (format === 'game') { winner = result.winner; resolutionStatus = result.resolutionStatus; break; }
      if (result.winner === null) { resolutionStatus = 'unresolved'; break; }
      seriesWins[result.winner]++;
      if (seriesWins[result.winner] === 4) { winner = result.winner; resolutionStatus = 'decided'; lengths[game + 1]++; break; }
    }
    wins[winner || 'unresolved']++;
    if (trial === 0) example = { winner, resolutionStatus, seriesWins, games: series };
    if ((trial + 1) % 100 === 0) { onProgress((trial + 1) / trials); await yieldEveryBatch(); }
  }
  if (signal?.aborted) throw new DOMException('Simulation cancelled.', 'AbortError');
  return { status: 'complete', executionStatus: 'complete',
    outcomeCompletion: { policy: 'distribution', status: 'distribution', requiredWinnerCount: 0,
      unresolvedOutcomeCount: wins.unresolved, sampledOutcomeCount: trials,
      unresolvedGameCount: unresolvedGames },
    modelVersion: GAME_LAB_MATCHUP_POLICY.version, outcomeModel: GAME_LAB_MATCHUP_POLICY.outcomeModel,
    snapshot: a.snapshot, teams: [a.team, b.team], season, seed,
    settings: { possessions, trials, attackWeight, format, maxOvertimes: GAME_LAB_POLICY.maxOvertimes,
      regulationMinutes: GAME_LAB_POLICY.regulationMinutes, overtimeMinutes: GAME_LAB_POLICY.overtimeMinutes,
      overtimePossessionRounding: GAME_LAB_POLICY.overtimePossessionRounding,
      expectedOvertimePossessions: round(possessions * GAME_LAB_POLICY.overtimeMinutes / GAME_LAB_POLICY.regulationMinutes),
      expectedPppBounds: { floor: GAME_LAB_POLICY.minExpectedPpp, ceiling: GAME_LAB_POLICY.maxExpectedPpp },
      outcomePppBounds: { floor: GAME_LAB_POLICY.minExpectedPpp, ceiling: GAME_LAB_POLICY.maxExpectedPpp } },
    evidence: { a: first, b: second },
    expectedRegulationScore: { a: round(scoringA.mean * possessions), b: round(scoringB.mean * possessions) },
    expectedObservedRegulationScore: { a: round(scoringA.observedMean * possessions), b: round(scoringB.observedMean * possessions) },
    expectedPpp: { a: round(scoringA.mean), b: round(scoringB.mean), observedA: round(scoringA.observedMean), observedB: round(scoringB.observedMean) },
    outcomeProfile: { a: scoringA.outcomeProfile, b: scoringB.outcomeProfile },
    outcomeExpectationGap: { a: round(scoringA.mean - scoringA.observedMean), b: round(scoringB.mean - scoringB.observedMean) },
    wins, shares: Object.fromEntries(Object.entries(wins).map(([key, value]) => [key, value / trials])),
    monteCarloStandardError: Object.fromEntries(Object.entries(wins).map(([key, value]) => {
      const share = value / trials;
      return [key, round(Math.sqrt(share * (1 - share) / trials))];
    })),
    monteCarloStandardErrorA: Math.sqrt((wins.a / trials) * (1 - wins.a / trials) / trials),
    firstGame: { averageA: round(sumA / trials), averageB: round(sumB / trials),
      standardErrorA: meanStandardError(scoresA), standardErrorB: meanStandardError(scoresB),
      scoreA: quantiles(scoresA), scoreB: quantiles(scoresB), margin: quantiles(margins),
      histogram: MARGIN_BINS.map(([label, lower, upper]) => ({ label, count: margins.filter(value => value >= lower && value <= upper).length })) },
    seriesLengths: lengths, overtimeGames, gamesPlayed, example,
    note: `These frequencies are conditional on the selected input-rate blend and independent possessions. Expected scoring is bounded to ${GAME_LAB_POLICY.minExpectedPpp}–${GAME_LAB_POLICY.maxExpectedPpp} points per possession; each side's final 0–3 point outcome profile is maximum-entropy under its blended mean, and no shot profile or 4+ tail is inferred. The requested and bounded mean are included in outcomeProfile and outcomeExpectationGap. Overtime possession counts use seeded stochastic rounding to the ${GAME_LAB_POLICY.overtimeMinutes}-minute-equivalent pace (${round(possessions * GAME_LAB_POLICY.overtimeMinutes / GAME_LAB_POLICY.regulationMinutes)} expected possessions per period), up to ${GAME_LAB_POLICY.maxOvertimes}; a tie that remains after the cap is reported as unresolved. Monte Carlo error measures repetition noise only. Opponent adjustment, roster changes, fatigue, injuries, coaching, travel and parameter uncertainty are not fitted here.` };
}

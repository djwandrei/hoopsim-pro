/*
 * SwishIQ Game Lab browser workbench.
 *
 * This surface is deliberately separate from daily-board consumers. The
 * selected exact package supplies the team-style evidence used by the local
 * possession simulator. No challenge pool or player-total ranking is a
 * substitute for the matchup source.
 */

import {
  loadNativeSeasonLabSource,
  selectNativeSeasonLabPackages,
} from './season-lab.js?v=20261002b&rev=season-lab-native-v11-reviewed-v4-release-pin-v1';
import { assertSwishIqV3SourceAllowed } from './studio-runtime/modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-studio-runtime-v1';
import { nativeTeamEvidence } from './engine/season-lab-model.js?v=20261001b&rev=season-model-v26-fixed-16-team-playoffs-20261001b';
import {
  buildGameLabRollingOriginFolds,
  evaluateGameLabScoreFold,
  GAME_LAB_EVALUATION_POLICY,
  nextGameLabEvaluationTrialCount,
} from './engine/game-lab-evaluation.js?v=20261001c&rev=game-lab-evaluation-v4-adaptive-se-v1';
import {
  dailyMatchup,
  GAME_LAB_MATCHUP_POLICY,
  GAME_LAB_POLICY,
  simulateMatchup,
} from './engine/possession-simulator.js?v=20261001c&rev=possession-workbench-v10-score-mean-se-v1';
import { resolveSimulationSeed } from './engine/simulation-seed.js?v=20260920c&rev=random-by-default-v1';
import { renderTimelineVisual } from './studio-runtime/modules/result-visuals.js?v=20261001c&rev=game-points-v3-game-timeline-context-v1';
import { createSimulationPauseGate, mountSimulationSessionHud } from './simulation-session-ui.js?v=20260926g&rev=session-loop-v5-reset-restore-replay';
import { projectPublicResultShareV1 } from './engine/public-result-share.js?v=20260929e&rev=game-points-v2-public-share-20260929e';
import {
  createSignedPublicResultShareLink,
  isSignedPublicResultShareAvailable,
} from './engine/public-result-share-client.js?v=20261001f&rev=studio-runtime-shared-dependency-closure-v1';
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';

export const SWISHIQ_GAME_LAB_VERSION = 'swishiq-game-lab-v4-random-new-runs';
export const SWISHIQ_GAME_REGISTRY_URL = 'swishiq-native-season-lab://exact-season';
export const SWISHIQ_GAME_LAB_LOAD_TIMEOUT_MS = 15_000;

const PHASE = 'regular';
const ADAPTER_VERSION = 'swishiq-native-rate-to-bounded-outcomes-v1';
const GAME_LAB_LOAD_TIMEOUT_MESSAGE = 'The Game Lab season check timed out. Check your connection and try again.';
const GAME_LAB_ACTUAL_SCHEDULE_URL = new URL('./data/nba-actual-schedules-v1.json?v=20260920c&rev=nba-schedule-source-v2', import.meta.url).toString();
export const GAME_LAB_CAMPAIGN_ROUNDS = 5;
const GAME_LAB_CAMPAIGN_GOAL = 5;
const GAME_LAB_CAMPAIGN_STORAGE_PREFIX = 'djhc:swishiq:game-lab:campaign:v1:';
const GAME_LAB_CAMPAIGN_STORAGE_VERSION = 1;
export const GAME_LAB_ROUND_PLANS = Object.freeze({
  balanced: Object.freeze({ possessions: 100, attackWeight: 0.5, label: 'Baseline scenario · 100 possessions · 50/50 rate blend' }),
  fast: Object.freeze({ possessions: 115, attackWeight: 0.65, label: 'More possessions · 115 possessions · 65/35 rate blend' }),
  slow: Object.freeze({ possessions: 85, attackWeight: 0.35, label: 'Fewer possessions · 85 possessions · 35/65 rate blend' }),
});

function seededMatchupKey(seed, teams) {
  return `${seed}\u0000${[...teams].map(String).sort().join('\u0000')}`;
}

export function advanceGameLabCampaign(rounds, { report, pick, stake, matchup }) {
  if (!Array.isArray(rounds)) throw new Error('Start a new Game Lab campaign.');
  if (report?.status !== 'complete' || !Array.isArray(report.teams) || report.teams.length !== 2 || report.teams[0] === report.teams[1]
    || !validCampaignReplaySettings(report.settings) || report.modelVersion !== GAME_LAB_MATCHUP_POLICY.version
    || typeof report.snapshot !== 'string' || !Number.isSafeInteger(report.season)
    || !/^[a-zA-Z0-9:._-]{1,80}$/.test(report.seed) || !['a', 'b'].includes(pick)
    || ![1, 2, 3].includes(Number(stake))) throw new Error('Choose a team and a confidence stake before running.');
  const winner = report.example?.winner;
  if (!['a', 'b', 'unresolved'].includes(winner)) throw new Error('The example result cannot be scored.');
  const prior = rounds.at(-1);
  const matchupKey = seededMatchupKey(report.seed, report.teams);
  if (rounds.some(entry => seededMatchupKey(entry.seed, entry.teams) === matchupKey)) return rounds;
  if (rounds.length >= GAME_LAB_CAMPAIGN_ROUNDS) throw new Error('Start a new Game Lab campaign.');
  const delta = winner === 'unresolved' ? 0 : winner === pick ? Number(stake) : -Number(stake);
  const entry = Object.freeze({
    round: rounds.length + 1, matchup: String(matchup), seed: report.seed, pick,
    teams: Object.freeze([...report.teams]),
    settings: Object.freeze({ format: report.settings.format, possessions: report.settings.possessions,
      trials: report.settings.trials, attackWeight: report.settings.attackWeight }),
    modelVersion: report.modelVersion, snapshot: report.snapshot, season: report.season,
    stake: Number(stake), winner, delta, score: (prior?.score || 0) + delta,
    streak: delta > 0 ? (prior?.streak || 0) + 1 : 0,
  });
  return Object.freeze([...rounds, entry]);
}

export function nextGameLabRoundSetup(teams, previous, campaignSeed, snapshot) {
  if (!Array.isArray(teams) || teams.length < 2 || !previous?.teams || !campaignSeed) throw new Error('Complete a round before advancing.');
  const ordered = [...teams].sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true }));
  const round = previous.round + 1;
  const seed = `game-round-${round}-${fnv32(campaignSeed)}`;
  const start = Number.parseInt(fnv32(`${snapshot}:${seed}`), 16) % ordered.length;
  let opponent = (start + 1 + (round % (ordered.length - 1))) % ordered.length;
  if (ordered.length > 2) {
    const previousPair = [previous.teams[0], previous.teams[1]].sort().join('|');
    while (opponent === start || [ordered[start].id, ordered[opponent].id].sort().join('|') === previousPair) opponent = (opponent + 1) % ordered.length;
  }
  return Object.freeze({ a: ordered[start].id, b: ordered[opponent].id, seed });
}

function campaignStorage(documentRef) {
  try { return documentRef.defaultView?.sessionStorage || globalThis.sessionStorage || null; } catch { return null; }
}

function gameLabSourceScope(source) {
  return `${pinLabel(source.nativePackageRef)}:${source.snapshot}`;
}

function validCampaignSeed(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9:._-]{1,80}$/.test(value);
}

function validCampaignReplaySettings(settings) {
  return Boolean(settings) && ['game', 'best_of_7'].includes(settings.format)
    && Number.isSafeInteger(settings.possessions) && settings.possessions >= GAME_LAB_POLICY.minPossessions
    && settings.possessions <= GAME_LAB_POLICY.maxPossessions
    && Number.isSafeInteger(settings.trials) && settings.trials >= GAME_LAB_POLICY.minTrials
    && settings.trials <= GAME_LAB_POLICY.maxTrials
    && Number.isFinite(settings.attackWeight) && settings.attackWeight >= 0 && settings.attackWeight <= 1;
}

function canReplayCampaignRound(entry, source) {
  return validCampaignReplaySettings(entry?.settings)
    && entry.modelVersion === GAME_LAB_MATCHUP_POLICY.version
    && entry.snapshot === source.snapshot
    && entry.season === source.seasonStartYear;
}

export function gameLabCampaignStorageKey(source) {
  const scope = gameLabSourceScope(source);
  return `${GAME_LAB_CAMPAIGN_STORAGE_PREFIX}${fnv32(scope)}${fnv32(scope, 0x9e3779b9)}`;
}

export function readGameLabCampaign(storage, source) {
  if (!storage) return null;
  const key = gameLabCampaignStorageKey(source);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const teamIds = new Set(source.teams.map(team => team.id));
    const validSetup = (setup, requirePick = true, requireSeed = true) => setup && teamIds.has(setup.a) && teamIds.has(setup.b) && setup.a !== setup.b
      && (!requireSeed || validCampaignSeed(setup.seed)) && (requirePick ? ['a', 'b'].includes(setup.pick) : ['', 'a', 'b'].includes(setup.pick))
      && [1, 2, 3].includes(Number(setup.stake)) && ['game', 'best_of_7'].includes(setup.format)
      && Number(setup.possessions) >= 60 && Number(setup.possessions) <= 140
      && Number(setup.trials) >= 100 && Number(setup.trials) <= 5000
      && Number(setup.weight) >= 0 && Number(setup.weight) <= 1;
    const sameSetup = (left, right) => ['a', 'b', 'seed', 'pick', 'stake', 'format', 'possessions', 'trials', 'weight']
      .every(field => String(left[field]) === String(right[field]));
    let score = 0;
    let streak = 0;
    const validRounds = Array.isArray(saved.rounds) && saved.rounds.length >= 1 && saved.rounds.length <= GAME_LAB_CAMPAIGN_ROUNDS
      && saved.rounds.every((entry, index) => {
        if (entry.round !== index + 1 || !Array.isArray(entry.teams) || entry.teams.length !== 2
          || !teamIds.has(entry.teams[0]) || !teamIds.has(entry.teams[1]) || entry.teams[0] === entry.teams[1]
          || !validCampaignSeed(entry.seed)
          || !['a', 'b'].includes(entry.pick) || ![1, 2, 3].includes(entry.stake)
          || !['a', 'b', 'unresolved'].includes(entry.winner)) return false;
        if ((entry.settings !== undefined && !validCampaignReplaySettings(entry.settings))
          || (entry.modelVersion !== undefined && typeof entry.modelVersion !== 'string')
          || (entry.snapshot !== undefined && entry.snapshot !== source.snapshot)
          || (entry.season !== undefined && entry.season !== source.seasonStartYear)) return false;
        if (saved.rounds.slice(0, index).some(prior => seededMatchupKey(prior.seed, prior.teams) === seededMatchupKey(entry.seed, entry.teams))) return false;
        const delta = entry.winner === 'unresolved' ? 0 : entry.winner === entry.pick ? entry.stake : -entry.stake;
        score += delta; streak = delta > 0 ? streak + 1 : 0;
        return entry.delta === delta && entry.score === score && entry.streak === streak;
      });
    if (saved.version !== GAME_LAB_CAMPAIGN_STORAGE_VERSION || saved.scope !== gameLabSourceScope(source)
      || !validRounds || !['review', 'choose'].includes(saved.phase)
      || (saved.phase === 'choose' && saved.rounds.length >= GAME_LAB_CAMPAIGN_ROUNDS)
      || !validSetup(saved.lastSetup) || !validSetup(saved.currentSetup, saved.phase === 'review', saved.phase === 'review')
      || (saved.phase === 'review' && !sameSetup(saved.currentSetup, saved.lastSetup))
      || !Object.hasOwn(GAME_LAB_ROUND_PLANS, saved.nextPlan)
      || !validCampaignSeed(saved.campaignSeed)
      || saved.campaignSeed !== saved.rounds[0].seed
      || saved.lastSetup.seed !== saved.rounds.at(-1).seed
      || saved.lastSetup.a !== saved.rounds.at(-1).teams[0]
      || saved.lastSetup.b !== saved.rounds.at(-1).teams[1]
      || saved.lastSetup.pick !== saved.rounds.at(-1).pick
      || Number(saved.lastSetup.stake) !== saved.rounds.at(-1).stake) {
      storage.removeItem(key);
      return null;
    }
    return saved;
  } catch {
    try { storage.removeItem(key); } catch { /* Storage is optional. */ }
    return null;
  }
}

export function bindGameLabSessionPresentation(sessionHud) {
  if (!sessionHud?.element || !sessionHud?.session) return () => {};
  return sessionHud.session.subscribe(state => {
    const active = ['running', 'paused', 'cancelling', 'replay'].includes(state.status);
    const complete = state.status === 'complete';
    sessionHud.element.hidden = !active && !complete;
    sessionHud.element.classList.toggle('swishiq-game-lab__session--compact', complete);
  });
}

function gameLabLoadTimeoutMs(value) {
  const timeout = Number(value);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : SWISHIQ_GAME_LAB_LOAD_TIMEOUT_MS;
}

function createElement(documentRef, tag, textContent = '', className = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (textContent !== '') element.textContent = textContent;
  return element;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatGameLabShare(value, digits = 1) {
  if (value === null || value === undefined || typeof value === 'boolean'
    || (typeof value === 'string' && value.trim() === '') || !Number.isInteger(digits) || digits < 0 || digits > 6) return 'unavailable';
  const share = Number(value);
  if (!Number.isFinite(share) || share < 0 || share > 1) return 'unavailable';
  return `${(share * 100).toFixed(digits)}%`;
}

export function gameLabRunSamplingMargin(share, trials) {
  if (!Number.isFinite(share) || share < 0 || share > 1 || !Number.isSafeInteger(trials) || trials < 1) return 'unavailable';
  const z = 1.96;
  const denominator = 1 + (z ** 2) / trials;
  const center = (share + (z ** 2) / (2 * trials)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((share * (1 - share) / trials) + ((z ** 2) / (4 * trials ** 2)));
  const lower = Math.max(0, center - halfWidth);
  const upper = Math.min(1, center + halfWidth);
  const margin = Math.max(share - lower, upper - share) * 100;
  return `±${margin.toFixed(1)} pp`;
}

/**
 * The timeline list already labels every exact team/period value for assistive
 * technology. Drop the shared renderer's duplicate exact-value table here.
 */
export function renderGameLabTimeline(documentRef, options = {}) {
  const figure = renderTimelineVisual(documentRef, options);
  const list = figure?.querySelector?.('.swishiq-result-visual__timeline');
  if (list) list.setAttribute('aria-label', 'Exact simulated score checkpoints by team and period');
  const tableWrap = figure?.querySelector?.('.swishiq-result-visual__table-wrap');
  const caption = tableWrap?.querySelector?.('caption');
  if (caption?.textContent?.trim() === 'Exact timeline values') tableWrap.remove();
  return figure;
}

function seasonLabel(year) {
  const start = Number(year);
  return Number.isSafeInteger(start) ? `${start}–${String(start + 1).slice(-2)}` : 'selected season';
}

function challengeDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentSelection(documentRef) {
  const value = documentRef.getElementById('packageSelect')?.value || '';
  const [packageId = '', packageVersion = ''] = value.split('|');
  return packageId && packageVersion ? { packageId, packageVersion } : null;
}

function pinLabel(pin) {
  if (!pin?.packageId || !pin?.packageVersion) return 'unavailable';
  return `${pin.packageId}@${pin.packageVersion}`;
}

function fnv32(value, salt = 0) {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function opaqueSnapshot(packageRef) {
  const source = `${packageRef?.packageId || ''}@${packageRef?.packageVersion || ''}:${packageRef?.sourceLockSha256 || packageRef?.packageManifestSha256 || ''}`;
  return `s${[0, 0x9e3779b9, 0x85ebca6b].map(salt => fnv32(source, salt)).join('')}`.slice(0, 25);
}

function boundedCounts(points, possessions) {
  // Native team-style packages publish points per 100 and exposure, not the
  // possession-level outcome rows required by the simulator. This deterministic
  // adapter preserves the native mean in the smallest bounded integer buckets;
  // the UI labels the result as an approximation instead of observed tails.
  let remainingPoints = Math.max(0, Math.round(Number(points) || 0));
  const fourPlus = Math.min(possessions, Math.max(0, remainingPoints - (3 * possessions)));
  remainingPoints -= fourPlus * 4;
  let slots = possessions - fourPlus;
  const three = Math.min(slots, Math.floor(remainingPoints / 3));
  remainingPoints -= three * 3;
  slots -= three;
  const two = Math.min(slots, Math.floor(remainingPoints / 2));
  remainingPoints -= two * 2;
  slots -= two;
  const one = Math.min(slots, remainingPoints);
  remainingPoints -= one;
  const empty = slots - one;
  if (remainingPoints !== 0 || empty < 0) throw new Error('The native rate adapter could not reconcile its bounded outcome sample.');
  return { empty, one, two, three, fourPlus };
}

function adaptedOutcome(rate, possessions) {
  const points = Math.round(Number(rate) * possessions / 100);
  return { possessions, points, counts: boundedCounts(points, possessions), inputMode: 'synthetic-team-rate-adapter', adapterVersion: ADAPTER_VERSION };
}

function adaptedContext(evidence, season) {
  const sample = evidence?.sample;
  const offensePossessions = Number(sample?.offensePossessions);
  const defensePossessions = Number(sample?.defensePossessions);
  if (!Number.isSafeInteger(offensePossessions) || offensePossessions < GAME_LAB_POLICY.minSidePossessions
    || !Number.isSafeInteger(defensePossessions) || defensePossessions < GAME_LAB_POLICY.minSidePossessions) {
    throw new Error(`The native ${seasonLabel(season)} package does not expose enough team-style possession denominators.`);
  }
  const offense = adaptedOutcome(sample.offensiveRating, offensePossessions);
  const defense = adaptedOutcome(sample.defensiveRating, defensePossessions);
  const offensiveRating = offense.points / offense.possessions * 100;
  const defensiveRating = defense.points / defense.possessions * 100;
  const netRating = offensiveRating - defensiveRating;
  return {
    key: `season:${season}`,
    status: 'observed',
    games: Number.isSafeInteger(Number(sample.games)) ? Number(sample.games) : 0,
    offensePossessions,
    defensePossessions,
    minimumCombinedPossessions: 1,
    offensiveRating,
    defensiveRating,
    netRating,
    interval: { lower: netRating, upper: netRating },
    adapterVersion: ADAPTER_VERSION,
    outcomes: { offense, defense },
  };
}

function buildGameSource({ proof, nativeSource, selectedNative, seasonStartYear }) {
  const packages = selectedNative?.packages || [];
  if (packages.length !== 1) throw new Error('The native Season Lab selection did not resolve one exact team package.');
  const nativePackage = packages[0];
  const nativePin = Object.freeze({
    ...nativePackage.packageRef,
    seasonStartYear,
  });
  const snapshot = opaqueSnapshot(nativePin);
  const payloads = [...(selectedNative.payloads || [])].sort((left, right) => String(left.team).localeCompare(String(right.team)));
  if (payloads.length < 2 || payloads.length > 30) throw new Error('The native exact package does not expose a complete team list.');
  const teamIds = new Map(payloads.map((payload, index) => [payload.team, `t${index}`]));
  const teams = payloads.map(payload => ({ id: teamIds.get(payload.team), name: payload.team, sourceTeam: payload.team }));
  const evidencePayloads = payloads.map(payload => {
    const evidence = nativeTeamEvidence(payload, seasonStartYear, PHASE);
    if (evidence.status !== 'ready') throw new Error(`${payload.team}: ${evidence.reason}`);
    const team = teamIds.get(payload.team);
    return {
      ...payload,
      snapshot,
      team,
      sourceTeam: payload.team,
      packageRef: nativePin,
      contexts: [adaptedContext(evidence, seasonStartYear)],
      nativeEvidence: evidence,
    };
  });
  const payloadById = new Map(evidencePayloads.map(payload => [payload.team, payload]));
  return Object.freeze({
    phase: 'ready',
    snapshot,
    seasonStartYear,
    seasonEndYear: seasonStartYear + 1,
    teams: Object.freeze(teams),
    payloads: Object.freeze(evidencePayloads),
    payloadById,
    selectedPackageRef: proof.package,
    nativePackageRef: nativePin,
    packageRegistry: nativeSource.packageRegistry,
    registryVersion: nativeSource.packageRegistry?.registryVersion || null,
    registryRevisionSha256: nativeSource.packageRegistry?.registryRevisionSha256 || null,
    source: Object.freeze({
      kind: 'exact-season',
      seasonStartYears: Object.freeze([seasonStartYear]),
      packageId: nativePin.packageId,
      packageVersion: nativePin.packageVersion,
      packageRefs: Object.freeze([nativePin]),
      adapterVersion: ADAPTER_VERSION,
    }),
  });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function failGameLabShare(message) {
  throw new TypeError(`Game Lab share: ${message}`);
}

function typedV4GameLabShareUnavailable(cause) {
  const error = new TypeError('Game Lab V4 sharing is unavailable because the V4 input adapter has not produced an approved Game Lab model result.');
  error.name = 'V4GameLabShareUnavailableError';
  error.code = 'v4-game-lab-share-unavailable';
  error.status = 'unavailable';
  error.cause = cause;
  return error;
}

function assertGameLabShareSourceAllowed(releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN) {
  try {
    return assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-game-lab', releasePin });
  } catch (cause) {
    if (cause?.code === 'v4-required') throw typedV4GameLabShareUnavailable(cause);
    throw cause;
  }
}

/**
 * Project only the anonymous mean simulated points per team per game. The
 * exact-season package and completed local simulation are checked again here;
 * matchup identities, settings, seeds, trial counts and intervals never enter
 * the public projection.
 */
export function buildVerifiedGameLabPublicResultSummary({ source, report, releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } = {}) {
  assertGameLabShareSourceAllowed(releasePin);
  if (!isRecord(source) || source.phase !== 'ready' || source.source?.kind !== 'exact-season'
    || source.source.seasonStartYears?.length !== 1 || source.source.seasonStartYears[0] !== source.seasonStartYear
    || !Array.isArray(source.teams)
    || !isRecord(source.selectedPackageRef) || !isRecord(source.nativePackageRef)
    || !isRecord(source.packageRegistry)) {
    failGameLabShare('a verified exact-season Game Lab source is required.');
  }
  const selected = source.selectedPackageRef;
  const native = source.nativePackageRef;
  const pinKeys = [
    'packageId', 'packageVersion', 'packageManifestSha256', 'sourceLockSha256',
    'modelId', 'metricsVersion', 'normalizer', 'projectionContentSha256',
    'registryVersion', 'registryRevisionSha256',
  ];
  if (pinKeys.some(key => selected[key] !== native[key])
    || selected.registryVersion !== source.packageRegistry.registryVersion
    || selected.registryRevisionSha256 !== source.packageRegistry.registryRevisionSha256
    || selected.scope?.kind !== 'exact-season'
    || selected.scope.seasonStartYears?.length !== 1
    || selected.scope.seasonStartYear !== source.seasonStartYear
    || selected.scope.seasonEndYear !== source.seasonEndYear
    || !Array.isArray(selected.scope.phases) || !selected.scope.phases.includes(PHASE)
    || native.scope?.kind !== 'exact-season'
    || !Array.isArray(native.scope?.phases) || !native.scope.phases.includes(PHASE)
    || native.scope.seasonStartYears?.length !== 1
    || native.scope.seasonStartYear !== source.seasonStartYear
    || native.scope.seasonEndYear !== source.seasonEndYear
    || source.seasonEndYear !== source.seasonStartYear + 1) {
    failGameLabShare('the selected package is not the current exact regular-season source.');
  }
  if (!isRecord(report) || report.status !== 'complete'
    || report.modelVersion !== GAME_LAB_MATCHUP_POLICY.version
    || report.outcomeModel !== GAME_LAB_MATCHUP_POLICY.outcomeModel
    || report.snapshot !== source.snapshot
    || report.season !== source.seasonStartYear
    || !Array.isArray(report.teams) || report.teams.length !== 2
    || report.teams[0] === report.teams[1]
    || report.teams.some(teamId => !source.teams.some(team => team.id === teamId))
    || !validCampaignReplaySettings(report.settings)
    || !isRecord(report.expectedRegulationScore)
    || !Number.isFinite(report.expectedRegulationScore.a)
    || !Number.isFinite(report.expectedRegulationScore.b)
    || report.expectedRegulationScore.a < 0 || report.expectedRegulationScore.a > 200
    || report.expectedRegulationScore.b < 0 || report.expectedRegulationScore.b > 200) {
    failGameLabShare('a complete simulation for the verified exact season is required.');
  }

  const meanPointsPerTeam = Math.round(((report.expectedRegulationScore.a + report.expectedRegulationScore.b) / 2) * 1000) / 1000;
  const packagePin = {
    packageId: selected.packageId,
    packageVersion: selected.packageVersion,
    modelId: selected.modelId,
    metricsVersion: selected.metricsVersion,
    packageManifestSha256: selected.packageManifestSha256,
    sourceLockSha256: selected.sourceLockSha256,
    registryVersion: selected.registryVersion,
    registryRevisionSha256: selected.registryRevisionSha256,
    ...(selected.normalizer !== undefined ? { normalizer: selected.normalizer } : {}),
    ...(selected.projectionContentSha256 !== undefined ? { projectionContentSha256: selected.projectionContentSha256 } : {}),
    scope: {
      kind: 'exact-season',
      seasonStartYear: source.seasonStartYear,
      seasonEndYear: source.seasonEndYear,
      phase: PHASE,
    },
  };
  return projectPublicResultShareV1({
    tool: 'swishiq-studio',
    scenarioKind: 'game',
    packagePin,
    result: {
      status: 'complete',
      nativeOutcome: { unit: 'per-game', metrics: { pointsPerGame: meanPointsPerTeam } },
    },
  });
}

function table(documentRef, caption, headers, rows, className = '') {
  const wrap = createElement(documentRef, 'div', '', `swishiq-game-lab__table-wrap ${className}`.trim());
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', caption);
  wrap.setAttribute('aria-description', 'Use Left or Right Arrow to scroll horizontally; Home or End moves to the first or last column.');
  wrap.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End');
  wrap.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const maximum = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    if (!maximum) return;
    const current = Math.max(0, Math.min(maximum, Number(wrap.scrollLeft) || 0));
    let next;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 40);
    else if (event.key === 'ArrowRight') next = Math.min(maximum, current + 40);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maximum;
    else return;
    event.preventDefault();
    wrap.scrollLeft = next;
  });
  const tableElement = createElement(documentRef, 'table', '', 'swishiq-game-lab__table');
  tableElement.append(createElement(documentRef, 'caption', caption));
  const head = createElement(documentRef, 'thead');
  const headRow = createElement(documentRef, 'tr');
  headers.forEach(header => { const cell = createElement(documentRef, 'th', header); cell.scope = 'col'; headRow.append(cell); });
  head.append(headRow);
  const body = createElement(documentRef, 'tbody');
  rows.forEach(row => {
    const rowElement = createElement(documentRef, 'tr');
    row.forEach((value, index) => {
      const cell = createElement(documentRef, index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      if (value && typeof value === 'object' && typeof value.tagName === 'string') cell.append(value);
      else cell.textContent = String(value);
      rowElement.append(cell);
    });
    body.append(rowElement);
  });
  tableElement.append(head, body); wrap.append(tableElement);
  return wrap;
}

function pinList(documentRef, source) {
  const details = createElement(documentRef, 'details', '', 'swishiq-game-lab__pins');
  details.append(createElement(documentRef, 'summary', 'Exact package and source pins'));
  details.open = false;
  details.append(table(documentRef, 'Selected package and native source pins', ['Source pin', 'Value'], [
    ['Selected exact package', pinLabel(source.selectedPackageRef)],
    ['Native team package', pinLabel(source.nativePackageRef)],
    ['Native registry', `${source.registryVersion || 'unavailable'} · ${source.registryRevisionSha256 || 'revision unavailable'}`],
  ]));
  return details;
}

export function renderGameLabCampaignBoard(documentRef, board, rounds, awaitingNext, source, onReplay = null) {
  const last = rounds.at(-1);
  const displayRound = awaitingNext ? rounds.length : Math.min(rounds.length + 1, GAME_LAB_CAMPAIGN_ROUNDS);
  const signed = value => `${value >= 0 ? '+' : ''}${value}`;
  const teamName = id => source.teams.find(team => team.id === id)?.name || id;
  const campaignMetrics = [
    `Round ${displayRound} of ${GAME_LAB_CAMPAIGN_ROUNDS}`,
    `${signed(last?.score || 0)} points`,
    `${last?.streak || 0} win streak`,
  ];
  const scoreHeading = createElement(documentRef, 'h3', '', 'swishiq-game-lab__campaign-scoreboard');
  scoreHeading.setAttribute('aria-label', campaignMetrics.join(' · '));
  campaignMetrics.forEach((metric, index) => {
    if (index) {
      const separator = createElement(documentRef, 'span', ' · ', 'swishiq-game-lab__campaign-separator');
      separator.setAttribute('aria-hidden', 'true');
      scoreHeading.append(separator);
    }
    scoreHeading.append(createElement(documentRef, 'span', metric, 'swishiq-game-lab__campaign-metric'));
  });
  board.replaceChildren(scoreHeading);
  board.append(createElement(documentRef, 'p', last?.round === GAME_LAB_CAMPAIGN_ROUNDS
    ? `${last.score >= GAME_LAB_CAMPAIGN_GOAL ? 'Goal met' : 'Goal missed'} · target +${GAME_LAB_CAMPAIGN_GOAL} after five rounds.`
    : `Goal: +${GAME_LAB_CAMPAIGN_GOAL} after five rounds.`, 'swishiq-game-lab__muted'));
  if (rounds.length) board.append(table(documentRef, 'Campaign round history',
    ['Round', 'Matchup', 'Your pick', 'Simulated winner', 'Round score', 'Total score'],
    rounds.map(entry => {
      const replayable = canReplayCampaignRound(entry, source);
      const roundCell = createElement(documentRef, 'div', '', 'swishiq-game-lab__round-cell');
      roundCell.append(createElement(documentRef, 'strong', String(entry.round)));
      roundCell.append(createElement(documentRef, 'span', entry.settings
        ? `${entry.settings.format === 'game' ? 'game' : 'series'} · ${entry.settings.possessions} poss · ${formatNumber(entry.settings.trials, 0)} runs · ${Math.round(entry.settings.attackWeight * 100)}/${Math.round((1 - entry.settings.attackWeight) * 100)} blend`
        : 'Saved before replay details were recorded', 'swishiq-game-lab__round-scenario'));
      const replayButton = createElement(documentRef, 'button', replayable ? 'Replay' : 'Replay unavailable', 'button-secondary swishiq-game-lab__round-replay');
      replayButton.type = 'button';
      replayButton.disabled = !replayable || typeof onReplay !== 'function';
      replayButton.dataset.replayable = String(replayable && typeof onReplay === 'function');
      replayButton.setAttribute('aria-label', replayable
        ? `Replay round ${entry.round}: ${entry.matchup}, seed ${entry.seed}. Campaign score will not change.`
        : `Round ${entry.round} result history; replay settings or the original model version are unavailable.`);
      replayButton.addEventListener('click', () => onReplay?.(entry));
      roundCell.append(replayButton);
      return [roundCell, entry.matchup,
        `${entry.pick.toUpperCase()}: ${teamName(entry.teams[entry.pick === 'a' ? 0 : 1])}`,
        entry.winner === 'unresolved' ? 'Unresolved' : `${entry.winner.toUpperCase()}: ${teamName(entry.teams[entry.winner === 'a' ? 0 : 1])}`,
      signed(entry.delta), signed(entry.score)];
    })));
}

function renderGameLabScoreboard(documentRef, { label, accessibleLabel, nameA, valueA, nameB, valueB }) {
  const board = createElement(documentRef, 'div', '', 'swishiq-game-lab__scoreboard');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', accessibleLabel);
  const team = (name, value, side) => {
    const item = createElement(documentRef, 'div', '', `swishiq-game-lab__scoreboard-team swishiq-game-lab__scoreboard-team--${side}`);
    item.append(createElement(documentRef, 'span', name, 'swishiq-game-lab__scoreboard-name'));
    item.append(createElement(documentRef, 'strong', String(value), 'swishiq-game-lab__scoreboard-value'));
    return item;
  };
  const separator = createElement(documentRef, 'span', '–', 'swishiq-game-lab__scoreboard-separator');
  separator.setAttribute('aria-hidden', 'true');
  board.append(
    createElement(documentRef, 'span', label, 'swishiq-game-lab__scoreboard-label'),
    team(nameA, valueA, 'a'),
    separator,
    team(nameB, valueB, 'b'),
  );
  return board;
}

function control(documentRef, labelText, id, options) {
  const label = createElement(documentRef, 'label', '', 'swishiq-game-lab__field');
  const name = createElement(documentRef, 'span', labelText, 'swishiq-game-lab__field-label');
  const select = createElement(documentRef, 'select'); select.id = id;
  options.forEach(([value, text]) => { const option = createElement(documentRef, 'option', text); option.value = value; select.append(option); });
  label.append(name, select); return { label, input: select };
}

function evaluationSeasonStartYear(value, label = '') {
  const text = `${label} ${value}`;
  const season = text.match(/(?:^|\D)((?:19|20)\d{2})\s*[–-]\s*(?:(?:19|20)?\d{2})(?:\D|$)/);
  if (season) return Number(season[1]);
  const packageSeason = String(value || '').match(/(?:^|-)v\d+-(20\d{2})-\d{2}(?:\||$)/);
  return packageSeason ? Number(packageSeason[1]) : null;
}

function gameLabEvaluationSourceChoices(documentRef, source, suppliedChoices) {
  const packageSelect = documentRef.getElementById?.('packageSelect');
  const optionNodes = packageSelect?.options ? [...packageSelect.options] : (packageSelect?.children || []);
  const candidates = Array.isArray(suppliedChoices) && suppliedChoices.length
    ? suppliedChoices
    : optionNodes.map(option => ({ value: option.value, label: option.textContent }));
  const choices = candidates.map(item => ({
    value: String(item?.value || '').trim(),
    label: String(item?.label || '').trim(),
  })).filter(item => item.value.includes('|') && item.value.split('|')[0] && item.value.split('|')[1]);
  const currentValue = `${source?.nativePackageRef?.packageId || ''}|${source?.nativePackageRef?.packageVersion || ''}`;
  if (!choices.some(choice => choice.value.startsWith(`${currentValue}|`) || choice.value === currentValue) && currentValue !== '|') {
    choices.push({ value: currentValue, label: seasonLabel(source?.seasonStartYear) });
  }
  const seen = new Set();
  return choices.filter(choice => {
    if (seen.has(choice.value)) return false;
    seen.add(choice.value);
    const year = evaluationSeasonStartYear(choice.value, choice.label);
    choice.seasonStartYear = Number.isSafeInteger(year) ? year : null;
    choice.displayLabel = `${choice.label || (choice.seasonStartYear ? seasonLabel(choice.seasonStartYear) : 'Exact season')} · exact native package`;
    return true;
  }).sort((left, right) => (left.seasonStartYear || 0) - (right.seasonStartYear || 0) || left.label.localeCompare(right.label));
}

function gameLabEvaluationSelection(value) {
  const [packageId = '', packageVersion = ''] = String(value || '').split('|');
  return packageId && packageVersion ? { packageId, packageVersion } : null;
}

function loadGameLabActualScheduleArchive(fetchImpl, signal) {
  if (typeof fetchImpl !== 'function') return Promise.reject(new Error('Game Lab final-score labels could not be loaded.'));
  return fetchImpl(GAME_LAB_ACTUAL_SCHEDULE_URL, { signal }).then(async response => {
    if (!response?.ok) throw new Error(`Game Lab final-score archive request failed${response?.status ? ` (${response.status})` : ''}.`);
    if (typeof response.json === 'function') return response.json();
    if (typeof response.text === 'function') return JSON.parse(await response.text());
    throw new Error('Game Lab final-score archive response was not readable.');
  });
}

function rangeInput(documentRef, labelText, id, value, min, max, step, formatValue) {
  const label = createElement(documentRef, 'label', '', 'swishiq-game-lab__range');
  const heading = createElement(documentRef, 'span', labelText, 'swishiq-game-lab__field-label');
  const output = createElement(documentRef, 'output', formatValue(value));
  const input = createElement(documentRef, 'input');
  Object.assign(input, { id, type: 'range', value, min, max, step });
  input.setAttribute('aria-label', labelText);
  input.addEventListener('input', () => { output.value = formatValue(input.value); output.textContent = formatValue(input.value); });
  label.append(heading, output, input); return { label, input };
}

function setWorkspace(documentRef, visible, title = 'Game Lab ready', description = '') {
  const panel = documentRef.getElementById('gameLabPanel');
  if (panel) panel.hidden = !visible;
  if (!visible) return;
  documentRef.getElementById('workbenchPlaceholder')?.setAttribute('hidden', 'hidden');
  const workspaceTitle = documentRef.getElementById('workspaceTitle');
  const workbenchState = documentRef.getElementById('workbenchState');
  const workbenchDescription = documentRef.getElementById('workbenchDescription');
  if (workspaceTitle) workspaceTitle.textContent = title;
  if (workbenchState) {
    workbenchState.textContent = 'Available';
    workbenchState.dataset.state = 'available';
    workbenchState.classList.add('swishiq-state--ready');
  }
  if (workbenchDescription) workbenchDescription.textContent = description || 'Run a repeatable matchup scenario against the selected season team data.';
}

function renderReport(documentRef, root, source, report, pick, previous, controls) {
  const nameFor = id => source.teams.find(team => team.id === id)?.name || id;
  const nameA = nameFor(report.teams[0]);
  const nameB = nameFor(report.teams[1]);
  const winnerName = report.example?.winner === 'a' ? nameA : report.example?.winner === 'b' ? nameB : null;
  const exampleLabel = report.settings.format === 'best_of_7' ? 'series' : 'game';
  const result = createElement(documentRef, 'section', '', 'swishiq-game-lab__result');
  result.setAttribute('aria-label', `One example simulated ${exampleLabel}`);
  const heading = createElement(documentRef, 'h3', winnerName ? `Example ${exampleLabel}: ${winnerName} wins` : `Example ${exampleLabel} is unresolved`);
  result.append(heading);
  result.append(createElement(documentRef, 'p', pick
    ? winnerName ? (pick === report.example.winner
      ? `Your pick matched the simulated ${exampleLabel}.`
      : `Your pick missed the simulated ${exampleLabel}.`)
      : `This simulated ${exampleLabel} was unresolved; no points awarded.`
    : `One simulated ${exampleLabel}.`, 'swishiq-game-lab__result-note'));
  const firstGame = report.example?.games?.[0];
  if (report.settings.format === 'best_of_7') {
    result.append(renderGameLabScoreboard(documentRef, {
      label: 'Example series record',
      accessibleLabel: `Example simulated series result: ${nameA} ${report.example.seriesWins.a} wins to ${report.example.seriesWins.b} wins ${nameB}`,
      nameA, valueA: report.example.seriesWins.a, nameB, valueB: report.example.seriesWins.b,
    }));
    result.append(table(documentRef, 'Example series score by game', ['Game', nameA, nameB], (report.example.games || []).map((game, index) => [`Game ${index + 1}`, game.a, game.b])));
  } else if (firstGame) {
    result.append(renderGameLabScoreboard(documentRef, {
      label: 'Example game score',
      accessibleLabel: `Example simulated game score: ${nameA} ${firstGame.a} to ${firstGame.b} ${nameB}`,
      nameA, valueA: firstGame.a, nameB, valueB: firstGame.b,
    }));
  }

  const summary = createElement(documentRef, 'section', '', 'swishiq-game-lab__summary');
  summary.setAttribute('aria-label', 'Aggregate simulation results');
  const summaryHeading = createElement(documentRef, 'h3', `${formatNumber(report.settings.trials, 0)} simulated ${report.settings.format === 'game' ? 'games' : 'series'}`);
  summaryHeading.tabIndex = -1;
  summary.append(summaryHeading);
  summary.append(createElement(documentRef, 'p', 'Results are conditional on this matchup setup, not a forecast.', 'swishiq-game-lab__muted'));
  const cards = createElement(documentRef, 'div', '', 'swishiq-game-lab__summary-grid');
  [[`${report.settings.format === 'best_of_7' ? 'Simulated series win share' : 'Simulated win share'} · ${nameA}`, formatGameLabShare(report.shares.a)], [`${report.settings.format === 'best_of_7' ? 'Simulated series win share' : 'Simulated win share'} · ${nameB}`, formatGameLabShare(report.shares.b)], [report.settings.format === 'best_of_7' ? 'Unresolved simulated series' : 'Unresolved simulated games', formatGameLabShare(report.shares.unresolved)], ['Scenario mean regulation score', `${formatNumber(report.expectedRegulationScore.a)} – ${formatNumber(report.expectedRegulationScore.b)}`]].forEach(([label, value]) => {
    const card = createElement(documentRef, 'article', '', 'swishiq-game-lab__summary-card'); card.append(createElement(documentRef, 'span', label), createElement(documentRef, 'strong', value)); cards.append(card);
  });
  const samplingMargins = [[nameA, report.shares.a], [nameB, report.shares.b], ['unresolved', report.shares.unresolved]]
    .map(([label, share]) => `${label} ${gameLabRunSamplingMargin(share, report.settings.trials)}`)
    .join(' · ');
  summary.append(cards);
  let shareSummary = null;
  let shareError = null;
  try { shareSummary = buildVerifiedGameLabPublicResultSummary({ source, report }); }
  catch (error) { shareError = error; }
  const v4ShareUnavailable = shareError?.code === 'v4-game-lab-share-unavailable';
  const shareMethod = typeof documentRef.defaultView?.navigator?.share === 'function' ? 'native'
    : typeof documentRef.defaultView?.navigator?.clipboard?.writeText === 'function' ? 'clipboard' : '';
  const shareAvailable = Boolean(shareSummary && shareMethod && isSignedPublicResultShareAvailable({
    windowRef: documentRef.defaultView,
    shareMethod,
  }));
  const share = createElement(documentRef, 'section', '', 'swishiq-game-lab__share');
  share.setAttribute('aria-label', 'Share conditional simulation summary');
  share.dataset.resultShareStatus = shareSummary ? 'ready' : 'unavailable';
  if (v4ShareUnavailable) share.dataset.resultShareErrorCode = shareError.code;
  const shareButton = createElement(documentRef, 'button', shareAvailable ? 'Share conditional summary' : 'Secure sharing unavailable', 'swishiq-game-lab__secondary-button');
  shareButton.type = 'button';
  shareButton.id = 'gameShareSummary';
  shareButton.disabled = !shareAvailable;
  const shareNoteText = !shareSummary
    ? v4ShareUnavailable
      ? 'The V4 Game Lab input capability does not approve this model output. No V3 share summary is used after V4 is selected.'
      : 'This run does not meet the exact-season public share contract; no signed summary is available.'
    : shareAvailable
      ? 'The signed summary includes only the average expected regulation points per team per simulated game for this exact season. It is a conditional simulation, not a forecast or odds; team selections, settings, seeds, trial counts, and sampling intervals are omitted. The signature authenticates the submitted summary. The signer accepts only approved fields and checks current registry/package pins and capability; it does not rerun the simulation or independently verify its source evidence.'
      : 'If secure sharing is configured, the summary would include only the average expected regulation points per team per simulated game for this exact season. It is a conditional simulation, not a forecast or odds; team selections, settings, seeds, trial counts, and sampling intervals would be omitted. No share link has been created.';
  const shareNote = createElement(documentRef, 'p', shareNoteText, 'swishiq-game-lab__muted');
  shareNote.id = 'gameShareSummaryDescription';
  shareButton.setAttribute('aria-describedby', shareNote.id);
  const shareStatus = createElement(documentRef, 'p', !shareSummary
    ? v4ShareUnavailable
      ? `V4 result share unavailable (${shareError.code}). No V3 result was shared.`
      : 'This run is unavailable for sharing under the exact-season public result contract.'
    : shareAvailable
      ? 'The summary can be signed. The service checks approved fields and current package pins/capability, not the simulated outcome or its evidence.'
    : shareMethod
      ? 'Sharing is unavailable until the public signer and trusted verification key are configured.'
      : 'Sharing is unavailable because this browser has no supported share or clipboard action.',
  'swishiq-game-lab__status');
  shareStatus.id = 'gameShareSummaryStatus';
  shareStatus.setAttribute('role', 'status');
  shareStatus.setAttribute('aria-live', 'polite');
  shareButton.addEventListener('click', async () => {
    if (!shareAvailable || !shareMethod) return;
    shareButton.disabled = true;
    shareStatus.textContent = 'Creating a signed conditional simulation summary…';
    try {
      const signed = await createSignedPublicResultShareLink(shareSummary, {
        toolId: 'swishiq-studio',
        shareMethod,
        windowRef: documentRef.defaultView,
      });
      if (shareMethod === 'native') {
        await documentRef.defaultView.navigator.share({
          title: 'Conditional Game Lab simulation',
          text: 'A conditional simulation summary, not a forecast or odds.',
          url: signed.url,
        });
      } else {
        await documentRef.defaultView.navigator.clipboard.writeText(signed.url);
      }
      signed.recordShared();
      shareStatus.textContent = shareMethod === 'native'
        ? 'The conditional simulation link was shared.'
        : 'The conditional simulation link was copied.';
    } catch (error) {
      shareStatus.textContent = error?.name === 'AbortError'
        ? 'Sharing was cancelled. No share event was recorded.'
        : 'A signed summary link could not be created or shared.';
    } finally {
      shareButton.disabled = !shareAvailable;
    }
  });
  share.append(shareButton, shareNote, shareStatus);
  summary.append(share);
  const checkpointRows = firstGame?.timeline?.flatMap(point => [
    { label: `${nameA} · ${point.period}`, value: Number(point.a), valueLabel: `${formatNumber(point.a, 1)} points`, unit: 'points', status: 'simulated checkpoint' },
    { label: `${nameB} · ${point.period}`, value: Number(point.b), valueLabel: `${formatNumber(point.b, 1)} points`, unit: 'points', status: 'simulated checkpoint' },
  ]) || [];
  result.append(renderGameLabTimeline(documentRef, {
    title: 'Example game timeline',
    summary: 'One simulated draw.',
    rows: checkpointRows,
    context: {
      scope: `Exact ${seasonLabel(report.season)}`,
      phase: PHASE,
      denominator: 'Score checkpoints within the displayed simulated game',
      coverage: `One displayed example game; ${formatNumber(report.settings.trials, 0)} simulated ${report.settings.format === 'game' ? 'games' : 'series'} summarized above.`,
      evidence: 'Native team-style rates adapted into bounded local outcome buckets',
      reliability: 'Conditional scenario adapter; no observed possession-level tail claim.',
      uncertainty: `95% Wilson run-sampling margin only: ${gameLabRunSamplingMargin(report.shares.a, report.settings.trials)} for ${nameA}; input and model uncertainty are not included.`,
    },
    className: 'swishiq-game-lab__native-timeline',
  }));
  summary.append(table(documentRef, 'First-game score ranges across simulations', ['Sample', '10th percentile', 'Median', '90th percentile'], [
    [nameA, report.firstGame.scoreA[10], report.firstGame.scoreA[50], report.firstGame.scoreA[90]],
    [nameB, report.firstGame.scoreB[10], report.firstGame.scoreB[50], report.firstGame.scoreB[90]],
    ['Margin', report.firstGame.margin[10], report.firstGame.margin[50], report.firstGame.margin[90]],
  ]));
  const histogram = createElement(documentRef, 'div', '', 'swishiq-game-lab__histogram'); histogram.setAttribute('aria-label', 'First-game winning margins across simulations');
  report.firstGame.histogram.forEach(bin => {
    const row = createElement(documentRef, 'div', '', 'swishiq-game-lab__histogram-row');
    const progress = createElement(documentRef, 'progress'); progress.max = report.settings.trials; progress.value = bin.count; progress.setAttribute('aria-label', `${bin.label}: ${bin.count} experiments`);
    row.append(createElement(documentRef, 'span', bin.label), progress, createElement(documentRef, 'span', formatGameLabShare(bin.count / report.settings.trials))); histogram.append(row);
  });
  summary.append(histogram);
  if (report.settings.format === 'best_of_7') summary.append(table(documentRef, 'Completed series lengths', ['Length', 'Experiments'], Object.entries(report.seriesLengths).map(([length, total]) => [`${length} games`, total])));

  const evidence = createElement(documentRef, 'details', '', 'swishiq-game-lab__evidence');
  evidence.open = false;
  evidence.append(createElement(documentRef, 'summary', 'Evidence, seed & limitations'));
  evidence.append(createElement(documentRef, 'p', `Scenario inputs: ${report.settings.possessions} possessions per team · ${Math.round(report.settings.attackWeight * 100)}% own season scoring rate · ${Math.round((1 - report.settings.attackWeight) * 100)}% opponent season points-allowed rate.`, 'swishiq-game-lab__technical-note'));
  evidence.append(createElement(documentRef, 'p', `Approximate 95% run-sampling margins: ${samplingMargins}. This measures repetition noise only; input and model uncertainty are not included.`, 'swishiq-game-lab__technical-note'));
  evidence.append(createElement(documentRef, 'p', `Model ${report.modelVersion} · exact ${seasonLabel(report.season)} · seed ${report.seed} · snapshot ${report.snapshot}`, 'swishiq-game-lab__muted'));
  evidence.append(table(documentRef, 'Native rate adapter exposure', ['Team', 'Games', 'Off. possessions', 'Def. possessions', '4+ adapted input buckets (off/def)'], [
    [nameA, report.evidence.a.sample.games, report.evidence.a.offense.possessions, report.evidence.a.defense.possessions, `${report.evidence.a.offense.tailCount} / ${report.evidence.a.defense.tailCount}`],
    [nameB, report.evidence.b.sample.games, report.evidence.b.offense.possessions, report.evidence.b.defense.possessions, `${report.evidence.b.offense.tailCount} / ${report.evidence.b.defense.tailCount}`],
  ]));
  const bucketInputs = [report.evidence.a.offense, report.evidence.a.defense, report.evidence.b.offense, report.evidence.b.defense];
  const syntheticInputShape = bucketInputs.every(input => input.inputProvenance?.mode === 'synthetic-team-rate-adapter'
    && input.inputProvenance.verifiedEventShape === false);
  const shapeDisclosure = syntheticInputShape
    ? 'The adapter creates synthetic 0/1/2/3-point buckets from those rates and denominators; they are not verified possession outcomes.'
    : 'The supplied bucket shape is unclassified and must not be read as verified possession outcomes.';
  evidence.append(createElement(documentRef, 'p', `Native inputs are team scoring rates and possession denominators, not play-by-play. ${shapeDisclosure} Simulation draws from a bounded rate profile; any 4+ buckets above are adapter inputs, not simulated tail draws. Lineups, home court, injuries, fatigue, travel, coaching, opponent adjustments, and parameter uncertainty are not modeled.`, 'swishiq-game-lab__limitation'));
  evidence.append(createElement(documentRef, 'p', report.note, 'swishiq-game-lab__technical-note'));
  evidence.append(pinList(documentRef, source));
  if (previous && previous.modelVersion === report.modelVersion && previous.snapshot === report.snapshot
    && previous.season === report.season && previous.teams.join() === report.teams.join()
    && previous.settings.format === report.settings.format) {
    const change = createElement(documentRef, 'section', '', 'swishiq-game-lab__comparison');
    change.append(createElement(documentRef, 'h3', 'Compared with the previous run'));
    change.append(createElement(documentRef, 'p', `Scenario mean margin: ${formatNumber(previous.expectedRegulationScore.a - previous.expectedRegulationScore.b)} → ${formatNumber(report.expectedRegulationScore.a - report.expectedRegulationScore.b)}. ${nameA} simulated win share: ${formatGameLabShare(previous.shares.a)} → ${formatGameLabShare(report.shares.a)}.`));
    change.append(createElement(documentRef, 'p', previous.seed === report.seed ? 'Both runs used the same seed. Compare the listed settings and output deltas.' : 'The seed changed, so the difference includes new simulation draws.', 'swishiq-game-lab__muted'));
    root.prepend(change);
  }
  root.append(summary, result, evidence);
  controls.resultHeading = summaryHeading;
  summaryHeading.focus?.();
}

function renderGameLabEvaluationPanel(documentRef, root, currentSource, evaluationOptions = {}) {
  const panel = createElement(documentRef, 'section', '', 'swishiq-game-lab__summary swishiq-game-lab__evaluation');
  panel.id = 'gameEvaluationPanel';
  panel.setAttribute('aria-label', 'Completed full-season holdout evaluation');
  panel.append(createElement(documentRef, 'h3', 'Full-season evaluation'));
  panel.append(createElement(documentRef, 'p', 'Compare an exact prior-season team package with a later completed regular season. The prediction input receives the target schedule only; final scores stay in a separate evaluation ledger.', 'swishiq-game-lab__muted'));
  const boundary = createElement(documentRef, 'p', 'This is a completed full-season holdout. In-season as-of evaluation is unavailable because historical game-level feature availability and pregame snapshots are not present in the archive.', 'swishiq-game-lab__muted');
  boundary.id = 'gameEvaluationBoundary';
  panel.append(boundary);

  const sourceChoices = gameLabEvaluationSourceChoices(documentRef, currentSource, evaluationOptions.sourceChoices);
  const sourceControl = control(documentRef, 'Source season · exact native package', 'gameEvaluationSourceSeason', sourceChoices.map(choice => [choice.value, choice.displayLabel]));
  const targetYears = GAME_LAB_POLICY.seasons.slice(1);
  const targetControl = control(documentRef, 'Target season · completed final scores', 'gameEvaluationTargetSeason', targetYears.map(year => [String(year), seasonLabel(year)]));
  const targetYear = targetYears.at(-1);
  targetControl.input.value = String(targetYear);
  const preferredSource = sourceChoices.find(choice => choice.seasonStartYear === targetYear - 1)
    || sourceChoices.filter(choice => Number.isSafeInteger(choice.seasonStartYear) && choice.seasonStartYear < targetYear).at(-1)
    || sourceChoices.at(-1);
  if (preferredSource) sourceControl.input.value = preferredSource.value;
  sourceControl.input.required = true;
  targetControl.input.required = true;
  sourceControl.input.setAttribute('aria-describedby', boundary.id);
  targetControl.input.setAttribute('aria-describedby', boundary.id);

  const form = createElement(documentRef, 'form', '', 'swishiq-game-lab__evaluation-form');
  form.id = 'gameEvaluationForm';
  form.setAttribute('aria-label', 'Full-season holdout setup');
  const fields = createElement(documentRef, 'div', '', 'swishiq-game-lab__control-grid');
  fields.append(sourceControl.label, targetControl.label);
  const actions = createElement(documentRef, 'div', '', 'swishiq-game-lab__actions');
  const run = createElement(documentRef, 'button', 'Run full-season holdout', 'swishiq-game-lab__primary-button');
  run.type = 'submit'; run.id = 'gameEvaluationRun';
  const cancel = createElement(documentRef, 'button', 'Cancel evaluation', 'swishiq-game-lab__secondary-button');
  cancel.type = 'button'; cancel.id = 'gameEvaluationCancel'; cancel.disabled = true;
  actions.append(run, cancel);
  form.append(fields, actions);
  panel.append(form);

  const status = createElement(documentRef, 'p', 'Ready. Run a completed full-season holdout.', 'swishiq-game-lab__status');
  status.id = 'gameEvaluationStatus';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const progress = createElement(documentRef, 'progress');
  progress.id = 'gameEvaluationProgress'; progress.hidden = true;
  progress.setAttribute('aria-label', 'Full-season holdout progress');
  const results = createElement(documentRef, 'section', '', 'swishiq-game-lab__evaluation-results');
  results.id = 'gameEvaluationResults';
  results.setAttribute('aria-label', 'Full-season holdout results');
  panel.append(status, progress, results);
  root.append(panel);

  const fetchImpl = evaluationOptions.fetchImpl || globalThis.fetch?.bind(globalThis);
  const loadArchive = evaluationOptions.loadArchive || (signal => loadGameLabActualScheduleArchive(fetchImpl, signal));
  const loadSource = evaluationOptions.loadSource || (({ selection, fetchImpl: sourceFetch }) => (
    loadSwishIqGameLabSource({ ...selection, fetchImpl: sourceFetch })
  ));
  const simulateGame = evaluationOptions.simulateGame || simulateMatchup;
  let activeController = null;
  let generation = 0;
  let archiveCache = null;
  let archivePromise = null;

  const setBusy = busy => {
    sourceControl.input.disabled = busy;
    targetControl.input.disabled = busy;
    run.disabled = busy || !sourceChoices.length;
    cancel.disabled = !busy;
  };
  const resetEvaluation = () => {
    generation += 1;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    results.replaceChildren();
    progress.hidden = true;
    progress.value = 0;
    status.textContent = 'Selection changed. Run a completed full-season holdout when ready.';
    setBusy(false);
  };

  sourceControl.input.addEventListener('change', resetEvaluation);
  targetControl.input.addEventListener('change', resetEvaluation);
  cancel.addEventListener('click', () => {
    if (!activeController) return;
    cancel.disabled = true;
    status.textContent = 'Cancelling the holdout. Partial predictions will be discarded.';
    activeController.abort();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (activeController) return;
    const selection = gameLabEvaluationSelection(sourceControl.input.value);
    const selectedTarget = Number(targetControl.input.value);
    if (!selection || !Number.isSafeInteger(selectedTarget)) {
      status.textContent = 'Choose a source package and completed target season.';
      return;
    }
    const controller = new AbortController();
    activeController = controller;
    const requestGeneration = ++generation;
    results.replaceChildren();
    progress.hidden = false; progress.value = 0; progress.max = 1;
    setBusy(true);
    status.textContent = 'Loading the completed regular-season labels…';
    const scopedFetch = typeof fetchImpl === 'function'
      ? (input, init = {}) => fetchImpl(input, { ...init, signal: controller.signal })
      : fetchImpl;
    try {
      if (!archiveCache) {
        const pendingArchive = archivePromise || Promise.resolve().then(() => loadArchive(controller.signal));
        archivePromise = pendingArchive;
        try {
          archiveCache = await pendingArchive;
        } catch (error) {
          if (archivePromise === pendingArchive) archivePromise = null;
          throw error;
        }
      }
      if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
      const fold = buildGameLabRollingOriginFolds(archiveCache).find(candidate => candidate.targetSeasonStartYear === selectedTarget);
      if (!fold) throw new Error(`No complete full-season score labels are available for ${seasonLabel(selectedTarget)}.`);
      const selectedChoice = sourceChoices.find(choice => choice.value === sourceControl.input.value);
      if (Number.isSafeInteger(selectedChoice?.seasonStartYear) && selectedChoice.seasonStartYear !== fold.sourceSeasonStartYear) {
        throw new Error(`Target ${seasonLabel(selectedTarget)} requires exact source ${seasonLabel(fold.sourceSeasonStartYear)}.`);
      }
      status.textContent = `Loading the exact ${seasonLabel(fold.sourceSeasonStartYear)} source package…`;
      const evaluationSource = await loadSource({ selection, fetchImpl: scopedFetch, signal: controller.signal });
      if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
      if (evaluationSource?.phase !== 'ready' || evaluationSource?.source?.kind !== 'exact-season'
        || evaluationSource.seasonStartYear !== fold.sourceSeasonStartYear) {
        throw new Error(`Choose the exact ${seasonLabel(fold.sourceSeasonStartYear)} native package for this target.`);
      }
      if (evaluationSource.nativePackageRef?.packageId !== selection.packageId
        || evaluationSource.nativePackageRef?.packageVersion !== selection.packageVersion) {
        throw new Error('The loaded source package does not match the selected exact-season pin.');
      }
      if (evaluationSource.teams?.length !== 30 || !(evaluationSource.payloadById instanceof Map)) {
        throw new Error('The exact prior-season package does not expose all thirty native team profiles.');
      }
      const predictions = [];
      const sourceTeamIds = new Map(evaluationSource.teams.map(team => [String(team.sourceTeam || '').trim().toUpperCase(), team.id]));
      progress.max = fold.schedule.length;
      status.textContent = `Running ${fold.schedule.length.toLocaleString('en-US')} completed target games from exact ${seasonLabel(fold.sourceSeasonStartYear)} inputs…`;
      for (const [index, game] of fold.schedule.entries()) {
        if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
        const homeId = sourceTeamIds.get(game.home);
        const awayId = sourceTeamIds.get(game.away);
        const home = evaluationSource.payloadById.get(homeId);
        const away = evaluationSource.payloadById.get(awayId);
        if (!home || !away) throw new Error(`The exact source package is missing a team profile for target game ${game.id}.`);
        const seed = `holdout-${selectedTarget}-${game.id}`;
        const simulationInput = {
          a: home, b: away,
          season: evaluationSource.seasonStartYear,
          seed,
          possessions: 100,
          trials: GAME_LAB_EVALUATION_POLICY.initialTrials,
          attackWeight: 0.5,
          format: 'game',
        };
        const runTrials = trials => simulateGame({ ...simulationInput, trials }, {
          signal: controller.signal,
          onProgress: fraction => {
            if (requestGeneration !== generation) return;
            progress.value = index + Math.max(0, Math.min(1, Number(fraction) || 0));
            status.textContent = `Running completed holdout game ${index + 1} of ${fold.schedule.length} · ${trials.toLocaleString('en-US')} seeded draws · ${Math.round((Number(fraction) || 0) * 100)}%.`;
          },
          yieldEveryBatch: () => new Promise(resolve => globalThis.setTimeout(resolve, 0)),
        });
        let simulated = await runTrials(simulationInput.trials);
        while (true) {
          const currentTrials = simulated?.settings?.trials;
          const nextTrials = nextGameLabEvaluationTrialCount(simulated?.shares?.a, currentTrials);
          if (nextTrials <= currentTrials) break;
          if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
          simulated = await runTrials(nextTrials);
        }
        if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
        predictions.push({
          gameId: game.id,
          sourceSeasonStartYear: fold.sourceSeasonStartYear,
          targetSeasonStartYear: fold.targetSeasonStartYear,
          seed,
          initialTrials: simulationInput.trials,
          trials: simulated.settings.trials,
          predictedHomeScore: simulated.firstGame.averageA,
          predictedAwayScore: simulated.firstGame.averageB,
          winProbabilities: { home: simulated.shares.a, away: simulated.shares.b, unresolved: simulated.shares.unresolved },
          scoreMeanStandardErrors: { home: simulated.firstGame.standardErrorA, away: simulated.firstGame.standardErrorB },
        });
        progress.value = index + 1;
        status.textContent = `Completed holdout game ${index + 1} of ${fold.schedule.length}.`;
      }
      const report = evaluateGameLabScoreFold({ fold, predictions });
      if (controller.signal.aborted || requestGeneration !== generation) throw new DOMException('Evaluation cancelled.', 'AbortError');
      const number = value => formatNumber(value, 2);
      const metrics = [
        ['Final score MAE', `${number(report.metrics.scoreMae)} points`],
        ['Final score RMSE', `${number(report.metrics.scoreRmse)} points`],
        ['Home-margin MAE', `${number(report.metrics.marginMae)} points`],
        ['Home-margin RMSE', `${number(report.metrics.marginRmse)} points`],
        ['Home-margin bias', `${number(report.metrics.marginBias)} points`],
        ['Winner accuracy', `${formatNumber(report.metrics.winnerAccuracy * 100, 1)}%`],
        ['Home-win probability Brier', number(report.metrics.homeWinProbabilityBrierScore)],
        ['Home-win probability log loss', number(report.metrics.homeWinProbabilityLogLoss)],
        ['Average trials per game', number(report.simulationReceipt.averageTrials)],
        ['Games above win-probability SE target', number(report.simulationReceipt.gamesAboveWinProbabilityStandardErrorTarget)],
        ['Mean home-win probability SE', `${formatNumber(report.simulationReceipt.meanHomeWinProbabilityStandardError * 100, 2)} pp`],
        ['Maximum home-win probability SE', `${formatNumber(report.simulationReceipt.maxHomeWinProbabilityStandardError * 100, 2)} pp`],
        ['Mean score-mean SE', `${number(report.simulationReceipt.meanScoreMeanStandardError)} points`],
        ['Maximum score-mean SE', `${number(report.simulationReceipt.maxScoreMeanStandardError)} points`],
      ];
      const summary = createElement(documentRef, 'p', `Completed full-season holdout · source ${seasonLabel(report.sourceSeasonStartYear)} → target ${seasonLabel(report.targetSeasonStartYear)} · ${report.games.toLocaleString('en-US')} regular-season games.`, 'swishiq-game-lab__muted');
      const targetWinSePoints = (GAME_LAB_EVALUATION_POLICY.targetWinProbabilityStandardError * 100).toFixed(1);
      const limit = createElement(documentRef, 'p', `Predictions average final score draws from 100 regulation possessions per team; overtime uses seeded stochastic rounding to the five-minute-equivalent pace up to the ${GAME_LAB_POLICY.maxOvertimes}-period cap. Each per-game seed starts at ${GAME_LAB_EVALUATION_POLICY.initialTrials} trials and can increase in ${GAME_LAB_EVALUATION_POLICY.trialStep}-trial steps until the home-win probability SE is at most ${targetWinSePoints} pp or the ${GAME_LAB_EVALUATION_POLICY.maxTrials}-trial cap. Reported SEs measure Monte Carlo run noise only. Winner-probability scores use final winners; they do not establish possession-level calibration, and this holdout does not evaluate realized per-game possessions.`, 'swishiq-game-lab__muted');
      const receiptDetails = createElement(documentRef, 'details', '', 'swishiq-game-lab__receipt-details');
      receiptDetails.append(createElement(documentRef, 'summary', 'Per-game seeds, trial counts, probabilities, and Monte Carlo errors'));
      receiptDetails.append(createElement(documentRef, 'pre', JSON.stringify(report.simulationReceipt), 'swishiq-game-lab__receipt'));
      results.replaceChildren(createElement(documentRef, 'h4', 'Holdout results'), summary,
        table(documentRef, 'Final score and winner metrics', ['Measure', 'Result'], metrics, 'swishiq-game-lab__table'), limit, receiptDetails);
      progress.value = fold.schedule.length;
      status.textContent = `Completed full-season holdout: ${seasonLabel(report.sourceSeasonStartYear)} source → ${seasonLabel(report.targetSeasonStartYear)} target.`;
    } catch (error) {
      if (requestGeneration !== generation) return;
      results.replaceChildren();
      progress.value = 0;
      status.textContent = error?.name === 'AbortError'
        ? 'Holdout cancelled. Partial predictions were discarded.'
        : error?.message || 'Game Lab could not complete this full-season holdout.';
    } finally {
      if (requestGeneration === generation) {
        if (activeController === controller) activeController = null;
        setBusy(false);
      }
    }
  });

  return Object.freeze({ destroy() {
    generation += 1;
    activeController?.abort();
    activeController = null;
    form.replaceChildren();
    panel.remove();
  } });
}

export function renderGameLabWorkbench(documentRef, root, source, evaluationOptions = {}) {
  root.replaceChildren();
  const storage = campaignStorage(documentRef);
  const storageKey = gameLabCampaignStorageKey(source);
  const savedCampaign = readGameLabCampaign(storage, source);
  const heading = createElement(documentRef, 'h2', 'Game Lab'); heading.id = 'gameLabTitle'; root.append(heading);
  root.append(createElement(documentRef, 'p', 'Play five matchups. Score each pick against the simulated example.', 'swishiq-game-lab__intro'));
  const restorePanel = createElement(documentRef, 'section', '', 'swishiq-game-lab__summary'); restorePanel.id = 'gameCampaignRestore'; restorePanel.hidden = !savedCampaign;
  const savedScore = savedCampaign?.rounds.at(-1)?.score || 0;
  const restoreProgress = savedCampaign?.phase === 'choose'
    ? `Round ${savedCampaign.rounds.length + 1} is ready for a pick.`
    : savedCampaign?.rounds.length === GAME_LAB_CAMPAIGN_ROUNDS
      ? 'All five rounds are complete.'
      : `Round ${savedCampaign?.rounds.length || 1} was scored; the next scenario is ready to choose.`;
  restorePanel.append(createElement(documentRef, 'h3', 'Saved Game Lab campaign'), createElement(documentRef, 'p', `${restoreProgress} Score: ${savedScore >= 0 ? '+' : ''}${savedScore}. Saved for this season.`, 'swishiq-game-lab__muted'));
  const restoreActions = createElement(documentRef, 'div', '', 'swishiq-game-lab__actions');
  const resume = createElement(documentRef, 'button', 'Resume campaign', 'swishiq-game-lab__primary-button'); resume.type = 'button'; resume.id = 'gameResumeCampaign';
  const startOver = createElement(documentRef, 'button', 'Start over', 'swishiq-game-lab__secondary-button'); startOver.type = 'button'; startOver.id = 'gameStartOver';
  restoreActions.append(resume, startOver); restorePanel.append(restoreActions); root.append(restorePanel);

  const workbench = createElement(documentRef, 'div', '', 'swishiq-game-lab__workbench');
  const form = createElement(documentRef, 'form', '', 'swishiq-game-lab__form swishiq-game-lab__workbench-setup');
  form.setAttribute('aria-label', 'Matchup setup and current decision');
  const roundPanel = createElement(documentRef, 'section', '', 'swishiq-game-lab__workbench-round');
  roundPanel.setAttribute('aria-label', 'Campaign progress and next actions');
  const results = createElement(documentRef, 'section', '', 'swishiq-game-lab__results swishiq-game-lab__workbench-evidence');
  results.id = 'gameResults';
  results.setAttribute('aria-label', 'Round simulation results and evidence');
  workbench.append(form, roundPanel, results);
  root.append(workbench);
  const evaluationUi = renderGameLabEvaluationPanel(documentRef, root, source, evaluationOptions);

  const matchup = createElement(documentRef, 'section', '', 'swishiq-game-lab__setup');
  matchup.append(createElement(documentRef, 'h3', 'Matchup'));
  const teams = createElement(documentRef, 'div', '', 'swishiq-game-lab__control-grid');
  const teamOptions = source.teams.map(team => [team.id, team.name]);
  const a = control(documentRef, 'Team A', 'gameTeamA', teamOptions);
  const b = control(documentRef, 'Team B', 'gameTeamB', teamOptions);
  const matchupBoard = createElement(documentRef, 'section', '', 'swishiq-game-lab__matchup-board');
  matchupBoard.setAttribute('aria-label', 'Selected matchup board');
  const teamA = createElement(documentRef, 'div', '', 'swishiq-game-lab__matchup-team swishiq-game-lab__matchup-team--a');
  const teamAName = createElement(documentRef, 'strong', 'TEAM A', 'swishiq-game-lab__matchup-code');
  const teamALabel = createElement(documentRef, 'span', 'Select a team', 'swishiq-game-lab__matchup-label');
  teamA.append(teamAName, teamALabel);
  const versus = createElement(documentRef, 'span', 'VS', 'swishiq-game-lab__matchup-versus');
  const teamB = createElement(documentRef, 'div', '', 'swishiq-game-lab__matchup-team swishiq-game-lab__matchup-team--b');
  const teamBName = createElement(documentRef, 'strong', 'TEAM B', 'swishiq-game-lab__matchup-code');
  const teamBLabel = createElement(documentRef, 'span', 'Select a team', 'swishiq-game-lab__matchup-label');
  teamB.append(teamBName, teamBLabel);
  const matchupMeta = createElement(documentRef, 'p', `SEASON ${seasonLabel(source.seasonStartYear)}`, 'swishiq-game-lab__matchup-meta');
  matchupBoard.append(teamA, versus, teamB, matchupMeta);
  const updateMatchupBoard = () => {
    const first = source.teams.find(team => team.id === a.input.value);
    const second = source.teams.find(team => team.id === b.input.value);
    teamAName.textContent = first?.name || 'TEAM A';
    teamALabel.textContent = first ? 'Side A' : 'Select a team';
    teamBName.textContent = second?.name || 'TEAM B';
    teamBLabel.textContent = second ? 'Side B' : 'Select a team';
    if (call?.input?.children?.[1]) call.input.children[1].textContent = first?.name || 'Team A';
    if (call?.input?.children?.[2]) call.input.children[2].textContent = second?.name || 'Team B';
  };
  // The exact season is already fixed by the selected, registry-pinned
  // package. Do not present a second one-option season selector here.
  teams.append(a.label, b.label); matchup.append(matchupBoard, teams);
  const daily = createElement(documentRef, 'button', 'Try sample matchup', 'swishiq-game-lab__secondary-button'); daily.type = 'button'; daily.id = 'gameDaily';
  matchup.append(daily); form.append(matchup);

  const assumptions = createElement(documentRef, 'details', '', 'swishiq-game-lab__assumptions'); assumptions.append(createElement(documentRef, 'summary', 'Simulation settings'));
  const fields = createElement(documentRef, 'div', '', 'swishiq-game-lab__control-grid');
  const possessions = rangeInput(documentRef, 'Possessions per team', 'gamePossessions', 100, 60, 140, 1, value => `${value} poss.`);
  const weight = rangeInput(documentRef, 'Season scoring-rate blend', 'gameOffenseWeight', 0.5, 0, 1, 0.05, value => `${Math.round(Number(value) * 100)}% own scoring rate · ${Math.round((1 - Number(value)) * 100)}% opponent allowed rate`);
  const gameFormat = control(documentRef, 'Experiment', 'gameFormat', [['game', 'One game'], ['best_of_7', 'Best of seven']]);
  const trials = rangeInput(documentRef, 'Number of runs', 'gameTrials', 200, 100, 5000, 100, value => `${Number(value).toLocaleString()} runs`);
  fields.append(possessions.label, weight.label, gameFormat.label, trials.label); assumptions.append(fields);
  assumptions.append(createElement(documentRef, 'p', 'Possessions per team sets scenario volume; it is not observed game pace.', 'swishiq-game-lab__muted'));

  const decision = createElement(documentRef, 'section', '', 'swishiq-game-lab__decision swishiq-game-lab__actions swishiq-game-lab__decision-actions');
  decision.setAttribute('aria-label', 'Current decision');
  const call = control(documentRef, 'Pick the example winner', 'gameCall', [['', 'Choose a winner'], ['a', 'Team A'], ['b', 'Team B']]);
  const stake = control(documentRef, 'Confidence stake', 'gameStake', [['1', '1 point · cautious'], ['2', '2 points · balanced'], ['3', '3 points · bold']]);
  const run = createElement(documentRef, 'button', 'Play round 1', 'swishiq-game-lab__primary-button'); run.type = 'submit'; run.id = 'gameRun';
  const cancel = createElement(documentRef, 'button', 'Cancel', 'swishiq-game-lab__secondary-button'); cancel.type = 'button'; cancel.id = 'gameCancel'; cancel.hidden = true;
  decision.append(call.label, stake.label, run, cancel); form.append(decision, assumptions);
  const campaignBoard = createElement(documentRef, 'section', '', 'swishiq-game-lab__campaign-board'); campaignBoard.id = 'gameCampaign'; campaignBoard.setAttribute('aria-label', 'Game Lab campaign'); roundPanel.append(campaignBoard);
  const status = createElement(documentRef, 'p', 'Choose a winner and stake. A correct example draw earns the stake; a miss loses it; unresolved draws score zero.', 'swishiq-game-lab__status'); status.id = 'gameStatus'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); roundPanel.append(status);
  const nextPlan = control(documentRef, 'Choose a next-round scenario', 'gameNextPlan', Object.entries(GAME_LAB_ROUND_PLANS).map(([key, plan]) => [key, plan.label]));
  const next = createElement(documentRef, 'button', 'Start next round', 'swishiq-game-lab__primary-button'); next.type = 'button'; next.id = 'gameNextRound'; next.hidden = true;
  const resetCampaign = createElement(documentRef, 'button', 'Reset campaign', 'swishiq-game-lab__secondary-button'); resetCampaign.type = 'button'; resetCampaign.id = 'gameResetCampaign'; resetCampaign.hidden = true;
  const nextActions = createElement(documentRef, 'div', '', 'swishiq-game-lab__actions swishiq-game-lab__next-actions'); nextActions.append(nextPlan.label, next, resetCampaign); roundPanel.append(nextActions);

  let active = null;
  let pauseGate = null;
  let generation = 0;
  let lastReport = null;
  let lastSetup = null;
  let campaignSeed = null;
  let rounds = Object.freeze([]);
  let awaitingNext = false;
  let nextRunAction = 'run';
  let replaySetupToRestore = null;
  let replayEntryToRun = null;
  let lastRunCampaignEntry = null;
  let restoreChoicePending = Boolean(savedCampaign);
  const captureSetup = () => ({ a: a.input.value, b: b.input.value, possessions: possessions.input.value,
    weight: weight.input.value, format: gameFormat.input.value, trials: trials.input.value,
    pick: call.input.value, stake: stake.input.value });
  const applySetup = setup => {
    a.input.value = setup.a; b.input.value = setup.b; possessions.input.value = setup.possessions;
    weight.input.value = setup.weight; gameFormat.input.value = setup.format; trials.input.value = setup.trials;
    call.input.value = setup.pick; stake.input.value = setup.stake;
    possessions.label.querySelector('output').textContent = `${setup.possessions} poss.`;
    weight.label.querySelector('output').textContent = `${Math.round(Number(setup.weight) * 100)}% own scoring rate · ${Math.round((1 - Number(setup.weight)) * 100)}% opponent allowed rate`;
    trials.label.querySelector('output').textContent = `${Number(setup.trials).toLocaleString()} runs`;
    updateMatchupBoard();
  };
  const replayCampaignRound = entry => {
    if (active) { status.textContent = 'Wait for the current matchup to finish before replaying a saved round.'; return; }
    if (!canReplayCampaignRound(entry, source)) {
      status.textContent = 'This saved round lacks the current model’s exact replay settings. Its score history remains available.';
      return;
    }
    const currentSetup = captureSetup();
    replaySetupToRestore = currentSetup;
    replayEntryToRun = entry;
    applySetup({
      a: entry.teams[0], b: entry.teams[1], possessions: String(entry.settings.possessions),
      weight: String(entry.settings.attackWeight), format: entry.settings.format, trials: String(entry.settings.trials),
      pick: entry.pick, stake: String(entry.stake),
    });
    nextRunAction = 'replay';
    if (sessionHud?.session.getState().status !== 'replay') {
      sessionHud?.session.replay(`Replaying round ${entry.round} from its saved seed; campaign score will not change.`);
    }
    status.textContent = `Replaying round ${entry.round} from its saved seed. Campaign score will not change.`;
    if (typeof form.requestSubmit !== 'function') {
      replaySetupToRestore = null;
      replayEntryToRun = null;
      nextRunAction = 'run';
      applySetup(currentSetup);
      status.textContent = 'This browser cannot submit a replay from the round history.';
      return;
    }
    form.requestSubmit();
  };
  const persistCampaign = () => {
    if (!storage || restoreChoicePending) return;
    try {
      if (!rounds.length) { storage.removeItem(storageKey); return; }
      storage.setItem(storageKey, JSON.stringify({
        version: GAME_LAB_CAMPAIGN_STORAGE_VERSION,
        scope: gameLabSourceScope(source), campaignSeed, nextPlan: nextPlan.input.value,
        phase: awaitingNext ? 'review' : 'choose', currentSetup: awaitingNext ? lastSetup : captureSetup(), lastSetup,
        rounds: rounds.map(({ round, teams, seed: roundSeed, pick, stake: roundStake, winner, delta, score, streak,
          settings: roundSettings, modelVersion, snapshot: roundSnapshot, season }) =>
          ({ round, teams, seed: roundSeed, pick, stake: roundStake, winner, delta, score, streak,
            settings: roundSettings, modelVersion, snapshot: roundSnapshot, season })),
      }));
    } catch { /* Storage is optional; the active campaign remains usable. */ }
  };
  const renderCampaign = () => {
    renderGameLabCampaignBoard(documentRef, campaignBoard, rounds, awaitingNext, source, replayCampaignRound);
    next.hidden = !awaitingNext || rounds.length >= GAME_LAB_CAMPAIGN_ROUNDS;
    nextPlan.label.hidden = next.hidden;
    resetCampaign.hidden = !rounds.length || restoreChoicePending;
  };
  renderCampaign();
  const resetCampaignState = () => {
    pauseGate?.resume();
    pauseGate = null;
    active?.abort();
    active = null;
    generation += 1;
    lastReport = null;
    lastSetup = null;
    campaignSeed = null;
    replayEntryToRun = null;
    lastRunCampaignEntry = null;
    rounds = Object.freeze([]);
    awaitingNext = false;
    replaySetupToRestore = null;
    nextPlan.input.value = 'balanced';
    nextRunAction = 'run';
    results.replaceChildren();
    busy(false);
    chooseDaily();
    sessionHud?.updateProvenance({
      scope: `Exact season · ${seasonLabel(source.seasonStartYear)}`,
      source: pinLabel(source.selectedPackageRef),
      output: 'Simulated matchup draw',
    });
    renderCampaign();
    status.textContent = 'Campaign reset.';
    call.input.focus?.({ preventScroll: true });
  };
  const sessionHud = mountSimulationSessionHud(documentRef, root, {
    id: 'gameLabSessionHud',
    objective: 'Simulation progress',
    steps: ['Choose matchup', 'Run simulation', 'Review outcome'],
    provenance: {
      scope: `Exact season · ${seasonLabel(source.seasonStartYear)}`,
      source: pinLabel(source.selectedPackageRef),
      output: 'Simulated matchup draw',
    },
    initialMessage: 'Ready to play.',
    onPause: () => {
      pauseGate?.pause();
      status.textContent = 'Game Lab paused at the last completed batch. Resume when ready.';
    },
    onResume: () => {
      pauseGate?.resume();
      status.textContent = 'Game Lab resumed. Building the next matchup batch…';
    },
    onCancel: () => {
      pauseGate?.resume();
      active?.abort();
      status.textContent = 'Cancelling this matchup experiment…';
    },
    onReset: resetCampaignState,
    onReplay: () => {
      const lastRound = lastRunCampaignEntry;
      if (!lastSetup?.seed || !lastRound) {
        status.textContent = 'Run Game Lab once before replaying it.';
        return;
      }
      replayCampaignRound(lastRound);
    },
  });
  const unsubscribeSessionPresentation = bindGameLabSessionPresentation(sessionHud);
  if (sessionHud) {
    sessionHud.element.classList.add('swishiq-game-lab__session');
    roundPanel.insertBefore(sessionHud.element, status);
  }
  const settings = [a.input, b.input, possessions.input, weight.input, gameFormat.input, trials.input];
  const busy = value => {
    form.querySelectorAll('input,select,button').forEach(controlElement => { controlElement.disabled = value; });
    cancel.disabled = false; cancel.hidden = !value;
    next.disabled = value;
    campaignBoard.querySelectorAll('.swishiq-game-lab__round-replay').forEach(button => {
      if (button.dataset.replayable === 'true') button.disabled = value;
    });
    if (!value && awaitingNext) [...settings, call.input, stake.input].forEach(controlElement => { controlElement.disabled = true; });
    daily.disabled = value || rounds.length > 0;
    run.disabled = value || awaitingNext;
    run.textContent = value ? 'Running…' : `Play round ${Math.min(rounds.length + 1, GAME_LAB_CAMPAIGN_ROUNDS)}`;
  };
  const clearResult = () => {
    if (awaitingNext) { status.textContent = 'Round recorded. Use Next round to continue or replay the recorded setup.'; return; }
    pauseGate?.resume();
    pauseGate = null;
    active?.abort(); generation += 1; results.replaceChildren();
    nextRunAction = 'run';
    sessionHud?.session.reset('Setup updated. Run to see a new simulation.');
    if (!active) status.textContent = 'Setup updated.';
  };
  settings.forEach(input => input.addEventListener('input', () => {
    if (awaitingNext) return;
    clearResult();
    if (input === a.input || input === b.input) { call.input.value = ''; lastReport = null; updateMatchupBoard(); }
    persistCampaign();
  }));
  [call.input, stake.input].forEach(input => input.addEventListener('input', () => {
    clearResult();
    persistCampaign();
  }));
  nextPlan.input.addEventListener('input', persistCampaign);
  resetCampaign.addEventListener('click', () => {
    if (!rounds.length || restoreChoicePending) return;
    sessionHud?.session.reset('Campaign reset. Choose a winner and stake for round 1.');
    resetCampaignState();
  });
  const chooseDaily = () => {
    if (rounds.length && !restoreChoicePending) return;
    const challenge = dailyMatchup(source.teams, source.snapshot, challengeDate());
    clearResult(); lastReport = null;
    busy(false);
    a.input.value = challenge.a; b.input.value = challenge.b;
    possessions.input.value = 100; weight.input.value = 0.5; weight.input.dispatchEvent(new Event('input'));
    trials.input.value = 200; gameFormat.input.value = 'game'; call.input.value = ''; stake.input.value = '1';
    nextPlan.input.value = 'balanced';
    updateMatchupBoard();
    status.textContent = 'A correct simulated draw earns the stake; a miss loses it; unresolved draws score zero.';
    persistCampaign();
  };
  resume.addEventListener('click', () => {
    if (!restoreChoicePending || !savedCampaign) return;
    restoreChoicePending = false;
    rounds = Object.freeze(savedCampaign.rounds.map(entry => Object.freeze({ ...entry,
      teams: Object.freeze([...entry.teams]),
      ...(entry.settings ? { settings: Object.freeze({ ...entry.settings }) } : {}),
      matchup: entry.teams.map(id => source.teams.find(team => team.id === id)?.name || id).join(' vs '),
    })));
    campaignSeed = savedCampaign.campaignSeed;
    lastSetup = savedCampaign.lastSetup;
    awaitingNext = savedCampaign.phase === 'review';
    lastRunCampaignEntry = rounds.at(-1) || null;
    nextPlan.input.value = savedCampaign.nextPlan;
    applySetup(savedCampaign.currentSetup || savedCampaign.lastSetup);
    restorePanel.hidden = true;
    renderCampaign(); busy(false);
    if (awaitingNext) {
      sessionHud?.session.complete('Saved campaign restored.');
      if (rounds.length === GAME_LAB_CAMPAIGN_ROUNDS) {
        status.textContent = `Campaign complete. ${rounds.at(-1).score >= GAME_LAB_CAMPAIGN_GOAL ? 'Goal met.' : 'Goal missed.'} Replay the final draw or reset campaign.`;
        const replay = sessionHud?.element.querySelector('.swishiq-session-hud__replay');
        (replay || resetCampaign).focus?.({ preventScroll: true });
      } else {
        status.textContent = 'Campaign restored. Replay this draw or choose the next scenario.';
        nextPlan.input.focus?.({ preventScroll: true });
      }
    } else {
      sessionHud?.session.reset('Saved campaign restored.');
      status.textContent = 'Campaign restored. Pick a winner to play.';
      call.input.focus?.({ preventScroll: true });
    }
    persistCampaign();
  });
  startOver.addEventListener('click', () => {
    if (!restoreChoicePending) return;
    restoreChoicePending = false;
    restorePanel.hidden = true;
    try { storage?.removeItem(storageKey); } catch { /* Storage is optional. */ }
    chooseDaily();
    status.textContent = 'New campaign ready.';
    call.input.focus?.({ preventScroll: true });
  });
  daily.addEventListener('click', chooseDaily);
  next.addEventListener('click', () => {
    if (!awaitingNext || rounds.length >= GAME_LAB_CAMPAIGN_ROUNDS) return;
    const setup = nextGameLabRoundSetup(source.teams, { round: rounds.length, teams: rounds.at(-1).teams }, campaignSeed, source.snapshot);
    const plan = GAME_LAB_ROUND_PLANS[nextPlan.input.value] || GAME_LAB_ROUND_PLANS.balanced;
    awaitingNext = false;
    replaySetupToRestore = null;
    applySetup({ ...captureSetup(), a: setup.a, b: setup.b, pick: '',
      possessions: String(plan.possessions), weight: String(plan.attackWeight) });
    results.replaceChildren();
    sessionHud?.session.reset('New matchup ready.');
    busy(false); renderCampaign();
    status.textContent = 'New matchup ready.';
    persistCampaign();
    call.input.focus?.({ preventScroll: true });
  });
  cancel.addEventListener('click', () => {
    sessionHud?.session.requestCancel('Cancelling this experiment…');
    pauseGate?.resume();
    active?.abort();
    status.textContent = 'Cancelling this experiment…';
  });
  chooseDaily();
  if (restoreChoicePending) {
    form.querySelectorAll('input,select,button').forEach(controlElement => { controlElement.disabled = true; });
    status.textContent = 'Saved campaign found for this exact season. Choose Resume campaign or Start over.';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (restoreChoicePending) { status.textContent = 'Choose Resume campaign or Start over first.'; return; }
    if (active) return;
    const replaying = nextRunAction === 'replay';
    if (awaitingNext && !replaying) { status.textContent = 'This round is recorded. Use Next round to continue.'; return; }
    if (a.input.value === b.input.value) { status.textContent = 'Choose two different teams.'; return; }
    if (!['a', 'b'].includes(call.input.value)) { status.textContent = 'Choose a winner before playing this round.'; call.input.focus?.(); return; }
    const replayRestoreSetup = replaying ? replaySetupToRestore : null;
    const replayEntry = replaying ? replayEntryToRun : null;
    if (replaying) { replaySetupToRestore = null; replayEntryToRun = null; }
    const runGeneration = ++generation;
    const own = new AbortController(); active = own; pauseGate = createSimulationPauseGate(); busy(true); results.replaceChildren();
    const pick = call.input.value;
    let sessionRunToken = null;
    const setSessionTerminal = (method, message) => {
      const update = sessionHud?.session?.[method];
      if (typeof update !== 'function') return;
      if (sessionRunToken) update.call(sessionHud.session, message, sessionRunToken);
      else update.call(sessionHud.session, message);
    };
    try {
      const requestedSeed = replaying ? replayEntry?.seed || '' : '';
      const resolvedSeed = resolveSimulationSeed(requestedSeed, 'game-lab');
      const setup = { a: a.input.value, b: b.input.value, possessions: possessions.input.value, weight: weight.input.value,
        format: gameFormat.input.value, trials: trials.input.value, pick, stake: stake.input.value, seed: resolvedSeed.seed };
      const first = source.payloadById.get(a.input.value);
      const second = source.payloadById.get(b.input.value);
      if (!first || !second) throw new Error('Choose two teams from the selected exact package.');
      const runAction = nextRunAction;
      nextRunAction = 'run';
      const sessionRun = sessionHud?.session.begin(runAction, { step: 1, feedback: runAction === 'replay' ? 'Replaying the saved draw…' : 'Simulating the matchup…' });
      sessionRunToken = sessionRun?.runToken || null;
      const simulated = await simulateMatchup({ a: first, b: second, season: source.seasonStartYear, seed: resolvedSeed.seed,
        possessions: Number(possessions.input.value), trials: Number(trials.input.value), attackWeight: Number(weight.input.value), format: gameFormat.input.value }, {
        signal: own.signal,
        onProgress: progress => {
          if (runGeneration !== generation) return;
          const percent = Math.round(progress * 100);
          sessionHud?.session.setProgress(progress, `Game Lab is running… ${percent}% of the matchup trials are complete.`, sessionRunToken);
          status.textContent = `Simulating… ${percent}%`;
        },
        yieldEveryBatch: () => pauseGate?.wait(own.signal) || Promise.resolve(),
      });
      if (runGeneration !== generation) return;
      renderReport(documentRef, results, source, simulated, pick, lastReport, {});
      if (!replaying) {
        if (!campaignSeed) campaignSeed = resolvedSeed.seed;
        const matchup = `${source.teams.find(team => team.id === setup.a)?.name || setup.a} vs ${source.teams.find(team => team.id === setup.b)?.name || setup.b}`;
        const updatedRounds = advanceGameLabCampaign(rounds, { report: simulated, pick, stake: setup.stake, matchup });
        if (updatedRounds === rounds) throw new Error('This matchup already scored. Choose a new matchup for this round.');
        rounds = updatedRounds;
        lastSetup = setup;
        awaitingNext = true;
        lastRunCampaignEntry = rounds.at(-1);
      } else if (replayEntry) {
        lastRunCampaignEntry = replayEntry;
      }
      lastReport = simulated;
      renderCampaign();
      persistCampaign();
      sessionHud?.updateProvenance({
        scope: `Exact season · ${seasonLabel(simulated.season)}`,
        source: pinLabel(source.selectedPackageRef),
        matchup: `${source.teams.find(team => team.id === simulated.teams[0])?.name || simulated.teams[0]} vs ${source.teams.find(team => team.id === simulated.teams[1])?.name || simulated.teams[1]}`,
        output: 'Simulated matchup draw',
      });
      setSessionTerminal('complete', replaying ? 'Replay complete.' : 'Round scored.');
      const scored = rounds.at(-1);
      status.textContent = replaying ? 'Exact replay complete. Campaign score is unchanged.' : rounds.length === GAME_LAB_CAMPAIGN_ROUNDS
        ? `Campaign complete: ${scored.score >= 0 ? '+' : ''}${scored.score} points. ${scored.score >= GAME_LAB_CAMPAIGN_GOAL ? 'Goal met.' : 'Goal missed.'}`
        : `Round ${scored.round}: ${scored.delta >= 0 ? '+' : ''}${scored.delta} points. Total ${scored.score >= 0 ? '+' : ''}${scored.score}. Choose the next scenario.`;
    } catch (error) {
      if (runGeneration === generation) {
        const message = error?.name === 'AbortError' ? 'Experiment cancelled. No partial matchup result was saved.' : (error?.message || 'The experiment could not run.');
        if (error?.name === 'AbortError') setSessionTerminal('cancelled', message);
        else setSessionTerminal('fail', message);
        status.textContent = message;
      }
    } finally {
      if (replaying && replayRestoreSetup && runGeneration === generation) {
        applySetup(replayRestoreSetup);
        persistCampaign();
      }
      if (active === own) { active = null; pauseGate?.resume(); pauseGate = null; busy(false); }
    }
  });
  return {
    chooseDaily,
    destroy: () => {
      pauseGate?.resume();
      pauseGate = null;
      active?.abort();
      generation += 1;
      sessionHud?.destroy?.();
      unsubscribeSessionPresentation();
      evaluationUi.destroy();
      form.replaceChildren();
    },
  };
}

async function loadSource({ selection, fetchImpl }) {
  assertSwishIqV3SourceAllowed({ consumerId: 'studio-native-game-lab' });
  if (!selection?.packageId || !selection?.packageVersion) throw new Error('Choose a published exact season before opening Game Lab.');
  const nativeSource = await loadNativeSeasonLabSource({
    scope: 'exact-season',
    packageRefs: [{ packageId: selection.packageId, packageVersion: selection.packageVersion }],
    requiredCapabilities: ['seasonSimulation'],
    fetchImpl,
  });
  const selectedNative = selectNativeSeasonLabPackages(nativeSource);
  const seasonStartYear = Number(nativeSource.source?.seasonStartYears?.[0]);
  if (nativeSource.source?.kind !== 'exact-season'
    || !Number.isSafeInteger(seasonStartYear)
    || !GAME_LAB_POLICY.seasons.includes(seasonStartYear)
    || selectedNative.packages.length !== 1) {
    throw new Error('Game Lab requires an exact native season; pooled history is not a matchup substitute.');
  }
  const proof = { package: selectedNative.packages[0].packageRef };
  return buildGameSource({ proof, nativeSource, selectedNative, seasonStartYear });
}

/**
 * Public source-loader contract for static consumers and cross-lab handoffs.
 * It accepts only a pinned native exact-season selection and delegates team
 * evidence admission to the registry-backed Season Lab loader.
 */
export async function loadSwishIqGameLabSource({ packageId, packageVersion, fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
  return loadSource({ selection: { packageId, packageVersion }, fetchImpl });
}

export function startSwishIqGameLab({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  loadTimeoutMs = SWISHIQ_GAME_LAB_LOAD_TIMEOUT_MS,
} = {}) {
  if (!documentRef) return null;
  const root = documentRef.getElementById('gameLabPanel'); if (!root) return null;
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button')];
  let token = 0;
  let mounted = null;
  let activeLoadController = null;
  let activeLoadTimeoutId = null;
  // Keep the verified exact source across tab switches. The controls are
  // intentionally rebuilt after teardown so a running simulation is always
  // cancelled, but the immutable package parts do not need to be fetched and
  // hashed again when the visitor returns to the same selection.
  let loadedSource = null;
  let loadedSourceKey = '';
  const active = () => documentRef.querySelector('.swishiq-tabs button[aria-pressed="true"]')?.dataset.workbench || '';
  const render = async () => {
    const current = ++token;
    activeLoadController?.abort();
    activeLoadController = null;
    if (activeLoadTimeoutId !== null) globalThis.clearTimeout(activeLoadTimeoutId);
    activeLoadTimeoutId = null;
    if (active() !== 'game') {
      mounted?.destroy?.(); mounted = null;
      // An in-flight source load can belong to the previous Game tab. Its
      // stale finally block intentionally cannot clear the newer token, so
      // clear the hidden panel's busy state at the inactive boundary here.
      setWorkspace(documentRef, false);
      root.hidden = true;
      root.removeAttribute('aria-busy');
      return;
    }
    setWorkspace(documentRef, true, 'Game Lab loading', 'Loading matchup data…');
    mounted?.destroy?.(); mounted = null;
    const selection = currentSelection(documentRef);
    const selectionKey = selection ? `${selection.packageId}@${selection.packageVersion}` : '';
    root.hidden = false; root.setAttribute('aria-busy', 'true');
    const loadingStatus = createElement(documentRef, 'p', 'Checking the selected season…', 'swishiq-game-lab__status');
    loadingStatus.setAttribute('role', 'status');
    loadingStatus.setAttribute('aria-live', 'polite');
    root.replaceChildren(createElement(documentRef, 'h2', 'Game Lab'), loadingStatus);
    let loadController = null;
    try {
      let source;
      if (loadedSource && loadedSourceKey === selectionKey) {
        source = loadedSource;
      } else {
        loadController = typeof AbortController === 'function' ? new AbortController() : null;
        activeLoadController = loadController;
        const guardedFetch = loadController && typeof fetchImpl === 'function'
          ? (input, init = {}) => fetchImpl(input, { ...init, signal: loadController.signal })
          : fetchImpl;
        const sourcePromise = loadSource({ selection, fetchImpl: guardedFetch });
        let timedOut = false;
        const abortPromise = new Promise((_, reject) => loadController?.signal.addEventListener('abort', () => {
          if (!timedOut) reject(Object.assign(new Error('Game Lab source check cancelled.'), { name: 'AbortError' }));
        }, { once: true }));
        const timeoutPromise = new Promise((_, reject) => {
          activeLoadTimeoutId = globalThis.setTimeout(() => {
            timedOut = true;
            loadController?.abort();
            reject(new Error(GAME_LAB_LOAD_TIMEOUT_MESSAGE));
          }, gameLabLoadTimeoutMs(loadTimeoutMs));
        });
        source = await Promise.race([sourcePromise, timeoutPromise, abortPromise]);
      }
      if (current !== token || active() !== 'game') return;
      if (source !== loadedSource) {
        loadedSource = source;
        loadedSourceKey = selectionKey;
      }
      mounted = renderGameLabWorkbench(documentRef, root, source, { fetchImpl });
      setWorkspace(documentRef, true, 'Game Lab ready', `Play matchups from ${seasonLabel(source.seasonStartYear)}.`);
    } catch (error) {
      if (current !== token || active() !== 'game') return;
      const retry = createElement(documentRef, 'button', 'Retry Game Lab data', 'button button-secondary swishiq-game-lab__retry');
      retry.type = 'button';
      retry.addEventListener('click', () => { void render(); });
      const errorStatus = createElement(documentRef, 'p', error?.message || 'The selected Game Lab data is unavailable.', 'swishiq-game-lab__status swishiq-game-lab__status--error');
      errorStatus.setAttribute('role', 'alert');
      root.replaceChildren(createElement(documentRef, 'h2', 'Game Lab'), errorStatus, retry);
      setWorkspace(documentRef, true, 'Game Lab unavailable', 'An exact native team package is required for the possession scenario.');
    } finally {
      if (activeLoadController === loadController) {
        if (activeLoadTimeoutId !== null) globalThis.clearTimeout(activeLoadTimeoutId);
        activeLoadController = null;
        activeLoadTimeoutId = null;
      }
      if (current === token) root.removeAttribute('aria-busy');
    }
  };
  // Studio and each workbench are separate module scripts. Read the active
  // tab after the click dispatch completes so module evaluation order cannot
  // trigger a stale render for the previous workbench.
  const handle = () => queueMicrotask(() => { void render(); });
  tabs.forEach(tab => tab.addEventListener('click', handle));
  documentRef.getElementById('packageSelect')?.addEventListener('change', handle);
  root.hidden = true;
  return Object.freeze({ reload: render, activate: render });
}

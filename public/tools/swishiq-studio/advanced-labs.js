/*
 * Browser adapters for the package-backed Player Builder and Career Lab.
 *
 * This file deliberately owns only the two advanced Studio panels. It loads
 * a verified public projection, converts the allowlisted rows into the
 * existing model contracts, and never reaches Supabase or a private package.
 * Composite Forge starts from the selected exact package; cross-season
 * browsing is an explicit opt-in to individually verified exact-season rows.
 */

import {
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  SWISHIQ_PUBLIC_REGISTRY_FORMAT,
  SWISHIQ_PUBLIC_REGISTRY_VERSION,
  loadSwishIqExactPackageProof,
  loadSwishIqPublishedPackageProof,
  loadSwishIqPublicPart,
  registryRevisionSha256,
} from './studio-runtime/modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-studio-runtime-v1';
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioExactSeasonData,
  loadCanonicalV4StudioPooledData,
} from './engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure';
import { adaptNativeCompositeForgeCohort, adaptPublishedCompositeForgeCohort } from './engine/composite-forge-native.js?v=20261002f&rev=native-composite-forge-v6-v4-observed-rows';
import { adaptPublishedCareerHistories } from './engine/career-simulation-model.js?v=20260928i&rev=career-public-receipt-v21-phase9-share-v1-20260928i';
import {
  COMPOSITE_ARCHETYPES,
  COMPOSITE_FORGE_COMPONENTS,
  COMPOSITE_FORGE_LIMITS,
  COMPOSITE_FORGE_MODEL_VERSION,
  buildCompositeForge,
  createCompositeForgeExactPackageSetRef,
  normalizeCompositeForgePackageRef,
  readCompositeMetric,
  loadCompositeForgeRecipe,
  migrateLegacyCompositeForgeRecipe,
  saveCompositeForgeRecipe,
} from './engine/composite-forge.js?v=20261002f&rev=composite-forge-v22-exact-season-fail-closed-v1';
import { renderCompositeForgePublicShareAction } from './composite-public-result-share.js?v=20261001f&rev=composite-public-share-v4-share-client-contract-closure-v1';
import {
  CAREER_STAGES,
  buildCareerCohort,
  buildCareerTimeline,
  resolveCareerAsOfState,
  simulateCareer,
  summarizeCareer,
} from './engine/career-simulator.js?v=20260928i&rev=career-output-cleanup-v18-phase9-share-v1-20260928i';
import {
  buildCareerSimulationRecipe,
  buildPublicCareerSimulationReceipt,
  loadCareerSimulationRecipe,
  saveCareerSimulationRecipe,
} from './engine/career-simulation-model.js?v=20260928i&rev=career-public-receipt-v21-phase9-share-v1-20260928i';
import { publishSwishIqLabHandoff } from './integration-bridge.js?v=20261002b&rev=swishiq-studio-cross-lab-v4-reviewed-release-pin-v1';
import { loadSwishIqPlayerMetadata } from './player-metadata.js?v=20260927s&rev=player-metadata-source-v2';
import {
  createStatSlab,
  filterSelectorRecords,
  createPlayerAvatar,
} from './selector-system.js?v=20260927s&rev=transparent-player-webp-v1';
import {
  loadSwishIqPublicPlayerSeasonStats,
  loadSwishIqPublicPlayerContext,
  mergePublicStatsIntoPlayerSeason,
  publicStatsForPlayerSeason,
  playerContextForPlayer,
} from './player-context.js?v=20261001e&rev=player-context-v4-source-gate-v1';
import {
  CAREER_STATE_INDEX_FORMAT,
  careerStateForPlayerSeason,
  careerStateNameRefConflicts,
  normalizeCareerStateIndex,
  normalizeCareerStateName,
} from './engine/career-state-source.js?v=20260927s&rev=career-state-v8-identity-collision-guard';
import { resolveSimulationSeed } from './engine/simulation-seed.js?v=20260920c&rev=random-by-default-v1';
import { mountSimulationSessionHud } from './simulation-session-ui.js?v=20260927s&rev=session-loop-v5-reset-restore-replay';

export const SWISHIQ_ADVANCED_LABS_VERSION = 'swishiq-advanced-labs-v1';
export const SWISHIQ_ADVANCED_REGISTRY_URL = new URL(
  SWISHIQ_PUBLIC_REGISTRY_PATH,
  new URL('./studio-runtime/modules/swishiq-static-projection.js', import.meta.url),
).toString();
export const SWISHIQ_POOLED_PACKAGE_ID = 'nba-swishiq-v3-2017-26';
export const SWISHIQ_POOLED_PACKAGE_VERSION = 'v3-2017-26-0be021b13423';
export const SWISHIQ_POOLED_PACKAGE_VERSION_PATTERN = /^v3-2017-26-[a-f0-9]{12}$/;
const SWISHIQ_V3_MODEL = 'swishiq-v3';

export const COMPOSITE_STORAGE_KEY = 'swishiq-composite-forge-v1';
export const CAREER_STORAGE_KEY = 'swishiq-career-simulation-v1';
export const COMPOSITE_SESSION_KEY = 'swishiq-composite-round-session-v1';
export const CAREER_SESSION_KEY = 'swishiq-career-policy-session-v1';
export const CAREER_STATE_INDEX_URL = new URL('./data/career-state-index-v1.json?v=20260920c&rev=career-state-source-v1', import.meta.url).toString();
// Loaded after the shared Studio sheet so the Career Lab can evolve its
// dashboard treatment without changing the shell, palette, or other
// workbenches. The stylesheet is still local and cache-busted with the
// module's revision, so a browser never depends on an untracked asset.
export const CAREER_VISUAL_STYLES_URL = new URL('./career-lab-visuals.css?v=20260927s&rev=career-lab-visual-readable-text-v10-public-season-tables', import.meta.url).toString();
const PHASE = 'regular';
// Keep the public cohort bounded for unusually large future packages, but do
// not silently throw away ordinary rows from the pooled 2017–26 package (the
// current accepted cohort is just over 4,600 eligible player-seasons).  The
// UI exposes this limit and paginates the rows that are loaded below.
const PROFILE_LIMIT = 6000;
export const PLAYER_BUILDER_DONOR_PAGE_SIZE = 40;
export const PLAYER_BUILDER_PROFILE_LIMIT = PROFILE_LIMIT;
const CAREER_HISTORY_LIMIT = 240;
const CAREER_LOOKUP_SELECTION_GRACE_MS = 1800;
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const TEAM_CODE = /^[A-Z]{3}$/;
const CAREER_METRIC_KEYS = Object.freeze(['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks']);
const CAREER_STAGE_BY_EXPERIENCE = Object.freeze([
  [0, 'rookie'], [3, 'early-career'], [9, 'prime'], [40, 'late-career'],
]);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = value => Number.isSafeInteger(value);
const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value, maximum = 240) => typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : null;
const round = value => finite(value) ? Math.round(value * 10000) / 10000 : null;
const labelSeason = year => `${year}–${String(year + 1).slice(-2)}`;

function fail(message) { throw new Error(message); }

function browserStorage() {
  try {
    return globalThis?.localStorage && typeof globalThis.localStorage.getItem === 'function'
      ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function browserSessionStorage() {
  try {
    return globalThis?.sessionStorage && typeof globalThis.sessionStorage.getItem === 'function'
      ? globalThis.sessionStorage : null;
  } catch { return null; }
}

function readRoundSnapshot(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw && raw.length <= 4096 ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveRoundSnapshot(storage, key, snapshot) {
  try {
    const raw = JSON.stringify(snapshot);
    if (raw.length <= 4096) storage?.setItem(key, raw);
  } catch { /* Session storage may be blocked or full; the live round still works. */ }
}

function clearRoundSnapshot(storage, key) {
  try { storage?.removeItem(key); } catch { /* The current session remains usable. */ }
}

async function loadPublicContextBestEffort(fetchImpl) {
  try {
    return await loadSwishIqPublicPlayerContext({ fetchImpl });
  } catch {
    // The native package remains the authoritative identity and capability
    // source. Public context only corrects reviewed display/model totals when
    // the companion artifact is available.
    return null;
  }
}

function yieldCareerLookupPaint() {
  return new Promise(resolve => {
    let settled = false;
    let fallbackTimer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      resolve();
    };
    fallbackTimer = setTimeout(finish, 120);
    if (globalThis.document?.visibilityState !== 'hidden' && typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => setTimeout(finish, 0));
    } else {
      setTimeout(finish, 0);
    }
  });
}

async function loadCareerStateIndex(fetchImpl) {
  try {
    const response = await fetchImpl(CAREER_STATE_INDEX_URL, { cache: 'no-store', credentials: 'omit' });
    if (!response?.ok) return null;
    const value = JSON.parse(await response.text());
    return value?.format === CAREER_STATE_INDEX_FORMAT ? normalizeCareerStateIndex(value) : null;
  } catch { /* state remains unavailable and the UI keeps explicit inputs */ }
  return null;
}

async function loadCareerMetadata(fetchImpl) {
  try { return await loadSwishIqPlayerMetadata({ fetchImpl }); }
  catch { /* metadata remains optional for unmatched records */ }
  return new Map();
}

function enrichPublicSeasonRows(records, publicContext, { withholdAmbiguousPlayerNames = false } = {}) {
  if (!Array.isArray(records) || !(publicContext instanceof Map)) return records;
  const identityConflicts = withholdAmbiguousPlayerNames ? careerStateNameRefConflicts(records) : null;
  return records.map(row => {
    const normalizedName = normalizeCareerStateName(row?.displayName);
    if (identityConflicts?.has(normalizedName)) return row;
    return mergePublicStatsIntoPlayerSeason(
      row,
      playerContextForPlayer(publicContext, row?.displayName),
    );
  });
}

const compositePublicStatsCaches = new WeakMap();

function compositePublicStatsCacheFor(fetchImpl) {
  if (!fetchImpl || typeof fetchImpl !== 'function') return { records: new Map(), promises: new Map() };
  let cache = compositePublicStatsCaches.get(fetchImpl);
  if (!cache) {
    cache = { records: new Map(), promises: new Map(), failures: new Set() };
    compositePublicStatsCaches.set(fetchImpl, cache);
  }
  return cache;
}

function loadCompositePublicStatsForYear(year, fetchImpl) {
  const cache = compositePublicStatsCacheFor(fetchImpl);
  if (cache.records.has(year)) return Promise.resolve(cache.records.get(year));
  if (cache.promises.has(year)) return cache.promises.get(year);
  const request = (async () => {
    try {
      const records = await loadSwishIqPublicPlayerSeasonStats({ seasonStartYear: year, fetchImpl });
      cache.records.set(year, records);
      cache.failures.delete(year);
      return records;
    } catch {
      // Keep failures retryable when the user revisits this season.
      cache.failures.add(year);
      return new Map();
    }
  })().finally(() => {
    cache.promises.delete(year);
  });
  cache.promises.set(year, request);
  return request;
}

function publicSeasonStatsForCompositeProfile(profile, fetchImpl) {
  const cache = compositePublicStatsCacheFor(fetchImpl);
  if (cache.failures.has(profile?.seasonStartYear)) return null;
  const records = cache.records.get(profile?.seasonStartYear);
  return publicStatsForPlayerSeason(playerContextForPlayer(records, profile?.player), {
    seasonStartYear: profile?.seasonStartYear,
    teamCode: profile?.team,
  });
}

function packageRef(proof, acceptedPooledPackage = false) {
  if (!proof?.package || !proof.registry) fail('A verified SwishIQ package is required.');
  return {
    ...proof.package,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    acceptedPooledPackage,
  };
}

async function loadArtifact(proof, artifactId, kind, capability, fetchImpl) {
  const part = await loadSwishIqPublicPart(proof, { artifactId, kind, capability, fetchImpl });
  if (!Array.isArray(part.value?.records)) fail(`The validated native ${kind} artifact has no records.`);
  return part;
}

function metric(row, keys) {
  for (const key of keys) {
    const value = row?.metrics?.[key];
    if (value && ['available', 'observed', 'limited_sample'].includes(value.status) && finite(value.value)) {
      return { ...value, sourceMetric: key };
    }
  }
  return null;
}

function component(row, keys, unit, fallback = null) {
  const value = metric(row, keys) || fallback;
  if (!value || !finite(value.value)) return { status: 'unavailable', value: null, unit };
  return {
    status: value.status === 'available' ? 'observed' : value.status,
    value: value.value,
    unit,
    numerator: finite(value.numerator) ? value.numerator : finite(value.total) ? value.total : null,
    denominator: finite(value.denominator) ? value.denominator : null,
    knownGames: integer(value.knownGames) ? value.knownGames : integer(row.games) ? row.games : null,
    evidenceKind: value.evidenceKind || 'observed',
    coverage: value.coverage || 'normalized-observed-season',
    sourceCoverage: Array.isArray(value.sourceCoverage) ? [...value.sourceCoverage] : value.coverage ? [value.coverage] : [],
    reason: text(value.reason, 240),
    sourceReason: text(value.sourceReason, 240) || text(value.reason, 240),
    sourceReasons: Array.isArray(value.sourceReasons) ? [...value.sourceReasons] : [],
    sourceMetric: value.sourceMetric,
  };
}

const COMPOSITE_METRIC_ALIASES = Object.freeze({
  pointsPerGame: ['pointsPerGame'], assistsPerGame: ['assistsPerGame'], reboundsPerGame: ['reboundsPerGame'],
  turnoversPerGame: ['turnoversPerGame'], stealsPerGame: ['stealsPerGame'], blocksPerGame: ['blocksPerGame'],
  fieldGoalPercentage: ['fieldGoalPercentage', 'fgAccuracy'], threePointPercentage: ['threePointPercentage', 'threeAccuracy'],
  threePointAttemptShare: ['threePointAttemptShare', 'threePointAttemptRate', 'threeAttemptShare'],
  freeThrowPercentage: ['freeThrowPercentage', 'ftAccuracy'], involvementPer36: ['involvementPer36'],
  trueShootingPercentage: ['trueShootingPercentage', 'trueShootingApproximation'],
  effectiveFieldGoalPercentage: ['effectiveFieldGoalPercentage', 'effectiveFieldGoal'],
});
const COMPOSITE_RATIO_METRICS = new Set(['fieldGoalPercentage', 'threePointPercentage', 'threePointAttemptShare', 'freeThrowPercentage', 'trueShootingPercentage', 'effectiveFieldGoalPercentage']);

function rawMetric(row, aliases) {
  return metric(row, aliases);
}

function aggregateMetricProvenance(values) {
  const limitedReasons = [...new Set(values
    .filter(value => value.status === 'limited_sample')
    .map(value => text(value.sourceReason, 240) || text(value.reason, 240))
    .filter(Boolean))].sort();
  const sourceCoverage = [...new Set(values.map(value => text(value.coverage, 240)).filter(Boolean))].sort();
  const reason = limitedReasons.length === 1 ? limitedReasons[0]
    : limitedReasons.length > 1 ? 'multiple-source-limited-sample-reasons' : null;
  return {
    ...(reason ? { reason, sourceReason: reason, sourceReasons: limitedReasons } : {}),
    sourceCoverage,
  };
}

function aggregateMetric(rows, name, totalGames, totalMinutes) {
  const aliases = COMPOSITE_METRIC_ALIASES[name];
  const values = rows.map(row => {
    const value = rawMetric(row, aliases);
    return value ? { ...value, knownGames: integer(value.knownGames) ? value.knownGames : Number(row.games), minutes: finite(value.minutes) ? value.minutes : Number(row.minutes) } : null;
  });
  const usable = values.filter(Boolean);
  if (!usable.length) return null;
  const status = usable.some(value => value.status === 'limited_sample') ? 'limited_sample' : 'observed';
  const sourceMetric = usable[0].sourceMetric;
  const provenance = aggregateMetricProvenance(usable);
  if (COMPOSITE_RATIO_METRICS.has(name)) {
    const numerator = usable.every(value => finite(value.numerator)) ? usable.reduce((sum, value) => sum + value.numerator, 0) : null;
    const denominator = usable.every(value => finite(value.denominator) && value.denominator > 0)
      ? usable.reduce((sum, value) => sum + value.denominator, 0) : null;
    if (numerator !== null && denominator !== null && denominator > 0) {
      return { status, value: numerator / denominator, numerator, denominator, knownGames: totalGames, evidenceKind: 'observed-combined-stints', coverage: 'all-team-denominator-sum', sourceMetric, ...provenance };
    }
    // A published all-team row can carry a valid percentage even when the
    // provider omitted its component counts. Do not synthesize a denominator
    // for a collection of stints; retain the value only for the explicit row.
    if (rows.length === 1 && finite(usable[0].value)) return { ...usable[0], ...provenance, status, sourceMetric };
    return null;
  }
  if (name === 'involvementPer36') {
    const weighted = usable.filter(value => finite(value.value) && finite(value.minutes ?? value.exposure));
    if (!weighted.length) return null;
    const denominator = weighted.reduce((sum, value) => sum + Number(value.minutes ?? value.exposure), 0);
    return denominator > 0 ? { status, value: weighted.reduce((sum, value) => sum + value.value * Number(value.minutes ?? value.exposure), 0) / denominator,
      numerator: null, denominator: totalMinutes, knownGames: totalGames, evidenceKind: 'observed-combined-stints', coverage: 'minute-weighted-stints', sourceMetric, ...provenance } : null;
  }
  const weighted = usable.filter(value => finite(value.value));
  const denominator = weighted.reduce((sum, value) => sum + (finite(value.knownGames) ? value.knownGames : 0), 0);
  if (!weighted.length) return null;
  if (weighted.every(value => finite(value.numerator)) && denominator > 0) {
    const numerator = weighted.reduce((sum, value) => sum + value.numerator, 0);
    return { status, value: numerator / denominator, numerator, denominator, knownGames: totalGames, evidenceKind: 'observed-combined-stints', coverage: 'game-weighted-stints', sourceMetric, ...provenance };
  }
  const gameWeighted = weighted.filter(value => finite(value.knownGames) && value.knownGames > 0);
  if (!gameWeighted.length) return null;
  const games = gameWeighted.reduce((sum, value) => sum + value.knownGames, 0);
  return { status, value: gameWeighted.reduce((sum, value) => sum + value.value * value.knownGames, 0) / games,
    numerator: null, denominator: games, knownGames: totalGames, evidenceKind: 'observed-combined-stints', coverage: 'game-weighted-stints', sourceMetric, ...provenance };
}

function isAllTeamRow(row) {
  const teamCode = String(row?.teamCode || '').trim().toUpperCase();
  return row?.isMultiTeamAggregate === true || row?.scope === 'all-teams'
    || ['ALL', 'ALL_TEAMS', 'TOT'].includes(teamCode) || /^\d+TM$/.test(teamCode)
    || String(row?.team || '').trim().toLowerCase() === 'all teams';
}

function sourceRowProvenance(rows) {
  return rows.map(row => ({
    teamCode: text(row.teamCode, 16),
    team: text(row.team, 80),
    scope: isAllTeamRow(row) ? 'all-teams' : 'team',
    games: Number(row.games),
    minutes: Number(row.minutes),
  })).sort((left, right) => String(left.teamCode || '').localeCompare(String(right.teamCode || ''))
    || left.games - right.games || left.minutes - right.minutes);
}

function compositeStateEvidence(rows, method) {
  const conflicts = [];
  const resolve = (field, minimum, maximum) => {
    const values = [...new Set((Array.isArray(rows) ? rows : [])
      .map(row => row?.[field])
      .filter(value => integer(value) && value >= minimum && value <= maximum))];
    if (values.length > 1) conflicts.push({ field, values: [...values].sort((left, right) => left - right), method });
    return values.length === 1 ? values[0] : null;
  };
  const age = resolve('age', 0, 150);
  const experience = resolve('experience', 0, 40);
  const inheritedConflicts = (Array.isArray(rows) ? rows : []).flatMap(row => Array.isArray(row?.stateConflict) ? row.stateConflict : []);
  const stateConflict = [...conflicts, ...inheritedConflicts].length ? [...conflicts, ...inheritedConflicts] : null;
  const stateSource = age !== null || experience !== null || stateConflict
    ? text(rows?.[0]?.stateSource, 160) || method : null;
  const ageSource = age === null ? null : text(rows.find(row => row?.age === age)?.ageSource, 160) || stateSource;
  const experienceSource = experience === null ? null : text(rows.find(row => row?.experience === experience)?.experienceSource, 160) || stateSource;
  return {
    age, experience, ageSource, experienceSource, stateSource,
    stateJoin: stateConflict ? 'conflict' : age !== null && experience !== null ? `${method}-complete` : age !== null || experience !== null ? `${method}-partial` : 'missing',
    stateQuality: stateConflict ? 'conflict' : age !== null && experience !== null ? 'observed' : age !== null || experience !== null ? 'partial' : 'missing',
    stateConflict,
  };
}

/**
 * Combine traded-player stints once per player-season. A published all-team
 * row wins over its component stints; otherwise count-backed totals and
 * denominators are summed and rates are recomputed. This prevents a high-rate
 * short stint from masquerading as the player's season while preserving the
 * source rows and method for the donor provenance panel.
 */
export function aggregateCompositePlayerSeasons(records) {
  if (!Array.isArray(records)) fail('Composite player-season records must be an array.');
  const groups = new Map();
  for (const row of records) {
    if (!object(row) || !PLAYER_REF.test(String(row.playerRef || '')) || row.phase !== PHASE
      || !integer(Number(row.seasonStartYear)) || !integer(Number(row.games)) || Number(row.games) < 1
      || !finite(Number(row.minutes)) || Number(row.minutes) <= 0) continue;
    const key = `${row.playerRef}|${Number(row.seasonStartYear)}|${row.phase}`;
    const group = groups.get(key) || [];
    group.push(row); groups.set(key, group);
  }
  const aggregate = rows => {
    const explicit = rows.filter(isAllTeamRow);
    if (explicit.length === 1) {
      return { ...explicit[0], ...compositeStateEvidence(explicit, 'package-observed-all-team-row'), teamCode: 'ALL', team: 'All teams', scope: 'all-teams',
        aggregation: { method: 'published-all-teams-row-v1', sourceTeams: rows.map(row => row.teamCode).filter(Boolean).sort(), sourceRowCount: rows.length,
          sourceRows: sourceRowProvenance(rows) } };
    }
    if (explicit.length > 1) {
      const fingerprints = new Set(explicit.map(row => JSON.stringify({ games: row.games, minutes: row.minutes, metrics: row.metrics })));
      if (fingerprints.size === 1) return { ...explicit[0], ...compositeStateEvidence(explicit, 'package-observed-all-team-row'), teamCode: 'ALL', team: 'All teams', scope: 'all-teams', aggregation: { method: 'deduplicated-all-teams-row-v1', sourceTeams: ['ALL'], sourceRowCount: rows.length,
        sourceRows: sourceRowProvenance(rows) } };
      return null;
    }
    const first = [...rows].sort((a, b) => String(a.teamCode).localeCompare(String(b.teamCode)))[0];
    const games = rows.reduce((sum, row) => sum + Number(row.games), 0);
    const minutes = rows.reduce((sum, row) => sum + Number(row.minutes), 0);
    const metrics = {};
    for (const name of Object.keys(COMPOSITE_METRIC_ALIASES)) {
      const value = aggregateMetric(rows, name, games, minutes);
      if (value) metrics[name] = value;
    }
    return { ...first, ...compositeStateEvidence(rows, 'package-observed-player-season'), teamCode: 'ALL', team: 'All teams', scope: 'all-teams', games, minutes,
      metrics, positions: [...new Set(rows.flatMap(row => Array.isArray(row.positions) ? row.positions : []))].sort(),
      aggregation: { method: 'summed-team-stints-v1', sourceTeams: rows.map(row => row.teamCode).filter(Boolean).sort(), sourceRowCount: rows.length,
        sourceRows: sourceRowProvenance(rows) } };
  };
  return [...groups.values()].map(aggregate).filter(Boolean).sort((a, b) => String(a.playerRef).localeCompare(String(b.playerRef)) || Number(a.seasonStartYear) - Number(b.seasonStartYear));
}

/** Convert one buyer-safe player-season row to the Composite Forge model. */
export function toCompositeProfile(row) {
  if (!object(row) || !PLAYER_REF.test(String(row.playerRef || ''))
    || !(TEAM_CODE.test(String(row.teamCode || '')) || row.teamCode === 'ALL') || !integer(Number(row.seasonStartYear))
    || row.phase !== PHASE || row.observed !== true || !integer(Number(row.games)) || Number(row.games) < 1
    || !finite(Number(row.minutes)) || Number(row.minutes) <= 0) return null;
  const games = Number(row.games);
  const metrics = row.metrics || {};
  const age = integer(row.age) && row.age >= 0 && row.age <= 150 ? row.age : null;
  const experience = integer(row.experience) && row.experience >= 0 && row.experience <= 40 ? row.experience : null;
  const stateSource = text(row.stateSource, 160) || (age !== null || experience !== null ? 'package-observed-player-season' : null);
  const profiles = {
    key: `${row.playerRef}|${row.seasonStartYear}|${PHASE}|${row.teamCode}`,
    playerId: row.playerRef,
    player: text(row.displayName, 160) || 'Unnamed player',
    playerName: text(row.displayName, 160) || 'Unnamed player',
    seasonStartYear: Number(row.seasonStartYear),
    phase: PHASE,
    scope: row.teamCode === 'ALL' || row.scope === 'all-teams' ? 'all-teams' : 'team',
    team: row.teamCode,
    games,
    minutes: Number(row.minutes),
    age, experience,
    ageSource: age === null ? null : text(row.ageSource, 160) || stateSource,
    experienceSource: experience === null ? null : text(row.experienceSource, 160) || stateSource,
    stateSource,
    stateJoin: text(row.stateJoin, 80) || (age !== null && experience !== null ? 'package-observed-complete' : age !== null || experience !== null ? 'package-observed-partial' : 'missing'),
    stateQuality: text(row.stateQuality, 80) || (age !== null && experience !== null ? 'observed' : age !== null || experience !== null ? 'partial' : 'missing'),
    stateConflict: Array.isArray(row.stateConflict) ? row.stateConflict.map(conflict => ({ ...conflict })) : null,
    positions: Array.isArray(row.positions) ? row.positions.filter(position => text(position, 8)).slice(0, 8) : [],
    components: {
      points: component(row, ['pointsPerGame'], 'perGame'),
      fieldGoalAccuracy: component(row, ['fieldGoalPercentage', 'fgAccuracy'], 'percent'),
      threePointAccuracy: component(row, ['threePointPercentage', 'threeAccuracy'], 'percent'),
      threePointFrequency: component(row, ['threePointAttemptShare', 'threePointAttemptRate', 'threeAttemptShare'], 'percent'),
      freeThrowAccuracy: component(row, ['freeThrowPercentage', 'ftAccuracy'], 'percent'),
      involvementPer36: component(row, ['involvementPer36'], 'per36'),
      assists: component(row, ['assistsPerGame'], 'perGame'),
      turnovers: component(row, ['turnoversPerGame'], 'perGame'),
      rebounds: component(row, ['reboundsPerGame'], 'perGame'),
      steals: component(row, ['stealsPerGame'], 'perGame'),
      blocks: component(row, ['blocksPerGame'], 'perGame'),
      trueShootingPercentage: component(row, ['trueShootingPercentage', 'trueShootingApproximation'], 'percent'),
      effectiveFieldGoalPercentage: component(row, ['effectiveFieldGoalPercentage', 'effectiveFieldGoal'], 'percent'),
      minutesPerGame: component(row, ['minutesPerGame'], 'minutesPerGame', {
        status: 'observed', value: Number(row.minutes) / games, unit: 'minutesPerGame',
        numerator: Number(row.minutes), denominator: games, knownGames: games,
        evidenceKind: 'derived-observed', coverage: 'normalized-observed-season', sourceMetric: 'minutes',
      }),
      games: { status: 'observed', value: games, unit: 'games', numerator: games, denominator: 1, knownGames: games,
        evidenceKind: 'observed', coverage: 'normalized-observed-season', sourceMetric: 'games' },
    },
    aggregation: row.aggregation || { method: 'single-team-row-v1', sourceTeams: [row.teamCode], sourceRowCount: 1 },
  };
  return profiles;
}

function sortedProfiles(records) {
  const profiles = records.map(toCompositeProfile).filter(Boolean);
  // A low-exposure row cannot be a reliable donor. Keeping ten or more games
  // also bounds the public browser cohort without inventing a missing value.
  return profiles.filter(profile => profile.games >= 10)
    .sort((left, right) => right.games - left.games
      || right.seasonStartYear - left.seasonStartYear
      || left.playerId.localeCompare(right.playerId)
      || left.team.localeCompare(right.team)
      || left.key.localeCompare(right.key));
}

/** Build the bounded public cohort used by Player Builder. */
export function buildCompositeCohort(records, packageScope) {
  const sorted = sortedProfiles(aggregateCompositePlayerSeasons(records));
  const profileLimitApplied = sorted.length > PROFILE_LIMIT;
  // When the browser cap is active, reserve one highest-exposure season for
  // each player before filling the remaining slots by exposure.  A raw
  // top-N slice can spend the whole cap on multi-season high-volume players,
  // making the donor pool look larger while reducing identity diversity.
  const uniqueRepresentatives = [];
  const seenPlayers = new Set();
  for (const profile of sorted) {
    const playerKey = stableCompositePlayerKey(profile);
    if (!playerKey || seenPlayers.has(playerKey)) continue;
    seenPlayers.add(playerKey);
    uniqueRepresentatives.push(profile);
  }
  const profiles = profileLimitApplied
    ? [...uniqueRepresentatives, ...sorted.filter(profile => !uniqueRepresentatives.includes(profile))].slice(0, PROFILE_LIMIT)
    : sorted;
  if (!profiles.length) fail('The selected SwishIQ package has no usable donor seasons.');
  const cohortNote = profileLimitApplied
    ? `The browser safety cap keeps one highest-exposure season per player before filling the remaining ${PROFILE_LIMIT.toLocaleString()} slots by exposure from ${sorted.length.toLocaleString()} eligible observed regular-season donor rows. Search and pagination cover every loaded row; no values are filled in.`
    : `All ${profiles.length.toLocaleString()} eligible observed regular-season donor rows are loaded. Search and pagination cover the complete accepted cohort; no values are filled in.`;
  const relationshipSampleNote = profiles.length < COMPOSITE_FORGE_LIMITS.minCohortRows
    ? `Only ${profiles.length} usable donor row${profiles.length === 1 ? ' is' : 's are'} available; cross-skill relationship estimates need at least ${COMPOSITE_FORGE_LIMITS.minCohortRows} compatible observed rows. Supported direct donor blends remain available, with relationship limits disclosed.`
    : '';
  return {
    id: `swishiq-${packageScope?.kind || 'package'}-composite-cohort`,
    profiles,
    sourceProfileCount: sorted.length,
    profileLimit: PROFILE_LIMIT,
    profileLimitApplied,
    uniquePlayerCount: countUniqueCompositePlayers(profiles),
    selectionPolicy: profileLimitApplied ? 'one-highest-exposure-season-per-player-then-exposure-v1' : 'exposure-order-v1',
    note: [cohortNote, relationshipSampleNote].filter(Boolean).join(' '),
  };
}

function v3CompositePackageRef(proof, acceptedPooledPackage = false) {
  const reference = packageRef(proof, acceptedPooledPackage);
  try {
    return normalizeCompositeForgePackageRef({ ...reference, format: 'djhc-swishiq-package-v3' });
  } catch {
    fail('Composite Forge accepts only verified SwishIQ V3 packages with supported package pins.');
  }
}

export function isV3PackageEntry(entry, expectedScope = null, registry = null) {
  const scope = entry?.scope;
  if (!object(scope) || !Array.isArray(scope.seasonStartYears) || !scope.seasonStartYears.length
    || scope.seasonStartYears.some((year, index) => !integer(year) || (index > 0 && year !== scope.seasonStartYears[index - 1] + 1))) return false;
  if ((expectedScope && scope.kind !== expectedScope) || entry.status !== 'published'
    || !registry?.registryVersion || !/^[a-f0-9]{64}$/.test(String(registry.registryRevisionSha256 || ''))) return false;
  try {
    normalizeCompositeForgePackageRef({
      ...entry,
      format: 'djhc-swishiq-package-v3',
      registryVersion: registry.registryVersion,
      registryRevisionSha256: registry.registryRevisionSha256,
      acceptedPooledPackage: scope.kind === 'pooled-window',
    });
    return true;
  } catch {
    return false;
  }
}

async function discoverPooledV3Package({ registryUrl, fetchImpl, requiredCapabilities = [] } = {}) {
  const fetcher = fetchImpl || globalThis.fetch?.bind(globalThis);
  if (typeof fetcher !== 'function') fail('This browser cannot discover the published SwishIQ V3 package.');
  let response;
  try { response = await fetcher(new URL(registryUrl || SWISHIQ_ADVANCED_REGISTRY_URL, import.meta.url).toString(), { cache: 'no-store', credentials: 'omit' }); }
  catch { fail('The SwishIQ V3 registry could not be reached.'); }
  if (!response?.ok) fail('The SwishIQ V3 registry is not available for this selection yet.');
  let registry;
  try { registry = JSON.parse(await response.text()); }
  catch { fail('The SwishIQ V3 registry is not valid JSON.'); }
  if (!object(registry) || registry.format !== SWISHIQ_PUBLIC_REGISTRY_FORMAT
    || registry.registryVersion !== SWISHIQ_PUBLIC_REGISTRY_VERSION || !Array.isArray(registry.packages)
    || !/^[a-f0-9]{64}$/.test(String(registry.registryRevisionSha256 || ''))
    || await registryRevisionSha256(registry) !== registry.registryRevisionSha256) {
    fail('The SwishIQ V3 registry failed its integrity check.');
  }
  const candidates = registry.packages.filter(entry => isV3PackageEntry(entry, 'pooled-window', registry)
    && entry.packageId === SWISHIQ_POOLED_PACKAGE_ID
    && entry.scope.seasonStartYears[0] === 2017
    && entry.scope.seasonStartYears.at(-1) === 2025
    && entry.scope.seasonStartYears.length === 9
    && Array.isArray(entry.scope.phases) && entry.scope.phases.includes('regular'));
  if (candidates.length !== 1) fail('No unique published SwishIQ V3 pooled 2017–26 package is available.');
  const [entry] = candidates;
  const missing = requiredCapabilities.filter(capability => entry.capabilities?.[capability]?.status !== 'available');
  if (missing.length) fail(`The SwishIQ V3 pooled package does not publish ${missing.join(' and ')}; no V2 or other-scope fallback was used.`);
  return { packageId: entry.packageId, packageVersion: entry.packageVersion };
}

/**
 * Return a stable player identity for UI counts. Display names are not
 * identities: two different package player references may share a name, while
 * one player may contribute several seasons/teams. Prefer the opaque player
 * reference and only fall back to the first segment of the stable profile key.
 */
export function stableCompositePlayerKey(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const explicit = profile.playerId || profile.playerRef;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const key = typeof profile.key === 'string' ? profile.key.trim() : '';
  if (!key) return null;
  return key.split('|')[0] || key;
}

/** Count distinct players without collapsing same-name package identities. */
export function countUniqueCompositePlayers(profiles) {
  return new Set((Array.isArray(profiles) ? profiles : [])
    .map(stableCompositePlayerKey)
    .filter(Boolean)).size;
}

/**
 * Paginate donor candidates without changing their deterministic order. Page
 * numbers are one-based so the returned state can be shown directly in the
 * browser. This is deliberately pure and is also used by focused tests.
 */
export function paginateCompositeDonors(profiles, page = 1, pageSize = PLAYER_BUILDER_DONOR_PAGE_SIZE) {
  const rows = Array.isArray(profiles) ? profiles : [];
  const size = integer(Number(pageSize)) && Number(pageSize) > 0 && Number(pageSize) <= 1000
    ? Number(pageSize) : PLAYER_BUILDER_DONOR_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const requested = integer(Number(page)) ? Number(page) : 1;
  const currentPage = Math.max(1, Math.min(totalPages, requested));
  const start = (currentPage - 1) * size;
  return Object.freeze({
    rows: rows.slice(start, start + size),
    page: currentPage,
    pageSize: size,
    total: rows.length,
    totalPages,
  });
}

function rowMetric(row, keys) {
  const value = metric(row, keys);
  return value && finite(value.value) ? value.value : null;
}

function aggregateCareerRows(rows, stateIndex = null, player = null, nameIdentityConflicts = null) {
  // A published all-team season row is already the player's season aggregate.
  // Team stints remain available on the history receipt, but combining them
  // with that canonical row would double-count exposure and weight rates twice.
  const allTeamRows = rows.filter(isAllTeamRow);
  const selectedRows = allTeamRows.length ? allTeamRows : rows;
  const games = selectedRows.reduce((sum, row) => sum + Number(row.games || 0), 0);
  const minutes = selectedRows.reduce((sum, row) => sum + Number(row.minutes || 0), 0);
  const weighted = keys => {
    const usable = selectedRows.map(row => ({ row, value: rowMetric(row, keys) })).filter(item => finite(item.value) && Number(item.row.games) > 0);
    if (!usable.length || !games) return null;
    return round(usable.reduce((sum, item) => sum + item.value * Number(item.row.games), 0) / usable.reduce((sum, item) => sum + Number(item.row.games), 0));
  };
  const positions = [...new Set(selectedRows.flatMap(row => Array.isArray(row.positions) ? row.positions : []))].filter(position => text(position, 8)).sort();
  const sourcedStates = selectedRows.map(row => careerStateForPlayerSeason(stateIndex, {
    player: row.displayName || player,
    seasonStartYear: row.seasonStartYear,
    nameIdentityConflicts,
  }));
  const stateIdentityAmbiguous = Boolean(stateIndex && selectedRows.some(row =>
    nameIdentityConflicts?.has(normalizeCareerStateName(row.displayName || player))));
  const stateIdentityConflict = stateIndex ? selectedRows
    .map(row => nameIdentityConflicts?.get(normalizeCareerStateName(row.displayName || player)) || null)
    .find(Boolean) || null : null;
  const stateAge = (row, index) => row.age == null ? sourcedStates[index]?.age : Number(row.age);
  const stateExperience = (row, index) => row.experience == null ? sourcedStates[index]?.experience : Number(row.experience);
  const stateConflicts = selectedRows.flatMap((row, index) => {
    const state = sourcedStates[index];
    const conflicts = [];
    if (row.age != null && state?.age != null && finite(Number(row.age)) && Math.abs(Number(row.age) - state.age) > 0.01) {
      conflicts.push({ field: 'age', rowValue: Number(row.age), indexValue: state.age, indexSource: state.ageSource });
    }
    if (row.experience != null && state?.experience != null && integer(Number(row.experience)) && Number(row.experience) !== state.experience) {
      conflicts.push({ field: 'experience', rowValue: Number(row.experience), indexValue: state.experience, indexSource: state.experienceSource });
    }
    return conflicts.map(conflict => ({ ...conflict, seasonStartYear: Number(row.seasonStartYear) }));
  });
  const explicitAges = selectedRows.map(stateAge).filter(value => finite(value) && value >= 12 && value <= 60);
  const explicitExperiences = selectedRows.map(stateExperience).filter(value => integer(value) && value >= 0 && value <= 40);
  // A season aggregate may retain age/experience only when every contributing
  // row supplies the same value.  A missing field is not recoverable from a
  // season label or from the order of the package window.
  const age = explicitAges.length === selectedRows.length && new Set(explicitAges).size === 1 ? explicitAges[0] : null;
  const experience = explicitExperiences.length === selectedRows.length && new Set(explicitExperiences).size === 1
    ? explicitExperiences[0] : null;
  const ageSource = age === null ? null : selectedRows.every((row, index) => row.age != null) ? 'package-observed' : sourcedStates.every(state => finite(state?.age)) ? sourcedStates.find(Boolean)?.ageSource : null;
  const experienceSource = experience === null ? null : selectedRows.every((row, index) => row.experience != null) ? 'package-observed' : sourcedStates.every(state => integer(state?.experience)) ? sourcedStates.find(Boolean)?.experienceSource : null;
  const stateSourced = (age !== null && !selectedRows.every(row => row.age != null))
    || (experience !== null && !selectedRows.every(row => row.experience != null));
  return {
    seasonStartYear: Number(rows[0].seasonStartYear),
    phase: PHASE,
    scope: 'all-teams',
    team: 'All teams',
    games,
    minutes: round(minutes),
    positions,
    age: age === null ? null : round(age),
    experience,
    ageSource,
    experienceSource,
    stateSource: stateSourced ? 'accepted-public-career-state' : null,
    stateJoin: stateIdentityAmbiguous ? 'ambiguous-player-name'
      : stateConflicts.length ? 'conflict' : stateSourced ? 'exact-augmented' : stateIndex ? 'exact-verified' : 'unmatched-player-season',
    stateQuality: stateConflicts.length ? 'conflict'
      : age !== null && experience !== null ? (stateSourced ? 'sourced-complete' : 'complete')
        : age !== null || experience !== null ? 'partial' : 'missing',
    stateIdentityConflict,
    stateConflict: stateConflicts.length ? stateConflicts : null,
    perGame: {
      points: weighted(['pointsPerGame']),
      assists: weighted(['assistsPerGame']),
      rebounds: weighted(['reboundsPerGame']),
      turnovers: weighted(['turnoversPerGame']),
      steals: weighted(['stealsPerGame']),
      blocks: weighted(['blocksPerGame']),
    },
    evidenceKind: 'observed-regular-season',
  };
}

/** Group public rows into all-team, season-keyed career histories. */
export function buildCareerHistories(records, { stateIndex = null } = {}) {
  const byPlayer = new Map();
  const observedRows = [];
  for (const row of records) {
    if (!object(row) || !PLAYER_REF.test(String(row.playerRef || '')) || row.phase !== PHASE
      || row.observed !== true || !integer(Number(row.seasonStartYear)) || !integer(Number(row.games)) || Number(row.games) < 1
      || !finite(Number(row.minutes)) || Number(row.minutes) <= 0) continue;
    observedRows.push(row);
  }
  const nameIdentityConflicts = careerStateNameRefConflicts(observedRows);
  for (const row of observedRows) {
    const playerId = String(row.playerRef);
    const years = byPlayer.get(playerId) || { playerId, player: text(row.displayName, 160) || 'Unnamed player', rows: [] };
    years.rows.push(row);
    byPlayer.set(playerId, years);
  }
  return [...byPlayer.values()].map(entry => {
    const grouped = new Map();
    for (const row of entry.rows) {
      const year = Number(row.seasonStartYear);
      const seasonRows = grouped.get(year) || [];
      seasonRows.push(row);
      grouped.set(year, seasonRows);
    }
    const years = [...grouped.keys()].sort((left, right) => left - right);
    const recordedTeams = [...new Set(entry.rows
      .filter(row => !isAllTeamRow(row))
      .map(row => text(row.teamCode, 8))
      .filter(team => team && TEAM_CODE.test(team)))].sort();
    const teamHistory = years.map(seasonStartYear => ({
      seasonStartYear,
      teams: [...new Set((grouped.get(seasonStartYear) || [])
        .filter(row => !isAllTeamRow(row))
        .map(row => text(row.teamCode, 8))
        .filter(team => team && TEAM_CODE.test(team)))].sort(),
    }));
    return {
      playerId: entry.playerId,
      player: entry.player,
      acceptedCareerHistory: true,
      profiles: years.map(year => aggregateCareerRows(grouped.get(year), stateIndex, entry.player, nameIdentityConflicts)),
      teams: recordedTeams,
      teamHistory,
      evidence: stateIndex
        ? 'Observed regular-season rows from the explicitly pooled 2017–26 package, augmented only by exact season state from the accepted public career-state index.'
        : 'Observed regular-season rows from the explicitly pooled 2017–26 package; age and experience are retained only when the package supplies them consistently. Otherwise they require explicit input.',
    };
  }).filter(history => history.profiles.length > 0).sort((left, right) => left.player.localeCompare(right.player) || left.playerId.localeCompare(right.playerId));
}

function stageForExperience(experience) {
  const match = CAREER_STAGE_BY_EXPERIENCE.find(([experienceMax]) => experience <= experienceMax);
  return match ? match[1] : 'late-career';
}

/** Return one ordered cutoff option per recorded season, even when a player has multiple team stints. */
export function careerCutoffYears(profiles) {
  return [...new Set((Array.isArray(profiles) ? profiles : [])
    .map(profile => Number(profile?.seasonStartYear))
    .filter(integer))].sort((left, right) => left - right);
}

export function roleStateForCareerState({ minutesPerGame = null, games = null, metrics = {} } = {}) {
  const minutes = finite(minutesPerGame) ? minutesPerGame : 0;
  const points = finite(metrics?.points) ? metrics.points : null;
  const availability = integer(games) ? games : 0;
  if (!(minutes > 0) || availability <= 0) return 'out';
  // A high-minute row with missing scoring is unresolved production, not
  // evidence of star-level output. Keep the UI helper aligned with the
  // package-bound career model: only observed points at or above the role
  // threshold can promote a row to star.
  if (minutes >= 30 && points !== null && points >= 16) return 'star';
  if (minutes >= 24) return 'starter';
  if (minutes >= 12) return 'rotation';
  return 'fringe';
}

export function careerState(timeline, age, experienceInput) {
  const latest = timeline.rows.filter(row => row.status === 'observed').at(-1);
  if (!latest) fail('The selected player has no observed row at the requested cutoff.');
  const sourcedAge = finite(latest.age) && latest.age >= 12 && latest.age <= 60 ? latest.age : null;
  const suppliedAge = age === undefined || age === null || age === '' ? null : Number(age);
  if (suppliedAge !== null && (!Number.isFinite(suppliedAge) || suppliedAge < 12 || suppliedAge > 60)) {
    fail('Enter an as-of age from 12 through 60.');
  }
  if (sourcedAge !== null && suppliedAge !== null && Math.abs(sourcedAge - suppliedAge) > 0.01) {
    fail('The supplied age does not match the age recorded for this cutoff.');
  }
  const numericAge = sourcedAge ?? suppliedAge;
  if (numericAge === null) fail('Enter an as-of age; no age value is available for this cutoff.');
  const sourcedExperience = integer(latest.experience) && latest.experience >= 0 && latest.experience <= 40
    ? latest.experience : null;
  const suppliedExperience = experienceInput === undefined || experienceInput === null || experienceInput === ''
    ? null : Number(experienceInput);
  if (suppliedExperience !== null && (!integer(suppliedExperience) || suppliedExperience < 0 || suppliedExperience > 40)) {
    fail('Enter an as-of experience from 0 through 40.');
  }
  if (sourcedExperience !== null && suppliedExperience !== null && sourcedExperience !== suppliedExperience) {
    fail('The supplied experience does not match the experience recorded for this cutoff.');
  }
  const experience = sourcedExperience ?? suppliedExperience;
  if (experience === null) fail('Enter an as-of experience; no experience value is available for this cutoff.');
  const sourceState = resolveCareerAsOfState(timeline, {
    asOfSeasonStartYear: latest.seasonStartYear,
    asOfAge: sourcedAge === null ? numericAge : null,
    asOfExperience: sourcedExperience === null ? experience : null,
  });
  return {
    frozen: true,
    sourceSeasonStartYear: latest.seasonStartYear,
    age: round(numericAge),
    ageSource: sourcedAge === null ? 'user-supplied' : (latest.ageSource || 'accepted-public-career-state'),
    experience,
    experienceSource: sourcedExperience === null ? 'user-supplied' : (latest.experienceSource || 'package-observed'),
    stage: stageForExperience(experience),
    positions: latest.positions,
    minutesPerGame: latest.games > 0 ? round(latest.minutes / latest.games) : null,
    games: latest.games,
    metrics: { ...latest.perGame },
    roleState: roleStateForCareerState({
      minutesPerGame: latest.games > 0 ? round(latest.minutes / latest.games) : null,
      games: latest.games,
      metrics: latest.perGame,
    }),
    evidenceSourceSeasonStartYear: latest.seasonStartYear,
    stateJoin: sourceState.stateJoin,
    stateQuality: sourceState.stateQuality,
    stateConflict: sourceState.stateConflict,
  };
}

/** Format the selected cutoff and player state for the session summary. */
export function formatCareerCutoffReceipt(target = {}, seasonStartYear = null) {
  const cutoff = integer(seasonStartYear) && seasonStartYear >= 1947 && seasonStartYear <= 2200
    ? labelSeason(seasonStartYear)
    : 'season unavailable';
  const age = finite(target.age) && target.age >= 12 && target.age <= 60
    ? String(Number.isInteger(target.age) ? target.age : round(target.age))
    : 'unavailable';
  const experience = integer(target.experience) && target.experience >= 0 && target.experience <= 40
    ? String(target.experience)
    : 'unavailable';
  return `As of ${cutoff} · age ${age} · experience ${experience}`;
}

function chooseCareerHistories(histories, target, cutoff, targetExperience) {
  const targetRow = target.rows.filter(row => row.status === 'observed' && row.seasonStartYear <= cutoff).at(-1);
  const comparisonExperience = integer(targetExperience) ? targetExperience : null;
  const targetPositions = targetRow?.positions || [];
  return [...histories].sort((left, right) => {
    const leftRow = left.profiles.filter(row => row.seasonStartYear <= cutoff).at(-1);
    const rightRow = right.profiles.filter(row => row.seasonStartYear <= cutoff).at(-1);
    const overlap = row => row?.positions?.some(position => targetPositions.includes(position)) ? 0 : 1;
    const distance = row => comparisonExperience === null || !integer(row?.experience)
      ? Number.POSITIVE_INFINITY : Math.abs(row.experience - comparisonExperience);
    return overlap(leftRow) - overlap(rightRow) || distance(leftRow) - distance(rightRow)
      || left.playerId.localeCompare(right.playerId);
  }).slice(0, CAREER_HISTORY_LIMIT);
}

function parseSeasonSelection({ packageId, packageVersion } = {}) {
  const selectedPackageId = text(packageId, 120);
  const selectedVersion = String(packageVersion || '');
  const v4 = /^v4-canonical-\d{8}-[a-f0-9]{12}$/.test(selectedVersion);
  if (v4 && CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status === 'reviewed') {
    const expected = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.expectedIdentity?.packages?.find(row => (
      row?.packageId === selectedPackageId
      && row?.packageVersion === selectedVersion
      && row?.scope?.kind === 'exact-season'
      && row.scope.seasonStartYears?.length === 1
    ));
    const seasonStartYear = Number(expected?.scope?.seasonStartYears?.[0]);
    if (!expected || !integer(seasonStartYear) || !/^nba-swishiq-v4-\d{4}-\d{2}$/.test(selectedPackageId)) {
      fail('The selected package is not an exact season in the reviewed SwishIQ V4 release.');
    }
    const seasonEndYear = seasonStartYear + 1;
    if (selectedPackageId !== `nba-swishiq-v4-${seasonStartYear}-${String(seasonEndYear).slice(-2)}`) {
      fail('The selected V4 package ID does not match its exact season.');
    }
    return { packageId: selectedPackageId, packageVersion: selectedVersion, seasonStartYear, seasonEndYear, phase: PHASE };
  }
  const native = /^v3-(\d{4})-(\d{2})-[a-f0-9]{12}$/.exec(String(packageVersion || ''));
  if (!native) fail('Choose a published native exact season before opening Composite Forge.');
  const match = native;
  const seasonStartYear = Number(match[1]);
  const seasonEndYear = seasonStartYear + 1;
  const phase = PHASE;
  if (!integer(seasonStartYear) || !integer(seasonEndYear) || !text(phase, 40)) {
    fail('The selected exact season is malformed.');
  }
  const expectedNativePackageId = `nba-swishiq-v3-${seasonStartYear}-${String(seasonEndYear).slice(-2)}`;
  if (selectedPackageId !== expectedNativePackageId) fail('The selected package is not an approved exact SwishIQ V3 season.');
  return { packageId: selectedPackageId, packageVersion: String(packageVersion), seasonStartYear, seasonEndYear, phase };
}

const NATIVE_BASELINE_METRICS = Object.freeze({
  scoring: 'points', shooting: 'fieldGoalAccuracy', threePointShooting: 'threePointAccuracy',
  creation: 'involvementPer36', playmaking: 'assists', rebounding: 'rebounds',
  defensiveActivity: 'steals', efficiency: 'trueShootingPercentage', workload: 'minutesPerGame',
});

function nativeEraBaselineRows(records, profiles) {
  const rows = [];
  for (const source of Array.isArray(records) ? records : []) {
    if (!object(source) || !integer(source.seasonStartYear) || !text(source.phase, 40) || !object(source.baselines)) continue;
    for (const [componentKey, metricKey] of Object.entries(NATIVE_BASELINE_METRICS)) {
      const mean = Number(source.baselines[componentKey]);
      if (!finite(mean)) continue;
      const values = (Array.isArray(profiles) ? profiles : [])
        .filter(profile => profile.seasonStartYear === source.seasonStartYear && profile.phase === source.phase)
        .map(profile => readCompositeMetric(profile, metricKey).value)
        .filter(finite);
      const standardDeviation = values.length > 1
        ? Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length)
        : null;
      rows.push({ metric: metricKey, phase: source.phase, seasonStartYear: source.seasonStartYear,
        mean, standardDeviation: finite(standardDeviation) ? standardDeviation : null,
        n: integer(source.sampleRows) ? source.sampleRows : values.length, evidenceKind: source.evidenceKind || 'derived-observed' });
    }
  }
  return rows;
}

function verifiedV4CompositeDataset(data, requestedScope, minimalPlayerSeasonsOnly = false) {
  const expectedScope = requestedScope?.kind;
  const scope = data?.scope;
  const playerPart = data?.parts?.['player-seasons'];
  const sameV4Part = part => part?.format === 'djhc-swishiq-v4-verified-public-part-v1'
    && part.status === 'verified' && part.package?.packageId === data?.package?.packageId
    && part.package?.packageVersion === data?.package?.packageVersion
    && part.package?.packageManifestSha256 === data?.package?.packageManifestSha256
    && part.package?.sourceLockSha256 === data?.package?.sourceLockSha256
    && JSON.stringify(part.scope) === JSON.stringify(data?.package?.scope)
    && part.scope?.kind === expectedScope && Array.isArray(part.records);
  if (data?.status !== 'verified-data-access' || data?.capabilityId !== 'franchiseInputs'
    || data.capability?.descriptiveDataAccess !== 'available'
    || scope?.kind !== expectedScope || !sameV4Part(playerPart)
    || !data.capability.artifactIds.every(artifactId => sameV4Part(data.parts?.[artifactId]))) {
    fail('Verified V4 player-season examples do not match the selected package, capability, and scope.');
  }
  const packageInfo = data.package;
  const registryVersion = 'swishiq-v4-public-registry-v1';
  const compositePackageRef = normalizeCompositeForgePackageRef({
    format: 'djhc-swishiq-v4-package-ref-v1',
    packageId: packageInfo.packageId,
    packageVersion: packageInfo.packageVersion,
    packageManifestSha256: packageInfo.packageManifestSha256,
    sourceLockSha256: packageInfo.sourceLockSha256,
    indexSha256: data.source?.indexSha256,
    registryVersion,
    registryRevisionSha256: data.source?.registryRevisionSha256,
    modelId: packageInfo.modelId,
    normalizer: packageInfo.normalizerVersion,
    metricsVersion: packageInfo.metricsVersion,
    acceptedPooledPackage: false,
    scope: packageInfo.scope,
    playerSeasonsArtifacts: [{
      artifactId: playerPart.artifactId, path: `parts/${playerPart.artifactId}.json`, sha256: playerPart.sha256,
      rows: playerPart.rows, bytes: playerPart.bytes,
    }],
  });
  const phase = PHASE;
  const selectedSeasons = scope.kind === 'exact-season' ? [...scope.seasonStartYears] : [...scope.seasonStartYears];
  const pinnedPlayerPart = {
    ...playerPart,
    path: `parts/${playerPart.artifactId}.json`,
    scope: compositePackageRef.scope,
    records: playerPart.records.map(record => ({
      ...record,
      __swishiqPlayerSeasonsArtifactId: playerPart.artifactId,
      __swishiqPlayerSeasonsArtifactSha256: playerPart.sha256,
    })),
  };
  const nativeProfiles = adaptNativeCompositeForgeCohort({
    packageRef: compositePackageRef,
    part: pinnedPlayerPart,
    seasonStartYears: selectedSeasons,
    phase,
    cohortId: `native-${packageInfo.packageId}-${selectedSeasons.join('-')}`,
  });
  const sourcePackageRef = scope.kind === 'exact-season' ? compositePackageRef : null;
  const supportingArtifacts = Object.values(data.parts).map(part => ({
    artifactId: part.artifactId, kind: part.kind, sha256: part.sha256, rows: part.rows, bytes: part.bytes,
  }));
  const cohort = {
    ...nativeProfiles.cohort,
    eraBaselines: [],
    source: {
      ...nativeProfiles.cohort.source,
      supportingArtifacts,
      sourcePackageRef,
      note: 'Observed V4 end-of-season player rows. Composite Forge output is a descriptive synthetic profile, not a forecast; V4 predictive validation is not established.',
    },
  };
  return {
    proof: { package: packageInfo, registry: { registryVersion, registryRevisionSha256: data.source.registryRevisionSha256 } },
    cohort,
    metadata: new Map(),
    acceptedPooledPackage: false,
    sourcePackageRef,
    exactSourcePackages: sourcePackageRef ? [sourcePackageRef] : [],
    exactDatasets: undefined,
    compositePackageRef,
    minimalPlayerSeasonsOnly: minimalPlayerSeasonsOnly === true,
    adapter: { ...nativeProfiles, cohort },
    nativeArtifacts: { playerPart: pinnedPlayerPart, playerParts: [pinnedPlayerPart], baselinePart: null, skillPart: null },
  };
}

function normalizeNativeCareerHistory(history) {
  const profiles = [...(Array.isArray(history?.profiles) ? history.profiles : [])]
    .sort((left, right) => Number(left.seasonStartYear) - Number(right.seasonStartYear)
      || String(left.team || '').localeCompare(String(right.team || ''))
      || String(left.phase || '').localeCompare(String(right.phase || '')));
  const teams = [...new Set(profiles.map(profile => text(profile.team, 8)).filter(team => team && TEAM_CODE.test(team)))].sort();
  const years = [...new Set(profiles.map(profile => Number(profile.seasonStartYear)).filter(integer))].sort((left, right) => left - right);
  return {
    ...history,
    profiles,
    rows: profiles,
    teams,
    teamHistory: years.map(seasonStartYear => ({
      seasonStartYear,
      teams: [...new Set(profiles.filter(profile => profile.seasonStartYear === seasonStartYear)
        .map(profile => text(profile.team, 8)).filter(team => team && TEAM_CODE.test(team)))].sort(),
    })),
    evidence: 'Observed regular-season rows from the explicitly accepted native 2017–26 pooled package; age and experience remain explicit when the package state index cannot source them.',
  };
}

function buildCareerLookupHistories(records) {
  const groups = new Map();
  const seen = new Set();
  for (const row of Array.isArray(records) ? records : []) {
    const playerId = text(row?.playerRef, 64);
    const player = text(row?.displayName, 160);
    const team = text(row?.teamCode, 8)?.toUpperCase();
    const seasonStartYear = Number(row?.seasonStartYear);
    if (!PLAYER_REF.test(playerId)
      || !player || !TEAM_CODE.test(team) || !integer(seasonStartYear)) continue;
    const key = `${playerId}|${seasonStartYear}|${team}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let history = groups.get(playerId);
    if (!history) {
      history = { acceptedCareerHistory: true, playerId, player, profiles: [] };
      groups.set(playerId, history);
    }
    history.profiles.push({ seasonStartYear, phase: PHASE, team });
  }
  return [...groups.values()]
    .map(normalizeNativeCareerHistory)
    .filter(history => history.profiles.length >= 2)
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
}

function inflateCareerProfileRecords(records) {
  return (Array.isArray(records) ? records : []).map(row => {
    const metrics = Object.fromEntries(CAREER_METRIC_KEYS.map(key => {
      const value = row?.careerMetrics?.[key];
      return [`${key}PerGame`, {
        status: finite(value) ? 'available' : 'unavailable',
        unit: 'per-game',
        value: finite(value) ? value : null,
      }];
    }));
    return {
      playerRef: row.playerRef,
      displayName: row.displayName,
      teamCode: row.teamCode,
      seasonStartYear: row.seasonStartYear,
      phase: row.phase,
      observed: row.observed,
      games: row.games,
      minutes: row.minutes,
      positions: row.positions,
      age: row.age,
      experience: row.experience,
      metrics,
    };
  });
}

const V4_CAREER_STATE_MATCH_KEY_VERSION = 'player-name-match-key-v1-nfkd-diacritic-fold-punctuation-collapse';
const V4_CAREER_STATE_PHASE_BASIS = 'source-season-grain-no-phase; consumer-regular-season-use-policy-v1';

function normalizeV4CareerPlayerNameKey(value) {
  if (value === null || value === undefined) return null;
  const apostrophe = String.fromCharCode(39);
  const normalized = String(value).normalize('NFC')
    .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, apostrophe)
    .toLowerCase().trim().replace(/\s+/g, ' ');
  return normalized || null;
}

function buildCanonicalV4CareerDataset(data) {
  const fail = message => { throw new Error(message); };
  const scope = data?.scope;
  const packagePin = data?.package;
  const careerPart = data?.parts?.['career-history'];
  const statePart = data?.parts?.['career-state-workbook'];
  const playerSeasonPart = data?.parts?.['player-seasons'];
  if (data?.status !== 'verified-data-access' || data?.capabilityId !== 'careerHistory'
    || scope?.kind !== 'pooled-window' || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 9 || scope.seasonStartYears[0] !== 2017 || scope.seasonStartYears.at(-1) !== 2025
    || scope.phases?.length !== 1 || scope.phases[0] !== PHASE) {
    fail('Career Lab requires one verified V4 pooled regular-season history window with explicit pooled acceptance.');
  }
  const partMatches = (part, artifactId) => part?.format === 'djhc-swishiq-v4-verified-public-part-v1'
    && part.status === 'verified' && part.artifactId === artifactId
    && part.package?.packageId === packagePin?.packageId
    && part.package?.packageVersion === packagePin?.packageVersion
    && part.package?.packageManifestSha256 === packagePin?.packageManifestSha256
    && part.package?.sourceLockSha256 === packagePin?.sourceLockSha256
    && part.package?.projectionContentSha256 === packagePin?.projectionContentSha256
    && part.scope?.kind === 'pooled-window'
    && Array.isArray(part.scope.seasonStartYears)
    && part.scope.seasonStartYears.length === scope.seasonStartYears.length
    && part.scope.seasonStartYears.every((year, index) => year === scope.seasonStartYears[index])
    && part.scope.phases?.length === 1 && part.scope.phases[0] === PHASE
    && Array.isArray(part.records);
  if (!partMatches(careerPart, 'career-history') || !partMatches(statePart, 'career-state-workbook')
    || !partMatches(playerSeasonPart, 'player-seasons')) {
    fail('Career Lab needs matching V4 career-history, career-state-workbook, and player-season artifacts from one pooled package.');
  }

  const stateRowsByNameSeason = new Map();
  const heldStates = { sourceRows: statePart.records.length, held: 0, invalid: 0, duplicateKeys: 0 };
  for (const record of statePart.records) {
    const time = record?.time || {};
    const values = record?.values || {};
    if (time.phase !== null || time.phaseBasis !== V4_CAREER_STATE_PHASE_BASIS
      || !Number.isSafeInteger(time.seasonStartYear) || !scope.seasonStartYears.includes(time.seasonStartYear)) {
      heldStates.invalid += 1;
      continue;
    }
    const nameKey = text(record?.entities?.playerNameKey, 200);
    const valueNameKey = text(values.playerNameKey, 200);
    const matchEvidence = values.matchKeyEvidence;
    const matchedCandidateCount = matchEvidence?.candidateCount ?? record?.evidence?.matchedCandidateCount;
    const uniqueExactSeasonMatch = record?.evidence?.status === 'available'
      && nameKey && nameKey === valueNameKey
      && normalizeV4CareerPlayerNameKey(values.canonicalDisplayName) === nameKey
      && values.matchKeyVersion === V4_CAREER_STATE_MATCH_KEY_VERSION
      && object(matchEvidence) && matchEvidence.exactSeason === true
      && matchedCandidateCount === 1
      && matchEvidence.uniqueCandidate !== false
      && matchEvidence.lossyLookupKeyEmittedAsIdentity === false;
    if (!uniqueExactSeasonMatch) {
      heldStates.held += 1;
      continue;
    }
    const key = `${nameKey}|${time.seasonStartYear}`;
    if (stateRowsByNameSeason.has(key)) {
      stateRowsByNameSeason.set(key, null);
      heldStates.duplicateKeys += 1;
      continue;
    }
    stateRowsByNameSeason.set(key, record);
  }

  const seasonRowsByKey = new Map();
  const candidatesByNameSeason = new Map();
  for (const record of playerSeasonPart.records) {
    const time = record?.time || {};
    const values = record?.values || {};
    if (time.phase !== PHASE || !Number.isSafeInteger(time.seasonStartYear)
      || !scope.seasonStartYears.includes(time.seasonStartYear)
      || record?.evidence?.status !== 'available' || values.observed !== true) continue;
    const playerRef = record?.entities?.playerRef || values.playerRef;
    const teamCode = record?.entities?.teamCode || values.teamCode;
    const displayName = text(values.displayName, 160);
    const nameKey = text(record?.entities?.playerNameKey, 200)
      || text(values.playerNameKey, 200)
      || normalizeV4CareerPlayerNameKey(displayName);
    if (!PLAYER_REF.test(String(playerRef || '')) || !TEAM_CODE.test(String(teamCode || ''))
      || !displayName || !nameKey || normalizeV4CareerPlayerNameKey(displayName) !== nameKey
      || values.seasonStartYear !== time.seasonStartYear || values.phase !== PHASE
      || !Number.isSafeInteger(values.games) || values.games < 1
      || !finite(values.minutes) || values.minutes <= 0 || !object(values.metrics)) {
      fail('A V4 Career player-season row has incomplete exact identity, exposure, or metric fields.');
    }
    const rowKey = `${playerRef}|${time.seasonStartYear}|${teamCode}`;
    if (seasonRowsByKey.has(rowKey)) fail('The V4 Career player-season part repeats a player/team/season identity.');
    seasonRowsByKey.set(rowKey, { playerRef, teamCode, displayName, nameKey, seasonStartYear: time.seasonStartYear, values });
    const candidatesKey = `${nameKey}|${time.seasonStartYear}`;
    const candidateRefs = candidatesByNameSeason.get(candidatesKey) || new Set();
    candidateRefs.add(playerRef);
    candidatesByNameSeason.set(candidatesKey, candidateRefs);
  }

  const rowsByPlayerTeamSeason = new Map();
  for (const record of careerPart.records) {
    const time = record?.time || {};
    const values = record?.values || {};
    if (record?.evidence?.status !== 'available' || time.phase !== PHASE
      || !Number.isSafeInteger(time.seasonStartYear) || !scope.seasonStartYears.includes(time.seasonStartYear)) continue;
    const playerRef = record?.entities?.playerRef || values.playerRef;
    const teamCode = record?.entities?.teamCode || values.teamCode;
    if (!PLAYER_REF.test(String(playerRef || '')) || !TEAM_CODE.test(String(teamCode || ''))) {
      fail('A V4 career-history row has incomplete player or team identity.');
    }
    const key = `${playerRef}|${time.seasonStartYear}|${teamCode}`;
    if (rowsByPlayerTeamSeason.has(key)) fail('The V4 career-history part repeats a player/team/season identity.');
    rowsByPlayerTeamSeason.set(key, record);
  }
  if (rowsByPlayerTeamSeason.size !== seasonRowsByKey.size) {
    fail(`Career Lab's pooled identity index covers ${rowsByPlayerTeamSeason.size.toLocaleString()} rows but its player-season metrics cover ${seasonRowsByKey.size.toLocaleString()}; the source sets are not complete matches.`);
  }

  const records = [];
  let stateJoinedRows = 0;
  let stateAmbiguousPlayerSeasonRows = 0;
  for (const [rowKey, seasonRow] of seasonRowsByKey) {
    if (!rowsByPlayerTeamSeason.has(rowKey)) fail('A V4 player-season metric row is absent from the matching career-history identity index.');
    const candidates = candidatesByNameSeason.get(`${seasonRow.nameKey}|${seasonRow.seasonStartYear}`);
    const stateRecord = candidates?.size === 1 ? stateRowsByNameSeason.get(`${seasonRow.nameKey}|${seasonRow.seasonStartYear}`) : null;
    if (candidates?.size > 1) stateAmbiguousPlayerSeasonRows += 1;
    const state = stateRecord?.values || {};
    const age = stateRecord && finite(state.age) && state.age >= 12 && state.age <= 60 ? state.age : null;
    const experience = stateRecord && Number.isSafeInteger(state.experience) && state.experience >= 0 && state.experience <= 40
      ? state.experience : null;
    if (stateRecord && (age !== null || experience !== null)) stateJoinedRows += 1;
    const values = seasonRow.values;
    records.push({
      playerRef: seasonRow.playerRef,
      displayName: seasonRow.displayName,
      playerNameKey: seasonRow.nameKey,
      teamCode: seasonRow.teamCode,
      seasonStartYear: seasonRow.seasonStartYear,
      phase: PHASE,
      observed: true,
      games: values.games,
      minutes: values.minutes,
      positions: Array.isArray(values.positions) ? values.positions : [],
      age,
      experience,
      ageSource: age === null ? null : text(state.ageSource, 160) || 'career-state-workbook-v4',
      experienceSource: experience === null ? null : text(state.experienceSource, 160) || 'career-state-workbook-v4',
      stateSource: stateRecord ? 'career-state-workbook-v4' : null,
      metrics: values.metrics,
      scope: values.scope || 'team',
      isMultiTeamAggregate: values.isMultiTeamAggregate === true,
    });
  }
  const histories = buildCareerHistories(records).map(history => ({
    ...normalizeNativeCareerHistory(history),
    evidence: 'Verified V4 pooled regular-season rows from the career-history, player-season, and Career State workbook artifacts. Age and experience are joined only by the published unique canonical name key and exact season; unresolved states remain missing. This view is descriptive and has no calibrated forecast claim.',
  }));
  if (!histories.length) fail('The V4 pooled career artifacts contain no usable observed player histories.');
  const source = {
    kind: 'swishiq-canonical-v4-package',
    packageId: packagePin.packageId,
    packageVersion: packagePin.packageVersion,
    artifacts: [careerPart, statePart, playerSeasonPart].map(part => ({
      artifactId: part.artifactId,
      sha256: part.artifact?.sha256 || null,
      rows: part.artifact?.rows ?? part.records.length,
    })),
    careerState: {
      sourceRows: statePart.records.length,
      heldRows: heldStates.held + heldStates.invalid + heldStates.duplicateKeys,
      invalidPhaseOrSeasonRows: heldStates.invalid,
      duplicateIdentityRows: heldStates.duplicateKeys,
      joinedPlayerSeasonRows: stateJoinedRows,
      ambiguousPlayerSeasonRows: stateAmbiguousPlayerSeasonRows,
      matchKeyVersion: V4_CAREER_STATE_MATCH_KEY_VERSION,
      identity: 'conservative-normalized-name-id plus exact season; secondary match key is selection evidence only',
    },
    note: 'V4 career observations are descriptive. Simulation and scenario forecasting are not calibrated or enabled.',
  };
  const proof = {
    ...data,
    registry: {
      registryVersion: packagePin.registryVersion || 'swishiq-v4-reviewed-release',
      registryRevisionSha256: data.source?.registryRevisionSha256,
    },
    package: {
      ...packagePin,
      sourceGeneration: 'V4',
      releaseId: data.source?.releaseId,
      registrySha256: data.source?.registrySha256,
      registryRevisionSha256: data.source?.registryRevisionSha256,
      indexSha256: data.source?.indexSha256,
      capabilityMapSha256: data.source?.capabilityMapSha256,
      capabilityId: data.capabilityId,
      reviewReceiptSha256: data.source?.reviewReceiptSha256,
      authorizationReferenceSha256: data.source?.authorizationReferenceSha256,
      scope,
      capabilities: { careerHistory: { status: 'available', artifactIds: ['career-history', 'career-state-workbook', 'player-seasons'] } },
    },
  };
  return {
    proof,
    histories,
    metadata: new Map(),
    stateIndex: null,
    careerSimulationAvailable: false,
    careerScenarioAvailable: false,
    ready: true,
    adapter: { format: 'swishiq-v4-career-descriptive-adapter-v1', status: 'descriptive-only' },
    nativeArtifacts: {
      lookupPart: null,
      playerParts: [],
      careerHistoryParts: [careerPart, statePart, playerSeasonPart].map(part => Object.freeze({ artifact: part.artifact, records: part.records })),
    },
    source,
  };
}

/** Load either one selected exact package or the explicitly accepted pooled donor package. */
export async function loadCompositeDataset({ packageId, packageVersion, seasonStartYear, acceptedPooledPackage = false,
  minimalPlayerSeasonsOnly = false, registryUrl = SWISHIQ_ADVANCED_REGISTRY_URL, fetchImpl, baseUrl } = {}) {
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'unconfigured') {
    if (acceptedPooledPackage === true) {
      fail('Composite Forge uses individually verified exact-season V4 packages for cross-season donors.');
    }
    const selectedYear = Number.isSafeInteger(Number(seasonStartYear))
      ? Number(seasonStartYear)
      : parseSeasonSelection({ packageId, packageVersion }).seasonStartYear;
    if (!integer(selectedYear) || selectedYear < 1947 || selectedYear > 2199) {
      fail('Composite Forge needs one exact season from the reviewed V4 release.');
    }
    const data = await loadCanonicalV4StudioExactSeasonData({
      seasonStartYear: selectedYear,
      phases: ['regular'],
      capabilityId: 'franchiseInputs',
      additionalArtifactIds: ['player-seasons'],
      fetchImpl,
      baseUrl,
    });
    if ((packageId && data.package.packageId !== packageId)
      || (packageVersion && data.package.packageVersion !== packageVersion)) {
      fail('Composite Forge refused a V4 package whose ID or version does not match the selected season.');
    }
    return verifiedV4CompositeDataset(data, { kind: 'exact-season' }, minimalPlayerSeasonsOnly);
  }
  let selected;
  let proof;
  if (acceptedPooledPackage === true) {
    if (minimalPlayerSeasonsOnly) fail('The pooled Composite Forge artifact cannot be loaded through the minimal exact-season path.');
    const pooledPin = await discoverPooledV3Package({
      registryUrl, fetchImpl, requiredCapabilities: ['compositeRecipe'],
    });
    if ((packageId && packageId !== pooledPin.packageId)
      || (packageVersion && packageVersion !== pooledPin.packageVersion)) {
      fail('Composite Forge refused a pooled package that does not match the published SwishIQ window.');
    }
    proof = await loadSwishIqPublishedPackageProof({
      packageId: pooledPin.packageId,
      packageVersion: pooledPin.packageVersion,
      requiredCapabilities: ['compositeRecipe'],
      registryUrl,
      fetchImpl,
    });
    if (proof.package.scope.kind !== 'pooled-window'
      || proof.package.packageId !== SWISHIQ_POOLED_PACKAGE_ID
      || !SWISHIQ_POOLED_PACKAGE_VERSION_PATTERN.test(proof.package.packageVersion)
      || proof.package.modelId !== SWISHIQ_V3_MODEL) {
      fail('Composite Forge refused a package outside the accepted cross-season window.');
    }
    selected = {
      seasonStartYears: [...proof.package.scope.seasonStartYears],
      phase: PHASE,
      acceptedPooledPackage: true,
    };
  } else {
    selected = seasonStartYear === undefined || seasonStartYear === null
      ? parseSeasonSelection({ packageId, packageVersion })
      : { seasonStartYear: Number(seasonStartYear), seasonEndYear: Number(seasonStartYear) + 1, phase: PHASE };
    if (!integer(selected.seasonStartYear) || selected.seasonStartYear < 1947 || selected.seasonStartYear > 2199) {
      fail('Composite Forge needs a valid exact season to browse.');
    }
    proof = await loadSwishIqExactPackageProof({
      seasonEndYear: selected.seasonEndYear,
      seasonPhase: selected.phase,
      requiredCapabilities: ['compositeRecipe'],
      registryUrl,
      fetchImpl,
    });
    if (proof.package.scope.kind !== 'exact-season'
      || proof.package.scope.seasonStartYears.length !== 1
      || proof.package.scope.seasonStartYears[0] !== selected.seasonStartYear) {
      fail('Composite Forge refused a package outside the selected exact season.');
    }
    if ((selected.packageId && proof.package.packageId !== selected.packageId)
      || (selected.packageVersion && proof.package.packageVersion !== selected.packageVersion)) {
      fail('Composite Forge refused a native package whose ID or version does not match the selected package.');
    }
    selected = { ...selected, seasonStartYears: [selected.seasonStartYear], phase: selected.phase, acceptedPooledPackage: false };
  }
  // A published package may split its exact-season roster across several
  // hash-pinned player-season parts. Load every part bound to the composite
  // capability so the donor roster is complete on every device; silently
  // using only the first part makes the browser look like it has a short or
  // empty player list even though the package advertises more rows.
  const playerArtifactIds = [...new Set(
    (proof.index.capabilities?.compositeRecipe?.artifactIds || [])
      .filter(artifactId => /^player-seasons(?:-\d{4})?$/.test(String(artifactId))),
  )];
  if (!playerArtifactIds.includes('player-seasons')) playerArtifactIds.unshift('player-seasons');
  const playerParts = await Promise.all(playerArtifactIds.map(artifactId => loadArtifact(
    proof, artifactId, 'player-seasons', 'compositeRecipe', fetchImpl,
  )));
  const playerPart = {
    ...playerParts[0].value,
    artifactId: 'player-seasons',
    records: playerParts.flatMap(part => part.value.records.map(row => ({
      ...row,
      __swishiqPlayerSeasonsArtifactId: part.artifact.artifactId,
      __swishiqPlayerSeasonsArtifactSha256: part.artifact.sha256,
    }))),
  };
  // These artifacts are part of the published composite capability. Read and
  // hash-verify them even though the current Forge model derives its fallback
  // baselines from the admitted player-season cohort.
  const baselinePart = minimalPlayerSeasonsOnly ? null
    : await loadArtifact(proof, 'era-baselines', 'era-baselines', 'compositeRecipe', fetchImpl);
  const skillPart = minimalPlayerSeasonsOnly ? null
    : await loadArtifact(proof, 'skill-components', 'skill-components', 'compositeRecipe', fetchImpl);
  let metadata = new Map();
  if (!minimalPlayerSeasonsOnly) {
    try { metadata = await loadSwishIqPlayerMetadata({ fetchImpl }); } catch { /* unmatched rows use initials */ }
  }
  const nativeProfiles = adaptPublishedCompositeForgeCohort({
    proof,
    part: playerPart,
    selection: selected,
    cohortId: `native-${proof.package.packageId}-${selected.seasonStartYears.join('-')}`,
  });
  const eraBaselines = baselinePart ? nativeEraBaselineRows(baselinePart.value.records, nativeProfiles.cohort.profiles) : [];
  const supportingArtifacts = [...playerParts, baselinePart, skillPart].filter(Boolean).map(item => ({
    artifactId: item.artifact.artifactId, kind: item.artifact.kind,
    sha256: item.artifact.sha256, rows: item.artifact.rows, bytes: item.artifact.bytes,
  }));
  const sourcePackageRef = proof.package.scope.kind === 'exact-season' ? {
    format: 'djhc-swishiq-package-v3',
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    projectionContentSha256: proof.package.projectionContentSha256,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    projectionIndexPath: proof.package.projectionIndexPath,
    modelId: proof.package.modelId,
    normalizer: proof.package.normalizer,
    metricsVersion: proof.package.metricsVersion,
    scope: proof.package.scope,
    playerSeasonsArtifacts: playerParts.map(part => ({
      artifactId: part.artifact.artifactId,
      path: part.artifact.path,
      sha256: part.artifact.sha256,
      rows: part.artifact.rows,
      bytes: part.artifact.bytes,
    })),
  } : null;
  const cohort = {
    ...nativeProfiles.cohort,
    eraBaselines,
    source: {
      ...nativeProfiles.cohort.source,
      supportingArtifacts,
      sourcePackageRef,
    },
  };
  return {
    proof,
    cohort,
    metadata,
    acceptedPooledPackage: selected.acceptedPooledPackage,
    sourcePackageRef,
    exactSourcePackages: sourcePackageRef ? [sourcePackageRef] : [],
    exactDatasets: sourcePackageRef ? null : undefined,
    minimalPlayerSeasonsOnly: minimalPlayerSeasonsOnly === true,
    adapter: { ...nativeProfiles, cohort },
    nativeArtifacts: { playerPart: playerParts[0], playerParts, baselinePart, skillPart },
  };
}

/**
 * The accepted pooled package is consulted only for its published season
 * catalog. This proof loads the registry and small index, never a player
 * artifact; donor rows still come from exact-season package proofs below.
 */
export async function loadCompositeExactSeasonCatalog({ registryUrl = SWISHIQ_ADVANCED_REGISTRY_URL, fetchImpl } = {}) {
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'unconfigured') {
    const pinnedPackages = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.expectedIdentity?.bundle?.buildRecipe?.packages;
    const seasonStartYears = [...new Set((Array.isArray(pinnedPackages) ? pinnedPackages : [])
      .filter(entry => entry?.scope?.kind === 'exact-season')
      .map(entry => entry.scope.seasonStartYears?.[0])
      .filter(year => integer(year, 1947, 2200)))].sort((left, right) => left - right);
    if (!seasonStartYears.length) fail('The reviewed V4 release does not declare an exact-season catalog for Composite Forge.');
    return Object.freeze({
      registryVersion: 'swishiq-v4-public-registry-v1',
      registryRevisionSha256: CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.registryRevisionSha256,
      seasonStartYears: Object.freeze(seasonStartYears),
    });
  }
  const pooledPin = await discoverPooledV3Package({ registryUrl, fetchImpl, requiredCapabilities: ['compositeRecipe'] });
  const proof = await loadSwishIqPublishedPackageProof({
    packageId: pooledPin.packageId,
    packageVersion: pooledPin.packageVersion,
    requiredCapabilities: ['compositeRecipe'],
    registryUrl,
    fetchImpl,
  });
  if (proof.package.scope.kind !== 'pooled-window'
    || proof.package.packageId !== SWISHIQ_POOLED_PACKAGE_ID
    || !SWISHIQ_POOLED_PACKAGE_VERSION_PATTERN.test(proof.package.packageVersion)
    || proof.package.modelId !== SWISHIQ_V3_MODEL) {
    fail('Composite Forge refused a season catalog outside the currently accepted public window.');
  }
  return Object.freeze({
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    seasonStartYears: Object.freeze([...proof.package.scope.seasonStartYears].sort((left, right) => left - right)),
  });
}

function exactPackageSetDataset(exactDatasets, { availableSeasonStartYears = [], activeSeasonStartYear = null } = {}) {
  const ordered = [...new Map(exactDatasets.filter(dataset => dataset?.sourcePackageRef)
    .map(dataset => [dataset.sourcePackageRef.scope.seasonStartYears[0], dataset])).values()]
    .sort((left, right) => left.sourcePackageRef.scope.seasonStartYears[0] - right.sourcePackageRef.scope.seasonStartYears[0]);
  if (!ordered.length) fail('Browse at least one individually verified exact season before creating a cross-season donor view.');
  if (ordered.length === 1) {
    const [only] = ordered;
    return {
      ...only,
      compositePackageRef: only.compositePackageRef || v3CompositePackageRef(only.proof, false),
      packageScope: only.proof.package.scope,
      exactPackageSet: false,
      browseExactSeasons: true,
      availableSeasonStartYears: [...availableSeasonStartYears],
      activeSeasonStartYear: activeSeasonStartYear ?? only.proof.package.scope.seasonStartYears[0],
      exactSourcePackages: [only.sourcePackageRef],
      exactDatasets: ordered,
    };
  }
  const sourcePackages = ordered.map(dataset => dataset.sourcePackageRef);
  const compositePackageRef = createCompositeForgeExactPackageSetRef(sourcePackages);
  const profiles = ordered.flatMap(dataset => dataset.cohort.profiles)
    .sort((left, right) => left.seasonStartYear - right.seasonStartYear
      || left.team.localeCompare(right.team)
      || left.player.localeCompare(right.player)
      || left.key.localeCompare(right.key));
  if (profiles.length > PLAYER_BUILDER_PROFILE_LIMIT) {
    fail(`The individually verified exact seasons contain ${profiles.length.toLocaleString()} usable player-season rows, above the ${PLAYER_BUILDER_PROFILE_LIMIT.toLocaleString()}-row model limit. Choose fewer seasons.`);
  }
  if (new Set(profiles.map(profile => profile.key)).size !== profiles.length) {
    fail('Individually verified exact seasons repeated a player-season identity; the cross-season set was stopped.');
  }
  const metadata = new Map();
  ordered.forEach(dataset => {
    if (dataset.metadata instanceof Map) dataset.metadata.forEach((value, key) => metadata.set(key, value));
  });
  const seasons = compositePackageRef.scope.seasonStartYears;
  const cohort = {
    id: `swishiq-verified-exact-set-${seasons.join('-')}`,
    profiles,
    eraBaselines: [],
    source: {
      kind: 'swishiq-verified-exact-package-set',
      artifactId: 'player-seasons',
      sourcePackages: sourcePackages.map(source => ({
        packageId: source.packageId,
        packageVersion: source.packageVersion,
        seasonStartYear: source.scope.seasonStartYears[0],
        playerSeasonsArtifacts: source.playerSeasonsArtifacts,
      })),
      rows: profiles.length,
      teams: [...new Set(profiles.map(profile => profile.team))].sort(),
      note: 'Cross-season comparisons use only individually verified exact-season packages. Each observed row retains its own package and player-season artifact hash; no pooled player roster was loaded or inferred.',
    },
  };
  return {
    ...ordered[0],
    proof: ordered.find(dataset => dataset.proof.package.scope.seasonStartYears[0] === activeSeasonStartYear)?.proof || ordered[0].proof,
    cohort,
    metadata,
    acceptedPooledPackage: false,
    sourcePackageRef: null,
    exactSourcePackages: sourcePackages,
    exactDatasets: ordered,
    compositePackageRef,
    packageScope: compositePackageRef.scope,
    exactPackageSet: true,
    browseExactSeasons: true,
    availableSeasonStartYears: [...availableSeasonStartYears],
    activeSeasonStartYear: activeSeasonStartYear ?? seasons[seasons.length - 1],
  };
}

function exactPackageBuildContext(dataset, selectedProfiles) {
  const sourceRefs = Array.isArray(dataset.exactSourcePackages) ? dataset.exactSourcePackages : [];
  if (!dataset.exactPackageSet || !sourceRefs.length || !Array.isArray(selectedProfiles) || !selectedProfiles.length) {
    return { packageRef: dataset.compositePackageRef || (dataset.sourcePackageRef?.format === 'djhc-swishiq-v4-package-ref-v1'
      ? dataset.sourcePackageRef : v3CompositePackageRef(dataset.proof, dataset.acceptedPooledPackage === true)), cohort: dataset.cohort };
  }
  const selectedYears = [...new Set(selectedProfiles.map(profile => profile.seasonStartYear))].sort((left, right) => left - right);
  const selectedSources = sourceRefs.filter(source => selectedYears.includes(source.scope.seasonStartYears[0]));
  if (selectedSources.length !== selectedYears.length) fail('A selected player-season donor has no individually verified exact package source.');
  if (selectedSources.length === 1) {
    const exactDataset = dataset.exactDatasets?.find(item => item.sourcePackageRef.packageId === selectedSources[0].packageId
      && item.sourcePackageRef.packageVersion === selectedSources[0].packageVersion);
    if (!exactDataset) fail('A selected exact-season donor package is no longer in the verified roster cache.');
    return { packageRef: exactDataset.compositePackageRef || v3CompositePackageRef(exactDataset.proof, false), cohort: exactDataset.cohort };
  }
  const packageRefForBuild = selectedSources.length === 1
    ? { ...selectedSources[0], acceptedPooledPackage: false }
    : createCompositeForgeExactPackageSetRef(selectedSources);
  const selectedIds = new Set(selectedSources.map(source => `${source.packageId}|${source.packageVersion}`));
  const profiles = dataset.cohort.profiles.filter(profile => selectedIds.has(`${profile.packageId}|${profile.packageVersion}`));
  const cohort = {
    ...dataset.cohort,
    id: `swishiq-verified-exact-set-${selectedYears.join('-')}`,
    profiles,
    source: {
      ...dataset.cohort.source,
      kind: selectedSources.length === 1 ? 'swishiq-native-package' : 'swishiq-verified-exact-package-set',
      sourcePackages: selectedSources.map(source => ({
        packageId: source.packageId,
        packageVersion: source.packageVersion,
        seasonStartYear: source.scope.seasonStartYears[0],
        playerSeasonsArtifacts: source.playerSeasonsArtifacts,
      })),
      rows: profiles.length,
      note: selectedSources.length === 1
        ? 'Observed player-season rows from one individually verified exact-season package.'
        : 'Cross-season comparisons use only the exact-season packages that supply selected donors. Each observed row retains its own package and player-season artifact hash; no pooled player roster was loaded or inferred.',
    },
  };
  return { packageRef: packageRefForBuild, cohort };
}

function verifiedCompositeProofForResult(dataset, result) {
  const packageRef = result?.recipe?.packageRef;
  if (!packageRef || packageRef.scope?.kind !== 'exact-season'
    || packageRef.scope.seasonStartYears?.length !== 1) return null;
  const proofs = [dataset?.proof, ...(Array.isArray(dataset?.exactDatasets)
    ? dataset.exactDatasets.map(item => item?.proof) : [])].filter(Boolean);
  return proofs.find(proof => proof.package?.packageId === packageRef.packageId
    && proof.package?.packageVersion === packageRef.packageVersion
    && proof.package?.scope?.kind === 'exact-season'
    && proof.package?.scope?.seasonStartYears?.length === 1) || null;
}

function exactPackageSourceRefMatches(left, right) {
  if (!left || !right) return false;
  const normalize = source => ({
    format: source.format,
    packageId: source.packageId,
    packageVersion: source.packageVersion,
    packageManifestSha256: source.packageManifestSha256,
    sourceLockSha256: source.sourceLockSha256,
    projectionContentSha256: source.projectionContentSha256,
    indexSha256: source.indexSha256,
    registryVersion: source.registryVersion,
    registryRevisionSha256: source.registryRevisionSha256,
    projectionIndexPath: source.projectionIndexPath,
    modelId: source.modelId,
    normalizer: source.normalizer,
    metricsVersion: source.metricsVersion,
    scope: {
      kind: source.scope?.kind,
      seasonStartYears: [...(source.scope?.seasonStartYears || [])],
      phases: [...(source.scope?.phases || [])].sort(),
    },
    playerSeasonsArtifacts: [...(source.playerSeasonsArtifacts || [])]
      .sort((a, b) => String(a.artifactId).localeCompare(String(b.artifactId)))
      .map(artifact => ({ artifactId: artifact.artifactId, path: artifact.path, sha256: artifact.sha256, rows: artifact.rows, bytes: artifact.bytes })),
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/**
 * Load the explicit native pooled career package. `acceptedPooledPackage` is
 * intentionally required before any pooled network request is made.
 */
export async function loadCareerDataset({ registryUrl = SWISHIQ_ADVANCED_REGISTRY_URL, fetchImpl, acceptedPooledPackage = false,
  onLookupReady = null } = {}) {
  if (acceptedPooledPackage !== true) {
    fail('Cross-season Career Lab work requires explicit acceptance of the pooled package.');
  }
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status !== 'unconfigured') {
    const data = await loadCanonicalV4StudioPooledData({
      acceptPooled: true,
      phases: [PHASE],
      capabilityId: 'careerHistory',
      fetchImpl,
    });
    return buildCanonicalV4CareerDataset(data);
  }
  const pooledPin = await discoverPooledV3Package({ registryUrl, fetchImpl, requiredCapabilities: ['careerHistory'] });
  const proof = await loadSwishIqPublishedPackageProof({
    packageId: pooledPin.packageId,
    packageVersion: pooledPin.packageVersion,
    requiredCapabilities: ['careerHistory'],
    registryUrl,
    fetchImpl,
  });
  if (proof.package.scope.kind !== 'pooled-window' || proof.package.packageId !== SWISHIQ_POOLED_PACKAGE_ID
    || !SWISHIQ_POOLED_PACKAGE_VERSION_PATTERN.test(proof.package.packageVersion)
    || proof.package.modelId !== SWISHIQ_V3_MODEL) fail('Career Lab requires the published pooled V3 career package.');
  const careerHistoryArtifactIds = [...new Set(proof.package.capabilities.careerHistory.artifactIds || [])].sort();
  // Public simulation is intentionally unavailable until one validated
  // artifact contract and a calibration-aware model consumer are implemented.
  const careerSimulationAvailable = false;
  const careerArtifactIds = careerHistoryArtifactIds;
  const lookupArtifactId = careerArtifactIds.find(artifactId => artifactId === 'career-lookup');
  const compactCareerHistoryArtifactIds = careerArtifactIds.filter(artifactId => /^career-history(?:-\d{4})?$/.test(artifactId));
  const legacyPlayerArtifactIds = careerArtifactIds.filter(artifactId => /^player-seasons(?:-\d{4})?$/.test(artifactId));
  const hasCompactCareerArtifacts = Boolean(lookupArtifactId && compactCareerHistoryArtifactIds.length);
  const hasLegacyCareerArtifacts = !lookupArtifactId && !compactCareerHistoryArtifactIds.length && legacyPlayerArtifactIds.length > 0;
  if (!hasCompactCareerArtifacts && !hasLegacyCareerArtifacts) fail('The pooled Career Lab package has no accepted history artifacts.');
  // New projections expose an identity-only selector first. For an already
  // published older index, keep its existing pinned player-season path usable
  // until that package is regenerated with the compact Career projections.
  const [lookupPart, legacyPlayerParts, stateIndex, metadata] = await Promise.all([
    hasCompactCareerArtifacts
      ? loadArtifact(proof, lookupArtifactId, 'career-lookup', 'careerHistory', fetchImpl) : null,
    hasLegacyCareerArtifacts
      ? Promise.all(legacyPlayerArtifactIds.map(artifactId => loadArtifact(proof, artifactId, 'player-seasons', 'careerHistory', fetchImpl))) : [],
    loadCareerStateIndex(fetchImpl),
    loadCareerMetadata(fetchImpl),
  ]);
  const lookupHistories = hasCompactCareerArtifacts
    ? buildCareerLookupHistories(lookupPart.value.records)
    : buildCareerLookupHistories(legacyPlayerParts.flatMap(part => part.value.records));
  const supportArtifactSources = [lookupPart, ...legacyPlayerParts].filter(Boolean).map(item => ({
    artifactId: item.artifact.artifactId,
    kind: item.artifact.kind,
    sha256: item.artifact.sha256,
    rows: item.artifact.rows,
  }));
  const source = {
    kind: 'swishiq-native-package',
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    artifacts: supportArtifactSources,
    stateIndex: stateIndex ? 'accepted-public-career-state-index' : 'explicit-input-required-when-unavailable',
    note: hasCompactCareerArtifacts
      ? 'The identity lookup and compact observed profiles are package-pinned; public Career Lab supports recorded history and gated local conditional scenarios, while public forecasts and sharing remain closed.'
      : 'This accepted older projection still uses its hash-verified player-season parts until compact Career artifacts are published. Age or experience is never inferred when the accepted state index cannot source it.',
  };
  if (typeof onLookupReady === 'function') {
    let lookupReady;
    let lookupPresented = false;
    try {
      lookupReady = onLookupReady({
        proof,
        histories: lookupHistories,
        source,
        ready: false,
      });
      lookupPresented = true;
    } catch { /* Lookup presentation cannot interrupt the verified data load. */ }
    if (lookupPresented) {
      await yieldCareerLookupPaint();
      if (lookupReady && typeof lookupReady.then === 'function') {
        try { await lookupReady; }
        catch { /* A provisional lookup wait cannot block the verified data load. */ }
      }
    }
  }
  const careerHistoryParts = hasCompactCareerArtifacts ? await Promise.all(compactCareerHistoryArtifactIds.map(artifactId => loadArtifact(
    proof, artifactId, 'career-history', 'careerHistory', fetchImpl,
  ))) : [];
  const records = hasCompactCareerArtifacts
    ? inflateCareerProfileRecords(careerHistoryParts.flatMap(part => part.value.records))
    : legacyPlayerParts.flatMap(part => part.value.records);
  const publicContext = await loadPublicContextBestEffort(fetchImpl);
  const enrichedRecords = enrichPublicSeasonRows(records, publicContext, { withholdAmbiguousPlayerNames: true });
  const firstObserved = enrichedRecords.find(row => row?.observed === true && row.phase === PHASE && text(row.playerRef));
  if (!firstObserved) fail('The pooled Career Lab package has no observed regular-season player rows.');
  const scope = proof.package.scope;
  const careerPart = {
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    modelId: proof.package.modelId,
    normalizer: proof.package.normalizer,
    metricsVersion: proof.package.metricsVersion,
    scope,
    records: enrichedRecords,
  };
  const adapted = adaptPublishedCareerHistories({
    proof,
    part: careerPart,
    selection: {
      seasonStartYears: [...scope.seasonStartYears],
      phase: PHASE,
      asOfSeasonStartYear: scope.seasonStartYears[0],
      acceptedPooledPackage: true,
    },
    targetPlayerRef: firstObserved.playerRef,
    stateIndex,
  });
  const histories = adapted.histories.map(normalizeNativeCareerHistory).filter(history => history.profiles.length > 0);
  if (histories.length < 4) fail('The pooled package has too few accepted career histories.');
  const artifactSources = [lookupPart, ...legacyPlayerParts, ...careerHistoryParts].filter(Boolean).map(item => ({
    artifactId: item.artifact.artifactId,
    kind: item.artifact.kind,
    sha256: item.artifact.sha256,
    rows: item.artifact.rows,
  }));
  source.artifacts = artifactSources;
  return {
    proof,
    histories,
    metadata,
    stateIndex,
    careerSimulationAvailable,
    careerScenarioAvailable: proof.package.scope.kind === 'pooled-window'
      && proof.package.capabilities?.careerHistory?.status === 'available'
      && (hasCompactCareerArtifacts || hasLegacyCareerArtifacts),
    ready: true,
    adapter: adapted,
    nativeArtifacts: {
      lookupPart: lookupPart ? Object.freeze({ artifact: lookupPart.artifact, url: lookupPart.url }) : null,
      playerParts: legacyPlayerParts.map(({ artifact, url }) => Object.freeze({ artifact, url })),
      careerHistoryParts: careerHistoryParts.map(({ artifact, url }) => Object.freeze({ artifact, url })),
    },
    source,
  };
}

function el(documentRef, tag, textContent, className) {
  const node = documentRef.createElement(tag);
  if (textContent !== undefined) node.textContent = textContent;
  if (className) node.className = className;
  return node;
}

function addOption(documentRef, select, value, label) {
  select.append(Object.assign(el(documentRef, 'option', label), { value }));
}

function formatValue(value, digits = 2) { return finite(Number(value)) ? Number(value).toFixed(digits) : 'Unavailable'; }

export function formatOrdinalPercentile(percentile) {
  if (percentile === null || percentile === undefined || percentile === '' || !Number.isFinite(Number(percentile))) {
    return 'Unavailable';
  }
  const value = Math.round(Number(percentile) * 100);
  const absoluteValue = Math.abs(value);
  const lastTwoDigits = absoluteValue % 100;
  const suffix = lastTwoDigits >= 11 && lastTwoDigits <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[absoluteValue % 10] || 'th');
  return `${value}${suffix} percentile`;
}

export function formatCareerDisplayValue(value) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : 'Unavailable';
}

function formatCompositeUnit(unit, fallback = '') {
  const labels = {
    perGame: 'per game',
    per36: 'per 36 minutes',
    minutesPerGame: 'minutes / game',
    percent: 'percent',
    fraction: 'share',
    games: 'games',
  };
  return labels[unit] || fallback || String(unit || '');
}

const COMPOSITE_UI_LABELS = Object.freeze({
  scoring: Object.freeze({ label: 'Scoring', hint: 'Points per game' }),
  shooting: Object.freeze({ label: 'Shooting efficiency', hint: 'Field-goal, three-point, or three-point share' }),
  creation: Object.freeze({ label: 'Creation', hint: 'Creation involvement per 36 minutes is a derived estimate' }),
  playmaking: Object.freeze({ label: 'Playmaking & ball security', hint: 'Assists and turnovers per game' }),
  rebounding: Object.freeze({ label: 'Rebounding', hint: 'Rebounds per game' }),
  defensiveActivity: Object.freeze({ label: 'Defensive activity', hint: 'Steals and blocks per game' }),
  efficiency: Object.freeze({ label: 'Scoring efficiency', hint: 'True shooting or effective field-goal percentage' }),
  workload: Object.freeze({ label: 'Workload & availability', hint: 'Minutes and games observed' }),
});

export const PLAYER_BUILDER_LOOP_STAGES = Object.freeze([
  Object.freeze({ key: 'choose', label: 'Choose' }),
  Object.freeze({ key: 'preview', label: 'Preview' }),
  Object.freeze({ key: 'lock', label: 'Lock' }),
]);

/**
 * Keep the Player Builder's choice loop deterministic and easy to test without
 * moving any package or Composite Forge rules into the DOM controller.
 */
export function playerBuilderLoopState({
  selectedCount = 0,
  totalCount = COMPOSITE_FORGE_COMPONENTS.length,
  previewed = false,
  locked = false,
  roleSelected = true,
  rosterSelected = true,
} = {}) {
  const total = integer(totalCount) && totalCount > 0 ? totalCount : COMPOSITE_FORGE_COMPONENTS.length;
  const selected = integer(selectedCount) ? Math.max(0, Math.min(total, selectedCount)) : 0;
  const hasRole = roleSelected !== false;
  // A profile can be explored with any non-empty trait combination. Missing
  // skills remain explicit in the model receipt instead of blocking preview.
  const complete = selected > 0;
  const isLocked = Boolean(locked) && complete;
  const isPreviewed = Boolean(previewed) && complete;
  const stage = isLocked ? 'lock' : isPreviewed ? 'preview' : 'choose';
  const stageIndex = PLAYER_BUILDER_LOOP_STAGES.findIndex(item => item.key === stage);
  const steps = PLAYER_BUILDER_LOOP_STAGES.map((item, index) => Object.freeze({
    ...item,
    current: index === stageIndex,
    complete: index < stageIndex || (item.key === 'choose' && complete && stageIndex > 0),
  }));
  return Object.freeze({
    selected,
    total,
    roleSelected: hasRole,
    complete,
    previewed: isPreviewed,
    locked: isLocked,
    stage,
    stageIndex,
    progressPercent: Math.round(((stageIndex + 1) / PLAYER_BUILDER_LOOP_STAGES.length) * 100),
    steps,
    prompt: isLocked
      ? 'Choices locked. Build the recipe when you are ready to replay this profile.'
      : isPreviewed
      ? 'Preview the profile, then lock your choices to keep this recipe reproducible.'
      : !selected && !rosterSelected
      ? 'Set a season and team to browse player-season examples.'
      : !selected
      ? 'Choose one or more player examples to preview a profile.'
      : selected < total
      ? `${selected} of ${total} skill slots filled. You can preview this partial profile.`
      : hasRole
      ? 'All skill slots are filled. Preview the profile before locking it.'
      : 'All skill slots are filled. A role archetype is optional; preview before locking.',
  });
}

/** Compare only like-for-like, available component tuning aids. */
export function compositeRoundFeedback(previous, current) {
  if (!previous || !current) return null;
  const before = new Map((previous.gameRating?.components || [])
    .filter(part => Number.isFinite(part?.rating)).map(part => [part.component, part.rating]));
  const changes = (current.gameRating?.components || [])
    .filter(part => before.has(part.component) && Number.isFinite(part?.rating))
    .map(part => ({ key: part.component, label: compositeUiLabel(part.component), change: part.rating - before.get(part.component) }));
  return { changes, improved: changes.filter(part => part.change > 0).length,
    declined: changes.filter(part => part.change < 0).length };
}

/** Keep the next choice tied to a component the model could actually assess. */
export function nextCompositeSkill(result) {
  const ratings = (result?.gameRating?.components || []).filter(part => Number.isFinite(part?.rating));
  if (!ratings.length) return COMPOSITE_FORGE_COMPONENTS[0].key;
  return [...ratings].sort((left, right) => left.rating - right.rating)[0].component;
}

/** Policy experiments share a fixed recorded cutoff, horizon, and replay seed. */
export function careerRoundFeedback(previous, current) {
  if (previous?.status !== 'complete' || current?.status !== 'complete') return null;
  const measures = ['points', 'assists', 'rebounds'];
  const changes = measures.map(metricName => {
    const before = previous.trajectories?.[metricName]?.at(-1);
    const after = current.trajectories?.[metricName]?.at(-1);
    if (!before || !after || before.seasonStartYear !== after.seasonStartYear) return null;
    const beforeValue = before.quantiles?.[50];
    const afterValue = after.quantiles?.[50];
    return Number.isFinite(beforeValue) && Number.isFinite(afterValue)
      ? { metric: metricName, change: afterValue - beforeValue, seasonStartYear: after.seasonStartYear } : null;
  }).filter(Boolean);
  return { changes };
}

function modeledCareerHorizonP50(report, metricName) {
  const value = report?.trajectories?.[metricName]?.at(-1)?.quantiles?.[50];
  return Number.isFinite(value) ? value : null;
}

function validCompositeRoundSnapshot(snapshot, scopeKey) {
  const components = new Set(COMPOSITE_FORGE_COMPONENTS.map(spec => spec.key));
  return object(snapshot) && snapshot.version === 1 && snapshot.scopeKey === scopeKey
    && integer(snapshot.rounds) && snapshot.rounds >= 1 && snapshot.rounds <= 1000
    && (snapshot.goalSkill === null || components.has(snapshot.goalSkill))
    && typeof snapshot.goalMet === 'boolean'
    && object(snapshot.bestAids)
    && Object.entries(snapshot.bestAids).length <= components.size
    && Object.entries(snapshot.bestAids).every(([key, value]) => components.has(key) && finite(value) && value >= 0 && value <= 99)
    && ['previousAid', 'currentAid'].every(key => snapshot[key] === null
      || (finite(snapshot[key]) && snapshot[key] >= 0 && snapshot[key] <= 99));
}

function validCareerRoundSnapshot(snapshot, scopeKey) {
  const policies = new Set(['conservative', 'typical', 'breakout', 'decline']);
  return object(snapshot) && snapshot.version === 1 && snapshot.scopeKey === scopeKey
    && ['points', 'assists', 'rebounds'].includes(snapshot.goalMetric)
    && policies.has(snapshot.lastPolicy) && object(snapshot.policyValues)
    && Object.entries(snapshot.policyValues).length >= 1 && Object.entries(snapshot.policyValues).length <= policies.size
    && Object.entries(snapshot.policyValues).every(([policy, value]) => policies.has(policy)
      && (value === null || (finite(value) && value >= 0 && value <= 100)))
    && Object.hasOwn(snapshot.policyValues, snapshot.lastPolicy);
}

function compositeUiLabel(component) {
  const key = typeof component === 'string' ? component : component?.key;
  return COMPOSITE_UI_LABELS[key]?.label || component?.label || key || 'Component';
}

function compositeUiHint(component) {
  const key = typeof component === 'string' ? component : component?.key;
  return COMPOSITE_UI_LABELS[key]?.hint || 'Observed component from the selected player season';
}

function compositeUserFacingCopy(value, fallback = '') {
  const copy = String(value || '').trim();
  if (!copy) return fallback;
  if (/\b(?:package|source|artifact|hash|provenance|registry)\b/i.test(copy)) return fallback;
  return copy.replace(/\bevidence\b/gi, 'support');
}

function careerUserFacingCopy(value, fallback = '') {
  const copy = String(value || '').trim();
  if (!copy || /\b(?:package|source|artifact|hash|provenance|registry|evidence)\b/i.test(copy)) return fallback;
  return copy;
}

function renderCompositeShareAction(documentRef, resultsRoot, result, verifiedProof) {
  const sourceMode = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN.status === 'unconfigured'
    ? 'v3' : 'canonical-v4-required';
  const section = renderCompositeForgePublicShareAction(documentRef, resultsRoot, result, verifiedProof, { sourceMode });
  if (!section) return null;
  const [heading, explanation, button, status] = Array.from(section.children || []);
  const v4Required = section.dataset.resultShareGeneration === 'v4';
  const v4Unavailable = section.dataset.resultShareStatus === 'unavailable' && v4Required;
  if (heading) heading.textContent = 'Share synthetic player profile';
  if (explanation) explanation.textContent = button?.disabled
    ? v4Unavailable
      ? 'V4 sharing is unavailable until an exact-season Composite model result passes its validation and production approval gates. No V3 summary is used.'
      : v4Required
        ? 'V4 result evidence is eligible, but secure signing still requires an available signing method and reviewed share service.'
        : 'Sharing requires a complete single-season synthetic profile and an available signing method. Partial and cross-season profiles cannot be shared.'
    : 'A signed link contains approved aggregate output only. Player names, trait picks, donor details, the recipe, and placement seed stay on this device. Values are modeled, not observed statistics or a forecast.';
  if (status) status.textContent = button?.disabled
    ? v4Unavailable
      ? `V4 result share unavailable (${section.dataset.resultShareErrorCode || 'proof-unavailable'}). No V3 result was shared.`
      : 'No link has been created. Sharing is unavailable for this result or browser.'
    : 'No link is created until you activate Share synthetic summary.';
  return section;
}

const COMPOSITE_STAT_LABELS = Object.freeze({
  points: 'Points per game',
  assists: 'Assists per game',
  rebounds: 'Rebounds per game',
  turnovers: 'Turnovers per game',
  steals: 'Steals per game',
  blocks: 'Blocks per game',
  involvementPer36: 'Creation involvement per 36 minutes (derived estimate)',
});

function renderNotice(documentRef, root, message, kind = 'status') {
  const notice = el(documentRef, 'p', message, `swishiq-advanced-notice swishiq-advanced-notice--${kind}`);
  notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  root.replaceChildren(notice);
  return notice;
}

function ensureCareerVisualStyles(documentRef) {
  const head = documentRef?.head;
  if (!head || typeof documentRef.createElement !== 'function') return;
  const existing = typeof documentRef.querySelector === 'function'
    ? documentRef.querySelector('link[data-swishiq-career-visuals]')
    : null;
  if (existing) return;
  const link = documentRef.createElement('link');
  link.rel = 'stylesheet';
  link.href = CAREER_VISUAL_STYLES_URL;
  link.dataset.swishiqCareerVisuals = 'true';
  head.append(link);
}

function renderTable(documentRef, title, headers, rows) {
  const wrap = el(documentRef, 'div', undefined, 'swishiq-advanced-table-wrap');
  markKeyboardScrollableTable(wrap, title);
  const table = el(documentRef, 'table', undefined, 'swishiq-advanced-table');
  table.append(el(documentRef, 'caption', title));
  const head = el(documentRef, 'thead');
  const headRow = el(documentRef, 'tr');
  headers.forEach(header => headRow.append(el(documentRef, 'th', header)));
  head.append(headRow); table.append(head);
  const body = el(documentRef, 'tbody');
  rows.forEach(row => {
    const tr = el(documentRef, 'tr');
    row.forEach((value, index) => { const cell = el(documentRef, index === 0 ? 'th' : 'td', String(value)); if (index === 0) cell.scope = 'row'; tr.append(cell); });
    body.append(tr);
  });
  table.append(body); wrap.append(table); return wrap;
}

export function markKeyboardScrollableTable(region, title = 'Data table') {
  if (!region) return region;
  region.tabIndex = 0;
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', `${title}. Use Left/Right Arrow to scroll horizontally; Home/End to jump to the first/last column.`);
  region.dataset.swishiqKeyboardScroll = 'true';
  return region;
}

export function bindKeyboardScrollableTables(root) {
  if (!root || root.dataset.swishiqKeyboardScrollBound === 'true') return;
  root.dataset.swishiqKeyboardScrollBound = 'true';
  root.addEventListener('keydown', event => {
    const region = event.target;
    if (region?.dataset?.swishiqKeyboardScroll !== 'true'
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const maxScroll = Number(region.scrollWidth) - Number(region.clientWidth);
    if (!Number.isFinite(maxScroll) || maxScroll <= 0) return;
    const maximum = Math.max(0, maxScroll);
    const current = Math.max(0, Math.min(maximum, Number(region.scrollLeft) || 0));
    let next;
    if (event.key === 'ArrowLeft') next = Math.max(0, current - 40);
    else if (event.key === 'ArrowRight') next = Math.min(maximum, current + 40);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = maximum;
    else return;
    event.preventDefault?.();
    region.scrollLeft = next;
  });
}

function currentExactSelection(documentRef) {
  const value = documentRef.getElementById('packageSelect')?.value || '';
  const [packageId, packageVersion] = value.split('|');
  if (!packageId || !packageVersion) return null;
  try { return parseSeasonSelection({ packageId, packageVersion }); }
  catch { return null; }
}

export function sameExactSelection(left, right) {
  return Boolean(left && right)
    && left.packageId === right.packageId
    && left.packageVersion === right.packageVersion
    && left.seasonStartYear === right.seasonStartYear
    && left.phase === right.phase;
}

function compositeWorkbenchIsActive(documentRef) {
  return documentRef.querySelector('.swishiq-tabs button[data-workbench="composite"]')
    ?.getAttribute('aria-pressed') === 'true';
}

function setPanelVisibility(documentRef, workbench, visible) {
  const panel = documentRef.getElementById(`${workbench}LabPanel`);
  if (panel) panel.hidden = !visible;
  if (visible) {
    documentRef.getElementById('workbenchPlaceholder')?.setAttribute('hidden', 'hidden');
    const workspaceTitle = documentRef.getElementById('workspaceTitle');
    const workbenchState = documentRef.getElementById('workbenchState');
    const workbenchDescription = documentRef.getElementById('workbenchDescription');
    if (workspaceTitle) workspaceTitle.textContent = workbench === 'career' ? 'Career history available' : 'Player Builder ready';
    if (workbenchState) {
      workbenchState.textContent = workbench === 'career' ? 'History available' : 'Available';
      workbenchState.dataset.state = 'available';
      workbenchState.classList.add('swishiq-state--ready');
    }
    if (workbenchDescription) workbenchDescription.textContent = workbench === 'career'
      ? 'Review recorded seasons through a selected cutoff. Forecasts are unavailable in this public release.'
    : 'Use recorded season components.';
  }
}

function mountComposite({ documentRef, registryUrl, fetchImpl }) {
  const root = documentRef.getElementById('compositeLabPanel');
  if (!root) return null;
  bindKeyboardScrollableTables(root);
  let dataset = null;
  const exactDatasetCache = new Map();
  let exactSeasonCatalog = null;
  let useVerifiedExactSeasonSet = false;
  let crossSourceHydrated = false;
  let activeSourcePackageKeys = null;
  let activeBrowseSeasonStartYear = null;
  let activeDonors = null;
  let token = 0;
  const render = async (initialDonors = null) => {
    const current = ++token;
    const selection = currentExactSelection(documentRef);
    if (initialDonors && typeof initialDonors === 'object') activeDonors = initialDonors;
    if (!selection || !compositeWorkbenchIsActive(documentRef)) {
      root.removeAttribute('aria-busy');
      setPanelVisibility(documentRef, 'composite', false);
      return;
    }
    root.setAttribute('aria-busy', 'true');
    // Keep the panel visible while the verified roster parts are loading. A
    // hidden panel made a slow or failed player-list request look like a
    // disabled mobile control with no explanation.
    setPanelVisibility(documentRef, 'composite', true);
    renderNotice(documentRef, root, useVerifiedExactSeasonSet
      ? 'Preparing player examples across seasons…'
      : 'Loading player examples for the selected season…');
    try {
      const cacheKey = `${selection.packageId}|${selection.packageVersion}`;
      let exactDataset = exactDatasetCache.get(cacheKey);
      if (!exactDataset) {
        exactDataset = await loadCompositeDataset({ ...selection, registryUrl, fetchImpl });
        exactDatasetCache.set(cacheKey, exactDataset);
      }
      if (!useVerifiedExactSeasonSet) {
        dataset = exactDataset;
        activeBrowseSeasonStartYear = selection.seasonStartYear;
      } else {
        if (!exactSeasonCatalog) exactSeasonCatalog = await loadCompositeExactSeasonCatalog({ registryUrl, fetchImpl });
        if (exactDataset.proof.registry.registryRevisionSha256 !== exactSeasonCatalog.registryRevisionSha256) {
          fail('The selected exact package and season catalog were published under different registry revisions. Reload Studio before combining seasons.');
        }
        if (!crossSourceHydrated) {
          crossSourceHydrated = true;
          activeSourcePackageKeys = null;
          const saved = loadCompositeForgeRecipe(browserStorage(), COMPOSITE_STORAGE_KEY);
          const savedPackageRef = saved.status === 'loaded' ? saved.recipe.packageRef : null;
          if (savedPackageRef?.scope?.kind === 'verified-exact-package-set') {
            const savedSources = savedPackageRef.sourcePackages || [];
            activeSourcePackageKeys = new Set();
            for (const sourceRef of savedSources) {
              const sourceYear = sourceRef.scope?.seasonStartYears?.[0];
              if (!exactSeasonCatalog.seasonStartYears.includes(sourceYear)) {
                fail('A saved exact-package recipe references a season outside the current verified catalog. Its pin was preserved for review.');
              }
              let cached = [...exactDatasetCache.values()].find(entry => entry.sourcePackageRef?.packageId === sourceRef.packageId
                && entry.sourcePackageRef?.packageVersion === sourceRef.packageVersion);
              if (!cached) {
                cached = await loadCompositeDataset({ seasonStartYear: sourceYear, minimalPlayerSeasonsOnly: true, registryUrl, fetchImpl });
                if (!exactPackageSourceRefMatches(sourceRef, cached.sourcePackageRef)) {
                  fail('The saved exact package or player-season artifact changed. The existing replay pin was preserved.');
                }
                exactDatasetCache.set(`${cached.proof.package.packageId}|${cached.proof.package.packageVersion}`, cached);
              } else if (!exactPackageSourceRefMatches(sourceRef, cached.sourcePackageRef)) {
                fail('The cached exact package or player-season artifact does not match the saved replay pin.');
              }
              activeSourcePackageKeys.add(`${sourceRef.packageId}|${sourceRef.packageVersion}`);
            }
            const firstSavedSeason = savedSources[0]?.scope?.seasonStartYears?.[0];
            if (!savedSources.some(source => source.scope.seasonStartYears[0] === activeBrowseSeasonStartYear)) {
              activeBrowseSeasonStartYear = firstSavedSeason ?? selection.seasonStartYear;
            }
          }
        }
        const cachedExactDatasets = [...exactDatasetCache.values()];
        const sourceDatasets = activeSourcePackageKeys
          ? cachedExactDatasets.filter(entry => activeSourcePackageKeys.has(`${entry.sourcePackageRef?.packageId}|${entry.sourcePackageRef?.packageVersion}`))
          : cachedExactDatasets;
        dataset = exactPackageSetDataset(sourceDatasets, {
          availableSeasonStartYears: exactSeasonCatalog.seasonStartYears,
          activeSeasonStartYear: activeBrowseSeasonStartYear ?? selection.seasonStartYear,
        });
      }
      if (current !== token || !compositeWorkbenchIsActive(documentRef)
        || !sameExactSelection(selection, currentExactSelection(documentRef))) return;
      renderCompositeForm(documentRef, root, dataset, {
        defaultSeasonStartYear: activeBrowseSeasonStartYear ?? selection.seasonStartYear,
        fetchImpl,
        initialDonors: activeDonors,
        onDonorsChange: donors => { activeDonors = donors; },
        onUseCrossSeasonPackages: donors => {
          activeDonors = donors;
          useVerifiedExactSeasonSet = true;
          crossSourceHydrated = false;
          activeSourcePackageKeys = null;
          activeBrowseSeasonStartYear = selection.seasonStartYear;
          void render(donors);
        },
        onUseExactSeason: donors => {
          activeDonors = donors;
          useVerifiedExactSeasonSet = false;
          activeBrowseSeasonStartYear = selection.seasonStartYear;
          void render(donors);
        },
        onSelectExactSeason: (year, donors) => { void loadBrowseSeason(year, donors); },
      });
      setPanelVisibility(documentRef, 'composite', true);
    } catch (error) {
      if (current === token && compositeWorkbenchIsActive(documentRef)
        && sameExactSelection(selection, currentExactSelection(documentRef))) {
        setPanelVisibility(documentRef, 'composite', true);
        renderNotice(documentRef, root, compositeUserFacingCopy(error?.message, 'Player examples could not be loaded for this selection. Try again.'), 'error');
      }
    } finally { if (current === token) root.removeAttribute('aria-busy'); }
  };
  const loadBrowseSeason = async (seasonStartYear, donors) => {
    const current = ++token;
    const selection = currentExactSelection(documentRef);
    if (!selection || !compositeWorkbenchIsActive(documentRef)) return;
    activeDonors = donors && typeof donors === 'object' ? donors : activeDonors;
    activeBrowseSeasonStartYear = Number(seasonStartYear);
    root.setAttribute('aria-busy', 'true');
    setPanelVisibility(documentRef, 'composite', true);
    renderNotice(documentRef, root, `Loading player examples for ${labelSeason(activeBrowseSeasonStartYear)}…`);
    try {
      if (!exactSeasonCatalog) exactSeasonCatalog = await loadCompositeExactSeasonCatalog({ registryUrl, fetchImpl });
      if (!exactSeasonCatalog.seasonStartYears.includes(activeBrowseSeasonStartYear)) {
        fail('Player examples are unavailable for this season. Choose another season or reload Studio.');
      }
      const existing = [...exactDatasetCache.values()].find(entry => entry.sourcePackageRef?.scope.seasonStartYears[0] === activeBrowseSeasonStartYear);
      if (!existing) {
        const loaded = await loadCompositeDataset({
          seasonStartYear: activeBrowseSeasonStartYear,
          minimalPlayerSeasonsOnly: true,
          registryUrl,
          fetchImpl,
        });
        if (loaded.proof.registry.registryRevisionSha256 !== exactSeasonCatalog.registryRevisionSha256) {
          fail('The selected exact package was published under a different registry revision. Reload Studio before combining seasons.');
        }
        exactDatasetCache.set(`${loaded.proof.package.packageId}|${loaded.proof.package.packageVersion}`, loaded);
      }
      if (activeSourcePackageKeys) {
        const loadedSource = [...exactDatasetCache.values()].find(entry => entry.sourcePackageRef?.scope.seasonStartYears[0] === activeBrowseSeasonStartYear);
        if (loadedSource) activeSourcePackageKeys.add(`${loadedSource.sourcePackageRef.packageId}|${loadedSource.sourcePackageRef.packageVersion}`);
      }
      if (current !== token || !compositeWorkbenchIsActive(documentRef)
        || !sameExactSelection(selection, currentExactSelection(documentRef))) return;
      await render(activeDonors);
    } catch (error) {
      if (current === token && compositeWorkbenchIsActive(documentRef)) {
        setPanelVisibility(documentRef, 'composite', true);
        renderNotice(documentRef, root, compositeUserFacingCopy(error?.message, `Player examples for ${labelSeason(activeBrowseSeasonStartYear)} could not be loaded. Try again.`), 'error');
      }
    } finally { if (current === token) root.removeAttribute('aria-busy'); }
  };
  const handle = () => queueMicrotask(() => {
    if (compositeWorkbenchIsActive(documentRef)) void render();
    else {
      // Invalidate a pending package request when the user leaves Player
      // Builder so its eventual response cannot reopen the hidden panel.
      token += 1;
      root.removeAttribute('aria-busy');
      setPanelVisibility(documentRef, 'composite', false);
    }
  });
  documentRef.querySelectorAll('.swishiq-tabs button').forEach(button => button.addEventListener('click', handle));
  documentRef.getElementById('packageSelect')?.addEventListener('change', handle);
  return Object.freeze({ reload: render });
}

function readSavedCompositeModelVersion(storage, storageKey) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const serialized = storage.getItem(storageKey);
    if (typeof serialized !== 'string' || serialized.length > COMPOSITE_FORGE_LIMITS.maxRecipeBytes) return null;
    const version = JSON.parse(serialized)?.recipe?.modelVersion;
    return typeof version === 'string'
      && /^composite-forge-model-v\d{1,3}(?:-[A-Za-z0-9][A-Za-z0-9._-]{0,79})?$/.test(version) ? version : null;
  } catch { return null; }
}

function compositeModelRevision(version) {
  const match = /^composite-forge-model-v(\d{1,3})(?:-[A-Za-z0-9][A-Za-z0-9._-]{0,79})?$/.exec(String(version || ''));
  return match ? Number(match[1]) : null;
}

function renderCompositeForm(documentRef, root, dataset, {
  defaultSeasonStartYear = null,
  fetchImpl,
  initialDonors = null,
  onDonorsChange = null,
  onUseCrossSeasonPackages = null,
  onUseExactSeason = null,
  onSelectExactSeason = null,
} = {}) {
  root.replaceChildren();
  const storage = browserStorage();
  const title = el(documentRef, 'h2', 'Composite Forge'); title.id = 'compositeLabTitle';
  const loadedProfiles = dataset.cohort.profiles.length;
  const packageScope = dataset.packageScope || dataset.proof?.package?.scope || {};
  const exactPackageSet = packageScope.kind === 'verified-exact-package-set' && dataset.exactPackageSet === true;
  const browseExactSeasons = dataset.browseExactSeasons === true;
  root.append(title);

  const form = el(documentRef, 'form', undefined, 'swishiq-advanced-form');
  form.classList.add('swishiq-composite-controls', 'swishiq-composite-flow-shell');
  form.setAttribute('aria-labelledby', 'compositeLabTitle');
  const selectionSummary = el(documentRef, 'p', 'No component examples selected yet.', 'swishiq-composite-selection-summary');
  const grid = el(documentRef, 'div', undefined, 'swishiq-composite-flow');
  const settingsGrid = el(documentRef, 'div', undefined, 'swishiq-composite-settings-grid');
  const selects = new Map();
  const byComponent = new Map();
  const candidatePages = new Map();
  const pageControls = new Map();
  const componentFields = new Map();
  const traitTargets = new Map();
  let activeComponentIndex = 0;
  let builderLocked = false;
  let builderPreviewed = false;
  let runButton = null;
  let lockButton = null;
  let previewButton = null;
  let resetButton = null;
  let previousBuild = null;
  let completedBuilds = 0;
  let nextRoundButton = null;
  let revisingBuild = false;
  let lastBuiltChoiceKey = null;
  let roundGoalSkill = null;
  let roundGoalMet = false;
  const bestComponentAids = new Map();
  let status = null;
  const markChoiceControl = (node, { requiresRoster = false, pager = false } = {}) => {
    if (node) {
      node.dataset.builderChoiceControl = 'true';
      if (requiresRoster) node.dataset.builderRosterRequired = 'true';
      if (pager) node.dataset.builderPageControl = 'true';
    }
    return node;
  };
  const slotSection = el(documentRef, 'section', undefined, 'swishiq-composite-slot-section');
  slotSection.setAttribute('aria-label', 'Assign players to skill slots');
  const slotHeading = el(documentRef, 'div', undefined, 'swishiq-composite-slot-section__heading');
  slotHeading.append(
    el(documentRef, 'h3', 'Assign players to skill slots'),
    el(documentRef, 'p', 'Choose a skill slot, then assign a player from the roster.'),
  );
  const slotFields = el(documentRef, 'div', undefined, 'swishiq-composite-slot-fields');
  const componentStepper = el(documentRef, 'div', undefined, 'swishiq-composite-stepper');
  const componentStepLabel = el(documentRef, 'strong', '', 'swishiq-composite-stepper__label');
  componentStepLabel.setAttribute('aria-live', 'polite');
  const componentStepControls = el(documentRef, 'div', undefined, 'swishiq-composite-stepper__controls');
  const previousComponentButton = el(documentRef, 'button', 'Previous skill', 'button');
  previousComponentButton.type = 'button';
  previousComponentButton.setAttribute('aria-label', 'Previous skill');
  const nextComponentButton = el(documentRef, 'button', 'Next skill', 'button');
  nextComponentButton.type = 'button';
  nextComponentButton.setAttribute('aria-label', 'Next skill');
  componentStepControls.append(previousComponentButton, nextComponentButton);
  componentStepper.append(componentStepLabel, componentStepControls);
  const selectedProfilesForLoop = () => [...selects.entries()]
    .map(([, select]) => dataset.cohort.profiles.find(profile => profile.key === select.value))
    .filter(Boolean);
  const visual = el(documentRef, 'section', undefined, 'swishiq-builder-visual');
  visual.setAttribute('aria-label', 'Live Composite Forge component preview');
  visual.tabIndex = -1;
  const visualHead = el(documentRef, 'div', undefined, 'swishiq-builder-visual__head');
  const visualKicker = el(documentRef, 'span', 'Live preview · updates as you choose');
  const visualTitle = el(documentRef, 'strong', 'Component values');
  visualHead.append(visualKicker, visualTitle);
  const visualGrid = el(documentRef, 'div', undefined, 'swishiq-builder-visual__grid');
  const sampleLimits = el(documentRef, 'details', undefined, 'swishiq-builder-evidence');
  const sampleLimitsSummary = el(documentRef, 'summary', 'Sample coverage and model limits');
  const sampleLimitsBody = el(documentRef, 'div', undefined, 'swishiq-builder-evidence__body');
  sampleLimitsBody.append(
    el(documentRef, 'p', `${loadedProfiles.toLocaleString()} eligible player-season examples are available. Donors need at least 10 recorded games; unavailable trait values stay unavailable.`),
    el(documentRef, 'p', 'Values keep their listed units and player-season context. Cross-skill outputs may use a bounded modeled blend when compatible relationships are unavailable.'),
    el(documentRef, 'p', 'Generated profiles are synthetic, not player forecasts or overall grades. Output ranges and sample coverage describe model limits.'),
  );
  sampleLimits.append(sampleLimitsSummary, sampleLimitsBody);
  visual.append(visualHead, visualGrid, sampleLimits);
  const archetype = el(documentRef, 'select');
  archetype.disabled = true;
  addOption(documentRef, archetype, '', 'Optional role archetype…');
  archetype.options[0].disabled = true;
  archetype.required = false;
  Object.values(COMPOSITE_ARCHETYPES).forEach(spec => addOption(documentRef, archetype, spec.key, spec.label));
  const donorSeason = el(documentRef, 'select');
  const packageSeasons = Array.isArray(packageScope.seasonStartYears)
    ? packageScope.seasonStartYears.filter(integer).sort((left, right) => left - right) : [];
  const publishedSeasons = browseExactSeasons && Array.isArray(dataset.availableSeasonStartYears)
    ? dataset.availableSeasonStartYears.filter(integer).sort((left, right) => left - right)
    : packageSeasons;
  publishedSeasons.forEach(year => addOption(documentRef, donorSeason, year, labelSeason(year)));
  donorSeason.value = publishedSeasons.includes(Number(defaultSeasonStartYear))
    ? String(defaultSeasonStartYear)
    : publishedSeasons.length ? String(publishedSeasons[0]) : '';
  donorSeason.disabled = publishedSeasons.length <= 1 || (!browseExactSeasons && packageSeasons.length <= 1);
  const donorSeasonLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  donorSeasonLabel.classList.add('swishiq-composite-season-field');
  donorSeasonLabel.append(el(documentRef, 'span', 'Player season'), donorSeason);
   const pickerScope = el(documentRef, 'div', undefined, 'swishiq-composite-picker-scope');
   pickerScope.append(el(documentRef, 'strong', 'Choose or draft players'));
  const filterStrip = el(documentRef, 'div', undefined, 'swishiq-composite-filter-strip');
  filterStrip.setAttribute('aria-label', 'Filter players by season, team, and name');
  filterStrip.append(donorSeasonLabel);
  pickerScope.append(filterStrip);
  grid.append(pickerScope);
  if ((exactPackageSet || browseExactSeasons) && typeof onUseExactSeason === 'function') {
    const exactButton = el(documentRef, 'button', 'Return to selected season', 'button-secondary');
    exactButton.type = 'button';
    markChoiceControl(exactButton);
    exactButton.addEventListener('click', () => onUseExactSeason(Object.fromEntries(
      COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, selects.get(spec.key)?.value || '']),
    )));
    pickerScope.append(exactButton);
  } else if (!browseExactSeasons && typeof onUseCrossSeasonPackages === 'function') {
    const crossSeasonButton = el(documentRef, 'button', 'Browse across seasons', 'button-secondary');
    crossSeasonButton.type = 'button';
    markChoiceControl(crossSeasonButton);
    crossSeasonButton.setAttribute('aria-label', 'Browse player examples across seasons');
    crossSeasonButton.addEventListener('click', () => onUseCrossSeasonPackages(Object.fromEntries(
      COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, selects.get(spec.key)?.value || '']),
    )));
    pickerScope.append(crossSeasonButton);
  }
  const donorTeam = el(documentRef, 'select');
  const refreshDonorTeams = () => {
    const prior = donorTeam.value;
    donorTeam.replaceChildren();
    addOption(documentRef, donorTeam, '', 'Choose a team…');
    [...new Set(dataset.cohort.profiles.filter(profile => profile.seasonStartYear === Number(donorSeason.value))
      .map(profile => profile.team).filter(teamCode => TEAM_CODE.test(teamCode)))].sort()
      .forEach(teamCode => addOption(documentRef, donorTeam, teamCode, teamCode));
    donorTeam.value = prior && [...donorTeam.options].some(option => option.value === prior)
      ? prior
      : Array.from(donorTeam.options).find(option => option.value)?.value || '';
  };
  refreshDonorTeams();
  markChoiceControl(donorTeam);
  const donorTeamLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  donorTeamLabel.classList.add('swishiq-composite-team-field');
  donorTeamLabel.append(el(documentRef, 'span', 'Player team'), donorTeam);
  filterStrip.append(donorTeamLabel);
  const donorSearch = el(documentRef, 'input');
  Object.assign(donorSearch, { type: 'search', autocomplete: 'off', placeholder: 'Search this roster' });
  donorSearch.setAttribute('aria-label', 'Search player rows');
  markChoiceControl(donorSearch, { requiresRoster: true });
  const donorSearchLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  donorSearchLabel.classList.add('swishiq-composite-search-field');
  donorSearchLabel.append(el(documentRef, 'span', 'Search players'), donorSearch);
  filterStrip.append(donorSearchLabel);
  const roster = el(documentRef, 'section', undefined, 'swishiq-composite-roster');
  // The package request is announced before this form mounts; roster rows
  // render synchronously from the loaded cohort, so a second loading message
  // here would only duplicate the outer notice.
  const rosterStatus = el(documentRef, 'p', '', 'swishiq-composite-roster__status');
  rosterStatus.id = 'compositeRosterStatus';
  rosterStatus.setAttribute('id', rosterStatus.id);
  rosterStatus.setAttribute('role', 'status');
  const rosterTableWrap = el(documentRef, 'div', undefined, 'swishiq-advanced-table-wrap swishiq-composite-roster__table-wrap');
  markKeyboardScrollableTable(rosterTableWrap, 'Player-season stats table');
  const rosterTable = el(documentRef, 'table', undefined, 'swishiq-advanced-table swishiq-composite-roster__table');
  const rosterCaption = el(documentRef, 'caption', 'Player roster · assign to the selected skill', 'swishiq-composite-roster__caption');
  rosterCaption.id = 'compositeRosterCaption';
  rosterCaption.setAttribute('id', rosterCaption.id);
  roster.setAttribute('aria-labelledby', rosterCaption.id);
  const rosterContextNote = el(documentRef, 'p', `Select a skill slot above, then use Assign in a player row. ${labelSeason(Number(donorSeason.value))} · Regular-season stats · Trait values keep their listed units.`, 'swishiq-table-source-note');
  rosterContextNote.id = 'compositeRosterContextNote';
  rosterContextNote.setAttribute('id', rosterContextNote.id);
  rosterTable.setAttribute('aria-describedby', `${rosterStatus.id} ${rosterContextNote.id}`);
  let rosterSort = { key: 'player', direction: 'ascending' };
  const rosterSortHeaders = new Map();
  const rosterSortLabels = {
    player: 'Player', season: 'Season', games: 'GP', minutes: 'MPG', points: 'PPG',
    assists: 'APG', rebounds: 'RPG', trueShooting: 'TS%',
  };
  const rosterNumericSortKeys = new Set(['games', 'minutes', 'points', 'assists', 'rebounds', 'trueShooting']);
  const defaultRosterSortDirection = key => rosterNumericSortKeys.has(key) ? 'descending' : 'ascending';
  const bindRosterSortKeyboard = button => {
    let spaceKeyDown = false;
    const isEnter = event => event?.key === 'Enter' || event?.code === 'Enter';
    const isSpace = event => event?.key === ' ' || event?.key === 'Spacebar'
      || event?.key === 'Space' || event?.code === 'Space';
    button.addEventListener('keydown', event => {
      if (isEnter(event)) {
        event.preventDefault?.();
        button.click();
        return;
      }
      if (isSpace(event)) {
        event.preventDefault?.();
        spaceKeyDown = true;
      }
    });
    button.addEventListener('keyup', event => {
      if (!isSpace(event)) return;
      event.preventDefault?.();
      if (spaceKeyDown) button.click();
      spaceKeyDown = false;
    });
    button.addEventListener('blur', () => { spaceKeyDown = false; });
    return button;
  };
  const updateRosterSortHeaders = () => {
    rosterSortHeaders.forEach(({ header, button, label }, key) => {
      const active = rosterSort.key === key;
      if (active) header.setAttribute('aria-sort', rosterSort.direction);
      else header.removeAttribute('aria-sort');
      button.textContent = active
        ? `${label} ${rosterSort.direction === 'ascending' ? '↑' : '↓'}`
        : label;
      const nextDirection = active
        ? rosterSort.direction === 'ascending' ? 'descending' : 'ascending'
        : defaultRosterSortDirection(key);
      button.setAttribute('aria-label', active
        ? `Sort by ${label}; currently ${rosterSort.direction}. Activate to sort ${nextDirection}.`
        : `Sort by ${label} ${nextDirection}.`);
    });
  };
  const rosterHead = el(documentRef, 'thead');
  const rosterHeadRow = el(documentRef, 'tr');
  let rosterAssignHeader = null;
  [
    { label: 'Player', key: 'player' },
    { label: 'Season', key: 'season' },
    { label: 'Pos' },
    { label: 'GP', key: 'games' },
    { label: 'MPG', key: 'minutes' },
    { label: 'PPG', key: 'points' },
    { label: 'APG', key: 'assists' },
    { label: 'RPG', key: 'rebounds' },
    { label: 'TS%', key: 'trueShooting' },
    { label: 'Assign' },
  ].forEach(({ label, key }) => {
    const cell = el(documentRef, 'th');
    cell.setAttribute('scope', 'col');
    if (key) {
      const button = el(documentRef, 'button', label, 'swishiq-table-sort swishiq-composite-roster__sort');
      button.type = 'button';
      button.dataset.rosterSort = key;
      bindRosterSortKeyboard(button);
      button.addEventListener('click', () => {
        const horizontalScroll = rosterTableWrap.scrollLeft;
        const direction = rosterSort.key === key
          ? rosterSort.direction === 'ascending' ? 'descending' : 'ascending'
          : defaultRosterSortDirection(key);
        rosterSort = { key, direction };
        updateRosterSortHeaders();
        renderRosterTable(matchingSearchRefs(), true);
        rosterTableWrap.scrollLeft = horizontalScroll;
      });
      cell.append(button);
      rosterSortHeaders.set(key, { header: cell, button, label });
    } else {
      cell.textContent = label;
      if (label === 'Assign') rosterAssignHeader = cell;
    }
    rosterHeadRow.append(cell);
  });
  updateRosterSortHeaders();
  rosterHead.append(rosterHeadRow);
  const rosterBody = el(documentRef, 'tbody');
  rosterTable.append(rosterCaption, rosterHead, rosterBody);
  rosterTableWrap.append(rosterTable);
  roster.append(rosterStatus, rosterContextNote, rosterTableWrap);
  pickerScope.append(roster);
  const archetypeMetric = (archetypeKey, spec) => {
    const archetypeSpec = Object.values(COMPOSITE_ARCHETYPES).find(item => item.key === archetypeKey);
    const requirement = archetypeSpec?.requirements?.find(item => item.key === spec.key && item.metric);
    return requirement?.metric || spec.defaultMetric;
  };
  const traitBoard = el(documentRef, 'div', undefined, 'swishiq-composite-trait-board');
  traitBoard.setAttribute('role', 'group');
  traitBoard.setAttribute('aria-label', 'Player traits');
  COMPOSITE_FORGE_COMPONENTS.forEach((spec, index) => {
    const target = el(documentRef, 'button', undefined, 'swishiq-composite-trait-target');
    target.type = 'button';
    target.dataset.componentKey = spec.key;
    markChoiceControl(target);
    target.setAttribute('aria-label', `${compositeUiLabel(spec)} skill slot`);
    const label = el(documentRef, 'strong', compositeUiLabel(spec));
    const donor = el(documentRef, 'span', 'Choose a player from the roster', 'swishiq-composite-trait-target__donor');
    const value = el(documentRef, 'small', 'No player selected', 'swishiq-composite-trait-target__value');
    target.append(label, donor, value);
    target.addEventListener('click', () => {
      showComponentStep(index);
      updateSelectionSummary();
      status.textContent = `${compositeUiLabel(spec)} selected. Use Assign in a player row to fill this skill.`;
    });
    target.addEventListener('dragover', event => {
      event.preventDefault();
      target.classList.add('is-drop-target');
    });
    target.addEventListener('dragleave', event => {
      if (!event.relatedTarget || !target.contains(event.relatedTarget)) target.classList.remove('is-drop-target');
    });
    target.addEventListener('drop', event => {
      event.preventDefault();
      target.classList.remove('is-drop-target');
      const profileKey = event.dataTransfer?.getData('text/plain') || '';
      assignProfileToComponent(spec, profileKey);
    });
    traitBoard.append(target);
    traitTargets.set(spec.key, { target, donor, value });
  });
  const renderRosterTable = (searchRefs, announceSort = false) => {
    const displayStatsByProfile = new Map();
    const displayStatsFor = profile => {
      if (!displayStatsByProfile.has(profile.key)) {
        displayStatsByProfile.set(profile.key, publicSeasonStatsForCompositeProfile(profile, fetchImpl));
      }
      return displayStatsByProfile.get(profile.key);
    };
    const season = Number(donorSeason.value);
    const team = donorTeam.value;
    const rows = team ? dataset.cohort.profiles.filter(profile => profile.seasonStartYear === season
      && profile.team === team
      && (!searchRefs || searchRefs.has(profile.key))) : [];
    const publicMetricValue = (profile, key) => {
      const value = displayStatsFor(profile)?.metrics?.[key]?.value;
      return finite(value) ? value : null;
    };
    const valueForProfile = profile => {
      if (rosterSort.key === 'season') return Number.isInteger(profile.seasonStartYear) ? profile.seasonStartYear : null;
      if (rosterSort.key === 'games') {
        const games = displayStatsFor(profile)?.totals?.gamesPlayed;
        return finite(games) ? games : null;
      }
      if (rosterSort.key === 'minutes') return publicMetricValue(profile, 'minutesPerGame');
      if (rosterSort.key === 'points') return publicMetricValue(profile, 'pointsPerGame');
      if (rosterSort.key === 'assists') return publicMetricValue(profile, 'assistsPerGame');
      if (rosterSort.key === 'rebounds') return publicMetricValue(profile, 'reboundsPerGame');
      if (rosterSort.key === 'trueShooting') return publicMetricValue(profile, 'trueShootingPercentage');
      return String(profile.player || '');
    };
    const tieBreak = (left, right) => left.player.localeCompare(right.player, undefined, { sensitivity: 'base' })
      || left.key.localeCompare(right.key);
    const direction = rosterSort.direction === 'ascending' ? 1 : -1;
    rows.sort((left, right) => {
      const leftValue = valueForProfile(left);
      const rightValue = valueForProfile(right);
      const leftUnavailable = leftValue === null;
      const rightUnavailable = rightValue === null;
      // Missing numeric values stay at the end in both directions. This
      // keeps an unavailable metric from appearing as a false zero when the
      // user toggles between high-to-low and low-to-high order.
      if (leftUnavailable || rightUnavailable) {
        if (leftUnavailable !== rightUnavailable) return leftUnavailable ? 1 : -1;
        return tieBreak(left, right);
      }
      const compare = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: 'base' });
      return compare === 0 ? tieBreak(left, right) : compare * direction;
    });
    rosterBody.replaceChildren();
    rows.forEach(profile => {
      const row = el(documentRef, 'tr');
      row.draggable = true;
      row.dataset.playerProfile = profile.key;
      row.addEventListener('dragstart', event => {
        event.dataTransfer?.setData('text/plain', profile.key);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      });
      const displayStats = displayStatsFor(profile);
      const displayMetric = key => {
        const value = displayStats?.metrics?.[key]?.value;
        return finite(value) ? value : null;
      };
      const games = displayStats?.totals?.gamesPlayed;
      const minutes = displayMetric('minutesPerGame');
      const points = displayMetric('pointsPerGame');
      const assists = displayMetric('assistsPerGame');
      const rebounds = displayMetric('reboundsPerGame');
      const efficiency = displayMetric('trueShootingPercentage');
      const cells = [
        profile.player,
        labelSeason(profile.seasonStartYear),
        Array.isArray(profile.positions) && profile.positions.length ? profile.positions.join('/') : '—',
        finite(games) ? Math.round(games).toLocaleString() : '—',
        minutes === null ? '—' : formatValue(minutes),
        points === null ? '—' : formatValue(points),
        assists === null ? '—' : formatValue(assists),
        rebounds === null ? '—' : formatValue(rebounds),
        efficiency === null ? '—' : `${(Number(efficiency) * 100).toFixed(1)}%`,
      ];
      cells.forEach((text, index) => {
        const cell = el(documentRef, index === 0 ? 'th' : 'td', text);
        if (index === 0) cell.setAttribute('scope', 'row');
        if (index >= 3 && index <= 8) cell.classList.add('swishiq-table-numeric');
        row.append(cell);
      });
      const actionCell = el(documentRef, 'td');
      const useButton = markChoiceControl(el(documentRef, 'button', 'Assign', 'swishiq-composite-roster__assign'), { requiresRoster: true });
      useButton.type = 'button';
      useButton.dataset.assignProfile = profile.key;
      useButton.setAttribute('aria-label', `Assign ${profile.player} to ${compositeUiLabel(COMPOSITE_FORGE_COMPONENTS[activeComponentIndex])} skill`);
      useButton.addEventListener('click', () => assignProfileToComponent(COMPOSITE_FORGE_COMPONENTS[activeComponentIndex], profile.key));
      actionCell.append(useButton);
      row.append(actionCell);
      rosterBody.append(row);
    });
    const seasonLabel = donorSeason.value ? labelSeason(season) : '';
    const statsUnavailable = compositePublicStatsCacheFor(fetchImpl).failures.has(season);
    rosterStatus.textContent = !team
      ? seasonLabel ? `Choose a team · ${seasonLabel}.` : 'Choose a season and team.'
      : rows.length
        ? `${rows.length} ${rows.length === 1 ? 'player' : 'players'} · ${team} · ${seasonLabel}.${statsUnavailable ? ' Some stats are unavailable; select this season again to retry.' : ''}${announceSort ? ` Sorted by ${rosterSortLabels[rosterSort.key]} ${rosterSort.direction}.` : ''}`
        : `No matches · ${team}${seasonLabel ? ` · ${seasonLabel}` : ''}.`;
  };
  const matchingSearchRefs = () => {
    const query = donorSearch.value.trim();
    if (!query) return null;
    const records = dataset.cohort.profiles.filter(profile => profile.seasonStartYear === Number(donorSeason.value)
      && profile.team === donorTeam.value).map(profile => ({
      playerRef: profile.key,
      displayName: profile.player,
      teamCode: profile.team,
      positions: profile.positions,
      seasonStartYear: profile.seasonStartYear,
      coverage: profile.games ?? profile.coverage ?? profile.sampleSize,
    }));
    return new Set(filterSelectorRecords(records, {
      query,
      team: donorTeam.value,
      minCoverage: 10,
    }).map(row => row.playerRef));
  };
  const updateRosterContextNote = year => {
    const cache = compositePublicStatsCacheFor(fetchImpl);
    const season = labelSeason(year);
    const assignHelp = 'Select a skill slot above, then use Assign in a player row.';
    rosterContextNote.textContent = cache.failures.has(year)
      ? `${assignHelp} ${season} · Some regular-season stats are unavailable; missing values are shown as —.`
      : cache.records.has(year)
        ? `${assignHelp} ${season} · Regular-season player and team stats · Missing values are shown as —.`
        : `${assignHelp} ${season} · Regular-season stats are loading.`;
  };
  const requestPublicRosterStats = year => {
    if (!Number.isInteger(year)) return;
    const cache = compositePublicStatsCacheFor(fetchImpl);
    if (!cache.records.has(year)) {
      updateRosterContextNote(year);
      rosterStatus.textContent = `${rosterStatus.textContent.replace(/ · Loading additional stats…$/, '')} · Loading additional stats…`;
    }
    void loadCompositePublicStatsForYear(year, fetchImpl).then(() => {
      if (Number(donorSeason.value) !== year) return;
      updateRosterContextNote(year);
      renderRosterTable(matchingSearchRefs());
    });
  };
  const candidatesFor = (spec, searchRefs) => {
    return dataset.cohort.profiles.filter(profile => {
      if (!donorTeam.value || profile.team !== donorTeam.value
        || profile.seasonStartYear !== Number(donorSeason.value)) return false;
      if (searchRefs && !searchRefs.has(profile.key)) return false;
      // Keep every roster player selectable. If a requested source metric is
      // absent, the model reports that evidence gap in the build receipt.
      return true;
    });
  };
  const renderCandidatePage = (spec, candidates, preferredKey = null, { preserveSelection = true, forcePage = false } = {}) => {
    const select = selects.get(spec.key);
    if (!select) return;
    const prior = preserveSelection ? (preferredKey || select.value || null) : null;
    const priorIndex = prior ? candidates.findIndex(profile => profile.key === prior) : -1;
    const pinned = priorIndex < 0 && prior ? dataset.cohort.profiles.find(profile => profile.key === prior) : null;
    const requestedPage = forcePage
      ? (candidatePages.get(spec.key) || 1)
      : priorIndex >= 0
      ? Math.floor(priorIndex / PLAYER_BUILDER_DONOR_PAGE_SIZE) + 1
      : candidatePages.get(spec.key) || 1;
    const page = paginateCompositeDonors(candidates, requestedPage);
    candidatePages.set(spec.key, page.page);
    select.replaceChildren();
    addOption(documentRef, select, '', 'Choose a player example…');
    select.options[0].disabled = true;
    const visibleRows = priorIndex >= 0 && !page.rows.some(profile => profile.key === prior)
      ? [candidates[priorIndex], ...page.rows]
      : pinned ? [pinned, ...page.rows] : page.rows;
    visibleRows.forEach(profile => addOption(documentRef, select, profile.key, `${profile.player} · ${labelSeason(profile.seasonStartYear)} · ${profile.team}`));
    if (visibleRows.some(profile => profile.key === prior)) select.value = prior;
    else select.value = '';

    const pager = pageControls.get(spec.key);
    if (!pager) return;
    pager.replaceChildren();
    const previous = el(documentRef, 'button', 'Previous', 'button');
    previous.type = 'button';
    markChoiceControl(previous, { pager: true });
    previous.dataset.builderPageDisabled = String(page.page <= 1);
    previous.disabled = page.page <= 1;
    previous.setAttribute('aria-label', `${compositeUiLabel(spec)} comparison player page ${Math.max(1, page.page - 1)}`);
    previous.addEventListener('click', () => {
      candidatePages.set(spec.key, Math.max(1, page.page - 1));
      renderCandidatePage(spec, candidates, null, { forcePage: true });
      updateSelectionSummary();
    });
    const pageLabel = el(documentRef, 'span', `${page.total.toLocaleString()} candidates · page ${page.page} of ${page.totalPages}`);
    pageLabel.setAttribute('aria-live', 'polite');
    const next = el(documentRef, 'button', 'Next', 'button');
    next.type = 'button';
    markChoiceControl(next, { pager: true });
    next.dataset.builderPageDisabled = String(page.page >= page.totalPages);
    next.disabled = page.page >= page.totalPages;
    next.setAttribute('aria-label', `${compositeUiLabel(spec)} comparison player page ${Math.min(page.totalPages, page.page + 1)}`);
    next.addEventListener('click', () => {
      candidatePages.set(spec.key, Math.min(page.totalPages, page.page + 1));
      renderCandidatePage(spec, candidates, null, { forcePage: true });
      updateSelectionSummary();
    });
    pager.append(previous, pageLabel, next);
  };
  const refreshDonorOptions = () => {
    donorSearch.disabled = !donorTeam.value;
    // Search matching is shared across all eight component lists. Build the
    // profile search index once per refresh instead of remapping the cohort
    // and repeating the same selector search for every skill.
    const searchRefs = matchingSearchRefs();
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const select = selects.get(spec.key);
      if (!select) return;
      const prior = select.value;
      const candidates = candidatesFor(spec, searchRefs);
      byComponent.set(spec.key, candidates);
      renderCandidatePage(spec, candidates, prior);
    });
    renderRosterTable(searchRefs);
    updateSelectionSummary();
  };
  const syncChoiceControls = state => {
    root.dataset.builderStage = state.stage;
    root.dataset.builderLocked = String(state.locked);
    const roleSpec = Object.values(COMPOSITE_ARCHETYPES).find(spec => spec.key === archetype.value);
    const roleLabel = roleSpec ? `Role: ${roleSpec.label}` : 'Role: unconstrained';
    selectionSummary.textContent = `${state.selected} of ${state.total} skill slots filled · ${countUniqueCompositePlayers(selectedProfilesForLoop())} distinct player${countUniqueCompositePlayers(selectedProfilesForLoop()) === 1 ? '' : 's'} · ${roleLabel}.`;
    visualKicker.textContent = state.locked ? 'Locked · choices are ready to build' : state.previewed ? 'Preview · review values and coverage before locking' : 'Live preview · updates as you choose';
    visualTitle.textContent = state.locked ? 'Locked component profile' : 'Component values';
    if (lockButton) {
      lockButton.disabled = !state.previewed || state.locked;
      lockButton.textContent = state.locked ? 'Profile locked' : state.previewed ? 'Lock this preview' : 'Preview before locking';
      lockButton.setAttribute('aria-pressed', String(state.locked));
    }
    if (previewButton) previewButton.disabled = !state.complete;
    if (runButton) {
      runButton.disabled = !state.locked;
      runButton.textContent = state.locked ? 'Build Composite Forge profile' : 'Lock preview to build';
    }
    root.querySelectorAll('[data-builder-choice-control]').forEach(control => {
      const rosterRequired = control.dataset.builderRosterRequired === 'true';
      const pageBoundary = control.dataset.builderPageControl === 'true'
        && control.dataset.builderPageDisabled === 'true';
      control.disabled = state.locked || (rosterRequired && !donorTeam.value) || pageBoundary;
    });
    if (revisingBuild) {
      archetype.disabled = true;
      placementTeam.disabled = true;
    }
  };
  const updateSelectionSummary = () => {
    const selectedProfiles = selectedProfilesForLoop();
    syncChoiceControls(playerBuilderLoopState({
      selectedCount: selectedProfiles.length,
      totalCount: COMPOSITE_FORGE_COMPONENTS.length,
      previewed: builderPreviewed,
      locked: builderLocked,
      roleSelected: Boolean(archetype.value),
      rosterSelected: Boolean(donorSeason.value && donorTeam.value),
    }));
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const target = traitTargets.get(spec.key);
      const profile = dataset.cohort.profiles.find(item => item.key === selects.get(spec.key)?.value);
      if (!target) return;
      const metricKey = archetypeMetric(archetype?.value || '', spec);
      const actualMetric = metricKey === 'auto'
        ? spec.metrics.find(key => readCompositeMetric(profile, key).status !== 'unavailable')
        : metricKey;
      const metric = profile && actualMetric ? readCompositeMetric(profile, actualMetric) : { status: 'unavailable' };
      target.target.classList.toggle('is-active', spec.key === COMPOSITE_FORGE_COMPONENTS[activeComponentIndex]?.key);
      target.target.setAttribute('aria-pressed', String(spec.key === COMPOSITE_FORGE_COMPONENTS[activeComponentIndex]?.key));
      target.target.classList.toggle('has-player', Boolean(profile));
      target.donor.textContent = profile
        ? `${profile.player} · ${labelSeason(profile.seasonStartYear)} · ${profile.team || 'Team unavailable'}`
        : 'Choose a player from the roster';
      const coverageValue = Number(profile?.games ?? profile?.coverage ?? profile?.sampleSize);
      const coverage = Number.isFinite(coverageValue) ? `${formatValue(coverageValue, 0)} GP coverage` : 'coverage unavailable';
      target.value.title = profile ? `${actualMetric || 'Trait metric'} · ${coverage}` : 'No player-season donor selected';
      target.value.textContent = profile
        ? `${metric.status === 'unavailable' ? 'Value unavailable' : formatValue(metric.value)} · ${coverage}`
        : 'No player selected';
      target.target.setAttribute('aria-label', profile
        ? `${compositeUiLabel(spec)} skill slot, ${profile.player}, ${labelSeason(profile.seasonStartYear)}, ${profile.team}. Select to change this donor.`
        : `${compositeUiLabel(spec)} skill slot. Select this slot, then use Assign in a roster row.`);
    });
    Array.from(rosterBody.children).forEach(row => {
      const action = row.children[row.children.length - 1]?.children?.[0];
      const profile = dataset.cohort.profiles.find(item => item.key === row.dataset.playerProfile);
      if (action && profile) action.setAttribute('aria-label', `Assign ${profile.player} to ${compositeUiLabel(COMPOSITE_FORGE_COMPONENTS[activeComponentIndex])} skill`);
    });
    visualGrid.replaceChildren();
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const select = selects.get(spec.key);
      const profile = dataset.cohort.profiles.find(item => item.key === select?.value);
      const requestedMetric = archetypeMetric(archetype?.value || '', spec);
      const metricKey = requestedMetric === 'auto'
        ? spec.metrics.find(key => readCompositeMetric(profile, key).status !== 'unavailable')
        : requestedMetric;
      const metric = metricKey ? readCompositeMetric(profile, metricKey) : { status: 'unavailable' };
      const card = el(documentRef, 'article', undefined, 'swishiq-builder-visual__card');
      const label = el(documentRef, 'span', compositeUiLabel(spec), 'swishiq-builder-visual__label');
      label.title = compositeUiHint(spec);
      const value = el(documentRef, 'strong', metric.status === 'unavailable' ? 'Unavailable' : formatValue(metric.value), 'swishiq-builder-visual__value');
      const unit = el(documentRef, 'small', metric.status === 'unavailable' ? 'No value' : formatCompositeUnit(metric.unit, compositeUiHint(spec)), 'swishiq-builder-visual__unit');
      const donor = el(documentRef, 'small', profile
        ? `${profile.player} · ${labelSeason(profile.seasonStartYear)} · ${profile.team || 'Team unavailable'}`
        : 'No player example selected');
      const coverageValue = Number(profile?.games ?? profile?.coverage ?? profile?.sampleSize);
      const coverage = el(documentRef, 'small', profile && Number.isFinite(coverageValue)
        ? `Coverage · ${formatValue(coverageValue, 0)} GP`
        : 'Coverage unavailable');
      const track = el(documentRef, 'span', undefined, 'swishiq-builder-visual__track');
      const fill = el(documentRef, 'span', undefined, 'swishiq-builder-visual__fill');
      const numeric = Number(metric.value);
      fill.style.setProperty('--builder-value', Number.isFinite(numeric) ? `${Math.max(8, Math.min(100, numeric))}%` : '0%');
      const clearButton = el(documentRef, 'button', 'Clear donor', 'swishiq-composite-clear-donor');
      clearButton.type = 'button';
      clearButton.hidden = !profile;
      clearButton.disabled = !profile || builderLocked;
      clearButton.setAttribute('aria-label', `Clear ${compositeUiLabel(spec)} donor`);
      clearButton.addEventListener('click', () => {
        if (!select || builderLocked || !select.value) return;
        select.value = '';
        invalidateBuilderPreview(`${compositeUiLabel(spec)} donor cleared. Choose a player example before previewing again.`);
        showComponentStep(COMPOSITE_FORGE_COMPONENTS.findIndex(item => item.key === spec.key));
        updateSelectionSummary();
        select.focus();
        status.textContent = `${compositeUiLabel(spec)} donor cleared. Other trait picks remain selected.`;
      });
      track.append(fill);
      card.append(label, value, unit, donor, coverage, track, clearButton);
      visualGrid.append(card);
    });
    if (typeof onDonorsChange === 'function') {
      onDonorsChange(Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, selects.get(spec.key)?.value || ''])));
    }
  };
  const showComponentStep = (index, { focus = false } = {}) => {
    activeComponentIndex = Math.max(0, Math.min(COMPOSITE_FORGE_COMPONENTS.length - 1, index));
    const spec = COMPOSITE_FORGE_COMPONENTS[activeComponentIndex];
    componentFields.forEach(field => { field.hidden = true; });
    traitTargets.forEach((target, key) => {
      const active = key === spec.key;
      target.target.classList.toggle('is-active', active);
      target.target.setAttribute('aria-pressed', String(active));
    });
    componentStepLabel.textContent = `Skill ${activeComponentIndex + 1} of ${COMPOSITE_FORGE_COMPONENTS.length} · ${compositeUiLabel(spec)}`;
    if (rosterAssignHeader) rosterAssignHeader.textContent = `Assign to ${compositeUiLabel(spec)}`;
    rosterCaption.textContent = `Player roster · assign to ${compositeUiLabel(spec)}`;
    previousComponentButton.disabled = activeComponentIndex === 0;
    nextComponentButton.disabled = activeComponentIndex >= COMPOSITE_FORGE_COMPONENTS.length - 1;
    previousComponentButton.setAttribute('aria-label', activeComponentIndex === 0
      ? 'Previous skill (first skill)'
      : `Previous skill: ${compositeUiLabel(COMPOSITE_FORGE_COMPONENTS[activeComponentIndex - 1])}`);
    nextComponentButton.setAttribute('aria-label', activeComponentIndex >= COMPOSITE_FORGE_COMPONENTS.length - 1
      ? 'Next skill (last skill)'
      : `Next skill: ${compositeUiLabel(COMPOSITE_FORGE_COMPONENTS[activeComponentIndex + 1])}`);
    if (focus) traitTargets.get(spec.key)?.target.focus();
  };
  const navigateComponentStep = direction => {
    const nextIndex = Math.max(0, Math.min(COMPOSITE_FORGE_COMPONENTS.length - 1, activeComponentIndex + direction));
    if (nextIndex === activeComponentIndex) return;
    showComponentStep(nextIndex, { focus: true });
    updateSelectionSummary();
    const spec = COMPOSITE_FORGE_COMPONENTS[activeComponentIndex];
    const selected = Boolean(selects.get(spec.key)?.value);
    status.textContent = builderLocked
      ? `Reviewing ${compositeUiLabel(spec)}. The profile remains locked.`
      : `${compositeUiLabel(spec)}${selected ? ' example retained' : ' example ready to choose'}. Other skill choices are retained.`;
  };
  previousComponentButton.addEventListener('click', () => navigateComponentStep(-1));
  nextComponentButton.addEventListener('click', () => navigateComponentStep(1));
  COMPOSITE_FORGE_COMPONENTS.forEach((spec, index) => {
    const field = el(documentRef, 'div', undefined, 'swishiq-composite-donor-field swishiq-composite-stepper__field');
    field.hidden = index !== activeComponentIndex;
    const label = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
    label.dataset.componentKey = spec.key;
    const componentLabel = el(documentRef, 'span', `Choose ${compositeUiLabel(spec).toLowerCase()} example`);
    componentLabel.title = compositeUiHint(spec);
    label.append(componentLabel);
    const select = markChoiceControl(el(documentRef, 'select'), { requiresRoster: true }); select.required = false; select.className = 'swishiq-composite-donor-select';
    const pager = el(documentRef, 'div', undefined, 'swishiq-composite-donor-pager');
    pager.setAttribute('aria-label', `${compositeUiLabel(spec)} comparison player pages`);
    select.disabled = true;
    label.append(select);
    field.append(label, pager);
    slotFields.append(field);
    componentFields.set(spec.key, field);
    selects.set(spec.key, select); pageControls.set(spec.key, pager);
    select.addEventListener('change', () => {
      invalidateBuilderPreview('A skill example changed. Preview the updated profile before locking.');
      updateSelectionSummary();
    });
  });
  componentStepper.hidden = false;
  showComponentStep(activeComponentIndex);
  slotSection.append(slotHeading, traitBoard, componentStepper, slotFields);
  grid.append(slotSection);
  const archetypeLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  markChoiceControl(archetype, { requiresRoster: true });
  archetypeLabel.append(el(documentRef, 'span', 'Role archetype (optional)'), archetype);
  settingsGrid.append(archetypeLabel);
  archetype.addEventListener('change', () => {
    invalidateBuilderPreview('The role changed. Preview the updated profile before locking.');
    refreshDonorOptions();
  });
  donorSeason.addEventListener('change', () => {
    invalidateBuilderPreview('The donor season changed. Preview the updated profile before locking.');
    donorSearch.value = '';
    if (browseExactSeasons && typeof onSelectExactSeason === 'function') {
      const donors = Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => [spec.key, selects.get(spec.key)?.value || '']));
      requestPublicRosterStats(Number(donorSeason.value));
      status.textContent = `Loading player examples for ${labelSeason(Number(donorSeason.value))}. Existing selections stay assigned.`;
      onSelectExactSeason(Number(donorSeason.value), donors);
      return;
    }
    refreshDonorTeams();
    refreshDonorOptions();
    requestPublicRosterStats(Number(donorSeason.value));
  });
  donorTeam.addEventListener('change', () => {
    donorSearch.value = '';
    invalidateBuilderPreview('The roster filter changed. Preview the updated profile before locking.');
    refreshDonorOptions();
  });
  donorSearch.addEventListener('input', () => {
    invalidateBuilderPreview('The roster search changed. Preview the updated profile before locking.');
    refreshDonorOptions();
  });
  const placementTeam = markChoiceControl(el(documentRef, 'select')); addOption(documentRef, placementTeam, '', 'No team placement');
  [...new Set(dataset.cohort.profiles.map(profile => profile.team).filter(teamCode => TEAM_CODE.test(teamCode)))].sort().forEach(teamCode => addOption(documentRef, placementTeam, teamCode, teamCode));
  const placement = el(documentRef, 'label', undefined, 'swishiq-advanced-field'); placement.append(el(documentRef, 'span', 'Choose a placement team'), placementTeam); settingsGrid.append(placement);
  grid.append(settingsGrid);
  const migrateButton = el(documentRef, 'button', 'Migrate saved recipe to current contract', 'button swishiq-builder-action swishiq-builder-action--secondary');
  migrateButton.type = 'button';
  migrateButton.hidden = true;
  migrateButton.disabled = !storage || typeof storage.setItem !== 'function';
  runButton = el(documentRef, 'button', 'Lock choices to build', 'button'); runButton.type = 'submit'; runButton.disabled = true;
  const actionBar = el(documentRef, 'div', undefined, 'swishiq-builder-actions');
  const draftButton = markChoiceControl(el(documentRef, 'button', 'Draft skills from this roster', 'button swishiq-builder-action swishiq-builder-action--secondary'), { requiresRoster: true });
  draftButton.type = 'button';
  pickerScope.insertBefore(draftButton, roster);
  previewButton = el(documentRef, 'button', 'Preview profile', 'button swishiq-builder-action swishiq-builder-action--secondary');
  previewButton.type = 'button'; previewButton.disabled = true;
  lockButton = el(documentRef, 'button', 'Lock choices', 'button swishiq-builder-action swishiq-builder-action--primary');
  lockButton.type = 'button'; lockButton.disabled = true; lockButton.setAttribute('aria-pressed', 'false');
  resetButton = el(documentRef, 'button', 'Reset builder', 'button swishiq-builder-action swishiq-builder-action--quiet');
  resetButton.type = 'button';
  actionBar.append(draftButton, previewButton, lockButton, migrateButton, resetButton);
  status = el(documentRef, 'p', 'Choose player examples, preview the profile, then lock it before building.', 'swishiq-advanced-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  form.append(selectionSummary, grid, visual, actionBar, runButton, status);
  const resultRoot = el(documentRef, 'div', undefined, 'swishiq-advanced-result swishiq-composite-results');
  const roundPanel = el(documentRef, 'section', undefined, 'swishiq-builder-hud swishiq-composite-round');
  roundPanel.setAttribute('aria-label', 'Composite Forge rounds');
  roundPanel.hidden = true;
  const roundGoal = el(documentRef, 'strong', 'Goal · Build a baseline, then improve one assessed skill.');
  const roundProgress = el(documentRef, 'p', 'Round 1 · Build a component profile to reveal a skill to revise.');
  roundProgress.setAttribute('aria-live', 'polite');
  nextRoundButton = el(documentRef, 'button', 'Revise one skill for round 2', 'button swishiq-builder-action swishiq-builder-action--secondary');
  nextRoundButton.type = 'button';
  nextRoundButton.hidden = true;
  roundPanel.append(roundGoal, roundProgress, nextRoundButton);
  root.append(form, resultRoot, roundPanel);
  let previewKey = null;
  const currentBuilderChoiceKey = () => JSON.stringify({
    archetype: archetype.value || null,
    placement: placementTeam.value || null,
    components: COMPOSITE_FORGE_COMPONENTS.map(spec => selects.get(spec.key)?.value || null),
  });
  const invalidateBuilderPreview = message => {
    if (builderLocked) return;
    const wasPreviewed = builderPreviewed || previewKey !== null;
    builderPreviewed = false;
    previewKey = null;
    visual.removeAttribute('data-previewed');
    resultRoot.replaceChildren();
    if (wasPreviewed && message) status.textContent = message;
  };
  const assignProfileToComponent = (component, profileKey) => {
    const profile = dataset.cohort.profiles.find(item => item.key === profileKey);
    const select = selects.get(component?.key);
    if (!profile || !select || builderLocked) return;
    if (![...select.options].some(option => option.value === profile.key)) {
      addOption(documentRef, select, profile.key, `${profile.player} · ${labelSeason(profile.seasonStartYear)} · ${profile.team}`);
    }
    select.value = profile.key;
    invalidateBuilderPreview(`${compositeUiLabel(component)} donor changed. Preview the updated profile before locking.`);
    updateSelectionSummary();
    status.textContent = `${profile.player} assigned to ${compositeUiLabel(component)} · ${profile.team}, ${labelSeason(profile.seasonStartYear)}. Other trait picks remain selected.`;
  };
  placementTeam.addEventListener('change', () => {
    invalidateBuilderPreview('The placement changed. Preview the updated profile before locking.');
    updateSelectionSummary();
  });
  draftButton.addEventListener('click', () => {
    if (builderLocked) {
      status.textContent = 'Reset the builder before drafting new skill examples.';
      return;
    }
    if (!donorTeam.value) {
      status.textContent = 'Choose a donor team before drafting skill examples.';
      return;
    }
    invalidateBuilderPreview('The roster draft changed. Review the player examples before locking.');
    const used = new Set();
    let filled = 0;
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const candidates = byComponent.get(spec.key) || [];
      const metricKey = archetypeMetric(archetype.value || 'balanced', spec);
      const scored = candidates.map(profile => {
        const key = metricKey === 'auto'
          ? spec.metrics.find(item => readCompositeMetric(profile, item).status !== 'unavailable') : metricKey;
        const value = key ? readCompositeMetric(profile, key) : null;
        return { profile, merit: value?.value == null ? -Infinity : value.value * (value.direction || 1) };
      }).filter(item => Number.isFinite(item.merit)).sort((left, right) => right.merit - left.merit);
      const pick = scored.find(item => !used.has(item.profile.playerId || item.profile.key)) || scored[0];
      if (!pick) return;
      used.add(pick.profile.playerId || pick.profile.key);
      const index = candidates.findIndex(profile => profile.key === pick.profile.key);
      candidatePages.set(spec.key, Math.floor(index / PLAYER_BUILDER_DONOR_PAGE_SIZE) + 1);
      renderCandidatePage(spec, candidates, pick.profile.key);
      filled += 1;
    });
    updateSelectionSummary();
    status.textContent = `${filled} player example${filled === 1 ? '' : 's'} drafted from the current roster. Review each selected value and its sample coverage before locking.`;
  });

  previewButton.addEventListener('click', () => {
    const state = playerBuilderLoopState({ selectedCount: selectedProfilesForLoop().length, totalCount: COMPOSITE_FORGE_COMPONENTS.length, previewed: builderPreviewed, locked: builderLocked, roleSelected: Boolean(archetype.value), rosterSelected: Boolean(donorSeason.value && donorTeam.value) });
    if (!state.complete) {
      status.textContent = state.prompt;
      return;
    }
    if (revisingBuild && currentBuilderChoiceKey() === lastBuiltChoiceKey) {
      status.textContent = 'Change at least one skill example before previewing the next round.';
      return;
    }
    builderPreviewed = true;
    previewKey = currentBuilderChoiceKey();
    updateSelectionSummary();
    visual.dataset.previewed = 'true';
    visual.focus({ preventScroll: true });
    status.textContent = 'Preview updated. Check the selected values and sample coverage, then lock your choices.';
  });
  lockButton.addEventListener('click', () => {
    const state = playerBuilderLoopState({ selectedCount: selectedProfilesForLoop().length, totalCount: COMPOSITE_FORGE_COMPONENTS.length, previewed: builderPreviewed && previewKey === currentBuilderChoiceKey(), locked: builderLocked, roleSelected: Boolean(archetype.value), rosterSelected: Boolean(donorSeason.value && donorTeam.value) });
    if (!state.complete) {
      status.textContent = state.prompt;
      return;
    }
    if (!state.previewed) {
      status.textContent = 'Preview the current profile before locking these choices.';
      return;
    }
    builderLocked = true;
    updateSelectionSummary();
    status.textContent = 'Choices locked. Build the recipe when you are ready to replay this profile.';
  });
  resetButton.addEventListener('click', () => {
    builderLocked = false;
    builderPreviewed = false;
    visual.removeAttribute('data-previewed');
    archetype.value = '';
    donorTeam.value = '';
    donorSearch.value = '';
    placementTeam.value = '';
    showComponentStep(0);
    candidatePages.clear();
    selects.forEach(select => { select.value = ''; });
    resultRoot.replaceChildren();
    roundPanel.hidden = true;
    revisingBuild = false;
    lastBuiltChoiceKey = null;
    if (storage && typeof storage.removeItem === 'function') {
      try { storage.removeItem(COMPOSITE_STORAGE_KEY); } catch { /* storage may be read-only */ }
    }
    previewKey = null;
    previousBuild = null;
    completedBuilds = 0;
    roundGoalSkill = null;
    roundGoalMet = false;
    bestComponentAids.clear();
    roundGoal.textContent = 'Goal · Build a baseline, then improve one assessed skill.';
    nextRoundButton.hidden = true;
    roundProgress.textContent = 'Round 1 · Build a component profile to reveal a skill to revise.';
    refreshDonorTeams();
    refreshDonorOptions();
    status.textContent = 'Builder reset. Choose a season and team, then assign any player examples.';
  });
  nextRoundButton.addEventListener('click', () => {
    if (!previousBuild) return;
    const skill = roundGoalSkill && !roundGoalMet ? roundGoalSkill : nextCompositeSkill(previousBuild);
    roundGoalSkill = skill;
    roundGoalMet = false;
    const index = COMPOSITE_FORGE_COMPONENTS.findIndex(spec => spec.key === skill);
    builderLocked = false;
    builderPreviewed = false;
    previewKey = null;
    revisingBuild = true;
    visual.removeAttribute('data-previewed');
    resultRoot.replaceChildren();
    updateSelectionSummary();
    showComponentStep(Math.max(0, index), { focus: true });
    nextRoundButton.hidden = true;
    roundGoal.textContent = `Goal · Improve ${compositeUiLabel(skill)} using another player example.`;
    roundProgress.textContent = `Round ${completedBuilds + 1} · Revise ${compositeUiLabel(skill)}. Role and placement stay fixed for comparison.`;
    status.textContent = `Choose a different ${compositeUiLabel(skill).toLowerCase()} example, preview the profile, then build the next round.`;
  });

  // Populate the first page only after every component and action is mounted.
  // Searches and archetype/team changes reuse the complete package-bound
  // candidate arrays and only replace the visible page.
  refreshDonorOptions();
  if (initialDonors && typeof initialDonors === 'object') {
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const profile = dataset.cohort.profiles.find(item => item.key === initialDonors[spec.key]);
      const select = selects.get(spec.key);
      if (!profile || !select) return;
      if (![...select.options].some(option => option.value === profile.key)) {
        addOption(documentRef, select, profile.key, `${profile.player} · ${labelSeason(profile.seasonStartYear)} · ${profile.team}`);
      }
      select.value = profile.key;
    });
    updateSelectionSummary();
  }
  const compositePackageRef = dataset.compositePackageRef || v3CompositePackageRef(dataset.proof, dataset.acceptedPooledPackage === true);
  const previous = loadCompositeForgeRecipe(storage, COMPOSITE_STORAGE_KEY, { packageRef: compositePackageRef, cohort: dataset.cohort });
  if (previous.status === 'loaded') {
    const saved = previous.recipe;
    // Hydrate every user choice, including the replay key. This makes a saved
    // recipe a real replay rather than a status-only reminder after reload.
    const savedArchetype = typeof saved.archetype === 'string' ? saved.archetype : saved.archetype?.key;
    if (savedArchetype && [...archetype.options].some(option => option.value === savedArchetype)) archetype.value = savedArchetype;
    const firstSavedDonorKey = COMPOSITE_FORGE_COMPONENTS.map(spec => saved.components?.[spec.key]?.donors?.[0]?.profileKey).find(Boolean);
    const firstSavedDonor = dataset.cohort.profiles.find(profile => profile.key === firstSavedDonorKey);
    if (firstSavedDonor && [...donorSeason.options].some(option => Number(option.value) === firstSavedDonor.seasonStartYear)) {
      donorSeason.value = String(firstSavedDonor.seasonStartYear);
      refreshDonorTeams();
      donorTeam.value = firstSavedDonor.team;
    }
    placementTeam.value = saved.placement?.team || '';
    refreshDonorOptions();
    COMPOSITE_FORGE_COMPONENTS.forEach(spec => {
      const donor = saved.components?.[spec.key]?.donors?.[0]?.profileKey;
      const candidates = byComponent.get(spec.key) || [];
      if (!donor) return;
      const donorIndex = candidates.findIndex(profile => profile.key === donor);
      if (donorIndex >= 0) candidatePages.set(spec.key, Math.floor(donorIndex / PLAYER_BUILDER_DONOR_PAGE_SIZE) + 1);
      renderCandidatePage(spec, candidates, donor);
    });
    const savedComplete = Boolean(archetype.value)
      && selectedProfilesForLoop().length === COMPOSITE_FORGE_COMPONENTS.length;
    builderPreviewed = savedComplete;
    builderLocked = savedComplete;
    previewKey = savedComplete ? currentBuilderChoiceKey() : null;
    updateSelectionSummary();
    try {
      if (!savedComplete) throw new Error('Saved recipe choices are incomplete for the current exact-season roster.');
      const replay = { ...buildCompositeForge({ recipe: saved, cohort: dataset.cohort }), sourceNote: dataset.cohort?.source?.note || null };
      renderCompositeResult(documentRef, resultRoot, replay);
      renderCompositeShareAction(documentRef, resultRoot, replay, verifiedCompositeProofForResult(dataset, replay));
      roundPanel.hidden = false;
      previousBuild = replay;
      completedBuilds = 1;
      lastBuiltChoiceKey = currentBuilderChoiceKey();
      (replay.gameRating?.components || []).forEach(part => {
        if (Number.isFinite(part?.rating)) bestComponentAids.set(part.component, part.rating);
      });
      roundGoal.textContent = `Goal · Improve ${compositeUiLabel(nextCompositeSkill(replay))} on the next build.`;
      roundProgress.textContent = `Round 1 restored · ${compositeUiLabel(nextCompositeSkill(replay))} is the lowest available component tuning aid. Revise it to compare builds.`;
      nextRoundButton.hidden = false;
      status.textContent = 'Saved recipe restored. Choices are locked; reset the builder to start a new profile.';
    } catch {
      status.textContent = savedComplete
        ? 'A saved recipe is available but could not be replayed against the current season data.'
        : 'A saved recipe needs review because one or more choices are unavailable in the current exact-season roster.';
    }
  } else if (previous.status === 'unavailable') {
    status.textContent = 'Local save unavailable. The current builder is ready to use.';
  } else if (previous.status === 'migration-required') {
    migrateButton.hidden = false;
    const placementWasSeeded = previous.migration?.preservedPlacementSeed === true;
    status.textContent = previous.migration?.migrationKind === 'prior-model-version-upgrade'
      ? `A saved v3 recipe uses ${previous.migration.sourceModelVersion}. Migrate explicitly to ${COMPOSITE_FORGE_MODEL_VERSION}; ${placementWasSeeded ? 'its placement seed will be preserved' : 'it has no placement seed, and none will be added'}, package and cohort bindings will be checked, and the synthetic profile identity will be reissued under the current fail-closed model. No simulation seed will be assigned.`
      : `A saved v2 recipe uses one shared seed for profile identity and placement. Migrate explicitly to v3 under ${COMPOSITE_FORGE_MODEL_VERSION}; ${placementWasSeeded ? 'the team-placement seed will be preserved' : 'the old seed will be removed because it did not select placement'}, and the stat-profile identity will be reissued. No simulation seed will be assigned.`;
    migrateButton.addEventListener('click', () => {
      try {
        const migrated = migrateLegacyCompositeForgeRecipe(previous.legacyRecipe, { packageRef: compositePackageRef, cohort: dataset.cohort });
        saveCompositeForgeRecipe(storage, COMPOSITE_STORAGE_KEY, migrated.recipe);
        migrateButton.disabled = true;
        status.textContent = `Saved recipe migrated to ${migrated.recipe.modelVersion} / recipe v${migrated.recipe.version}. ${migrated.migration.legacySeedDisposition}. Synthetic profile identity is reissued under the current model. Reload this workbench to restore the migrated choices. Simulation seed remains unavailable.`;
      } catch (error) {
        status.textContent = error?.message || 'The saved recipe could not be migrated against the current package and cohort.';
      }
    });
  } else if (previous.status === 'invalid') {
    const savedModelVersion = readSavedCompositeModelVersion(storage, COMPOSITE_STORAGE_KEY);
    const savedRevision = compositeModelRevision(savedModelVersion);
    const currentRevision = compositeModelRevision(COMPOSITE_FORGE_MODEL_VERSION);
    const savedLabel = savedModelVersion?.replace(/^composite-forge-model-/, '');
    const currentLabel = COMPOSITE_FORGE_MODEL_VERSION.replace(/^composite-forge-model-/, '');
    if (savedRevision !== null && currentRevision !== null && savedRevision < currentRevision) {
      status.textContent = `The saved recipe uses an older model (${savedLabel}). Rebuild and save it to use the current model (${currentLabel}).`;
    } else if (savedModelVersion && savedModelVersion !== COMPOSITE_FORGE_MODEL_VERSION) {
      status.textContent = `The saved recipe uses ${savedModelVersion}. Rebuild and save it to use the current model (${COMPOSITE_FORGE_MODEL_VERSION}).`;
    } else {
      status.textContent = 'A saved recipe could not be loaded. Rebuild and save it with the current model.';
    }
  }
  requestPublicRosterStats(Number(donorSeason.value));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!builderLocked || !builderPreviewed || previewKey !== currentBuilderChoiceKey()) {
      status.textContent = 'Preview the current profile, then lock your choices before building the recipe.';
      return;
    }
    if (revisingBuild && currentBuilderChoiceKey() === lastBuiltChoiceKey) {
      status.textContent = 'Change at least one skill example before building the next round.';
      return;
    }
    try {
      const archetypeKey = archetype.value || 'balanced';
      const components = Object.fromEntries(COMPOSITE_FORGE_COMPONENTS.map(spec => {
        const profileKey = selects.get(spec.key)?.value || '';
        return [spec.key, { metric: archetypeMetric(archetypeKey, spec), donors: profileKey ? [{ profileKey, weight: 1 }] : [] }];
      }));
      const placementValue = placementTeam.value ? { mode: 'chosen', team: placementTeam.value, teamPool: [placementTeam.value] } : { mode: 'unassigned' };
      const archetypeSpec = Object.values(COMPOSITE_ARCHETYPES).find(spec => spec.key === archetypeKey);
      if (!archetypeSpec) fail('Choose a supported role archetype or leave it blank for an unconstrained profile.');
      const buildContext = exactPackageBuildContext(dataset, selectedProfilesForLoop());
      const result = { ...buildCompositeForge({ packageRef: buildContext.packageRef, cohort: buildContext.cohort, components, archetype: archetypeSpec.key, placement: { ...placementValue, positions: archetypeSpec.positions }, phase: PHASE, normalization: { era: 'none', role: 'any', workload: 'none' } }), sourceNote: buildContext.cohort?.source?.note || null };
      const allTraitsSelected = selectedProfilesForLoop().length === COMPOSITE_FORGE_COMPONENTS.length;
      try {
        if (storage && allTraitsSelected) {
          saveCompositeForgeRecipe(storage, COMPOSITE_STORAGE_KEY, result.recipe);
        }
      } catch { /* Keep the computed result available when local storage is full or blocked. */ }
      publishSwishIqLabHandoff('composite', result);
      const roundFeedback = compositeRoundFeedback(previousBuild, result);
      const priorAid = previousBuild?.gameRating?.components?.find(part => part.component === roundGoalSkill)?.rating;
      const currentAid = result.gameRating?.components?.find(part => part.component === roundGoalSkill)?.rating;
      (result.gameRating?.components || []).forEach(part => {
        if (Number.isFinite(part?.rating)) bestComponentAids.set(part.component,
          Math.max(bestComponentAids.get(part.component) ?? -Infinity, part.rating));
      });
      if (!previousBuild || previousBuild.recipeHash !== result.recipeHash) completedBuilds += 1;
      previousBuild = result;
      lastBuiltChoiceKey = currentBuilderChoiceKey();
      const changeText = roundFeedback?.changes.length
        ? `${roundFeedback.improved} component aid${roundFeedback.improved === 1 ? '' : 's'} rose; ${roundFeedback.declined} fell versus the prior build.`
        : 'This build is the comparison baseline.';
      const targetText = roundGoalSkill && Number.isFinite(currentAid) && Number.isFinite(priorAid)
        ? `${compositeUiLabel(roundGoalSkill)} tuning aid: previous ${priorAid}, current ${currentAid}, best ${bestComponentAids.get(roundGoalSkill)}. ${currentAid > priorAid ? 'Goal met for this component.' : 'Try another donor to improve this component.'}`
        : 'Choose a weaker assessed component to improve on the next build.';
      roundGoalMet = Number.isFinite(currentAid) && Number.isFinite(priorAid) && currentAid > priorAid;
      const nextSkill = roundGoalSkill && !roundGoalMet ? roundGoalSkill : nextCompositeSkill(result);
      roundGoal.textContent = `Goal · ${targetText}`;
      roundProgress.textContent = `Round ${completedBuilds} complete · ${changeText} Next focus: ${compositeUiLabel(nextSkill)}.`;
      nextRoundButton.textContent = `Revise one skill for round ${completedBuilds + 1}`;
      nextRoundButton.hidden = false;
      roundPanel.hidden = false;
      status.textContent = `Synthetic profile built · ${result.donorProvenance.length} comparison player${result.donorProvenance.length === 1 ? '' : 's'}.`;
      renderCompositeResult(documentRef, resultRoot, result);
      renderCompositeShareAction(documentRef, resultRoot, result, verifiedCompositeProofForResult(dataset, result));
    } catch (error) {
      status.textContent = compositeUserFacingCopy(error?.message, 'The profile could not be built from these player selections. Review the available values and try again.');
      resultRoot.replaceChildren();
    }
  });
}

function renderCompositeResult(documentRef, root, result) {
  root.replaceChildren();
  const resultHeading = el(documentRef, 'h3', 'Composite profile built');
  const resultNote = el(documentRef, 'p', `${result.sourceNote || 'Synthetic traits use the selected player-season values.'} Slot percentiles are coverage-adjusted comparison aids, not an overall grade or forecast.`, 'swishiq-advanced-muted');
  const coherence = result.validation.coherence;
  const coherenceCopy = compositeUserFacingCopy(coherence?.note, 'Role coherence unavailable.');
  const coherenceNote = el(documentRef, 'p', `${coherence?.archetypeLabel || 'Selected role'} · ${coherence?.status || 'unavailable'} · ${coherenceCopy}`, coherence?.status === 'incoherent' ? 'swishiq-advanced-notice swishiq-advanced-notice--error' : 'swishiq-advanced-muted');
  root.append(resultHeading, resultNote, coherenceNote);
  const summary = el(documentRef, 'div', undefined, 'swishiq-composite-result-summary');
  const ratingParts = (result.gameRating?.components || []).filter(part => Number.isFinite(part?.rating));
  summary.append(
    el(documentRef, 'strong', 'Synthetic player profile'),
  );
  summary.classList.add('swishiq-composite-result-summary--prominent');
  root.append(summary);
  const componentPanel = el(documentRef, 'section', undefined, 'swishiq-builder-visual swishiq-composite-result-profile');
  componentPanel.setAttribute('aria-labelledby', 'compositeResultProfileTitle');
  const componentHead = el(documentRef, 'div', undefined, 'swishiq-builder-visual__head');
  const assignedTraitCount = (result.components || []).filter(component => ['observed', 'complete_with_caveats'].includes(component.status)).length;
  componentHead.append(
    el(documentRef, 'span', 'Built output'),
    el(documentRef, 'strong', `${assignedTraitCount} of ${COMPOSITE_FORGE_COMPONENTS.length} traits with observed values`),
  );
  const componentGrid = el(documentRef, 'div', undefined, 'swishiq-builder-visual__grid');
  const componentTitle = componentHead.querySelector('strong');
  if (componentTitle) componentTitle.id = 'compositeResultProfileTitle';
  (result.components || []).forEach(component => {
    const card = el(documentRef, 'article', undefined, 'swishiq-builder-visual__card');
    const value = component.value === null ? 'Unavailable' : formatValue(component.value);
    const unit = component.value === null ? 'No value' : formatCompositeUnit(component.unit);
    const donors = (component.donorContributions || []).filter(donor => donor.player);
    const donorPreview = donors.slice(0, 2).map(donor =>
      `${donor.player} · ${labelSeason(donor.seasonStartYear)} · ${donor.team || 'Team unavailable'}`);
    const donorText = donorPreview.length
      ? `${donorPreview.join(' · ')}${donors.length > donorPreview.length ? ` · +${donors.length - donorPreview.length} more` : ''}`
      : 'No eligible player contribution';
    const slotFit = ratingParts.find(part => part.component === component.key);
    const slotFitText = slotFit && Number.isFinite(slotFit.percentile)
      ? `Slot fit · ${formatOrdinalPercentile(slotFit.percentile)} · ${formatValue(slotFit.cohortRows, 0)} cohort examples`
      : 'Slot fit unavailable';
    card.append(
      el(documentRef, 'span', compositeUiLabel(component), 'swishiq-builder-visual__label'),
      el(documentRef, 'strong', value, 'swishiq-builder-visual__value'),
      el(documentRef, 'small', unit, 'swishiq-builder-visual__unit'),
      el(documentRef, 'small', donorText, 'swishiq-composite-result-source'),
      el(documentRef, 'small', slotFitText, 'swishiq-composite-slot-fit'),
    );
    componentGrid.append(card);
  });
  componentPanel.append(componentHead, componentGrid);
  root.append(componentPanel);
  const donorMap = el(documentRef, 'div', undefined, 'swishiq-composite-source-map');
  result.components.forEach(component => {
    const card = el(documentRef, 'article', undefined, 'swishiq-composite-source-card');
    const head = el(documentRef, 'div', undefined, 'swishiq-composite-source-card__head');
    const componentTitle = el(documentRef, 'strong', compositeUiLabel(component));
    componentTitle.title = compositeUiHint(component);
    head.append(componentTitle);
    const value = component.value === null ? 'Unavailable' : `${formatValue(component.value)} ${formatCompositeUnit(component.unit)}`;
    head.append(el(documentRef, 'span', value, 'swishiq-composite-source-card__value'));
    card.append(head);
    const donors = component.donorContributions?.length ? component.donorContributions : [];
    if (!donors.length) card.append(el(documentRef, 'p', 'No eligible player example was selected.', 'swishiq-advanced-muted'));
    donors.forEach(donor => {
      const donorRow = el(documentRef, 'div', undefined, 'swishiq-composite-source-card__donor');
      const donorName = el(documentRef, 'span', donor.player || 'Unknown player');
      const coverageParts = [];
      if (Number.isFinite(donor.knownGames)) coverageParts.push(`${formatValue(donor.knownGames, 0)} games`);
      if (donor.exposureUnit === 'denominator' && Number.isFinite(donor.denominator)) {
        coverageParts.push(`n=${formatValue(donor.denominator, 0)} denominator`);
      } else if (donor.exposureUnit === 'minutes' && Number.isFinite(donor.exposure)) {
        coverageParts.push(`${formatValue(donor.exposure, 0)} minutes`);
      }
      if (!coverageParts.length && Number.isFinite(donor.exposure)) {
        coverageParts.push(`${formatValue(donor.exposure, 0)} ${donor.exposureUnit || 'exposure'}`);
      }
      const coverage = coverageParts.length ? `Coverage ${coverageParts.join(' · ')}` : 'Coverage unavailable';
      const share = Number.isFinite(Number(donor.effectiveShare))
        ? `${formatValue(Number(donor.effectiveShare) * 100, 1)}% contribution`
        : 'contribution unavailable';
      const donorMeta = el(documentRef, 'small', `${labelSeason(donor.seasonStartYear)} · ${donor.team || 'All teams'} · ${coverage} · ${share}`);
      const bar = el(documentRef, 'span', undefined, 'swishiq-composite-source-card__bar');
      bar.style.setProperty('--swishiq-donor-share', `${Math.max(0, Math.min(100, (donor.effectiveShare || 0) * 100))}%`);
      donorRow.append(donorName, donorMeta, bar);
      card.append(donorRow);
    });
    donorMap.append(card);
  });
  const detailDisclosure = el(documentRef, 'details', undefined, 'swishiq-builder-result-evidence');
  detailDisclosure.append(el(documentRef, 'summary', 'Donor contributions, coverage, and output ranges'));
  const detailBody = el(documentRef, 'div', undefined, 'swishiq-builder-result-evidence__body');
  detailBody.append(donorMap);
  if (result.playerProfile) {
    const profileRows = Object.entries(result.playerProfile.skillVector || {}).map(([key, value]) => [compositeUiLabel(key), value == null ? 'Unavailable' : formatValue(value, 2)]);
    detailBody.append(renderTable(documentRef, `Coherent ${result.playerProfile.archetype || 'balanced'} skill profile`, ['Component', 'Modeled value'], profileRows));
    const tendencyRows = (result.playerProfile.tendencies || []).map(tendency => [tendency.label, tendency.value == null ? 'Unavailable' : formatValue(tendency.value, 2), tendency.unit || '—']);
    if (tendencyRows.length) detailBody.append(renderTable(documentRef, 'Modeled tendencies', ['Tendency', 'Value', 'Unit'], tendencyRows));
    const roleFit = result.playerProfile.roleFit;
    if (roleFit) detailBody.append(el(documentRef, 'p', `Role fit: ${roleFit.status || 'unavailable'} · ${Array.isArray(roleFit.roleFamilies) && roleFit.roleFamilies.length ? roleFit.roleFamilies.join(', ') : 'no resolved role family'}. Skill interactions remain model diagnostics, not an overall grade.`, 'swishiq-advanced-muted'));
    detailBody.append(el(documentRef, 'p', 'Trait interactions and role fit are model diagnostics; they do not produce an overall grade.', 'swishiq-advanced-muted'));
  }
  const rows = result.components.map(component => [compositeUiLabel(component), component.status, component.value === null ? 'Unavailable' : `${formatValue(component.value)} ${formatCompositeUnit(component.unit)}`, component.donorContributions.map(donor => `${donor.player} (${Math.round(donor.effectiveShare * 100)}%)`).join(', ') || 'No player example']);
  detailBody.append(renderTable(documentRef, 'Component blend', ['Component', 'Status', 'Value', 'Comparison player'], rows));
  const synthetic = result.syntheticStatistics;
  if (synthetic?.status !== 'unavailable') {
    const labels = COMPOSITE_STAT_LABELS;
    const statisticalRows = Object.entries(labels).map(([key, label]) => {
      const modeledValue = synthetic.values?.[key];
      const donors = modeledValue?.donorContributions?.map(donor => `${donor.player} (${Math.round((donor.effectiveShare || 0) * 100)}%)`).join(', ') || 'Unavailable';
      const value = key === 'involvementPer36' ? synthetic.skillRates?.[key] : synthetic.perGame?.[key];
      const total = key === 'involvementPer36' ? 'Per 36' : synthetic.totals?.[key] == null ? 'Unavailable' : synthetic.totals[key];
      return [label, value == null ? 'Unavailable' : formatValue(value, 1), total, donors];
    });
     detailBody.append(renderTable(documentRef, 'Generated statistical profile', ['Statistic', 'Per game', 'Workload total', 'Comparison players'], statisticalRows));
     const componentRatingRows = ratingParts.map(part => [part.label || part.component, part.rating == null ? 'Unavailable' : `${part.rating}/99`, formatOrdinalPercentile(part.percentile), part.status || 'unavailable']);
     if (componentRatingRows.length) detailBody.append(renderTable(documentRef, 'Per-component tuning (no overall grade)', ['Skill band', 'Tuning aid', 'Cohort percentile', 'Status'], componentRatingRows));
     const uncertaintyRows = (synthetic.uncertainty?.ranges || []).filter(range => range.status !== 'unavailable').map(range => [range.key, range.value == null ? 'Unavailable' : formatValue(range.value, 2), `${formatValue(range.minimum, 2)}–${formatValue(range.maximum, 2)}`, range.outsideDonorRange ? 'Outside donor range after bounded synthesis' : 'Within donor range']);
     if (uncertaintyRows.length) detailBody.append(renderTable(documentRef, 'Modeled output ranges', ['Output', 'Modeled value', 'Selected donor range', 'Interpretation'], uncertaintyRows));
     detailBody.append(el(documentRef, 'p', `Profile workload · ${synthetic.workload?.games == null ? 'Unknown' : formatValue(synthetic.workload.games, 1)} games · ${synthetic.workload?.minutesPerGame == null ? 'Unknown' : formatValue(synthetic.workload.minutesPerGame, 1)} minutes per game.`, 'swishiq-advanced-muted'));
     const uncertaintyNote = compositeUserFacingCopy(synthetic.uncertainty?.note, 'Output ranges are model context, not prediction intervals.');
     if (uncertaintyNote) detailBody.append(el(documentRef, 'p', uncertaintyNote, 'swishiq-advanced-muted'));
  }
  detailDisclosure.append(detailBody);
  root.append(detailDisclosure);
  const validation = result.validation;
  const notes = [...(validation.issues || []), ...(validation.warnings || [])]
    .map(note => compositeUserFacingCopy(note, 'Some model details could not be shown.'));
  const noteCopy = notes.length ? ` ${notes.join(' ')}` : '';
  let validationCopy = notes.length ? notes.join(' ') : 'Synthetic profile is available.';
  let validationClass = notes.length ? 'swishiq-advanced-muted' : 'swishiq-advanced-success';
  if (synthetic?.status === 'partial' || validation.outputReady && validation.outputStatus === 'partial') {
    const unavailableTraitCount = Array.isArray(validation.missingComponents) ? validation.missingComponents.length : 0;
    const usableTraitCount = Math.max(0, validation.totalComponentCount - unavailableTraitCount);
    const availablePerGameCount = Object.values(synthetic?.perGame || {}).filter(Number.isFinite).length;
    const missingOutputCount = Array.isArray(validation.missingSyntheticOutputs) ? validation.missingSyntheticOutputs.length : 0;
    const availabilityNotes = [
      availablePerGameCount ? `${availablePerGameCount} per-game statistics have usable values` : '',
      missingOutputCount ? `${missingOutputCount} synthetic statistic${missingOutputCount === 1 ? ' is' : 's are'} unavailable` : '',
    ].filter(Boolean);
    validationCopy = `Partial synthetic profile: ${usableTraitCount} of ${validation.totalComponentCount} traits have usable values. ${availabilityNotes.join(' and ') || 'Some outputs remain unavailable'}. Missing values stay unavailable.${noteCopy}`;
    validationClass = 'swishiq-advanced-muted';
  } else if (validation.outputReady && !validation.simulationReady) {
    validationCopy = `Synthetic profile is available, but some modeled values remain unavailable.${noteCopy}`;
    validationClass = 'swishiq-advanced-muted';
  } else if (validation.outputReady) {
    validationCopy = `Synthetic profile is available.${noteCopy}`;
    validationClass = notes.length ? 'swishiq-advanced-muted' : 'swishiq-advanced-success';
  } else {
    validationCopy = `Some selected traits could not be used. Review values and sample coverage.${noteCopy}`;
    validationClass = 'swishiq-advanced-muted';
  }
  root.append(el(documentRef, 'p', validationCopy, validationClass));
  if (result.sensitivity?.componentWeightChanges?.length) root.append(el(documentRef, 'p', `${result.sensitivity.componentWeightChanges.length} bounded weight checks saved for replay.`, 'swishiq-advanced-muted'));
}

function mountCareer({ documentRef, registryUrl, fetchImpl }) {
  const root = documentRef.getElementById('careerLabPanel');
  if (!root) return null;
  bindKeyboardScrollableTables(root);
  ensureCareerVisualStyles(documentRef);
  let dataset = null;
  let token = 0;
  let acceptedPooledPackage = false;
  const careerWorkbenchIsActive = () => documentRef.querySelector('.swishiq-tabs button[data-workbench="career"]')
    ?.getAttribute('aria-pressed') === 'true';
  const renderAcceptance = () => {
    const title = el(documentRef, 'h2', 'Recorded Career History');
    title.id = 'careerLabTitle';
    root.replaceChildren(title);
    const accept = el(documentRef, 'button', 'Open Career Lab', 'button');
    accept.type = 'button';
    accept.addEventListener('click', () => {
      acceptedPooledPackage = true;
      void render();
    });
    root.append(accept);
    setPanelVisibility(documentRef, 'career', true);
  };
  const render = async () => {
    const current = ++token;
    if (!careerWorkbenchIsActive()) {
      root.removeAttribute('aria-busy');
      setPanelVisibility(documentRef, 'career', false);
      return;
    }
    if (!acceptedPooledPackage) {
      renderAcceptance();
      return;
    }
    root.setAttribute('aria-busy', 'true');
    renderNotice(documentRef, root, 'Loading recorded history…');
    try {
      let readStagedLookup = null;
      dataset = await loadCareerDataset({
        registryUrl,
        fetchImpl,
        acceptedPooledPackage: true,
        onLookupReady: lookupDataset => {
          if (current !== token || !careerWorkbenchIsActive()) return;
          readStagedLookup = renderCareerLookup(documentRef, root, lookupDataset);
          root.removeAttribute('aria-busy');
          setPanelVisibility(documentRef, 'career', true);
          return readStagedLookup.contextReady;
        },
      });
      if (current !== token || !careerWorkbenchIsActive()) return;
      renderCareerForm(documentRef, root, dataset, readStagedLookup?.() || null);
      setPanelVisibility(documentRef, 'career', true);
    } catch (error) {
      if (current === token && careerWorkbenchIsActive()) {
        setPanelVisibility(documentRef, 'career', true);
        const workspaceTitle = documentRef.getElementById('workspaceTitle');
        const workbenchState = documentRef.getElementById('workbenchState');
        if (workspaceTitle) workspaceTitle.textContent = 'Career Lab unavailable';
        if (workbenchState) {
          workbenchState.textContent = 'Unavailable';
          workbenchState.dataset.state = 'failed';
          workbenchState.classList.remove('swishiq-state--ready');
        }
        renderNotice(documentRef, root, careerUserFacingCopy(error?.message, 'Career Lab could not load the recorded history. Check the connection and try again.'), 'error');
      }
    } finally { if (current === token) root.removeAttribute('aria-busy'); }
  };
  const handle = () => queueMicrotask(() => {
    if (careerWorkbenchIsActive()) void render();
    else {
      // Invalidate a pending pooled-history request when the user leaves
      // Career Lab so its response cannot reopen the hidden panel.
      token += 1;
      root.removeAttribute('aria-busy');
      setPanelVisibility(documentRef, 'career', false);
    }
  });
  documentRef.querySelectorAll('.swishiq-tabs button').forEach(button => button.addEventListener('click', handle));
  return Object.freeze({ reload: render });
}

function observedWeightedRate(rows, metricName) {
  const usable = (rows || []).filter(row => row?.status === 'observed'
    && integer(row.games) && row.games > 0 && finite(row.perGame?.[metricName]));
  const games = usable.reduce((sum, row) => sum + row.games, 0);
  return games > 0 ? usable.reduce((sum, row) => sum + row.perGame[metricName] * row.games, 0) / games : null;
}

function renderCareerObservedPanel(documentRef, root, history, asOfSeasonStartYear = null, metadata = null) {
  if (!root) return;
  root.replaceChildren();
  let timeline;
  try {
    timeline = buildCareerTimeline(history?.profiles || [], { asOfSeasonStartYear });
  } catch {
    root.append(el(documentRef, 'p', 'Recorded history is unavailable for this player.', 'swishiq-career-observed__empty'));
    return;
  }
  const summary = summarizeCareer(timeline);
  const observed = timeline.rows.filter(row => row.status === 'observed');
  const weightedPoints = observedWeightedRate(observed, 'points');
  const latest = observed.at(-1);
  const peak = summary.peakScoringSeason;
  const section = el(documentRef, 'section', undefined, 'swishiq-career-observed');
  section.setAttribute('aria-labelledby', 'careerObservedTitle');
  const heading = el(documentRef, 'div', undefined, 'swishiq-career-observed__heading');
  const headingCopy = el(documentRef, 'div', undefined, 'swishiq-career-observed__identity');
  const avatar = createPlayerAvatar(documentRef, {
    playerRef: history?.playerId,
    displayName: history?.player,
  }, {
    metadata,
    className: 'swishiq-career-observed__avatar',
    alt: `${history?.player || 'Player'} profile`,
  });
  const observedTitle = el(documentRef, 'h3', history?.player || 'Selected player');
  headingCopy.append(
    avatar,
    el(documentRef, 'span', 'Recorded history', 'swishiq-career-observed__kicker'),
    observedTitle,
  );
  observedTitle.id = 'careerObservedTitle';
  heading.append(headingCopy);
  const cards = el(documentRef, 'div', undefined, 'swishiq-career-observed__cards');
  [
    ['Latest season', latest ? labelSeason(latest.seasonStartYear) : 'Unavailable', 'Most recent recorded row'],
    ['Weighted PPG', weightedPoints === null ? 'Unavailable' : formatValue(weightedPoints, 1), 'Games-weighted recorded rate'],
    ['Scoring peak', peak ? `${formatValue(peak.perGame, 1)} PPG` : 'Unavailable', peak ? labelSeason(peak.seasonStartYear) : 'No recorded scoring row'],
    ['Teams tracked', summary.teams?.length || 'Unavailable', summary.teams?.length ? summary.teams.join(' · ') : 'Team code unavailable'],
  ].forEach(([label, value, detail]) => {
    const card = el(documentRef, 'article', undefined, 'swishiq-career-observed__card');
    card.append(el(documentRef, 'span', label), el(documentRef, 'strong', String(value)), el(documentRef, 'small', detail));
    cards.append(card);
  });
  const rows = observed.slice(-6).reverse().map(row => [
    row.season,
    row.teams?.join(' / ') || 'All teams',
    row.games,
    formatValue(row.perGame?.points, 1),
    formatValue(row.perGame?.assists, 1),
    formatValue(row.perGame?.rebounds, 1),
  ]);
  const table = renderTable(documentRef, 'Recent recorded seasons', ['Season', 'Team context', 'Games', 'PPG', 'APG', 'RPG'], rows);
  table.classList.add('swishiq-career-observed__table');
  const tableDetails = el(documentRef, 'details', undefined, 'swishiq-career-observed__details');
  tableDetails.append(el(documentRef, 'summary', 'Review recent recorded seasons'), table);
  section.append(heading, cards, tableDetails,
    el(documentRef, 'p', 'Unrecorded seasons remain unavailable, not zero.', 'swishiq-career-observed__note'));
  root.append(section);
}

function renderCareerLookup(documentRef, root, dataset) {
  root.replaceChildren();
  const heading = el(documentRef, 'div', undefined, 'swishiq-career-heading');
  const title = el(documentRef, 'h2', 'Recorded player history');
  title.id = 'careerLabTitle';
  heading.append(el(documentRef, 'span', 'Career Lab', 'swishiq-career-heading__eyebrow'), title);
  const form = el(documentRef, 'div', undefined, 'swishiq-career-lookup');
  const lookupStrip = el(documentRef, 'div', undefined, 'swishiq-career-filter-strip');
  const histories = (Array.isArray(dataset.histories) ? dataset.histories : [])
    .filter(history => history.profiles.length >= 2);
  const historyTeamsAtSeason = (history, year) => history.teamHistory
    ?.find(row => row.seasonStartYear === year)?.teams || [];
  const seasonFilter = el(documentRef, 'select');
  [...new Set(histories.flatMap(history => history.teamHistory
    ?.filter(row => row.teams?.length).map(row => row.seasonStartYear) || []))]
    .sort((left, right) => right - left)
    .forEach(year => addOption(documentRef, seasonFilter, year, labelSeason(year)));
  if (!seasonFilter.options.length) addOption(documentRef, seasonFilter, '', 'No seasons available');
  seasonFilter.value = seasonFilter.options[0]?.value || '';
  const seasonLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  seasonLabel.append(el(documentRef, 'span', 'Season'), seasonFilter);

  const teamFilter = el(documentRef, 'select');
  teamFilter.disabled = true;
  const teamLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  teamLabel.append(el(documentRef, 'span', 'Team'), teamFilter);

  const playerSearch = el(documentRef, 'input');
  Object.assign(playerSearch, { type: 'search', autocomplete: 'off', placeholder: 'Search players on this team', disabled: true });
  playerSearch.setAttribute('aria-label', 'Search career players');
  const player = el(documentRef, 'select');
  player.disabled = true;
  const playerStatus = el(documentRef, 'small', '', 'swishiq-career-state-help');
  playerStatus.setAttribute('role', 'status');
  playerStatus.hidden = true;
  const playerLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  playerLabel.append(el(documentRef, 'span', 'Player'), playerSearch, player, playerStatus);
  lookupStrip.append(seasonLabel, teamLabel, playerLabel);

  const status = el(documentRef, 'p', 'Loading recorded history…', 'swishiq-advanced-status');
  status.setAttribute('role', 'status');
  form.append(lookupStrip, status);
  root.append(heading, form);

  let touched = false;
  let resolvePlayerSelection;
  let selectionTimer;
  const selectedPlayer = new Promise(resolve => { resolvePlayerSelection = resolve; });
  const selectionGrace = new Promise(resolve => { selectionTimer = setTimeout(resolve, CAREER_LOOKUP_SELECTION_GRACE_MS); });
  const contextReady = Promise.race([selectedPlayer, selectionGrace]).finally(() => clearTimeout(selectionTimer));
  function refreshPlayers() {
    const prior = player.value;
    const year = Number(seasonFilter.value);
    const scoped = seasonFilter.value && teamFilter.value
      ? histories.filter(history => historyTeamsAtSeason(history, year).includes(teamFilter.value)) : [];
    const query = playerSearch.value.trim().toLocaleLowerCase();
    const matches = query ? scoped.filter(history => history.player.toLocaleLowerCase().includes(query)) : scoped;
    const visible = matches.slice(0, PLAYER_BUILDER_DONOR_PAGE_SIZE);
    const selected = scoped.find(history => history.playerId === prior) || matches[0] || null;
    if (selected && !visible.some(history => history.playerId === prior)) visible.unshift(selected);
    player.replaceChildren();
    visible.forEach(history => addOption(documentRef, player, history.playerId, history.player));
    if (!visible.length) addOption(documentRef, player, '', !seasonFilter.value ? 'Choose a season first' : !teamFilter.value
      ? 'Choose a team first' : query ? 'No players match' : 'No players available');
    player.value = selected?.playerId || '';
    player.disabled = !teamFilter.value || !visible.length;
    playerSearch.disabled = !teamFilter.value;
    playerStatus.textContent = matches.length > PLAYER_BUILDER_DONOR_PAGE_SIZE
      ? `Showing the first ${PLAYER_BUILDER_DONOR_PAGE_SIZE} players. Search a name to narrow the list.` : '';
    playerStatus.hidden = matches.length <= PLAYER_BUILDER_DONOR_PAGE_SIZE;
    status.textContent = player.value
      ? 'Loading recorded history…'
      : !seasonFilter.value ? 'No recorded season is available.'
        : !teamFilter.value ? 'No team is available for this season.' : 'No matching player is available for this selection.';
  }
  function refreshTeams() {
    const prior = teamFilter.value;
    teamFilter.replaceChildren();
    const year = Number(seasonFilter.value);
    if (seasonFilter.value) [...new Set(histories.flatMap(history => historyTeamsAtSeason(history, year)))]
      .sort().forEach(teamCode => addOption(documentRef, teamFilter, teamCode, teamCode));
    teamFilter.value = prior && [...teamFilter.options].some(option => option.value === prior)
      ? prior : teamFilter.options[0]?.value || '';
    if (!teamFilter.options.length) addOption(documentRef, teamFilter, '', 'No teams available');
    teamFilter.disabled = !seasonFilter.value || !teamFilter.options[0]?.value;
    playerSearch.value = '';
    refreshPlayers();
  }
  seasonFilter.addEventListener('change', () => { touched = true; refreshTeams(); });
  teamFilter.addEventListener('change', () => { touched = true; playerSearch.value = ''; refreshPlayers(); });
  playerSearch.addEventListener('input', () => { touched = true; refreshPlayers(); });
  player.addEventListener('change', () => {
    touched = true;
    if (player.value) resolvePlayerSelection();
    status.textContent = player.value
      ? 'Loading recorded history…'
      : 'Choose a player to load recorded history.';
  });
  refreshTeams();
  const readLookup = () => touched ? ({
    touched: true,
    season: seasonFilter.value,
    team: teamFilter.value,
    player: player.value,
    search: playerSearch.value,
  }) : null;
  readLookup.contextReady = contextReady;
  return readLookup;
}

function renderCareerForm(documentRef, root, dataset, restoreLookup = null) {
  root.replaceChildren();
  // Forecast controls stay closed until their evidence and calibrated model
  // contract are validated together; package descriptors alone cannot open them.
  const simulationAvailable = false;
  const scenarioAvailable = dataset.careerScenarioAvailable === true
    && dataset.proof?.package?.scope?.kind === 'pooled-window'
    && dataset.proof?.package?.capabilities?.careerHistory?.status === 'available';
  const heading = el(documentRef, 'div', undefined, 'swishiq-career-heading');
  const title = el(documentRef, 'h2', 'Career Lab'); title.id = 'careerLabTitle';
  heading.append(title);
  root.append(heading);
  const form = el(documentRef, 'form', undefined, 'swishiq-advanced-form');
  form.classList.add('swishiq-career-form');
  form.classList.add('swishiq-career-controls');
  form.setAttribute('aria-labelledby', title.id);
  const grid = el(documentRef, 'div', undefined, 'swishiq-advanced-grid');
  const lookupStrip = el(documentRef, 'div', undefined, 'swishiq-career-filter-strip');
  const eligibleHistories = dataset.histories.filter(history => history.profiles.length >= 2);
  const historyTeamsAtSeason = (history, year) => history.teamHistory
    ?.find(row => row.seasonStartYear === year)?.teams || [];
  const seasonFilter = el(documentRef, 'select');
  [...new Set(eligibleHistories.flatMap(history => history.teamHistory
    ?.filter(row => row.teams?.length).map(row => row.seasonStartYear) || []))]
    .sort((left, right) => right - left)
    .forEach(year => addOption(documentRef, seasonFilter, year, labelSeason(year)));
  if (!seasonFilter.options.length) addOption(documentRef, seasonFilter, '', 'No seasons available');
  seasonFilter.value = seasonFilter.options[0]?.value || '';
  const seasonFilterLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  seasonFilterLabel.append(el(documentRef, 'span', 'Season'), seasonFilter);
  const teamFilter = el(documentRef, 'select');
  teamFilter.disabled = true;
  const teamFilterField = el(documentRef, 'div', undefined, 'swishiq-career-team-filter');
  const teamFilterLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  teamFilterLabel.append(el(documentRef, 'span', 'Team'), teamFilter);
  teamFilterField.append(teamFilterLabel);
  const player = el(documentRef, 'select');
  const playerSearch = el(documentRef, 'input');
  Object.assign(playerSearch, { type: 'search', autocomplete: 'off', placeholder: 'Search players on this team' });
  playerSearch.setAttribute('aria-label', 'Search career players');
  playerSearch.disabled = true;
  const playerListStatus = el(documentRef, 'small', 'Choose a season and team to see players.', 'swishiq-career-state-help');
  playerListStatus.setAttribute('role', 'status');
  playerListStatus.hidden = true;
  const playerLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  playerLabel.append(el(documentRef, 'span', 'Player'), playerSearch, player, playerListStatus);
  lookupStrip.append(seasonFilterLabel, teamFilterField, playerLabel);
  grid.append(lookupStrip);
  const cutoff = el(documentRef, 'select');
  const cutoffLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  cutoffLabel.classList.add('swishiq-career-cutoff');
  cutoffLabel.append(el(documentRef, 'span', 'As-of season'), cutoff); grid.append(cutoffLabel);
  const progression = el(documentRef, 'select'); [['conservative', 'Conservative'], ['typical', 'Typical'], ['breakout', 'Breakout'], ['decline', 'Decline']].forEach(([value, label]) => addOption(documentRef, progression, value, label));
  const progressionLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field'); progressionLabel.append(el(documentRef, 'span', 'Development Arc: Progression/Regression Level'), progression); grid.append(progressionLabel);
  const horizon = el(documentRef, 'select'); [[3, '3 seasons'], [5, '5 seasons'], [10, '10 seasons']].forEach(([value, label]) => addOption(documentRef, horizon, value, label));
  const horizonLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field'); horizonLabel.append(el(documentRef, 'span', 'Forward horizon'), horizon); grid.append(horizonLabel);
  const repeats = el(documentRef, 'select'); [[50, '50 paths'], [100, '100 paths'], [250, '250 paths']].forEach(([value, label]) => addOption(documentRef, repeats, value, label));
  const repeatsLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field'); repeatsLabel.append(el(documentRef, 'span', 'Repeated paths'), repeats); grid.append(repeatsLabel);
  const seed = el(documentRef, 'input'); Object.assign(seed, { type: 'text', value: '', required: false, pattern: '[A-Za-z0-9:._\\-]{1,80}', maxLength: 80, placeholder: 'Leave blank for a new random run' });
  const seedLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field'); seedLabel.append(el(documentRef, 'span', 'Replay seed (optional)'), seed); grid.append(seedLabel);
  const run = el(documentRef, 'button', 'Simulate career', 'button'); run.type = 'submit'; run.disabled = true;
  const status = el(documentRef, 'p', '', 'swishiq-advanced-status'); status.setAttribute('role', 'status');
  if (!simulationAvailable) {
    for (const label of [progressionLabel, horizonLabel, repeatsLabel, seedLabel]) label.hidden = true;
    for (const control of [progression, horizon, repeats, seed, run]) control.disabled = true;
    run.hidden = true;
  }
  form.append(grid, run, status);
  const dashboard = el(documentRef, 'div', undefined, 'swishiq-career-dashboard');
  const primary = el(documentRef, 'div', undefined, 'swishiq-career-dashboard__primary');
  const sidebar = el(documentRef, 'aside', undefined, 'swishiq-career-dashboard__sidebar');
  const observedPanel = el(documentRef, 'div', undefined, 'swishiq-career-observed-host swishiq-career-recorded-context');
  sidebar.append(observedPanel);
  primary.append(form);
  dashboard.append(primary, sidebar);
  root.append(dashboard);
  const resultRoot = el(documentRef, 'div', undefined, 'swishiq-advanced-result swishiq-career-results'); root.append(resultRoot);
  let lastReport = null;
  let lastExperiment = null;
  let experimentCount = 0;
  const testedPolicies = new Set();
  const policyResults = new Map();
  const experimentPanel = el(documentRef, 'section', undefined, 'swishiq-builder-hud swishiq-career-round');
  experimentPanel.setAttribute('aria-label', 'Career Lab policy experiments');
  experimentPanel.hidden = !simulationAvailable;
  const experimentGoal = el(documentRef, 'strong', 'Goal · Compare four policies from one recorded cutoff and replay seed.');
  const goalMetric = el(documentRef, 'select');
  [['points', 'Points per game'], ['assists', 'Assists per game'], ['rebounds', 'Rebounds per game']]
    .forEach(([value, label]) => addOption(documentRef, goalMetric, value, label));
  const goalMetricLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  goalMetricLabel.append(el(documentRef, 'span', 'Modeled horizon goal'), goalMetric);
  const experimentProgress = el(documentRef, 'p', 'Experiment 1 · Pick a progression policy and simulate from the recorded cutoff.');
  experimentProgress.setAttribute('aria-live', 'polite');
  const nextPolicyButton = el(documentRef, 'button', 'Try another policy with the same seed', 'button swishiq-builder-action swishiq-builder-action--secondary');
  nextPolicyButton.type = 'button';
  nextPolicyButton.hidden = true;
  experimentPanel.append(experimentGoal, goalMetricLabel, experimentProgress, nextPolicyButton);
  root.insertBefore(experimentPanel, resultRoot);
  const journeyPanel = el(documentRef, 'section', undefined, 'swishiq-builder-hud swishiq-career-journey');
  journeyPanel.setAttribute('aria-label', 'Season-by-season conditional career scenario');
  journeyPanel.hidden = !simulationAvailable && !scenarioAvailable;
  const journeyTitle = el(documentRef, 'h3', 'Step through a conditional scenario');
  const journeyNote = el(documentRef, 'p', 'Pick a development arc, then run one season.');
  const journeyPolicy = el(documentRef, 'select');
  [['conservative', 'Conservative'], ['typical', 'Typical'], ['breakout', 'Breakout'], ['decline', 'Decline']]
    .forEach(([value, label]) => addOption(documentRef, journeyPolicy, value, label));
  const journeyPolicyLabel = el(documentRef, 'label', undefined, 'swishiq-advanced-field');
  journeyPolicyLabel.append(el(documentRef, 'span', 'Development Arc: Progression/Regression Level'), journeyPolicy);
  const journeyRun = el(documentRef, 'button', 'Simulate next scenario season', 'button swishiq-builder-action');
  journeyRun.type = 'button';
  const journeyStatus = el(documentRef, 'p', '', 'swishiq-career-journey__status');
  journeyStatus.setAttribute('role', 'status');
  const journeyResults = el(documentRef, 'div', undefined, 'swishiq-career-journey__results');
  journeyPanel.append(journeyTitle, journeyNote, journeyStatus, journeyResults, journeyPolicyLabel, journeyRun);
  root.insertBefore(journeyPanel, resultRoot);
  if (!simulationAvailable) {
    for (const control of [goalMetric, nextPolicyButton, journeyPolicy]) control.disabled = true;
    journeyRun.disabled = true;
  }
  let journey = null;
  let journeyContext = null;
  const resetJourney = () => {
    journey = null;
    journeyRun.disabled = !journeyContext;
    journeyRun.textContent = 'Simulate next scenario season';
    journeyResults.replaceChildren();
  };
  const refreshJourneyReadiness = () => {
    journeyContext = null;
    resetJourney();
    journeyPolicy.disabled = true;
    if (!scenarioAvailable) {
      journeyStatus.textContent = 'Conditional scenarios are unavailable for this player and cutoff.';
      journeyRun.disabled = true;
      return;
    }
    const history = dataset.histories.find(item => item.playerId === player.value);
    const cutoffYear = Number(cutoff.value);
    if (!history || !integer(cutoffYear)) {
      journeyStatus.textContent = '';
      journeyRun.disabled = true;
      return;
    }
    try {
      const timeline = buildCareerTimeline(history.profiles, { asOfSeasonStartYear: cutoffYear });
      if (timeline.asOf?.frozen !== true || timeline.asOf.seasonStartYear !== cutoffYear
        || timeline.rows.some(row => integer(row?.seasonStartYear) && row.seasonStartYear > cutoffYear)) {
        fail('The selected history could not be frozen at this as-of cutoff.');
      }
      const target = careerState(timeline, null, null);
      const comparableHistories = chooseCareerHistories(dataset.histories.filter(item => item.playerId !== history.playerId),
        timeline, cutoffYear, target.experience);
      const cohort = buildCareerCohort({ targetPlayerId: history.playerId, targetState: target,
        histories: comparableHistories, asOfSeasonStartYear: cutoffYear });
      if (cohort.status !== 'ready' || cohort.asOfSeasonStartYear !== cutoffYear
        || cohort.target?.playerId !== history.playerId) {
        journeyStatus.textContent = careerUserFacingCopy(cohort.reason, 'No comparison group is available for this cutoff.');
        journeyRun.disabled = true;
        return;
      }
      journeyContext = { history, timeline, target, cohort, asOfSeasonStartYear: cutoffYear };
      journeyStatus.textContent = `Conditional scenario ready · ${cohort.comparables.length} comparable histories, ${cohort.transitions.length} transitions. One seed stays fixed for this run.`;
      journeyPolicy.disabled = false;
      journeyRun.disabled = false;
    } catch (error) {
      const message = String(error?.message || '');
      journeyStatus.textContent = /no age value/i.test(message)
        ? 'Conditional scenario unavailable: age is not recorded for this cutoff.'
        : /no experience value/i.test(message)
          ? 'Conditional scenario unavailable: experience is not recorded for this cutoff.'
          : careerUserFacingCopy(message, 'No comparison group is available for this cutoff.');
      journeyRun.disabled = true;
    }
  };
  const sessionHud = simulationAvailable ? mountSimulationSessionHud(documentRef, root, {
    id: 'careerLabSessionHud',
    objective: 'Freeze an as-of cutoff, then compare recorded history with seeded career paths.',
    steps: ['Choose player and cutoff', 'Confirm as-of state', 'Run modeled path', 'Review result'],
    provenance: {
      scope: 'Combined career history',
      cutoff: 'Use the selected recorded as-of profile for the conditional scenario',
      output: 'Recorded rows stay separate from conditional seeded paths',
    },
    initialMessage: 'Choose a player and cutoff. A scenario requires complete recorded state and a ready comparison group.',
    onReset: () => {
      resetJourney();
      lastReport = null;
      lastExperiment = null;
      experimentCount = 0;
      testedPolicies.clear();
      policyResults.clear();
      goalMetric.disabled = false;
      experimentGoal.textContent = 'Goal · Compare four policies from one recorded cutoff and replay seed.';
      nextPolicyButton.hidden = true;
      experimentProgress.textContent = 'Experiment 1 · Pick a progression policy and simulate from the recorded cutoff.';
      resultRoot.replaceChildren();
      status.textContent = 'Session reset. The current setup and replay seed remain selected; review them before the next run.';
    },
    onReplay: () => {
      if (!lastReport?.seed) {
        status.textContent = 'Run the Career Lab once before replaying it.';
        return;
      }
      seed.value = lastReport.seed;
      status.textContent = `Replaying the career path with seed ${lastReport.seed}…`;
      form.requestSubmit();
    },
  }) : null;
  if (sessionHud) root.insertBefore(sessionHud.element, experimentPanel);
  journeyRun.addEventListener('click', () => {
    if (!scenarioAvailable || !journeyContext) return;
    try {
      if (!journey) {
        journey = { ...journeyContext, seed: resolveSimulationSeed('', 'career-scenario').seed,
          horizon: 5, repeats: 50, policies: [], checkpoints: [] };
      }
      const policies = [...journey.policies, journeyPolicy.value];
      const report = simulateCareer({ timeline: journey.timeline, targetPlayerId: journey.history.playerId,
        asOfSeasonStartYear: journey.asOfSeasonStartYear, asOfState: journey.target, cohort: journey.cohort,
        progression: 'typical', progressionBySeason: policies, horizon: policies.length,
        repeats: journey.repeats, seed: journey.seed });
      if (report.status !== 'complete') {
        journeyStatus.textContent = careerUserFacingCopy(report.reason, 'This season could not be simulated from the available comparison group.');
        return;
      }
      if (report.asOf?.seasonStartYear !== journey.asOfSeasonStartYear || report.cohort?.status !== 'ready') {
        fail('The scenario did not retain its frozen cutoff and ready comparable cohort.');
      }
      journey.policies = policies;
      journey.checkpoints = policies.map((policy, index) => {
        const at = metric => report.trajectories?.[metric]?.[index]?.quantiles?.[50];
        return {
          policy,
          points: at('points'),
          assists: at('assists'),
          rebounds: at('rebounds'),
          minutesPerGame: at('minutesPerGame'),
          games: at('games'),
        };
      });
      const year = journey.asOfSeasonStartYear + policies.length;
      const currentCheckpoint = journey.checkpoints.at(-1);
      const previousPoints = journey.checkpoints.at(-2)?.points;
      const currentPoints = currentCheckpoint.points;
      const change = Number.isFinite(previousPoints) && Number.isFinite(currentPoints)
        ? ` · ${currentPoints >= previousPoints ? '+' : ''}${formatValue(currentPoints - previousPoints, 1)} PPG versus prior modeled season`
        : '';
      const currentPolicy = `${journeyPolicy.value[0].toUpperCase()}${journeyPolicy.value.slice(1)} development arc`;
      journeyStatus.textContent = `${labelSeason(year)} conditional P50 under ${currentPolicy}: ${formatCareerDisplayValue(currentPoints)} PPG${change}. Seed ${journey.seed} is reused for each checkpoint. ${policies.length < journey.horizon ? 'Review this checkpoint, then choose the next arc level.' : 'Scenario horizon complete.'}`;
      const metricValue = (state, metric) => state?.[metric] ?? state?.metrics?.[metric] ?? null;
      const metricSummary = state => `PTS ${formatCareerDisplayValue(metricValue(state, 'points'))} · AST ${formatCareerDisplayValue(metricValue(state, 'assists'))} · REB ${formatCareerDisplayValue(metricValue(state, 'rebounds'))} · MPG ${formatCareerDisplayValue(metricValue(state, 'minutesPerGame'))} · games ${formatCareerDisplayValue(metricValue(state, 'games'))}`;
      const changeSummary = (current, previous) => [
        ['PTS', 'points'], ['AST', 'assists'], ['REB', 'rebounds'], ['MPG', 'minutesPerGame'], ['games', 'games'],
      ].map(([label, metric]) => {
        const value = metricValue(current, metric), prior = metricValue(previous, metric);
        return `${label} ${Number.isFinite(value) && Number.isFinite(prior) ? `${value - prior >= 0 ? '+' : ''}${formatValue(value - prior, 1)}` : '—'}`;
      }).join(' · ');
      const rows = journey.checkpoints.map((checkpoint, index) => {
        const previous = index === 0 ? journey.target : journey.checkpoints[index - 1];
        return [labelSeason(journey.asOfSeasonStartYear + index + 1),
          index === 0 ? `Recorded cutoff · ${metricSummary(previous)}` : `Prior segment P50 · ${metricSummary(previous)}`,
          `${checkpoint.policy[0].toUpperCase()}${checkpoint.policy.slice(1)} development arc`,
          metricSummary(checkpoint), changeSummary(checkpoint, previous)];
      });
      journeyResults.replaceChildren(
        el(documentRef, 'p', 'Conditional P50 values are modeled, not recorded or guaranteed. Development arcs are scenario settings, not causal player-development effects.', 'swishiq-advanced-muted'),
        renderTable(documentRef, 'Development arc checkpoints', ['Season', 'Prior context', 'Development arc', 'Following P50', 'Change from prior'], rows),
      );
      if (policies.length === journey.horizon) {
        journeyRun.disabled = true;
        journeyRun.textContent = 'Scenario horizon complete';
      }
    } catch (error) {
      journeyStatus.textContent = careerUserFacingCopy(error?.message, 'This season could not be simulated.');
    }
  });
  function refreshTeams() {
    const prior = teamFilter.value;
    teamFilter.replaceChildren();
    const year = Number(seasonFilter.value);
    if (seasonFilter.value) [...new Set(eligibleHistories.flatMap(history => historyTeamsAtSeason(history, year)))]
      .sort().forEach(teamCode => addOption(documentRef, teamFilter, teamCode, teamCode));
    teamFilter.value = prior && [...teamFilter.options].some(option => option.value === prior)
      ? prior : teamFilter.options[0]?.value || '';
    if (!teamFilter.options.length) addOption(documentRef, teamFilter, '', 'No teams available');
    teamFilter.disabled = !seasonFilter.value || !teamFilter.options[0]?.value;
    playerSearch.value = '';
    refreshPlayers(false);
  }
  function refreshPlayers(preserveSelection = false) {
    const prior = preserveSelection ? player.value : '';
    const year = Number(seasonFilter.value);
    const scoped = seasonFilter.value && teamFilter.value
      ? eligibleHistories.filter(history => historyTeamsAtSeason(history, year).includes(teamFilter.value)) : [];
    const query = playerSearch.value.trim().toLocaleLowerCase();
    const matches = query ? scoped.filter(history => history.player.toLocaleLowerCase().includes(query)) : scoped;
    const visible = matches.slice(0, 40);
    const selected = scoped.find(history => history.playerId === prior) || matches[0] || null;
    if (selected && !visible.some(history => history.playerId === prior)) visible.unshift(selected);
    player.replaceChildren();
    visible.forEach(history => addOption(documentRef, player, history.playerId, history.player));
    if (!visible.length) addOption(documentRef, player, '', !seasonFilter.value ? 'Choose a season first' : !teamFilter.value
      ? 'Choose a team first' : query ? 'No players match' : 'No players available');
    player.value = selected?.playerId || '';
    player.disabled = !teamFilter.value || !visible.length;
    playerSearch.disabled = !teamFilter.value;
    playerListStatus.textContent = matches.length > 40
      ? 'Showing the first 40 players. Search a name to narrow the list.' : '';
    playerListStatus.hidden = matches.length <= 40;
    if (player.value !== prior || !prior) refreshCutoffs();
  }
  function refreshCutoffs() {
    const history = dataset.histories.find(item => item.playerId === player.value);
    cutoff.replaceChildren();
    if (!history) {
      cutoff.disabled = true;
      run.disabled = true;
      observedPanel.replaceChildren();
      status.textContent = !seasonFilter.value ? 'No recorded season is available.'
        : !teamFilter.value ? 'No team is available for this season.' : 'Choose a player to review recorded history.';
      refreshJourneyReadiness();
      return;
    }
    cutoff.disabled = false;
    run.disabled = !simulationAvailable;
    careerCutoffYears(history?.profiles).forEach(seasonStartYear => addOption(documentRef, cutoff, seasonStartYear, labelSeason(seasonStartYear)));
    if (cutoff.options.length) cutoff.value = cutoff.options[cutoff.options.length - 1].value;
    cutoff.disabled = !cutoff.options.length;
    refreshCutoffState();
  }
  function refreshCutoffState() {
    const history = dataset.histories.find(item => item.playerId === player.value);
    if (!history) return;
    if (!cutoff.value) {
      observedPanel.replaceChildren();
      status.textContent = 'No recorded seasons are available for this player.';
      refreshJourneyReadiness();
      return;
    }
    status.textContent = '';
    renderCareerObservedPanel(documentRef, observedPanel, history, Number(cutoff.value), dataset.metadata);
    refreshJourneyReadiness();
  }
  seasonFilter.addEventListener('change', refreshTeams);
  teamFilter.addEventListener('change', () => { playerSearch.value = ''; refreshPlayers(false); });
  playerSearch.addEventListener('input', () => refreshPlayers(true));
  player.addEventListener('change', refreshCutoffs);
  cutoff.addEventListener('change', refreshCutoffState);
  refreshTeams();
  const storage = browserStorage();
  const savedCareer = simulationAvailable
    ? loadCareerSimulationRecipe(storage, CAREER_STORAGE_KEY, { packageRef: packageRef(dataset.proof, true) })
    : { status: 'not-required' };
  if (restoreLookup?.touched) {
    if ([...seasonFilter.options].some(option => option.value === restoreLookup.season)) {
      seasonFilter.value = restoreLookup.season;
      refreshTeams();
    }
    if ([...teamFilter.options].some(option => option.value === restoreLookup.team)) {
      teamFilter.value = restoreLookup.team;
      const selectedLookupHistory = eligibleHistories.find(history => history.playerId === restoreLookup.player);
      playerSearch.value = restoreLookup.search || '';
      refreshPlayers(false);
      if (![...player.options].some(option => option.value === restoreLookup.player) && selectedLookupHistory) {
        playerSearch.value = selectedLookupHistory.player;
        refreshPlayers(false);
      }
    }
    if ([...player.options].some(option => option.value === restoreLookup.player)) {
      player.value = restoreLookup.player;
      refreshCutoffs();
    }
  } else if (savedCareer.status === 'loaded') {
    const saved = savedCareer.recipe;
    const savedHistory = eligibleHistories.find(history => history.playerId === saved.targetPlayerRef);
    const savedTeam = saved.playerListTeamCode ?? saved.selection?.teamCodes?.[0]
      ?? savedHistory?.teamHistory?.find(row => row.seasonStartYear === saved.selection?.asOfSeasonStartYear)?.teams?.[0] ?? '';
    const savedYear = savedHistory?.teamHistory?.find(row => row.seasonStartYear === saved.selection?.asOfSeasonStartYear
      && row.teams.includes(savedTeam))?.seasonStartYear
      ?? savedHistory?.teamHistory?.find(row => row.teams.includes(savedTeam))?.seasonStartYear;
    if (savedYear && [...seasonFilter.options].some(option => Number(option.value) === savedYear)) {
      seasonFilter.value = String(savedYear);
      refreshTeams();
    }
    if ([...teamFilter.options].some(option => option.value === savedTeam)) teamFilter.value = savedTeam;
    refreshPlayers(false);
    if ([...player.options].some(option => option.value === saved.targetPlayerRef)) player.value = saved.targetPlayerRef;
    refreshCutoffs();
    if (saved.selection?.asOfSeasonStartYear != null
      && [...cutoff.options].some(option => Number(option.value) === Number(saved.selection.asOfSeasonStartYear))) {
      cutoff.value = String(saved.selection.asOfSeasonStartYear);
      refreshCutoffState();
    }
    if ([...progression.options].some(option => option.value === saved.progression)) progression.value = saved.progression;
    const savedHorizon = saved.plannedHorizon ?? saved.horizon;
    if ([...horizon.options].some(option => Number(option.value) === Number(savedHorizon))) horizon.value = String(savedHorizon);
    if ([...repeats.options].some(option => Number(option.value) === Number(saved.repeats))) repeats.value = String(saved.repeats);
    seed.value = saved.seed || '';
    if (Array.isArray(saved.progressionBySeason) && saved.progressionBySeason.length) {
      saved.progressionBySeason.forEach(policy => {
        journeyPolicy.value = policy;
        journeyRun.click();
      });
      status.textContent = journey?.policies.length === saved.progressionBySeason.length
        ? `Saved season choices restored · replay seed ${saved.seed}. Review the modeled checkpoints before choosing the next season.`
        : `Saved season choices could not be replayed: ${journeyStatus.textContent}`;
    } else {
      status.textContent = `Saved career recipe restored · replay seed ${saved.seed}. Review the cutoff and simulate to replay.`;
    }
  } else if (savedCareer.status === 'unavailable') {
    status.textContent = 'Local save unavailable; runs can still be replayed from the displayed seed.';
  }
  nextPolicyButton.addEventListener('click', () => {
    if (!simulationAvailable || !lastExperiment) return;
    const policies = [...progression.options].map(option => option.value);
    const currentIndex = policies.indexOf(progression.value);
    const next = policies.slice(currentIndex + 1).concat(policies.slice(0, currentIndex + 1))
      .find(policy => !testedPolicies.has(policy));
    if (!next) return;
    progression.value = next;
    seed.value = lastExperiment.report.seed;
    experimentProgress.textContent = `Experiment ${experimentCount + 1} · Testing ${progression.value} with the same recorded cutoff and seed ${seed.value}.`;
    form.requestSubmit();
  });
  const resetForSetupChange = event => {
    if (event?.target === progression) {
      experimentProgress.textContent = `Experiment ${experimentCount + 1} · ${progression.value} selected. Simulate to compare with the previous policy.`;
      return;
    }
    resetJourney();
    lastReport = null;
    lastExperiment = null;
    experimentCount = 0;
    testedPolicies.clear();
    policyResults.clear();
    goalMetric.disabled = !simulationAvailable;
    experimentGoal.textContent = 'Goal · Compare four policies from one recorded cutoff and replay seed.';
    nextPolicyButton.hidden = true;
    experimentProgress.textContent = 'Experiment 1 · Setup changed. Simulate from this recorded cutoff.';
    resultRoot.replaceChildren();
    sessionHud?.session.reset('Setup changed. Confirm the cutoff and run again when ready.');
  };
  form.addEventListener('input', resetForSetupChange);
  form.addEventListener('change', resetForSetupChange);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!simulationAvailable) {
      status.textContent = 'Conditional career simulation is unavailable in this view.';
      return;
    }
    try {
      const resolvedSeed = resolveSimulationSeed(seed.value, 'career-sim');
      const history = dataset.histories.find(item => item.playerId === player.value);
      if (!history) fail('Choose a player with recorded history.');
      const asOfSeasonStartYear = Number(cutoff.value);
      const targetTimeline = buildCareerTimeline(history.profiles, { asOfSeasonStartYear });
      const target = careerState(targetTimeline, null, null);
      const comparableHistories = chooseCareerHistories(dataset.histories.filter(item => item.playerId !== history.playerId), targetTimeline, asOfSeasonStartYear, target.experience);
      const cohort = buildCareerCohort({ targetPlayerId: history.playerId, targetState: target, histories: comparableHistories, asOfSeasonStartYear });
      sessionHud?.session.begin('run', { step: 2, feedback: 'Career path is running from the selected cutoff and comparison group.' });
      const report = simulateCareer({ timeline: targetTimeline, targetPlayerId: history.playerId, asOfSeasonStartYear, asOfState: target, cohort, progression: progression.value, horizon: Number(horizon.value), repeats: Number(repeats.value), seed: resolvedSeed.seed });
      const careerPackage = packageRef(dataset.proof, true);
      const careerScope = dataset.proof?.package?.scope;
      const careerSelection = careerScope ? {
        seasonStartYears: careerScope.seasonStartYears,
        phase: PHASE,
        asOfSeasonStartYear,
        teamCodes: null,
        asOfAge: target.age,
        asOfExperience: target.experience,
        acceptedPooledPackage: true,
      } : null;
      const careerReceipt = buildPublicCareerSimulationReceipt(report, {
        packageRef: careerPackage,
        selection: careerSelection,
      });
      const recipe = buildCareerSimulationRecipe({
        packageRef: careerPackage,
        selection: careerSelection,
        playerListTeamCode: teamFilter.value || null,
        targetPlayerRef: history.playerId,
        progression: progression.value,
        workload: { mode: 'observed' },
        horizon: Number(horizon.value),
        repeats: Number(repeats.value),
        seed: resolvedSeed.seed,
      });
      seed.value = resolvedSeed.seed;
      let recipeSaved = false;
      try {
        if (storage) {
          saveCareerSimulationRecipe(storage, CAREER_STORAGE_KEY, recipe);
          recipeSaved = true;
        }
      } catch { /* Keep the computed result available when local storage is full or blocked. */ }
      publishSwishIqLabHandoff('career', careerReceipt);
      lastReport = report;
      const experimentKey = JSON.stringify({ player: history.playerId, cutoff: asOfSeasonStartYear,
        age: target.age, experience: target.experience, horizon: Number(horizon.value),
        repeats: Number(repeats.value), seed: resolvedSeed.seed });
      if (lastExperiment && lastExperiment.key !== experimentKey) {
        testedPolicies.clear();
        policyResults.clear();
        experimentCount = 0;
      }
      const priorExperiment = lastExperiment?.key === experimentKey ? lastExperiment : null;
      const feedback = careerRoundFeedback(priorExperiment?.report, report);
      if (report.status === 'complete') {
        testedPolicies.add(progression.value);
        policyResults.set(progression.value, report);
        experimentCount = testedPolicies.size;
        const goalChange = feedback?.changes.find(item => item.metric === goalMetric.value)?.change;
        const outcome = modeledCareerHorizonP50(report, goalMetric.value);
        const best = [...policyResults.entries()]
          .map(([policy, candidate]) => ({ policy, value: modeledCareerHorizonP50(candidate, goalMetric.value) }))
          .filter(item => Number.isFinite(item.value)).sort((left, right) => right.value - left.value)[0];
        goalMetric.disabled = true;
        experimentGoal.textContent = `Goal · Find the highest conditional horizon P50 ${goalMetric.selectedOptions[0]?.textContent || goalMetric.value} across four policies.`;
        experimentProgress.textContent = `Experiment ${experimentCount} of ${progression.options.length} · ${progression.value} P50 ${formatCareerDisplayValue(outcome)}${priorExperiment ? ` · previous ${priorExperiment.policy} ${formatCareerDisplayValue(modeledCareerHorizonP50(priorExperiment.report, goalMetric.value))}${Number.isFinite(goalChange) ? ` (${goalChange >= 0 ? '+' : ''}${formatValue(goalChange, 1)})` : ''}` : ''} · best ${best ? `${best.policy} ${formatCareerDisplayValue(best.value)}` : 'unavailable'}. Conditional model comparison; recorded history is unchanged.${experimentCount === progression.options.length ? ' All policies explored; replay or reset for another cutoff.' : ''}`;
        nextPolicyButton.hidden = experimentCount === progression.options.length;
        lastExperiment = { key: experimentKey, policy: progression.value, report };
      } else {
        experimentProgress.textContent = `Experiment ${experimentCount + 1} unavailable · ${careerUserFacingCopy(report.reason, 'No conditional path was returned.')}`;
      }
      sessionHud?.updateProvenance({
        scope: 'Combined career history',
        cutoff: formatCareerCutoffReceipt(target, asOfSeasonStartYear),
        output: `${report.repeats || 0} seeded path${report.repeats === 1 ? '' : 's'} · seed ${report.seed || 'Unavailable'}`,
      });
      if (report.status === 'complete') sessionHud?.session.complete('Career Lab complete. Compare the recorded cutoff with the conditional modeled path.');
      else sessionHud?.session.fail(careerUserFacingCopy(report.reason, 'The career path is unavailable for this cutoff.'));
      status.textContent = `${report.status === 'complete' ? `Simulation complete: ${report.repeats} seeded paths · ${resolvedSeed.generated ? `new seed ${resolvedSeed.seed}` : `replay seed ${resolvedSeed.seed}`}.` : careerUserFacingCopy(report.reason, 'Simulation is unavailable for this cutoff.')}${recipeSaved ? ' Saved for replay.' : ' Local save unavailable; replay with the displayed seed.'}`;
      renderCareerResult(documentRef, resultRoot, report, cohort, targetTimeline);
    } catch (error) {
      sessionHud?.session.fail(careerUserFacingCopy(error?.message, 'Career simulation could not start.'));
      status.textContent = careerUserFacingCopy(error?.message, 'Career simulation could not start.');
      resultRoot.replaceChildren();
    }
  });
}

function renderCareerYearByYear(documentRef, timeline) {
  const rows = (timeline?.rows || []).map(row => {
    if (row.status !== 'observed') {
      return [row.season, 'No recorded row', 'Unavailable', 'Unavailable', 'Unavailable', 'Unavailable', 'Unavailable', 'Unavailable'];
    }
    const minutesPerGame = row.games > 0 && finite(row.minutes) ? row.minutes / row.games : null;
    return [
      row.season,
      'Recorded',
      row.teams.join(', ') || 'All teams',
      row.games,
      formatValue(minutesPerGame, 1),
      formatValue(row.perGame?.points, 1),
      formatValue(row.perGame?.assists, 1),
      formatValue(row.perGame?.rebounds, 1),
    ];
  });
  const table = renderTable(documentRef, 'Year-by-year recorded stats', [
    'Season', 'Status', 'Team context', 'Games', 'Minutes/game', 'Points/game', 'Assists/game', 'Rebounds/game',
  ], rows);
  table.classList.add('swishiq-career-history-table');
  return table;
}

function renderCareerResult(documentRef, root, report, cohort, timeline) {
  const cutoffYear = timeline?.asOf?.seasonStartYear;
  const cutoffLabel = integer(cutoffYear) ? labelSeason(cutoffYear) : 'selected cutoff';
  const heading = el(documentRef, 'div', undefined, 'swishiq-career-result__heading');
  const resultNote = report.status === 'complete'
    ? 'Modeled values are conditional scenarios, not forecasts.'
    : 'Recorded history is available; no modeled path is ready for this cutoff.';
  heading.append(
    el(documentRef, 'h3', report.status === 'complete' ? 'Career Lab result' : 'Career Lab · recorded history'),
    el(documentRef, 'p', resultNote, 'swishiq-advanced-muted'),
  );
  root.replaceChildren(heading);
  const recordedSection = el(documentRef, 'section', undefined, 'swishiq-career-result__recorded');
  recordedSection.append(
    el(documentRef, 'span', 'Recorded history', 'swishiq-career-result__eyebrow'),
    el(documentRef, 'h4', 'Observed history'),
  );
  const recordedRows = renderCareerYearByYear(documentRef, timeline);
  const recordedDetails = el(documentRef, 'details', undefined, 'swishiq-career-result__table-details');
  recordedDetails.append(
    el(documentRef, 'summary', 'Review year-by-year statistics'),
    recordedRows,
  );
  recordedSection.append(recordedDetails);
  if (report.status !== 'complete') {
    root.append(recordedSection);
    const unavailable = el(documentRef, 'section', undefined, 'swishiq-career-result__future');
    unavailable.append(
      el(documentRef, 'span', 'Conditional future', 'swishiq-career-result__eyebrow'),
      el(documentRef, 'h4', 'Unavailable for this cutoff'),
      el(documentRef, 'p', careerUserFacingCopy(report.reason, 'A future distribution was not generated for this cutoff.'), 'swishiq-career-state-help'),
    );
    if (report.seed) unavailable.append(el(documentRef, 'p', `Replay seed · ${report.seed}`, 'swishiq-advanced-muted'));
    root.append(unavailable);
    return;
  }
  const trajectory = ['points', 'assists', 'rebounds', 'minutesPerGame', 'games'].map(metricName => {
    const rows = report.trajectories?.[metricName] || [];
    const latest = rows.at(-1);
    return [metricName, latest ? `${labelSeason(latest.seasonStartYear)} · P10 ${formatValue(latest.quantiles?.[10])} / P50 ${formatValue(latest.quantiles?.[50])} / P90 ${formatValue(latest.quantiles?.[90])}` : 'Unavailable'];
  });
  const futureSection = el(documentRef, 'section', undefined, 'swishiq-career-result__future');
  futureSection.append(
    el(documentRef, 'span', 'Conditional future', 'swishiq-career-result__eyebrow'),
    el(documentRef, 'h4', `${report.repeats || 0} seeded paths · ${report.horizon || 'selected'}-season horizon`),
    el(documentRef, 'p', `Modeled from the ${cutoffLabel} state under the selected progression policy. Replay seed: ${report.seed || 'Unavailable'}.`, 'swishiq-advanced-muted'),
  );
  const observedAtCutoff = [...(timeline?.rows || [])].reverse().find(row => row.status === 'observed');
  const modeledAtHorizon = report.trajectories?.points?.at(-1);
  const observedLabel = observedAtCutoff ? labelSeason(observedAtCutoff.seasonStartYear) : 'Unavailable';
  const modeledLabel = modeledAtHorizon ? labelSeason(modeledAtHorizon.seasonStartYear) : 'Unavailable';
  futureSection.append(renderTable(documentRef, 'Recorded and modeled per-game comparison', [
    'Measure', `Recorded · ${observedLabel}`, `Modeled P50 · ${modeledLabel}`,
  ], [
    ['Points per game', formatCareerDisplayValue(observedAtCutoff?.perGame?.points), formatCareerDisplayValue(modeledAtHorizon?.quantiles?.[50])],
    ['Assists per game', formatCareerDisplayValue(observedAtCutoff?.perGame?.assists), formatCareerDisplayValue(report.trajectories?.assists?.at(-1)?.quantiles?.[50])],
    ['Rebounds per game', formatCareerDisplayValue(observedAtCutoff?.perGame?.rebounds), formatCareerDisplayValue(report.trajectories?.rebounds?.at(-1)?.quantiles?.[50])],
  ]));
  const trajectoryTable = renderTable(documentRef, 'Modeled future distribution', ['Measure', 'P10 / P50 / P90 at horizon'], trajectory);
  const trajectoryDetails = el(documentRef, 'details', undefined, 'swishiq-career-result__table-details');
  trajectoryDetails.append(el(documentRef, 'summary', 'Review modeled ranges by measure'), trajectoryTable);
  futureSection.append(trajectoryDetails);
  const modelLimits = el(documentRef, 'details', undefined, 'swishiq-career-result__provenance');
  const exposureExclusions = (Array.isArray(cohort?.skipped) ? cohort.skipped : [])
    .filter(item => typeof item?.reason === 'string' && item.reason.includes('observed season exposure exceeds'));
  modelLimits.append(
    el(documentRef, 'summary', 'Comparison sample and model limits'),
    el(documentRef, 'p', `${cohort.comparables.length} comparable histories and ${cohort.transitions.length} transitions were used. The scenario requires recorded age and experience at the selected cutoff.`, 'swishiq-advanced-muted'),
  );
  if (exposureExclusions.length) {
    const excludedDetails = el(documentRef, 'details', undefined, 'swishiq-career-result__excluded');
    excludedDetails.append(el(documentRef, 'summary', `Review ${exposureExclusions.length} excluded comparator histories (over 90 games)`));
    const excludedList = el(documentRef, 'ul');
    exposureExclusions.forEach(item => {
      const seasons = (Array.isArray(item.excludedRows) ? item.excludedRows : [])
        .map(row => `${labelSeason(row.seasonStartYear)} · ${row.games} observed games`)
        .join('; ');
      excludedList.append(el(documentRef, 'li', `${item.player || 'Comparator'} · ${seasons || 'season exposure unavailable'} · ${item.reason}`));
    });
    excludedDetails.append(excludedList);
    modelLimits.append(excludedDetails);
  }
  futureSection.append(modelLimits);
  root.append(futureSection, recordedSection);
}

export function startSwishIqAdvancedLabs({ documentRef = globalThis.document, fetchImpl = globalThis.fetch?.bind(globalThis), registryUrl = SWISHIQ_ADVANCED_REGISTRY_URL } = {}) {
  if (!documentRef) return null;
  const composite = mountComposite({ documentRef, registryUrl, fetchImpl });
  const career = mountCareer({ documentRef, registryUrl, fetchImpl });
  const activate = () => {
    const activeWorkbench = documentRef.querySelector('.swishiq-tabs button[aria-pressed="true"]')?.dataset.workbench || '';
    if (activeWorkbench === 'composite') return composite?.reload?.();
    if (activeWorkbench === 'career') return career?.reload?.();
    return null;
  };
  return Object.freeze({ composite, career, activate });
}

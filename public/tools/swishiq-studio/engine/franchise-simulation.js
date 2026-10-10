/*
 * SwishIQ Franchise Simulation
 *
 * This is the persistent, browser-safe league layer for Season Lab.  It uses
 * only public season payloads and derived simulation attributes.  The derived
 * ratings are inputs to a reproducible scenario; they are not subjective
 * grades, player valuations, or private package metrics.
 */

import { classifyNbaTeam } from './nba-schedule-source.js?v=20260920c&rev=structure-v1';
import { FRANCHISE_CPU_ROTATION_VERSION, planCpuFranchiseRotation } from './franchise-cpu-rotation.js?v=20260928i&rev=franchise-cpu-rotation-v4-phase11-receipts-20260928i';

export const FRANCHISE_SIMULATION_MODEL_VERSION = 'swishiq-franchise-simulation-v9';
const LEGACY_FRANCHISE_SIMULATION_MODEL_VERSIONS = new Set([
  'swishiq-franchise-simulation-v7', 'swishiq-franchise-simulation-v8',
]);
export const FRANCHISE_STATE_FORMAT = 'djhc-franchise-league-v1';
export const FRANCHISE_STORAGE_KEY = 'djhc:swishiq:franchise:v5';
export const FRANCHISE_MAX_STORAGE_CHARACTERS = 1_500_000;
export const FRANCHISE_BOX_SCORE_MODEL_VERSION = 'observed-baseline-scaled-relative-usage-v4';
export const FRANCHISE_OVERTIME_MODEL_VERSION = 'full-period-repeat-until-decision-v1';
export const FRANCHISE_MINUTES_MODEL_VERSION = 'observed-position-rotation-capped-overtime-v3';
export const FRANCHISE_RELATIVE_USAGE_MODEL_VERSION = 'player-relative-usage-share-v1';

const MAX_TEAMS = 30;
const MAX_ROSTER = 20;
const MAX_OVERTIME_PERIODS = 100;
const FRANCHISE_OVERTIME_MINUTES = 5;
const PLAYER_ID = /^p_[a-f0-9]{32}$/;
const SAFE_ID = /^[a-zA-Z0-9._:-]{1,120}$/;
const FRANCHISE_DEFENSE_STRENGTH_CONVENTION = 'higher-is-better-strength';
const FRANCHISE_NET_STRENGTH_CONVENTION = 'centered-offense-plus-defense-strength-at-80-v1';
const NATIVE_POINTS_PER_100_REFERENCE = 100;
const NATIVE_DEFENSE_CONVENTION = 'lower-is-better-points-allowed-per-100';
const STAT_KEYS = Object.freeze(['points', 'assists', 'rebounds', 'turnovers', 'steals', 'blocks']);
const POSITION_ORDER = Object.freeze(['G', 'F', 'C']);
const FRANCHISE_ROLE_MINUTES = Object.freeze({ G: 96, F: 96, C: 48 });
const POSITION_ROLE = Object.freeze({
  G: 'G', GUARD: 'G', PG: 'G', 'POINT GUARD': 'G', SG: 'G', 'SHOOTING GUARD': 'G',
  F: 'F', FORWARD: 'F', SF: 'F', 'SMALL FORWARD': 'F', PF: 'F', 'POWER FORWARD': 'F',
  C: 'C', CENTER: 'C', CENTRE: 'C',
});
const PLAYOFF_SERIES_LENGTHS = Object.freeze([1, 3, 5, 7]);
const SCHEDULE_KINDS = Object.freeze(['actual', 'generated']);
const FOUR_FACTOR_DEFAULTS = Object.freeze({
  offense: Object.freeze({ effectiveFieldGoal: 0.53, freeThrowAttemptRate: 0.22, offensiveReboundRate: 0.28, turnoverRate: 0.13 }),
  defense: Object.freeze({ opponentEffectiveFieldGoal: 0.53, opponentFreeThrowAttemptRate: 0.22, defensiveReboundRate: 0.70, opponentTurnoverRate: 0.13 }),
});
const FOUR_FACTOR_WEIGHTS = Object.freeze({ effectiveFieldGoal: 0.40, freeThrowAttemptRate: 0.15, offensiveReboundRate: 0.20, turnoverRate: 0.25 });
const FOUR_FACTOR_SCALES = Object.freeze({ effectiveFieldGoal: 0.05, freeThrowAttemptRate: 0.05, offensiveReboundRate: 0.05, turnoverRate: 0.03 });
const FRANCHISE_NET_MATCHUP_SCALE = 0.32;
const FRANCHISE_FOUR_FACTOR_MATCHUP_SCALE = 0.9;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, digits = 3) => {
  const scale = 10 ** digits;
  return Math.round((Number(value) || 0) * scale) / scale;
};
const integer = (value, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
// Number(null) is zero, but a missing native metric is not an observed zero.
// Keep coercion for numeric strings while rejecting absent/blank descriptors so
// Four-Factor coverage and native denominator guards remain truthful.
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const text = (value, fallback = '') => String(value ?? fallback).trim();
const deepClone = value => JSON.parse(JSON.stringify(value));

function emptyTeamStats() {
  return Object.fromEntries(STAT_KEYS.map(key => [key, 0]));
}

function sumBoxStats(boxes) {
  return Object.fromEntries(STAT_KEYS.map(key => [key,
    (Array.isArray(boxes) ? boxes : []).reduce((sum, row) => sum + Math.max(0, Number(row?.[key]) || 0), 0)]));
}

function reconcileBoxStats(target, boxes) {
  const hasRows = Array.isArray(boxes) && boxes.length > 0;
  const sums = sumBoxStats(boxes);
  return {
    totals: sums,
    status: hasRows ? (sums.points === Number(target) ? 'reconciled' : 'mismatch') : 'unavailable',
    byStat: Object.fromEntries(STAT_KEYS.map(key => ({
      key,
      target: key === 'points' ? Number(target) : null,
      sum: sums[key],
      status: !hasRows ? 'unavailable' : key === 'points' ? (sums[key] === Number(target) ? 'reconciled' : 'mismatch') : 'reported',
      delta: hasRows && key === 'points' ? sums[key] - Number(target) : null,
    })).map(item => [item.key, item])),
  };
}

function stableHash(input) {
  let hash = 2166136261;
  for (const character of String(input)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function seedNumber(seed) {
  const hash = stableHash(seed);
  return Number.parseInt(hash, 16) >>> 0 || 1;
}

function createRandom(seed, savedState = null) {
  let value = savedState === null ? seedNumber(seed) : savedState >>> 0;
  const random = () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  random.state = () => value;
  return random;
}

function normal(random, mean = 0, deviation = 1) {
  const u = Math.max(Number.EPSILON, random());
  const v = Math.max(Number.EPSILON, random());
  return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)] ?? null;
}

function safePlayerId(value, name, teamId, season) {
  const candidate = text(value);
  if (PLAYER_ID.test(candidate)) return candidate;
  return `p_local_${stableHash(`${name}|${teamId}|${season}`).padStart(8, '0')}`;
}

function publicPackageRefs(payload, seasonStartYear) {
  const refs = [];
  for (const value of [payload?.packageRef, ...(Array.isArray(payload?.packageRefs) ? payload.packageRefs : [])]) {
    if (!value || typeof value !== 'object') continue;
    const packageId = text(value.packageId);
    const packageVersion = text(value.packageVersion);
    if (packageId && packageVersion && !refs.some(ref => ref.packageId === packageId && ref.packageVersion === packageVersion)) {
      refs.push({ packageId, packageVersion, packageManifestSha256: text(value.packageManifestSha256) || null, seasonStartYear: Number(value.seasonStartYear ?? seasonStartYear) });
    }
  }
  return refs;
}

function numberFrom(source, keys, fallback = null) {
  for (const key of keys) {
    const raw = source?.[key];
    const value = raw && typeof raw === 'object' ? (raw.value ?? raw.numerator) : raw;
    if (finite(value)) return Number(value);
  }
  return fallback;
}

function rate(row, key) {
  return numberFrom(row?.perGame, [key]) ?? numberFrom(row?.stats, [key]) ?? numberFrom(row, [`${key}PerGame`, key]);
}

function deriveRatings(row) {
  const points = clamp(rate(row, 'points'), 0, 45);
  const assists = clamp(rate(row, 'assists'), 0, 16);
  const rebounds = clamp(rate(row, 'rebounds'), 0, 25);
  const steals = clamp(rate(row, 'steals'), 0, 6);
  const blocks = clamp(rate(row, 'blocks'), 0, 8);
  const turnovers = clamp(rate(row, 'turnovers'), 0, 8);
  const minutes = clamp(row?.minutes && row?.games ? Number(row.minutes) / Math.max(1, Number(row.games)) : 0, 0, 48);
  const shooting = clamp((numberFrom(row?.metrics, ['trueShootingPercentage']) ?? numberFrom(row, ['trueShootingPercentage']) ?? 0.5) * 100, 20, 80);
  return {
    scoring: round(clamp(48 + points * 1.5 + minutes * 0.45, 35, 99)),
    shooting: round(clamp(35 + shooting * 0.7 + points * 0.25, 35, 99)),
    creation: round(clamp(42 + points * 0.75 + assists * 2.2 - turnovers * 1.4, 30, 99)),
    playmaking: round(clamp(40 + assists * 3.2 - turnovers * 1.5, 30, 99)),
    rebounding: round(clamp(40 + rebounds * 2.4, 30, 99)),
    defense: round(clamp(44 + steals * 4 + blocks * 3 + rebounds * 0.35, 30, 99)),
    durability: round(clamp(38 + (clamp(row?.games, 0, 90) / 82) * 55, 20, 96)),
  };
}

function normalizeAge(value) {
  // A zero/null age is a missing denominator, not a 16-year-old player.  Do
  // not let a placeholder age quietly drive potential, retirement, or growth.
  if (!finite(value) || Number(value) <= 0) return null;
  return clamp(Number(value), 16, 50);
}

function normalizeExperience(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  return finite(value) && integer(value, 0, 50) ? Number(value) : null;
}

function normalizePlayer(row, teamId, seasonStartYear, index = 0) {
  const name = text(row?.playerName || row?.player || row?.displayName, `Player ${index + 1}`);
  const id = safePlayerId(row?.playerRef || row?.id, name, teamId, seasonStartYear);
  const positionValues = [...(Array.isArray(row?.positions) ? row.positions : []), row?.position];
  const positions = [...new Set(positionValues.flatMap(value => text(value).toUpperCase().split(/[\/,]/)
    .map(role => POSITION_ROLE[role.trim()] || null).filter(Boolean)))];
  const position = positions[0] || null;
  const games = integer(Number(row?.games), 0, 300) ? Number(row.games) : 0;
  const age = normalizeAge(row?.age);
  const ratings = deriveRatings(row);
  const experience = normalizeExperience(row?.experience);
  const potential = finite(row?.scenario?.potential) && Number(row.scenario.potential) >= 0 && Number(row.scenario.potential) <= 100
    ? Number(row.scenario.potential) : null;
  const declaredContract = row?.scenario?.contract;
  const contractYears = integer(declaredContract?.yearsRemaining, 1, 10) && declaredContract?.yearsRemaining != null
    ? Number(declaredContract.yearsRemaining) : null;
  const contractSalary = finite(declaredContract?.salary) && Number(declaredContract.salary) >= 0
    ? Number(declaredContract.salary) : null;
  const durability = ratings.durability;
  // Preserve the distinction between an observed zero and a missing source
  // metric.  The season ledger needs numeric zeros for safe arithmetic, but
  // game-level production must be able to fall back to the player's modeled
  // style when a package omitted one stat rather than reporting zero.
  const baselinePerGame = Object.fromEntries(STAT_KEYS.map(key => {
    const value = rate(row, key);
    return [key, value === null ? null : round(value)];
  }));
  const stats = Object.fromEntries(STAT_KEYS.map(key => [key, baselinePerGame[key] === null ? 0 : baselinePerGame[key]]));
  const baselineGames = Math.max(1, games);
  const baselineMinutesPerGame = Number.isFinite(Number(row?.minutes)) && Number(row.minutes) > 0
    ? Number(row.minutes) / baselineGames : null;
  return {
    playerRef: id,
    displayName: name,
    teamId,
    position,
    positions,
    age,
    ageSource: age === null ? 'unavailable' : 'published-season-row',
    experience,
    potential,
    potentialSource: potential === null ? 'unavailable' : 'declared-scenario-input',
    durability,
    ratings,
    tendencies: {
      usage: round(clamp(0.35 + stats.points / 45 + ratings.creation / 500, 0.2, 1)),
      threePoint: round(clamp(numberFrom(row?.metrics, ['threePointPercentage']) ?? 0.34, 0.05, 0.65)),
      passFirst: round(clamp(0.35 + stats.assists / 20 - stats.points / 80, 0.05, 0.9)),
      defensiveActivity: round(clamp((stats.steals + stats.blocks) / 8, 0.05, 0.95)),
    },
    contract: { yearsRemaining: contractYears, salary: contractSalary, status: 'active', source: contractYears === null && contractSalary === null ? 'unavailable' : 'declared-scenario-input' },
    baselinePerGame,
    baselineGames: games,
    baselineMinutesPerGame: baselineMinutesPerGame === null ? null : round(baselineMinutesPerGame, 4),
    seasonStats: { games, minutes: round(Number(row?.minutes) || 0), ...stats },
    gameLogs: [],
    development: { lastSeason: seasonStartYear, source: 'derived-public-season-context' },
    status: 'active',
  };
}

function normalizeRoster(payload, teamId, seasonStartYear, scope = 'exact-season') {
  const profiles = payload?.seasonProfiles && typeof payload.seasonProfiles === 'object' ? payload.seasonProfiles : {};
  const rows = [];
  for (const entries of Object.values(profiles)) {
    if (!Array.isArray(entries)) continue;
    // Exact-season requests may only use a row keyed to that season.  Falling
    // back to entries[0] here can silently pull a different year from a
    // pooled/multi-season payload.  An explicit pooled request is the only
    // path where a bounded first row is acceptable.
    const row = entries.find(item => Number(item?.seasonStartYear) === Number(seasonStartYear))
      || (scope === 'pooled-window' ? entries[0] : null);
    if (row) rows.push(row);
  }
  const declared = Array.isArray(payload?.roster?.players) ? payload.roster.players : [];
  for (const row of declared) rows.push(row);
  const players = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    const player = normalizePlayer(row, teamId, seasonStartYear, index);
    if (!seen.has(player.playerRef)) { seen.add(player.playerRef); players.push(player); }
  });
  // Exact public snapshots can include more than the scenario's 20-player
  // roster limit. Source object order is not meaningful; retain the strongest
  // observed minute evidence first when trimming, then use stable references
  // for final roster order so rotation RNG and seeded games replay identically.
  const compareRefs = (left, right) => left.playerRef < right.playerRef ? -1 : left.playerRef > right.playerRef ? 1 : 0;
  if (players.length > MAX_ROSTER) {
    players.sort((left, right) => (right.baselineMinutesPerGame ?? -1) - (left.baselineMinutesPerGame ?? -1)
      || compareRefs(left, right));
    players.length = MAX_ROSTER;
  }
  return players.sort(compareRefs);
}

function readNativeFactor(descriptor) {
  if (descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor)) {
    const status = text(descriptor.status).toLowerCase();
    if (['projected', 'forecast', 'unavailable', 'missing'].includes(status)) return null;
    if (finite(descriptor.value)) return Number(descriptor.value);
  }
  return finite(descriptor) ? Number(descriptor) : null;
}

function validNativeFactor(key, value) {
  if (!finite(value)) return null;
  const upper = key === 'freeThrowAttemptRate' || key === 'opponentFreeThrowAttemptRate' ? 1.5 : 1;
  return Number(value) >= 0 && Number(value) <= upper ? Number(value) : null;
}

function nativeFourFactors(metrics) {
  const source = metrics?.fourFactors;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const side = (name, keys) => Object.fromEntries(keys.map(key => [key, validNativeFactor(key, readNativeFactor(source[name]?.[key]))]));
  const offense = side('offense', Object.keys(FOUR_FACTOR_DEFAULTS.offense));
  const defense = side('defense', Object.keys(FOUR_FACTOR_DEFAULTS.defense));
  const values = [...Object.values(offense), ...Object.values(defense)];
  const observed = values.filter(value => finite(value)).length;
  if (!observed) return null;
  return {
    offense, defense,
    coverage: round(observed / values.length),
    status: observed === values.length ? 'observed' : 'partial',
    defenseConvention: text(source.defenseConvention) || null,
  };
}

function nativeTeamMetrics(payload, seasonStartYear) {
  const profiles = Array.isArray(payload?.nativeProfiles) ? payload.nativeProfiles : [];
  const profile = profiles.find(item => Number(item?.seasonStartYear) === Number(seasonStartYear)
    && text(item?.phase || 'regular').toLowerCase() === 'regular');
  const metrics = profile?.metrics;
  const value = key => {
    const metric = metrics?.[key];
    return metric?.status === 'available' && finite(metric.value) ? Number(metric.value) : null;
  };
  const offense = value('offense'), defense = value('defense'), net = value('net');
  if (offense === null || defense === null || net === null || Math.abs((offense - defense) - net) > 0.011) return null;
  const bounded = (candidate, min, max) => candidate === null || (candidate >= min && candidate <= max) ? candidate : null;
  const denominator = key => finite(metrics?.[key]?.denominator) && Number(metrics[key].denominator) > 0
    ? Number(metrics[key].denominator) : null;
  const ppgDenominator = metrics?.pointsPerGame?.denominator;
  const games = integer(Number(profile?.games), 1, 300)
    ? Number(profile.games)
    : integer(Number(ppgDenominator), 1, 300) ? Number(ppgDenominator) : null;
  const fourFactors = nativeFourFactors(metrics);
  return {
    seasonStartYear: Number(seasonStartYear), phase: 'regular', offense: round(offense, 6), defense: round(defense, 6), net: round(net, 6),
    defenseConvention: NATIVE_DEFENSE_CONVENTION,
    pace48: bounded(value('pace48'), 70, 130), pointsPerGame: bounded(value('pointsPerGame'), 70, 160), pointsAllowedPerGame: bounded(value('pointsAllowedPerGame'), 70, 160),
    games, offensePossessions: denominator('offense'), defensePossessions: denominator('defense'), fourFactors,
    evidence: 'native-team-style-observed',
  };
}

function factorValue(native, side, key, fallback) {
  const value = native?.fourFactors?.[side]?.[key];
  return finite(value) ? Number(value) : fallback;
}

function fourFactorBaselines(teams) {
  const result = { offense: {}, defense: {} };
  for (const side of ['offense', 'defense']) {
    for (const key of Object.keys(FOUR_FACTOR_DEFAULTS[side])) {
      let numerator = 0, denominator = 0;
      for (const team of teams) {
        const value = team.nativeMetrics?.fourFactors?.[side]?.[key];
        if (!finite(value)) continue;
        const weight = Math.max(1, Number(team.nativeMetrics?.games) || 1);
        numerator += Number(value) * weight;
        denominator += weight;
      }
      result[side][key] = denominator > 0 ? numerator / denominator : FOUR_FACTOR_DEFAULTS[side][key];
    }
  }
  return result;
}

function nativeFactorQuality(native, baselines) {
  // Match the native net guard: a factor row without a defensible observed
  // game denominator must not re-enter the matchup through a side channel.
  if (!native || !(Number(native.games) > 0)) {
    return { offense: 0, defense: 0, composite: 0, coverage: { offense: 0, defense: 0 }, status: 'unavailable', details: {} };
  }
  const qualities = {};
  for (const side of ['offense', 'defense']) {
    const contributions = [];
    for (const key of Object.keys(FOUR_FACTOR_DEFAULTS[side])) {
      const value = factorValue(native, side, key, null);
      if (!finite(value)) continue;
      const baseKey = key === 'opponentEffectiveFieldGoal' ? 'effectiveFieldGoal'
        : key === 'opponentFreeThrowAttemptRate' ? 'freeThrowAttemptRate'
          : key === 'defensiveReboundRate' ? 'offensiveReboundRate'
            : key === 'opponentTurnoverRate' ? 'turnoverRate' : key;
      const baseline = baselines?.[side]?.[key] ?? FOUR_FACTOR_DEFAULTS[side][key];
      const direction = key === 'turnoverRate' && side === 'offense' ? -1
        : key === 'opponentEffectiveFieldGoal' || key === 'opponentFreeThrowAttemptRate' ? -1
          : 1;
      const scale = FOUR_FACTOR_SCALES[baseKey];
      contributions.push({ key, quality: direction * (value - baseline) / scale, weight: FOUR_FACTOR_WEIGHTS[baseKey] });
    }
    const weight = contributions.reduce((sum, item) => sum + item.weight, 0);
    qualities[side] = {
      value: round(weight > 0 ? clamp(contributions.reduce((sum, item) => sum + item.quality * item.weight, 0) / weight, -3, 3) : 0),
      coverage: round(contributions.length / Object.keys(FOUR_FACTOR_DEFAULTS[side]).length),
      status: contributions.length === Object.keys(FOUR_FACTOR_DEFAULTS[side]).length ? 'observed' : contributions.length ? 'partial' : 'unavailable',
      contributions,
    };
  }
  return {
    offense: qualities.offense.value,
    defense: qualities.defense.value,
    composite: round(qualities.offense.value + qualities.defense.value),
    coverage: { offense: qualities.offense.coverage, defense: qualities.defense.coverage },
    status: qualities.offense.status === 'observed' && qualities.defense.status === 'observed' ? 'observed'
      : qualities.offense.status !== 'unavailable' || qualities.defense.status !== 'unavailable' ? 'partial' : 'unavailable',
    details: qualities,
  };
}

function nativeSampleWeight(native) {
  const games = Number(native?.games);
  if (!(finite(games) && games > 0)) return 0;
  const seasonCoverage = clamp(games / 82, 0, 1);
  const offenseExposure = Number(native?.offensePossessions);
  const defenseExposure = Number(native?.defensePossessions);
  const exposures = [offenseExposure, defenseExposure].filter(value => Number.isFinite(value) && value > 0);
  // When a package does not publish possession denominators, retain the
  // established games-based weighting but disclose that the exposure is
  // unreported.  If denominators are present, the harmonic exposure prevents
  // one well-covered component from masking a sparse offense or defense row.
  if (exposures.length < 2) return clamp(seasonCoverage * 0.65, 0, 0.65);
  const effectiveExposure = 2 / ((1 / offenseExposure) + (1 / defenseExposure));
  const denominatorCoverage = effectiveExposure / (effectiveExposure + 2000);
  return clamp(seasonCoverage * 0.65 * denominatorCoverage, 0, 0.65);
}

function teamStrength(team, baselines = null, rotationRows = null) {
  const rotationMinutes = Array.isArray(rotationRows)
    ? new Map(rotationRows.map(row => [row.player?.playerRef, Math.max(0, Number(row.minutes) || 0)]))
    : null;
  const usageRows = Array.isArray(rotationRows)
    ? rotationRows.map(row => [row.player?.playerRef, row.relativeUsage])
    : (Array.isArray(team.rotation) ? team.rotation : []).map(row => [row.playerRef, row.relativeUsage]);
  const relativeUsage = new Map(usageRows.map(([playerRef, value]) => {
    const numeric = Number(value);
    return [playerRef, Number.isFinite(numeric) ? clamp(numeric, 0.5, 1.5) : 1];
  }));
  const players = team.roster.filter(player => player.status !== 'waived' && player.status !== 'retired'
    && (!rotationMinutes || rotationMinutes.has(player.playerRef)));
  if (!players.length) {
    const native = team.nativeMetrics;
    if (native) {
      // Internal defense is a strength axis (higher is better), while the
      // native source defense field is points allowed per 100 (lower is
      // better). Center both source rates at 100 and invert only defense.
      const nativeWeight = nativeSampleWeight(native);
      if (!(nativeWeight > 0)) return { offense: 80, defense: 80, net: 0,
        defenseConvention: FRANCHISE_DEFENSE_STRENGTH_CONVENTION, netConvention: FRANCHISE_NET_STRENGTH_CONVENTION,
        pace: 100, pointsFor: null, pointsAgainst: null, source: 'roster-unavailable', nativeWeight: 0, nativeNet: null, fourFactors: native.fourFactors, factorQuality: nativeFactorQuality(native, baselines) };
      const offense = 80 + (native.offense - NATIVE_POINTS_PER_100_REFERENCE);
      const defense = 80 + (NATIVE_POINTS_PER_100_REFERENCE - native.defense);
      return {
        offense: round(offense), defense: round(defense), net: round(offense + defense - 160),
        defenseConvention: FRANCHISE_DEFENSE_STRENGTH_CONVENTION,
        netConvention: FRANCHISE_NET_STRENGTH_CONVENTION,
        pace: round(native.pace48 ?? 100), pointsFor: native.pointsPerGame ?? null,
        pointsAgainst: native.pointsAllowedPerGame ?? null, source: 'native-team-style',
        nativeWeight: round(nativeWeight), nativeNet: native.net, fourFactors: native.fourFactors,
        factorQuality: nativeFactorQuality(native, baselines),
      };
    }
    return { offense: 80, defense: 80, net: 0,
      defenseConvention: FRANCHISE_DEFENSE_STRENGTH_CONVENTION, netConvention: FRANCHISE_NET_STRENGTH_CONVENTION,
      pace: 100, pointsFor: null, pointsAgainst: null, source: 'roster-unavailable', nativeWeight: 0, nativeNet: null, fourFactors: null, factorQuality: nativeFactorQuality(null, baselines) };
  }
  let weights = rotationMinutes
    ? players.map(player => rotationMinutes.get(player.playerRef) || 0)
    : players.map(player => Math.max(0, Number(player.rotationMinutes ?? player.seasonStats?.minutes ?? 1)));
  if (!weights.some(value => value > 0)) weights = weights.map(() => 1);
  const total = weights.reduce((sum, value) => sum + value, 0);
  const offensiveWeights = players.map((player, index) => weights[index] * (relativeUsage.get(player.playerRef) || 1));
  const average = (key, playerWeights = weights) => players.reduce((sum, player, index) => sum + Number(player.ratings?.[key] || 50) * playerWeights[index], 0)
    / playerWeights.reduce((sum, value) => sum + value, 0);
  const playerOffense = average('scoring', offensiveWeights) * 0.4 + average('shooting', offensiveWeights) * 0.23
    + average('creation', offensiveWeights) * 0.2 + average('playmaking', offensiveWeights) * 0.17;
  const playerDefense = average('defense') * 0.68 + average('rebounding') * 0.22 + average('durability') * 0.1;
  const native = team.nativeMetrics;
  // Native team net is already on the same points-per-100 scale used by the
  // Season Lab matchup adapter. Blend it into the roster signal, then split
  // the correction across offense and defense so the game model cannot lose
  // a genuinely strong native team to a sparse player-rate heuristic.
  const nativeWeight = nativeSampleWeight(native);
  const nativeOffense = native ? 80 + (native.offense - NATIVE_POINTS_PER_100_REFERENCE) : playerOffense;
  const nativeDefense = native ? 80 + (NATIVE_POINTS_PER_100_REFERENCE - native.defense) : playerDefense;
  const offense = playerOffense * (1 - nativeWeight) + nativeOffense * nativeWeight;
  const defense = playerDefense * (1 - nativeWeight) + nativeDefense * nativeWeight;
  // Both internal axes are strengths: higher offense scores more, and higher
  // defense suppresses an opponent. Their centered sum is the net direction.
  const net = offense + defense - 160;
  return {
    offense: round(offense), defense: round(defense), net: round(net),
    defenseConvention: FRANCHISE_DEFENSE_STRENGTH_CONVENTION, netConvention: FRANCHISE_NET_STRENGTH_CONVENTION,
    pace: round(native?.pace48 ?? (96 + average('creation') * 0.06 + average('durability') * 0.02)),
    pointsFor: native?.pointsPerGame ?? null, pointsAgainst: native?.pointsAllowedPerGame ?? null,
    source: nativeWeight > 0 ? 'native-team-style+roster' : 'roster-derived', nativeWeight: round(nativeWeight), nativeNet: nativeWeight > 0 ? native?.net ?? null : null,
    fourFactors: native?.fourFactors || null, factorQuality: nativeFactorQuality(native, baselines),
  };
}

function reportedFactorQuality(quality, side) {
  const detail = quality?.details?.[side];
  return !detail || detail.status === 'unavailable' ? null : round(detail.value);
}

function gameRotationStrength(team, baselineStrength, rotationRows) {
  if (!Array.isArray(rotationRows) || rotationRows.length === 0) return baselineStrength;
  const strength = teamStrength(team, null, rotationRows);
  // Four-factor quality is already league-relative in the saved season rating;
  // keep that denominator while recalculating only the player mix used in this game.
  return { ...strength, factorQuality: baselineStrength.factorQuality || strength.factorQuality };
}

function allocateInteger(total, weights) {
  const target = Math.max(0, Math.round(Number(total) || 0));
  const safeWeights = weights.map(value => Math.max(0, Number(value) || 0));
  const sum = safeWeights.reduce((acc, value) => acc + value, 0);
  if (!safeWeights.length) return [];
  if (!(sum > 0)) safeWeights.fill(1);
  const base = safeWeights.reduce((acc, value) => acc + value, 0);
  const raw = safeWeights.map(value => target * value / base);
  const result = raw.map(Math.floor);
  let remaining = target - result.reduce((acc, value) => acc + value, 0);
  raw.map((value, index) => ({ index, fraction: value - result[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(item => { if (remaining > 0) { result[item.index] += 1; remaining -= 1; } });
  return result;
}

function allocateCappedInteger(total, weights, maximum) {
  const target = Math.max(0, Math.round(Number(total) || 0));
  const cap = Math.max(0, Math.trunc(Number(maximum) || 0));
  if (!weights.length || target > weights.length * cap) return null;
  const minutes = weights.map(() => 0);
  let remaining = target;
  while (remaining > 0) {
    const eligible = minutes.map((value, index) => value < cap ? index : -1).filter(index => index >= 0);
    if (!eligible.length) return null;
    const proposed = allocateInteger(remaining, eligible.map(index => weights[index]));
    let assigned = 0;
    eligible.forEach((index, offset) => {
      const addition = Math.min(proposed[offset], cap - minutes[index]);
      minutes[index] += addition;
      assigned += addition;
    });
    if (!assigned) {
      const index = eligible[0];
      minutes[index] += 1;
      assigned = 1;
    }
    remaining -= assigned;
  }
  return minutes;
}

function hasSavedUserRotation(team, leagueTransactions = []) {
  if (team?.rotationSource === 'user-saved') return true;
  return [...(Array.isArray(team?.transactions) ? team.transactions : []),
    ...(Array.isArray(leagueTransactions) ? leagueTransactions : [])]
    .some(row => row?.type === 'coach' && row.teamId === team.teamId && Array.isArray(row.rotation));
}

function planEvidenceRotation(team, seed, gameId) {
  return planCpuFranchiseRotation({ ...team, control: 'cpu' }, { seed, gameId });
}

function fallbackEvidenceRotation(team, available) {
  const ranked = [...available].sort((left, right) => {
    const minutes = player => {
      const baseline = Number(player.baselineMinutesPerGame);
      if (Number.isFinite(baseline) && baseline > 0) return baseline;
      const games = Number(player.seasonStats?.games || 0);
      const total = Number(player.seasonStats?.minutes || 0);
      if (games > 0 && total > 0) return total / games;
      const ratings = Object.values(player.ratings || {}).map(Number).filter(Number.isFinite);
      return ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length / 3 : 18;
    };
    return minutes(right) - minutes(left) || left.playerRef.localeCompare(right.playerRef);
  });
  const selected = [];
  const selectedRefs = new Set();
  // Keep the best available evidence at each position group before filling
  // the rotation by observed minute rank. This path is used only when the
  // strict role-minute planner cannot satisfy its model constraints.
  for (const role of ['C', 'G', 'G', 'F', 'F']) {
    const player = ranked.find(candidate => !selectedRefs.has(candidate.playerRef) && candidate.positions?.includes(role));
    if (player) { selected.push(player); selectedRefs.add(player.playerRef); }
  }
  for (const player of ranked) {
    if (selected.length >= Math.min(10, ranked.length)) break;
    if (!selectedRefs.has(player.playerRef)) { selected.push(player); selectedRefs.add(player.playerRef); }
  }
  return selected.map(player => {
    const baseline = Number(player.baselineMinutesPerGame);
    const seasonGames = Number(player.seasonStats?.games || 0);
    const seasonMinutes = Number(player.seasonStats?.minutes || 0);
    const minutes = Number.isFinite(baseline) && baseline > 0 ? baseline
      : seasonGames > 0 && seasonMinutes > 0 ? seasonMinutes / seasonGames : 18;
    return { playerRef: player.playerRef, minutes: Math.max(1, minutes) };
  });
}

function franchiseRotationPlanReceipt(team, rotation, availablePlayerCount, { explicit = false, seed, gameId, status } = {}) {
  const selected = Array.isArray(rotation) ? rotation : [];
  const playersByRef = new Map((team.roster || []).map(player => [player.playerRef, player]));
  const roleMinuteCoverage = Object.fromEntries(Object.entries(FRANCHISE_ROLE_MINUTES).map(([role, required]) => {
    const minutes = selected.reduce((sum, row) => sum
      + (playersByRef.get(row.player?.playerRef)?.positions?.includes(role) ? Number(row.minutes) || 0 : 0), 0);
    return [role, { minutes, required, shortfall: Math.max(0, required - minutes) }];
  }));
  const covered = Object.values(roleMinuteCoverage).every(row => row.minutes >= row.required);
  const source = explicit ? 'user-saved' : 'evidence-position-default';
  return {
    teamId: team.teamId,
    source,
    modelVersion: explicit ? 'user-authored' : FRANCHISE_CPU_ROTATION_VERSION,
    status: status || (explicit ? 'user-authored' : team.rotationPlanStatus || 'unavailable'),
    evidence: explicit ? 'user-authored-coaching-choice' : 'observed-minutes-position-and-seeded-scenario',
    seed: String(seed || ''),
    gameId: String(gameId || ''),
    reason: explicit ? null : team.rotationPlanReason || null,
    availablePlayerCount,
    selectedPlayerCount: selected.length,
    totalRegulationMinutes: selected.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0),
    maximumPlayerMinutes: Math.max(0, ...selected.map(row => Number(row.minutes) || 0)),
    roleMinuteCoverage,
    roleCoverageStatus: explicit ? 'user-authored' : covered ? 'covered' : 'short',
  };
}

function activeRotation(team, { seed, gameId } = {}) {
  const available = team.roster.filter(player => player.status === 'active' && !(player.injury?.gamesRemaining > 0));
  const explicit = hasSavedUserRotation(team);
  if (available.length < 5) {
    team.rotationPlanStatus = 'unavailable';
    team.rotationPlanReason = 'Fewer than five players are available for a capped 240-minute rotation.';
    return {
      rows: [],
      receipt: franchiseRotationPlanReceipt(team, [], available.length, {
        explicit, seed, gameId, status: 'unavailable',
      }),
    };
  }
  const availableByRef = new Map(available.map(player => [player.playerRef, player]));
  let planned = explicit ? null : planEvidenceRotation(team, seed, gameId);
  let plannedRows = planned?.status === 'ready' ? planned.rotation : [];
  let selectedRows;
  if (explicit) {
    selectedRows = (team.rotation || []).filter(row => availableByRef.has(row.playerRef))
      .map(row => ({
        player: availableByRef.get(row.playerRef),
        weight: Math.max(1, Number(row.minutes) || 1),
        relativeUsage: Number.isFinite(Number(row.relativeUsage)) ? clamp(Number(row.relativeUsage), 0.5, 1.5) : 1,
        usageRole: ['lead-creator', 'primary-scorer', 'balanced', 'connector', 'low-usage', 'custom'].includes(row.usageRole)
          ? row.usageRole : 'balanced',
      }));
    if (selectedRows.length < 5) {
      planned = planEvidenceRotation(team, seed, gameId);
      plannedRows = planned.status === 'ready' ? planned.rotation : [];
      const selectedRefs = new Set(selectedRows.map(row => row.player.playerRef));
      const additions = plannedRows.length ? plannedRows : fallbackEvidenceRotation(team, available);
      for (const row of additions) {
        if (selectedRows.length >= 5) break;
        const player = availableByRef.get(row.playerRef);
        if (player && !selectedRefs.has(row.playerRef)) {
          selectedRefs.add(row.playerRef);
          selectedRows.push({ player, weight: Math.max(1, Number(row.minutes) || 1), relativeUsage: 1, usageRole: 'balanced' });
        }
      }
    }
  } else {
    if (planned.status !== 'ready') plannedRows = fallbackEvidenceRotation(team, available);
    selectedRows = plannedRows.map(row => ({ player: availableByRef.get(row.playerRef), weight: row.minutes, relativeUsage: 1, usageRole: 'balanced' }));
    team.rotationSource = 'evidence-position-default';
    team.rotationModelVersion = FRANCHISE_CPU_ROTATION_VERSION;
    team.rotationPlanStatus = planned.status === 'ready' ? 'ready' : 'evidence-position-fallback';
    if (planned.status !== 'ready') team.rotationPlanReason = planned.reason;
    else delete team.rotationPlanReason;
  }
  selectedRows = selectedRows.filter(row => row.player);
  if (selectedRows.length < 5 || selectedRows.length > 10) {
    throw new Error(`Franchise team ${team.teamId} needs five to ten available rotation players.`);
  }
  const maximumPlayerMinutes = explicit ? 48
    : selectedRows.length === 5 ? 48 : selectedRows.length === 6 ? 42 : 40;
  const minutes = !explicit && planned?.status === 'ready'
    ? selectedRows.map(row => Math.round(row.weight))
    : allocateCappedInteger(240, selectedRows.map(row => row.weight), maximumPlayerMinutes);
  if (!minutes || minutes.reduce((sum, value) => sum + value, 0) !== 240
    || minutes.some(value => !Number.isInteger(value) || value < 0 || value > maximumPlayerMinutes)) {
    throw new Error(`Franchise team ${team.teamId} rotation cannot cover 240 regulation minutes within the ${maximumPlayerMinutes}-minute player cap.`);
  }
  if (!explicit) {
    const assignedRotation = selectedRows.map((row, index) => ({ playerRef: row.player.playerRef, minutes: minutes[index] }));
    const minutesByRef = new Map(assignedRotation.map(row => [row.playerRef, row.minutes]));
    team.rotation = assignedRotation;
    team.roster.forEach(player => { player.rotationMinutes = minutesByRef.get(player.playerRef) || 0; });
  }
  const rows = selectedRows.map((row, index) => ({
    player: row.player,
    minutes: minutes[index],
    targetMinutes: row.weight,
    relativeUsage: row.relativeUsage,
    usageRole: row.usageRole,
  }));
  return {
    rows,
    receipt: franchiseRotationPlanReceipt(team, rows, available.length, { explicit, seed, gameId }),
  };
}

function extendRotationForOvertime(rotation, overtimePeriods) {
  const periods = Math.max(0, Math.trunc(Number(overtimePeriods) || 0));
  if (!rotation.length) return [];
  const overtimeMinutesByPeriod = rotation.map(() => []);
  for (let period = 0; period < periods; period += 1) {
    const allocation = allocateCappedInteger(FRANCHISE_OVERTIME_MINUTES * 5, rotation.map(item => item.minutes), FRANCHISE_OVERTIME_MINUTES);
    if (!allocation) throw new Error('Franchise overtime rotation cannot cover 25 team minutes within the five-minute player cap.');
    allocation.forEach((minutes, index) => { overtimeMinutesByPeriod[index].push(minutes); });
  }
  return rotation.map((item, index) => {
    const periodMinutes = overtimeMinutesByPeriod[index];
    const overtimeMinutes = periodMinutes.reduce((sum, minutes) => sum + minutes, 0);
    return {
      player: item.player,
      regulationMinutes: item.minutes,
      overtimeMinutes,
      overtimeMinutesByPeriod: periodMinutes,
      minutes: item.minutes + overtimeMinutes,
      targetMinutes: item.targetMinutes ?? item.minutes,
      relativeUsage: item.relativeUsage,
      usageRole: item.usageRole,
    };
  });
}

function roundRobinSchedule(teamIds, gamesPerTeam, seed) {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  validateRoundRobinTarget(ids.length, gamesPerTeam);
  if (ids.length % 2) ids.push('bye');
  const rounds = ids.length - 1;
  const rotation = [...ids];
  const baseRounds = [];
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const games = [];
    for (let index = 0; index < ids.length / 2; index += 1) {
      const left = rotation[index], right = rotation[rotation.length - 1 - index];
      if (left !== 'bye' && right !== 'bye') {
        const flip = (roundIndex + index + seedNumber(seed)) % 2 === 0;
        games.push({ homeTeamId: flip ? left : right, awayTeamId: flip ? right : left });
      }
    }
    baseRounds.push(games);
    rotation.splice(1, 0, rotation.pop());
  }
  const schedule = [];
  const appearances = new Map(ids.filter(id => id !== 'bye').map(id => [id, 0]));
  let round = 1;
  // Consume complete circles and then only games that still fit the declared
  // target. A fixed number of rounds is incorrect for odd leagues because
  // each circle contains one bye: a valid five-team/two-game target needs
  // five games spread across the circle rather than two full rounds.
  for (let cycle = 0; [...appearances.values()].some(count => count < gamesPerTeam); cycle += 1) {
    let added = 0;
    for (const games of baseRounds) {
      for (const game of games) {
        if (appearances.get(game.homeTeamId) >= gamesPerTeam || appearances.get(game.awayTeamId) >= gamesPerTeam) continue;
        const oriented = cycle % 2
          ? { homeTeamId: game.awayTeamId, awayTeamId: game.homeTeamId }
          : game;
        const roundNumber = round++;
        schedule.push({ ...oriented, scheduleGameId: `g${roundNumber}`, round: roundNumber, phase: 'regular', scheduledAt: null });
        appearances.set(game.homeTeamId, appearances.get(game.homeTeamId) + 1);
        appearances.set(game.awayTeamId, appearances.get(game.awayTeamId) + 1);
        added += 1;
      }
    }
    if (!added) throw new Error('Round-robin schedule could not satisfy every team\'s games-per-team target.');
  }
  return schedule;
}

function validateRoundRobinTarget(teamCount, gamesPerTeam) {
  const count = Number(teamCount), target = Number(gamesPerTeam);
  // An odd number of teams has an odd number of total appearances when the
  // requested per-team target is odd.  No schedule can give every team the
  // same integer number of games in that case; fail closed instead of
  // silently giving the first circle rounds extra games.
  if (count % 2 === 1 && target % 2 === 1) {
    throw new Error('Round-robin scenario needs an even games-per-team target when the selected team count is odd; an odd×odd target cannot be balanced.');
  }
}

function scheduleCoverage(games, teamIds) {
  const appearances = new Map(teamIds.map(id => [id, 0]));
  for (const game of games) {
    appearances.set(game.homeTeamId, (appearances.get(game.homeTeamId) || 0) + 1);
    appearances.set(game.awayTeamId, (appearances.get(game.awayTeamId) || 0) + 1);
  }
  const counts = [...appearances.values()];
  const dated = games.filter(game => game?.scheduledAt && Number.isFinite(Date.parse(game.scheduledAt)));
  const timestamps = dated.map(game => Date.parse(game.scheduledAt));
  const calendarStart = timestamps.length ? Math.min(...timestamps) : null;
  const calendarEnd = timestamps.length ? Math.max(...timestamps) : null;
  const calendar = {
    status: dated.length === 0 ? 'unavailable' : dated.length === games.length ? 'measured' : 'partial-dates',
    datedGames: dated.length,
    undatedGames: games.length - dated.length,
    calendarStart: calendarStart === null ? null : new Date(calendarStart).toISOString(),
    calendarEnd: calendarEnd === null ? null : new Date(calendarEnd).toISOString(),
    calendarSpanDays: calendarStart === null ? null : Math.round((calendarEnd - calendarStart) / 86400000),
    calendarDaysInclusive: calendarStart === null ? null : Math.round((calendarEnd - calendarStart) / 86400000) + 1,
  };
  return {
    games: games.length,
    teamAppearances: Object.fromEntries(appearances),
    minGamesPerTeam: counts.length ? Math.min(...counts) : 0,
    maxGamesPerTeam: counts.length ? Math.max(...counts) : 0,
    balanced: counts.length ? counts.every(count => count === counts[0]) : true,
    calendar,
  };
}

function calendarState(scheduleSource, totalGames, status = 'preseason') {
  const coverage = scheduleSource?.coverage?.calendar || {};
  return {
    status,
    // Legacy progress fields remain game-index based for existing consumers.
    day: 0,
    totalDays: totalGames,
    gameIndex: 0,
    totalGames,
    scheduledAt: null,
    calendarStart: coverage.calendarStart || null,
    calendarEnd: coverage.calendarEnd || null,
    calendarSpanDays: coverage.calendarSpanDays ?? null,
    calendarDaysInclusive: coverage.calendarDaysInclusive ?? null,
    datedGames: coverage.datedGames || 0,
    undatedGames: coverage.undatedGames ?? totalGames,
    scheduleKind: scheduleSource?.kind || null,
    scheduleEvidence: scheduleSource?.evidenceKind || null,
  };
}

function emptyRecord() {
  return { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
}

function normalizeScheduleGames(scheduleGames, teamIds, seasonStartYear, receipt = null, scheduleKind = null) {
  if (!Array.isArray(scheduleGames) || !scheduleGames.length) return null;
  const declaredKind = scheduleKind == null ? null : text(scheduleKind).toLowerCase();
  const receiptKind = receipt?.kind == null ? null : text(receipt.kind).toLowerCase();
  if (declaredKind !== null && !SCHEDULE_KINDS.includes(declaredKind)) {
    throw new Error('Franchise schedule kind must be actual or generated.');
  }
  if (receiptKind !== null && !SCHEDULE_KINDS.includes(receiptKind)) {
    throw new Error('Franchise schedule receipt kind must be actual or generated.');
  }
  if (declaredKind && receiptKind && declaredKind !== receiptKind) {
    throw new Error('Franchise schedule kind does not match its source receipt.');
  }
  const kind = declaredKind || receiptKind || 'actual';
  const allowed = new Set(teamIds);
  const seen = new Set();
  const games = scheduleGames.map((game, index) => {
    if (!game || typeof game !== 'object') throw new Error(`Franchise schedule game ${index + 1} is invalid.`);
    const homeTeamId = text(game.homeTeamId || game.home), awayTeamId = text(game.awayTeamId || game.away);
    if (!allowed.has(homeTeamId) || !allowed.has(awayTeamId) || homeTeamId === awayTeamId) {
      throw new Error(`Franchise schedule game ${index + 1} references a team outside the selected league.`);
    }
    const scheduleGameId = text(game.scheduleGameId || game.sourceGameId || game.id);
    if (!SAFE_ID.test(scheduleGameId) || seen.has(scheduleGameId)) throw new Error('Franchise schedule game IDs must be unique and bounded.');
    seen.add(scheduleGameId);
    const round = integer(Number(game.round), 1, Number.MAX_SAFE_INTEGER) ? Number(game.round) : index + 1;
    const scheduledAt = game.scheduledAt == null ? null : String(game.scheduledAt);
    if (scheduledAt !== null && !Number.isFinite(Date.parse(scheduledAt))) throw new Error(`Franchise schedule game ${index + 1} has an invalid scheduled time.`);
    const phase = text(game.phase || 'regular').toLowerCase();
    if (phase !== 'regular') throw new Error('Franchise persistent seasons accept regular-season schedule rows only; postseason is simulated from standings.');
    if (game.seasonStartYear != null && Number(game.seasonStartYear) !== Number(seasonStartYear)) {
      throw new Error(`Franchise schedule game ${scheduleGameId} escapes the selected season.`);
    }
    return { scheduleGameId, round, homeTeamId, awayTeamId, seasonStartYear: Number(seasonStartYear), phase, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null, inputOrder: index };
  });
  // A dated reviewed calendar is a chronological event stream, not merely a
  // bag of matchups. Canonicalize it before seeded outcomes consume fatigue,
  // injury, and random state. Undated rows remain after dated rows and retain
  // their declared round/input order because their real calendar position is
  // unavailable rather than safely inferable.
  const hasDates = games.some(game => game.scheduledAt !== null);
  if (hasDates) {
    games.sort((left, right) => {
      const leftTime = left.scheduledAt === null ? Number.POSITIVE_INFINITY : Date.parse(left.scheduledAt);
      const rightTime = right.scheduledAt === null ? Number.POSITIVE_INFINITY : Date.parse(right.scheduledAt);
      return leftTime - rightTime || left.round - right.round || left.scheduleGameId.localeCompare(right.scheduleGameId) || left.inputOrder - right.inputOrder;
    });
  }
  games.forEach(game => { delete game.inputOrder; });
  const coverage = scheduleCoverage(games, teamIds);
  if (Object.values(coverage.teamAppearances).some(count => count > 200)) throw new Error('Franchise schedule cannot exceed 200 games per team.');
  if (Object.values(coverage.teamAppearances).some(count => count < 1)) {
    throw new Error('Franchise schedule must include at least one regular-season game for every selected team.');
  }
  return {
    kind,
    observed: kind === 'actual',
    evidenceKind: kind === 'actual' ? 'observed-calendar' : 'modeled-schedule-scenario',
    games,
    receipt: receipt && typeof receipt === 'object' ? {
      id: text(receipt.id) || null,
      version: text(receipt.version) || null,
      contentSha256: /^[a-f0-9]{64}$/.test(String(receipt.contentSha256 || '')) ? String(receipt.contentSha256) : null,
    } : null,
    coverage,
  };
}

function validateSource(payloads, seasonStartYear, scope = 'exact-season') {
  if (!Array.isArray(payloads) || payloads.length < 2 || payloads.length > MAX_TEAMS) throw new Error('Franchise League needs between two and thirty public team payloads.');
  if (!['exact-season', 'pooled-window'].includes(scope)) throw new Error('Franchise League source scope is unsupported.');
  const teams = payloads.map(payload => text(payload?.team || payload?.teamCode));
  if (teams.some(id => !SAFE_ID.test(id)) || new Set(teams).size !== teams.length) throw new Error('Franchise League team references are invalid or duplicated.');
  const canonicalTeams = teams.map(id => classifyNbaTeam(id)?.teamId || id.toLowerCase());
  if (new Set(canonicalTeams).size !== canonicalTeams.length) throw new Error('Franchise League team references are invalid or duplicated.');
  if (!integer(Number(seasonStartYear), 1947, 2200)) throw new Error('Franchise League needs a valid season start year.');
  const refs = payloads.flatMap(payload => publicPackageRefs(payload, seasonStartYear));
  if (!refs.length) throw new Error('Franchise League needs a pinned public package reference.');
  const seasons = new Set(refs.map(ref => Number(ref.seasonStartYear)).filter(integer));
  if (scope === 'exact-season' && seasons.size && [...seasons].some(year => year !== Number(seasonStartYear))) throw new Error('Exact Franchise League requests cannot mix season package references.');
  return { teams, refs };
}

export function createFranchiseLeague({
  leagueId = 'swishiq-franchise-league',
  seasonStartYear,
  teamPayloads,
  teamNames = {},
  userTeamIds = [],
  seed = 'franchise-v1',
  gamesPerTeam = 82,
  playoffTeams = 8,
  seriesLength = 7,
  scope = 'exact-season',
  packageRef = null,
  scheduleGames = null,
  scheduleReceipt = null,
  scheduleKind = null,
} = {}) {
  const source = validateSource(teamPayloads, seasonStartYear, scope);
  const ids = source.teams;
  if (!integer(Number(gamesPerTeam), 1, 200)) throw new Error('Franchise League games per team must be between 1 and 200.');
  const requestedSeriesLength = Number(seriesLength);
  if (!Number.isInteger(requestedSeriesLength) || !PLAYOFF_SERIES_LENGTHS.includes(requestedSeriesLength)) {
    throw new Error(`Franchise League playoff series length must be one of ${PLAYOFF_SERIES_LENGTHS.join(', ')}.`);
  }
  const userTeams = new Set((Array.isArray(userTeamIds) ? userTeamIds : [userTeamIds]).map(text).filter(id => ids.includes(id)));
  const teams = teamPayloads.map(payload => {
    const teamId = text(payload.team || payload.teamCode);
    const structure = classifyNbaTeam(teamId);
    const roster = normalizeRoster(payload, teamId, seasonStartYear, scope);
    const nativeMetrics = nativeTeamMetrics(payload, seasonStartYear);
    const team = {
      teamId, displayName: text(teamNames[teamId] || payload.teamName || teamId), control: userTeams.has(teamId) ? 'user' : 'cpu',
      conference: structure?.conference || null, division: structure?.division || null, nativeMetrics,
      roster, rosterEvidence: roster.length ? (scope === 'pooled-window' ? 'accepted-pooled-season-context' : 'exact-season-row') : 'unavailable',
      depthChart: POSITION_ORDER.map((position, index) => ({ position, playerRefs: roster.filter(player => player.positions.includes(position)).slice(0, 5).map(player => player.playerRef) })),
      rotation: [], rotationSource: 'evidence-position-default', rotationModelVersion: FRANCHISE_CPU_ROTATION_VERSION,
      coaching: { pace: 100, offense: 50, defense: 50, source: 'scenario-default' },
      record: emptyRecord(), postseasonRecord: emptyRecord(),
      teamStats: emptyTeamStats(),
      playerLedger: {}, playerLedgerCoverage: roster.length ? 'complete' : 'unavailable', fatigue: 0, injuries: [], transactions: [], strength: null,
    };
    const defaultPlan = planEvidenceRotation(team, text(seed) || 'franchise-v1', `${seasonStartYear}:opening:${teamId}`);
    if (defaultPlan.status === 'ready') {
      team.rotation = defaultPlan.rotation.map(row => ({ playerRef: row.playerRef, minutes: row.minutes }));
      const minutesByRef = new Map(defaultPlan.rotation.map(row => [row.playerRef, row.minutes]));
      roster.forEach(player => { player.rotationMinutes = minutesByRef.get(player.playerRef) || 0; });
    } else {
      team.rotationPlanStatus = 'unavailable';
      team.rotationPlanReason = defaultPlan.reason;
      roster.forEach(player => { player.rotationMinutes = 0; });
    }
    return team;
  });
  const actualSchedule = normalizeScheduleGames(scheduleGames, ids, seasonStartYear, scheduleReceipt, scheduleKind);
  const requestedPlayoffTeams = Number(playoffTeams);
  if (!Number.isInteger(requestedPlayoffTeams) || ![0, 2, 4, 8, 16].includes(requestedPlayoffTeams)
    || requestedPlayoffTeams > ids.length) {
    throw new Error('Franchise League playoff field must be 0, 2, 4, 8, or 16 teams and cannot exceed the selected league.');
  }
  if (packageRef != null) {
    const packageId = text(packageRef?.packageId);
    const packageVersion = text(packageRef?.packageVersion);
    if (!packageId || !packageVersion || !source.refs.some(ref => ref.packageId === packageId && ref.packageVersion === packageVersion)) {
      throw new Error('Franchise League package pin must match one of the selected public package references.');
    }
  }
  let schedule = actualSchedule?.games || null;
  let generatedSchedule = null;
  if (!schedule) {
    validateRoundRobinTarget(ids.length, Number(gamesPerTeam));
    generatedSchedule = normalizeScheduleGames(roundRobinSchedule(ids, Number(gamesPerTeam), seed), ids, seasonStartYear, null, 'generated');
    if (!generatedSchedule?.coverage?.balanced || generatedSchedule.coverage.minGamesPerTeam !== Number(gamesPerTeam)) {
      throw new Error('Generated round-robin schedule could not provide the requested equal games-per-team target. Choose an even target or an exact/custom schedule.');
    }
    schedule = generatedSchedule.games;
  }
  const effectiveGamesPerTeam = actualSchedule?.coverage?.minGamesPerTeam || generatedSchedule?.coverage?.minGamesPerTeam || Number(gamesPerTeam);
  const scheduleSource = actualSchedule
    ? { kind: actualSchedule.kind, observed: actualSchedule.observed, evidenceKind: actualSchedule.evidenceKind,
      seasonStartYear: Number(seasonStartYear), receipt: actualSchedule.receipt, coverage: actualSchedule.coverage }
    : { kind: 'generated', observed: false, evidenceKind: 'modeled-schedule-scenario', seasonStartYear: Number(seasonStartYear), receipt: null,
      coverage: { ...generatedSchedule.coverage, source: 'deterministic-round-robin', targetGamesPerTeam: Number(gamesPerTeam) } };
  return {
    format: FRANCHISE_STATE_FORMAT, modelVersion: FRANCHISE_SIMULATION_MODEL_VERSION,
    leagueId: text(leagueId) || 'swishiq-franchise-league', seed: text(seed) || 'franchise-v1',
    source: { scope, seasonStartYear: Number(seasonStartYear), packageRefs: source.refs, packageRef: packageRef || source.refs[0], schedule: scheduleSource },
    settings: { gamesPerTeam: effectiveGamesPerTeam, playoffTeams: requestedPlayoffTeams, seriesLength: requestedSeriesLength, seasonLength: 'full', rulesVersion: 'swishiq-franchise-rules-v1' },
    currentSeason: Number(seasonStartYear), calendar: calendarState(scheduleSource, schedule.length),
    teams, schedule, freeAgents: [], draftPool: [], history: [], gameLogs: [], transactions: [],
    standings: [], leaders: {}, allGameLeaders: {}, playoffs: null, lastResult: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function resetTeamSeason(team) {
  team.record = emptyRecord(); team.postseasonRecord = emptyRecord();
  team.teamStats = emptyTeamStats(); team.playerLedger = {}; team.playerLedgerCoverage = team.roster.length ? 'complete' : 'unavailable';
  team.fatigue = 0; team.injuries = []; team.transactions = [];
  team.roster.forEach(player => {
    player.seasonStats = { games: 0, minutes: 0, points: 0, assists: 0, rebounds: 0, turnovers: 0, steals: 0, blocks: 0 };
    player.gameLogs = []; player.injury = null; player.fatigue = 0; player.status = 'active';
  });
}

function resetDefaultRotation(team, seed, seasonStartYear) {
  if (hasSavedUserRotation(team)) return;
  const planned = planEvidenceRotation(team, seed, `${seasonStartYear}:opening:${team.teamId}`);
  const rows = planned.status === 'ready' ? planned.rotation : fallbackEvidenceRotation(team,
    team.roster.filter(player => player.status === 'active' && !(player.injury?.gamesRemaining > 0)));
  team.rotation = rows.map(row => ({ playerRef: row.playerRef, minutes: row.minutes }));
  team.rotationSource = 'evidence-position-default';
  team.rotationModelVersion = FRANCHISE_CPU_ROTATION_VERSION;
  team.rotationPlanStatus = planned.status === 'ready' ? 'ready' : 'evidence-position-fallback';
  if (planned.status === 'ready') delete team.rotationPlanReason;
  else team.rotationPlanReason = planned.reason;
  const minutesByRef = new Map(rows.map(row => [row.playerRef, row.minutes]));
  team.roster.forEach(player => { player.rotationMinutes = minutesByRef.get(player.playerRef) || 0; });
}

function gameBoxScore(team, rotation, points, random, gameId) {
  // Prefer each player's observed season rate scaled to the minutes actually
  // assigned in this game.  For a partially observed metric, estimate the
  // missing player's rate from observed teammates at the same minutes grain;
  // only an entirely missing metric falls back to the bounded style/rating
  // ratio.  This avoids treating a style score as a per-minute stat rate.
  const productionWeights = (key, fallback) => {
    const observations = rotation.map(item => {
      const rawBaseline = item.player.baselinePerGame?.[key];
      const baseline = rawBaseline === null || rawBaseline === undefined ? null : Number(rawBaseline);
      const baselineMinutes = Number(item.player.baselineMinutesPerGame);
      const observed = Number.isFinite(baseline) && baseline >= 0 && Number.isFinite(baselineMinutes) && baselineMinutes > 0;
      return { item, baseline, baselineMinutes, observed };
    });
    const observedCount = observations.filter(observation => observation.observed).length;
    const observedMinutes = observations.reduce((sum, observation) => sum + (observation.observed ? observation.item.minutes : 0), 0);
    const observedProduction = observations.reduce((sum, observation) => sum + (observation.observed
      ? observation.baseline * observation.item.minutes / observation.baselineMinutes : 0), 0);
    const observedRate = observedMinutes > 0 ? observedProduction / observedMinutes : null;
    const values = observations.map(({ item, baseline, baselineMinutes, observed }) => {
      const baselineWeight = observed
        ? baseline * item.minutes / baselineMinutes
        : item.minutes * (observedRate === null ? fallback(item.player) : observedRate);
      const relativeUsage = key === 'points' || key === 'turnovers'
        ? (Number.isFinite(Number(item.relativeUsage)) ? clamp(Number(item.relativeUsage), 0.5, 1.5) : 1)
        : 1;
      return baselineWeight * relativeUsage;
    });
    const source = observedCount ? (observedCount === rotation.length ? 'observed-baseline-scaled' : 'mixed-observed-and-style-fallback') : 'style-fallback-ratio';
    return { values, source, fallbackSource: observedCount > 0 && observedCount < rotation.length && observedRate !== null ? 'observed-peer-rate' : observedCount === 0 ? 'style-ratio' : null };
  };
  const pointPlan = productionWeights('points', player => 0.7 + Number(player.tendencies?.usage || 0.5));
  const plans = {
    points: pointPlan,
    assists: productionWeights('assists', player => 0.5 + Number(player.ratings?.playmaking || 50) / 100),
    rebounds: productionWeights('rebounds', player => 0.6 + Number(player.ratings?.rebounding || 50) / 100),
    turnovers: productionWeights('turnovers', player => 0.8 + Number(player.tendencies?.usage || 0.5)),
    steals: productionWeights('steals', player => 0.5 + Number(player.ratings?.defense || 50) / 100),
    blocks: productionWeights('blocks', player => 0.5 + Number(player.ratings?.defense || 50) / 100),
  };
  const fallbackRatios = { assists: 0.62, rebounds: 0.52, turnovers: 0.12, steals: 0.045, blocks: 0.035 };
  const targets = Object.fromEntries(STAT_KEYS.map(key => {
    if (key === 'points') return [key, Math.max(0, Math.round(points))];
    const plan = plans[key];
    const observedTarget = plan.values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    const target = plan.source === 'style-fallback-ratio' ? Math.round(points * fallbackRatios[key]) : Math.round(observedTarget);
    return [key, Math.max(0, target)];
  }));
  const stats = Object.fromEntries(STAT_KEYS.map(key => [key, allocateInteger(targets[key], plans[key].values)]));
  const rows = rotation.map((item, index) => {
    const line = { gameId, playerRef: item.player.playerRef, displayName: item.player.displayName, minutes: item.minutes,
      regulationMinutes: item.regulationMinutes ?? item.minutes, overtimeMinutes: item.overtimeMinutes ?? 0,
      rotationTargetMinutes: item.targetMinutes ?? item.minutes,
      usageRole: item.usageRole || 'balanced',
      relativeUsage: Number.isFinite(Number(item.relativeUsage)) ? round(clamp(Number(item.relativeUsage), 0.5, 1.5)) : 1,
      ...(item.overtimeMinutesByPeriod?.length ? { overtimeMinutesByPeriod: [...item.overtimeMinutesByPeriod] } : {}) };
    for (const key of STAT_KEYS) line[key] = stats[key][index] || 0;
    return line;
  });
  return { rows, derivation: {
    version: FRANCHISE_BOX_SCORE_MODEL_VERSION,
    relativeUsageModelVersion: FRANCHISE_RELATIVE_USAGE_MODEL_VERSION,
    statSources: Object.fromEntries(STAT_KEYS.map(key => [key, plans[key].source])),
    statFallbackSources: Object.fromEntries(STAT_KEYS.map(key => [key, plans[key].fallbackSource])),
    targets,
  } };
}

export function auditFranchiseMinutes(teams, overtimePeriods = 0) {
  const periods = Math.max(0, Math.trunc(Number(overtimePeriods) || 0));
  const expectedTeamMinutes = 240 + periods * FRANCHISE_OVERTIME_MINUTES * 5;
  const minuteTotalsFor = boxes => {
    const rows = Array.isArray(boxes) ? boxes : [];
    return {
      total: rows.reduce((sum, row) => sum + Number(row.minutes || 0), 0),
      regulation: rows.reduce((sum, row) => sum + Number(row.regulationMinutes || 0), 0),
      overtime: rows.reduce((sum, row) => sum + Number(row.overtimeMinutes || 0), 0),
      overtimeByPeriod: Array.from({ length: periods }, (_, period) =>
        rows.reduce((sum, row) => sum + Number(row.overtimeMinutesByPeriod?.[period] || 0), 0)),
      maximumRegulationPlayerMinutes: Math.max(0, ...rows.map(row => Number(row.regulationMinutes))),
      maximumOvertimePlayerMinutesPerPeriod: Math.max(0, ...rows.flatMap(row => row.overtimeMinutesByPeriod || []).map(Number)),
      playerRowsValid: rows.every(row => {
        const overtimeByPeriod = row.overtimeMinutesByPeriod || [];
        return Number.isInteger(row.minutes) && Number.isInteger(row.regulationMinutes)
          && Number.isInteger(row.overtimeMinutes) && Array.isArray(overtimeByPeriod)
          && overtimeByPeriod.length === periods
          && row.minutes === row.regulationMinutes + row.overtimeMinutes
          && row.overtimeMinutes === overtimeByPeriod.reduce((sum, value) => sum + Number(value), 0)
          && row.regulationMinutes >= 0 && row.regulationMinutes <= 48
          && overtimeByPeriod.every(value => Number.isInteger(value) && value >= 0 && value <= FRANCHISE_OVERTIME_MINUTES);
      }),
    };
  };
  const totals = { home: minuteTotalsFor(teams?.home), away: minuteTotalsFor(teams?.away) };
  const minuteStatus = value => value.total === expectedTeamMinutes
    && value.regulation === 240
    && value.overtime === periods * FRANCHISE_OVERTIME_MINUTES * 5
    && value.overtimeByPeriod.length === periods
    && value.overtimeByPeriod.every(minutes => minutes === FRANCHISE_OVERTIME_MINUTES * 5)
    && value.maximumRegulationPlayerMinutes <= 48
    && value.maximumOvertimePlayerMinutesPerPeriod <= FRANCHISE_OVERTIME_MINUTES
    && value.playerRowsValid ? 'reconciled' : 'mismatch';
  const home = totals.home, away = totals.away;
  return {
    modelVersion: FRANCHISE_MINUTES_MODEL_VERSION,
    regulationTeamMinutes: 240,
    overtimeTeamMinutesPerPeriod: FRANCHISE_OVERTIME_MINUTES * 5,
    regulationPlayerMinuteCap: 48,
    overtimePlayerMinuteCapPerPeriod: FRANCHISE_OVERTIME_MINUTES,
    overtimePeriods: periods,
    expectedTeamMinutes,
    teams: { home: { ...home, status: minuteStatus(home) }, away: { ...away, status: minuteStatus(away) } },
    status: minuteStatus(home) === 'reconciled' && minuteStatus(away) === 'reconciled' ? 'reconciled' : 'mismatch',
  };
}

export function resolveFranchiseOvertime({ homeScore, awayScore, homeExpectedRegulationPoints, awayExpectedRegulationPoints, random = Math.random } = {}) {
  const regulationHome = Math.max(0, Math.round(Number(homeScore) || 0));
  const regulationAway = Math.max(0, Math.round(Number(awayScore) || 0));
  if (regulationHome !== regulationAway) return {
    homeScore: regulationHome, awayScore: regulationAway, regulationHomeScore: regulationHome, regulationAwayScore: regulationAway,
    overtimePeriods: 0, overtimeHomeScore: 0, overtimeAwayScore: 0, overtimePeriodScores: [],
  };
  if (homeExpectedRegulationPoints == null || awayExpectedRegulationPoints == null
    || !Number.isFinite(Number(homeExpectedRegulationPoints)) || !Number.isFinite(Number(awayExpectedRegulationPoints))) {
    throw new Error('Tied Franchise games require each team’s expected regulation points to simulate overtime.');
  }
  const homeExpected = Math.max(1, Math.max(70, Number(homeExpectedRegulationPoints)) * FRANCHISE_OVERTIME_MINUTES / 48);
  const awayExpected = Math.max(1, Math.max(70, Number(awayExpectedRegulationPoints)) * FRANCHISE_OVERTIME_MINUTES / 48);
  let overtimeHome = 0, overtimeAway = 0;
  const overtimePeriodScores = [];
  while (regulationHome + overtimeHome === regulationAway + overtimeAway) {
    if (overtimePeriodScores.length >= MAX_OVERTIME_PERIODS) {
      throw new Error(`Franchise overtime remained tied after ${MAX_OVERTIME_PERIODS} full periods; no winner was assigned.`);
    }
    const periodHome = Math.max(1, Math.round(homeExpected + normal(random, 0, 3)));
    const periodAway = Math.max(1, Math.round(awayExpected + normal(random, 0, 3)));
    overtimeHome += periodHome;
    overtimeAway += periodAway;
    overtimePeriodScores.push({ period: overtimePeriodScores.length + 1, minutes: FRANCHISE_OVERTIME_MINUTES,
      homeScore: periodHome, awayScore: periodAway });
  }
  return {
    homeScore: regulationHome + overtimeHome, awayScore: regulationAway + overtimeAway,
    regulationHomeScore: regulationHome, regulationAwayScore: regulationAway,
    overtimePeriods: overtimePeriodScores.length, overtimeHomeScore: overtimeHome, overtimeAwayScore: overtimeAway, overtimePeriodScores,
  };
}

function applyPlayerGame(team, box, season) {
  const player = team.roster.find(item => item.playerRef === box.playerRef);
  if (!player) return;
  if (box.minutes > 0) player.seasonStats.games += 1;
  player.seasonStats.minutes += box.minutes;
  for (const key of STAT_KEYS) player.seasonStats[key] += box[key];
  player.gameLogs.push({ ...box, seasonStartYear: season });
  player.fatigue = clamp(Number(player.fatigue || 0) + box.minutes / 48 * 0.18, 0, 1);
}

function harmonicPace(first, second) {
  const left = finite(first) && Number(first) > 0 ? Number(first) : 100;
  const right = finite(second) && Number(second) > 0 ? Number(second) : 100;
  return clamp(2 / ((1 / left) + (1 / right)), 88, 112);
}

function paceAdjustObserved(points, sourcePace, matchupPace) {
  if (!finite(points)) return null;
  if (!finite(sourcePace) || Number(sourcePace) <= 0) return Number(points) * clamp(0.78 + (matchupPace / 100) * 0.22, 0.9, 1.1);
  // Published points-per-game already contain a team's normal pace.  Adjust
  // only part of that value toward the matchup pace so the same observed
  // scoring baseline is not counted twice as a full pace multiplier.
  const relativePace = clamp(Number(matchupPace) / Number(sourcePace), 0.86, 1.14);
  return Number(points) * (0.55 + 0.45 * relativePace);
}

function observedScoringBaseline(primary, opponent, matchupPace) {
  const inputs = [];
  if (finite(primary?.pointsFor)) {
    inputs.push({ value: round(paceAdjustObserved(primary.pointsFor, primary.pace, matchupPace), 4), source: 'own-points-per-game' });
  }
  if (finite(opponent?.pointsAgainst)) {
    inputs.push({ value: round(paceAdjustObserved(opponent.pointsAgainst, opponent.pace, matchupPace), 4), source: 'opponent-points-allowed-per-game' });
  }
  if (!inputs.length) return { value: null, coverage: 0, sources: [], inputs: [] };
  return {
    value: round(inputs.reduce((sum, item) => sum + item.value, 0) / inputs.length, 4),
    coverage: round(inputs.length / 2, 3),
    sources: inputs.map(item => item.source),
    inputs,
  };
}

function observedScoringBaselineSource(baseline) {
  const hasOwnPoints = baseline.sources.includes('own-points-per-game');
  const hasOpponentPointsAllowed = baseline.sources.includes('opponent-points-allowed-per-game');
  if (hasOwnPoints && hasOpponentPointsAllowed) return 'observed-points-and-opponent-allowed';
  if (hasOwnPoints) return 'observed-own-points-only';
  if (hasOpponentPointsAllowed) return 'observed-opponent-points-allowed-only';
  return 'modeled-rating-baseline';
}

function simulateGame(state, game, random) {
  const home = state.teams.find(team => team.teamId === game.homeTeamId);
  const away = state.teams.find(team => team.teamId === game.awayTeamId);
  if (!home || !away) throw new Error('Franchise schedule references a missing team.');
  const gameId = `${state.currentSeason}-${game.round}-${home.teamId}-${away.teamId}`;
  const homeBaselineStrength = home.strength || teamStrength(home), awayBaselineStrength = away.strength || teamStrength(away);
  const homeRotationPlan = activeRotation(home, { seed: state.seed, gameId });
  const awayRotationPlan = activeRotation(away, { seed: state.seed, gameId });
  const homeRotation = homeRotationPlan.rows, awayRotation = awayRotationPlan.rows;
  const homeStrength = gameRotationStrength(home, homeBaselineStrength, homeRotation);
  const awayStrength = gameRotationStrength(away, awayBaselineStrength, awayRotation);
  const homeMatchupExpected = 108 + (homeStrength.offense - awayStrength.defense) * 0.24;
  const awayMatchupExpected = 108 + (awayStrength.offense - homeStrength.defense) * 0.24;
  const pace = harmonicPace(homeStrength.pace * clamp(home.coaching?.pace ?? 100, 94, 106) / 100,
    awayStrength.pace * clamp(away.coaching?.pace ?? 100, 94, 106) / 100);
  const paceFactor = pace / 100;
  // Treat each observed component as independent evidence. A team with a
  // published points-per-game row should not lose that signal merely because
  // its opponent omitted points-allowed (and vice versa). Missing components
  // lower the observed share; they never become an invented zero.
  const observedHome = observedScoringBaseline(homeStrength, awayStrength, pace);
  const observedAway = observedScoringBaseline(awayStrength, homeStrength, pace);
  const observedHomeExpected = observedHome.value;
  const observedAwayExpected = observedAway.value;
  // Each team owns its own observed baseline.  Using the minimum of both
  // teams' evidence previously discarded a well-covered team's points-per-
  // game signal whenever its opponent had a sparse package row.
  const homeNativeShare = clamp(homeStrength.nativeWeight || 0, 0, 0.65);
  const awayNativeShare = clamp(awayStrength.nativeWeight || 0, 0, 0.65);
  // Matchup ratings are points-per-100 and need the matchup pace factor once.
  // Published points-per-game already include each team's normal pace, so
  // applying paceFactor to the blended observed baseline would count pace a
  // second time. A native-only team has no player-derived competing signal;
  // when its observed offense/defense baseline is available, use that
  // baseline directly and reserve the matchup path for teams without it.
  const homeMatchupBaseline = homeMatchupExpected * paceFactor;
  const awayMatchupBaseline = awayMatchupExpected * paceFactor;
  const homeObservedShare = observedHomeExpected === null ? 0 : round(observedHome.coverage * (homeStrength.source === 'native-team-style' ? 1 : homeNativeShare), 4);
  const awayObservedShare = observedAwayExpected === null ? 0 : round(observedAway.coverage * (awayStrength.source === 'native-team-style' ? 1 : awayNativeShare), 4);
  const homeBaseline = (homeMatchupBaseline * (1 - homeObservedShare)) + (observedHomeExpected ?? homeMatchupBaseline) * homeObservedShare;
  const awayBaseline = (awayMatchupBaseline * (1 - awayObservedShare)) + (observedAwayExpected ?? awayMatchupBaseline) * awayObservedShare;
  const netEdge = clamp((homeStrength.net - awayStrength.net) * FRANCHISE_NET_MATCHUP_SCALE, -8, 8);
  const homeFourFactorEdge = clamp(((homeStrength.factorQuality?.offense || 0) - (awayStrength.factorQuality?.defense || 0)) * FRANCHISE_FOUR_FACTOR_MATCHUP_SCALE, -4, 4);
  const awayFourFactorEdge = clamp(((awayStrength.factorQuality?.offense || 0) - (homeStrength.factorQuality?.defense || 0)) * FRANCHISE_FOUR_FACTOR_MATCHUP_SCALE, -4, 4);
  // Coaching is a declared scenario choice. Each emphasis contributes at most
  // four points to the matchup, for a maximum eight-point swing per side.
  // It changes the simulated matchup without claiming a measured coach effect.
  const homePlanEdge = clamp((Number(home.coaching?.offense ?? 50) - 50) * 0.08, -4, 4)
    - clamp((Number(away.coaching?.defense ?? 50) - 50) * 0.08, -4, 4);
  const awayPlanEdge = clamp((Number(away.coaching?.offense ?? 50) - 50) * 0.08, -4, 4)
    - clamp((Number(home.coaching?.defense ?? 50) - 50) * 0.08, -4, 4);
  const homeExpected = homeBaseline + netEdge + homeFourFactorEdge + homePlanEdge + 2.2;
  const awayExpected = awayBaseline - netEdge + awayFourFactorEdge + awayPlanEdge;
  const scoreNoise = clamp(9 * Math.sqrt(pace / 100), 8.5, 10.5);
  const regulationHomeScore = Math.max(70, Math.round(homeExpected + normal(random, 0, scoreNoise) - home.fatigue * 2));
  const regulationAwayScore = Math.max(70, Math.round(awayExpected + normal(random, 0, scoreNoise) - away.fatigue * 2));
  const finalScore = resolveFranchiseOvertime({ homeScore: regulationHomeScore, awayScore: regulationAwayScore,
    homeExpectedRegulationPoints: Math.max(70, homeExpected - home.fatigue * 2),
    awayExpectedRegulationPoints: Math.max(70, awayExpected - away.fatigue * 2), random });
  const homeScore = finalScore.homeScore, awayScore = finalScore.awayScore;
  const homeLineup = extendRotationForOvertime(homeRotation, finalScore.overtimePeriods);
  const awayLineup = extendRotationForOvertime(awayRotation, finalScore.overtimePeriods);
  const scheduledRow = game.scheduleGameId != null || game.sourceGameId != null || game.id != null;
  const scheduleGameId = text(game.scheduleGameId || game.sourceGameId || game.id, gameId);
  const homeBoxResult = gameBoxScore(home, homeLineup, homeScore, random, gameId);
  const awayBoxResult = gameBoxScore(away, awayLineup, awayScore, random, gameId);
  const homeBox = homeBoxResult.rows, awayBox = awayBoxResult.rows;
  const homeBoxAudit = reconcileBoxStats(homeScore, homeBox);
  const awayBoxAudit = reconcileBoxStats(awayScore, awayBox);
  const minutesReconciliation = auditFranchiseMinutes({ home: homeBox, away: awayBox }, finalScore.overtimePeriods);
  const winner = homeScore > awayScore ? home.teamId : away.teamId;
  const factorStatus = homeStrength.factorQuality?.status === 'observed' && awayStrength.factorQuality?.status === 'observed' ? 'observed'
    : homeStrength.factorQuality?.status !== 'unavailable' || awayStrength.factorQuality?.status !== 'unavailable' ? 'partial' : 'unavailable';
  const phase = text(game.phase).toLowerCase() === 'playoffs' ? 'playoffs' : (scheduledRow ? 'regular' : 'playoffs');
  const scheduleKind = scheduledRow ? (state.source?.schedule?.kind || 'generated') : 'simulated-postseason';
  const scheduleEvidence = scheduledRow
    ? (state.source?.schedule?.evidenceKind || (scheduleKind === 'actual' ? 'observed-calendar' : 'modeled-schedule-scenario'))
    : 'modeled-postseason';
  const result = { gameId, scheduleGameId, scheduledAt: game.scheduledAt || null, scheduleKind, scheduleEvidence, phase, seasonStartYear: state.currentSeason, round: game.round, homeTeamId: home.teamId, awayTeamId: away.teamId, homeScore, awayScore, regulationHomeScore: finalScore.regulationHomeScore, regulationAwayScore: finalScore.regulationAwayScore, overtimePeriods: finalScore.overtimePeriods, overtimeHomeScore: finalScore.overtimeHomeScore, overtimeAwayScore: finalScore.overtimeAwayScore, overtimePeriodScores: finalScore.overtimePeriodScores, overtimeModelVersion: FRANCHISE_OVERTIME_MODEL_VERSION, minutesModelVersion: FRANCHISE_MINUTES_MODEL_VERSION, minutesReconciliation, rotationPlanReceipts: { [home.teamId]: homeRotationPlan.receipt, [away.teamId]: awayRotationPlan.receipt }, winner, boxScores: { [home.teamId]: homeBox, [away.teamId]: awayBox }, boxScoreModel: { version: FRANCHISE_BOX_SCORE_MODEL_VERSION, teams: { [home.teamId]: homeBoxResult.derivation, [away.teamId]: awayBoxResult.derivation } }, boxScoreReconciliation: { [home.teamId]: homeBoxAudit, [away.teamId]: awayBoxAudit }, matchupModel: { version: 'observed-baseline-calibrated-native-net-four-factors-v3', pace: round(pace), paceSource: 'team-harmonic-mean', homeBaseline: round(homeBaseline), awayBaseline: round(awayBaseline), observedShare: round(homeNativeShare), observedShareByTeam: { home: round(homeNativeShare), away: round(awayNativeShare) }, observedBaselineShareByTeam: { home: round(homeObservedShare), away: round(awayObservedShare) }, observedBaselineByTeam: { home: observedHome, away: observedAway }, baselineSourceByTeam: { home: observedScoringBaselineSource(observedHome), away: observedScoringBaselineSource(observedAway) }, expectedHome: round(homeExpected), expectedAway: round(awayExpected), netEdge: round(netEdge), fourFactorEdge: { home: round(homeFourFactorEdge), away: round(awayFourFactorEdge), homeOffenseQuality: round(homeStrength.factorQuality?.offense || 0), awayDefenseQuality: round(awayStrength.factorQuality?.defense || 0), awayOffenseQuality: round(awayStrength.factorQuality?.offense || 0), homeDefenseQuality: round(homeStrength.factorQuality?.defense || 0), status: factorStatus }, coachingScenario: { home: round(homePlanEdge), away: round(awayPlanEdge), source: 'user-or-cpu-scenario-choice' }, scoreNoise: round(scoreNoise) }, evidence: 'simulated', seed: state.seed };
  Object.assign(result.matchupModel.fourFactorEdge, {
    homeOffenseQuality: reportedFactorQuality(homeStrength.factorQuality, 'offense'),
    homeDefenseQuality: reportedFactorQuality(homeStrength.factorQuality, 'defense'),
    awayOffenseQuality: reportedFactorQuality(awayStrength.factorQuality, 'offense'),
    awayDefenseQuality: reportedFactorQuality(awayStrength.factorQuality, 'defense'),
  });
  result.matchupModel.version = 'observed-baseline-active-rotation-native-net-four-factors-v6-score-contributions';
  result.matchupModel.scoreContributionAudit = {
    status: 'descriptive-current-equation-not-calibrated',
    scope: 'expected-points-before-score-noise',
    overlapDisclosure: 'Observed points-per-game, opponent points-allowed, native net rating, and Four Factors overlap as season-performance signals; these additive terms have not been calibrated on held-out seasons.',
    teams: {
      home: {
        matchupRatingBaseline: round(homeMatchupBaseline * (1 - homeObservedShare), 4),
        observedScoringBaseline: round((observedHomeExpected ?? homeMatchupBaseline) * homeObservedShare, 4),
        baselineTotal: round(homeBaseline, 4),
        strengthNetEdge: round(netEdge, 4),
        fourFactorEdge: round(homeFourFactorEdge, 4),
        coachingScenario: round(homePlanEdge, 4),
        homeCourt: 2.2,
        expectedPoints: round(homeExpected),
      },
      away: {
        matchupRatingBaseline: round(awayMatchupBaseline * (1 - awayObservedShare), 4),
        observedScoringBaseline: round((observedAwayExpected ?? awayMatchupBaseline) * awayObservedShare, 4),
        baselineTotal: round(awayBaseline, 4),
        strengthNetEdge: round(-netEdge, 4),
        fourFactorEdge: round(awayFourFactorEdge, 4),
        coachingScenario: round(awayPlanEdge, 4),
        homeCourt: 0,
        expectedPoints: round(awayExpected),
      },
    },
  };
  result.matchupModel.rotationStrengthByTeam = {
    home: { source: 'active-game-rotation', offense: round(homeStrength.offense), defense: round(homeStrength.defense), net: round(homeStrength.net),
      defenseConvention: homeStrength.defenseConvention, netConvention: homeStrength.netConvention,
      baselineOffense: round(homeBaselineStrength.offense), baselineDefense: round(homeBaselineStrength.defense), baselineNet: round(homeBaselineStrength.net) },
    away: { source: 'active-game-rotation', offense: round(awayStrength.offense), defense: round(awayStrength.defense), net: round(awayStrength.net),
      defenseConvention: awayStrength.defenseConvention, netConvention: awayStrength.netConvention,
      baselineOffense: round(awayBaselineStrength.offense), baselineDefense: round(awayBaselineStrength.defense), baselineNet: round(awayBaselineStrength.net) },
  };
  const homeRecord = phase === 'playoffs' ? home.postseasonRecord : home.record;
  const awayRecord = phase === 'playoffs' ? away.postseasonRecord : away.record;
  homeRecord.pointsFor += homeScore; homeRecord.pointsAgainst += awayScore; awayRecord.pointsFor += awayScore; awayRecord.pointsAgainst += homeScore;
  if (winner === home.teamId) { homeRecord.wins += 1; awayRecord.losses += 1; } else { awayRecord.wins += 1; homeRecord.losses += 1; }
  home.fatigue = clamp(home.fatigue * 0.82 + 0.08, 0, 1); away.fatigue = clamp(away.fatigue * 0.82 + 0.08, 0, 1);
  [[home, 'home', homeBox, homeBoxAudit, homeScore], [away, 'away', awayBox, awayBoxAudit, awayScore]].forEach(([team, side, boxes, boxAudit, score]) => {
    boxes.forEach(box => applyPlayerGame(team, box, state.currentSeason));
    team.playerLedger = team.playerLedger || {};
    boxes.forEach(box => {
      const entry = team.playerLedger[box.playerRef] || { playerRef: box.playerRef, displayName: box.displayName, games: 0, minutes: 0, ...emptyTeamStats() };
      if (box.minutes > 0) entry.games += 1;
      entry.minutes += box.minutes;
      STAT_KEYS.forEach(key => { entry[key] += box[key]; });
      team.playerLedger[box.playerRef] = entry;
    });
    // Reuse the per-game aggregation already built for reconciliation. Points
    // remain anchored to the final score if an allocation ever fails to reconcile.
    const boxTotals = boxAudit.totals;
    team.teamStats = team.teamStats || emptyTeamStats();
    STAT_KEYS.forEach(key => { team.teamStats[key] += key === 'points' ? score : boxTotals[key]; });
    if (boxAudit.status !== 'reconciled' || minutesReconciliation.teams[side].status !== 'reconciled') {
      team.playerLedgerCoverage = team.roster.length ? 'partial' : 'unavailable';
    } else if (team.playerLedgerCoverage === 'unavailable') {
      team.playerLedgerCoverage = 'partial';
    }
    team.roster.forEach(player => {
      if (player.injury?.gamesRemaining > 0) player.injury.gamesRemaining -= 1;
      if (player.injury && player.injury.gamesRemaining <= 0) player.injury = null;
      if (!player.injury && random() < (1 - Number(player.durability || 70) / 100) * (0.001 + Number(player.fatigue || 0) * 0.004)) {
        const games = 1 + Math.floor(random() * 8);
        player.injury = { kind: 'soft-tissue', gamesRemaining: games, evidence: 'simulation-event' };
        team.injuries.push({ playerRef: player.playerRef, gamesRemaining: games, gameId });
      }
    });
  });
  return result;
}

function standingsFor(state) {
  const teamIds = new Set(state.teams.map(team => team.teamId));
  const regularGames = (Array.isArray(state.gameLogs) ? state.gameLogs : [])
    .filter(game => text(game.phase).toLowerCase() === 'regular'
      && teamIds.has(game.homeTeamId) && teamIds.has(game.awayTeamId));
  const rows = [...state.teams].map(team => {
    const tieBreakSeed = Number.parseInt(stableHash(`${state.seed}:${state.currentSeason}:regular-standings:${team.teamId}`), 16) / 0x100000000;
    const games = team.record.wins + team.record.losses;
    return { teamId: team.teamId, displayName: team.displayName,
      conference: team.conference || null, division: team.division || null,
      wins: team.record.wins, losses: team.record.losses, games,
      winRate: round(team.record.wins / Math.max(1, games)),
      pointDifferential: team.record.pointsFor - team.record.pointsAgainst,
      pointsFor: team.record.pointsFor, pointsAgainst: team.record.pointsAgainst,
      headToHeadWins: 0, headToHeadLosses: 0, headToHeadWinRate: null,
      tieBreakSeed: round(tieBreakSeed, 8) };
  });
  // Regular standings use win rate first so an observed/custom calendar with
  // unequal team coverage cannot reward a team merely for playing more games.
  // Head-to-head, point differential, and a seeded deterministic lottery then
  // resolve exact rate ties. The same ranking function is applied within each
  // conference and division so a strong team in the other conference cannot
  // consume a local seed. The seed is derived from persisted scenario identity
  // rather than gameplay RNG.
  const rankRows = subset => {
    const byWinRate = new Map();
    subset.forEach(row => {
      const rate = row.wins / Math.max(1, row.games);
      const group = byWinRate.get(rate) || [];
      group.push(row);
      byWinRate.set(rate, group);
    });
    return [...byWinRate.entries()].sort((a, b) => Number(b[0]) - Number(a[0])).flatMap(([, group]) => {
      const tiedIds = new Set(group.map(row => row.teamId));
      const withinGroup = new Map(group.map(row => [row.teamId, { wins: 0, losses: 0 }]));
      regularGames.forEach(game => {
        if (!tiedIds.has(game.homeTeamId) || !tiedIds.has(game.awayTeamId)) return;
        const winner = game.winner, loser = winner === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        if (withinGroup.has(winner) && withinGroup.has(loser)) { withinGroup.get(winner).wins += 1; withinGroup.get(loser).losses += 1; }
      });
      return group.map(row => {
        const local = withinGroup.get(row.teamId), games = local.wins + local.losses;
        return { ...row, headToHeadWins: local.wins, headToHeadLosses: local.losses, headToHeadWinRate: games ? round(local.wins / games) : null };
      }).sort((a, b) => (b.headToHeadWinRate ?? -1) - (a.headToHeadWinRate ?? -1)
        || b.pointDifferential - a.pointDifferential || b.pointsFor - a.pointsFor || a.tieBreakSeed - b.tieBreakSeed || a.teamId.localeCompare(b.teamId));
    });
  };
  const sortedRows = rankRows(rows);
  const rowsWithSeeds = sortedRows.map((row, index) => ({ ...row, seed: index + 1 }));
  const conferenceSeeds = new Map(), divisionSeeds = new Map();
  for (const scope of ['conference', 'division']) {
    const values = [...new Set(rows.map(row => row[scope]).filter(Boolean))];
    const target = scope === 'conference' ? conferenceSeeds : divisionSeeds;
    values.forEach(value => rankRows(rows.filter(row => row[scope] === value)).forEach((row, index) => target.set(row.teamId, index + 1)));
  }
  return rowsWithSeeds.map(row => {
    const conferenceSeed = row.conference ? conferenceSeeds.get(row.teamId) || null : null;
    const divisionSeed = row.division ? divisionSeeds.get(row.teamId) || null : null;
    return { ...row, conferenceSeed, divisionSeed };
  });
}

function leadersFor(state) {
  const rows = [...state.teams.flatMap(team => team.roster), ...(state.freeAgents || [])]
    .map(player => ({ ...player.seasonStats, playerRef: player.playerRef, displayName: player.displayName, teamId: player.teamId || null }));
  const leader = key => [...rows].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || a.playerRef.localeCompare(b.playerRef)).slice(0, 10);
  return Object.fromEntries(STAT_KEYS.concat(['minutes']).map(key => [key, leader(key)]));
}

function seasonTotalsAudit(team) {
  const ledgerRows = team.playerLedger && typeof team.playerLedger === 'object' ? Object.values(team.playerLedger) : null;
  const playerAvailable = ledgerRows ? ledgerRows.length > 0 : Array.isArray(team.roster) && team.roster.length > 0;
  const playerCoverage = team.playerLedgerCoverage === 'partial' ? 'partial'
    : team.playerLedgerCoverage === 'unavailable' || !playerAvailable ? 'unavailable' : 'complete';
  const playerTotals = Object.fromEntries(STAT_KEYS.map(key => [key,
    (ledgerRows || team.roster).reduce((sum, player) => sum + Math.max(0, Number((ledgerRows ? player : player.seasonStats)?.[key]) || 0), 0)]));
  const teamTotals = Object.fromEntries(STAT_KEYS.map(key => [key, Math.max(0, Number(team.teamStats?.[key]) || 0)]));
  const pointsFromRecord = Number(team.record?.pointsFor || 0) + Number(team.postseasonRecord?.pointsFor || 0);
  const byStat = Object.fromEntries(STAT_KEYS.map(key => {
    const target = key === 'points' ? pointsFromRecord : teamTotals[key];
    const playerSum = playerTotals[key];
    const teamSum = teamTotals[key];
    return [key, { teamTotal: teamSum, playerTotal: playerSum, target, teamStatus: teamSum === target ? 'reconciled' : 'mismatch', playerStatus: playerCoverage === 'partial' ? 'partial' : playerAvailable ? (playerSum === target ? 'reconciled' : 'mismatch') : 'unavailable', playerDelta: playerCoverage === 'complete' ? playerSum - target : null }];
  }));
  const teamMismatch = Object.values(byStat).some(row => row.teamStatus === 'mismatch');
  const playerMismatch = playerCoverage === 'complete' && Object.values(byStat).some(row => row.playerStatus === 'mismatch');
  return { teamTotals, playerTotals, byStat, playerCoverage, status: teamMismatch || playerMismatch ? 'mismatch' : playerCoverage === 'complete' ? 'reconciled' : 'partial' };
}

const PLAYOFF_HIGHER_SEED_HOME_GAMES = Object.freeze({
  1: Object.freeze([0]),
  3: Object.freeze([0, 2]),
  5: Object.freeze([0, 1, 4]),
  7: Object.freeze([0, 1, 4, 6]),
});

function seriesWinner(state, teamA, teamB, length, random, round, {
  conference = null, stage = 'generic-round', seedA = 1, seedB = 2,
} = {}) {
  const higherSeedTeam = Number(seedA) <= Number(seedB) ? teamA : teamB;
  const lowerSeedTeam = higherSeedTeam === teamA ? teamB : teamA;
  const higherSeedHomeGames = new Set(PLAYOFF_HIGHER_SEED_HOME_GAMES[length] || [0]);
  let winsA = 0, winsB = 0, gameIndex = 0;
  while (winsA < Math.ceil(length / 2) && winsB < Math.ceil(length / 2)) {
    const higherSeedHosts = higherSeedHomeGames.has(gameIndex);
    const homeTeamId = higherSeedHosts ? higherSeedTeam : lowerSeedTeam;
    const awayTeamId = higherSeedHosts ? lowerSeedTeam : higherSeedTeam;
    const result = simulateGame(state, { round: `${round}-${gameIndex + 1}`, phase: 'playoffs', homeTeamId, awayTeamId }, random);
    if (result.winner === teamA) winsA += 1; else winsB += 1;
    state.gameLogs.push(result); gameIndex += 1;
  }
  return { round, stage, conference, a: teamA, b: teamB, winsA, winsB, winner: winsA > winsB ? teamA : teamB };
}

function runPlayoffs(state, random) {
  const field = Math.min(Number(state.settings.playoffTeams || 0), state.teams.length);
  if (!field) return null;
  const standings = standingsFor(state);
  const standingsById = new Map(standings.map(row => [row.teamId, row]));
  const eligibleField = standings.slice(0, field);
  if (eligibleField.length !== field || new Set(eligibleField.map(row => row.teamId)).size !== field
    || eligibleField.some(row => row.wins + row.losses < 1)) {
    throw new Error('Franchise playoff field requires unique teams with at least one regular-season result.');
  }
  // Saved states from before the explicit-series setting are treated as the
  // historical default (best of seven), while new states carry the value in
  // their receipt and result.
  const length = PLAYOFF_SERIES_LENGTHS.includes(Number(state.settings.seriesLength))
    ? Number(state.settings.seriesLength) : 7;
  const bracket = [];
  const teamById = new Map(state.teams.map(team => [team.teamId, team]));
  const conferenceCounts = {
    east: state.teams.filter(team => team.conference === 'east').length,
    west: state.teams.filter(team => team.conference === 'west').length,
  };
  const perConference = field / 2;
  const conferenceAware = Number.isInteger(field) && field % 2 === 0
    && [2, 4, 8, 16].includes(field)
    && perConference >= 1
    && conferenceCounts.east >= perConference
    && conferenceCounts.west >= perConference;
  const stageFor = size => size === 8 ? 'conference-quarterfinal' : size === 4 ? 'conference-semifinal' : size === 2 ? 'conference-final' : 'conference-round';
  if (conferenceAware) {
    const conferenceWinners = {};
    const conferenceField = {};
    const selectedIds = [];
    for (const conference of ['east', 'west']) {
      let roundTeams = standings.filter(row => teamById.get(row.teamId)?.conference === conference)
        .sort((a, b) => (a.conferenceSeed || Number.MAX_SAFE_INTEGER) - (b.conferenceSeed || Number.MAX_SAFE_INTEGER))
        .slice(0, perConference).map(row => row.teamId);
      conferenceField[conference] = [...roundTeams];
      selectedIds.push(...roundTeams);
      let roundName = roundTeams.length === 1 ? 'Conference final' : 'Conference first round';
      while (roundTeams.length > 1) {
        const next = [];
        for (let index = 0; index < roundTeams.length / 2; index += 1) {
          const teamA = roundTeams[index], teamB = roundTeams[roundTeams.length - 1 - index];
          const series = seriesWinner(state, teamA, teamB, length, random, roundName,
            { conference, stage: stageFor(roundTeams.length), seedA: standingsById.get(teamA)?.conferenceSeed, seedB: standingsById.get(teamB)?.conferenceSeed });
          bracket.push(series); next.push(series.winner);
        }
        roundTeams = next;
        roundName = roundTeams.length === 2 ? 'Conference final' : 'Conference round';
      }
      conferenceWinners[conference] = roundTeams[0] || null;
    }
    const finals = seriesWinner(state, conferenceWinners.east, conferenceWinners.west, length, random, 'NBA Finals', {
      conference: 'finals', stage: 'finals', seedA: standingsById.get(conferenceWinners.east)?.seed,
      seedB: standingsById.get(conferenceWinners.west)?.seed,
    });
    bracket.push(finals);
    const finalSeries = bracket[bracket.length - 1];
    const conferenceLocal = bracket.filter(series => series.stage !== 'finals').every(series => series.conference && teamById.get(series.a)?.conference === series.conference && teamById.get(series.b)?.conference === series.conference);
    const finalOpposite = finalSeries?.stage === 'finals'
      && teamById.get(finalSeries.a)?.conference && teamById.get(finalSeries.b)?.conference
      && teamById.get(finalSeries.a).conference !== teamById.get(finalSeries.b).conference;
    const missingStandingsTeams = selectedIds.filter(teamId => (standingsById.get(teamId)?.wins || 0) + (standingsById.get(teamId)?.losses || 0) < 1);
    const fieldUnique = selectedIds.length === field && new Set(selectedIds).size === selectedIds.length;
    const standingsEligible = missingStandingsTeams.length === 0;
    if (!fieldUnique || !standingsEligible) throw new Error('Franchise playoff field requires unique teams with at least one regular-season result.');
    return { field, seriesLength: length, championId: finals.winner, series: bracket, structure: 'conference-aware', conferenceField, integrity: { fieldUnique, fieldSize: selectedIds.length, standingsEligible, missingStandingsTeams, conferenceLocal, finalOpposite, status: conferenceLocal && finalOpposite ? 'passed' : 'failed' }, evidence: 'simulated' };
  }
  let roundTeams = standings.slice(0, field).map(row => row.teamId);
  let roundName = 'First round';
  while (roundTeams.length > 1) {
    const next = [];
    for (let index = 0; index < roundTeams.length / 2; index += 1) {
      const teamA = roundTeams[index], teamB = roundTeams[roundTeams.length - 1 - index];
      const series = seriesWinner(state, teamA, teamB, length, random, roundName,
        { seedA: standingsById.get(teamA)?.seed, seedB: standingsById.get(teamB)?.seed });
      bracket.push(series); next.push(series.winner);
    }
    roundTeams = next; roundName = roundTeams.length === 2 ? 'Final' : 'Conference round';
  }
  const genericField = standings.slice(0, field).map(row => row.teamId);
  const genericMissing = genericField.filter(teamId => (standingsById.get(teamId)?.wins || 0) + (standingsById.get(teamId)?.losses || 0) < 1);
  const genericUnique = genericField.length === field && new Set(genericField).size === genericField.length;
  if (!genericUnique || genericMissing.length) throw new Error('Franchise playoff field requires unique teams with at least one regular-season result.');
  return { field, seriesLength: length, championId: roundTeams[0] || null, series: bracket, structure: 'generic', conferenceField: null, integrity: { fieldUnique: genericUnique, fieldSize: genericField.length, standingsEligible: genericMissing.length === 0, missingStandingsTeams: genericMissing, conferenceLocal: null, finalOpposite: null, status: 'passed' }, evidence: 'simulated' };
}

function cpuManageTeam(state, team, random) {
  const active = team.roster.filter(player => player.status === 'active');
  if (active.length > 15) {
    const cut = [...active].sort((a, b) => Number(a.ratings?.defense || 0) - Number(b.ratings?.defense || 0) || Number(a.potential || 0) - Number(b.potential || 0))[0];
    const rosterIndex = team.roster.indexOf(cut);
    if (rosterIndex >= 0) team.roster.splice(rosterIndex, 1);
    cut.status = 'waived'; team.transactions.push({ type: 'waive', playerRef: cut.playerRef, seasonStartYear: state.currentSeason, reason: 'cpu-roster-management' });
    state.freeAgents.push({ ...cut, teamId: null, contract: { ...cut.contract, status: 'free-agent' } });
  }
  const needs = Math.max(0, 10 - team.roster.filter(player => player.status === 'active').length);
  for (let index = 0; index < needs && state.freeAgents.length; index += 1) {
    const sorted = [...state.freeAgents].sort((a, b) => Number(b.ratings?.[index % 2 ? 'defense' : 'scoring'] || 0) - Number(a.ratings?.[index % 2 ? 'defense' : 'scoring'] || 0));
    const player = sorted[0]; if (!player) break;
    state.freeAgents = state.freeAgents.filter(item => item.playerRef !== player.playerRef);
    player.teamId = team.teamId; player.status = 'active'; player.contract = { ...player.contract, status: 'active', yearsRemaining: 1, source: 'seeded-cpu-signing-scenario' };
    team.roster.push(player); team.transactions.push({ type: 'sign', playerRef: player.playerRef, seasonStartYear: state.currentSeason, reason: 'cpu-roster-management' });
  }
  team.coaching.pace = clamp(Number(team.coaching.pace || 100) + normal(random, 0, 1.5), 94, 106);
}

function draftOrder(state, random) {
  const rows = standingsFor(state);
  const remaining = rows.map(row => ({ teamId: row.teamId, seed: row.seed, weight: Math.max(1, rows.length - row.seed + 1) * 10 }));
  const order = [];
  while (remaining.length) {
    const total = remaining.reduce((sum, row) => sum + row.weight, 0);
    let target = random() * total;
    let selectedIndex = remaining.length - 1;
    for (let index = 0; index < remaining.length; index += 1) {
      target -= remaining[index].weight;
      if (target <= 0) { selectedIndex = index; break; }
    }
    order.push(remaining.splice(selectedIndex, 1)[0].teamId);
  }
  return order;
}

function franchiseSeasonCheckpoint(state, completedGameIndex) {
  const game = state.gameLogs[completedGameIndex - 1];
  const record = team => Object.freeze({
    wins: team.record.wins, losses: team.record.losses,
    pointsFor: team.record.pointsFor, pointsAgainst: team.record.pointsAgainst,
  });
  return Object.freeze({
    completedGameIndex,
    totalGames: state.schedule.length,
    lastGame: Object.freeze(deepClone(game)),
    nextGame: state.schedule[completedGameIndex] ? Object.freeze({ ...state.schedule[completedGameIndex] }) : null,
    standings: Object.freeze(standingsFor(state)),
    teams: Object.freeze(state.teams.map(team => Object.freeze({
      teamId: team.teamId, displayName: team.displayName,
      record: record(team), teamStats: Object.freeze({ ...team.teamStats }),
      players: Object.freeze(team.roster.map(player => Object.freeze({
        playerRef: player.playerRef, displayName: player.displayName,
        seasonStats: Object.freeze({ ...player.seasonStats }),
      }))),
    }))),
  });
}

function finalizeFranchiseSeason(state, random) {
  state.standings = standingsFor(state);
  state.leaders = leadersFor(state);
  state.allGameLeaders = state.leaders;
  state.calendar.status = 'postseason';
  state.playoffs = runPlayoffs(state, random);
  state.calendar.status = 'complete';
  state.allGameLeaders = leadersFor(state);
  const totalsReconciliation = Object.fromEntries(state.teams.map(team => [team.teamId, seasonTotalsAudit(team)]));
  const summary = { seasonStartYear: state.currentSeason, standings: state.standings, championId: state.playoffs?.championId || null, games: state.gameLogs.length,
    regularSeasonGames: state.gameLogs.filter(game => game.phase === 'regular').length,
    playoffGames: state.gameLogs.filter(game => game.phase === 'playoffs').length,
    leaders: state.leaders, allGameLeaders: state.allGameLeaders,
    leaderScopes: { regularSeason: 'regular-season', allGames: 'regular-season-plus-playoffs' },
    playoffSeries: state.playoffs?.series || [], playoffStructure: state.playoffs?.structure || null,
    playoffField: state.playoffs?.conferenceField || null, playoffSeriesLength: state.playoffs?.seriesLength || null,
    playoffIntegrity: state.playoffs?.integrity || null,
    teamTotals: Object.fromEntries(state.teams.map(team => [team.teamId, { ...team.teamStats }])),
    totalsReconciliation,
    standingsModel: 'win-rate-head-to-head-point-differential-seeded-tiebreak-v1',
    postseasonRecords: Object.fromEntries(state.teams.map(team => [team.teamId, { ...team.postseasonRecord }])),
    scheduleKind: state.source.schedule.kind, scheduleEvidence: state.source.schedule.evidenceKind,
    scheduleCalendar: state.source.schedule.coverage?.calendar || null,
    evidence: 'simulated', modelVersion: FRANCHISE_SIMULATION_MODEL_VERSION };
  state.lastResult = summary; state.updatedAt = new Date().toISOString();
  return summary;
}

function ensurePlayerLedgers(state) {
  for (const team of state.teams) {
    if (team.playerLedgerCoverage !== 'complete') continue;
    if (!team.roster.length) {
      team.playerLedger = team.playerLedger || {};
      continue;
    }
    const existing = team.playerLedger && typeof team.playerLedger === 'object' ? Object.values(team.playerLedger) : null;
    const rows = existing || team.roster.map(player => ({ playerRef: player.playerRef, displayName: player.displayName,
      games: player.seasonStats?.games || 0, minutes: player.seasonStats?.minutes || 0, ...Object.fromEntries(STAT_KEYS.map(key => [key, player.seasonStats?.[key] || 0])) }));
    if (STAT_KEYS.some(key => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) !== Number(team.teamStats?.[key] || 0))) {
      throw new Error('Saved franchise player ledger cannot reconcile this team’s completed games. Replay the season to recover.');
    }
    if (!existing) team.playerLedger = Object.fromEntries(rows.filter(row => row.games > 0).map(row => [row.playerRef, row]));
  }
}

async function runFranchiseGames(stateInput, { games, restart = false, signal, onProgress, onCheckpoint,
  yieldEvery = 50, checkpointEvery = yieldEvery } = {}) {
  const state = parseFranchiseLeague(stateInput);
  const schedule = state.schedule;
  const startingIndex = restart ? 0 : Number(state.calendar?.gameIndex || 0);
  if (!restart && state.calendar?.status === 'complete') throw new Error('This franchise season is complete. Replay it or advance the offseason.');
  if (!Number.isInteger(startingIndex) || startingIndex < 0 || startingIndex >= schedule.length && !restart
    || !restart && state.gameLogs.length !== startingIndex
    || !restart && startingIndex > 0 && (typeof state.regularRandomState !== 'number' || !integer(state.regularRandomState, 0, 0xffffffff))) {
    throw new Error('Franchise checkpoint progress is malformed. Replay the season to recover.');
  }
  if (restart || startingIndex === 0) {
    state.calendar.status = 'regular-season'; state.calendar.day = 0; state.calendar.gameIndex = 0;
    state.calendar.totalGames = schedule.length; state.calendar.scheduledAt = null; state.calendar.lastGame = null; state.gameLogs = [];
    state.standings = []; state.leaders = {}; state.allGameLeaders = {}; state.playoffs = null; state.lastResult = null;
    if (Array.isArray(state.freeAgents)) state.freeAgents.forEach(player => resetPlayerForNewSeason(player, { activate: false }));
    const factorBaselines = fourFactorBaselines(state.teams);
    state.teams.forEach(team => {
      resetTeamSeason(team);
      resetDefaultRotation(team, state.seed, state.currentSeason);
      team.strength = teamStrength(team, factorBaselines);
    });
  } else ensurePlayerLedgers(state);
  const random = createRandom(`${state.seed}:${state.currentSeason}:regular`, startingIndex > 0 && !restart ? state.regularRandomState : null);
  const endingIndex = Math.min(schedule.length, startingIndex + games);
  const interval = integer(yieldEvery, 1, 100000) ? Number(yieldEvery) : 50;
  const checkpointInterval = integer(checkpointEvery, 1, 100000) ? Number(checkpointEvery) : interval;
  let checkpoint = null;
  for (let index = startingIndex; index < endingIndex; index += 1) {
    if (signal?.aborted) throw new DOMException('Franchise season cancelled.', 'AbortError');
    state.calendar.day = index + 1;
    state.calendar.gameIndex = index + 1;
    state.calendar.scheduledAt = schedule[index].scheduledAt || null;
    const game = simulateGame(state, schedule[index], random);
    state.gameLogs.push(game);
    state.calendar.lastGame = deepClone(game);
    state.regularRandomState = random.state();
    if ((index + 1) % interval === 0 || index + 1 === endingIndex) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (signal?.aborted) throw new DOMException('Franchise season cancelled.', 'AbortError');
      onProgress?.((index + 1) / schedule.length);
    }
    if ((index + 1) % checkpointInterval === 0 || index + 1 === endingIndex) {
      checkpoint = franchiseSeasonCheckpoint(state, index + 1);
      onCheckpoint?.(checkpoint);
    }
  }
  state.standings = standingsFor(state);
  state.leaders = leadersFor(state);
  state.allGameLeaders = state.leaders;
  if (endingIndex < schedule.length) {
    state.calendar.status = 'regular-season'; state.updatedAt = new Date().toISOString();
    return { state, result: null, checkpoint };
  }
  return { state, result: finalizeFranchiseSeason(state, random), checkpoint };
}

export async function simulateFranchiseCheckpoint(stateInput, { games = 1, signal, onProgress, onCheckpoint,
  yieldEvery = 50, checkpointEvery = yieldEvery } = {}) {
  if (!integer(games, 1, 20000)) throw new Error('Franchise checkpoint games must be a positive whole number.');
  return runFranchiseGames(stateInput, { games: Number(games), signal, onProgress, onCheckpoint, yieldEvery, checkpointEvery });
}

export async function simulateFranchiseSeason(stateInput, { signal, onProgress, onCheckpoint,
  yieldEvery = 50, checkpointEvery = yieldEvery } = {}) {
  return runFranchiseGames(stateInput, { games: Number.POSITIVE_INFINITY, restart: true, signal, onProgress, onCheckpoint, yieldEvery, checkpointEvery });
}

export function applyFranchiseCoaching(stateInput, { teamId, pace, offense, defense, rotation } = {}) {
  const state = parseFranchiseLeague(stateInput);
  if (state.calendar.status === 'complete') throw new Error('Advance or replay the season before changing its game plan.');
  const team = state.teams.find(item => item.teamId === text(teamId));
  if (!team || team.control !== 'user') throw new Error('Coaching decisions require a user-controlled team.');
  const plan = { ...team.coaching };
  for (const [key, value, min, max] of [['pace', pace, 94, 106], ['offense', offense, 0, 100], ['defense', defense, 0, 100]]) {
    if (value === undefined) continue;
    if (!finite(value) || Number(value) < min || Number(value) > max) throw new Error(`Coaching ${key} must be between ${min} and ${max}.`);
    plan[key] = Number(value);
  }
  plan.source = 'user-scenario-choice';
  if (rotation !== undefined) {
    if (!Array.isArray(rotation) || rotation.length < 5 || rotation.length > 10) throw new Error('Coaching rotation needs 5 to 10 players.');
    const references = new Set();
    for (const row of rotation) {
      const playerRef = text(row?.playerRef);
      if (!SAFE_ID.test(playerRef) || references.has(playerRef)
        || !team.roster.some(player => player.playerRef === playerRef && player.status === 'active')) {
        throw new Error('Coaching rotation must use distinct active players from the selected team.');
      }
      if (!integer(row.minutes, 1, 48)) throw new Error('Coaching target minutes must be whole numbers between 1 and 48.');
      const relativeUsage = row.relativeUsage === undefined ? 1 : Number(row.relativeUsage);
      if (!Number.isFinite(relativeUsage) || relativeUsage < 0.5 || relativeUsage > 1.5) {
        throw new Error('Relative usage must be between 50% and 150% of baseline.');
      }
      if (row.usageRole !== undefined
        && !['lead-creator', 'primary-scorer', 'balanced', 'connector', 'low-usage', 'custom'].includes(row.usageRole)) {
        throw new Error('Choose a supported player utilization role.');
      }
      references.add(playerRef);
    }
    team.roster.forEach(player => { player.rotationMinutes = rotation.find(row => row.playerRef === player.playerRef)?.minutes || 0; });
    team.rotation = rotation.map(row => ({
      playerRef: row.playerRef,
      minutes: Number(row.minutes),
      relativeUsage: row.relativeUsage === undefined ? 1 : Number(row.relativeUsage),
      usageRole: row.usageRole || 'balanced',
    }));
    team.rotationSource = 'user-saved';
    team.rotationModelVersion = 'user-authored';
  }
  team.coaching = plan;
  team.strength = teamStrength(team, fourFactorBaselines(state.teams));
  const receipt = { type: 'coach', teamId: team.teamId, afterGame: Number(state.calendar.gameIndex || 0),
    pace: plan.pace, offense: plan.offense, defense: plan.defense,
    rotation: rotation === undefined ? null : team.rotation,
    relativeUsageModelVersion: FRANCHISE_RELATIVE_USAGE_MODEL_VERSION,
    source: 'user-scenario-choice' };
  state.transactions.push(receipt); team.transactions.push(receipt); state.updatedAt = new Date().toISOString();
  return { state, receipt };
}

export function applyFranchiseTransaction(stateInput, transaction = {}) {
  const state = parseFranchiseLeague(stateInput);
  if (state.calendar.status === 'complete') throw new Error('Advance or replay the season before changing its roster.');
  if (Number(state.calendar.gameIndex || 0) > 0) ensurePlayerLedgers(state);
  const type = text(transaction.type).toLowerCase();
  const from = state.teams.find(team => team.teamId === text(transaction.fromTeamId));
  const to = state.teams.find(team => team.teamId === text(transaction.toTeamId));
  const playerRef = text(transaction.playerRef);
  if (!['trade', 'sign', 'waive', 'release'].includes(type)) throw new Error('Unsupported franchise transaction.');
  if (!SAFE_ID.test(playerRef)) throw new Error('Transaction needs a stable public player reference.');
  if (type === 'trade') {
    if (!from || !to || from.teamId === to.teamId) throw new Error('Trade needs two different teams.');
    const index = from.roster.findIndex(player => player.playerRef === playerRef && player.status === 'active');
    if (index < 0 || to.roster.length >= MAX_ROSTER) throw new Error('Trade player or roster capacity is unavailable.');
    const [player] = from.roster.splice(index, 1); player.teamId = to.teamId; to.roster.push(player);
  } else if (type === 'sign') {
    if (!to) throw new Error('Signing needs a destination team.');
    const index = state.freeAgents.findIndex(player => player.playerRef === playerRef);
    if (index < 0 || to.roster.length >= MAX_ROSTER) throw new Error('Free agent or roster capacity is unavailable.');
    const [player] = state.freeAgents.splice(index, 1); player.teamId = to.teamId; player.status = 'active'; to.roster.push(player);
  } else {
    if (!from) throw new Error('Release needs a team.');
    const index = from.roster.findIndex(player => player.playerRef === playerRef && player.status === 'active');
    if (index < 0) throw new Error('Active roster player is unavailable.');
    const [player] = from.roster.splice(index, 1); player.teamId = null; player.status = 'waived'; player.contract = { ...player.contract, status: 'free-agent' }; state.freeAgents.push(player);
  }
  const receipt = { type, playerRef, fromTeamId: from?.teamId || null, toTeamId: to?.teamId || null, seasonStartYear: state.currentSeason, source: 'user-committed-scenario-transaction' };
  const baselines = fourFactorBaselines(state.teams);
  if (from) from.strength = teamStrength(from, baselines);
  if (to) to.strength = teamStrength(to, baselines);
  state.transactions.push(receipt); if (from) from.transactions.push(receipt); if (to) to.transactions.push(receipt); state.updatedAt = new Date().toISOString();
  return { state, receipt };
}

export function advanceFranchiseOffseason(stateInput, { seed, draftCount = 2, scheduleGames = null, scheduleReceipt = null, scheduleKind = null } = {}) {
  const state = parseFranchiseLeague(stateInput);
  const random = createRandom(`${seed || state.seed}:${state.currentSeason}:offseason`);
  const retired = [];
  const available = [];
  state.teams.forEach(team => {
    team.roster = team.roster.filter(player => {
      const age = finite(player.age) ? Number(player.age) + 1 : null;
      player.age = age;
      // Only advance experience when it was explicitly known. Number(null) is
      // zero, but an unavailable experience value must not become a rookie year.
      const experience = normalizeExperience(player.experience);
      if (experience !== null) player.experience = experience + 1;
      const contractYears = player.contract?.source === 'scenario-default' || player.contract?.yearsRemaining == null
        ? null : Number(player.contract.yearsRemaining);
      player.contract.yearsRemaining = contractYears === null ? null : Math.max(0, contractYears - 1);
      const retirementChance = age === null ? 0 : clamp((age - 34) * 0.04 + (100 - Number(player.durability || 70)) * 0.001, 0, 0.75);
      if ((age !== null && age >= 40) || random() < retirementChance) { player.status = 'retired'; retired.push({ playerRef: player.playerRef, displayName: player.displayName, age }); return false; }
      const declaredPotential = player.potentialSource === 'declared-scenario-input' && finite(player.potential) ? Number(player.potential) : null;
      const growth = age !== null && age < 27 && declaredPotential !== null
        ? clamp((declaredPotential - Number(player.ratings?.scoring || 50)) / 18, 0, 3)
        : age !== null && age > 31 ? -clamp((age - 31) * 0.35, 0, 3) : normal(random, 0, 0.45);
      Object.keys(player.ratings || {}).forEach(key => { player.ratings[key] = round(clamp(Number(player.ratings[key]) + growth + normal(random, 0, 0.2), 25, 99)); });
      player.development = { lastSeason: state.currentSeason + 1, change: round(growth), source: 'seeded-offseason-simulation' };
      if (contractYears !== null && player.contract.yearsRemaining === 0) { player.teamId = null; player.contract.status = 'free-agent'; available.push(player); return false; }
      resetPlayerForNewSeason(player); return true;
    });
    if (team.control === 'cpu') cpuManageTeam(state, team, random);
    resetTeamSeason(team);
  });
  state.freeAgents = [...state.freeAgents, ...available];
  state.freeAgents.forEach(player => resetPlayerForNewSeason(player, { activate: false }));
  const lotteryOrder = draftOrder(state, random);
  const draft = [];
  for (let index = 0; index < Math.max(0, Math.min(30, Number(draftCount) || 0)); index += 1) {
    const target = [...state.freeAgents].sort((a, b) => Number(b.potential ?? -1) - Number(a.potential ?? -1))[0];
    if (!target) break;
    const team = Array.from({ length: lotteryOrder.length }, (_, offset) => {
      const teamId = lotteryOrder[(index + offset) % lotteryOrder.length];
      return state.teams.find(candidate => candidate.teamId === teamId);
    }).find(candidate => candidate && candidate.roster.length < MAX_ROSTER);
    if (!team) break;
    state.freeAgents = state.freeAgents.filter(player => player.playerRef !== target.playerRef); target.teamId = team.teamId; target.status = 'active'; target.contract = { yearsRemaining: 2, salary: null, status: 'active', source: 'seeded-draft-scenario' }; team.roster.push(target); draft.push({ pick: index + 1, teamId: team.teamId, playerRef: target.playerRef, source: 'seeded-draft-scenario' });
  }
  const prior = state.lastResult ? { ...state.lastResult, retired: retired.length, draft, lotteryOrder } : null;
  if (prior) state.history.push(prior);
  state.currentSeason += 1;
  // Checkpoint progress is season-scoped. Preserve the completed season's
  // summary in history, but start the new calendar with no prior game logs or
  // random-state checkpoint to conflict with its zero-game calendar.
  state.gameLogs = [];
  state.regularRandomState = null;
  const actualSchedule = normalizeScheduleGames(scheduleGames, state.teams.map(team => team.teamId), state.currentSeason, scheduleReceipt, scheduleKind);
  let generatedSchedule = null;
  if (!actualSchedule) {
    const teamIds = state.teams.map(team => team.teamId);
    validateRoundRobinTarget(teamIds.length, state.settings.gamesPerTeam);
    generatedSchedule = normalizeScheduleGames(roundRobinSchedule(teamIds, state.settings.gamesPerTeam, `${state.seed}:${state.currentSeason}`), teamIds, state.currentSeason, null, 'generated');
    if (!generatedSchedule?.coverage?.balanced || generatedSchedule.coverage.minGamesPerTeam !== Number(state.settings.gamesPerTeam)) {
      throw new Error('Generated round-robin schedule could not provide the requested equal games-per-team target. Choose an even target or an exact/custom schedule.');
    }
  }
  state.schedule = actualSchedule?.games || generatedSchedule.games;
  state.source.schedule = actualSchedule
    ? { kind: actualSchedule.kind, observed: actualSchedule.observed, evidenceKind: actualSchedule.evidenceKind,
      seasonStartYear: state.currentSeason, receipt: actualSchedule.receipt, coverage: actualSchedule.coverage }
    : { kind: 'generated', observed: false, evidenceKind: 'modeled-schedule-scenario', seasonStartYear: state.currentSeason, receipt: null,
      coverage: { ...generatedSchedule.coverage, source: 'deterministic-round-robin', targetGamesPerTeam: Number(state.settings.gamesPerTeam) } };
  if (actualSchedule?.coverage?.minGamesPerTeam) state.settings.gamesPerTeam = actualSchedule.coverage.minGamesPerTeam;
  state.calendar = calendarState(state.source.schedule, state.schedule.length); state.playoffs = null; state.standings = []; state.leaders = {}; state.allGameLeaders = {}; state.lastResult = null; state.updatedAt = new Date().toISOString();
  return { state, receipt: { seasonStartYear: state.currentSeason, retired, draft, lotteryOrder, freeAgents: state.freeAgents.length, source: 'seeded-offseason-simulation' } };
}

function resetPlayerForNewSeason(player, { activate = true } = {}) {
  player.seasonStats = { games: 0, minutes: 0, points: 0, assists: 0, rebounds: 0, turnovers: 0, steals: 0, blocks: 0 };
  player.gameLogs = []; player.injury = null; player.fatigue = 0;
  if (activate) player.status = 'active';
}

export function serializeFranchiseLeague(stateInput) {
  // Parsing already returns a validated, isolated copy. Avoid duplicating a
  // full season's box-score graph just to remove it before persistence.
  const copy = parseFranchiseLeague(stateInput);
  delete copy.createdAt;
  // Timestamps describe local persistence, not the deterministic simulation
  // state. Omitting both keeps a save/replay receipt byte-stable.
  delete copy.updatedAt;
  // Per-game box scores are useful during a run, but duplicate player and game
  // detail can exceed browser storage limits. Keep only the regular-season
  // fields needed to reproduce head-to-head standings and the draft lottery.
  // Aggregate season outputs (lastResult, standings, leaders, and history)
  // remain available after reload.
  const regularGameLogs = copy.gameLogs.filter(game => text(game.phase).toLowerCase() === 'regular');
  const latestCoveredReceiptGameByTeam = new Map();
  const latestNonCoveredReceiptGameByTeam = new Map();
  for (let index = regularGameLogs.length - 1; index >= 0; index -= 1) {
    Object.entries(regularGameLogs[index].rotationPlanReceipts || {}).forEach(([teamId, receipt]) => {
      const isCoveredCpuReceipt = receipt.source === 'evidence-position-default'
        && receipt.status === 'ready' && receipt.roleCoverageStatus === 'covered';
      if (isCoveredCpuReceipt && !latestCoveredReceiptGameByTeam.has(teamId)) {
        latestCoveredReceiptGameByTeam.set(teamId, index);
      } else if (!isCoveredCpuReceipt && !latestNonCoveredReceiptGameByTeam.has(teamId)) {
        latestNonCoveredReceiptGameByTeam.set(teamId, index);
      }
    });
  }
  copy.gameLogs = regularGameLogs
    .map((game, index) => {
      const rotationPlanReceipts = Object.fromEntries(Object.entries(game.rotationPlanReceipts || {})
        .filter(([teamId, receipt]) => {
          const isCoveredCpuReceipt = receipt.source === 'evidence-position-default'
            && receipt.status === 'ready' && receipt.roleCoverageStatus === 'covered';
          return isCoveredCpuReceipt
            ? latestCoveredReceiptGameByTeam.get(teamId) === index
            : latestNonCoveredReceiptGameByTeam.get(teamId) === index;
        })
        .map(([teamId, receipt]) => [teamId, {
          source: receipt.source, modelVersion: receipt.modelVersion, status: receipt.status, evidence: receipt.evidence,
          reason: receipt.reason, availablePlayerCount: receipt.availablePlayerCount,
          selectedPlayerCount: receipt.selectedPlayerCount, totalRegulationMinutes: receipt.totalRegulationMinutes,
          maximumPlayerMinutes: receipt.maximumPlayerMinutes, roleMinuteCoverage: receipt.roleMinuteCoverage,
          roleCoverageStatus: receipt.roleCoverageStatus,
        }]));
      return { phase: game.phase, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, winner: game.winner, round: game.round,
        scheduleGameId: game.scheduleGameId || null, homeScore: game.homeScore, awayScore: game.awayScore,
        ...(Object.keys(rotationPlanReceipts).length ? { rotationPlanReceipts } : {}) };
    });
  const clearPlayerLogs = player => { player.gameLogs = []; };
  copy.teams.forEach(team => team.roster.forEach(clearPlayerLogs));
  (Array.isArray(copy.freeAgents) ? copy.freeAgents : []).forEach(clearPlayerLogs);
  (Array.isArray(copy.draftPool) ? copy.draftPool : []).forEach(clearPlayerLogs);
  return JSON.stringify(copy);
}

export function parseFranchiseLeague(value) {
  let state = value;
  if (typeof value === 'string') { try { state = JSON.parse(value); } catch { throw new Error('Saved Franchise League state is not valid JSON.'); } }
  if (!state || state.format !== FRANCHISE_STATE_FORMAT) throw new Error('Saved Franchise League state is unavailable or uses an unsupported version.');
  if (LEGACY_FRANCHISE_SIMULATION_MODEL_VERSIONS.has(state.modelVersion)) {
    throw new Error(`Saved Franchise League state uses simulation model ${state.modelVersion}. Start a new Franchise run under model v9.`);
  }
  if (state.modelVersion !== FRANCHISE_SIMULATION_MODEL_VERSION) throw new Error('Saved Franchise League state is unavailable or uses an unsupported version.');
  if (!Array.isArray(state.teams) || state.teams.length < 2 || state.teams.length > MAX_TEAMS || !Array.isArray(state.history) || !Array.isArray(state.gameLogs)) throw new Error('Saved Franchise League state is malformed.');
  const teamIds = state.teams.map(team => text(team?.teamId));
  if (teamIds.some(id => !SAFE_ID.test(id)) || new Set(teamIds).size !== teamIds.length) throw new Error('Saved Franchise League team references are invalid or duplicated.');
  const canonicalTeamIds = teamIds.map(id => classifyNbaTeam(id)?.teamId || id.toLowerCase());
  if (new Set(canonicalTeamIds).size !== canonicalTeamIds.length) throw new Error('Saved Franchise League team references are invalid or duplicated.');
  if (!state.source || !['exact-season', 'pooled-window'].includes(state.source.scope) || !Array.isArray(state.source.packageRefs) || !state.source.packageRefs.length) throw new Error('Saved Franchise League source pins are missing.');
  const playoffTeams = Number(state.settings?.playoffTeams);
  if (!Number.isInteger(playoffTeams) || ![0, 2, 4, 8, 16].includes(playoffTeams) || playoffTeams > state.teams.length) {
    throw new Error('Saved Franchise League playoff field is malformed or exceeds the selected league.');
  }
  const seriesLength = state.settings?.seriesLength == null ? 7 : Number(state.settings.seriesLength);
  if (!Number.isInteger(seriesLength) || !PLAYOFF_SERIES_LENGTHS.includes(seriesLength)) {
    throw new Error(`Saved Franchise League playoff series length must be one of ${PLAYOFF_SERIES_LENGTHS.join(', ')}.`);
  }
  if (!state.source.schedule || !['actual', 'generated'].includes(state.source.schedule.kind) || Number(state.source.schedule.seasonStartYear) !== Number(state.currentSeason) || !Array.isArray(state.schedule) || !state.schedule.length) throw new Error('Saved Franchise League schedule source is missing or malformed.');
  for (const team of state.teams) {
    if (!SAFE_ID.test(text(team.teamId)) || !Array.isArray(team.roster) || team.roster.length > MAX_ROSTER) throw new Error('Saved Franchise League team state is malformed.');
    const structure = classifyNbaTeam(team.teamId);
    if (structure && ((team.conference != null && team.conference !== structure.conference)
      || (team.division != null && team.division !== structure.division))) {
      throw new Error(`Saved Franchise League team ${team.teamId} has conflicting NBA conference or division metadata.`);
    }
    for (const player of team.roster) if (!SAFE_ID.test(text(player.playerRef)) || !text(player.displayName)) throw new Error('Saved Franchise League player state is malformed.');
  }
  const copy = deepClone(state);
  copy.leaders ||= leadersFor(copy);
  copy.allGameLeaders ||= leadersFor(copy);
  const normalizedSchedule = normalizeScheduleGames(copy.schedule, copy.teams.map(team => team.teamId), copy.currentSeason, copy.source.schedule.receipt, copy.source.schedule.kind);
  if (!normalizedSchedule) throw new Error('Saved Franchise League schedule is unavailable.');
  copy.schedule = normalizedSchedule.games;
  if (copy.source.schedule.kind !== normalizedSchedule.kind
    || (Object.prototype.hasOwnProperty.call(copy.source.schedule, 'observed') && copy.source.schedule.observed !== normalizedSchedule.observed)
    || (copy.source.schedule.evidenceKind != null && copy.source.schedule.evidenceKind !== normalizedSchedule.evidenceKind)) {
    throw new Error('Saved Franchise League schedule kind conflicts with its receipt.');
  }
  copy.source.schedule = { ...copy.source.schedule, kind: normalizedSchedule.kind, observed: normalizedSchedule.observed,
    evidenceKind: normalizedSchedule.evidenceKind, receipt: normalizedSchedule.receipt, coverage: normalizedSchedule.coverage };
  copy.settings.seriesLength = seriesLength;
  copy.calendar = { ...calendarState(copy.source.schedule, copy.schedule.length, copy.calendar?.status || 'preseason'), ...(copy.calendar || {}),
    totalDays: copy.schedule.length, totalGames: copy.schedule.length, scheduleKind: copy.source.schedule.kind, scheduleEvidence: copy.source.schedule.evidenceKind };
  copy.teams.forEach(team => {
    team.record = { ...emptyRecord(), ...(team.record || {}) };
    team.postseasonRecord = { ...emptyRecord(), ...(team.postseasonRecord || {}) };
    team.teamStats = { ...emptyTeamStats(), ...(team.teamStats || {}) };
    if (team.playerLedgerCoverage != null && !['complete', 'partial', 'unavailable'].includes(team.playerLedgerCoverage)) {
      throw new Error('Saved Franchise League player-ledger coverage is malformed.');
    }
    team.playerLedgerCoverage ||= team.roster.length ? 'complete' : 'unavailable';
    team.rotationSource = hasSavedUserRotation(team, copy.transactions) ? 'user-saved' : 'evidence-position-default';
    if (team.rotationSource === 'evidence-position-default') team.rotationModelVersion ||= FRANCHISE_CPU_ROTATION_VERSION;
    const structure = classifyNbaTeam(team.teamId);
    if (structure) {
      team.conference = structure.conference;
      team.division = structure.division;
    } else {
      team.conference = null;
      team.division = null;
    }
  });
  return copy;
}

export function saveFranchiseLeague(stateInput, storage = globalThis.localStorage) {
  const serialized = serializeFranchiseLeague(stateInput);
  if (!storage?.setItem) throw new Error('Local Franchise League storage is unavailable.');
  if (serialized.length > FRANCHISE_MAX_STORAGE_CHARACTERS) throw new Error('Franchise League save is too large for local storage.');
  storage.setItem(FRANCHISE_STORAGE_KEY, serialized); return serialized;
}

export function loadFranchiseLeague(storage = globalThis.localStorage) {
  if (!storage?.getItem) return null;
  const serialized = storage.getItem(FRANCHISE_STORAGE_KEY); return serialized ? parseFranchiseLeague(serialized) : null;
}

export function clearFranchiseLeague(storage = globalThis.localStorage) {
  storage?.removeItem?.(FRANCHISE_STORAGE_KEY);
}

export function franchiseCapabilities() {
  return Object.freeze({
    persistentLeague: 'available', schedule: 'available', userAndCpuTeams: 'available', publicPlayerDatabase: 'available', rosterRotation: 'available', coachDecisions: 'available', checkpointProgression: 'available', seededGameSimulation: 'available', boxScores: 'available', statsAndStandings: 'available', injuriesAndFatigue: 'available', transactions: 'available', playoffs: 'available', offseason: 'available', multiSeasonHistory: 'available', forecast: 'unavailable' });
}

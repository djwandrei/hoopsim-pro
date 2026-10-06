/**
 * Browser-safe SwishIQ source adapter for the validated all-games package.
 *
 * The package contains full-season player totals for every covered NBA team,
 * season, and supported phase.  It intentionally does not claim possession,
 * shared-floor, RAPM, or opaque board-evaluator evidence that the source does
 * not publish.  Every consumer should use this adapter instead of the retired
 * static native projection when it needs season-level player data.
 */

import {
  ALL_GAMES_PACKAGE_PHASES,
  ALL_GAMES_PACKAGE_SEASON_END_YEARS,
  ALL_GAMES_PACKAGE_SOURCE_KIND,
  ALL_GAMES_PACKAGE_TEAM_NAMES,
  loadAllGamesSeasonRecords,
  loadAllGamesTeamDataset,
} from "../lineup-lab/all-games-public-package.js?v=20261002b&rev=all-games-companion-pin-v4-site-12ad90dc8710";
import {
  ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  loadAllGamesCompanionRecords,
} from "../lineup-lab/all-games-companion-runtime.js?v=20261002b&rev=all-games-companion-pin-v4-site-12ad90dc8710";
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from "./swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js?v=20261001d&rev=canonical-v4-studio-runtime-adapter-v2-player-season-supplement";

export const SWISHIQ_ALL_GAMES_SOURCE_KIND = ALL_GAMES_PACKAGE_SOURCE_KIND;
export const SWISHIQ_ALL_GAMES_PACKAGE_ID = "nba-swishiq-all-games-context";
export const SWISHIQ_ALL_GAMES_MODEL_ID = "swishiq-all-games-full-season-v1";
export const SWISHIQ_ALL_GAMES_NORMALIZER = "djhc-swishiq-all-games-normalization-v1";
export const SWISHIQ_ALL_GAMES_METRICS_VERSION = "djhc-swishiq-all-games-metrics-v1";
export const SWISHIQ_ALL_GAMES_REGISTRY_VERSION = "swishiq-all-games-source-v1";
export const SWISHIQ_ALL_GAMES_PHASES = ALL_GAMES_PACKAGE_PHASES;

const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const TEAM_CODE = /^[A-Z]{3}$/;
const EXACT_VIEW = /^(.*)__season-(\d{4})-(\d{2})_(regular|playoffs)$/;
const POOLED_VIEW = /^(.*)__pooled_regular$/;
const FNV_SALTS = Object.freeze([0, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]);

function fail(message) {
  throw new Error(message);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function seasonLabel(seasonEndYear) {
  return `${seasonEndYear - 1}–${String(seasonEndYear).slice(-2)}`;
}

function viewVersion(packageVersion, { seasonEndYear = null, phase = "regular", pooled = false } = {}) {
  if (pooled) return `${packageVersion}__pooled_regular`;
  return `${packageVersion}__season-${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}_${phase}`;
}

function viewSelection(packageVersion) {
  const pooled = POOLED_VIEW.exec(String(packageVersion || ""));
  if (pooled) return { basePackageVersion: pooled[1], pooled: true, phase: "regular" };
  const exact = EXACT_VIEW.exec(String(packageVersion || ""));
  if (!exact) fail("The selected SwishIQ all-games package view is invalid.");
  const seasonStartYear = Number(exact[2]);
  const seasonEndYear = 2000 + Number(exact[3]);
  if (seasonEndYear !== seasonStartYear + 1 || !ALL_GAMES_PACKAGE_SEASON_END_YEARS.includes(seasonEndYear)) {
    fail("The selected SwishIQ all-games season is outside the validated package.");
  }
  return { basePackageVersion: exact[1], pooled: false, seasonEndYear, phase: exact[4] };
}

function fnv32(value, salt) {
  const bytes = new TextEncoder().encode(String(value));
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

/** A deterministic public identifier derived only from the package key. */
export function allGamesPlayerRefFor(sourceKey) {
  const key = String(sourceKey || "").trim().toLowerCase();
  if (!key) fail("An all-games player row is missing its source key.");
  return `p_${FNV_SALTS.map(salt => fnv32(key, salt)).join("")}`;
}

function ratioMetric(numerator, denominator, games, sourceMetric) {
  const top = number(numerator, NaN);
  const bottom = number(denominator, NaN);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) {
    return { status: "unavailable", value: null, unit: "fraction", numerator: null, denominator: null, knownGames: games, sourceMetric };
  }
  return {
    status: "available", value: top / bottom, unit: "fraction", numerator: top, denominator: bottom,
    knownGames: games, evidenceKind: "public-full-season-total", coverage: "all-games-full-season", sourceMetric,
  };
}

function rateMetric(total, games, sourceMetric, unit = "per-game") {
  const numerator = number(total, NaN);
  if (!Number.isFinite(numerator) || !Number.isFinite(games) || games <= 0) {
    return { status: "unavailable", value: null, unit, numerator: null, denominator: null, knownGames: games, sourceMetric };
  }
  return {
    status: "available", value: numerator / games, unit, numerator, denominator: games,
    knownGames: games, evidenceKind: "public-full-season-total", coverage: "all-games-full-season", sourceMetric,
  };
}

function per36Metric(total, minutes, games, sourceMetric) {
  const numerator = number(total, NaN);
  if (!Number.isFinite(numerator) || !Number.isFinite(minutes) || minutes <= 0) {
    return { status: "unavailable", value: null, unit: "per-36-minutes", numerator: null, denominator: null, knownGames: games, sourceMetric };
  }
  return {
    status: "available", value: numerator * 36 / minutes, unit: "per-36-minutes", numerator, denominator: minutes,
    knownGames: games, evidenceKind: "public-full-season-total", coverage: "all-games-full-season", sourceMetric,
  };
}

function metricAliases(metrics, names, metric) {
  names.forEach(name => { metrics[name] = metric; });
}

function metricsFor(raw, box) {
  const games = number(raw.games, 0);
  const minutes = box.minutes;
  const metrics = {};
  metricAliases(metrics, ["pointsPerGame"], rateMetric(box.points, games, "points"));
  metricAliases(metrics, ["assistsPerGame"], rateMetric(box.assists, games, "assists"));
  metricAliases(metrics, ["reboundsPerGame"], rateMetric(box.totalRebounds, games, "totalRebounds"));
  metricAliases(metrics, ["offensiveReboundsPerGame"], rateMetric(box.offensiveRebounds, games, "offensiveRebounds"));
  metricAliases(metrics, ["defensiveReboundsPerGame"], rateMetric(box.defensiveRebounds, games, "defensiveRebounds"));
  metricAliases(metrics, ["stealsPerGame"], rateMetric(box.steals, games, "steals"));
  metricAliases(metrics, ["blocksPerGame"], rateMetric(box.blocks, games, "blocks"));
  metricAliases(metrics, ["turnoversPerGame"], rateMetric(box.turnovers, games, "turnovers"));
  metricAliases(metrics, ["minutesPerGame"], rateMetric(minutes, games, "minutes"));
  metricAliases(metrics, ["pointsPer36"], per36Metric(box.points, minutes, games, "points"));
  metricAliases(metrics, ["assistsPer36"], per36Metric(box.assists, minutes, games, "assists"));
  metricAliases(metrics, ["reboundsPer36"], per36Metric(box.totalRebounds, minutes, games, "totalRebounds"));
  metricAliases(metrics, ["stealsPer36"], per36Metric(box.steals, minutes, games, "steals"));
  metricAliases(metrics, ["blocksPer36"], per36Metric(box.blocks, minutes, games, "blocks"));

  const fieldGoal = ratioMetric(box.fieldGoalsMade, box.fieldGoalsAttempted, games, "fieldGoals");
  const twoPoint = ratioMetric(box.twoPointMakes, box.twoPointAttempts, games, "twoPointFieldGoals");
  const threePoint = ratioMetric(box.threePointersMade, box.threePointersAttempted, games, "threePointFieldGoals");
  const freeThrow = ratioMetric(box.freeThrowsMade, box.freeThrowsAttempted, games, "freeThrows");
  const effectiveFieldGoal = ratioMetric(box.fieldGoalsMade + (0.5 * box.threePointersMade), box.fieldGoalsAttempted, games, "effectiveFieldGoal");
  const trueShooting = ratioMetric(box.points, 2 * (box.fieldGoalsAttempted + (0.44 * box.freeThrowsAttempted)), games, "trueShootingApproximation");
  const threePointShare = ratioMetric(box.threePointersAttempted, box.fieldGoalsAttempted, games, "threePointAttemptShare");
  const freeThrowRate = ratioMetric(box.freeThrowsAttempted, box.fieldGoalsAttempted, games, "freeThrowAttemptRate");
  const assistTurnover = ratioMetric(box.assists, box.turnovers, games, "assistToTurnoverRatio");
  const involvement = per36Metric(box.fieldGoalsAttempted + (0.44 * box.freeThrowsAttempted) + box.turnovers, minutes, games, "involvementPer36");
  metricAliases(metrics, ["fieldGoalPercentage", "fgAccuracy"], fieldGoal);
  metricAliases(metrics, ["twoPointPercentage", "twoAccuracy"], twoPoint);
  metricAliases(metrics, ["threePointPercentage", "threeAccuracy"], threePoint);
  metricAliases(metrics, ["freeThrowPercentage", "ftAccuracy"], freeThrow);
  metricAliases(metrics, ["effectiveFieldGoalPercentage", "effectiveFieldGoal"], effectiveFieldGoal);
  metricAliases(metrics, ["trueShootingPercentage", "trueShootingApproximation"], trueShooting);
  metricAliases(metrics, ["threePointAttemptShare", "threePointAttemptRate", "threeAttemptShare"], threePointShare);
  metricAliases(metrics, ["freeThrowAttemptRate", "ftAttemptRate"], freeThrowRate);
  metricAliases(metrics, ["assistToTurnoverRatio", "assistsPerTurnover"], assistTurnover);
  metricAliases(metrics, ["involvementPer36"], involvement);

  const advanced = raw.advanced && typeof raw.advanced === "object" ? raw.advanced : {};
  const advancedMetrics = [
    ["playerEfficiencyRating", "player_efficiency_rating"],
    ["usagePercentage", "usage_percentage"],
    ["offensiveBoxPlusMinus", "offensive_box_plus_minus"],
    ["defensiveBoxPlusMinus", "defensive_box_plus_minus"],
    ["boxPlusMinus", "box_plus_minus"],
    ["winShares", "win_shares"],
    ["valueOverReplacementPlayer", "value_over_replacement_player"],
  ];
  advancedMetrics.forEach(([name, key]) => {
    const value = Number(advanced[key]);
    metrics[name] = Number.isFinite(value)
      ? { status: "available", value, unit: "provider-advanced", numerator: null, denominator: null, knownGames: games, evidenceKind: "public-full-season-provider-advanced", coverage: "all-games-full-season", sourceMetric: key }
      : { status: "unavailable", value: null, unit: "provider-advanced", numerator: null, denominator: null, knownGames: games, sourceMetric: key };
  });
  return metrics;
}

function recordToPlayerSeason(raw) {
  const totals = raw?.totals && typeof raw.totals === "object" ? raw.totals : {};
  const games = number(raw?.games, 0);
  const minutes = number(totals.minutesPlayed, 0);
  const sourceKey = String(raw?.sourceKey || raw?.displayName || "").trim().toLowerCase();
  const playerRef = allGamesPlayerRefFor(sourceKey);
  const teamCode = String(raw?.teamCode || "").toUpperCase();
  if (!TEAM_CODE.test(teamCode) || !Number.isSafeInteger(games) || games < 1 || minutes <= 0) return null;
  const box = {
    minutes,
    points: number(totals.points),
    fieldGoalsMade: number(totals.fieldGoalsMade),
    fieldGoalsAttempted: number(totals.fieldGoalsAttempted),
    twoPointMakes: number(totals.fieldGoalsMade) - number(totals.threePointFieldGoalsMade),
    twoPointAttempts: number(totals.fieldGoalsAttempted) - number(totals.threePointFieldGoalsAttempted),
    threePointersMade: number(totals.threePointFieldGoalsMade),
    threePointersAttempted: number(totals.threePointFieldGoalsAttempted),
    freeThrowsMade: number(totals.freeThrowsMade),
    freeThrowsAttempted: number(totals.freeThrowsAttempted),
    offensiveRebounds: number(totals.offensiveRebounds),
    defensiveRebounds: number(totals.defensiveRebounds),
    totalRebounds: number(totals.totalRebounds),
    assists: number(totals.assists),
    steals: number(totals.steals),
    blocks: number(totals.blocks),
    turnovers: number(totals.turnovers),
    personalFouls: number(totals.personalFouls),
  };
  const positions = [...new Set((Array.isArray(raw.positions) ? raw.positions : [])
    .map(position => String(position).trim().toUpperCase())
    .filter(position => ["G", "F", "C"].includes(position)))].sort();
  if (!positions.length || box.twoPointMakes < 0 || box.twoPointAttempts < 0) return null;
  return {
    id: `ps_${fnv32(raw.id || `${sourceKey}|${teamCode}|${raw.seasonEndYear}|${raw.phase}`, 0)}${fnv32(raw.id || `${sourceKey}|${teamCode}|${raw.seasonEndYear}|${raw.phase}`, 0x9e3779b9)}`,
    playerRef,
    rosterRef: `r_${fnv32(`${playerRef}|${teamCode}|${raw.seasonEndYear}|${raw.phase}`, 0)}${fnv32(`${playerRef}|${teamCode}|${raw.seasonEndYear}|${raw.phase}`, 0x85ebca6b)}`,
    sourceKey,
    sourceRecordId: String(raw.id || ""),
    displayName: String(raw.displayName || "").trim(),
    teamCode,
    team: ALL_GAMES_PACKAGE_TEAM_NAMES[teamCode] || teamCode,
    seasonStartYear: Number(raw.seasonStartYear),
    seasonEndYear: Number(raw.seasonEndYear),
    phase: String(raw.phase || "").toLowerCase(),
    positions,
    age: Number.isFinite(Number(raw.age)) ? Number(raw.age) : null,
    observed: true,
    scope: "team",
    games,
    starts: number(raw.starts),
    minutes,
    box,
    metrics: metricsFor(raw, box),
    coverage: {
      games,
      minutes,
      possessions: null,
      kind: "public-full-season-player-totals",
      gameCoverage: "all published player appearances in the selected season and phase",
    },
    source: {
      provider: "Basketball Reference",
      kind: "public-full-season-player-totals",
      urls: Array.isArray(raw.sourceUrls) ? [...raw.sourceUrls] : [],
    },
  };
}

function sortedRows(rows) {
  return rows.slice().sort((left, right) => left.seasonEndYear - right.seasonEndYear
    || left.phase.localeCompare(right.phase)
    || left.teamCode.localeCompare(right.teamCode)
    || left.displayName.localeCompare(right.displayName)
    || left.sourceRecordId.localeCompare(right.sourceRecordId));
}

function validateRows(rows) {
  const identities = new Map();
  rows.forEach(row => {
    if (!PLAYER_REF.test(row.playerRef)) fail("The all-games adapter produced an invalid player reference.");
    const previous = identities.get(row.playerRef);
    if (previous && previous !== row.sourceKey) fail("The all-games adapter detected a player-reference collision.");
    identities.set(row.playerRef, row.sourceKey);
  });
  return sortedRows(rows);
}

function packageScope({ seasonEndYear = null, phase = "regular", pooled = false } = {}) {
  if (pooled) {
    return {
      kind: "pooled-window",
      seasonStartYears: [...ALL_GAMES_PACKAGE_SEASON_END_YEARS].map(year => year - 1),
      seasonStartYear: ALL_GAMES_PACKAGE_SEASON_END_YEARS[0] - 1,
      seasonEndYear: ALL_GAMES_PACKAGE_SEASON_END_YEARS.at(-1),
      phases: ["regular"],
      pooledFitIsSeasonSpecific: true,
    };
  }
  return {
    kind: "exact-season",
    seasonStartYears: [seasonEndYear - 1],
    seasonStartYear: seasonEndYear - 1,
    seasonEndYear,
    phases: [phase],
    pooledFitIsSeasonSpecific: true,
  };
}

function capability(status, artifactIds = []) {
  return { status, ...(status === "available" ? { artifactIds } : {}) };
}

function capabilitiesFor({ pooled = false } = {}) {
  return {
    swishiqStudio: capability("available", ["players", "player-seasons"]),
    historicalSeason: capability("available", ["player-seasons"]),
    lineupLab: capability("available", ["player-seasons"]),
    compositeRecipe: capability("available", ["player-seasons"]),
    challengePools: capability("available", ["challenge-pools", "player-seasons"]),
    careerHistory: capability(pooled ? "available" : "unavailable", pooled ? ["player-seasons"] : []),
    careerSimulation: capability(pooled ? "available" : "unavailable", pooled ? ["player-seasons"] : []),
    chemistry: capability("available", ["player-seasons"]),
    // The all-games package contains no shared-floor, lineup-impact, opponent
    // defensive-rate, or calendar evidence.  Those models are deliberately
    // not backfilled from the retired projection.
    publicAdvancedImpact: capability("unavailable"),
    seasonSimulation: capability("unavailable"),
  };
}

function proofFromLoaded(loaded, rows, { seasonEndYear = null, phase = "regular", pooled = false } = {}) {
  const sourcePackage = loaded.package;
  if (sourcePackage.packageId !== SWISHIQ_ALL_GAMES_PACKAGE_ID) fail("The loaded package is not the approved all-games SwishIQ source.");
  const scope = packageScope({ seasonEndYear, phase, pooled });
  const packageVersion = viewVersion(sourcePackage.packageVersion, { seasonEndYear, phase, pooled });
  const contentHash = String(sourcePackage.packageContentSha256 || "");
  const sourceLockSha256 = String(sourcePackage.sourceContextSha256 || contentHash);
  const packageEntry = {
    packageId: sourcePackage.packageId,
    packageVersion,
    sourcePackageVersion: sourcePackage.packageVersion,
    packageContentSha256: contentHash,
    packageManifestSha256: contentHash,
    sourceLockSha256,
    projectionContentSha256: contentHash,
    modelId: SWISHIQ_ALL_GAMES_MODEL_ID,
    normalizer: SWISHIQ_ALL_GAMES_NORMALIZER,
    metricsVersion: SWISHIQ_ALL_GAMES_METRICS_VERSION,
    scope,
    capabilities: capabilitiesFor({ pooled }),
    ...(sourcePackage.companionRelease ? { companionRelease: sourcePackage.companionRelease } : {}),
  };
  const registry = {
    registryVersion: SWISHIQ_ALL_GAMES_REGISTRY_VERSION,
    registryRevisionSha256: contentHash,
    ...(sourcePackage.companionRelease ? {
      companionRegistrySha256: sourcePackage.companionRelease.registrySha256,
      companionRegistryRevisionSha256: sourcePackage.companionRelease.registryRevisionSha256,
      siteReleaseId: sourcePackage.companionRelease.releaseId,
      companionNativeV4CapabilityId: null,
    } : {}),
  };
  return {
    package: packageEntry,
    registry,
    request: pooled ? { phase: "regular", pooled: true } : { seasonEndYear, phase, pooled: false },
    sourceKind: SWISHIQ_ALL_GAMES_SOURCE_KIND,
    rows,
    index: {
      capabilities: packageEntry.capabilities,
      artifacts: [
        { artifactId: "players", kind: "players" },
        { artifactId: "player-seasons", kind: "player-seasons" },
        { artifactId: "challenge-pools", kind: "challenge-pools" },
      ],
    },
  };
}

async function loadExact({ seasonEndYear, phase = "regular", fetchImpl } = {}) {
  if (!ALL_GAMES_PACKAGE_SEASON_END_YEARS.includes(Number(seasonEndYear))) fail("Choose a season covered by the validated all-games package.");
  if (!SWISHIQ_ALL_GAMES_PHASES.includes(phase)) fail("Choose regular season or playoffs for the all-games package.");
  const loaded = await loadAllGamesSeasonRecords({ seasonEndYear, seasonPhase: phase, fetchImpl });
  const rows = validateRows(loaded.records.map(recordToPlayerSeason).filter(Boolean));
  if (!rows.length) fail(`The all-games package has no usable ${phase} rows for ${seasonLabel(seasonEndYear)}.`);
  return proofFromLoaded(loaded, rows, { seasonEndYear, phase });
}

async function loadPooled({ fetchImpl, acceptPooled = false } = {}) {
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured") {
    if (acceptPooled !== true) fail("The integrated V4 All Games pooled view requires explicit acceptance.");
    const pooled = await loadAllGamesCompanionRecords({
      releasePin: ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
      phase: "regular",
      acceptPooled: true,
      fetchImpl,
    });
    const rows = validateRows(pooled.records.map(recordToPlayerSeason).filter(Boolean));
    if (rows.length !== pooled.records.length) fail("The All Games companion pooled regular view contains unusable rows.");
    return proofFromLoaded({ package: {
      packageId: pooled.package.packageId,
      packageVersion: pooled.package.packageVersion,
      packageContentSha256: pooled.package.contentHash,
      sourceContextSha256: pooled.package.source.sourceContextSha256,
      companionRelease: pooled.package.release,
    } }, rows, { pooled: true });
  }
  const sources = await Promise.all(ALL_GAMES_PACKAGE_SEASON_END_YEARS.map(seasonEndYear => loadAllGamesSeasonRecords({
    seasonEndYear,
    seasonPhase: "regular",
    fetchImpl,
  })));
  const rows = validateRows(sources.flatMap(source => source.records.map(recordToPlayerSeason).filter(Boolean)));
  if (!rows.length) fail("The all-games package has no usable regular-season career rows.");
  return proofFromLoaded(sources[0], rows, { pooled: true });
}

/** Load one exact regular-season or playoff view of the all-games package. */
export async function loadSwishIqAllGamesExactProof({ seasonEndYear, seasonPhase = "regular", fetchImpl } = {}) {
  return loadExact({ seasonEndYear: Number(seasonEndYear), phase: String(seasonPhase || "regular").toLowerCase(), fetchImpl });
}

/** Load the explicit 2017-18 through 2025-26 regular-season career view. */
export async function loadSwishIqAllGamesPooledProof({ fetchImpl, acceptPooled = false } = {}) {
  if (acceptPooled !== true) fail("The All Games pooled view requires explicit acceptance.");
  return loadPooled({ fetchImpl, acceptPooled });
}

/**
 * Resolve one selected virtual package view.  The visible version pin contains
 * the exact season/phase while the source package content hash remains the
 * immutable provenance pin.
 */
export async function loadSwishIqAllGamesPublishedProof({ packageId, packageVersion, requiredCapabilities = [], fetchImpl } = {}) {
  if (packageId !== SWISHIQ_ALL_GAMES_PACKAGE_ID) fail("The selected package is not the approved all-games SwishIQ source.");
  if (!Array.isArray(requiredCapabilities)) fail("Requested all-games capabilities are invalid.");
  const selection = viewSelection(packageVersion);
  const proof = selection.pooled
    ? await loadPooled({ fetchImpl, acceptPooled: true })
    : await loadExact({ seasonEndYear: selection.seasonEndYear, phase: selection.phase, fetchImpl });
  if (proof.package.sourcePackageVersion !== selection.basePackageVersion || proof.package.packageVersion !== packageVersion) {
    fail("The selected all-games package view does not match the verified source version.");
  }
  const missing = requiredCapabilities.filter(capability => proof.package.capabilities?.[capability]?.status !== "available");
  if (missing.length) fail(`The all-games package does not publish ${missing.join(", ")} evidence for this view.`);
  return proof;
}

/** Return every exact regular-season selection plus the explicit career view. */
export async function loadSwishIqAllGamesPublishedPackages({ fetchImpl, acceptPooled = false } = {}) {
  if (acceptPooled !== true) fail("Enumerating the pooled All Games view requires explicit acceptance.");
  const packages = await Promise.all(ALL_GAMES_PACKAGE_SEASON_END_YEARS.map(seasonEndYear => loadExact({
    seasonEndYear,
    phase: "regular",
    fetchImpl,
  })));
  const pooledCareer = await loadPooled({ fetchImpl, acceptPooled });
  return {
    registry: packages[0].registry,
    packages: packages.sort((left, right) => left.request.seasonEndYear - right.request.seasonEndYear),
    pooledCareer,
  };
}

function playerRows(rows) {
  const players = new Map();
  rows.forEach(row => {
    const prior = players.get(row.playerRef) || {
      playerRef: row.playerRef,
      displayName: row.displayName,
      positions: new Set(),
    };
    row.positions.forEach(position => prior.positions.add(position));
    players.set(row.playerRef, prior);
  });
  return [...players.values()].map(player => ({
    playerRef: player.playerRef,
    displayName: player.displayName,
    positions: [...player.positions].sort(),
  })).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.playerRef.localeCompare(right.playerRef));
}

function challengePools(rows, proof) {
  const byTeam = new Map();
  rows.forEach(row => {
    const team = byTeam.get(row.teamCode) || [];
    team.push(row);
    byTeam.set(row.teamCode, team);
  });
  return [...byTeam.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([teamCode, teamRows]) => ({
    poolId: `all-games-${proof.package.scope.seasonStartYear}-${teamCode.toLowerCase()}`,
    teamCode,
    playerSeasons: teamRows.filter(row => row.games >= 10 && row.minutes >= 200).map(row => row.playerRef),
    eligibility: {
      minimumGames: 10,
      minimumMinutes: 200,
      requiredMetrics: ["pointsPerGame", "assistsPerGame", "reboundsPerGame", "trueShootingPercentage"],
      source: "validated all-games full-season player totals",
    },
  }));
}

/**
 * Materialize an in-memory public part from the verified all-games source.
 * No registry artifact or retired projection is fetched on this path.
 */
export async function loadSwishIqAllGamesPublicPart(proof, { artifactId, kind, capability } = {}) {
  if (!proof?.package || !Array.isArray(proof.rows)) fail("A verified all-games package proof is required.");
  if (capability && proof.package.capabilities?.[capability]?.status !== "available") {
    fail(`The all-games package does not publish ${capability} evidence for this view.`);
  }
  let records;
  if (artifactId === "players" && kind === "players") records = playerRows(proof.rows);
  else if (artifactId === "player-seasons" && kind === "player-seasons") records = proof.rows;
  else if (artifactId === "challenge-pools" && kind === "challenge-pools") records = challengePools(proof.rows, proof);
  else fail(`The all-games package does not publish a ${kind || artifactId} part.`);
  return {
    descriptor: { artifactId, kind, sourceKind: SWISHIQ_ALL_GAMES_SOURCE_KIND, inMemory: true },
    value: {
      format: "djhc-swishiq-all-games-public-part-v1",
      artifactId,
      kind,
      packageId: proof.package.packageId,
      packageVersion: proof.package.packageVersion,
      packageContentSha256: proof.package.packageContentSha256,
      ...(proof.package.companionRelease ? { companionRelease: proof.package.companionRelease } : {}),
      scope: proof.package.scope,
      records,
    },
  };
}

/** Return an all-games Lineup Lab payload with its source provenance intact. */
export async function loadSwishIqAllGamesLineupDataset({ seasonEndYear, team, seasonPhase = "regular", fetchImpl } = {}) {
  const phase = String(seasonPhase || "regular").toLowerCase();
  const [datasetResult, proof] = await Promise.all([
    loadAllGamesTeamDataset({ seasonEndYear, team, seasonPhase: phase, fetchImpl }),
    loadExact({ seasonEndYear: Number(seasonEndYear), phase, fetchImpl }),
  ]);
  const source = datasetResult.dataset?.source || {};
  return {
    dataset: datasetResult.dataset,
    package: proof.package,
    evidence: {
      kind: "full-season-player-totals",
      sourceKind: SWISHIQ_ALL_GAMES_SOURCE_KIND,
      coverage: datasetResult.coverage,
      scope: proof.package.scope,
      note: "Validated full-season player totals are the active source. Possession-level impact is not claimed by this package.",
    },
    coverage: datasetResult.coverage,
    source: source,
  };
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function sha256Text(value) {
  if (!globalThis.crypto?.subtle) fail("The browser cannot verify the all-games package hash.");
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

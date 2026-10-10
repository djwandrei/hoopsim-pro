/*
 * Lineup Lab's public roster source is the approved SwishIQ V3 exact-season
 * projection. Official player-season boxes load independently from optional
 * lineup/impact proof so missing advanced evidence never erases box totals.
 */
import { normalizeDataset } from "./player-data.js?v=20261002c";
import {
  loadSwishIqExactPackageProof,
  loadSwishIqPublicPart,
  SWISHIQ_PUBLIC_PROJECTION_FORMAT,
} from "../modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1";

export const SWISHIQ_V3_PACKAGE_SOURCE_KIND = "swishiq-v3-public-projection";
export const SWISHIQ_V3_PACKAGE_SEASON_END_YEARS = Object.freeze([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
export const SWISHIQ_V3_PACKAGE_DEFAULT_SEASON_END_YEAR = 2026;
export const SWISHIQ_V3_PACKAGE_PHASES = Object.freeze(["regular", "in_season_tournament", "play_in", "playoffs"]);
export const SWISHIQ_V3_TEAM_NAMES = Object.freeze({
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", CHA: "Charlotte Hornets", CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers", DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", GSW: "Golden State Warriors",
  HOU: "Houston Rockets", IND: "Indiana Pacers", LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NOP: "New Orleans Pelicans", NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns", POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings", SAS: "San Antonio Spurs", TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
});

const TEAM_CODES = new Set(Object.keys(SWISHIQ_V3_TEAM_NAMES));
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const ROSTER_REF = /^r_[a-f0-9]{32}$/;
const POSITION_CODES = new Set(["G", "F", "C"]);
const HASH = /^[a-f0-9]{64}$/;
const IMPACT_MODEL_VERSION = "weighted_ridge_offense_defense_rapm_v2";
const DEFENSIVE_SIGN_CONVENTION = "positive_is_better_and_reduces_predicted_opponent_scoring";
const BOX_FIELDS = Object.freeze([
  "points", "assists", "blocks", "defensiveRebounds", "fieldGoalAttempts", "fieldGoalsMade",
  "freeThrowAttempts", "freeThrowsMade", "offensiveRebounds", "personalFouls", "rebounds", "steals",
  "threePointAttempts", "threePointersMade", "turnovers", "twoPointAttempts", "twoPointMakes",
]);

function fail(message) {
  throw new TypeError(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} is not a verified nonnegative integer.`);
  return value;
}

function safeSeasonEndYear(value) {
  const seasonEndYear = Number(value);
  if (!Number.isSafeInteger(seasonEndYear) || !SWISHIQ_V3_PACKAGE_SEASON_END_YEARS.includes(seasonEndYear)) {
    fail("SwishIQ V3 Lineup Lab packages cover exact seasons from 2017-18 through 2025-26.");
  }
  return seasonEndYear;
}

function safeTeam(value) {
  const team = String(value || "").trim().toUpperCase();
  if (!TEAM_CODES.has(team)) fail("Choose a valid NBA team for the SwishIQ V3 package.");
  return team;
}

function safePhase(value) {
  const phase = String(value || "regular").trim().toLowerCase();
  if (!SWISHIQ_V3_PACKAGE_PHASES.includes(phase)) fail("Choose a supported exact-season phase for the SwishIQ V3 package.");
  return phase;
}

function requireExactProof(proof, request) {
  const scope = proof?.index?.scope;
  if (proof?.package?.modelId !== "swishiq-v3"
    || proof?.package?.status !== "published"
    || scope?.kind !== "exact-season"
    || scope?.seasonStartYear !== request.seasonEndYear - 1
    || scope?.seasonEndYear !== request.seasonEndYear
    || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1
    || scope.seasonStartYears[0] !== request.seasonEndYear - 1
    || scope.pooledFitIsSeasonSpecific !== true
    || !Array.isArray(scope.phases)
    || !scope.phases.includes(request.phase)) {
    fail("No published SwishIQ V3 exact-season package matches this selection. No pooled or older package was used.");
  }
  return proof;
}

async function exactSeasonProof(request, fetchImpl, registryUrl) {
  const proof = await loadSwishIqExactPackageProof({
    seasonEndYear: request.seasonEndYear,
    seasonPhase: request.phase,
    requiredCapabilities: ["swishiqStudio"],
    ...(registryUrl ? { registryUrl } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return requireExactProof(proof, request);
}

async function publicPart(proof, artifactId, fetchImpl) {
  const result = await loadSwishIqPublicPart(proof, {
    artifactId,
    kind: artifactId,
    capability: "swishiqStudio",
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return result.value.records;
}

function validatePlayerIndex(players) {
  if (!Array.isArray(players)) fail("The V3 public players part is malformed.");
  const byRef = new Map();
  for (const player of players) {
    if (!isObject(player) || !PLAYER_REF.test(String(player.playerRef || ""))
      || typeof player.displayName !== "string" || !player.displayName.trim()
      || !Array.isArray(player.positions)
      || player.positions.some(position => !POSITION_CODES.has(position))) {
      fail("The V3 public players part contains an invalid player identity.");
    }
    if (byRef.has(player.playerRef)) fail("The V3 public players part repeats a player reference.");
    byRef.set(player.playerRef, player);
  }
  return byRef;
}

function validateSeasonRow(row, playerByRef, scope) {
  if (!isObject(row) || !PLAYER_REF.test(String(row.playerRef || ""))
    || !playerByRef.has(row.playerRef)
    || row.displayName !== playerByRef.get(row.playerRef).displayName
    || !TEAM_CODES.has(row.teamCode)
    || row.seasonStartYear !== scope.seasonStartYear
    || !scope.phases.includes(row.phase)
    || typeof row.displayName !== "string" || !row.displayName.trim()
    || !Array.isArray(row.positions) || row.positions.length === 0
    || row.positions.some(position => !POSITION_CODES.has(position))
    || new Set(row.positions).size !== row.positions.length) {
    fail("A V3 player-season row does not match its published exact-season identity and scope.");
  }
  const games = nonNegativeInteger(row.games, "Player-season games");
  if (games < 1 || games > 200) fail("A V3 player-season row has no eligible official games.");
  if (row.starts !== null && row.starts !== undefined
    && (!Number.isSafeInteger(row.starts) || row.starts < 0 || row.starts > games)) {
    fail("A V3 player-season row has invalid official starts.");
  }
  if (!finite(row.minutes) || row.minutes < 0) fail("A V3 player-season row has invalid official minutes.");
  if (!isObject(row.box) || BOX_FIELDS.some(field => !Number.isSafeInteger(row.box[field]) || row.box[field] < 0)) {
    fail("A V3 player-season row is missing verified official box-score totals.");
  }
  if (row.box.fieldGoalsMade > row.box.fieldGoalAttempts
    || row.box.threePointersMade > row.box.threePointAttempts
    || row.box.freeThrowsMade > row.box.freeThrowAttempts
    || row.box.twoPointMakes > row.box.twoPointAttempts) {
    fail("A V3 player-season row has inconsistent official box-score totals.");
  }
  if (!isObject(row.metrics) || !isObject(row.metricNullReasons)) {
    fail("A V3 player-season row is missing its public metric values or null-reason map.");
  }
  return row;
}

async function rosterRefFor(playerRef, teamCode, seasonStartYear, phase) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") {
    fail("This browser cannot derive the V3 exact roster reference safely.");
  }
  const binding = `djhc-roster-v1:${playerRef}:${teamCode}:${seasonStartYear}:${phase}`;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(binding));
  const prefix = [...new Uint8Array(digest)].slice(0, 16)
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `r_${prefix}`;
}

function percent(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function sumRows(rows, field) {
  return rows.reduce((total, row) => total + row.box[field], 0);
}

function leagueRates(records) {
  const rows = records.filter(row => row.minutes > 0);
  const minutes = rows.reduce((total, row) => total + row.minutes, 0);
  if (!(minutes > 0)) return {};
  const per36 = field => sumRows(rows, field) * 36 / minutes;
  const fga = sumRows(rows, "fieldGoalAttempts");
  const threePa = sumRows(rows, "threePointAttempts");
  const fta = sumRows(rows, "freeThrowAttempts");
  return {
    points: per36("points"),
    rebounds: per36("rebounds"),
    assists: per36("assists"),
    steals: per36("steals"),
    blocks: per36("blocks"),
    turnovers: per36("turnovers"),
    efgPct: percent(sumRows(rows, "fieldGoalsMade") + 0.5 * sumRows(rows, "threePointersMade"), fga),
    threePct: percent(sumRows(rows, "threePointersMade"), threePa),
    freeThrowAttemptRate: percent(fta, fga),
  };
}

function seasonTotals(row) {
  return {
    games: row.games,
    minutes: row.minutes,
    fieldGoalsMade: row.box.fieldGoalsMade,
    fieldGoalsAttempted: row.box.fieldGoalAttempts,
    twoPointFieldGoalsMade: row.box.twoPointMakes,
    twoPointFieldGoalsAttempted: row.box.twoPointAttempts,
    threePointFieldGoalsMade: row.box.threePointersMade,
    threePointFieldGoalsAttempted: row.box.threePointAttempts,
    freeThrowsMade: row.box.freeThrowsMade,
    freeThrowsAttempted: row.box.freeThrowAttempts,
    offensiveRebounds: row.box.offensiveRebounds,
    defensiveRebounds: row.box.defensiveRebounds,
    totalRebounds: row.box.rebounds,
    assists: row.box.assists,
    steals: row.box.steals,
    blocks: row.box.blocks,
    turnovers: row.box.turnovers,
    personalFouls: row.box.personalFouls,
    points: row.box.points,
  };
}

function sourceInfo(proof, request, selectedRows) {
  const scope = proof.package.scope;
  return {
    kind: SWISHIQ_V3_PACKAGE_SOURCE_KIND,
    label: `SwishIQ V3 exact package · ${request.team} ${request.seasonEndYear - 1}–${String(request.seasonEndYear).slice(-2)}`,
    provider: "SwishIQ V3 approved public projection",
    team: request.team,
    seasonEndYear: request.seasonEndYear,
    season: `${request.seasonEndYear - 1}–${String(request.seasonEndYear).slice(-2)}`,
    seasonPhase: request.phase,
    packageScope: "exact-season",
    format: SWISHIQ_PUBLIC_PROJECTION_FORMAT,
    scope: {
      kind: "exact-season",
      teamCode: request.team,
      seasonStartYear: request.seasonEndYear - 1,
      seasonStartYears: [request.seasonEndYear - 1],
      seasonEndYear: request.seasonEndYear,
      phases: [request.phase],
    },
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    projectionContentSha256: proof.package.projectionContentSha256,
    modelId: proof.package.modelId,
    normalizer: proof.package.normalizer,
    metricsVersion: proof.package.metricsVersion,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    publicProjection: true,
    boxScoreEvidence: {
      artifactId: "player-seasons",
      rows: selectedRows.length,
      metricUnits: "V3 official box totals and the published exact player-season metric values with their denominators",
      gameCoverage: "verified exact team-season-phase player-season rows; not a replay-eligible subset",
    },
    packagePhases: [...scope.phases],
  };
}

function makePackageInfo(proof) {
  return Object.freeze({
    packageId: proof.package.packageId,
    packageVersion: proof.package.packageVersion,
    packageManifestSha256: proof.package.packageManifestSha256,
    sourceLockSha256: proof.package.sourceLockSha256,
    projectionContentSha256: proof.package.projectionContentSha256,
    modelId: proof.package.modelId,
    normalizer: proof.package.normalizer,
    metricsVersion: proof.package.metricsVersion,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
    scope: proof.package.scope,
  });
}

/** Load exact V3 official box rows without requiring lineup/impact capability. */
export async function loadSwishIqV3TeamDataset({
  seasonEndYear,
  team,
  seasonPhase = "regular",
  fetchImpl,
  registryUrl,
} = {}) {
  const request = {
    seasonEndYear: safeSeasonEndYear(seasonEndYear),
    team: safeTeam(team),
    phase: safePhase(seasonPhase),
  };
  const proof = await exactSeasonProof(request, fetchImpl, registryUrl);
  const [playerRows, seasonRows] = await Promise.all([
    publicPart(proof, "players", fetchImpl),
    publicPart(proof, "player-seasons", fetchImpl),
  ]);
  const playerByRef = validatePlayerIndex(playerRows);
  if (!Array.isArray(seasonRows)) fail("The V3 public player-seasons part is malformed.");
  const seen = new Set();
  const validatedRows = seasonRows.map(row => validateSeasonRow(row, playerByRef, proof.package.scope));
  for (const row of validatedRows) {
    const key = [row.playerRef, row.teamCode, row.seasonStartYear, row.phase].join("|");
    if (seen.has(key)) fail("The V3 public player-seasons part repeats an exact player/team/season/phase row.");
    seen.add(key);
  }
  const phaseRows = validatedRows.filter(row => row.phase === request.phase);
  const selectedRows = phaseRows.filter(row => row.teamCode === request.team);
  if (selectedRows.length < 5) {
    fail(`The published V3 package has no complete ${request.phase} roster for ${request.team} ${request.seasonEndYear - 1}-${String(request.seasonEndYear).slice(-2)}. No pooled or older package was used.`);
  }
  const ids = await Promise.all(selectedRows.map(row => rosterRefFor(
    row.playerRef, row.teamCode, row.seasonStartYear, row.phase,
  )));
  if (new Set(ids).size !== ids.length || ids.some(id => !ROSTER_REF.test(id))) {
    fail("The V3 exact roster references are not unique and valid.");
  }
  const teamMinutes = selectedRows.reduce((total, row) => total + row.minutes, 0);
  const phaseLeagueRates = leagueRates(phaseRows);
  const rawPlayers = selectedRows.map((row, index) => {
    const totals = seasonTotals(row);
    const games = row.games;
    const raw = {
      id: ids[index],
      playerRef: row.playerRef,
      rosterRef: ids[index],
      name: row.displayName,
      team: request.team,
      positions: row.positions,
      age: Number.isSafeInteger(row.age) && row.age >= 0 ? row.age : 0,
      ageKnown: Number.isSafeInteger(row.age) && row.age >= 0,
      games,
      starts: row.starts ?? 0,
      startsKnown: Number.isSafeInteger(row.starts),
      minutes: row.minutes / games,
      fgPct: percent(row.box.fieldGoalsMade, row.box.fieldGoalAttempts),
      threePct: percent(row.box.threePointersMade, row.box.threePointAttempts),
      efgPct: percent(row.box.fieldGoalsMade + 0.5 * row.box.threePointersMade, row.box.fieldGoalAttempts),
      ftPct: percent(row.box.freeThrowsMade, row.box.freeThrowAttempts),
      rebounds: row.box.rebounds / games,
      assists: row.box.assists / games,
      steals: row.box.steals / games,
      blocks: row.box.blocks / games,
      turnovers: row.box.turnovers / games,
      points: row.box.points / games,
      analytics: {
        totals,
        seasonTotals: totals,
        advanced: {},
        seasonAdvanced: {},
        leaguePer36: phaseLeagueRates,
        teamTotalMinutes: teamMinutes,
        v3Metrics: row.metrics,
        metricNullReasons: row.metricNullReasons,
        seasonEvidence: {
          scope: "exact-team-season-phase",
          completeness: "approved-v3-player-season-box",
          verifiedGames: games,
          method: "SwishIQ V3 exact public player-season projection",
          metricsVersion: proof.package.metricsVersion,
        },
        source: {
          season: `${request.seasonEndYear - 1}-${String(request.seasonEndYear).slice(-2)}`,
          team: request.team,
          phase: request.phase,
          provider: "SwishIQ V3",
          scope: "exact-team-season-phase",
        },
      },
    };
    return raw;
  });
  const source = sourceInfo(proof, request, selectedRows);
  const normalized = normalizeDataset({ schemaVersion: 1, source, players: rawPlayers }, {
    strict: true,
    warnOnGeneratedId: false,
  });
  // normalizeDataset's historical slugifier rewrites underscores. Restore the
  // public opaque roster refs exactly so V3 lineup proof joins stay identity-
  // based and never depend on display-name matching.
  normalized.players = normalized.players.map((player, index) => ({
    ...player,
    id: rawPlayers[index].id,
    playerRef: rawPlayers[index].playerRef,
    rosterRef: rawPlayers[index].rosterRef,
    ageKnown: rawPlayers[index].ageKnown,
    startsKnown: rawPlayers[index].startsKnown,
    analytics: rawPlayers[index].analytics,
  }));
  return Object.freeze({
    dataset: normalized,
    package: makePackageInfo(proof),
    coverage: Object.freeze({ matchingRows: selectedRows.length, usableRows: normalized.players.length }),
    sourceKind: SWISHIQ_V3_PACKAGE_SOURCE_KIND,
  });
}

function samePin(left, right, key) {
  return Boolean(left?.[key]) && left[key] === right?.[key];
}

/** Bind verified per-player impact to the V3 box roster by opaque V3 refs. */
export function bindSwishIqV3ImpactEvidence(boxDataset, impactProjection) {
  const source = boxDataset?.source;
  const impactSource = impactProjection?.dataset?.source;
  const packageRef = impactProjection?.package;
  const evidence = impactProjection?.evidence;
  if (source?.kind !== SWISHIQ_V3_PACKAGE_SOURCE_KIND || !Array.isArray(boxDataset?.players)
    || impactSource?.kind !== "swishiq-static-projection" || impactSource?.publicProjection !== true
    || packageRef?.modelId !== "swishiq-v3" || packageRef?.status !== "published"
    || evidence?.publicProjection !== true || evidence?.provenance?.kind !== "public-derived"
    || evidence?.provenance?.calibrationStatus !== "validated"
    || evidence?.package?.visibility !== "public") {
    fail("V3 impact requires a verified public exact-season lineup projection. No substitute evidence was used.");
  }
  for (const key of ["packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "projectionContentSha256", "modelId", "normalizer", "metricsVersion", "registryVersion", "registryRevisionSha256"]) {
    if (!samePin(source, packageRef, key) || !samePin(impactSource, packageRef, key)) {
      fail("The V3 box rows and lineup-impact proof are not bound to the same package pins.");
    }
  }
  const scope = packageRef.scope;
  const request = impactProjection.request || {};
  const evidenceScope = evidence.scope;
  const model = evidence.model;
  const lineupCapability = packageRef.capabilities?.lineupLab;
  if (scope?.kind !== "exact-season" || scope.pooledFitIsSeasonSpecific !== true
    || scope.seasonStartYears?.length !== 1
    || scope.seasonStartYears[0] !== Number(source.seasonEndYear) - 1
    || Number(scope.seasonEndYear) !== Number(source.seasonEndYear)
    || request.team !== source.team || Number(request.seasonEndYear) !== Number(source.seasonEndYear)
    || request.phase !== source.seasonPhase
    || evidenceScope?.kind !== "exact-season"
    || evidenceScope?.team !== source.team
    || Number(evidenceScope?.seasonEndYear) !== Number(source.seasonEndYear)
    || Number(evidenceScope?.selectedSeasonEndYear) !== Number(source.seasonEndYear)
    || evidenceScope?.selectedSeasonPhase !== source.seasonPhase
    || evidenceScope?.seasonStartYears?.length !== 1
    || Number(evidenceScope.seasonStartYears[0]) !== Number(source.seasonEndYear) - 1
    || model?.modelId !== "swishiq-v3"
    || model?.modelVersion !== IMPACT_MODEL_VERSION
    || model?.fitScope !== "exact-season-across-all-package-phases"
    || model?.exactSeasonHoldoutStatus !== "validated"
    || !HASH.test(String(model?.exactSeasonHoldoutEvidenceSha256 || ""))
    || model.exactSeasonHoldoutEvidenceSha256 !== lineupCapability?.evidenceSha256
    || model?.defensiveSignConvention !== DEFENSIVE_SIGN_CONVENTION
    || evidence.package?.packageId !== packageRef.packageId
    || evidence.package?.packageVersion !== packageRef.packageVersion
    || evidence.package?.packageManifestSha256 !== packageRef.packageManifestSha256
    || evidenceScope?.packageId !== packageRef.packageId
    || evidenceScope?.packageVersion !== packageRef.packageVersion
    || evidenceScope?.registryVersion !== packageRef.registryVersion
    || !isObject(evidence.players)) {
    fail("V3 impact proof is not validated for this exact selected team-season-phase.");
  }
  for (const capability of ["lineupLab", "publicAdvancedImpact"]) {
    const descriptor = packageRef.capabilities?.[capability];
    const requiredArtifacts = capability === "lineupLab"
      ? ["lineup-evidence", "exact-five-evidence", "player-impact"]
      : ["lineup-evidence", "player-impact"];
    if (descriptor?.status !== "available" || !HASH.test(String(descriptor.evidenceSha256 || ""))
      || !Array.isArray(descriptor.artifactIds)
      || requiredArtifacts.some(artifactId => !descriptor.artifactIds.includes(artifactId))) {
      fail("V3 exact lineup or advanced-impact capability proof is absent.");
    }
  }
  const impactPlayers = impactProjection.dataset.players;
  if (!Array.isArray(impactPlayers)) fail("V3 exact lineup player rows are malformed.");
  const boxByRef = new Map(boxDataset.players.map(player => [player.id, player]));
  const evidencePlayers = {};
  const seenRefs = new Set();
  for (const player of impactPlayers) {
    const rosterRef = String(player?.rosterRef || player?.id || "");
    const playerRef = String(player?.playerRef || "");
    const boxPlayer = boxByRef.get(rosterRef);
    const row = evidence.players[rosterRef];
    if (!ROSTER_REF.test(rosterRef) || !PLAYER_REF.test(playerRef) || !boxPlayer
      || boxPlayer.playerRef !== playerRef || !isObject(row) || row.displayEligible !== true
      || !finite(row.offense) || !finite(row.defense) || !finite(row.reliability)
      || row.reliability < 0 || row.reliability > 1 || seenRefs.has(rosterRef)) {
      fail("V3 impact rows do not bind uniquely to the selected official box-score roster.");
    }
    seenRefs.add(rosterRef);
    evidencePlayers[rosterRef] = row;
  }
  const missingPlayerIds = boxDataset.players.filter(player => !seenRefs.has(player.id)).map(player => player.id);
  const boundEvidence = {
    ...evidence,
    package: {
      ...evidence.package,
      sourceLockSha256: packageRef.sourceLockSha256,
      projectionContentSha256: packageRef.projectionContentSha256,
      registryVersion: packageRef.registryVersion,
      registryRevisionSha256: packageRef.registryRevisionSha256,
      modelId: packageRef.modelId,
      normalizer: packageRef.normalizer,
      metricsVersion: packageRef.metricsVersion,
      lineupLabEvidenceSha256: lineupCapability.evidenceSha256,
    },
    players: evidencePlayers,
    unresolvedPlayerIds: missingPlayerIds,
    coverage: {
      eligiblePlayerCount: seenRefs.size,
      boxScorePlayerCount: boxDataset.players.length,
      sampleStatus: missingPlayerIds.length ? "partial" : "complete",
    },
  };
  // V3 publishes observed descriptive combination rows separately. They are
  // deliberately not converted into causal chemistry or lineup adjustments.
  delete boundEvidence.exactLineups;
  return Object.freeze(boundEvidence);
}

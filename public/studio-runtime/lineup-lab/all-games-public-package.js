import { normalizeDataset } from "./player-data.js?v=20260923a";
import {
  ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  ALL_GAMES_LOCAL_PACKAGE_PIN,
  loadAllGamesCompanionIndex,
  loadAllGamesCompanionPackage,
} from "./all-games-companion-runtime.js?v=20261007a&rev=all-games-local-package-pin-v1";
import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from "../../engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure";

export { ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN, ALL_GAMES_LOCAL_PACKAGE_PIN };

export const ALL_GAMES_PACKAGE_SOURCE_KIND = "swishiq-all-games-package";
export const ALL_GAMES_PACKAGE_SEASON_END_YEARS = Object.freeze([2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
export const ALL_GAMES_PACKAGE_DEFAULT_SEASON_END_YEAR = 2026;
export const ALL_GAMES_PACKAGE_PHASES = Object.freeze(["regular", "playoffs"]);
export const ALL_GAMES_PACKAGE_TEAM_NAMES = Object.freeze({
  ATL: "Atlanta Hawks", BOS: "Boston Celtics", BKN: "Brooklyn Nets", CHA: "Charlotte Hornets", CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers", DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", GSW: "Golden State Warriors",
  HOU: "Houston Rockets", IND: "Indiana Pacers", LAC: "Los Angeles Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies",
  MIA: "Miami Heat", MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", NOP: "New Orleans Pelicans", NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder", ORL: "Orlando Magic", PHI: "Philadelphia 76ers", PHX: "Phoenix Suns", POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings", SAS: "San Antonio Spurs", TOR: "Toronto Raptors", UTA: "Utah Jazz", WAS: "Washington Wizards",
});

// This small index mirrors the package's exact row coverage without loading
// the player-season artifact. Regular-season coverage is the full league;
// playoff coverage is season-specific. Tests compare it with package rows.
const ALL_GAMES_PACKAGE_PLAYOFF_TEAM_CODES = Object.freeze({
  2018: Object.freeze(["BOS", "CLE", "GSW", "HOU", "IND", "MIA", "MIL", "MIN", "NOP", "OKC", "PHI", "POR", "SAS", "TOR", "UTA", "WAS"]),
  2019: Object.freeze(["BKN", "BOS", "DEN", "DET", "GSW", "HOU", "IND", "LAC", "MIL", "OKC", "ORL", "PHI", "POR", "SAS", "TOR", "UTA"]),
  2020: Object.freeze(["BKN", "BOS", "DAL", "DEN", "HOU", "IND", "LAC", "LAL", "MIA", "MIL", "OKC", "ORL", "PHI", "POR", "TOR", "UTA"]),
  2021: Object.freeze(["ATL", "BKN", "BOS", "DAL", "DEN", "LAC", "LAL", "MEM", "MIA", "MIL", "NYK", "PHI", "PHX", "POR", "UTA", "WAS"]),
  2022: Object.freeze(["ATL", "BKN", "BOS", "CHI", "DAL", "DEN", "GSW", "MEM", "MIA", "MIL", "MIN", "NOP", "PHI", "PHX", "TOR", "UTA"]),
  2023: Object.freeze(["ATL", "BKN", "BOS", "CLE", "DEN", "GSW", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NYK", "PHI", "PHX", "SAC"]),
  2024: Object.freeze(["BOS", "CLE", "DAL", "DEN", "IND", "LAC", "LAL", "MIA", "MIL", "MIN", "NOP", "NYK", "OKC", "ORL", "PHI", "PHX"]),
  2025: Object.freeze(["BOS", "CLE", "DEN", "DET", "GSW", "HOU", "IND", "LAL", "LAC", "MEM", "MIA", "MIL", "MIN", "NYK", "OKC", "ORL"]),
  2026: Object.freeze(["ATL", "BOS", "CLE", "DEN", "DET", "HOU", "LAL", "MIN", "NYK", "OKC", "ORL", "PHI", "PHX", "POR", "SAS", "TOR"]),
});
const ALL_GAMES_PACKAGE_REGULAR_TEAM_CODES = Object.freeze(Object.keys(ALL_GAMES_PACKAGE_TEAM_NAMES));
export const ALL_GAMES_PACKAGE_TEAM_COVERAGE = Object.freeze({
  regular: Object.freeze(Object.fromEntries(
    ALL_GAMES_PACKAGE_SEASON_END_YEARS.map((seasonEndYear) => [seasonEndYear, ALL_GAMES_PACKAGE_REGULAR_TEAM_CODES]),
  )),
  playoffs: ALL_GAMES_PACKAGE_PLAYOFF_TEAM_CODES,
});

// Resolve this URL from the package module rather than the current document.
// SwishIQ Studio imports this verified source from a sibling route, where a
// document-relative fetch would otherwise incorrectly request
// /tools/swishiq-studio/data/... instead of /tools/swishiq-studio/studio-runtime/lineup-lab/data/....
// Bump the immutable request revision whenever the package is rebuilt. This
// prevents a service-worker or browser cache from serving the pre-correction
// Edwards/roster snapshot after the verified all-games artifact changes.
const PACKAGE_URL = new URL("./data/swishiq-all-games-player-seasons-v1.json?v=20261007a&rev=all-games-local-package-pin-v1", import.meta.url).toString();
const PACKAGE_FORMAT = "djhc-lineup-lab-all-games-player-seasons-v1";
const TEAM_CODES = new Set(Object.keys(ALL_GAMES_PACKAGE_TEAM_NAMES));
const STAT_FIELDS_RECONCILED_FROM_ALL_GAMES = Object.freeze([
  "age",
  "games",
  "starts",
  "minutes",
  "fgPct",
  "threePct",
  "efgPct",
  "ftPct",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "points",
  "analytics",
]);
let packagePromise = null;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Text(value) {
  if (!globalThis.crypto?.subtle) throw new Error("The browser cannot verify the all-games package hash.");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireSeasonEndYear(value) {
  const seasonEndYear = Number(value);
  if (!Number.isSafeInteger(seasonEndYear) || !ALL_GAMES_PACKAGE_SEASON_END_YEARS.includes(seasonEndYear)) {
    throw new Error("The all-games package covers exact NBA seasons from 2017-18 through 2025-26.");
  }
  return seasonEndYear;
}

function requireTeamCode(value) {
  const team = String(value || "").trim().toUpperCase();
  if (!TEAM_CODES.has(team)) throw new Error("Choose a valid NBA team for the all-games package.");
  return team;
}

function requirePhase(value) {
  const phase = String(value || "regular").trim().toLowerCase();
  if (!ALL_GAMES_PACKAGE_PHASES.includes(phase)) throw new Error("Choose regular season or playoffs for the all-games package.");
  return phase;
}

/**
 * Return exact team coverage from the reviewed index without fetching player
 * rows. The full package remains reserved for a selected dataset or
 * reconciliation request.
 */
export function allGamesPackageTeamCodes({ seasonEndYear, seasonPhase = "regular" } = {}) {
  const year = requireSeasonEndYear(seasonEndYear);
  const phase = requirePhase(seasonPhase);
  const teamCodes = ALL_GAMES_PACKAGE_TEAM_COVERAGE[phase]?.[year];
  if (!Array.isArray(teamCodes) || !teamCodes.length) {
    throw new Error(`The all-games package has no ${phase} team coverage for ${year - 1}-${String(year).slice(-2)}.`);
  }
  return Object.freeze([...teamCodes].sort());
}

/**
 * Load exact All Games selector coverage from the companion index in the same
 * reviewed immutable release as the canonical V4 registry. This deliberately
 * avoids the legacy in-module V1 coverage table after V4 cutover.
 */
export async function loadAllGamesCompanionCoverage({
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
  canonicalReleasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  fetchImpl,
} = {}) {
  if (canonicalReleasePin?.status !== "reviewed" || typeof canonicalReleasePin.registryUrl !== "string") {
    throw new Error("The integrated V4 release pin is unavailable; All Games companion coverage was not loaded.");
  }
  if (releasePin?.status === "unconfigured") {
    const seasons = ALL_GAMES_PACKAGE_SEASON_END_YEARS.map((seasonEndYear) => ({
      seasonStartYear: seasonEndYear - 1,
      seasonEndYear,
      season_label: `${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}`,
    }));
    const phasesBySeasonEndYear = {};
    const teamCodesBySeasonEndYear = {};
    for (const seasonEndYear of ALL_GAMES_PACKAGE_SEASON_END_YEARS) {
      const phases = ALL_GAMES_PACKAGE_PHASES.filter((phase) => (
        Array.isArray(ALL_GAMES_PACKAGE_TEAM_COVERAGE[phase]?.[seasonEndYear])
      ));
      phasesBySeasonEndYear[seasonEndYear] = phases;
      teamCodesBySeasonEndYear[seasonEndYear] = Object.fromEntries(
        phases.map((phase) => [phase, [...ALL_GAMES_PACKAGE_TEAM_COVERAGE[phase][seasonEndYear]].sort()]),
      );
    }
    return Object.freeze({
      sourceMode: "local-pinned-descriptive-package",
      packageId: ALL_GAMES_LOCAL_PACKAGE_PIN.packageId,
      packageVersion: ALL_GAMES_LOCAL_PACKAGE_PIN.packageVersion,
      seasons: Object.freeze(seasons.map((season) => Object.freeze(season))),
      phasesBySeasonEndYear: Object.freeze(Object.fromEntries(
        Object.entries(phasesBySeasonEndYear).map(([year, phases]) => [year, Object.freeze(phases)]),
      )),
      teamCodesBySeasonEndYear: Object.freeze(Object.fromEntries(
        Object.entries(teamCodesBySeasonEndYear).map(([year, phases]) => [year, Object.freeze(Object.fromEntries(
          Object.entries(phases).map(([phase, codes]) => [phase, Object.freeze(codes)]),
        ))]),
      )),
      evidence: Object.freeze({ localPackage: ALL_GAMES_LOCAL_PACKAGE_PIN }),
    });
  }
  const proof = await loadAllGamesCompanionIndex({ releasePin, fetchImpl });
  let canonicalReleaseRoot;
  try {
    canonicalReleaseRoot = new URL(".", canonicalReleasePin.registryUrl).toString();
  } catch {
    throw new Error("The canonical V4 release registry URL is invalid; All Games companion coverage was not loaded.");
  }
  if (canonicalReleaseRoot !== proof.release.releaseRootUrl) {
    throw new Error("The All Games companion and canonical packages do not share the same reviewed V4 release root.");
  }

  const coverage = proof.scopeCoverage;
  const seasons = coverage.exact.rowsBySeasonPhase.map((season) => ({
    seasonStartYear: season.seasonStartYear,
    seasonEndYear: season.seasonStartYear + 1,
    season_label: `${season.seasonStartYear}-${String(season.seasonStartYear + 1).slice(-2)}`,
  }));
  const phasesBySeasonEndYear = {};
  const teamCodesBySeasonEndYear = {};
  for (const season of coverage.exact.rowsBySeasonPhase) {
    const seasonEndYear = season.seasonStartYear + 1;
    phasesBySeasonEndYear[seasonEndYear] = season.phases.map((row) => row.phase);
    teamCodesBySeasonEndYear[seasonEndYear] = Object.fromEntries(
      season.phases.map((row) => [row.phase, [...row.teamCodes]]),
    );
  }
  return Object.freeze({
    packageId: proof.resolved.entry.packageId,
    packageVersion: proof.resolved.entry.packageVersion,
    seasons: Object.freeze(seasons.map((season) => Object.freeze(season))),
    phasesBySeasonEndYear: Object.freeze(Object.fromEntries(
      Object.entries(phasesBySeasonEndYear).map(([year, phases]) => [year, Object.freeze([...phases])]),
    )),
    teamCodesBySeasonEndYear: Object.freeze(Object.fromEntries(
      Object.entries(teamCodesBySeasonEndYear).map(([year, phases]) => [year, Object.freeze(Object.fromEntries(
        Object.entries(phases).map(([phase, codes]) => [phase, Object.freeze([...codes])]),
      ))]),
    )),
    scopeCoverage: coverage,
    evidence: Object.freeze({
      canonicalRelease: Object.freeze({
        releaseId: proof.release.releaseId,
        releaseRootUrl: canonicalReleaseRoot,
        registryUrl: canonicalReleasePin.registryUrl,
        registrySha256: canonicalReleasePin.registrySha256,
        registryRevisionSha256: canonicalReleasePin.registryRevisionSha256,
        reviewReceiptSha256: canonicalReleasePin.reviewReceiptSha256,
        authorizationReferenceSha256: canonicalReleasePin.authorizationReferenceSha256,
      }),
      companionRelease: proof.release,
    }),
  });
}

function finiteNonNegative(value) {
  // A missing package field is unavailable evidence, not a recorded zero.
  // Keep null/undefined/blank values visible so partial rows cannot enter the
  // exact roster or bias the same-season baseline as low production.
  if (value === null || value === undefined
    || (typeof value === "string" && value.trim() === "")
    || typeof value === "boolean"
    || (typeof value !== "number" && typeof value !== "string")) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function percentage(numerator, denominator) {
  const made = finiteNonNegative(numerator);
  const attempts = finiteNonNegative(denominator);
  if (made === null || attempts === null) return null;
  return attempts > 0 ? made / attempts : 0;
}

function perGame(value, games) {
  const total = finiteNonNegative(value);
  const count = Number(games);
  if (total === null || !Number.isFinite(count) || count <= 0) return null;
  return total / count;
}

function validPositions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((position) => String(position).trim().toUpperCase()).filter((position) => ["G", "F", "C"].includes(position)))].sort();
}

function publicPlayerIdentityKey(player) {
  const name = String(player?.name || player?.displayName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const team = String(player?.team || player?.teamCode || "").trim().toUpperCase();
  return `${name}|${team}`;
}

function sourcePackageInfo(packageValue) {
  return {
    packageId: packageValue.packageId,
    packageVersion: packageValue.packageVersion,
    packageContentSha256: packageValue.contentHash,
    sourceContextSha256: packageValue.source?.sourceContextSha256 || null,
    sourceProvider: packageValue.source?.provider || "Basketball Reference",
    localPackagePin: packageValue.localPackagePin || null,
    scope: packageValue.scope,
    companionRelease: packageValue.release ? Object.freeze({
      status: "reviewed",
      releaseId: packageValue.release.releaseId,
      reviewReceiptSha256: packageValue.release.reviewReceiptSha256,
      authorizationReferenceSha256: packageValue.release.authorizationReferenceSha256,
      registrySha256: packageValue.release.registrySha256,
      registryRevisionSha256: packageValue.release.registryRevisionSha256,
      indexSha256: packageValue.release.indexSha256,
      artifactSha256: packageValue.release.artifactSha256,
      artifactByteLength: packageValue.release.artifactByteLength,
      entry: packageValue.release.entry,
      nativeV4CapabilityId: null,
    }) : null,
  };
}

function aggregateLeagueBaseline(records) {
  const sums = {
    minutes: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointFieldGoalsMade: 0,
    threePointFieldGoalsAttempted: 0,
    freeThrowsAttempted: 0,
  };
  const availableByField = Object.fromEntries([
    "points", "rebounds", "assists", "steals", "blocks", "turnovers",
    "fieldGoalsMade", "fieldGoalsAttempted", "threePointFieldGoalsMade",
    "threePointFieldGoalsAttempted", "freeThrowsAttempted",
  ].map((field) => [field, 0]));
  let expectedRows = 0;
  for (const row of records) {
    const totals = row?.totals;
    const minutes = finiteNonNegative(totals?.minutesPlayed);
    if (!(minutes > 0)) continue;
    expectedRows += 1;
    sums.minutes += minutes;
    for (const field of ["points", "totalRebounds", "assists", "steals", "blocks", "turnovers",
      "fieldGoalsMade", "fieldGoalsAttempted", "threePointFieldGoalsMade",
      "threePointFieldGoalsAttempted", "freeThrowsAttempted"]) {
      const value = finiteNonNegative(totals[field]);
      if (value === null) continue;
      const metric = field === "totalRebounds" ? "rebounds" : field;
      sums[metric] += value;
      availableByField[metric] += 1;
    }
  }
  if (!(sums.minutes > 0)) return Object.freeze({});
  const complete = (field) => availableByField[field] === expectedRows;
  const per36 = (field) => complete(field) ? sums[field] * 36 / sums.minutes : null;
  return Object.freeze({
    points: per36("points"),
    rebounds: per36("rebounds"),
    assists: per36("assists"),
    steals: per36("steals"),
    blocks: per36("blocks"),
    turnovers: per36("turnovers"),
    efgPct: complete("fieldGoalsMade") && complete("threePointFieldGoalsMade")
      && complete("fieldGoalsAttempted") && sums.fieldGoalsAttempted > 0
      ? (sums.fieldGoalsMade + 0.5 * sums.threePointFieldGoalsMade) / sums.fieldGoalsAttempted
      : null,
    threePct: complete("threePointFieldGoalsMade") && complete("threePointFieldGoalsAttempted")
      && sums.threePointFieldGoalsAttempted > 0
      ? sums.threePointFieldGoalsMade / sums.threePointFieldGoalsAttempted
      : null,
    freeThrowAttemptRate: complete("freeThrowsAttempted") && complete("fieldGoalsAttempted")
      && sums.fieldGoalsAttempted > 0
      ? sums.freeThrowsAttempted / sums.fieldGoalsAttempted
      : null,
  });
}

function analyticsForRow(row, request, leaguePer36, teamTotalMinutes, seasonRows = [row]) {
  const totals = row.totals && typeof row.totals === "object" ? row.totals : {};
  const selectedTeamTotals = {
    games: row.games,
    minutes: totals.minutesPlayed,
    fieldGoalsMade: totals.fieldGoalsMade,
    fieldGoalsAttempted: totals.fieldGoalsAttempted,
    threePointFieldGoalsMade: totals.threePointFieldGoalsMade,
    threePointFieldGoalsAttempted: totals.threePointFieldGoalsAttempted,
    freeThrowsMade: totals.freeThrowsMade,
    freeThrowsAttempted: totals.freeThrowsAttempted,
    offensiveRebounds: totals.offensiveRebounds,
    defensiveRebounds: totals.defensiveRebounds,
    totalRebounds: totals.totalRebounds,
    assists: totals.assists,
    steals: totals.steals,
    blocks: totals.blocks,
    turnovers: totals.turnovers,
    personalFouls: totals.personalFouls,
    points: totals.points,
  };
  const seasonTotals = Object.fromEntries(Object.keys(selectedTeamTotals).map(field => {
    const values = seasonRows.map(part => field === "games" ? part.games
      : field === "minutes" ? part.totals?.minutesPlayed : part.totals?.[field]);
    return [field, values.every(value => finiteNonNegative(value) !== null)
      ? values.reduce((sum, value) => sum + Number(value), 0) : null];
  }));
  const teams = [...new Set(seasonRows.map(part => part.teamCode))].sort();
  const urls = Array.isArray(row.sourceUrls) ? row.sourceUrls : [];
  return {
    totals: selectedTeamTotals,
    selectedTeamTotals,
    seasonTotals,
    advanced: row.advanced && typeof row.advanced === "object" ? row.advanced : {},
    // Advanced stint metrics are not generally additive. Keep the selected
    // row's advanced evidence separate rather than mislabeling it all-team.
    seasonAdvanced: seasonRows.length === 1 && row.advanced && typeof row.advanced === "object" ? row.advanced : {},
    // The all-games package contains exact full-season rows but does not ship
    // a repeated baseline on every record. Compute the same-season/phase
    // minute-weighted baseline once from the package and attach it here so the
    // optimizer can shrink per-36 rates instead of silently falling back to
    // raw tiny-sample production. This is a reference rate, not a player grade.
    leaguePer36,
    teamTotalMinutes,
    seasonEvidence: {
      scope: "season-wide",
      completeness: "public-full-season-player-totals",
      verifiedGames: seasonTotals.games,
      teamCodes: teams,
      sourceRowCount: seasonRows.length,
      method: "Basketball Reference regular-season/playoff totals",
    },
    selectedTeamEvidence: { scope: "selected-team-stint", teamCode: request.team,
      verifiedGames: row.games, seasonEndYear: request.seasonEndYear, phase: request.phase },
    postseasonAvailable: request.phase === "regular",
    source: {
      season: `${request.seasonEndYear - 1}-${String(request.seasonEndYear).slice(-2)}`,
      team: request.team,
      phase: request.phase,
      url: urls[0] || "https://www.basketball-reference.com/",
      provider: "Basketball Reference",
      scope: "full-season-player-totals",
    },
  };
}

function allTeamPlayerIdentity(row) {
  const key = String(row.sourceKey || "");
  // Current rows use provider slugs; retained rows encode name/season/phase/
  // team. Group those by the same normalized name without their stint suffix.
  if (key.startsWith("bref:") && key.endsWith(`:${row.teamCode}`)) {
    return `bref:${String(row.displayName).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  }
  if (!key) throw new Error("All Games row has no player source identity.");
  return `bref:${key}`;
}

function canonicalPlayer(row, request) {
  const games = Number(row.games);
  const starts = Number(row.starts);
  const minutes = finiteNonNegative(row.minutes);
  const positions = validPositions(row.positions);
  const totals = row.totals && typeof row.totals === "object" ? row.totals : {};
  if (row.teamCode !== request.team || row.seasonEndYear !== request.seasonEndYear || row.phase !== request.phase
    || !String(row.id || "").trim() || !String(row.displayName || "").trim()
    || !Number.isSafeInteger(games) || games < 1 || !Number.isSafeInteger(starts) || starts < 0 || starts > games
    || !(minutes > 0) || !positions.length) return null;

  const player = {
    id: String(row.id),
    name: String(row.displayName).trim(),
    team: request.team,
    positions,
    age: Number.isSafeInteger(Number(row.age)) && Number(row.age) >= 0 ? Number(row.age) : 0,
    games,
    starts,
    minutes,
    fgPct: percentage(totals.fieldGoalsMade, totals.fieldGoalsAttempted),
    threePct: percentage(totals.threePointFieldGoalsMade, totals.threePointFieldGoalsAttempted),
    efgPct: percentage(totals.fieldGoalsMade + (0.5 * totals.threePointFieldGoalsMade), totals.fieldGoalsAttempted),
    ftPct: percentage(totals.freeThrowsMade, totals.freeThrowsAttempted),
    rebounds: perGame(totals.totalRebounds, games),
    assists: perGame(totals.assists, games),
    steals: perGame(totals.steals, games),
    blocks: perGame(totals.blocks, games),
    turnovers: perGame(totals.turnovers, games),
    points: perGame(totals.points, games),
  };
  const required = [player.fgPct, player.threePct, player.efgPct, player.ftPct, player.rebounds, player.assists, player.steals, player.blocks, player.turnovers, player.points];
  return required.every((value) => Number.isFinite(value)) ? player : null;
}

async function loadAllGamesPackage({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
} = {}) {
  if (!fetchImpl) throw new Error("The all-games package fetcher is unavailable.");
  const canonicalV4Selected = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status === "reviewed";
  if (canonicalV4Selected) {
    if (releasePin?.status === "reviewed") {
      return loadAllGamesCompanionPackage({ releasePin, fetchImpl });
    }
    if (releasePin?.status !== "unconfigured") {
      throw new Error("The integrated V4 release is selected but its separately pinned All Games companion is unavailable. No source fallback was used.");
    }
  }
  if (CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN?.status !== "unconfigured") {
    if (!canonicalV4Selected) throw new Error("The integrated V4 source mode is invalid. All Games data was not loaded.");
  }
  if (releasePin?.status !== "unconfigured" && releasePin?.status !== "reviewed") {
    throw new Error("The All Games companion release pin is invalid. All Games data was not loaded.");
  }
  if (!packagePromise) {
    packagePromise = (async () => {
      const response = await fetchImpl(PACKAGE_URL, { cache: "no-store" });
      if (!response?.ok) throw new Error(`The all-games package could not be loaded (${response?.status || "network error"}).`);
      const text = await response.text();
      const artifactSha256 = await sha256Text(text);
      if (text.length === 0 || artifactSha256 !== ALL_GAMES_LOCAL_PACKAGE_PIN.artifactSha256) {
        throw new Error("The locally pinned all-games package bytes did not verify.");
      }
      let value;
      try { value = JSON.parse(text); }
      catch { throw new Error("The all-games package is not valid JSON."); }
      if (value?.format !== PACKAGE_FORMAT || value.schemaVersion !== 1 || !Array.isArray(value.records)
        || value.packageId !== ALL_GAMES_LOCAL_PACKAGE_PIN.packageId
        || value.packageVersion !== ALL_GAMES_LOCAL_PACKAGE_PIN.packageVersion
        || value.contentHash !== ALL_GAMES_LOCAL_PACKAGE_PIN.contentHash
        || value.source?.sourceContextSha256 !== ALL_GAMES_LOCAL_PACKAGE_PIN.sourceContextSha256
        || value.records.length !== 7709
        || value.coverage?.records !== 7709
        || value.scope?.kind !== "exact-season"
        || value.scope?.seasonEndYear !== 2026
        || stableJson(value.scope.seasonStartYears) !== stableJson(ALL_GAMES_PACKAGE_SEASON_END_YEARS.map((year) => year - 1))
        || stableJson([...value.scope.phases].sort()) !== stableJson([...ALL_GAMES_PACKAGE_PHASES].sort())) {
        throw new Error("The all-games package shape is invalid.");
      }
      const actualHash = await sha256Text(stableJson({ packageId: value.packageId, scope: value.scope, records: value.records }));
      if (actualHash !== value.contentHash || actualHash !== ALL_GAMES_LOCAL_PACKAGE_PIN.contentHash) {
        throw new Error("The all-games package content hash did not verify.");
      }
      return Object.freeze({
        ...value,
        localPackagePin: ALL_GAMES_LOCAL_PACKAGE_PIN,
      });
    })().catch((error) => {
      packagePromise = null;
      throw error;
    });
  }
  return packagePromise;
}

/**
 * Load every team row for one exact supported season and phase from the
 * verified all-games package. This keeps the package as the common season
 * context for Studio tools that work across more than one team.
 */
export async function loadAllGamesSeasonRecords({
  seasonEndYear,
  seasonPhase = "regular",
  fetchImpl,
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
} = {}) {
  const request = {
    seasonEndYear: requireSeasonEndYear(seasonEndYear),
    phase: requirePhase(seasonPhase),
  };
  const packageValue = await loadAllGamesPackage({ fetchImpl, releasePin });
  const records = packageValue.records.filter((row) => row.seasonEndYear === request.seasonEndYear
    && row.phase === request.phase);
  if (!records.length) {
    throw new Error(`The all-games package has no ${request.phase} rows for ${request.seasonEndYear - 1}-${String(request.seasonEndYear).slice(-2)}.`);
  }
  return Object.freeze({
    records: Object.freeze([...records]),
    package: Object.freeze(sourcePackageInfo(packageValue)),
    coverage: Object.freeze({ matchingRows: records.length }),
    sourceKind: ALL_GAMES_PACKAGE_SOURCE_KIND,
  });
}

function packageSource(packageValue, { team, seasonEndYear, phase, rows, skippedRows }) {
  const info = sourcePackageInfo(packageValue);
  return {
    kind: ALL_GAMES_PACKAGE_SOURCE_KIND,
    label: `SwishIQ all-games package · ${team} ${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}`,
    provider: "Basketball Reference full-season public totals",
    team,
    seasonEndYear,
    season: `${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}`,
    seasonPhase: phase,
    packageScope: "exact-season",
    // The artifact covers many seasons, but this dataset is one exact
    // team-season-phase slice. Keep replay scope narrow so a package-wide
    // artifact fingerprint cannot be mistaken for pooled model evidence.
    scope: {
      kind: "exact-season",
      teamCode: team,
      seasonStartYear: seasonEndYear - 1,
      seasonStartYears: [seasonEndYear - 1],
      seasonEndYear,
      phases: [phase],
    },
    packageId: info.packageId,
    packageVersion: info.packageVersion,
    packageContentSha256: info.packageContentSha256,
    sourceContextSha256: info.sourceContextSha256,
    sourceProvider: info.sourceProvider,
    ...(info.companionRelease ? { companionRelease: info.companionRelease } : {}),
    publicProjection: true,
    allGamesEvidence: {
      artifactId: "all-games-player-seasons",
      rows,
      skippedRows,
      metricUnits: "full-season per-game rates computed from public regular-season or playoff totals; not the replay-eligible subset",
      gameCoverage: "all published player appearances in the selected full season/phase",
      impact: "SwishIQ Impact remains separate and loads only when its exact lineup-evidence package is published",
    },
  };
}

/** Load one exact team-season from the reviewed all-games public package. */
export async function loadAllGamesTeamDataset({
  seasonEndYear,
  team,
  seasonPhase = "regular",
  fetchImpl,
  releasePin = ALL_GAMES_COMPANION_RUNTIME_RELEASE_PIN,
} = {}) {
  const request = {
    seasonEndYear: requireSeasonEndYear(seasonEndYear),
    team: requireTeamCode(team),
    phase: requirePhase(seasonPhase),
  };
  const packageValue = await loadAllGamesPackage({ fetchImpl, releasePin });
  const matching = packageValue.records.filter((row) => row.teamCode === request.team
    && row.seasonEndYear === request.seasonEndYear && row.phase === request.phase);
  const exactSeasonPhaseRows = packageValue.records.filter((row) =>
    row.seasonEndYear === request.seasonEndYear && row.phase === request.phase);
  const leaguePer36 = aggregateLeagueBaseline(exactSeasonPhaseRows);
  const allTeamRows = new Map();
  for (const row of exactSeasonPhaseRows) {
    const identity = allTeamPlayerIdentity(row);
    const rows = allTeamRows.get(identity) || [];
    if (rows.some(prior => prior.teamCode === row.teamCode)) throw new Error("All Games has duplicate player/team evidence.");
    rows.push(row);
    allTeamRows.set(identity, rows);
  }
  const teamTotalMinutes = matching.reduce((total, row) => {
    const minutes = finiteNonNegative(row?.totals?.minutesPlayed);
    return total + (minutes ?? 0);
  }, 0);
  const players = [];
  const analytics = new Map();
  let skippedRows = 0;
  for (const row of matching) {
    const player = canonicalPlayer(row, request);
    if (!player) {
      skippedRows += 1;
      continue;
    }
    players.push(player);
    const identity = allTeamPlayerIdentity(row);
    analytics.set(player.id.toLowerCase(), analyticsForRow(row, request, leaguePer36, teamTotalMinutes, allTeamRows.get(identity)));
  }
  if (skippedRows > 0) {
    throw new Error(`The all-games package contains ${skippedRows} incomplete ${request.phase} roster row${skippedRows === 1 ? "" : "s"}. No partial exact-season roster was loaded.`);
  }
  if (players.length < 5) {
    throw new Error(`The all-games package has no complete player roster for ${request.team} ${request.seasonEndYear - 1}-${String(request.seasonEndYear).slice(-2)} ${request.phase}. No replay-eligible, pooled, or private fallback was used.`);
  }
  const source = packageSource(packageValue, {
    team: request.team,
    seasonEndYear: request.seasonEndYear,
    phase: request.phase,
    rows: matching.length,
    skippedRows,
  });
  const normalized = normalizeDataset({ schemaVersion: 1, source, players }, { strict: true, warnOnGeneratedId: false });
  normalized.players = normalized.players.map((player) => ({ ...player, analytics: analytics.get(player.id.toLowerCase()) || null }));
  return Object.freeze({
    dataset: normalized,
    package: Object.freeze(sourcePackageInfo(packageValue)),
    coverage: Object.freeze({ matchingRows: matching.length, usableRows: players.length, skippedRows }),
    sourceKind: ALL_GAMES_PACKAGE_SOURCE_KIND,
  });
}

/**
 * Reconcile the visible box-stat fields in an exact SwishIQ Impact roster
 * with the reviewed all-games package. The Impact roster remains the source
 * of opaque player/roster identities and impact coefficients; only public
 * season-stat fields are replaced. This is deliberately a fail-closed join:
 * a missing or ambiguous display-name/team match cannot silently publish a
 * partial or stale statline.
 */
export function reconcileImpactDatasetWithAllGamesDataset(
  impactDataset,
  allGamesDataset,
  { requireComplete = true } = {},
) {
  if (!impactDataset || !Array.isArray(impactDataset.players) || !impactDataset.source) {
    throw new Error("The SwishIQ Impact dataset is missing its verified roster source.");
  }
  if (!allGamesDataset || !Array.isArray(allGamesDataset.players) || !allGamesDataset.source) {
    throw new Error("The all-games dataset is missing its verified player source.");
  }
  if (allGamesDataset.source.kind !== ALL_GAMES_PACKAGE_SOURCE_KIND) {
    throw new Error("Lineup Lab can reconcile Impact stats only from the validated all-games package.");
  }

  const impactSource = impactDataset.source;
  const allGamesSource = allGamesDataset.source;
  const impactPhase = String(impactSource.seasonPhase || impactSource.phase || "").toLowerCase();
  const allGamesPhase = String(allGamesSource.seasonPhase || allGamesSource.phase || "").toLowerCase();
  if (String(impactSource.team || "").toUpperCase() !== String(allGamesSource.team || "").toUpperCase()
    || Number(impactSource.seasonEndYear) !== Number(allGamesSource.seasonEndYear)
    || impactPhase !== allGamesPhase
    || !ALL_GAMES_PACKAGE_PHASES.includes(allGamesPhase)) {
    throw new Error("The Impact roster and all-games stats do not describe the same exact team-season phase.");
  }

  const allGamesByIdentity = new Map();
  for (const player of allGamesDataset.players) {
    const key = publicPlayerIdentityKey(player);
    if (!key || key.endsWith("|")) continue;
    const matches = allGamesByIdentity.get(key) || [];
    matches.push(player);
    allGamesByIdentity.set(key, matches);
  }

  const missing = [];
  const ambiguous = [];
  const matches = impactDataset.players.map((impactPlayer) => {
    const key = publicPlayerIdentityKey(impactPlayer);
    const candidates = allGamesByIdentity.get(key) || [];
    if (candidates.length === 0) {
      missing.push(impactPlayer.name || impactPlayer.displayName || impactPlayer.id);
      return null;
    }
    if (candidates.length !== 1) {
      ambiguous.push(impactPlayer.name || impactPlayer.displayName || impactPlayer.id);
      return null;
    }
    return { impactPlayer, allGamesPlayer: candidates[0] };
  });
  if (requireComplete && (missing.length || ambiguous.length)) {
    const details = [
      missing.length ? `${missing.length} missing` : "",
      ambiguous.length ? `${ambiguous.length} ambiguous` : "",
    ].filter(Boolean).join(", ");
    throw new Error(`The all-games stat reconciliation was not complete (${details}). No mixed or partial Impact roster was published.`);
  }

  const reconciledPlayers = matches.map((match, index) => {
    if (!match) return impactDataset.players[index];
    const { impactPlayer, allGamesPlayer } = match;
    const reconciled = { ...impactPlayer };
    for (const field of STAT_FIELDS_RECONCILED_FROM_ALL_GAMES) {
      if (allGamesPlayer[field] !== undefined) reconciled[field] = allGamesPlayer[field];
    }
    return reconciled;
  });

  const packageRef = allGamesDataset.source;
  return {
    ...impactDataset,
    source: {
      ...impactSource,
      playerStatsSource: {
        kind: ALL_GAMES_PACKAGE_SOURCE_KIND,
        packageId: packageRef.packageId,
        packageVersion: packageRef.packageVersion,
        packageContentSha256: packageRef.packageContentSha256,
        scope: "full-season-player-totals",
      },
      statReconciliation: {
        status: missing.length || ambiguous.length ? "partial" : "complete",
        matchedPlayers: matches.filter(Boolean).length,
        impactPlayers: impactDataset.players.length,
        join: "unique-public-name-team-season-phase",
        identityNote: "Impact playerRef and rosterRef identities remain unchanged; this join only supplies visible full-season stat fields.",
        missing,
        ambiguous,
      },
    },
    players: reconciledPlayers,
  };
}

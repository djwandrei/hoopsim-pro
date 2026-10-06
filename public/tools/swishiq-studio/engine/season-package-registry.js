/*
 * Buyer-safe season-package registry contract.
 *
 * The registry is the only source used to select a published SwishIQ package.
 * A page must not infer a shard name, append a season to a URL, or combine
 * files from two snapshots.  Keep this module free of private source paths and
 * provider identifiers so it can run in the browser.
 */

export const SWISHIQ_PACKAGE_REGISTRY_CONTRACT_VERSION = 1;
export const SWISHIQ_PACKAGE_REGISTRY_VERSION = "swishiq-season-package-registry-v1";
export const SWISHIQ_COMBINED_START_YEAR = 2017;
export const SWISHIQ_COMBINED_END_YEAR = 2026;
export const SWISHIQ_COMBINED_SEASON_START_YEARS = Object.freeze(
  Array.from({ length: SWISHIQ_COMBINED_END_YEAR - SWISHIQ_COMBINED_START_YEAR }, (_, index) => SWISHIQ_COMBINED_START_YEAR + index),
);
export const LINEUP_SWISHIQ_EVIDENCE_CONTRACT_VERSION = 2;

const SAFE_PACKAGE_ID = /^[a-z0-9][a-z0-9._-]{2,79}$/;
const SAFE_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const PACKAGE_VISIBILITIES = new Set(["public", "authenticated", "private"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeYears(value, label = "seasonStartYears") {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const years = value.map(Number);
  if (years.some((year) => !Number.isSafeInteger(year) || year < 1947 || year > 2200)
    || new Set(years).size !== years.length) {
    throw new Error(`${label} must contain distinct valid season years.`);
  }
  return years.sort((left, right) => left - right);
}

function seasonEndsFor(packageEntry) {
  const years = packageEntry?.seasonStartYears;
  if (!Array.isArray(years)) return [];
  return years.map((year) => Number(year) + 1);
}

function hasModel(packageEntry, mode) {
  const model = packageEntry?.models?.[mode];
  return isObject(model) && model.enabled === true;
}

export function assertPublicRegistryPath(value, label = "registry path") {
  if (typeof value !== "string" || !SAFE_PATH.test(value) || value.includes("..")) {
    throw new Error(`${label} is not a safe package-relative JSON path.`);
  }
  return value;
}

/**
 * Validate the complete public contract and return only normalized metadata.
 * The caller still verifies the selected index and shard's package/version
 * fields after fetching them.  A valid registry with no approved package is
 * intentionally unusable.
 */
export function validateSwishIqSeasonPackageRegistry(value, { requireApproved = true } = {}) {
  const issues = [];
  if (!isObject(value)) return { ok: false, issues: ["The season-package registry is not an object."], packages: [] };
  if (value.contractVersion !== SWISHIQ_PACKAGE_REGISTRY_CONTRACT_VERSION) issues.push("The season-package registry contract is unsupported.");
  if (value.registryVersion !== SWISHIQ_PACKAGE_REGISTRY_VERSION) issues.push("The season-package registry version is unsupported.");
  if (typeof value.registryId !== "string" || !SAFE_PACKAGE_ID.test(value.registryId)) issues.push("The season-package registry has no valid registry ID.");
  if (typeof value.generatedAt !== "string" || !value.generatedAt.trim()) issues.push("The season-package registry has no generation timestamp.");
  if (!Array.isArray(value.packages) || value.packages.length === 0) issues.push("The season-package registry has no package entries.");

  const packages = [];
  const packageKeys = new Set();
  const approvedIds = new Set();
  for (const [index, raw] of (Array.isArray(value.packages) ? value.packages : []).entries()) {
    const entry = isObject(raw) ? raw : {};
    const label = `package ${index + 1}`;
    const packageId = typeof entry.packageId === "string" ? entry.packageId.trim() : "";
    if (!SAFE_PACKAGE_ID.test(packageId)) issues.push(`${label} has no valid package ID.`);
    const packageVersion = typeof entry.packageVersion === "string" ? entry.packageVersion.trim() : "";
    if (!packageVersion || packageVersion.length > 120) issues.push(`${label} has no bounded package version.`);
    const packageKey = `${packageId}\u0000${packageVersion}`;
    if (packageKeys.has(packageKey)) issues.push(`${label} duplicates a package ID and version.`);
    packageKeys.add(packageKey);
    const status = typeof entry.status === "string" ? entry.status.trim().toLowerCase() : "";
    if (!["building", "ready", "approved", "retired"].includes(status)) issues.push(`${label} has an unsupported status.`);
    const visibility = typeof entry.visibility === "string" ? entry.visibility.trim().toLowerCase() : "public";
    if (!PACKAGE_VISIBILITIES.has(visibility)) issues.push(`${label} has an unsupported visibility.`);
    for (const [field, value] of [["packageManifestSha256", entry.packageManifestSha256], ["sourceManifestSetSha256", entry.sourceManifestSetSha256]]) {
      if (value !== undefined && value !== null && value !== "" && !SHA256.test(String(value))) issues.push(`${label} has an invalid ${field}.`);
    }
    let years = [];
    try { years = normalizeYears(entry.seasonStartYears, `${label} seasonStartYears`); }
    catch (error) { issues.push(error.message); }
    if (Number(entry.seasonStartYear) !== years[0] || Number(entry.seasonEndYear) !== years.at(-1) + 1) {
      issues.push(`${label} has an inconsistent season window.`);
    }
    if (!isObject(entry.models) || (!hasModel(entry, "combined") && !hasModel(entry, "historical"))) {
      issues.push(`${label} must advertise at least one supported evidence mode.`);
    }
    const combined = entry.models?.combined;
    if (hasModel(entry, "combined")) {
      try {
        if (combined.evidenceScope !== "pooled-window" || combined.exactSeasonRequired !== false
          || JSON.stringify(normalizeYears(combined.seasonStartYears || [], `${label} combined seasonStartYears`)) !== JSON.stringify(years)) {
          issues.push(`${label} combined mode does not describe the package window.`);
        }
      } catch (error) { issues.push(error.message); }
    }
    const historical = entry.models?.historical;
    if (hasModel(entry, "historical")) {
      try {
        if (historical.evidenceScope !== "exact-season" || historical.exactSeasonRequired !== true
          || JSON.stringify(normalizeYears(historical.seasonEndYears || [], `${label} historical seasonEndYears`)) !== JSON.stringify(seasonEndsFor(entry))) {
          issues.push(`${label} historical mode does not advertise exact supported seasons.`);
        }
      } catch (error) { issues.push(error.message); }
    }
    const projection = entry.publicProjection;
    if (!isObject(projection)) {
      if (status === "approved" && visibility === "public") issues.push(`${label} has no public projection descriptor.`);
    } else {
      try { assertPublicRegistryPath(projection.indexPath, `${label} indexPath`); }
      catch (error) { issues.push(error.message); }
      if (!Array.isArray(projection.teams) || projection.teams.length === 0) issues.push(`${label} has no public team paths.`);
      const teamIds = new Set();
      for (const [teamIndex, team] of (Array.isArray(projection.teams) ? projection.teams : []).entries()) {
        const teamLabel = `${label} team ${teamIndex + 1}`;
        if (!isObject(team) || typeof team.id !== "string" || !/^t\d{1,3}$/.test(team.id)) issues.push(`${teamLabel} has no valid opaque ID.`);
        if (teamIds.has(team?.id)) issues.push(`${teamLabel} duplicates an opaque ID.`);
        teamIds.add(team?.id);
        if (typeof team.name !== "string" || !team.name.trim() || team.name.length > 120) issues.push(`${teamLabel} has no bounded name.`);
        try { assertPublicRegistryPath(team.path, `${teamLabel} path`); }
        catch (error) { issues.push(error.message); }
      }
    }
    if (status === "approved") {
      if (approvedIds.has(packageId)) issues.push(`${label} duplicates an approved package ID.`);
      approvedIds.add(packageId);
      packages.push({ ...entry, packageId, packageVersion, status, visibility, seasonStartYears: years });
    }
  }
  if (requireApproved && packages.length === 0) issues.push("The season-package registry has no approved package.");
  return { ok: issues.length === 0, issues: [...new Set(issues)], packages, registry: value };
}

export function selectSwishIqSeasonPackage(value, {
  mode = "combined", seasonEndYear = null, visibility = "any", requireExactHistorical = true,
} = {}) {
  const normalizedMode = mode === "swishiq" ? "combined" : mode;
  if (!["combined", "historical"].includes(normalizedMode)) throw new Error("Choose a supported SwishIQ evidence mode.");
  const requestedVisibility = String(visibility || "any").trim().toLowerCase();
  if (!["any", ...PACKAGE_VISIBILITIES].includes(requestedVisibility)) throw new Error("Choose a supported SwishIQ package visibility.");
  const check = validateSwishIqSeasonPackageRegistry(value);
  if (!check.ok) throw new Error(check.issues[0] || "The season-package registry is not ready.");
  const selectedYear = seasonEndYear === null || seasonEndYear === undefined ? null : Number(seasonEndYear);
  let candidates = check.packages.filter((entry) => {
    if (!hasModel(entry, normalizedMode)) return false;
    if (requestedVisibility !== "any" && entry.visibility !== requestedVisibility) return false;
    if (selectedYear === null) return true;
    return seasonEndsFor(entry).includes(selectedYear);
  });
  // Historical requests use an exact standalone package. A caller that is
  // deliberately supporting an older pooled-only registry must opt into the
  // compatibility fallback; it is never a silent downgrade.
  if (normalizedMode === "historical" && requireExactHistorical) {
    candidates = candidates.filter((entry) => entry.seasonStartYears.length === 1);
  }
  if (normalizedMode === "historical") candidates.sort((left, right) => Number(right.seasonStartYears.length === 1) - Number(left.seasonStartYears.length === 1));
  const match = candidates[0];
  if (!match) throw new Error(`No approved SwishIQ package supports ${normalizedMode} evidence for the selected season.`);
  return match;
}

export class SwishIqEvidenceContractError extends Error {
  constructor(message, { fallbackMode = null, unresolvedPlayerIds = [] } = {}) {
    super(message);
    this.name = "SwishIqEvidenceContractError";
    this.fallbackMode = fallbackMode;
    this.unresolvedPlayerIds = [...unresolvedPlayerIds];
  }
}

export function canonicalPlayerIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) {
    throw new SwishIqEvidenceContractError("Choose at least one saved NBA player.");
  }
  const ids = [...new Set(value.map((id) => {
    const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
    if (!UUID.test(normalized)) throw new SwishIqEvidenceContractError("SwishIQ requests require canonical NBA player IDs.");
    return normalized;
  }))].sort();
  if (!ids.length) throw new SwishIqEvidenceContractError("SwishIQ requests require canonical NBA player IDs.");
  return ids;
}

function selectedSeason(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1980 || year > 2200) {
    throw new SwishIqEvidenceContractError("Choose a supported historical season.");
  }
  return year;
}

function selectedTeam(value) {
  const team = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(team)) throw new SwishIqEvidenceContractError("Choose a valid NBA team.");
  return team;
}

/** Build the authenticated request without allowing package paths or IDs to be guessed. */
export function buildSwishIqEvidenceRequest({
  seasonEndYear, team, playerIds, modelMode = "combined", seasonPhase = "regular",
  registry = null, packageId = null, requireExactHistorical = true,
} = {}) {
  const mode = modelMode === "swishiq" ? "combined" : String(modelMode || "").trim().toLowerCase();
  if (!["combined", "historical"].includes(mode)) throw new SwishIqEvidenceContractError("Choose Combined or Historical SwishIQ evidence.");
  const season = selectedSeason(seasonEndYear);
  const normalizedTeam = selectedTeam(team);
  const phase = String(seasonPhase || "regular").trim().toLowerCase();
  if (!["regular", "playoffs"].includes(phase)) throw new SwishIqEvidenceContractError("Season phase must be regular or playoffs.");
  const canonicalIds = canonicalPlayerIds(playerIds);
  let selectedPackage = null;
  if (registry) selectedPackage = selectSwishIqSeasonPackage(registry, { mode, seasonEndYear: season, requireExactHistorical });
  const years = selectedPackage?.seasonStartYears || [...SWISHIQ_COMBINED_SEASON_START_YEARS];
  const id = selectedPackage?.packageId || packageId || "nba-swishiq-2017-26-v1";
  if (!SAFE_PACKAGE_ID.test(id)) throw new SwishIqEvidenceContractError("The selected package ID is invalid.");
  return {
    contractVersion: LINEUP_SWISHIQ_EVIDENCE_CONTRACT_VERSION,
    registryVersion: registry?.registryVersion || SWISHIQ_PACKAGE_REGISTRY_VERSION,
    packageId: id,
    packageVersion: selectedPackage?.packageVersion || null,
    packageManifestSha256: selectedPackage?.packageManifestSha256 || null,
    sourceManifestSetSha256: selectedPackage?.sourceManifestSetSha256 || null,
    modelMode: mode,
    evidenceScope: mode === "combined" ? "pooled-window" : "exact-season",
    seasonStartYears: mode === "combined" ? years : [season - 1],
    seasonStartYear: mode === "combined" ? years[0] : season - 1,
    seasonEndYear: season,
    selectedSeasonEndYear: season,
    selectedSeasonPhase: phase,
    team: normalizedTeam,
    playerIds: canonicalIds,
  };
}

function responsePlayers(value) {
  if (!isObject(value)) return {};
  const players = {};
  for (const [id, row] of Object.entries(value)) {
    if (!UUID.test(id) || !isObject(row)) throw new SwishIqEvidenceContractError("SwishIQ returned a malformed canonical player row.");
    if (Object.keys(row).some((key) => /provider|external|archivePath|storage/i.test(key))) {
      throw new SwishIqEvidenceContractError("SwishIQ returned an identity field outside the canonical contract.");
    }
    players[id.toLowerCase()] = row;
  }
  return players;
}

/** Validate an authenticated response and fail closed to Historical for gaps. */
export function validateSwishIqEvidenceResponse(evidence, request) {
  if (!isObject(evidence) || evidence.contractVersion !== LINEUP_SWISHIQ_EVIDENCE_CONTRACT_VERSION) {
    throw new SwishIqEvidenceContractError("SwishIQ evidence is unavailable for this package. Historical mode remains available.");
  }
  const scope = isObject(evidence.scope) ? evidence.scope : {};
  const requested = canonicalPlayerIds(request?.playerIds);
  const mode = request?.modelMode === "swishiq" ? "combined" : request?.modelMode;
  const expectedKind = mode === "combined" ? "pooled-window" : "exact-season";
  const expectedYears = Array.isArray(request?.seasonStartYears) ? request.seasonStartYears.map(Number) : [];
  const scopeYears = Array.isArray(scope.seasonStartYears) ? scope.seasonStartYears.map(Number) : [];
  const expectedWindowEndYear = mode === "combined"
    ? (expectedYears.at(-1) ?? SWISHIQ_COMBINED_END_YEAR) + 1
    : Number(request.seasonEndYear);
  const sameYears = expectedYears.length === scopeYears.length && expectedYears.every((year, index) => year === scopeYears[index]);
  const responsePackage = isObject(evidence.package) ? evidence.package : {};
  if (scope.packageId !== request.packageId || scope.registryVersion !== request.registryVersion
    || responsePackage.packageId !== request.packageId || responsePackage.packageVersion !== request.packageVersion
    || (request.packageManifestSha256 && responsePackage.packageManifestSha256 !== request.packageManifestSha256)
    || (request.sourceManifestSetSha256 && responsePackage.sourceManifestSetSha256 !== request.sourceManifestSetSha256)
    || scope.packageVersion !== request.packageVersion || scope.kind !== expectedKind || scope.team !== request.team
    || scope.selectedSeasonPhase !== request.selectedSeasonPhase
    || Number(scope.selectedSeasonEndYear) !== Number(request.selectedSeasonEndYear)
    || !sameYears || Number(scope.seasonEndYear) !== expectedWindowEndYear) {
    throw new SwishIqEvidenceContractError("SwishIQ evidence does not match the selected package or season. Historical mode remains available.");
  }
  const players = responsePlayers(evidence.players);
  const unresolved = [...new Set((Array.isArray(evidence.unresolvedPlayerIds) ? evidence.unresolvedPlayerIds : [])
    .map((id) => String(id).trim().toLowerCase()))];
  if (unresolved.some((id) => !UUID.test(id))) throw new SwishIqEvidenceContractError("SwishIQ returned an invalid unresolved player ID.");
  const resolvedIds = Object.keys(players);
  const missing = requested.filter((id) => !resolvedIds.includes(id) && !unresolved.includes(id));
  const unresolvedAll = [...new Set([...unresolved, ...missing])];
  if (unresolvedAll.length) {
    throw new SwishIqEvidenceContractError(
      "Some roster players could not be matched to canonical SwishIQ evidence. Historical mode was selected for this run.",
      { fallbackMode: "historical", unresolvedPlayerIds: unresolvedAll },
    );
  }
  return evidence;
}

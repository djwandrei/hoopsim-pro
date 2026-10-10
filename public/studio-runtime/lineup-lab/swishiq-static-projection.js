/*
 * Lineup Lab imports the shared browser verifier through this source-local
 * wrapper. The canonical implementation lives in /tools so games and Lineup
 * Lab verify the same registry, projection index, and artifact hashes.
 */
// Carry the Lineup Lab release revision through the shared import so a
// service-worker runtime cache cannot keep an older verifier module after a
// package repair. The release builder rewrites both the path and token for
// the deployable mirror.
export * from "../modules/swishiq-static-projection.js?v=20261001&rev=swishiq-v3-helper-typed-v4-cutover-gate-v1";

// Keep the public Lineup Lab access decision adjacent to the shared verifier.
// The verifier proves the bytes, package pins, and capability descriptors; this
// small adapter makes the UI's final readiness gate explicit and testable.
export const SWISHIQ_IMPACT_REQUIRED_CAPABILITIES = Object.freeze([
  "lineupLab",
  "publicAdvancedImpact",
]);

const UNAVAILABLE_MESSAGE = "SwishIQ Impact is unavailable for this team-season. Choose another season or use Historical; box-score stats remain available, and no other season is substituted.";

const PUBLIC_PHASES = new Set(["regular", "in_season_tournament", "play_in", "playoffs"]);

function capabilityIsAvailable(capabilities, capability) {
  const descriptor = capabilities?.[capability];
  return descriptor?.status === "available"
    && Array.isArray(descriptor.artifactIds)
    && descriptor.artifactIds.length > 0;
}

function unavailable(reason = UNAVAILABLE_MESSAGE) {
  return Object.freeze({ available: false, reason });
}

/**
 * Confirm that the verified static projection remains bound to the visitor's
 * exact selection. This deliberately accepts no account, session, or admin
 * input: a published public projection is equally available to every visitor.
 */
export function publicSwishIqImpactAvailability(projection, selection = {}) {
  const team = String(selection?.team || "").trim().toUpperCase();
  const seasonEndYear = Number(selection?.season ?? selection?.seasonEndYear);
  const phase = String(selection?.seasonPhase || "").trim().toLowerCase();
  const packageRef = projection?.package;
  const scope = packageRef?.scope;
  const request = projection?.request || {
    team: projection?.dataset?.source?.team,
    seasonEndYear: projection?.dataset?.source?.seasonEndYear,
    phase: projection?.dataset?.source?.seasonPhase,
  };
  const source = projection?.dataset?.source;

  if (!/^[A-Z]{3}$/.test(team) || !Number.isInteger(seasonEndYear) || !PUBLIC_PHASES.has(phase)) {
    return unavailable("Choose a team, season, and phase before loading SwishIQ Impact.");
  }
  if (packageRef?.status !== "published" || packageRef?.modelId !== "swishiq-v3"
    || scope?.kind !== "exact-season"
    || !Array.isArray(scope.seasonStartYears) || scope.seasonStartYears.length !== 1
    || scope.seasonStartYears[0] !== seasonEndYear - 1
    || scope.seasonStartYear !== seasonEndYear - 1
    || scope.seasonEndYear !== seasonEndYear
    || scope.pooledFitIsSeasonSpecific !== true
    || !Array.isArray(scope.phases) || !scope.phases.includes(phase)) {
    return unavailable();
  }
  if (!SWISHIQ_IMPACT_REQUIRED_CAPABILITIES.every((capability) => capabilityIsAvailable(packageRef.capabilities, capability))) {
    return unavailable();
  }
  // The shared static loader already verifies package/index capability parity.
  // If a caller supplies the full proof, keep this final UI gate explicit too.
  if (projection?.index?.capabilities
    && !SWISHIQ_IMPACT_REQUIRED_CAPABILITIES.every((capability) => capabilityIsAvailable(projection.index.capabilities, capability))) {
    return unavailable();
  }
  const requestTeam = String(request?.team || "").trim().toUpperCase();
  const requestSeason = Number(request?.seasonEndYear ?? request?.season);
  const requestPhase = String(request?.phase || request?.seasonPhase || "").trim().toLowerCase();
  const sourceTeam = String(source?.team || "").trim().toUpperCase();
  const sourceSeason = Number(source?.seasonEndYear);
  const sourcePhase = String(source?.seasonPhase || "").trim().toLowerCase();
  if (requestTeam !== team || requestSeason !== seasonEndYear || requestPhase !== phase
    || sourceTeam !== team || sourceSeason !== seasonEndYear || sourcePhase !== phase
    || !["swishiq-static-projection", "swishiq-v3-public-projection"].includes(source?.kind)
    || source?.publicProjection !== true) {
    return unavailable();
  }
  for (const pin of [
    "packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId",
    "normalizer", "metricsVersion", "registryVersion", "registryRevisionSha256", "projectionContentSha256",
  ]) {
    if (!packageRef[pin] || source[pin] !== packageRef[pin]) {
      return unavailable();
    }
  }
  const evidence = projection?.evidence;
  const evidenceScope = evidence?.scope;
  const holdoutEvidenceSha256 = evidence?.model?.exactSeasonHoldoutEvidenceSha256;
  const lineupCapabilitySha256 = packageRef.capabilities?.lineupLab?.evidenceSha256;
  if (evidence?.publicProjection !== true
    || evidenceScope?.kind !== "exact-season"
    || evidenceScope?.team !== team
    || Number(evidenceScope?.seasonEndYear) !== seasonEndYear
    || Number(evidenceScope?.selectedSeasonEndYear) !== seasonEndYear
    || evidenceScope?.seasonStartYears?.length !== 1
    || Number(evidenceScope.seasonStartYears[0]) !== seasonEndYear - 1
    || String(evidenceScope?.selectedSeasonPhase || "").trim().toLowerCase() !== phase
    || evidence?.model?.exactSeasonHoldoutStatus !== "validated"
    || evidence?.model?.defensiveSignConvention !== "positive_is_better_and_reduces_predicted_opponent_scoring"
    || !/^[a-f0-9]{64}$/.test(String(holdoutEvidenceSha256 || ""))
    || holdoutEvidenceSha256 !== lineupCapabilitySha256) {
    return unavailable();
  }
  return Object.freeze({ available: true, reason: "SwishIQ Impact is ready for this team-season." });
}

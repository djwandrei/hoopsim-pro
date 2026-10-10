/*
 * Lineup Lab's narrow adapter from a fresh, verified Result Passport to the
 * shared public-result allowlist. It accepts the current exact package source
 * and a freshly reconstructed Scenario Envelope; it never projects a raw
 * optimizer result, player list, or saved scenario URL.
 */

import {
  RESULT_PASSPORT_VERSION,
  decisionProofStatus,
  validateResultPassport,
} from "../modules/result-passport.js?v=20261002c&rev=phase8-proof-gate-v1";
import { projectPublicResultShareV1 } from "../../engine/public-result-share.js?v=20260929e&rev=game-points-v2-public-share-20260929e";
import { projectPublicResultShareV4, publicResultShareV4PackagePinMatchesProof } from "../../engine/public-result-share-v4.js?v=20261001e&rev=daily-v4-rank-share-summary-v2";
import {
  CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  loadCanonicalV4StudioCapabilityData,
} from "../../engine/canonical-v4-studio-runtime-adapter.js?v=20261002e&rev=canonical-v4-studio-runtime-adapter-v4-dependency-cache-closure";

const EXACT_PACKAGE_KIND = "swishiq-v3-public-projection";
const HASH = /^[a-f0-9]{64}$/i;
const METRICS = Object.freeze(["points", "rebounds", "assists", "steals", "blocks", "turnovers"]);
const PHASES = new Set(["regular", "in_season_tournament", "play_in", "playoffs"]);

function fail(message) {
  throw new TypeError(`Lineup Lab result share: ${message}`);
}

function failV4(code, message) {
  const error = new TypeError(`Lineup Lab V4 result share: ${message}`);
  error.code = code;
  throw error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function verifyExactSource(source) {
  if (!isRecord(source) || source.kind !== EXACT_PACKAGE_KIND || source.publicProjection !== true) {
    fail("only a verified public V3 team-season package can be shared.");
  }
  const scope = source.scope;
  const start = Number(scope?.seasonStartYears?.[0]);
  const end = Number(scope?.seasonEndYear);
  const phase = String(source.seasonPhase || "");
  if (scope?.kind !== "exact-season" || !Array.isArray(scope.seasonStartYears)
    || scope.seasonStartYears.length !== 1 || !Number.isInteger(start) || !Number.isInteger(end)
    || Number(scope.seasonStartYear) !== start || end !== start + 1 || Number(source.seasonEndYear) !== end
    || !PHASES.has(phase) || !Array.isArray(scope.phases) || !scope.phases.includes(phase)
    || !source.team || scope.teamCode !== source.team) {
    fail("the loaded source does not prove one exact team-season-phase.");
  }
  for (const key of [
    "packageManifestSha256",
    "sourceLockSha256",
    "projectionContentSha256",
    "registryRevisionSha256",
  ]) {
    if (typeof source[key] !== "string" || !HASH.test(source[key])) {
      fail(`the loaded package is missing its ${key} proof.`);
    }
  }
  for (const key of ["format", "packageId", "packageVersion", "modelId", "metricsVersion", "registryVersion", "normalizer"]) {
    if (typeof source[key] !== "string" || !source[key].trim()) {
      fail(`the loaded package is missing its ${key} pin.`);
    }
  }
  return { scope, start, end, phase };
}

function expectedPackageRef(source) {
  return {
    id: source.packageId,
    version: source.packageVersion,
    format: source.format,
    registryVersion: source.registryVersion,
    registryRevisionSha256: source.registryRevisionSha256,
    manifestSha256: source.packageManifestSha256,
    projectionContentSha256: source.projectionContentSha256,
    sourceLockSha256: source.sourceLockSha256,
    modelId: source.modelId,
  };
}

/**
 * Build an allowlisted share summary from a successful Lineup Lab solve.
 * `scenario` must be reconstructed from the current controls and loaded
 * source. Matching its hash prevents a previous selection or stale solve
 * from being shared after the page has moved to another scenario.
 */
export function buildLineupLabPublicResultSummary({ result, source, scenario } = {}) {
  const scope = verifyExactSource(source);
  if (!isRecord(result) || result.ok !== true || !isRecord(scenario)) {
    fail("a fresh successful solve and its current scenario are required.");
  }
  const passport = result.resultPassport;
  try {
    validateResultPassport(passport, { requireEvidence: true });
  } catch {
    fail("the completed result does not carry a valid Result Passport.");
  }
  if (passport.status !== "complete" || passport.scenarioHash !== scenario.scenarioHash
    || passport.scenarioKind !== scenario.kind || result.mode !== scenario.kind) {
    fail("the Result Passport does not match the current completed scenario.");
  }
  if (passport.evidence?.evidenceLabel !== "lineup-lab"
    || passport.compatibility?.mode !== "result-passport"
    || passport.compatibility?.sourceContractVersion !== 2) {
    fail("the Result Passport was not produced by the supported Lineup Lab adapter.");
  }
  if (scenario.schedule?.team !== source.team
    || Number(scenario.schedule?.seasonEndYear) !== scope.end
    || (scenario.schedule?.phase || scenario.schedule?.seasonPhase) !== scope.phase
    || !scenario.packageRef || !sameJson(scenario.packageRef, expectedPackageRef(source))) {
    fail("the current scenario is not bound to the loaded exact package and selection.");
  }

  const replay = passport.replay;
  if (!isRecord(replay) || replay.replayable !== true
    || replay.resultPassportVersion !== RESULT_PASSPORT_VERSION
    || !sameJson(replay.packageRef, scenario.packageRef)
    || !sameJson(replay.scope, scenario.schedule.scope)
    || replay.phase !== scope.phase
    || !sameJson(replay.rules, scenario.rules)
    || replay.seed !== scenario.execution?.seed
    || replay.modelId !== scenario.execution?.modelId) {
    fail("the Result Passport replay pins do not prove this exact package and phase.");
  }
  const proof = decisionProofStatus(passport.decision);
  if (!proof.countComplete || !proof.rankComplete || !proof.bestLegalChoiceProven) {
    fail("the Result Passport does not prove a complete exact rank and choice count.");
  }

  const native = passport.nativeOutcome;
  if (!isRecord(native) || native.kind !== "lineup-production" || native.scope !== scenario.kind
    || !["combined-player-profile", "assigned-minutes-estimate"].includes(native.unit)
    || !isRecord(native.metrics)) {
    fail("the Result Passport has no approved aggregate statline.");
  }
  const metrics = Object.fromEntries(METRICS
    .filter(key => Object.hasOwn(native.metrics, key))
    .map(key => [key, native.metrics[key]]));
  if (Object.keys(metrics).length === 0 || Object.values(metrics).every(value => value === null)) {
    fail("the Result Passport has no shareable aggregate metrics.");
  }

  return projectPublicResultShareV1({
    tool: "lineup-lab",
    scenarioKind: scenario.kind,
    packagePin: {
      packageId: source.packageId,
      packageVersion: source.packageVersion,
      modelId: source.modelId,
      metricsVersion: source.metricsVersion,
      packageManifestSha256: source.packageManifestSha256,
      sourceLockSha256: source.sourceLockSha256,
      registryVersion: source.registryVersion,
      registryRevisionSha256: source.registryRevisionSha256,
      projectionContentSha256: source.projectionContentSha256,
      normalizer: source.normalizer,
      scope: {
        kind: "exact-season",
        seasonStartYear: scope.start,
        seasonEndYear: scope.end,
        phase: scope.phase,
      },
    },
    result: {
      status: "complete",
      nativeOutcome: { unit: native.unit, metrics },
      decision: {
        rank: passport.decision.rank,
        optionCount: passport.decision.optionCount,
        countComplete: true,
      },
    },
  });
}

/**
 * Build a V4-only summary from the same completed Result Passport, bound to
 * loader-verified exact-season capabilities. This is a separate source path:
 * it never converts a V3 package reference into a V4 pin or falls back to V3.
 */
export function buildLineupLabV4PublicResultSummary({ result, scenario, verifiedCapabilities } = {}) {
  if (!isRecord(result) || result.ok !== true || !isRecord(scenario)
    || !Array.isArray(verifiedCapabilities) || !verifiedCapabilities.length) {
    fail("a fresh successful solve and verified V4 capabilities are required.");
  }
  const passport = result.resultPassport;
  try {
    validateResultPassport(passport, { requireEvidence: true });
  } catch {
    fail("the completed result does not carry a valid Result Passport.");
  }
  if (passport.status !== "complete" || passport.scenarioHash !== scenario.scenarioHash
    || passport.scenarioKind !== scenario.kind || result.mode !== scenario.kind
    || passport.evidence?.evidenceLabel !== "lineup-lab"
    || passport.compatibility?.mode !== "result-passport"
    || passport.compatibility?.sourceContractVersion !== 2) {
    fail("the Result Passport does not match the current completed Lineup Lab scenario.");
  }
  const startYear = Number(scenario.schedule?.seasonStartYear
    ?? scenario.schedule?.season
    ?? scenario.schedule?.scope?.seasonStartYear
    ?? scenario.schedule?.scope?.seasonStartYears?.[0]
    ?? (Number(scenario.schedule?.seasonEndYear) - 1));
  const seasonEndYear = Number(scenario.schedule?.seasonEndYear ?? (startYear + 1));
  const phase = String(scenario.schedule?.phase || scenario.schedule?.seasonPhase || "");
  if (!isRecord(scenario.schedule) || !Number.isSafeInteger(startYear)
    || seasonEndYear !== startYear + 1 || !PHASES.has(phase)) {
    fail("the V4 scenario must declare one exact season and phase.");
  }

  const scope = {
    kind: "exact-season",
    seasonStartYear: startYear,
    seasonEndYear,
    phase,
  };
  if (scope.seasonStartYear < 2017 || scope.seasonStartYear > 2025) {
    fail("the V4 Lineup Lab share is unavailable outside the supported exact-season range.");
  }
  const native = passport.nativeOutcome;
  if (!isRecord(native) || native.kind !== "lineup-production" || native.scope !== scenario.kind
    || !["combined-player-profile", "assigned-minutes-estimate"].includes(native.unit)
    || !isRecord(native.metrics)) {
    fail("the Result Passport has no supported aggregate statline.");
  }
  const metrics = Object.fromEntries(METRICS
    .filter(key => Object.hasOwn(native.metrics, key))
    .map(key => [key, native.metrics[key]]));
  if (Object.keys(metrics).length === 0 || Object.values(metrics).every(value => value === null)) {
    fail("the Result Passport has no shareable aggregate metrics.");
  }
  const decision = passport.decision;
  const proof = decisionProofStatus(decision);
  if (!proof.countComplete || !proof.rankComplete || !proof.bestLegalChoiceProven) {
    fail("the Result Passport does not prove a complete exact rank and choice count.");
  }
  const capabilityIds = scenario.kind === "lineup"
    ? ["boxScore", "exactSeasonImpact", "lineupEvidence"]
    : scenario.kind === "rotation" ? ["boxScore", "lineupEvidence"] : null;
  if (!capabilityIds) fail("the Lineup Lab scenario kind is unsupported by the V4 share contract.");
  const summary = projectPublicResultShareV4({
    tool: "lineup-lab",
    scenarioKind: scenario.kind,
    requiredCapabilityIds: capabilityIds,
    verifiedCapabilities,
    packagePin: { scope },
    result: {
      status: "complete",
      nativeOutcome: { unit: native.unit, metrics },
      decision: { rank: decision.rank, optionCount: decision.optionCount, countComplete: true },
    },
  });
  const packageRef = scenario.packageRef;
  const firstProof = verifiedCapabilities[0];
  const sourceScope = scenario.schedule.scope;
  if (!isRecord(packageRef)
    || (packageRef.packageId ?? packageRef.id) !== firstProof.package?.packageId
    || (packageRef.packageVersion ?? packageRef.version) !== firstProof.package?.packageVersion
    || sourceScope?.kind !== "exact-season"
    || Number(sourceScope.seasonStartYears?.[0] ?? sourceScope.seasonStartYear) !== scope.seasonStartYear
    || !sourceScope.phases?.includes(scope.phase)
    || (packageRef.registryRevisionSha256 !== undefined
      && packageRef.registryRevisionSha256 !== firstProof.source?.registryRevisionSha256)) {
    fail("the V4 scenario package reference does not match its loaded capability proofs.");
  }
  if (!capabilityIds.every((capabilityId) => verifiedCapabilities.some((proof) =>
    publicResultShareV4PackagePinMatchesProof(summary.packagePin, proof, capabilityId)))
    || verifiedCapabilities.length !== capabilityIds.length) {
    fail("the V4 share does not match every required capability proof.");
  }
  return summary;
}

/**
 * Build a V4 share only from a reviewed runtime pin and freshly reloaded exact
 * capability proofs. Descriptive-only V4 projections do not satisfy the
 * share module's model-validation and approval requirements, so they fail
 * closed here. This function never retries the V3 summary builder.
 */
export async function buildVerifiedLineupLabV4PublicResultSummary({
  result,
  source,
  scenario,
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
  fetchImpl,
  signal,
} = {}) {
  if (source?.sourceMode !== "canonical-v4-required") {
    failV4("v4-lineup-source-unavailable", "a selected canonical V4 source is required.");
  }
  if (releasePin?.status !== "reviewed") {
    failV4("v4-lineup-release-pin-unavailable", "the reviewed V4 release pin is not configured.");
  }
  if (!isRecord(scenario) || !isRecord(scenario.schedule)) {
    failV4("v4-lineup-exact-scope-unavailable", "the current scenario does not declare an exact season and phase.");
  }

  const startYear = Number(scenario.schedule.seasonStartYear
    ?? scenario.schedule.scope?.seasonStartYear
    ?? scenario.schedule.scope?.seasonStartYears?.[0]
    ?? (Number(scenario.schedule.seasonEndYear) - 1));
  const seasonEndYear = Number(scenario.schedule.seasonEndYear ?? (startYear + 1));
  const phase = String(scenario.schedule.phase || scenario.schedule.seasonPhase || "");
  if (!Number.isSafeInteger(startYear) || seasonEndYear !== startYear + 1 || !PHASES.has(phase)) {
    failV4("v4-lineup-exact-scope-unavailable", "the current scenario does not declare one supported exact season and phase.");
  }

  const capabilityIds = scenario.kind === "lineup"
    ? ["boxScore", "exactSeasonImpact", "lineupEvidence"]
    : scenario.kind === "rotation" ? ["boxScore", "lineupEvidence"] : null;
  if (!capabilityIds) failV4("v4-lineup-capability-unavailable", "the selected scenario has no V4 share capability contract.");

  const scope = {
    kind: "exact-season",
    seasonStartYears: [startYear],
    seasonEndYear,
    phases: [phase],
  };
  let verifiedCapabilities;
  try {
    verifiedCapabilities = await Promise.all(capabilityIds.map((capabilityId) =>
      loadCanonicalV4StudioCapabilityData({
        releasePin,
        scope,
        capabilityId,
        fetchImpl,
        signal,
      })));
  } catch (error) {
    failV4(String(error?.code || "v4-lineup-capability-unavailable"), error?.message || "an exact V4 share capability could not be verified.");
  }

  try {
    return buildLineupLabV4PublicResultSummary({ result, scenario, verifiedCapabilities });
  } catch (error) {
    if (error?.code) throw error;
    failV4("v4-lineup-model-approval-unavailable", error?.message || "the V4 result has not passed its share approval gates.");
  }
}

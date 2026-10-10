/*
 * Browser-side verifier for accepted static SwishIQ projections.
 * It intentionally has no Supabase, legacy package, or private-ID dependency.
 */

import { CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN } from '../../engine/canonical-v4-studio-runtime-adapter.js?v=20261001d&rev=canonical-v4-studio-runtime-adapter-v2-player-season-supplement';
import { resolveCanonicalV4SiteConsumerSourcePolicy } from '../../engine/canonical-v4-site-consumer-policy.js?v=20261001d&rev=canonical-v4-site-consumer-source-policy-v1';

export const SWISHIQ_PUBLIC_REGISTRY_FORMAT = "djhc-swishiq-public-registry-v1";
export const SWISHIQ_PUBLIC_REGISTRY_VERSION = "swishiq-public-registry-v1";
export const SWISHIQ_PUBLIC_PROJECTION_FORMAT = "djhc-swishiq-public-projection-v1";
export const SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT = "djhc-swishiq-public-projection-part-v1";
// The public registry is content-pinned at each release. Its data parts stay
// in immutable versioned directories; this revision query gives the mutable
// registry its own cache key without exposing private package material.
export const SWISHIQ_PUBLIC_REGISTRY_REVISION = "2a6fbca7fe9734151601271cf5a218624ae74ea4b8d5f10b3620b8015b0dacca";
// Keep the mutable registry URL on the same asset generation as the browser
// modules that consume it. The revision binds content; the release key also
// invalidates a service-worker/runtime cache entry when the registry pointer
// changes without changing its path.
export const SWISHIQ_PUBLIC_ASSET_VERSION = "20260928h";
export const SWISHIQ_PUBLIC_REGISTRY_PATH = "../../data/registry.json?v="
  + SWISHIQ_PUBLIC_ASSET_VERSION + "&rev=" + SWISHIQ_PUBLIC_REGISTRY_REVISION;

const MODEL_ID = "swishiq-v3";
const NORMALIZER = "swishiq-v3-canonical-normalizer";
const METRICS_VERSION = "swishiq-v3-metrics-v1.2";
const LEGACY_METRICS_VERSION = "swishiq-v3-metrics-v1.1";
export const SWISHIQ_PUBLIC_V3_METRICS_VERSIONS = Object.freeze([LEGACY_METRICS_VERSION, METRICS_VERSION]);
const HASH = /^[a-f0-9]{64}$/i;
const PACKAGE_ID = /^nba-swishiq-v3-\d{4}-\d{2}$/;
const PACKAGE_VERSION = /^v3-\d{4}-\d{2}-[a-f0-9]{12}$/;
const ROSTER_REF = /^r_[a-f0-9]{32}$/;
const PLAYER_REF = /^p_[a-f0-9]{32}$/;
const ARTIFACT_ID = /^[a-z][a-z0-9-]{1,63}$/;
const RELATIVE_JSON_PATH = /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.json$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const UUID_IN_TEXT = /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;
const PRIVATE_FIELD = /provider|canonical|crosswalk|mapping|archive|coefficient|rapm|raw|private|secret|token|password|identitysource|positionsource|reviewedby|source(?!locksha256$)|(?:^|[_-])(?:player|team|game)id$|(?:^|[_-])(?:path|url|uri|href)$/i;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;
const PHASES = Object.freeze(["regular", "in_season_tournament", "play_in", "playoffs"]);
const TEAM_CODES = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
  "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
  "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
]);
const POSITION_CODES = new Set(["G", "F", "C"]);
const CAREER_METRIC_KEYS = Object.freeze(["points", "assists", "rebounds", "turnovers", "steals", "blocks"]);
const CAPABILITIES = Object.freeze([
  "swishiqStudio", "lineupLab", "publicAdvancedImpact", "chemistry", "shotProfile", "playType",
  "historicalSeason", "seasonSimulation", "compositeRecipe",
  "compositeSimulation", "careerHistory", "careerSimulation", "crossEraGames",
  "challengePools", "franchise", "commissioner", "probabilities",
  "virtualPacks", "collector",
]);
const LEGACY_V3_CAPABILITIES = Object.freeze(CAPABILITIES.filter((capability) => !["shotProfile", "playType"].includes(capability)));
const ARTIFACT_KINDS = new Set([
  "roster-memberships", "lineup-evidence", "exact-five-evidence", "player-impact", "players", "player-seasons", "career-lookup", "career-history",
  "skill-components", "chemistry", "schedule", "team-styles", "era-baselines",
  "career-transitions", "challenge-pools", "rules", "boards",
]);
// One Studio page can open several public workbenches against the same pinned
// package. Keep verified browser results in one bounded, page-lifetime cache:
// every cache key includes a content-pinned URL or artifact hash, failures are
// evicted, and Node/injected-fetch consumers still execute every request.
const BROWSER_VERIFIED_CACHE = typeof window !== "undefined" && Boolean(window.document);
const BROWSER_PROOF_CACHE_LIMIT = 24;
const BROWSER_PART_CACHE_BYTES = 32 * 1024 * 1024;
const SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS = 30_000;
const browserRegistryCache = new Map();
const browserIndexCache = new Map();
const browserLineupRecordCache = new Map();
const browserPartCache = new Map();

export class SwishIqProjectionError extends Error {
  constructor(message, { code = "unavailable" } = {}) {
    super(message);
    this.name = "SwishIqProjectionError";
    this.code = code;
  }
}

function fail(message, code = "contract-invalid") {
  throw new SwishIqProjectionError(message, { code });
}

/**
 * Keep V3 public reads available only before the reviewed V4 site cutover.
 * A supplied, incomplete, or reviewed V4 pin disables every V3 read so a
 * consumer cannot silently substitute legacy data after a V4 failure.
 */
export function assertSwishIqV3SourceAllowed({
  consumerId = "shared-v3-static-projection-helper",
  releasePin = CANONICAL_V4_STUDIO_RUNTIME_RELEASE_PIN,
} = {}) {
  const policy = resolveCanonicalV4SiteConsumerSourcePolicy({ releasePin, consumerId });
  if (!policy.v3Allowed) {
    fail(`${consumerId} requires the canonical V4 source after a V4 release pin is supplied. The V3 projection was not loaded.`, "v4-required");
  }
  return policy;
}

function object(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, allowed, label) {
  if (!object(value)) fail(label + " must be an object.");
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(label + " has unsupported or missing fields.");
  }
}

function string(value, label, { pattern = null, lower = false, maximum = 240 } = {}) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) fail(label + " is invalid.");
  const normalized = lower ? value.trim().toLowerCase() : value.trim();
  if (pattern && !pattern.test(normalized)) fail(label + " is invalid.");
  return normalized;
}

function integer(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(label + " is invalid.");
  return value;
}

function finite(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(label + " is invalid.");
  return value;
}

function hash(value, label) {
  return string(value, label, { pattern: HASH, lower: true, maximum: 64 });
}

function assertPublicSafe(value, label = "public projection") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail(label + " contains a sparse array.", "privacy-boundary");
      assertPublicSafe(value[index], label + "[" + index + "]");
    }
    return;
  }
  if (object(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (PRIVATE_FIELD.test(key) || UUID_IN_TEXT.test(key)) fail(label + " contains a private field.", "privacy-boundary");
      assertPublicSafe(child, label + "." + key);
    }
    return;
  }
  if (typeof value === "string") {
    if (UUID_IN_TEXT.test(value) || PRIVATE_TEXT.test(value)) fail(label + " contains a private value.", "privacy-boundary");
    return;
  }
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
  fail(label + " is not JSON-safe.", "privacy-boundary");
}

export function stableJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Canonical JSON cannot contain a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const entries = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) fail("Canonical JSON cannot contain a sparse array.");
      entries.push(stableJson(value[index]));
    }
    return "[" + entries.join(",") + "]";
  }
  if (!object(value)) fail("Canonical JSON contains an unsupported value.");
  return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
}

export async function sha256Text(value) {
  if (!globalThis.crypto?.subtle || typeof TextEncoder !== "function") {
    fail("This browser cannot verify the SwishIQ projection hash.", "crypto-unavailable");
  }
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256RawBytes(bytes) {
  if (!globalThis.crypto?.subtle) {
    fail("This browser cannot verify the SwishIQ projection hash.", "crypto-unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function omit(value, key) {
  if (!object(value)) fail("Hash input must be an object.");
  const copy = { ...value };
  delete copy[key];
  return copy;
}

export async function registryRevisionSha256(value) {
  return sha256Text(stableJson(omit(value, "registryRevisionSha256")));
}

export async function projectionContentSha256(value) {
  return sha256Text(stableJson(omit(value, "contentSha256")));
}

function instant(value, label) {
  const normalized = string(value, label, { pattern: ISO_INSTANT, maximum: 40 });
  if (!Number.isFinite(Date.parse(normalized))) fail(label + " is invalid.");
  return normalized;
}

function normalizeScope(value, label) {
  exactKeys(value, ["kind", "seasonStartYears", "seasonStartYear", "seasonEndYear", "phases", "pooledFitIsSeasonSpecific"], label);
  if (!Array.isArray(value.seasonStartYears) || !value.seasonStartYears.length || value.seasonStartYears.length > 100) {
    fail(label + " has invalid season years.");
  }
  const years = value.seasonStartYears.map((year) => integer(year, label + " season year", { minimum: 1947, maximum: 2200 }));
  const orderedYears = [...years].sort((left, right) => left - right);
  if (new Set(years).size !== years.length || stableJson(years) !== stableJson(orderedYears)
    || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) {
    fail(label + " has invalid season years.");
  }
  if (!Array.isArray(value.phases) || !value.phases.length || new Set(value.phases).size !== value.phases.length) {
    fail(label + " has invalid phases.");
  }
  const phases = value.phases.map((phase) => string(phase, label + " phase", { lower: true, maximum: 40 }));
  if (phases.some((phase) => !PHASES.includes(phase))
    || stableJson(phases) !== stableJson(PHASES.filter((phase) => phases.includes(phase)))) {
    fail(label + " has invalid phases.");
  }
  const normalized = {
    kind: years.length === 1 ? "exact-season" : "pooled-window",
    seasonStartYears: years,
    seasonStartYear: years[0],
    seasonEndYear: years.at(-1) + 1,
    phases,
    pooledFitIsSeasonSpecific: years.length === 1,
  };
  if (stableJson(value) !== stableJson(normalized)) fail(label + " is not canonical.");
  return normalized;
}

async function normalizePins(value, label) {
  const scope = normalizeScope(value.scope, label + " scope");
  const packageId = string(value.packageId, label + " package ID", { pattern: PACKAGE_ID, lower: true, maximum: 80 });
  const sourceLockSha256 = hash(value.sourceLockSha256, label + " source lock");
  const packageVersion = string(value.packageVersion, label + " package version", { pattern: PACKAGE_VERSION, lower: true, maximum: 40 });
  const metricsVersion = string(value.metricsVersion, label + " metrics version", { lower: true, maximum: 100 });
  if (value.modelId !== MODEL_ID || value.normalizer !== NORMALIZER || !SWISHIQ_PUBLIC_V3_METRICS_VERSIONS.includes(metricsVersion)) {
    fail(label + " model pins are unsupported.");
  }
  const scopeLabel = scope.seasonStartYear + "-" + String(scope.seasonEndYear).slice(-2);
  const versionDigest = metricsVersion === LEGACY_METRICS_VERSION
    ? sourceLockSha256
    : await sha256Text([MODEL_ID, sourceLockSha256, NORMALIZER, metricsVersion].join("|"));
  if (packageId !== "nba-swishiq-v3-" + scopeLabel || packageVersion !== "v3-" + scopeLabel + "-" + versionDigest.slice(0, 12)) {
    fail(label + " package pins do not match its source lock and scope.");
  }
  return {
    packageId,
    packageVersion,
    packageManifestSha256: hash(value.packageManifestSha256, label + " manifest"),
    sourceLockSha256,
    modelId: MODEL_ID,
    normalizer: NORMALIZER,
    metricsVersion,
    scope,
  };
}

function relativeJsonPath(value, label) {
  const normalized = string(value, label, { pattern: RELATIVE_JSON_PATH, lower: true, maximum: 360 });
  if (normalized !== value.trim() || normalized.includes("..") || normalized.includes("\\") || normalized.includes("%") || normalized.startsWith("/")) {
    fail(label + " is invalid.");
  }
  return normalized;
}

function expectedIndexPath(pins) {
  return "packages/" + pins.packageId + "/" + pins.packageVersion + "/index.json";
}

function normalizeArtifacts(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10000) fail("Projection artifacts are invalid.");
  const artifacts = value.map((item, index) => {
    const label = "Projection artifact " + (index + 1);
    exactKeys(item, ["artifactId", "kind", "path", "bytes", "sha256", "rows"], label);
    const artifact = {
      artifactId: string(item.artifactId, label + " ID", { pattern: ARTIFACT_ID, lower: true, maximum: 64 }),
      kind: string(item.kind, label + " kind", { lower: true, maximum: 64 }),
      path: relativeJsonPath(item.path, label + " path"),
      bytes: integer(item.bytes, label + " bytes", { minimum: 1, maximum: 256 * 1024 * 1024 }),
      sha256: hash(item.sha256, label + " hash"),
      rows: integer(item.rows, label + " rows", { minimum: 0, maximum: 200000000 }),
    };
    if (!ARTIFACT_KINDS.has(artifact.kind)) fail(label + " has an unsupported kind.");
    return artifact;
  });
  const ordered = [...artifacts].sort((left, right) => left.path.localeCompare(right.path) || left.artifactId.localeCompare(right.artifactId));
  if (new Set(artifacts.map((item) => item.artifactId)).size !== artifacts.length
    || new Set(artifacts.map((item) => item.path)).size !== artifacts.length
    || stableJson(value) !== stableJson(ordered)) {
    fail("Projection artifacts are not canonical.");
  }
  return ordered;
}

function normalizeCapabilities(value, artifactIds = null, metricsVersion = METRICS_VERSION) {
  const capabilities = metricsVersion === LEGACY_METRICS_VERSION ? LEGACY_V3_CAPABILITIES : CAPABILITIES;
  exactKeys(value, capabilities, "Projection capabilities");
  const normalized = {};
  for (const capability of capabilities) {
    const descriptor = value[capability];
    if (!object(descriptor)) fail("Capability " + capability + " is invalid.");
    const status = string(descriptor.status, "Capability " + capability + " status", { pattern: /^(available|unavailable)$/, lower: true, maximum: 20 });
    if (status === "unavailable") {
      exactKeys(descriptor, ["status"], "Capability " + capability);
      normalized[capability] = { status };
      continue;
    }
    exactKeys(descriptor, ["status", "evidenceSha256", "artifactIds"], "Capability " + capability);
    if (!Array.isArray(descriptor.artifactIds) || !descriptor.artifactIds.length) fail("Capability " + capability + " needs artifact evidence.");
    const ids = descriptor.artifactIds.map((id) => string(id, "Capability " + capability + " artifact ID", { pattern: ARTIFACT_ID, lower: true, maximum: 64 }));
    const ordered = [...ids].sort();
    if (new Set(ids).size !== ids.length || stableJson(ids) !== stableJson(ordered)
      || (artifactIds && ids.some((id) => !artifactIds.has(id)))) {
      fail("Capability " + capability + " has invalid artifact evidence.");
    }
    normalized[capability] = {
      status,
      evidenceSha256: hash(descriptor.evidenceSha256, "Capability " + capability + " evidence hash"),
      artifactIds: ordered,
    };
  }
  if (normalized.publicAdvancedImpact.status === "available" && normalized.lineupLab.status !== "available") {
    fail("Public SwishIQ Impact requires Lineup Lab evidence.");
  }
  return normalized;
}

async function validateRegistry(value) {
  exactKeys(value, ["format", "registryVersion", "generatedAt", "packages", "registryRevisionSha256"], "SwishIQ registry");
  if (value.format !== SWISHIQ_PUBLIC_REGISTRY_FORMAT || value.registryVersion !== SWISHIQ_PUBLIC_REGISTRY_VERSION) {
    fail("The SwishIQ registry format is unsupported.");
  }
  instant(value.generatedAt, "SwishIQ registry generatedAt");
  if (!Array.isArray(value.packages) || value.packages.length > 200) fail("The SwishIQ registry package list is invalid.");
  const packages = await Promise.all(value.packages.map(async (entry, index) => {
    const label = "SwishIQ registry package " + (index + 1);
    exactKeys(entry, [
      "packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion", "scope",
      "status", "capabilities", "projectionIndexPath", "projectionContentSha256",
    ], label);
    const pins = await normalizePins(entry, label);
    if (entry.status !== "published") fail("A public SwishIQ registry can contain only published packages.");
    const capabilities = normalizeCapabilities(entry.capabilities, null, pins.metricsVersion);
    const projectionIndexPath = relativeJsonPath(entry.projectionIndexPath, "SwishIQ projection index path");
    if (projectionIndexPath !== expectedIndexPath(pins)) fail("SwishIQ projection index path is not package-bound.");
    return { ...pins, status: "published", capabilities, projectionIndexPath, projectionContentSha256: hash(entry.projectionContentSha256, "SwishIQ projection hash") };
  }));
  const ordered = [...packages].sort((left, right) => left.packageId.localeCompare(right.packageId));
  if (new Set(packages.map((entry) => entry.packageId)).size !== packages.length || stableJson(value.packages) !== stableJson(ordered)) {
    fail("The SwishIQ registry packages are not canonical.");
  }
  return { ...value, packages: ordered };
}

async function verifyRegistry(value) {
  const registry = await validateRegistry(value);
  if ((await registryRevisionSha256(registry)) !== hash(registry.registryRevisionSha256, "SwishIQ registry revision")) {
    fail("The SwishIQ registry hash did not verify.", "integrity-failed");
  }
  return registry;
}

function exactScopeMatches(scope, request) {
  return scope.kind === "exact-season"
    && scope.seasonStartYears.length === 1
    && scope.seasonStartYear === request.seasonEndYear - 1
    && scope.seasonEndYear === request.seasonEndYear
    && scope.phases.includes(request.phase)
    && scope.pooledFitIsSeasonSpecific === true;
}

function normalizeRequiredCapabilities(value) {
  const capabilities = value === undefined ? [] : value;
  if (!Array.isArray(capabilities) || capabilities.length > CAPABILITIES.length) {
    fail("Required SwishIQ capabilities are invalid.");
  }
  const normalized = capabilities.map((capability) => string(capability, "Required SwishIQ capability", { maximum: 64 }));
  if (new Set(normalized).size !== normalized.length || normalized.some((capability) => !CAPABILITIES.includes(capability))) {
    fail("Required SwishIQ capabilities are invalid.");
  }
  return normalized.sort();
}

function verifyExpectedPackageRef(value, packageEntry, registry, index = null) {
  if (value === undefined || value === null) return;
  if (!object(value)) fail("Expected SwishIQ package reference is invalid.");
  const allowed = new Set([
    "format", "packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256",
    "registryVersion", "registryRevisionSha256", "projectionContentSha256", "projectionIndexPath",
    "modelId", "normalizer", "metricsVersion", "scope",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("Expected SwishIQ package reference has an unsupported field.");
  }
  for (const key of ["packageId", "packageVersion", "packageManifestSha256", "registryVersion", "modelId"]) {
    if (value[key] === undefined) fail("Expected SwishIQ package reference is incomplete.");
  }
  const expected = {
    format: "djhc-swishiq-package-v3",
    packageId: packageEntry.packageId,
    packageVersion: packageEntry.packageVersion,
    packageManifestSha256: packageEntry.packageManifestSha256,
    sourceLockSha256: packageEntry.sourceLockSha256,
    registryVersion: registry.registryVersion,
    registryRevisionSha256: registry.registryRevisionSha256,
    projectionContentSha256: packageEntry.projectionContentSha256,
    projectionIndexPath: packageEntry.projectionIndexPath,
    modelId: packageEntry.modelId,
    normalizer: packageEntry.normalizer,
    metricsVersion: packageEntry.metricsVersion,
  };
  for (const key of Object.keys(expected)) {
    if (value[key] !== undefined && value[key] !== expected[key]) {
      fail("Expected SwishIQ package reference does not match the published package.", "integrity-failed");
    }
  }
  if (value.scope !== undefined) {
    if (value.scope !== "exact-season" && stableJson(normalizeScope(value.scope, "Expected SwishIQ package scope")) !== stableJson(packageEntry.scope)) {
      fail("Expected SwishIQ package scope does not match the published package.", "integrity-failed");
    }
  }
  if (index && value.projectionContentSha256 !== undefined && value.projectionContentSha256 !== index.contentSha256) {
    fail("Expected SwishIQ package projection does not match the verified index.", "integrity-failed");
  }
}

function selectExactPackage(registry, request, requiredCapabilities = []) {
  const candidates = registry.packages.filter((entry) => (
    exactScopeMatches(entry.scope, request)
    && requiredCapabilities.every((capability) => entry.capabilities[capability]?.status === "available")
  ));
  if (candidates.length !== 1) {
    fail("This exact SwishIQ package is preparing for this selection. No other season or pooled package was used.", "exact-package-unavailable");
  }
  return candidates[0];
}

async function validateIndex(value, packageEntry) {
  exactKeys(value, [
    "format", "projectionVersion", "generatedAt", "packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion",
    "scope", "capabilities", "artifacts", "contentSha256",
  ], "SwishIQ projection index");
  if (value.format !== SWISHIQ_PUBLIC_PROJECTION_FORMAT || value.projectionVersion !== 1) fail("The SwishIQ projection index format is unsupported.");
  instant(value.generatedAt, "SwishIQ projection index generatedAt");
  const pins = await normalizePins(value, "SwishIQ projection index");
  const artifacts = normalizeArtifacts(value.artifacts);
  const capabilities = normalizeCapabilities(value.capabilities, new Set(artifacts.map((artifact) => artifact.artifactId)), pins.metricsVersion);
  for (const key of ["packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion"]) {
    if (pins[key] !== packageEntry[key]) fail("The SwishIQ projection does not match the selected package.", "integrity-failed");
  }
  if (stableJson(pins.scope) !== stableJson(packageEntry.scope) || stableJson(capabilities) !== stableJson(packageEntry.capabilities)) {
    fail("The SwishIQ projection metadata does not match the selected package.", "integrity-failed");
  }
  const contentSha256 = hash(value.contentSha256, "SwishIQ projection content hash");
  if ((await projectionContentSha256(value)) !== contentSha256 || contentSha256 !== packageEntry.projectionContentSha256) {
    fail("The SwishIQ projection index hash did not verify.", "integrity-failed");
  }
  return { ...pins, capabilities, artifacts, contentSha256 };
}

function artifactUrl(path, indexUrl) {
  const relative = relativeJsonPath(path, "SwishIQ projection artifact path");
  const resolved = new URL(relative, indexUrl);
  const base = new URL(".", indexUrl);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    fail("SwishIQ projection artifact path escapes its package.");
  }
  return resolved;
}

function findLineupArtifact(index) {
  const matches = index.artifacts.filter((artifact) => artifact.kind === "lineup-evidence");
  if (matches.length !== 1) fail("The selected SwishIQ package has no complete Lineup Lab projection.", "capability-unavailable");
  const artifact = matches[0];
  for (const capability of ["lineupLab", "publicAdvancedImpact"]) {
    if (!index.capabilities[capability].artifactIds.includes(artifact.artifactId)) {
      fail("The selected SwishIQ package does not bind its advanced lineup evidence.", "capability-unavailable");
    }
  }
  return artifact;
}

function normalizePositions(value) {
  if (!Array.isArray(value) || !value.length || value.length > 3) fail("Lineup evidence positions are invalid.");
  const positions = value.map((position) => string(position, "Lineup evidence position", { maximum: 8 }));
  const ordered = [...positions].sort();
  if (new Set(positions).size !== positions.length || positions.some((position) => !POSITION_CODES.has(position)) || stableJson(positions) !== stableJson(ordered)) {
    fail("Lineup evidence positions are invalid.");
  }
  return positions;
}

async function expectedRosterRef(playerRef, teamCode, seasonStartYear, phase) {
  const binding = "djhc-roster-v1:" + playerRef + ":" + teamCode + ":" + seasonStartYear + ":" + phase;
  return "r_" + (await sha256Text(binding)).slice(0, 32);
}

async function validateRecord(row, scope) {
  exactKeys(row, [
    "rosterRef", "playerRef", "displayName", "teamCode", "seasonStartYear", "phase", "positions", "displayEligible",
    "age", "starts", "observed", "coverage", "box", "impact",
  ], "Lineup evidence record");
  assertPublicSafe(row, "Lineup evidence record");
  const rosterRef = string(row.rosterRef, "Roster reference", { pattern: ROSTER_REF, lower: true, maximum: 34 });
  const playerRef = string(row.playerRef, "Player reference", { pattern: PLAYER_REF, lower: true, maximum: 34 });
  const displayName = string(row.displayName, "Player display name", { maximum: 120 });
  const teamCode = string(row.teamCode, "Player team", { pattern: /^[A-Z]{3}$/, maximum: 3 });
  const seasonStartYear = integer(row.seasonStartYear, "Player season", { minimum: 1947, maximum: 2200 });
  const phase = string(row.phase, "Player phase", { lower: true, maximum: 40 });
  if (!TEAM_CODES.has(teamCode) || !scope.seasonStartYears.includes(seasonStartYear) || !scope.phases.includes(phase)) {
    fail("Lineup evidence is outside the package scope.", "integrity-failed");
  }
  if (rosterRef !== await expectedRosterRef(playerRef, teamCode, seasonStartYear, phase)) {
    fail("Lineup evidence roster identity did not verify.", "integrity-failed");
  }
  if (row.displayEligible !== true || row.observed !== true) fail("Lineup evidence includes an unavailable player.", "capability-unavailable");
  const positions = normalizePositions(row.positions);
  const age = row.age === null ? null : integer(row.age, "Player age", { minimum: 0, maximum: 100 });
  exactKeys(row.coverage, ["games", "minutes", "possessions"], "Lineup evidence coverage");
  const coverage = {
    games: integer(row.coverage.games, "Player games", { minimum: 1, maximum: 200 }),
    minutes: finite(row.coverage.minutes, "Player minutes", { minimum: 0.0001, maximum: 20000 }),
    possessions: integer(row.coverage.possessions, "Player possessions", { minimum: 1, maximum: 200000 }),
  };
  const starts = row.starts === null ? null : integer(row.starts, "Player starts", { minimum: 0, maximum: coverage.games });
  const boxKeys = ["points", "totalRebounds", "assists", "steals", "blocks", "turnovers", "fieldGoalsMade", "fieldGoalsAttempted", "threePointersMade", "threePointersAttempted", "freeThrowsMade", "freeThrowsAttempted"];
  exactKeys(row.box, boxKeys, "Lineup evidence box");
  const box = Object.fromEntries(boxKeys.map((key) => [key, integer(row.box[key], "Player box " + key, { minimum: 0, maximum: 100000 })]));
  if (box.fieldGoalsMade > box.fieldGoalsAttempted || box.threePointersMade > box.threePointersAttempted || box.freeThrowsMade > box.freeThrowsAttempted) {
    fail("Lineup evidence has inconsistent shooting totals.");
  }
  exactKeys(row.impact, ["offensePer100", "defensePer100", "reliability", "alreadyRegularized"], "Lineup evidence impact");
  if (row.impact.alreadyRegularized !== true) fail("Lineup evidence is not regularized.");
  const impact = {
    offensePer100: finite(row.impact.offensePer100, "Player offensive impact", { minimum: -100, maximum: 100 }),
    defensePer100: finite(row.impact.defensePer100, "Player defensive impact", { minimum: -100, maximum: 100 }),
    reliability: finite(row.impact.reliability, "Player impact reliability", { minimum: 0, maximum: 1 }),
    alreadyRegularized: true,
  };
  return { rosterRef, playerRef, displayName, teamCode, seasonStartYear, phase, positions, age, starts, coverage, box, impact };
}

function validateCareerLookupRecord(row, scope) {
  exactKeys(row, ["playerRef", "displayName", "seasonStartYear", "teamCode"], "Career lookup record");
  const playerRef = string(row.playerRef, "Career lookup player reference", { pattern: PLAYER_REF, lower: true, maximum: 34 });
  const displayName = string(row.displayName, "Career lookup display name", { maximum: 120 });
  const seasonStartYear = integer(row.seasonStartYear, "Career lookup season", { minimum: 1947, maximum: 2200 });
  const teamCode = string(row.teamCode, "Career lookup team", { pattern: /^[A-Z]{3}$/, maximum: 3 });
  if (!TEAM_CODES.has(teamCode) || !scope.seasonStartYears.includes(seasonStartYear)) {
    fail("Career lookup record is outside the accepted package scope.", "integrity-failed");
  }
  return { playerRef, displayName, seasonStartYear, teamCode };
}

function validateCareerHistoryRecord(row, scope) {
  exactKeys(row, [
    "playerRef", "displayName", "teamCode", "seasonStartYear", "phase", "observed",
    "games", "minutes", "positions", "age", "experience", "careerMetrics",
  ], "Career history record");
  const identity = validateCareerLookupRecord({
    playerRef: row.playerRef,
    displayName: row.displayName,
    seasonStartYear: row.seasonStartYear,
    teamCode: row.teamCode,
  }, scope);
  if (row.phase !== "regular" || row.observed !== true || !scope.phases.includes(row.phase)) {
    fail("Career history must contain observed regular-season rows.", "integrity-failed");
  }
  const games = integer(row.games, "Career history games", { minimum: 0, maximum: 300 });
  const minutes = finite(row.minutes, "Career history minutes", { minimum: 0, maximum: 100000 });
  if (!Array.isArray(row.positions) || row.positions.length > 3
    || row.positions.some(position => !POSITION_CODES.has(position))
    || new Set(row.positions).size !== row.positions.length
    || stableJson(row.positions) !== stableJson([...row.positions].sort())) {
    fail("Career history positions are invalid.", "integrity-failed");
  }
  const age = row.age === null ? null : finite(row.age, "Career history age", { minimum: 0, maximum: 100 });
  const experience = row.experience === null ? null : integer(row.experience, "Career history experience", { minimum: 0, maximum: 60 });
  exactKeys(row.careerMetrics, CAREER_METRIC_KEYS, "Career history metrics");
  const careerMetrics = Object.fromEntries(CAREER_METRIC_KEYS.map(key => [
    key,
    row.careerMetrics[key] === null
      ? null : finite(row.careerMetrics[key], "Career history " + key, { minimum: 0, maximum: 1000 }),
  ]));
  return { ...identity, phase: row.phase, observed: true, games, minutes,
    positions: [...row.positions], age, experience, careerMetrics };
}

async function validateLineupPart(value, index, artifact) {
  exactKeys(value, [
    "format", "packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion",
    "scope", "artifactId", "kind", "records",
  ], "SwishIQ lineup projection");
  assertPublicSafe(value, "SwishIQ lineup projection");
  if (value.format !== SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT || value.artifactId !== artifact.artifactId || value.kind !== "lineup-evidence") {
    fail("The SwishIQ lineup projection format is unsupported.");
  }
  const pins = await normalizePins(value, "SwishIQ lineup projection");
  for (const key of ["packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion", "scope"]) {
    if (stableJson(pins[key]) !== stableJson(index[key])) fail("The SwishIQ lineup projection does not match its package.", "integrity-failed");
  }
  if (!Array.isArray(value.records) || value.records.length !== artifact.rows) fail("The SwishIQ lineup projection row count did not verify.", "integrity-failed");
  const records = [];
  const rosterRefs = new Set();
  for (const row of value.records) {
    const record = await validateRecord(row, pins.scope);
    if (rosterRefs.has(record.rosterRef)) fail("The SwishIQ lineup projection repeats a roster reference.");
    rosterRefs.add(record.rosterRef);
    records.push(record);
  }
  return records;
}

function percent(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function datasetFromRecords(records, packageEntry, request) {
  const players = records.map((record) => {
    const box = record.box;
    const coverage = record.coverage;
    return {
      id: record.rosterRef,
      playerRef: record.playerRef,
      rosterRef: record.rosterRef,
      name: record.displayName,
      team: record.teamCode,
      positions: record.positions,
      age: record.age,
      games: coverage.games,
      starts: record.starts,
      minutes: coverage.minutes / coverage.games,
      fgPct: percent(box.fieldGoalsMade, box.fieldGoalsAttempted),
      threePct: percent(box.threePointersMade, box.threePointersAttempted),
      efgPct: percent(box.fieldGoalsMade + (0.5 * box.threePointersMade), box.fieldGoalsAttempted),
      ftPct: percent(box.freeThrowsMade, box.freeThrowsAttempted),
      rebounds: box.totalRebounds / coverage.games,
      assists: box.assists / coverage.games,
      steals: box.steals / coverage.games,
      blocks: box.blocks / coverage.games,
      turnovers: box.turnovers / coverage.games,
      points: box.points / coverage.games,
    };
  });
  return {
    schemaVersion: 1,
    source: {
      kind: "swishiq-static-projection",
      label: "SwishIQ Impact · " + request.team + " " + (request.seasonEndYear - 1) + "–" + String(request.seasonEndYear).slice(-2),
      team: request.team,
      seasonEndYear: request.seasonEndYear,
      season: String(request.seasonEndYear - 1) + "–" + String(request.seasonEndYear).slice(-2),
      seasonPhase: request.phase,
      packageId: packageEntry.packageId,
      packageVersion: packageEntry.packageVersion,
      packageManifestSha256: packageEntry.packageManifestSha256,
      sourceLockSha256: packageEntry.sourceLockSha256,
      registryVersion: packageEntry.registryVersion || SWISHIQ_PUBLIC_REGISTRY_VERSION,
      registryRevisionSha256: packageEntry.registryRevisionSha256 || null,
      format: "djhc-swishiq-package-v3",
      modelId: packageEntry.modelId,
      normalizer: packageEntry.normalizer,
      metricsVersion: packageEntry.metricsVersion,
      projectionContentSha256: packageEntry.projectionContentSha256,
      publicProjection: true,
    },
    players,
  };
}

function evidenceFromRecords(records, packageEntry, request) {
  return {
    contractVersion: 3,
    publicProjection: true,
    package: {
      packageId: packageEntry.packageId,
      packageVersion: packageEntry.packageVersion,
      packageManifestSha256: packageEntry.packageManifestSha256,
      sourceLockSha256: packageEntry.sourceLockSha256,
      modelId: packageEntry.modelId,
      normalizer: packageEntry.normalizer,
      metricsVersion: packageEntry.metricsVersion,
      registryVersion: packageEntry.registryVersion || SWISHIQ_PUBLIC_REGISTRY_VERSION,
      registryRevisionSha256: packageEntry.registryRevisionSha256 || null,
      projectionContentSha256: packageEntry.projectionContentSha256,
      lineupLabEvidenceSha256: packageEntry.capabilities?.lineupLab?.evidenceSha256 || null,
      visibility: "public",
    },
    scope: {
      kind: "exact-season",
      seasonStartYears: [request.seasonEndYear - 1],
      seasonEndYear: request.seasonEndYear,
      selectedSeasonEndYear: request.seasonEndYear,
      selectedSeasonPhase: request.phase,
      team: request.team,
      packageId: packageEntry.packageId,
      packageVersion: packageEntry.packageVersion,
      registryVersion: packageEntry.registryVersion || SWISHIQ_PUBLIC_REGISTRY_VERSION,
    },
    model: {
      modelVersion: "weighted_ridge_offense_defense_rapm_v2",
      modelId: packageEntry.modelId,
      fitScope: "exact-season-across-all-package-phases",
      exactSeasonHoldoutStatus: "validated",
      exactSeasonHoldoutEvidenceSha256: packageEntry.capabilities?.lineupLab?.evidenceSha256 || null,
      defensiveSignConvention: "positive_is_better_and_reduces_predicted_opponent_scoring",
      seasonEndYear: request.seasonEndYear,
      seasonPhase: "exact-season-all-phases-public-projection-v3",
      calibration: { status: "validated", source: "hash-bound-native-exact-lineup-holdout" },
    },
    players: Object.fromEntries(records.map((record) => [record.rosterRef, {
      offense: record.impact.offensePer100,
      defense: record.impact.defensePer100,
      reliability: record.impact.reliability,
      displayEligible: true,
      alreadyRegularized: true,
      coverage: { ...record.coverage },
    }])),
    unresolvedPlayerIds: [],
    coverage: { eligiblePlayerCount: records.length, sampleStatus: "complete" },
    provenance: { kind: "public-derived", calibrationStatus: "validated" },
  };
}

async function withPublicRequestTimeout(load, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  const boundedMs = integer(Number(timeoutMs), "SwishIQ request timeout", { minimum: 1, maximum: 120_000 });
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId = null;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort();
      reject(new SwishIqProjectionError("SwishIQ data request timed out. Retry the exact selection.", { code: "network-timeout" }));
    }, boundedMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => load(controller?.signal)), deadline]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

async function fetchText(url, fetchImpl, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  // Package part URLs are immutable by path, but a browser or service worker
  // can retain a stalled response for an unversioned URL. Keep the request
  // on the current public asset generation so a retry reaches the network
  // without changing the hash-pinned response body.
  const requestUrl = new URL(url.toString());
  if (requestUrl.pathname.split("/").includes("parts") && !requestUrl.searchParams.has("v")) {
    requestUrl.searchParams.set("v", SWISHIQ_PUBLIC_ASSET_VERSION);
  }
  return withPublicRequestTimeout(async (signal) => {
    let response;
    try {
      response = await fetchImpl(requestUrl.toString(), { cache: "no-store", ...(signal ? { signal } : {}) });
    } catch {
      fail("SwishIQ data could not be reached. Try again shortly.", "network-unavailable");
    }
    if (!response?.ok) fail("SwishIQ data is not published for this selection yet.", "not-published");
    try {
      return await response.text();
    } catch {
      fail("SwishIQ data could not be read safely.");
    }
  }, timeoutMs);
}

async function fetchBytes(url, fetchImpl, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  // Match fetchText's cache-busting behavior for immutable, hash-pinned parts.
  const requestUrl = new URL(url.toString());
  if (requestUrl.pathname.split("/").includes("parts") && !requestUrl.searchParams.has("v")) {
    requestUrl.searchParams.set("v", SWISHIQ_PUBLIC_ASSET_VERSION);
  }
  return withPublicRequestTimeout(async (signal) => {
    let response;
    try {
      response = await fetchImpl(requestUrl.toString(), { cache: "no-store", ...(signal ? { signal } : {}) });
    } catch {
      fail("SwishIQ data could not be reached. Try again shortly.", "network-unavailable");
    }
    if (!response?.ok) fail("SwishIQ data is not published for this selection yet.", "not-published");
    try {
      if (typeof response.arrayBuffer === "function") {
        return new Uint8Array(await response.arrayBuffer());
      }
      // Keep lightweight legacy fetch doubles usable in tests and older adapters.
      return new TextEncoder().encode(await response.text());
    } catch {
      fail("SwishIQ data could not be read safely.");
    }
  }, timeoutMs);
}

async function fetchJson(url, fetchImpl, label, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  const source = await fetchText(url, fetchImpl, timeoutMs);
  try {
    return { value: JSON.parse(source), source };
  } catch {
    fail(label + " is not valid JSON.");
  }
}

function memoizeBrowserLoad(cache, key, load, limit = BROWSER_PROOF_CACHE_LIMIT) {
  if (!BROWSER_VERIFIED_CACHE) return load();
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const promise = Promise.resolve().then(load);
  cache.set(key, promise);
  promise.then(
    () => {
      while (cache.size > limit) cache.delete(cache.keys().next().value);
    },
    () => {
      if (cache.get(key) === promise) cache.delete(key);
    },
  );
  return promise;
}

async function loadVerifiedLineupRecords(proof, fetchImpl, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  const artifact = findLineupArtifact(proof.index);
  const cacheKey = [proof.indexUrl, artifact.artifactId, artifact.sha256].join("|");
  return memoizeBrowserLoad(browserLineupRecordCache, cacheKey, async () => {
    const partUrl = artifactUrl(artifact.path, new URL(proof.indexUrl));
    const partSource = await fetchText(partUrl, fetchImpl, timeoutMs);
    if (new TextEncoder().encode(partSource).byteLength !== artifact.bytes || (await sha256Text(partSource)) !== artifact.sha256) {
      fail("The SwishIQ lineup projection byte hash did not verify.", "integrity-failed");
    }
    let part;
    try { part = JSON.parse(partSource); }
    catch { fail("The SwishIQ lineup projection is not valid JSON."); }
    return Object.freeze(await validateLineupPart(part, proof.index, artifact));
  });
}

function memoizeBrowserPart(key, bytes, load) {
  if (!BROWSER_VERIFIED_CACHE) return load();
  const existing = browserPartCache.get(key);
  if (existing) {
    browserPartCache.delete(key);
    browserPartCache.set(key, existing);
    return existing.promise;
  }
  const entry = { bytes, promise: null };
  const promise = Promise.resolve().then(load);
  entry.promise = promise;
  browserPartCache.set(key, entry);
  promise.then(
    () => {
      let cachedBytes = [...browserPartCache.values()].reduce((total, item) => total + item.bytes, 0);
      while (cachedBytes > BROWSER_PART_CACHE_BYTES && browserPartCache.size > 1) {
        const [oldestKey, oldest] = browserPartCache.entries().next().value;
        if (oldestKey === key) break;
        browserPartCache.delete(oldestKey);
        cachedBytes -= oldest.bytes;
      }
    },
    () => {
      if (browserPartCache.get(key) === entry) browserPartCache.delete(key);
    },
  );
  return promise;
}

function loadVerifiedRegistry(registryUrlObject, fetchImpl, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  const url = registryUrlObject.toString();
  return memoizeBrowserLoad(browserRegistryCache, url, async () => {
    const registryJson = await fetchJson(registryUrlObject, fetchImpl, "SwishIQ registry", timeoutMs);
    return verifyRegistry(registryJson.value);
  });
}

function loadVerifiedIndex(indexUrl, packageEntry, fetchImpl, timeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS) {
  const key = [
    indexUrl.toString(),
    packageEntry.packageId,
    packageEntry.packageVersion,
    packageEntry.packageManifestSha256,
    packageEntry.projectionContentSha256,
  ].join("|");
  return memoizeBrowserLoad(browserIndexCache, key, async () => {
    const indexJson = await fetchJson(indexUrl, fetchImpl, "SwishIQ projection index", timeoutMs);
    return validateIndex(indexJson.value, packageEntry);
  });
}

/**
 * Load one hash-pinned public package part from an already verified exact
 * package proof. This is intentionally capability-scoped: the native
 * historical Lineup Lab adapter may consume observed player-season rows, but
 * it can never turn those rows into the separate lineup-evidence/Impact
 * capability. Callers receive the verified descriptor and JSON value only.
 */
export async function loadSwishIqPublicPart(
  proof,
  { artifactId, kind, capability = "swishiqStudio", fetchImpl = globalThis.fetch?.bind(globalThis) } = {},
) {
  assertSwishIqV3SourceAllowed();
  if (!proof?.index || !proof?.package || !proof?.indexUrl) {
    fail("A verified SwishIQ package proof is required.", "contract-invalid");
  }
  const requestedArtifactId = string(String(artifactId || ""), "SwishIQ artifact ID", { pattern: ARTIFACT_ID, lower: true, maximum: 64 });
  const requestedKind = string(String(kind || ""), "SwishIQ artifact kind", { lower: true, maximum: 64 });
  const artifact = proof.index.artifacts.find((candidate) => candidate.artifactId === requestedArtifactId);
  if (!artifact || artifact.kind !== requestedKind) {
    fail(`The verified SwishIQ package does not publish the ${requestedArtifactId} artifact.`, "capability-unavailable");
  }
  const capabilityKey = string(String(capability || ""), "SwishIQ capability", { maximum: 64 });
  const packageCapability = proof.index.capabilities?.[capabilityKey];
  if (packageCapability?.status !== "available" || !packageCapability.artifactIds.includes(artifact.artifactId)) {
    fail(`The verified SwishIQ package does not bind ${requestedArtifactId} to its public ${capabilityKey} capability.`, "capability-unavailable");
  }
  if (typeof fetchImpl !== "function") fail("This browser cannot load the SwishIQ package part.", "network-unavailable");

  const url = artifactUrl(artifact.path, new URL(proof.indexUrl));
  const cacheKey = [url.toString(), artifact.artifactId, artifact.sha256].join("|");
  return memoizeBrowserPart(cacheKey, artifact.bytes, async () => {
    const bytes = await fetchBytes(url, fetchImpl);
    if (bytes.byteLength !== artifact.bytes || (await sha256RawBytes(bytes)) !== artifact.sha256) {
      fail(`The SwishIQ ${requestedArtifactId} byte hash did not verify.`, "integrity-failed");
    }
    let source;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { fail(`The SwishIQ ${requestedArtifactId} artifact is not valid JSON.`); }
    let value;
    try { value = JSON.parse(source); }
    catch { fail(`The SwishIQ ${requestedArtifactId} artifact is not valid JSON.`); }
    exactKeys(value, [
      "artifactId", "format", "kind", "metricsVersion", "modelId", "normalizer", "packageId",
      "packageManifestSha256", "packageVersion", "records", "scope", "sourceLockSha256",
    ], `SwishIQ ${requestedArtifactId} artifact`);
    assertPublicSafe(value, `SwishIQ ${requestedArtifactId} artifact`);
    if (value.format !== SWISHIQ_PUBLIC_PROJECTION_PART_FORMAT
      || value.artifactId !== artifact.artifactId
      || value.kind !== artifact.kind
      || !Array.isArray(value.records)
      || value.records.length !== artifact.rows) {
      fail(`The SwishIQ ${requestedArtifactId} artifact contract did not verify.`, "integrity-failed");
    }
    if (artifact.kind === "career-lookup" || artifact.kind === "career-history") {
      if (proof.index.scope.kind !== "pooled-window") {
        fail("Career artifacts require the explicitly accepted pooled package.", "capability-unavailable");
      }
      const seen = new Set();
      for (const row of value.records) {
        if (artifact.kind === "career-lookup") validateCareerLookupRecord(row, proof.index.scope);
        else validateCareerHistoryRecord(row, proof.index.scope);
        const key = [row.playerRef, row.seasonStartYear, row.teamCode].join("|");
        if (seen.has(key)) fail(`The SwishIQ ${requestedArtifactId} artifact repeats a player/team/season row.`, "integrity-failed");
        seen.add(key);
      }
    }
    const pins = await normalizePins(value, `SwishIQ ${requestedArtifactId} artifact`);
    for (const pinKey of ["packageId", "packageVersion", "packageManifestSha256", "sourceLockSha256", "modelId", "normalizer", "metricsVersion", "scope"]) {
      if (stableJson(pins[pinKey]) !== stableJson(proof.index[pinKey])) {
        fail(`The SwishIQ ${requestedArtifactId} artifact does not match its exact package.`, "integrity-failed");
      }
    }
    return Object.freeze({
      artifact: Object.freeze({ ...artifact }),
      value,
      url: url.toString(),
    });
  });
}

/**
 * Verify one published package of either scope. Exact-season consumers should
 * continue to use loadSwishIqExactPackageProof; pooled consumers such as
 * Career Lab and cross-season Composite Forge use this explicit package-id
 * path so a pooled window can never satisfy an exact-season request.
 */
export async function loadSwishIqPublishedPackageProof({
  packageId,
  packageVersion,
  requiredCapabilities = [],
  registryUrl = SWISHIQ_PUBLIC_REGISTRY_PATH,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  assertSwishIqV3SourceAllowed();
  const requestedId = string(String(packageId || ""), "SwishIQ package ID", { pattern: PACKAGE_ID, lower: true, maximum: 80 });
  const requestedVersion = string(String(packageVersion || ""), "SwishIQ package version", { pattern: PACKAGE_VERSION, lower: true, maximum: 120 });
  if (typeof fetchImpl !== "function") fail("This browser cannot load the SwishIQ projection.", "network-unavailable");
  const capabilities = normalizeRequiredCapabilities(requiredCapabilities);
  const registryUrlObject = new URL(registryUrl, import.meta.url);
  const registry = await loadVerifiedRegistry(registryUrlObject, fetchImpl);
  const packageEntry = registry.packages.find((entry) => entry.packageId === requestedId && entry.packageVersion === requestedVersion);
  if (!packageEntry || capabilities.some((capability) => packageEntry.capabilities[capability]?.status !== "available")) {
    fail("This published SwishIQ package is preparing for this capability. No other scope was used.", "capability-unavailable");
  }
  const indexUrl = artifactUrl(packageEntry.projectionIndexPath, registryUrlObject);
  const index = await loadVerifiedIndex(indexUrl, packageEntry, fetchImpl);
  return Object.freeze({
    request: Object.freeze({ packageId: requestedId, packageVersion: requestedVersion, phase: null }),
    registry: Object.freeze({ registryVersion: registry.registryVersion, registryRevisionSha256: registry.registryRevisionSha256 }),
    package: Object.freeze({
      format: "djhc-swishiq-package-v3", status: "published", packageId: packageEntry.packageId,
      packageVersion: packageEntry.packageVersion, packageManifestSha256: packageEntry.packageManifestSha256,
      sourceLockSha256: packageEntry.sourceLockSha256, modelId: packageEntry.modelId,
      normalizer: packageEntry.normalizer, metricsVersion: packageEntry.metricsVersion,
      scope: Object.freeze({ ...packageEntry.scope, seasonStartYears: Object.freeze([...packageEntry.scope.seasonStartYears]), phases: Object.freeze([...packageEntry.scope.phases]) }),
      capabilities: Object.freeze(Object.fromEntries(Object.entries(packageEntry.capabilities).map(([key, value]) => [
        key, Object.freeze({ ...value, ...(value.artifactIds ? { artifactIds: Object.freeze([...value.artifactIds]) } : {}) }),
      ]))),
      projectionIndexPath: packageEntry.projectionIndexPath, projectionContentSha256: packageEntry.projectionContentSha256,
    }),
    index: Object.freeze({
      ...index,
      scope: Object.freeze({ ...index.scope, seasonStartYears: Object.freeze([...index.scope.seasonStartYears]), phases: Object.freeze([...index.scope.phases]) }),
      capabilities: Object.freeze(Object.fromEntries(Object.entries(index.capabilities).map(([key, value]) => [
        key, Object.freeze({ ...value, ...(value.artifactIds ? { artifactIds: Object.freeze([...value.artifactIds]) } : {}) }),
      ]))),
      artifacts: Object.freeze(index.artifacts.map((artifact) => Object.freeze({ ...artifact }))),
    }),
    indexUrl: indexUrl.toString(),
  });
}

/**
 * Verify the registry and projection index for one published exact-season
 * package. This is the shared browser proof boundary for Lineup Lab and
 * precompiled games: callers receive package pins and public descriptors,
 * never a fallback package or private package material.
 */
export async function loadSwishIqExactPackageProof({
  seasonEndYear,
  seasonPhase = "regular",
  requiredCapabilities = [],
  packageRef = null,
  registryUrl = SWISHIQ_PUBLIC_REGISTRY_PATH,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  requestTimeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS,
} = {}) {
  assertSwishIqV3SourceAllowed();
  const request = {
    seasonEndYear: integer(Number(seasonEndYear), "Selected season", { minimum: 1948, maximum: 2200 }),
    phase: string(String(seasonPhase || "").toLowerCase(), "Selected phase", { maximum: 40 }),
  };
  if (!PHASES.includes(request.phase)) fail("Choose a supported season phase.");
  if (typeof fetchImpl !== "function") fail("This browser cannot load the SwishIQ projection.", "network-unavailable");
  const capabilities = normalizeRequiredCapabilities(requiredCapabilities);

  const registryUrlObject = new URL(registryUrl, import.meta.url);
  const registry = await loadVerifiedRegistry(registryUrlObject, fetchImpl, requestTimeoutMs);
  const packageEntry = selectExactPackage(registry, request, capabilities);
  verifyExpectedPackageRef(packageRef, packageEntry, registry);
  const indexUrl = artifactUrl(packageEntry.projectionIndexPath, registryUrlObject);
  const index = await loadVerifiedIndex(indexUrl, packageEntry, fetchImpl, requestTimeoutMs);
  verifyExpectedPackageRef(packageRef, packageEntry, registry, index);

  return Object.freeze({
    request: Object.freeze({ ...request }),
    registry: Object.freeze({
      registryVersion: registry.registryVersion,
      registryRevisionSha256: registry.registryRevisionSha256,
    }),
    package: Object.freeze({
      format: "djhc-swishiq-package-v3",
      status: "published",
      packageId: packageEntry.packageId,
      packageVersion: packageEntry.packageVersion,
      packageManifestSha256: packageEntry.packageManifestSha256,
      sourceLockSha256: packageEntry.sourceLockSha256,
      modelId: packageEntry.modelId,
      normalizer: packageEntry.normalizer,
      metricsVersion: packageEntry.metricsVersion,
      scope: Object.freeze({ ...packageEntry.scope, seasonStartYears: Object.freeze([...packageEntry.scope.seasonStartYears]), phases: Object.freeze([...packageEntry.scope.phases]) }),
      capabilities: Object.freeze(Object.fromEntries(Object.entries(packageEntry.capabilities).map(([key, value]) => [
        key,
        Object.freeze({ ...value, ...(value.artifactIds ? { artifactIds: Object.freeze([...value.artifactIds]) } : {}) }),
      ]))),
      projectionIndexPath: packageEntry.projectionIndexPath,
      projectionContentSha256: packageEntry.projectionContentSha256,
    }),
    index: Object.freeze({
      ...index,
      scope: Object.freeze({ ...index.scope, seasonStartYears: Object.freeze([...index.scope.seasonStartYears]), phases: Object.freeze([...index.scope.phases]) }),
      capabilities: Object.freeze(Object.fromEntries(Object.entries(index.capabilities).map(([key, value]) => [
        key,
        Object.freeze({ ...value, ...(value.artifactIds ? { artifactIds: Object.freeze([...value.artifactIds]) } : {}) }),
      ]))),
      artifacts: Object.freeze(index.artifacts.map((artifact) => Object.freeze({ ...artifact }))),
    }),
    indexUrl: indexUrl.toString(),
  });
}

/**
 * Resolve one published exact package. Scope is season-wide; team and phase
 * are filtered only from verified lineup-evidence records.
 */
export async function loadSwishIqStaticLineupProjection({
  seasonEndYear,
  team,
  seasonPhase = "regular",
  registryUrl = SWISHIQ_PUBLIC_REGISTRY_PATH,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  assertSwishIqV3SourceAllowed();
  const request = {
    seasonEndYear: integer(Number(seasonEndYear), "Selected season", { minimum: 1948, maximum: 2200 }),
    team: string(String(team || "").toUpperCase(), "Selected team", { pattern: /^[A-Z]{3}$/, maximum: 3 }),
    phase: string(String(seasonPhase || "").toLowerCase(), "Selected phase", { maximum: 40 }),
  };
  if (!TEAM_CODES.has(request.team) || !PHASES.includes(request.phase)) fail("Choose a supported team and season phase.");
  const proof = await loadSwishIqExactPackageProof({
    seasonEndYear: request.seasonEndYear,
    seasonPhase: request.phase,
    requiredCapabilities: ["lineupLab", "publicAdvancedImpact"],
    registryUrl,
    fetchImpl,
  });
  const allRecords = await loadVerifiedLineupRecords(proof, fetchImpl);
  const records = allRecords.filter((record) => record.teamCode === request.team && record.phase === request.phase);
  if (records.length < 5) fail("SwishIQ Impact is not available for the complete selected roster.", "capability-unavailable");
  const resolvedPackage = {
    ...proof.package,
    registryVersion: proof.registry.registryVersion,
    registryRevisionSha256: proof.registry.registryRevisionSha256,
  };

  return Object.freeze({
    request: Object.freeze({ ...request }),
    package: Object.freeze(resolvedPackage),
    dataset: datasetFromRecords(records, resolvedPackage, request),
    evidence: evidenceFromRecords(records, resolvedPackage, request),
  });
}

/**
 * Return only phase-level coverage counts from the verified exact-season
 * lineup-evidence part. A phase is usable when at least one team has the same
 * five-player minimum required by the selected-team projection loader. No
 * player rows or Impact values are exposed by this selector helper.
 */
export async function loadSwishIqStaticLineupCoverage({
  seasonEndYear,
  registryUrl = SWISHIQ_PUBLIC_REGISTRY_PATH,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  requestTimeoutMs = SWISHIQ_PUBLIC_REQUEST_TIMEOUT_MS,
} = {}) {
  assertSwishIqV3SourceAllowed();
  const season = integer(Number(seasonEndYear), "Selected season", { minimum: 1948, maximum: 2200 });
  const proof = await loadSwishIqExactPackageProof({
    seasonEndYear: season,
    seasonPhase: "regular",
    requiredCapabilities: ["lineupLab", "publicAdvancedImpact"],
    registryUrl,
    fetchImpl,
    requestTimeoutMs,
  });
  const records = await loadVerifiedLineupRecords(proof, fetchImpl, requestTimeoutMs);
  const countsByTeam = new Map();
  const countsByPhase = Object.fromEntries(PHASES.map((phase) => [phase, 0]));
  for (const record of records) {
    const counts = countsByTeam.get(record.teamCode) || Object.fromEntries(PHASES.map((phase) => [phase, 0]));
    counts[record.phase] += 1;
    countsByTeam.set(record.teamCode, counts);
    countsByPhase[record.phase] += 1;
  }
  const teamPhaseCounts = Object.freeze(Object.fromEntries([...countsByTeam.entries()].map(([team, counts]) => [
    team,
    Object.freeze({ ...counts }),
  ])));
  const phases = PHASES.filter((phase) => Object.values(teamPhaseCounts).some((counts) => counts[phase] >= 5));
  return Object.freeze({
    seasonEndYear: season,
    phases: Object.freeze(phases),
    phaseRowCounts: Object.freeze({ ...countsByPhase }),
    teamPhaseCounts,
  });
}

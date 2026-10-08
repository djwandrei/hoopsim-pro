import {
  OBJECTIVE_FAMILY_DEFINITIONS,
  weightsFromSkillFamilies,
} from "./optimizer-config.js?v=20261002c&rev=lineup-input-stability-config-v1";

/**
 * Optional possession-level SwishIQ layer.
 *
 * The historical model remains independent from this contract. Public V3 is
 * an opt-in, exact-season layer; legacy private readers remain source-gated.
 * Private legacy hybrid behavior is uncalibrated and source-only.
 * Incomplete evidence fails closed instead of
 * treating an unknown player as average, replacement level, or zero impact.
 *
 * There are two deliberately separate kinds of SwishIQ evidence:
 *
 * 1. Primary SwishIQ uses validated player O/D RAPM as its whole objective.
 *    The solver ranks on the continuous weighted coefficients. A common
 *    non-negative offset is restored after allocation; bounded calibration is
 *    presentation-only. Ridge-regularized coefficients are not multiplied by
 *    reliability a second time.
 *    Historical box scores remain context and hard constraints, not hidden fit.
 * 2. A five-player residual is a group-only signal. It is used only for an
 *    exact five in legacy hybrid experiments only. Primary SwishIQ excludes it
 *    until independent incremental validation avoids double-counting RAPM.
 */

export const SWISHIQ_IMPACT_MODEL_VERSION = "swishiq-impact-v3-static-projection";
// Separate the evidence/package version from the optimizer objective version.
// This lets a replay distinguish a changed scoring transform from a changed
// RAPM package, while keeping the public evidence gate backward compatible.
export const SWISHIQ_IMPACT_OBJECTIVE_VERSION = "swishiq-impact-objective-v10";
export const SWISHIQ_MODEL_MODES = Object.freeze(["historical", "hybrid", "swishiq-impact"]);
// The native offense/defense fit defines a positive defensive coefficient as
// reducing predicted opponent scoring. Keep this semantic pin at the model
// boundary so a transport or package cannot silently invert defense.
export const SWISHIQ_DEFENSIVE_SIGN_CONVENTION = "positive_is_better_and_reduces_predicted_opponent_scoring";

const PLAYER_IMPACT_ALIASES = Object.freeze({
  offense: [
    "offensiveRapmPer100",
    "offensiveRapm",
    "offensive_rapm",
    "offense",
    "offensiveImpact",
  ],
  defense: [
    "defensiveRapmPer100",
    "defensiveRapm",
    "defensive_rapm",
    "defense",
    "defensiveImpact",
  ],
});

// Native fitting can expose separate stability proxies for the offensive and
// defensive channels. These weight only their matching proxy-upside allowance;
// they never shrink coefficients that the V3 fit has already regularized.
const COMPONENT_RELIABILITY_ALIASES = Object.freeze({
  offense: [
    "offenseReliability",
    "offensiveReliability",
    "offenseRidgeReliabilityProxy",
    "offensiveRidgeReliabilityProxy",
  ],
  defense: [
    "defenseReliability",
    "defensiveReliability",
    "defenseRidgeReliabilityProxy",
    "defensiveRidgeReliabilityProxy",
  ],
});

// Hybrid is retained for reproducible older API experiments; the UI exposes
// only Historical and primary SwishIQ. SwishIQ is not the former 12% blend.
const SWISHIQ_BLEND_BY_MODE = Object.freeze({ historical: 0, hybrid: 0.06, "swishiq-impact": 1 });
const FIXED_REFERENCE_MODEL_VERSIONS = new Set([
  "weighted_ridge_offense_defense_rapm_v2",
  "swishiq-impact-v2",
]);
const DEFAULT_OBJECTIVE_CALIBRATION = Object.freeze({
  version: "fixed-reference-affine-per100-v1",
  method: "fixed-reference-affine-per100-v1",
  center: 0,
  scalePer100: 10,
  clip: true,
});
const IMPACT_PER100_LIMIT = 100;
export const SWISHIQ_IMPACT_PER100_LIMIT = IMPACT_PER100_LIMIT;

function compareIds(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function strictFinite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finite(value) {
  // Number(null), Number(false), and Number("") all equal zero in JavaScript.
  // Those coercions are particularly dangerous here: an absent RAPM component
  // would look like valid neutral evidence and make SwishIQ mode appear ready.
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeObjectiveCalibration(model) {
  const supplied = model?.objectiveCalibration;
  const source = supplied && typeof supplied === "object" && !Array.isArray(supplied)
    ? supplied
    : FIXED_REFERENCE_MODEL_VERSIONS.has(model?.evidenceModelVersion || model?.modelVersion)
      ? DEFAULT_OBJECTIVE_CALIBRATION
      : null;
  if (!source) return null;
  // This optional fixed-reference transform governs only the bounded display
  // score. Invalid metadata removes that display calibration; it never changes
  // or disables the continuous solver objective.
  if (source.version !== DEFAULT_OBJECTIVE_CALIBRATION.version
    || source.method !== DEFAULT_OBJECTIVE_CALIBRATION.method
    || source.clip !== true) return null;
  const center = finite(source.center);
  const scale = finite(source.scalePer100);
  if (center === null || scale === null || !(scale > 0)) return null;
  return Object.freeze({
    ...DEFAULT_OBJECTIVE_CALIBRATION,
    ...source,
    center,
    scalePer100: scale,
    clip: source.clip !== false,
  });
}

function objectiveDisplayScore(raw, calibration) {
  if (!calibration) return null;
  const scaled = 0.5 + (raw - calibration.center) / (2 * calibration.scalePer100);
  return calibration.clip ? clamp(scaled, 0, 1) : scaled;
}

function confidenceProxy(row) {
  const coverage = row?.coverage && typeof row.coverage === "object" ? row.coverage : {};
  const positive = value => {
    const number = finite(value);
    return number !== null && number > 0 ? number : null;
  };
  const rawPaired = finite(row?.pairedPossessions ?? coverage?.possessions);
  // Native recency-weighted fits can expose an effective paired-possession
  // count alongside the raw count. Use the effective exposure for stability
  // reserves when it is explicitly supplied; otherwise preserve the public
  // coverage count. This makes low-exposure/recency-weighted rows more
  // conservative without changing any published coefficient.
  const metrics = row?.metrics && typeof row.metrics === "object" ? row.metrics : {};
  const componentEffective = {
    offense: positive(row?.effectiveOffensePossessions
      ?? row?.effectiveOffensivePossessions
      ?? coverage?.effectiveOffensePossessions
      ?? coverage?.effectiveOffensivePossessions
      ?? metrics?.effectiveOffensePossessions
      ?? metrics?.effectiveOffensivePossessions
      ?? metrics?.effectiveComponentPossessions?.offense),
    defense: positive(row?.effectiveDefensePossessions
      ?? row?.effectiveDefensivePossessions
      ?? coverage?.effectiveDefensePossessions
      ?? coverage?.effectiveDefensivePossessions
      ?? metrics?.effectiveDefensePossessions
      ?? metrics?.effectiveDefensivePossessions
      ?? metrics?.effectiveComponentPossessions?.defense),
  };
  const effectivePaired = positive(row?.effectivePairedPossessions ?? coverage?.effectivePossessions ?? row?.effectivePossessions);
  const paired = effectivePaired ?? rawPaired;
  const explicit = row?.confidence95 && typeof row.confidence95 === "object" ? row.confidence95 : null;
  const explicitLower = finite(explicit?.lower);
  const explicitUpper = finite(explicit?.upper);
  const netInterval = explicitLower !== null && explicitUpper !== null && explicitUpper >= explicitLower
    ? { lower: explicitLower, upper: explicitUpper } : null;
  // Native packages may publish separate O/D intervals. Keep each interval
  // attached to its matching component; a missing side can use its own
  // exposure proxy, but never inherits the other side's confidence width.
  const sideIntervals = {};
  for (const side of ["offense", "defense"]) {
    const lower = finite(explicit?.[side]?.lower);
    const upper = finite(explicit?.[side]?.upper);
    if (lower !== null && upper !== null && upper >= lower) sideIntervals[side] = { lower, upper };
  }
  const componentExposure = {
    offense: componentEffective.offense ?? paired,
    defense: componentEffective.defense ?? paired,
  };
  const uncertaintyByComponent = {};
  const uncertaintySourcesByComponent = {};
  for (const side of ["offense", "defense"]) {
    if (sideIntervals[side]) {
      uncertaintyByComponent[side] = (sideIntervals[side].upper - sideIntervals[side].lower) / 3.919927969080108;
      uncertaintySourcesByComponent[side] = "calibrated";
      continue;
    }
    const exposure = positive(componentExposure[side]);
    if (exposure !== null) {
      uncertaintyByComponent[side] = 12 / Math.sqrt(Math.max(1, exposure) / 100);
      uncertaintySourcesByComponent[side] = "proxy";
      continue;
    }
    uncertaintyByComponent[side] = null;
    uncertaintySourcesByComponent[side] = "unavailable";
  }
  const availableUncertainty = Object.values(uncertaintyByComponent).filter(value => finite(value) !== null);
  if (!availableUncertainty.length) {
    return {
      status: "unavailable",
      pairedPossessions: paired,
      rawPairedPossessions: rawPaired,
      effectivePairedPossessionsByComponent: componentEffective,
      uncertaintyPer100: null,
      ...(netInterval ? { netInterval } : {}),
      note: netInterval
        ? "A net confidence interval was retained for display, but it cannot define offense/defense reserves; component intervals or exposure are unavailable."
        : "Complete paired-possession exposure or separate exposure for both offense and defense was unavailable; no component interval was invented.",
    };
  }
  const sourceTypes = Object.values(uncertaintySourcesByComponent).filter(source => source !== "unavailable");
  const uncertaintyStatus = sourceTypes.length < 2
    ? "partial"
    : sourceTypes.every(source => source === "calibrated")
      ? "calibrated"
      : sourceTypes.every(source => source === "proxy") ? "proxy" : "mixed";
  const uncertainty = Math.max(...availableUncertainty);
  const missingComponents = Object.entries(uncertaintySourcesByComponent)
    .filter(([, source]) => source === "unavailable")
    .map(([side]) => side);
  const note = uncertaintyStatus === "calibrated"
    ? "Provided offense and defense confidence intervals from the accepted impact package; each reserve uses its matching component interval."
    : uncertaintyStatus === "proxy"
      ? "Exposure-derived uncertainty proxy; not a held-out confidence interval."
      : uncertaintyStatus === "mixed"
        ? "One component uses a package confidence interval and the other uses an exposure-derived proxy; the sources are kept separate."
        : `Only ${sourceTypes[0]} component uncertainty was available; ${missingComponents.join(" and ")} receives no risk reserve.`;
  return { status: uncertaintyStatus, pairedPossessions: paired, rawPairedPossessions: rawPaired,
    effectivePairedPossessionsByComponent: componentEffective,
    uncertaintyPer100: uncertainty,
    uncertaintyByComponent,
    uncertaintySourcesByComponent,
    interval: sideIntervals,
    ...(netInterval ? { netInterval } : {}),
    note: [note, netInterval ? "A supplied net interval is descriptive only and was not converted into offense/defense uncertainty." : null]
      .filter(Boolean).join(" "),
  };
}

function riskAdjustedImpact(row, riskProfile) {
  const profile = riskProfile || "mean";
  const proxy = row?.uncertainty;
  const componentUncertainty = proxy?.uncertaintyByComponent || {};
  const uncertaintyFor = side => Object.hasOwn(componentUncertainty, side)
    ? (finite(componentUncertainty[side]) ?? 0)
    : (finite(proxy?.uncertaintyPer100) ?? 0);
  const offenseUncertainty = uncertaintyFor("offense");
  const defenseUncertainty = uncertaintyFor("defense");
  const scalarReliability = clamp(finite(row?.reliability) ?? 0, 0, 1);
  const reliabilityFor = side => clamp(
    finite(row?.reliabilityByComponent?.[side]) ?? scalarReliability,
    0,
    1,
  );
  // An exposure proxy is not a calibrated interval. In the optimistic branch
  // it therefore cannot be treated as evidence of latent upside by itself:
  // only the matching component's published reliability fraction of proxy
  // uncertainty is credited (or the scalar public-package fallback).
  // A package-supplied calibrated interval already accounts for uncertainty and
  // remains fully usable. This prevents a short hot streak from receiving the
  // same upside allowance as a sustained, reliable impact estimate.
  const sourceByComponent = proxy?.uncertaintySourcesByComponent || {};
  const upsideTrustFor = side => {
    if (profile !== "upside") return 1;
    if (sourceByComponent[side] === "proxy") return reliabilityFor(side);
    if (sourceByComponent[side] === "calibrated" || sourceByComponent[side] === "unavailable") return 1;
    // Older proxy rows predate component source metadata; preserve their
    // reliability discount without applying it to calibrated components in a
    // mixed row.
    return proxy?.status === "proxy" ? reliabilityFor(side) : 1;
  };
  const proxyUpsideTrustByComponent = {
    offense: upsideTrustFor("offense"),
    defense: upsideTrustFor("defense"),
  };
  const proxyUpsideTrust = Math.min(...Object.values(proxyUpsideTrustByComponent));
  const offenseReserve = profile === "reliable" ? offenseUncertainty * 0.25
    : profile === "upside" ? -(offenseUncertainty * 0.15 * proxyUpsideTrustByComponent.offense) : 0;
  const defenseReserve = profile === "reliable" ? defenseUncertainty * 0.25
    : profile === "upside" ? -(defenseUncertainty * 0.15 * proxyUpsideTrustByComponent.defense) : 0;
  // `reserve` remains a compact compatibility/readout value. Component
  // reserves are authoritative for the objective and are exposed separately.
  const reserve = Math.max(Math.abs(offenseReserve), Math.abs(defenseReserve));
  return {
    offense: row.offense - offenseReserve,
    defense: row.defense - defenseReserve,
    reserve,
    reserveByComponent: { offense: offenseReserve, defense: defenseReserve },
    proxyUpsideTrust,
    proxyUpsideTrustByComponent,
  };
}

function mapValue(source, id) {
  if (source instanceof Map) return source.get(id) ?? source.get(String(id));
  if (!source || (typeof source !== "object" && typeof source !== "function")) return undefined;
  for (const key of [id, String(id)]) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function playerEvidence(source, id) {
  const value = mapValue(source, id);
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * Private `get_nba_swishiq_rapm` rows expose the RAPM components at their top
 * level, while the reliability proxy belongs in a compact `metrics` object.
 * Accept only those two bounded shapes. This does not recursively search an
 * arbitrary payload, which would make an unrelated nested number silently
 * qualify a player for SwishIQ mode.
 */
function evidenceObjects(row) {
  const nestedMetrics = row?.metrics;
  return nestedMetrics && typeof nestedMetrics === "object" && !Array.isArray(nestedMetrics)
    ? [row, nestedMetrics]
    : [row];
}

function impactValue(row, side) {
  for (const source of evidenceObjects(row)) {
    for (const alias of PLAYER_IMPACT_ALIASES[side]) {
      const value = finite(source?.[alias]);
      if (value !== null) return value;
    }
  }
  return null;
}

function reliabilityValue(row) {
  // The current compact private RAPM response stores its stability proxy in
  // `metrics.ridgeReliabilityProxy`; test/dev callers may use `reliability`.
  // Require an explicit value rather than granting an omitted value full trust.
  for (const source of evidenceObjects(row)) {
    for (const alias of ["reliability", "ridgeReliabilityProxy", "reliabilityProxy"]) {
      const value = finite(source?.[alias]);
      // Bad evidence must not become perfect reliability through clamping.
      // A real zero is valid; an out-of-range value is a contract failure.
      if (value !== null) return value >= 0 && value <= 1 ? value : null;
    }
  }
  return null;
}

function componentReliabilityValue(row, side, fallback = null) {
  for (const source of evidenceObjects(row)) {
    const componentMap = source?.reliabilityByComponent;
    if (componentMap && typeof componentMap === "object" && !Array.isArray(componentMap)
      && Object.hasOwn(componentMap, side)) {
      const value = finite(componentMap[side]);
      return value !== null && value >= 0 && value <= 1 ? value : null;
    }
    for (const alias of COMPONENT_RELIABILITY_ALIASES[side]) {
      if (!Object.hasOwn(source ?? {}, alias)) continue;
      const value = finite(source[alias]);
      // An explicitly malformed component proxy cannot inherit scalar trust.
      return value !== null && value >= 0 && value <= 1 ? value : null;
    }
  }
  return fallback;
}

/**
 * All callers, including test fixtures, must provide compact model metadata.
 * A missing model must never bypass validation. Require a completed held-out O/D
 * calibration before those numbers can influence a user-facing exact solve.
 * This prevents a merely converged in-sample fit from being mistaken for a
 * validated offense/defense signal.
 */
function modelCalibrationGate(evidence) {
  const model = evidence?.model;
  if (!model || typeof model !== "object" || Array.isArray(model)) {
    return {
      required: true,
      available: false,
      reason: "SwishIQ Impact metadata was malformed, so its possession impact stayed disabled.",
    };
  }
  const v3HoldoutProof = evidence?.publicProjection === true
    && evidence?.provenance?.kind === "public-derived"
    && evidence?.provenance?.calibrationStatus === "validated"
    && evidence?.package?.visibility === "public"
    && /^[a-f0-9]{64}$/.test(String(evidence?.package?.packageManifestSha256 || ""))
    && /^[a-f0-9]{64}$/.test(String(evidence?.package?.lineupLabEvidenceSha256 || ""))
    && model.modelId === "swishiq-v3"
    && model.modelVersion === "weighted_ridge_offense_defense_rapm_v2"
    && model.fitScope === "exact-season-across-all-package-phases"
    && model.exactSeasonHoldoutStatus === "validated"
    && /^[a-f0-9]{64}$/.test(String(model.exactSeasonHoldoutEvidenceSha256 || ""))
    && model.exactSeasonHoldoutEvidenceSha256 === evidence.package.lineupLabEvidenceSha256;
  if (v3HoldoutProof) return chronologicalModelGate(model);

  // Keep legacy private test/model callers behind their existing calibration
  // contract while admitting only the explicitly proven public V3 branch above.
  const calibration = model.calibration;
  if (
    calibration
    && typeof calibration === "object"
    && !Array.isArray(calibration)
    && calibration.status === "validated"
    && calibration.allComponentsImproved === true
  ) {
    return chronologicalModelGate(model);
  }
  return {
    required: true,
    available: false,
    reason: "SwishIQ Impact metadata did not pass its held-out offense/defense calibration, so its impact values stayed separate from the optimizer.",
  };
}

/**
 * Single-season legacy previews have only the O/D game-fold report. A model
 * advertising a training window/chronological test must also provide the new
 * evidence. Never allow a multi-year fit to reuse just the older PASS flags.
 * This compact consumer check supplements, not replaces, the offline package
 * validator (which checks shards, temporal splits, tuning, and provenance).
 */
function chronologicalModelGate(model) {
  const years = model.includedSeasonStartYears;
  const report = model.chronologicalCalibration;
  if (years == null && report == null) return { required: true, available: true, reason: null };
  const latest = model.seasonEndYear - 1;
  const full = report?.test?.fullModel;
  const baseline = report?.test?.fixedEffectsBaseline;
  const mse = finite(full?.weightedMse);
  const baselineMse = finite(baseline?.weightedMse);
  const improvement = baselineMse > 0 && mse !== null ? (baselineMse - mse) / baselineMse : null;
  const reportedImprovement = finite(report?.test?.fullModelMseImprovementVsFixedEffectsBaseline);
  const possessions = finite(full?.heldOutPossessions);
  const observations = finite(full?.directionalObservationCount);
  const lambda = finite(model.lambda);
  const priorWeight = finite(model.priorSeasonWeight);
  const passed = Array.isArray(years) && years.length > 0
    && years.every(year => Number.isInteger(year) && year >= 1947 && year <= latest)
    && new Set(years).size === years.length && years.includes(latest)
    && Number.isInteger(model.seasonEndYear)
    && report?.version === "chronological_latest_season_tune_test_v1"
    && report?.method === "prior_seasons_plus_chronological_latest_season_train_tune_test_v1"
    && report?.model === "offenseDefense" && report?.latestSeasonStartYear === latest
    && lambda !== null && lambda > 0 && finite(report.selectedLambda) === lambda
    && priorWeight !== null && priorWeight >= 0 && priorWeight <= 1
    && finite(report.selectedPriorSeasonWeight) === priorWeight
    && model.solver?.converged === true
    && mse !== null && mse >= 0 && improvement > 1e-9
    && reportedImprovement !== null && Math.abs(reportedImprovement - improvement) <= 1e-9
    && report.test.status === "validated" && report.test.fullModelImprovesBaseline === true
    && possessions > 0 && finite(baseline?.heldOutPossessions) === possessions
    && Number.isSafeInteger(observations) && observations > 0
    && finite(baseline?.directionalObservationCount) === observations;
  return {
    required: true, available: passed,
    reason: passed ? null : "SwishIQ's multiseason model needs a matching, passed chronological prediction test before it can affect this solve.",
  };
}

function normalizedWeights(offenseWeight, defenseWeight) {
  const offense = Math.max(0, finite(offenseWeight) ?? 0);
  const defense = Math.max(0, finite(defenseWeight) ?? 0);
  const total = offense + defense;
  return total > 0
    ? { offense: offense / total, defense: defense / total }
    : { offense: 0.5, defense: 0.5 };
}

/**
 * Continuous user preference, kept separate from fitted O/D coefficients.
 * The three familiar presets are shorthand, not the only valid objectives.
 * For example 70/30 and 7/3 must request exactly the same basketball tradeoff.
 * A missing/invalid setting must never quietly become a balanced request.
 */
export function resolveSwishIQObjectiveWeights(input, preset = "balanced") {
  if (input === undefined) {
    if (!["balanced", "offense", "defense"].includes(preset)) throw new Error("Choose Balanced, Offense, Defense, or provide custom SwishIQ Impact weights.");
    return { offense: preset === "defense" ? 0 : preset === "offense" ? 1 : .5,
      defense: preset === "offense" ? 0 : preset === "defense" ? 1 : .5, custom: false };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key => key !== "offense" && key !== "defense")
    || ![input.offense, input.defense].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10000)
    || !(input.offense + input.defense > 0)) {
    throw new Error("Custom SwishIQ Impact weights need both offense and defense as numbers from 0 to 10000, with at least one above zero.");
  }
  const total = input.offense + input.defense;
  return { offense: input.offense / total, defense: input.defense / total, custom: true };
}

const SWISHIQ_OFFENSE_OBJECTIVE_METRICS = new Set([
  "points", "freeThrowAttemptRate", "efgPct", "threePct", "assists", "ballSecurity", "offensiveImpact",
]);
const SWISHIQ_DEFENSE_OBJECTIVE_METRICS = new Set([
  "rebounds", "steals", "blocks", "defensiveImpact",
]);

/**
 * Attribute the existing weighted O/D impact readout to the displayed family
 * priorities only when those priorities reproduce the solver weights and the
 * O/D mix used by this result. This is a preference allocation in points per
 * 100 possessions, not a calibrated family-level or lineup-value estimate.
 */
export function swishIQFamilyContributionBreakdown(impactAdjustment, familyWeights, metricWeights) {
  const additive = impactAdjustment?.additiveImpactPer100;
  if (!additive || !familyWeights || typeof familyWeights !== "object" || Array.isArray(familyWeights)
    || !metricWeights || typeof metricWeights !== "object" || Array.isArray(metricWeights)) {
    return { ok: false, reason: "Family contribution inputs are unavailable." };
  }

  let weightsFromFamilies;
  try {
    weightsFromFamilies = weightsFromSkillFamilies(familyWeights);
  } catch {
    return { ok: false, reason: "The saved family priorities are invalid." };
  }
  const sameNumber = (left, right) => Number.isFinite(Number(left)) && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= 1e-9 * Math.max(1, Math.abs(Number(left)), Math.abs(Number(right)));
  const objectiveMetrics = new Set([...Object.keys(weightsFromFamilies), ...Object.keys(metricWeights)]);
  if (![...objectiveMetrics].every(metric => sameNumber(weightsFromFamilies[metric] ?? 0, metricWeights[metric] ?? 0))) {
    return { ok: false, reason: "The result used raw metric priorities, so family attribution is ambiguous." };
  }

  const termsByFamily = Object.entries(OBJECTIVE_FAMILY_DEFINITIONS).map(([family, definition]) => {
    const rawWeight = familyWeights[family];
    const weight = rawWeight === undefined ? 0 : Number(rawWeight);
    if (rawWeight === null || typeof rawWeight === "boolean" || rawWeight === ""
      || !Number.isFinite(weight) || weight < 0) return null;
    const offenseWeight = Object.entries(definition.metrics)
      .filter(([metric]) => SWISHIQ_OFFENSE_OBJECTIVE_METRICS.has(metric))
      .reduce((total, [, coefficient]) => total + weight * coefficient, 0);
    const defenseWeight = Object.entries(definition.metrics)
      .filter(([metric]) => SWISHIQ_DEFENSE_OBJECTIVE_METRICS.has(metric))
      .reduce((total, [, coefficient]) => total + weight * coefficient, 0);
    return { family, label: definition.label, offenseWeight, defenseWeight };
  });
  if (termsByFamily.some(row => row === null)) {
    return { ok: false, reason: "The saved family priorities are incomplete." };
  }

  const totalOffensePriority = termsByFamily.reduce((total, row) => total + row.offenseWeight, 0);
  const totalDefensePriority = termsByFamily.reduce((total, row) => total + row.defenseWeight, 0);
  const totalPriority = totalOffensePriority + totalDefensePriority;
  if (!(totalPriority > 0)) return { ok: false, reason: "The saved family priorities do not define an O/D objective." };

  const objectiveWeights = additive.objectiveWeights || {};
  const expectedOffenseWeight = totalOffensePriority / totalPriority;
  const expectedDefenseWeight = totalDefensePriority / totalPriority;
  if (!sameNumber(objectiveWeights.offense, expectedOffenseWeight)
    || !sameNumber(objectiveWeights.defense, expectedDefenseWeight)) {
    return { ok: false, reason: "The SwishIQ O/D weights do not match the saved family priorities." };
  }

  const riskAdjusted = impactAdjustment.riskProfile === "reliable"
    && additive.riskAdjusted
    && Number.isFinite(additive.riskAdjusted.offense)
    && Number.isFinite(additive.riskAdjusted.defense);
  const impact = riskAdjusted ? additive.riskAdjusted : additive;
  if (!Number.isFinite(impact.offense) || !Number.isFinite(impact.defense)) {
    return { ok: false, reason: "The result's O/D impact components are unavailable." };
  }
  const weightedOffense = impact.offense * objectiveWeights.offense;
  const weightedDefense = impact.defense * objectiveWeights.defense;
  const families = termsByFamily.map(row => {
    const offense = totalOffensePriority > 0
      ? weightedOffense * row.offenseWeight / totalOffensePriority : 0;
    const defense = totalDefensePriority > 0
      ? weightedDefense * row.defenseWeight / totalDefensePriority : 0;
    return {
      id: row.family,
      label: row.label,
      offense,
      defense,
      total: offense + defense,
    };
  });
  const familyTotal = families.reduce((total, row) => total + row.total, 0);
  const weightedTotal = weightedOffense + weightedDefense;
  return {
    ok: true,
    unit: "weighted additive impact points per 100 possessions",
    treatment: riskAdjusted ? "Reliable downside treatment" : "Unadjusted impact coefficients",
    offense: weightedOffense,
    defense: weightedDefense,
    total: weightedTotal,
    families: families.sort((left, right) => Math.abs(right.total) - Math.abs(left.total) || left.id.localeCompare(right.id)),
    reconciliationResidual: weightedTotal - familyTotal,
    validatedLineupForecast: false,
  };
}

function percentileRanks(values) {
  const rows = values
    .map(({ id, value }) => ({ id, value: finite(value) }))
    .filter(({ value }) => value !== null)
    .sort((left, right) => left.value - right.value || compareIds(left.id, right.id));
  const ranks = new Map();
  if (rows.length === 0) return ranks;

  // Ties receive their average rank. This makes a zero-variance SwishIQ pool
  // neutral rather than allowing arbitrary player IDs to decide minutes.
  let start = 0;
  while (start < rows.length) {
    let end = start + 1;
    while (end < rows.length && Math.abs(rows[end].value - rows[start].value) < 1e-12) end += 1;
    const percentile = rows.length === 1 ? 0.5 : ((start + end - 1) / 2) / (rows.length - 1);
    for (let index = start; index < end; index += 1) ranks.set(rows[index].id, percentile);
    start = end;
  }
  return ranks;
}

function emptyMinuteObjective(baseScoresById, reason) {
  const scoresById = new Map();
  for (const [id, value] of baseScoresById ?? []) scoresById.set(id, value);
  return {
    applied: false,
    blend: 0,
    offenseWeight: 0.5,
    defenseWeight: 0.5,
    scoresById,
    displayScoresById: new Map(scoresById),
    objectiveOffset: 0,
    adjustmentScoresById: new Map(),
    swishiqPercentilesById: new Map(),
    rawImpactsById: new Map(),
    effectiveImpactsById: new Map(),
    riskReserveById: new Map(),
    coverageById: new Map(),
    clippedPlayerIds: [],
    objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
    objectiveCalibration: null,
    poolInvariant: false,
    uncertaintyStatus: "unavailable",
    reason,
  };
}

/**
 * Validate and shrink SwishIQ inputs before any exact candidate is scored.
 *
 * A `displayEligible: false` row is intentionally treated as unavailable: the
 * SwishIQ package has already identified it as below its own presentation floor.
 */
export function buildSwishIQImpactModel(players, evidence, {
  mode = "historical",
  expectedScope = null,
  inputOffsetsByPlayerId = null,
} = {}) {
  if (mode === "historical") {
    return {
      version: SWISHIQ_IMPACT_MODEL_VERSION,
      mode,
      available: false,
      applied: false,
      impactsById: new Map(),
      exactLineupResiduals: new Map(),
      missingPlayerIds: [],
      objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
      objectiveCalibration: null,
      poolInvariant: false,
      uncertaintyStatus: "unavailable",
      defensiveSignConvention: null,
      calibrationRequired: false,
      calibrationAvailable: false,
      reason: "The historical model was selected; possession-level SwishIQ evidence stayed separate.",
    };
  }
  if (!SWISHIQ_MODEL_MODES.includes(mode)) {
    return {
      version: SWISHIQ_IMPACT_MODEL_VERSION,
      mode,
      available: false,
      applied: false,
      impactsById: new Map(),
      exactLineupResiduals: new Map(),
      exactLineupConflicts: [],
      missingPlayerIds: [],
      objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
      objectiveCalibration: null,
      poolInvariant: false,
      uncertaintyStatus: "unavailable",
      defensiveSignConvention: null,
      calibrationRequired: false,
      calibrationAvailable: false,
      reason: "SwishIQ Impact model mode was invalid, so possession impact stayed disabled.",
    };
  }
  if (!Array.isArray(players) || players.length === 0
    || players.some(player => player === null || player === undefined
      || player.id === null || player.id === undefined || String(player.id).trim() === "")
    || new Set(players.map(player => String(player.id))).size !== players.length) {
    return {
      version: SWISHIQ_IMPACT_MODEL_VERSION,
      mode,
      available: false,
      applied: false,
      impactsById: new Map(),
      exactLineupResiduals: new Map(),
      exactLineupConflicts: [],
      missingPlayerIds: [],
      objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
      objectiveCalibration: null,
      poolInvariant: false,
      uncertaintyStatus: "unavailable",
      defensiveSignConvention: null,
      calibrationRequired: false,
      calibrationAvailable: false,
      reason: "SwishIQ Impact requires a nonempty player pool with unique IDs.",
    };
  }
  const calibrationGate = modelCalibrationGate(evidence);
  const normalizedObjectiveCalibration = normalizeObjectiveCalibration(evidence?.model);
  const expectedPooledScope = expectedScope?.evidenceScope === "pooled-window";
  const declaredPooledScope = evidence?.scope?.kind === "pooled-window";
  if (declaredPooledScope && !expectedScope) {
    calibrationGate.available = false;
    calibrationGate.reason = "Pooled SwishIQ evidence requires an explicit expectedScope acceptance before it can affect this solve.";
  }
  const expectedModelEndYear = expectedPooledScope
    ? Number(expectedScope?.evidenceWindowEndYear)
    : Number(expectedScope?.seasonEndYear);
  // Public SwishIQ responses never expose archive receipts or identity maps.
  // Their server-side projection is admissible only when the boundary has
  // already bound a validated public-derived provenance record. Private legacy
  // readers keep their existing source-validation receipt gate.
  const publicProjectionPassed = evidence?.publicProjection === true
    && evidence?.provenance?.kind === "public-derived"
    && evidence?.provenance?.calibrationStatus === "validated"
    && evidence?.package?.visibility === "public";
  const v3PublicProjection = publicProjectionPassed
    && evidence?.contractVersion === 3
    && evidence?.package?.visibility === "public"
    && /^[a-f0-9]{64}$/.test(String(evidence?.package?.packageManifestSha256 || ""))
    && /^[a-f0-9]{64}$/.test(String(evidence?.package?.lineupLabEvidenceSha256 || ""))
    && evidence?.model?.modelId === "swishiq-v3"
    && evidence?.model?.modelVersion === "weighted_ridge_offense_defense_rapm_v2"
    && evidence?.model?.fitScope === "exact-season-across-all-package-phases"
    && evidence?.model?.exactSeasonHoldoutStatus === "validated"
    && /^[a-f0-9]{64}$/.test(String(evidence?.model?.exactSeasonHoldoutEvidenceSha256 || ""))
    && evidence.model.exactSeasonHoldoutEvidenceSha256 === evidence.package.lineupLabEvidenceSha256;
  const knownRidgeModel = v3PublicProjection
    || evidence?.model?.modelVersion === "weighted_ridge_offense_defense_rapm_v2";
  const signConventionPassed = evidence?.model?.defensiveSignConvention === SWISHIQ_DEFENSIVE_SIGN_CONVENTION;
  const archivePassed = publicProjectionPassed
    || evidence?.archive?.sourceValidationPassed === true
    || evidence?.package?.sourceValidationPassed === true;
  const scopeYears = Array.isArray(evidence?.scope?.seasonStartYears)
    ? evidence.scope.seasonStartYears.map(Number)
    : [];
  const expectedYears = expectedPooledScope
    ? (Array.isArray(expectedScope?.evidenceWindowYears) ? expectedScope.evidenceWindowYears.map(Number) : [])
    : [];
  const scopeYearsValid = scopeYears.length > 0
    && scopeYears.every(year => Number.isInteger(year) && year >= 1947)
    && new Set(scopeYears).size === scopeYears.length;
  const expectedYearsValid = expectedPooledScope
    && expectedYears.length > 0
    && expectedYears.every(year => Number.isInteger(year) && year >= 1947)
    && new Set(expectedYears).size === expectedYears.length;
  const expectedSeasonEndYear = Number(expectedScope?.seasonEndYear);
  const expectedTeam = String(expectedScope?.team || "").trim();
  const expectedPhase = String(expectedScope?.seasonPhase ?? expectedScope?.selectedSeasonPhase ?? "").trim();
  const expectedScopeValid = !expectedScope || (Number.isInteger(expectedModelEndYear)
    && expectedModelEndYear >= 1948 && expectedTeam.length > 0 && expectedPhase.length > 0
    && (!expectedPooledScope || (Number.isInteger(expectedSeasonEndYear) && expectedSeasonEndYear >= 1948)));
  const scopeMatchesPooledWindow = expectedPooledScope
    ? expectedYearsValid && scopeYearsValid
      && evidence?.scope?.kind === "pooled-window"
      && Number(evidence?.scope?.seasonEndYear) === expectedModelEndYear
      && scopeYears.length === expectedYears.length
      && scopeYears.every((year, index) => year === expectedYears[index])
      && Number(evidence?.scope?.selectedSeasonEndYear) === Number(expectedScope?.seasonEndYear)
    : expectedScopeValid && scopeYearsValid
      && evidence?.scope?.kind === "exact-season"
      && Number(evidence?.scope?.seasonEndYear) === Number(expectedScope?.seasonEndYear)
      && Number(evidence?.scope?.selectedSeasonEndYear) === Number(expectedScope?.seasonEndYear)
      && evidence?.scope?.selectedSeasonPhase === (expectedScope?.seasonPhase ?? expectedScope?.selectedSeasonPhase)
      && Array.isArray(evidence?.scope?.seasonStartYears)
      && evidence.scope.seasonStartYears.length === 1
      && Number(evidence.scope.seasonStartYears[0]) === Number(expectedScope?.seasonEndYear) - 1;
  const packagePinsMatch = [
    ["packageId", evidence?.package?.packageId, expectedScope?.packageId],
    ["packageVersion", evidence?.package?.packageVersion, expectedScope?.packageVersion],
    ["packageManifestSha256", evidence?.package?.packageManifestSha256, expectedScope?.packageManifestSha256],
    ["sourceLockSha256", evidence?.package?.sourceLockSha256, expectedScope?.sourceLockSha256],
    ["modelId", evidence?.package?.modelId, expectedScope?.modelId],
    ["normalizer", evidence?.package?.normalizer, expectedScope?.normalizer],
    ["metricsVersion", evidence?.package?.metricsVersion, expectedScope?.metricsVersion],
    ["registryVersion", evidence?.package?.registryVersion, expectedScope?.registryVersion],
    ["registryRevisionSha256", evidence?.package?.registryRevisionSha256, expectedScope?.registryRevisionSha256],
    ["projectionContentSha256", evidence?.package?.projectionContentSha256, expectedScope?.projectionContentSha256],
  ].every(([key, actual, expected]) => typeof expected === "string" && expected.length > 0 && actual === expected);
  if (v3PublicProjection && (expectedPooledScope || expectedScope?.evidenceScope !== "exact-season"
    || !expectedScope || !expectedScopeValid || !scopeMatchesPooledWindow || !packagePinsMatch)) {
    calibrationGate.available = false;
    calibrationGate.reason = "SwishIQ V3 impact requires an exact selected team-season-phase and matching package revision.";
  }
  if (expectedScope && (!expectedScopeValid || (evidence?.contractVersion !== 1 && evidence?.contractVersion !== 2 && !v3PublicProjection)
    || !archivePassed
    || evidence?.scope?.team !== expectedScope.team
    || !scopeMatchesPooledWindow
    || Number(evidence?.model?.seasonEndYear) !== expectedModelEndYear
    || (v3PublicProjection && (!expectedScopeValid || !packagePinsMatch))
    || (!v3PublicProjection
      && evidence?.model?.seasonPhase !== "regular_in_season_tournament_play_in_playoffs_official_franchise_sportradar-nba-lineup-reconstruction-v3_possession_start_lineups"))) {
    calibrationGate.available = false;
    calibrationGate.reason = expectedPooledScope
        ? "Advanced impact evidence did not match this team or the approved pooled 2017–26 package scope."
        : "Advanced impact evidence did not match this team, season, and explicitly combined-season model scope.";
  }
  if (knownRidgeModel && !signConventionPassed) {
    calibrationGate.available = false;
    calibrationGate.reason = "SwishIQ Impact did not declare the supported defensive sign convention, so its offense/defense values stayed disabled.";
  }
  if (!calibrationGate.available) {
    return {
      version: SWISHIQ_IMPACT_MODEL_VERSION,
      mode,
      available: false,
      applied: false,
      impactsById: new Map(),
      exactLineupResiduals: new Map(),
      missingPlayerIds: [],
      objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
      objectiveCalibration: null,
      poolInvariant: false,
      uncertaintyStatus: "unavailable",
      defensiveSignConvention: evidence?.model?.defensiveSignConvention ?? null,
      calibrationRequired: calibrationGate.required,
      calibrationAvailable: false,
      reason: calibrationGate.reason,
    };
  }
  const rows = evidence?.players;
  // Published Impact evidence rows are already ridge-regularized even if a
  // transport adapter has not added the older per-row `alreadyRegularized`
  // flag. Model identity plus the gates above are authoritative; a reliability
  // proxy is not a second fitted penalty or a player-specific confidence
  // interval.
  const ridgeModel = knownRidgeModel;
  const impactsById = new Map();
  const missingPlayerIds = [];
  for (const player of players) {
    const row = playerEvidence(rows, player.id);
    const offense = impactValue(row, "offense");
    const defense = impactValue(row, "defense");
    const scalarReliability = reliabilityValue(row);
    const reliabilityByComponent = {
      offense: componentReliabilityValue(row, "offense", scalarReliability),
      defense: componentReliabilityValue(row, "defense", scalarReliability),
    };
    const hasCompleteComponentReliability = Object.values(reliabilityByComponent).every(value => value !== null);
    const reliability = scalarReliability ?? (hasCompleteComponentReliability
      ? Math.min(...Object.values(reliabilityByComponent))
      : null);
    if (
      (ridgeModel ? row?.displayEligible !== true : row?.displayEligible === false) ||
      offense === null ||
      defense === null ||
      Math.abs(offense) > IMPACT_PER100_LIMIT ||
      Math.abs(defense) > IMPACT_PER100_LIMIT ||
      !hasCompleteComponentReliability ||
      reliability === null
    ) {
      missingPlayerIds.push(player.id);
      continue;
    }
    const uncertainty = confidenceProxy(row);
    const modeledOffense = ridgeModel || row.alreadyRegularized === true ? offense : offense * reliability;
    const modeledDefense = ridgeModel || row.alreadyRegularized === true ? defense : defense * reliability;
    const suppliedOffset = inputOffsetsByPlayerId?.[player.id] || {};
    const offenseOffset = finite(suppliedOffset.offense) ?? 0;
    const defenseOffset = finite(suppliedOffset.defense) ?? 0;
    if (Math.abs(modeledOffense + offenseOffset) > IMPACT_PER100_LIMIT
      || Math.abs(modeledDefense + defenseOffset) > IMPACT_PER100_LIMIT) {
      missingPlayerIds.push(player.id);
      continue;
    }
    impactsById.set(player.id, {
      // Preserve separate offense and defense so the user's priorities can
      // choose their mix. Only legacy unregularized values use the old proxy.
      offense: modeledOffense + offenseOffset,
      defense: modeledDefense + defenseOffset,
      reliability,
      reliabilityByComponent,
      rawOffense: offense,
      rawDefense: defense,
      inputOffsetByComponent: { offense: offenseOffset, defense: defenseOffset },
      pairedPossessions: uncertainty.pairedPossessions,
      rawPairedPossessions: uncertainty.rawPairedPossessions,
      uncertainty,
      coverage: row?.coverage ?? null,
    });
  }

  const exactLineupResiduals = new Map();
  const exactLineupKeysSeen = new Set();
  const exactLineupConflicts = [];
  // V3 observed-combination rows are descriptive evidence, never chemistry or
  // a player-impact adjustment. The separately gated exact-five signal is an
  // uncalibrated, source-only private hybrid experiment; no public V3 binding
  // supplies this field, and the V3 branch ignores it even if injected.
  for (const row of v3PublicProjection || !Array.isArray(evidence?.exactLineups) ? [] : evidence.exactLineups) {
    const ids = Array.isArray(row?.playerIds) ? row.playerIds.map(String).sort() : [];
    const key = ids.length === 5 && new Set(ids).size === 5 ? ids.join("\u0001") : null;
    if (key && exactLineupKeysSeen.has(key)) {
      // Never let source order choose between competing residual estimates for
      // the same five. The group signal is optional context, so an ambiguous
      // duplicate is withheld instead of silently replacing the first row.
      exactLineupConflicts.push(key);
      exactLineupResiduals.delete(key);
      continue;
    }
    if (key) exactLineupKeysSeen.add(key);
    const source = row?.projection && typeof row.projection === "object"
      ? row.projection
      : row;
    const status = String(source?.status ?? "available").trim().toLowerCase();
    const directResidual = finite(source?.residual ?? source?.lineupResidual);
    const shrunkResidual = finite(source?.shrunkSynergyPer100);
    const reliability = reliabilityValue(source?.reliability) ?? reliabilityValue(source);
    let residual = null;
    let sourceKind = null;
    if (directResidual !== null && reliability !== null) {
      // Legacy/direct values are not known to be pre-shrunk, so apply the
      // supplied reliability exactly once.
      residual = directResidual * reliability;
      sourceKind = "direct-reliability-shrunk";
    } else if (
      shrunkResidual !== null &&
      status === "available" &&
      source?.reliability?.publishable === true
    ) {
      // Package projections have already applied their possession prior. Do
      // not multiply by reliability again; doing so would double-shrink the
      // same evidence. The publishable gate blocks tiny exact-five samples.
      residual = shrunkResidual;
      sourceKind = "package-already-shrunk";
    }
    if (key && residual !== null) {
      exactLineupResiduals.set(key, { residual, sourceKind });
    }
  }
  const available = missingPlayerIds.length === 0 && impactsById.size === players.length;
  const objectiveCalibration = normalizedObjectiveCalibration;
  const uncertaintyStatuses = [...impactsById.values()].map(row => row.uncertainty?.status).filter(Boolean);
  return {
    version: SWISHIQ_IMPACT_MODEL_VERSION,
    mode,
    available,
    applied: available,
    impactsById,
    exactLineupResiduals,
    exactLineupConflicts,
    missingPlayerIds,
    calibrationRequired: calibrationGate.required,
    calibrationAvailable: calibrationGate.available,
    calibration: evidence?.model?.calibration ?? null,
    objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
    objectiveCalibration,
    poolInvariant: mode === "swishiq-impact",
    objectiveDisplayCalibrationStatus: objectiveCalibration
      ? "fixed-reference-display"
      : Object.prototype.hasOwnProperty.call(evidence?.model || {}, "objectiveCalibration")
        ? "ignored-invalid-display-metadata"
        : "pool-relative-display",
    defensiveSignConvention: evidence?.model?.defensiveSignConvention ?? null,
    uncertaintyStatus: uncertaintyStatuses.length && uncertaintyStatuses.every(status => status === "calibrated")
      ? "calibrated"
      : uncertaintyStatuses.some(status => status === "partial")
        ? "partial"
        : uncertaintyStatuses.some(status => status === "mixed")
          ? "mixed"
          : uncertaintyStatuses.some(status => status === "proxy") ? "proxy" : "unavailable",
    scope: evidence?.scope ?? null,
    reason: available
      ? v3PublicProjection
        ? "Verified SwishIQ Impact is available for every eligible player; public values are already regularized."
        : "Validated possession impact is available for every eligible player; ridge coefficients are not shrunk twice."
      : v3PublicProjection
        ? "SwishIQ Impact requires complete comparable evidence for every eligible player; missing rows were not imputed as zero."
        : "SwishIQ Impact requires comparable possession evidence for every eligible player; missing rows were not imputed as zero.",
  };
}

/**
 * Build the player-minute objective and its separate presentation scale.
 *
 * Primary SwishIQ combines fitted O/D coefficients using the user's continuous
 * preference weights without clipping or pool-normalizing them. A common
 * offset is used only to satisfy the allocator's non-negative score contract,
 * then restored in the reported objective. Bounded calibration is display-only.
 * `baseScoresById` is context only in primary SwishIQ. Legacy hybrid experiments
 * retain their explicitly separate percentile blend for reproducibility.
 */
export function buildSwishIQMinuteObjective(
  players,
  model,
  baseScoresById,
  { offenseWeight = 0.5, defenseWeight = 0.5, riskProfile = "mean" } = {},
) {
  const bases = new Map();
  const primaryImpactMode = model?.mode === "swishiq-impact";
  let neutralBaseCount = 0;
  for (const player of players) {
    const base = finite(mapValue(baseScoresById, player.id));
    // Primary Impact is a self-contained evidence objective. A caller that
    // only has accepted O/D evidence must not be blocked by an unrelated
    // Historical box-score score. Keep a neutral value solely for the
    // adjustment/readout fields; the primary score below does not blend it.
    if (base === null && primaryImpactMode) {
      bases.set(player.id, 0.5);
      neutralBaseCount += 1;
      continue;
    }
    if (base === null || base < 0 || base > 1) {
      return emptyMinuteObjective(bases, "The base minute objective was incomplete, so SwishIQ Impact did not alter allocation.");
    }
    bases.set(player.id, base);
  }
  if (!["mean", "reliable", "upside"].includes(riskProfile)) {
    return emptyMinuteObjective(bases, "SwishIQ Impact risk profile must be mean, reliable, or upside.");
  }
  if (!model?.applied) return emptyMinuteObjective(bases, model?.reason || "SwishIQ Impact evidence unavailable.");

  // Do not silently turn malformed programmatic inputs into a balanced
  // objective. The UI resolver validates its own controls, but this exported
  // model boundary is also used by replays and tests, where fail-closed is
  // safer than inventing a user preference.
  const requestedOffense = strictFinite(offenseWeight);
  const requestedDefense = strictFinite(defenseWeight);
  if (
    requestedOffense === null || requestedDefense === null
    || requestedOffense < 0 || requestedDefense < 0
    || requestedOffense + requestedDefense <= 0
  ) {
    return emptyMinuteObjective(bases, "SwishIQ Impact weights must be finite, nonnegative, and have a positive total.");
  }

  const weights = normalizedWeights(requestedOffense, requestedDefense);
  // Keep the exact preference attached to the model so a later candidate
  // readout cannot silently fall back to balanced weights.
  model.objectiveWeights = { offense: weights.offense, defense: weights.defense };
  // Candidate readouts are produced after the minute solve. Retain the
  // selected risk treatment on the model so those readouts can reconcile the
  // published coefficient view with the risk-adjusted objective that actually
  // ranked players. This is metadata only; it never changes the native
  // already-regularized coefficients.
  model.riskProfile = riskProfile;
  const rawImpactsById = new Map();
  const effectiveImpactsById = new Map();
  const riskReserveById = new Map();
  const riskReserveByComponentById = new Map();
  const proxyUpsideTrustById = new Map();
  const proxyUpsideTrustByComponentById = new Map();
  const coverageById = new Map();
  for (const player of players) {
    const impact = model.impactsById.get(player.id);
    if (!impact) return emptyMinuteObjective(bases, "One or more eligible players lacked SwishIQ Impact evidence.");
    rawImpactsById.set(
      player.id,
      (impact.offense * weights.offense) + (impact.defense * weights.defense),
    );
    const effective = riskAdjustedImpact(impact, riskProfile);
    effectiveImpactsById.set(player.id, effective);
    riskReserveById.set(player.id, effective.reserve);
    riskReserveByComponentById.set(player.id, effective.reserveByComponent);
    proxyUpsideTrustById.set(player.id, effective.proxyUpsideTrust);
    proxyUpsideTrustByComponentById.set(player.id, effective.proxyUpsideTrustByComponent);
    coverageById.set(player.id, { ...(impact.coverage || {}), pairedPossessions: impact.pairedPossessions, uncertainty: impact.uncertainty || null });
  }
  // Hybrid mode blends a SwishIQ percentile into the supplied base score.
  // That percentile must use the same exposure-adjusted impact that the
  // selected risk profile publishes to the objective; ranking raw impact here
  // made Reliable a display-only reserve and let low-minute outliers win the
  // hybrid blend. Mean remains numerically identical because effective === raw.
  const percentileImpactsById = riskProfile === "mean"
    ? rawImpactsById
    : new Map([...effectiveImpactsById.entries()].map(([id, impact]) => [id,
      (impact.offense * weights.offense) + (impact.defense * weights.defense),
    ]));
  const swishiqPercentilesById = percentileRanks(
    players.map((player) => ({ id: player.id, value: percentileImpactsById.get(player.id) })),
  );
  // SwishIQ is an O/D objective in its own right. The solver consumes the
  // continuous weighted coefficients; bounded fixed-reference or pool-relative
  // values below are a separate display scale. The legacy hybrid mode remains
  // experimental, never presented as calibrated.
  const objectiveCalibration = model.objectiveCalibration || null;
  const calibratedImpactsById = new Map([...effectiveImpactsById.entries()].map(([id, impact]) => [id,
    (impact.offense * weights.offense) + (impact.defense * weights.defense)]));
  // Only the display value is normalized. It uses the fixed reference when a
  // valid presentation calibration exists, otherwise the selected pool range.
  // Neither transform feeds `scoresById` or changes player ordering.
  const minimumImpact = Math.min(...calibratedImpactsById.values());
  const impactRange = Math.max(...calibratedImpactsById.values()) - minimumImpact;
  // Keep the exact Impact objective continuous. A common pool offset is used
  // only because the rotation allocator accepts non-negative score weights;
  // the offset is restored on the result, and therefore cannot change any
  // candidate ordering or objective gap. The bounded 0–1 transform remains a
  // distinct presentation value below.
  const objectiveOffset = primaryImpactMode && minimumImpact < 0 ? minimumImpact : 0;
  const blend = model.mode === "swishiq-impact" ? 1 : (SWISHIQ_BLEND_BY_MODE[model.mode] ?? 0);
  const scoresById = new Map();
  const displayScoresById = new Map();
  const adjustmentScoresById = new Map();
  const clippedPlayerIds = [];
  for (const player of players) {
    const base = bases.get(player.id);
    const swishiqPercentile = swishiqPercentilesById.get(player.id);
    const calibratedRaw = calibratedImpactsById.get(player.id);
    const fixedScore = objectiveCalibration ? objectiveDisplayScore(calibratedRaw, objectiveCalibration) : null;
    const displayImpactScore = fixedScore === null
      ? (impactRange > 1e-12 ? (calibratedRaw - minimumImpact) / impactRange : 0.5)
      : fixedScore;
    if (fixedScore !== null && (calibratedRaw < objectiveCalibration.center - objectiveCalibration.scalePer100 || calibratedRaw > objectiveCalibration.center + objectiveCalibration.scalePer100)) clippedPlayerIds.push(player.id);
    const solverImpactScore = calibratedRaw - objectiveOffset;
    const adjusted = model.mode === "swishiq-impact"
      ? solverImpactScore
      : clamp(base + (blend * (swishiqPercentile - base)), 0, 1);
    const displayAdjusted = model.mode === "swishiq-impact" ? displayImpactScore : adjusted;
    scoresById.set(player.id, adjusted);
    displayScoresById.set(player.id, displayAdjusted);
    adjustmentScoresById.set(player.id, adjusted - base);
  }
  return {
    applied: blend > 0,
    blend,
    offenseWeight: weights.offense,
    defenseWeight: weights.defense,
    scoresById,
    displayScoresById,
    objectiveOffset,
    adjustmentScoresById,
    swishiqPercentilesById,
    rawImpactsById,
    effectiveImpactsById: calibratedImpactsById,
    baseScoreStatus: neutralBaseCount > 0 ? "neutral-context" : "provided",
    neutralBaseCount,
    riskReserveById,
    riskReserveByComponentById,
    proxyUpsideTrustById,
    proxyUpsideTrustByComponentById,
    coverageById,
    clippedPlayerIds,
    displayClippedPlayerIds: clippedPlayerIds.slice(),
    objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
    solverScoreDomain: primaryImpactMode ? "continuous-weighted-impact-per-100" : "bounded-game-plan-fit",
    displayScoreDomain: "bounded-0-to-1-fit",
    objectiveCalibration,
    objectiveDisplayCalibrationStatus: model.objectiveDisplayCalibrationStatus || (objectiveCalibration
      ? "fixed-reference-display"
      : "pool-relative-display"),
    poolInvariant: primaryImpactMode,
    riskProfile,
    uncertaintyStatus: model.uncertaintyStatus || "unavailable",
    reason: model.mode === "swishiq-impact"
      ? objectiveCalibration
        ? `SwishIQ Impact uses continuous weighted offense / defense coefficients as the solver objective. Fixed-reference calibration (${objectiveCalibration.version}) is display-only; clipped display rows are disclosed.`
        : "SwishIQ Impact uses continuous weighted offense / defense coefficients as the solver objective. Its bounded display fit is pool-relative; Basketball Reference provides separate context and hard constraints."
      : blend > 0
      ? "Reliability-shrunk SwishIQ offense/defense percentiles were blended into the exact player-minute objective."
      : "The selected model mode does not apply SwishIQ evidence to minutes.",
  };
}

/**
 * Score a selected group only after its exact minute plan is known.
 *
 * `minuteScoreUnitsById` carries the same SwishIQ adjustment used by the minute
 * allocator. It may be linear minutes or the role-conditioned marginal minute
 * utility. That keeps the reported score aligned with the actual optimizer
 * instead of adding a candidate-wide RAPM bonus after allocation.
 */
export function scoreSwishIQCandidate(
  players,
  model,
  { minutesById = null, minuteScoreUnitsById = null } = {},
) {
  const empty = (reason) => ({
    applied: false,
    adjustmentPoints: 0,
    minuteAdjustmentPoints: 0,
    exactLineupAdjustmentPoints: 0,
    playerMinuteAdjustmentPointsById: {},
    impact: null,
    exactLineupResidual: null,
    objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
    objectiveCalibration: model?.objectiveCalibration || null,
    uncertaintyStatus: model?.uncertaintyStatus || "unavailable",
    coverage: null,
    reason,
    observedExactLineupContext: null,
  });
  if (!model?.applied) return empty(model?.reason || "SwishIQ Impact evidence unavailable.");
  const rows = players.map((player) => model.impactsById.get(player.id)).filter(Boolean);
  if (rows.length !== players.length) return empty("One or more selected players lacked SwishIQ Impact evidence.");

  const normalizedMinutes = new Map();
  for (const player of players) {
    const suppliedMinutes = minutesById !== null && minutesById !== undefined;
    const minutes = suppliedMinutes ? strictFinite(mapValue(minutesById, player.id)) : 48;
    if (minutes === null) return empty("SwishIQ Impact scoring requires a complete numeric minute plan.");
    normalizedMinutes.set(player.id, Math.max(0, minutes));
  }
  const totalMinutes = [...normalizedMinutes.values()].reduce((sum, minutes) => sum + minutes, 0);
  if (!(totalMinutes > 0)) return empty("SwishIQ Impact scoring requires a positive minute plan.");

  const playerMinuteAdjustmentPointsById = {};
  let minuteAdjustmentPoints = 0;
  for (const player of players) {
    const units = finite(mapValue(minuteScoreUnitsById, player.id));
    // A direct caller that has not built the minute objective gets no SwishIQ
    // player bonus. This safe default avoids the old post-selection average.
    const contribution = units === null ? 0 : (units / totalMinutes) * 100;
    playerMinuteAdjustmentPointsById[player.id] = contribution;
    minuteAdjustmentPoints += contribution;
  }

  let exactLineupResidual = null;
  let exactLineupAdjustmentPoints = 0;
  let exactLineupSource = null;
  let observedExactLineupContext = null;
  if (players.length === 5) {
    const key = players.map((player) => String(player.id)).sort().join("\u0001");
    const evidence = model.exactLineupResiduals.get(key);
    if (evidence) {
      const applied = model.mode !== "swishiq-impact";
      observedExactLineupContext = {
        residualPer100: evidence.residual,
        source: evidence.sourceKind,
        applied,
        treatment: applied ? "capped-additive-adjustment" : "context-only",
        reason: applied
          ? "The verified exact-five residual was added as a separately capped hybrid adjustment."
          : "The observed exact-five residual is shown as context only; primary SwishIQ uses validated player O/D RAPM until an independent incremental holdout validates the group signal.",
      };
      if (applied) {
        exactLineupResidual = evidence.residual;
        // The residual is already on a per-100-possession scale. Keep its
        // contribution intentionally smaller than the full player-minute blend
        // and cap it separately so one historical five cannot overwhelm a fan's
        // stated objective.
        const scale = 0.625;
        const limit = 1.5;
        exactLineupAdjustmentPoints = clamp(exactLineupResidual * scale, -limit, limit);
        exactLineupSource = evidence.sourceKind;
      }
    }
  }
  const adjustmentPoints = minuteAdjustmentPoints + exactLineupAdjustmentPoints;
  const riskProfile = ["mean", "reliable", "upside"].includes(model.riskProfile) ? model.riskProfile : "mean";
  const adjustedRowsById = new Map(players.map(player => {
    const row = model.impactsById.get(player.id);
    return [player.id, riskAdjustedImpact(row, riskProfile)];
  }));
  const additiveImpact = side => players.reduce((sum, player) => sum + model.impactsById.get(player.id)[side] * normalizedMinutes.get(player.id) / 48, 0);
  const riskAdjustedAdditiveImpact = side => players.reduce((sum, player) => sum + adjustedRowsById.get(player.id)[side] * normalizedMinutes.get(player.id) / 48, 0);
  const objectiveWeights = model.objectiveWeights || { offense: .5, defense: .5 };
  const coverageRows = players.map(player => model.impactsById.get(player.id)?.uncertainty).filter(Boolean);
  const uncertaintyValues = coverageRows.map(row => row.uncertaintyPer100).filter(value => finite(value) !== null);
  return {
    applied: true,
    adjustmentPoints,
    minuteAdjustmentPoints,
    exactLineupAdjustmentPoints,
    playerMinuteAdjustmentPointsById,
    // `impact` remains a compact compatibility/readout field. It represents
    // the completed minute objective in score points, not an unscaled RAPM.
    impact: minuteAdjustmentPoints,
    exactLineupResidual,
    exactLineupSource,
    observedExactLineupContext,
    riskProfile,
    objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION,
    objectiveCalibration: model.objectiveCalibration || null,
    uncertaintyStatus: model.uncertaintyStatus || "unavailable",
    coverage: {
      playerCount: players.length,
      calibratedCount: coverageRows.filter(row => row.status === "calibrated").length,
      proxyCount: coverageRows.filter(row => row.status === "proxy").length,
      mixedCount: coverageRows.filter(row => row.status === "mixed").length,
      partialCount: coverageRows.filter(row => row.status === "partial").length,
      unavailableCount: coverageRows.filter(row => row.status === "unavailable").length,
      uncertaintyPer100: uncertaintyValues.length ? {
        minimum: Math.min(...uncertaintyValues),
        maximum: Math.max(...uncertaintyValues),
        average: uncertaintyValues.reduce((sum, value) => sum + value, 0) / uncertaintyValues.length,
      } : null,
      riskReservePer100: {
        offense: additiveImpact("offense") - riskAdjustedAdditiveImpact("offense"),
        defense: additiveImpact("defense") - riskAdjustedAdditiveImpact("defense"),
      },
    },
    // Selection explanations need the objective actually used, not unrelated
    // high box-score percentiles. Keep coefficients separate from exposure-
    // weighted contributions; their sums reconcile to the full O/D readout.
    // Minutes/48 approximates possession share, not a causal usage response.
    playerImpactContributionsById: Object.fromEntries(players.map(player => {
      const row = model.impactsById.get(player.id);
      const minutes = normalizedMinutes.get(player.id);
      const offense = row.offense * minutes / 48;
      const defense = row.defense * minutes / 48;
      const effective = adjustedRowsById.get(player.id);
      const riskAdjustedOffense = effective.offense * minutes / 48;
      const riskAdjustedDefense = effective.defense * minutes / 48;
      return [player.id, {
        offenseCoefficient: row.offense, defenseCoefficient: row.defense,
        minutes, offense, defense, riskAdjustedOffense, riskAdjustedDefense,
        offenseReserve: offense - riskAdjustedOffense,
        defenseReserve: defense - riskAdjustedDefense,
        reliability: row.reliability,
        uncertaintyStatus: row.uncertainty?.status || "unavailable",
        preferenceWeighted: offense * objectiveWeights.offense + defense * objectiveWeights.defense,
        riskAdjustedPreferenceWeighted: riskAdjustedOffense * objectiveWeights.offense + riskAdjustedDefense * objectiveWeights.defense,
      }];
    })),
    // These are sums of player coefficients at approximate possession shares,
    // not validated forecasts for an unseen rotation or an opponent matchup.
    additiveImpactPer100: {
      offense: additiveImpact("offense"), defense: additiveImpact("defense"),
      net: additiveImpact("offense") + additiveImpact("defense"),
      preferenceWeighted: additiveImpact("offense") * objectiveWeights.offense + additiveImpact("defense") * objectiveWeights.defense,
      riskAdjusted: {
        offense: riskAdjustedAdditiveImpact("offense"),
        defense: riskAdjustedAdditiveImpact("defense"),
        net: riskAdjustedAdditiveImpact("offense") + riskAdjustedAdditiveImpact("defense"),
        preferenceWeighted: riskAdjustedAdditiveImpact("offense") * objectiveWeights.offense + riskAdjustedAdditiveImpact("defense") * objectiveWeights.defense,
      },
      objectiveWeights: { offense: objectiveWeights.offense, defense: objectiveWeights.defense },
      preferenceLabel: "User-weighted additive O/D impact; preference utility, not predicted net rating",
      label: "Additive player-impact estimate; not a game forecast",
      validatedLineupForecast: false,
    },
    reason: exactLineupResidual === null
      ? "SwishIQ player impact was applied through the exact minute objective."
      : "SwishIQ player impact was applied through exact minutes; a verified publishable exact-five residual was added separately.",
  };
}

function normalizeSensitivityScenario(scenario, index) {
  const id = typeof scenario?.id === "string" && scenario.id.trim() ? scenario.id.trim() : `scenario-${index + 1}`;
  const source = scenario?.weights && typeof scenario.weights === "object" ? scenario.weights : scenario;
  const offense = strictFinite(source?.offense), defense = strictFinite(source?.defense);
  if (offense === null || defense === null || offense < 0 || defense < 0 || offense + defense <= 0) {
    return { id, ok: false, reason: "Sensitivity weights need nonnegative offense and defense values with a positive total." };
  }
  const weights = normalizedWeights(offense, defense);
  return { id, ok: true, weights };
}

/**
 * Compare explicit O/D preference scenarios without invoking or mutating the
 * lineup optimizer. This is a model-level sensitivity report: it shows how
 * the impact ordering changes before roster/role/minute constraints are
 * applied, so it cannot be mistaken for a second feasible solve.
 */
export function analyzeSwishIQImpactSensitivity(players, model, scenarios = [], { topN = 5, riskProfile = "mean" } = {}) {
  if (!model?.applied) return { ok: false, status: "unavailable", reason: model?.reason || "SwishIQ Impact evidence unavailable.", scenarios: [] };
  if (!Array.isArray(scenarios) || scenarios.length === 0) return { ok: false, status: "invalid", reason: "Provide at least one explicit offense/defense weight scenario.", scenarios: [] };
  if (!Number.isSafeInteger(topN) || topN < 1 || topN > players.length) return { ok: false, status: "invalid", reason: "topN must be a positive integer within the player pool.", scenarios: [] };
  if (!["mean", "reliable", "upside"].includes(riskProfile)) return { ok: false, status: "invalid", reason: "riskProfile must be mean, reliable, or upside.", scenarios: [] };
  const normalized = scenarios.map(normalizeSensitivityScenario);
  if (normalized.some(item => !item.ok)) return { ok: false, status: "invalid", reason: normalized.find(item => !item.ok).reason, scenarios: normalized };
  const scenarioIds = normalized.map(item => item.id);
  if (new Set(scenarioIds).size !== scenarioIds.length) return { ok: false, status: "invalid", reason: "Sensitivity scenario IDs must be unique.", scenarios: normalized };
  const playerIds = players.map(player => String(player?.id));
  if (players.some(player => player === null || player === undefined || player.id === null || player.id === undefined)
    || new Set(playerIds).size !== playerIds.length) {
    return { ok: false, status: "invalid", reason: "Sensitivity requires a player pool with unique IDs.", scenarios: [] };
  }
  const rows = players.map(player => ({ id: player.id, impact: model.impactsById.get(player.id) })).filter(row => row.impact);
  if (rows.length !== players.length) return { ok: false, status: "invalid", reason: "One or more players lack SwishIQ Impact evidence.", scenarios: [] };
  const calibration = model.objectiveCalibration || null;
  const results = normalized.map(item => {
    const rawRows = rows.map(({ id, impact }) => {
      const effective = riskAdjustedImpact(impact, riskProfile);
      const raw = effective.offense * item.weights.offense + effective.defense * item.weights.defense;
      return { id, rawImpact: raw };
    });
    const minimum = Math.min(...rawRows.map(row => row.rawImpact));
    const range = Math.max(...rawRows.map(row => row.rawImpact)) - minimum;
    const scored = rawRows.map(row => ({
      ...row,
      objectiveValue: row.rawImpact,
      // Keep the compatibility key, but make it the unclipped objective;
      // `displayScore` is the separate bounded presentation value.
      objectiveScore: row.rawImpact,
      displayScore: calibration
        ? objectiveDisplayScore(row.rawImpact, calibration)
        : range > 1e-12 ? (row.rawImpact - minimum) / range : 0.5,
    })).sort((a, b) => b.objectiveValue - a.objectiveValue || compareIds(a.id, b.id));
    const rankById = Object.fromEntries(scored.map((row, rank) => [row.id, rank + 1]));
    return { id: item.id, weights: item.weights, riskProfile, ranking: scored.map((row, rank) => ({ ...row, rank: rank + 1 })), rankById, topPlayerIds: scored.slice(0, topN).map(row => row.id) };
  });
  const baseline = results[0];
  const comparisons = results.map(result => {
    const flips = players.filter(player => baseline.rankById[player.id] !== result.rankById[player.id]).map(player => ({ playerId: player.id, baselineRank: baseline.rankById[player.id], scenarioRank: result.rankById[player.id], delta: result.rankById[player.id] - baseline.rankById[player.id] }));
    const baselineTop = new Set(baseline.topPlayerIds), scenarioTop = new Set(result.topPlayerIds), intersection = [...baselineTop].filter(id => scenarioTop.has(id)).length;
    return { id: result.id, rankFlips: flips, rankFlipCount: flips.length, topSetOverlap: topN ? intersection / topN : null, topSetStable: intersection === topN };
  });
  return { ok: true, status: "complete", objectiveVersion: SWISHIQ_IMPACT_OBJECTIVE_VERSION, objectiveCalibration: calibration,
    objectiveDisplayCalibrationStatus: calibration ? "fixed-reference-display" : "pool-relative-display",
    poolInvariant: true, baselineScenarioId: baseline.id, scenarios: results, comparisons,
    note: "Sensitivity changes only the explicit O/D preference and risk profile. It does not rerun or mutate the constrained lineup optimizer." };
}

/**
 * Reconcile the minute objective and selected-candidate readout. This is a
 * diagnostic gate, not a new scoring path; violations make the report
 * auditable without silently repairing a mismatched result.
 */
export function auditSwishIQObjective(players, model, minuteObjective, minutesById = null) {
  const violations = [];
  if (!model?.applied) violations.push("model-not-applied");
  if (!minuteObjective || typeof minuteObjective !== "object") violations.push("minute-objective-missing");
  const expectedVersion = SWISHIQ_IMPACT_OBJECTIVE_VERSION;
  if (minuteObjective && minuteObjective.objectiveVersion && minuteObjective.objectiveVersion !== expectedVersion) violations.push("objective-version-mismatch");
  if (model?.objectiveCalibration && minuteObjective?.objectiveCalibration && JSON.stringify(model.objectiveCalibration) !== JSON.stringify(minuteObjective.objectiveCalibration)) violations.push("objective-calibration-mismatch");
  if (model?.defensiveSignConvention && model.defensiveSignConvention !== SWISHIQ_DEFENSIVE_SIGN_CONVENTION) violations.push("defensive-sign-convention");
  const weights = { offense: finite(model?.objectiveWeights?.offense) ?? finite(minuteObjective?.offenseWeight) ?? 0.5, defense: finite(model?.objectiveWeights?.defense) ?? finite(minuteObjective?.defenseWeight) ?? 0.5 };
  const normalized = normalizedWeights(weights.offense, weights.defense);
  let expectedOffense = 0, expectedDefense = 0, expectedWeighted = 0, totalMinutes = 0;
  const contributions = {};
  for (const player of players || []) {
    const row = model?.impactsById?.get(player.id);
    if (!row) { violations.push(`missing-player:${player.id}`); continue; }
    const minutes = Math.max(0, finite(mapValue(minutesById, player.id)) ?? 48);
    const offense = row.offense * minutes / 48, defense = row.defense * minutes / 48;
    expectedOffense += offense; expectedDefense += defense; expectedWeighted += offense * normalized.offense + defense * normalized.defense; totalMinutes += minutes;
    contributions[player.id] = { minutes, offense, defense, preferenceWeighted: offense * normalized.offense + defense * normalized.defense };
  }
  if (minuteObjective?.effectiveImpactsById && minuteObjective.effectiveImpactsById.size !== (players || []).length) violations.push("effective-impact-cardinality");
  const reported = minuteObjective?.reportedContribution || null;
  const tolerance = 1e-8;
  if (reported && Math.abs((reported.offense || 0) - expectedOffense) > tolerance) violations.push("offense-reconciliation");
  if (reported && Math.abs((reported.defense || 0) - expectedDefense) > tolerance) violations.push("defense-reconciliation");
  return { status: violations.length ? "violations" : "valid", objectiveVersion: expectedVersion, objectiveCalibration: minuteObjective?.objectiveCalibration || model?.objectiveCalibration || null,
    poolInvariant: Boolean(minuteObjective?.poolInvariant || model?.poolInvariant), weights: normalized, totalMinutes, expected: { offense: expectedOffense, defense: expectedDefense, net: expectedOffense + expectedDefense, preferenceWeighted: expectedWeighted }, reported, contributions,
    clippedPlayerIds: minuteObjective?.clippedPlayerIds || [],
    displayClippedPlayerIds: minuteObjective?.displayClippedPlayerIds || minuteObjective?.clippedPlayerIds || [],
    violations, note: violations.length ? "The SwishIQ objective did not fully reconcile; no value was imputed." : "Weighted offense/defense minute contributions reconcile to the selected objective." };
}

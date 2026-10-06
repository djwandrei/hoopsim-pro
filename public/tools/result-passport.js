/**
 * Shared, browser-safe scenario and result contracts for fan tools.
 *
 * The contract deliberately keeps three things separate:
 *   1. a Scenario Envelope (what was requested),
 *   2. a native outcome (the unit the model actually supports), and
 *   3. decision points (a small game reward for how a legal choice ranked).
 *
 * This module does not calculate a basketball forecast. It validates and
 * packages already-calculated values so Lineup Lab and the fixed-board games
 * can render the same result shape. Legacy `roundScore` payloads are retained
 * under an explicit compatibility object and are never treated as a native
 * performance metric.
 */

export const SCENARIO_ENVELOPE_VERSION = 1;
export const RESULT_PASSPORT_VERSION = 1;
/** Version for the public evidence metadata carried by a Result Passport. */
export const RESULT_EVIDENCE_VERSION = 1;
export const POINT_RULE_VERSION = "swishiq-game-points-v2";
export const PREVIOUS_POINT_RULE_VERSION = "swishiq-game-points-v1";
export const POINT_RULE_V2_START_SEED = "2026-09-29";
export const LEGACY_POINT_RULE_VERSION = "native-decision-points-v1";
export const DEFAULT_GAME_POINT_TIERS = Object.freeze([
  Object.freeze({ minimumPercentile: 0.9, points: 9 }),
  Object.freeze({ minimumPercentile: 0.8, points: 8 }),
  Object.freeze({ minimumPercentile: 0.7, points: 7 }),
  Object.freeze({ minimumPercentile: 0.6, points: 6 }),
  Object.freeze({ minimumPercentile: 0.5, points: 5 }),
  Object.freeze({ minimumPercentile: 0.4, points: 4 }),
  Object.freeze({ minimumPercentile: 0.3, points: 3 }),
  Object.freeze({ minimumPercentile: 0.2, points: 2 }),
  Object.freeze({ minimumPercentile: 0.1, points: 1 }),
  Object.freeze({ minimumPercentile: 0, points: 0 }),
]);
const PREVIOUS_GAME_POINT_TIERS = Object.freeze([
  Object.freeze({ minimumPercentile: 0.75, points: 3 }),
  Object.freeze({ minimumPercentile: 0.5, points: 2 }),
  Object.freeze({ minimumPercentile: 0.25, points: 1 }),
  Object.freeze({ minimumPercentile: 0, points: 0 }),
]);

export const RESULT_STATUSES = Object.freeze([
  "running",
  "cancelled",
  "complete",
  "invalid-input",
  "infeasible",
  "unavailable",
]);

const SCENARIO_KINDS = new Set([
  "lineup",
  "rotation",
  "fix-the-five",
  "draft-night",
  "game",
  "season",
  "composite",
  "career",
]);

const PRIVATE_KEY = /(?:^|[_-])(access[_-]?token|api[_-]?key|auth|coefficient|crosswalk|credential|password|private|provider(?:id|ids)?|raw(?:archive|data)?|secret|source|token)(?:$|[_-])/i;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_STRING = 240;
const MAX_ARRAY = 128;
const MAX_DEPTH = 6;
const MAX_METRICS = 32;
const METRIC_KEY = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const EVIDENCE_TEXT_MAX = 320;
const EVIDENCE_NOTES_MAX = 8;
const PRIVATE_EVIDENCE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = value => typeof value === "number" && Number.isFinite(value);

function fail(message) {
  throw new TypeError(message);
}

function cleanString(value, label, { required = false, pattern = null, max = MAX_STRING } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  const text = String(value).trim();
  if (!text || text.length > max) fail(`${label} must be a non-empty string of at most ${max} characters.`);
  if (pattern && !pattern.test(text)) fail(`${label} contains unsupported characters.`);
  return text;
}

function cleanId(value, label) {
  return cleanString(value, label, { required: true, pattern: ID_PATTERN });
}

function cleanHash(value, label) {
  return cleanString(value, label, { pattern: HASH_PATTERN });
}

function cleanNumber(value, label, { integer = false, minimum = -Infinity, maximum = Infinity } = {}) {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    fail(`${label} must be a finite ${integer ? "integer" : "number"} in the supported range.`);
  }
  return number;
}

function cleanMetricMap(value, label) {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value)) fail(`${label} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length > MAX_METRICS) fail(`${label} contains too many metrics.`);
  const result = {};
  for (const [key, metric] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!METRIC_KEY.test(key)) fail(`${label} contains an unsupported metric name.`);
    if (metric === null || metric === undefined) {
      result[key] = null;
      continue;
    }
    result[key] = cleanNumber(metric, `${label}.${key}`);
  }
  return result;
}

function clonePublic(value, depth = 0) {
  if (depth > MAX_DEPTH) fail("Scenario metadata is too deeply nested.");
  // Optional contract fields are assembled by several callers. Omit an
  // undefined field rather than treating it as an unsupported public value;
  // null remains meaningful and is preserved below.
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > MAX_STRING) fail("Scenario text is too long.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Scenario metadata contains a non-finite number.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY) fail("Scenario metadata contains too many entries.");
    return value.map(item => clonePublic(item, depth + 1));
  }
  if (!isObject(value)) fail("Scenario metadata contains an unsupported value.");
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (PRIVATE_KEY.test(key)) continue;
    if (value[key] === undefined) continue;
    result[key] = clonePublic(value[key], depth + 1);
  }
  return result;
}

function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Cannot hash a non-finite value.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  fail("Cannot hash an unsupported value.");
}

/** Return a deterministic non-secret identity hash for a canonical object. */
export function hashCanonical(value) {
  const text = stableStringify(value);
  let hash = 1469598103934665603n;
  const bytes = typeof TextEncoder === "function"
    ? new TextEncoder().encode(text)
    : Uint8Array.from(text, character => character.charCodeAt(0) & 0xff);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cleanIdList(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ARRAY) fail(`${label} must be an array of at most ${MAX_ARRAY} IDs.`);
  const ids = value.map((item, index) => cleanId(item, `${label}[${index}]`));
  if (new Set(ids).size !== ids.length) fail(`${label} cannot contain duplicate IDs.`);
  return ids.sort((left, right) => left.localeCompare(right));
}

function cleanPackageRef(value) {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) fail("packageRef must be an object.");
  const result = {};
  for (const [key, pattern] of [
    ["id", ID_PATTERN],
    ["format", HASH_PATTERN],
    ["version", HASH_PATTERN],
    ["registryVersion", HASH_PATTERN],
    ["registryRevisionSha256", /^[a-f0-9]{16,128}$/i],
    ["manifestSha256", /^[a-f0-9]{16,128}$/i],
    ["contentSha256", /^[a-f0-9]{16,128}$/i],
    ["projectionContentSha256", /^[a-f0-9]{16,128}$/i],
    ["sourceLockSha256", /^[a-f0-9]{16,128}$/i],
    ["modelId", HASH_PATTERN],
  ]) {
    const valuePart = key === "manifestSha256"
      ? cleanString(value[key], `packageRef.${key}`, { pattern })
      : cleanString(value[key], `packageRef.${key}`, { pattern });
    if (valuePart !== undefined) result[key] = valuePart;
  }
  if (!result.id || !result.version) fail("packageRef.id and packageRef.version are required together.");
  return result;
}

function cleanScenarioSection(value, label) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) fail(`${label} must be an object.`);
  return clonePublic(value);
}

function cleanEvidenceText(value, label) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  const normalized = cleanString(value, label, { max: EVIDENCE_TEXT_MAX });
  if (PRIVATE_EVIDENCE_TEXT.test(normalized)) fail(`${label} contains a private value.`);
  return normalized;
}

/**
 * Normalize the small, public evidence context used by Result Passport
 * renderers.  Evidence metadata is descriptive only: it never supplies a
 * model value, changes package pins, or turns an unavailable measure into a
 * placeholder.  Older producers may still send `label`, `note`, or a string
 * `source`; those aliases are mapped to the explicit public names below.
 *
 * The rest of an evidence object (for example the hash-bound `boardRef` and
 * `resultContract`) is retained through the same privacy filter used by the
 * Scenario Envelope.  Provider IDs, raw records, credentials, and other
 * private-shaped keys are therefore removed before a Passport can be exposed.
 */
export function normalizeResultEvidence(value, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) fail("Result Passport evidence is required.");
    return null;
  }
  if (!isObject(value)) fail("Result Passport evidence must be an object.");

  const sourceObject = isObject(value.source) ? value.source : null;
  const evidenceLabelInput = value.evidenceLabel ?? value.label
    ?? (typeof value.source === "string" ? value.source : sourceObject?.label ?? sourceObject?.name);
  const sourceNoteInput = value.sourceNote ?? value.note ?? sourceObject?.sourceNote ?? sourceObject?.note;
  const evidenceLabel = evidenceLabelInput === undefined
    ? undefined
    : cleanEvidenceText(evidenceLabelInput, "evidence.evidenceLabel");
  const sourceNote = sourceNoteInput === undefined
    ? undefined
    : cleanEvidenceText(sourceNoteInput, "evidence.sourceNote");

  let sourceNotes;
  const sourceNotesInput = value.sourceNotes ?? value.notes;
  if (sourceNotesInput !== undefined && sourceNotesInput !== null) {
    if (!Array.isArray(sourceNotesInput) || sourceNotesInput.length > EVIDENCE_NOTES_MAX) {
      fail(`evidence.sourceNotes must contain at most ${EVIDENCE_NOTES_MAX} notes.`);
    }
    sourceNotes = sourceNotesInput.map((note, index) => cleanEvidenceText(note, `evidence.sourceNotes[${index}]`));
  }

  if (value.evidenceVersion !== undefined
    && (!Number.isSafeInteger(value.evidenceVersion) || value.evidenceVersion !== RESULT_EVIDENCE_VERSION)) {
    fail("evidence.evidenceVersion is unsupported.");
  }

  // Clone arbitrary historical public pins while keeping canonical evidence
  // prose on its own bounded path. This avoids the shorter Scenario metadata
  // limit being applied twice to a deliberately bounded source note.
  const cloneInput = { ...value };
  delete cloneInput.label;
  delete cloneInput.note;
  delete cloneInput.source;
  delete cloneInput.notes;
  delete cloneInput.sourceNotes;
  delete cloneInput.evidenceLabel;
  delete cloneInput.sourceNote;
  const cloned = clonePublic(cloneInput);
  if (evidenceLabel !== undefined) cloned.evidenceLabel = evidenceLabel;
  if (sourceNote !== undefined) cloned.sourceNote = sourceNote;
  if (sourceNotes !== undefined) cloned.sourceNotes = sourceNotes;
  if (cloned.evidenceVersion === undefined && (evidenceLabel !== undefined || sourceNote !== undefined || sourceNotes !== undefined)) {
    cloned.evidenceVersion = RESULT_EVIDENCE_VERSION;
  }
  return cloned;
}

/**
 * Build the renderer-facing context without making a claim about missing
 * values.  This is intentionally a pure projection of accepted public
 * fields; callers may display the returned `Unavailable` labels, but must not
 * use them as numeric inputs.
 */
export function resultPassportEvidenceContext(passport) {
  const evidence = normalizeResultEvidence(passport?.evidence) || {};
  const native = isObject(passport?.nativeOutcome) ? passport.nativeOutcome : {};
  const replay = isObject(passport?.replay) ? passport.replay : {};
  const boardRef = isObject(evidence.boardRef) ? evidence.boardRef : {};
  const packageRef = isObject(boardRef.packageRef) ? boardRef.packageRef : {};
  const coverage = isObject(native.coverage) ? native.coverage : {};
  const uncertainty = isObject(native.uncertainty) ? native.uncertainty : {};
  const pick = (...values) => values.find(value => value !== undefined && value !== null && value !== "") ?? "Unavailable";
  return {
    evidenceLabel: pick(evidence.evidenceLabel, evidence.label, "Validated public evidence"),
    sourceNote: pick(evidence.sourceNote, ...(Array.isArray(evidence.sourceNotes) ? evidence.sourceNotes : []), "Hash-bound package and board pins; private model inputs remain private."),
    scope: pick(evidence.scope, native.scope, replay.scope, packageRef.scope),
    phase: pick(evidence.phase, native.phase, replay.phase, packageRef.phase),
    denominator: pick(evidence.denominator, coverage.denominator, Number.isInteger(coverage.observations) ? `${coverage.observations} observations` : undefined),
    coverage: pick(evidence.coverage, coverage.status === undefined ? undefined : `${coverage.status}${Number.isInteger(coverage.observations) ? ` · ${coverage.observations} observations` : ""}`),
    reliability: pick(evidence.reliability, native.reliability, native.state ? `Outcome state: ${native.state}` : undefined),
    uncertainty: pick(evidence.uncertainty, uncertainty.status === "interval" && Number.isFinite(uncertainty.lower) && Number.isFinite(uncertainty.upper)
      ? `${uncertainty.lower} to ${uncertainty.upper}${uncertainty.unit ? ` ${uncertainty.unit}` : ""}` : undefined),
  };
}

/**
 * Build an immutable, hashed Scenario Envelope from public-safe inputs.
 * Private/provider-shaped keys are dropped before hashing and never reach the
 * browser result contract.
 */
export function createScenarioEnvelope(input = {}) {
  if (!isObject(input)) fail("Scenario Envelope input must be an object.");
  const kind = cleanString(input.kind || input.scenarioKind, "scenario kind", { required: true });
  if (!SCENARIO_KINDS.has(kind)) fail(`Unsupported scenario kind: ${kind}.`);
  const envelope = {
    version: SCENARIO_ENVELOPE_VERSION,
    kind,
    packageRef: cleanPackageRef(input.packageRef),
    participants: cleanScenarioSection(input.participants, "participants"),
    objective: cleanScenarioSection(input.objective, "objective"),
    rules: cleanScenarioSection(input.rules, "rules"),
    schedule: cleanScenarioSection(input.schedule, "schedule"),
    assumptions: cleanScenarioSection(input.assumptions, "assumptions"),
    execution: cleanScenarioSection(input.execution, "execution"),
    evaluation: cleanScenarioSection(input.evaluation, "evaluation"),
    sourceCutoff: cleanScenarioSection(input.sourceCutoff, "sourceCutoff"),
    save: cleanScenarioSection(input.save, "save"),
  };
  const createdAt = cleanString(input.createdAt, "createdAt");
  if (createdAt !== undefined) envelope.createdAt = createdAt;
  envelope.scenarioHash = `scenario-${hashCanonical(envelope)}`;
  return deepFreeze(envelope);
}

/** Construct the first public Scenario Envelope used by Lineup Lab solves. */
export function createLineupScenarioEnvelope({ config = {}, source = {}, playerIds = [] } = {}) {
  const mode = config.mode === "rotation" ? "rotation" : "lineup";
  const sourceScope = isObject(source) ? source : {};
  const ids = cleanIdList(playerIds, "playerIds");
  const packageRef = sourceScope.packageRef || (sourceScope.packageId || sourceScope.packageVersion
    ? {
        id: sourceScope.packageId,
        version: sourceScope.packageVersion,
        format: sourceScope.format,
        registryVersion: sourceScope.registryVersion,
        registryRevisionSha256: sourceScope.registryRevisionSha256,
        manifestSha256: sourceScope.packageManifestSha256,
        contentSha256: sourceScope.packageContentSha256,
        projectionContentSha256: sourceScope.projectionContentSha256,
        sourceLockSha256: sourceScope.sourceLockSha256,
        modelId: sourceScope.modelId,
      }
    : undefined);
  const rules = {
    size: cleanNumber(config.size, "config.size", { integer: true, minimum: 1, maximum: 30 }),
    lockedIds: cleanIdList(config.lockedIds, "lockedIds"),
    excludedIds: cleanIdList(config.excludedIds, "excludedIds"),
    positionMinimums: clonePublic(config.positionMinimums || {}),
    statMinimums: clonePublic(config.statMinimums || {}),
    maxTurnovers: cleanNumber(config.maxTurnovers, "config.maxTurnovers", { minimum: 0 }),
    rotationOptions: clonePublic(config.rotationOptions || {}),
  };
  const objective = {
    // SwishIQ Impact is the only active advanced model identifier. Legacy
    // Historical result payloads are handled by legacyResultToPassport below and
    // must never become a new write through this envelope builder.
    id: config.modelMode === "swishiq-impact" ? "swishiq-impact" : "game-plan-fit",
    version: cleanString(config.objectiveVersion || "lineup-objective-v1", "objective version", { pattern: HASH_PATTERN }),
    mode,
    weights: clonePublic(config.weights || {}),
  };
  const schedule = {};
  for (const key of ["team", "teamCode", "season", "seasonEndYear", "phase", "seasonPhase"]) {
    if (sourceScope[key] !== undefined && sourceScope[key] !== null) schedule[key] = clonePublic(sourceScope[key]);
  }
  if (sourceScope.scope !== undefined && sourceScope.scope !== null) {
    schedule.scope = clonePublic(sourceScope.scope);
  }
  const execution = {
    modelId: cleanString(config.modelId || "lineup-lab-v1", "model ID", { pattern: HASH_PATTERN }),
    seed: cleanString(config.seed, "execution seed", { pattern: HASH_PATTERN }),
    requestedRuns: 1,
  };
  const assumptions = {};
  const sourceLabel = sourceScope.label || sourceScope.name;
  if (sourceLabel) assumptions.sourceLabel = clonePublic(sourceLabel);
  const sourceCutoff = sourceScope.snapshotDate || sourceScope.snapshot;
  return createScenarioEnvelope({
    kind: mode,
    packageRef,
    participants: { playerRefs: ids.map(id => ({ id })) },
    objective,
    rules,
    schedule,
    assumptions,
    execution,
    evaluation: { pointRuleVersion: POINT_RULE_VERSION },
    sourceCutoff: sourceCutoff === undefined ? undefined : { value: clonePublic(sourceCutoff) },
  });
}

function cleanPlacementTiers(value, ruleVersion = POINT_RULE_VERSION) {
  if (![POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(ruleVersion)) {
    fail("Unsupported game point rule: " + ruleVersion + ".");
  }
  const previous = ruleVersion === PREVIOUS_POINT_RULE_VERSION;
  const maximumPlacement = previous ? 3 : 9;
  const tiers = value === undefined || value === null
    ? previous ? PREVIOUS_GAME_POINT_TIERS : DEFAULT_GAME_POINT_TIERS
    : value;
  if (!Array.isArray(tiers) || tiers.length < 2 || tiers.length > maximumPlacement + 1) {
    fail(`placementTiers must contain two to ${maximumPlacement + 1} declared percentile tiers.`);
  }
  const normalized = tiers.map((tier, index) => {
    if (!isObject(tier)) fail("placementTiers[" + index + "] must be an object.");
    const minimumPercentile = cleanNumber(tier.minimumPercentile, "placementTiers[" + index + "].minimumPercentile", { minimum: 0, maximum: 1 });
    const points = cleanNumber(tier.points, "placementTiers[" + index + "].points", { integer: true, minimum: 0, maximum: maximumPlacement });
    if (minimumPercentile === undefined || points === undefined) fail("placementTiers[" + index + "] is incomplete.");
    return { minimumPercentile, points };
  });
  if (normalized[0].points !== maximumPlacement || normalized.at(-1).minimumPercentile !== 0 || normalized.at(-1).points !== 0
    || normalized.some((tier, index) => index > 0 && (
      tier.minimumPercentile >= normalized[index - 1].minimumPercentile
      || tier.points >= normalized[index - 1].points
    ))) {
    fail(`placementTiers must descend from ${maximumPlacement} points to a zero-point percentile tier.`);
  }
  return normalized;
}

/** Return placement points from a board's declared, versioned percentile tiers. */
export function decisionPointsForRank(rank, optionCount, placementTiers, ruleVersion = POINT_RULE_VERSION) {
  if (!Number.isInteger(rank) || !Number.isInteger(optionCount) || rank < 1 || optionCount < 1 || rank > optionCount) return null;
  const tiers = cleanPlacementTiers(placementTiers, ruleVersion);
  const percentile = optionCount === 1 ? 1 : 1 - ((rank - 1) / (optionCount - 1));
  return tiers.find((tier) => percentile >= tier.minimumPercentile)?.points ?? 0;
}

/**
 * Decide whether a Result Passport carries enough explicit proof to display
 * an absolute legal-choice rank/count or a best-choice claim. Lineup Lab
 * supplies countComplete directly. Fixed-board games can supply an exhaustive
 * exact-enumeration proof; bounded evaluated sets do not qualify.
 */
export function decisionProofStatus(decision) {
  const proof = decision?.proof && typeof decision.proof === "object" ? decision.proof : {};
  const search = decision?.search && typeof decision.search === "object" ? decision.search : {};
  const rank = decision?.rank;
  const optionCount = decision?.optionCount;
  const validRank = Number.isSafeInteger(rank) && rank >= 1
    && Number.isSafeInteger(optionCount) && optionCount >= 1 && rank <= optionCount;
  const explicitCount = proof.countComplete === true;
  const exhaustiveEnumeration = proof.kind === "exact-enumeration"
    && proof.legalChoices === optionCount
    && search.exact === true
    && search.evaluatedChoices === optionCount;
  const countComplete = explicitCount || exhaustiveEnumeration;
  const bestLegalChoiceProven = validRank && rank === 1
    && decision?.quality === "best-legal-choice"
    && (explicitCount || (decision?.state === "best-proven"
      && search.exact === true && ["exact-enumeration", "valid-bound"].includes(proof.kind)));
  const rankComplete = countComplete && validRank;
  const disclosure = bestLegalChoiceProven && !countComplete
    ? "The evaluator proved the best legal choice; the full legal-choice count was not exhaustively checked."
    : Number.isSafeInteger(search.evaluatedChoices) && search.evaluatedChoices > 0
      ? "Ranking is bounded to the evaluated choices; the complete legal-choice count was not proven."
      : "Decision ranking proof is unavailable; the complete legal-choice count was not proven.";
  return { countComplete, rankComplete, bestLegalChoiceProven, disclosure };
}

/**
 * Build a small, separate game reward. It has no basketball-performance unit:
 * Version 1 adds a rule-completion point when applicable. Version 2 scores a
 * valid choice plus its placement tier; rule completion remains a validated
 * status field and does not change the ten-point score.
 */
export function buildDecisionPoints({
  rank,
  optionCount,
  rankProofComplete = false,
  validCompletedChoice = true,
  rulesCompleted,
  rulesTotal,
  // Board evaluators may expose one declared completion rule as booleans.
  // Normalize that compact form here, but always emit the explicit public
  // Result Passport fields below.
  completed,
  completionEligible,
  placementTiers,
  ruleVersion = POINT_RULE_VERSION,
} = {}) {
  const tiers = cleanPlacementTiers(placementTiers, ruleVersion);
  if (typeof rankProofComplete !== "boolean") fail("rankProofComplete must be a boolean.");
  const hasRank = Number.isInteger(rank) && Number.isInteger(optionCount)
    && rank >= 1 && optionCount >= 1 && rank <= optionCount;
  if (!hasRank) return null;
  const placementValue = rankProofComplete ? decisionPointsForRank(rank, optionCount, tiers, ruleVersion) : 0;
  if (typeof validCompletedChoice !== "boolean") fail("validCompletedChoice must be a boolean.");
  const validChoice = validCompletedChoice ? 1 : 0;
  const percentile = rankProofComplete
    ? optionCount === 1 ? 1 : 1 - ((rank - 1) / (optionCount - 1))
    : null;
  if (completed !== undefined && typeof completed !== "boolean") fail("completed must be a boolean.");
  if (completionEligible !== undefined && typeof completionEligible !== "boolean") fail("completionEligible must be a boolean.");
  const inferredRulesTotal = rulesTotal === undefined
    ? completionEligible === true ? 1 : 0
    : rulesTotal;
  const totalRules = cleanNumber(inferredRulesTotal, "rulesTotal", { integer: true, minimum: 0, maximum: 100 });
  const inferredRulesCompleted = rulesCompleted === undefined
    ? completed === true ? totalRules : 0
    : rulesCompleted;
  const completedRules = cleanNumber(inferredRulesCompleted, "rulesCompleted", { integer: true, minimum: 0, maximum: totalRules });
  const ruleCompletion = validChoice && totalRules > 0 && completedRules === totalRules ? 1 : 0;
  const currentRule = ruleVersion === POINT_RULE_VERSION;
  const placement = validChoice ? placementValue : 0;
  const max = currentRule ? 10 : 1 + (totalRules > 0 ? 1 : 0) + 3;
  const total = currentRule
    ? validChoice + placement
    : validChoice + ruleCompletion + placement;
  return deepFreeze({
    ruleVersion,
    validChoice,
    ruleCompletion,
    placement,
    total,
    max,
    breakdown: Object.freeze({
      validChoice,
      ruleCompletion,
      placement,
      percentile,
      placementTiers: tiers.map((tier) => ({ ...tier })),
    }),
  });
}

function cleanDecision(value) {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) fail("decision must be an object.");
  const decision = {};
  const rank = cleanNumber(value.rank, "decision.rank", { integer: true, minimum: 1 });
  const optionCount = cleanNumber(value.optionCount, "decision.optionCount", { integer: true, minimum: 1 });
  if (rank !== undefined) decision.rank = rank;
  if (optionCount !== undefined) decision.optionCount = optionCount;
  if (rank !== undefined && optionCount !== undefined && rank > optionCount) fail("decision.rank cannot exceed decision.optionCount.");
  for (const key of ["gap", "gapUnit", "gapToNext", "gapToBest", "choicesBeaten", "choiceId", "state", "quality"]) {
    if (value[key] !== undefined) decision[key] = typeof value[key] === "number"
      ? cleanNumber(value[key], `decision.${key}`)
      : cleanString(value[key], `decision.${key}`);
  }
  if (decision.choicesBeaten !== undefined && !Number.isInteger(decision.choicesBeaten)) {
    fail("decision.choicesBeaten must be a whole number.");
  }
  if (decision.choicesBeaten !== undefined && decision.choicesBeaten < 0) {
    fail("decision.choicesBeaten cannot be negative.");
  }
  if (value.proof !== undefined) decision.proof = cleanScenarioSection(value.proof, "decision.proof");
  if (value.search !== undefined) decision.search = cleanScenarioSection(value.search, "decision.search");
  return decision;
}

function cleanNativeOutcome(value) {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) fail("nativeOutcome must be an object.");
  const outcome = {};
  const machineKeys = new Set(["kind", "unit", "direction", "state", "benchmarkId", "benchmarkVersion"]);
  for (const key of ["kind", "unit", "direction", "state", "benchmarkId", "benchmarkVersion", "label", "basis", "scope"]) {
    if (value[key] !== undefined) {
      outcome[key] = cleanString(value[key], `nativeOutcome.${key}`, machineKeys.has(key) ? { pattern: HASH_PATTERN } : {});
    }
  }
  if (value.value !== undefined && value.value !== null) outcome.value = cleanNumber(value.value, "nativeOutcome.value");
  if (value.metrics !== undefined) outcome.metrics = cleanMetricMap(value.metrics, "nativeOutcome.metrics");
  if (value.coverage !== undefined) outcome.coverage = cleanScenarioSection(value.coverage, "nativeOutcome.coverage");
  if (value.uncertainty !== undefined) outcome.uncertainty = cleanScenarioSection(value.uncertainty, "nativeOutcome.uncertainty");
  if (value.benchmark !== undefined) outcome.benchmark = cleanScenarioSection(value.benchmark, "nativeOutcome.benchmark");
  if (!outcome.kind || !outcome.unit) fail("nativeOutcome.kind and nativeOutcome.unit are required.");
  if (outcome.value === undefined && (!outcome.metrics || Object.keys(outcome.metrics).length === 0)) {
    fail("nativeOutcome.value or nativeOutcome.metrics is required.");
  }
  return outcome;
}

function cleanGamePoints(value) {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) fail("gamePoints must be an object.");
  const ruleVersion = cleanString(value.ruleVersion, "gamePoints.ruleVersion", { required: true, pattern: HASH_PATTERN });
  if (![POINT_RULE_VERSION, PREVIOUS_POINT_RULE_VERSION].includes(ruleVersion)) fail("Unsupported game point rule: " + ruleVersion + ".");
  const points = {};
  for (const key of ["validChoice", "ruleCompletion", "placement", "total", "max"]) {
    points[key] = cleanNumber(value[key], "gamePoints." + key, { integer: true, minimum: 0, maximum: 100 });
  }
  if (!["validChoice", "ruleCompletion", "placement", "total", "max"].every(key => Number.isInteger(points[key]))) {
    fail("gamePoints is incomplete.");
  }
  const previous = ruleVersion === PREVIOUS_POINT_RULE_VERSION;
  if (![0, 1].includes(points.validChoice) || ![0, 1].includes(points.ruleCompletion)
    || points.placement > (previous ? 3 : 9)
    || (previous ? ![4, 5].includes(points.max) : points.max !== 10)
    || (previous && points.max === 4 && points.ruleCompletion !== 0)
    || (!points.validChoice && (points.ruleCompletion !== 0 || points.placement !== 0))
    || points.total > points.max) {
    fail("gamePoints totals are inconsistent.");
  }
  const expectedTotal = previous
    ? points.validChoice + points.ruleCompletion + points.placement
    : points.validChoice + points.placement;
  if (points.total !== expectedTotal) {
    fail(previous
      ? "gamePoints.total must equal its valid-choice, rule-completion, and placement components."
      : "gamePoints.total must equal its valid-choice and placement points.");
  }
  return { ruleVersion, ...points, breakdown: clonePublic(value.breakdown || {}) };
}
function statusForLegacyResult(result) {
  if (result?.ok) return "complete";
  const category = result?.diagnostics?.category;
  if (category === "validation") return "invalid-input";
  if (category === "constraints") return "infeasible";
  if (category === "performance" || category === "worker-error" || category === "worker-unavailable") return "cancelled";
  return "unavailable";
}

/** Create a validated Result Passport from a new producer result. */
export function createResultPassport({ scenario, runId, status = "complete", nativeOutcome = null, decision = null, gamePoints = null, constraints = null, evidence = null, replay = null, compatibility = null } = {}) {
  if (!scenario || scenario.version !== SCENARIO_ENVELOPE_VERSION || typeof scenario.scenarioHash !== "string") fail("Result Passport requires a Scenario Envelope.");
  if (!RESULT_STATUSES.includes(status)) fail(`Unsupported result status: ${status}.`);
  const passport = {
    version: RESULT_PASSPORT_VERSION,
    runId: cleanString(runId || `run-${scenario.scenarioHash}`, "runId", { pattern: HASH_PATTERN }),
    scenarioHash: scenario.scenarioHash,
    scenarioKind: scenario.kind,
    status,
    nativeOutcome: cleanNativeOutcome(nativeOutcome),
    decision: cleanDecision(decision),
    gamePoints: cleanGamePoints(gamePoints),
    constraints: constraints === null || constraints === undefined ? null : cleanScenarioSection(constraints, "constraints"),
    evidence: normalizeResultEvidence(evidence),
    replay: replay === null || replay === undefined ? null : cleanScenarioSection(replay, "replay"),
    compatibility: compatibility === null || compatibility === undefined ? null : cleanScenarioSection(compatibility, "compatibility"),
  };
  return deepFreeze(passport);
}

/**
 * Read a legacy result without converting its arbitrary score into a
 * basketball metric. Rank can still earn placement points because rank is a
 * decision property, not a performance estimate.
 */
export function legacyResultToPassport(result, { scenario, optionCount, runId, includeDecisionPoints = true } = {}) {
  if (!scenario) fail("legacyResultToPassport requires a Scenario Envelope.");
  const rank = Number.isInteger(result?.rank) ? result.rank : Number.isInteger(result?.best?.rank) ? result.best.rank : undefined;
  const count = Number.isInteger(optionCount) ? optionCount : Number.isInteger(result?.optionCount) ? result.optionCount : undefined;
  const points = includeDecisionPoints && rank !== undefined && count !== undefined
    ? buildDecisionPoints({ rank, optionCount: count, rankProofComplete: false, validCompletedChoice: result?.ok === true })
    : null;
  const legacyScore = finite(result?.roundScore) ? result.roundScore : null;
  return createResultPassport({
    scenario,
    runId,
    status: statusForLegacyResult(result),
    decision: rank !== undefined ? {
      rank,
      optionCount: count,
      state: "legal-answer",
      search: { source: "legacy-board", exact: true },
    } : null,
    gamePoints: points,
    compatibility: {
      mode: "legacy-read",
      sourceContractVersion: result?.contractVersion ?? 1,
      legacyScoreField: "roundScore",
      legacyRoundScore: legacyScore,
    },
  });
}

/** Attach a passport while preserving every legacy result field untouched. */
export function attachResultPassport(result, passport) {
  if (!isObject(result) || !passport) return result;
  return { ...result, resultPassport: passport };
}

function savedReplayPins(scenario) {
  const schedule = isObject(scenario?.schedule) ? scenario.schedule : {};
  const execution = isObject(scenario?.execution) ? scenario.execution : {};
  return {
    resultPassportVersion: RESULT_PASSPORT_VERSION,
    ...(scenario?.packageRef ? { packageRef: scenario.packageRef } : {}),
    ...(schedule.scope ? { scope: schedule.scope } : {}),
    ...(schedule.phase || schedule.seasonPhase ? { phase: schedule.phase || schedule.seasonPhase } : {}),
    ...(isObject(scenario?.rules) ? { rules: scenario.rules } : {}),
    ...(execution.seed ? { seed: execution.seed } : {}),
    ...(execution.modelId ? { modelId: execution.modelId } : {}),
  };
}

/**
 * Validate the metadata required to reload a saved exact-package run. The
 * result itself remains browser-safe, while the pins make a later reload
 * fail closed if its package, scope, rules, or seed has changed.
 */
export function validateSavedResultPassport(value, { scenario = null } = {}) {
  if (!isResultPassport(value)) fail("Saved Result Passport is invalid.");
  const replay = value.replay;
  if (!isObject(replay) || replay.resultPassportVersion !== RESULT_PASSPORT_VERSION) {
    fail("Saved Result Passport is missing its version pin.");
  }
  if (scenario) {
    if (value.scenarioHash !== scenario.scenarioHash) fail("Saved Result Passport does not match the scenario.");
    const expected = savedReplayPins(scenario);
    for (const key of ["packageRef", "scope", "phase", "rules", "seed", "modelId"]) {
      if (expected[key] !== undefined && stableStringify(replay[key]) !== stableStringify(expected[key])) {
        fail(`Saved Result Passport ${key} pin does not match the scenario.`);
      }
    }
    if (scenario.packageRef && (!replay.packageRef || !replay.scope || !replay.phase || !replay.rules || !replay.seed)) {
      fail("Saved exact-package Result Passport is incomplete.");
    }
  }
  return value;
}

/** Wrap a Lineup Lab optimizer result without inventing a native performance unit. */
export function resultPassportFromOptimizerResult(result, { scenario, runId } = {}) {
  if (!scenario) fail("resultPassportFromOptimizerResult requires a Scenario Envelope.");
  const best = result?.best;
  const alternatives = Array.isArray(result?.alternatives) ? result.alternatives : [];
  const feasible = Number(result?.diagnostics?.feasibleCombinations);
  // A denominator is useful only when the producer explicitly attests that
  // every legal choice was classified. Older readers omitted this flag; treat
  // that omission as unknown rather than turning a top-K shortlist into a
  // false "1 of N" claim.
  const countComplete = result?.diagnostics?.feasibleCombinationCountComplete === true;
  const rankingProven = result?.diagnostics?.exactTopKProven === true
    && result?.diagnostics?.exactAlternativeRankingCompleted === true;
  // An interrupted/bounded search may know that several legal groups exist,
  // but it cannot claim that its shortlist is the complete choice set. Keep
  // that lower bound in the proof metadata and omit optionCount so the UI
  // never turns a partial search into a false “1 of N” result.
  const optionCount = countComplete && Number.isInteger(feasible) && feasible > 0
    ? feasible
    : undefined;
  const rank = best && Number.isInteger(best.rank) ? best.rank : best ? 1 : undefined;
  const next = alternatives.find((alternative) => Number(alternative?.rank) === Number(rank) + 1);
  const bestObjective = Number(best?.objectiveValue);
  const nextObjective = Number(next?.objectiveValue);
  const gapToNext = Number.isFinite(bestObjective) && Number.isFinite(nextObjective)
    ? Math.max(0, bestObjective - nextObjective)
    : null;
  const choicesBeaten = rank !== undefined && optionCount !== undefined
    ? Math.max(0, optionCount - rank)
    : undefined;
  const decision = rank !== undefined ? {
    rank,
    ...(optionCount === undefined ? {} : { optionCount }),
    ...(choicesBeaten === undefined ? {} : { choicesBeaten }),
    ...(gapToNext === null ? {} : { gapToNext, gapUnit: "optimizer-objective-units" }),
    state: rankingProven && countComplete ? "best-proven" : "best-found",
    quality: rankingProven && countComplete ? "best-legal-choice" : "best-found",
    proof: {
      ...(optionCount === undefined ? {} : { legalChoices: optionCount }),
      ...(Number.isInteger(feasible) && feasible > 0 && !countComplete
        ? { legalChoicesLowerBound: feasible }
        : {}),
      ...(countComplete ? { countComplete: true } : { countComplete: false }),
      combinationsEvaluated: Number(result?.combinationsEvaluated) || 0,
    },
    search: {
      exact: rankingProven && countComplete,
      combinationsEvaluated: Number(result?.combinationsEvaluated) || 0,
      feasibleCombinations: Number(result?.diagnostics?.feasibleCombinations) || 0,
    },
  } : null;
  const status = result?.ok ? "complete" : statusForLegacyResult(result);
  const totals = best?.totals && isObject(best.totals) ? best.totals : null;
  const metrics = totals
    ? Object.fromEntries(["points", "rebounds", "assists", "steals", "blocks", "turnovers"]
      .filter((key) => totals[key] === null || totals[key] === undefined || Number.isFinite(Number(totals[key])))
      .map((key) => [key, totals[key] === null || totals[key] === undefined ? null : Number(totals[key])]))
    : {};
  const nativeOutcome = Object.keys(metrics).length > 0 ? {
    kind: "lineup-production",
    unit: best?.rotation ? "assigned-minutes-estimate" : "combined-player-profile",
    state: "estimated",
    basis: best?.rotation ? "240-minute-plan" : "selected-player-season-rates",
    label: best?.rotation ? "Projected statline from the 240-minute plan" : "Combined selected-player statline",
    metrics,
    scope: scenario.kind,
    coverage: {
      fields: Object.keys(metrics),
      source: "optimizer-result",
    },
  } : null;
  return createResultPassport({
    scenario,
    runId,
    status,
    decision,
    // The current optimizer has no calibrated win/margin benchmark. The
    // native outcome below is therefore the source-shaped statline, never an
    // invented universal rating or converted 100-point index.
    nativeOutcome: result?.nativeOutcome || nativeOutcome,
    constraints: result?.best?.constraintAudit || null,
    evidence: { source: "lineup-lab", model: result?.diagnostics?.modelIdentity || null, exactSearch: countComplete },
    replay: {
      replayable: Boolean(result?.ok),
      reason: result?.ok ? "same scenario and package required" : "no completed result",
      ...savedReplayPins(scenario),
    },
    compatibility: {
      mode: "result-passport",
      sourceContractVersion: 2,
      rankingField: "internal-objective",
    },
  });
}

/**
 * Validate an already serialized Result Passport at a module boundary.
 * Producers should use `createResultPassport`; this helper is for browser
 * consumers, saved-result reloads, and evaluator adapters that need a strict
 * fail-closed check without reconstructing the originating Scenario Envelope.
 */
export function validateResultPassport(value, { requireEvidence = false, requireSourceNote = false } = {}) {
  if (!isObject(value)) fail("Result Passport must be an object.");
  const keys = [
    "version", "runId", "scenarioHash", "scenarioKind", "status", "nativeOutcome",
    "decision", "gamePoints", "constraints", "evidence", "replay", "compatibility",
  ];
  const unexpected = Object.keys(value).filter(key => !keys.includes(key));
  const missing = keys.filter(key => !Object.hasOwn(value, key));
  if (unexpected.length || missing.length) {
    fail("Result Passport fields are invalid.");
  }
  if (value.version !== RESULT_PASSPORT_VERSION) fail("Unsupported Result Passport version.");
  cleanString(value.runId, "Result Passport runId", { required: true, pattern: HASH_PATTERN });
  cleanString(value.scenarioHash, "Result Passport scenarioHash", { required: true, pattern: HASH_PATTERN });
  cleanString(value.scenarioKind, "Result Passport scenarioKind", { required: true });
  if (!SCENARIO_KINDS.has(value.scenarioKind)) fail("Result Passport scenarioKind is unsupported.");
  if (!RESULT_STATUSES.includes(value.status)) fail("Result Passport status is unsupported.");

  const nativeOutcome = cleanNativeOutcome(value.nativeOutcome);
  const decision = cleanDecision(value.decision);
  const gamePoints = cleanGamePoints(value.gamePoints);
  const constraints = value.constraints === null ? null : cleanScenarioSection(value.constraints, "constraints");
  const evidence = normalizeResultEvidence(value.evidence, { required: requireEvidence });
  const replay = value.replay === null ? null : cleanScenarioSection(value.replay, "replay");
  const compatibility = value.compatibility === null ? null : cleanScenarioSection(value.compatibility, "compatibility");
  if (requireSourceNote && !evidence?.sourceNote && !(Array.isArray(evidence?.sourceNotes) && evidence.sourceNotes.length)) {
    fail("Result Passport evidence needs a sourceNote.");
  }
  const normalized = {
    ...value,
    nativeOutcome,
    decision,
    gamePoints,
    constraints,
    evidence,
    replay,
    compatibility,
  };
  if (stableStringify(normalized) !== stableStringify(value)) fail("Result Passport contains non-canonical or private fields.");
  return value;
}

export function isResultPassport(value) {
  return Boolean(value) && value.version === RESULT_PASSPORT_VERSION && typeof value.scenarioHash === "string" && RESULT_STATUSES.includes(value.status);
}

/**
 * Shared SwishIQ Result Passport + Scenario Envelope contracts, ported 1:1 from
 * the reviewed site module /tools/result-passport.js (v=20260930f) so the
 * studio's daily games hash and validate exactly like the original.
 */

export const SCENARIO_ENVELOPE_VERSION = 1;
export const RESULT_PASSPORT_VERSION = 1;
export const POINT_RULE_VERSION = "swishiq-game-points-v2";
export const PREVIOUS_POINT_RULE_VERSION = "swishiq-game-points-v1";
export const POINT_RULE_V2_START_SEED = "2026-09-29";
export const RESULT_EVIDENCE_VERSION = 1;

const DEFAULT_GAME_POINT_TIERS = Object.freeze([
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

const RESULT_STATUSES = Object.freeze([
  "running", "cancelled", "complete", "invalid-input", "infeasible", "unavailable",
]);

const SCENARIO_KINDS = new Set([
  "lineup", "rotation", "fix-the-five", "draft-night", "game", "season",
  "composite", "career",
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

export function fail(message) {
  throw new TypeError(message);
}

export function cleanString(value, label, { required = false, pattern = null, max = MAX_STRING } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  const text = String(value).trim();
  if (!text || text.length > max) fail(`${label} must be a non-empty string of at most ${max} characters.`);
  if (pattern && !pattern.test(text)) fail(`${label} contains unsupported characters.`);
  return text;
}

export function cleanNumber(value, label, { integer = false, minimum = -Infinity, maximum = Infinity } = {}) {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    fail(`${label} must be a finite ${integer ? "integer" : "number"} in the supported range.`);
  }
  return number;
}

function cleanMetricMap(value, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const entries = Object.entries(value);
  if (entries.length > MAX_METRICS) fail(`${label} contains too many metrics.`);
  const result = {};
  for (const [key, entry] of entries) {
    if (!METRIC_KEY.test(key)) fail(`${label} contains an unsupported metric key.`);
    const metric = cleanNumber(entry, `${label}.${key}`);
    if (metric !== undefined) result[key] = metric;
  }
  return result;
}

function clonePublic(value, depth = 0) {
  if (depth > MAX_DEPTH) fail("Scenario metadata is too deeply nested.");
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
    return value.map(entry => clonePublic(entry, depth + 1));
  }
  if (!isObject(value)) fail("Scenario metadata contains an unsupported value.");
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (PRIVATE_KEY.test(key)) fail("Scenario metadata contains an unsupported key.");
    const cloned = clonePublic(entry, depth + 1);
    if (cloned !== undefined) result[key] = cloned;
  }
  return result;
}

function cleanScenarioSection(value, label) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) fail(`${label} must be an object.`);
  return clonePublic(value);
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
    const valuePart = cleanString(value[key], `packageRef.${key}`, { pattern });
    if (valuePart !== undefined) result[key] = valuePart;
  }
  if (!result.id || !result.version) fail("packageRef.id and packageRef.version are required together.");
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

function cleanEvidenceText(value, label) {
  const text = cleanString(value, label, { max: EVIDENCE_TEXT_MAX });
  if (text !== undefined && (PRIVATE_EVIDENCE_TEXT.test(text))) fail(`${label} contains a private value.`);
  return text;
}

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

export function isResultPassport(value) {
  return Boolean(value) && value.version === RESULT_PASSPORT_VERSION && typeof value.scenarioHash === "string" && RESULT_STATUSES.includes(value.status);
}

export function cleanPlacementTiers(value, ruleVersion = POINT_RULE_VERSION) {
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

export function decisionPointsForRank(rank, optionCount, placementTiers, ruleVersion = POINT_RULE_VERSION) {
  if (!Number.isInteger(rank) || !Number.isInteger(optionCount) || rank < 1 || optionCount < 1 || rank > optionCount) return null;
  const tiers = cleanPlacementTiers(placementTiers, ruleVersion);
  const percentile = optionCount === 1 ? 1 : 1 - ((rank - 1) / (optionCount - 1));
  return tiers.find((tier) => percentile >= tier.minimumPercentile)?.points ?? 0;
}

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

export function buildDecisionPoints({
  rank,
  optionCount,
  rankProofComplete = false,
  validCompletedChoice = true,
  rulesCompleted,
  rulesTotal,
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

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
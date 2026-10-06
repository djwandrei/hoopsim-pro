/*
 * Browser-side half of the SwishIQ public Lineup Lab contract.
 *
 * This file intentionally has no dependency on the private adapter, Supabase
 * service key, provider IDs, or Node-only modules. It validates the opaque
 * request/response envelope before a future public edge endpoint is called.
 * Keep its constants and field rules in lockstep with
 * scripts/lib/swishiq-lineup-public-contract.mjs.
 */

export const SWISHIQ_PUBLIC_LINEUP_CONTRACT_VERSION = 1;
export const SWISHIQ_PUBLIC_LINEUP_ADAPTER_CONTRACT = 'swishiq-lineup-public-v1';
export const SWISHIQ_PUBLIC_LINEUP_FORMAT = 'djhc-swishiq-package-v3';
export const SWISHIQ_PUBLIC_LINEUP_MODEL_ID = 'swishiq-v3';
export const SWISHIQ_PUBLIC_LINEUP_REQUIRED_CAPABILITIES = Object.freeze(['lineupLab', 'publicAdvancedImpact']);

const HASH = /^[a-f0-9]{64}$/i;
const PACKAGE_ID = /^nba-swishiq-v3-\d{4}-\d{2}$/;
const PACKAGE_VERSION = /^v3-\d{4}-\d{2}-[a-f0-9]{12}$/i;
const REGISTRY_VERSION = /^[A-Za-z0-9._-]{1,120}$/;
const PUBLIC_PLAYER_REF = /^p_[a-f0-9]{32}$/;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const TEAMS = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM',
  'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
const PRIVATE_KEY = /provider|external|canonical|crosswalk|mapping|archive|coefficient|rapm|raw|secret|token|password|source(?:path|manifest|window)|identitysource|positionsource|reviewedby|(?:^|[_-])(?:player|team|game)id$/i;
const UUID_IN_TEXT = /[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\/home\/|Bearer\s|sk_live_|service_role|sr:player:)/i;
const SEED = /^[A-Za-z0-9._~-]{8,96}$/;
const DEFAULT_COMPUTE_BUDGET = Object.freeze({ maxAlternatives: 5, maxEvaluatedChoices: 100000, maxMillis: 3000 });
const OUTCOME_UNITS = new Set(['points-per-100-possessions', 'net-rating-per-100', 'native-points']);
const OUTCOME_STATUS = new Set(['observed', 'estimated', 'simulated', 'unavailable']);
const OUTCOME_BANDS = new Set(['well-below', 'below', 'near-baseline', 'above', 'well-above', 'unavailable']);
const GAP_BANDS = new Set(['none', 'small', 'moderate', 'large', 'unavailable']);

export class SwishIqPublicLineupContractError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'SwishIqPublicLineupContractError';
    this.issues = [...issues];
  }
}

function fail(message, issues = []) {
  throw new SwishIqPublicLineupContractError(message, issues.length ? issues : [message]);
}
function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function exactKeys(value, allowed, label) {
  if (!object(value)) fail(`${label} must be an object.`);
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) fail(`${label} contains unsupported field(s): ${unknown.join(', ')}.`);
}
function text(value, pattern, label) {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value.trim()))) fail(`${label} is invalid.`);
  return value.trim();
}
function finite(value, label, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} is invalid.`);
  return value;
}
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} is invalid.`);
  return value;
}
function scope(value, label = 'scope') {
  exactKeys(value, ['kind', 'seasonStartYears', 'seasonStartYear', 'seasonEndYear', 'phases', 'pooledFitIsSeasonSpecific'], label);
  if (!Array.isArray(value.seasonStartYears) || value.seasonStartYears.length < 1 || value.seasonStartYears.length > 100) fail(`${label} seasonStartYears is invalid.`);
  const years = value.seasonStartYears.map(year => integer(Number(year), `${label} season year`, 1947, 2200)).sort((a, b) => a - b);
  if (new Set(years).size !== years.length || years.some((year, index) => index > 0 && year !== years[index - 1] + 1)) fail(`${label} seasonStartYears must be contiguous and unique.`);
  const phases = Array.isArray(value.phases) ? value.phases.map(phase => String(phase).trim().toLowerCase()) : [];
  if (!phases.length || new Set(phases).size !== phases.length || phases.some(phase => !PHASES.has(phase))) fail(`${label} phases are invalid.`);
  const phaseOrder = ['regular', 'in_season_tournament', 'play_in', 'playoffs'];
  const expected = { kind: years.length === 1 ? 'exact-season' : 'pooled-window', seasonStartYears: years,
    seasonStartYear: years[0], seasonEndYear: years.at(-1) + 1, phases: phaseOrder.filter(phase => phases.includes(phase)), pooledFitIsSeasonSpecific: years.length === 1 };
  if (stable(value) !== stable(expected)) fail(`${label} is not canonical.`);
  return expected;
}
function refs(value, label = 'playerRefs', allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 1000) fail(`${label} is invalid.`);
  const result = value.map(ref => text(ref, PUBLIC_PLAYER_REF, `${label} reference`).toLowerCase());
  if (new Set(result).size !== result.length) fail(`${label} contains repeated references.`);
  return result.sort();
}
function capabilities(value) {
  const supplied = value === undefined ? [...SWISHIQ_PUBLIC_LINEUP_REQUIRED_CAPABILITIES] : value;
  if (!Array.isArray(supplied) || !supplied.length || new Set(supplied).size !== supplied.length
    || supplied.some(item => typeof item !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item))
    || supplied.some(item => !SWISHIQ_PUBLIC_LINEUP_REQUIRED_CAPABILITIES.includes(item))
    || SWISHIQ_PUBLIC_LINEUP_REQUIRED_CAPABILITIES.some(item => !supplied.includes(item))) fail('requiredCapabilities are invalid.');
  return [...supplied].sort();
}
function objective(value = {}) {
  exactKeys(value, ['offenseWeight', 'defenseWeight'], 'objective');
  const offenseWeight = finite(value.offenseWeight ?? 0.5, 'objective offenseWeight', 0, 1);
  const defenseWeight = finite(value.defenseWeight ?? 0.5, 'objective defenseWeight', 0, 1);
  if (Math.abs(offenseWeight + defenseWeight - 1) > 1e-9) fail('objective weights must sum to one.');
  return { offenseWeight, defenseWeight };
}
function rules(value = {}) {
  exactKeys(value, ['kind', 'lineupSize', 'minGuards', 'minForwards', 'minCenters', 'totalMinutes'], 'rules');
  const kind = text(value.kind ?? 'starting-five', null, 'rules kind').toLowerCase();
  if (!['starting-five', 'rotation'].includes(kind)) fail('rules kind is unsupported.');
  const lineupSize = integer(value.lineupSize ?? (kind === 'starting-five' ? 5 : 9), 'rules lineupSize', 5, 15);
  if (kind === 'starting-five' && lineupSize !== 5) fail('starting-five rules must select exactly five players.');
  const result = { kind, lineupSize };
  for (const [key, label] of [['minGuards', 'minimum guards'], ['minForwards', 'minimum forwards'], ['minCenters', 'minimum centers']]) {
    if (value[key] !== undefined) result[key] = integer(value[key], label, 0, lineupSize);
  }
  if (value.totalMinutes !== undefined) result.totalMinutes = integer(value.totalMinutes, 'rules totalMinutes', 0, 2400);
  if (kind === 'rotation' && result.totalMinutes !== 240) fail('rotation rules must declare exactly 240 total minutes.');
  const roleMinimums = (result.minGuards || 0) + (result.minForwards || 0) + (result.minCenters || 0);
  if (roleMinimums > lineupSize) fail('role minimums exceed the requested lineup size.');
  return result;
}

function computeBudget(value = DEFAULT_COMPUTE_BUDGET) {
  exactKeys(value, ['maxAlternatives', 'maxEvaluatedChoices', 'maxMillis'], 'computeBudget');
  return {
    maxAlternatives: integer(value.maxAlternatives ?? DEFAULT_COMPUTE_BUDGET.maxAlternatives, 'computeBudget maxAlternatives', 0, 100),
    maxEvaluatedChoices: integer(value.maxEvaluatedChoices ?? DEFAULT_COMPUTE_BUDGET.maxEvaluatedChoices, 'computeBudget maxEvaluatedChoices', 1, 1000000),
    maxMillis: integer(value.maxMillis ?? DEFAULT_COMPUTE_BUDGET.maxMillis, 'computeBudget maxMillis', 250, 30000),
  };
}
function scenarioSeed(value = 'default-v1') { return text(value, SEED, 'scenarioSeed'); }
function metadata(value) {
  return {
    packageId: text(value.packageId, PACKAGE_ID, 'packageId').toLowerCase(),
    packageVersion: text(value.packageVersion, PACKAGE_VERSION, 'packageVersion'),
    registryVersion: text(value.registryVersion, REGISTRY_VERSION, 'registryVersion'),
    packageManifestSha256: text(value.packageManifestSha256, HASH, 'packageManifestSha256').toLowerCase(),
  };
}
function publicSafe(value, label) {
  const walk = (node, at) => {
    if (Array.isArray(node)) return node.forEach((item, index) => walk(item, `${at}[${index}]`));
    if (!node || typeof node !== 'object') {
      if (typeof node === 'string' && (UUID_IN_TEXT.test(node) || PRIVATE_TEXT.test(node))) fail(`${at} contains a private value.`);
      return;
    }
    for (const [key, item] of Object.entries(node)) {
      if (PRIVATE_KEY.test(key) || UUID_IN_TEXT.test(key)) fail(`${at}.${key} contains a private identity field.`);
      walk(item, `${at}.${key}`);
    }
  };
  walk(value, label); return value;
}

export function validateSwishIqPublicLineupRequest(value) {
  exactKeys(value, ['contractVersion', 'format', 'modelId', 'adapterContract', 'packageId', 'packageVersion', 'registryVersion',
    'packageManifestSha256', 'scope', 'selectedSeasonEndYear', 'phase', 'team', 'requiredCapabilities', 'playerRefs', 'objective', 'rules', 'scenarioSeed', 'computeBudget'], 'request');
  if (value.contractVersion !== SWISHIQ_PUBLIC_LINEUP_CONTRACT_VERSION || value.format !== SWISHIQ_PUBLIC_LINEUP_FORMAT
    || value.modelId !== SWISHIQ_PUBLIC_LINEUP_MODEL_ID || value.adapterContract !== SWISHIQ_PUBLIC_LINEUP_ADAPTER_CONTRACT) fail('Unsupported public Lineup contract metadata.');
  const meta = metadata(value); const normalizedScope = scope(value.scope);
  const selectedSeasonEndYear = integer(Number(value.selectedSeasonEndYear), 'selectedSeasonEndYear', 1948, 2201);
  if (!normalizedScope.seasonStartYears.some(year => year + 1 === selectedSeasonEndYear)) fail('selectedSeasonEndYear is outside the pinned scope.');
  const phase = text(value.phase, null, 'phase').toLowerCase();
  if (!PHASES.has(phase) || !normalizedScope.phases.includes(phase)) fail('phase is outside the pinned scope.');
  const team = text(value.team, null, 'team').toUpperCase(); if (!TEAMS.has(team)) fail('team is not canonical.');
  const normalized = { contractVersion: SWISHIQ_PUBLIC_LINEUP_CONTRACT_VERSION, format: SWISHIQ_PUBLIC_LINEUP_FORMAT,
    modelId: SWISHIQ_PUBLIC_LINEUP_MODEL_ID, adapterContract: SWISHIQ_PUBLIC_LINEUP_ADAPTER_CONTRACT, ...meta,
    scope: normalizedScope, selectedSeasonEndYear, phase, team, requiredCapabilities: capabilities(value.requiredCapabilities),
    playerRefs: refs(value.playerRefs), objective: objective(value.objective), rules: rules(value.rules),
    scenarioSeed: scenarioSeed(value.scenarioSeed), computeBudget: computeBudget(value.computeBudget) };
  if (normalized.playerRefs.length < normalized.rules.lineupSize) fail('playerRefs does not meet the requested lineup size.');
  return publicSafe(normalized, 'request');
}
export function buildSwishIqPublicLineupRequest(options = {}) {
  return validateSwishIqPublicLineupRequest({ contractVersion: SWISHIQ_PUBLIC_LINEUP_CONTRACT_VERSION,
    format: SWISHIQ_PUBLIC_LINEUP_FORMAT, modelId: SWISHIQ_PUBLIC_LINEUP_MODEL_ID,
    adapterContract: SWISHIQ_PUBLIC_LINEUP_ADAPTER_CONTRACT, ...options });
}

/** Stable opaque reference shared with the private package builder. */
export async function publicPlayerRefForCanonicalId(canonicalId) {
  const normalized = String(canonicalId || '').trim().toLowerCase();
  if (!UUID.test(normalized)) fail('A canonical player UUID is required to derive a public reference.');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') fail('This browser cannot derive a stable public player reference.');
  const bytes = new TextEncoder().encode(`djhc-player-v2:${normalized}`);
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  const hex = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `p_${hex.slice(0, 32)}`;
}

export async function publicPlayerRefsForCanonicalIds(canonicalIds) {
  if (!Array.isArray(canonicalIds)) fail('Canonical player IDs are required.');
  const pairs = await Promise.all(canonicalIds.map(async id => [String(id).trim().toLowerCase(), await publicPlayerRefForCanonicalId(id)]));
  return new Map(pairs);
}

function outcome(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['unit', 'value', 'benchmark', 'status', 'band', 'uncertainty'], 'result outcome');
  const unit = text(value.unit, null, 'result outcome unit'); if (!OUTCOME_UNITS.has(unit)) fail('result outcome unit is unsupported.');
  const status = text(value.status, null, 'result outcome status').toLowerCase(); if (!OUTCOME_STATUS.has(status)) fail('result outcome status is unsupported.');
  const band = text(value.band, null, 'result outcome band').toLowerCase(); if (!OUTCOME_BANDS.has(band)) fail('result outcome band is unsupported.');
  const result = { unit, status, band };
  if (value.value !== undefined && value.value !== null) result.value = finite(value.value, 'result outcome value', -10000, 10000);
  if (value.benchmark !== undefined && value.benchmark !== null) result.benchmark = text(value.benchmark, /^[A-Za-z0-9 ._%+-]{1,120}$/, 'result outcome benchmark');
  if (value.uncertainty !== undefined && value.uncertainty !== null) {
    exactKeys(value.uncertainty, ['lower', 'upper'], 'result outcome uncertainty');
    const lower = finite(value.uncertainty.lower, 'result outcome uncertainty lower', -10000, 10000);
    const upper = finite(value.uncertainty.upper, 'result outcome uncertainty upper', -10000, 10000);
    if (lower > upper) fail('result outcome uncertainty bounds are reversed.'); result.uncertainty = { lower, upper };
  }
  return result;
}
function decision(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['rank', 'evaluatedChoices', 'gapBand', 'constraintsSatisfied'], 'decisionQuality');
  const rank = value.rank === null ? null : integer(value.rank, 'decisionQuality rank', 1, 1000000);
  const evaluatedChoices = value.evaluatedChoices === null ? null : integer(value.evaluatedChoices, 'decisionQuality evaluatedChoices', 0, 1000000);
  const gapBand = text(value.gapBand, null, 'decisionQuality gapBand').toLowerCase(); if (!GAP_BANDS.has(gapBand)) fail('decisionQuality gapBand is unsupported.');
  if (typeof value.constraintsSatisfied !== 'boolean') fail('decisionQuality constraintsSatisfied is invalid.');
  if (rank !== null && evaluatedChoices !== null && rank > evaluatedChoices) fail('decisionQuality rank exceeds evaluated choices.');
  return { rank, evaluatedChoices, gapBand, constraintsSatisfied: value.constraintsSatisfied };
}
function coverage(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['eligiblePlayerCount', 'evaluatedChoiceCount', 'sampleStatus'], 'coverage');
  return { eligiblePlayerCount: integer(value.eligiblePlayerCount, 'coverage eligiblePlayerCount', 0, 1000000),
    evaluatedChoiceCount: integer(value.evaluatedChoiceCount, 'coverage evaluatedChoiceCount', 0, 1000000),
    sampleStatus: text(value.sampleStatus, /^[A-Za-z0-9 _-]{1,80}$/, 'coverage sampleStatus') };
}
function provenance(value) {
  if (value === undefined || value === null) return null;
  exactKeys(value, ['kind', 'calibrationStatus', 'calibrationReceiptSha256'], 'provenance');
  const kind = text(value.kind, null, 'provenance kind'); if (kind !== 'public-derived') fail('provenance kind must be public-derived.');
  const calibrationStatus = text(value.calibrationStatus, null, 'provenance calibrationStatus').toLowerCase();
  if (!['validated', 'unavailable'].includes(calibrationStatus)) fail('provenance calibrationStatus is unsupported.');
  const result = { kind, calibrationStatus };
  if (value.calibrationReceiptSha256 !== undefined && value.calibrationReceiptSha256 !== null) result.calibrationReceiptSha256 = text(value.calibrationReceiptSha256, HASH, 'calibrationReceiptSha256').toLowerCase();
  return result;
}

function playerEvidence(value, request, status) {
  if (value === undefined || value === null) {
    if (status === 'ready') fail('ready result requires public player evidence.');
    return [];
  }
  if (!Array.isArray(value) || value.length > 1000) fail('playerEvidence is invalid.');
  const seen = new Set();
  const rows = value.map((row, index) => {
    exactKeys(row, ['playerRef', 'offensePer100', 'defensePer100', 'reliability', 'displayEligible', 'alreadyRegularized'], `playerEvidence ${index + 1}`);
    const playerRef = text(row.playerRef, PUBLIC_PLAYER_REF, `playerEvidence ${index + 1} playerRef`).toLowerCase();
    if (!request.playerRefs.includes(playerRef) || seen.has(playerRef)) fail('playerEvidence contains an unknown or repeated player reference.');
    seen.add(playerRef);
    const offensePer100 = finite(row.offensePer100, `playerEvidence ${index + 1} offensePer100`, -1000, 1000);
    const defensePer100 = finite(row.defensePer100, `playerEvidence ${index + 1} defensePer100`, -1000, 1000);
    const reliability = finite(row.reliability, `playerEvidence ${index + 1} reliability`, 0, 1);
    if (typeof row.displayEligible !== 'boolean' || typeof row.alreadyRegularized !== 'boolean') fail(`playerEvidence ${index + 1} flags are invalid.`);
    return { playerRef, offensePer100, defensePer100, reliability, displayEligible: row.displayEligible, alreadyRegularized: row.alreadyRegularized };
  }).sort((left, right) => left.playerRef.localeCompare(right.playerRef));
  if (rows.length > 0 && rows.length !== request.playerRefs.length) fail('public player evidence must cover every requested player or no players.');
  if (status === 'ready' && rows.length !== request.playerRefs.length) fail('ready result must include evidence for every requested player.');
  return rows;
}

export function validateSwishIqPublicLineupResponse(value, request) {
  const normalizedRequest = validateSwishIqPublicLineupRequest(request);
  exactKeys(value, ['contractVersion', 'format', 'modelId', 'adapterContract', 'packageId', 'packageVersion', 'registryVersion',
    'packageManifestSha256', 'scope', 'selectedSeasonEndYear', 'phase', 'team', 'requiredCapabilities', 'scenarioSeed', 'computeBudget', 'result', 'playerEvidence', 'coverage', 'provenance'], 'response');
  for (const key of ['contractVersion', 'format', 'modelId', 'adapterContract', 'packageId', 'packageVersion', 'registryVersion',
    'packageManifestSha256', 'selectedSeasonEndYear', 'phase', 'team']) if (stable(value[key]) !== stable(normalizedRequest[key])) fail(`response ${key} does not match the request.`);
  if (stable(scope(value.scope, 'response scope')) !== stable(normalizedRequest.scope)) fail('response scope does not match the request.');
  if (stable(capabilities(value.requiredCapabilities)) !== stable(normalizedRequest.requiredCapabilities)) fail('response capabilities do not match the request.');
  if (stable(scenarioSeed(value.scenarioSeed)) !== stable(normalizedRequest.scenarioSeed)) fail('response scenarioSeed does not match the request.');
  if (stable(computeBudget(value.computeBudget)) !== stable(normalizedRequest.computeBudget)) fail('response computeBudget does not match the request.');
  exactKeys(value.result, ['status', 'selectedPlayerRefs', 'alternatives', 'rank', 'evaluatedChoices', 'outcome', 'decisionQuality', 'reasonCode'], 'result');
  const status = text(value.result.status, null, 'result status').toLowerCase(); if (!['ready', 'unavailable'].includes(status)) fail('result status is unsupported.');
  const selected = refs(value.result.selectedPlayerRefs, 'result selectedPlayerRefs', status === 'unavailable');
  if (selected.some(ref => !normalizedRequest.playerRefs.includes(ref))) fail('result selectedPlayerRefs escape the requested pool.');
  if (status === 'ready' && selected.length !== normalizedRequest.rules.lineupSize) fail('ready result does not satisfy lineup size.');
  const alternativesInput = value.result.alternatives === undefined ? [] : value.result.alternatives;
  if (!Array.isArray(alternativesInput) || alternativesInput.length > 100) fail('result alternatives are invalid.');
  const alternatives = alternativesInput.map((item, index) => {
    exactKeys(item, ['playerRefs', 'rank'], `result alternative ${index + 1}`); const playerRefs = refs(item.playerRefs, `result alternative ${index + 1} playerRefs`);
    if (playerRefs.length !== normalizedRequest.rules.lineupSize || playerRefs.some(ref => !normalizedRequest.playerRefs.includes(ref))) fail('result alternative escapes the requested pool.');
    return { playerRefs, rank: integer(item.rank, `result alternative ${index + 1} rank`, 1, 1000000) };
  });
  const rank = value.result.rank === null || value.result.rank === undefined ? null : integer(value.result.rank, 'result rank', 1, 1000000);
  const evaluatedChoices = value.result.evaluatedChoices === null || value.result.evaluatedChoices === undefined ? null : integer(value.result.evaluatedChoices, 'result evaluatedChoices', 0, 1000000);
  if (rank !== null && evaluatedChoices !== null && rank > evaluatedChoices) fail('result rank exceeds evaluated choices.');
  const result = { status, selectedPlayerRefs: selected, alternatives, rank, evaluatedChoices, outcome: outcome(value.result.outcome), decisionQuality: decision(value.result.decisionQuality) };
  if (value.result.reasonCode !== undefined && value.result.reasonCode !== null) {
    const reasonCode = text(value.result.reasonCode, null, 'result reasonCode').toLowerCase(); if (!['coverage-unavailable', 'package-unavailable', 'scope-unavailable', 'validation-failed', 'server-solve-not-requested'].includes(reasonCode)) fail('result reasonCode is unsupported.'); result.reasonCode = reasonCode;
  }
  if (status === 'unavailable' && !result.reasonCode) fail('unavailable result requires a reasonCode.');
  const normalized = { contractVersion: SWISHIQ_PUBLIC_LINEUP_CONTRACT_VERSION, format: SWISHIQ_PUBLIC_LINEUP_FORMAT,
    modelId: SWISHIQ_PUBLIC_LINEUP_MODEL_ID, adapterContract: SWISHIQ_PUBLIC_LINEUP_ADAPTER_CONTRACT,
    packageId: normalizedRequest.packageId, packageVersion: normalizedRequest.packageVersion,
    registryVersion: normalizedRequest.registryVersion, packageManifestSha256: normalizedRequest.packageManifestSha256,
    scope: normalizedRequest.scope, selectedSeasonEndYear: normalizedRequest.selectedSeasonEndYear,
    phase: normalizedRequest.phase, team: normalizedRequest.team,
    requiredCapabilities: normalizedRequest.requiredCapabilities, scenarioSeed: normalizedRequest.scenarioSeed,
    computeBudget: normalizedRequest.computeBudget, result,
    playerEvidence: playerEvidence(value.playerEvidence, normalizedRequest, status),
    coverage: coverage(value.coverage), provenance: provenance(value.provenance) };
  const hasCompleteEvidence = normalized.playerEvidence.length === normalizedRequest.playerRefs.length;
  const hasValidatedEvidenceContext = normalized.coverage && normalized.provenance && normalized.provenance.calibrationStatus === 'validated';
  if ((status === 'ready' || hasCompleteEvidence) && !hasValidatedEvidenceContext) fail('ready results and complete public player evidence require validated coverage and provenance.');
  if (status === 'unavailable' && hasCompleteEvidence && result.reasonCode !== 'server-solve-not-requested') fail('complete public player evidence without a server solve must declare server-solve-not-requested.');
  return publicSafe(normalized, 'response');
}

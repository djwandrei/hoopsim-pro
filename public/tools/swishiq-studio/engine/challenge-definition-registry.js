/*
 * Public SwishIQ challenge-definition registry.
 *
 * This file is intentionally data-only and browser safe.  It describes what
 * a public surface is allowed to ask of a package; it does not load package
 * parts, evaluate a choice, or carry an answer key.  Consumers resolve the
 * package through static-package-capability-resolver.js before rendering a
 * challenge.
 */

export const CHALLENGE_DEFINITION_REGISTRY_FORMAT = 'djhc-swishiq-challenge-definition-registry-v1';
export const CHALLENGE_DEFINITION_REGISTRY_VERSION = 'swishiq-challenge-definition-registry-v1';
export const CHALLENGE_SCOPE_KINDS = Object.freeze(['exact-season', 'pooled-window']);
export const CHALLENGE_STATUSES = Object.freeze(['active', 'planned', 'research']);
export const CHALLENGE_SELECTION_MODES = Object.freeze(['single', 'ordered', 'unordered']);

// Keep this list in lockstep with the public projection contract, but do not
// import the verifier here: this registry is also useful on a static shell
// before the verifier module has loaded.
export const PUBLIC_CAPABILITIES = Object.freeze([
  'swishiqStudio',
  'lineupLab',
  'publicAdvancedImpact',
  'chemistry',
  'historicalSeason',
  'seasonSimulation',
  'compositeRecipe',
  'compositeSimulation',
  'careerHistory',
  'careerSimulation',
  'crossEraGames',
  'challengePools',
  'franchise',
  'commissioner',
  'probabilities',
  'virtualPacks',
  'collector',
]);

const CAPABILITY_SET = new Set(PUBLIC_CAPABILITIES);
const ID = /^[a-z][a-z0-9-]{2,63}$/;
const BANK_ID = /^[a-z][a-z0-9-]{2,95}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const PHASES = new Set(['regular', 'in_season_tournament', 'play_in', 'playoffs']);
const PRIVATE_KEY = /^(?:answer(?:key|id|value|text)?|correct(?:answer|choice|option)?|solution(?:key|id|value|text)?|outcome(?:value|text)?|result(?:value|text)?|score(?:value|text)?|rank(?:value|text)?|fitpoints|roundscore|provider(?:id|ref)?|canonical(?:id|ref)?|crosswalk|archive(?:path)?|private|secret|token|credential|password|raw(?:data|input)?|coefficient(?:s)?|rapm)$/i;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;

const DEFAULT_DEFINITIONS = [
  {
    id: 'player-blueprint', surface: 'studio', status: 'active',
    title: 'Player Blueprint', summary: 'Review one player-season from the selected exact package.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['swishiqStudio'], questionBankId: 'player-blueprint-v1',
    selection: { mode: 'single', minimum: 1, maximum: 1 },
    resultKind: 'descriptive',
  },
  {
    id: 'pair-profile', surface: 'studio', status: 'active',
    title: 'Pair Profile', summary: 'Compare two player-season records without inferring shared-floor chemistry.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['swishiqStudio', 'chemistry'], questionBankId: 'pair-profile-v1',
    selection: { mode: 'unordered', minimum: 2, maximum: 2 },
    resultKind: 'descriptive',
  },
  {
    id: 'composite-forge', surface: 'studio', status: 'active',
    title: 'Composite Forge', summary: 'Build an explainable component recipe from one exact package.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['swishiqStudio', 'compositeRecipe'], questionBankId: 'composite-forge-v1',
    selection: { mode: 'unordered', minimum: 1, maximum: 8 },
    resultKind: 'modeled-descriptive',
  },
  {
    id: 'game-lab', surface: 'studio', status: 'active',
    title: 'Game Lab', summary: 'Run a transparent matchup scenario from one exact native package.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['seasonSimulation'], questionBankId: 'game-lab-v1',
    selection: { mode: 'ordered', minimum: 2, maximum: 2 },
    resultKind: 'simulated',
  },
  {
    id: 'season-lab', surface: 'studio', status: 'active',
    title: 'Season Lab', summary: 'Use the separately resolved native exact team package for a season scenario.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['historicalSeason', 'seasonSimulation'], questionBankId: 'season-lab-v1',
    selection: { mode: 'ordered', minimum: 1, maximum: 30 },
    resultKind: 'simulated',
  },
  {
    id: 'career-lab', surface: 'studio', status: 'active',
    title: 'Career Lab', summary: 'Trace observed history and modeled paths from the explicit pooled window.',
    scope: { kind: 'pooled-window', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['careerHistory', 'careerSimulation'], questionBankId: 'career-lab-v1',
    selection: { mode: 'single', minimum: 1, maximum: 1 },
    resultKind: 'modeled-descriptive',
  },
  {
    id: 'lineup-lab', surface: 'lineup-lab', status: 'active',
    title: 'Lineup Lab', summary: 'Build an exact-season lineup only when public lineup evidence is available.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['lineupLab', 'publicAdvancedImpact'], questionBankId: 'lineup-lab-v1',
    selection: { mode: 'unordered', minimum: 5, maximum: 5 },
    resultKind: 'descriptive',
  },
  {
    id: 'fix-the-five', surface: 'daily-game', status: 'active',
    title: 'Fix the Five', summary: 'Make one legal swap on a sealed exact-season board.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['challengePools', 'lineupLab', 'publicAdvancedImpact'], questionBankId: 'fix-the-five-v1',
    selection: { mode: 'single', minimum: 1, maximum: 1 },
    resultKind: 'board-ranked',
  },
  {
    id: 'draft-night', surface: 'daily-game', status: 'active',
    title: 'Draft Night', summary: 'Make five legal role picks on a sealed exact-season board.',
    scope: { kind: 'exact-season', phase: 'regular', pooledFallback: false },
    requiredCapabilities: ['challengePools', 'lineupLab', 'publicAdvancedImpact'], questionBankId: 'draft-night-v1',
    selection: { mode: 'ordered', minimum: 5, maximum: 5 },
    resultKind: 'board-ranked',
  },
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function fail(message) {
  throw new Error(message);
}

function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function exactKeys(value, allowed, label) {
  if (!isObject(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} has unsupported or missing fields.`);
  }
}

function text(value, label, pattern = null, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) fail(`${label} is invalid.`);
  const normalized = value.trim();
  if (pattern && !pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} is invalid.`);
  return value;
}

function publicSafe(value, label = 'public definition') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => publicSafe(item, `${label}[${index}]`));
    return value;
  }
  if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (PRIVATE_KEY.test(key)) fail(`${label}.${key} is not allowed in a public definition.`);
      publicSafe(item, `${label}.${key}`);
    });
    return value;
  }
  if (typeof value === 'string' && PRIVATE_TEXT.test(value)) fail(`${label} contains a private value.`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value;
  fail(`${label} is not JSON-safe.`);
}

function normalizeScope(value, label = 'scope') {
  exactKeys(value, ['kind', 'phase', 'pooledFallback'], label);
  const kind = text(value.kind, `${label} kind`, null, 32);
  if (!CHALLENGE_SCOPE_KINDS.includes(kind)) fail(`${label} kind is unsupported.`);
  const phase = text(value.phase, `${label} phase`, null, 40).toLowerCase();
  if (phase !== 'any' && !PHASES.has(phase)) fail(`${label} phase is unsupported.`);
  if (typeof value.pooledFallback !== 'boolean') fail(`${label} pooledFallback is invalid.`);
  // A fallback would widen an exact request and is never legal for a public
  // challenge. Keep the field explicit so a future contract cannot omit it.
  if (value.pooledFallback) fail(`${label} cannot permit pooled fallback.`);
  return { kind, phase, pooledFallback: false };
}

function normalizeSelection(value, label = 'selection') {
  exactKeys(value, ['mode', 'minimum', 'maximum'], label);
  const mode = text(value.mode, `${label} mode`, null, 20);
  if (!CHALLENGE_SELECTION_MODES.includes(mode)) fail(`${label} mode is unsupported.`);
  const minimum = integer(value.minimum, `${label} minimum`, 1, 1000);
  const maximum = integer(value.maximum, `${label} maximum`, minimum, 1000);
  if (mode === 'single' && (minimum !== 1 || maximum !== 1)) {
    fail(`${label} single mode must select exactly one item.`);
  }
  return { mode, minimum, maximum };
}

export function validateChallengeDefinition(value, { label = 'challenge definition' } = {}) {
  exactKeys(value, [
    'id', 'surface', 'status', 'title', 'summary', 'scope', 'requiredCapabilities',
    'questionBankId', 'selection', 'resultKind',
  ], label);
  publicSafe(value, label);
  const id = text(value.id, `${label} id`, ID, 64);
  const surface = text(value.surface, `${label} surface`, ID, 64);
  const status = text(value.status, `${label} status`, null, 20);
  if (!CHALLENGE_STATUSES.includes(status)) fail(`${label} status is unsupported.`);
  const title = text(value.title, `${label} title`, null, 120);
  const summary = text(value.summary, `${label} summary`, null, 320);
  const scope = normalizeScope(value.scope, `${label} scope`);
  if (!Array.isArray(value.requiredCapabilities) || !value.requiredCapabilities.length) {
    fail(`${label} must declare at least one required capability.`);
  }
  const requiredCapabilities = value.requiredCapabilities.map((capability) => {
    const normalized = text(capability, `${label} capability`, null, 80);
    if (!CAPABILITY_SET.has(normalized)) fail(`${label} declares an unsupported capability.`);
    return normalized;
  });
  if (new Set(requiredCapabilities).size !== requiredCapabilities.length) fail(`${label} repeats a required capability.`);
  const questionBankId = text(value.questionBankId, `${label} questionBankId`, BANK_ID, 96);
  const selection = normalizeSelection(value.selection, `${label} selection`);
  const resultKind = text(value.resultKind, `${label} resultKind`, ID, 64);
  return deepFreeze({
    id, surface, status, title, summary, scope,
    requiredCapabilities: Object.freeze([...requiredCapabilities].sort()),
    questionBankId, selection, resultKind,
  });
}

export const CHALLENGE_DEFINITIONS = deepFreeze(DEFAULT_DEFINITIONS.map((definition) => validateChallengeDefinition(definition)));

export function validateChallengeDefinitionRegistry(value, { requireActive = false } = {}) {
  if (!isObject(value)) fail('Challenge definition registry must be an object.');
  const requiredRegistryKeys = ['format', 'registryVersion', 'generatedAt', 'definitions'];
  const registryKeys = Object.keys(value);
  if (registryKeys.some((key) => !requiredRegistryKeys.includes(key) && key !== 'registryRevisionSha256')
    || requiredRegistryKeys.some((key) => !registryKeys.includes(key))) {
    fail('challenge definition registry has unsupported or missing fields.');
  }
  if (value.format !== CHALLENGE_DEFINITION_REGISTRY_FORMAT
    || value.registryVersion !== CHALLENGE_DEFINITION_REGISTRY_VERSION) {
    fail('Challenge definition registry format is unsupported.');
  }
  const generatedAt = text(value.generatedAt, 'challenge definition registry generatedAt', ISO_INSTANT, 40);
  if (!Number.isFinite(Date.parse(generatedAt))) fail('Challenge definition registry generatedAt is invalid.');
  if (value.registryRevisionSha256 !== undefined) {
    text(value.registryRevisionSha256, 'challenge definition registry registryRevisionSha256', /^[a-f0-9]{64}$/i, 64);
  }
  if (!Array.isArray(value.definitions) || !value.definitions.length || value.definitions.length > 200) {
    fail('Challenge definition registry definitions are invalid.');
  }
  const definitions = value.definitions.map((definition, index) => validateChallengeDefinition(definition, {
    label: `challenge definition ${index + 1}`,
  }));
  const ids = new Set();
  for (const definition of definitions) {
    if (ids.has(definition.id)) fail(`Challenge definition registry repeats ${definition.id}.`);
    ids.add(definition.id);
    if (requireActive && definition.status !== 'active') fail(`Challenge definition ${definition.id} is not active.`);
  }
  const ordered = [...definitions].sort((left, right) => compareText(left.id, right.id));
  if (stableJson(value.definitions) !== stableJson(ordered)) fail('Challenge definitions are not in canonical order.');
  return deepFreeze({
    format: CHALLENGE_DEFINITION_REGISTRY_FORMAT,
    registryVersion: CHALLENGE_DEFINITION_REGISTRY_VERSION,
    generatedAt,
    definitions: Object.freeze(ordered),
    ...(value.registryRevisionSha256 ? { registryRevisionSha256: value.registryRevisionSha256.toLowerCase() } : {}),
  });
}

export function buildChallengeDefinitionRegistry({
  generatedAt = new Date().toISOString(), definitions = CHALLENGE_DEFINITIONS,
} = {}) {
  const normalized = definitions.map((definition, index) => validateChallengeDefinition(definition, {
    label: `challenge definition ${index + 1}`,
  })).sort((left, right) => compareText(left.id, right.id));
  return validateChallengeDefinitionRegistry({
    format: CHALLENGE_DEFINITION_REGISTRY_FORMAT,
    registryVersion: CHALLENGE_DEFINITION_REGISTRY_VERSION,
    generatedAt,
    definitions: normalized,
  });
}

export function resolveChallengeDefinition(registryOrId = null, id = null) {
  // Support both resolveChallengeDefinition('surface-id') and the explicit
  // resolveChallengeDefinition(registry, 'surface-id') form.  The built-in
  // definitions are kept in authoring order, while registries are required
  // to be canonical by id, so always normalize the array shorthand through
  // the registry builder before looking up a definition.
  const idOnly = typeof registryOrId === 'string' && id === null;
  const requestedId = idOnly ? registryOrId : id;
  const source = idOnly || registryOrId === null ? CHALLENGE_DEFINITIONS : registryOrId;
  const registry = Array.isArray(source)
    ? buildChallengeDefinitionRegistry({ definitions: source })
    : source;
  const normalized = validateChallengeDefinitionRegistry(registry);
  const definition = normalized.definitions.find((item) => item.id === String(requestedId || '').trim());
  if (!definition) fail(`Unknown challenge definition: ${String(requestedId || '').trim() || 'empty'}.`);
  return definition;
}

export function definitionsForSurface(registry, surface) {
  const normalized = validateChallengeDefinitionRegistry(registry || buildChallengeDefinitionRegistry());
  const requested = text(surface, 'surface', ID, 64);
  return Object.freeze(normalized.definitions.filter((definition) => definition.surface === requested));
}

export function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Canonical JSON cannot contain a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!isObject(value)) fail('Canonical JSON contains an unsupported value.');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

// A convenient frozen envelope for browser callers that do not need to build
// or serialize a registry themselves.
export const PUBLIC_CHALLENGE_DEFINITION_REGISTRY = buildChallengeDefinitionRegistry({
  generatedAt: '2026-09-19T00:00:00.000Z',
});

/*
 * Public question-bank pipeline for SwishIQ model/tool surfaces.
 *
 * A question bank is choice context, not an evaluator payload.  The contract
 * intentionally has no answer, score, rank, outcome, or private evidence
 * fields.  Private services may keep their answer material elsewhere and may
 * use the public question id as a join key, but that material must never be
 * passed to this module or serialized into a public bank.
 */

import {
  CHALLENGE_SCOPE_KINDS,
  PUBLIC_CAPABILITIES,
  resolveChallengeDefinition,
  stableJson,
  validateChallengeDefinition,
} from './challenge-definition-registry.js?v=20260920c&rev=swishiq-engine-v1';

export const QUESTION_BANK_FORMAT = 'djhc-swishiq-question-bank-v1';
export const QUESTION_BANK_PIPELINE_VERSION = 'swishiq-question-bank-v1';
export const QUESTION_KINDS = Object.freeze(['prompt', 'choice', 'brief']);

const ID = /^[a-z][a-z0-9-]{2,95}$/;
const BANK_ID = /^[a-z][a-z0-9-]{2,95}$/;
const PRIVATE_KEY = /^(?:answer(?:key|id|value|text)?|correct(?:answer|choice|option)?|solution(?:key|id|value|text)?|outcome(?:value|text)?|result(?:value|text)?|score(?:value|text)?|rank(?:value|text)?|fitpoints|roundscore|provider(?:id|ref)?|canonical(?:id|ref)?|crosswalk|archive(?:path)?|private|secret|token|credential|password|raw(?:data|input)?|coefficient(?:s)?|rapm)$/i;
const PRIVATE_TEXT = /(?:[A-Za-z]:[\\/]|file:\/\/|\\\\|\/home\/|Bearer\s|service_role|sk_live_|sr:player:)/i;
const QUESTION_TEXT_MAX = 1000;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}

function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
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

function publicSafe(value, label = 'question bank') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => publicSafe(item, `${label}[${index}]`));
    return value;
  }
  if (isObject(value)) {
    Object.entries(value).forEach(([key, item]) => {
      if (PRIVATE_KEY.test(key)) fail(`${label}.${key} is not allowed in a public question bank.`);
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
  if (value === undefined || value === null) return null;
  exactKeys(value, ['kind', 'seasonStartYears', 'phase'], label);
  const kind = text(value.kind, `${label} kind`, null, 32);
  if (!CHALLENGE_SCOPE_KINDS.includes(kind)) fail(`${label} kind is unsupported.`);
  if (!Array.isArray(value.seasonStartYears) || !value.seasonStartYears.length || value.seasonStartYears.length > 100) {
    fail(`${label} seasonStartYears is invalid.`);
  }
  const seasonStartYears = value.seasonStartYears.map((year) => integer(Number(year), `${label} season`, 1947, 2200));
  if (new Set(seasonStartYears).size !== seasonStartYears.length
    || seasonStartYears.some((year, index) => index > 0 && year !== seasonStartYears[index - 1] + 1)) {
    fail(`${label} seasonStartYears must be ordered and contiguous.`);
  }
  const phase = text(value.phase, `${label} phase`, null, 40).toLowerCase();
  if (phase !== 'any' && !['regular', 'in_season_tournament', 'play_in', 'playoffs'].includes(phase)) {
    fail(`${label} phase is unsupported.`);
  }
  if (kind === 'exact-season' && seasonStartYears.length !== 1) fail(`${label} exact-season scope must contain one season.`);
  if (kind === 'pooled-window' && seasonStartYears.length < 2) fail(`${label} pooled-window scope must contain multiple seasons.`);
  return { kind, seasonStartYears, phase };
}

function normalizeCapabilities(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) fail(`${label} is invalid.`);
  const capabilities = value.map((capability) => text(capability, `${label} capability`, null, 80));
  if (new Set(capabilities).size !== capabilities.length
    || capabilities.some((capability) => !PUBLIC_CAPABILITIES.includes(capability))) {
    fail(`${label} contains an unsupported or repeated capability.`);
  }
  return [...capabilities].sort();
}

function normalizeChoice(value, label) {
  exactKeys(value, ['id', 'label'], label);
  publicSafe(value, label);
  return deepFreeze({
    id: text(value.id, `${label} id`, ID, 96),
    label: text(value.label, `${label} label`, null, 240),
  });
}

function normalizeQuestion(value, index) {
  const label = `question ${index + 1}`;
  exactKeys(value, ['id', 'kind', 'prompt', 'choices', 'tags', 'order', 'requiredCapabilities'], label);
  publicSafe(value, label);
  const id = text(value.id, `${label} id`, ID, 96);
  const kind = text(value.kind, `${label} kind`, null, 20);
  if (!QUESTION_KINDS.includes(kind)) fail(`${label} kind is unsupported.`);
  const prompt = text(value.prompt, `${label} prompt`, null, QUESTION_TEXT_MAX);
  const choices = value.choices === null ? null : (Array.isArray(value.choices)
    ? value.choices.map((choice, choiceIndex) => normalizeChoice(choice, `${label} choice ${choiceIndex + 1}`))
    : fail(`${label} choices are invalid.`));
  if (kind === 'choice' && (!choices || choices.length < 2 || choices.length > 8)) {
    fail(`${label} choice questions need two through eight choices.`);
  }
  if (choices && new Set(choices.map((choice) => choice.id)).size !== choices.length) {
    fail(`${label} repeats a choice id.`);
  }
  if (kind !== 'choice' && choices && choices.length) fail(`${label} non-choice questions cannot carry choices.`);
  const tags = Array.isArray(value.tags) ? value.tags.map((tag) => text(tag, `${label} tag`, ID, 64)) : fail(`${label} tags are invalid.`);
  if (new Set(tags).size !== tags.length) fail(`${label} repeats a tag.`);
  const order = integer(value.order, `${label} order`, 0, 1_000_000);
  const requiredCapabilities = normalizeCapabilities(value.requiredCapabilities, `${label} requiredCapabilities`);
  // bankId is validated at the envelope level; it is deliberately not copied
  // onto each public question so callers cannot mistake it for a join key to
  // private answer/evaluator material.
  return deepFreeze({ id, kind, prompt, choices: choices ? Object.freeze(choices) : null,
    tags: Object.freeze([...tags].sort()), order, requiredCapabilities: Object.freeze(requiredCapabilities) });
}

export function validateQuestionBank(value, { definition = null } = {}) {
  if (!isObject(value)) fail('Question bank must be an object.');
  const requiredBankKeys = ['format', 'pipelineVersion', 'bankId', 'definitionId', 'scope', 'questions'];
  const bankKeys = Object.keys(value);
  if (bankKeys.some((key) => !requiredBankKeys.includes(key) && key !== 'contentSha256')
    || requiredBankKeys.some((key) => !bankKeys.includes(key))) {
    fail('question bank has unsupported or missing fields.');
  }
  if (value.format !== QUESTION_BANK_FORMAT || value.pipelineVersion !== QUESTION_BANK_PIPELINE_VERSION) {
    fail('Question bank format is unsupported.');
  }
  if (value.contentSha256 !== undefined) text(value.contentSha256, 'question bank contentSha256', /^[a-f0-9]{64}$/i, 64);
  const bankId = text(value.bankId, 'question bank bankId', BANK_ID, 96);
  const definitionId = text(value.definitionId, 'question bank definitionId', ID, 96);
  const scope = normalizeScope(value.scope, 'question bank scope');
  if (!scope) fail('Question bank scope is required.');

  // Every bank is bound to the approved registry, even when a caller does not
  // pass a definition explicitly. If a definition object is supplied, require
  // it to be the canonical registered contract instead of trusting a caller's
  // same-ID object with weakened package or capability requirements.
  const normalizedDefinition = resolveChallengeDefinition(definitionId);
  if (definition !== null && definition !== undefined) {
    const suppliedDefinition = typeof definition === 'string'
      ? resolveChallengeDefinition(definition)
      : validateChallengeDefinition(definition);
    if (stableJson(suppliedDefinition) !== stableJson(normalizedDefinition)) {
      fail('Question bank challenge definition does not match the approved registry.');
    }
  }
  if (normalizedDefinition.id !== definitionId) fail('Question bank definitionId does not match its challenge definition.');
  if (normalizedDefinition.questionBankId !== bankId) fail('Question bank bankId does not match its challenge definition.');
  if (scope.kind !== normalizedDefinition.scope.kind) fail('Question bank scope widens or narrows its challenge definition.');
  if (normalizedDefinition.scope.phase !== 'any' && scope.phase !== normalizedDefinition.scope.phase) {
    fail('Question bank phase does not match its challenge definition.');
  }
  if (!Array.isArray(value.questions) || !value.questions.length || value.questions.length > 10_000) {
    fail('Question bank questions are invalid.');
  }
  const questions = value.questions.map((question, index) => normalizeQuestion(question, index));
  const ids = new Set();
  for (const question of questions) {
    if (ids.has(question.id)) fail(`Question bank repeats question ${question.id}.`);
    ids.add(question.id);
  }
  const ordered = [...questions].sort((left, right) => left.order - right.order || compareText(left.id, right.id));
  if (stableJson(value.questions) !== stableJson(ordered)) fail('Question bank questions are not in canonical order.');
  return deepFreeze({
    format: QUESTION_BANK_FORMAT,
    pipelineVersion: QUESTION_BANK_PIPELINE_VERSION,
    bankId,
    definitionId,
    scope,
    questions: Object.freeze(ordered),
    ...(value.contentSha256 ? { contentSha256: value.contentSha256.toLowerCase() } : {}),
  });
}

export function buildQuestionBank({
  bankId, definitionId, scope, questions,
} = {}) {
  const orderedQuestions = Array.isArray(questions)
    ? questions.map((question) => ({
      ...question,
      tags: Array.isArray(question?.tags) ? [...question.tags].sort() : question?.tags,
      requiredCapabilities: Array.isArray(question?.requiredCapabilities)
        ? [...question.requiredCapabilities].sort() : question?.requiredCapabilities,
      choices: Array.isArray(question?.choices)
        ? [...question.choices].sort((left, right) => compareText(left?.id || '', right?.id || ''))
        : question?.choices,
    })).sort((left, right) => Number(left?.order) - Number(right?.order)
      || compareText(left?.id || '', right?.id || ''))
    : questions;
  return validateQuestionBank({
    format: QUESTION_BANK_FORMAT,
    pipelineVersion: QUESTION_BANK_PIPELINE_VERSION,
    bankId, definitionId, scope, questions: orderedQuestions,
  }, { definition: definitionId });
}

function hashRank(seed, id) {
  // A small deterministic integer hash keeps selection browser-safe.  It is
  // not a secret and must never be used as an evaluator or answer key.
  const source = `${String(seed ?? '')}:${id}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectQuestionSet(bank, {
  seed, count = null, tags = [], requiredCapabilities,
} = {}) {
  const normalized = validateQuestionBank(bank);
  const normalizedSeed = text(String(seed ?? ''), 'question selection seed', null, 160);
  const requestedTags = Array.isArray(tags) ? tags.map((tag) => text(tag, 'question selection tag', ID, 64)) : fail('question selection tags are invalid.');
  const capabilities = normalizeCapabilities(requiredCapabilities, 'question selection requiredCapabilities');
  const definition = resolveChallengeDefinition(normalized.definitionId);
  const missingDefinitionCapabilities = definition.requiredCapabilities.filter((capability) => !capabilities.includes(capability));
  if (missingDefinitionCapabilities.length) {
    fail(`Challenge ${definition.id} requires package capability evidence for ${missingDefinitionCapabilities.join(' and ')}.`);
  }
  const limit = count === null || count === undefined ? normalized.questions.length : integer(count, 'question selection count', 1, normalized.questions.length);
  const candidates = normalized.questions.filter((question) => requestedTags.every((tag) => question.tags.includes(tag))
    // Selection is limited to the capabilities resolved for this challenge.
    // Missing capability evidence must not silently expose dependent prompts.
    && question.requiredCapabilities.every((capability) => capabilities.includes(capability)));
  if (!candidates.length) fail('No public questions satisfy the requested tags and capabilities.');
  if (candidates.length < limit) {
    fail(`Only ${candidates.length} public question${candidates.length === 1 ? '' : 's'} satisfy the requested tags and capabilities; ${limit} required.`);
  }
  const selected = [...candidates]
    .sort((left, right) => hashRank(normalizedSeed, left.id) - hashRank(normalizedSeed, right.id) || left.order - right.order || compareText(left.id, right.id))
    .slice(0, limit);
  return Object.freeze(selected);
}

export function questionBankContent(value) {
  const normalized = validateQuestionBank(value);
  return {
    format: normalized.format,
    pipelineVersion: normalized.pipelineVersion,
    bankId: normalized.bankId,
    definitionId: normalized.definitionId,
    scope: normalized.scope,
    questions: normalized.questions,
  };
}

export function questionBankFingerprintInput(value) {
  return stableJson(questionBankContent(value));
}

// Explicit aliases make the pipeline easy to discover without introducing
// parallel implementations under each Studio/game surface.
export const compileQuestionBank = buildQuestionBank;
export const resolveQuestionBank = validateQuestionBank;
export const selectQuestions = selectQuestionSet;

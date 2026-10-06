/*
 * Buyer-safe persistence and sharing primitives for public SwishIQ tools.
 *
 * This module deliberately has no Supabase, catalog, provider, or model
 * dependency.  It provides three small boundaries:
 *
 *   1. bounded local replay/history records (localStorage is never an
 *      authority; malformed or changed records are ignored),
 *   2. detached, HMAC-signed share envelopes (unsigned/tampered envelopes
 *      are never returned as accepted payloads), and
 *   3. aggregate telemetry that records nothing until analytics consent is
 *      explicitly granted.
 *
 * A browser may render an unsigned preview, but only a trusted signer (for
 * example the evaluator service) can create an envelope accepted by
 * verifySignedShareEnvelope().  Do not ship a signing secret in a public
 * bundle.  The `secret` option exists for a trusted build/service boundary
 * and for deterministic tests; browser callers should pass a detached
 * signer/verifier instead.
 */

export const SWISHIQ_REPLAY_HISTORY_FORMAT = 'djhc-swishiq-replay-history-v1';
export const SWISHIQ_REPLAY_HISTORY_VERSION = 1;
export const SWISHIQ_REPLAY_HISTORY_STORAGE_KEY = 'djhc:swishiq:replay-history:v1';

export const SWISHIQ_SHARE_ENVELOPE_FORMAT = 'djhc-swishiq-share-envelope-v1';
export const SWISHIQ_SHARE_ENVELOPE_VERSION = 1;
export const SWISHIQ_SHARE_SIGNATURE_ALGORITHM = 'HMAC-SHA-256';

export const SWISHIQ_AGGREGATE_TELEMETRY_FORMAT = 'djhc-swishiq-aggregate-telemetry-v1';
export const SWISHIQ_AGGREGATE_TELEMETRY_VERSION = 1;
export const SWISHIQ_AGGREGATE_TELEMETRY_STORAGE_KEY = 'djhc:swishiq:aggregate-telemetry:v1';

export const SWISHIQ_REPLAY_LIMITS = Object.freeze({
  maxRecords: 32,
  maxRecordBytes: 24_000,
  maxStoreBytes: 120_000,
  maxDepth: 6,
  maxArray: 64,
  maxString: 240,
});

export const SWISHIQ_TELEMETRY_LIMITS = Object.freeze({
  maxBuckets: 32,
  maxKindLength: 40,
  maxMilestoneLength: 40,
  maxDuration: 3_600_000,
});

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,79}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_KIND = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const SAFE_MILESTONE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

// These fields can carry provider handles, credentials, local filesystem
// paths, user identifiers, or raw artifacts.  They are dropped before any
// value is hashed, persisted, or signed.
const PRIVATE_KEY = /(?:access[_-]?token|api[_-]?key|auth|canonical|coefficient|cookie|crosswalk|credential|device[_-]?id|email|game[_-]?id|ip(?:address)?|password|path|phone|private|provider|raw(?:archive|data)?|secret|session[_-]?id|token|user[_-]?id|url|uri|href|address)/i;
const PRIVATE_TEXT = /(?:Bearer\s|sk_(?:live|test)_|service_role|sr:(?:player|team|game):|file:\/\/|[A-Za-z]:[\\/]|\\\\|\/home\/|(?:^|\s)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\s|$))/i;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isPlainObject = value => isObject(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function fail(message, code = 'invalid') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, label, { maximum = SWISHIQ_REPLAY_LIMITS.maxString, pattern = null, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return undefined;
    fail(`${label} is required.`);
  }
  if (typeof value !== 'string') fail(`${label} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) fail(`${label} is invalid.`);
  if (pattern && !pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function finiteNumber(value, label, { minimum = -Infinity, maximum = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) fail(`${label} is invalid.`);
  return number;
}

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
  return value;
}

/** Canonical JSON used for hashes and detached signatures. */
export function stableReplayJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('Canonical replay JSON cannot contain a non-finite number.');
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (value.length > SWISHIQ_REPLAY_LIMITS.maxArray) fail('Canonical replay JSON contains too many entries.');
    return `[${value.map((item) => stableReplayJson(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => {
      if (UNSAFE_KEYS.has(key)) fail('Canonical replay JSON contains an unsafe key.');
      return `${JSON.stringify(key)}:${stableReplayJson(value[key])}`;
    }).join(',')}}`;
  }
  fail('Canonical replay JSON contains an unsupported value.');
}

// FNV-1a 64 is used only for local deterministic identity.  It is not an
// authenticity primitive; signed share envelopes use SHA-256/HMAC below.
function localHash(value) {
  const bytes = typeof TextEncoder === 'function'
    ? new TextEncoder().encode(value)
    : Uint8Array.from(value, character => character.charCodeAt(0) & 0xff);
  let hash = 1469598103934665603n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Remove non-public fields and bound the resulting JSON value.  Public
 * display names, opaque p_/r_ references, package pins, and result summaries
 * remain available; provider/canonical/raw/credential values do not.
 */
export function sanitizeReplayValue(value, { depth = 0, label = 'value' } = {}) {
  if (depth > SWISHIQ_REPLAY_LIMITS.maxDepth) fail(`${label} is too deeply nested.`);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > SWISHIQ_REPLAY_LIMITS.maxString) fail(`${label} is too long.`);
    if (PRIVATE_TEXT.test(value)) fail(`${label} contains a private value.`, 'privacy-boundary');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${label} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > SWISHIQ_REPLAY_LIMITS.maxArray) fail(`${label} contains too many entries.`);
    return value.map((item, index) => sanitizeReplayValue(item, { depth: depth + 1, label: `${label}[${index}]` }));
  }
  if (!isPlainObject(value)) fail(`${label} contains an unsupported value.`);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (UNSAFE_KEYS.has(key)) fail(`${label} contains an unsafe key.`, 'privacy-boundary');
    if (PRIVATE_KEY.test(key)) continue;
    if (value[key] === undefined) continue;
    output[key] = sanitizeReplayValue(value[key], { depth: depth + 1, label: `${label}.${key}` });
  }
  return output;
}

export const sanitizePublicReplayValue = sanitizeReplayValue;

function publicPayload(value, label = 'replay payload') {
  if (!isPlainObject(value)) fail(`${label} must be a plain object.`);
  const cleaned = sanitizeReplayValue(value, { label });
  if (!isPlainObject(cleaned)) fail(`${label} must be a plain object.`);
  // Run canonical serialization here so byte limits and unsupported values
  // fail before a value reaches storage or a signer.
  const serialized = stableReplayJson(cleaned);
  if (serialized.length > SWISHIQ_REPLAY_LIMITS.maxRecordBytes) fail(`${label} exceeds the bounded replay size.`);
  return cleaned;
}

function safeStorage(storage) {
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    ? storage : null;
}

function defaultLocalStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function storageRead(storage, key) {
  const target = safeStorage(storage);
  if (!target) return null;
  try { return target.getItem(key); } catch { return null; }
}

function storageWrite(storage, key, value) {
  const target = safeStorage(storage);
  if (!target) return false;
  try { target.setItem(key, value); return true; } catch { return false; }
}

function storageRemove(storage, key) {
  const target = safeStorage(storage);
  if (!target) return false;
  try { target.removeItem?.(key); return true; } catch { return false; }
}

function replayRecord(value, replayId = null) {
  const payload = publicPayload(value);
  const canonical = stableReplayJson(payload);
  const hash = localHash(canonical);
  const id = replayId === null || replayId === undefined
    ? `replay-${hash}`
    : text(replayId, 'replayId', { maximum: 128, pattern: ID_PATTERN });
  return freeze({
    replayId: id,
    replayHash: `fnv1a64-${hash}`,
    payload: freeze(clone(payload)),
  });
}

function readReplayState(storage, key, maxRecords) {
  const raw = storageRead(storage, key);
  if (!raw) return { records: [], invalidCount: 0, status: 'empty' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { records: [], invalidCount: 1, status: 'invalid-json' }; }
  if (!isPlainObject(parsed) || parsed.format !== SWISHIQ_REPLAY_HISTORY_FORMAT
    || parsed.version !== SWISHIQ_REPLAY_HISTORY_VERSION || !Array.isArray(parsed.records)) {
    return { records: [], invalidCount: 1, status: 'invalid-envelope' };
  }
  const records = [];
  let invalidCount = 0;
  for (const candidate of parsed.records) {
    try {
      if (!isPlainObject(candidate) || typeof candidate.replayId !== 'string'
        || typeof candidate.replayHash !== 'string' || !isPlainObject(candidate.payload)) {
        throw new Error('invalid record');
      }
      const normalized = replayRecord(candidate.payload, candidate.replayId);
      if (normalized.replayHash !== candidate.replayHash
        || stableReplayJson(normalized.payload) !== stableReplayJson(candidate.payload)) throw new Error('changed record');
      if (!records.some(record => record.replayId === normalized.replayId)) records.push(normalized);
      else invalidCount += 1;
    } catch { invalidCount += 1; }
  }
  return {
    records: records.slice(-maxRecords),
    invalidCount,
    status: invalidCount ? 'partially-invalid' : 'valid',
  };
}

function replayStateJson(records) {
  const state = {
    format: SWISHIQ_REPLAY_HISTORY_FORMAT,
    version: SWISHIQ_REPLAY_HISTORY_VERSION,
    records: records.map(record => ({
      replayId: record.replayId,
      replayHash: record.replayHash,
      payload: record.payload,
    })),
  };
  const serialized = stableReplayJson(state);
  if (serialized.length > SWISHIQ_REPLAY_LIMITS.maxStoreBytes) fail('Replay history exceeds the bounded local store.');
  return serialized;
}

/** Create a bounded, local-only replay/history store. */
export function createLocalReplayHistory({
  storage = defaultLocalStorage(),
  key = SWISHIQ_REPLAY_HISTORY_STORAGE_KEY,
  maxRecords = SWISHIQ_REPLAY_LIMITS.maxRecords,
} = {}) {
  const storageKey = text(key, 'replay history key', { maximum: 180, pattern: /^[A-Za-z0-9._:-]+$/ });
  const limit = Math.max(1, Math.min(SWISHIQ_REPLAY_LIMITS.maxRecords, Math.floor(Number(maxRecords) || SWISHIQ_REPLAY_LIMITS.maxRecords)));
  let state = readReplayState(storage, storageKey, limit);
  let records = state.records;

  const persist = () => storageWrite(storage, storageKey, replayStateJson(records));
  const snapshot = () => freeze({
    format: SWISHIQ_REPLAY_HISTORY_FORMAT,
    version: SWISHIQ_REPLAY_HISTORY_VERSION,
    records: clone(records),
  });
  const list = () => freeze(clone(records));

  const api = {
    get key() { return storageKey; },
    get invalidCount() { return state.invalidCount; },
    get status() { return state.status; },
    list,
    snapshot,
    get(replayId) {
      const id = String(replayId || '');
      const found = records.find(record => record.replayId === id);
      return found ? freeze(clone(found)) : null;
    },
    save(payload, { replayId = null } = {}) {
      const next = replayRecord(payload, replayId);
      const existing = records.find(record => record.replayId === next.replayId);
      if (existing) {
        if (existing.replayHash !== next.replayHash || stableReplayJson(existing.payload) !== stableReplayJson(next.payload)) {
          fail('A replay ID is already bound to different public content.', 'replay-conflict');
        }
        return freeze({ stored: false, changed: false, record: clone(existing) });
      }
      records = [...records, next].slice(-limit);
      const stored = persist();
      state = { invalidCount: 0, status: stored ? 'valid' : 'memory-only' };
      return freeze({ stored, changed: true, record: clone(next) });
    },
    // Friendly aliases for callers that use append/record terminology.
    append(payload, options) { return api.save(payload, options); },
    record(payload, options) { return api.save(payload, options); },
    remove(replayId) {
      const id = String(replayId || '');
      const next = records.filter(record => record.replayId !== id);
      if (next.length === records.length) return false;
      records = next;
      persist();
      return true;
    },
    clear() {
      records = [];
      state = { invalidCount: 0, status: storageRemove(storage, storageKey) ? 'empty' : 'memory-only' };
      return true;
    },
    reload() {
      state = readReplayState(storage, storageKey, limit);
      records = state.records;
      return snapshot();
    },
  };
  return Object.freeze(api);
}

export function loadLocalReplayHistory(options = {}) {
  return createLocalReplayHistory(options).snapshot();
}

export const createReplayHistory = createLocalReplayHistory;
export const loadReplayHistory = loadLocalReplayHistory;
export const createReplayStore = createLocalReplayHistory;

export function isReplayHistoryEnvelope(value) {
  return isPlainObject(value) && value.format === SWISHIQ_REPLAY_HISTORY_FORMAT
    && value.version === SWISHIQ_REPLAY_HISTORY_VERSION && Array.isArray(value.records);
}

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return new TextEncoder().encode(value);
  fail('Signature bytes are invalid.');
}

function base64urlEncode(value) {
  const data = bytes(value);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  const buffer = globalThis.Buffer;
  if (!buffer) fail('Base64 encoding is unavailable.', 'crypto-unavailable');
  return buffer.from(data).toString('base64url');
}

function base64urlDecode(value) {
  if (typeof value !== 'string' || !BASE64URL_PATTERN.test(value)) fail('Signature encoding is invalid.');
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }
  const buffer = globalThis.Buffer;
  if (!buffer) fail('Base64 decoding is unavailable.', 'crypto-unavailable');
  return Uint8Array.from(buffer.from(padded, 'base64'));
}

async function sha256Hex(value, cryptoImpl = globalThis.crypto) {
  const subtle = cryptoImpl?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') fail('Web Crypto SHA-256 is unavailable.', 'crypto-unavailable');
  const digest = await subtle.digest('SHA-256', bytes(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cryptoKey(value) {
  return value && typeof value === 'object' && typeof value.type === 'string' && value.algorithm ? value : null;
}

async function hmacKey(secret, cryptoImpl, usage) {
  const subtle = cryptoImpl?.subtle;
  if (!subtle || typeof subtle.importKey !== 'function') fail('Web Crypto HMAC is unavailable.', 'crypto-unavailable');
  if (cryptoKey(secret)) return secret;
  const raw = bytes(secret);
  if (!raw.byteLength) fail('A non-empty signing secret is required.', 'missing-signer');
  return subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function hmacSignature(canonical, secret, cryptoImpl, usage = 'sign') {
  const subtle = cryptoImpl?.subtle;
  if (!subtle || typeof subtle.sign !== 'function') fail('Web Crypto HMAC is unavailable.', 'crypto-unavailable');
  const key = await hmacKey(secret, cryptoImpl, usage);
  return new Uint8Array(await subtle.sign({ name: 'HMAC' }, key, bytes(canonical)));
}

function envelopeBody(envelope) {
  const body = {
    format: envelope.format,
    version: envelope.version,
    algorithm: envelope.algorithm,
    keyId: envelope.keyId,
    shareId: envelope.shareId,
    payloadHash: envelope.payloadHash,
    payload: envelope.payload,
  };
  if (envelope.createdAt !== undefined) body.createdAt = envelope.createdAt;
  return body;
}

function validateCreatedAt(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = text(value, 'createdAt', { maximum: 40, pattern: ISO_INSTANT });
  if (!Number.isFinite(Date.parse(normalized))) fail('createdAt is invalid.');
  return normalized;
}

function validateEnvelopeShape(value, { allowUnsigned = false } = {}) {
  if (!isPlainObject(value)) return { ok: false, reason: 'not-object' };
  const allowed = new Set(['format', 'version', 'algorithm', 'keyId', 'shareId', 'payloadHash', 'payload', 'signature', 'createdAt']);
  if (Object.keys(value).some(key => !allowed.has(key))) return { ok: false, reason: 'unsupported-field' };
  if (value.format !== SWISHIQ_SHARE_ENVELOPE_FORMAT || value.version !== SWISHIQ_SHARE_ENVELOPE_VERSION
    || value.algorithm !== SWISHIQ_SHARE_SIGNATURE_ALGORITHM) return { ok: false, reason: 'unsupported-format' };
  try {
    text(value.keyId, 'keyId', { maximum: 80, pattern: KEY_PATTERN });
    text(value.shareId, 'shareId', { maximum: 128, pattern: /^share-[a-f0-9]{24,64}$/ });
    text(value.payloadHash, 'payloadHash', { maximum: 64, pattern: HASH_PATTERN });
    if (value.shareId !== `share-${value.payloadHash.slice(0, 32)}`) return { ok: false, reason: 'share-id-mismatch' };
    if (!allowUnsigned) text(value.signature, 'signature', { maximum: 128, pattern: BASE64URL_PATTERN });
    else if (value.signature !== undefined && value.signature !== null) text(value.signature, 'signature', { maximum: 128, pattern: BASE64URL_PATTERN });
    const createdAt = validateCreatedAt(value.createdAt);
    const payload = publicPayload(value.payload, 'share payload');
    if (stableReplayJson(payload) !== stableReplayJson(value.payload)) return { ok: false, reason: 'payload-not-canonical' };
    return {
      ok: true,
      body: {
        format: value.format,
        version: value.version,
        algorithm: value.algorithm,
        keyId: value.keyId,
        shareId: value.shareId,
        payloadHash: value.payloadHash,
        payload,
        ...(createdAt !== undefined ? { createdAt } : {}),
      },
      signature: value.signature,
    };
  } catch (error) {
    return { ok: false, reason: error?.code || 'invalid-envelope' };
  }
}

/**
 * Create a deterministic signed share envelope.  Either `secret` (trusted
 * HMAC boundary) or an async `signer(canonicalBody, envelopeBody)` callback
 * is required.  No timestamp or random nonce is introduced automatically.
 */
export async function createSignedShareEnvelope(payload, {
  secret = null,
  signer = null,
  keyId = 'default',
  createdAt,
  cryptoImpl = globalThis.crypto,
} = {}) {
  const cleanedPayload = publicPayload(payload, 'share payload');
  const normalizedKeyId = text(keyId, 'keyId', { maximum: 80, pattern: KEY_PATTERN });
  const payloadHash = await sha256Hex(stableReplayJson(cleanedPayload), cryptoImpl);
  const shareId = `share-${payloadHash.slice(0, 32)}`;
  const body = {
    format: SWISHIQ_SHARE_ENVELOPE_FORMAT,
    version: SWISHIQ_SHARE_ENVELOPE_VERSION,
    algorithm: SWISHIQ_SHARE_SIGNATURE_ALGORITHM,
    keyId: normalizedKeyId,
    shareId,
    payloadHash,
    payload: cleanedPayload,
  };
  const normalizedCreatedAt = validateCreatedAt(createdAt);
  if (normalizedCreatedAt !== undefined) body.createdAt = normalizedCreatedAt;
  const canonical = stableReplayJson(body);
  let signature;
  if (typeof signer === 'function') {
    signature = await signer(canonical, clone(body));
    signature = typeof signature === 'string' ? base64urlDecode(signature) : bytes(signature);
  } else {
    if (secret === null || secret === undefined) fail('A trusted share envelope signer is required.', 'missing-signer');
    signature = await hmacSignature(canonical, secret, cryptoImpl, 'sign');
  }
  if (signature.length < 16) fail('Share envelope signature is too short.', 'invalid-signature');
  const envelope = { ...body, signature: base64urlEncode(signature) };
  const checked = validateEnvelopeShape(envelope);
  if (!checked.ok) fail('The generated share envelope failed its own validation.', checked.reason);
  return freeze(clone(envelope));
}

/** Verify a detached signed envelope; invalid input returns ok:false and no payload. */
export async function verifySignedShareEnvelope(value, {
  secret = null,
  verifier = null,
  keyResolver = null,
  allowedKeyIds = null,
  cryptoImpl = globalThis.crypto,
} = {}) {
  const checked = validateEnvelopeShape(value);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const { body, signature } = checked;
  if (Array.isArray(allowedKeyIds) && !allowedKeyIds.map(String).includes(body.keyId)) return { ok: false, reason: 'key-not-allowed' };
  const expectedHash = await sha256Hex(stableReplayJson(body.payload), cryptoImpl).catch(() => null);
  if (!expectedHash || expectedHash !== body.payloadHash) return { ok: false, reason: 'payload-hash-mismatch' };
  const canonical = stableReplayJson(body);
  let valid = false;
  try {
    if (typeof verifier === 'function') {
      valid = (await verifier(canonical, signature, clone(body))) === true;
    } else {
      let resolvedSecret = secret;
      if ((resolvedSecret === null || resolvedSecret === undefined) && typeof keyResolver === 'function') {
        resolvedSecret = await keyResolver(body.keyId, clone(body));
      }
      if (resolvedSecret === null || resolvedSecret === undefined) return { ok: false, reason: 'missing-verifier' };
      const subtle = cryptoImpl?.subtle;
      if (!subtle || typeof subtle.verify !== 'function') return { ok: false, reason: 'crypto-unavailable' };
      const key = await hmacKey(resolvedSecret, cryptoImpl, 'verify');
      valid = await subtle.verify({ name: 'HMAC' }, key, base64urlDecode(signature), bytes(canonical));
    }
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'signature-mismatch' };
  return freeze({ ok: true, envelope: clone({ ...body, signature }), payload: clone(body.payload), shareId: body.shareId });
}

export async function requireVerifiedShareEnvelope(value, options = {}) {
  const result = await verifySignedShareEnvelope(value, options);
  if (!result.ok) fail(`Share envelope rejected: ${result.reason}.`, 'share-rejected');
  return result.payload;
}

export function serializeShareEnvelope(value) {
  const checked = validateEnvelopeShape(value);
  if (!checked.ok) fail(`Share envelope cannot be serialized: ${checked.reason}.`, 'share-rejected');
  return stableReplayJson(value);
}

export function parseShareEnvelope(value) {
  if (typeof value !== 'string' || value.length > SWISHIQ_REPLAY_LIMITS.maxRecordBytes) return null;
  try {
    const parsed = JSON.parse(value);
    return validateEnvelopeShape(parsed).ok ? freeze(clone(parsed)) : null;
  } catch { return null; }
}

// Friendly aliases used by callers that describe the operation as a share
// envelope builder/verifier rather than a signer.
export const buildSignedShareEnvelope = createSignedShareEnvelope;
export const createShareEnvelope = createSignedShareEnvelope;
export const buildShareEnvelope = createSignedShareEnvelope;
export const verifyShareEnvelope = verifySignedShareEnvelope;

function consentFromStorage(storage) {
  const target = safeStorage(storage);
  if (!target) return false;
  try {
    const current = target.getItem('djhc-analytics-consent');
    if (current === 'granted') return true;
    if (current === 'denied') return false;
    return target.getItem('analytics-consent') === 'granted';
  } catch { return false; }
}

function normalizeTelemetryDimension(value, pattern, maximum, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized || normalized.length > maximum || !pattern.test(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function telemetryState(storage, key) {
  const raw = storageRead(storage, key);
  if (!raw) return { buckets: {}, invalidCount: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || parsed.format !== SWISHIQ_AGGREGATE_TELEMETRY_FORMAT
      || parsed.version !== SWISHIQ_AGGREGATE_TELEMETRY_VERSION || !isPlainObject(parsed.buckets)) {
      return { buckets: {}, invalidCount: 1 };
    }
    const buckets = {};
    for (const [keyName, value] of Object.entries(parsed.buckets)) {
      if (!isPlainObject(value) || !Number.isSafeInteger(value.count) || value.count < 0
        || !Number.isFinite(Number(value.durationTotal)) || value.durationTotal < 0
        || !Number.isFinite(Number(value.durationMax ?? 0)) || Number(value.durationMax ?? 0) < 0) continue;
      const event = String(value.event || '').trim().toLowerCase();
      const kind = String(value.kind || '').trim().toLowerCase();
      const milestone = String(value.milestone || '').trim().toLowerCase();
      if (!SAFE_KIND.test(event) || !SAFE_KIND.test(kind) || !SAFE_MILESTONE.test(milestone)
        || keyName !== `${event}|${kind}|${milestone}`) continue;
      buckets[keyName] = {
        event,
        kind,
        milestone,
        count: Math.min(value.count, 1_000_000),
        durationTotal: Math.min(Math.round(Number(value.durationTotal) * 100) / 100, 3_600_000_000),
        durationMax: Math.min(Math.round(Number(value.durationMax || 0) * 100) / 100, SWISHIQ_TELEMETRY_LIMITS.maxDuration),
      };
    }
    return { buckets, invalidCount: 0 };
  } catch { return { buckets: {}, invalidCount: 1 }; }
}

function telemetryJson(buckets) {
  const state = {
    format: SWISHIQ_AGGREGATE_TELEMETRY_FORMAT,
    version: SWISHIQ_AGGREGATE_TELEMETRY_VERSION,
    buckets: Object.fromEntries(Object.entries(buckets).sort(([left], [right]) => left.localeCompare(right))),
  };
  const serialized = stableReplayJson(state);
  if (serialized.length > SWISHIQ_REPLAY_LIMITS.maxStoreBytes) fail('Aggregate telemetry exceeds the bounded local store.');
  return serialized;
}

/**
 * Consent-bound, aggregate-only telemetry.  No event is accepted, persisted,
 * or sent while consent is false.  The tracker receives only counters and a
 * bounded duration; arbitrary caller fields are intentionally ignored.
 */
export function createAggregateTelemetry({
  consent = undefined,
  tracker = null,
  storage = null,
  key = SWISHIQ_AGGREGATE_TELEMETRY_STORAGE_KEY,
} = {}) {
  const storageKey = text(key, 'telemetry key', { maximum: 180, pattern: /^[A-Za-z0-9._:-]+$/ });
  let consentState = consent;
  const consentValue = () => {
    try {
      return typeof consentState === 'function'
        ? Boolean(consentState())
        : consentState === undefined ? consentFromStorage(storage) : Boolean(consentState);
    } catch {
      return false;
    }
  };
  let buckets;
  if (consentValue()) buckets = telemetryState(storage, storageKey).buckets;
  else {
    // A removed or denied preference is a revocation boundary. Do not retain
    // a previous opt-in's local aggregate payload after the page is reopened.
    storageRemove(storage, storageKey);
    buckets = {};
  }

  const snapshot = () => freeze({
    format: SWISHIQ_AGGREGATE_TELEMETRY_FORMAT,
    version: SWISHIQ_AGGREGATE_TELEMETRY_VERSION,
    buckets: clone(Object.fromEntries(Object.entries(buckets).sort(([left], [right]) => left.localeCompare(right)))),
  });
  const clear = () => {
    buckets = {};
    storageRemove(storage, storageKey);
  };
  const persist = () => {
    if (!consentValue()) return false;
    return storageWrite(storage, storageKey, telemetryJson(buckets));
  };

  const api = {
    get consentGranted() { return consentValue(); },
    snapshot,
    clear,
    setConsent(value) {
      const granted = Boolean(value);
      consentState = granted;
      if (!granted) clear();
      else if (!Object.keys(buckets).length) buckets = telemetryState(storage, storageKey).buckets;
      return granted;
    },
    record(event, data = {}) {
      if (!consentValue()) {
        if (Object.keys(buckets).length) clear();
        return { accepted: false, reason: 'consent-required' };
      }
      const source = isPlainObject(data) ? data : {};
      let eventName;
      try { eventName = normalizeTelemetryDimension(event, SAFE_KIND, 40, 'event'); } catch { return { accepted: false, reason: 'event-invalid' }; }
      let kind;
      let milestone;
      try {
        kind = normalizeTelemetryDimension(source.kind || 'unknown', SAFE_KIND, SWISHIQ_TELEMETRY_LIMITS.maxKindLength, 'kind');
        milestone = normalizeTelemetryDimension(source.milestone || 'event', SAFE_MILESTONE, SWISHIQ_TELEMETRY_LIMITS.maxMilestoneLength, 'milestone');
      } catch { return { accepted: false, reason: 'dimension-invalid' }; }
      let duration = 0;
      try { duration = Math.round(finiteNumber(source.duration ?? 0, 'duration', { minimum: 0, maximum: SWISHIQ_TELEMETRY_LIMITS.maxDuration }) * 100) / 100; } catch { return { accepted: false, reason: 'duration-invalid' }; }
      const bucketKey = `${eventName}|${kind}|${milestone}`;
      if (!buckets[bucketKey] && Object.keys(buckets).length >= SWISHIQ_TELEMETRY_LIMITS.maxBuckets) {
        return { accepted: false, reason: 'bucket-limit' };
      }
      const prior = buckets[bucketKey] || { event: eventName, kind, milestone, count: 0, durationTotal: 0, durationMax: 0 };
      buckets[bucketKey] = {
        event: eventName,
        kind,
        milestone,
        count: Math.min(1_000_000, prior.count + 1),
        durationTotal: Math.min(3_600_000_000, Math.round((prior.durationTotal + duration) * 100) / 100),
        durationMax: Math.max(prior.durationMax, duration),
      };
      persist();
      return { accepted: true, bucket: clone(buckets[bucketKey]) };
    },
    flush() {
      if (!consentValue()) {
        if (Object.keys(buckets).length) clear();
        return { sent: 0, pending: 0 };
      }
      if (typeof tracker !== 'function') return { sent: 0, pending: Object.keys(buckets).length };
      let sent = 0;
      for (const [bucketKey, bucket] of Object.entries(buckets).sort(([left], [right]) => left.localeCompare(right))) {
        try {
          const result = tracker(bucket.event, {
            kind: bucket.kind,
            milestone: bucket.milestone,
            count: bucket.count,
            duration: bucket.durationTotal,
            durationMax: bucket.durationMax,
          });
          if (result === false) continue;
          delete buckets[bucketKey];
          sent += 1;
        } catch {
          // Keep failed buckets for a later explicit flush.
        }
      }
      persist();
      return { sent, pending: Object.keys(buckets).length };
    },
  };
  return Object.freeze(api);
}

export function hasAnalyticsConsent(storage = defaultLocalStorage()) {
  return consentFromStorage(storage);
}

export const createConsentBoundTelemetry = createAggregateTelemetry;
export const createAggregateTelemetryStore = createAggregateTelemetry;

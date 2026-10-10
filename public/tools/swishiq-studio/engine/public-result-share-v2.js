/*
 * Verify-only Ed25519 envelope for the public-result-share-v1 projection.
 *
 * Signatures are detached from the payload: Ed25519 verifies a canonical
 * header containing the SHA-256 digest of the separately carried payload.
 * This module deliberately has no signing method, private-key import path,
 * secret, key resolver, or UI integration. Callers provide an explicit
 * allowlist of trusted public CryptoKeys.
 */

import { projectPublicResultShareV1 } from './public-result-share.js?v=20260929e&rev=game-points-v2-public-share-20260929e';
import {
  projectPublicResultShareV4PayloadShape,
  PUBLIC_RESULT_SHARE_V4_FORMAT,
} from './public-result-share-v4.js?v=20261001e&rev=daily-v4-rank-share-summary-v2';

export const PUBLIC_RESULT_SHARE_V2_ENVELOPE_FORMAT = 'djhc-swishiq-public-result-share-envelope-v2';
export const PUBLIC_RESULT_SHARE_V2_ENVELOPE_VERSION = 2;
export const PUBLIC_RESULT_SHARE_V2_ALGORITHM = 'Ed25519';

export const PUBLIC_RESULT_SHARE_V2_LIMITS = Object.freeze({
  maxEnvelopeBytes: 16_384,
  maxPayloadBytes: 8_000,
  maxLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  maxKeyIds: 32,
  maxDepth: 8,
  maxArrayLength: 64,
  maxStringLength: 1_024,
  maxKeyLength: 120,
  maxNodes: 4_096,
});

const ENVELOPE_KEYS = Object.freeze([
  'format', 'version', 'algorithm', 'keyId', 'issuedAt', 'expiresAt',
  'payloadSha256', 'payload', 'signature',
]);
const HEADER_KEYS = Object.freeze([
  'format', 'version', 'algorithm', 'keyId', 'issuedAt', 'expiresAt', 'payloadSha256',
]);
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const encoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

class ShareVerificationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ShareVerificationError';
    this.reason = reason;
  }
}

function reject(reason) {
  throw new ShareVerificationError(reason);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8Size(text) {
  if (!encoder) reject('crypto-unavailable');
  return encoder.encode(text).byteLength;
}

function canonicalJson(value) {
  const seen = new WeakSet();
  let nodes = 0;

  function visit(current, depth, path) {
    nodes += 1;
    if (nodes > PUBLIC_RESULT_SHARE_V2_LIMITS.maxNodes || depth > PUBLIC_RESULT_SHARE_V2_LIMITS.maxDepth) {
      reject('value-limit');
    }
    if (current === null) return 'null';
    if (typeof current === 'boolean') return current ? 'true' : 'false';
    if (typeof current === 'string') {
      if (current.length > PUBLIC_RESULT_SHARE_V2_LIMITS.maxStringLength) reject('value-limit');
      return JSON.stringify(current);
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) reject('invalid-json-value');
      return JSON.stringify(current);
    }
    if (!current || typeof current !== 'object') reject('invalid-json-value');
    if (seen.has(current)) reject('invalid-json-value');
    seen.add(current);

    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype || current.length > PUBLIC_RESULT_SHARE_V2_LIMITS.maxArrayLength) {
        reject('value-limit');
      }
      const ownKeys = Reflect.ownKeys(current);
      const keys = ownKeys.filter(key => key !== 'length');
      if (ownKeys.some(key => typeof key === 'symbol') || keys.length !== current.length
        || keys.some(key => typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key))) {
        reject('invalid-json-value');
      }
      const parts = [];
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('invalid-json-value');
        parts.push(visit(descriptor.value, depth + 1, `${path}[${index}]`));
      }
      seen.delete(current);
      return `[${parts.join(',')}]`;
    }

    if (!isPlainRecord(current)) reject('invalid-json-value');
    const ownKeys = Reflect.ownKeys(current);
    if (ownKeys.some(key => typeof key === 'symbol') || ownKeys.some(key => typeof key !== 'string')) {
      reject('invalid-json-value');
    }
    const keys = ownKeys.slice().sort();
    const parts = [];
    for (const key of keys) {
      if (key.length > PUBLIC_RESULT_SHARE_V2_LIMITS.maxKeyLength
        || key === '__proto__' || key === 'prototype' || key === 'constructor') reject('invalid-json-value');
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('invalid-json-value');
      parts.push(`${JSON.stringify(key)}:${visit(descriptor.value, depth + 1, `${path}.${key}`)}`);
    }
    seen.delete(current);
    return `{${parts.join(',')}}`;
  }

  return visit(value, 0, 'value');
}

function exactEnvelopeFields(value) {
  if (!isPlainRecord(value)) reject('invalid-envelope-shape');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string') || keys.length !== ENVELOPE_KEYS.length
    || ENVELOPE_KEYS.some(key => !Object.hasOwn(value, key))) reject('invalid-envelope-shape');
  for (const key of ENVELOPE_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('invalid-envelope-shape');
  }
  return Object.fromEntries(ENVELOPE_KEYS.map(key => [key, value[key]]));
}

function exactTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function base64UrlDecode(value) {
  if (typeof value !== 'string' || !SIGNATURE_PATTERN.test(value)) reject('invalid-signature-shape');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '==';
  let binary;
  if (typeof atob === 'function') {
    binary = atob(normalized);
  } else {
    const bytes = [];
    let accumulator = 0;
    let bits = 0;
    for (const character of value) {
      const digit = BASE64URL_ALPHABET.indexOf(character);
      if (digit < 0) reject('invalid-signature-shape');
      accumulator = (accumulator << 6) | digit;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((accumulator >> bits) & 0xff);
      }
    }
    if (bits !== 4 || (accumulator & 0x0f) !== 0) reject('invalid-signature-shape');
    const decoded = new Uint8Array(bytes);
    if (decoded.length !== 64 || base64UrlEncode(decoded) !== value) reject('invalid-signature-shape');
    return decoded;
  }
  const decoded = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (decoded.length !== 64 || base64UrlEncode(decoded) !== value) reject('invalid-signature-shape');
  return decoded;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  let encoded;
  if (typeof btoa === 'function') encoded = btoa(binary);
  else {
    let accumulator = 0;
    let bits = 0;
    encoded = '';
    for (const byte of bytes) {
      accumulator = (accumulator << 8) | byte;
      bits += 8;
      while (bits >= 6) {
        bits -= 6;
        encoded += BASE64URL_ALPHABET[(accumulator >> bits) & 0x3f];
      }
    }
    if (bits > 0) encoded += BASE64URL_ALPHABET[(accumulator << (6 - bits)) & 0x3f];
  }
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function lookupTrustedKey(trustedPublicKeys, keyId) {
  if (!isPlainRecord(trustedPublicKeys)) reject('missing-key-allowlist');
  const keys = Reflect.ownKeys(trustedPublicKeys);
  if (keys.length < 1 || keys.length > PUBLIC_RESULT_SHARE_V2_LIMITS.maxKeyIds
    || keys.some(key => typeof key !== 'string' || !KEY_ID_PATTERN.test(key))) reject('invalid-key-allowlist');
  for (const candidate of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(trustedPublicKeys, candidate);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) reject('invalid-key-allowlist');
  }
  if (!Object.hasOwn(trustedPublicKeys, keyId)) reject('unknown-key-id');
  const key = trustedPublicKeys[keyId];
  if (!key || key.type !== 'public' || key.algorithm?.name !== PUBLIC_RESULT_SHARE_V2_ALGORITHM
    || !Array.isArray(key.usages) || key.usages.length !== 1 || key.usages[0] !== 'verify') {
    reject('invalid-public-key');
  }
  return key;
}

function headerFor(envelope) {
  return {
    format: envelope.format,
    version: envelope.version,
    algorithm: envelope.algorithm,
    keyId: envelope.keyId,
    issuedAt: envelope.issuedAt,
    expiresAt: envelope.expiresAt,
    payloadSha256: envelope.payloadSha256,
  };
}

async function sha256Hex(text, subtle) {
  const digest = await subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function failure(reason) {
  return Object.freeze({ ok: false, reason });
}

/**
 * Verify a detached v2 signature over the canonical header and strict v1
 * payload. `trustedPublicKeys` is the verifier's explicit keyId allowlist;
 * every entry must be a public Ed25519 CryptoKey with verify-only usage.
 *
 * @param {object} envelope Public JSON envelope. No signer is provided here.
 * @param {object} options Trusted public keys, current time in milliseconds, and WebCrypto implementation.
 * @returns {Promise<{ok: true, payload: object, keyId: string, expiresAt: string}|{ok: false, reason: string}>}
 */
export async function verifyPublicResultShareEnvelopeV2(envelope, {
  trustedPublicKeys,
  now = Date.now(),
  cryptoImpl = globalThis.crypto,
} = {}) {
  try {
    const fullCanonical = canonicalJson(envelope);
    if (utf8Size(fullCanonical) > PUBLIC_RESULT_SHARE_V2_LIMITS.maxEnvelopeBytes) reject('envelope-too-large');
    const value = exactEnvelopeFields(envelope);
    if (value.format !== PUBLIC_RESULT_SHARE_V2_ENVELOPE_FORMAT
      || value.version !== PUBLIC_RESULT_SHARE_V2_ENVELOPE_VERSION
      || value.algorithm !== PUBLIC_RESULT_SHARE_V2_ALGORITHM) reject('unsupported-envelope');
    if (typeof now !== 'number' || !Number.isFinite(now)) reject('invalid-clock');
    if (typeof value.keyId !== 'string' || !KEY_ID_PATTERN.test(value.keyId)) reject('invalid-key-id');
    if (!SHA256_PATTERN.test(value.payloadSha256 || '')) reject('invalid-payload-hash');

    const issuedAt = exactTimestamp(value.issuedAt);
    const expiresAt = exactTimestamp(value.expiresAt);
    if (issuedAt === null || expiresAt === null || expiresAt <= issuedAt
      || expiresAt - issuedAt > PUBLIC_RESULT_SHARE_V2_LIMITS.maxLifetimeMs) reject('invalid-expiry');
    if (issuedAt > now) reject('issued-in-future');
    if (expiresAt <= now) reject('expired');

    const payloadJson = canonicalJson(value.payload);
    if (utf8Size(payloadJson) > PUBLIC_RESULT_SHARE_V2_LIMITS.maxPayloadBytes) reject('payload-too-large');
    let projectedPayload;
    try {
      projectedPayload = value.payload?.format === PUBLIC_RESULT_SHARE_V4_FORMAT
        ? projectPublicResultShareV4PayloadShape(value.payload)
        : projectPublicResultShareV1(value.payload);
    } catch {
      reject('invalid-payload');
    }
    if (canonicalJson(projectedPayload) !== payloadJson) reject('invalid-payload');

    if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function'
      || typeof cryptoImpl.subtle.verify !== 'function' || !encoder) reject('crypto-unavailable');
    const publicKey = lookupTrustedKey(trustedPublicKeys, value.keyId);
    const computedHash = await sha256Hex(payloadJson, cryptoImpl.subtle);
    if (computedHash !== value.payloadSha256) reject('payload-hash-mismatch');
    const signature = base64UrlDecode(value.signature);
    const signedHeader = canonicalJson(headerFor(value));
    let valid = false;
    try {
      valid = await cryptoImpl.subtle.verify(
        { name: PUBLIC_RESULT_SHARE_V2_ALGORITHM },
        publicKey,
        signature,
        encoder.encode(signedHeader),
      );
    } catch {
      valid = false;
    }
    if (!valid) reject('signature-mismatch');
    return Object.freeze({
      ok: true,
      payload: projectedPayload,
      keyId: value.keyId,
      expiresAt: value.expiresAt,
    });
  } catch (error) {
    return failure(error instanceof ShareVerificationError ? error.reason : 'invalid-envelope');
  }
}

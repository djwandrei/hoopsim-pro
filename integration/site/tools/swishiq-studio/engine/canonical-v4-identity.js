/*
 * Browser-safe primitives shared by the V4 projection resolver and its
 * cross-runtime conformance tests. Keep this implementation aligned with
 * prototypes/swishiq-package-v4/scripts/lib/build-identity.mjs.
 */

const PACKAGE_VERSION_PREFIX = 'v4-canonical-20260929-';
const HASH_RE = /^[a-f0-9]{64}$/;

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Build identity cannot contain a non-finite number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error('Build identity cannot contain sparse arrays.');
      items.push(canonicalJson(value[index]));
    }
    return '[' + items.join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Build identity only accepts plain objects.');
    }
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  throw new Error('Build identity cannot contain unsupported values.');
}

export function canonicalV4IdentityJson(value) {
  return canonicalJson(value);
}

export function v4PackageVersionForDigest(digest) {
  assertDigest(digest, 'package build recipe digest');
  return PACKAGE_VERSION_PREFIX + digest.slice(0, 12);
}

export function v4BundleVersionForDigest(digest) {
  assertDigest(digest, 'bundle build recipe digest');
  return PACKAGE_VERSION_PREFIX + digest.slice(0, 12);
}

export async function v4Sha256Hex(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('Web Crypto SHA-256 is unavailable in this browser context.');
  }
  const bytes = toBytes(value);
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function v4BuildRecipeDigest(recipe) {
  return v4Sha256Hex(canonicalV4IdentityJson(recipe));
}

export async function v4CanonicalContentDigest(value, omittedField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Canonical content hash input must be a plain object.');
  }
  const copy = { ...value };
  delete copy[omittedField];
  return v4BuildRecipeDigest(copy);
}

export function v4IdentityDigestIsValid(value) {
  return typeof value === 'string' && HASH_RE.test(value);
}

function assertDigest(value, label) {
  if (!v4IdentityDigestIsValid(value)) throw new Error(label + ' must be a lowercase SHA-256 digest.');
}

function toBytes(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('SHA-256 input must be text or bytes.');
}

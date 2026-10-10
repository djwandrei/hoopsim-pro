/*
 * Explicit browser trust configuration for public result-share signatures.
 * There is intentionally no production signing key configured yet. Add only
 * reviewed Ed25519 public JWKs here; never add a private key or accept a key
 * supplied by the share URL.
 */

export const PUBLIC_RESULT_SHARE_TRUSTED_PUBLIC_KEY_JWKS = Object.freeze({});

const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

export async function importPublicResultShareTrustedKeys({ cryptoImpl = globalThis.crypto } = {}) {
  const entries = Object.entries(PUBLIC_RESULT_SHARE_TRUSTED_PUBLIC_KEY_JWKS);
  if (entries.length > 32) throw new TypeError('The public result-share key allowlist is too large.');
  const trustedPublicKeys = Object.create(null);
  for (const [keyId, jwk] of entries) {
    if (!KEY_ID.test(keyId) || !jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519'
      || typeof jwk.x !== 'string' || !BASE64URL_32_BYTES.test(jwk.x)
      || Object.hasOwn(jwk, 'd')) {
      throw new TypeError('The public result-share allowlist contains an invalid public key.');
    }
    if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.importKey !== 'function') {
      throw new TypeError('This browser cannot import a trusted public result-share key.');
    }
    trustedPublicKeys[keyId] = await cryptoImpl.subtle.importKey(
      'jwk',
      jwk,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
  }
  return Object.freeze(trustedPublicKeys);
}

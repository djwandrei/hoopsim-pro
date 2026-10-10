import { validateFranchiseBrowserSession } from './franchise-browser-session-v1.mjs';
import { sha256HexV1, stableStringifyV1 } from './sha256-isomorphic-v1.mjs';

export const MAX_FRANCHISE_CHECKPOINT_BYTES = 128 * 1024 * 1024;
export const FRANCHISE_BROWSER_CHECKPOINT_FORMAT = 'djhc-franchise-browser-checkpoint-v1';
export const FRANCHISE_BROWSER_CHECKPOINT_VERSION = 1;
export const FRANCHISE_BROWSER_CHECKPOINT_CANONICALIZATION = 'djhc-stable-json-v1';
const encoder = new TextEncoder();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function checkpointPayload(session) {
  return { format: FRANCHISE_BROWSER_CHECKPOINT_FORMAT,
    version: FRANCHISE_BROWSER_CHECKPOINT_VERSION, session };
}

function makeIntegrityReceipt(payload) {
  return { algorithm: 'SHA-256', canonicalization: FRANCHISE_BROWSER_CHECKPOINT_CANONICALIZATION,
    payloadSha256: sha256HexV1(stableStringifyV1(payload)) };
}

function validateJson(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `Checkpoint contains a nonfinite number at ${path}.`);
    return;
  }
  assert(typeof value === 'object', `Checkpoint contains a non-JSON value at ${path}.`);
  assert(!ancestors.has(value), `Checkpoint contains a circular value at ${path}.`);
  const prototype = Object.getPrototypeOf(value);
  assert(Array.isArray(value) || prototype === Object.prototype || prototype === null,
    `Checkpoint contains a non-plain object at ${path}.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assert(Object.hasOwn(value, index), `Checkpoint contains a sparse array at ${path}[${index}].`);
      validateJson(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(value)) validateJson(child, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

/** Full-league file/IndexedDB budget, separate from the small localStorage save.
 * Validation and source/model pins are identical on both paths. */
export function serializeFranchiseBrowserCheckpoint(session, { maxBytes = MAX_FRANCHISE_CHECKPOINT_BYTES } = {}) {
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_FRANCHISE_CHECKPOINT_BYTES, 'Invalid checkpoint byte budget.');
  validateJson(session);
  validateFranchiseBrowserSession(session);
  const payload = checkpointPayload(session);
  const checkpoint = { ...payload, integrityReceipt: makeIntegrityReceipt(payload) };
  const text = stableStringifyV1(checkpoint);
  assert(encoder.encode(text).byteLength <= maxBytes, `Franchise checkpoint exceeds the ${maxBytes}-byte budget.`);
  return text;
}

export function restoreFranchiseBrowserCheckpoint(text, options = {}) {
  const { maxBytes = MAX_FRANCHISE_CHECKPOINT_BYTES, ...pins } = options;
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_FRANCHISE_CHECKPOINT_BYTES, 'Invalid checkpoint byte budget.');
  assert(typeof text === 'string' && text.length <= maxBytes && encoder.encode(text).byteLength <= maxBytes,
    'Invalid or oversized franchise checkpoint.');
  const checkpoint = JSON.parse(text);
  validateJson(checkpoint);
  assert(checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint) &&
    checkpoint.format === FRANCHISE_BROWSER_CHECKPOINT_FORMAT &&
    checkpoint.version === FRANCHISE_BROWSER_CHECKPOINT_VERSION,
  'Unsupported or legacy franchise checkpoint. A versioned integrity receipt is required.');
  const checkpointKeys = Object.keys(checkpoint).sort();
  assert(checkpointKeys.join(',') === 'format,integrityReceipt,session,version', 'Invalid franchise checkpoint envelope fields.');
  const payload = checkpointPayload(checkpoint.session);
  const receipt = checkpoint.integrityReceipt;
  assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt) &&
    Object.keys(receipt).sort().join(',') === 'algorithm,canonicalization,payloadSha256' &&
    receipt.algorithm === 'SHA-256' && receipt.canonicalization === FRANCHISE_BROWSER_CHECKPOINT_CANONICALIZATION &&
    /^[a-f0-9]{64}$/.test(receipt.payloadSha256 ?? ''), 'Invalid franchise checkpoint integrity receipt.');
  assert(makeIntegrityReceipt(payload).payloadSha256 === receipt.payloadSha256,
    'Franchise checkpoint SHA-256 integrity receipt does not match its serialized payload.');
  const session = checkpoint.session;
  validateFranchiseBrowserSession(session, pins);
  return session;
}

export function restoreFranchiseBrowserCheckpointObject(session, options = {}) {
  // JSON validation occurs before cloning, so no NaN/undefined/custom class is
  // silently altered into a different simulation state.
  return restoreFranchiseBrowserCheckpoint(serializeFranchiseBrowserCheckpoint(session, options), options);
}

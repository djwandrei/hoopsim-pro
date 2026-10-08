import { validateFranchiseBrowserSession } from './franchise-browser-session-v1.mjs';

export const MAX_FRANCHISE_CHECKPOINT_BYTES = 128 * 1024 * 1024;
const encoder = new TextEncoder();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

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
  const text = JSON.stringify(session);
  assert(encoder.encode(text).byteLength <= maxBytes, `Franchise checkpoint exceeds the ${maxBytes}-byte budget.`);
  return text;
}

export function restoreFranchiseBrowserCheckpoint(text, options = {}) {
  const { maxBytes = MAX_FRANCHISE_CHECKPOINT_BYTES, ...pins } = options;
  assert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_FRANCHISE_CHECKPOINT_BYTES, 'Invalid checkpoint byte budget.');
  assert(typeof text === 'string' && text.length <= maxBytes && encoder.encode(text).byteLength <= maxBytes,
    'Invalid or oversized franchise checkpoint.');
  const session = JSON.parse(text);
  validateJson(session);
  validateFranchiseBrowserSession(session, pins);
  return session;
}

export function restoreFranchiseBrowserCheckpointObject(session, options = {}) {
  // JSON validation occurs before cloning, so no NaN/undefined/custom class is
  // silently altered into a different simulation state.
  return restoreFranchiseBrowserCheckpoint(serializeFranchiseBrowserCheckpoint(session, options), options);
}

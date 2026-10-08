export const SHARED_EVENT_CALIBRATION_CACHE_V1_FORMAT = 'djhc-shared-event-calibration-cache-v1';
const privateCaches = new WeakMap();
const mappings = new Set(['legacy-neutral-v1', 'self-reference-possession-v2', 'rate-linked-recovery-possession-v3', 'prior-pf-linked-possession-v4']);
const rateFields = Object.freeze(['pointsPer36', 'fgaPer36', 'threesAttPer36', 'twoPointAttPer36',
  'ftAttPer36', 'offensiveReboundsPer36', 'defensiveReboundsPer36', 'turnoversPer36',
  'stealsPer36', 'blocksPer36', 'assistsPer36']);
const probabilityFields = Object.freeze(['threePointPct', 'twoPointPct', 'freeThrowPct', 'threeAttemptShare']);
function review(reason) {
  throw Object.assign(new Error(`Shared event calibration cache requires review: ${reason}`), {
    productionReview: { status: 'requires-review', reason },
  });
}
function stateFor(cache) {
  const state = cache && typeof cache === 'object' ? privateCaches.get(cache) : null;
  if (!state) review('unrecognized-calibration-cache');
  return state;
}
function number(value, label, maximum = Infinity) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) review(`invalid-cache-key-${label}`);
  return value;
}
function cacheKey({ mapping, rows, possessions, offensiveReboundChance } = {}) {
  if (!mappings.has(mapping) || !Number.isFinite(possessions) || possessions <= 0 ||
      !Array.isArray(rows) || rows.length !== 5) review('invalid-calibration-cache-context');
  let reboundParameter = null;
  if (mapping === 'self-reference-possession-v2') {
    reboundParameter = offensiveReboundChance === undefined ? 0.24 : offensiveReboundChance;
    if (!Number.isFinite(reboundParameter) || reboundParameter < 0 || reboundParameter >= 1) {
      review('invalid-cache-key-offensiveReboundChance');
    }
  } else if (offensiveReboundChance !== undefined) {
    review('unsupported-cache-key-offensiveReboundChance');
  }
  // Preserve row order: changing summation order can alter floating-point results.
  const inputs = rows.map(row => {
    if (!row || typeof row.player?.playerRef !== 'string' || !row.player.playerRef.trim()) {
      review('invalid-cache-key-player-identity');
    }
    if (row.player.canonicalName !== null && row.player.canonicalName !== undefined &&
        (typeof row.player.canonicalName !== 'string' || !row.player.canonicalName.trim())) {
      review('invalid-cache-key-canonical-name');
    }
    const baseMix = row.baseThreeAttemptShare ?? row.threeAttemptShare;
    return [row.player.playerRef, row.player.canonicalName ?? null,
      ...rateFields.map(field => number(row[field], field)),
      ...probabilityFields.map(field => number(row[field], field, 1)),
      number(baseMix, 'baseThreeAttemptShare', 1), number(row.player.defenseRating ?? 50, 'defenseRating', 100),
      ...(mapping === 'prior-pf-linked-possession-v4' ? [number(row.personalFoulsPer36, 'personalFoulsPer36')] : [])];
  });
  return JSON.stringify([mapping, possessions, reboundParameter, inputs]);
}
function freezeResult(value, active = new WeakSet()) {
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) review('nonfinite-calibration-result');
    return value;
  }
  if (typeof value !== 'object' || (!Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) || active.has(value)) {
    review('nonportable-calibration-result');
  }
  active.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') review('nonportable-calibration-result-key');
    freezeResult(value[key], active);
  }
  active.delete(value);
  return Object.freeze(value);
}
function increment(state, field) {
  if (state[field] === Number.MAX_SAFE_INTEGER) review('calibration-cache-counter-overflow');
  state[field] += 1;
}

/** One opaque, bounded cache for repeated draws of a game or scenario batch.
 * Values are immutable numeric results; no player inputs, fitted models, source
 * files, seeds or mutable league state are stored. Tokens are not serialized. */
export function createSharedEventCalibrationCacheV1({ maxEntries = 256 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) review('invalid-calibration-cache-capacity');
  const token = Object.freeze({ format: SHARED_EVENT_CALIBRATION_CACHE_V1_FORMAT, version: 1 });
  privateCaches.set(token, { maxEntries, values: new Map(), hits: 0, misses: 0, evictions: 0, failedComputations: 0 });
  return token;
}

export function readSharedEventCalibrationCacheV1(cache) {
  const state = stateFor(cache);
  return Object.freeze({ format: SHARED_EVENT_CALIBRATION_CACHE_V1_FORMAT, version: 1,
    maxEntries: state.maxEntries, entries: state.values.size, hits: state.hits, misses: state.misses,
    evictions: state.evictions, failedComputations: state.failedComputations });
}

/** Memoize a pure existing solver, leaving all its arithmetic unchanged. A hit
 * requires equal mapping, possession budget, ordered identities and every
 * consumed rate/rating/mix value, and V2's effective rebound parameter. The
 * callback must invoke that mapping's pure solver with these exact inputs;
 * mutable closure state must not affect it. Failed results never enter the cache. */
export function memoizeSharedEventCalibrationV1(cache, context, compute) {
  const state = stateFor(cache);
  if (typeof compute !== 'function') review('missing-calibration-computation');
  const key = cacheKey(context);
  if (state.values.has(key)) {
    const result = state.values.get(key);
    increment(state, 'hits');
    state.values.delete(key); state.values.set(key, result);
    return result;
  }
  increment(state, 'misses');
  let result;
  try {
    const computed = compute();
    if (!computed || typeof computed !== 'object' || Array.isArray(computed)) review('invalid-calibration-result');
    // Clone before freezing so computation-owned values remain untouched.
    result = freezeResult(structuredClone(computed));
  } catch (error) {
    increment(state, 'failedComputations');
    throw error;
  }
  if (state.values.size >= state.maxEntries) {
    increment(state, 'evictions'); state.values.delete(state.values.keys().next().value);
  }
  state.values.set(key, result);
  return result;
}

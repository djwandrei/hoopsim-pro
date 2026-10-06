// Virtual Pack Opening model, ported from the site's pack-opening-model.js:
// uniform pool, draw without replacement, deterministic fnv1a32/xorshift32
// seeded shuffle. Simulation only — no purchase, probability or ownership claim.
export const PACK_OPENING_STORAGE_KEY = 'djhc:virtual-pack-opening:v1';
export const PACK_OPENING_STATE_VERSION = 1;
export const PACK_OPENING_RULESET = 'uniform-public-card-pool-without-replacement-v1';
export const PACK_OPENING_ALGORITHM = 'fnv1a32-xorshift32-rejection-fisher-yates-v1';
export const MAX_PACK_OPENING_POOL_SIZE = 120;
export const MAX_PACK_OPENING_SIZE = 10;
export const MAX_PACK_OPENING_HISTORY = 12;
const MAX_SEED_LENGTH = 80;

function positiveProductId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanText(value, maxLength = 180) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function cleanSeed(value) {
  const seed = String(value ?? '').trim();
  return seed && seed.length <= MAX_SEED_LENGTH && !/[\u0000-\u001f\u007f]/.test(seed) ? seed : '';
}

function normalizeVerifiedMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
  const reviewState = String(mapping.reviewState ?? '').trim();
  const athleteId = cleanText(mapping.player?.athleteId, 128);
  const playerName = cleanText(mapping.player?.name, 120);
  if (!['auto_verified', 'human_verified'].includes(reviewState) || !athleteId || !playerName) return null;
  const endYear = Number(mapping.depictedSeasonEndYear);
  return {
    reviewState,
    subjectRole: cleanText(mapping.subjectRole, 64),
    depictedSeasonLabel: cleanText(mapping.depictedSeasonLabel, 32),
    depictedSeasonEndYear: Number.isInteger(endYear) && endYear >= 1900 && endYear <= 2200 ? endYear : null,
    player: { athleteId, name: playerName },
  };
}

/** One unique catalog-card entry from exact reviewed mapping results. */
export function eligiblePackCardFromMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  const verified = matches.filter(match => (
    match?.verification === 'exact-reviewed-nba-product-mapping'
    && positiveProductId(match.product?.id)
    && cleanText(match.product?.name)
  ));
  if (!verified.length) return null;
  const productId = positiveProductId(verified[0].product.id);
  if (verified.some(match => positiveProductId(match.product?.id) !== productId)) return null;
  const mappingByKey = new Map();
  verified.forEach(match => {
    const mapping = normalizeVerifiedMapping({ ...match.mapping, player: match.player });
    if (!mapping) return;
    const key = `${mapping.player.athleteId}:${mapping.subjectRole}:${mapping.depictedSeasonEndYear || ''}`;
    if (!mappingByKey.has(key)) mappingByKey.set(key, mapping);
  });
  if (!mappingByKey.size) return null;
  return {
    verification: 'exact-reviewed-nba-product-mapping',
    product: { id: productId, name: cleanText(verified[0].product.name), image: cleanText(verified[0].product.image, 700) },
    mappings: [...mappingByKey.values()],
  };
}

function hashSeed(seed) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return state || 0x9e3779b9;
}

function createSeededUint32(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

function chooseIndex(nextUint32, upperExclusive) {
  const range = 0x100000000;
  const acceptedLimit = Math.floor(range / upperExclusive) * upperExclusive;
  let value = nextUint32();
  while (value >= acceptedLimit) value = nextUint32();
  return value % upperExclusive;
}

export function drawPackOpeningProductIds(poolProductIds, packSize, seed) {
  const shuffledIds = poolProductIds.slice();
  const nextUint32 = createSeededUint32(seed);
  for (let index = shuffledIds.length - 1; index > 0; index -= 1) {
    const other = chooseIndex(nextUint32, index + 1);
    [shuffledIds[index], shuffledIds[other]] = [shuffledIds[other], shuffledIds[index]];
  }
  return shuffledIds.slice(0, packSize);
}

function normalizeReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || receipt.schemaVersion !== PACK_OPENING_STATE_VERSION
    || receipt.rulesetId !== PACK_OPENING_RULESET
    || receipt.algorithmId !== PACK_OPENING_ALGORITHM
    || receipt.sourceContract !== PACK_OPENING_SOURCE_CONTRACT
    || receipt.simulationOnly !== true
    || receipt.ownershipChanged !== false) return null;
  const seed = cleanSeed(receipt.seed);
  const packSize = Number(receipt.packSize);
  const openedAt = Number(receipt.openedAt);
  if (!seed || !Number.isInteger(packSize) || packSize < 1 || packSize > MAX_PACK_OPENING_SIZE || !Number.isSafeInteger(openedAt) || openedAt < 0) return null;
  if (!Array.isArray(receipt.poolProductIds) || !Array.isArray(receipt.drawnProductIds)
    || receipt.poolProductIds.length > MAX_PACK_OPENING_POOL_SIZE
    || receipt.drawnProductIds.length !== packSize || receipt.poolProductIds.length < packSize) return null;
  const poolProductIds = receipt.poolProductIds.map(positiveProductId);
  const drawnProductIds = receipt.drawnProductIds.map(positiveProductId);
  if (poolProductIds.some(id => !id) || drawnProductIds.some(id => !id)) return null;
  if (new Set(poolProductIds).size !== poolProductIds.length || new Set(drawnProductIds).size !== drawnProductIds.length) return null;
  if (!drawnProductIds.every(id => poolProductIds.includes(id))) return null;
  if (poolProductIds.some((id, index) => index > 0 && poolProductIds[index - 1] >= id)) return null;
  const expected = drawPackOpeningProductIds(poolProductIds, packSize, seed);
  if (drawnProductIds.some((id, index) => id !== expected[index])) return null;
  return {
    schemaVersion: PACK_OPENING_STATE_VERSION,
    rulesetId: PACK_OPENING_RULESET,
    algorithmId: PACK_OPENING_ALGORITHM,
    sourceContract: PACK_OPENING_SOURCE_CONTRACT,
    seed,
    packSize,
    poolProductIds,
    drawnProductIds,
    openedAt,
    simulationOnly: true,
    ownershipChanged: false,
  };
}

export const PACK_OPENING_SOURCE_CONTRACT = 'current-public-basketball-catalog+exact-reviewed-nba-product-mapping';

export function createPackOpeningReceipt({ eligibleCards, packSize, seed, openedAt = Date.now() } = {}) {
  const cleanPackSeed = cleanSeed(seed);
  const normalizedPackSize = Number(packSize);
  if (!cleanPackSeed) throw new TypeError(`Seed must contain 1-${MAX_SEED_LENGTH} safe characters.`);
  if (!Number.isInteger(normalizedPackSize) || normalizedPackSize < 1 || normalizedPackSize > MAX_PACK_OPENING_SIZE) {
    throw new RangeError(`Pack size must be an integer from 1 to ${MAX_PACK_OPENING_SIZE}.`);
  }
  if (!Array.isArray(eligibleCards) || eligibleCards.length > MAX_PACK_OPENING_POOL_SIZE) {
    throw new RangeError(`Eligible pool must contain no more than ${MAX_PACK_OPENING_POOL_SIZE} cards.`);
  }
  const cards = eligibleCards.map(card => {
    if (!card || typeof card !== 'object' || Array.isArray(card) || card.verification !== 'exact-reviewed-nba-product-mapping') return null;
    const productId = positiveProductId(card.product?.id);
    const name = cleanText(card.product?.name);
    const mappings = Array.isArray(card.mappings) ? card.mappings.map(normalizeVerifiedMapping).filter(Boolean) : [];
    return productId && name && mappings.length
      ? { verification: card.verification, product: { id: productId, name, image: cleanText(card.product?.image, 700) }, mappings }
      : null;
  });
  if (cards.some(card => !card)) throw new TypeError('Every pool entry must have an exact reviewed NBA product mapping.');
  const ids = cards.map(card => card.product.id).sort((left, right) => left - right);
  if (new Set(ids).size !== ids.length) throw new TypeError('Eligible pool cannot repeat a product ID.');
  if (ids.length < normalizedPackSize) throw new RangeError('Pack size cannot exceed the declared eligible pool.');
  const drawnProductIds = drawPackOpeningProductIds(ids, normalizedPackSize, cleanPackSeed);
  return normalizeReceipt({
    schemaVersion: PACK_OPENING_STATE_VERSION,
    rulesetId: PACK_OPENING_RULESET,
    algorithmId: PACK_OPENING_ALGORITHM,
    sourceContract: PACK_OPENING_SOURCE_CONTRACT,
    seed: cleanPackSeed,
    packSize: normalizedPackSize,
    poolProductIds: ids,
    drawnProductIds,
    openedAt,
    simulationOnly: true,
    ownershipChanged: false,
  });
}

export function createPackOpeningSeed() {
  try {
    const bytes = new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.some(byte => byte !== 0)) return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fall through to the time-based seed.
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0x100000000).toString(36)}`;
}

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function readPackOpeningHistory() {
  try {
    const parsed = JSON.parse(safeStorage()?.getItem(PACK_OPENING_STORAGE_KEY) || '');
    if (!parsed || parsed.version !== PACK_OPENING_STATE_VERSION || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.map(normalizeReceipt).filter(Boolean).slice(0, MAX_PACK_OPENING_HISTORY);
  } catch {
    return [];
  }
}

export function writePackOpeningHistory(receipts) {
  const normalized = (Array.isArray(receipts) ? receipts : []).map(normalizeReceipt).filter(Boolean).slice(0, MAX_PACK_OPENING_HISTORY);
  try {
    safeStorage()?.setItem(PACK_OPENING_STORAGE_KEY, JSON.stringify({ version: PACK_OPENING_STATE_VERSION, entries: normalized }));
    return normalized;
  } catch {
    return normalized;
  }
}

export function prependPackOpeningHistory(receipts, receipt) {
  const normalized = normalizeReceipt(receipt);
  if (!normalized) return writePackOpeningHistory(receipts);
  const current = (Array.isArray(receipts) ? receipts : []).map(normalizeReceipt).filter(Boolean);
  const next = [normalized, ...current.filter(entry => (
    entry.openedAt !== normalized.openedAt
    || entry.seed !== normalized.seed
    || entry.packSize !== normalized.packSize
    || entry.poolProductIds.join(',') !== normalized.poolProductIds.join(',')
    || entry.drawnProductIds.join(',') !== normalized.drawnProductIds.join(',')
  ))].slice(0, MAX_PACK_OPENING_HISTORY);
  return writePackOpeningHistory(next);
}

export function clearPackOpeningHistory() {
  try {
    safeStorage()?.removeItem(PACK_OPENING_STORAGE_KEY);
  } catch {
    // Storage unavailable; history simply stays empty.
  }
}
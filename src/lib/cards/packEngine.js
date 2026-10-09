// Seeded Virtual Pack draws from a user-declared pool of exact, reviewed NBA
// catalog mappings. The receipt stays in this browser and carries no value,
// ownership, purchase, odds, or wager claim.
import { safeStorage } from '@/lib/safeStorage';

export const PACK_ENGINE = 'browser-seeded-reviewed-catalog-v2';
export const PACK_SIZE = 5;
export const PACK_HISTORY_KEY = 'djhc:virtual-pack:v2';
export const MAX_PACK_HISTORY = 12;
export const MAX_POOL_SIZE = 120;
export const MAX_PACK_SIZE = 10;
export const PACK_RULESET = 'uniform-public-card-pool-without-replacement-v1';
export const PACK_ALGORITHM = 'fnv1a32-xorshift32-rejection-fisher-yates-v1';
export const PACK_SOURCE_CONTRACT = 'current-public-basketball-catalog+exact-reviewed-nba-product-mapping';
const VERIFIED_REVIEW_STATES = new Set(['auto_verified', 'human_verified']);
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

function normalizeMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
  const reviewState = String(mapping.reviewState ?? '').trim();
  const athleteId = cleanText(mapping.player?.athleteId, 128);
  const playerName = cleanText(mapping.player?.name, 120);
  if (!VERIFIED_REVIEW_STATES.has(reviewState) || !athleteId || !playerName) return null;
  return {
    reviewState,
    subjectRole: cleanText(mapping.subjectRole, 64),
    depictedSeasonLabel: cleanText(mapping.depictedSeasonLabel, 32),
    depictedSeasonEndYear: Number.isInteger(Number(mapping.depictedSeasonEndYear))
      ? Number(mapping.depictedSeasonEndYear)
      : null,
    player: { athleteId, name: playerName },
  };
}

function normalizeEligibleCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)
    || card.verification !== 'exact-reviewed-nba-product-mapping') return null;
  const productId = positiveProductId(card.product?.id);
  const name = cleanText(card.product?.name);
  if (!productId || !name || !Array.isArray(card.mappings)) return null;
  const mappings = card.mappings.map(normalizeMapping).filter(Boolean);
  if (!mappings.length) return null;
  const product = {
    id: productId,
    name,
    image: cleanText(card.product?.image, 1000),
    displayPrice: cleanText(card.product?.displayPrice, 100),
    team: cleanText(card.product?.team, 120),
    condition: cleanText(card.product?.condition, 100),
    year: Number.isFinite(Number(card.product?.year)) ? Number(card.product.year) : null,
    productUrl: cleanText(card.product?.productUrl, 1200),
  };
  return { verification: 'exact-reviewed-nba-product-mapping', product, mappings };
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

function drawProductIds(poolProductIds, packSize, seed) {
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
    || receipt.schemaVersion !== 2
    || receipt.engine !== PACK_ENGINE
    || receipt.rulesetId !== PACK_RULESET
    || receipt.algorithmId !== PACK_ALGORITHM
    || receipt.sourceContract !== PACK_SOURCE_CONTRACT
    || receipt.simulationOnly !== true
    || receipt.ownershipChanged !== false) return null;
  const seed = cleanSeed(receipt.seed);
  const packSize = Number(receipt.packSize);
  const openedAt = Number(receipt.openedAt);
  if (!seed || !Number.isInteger(packSize) || packSize < 1 || packSize > MAX_PACK_SIZE
    || !Number.isSafeInteger(openedAt) || openedAt < 0) return null;
  if (!Array.isArray(receipt.poolProductIds) || !Array.isArray(receipt.drawnProductIds)
    || receipt.poolProductIds.length > MAX_POOL_SIZE
    || receipt.drawnProductIds.length !== packSize || receipt.poolProductIds.length < packSize) return null;
  const poolProductIds = receipt.poolProductIds.map(positiveProductId);
  const drawnProductIds = receipt.drawnProductIds.map(positiveProductId);
  if (poolProductIds.some((id) => !id) || drawnProductIds.some((id) => !id)
    || new Set(poolProductIds).size !== poolProductIds.length
    || new Set(drawnProductIds).size !== drawnProductIds.length
    || !drawnProductIds.every((id) => poolProductIds.includes(id))) return null;
  if (poolProductIds.some((id, index) => index > 0 && poolProductIds[index - 1] >= id)) return null;
  const expected = drawProductIds(poolProductIds, packSize, seed);
  if (drawnProductIds.some((id, index) => id !== expected[index])) return null;
  return {
    schemaVersion: 2,
    engine: PACK_ENGINE,
    rulesetId: PACK_RULESET,
    algorithmId: PACK_ALGORITHM,
    sourceContract: PACK_SOURCE_CONTRACT,
    seed,
    packSize,
    poolProductIds,
    drawnProductIds,
    openedAt,
    simulationOnly: true,
    ownershipChanged: false,
  };
}

export function eligiblePackCardFromMatches(matches) {
  if (!Array.isArray(matches) || !matches.length) return null;
  const verified = matches.filter((match) => (
    match?.verification === 'exact-reviewed-nba-product-mapping'
    && positiveProductId(match.product?.id)
    && cleanText(match.product?.name)
  ));
  if (!verified.length) return null;
  const first = verified[0];
  const productId = positiveProductId(first.product.id);
  if (verified.some((match) => positiveProductId(match.product?.id) !== productId)) return null;
  const mappingsByKey = new Map();
  verified.forEach((match) => {
    const mapping = normalizeMapping({ ...match.mapping, player: match.player });
    if (!mapping) return;
    const key = `${mapping.player.athleteId}:${mapping.subjectRole}:${mapping.depictedSeasonEndYear || ''}`;
    if (!mappingsByKey.has(key)) mappingsByKey.set(key, mapping);
  });
  if (!mappingsByKey.size) return null;
  return {
    verification: 'exact-reviewed-nba-product-mapping',
    product: {
      ...first.product,
      id: productId,
      name: cleanText(first.product.name),
      image: cleanText(first.product.image || first.product.imageUrl, 1000),
    },
    mappings: [...mappingsByKey.values()],
  };
}

export function createPackOpeningSeed(cryptoImpl = globalThis.crypto, randomImpl = Math.random, now = Date.now) {
  try {
    const bytes = new Uint8Array(12);
    cryptoImpl?.getRandomValues?.(bytes);
    if (bytes.some((byte) => byte !== 0)) return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    // Use the non-cryptographic local fallback when browser crypto is blocked.
  }
  const randomValue = Number(randomImpl());
  const safeRandom = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999999, randomValue)) : 0;
  return `${Number(now()).toString(36)}-${Math.floor(safeRandom * 0x100000000).toString(36)}`;
}

export function createPackOpeningReceipt({ eligibleCards, packSize = PACK_SIZE, seed, openedAt = Date.now() } = {}) {
  const cleanPackSeed = cleanSeed(seed);
  const normalizedPackSize = Number(packSize);
  const timestamp = Number(openedAt);
  if (!cleanPackSeed) throw new TypeError(`Seed must contain 1–${MAX_SEED_LENGTH} safe characters.`);
  if (!Number.isInteger(normalizedPackSize) || normalizedPackSize < 1 || normalizedPackSize > MAX_PACK_SIZE) {
    throw new RangeError(`Pack size must be an integer from 1 to ${MAX_PACK_SIZE}.`);
  }
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new TypeError('Opened time must be a non-negative safe integer timestamp.');
  if (!Array.isArray(eligibleCards) || eligibleCards.length > MAX_POOL_SIZE) {
    throw new RangeError(`Eligible pool must contain no more than ${MAX_POOL_SIZE} cards.`);
  }
  const cards = eligibleCards.map(normalizeEligibleCard);
  if (cards.some((card) => !card)) throw new TypeError('Every pool entry must have an exact reviewed NBA product mapping.');
  const poolProductIds = cards.map((card) => card.product.id).sort((left, right) => left - right);
  if (new Set(poolProductIds).size !== poolProductIds.length) throw new TypeError('Eligible pool cannot repeat a product ID.');
  if (poolProductIds.length < normalizedPackSize) throw new RangeError('Pack size cannot exceed the declared eligible pool.');
  return normalizeReceipt({
    schemaVersion: 2,
    engine: PACK_ENGINE,
    rulesetId: PACK_RULESET,
    algorithmId: PACK_ALGORITHM,
    sourceContract: PACK_SOURCE_CONTRACT,
    seed: cleanPackSeed,
    packSize: normalizedPackSize,
    poolProductIds,
    drawnProductIds: drawProductIds(poolProductIds, normalizedPackSize, cleanPackSeed),
    openedAt: timestamp,
    simulationOnly: true,
    ownershipChanged: false,
  });
}

/**
 * @param {Array<object>} eligibleCards
 * @param {{packSize?: number, seed?: string, openedAt?: number}} [options]
 */
export function openPack(eligibleCards, { packSize = PACK_SIZE, seed, openedAt = Date.now() } = {}) {
  const receipt = createPackOpeningReceipt({ eligibleCards, packSize, seed, openedAt });
  const cardsById = new Map(eligibleCards.map((card) => [Number(card.product.id), card]));
  return { cards: receipt.drawnProductIds.map((id) => cardsById.get(id)), receipt };
}

export function parsePackHistory(serialized) {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || parsed.version !== 2 || parsed.engine !== PACK_ENGINE || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.map(normalizeReceipt).filter(Boolean).slice(0, MAX_PACK_HISTORY);
  } catch {
    return [];
  }
}

export function readPackHistory(storage = safeStorage()) {
  try { return parsePackHistory(storage?.getItem(PACK_HISTORY_KEY)); } catch { return []; }
}

export function writePackHistory(entries, storage = safeStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const normalized = (Array.isArray(entries) ? entries : [])
    .map(normalizeReceipt)
    .filter(Boolean)
    .slice(0, MAX_PACK_HISTORY);
  try {
    storage.setItem(PACK_HISTORY_KEY, JSON.stringify({ version: 2, engine: PACK_ENGINE, entries: normalized }));
    return true;
  } catch {
    return false;
  }
}

export function prependPackHistory(entries, receipt) {
  const normalized = normalizeReceipt(receipt);
  const current = (Array.isArray(entries) ? entries : []).map(normalizeReceipt).filter(Boolean);
  if (!normalized) return current.slice(0, MAX_PACK_HISTORY);
  return [normalized, ...current.filter((entry) => (
    entry.openedAt !== normalized.openedAt
    || entry.seed !== normalized.seed
    || entry.poolProductIds.join(',') !== normalized.poolProductIds.join(',')
    || entry.drawnProductIds.join(',') !== normalized.drawnProductIds.join(',')
  ))].slice(0, MAX_PACK_HISTORY);
}

export function clearPackHistory(storage = safeStorage()) {
  try { storage?.removeItem(PACK_HISTORY_KEY); } catch { /* Ignore storage failures. */ }
  return [];
}

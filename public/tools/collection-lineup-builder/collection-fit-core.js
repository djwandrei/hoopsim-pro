export const COLLECTION_STORAGE_KEY = 'djhc:collection-lineup-builder:v1';
export const COLLECTION_STATE_VERSION = 1;

const VERIFIED_REVIEW_STATES = new Set(['auto_verified', 'human_verified']);
const POSITION_GROUPS = Object.freeze({
  PG: 'G',
  SG: 'G',
  G: 'G',
  SF: 'F',
  PF: 'F',
  F: 'F',
  C: 'C',
});
const LINEUP_ROLE_GROUPS = Object.freeze(['C', 'G', 'G', 'F', 'F']);

function positiveProductId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanId(value) {
  const id = String(value ?? '').trim();
  return id && id.length <= 128 ? id : '';
}

function cleanText(value, maxLength = 180) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function verifiedReviewState(value) {
  return VERIFIED_REVIEW_STATES.has(String(value ?? '').trim());
}

/**
 * Re-check the public RPC boundary before a card can enter a collection or fit
 * preview. The caller supplies a freshly loaded, visible catalog product; the
 * RPC must echo that exact product and a reviewed NBA identity.
 */
export function extractVerifiedCollectionMatches(payload, product) {
  const productId = positiveProductId(product?.id);
  if (!productId || !payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  if (payload.provider !== 'NBA' || positiveProductId(payload.productId) !== productId) return [];
  if (!Array.isArray(payload.players)) return [];

  return payload.players.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    if (!verifiedReviewState(entry.mapping?.reviewState)) return [];
    const athleteId = cleanId(entry.player?.athleteId);
    const playerName = cleanText(entry.player?.name, 120);
    if (!athleteId || !playerName) return [];

    return [{
      verification: 'exact-reviewed-nba-product-mapping',
      product: {
        id: productId,
        name: cleanText(product.name || product.title || `Catalog card ${productId}`),
        image: cleanText(product.image || product.imageUrl, 500),
      },
      mapping: {
        reviewState: String(entry.mapping.reviewState).trim(),
        subjectRole: cleanText(entry.mapping.subjectRole, 64),
        depictedSeasonLabel: cleanText(entry.mapping.depictedSeasonLabel, 32),
        depictedSeasonEndYear: Number.isInteger(Number(entry.mapping.depictedSeasonEndYear))
          ? Number(entry.mapping.depictedSeasonEndYear)
          : null,
      },
      player: {
        athleteId,
        nbaPlayerId: cleanId(entry.player?.nbaPlayerId),
        name: playerName,
        primaryPosition: cleanText(entry.player?.primaryPosition, 32).toUpperCase(),
      },
    }];
  });
}

export function collectionEntryKey(entry) {
  const productId = positiveProductId(entry?.productId);
  const athleteId = cleanId(entry?.athleteId);
  return productId && athleteId ? `${productId}:${athleteId}` : '';
}

function normalizeStoredEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const productId = positiveProductId(entry.productId);
  const athleteId = cleanId(entry.athleteId);
  const relation = entry.relation === 'owned' ? 'owned' : entry.relation === 'saved' ? 'saved' : '';
  if (!productId || !athleteId || !relation) return null;
  return {
    productId,
    athleteId,
    relation,
    addedAt: Number.isFinite(Number(entry.addedAt)) ? Math.max(0, Number(entry.addedAt)) : 0,
  };
}

export function parseCollectionState(serialized) {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || parsed.version !== COLLECTION_STATE_VERSION || !Array.isArray(parsed.entries)) return [];
    const entriesByKey = new Map();
    parsed.entries.forEach((candidate) => {
      const entry = normalizeStoredEntry(candidate);
      const key = collectionEntryKey(entry);
      if (key) entriesByKey.set(key, entry);
    });
    return [...entriesByKey.values()];
  } catch {
    return [];
  }
}

export function readCollectionState(storage = globalThis.localStorage) {
  try {
    return parseCollectionState(storage?.getItem(COLLECTION_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Persist only a product/athlete pointer and the collector's own saved/owned label. */
export function writeCollectionState(entries, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  const normalized = [];
  const keys = new Set();
  (Array.isArray(entries) ? entries : []).forEach((candidate) => {
    const entry = normalizeStoredEntry(candidate);
    const key = collectionEntryKey(entry);
    if (!key || keys.has(key)) return;
    keys.add(key);
    normalized.push(entry);
  });
  try {
    storage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({
      version: COLLECTION_STATE_VERSION,
      entries: normalized,
    }));
    return true;
  } catch {
    return false;
  }
}

export function makeCollectionEntry(match, relation, addedAt = Date.now()) {
  if (match?.verification !== 'exact-reviewed-nba-product-mapping') return null;
  if (!['saved', 'owned'].includes(relation)) return null;
  return normalizeStoredEntry({
    productId: match.product?.id,
    athleteId: match.player?.athleteId,
    relation,
    addedAt,
  });
}

export function upsertCollectionEntry(entries, match, relation, addedAt = Date.now()) {
  const entry = makeCollectionEntry(match, relation, addedAt);
  if (!entry) return Array.isArray(entries) ? entries.slice() : [];
  const key = collectionEntryKey(entry);
  const next = (Array.isArray(entries) ? entries : [])
    .map(normalizeStoredEntry)
    .filter((candidate) => candidate && collectionEntryKey(candidate) !== key);
  next.push(entry);
  return next;
}

export function setCollectionEntryRelation(entries, productId, athleteId, relation) {
  if (!['saved', 'owned'].includes(relation)) return (Array.isArray(entries) ? entries : []).slice();
  const targetKey = collectionEntryKey({ productId, athleteId });
  if (!targetKey) return (Array.isArray(entries) ? entries : []).slice();
  return (Array.isArray(entries) ? entries : []).map((candidate) => {
    const entry = normalizeStoredEntry(candidate);
    return entry && collectionEntryKey(entry) === targetKey ? { ...entry, relation } : entry;
  }).filter(Boolean);
}

export function removeCollectionEntry(entries, productId, athleteId) {
  const targetKey = collectionEntryKey({ productId, athleteId });
  return (Array.isArray(entries) ? entries : [])
    .map(normalizeStoredEntry)
    .filter((entry) => entry && collectionEntryKey(entry) !== targetKey);
}

export function exactPrimaryPositionGroup(position) {
  return POSITION_GROUPS[String(position ?? '').trim().toUpperCase()] || null;
}

/**
 * Find a deterministic 2G/2F/1C profile-position shape from freshly verified
 * entries. This is deliberately not a season-eligibility check, legal lineup,
 * performance ranking, or Lineup Lab optimization.
 */
export function findProfilePositionFit(entries = []) {
  const verified = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.verification === 'exact-reviewed-nba-product-mapping')
    .filter((entry) => positiveProductId(entry.product?.id) && cleanId(entry.player?.athleteId))
    .map((entry) => ({
      ...entry,
      profilePositionGroup: exactPrimaryPositionGroup(entry.player?.primaryPosition),
      relation: entry.relation === 'owned' ? 'owned' : 'saved',
    }))
    .filter((entry) => entry.profilePositionGroup);

  // A player with several cards remains one candidate. Prefer an explicitly
  // marked owned card, then the lower product id for stable results.
  const byAthlete = new Map();
  verified.sort((left, right) => (
    Number(right.relation === 'owned') - Number(left.relation === 'owned')
    || left.product.id - right.product.id
    || left.player.athleteId.localeCompare(right.player.athleteId)
  )).forEach((entry) => {
    if (!byAthlete.has(entry.player.athleteId)) byAthlete.set(entry.player.athleteId, entry);
  });
  const candidates = [...byAthlete.values()];
  const requirements = { G: 2, F: 2, C: 1 };
  const roleGroups = LINEUP_ROLE_GROUPS;
  const selected = [];

  function assign(slotIndex, usedProductIds) {
    if (slotIndex >= roleGroups.length) return true;
    const requiredGroup = roleGroups[slotIndex];
    for (const entry of candidates) {
      if (entry.profilePositionGroup !== requiredGroup || usedProductIds.has(entry.product.id)) continue;
      selected.push({
        roleGroup: requiredGroup,
        productId: entry.product.id,
        productName: entry.product.name,
        athleteId: entry.player.athleteId,
        playerName: entry.player.name,
        primaryPosition: entry.player.primaryPosition,
        relation: entry.relation,
      });
      usedProductIds.add(entry.product.id);
      if (assign(slotIndex + 1, usedProductIds)) return true;
      usedProductIds.delete(entry.product.id);
      selected.pop();
    }
    return false;
  }

  const fitFound = assign(0, new Set());
  const profileCounts = candidates.reduce((counts, entry) => {
    counts[entry.profilePositionGroup] += 1;
    return counts;
  }, { G: 0, F: 0, C: 0 });

  return {
    status: fitFound ? 'profile-position-fit' : 'insufficient-profile-position-coverage',
    scope: 'profile-primary-position-only',
    requirements,
    profileCounts,
    lineup: fitFound ? selected : [],
    distinctVerifiedPlayers: candidates.length,
    limitation: 'Profile primary-position preview only. Season-specific roster eligibility, flexible roles, stats, and player-performance optimization are not verified here.',
  };
}

export const TRADE_PACKAGE_STORAGE_KEY = 'djhc:trade-package-builder:v1';
export const TRADE_PACKAGE_STATE_VERSION = 1;
export const MAX_TRADE_PACKAGE_ITEMS = 40;
export const MAX_CUSTOM_ITEM_LABEL = 120;

const SIDES = new Set(['a', 'b']);

function cleanId(value) {
  const id = String(value ?? '').trim();
  return id && id.length <= 128 ? id : '';
}

function positiveProductId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function cleanSide(value) {
  const side = String(value ?? '').trim().toLowerCase();
  return SIDES.has(side) ? side : '';
}

function cleanTimestamp(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const side = cleanSide(entry.side);
  const addedAt = cleanTimestamp(entry.addedAt);
  if (!side) return null;

  if (entry.kind === 'catalog-card') {
    const productId = positiveProductId(entry.productId);
    const athleteId = cleanId(entry.athleteId);
    if (!productId || !athleteId) return null;
    return { kind: 'catalog-card', productId, athleteId, side, addedAt };
  }

  if (entry.kind === 'user-note') {
    const id = cleanId(entry.id);
    const label = String(entry.label ?? '').trim().slice(0, MAX_CUSTOM_ITEM_LABEL);
    if (!id || !label) return null;
    return { kind: 'user-note', id, label, side, addedAt };
  }

  return null;
}

export function tradePackageEntryKey(entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return '';
  return normalized.kind === 'catalog-card'
    ? `card:${normalized.productId}:${normalized.athleteId}`
    : `note:${normalized.id}`;
}

function boundedUniqueEntries(entries) {
  const byKey = new Map();
  (Array.isArray(entries) ? entries : []).forEach((candidate) => {
    const entry = normalizeEntry(candidate);
    const key = tradePackageEntryKey(entry);
    if (key) byKey.set(key, entry);
  });
  return [...byKey.values()].slice(-MAX_TRADE_PACKAGE_ITEMS);
}

export function parseTradePackageState(serialized) {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || parsed.version !== TRADE_PACKAGE_STATE_VERSION || !Array.isArray(parsed.entries)) return [];
    return boundedUniqueEntries(parsed.entries);
  } catch {
    return [];
  }
}

export function readTradePackageState(storage = globalThis.localStorage) {
  try {
    return parseTradePackageState(storage?.getItem(TRADE_PACKAGE_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Store product/player pointers and user-entered notes only; never a roster or ownership claim. */
export function writeTradePackageState(entries, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(TRADE_PACKAGE_STORAGE_KEY, JSON.stringify({
      version: TRADE_PACKAGE_STATE_VERSION,
      entries: boundedUniqueEntries(entries),
    }));
    return true;
  } catch {
    return false;
  }
}

export function addVerifiedTradeCard(entries, match, side, addedAt = Date.now()) {
  if (match?.verification !== 'exact-reviewed-nba-product-mapping') return boundedUniqueEntries(entries);
  const candidate = normalizeEntry({
    kind: 'catalog-card',
    productId: match.product?.id,
    athleteId: match.player?.athleteId,
    side,
    addedAt,
  });
  if (!candidate) return boundedUniqueEntries(entries);
  const key = tradePackageEntryKey(candidate);
  const current = boundedUniqueEntries(entries);
  const exists = current.some((entry) => tradePackageEntryKey(entry) === key);
  if (!exists && current.length >= MAX_TRADE_PACKAGE_ITEMS) return current;
  return boundedUniqueEntries([...current.filter((entry) => tradePackageEntryKey(entry) !== key), candidate]);
}

export function addTradeUserNote(entries, label, side, id, addedAt = Date.now()) {
  const candidate = normalizeEntry({ kind: 'user-note', id, label, side, addedAt });
  if (!candidate) return boundedUniqueEntries(entries);
  const key = tradePackageEntryKey(candidate);
  const current = boundedUniqueEntries(entries);
  const exists = current.some((entry) => tradePackageEntryKey(entry) === key);
  if (!exists && current.length >= MAX_TRADE_PACKAGE_ITEMS) return current;
  return boundedUniqueEntries([...current.filter((entry) => tradePackageEntryKey(entry) !== key), candidate]);
}

export function moveTradePackageEntry(entries, key, side) {
  const targetKey = String(key ?? '');
  const nextSide = cleanSide(side);
  if (!targetKey || !nextSide) return boundedUniqueEntries(entries);
  return boundedUniqueEntries(entries).map((entry) => (
    tradePackageEntryKey(entry) === targetKey ? { ...entry, side: nextSide } : entry
  ));
}

export function removeTradePackageEntry(entries, key) {
  const targetKey = String(key ?? '');
  return boundedUniqueEntries(entries).filter((entry) => tradePackageEntryKey(entry) !== targetKey);
}

/** Report only item and verification counts; no value or fairness score exists. */
export function summarizeTradePackages(entries, verifiedCardKeys = []) {
  const verified = new Set(Array.isArray(verifiedCardKeys) ? verifiedCardKeys.map(String) : []);
  const all = boundedUniqueEntries(entries);
  const sides = ['a', 'b'].map((side) => {
    const items = all.filter((entry) => entry.side === side);
    const cards = items.filter((entry) => entry.kind === 'catalog-card');
    const notes = items.filter((entry) => entry.kind === 'user-note');
    const verifiedCards = cards.filter((entry) => verified.has(tradePackageEntryKey(entry))).length;
    return {
      side,
      itemCount: items.length,
      catalogCardCount: cards.length,
      verifiedCardCount: verifiedCards,
      needsRecheckCount: cards.length - verifiedCards,
      userNoteCount: notes.length,
    };
  });

  return {
    scope: 'contents-and-verification-counts-only',
    evaluation: 'blocked',
    reason: 'No accepted product/player values or trade-fairness model is connected.',
    sides,
  };
}

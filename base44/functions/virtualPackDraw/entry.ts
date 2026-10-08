// Virtual Pack draw: the pool lives in PackCard (curated from PSA scans and
// the site catalog); every draw runs server-side with crypto randomness so
// nothing client-supplied can choose the cards. The draw reads a lightweight
// id/tier pool index (cached briefly between draws) and fetches full card
// details for just the drawn cards, so one pack costs a small record read
// instead of transferring the whole pool every time.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const PACK_SIZE = 5;
// Per-mille tier weights for one card slot (hybrid model: the drawn value
// display comes from PSA price-guide data, the odds come from this table).
const TIER_WEIGHTS = { base: 680, uncommon: 200, rare: 90, super_rare: 25, legendary: 5 };
const TIER_ORDER = ['legendary', 'super_rare', 'rare', 'uncommon', 'base'];

const CARD_FIELDS = ['id', 'name', 'player', 'set', 'year', 'cardNumber', 'variant', 'imageUrl', 'grade', 'tier', 'valueCents', 'population', 'source'];

// Warm-isolate cache for the id/tier index; a short TTL keeps harvests
// visible within minutes without rescanning the pool on every draw.
const POOL_INDEX_TTL_MS = 5 * 60 * 1000;
let poolIndexCache = null; // { entries: [{ id, tier }], expiresAt }

function randomInt(maxExclusive) {
  const range = 0x100000000;
  const limit = Math.floor(range / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

async function poolIndex(base44) {
  if (poolIndexCache && poolIndexCache.expiresAt > Date.now()) return poolIndexCache.entries;
  const entries = [];
  let cursor;
  for (;;) {
    const page = await base44.entities.PackCard.filter({ active: true }, { limit: 500, cursor, fields: ['id', 'tier'] });
    entries.push(...(page.items || []));
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  poolIndexCache = { entries, expiresAt: Date.now() + POOL_INDEX_TTL_MS };
  return entries;
}

// Tier-first weighted draw: pick a tier by weight (weights of tiers with no
// cards are redistributed proportionally), then a uniform card inside it,
// never repeating a card within the same pack. Operates on the lightweight
// { id, tier } index entries.
function drawPack(index, packSize) {
  const byTier = new Map();
  for (const entry of index) {
    const tier = TIER_WEIGHTS[entry.tier] ? entry.tier : 'base';
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(entry);
  }
  const drawnIds = [];
  const drawnIdSet = new Set();
  for (let slot = 0; slot < packSize; slot += 1) {
    const available = TIER_ORDER.filter(tier => {
      const list = byTier.get(tier) || [];
      return list.some(entry => !drawnIdSet.has(entry.id));
    });
    if (!available.length) break;
    const totalWeight = available.reduce((sum, tier) => sum + TIER_WEIGHTS[tier], 0);
    let roll = randomInt(totalWeight);
    let tier = available[available.length - 1];
    for (const candidate of available) {
      if (roll < TIER_WEIGHTS[candidate]) { tier = candidate; break; }
      roll -= TIER_WEIGHTS[candidate];
    }
    const list = (byTier.get(tier) || []).filter(entry => !drawnIdSet.has(entry.id));
    const picked = list[randomInt(list.length)];
    drawnIds.push(picked.id);
    drawnIdSet.add(picked.id);
  }
  return drawnIds;
}

// Full card details for exactly the drawn ids, returned in draw order.
async function fetchDrawnCards(base44, ids) {
  const page = await base44.entities.PackCard.filter({ id: { $in: ids } }, { limit: ids.length, fields: CARD_FIELDS });
  const byId = new Map((page.items || []).map(card => [card.id, card]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const packSize = Math.min(Math.max(Math.floor(Number(body.packSize)) || PACK_SIZE, 1), 10);

    const index = await poolIndex(base44);
    if (index.length < packSize) {
      return Response.json({ error: `The card pool only has ${index.length} active cards.` }, { status: 503 });
    }
    const drawnIds = drawPack(index, packSize);
    const cards = await fetchDrawnCards(base44, drawnIds);
    // A card can be deactivated between the index snapshot and the detail
    // read; drop the stale cache so the next draw rebuilds it.
    if (cards.length < drawnIds.length) {
      poolIndexCache = null;
      return Response.json({ error: 'The card pool just changed. Try again.' }, { status: 503 });
    }
    return Response.json({
      cards,
      receipt: {
        engine: 'server-crypto-weighted-tier-v2',
        packSize: cards.length,
        poolSize: index.length,
        drawnIds: cards.map(card => card.id),
        openedAt: Date.now(),
        simulationOnly: true,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The pack draw failed.' }, { status: 500 });
  }
}
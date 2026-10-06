// Virtual Pack draw: the pool lives in PackCard (curated from PSA scans and
// the site catalog); every draw runs server-side with crypto randomness so
// nothing client-supplied can choose the cards.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const PACK_SIZE = 5;
// Per-mille tier weights for one card slot (hybrid model: the drawn value
// display comes from PSA price-guide data, the odds come from this table).
const TIER_WEIGHTS = { base: 680, uncommon: 200, rare: 90, super_rare: 25, legendary: 5 };
const TIER_ORDER = ['legendary', 'super_rare', 'rare', 'uncommon', 'base'];

const CARD_FIELDS = ['id', 'name', 'player', 'set', 'year', 'cardNumber', 'variant', 'imageUrl', 'grade', 'tier', 'valueCents', 'population', 'source'];

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

async function activePool(base44) {
  const cards = [];
  let cursor;
  for (;;) {
    const page = await base44.entities.PackCard.filter({ active: true }, { limit: 500, cursor, fields: CARD_FIELDS });
    cards.push(...(page.items || []));
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  return cards;
}

// Tier-first weighted draw: pick a tier by weight (weights of tiers with no
// cards are redistributed proportionally), then a uniform card inside it,
// never repeating a card within the same pack.
function drawPack(pool, packSize) {
  const byTier = new Map();
  for (const card of pool) {
    const tier = TIER_WEIGHTS[card.tier] ? card.tier : 'base';
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(card);
  }
  const drawn = [];
  for (let slot = 0; slot < packSize; slot += 1) {
    const available = TIER_ORDER.filter(tier => {
      const list = byTier.get(tier) || [];
      return list.some(card => !drawn.includes(card));
    });
    if (!available.length) break;
    const totalWeight = available.reduce((sum, tier) => sum + TIER_WEIGHTS[tier], 0);
    let roll = randomInt(totalWeight);
    let tier = available[available.length - 1];
    for (const candidate of available) {
      if (roll < TIER_WEIGHTS[candidate]) { tier = candidate; break; }
      roll -= TIER_WEIGHTS[candidate];
    }
    const list = (byTier.get(tier) || []).filter(card => !drawn.includes(card));
    drawn.push(list[randomInt(list.length)]);
  }
  return drawn;
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

    const pool = await activePool(base44);
    if (pool.length < packSize) {
      return Response.json({ error: `The card pool only has ${pool.length} active cards.` }, { status: 503 });
    }
    const drawn = drawPack(pool, packSize);
    return Response.json({
      cards: drawn.map(({ id, name, player, set, year, cardNumber, variant, imageUrl, grade, tier, valueCents, population, source }) =>
        ({ id, name, player, set, year, cardNumber, variant, imageUrl, grade, tier, valueCents, population, source })),
      receipt: {
        engine: 'server-crypto-weighted-tier-v2',
        packSize: drawn.length,
        poolSize: pool.length,
        drawnIds: drawn.map(card => card.id),
        openedAt: Date.now(),
        simulationOnly: true,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The pack draw failed.' }, { status: 500 });
  }
}
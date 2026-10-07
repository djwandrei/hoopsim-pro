// PackCard harvest helpers: turn raw PSA price-guide rows into PackCard
// records matched against the studio's 2017-26 career player pool.
// Shared between the packPoolHarvest backend function and its tests.

export interface HarvestRow {
  description: string;
  cardNumber: string;
  priceUsd10?: number;
  imageUrl?: string;
}

export interface SetInfo {
  name: string;
  year: number;
}

export interface PreparedCard {
  name: string;
  player: string;
  set: string;
  year: number;
  cardNumber: string;
  variant: string;
  imageUrl: string | null;
  grade: string | null;
  tier: string;
  valueCents: number | null;
  source: string;
  sourceId: string;
  psaPrice10Cents: number | null;
  active: boolean;
}

// Accent/case-insensitive, punctuation-free comparison key.
export function normKey(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'`\u2019\u2018]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value: string): string {
  return normKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Lots, multi-card groups and "rookie set (x12)" listings are never single
// cards — reject them before matching so they can't enter the pack pool.
const LOT_PATTERN = /\((?:x|×)\s*\d+\s*\)|\bset\b|\blots?\b|\bgroup\b|\bcollection\b|\bbreak\b|&\s*more|\+/i;

export function isSingleCardRow(description: string): boolean {
  return Boolean(description) && !LOT_PATTERN.test(description);
}

// Find the longest pool player named at a word boundary in the description.
export function matchPlayer(description: string, poolKeys: Map<string, string>): string | null {
  const desc = normKey(description);
  if (!desc) return null;
  let best: string | null = null;
  let bestLen = 0;
  for (const [key, player] of poolKeys) {
    if (key.length < 5) continue;
    const at = desc.indexOf(key);
    if (at < 0) continue;
    const before = at > 0 ? desc[at - 1] : ' ';
    const after = desc[at + key.length] || ' ';
    const word = /[\s,]|$/.test(before) && /[\s,(]|$/.test(after);
    if (word && key.length > bestLen) {
      best = player;
      bestLen = key.length;
    }
  }
  return best;
}

// Tier from the PSA GEM-MT 10 value (USD), matching the pack's weighted odds.
export function tierFromUsd(usd: number | null | undefined): string | null {
  if (!Number.isFinite(Number(usd)) || Number(usd) <= 0) return null;
  const usdValue = Number(usd);
  if (usdValue < 100) return 'base';
  if (usdValue < 300) return 'uncommon';
  if (usdValue < 1000) return 'rare';
  if (usdValue < 5000) return 'super_rare';
  return 'legendary';
}

// No published price: fall back to print-run / parallel markers in the name.
export function tierFromVariant(variant: string): string {
  const text = normKey(variant);
  if (/(1\/1|black gold|black 1|nebula|plate)/.test(text)) return 'legendary';
  if (/(\/5\b|\/10\b|\/20\b|gold prizm|gold shimmer|mojo|superfractor)/.test(text)) return 'super_rare';
  if (/(\/25\b|\/35\b|\/42\b|\/49\b|\/50\b|\/75\b|\/88\b|orange|purple pulsar|red prizm|choice)/.test(text)) return 'rare';
  if (/(\/99\b|\/125\b|\/149\b|\/175\b|\/199\b|\/249\b|\/299\b|\/399\b|silver prizm|ice|pulsar|wave|fast break|shimmer)/.test(text)) return 'uncommon';
  return 'base';
}

export function buildPoolKeys(poolNames: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const name of poolNames) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const key = normKey(name);
    if (key && !keys.has(key)) keys.set(key, name.trim());
  }
  return keys;
}

export function prepareRows(rows: HarvestRow[], setInfo: SetInfo, poolNames: string[]): PreparedCard[] {
  const poolKeys = buildPoolKeys(poolNames);
  const prepared: PreparedCard[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    if (!row || typeof row.description !== 'string' || !row.cardNumber) continue;
    if (!isSingleCardRow(row.description)) continue;
    const player = matchPlayer(row.description, poolKeys);
    if (!player) continue;
    // Variant: everything after the matched player's name, minus rookie marks.
    const playerKey = normKey(player);
    const descNorm = normKey(row.description);
    const at = descNorm.indexOf(playerKey);
    let variant = '';
    if (at >= 0) variant = row.description.slice(at + playerKey.length).trim();
    variant = variant.replace(/^\(r\)\s*/i, '').replace(/\s+/g, ' ').trim();
    const cardNumber = String(row.cardNumber).trim();
    const variantSlug = slugify(variant) || 'base';
    const sourceId = `${slugify(setInfo.name)}-${cardNumber}-${variantSlug}`;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    const usd = Number(row.priceUsd10);
    const price10 = Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : null;
    const tier = tierFromUsd(price10 != null ? usd : null) || tierFromVariant(variant);
    // Scans: none. PriceCharting's CDN blocks browser hotlinking — its
    // thumbnails render broken in the pack UI (confirmed across harvested
    // sets), and PSA's cardfacts pages are HTML listings, not images. No
    // scan is stored; tiles fall back to the designed placeholder until a
    // manual review supplies art.
    const scanUrl = null;
    prepared.push({
      name: `${setInfo.name} ${cardNumber} ${player}${variant ? ` ${variant}` : ''}`,
      player,
      set: setInfo.name,
      year: Number(setInfo.year),
      cardNumber,
      variant,
      imageUrl: scanUrl,
      grade: price10 != null ? '10' : null,
      tier,
      valueCents: price10,
      source: 'psa',
      sourceId,
      psaPrice10Cents: price10,
      active: true,
    });
  }
  return prepared;
}
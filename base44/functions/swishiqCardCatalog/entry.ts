// Collector-tools relay: the DJHC public basketball card catalog plus the
// verified NBA player mappings behind the site's Supabase RPC. The publishable
// key below is the site's own browser-safe public key (backend-config.js).
const SITE_ORIGIN = 'https://www.djshouseofcards-comics.com';
const CATALOG_URL = `${SITE_ORIGIN}/products-basketball.json`;
const SUPABASE_URL = 'https://gkqdymnmczabcggvigce.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BHrJWQtop2ovkpOMOd9w3A_-9MTaeGG';
const SLAB_RPC = 'get_nba_product_slab_stats';
const VERIFIED_REVIEW_STATES = new Set(['auto_verified', 'human_verified']);
const CANDIDATE_LIMIT = 24;
const MAX_PAGE_SIZE = 60;
const SUGGESTION_LIMIT = 8;
const MAPPING_TIMEOUT_MS = 10000;

function normalizeText(value = '') {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function searchTokens(value = '') {
  return normalizeText(value).split(' ').filter(Boolean);
}

function isNbaCatalogProduct(product = {}) {
  const category = normalizeText(product.category);
  const league = normalizeText(product.league);
  const sport = normalizeText(product.sport);
  if (category !== 'basketball') return false;
  if (league && league !== 'nba') return false;
  if (sport && sport !== 'basketball') return false;
  if (product.isDeleted === true) return false;
  if (!Object.prototype.hasOwnProperty.call(product, 'saleStatus')) return true;
  return ['available', 'inquiry only', 'reserved'].includes(normalizeText(product.saleStatus));
}

function absoluteImage(source = '') {
  const value = String(source ?? '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_ORIGIN}/${value.replace(/^\/+/, '')}`;
}

function normalizeProduct(product) {
  return {
    id: Number(product.id),
    name: String(product.name ?? '').slice(0, 200),
    displayPrice: String(product.displayPrice ?? product.priceLabel ?? '').slice(0, 60),
    team: String(product.team ?? '').slice(0, 80),
    year: Number.isSafeInteger(Number(product.year)) ? Number(product.year) : null,
    condition: String(product.condition ?? '').slice(0, 40),
    playerAthlete: String(product.playerAthlete ?? '').slice(0, 120),
    image: absoluteImage(product.image || product.imageUrl || product.imageGallery?.[0]),
    isFeatured: product.isFeatured === true,
    sortRank: Number(product.sortRank) || 0,
  };
}

// One cold-start parse of the 4MB static catalog; every request after reuses it.
let catalogPromise = null;
function catalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const response = await fetch(CATALOG_URL, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`The basketball catalog is unavailable (${response.status}).`);
      const products = await response.json();
      const rows = (Array.isArray(products) ? products : [])
        .filter(isNbaCatalogProduct)
        .map(normalizeProduct)
        .filter(row => Number.isSafeInteger(row.id) && row.id > 0 && row.name);
      for (const row of rows) {
        const playerText = normalizeText(row.playerAthlete);
        row.searchText = `${playerText} ${normalizeText(row.name)}`.trim();
        row.playerText = playerText;
      }
      return rows;
    })().catch(error => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

function matchesQuery(row, tokens) {
  return tokens.every(token => row.searchText.includes(token));
}

// Mirrors the site's candidate scoring: catalog text only picks a bounded work
// set — it never becomes a verified player relationship by itself.
function scoredCandidates(rows, query, limit = CANDIDATE_LIMIT) {
  const normalizedQuery = normalizeText(query);
  const tokens = searchTokens(query);
  if (!normalizedQuery || !tokens.length) return [];
  return rows
    .map(row => {
      if (!matchesQuery(row, tokens)) return null;
      let score = 1;
      if (row.playerText === normalizedQuery) score += 100;
      else if (row.playerText.includes(normalizedQuery)) score += 75;
      if (normalizeText(row.name).includes(normalizedQuery)) score += 35;
      if (row.playerText) score += 10;
      return { row, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.row.id - left.row.id)
    .slice(0, limit)
    .map(entry => entry.row);
}

// Verified mapping RPC for one product, straight to the site's Supabase project.
async function slabStats(productId) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${SLAB_RPC}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_product_id: Number(productId) }),
    signal: AbortSignal.timeout(MAPPING_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Mapping lookup failed (${response.status}) for product ${productId}.`);
  const payload = await response.json();
  return payload && typeof payload === 'object' ? payload : null;
}

function verifiedMatchesFromPayload(payload, product) {
  if (payload?.provider !== 'NBA' || Number(payload.productId) !== Number(product.id) || !Array.isArray(payload.players)) return [];
  return payload.players.flatMap(entry => {
    const reviewState = String(entry?.mapping?.reviewState ?? '').trim();
    const athleteId = String(entry?.player?.athleteId ?? '').trim();
    const playerName = String(entry?.player?.name ?? '').trim().slice(0, 120);
    if (!VERIFIED_REVIEW_STATES.has(reviewState) || !athleteId || !playerName) return [];
    const endYear = Number(entry.mapping.depictedSeasonEndYear);
    return [{
      verification: 'exact-reviewed-nba-product-mapping',
      product: { id: product.id, name: product.name, image: product.image },
      mapping: {
        reviewState,
        subjectRole: String(entry.mapping.subjectRole ?? '').trim().slice(0, 64),
        depictedSeasonLabel: String(entry.mapping.depictedSeasonLabel ?? '').trim().slice(0, 32),
        depictedSeasonEndYear: Number.isInteger(endYear) && endYear >= 1900 && endYear <= 2200 ? endYear : null,
      },
      player: {
        athleteId,
        name: playerName,
        primaryPosition: String(entry.player?.primaryPosition ?? '').trim().toUpperCase().slice(0, 32),
        headshotUrl: String(entry.player?.headshotUrl ?? '').slice(0, 700),
      },
    }];
  });
}

// Candidate mappings in batches of six so a 24-card work set finishes fast
// without holding more than a handful of concurrent upstream connections.
async function mapCandidates(candidates) {
  const matches = [];
  let failures = 0;
  for (let start = 0; start < candidates.length; start += 6) {
    const batch = candidates.slice(start, start + 6);
    const settled = await Promise.allSettled(batch.map(product => slabStats(product.id)));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        matches.push(...verifiedMatchesFromPayload(result.value, batch[index]));
      } else {
        failures += 1;
      }
    });
  }
  return { matches, failures, unavailable: failures > 0 && failures === candidates.length };
}

export default async function(req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const rows = await catalog();

    // Browse: token-filtered catalog pages for the browse grid and pack search.
    if (body.mode === 'browse') {
      const tokens = searchTokens(body.query);
      const filtered = tokens.length ? rows.filter(row => matchesQuery(row, tokens)) : rows;
      filtered.sort((left, right) => right.isFeatured - left.isFeatured || left.sortRank - right.sortRank || left.id - right.id);
      const pageSize = Math.min(Math.max(Math.floor(Number(body.pageSize)) || 24, 1), MAX_PAGE_SIZE);
      const page = Math.max(Math.floor(Number(body.page)) || 1, 1);
      return Response.json({
        total: filtered.length,
        page,
        pageSize,
        cards: filtered.slice((page - 1) * pageSize, page * pageSize),
      });
    }

    // Suggest: distinct player names for the search combobox.
    if (body.mode === 'suggest') {
      const tokens = searchTokens(body.query);
      if (!tokens.length) return Response.json({ suggestions: [] });
      const counts = new Map();
      for (const row of rows) {
        if (!row.playerText || !tokens.every(token => row.playerText.includes(token))) continue;
        counts.set(row.playerAthlete, (counts.get(row.playerAthlete) || 0) + 1);
      }
      const suggestions = [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, SUGGESTION_LIMIT)
        .map(([name, cards]) => ({ name, cards }));
      return Response.json({ suggestions });
    }

    // Matches: scored candidates plus their verified NBA player mappings.
    if (body.mode === 'matches') {
      const candidates = scoredCandidates(rows, body.query);
      if (!candidates.length) return Response.json({ matches: [], failures: 0, unavailable: false });
      const { matches, failures, unavailable } = await mapCandidates(candidates);
      return Response.json({ matches, failures, unavailable });
    }

    // Mapping: the full verified payload for one product (player-mapping detail).
    if (body.mode === 'mapping') {
      const productId = Number(body.productId);
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        return Response.json({ error: 'A valid product id is required.' }, { status: 400 });
      }
      const payload = await slabStats(productId);
      return Response.json({ payload, product: rows.find(row => row.id === productId) || null });
    }

    return Response.json({ error: 'Unknown mode. Use browse, suggest, matches or mapping.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The card catalog could not be loaded.' }, { status: 500 });
  }
}
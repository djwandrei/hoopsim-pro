import { siteUrl } from '@/lib/deployConfig';
import { eligiblePackCardFromMatches } from '@/lib/cards/packEngine';

const STATIC_CATALOG_PATH = '/products-public.json';
const REMOTE_CATALOG_SOURCE = 'products-basketball.json';
const CANDIDATE_BATCH_SIZE = 24;
const PLAYER_SUGGESTION_LIMIT = 8;
const RPC_CONCURRENCY = 4;
const COLLECTION_MODULE_PATH = '/tools/collection-lineup-builder/collection-fit-core.js?v=20260928i&rev=phase10-pack-mapping-v1';

let catalogPromise = null;
let collectionModulePromise = null;
let adapterPromise = null;
let scriptPromises = new Map();
let catalogSource = 'unavailable';

function browserWindow() {
  return typeof window === 'undefined' ? null : window;
}

function siteAssetUrl(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  try {
    const url = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : raw.startsWith('//')
        ? new URL(raw, siteUrl('/'))
      : new URL(`/${raw.replace(/^(?:\.\.\/)+|^\.\//, '').replace(/^\/+/, '').split('/').map((segment) => encodeURIComponent(segment)).join('/')}`, siteUrl('/'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function productDetailUrl(productId) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id <= 0) return '';
  const url = new URL(siteUrl('/basketball-cards.html'));
  url.searchParams.set('item', String(id));
  return url.href;
}

function normalizeCatalogProduct(product) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  const id = Number(product.id);
  const name = String(product.name || product.title || '').trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;
  const gallery = Array.isArray(product.imageGallery)
    ? product.imageGallery.map(siteAssetUrl).filter(Boolean)
    : [];
  const image = siteAssetUrl(product.image || product.imageUrl || gallery[0]);
  return {
    ...product,
    id,
    name,
    image,
    imageGallery: gallery,
    displayPrice: String(product.displayPrice || product.priceLabel || '').trim(),
    year: Number.isFinite(Number(product.year)) ? Number(product.year) : null,
    productUrl: productDetailUrl(id),
  };
}

async function appendScript(path) {
  const win = browserWindow();
  if (!win?.document) throw new Error('The DJHC catalog is available only in a browser.');
  if (scriptPromises.has(path)) return scriptPromises.get(path);
  const promise = new Promise((resolve, reject) => {
    const script = win.document.createElement('script');
    script.async = true;
    script.src = siteUrl(path);
    script.dataset.djhcReadOnly = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`The DJHC read-only adapter could not load ${path}.`));
    win.document.head.append(script);
  });
  scriptPromises.set(path, promise);
  try { return await promise; }
  catch (error) { scriptPromises.delete(path); throw error; }
}

async function loadReadOnlyAdapter() {
  const win = browserWindow();
  if (!win) throw new Error('The DJHC catalog is available only in a browser.');
  let adapter = win.DJ?.remoteCatalog;
  if (adapter?.listProducts && adapter?.getNbaProductSlabStats) return adapter;
  if (adapterPromise) return adapterPromise;
  adapterPromise = (async () => {
    if (!win.DJ_BACKEND_CONFIG) await appendScript('/backend-config.js');
    if (!win.DJ?.remoteCatalog) await appendScript('/supabase-client.js');
    adapter = win.DJ?.remoteCatalog;
    if (!adapter || typeof adapter.listProducts !== 'function' || typeof adapter.getNbaProductSlabStats !== 'function') {
      throw new Error('The DJHC read-only product and mapping APIs are unavailable.');
    }
    return adapter;
  })().catch((error) => {
    adapterPromise = null;
    throw error;
  });
  return adapterPromise;
}

function loadCollectionModule() {
  if (!collectionModulePromise) {
    const collectionUrl = siteUrl(COLLECTION_MODULE_PATH);
    collectionModulePromise = import(/* @vite-ignore */ collectionUrl)
      .then((collection) => {
        if (typeof collection.extractVerifiedCollectionMatches !== 'function') {
          throw new Error('The DJHC reviewed card-mapping module is unavailable.');
        }
        return collection;
      })
      .catch((error) => {
        collectionModulePromise = null;
        throw error;
      });
  }
  return collectionModulePromise;
}

async function loadStaticProducts(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('The buyer-safe DJHC catalog could not be loaded.');
  const response = await fetchImpl(siteUrl(STATIC_CATALOG_PATH), { cache: 'no-store', credentials: 'omit' });
  if (!response?.ok) throw new Error(`The buyer-safe DJHC catalog returned HTTP ${response?.status || 'error'}.`);
  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('The buyer-safe DJHC catalog has an unexpected format.');
  return payload;
}

async function fetchCatalogProducts({ force = false, fetchImpl = globalThis.fetch } = {}) {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    let products = null;
    try {
      const adapter = await loadReadOnlyAdapter();
      if (typeof adapter.isConfigured !== 'function' || adapter.isConfigured()) {
        const remote = await adapter.listProducts({ source: REMOTE_CATALOG_SOURCE, force });
        if (Array.isArray(remote) && remote.length) {
          products = remote;
          catalogSource = 'live storefront catalog';
        }
      }
    } catch {
      products = null;
    }
    if (!products) {
      products = await loadStaticProducts(fetchImpl);
      catalogSource = 'published buyer-safe catalog fallback';
    }
    return products.map(normalizeCatalogProduct)
      .filter((product) => product && isNbaCatalogProduct(product));
  })().catch((error) => {
    catalogPromise = null;
    catalogSource = 'unavailable';
    throw error;
  });
  return catalogPromise;
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

// The storefront player-card script boots its page UI when imported. Keep the
// bounded text-only candidate pass local and reserve the shared module import
// above for the side-effect-free exact mapping extractor.
function searchTokens(value) {
  return normalizeSearchText(value).split(' ').filter(Boolean);
}

function matchesSearch(playerName = '', query = '') {
  const normalizedName = normalizeSearchText(playerName);
  const tokens = searchTokens(query);
  return Boolean(normalizedName && tokens.length && tokens.every((token) => normalizedName.includes(token)));
}

function splitCoSubjectNames(value = '') {
  return String(value ?? '').trim().split('|').map((name) => name.trim()).filter(Boolean);
}

function positiveLimit(value, fallback = Infinity) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const normalized = Math.floor(numeric);
  return normalized > 0 ? normalized : fallback;
}

function buildCandidateProducts(products = [], query = '', limit = Infinity) {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = searchTokens(query);
  const max = positiveLimit(limit);
  if (!normalizedQuery || !tokens.length) return [];
  return products
    .filter(isNbaCatalogProduct)
    .map((product) => {
      const playerText = normalizeSearchText(product.playerAthlete);
      const titleText = normalizeSearchText(product.name);
      const combinedText = `${playerText} ${titleText}`.trim();
      if (!tokens.every((token) => combinedText.includes(token))) return null;
      let score = 1;
      if (playerText === normalizedQuery) score += 100;
      else if (playerText.includes(normalizedQuery)) score += 75;
      if (titleText.includes(normalizedQuery)) score += 35;
      if (playerText) score += 10;
      return { product, score };
    })
    .filter(Boolean)
    .sort((left, right) => (
      right.score - left.score
      || Number(right.product.year || 0) - Number(left.product.year || 0)
      || Number(left.product.id || 0) - Number(right.product.id || 0)
    ))
    .slice(0, max)
    .map(({ product }) => product);
}

function buildPlayerSuggestions(products = [], query = '', limit = PLAYER_SUGGESTION_LIMIT) {
  const tokens = searchTokens(query);
  if (!tokens.length) return [];
  const max = positiveLimit(limit, PLAYER_SUGGESTION_LIMIT);
  const names = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!isNbaCatalogProduct(product)) return;
    splitCoSubjectNames(product.playerAthlete).forEach((name) => {
      const normalizedName = normalizeSearchText(name);
      if (!normalizedName || !tokens.every((token) => normalizedName.includes(token))) return;
      if (!names.has(normalizedName)) names.set(normalizedName, name);
    });
  });
  return [...names.entries()]
    .map(([normalizedName, name]) => ({ name, normalizedName }))
    .sort((left, right) => (
      Number(right.normalizedName === tokens.join(' ')) - Number(left.normalizedName === tokens.join(' '))
      || Number(right.normalizedName.startsWith(tokens.join(' '))) - Number(left.normalizedName.startsWith(tokens.join(' ')))
      || left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
      || left.normalizedName.localeCompare(right.normalizedName)
    ))
    .slice(0, max)
    .map(({ name }) => name);
}

function getCandidateBatch(candidates = [], checkedCount = 0, batchSize = CANDIDATE_BATCH_SIZE) {
  const start = Math.max(0, Math.min(candidates.length, Math.floor(Number(checkedCount) || 0)));
  const size = positiveLimit(batchSize, CANDIDATE_BATCH_SIZE);
  return candidates.slice(start, start + size);
}

export function getCatalogSourceLabel() {
  return catalogSource;
}

export function isNbaCatalogProduct(product) {
  const category = normalizeSearchText(product?.category);
  const league = normalizeSearchText(product?.league);
  const sport = normalizeSearchText(product?.sport);
  // Match the storefront's buyer-safe eligibility predicate. Older published
  // rows can omit league/sport, so an absent optional field stays eligible when
  // the category is Basketball; an explicit non-NBA/non-Basketball value does
  // not.
  if (category !== 'basketball') return false;
  if (league && league !== 'nba') return false;
  if (sport && sport !== 'basketball') return false;
  if (product?.isDeleted === true) return false;
  if (Object.prototype.hasOwnProperty.call(product || {}, 'saleStatus')) {
    const saleStatus = normalizeSearchText(product.saleStatus);
    if (!['available', 'inquiry only', 'reserved'].includes(saleStatus)) return false;
  }
  return true;
}

export async function loadNbaCatalog(options = {}) {
  return fetchCatalogProducts(options);
}

export async function browseCards({ query = '', page = 1, pageSize = 12, force = false } = {}) {
  const products = await fetchCatalogProducts({ force });
  const normalizedQuery = normalizeSearchText(query);
  const matching = normalizedQuery
    ? products.filter((product) => normalizeSearchText([product.name, product.playerAthlete, product.team, product.condition].join(' ')).includes(normalizedQuery))
    : products;
  const safePageSize = Math.max(1, Math.min(100, Math.floor(Number(pageSize) || 12)));
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const offset = (safePage - 1) * safePageSize;
  return {
    cards: matching.slice(offset, offset + safePageSize),
    total: matching.length,
    source: catalogSource,
  };
}

export async function suggestPlayers(query, limit = 8) {
  const products = await fetchCatalogProducts();
  const suggestions = buildPlayerSuggestions(products, query, limit);
  return suggestions.map((name) => ({
    name,
    candidateCount: buildCandidateProducts(products, name).length,
  }));
}

async function getVerifiedMatchesFromAdapter(adapter, collection, product, query = '') {
  if (!adapter || typeof adapter.getNbaProductSlabStats !== 'function'
    || (typeof adapter.isConfigured === 'function' && !adapter.isConfigured())) {
    throw new Error('The DJHC verified NBA product mapping service is unavailable.');
  }
  const payload = await adapter.getNbaProductSlabStats(product.id);
  return collection.extractVerifiedCollectionMatches(payload, product)
    .filter((match) => !String(query || '').trim() || matchesSearch(match.player?.name, query))
    .map((match) => ({ ...match, product }));
}

export async function verifyProductMappings(product, query = '') {
  const normalized = normalizeCatalogProduct(product);
  if (!normalized || !isNbaCatalogProduct(normalized)) return [];
  const [adapter, collection] = await Promise.all([loadReadOnlyAdapter(), loadCollectionModule()]);
  return getVerifiedMatchesFromAdapter(adapter, collection, normalized, query);
}

export function attachProductListing(product) {
  const normalized = normalizeCatalogProduct(product);
  return normalized;
}

export function createEligiblePackCard(product, verifiedMatches) {
  const card = eligiblePackCardFromMatches(verifiedMatches);
  if (!card || Number(card.product?.id) !== Number(product?.id)) return null;
  const normalized = normalizeCatalogProduct(product);
  if (!normalized || !isNbaCatalogProduct(normalized)) return null;
  return {
    ...card,
    product: {
      ...card.product,
      id: normalized.id,
      name: normalized.name,
      image: normalized.image,
      displayPrice: normalized.displayPrice,
      team: normalized.team || '',
      condition: normalized.condition || '',
      year: Number.isFinite(Number(normalized.year)) ? Number(normalized.year) : null,
      productUrl: normalized.productUrl,
    },
  };
}

export async function findPlayerMatches(query, { offset = 0, batchSize = CANDIDATE_BATCH_SIZE } = {}) {
  const normalizedQuery = String(query ?? '').trim();
  if (normalizedQuery.length < 2) return { matches: [], unavailable: false, failures: 0, candidateCount: 0, checkedCount: 0, nextOffset: 0 };
  const products = await fetchCatalogProducts();
  const collection = await loadCollectionModule();
  const candidates = buildCandidateProducts(products, normalizedQuery);
  const start = Math.max(0, Math.min(candidates.length, Math.floor(Number(offset) || 0)));
  const batch = getCandidateBatch(candidates, start, batchSize);
  if (!batch.length) return { matches: [], unavailable: false, failures: 0, candidateCount: candidates.length, checkedCount: 0, nextOffset: start };

  let adapter;
  try { adapter = await loadReadOnlyAdapter(); }
  catch {
    return { matches: [], unavailable: true, failures: batch.length, candidateCount: candidates.length, checkedCount: batch.length, nextOffset: start + batch.length };
  }
  if (typeof adapter.getNbaProductSlabStats !== 'function'
    || (typeof adapter.isConfigured === 'function' && !adapter.isConfigured())) {
    return { matches: [], unavailable: true, failures: batch.length, candidateCount: candidates.length, checkedCount: batch.length, nextOffset: start + batch.length };
  }

  const matches = [];
  let failures = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < batch.length) {
      const product = batch[cursor++];
      try {
        matches.push(...await getVerifiedMatchesFromAdapter(adapter, collection, product, normalizedQuery));
      } catch {
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(RPC_CONCURRENCY, batch.length) }, worker));
  const unique = new Map();
  for (const match of matches) {
    const id = Number(match.product.id);
    const group = unique.get(id) || { product: match.product, mappings: [], player: match.player };
    group.mappings.push(match);
    unique.set(id, group);
  }
  const ordered = [...unique.values()].sort((left, right) => (
    Number(left.product.sortRank || 0) - Number(right.product.sortRank || 0)
    || Number(right.product.year || 0) - Number(left.product.year || 0)
    || Number(left.product.id || 0) - Number(right.product.id || 0)
  ));
  return {
    matches: ordered,
    unavailable: failures === batch.length && failures > 0,
    failures,
    candidateCount: candidates.length,
    checkedCount: batch.length,
    nextOffset: start + batch.length,
  };
}

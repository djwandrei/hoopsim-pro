import {
  buildCandidateProducts,
  isNbaCatalogProduct,
  matchesSearch,
} from '../player-card-matchups/player-card-matchups.js?v=20261005a&rev=player-card-thumbnail-fallback-v1';
import { extractVerifiedCollectionMatches } from '../collection-lineup-builder/collection-fit-core.js?v=20260927s&rev=collection-local-fit-v1';
import {
  addTradeUserNote,
  addVerifiedTradeCard,
  MAX_TRADE_PACKAGE_ITEMS,
  moveTradePackageEntry,
  readTradePackageState,
  removeTradePackageEntry,
  summarizeTradePackages,
  tradePackageEntryKey,
  writeTradePackageState,
} from './trade-package-model.js?v=20260927s&rev=trade-package-model-v1';

const SEARCH_BATCH_SIZE = 18;
const SEARCH_CANDIDATE_LIMIT = 120;
const LOOKUP_CONCURRENCY = 4;
const MAX_VERIFIED_RESULTS = 48;

const ui = {
  searchForm: null,
  searchInput: null,
  searchStatus: null,
  searchResults: null,
  checkMore: null,
  noteForm: null,
  noteInput: null,
  noteSide: null,
  draftStatus: null,
  sideAItems: null,
  sideBItems: null,
  sideACount: null,
  sideBCount: null,
  compareButton: null,
  compareStatus: null,
  comparison: null,
};

const state = {
  catalogPromise: null,
  catalogProducts: null,
  searchToken: 0,
  searchQuery: '',
  candidates: [],
  checkedCount: 0,
  searchMatches: new Map(),
  lookupFailures: 0,
  verifiedDraft: new Map(),
  entries: [],
  isSearching: false,
  isRechecking: false,
  noteCounter: 0,
};

function text(value) {
  return String(value ?? '').trim();
}

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function remoteCatalog() {
  return window.DJ?.remoteCatalog || null;
}

function setStatus(node, message, { error = false, busy = false } = {}) {
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', error);
  node.classList.toggle('is-loading', busy);
  node.setAttribute('aria-busy', String(busy));
}

function cardKey(productId, athleteId) {
  return tradePackageEntryKey({ kind: 'catalog-card', productId, athleteId, side: 'a' });
}

function seasonLabel(mapping = {}) {
  if (mapping.depictedSeasonLabel) return text(mapping.depictedSeasonLabel);
  const endYear = Number(mapping.depictedSeasonEndYear);
  return Number.isInteger(endYear) ? `${endYear - 1}–${String(endYear).slice(-2)}` : 'Season not supplied';
}

function cardCountForSide(side) {
  return state.entries.filter((entry) => entry.side === side).length;
}

function announceDraftChanged(message = 'Draft updated. Compare again to refresh the contents summary.') {
  state.entries = state.entries.slice(0, MAX_TRADE_PACKAGE_ITEMS);
  const persisted = writeTradePackageState(state.entries, safeStorage());
  ui.comparison?.replaceChildren();
  setStatus(ui.compareStatus, message);
  updateDraftStatus();
  if (!persisted) {
    setStatus(ui.draftStatus, 'Draft updated for this visit, but browser storage is unavailable. No remote copy is made.', { error: true });
  }
  renderDraft();
}

function createActionButton(label, action, { side = '', key = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-secondary';
  button.textContent = label;
  button.dataset.action = action;
  if (side) button.dataset.side = side;
  if (key) button.dataset.entryKey = key;
  return button;
}

function createCardSearchResult(match) {
  const article = document.createElement('article');
  article.className = 'trade-card-result';
  const copy = document.createElement('div');
  copy.className = 'trade-card-result__copy';
  const heading = document.createElement('h3');
  heading.textContent = match.player.name;
  const detail = document.createElement('p');
  detail.textContent = `${match.product.name} · ${seasonLabel(match.mapping)}`;
  copy.append(heading, detail);

  const actions = document.createElement('div');
  actions.className = 'trade-card-result__actions';
  for (const side of ['a', 'b']) {
    const label = side === 'a' ? 'Add to Side A' : 'Add to Side B';
    const button = createActionButton(label, 'add-card', { side });
    button.dataset.productId = String(match.product.id);
    button.dataset.athleteId = String(match.player.athleteId);
    button.setAttribute('aria-label', `${label}: ${match.player.name}, ${match.product.name}`);
    actions.append(button);
  }
  article.append(copy, actions);
  return article;
}

function renderSearchResults() {
  if (!ui.searchResults) return;
  ui.searchResults.replaceChildren(...[...state.searchMatches.values()].slice(0, MAX_VERIFIED_RESULTS).map(createCardSearchResult));
}

function updateCheckMore() {
  if (!ui.checkMore) return;
  const remaining = Math.max(0, state.candidates.length - state.checkedCount);
  ui.checkMore.hidden = remaining === 0 || state.isSearching;
  ui.checkMore.disabled = state.isSearching;
  ui.checkMore.textContent = remaining
    ? 'Show more cards'
    : 'No more cards to show';
}

function createDraftItem(entry) {
  const item = document.createElement('li');
  item.className = 'trade-package-item';
  item.dataset.entryKey = tradePackageEntryKey(entry);
  const copy = document.createElement('div');
  copy.className = 'trade-package-item__copy';
  const heading = document.createElement('h4');
  const detail = document.createElement('p');

  if (entry.kind === 'user-note') {
    heading.textContent = entry.label;
    detail.textContent = 'Your note · not matched to a card or player';
  } else {
    const verified = state.verifiedDraft.get(tradePackageEntryKey(entry));
    heading.textContent = verified?.player?.name || 'Saved card';
    detail.textContent = verified
      ? `${verified.product.name} · ${seasonLabel(verified.mapping)}`
      : 'Player match unavailable; kept locally and not shown as a linked card.';
  }
  copy.append(heading, detail);

  const actions = document.createElement('div');
  actions.className = 'trade-package-item__actions';
  const otherSide = entry.side === 'a' ? 'b' : 'a';
  const otherLabel = otherSide === 'a' ? 'Side A' : 'Side B';
  const move = createActionButton(`Move to ${otherLabel}`, 'move-item', { side: otherSide, key: tradePackageEntryKey(entry) });
  move.setAttribute('aria-label', `Move ${heading.textContent} to ${otherLabel}`);
  const remove = createActionButton('Remove', 'remove-item', { side: entry.side, key: tradePackageEntryKey(entry) });
  remove.setAttribute('aria-label', `Remove ${heading.textContent} from Side ${entry.side.toUpperCase()}`);
  actions.append(move, remove);
  item.append(copy, actions);
  return item;
}

function renderDraft() {
  for (const [side, list, count] of [
    ['a', ui.sideAItems, ui.sideACount],
    ['b', ui.sideBItems, ui.sideBCount],
  ]) {
    if (!list || !count) continue;
    const entries = state.entries.filter((entry) => entry.side === side);
    count.textContent = `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`;
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'trade-package-empty';
      empty.textContent = 'No items added to this side yet.';
      list.replaceChildren(empty);
    } else {
      list.replaceChildren(...entries.map(createDraftItem));
    }
  }
}

function updateDraftStatus() {
  const cards = state.entries.filter((entry) => entry.kind === 'catalog-card');
  if (state.isRechecking) {
    setStatus(ui.draftStatus, 'Updating player matches for saved cards…', { busy: true });
    return;
  }
  const matched = cards.filter((entry) => state.verifiedDraft.has(tradePackageEntryKey(entry))).length;
  const unresolved = cards.length - matched;
  const noteCount = state.entries.filter((entry) => entry.kind === 'user-note').length;
  const summary = cards.length
    ? `${matched} of ${cards.length} saved card${cards.length === 1 ? '' : 's'} have player matches${unresolved ? `; ${unresolved} remain local and are not counted as matched players` : ''}.`
    : 'No saved cards yet.';
  const noteText = noteCount ? ` ${noteCount} user-described item${noteCount === 1 ? '' : 's'} remain local notes.` : '';
  setStatus(ui.draftStatus, `${summary}${noteText} No ownership or roster state is stored.`, { error: cards.length > 0 && matched === 0 });
}

function createComparisonSide(summary) {
  const section = document.createElement('section');
  section.className = 'trade-package-comparison__side';
  section.setAttribute('aria-labelledby', `compareSide${summary.side.toUpperCase()}Heading`);
  const heading = document.createElement('h3');
  heading.id = `compareSide${summary.side.toUpperCase()}Heading`;
  heading.textContent = `Side ${summary.side.toUpperCase()}`;
  const counts = document.createElement('ul');
  for (const label of [
    `${summary.itemCount} listed ${summary.itemCount === 1 ? 'item' : 'items'}`,
    `${summary.catalogCardCount} catalog card reference${summary.catalogCardCount === 1 ? '' : 's'}`,
    `${summary.verifiedCardCount} matched player-card${summary.verifiedCardCount === 1 ? '' : 's'}`,
    `${summary.needsRecheckCount} saved card${summary.needsRecheckCount === 1 ? '' : 's'} without a player match`,
    `${summary.userNoteCount} user-described note item${summary.userNoteCount === 1 ? '' : 's'}`,
  ]) {
    const item = document.createElement('li');
    item.textContent = label;
    counts.append(item);
  }
  section.append(heading, counts);
  return section;
}

function compareContents() {
  const summary = summarizeTradePackages(state.entries, [...state.verifiedDraft.keys()]);
  const sides = document.createElement('div');
  sides.className = 'trade-package-comparison__sides';
  sides.append(...summary.sides.map(createComparisonSide));
  const notice = document.createElement('p');
  notice.className = 'trade-package-comparison__notice';
  notice.textContent = 'Only item counts were compared. No value or fairness result was calculated.';
  ui.comparison.replaceChildren(sides, notice);
  setStatus(ui.compareStatus, 'Side contents compared. No deal grade, player value, card price total, or fairness result was calculated.');
}

async function loadCatalogProducts() {
  if (state.catalogPromise) return state.catalogPromise;
  state.catalogPromise = (async () => {
    const adapter = remoteCatalog();
    if (!adapter || typeof adapter.listProducts !== 'function' || typeof adapter.getNbaProductSlabStats !== 'function') {
      throw new Error('Card choices are unavailable right now. User notes remain available.');
    }
    if (typeof adapter.isConfigured === 'function' && !adapter.isConfigured()) {
      throw new Error('Card choices are unavailable right now. User notes remain available.');
    }
    const products = await adapter.listProducts({ source: 'products-basketball.json' });
    if (!Array.isArray(products)) throw new Error('Card choices are unavailable right now.');
    state.catalogProducts = products.filter(isNbaCatalogProduct);
    return state.catalogProducts;
  })();
  try {
    return await state.catalogPromise;
  } catch (error) {
    state.catalogPromise = null;
    throw error;
  }
}

function setSearchBusy(busy) {
  state.isSearching = busy;
  const submit = ui.searchForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = busy;
  if (ui.searchInput) ui.searchInput.readOnly = busy;
  ui.searchForm?.setAttribute('aria-busy', String(busy));
  ui.searchResults?.setAttribute('aria-busy', String(busy));
  updateCheckMore();
}

function matchKey(match) {
  return cardKey(match?.product?.id, match?.player?.athleteId);
}

async function checkCandidateBatch(token) {
  const batch = state.candidates.slice(state.checkedCount, state.checkedCount + SEARCH_BATCH_SIZE);
  if (!batch.length || state.isSearching || token !== state.searchToken) return;
  setSearchBusy(true);
  const first = state.checkedCount + 1;
  const last = state.checkedCount + batch.length;
  setStatus(ui.searchStatus, 'Finding player matches…', { busy: true });

  let cursor = 0;
  let failures = 0;
  const matches = [];
  async function worker() {
    while (cursor < batch.length) {
      const product = batch[cursor++];
      try {
        const payload = await remoteCatalog().getNbaProductSlabStats(product.id);
        const verified = extractVerifiedCollectionMatches(payload, product)
          .filter((match) => matchesSearch(match.player.name, state.searchQuery));
        matches.push(...verified);
      } catch (error) {
        failures += 1;
        console.warn(`Trade package verified mapping lookup failed for product ${product.id}.`, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, batch.length) }, worker));
  if (token !== state.searchToken) return;
  for (const match of matches) {
    const key = matchKey(match);
    if (key && !state.searchMatches.has(key)) state.searchMatches.set(key, match);
  }
  state.checkedCount += batch.length;
  state.lookupFailures += failures;
  renderSearchResults();
  const remaining = state.candidates.length - state.checkedCount;
  const failureMessage = state.lookupFailures && !state.searchMatches.size
    ? ' Player matches are temporarily unavailable. Try again.'
    : '';
  const countMessage = state.searchMatches.size
    ? `${state.searchMatches.size} player match${state.searchMatches.size === 1 ? '' : 'es'} found.`
    : 'No player match found.';
  const moreMessage = remaining ? ' More cards may match; show more cards or refine the search.' : '';
  setStatus(ui.searchStatus, `${countMessage}${moreMessage}${failureMessage}`, { error: !state.searchMatches.size && !remaining && state.lookupFailures === state.checkedCount });
  setSearchBusy(false);
}

async function runSearch(query) {
  const searchToken = ++state.searchToken;
  setSearchBusy(false);
  state.searchQuery = text(query);
  state.candidates = [];
  state.checkedCount = 0;
  state.searchMatches.clear();
  state.lookupFailures = 0;
  renderSearchResults();
  updateCheckMore();
  if (state.searchQuery.length < 2) {
    setStatus(ui.searchStatus, 'Enter at least two characters to search.', { error: true });
    return;
  }

  setSearchBusy(true);
  setStatus(ui.searchStatus, 'Loading card choices…', { busy: true });
  try {
    const products = await loadCatalogProducts();
    if (searchToken !== state.searchToken) return;
    state.candidates = buildCandidateProducts(products, state.searchQuery, SEARCH_CANDIDATE_LIMIT);
    if (!state.candidates.length) {
      setStatus(ui.searchStatus, 'No cards match those search words.');
      setSearchBusy(false);
      return;
    }
    setSearchBusy(false);
    await checkCandidateBatch(searchToken);
  } catch (error) {
    if (searchToken !== state.searchToken) return;
    setStatus(ui.searchStatus, 'Card choices are unavailable right now. Try again. Your notes remain available.', { error: true });
    setSearchBusy(false);
  }
}

function focusDraftSide(side) {
  document.getElementById(side === 'a' ? 'sideAHeading' : 'sideBHeading')?.focus();
}

function handleSearchResultAction(event) {
  const button = event.target.closest('button[data-action="add-card"]');
  if (!button || !ui.searchResults.contains(button)) return;
  const key = cardKey(button.dataset.productId, button.dataset.athleteId);
  const match = state.searchMatches.get(key);
  const side = button.dataset.side;
  if (!match || !['a', 'b'].includes(side)) {
    setStatus(ui.searchStatus, 'Player match unavailable. Search again before adding this card.', { error: true });
    return;
  }
  const before = state.entries.length;
  const next = addVerifiedTradeCard(state.entries, match, side);
  if (next.length === before && before >= MAX_TRADE_PACKAGE_ITEMS && !state.entries.some((entry) => tradePackageEntryKey(entry) === key)) {
    setStatus(ui.draftStatus, `This draft is limited to ${MAX_TRADE_PACKAGE_ITEMS} items. Remove an item before adding another.`, { error: true });
    return;
  }
  state.entries = next;
  state.verifiedDraft.set(key, match);
  const moved = state.entries.some((entry) => tradePackageEntryKey(entry) === key && entry.side === side);
  announceDraftChanged(moved ? `${match.player.name} card added to Side ${side.toUpperCase()}.` : 'The card could not be added to this draft.');
}

function createNoteId() {
  state.noteCounter += 1;
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${state.noteCounter}`;
  return `note-${randomPart}`;
}

function handleNoteSubmit(event) {
  event.preventDefault();
  const label = text(ui.noteInput?.value);
  const side = ui.noteSide?.value;
  if (!label) {
    setStatus(ui.draftStatus, 'Describe the item before adding it as a local note.', { error: true });
    ui.noteInput?.focus();
    return;
  }
  if (state.entries.length >= MAX_TRADE_PACKAGE_ITEMS) {
    setStatus(ui.draftStatus, `This draft is limited to ${MAX_TRADE_PACKAGE_ITEMS} items. Remove an item before adding another.`, { error: true });
    return;
  }
  state.entries = addTradeUserNote(state.entries, label, side, createNoteId());
  ui.noteForm?.reset();
  announceDraftChanged(`Your note was added to Side ${side.toUpperCase()}. It is not matched to a card or player.`);
  ui.noteInput?.focus();
}

function handleDraftAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !ui.sideAItems.contains(button) && !ui.sideBItems.contains(button)) return;
  const key = button.dataset.entryKey;
  const action = button.dataset.action;
  const side = button.dataset.side;
  if (action === 'move-item') {
    const entry = state.entries.find((candidate) => tradePackageEntryKey(candidate) === key);
    if (!entry || !['a', 'b'].includes(side)) return;
    state.entries = moveTradePackageEntry(state.entries, key, side);
    announceDraftChanged(`Item moved to Side ${side.toUpperCase()}.`);
    focusDraftSide(side);
  } else if (action === 'remove-item') {
    const removed = state.entries.find((candidate) => tradePackageEntryKey(candidate) === key);
    if (!removed) return;
    state.entries = removeTradePackageEntry(state.entries, key);
    if (removed.kind === 'catalog-card') state.verifiedDraft.delete(key);
    announceDraftChanged('Item removed from the hypothetical package.');
    focusDraftSide(side);
  }
}

async function reverifySavedCards() {
  const savedCards = state.entries.filter((entry) => entry.kind === 'catalog-card');
  if (!savedCards.length) {
    updateDraftStatus();
    renderDraft();
    return;
  }
  const adapter = remoteCatalog();
  if (!adapter || typeof adapter.listProducts !== 'function' || typeof adapter.getNbaProductSlabStats !== 'function') {
    state.isRechecking = false;
    updateDraftStatus();
    renderDraft();
    setStatus(ui.draftStatus, 'Player matches are unavailable right now. Saved cards remain in this browser, and user notes can still be edited.');
    return;
  }
  if (typeof adapter.isConfigured === 'function' && !adapter.isConfigured()) {
    state.isRechecking = false;
    updateDraftStatus();
    renderDraft();
    setStatus(ui.draftStatus, 'Player matches are unavailable right now. Saved cards remain in this browser, and user notes can still be edited.');
    return;
  }

  state.isRechecking = true;
  updateDraftStatus();
  try {
    const ids = [...new Set(savedCards.map((entry) => entry.productId))];
    const products = await adapter.listProducts({ source: 'products-basketball.json', ids });
    const visibleById = new Map((Array.isArray(products) ? products : [])
      .filter(isNbaCatalogProduct)
      .map((product) => [Number(product.id), product]));
    let cursor = 0;
    async function worker() {
      while (cursor < ids.length) {
        const productId = ids[cursor++];
        const product = visibleById.get(productId);
        if (!product) continue;
        try {
          const payload = await adapter.getNbaProductSlabStats(productId);
          const matches = extractVerifiedCollectionMatches(payload, product);
          for (const match of matches) {
            const key = matchKey(match);
            if (savedCards.some((entry) => tradePackageEntryKey(entry) === key)) state.verifiedDraft.set(key, match);
          }
        } catch (error) {
          console.warn(`Saved trade package mapping recheck failed for product ${productId}.`, error);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, ids.length) }, worker));
  } catch (error) {
    console.warn('Saved trade package could not be rechecked against the current public catalog.', error);
  } finally {
    state.isRechecking = false;
    updateDraftStatus();
    renderDraft();
  }
}

function bindUI() {
  ui.searchForm = document.getElementById('tradeCardSearchForm');
  ui.searchInput = document.getElementById('tradeCardSearch');
  ui.searchStatus = document.getElementById('tradeCardSearchStatus');
  ui.searchResults = document.getElementById('tradeCardSearchResults');
  ui.checkMore = document.getElementById('tradeCardCheckMore');
  ui.noteForm = document.getElementById('tradeNoteForm');
  ui.noteInput = document.getElementById('tradeNoteLabel');
  ui.noteSide = document.getElementById('tradeNoteSide');
  ui.draftStatus = document.getElementById('tradeDraftStatus');
  ui.sideAItems = document.getElementById('sideAItems');
  ui.sideBItems = document.getElementById('sideBItems');
  ui.sideACount = document.getElementById('sideACount');
  ui.sideBCount = document.getElementById('sideBCount');
  ui.compareButton = document.getElementById('compareTradePackages');
  ui.compareStatus = document.getElementById('tradeCompareStatus');
  ui.comparison = document.getElementById('tradePackageComparison');
}

function boot() {
  bindUI();
  if (!ui.searchForm || !ui.sideAItems || !ui.sideBItems || !ui.noteForm) return;
  state.entries = readTradePackageState(safeStorage());
  renderDraft();
  ui.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void runSearch(ui.searchInput.value);
  });
  ui.searchResults.addEventListener('click', handleSearchResultAction);
  ui.checkMore.addEventListener('click', () => void checkCandidateBatch(state.searchToken));
  ui.noteForm.addEventListener('submit', handleNoteSubmit);
  ui.sideAItems.addEventListener('click', handleDraftAction);
  ui.sideBItems.addEventListener('click', handleDraftAction);
  ui.compareButton.addEventListener('click', compareContents);
  updateDraftStatus();
  void reverifySavedCards();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

import {
  buildCandidateProducts,
  getCandidateBatch,
  isNbaCatalogProduct,
  matchesSearch,
  normalizeSearchText,
} from '../player-card-matchups/player-card-matchups.js?v=20261005a&rev=player-card-thumbnail-fallback-v1';
import {
  collectionEntryKey,
  extractVerifiedCollectionMatches,
  findProfilePositionFit,
  readCollectionState,
  removeCollectionEntry,
  setCollectionEntryRelation,
  upsertCollectionEntry,
  writeCollectionState,
} from './collection-fit-core.js?v=20260927s&rev=collection-local-fit-v1';

const SEARCH_BATCH_SIZE = 24;
const LOOKUP_CONCURRENCY = 4;
const MAX_REVERIFIED_PRODUCTS = 120;

const ui = {
  searchForm: null,
  searchInput: null,
  searchStatus: null,
  searchResults: null,
  checkMore: null,
  collectionStatus: null,
  collectionActionStatus: null,
  collectionList: null,
  recheckCollection: null,
  fitButton: null,
  fitStatus: null,
  fitResult: null,
};

const state = {
  searchToken: 0,
  refreshToken: 0,
  query: '',
  candidates: [],
  checkedCount: 0,
  searchMatches: [],
  failures: 0,
  isSearching: false,
  collectionEntries: [],
  verifiedCollection: new Map(),
  unresolvedCollection: new Map(),
  isRefreshingCollection: false,
};

function text(value) {
  return String(value ?? '').trim();
}

function formatSeasonLabel(match) {
  if (match.mapping?.depictedSeasonLabel) return match.mapping.depictedSeasonLabel;
  const endYear = Number(match.mapping?.depictedSeasonEndYear);
  return Number.isInteger(endYear) ? `${endYear - 1}–${String(endYear).slice(-2)}` : 'Season not supplied';
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
}

function setSearchBusy(busy) {
  state.isSearching = busy;
  const submit = ui.searchForm?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = busy;
  if (ui.searchInput) ui.searchInput.readOnly = busy;
  ui.searchForm?.setAttribute('aria-busy', String(busy));
  ui.searchResults?.setAttribute('aria-busy', String(busy));
  ui.checkMore?.setAttribute('aria-disabled', String(busy));
}

function announceCollectionAction(message) {
  setStatus(ui.collectionActionStatus, message);
}

function focusAction(container, action, productId, athleteId) {
  if (!container) return false;
  const targetProductId = String(productId);
  const targetAthleteId = String(athleteId);
  const match = [...container.querySelectorAll('button[data-action]')].find((button) => (
    button.dataset.action === action
    && button.dataset.productId === targetProductId
    && button.dataset.athleteId === targetAthleteId
  ));
  if (!match) return false;
  match.focus();
  return true;
}

function focusedAction(container) {
  const active = document.activeElement;
  if (!container?.contains(active) || !active.matches?.('button[data-action]')) return null;
  return {
    action: active.dataset.action,
    productId: active.dataset.productId,
    athleteId: active.dataset.athleteId,
  };
}

function restoreActionFocus(container, snapshot) {
  if (snapshot) focusAction(container, snapshot.action, snapshot.productId, snapshot.athleteId);
}

function restoreCollectionRefreshFocus(snapshot) {
  if (!snapshot) return;
  if (snapshot.surface === 'search') {
    restoreActionFocus(ui.searchResults, snapshot);
  } else if (snapshot.surface === 'collection') {
    const restored = focusAction(ui.collectionList, snapshot.action, snapshot.productId, snapshot.athleteId);
    if (!restored && snapshot.action === 'relation') {
      focusAction(ui.collectionList, 'remove', snapshot.productId, snapshot.athleteId);
    }
  } else if (snapshot.surface === 'search-input') {
    ui.searchInput?.focus();
  } else if (snapshot.surface === 'recheck' && !ui.recheckCollection?.disabled) {
    ui.recheckCollection?.focus();
  }
}

function matchKey(match) {
  return collectionEntryKey({ productId: match?.product?.id, athleteId: match?.player?.athleteId });
}

function storedKey(entry) {
  return collectionEntryKey(entry);
}

function updateCandidateContinuation() {
  if (!ui.checkMore) return;
  const remaining = Math.max(0, state.candidates.length - state.checkedCount);
  ui.checkMore.hidden = !remaining;
  ui.checkMore.textContent = remaining
    ? 'Show more cards'
    : 'No more cards to show';
  ui.checkMore.setAttribute('aria-disabled', String(state.isSearching || !remaining));
}

function renderSearchResults() {
  if (!ui.searchResults) return;
  ui.searchResults.replaceChildren();
  if (!state.searchMatches.length) {
    const empty = document.createElement('p');
    empty.className = 'collection-empty';
    empty.textContent = state.checkedCount
      ? 'No player match found in the cards shown so far.'
      : 'Search for a player to find matching cards.';
    ui.searchResults.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.searchMatches.forEach((match) => {
    const key = matchKey(match);
    const existing = state.collectionEntries.find((entry) => storedKey(entry) === key);
    const card = document.createElement('article');
    card.className = 'collection-match-card';

    const copy = document.createElement('div');
    copy.className = 'collection-match-card__copy';
    const heading = document.createElement('h3');
    heading.textContent = match.player.name;
    const detail = document.createElement('p');
    detail.textContent = match.product.name;
    const context = document.createElement('p');
    context.className = 'collection-muted';
    context.textContent = `${formatSeasonLabel(match)} · Profile primary position: ${match.player.primaryPosition || 'not supplied'}`;
    copy.append(heading, detail, context);

    const actions = document.createElement('div');
    actions.className = 'collection-match-card__actions';
    if (existing) {
      const nextRelation = existing.relation === 'owned' ? 'saved' : 'owned';
      const label = nextRelation === 'owned' ? 'Mark owned by you' : 'Mark saved only';
      actions.append(makeActionButton(label, 'relation', nextRelation, match));
    } else {
      actions.append(
        makeActionButton('Save for later', 'add', 'saved', match),
        makeActionButton('I own this card', 'add', 'owned', match),
      );
    }
    card.append(copy, actions);
    fragment.append(card);
  });
  ui.searchResults.append(fragment);
}

function makeActionButton(label, action, relation, match) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = action === 'remove' ? 'button-secondary' : 'button';
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.relation = relation;
  button.dataset.productId = String(match.product.id);
  button.dataset.athleteId = match.player.athleteId;
  const relationLabel = relation === 'owned' ? 'owned by you' : 'saved only by you';
  button.setAttribute('aria-label', action === 'relation'
    ? `${label} (${relationLabel}): ${match.player.name}, ${match.product.name}`
    : `${label}: ${match.player.name}, ${match.product.name}`);
  return button;
}

function renderCollection() {
  if (!ui.collectionList) return;
  ui.collectionList.replaceChildren();
  if (!state.collectionEntries.length) {
    const empty = document.createElement('p');
    empty.className = 'collection-empty';
    empty.setAttribute('role', 'listitem');
    empty.textContent = 'No cards saved here yet. Add a player-matched card above to start a local collection.';
    ui.collectionList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.collectionEntries.forEach((entry) => {
    const key = storedKey(entry);
    const match = state.verifiedCollection.get(key);
    const reason = state.unresolvedCollection.get(key);
    const card = document.createElement('article');
    card.className = `collection-owned-card${match ? '' : ' is-unverified'}`;
    card.setAttribute('role', 'listitem');

    const copy = document.createElement('div');
    copy.className = 'collection-owned-card__copy';
    const heading = document.createElement('h3');
    heading.textContent = match?.player.name || `Catalog card ${entry.productId}`;
    const product = document.createElement('p');
    product.textContent = match?.product.name || 'Player match unavailable';
    const badge = document.createElement('span');
    badge.className = 'collection-state-badge';
    badge.textContent = entry.relation === 'owned' ? 'Marked owned by you' : 'Saved by you';
    const detail = document.createElement('p');
    detail.className = 'collection-muted';
    detail.textContent = match
      ? `Profile primary position: ${match.player.primaryPosition || 'not supplied'}`
      : reason || 'Player match unavailable; kept locally and excluded from fit preview.';
    copy.append(heading, product, badge, detail);

    const actions = document.createElement('div');
    actions.className = 'collection-owned-card__actions';
    if (match) {
      const relationButton = document.createElement('button');
      relationButton.type = 'button';
      relationButton.className = 'button-secondary';
      relationButton.dataset.action = 'relation';
      relationButton.dataset.productId = String(entry.productId);
      relationButton.dataset.athleteId = entry.athleteId;
      relationButton.dataset.relation = entry.relation === 'owned' ? 'saved' : 'owned';
      relationButton.textContent = entry.relation === 'owned' ? 'Mark saved only' : 'I own this card';
      relationButton.setAttribute('aria-label', `${relationButton.textContent}: ${match.player.name}, ${match.product.name}`);
      actions.append(relationButton);
    }
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'button-tertiary';
    removeButton.dataset.action = 'remove';
    removeButton.dataset.productId = String(entry.productId);
    removeButton.dataset.athleteId = entry.athleteId;
    removeButton.textContent = 'Remove from this list';
    removeButton.setAttribute('aria-label', `Remove ${match?.player.name || `catalog card ${entry.productId}`} from your local list`);
    actions.append(removeButton);

    card.append(copy, actions);
    fragment.append(card);
  });
  ui.collectionList.append(fragment);
}

function addMatchToCollection(match, relation) {
  const next = upsertCollectionEntry(state.collectionEntries, match, relation);
  const storageAvailable = writeCollectionState(next, safeStorage());
  if (!storageAvailable) {
    setStatus(ui.collectionStatus, 'This browser could not save the local list. No server copy was created.', { error: true });
    return;
  }
  state.collectionEntries = next;
  renderSearchResults();
  announceCollectionAction(`${match.player.name} was added to your browser-local list as ${relation === 'owned' ? 'marked owned by you' : 'saved only'}.`);
  focusAction(ui.searchResults, 'relation', match.product.id, match.player.athleteId);
  void refreshCollection();
}

function handleSearchResultAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !ui.searchResults.contains(button)) return;
  const key = collectionEntryKey({ productId: button.dataset.productId, athleteId: button.dataset.athleteId });
  const match = state.searchMatches.find((candidate) => matchKey(candidate) === key);
  if (!match) return;
  if (button.dataset.action === 'add') {
    addMatchToCollection(match, button.dataset.relation);
    return;
  }
  if (button.dataset.action === 'relation') changeCollectionRelation(match, button.dataset.relation, 'search');
}

function handleCollectionAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button || !ui.collectionList.contains(button)) return;
  const productId = Number(button.dataset.productId);
  const athleteId = text(button.dataset.athleteId);
  const key = collectionEntryKey({ productId, athleteId });
  const match = state.verifiedCollection.get(key);
  const currentIndex = state.collectionEntries.findIndex((entry) => storedKey(entry) === key);
  if (button.dataset.action === 'remove') {
    const next = removeCollectionEntry(state.collectionEntries, productId, athleteId);
    if (!writeCollectionState(next, safeStorage())) {
      setStatus(ui.collectionStatus, 'This browser could not update the local list. The current saved state is unchanged.', { error: true });
      return;
    }
    state.collectionEntries = next;
    renderSearchResults();
    renderCollection();
    announceCollectionAction(`${match?.player.name || `Catalog card ${productId}`} was removed from your browser-local list.`);
    const fallback = next[Math.min(currentIndex, Math.max(0, next.length - 1))];
    const focusAfter = fallback && next.length
      ? { surface: 'collection', action: 'remove', productId: fallback.productId, athleteId: fallback.athleteId }
      : { surface: 'search-input' };
    void refreshCollection({ focusAfter });
    return;
  }
  if (button.dataset.action === 'relation') {
    changeCollectionRelation(match, button.dataset.relation, 'collection');
  }
}

function changeCollectionRelation(match, relation, focusSurface) {
  if (!match) return;
  const productId = match.product.id;
  const athleteId = match.player.athleteId;
  const next = setCollectionEntryRelation(state.collectionEntries, productId, athleteId, relation);
  if (next === state.collectionEntries) return;
  if (!writeCollectionState(next, safeStorage())) {
    setStatus(ui.collectionStatus, 'This browser could not update the local list. The current saved state is unchanged.', { error: true });
    return;
  }
  state.collectionEntries = next;
  renderSearchResults();
  renderCollection();
  announceCollectionAction(`${match.player.name} is now ${relation === 'owned' ? 'marked owned by you' : 'saved only by you'}.`);
  const surface = focusSurface === 'search' ? 'search' : 'collection';
  const container = surface === 'search' ? ui.searchResults : ui.collectionList;
  focusAction(container, 'relation', productId, athleteId);
  void refreshCollection({ focusAfter: { surface, action: 'relation', productId, athleteId } });
}

function dedupeSearchMatches(matches) {
  const unique = new Map();
  matches.forEach((match) => {
    const key = matchKey(match);
    if (key && !unique.has(key)) unique.set(key, match);
  });
  return [...unique.values()].sort((left, right) => (
    left.player.name.localeCompare(right.player.name)
    || left.product.name.localeCompare(right.product.name)
    || left.product.id - right.product.id
  ));
}

async function loadCatalogProducts() {
  const adapter = remoteCatalog();
  if (!adapter || typeof adapter.listProducts !== 'function' || typeof adapter.getNbaProductSlabStats !== 'function') {
    throw new Error('Card choices are unavailable right now.');
  }
  if (typeof adapter.isConfigured === 'function' && !adapter.isConfigured()) {
    throw new Error('Card choices are unavailable right now.');
  }
  const products = await adapter.listProducts({ source: 'products-basketball.json' });
  if (!Array.isArray(products) || !products.length) {
    throw new Error('No card choices are available right now.');
  }
  return products.filter(isNbaCatalogProduct);
}

async function checkCandidateBatch(token) {
  const batch = getCandidateBatch(state.candidates, state.checkedCount, SEARCH_BATCH_SIZE);
  if (!batch.length || state.isSearching || token !== state.searchToken) return;
  setSearchBusy(true);
  const start = state.checkedCount + 1;
  const end = state.checkedCount + batch.length;
  setStatus(ui.searchStatus, 'Finding player matches…', { busy: true });

  let cursor = 0;
  const matches = [];
  let failures = 0;
  async function worker() {
    while (cursor < batch.length) {
      const product = batch[cursor++];
      try {
        const payload = await remoteCatalog().getNbaProductSlabStats(product.id);
        const verified = extractVerifiedCollectionMatches(payload, product)
          .filter((match) => matchesSearch(match.player.name, state.query));
        matches.push(...verified);
      } catch (error) {
        failures += 1;
        console.warn(`Verified collection mapping lookup failed for product ${product.id}.`, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, batch.length) }, worker));
  if (token !== state.searchToken) return;
  state.searchMatches = dedupeSearchMatches([...state.searchMatches, ...matches]);
  state.checkedCount += batch.length;
  state.failures += failures;
  renderSearchResults();
  updateCandidateContinuation();
  const remaining = state.candidates.length - state.checkedCount;
  const more = remaining ? ' More cards may match; refine the player name or show more cards.' : '';
  const temporary = state.failures && !state.searchMatches.length ? ' Player matches are temporarily unavailable. Try again.' : '';
  setStatus(ui.searchStatus, state.searchMatches.length
    ? `${state.searchMatches.length} player match${state.searchMatches.length === 1 ? '' : 'es'} found.${more}`
    : `No player match found.${more}${temporary}`, { error: !state.searchMatches.length && !remaining && state.failures === state.checkedCount });
  setSearchBusy(false);
}

async function runSearch(query) {
  const normalizedQuery = normalizeSearchText(query);
  state.searchToken += 1;
  const token = state.searchToken;
  state.query = normalizedQuery;
  state.candidates = [];
  state.checkedCount = 0;
  state.searchMatches = [];
  state.failures = 0;
  renderSearchResults();
  updateCandidateContinuation();

  if (normalizedQuery.length < 2) {
    setStatus(ui.searchStatus, 'Enter at least two characters to search.', { error: true });
    return;
  }

  if (document.activeElement !== ui.searchInput) ui.searchInput?.focus();
  setSearchBusy(true);
  setStatus(ui.searchStatus, 'Loading card choices…', { busy: true });
  try {
    const products = await loadCatalogProducts();
    if (token !== state.searchToken) return;
    state.candidates = buildCandidateProducts(products, normalizedQuery);
    if (!state.candidates.length) {
      setStatus(ui.searchStatus, 'No cards match that search.');
      renderSearchResults();
      return;
    }
    setStatus(ui.searchStatus, 'Searching for player matches…', { busy: true });
    setSearchBusy(false);
    await checkCandidateBatch(token);
  } catch (error) {
    if (token !== state.searchToken) return;
    console.error('Collection builder verified search failed.', error);
    setStatus(ui.searchStatus, 'Card choices are unavailable right now. Try again.', { error: true });
    renderSearchResults();
  } finally {
    if (token === state.searchToken) setSearchBusy(false);
  }
}

async function refreshCollection({ focusAfter = null } = {}) {
  state.refreshToken += 1;
  const token = state.refreshToken;
  const rawSearchFocus = focusedAction(ui.searchResults);
  const rawCollectionFocus = focusedAction(ui.collectionList);
  const focusSnapshot = focusAfter
    || (rawSearchFocus ? { ...rawSearchFocus, surface: 'search' }
      : rawCollectionFocus ? { ...rawCollectionFocus, surface: 'collection' }
        : document.activeElement === ui.recheckCollection ? { surface: 'recheck' } : null);
  const adapter = remoteCatalog();
  state.isRefreshingCollection = true;
  state.collectionEntries = readCollectionState(safeStorage());
  state.verifiedCollection.clear();
  state.unresolvedCollection.clear();
  renderSearchResults();
  renderCollection();
  if (ui.fitButton) ui.fitButton.disabled = true;
  ui.fitResult?.replaceChildren();
  setStatus(ui.fitStatus, 'Updating saved cards before the fit preview is available.');
  ui.recheckCollection?.setAttribute('aria-disabled', String(!state.collectionEntries.length));
  if (ui.recheckCollection) ui.recheckCollection.disabled = !state.collectionEntries.length;
  ui.recheckCollection?.removeAttribute('aria-busy');
  restoreCollectionRefreshFocus(focusSnapshot);

  if (!state.collectionEntries.length) {
    state.isRefreshingCollection = false;
    setStatus(ui.collectionStatus, 'This list is stored only in this browser. It is not proof of ownership.');
    setStatus(ui.fitStatus, 'Add a player-matched card before running this scenario preview.');
    ui.recheckCollection?.setAttribute('aria-disabled', 'true');
    ui.recheckCollection?.removeAttribute('aria-busy');
    restoreCollectionRefreshFocus(focusSnapshot);
    return;
  }
  if (!adapter || typeof adapter.listProducts !== 'function' || typeof adapter.getNbaProductSlabStats !== 'function') {
    state.isRefreshingCollection = false;
    state.collectionEntries.forEach((entry) => state.unresolvedCollection.set(storedKey(entry), 'Player match unavailable; kept locally and excluded from fit preview.'));
    renderCollection();
    setStatus(ui.collectionStatus, 'Player matches are unavailable right now. Saved items remain in this browser and are excluded from the fit preview.', { error: true });
    ui.recheckCollection?.setAttribute('aria-disabled', 'false');
    ui.recheckCollection?.removeAttribute('aria-busy');
    restoreCollectionRefreshFocus(focusSnapshot);
    return;
  }

  state.isRefreshingCollection = true;
  ui.recheckCollection?.setAttribute('aria-disabled', 'true');
  ui.recheckCollection?.setAttribute('aria-busy', 'true');
  setStatus(ui.collectionStatus, 'Updating player matches for saved cards…', { busy: true });
  const checkedEntries = state.collectionEntries.slice(0, MAX_REVERIFIED_PRODUCTS);
  if (state.collectionEntries.length > checkedEntries.length) {
    state.collectionEntries.slice(checkedEntries.length).forEach((entry) => {
      state.unresolvedCollection.set(storedKey(entry), 'Player match unavailable; kept locally and excluded from fit preview. Remove a few saved cards and try again.');
    });
  }

  try {
    const productIds = [...new Set(checkedEntries.map((entry) => entry.productId))];
    const products = await adapter.listProducts({ source: 'products-basketball.json', ids: productIds });
    if (token !== state.refreshToken) return;
    const productsById = new Map((Array.isArray(products) ? products : [])
      .filter(isNbaCatalogProduct)
      .map((product) => [Number(product.id), product]));
    const productMatches = new Map();
    let cursor = 0;
    async function worker() {
      while (cursor < productIds.length) {
        const productId = productIds[cursor++];
        const product = productsById.get(productId);
        if (!product) {
          productMatches.set(productId, []);
          continue;
        }
        try {
          const payload = await adapter.getNbaProductSlabStats(productId);
          productMatches.set(productId, extractVerifiedCollectionMatches(payload, product));
        } catch {
          productMatches.set(productId, []);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LOOKUP_CONCURRENCY, productIds.length) }, worker));
    if (token !== state.refreshToken) return;

    checkedEntries.forEach((entry) => {
      const key = storedKey(entry);
      const match = (productMatches.get(entry.productId) || [])
        .find((candidate) => candidate.player.athleteId === entry.athleteId);
      if (match) {
        state.verifiedCollection.set(key, { ...match, relation: entry.relation });
      } else {
        state.unresolvedCollection.set(key, 'Player match unavailable; kept locally and excluded from fit preview.');
      }
    });
    renderCollection();
    if (ui.fitButton) ui.fitButton.disabled = state.verifiedCollection.size === 0;
    const matchedCount = state.verifiedCollection.size;
    const unresolvedCount = state.collectionEntries.length - matchedCount;
    setStatus(ui.collectionStatus, `${matchedCount} of ${state.collectionEntries.length} saved item${state.collectionEntries.length === 1 ? '' : 's'} have player matches. ${unresolvedCount ? `${unresolvedCount} remain local and are excluded from fit results.` : 'Saved and owned labels are user-managed, not proof of ownership.'}`, { error: matchedCount === 0 });
    restoreCollectionRefreshFocus(focusSnapshot);
  } catch (error) {
    if (token !== state.refreshToken) return;
    state.collectionEntries.forEach((entry) => state.unresolvedCollection.set(storedKey(entry), 'Player match unavailable; kept locally and excluded from fit preview.'));
    renderCollection();
    setStatus(ui.collectionStatus, 'The saved list is intact, but player matches are unavailable right now. Try again.', { error: true });
    if (ui.fitButton) ui.fitButton.disabled = true;
    restoreCollectionRefreshFocus(focusSnapshot);
  } finally {
    if (token === state.refreshToken) {
      state.isRefreshingCollection = false;
      ui.recheckCollection?.setAttribute('aria-disabled', String(!state.collectionEntries.length));
      if (ui.recheckCollection) ui.recheckCollection.disabled = !state.collectionEntries.length;
      ui.recheckCollection?.removeAttribute('aria-busy');
    }
  }
}

function renderFitResult(result) {
  if (!ui.fitResult) return;
  ui.fitResult.replaceChildren();
  const summary = document.createElement('p');
  summary.className = result.status === 'profile-position-fit' ? 'collection-fit-result__status is-fit' : 'collection-fit-result__status';
  if (result.status === 'profile-position-fit') {
    summary.textContent = 'A profile-position role shape was found: 2 guards, 2 forwards, and 1 center.';
  } else {
    summary.textContent = 'No complete profile-position role shape was found among matched cards.';
  }
  const caveat = document.createElement('p');
  caveat.className = 'collection-muted';
  caveat.textContent = result.limitation;
  ui.fitResult.append(summary, caveat);

  const counts = document.createElement('p');
  counts.textContent = `Distinct matched player profiles with supported primary positions: ${result.distinctVerifiedPlayers}. Available profile groups — G: ${result.profileCounts.G}, F: ${result.profileCounts.F}, C: ${result.profileCounts.C}.`;
  ui.fitResult.append(counts);

  if (result.lineup.length) {
    const list = document.createElement('ol');
    list.className = 'collection-fit-lineup';
    result.lineup.forEach((player) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = `${player.roleGroup}: ${player.playerName}`;
      const detail = document.createElement('span');
      detail.textContent = `${player.primaryPosition} profile · ${player.productName} · ${player.relation === 'owned' ? 'marked owned by you' : 'saved by you'}`;
      item.append(name, detail);
      list.append(item);
    });
    ui.fitResult.append(list);
  }
}

function runFitPreview() {
  const entries = [...state.verifiedCollection.values()];
  if (!entries.length) {
    setStatus(ui.fitStatus, 'Add a player-matched card before running the fit preview.', { error: true });
    ui.fitResult.replaceChildren();
    return;
  }
  const result = findProfilePositionFit(entries);
  renderFitResult(result);
  const outcome = result.status === 'profile-position-fit'
    ? 'A 2 guard, 2 forward, 1 center profile-position shape was found.'
    : 'No complete 2 guard, 2 forward, 1 center profile-position shape was found.';
  setStatus(ui.fitStatus, `${outcome} Scenario preview only; it does not confirm season eligibility or player quality, and it does not change production rosters, collection ownership, inventory, prices, cart, or checkout.`);
}

function boot() {
  ui.searchForm = document.getElementById('collectionSearchForm');
  ui.searchInput = document.getElementById('collectionPlayerSearch');
  ui.searchStatus = document.getElementById('collectionSearchStatus');
  ui.searchResults = document.getElementById('collectionSearchResults');
  ui.checkMore = document.getElementById('collectionCheckMore');
  ui.collectionStatus = document.getElementById('collectionStatus');
  ui.collectionActionStatus = document.getElementById('collectionActionStatus');
  ui.collectionList = document.getElementById('collectionList');
  ui.recheckCollection = document.getElementById('recheckCollection');
  ui.fitButton = document.getElementById('runCollectionFit');
  ui.fitStatus = document.getElementById('collectionFitStatus');
  ui.fitResult = document.getElementById('collectionFitResult');
  if (!ui.searchForm || !ui.searchInput) return;

  ui.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void runSearch(ui.searchInput.value);
  });
  ui.searchResults?.addEventListener('click', handleSearchResultAction);
  ui.collectionList?.addEventListener('click', handleCollectionAction);
  ui.checkMore?.addEventListener('click', () => void checkCandidateBatch(state.searchToken));
  ui.recheckCollection?.addEventListener('click', () => {
    if (!state.isRefreshingCollection) void refreshCollection();
  });
  ui.fitButton?.addEventListener('click', runFitPreview);
  void refreshCollection();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

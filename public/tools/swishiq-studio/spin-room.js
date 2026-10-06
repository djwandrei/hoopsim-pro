// Standalone Spin Room UI for a package-bound, role-filtered pool.
//
// The host owns data resolution and injects the current seeded-pool helpers.
// Load spin-room.css alongside the module. No randomness or eligibility logic
// is duplicated here: every result comes from spinSeededPool.

const DEFAULT_ROLE_OPTION = Object.freeze({
  value: 'eligible',
  label: 'Eligible players',
  eligibility: Object.freeze({}),
});

const SPIN_LIMIT = 1000;
let instanceCount = 0;

function makeElement(documentRef, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function displayName(entry) {
  return String(entry?.player || entry?.playerName || entry?.displayName || entry?.name || entry?.id || 'Selected player');
}

function displayContext(entry) {
  const parts = [];
  const team = entry?.team || entry?.teamCode;
  const position = Array.isArray(entry?.positions) ? entry.positions.join(' / ') : entry?.position;
  const season = entry?.seasonStartYear ?? entry?.season;
  if (team) parts.push(String(team));
  if (position) parts.push(String(position));
  if (Number.isFinite(Number(season))) parts.push(`${Number(season)}–${Number(season) + 1}`);
  return parts.join(' · ');
}

function stableKey(entry, uniquePlayerKey) {
  if (!entry || typeof entry !== 'object') return '';
  const explicit = uniquePlayerKey && entry[uniquePlayerKey] != null ? entry[uniquePlayerKey] : null;
  const raw = explicit ?? entry.id ?? entry.key ?? entry.playerSeasonRef ?? entry.playerRef ?? entry.playerId;
  if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim().toLowerCase();
  const name = entry.player || entry.playerName || entry.displayName;
  const season = entry.seasonStartYear ?? entry.season;
  const team = entry.team || entry.teamCode;
  return name && season != null && team
    ? `${String(name).trim()}|${season}|${String(team).trim()}`.toLowerCase()
    : '';
}

function shortScope(pool) {
  const scope = pool?.receipt?.scope || pool?.packageRef || {};
  const years = scope.scope?.seasonStartYears || scope.seasonStartYears || [];
  const kind = scope.scope?.kind || scope.kind || 'published package';
  const label = years.length
    ? years.length === 1 ? `${years[0]}–${Number(years[0]) + 1}` : `${years[0]}–${years[years.length - 1]}`
    : kind;
  const packageIdentity = scope.packageId && scope.packageVersion
    ? `${scope.packageId}@${scope.packageVersion}`
    : scope.packageId;
  return [packageIdentity, label].filter(Boolean).join(' · ') || 'Verified package';
}

function normalizeRoleOptions(options, fallbackEligibility) {
  if (!Array.isArray(options) || !options.length) {
    return [{ ...DEFAULT_ROLE_OPTION, eligibility: fallbackEligibility || {} }];
  }
  return options.map((option, index) => ({
    value: String(option?.value ?? option?.id ?? index),
    label: String(option?.label || option?.name || `Role ${index + 1}`),
    eligibility: option?.eligibility || {},
  }));
}

/**
 * Mount a keyboard-native, seeded Spin Room inside a dedicated root element.
 *
 * @param {object} options
 * @param {Element} options.root Dedicated mount point; its children are replaced.
 * @param {Array<object>} options.entries Candidate profiles from the host's verified package.
 * @param {object} options.packageRef Exact or explicitly accepted package reference.
 * @param {string} options.seed Initial deterministic seed.
 * @param {Array<{value:string,label:string,eligibility:object}>} [options.eligibilityOptions]
 * @param {Function} options.buildSeededPool Current engine build function.
 * @param {Function} options.spinSeededPool Current engine spin function.
 * @param {string|null} [options.uniquePlayerKey] Stable replay key field, when needed.
 * @param {string|null} [options.weightField] Optional non-negative selection weight field.
 * @param {Function} [options.onSelection] Called with each engine selection, the starting pool, the draw pool, and receipt.
 * @returns {{element:Element, rebuild:Function, spinNext:Function, destroy:Function}}
 */
export function createSpinRoom({
  root,
  documentRef = root?.ownerDocument || globalThis.document,
  entries,
  packageRef,
  seed,
  eligibility = {},
  eligibilityOptions,
  buildSeededPool,
  spinSeededPool,
  uniquePlayerKey = 'playerRef',
  weightField = null,
  onSelection = () => {},
} = {}) {
  if (!root || !documentRef) throw new TypeError('Spin Room requires a root element and document.');
  if (!Array.isArray(entries)) throw new TypeError('Spin Room requires verified candidate entries.');
  if (typeof buildSeededPool !== 'function' || typeof spinSeededPool !== 'function') {
    throw new TypeError('Spin Room requires the seeded-pool build and spin helpers.');
  }
  if (typeof onSelection !== 'function') throw new TypeError('Spin Room onSelection must be a function.');

  const roleOptions = normalizeRoleOptions(eligibilityOptions, eligibility);
  instanceCount += 1;
  const titleId = `swishiqSpinRoomTitle${instanceCount}`;
  const resultTitleId = `swishiqSpinRoomResultTitle${instanceCount}`;
  const timerHost = documentRef.defaultView || globalThis;
  const state = {
    pool: null,
    seed: String(seed ?? ''),
    roleValue: roleOptions[0].value,
    history: [],
    dirty: false,
    timer: null,
  };

  const element = makeElement(documentRef, 'section', 'swishiq-spin-room');
  element.setAttribute('aria-labelledby', titleId);
  const heading = makeElement(documentRef, 'header', 'swishiq-spin-room__heading');
  const titleGroup = makeElement(documentRef, 'div');
  const kicker = makeElement(documentRef, 'span', 'swishiq-spin-room__kicker', 'Role draft');
  const title = makeElement(documentRef, 'h2', '', 'Spin Room');
  title.id = titleId;
  const intro = makeElement(documentRef, 'p', 'swishiq-spin-room__intro', 'Build a verified role pool, then draw one player at a time.');
  titleGroup.append(kicker, title, intro);
  const poolCount = makeElement(documentRef, 'p', 'swishiq-spin-room__pool-count');
  poolCount.setAttribute('aria-live', 'polite');
  poolCount.setAttribute('aria-atomic', 'true');
  heading.append(titleGroup, poolCount);

  const controls = makeElement(documentRef, 'form', 'swishiq-spin-room__controls');
  controls.noValidate = true;
  const seedLabel = makeElement(documentRef, 'label', 'swishiq-spin-room__field');
  const seedCaption = makeElement(documentRef, 'span', '', 'Replay seed');
  const seedInput = makeElement(documentRef, 'input');
  seedInput.type = 'text';
  seedInput.name = 'seed';
  seedInput.autocomplete = 'off';
  seedInput.maxLength = 80;
  seedInput.value = state.seed;
  seedLabel.append(seedCaption, seedInput);

  const roleLabel = makeElement(documentRef, 'label', 'swishiq-spin-room__field');
  const roleCaption = makeElement(documentRef, 'span', '', 'Eligible role');
  const roleSelect = makeElement(documentRef, 'select');
  roleSelect.name = 'eligibility';
  for (const option of roleOptions) {
    const item = makeElement(documentRef, 'option', '', option.label);
    item.value = option.value;
    roleSelect.append(item);
  }
  roleSelect.value = state.roleValue;
  roleLabel.append(roleCaption, roleSelect);

  const exclusionLabel = makeElement(documentRef, 'label', 'swishiq-spin-room__field swishiq-spin-room__exclusions');
  const exclusionCaption = makeElement(documentRef, 'span', '', 'Exclude players (optional)');
  const exclusionSelect = makeElement(documentRef, 'select', 'swishiq-spin-room__exclude-select');
  exclusionSelect.name = 'excludedPlayerRefs';
  exclusionSelect.multiple = true;
  exclusionSelect.size = Math.min(7, Math.max(3, entries.length));
  exclusionSelect.setAttribute('aria-describedby', `swishiqSpinRoomExclusionHelp${instanceCount}`);
  const sortedEntries = [...entries].sort((left, right) => stableKey(left, uniquePlayerKey).localeCompare(stableKey(right, uniquePlayerKey)));
  const seenExclusionKeys = new Set();
  for (const entry of sortedEntries) {
    const ref = stableKey(entry, uniquePlayerKey);
    if (!ref || seenExclusionKeys.has(ref)) continue;
    seenExclusionKeys.add(ref);
    const option = makeElement(documentRef, 'option', '', `${displayName(entry)} · ${ref}`);
    option.value = ref;
    exclusionSelect.append(option);
  }
  const exclusionHelp = makeElement(documentRef, 'span', 'swishiq-spin-room__field-help', 'Use Ctrl/Command or Shift to select multiple players. Exclusions are listed in the receipt; the current pool hash covers eligible entries only.');
  exclusionHelp.id = `swishiqSpinRoomExclusionHelp${instanceCount}`;
  exclusionLabel.append(exclusionCaption, exclusionSelect, exclusionHelp);

  const rebuildButton = makeElement(documentRef, 'button', 'swishiq-spin-room__rebuild', 'Build eligible pool');
  rebuildButton.type = 'submit';
  controls.append(seedLabel, roleLabel, exclusionLabel, rebuildButton);

  const body = makeElement(documentRef, 'div', 'swishiq-spin-room__body');
  const rotorColumn = makeElement(documentRef, 'div', 'swishiq-spin-room__rotor-column');
  const wheel = makeElement(documentRef, 'div', 'swishiq-spin-room__wheel');
  wheel.setAttribute('aria-hidden', 'true');
  const wheelLabel = makeElement(documentRef, 'span', '', 'ROLES');
  wheel.append(wheelLabel);
  const spinButton = makeElement(documentRef, 'button', 'swishiq-spin-room__spin', 'Spin first role');
  spinButton.type = 'button';
  const motionNote = makeElement(documentRef, 'p', 'swishiq-spin-room__hint', 'No repeats until the pool is rebuilt.');
  rotorColumn.append(wheel, spinButton, motionNote);

  const outcome = makeElement(documentRef, 'section', 'swishiq-spin-room__outcome');
  outcome.setAttribute('aria-labelledby', resultTitleId);
  const outcomeKicker = makeElement(documentRef, 'span', 'swishiq-spin-room__kicker', 'Latest selection');
  const outcomeTitle = makeElement(documentRef, 'h3', '', 'Ready when you are');
  outcomeTitle.id = resultTitleId;
  const outcomeContext = makeElement(documentRef, 'p', 'swishiq-spin-room__context', 'Your first pick will appear here.');
  const status = makeElement(documentRef, 'p', 'swishiq-spin-room__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  outcome.append(outcomeKicker, outcomeTitle, outcomeContext, status);

  const receipt = makeElement(documentRef, 'details', 'swishiq-spin-room__receipt');
  const receiptSummary = makeElement(documentRef, 'summary', '', 'Replay receipt');
  const receiptInner = makeElement(documentRef, 'div', 'swishiq-spin-room__receipt-content');
  const receiptFacts = makeElement(documentRef, 'dl', 'swishiq-spin-room__receipt-facts');
  const historyList = makeElement(documentRef, 'ol', 'swishiq-spin-room__history');
  const emptyReceipt = makeElement(documentRef, 'p', 'swishiq-spin-room__receipt-empty', 'Build a pool to create a seed and hash receipt.');
  receiptInner.append(emptyReceipt, receiptFacts, historyList);
  receipt.append(receiptSummary, receiptInner);

  body.append(rotorColumn, outcome);
  element.append(heading, controls, body, receipt);
  root.replaceChildren(element);

  function selectedRole() {
    return roleOptions.find(option => option.value === roleSelect.value) || roleOptions[0];
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function selectedExclusionRefs() {
    return [...exclusionSelect.children]
      .filter(option => option.selected === true)
      .map(option => String(option.value || '').trim().toLowerCase())
      .filter(Boolean)
      .sort();
  }

  function renderReceipt() {
    receiptFacts.replaceChildren();
    historyList.replaceChildren();
    const ready = state.pool?.status === 'ready';
    emptyReceipt.hidden = ready;
    if (!ready) {
      emptyReceipt.textContent = state.pool?.status === 'unavailable'
        ? `No replay receipt: ${state.pool.reason || 'The eligible pool is unavailable.'}`
        : 'Build a pool to create a seed and hash receipt.';
      return;
    }
    const facts = [
      ['Package', shortScope(state.pool)],
      ['Role', selectedRole().label],
      ['Seed', state.pool.seed],
      ['Eligible entries', state.pool.entries.length],
      ['User exclusions (sorted stable refs; pool hash covers post-filter eligible entries only)', selectedExclusionRefs().join(', ') || 'None'],
      ['Starting pool hash', state.pool.poolHash],
      ['Selection mode', 'No replacement'],
      ['Weight field', weightField || (state.pool.entries.some(entry => entry?.weight !== undefined
        && entry.weight !== null && entry.weight !== '') ? 'weight' : 'Uniform')],
    ];
    for (const [label, value] of facts) {
      const item = makeElement(documentRef, 'div', 'swishiq-spin-room__receipt-fact');
      const term = makeElement(documentRef, 'dt', '', label);
      const detail = makeElement(documentRef, 'dd', '', String(value));
      item.append(term, detail);
      receiptFacts.append(item);
    }
    state.history.forEach((item, index) => {
      const row = makeElement(documentRef, 'li', 'swishiq-spin-room__history-item');
      const selection = makeElement(documentRef, 'span', '', `Spin ${index + 1} · ${displayName(item.entry)}`);
      const hashes = makeElement(documentRef, 'span', 'swishiq-spin-room__history-hashes');
      const remainingHash = makeElement(documentRef, 'code', '', `draw pool ${item.spin.poolHash || 'Unavailable'}`);
      const selectionHash = makeElement(documentRef, 'code', '', `selection ${item.spin.selectionHash || 'Unavailable'}`);
      hashes.append(remainingHash, selectionHash);
      row.append(selection, hashes);
      historyList.append(row);
    });
  }

  function syncControls() {
    const ready = state.pool?.status === 'ready' && !state.dirty;
    const remaining = ready
      ? Math.max(0, state.pool.entries.length - state.history.length)
      : 0;
    const maxAllowed = Math.min(remaining, SPIN_LIMIT);
    spinButton.disabled = !ready || maxAllowed === 0;
    rebuildButton.textContent = state.dirty ? 'Apply pool settings' : 'Rebuild pool';
    spinButton.textContent = state.history.length
      ? `Spin next role · ${state.history.length + 1}`
      : 'Spin first role';
    if (ready) {
      poolCount.textContent = `${state.pool.entries.length} eligible ${state.pool.entries.length === 1 ? 'player' : 'players'} · ${selectedRole().label}`;
      if (remaining === 0) motionNote.textContent = 'Pool complete. Rebuild to replay from the first pick.';
      else if (remaining < state.pool.entries.length) motionNote.textContent = `${remaining} eligible ${remaining === 1 ? 'player' : 'players'} remain · no repeats.`;
      else motionNote.textContent = 'No repeats until the pool is rebuilt.';
    }
    renderReceipt();
  }

  function rebuild() {
    timerHost.clearTimeout?.(state.timer);
    state.seed = seedInput.value.trim();
    state.roleValue = roleSelect.value;
    state.history = [];
    state.dirty = false;
    const excludedRefs = new Set(selectedExclusionRefs());
    const poolEntries = entries.filter(entry => !excludedRefs.has(stableKey(entry, uniquePlayerKey)));
    wheel.removeAttribute('data-spinning');
    outcomeTitle.textContent = 'Ready when you are';
    outcomeContext.textContent = 'Your first pick will appear here.';
    try {
      state.pool = buildSeededPool({
        entries: poolEntries,
        packageRef,
        seed: state.seed,
        eligibility: selectedRole().eligibility,
        uniquePlayerKey,
      });
    } catch (error) {
      state.pool = { status: 'unavailable', reason: error?.message || 'The eligible pool could not be built.' };
    }
    if (state.pool?.status !== 'ready' || !Array.isArray(state.pool.entries) || !state.pool.entries.length) {
      const reason = state.pool?.reason || 'The selected role has no eligible players in this package.';
      state.pool = { status: 'unavailable', reason };
      poolCount.textContent = 'Eligible pool unavailable';
      setStatus(reason);
    } else {
      poolCount.textContent = `${state.pool.entries.length} eligible ${state.pool.entries.length === 1 ? 'player' : 'players'} · ${selectedRole().label}`;
      setStatus(`Pool ready for ${shortScope(state.pool)}. Seed and pool hash are in the replay receipt.`);
    }
    syncControls();
    return state.pool;
  }

  function spinNext() {
    if (state.dirty || state.pool?.status !== 'ready') return null;
    const alreadySelected = new Set(state.history.map(item => stableKey(item.entry, uniquePlayerKey)));
    const remainingEntries = state.pool.entries.filter(entry => !alreadySelected.has(stableKey(entry, uniquePlayerKey)));
    if (!remainingEntries.length || state.history.length >= SPIN_LIMIT) {
      syncControls();
      setStatus(remainingEntries.length ? 'The seeded pool reached its 1,000-spin limit.' : 'Every eligible player has been selected. Rebuild the pool to start again.');
      return null;
    }

    wheel.removeAttribute('data-spinning');
    void wheel.offsetWidth;
    wheel.setAttribute('data-spinning', 'true');
    timerHost.clearTimeout?.(state.timer);
    state.timer = timerHost.setTimeout?.(() => wheel.removeAttribute('data-spinning'), 700);

    let result;
    let spinPool = null;
    try {
      const remainingPool = buildSeededPool({
        entries: remainingEntries,
        packageRef: state.pool.packageRef,
        seed: state.pool.seed,
        eligibility: state.pool.eligibility,
        uniquePlayerKey,
      });
      if (remainingPool?.status !== 'ready') {
        const message = remainingPool?.reason || 'The remaining eligible pool could not be verified.';
        setStatus(message);
        return remainingPool;
      }
      spinPool = remainingPool;
      result = spinSeededPool(remainingPool, {
        count: 1,
        withoutReplacement: true,
        spinIndex: state.history.length,
        weightField,
      });
    } catch (error) {
      result = { status: 'unavailable', reason: error?.message || 'The next seeded draw failed.' };
    }
    const entry = result?.selected?.[0];
    if (result?.status !== 'ready' || !entry) {
      const message = result?.reason || 'The next seeded draw is unavailable.';
      setStatus(message);
      return result;
    }

    state.history.push({ entry, spin: result });
    outcomeTitle.textContent = displayName(entry);
    outcomeContext.textContent = displayContext(entry) || `Selected on spin ${state.history.length}.`;
    setStatus(`Spin ${state.history.length}: ${displayName(entry)} selected from ${selectedRole().label}.`);
    syncControls();
    onSelection({ entry, spin: result, pool: state.pool, spinPool, spinNumber: state.history.length, excludedPlayerRefs: selectedExclusionRefs() });
    return result;
  }

  function onControlChange() {
    state.dirty = true;
    spinButton.disabled = true;
    rebuildButton.textContent = 'Apply pool settings';
    poolCount.textContent = 'Pool settings changed · rebuild the eligible pool';
    setStatus('Apply the changed seed, role, or exclusions before the next spin.');
  }

  const submitHandler = event => {
    event.preventDefault();
    rebuild();
  };
  controls.addEventListener('submit', submitHandler);
  seedInput.addEventListener('input', onControlChange);
  roleSelect.addEventListener('change', onControlChange);
  exclusionSelect.addEventListener('change', onControlChange);
  spinButton.addEventListener('click', spinNext);

  rebuild();

  return {
    element,
    rebuild,
    spinNext,
    destroy() {
      timerHost.clearTimeout?.(state.timer);
      controls.removeEventListener('submit', submitHandler);
      seedInput.removeEventListener('input', onControlChange);
      roleSelect.removeEventListener('change', onControlChange);
      exclusionSelect.removeEventListener('change', onControlChange);
      spinButton.removeEventListener('click', spinNext);
      root.replaceChildren();
    },
  };
}

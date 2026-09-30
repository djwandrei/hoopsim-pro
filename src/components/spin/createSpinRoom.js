// DJHC spin-room.js DOM component, with presentation copy made source-neutral.
// All eligibility, ordering and randomness remain in the injected original engines.
const DEFAULT_ROLE_OPTION = Object.freeze({ value:'eligible', label:'Eligible players', eligibility:Object.freeze({}) });
const SPIN_LIMIT = 1000;
let instanceCount = 0;
function makeElement(documentRef,tagName,className,text) { const element = documentRef.createElement(tagName); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function displayName(entry) { return String(entry?.player || entry?.playerName || entry?.displayName || entry?.name || entry?.id || 'Selected player'); }
function displayContext(entry) { const parts = [], team = entry?.team || entry?.teamCode, position = Array.isArray(entry?.positions) ? entry.positions.join(' / ') : entry?.position, season = entry?.seasonStartYear ?? entry?.season; if (team) parts.push(String(team)); if (position) parts.push(String(position)); if (Number.isFinite(Number(season))) parts.push(`${Number(season)}–${Number(season)+1}`); return parts.join(' · '); }
function stableKey(entry,uniquePlayerKey) { if (!entry || typeof entry !== 'object') return ''; const explicit = uniquePlayerKey && entry[uniquePlayerKey] != null ? entry[uniquePlayerKey] : null, raw = explicit ?? entry.id ?? entry.key ?? entry.playerSeasonRef ?? entry.playerRef ?? entry.playerId; if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim().toLowerCase(); const name = entry.player || entry.playerName || entry.displayName, season = entry.seasonStartYear ?? entry.season, team = entry.team || entry.teamCode; return name && season != null && team ? `${String(name).trim()}|${season}|${String(team).trim()}`.toLowerCase() : ''; }
function shortScope(pool) { const scope = pool?.receipt?.scope || pool?.packageRef || {}, years = scope.scope?.seasonStartYears || scope.seasonStartYears || [], kind = scope.scope?.kind || scope.kind || 'published package', label = years.length ? years.length === 1 ? `${years[0]}–${Number(years[0])+1}` : `${years[0]}–${years[years.length-1]}` : kind; return [scope.packageId,label].filter(Boolean).join(' · ') || 'Selected package'; }
function normalizeRoleOptions(options,fallbackEligibility) { if (!Array.isArray(options) || !options.length) return [{ ...DEFAULT_ROLE_OPTION,eligibility:fallbackEligibility || {} }]; return options.map((option,index) => ({ value:String(option?.value ?? option?.id ?? index), label:String(option?.label || option?.name || `Role ${index+1}`), eligibility:option?.eligibility || {} })); }
export function createSpinRoom({ root, documentRef = root?.ownerDocument || globalThis.document, entries, packageRef, seed, eligibility = {}, eligibilityOptions, buildSeededPool, spinSeededPool, uniquePlayerKey = null, weightField = null, onSelection = () => {} } = {}) {
  if (!root || !documentRef) throw new TypeError('Spin Room requires a root element and document.');
  if (!Array.isArray(entries)) throw new TypeError('Spin Room requires candidate entries.');
  if (typeof buildSeededPool !== 'function' || typeof spinSeededPool !== 'function') throw new TypeError('Spin Room requires the seeded-pool build and spin helpers.');
  if (typeof onSelection !== 'function') throw new TypeError('Spin Room onSelection must be a function.');
  const roleOptions = normalizeRoleOptions(eligibilityOptions,eligibility);
  instanceCount += 1;
  const titleId = `swishiqSpinRoomTitle${instanceCount}`, resultTitleId = `swishiqSpinRoomResultTitle${instanceCount}`, timerHost = documentRef.defaultView || globalThis;
  const state = { pool:null,seed:String(seed ?? ''),roleValue:roleOptions[0].value,history:[],dirty:false,timer:null };
  const make = (tag,cls,text) => makeElement(documentRef,tag,cls,text);
  const element = make('section','swishiq-spin-room'); element.setAttribute('aria-labelledby',titleId);
  const heading = make('header','swishiq-spin-room__heading'), titleGroup = make('div'), kicker = make('span','swishiq-spin-room__kicker','Role draft'), title = make('h2','','BUILD. SPIN. DISCOVER.'); title.id = titleId;
  const intro = make('p','swishiq-spin-room__intro','Build a source-bound role pool, then draw one player at a time.'); titleGroup.append(kicker,title,intro);
  const poolCount = make('p','swishiq-spin-room__pool-count'); poolCount.setAttribute('aria-live','polite'); poolCount.setAttribute('aria-atomic','true'); heading.append(titleGroup,poolCount);
  const controls = make('form','swishiq-spin-room__controls'); controls.noValidate = true;
  const seedLabel = make('label','swishiq-spin-room__field'), seedCaption = make('span','','Replay seed'), seedInput = make('input'); seedInput.type = 'text'; seedInput.name = 'seed'; seedInput.autocomplete = 'off'; seedInput.maxLength = 80; seedInput.value = state.seed; seedLabel.append(seedCaption,seedInput);
  const roleLabel = make('label','swishiq-spin-room__field'), roleCaption = make('span','','Eligible role'), roleSelect = make('select'); roleSelect.name = 'eligibility'; for (const option of roleOptions) { const item = make('option','',option.label); item.value = option.value; roleSelect.append(item); } roleSelect.value = state.roleValue; roleLabel.append(roleCaption,roleSelect);
  const rebuildButton = make('button','swishiq-spin-room__rebuild','Build eligible pool'); rebuildButton.type = 'submit'; controls.append(seedLabel,roleLabel,rebuildButton);
  const body = make('div','swishiq-spin-room__body'), rotorColumn = make('div','swishiq-spin-room__rotor-column'), wheel = make('div','swishiq-spin-room__wheel'); wheel.setAttribute('aria-hidden','true'); wheel.append(make('span','','ROLES'));
  const spinButton = make('button','swishiq-spin-room__spin','Spin first role'); spinButton.type = 'button'; const motionNote = make('p','swishiq-spin-room__hint','No repeats until the pool is rebuilt.'); rotorColumn.append(wheel,spinButton,motionNote);
  const outcome = make('section','swishiq-spin-room__outcome'); outcome.setAttribute('aria-labelledby',resultTitleId);
  const outcomeKicker = make('span','swishiq-spin-room__kicker','Latest selection'), outcomeTitle = make('h3','','Ready when you are'); outcomeTitle.id = resultTitleId;
  const outcomeContext = make('p','swishiq-spin-room__context','Your first pick will appear here.'), status = make('p','swishiq-spin-room__status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.setAttribute('aria-atomic','true'); outcome.append(outcomeKicker,outcomeTitle,outcomeContext,status);
  const receipt = make('details','swishiq-spin-room__receipt'), receiptSummary = make('summary','','Replay receipt'), receiptInner = make('div','swishiq-spin-room__receipt-content'), receiptFacts = make('dl','swishiq-spin-room__receipt-facts'), historyList = make('ol','swishiq-spin-room__history'), emptyReceipt = make('p','swishiq-spin-room__receipt-empty','Build a pool to create a seed and hash receipt.'); receiptInner.append(emptyReceipt,receiptFacts,historyList); receipt.append(receiptSummary,receiptInner);
  body.append(rotorColumn,outcome); element.append(heading,controls,body,receipt); root.replaceChildren(element);
  function selectedRole() { return roleOptions.find(option => option.value === roleSelect.value) || roleOptions[0]; }
  function setStatus(message) { status.textContent = message; }
  function renderReceipt() {
    receiptFacts.replaceChildren(); historyList.replaceChildren(); const ready = state.pool?.status === 'ready'; emptyReceipt.hidden = ready; if (!ready) return;
    const facts = [['Package',shortScope(state.pool)],['Role',selectedRole().label],['Seed',state.pool.seed],['Eligible entries',state.pool.entries.length],['Starting pool hash',state.pool.poolHash],['Selection mode','No replacement'],['Weight field',weightField || (state.pool.entries.some(entry => entry?.weight !== undefined && entry.weight !== null && entry.weight !== '') ? 'weight' : 'Uniform')]];
    for (const [label,value] of facts) { const item = make('div','swishiq-spin-room__receipt-fact'); item.append(make('dt','',label),make('dd','',String(value))); receiptFacts.append(item); }
    state.history.forEach((item,index) => { const row = make('li','swishiq-spin-room__history-item'), selection = make('span','',`Spin ${index+1} · ${displayName(item.entry)}`), hashes = make('span','swishiq-spin-room__history-hashes'); hashes.append(make('code','',`draw pool ${item.spin.poolHash || 'Unavailable'}`),make('code','',`selection ${item.spin.selectionHash || 'Unavailable'}`)); row.append(selection,hashes); historyList.append(row); });
  }
  function syncControls() {
    const ready = state.pool?.status === 'ready' && !state.dirty, remaining = ready ? Math.max(0,state.pool.entries.length-state.history.length) : 0, maxAllowed = Math.min(remaining,SPIN_LIMIT);
    element.dataset.state = ready ? remaining ? 'ready' : 'complete' : state.dirty ? 'dirty' : 'unavailable';
    spinButton.disabled = !ready || maxAllowed === 0; rebuildButton.textContent = state.dirty ? 'Apply seed and role' : 'Rebuild pool'; spinButton.textContent = state.history.length ? `Spin next role · ${state.history.length+1}` : 'Spin first role';
    if (ready) { poolCount.textContent = `${state.pool.entries.length} eligible ${state.pool.entries.length === 1 ? 'player' : 'players'} · ${selectedRole().label}`; if (remaining === 0) motionNote.textContent = 'Pool complete. Rebuild to replay from the first pick.'; else if (remaining < state.pool.entries.length) motionNote.textContent = `${remaining} eligible ${remaining === 1 ? 'player' : 'players'} remain · no repeats.`; else motionNote.textContent = 'No repeats until the pool is rebuilt.'; }
    renderReceipt();
  }
  function rebuild() {
    timerHost.clearTimeout?.(state.timer); state.seed = seedInput.value.trim(); state.roleValue = roleSelect.value; state.history = []; state.dirty = false; wheel.removeAttribute('data-spinning'); outcomeTitle.textContent = 'Ready when you are'; outcomeContext.textContent = 'Your first pick will appear here.';
    try { state.pool = buildSeededPool({ entries,packageRef,seed:state.seed,eligibility:selectedRole().eligibility,uniquePlayerKey }); } catch (error) { state.pool = { status:'unavailable',reason:error?.message || 'The eligible pool could not be built.' }; }
    if (state.pool?.status !== 'ready' || !Array.isArray(state.pool.entries) || !state.pool.entries.length) { const reason = state.pool?.reason || 'The selected role has no eligible players in this package.'; state.pool = { status:'unavailable',reason }; poolCount.textContent = 'Eligible pool unavailable'; setStatus(reason); } else { poolCount.textContent = `${state.pool.entries.length} eligible ${state.pool.entries.length === 1 ? 'player' : 'players'} · ${selectedRole().label}`; setStatus(`Pool ready for ${shortScope(state.pool)}. Seed and pool hash are in the replay receipt.`); }
    syncControls(); return state.pool;
  }
  function spinNext() {
    if (state.dirty || state.pool?.status !== 'ready') return null;
    const alreadySelected = new Set(state.history.map(item => stableKey(item.entry,uniquePlayerKey))), remainingEntries = state.pool.entries.filter(entry => !alreadySelected.has(stableKey(entry,uniquePlayerKey)));
    if (!remainingEntries.length || state.history.length >= SPIN_LIMIT) { syncControls(); setStatus(remainingEntries.length ? 'The seeded pool reached its 1,000-spin limit.' : 'Every eligible player has been selected. Rebuild the pool to start again.'); return null; }
    wheel.removeAttribute('data-spinning'); void wheel.offsetWidth; wheel.setAttribute('data-spinning','true'); timerHost.clearTimeout?.(state.timer); state.timer = timerHost.setTimeout?.(() => wheel.removeAttribute('data-spinning'),700);
    let result, spinPool = null;
    try { const remainingPool = buildSeededPool({ entries:remainingEntries,packageRef:state.pool.packageRef,seed:state.pool.seed,eligibility:state.pool.eligibility,uniquePlayerKey }); if (remainingPool?.status !== 'ready') { setStatus(remainingPool?.reason || 'The remaining eligible pool could not be verified.'); return remainingPool; } spinPool = remainingPool; result = spinSeededPool(remainingPool,{ count:1,withoutReplacement:true,spinIndex:state.history.length,weightField }); } catch (error) { result = { status:'unavailable',reason:error?.message || 'The next seeded draw failed.' }; }
    const entry = result?.selected?.[0]; if (result?.status !== 'ready' || !entry) { setStatus(result?.reason || 'The next seeded draw is unavailable.'); return result; }
    state.history.push({ entry,spin:result }); outcomeTitle.textContent = displayName(entry); outcomeContext.textContent = displayContext(entry) || `Selected on spin ${state.history.length}.`; setStatus(`Spin ${state.history.length}: ${displayName(entry)} selected from ${selectedRole().label}.`); syncControls(); onSelection({ entry,spin:result,pool:state.pool,spinPool,spinNumber:state.history.length }); return result;
  }
  function onControlChange() { state.dirty = true; element.dataset.state = 'dirty'; spinButton.disabled = true; rebuildButton.textContent = 'Apply seed and role'; poolCount.textContent = 'Seed or role changed · rebuild the eligible pool'; setStatus('Apply the new seed and role before the next spin.'); }
  const submitHandler = event => { event.preventDefault(); rebuild(); };
  controls.addEventListener('submit',submitHandler); seedInput.addEventListener('input',onControlChange); roleSelect.addEventListener('change',onControlChange); spinButton.addEventListener('click',spinNext); rebuild();
  return { element,rebuild,spinNext,destroy() { timerHost.clearTimeout?.(state.timer); controls.removeEventListener('submit',submitHandler); seedInput.removeEventListener('input',onControlChange); roleSelect.removeEventListener('change',onControlChange); spinButton.removeEventListener('click',spinNext); root.replaceChildren(); } };
}
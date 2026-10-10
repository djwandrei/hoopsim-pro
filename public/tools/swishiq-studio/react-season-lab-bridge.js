import { mountSeasonLab } from './react-app/studio-react-labs-candidate100-20261008.js?v=20261008n&rev=candidate100-owner-manual-release-v1';

const STYLESHEET_ID = 'swishiq-studio-react-labs-stylesheet';
const STYLESHEET_URL = new URL('./react-app/studio-react-labs-candidate100-20261008.css?v=20261008n', import.meta.url).href;
const ACTIVE_WORKBENCH_SELECTOR = '.swishiq-tabs button[data-workbench][aria-pressed="true"]';
const SEASON_SELECT_SELECTOR = '.season-lab-view .sl-source-panel .sl-setup-grid > label.sl-control select';

function ensureStylesheet(documentRef) {
  const head = documentRef?.head || documentRef?.querySelector?.('head');
  if (!head) return;
  let link = documentRef.getElementById(STYLESHEET_ID);
  if (!link) {
    link = documentRef.createElement('link');
    link.id = STYLESHEET_ID;
    link.rel = 'stylesheet';
    head.append(link);
  }
  if (link.href !== STYLESHEET_URL) link.href = STYLESHEET_URL;
}

function dispatchChange(target, documentRef) {
  const EventConstructor = documentRef?.defaultView?.Event || globalThis.Event;
  if (typeof EventConstructor === 'function') target.dispatchEvent(new EventConstructor('change', { bubbles: true }));
}

function setSelectValue(select, value, documentRef) {
  if (!select || select.value === value) return false;
  const selectPrototype = documentRef?.defaultView?.HTMLSelectElement?.prototype;
  const valueSetter = selectPrototype && Object.getOwnPropertyDescriptor(selectPrototype, 'value')?.set;
  if (valueSetter) valueSetter.call(select, value);
  else select.value = value;
  dispatchChange(select, documentRef);
  return true;
}

function parseStudioSelection(value) {
  const parts = String(value || '').split('|');
  if (parts.length !== 3 || parts.some(part => !part)) return null;
  return { packageId: parts[0], packageVersion: parts[1], phase: parts[2] };
}

function studioValueToReactChoice(value) {
  const selection = parseStudioSelection(value);
  return selection ? `exact-season:${selection.packageId}@${selection.packageVersion}` : '';
}

function reactChoiceToStudioValue(value, hostSelect) {
  const prefix = 'exact-season:';
  const choice = String(value || '');
  if (!choice.startsWith(prefix)) return '';
  const reference = choice.slice(prefix.length);
  const separator = reference.lastIndexOf('@');
  if (separator <= 0 || separator === reference.length - 1) return '';
  const packageId = reference.slice(0, separator);
  const packageVersion = reference.slice(separator + 1);
  const candidates = [...(hostSelect?.options || [])].filter(option => {
    const selection = parseStudioSelection(option.value);
    return selection?.packageId === packageId && selection.packageVersion === packageVersion;
  });
  if (!candidates.length) return '';

  const current = parseStudioSelection(hostSelect?.value);
  if (current?.packageId === packageId && current.packageVersion === packageVersion) return hostSelect.value;
  const samePhase = candidates.find(option => parseStudioSelection(option.value)?.phase === current?.phase);
  return (samePhase || candidates[0]).value;
}

export function startNativeSeasonLab({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  registryUrl,
} = {}) {
  if (!documentRef) return null;
  const panel = documentRef.getElementById('seasonLabPanel');
  if (!panel) return null;

  const sourcePanel = documentRef.getElementById('seasonLabSourcePanel');
  const sourceState = documentRef.getElementById('seasonLabSourceState');
  const sourceNote = documentRef.getElementById('seasonLabSourceNote');
  const hostSeasonSelect = documentRef.getElementById('packageSelect');
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button[data-workbench]')];
  const Observer = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
  const props = { documentRef, fetchImpl, ...(registryUrl ? { registryUrl } : {}) };
  const initialHidden = panel.hidden;
  let rootHandle = null;
  let active = false;
  let discoveryObserver = null;
  let optionObserver = null;
  let statusObserver = null;

  function appSeasonSelect() {
    return panel.querySelector(SEASON_SELECT_SELECTOR);
  }

  function syncStudioSelectionToApp() {
    const select = appSeasonSelect();
    if (!select || (select.options?.length || 0) <= 1) return;
    const requested = studioValueToReactChoice(hostSeasonSelect?.value);
    const available = [...select.options].some(option => option.value === requested);
    setSelectValue(select, available ? requested : '', documentRef);
  }

  function syncAppSelectionToStudio() {
    const select = appSeasonSelect();
    if (!select || !hostSeasonSelect) return;
    const requested = reactChoiceToStudioValue(select.value, hostSeasonSelect);
    if (!requested || requested === hostSeasonSelect.value) return;
    if ([...(hostSeasonSelect.options || [])].some(option => option.value === requested)) {
      setSelectValue(hostSeasonSelect, requested, documentRef);
    }
  }

  function syncHostSourceStatus() {
    const pill = panel.querySelector('.sl-source-panel .sl-status');
    if (!pill || !sourceState) return;
    const label = pill.textContent.trim() || 'Checking';
    const ready = pill.classList.contains('sl-status--ready');
    const failed = pill.classList.contains('sl-status--error');
    const state = ready ? 'available' : failed ? 'unavailable' : 'checking';
    sourceState.textContent = label;
    sourceState.dataset.state = state;
    if (sourceNote) {
      const detail = panel.querySelector('.sl-source-panel [role="alert"]')?.textContent?.trim();
      sourceNote.textContent = detail || (ready
        ? 'The selected exact-season package is ready in Season Lab.'
        : failed
          ? 'Choose another exact season or retry the source check.'
          : 'Season Lab is checking the selected exact-season package.');
    }
    if (documentRef.querySelector(ACTIVE_WORKBENCH_SELECTOR)?.dataset.workbench === 'season') {
      const workbenchState = documentRef.getElementById('workbenchState');
      if (workbenchState) {
        workbenchState.textContent = ready ? 'Available' : failed ? 'Unavailable' : 'Checking';
        workbenchState.dataset.state = state;
        workbenchState.classList.toggle('swishiq-state--ready', ready);
      }
      const workspaceTitle = documentRef.getElementById('workspaceTitle');
      if (workspaceTitle) workspaceTitle.textContent = ready ? 'Season Lab ready' : failed ? 'Season Lab unavailable' : 'Season Lab loading';
      const workspace = documentRef.getElementById('workspace');
      if (workspace) workspace.dataset.ready = String(ready);
    }
  }

  function findCancelButton() {
    return [...panel.querySelectorAll('button')].find(button => button.textContent.trim() === 'Cancel run') || null;
  }

  function cancelRun() {
    const cancel = findCancelButton();
    if (cancel && !cancel.disabled) cancel.click();
  }

  function setVisibility() {
    const shouldBeActive = documentRef.querySelector(ACTIVE_WORKBENCH_SELECTOR)?.dataset.workbench === 'season';
    panel.hidden = !shouldBeActive;
    if (active && !shouldBeActive) cancelRun();
    active = shouldBeActive;
    if (sourcePanel) sourcePanel.hidden = true;
    syncStudioSelectionToApp();
    syncHostSourceStatus();
  }

  function watchReactControls() {
    discoveryObserver?.disconnect();
    optionObserver?.disconnect();
    statusObserver?.disconnect();
    discoveryObserver = null;
    optionObserver = null;
    statusObserver = null;
    if (!Observer) {
      syncStudioSelectionToApp();
      syncHostSourceStatus();
      return;
    }
    const bind = () => {
      const select = appSeasonSelect();
      const pill = panel.querySelector('.sl-source-panel .sl-status');
      if (!select || !pill) return false;
      discoveryObserver?.disconnect();
      discoveryObserver = null;
      optionObserver = new Observer(syncStudioSelectionToApp);
      optionObserver.observe(select, { childList: true });
      statusObserver = new Observer(syncHostSourceStatus);
      statusObserver.observe(pill, { attributes: true, attributeFilter: ['class'], characterData: true, childList: true, subtree: true });
      syncStudioSelectionToApp();
      syncHostSourceStatus();
      return true;
    };
    if (!bind()) {
      discoveryObserver = new Observer(() => { bind(); });
      discoveryObserver.observe(panel, { childList: true, subtree: true });
    }
  }

  function mount() {
    ensureStylesheet(documentRef);
    if (sourcePanel) sourcePanel.hidden = true;
    rootHandle = mountSeasonLab(panel, props);
    watchReactControls();
    setVisibility();
  }

  const onTabClick = () => queueMicrotask(setVisibility);
  const onStudioSelectionChange = () => syncStudioSelectionToApp();
  const onAppSelectionChange = event => {
    if (event.target === appSeasonSelect()) syncAppSelectionToStudio();
  };

  mount();
  tabs.forEach(tab => tab.addEventListener('click', onTabClick));
  hostSeasonSelect?.addEventListener('change', onStudioSelectionChange);
  panel.addEventListener('change', onAppSelectionChange, true);

  const hostObserver = Observer && hostSeasonSelect
    ? new Observer(syncStudioSelectionToApp)
    : null;
  hostObserver?.observe(hostSeasonSelect, { childList: true, subtree: true });

  function unmount() {
    cancelRun();
    tabs.forEach(tab => tab.removeEventListener('click', onTabClick));
    hostSeasonSelect?.removeEventListener('change', onStudioSelectionChange);
    panel.removeEventListener('change', onAppSelectionChange, true);
    discoveryObserver?.disconnect();
    optionObserver?.disconnect();
    statusObserver?.disconnect();
    hostObserver?.disconnect();
    rootHandle?.unmount?.();
    rootHandle = null;
    panel.hidden = initialHidden;
  }

  function reload() {
    cancelRun();
    rootHandle?.unmount?.();
    rootHandle = null;
    mount();
    return rootHandle;
  }

  return Object.freeze({
    activate: setVisibility,
    reload,
    unmount,
    destroy: unmount,
  });
}

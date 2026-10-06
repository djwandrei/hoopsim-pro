import { mountGameLab } from './react-app/studio-react-labs.js?v=20261005c&rev=react-studio-labs-v39-candidate10-game-lab';

const STYLESHEET_ID = 'swishiq-studio-react-labs-stylesheet';
const STYLESHEET_URL = new URL('./react-app/studio-react-labs.css?v=20261005b&rev=react-studio-labs-css-v19-modeled-replay', import.meta.url).href;
const ACTIVE_WORKBENCH_SELECTOR = '.swishiq-tabs button[data-workbench][aria-pressed="true"]';
const SEASON_SELECT_SELECTOR = '.game-lab-view .gl-form-grid select[id$="-season"]';

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

export function startSwishIqGameLab({
  documentRef = globalThis.document,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  registryUrl,
} = {}) {
  if (!documentRef) return null;
  const panel = documentRef.getElementById('gameLabPanel');
  if (!panel) return null;

  const hostSeasonSelect = documentRef.getElementById('packageSelect');
  const tabs = [...documentRef.querySelectorAll('.swishiq-tabs button[data-workbench]')];
  const Observer = documentRef.defaultView?.MutationObserver || globalThis.MutationObserver;
  const props = { documentRef, fetchImpl, ...(registryUrl ? { registryUrl } : {}) };
  const initialHidden = panel.hidden;
  let rootHandle = null;
  let active = false;
  let pausedByBridge = false;
  let discoveryObserver = null;
  let optionObserver = null;

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

  function findButton(label) {
    return [...panel.querySelectorAll('button')].find(button => button.textContent.trim() === label) || null;
  }

  function pauseRun() {
    const pause = findButton('Pause');
    if (pause && !pause.disabled) {
      pause.click();
      pausedByBridge = true;
    }
  }

  function resumeRun() {
    if (!pausedByBridge) return;
    const resume = findButton('Resume');
    if (resume && !resume.disabled) resume.click();
    pausedByBridge = false;
  }

  function cancelRun() {
    const cancel = panel.querySelector('.gl-action-buttons .gl-button-danger');
    if (cancel && !cancel.disabled) cancel.click();
    pausedByBridge = false;
  }

  function setVisibility() {
    const shouldBeActive = documentRef.querySelector(ACTIVE_WORKBENCH_SELECTOR)?.dataset.workbench === 'game';
    panel.hidden = !shouldBeActive;
    if (active && !shouldBeActive) pauseRun();
    if (!active && shouldBeActive) resumeRun();
    active = shouldBeActive;
    syncStudioSelectionToApp();
  }

  function watchReactSelect() {
    discoveryObserver?.disconnect();
    optionObserver?.disconnect();
    discoveryObserver = null;
    optionObserver = null;
    if (!Observer) {
      syncStudioSelectionToApp();
      return;
    }
    const bind = () => {
      const select = appSeasonSelect();
      if (!select) return false;
      discoveryObserver?.disconnect();
      discoveryObserver = null;
      optionObserver = new Observer(syncStudioSelectionToApp);
      optionObserver.observe(select, { childList: true });
      syncStudioSelectionToApp();
      return true;
    };
    if (!bind()) {
      discoveryObserver = new Observer(() => { bind(); });
      discoveryObserver.observe(panel, { childList: true, subtree: true });
    }
  }

  function mount() {
    ensureStylesheet(documentRef);
    rootHandle = mountGameLab(panel, props);
    watchReactSelect();
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

/*
 * Shared fan-tool loading / transition surface.
 *
 * The optimizer and public SwishIQ tools can take long enough that a small
 * inline status is easy to miss.  This component gives those operations one
 * calm, branded transition surface without manufacturing progress.  Callers
 * may provide a real progress value (0..100); otherwise the bar is
 * intentionally indeterminate.
 */

const ROOT_ID = "djhcFanLoading";
const DEFAULTS = {
  title: "Working on your result",
  detail: "Checking the published basketball data and preparing the next view.",
  context: "DJ's House of Cards · SwishIQ",
  emblem: "../../assets/games/swishiq-studio-emblem-20260913.png",
};

let root = null;
let titleNode = null;
let detailNode = null;
let contextNode = null;
let progressNode = null;
let progressValueNode = null;
let metricNode = null;
let emblemNode = null;
let observer = null;
let hideTimer = 0;
let observedBusyKey = null;
let observedBusyElement = null;

function webpSourceFor(source) {
  return typeof source === "string" ? source.replace(/\.png(?=([?#]|$))/i, ".webp") : "";
}

function setLoadingEmblemSource(emblem, source) {
  if (!emblem || !source) return;
  let picture = emblem.parentElement;
  if (!picture || picture.tagName !== "PICTURE") {
    picture = document.createElement("picture");
    picture.className = "fan-loading__emblem-picture";
    emblem.replaceWith(picture);
    picture.append(emblem);
  }
  let webp = picture.querySelector("source[data-fan-loading-webp]");
  if (!webp) {
    webp = document.createElement("source");
    webp.type = "image/webp";
    webp.dataset.fanLoadingWebp = "true";
    picture.prepend(webp);
  }
  const webpSource = webpSourceFor(source);
  if (webpSource) {
    if (webp.getAttribute("srcset") !== webpSource) webp.srcset = webpSource;
  } else if (webp.hasAttribute("srcset")) {
    webp.removeAttribute("srcset");
  }
  // Set the fallback only after the picture is attached so capable browsers
  // select WebP without first fetching the original PNG.
  if (emblem.getAttribute("src") !== source) emblem.src = source;
}

function ensureRoot() {
  if (root && root.isConnected) return root;

  root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.className = "fan-loading";
    root.hidden = true;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-atomic", "true");
    root.innerHTML = `
      <div class="fan-loading__wash" aria-hidden="true"></div>
      <div class="fan-loading__frame">
        <div class="fan-loading__brand">
          <img class="fan-loading__emblem" alt="" width="72" height="72" decoding="async">
          <span class="fan-loading__brand-name">DJ's House of Cards</span>
        </div>
        <div class="fan-loading__court" aria-hidden="true">
          <svg class="fan-loading__court-svg" viewBox="0 0 94 50" preserveAspectRatio="xMidYMid meet" focusable="false">
            <rect class="fan-loading__court-outline" x=".5" y=".5" width="93" height="49"></rect>
            <line x1="47" y1=".5" x2="47" y2="49.5"></line>
            <circle cx="47" cy="25" r="6"></circle>
            <rect class="fan-loading__court-paint" x=".5" y="17" width="18.5" height="16"></rect>
            <rect class="fan-loading__court-paint" x="75" y="17" width="18.5" height="16"></rect>
            <circle class="fan-loading__court-free-throw" cx="19" cy="25" r="6"></circle>
            <circle class="fan-loading__court-free-throw" cx="75" cy="25" r="6"></circle>
            <path class="fan-loading__court-restricted" d="M5.25 21 A4 4 0 0 1 5.25 29"></path>
            <path class="fan-loading__court-restricted" d="M88.75 21 A4 4 0 0 0 88.75 29"></path>
            <path class="fan-loading__court-three-point" d="M.5 3 H13.75 C23.5 4.75 28.75 13.7 28.75 25 C28.75 36.3 23.5 45.25 13.75 47 H.5"></path>
            <path class="fan-loading__court-three-point" d="M93.5 3 H80.25 C70.5 4.75 65.25 13.7 65.25 25 C65.25 36.3 70.5 45.25 80.25 47 H93.5"></path>
            <line class="fan-loading__court-backboard" x1="3.5" y1="22" x2="3.5" y2="28"></line>
            <line class="fan-loading__court-backboard" x1="90.5" y1="22" x2="90.5" y2="28"></line>
            <circle class="fan-loading__court-rim" cx="5.25" cy="25" r=".8"></circle>
            <circle class="fan-loading__court-rim" cx="88.75" cy="25" r=".8"></circle>
          </svg>
          <span class="fan-loading__ball"></span>
        </div>
        <div class="fan-loading__copy">
          <p class="fan-loading__kicker">SwishIQ Studio</p>
          <h2 class="fan-loading__title"></h2>
          <p class="fan-loading__detail"></p>
        </div>
        <div class="fan-loading__metrics" aria-hidden="true">
          <span><i></i><b>PTS</b></span>
          <span><i></i><b>REB</b></span>
          <span><i></i><b>AST</b></span>
          <span><i></i><b>STL</b></span>
          <span><i></i><b>MPG</b></span>
        </div>
        <div class="fan-loading__progress-wrap">
          <progress class="fan-loading__progress" max="100" value="0"></progress>
          <span class="fan-loading__progress-value" aria-hidden="true"></span>
        </div>
        <p class="fan-loading__context"></p>
      </div>`;
    document.body.append(root);
  }

  titleNode = root.querySelector(".fan-loading__title");
  detailNode = root.querySelector(".fan-loading__detail");
  contextNode = root.querySelector(".fan-loading__context");
  progressNode = root.querySelector(".fan-loading__progress");
  progressValueNode = root.querySelector(".fan-loading__progress-value");
  metricNode = root.querySelector(".fan-loading__metrics");
  emblemNode = root.querySelector(".fan-loading__emblem");
  if (emblemNode && !emblemNode.getAttribute("src")) setLoadingEmblemSource(emblemNode, DEFAULTS.emblem);
  return root;
}

function normalizedProgress(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

export function showFanLoading(options = {}) {
  const surface = ensureRoot();
  window.clearTimeout(hideTimer);
  const config = { ...DEFAULTS, ...options };
  titleNode.textContent = config.title;
  detailNode.textContent = config.detail;
  contextNode.textContent = config.context;
  if (emblemNode && config.emblem) setLoadingEmblemSource(emblemNode, config.emblem);

  const progress = normalizedProgress(config.progress);
  if (progress === null) {
    surface.dataset.progress = "indeterminate";
    progressNode.removeAttribute("value");
    progressValueNode.textContent = "Working";
    metricNode?.classList.add("is-shimmering");
  } else {
    surface.dataset.progress = "determinate";
    progressNode.value = progress;
    progressValueNode.textContent = `${Math.round(progress)}%`;
    metricNode?.classList.remove("is-shimmering");
  }

  surface.dataset.context = config.context || "";
  surface.hidden = false;
  document.body.classList.add("fan-loading-open");
  return surface;
}

export function updateFanLoading(options = {}) {
  if (!root || root.hidden) return showFanLoading(options);
  return showFanLoading({
    title: titleNode?.textContent || DEFAULTS.title,
    detail: detailNode?.textContent || DEFAULTS.detail,
    context: contextNode?.textContent || DEFAULTS.context,
    ...options,
  });
}

export function hideFanLoading({ immediate = false } = {}) {
  if (!root || root.hidden) return;
  const close = () => {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("fan-loading-open");
  };
  window.clearTimeout(hideTimer);
  if (immediate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) close();
  else hideTimer = window.setTimeout(close, 180);
}

function loadingForElement(element) {
  if (!element || element === root || element.hidden) return null;
  const label = element.dataset.loadingLabel;
  if (label) return { title: label, detail: element.dataset.loadingDetail || DEFAULTS.detail };
  if (element.matches("#gameBoard")) return { title: "Checking today’s board", detail: "Making sure the board and season are ready." };
  if (element.matches("#blueprintPanel")) return { title: "Preparing the player profile", detail: "Loading the published season data." };
  if (element.matches("#compositeLabPanel")) return { title: "Building the player recipe", detail: "Checking the selected donor rows." };
  if (element.matches("#careerLabPanel")) return { title: "Building the career view", detail: "Loading observed history before future paths." };
  if (element.matches("#seasonLabPanel")) return { title: "Preparing Season Lab", detail: "Checking the selected season before the simulation." };
  if (element.matches("#liveDataPanel")) return { title: "Loading team data", detail: "Checking the selected team and season." };
  if (element.matches("#optimizerForm, form#optimizerForm, .journey-busy")) return { title: "Building your lineup", detail: "Searching the eligible player pool." };
  if (element.closest(".swishiq-advanced-lab")) return { title: "Preparing the studio", detail: "Loading the selected season and its inputs." };
  return null;
}

function loadingMutationAffectsBusy(record) {
  const target = record?.target;
  if (!(target instanceof Element)) return false;
  if (record.attributeName === "aria-busy"
    || record.attributeName === "data-loading-label"
    || record.attributeName === "data-loading-detail") return true;
  return record.attributeName === "hidden"
    && (target === observedBusyElement || target.matches('[aria-busy="true"]'));
}

function syncObservedBusy(records = []) {
  if (!document.body || document.body.dataset.fanLoadingManual === "true") {
    observedBusyKey = null;
    observedBusyElement = null;
    return;
  }
  // The loading surface lives inside <body> and changes its own `hidden`
  // attribute when it opens or closes. Ignore those self-generated records so
  // the observer cannot keep re-entering while a workbench is changing state.
  if (root && records.length && records.every(record => root === record.target || root.contains(record.target))) return;
  // `hidden` is observed because a busy panel can finish by being removed from
  // view, but most hidden mutations are unrelated disclosure or nav changes.
  // Skip the document-wide query unless a loading attribute or the known busy
  // element changed.
  if (records.length && !records.some(loadingMutationAffectsBusy)) return;
  const busyEntry = [...document.querySelectorAll('[aria-busy="true"]')]
    .map(element => ({ element, busy: loadingForElement(element) }))
    .find(entry => entry.busy);
  const busy = busyEntry?.busy || null;
  const busyElement = busyEntry?.element || null;
  const busyKey = busy ? `${busy.title}\u0000${busy.detail}` : '';
  if (busyKey === observedBusyKey && busyElement === observedBusyElement) return;
  observedBusyKey = busyKey;
  observedBusyElement = busyElement;
  if (busy) showFanLoading(busy);
  else if (root && !root.hidden) hideFanLoading();
}

export function observeFanLoading() {
  if (observer || !document.body) return;
  observer = new MutationObserver(syncObservedBusy);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-busy", "hidden", "data-loading-label", "data-loading-detail"] });
  syncObservedBusy();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("djhc:loading", (event) => {
    const detail = event.detail || {};
    if (detail.active === false) hideFanLoading({ immediate: Boolean(detail.immediate) });
    else if (detail.active !== false) showFanLoading(detail);
  });
  window.addEventListener("djhc:loading-progress", (event) => {
    const progress = event.detail?.progress;
    if (progress !== undefined && progress !== null) updateFanLoading({ progress });
  });
  const start = () => observeFanLoading();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  window.DJHCLoading = { show: showFanLoading, update: updateFanLoading, hide: hideFanLoading, observe: observeFanLoading };
}

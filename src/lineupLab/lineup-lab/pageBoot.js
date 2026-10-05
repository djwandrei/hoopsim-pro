// Boots the Lineup Lab tool inside the studio app. A runtime service worker
// serves the tool's exact live-site module graph and assets through the
// swishiqLineupLabSource relay, so the site's own code runs verbatim with its
// release pins intact. The single tool instance parks in a module-level
// keeper while the React route is unmounted, preserving its state.

import { STANDALONE } from "@/lib/deployConfig";

const SITE = "https://www.djshouseofcards-comics.com";
const MODULE_BASE = "/lineup-lab/modules/";
const APP_REV = "?v=20261002c&rev=lineup-v4-share-client-contract-pin-closure-v1";
const CSS_FILES = [
  "/lineup-lab/css/styles.css?v=20261001g",
  "/lineup-lab/css/lineup-lab.css?v=20261002c&rev=data-source-select-full-label-v1-20260930",
  "/lineup-lab/css/fan-tools.css?v=20261002c-fan-tools-readable-text-14px-v1",
];

// Tool hrefs that resolve inside the studio app; everything else points back
// at the live site.
const HREF_MAP = new Map([
  ["./", "/lineup-lab"],
  ["../tools/", "/"],
  ["../tools/swishiq-studio/", "/"],
  ["../tools/fix-the-five/", "/fix-the-five"],
  ["../tools/draft-night/", "/draft-night"],
  ["/tools/", "/"],
]);

let cssInstalled = false;
let keeper = null;
let bootPromise = null;
let savedBody = null;

function ensureCss() {
  if (cssInstalled) return;
  cssInstalled = true;
  for (const href of CSS_FILES) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.lineupLabCss = "true";
    document.head.appendChild(link);
  }
}

function removeCss() {
  document.querySelectorAll('link[data-lineup-lab-css="true"]').forEach(link => link.remove());
  cssInstalled = false;
}

// A transient upstream blip (the site's challenge layer 404s or stalls a
// request occasionally) must not brick the boot: retry once after a pause and
// purge any runtime-cache entry the first attempt may have polluted.
async function importWithRetry(url, attempts = 2) {
  try {
    return await import(url);
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise(resolve => setTimeout(resolve, 1500));
    try { await caches.delete("lineup-lab-runtime-v1"); } catch { /* no cache */ }
    return import(url);
  }
}

function swReady() {
  if (!swReady.promise) {
    swReady.promise = (async () => {
      if (!("serviceWorker" in navigator)) {
        throw new Error("This browser cannot host the Lineup Lab service worker.");
      }
      await navigator.serviceWorker.register(STANDALONE ? "/sw-lineup-lab.js?mode=direct" : "/sw-lineup-lab.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("The Lineup Lab service worker did not activate.")), 10000);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            clearTimeout(timer);
            resolve();
          }, { once: true });
        });
      }
    })();
  }
  return swReady.promise;
}

async function fetchToolMarkup() {
  const response = await fetch(`${SITE}/lineup-lab/index.html?v=20261002c`, { cache: "no-store" });
  if (!response.ok) throw new Error("The Lineup Lab page could not be loaded.");
  const html = await response.text();
  const bodyStart = html.indexOf("<body");
  const inner = html.slice(html.indexOf(">", bodyStart) + 1, html.lastIndexOf("</body>"));
  // The live shell scripts are not part of the studio build.
  return inner.replace(/<script[\s\S]*?<\/script>/g, "");
}

function rewriteLinks(root) {
  root.querySelectorAll("a[href]").forEach(anchor => {
    const href = anchor.getAttribute("href") || "";
    if (HREF_MAP.has(href)) {
      anchor.setAttribute("href", HREF_MAP.get(href));
    } else if (href.startsWith("../")) {
      anchor.setAttribute("href", SITE + "/" + href.slice(3));
    }
  });
  // Static images keep the live site's own asset paths.
  root.querySelectorAll("img[src^='../']").forEach(image => {
    image.setAttribute("src", SITE + "/" + image.getAttribute("src").slice(3));
  });
}

function applyToolBodyState() {
  savedBody = {
    className: document.body.className,
    colorScheme: document.body.style.colorScheme,
    experienceMode: document.body.getAttribute("data-experience-mode"),
    page: document.body.getAttribute("data-page"),
    fanHelp: document.body.getAttribute("data-fan-help"),
  };
  document.body.classList.add("court-themed", "dark-mode", "lab-guided");
  document.body.setAttribute("data-experience-mode", "detailed");
  document.body.setAttribute("data-page", "fan-tools");
  document.body.setAttribute("data-fan-help", "lineup");
  document.body.style.colorScheme = "dark";
}

function restoreToolBodyState() {
  if (!savedBody) return;
  document.body.className = savedBody.className;
  document.body.style.colorScheme = savedBody.colorScheme;
  const restore = (name, value) => {
    if (value === null) document.body.removeAttribute(name);
    else document.body.setAttribute(name, value);
  };
  restore("data-experience-mode", savedBody.experienceMode);
  restore("data-page", savedBody.page);
  restore("data-fan-help", savedBody.fanHelp);
  savedBody = null;
}

function installThemeToggle(root) {
  const toggle = root.querySelector("#themeToggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    const dark = !document.body.classList.contains("dark-mode");
    document.body.classList.toggle("dark-mode", dark);
    document.body.style.colorScheme = dark ? "dark" : "light";
    toggle.setAttribute("data-theme-mode", dark ? "dark" : "light");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* storage-restricted */ }
  });
}

export async function mountLineupLab(host) {
  ensureCss();
  if (!keeper) {
    await swReady();
    const { installLineupLabBridge } = await import("./siteBridge.js");
    installLineupLabBridge();
    const markup = await fetchToolMarkup();
    keeper = document.createElement("div");
    keeper.className = "lineup-lab-tool";
    keeper.innerHTML = markup;
    rewriteLinks(keeper);
    installThemeToggle(keeper);
    bootPromise = (async () => {
      await importWithRetry(`${MODULE_BASE}app.js${APP_REV}`);
      // Small experience enhancers from the live shell; failure is cosmetic.
      await Promise.allSettled([
        importWithRetry(`${MODULE_BASE}lab-experience.js?v=20261002c`),
        importWithRetry(`${MODULE_BASE}source-summary.js?v=20261002c&rev=mobile-full-source-v1`),
      ]);
    })().catch(error => {
      // A failed boot must not be cached: drop the dead tool node and reset so
      // the next mount retries the module graph from scratch instead of
      // re-awaiting the rejected promise.
      if (keeper && keeper.parentNode) keeper.parentNode.removeChild(keeper);
      keeper = null;
      bootPromise = null;
      throw error;
    });
  }
  if (keeper.parentNode) keeper.parentNode.removeChild(keeper);
  host.appendChild(keeper);
  applyToolBodyState();
  await bootPromise;
}

export function unmountLineupLab() {
  if (keeper && keeper.parentNode) keeper.parentNode.removeChild(keeper);
  removeCss();
  restoreToolBodyState();
}
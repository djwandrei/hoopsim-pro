// Boots the Lineup Lab tool inside the studio app. A runtime service worker
// serves the tool's exact live-site module graph and assets through the
// swishiqLineupLabSource relay, so the site's own code runs verbatim with its
// release pins intact. The single tool instance parks in a module-level
// keeper while the React route is unmounted, preserving its state.

import workerConnection, { disconnectWorker } from '@/lineupLab/lineup-lab/workerConnection';
import { readSourceText } from '@/lineupLab/lineup-lab/runtimeRelay';
import { ensureToolStyles, removeToolStyles, ensureSiteConfig } from '@/lineupLab/lineup-lab/toolStyles';
import toolLinks from '@/lineupLab/lineup-lab/toolLinks';
import toolBodyState from '@/lineupLab/lineup-lab/toolBodyState';
import toolChrome from '@/lineupLab/lineup-lab/toolChrome';
import { installLineupLabBridge } from '@/lineupLab/lineup-lab/siteBridge';

const MODULE_BASE = '/lineup-lab/';
const APP_REV = '?v=20261002c&rev=lineup-v4-share-client-contract-pin-closure-v1';
let keeper = null, bootPromise = null;
let restoreBody = null, disposeChrome = null;
let parkedExperience = 'detailed';

async function fetchToolMarkup() {
  const html = await readSourceText('/lineup-lab/index.html?v=20261002c');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (!parsed.querySelector('#workspace') || !parsed.querySelector('#loadLiveDataButton')) {
    throw new Error('The Lineup Lab page source is temporarily unavailable.');
  }
  parsed.querySelectorAll('script').forEach(script => script.remove());
  return parsed.body.innerHTML;
}

export async function mountLineupLab(host, signal) {
  await workerConnection();
  signal.throwIfAborted();
  // The worker must control requests before loading any site CSS or scripts.
  const [, , markup] = await Promise.all([
    ensureToolStyles(), ensureSiteConfig(), keeper ? null : fetchToolMarkup(),
  ]);
  signal.throwIfAborted();
  if (!host?.isConnected) return;
  if (!keeper) {
    keeper = document.createElement('div');
    keeper.className = 'lineup-lab-tool';
    keeper.innerHTML = markup;
    toolLinks(keeper);
  }
  host.appendChild(keeper);
  restoreBody = toolBodyState();
  document.body.dataset.experienceMode = parkedExperience;
  disposeChrome = toolChrome(keeper);
  installLineupLabBridge();
  if (!bootPromise) {
    const instance = keeper;
    // Attach all controls before evaluating the site's document-scoped app.
    bootPromise = (async () => {
      await import(/* @vite-ignore */ `${MODULE_BASE}app.js${APP_REV}`);
      await Promise.all([
        import(/* @vite-ignore */ `${MODULE_BASE}lab-experience.js?v=20261002c`),
        import(/* @vite-ignore */ `${MODULE_BASE}source-summary.js?v=20261002c&rev=mobile-full-source-v1`),
        import(/* @vite-ignore */ '/tools/fan-tools-guide.js?v=20261002c&rev=phase2-guided-onboarding-v3-stable-floating-20260928j'),
      ]);
    })().catch(error => {
      instance.remove();
      if (keeper === instance) { keeper = null; bootPromise = null; }
      throw error;
    });
  }
  try {
    await bootPromise;
    signal.throwIfAborted();
  } catch (error) {
    if (!signal.aborted) unmountLineupLab();
    throw error;
  }
}

export function unmountLineupLab() {
  parkedExperience = document.body.dataset.experienceMode || parkedExperience;
  disposeChrome?.(); disposeChrome = null;
  keeper?.remove();
  removeToolStyles();
  disconnectWorker();
  restoreBody?.(); restoreBody = null;
}
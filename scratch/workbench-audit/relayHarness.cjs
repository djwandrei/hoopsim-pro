// Workbench audit harness: loads the site's release-pinned modules through the
// app's own swishiqSeasonSource relay (sha256-verified, same as the browser)
// and runs a representative output-producing call for each workbench.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const STUDIO = 'https://www.djshouseofcards-comics.com/tools/swishiq-studio/';

// --- Pin map: parsed from the app's reviewed pin table (studioNativeAssets.ts)
function pinMap() {
  const text = fs.readFileSync('/app/base44/shared/studioNativeAssets.ts', 'utf8');
  const pins = {};
  const re = /'([^']+)':'([a-f0-9]{64})'/g;
  let m;
  while ((m = re.exec(text))) pins[m[1]] = m[2];
  return pins;
}

async function relayAsset(assetPath, opts = {}) {
  const res = await base44.functions.invoke('swishiqSeasonSource', { assetPath, reviewUnverified: opts.reviewUnverified === true });
  const d = res.data ?? res;
  if (d.error) throw new Error(`${assetPath}: ${d.error}`);
  return d; // { text, sha256, contentType, verified? }
}

const moduleCache = new Map();

// Mirror of nativeModules.nativeModuleUrl: recursively resolve ESM imports to
// data: URLs so Node can import the site's browser modules unchanged.
async function importNativeModule(assetPath, base = STUDIO) {
  const url = new URL(String(assetPath), base).href;
  if (moduleCache.has(url)) return moduleCache.get(url);
  const task = (async () => {
    const pathname = new URL(url).pathname;
    let text;
    if (url.startsWith('https://')) {
      const asset = await relayAsset(pathname + (new URL(url).search || ''));
      const digest = require('crypto').createHash('sha256').update(asset.text).digest('hex');
      if (digest !== asset.sha256) throw new Error('integrity: relayed text hash mismatch');
      if (asset.sha256) {
        const pins = globalThis.__AUDIT_PINS || (globalThis.__AUDIT_PINS = pinMap());
        if (pins[pathname] && pins[pathname] !== asset.sha256) throw new Error(`pin mismatch for ${pathname}`);
      }
      text = asset.text;
    } else {
      throw new Error('unexpected module url: ' + url);
    }
    const imports = /^\s*(?:import|export)\s+(?:(?:[\w$]+\s*,?\s*)?\{[\s\S]*?\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+)\s*from\s*(['"])([^'"]+)\1/gm;
    const matches = [...text.matchAll(imports)];
    const resolved = await Promise.all(matches.map(match => importNativeModule(match[2], url)));
    matches.forEach((match, i) => {
      text = text.split(match[0]).join(`import * as __aud${i} from "${resolved[i]}";`);
    });
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
    const mod = await import(moduleUrl);
    moduleCache.set(url, mod);
    return mod;
  })();
  moduleCache.set(url, task);
  return task;
}

// --- Local filesystem module import (vendored release files)
async function importLocal(relPath) {
  return import(pathToFileURL(path.join('/app', relPath)).href);
}

// --- Relay fetch shim for engines that fetch() their own data paths
async function relayFetch(input) {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
  const asset = await relayAsset(url.pathname + url.search);
  return { ok: true, status: 200, headers: { get: k => (k.toLowerCase() === 'content-type' ? asset.contentType : null) },
    text: async () => asset.text, json: async () => JSON.parse(asset.text) };
}

module.exports = { relayAsset, importNativeModule, importLocal, relayFetch, pinMap, STUDIO };
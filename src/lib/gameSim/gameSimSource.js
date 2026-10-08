// Vendored SwishIQ game-lab engine source: the exact site model/simulation
// copy lives in /public/swishiq-game-sim/ (1:1 site structure). Every file is
// pinned by the vendored manifest.json (SHA-256), and this loader refuses to
// hand the studio any bytes that don't match the reviewed hashes.
const MANIFEST_SHA256 = 'e378f6d40bb7bf5b350de5686c9c6726d2a866b440ed0c5a55cf95b56c8d7dcd';
const withBase = path => `${import.meta.env.BASE_URL === '/' ? '' : import.meta.env.BASE_URL.replace(/\/$/, '')}/swishiq-game-sim/${path}`;
const hex = buffer => [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join('');

let pinsPromise = null;
function pins() {
  if (!pinsPromise) {
    pinsPromise = (async () => {
      const response = await fetch(withBase('manifest.json'), { cache: 'no-store' });
      if (!response.ok) throw new Error('The SwishIQ model manifest could not be loaded.');
      const bytes = await response.arrayBuffer();
      if (hex(await crypto.subtle.digest('SHA-256', bytes)) !== MANIFEST_SHA256) {
        throw new Error('The SwishIQ model manifest failed its integrity check.');
      }
      const manifest = JSON.parse(new TextDecoder().decode(bytes));
      const table = new Map([['manifest.json', MANIFEST_SHA256]]);
      for (const group of ['copiedFiles', 'generatedFiles']) {
        for (const entry of manifest[group] || []) table.set(entry.path, entry.sha256);
      }
      return table;
    })();
    pinsPromise.catch(() => { pinsPromise = null; });
  }
  return pinsPromise;
}

const assets = new Map();
export async function gameSimAsset(path) {
  if (!assets.has(path)) {
    const task = (async () => {
      const table = await pins();
      const expected = table.get(path);
      if (!expected) throw new Error('This is not an approved SwishIQ model asset.');
      const response = await fetch(withBase(path), { cache: 'no-store' });
      if (!response.ok) throw new Error(`The SwishIQ model asset is unavailable (${response.status}).`);
      const bytes = await response.arrayBuffer();
      const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
      if (sha256 !== expected) throw new Error('The SwishIQ model asset failed its integrity check.');
      return { text: new TextDecoder().decode(bytes), sha256, contentType: response.headers.get('content-type') || 'application/octet-stream' };
    })();
    assets.set(path, task);
    task.catch(() => assets.delete(path));
  }
  return assets.get(path);
}

export async function gameSimJson(path) {
  const asset = await gameSimAsset(path);
  return { data: JSON.parse(asset.text), sha256: asset.sha256 };
}

// Module loading mirrors the native bridge: each reviewed module is re-hosted
// as an immutable Blob module with its relative imports rewritten to verified
// sibling Blob URLs, so the studio executes only pinned bytes — and the same
// specifier always resolves to the same module instance.
const moduleUrls = new Map();
const importPattern = /from\s*(['"])(\.{1,2}\/[^'"]+)\1/g;
function gameSimModuleUrl(path) {
  if (!moduleUrls.has(path)) {
    const task = (async () => {
      const asset = await gameSimAsset(path);
      const matches = [...asset.text.matchAll(importPattern)];
      const resolved = await Promise.all(matches.map(match => {
        const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        const stack = [];
        for (const segment of (directory + match[2]).split('/')) {
          if (segment === '.' || segment === '') continue;
          if (segment === '..') stack.pop(); else stack.push(segment);
        }
        return gameSimModuleUrl(stack.join('/'));
      }));
      let text = asset.text;
      for (let index = matches.length - 1; index >= 0; index -= 1) {
        const match = matches[index];
        const start = match.index;
        const end = start + match[0].length;
        text = text.slice(0, start) + match[0].replace(`${match[1]}${match[2]}${match[1]}`, JSON.stringify(resolved[index])) + text.slice(end);
      }
      return URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    })();
    moduleUrls.set(path, task);
    task.catch(() => moduleUrls.delete(path));
  }
  return moduleUrls.get(path);
}

export async function gameSimModule(path) {
  return import(/* @vite-ignore */ await gameSimModuleUrl(path));
}
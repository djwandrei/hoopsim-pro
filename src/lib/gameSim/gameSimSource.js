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

// Native ESM uses same-origin files, so the host CSP need not permit executable blobs.
const verifiedModules = new Map();
async function verifyModuleGraph(path, visited = new Set()) {
  if (visited.has(path)) return;
  visited.add(path);
  const asset = await gameSimAsset(path);
  for (const match of asset.text.matchAll(/from\s*(['"])(\.{1,2}\/[^'"]+)\1/g)) {
    const resolved = new URL(match[2], `https://runtime.invalid/${path}`);
    await verifyModuleGraph(resolved.pathname.slice(1), visited);
  }
}
export async function gameSimModule(path) {
  if (!verifiedModules.has(path)) {
    const task = verifyModuleGraph(path);
    verifiedModules.set(path, task);
    task.catch(() => verifiedModules.delete(path));
  }
  await verifiedModules.get(path);
  const url = new URL(withBase(path), location.origin).href;
  return import(/* @vite-ignore */ url);
}

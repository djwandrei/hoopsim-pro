// Lineup Lab runtime service worker. The tool's exact live-site module graph
// is served at studio-local URLs and relayed byte-for-byte through the
// swishiqLineupLabSource backend function, so sha256 package pins keep
// verifying and the studio never bundles or edits the site's modules.

const SITE = 'https://www.djshouseofcards-comics.com';
const CACHE = 'lineup-lab-runtime-v2';
const CONNECTIONS = 'lineup-lab-connections-v1';
const ownerKey = id => `${self.location.origin}/__lineup-lab-client/${encodeURIComponent(id)}`;
async function isConnected(client) {
  if (client?.type !== 'window') return false;
  return Boolean(await (await caches.open(CONNECTIONS)).match(ownerKey(client.id)));
}
const ROOT_FILES = new Set(['/backend-config.js', '/supabase-client.js', '/core.js', '/nav.js', '/theme-init.js', '/styles.css']);

function sourcePath(url) {
  if (![SITE, self.location.origin].includes(url.origin)) return null;
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/') && /\.(js|css)$/.test(url.pathname)) return null;
  if (url.pathname.startsWith('/fixtures/')) return '/lineup-lab' + url.pathname + url.search;
  if (['/tools/', '/lineup-lab/', '/assets/'].some(prefix => url.pathname.startsWith(prefix)) || ROOT_FILES.has(url.pathname)) {
    return url.pathname + url.search;
  }
  return null;
}

async function getChunk(path, offset, clientId, totalBytes = null) {
  let client = clientId ? await self.clients.get(clientId) : null;
  if (!await isConnected(client)) {
    client = null;
    for (const candidate of await self.clients.matchAll({ type: 'window' })) {
      if (await isConnected(candidate)) { client = candidate; break; }
    }
  }
  if (!client) throw new Error('The Lineup Lab source connection is not active.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('The Lineup Lab source request timed out.')); }, 60000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      if (event.data?.error) reject(new Error(event.data.error));
      else resolve(event.data.data);
    };
    client.postMessage({ type: 'LINEUP_LAB_SOURCE', path, offset, totalBytes }, [channel.port2]);
  });
}

async function relay(path, clientId) {
  let page = await getChunk(path, 0, clientId);
  const pathname = new URL(path, SITE).pathname;
  const contentType = pathname.endsWith('.js') ? 'application/javascript; charset=utf-8'
    : pathname.endsWith('.css') ? 'text/css; charset=utf-8' : page.contentType;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const bytes = Uint8Array.from(atob(page.dataB64), character => character.charCodeAt(0));
        controller.enqueue(bytes);
        if (!page.hasMore) { controller.close(); return; }
        const offset = page.nextOffset;
        page = await getChunk(path, offset, clientId, page.totalBytes);
        if (page.hasMore && page.nextOffset <= offset) throw new Error('Incomplete Lineup Lab source.');
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(stream, { headers: { 'content-type': contentType, 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
}

self.addEventListener('message', event => {
  if (event.source?.type !== 'window' || !['LINEUP_LAB_CONNECT', 'LINEUP_LAB_DISCONNECT'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CONNECTIONS);
    const key = ownerKey(event.source.id);
    if (event.data.type === 'LINEUP_LAB_CONNECT') await cache.put(key, new Response('connected'));
    else await cache.delete(key);
    event.ports[0]?.postMessage({ ready: true });
  })());
});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('lineup-lab-runtime-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  // Never relay React navigations or the studio's compiled bundles.
  if (event.request.method !== 'GET' || event.request.mode === 'navigate') return;
  const path = sourcePath(new URL(event.request.url));
  if (!path) return;
  event.respondWith((async () => {
    try {
      // Resolve the current window on each request: service workers restart
      // after idle, so an in-memory connection flag cannot gate the lab.
      const client = event.clientId ? await self.clients.get(event.clientId) : null;
      if (client?.type === 'window' && !await isConnected(client)) return fetch(event.request);
      const cache = await caches.open(CACHE);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await relay(path, event.clientId);
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
      return response;
    } catch {
      return new Response('Lineup Lab source temporarily unavailable', { status: 503, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" && request.method !== "POST") return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  const path = mapRequest(url);
  if (!path) return;
  // Release tokens change whenever the site republishes, so URL-keyed
  // cache-first reads stay exact for module and artifact pins.
  event.respondWith((async () => {
    if (request.method !== "GET") return relay(path, request);
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await relay(path, request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  })());
});

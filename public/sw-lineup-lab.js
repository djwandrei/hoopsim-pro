// Lineup Lab runtime service worker. The tool's exact live-site module graph
// is served at studio-local URLs and relayed byte-for-byte through the
// swishiqLineupLabSource backend function, so sha256 package pins keep
// verifying and the studio never bundles or edits the site's modules.

const SITE = 'https://www.djshouseofcards-comics.com';
const CACHE = 'lineup-lab-runtime-v3';
const CONNECTIONS = 'lineup-lab-connections-v1';
const ownerKey = id => `${self.location.origin}/__lineup-lab-client/${encodeURIComponent(id)}`;
async function isConnected(client) {
  if (client?.type !== 'window') return false;
  return Boolean(await (await caches.open(CONNECTIONS)).match(ownerKey(client.id)));
}
const ROOT_FILES = new Set(['/backend-config.js', '/supabase-client.js', '/core.js', '/nav.js', '/theme-init.js', '/styles.css']);
// The optimizer's module graph is vendored byte-exact in the studio build.
// Dedicated workers are not service-worker-controlled in every browser, so
// their own module imports must resolve as ordinary same-origin files rather
// than through this relay.
const OPTIMIZER_MODULES = new Set([
  '/lineup-lab/optimizer-worker.js',
  '/lineup-lab/optimizer-core.js',
  '/lineup-lab/optimizer-config.js',
  '/lineup-lab/projection-parameters.js',
  '/lineup-lab/player-projection.js',
  '/lineup-lab/workload-model.js',
  '/lineup-lab/projection-evidence.js',
  '/lineup-lab/lineup-role-model.js',
  '/lineup-lab/swishiq-impact.js',
  '/lineup-lab/rotation-unit-planner.js',
  '/lineup-lab/workload-calibration.js',
  '/lineup-lab/player-data.js',
  '/lineup-lab/fan-analytics.js',
  '/lineup-lab/individual-player-evaluation.js',
  '/lineup-lab/opponent-gameplan.js',
  '/lineup-lab/basketball-simulation.js',
  '/lineup-lab/workflow-state.js',
  '/lineup-lab/scenario-url.js',
  '/lineup-lab/lineup-cache.js',
  '/lineup-lab/conditional-lineup-model.js',
  '/lineup-lab/conditional-lineup-model-pin-cb942ed193111248.js',
  '/lineup-lab/data/native-lineup-2022-2023-dc9bf4bbd0e61a08.json',
  '/lineup-lab/data/native-lineup-2023-2024-4668235ecb98440c.json',
  '/lineup-lab/data/native-lineup-2024-2025-a502b27ee9e30244.json',
  '/lineup-lab/data/native-lineup-2025-2026-2a33894a333e8cee.json',
  '/tools/swishiq-studio/engine/canonical-v4-lineup-model-gate.js',
  '/tools/swishiq-studio/engine/canonical-v4-site-consumer-policy.js',
  '/tools/swishiq-studio/engine/canonical-v4-studio-runtime-adapter.js',
  '/tools/swishiq-studio/engine/canonical-v4-descriptive-source-consumer.js',
  '/tools/swishiq-studio/engine/canonical-v4-public-network-loader.js',
  '/tools/swishiq-studio/engine/canonical-v4-studio-runtime-release-pin.js',
  '/tools/swishiq-studio/engine/canonical-v4-projection-resolver.js',
  '/tools/swishiq-studio/engine/canonical-v4-identity.js',
  '/tools/swishiq-studio/engine/canonical-v4-projection-capability-map.js',
]);

// The franchise release is vendored byte-exact in the studio build and served
// natively at its site paths; only the non-vendored V4 release data still
// relays through the backend source function.
const FRANCHISE_LOCAL_PREFIX = '/tools/swishiq-studio/franchise-sim-20261008/';
const FRANCHISE_V4_DATA = '/tools/swishiq-studio/data/v4/';
const VENDORED_ENGINE_FILES = new Set([
  'canonical-v4-descriptive-source-consumer.js', 'canonical-v4-identity.js',
  'canonical-v4-lineup-model-gate.js', 'canonical-v4-player-name-identity.js',
  'canonical-v4-player-season-evidence.js', 'canonical-v4-projection-capability-map.js',
  'canonical-v4-projection-resolver.js', 'canonical-v4-public-network-loader.js',
  'canonical-v4-site-consumer-policy.js', 'canonical-v4-studio-runtime-adapter.js',
  'canonical-v4-studio-runtime-release-pin.js', 'nba-schedule-source.js',
]);

function sourcePath(url) {
  if (![SITE, self.location.origin].includes(url.origin)) return null;
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/') && /\.(js|css)$/.test(url.pathname)) return null;
  if (url.origin === self.location.origin && OPTIMIZER_MODULES.has(url.pathname)) return null;
  if (url.pathname.startsWith('/fixtures/')) return '/lineup-lab' + url.pathname + url.search;
  if (url.pathname.startsWith(FRANCHISE_LOCAL_PREFIX)
    || url.pathname === '/tools/swishiq-studio/data/nba-actual-schedules-v1.json'
    || (url.pathname.startsWith('/tools/swishiq-studio/engine/')
      && VENDORED_ENGINE_FILES.has(url.pathname.split('/').pop()))) return null;
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
  const pathname = path.split('?')[0];
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
      // The franchise preview's window client never connects, so its V4
      // release data must still relay through any connected studio client.
      const franchiseRelay = new URL(event.request.url).pathname.startsWith(FRANCHISE_V4_DATA);
      if (client?.type === 'window' && !await isConnected(client) && !franchiseRelay) return fetch(event.request);
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


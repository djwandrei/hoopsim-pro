// Lineup Lab runtime service worker. The tool's exact live-site module graph
// is served at studio-local URLs and relayed byte-for-byte through the
// swishiqLineupLabSource backend function, so sha256 package pins keep
// verifying and the studio never bundles or edits the site's modules.

const SITE = "https://www.djshouseofcards-comics.com";
const RELAY = "/functions/swishiqLineupLabSource";
const CACHE = "lineup-lab-runtime-v1";
// "?mode=direct" registration: same-origin site build, no relay.
const DIRECT = self.location.search.includes("direct");
const ALLOWED_SITE_PATHS = ["/tools/", "/lineup-lab/"];
// Studio-local mirrors of the site layout: the tool's modules load at the
// exact same site-relative paths, so same-origin requests under these
// prefixes relay to the site 1:1 and every relative import inside the module
// graph resolves to its real site URL.
const ALLOWED_LOCAL_PREFIXES = [
  "/tools/", "/lineup-lab/", "/assets/",
  // Root shell scripts and the base stylesheet, exact.
  "/backend-config.js", "/supabase-client.js", "/core.js", "/nav.js",
  "/theme-init.js", "/styles.css",
];

function mapRequest(url) {
  // Direct site-hosted data and module fetches (site-origin URLs).
  if (url.origin === SITE) {
    if (ALLOWED_SITE_PATHS.some(prefix => url.pathname.startsWith(prefix))) {
      return url.pathname + url.search;
    }
    return null;
  }
  if (url.origin !== self.location.origin) return null;
  if (ALLOWED_LOCAL_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
    return url.pathname + url.search;
  }
  return null;
}

async function relay(path, request) {
  // On the live site the tool's paths are same-origin; only the studio app
  // needs the backend relay.
  const target = DIRECT ? path : `${RELAY}?${new URLSearchParams({ path })}`;
  const init = { method: "GET", cache: "no-store" };
  if (request.method === "POST") {
    init.method = "POST";
    init.body = await request.clone().arrayBuffer();
    const contentType = request.headers.get("content-type");
    if (contentType) init.headers = { "content-type": contentType };
  }
  const response = await fetch(target, init);
  if (!response.ok) return response;
  // Upstream bot-challenge pages arrive as HTML; never pass or cache them as
  // if they were the tool's code — fail retryable instead.
  if (!DIRECT && (response.headers.get("content-type") || "").includes("text/html") &&
      /\.(js|css|json)$/.test(path)) {
    return new Response("Lineup Lab source temporarily unavailable", {
      status: 503,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
  const headers = new Headers(response.headers);
  if (path.endsWith(".js")) headers.set("content-type", "application/javascript; charset=utf-8");
  return new Response(response.body, { status: response.status, headers });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
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

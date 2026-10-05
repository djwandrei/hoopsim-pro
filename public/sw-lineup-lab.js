// Lineup Lab runtime service worker. The tool's exact live-site module graph
// is served at studio-local URLs and relayed byte-for-byte through the
// swishiqLineupLabSource backend function, so sha256 package pins keep
// verifying and the studio never bundles or edits the site's modules.

const SITE = "https://www.djshouseofcards-comics.com";
const RELAY = "/functions/swishiqLineupLabSource";
const CACHE = "lineup-lab-runtime-v1";
const ALLOWED_SITE_PATHS = ["/tools/", "/lineup-lab/"];
const LOCAL_MEDIA_PATHS = ["/assets/player-headshots/", "/assets/nba-logos/"];

function mapRequest(url) {
  // Direct site-hosted data and module fetches (site-origin URLs).
  if (url.origin === SITE) {
    if (ALLOWED_SITE_PATHS.some(prefix => url.pathname.startsWith(prefix))) {
      return url.pathname + url.search;
    }
    return null;
  }
  if (url.origin !== self.location.origin) return null;
  // Runtime module graph: studio-local module URLs map back to the site.
  if (url.pathname.startsWith("/lineup-lab/modules/assets/")) {
    return "/assets/" + url.pathname.slice("/lineup-lab/modules/assets/".length) + url.search;
  }
  if (url.pathname.startsWith("/lineup-lab/modules/tools/")) {
    return "/tools/" + url.pathname.slice("/lineup-lab/modules/tools/".length) + url.search;
  }
  if (url.pathname.startsWith("/lineup-lab/modules/")) {
    return "/lineup-lab/" + url.pathname.slice("/lineup-lab/modules/".length) + url.search;
  }
  // Asset paths the modules resolve against their own module URLs.
  if (url.pathname.startsWith("/lineup-lab/assets/")) {
    return "/assets/" + url.pathname.slice("/lineup-lab/assets/".length) + url.search;
  }
  if (LOCAL_MEDIA_PATHS.some(prefix => url.pathname.startsWith(prefix))) {
    return url.pathname + url.search;
  }
  // Stylesheets the tool page requests locally.
  if (url.pathname.startsWith("/lineup-lab/css/")) {
    const name = url.pathname.slice("/lineup-lab/css/".length);
    const sitePath = name === "styles.css" ? "/styles.css"
      : name === "fan-tools.css" ? "/tools/fan-tools.css"
      : "/lineup-lab/" + name;
    return sitePath + url.search;
  }
  return null;
}

async function relay(path, request) {
  const params = new URLSearchParams({ path });
  const init = { method: "GET", cache: "no-store" };
  if (request.method === "POST") {
    init.method = "POST";
    init.body = await request.clone().arrayBuffer();
    const contentType = request.headers.get("content-type");
    if (contentType) init.headers = { "content-type": contentType };
  }
  const response = await fetch(`${RELAY}?${params}`, init);
  if (!response.ok) return response;
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

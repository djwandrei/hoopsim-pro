// Byte-exact relay for the Lineup Lab's site-hosted data. The studio app
// cannot fetch www.djshouseofcards-comics.com directly (no CORS), and the
// SwishIQ package loaders verify sha256 pins over the raw bytes, so this
// relay streams the site's response body through unchanged.

const SITE = "https://www.djshouseofcards-comics.com";
const ALLOWED_PREFIXES = [
  "/tools/",
  "/lineup-lab/",
  "/assets/",
  // Root shell scripts and the base stylesheet, exact.
  "/backend-config.js", "/supabase-client.js", "/core.js", "/nav.js",
  "/theme-init.js", "/styles.css",
];

function safePath(value: unknown): string | null {
  const path = String(value ?? "");
  if (!path.startsWith("/") || path.includes("..")) return null;
  if (!ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))) return null;
  return path;
}

export default async function(req: Request) {
  try {
    const url = new URL(req.url);
    let bodyPath = null;
    let upstreamBody;
    if (req.method === "POST" && (req.headers.get("content-type") || "").includes("application/json")) {
      let body = {};
      try { body = await req.json(); } catch { body = {}; }
      if (body && typeof body.path === "string") {
        bodyPath = body.path;
        if (typeof body.bodyB64 === "string") upstreamBody = Uint8Array.from(atob(body.bodyB64), c => c.charCodeAt(0));
      }
    }
    const path = safePath(bodyPath ?? url.searchParams.get("path"));
    if (!path) {
      return Response.json({ error: "Unknown Lineup Lab data path." }, { status: 400 });
    }
    // Reads relay any allowlisted site asset; writes are limited to the
    // shared-result route the tool's signed-share client uses.
    const isWrite = req.method === "POST" && !bodyPath;
    if (isWrite && !path.startsWith("/tools/shared-result/")) {
      return Response.json({ error: "Relay writes are limited to shared results." }, { status: 400 });
    }
    const headers = new Headers({ accept: "application/json, */*" });
    if (isWrite && req.headers.get("content-type")) headers.set("content-type", req.headers.get("content-type"));
    const upstream = await fetch(SITE + path, {
      method: isWrite ? "POST" : "GET",
      headers,
      body: isWrite ? await req.arrayBuffer() : undefined,
      cache: "no-store",
    });
    const responseHeaders = new Headers();
    responseHeaders.set("content-type", upstream.headers.get("content-type")
      || (path.endsWith(".json") ? "application/json" : "text/plain"));
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("access-control-allow-origin", "*");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The Lineup Lab data relay failed." }, { status: 502 });
  }
}
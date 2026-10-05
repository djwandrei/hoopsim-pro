// Byte-exact relay for the Lineup Lab's site-hosted data. The studio app
// cannot fetch www.djshouseofcards-comics.com directly (no CORS), and the
// SwishIQ package loaders verify sha256 pins over the raw bytes, so this
// relay streams the site's response body through unchanged.

import { sourceBytes, sourceRange } from './sourceBytes.ts';

const SITE = "https://www.djshouseofcards-comics.com";
const SHARE_URL = 'https://gkqdymnmczabcggvigce.supabase.co/functions/v1/swishiq-result-share';
// The site's browser-safe publishable key, not a service-role credential.
const SHARE_PUBLIC_KEY = 'sb_publishable_BHrJWQtop2ovkpOMOd9w3A_-9MTaeGG';
const ALLOWED_PREFIXES = [
  "/tools/",
  "/lineup-lab/",
  "/assets/",
  // Root shell scripts and the base stylesheet, exact.
  "/backend-config.js", "/supabase-client.js", "/core.js", "/nav.js",
  "/theme-init.js", "/styles.css",
];

function safePath(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.includes('..')) return null;
  const url = new URL(value, SITE);
  if (url.origin !== SITE || url.hash) return null;
  if (!ALLOWED_PREFIXES.some(prefix => prefix.endsWith('/') ? url.pathname.startsWith(prefix) : url.pathname === prefix)) return null;
  return url.pathname + url.search;
}

export default async function(req) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return Response.json({ error: 'Unsupported source request.' }, { status: 405 });
    const url = new URL(req.url);
    const isJson = req.method === 'POST' && (req.headers.get('content-type') || '').includes('application/json');
    const body = isJson ? await req.clone().json() : {};
    if (body.action === 'share') {
      const payload = body.body;
      if (req.method !== 'POST' || !payload?.summary || payload.summary.tool !== 'lineup-lab' ||
          !['native', 'clipboard'].includes(payload.share_method) || JSON.stringify(payload).length > 32768) {
        return Response.json({ error: 'A valid Lineup Lab result summary is required.' }, { status: 400 });
      }
      const upstream = await fetch(SHARE_URL, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: SHARE_PUBLIC_KEY, Authorization: `Bearer ${SHARE_PUBLIC_KEY}` },
        body: JSON.stringify({ summary: payload.summary, share_method: payload.share_method }),
      });
      return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const path = safePath(body.path ?? url.searchParams.get('path'));
    if (!path) return Response.json({ error: 'Unknown Lineup Lab data path.' }, { status: 400 });
    const encoded = body.responseFormat === 'base64';
    const offset = body.offset ?? 0;
    if (encoded && (!Number.isSafeInteger(offset) || offset < 0 || offset > 300 * 1024 * 1024)) {
      return Response.json({ error: 'Invalid source byte range.' }, { status: 400 });
    }
    const isWrite = req.method === 'POST' && !body.path;
    if (isWrite && !path.startsWith('/tools/shared-result/')) {
      return Response.json({ error: 'Relay writes are limited to shared results.' }, { status: 400 });
    }
    // Byte offsets and integrity pins refer to decoded source bytes, not gzip.
    const headers = new Headers({ accept: 'application/json, */*', 'accept-encoding': 'identity' });
    if (encoded) headers.set('range', sourceRange(offset));
    if (isWrite && req.headers.get('content-type')) headers.set('content-type', req.headers.get('content-type'));
    const upstream = await fetch(SITE + path, {
      method: isWrite ? 'POST' : 'GET', headers,
      body: isWrite ? await req.arrayBuffer() : undefined, cache: 'no-store',
    });
    const pathname = new URL(path, SITE).pathname;
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    if (!upstream.ok) return Response.json({ error: `The Lineup Lab source is unavailable (${upstream.status}).` }, { status: upstream.status });
    if (/\.(js|css|json)$/.test(pathname) && contentType.includes('text/html')) {
      return Response.json({ error: 'The Lineup Lab source is temporarily unavailable.' }, { status: 503 });
    }
    if (encoded) return Response.json(await sourceBytes(upstream, offset), { headers: { 'cache-control': 'no-store' } });
    return new Response(upstream.body, { status: upstream.status, headers: {
      'content-type': contentType, 'cache-control': 'no-store', 'access-control-allow-origin': '*',
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'The Lineup Lab data relay failed.' }, { status: 502 });
  }
}
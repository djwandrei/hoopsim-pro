/**
 * Relay for the Interactive Playbook's play/animation dictionary (a public
 * markdown file on this app's media storage). The server fetches it with a
 * hard timeout and a bounded size, validates it is the play library and not
 * an error page, and serves every visitor from a TTL cache — so a library
 * load is one fast validated response instead of a raw browser fetch.
 */
const LIBRARY_URL = 'https://media.base44.com/files/public/6abc41d86dabd382371f49ea/0c38efcba_basketball_play_animation_library.md';
const MAX_BYTES = 3 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

let cache = null; // { at, markdown }

export default async function(req) {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405, headers: CORS });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return Response.json({ markdown: cache.markdown, cached: true }, { headers: CORS });
    }
    const response = await fetch(LIBRARY_URL, { signal: AbortSignal.timeout(20000), redirect: 'manual' });
    if (!response.ok) {
      return Response.json({ error: `The play library is unavailable (${response.status}).` }, { status: 502, headers: CORS });
    }
    const markdown = await response.text();
    if (!markdown || markdown.length > MAX_BYTES) {
      return Response.json({ error: 'The play library failed its size check.' }, { status: 502, headers: CORS });
    }
    const looksLikeLibrary = /^# /.test(markdown) || markdown.includes('\n# ');
    if (/<!DOCTYPE|<html/i.test(markdown.slice(0, 300)) || !looksLikeLibrary) {
      return Response.json({ error: 'The play library is not a play library.' }, { status: 502, headers: CORS });
    }
    cache = { at: Date.now(), markdown };
    return Response.json({ markdown, cached: false }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: error?.message || 'The play library could not be loaded.' }, { status: 502, headers: CORS });
  }
}
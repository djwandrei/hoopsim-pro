import { secrets } from 'base44:runtime';

/**
 * Relay for the site's private SwishIQ game evaluator edge function. The
 * evaluator rejects browser calls from non-site origins, so the hosted studio
 * preview must relay through this function. It only forwards the exact
 * swishiq-game-evaluate request envelope; nothing else.
 */
export default async function(req) {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405 });
    const rawUrl = secrets.get('SWISHIQ_EVALUATOR_URL');
    const key = secrets.get('SWISHIQ_EVALUATOR_KEY');
    if (!rawUrl || !key) {
      return Response.json({ error: 'The SwishIQ game evaluator is not configured yet. Add SWISHIQ_EVALUATOR_URL and SWISHIQ_EVALUATOR_KEY in the app dashboard Secrets page.' }, { status: 503 });
    }
    // Accept either the full function URL or the bare Supabase project URL.
    const EVALUATOR_PATH = '/functions/v1/swishiq-game-evaluate';
    let url;
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.pathname === '/' || parsed.pathname === '') parsed.pathname = EVALUATOR_PATH;
      url = parsed.href;
    } catch {
      return Response.json({ error: 'SWISHIQ_EVALUATOR_URL is not a valid URL.' }, { status: 503 });
    }
    const request = await req.json();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return Response.json({ error: error.message || 'The SwishIQ game evaluator is unavailable.' }, { status: 502 });
  }
}
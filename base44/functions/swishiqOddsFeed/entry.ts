/**
 * Relay for the live sportsbook odds feed, basketball_nba.
 * kind 'odds'   → upcoming games with moneyline / spread / total prices
 * kind 'scores' → completed games, used by the Book Room to settle bets.
 * Source: ESPN's keyless public scoreboard feed — no API key, no quota.
 */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// The relay serves public odds data but spends the app's paid API quota, so
// it is throttled per caller IP: a sliding 60-second window, best-effort
// (in-memory) since the relay itself is stateless.
const RATE_WINDOW_MS = 60000;
const RATE_MAX_CALLS = 30;
const rateHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter(ts => now - ts < RATE_WINDOW_MS);
  hits.push(now);
  rateHits.set(ip, hits);
  if (rateHits.size > 1000) for (const [key, times] of rateHits) if (times.every(ts => now - ts >= RATE_WINDOW_MS)) rateHits.delete(key);
  return hits.length > RATE_MAX_CALLS;
}

// --- ESPN scoreboard source (public JSON, no API key needed) ---
function espnPrice(raw) {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/^[oOuU]/, ''));
  return Number.isFinite(n) ? n : null;
}

function espnBook(event) {
  const odds = event.competitions?.[0]?.odds?.[0];
  if (!odds) return null;
  const ml = odds.moneyline || {}, ps = odds.pointSpread || {}, total = odds.total || {};
  const line = obj => espnPrice(obj?.close?.line);
  const price = obj => espnPrice(obj?.close?.odds);
  const homeSpreadLine = line(ps.home), awaySpreadLine = line(ps.away), overLine = line(total.over);
  return {
    key: (odds.provider?.name || 'espn').toLowerCase().replace(/[^a-z]+/g, '-'),
    title: odds.provider?.name || 'ESPN',
    lastUpdate: odds.lastUpdate,
    moneyline: { home: price(ml.home), away: price(ml.away) },
    spreads: {
      home: homeSpreadLine != null && price(ps.home) != null ? { point: homeSpreadLine, price: price(ps.home) } : undefined,
      away: awaySpreadLine != null && price(ps.away) != null ? { point: awaySpreadLine, price: price(ps.away) } : undefined,
    },
    total: overLine != null ? { point: overLine, over: price(total.over), under: price(total.under) } : null,
  };
}

function espnGames(events) {
  const games = [];
  for (const event of events || []) {
    if (event.status?.type?.completed) continue; // finals come from kind 'scores'
    const comp = event.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home')?.team?.displayName;
    const away = comp.competitors?.find(c => c.homeAway === 'away')?.team?.displayName;
    if (!home || !away) continue;
    const book = espnBook(event);
    if (book && (book.moneyline.home != null || book.spreads.home || book.total)) games.push({ eventKey: event.id, commenceTime: event.date, home, away, books: [book] });
  }
  return games;
}

function espnFinals(events) {
  const finals = [];
  for (const event of events || []) {
    if (!event.status?.type?.completed) continue;
    const comp = event.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    const homeScore = Number(home?.score), awayScore = Number(away?.score);
    if (!home?.team || !away?.team || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    finals.push({ eventKey: event.id, home: home.team.displayName, away: away.team.displayName, homeScore, awayScore });
  }
  return finals;
}

async function espnScoreboard(daysBack) {
  const events = [];
  for (let offset = 0; offset <= daysBack; offset++) {
    const date = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const payload = await res.json();
      events.push(...(payload.events || []));
    } catch { /* a missed day doesn't sink the feed */ }
  }
  return events;
}

export default async function(req) {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (req.method !== 'POST') return Response.json({ error: 'POST only.' }, { status: 405, headers: CORS });
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return Response.json({ error: 'Too many refreshes — the odds feed is cooling down for a minute.', code: 'rate_limited' }, { status: 429, headers: CORS });
    }
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'scores' ? 'scores' : 'odds';
    const events = await espnScoreboard(kind === 'scores' ? 2 : 0);
    if (kind === 'scores') return Response.json({ finals: espnFinals(events), quota: null }, { headers: CORS });
    return Response.json({ games: espnGames(events), quota: null }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: error?.message || 'The odds feed is unavailable.', code: 'odds_feed_error' }, { status: 502, headers: CORS });
  }
}
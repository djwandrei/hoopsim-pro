import { secrets } from 'base44:runtime';

/**
 * Relay for the live sportsbook odds feed (The Odds API, basketball_nba).
 * kind 'odds'   → upcoming games with best-of books moneyline / spread / total
 * kind 'scores' → completed games, used by the Book Room to settle bets.
 * The function degrades gracefully while ODDS_API_KEY is not configured.
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

function parseBooks(event) {
  const rows = [];
  for (const book of event.bookmakers || []) {
    const row = { key: book.key, title: book.title, lastUpdate: book.last_update, moneyline: {}, spreads: {}, total: null };
    for (const market of book.markets || []) {
      if (market.key === 'h2h') {
        for (const outcome of market.outcomes || []) {
          if (outcome.name === event.home_team) row.moneyline.home = outcome.price;
          else if (outcome.name === event.away_team) row.moneyline.away = outcome.price;
        }
      } else if (market.key === 'spreads') {
        for (const outcome of market.outcomes || []) {
          const side = outcome.name === event.home_team ? 'home' : outcome.name === event.away_team ? 'away' : null;
          if (side) row.spreads[side] = { point: outcome.point, price: outcome.price };
        }
      } else if (market.key === 'totals') {
        for (const outcome of market.outcomes || []) {
          if (!row.total) row.total = {};
          if (outcome.name === 'Over') { row.total.point = outcome.point; row.total.over = outcome.price; }
          else if (outcome.name === 'Under') { row.total.point = outcome.point; row.total.under = outcome.price; }
        }
      }
    }
    rows.push(row);
  }
  return rows;
}

function parseScores(payload) {
  const finals = [];
  for (const event of payload || []) {
    if (!event.completed) continue;
    const scoreOf = team => event.scores?.find(score => score.name === team)?.points ?? null;
    finals.push({ eventKey: event.id, home: event.home_team, away: event.away_team, homeScore: scoreOf(event.home_team), awayScore: scoreOf(event.away_team) });
  }
  return finals;
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
    const apiKey = secrets.get('ODDS_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'The live odds feed is not connected yet. Add ODDS_API_KEY in the app dashboard Secrets page (free key at theoddsapi.com).', code: 'odds_feed_not_configured' }, { status: 503, headers: CORS });
    }
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind === 'scores' ? 'scores' : 'odds';
    const url = kind === 'scores'
      ? `https://api.the-odds-api.com/v4/sports/basketball_nba/scores/?apiKey=${encodeURIComponent(apiKey)}&daysFrom=3`
      : `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return Response.json({ error: `The odds feed returned ${response.status}. ${detail.slice(0, 200)}`.trim(), code: 'odds_feed_error' }, { status: 502, headers: CORS });
    }
    const payload = await response.json();
    const quota = response.headers.get('x-requests-remaining');
    if (kind === 'scores') return Response.json({ finals: parseScores(payload), quota }, { headers: CORS });
    return Response.json({
      games: (payload || []).map(event => ({ eventKey: event.id, commenceTime: event.commence_time, home: event.home_team, away: event.away_team, books: parseBooks(event) })),
      quota,
    }, { headers: CORS });
  } catch (error) {
    return Response.json({ error: error?.message || 'The odds feed is unavailable.', code: 'odds_feed_error' }, { status: 502, headers: CORS });
  }
}
/**
 * Relay for the live sportsbook odds feed, basketball_nba.
 * kind 'odds'   → upcoming games with moneyline / spread / total prices
 * kind 'props'  → per-player points milestones for upcoming games
 * kind 'scores' → completed games, used by the Book Room to settle bets.
 * Source: ESPN's keyless public scoreboard feed — no API key, no quota.
 */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// The relay serves public odds data but hammers ESPN across many requests per
// call, so it is throttled per caller IP: a sliding 60-second window,
// best-effort (in-memory) since the relay itself is stateless.
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

// Per-kind response caches: concurrent callers and quick retries replay a
// fresh-enough snapshot instead of repeating the multi-request ESPN fan-out.
const FEED_TTL_MS = { odds: 45000, props: 120000, scores: 30000 };
const feedCaches = new Map();

// Shared JSON helper: a non-JSON body (HTML error page) or a dropped request
// reads as null — never a thrown parse error.
async function getJSON(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Bounded-concurrency map: keeps the ESPN fan-out wide but never wider than
// the limit, preserving input order in the results.
async function mapWithConcurrency(list, limit, worker) {
  const results = new Array(list.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, list.length || 0) }, async () => {
    while (next < list.length) {
      const index = next;
      next += 1;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
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

async function espnFinals(events) {
  const finals = [];
  let boxes = 0;
  // Box-score rides: fetched with bounded concurrency — a heavy slate no
  // longer settles game-by-game in series.
  const pending = (events || []).map(async event => {
    if (!event.status?.type?.completed) return null;
    const comp = event.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    const homeScore = Number(home?.score), awayScore = Number(away?.score);
    if (!home?.team || !away?.team || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
    const final = { eventKey: event.id, home: home.team.displayName, away: away.team.displayName, homeScore, awayScore };
    if (boxes < 12) {
      boxes += 1;
      final.pointsByPlayer = await espnBoxPoints(event);
    }
    return final;
  });
  return (await Promise.all(pending)).filter(Boolean);
}

// Player prop milestones from ESPN's core odds feed — athlete-scoped
// "Points Milestones" (e.g. Julius Randle 10+ points at -209), grouped per
// player per game. Keyless, same source as the game odds. Games are read with
// bounded concurrency; each game's board items are read the same way.
async function espnProps(events) {
  const live = (events || []).filter(event => !event.status?.type?.completed);
  const games = await mapWithConcurrency(live, 3, async event => {
    const comp = event.competitions?.[0] || {};
    const home = comp.competitors?.find(c => c.homeAway === 'home')?.team?.displayName;
    const away = comp.competitors?.find(c => c.homeAway === 'away')?.team?.displayName;
    if (!home || !away) return null;
    try {
      const odds = await getJSON(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${event.id}/competitions/${event.id}/odds`);
      const first = odds?.items?.[0] || odds;
      if (!first?.propBets?.$ref) return null;
      const board = await getJSON(first.propBets.$ref);
      if (!board) return null;
      const names = new Map();
      const byPlayer = new Map();
      await mapWithConcurrency(board?.items || [], 4, async item => {
        const full = item.$ref ? await getJSON(item.$ref) : item;
        if (!full || full.type?.name !== 'Points Milestones') return;
        if (!names.has(full.athlete?.$ref)) {
          const athlete = full.athlete?.$ref ? await getJSON(full.athlete.$ref) : null;
          names.set(full.athlete?.$ref, athlete?.displayName || null);
        }
        const player = names.get(full.athlete?.$ref);
        const line = parseInt(String(full.odds?.total?.value ?? full.current?.target?.displayValue ?? ''), 10);
        const price = espnPrice(full.odds?.american?.value);
        if (!player || !Number.isFinite(line) || price == null) return;
        const entry = byPlayer.get(player) || { player, options: [] };
        if (!entry.options.some(option => option.line === line)) entry.options.push({ line, price });
        byPlayer.set(player, entry);
      });
      const props = [...byPlayer.values()];
      return props.length ? { eventKey: event.id, commenceTime: event.date, home, away, props } : null;
    } catch { return null; /* a game without props doesn't sink the feed */ }
  });
  return games.filter(Boolean);
}

// Per-player points from the official box score of a finished game, keyed by
// the athlete's display name — used to settle "N+ points" prop legs.
async function espnBoxPoints(event) {
  try {
    const sum = await getJSON(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${event.id}&region=us&lang=en&contentorigin=espn`);
    const points = {};
    for (const team of sum?.boxscore?.players || []) {
      for (const group of team.statistics || []) {
        const labels = group.labels || group.keys || [];
        const ptsIndex = labels.findIndex(label => /^(pts|points)$/i.test(String(label)));
        if (ptsIndex < 0) continue;
        for (const entry of group.athletes || []) {
          const name = entry.athlete?.displayName;
          const pts = Number(entry.stats?.[ptsIndex]);
          if (name && Number.isFinite(pts) && points[name] == null) points[name] = pts;
        }
      }
    }
    return points;
  } catch { return {}; }
}

async function espnScoreboard(daysBack) {
  // The daily boards are independent — read them in parallel, keep date order.
  const dates = Array.from({ length: daysBack + 1 }, (_, offset) =>
    new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10).replace(/-/g, ''));
  const boards = await mapWithConcurrency(dates, 3, async date => {
    const payload = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`);
    return payload?.events || [];
  });
  return boards.flat();
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
    const kind = body?.kind === 'scores' ? 'scores' : body?.kind === 'props' ? 'props' : 'odds';
    const hit = feedCaches.get(kind);
    if (hit && Date.now() - hit.at < FEED_TTL_MS[kind]) return Response.json({ ...hit.payload, cached: true }, { headers: CORS });
    const events = await espnScoreboard(kind === 'scores' ? 2 : 0);
    let payload;
    if (kind === 'scores') payload = { finals: await espnFinals(events), quota: null };
    else if (kind === 'props') payload = { games: await espnProps(events), quota: null };
    else payload = { games: espnGames(events), quota: null };
    feedCaches.set(kind, { at: Date.now(), payload });
    return Response.json(payload, { headers: CORS });
  } catch (error) {
    return Response.json({ error: error?.message || 'The odds feed is unavailable.', code: 'odds_feed_error' }, { status: 502, headers: CORS });
  }
}
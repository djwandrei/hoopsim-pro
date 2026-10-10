const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const ESPN_TEAM_CODE_ALIASES = Object.freeze({ GS: 'GSW', NO: 'NOP', NY: 'NYK', PHO: 'PHX', SA: 'SAS', WSH: 'WAS' });
const ESPN_CORE_URL = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const MILESTONE_STATS = Object.freeze({
  'Points Milestones': { key: 'points', label: 'Points', short: 'pts' },
  'Rebounds Milestones': { key: 'rebounds', label: 'Rebounds', short: 'reb' },
  'Assists Milestones': { key: 'assists', label: 'Assists', short: 'ast' },
  '3-Point Field Goals Milestones': { key: 'threes', label: 'Made threes', short: '3PM' },
});
const athleteCache = new Map();

const localDateKey = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('');

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.replace(/^\+/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function marketPrice(entry) {
  return numeric(entry?.close?.odds) ?? numeric(entry?.open?.odds);
}

function marketLine(entry) {
  const value = entry?.close?.line ?? entry?.open?.line;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = Number(value.replace(/^[ou]/i, '').replace(/^\+/, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapBook(odds, index) {
  const spreadHome = odds?.pointSpread?.home;
  const spreadAway = odds?.pointSpread?.away;
  const totalOver = odds?.total?.over;
  const totalUnder = odds?.total?.under;
  const overLine = marketLine(totalOver);
  const underLine = marketLine(totalUnder);
  const fallbackTotal = numeric(odds?.overUnder);
  const book = {
    key: String(odds?.provider?.id || odds?.provider?.name || `espn-book-${index}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    providerId: String(odds?.provider?.id || ''),
    title: odds?.provider?.name || 'ESPN odds feed',
    lastUpdate: odds?.lastUpdated || null,
    moneyline: {
      home: marketPrice(odds?.moneyline?.home),
      away: marketPrice(odds?.moneyline?.away),
    },
    spreads: {
      home: { point: marketLine(spreadHome), price: marketPrice(spreadHome) },
      away: { point: marketLine(spreadAway), price: marketPrice(spreadAway) },
    },
    total: {
      point: overLine ?? underLine ?? fallbackTotal,
      over: { line: overLine ?? fallbackTotal, price: marketPrice(totalOver) },
      under: { line: underLine ?? fallbackTotal, price: marketPrice(totalUnder) },
    },
  };
  const hasPrice = Object.values(book.moneyline).some(value => Number.isFinite(value))
    || Object.values(book.spreads).some(value => Number.isFinite(value?.price) && Number.isFinite(value?.point))
    || Object.values(book.total).some(value => value && typeof value === 'object' && Number.isFinite(value.price) && Number.isFinite(value.line));
  return hasPrice ? book : null;
}

export function mapESPNScoreboard(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.flatMap(event => {
    const competition = event?.competitions?.[0];
    const competitors = competition?.competitors || [];
    const home = competitors.find(team => team.homeAway === 'home')?.team;
    const away = competitors.find(team => team.homeAway === 'away')?.team;
    const commenceTime = competition?.date || event?.date;
    if (!event?.id || !home?.displayName || !away?.displayName || !commenceTime) return [];

    const books = (Array.isArray(competition?.odds) ? competition.odds : [])
      .map(mapBook)
      .filter(Boolean);
    if (!books.length) return [];

    const status = competition?.status?.type?.name || event?.status?.type?.name || '';
    return [{
      eventKey: String(event.id),
      competitionId: String(competition?.id || event.id),
      commenceTime,
      home: home.displayName,
      away: away.displayName,
      homeCode: ESPN_TEAM_CODE_ALIASES[home.abbreviation] || home.abbreviation || '',
      awayCode: ESPN_TEAM_CODE_ALIASES[away.abbreviation] || away.abbreviation || '',
      status,
      statusDetail: competition?.status?.type?.detail || event?.status?.type?.detail || '',
      books,
      props: [],
    }];
  });
}

async function espnJSON(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`ESPN player props returned HTTP ${response.status}.`);
  return response.json();
}

async function mapConcurrent(items, mapper) {
  const result = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      result[current] = await mapper(items[current]);
    }
  }));
  return result;
}

async function athleteIdentity(reference, signal) {
  const url = new URL(reference);
  if (url.hostname !== 'sports.core.api.espn.com'
    || !/^\/v2\/sports\/basketball\/leagues\/nba\/(?:seasons\/\d+\/)?athletes\/\d+$/.test(url.pathname)) return null;
  url.protocol = 'https:';
  const key = url.href;
  const cached = athleteCache.get(key);
  if (cached && Date.now() - cached.at < 3_600_000) return cached.value;
  const identity = await espnJSON(key, signal);
  const value = { id: String(identity.id || ''), name: identity.displayName || identity.fullName || '' };
  if (!value.id || !value.name) return null;
  athleteCache.set(key, { at: Date.now(), value });
  return value;
}

// ESPN's separate provider feed carries player milestones; the scoreboard
// carries only game lines. Fetch props when a player opens a game's section.
export async function fetchESPNPlayerProps(game, { signal } = {}) {
  const eventId = String(game?.eventKey || '');
  const competitionId = String(game?.competitionId || eventId);
  if (!/^\d+$/.test(eventId) || !/^\d+$/.test(competitionId)) return [];
  const books = (game.books || []).filter(book => /^\d+$/.test(book.providerId));
  const records = (await mapConcurrent(books, async book => {
    const url = new URL(`${ESPN_CORE_URL}/events/${eventId}/competitions/${competitionId}/odds/${book.providerId}/propBets`);
    url.searchParams.set('lang', 'en');
    url.searchParams.set('region', 'us');
    url.searchParams.set('limit', '100');
    const rows = [];
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      url.searchParams.set('page', String(page));
      const data = await espnJSON(url, signal);
      pages = Number(data.pageCount || 1);
      if (!Number.isInteger(pages) || pages < 0 || pages > 20) throw new Error('ESPN player props pagination is unavailable.');
      for (const record of data.items || []) {
        if (record.athlete?.$ref && MILESTONE_STATS[record.type?.name]) rows.push({ ...record, book });
      }
    }
    return rows;
  })).flat();
  const references = [...new Set(records.map(record => record.athlete.$ref))];
  const identities = new Map(await mapConcurrent(references, async reference => [reference, await athleteIdentity(reference, signal)]));
  const groups = new Map();
  for (const record of records) {
    const athlete = identities.get(record.athlete.$ref);
    const stat = MILESTONE_STATS[record.type.name];
    const line = numeric(record.current?.target?.value);
    const price = numeric(record.odds?.american?.value);
    if (!athlete || !Number.isInteger(line) || line < 1 || !Number.isFinite(price) || price === 0) continue;
    const key = `${athlete.id}-${stat.key}`;
    if (!groups.has(key)) groups.set(key, { player: athlete.name, athleteId: athlete.id, stat: stat.key, statLabel: stat.label, statShort: stat.short, options: [] });
    const entry = groups.get(key);
    if (!entry.options.some(option => option.line === line && option.bookKey === record.book.key)) {
      entry.options.push({ line, price, book: record.book.title, bookKey: record.book.key, lastUpdated: record.lastUpdated || null });
    }
  }
  return [...groups.values()].sort((a, b) => a.player.localeCompare(b.player) || a.statLabel.localeCompare(b.statLabel)).map(entry => ({
    ...entry, options: entry.options.sort((a, b) => a.line - b.line || b.price - a.price),
  }));
}

export async function fetchESPNOdds({ signal, now = new Date() } = {}) {
  const date = localDateKey(now);
  const url = new URL(ESPN_SCOREBOARD_URL);
  url.searchParams.set('dates', date);
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`ESPN odds feed returned HTTP ${response.status}.`);
  const payload = await response.json();
  return mapESPNScoreboard(payload);
}

export { ESPN_SCOREBOARD_URL, localDateKey, marketLine, marketPrice };

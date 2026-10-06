import React from 'react';
import { CalendarClock, RefreshCcw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatOdds, formatCommence, pickKey } from '@/components/book/betsMath';
import { modelEdgePct, CODE_BY_NAME } from '@/lib/bookRoom/modelEdge';
import TeamMark from '@/components/studio/TeamMark';

export function bestMoneyline(books, side) {
  let best = null;
  for (const book of books || []) {
    const price = book.moneyline?.[side];
    if (Number.isFinite(price) && (!best || price > best.price)) best = { price, book: book.title };
  }
  return best;
}
export function bestSpread(books, side) {
  let best = null;
  for (const book of books || []) {
    const offer = book.spreads?.[side];
    if (offer && Number.isFinite(offer.price) && (!best || offer.price > best.price)) best = { ...offer, book: book.title };
  }
  return best;
}
export function bestTotal(books, pick) {
  let best = null;
  for (const book of books || []) {
    const total = book.total;
    if (!total || !Number.isFinite(total[pick])) continue;
    if (!best || total[pick] > best.price) best = { price: total[pick], line: total.point, book: book.title };
  }
  return best;
}

// Live price for a leg, used for early cash-out (real market, never boosted).
export function bestPriceFor(game, leg) {
  const books = game?.books || [];
  if (leg.market === 'moneyline') return bestMoneyline(books, leg.pickSide)?.price ?? null;
  if (leg.market === 'spread') return bestSpread(books, leg.pickSide)?.price ?? null;
  if (leg.market === 'total') return bestTotal(books, leg.totalPick)?.price ?? null;
  return null;
}

// Every priceable pick on a game, keyed by pickKey — used for movement diffs.
export function gamePrices(game) {
  const prices = {};
  const put = (market, side, offer) => { if (offer) prices[pickKey(game.eventKey, market, side)] = offer; };
  put('moneyline', 'home', bestMoneyline(game.books, 'home'));
  put('moneyline', 'away', bestMoneyline(game.books, 'away'));
  put('spread', 'home', bestSpread(game.books, 'home'));
  put('spread', 'away', bestSpread(game.books, 'away'));
  put('total', 'over', bestTotal(game.books, 'over'));
  put('total', 'under', bestTotal(game.books, 'under'));
  return prices;
}

// Distinct bookmakers across the board, for the line-shopping filter.
export function bookOptions(games) {
  const options = [];
  for (const game of games || []) for (const book of game.books || []) if (!options.some(option => option.key === book.key)) options.push({ key: book.key, title: book.title });
  return options;
}

function PriceButton({ label, offer, format, edge, onPick }) {
  if (!offer) return <div className="grid h-11 place-items-center rounded-lg border border-dashed border-border/40 text-[11px] text-muted-foreground">—</div>;
  return <button type="button" onClick={onPick} className="flex h-11 min-w-0 items-center gap-1.5 rounded-lg border border-border/50 bg-raised/50 px-2 text-left transition-all hover:border-gold/60 hover:bg-gold/10">
    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">{label}</span>
    {Number.isFinite(edge) && Math.abs(edge) >= 2 && <span className={`shrink-0 font-mono text-[10px] ${edge >= 3 ? 'text-positive' : edge <= -3 ? 'text-trim-ink' : 'text-muted-foreground'}`} title="Studio model edge vs this price">{edge >= 0 ? '+' : ''}{edge.toFixed(1)}</span>}
    {offer.trend === 'up' && <ArrowUpRight className="h-3 w-3 shrink-0 text-positive" aria-label="Price moved up" />}
    {offer.trend === 'down' && <ArrowDownRight className="h-3 w-3 shrink-0 text-trim-ink" aria-label="Price moved down" />}
    {offer.boosted && <span className="shrink-0 rounded bg-gold/25 px-1 py-px font-mono text-[9px] font-bold text-gold" title="Daily odds boost">B</span>}
    <span className="shrink-0 font-mono text-xs font-bold text-gold">{formatOdds(offer.price, format)}</span>
  </button>;
}

function TeamLine({ code, name }) {
  return <div className="flex items-center gap-2">
    <TeamMark code={code} name={name} className="h-8 w-8 text-[11px]" />
    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{name}</span>
  </div>;
}

function MarketColumn({ label, picks }) {
  return <div className="space-y-1.5">
    <p className="text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    {picks.map((pick, index) => <PriceButton key={index} {...pick} />)}
  </div>;
}

// The odds board: sportsbook-style game cards — teams left, three dense
// market columns right, live pricing, movement arrows, book shopping and
// inline studio-model edge chips on every price.
export default function OddsBoard({ games, quota, movement, boosts, format, model, bookFilter, onBookFilter, onPick, onRefresh, loading }) {
  const now = Date.now();
  const live = games.filter(game => Date.parse(game.commenceTime) <= now);
  const upcoming = games.filter(game => Date.parse(game.commenceTime) > now);
  const renderGame = game => {
    const books = (game.books || []).filter(book => !bookFilter || book.key === bookFilter);
    const modelData = model?.byEvent?.[game.eventKey];
    const apply = (market, side, offer) => {
      if (!offer) return null;
      const key = pickKey(game.eventKey, market, side);
      const boosted = boosts?.[key];
      return { ...offer, price: Number.isFinite(boosted) ? boosted : offer.price, boosted: Number.isFinite(boosted), key, trend: movement?.[key] || null };
    };
    const edgeFor = (market, side, offer) => {
      if (!modelData || !offer || !Number.isFinite(Number(offer.price))) return null;
      const leg = { market, eventKey: game.eventKey, ...(market === 'total' ? { totalPick: side } : { pickSide: side }), ...(offer.line != null ? { line: offer.line } : {}) };
      return modelEdgePct(modelData, leg, Number(offer.price));
    };
    const build = (market, side, offer, label) => offer ? {
      label, offer, edge: edgeFor(market, side, offer),
      onPick: () => onPick({ eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime, market, ...(market === 'total' ? { totalPick: side } : { pickSide: side }), label, ...(offer.line != null ? { line: offer.line } : {}), price: offer.price, book: offer.book }),
    } : null;
    const homeCode = CODE_BY_NAME[game.home], awayCode = CODE_BY_NAME[game.away];
    const awayMl = apply('moneyline', 'away', bestMoneyline(books, 'away'));
    const homeMl = apply('moneyline', 'home', bestMoneyline(books, 'home'));
    const awaySpread = apply('spread', 'away', bestSpread(books, 'away'));
    const homeSpread = apply('spread', 'home', bestSpread(books, 'home'));
    const over = apply('total', 'over', bestTotal(books, 'over'));
    const under = apply('total', 'under', bestTotal(books, 'under'));
    const gameLive = Date.parse(game.commenceTime) <= now;
    return <article key={game.eventKey} className="court-panel p-4">
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr] sm:gap-5">
        <div className="space-y-2">
          <TeamLine code={awayCode} name={game.away} />
          <TeamLine code={homeCode} name={game.home} />
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          <MarketColumn label="Moneyline" picks={[awayMl && { label: awayCode, offer: awayMl, format, edge: edgeFor('moneyline', 'away', awayMl), onPick: build('moneyline', 'away', awayMl, `${game.away} ML`).onPick }, homeMl && { label: homeCode, offer: homeMl, format, edge: edgeFor('moneyline', 'home', homeMl), onPick: build('moneyline', 'home', homeMl, `${game.home} ML`).onPick }].filter(Boolean)} />
          <MarketColumn label="Spread" picks={[awaySpread && { label: `${awayCode} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`, offer: awaySpread, format, edge: edgeFor('spread', 'away', awaySpread), onPick: build('spread', 'away', awaySpread, `${game.away} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`).onPick }, homeSpread && { label: `${homeCode} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`, offer: homeSpread, format, edge: edgeFor('spread', 'home', homeSpread), onPick: build('spread', 'home', homeSpread, `${game.home} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`).onPick }].filter(Boolean)} />
          <MarketColumn label="Total" picks={[over && { label: `O ${over.line}`, offer: over, format, edge: edgeFor('total', 'over', over), onPick: build('total', 'over', over, `Over ${over.line}`).onPick }, under && { label: `U ${under.line}`, offer: under, format, edge: edgeFor('total', 'under', under), onPick: build('total', 'under', under, `Under ${under.line}`).onPick }].filter(Boolean)} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/30 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
          {gameLive && <><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-trim" aria-hidden="true" /><span className="font-semibold uppercase tracking-widest text-trim-ink">Live</span></>}
          <CalendarClock className="h-3 w-3" aria-hidden="true" />{formatCommence(game.commenceTime)}
        </span>
        <span>{books.length} book{books.length === 1 ? '' : 's'}{modelData ? ' · simmed' : ''}</span>
      </div>
    </article>;
  };
  return <section className="space-y-4" aria-label="Odds board">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="bcast-kicker mb-1">Live feed · {bookFilter ? 'your book' : 'best price per side'}</p><h2 className="font-display text-xl tracking-wide text-foreground">THE BOARD</h2></div>
      <div className="flex items-center gap-2">
        <select className="studio-select w-auto" value={bookFilter} aria-label="Shop lines by book" onChange={event => onBookFilter(event.target.value)}>
          <option value="">All books (best price)</option>
          {bookOptions(games).map(book => <option key={book.key} value={book.key}>{book.title}</option>)}
        </select>
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{quota != null ? `${quota} feed calls left` : 'Real sportsbook prices'}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
        </button>
      </div>
    </div>
    {live.length > 0 && <div>
      <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-trim-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-trim" aria-hidden="true" />Live now · {live.length}</p>
      <div className="space-y-3">{live.map(renderGame)}</div>
    </div>}
    {upcoming.length > 0 && <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Upcoming · {upcoming.length}</p>
      <div className="space-y-3">{upcoming.map(renderGame)}</div>
    </div>}
    {games.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No NBA games on the board right now.</div>}
  </section>;
}
import React from 'react';
import { CalendarClock, RefreshCcw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatOdds, formatCommence, pickKey } from '@/components/book/betsMath';

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

function PickButton({ label, offer, format, onPick }) {
  return <button type="button" onClick={onPick} className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg border border-border/50 bg-raised/40 px-3 py-2 text-left transition-colors hover:border-gold/50 hover:bg-gold/10">
    <span className="flex w-full items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">{label}</span>
      {offer.trend === 'up' && <ArrowUpRight className="h-3 w-3 shrink-0 text-positive" aria-label="Price moved up" />}
      {offer.trend === 'down' && <ArrowDownRight className="h-3 w-3 shrink-0 text-trim-ink" aria-label="Price moved down" />}
      {offer.boosted && <span className="shrink-0 rounded border border-gold/60 bg-gold/20 px-1 py-px text-[9px] font-bold uppercase text-gold">Boost</span>}
    </span>
    <span className="font-mono text-xs font-semibold text-gold">{formatOdds(offer.price, format)}{offer.book && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{offer.book}</span>}</span>
  </button>;
}

// The odds board: live and upcoming NBA games with the best available price
// per side, line shopping by bookmaker, movement arrows and a daily boost.
export default function OddsBoard({ games, quota, movement, boosts, format, bookFilter, onBookFilter, onPick, onRefresh, loading }) {
  const now = Date.now();
  const live = games.filter(game => Date.parse(game.commenceTime) <= now);
  const upcoming = games.filter(game => Date.parse(game.commenceTime) > now);
  const renderGame = game => {
    const books = (game.books || []).filter(book => !bookFilter || book.key === bookFilter);
    const apply = (market, side, offer) => {
      if (!offer) return null;
      const key = pickKey(game.eventKey, market, side);
      const boosted = boosts?.[key];
      return { ...offer, price: Number.isFinite(boosted) ? boosted : offer.price, boosted: Number.isFinite(boosted), key, trend: movement?.[key] || null };
    };
    const homeMl = apply('moneyline', 'home', bestMoneyline(books, 'home'));
    const awayMl = apply('moneyline', 'away', bestMoneyline(books, 'away'));
    const homeSpread = apply('spread', 'home', bestSpread(books, 'home'));
    const awaySpread = apply('spread', 'away', bestSpread(books, 'away'));
    const over = apply('total', 'over', bestTotal(books, 'over'));
    const under = apply('total', 'under', bestTotal(books, 'under'));
    const base = { eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime };
    return <article key={game.eventKey} className="court-panel p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg tracking-wide text-foreground">{game.away} <span className="text-muted-foreground">@</span> {game.home}</h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {Date.parse(game.commenceTime) <= now && <><span className="h-2 w-2 animate-pulse rounded-full bg-trim" aria-hidden="true" /><span className="text-trim-ink">Live</span></>}
          <CalendarClock className="h-3 w-3" aria-hidden="true" />{formatCommence(game.commenceTime)}
        </span>
      </header>
      {books.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{bookFilter ? 'Your selected book has no prices for this game.' : 'No books have posted prices for this game yet.'}</p> :
        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Moneyline</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <PickButton label={game.home} offer={homeMl} format={format} onPick={() => onPick({ ...base, market: 'moneyline', pickSide: 'home', label: `${game.home} ML`, price: homeMl.price, book: homeMl.book })} />
              <PickButton label={game.away} offer={awayMl} format={format} onPick={() => onPick({ ...base, market: 'moneyline', pickSide: 'away', label: `${game.away} ML`, price: awayMl.price, book: awayMl.book })} />
            </div>
          </div>
          {(homeSpread || awaySpread) && <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Spread</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {homeSpread && <PickButton label={`${game.home} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`} offer={homeSpread} format={format} onPick={() => onPick({ ...base, market: 'spread', pickSide: 'home', label: `${game.home} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`, line: homeSpread.point, price: homeSpread.price, book: homeSpread.book })} />}
              {awaySpread && <PickButton label={`${game.away} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`} offer={awaySpread} format={format} onPick={() => onPick({ ...base, market: 'spread', pickSide: 'away', label: `${game.away} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`, line: awaySpread.point, price: awaySpread.price, book: awaySpread.book })} />}
            </div>
          </div>}
          {(over || under) && <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {over && <PickButton label={`Over ${over.line}`} offer={over} format={format} onPick={() => onPick({ ...base, market: 'total', totalPick: 'over', label: `Over ${over.line}`, line: over.line, price: over.price, book: over.book })} />}
              {under && <PickButton label={`Under ${under.line}`} offer={under} format={format} onPick={() => onPick({ ...base, market: 'total', totalPick: 'under', label: `Under ${under.line}`, line: under.line, price: under.price, book: under.book })} />}
            </div>
          </div>}
        </div>}
    </article>;
  };
  return <section className="space-y-4" aria-label="Odds board">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="bcast-kicker mb-1">Live feed · {bookFilter ? 'your book' : 'best price per side'}</p><h2 className="font-display text-xl tracking-wide text-foreground">THE BOARD</h2></div>
      <div className="flex items-center gap-3">
        <select className="studio-select w-auto" value={bookFilter} aria-label="Shop lines by book" onChange={event => onBookFilter(event.target.value)}>
          <option value="">All books (best price)</option>
          {(bookOptions(games)).map(book => <option key={book.key} value={book.key}>{book.title}</option>)}
        </select>
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{quota != null ? `${quota} feed calls left` : 'Real sportsbook prices'}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
        </button>
      </div>
    </div>
    {live.length > 0 && <div>
      <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-trim-ink"><span className="h-2 w-2 animate-pulse rounded-full bg-trim" aria-hidden="true" />Live now · {live.length}</p>
      <div className="space-y-4">{live.map(renderGame)}</div>
    </div>}
    {upcoming.length > 0 && <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Upcoming · {upcoming.length}</p>
      <div className="space-y-4">{upcoming.map(renderGame)}</div>
    </div>}
    {games.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No NBA games on the board right now.</div>}
  </section>;
}

// Distinct bookmakers across the board, for the line-shopping filter.
export function bookOptions(games) {
  const options = [];
  for (const game of games || []) for (const book of game.books || []) if (!options.some(option => option.key === book.key)) options.push({ key: book.key, title: book.title });
  return options;
}
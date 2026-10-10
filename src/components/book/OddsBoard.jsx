import React from 'react';
import { CalendarClock, RefreshCcw, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatOdds, formatCommence, pickKey, eventPhase } from '@/components/book/betsMath';
import { CODE_BY_NAME } from '@/lib/bookRoom/modelEdge';
import { buildPriceCell } from '@/lib/bookRoom/oddsCells';
import TeamMark from '@/components/studio/TeamMark';

export function bestMoneyline(books, side) {
  let best = null;
  for (const book of books || []) {
    const price = Number(book.moneyline?.[side]);
    if (Number.isFinite(price) && price !== 0 && (!best || price > best.price)) best = { price, book: book.title || book.key || 'Book not named' };
  }
  return best;
}
export function bestSpread(books, side) {
  const offers = [];
  for (const book of books || []) {
    const offer = book.spreads?.[side];
    const price = Number(offer?.price), point = Number(offer?.point ?? offer?.line);
    if (offer && Number.isFinite(price) && price !== 0 && Number.isFinite(point)) offers.push({ ...offer, price, point, book: book.title || book.key || 'Book not named' });
  }
  if (!offers.length) return null;
  // Compare the most favorable line first, then compare price at that line.
  // Comparing American odds across different spread points can select a worse bet.
  const bestPoint = Math.max(...offers.map(offer => offer.point));
  return offers.filter(offer => Math.abs(offer.point - bestPoint) < 1e-9).reduce((best, offer) => !best || offer.price > best.price ? offer : best, null);
}
export function bestTotal(books, pick) {
  const offers = [];
  for (const book of books || []) {
    const total = book.total;
    if (!total) continue;
    const selected = total[pick];
    const price = Number(selected && typeof selected === 'object' ? selected.price : selected);
    const line = Number((selected && typeof selected === 'object' ? selected.line ?? selected.point : null) ?? total.point ?? total.line);
    if (Number.isFinite(price) && price !== 0 && Number.isFinite(line)) offers.push({ price, line, book: book.title || book.key || 'Book not named' });
  }
  if (!offers.length) return null;
  // The bettor-favorable number is lower for an over and higher for an under.
  const bestLine = pick === 'over' ? Math.min(...offers.map(offer => offer.line)) : Math.max(...offers.map(offer => offer.line));
  return offers.filter(offer => Math.abs(offer.line - bestLine) < 1e-9).reduce((best, offer) => !best || offer.price > best.price ? offer : best, null);
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

const spreadLabel = offer => {
  const point = Number(offer?.point ?? offer?.line);
  return Number.isFinite(point) ? `${point > 0 ? '+' : ''}${point}` : '';
};

// One price cell, sportsbook-style: the pick label sits above the mono price,
// with the model edge, movement arrow and boost chip inline.
function PriceButton({ cell, format, disabled = false }) {
  if (!cell?.offer) return <div className="book-price-btn book-price-btn--empty" role="presentation">—</div>;
  const { label, offer, edge, onPick } = cell;
  return <button type="button" onClick={onPick} disabled={disabled} title={disabled ? 'Wagering is disabled because the current game status is unavailable.' : undefined} className="book-price-btn disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Add ${label} at ${formatOdds(offer.price, format)}`}>
    <span className="book-price-btn__label">
      {label}
      {Number.isFinite(edge) && Math.abs(edge) >= 2 && <span className={edge >= 3 ? 'text-positive' : edge <= -3 ? 'text-trim-ink' : 'text-muted-foreground'} title="Studio model edge vs this price">{edge >= 0 ? '+' : ''}{edge.toFixed(1)}</span>}
    </span>
    <span className="book-price-btn__price">
      {offer.trend === 'up' && <ArrowUpRight className="h-3 w-3 shrink-0 text-positive" aria-label="Price moved up" />}
      {offer.trend === 'down' && <ArrowDownRight className="h-3 w-3 shrink-0 text-trim-ink" aria-label="Price moved down" />}
      {offer.boosted && <span className="book-boost" title="Daily odds boost">B</span>}
      {formatOdds(offer.price, format)}
    </span>
  </button>;
}

function TeamCell({ code, name }) {
  return <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
    <TeamMark code={code} name={name} className="h-7 w-7 shrink-0 text-[10px]" />
    <span className="hidden min-w-0 truncate text-xs font-semibold text-foreground sm:block">{name}</span>
    <span className="truncate text-[11px] font-semibold text-foreground sm:hidden">{code}</span>
  </div>;
}

// The odds board: sportsbook-style game cards — matchup header, then a
// DK/BetMGM-aligned market grid (team rows × ML/Spread/Total columns) with
// live pricing, movement arrows, book shopping and inline model-edge chips.
export default function OddsBoard({ games, quota, movement, boosts, format, model, bookFilter, onBookFilter, onPick, onRefresh, loading }) {
  const now = Date.now();
  const live = games.filter(game => eventPhase(game, now) === 'live');
  const upcoming = games.filter(game => eventPhase(game, now) === 'upcoming');
  const inactive = games.filter(game => !['live', 'upcoming'].includes(eventPhase(game, now)));
  const renderGame = game => {
    const phase = eventPhase(game, now);
    const canBet = phase === 'live' || phase === 'upcoming';
    const books = (game.books || []).filter(book => !bookFilter || book.key === bookFilter);
    const modelData = model?.byEvent?.[game.eventKey];
    const { cell } = buildPriceCell({ game, modelData, boosts, movement, onPick });
    const awayCode = game.awayCode || CODE_BY_NAME[game.away], homeCode = game.homeCode || CODE_BY_NAME[game.home];
    const cells = {
      awayMl: cell('moneyline', 'away', bestMoneyline(books, 'away'), awayCode, `${game.away} ML`),
      homeMl: cell('moneyline', 'home', bestMoneyline(books, 'home'), homeCode, `${game.home} ML`),
      awaySp: cell('spread', 'away', bestSpread(books, 'away'), `${awayCode} ${spreadLabel(bestSpread(books, 'away'))}`, `${game.away} ${spreadLabel(bestSpread(books, 'away'))}`),
      homeSp: cell('spread', 'home', bestSpread(books, 'home'), `${homeCode} ${spreadLabel(bestSpread(books, 'home'))}`, `${game.home} ${spreadLabel(bestSpread(books, 'home'))}`),
      over: cell('total', 'over', bestTotal(books, 'over'), `O ${bestTotal(books, 'over')?.line ?? ''}`, bestTotal(books, 'over') ? `Over ${bestTotal(books, 'over').line}` : ''),
      under: cell('total', 'under', bestTotal(books, 'under'), `U ${bestTotal(books, 'under')?.line ?? ''}`, bestTotal(books, 'under') ? `Under ${bestTotal(books, 'under').line}` : ''),
    };
    return <article key={game.eventKey} className="book-card court-panel p-4">
      <header className="flex items-center justify-between gap-2 border-b border-border/30 pb-2.5">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{game.away} @ {game.home}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {phase === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-trim" aria-hidden="true" />}
          {phase === 'live' && <span className="font-semibold text-trim-ink">Live</span>}
          {phase === 'final' && <span className="font-semibold">Final</span>}
          {phase === 'started' && <span className="font-semibold">Started · status unavailable</span>}
          {phase === 'unknown' && <span className="font-semibold">Status unavailable</span>}
          <CalendarClock className="h-3 w-3" aria-hidden="true" />{formatCommence(game.commenceTime)}
        </span>
      </header>
      <div className="mt-3 grid grid-cols-[3.4rem_repeat(3,minmax(0,1fr))] items-stretch gap-1.5 sm:grid-cols-[8rem_repeat(3,minmax(0,1fr))] sm:gap-2">
        <span aria-hidden="true" />
        <p className="book-market-head">ML</p>
        <p className="book-market-head">Spread</p>
        <p className="book-market-head">Total</p>
        <TeamCell code={awayCode} name={game.away} />
        <PriceButton cell={cells.awayMl} format={format} disabled={!canBet} />
        <PriceButton cell={cells.awaySp} format={format} disabled={!canBet} />
        <PriceButton cell={cells.over} format={format} disabled={!canBet} />
        <TeamCell code={homeCode} name={game.home} />
        <PriceButton cell={cells.homeMl} format={format} disabled={!canBet} />
        <PriceButton cell={cells.homeSp} format={format} disabled={!canBet} />
        <PriceButton cell={cells.under} format={format} disabled={!canBet} />
      </div>
      <footer className="mt-3 flex items-center justify-between gap-2 border-t border-border/30 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{books.length} book{books.length === 1 ? '' : 's'} · best price per side</span>
        <span>{modelData ? 'simmed · edge chips live' : 'no sim data'}</span>
      </footer>
    </article>;
  };
  return <section className="space-y-4" aria-label="Odds board">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="bcast-kicker mb-1">Live feed · {bookFilter ? 'your book' : 'best price per side'}</p><h2 className="font-display text-xl tracking-wide text-foreground">THE BOARD</h2></div>
      <div className="flex flex-wrap items-center gap-2">
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
    {inactive.length > 0 && <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Started, final, or status unavailable · {inactive.length}</p>
      <div className="space-y-3">{inactive.map(renderGame)}</div>
    </div>}
    {games.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No NBA games on the board right now.</div>}
  </section>;
}

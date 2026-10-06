import React from 'react';
import { CalendarClock, RefreshCcw } from 'lucide-react';
import { formatAmerican, formatCommence } from '@/components/book/betsMath';

function bestMoneyline(game, side) {
  let best = null;
  for (const book of game.books || []) {
    const price = book.moneyline?.[side];
    if (Number.isFinite(price) && (!best || price > best.price)) best = { price, book: book.title };
  }
  return best;
}
function bestSpread(game, side) {
  let best = null;
  for (const book of game.books || []) {
    const offer = book.spreads?.[side];
    if (offer && Number.isFinite(offer.price) && (!best || offer.price > best.price)) best = { ...offer, book: book.title };
  }
  return best;
}
function bestTotal(game, pick) {
  let best = null;
  for (const book of game.books || []) {
    const total = book.total;
    if (!total || !Number.isFinite(total[pick])) continue;
    if (!best || total[pick] > best.price) best = { price: total[pick], line: total.point, book: book.title };
  }
  return best;
}

function PickButton({ label, price, book, onPick }) {
  return <button type="button" onClick={onPick} className="flex min-w-0 flex-col items-start gap-0.5 rounded-lg border border-border/50 bg-raised/40 px-3 py-2 text-left transition-colors hover:border-gold/50 hover:bg-gold/10">
    <span className="w-full truncate text-[11px] font-semibold text-foreground">{label}</span>
    <span className="font-mono text-xs font-semibold text-gold">{formatAmerican(price)}{book && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{book}</span>}</span>
  </button>;
}

// The odds board: every upcoming NBA game with the best available American
// price per side across connected books. A click hands the pick to the slip.
export default function OddsBoard({ games, quota, onPick, onRefresh, loading }) {
  return <section className="space-y-4" aria-label="Odds board">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="bcast-kicker mb-1">Live feed · best price per side</p><h2 className="font-display text-xl tracking-wide text-foreground">THE BOARD</h2></div>
      <div className="flex items-center gap-3">
        <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{quota != null ? `${quota} feed calls left` : 'Real sportsbook prices'}</span>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">
          <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh
        </button>
      </div>
    </div>
    {games.map(game => {
      const homeMl = bestMoneyline(game, 'home'), awayMl = bestMoneyline(game, 'away');
      const homeSpread = bestSpread(game, 'home'), awaySpread = bestSpread(game, 'away');
      const over = bestTotal(game, 'over'), under = bestTotal(game, 'under');
      const base = { eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime };
      return <article key={game.eventKey} className="court-panel p-4">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg tracking-wide text-foreground">{game.away} <span className="text-muted-foreground">@</span> {game.home}</h3>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground"><CalendarClock className="h-3 w-3" aria-hidden="true" />{formatCommence(game.commenceTime)}</span>
        </header>
        {game.books.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No books have posted prices for this game yet.</p> :
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Moneyline</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <PickButton label={game.home} price={homeMl?.price} book={homeMl?.book} onPick={() => onPick({ ...base, market: 'moneyline', pickSide: 'home', label: `${game.home} ML`, price: homeMl?.price, book: homeMl?.book })} />
                <PickButton label={game.away} price={awayMl?.price} book={awayMl?.book} onPick={() => onPick({ ...base, market: 'moneyline', pickSide: 'away', label: `${game.away} ML`, price: awayMl?.price, book: awayMl?.book })} />
              </div>
            </div>
            {(homeSpread || awaySpread) && <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Spread</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {homeSpread && <PickButton label={`${game.home} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`} price={homeSpread.price} book={homeSpread.book} onPick={() => onPick({ ...base, market: 'spread', pickSide: 'home', label: `${game.home} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}`, line: homeSpread.point, price: homeSpread.price, book: homeSpread.book })} />}
                {awaySpread && <PickButton label={`${game.away} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`} price={awaySpread.price} book={awaySpread.book} onPick={() => onPick({ ...base, market: 'spread', pickSide: 'away', label: `${game.away} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}`, line: awaySpread.point, price: awaySpread.price, book: awaySpread.book })} />}
              </div>
            </div>}
            {(over || under) && <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Total</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {over && <PickButton label={`Over ${over.line}`} price={over.price} book={over.book} onPick={() => onPick({ ...base, market: 'total', totalPick: 'over', label: `Over ${over.line}`, line: over.line, price: over.price, book: over.book })} />}
                {under && <PickButton label={`Under ${under.line}`} price={under.price} book={under.book} onPick={() => onPick({ ...base, market: 'total', totalPick: 'under', label: `Under ${under.line}`, line: under.line, price: under.price, book: under.book })} />}
              </div>
            </div>}
          </div>}
      </article>;
    })}
    {games.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No NBA games on the board right now.</div>}
  </section>;
}
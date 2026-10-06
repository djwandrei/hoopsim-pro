import React from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarClock, RefreshCcw } from 'lucide-react';
import { formatOdds, formatCommence, pickKey } from '@/components/book/betsMath';
import { modelEdgePct, CODE_BY_NAME } from '@/lib/bookRoom/modelEdge';
import TeamMark from '@/components/studio/TeamMark';
import { bestMoneyline, bestSpread, bestTotal, bookOptions } from '@/components/book/OddsBoard';

const spreadText = offer => (offer && Number.isFinite(offer.point) ? `${offer.point > 0 ? '+' : ''}${offer.point}` : '');

function TeamCell({ code, name }) {
  return <div className="flex min-w-0 items-center gap-2">
    <TeamMark code={code} name={name} className="h-7 w-7 shrink-0 text-[10px]" />
    <span className="truncate text-xs font-semibold text-foreground">{name}</span>
  </div>;
}

// One price cell: market label (with the line for spreads/totals) over the
// mono price, plus model-edge chip, movement arrow and boost chip inline.
function PriceCell({ cell, format }) {
  if (!cell?.offer) return <div className="book-price-btn book-price-btn--empty" role="presentation">—</div>;
  const { label, offer, edge, onPick } = cell;
  return <button type="button" onClick={onPick} className="book-price-btn" aria-label={`Add ${label} at ${formatOdds(offer.price, format)}`}>
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

// Pick Desk board: mockup-style game cards — "Game N" header with a gold
// NBA badge and tip time, then team rows across Spread / Total / Money cells.
export default function PickDeskBoard({ games, quota, movement, boosts, format, model, onPick, onRefresh, loading }) {
  const now = Date.now();
  const live = games.filter(game => Date.parse(game.commenceTime) <= now);
  const upcoming = games.filter(game => Date.parse(game.commenceTime) > now);

  const renderGame = (game, index) => {
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
    const cell = (market, side, offer, label, pickLabel) => {
      const priced = apply(market, side, offer);
      if (!priced) return null;
      return {
        label, offer: priced, edge: edgeFor(market, side, priced),
        onPick: () => onPick({ eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime, market, ...(market === 'total' ? { totalPick: side } : { pickSide: side }), label: pickLabel, ...(priced.line != null ? { line: priced.line } : {}), price: priced.price, book: priced.book }),
      };
    };
    const awayCode = CODE_BY_NAME[game.away], homeCode = CODE_BY_NAME[game.home];
    const awaySpread = bestSpread(game.books, 'away'), homeSpread = bestSpread(game.books, 'home');
    const over = bestTotal(game.books, 'over'), under = bestTotal(game.books, 'under');
    const cells = {
      awaySp: cell('spread', 'away', awaySpread, `Spread ${spreadText(awaySpread)}`, awaySpread ? `${game.away} ${spreadText(awaySpread)}` : ''),
      homeSp: cell('spread', 'home', homeSpread, `Spread ${spreadText(homeSpread)}`, homeSpread ? `${game.home} ${spreadText(homeSpread)}` : ''),
      over: cell('total', 'over', over, over ? `O ${over.line}` : 'Total', over ? `Over ${over.line}` : ''),
      under: cell('total', 'under', under, under ? `U ${under.line}` : 'Total', under ? `Under ${under.line}` : ''),
      awayMl: cell('moneyline', 'away', bestMoneyline(game.books, 'away'), 'Money', `${game.away} ML`),
      homeMl: cell('moneyline', 'home', bestMoneyline(game.books, 'home'), 'Money', `${game.home} ML`),
    };
    const gameLive = Date.parse(game.commenceTime) <= now;
    const bookCount = (game.books || []).length;
    return <article key={game.eventKey} className="book-card court-panel p-4">
      <header className="flex flex-wrap items-center gap-2">
        <p className="font-display text-lg tracking-wide text-foreground">Game {index + 1}</p>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">Betting · Odds · NBA</span>
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          {gameLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-trim" aria-hidden="true" />}
          {gameLive && <span className="font-semibold text-trim-ink">Live</span>}
          <CalendarClock className="h-3 w-3" aria-hidden="true" />{formatCommence(game.commenceTime)}
        </span>
        <span className="ml-auto grid h-6 w-6 place-items-center rounded-full border border-border/50 font-mono text-[10px] text-muted-foreground" title={`${bookCount} book${bookCount === 1 ? '' : 's'} pricing this game`}>{bookCount}</span>
      </header>
      <div className="mt-3 grid grid-cols-[minmax(7.5rem,1.5fr)_repeat(3,minmax(0,1fr))] items-stretch gap-1.5 sm:gap-2">
        <p className="book-market-head">Spread</p>
        <p className="book-market-head">Total</p>
        <p className="book-market-head">Money</p>
        <div className="col-span-1 row-span-1 self-center"><TeamCell code={awayCode} name={game.away} /></div>
        <PriceCell cell={cells.awaySp} format={format} />
        <PriceCell cell={cells.over} format={format} />
        <PriceCell cell={cells.awayMl} format={format} />
        <div className="col-span-1 row-span-1 self-center"><TeamCell code={homeCode} name={game.home} /></div>
        <PriceCell cell={cells.homeSp} format={format} />
        <PriceCell cell={cells.under} format={format} />
        <PriceCell cell={cells.homeMl} format={format} />
      </div>
    </article>;
  };

  return <section className="space-y-4" aria-label="Pick Desk board">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="bcast-kicker">Live feed · best price per side</p>
      <div className="flex flex-wrap items-center gap-2">
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
      <div className="space-y-3">{upcoming.map((game, offset) => renderGame(game, live.length + offset))}</div>
    </div>}
    {games.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No NBA games on the board right now.</div>}
  </section>;
}
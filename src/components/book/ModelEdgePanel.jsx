import React from 'react';
import { Brain } from 'lucide-react';
import { formatOdds, formatCommence } from '@/components/book/betsMath';
import { modelEdgePct, CODE_BY_NAME, MODEL_TRIALS } from '@/lib/bookRoom/modelEdge';

const bestMoneyline = (game, side) => {
  let best = null;
  for (const book of game.books || []) {
    const price = book.moneyline?.[side];
    if (Number.isFinite(price) && (!best || price > best.price)) best = { price, book: book.title };
  }
  return best;
};
const edgeText = edge => `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}`;

// Featured edges: the studio sim's strongest disagreements with the market,
// ranked — each card carries the fair model odds, the best book price and a
// one-tap add of the edge pick to the slip.
export default function ModelEdgePanel({ model, games, format, leagueLabel, onModelPick }) {
  const rows = (games || [])
    .filter(game => Date.parse(game.commenceTime) > Date.now())
    .map(game => {
      const m = model?.byEvent?.[game.eventKey];
      if (!m) return null;
      const homeMl = bestMoneyline(game, 'home');
      const awayMl = bestMoneyline(game, 'away');
      const homeEdge = homeMl ? modelEdgePct(m, { market: 'moneyline', pickSide: 'home', eventKey: game.eventKey }, homeMl.price) : null;
      const awayEdge = awayMl ? modelEdgePct(m, { market: 'moneyline', pickSide: 'away', eventKey: game.eventKey }, awayMl.price) : null;
      const bestEdge = [homeEdge, awayEdge].filter(Number.isFinite).sort((a, b) => b - a)[0];
      if (!Number.isFinite(bestEdge)) return null;
      const bestSide = homeEdge === bestEdge ? 'home' : 'away';
      const offer = bestSide === 'home' ? homeMl : awayMl;
      return { game, m, bestEdge, bestSide, offer, fair: bestSide === 'home' ? m.fairHome : m.fairAway, code: CODE_BY_NAME[bestSide === 'home' ? game.home : game.away] };
    })
    .filter(Boolean)
    .sort((a, b) => b.bestEdge - a.bestEdge)
    .slice(0, 6);
  return <section className="court-panel p-4" aria-label="SwishIQ model edge">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="bcast-kicker flex items-center gap-2"><Brain className="h-4 w-4" aria-hidden="true" />Model edge · studio sim vs the market</p>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{model?.progress ? `${model.progress} simmed` : 'Simulating…'}</span>
    </div>
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{leagueLabel || 'Season'} possession model, {MODEL_TRIALS} seeded trials per game. Positive = the model makes the pick more likely than the book's price implies — every price on the board below carries its own edge chip.</p>
    {rows.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">{model?.progress ? 'No model-vs-market edges to feature yet — waiting on board prices.' : 'Running the season sim against the live board…'}</p> :
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {rows.map(row => <div key={`${row.game.eventKey}-${row.bestSide}`} className={`w-44 shrink-0 rounded-xl border p-3 ${row.bestEdge >= 3 ? 'border-positive/50 bg-positive/5' : 'border-border/40 bg-raised/40'}`}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{row.game.away} @ {row.game.home}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{formatCommence(row.game.commenceTime)}</p>
          <p className={`mt-1 font-display text-2xl tracking-wide ${row.bestEdge >= 3 ? 'text-positive' : row.bestEdge <= -3 ? 'text-trim-ink' : 'text-foreground'}`}>{edgeText(row.bestEdge)}</p>
          <dl className="mt-1 space-y-0.5 font-mono text-[11px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Model</dt><dd className="text-foreground">{formatOdds(row.fair, format)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Book</dt><dd className="text-gold">{formatOdds(row.offer.price, format)}</dd></div>
          </dl>
          <button type="button" onClick={() => onModelPick({
            eventKey: row.game.eventKey,
            matchup: `${row.game.away} @ ${row.game.home}`,
            commenceTime: row.game.commenceTime,
            market: 'moneyline',
            pickSide: row.bestSide,
            label: `${row.bestSide === 'home' ? row.game.home : row.game.away} ML`,
            price: row.offer.price,
            book: row.offer.book,
            modelEdge: row.bestEdge,
          })} className="mt-2 w-full rounded-md border border-gold/50 bg-gold/10 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">Add {row.code} ML</button>
        </div>)}
      </div>}
  </section>;
}
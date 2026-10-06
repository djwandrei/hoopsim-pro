import React from 'react';
import { Brain } from 'lucide-react';
import { formatOdds, formatCommence } from '@/components/book/betsMath';
import { modelEdgePct, MODEL_TRIALS } from '@/lib/bookRoom/modelEdge';

const bestMoneyline = (game, side) => {
  let best = null;
  for (const book of game.books || []) {
    const price = book.moneyline?.[side];
    if (Number.isFinite(price) && (!best || price > best.price)) best = { price, book: book.title };
  }
  return best;
};
const bookTotalLine = game => {
  for (const book of game.books || []) if (book.total && Number.isFinite(book.total.point)) return book.total.point;
  return null;
};
const edgeClass = edge => edge >= 3 ? 'border-positive/60 bg-positive/10 text-positive' : edge <= -3 ? 'border-trim/50 bg-trim/10 text-trim-ink' : 'border-border/50 text-muted-foreground';
const edgeText = edge => edge == null ? '—' : `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}`;

// The differentiator panel: the studio sim's fair odds against the live book
// prices, with the moneyline edge for each side on every upcoming game.
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
      const bestEdge = [homeEdge, awayEdge].filter(Number.isFinite).sort((a, b) => b - a)[0] ?? null;
      const bestSide = homeEdge != null && homeEdge === bestEdge ? 'home' : awayEdge != null ? 'away' : null;
      return { game, m, homeMl, awayMl, homeEdge, awayEdge, bestEdge, bestSide, bookTotal: bookTotalLine(game) };
    })
    .filter(Boolean);
  const simming = rows.length === 0 && model?.progress;
  return <section className="court-panel p-4" aria-label="SwishIQ model edge">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="bcast-kicker flex items-center gap-2"><Brain className="h-4 w-4" aria-hidden="true" />Model edge · fair odds from the studio sim</p>
      <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{model?.progress ? `${model.progress} simmed` : 'Simulating…'}</span>
    </div>
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{leagueLabel || 'Season'} possession model, {MODEL_TRIALS} seeded trials per game. Positive edge = the model makes a pick more likely than the book's price implies — green rows are 3+ points of edge.</p>
    {rows.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">{simming ? 'Running the season sim against the live board…' : 'No upcoming games are on the board yet.'}</p> :
      <div className="mt-3 overflow-x-auto">
        <table>
          <caption>Model fair moneyline, expected total and spread vs the book</caption>
          <thead><tr><th>Game</th><th>Model fair H / A</th><th>Book H / A</th><th>Best ML edge</th><th>Model total</th><th>Model spread (home)</th><th><span className="sr-only">Add pick</span></th></tr></thead>
          <tbody>
            {rows.map(row => <tr key={row.game.eventKey} className={row.bestEdge != null && row.bestEdge >= 3 ? 'border-l-2 border-l-positive/70' : undefined}>
              <td><span className="block font-medium text-foreground">{row.game.away} @ {row.game.home}</span><span className="text-[10px] text-muted-foreground">{formatCommence(row.game.commenceTime)}</span></td>
              <td className="font-mono">{formatOdds(row.m.fairHome, format)} / {formatOdds(row.m.fairAway, format)}</td>
              <td className="font-mono">{row.homeMl ? formatOdds(row.homeMl.price, format) : '—'} / {row.awayMl ? formatOdds(row.awayMl.price, format) : '—'}</td>
              <td><span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[11px] ${edgeClass(row.bestEdge)}`}>{edgeText(row.bestEdge)}</span></td>
              <td className="font-mono">{row.m.modelTotal.toFixed(1)}{row.bookTotal != null && <span className="text-muted-foreground"> vs {row.bookTotal}</span>}</td>
              <td className="font-mono">{row.m.modelSpread >= 0 ? '+' : ''}{row.m.modelSpread.toFixed(1)}</td>
              <td>{row.bestSide && <button type="button" onClick={() => {
                const side = row.bestSide;
                const offer = side === 'home' ? row.homeMl : row.awayMl;
                onModelPick({ eventKey: row.game.eventKey, matchup: `${row.game.away} @ ${row.game.home}`, commenceTime: row.game.commenceTime, market: 'moneyline', pickSide: side, label: `${side === 'home' ? row.game.home : row.game.away} ML`, price: offer.price, book: offer.book, modelEdge: row.bestEdge });
              }} className="rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold hover:bg-gold/20">Add edge pick</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </section>;
}
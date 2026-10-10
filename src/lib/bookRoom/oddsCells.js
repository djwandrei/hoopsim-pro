// One priced board cell, shared by the Book Room odds board and the Real Book
// pick desk: applies daily boosts, computes the studio model edge, and builds
// the onPick leg payload. Both boards pass their pre-filtered book list.
import { eventPhase, pickKey } from '@/components/book/betsMath';
import { modelEdgePct } from '@/lib/bookRoom/modelEdge';

export function buildPriceCell({ game, modelData, boosts = {}, movement = {}, onPick }) {
  const apply = (market, side, offer) => {
    if (!offer) return null;
    const key = pickKey(game.eventKey, market, side);
    const boosted = boosts?.[key];
    return { ...offer, price: Number.isFinite(boosted) ? boosted : offer.price, boosted: Number.isFinite(boosted), key, trend: movement?.[key] || null };
  };
  const edgeFor = (market, side, offer) => {
    if (!modelData || !offer || !Number.isFinite(Number(offer.price))) return null;
    const line = Number(offer.line ?? offer.point);
    const leg = { market, eventKey: game.eventKey, ...(market === 'total' ? { totalPick: side } : { pickSide: side }), ...(['spread', 'total'].includes(market) && Number.isFinite(line) ? { line } : {}) };
    return modelEdgePct(modelData, leg, Number(offer.price));
  };
  const cell = (market, side, offer, label, pickLabel) => {
    const priced = apply(market, side, offer);
    if (!priced) return null;
    const line = Number(priced.line ?? priced.point);
    if (['spread', 'total'].includes(market) && Number.isFinite(line)) priced.line = line;
    return {
      label, offer: priced, edge: edgeFor(market, side, priced),
      onPick: () => {
        if (!['live', 'upcoming'].includes(eventPhase(game))) return;
        onPick({ eventKey: game.eventKey, matchup: `${game.away} @ ${game.home}`, commenceTime: game.commenceTime, market, ...(market === 'total' ? { totalPick: side } : { pickSide: side }), label: pickLabel, ...(priced.line != null ? { line: priced.line } : {}), price: priced.price, book: priced.book });
      },
    };
  };
  return { cell };
}

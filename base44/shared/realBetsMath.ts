// Server-side wager math for the real-money book (cents in, cents out).
// Mirrors src/components/book/betsMath.js so the UI and the server always
// agree on prices, payouts and grading — the server recomputes every price
// from the raw legs and never trusts a client-supplied one.

export function americanToDecimal(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return 1;
  return value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
}

export function decimalToAmerican(decimal) {
  if (!Number.isFinite(decimal) || decimal <= 1) return -100;
  return decimal <= 2 ? Math.round(-100 / (decimal - 1)) : Math.round((decimal - 1) * 100);
}

export function profitCents(stakeCents, price) {
  const amount = Number(stakeCents), value = Number(price);
  if (!Number.isFinite(amount) || !Number.isFinite(value) || value === 0) return 0;
  return Math.round(amount * (value > 0 ? value / 100 : 100 / Math.abs(value)));
}

export function parlayDecimal(legs) {
  return (legs || []).reduce((product, leg) => product * americanToDecimal(leg.price), 1);
}

export function parlayAmerican(legs) {
  return decimalToAmerican(parlayDecimal(legs));
}

export const TEASER_POINTS = 6;
const TEASER_PAYTABLE = { 2: -110, 3: 150, 4: 260, 5: 450, 6: 700, 7: 900, 8: 1000 };
export function teaserPrice(legCount) {
  return TEASER_PAYTABLE[Math.min(Math.max(legCount, 2), 8)] ?? null;
}

export function roundRobinCombos(legs, size = 2) {
  const combos = [];
  const build = (start, current) => {
    if (current.length === size) { combos.push(current); return; }
    for (let index = start; index < legs.length; index++) build(index + 1, [...current, legs[index]]);
  };
  build(0, []);
  return combos;
}

function gradeLeg(leg, final) {
  const home = Number(final?.homeScore), away = Number(final?.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (leg.market === 'moneyline') {
    if (home === away) return 'push';
    return (home > away ? 'home' : 'away') === leg.pickSide ? 'won' : 'lost';
  }
  if (leg.market === 'spread') {
    const margin = (leg.pickSide === 'home' ? home - away : away - home) + Number(leg.line);
    return margin > 0 ? 'won' : margin < 0 ? 'lost' : 'push';
  }
  if (leg.market === 'total') {
    const sum = home + away, line = Number(leg.line);
    if (sum === line) return 'push';
    return (leg.totalPick === 'over') === (sum > line) ? 'won' : 'lost';
  }
  if (leg.market === 'prop') {
    // "N+ points" milestone: graded on the official box score; a player
    // missing from the box (DNP) voids the leg (push) like a real book.
    const pts = Number(final?.pointsByPlayer?.[leg.propPlayer]);
    if (!Number.isFinite(pts)) return 'push';
    return pts >= Number(leg.propLine) ? 'won' : 'lost';
  }
  return null;
}

// Same rules as the play-money grader: lost leg loses the bet, pushed parlay
// legs are removed and the slip reprices, teasers push on any pushed leg.
export function gradeBet(bet, finalFor) {
  const raw = bet.legs?.length ? bet.legs : [];
  const legs = bet.teaser ? raw.map(leg => leg.market === 'spread'
    ? { ...leg, line: Number(leg.line) + bet.teaserPoints }
    : leg.market === 'total' ? { ...leg, line: Number(leg.line) + (leg.totalPick === 'under' ? bet.teaserPoints : -bet.teaserPoints) } : leg) : raw;
  const results = [];
  for (const leg of legs) {
    const final = finalFor(leg.eventKey);
    if (!final) return null;
    const result = gradeLeg(leg, final);
    if (!result) return null;
    results.push(result);
  }
  if (results.includes('lost')) return { status: 'lost', price: bet.price_american };
  const kept = legs.filter((_, index) => results[index] !== 'push');
  if (kept.length === 0) return { status: 'push', price: bet.price_american };
  if (kept.length === legs.length) return { status: 'won', price: bet.price_american };
  if (bet.teaser) return { status: 'push', price: bet.price_american };
  return { status: 'won', price: kept.length === 1 ? kept[0].price : parlayAmerican(kept) };
}

// Best market offer across books for a market/side — the server re-prices
// every client leg against this live board before accepting a wager.
export function bestOffer(books, market, side) {
  let best = null;
  for (const book of books || []) {
    if (market === 'moneyline') {
      const price = book.moneyline?.[side];
      if (Number.isFinite(price) && (!best || price > best.price)) best = { price, book: book.title };
    } else if (market === 'spread') {
      const offer = book.spreads?.[side];
      if (offer && Number.isFinite(offer.price) && (!best || offer.price > best.price)) best = { price: offer.price, line: offer.point, book: book.title };
    } else if (market === 'total') {
      const total = book.total;
      if (total && Number.isFinite(total[side]) && (!best || total[side] > best.price)) best = { price: total[side], line: total.point, book: book.title };
    }
  }
  return best;
}
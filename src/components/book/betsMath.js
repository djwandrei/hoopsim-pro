// Wager math for the Book Room. Prices are American odds (e.g. -110, +150)
// straight from the sportsbook feed; parlays multiply decimal odds.
export function americanToDecimal(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return 1;
  return value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
}

export function decimalToAmerican(decimal) {
  if (!Number.isFinite(decimal) || decimal <= 1) return -100;
  return decimal <= 2 ? Math.round(-100 / (decimal - 1)) : Math.round((decimal - 1) * 100);
}

export function formatAmerican(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) return '—';
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatOdds(price, format) {
  if (!Number.isFinite(Number(price))) return '—';
  return format === 'decimal' ? americanToDecimal(price).toFixed(2) : formatAmerican(price);
}

export function profitFor(stake, price) {
  const amount = Number(stake), value = Number(price);
  if (!Number.isFinite(amount) || !Number.isFinite(value) || value === 0) return 0;
  return amount * (value > 0 ? value / 100 : 100 / Math.abs(value));
}

export function parlayDecimal(legs) {
  return (legs || []).reduce((product, leg) => product * americanToDecimal(leg.price), 1);
}

export function parlayAmerican(legs) {
  return decimalToAmerican(parlayDecimal(legs));
}

// 6-point teaser: spreads move 6 toward the bettor, totals move 6 in the
// picked direction, and payout comes from the standard teaser pay table.
export const TEASER_POINTS = 6;
const TEASER_PAYTABLE = { 2: -110, 3: 150, 4: 260, 5: 450, 6: 700, 7: 900, 8: 1000 };
export function teaserPrice(legCount) {
  return TEASER_PAYTABLE[Math.min(Math.max(legCount, 2), 8)] ?? null;
}

// Every 2-leg (or size-leg) combination of the slip legs, for round robins.
export function roundRobinCombos(legs, size = 2) {
  const combos = [];
  const build = (start, current) => {
    if (current.length === size) { combos.push(current); return; }
    for (let index = start; index < legs.length; index++) build(index + 1, [...current, legs[index]]);
  };
  build(0, []);
  return combos;
}

export function formatCommence(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  return date.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function commenceStatus(iso) {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) return 'TBD';
  return start <= Date.now() ? 'In progress / final' : `Starts ${formatCommence(iso)}`;
}

export function pickKey(eventKey, market, side) {
  return `${eventKey}|${market}|${side}`;
}

// Grade one leg against a finished game: 'won' | 'lost' | 'push' | null
// (null = final scores missing, leave open for manual settlement).
export function gradeLeg(leg, final) {
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
  return null;
}

// Grade a bet (single or parlay) given a resolver eventKey → final scores.
// Rules: a lost leg loses the bet. A pushed parlay leg is removed and the
// slip reprices on the remaining legs (a single-leg push grades the bet a
// push). Teasers follow the classic rule: any pushed leg pushes the teaser.
// Returns { status, price } so reduced parlays pay at their reduced price.
export function gradeBet(bet, finalFor) {
  const raw = bet.legs?.length ? bet.legs : [bet];
  // Teaser legs are graded on their adjusted (moved) lines.
  const legs = bet.teaser ? raw.map(leg => leg.market === 'spread'
    ? { ...leg, line: Number(leg.line) + bet.teaserPoints }
    : leg.market === 'total' ? { ...leg, line: Number(leg.line) + (leg.totalPick === 'under' ? bet.teaserPoints : -bet.teaserPoints) } : leg) : raw;
  const results = [];
  for (const leg of legs) {
    const final = finalFor(leg.eventKey ?? bet.eventKey);
    if (!final) return null;
    const result = gradeLeg(leg, final);
    if (!result) return null;
    results.push(result);
  }
  if (results.includes('lost')) return { status: 'lost', price: bet.price };
  const kept = legs.filter((_, index) => results[index] !== 'push');
  if (kept.length === 0) return { status: 'push', price: bet.price };
  if (kept.length === legs.length) return { status: 'won', price: bet.price };
  if (bet.teaser) return { status: 'push', price: bet.price };
  return { status: 'won', price: kept.length === 1 ? kept[0].price : parlayAmerican(kept) };
}

// Early cash-out: the bet's potential return discounted by the pick's live
// price, paid at a slight house margin (no win-only floor — like real books,
// a losing position cashes out below stake). Returns null when any leg is no
// longer priced on the board.
export const CASH_OUT_MARGIN = 0.95;
export function cashOutValue(bet, currentPriceFor) {
  const legs = bet.legs?.length ? bet.legs : [bet];
  const potential = bet.stake * americanToDecimal(bet.price);
  let current = 1;
  for (const leg of legs) {
    const price = currentPriceFor(leg);
    if (!Number.isFinite(price)) return null;
    current *= americanToDecimal(price);
  }
  const value = potential / current * CASH_OUT_MARGIN;
  return Math.round(Math.max(value, 0.1) * 100) / 100;
}
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
// Parlay rules: any lost leg loses the bet; a push leg pushes the whole slip.
export function gradeBet(bet, finalFor) {
  const legs = bet.legs?.length ? bet.legs : [bet];
  let anyLost = false, anyPush = false;
  for (const leg of legs) {
    const final = finalFor(leg.eventKey ?? bet.eventKey);
    if (!final) return null;
    const result = gradeLeg(leg, final);
    if (!result) return null;
    if (result === 'lost') anyLost = true;
    else if (result === 'push') anyPush = true;
  }
  if (anyLost) return 'lost';
  if (anyPush) return 'push';
  return 'won';
}

// Early cash-out: the bet's potential return discounted by the pick's live
// price. Returns null when any leg is no longer priced on the board.
export function cashOutValue(bet, currentPriceFor) {
  const legs = bet.legs?.length ? bet.legs : [bet];
  const potential = bet.stake * americanToDecimal(bet.price);
  let current = 1;
  for (const leg of legs) {
    const price = currentPriceFor(leg);
    if (!Number.isFinite(price)) return null;
    current *= americanToDecimal(price);
  }
  const value = potential / current;
  return Math.round(Math.max(value, bet.stake * 0.5) * 100) / 100;
}
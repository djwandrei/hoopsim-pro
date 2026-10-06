// Wager math and grading for the Book Room. Prices are American odds
// (e.g. -110, +150) straight from the sportsbook feed.
export function americanToDecimal(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value === 0) return 1;
  return value > 0 ? 1 + value / 100 : 1 + 100 / Math.abs(value);
}

export function profitFor(stake, price) {
  const amount = Number(stake), value = Number(price);
  if (!Number.isFinite(amount) || !Number.isFinite(value) || value === 0) return 0;
  return amount * (value > 0 ? value / 100 : 100 / Math.abs(value));
}

export function formatAmerican(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) return '—';
  return value > 0 ? `+${value}` : `${value}`;
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

// Grade an open bet against a finished game: 'won' | 'lost' | 'push' | null
// (null = final scores missing, leave open for manual settlement).
export function gradeBet(bet, final) {
  const home = Number(final?.homeScore), away = Number(final?.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  if (bet.market === 'moneyline') {
    if (home === away) return 'push';
    return (home > away ? 'home' : 'away') === bet.pickSide ? 'won' : 'lost';
  }
  if (bet.market === 'spread') {
    const margin = (bet.pickSide === 'home' ? home - away : away - home) + Number(bet.line);
    return margin > 0 ? 'won' : margin < 0 ? 'lost' : 'push';
  }
  if (bet.market === 'total') {
    const sum = home + away, line = Number(bet.line);
    if (sum === line) return 'push';
    return (bet.totalPick === 'over') === (sum > line) ? 'won' : 'lost';
  }
  return null;
}
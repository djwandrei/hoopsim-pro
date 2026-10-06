// SwishIQ Credits book for the Book Room: bankroll, wagers, wallet ledger and
// the daily-bonus clock, persisted in this browser. Studio credits only.
const STORAGE_KEY = 'swishiq-bookroom-v1';
export const STARTING_BANKROLL = 1000;

// Older wagers stored their markets flat on the bet; wrap them as a one-leg slip.
function toLegs(bet) {
  if (Array.isArray(bet.legs)) return bet;
  return { ...bet, legs: [{ eventKey: bet.eventKey, matchup: bet.matchup, commenceTime: bet.commenceTime, market: bet.market, pickSide: bet.pickSide, totalPick: bet.totalPick, label: bet.label, line: bet.line, price: bet.price, book: bet.bookTitle }] };
}

export function loadBook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.bets)) {
        return {
          bankroll: Number.isFinite(parsed.bankroll) ? parsed.bankroll : STARTING_BANKROLL,
          bets: parsed.bets.map(toLegs),
          ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
          lastBonusAt: parsed.lastBonusAt || null,
        };
      }
    }
  } catch { /* fresh book */ }
  return { bankroll: STARTING_BANKROLL, bets: [], ledger: [], lastBonusAt: null };
}

export function saveBook(book) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(book)); } catch { /* storage unavailable */ }
}

export function resetBook() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  return {
    bankroll: STARTING_BANKROLL,
    bets: [],
    ledger: [{ id: `reset-${Date.now()}`, at: new Date().toISOString(), type: 'reset', label: 'Book reset', amount: STARTING_BANKROLL }],
    lastBonusAt: null,
  };
}

export const pushLedger = (ledger, entries) => [...(Array.isArray(entries) ? entries : [entries]), ...(ledger || [])].slice(0, 60);
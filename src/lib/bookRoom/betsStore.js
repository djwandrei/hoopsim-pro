// Play-money book for the Book Room: bankroll + wagers, persisted in this
// browser so tracking survives reloads. Studio credits, never real money.
const STORAGE_KEY = 'swishiq-bookroom-v1';
export const STARTING_BANKROLL = 1000;

export function loadBook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.bets)) {
        return { bankroll: Number.isFinite(parsed.bankroll) ? parsed.bankroll : STARTING_BANKROLL, bets: parsed.bets };
      }
    }
  } catch { /* fresh book */ }
  return { bankroll: STARTING_BANKROLL, bets: [] };
}

export function saveBook(book) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(book)); } catch { /* storage unavailable */ }
}

export function resetBook() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  return { bankroll: STARTING_BANKROLL, bets: [] };
}
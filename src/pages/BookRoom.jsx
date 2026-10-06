import React, { useCallback, useEffect, useRef, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import OddsBoard, { gamePrices, bestPriceFor, bookOptions } from '@/components/book/OddsBoard';
import BetSlip from '@/components/book/BetSlip';
import BetTracker from '@/components/book/BetTracker';
import OddsSetupState from '@/components/book/OddsSetupState';
import WalletPanel from '@/components/book/WalletPanel';
import { loadBook, saveBook, resetBook, pushLedger } from '@/lib/bookRoom/betsStore';
import { gradeBet, profitFor, parlayAmerican, cashOutValue, teaserPrice, roundRobinCombos, TEASER_POINTS } from '@/components/book/betsMath';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

const BONUS_AMOUNT = 250;
const BONUS_COOLDOWN = 24 * 3600 * 1000;

const earliestCommence = legs => {
  const times = legs.map(leg => Date.parse(leg.commenceTime)).filter(Number.isFinite).sort((a, b) => a - b);
  return times.length ? new Date(times[0]).toISOString() : legs[0].commenceTime;
};
const makeBet = (legs, stake, price, extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  placedAt: new Date().toISOString(),
  legs, parlay: legs.length > 1, price, stake,
  eventKey: legs[0].eventKey,
  matchup: [...new Set(legs.map(leg => leg.matchup))].join(' + '),
  commenceTime: earliestCommence(legs),
  bookTitle: legs[0].book,
  status: 'open', settledAt: null, profit: null,
  ...extra,
});

// Book Room — a full play-money sportsbook on real NBA lines: odds board with
// movement arrows and a daily odds boost, parlay-capable bet slip, early
// cash-out, and a SwishIQ Credits wallet. No real-money wagering.
export default function BookRoom() {
  usePageMeta({ title: 'Book Room — SwishIQ Studio', description: 'A full play-money sportsbook: live NBA money lines, spreads and totals with parlay slips, odds boosts, early cash-out and a tracked SwishIQ Credits wallet.' });
  const [tab, setTab] = useState('board');
  const [format, setFormat] = useState(() => { try { return localStorage.getItem('swishiq-odds-format') || 'american'; } catch { return 'american'; } });
  const [book, setBook] = useState(loadBook);
  const [feed, setFeed] = useState({ state: 'loading', games: [], quota: null, error: null, setup: false });
  const [slipLegs, setSlipLegs] = useState([]);
  const [bookFilter, setBookFilter] = useState('');
  const [movement, setMovement] = useState({});
  const [boosts, setBoosts] = useState({});
  const [checking, setChecking] = useState(false);
  const prevPricesRef = useRef(null);

  useEffect(() => saveBook(book), [book]);
  useEffect(() => { try { localStorage.setItem('swishiq-odds-format', format); } catch { /* ignore */ } }, [format]);

  const loadOdds = useCallback(async () => {
    setFeed(current => ({ ...current, state: 'loading' }));
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'odds' });
      const games = response.data?.games || [];
      const prices = {};
      for (const game of games) Object.assign(prices, gamePrices(game));
      const trend = {};
      const previous = prevPricesRef.current;
      if (previous) for (const [key, offer] of Object.entries(prices)) {
        const before = previous[key];
        if (before && offer.price !== before.price) trend[key] = offer.price > before.price ? 'up' : 'down';
      }
      prevPricesRef.current = prices;
      setMovement(trend);
      const candidates = Object.entries(prices).filter(([, offer]) => offer.price >= -250 && offer.price <= 200);
      if (candidates.length) {
        const [key, offer] = candidates[Math.floor(Math.random() * candidates.length)];
        setBoosts({ [key]: offer.price + 100 });
      } else setBoosts({});
      setFeed({ state: 'ready', games, quota: response.data?.quota ?? null, error: null, setup: false });
    } catch (error) {
      const data = error?.response?.data || {};
      setFeed({ state: data.code === 'odds_feed_not_configured' ? 'setup' : 'error', games: [], quota: null, error: data.error || error?.message || 'The odds feed is unavailable.', setup: data.code === 'odds_feed_not_configured' });
    }
  }, []);

  const priceForLeg = useCallback(leg => {
    const game = feed.games.find(item => item.eventKey === leg.eventKey);
    return game ? bestPriceFor(game, leg) : null;
  }, [feed.games]);

  const checkFinals = useCallback(async () => {
    setChecking(true);
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'scores' });
      const finals = response.data?.finals || [];
      setBook(current => {
        const entries = [];
        let bankroll = current.bankroll, changed = false;
        const bets = current.bets.map(bet => {
          if (bet.status !== 'open') return bet;
          const result = gradeBet(bet, key => finals.find(item => item.eventKey === key));
          if (!result) return bet;
          changed = true;
          const returned = result === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : result === 'push' ? bet.stake : 0;
          bankroll += returned;
          entries.push({ id: `settle-${bet.id}`, at: new Date().toISOString(), type: result === 'push' ? 'void' : 'payout', label: `${result === 'won' ? 'Won' : 'Push'}: ${bet.matchup}`, amount: returned });
          return { ...bet, status: result, settledAt: new Date().toISOString(), profit: returned - bet.stake };
        });
        return changed ? { ...current, bankroll, bets, ledger: pushLedger(current.ledger, entries) } : current;
      });
    } catch { /* finals need the connected feed */ }
    setChecking(false);
  }, []);

  useEffect(() => { loadOdds(); }, [loadOdds]);

  const openCount = book.bets.filter(bet => bet.status === 'open').length;
  // Live tracking: re-check finals every minute while the book is exposed.
  useEffect(() => {
    if (feed.state !== 'ready' || openCount === 0) return;
    const id = setInterval(checkFinals, 60000);
    return () => clearInterval(id);
  }, [feed.state, openCount, checkFinals]);

  const bonusReady = !book.lastBonusAt || Date.now() - Date.parse(book.lastBonusAt) > BONUS_COOLDOWN;
  const claimBonus = () => {
    if (!bonusReady) return;
    const at = new Date().toISOString();
    setBook(current => ({ ...current, bankroll: current.bankroll + BONUS_AMOUNT, lastBonusAt: at, ledger: pushLedger(current.ledger, { id: `bonus-${Date.now()}`, at, type: 'bonus', label: 'Daily sportsbook bonus', amount: BONUS_AMOUNT }) }));
  };

  const placeBet = ({ legs, stake, mode = 'parlay' }) => {
    const at = new Date().toISOString();
    if (mode === 'roundrobin') {
      const combos = roundRobinCombos(legs, 2);
      const price = parlayAmerican(combos[0]);
      const outlay = stake * combos.length;
      const bets = combos.map(combo => makeBet(combo, stake, price, { roundRobin: true }));
      setBook(current => ({ ...current, bankroll: current.bankroll - outlay, bets: [...bets, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bets[0].id}`, at, type: 'bet', label: `Round robin: ${legs.length} legs × ${combos.length} combos`, amount: -outlay }) }));
    } else if (mode === 'teaser') {
      const bet = makeBet(legs, stake, teaserPrice(legs.length), { teaser: true, teaserPoints: TEASER_POINTS, parlay: false });
      setBook(current => ({ ...current, bankroll: current.bankroll - stake, bets: [bet, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bet.id}`, at, type: 'bet', label: `Teaser: ${bet.matchup}`, amount: -stake }) }));
    } else {
      const bet = makeBet(legs, stake, legs.length > 1 ? parlayAmerican(legs) : legs[0].price);
      setBook(current => ({ ...current, bankroll: current.bankroll - stake, bets: [bet, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bet.id}`, at, type: 'bet', label: `Wager: ${bet.matchup}`, amount: -stake }) }));
    }
    setSlipLegs([]);
  };

  const settleBet = (id, result) => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    const returned = result === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : result === 'push' ? bet.stake : 0;
    const at = new Date().toISOString();
    const entry = result === 'push' ? { id: `void-${id}`, at, type: 'void', label: `Push: ${bet.matchup}`, amount: returned } : { id: `payout-${id}`, at, type: 'payout', label: `Won: ${bet.matchup}`, amount: returned };
    return { ...current, bankroll: current.bankroll + returned, bets: current.bets.map(item => item.id === id ? { ...item, status: result, settledAt: at, profit: returned - bet.stake } : item), ledger: pushLedger(current.ledger, entry) };
  });

  const voidBet = id => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    const at = new Date().toISOString();
    return { ...current, bankroll: current.bankroll + bet.stake, bets: current.bets.filter(item => item.id !== id), ledger: pushLedger(current.ledger, { id: `void-${id}`, at, type: 'void', label: `Voided: ${bet.matchup}`, amount: bet.stake }) };
  });

  const cashOutBet = id => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    const value = cashOutValue(bet, priceForLeg);
    if (!Number.isFinite(value)) return current;
    const at = new Date().toISOString();
    return { ...current, bankroll: current.bankroll + value, bets: current.bets.map(item => item.id === id ? { ...item, status: 'cashedout', settledAt: at, profit: value - bet.stake } : item), ledger: pushLedger(current.ledger, { id: `cashout-${id}`, at, type: 'cashout', label: `Cashed out: ${bet.matchup}`, amount: value }) };
  });

  const headerState = feed.state === 'loading' ? 'loading' : feed.state === 'ready' ? 'ready' : 'error';
  const headerStatus = feed.state === 'ready' ? `${feed.games.length} games priced` : feed.state === 'setup' ? 'Feed not connected · tracking still works' : feed.state === 'error' ? 'Feed unavailable' : null;
  const tabs = [['board', 'Odds board'], ['bets', openCount ? `My bets · ${openCount}` : 'My bets']];
  return <StudioShell active="/book">
    <WorkbenchHeader title="BOOK ROOM" description="A full play-money sportsbook on real NBA lines. Stack singles and same-game legs into parlays, ride live price movement and daily odds boosts, cash out early, and settle against real finals — all in SwishIQ Credits, never real stakes." steps={['Read the board', 'Price a wager', 'Track & settle']} current={tab === 'bets' ? 2 : slipLegs.length ? 1 : 0} state={headerState} status={headerStatus} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">{tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${tab === value ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border/50 text-muted-foreground hover:bg-raised hover:text-foreground'}`}>{label}</button>)}</div>
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1">{['american', 'decimal'].map(option => <button key={option} type="button" onClick={() => setFormat(option)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${format === option ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>)}</div>
      </div>
      {tab === 'board' ? <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {feed.state === 'setup' ? <OddsSetupState onRetry={loadOdds} /> :
            feed.state === 'error' ? <section className="court-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4" role="alert">
              <AlertTriangle className="h-5 w-5 shrink-0 text-trim-ink" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-trim-ink">{feed.error}</p>
              <button type="button" onClick={loadOdds} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20"><RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
            </section> :
              feed.state === 'loading' ? <div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground">Loading live prices…</div> :
                <OddsBoard games={feed.games} quota={feed.quota} movement={movement} boosts={boosts} format={format} bookFilter={bookFilter} onBookFilter={setBookFilter} bookOptions={bookOptions(feed.games)} onPick={leg => setSlipLegs(current => [...current, leg])} onRefresh={loadOdds} loading={feed.state === 'loading'} />}
        </div>
        <div className="min-w-0 space-y-4">
          <BetSlip legs={slipLegs} bankroll={book.bankroll} format={format} onRemoveLeg={index => setSlipLegs(current => current.filter((_, i) => i !== index))} onClear={() => setSlipLegs([])} onPlace={placeBet} />
          <WalletPanel bankroll={book.bankroll} ledger={book.ledger} bonusReady={bonusReady} onClaim={claimBonus} />
        </div>
      </div> :
        <BetTracker book={book} format={format} cashOutFor={bet => cashOutValue(bet, priceForLeg)} onSettle={settleBet} onVoid={voidBet} onCashOut={cashOutBet} onCheckFinals={checkFinals} checking={checking} feedReady={feed.state === 'ready'} onReset={() => setBook(resetBook())} />}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Play-money book: wagers are tracked in SwishIQ Credits and settle against real sportsbook results — no real-money wagering happens here. Prices are the best available across connected books at last refresh; boosts apply to new wagers only and cash-out uses the unboosted live market.</p>
    </main>
  </StudioShell>;
}
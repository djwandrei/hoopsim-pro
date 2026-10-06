import React, { useCallback, useEffect, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import OddsBoard, { bestPriceFor } from '@/components/book/OddsBoard';
import PickDeskHero from '@/components/realbook/PickDeskHero';
import PickDeskStrip from '@/components/realbook/PickDeskStrip';
import PickDeskBoard from '@/components/realbook/PickDeskBoard';
import PickSlipRail from '@/components/realbook/PickSlipRail';
import BetSlip from '@/components/book/BetSlip';
import BetTracker from '@/components/book/BetTracker';
import OddsSetupState from '@/components/book/OddsSetupState';
import ModelEdgePanel from '@/components/book/ModelEdgePanel';
import WalletPanel from '@/components/book/WalletPanel';
import BuyCreditsDialog from '@/components/book/BuyCreditsDialog';
import useSeasonSource from '@/hooks/useSeasonSource';
import useBookFeed from '@/hooks/useBookFeed';
import { loadBook, saveBook, resetBook, pushLedger } from '@/lib/bookRoom/betsStore';
import { gradeBet, profitFor, parlayAmerican, cashOutValue, teaserPrice, roundRobinCombos, TEASER_POINTS } from '@/components/book/betsMath';
import { modelEdgePct } from '@/lib/bookRoom/modelEdge';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Coins, RefreshCcw, UserRound, Wallet } from 'lucide-react';

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

// Book Room — the studio's play-money sportsbook, powered by our own season
// sim: real NBA lines with the SwishIQ model edge on every price, parlays,
// round robins, teasers, boosts, early cash-out and a tracked credits wallet.
export default function BookRoom() {
  usePageMeta({ title: 'Book Room — SwishIQ Studio', description: 'A play-money sportsbook powered by the studio sim: real NBA lines with model edges, parlays, teasers, round robins, odds boosts, early cash-out and a tracked SwishIQ Credits wallet.' });
  const [view, setView] = useState('events');
  const [format, setFormat] = useState(() => { try { return localStorage.getItem('swishiq-odds-format') || 'american'; } catch { return 'american'; } });
  const [book, setBook] = useState(loadBook);
  const [slipLegs, setSlipLegs] = useState([]);
  const [bookFilter, setBookFilter] = useState('');
  const [showBuy, setShowBuy] = useState(false);
  const [checking, setChecking] = useState(false);
  const { league, state: seasonState } = useSeasonSource(2025);
  const { feed, loadOdds, model, movement, boosts } = useBookFeed(league, seasonState);

  useEffect(() => { saveBook(book); }, [book]);
  useEffect(() => { try { localStorage.setItem('swishiq-odds-format', format); } catch { /* ignore */ } }, [format]);

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
          // Reduced parlays pay at their reduced price.
          const payoutPrice = Number.isFinite(result.price) ? result.price : bet.price;
          const returned = result.status === 'won' ? bet.stake + profitFor(bet.stake, payoutPrice) : result.status === 'push' ? bet.stake : 0;
          bankroll += returned;
          if (returned > 0) entries.push({ id: `settle-${bet.id}`, at: new Date().toISOString(), type: result.status === 'push' ? 'void' : 'payout', label: `${result.status === 'won' ? 'Won' : 'Push'}: ${bet.matchup}`, amount: returned });
          return { ...bet, status: result.status, price: payoutPrice, settledAt: new Date().toISOString(), profit: returned - bet.stake };
        });
        return changed ? { ...current, bankroll, bets, ledger: pushLedger(current.ledger, entries) } : current;
      });
    } catch { /* finals need the connected feed */ }
    setChecking(false);
  }, []);

  useEffect(() => { loadOdds(); }, [loadOdds]);

  // Returning from a credits checkout: verify server-side, then credit the
  // bankroll exactly once per paid session (ledger id = the session id, so a
  // re-verified session can never double-credit the wallet).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('credits_session');
    if (!sessionId) return undefined;
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        const response = await base44.functions.invoke('bookRoomVerifyPurchase', { sessionId });
        const credits = Math.floor(Number(response.data?.credits)) || 0;
        if (!credits) return;
        setBook(current => current.ledger.some(entry => entry.id === `purchase-${sessionId}`) ? current
          : { ...current, bankroll: current.bankroll + credits, ledger: pushLedger(current.ledger, { id: `purchase-${sessionId}`, at: new Date().toISOString(), type: 'purchase', label: 'SwishIQ Credits pack', amount: credits }) });
      } catch { /* unverified purchases grant no credits */ }
    })();
    return undefined;
  }, []);

  const openCount = book.bets.filter(bet => bet.status === 'open').length;
  // Live tracking: re-check finals every minute while the book is exposed.
  useEffect(() => {
    if (feed.state !== 'ready' || openCount === 0) return;
    const id = setInterval(checkFinals, 60000);
    return () => clearInterval(id);
  }, [feed.state, openCount, checkFinals]);

  const bonusReady = !book.lastBonusAt || Date.now() - Date.parse(book.lastBonusAt) > BONUS_COOLDOWN;
  // The cooldown re-check runs inside the updater, so a double-click can
  // never double-claim the bonus.
  const claimBonus = () => setBook(current => {
    if (current.lastBonusAt && Date.now() - Date.parse(current.lastBonusAt) < BONUS_COOLDOWN) return current;
    const at = new Date().toISOString();
    return { ...current, bankroll: current.bankroll + BONUS_AMOUNT, lastBonusAt: at, ledger: pushLedger(current.ledger, { id: `bonus-${Date.now()}`, at, type: 'bonus', label: 'Daily sportsbook bonus', amount: BONUS_AMOUNT }) };
  });

  const placeBet = ({ legs, stake, mode = 'parlay' }) => {
    if (!Array.isArray(legs) || legs.length === 0) return;
    const stakeCredits = Math.round(Number(stake));
    if (!Number.isFinite(stakeCredits) || stakeCredits < 1) return;
    const at = new Date().toISOString();
    // Bankroll guard runs against the live state inside the updater, so a
    // stale slip (or a double submit) can never overdraw the wallet.
    setBook(current => {
      const outlay = mode === 'roundrobin' ? stakeCredits * roundRobinCombos(legs, 2).length : stakeCredits;
      if (outlay > current.bankroll) return current;
      if (mode === 'roundrobin') {
        const combos = roundRobinCombos(legs, 2);
        // Each combo is its own parlay at its own combined price.
        const bets = combos.map(combo => makeBet(combo, stakeCredits, parlayAmerican(combo), { roundRobin: true }));
        return { ...current, bankroll: current.bankroll - outlay, bets: [...bets, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bets[0].id}`, at, type: 'bet', label: `Round robin: ${legs.length} legs × ${combos.length} combos`, amount: -outlay }) };
      }
      if (mode === 'teaser') {
        const bet = makeBet(legs, stakeCredits, teaserPrice(legs.length), { teaser: true, teaserPoints: TEASER_POINTS, parlay: false });
        return { ...current, bankroll: current.bankroll - stakeCredits, bets: [bet, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bet.id}`, at, type: 'bet', label: `Teaser: ${bet.matchup}`, amount: -stakeCredits }) };
      }
      const bet = makeBet(legs, stakeCredits, legs.length > 1 ? parlayAmerican(legs) : legs[0].price);
      return { ...current, bankroll: current.bankroll - stakeCredits, bets: [bet, ...current.bets], ledger: pushLedger(current.ledger, { id: `bet-${bet.id}`, at, type: 'bet', label: `Wager: ${bet.matchup}`, amount: -stakeCredits }) };
    });
    setSlipLegs([]);
  };

  // Picks carry the studio model's edge vs the taken price straight into the
  // slip, the placed bet and the settled ledger.
  // Real books don't take correlated same-game parlays: one pick per event.
  const addLeg = leg => {
    if (slipLegs.some(existing => existing.eventKey === leg.eventKey)) return;
    const modelData = model?.byEvent?.[leg.eventKey];
    const edge = modelData ? modelEdgePct(modelData, leg, leg.price) : null;
    setSlipLegs(current => [...current, Number.isFinite(edge) ? { ...leg, modelEdge: edge } : leg]);
  };

  const settleBet = (id, result) => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    const returned = result === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : result === 'push' ? bet.stake : 0;
    const at = new Date().toISOString();
    const entry = returned > 0 ? (result === 'push'
      ? { id: `void-${id}`, at, type: 'void', label: `Push: ${bet.matchup}`, amount: returned }
      : { id: `payout-${id}`, at, type: 'payout', label: `Won: ${bet.matchup}`, amount: returned }) : null;
    return { ...current, bankroll: current.bankroll + returned, bets: current.bets.map(item => item.id === id ? { ...item, status: result, settledAt: at, profit: returned - bet.stake } : item), ledger: entry ? pushLedger(current.ledger, entry) : current.ledger };
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

  const priceForLeg = useCallback(leg => {
    const game = feed.games.find(item => item.eventKey === leg.eventKey);
    return game ? bestPriceFor(game, leg) : null;
  }, [feed.games]);

  const headerState = feed.state === 'loading' ? 'loading' : feed.state === 'ready' ? 'ready' : 'error';
  const headerStatus = feed.state === 'ready' ? `${feed.games.length} games priced · model edge live` : feed.state === 'setup' ? 'Feed not connected · tracking still works' : feed.state === 'error' ? 'Feed unavailable' : null;
  return <StudioShell active="/book">
    <PickDeskHero description="Play-money sportsbook powered by the studio's own sim — real NBA lines with model edges, featured picks, parlays, round robins and teasers, live movement and daily boosts, early cash-out, all settled against real finals in SwishIQ Credits, never real stakes." games={feed.state === 'ready' ? feed.games : null} status={headerStatus} state={headerState}
      balance={<span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2" aria-label="Bankroll"><Wallet className="h-3.5 w-3.5 text-gold" aria-hidden="true" /><span className="font-mono text-xs font-bold text-gold">{book.bankroll.toLocaleString()} cr</span></span>} />
    <PickDeskStrip tab={view} onTab={setView} tabs={[['events', 'Events'], ['featured', 'Featured'], ['wallet', 'Wallet & Credits']]} format={format} onFormat={setFormat}
      links={[
        { label: 'Buy credits', Icon: Coins, onClick: () => setShowBuy(true), gold: true },
        { to: '/account', label: 'Account', Icon: UserRound },
      ]} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {view === 'wallet' && <WalletPanel bankroll={book.bankroll} ledger={book.ledger} bonusReady={bonusReady} onClaim={claimBonus} />}
      {view !== 'wallet' && <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {feed.state === 'setup' ? <OddsSetupState onRetry={loadOdds} /> :
            feed.state === 'error' ? <section className="court-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4" role="alert">
              <AlertTriangle className="h-5 w-5 shrink-0 text-trim-ink" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-trim-ink">{feed.error}</p>
              <button type="button" onClick={loadOdds} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20"><RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
            </section> :
              feed.state === 'loading' ? <div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground">Loading live prices…</div> :
                view === 'featured' ? <ModelEdgePanel model={model} games={feed.games} format={format} leagueLabel={model?.leagueLabel || league?.label} onModelPick={addLeg} /> :
                  <PickDeskBoard games={feed.games} quota={feed.quota} movement={movement} boosts={boosts} format={format} model={model} bookFilter={bookFilter} onBookFilter={setBookFilter} onPick={addLeg} onRefresh={loadOdds} loading={feed.state === 'loading'} />}
        </div>
        <div className="min-w-0 self-start lg:sticky lg:top-[calc(var(--djhc-header-h,0px)+1rem)]">
          <PickSlipRail legsCount={slipLegs.length} openCount={openCount}
            slip={<BetSlip legs={slipLegs} bankroll={book.bankroll} format={format} onRemoveLeg={index => setSlipLegs(current => current.filter((_, i) => i !== index))} onClear={() => setSlipLegs([])} onPlace={placeBet} />}
            bets={<BetTracker book={book} format={format} cashOutFor={bet => cashOutValue(bet, priceForLeg)} onSettle={settleBet} onVoid={voidBet} onCashOut={cashOutBet} onCheckFinals={checkFinals} checking={checking} feedReady={feed.state === 'ready'} onReset={() => setBook(resetBook())} />} />
        </div>
      </div>}
      <BuyCreditsDialog open={showBuy} onOpenChange={setShowBuy} />
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Play-money book: wagers are tracked in SwishIQ Credits and settle against real sportsbook results — no real-money wagering happens here. Model edge is the studio sim's probability minus the book's implied probability at last refresh; boosts apply to new wagers only and cash-out uses the unboosted live market.</p>
    </main>
  </StudioShell>;
}
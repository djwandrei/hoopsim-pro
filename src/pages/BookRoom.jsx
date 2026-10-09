import React, { useCallback, useEffect, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import { bestPriceFor } from '@/components/book/OddsBoard';
import PickDeskHero from '@/components/realbook/PickDeskHero';
import PickDeskStrip from '@/components/realbook/PickDeskStrip';
import PickDeskBoard from '@/components/realbook/PickDeskBoard';
import PickSlipRail from '@/components/realbook/PickSlipRail';
import BetSlip from '@/components/book/BetSlip';
import BetTracker from '@/components/book/BetTracker';
import OddsSetupState from '@/components/book/OddsSetupState';
import ModelEdgePanel from '@/components/book/ModelEdgePanel';
import WalletPanel from '@/components/book/WalletPanel';
import useSeasonSource from '@/hooks/useSeasonSource';
import useBookFeed from '@/hooks/useBookFeed';
import { loadBook, saveBook, resetBook, pushLedger } from '@/lib/bookRoom/betsStore';
import { profitFor, parlayAmerican, cashOutValue, teaserPrice, roundRobinCombos, TEASER_POINTS } from '@/components/book/betsMath';
import { modelEdgePct } from '@/lib/bookRoom/modelEdge';
import { trackGa4 } from '@/lib/gaBridge';
import { AlertTriangle, RefreshCcw, UserRound, Wallet } from 'lucide-react';

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

// Book Room — the studio's local play-money shell. The pricing/settlement
// backend is intentionally disconnected until its separate service is ready.
export default function BookRoom() {
  usePageMeta({ title: 'Sportsbook — SwishIQ Studio', description: 'A local play-money sportsbook shell. Live prices, paid credits, and server settlement are planned backend work.' });
  const [view, setView] = useState('events');
  const [format, setFormat] = useState(() => { try { return localStorage.getItem('swishiq-odds-format') || 'american'; } catch { return 'american'; } });
  const [book, setBook] = useState(loadBook);
  const [slipLegs, setSlipLegs] = useState([]);
  const [bookFilter, setBookFilter] = useState('');
  const [checking, setChecking] = useState(false);
  const { league, state: seasonState } = useSeasonSource(2025);
  const { feed, loadOdds, model, movement, boosts, propsByEvent } = useBookFeed(league, seasonState);

  useEffect(() => { saveBook(book); }, [book]);
  useEffect(() => { try { localStorage.setItem('swishiq-odds-format', format); } catch { /* ignore */ } }, [format]);

  const checkFinals = useCallback(async () => {
    setChecking(false);
  }, []);

  const openCount = book.bets.filter(bet => bet.status === 'open').length;
  // The settlement callback remains a no-op while the backend is planned.
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
    const outlay = mode === 'roundrobin' ? stakeCredits * roundRobinCombos(legs, 2).length : stakeCredits;
    if (outlay > book.bankroll) return;
    trackGa4('bet_placed', { mode, legs: legs.length, stake: stakeCredits });
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
    // The sim models game outcomes, not player props — no edge chip on props.
    const edge = leg.market !== 'prop' && modelData ? modelEdgePct(modelData, leg, leg.price) : null;
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
  const headerStatus = feed.state === 'ready' ? `${feed.games.length} games priced · model edge live` : feed.state === 'setup' ? 'Odds backend planned · local wallet available' : feed.state === 'error' ? 'Feed unavailable' : null;
  return <StudioShell active="/book">
    <PickDeskHero description="Local play-money sportsbook shell with a tracked browser wallet. Live lines, model pricing, paid credits, and server settlement will connect through the planned backend." games={feed.state === 'ready' ? feed.games : null} status={headerStatus} state={headerState}
      balance={<span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2" aria-label="Bankroll"><Wallet className="h-3.5 w-3.5 text-gold" aria-hidden="true" /><span className="font-mono text-xs font-bold text-gold">{book.bankroll.toLocaleString()} cr</span></span>} />
    <PickDeskStrip tab={view} onTab={setView} tabs={[['events', 'Events'], ['featured', 'Featured'], ['wallet', 'Wallet & Credits']]} format={format} onFormat={setFormat}
      links={[
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
                  <PickDeskBoard games={feed.games} quota={feed.quota} movement={movement} boosts={boosts} format={format} model={model} bookFilter={bookFilter} onBookFilter={setBookFilter} onPick={addLeg} onRefresh={loadOdds} loading={feed.state === 'loading'} propsByEvent={propsByEvent} />}
        </div>
        <div className="min-w-0 self-start lg:sticky lg:top-[calc(var(--djhc-header-h,0px)+1rem)]">
          <PickSlipRail legsCount={slipLegs.length} openCount={openCount}
            slip={<BetSlip legs={slipLegs} bankroll={book.bankroll} format={format} onRemoveLeg={index => setSlipLegs(current => current.filter((_, i) => i !== index))} onClear={() => setSlipLegs([])} onPlace={placeBet} />}
            bets={<BetTracker book={book} format={format} cashOutFor={bet => cashOutValue(bet, priceForLeg)} onSettle={settleBet} onVoid={voidBet} onCashOut={cashOutBet} onCheckFinals={checkFinals} checking={checking} feedReady={feed.state === 'ready'} onReset={() => setBook(resetBook())} />} />
        </div>
      </div>}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Play-money book: local credits and bet history stay in this browser. Live prices, paid credit purchases, and server settlement remain planned backend work.</p>
    </main>
  </StudioShell>;
}

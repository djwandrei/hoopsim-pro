import React, { useCallback, useEffect, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import OddsBoard from '@/components/book/OddsBoard';
import BetSlip from '@/components/book/BetSlip';
import BetTracker from '@/components/book/BetTracker';
import OddsSetupState from '@/components/book/OddsSetupState';
import { loadBook, saveBook, resetBook } from '@/lib/bookRoom/betsStore';
import { gradeBet, profitFor } from '@/components/book/betsMath';
import { base44 } from '@/api/base44Client';
import { Wallet, AlertTriangle, RefreshCcw } from 'lucide-react';

// Book Room — live NBA odds board + play-money bet tracking. Prices are real
// sportsbook lines from the swishiqOddsFeed relay; wagers settle against real
// finals in studio credits only.
export default function BookRoom() {
  usePageMeta({ title: 'Book Room — SwishIQ Studio', description: 'Real NBA money lines, spreads and totals from live sportsbooks, with a play-money bet slip and live bet tracking that settles against real finals.' });
  const [tab, setTab] = useState('board');
  const [book, setBook] = useState(loadBook);
  const [feed, setFeed] = useState({ state: 'loading', games: [], quota: null, error: null, setup: false });
  const [slip, setSlip] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => saveBook(book), [book]);

  const loadOdds = useCallback(async () => {
    setFeed(current => ({ ...current, state: 'loading' }));
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'odds' });
      setFeed({ state: 'ready', games: response.data?.games || [], quota: response.data?.quota ?? null, error: null, setup: false });
    } catch (error) {
      const data = error?.response?.data || {};
      setFeed({ state: data.code === 'odds_feed_not_configured' ? 'setup' : 'error', games: [], quota: null, error: data.error || error?.message || 'The odds feed is unavailable.', setup: data.code === 'odds_feed_not_configured' });
    }
  }, []);

  const checkFinals = useCallback(async () => {
    setChecking(true);
    try {
      const response = await base44.functions.invoke('swishiqOddsFeed', { kind: 'scores' });
      const finals = response.data?.finals || [];
      setBook(current => {
        let bankroll = current.bankroll, changed = false;
        const bets = current.bets.map(bet => {
          if (bet.status !== 'open') return bet;
          const final = finals.find(item => item.eventKey === bet.eventKey);
          const result = final ? gradeBet(bet, final) : null;
          if (!result) return bet;
          changed = true;
          const returned = result === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : result === 'push' ? bet.stake : 0;
          return { ...bet, status: result, settledAt: new Date().toISOString(), profit: returned - bet.stake };
        });
        if (changed) {
          for (const [index, bet] of bets.entries()) if (bet.status !== 'open' && current.bets[index].status === 'open') bankroll += bet.status === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : bet.status === 'push' ? bet.stake : 0;
          return { ...current, bankroll, bets };
        }
        return current;
      });
    } catch { /* finals need the connected feed */ }
    setChecking(false);
  }, []);

  useEffect(() => { loadOdds(); }, [loadOdds]);

  const openCount = book.bets.filter(bet => bet.status === 'open').length;
  // Live tracking: while games the book is exposed to are out, re-check finals
  // every minute so settled results land without a manual refresh.
  useEffect(() => {
    if (feed.state !== 'ready' || openCount === 0) return;
    const id = setInterval(checkFinals, 60000);
    return () => clearInterval(id);
  }, [feed.state, openCount, checkFinals]);

  const placeBet = selection => {
    const bet = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, placedAt: new Date().toISOString(), eventKey: selection.eventKey, matchup: selection.matchup, commenceTime: selection.commenceTime, market: selection.market, pickSide: selection.pickSide || null, totalPick: selection.totalPick || null, label: selection.label, line: selection.line ?? null, price: selection.price, stake: selection.stake, bookTitle: selection.book, status: 'open', settledAt: null, profit: null };
    setBook(current => ({ ...current, bankroll: current.bankroll - selection.stake, bets: [bet, ...current.bets] }));
    setSlip(null);
  };

  const settleBet = (id, result) => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    const returned = result === 'won' ? bet.stake + profitFor(bet.stake, bet.price) : result === 'push' ? bet.stake : 0;
    return { ...current, bankroll: current.bankroll + returned, bets: current.bets.map(item => item.id === id ? { ...item, status: result, settledAt: new Date().toISOString(), profit: returned - bet.stake } : item) };
  });

  const voidBet = id => setBook(current => {
    const bet = current.bets.find(item => item.id === id);
    if (!bet || bet.status !== 'open') return current;
    return { ...current, bankroll: current.bankroll + bet.stake, bets: current.bets.filter(item => item.id !== id) };
  });

  const headerState = feed.state === 'loading' ? 'loading' : feed.state === 'ready' ? 'ready' : 'error';
  const headerStatus = feed.state === 'ready' ? `${feed.games.length} games priced` : feed.state === 'setup' ? 'Feed not connected · tracking still works' : feed.state === 'error' ? 'Feed unavailable' : null;
  const tabs = [['board', 'Odds board'], ['bets', openCount ? `My bets · ${openCount}` : 'My bets']];
  return <StudioShell active="/book">
    <WorkbenchHeader title="BOOK ROOM" description="Live NBA money lines, spreads and totals from real sportsbooks. Price a wager on the slip, track every open position as games go final, and settle against real results — in a play-money bankroll, never real stakes." steps={['Read the board', 'Price a wager', 'Track & settle']} current={tab === 'bets' ? 2 : slip ? 1 : 0} state={headerState} status={headerStatus} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">{tabs.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-widest transition-colors ${tab === value ? 'border-gold/40 bg-gold/10 text-gold' : 'border-border/50 text-muted-foreground hover:bg-raised hover:text-foreground'}`}>{label}</button>)}</div>
      {tab === 'board' ? <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {feed.state === 'setup' ? <OddsSetupState onRetry={loadOdds} /> :
            feed.state === 'error' ? <section className="court-panel flex flex-wrap items-center gap-x-4 gap-y-3 p-4" role="alert">
              <AlertTriangle className="h-5 w-5 shrink-0 text-trim-ink" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-trim-ink">{feed.error}</p>
              <button type="button" onClick={loadOdds} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold hover:bg-gold/20"><RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />Retry</button>
            </section> :
              feed.state === 'loading' ? <div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground">Loading live prices…</div> :
                <OddsBoard games={feed.games} quota={feed.quota} onPick={setSlip} onRefresh={loadOdds} loading={feed.state === 'loading'} />}
        </div>
        <div className="min-w-0 space-y-4">
          <BetSlip slip={slip} bankroll={book.bankroll} onPlace={placeBet} onClear={() => setSlip(null)} />
          <section className="court-panel flex items-center gap-3 p-4" aria-label="Bankroll">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-gold/10"><Wallet className="h-5 w-5 text-gold" aria-hidden="true" /></span>
            <div><p className="bcast-kicker mb-0.5">Studio bankroll</p><p className="font-display text-2xl tracking-wide text-foreground">{book.bankroll.toLocaleString()} cr</p></div>
          </section>
        </div>
      </div> :
        <BetTracker book={book} onSettle={settleBet} onVoid={voidBet} onCheckFinals={checkFinals} checking={checking} feedReady={feed.state === 'ready'} onReset={() => setBook(resetBook())} />}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Play-money book: wagers are tracked in studio credits and settle against real sportsbook results — no real-money wagering happens here. Prices are the best available across connected books at last refresh.</p>
    </main>
  </StudioShell>;
}
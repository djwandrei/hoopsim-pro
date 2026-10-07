import React, { useCallback, useEffect, useState } from 'react';
import usePageMeta from '@/hooks/usePageMeta';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import ModelEdgePanel from '@/components/book/ModelEdgePanel';
import OddsSetupState from '@/components/book/OddsSetupState';
import useSeasonSource from '@/hooks/useSeasonSource';
import useBookFeed from '@/hooks/useBookFeed';
import RealMoneyGate from '@/components/realbook/RealMoneyGate';
import RealWalletPanel from '@/components/realbook/RealWalletPanel';
import RealBetSlip from '@/components/realbook/RealBetSlip';
import RealBetList from '@/components/realbook/RealBetList';
import PickDeskHero from '@/components/realbook/PickDeskHero';
import PickDeskStrip from '@/components/realbook/PickDeskStrip';
import PickDeskBoard from '@/components/realbook/PickDeskBoard';
import PickSlipRail from '@/components/realbook/PickSlipRail';
import { dollars } from '@/components/realbook/realFormat';
import { modelEdgePct } from '@/lib/bookRoom/modelEdge';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, Loader2, ShieldAlert, RefreshCcw, Dice5, UserRound, Wallet } from 'lucide-react';

// Real-Money Book — the restricted variant of the sportsbook, structured as
// the Pick Desk: hero + section strip, game cards, Pick Slip rail. Real
// stakes, real finals settlement, 21+ and licensed-state gate, daily deposit
// and loss limits and self-exclusion — all enforced server-side by the
// realBook* functions; the client never sets a balance, price or outcome.
export default function RealBook() {
  usePageMeta({ title: 'Pick Desk — Real-Money Book — SwishIQ Studio', description: 'The restricted real-money sportsbook: 21+ and state-gated, Stripe deposits, daily deposit and loss limits, self-exclusion and settlement against official finals.' });
  const [view, setView] = useState('events');
  const [format, setFormat] = useState(() => { try { return localStorage.getItem('swishiq-odds-format') || 'american'; } catch { return 'american'; } });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [bets, setBets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [slipLegs, setSlipLegs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const { league, state: seasonState } = useSeasonSource(2025);
  const { feed, loadOdds, model, movement, propsByEvent } = useBookFeed(league, seasonState);

  const loadAccount = useCallback(async () => {
    try {
      const profilePage = await base44.entities.RealMoneyProfile.filter({});
      const loaded = (profilePage.items || [])[0] || null;
      setProfile(loaded);
      if (!loaded) return;
      const [walletPage, betsPage, txPage] = await Promise.all([
        base44.entities.RealWallet.filter({}),
        base44.entities.RealBet.filter({}, { sort: '-created_date', limit: 50 }),
        base44.entities.RealTransaction.filter({}, { sort: '-created_date', limit: 30 }),
      ]);
      setWallet((walletPage.items || [])[0] || null);
      setBets(betsPage.items || []);
      setTransactions(txPage.items || []);
    } catch {
      // A transient load failure keeps the previous view instead of throwing
      // an unhandled rejection; the next action re-runs this load.
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadAccount(); }, [loadAccount]);

  // Returning from Stripe Checkout: verify server-side and credit the wallet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('deposit_session');
    if (!sessionId) return undefined;
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        await base44.functions.invoke('realBookDeposit', { sessionId });
        setNotice({ tone: 'ok', text: 'Deposit confirmed — funds are in your wallet.' });
      } catch (error) {
        setNotice({ tone: 'bad', text: error?.response?.data?.error || 'The deposit could not be verified. Contact support with your Stripe receipt.' });
      }
      loadAccount();
    })();
    return undefined;
  }, [loadAccount]);

  useEffect(() => { try { localStorage.setItem('swishiq-odds-format', format); } catch { /* ignore */ } }, [format]);

  const run = async action => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setNotice({ tone: 'bad', text: error?.response?.data?.error || error?.message || 'That action failed.' });
    }
    setBusy(false);
  };

  const addLeg = leg => {
    if (slipLegs.some(existing => existing.eventKey === leg.eventKey)) return;
    const modelData = model?.byEvent?.[leg.eventKey];
    // The sim models game outcomes, not player props — no edge chip on props.
    const edge = leg.market !== 'prop' && modelData ? modelEdgePct(modelData, leg, leg.price) : null;
    setSlipLegs(current => [...current, Number.isFinite(edge) ? { ...leg, modelEdge: edge } : leg]);
  };

  const startDeposit = cents => run(async () => {
    const response = await base44.functions.invoke('realBookCheckout', { amountCents: cents, origin: window.location.origin, pagePath: window.location.pathname });
    if (response.data?.url) window.location.href = response.data.url;
    else throw new Error('Could not start the deposit.');
  });
  const requestWithdrawal = cents => run(async () => {
    await base44.functions.invoke('realBookWithdraw', { amountCents: cents });
    setNotice({ tone: 'ok', text: 'Withdrawal requested — payout pending review.' });
    await loadAccount();
  });
  const saveLimits = ({ depositCents, lossCents }) => run(async () => {
    const response = await base44.functions.invoke('realBookUpdateLimits', { depositCents, lossCents });
    setNotice({ tone: 'ok', text: response.data?.pending ? 'Limits saved — decreases applied immediately; increases take effect in 24 hours.' : 'Responsible-gaming limits updated.' });
    await loadAccount();
  });
  const selfExclude = days => run(async () => {
    const response = await base44.functions.invoke('realBookSelfExclude', { days });
    const refunded = response.data?.refunded_cents || 0;
    setNotice({ tone: 'ok', text: response.data?.permanent
      ? `Permanent self-exclusion active${refunded ? ` — ${dollars(refunded)} in open wagers refunded.` : '.'}`
      : `Exclusion active through ${response.data?.self_excluded_until ? new Date(response.data.self_excluded_until).toLocaleDateString() : 'seven days'}${refunded ? ` — ${dollars(refunded)} in open wagers refunded.` : '.'}` });
    await loadAccount();
  });
  const reinstate = () => run(async () => {
    await base44.functions.invoke('realBookReinstate', {});
    setNotice({ tone: 'ok', text: 'Self-exclusion lifted — the real-money book is available again.' });
    await loadAccount();
  });
  const placeRealBet = ({ legs, stakeCents, mode }) => run(async () => {
    await base44.functions.invoke('realBookPlaceBet', { legs, stakeCents, mode });
    setSlipLegs([]);
    setNotice({ tone: 'ok', text: 'Wager placed and accepted by the book.' });
    await loadAccount();
  });
  const settleOpen = () => run(async () => {
    const response = await base44.functions.invoke('realBookSettle', {});
    const settled = response.data?.settled ?? 0;
    setNotice(settled > 0 ? { tone: 'ok', text: `Settled ${settled} bet${settled === 1 ? '' : 's'} against official finals.` } : { tone: 'ok', text: 'Nothing to settle yet — waiting on finals.' });
    await loadAccount();
  });

  if (loading) return <StudioShell active="/book"><WorkbenchHeader title="REAL-MONEY BOOK" description="Checking your restricted real-money profile." state="loading" /><main className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><div className="court-panel grid place-items-center p-14 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" />Checking your real-money profile…</div></main></StudioShell>;

  if (!profile) return <StudioShell active="/book"><WorkbenchHeader title="REAL-MONEY BOOK" description="Real-money wagering is gated: verify your eligibility before any real stake is accepted." state="ready" status="Eligibility required" /><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><RealMoneyGate onAccepted={loadAccount} /></main></StudioShell>;

  if (profile.self_excluded) return <StudioShell active="/book"><WorkbenchHeader title="REAL-MONEY BOOK" description="Self-exclusion is active on your account." state="ready" status="Self-excluded" /><main className="mx-auto max-w-7xl px-4 py-6 sm:px-6"><section className="court-panel mx-auto max-w-2xl p-6" role="alert">
    <p className="bcast-kicker mb-2 text-trim-ink"><ShieldAlert className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Self-exclusion active</p>
    <h2 className="font-display text-2xl tracking-wide text-foreground">YOU'RE LOCKED OUT</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Since {profile.self_excluded_at ? new Date(profile.self_excluded_at).toLocaleString() : 'now'}, deposits, withdrawals and wagers are refused on this account{profile.self_excluded_until ? ` until at least ${new Date(profile.self_excluded_until).toLocaleDateString()}` : ' until reinstatement'}. If gambling is causing a problem for you or someone close to you, help is available around the clock at <span className="font-semibold text-foreground">1-800-GAMBLER</span>.</p>
    {profile.self_excluded_until && Date.now() >= Date.parse(profile.self_excluded_until) && <button type="button" onClick={reinstate} disabled={busy} className="mt-4 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">Request reinstatement</button>}
  </section></main></StudioShell>;

  const balanceCents = Number(wallet?.balance_cents) || 0;
  const openCount = bets.filter(bet => bet.status === 'open').length;
  const headerState = feed.state === 'loading' ? 'loading' : feed.state === 'ready' ? 'ready' : 'error';
  const headerStatus = feed.state === 'ready' ? `${feed.games.length} games priced` : feed.state === 'setup' ? 'Odds feed not connected' : 'Feed unavailable';
  return <StudioShell active="/book">
    <PickDeskHero games={feed.state === 'ready' ? feed.games : null} status={headerStatus} state={headerState}
      balance={<span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2" aria-label="Real-money balance"><Wallet className="h-3.5 w-3.5 text-gold" aria-hidden="true" /><span className="font-mono text-xs font-bold text-gold">{dollars(balanceCents)}</span></span>} />
    <PickDeskStrip tab={view} onTab={setView} format={format} onFormat={setFormat}
      balance={<span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-xs font-bold text-gold" aria-label="Real-money balance">{dollars(balanceCents)}</span>}
      links={[{ to: '/book', label: 'Play-money', Icon: Dice5 }, { to: '/account', label: 'Account', Icon: UserRound }]} />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {notice && <div className={`flex items-start gap-3 rounded-xl border p-3 text-xs leading-relaxed ${notice.tone === 'ok' ? 'border-positive/40 bg-positive/10 text-foreground' : 'border-trim/40 bg-trim/10 text-foreground'}`} role="status"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" /><p className="min-w-0 flex-1">{notice.text}</p><button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Dismiss</button></div>}
      {view === 'wallet' && <RealWalletPanel wallet={wallet} profile={profile} transactions={transactions} busy={busy} onDeposit={startDeposit} onWithdraw={requestWithdrawal} onLimits={saveLimits} onSelfExclude={selfExclude} />}
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
                  <PickDeskBoard games={feed.games} quota={feed.quota} movement={movement} boosts={{}} format={format} model={model} onPick={addLeg} onRefresh={loadOdds} loading={feed.state === 'loading'} propsByEvent={propsByEvent} />}
        </div>
        <div className="min-w-0 self-start lg:sticky lg:top-[calc(var(--djhc-header-h,0px)+1rem)]">
          <PickSlipRail legsCount={slipLegs.length} openCount={openCount}
            slip={<RealBetSlip legs={slipLegs} wallet={wallet} format={format} busy={busy} onRemoveLeg={index => setSlipLegs(current => current.filter((_, i) => i !== index))} onClear={() => setSlipLegs([])} onPlace={placeRealBet} />}
            bets={<RealBetList bets={bets} format={format} feedReady={feed.state === 'ready'} settling={busy} onSettle={settleOpen} />} />
        </div>
      </div>}
      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">Restricted real-money mode: 21+ and licensed-state attestation recorded with your account; balances, prices, limits and settlement are enforced server-side against official finals. If gambling stops being fun, call 1-800-GAMBLER.</p>
    </main>
  </StudioShell>;
}
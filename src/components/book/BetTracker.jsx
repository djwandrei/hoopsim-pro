import React from 'react';
import { RefreshCcw, Trophy, Ban } from 'lucide-react';
import { formatOdds, profitFor, commenceStatus } from '@/components/book/betsMath';

const MARKET_LABEL = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' };
const RESULT_LABEL = { won: 'Won', lost: 'Lost', push: 'Push', cashedout: 'Cashed out' };
const RESULT_CLASS = { won: 'border-positive/50 bg-positive/10 text-positive', lost: 'border-trim/50 bg-trim/10 text-trim-ink', push: 'border-border/50 bg-raised/40 text-muted-foreground', cashedout: 'border-gold/50 bg-gold/10 text-gold' };
const credits = value => `${Number(value).toLocaleString()} cr`;
const betType = bet => bet.teaser ? 'Teaser' : bet.roundRobin ? 'Round robin' : bet.parlay ? 'Parlay' : MARKET_LABEL[bet.legs?.[0]?.market] || 'Bet';

// Live bet tracking: open positions with countdown status and early cash-out,
// automatic settlement against real finals, bet analytics and the ledger.
export default function BetTracker({ book, format, cashOutFor, onSettle, onVoid, onCashOut, onCheckFinals, checking, feedReady, onReset }) {
  const open = book.bets.filter(bet => bet.status === 'open');
  const settled = book.bets.filter(bet => bet.status !== 'open').reverse();
  const risk = open.reduce((sum, bet) => sum + bet.stake, 0);
  const wins = settled.filter(bet => bet.status === 'won').length;
  const losses = settled.filter(bet => bet.status === 'lost').length;
  const pushes = settled.filter(bet => bet.status === 'push').length;
  const net = settled.reduce((sum, bet) => sum + (bet.profit || 0), 0);
  const settledStake = settled.reduce((sum, bet) => sum + bet.stake, 0);
  const decided = wins + losses;
  const analytics = [
    ['Return on investment', settledStake ? `${Math.round(net / settledStake * 100)}%` : '—'],
    ['Hit rate', decided ? `${Math.round(wins / decided * 100)}%` : '—'],
    ['Avg stake', settled.length ? credits(Math.round(settledStake / settled.length)) : '—'],
    ['Biggest win', credits(settled.reduce((max, bet) => Math.max(max, bet.profit || 0), 0))],
  ];
  return <section className="space-y-4" aria-label="Bet tracker">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="metric-tile"><p className="bcast-kicker mb-1">Bankroll</p><p className="font-display text-2xl tracking-wide text-foreground">{credits(book.bankroll)}</p></div>
      <div className="metric-tile"><p className="bcast-kicker mb-1">Open risk</p><p className="font-display text-2xl tracking-wide text-foreground">{credits(risk)}</p></div>
      <div className="metric-tile"><p className="bcast-kicker mb-1">Record</p><p className="font-display text-2xl tracking-wide text-foreground">{wins}-{losses}-{pushes}</p></div>
      <div className="metric-tile"><p className="bcast-kicker mb-1">Net result</p><p className={`font-display text-2xl tracking-wide ${net > 0 ? 'text-positive' : net < 0 ? 'text-trim-ink' : 'text-foreground'}`}>{net > 0 ? '+' : ''}{credits(net)}</p></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {analytics.map(([label, value]) => <div key={label} className="metric-tile"><p className="bcast-kicker mb-1">{label}</p><p className="font-display text-2xl tracking-wide text-foreground">{value}</p></div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-xl tracking-wide text-foreground">OPEN BETS · {open.length}</h2>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCheckFinals} disabled={checking || !feedReady || open.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
          <RefreshCcw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />Check finals now
        </button>
        <button type="button" onClick={() => { if (window.confirm('Reset the book? This clears every bet and restores the starting bankroll.')) onReset(); }} className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />Reset book
        </button>
      </div>
    </div>
    {open.length === 0 ? <div className="court-panel grid place-items-center p-8 text-sm text-muted-foreground">No open bets — price one on the odds board.</div> :
      <ul className="space-y-3">{open.map(bet => {
        const cashOut = cashOutFor(bet);
        return <li key={bet.id} className="court-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><p className="font-display text-lg tracking-wide text-foreground">{bet.parlay ? `${bet.legs.length}-leg parlay` : bet.legs[0].label}</p><p className="text-[11px] text-muted-foreground">{bet.matchup} · {commenceStatus(bet.commenceTime)}</p></div>
            <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true"></span>{betType(bet)}</span>
          </div>
          {bet.parlay && <ul className="mt-2 grid gap-1 sm:grid-cols-2">{bet.legs.map((leg, index) => <li key={index} className="flex items-center gap-2 rounded-md border border-border/30 bg-raised/30 px-2.5 py-1.5 text-[11px]"><span className="min-w-0 flex-1 truncate text-foreground">{leg.label}</span><span className="font-mono text-gold">{formatOdds(leg.price, format)}</span></li>)}</ul>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="font-mono text-gold">{formatOdds(bet.price, format)}</span>
            <span className="text-muted-foreground">Stake <span className="font-mono text-foreground">{credits(bet.stake)}</span></span>
            <span className="text-muted-foreground">To return <span className="font-mono text-foreground">{credits(bet.stake + profitFor(bet.stake, bet.price))}</span></span>
            <span className="ml-auto flex flex-wrap gap-2">
              {Number.isFinite(cashOut) && !bet.teaser && <button type="button" onClick={() => onCashOut(bet.id)} className="rounded-md border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-gold hover:bg-gold/20">Cash out {credits(cashOut)}</button>}
              <button type="button" onClick={() => onSettle(bet.id, 'won')} className="rounded-md border border-positive/50 bg-positive/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-positive hover:bg-positive/20">Won</button>
              <button type="button" onClick={() => onSettle(bet.id, 'lost')} className="rounded-md border border-trim/50 bg-trim/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-trim-ink hover:bg-trim/20">Lost</button>
              <button type="button" onClick={() => onSettle(bet.id, 'push')} className="rounded-md border border-border/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">Push</button>
              <button type="button" onClick={() => onVoid(bet.id)} className="rounded-md border border-border/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">Void</button>
            </span>
          </div>
        </li>;
      })}</ul>}
    <h2 className="pt-2 font-display text-xl tracking-wide text-foreground">SETTLED · {settled.length}</h2>
    {settled.length === 0 ? <div className="court-panel grid place-items-center p-8 text-sm text-muted-foreground">Nothing settled yet.</div> :
      <ul className="space-y-2">{settled.map(bet => <li key={bet.id} className="court-panel flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
        <span className={`inline-flex min-w-20 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${RESULT_CLASS[bet.status]}`}><Trophy className="h-3 w-3" aria-hidden="true" />{RESULT_LABEL[bet.status] || bet.status}</span>
        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">{betType(bet)}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{bet.parlay ? `${bet.legs.length}-leg parlay · ${bet.legs[0].label}…` : bet.legs[0].label}</span>
        <span className="text-muted-foreground">{bet.matchup}</span>
        <span className="text-muted-foreground">Stake {credits(bet.stake)}</span>
        <span className={`font-mono font-semibold ${(bet.profit || 0) > 0 ? 'text-positive' : (bet.profit || 0) < 0 ? 'text-trim-ink' : 'text-muted-foreground'}`}>{(bet.profit || 0) > 0 ? '+' : ''}{credits(bet.profit || 0)}</span>
      </li>)}</ul>}
  </section>;
}
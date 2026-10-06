import React from 'react';
import { CheckCircle2, XCircle, CircleDashed, Handshake, Gavel } from 'lucide-react';
import { formatOdds, commenceStatus } from '@/components/book/betsMath';
import { dollars, signedDollars } from '@/components/realbook/realFormat';

const STATUS_META = {
  open: { label: 'Open', className: 'border-gold/40 text-gold', icon: CircleDashed },
  won: { label: 'Won', className: 'border-positive/60 text-positive', icon: CheckCircle2 },
  lost: { label: 'Lost', className: 'border-trim/60 text-trim-ink', icon: XCircle },
  push: { label: 'Push', className: 'border-border/60 text-muted-foreground', icon: Handshake },
  cashedout: { label: 'Cashed out', className: 'border-border/60 text-muted-foreground', icon: CircleDashed },
};
const MODE_LABEL = { single: 'Single', parlay: 'Parlay', roundrobin: 'Round robin', teaser: 'Teaser' };

// Real-money bet ledger: open wagers with server-side settlement against
// official finals, and the settled history in dollars.
export default function RealBetList({ bets, format, onSettle, settling, feedReady }) {
  const open = bets.filter(bet => bet.status === 'open');
  const settled = bets.filter(bet => bet.status !== 'open');
  const renderBet = bet => {
    const meta = STATUS_META[bet.status] || STATUS_META.open;
    const Icon = meta.icon;
    return <article key={bet.id} className="court-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{bet.matchup}</p>
          <p className="text-[11px] text-muted-foreground">{MODE_LABEL[bet.mode] || bet.mode} · {bet.legs?.length || 0} leg{(bet.legs?.length || 0) === 1 ? '' : 's'} · {commenceStatus(bet.commence_time)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-gold">{formatOdds(bet.price_american, format)}</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ${meta.className}`}><Icon className="h-3 w-3" aria-hidden="true" />{meta.label}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1">{(bet.legs || []).map((leg, index) => <li key={index} className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-raised/30 px-2.5 py-1.5">
        <span className="min-w-0 truncate text-[11px] text-foreground">{leg.label}</span>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatOdds(leg.price, format)}</span>
      </li>)}</ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/30 pt-2 text-[11px]">
        <span className="text-muted-foreground">Stake <span className="font-mono font-semibold text-foreground">{dollars(bet.stake_cents)}</span></span>
        {bet.status !== 'open' && <span className="text-muted-foreground">Result <span className={`font-mono font-semibold ${Number(bet.settled_profit_cents) >= 0 ? 'text-positive' : 'text-trim-ink'}`}>{signedDollars(bet.settled_profit_cents)}</span></span>}
      </div>
    </article>;
  };
  return <section className="space-y-4" aria-label="My real-money bets">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="bcast-kicker mb-1">Server-settled · official finals</p><h2 className="font-display text-xl tracking-wide text-foreground">MY REAL BETS</h2></div>
      <button type="button" onClick={onSettle} disabled={settling || !open.length || !feedReady} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">
        {settling ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Gavel className="h-3.5 w-3.5" aria-hidden="true" />}Settle vs finals
      </button>
    </div>
    {open.length > 0 && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">Open · {open.length}</p><div className="space-y-3">{open.map(renderBet)}</div></div>}
    {settled.length > 0 && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Settled · {settled.length}</p><div className="space-y-3">{settled.map(renderBet)}</div></div>}
    {bets.length === 0 && <div className="court-panel grid place-items-center p-10 text-sm text-muted-foreground">No real-money bets yet — price one on the board.</div>}
    {!feedReady && open.length > 0 && <p className="text-[11px] text-muted-foreground">Settlement waits on the official-finals feed (ODDS_API_KEY on the dashboard Secrets page). Bets stay open until real finals arrive.</p>}
  </section>;
}
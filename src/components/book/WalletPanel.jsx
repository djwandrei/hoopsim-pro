import React, { useEffect, useState } from 'react';
import { Wallet, Gift, History } from 'lucide-react';

const TYPE_LABEL = { bet: 'Wager', payout: 'Payout', bonus: 'Daily bonus', cashout: 'Cash out', void: 'Void', reset: 'Reset' };

// SwishIQ Credits wallet: balance, the daily sportsbook bonus, and the last
// wallet movements (wagers, payouts, cash-outs, bonuses).
export default function WalletPanel({ bankroll, ledger, bonusReady, onClaim }) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 30000); return () => clearInterval(id); }, []);
  const shown = (ledger || []).slice(0, 6);
  return <section className="court-panel p-4" aria-label="Studio wallet">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="bcast-kicker flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" aria-hidden="true" />SwishIQ credits</p>
      {bonusReady ? <button type="button" onClick={onClaim} className="inline-flex items-center gap-1.5 rounded-lg border border-positive/50 bg-positive/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-positive transition-colors hover:bg-positive/20"><Gift className="h-3.5 w-3.5" aria-hidden="true" />Claim +250 daily bonus</button> :
        <span className="rounded-lg border border-border/50 px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Daily bonus on cooldown</span>}
    </div>
    <p className="mt-1 font-display text-3xl tracking-wide text-foreground">{bankroll.toLocaleString()} cr</p>
    <p className="mt-1 text-[11px] text-muted-foreground">Play-money currency for this studio's book. A fresh +250 credit grant unlocks every 24 hours.</p>
    {shown.length > 0 && <div className="mt-3 border-t border-border/30 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><History className="h-3 w-3" aria-hidden="true" />Recent movements</p>
      <ul className="space-y-1.5">{shown.map(entry => <li key={entry.id} className="flex items-center gap-2 text-[11px]">
        <span className="w-16 shrink-0 text-muted-foreground">{TYPE_LABEL[entry.type] || entry.type}</span>
        <span className="min-w-0 flex-1 truncate text-foreground">{entry.label}</span>
        <span className={`shrink-0 font-mono font-semibold ${entry.amount > 0 ? 'text-positive' : 'text-trim-ink'}`}>{entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()} cr</span>
      </li>)}</ul>
    </div>}
  </section>;
}
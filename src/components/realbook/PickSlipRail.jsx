import React, { useState } from 'react';
import RealBetSlip from '@/components/realbook/RealBetSlip';
import RealBetList from '@/components/realbook/RealBetList';

// Right-rail Pick Slip from the mockup: a titled panel with Bet Slip and
// My Bets tabs; the wager slip and the server-settled ledger live inside it.
export default function PickSlipRail({ legs, wallet, format, busy, onRemoveLeg, onClear, onPlace, bets, onSettle, settling, feedReady }) {
  const [view, setView] = useState('slip');
  const openCount = bets.filter(bet => bet.status === 'open').length;
  const tabClass = value => `rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${view === value ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`;
  return <section className="court-panel p-3" aria-label="Pick slip">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2.5">
      <p className="font-display text-lg tracking-wide text-foreground">PICK SLIP</p>
      <div className="flex rounded-lg border border-border/50 p-1" role="group" aria-label="Pick slip views">
        <button type="button" onClick={() => setView('slip')} className={tabClass('slip')}>Bet slip{legs.length ? ` · ${legs.length}` : ''}</button>
        <button type="button" onClick={() => setView('bets')} className={tabClass('bets')}>My bets{openCount ? ` · ${openCount}` : ''}</button>
      </div>
    </div>
    {view === 'slip'
      ? <RealBetSlip legs={legs} wallet={wallet} format={format} busy={busy} onRemoveLeg={onRemoveLeg} onClear={onClear} onPlace={onPlace} />
      : <RealBetList bets={bets} format={format} feedReady={feedReady} settling={settling} onSettle={onSettle} />}
  </section>;
}
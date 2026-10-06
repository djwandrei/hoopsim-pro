import React, { useState } from 'react';

// Right-rail Pick Slip from the mockup, shared by both books: a titled panel
// with Bet Slip and My Bets tabs; the caller supplies the two panels.
export default function PickSlipRail({ legsCount = 0, openCount = 0, slip, bets }) {
  const [view, setView] = useState('slip');
  const tabClass = value => `rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${view === value ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`;
  return <section className="court-panel p-3" aria-label="Pick slip">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2.5">
      <p className="font-display text-lg tracking-wide text-foreground">PICK SLIP</p>
      <div className="flex rounded-lg border border-border/50 p-1" role="group" aria-label="Pick slip views">
        <button type="button" onClick={() => setView('slip')} className={tabClass('slip')}>Bet slip{legsCount ? ` · ${legsCount}` : ''}</button>
        <button type="button" onClick={() => setView('bets')} className={tabClass('bets')}>My bets{openCount ? ` · ${openCount}` : ''}</button>
      </div>
    </div>
    {view === 'slip' ? slip : bets}
  </section>;
}
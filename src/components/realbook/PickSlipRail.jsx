import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Right-rail Pick Slip from the mockup, shared by both books: a titled panel
// with Bet Slip and My Bets tabs; the caller supplies the two panels.
export default function PickSlipRail({ legsCount = 0, openCount = 0, slip, bets }) {
  const [view, setView] = useState('slip');
  const [mobileOpen, setMobileOpen] = useState(false);
  const contentId = useId();
  const tabClass = value => `rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${view === value ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`;
  return <section className="book-slip-rail court-panel p-3 shadow-2xl lg:shadow-none" aria-label="Pick slip">
    <div className={`flex flex-wrap items-center justify-between gap-2 border-border/30 ${mobileOpen ? 'mb-3 border-b pb-2.5' : 'lg:mb-3 lg:border-b lg:pb-2.5'}`}>
      <p className="font-display text-lg tracking-wide text-foreground">PICK SLIP</p>
      <button type="button" onClick={() => setMobileOpen(value => !value)} aria-expanded={mobileOpen} aria-controls={contentId} className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold lg:hidden">
        <span>{legsCount ? `${legsCount} pick${legsCount === 1 ? '' : 's'}` : 'Build a slip'}</span>
        {mobileOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
      </button>
      <div className="hidden rounded-lg border border-border/50 p-1 lg:flex" role="group" aria-label="Pick slip views">
        <button type="button" onClick={() => setView('slip')} className={tabClass('slip')}>Bet slip{legsCount ? ` · ${legsCount}` : ''}</button>
        <button type="button" onClick={() => setView('bets')} className={tabClass('bets')}>My bets{openCount ? ` · ${openCount}` : ''}</button>
      </div>
    </div>
    <div className={`${mobileOpen ? 'block' : 'hidden'} lg:block`} id={contentId}>
      <div className="mb-2 flex rounded-lg border border-border/50 p-1 lg:hidden" role="group" aria-label="Pick slip views">
        <button type="button" onClick={() => setView('slip')} className={`${tabClass('slip')} flex-1`}>Bet slip{legsCount ? ` · ${legsCount}` : ''}</button>
        <button type="button" onClick={() => setView('bets')} className={`${tabClass('bets')} flex-1`}>My bets{openCount ? ` · ${openCount}` : ''}</button>
      </div>
      {view === 'slip' ? slip : bets}
    </div>
  </section>;
}

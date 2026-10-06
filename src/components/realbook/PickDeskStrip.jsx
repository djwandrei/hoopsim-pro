import React from 'react';
import { Link } from 'react-router-dom';
import { Dice5, UserRound } from 'lucide-react';
import { dollars } from '@/components/realbook/realFormat';

const TABS = [['events', 'Events'], ['featured', 'Featured'], ['wallet', 'Wallet & Limits']];

// Dark sub-nav strip from the mockup: section tabs on the left; wallet
// balance, odds format and sibling links on the right.
export default function PickDeskStrip({ tab, onTab, balanceCents, format, onFormat }) {
  return <nav className="border-b border-gold/25 bg-surface" aria-label="Pick Desk sections">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
      <div className="flex flex-wrap items-center">
        {TABS.map(([value, label]) => <button key={value} type="button" onClick={() => onTab(value)} aria-current={tab === value ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${tab === value ? 'border-gold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1" role="group" aria-label="Odds format">
          {['american', 'decimal'].map(option => <button key={option} type="button" onClick={() => onFormat(option)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${format === option ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>)}
        </div>
        <Link to="/book" className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"><Dice5 className="h-3.5 w-3.5" aria-hidden="true" />Play-money</Link>
        <Link to="/account" className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />Account</Link>
        <span className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-xs font-bold text-gold" aria-label="Real-money balance">{dollars(balanceCents)}</span>
      </div>
    </div>
  </nav>;
}
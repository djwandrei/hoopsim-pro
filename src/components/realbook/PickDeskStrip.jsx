import React from 'react';
import { Link } from 'react-router-dom';
import { Dice5, UserRound } from 'lucide-react';

const TABS = [['events', 'Events'], ['featured', 'Featured'], ['wallet', 'Wallet & Limits']];
const LINKS = [{ to: '/book', label: 'Play-money', Icon: Dice5 }, { to: '/account', label: 'Account', Icon: UserRound }];

const linkClass = variant => `inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${variant === 'accent' ? 'border-positive/50 bg-positive/10 text-positive hover:bg-positive/20' : variant === 'gold' ? 'border-gold/40 bg-gold/10 text-gold hover:bg-gold/20' : 'border-border/50 text-muted-foreground hover:text-foreground'}`;

// Dark sub-nav strip from the mockup, shared by both books: section tabs on
// the left; odds format, sibling links and the balance chip on the right.
export default function PickDeskStrip({ tab, onTab, tabs = TABS, format, onFormat, balance, links = LINKS }) {
  return <nav className="border-b border-gold/25 bg-surface" aria-label="Pick Desk sections">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
      <div className="flex flex-wrap items-center">
        {tabs.map(([value, label]) => <button key={value} type="button" onClick={() => onTab(value)} aria-current={tab === value ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${tab === value ? 'border-gold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 py-2">
        {onFormat && <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1" role="group" aria-label="Odds format">
          {['american', 'decimal'].map(option => <button key={option} type="button" onClick={() => onFormat(option)} className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${format === option ? 'bg-gold/15 text-gold' : 'text-muted-foreground hover:text-foreground'}`}>{option}</button>)}
        </div>}
        {links.map(({ to, label, Icon, onClick, accent, gold }) => {
          const content = <>{Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}</>;
          return to
            ? <Link key={label} to={to} className={linkClass(accent || gold)}>{content}</Link>
            : <button key={label} type="button" onClick={onClick} className={linkClass(accent || gold)}>{content}</button>;
        })}
        {balance}
      </div>
    </div>
  </nav>;
}
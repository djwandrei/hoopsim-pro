import React, { useState } from 'react';
import { formatAmerican, profitFor } from '@/components/book/betsMath';

const MARKET_LABEL = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' };

// The bet slip: one selected price, a play-money stake, and the payout math
// at the real American odds before the wager lands on the tracker.
export default function BetSlip({ slip, bankroll, onPlace, onClear }) {
  const [stake, setStake] = useState('');
  if (!slip) return <section className="court-panel p-4"><p className="bcast-kicker mb-2">Bet slip</p><p className="text-xs leading-relaxed text-muted-foreground">Select a price on the board to price a wager against your studio bankroll.</p></section>;
  const value = Number(stake);
  const valid = Number.isFinite(value) && value > 0 && value <= bankroll;
  const win = valid ? profitFor(value, slip.price) : null;
  return <section className="court-panel p-4">
    <div className="flex items-center justify-between gap-2"><p className="bcast-kicker">Bet slip</p><button type="button" onClick={() => { setStake(''); onClear(); }} className="text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">Clear</button></div>
    <p className="mt-2 font-display text-lg tracking-wide text-foreground">{slip.label}</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{slip.matchup} · {MARKET_LABEL[slip.market]} · <span className="font-mono text-gold">{formatAmerican(slip.price)}</span> · best on {slip.book}</p>
    <label className="mt-3 block">
      <span className="mb-2 block text-xs font-medium text-muted-foreground">Stake (studio credits) · bankroll {bankroll.toLocaleString()}</span>
      <input type="number" min="1" step="1" value={stake} onChange={event => setStake(event.target.value)} placeholder="e.g. 50" className="studio-select" />
    </label>
    <div className="mt-2 flex gap-2">{[10, 25, 50, 100].map(amount => <button key={amount} type="button" onClick={() => setStake(String(amount))} className="rounded-md border border-border/50 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold">{amount}</button>)}</div>
    <div className="mt-3 rounded-lg border border-border/40 bg-raised/40 p-3 text-xs">
      <div className="flex justify-between"><span className="text-muted-foreground">To return</span><span className="font-mono text-foreground">{valid ? `${(value + win).toLocaleString(undefined, { maximumFractionDigits: 2 })} cr` : '—'}</span></div>
      <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Profit if it wins</span><span className="font-mono text-positive">{valid ? `+${win.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</span></div>
    </div>
    {stake !== '' && !valid && <p className="mt-2 text-[11px] text-trim-ink">Enter a stake between 1 and your bankroll.</p>}
    <button type="button" disabled={!valid} onClick={() => onPlace({ ...slip, stake: value })} className="mt-3 w-full rounded-lg bg-gold py-2.5 text-xs font-semibold uppercase tracking-widest text-canvas transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">Place bet</button>
  </section>;
}
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { formatOdds, profitFor, parlayAmerican } from '@/components/book/betsMath';

const MARKET_LABEL = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total' };

// The bet slip: stack single or same-game legs into a parlay, price the
// combined odds, and stake play-money credits against the payout math.
export default function BetSlip({ legs, bankroll, format, onRemoveLeg, onClear, onPlace }) {
  const [stake, setStake] = useState('');
  if (legs.length === 0) return <section className="court-panel p-4"><p className="bcast-kicker mb-2">Bet slip</p><p className="text-xs leading-relaxed text-muted-foreground">Select a price on the board to price a wager. Stack more picks to build a parlay.</p></section>;
  const composite = parlayAmerican(legs);
  const value = Number(stake);
  const valid = Number.isFinite(value) && value > 0 && value <= bankroll;
  const win = valid ? profitFor(value, composite) : null;
  return <section className="court-panel p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="bcast-kicker">{legs.length > 1 ? `${legs.length}-leg parlay` : 'Bet slip'}</p>
      <button type="button" onClick={() => { setStake(''); onClear(); }} className="text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">Clear</button>
    </div>
    <ul className="mt-2 space-y-2">{legs.map((leg, index) => <li key={`${leg.eventKey}-${leg.market}-${index}`} className="flex items-center gap-2 rounded-lg border border-border/40 bg-raised/40 p-2">
      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-foreground">{leg.label}</span><span className="block truncate text-[10px] text-muted-foreground">{leg.matchup} · {MARKET_LABEL[leg.market]}</span></span>
      <span className="font-mono text-xs font-semibold text-gold">{formatOdds(leg.price, format)}</span>
      <button type="button" onClick={() => onRemoveLeg(index)} aria-label={`Remove ${leg.label} from slip`} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-trim-ink"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </li>)}</ul>
    {legs.length > 1 && <p className="mt-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-muted-foreground">Combined price <span className="font-mono text-gold">{formatOdds(composite, format)}</span> — every leg must win for the parlay to pay.</p>}
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
    <button type="button" disabled={!valid} onClick={() => onPlace({ legs, stake: value })} className="mt-3 w-full rounded-lg bg-gold py-2.5 text-xs font-semibold uppercase tracking-widest text-canvas transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40">Place bet</button>
  </section>;
}
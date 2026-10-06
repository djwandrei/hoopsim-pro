import React, { useState } from 'react';
import { X, Receipt } from 'lucide-react';
import { formatOdds, profitFor, parlayAmerican, teaserPrice, roundRobinCombos } from '@/components/book/betsMath';
import { dollars, signedDollars } from '@/components/realbook/realFormat';

const MARKET_LABEL = { moneyline: 'ML', spread: 'Spread', total: 'Total' };
const MODE_LABEL = { parlay: 'Parlay', roundrobin: 'Round robin', teaser: 'Teaser' };
const edgeChip = edge => <span className={`shrink-0 rounded border px-1 py-px font-mono text-[10px] ${edge >= 0 ? 'border-positive/60 text-positive' : 'border-border/50 text-muted-foreground'}`} title="Studio model edge vs this price">{edge >= 0 ? '+' : ''}{edge.toFixed(1)}</span>;

// Real-money bet slip: same modes and math as the play-money slip, priced in
// dollars against the server wallet. The server re-prices and re-validates
// everything at placement; this is the convenience view.
export default function RealBetSlip({ legs, wallet, format, onRemoveLeg, onClear, onPlace, busy }) {
  const [stakeDollars, setStakeDollars] = useState('');
  const [modeChoice, setModeChoice] = useState('parlay');
  const balanceCents = Number(wallet?.balance_cents) || 0;
  if (legs.length === 0) return <section className="court-panel p-4" aria-label="Bet slip">
    <p className="bcast-kicker mb-2"><Receipt className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Bet slip</p>
    <p className="text-xs leading-relaxed text-muted-foreground">Select a price on the board to price a real-money wager — one pick per game, $1–$500 per combo. Stakes come from your deposited balance.</p>
  </section>;
  const teaserEligible = legs.length >= 2 && legs.every(leg => leg.market === 'spread' || leg.market === 'total');
  const rrEligible = legs.length >= 3 && legs.length <= 6;
  const mode = modeChoice === 'teaser' && teaserEligible ? 'teaser' : modeChoice === 'roundrobin' && rrEligible ? 'roundrobin' : 'parlay';
  const combos = mode === 'roundrobin' ? roundRobinCombos(legs, 2) : [];
  const comboPrices = mode === 'roundrobin' ? combos.map(parlayAmerican) : [];
  const price = mode === 'teaser' ? teaserPrice(legs.length) : mode === 'roundrobin' ? comboPrices[0] : parlayAmerican(legs);
  const stakeCents = Math.round(Number(stakeDollars) * 100);
  const outlay = Number.isFinite(stakeCents) && stakeCents > 0 && mode === 'roundrobin' ? stakeCents * combos.length : stakeCents;
  const maxComboWin = Number.isFinite(stakeCents) && (mode === 'roundrobin' && combos.length
    ? Math.max(...comboPrices.map(comboPrice => profitFor(stakeCents, comboPrice)))
    : profitFor(stakeCents, price));
  const overCap = Number.isFinite(maxComboWin) && maxComboWin > 2500000;
  const valid = Number.isFinite(stakeCents) && stakeCents >= 100 && stakeCents <= 50000 && outlay <= balanceCents && !overCap;
  const win = valid ? (mode === 'roundrobin' ? combos.reduce((sum, _, index) => sum + profitFor(stakeCents, comboPrices[index]), 0) : profitFor(stakeCents, price)) : null;
  const totalReturn = valid ? outlay + win : null;
  return <section className="court-panel p-4" aria-label="Bet slip">
    <div className="flex items-center justify-between gap-2">
      <p className="bcast-kicker">{legs.length > 1 ? (mode === 'roundrobin' ? `Round robin · ${combos.length} combos` : `${legs.length}-leg ${MODE_LABEL[mode].toLowerCase()}`) : 'Bet slip · 1 pick'}</p>
      <button type="button" onClick={() => { setStakeDollars(''); onClear(); }} className="text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-trim-ink">Clear</button>
    </div>
    <ul className="mt-2 space-y-1.5">{legs.map((leg, index) => <li key={`${leg.eventKey}-${leg.market}-${index}`} className="flex items-center gap-2 rounded-lg border border-border/40 bg-raised/40 p-2">
      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-foreground">{leg.label}</span><span className="block truncate text-[10px] text-muted-foreground">{leg.matchup} · {MARKET_LABEL[leg.market]}</span></span>
      {Number.isFinite(leg.modelEdge) && edgeChip(leg.modelEdge)}
      <span className="shrink-0 font-mono text-xs font-bold text-gold">{formatOdds(leg.price, format)}</span>
      <button type="button" onClick={() => onRemoveLeg(index)} aria-label={`Remove ${leg.label} from slip`} className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-trim-ink"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </li>)}</ul>
    <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">One pick per game — correlated same-game parlays aren't offered.</p>
    {legs.length >= 2 && <div className="mt-2 flex flex-wrap gap-1.5">
      {['parlay', ...(rrEligible ? ['roundrobin'] : []), ...(teaserEligible ? ['teaser'] : [])].map(option => <button key={option} type="button" onClick={() => setModeChoice(option)} className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors ${mode === option ? 'border-gold/50 bg-gold/15 text-gold' : 'border-border/50 text-muted-foreground hover:text-foreground'}`}>{MODE_LABEL[option]}</button>)}
    </div>}
    {legs.length > 1 && mode !== 'teaser' && <p className="mt-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-muted-foreground">Combined price <span className="font-mono font-semibold text-gold">{formatOdds(price, format)}</span> — {mode === 'roundrobin' ? `${combos.length} two-leg combos, staked per combo (${comboPrices.map(comboPrice => formatOdds(comboPrice, format)).join(', ')}).` : 'every leg must win for the parlay to pay.'}</p>}
    {mode === 'teaser' && <p className="mt-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-[11px] text-muted-foreground">6-point teaser: spreads +6, totals move 6 your way, payout <span className="font-mono font-semibold text-gold">{formatOdds(price, format)}</span> — every leg must still win.</p>}
    <label className="mt-3 block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs"><span className="font-medium text-muted-foreground">Stake (USD)</span><span className="font-mono text-[11px] text-gold">{dollars(balanceCents)} available{mode === 'roundrobin' ? ` · ${combos.length}× combos` : ''}</span></span>
      <input type="number" min="1" max="500" step="1" value={stakeDollars} onChange={event => setStakeDollars(event.target.value)} placeholder="e.g. 25" className="studio-select" />
    </label>
    <div className="mt-2 flex gap-1.5">{[5, 10, 25, 50].map(amount => <button key={amount} type="button" onClick={() => setStakeDollars(String(amount))} className="rounded-md border border-border/50 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold">${amount}</button>)}</div>
    <div className="slip-ticket mt-3 text-xs">
      {mode === 'roundrobin' && <div className="flex justify-between"><span className="text-muted-foreground">Total outlay</span><span className="font-mono text-foreground">{valid ? dollars(outlay) : '—'}</span></div>}
      <div className={`flex justify-between ${mode === 'roundrobin' ? 'mt-1' : ''}`}><span className="text-muted-foreground">To return if all win</span><span className="font-mono text-foreground">{valid ? dollars(totalReturn) : '—'}</span></div>
      <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Profit if it wins</span><span className="font-mono font-semibold text-positive">{valid ? signedDollars(win) : '—'}</span></div>
    </div>
    {overCap && <p className="mt-2 text-[11px] text-trim-ink">Max payout per combo is $25,000 — reduce the stake.</p>}
    {!overCap && stakeDollars !== '' && !valid && <p className="mt-2 text-[11px] text-trim-ink">Stake must be $1–$500 per combo and within your available balance.</p>}
    <button type="button" disabled={!valid || busy} onClick={() => onPlace({ legs, stakeCents, mode })} className="book-cta shine-sweep mt-3 w-full rounded-lg bg-gradient-to-r from-gold to-goldSoft py-2.5 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">{busy ? 'Placing…' : 'Place real-money bet'}</button>
    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Settled by official finals. Wagers can't be cancelled once placed; the book accepts at the live market price and refuses stale or moved lines. Max payout $25,000 per combo. No cash-out in this mode. 21+ · Gambling problem? Call 1-800-GAMBLER.</p>
  </section>;
}
import React, { useState } from 'react';
import { Wallet, ShieldAlert, Loader2 } from 'lucide-react';
import { dollars, signedDollars } from '@/components/realbook/realFormat';

const TYPE_LABEL = { deposit: 'Deposit', withdrawal: 'Withdrawal', bet: 'Wager', payout: 'Payout', void: 'Push/void' };

// Real-money wallet: Stripe deposits, payout requests, responsible-gaming
// limits and self-exclusion, plus the recent ledger. All actions go through
// the server-side real-book functions — the balance shown here is the
// server's number, never a local one.
export default function RealWalletPanel({ wallet, profile, transactions, busy, onDeposit, onWithdraw, onLimits, onSelfExclude }) {
  const [depositDollars, setDepositDollars] = useState('');
  const [withdrawDollars, setWithdrawDollars] = useState('');
  const [exclusionDays, setExclusionDays] = useState('7');
  const [depositLimit, setDepositLimit] = useState(() => String(((Number(profile?.daily_deposit_limit_cents) || 0) / 100).toFixed(0)));
  const [lossLimit, setLossLimit] = useState(() => String(((Number(profile?.daily_loss_limit_cents) || 0) / 100).toFixed(0)));
  const balance = Number(wallet?.balance_cents) || 0;
  const pending = Number(wallet?.pending_withdrawal_cents) || 0;
  const depositValue = Math.round(Number(depositDollars) * 100);
  const withdrawValue = Math.round(Number(withdrawDollars) * 100);
  return <section className="court-panel p-4" aria-label="Real-money wallet">
    <p className="bcast-kicker mb-3"><Wallet className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Real-money wallet</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-gold/30 bg-gold/5 p-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Available balance</p>
        <p className="broadcast-gradient-text font-display text-3xl">{dollars(balance)}</p>
      </div>
      <div className="rounded-xl border border-border/40 bg-raised/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <p>Pending payout: <span className="font-mono text-foreground">{dollars(pending)}</span></p>
        <p>Lifetime deposited: <span className="font-mono text-foreground">{dollars(wallet?.lifetime_deposited_cents)}</span></p>
        <p>Lifetime withdrawn: <span className="font-mono text-foreground">{dollars(wallet?.lifetime_withdrawn_cents)}</span></p>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Deposit (Stripe)</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {[25, 50, 100, 250].map(amount => <button key={amount} type="button" disabled={busy} onClick={() => onDeposit(amount * 100)} className="rounded-md border border-border/50 px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40">${amount}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min="10" max="2000" step="1" value={depositDollars} onChange={event => setDepositDollars(event.target.value)} placeholder="Custom amount ($10–$2,000)" className="studio-select" />
        <button type="button" disabled={busy || !Number.isFinite(depositValue) || depositValue < 1000 || depositValue > 200000} onClick={() => onDeposit(depositValue)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-gold to-goldSoft px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Deposit'}</button>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Request withdrawal (min $20 · one pending payout at a time · unsettled wagers block payouts)</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" min="20" step="1" value={withdrawDollars} onChange={event => setWithdrawDollars(event.target.value)} placeholder="Amount" className="studio-select" />
        <button type="button" disabled={busy || pending > 0 || !Number.isFinite(withdrawValue) || withdrawValue < 2000 || withdrawValue > balance} onClick={() => onWithdraw(withdrawValue)} className="shrink-0 rounded-lg border border-border/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40">Withdraw</button>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Responsible-gaming limits (per UTC day · decreases apply now, increases after 24h)</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Daily deposit limit ($)</span><input type="number" min="10" step="1" value={depositLimit} onChange={event => setDepositLimit(event.target.value)} className="studio-select" /></label>
        <label className="block"><span className="mb-1 block text-[11px] text-muted-foreground">Daily loss limit ($)</span><input type="number" min="0" step="1" value={lossLimit} onChange={event => setLossLimit(event.target.value)} className="studio-select" /></label>
      </div>
      <button type="button" disabled={busy} onClick={() => onLimits({ depositCents: Math.max(0, Math.round(Number(depositLimit) * 100)), lossCents: Math.max(0, Math.round(Number(lossLimit) * 100)) })} className="w-full rounded-lg border border-gold/40 bg-gold/10 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40">Save limits</button>
    </div>
    <div className="mt-4 rounded-xl border border-trim/40 bg-trim/5 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-trim-ink"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Self-exclusion</p>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">Excludes you from the real-money book immediately — deposits, withdrawals and wagers are all refused, and open wagers are voided with stakes refunded. Cool-offs apply for the full chosen period.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={exclusionDays} onChange={event => setExclusionDays(event.target.value)} className="studio-select w-auto flex-1" aria-label="Exclusion period">
          <option value="1">1-day cool-off</option>
          <option value="3">3-day cool-off</option>
          <option value="7">7-day self-exclusion</option>
          <option value="30">30-day self-exclusion</option>
          <option value="permanent">Permanent self-exclusion</option>
        </select>
        <button type="button" disabled={busy} onClick={() => { if (window.confirm('Lock out of the real-money book now? Open wagers are voided and refunded.')) onSelfExclude(exclusionDays === 'permanent' ? 'permanent' : Number(exclusionDays)); }} className="shrink-0 rounded-lg border border-trim/50 bg-trim/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-trim-ink transition-colors hover:bg-trim/20 disabled:opacity-40">Lock out now</button>
      </div>
    </div>
    <div className="mt-4">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent activity</p>
      <ul className="space-y-1.5">{(transactions || []).slice(0, 10).map(entry => <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-raised/40 px-3 py-2">
        <span className="min-w-0"><span className="block truncate text-[11px] font-medium text-foreground">{entry.label || TYPE_LABEL[entry.type] || entry.type}</span><span className="block text-[10px] text-muted-foreground">{entry.type} · {entry.status}</span></span>
        <span className={`shrink-0 font-mono text-xs font-bold ${Number(entry.amount_cents) >= 0 ? 'text-positive' : 'text-trim-ink'}`}>{signedDollars(entry.amount_cents)}</span>
      </li>)}
      {!(transactions || []).length && <li className="rounded-lg border border-dashed border-border/40 px-3 py-4 text-center text-[11px] text-muted-foreground">No wallet activity yet.</li>}
      </ul>
    </div>
    <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">Deposit processing activates once STRIPE_SECRET_KEY is set on the app dashboard's Secrets page; payout requests are reviewed and paid within five business days.</p>
  </section>;
}
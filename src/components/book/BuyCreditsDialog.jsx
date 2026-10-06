import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, CreditCard, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';

// Mirrors the server pack table (base44/shared/creditsCheckout.ts) — display
// only; the server prices every purchase from its own copy.
const PACKS = [
  { id: 'starter', label: 'Starter', price: '$4.99', credits: '5,000', bonus: null },
  { id: 'player', label: 'Player', price: '$9.99', credits: '10,500', bonus: '+5% bonus' },
  { id: 'pro', label: 'Pro', price: '$19.99', credits: '21,500', bonus: '+7.5% bonus' },
  { id: 'whale', label: 'Whale', price: '$49.99', credits: '57,500', bonus: '+15% bonus' },
];

export default function BuyCreditsDialog({ open, onOpenChange }) {
  const [packId, setPackId] = useState('player');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pack = PACKS.find(item => item.id === packId) || PACKS[0];

  const purchase = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('bookRoomCheckout', {
        packId,
        origin: window.location.origin,
        pagePath: window.location.pathname,
      });
      const url = response.data?.url;
      if (url) { window.location.href = url; return; }
      setError('Checkout could not be started.');
    } catch (err) {
      setError(err?.response?.data?.code === 'unauthorized'
        ? 'unauthorized'
        : err?.response?.data?.error || 'Checkout could not be started.');
    }
    setBusy(false);
  };

  return <Dialog open={open} onOpenChange={next => { if (!busy) { setError(''); onOpenChange(next); } }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl tracking-wide">Buy SwishIQ Credits</DialogTitle>
        <DialogDescription>Top up the play-money book with a real-money pack. Credits are play money: no cash value, no cash-out, non-refundable.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-2">
        {PACKS.map(item => <button key={item.id} type="button" onClick={() => setPackId(item.id)} aria-pressed={packId === item.id}
          className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 transition-colors ${packId === item.id ? 'border-gold/60 bg-gold/10 shadow-[0_0_18px_hsl(var(--court-accent)/.18)]' : 'border-border/50 hover:border-gold/40'}`}>
          <span className="flex items-center gap-1 font-display text-lg tracking-wide text-gold"><Coins className="h-4 w-4" aria-hidden="true" />{item.credits}</span>
          <span className="font-mono text-xs font-semibold text-foreground">{item.price}</span>
          {item.bonus && <span className="font-mono text-[10.4px] font-semibold uppercase tracking-widest text-positive">{item.bonus}</span>}
        </button>)}
      </div>
      {error && <p role="alert" className="text-xs leading-relaxed text-trim-ink">
        {error === 'unauthorized'
          ? <span>Buying credits needs an account — <Link to="/login" className="underline hover:text-foreground">sign in</Link> first, then try again.</span>
          : error}
      </p>}
      <button type="button" onClick={purchase} disabled={busy}
        className="book-cta inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--court-canvas))] transition-opacity hover:opacity-90 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
        {busy ? 'Opening checkout…' : `Buy ${pack.label} — ${pack.price}`}
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Paid securely through Stripe checkout. Credits land in your wallet automatically when you return to the Book Room.</p>
    </DialogContent>
  </Dialog>;
}
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { dollars } from '@/components/realbook/realFormat';

// Sportsbook activity on this account: SwishIQ Credits purchases from the
// play-money book and the real-money book's transaction ledger.
export default function AccountActivity() {
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [purchasesPage, txPage] = await Promise.all([
        base44.entities.BookRoomPurchase.filter({}, { sort: '-created_date', limit: 5 }).catch(() => ({ items: [] })),
        base44.entities.RealTransaction.filter({}, { sort: '-created_date', limit: 6 }).catch(() => ({ items: [] })),
      ]);
      if (!active) return;
      setPurchases(purchasesPage.items || []);
      setTransactions(txPage.items || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return <section className="court-panel space-y-4 p-4">
    <div>
      <p className="court-kicker">Sportsbook activity</p>
      <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">CHECKOUT ACTIVITY</h2>
    </div>
    {loading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Loading activity…</p> : (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="studio-control-label">Credits purchases</p>
          {purchases.length ? <ul className="space-y-1.5">{purchases.map(item => <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-raised/30 px-3 py-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{new Date(item.created_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="shrink-0 font-mono text-gold">{item.credits} cr · {dollars(item.amount_cents)}</span>
          </li>)}</ul> : <p className="rounded-xl border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground">No credits purchases yet.</p>}
        </div>
        <div className="space-y-2">
          <p className="studio-control-label">Real-money ledger</p>
          {transactions.length ? <ul className="space-y-1.5">{transactions.map(item => <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-raised/30 px-3 py-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label || item.type}{item.status && item.status !== 'completed' ? ` · ${item.status}` : ''}</span>
            <span className="shrink-0 font-mono text-gold">{dollars(item.amount_cents)}</span>
          </li>)}</ul> : <p className="rounded-xl border border-dashed border-border/40 p-3 text-[11px] text-muted-foreground">No real-money activity yet.</p>}
        </div>
      </div>
    )}
    <p className="border-t border-border/30 pt-3 text-[11px] leading-relaxed text-muted-foreground">Wishlist stays on the main site: <a href="https://www.djshouseofcards-comics.com/wishlist.html" target="_blank" rel="noreferrer" className="text-gold underline decoration-gold/40 hover:decoration-gold">open your wishlist</a> on djshouseofcards-comics.com — cards, comics, or collectibles you save while browsing appear there.</p>
  </section>;
}
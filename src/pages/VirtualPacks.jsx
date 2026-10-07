import React, { useEffect, useState } from 'react';
import { Dices, Loader2, PackageOpen } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import PackReveal from '@/components/packs/PackReveal';
import PackHistory from '@/components/packs/PackHistory';
import { base44 } from '@/api/base44Client';
import { trackGa4 } from '@/lib/gaBridge';
import {
  PACK_SIZE,
  TIER_META,
  TIER_ODDS,
  clearPackHistory,
  openPack,
  prependPackHistory,
  readPackHistory,
} from '@/lib/cards/packEngine';

// Virtual Packs: each pack is 5 real-world cards — curated PSA scans plus the
// shop catalog — drawn server-side with tier weights (base cards through
// legendary pulls). Simulation only: no purchase, no ownership claim.
export default function VirtualPacks() {
  usePageMeta({ title: 'Virtual Packs · SwishIQ Studio', description: 'Open a 5-card pack of real NBA cards — PSA-graded scans across the 2017–26 player pool, with real card values from base to legendary. Simulation only.' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready to open a pack.');
  const [pack, setPack] = useState(null);
  const [history, setHistory] = useState([]);
  const [pool, setPool] = useState(null);

  useEffect(() => { setHistory(readPackHistory()); }, []);

  useEffect(() => {
    let alive = true;
    base44.entities.PackCard.aggregate({ query: { active: true }, groupBy: 'tier' })
      .then(result => { if (alive) setPool(result.rows || []); })
      .catch(() => { if (alive) setPool([]); });
    return () => { alive = false; };
  }, []);

  const poolTotal = (pool || []).reduce((sum, row) => sum + (Number(row.count) || 0), 0);

  const handleOpen = async () => {
    setBusy(true);
    setStatus('Drawing 5 cards…');
    try {
      const { cards, receipt } = await openPack(PACK_SIZE);
      setPack({ cards, receipt });
      setHistory(prependPackHistory({ openedAt: receipt.openedAt, cards }));
      const bestPull = cards.reduce((best, card) => (TIER_ODDS.findIndex(([tier]) => tier === card.tier) > TIER_ODDS.findIndex(([tier]) => tier === best.tier) ? card : best), cards[0]) || {};
      trackGa4('pack_opened', { card_count: cards.length, best_tier: bestPull.tier || 'unknown', best_value_cents: Number(bestPull.valueCents) || 0 });
      setStatus(`Pack opened — best pull: ${bestPull.name || '—'}`);
    } catch (error) {
      setStatus(error?.message || 'The pack draw failed. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return <StudioShell active="/packs">
    <WorkbenchHeader
      title="VIRTUAL PACKS"
      description="Open a five-card pack of real NBA cards: PSA-graded scans and shop cards for players in the 2017–26 pool, from base cards to legendary pulls. Draws are server-side and fully random."
      state={busy ? 'loading' : pool === null ? 'loading' : 'ready'}
      status={busy ? 'Drawing pack' : pool === null ? 'Loading card pool' : `${poolTotal.toLocaleString()} cards in the pool`}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <p className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-[11px] leading-relaxed text-muted-foreground"><strong className="text-foreground">Simulation only:</strong> every pack is five cards drawn server-side with crypto randomness — tier odds are the studio's designed pack odds, and card values are PSA price-guide references where known. No purchase, no rarity guarantee, no ownership record. History stays in this browser.</p>

      <section className="court-panel space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="court-kicker">Card pool</p>
            <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">REAL CARDS, REAL VALUES</h2>
          </div>
          <button type="button" onClick={handleOpen} disabled={busy || !poolTotal}
            className="book-cta inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold to-goldSoft px-6 py-3 text-xs font-bold uppercase tracking-widest text-canvas shadow-lg shadow-gold/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PackageOpen className="h-4 w-4" aria-hidden="true" />}{busy ? 'Opening…' : `Open ${PACK_SIZE}-card pack`}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TIER_ODDS.map(([tier, odds]) => {
            const meta = TIER_META[tier];
            const count = (pool || []).find(row => row.tier === tier)?.count || 0;
            return <div key={tier} className="rounded-xl border border-border/35 bg-raised/30 p-3">
              <p className="flex items-center justify-between gap-2 font-mono text-[10.4px] font-semibold uppercase tracking-widest"><span className={`rounded border px-1.5 py-0.5 ${meta.chip}`}>{meta.label}</span><span className="text-muted-foreground">{odds}%</span></p>
              <p className="mt-2 font-mono text-lg text-foreground">{count.toLocaleString()} <span className="text-[10.4px] text-muted-foreground">cards</span></p>
            </div>;
          })}
        </div>
        <p role="status" aria-live="polite" className="text-[11px] leading-relaxed text-muted-foreground">{pool === null ? 'Loading the card pool…' : status}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl tracking-wide text-foreground">LATEST PACK</h2>
        {pack ? <PackReveal drawnCards={pack.cards} /> : <p className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground"><Dices className="mx-auto mb-2 h-6 w-6 text-gold/60" aria-hidden="true" />Open a pack to reveal five cards.</p>}
      </section>

      <PackHistory history={history} onClear={() => setHistory(clearPackHistory())} />
    </main>
  </StudioShell>;
}
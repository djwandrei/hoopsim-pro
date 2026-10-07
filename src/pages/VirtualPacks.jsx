import React, { useEffect, useState } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';
import { Image } from '@/components/ui/image';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import PackReveal from '@/components/packs/PackReveal';
import PackHistory from '@/components/packs/PackHistory';
import { studioAsset } from '@/components/studio/teamAssets';
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

// Tier-chip styling for the pool board (mockup treatment: neutral base, royal
// uncommon, gold rare, violet super rare, gold-filled legendary).
const TIER_CHIP_STYLE = {
  base: 'border-border/60 bg-raised/30 text-foreground',
  uncommon: 'border-royal/60 bg-royal/10 text-royal',
  rare: 'border-gold/60 bg-gold/10 text-gold',
  super_rare: 'border-purple-400/60 bg-purple-400/10 text-purple-300',
  legendary: 'border-gold bg-gradient-to-b from-gold/25 to-gold/5 text-gold',
};

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
  const bestPull = pack ? pack.cards.reduce((best, card) => (
    TIER_ODDS.findIndex(([tier]) => tier === card.tier) > TIER_ODDS.findIndex(([tier]) => tier === best.tier) ? card : best
  ), pack.cards[0]) : null;

  const handleOpen = async () => {
    setBusy(true);
    setStatus('Drawing 5 cards…');
    try {
      const { cards, receipt } = await openPack(PACK_SIZE);
      setPack({ cards, receipt });
      setHistory(prependPackHistory({ openedAt: receipt.openedAt, cards }));
      trackGa4('pack_opened', { card_count: cards.length, best_tier: bestPullSafe(cards).tier || 'unknown', best_value_cents: Number(bestPullSafe(cards).valueCents) || 0 });
      setStatus(`Pack opened — best pull: ${bestPullSafe(cards).name || '—'}`);
    } catch (error) {
      setStatus(error?.message || 'The pack draw failed. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  const bestPullSafe = cards => cards.reduce((best, card) => (
    TIER_ODDS.findIndex(([tier]) => tier === card.tier) > TIER_ODDS.findIndex(([tier]) => tier === best.tier) ? card : best
  ), cards[0]) || {};

  return <StudioShell active="/packs">
    <WorkbenchHeader
      title="VIRTUAL PACKS"
      description="Open a five-card pack of real NBA cards: PSA-graded scans and shop cards for players in the 2017–26 pool, from base cards to legendary pulls. Draws are server-side and fully random."
      state={busy ? 'loading' : pool === null ? 'loading' : 'ready'}
      status={busy ? 'Drawing pack' : pool === null ? 'Loading card pool' : `${poolTotal.toLocaleString()} cards in the pool`}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {/* Hero: pack art beside the display title */}
      <section className="rise-in flex items-center gap-4">
        <Image src={studioAsset('virtual-packs-emblem-20261007.png')} alt="Virtual Packs emblem — fanned holographic cards over a gold foil pack" fittingType="fit" className="h-20 w-20 shrink-0 sm:h-24 sm:w-24" />
        <div className="min-w-0">
          <h1 className="court-display text-3xl tracking-wide text-foreground sm:text-4xl">VIRTUAL PACKS<span className="text-gold">.</span></h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">NBA virtual trading card packs drawn from the real collector market — PSA-graded scans across the 2017–26 player pool, priced by PSA price-guide values, five cards per pack.</p>
        </div>
      </section>

      <section className="rise-in grid gap-4 lg:grid-cols-[300px,minmax(0,1fr)]" style={{ '--rise-delay': '60ms' }}>
        {/* Simulation-only callout */}
        <aside className="rounded-xl border-2 border-foreground/70 bg-canvas/60 p-4">
          <p className="bcast-kicker">Simulation only</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Every pack is five cards drawn server-side with crypto randomness — tier odds are the studio's designed pack odds, and card values are PSA price-guide references where known. No purchase, no rarity guarantee, no ownership record. History stays in this browser.</p>
          <p role="status" aria-live="polite" className="mt-3 border-t border-border/40 pt-2 text-[11px] leading-relaxed text-muted-foreground">{pool === null ? 'Loading the card pool…' : status}</p>
        </aside>

        {/* Card pool board */}
        <div className="min-w-0">
          <div className="mb-2">
            <p className="court-kicker">Card pool</p>
            <h2 className="court-display text-2xl tracking-wide text-foreground">REAL CARDS, REAL VALUES<span className="text-gold">.</span></h2>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TIER_ODDS.map(([tier, odds]) => {
              const meta = TIER_META[tier];
              const count = (pool || []).find(row => row.tier === tier)?.count || 0;
              return <li key={tier} className={`rounded-xl border p-3 ${TIER_CHIP_STYLE[tier]}`}>
                <p className="font-mono text-[10.4px] font-semibold uppercase tracking-widest">{meta.label}</p>
                <p className="mt-0.5 font-mono text-[10.4px] text-muted-foreground">{count.toLocaleString()} cards</p>
                <p className="court-display mt-1 text-2xl tracking-wide">{odds}%</p>
              </li>;
            })}
          </ul>
        </div>
      </section>

      {/* Full-width gold CTA */}
      <button type="button" onClick={handleOpen} disabled={busy || !poolTotal}
        className="book-cta rise-in w-full rounded-xl bg-gradient-to-r from-gold to-goldSoft px-6 py-4 font-display text-base tracking-widest text-canvas shadow-lg shadow-gold/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none" style={{ '--rise-delay': '120ms' }}>
        <span className="inline-flex items-center gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PackageOpen className="h-4 w-4" aria-hidden="true" />}{busy ? 'OPENING PACK…' : `OPEN ${PACK_SIZE}-CARD PACK`}</span>
      </button>

      <section className="rise-in space-y-2" style={{ '--rise-delay': '180ms' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="court-display text-2xl tracking-wide text-foreground">LATEST PACK</h2>
          {pack && <>
            <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />Best pull · {TIER_META[bestPull?.tier || 'base'].label}</span>
            <button type="button" onClick={handleOpen} disabled={busy || !poolTotal} className="inline-flex items-center gap-1.5 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 font-mono text-[10.4px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
              <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />Open another pack
            </button>
          </>}
        </div>
        {pack ? <PackReveal drawnCards={pack.cards} /> : <p className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">Open a pack to reveal five cards.</p>}
      </section>

      <PackHistory history={history} onClear={() => setHistory(clearPackHistory())} />
    </main>
  </StudioShell>;
}
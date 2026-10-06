import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import PackPool from '@/components/packs/PackPool';
import PackDrawStage from '@/components/packs/PackDrawStage';
import PackHistory from '@/components/packs/PackHistory';
import { browseCards, findPlayerMatches } from '@/lib/cards/cardClient';
import {
  MAX_PACK_OPENING_POOL_SIZE,
  clearPackOpeningHistory,
  createPackOpeningReceipt,
  createPackOpeningSeed,
  eligiblePackCardFromMatches,
  prependPackOpeningHistory,
  readPackOpeningHistory,
} from '@/lib/cards/packModel';

export default function VirtualPacks() {
  usePageMeta({ title: 'Virtual Packs · SwishIQ Studio', description: 'Declare an eligible card pool from verified player matches and replay a deterministic simulated pack draw. Simulation only, no purchase.' });
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('Search is ready. Find a player match before adding a card to your pool.');
  const [pool, setPool] = useState([]);
  const [packSize, setPackSize] = useState(3);
  const [seed, setSeed] = useState(createPackOpeningSeed);
  const [receipt, setReceipt] = useState(null);
  const [drawnCards, setDrawnCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [openStatus, setOpenStatus] = useState('Declare at least one eligible card to start.');
  const [history, setHistory] = useState([]);

  useEffect(() => { setHistory(readPackOpeningHistory()); }, []);

  const runSearch = async (event) => {
    event?.preventDefault();
    const value = query.trim();
    if (value.length < 2) { setSearchStatus('Type at least two characters to find candidate cards.'); return; }
    setSearching(true);
    setSearchStatus('Checking candidates for verified player matches…');
    try {
      const { matches, unavailable } = await findPlayerMatches(value);
      const byProduct = new Map();
      for (const match of matches || []) {
        if (!byProduct.has(match.product.id)) byProduct.set(match.product.id, []);
        byProduct.get(match.product.id).push(match);
      }
      const eligible = [...byProduct.values()].map(group => eligiblePackCardFromMatches(group)).filter(Boolean);
      setCandidates(eligible);
      if (unavailable) setSearchStatus('The verified mapping service is temporarily unavailable — try again shortly.');
      else if (!eligible.length) setSearchStatus('No verified player matches in these candidates. Only verified cards can join the pool.');
      else setSearchStatus(`${eligible.length} verified candidate${eligible.length === 1 ? '' : 's'} ready to add.`);
    } catch (error) {
      setCandidates([]);
      setSearchStatus(error?.message || 'The candidate search failed. Try again shortly.');
    } finally {
      setSearching(false);
    }
  };

  const addToPool = (card) => {
    setPool(current => {
      if (current.some(entry => entry.product.id === card.product.id)) return current;
      if (current.length >= MAX_PACK_OPENING_POOL_SIZE) { setSearchStatus(`The pool is full at ${MAX_PACK_OPENING_POOL_SIZE} cards.`); return current; }
      setSearchStatus(`${card.product.name} added to the pool.`);
      return [...current, card];
    });
  };

  const removeFromPool = (productId) => setPool(current => current.filter(entry => entry.product.id !== productId));

  const openPack = () => {
    setBusy(true);
    try {
      const nextReceipt = createPackOpeningReceipt({ eligibleCards: pool, packSize, seed });
      setReceipt(nextReceipt);
      setDrawnCards(nextReceipt.drawnProductIds.map(id => pool.find(card => card.product.id === id)).filter(Boolean));
      setHistory(prependPackOpeningHistory(history, nextReceipt));
      setOpenStatus(`Draw complete — ${nextReceipt.drawnProductIds.length} cards, replayable with seed \u201c${nextReceipt.seed}\u201d.`);
    } catch (error) {
      setOpenStatus(error?.message || 'The simulated draw failed.');
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = () => { clearPackOpeningHistory(); setHistory([]); };

  return <StudioShell active="/packs">
    <WorkbenchHeader
      title="VIRTUAL PACKS"
      description="Choose cards with verified NBA player matches, declare the eligible pool, and replay a deterministic seeded draw."
      state={searching ? 'loading' : 'ready'}
      status={searching ? 'Checking candidates' : `${pool.length} in pool`}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <p className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-[11px] leading-relaxed text-muted-foreground"><strong className="text-foreground">Simulation only:</strong> every eligible card has equal weight and a drawn card leaves the pool for that pack. This is not a real pack guarantee, a modeled probability, a rarity or value estimate, a purchase, or an ownership record. History stays in this browser.</p>

      <section className="court-panel space-y-3 p-4">
        <div>
          <p className="court-kicker">Step 1</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">FIND CARDS FOR YOUR POOL</h2>
        </div>
        <form onSubmit={runSearch} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-56">
            <span className="studio-control-label">Search NBA cards</span>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try a player or card title" minLength={2} maxLength={120} autoComplete="off" className="studio-select" />
          </label>
          <button type="submit" disabled={searching} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Find candidates
          </button>
        </form>
        <p role="status" aria-live="polite" className="text-[11px] leading-relaxed text-muted-foreground">{searchStatus}</p>
        {candidates.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {candidates.map(card => <li key={card.product.id}>
            <div className="court-panel court-panel-hover flex min-w-0 flex-col overflow-hidden">
              <div className="aspect-[4/3] bg-raised/40">{card.product.image
                ? <img src={card.product.image} alt={card.product.name} loading="lazy" className="h-full w-full object-contain" />
                : <div className="grid h-full place-items-center font-display text-2xl text-muted-foreground">CARD</div>}</div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                <h3 className="text-xs font-semibold leading-snug text-foreground">{card.product.name}</h3>
                <p className="truncate font-mono text-[10px] text-gold">{card.mappings.map(mapping => `${mapping.player.name}${mapping.depictedSeasonLabel ? ` · ${mapping.depictedSeasonLabel}` : ''}`).filter((value, index, all) => all.indexOf(value) === index).join(' / ')}</p>
                <button type="button" onClick={() => addToPool(card)} disabled={pool.some(entry => entry.product.id === card.product.id)} className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />{pool.some(entry => entry.product.id === card.product.id) ? 'In pool' : 'Add to pool'}
                </button>
              </div>
            </div>
          </li>)}
        </ul>}
      </section>

      <PackPool pool={pool} onRemove={removeFromPool} />
      <PackDrawStage
        poolCount={pool.length}
        packSize={packSize}
        onPackSize={setPackSize}
        seed={seed}
        onNewSeed={() => setSeed(createPackOpeningSeed())}
        onOpen={openPack}
        busy={busy}
        openStatus={openStatus}
        receipt={receipt}
        drawnCards={drawnCards}
      />
      <PackHistory history={history} onClear={clearHistory} />
    </main>
  </StudioShell>;
}
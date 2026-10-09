import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, PackageOpen, Search, Trash2 } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import CardTile from '@/components/cards/CardTile';
import CardsGrid from '@/components/cards/CardsGrid';
import PackReveal from '@/components/packs/PackReveal';
import PackHistory from '@/components/packs/PackHistory';
import {
  PACK_SIZE,
  MAX_POOL_SIZE,
  clearPackHistory,
  createPackOpeningSeed,
  openPack,
  prependPackHistory,
  readPackHistory,
  writePackHistory,
} from '@/lib/cards/packEngine';
import {
  createEligiblePackCard,
  findPlayerMatches,
  getCatalogSourceLabel,
  loadNbaCatalog,
  verifyProductMappings,
} from '@/lib/cards/cardClient';

const RESULT_PAGE_SIZE = 12;

function depictedSeasonLabel(mapping) {
  if (mapping?.depictedSeasonLabel) return mapping.depictedSeasonLabel;
  const endYear = Number(mapping?.depictedSeasonEndYear);
  return Number.isInteger(endYear) && endYear >= 1000
    ? `${endYear - 1}\u2013${String(endYear).slice(-2)}`
    : null;
}

function mappingChip(match) {
  const mapping = match.mapping || {};
  const season = depictedSeasonLabel(mapping);
  return [match.player?.name, season, mapping.subjectRole?.replaceAll('_', ' ')].filter(Boolean).join(' · ');
}

function mergeGroups(existing, incoming) {
  const byProduct = new Map((existing || []).map(group => [Number(group.product.id), { ...group, mappings: [...group.mappings] }]));
  for (const group of incoming || []) {
    const id = Number(group.product?.id);
    if (!Number.isSafeInteger(id)) continue;
    const current = byProduct.get(id);
    if (!current) {
      byProduct.set(id, { ...group, mappings: [...group.mappings] });
      continue;
    }
    const keys = new Set(current.mappings.map(match => `${match.player?.athleteId}:${match.mapping?.subjectRole}:${match.mapping?.depictedSeasonEndYear}`));
    for (const match of group.mappings) {
      const key = `${match.player?.athleteId}:${match.mapping?.subjectRole}:${match.mapping?.depictedSeasonEndYear}`;
      if (!keys.has(key)) current.mappings.push(match);
    }
  }
  return [...byProduct.values()];
}

function cardChips(card) {
  return (card.mappings || []).map(mapping => [
    mapping.player?.name,
    depictedSeasonLabel(mapping),
    mapping.subjectRole?.replaceAll('_', ' '),
  ].filter(Boolean).join(' · '));
}

export default function VirtualPacks() {
  usePageMeta({ title: 'Virtual Packs · SwishIQ Studio', description: 'Build a browser-local card pool from exact reviewed DJHC NBA product mappings and replay a seeded simulated draw.' });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState('Search by player name or card title to find verified catalog matches.');
  const [searchTone, setSearchTone] = useState('info');
  const [searchResults, setSearchResults] = useState([]);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);
  const [candidateFailures, setCandidateFailures] = useState(0);
  const [mappingUnavailable, setMappingUnavailable] = useState(false);
  const [visibleResults, setVisibleResults] = useState(RESULT_PAGE_SIZE);
  const [pool, setPool] = useState(() => new Map());
  const [seed, setSeed] = useState(() => createPackOpeningSeed());
  const [pack, setPack] = useState(null);
  const [openStatus, setOpenStatus] = useState('Add at least five verified cards to declare the eligible pool.');
  const [openTone, setOpenTone] = useState('info');
  const [history, setHistory] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSource, setCatalogSource] = useState('');

  const poolCards = useMemo(() => [...pool.values()], [pool]);
  const remainingCandidates = Math.max(0, candidateCount - candidateOffset);
  const canOpen = pool.size >= PACK_SIZE && !searching && !restoring;

  useEffect(() => {
    setHistory(readPackHistory());
    let active = true;
    loadNbaCatalog().then(() => {
      if (!active) return;
      setCatalogSource(getCatalogSourceLabel());
      setCatalogError('');
    }).catch(error => {
      if (!active) return;
      setCatalogError(error?.message || 'The DJHC public NBA card catalog is unavailable.');
    }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  const runSearch = async (event, explicit, offset = 0) => {
    event?.preventDefault();
    const value = String(explicit ?? query).trim();
    if (value.length < 2) {
      setSearchTone('warn');
      setSearchStatus('Type at least two characters to search catalog cards.');
      return;
    }
    if (offset === 0) {
      setSearchResults([]);
      setCandidateOffset(0);
      setCandidateCount(0);
      setCandidateFailures(0);
      setMappingUnavailable(false);
      setVisibleResults(RESULT_PAGE_SIZE);
    }
    setSearching(true);
    setSearchTone('info');
    setSearchStatus('Checking candidate cards against DJHC’s verified player mappings…');
    try {
      const result = await findPlayerMatches(value, { offset });
      const groups = mergeGroups(offset ? searchResults : [], result.matches || []);
      const remaining = Math.max(0, (result.candidateCount || 0) - (result.nextOffset || 0));
      const totalFailures = (offset ? candidateFailures : 0) + (result.failures || 0);
      setSearchResults(groups);
      setCandidateOffset(result.nextOffset || 0);
      setCandidateCount(result.candidateCount || 0);
      setCandidateFailures(totalFailures);
      setMappingUnavailable(result.unavailable === true);
      setCatalogSource(getCatalogSourceLabel());
      if (result.unavailable && !groups.length) {
        setSearchTone('warn');
        setSearchStatus('The verified mapping service is unavailable. No catalog text was treated as a player match; try again later.');
      } else if (!result.candidateCount) {
        setSearchTone('warn');
        setSearchStatus(`No NBA catalog text matches “${value}”.`);
      } else if (!groups.length) {
        setSearchTone('warn');
        setSearchStatus(remaining
          ? `No verified matches among the checked candidates. ${remaining} more candidates can be checked.`
          : `No verified player matches for “${value}”. Similar card text alone is not a player match.`);
      } else {
        setSearchTone(totalFailures ? 'warn' : 'ok');
        setSearchStatus(`Found ${groups.length} card${groups.length === 1 ? '' : 's'} with verified player matches.${remaining ? ` ${remaining} more candidates can be checked.` : ''}${totalFailures ? ` ${totalFailures} mapping lookup${totalFailures === 1 ? '' : 's'} failed.` : ''}`);
      }
    } catch (error) {
      if (!offset) setSearchResults([]);
      setMappingUnavailable(true);
      setSearchTone('warn');
      setSearchStatus(error?.message || 'The card search failed. Try again shortly.');
    } finally {
      setSearching(false);
    }
  };

  const addToPool = (group) => {
    const card = createEligiblePackCard(group.product, group.mappings);
    if (!card) {
      setOpenTone('warn');
      setOpenStatus('This card no longer has a valid reviewed NBA mapping and was not added.');
      return;
    }
    const id = Number(card.product.id);
    if (pool.has(id)) return;
    if (pool.size >= MAX_POOL_SIZE) {
      setOpenTone('warn');
      setOpenStatus(`The declared pool is limited to ${MAX_POOL_SIZE} unique cards.`);
      return;
    }
    setPool(current => new Map(current).set(id, card));
    setOpenTone('info');
    setOpenStatus('Pool updated. Each eligible catalog card receives one equal-weight draw entry.');
  };

  const removeFromPool = (productId) => {
    setPool(current => {
      const next = new Map(current);
      next.delete(Number(productId));
      return next;
    });
    setOpenTone('info');
    setOpenStatus('Card removed from the declared pool.');
  };

  const handleOpen = () => {
    if (!canOpen) {
      setOpenTone('warn');
      setOpenStatus(`Add at least ${PACK_SIZE} unique verified cards to the pool before opening a pack.`);
      return;
    }
    try {
      const usedSeed = String(seed || '').trim() || createPackOpeningSeed();
      setSeed(usedSeed);
      const result = openPack(poolCards, { packSize: PACK_SIZE, seed: usedSeed });
      const nextHistory = prependPackHistory(history, result.receipt);
      const stored = writePackHistory(nextHistory);
      if (stored) setHistory(nextHistory);
      setPack(result);
      setOpenTone(stored ? 'ok' : 'warn');
      setOpenStatus(stored
        ? 'Draw complete. The receipt was saved in this browser only; no data was sent to a pack service.'
        : 'Draw complete. Browser storage is unavailable, so the receipt was not saved persistently.');
    } catch (error) {
      setOpenTone('warn');
      setOpenStatus(error?.message || 'The local pack draw could not be completed.');
    }
  };

  const restoreHistory = async (receipt) => {
    if (restoring) return;
    setRestoring(true);
    setOpenTone('info');
    setOpenStatus('Rechecking the saved cards against the current public catalog and verified mappings…');
    try {
      const products = await loadNbaCatalog({ force: true });
      const productsById = new Map(products.map(product => [Number(product.id), product]));
      const restoredCards = new Array(receipt.poolProductIds.length);
      let cursor = 0;
      async function worker() {
        while (cursor < receipt.poolProductIds.length) {
          const index = cursor++;
          const product = productsById.get(Number(receipt.poolProductIds[index]));
          if (!product) continue;
          try {
            const matches = await verifyProductMappings(product);
            restoredCards[index] = createEligiblePackCard(product, matches);
          } catch {
            restoredCards[index] = null;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, receipt.poolProductIds.length) }, worker));
      const missing = restoredCards.filter(card => !card).length;
      if (missing) throw new Error(`${missing} saved card${missing === 1 ? '' : 's'} no longer has an available verified mapping. The current pool was left unchanged.`);
      setPool(new Map(restoredCards.map(card => [Number(card.product.id), card])));
      setSeed(receipt.seed);
      setPack(null);
      setCatalogSource(getCatalogSourceLabel());
      setOpenTone('ok');
      setOpenStatus('Saved pool and seed restored after every card passed the current verified mapping check. Open the pack to replay it.');
    } catch (error) {
      setOpenTone('warn');
      setOpenStatus(error?.message || 'The saved pool could not be restored. The current pool was left unchanged.');
    } finally {
      setRestoring(false);
    }
  };

  useViewRefresh(async () => {
    setHistory(readPackHistory());
    await loadNbaCatalog({ force: true });
    setCatalogSource(getCatalogSourceLabel());
  });

  return <StudioShell active="/packs">
    <WorkbenchHeader
      title="VIRTUAL PACKS"
      description="Build an eligible pool from exact reviewed NBA card mappings, then replay an equal-weight seeded draw locally."
      state={searching || catalogLoading || restoring ? 'loading' : 'ready'}
      status={searching ? 'Checking verified mappings' : restoring ? 'Restoring saved pool' : catalogLoading ? 'Loading DJHC card catalog' : `${pool.size} verified cards in your pool · ${catalogSource || 'catalog'}`}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <section className="court-panel grid gap-4 p-4 lg:grid-cols-[300px,minmax(0,1fr)]">
        <aside className="rounded-xl border-2 border-foreground/70 bg-canvas/60 p-4">
          <p className="bcast-kicker">Simulation only</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">A pool entry is one current DJHC NBA catalog product with an exact reviewed player mapping. Every entry has equal weight. A card can appear only once per draw. This is not a real pack, purchase, market value, rarity, ownership record, or wager.</p>
          <p className="mt-3 border-t border-border/40 pt-2 text-[11px] leading-relaxed text-muted-foreground">{catalogError || 'Catalog name and title text only narrow candidate cards; verified mappings determine eligibility.'}</p>
        </aside>
        <section className="min-w-0 space-y-3" aria-labelledby="pack-search-title">
          <div>
            <p className="court-kicker">Step 1 · Find eligible cards</p>
            <h2 id="pack-search-title" className="court-display text-2xl tracking-wide text-foreground">SEARCH DJHC CATALOG<span className="text-gold">.</span></h2>
          </div>
          <form onSubmit={event => runSearch(event)} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="pack-card-search">Search NBA catalog cards</label>
            <input id="pack-card-search" type="search" value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={120} placeholder="Try a player or card title" className="studio-select min-w-0 flex-1" autoComplete="off" />
            <button type="submit" disabled={searching || restoring} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-wait disabled:opacity-40">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Find matches
            </button>
          </form>
          <p className={`text-[11px] leading-relaxed ${searchTone === 'warn' ? 'text-trim-ink' : searchTone === 'ok' ? 'text-positive' : 'text-muted-foreground'}`} role="status" aria-live="polite">{searchStatus}</p>
        </section>
      </section>

      {searchResults.length > 0 && <CardsGrid
        title="VERIFIED MATCH CANDIDATES"
        count={`${searchResults.length} cards`}
        note="Adding a card rechecks the returned exact reviewed mapping. Similar title text alone never qualifies it."
        tiles={searchResults.slice(0, visibleResults).map(group => {
          const inPool = pool.has(Number(group.product.id));
          return <CardTile
            key={group.product.id}
            card={group.product}
            chips={group.mappings.map(mappingChip)}
            action={<button type="button" onClick={() => addToPool(group)} disabled={inPool || restoring || pool.size >= MAX_POOL_SIZE} className="rounded-md border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold disabled:cursor-not-allowed disabled:opacity-40">{inPool ? 'In pool' : 'Add to pool'}</button>}
          />;
        })}
        empty={<p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">No verified catalog cards are available for this search yet.</p>}
        onShowMore={visibleResults < searchResults.length ? () => setVisibleResults(value => value + RESULT_PAGE_SIZE) : undefined}
        showMoreLabel={`Show more verified cards (${searchResults.length - visibleResults} left)`}
      />}
      {remainingCandidates > 0 && !mappingUnavailable && <button type="button" onClick={() => runSearch(null, query, candidateOffset)} disabled={searching || restoring} className="mx-auto flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-wait disabled:opacity-40">{searching ? 'Checking…' : `Check more candidates (${remainingCandidates} left)`}</button>}

      <section className="court-panel space-y-3 p-4" aria-labelledby="eligible-pool-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="court-kicker">Step 2 · Declare the pool</p>
            <h2 id="eligible-pool-title" className="court-display text-2xl tracking-wide text-foreground">ELIGIBLE CARD POOL<span className="text-gold">.</span></h2>
          </div>
          <span className="font-mono text-xs text-gold">{pool.size} / {MAX_POOL_SIZE}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">One physical catalog product is one equally weighted draw entry, even if its reviewed mapping contains multiple players. Pack size is {PACK_SIZE}; a drawn card does not repeat within the same pack.</p>
        {poolCards.length > 0
          ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {poolCards.map(card => <CardTile
              key={card.product.id}
              card={card.product}
              chips={cardChips(card)}
              action={<button type="button" onClick={() => removeFromPool(card.product.id)} disabled={restoring} className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:border-trim/50 hover:text-trim-ink disabled:opacity-40"><Trash2 className="h-3 w-3" aria-hidden="true" />Remove</button>}
            />)}
          </div>
          : <p className="rounded-xl border border-dashed border-border/40 p-5 text-center text-xs text-muted-foreground">Search for cards with verified NBA player mappings, then add cards to build the eligible pool.</p>}
      </section>

      <section className="court-panel space-y-3 p-4" aria-labelledby="pack-draw-title">
        <div>
          <p className="court-kicker">Step 3 · Set the draw</p>
          <h2 id="pack-draw-title" className="court-display text-2xl tracking-wide text-foreground">OPEN A {PACK_SIZE}-CARD PACK<span className="text-gold">.</span></h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
          <div className="space-y-1.5">
            <label htmlFor="pack-seed" className="studio-control-label">Seed · same pool and seed replay the same cards</label>
            <input id="pack-seed" type="text" value={seed} onChange={event => setSeed(event.target.value)} maxLength={80} className="studio-select w-full font-mono" autoComplete="off" />
          </div>
          <button type="button" onClick={() => setSeed(createPackOpeningSeed())} disabled={restoring} className="self-end rounded-lg border border-border/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40">New seed</button>
        </div>
        <button type="button" onClick={handleOpen} disabled={!canOpen} className="book-cta w-full rounded-xl bg-gradient-to-r from-gold to-goldSoft px-6 py-4 font-display text-base tracking-widest text-canvas shadow-lg shadow-gold/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
          <span className="inline-flex items-center gap-2"><PackageOpen className="h-4 w-4" aria-hidden="true" />OPEN {PACK_SIZE}-CARD PACK · LOCAL SIMULATION</span>
        </button>
        <p role="status" aria-live="polite" className={`border-t border-border/40 pt-2 text-[11px] leading-relaxed ${openTone === 'warn' ? 'text-trim-ink' : openTone === 'ok' ? 'text-positive' : 'text-muted-foreground'}`}>{openStatus}</p>
      </section>

      <section className="space-y-2" aria-labelledby="latest-pack-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="latest-pack-title" className="court-display text-2xl tracking-wide text-foreground">LATEST DRAW</h2>
          {pack && <span className="bcast-lowerthird"><span className="bcast-lowerthird__bar" aria-hidden="true" />Seed · {pack.receipt.seed}</span>}
        </div>
        {pack
          ? <>
            <p className="text-[11px] text-muted-foreground">{pack.receipt.packSize} unique cards drawn from {pack.receipt.poolProductIds.length} declared cards · uniform draw · no replacement · simulation only.</p>
            <PackReveal drawnCards={pack.cards} />
          </>
          : <p className="rounded-xl border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">Build a pool of at least five eligible cards to open a simulated pack.</p>}
      </section>

      <PackHistory history={history} onClear={() => setHistory(clearPackHistory())} onRestore={restoreHistory} restoring={restoring} />
    </main>
  </StudioShell>;
}

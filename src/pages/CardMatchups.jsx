import React, { useEffect, useState } from 'react';
import { Loader2, Search, UserRound } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import CardTile from '@/components/cards/CardTile';
import CardsGrid from '@/components/cards/CardsGrid';
import { browseCards, findPlayerMatches, suggestPlayers } from '@/lib/cards/cardClient';

const RESULT_PAGE_SIZE = 12;

function mappingChip(mapping) {
  const season = mapping.depictedSeasonLabel
    || (Number.isInteger(mapping.depictedSeasonEndYear) ? `${mapping.depictedSeasonEndYear - 1}\u2013${String(mapping.depictedSeasonEndYear).slice(-2)}` : null);
  return [mapping.player?.name, season, mapping.subjectRole?.replaceAll('_', ' ')].filter(Boolean).join(' · ');
}

export default function CardMatchups() {
  usePageMeta({ title: 'Player & Cards · SwishIQ Studio', description: 'Find catalog cards tied to verified NBA player matches, then browse the full collector catalog.' });
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('Search for player matches.');
  const [statusTone, setStatusTone] = useState('info');
  const [grouped, setGrouped] = useState([]);
  const [visibleResults, setVisibleResults] = useState(RESULT_PAGE_SIZE);
  const catalogQuery = '';
  const [catalogCards, setCatalogCards] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return undefined; }
    let stale = false;
    const timer = setTimeout(() => { suggestPlayers(query).then(list => { if (!stale) setSuggestions(list); }).catch(() => { if (!stale) setSuggestions([]); }); }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    browseCards({ query: catalogQuery, page: 1, pageSize: 12 }).then(data => {
      if (!active) return;
      setCatalogCards(data.cards || []);
      setCatalogTotal(data.total || 0);
      setCatalogPage(1);
    }).catch(() => { if (active) setCatalogCards([]); }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [catalogQuery]);

  const runSearch = async (event, explicit) => {
    event?.preventDefault();
    const value = String(explicit ?? query).trim();
    if (value.length < 2) { setStatusTone('warn'); setStatus('Type at least two characters of a player name.'); return; }
    setSuggestions([]);
    setSearching(true);
    setStatusTone('info');
    setStatus(`Checking the catalog for verified matches…`);
    try {
      const { matches, unavailable } = await findPlayerMatches(value);
      const byProduct = new Map();
      for (const match of matches || []) {
        const id = match.product.id;
        if (!byProduct.has(id)) byProduct.set(id, { product: match.product, mappings: [], player: match.player });
        byProduct.get(id).mappings.push(match.mapping);
      }
      const groups = [...byProduct.values()];
      setGrouped(groups);
      setVisibleResults(RESULT_PAGE_SIZE);
      if (unavailable) { setStatusTone('warn'); setStatus('The verified mapping service is temporarily unavailable — try again shortly.'); }
      else if (!groups.length) { setStatusTone('warn'); setStatus(`No verified player matches for \u201c${value}\u201d. Similar card text alone is not a player match.`); }
      else { setStatusTone('ok'); setStatus(`Found ${groups.length} card${groups.length === 1 ? '' : 's'} with verified player matches.`); }
    } catch (error) {
      setGrouped([]);
      setStatusTone('warn');
      setStatus(error?.message || 'The card search failed. Try again shortly.');
    } finally {
      setSearching(false);
    }
  };

  const loadMoreCatalog = async () => {
    setLoadingMore(true);
    try {
      const data = await browseCards({ query: catalogQuery, page: catalogPage + 1, pageSize: 12 });
      setCatalogCards(current => [...current, ...(data.cards || [])]);
      setCatalogPage(current => current + 1);
      setCatalogTotal(data.total || 0);
    } catch {
      // Keep the loaded page; the next attempt can retry.
    } finally {
      setLoadingMore(false);
    }
  };

  useViewRefresh(async () => {
    const data = await browseCards({ query: catalogQuery, page: 1, pageSize: 12 });
    setCatalogCards(data.cards || []); setCatalogTotal(data.total || 0); setCatalogPage(1);
    if (grouped.length && query.trim().length >= 2) await runSearch(null, query);
  });

  const featured = grouped[0]?.player || null;
  const moreResults = visibleResults < grouped.length;

  return <StudioShell active="/matchups">
    <WorkbenchHeader
      title="PLAYER & CARDS"
      description="Find catalog cards tied to a verified NBA player; explore season context separately in the studio workbenches."
      state={searching || catalogLoading ? 'loading' : 'ready'}
      status={searching ? 'Checking the catalog' : catalogLoading ? 'Loading catalog' : `${catalogTotal} catalog cards`}
    />
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      <section className="court-panel space-y-3 p-4">
        <div>
          <p className="court-kicker">Find cards</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SEARCH THE COLLECTION</h2>
        </div>
        <form onSubmit={event => runSearch(event)} className="space-y-2">
          <label className="studio-control-label" htmlFor="player-search">Player name</label>
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="player-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder='Try "Gervin" or another name'
                autoComplete="off"
                className="studio-select min-w-0 flex-1"
                aria-autocomplete="list"
              />
              <button type="submit" disabled={searching} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}Find cards
              </button>
            </div>
            {suggestions.length > 0 && <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-card p-1 shadow-xl">
              {suggestions.map(suggestion => <li key={suggestion.name}>
                <button type="button" onClick={() => { setQuery(suggestion.name); runSearch(null, suggestion.name); }} className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-raised">
                  <span className="truncate">{suggestion.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{suggestion.cards} card{suggestion.cards === 1 ? '' : 's'}</span>
                </button>
              </li>)}
            </ul>}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Type part of a name to find cards. A similar name alone does not guarantee a player match — every result below is a verified mapping.</p>
        </form>
        <p role="status" aria-live="polite" className={`text-xs leading-relaxed ${statusTone === 'warn' ? 'text-trim-ink' : statusTone === 'ok' ? 'text-positive' : 'text-muted-foreground'}`}>{status}</p>
      </section>

      {featured && grouped.length > 0 && <section className="court-panel flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/30 bg-raised">
          {featured.headshotUrl
            ? <img src={featured.headshotUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <UserRound className="h-8 w-8 text-gold" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="court-kicker">Verified player</p>
          <h2 className="font-display text-2xl tracking-wide text-foreground">{featured.name}</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">{featured.primaryPosition ? `${featured.primaryPosition} · ` : ''}{grouped.length} verified card{grouped.length === 1 ? '' : 's'} in the catalog</p>
        </div>
      </section>}

      {grouped.length > 0 && <CardsGrid
        title="MATCHED CARDS"
        count={`${grouped.length} verified`}
        tiles={grouped.slice(0, visibleResults).map(group => <CardTile key={group.product.id} card={group.product} chips={group.mappings.map(mappingChip)} />)}
        onShowMore={moreResults ? () => setVisibleResults(current => current + RESULT_PAGE_SIZE) : undefined}
        showMoreLabel={`Show more matched cards (${grouped.length - visibleResults} left)`}
      />}

      <CardsGrid
        title="CATALOG CARDS TO BROWSE"
        count={`${catalogTotal} cards`}
        note="Cards without a player match are still available to browse."
        tiles={catalogCards.map(card => <CardTile key={card.id} card={card} />)}
        empty={<p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">{catalogLoading ? 'Loading catalog cards…' : catalogQuery ? `No catalog cards match \u201c${catalogQuery}\u201d.` : 'No catalog cards loaded.'}</p>}
        onShowMore={catalogCards.length < catalogTotal ? loadMoreCatalog : undefined}
        showMoreLabel={loadingMore ? 'Loading…' : 'Show more catalog cards'}
        showMoreDisabled={loadingMore}
      />
    </main>
  </StudioShell>;
}
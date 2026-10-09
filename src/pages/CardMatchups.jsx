import React, { useEffect, useState } from 'react';
import { Loader2, Search, UserRound } from 'lucide-react';
import StudioShell from '@/components/studio/StudioShell';
import WorkbenchHeader from '@/components/studio/WorkbenchHeader';
import usePageMeta from '@/hooks/usePageMeta';
import useViewRefresh from '@/components/mobile/useViewRefresh';
import CardTile from '@/components/cards/CardTile';
import CardsGrid from '@/components/cards/CardsGrid';
import { browseCards, findPlayerMatches, getCatalogSourceLabel, suggestPlayers } from '@/lib/cards/cardClient';

const RESULT_PAGE_SIZE = 12;

function mappingChip(match) {
  const mapping = match.mapping || {};
  const season = mapping.depictedSeasonLabel
    || (Number.isInteger(mapping.depictedSeasonEndYear) ? `${mapping.depictedSeasonEndYear - 1}\u2013${String(mapping.depictedSeasonEndYear).slice(-2)}` : null);
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

export default function CardMatchups() {
  usePageMeta({ title: 'Player & Cards · SwishIQ Studio', description: 'Find DJHC catalog cards tied to verified NBA player matches, then browse the NBA card catalog.' });
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('Search for player matches.');
  const [statusTone, setStatusTone] = useState('info');
  const [grouped, setGrouped] = useState([]);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [candidateCount, setCandidateCount] = useState(0);
  const [candidateFailures, setCandidateFailures] = useState(0);
  const [mappingUnavailable, setMappingUnavailable] = useState(false);
  const [visibleResults, setVisibleResults] = useState(RESULT_PAGE_SIZE);
  const [catalogCards, setCatalogCards] = useState([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSource, setCatalogSource] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return undefined; }
    let stale = false;
    const timer = setTimeout(() => {
      suggestPlayers(query).then(list => { if (!stale) setSuggestions(list); }).catch(() => { if (!stale) setSuggestions([]); });
    }, 250);
    return () => { stale = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    browseCards({ page: 1, pageSize: RESULT_PAGE_SIZE }).then(data => {
      if (!active) return;
      setCatalogCards(data.cards || []);
      setCatalogTotal(data.total || 0);
      setCatalogPage(1);
      setCatalogSource(data.source || getCatalogSourceLabel());
      setCatalogError('');
    }).catch(error => {
      if (active) {
        setCatalogCards([]);
        setCatalogTotal(0);
        setCatalogError(error?.message || 'The DJHC card catalog is unavailable.');
      }
    }).finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  const runSearch = async (event, explicit, offset = 0) => {
    event?.preventDefault();
    const value = String(explicit ?? query).trim();
    if (value.length < 2) { setStatusTone('warn'); setStatus('Type at least two characters of a player name.'); return; }
    if (offset === 0) {
      setSuggestions([]);
      setGrouped([]);
      setVisibleResults(RESULT_PAGE_SIZE);
      setCandidateOffset(0);
      setCandidateCount(0);
      setCandidateFailures(0);
      setMappingUnavailable(false);
    }
    setSearching(true);
    setStatusTone('info');
    setStatus(offset ? 'Checking more catalog candidates for verified matches…' : 'Checking catalog candidates for verified matches…');
    try {
      const result = await findPlayerMatches(value, { offset });
      const groups = mergeGroups(offset ? grouped : [], result.matches || []);
      const remaining = Math.max(0, (result.candidateCount || 0) - (result.nextOffset || 0));
      const totalFailures = (offset ? candidateFailures : 0) + (result.failures || 0);
      setGrouped(groups);
      setVisibleResults(RESULT_PAGE_SIZE);
      setCandidateOffset(result.nextOffset || 0);
      setCandidateCount(result.candidateCount || 0);
      setCandidateFailures(totalFailures);
      setMappingUnavailable(result.unavailable === true);
      if (result.unavailable && !groups.length) {
        setStatusTone('warn');
        setStatus('The verified player mapping service is unavailable. Try again later. Catalog cards remain available below.');
      } else if (!groups.length && !result.candidateCount) {
        setStatusTone('warn');
        setStatus(`No catalog card candidates match “${value}”.`);
      } else if (!groups.length) {
        setStatusTone('warn');
        setStatus(remaining
          ? `No verified matches in the checked candidates for “${value}”. ${remaining} more candidates can be checked.`
          : `No verified player matches for “${value}”. Similar card text alone is not a player match.`);
      } else {
        setStatusTone(totalFailures ? 'warn' : 'ok');
        setStatus(`Found ${groups.length} card${groups.length === 1 ? '' : 's'} with verified player matches.${remaining ? ` ${remaining} more catalog candidates can be checked.` : ''}${totalFailures ? ` ${totalFailures} mapping lookup${totalFailures === 1 ? '' : 's'} failed.` : ''}`);
      }
    } catch (error) {
      if (!offset) setGrouped([]);
      setMappingUnavailable(true);
      setStatusTone('warn');
      setStatus(error?.message || 'The card search failed. Try again shortly.');
    } finally {
      setSearching(false);
    }
  };

  const loadMoreCatalog = async () => {
    setLoadingMore(true);
    try {
      const data = await browseCards({ page: catalogPage + 1, pageSize: RESULT_PAGE_SIZE });
      setCatalogCards(current => [...current, ...(data.cards || [])]);
      setCatalogPage(current => current + 1);
      setCatalogTotal(data.total || 0);
      setCatalogSource(data.source || getCatalogSourceLabel());
    } catch (error) {
      setCatalogError(error?.message || 'More catalog cards could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  };

  useViewRefresh(async () => {
    const data = await browseCards({ page: 1, pageSize: RESULT_PAGE_SIZE, force: true });
    setCatalogCards(data.cards || []);
    setCatalogTotal(data.total || 0);
    setCatalogPage(1);
    setCatalogSource(data.source || getCatalogSourceLabel());
    if (grouped.length && query.trim().length >= 2) await runSearch(null, query);
  });

  const findMoreMatches = () => runSearch(null, query, candidateOffset);
  const featured = grouped[0]?.player || null;
  const moreResults = visibleResults < grouped.length;
  const remainingCandidates = Math.max(0, candidateCount - candidateOffset);

  return <StudioShell active="/matchups">
    <WorkbenchHeader
      title="PLAYER & CARDS"
      description="Search catalog text for candidates, then confirm each player match through DJHC’s verified NBA product mapping service."
      state={searching || catalogLoading ? 'loading' : 'ready'}
      status={searching ? 'Checking catalog mappings' : catalogLoading ? 'Loading catalog' : `${catalogTotal} NBA cards · ${catalogSource || 'catalog'}`}
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
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{suggestion.candidateCount} title candidate{suggestion.candidateCount === 1 ? '' : 's'}</span>
                </button>
              </li>)}
            </ul>}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Catalog name suggestions only help narrow the search. Card text does not establish identity; every result below must pass DJHC’s verified product mapping API.</p>
        </form>
        <p role="status" aria-live="polite" className={`text-xs leading-relaxed ${statusTone === 'warn' ? 'text-trim-ink' : statusTone === 'ok' ? 'text-positive' : 'text-muted-foreground'}`}>{status}</p>
      </section>

      {featured && grouped.length > 0 && <section className="court-panel flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-gold/30 bg-raised">
          <UserRound className="h-8 w-8 text-gold" aria-hidden="true" />
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
      {remainingCandidates > 0 && !mappingUnavailable && <button type="button" onClick={findMoreMatches} disabled={searching} className="mx-auto flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-wait disabled:opacity-40">{searching ? 'Checking…' : `Find more verified matches (${remainingCandidates} candidates left)`}</button>}

      <CardsGrid
        title="NBA CATALOG CARDS TO BROWSE"
        count={`${catalogTotal} cards`}
        note="Cards without a verified player match remain available to browse. Shop listing prices are catalog prices, not market valuations."
        tiles={catalogCards.map(card => <CardTile key={card.id} card={card} />)}
        empty={<p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">{catalogLoading ? 'Loading catalog cards…' : catalogError || 'No catalog cards loaded.'}</p>}
        onShowMore={catalogCards.length < catalogTotal ? loadMoreCatalog : undefined}
        showMoreLabel={loadingMore ? 'Loading…' : 'Show more catalog cards'}
        showMoreDisabled={loadingMore}
      />
    </main>
  </StudioShell>;
}

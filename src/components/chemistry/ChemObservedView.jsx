import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { comboKindLabel } from './chemistryFormat';
import ChemComboCard from './ChemComboCard';

const OBSERVED_PAGE_SIZE = 4;
const selectClass = 'studio-select';

export default function ChemObservedView({ observed, pair, chem }) {
  const [team, setTeam] = useState('');
  const [groupSize, setGroupSize] = useState('');
  const [kind, setKind] = useState('');
  const [playerRef, setPlayerRef] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const indexes = useMemo(() => chem.indexObservedChemistryRows(observed.rows), [chem, observed.rows]);
  const teams = useMemo(() => [...indexes.rowsByTeam.keys()].sort(), [indexes]);
  const players = useMemo(() => [...(observed.playerByRef instanceof Map ? observed.playerByRef.values() : [])]
    .filter(player => player?.playerRef && player?.displayName)
    .sort((left, right) => left.displayName.localeCompare(right.displayName)), [observed.playerByRef]);
  const playerOptions = useMemo(() => {
    const eligible = team ? indexes.playerRefsByTeam.get(team) || new Set() : indexes.allPlayerRefs;
    return players.filter(player => eligible.has(player.playerRef)
      && (!query || player.displayName.toLowerCase().includes(query.toLowerCase()))).slice(0, 40);
  }, [players, indexes, team, query]);
  const filtered = useMemo(() => chem.filterObservedChemistryRows(observed.rows, { team, groupSize, kind, query, playerRef }, indexes), [chem, observed.rows, indexes, team, groupSize, kind, query, playerRef]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / OBSERVED_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * OBSERVED_PAGE_SIZE, safePage * OBSERVED_PAGE_SIZE + OBSERVED_PAGE_SIZE);
  const statsByTeamRef = useMemo(() => new Map(pair.rows.map(row => [`${row.teamCode}|${row.playerRef}`, row])), [pair.rows]);
  const hasFilters = Boolean(team || groupSize || kind || playerRef || query);
  const clearFilters = () => { setTeam(''); setGroupSize(''); setKind(''); setPlayerRef(''); setQuery(''); setPage(0); };
  return <div className="space-y-5">
    <section className="court-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="court-display text-xl text-foreground">Observed lineups</h3>
        <p className="font-mono text-[10.4px] uppercase tracking-widest text-muted-foreground">
          {filtered.length.toLocaleString()} found
          {hasFilters && <button type="button" onClick={clearFilters} className="ml-3 inline-flex min-h-6 items-center gap-1 text-gold transition-colors hover:text-goldSoft"><RotateCcw className="h-3 w-3" />Clear</button>}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block"><span className="studio-control-label">Team</span>
          <select className={selectClass} value={team} onChange={event => { setTeam(event.target.value); setPlayerRef(''); setPage(0); }}>
            <option value="">All teams</option>
            {teams.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Group size</span>
          <select className={selectClass} value={groupSize} onChange={event => { setGroupSize(event.target.value); setPage(0); }}>
            <option value="">All groups (2–5)</option>
            {[2, 3, 4, 5].map(size => <option key={size} value={String(size)}>{size} players</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Kind</span>
          <select className={selectClass} value={kind} onChange={event => { setKind(event.target.value); setPage(0); }}>
            <option value="">All kinds</option>
            {['shared-floor', 'exact-five'].map(value => <option key={value} value={value}>{comboKindLabel(value)}</option>)}
          </select>
        </label>
        <label className="block"><span className="studio-control-label">Search name</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" className={`${selectClass} pl-9`} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Filter lineups by name" />
          </span>
        </label>
        <label className="block sm:col-span-2 xl:col-span-4"><span className="studio-control-label">Player</span>
          <select className={selectClass} value={playerRef} onChange={event => { setPlayerRef(event.target.value); setPage(0); }}>
            <option value="">Choose a team or search a name</option>
            {playerOptions.map(player => <option key={player.playerRef} value={player.playerRef}>{player.displayName}</option>)}
          </select>
        </label>
      </div>
    </section>
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((row, index) => <ChemComboCard key={row.id} row={row} statsByTeamRef={statsByTeamRef} index={index} />)}
      {!visible.length && <p className="court-panel p-6 text-center text-sm text-muted-foreground sm:col-span-2">No observed lineups match the current filters.</p>}
    </div>
    {filtered.length > OBSERVED_PAGE_SIZE && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-3">
      <p className="font-mono text-[10.4px] uppercase tracking-widest text-muted-foreground">Page {safePage + 1} of {pageCount}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={safePage === 0} className="flex min-h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button>
        <button type="button" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={safePage >= pageCount - 1} className="flex min-h-9 items-center gap-1 rounded-lg border border-border/50 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>}
  </div>;
}
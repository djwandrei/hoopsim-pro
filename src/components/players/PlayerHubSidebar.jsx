import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { PHASES, statText } from '@/components/players/blueprintModel';

const SORTS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['name','Name']];
const PAGE = 60;

export default function PlayerHubSidebar({ rows, phase, onPhaseChange, selected, onToggle, onClear }) {
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('pts');
  const [limit,setLimit] = useState(PAGE);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = (term ? rows.filter(row => row.name.toLowerCase().includes(term) || row.teamCode.toLowerCase().includes(term)) : rows.slice()).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.stats[sort] || 0) - (a.stats[sort] || 0));
    return matched;
  },[rows,query,sort]);
  const selectedIds = new Set(selected.map(player => player.id));
  const visible = filtered.slice(0,limit);
  return <div className="flex flex-col gap-3 rounded-2xl border border-border/35 bg-card p-4 shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player index</p>
      <button type="button" onClick={() => { onClear();setQuery(''); }} disabled={!selected.length} className="flex items-center gap-1 rounded-lg border border-border/30 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">Clear <X className="h-3 w-3" /></button>
    </div>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={event => { setQuery(event.target.value);setLimit(PAGE); }} placeholder="Search name or team" className="w-full rounded-lg border border-input bg-raised/40 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground" />
    </label>
    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <select value={sort} onChange={event => setSort(event.target.value)} className="studio-select" aria-label="Sort players">
        {SORTS.map(([key,label]) => <option key={key} value={key}>Sort: {label}</option>)}
      </select>
      <select value={phase} onChange={event => onPhaseChange(event.target.value)} className="studio-select" aria-label="Season type">
        {PHASES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
    <p className="text-[10px] text-muted-foreground">{filtered.length} players · {selected.length}/4 pinned</p>
    <div className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[34rem]">
      {visible.map(row => {
        const active = selectedIds.has(row.id);
        return <button key={row.id} type="button" aria-pressed={active} onClick={() => onToggle(row)} className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${active ? 'border-gold/60 bg-gold/10' : 'border-border/25 bg-raised/25 hover:border-gold/35 hover:bg-raised/50'}`}>
          <PlayerPortrait player={row} className="h-10 w-10 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-xs font-semibold ${active ? 'text-gold' : 'text-foreground'}`}>{row.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{row.teamCode} · {row.positions.join('/')}</span>
          </span>
          <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground"><span className="block text-[8px] uppercase tracking-widest text-muted-foreground">PPG</span>{statText('pts',row.stats.pts)}</span>
        </button>;
      })}
      {filtered.length > limit && <button type="button" onClick={() => setLimit(current => current + PAGE)} className="w-full rounded-lg border border-border/25 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Show more ({filtered.length - limit})</button>}
      {!filtered.length && <p className="py-6 text-center text-xs text-muted-foreground">No players match that search.</p>}
    </div>
  </div>;
}
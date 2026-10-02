import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { PHASES, statText } from '@/components/players/blueprintModel';

const SORTS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['name','Name']];
const COLUMNS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG']];
const PAGE = 60;

export default function PlayerHubSidebar({ rows, phase, onPhaseChange, selected, onToggle, onClear }) {
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('pts');
  const [team,setTeam] = useState('');
  const [limit,setLimit] = useState(PAGE);
  const teams = useMemo(() => [...new Set(rows.map(row => row.teamCode))].sort(),[rows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matched = (term ? rows.filter(row => row.name.toLowerCase().includes(term) || row.teamCode.toLowerCase().includes(term)) : rows.slice()).filter(row => !team || row.teamCode === team).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.stats[sort] || 0) - (a.stats[sort] || 0));
    return matched;
  },[rows,query,sort,team]);
  const selectedIds = new Set(selected.map(player => player.id));
  const visible = filtered.slice(0,limit);
  return <div className="flex flex-col gap-3 rounded-2xl border border-border/35 bg-card p-4 shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player index</p>
      <p className="text-[10px] text-muted-foreground">{filtered.length} players · {selected.length}/4 pinned</p>
    </div>
    <div className="flex flex-nowrap items-center gap-2">
      <label className="relative w-40 shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={event => { setQuery(event.target.value);setLimit(PAGE); }} placeholder="Search name or team" className="w-full rounded-lg border border-input bg-raised/40 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground" />
      </label>
      <select value={team} onChange={event => { setTeam(event.target.value);setLimit(PAGE); }} className="studio-select w-24 shrink-0" aria-label="Filter by team">
        <option value="">All</option>
        {teams.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
      <select value={sort} onChange={event => setSort(event.target.value)} className="studio-select w-28 shrink-0" aria-label="Sort players">
        {SORTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <select value={phase} onChange={event => onPhaseChange(event.target.value)} className="studio-select w-32 shrink-0" aria-label="Season type">
        {PHASES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" onClick={() => { onClear();setQuery(''); }} disabled={!selected.length} className="flex shrink-0 items-center gap-1 rounded-lg border border-border/30 px-2.5 py-2 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">Clear <X className="h-3 w-3" /></button>
    </div>
    <div className="max-h-[28rem] overflow-y-auto pr-1">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left">Player</th>
            <th className="text-left">Team</th>
            <th className="text-left">Pos</th>
            {COLUMNS.map(([key,label]) => <th key={key} className="text-right">{label}</th>)}
            <th className="text-right">Pin</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => {
            const active = selectedIds.has(row.id);
            return <tr key={row.id} aria-pressed={active} onClick={() => onToggle(row)} className={`cursor-pointer transition-colors ${active ? 'bg-gold/10' : 'hover:bg-raised/50'}`}>
              <td><span className="flex items-center gap-2.5"><PlayerPortrait player={row} className="h-8 w-8 rounded-lg shrink-0" /><span className={`truncate text-xs font-semibold ${active ? 'text-gold' : 'text-foreground'}`}>{row.name}</span></span></td>
              <td className="text-xs text-muted-foreground">{row.teamCode}</td>
              <td className="text-xs text-muted-foreground">{row.positions.join('/')}</td>
              {COLUMNS.map(([key]) => <td key={key} className="text-right font-mono text-[11px] tabular-nums text-foreground">{statText(key,row.stats[key])}</td>)}
              <td className="text-right"><button type="button" onClick={event => { event.stopPropagation();onToggle(row); }} className={`rounded-lg border px-2.5 py-1 text-[10px] uppercase tracking-widest ${active ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/25 text-muted-foreground hover:border-gold/35 hover:text-foreground'}`}>{active ? 'Pinned' : 'Pin'}</button></td>
            </tr>;
          })}
          {!filtered.length && <tr><td colSpan={7} className="py-6 text-center text-xs text-muted-foreground">No players match that search.</td></tr>}
        </tbody>
      </table>
      {filtered.length > limit && <button type="button" onClick={() => setLimit(current => current + PAGE)} className="mt-2 w-full rounded-lg border border-border/25 py-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Show more ({filtered.length - limit})</button>}
    </div>
  </div>;
}
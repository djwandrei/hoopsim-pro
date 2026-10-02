import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { statText } from '@/components/players/blueprintModel';

const SORTS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG'],['name','Name']];
const COLUMNS = [['pts','PPG'],['ast','APG'],['reb','RPG'],['mpg','MPG']];
const PAGE = 60;

// Compare-mode player index, modeled on the dossier index: search, team and sort filters,
// then an A/B button pair per row that assigns the player to a comparison slot.
export default function PlayerCompareIndex({ rows, picked, onAssign, onClear }) {
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('pts');
  const [team,setTeam] = useState('');
  const [limit,setLimit] = useState(PAGE);
  const teams = useMemo(() => [...new Set(rows.map(row => row.teamCode))].sort(),[rows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (term ? rows.filter(row => row.name.toLowerCase().includes(term) || row.teamCode.toLowerCase().includes(term)) : rows.slice()).filter(row => !team || row.teamCode === team).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b.stats[sort] || 0) - (a.stats[sort] || 0));
  },[rows,query,sort,team]);
  const visible = filtered.slice(0,limit);
  const pickedCount = (picked.a ? 1 : 0) + (picked.b ? 1 : 0);
  return <div className="flex flex-col gap-3 rounded-2xl border border-border/35 bg-card p-4 shadow-[0_8px_24px_hsl(var(--background)/0.2)]">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">Player index</p>
      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">{filtered.length}</span>players<span className="rounded-full border border-border/30 px-2 py-0.5">{pickedCount}/2 picked</span></p>
    </div>
    <label className="relative block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={event => { setQuery(event.target.value);setLimit(PAGE); }} placeholder="Search name or team" className="w-full rounded-lg border border-input bg-raised/40 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground" />
    </label>
    <div className="grid grid-cols-2 items-center gap-2">
      <select value={team} onChange={event => { setTeam(event.target.value);setLimit(PAGE); }} className="studio-select min-w-0" aria-label="Filter by team">
        <option value="">All teams</option>
        {teams.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
      <select value={sort} onChange={event => setSort(event.target.value)} className="studio-select min-w-0" aria-label="Sort players">
        {SORTS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
    <button type="button" onClick={onClear} disabled={!pickedCount} className="flex shrink-0 items-center gap-1 self-start rounded-lg border border-border/30 px-2.5 py-2 text-[10px] text-muted-foreground transition-colors hover:border-trim/40 hover:text-foreground disabled:opacity-40">Clear <X className="h-3 w-3" /></button>
    <div className="max-h-[28rem] overflow-y-auto pr-1">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left">Player</th>
            <th className="text-left">Team</th>
            <th className="text-left">Pos</th>
            {COLUMNS.map(([key,label]) => <th key={key} className="text-right">{label}</th>)}
            <th className="text-right">Pick</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(row => {
            const inA = picked.a === row.id, inB = picked.b === row.id;
            return <tr key={row.id} className="transition-colors hover:bg-raised/50">
              <td><span className="flex items-center gap-2.5"><PlayerPortrait player={row} className="h-12 w-12 shrink-0" /><span className={`truncate text-xs font-semibold ${inA || inB ? 'text-gold' : 'text-foreground'}`}>{row.name}</span></span></td>
              <td className="text-xs text-muted-foreground">{row.teamCode}</td>
              <td className="text-xs text-muted-foreground">{row.positions.join('/')}</td>
              {COLUMNS.map(([key]) => <td key={key} className="text-right font-mono text-[11px] tabular-nums text-foreground">{statText(key,row.stats[key])}</td>)}
              <td className="text-right">
                <span className="inline-flex gap-1">
                  {['a','b'].map(slot => <button key={slot} type="button" onClick={() => onAssign(slot,row.id)} aria-pressed={(slot === 'a' ? inA : inB)} aria-label={`Assign ${row.name} to player ${slot.toUpperCase()}`} className={`rounded-lg border px-2 py-1 text-[10px] uppercase tracking-widest transition-colors ${(slot === 'a' ? inA : inB) ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/25 text-muted-foreground hover:border-gold/35 hover:text-foreground'}`}>{slot.toUpperCase()}</button>)}
                </span>
              </td>
            </tr>;
          })}
          {!filtered.length && <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">No players match that search.</td></tr>}
        </tbody>
      </table>
      {filtered.length > limit && <button type="button" onClick={() => setLimit(current => current + PAGE)} className="mt-2 w-full rounded-lg border border-border/25 py-2 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-gold/35 hover:text-foreground">Show more ({filtered.length - limit})</button>}
    </div>
  </div>;
}
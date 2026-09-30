import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { perGameStats } from '@/lib/season/labs';

export default function PlayerPicker({ players, onSelect, selectedRef, placeholder = 'Filter players…' }) {
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('all');
  const [sort, setSort] = useState('minutes');
  const [limit, setLimit] = useState(50);
  const q = query.trim().toLowerCase();
  const teamCodes = [...new Set(players.map(p => p.teamCode))].sort();
  const filtered = players.filter(p => (team === 'all' || p.teamCode === team) && (!q || `${p.name} ${p.teamCode}`.toLowerCase().includes(q))).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : Number(b[sort]) - Number(a[sort]));
  const matches = filtered.slice(0, limit);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 rounded-md border border-input bg-raised px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm text-foreground outline-none"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search observed players"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] text-muted-foreground">Team<select value={team} onChange={event => { setTeam(event.target.value); setLimit(50); }} className="mt-1 block w-full rounded-md border border-input bg-raised px-2 text-xs text-foreground"><option value="all">All teams</option>{teamCodes.map(code => <option key={code} value={code}>{code}</option>)}</select></label><label className="text-[10px] text-muted-foreground">Sort by<select value={sort} onChange={event => setSort(event.target.value)} className="mt-1 block w-full rounded-md border border-input bg-raised px-2 text-xs text-foreground"><option value="minutes">Source minutes</option><option value="points">Total points</option><option value="name">Player name</option></select></label></div>
      <p className="mt-3 text-[10px] text-muted-foreground" role="status">{filtered.length} observed player profiles</p>
      <div className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
        {matches.map(p => {
          const stats = perGameStats(p);
          return (
            <button
              key={p.playerRef}
              type="button"
              onClick={() => onSelect(p)}
              aria-pressed={selectedRef === p.playerRef}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                selectedRef === p.playerRef ? 'bg-royal/30 text-foreground' : 'text-foreground hover:bg-raised'
              }`}
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {p.teamCode} · {stats.mpg.toFixed(1)} MPG
              </span>
            </button>
          );
        })}
        {!matches.length && (
          <p className="px-2 py-3 text-sm text-muted-foreground">No players match that filter.</p>
        )}
      </div>
      {filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + 50)} className="mt-3 min-h-10 w-full rounded-lg border border-input text-xs text-gold">Show more players</button>}
    </div>
  );
}
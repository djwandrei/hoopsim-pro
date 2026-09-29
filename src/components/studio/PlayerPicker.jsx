import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { perGameStats } from '@/lib/season/labs';

export default function PlayerPicker({ players, onSelect, selectedRef, placeholder = 'Filter players…' }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = players.filter(p => p.name.toLowerCase().includes(q)).slice(0, 80);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 rounded-md border border-input bg-raised px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm text-foreground outline-none"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
        {matches.map(p => {
          const stats = perGameStats(p);
          return (
            <button
              key={p.playerRef}
              type="button"
              onClick={() => onSelect(p)}
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
    </div>
  );
}
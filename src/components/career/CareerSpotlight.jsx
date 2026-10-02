import React from 'react';
import { Sparkles } from 'lucide-react';
import PlayerPortrait from '@/components/players/PlayerPortrait';
import { perGameStats } from '@/lib/season/labs';

// Quick-pick rail over the archive's most recorded players — a one-click,
// game-like way to browse careers without typing in the search box.
export default function CareerSpotlight({ players, selectedRef, onSelect }) {
  if (!players.length) return null;
  const featured = players.slice(0, 12);
  return (
    <div className="mt-4">
      <p className="bcast-kicker"><Sparkles className="h-3 w-3" /> Spotlight · most recorded minutes</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {featured.map(player => {
          const stats = perGameStats(player);
          const active = selectedRef === player.playerRef;
          return (
            <button
              key={player.playerRef}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(player)}
              className={`flex w-32 shrink-0 flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                active ? 'border-gold/50 bg-gold/10' : 'border-border/40 bg-canvas/40 hover:border-gold/30'
              }`}
            >
              <PlayerPortrait player={player} className="h-14 w-14" frameless />
              <span className="w-full truncate text-[11px] font-medium">{player.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{stats.mpg.toFixed(1)} MPG · {player.teamCode}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
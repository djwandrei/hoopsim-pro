import React from 'react';
import { Button } from '@/components/ui/button';
import { FastForward, Trash2 } from 'lucide-react';

export default function HistoryPanel({ seasons, canSave, onAdvance, onClear, running, note }) {
  return (
    <section className="court-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="court-kicker text-xs">SEASON HISTORY</span>
          <h3 className="court-display text-2xl text-foreground">SAVED SEASONS</h3>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Save completed lab runs, then advance to the next season with a generated schedule and the same pinned team rates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onAdvance()} disabled={running || !canSave} className="gap-2">
            <FastForward className="h-4 w-4" />Advance to next season
          </Button>
          <Button variant="secondary" onClick={onClear} disabled={!seasons.length} className="gap-2">
            <Trash2 className="h-4 w-4" />Clear
          </Button>
        </div>
      </div>
      {note && <p className="mt-3 text-sm text-goldSoft">{note}</p>}
      <ol className="mt-4 space-y-2">
        {seasons.length === 0 && <li className="text-sm text-muted-foreground">No saved seasons yet — run the lab and save from here.</li>}
        {seasons.map((season, index) => (
          <li key={`${season.year}-${index}`} className="rounded-lg border border-border/50 bg-raised/40 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="court-display text-xl text-foreground">{season.label}</span>
              <span className="text-xs text-muted-foreground">{season.repeats} replays{season.champion ? ` · champion ${season.champion}` : ''}{season.leader ? ` · best projection ${season.leader.code} ${Math.round(season.leader.wins)}–${82 - Math.round(season.leader.wins)}` : ''}</span>
            </div>
          </li>
        ))}
      </ol>
      {!canSave && !running && <p className="mt-3 text-xs text-muted-foreground">Run the season lab first — a completed run unlocks save and advance.</p>}
    </section>
  );
}
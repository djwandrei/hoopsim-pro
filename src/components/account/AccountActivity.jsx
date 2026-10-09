import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { loadSavedResults } from '@/lib/savedResults';

const seasonLabel = year => Number.isFinite(Number(year))
  ? `${year}–${String(Number(year) + 1).slice(2)}`
  : 'Season unavailable';

export default function AccountActivity() {
  const [savedResults] = useState(loadSavedResults);

  return (
    <section className="court-panel space-y-4 p-4">
      <div>
        <p className="court-kicker">This browser</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SAVED GAME LAB RESULTS</h2>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        These saves live in this browser and are not attached to your DJHC customer identity.
      </p>
      {savedResults.length ? (
        <ul className="space-y-2">
          {savedResults.map((entry, index) => (
            <li key={entry.id || `${entry.label || 'saved'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/40 bg-raised/30 px-3 py-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{entry.label || 'Saved result'}</span>
              <span className="shrink-0 font-mono text-muted-foreground">
                {seasonLabel(entry.year)} · seed {entry.seed ?? '—'}{entry.neutral ? ' · neutral' : ''}
              </span>
              {entry.score != null && <span className="shrink-0 font-mono text-gold">{entry.score}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No Game Lab results are saved in this browser yet.</p>
      )}
      <Link to="/sims/game" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold hover:underline">
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        Open Game Lab
      </Link>
    </section>
  );
}

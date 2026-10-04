import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Trophy } from 'lucide-react';

export default function CompletionPanel({ total, max, entries, otherGamePath, otherGameTitle, onReplay, seed }) {
  return (
    <section className="court-panel border-gold/50 p-5" aria-label="Run complete">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="bcast-kicker">Run complete</span>
          <h3 className="mt-2 font-display text-3xl tracking-wide">
            <Trophy className="mr-2 inline h-6 w-6 text-gold" />{total}/{max} game points
          </h3>
        </div>
        <button type="button" onClick={onReplay} className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-gold">
          Replay this board
        </button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {entries.map((entry, index) => (
          <li key={entry.key} className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-canvas/40 px-3 py-2 text-xs">
            <span className="truncate font-display tracking-wide">{index + 1}. {entry.title}</span>
            <span className="shrink-0 font-mono tabular-nums text-gold">{entry.points}/{entry.maxPoints}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/30 pt-4">
        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><History className="h-3.5 w-3.5" />Selections and verified outcomes are saved in this browser for the seed {seed || 'today'}.</p>
        {otherGamePath && (
          <Link to={otherGamePath} className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gold">
            Play {otherGameTitle} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
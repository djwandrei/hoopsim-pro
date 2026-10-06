import React from 'react';
import { BookmarkPlus, Play, Trash2 } from 'lucide-react';

const seasonLabel = value => `${value}–${String(value + 1).slice(2)}`;

// The saved-results shelf under the Game Lab hub: pin completed games and
// series by their call, re-open them later, or drop them. Entries are plain
// records from the savedResults store — the page owns save/open/remove.
export default function SavedResultsShelf({ entries, canSave, onSave, onOpen, onRemove, year }) {
  return (
    <section className="court-panel p-4" aria-label="Saved results shelf">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="bcast-kicker">Saved results</p>
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 text-[11px] font-semibold tracking-[0.12em] text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />SAVE CURRENT RESULT
          </button>
        )}
      </header>
      {entries.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Nothing saved yet. After a game or series finishes, pin it here with its exact call — season, teams, seed and neutral-court flag — and re-open it any time to replay the same result.
        </p>
      ) : (
        <ul className="grid gap-2">
          {entries.map(entry => (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border/30 bg-raised/30 px-3 py-2.5">
              <span className="rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">{entry.kind}</span>
              <span className="min-w-0 flex-1 truncate font-display text-base tracking-wide text-foreground">{entry.label}</span>
              <span className="font-mono text-sm font-semibold text-foreground">{entry.score}</span>
              <span className="font-mono text-[10px] text-muted-foreground">seed {entry.seed}{entry.neutral ? ' · neutral' : ''} · {seasonLabel(entry.year)}</span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-gold/40 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:bg-gold/15"
                  aria-label={`Re-open ${entry.label}`}
                >
                  <Play className="h-3 w-3" />Open
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border border-trim/40 px-2 text-trim-ink transition-colors hover:bg-trim/10"
                  aria-label={`Remove ${entry.label} from the shelf`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && year != null && <p className="mt-2 text-[10px] text-muted-foreground">Opening a result from another season switches the season source first, then replays the call.</p>}
    </section>
  );
}
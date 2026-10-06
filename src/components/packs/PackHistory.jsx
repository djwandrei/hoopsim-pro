import React from 'react';
import { Trash2 } from 'lucide-react';

// Browser-local simulation history: each entry is the replay receipt only.
export default function PackHistory({ history, onClear }) {
  return (
    <section className="court-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="court-kicker">Browser-local</p>
          <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">SIMULATION HISTORY</h2>
        </div>
        <button type="button" onClick={onClear} disabled={!history.length} className="rounded-lg border border-border/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />Clear local history</button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">History stores only the ruleset, seed, selected product IDs, drawn product IDs and local timestamp. No prices, customer data or ownership claims. Saved runs stay in this browser.</p>
      {history.length === 0 ? <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">No simulated packs are saved in this browser yet.</p> : (
        <ul className="space-y-2">
          {history.map(entry => <li key={`${entry.openedAt}-${entry.seed}`} className="rounded-lg border border-border/40 bg-raised/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-gold">seed {entry.seed}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{new Date(entry.openedAt).toLocaleString()} · {entry.packSize} of {entry.poolProductIds.length} drawn</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">drawn: {entry.drawnProductIds.join(', ')}</p>
          </li>)}
        </ul>
      )}
    </section>
  );
}
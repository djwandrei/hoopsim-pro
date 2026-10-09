import React from 'react';
import { Trash2 } from 'lucide-react';

// Browser-local receipts keep the replay seed and exact declared product IDs.
// Current images and mappings are reloaded and re-verified before a restore.
export default function PackHistory({ history, onClear, onRestore, restoring = false }) {
  return <section className="court-panel space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="court-kicker">Browser only</p>
        <h2 className="mt-1 font-display text-2xl tracking-wide text-foreground">PACK HISTORY</h2>
      </div>
      {history.length > 0 && <button type="button" onClick={onClear} disabled={restoring} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-2 text-[10.4px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-trim/50 hover:text-trim-ink disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Clear history</button>}
    </div>
    <p className="text-[11px] leading-relaxed text-muted-foreground">Receipts save the seed and product IDs under this browser’s local history. Restoring a pool checks the current catalog and verified mappings again.</p>
    {history.length
      ? <ol className="space-y-2">
        {history.map((entry, index) => <li key={`${entry.openedAt}-${entry.seed}-${index}`} className="rounded-xl border border-border/35 bg-raised/25 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10.4px] uppercase tracking-widest text-muted-foreground">{new Date(entry.openedAt).toLocaleString()} · {entry.packSize} drawn from {entry.poolProductIds.length} eligible cards</p>
              <p className="mt-1 break-all text-xs text-foreground"><span className="text-muted-foreground">Seed: </span><code>{entry.seed}</code></p>
              <p className="mt-1 text-[10.4px] text-muted-foreground">Drawn catalog IDs: {entry.drawnProductIds.join(', ')}</p>
            </div>
            <button type="button" onClick={() => onRestore?.(entry)} disabled={restoring} className="shrink-0 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-[10.4px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:cursor-wait disabled:opacity-40">{restoring ? 'Checking pool…' : 'Restore pool + seed'}</button>
          </div>
        </li>)}
      </ol>
      : <p className="rounded-xl border border-dashed border-border/40 p-4 text-xs text-muted-foreground">Simulated draws saved in this browser will appear here.</p>}
  </section>;
}

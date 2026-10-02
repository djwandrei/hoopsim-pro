import React from 'react';
import { Loader2 } from 'lucide-react';

const fieldCls = 'min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 text-xs text-[var(--myna-text)]';
const btn = 'inline-flex min-h-10 items-center gap-2 rounded-lg px-5 text-[11px] font-semibold tracking-[0.15em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

export default function GameControls({ seed, onSeedChange, neutral, onNeutralChange, onRunGame, onRunSeries, busy, hasGame, hasSeries }) {
  return (
    <section className="myna-panel p-4 hidden" aria-label="Game simulation controls">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-32">
          <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] hidden">Seed</span>
          <input type="number" min={0} value={seed} onChange={(event) => onSeedChange(event.target.value)} className={fieldCls} />
        </label>
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 hidden">
          <span className="text-xs">Neutral court</span>
          <input type="checkbox" checked={neutral} onChange={(event) => onNeutralChange(event.target.checked)} className="h-4 w-4" />
        </div>
        {onRunGame &&
        <button type="button" onClick={onRunGame} disabled={busy} className={`${btn} myna-accent`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {hasGame ? 'Sim new game' : 'Sim game'}
          </button>
        }
        {onRunSeries &&
        <button type="button" onClick={onRunSeries} disabled={busy} className={`${btn} border border-[var(--myna-border)] text-[var(--myna-accent)] hover:bg-[var(--myna-raised)]`}>
            {hasSeries ? 'Sim new series' : 'Sim 7-game series'}
          </button>
        }
      </div>
      <p className="mt-3 text-[11px] myna-muted">Each game models possession pace, four-factor rates and home court (unless neutral) from the observed team package.</p>
    </section>);

}
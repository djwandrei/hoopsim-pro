import React from 'react';
import { Dices, Layers, Play } from 'lucide-react';

const fieldCls = 'min-h-10 w-24 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 myna-mono text-xs text-[var(--myna-text)]';
const ghostBtn = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] px-4 text-[11px] font-semibold tracking-[0.12em] text-[var(--myna-accent)] transition-colors hover:bg-[var(--myna-raised)]';

// Simulation control strip: seed + neutral-court toggle, plus the series run
// action on the series tab (the single-game run lives in the matchup picker).
export default function GameControls({ seed, onSeedChange, neutral, onNeutralChange, onRunSeries, hasSeries }) {
  return (
    <section className="myna-panel flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3" aria-label="Simulation controls">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2">
          <span className="myna-muted text-[10px] font-semibold uppercase tracking-[0.18em]">Seed</span>
          <input type="number" min="1" className={fieldCls} value={seed} onChange={event => onSeedChange(event.target.value)} />
          <button type="button" onClick={() => onSeedChange(String(Math.floor(Math.random() * 9999) + 1))} className={ghostBtn} aria-label="Roll a random seed"><Dices className="h-3.5 w-3.5" />ROLL</button>
        </label>
        <button type="button" aria-pressed={neutral} onClick={() => onNeutralChange(value => !value)}
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-[11px] font-semibold tracking-[0.12em] transition-colors ${neutral ? 'myna-accent border-transparent' : 'border-[var(--myna-border)] text-[var(--myna-muted)] hover:bg-[var(--myna-raised)]'}`}>
          <Layers className="h-3.5 w-3.5" />NEUTRAL COURT · {neutral ? 'ON' : 'OFF'}
        </button>
      </div>
      {onRunSeries && (
        <button type="button" onClick={onRunSeries} className="myna-accent inline-flex min-h-11 items-center gap-2 rounded-lg px-6 text-[12px] font-semibold tracking-[0.18em] transition-opacity hover:opacity-90">
          <Play className="h-3.5 w-3.5" />{hasSeries ? 'SIM NEW SERIES' : 'SIM 7-GAME SERIES'}
        </button>
      )}
    </section>
  );
}
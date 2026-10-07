import React, { useState } from 'react';
import { Check, Link2, Play } from 'lucide-react';

const fieldCls = 'h-9 w-16 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-2 myna-mono text-xs text-[var(--myna-text)] disabled:opacity-55';
const ghostBtn = 'inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--myna-border)] px-3 text-[11px] font-semibold tracking-[0.12em] text-[var(--myna-accent)] transition-colors hover:bg-[var(--myna-raised)] disabled:opacity-40 disabled:cursor-not-allowed';
const chipLabel = 'flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--myna-muted)]';
const hintCls = 'min-w-0 text-[10px] leading-snug text-[var(--myna-muted)]';

// Native engine control strip: the site's possession-engine settings
// (possessions, trials, attack weight) with the series run action and the
// shareable link. One compact row — set before you sim.
export default function GameControls({ settings, onSettingsChange, onRunSeries, hasSeries, onShareLink, running = false, progress = 0, blocked = false }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    await onShareLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const change = (key, value) => onSettingsChange(current => ({ ...current, [key]: value }));
  const inputBlock = (label, title, hint, input) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label className={chipLabel} title={title}>
        {label}
        {input}
      </label>
      <p className={`${hintCls} max-w-40`}>{hint}</p>
    </div>
  );
  return (
    <section className="myna-panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5" aria-label="Simulation controls">
      <span className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">Engine</span>
      {inputBlock('POSS', 'Possessions each team gets per simulated game — the game\'s length (90–110).',
        'Possessions each team gets per game — the game\'s length (90–110).',
        <input type="number" min={90} max={110} step={1} value={settings.possessions} disabled={running} onChange={event => change('possessions', Math.min(110, Math.max(90, Number(event.target.value) || 90)))} className={fieldCls} aria-label="Possessions per game" />)}
      {inputBlock('TRIALS', 'Monte Carlo games the engine plays to estimate the win odds — 100 to 5,000. More trials mean steadier, sharper odds but a slower sim.',
        'Monte Carlo games played to estimate win odds (100–5,000). More trials = steadier odds, slower sim.',
        <input type="number" min={100} max={5000} step={100} value={settings.trials} disabled={running} onChange={event => change('trials', event.target.value)} className={`${fieldCls} w-20`} aria-label="Monte Carlo trials" />)}
      {inputBlock('WEIGHT', 'Applies to both teams the same way. At 0, every offense spreads its possessions evenly across all five defenders. As it rises to 1, each offense steers more possessions toward its single best matchup (usually a star attacking a weaker defender), which stretches the opposing defense. Low weight = steady, averaged-out games; high weight = more star-driven scoring and more game-to-game variance.',
        'How hard each offense funnels possessions to its best matchup (both teams): 0 spreads every look evenly, 1 star-hunts.',
        <input type="number" min={0} max={1} step={0.05} value={settings.attackWeight} disabled={running} onChange={event => change('attackWeight', event.target.value)} className={`${fieldCls} w-14`} aria-label="Offense attack weight" />)}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {running && <span className="myna-mono text-[10px] myna-muted">SIMULATING… {Math.round(progress * 100)}%</span>}
        {!running && blocked && <span className="myna-mono text-[10px] myna-muted">PAUSED — V4 MODEL GATE</span>}
        {onShareLink && (
          <button type="button" onClick={share} className={ghostBtn} aria-label="Copy shareable link">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{copied ? 'COPIED' : 'LINK'}
          </button>
        )}
        {onRunSeries && (
          <button type="button" onClick={onRunSeries} disabled={running || blocked} className="myna-accent inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[12px] font-semibold tracking-[0.18em] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            <Play className="h-3.5 w-3.5" />{hasSeries ? 'SIM NEW SERIES' : 'SIM 7-GAME SERIES'}
          </button>
        )}
      </div>
    </section>
  );
}
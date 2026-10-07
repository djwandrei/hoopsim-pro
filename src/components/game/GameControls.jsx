import React, { useState } from 'react';
import { Check, Link2, Play } from 'lucide-react';

const fieldCls = 'min-h-10 w-24 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-2 myna-mono text-xs text-[var(--myna-text)] disabled:opacity-55';
const ghostBtn = 'inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] px-4 text-[11px] font-semibold tracking-[0.12em] text-[var(--myna-accent)] transition-colors hover:bg-[var(--myna-raised)] disabled:opacity-40 disabled:cursor-not-allowed';
const labelCls = 'flex flex-col gap-1 text-[10px] font-semibold tracking-[0.12em] text-[var(--myna-muted)]';
const hintCls = 'text-[10px] font-normal normal-case tracking-normal leading-snug text-[var(--myna-muted)]';

// Native engine control strip: the site's possession-engine settings
// (possessions, trials, attack weight), plus the series run action and the
// shareable link. Sits at the top of the page — these tune the next sim.
export default function GameControls({ settings, onSettingsChange, onRunSeries, hasSeries, onShareLink, running = false, progress = 0, blocked = false }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    await onShareLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const change = (key, value) => onSettingsChange(current => ({ ...current, [key]: value }));
  return (
    <section className="myna-panel flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-3" aria-label="Simulation controls">
      <div>
        <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">Engine settings</p>
        <p className={hintCls}>Tune these before you sim — they apply to the next game or series.</p>
      </div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <label className={labelCls} title="How many possessions each team gets per simulated game — longer games are more decided by the better team.">
          <span>POSS</span>
          <input type="number" min={90} max={110} step={1} value={settings.possessions} disabled={running} onChange={event => change('possessions', Math.min(110, Math.max(90, Number(event.target.value) || 90)))} className={fieldCls} aria-label="Possessions per game" />
          <span className={hintCls}>Game length — possessions per team.</span>
        </label>
        <label className={labelCls} title="How many Monte Carlo games the engine plays to estimate the win odds — up to 5,000. More trials mean steadier, sharper odds.">
          <span>TRIALS</span>
          <input type="number" min={100} max={5000} step={100} value={settings.trials} disabled={running} onChange={event => change('trials', event.target.value)} className={fieldCls} aria-label="Monte Carlo trials" />
          <span className={hintCls}>Simulated games behind the odds — up to 5,000. More is steadier.</span>
        </label>
        <label className={labelCls} title="How hard each offense concentrates its attack. At 0, both teams spread looks evenly across every defender. At 1, each offense funnels possessions toward its best matchup — usually a star attacking a weaker defender — while the opposing defense is stretched thinner covering it. Higher weight raises the better offense's ceiling and adds game-to-game variance; lower weight averages things out.">
          <span>WEIGHT</span>
          <input type="number" min={0} max={1} step={0.05} value={settings.attackWeight} disabled={running} onChange={event => change('attackWeight', event.target.value)} className={fieldCls} aria-label="Offense attack weight" />
          <span className={hintCls}>0 spreads every look evenly · 1 funnels possessions to each offense's best matchup.</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {running && <span className="myna-mono text-[10px] myna-muted">SIMULATING… {Math.round(progress * 100)}%</span>}
        {!running && blocked && <span className="myna-mono text-[10px] myna-muted">PAUSED — V4 MODEL GATE</span>}
        {onShareLink && (
          <button type="button" onClick={share} className={ghostBtn} aria-label="Copy shareable link">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{copied ? 'LINK COPIED' : 'COPY LINK'}
          </button>
        )}
        {onRunSeries && (
          <button type="button" onClick={onRunSeries} disabled={running || blocked} className="myna-accent inline-flex min-h-11 items-center gap-2 rounded-lg px-6 text-[12px] font-semibold tracking-[0.18em] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
            <Play className="h-3.5 w-3.5" />{hasSeries ? 'SIM NEW SERIES' : 'SIM 7-GAME SERIES'}
          </button>
        )}
      </div>
    </section>
  );
}
import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play, Trophy } from 'lucide-react';

const BLEND_OPTIONS = [
  ['0.5', 'Balanced'],
  ['0.65', 'Own offense +'],
  ['0.35', 'Opp defense +'],
];
const fieldCls = 'min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 text-xs text-[var(--myna-text)]';

export default function LeagueControls({
  years, year, onYearChange, setup, onSetupChange,
  onRun, running, progress, hasResults, championName,
}) {
  const seedValue = Number(setup.seed);
  const seedOk = Number.isInteger(seedValue) && seedValue >= 0 && seedValue <= 4294967295;
  return (
    <section className="myna-panel p-4" aria-label="Season replay controls">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-32">
          <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">Season</span>
          <select className={fieldCls} value={year} onChange={event => onYearChange(Number(event.target.value))} disabled={running}>
            {years.map(value => <option key={value} value={value}>{value}–{String(value + 1).slice(-2)}</option>)}
          </select>
        </label>
        <label className="block w-28">
          <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">Replays</span>
          <select className={fieldCls} value={setup.repeats} onChange={event => onSetupChange({ ...setup, repeats: Number(event.target.value) })} disabled={running}>
            {[1, 2, 5, 10, 25, 50, 100].map(value => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <label className="block w-40">
          <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">Scoring mix</span>
          <select className={fieldCls} value={setup.blend} onChange={event => onSetupChange({ ...setup, blend: event.target.value })} disabled={running}>
            {BLEND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block w-32">
          <span className="myna-muted mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">Seed</span>
          <input
            type="number" min={0} max={4294967295} value={setup.seed} disabled={running}
            onChange={event => onSetupChange({ ...setup, seed: event.target.value })}
            className={fieldCls}
          />
        </label>
        <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3">
          <span className="text-xs">Playoffs</span>
          <Switch aria-label="Include playoffs" checked={setup.playoffs} onCheckedChange={checked => onSetupChange({ ...setup, playoffs: checked })} disabled={running} />
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={running || !seedOk}
          className="myna-accent inline-flex min-h-10 items-center gap-2 rounded-lg px-5 text-[11px] font-semibold tracking-[0.15em] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Simulating…' : hasResults ? 'Run new replay' : 'Run season replay'}
        </button>
      </div>
      {running && (
        <div className="mt-3" role="status" aria-live="polite">
          <div className="flex justify-between text-[11px] myna-muted">
            <span>Replaying the schedule…</span>
            <span className="myna-mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="myna-bar mt-1"><span style={{ width: `${Math.round(progress * 100)}%`, background: 'var(--myna-accent)' }} /></div>
        </div>
      )}
      {hasResults && !running && (
        <p className="mt-3 flex items-center gap-2 text-[11px] myna-muted">
          <Trophy className="h-3.5 w-3.5" />
          {championName
            ? <>Replay champion: <span className="myna-accent-text font-semibold">{championName}</span> · median standings across {setup.repeats} replays.</>
            : <>Median standings across {setup.replays ?? setup.repeats} replays · playoffs off.</>}
        </p>
      )}
    </section>
  );
}
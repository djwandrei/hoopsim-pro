import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Calendar, Gauge, Loader2, Play, Repeat, Trophy } from 'lucide-react';

const BLEND_OPTIONS = [
  ['0.5', 'Balanced'],
  ['0.65', 'Own offense +'],
  ['0.35', 'Opp defense +'],
];
const fieldCls = 'min-h-10 w-full rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3 text-xs text-[var(--myna-text)] transition-colors hover:border-[var(--myna-muted)] focus:border-[var(--myna-accent)] focus:outline-none';
const labelCls = 'myna-muted mb-1.5 block text-[9px] font-bold uppercase tracking-[0.22em]';

// Broadcast replay console: season, replays, scoring mix, playoffs and the run action.
export default function LeagueControls({
  years, year, onYearChange, setup, onSetupChange,
  onRun, running, progress, hasResults, championName, blocked = false,
}) {
  const pct = Math.round((progress || 0) * 100);
  return (
    <section className="myna-panel p-4 sm:p-5" aria-label="Season replay controls">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-1 rounded-full" style={{ background: 'linear-gradient(180deg, var(--myna-accent), transparent)' }} />
          <div>
            <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.22em]">Replay console</p>
            <h3 className="myna-display mt-0.5 text-xl">Season Replay</h3>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.18em]"
          style={running
            ? { borderColor: 'var(--myna-accent)', color: 'var(--myna-accent)' }
            : hasResults
              ? { borderColor: 'var(--myna-border)', color: 'var(--myna-text)' }
              : { borderColor: 'var(--myna-border)', color: 'var(--myna-muted)' }}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse' : ''}`} style={{ background: running ? 'var(--myna-accent)' : 'var(--myna-muted)' }} />
          {running ? `RUNNING · ${pct}%` : blocked ? 'V4 GATED' : hasResults ? 'RESULTS READY' : 'READY'}
        </span>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[9rem_8rem_12rem_auto_auto] lg:items-end">
        <label className="block">
          <span className={labelCls}><Calendar className="mr-1 inline h-3 w-3" />Season</span>
          <select className={fieldCls} value={year} onChange={event => onYearChange(Number(event.target.value))} disabled={running} aria-label="Season">
            {years.map(value => <option key={value} value={value}>{value}–{String(value + 1).slice(-2)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}><Repeat className="mr-1 inline h-3 w-3" />Replays</span>
          <select className={fieldCls} value={setup.repeats} onChange={event => onSetupChange({ ...setup, repeats: Number(event.target.value) })} disabled={running} aria-label="Replays">
            {[1, 2, 5, 10, 25, 50, 100].map(value => <option key={value} value={value}>{value}×</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}><Gauge className="mr-1 inline h-3 w-3" />Scoring mix</span>
          <select className={fieldCls} value={setup.blend} onChange={event => onSetupChange({ ...setup, blend: event.target.value })} disabled={running} aria-label="Scoring mix">
            {BLEND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-3">
          <span className="text-xs">Playoffs</span>
          <Switch aria-label="Include playoffs" checked={setup.playoffs} onCheckedChange={checked => onSetupChange({ ...setup, playoffs: checked })} disabled={running} />
        </label>
        <button
          type="button"
          onClick={onRun}
          disabled={running || blocked}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-5 text-[11px] font-bold tracking-[0.18em] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'linear-gradient(115deg, var(--myna-accent), var(--myna-action-end, var(--myna-hi)))', color: 'var(--myna-on-accent)', boxShadow: '0 6px 18px color-mix(in srgb, var(--myna-accent) 30%, transparent)' }}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Simulating…' : hasResults ? 'Run new replay' : 'Run season replay'}
        </button>
      </div>

      <div className="mt-3 grid gap-3 border-t border-[var(--myna-border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={labelCls}><Calendar className="mr-1 inline h-3 w-3" />Horizon</span>
          <select className={fieldCls} value={setup.horizon} onChange={event => onSetupChange({ ...setup, horizon: event.target.value })} disabled={running} aria-label="Horizon">
            <option value="team">One game per team</option>
            <option value="short">Short schedule</option>
            <option value="full">Full schedule</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}><Calendar className="mr-1 inline h-3 w-3" />Schedule source</span>
          <select className={fieldCls} value={setup.scheduleSource} onChange={event => onSetupChange({ ...setup, scheduleSource: event.target.value })} disabled={running} aria-label="Schedule source">
            <option value="actual">Actual NBA schedule</option>
            <option value="round-robin">Generated round-robin</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}><Trophy className="mr-1 inline h-3 w-3" />Series length</span>
          <select className={fieldCls} value={setup.series} onChange={event => onSetupChange({ ...setup, series: event.target.value })} disabled={running} aria-label="Playoff series length">
            <option value="7">Best of 7</option>
            <option value="5">Best of 5</option>
            <option value="3">Best of 3</option>
            <option value="1">One game</option>
          </select>
        </label>
      </div>

      {running && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="flex justify-between text-[11px] myna-muted">
            <span>Replaying the schedule…</span>
            <span className="myna-mono">{pct}%</span>
          </div>
          <div className="myna-bar mt-1.5"><span className="transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--myna-accent), var(--myna-hi))' }} /></div>
        </div>
      )}

      {hasResults && !running && !championName && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] myna-muted" style={{ borderColor: 'color-mix(in srgb, var(--myna-accent) 35%, transparent)', background: 'color-mix(in srgb, var(--myna-accent) 7%, transparent)' }}>
          <Trophy className="h-3.5 w-3.5" style={{ color: 'var(--myna-accent)' }} />
          {championName
            ? <>Replay champion: <span className="myna-accent-text font-semibold">{championName}</span> · median standings across {setup.repeats} replays.</>
            : <>Median standings across {setup.replays ?? setup.repeats} replays · playoffs off.</>}
        </p>
      )}
    </section>
  );
}
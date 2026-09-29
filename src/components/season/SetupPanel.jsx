import React from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Play } from 'lucide-react';

const selectCls = 'w-full rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground';
const BLEND_OPTIONS = [
  ['0.5', 'Balanced · 50% own offense'],
  ['0.65', 'Lean into own offense · 65%'],
  ['0.35', 'Lean into opponent defense · 35%'],
];

export default function SetupPanel({
  years, year, onYearChange, sourceState, sourceError, league,
  setup, onSetupChange, onRun, running, progress, hasResults,
}) {
  const busy = running || sourceState === 'loading';
  return (
    <section className="court-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="court-kicker">SEASON OUTLOOK</span>
          <h2 className="court-display mt-1 text-3xl text-foreground">BUILD YOUR REPLAY</h2>
        </div>
        <Button onClick={onRun} disabled={busy || sourceState !== 'ready'} className="min-w-44 gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? 'Simulating…' : hasResults ? 'Run new lab' : 'Run season lab'}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Season</span>
          <select className={selectCls} value={year} onChange={event => onYearChange(Number(event.target.value))} disabled={running}>
            {years.map(value => <option key={value} value={value}>{value}–{String(value + 1).slice(-2)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Replays</span>
          <select className={selectCls} value={setup.repeats} onChange={event => onSetupChange({ ...setup, repeats: Number(event.target.value) })} disabled={running}>
            {[1, 2, 5, 10, 25, 50, 100].map(value => <option key={value} value={value}>{value} season{value > 1 ? 's' : ''}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Scoring mix</span>
          <select className={selectCls} value={setup.blend} onChange={event => onSetupChange({ ...setup, blend: event.target.value })} disabled={running}>
            {BLEND_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <div className="flex w-full items-center justify-between rounded-md border border-input bg-raised px-3 py-2">
            <span className="text-sm text-foreground">Playoffs</span>
            <Switch checked={setup.playoffs} onCheckedChange={checked => onSetupChange({ ...setup, playoffs: checked })} disabled={running} />
          </div>
        </div>
      </div>

      {running && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Simulating seasons…</span>
            <span className="font-mono">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-2 rounded-full bg-gold transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Exact NBA schedule · {league ? league.teams.length : '—'} teams</span>
        {league?.hasActualResults && <span className="text-positive">Actual results available for comparison</span>}
        {sourceState === 'loading' && <span className="text-gold">Loading the selected season package…</span>}
        {sourceError && <span className="text-trim">{sourceError}</span>}
      </div>
    </section>
  );
}
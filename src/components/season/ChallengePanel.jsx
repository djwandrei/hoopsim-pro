import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, RotateCcw } from 'lucide-react';

const selectCls = 'rounded-md border border-input bg-raised px-3 py-2 text-sm text-foreground';
const PREDICTIONS = [['more', 'More wins'], ['fewer', 'Fewer wins'], ['same', 'Same wins']];

export default function ChallengePanel({
  summary, focusCode, onFocusChange, record, message, blendLabel, onPlay, onReset, running,
}) {
  const [code, setCode] = useState(focusCode);
  const [prediction, setPrediction] = useState(record.prediction || 'more');
  const baseline = summary.find(row => row.code === code);
  return (
    <section className="court-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="court-kicker text-xs">REPLAY CHALLENGE</span>
          <h3 className="court-display text-2xl text-foreground">PREDICT THE NEXT REPLAY</h3>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Pick a team and call whether its win total moves up, down, or stays in the next replay. The run keeps the current scoring mix ({blendLabel}).
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl text-gold">{record.correct}<span className="text-lg text-muted-foreground">/{record.attempts}</span></div>
          <div className="text-xs text-muted-foreground">{record.streak > 0 ? `${record.streak} in a row` : 'correct picks'}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Team</span>
          <select className={selectCls} value={code} onChange={event => { setCode(event.target.value); onFocusChange(event.target.value); }}>
            {summary.map(row => <option key={row.code} value={row.code}>{row.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Prediction</span>
          <select className={selectCls} value={prediction} onChange={event => setPrediction(event.target.value)}>
            {PREDICTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Button onClick={() => onPlay(code, prediction)} disabled={running || !baseline} className="gap-2">
          {running ? 'Running…' : <><Play className="h-4 w-4" />Play next outcome</>}
        </Button>
        <Button variant="secondary" onClick={onReset} disabled={running || !record.attempts} className="gap-2">
          <RotateCcw className="h-4 w-4" />Reset record
        </Button>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        {baseline && (
          <p className="text-muted-foreground">
            Last replay: <span className="font-mono text-foreground">{code}</span> finished with <span className="font-mono text-gold">{Math.round(summary.find(row => row.code === code)?.winsList?.at(-1) ?? 0)} wins</span>.
          </p>
        )}
        {message && <p className="text-foreground">{message}</p>}
      </div>
    </section>
  );
}
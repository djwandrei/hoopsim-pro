import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { comboKindLabel, comboValueText } from './chemistryFormat';

const MIN_MINUTES = 100;

// Headline insight above the chemistry views: the worst verified combinations
// on the floor (available net rating, at least a 100-minute sample), ranked.
export default function ChemSuspectPanel({ observed, onInvestigate }) {
  const suspects = useMemo(() => (observed?.rows || [])
    .filter(row => row.net?.status === 'available' && Number.isFinite(row.net?.value)
      && row.net.value < 0 && Number(row.minutes) >= MIN_MINUTES)
    .sort((left, right) => left.net.value - right.net.value)
    .slice(0, 4), [observed]);
  if (!suspects.length) return null;
  return <section className="court-panel border-trim/40 p-4 sm:p-5" aria-label="Suspect pairs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="court-kicker flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Suspect pairs · worst verified chemistry</p>
      <button type="button" onClick={onInvestigate} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 text-[10.4px] font-semibold uppercase tracking-widest text-gold transition-colors hover:bg-gold/20">
        Investigate in observed lineups<ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {suspects.map(row => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-trim/30 bg-trim/5 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{row.playerNames.join(' + ')}</p>
            <p className="font-mono text-[10.4px] text-muted-foreground">{row.team} · {comboKindLabel(row.kind)} · {Math.round(row.minutes)} min sample</p>
          </div>
          <span className="font-display text-xl tracking-wide text-trim-ink">{comboValueText(row.net)}</span>
        </div>
      ))}
    </div>
  </section>;
}
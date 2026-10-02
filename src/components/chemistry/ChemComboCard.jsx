import React from 'react';
import { comboEvidenceText, comboKindLabel, comboValueText } from './chemistryFormat';

export default function ChemComboCard({ row, statsByTeamRef }) {
  const averageValues = [['PPG', 'pointsPerGame'], ['APG', 'assistsPerGame'], ['RPG', 'reboundsPerGame']].map(([label, key]) => {
    const values = row.players.map(playerRef => statsByTeamRef.get(`${row.team}|${playerRef}`)?.metrics?.[key]?.value);
    return [label, values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null];
  });
  const hasAverages = averageValues.some(([, value]) => Number.isFinite(value));
  const metrics = [['Offense', row.offense], ['Defense', row.defense], ['Net', row.net]];
  return <article className="court-panel p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-xl">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="court-kicker">Observed lineup</p>
        <h4 className="mt-1 break-words font-display text-lg tracking-wide text-foreground">{row.team} · {row.playerNames.join(' + ')}</h4>
      </div>
      <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-gold">{comboKindLabel(row.kind)}</span>
    </div>
    {Number.isFinite(row.minutes) && <p className="mt-2 text-xs text-muted-foreground">Published sample minutes: {row.minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}.</p>}
    {hasAverages && <div className="mt-3">
      <h5 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Combined player averages</h5>
      <dl className="mt-1.5 grid grid-cols-3 gap-2">
        {averageValues.map(([label, value]) => <div key={label} className="rounded-lg border border-border/40 bg-canvas/70 px-2.5 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 font-display text-lg tracking-wide text-gold">{Number.isFinite(value) ? value.toFixed(1) : '—'}</dd>
        </div>)}
      </dl>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Sum of each player’s individual season average.</p>
    </div>}
    <dl className="mt-3 grid grid-cols-3 gap-2">
      {metrics.map(([label, metric]) => <div key={label} className="rounded-lg border border-border/40 bg-raised/30 px-2.5 py-2">
        <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold text-foreground">{comboValueText(metric)}</dd>
      </div>)}
    </dl>
    <details className="mt-3 border-t border-border/40 pt-2">
      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:text-goldSoft">Metric evidence &amp; coverage</summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-3">
        {metrics.map(([label, metric]) => <div key={label}>
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words text-[11px] text-muted-foreground">{comboEvidenceText(metric)}</dd>
        </div>)}
      </dl>
    </details>
  </article>;
}
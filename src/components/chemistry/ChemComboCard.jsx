import React from 'react';
import { Clock } from 'lucide-react';
import { comboEvidenceText, comboKindLabel, comboValueText, initials } from './chemistryFormat';

export default function ChemComboCard({ row, statsByTeamRef, index = 0 }) {
  const averageValues = [['PPG', 'pointsPerGame'], ['APG', 'assistsPerGame'], ['RPG', 'reboundsPerGame']].map(([label, key]) => {
    const values = row.players.map(playerRef => statsByTeamRef.get(`${row.team}|${playerRef}`)?.metrics?.[key]?.value);
    return [label, values.every(Number.isFinite) ? values.reduce((sum, value) => sum + value, 0) : null];
  });
  const hasAverages = averageValues.some(([, value]) => Number.isFinite(value));
  const net = row.net;
  const netAvailable = net?.status === 'available' && Number.isFinite(net?.value);
  const netPositive = netAvailable && net.value > 0.05;
  const netNegative = netAvailable && net.value < -0.05;
  const sideMetrics = [['Offense', row.offense], ['Defense', row.defense]];
  return <article style={{ '--rise-delay': `${index * 70}ms` }} className="court-panel court-panel-hover rise-in p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 items-center justify-center rounded-lg border border-royal/50 bg-royal/15 px-2.5 font-display text-base tracking-widest text-foreground">{row.team}</span>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-[10.4px] font-semibold uppercase tracking-widest text-gold">{comboKindLabel(row.kind)}</span>
      </div>
      {Number.isFinite(row.minutes) && <span className="bcast-lowerthird"><Clock className="h-3 w-3" aria-hidden="true" /><strong className="font-mono">{row.minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><span className="text-muted-foreground">min sample</span></span>}
    </div>
    <h4 className="sr-only">{row.team} lineup: {row.playerNames.join(', ')}</h4>
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {row.playerNames.map((name, playerIndex) => (
        <React.Fragment key={`${playerIndex}-${name}`}>
          {playerIndex > 0 && <span className="text-[10px] text-muted-foreground/60" aria-hidden="true">+</span>}
          <span className="flex items-center gap-1.5 rounded-full border border-border/40 bg-raised/40 py-1 pl-1 pr-2.5 transition-colors hover:border-royal/50">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-royal/25 font-mono text-[10px] font-semibold text-foreground">{initials(name)}</span>
            <span className="text-xs font-medium leading-none text-foreground">{name}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
    <dl className="mt-4 grid gap-2 sm:grid-cols-[1.35fr_1fr_1fr]">
      <div className={`rounded-xl border px-3 py-2.5 ${netPositive ? 'border-positive/45 bg-positive/10' : netNegative ? 'border-trim/45 bg-trim/10' : 'border-border/40 bg-raised/30'}`}>
        <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Net</dt>
        <dd className={`mt-0.5 font-display text-2xl tracking-wide ${netPositive ? 'text-positive' : netNegative ? 'text-trim-ink' : 'text-foreground'}`}>{comboValueText(net)}</dd>
      </div>
      {sideMetrics.map(([label, metric]) => <div key={label} className="rounded-xl border border-border/40 bg-raised/30 px-3 py-2.5">
        <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 font-display text-lg tracking-wide text-foreground">{comboValueText(metric)}</dd>
      </div>)}
    </dl>
    {hasAverages && <div className="mt-2.5">
      <div className="grid grid-cols-3 gap-2">
        {averageValues.map(([label, value]) => <div key={label} className="rounded-lg border border-border/40 bg-canvas/70 px-2.5 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 font-display text-lg tracking-wide text-gold">{Number.isFinite(value) ? value.toFixed(1) : '—'}</dd>
        </div>)}
      </div>
      <p className="mt-1.5 text-[10.4px] text-muted-foreground">Sum of each player’s individual season average.</p>
    </div>}
    <details className="mt-3 border-t border-border/40 pt-2">
      <summary className="cursor-pointer font-mono text-[10.4px] uppercase tracking-widest text-gold transition-colors hover:text-goldSoft">Metric evidence &amp; coverage</summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-3">
        {sideMetrics.concat([['Net', net]]).map(([label, metric]) => <div key={label}>
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words text-[11px] text-muted-foreground">{comboEvidenceText(metric)}</dd>
        </div>)}
      </dl>
    </details>
  </article>;
}
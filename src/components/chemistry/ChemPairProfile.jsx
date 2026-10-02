import React, { useMemo } from 'react';
import PlayerAvatar from './PlayerAvatar';
import { formatDifference, formatMetric, formatTotal, seasonLabel } from './chemistryFormat';

function IdentityCard({ player, ordinal }) {
  const gold = ordinal === 'second';
  return <article className={`relative overflow-hidden rounded-xl border border-border/40 bg-surface p-4 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/40 ${gold ? 'bg-raised/30' : ''}`}>
    <span className={`absolute inset-x-0 top-0 h-1 ${gold ? 'bg-gold' : 'bg-royal'}`} aria-hidden="true" />
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{gold ? 'Player two' : 'Player one'}</p>
    <div className="mt-3 flex items-center gap-3">
      <PlayerAvatar player={player} tone={gold ? 'gold' : 'royal'} />
      <div className="min-w-0">
        <h4 className="truncate font-display text-xl tracking-wide text-foreground">{player.displayName}</h4>
        <p className="text-xs font-semibold text-muted-foreground">{player.teamCode} · regular season record</p>
      </div>
    </div>
    <div className="mt-3 flex items-baseline justify-between gap-2 rounded-lg border border-border/40 bg-canvas/70 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recorded position</span>
      <strong className="text-right text-xs text-foreground">{Array.isArray(player.positions) && player.positions.length ? player.positions.join(' / ') : 'Position unavailable'}</strong>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2">
      {[['Games', formatTotal(player.games, 'games')], ['Minutes', formatTotal(player.minutes, 'minutes')]].map(([term, value]) => (
        <div key={term} className="rounded-lg border border-border/40 bg-canvas/70 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{term}</dt>
          <dd className="mt-0.5 font-display text-xl tracking-wide text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  </article>;
}

export default function ChemPairProfile({ first, second, dataset, chem }) {
  const metricRows = useMemo(() => chem.pairProfileMetricRows(first, second), [chem, first, second]);
  const teamPair = first.teamCode === second.teamCode ? first.teamCode : `${first.teamCode} vs ${second.teamCode}`;
  return <section className="court-panel p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="court-kicker">Recorded measures</p>
        <h3 className="mt-1 font-display text-3xl tracking-wide text-foreground sm:text-4xl">{first.displayName} vs {second.displayName}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{seasonLabel(dataset.scope)} regular season · {teamPair} · each difference is player one minus player two.</p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Recorded values from the selected exact-season package. This is a descriptive player comparison, not causal chemistry, lineup impact, or a forecast.</p>
      </div>
      <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-center font-mono text-[10px] font-semibold uppercase tracking-widest text-gold">{seasonLabel(dataset.scope)} regular</span>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <IdentityCard player={first} ordinal="first" />
      <IdentityCard player={second} ordinal="second" />
    </div>
    <div className="mt-5 rounded-xl border border-border/40 bg-canvas/60 p-4 sm:p-5">
      <h4 className="font-display text-xl tracking-wide text-gold">Same-metric comparison</h4>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricRows.map(row => {
          const values = [row.firstValue, row.secondValue].filter(value => Number.isFinite(value));
          const maxValue = Math.max(...values, 0);
          const bars = [[first, row.firstValue, 'first', 'from-royal to-royal/55'], [second, row.secondValue, 'second', 'from-gold to-goldSoft']];
          return <article key={row.key} className="rounded-xl border border-border/40 bg-surface p-3.5 transition-all duration-200 hover:border-gold/35 hover:shadow-lg">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-sm font-semibold text-foreground">{row.label}</strong>
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-gold">{row.shortLabel}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{Number.isFinite(row.difference) ? `${first.displayName} − ${second.displayName}: ${formatDifference(row.difference, row.type)}` : 'Difference unavailable'}</p>
            <div className="mt-3 grid gap-2" aria-label={`${row.label}: ${first.displayName} ${formatMetric(row.firstValue, row.type)}; ${second.displayName} ${formatMetric(row.secondValue, row.type)}.`}>
              {bars.map(([player, value, ordinal, gradient]) => {
                const percent = Number.isFinite(value) && maxValue > 0 ? Math.max(0, Math.min(100, value / maxValue * 100)) : 0;
                return <div key={ordinal} className="grid grid-cols-[minmax(3rem,.7fr)_minmax(2.5rem,1fr)_auto] items-center gap-2">
                  <span className="truncate text-[11px] font-semibold text-muted-foreground">{player.displayName}</span>
                  <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-raised shadow-[inset_0_0_0_1px] shadow-border/30">
                    <span className={`block h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${percent}%` }} />
                  </span>
                  <strong className="min-w-14 text-right font-display text-base tracking-wide text-foreground">{formatMetric(value, row.type)}</strong>
                </div>;
              })}
            </div>
            <p className="mt-3 truncate text-[11px] text-muted-foreground">{first.displayName}: {row.firstEvidence.status === 'limited_sample' ? 'Limited sample' : 'Published'}; {second.displayName}: {row.secondEvidence.status === 'limited_sample' ? 'Limited sample' : 'Published'}.</p>
          </article>;
        })}
      </div>
    </div>
    <details className="mt-5 rounded-xl border border-border/40 bg-canvas/60 p-4">
      <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-gold transition-colors hover:text-goldSoft">Exact values, sample sizes, and differences</summary>
      <p className="mt-2 text-xs text-muted-foreground">“pp” means percentage points; sample sizes are shown per rate.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full" aria-label={`${first.displayName} and ${second.displayName}: season values`}>
          <thead>
            <tr>{['Measure', first.displayName, second.displayName, `${first.displayName} − ${second.displayName}`, 'Sample / denominator'].map(label => <th key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {[['Games', first.games, second.games, 'games'], ['Total minutes', first.minutes, second.minutes, 'minutes']].map(([label, left, right, kind]) => {
              const difference = Number.isFinite(left) && Number.isFinite(right) ? left - right : null;
              return <tr key={label}>
                <th scope="row" className="text-left">{label}</th>
                <td>{formatTotal(left, kind)}</td>
                <td>{formatTotal(right, kind)}</td>
                <td>{Number.isFinite(difference) ? formatDifference(difference, 'rate') : 'Unavailable'}</td>
                <td>Season-row total</td>
              </tr>;
            })}
            {metricRows.map(metric => <tr key={metric.key}>
              <th scope="row" className="text-left">{metric.label}</th>
              <td>{formatMetric(metric.firstValue, metric.type)}</td>
              <td>{formatMetric(metric.secondValue, metric.type)}</td>
              <td>{formatDifference(metric.difference, metric.type)}</td>
              <td className="text-muted-foreground">{first.displayName}: {metric.firstEvidence.status}; {second.displayName}: {metric.secondEvidence.status}.</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>
  </section>;
}
import React from 'react';
import { Activity } from 'lucide-react';

const tile = 'rounded-xl border border-[var(--myna-border)] bg-[var(--myna-raised)] px-3 py-2';
const tileLabel = 'myna-accent-text text-[10px] font-semibold uppercase tracking-[0.18em]';

// The site engine's Monte Carlo report in the studio's panel language: win
// shares, expected scoring, sampling error and the margin/length picture.
export default function NativeMatchupReport({ native, home, away }) {
  if (!native) return null;
  const homeShare = Number(native.shares?.a) || 0;
  const awayShare = Number(native.shares?.b) || 0;
  const unresolvedShare = Number(native.shares?.unresolved) || 0;
  const histogram = Array.isArray(native.histogram) ? native.histogram : [];
  const lengths = native.seriesLengths
    ? Object.entries(native.seriesLengths).filter(([, value]) => Number(value) > 0).map(([label, value]) => ({ label, count: Number(value) }))
    : [];
  const bars = histogram.length ? histogram : lengths;
  const maxCount = Math.max(1, ...bars.map(row => row.count));
  const settings = native.settings || {};
  return (
    <section className="myna-panel p-4" aria-label="Native engine report">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="myna-accent-text flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em]"><Activity className="h-3.5 w-3.5" />NATIVE ENGINE REPORT</p>
        <span className="myna-mono text-[10px] myna-muted">{native.modelVersion || native.outcomeModel}</span>
      </div>
      <div className="mt-3 myna-bar"><span style={{ width: `${homeShare * 100}%`, background: 'var(--matchup-home-color)' }} /><span style={{ flex: 1, background: 'var(--matchup-away-color)' }} /></div>
      <div className="myna-mono mt-1 flex justify-between text-[10px] myna-muted">
        <span style={{ color: 'var(--matchup-home-color)' }}>{home.code} WIN {Math.round(homeShare * 100)}%</span>
        {unresolvedShare > 0 && <span>TIE {Math.round(unresolvedShare * 100)}%</span>}
        <span style={{ color: 'var(--matchup-away-color)' }}>{Math.round(awayShare * 100)}% WIN {away.code}</span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className={tile}>
          <p className={tileLabel}>Expected score</p>
          <p className="myna-mono mt-1 text-sm" style={{ color: 'var(--matchup-home-color)' }}>{home.code} {Number(native.expectedScore?.a) || 0}</p>
          <p className="myna-mono text-sm" style={{ color: 'var(--matchup-away-color)' }}>{away.code} {Number(native.expectedScore?.b) || 0}</p>
        </div>
        <div className={tile}>
          <p className={tileLabel}>Sampling error</p>
          <p className="myna-mono mt-1 text-sm">±{((Number(native.standardError?.a) || 0) * 100).toFixed(1)}% {home.code}</p>
          <p className="myna-mono text-sm">±{((Number(native.standardError?.b) || 0) * 100).toFixed(1)}% {away.code}</p>
        </div>
        <div className={tile}>
          <p className={tileLabel}>Engine settings</p>
          <p className="myna-mono mt-1 text-sm">{Number(settings.possessions) || 100} POSS · {Number(settings.trials) || 1000} TRIALS</p>
          <p className="myna-mono text-sm">ATTACK WEIGHT {Number(settings.attackWeight) || 0.5}</p>
        </div>
      </div>
      {bars.length > 0 && (
        <div className="mt-3">
          <p className={tileLabel}>{histogram.length ? 'Margin distribution' : 'Series lengths'}</p>
          <div className="mt-2 space-y-1">
            {bars.map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="myna-mono w-20 shrink-0 text-right text-[10px] myna-muted">{row.label}</span>
                <span className="myna-bar flex-1"><span style={{ width: `${(row.count / maxCount) * 100}%`, background: 'var(--myna-accent)' }} /></span>
                <span className="myna-mono w-10 shrink-0 text-[10px] myna-muted">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="myna-muted mt-3 text-[10.4px] leading-relaxed">Simulated by the site's release-pinned possession engine — the studio never models the outcome itself.</p>
    </section>
  );
}
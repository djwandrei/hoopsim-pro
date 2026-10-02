import React from 'react';

const pct = v => `${(v * 100).toFixed(1)}%`;

// Observed head-to-head edges from the season package rates. Each row's bar
// leans toward the team holding the edge, scaled by a full-swing amount.
export default function MatchupEdges({ teamA, teamB }) {
  const edges = [
    { label: 'Shooting (eFG%)', a: teamA.efg, b: teamB.efg, better: 'max', scale: 0.06, fmt: pct },
    { label: 'Perimeter D (opp eFG%)', a: teamA.oppEfg, b: teamB.oppEfg, better: 'min', scale: 0.06, fmt: pct },
    { label: 'Free-throw rate', a: teamA.ftr, b: teamB.ftr, better: 'max', scale: 0.1, fmt: pct },
    { label: 'Offensive glass', a: teamA.orb, b: teamB.orb, better: 'max', scale: 0.08, fmt: pct },
    { label: 'Defensive glass', a: teamA.drb, b: teamB.drb, better: 'max', scale: 0.08, fmt: pct },
    { label: 'Ball protection (TOV%)', a: teamA.tov, b: teamB.tov, better: 'min', scale: 0.06, fmt: pct },
    { label: 'Takeaways (opp TOV%)', a: teamA.oppTov, b: teamB.oppTov, better: 'max', scale: 0.06, fmt: pct },
    { label: 'Net rating', a: teamA.net, b: teamB.net, better: 'max', scale: 12, fmt: v => v.toFixed(1) },
    { label: 'Pace', a: teamA.pace, b: teamB.pace, better: 'max', scale: 6, fmt: v => v.toFixed(1), neutral: true },
  ];
  const pA = 'hsl(var(--court-royal))';
  const pB = 'hsl(var(--court-accent))';
  return (
    <section className="myna-panel p-4" aria-label="Observed edges">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">OBSERVED EDGES</p>
      <p className="myna-muted mt-1 text-[10px]">Each bar leans toward the team holding the observed edge.</p>
      <div className="mt-3 space-y-2.5">
        {edges.map(edge => {
          const adv = edge.better === 'min' ? edge.b - edge.a : edge.a - edge.b;
          const swing = Math.max(-45, Math.min(45, (adv / edge.scale) * 45));
          const leader = swing > 0 ? teamA : swing < 0 ? teamB : null;
          const leaderValue = edge.fmt(leader === teamA ? edge.a : edge.b);
          return (
            <div key={edge.label} className="rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="myna-muted">{edge.label}</span>
                {leader
                  ? <span className={edge.neutral ? 'myna-muted' : 'font-semibold text-[var(--myna-accent)]'}>{leader.code} {edge.neutral ? 'faster' : 'leads'} · {leaderValue}</span>
                  : <span className="myna-muted">Even</span>}
              </div>
              <div className="mt-1.5 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--myna-raised)' }}>
                <span style={{ width: `${50 + swing}%`, background: pA }} />
                <span className="ml-auto" style={{ width: `${50 - swing}%`, background: pB }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px]">
                <span style={{ color: pA }}>{teamA.code} {edge.fmt(edge.a)}</span>
                <span style={{ color: pB }}>{edge.fmt(edge.b)} {teamB.code}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
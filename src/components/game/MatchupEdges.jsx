import React from 'react';

// Observed head-to-head edges, styled for the themed league hub.
export default function MatchupEdges({ teamA, teamB }) {
  const edges = [
    ['Shooting', teamA.efg - teamB.oppEfg, teamB.efg - teamA.oppEfg],
    ['Rebounding', teamA.orb + teamA.drb, teamB.orb + teamB.drb],
    ['Ball control', teamB.oppTov - teamA.tov, teamA.oppTov - teamB.tov],
  ];
  return (
    <section className="myna-panel p-4" aria-label="Observed edges">
      <p className="myna-accent-text text-[10px] font-semibold uppercase tracking-[0.2em]">OBSERVED EDGES</p>
      <ul className="mt-2 space-y-1.5">
        {edges.map(([label, valueA, valueB]) => {
          const leader = valueA === valueB ? null : valueA > valueB ? teamA : teamB;
          return (
            <li key={label} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--myna-border)] bg-[var(--myna-canvas)] px-2.5 py-2 text-[11px]">
              <span className="myna-muted">{label}</span>
              <span className={leader ? 'font-semibold text-[var(--myna-accent)]' : 'myna-muted'}>{leader ? `${leader.code} leads` : 'Even'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
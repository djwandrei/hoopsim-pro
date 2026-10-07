import React from 'react';
const ROLES = { X1: 'PG', X2: 'SG', X3: 'SF', X4: 'PF', X5: 'C' };
export default function PlayDefender({ id, pos, involved, assignment, scale = 1 }) {
  return <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${scale})`}>
    <title>{id} · {assignment ? `guarding ${assignment}` : 'zone/help responsibility'}</title>
    {involved && <circle r="24" fill="none" stroke="hsl(var(--court-trim-ink) / .85)" strokeWidth="1.6" strokeDasharray="4 5" />}
    <rect x="-18" y="-18" width="36" height="36" rx="7" fill="hsl(var(--court-trim))" stroke="hsl(var(--court-line) / .95)" strokeWidth="2" />
    <text y="-3" textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="800" fill="hsl(var(--court-line))" className="font-mono">{id}</text>
    <text y="8" textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="700" fill="hsl(var(--court-line))" className="font-mono">{ROLES[id]}</text>
  </g>;
}
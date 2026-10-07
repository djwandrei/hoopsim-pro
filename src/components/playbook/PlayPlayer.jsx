import React from 'react';
const ROLES = { O1: 'PG', O2: 'SG', O3: 'SF', O4: 'PF', O5: 'C' };
export default function PlayPlayer({ id, pos, involved, isHandler, scale = 1 }) {
  return <g transform={`translate(${pos[0]}, ${pos[1]}) scale(${scale})`}>
    {isHandler && <circle r="26.5" fill="none" stroke="hsl(var(--court-accent) / 0.6)" strokeWidth="1.6" />}
    {involved && <circle r="24.5" fill="none" stroke="hsl(var(--court-focus) / 0.9)" strokeWidth="2" strokeDasharray="4 5" />}
    <circle r="19" fill="url(#pb-player)" stroke="hsl(var(--court-canvas))" strokeWidth="2.5" />
    <text y="-3" textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="800" fill="hsl(var(--court-canvas))" className="font-mono">{id}</text>
    <text y="8" textAnchor="middle" dominantBaseline="central" fontSize="9.5" fontWeight="700" fill="hsl(var(--court-canvas) / 0.9)" className="font-mono">{ROLES[id]}</text>
  </g>;
}
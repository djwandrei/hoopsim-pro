import React from 'react';
export default function PlayCourtDefs({ playId }) {
  return <defs>
    <marker id={`pb-arrow-${playId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--court-focus))" /></marker>
    <linearGradient id="pb-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--court-wood) / 0.4)" /><stop offset="55%" stopColor="hsl(var(--court-wood) / 0.2)" /><stop offset="100%" stopColor="hsl(var(--court-canvas) / 0.92)" /></linearGradient>
    <linearGradient id="pb-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--court-team-hint) / 0.22)" /><stop offset="100%" stopColor="hsl(var(--court-team-hint) / 0.06)" /></linearGradient>
    <radialGradient id="pb-player" cx="0.35" cy="0.3" r="1"><stop offset="0%" stopColor="hsl(var(--court-focus))" /><stop offset="100%" stopColor="hsl(var(--court-accent))" /></radialGradient>
  </defs>;
}
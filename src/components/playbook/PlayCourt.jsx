import React from 'react';
import { COURT } from '@/components/playbook/playAnimation';

const flip = ([x, y], mirrored) => (mirrored ? [COURT.width - x, y] : [x, y]);
const TRANSITION = 'transform 1.15s cubic-bezier(0.25, 0.8, 0.3, 1)';

function Player({ id, pos, kind, involved, mirrored }) {
  const [x, y] = flip(pos, mirrored);
  const offense = kind === 'o';
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: TRANSITION }}>
      {involved && <circle r="19" fill="none" stroke="hsl(var(--court-focus))" strokeWidth="2" opacity="0.9" />}
      <circle r="14" fill={offense ? 'hsl(var(--court-accent))' : 'hsl(var(--court-trim))'} stroke="hsl(var(--court-canvas))" strokeWidth="2" />
      <text y="0.5" textAnchor="middle" dominantBaseline="central" fontSize="10.4" fontWeight="700" fill={offense ? 'hsl(var(--court-canvas))' : 'hsl(0 0% 98%)'} style={{ fontFamily: 'var(--font-mono)' }}>{id}</text>
    </g>
  );
}

// Animated half-court diagram. Every frame position is applied through a CSS
// transform transition, so players glide from step to step.
export default function PlayCourt({ playId, frame, mirrored = false }) {
  if (!frame) return null;
  const pt = (pos) => flip(pos, mirrored);
  const owner = frame.ballOwner && frame.offense[frame.ballOwner] ? frame.offense[frame.ballOwner] : [250, 300];
  const ball = flip([owner[0] - 12, owner[1] - 20], mirrored);
  return (
    <svg viewBox="0 0 500 470" className="h-auto w-full select-none" role="img" aria-label={`Animated diagram: ${frame.text}`}>
      <defs>
        <marker id={`pb-arrow-${playId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--court-focus))" />
        </marker>
      </defs>
      <rect width="500" height="470" rx="10" fill="hsl(var(--court-canvas) / 0.55)" />
      <g stroke="hsl(var(--court-line) / 0.55)" fill="none" strokeWidth="2">
        <rect x="6" y="6" width="488" height="458" rx="6" />
        <path d="M 30 0 L 30 128 A 237 237 0 0 0 470 128 L 470 0" />
        <rect x="170" y="6" width="160" height="184" />
        <line x1="170" y1="190" x2="330" y2="190" />
        <circle cx="250" cy="190" r="60" />
        <line x1="216" y1="14" x2="284" y2="14" strokeWidth="5" />
        <circle cx="250" cy="470" r="60" />
      </g>
      <circle cx="250" cy="44" r="9" fill="none" stroke="hsl(var(--court-rim))" strokeWidth="3" />
      {frame.passes.map(([from, to], i) => {
        const start = pt(frame.offense[from] || owner);
        const end = pt(frame.offense[to] || owner);
        return <line key={`${from}-${to}-${i}`} className="playbook-pass" x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} markerEnd={`url(#pb-arrow-${playId})`} />;
      })}
      {frame.screens.map((screen, i) => {
        const [x, y] = pt(screen.point);
        return <rect key={`${screen.screener}-${i}`} x={x - 10} y={y - 4} width="20" height="8" rx="2" fill="hsl(var(--court-trim) / 0.5)" stroke="hsl(var(--court-trim) / 0.8)" />;
      })}
      {Object.entries(frame.defense).map(([id, pos]) => (
        <Player key={`d-${id}`} id={id} pos={pos} kind="x" involved={frame.involved.includes(id)} mirrored={mirrored} />
      ))}
      {Object.entries(frame.offense).map(([id, pos]) => (
        <Player key={`o-${id}`} id={id} pos={pos} kind="o" involved={frame.involved.includes(id)} mirrored={mirrored} />
      ))}
      <g style={{ transform: `translate(${ball[0]}px, ${ball[1]}px)`, transition: TRANSITION }}>
        <circle r="8" fill="hsl(var(--court-rim))" stroke="hsl(0 0% 100% / 0.5)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
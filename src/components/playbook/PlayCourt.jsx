import React from 'react';
import { COURT } from '@/components/playbook/playAnimation';

const flip = ([x, y], mirrored) => (mirrored ? [COURT.width - x, y] : [x, y]);
const TRANSITION = 'transform 1.05s cubic-bezier(0.3, 0.9, 0.25, 1)';
const ROLES = { O1: 'PG', O2: 'SG', O3: 'SF', O4: 'PF', O5: 'C' };

// Broadcast-style half-court floor: wood planks, painted key, full markings.
function CourtArt() {
  return (
    <g>
      <rect x="2" y="2" width="496" height="466" rx="14" fill="url(#pb-floor)" stroke="hsl(var(--court-wood-dark) / 0.85)" strokeWidth="3" />
      {/* plank seams */}
      <g stroke="hsl(var(--court-wood-dark) / 0.16)" strokeWidth="1">
        {[86, 172, 258, 344, 430].map((x) => <line key={x} x1={x} y1="4" x2={x} y2="466" />)}
      </g>
      {/* painted key tinted by the focused team's palette */}
      <rect x="170" y="6" width="160" height="184" fill="url(#pb-paint)" />
      <g stroke="hsl(var(--court-line) / 0.9)" fill="none" strokeWidth="2.4">
        <rect x="8" y="8" width="484" height="454" rx="8" />
        <path d="M 30 0 L 30 128 A 237 237 0 0 0 470 128 L 470 0" strokeWidth="2.2" />
        <rect x="170" y="6" width="160" height="184" />
        <line x1="170" y1="190" x2="330" y2="190" />
        <circle cx="250" cy="190" r="60" />
        {/* lane hash marks */}
        <g strokeWidth="1.6">
          {[46, 76, 106, 136, 166].map((y) => (
            <React.Fragment key={y}>
              <line x1="164" y1={y} x2="156" y2={y} />
              <line x1="336" y1={y} x2="344" y2={y} />
            </React.Fragment>
          ))}
        </g>
      </g>
      {/* restricted arc under the rim */}
      <path d="M 219 58 Q 250 86 281 58" fill="none" stroke="hsl(var(--court-line) / 0.6)" strokeWidth="1.8" />
      {/* backboard, rim and net */}
      <line x1="216" y1="15" x2="284" y2="15" strokeWidth="5" strokeLinecap="round" stroke="hsl(var(--court-line) / 0.95)" />
      <circle cx="250" cy="44" r="9" fill="none" stroke="hsl(var(--court-rim))" strokeWidth="3.5" />
      <g stroke="hsl(var(--court-line) / 0.5)" strokeWidth="1">
        <line x1="244" y1="52" x2="246" y2="66" />
        <line x1="256" y1="52" x2="254" y2="66" />
        <line x1="246" y1="66" x2="254" y2="66" />
      </g>
      {/* half-court circle */}
      <circle cx="250" cy="470" r="62" fill="none" stroke="hsl(var(--court-line) / 0.9)" strokeWidth="2.4" />
      <text x="250" y="262" textAnchor="middle" fontSize="27" fontWeight="800" letterSpacing="12" fill="hsl(var(--court-accent) / 0.09)" style={{ fontFamily: 'var(--font-display)' }}>SWISHIQ</text>
    </g>
  );
}

function Player({ id, pos, involved, isHandler }) {
  const [x, y] = pos;
  return (
    <g style={{ transform: `translate(${x}px, ${y}px)`, transition: TRANSITION }}>
      {isHandler && <circle r="26.5" fill="none" stroke="hsl(var(--court-accent) / 0.6)" strokeWidth="1.6" />}
      {involved && (
        <circle r="24.5" fill="none" stroke="hsl(var(--court-focus) / 0.9)" strokeWidth="2" strokeDasharray="4 5">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r="19" fill="url(#pb-player)" stroke="hsl(var(--court-canvas))" strokeWidth="2.5" />
      <text y="-2.5" textAnchor="middle" dominantBaseline="central" fontSize="10.5" fontWeight="800" fill="hsl(var(--court-canvas))" style={{ fontFamily: 'var(--font-mono)' }}>{id}</text>
      <text y="8.5" textAnchor="middle" dominantBaseline="central" fontSize="8.6" fontWeight="700" letterSpacing="0.6" fill="hsl(var(--court-canvas) / 0.82)" style={{ fontFamily: 'var(--font-mono)' }}>{ROLES[id] || ''}</text>
    </g>
  );
}

// Animated half-court diagram. Offense only: every frame position is applied
// through a CSS transform transition, so players glide from step to step, and
// a dashed trail marks the path each mover travels.
export default function PlayCourt({ playId, frame, prevFrame, mirrored = false }) {
  if (!frame) return null;
  const pt = (pos) => flip(pos, mirrored);
  const owner = frame.ballOwner && frame.offense[frame.ballOwner] ? frame.offense[frame.ballOwner] : [250, 300];
  const ball = pt([owner[0] - 12, owner[1] - 20]);
  const trails = prevFrame
    ? Object.entries(prevFrame.offense)
        .map(([id, from]) => {
          const to = frame.offense[id];
          if (!to || Math.hypot(to[0] - from[0], to[1] - from[1]) < 12) return null;
          const a = pt(from);
          const b = pt(to);
          return <line key={`trail-${id}`} className="playbook-trail" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })
        .filter(Boolean)
    : [];
  return (
    <svg viewBox="0 0 500 470" className="h-auto w-full select-none" role="img" aria-label={`Animated diagram: ${frame.text}`}>
      <defs>
        <marker id={`pb-arrow-${playId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--court-focus))" />
        </marker>
        <linearGradient id="pb-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--court-wood) / 0.4)" />
          <stop offset="55%" stopColor="hsl(var(--court-wood) / 0.2)" />
          <stop offset="100%" stopColor="hsl(var(--court-canvas) / 0.92)" />
        </linearGradient>
        <linearGradient id="pb-paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--court-team-hint) / 0.22)" />
          <stop offset="100%" stopColor="hsl(var(--court-team-hint) / 0.06)" />
        </linearGradient>
        <radialGradient id="pb-player" cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="hsl(var(--court-focus))" />
          <stop offset="100%" stopColor="hsl(var(--court-accent))" />
        </radialGradient>
      </defs>
      <CourtArt />
      {trails}
      {frame.screens.map((screen, i) => {
        const [x, y] = pt(screen.point);
        return <rect key={`${screen.screener}-${i}`} x={x - 16} y={y - 5} width="32" height="10" rx="3" fill="hsl(var(--court-trim) / 0.35)" stroke="hsl(var(--court-trim) / 0.9)" strokeWidth="1.5" />;
      })}
      {frame.passes.map(([from, to], i) => {
        const a = pt(frame.offense[from] || owner);
        const b = pt(frame.offense[to] || owner);
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2 - 26;
        const path = `M ${a[0]} ${a[1]} Q ${mx} ${my} ${b[0]} ${b[1]}`;
        return (
          <g key={`${from}-${to}-${i}`}>
            <path className="playbook-pass" d={path} fill="none" markerEnd={`url(#pb-arrow-${playId})`} />
            <circle r="7" fill="hsl(var(--court-rim))" stroke="hsl(0 0% 100% / 0.6)" strokeWidth="1.5">
              <animateMotion dur="0.9s" fill="freeze" path={path} />
            </circle>
          </g>
        );
      })}
      {Object.entries(frame.offense).map(([id, pos]) => (
        <Player key={`o-${id}`} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} isHandler={frame.ballOwner === id} />
      ))}
      <g style={{ transform: `translate(${ball[0]}px, ${ball[1]}px)`, transition: TRANSITION }}>
        <circle r="8" fill="hsl(var(--court-rim))" stroke="hsl(0 0% 100% / 0.5)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
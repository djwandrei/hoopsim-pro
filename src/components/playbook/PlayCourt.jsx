import React from 'react';
import { COURT, distance } from '@/components/playbook/playGeometry';
import PlayPlayer from '@/components/playbook/PlayPlayer';
import usePlayMotion from '@/components/playbook/usePlayMotion';

const flip = ([x, y], mirrored) => (mirrored ? [COURT.width - x, y] : [x, y]);

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

// Animated half-court diagram. Offense only: every frame position is applied
// through a CSS transform transition, so players glide from step to step, and
// a dashed trail marks the path each mover travels.
export default function PlayCourt({ playId, frame, mirrored = false, speed = 1 }) {
  const pose = usePlayMotion(frame, speed);
  const pt = pos => flip(pos, mirrored);
  const routes = pose.routes || frame.routes || {};
  return <svg viewBox="0 0 500 470" className="h-auto w-full select-none" role="img" aria-label={`Animated diagram: ${frame.text}`}>
    <defs>
      <marker id={`pb-arrow-${playId}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--court-focus))" /></marker>
      <linearGradient id="pb-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--court-wood) / 0.4)" /><stop offset="55%" stopColor="hsl(var(--court-wood) / 0.2)" /><stop offset="100%" stopColor="hsl(var(--court-canvas) / 0.92)" />
      </linearGradient>
      <linearGradient id="pb-paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--court-team-hint) / 0.22)" /><stop offset="100%" stopColor="hsl(var(--court-team-hint) / 0.06)" /></linearGradient>
      <radialGradient id="pb-player" cx="0.35" cy="0.3" r="1"><stop offset="0%" stopColor="hsl(var(--court-focus))" /><stop offset="100%" stopColor="hsl(var(--court-accent))" /></radialGradient>
    </defs>
    <CourtArt />
    {Object.entries(routes).filter(([, route]) => route.length > 1 && distance(route[0], route[route.length - 1]) > 10).map(([id, route]) => <path key={id} className="playbook-trail" d={route.map((p, i) => `${i ? 'L' : 'M'} ${pt(p).join(' ')}`).join(' ')} fill="none" />)}
    {frame.screens.map((screen, i) => { const [x, y] = pt(screen.point); return <rect key={`${screen.screener}-${i}`} x={x - 16} y={y - 5} width="32" height="10" rx="3" fill="hsl(var(--court-trim) / 0.35)" stroke="hsl(var(--court-trim) / 0.9)" strokeWidth="1.5" />; })}
    {frame.passes.map(([from, to], i) => {
      const a = pt(pose.offense[from]), b = pt(pose.offense[to]);
      return <path key={`${from}-${to}-${i}`} className="playbook-pass" d={`M ${a.join(' ')} Q ${(a[0]+b[0])/2} ${(a[1]+b[1])/2-26} ${b.join(' ')}`} fill="none" markerEnd={`url(#pb-arrow-${playId})`} />;
    })}
    {Object.entries(pose.offense).map(([id, pos]) => <PlayPlayer key={id} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} isHandler={pose.progress === 1 && frame.ballOwner === id} />)}
    <g transform={`translate(${pt(pose.ball).join(', ')})`}><circle r="8" fill="hsl(var(--court-rim))" stroke="hsl(var(--court-line) / 0.7)" strokeWidth="1.5" /></g>
  </svg>;
}
import React from 'react';
import { COURT, distance } from '@/components/playbook/playGeometry';
import PlayPlayer from '@/components/playbook/PlayPlayer';
import PlayDefender from '@/components/playbook/PlayDefender';
import PlayCourtArt from '@/components/playbook/PlayCourtArt';
import PlayCourtDefs from '@/components/playbook/PlayCourtDefs';
import PlayCourtLegend from '@/components/playbook/PlayCourtLegend';
import usePlayMotion from '@/components/playbook/usePlayMotion';

const flip = ([x, y], mirrored) => (mirrored ? [COURT.width - x, y] : [x, y]);

// Players and ball share one clock; defensive schemes add a five-player shell.
export default function PlayCourt({ playId, frame, mirrored = false, speed = 1, paused = false, playing = false, onComplete }) {
  const pose = usePlayMotion(frame, speed, paused, playing, onComplete);
  const fullCourt = frame.courtHeight > 470;
  const scale = fullCourt ? 1.3 : 1;
  const pt = pos => flip(pos, mirrored);
  const routes = pose.routes || frame.routes || {};
  return <><svg viewBox={`0 0 500 ${frame.courtHeight || 470}`} className={fullCourt ? 'mx-auto h-auto max-h-[780px] w-full select-none' : 'h-auto w-full select-none'} role="img" aria-label={`Animated diagram: ${frame.text}`}>
    <PlayCourtDefs playId={playId} />
    <PlayCourtArt fullCourt={fullCourt} />
    {Object.entries(routes).filter(([, route]) => route.length > 1 && distance(route[0], route[route.length - 1]) > 10).map(([id, route]) => <path key={id} stroke={id.startsWith('X') ? 'hsl(var(--court-trim-ink) / .65)' : 'hsl(var(--court-accent) / .5)'} strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" d={route.map((p, i) => `${i ? 'L' : 'M'} ${pt(p).join(' ')}`).join(' ')} fill="none" />)}
    {frame.screens.map((screen, i) => { const [x, y] = pt(screen.point); return <rect key={`${screen.screener}-${i}`} x={x - 16} y={y - 5} width="32" height="10" rx="3" fill="hsl(var(--court-trim) / 0.35)" stroke="hsl(var(--court-trim) / 0.9)" strokeWidth="1.5" />; })}
    {frame.passes.map(([from, to], i) => {
      const a = pt(pose.actors[from]), b = pt(pose.actors[to]);
      return <path key={`${from}-${to}-${i}`} className="playbook-pass" d={`M ${a.join(' ')} Q ${(a[0]+b[0])/2} ${(a[1]+b[1])/2-26} ${b.join(' ')}`} fill="none" markerEnd={`url(#pb-arrow-${playId})`} />;
    })}
    {Object.entries(pose.actors).map(([id, pos]) => id.startsWith('X')
      ? <PlayDefender key={id} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} assignment={frame.matchups?.[id]} scale={scale} />
      : <PlayPlayer key={id} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} isHandler={pose.progress === 1 && frame.ballOwner === id} scale={scale} />)}
    <g transform={`translate(${pt(pose.ball).join(', ')})`}><circle r="8" fill="hsl(var(--court-rim))" stroke="hsl(var(--court-line) / 0.7)" strokeWidth="1.5" /></g>
  </svg><PlayCourtLegend frame={frame} /></>;
}
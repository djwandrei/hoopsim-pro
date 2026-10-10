import React from 'react';
import { COURT, distance } from '@/components/playbook/playGeometry';
import PlayPlayer from '@/components/playbook/PlayPlayer';
import PlayDefender from '@/components/playbook/PlayDefender';
import PlayCourtArt from '@/components/playbook/PlayCourtArt';
import PlayCourtDefs from '@/components/playbook/PlayCourtDefs';
import PlayCourtLegend from '@/components/playbook/PlayCourtLegend';
import usePlayMotion from '@/components/playbook/usePlayMotion';
import { mirrorText } from '@/components/playbook/playNarration';

const flip = ([x, y], mirrored) => (mirrored ? [COURT.width - x, y] : [x, y]);

// Players and ball share one clock; defensive schemes add a five-player shell.
export default function PlayCourt({ playId, frame, mirrored = false, speed = 1, paused = false, playing = false, onComplete, showDefense = true }) {
  const pose = usePlayMotion(frame, speed, paused, playing, onComplete);
  const fullCourt = frame.courtHeight > 470;
  const scale = fullCourt ? 1.3 : 1;
  const pt = pos => flip(pos, mirrored);
  const routes = pose.routes || frame.routes || {};
  const viewBox = frame.inboundSide === 'baseline' ? '0 -60 500 530' : frame.inboundSide === 'sideline' ? '-60 0 620 470' : `0 0 500 ${frame.courtHeight || 470}`;
  return <><svg viewBox={viewBox} className={fullCourt ? 'mx-auto h-auto max-h-[780px] w-full select-none' : 'h-auto w-full select-none'} role="img" aria-label={`Animated diagram: ${mirrorText(frame.text, mirrored)}`}>
    <PlayCourtDefs playId={playId} />
    <PlayCourtArt fullCourt={fullCourt} />
    {Object.entries(routes).filter(([id, route]) => (showDefense || !id.startsWith('X')) && route.length > 1 && distance(route[0], route[route.length - 1]) > 10).map(([id, route]) => <path key={id} data-route={id} stroke={id.startsWith('X') ? 'hsl(var(--court-trim-ink) / .65)' : 'hsl(var(--court-accent) / .5)'} strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" d={route.map((p, i) => `${i ? 'L' : 'M'} ${pt(p).join(' ')}`).join(' ')} fill="none" />)}
    {(pose.screens || []).map((screen, i) => { const [x, y] = pt(screen.point), target = pt(pose.actors[screen.target]); const angle = Math.atan2(target[1] - y, target[0] - x) * 180 / Math.PI + 90; return <rect key={`${screen.screener}-${i}`} transform={`rotate(${angle} ${x} ${y})`} x={x - 16} y={y - 5} width="32" height="10" rx="3" fill="hsl(var(--court-trim) / 0.35)" stroke="hsl(var(--court-trim) / 0.9)" strokeWidth="1.5" />; })}
    {(pose.passPaths || []).map((path, i) => {
      return <path key={i} className="playbook-pass" d={`M ${pt(path.from).join(' ')} Q ${pt(path.control).join(' ')} ${pt(path.to).join(' ')}`} fill="none" markerEnd={`url(#pb-arrow-${playId})`} />;
    })}
    {Object.entries(pose.actors).filter(([id]) => showDefense || !id.startsWith('X')).map(([id, pos]) => id.startsWith('X')
      ? <PlayDefender key={id} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} assignment={pose.matchups?.[id]} scale={scale} />
      : <PlayPlayer key={id} id={id} pos={pt(pos)} involved={frame.involved.includes(id)} isHandler={pose.ballOwner === id && !(pose.passPaths || []).length} scale={scale} />)}
    {pose.ball && <g transform={`translate(${pt(pose.ball).join(', ')})`}><circle r="8" fill="hsl(var(--court-rim))" stroke="hsl(var(--court-line) / 0.7)" strokeWidth="1.5" /></g>}
  </svg><PlayCourtLegend frame={frame} showDefense={showDefense} /></>;
}

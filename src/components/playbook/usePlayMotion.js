import { useEffect, useRef, useState } from 'react';
import { clonePositions, distance } from '@/components/playbook/playGeometry';
import { planRoutes, pointOnRoute } from '@/components/playbook/playMotion';
const ballAt = (pos, owner) => { const p = pos[owner] || [250, 300]; return [p[0] + 24, p[1] - 17]; };
// One clock drives every player AND the only ball. No independent CSS/SMIL
// clocks, duplicate pass balls, or speed-independent player transitions.
export default function usePlayMotion(frame, speed = 1) {
  const [pose, setPose] = useState(() => ({ offense: frame.offense, ball: ballAt(frame.offense, frame.ballOwner), progress: 1 }));
  const latest = useRef(pose);
  const lastFrame = useRef(frame);
  const rate = useRef(speed); rate.current = speed;
  useEffect(() => {
    if (lastFrame.current === frame) return;
    lastFrame.current = frame;
    const start = clonePositions(latest.current.offense);
    const canonical = Object.keys(start).every(id => frame.routes?.[id]?.[0] && distance(start[id], frame.routes[id][0]) < 1);
    const routes = canonical ? frame.routes : planRoutes(start, frame.offense);
    const exchanges = frame.exchanges || [];
    let request, previousTime, elapsed = 0;
    const update = time => {
      if (previousTime !== undefined) elapsed += (time - previousTime) * rate.current;
      previousTime = time;
      const progress = Math.min(1, elapsed / (frame.duration || 1800));
      const moveT = Math.min(1, progress / (exchanges.length ? 0.65 : 1));
      const smooth = moveT * moveT * (3 - 2 * moveT);
      const offense = Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, pointOnRoute(route, smooth)]));
      let ball = ballAt(offense, exchanges[0]?.from || frame.ballOwner);
      if (exchanges.length && progress >= 0.65) {
        const flight = Math.min(0.999999, (progress - 0.65) / 0.35) * exchanges.length;
        const exchange = exchanges[Math.floor(flight)];
        const t = flight % 1, from = ballAt(offense, exchange.from), to = ballAt(offense, exchange.to);
        ball = [from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t-(exchange.handoff ? 4 : 26)*4*t*(1-t)];
      }
      if (progress >= 1) ball = ballAt(offense, frame.ballOwner);
      latest.current = { offense, ball, progress }; setPose(latest.current);
      if (progress < 1) request = requestAnimationFrame(update);
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      latest.current = { offense: frame.offense, ball: ballAt(frame.offense, frame.ballOwner), progress: 1 }; setPose(latest.current);
      return;
    }
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
  }, [frame]);
  return pose;
}
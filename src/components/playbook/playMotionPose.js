import { pointOnRoute } from '@/components/playbook/playMotion';
export const actorsForFrame = frame => ({ ...frame.offense, ...(frame.defense || {}) });
const ballAt = (pos, owner) => { const p = pos[owner]; return [p[0] + 24, p[1] - 17]; };
export function staticPose(frame) {
  return { actors: actorsForFrame(frame), ball: ballAt(frame.offense, frame.ballOwner), progress: 1, routes: frame.routes || {} };
}
// Ball-first phases let a pass trigger a closeout, or let a passer cut AFTER
// releasing the ball. Movement-first phases preserve screen/roll timing.
export function samplePose(frame, routes, progress) {
  const exchanges = frame.exchanges || [];
  const hasMovement = Object.values(routes).some(r => r.length > 1 && (r[0][0] !== r[r.length-1][0] || r[0][1] !== r[r.length-1][1]));
  const ballFirst = frame.passFirst && exchanges.length;
  const moveT = ballFirst ? Math.max(0, (progress-0.35)/0.65) : Math.min(1, progress/(exchanges.length ? 0.65 : 1));
  const smooth = moveT*moveT*(3-2*moveT);
  const actors = Object.fromEntries(Object.entries(routes).map(([id, route]) => [id, pointOnRoute(route, smooth)]));
  const start = ballFirst ? 0 : hasMovement ? 0.65 : 0.12;
  const end = ballFirst ? 0.35 : hasMovement ? 1 : 0.75;
  let ball = ballAt(actors, exchanges[0]?.from || frame.ballOwner);
  if (exchanges.length && progress >= start) {
    const flight = Math.min(0.999999, Math.max(0, (progress-start)/(end-start))) * exchanges.length;
    const exchange = exchanges[Math.floor(flight)], t = flight % 1;
    const from = ballAt(actors, exchange.from), to = ballAt(actors, exchange.to);
    const chord = Math.hypot(to[0]-from[0], to[1]-from[1]);
    const peak = exchange.handoff ? 4 : Math.min(44, 14 + chord * 0.14);
    ball = [from[0]+(to[0]-from[0])*t,from[1]+(to[1]-from[1])*t-peak*4*t*(1-t)];
    if (progress >= end) ball = ballAt(actors, frame.ballOwner);
  }
  return { actors, ball, progress, routes };
}
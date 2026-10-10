import { pointOnRoute, routeLength } from '@/components/playbook/playMotion';
export const actorsForFrame = frame => ({ ...frame.offense, ...(frame.defense || {}) });
export function ballAt(actors, owner, loose = null) {
  const point = actors[owner];
  return point ? [point[0] + 24, point[1] - 17] : loose;
}
// The drawn arrow and the moving ball use exactly the same quadratic curve.
export function ballArc(from, to, handoff = false) {
  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const peak = handoff ? 4 : Math.min(44, 14 + chord * 0.14);
  return { from, to, control: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - peak * 2] };
}
export function pointOnArc(path, t) {
  const k = 1 - t;
  return [0, 1].map(axis => k * k * path.from[axis] + 2 * k * t * path.control[axis] + t * t * path.to[axis]);
}
function phasePaths(phase, actors) {
  if (phase.exchange) return [ballArc(ballAt(actors, phase.exchange.from), ballAt(actors, phase.exchange.to), phase.exchange.handoff)];
  if (phase.shot) return [ballArc(ballAt(actors, phase.shot.from), phase.shot.to)];
  return [];
}
export function staticPose(frame) {
  const actors = actorsForFrame(frame), last = frame.phases?.[frame.phases.length - 1];
  return { actors, ball: ballAt(actors, frame.ballOwner, frame.ball), ballOwner: frame.ballOwner, matchups: frame.matchups || {}, screens: frame.screens || [],
    passPaths: last ? phasePaths(last, actors) : [], progress: 1, routes: frame.routes || {}, phaseIndex: frame.phases?.length - 1 };
}
// Every screen approach, cut, transfer and finish has its own timed phase.
// Sampling a frame never infers a pass from the final owner's position.
export function samplePose(frame, _routes, progress) {
  if (!frame.phases?.length || progress >= 1) return staticPose(frame);
  const elapsed = Math.max(0, progress) * frame.duration;
  let remaining = elapsed, index = 0;
  while (index < frame.phases.length - 1 && remaining + 0.000001 >= frame.phases[index].duration) remaining = Math.max(0, remaining - frame.phases[index++].duration);
  const phase = frame.phases[index], t = Math.min(1, remaining / phase.duration), smooth = t * t * (3 - 2 * t);
  const actors = Object.fromEntries(Object.entries(phase.routes).map(([id, route]) => [id, pointOnRoute(route, smooth)]));
  const passPaths = phasePaths(phase, actors);
  let ballOwner = phase.startOwner, ball = ballAt(actors, ballOwner, phase.startBall);
  if (passPaths.length) {
    ball = pointOnArc(passPaths[0], smooth);
    if (phase.shot && t > 0) ballOwner = null;
    if (t >= 1) ballOwner = phase.ballOwner;
  } else if (ballOwner && routeLength(phase.routes[ballOwner]) > 10 && t > 0 && t < 1) {
    ball = [ball[0], ball[1] + Math.abs(Math.sin(remaining * Math.PI / 260)) * Math.sin(Math.PI * t) * 18];
  }
  const screens = phase.startScreens.filter(screen => phase.screens.some(end => end.screener === screen.screener && end.target === screen.target) && routeLength(phase.routes[screen.screener]) < 1);
  if (t >= 0.999) for (const screen of phase.screens) if (!screens.some(old => old.screener === screen.screener && old.target === screen.target)) screens.push(screen);
  return { actors, ball, ballOwner, matchups: t < 1 ? phase.startMatchups : phase.matchups, screens, passPaths, progress, routes: phase.routes, phaseIndex: index };
}

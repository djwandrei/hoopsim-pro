import { clampPoint, distance } from '@/components/playbook/playGeometry';
import separateRoutes from '@/components/playbook/playRouteSpacing';
const CLEARANCE = 38.9;
function segmentClear(a, b, obstacles, clearance = CLEARANCE) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  return obstacles.every(p => {
    const t = len ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)) : 0;
    return distance(p, [a[0]+t*dx,a[1]+t*dy]) >= clearance;
  });
}
// Visibility graph routes bend around resting teammates rather than drawing
// a straight line through them. Screen usage adds a tactical approach waypoint.
function routeBetween(from, to, obstacles, height = 470) {
  const clearance = height > 470 ? 50.9 : CLEARANCE;
  if (segmentClear(from, to, obstacles, clearance)) return [from, to];
  const nodes = [from, to];
  obstacles.forEach(p => {
    const radius = clearance + 1;
    const angles = Array.from({ length: 32 }, (_, i) => i * Math.PI / 16);
    // Tangents preserve the narrow legal exit from a corner or a screen;
    // a coarse radial grid alone can incorrectly report that exit blocked.
    for (const anchor of [from, to, ...obstacles]) {
      const gap = distance(p, anchor);
      if (gap <= radius) continue;
      const direction = Math.atan2(anchor[1] - p[1], anchor[0] - p[0]), tangent = Math.acos(radius / gap);
      angles.push(direction - tangent, direction + tangent);
    }
    for (const angle of angles) {
      const node = clampPoint([p[0]+Math.cos(angle)*radius,p[1]+Math.sin(angle)*radius], height);
      if (obstacles.every(other => distance(node, other) >= clearance)) nodes.push(node);
    }
  });
  const costs = nodes.map(() => Infinity), prev = [], visited = new Set();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let best = -1;
    nodes.forEach((_, i) => { if (!visited.has(i) && (best < 0 || costs[i] < costs[best])) best = i; });
    if (best < 0 || !Number.isFinite(costs[best])) break;
    if (best === 1) {
      const route = []; for (let i = 1; i !== undefined; i = prev[i]) route.unshift(nodes[i]);
      return route;
    }
    visited.add(best);
    nodes.forEach((node, i) => {
      if (visited.has(i) || !segmentClear(nodes[best], node, obstacles, clearance)) return;
      const cost = costs[best] + distance(nodes[best], node);
      if (cost < costs[i]) { costs[i] = cost; prev[i] = best; }
    });
  }
  return null;
}
export function planRoutes(previous, next, via = {}, height = 470, following = {}) {
  const routes = {};
  const clearance = height > 470 ? 50.9 : CLEARANCE;
  const stationary = Object.keys(next).filter(id => distance(previous[id], next[id]) < 1);
  for (const id of Object.keys(next)) {
    if (following[id] && distance(previous[following[id]], next[following[id]]) > 1) continue;
    const obstacles = stationary.filter(other => other !== id).map(other => previous[other]);
    const waypoints = [previous[id], ...(via[id] || []).filter(p => obstacles.every(o => distance(p, o) >= clearance)), next[id]];
    routes[id] = waypoints.slice(1).reduce((path, p) => {
      const segment = routeBetween(path.at(-1), p, obstacles, height);
      // A resting defender may close the only exit from a cramped alignment.
      // Cooperative avoidance below lets that defender give space and recover.
      return [...path.slice(0, -1), ...(segment || [path.at(-1), p])];
    }, [waypoints[0]]);
  }
  for (const [defender, attacker] of Object.entries(following)) {
    if (routes[defender]) continue;
    const start = previous[defender].map((value, axis) => value - previous[attacker][axis]);
    const end = next[defender].map((value, axis) => value - next[attacker][axis]);
    const angle = Math.atan2(start[1], start[0]);
    const turn = Math.atan2(Math.sin(Math.atan2(end[1], end[0]) - angle), Math.cos(Math.atan2(end[1], end[0]) - angle));
    const radius = Math.hypot(...start), endRadius = Math.hypot(...end);
    const route = Array.from({ length: 33 }, (_, index) => {
      const t = index / 32, actor = pointOnRoute(routes[attacker], t), length = radius + (endRadius - radius) * t;
      return clampPoint([actor[0] + Math.cos(angle + turn * t) * length, actor[1] + Math.sin(angle + turn * t) * length], height);
    });
    route[0] = previous[defender]; route[32] = next[defender];
    const obstacles = stationary.filter(id => id.startsWith('O')).map(id => previous[id]);
    const safe = [{ p: route[0], t: 0 }];
    route.slice(1).forEach((p, index) => {
      if (obstacles.some(other => distance(p, other) < clearance)) return;
      const before = safe.at(-1), t = (index + 1) / 32;
      const around = routeBetween(before.p, p, obstacles, height) || [before.p, p];
      const length = routeLength(around);
      let traveled = 0;
      around.slice(1).forEach((point, segment) => {
        traveled += distance(around[segment], point);
        safe.push({ p: point, t: before.t + (t - before.t) * (length ? traveled / length : 1) });
      });
    });
    routes[defender] = Object.assign(safe.map(node => node.p), { times: safe.map(node => node.t) });
  }
  return separateRoutes(routes, pointOnRoute, height, (id, from, to) =>
    routeBetween(from, to, stationary.filter(other => other !== id && other.startsWith('O')).map(other => previous[other]), height));
}
export const routeLength = route => route.slice(1).reduce((sum, p, i) => sum + distance(route[i], p), 0);
export const routeSpeed = route => route.times
  ? Math.max(0, ...route.slice(1).map((point, index) => distance(route[index], point) / Math.max(.000001, route.times[index + 1] - route.times[index])))
  : routeLength(route);
export function pointOnRoute(route, progress) {
  if (!route?.length) return [250, 300];
  if (route.timing) progress = Math.max(0, Math.min(1, (progress - route.timing[0]) / (route.timing[1] - route.timing[0])));
  if (route.crossing) {
    const { time, progress: waypointProgress } = route.crossing;
    progress = progress <= time
      ? waypointProgress * progress / Math.max(time, 0.001)
      : waypointProgress + (1 - waypointProgress) * (progress - time) / Math.max(1 - time, 0.001);
  }
  if (route.times) {
    const index = route.times.findIndex((time, i) => i > 0 && time >= progress);
    if (index < 1) return route.at(-1);
    const t = (progress - route.times[index - 1]) / (route.times[index] - route.times[index - 1]);
    return route[index - 1].map((value, axis) => value + (route[index][axis] - value) * t);
  }
  const lengths = route.slice(1).map((p, i) => distance(route[i], p));
  let remaining = lengths.reduce((sum, n) => sum + n, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i];
      return [route[i][0]+(route[i+1][0]-route[i][0])*t,route[i][1]+(route[i+1][1]-route[i][1])*t];
    }
    remaining -= lengths[i];
  }
  return route[route.length - 1];
}

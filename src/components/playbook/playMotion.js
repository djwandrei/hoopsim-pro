import { clampPoint, distance } from '@/components/playbook/playGeometry';
import separateRoutes from '@/components/playbook/playRouteSpacing';
const CLEARANCE = 45;
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
  const clearance = height > 470 ? 58 : CLEARANCE;
  if (segmentClear(from, to, obstacles, clearance)) return [from, to];
  const nodes = [from, to];
  obstacles.forEach(p => {
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const node = clampPoint([p[0]+Math.cos(angle)*(clearance+8),p[1]+Math.sin(angle)*(clearance+8)], height);
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
  return [from, to];
}
export function planRoutes(previous, next, via = {}, height = 470) {
  const routes = {};
  const clearance = height > 470 ? 58 : CLEARANCE;
  const stationary = Object.keys(next).filter(id => distance(previous[id], next[id]) < 1);
  for (const id of Object.keys(next)) {
    const obstacles = stationary.filter(other => other !== id).map(other => previous[other]);
    const waypoints = [previous[id], ...(via[id] || []).filter(p => obstacles.every(o => distance(p, o) >= clearance)), next[id]];
    routes[id] = waypoints.slice(1).reduce((path, p) => [...path.slice(0, -1), ...routeBetween(path[path.length - 1], p, obstacles, height)], [waypoints[0]]);
  }
  return separateRoutes(routes, pointOnRoute, (id, route, waypoint, t) => {
    const obstacles = stationary.filter(other => other !== id).map(other => previous[other]);
    if (obstacles.some(p => distance(p, waypoint) < clearance)) return route;
    const lengths = route.slice(1).map((p, i) => distance(route[i], p));
    const targetDistance = lengths.reduce((sum, n) => sum + n, 0) * t;
    let traveled = 0, segment = 0;
    while (segment < lengths.length - 1 && traveled + lengths[segment] < targetDistance) { traveled += lengths[segment]; segment++; }
    return [...route.slice(0, segment), ...routeBetween(route[segment], waypoint, obstacles, height), ...routeBetween(waypoint, route[segment + 1], obstacles, height).slice(1), ...route.slice(segment + 2)];
  }, height);
}
export const routeLength = route => route.slice(1).reduce((sum, p, i) => sum + distance(route[i], p), 0);
export function pointOnRoute(route, progress) {
  if (!route?.length) return [250, 300];
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
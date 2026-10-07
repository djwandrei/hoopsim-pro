import { clampPoint, distance } from '@/components/playbook/playGeometry';
// Check movement in time, not just landing spots. Detours are local additions
// to the routed path; stationary players are never displaced to fix a crossing.
export default function separateRoutes(initial, sample, detour, height = 470) {
  let routes = initial;
  const ids = Object.keys(routes);
  const clearance = height > 470 ? 58 : 44;
  const inspect = paths => {
    let score = 0, first = null;
    for (let step = 1; step < 40; step++) {
      const t = step / 40;
      const positions = ids.map(id => sample(paths[id], t));
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const gap = distance(positions[i], positions[j]);
        if (gap < clearance) {
          score += clearance - gap;
          if (!first) first = { a: ids[i], b: ids[j], t, pa: positions[i], pb: positions[j] };
        }
      }
    }
    return { score, first };
  };
  let current = inspect(routes);
  for (let iteration = 0; current.first && iteration < 24; iteration++) {
    const clash = current.first;
    let best = routes, bestCheck = current;
    for (const id of [clash.a, clash.b]) {
      if (distance(routes[id][0], routes[id][routes[id].length - 1]) < 1) continue;
      const center = id === clash.a ? clash.pa : clash.pb;
      for (const radius of [64, 96, 136]) for (let angle = 0; angle < 8; angle++) {
        const waypoint = clampPoint([center[0]+Math.cos(angle*Math.PI/4)*radius,center[1]+Math.sin(angle*Math.PI/4)*radius], height);
        const candidate = { ...routes, [id]: detour(id, routes[id], waypoint, clash.t) };
        const check = inspect(candidate);
        if (check.score < bestCheck.score - 0.01) { best = candidate; bestCheck = check; }
      }
    }
    if (best === routes) break;
    routes = best; current = bestCheck;
  }
  return routes;
}
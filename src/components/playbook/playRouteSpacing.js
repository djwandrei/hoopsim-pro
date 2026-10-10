import { distance } from '@/components/playbook/playGeometry';

// A route is piecewise linear in the shared clock. Check its closest approach
// continuously, including brief crossings between animation frames.
function trajectory(route) {
  if (route.times && !route.timing && !route.crossing) return route.map((p, index) => ({ t: route.times[index], p }));
  const lengths = route.slice(1).map((p, i) => distance(route[i], p));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total < .001) return [{ t: 0, p: route[0] }, { t: 1, p: route.at(-1) }];
  const [start, end] = route.timing || [0, 1];
  const result = [{ t: 0, p: route[0] }];
  let traveled = 0;
  if (start > 0) result.push({ t: start, p: route[0] });
  lengths.forEach((length, index) => {
    traveled += length;
    let t = traveled / total;
    if (route.crossing) {
      const crossing = route.crossing;
      t = t <= crossing.progress
        ? t / Math.max(crossing.progress, .000001) * crossing.time
        : crossing.time + (t - crossing.progress) / Math.max(1 - crossing.progress, .000001) * (1 - crossing.time);
    }
    t = start + t * (end - start);
    if (t > result.at(-1).t + .000001) result.push({ t, p: route[index + 1] });
  });
  if (end < 1) result.push({ t: 1, p: route.at(-1) });
  return result;
}
const interpolate = (a, b, t) => a.p.map((value, axis) => value + (b.p[axis] - value) * (t - a.t) / Math.max(b.t - a.t, .000001));
function closestApproach(a, b) {
  let i = 0, j = 0, closest = { gap: Infinity, t: 0, positions: [] };
  while (i < a.length - 1 && j < b.length - 1) {
    const from = Math.max(a[i].t, b[j].t), to = Math.min(a[i + 1].t, b[j + 1].t);
    const a0 = interpolate(a[i], a[i + 1], from), a1 = interpolate(a[i], a[i + 1], to);
    const b0 = interpolate(b[j], b[j + 1], from), b1 = interpolate(b[j], b[j + 1], to);
    const delta = a0.map((value, axis) => value - b0[axis]);
    const velocity = a1.map((value, axis) => value - a0[axis] - b1[axis] + b0[axis]);
    const squared = velocity[0] ** 2 + velocity[1] ** 2;
    const t = squared ? Math.max(0, Math.min(1, -(delta[0] * velocity[0] + delta[1] * velocity[1]) / squared)) : 0;
    const positions = [a0.map((value, axis) => value + (a1[axis] - value) * t), b0.map((value, axis) => value + (b1[axis] - value) * t)];
    const gap = distance(...positions);
    if (gap < closest.gap) closest = { gap, t: from + (to - from) * t, positions };
    const aEnd = a[i + 1].t, bEnd = b[j + 1].t;
    if (aEnd <= bEnd) i++;
    if (bEnd <= aEnd) j++;
  }
  return closest;
}

// Advance all participants on the same clock with bounded movement. Offensive
// screeners hold their spots; defenders yield locally and recover. Carrying
// the preceding positions forward prevents an avoidance path changing sides
// across a player between two animation samples.
export default function separateRoutes(initial, sample, height = 470, navigate) {
  const ids = Object.keys(initial), clearance = height > 470 ? 50.9 : 38.9;
  const tracks = Object.fromEntries(ids.map(id => [id, trajectory(initial[id])]));
  const normals = new Map();
  let contacts = false;
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    const approach = closestApproach(tracks[ids[a]], tracks[ids[b]]);
    contacts ||= approach.gap < clearance;
    const before = Math.max(0, approach.t - .01), after = Math.min(1, approach.t + .01);
    const start = [sample(initial[ids[a]], before), sample(initial[ids[b]], before)];
    const end = [sample(initial[ids[a]], after), sample(initial[ids[b]], after)];
    const delta = approach.positions[0].map((value, axis) => value - approach.positions[1][axis]);
    if (approach.gap < 1) {
      delta[0] = -(end[0][1] - start[0][1] - end[1][1] + start[1][1]);
      delta[1] = end[0][0] - start[0][0] - end[1][0] + start[1][0];
    }
    const length = Math.hypot(...delta) || 1;
    normals.set(a * ids.length + b, delta.map(value => value / length));
  }
  if (!contacts) return initial;
  const targets = ids.map(id => initial[id].at(-1));
  const poses = [ids.map(id => [...initial[id][0]])];
  const moving = ids.map(id => distance(initial[id][0], initial[id].at(-1)) > .001);
  const weights = ids.map((id, index) => id.startsWith('X') ? 2 : moving[index] ? 1 : 0);
  const bound = (point, actor) => {
    const start = initial[ids[actor]][0];
    return [Math.max(Math.min(32, start[0]), Math.min(Math.max(468, start[0]), point[0])),
      Math.max(Math.min(32, start[1]), Math.min(Math.max(height - 32, start[1]), point[1]))];
  };
  const longest = Math.max(...Object.values(initial).map(route => route.slice(1).reduce((sum, point, index) => sum + distance(route[index], point), 0)));
  const stride = Math.max(2, Math.min(height > 470 ? 4.5 : 3.5, longest / 96 * 1.35));
  const recovery = {};
  for (let tick = 1; tick <= 600; tick++) {
    const intended = ids.map(id => sample(initial[id], Math.min(1, tick / 96)));
    const before = poses.at(-1);
    // A player delayed by contact still follows the open path around a
    // resting screener, rather than abandoning it to rush straight home.
    if (tick > 96 && navigate) ids.forEach((id, actor) => {
      if (!weights[actor] || distance(before[actor], targets[actor]) < stride * 2) return;
      if (!recovery[id] || tick % 48 === 0) recovery[id] = navigate(id, before[actor], targets[actor]);
      const route = recovery[id];
      if (!route) return;
      while (route.length > 2 && distance(before[actor], route[1]) < stride) route.shift();
      intended[actor] = route[1];
    });
    const pose = before.map((point, actor) => {
      if (!weights[actor]) return [...point];
      const gap = distance(point, intended[actor]), amount = Math.min(1, stride / (gap || 1));
      return bound(point.map((value, axis) => value + (intended[actor][axis] - value) * amount), actor);
    });
    // Start a small sidestep before a head-on encounter becomes a deadlock.
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const gap = distance(before[a], before[b]);
      if (gap > clearance + stride * 4) continue;
      const delta = before[a].map((value, axis) => value - before[b][axis]);
      const relative = pose[a].map((value, axis) => value - before[a][axis] - pose[b][axis] + before[b][axis]);
      if (delta[0] * relative[0] + delta[1] * relative[1] >= -.01) continue;
      const intent = intended[a].map((value, axis) => value - intended[b][axis] - delta[axis]);
      const squared = intent[0] ** 2 + intent[1] ** 2;
      const near = squared ? Math.max(0, Math.min(1, -(delta[0] * intent[0] + delta[1] * intent[1]) / squared)) : 0;
      if (Math.hypot(delta[0] + intent[0] * near, delta[1] + intent[1] * near) >= clearance) continue;
      const length = Math.hypot(...intent) || 1, normal = [-intent[1] / length, intent[0] / length];
      const side = delta[0] * normal[0] + delta[1] * normal[1];
      const preference = normals.get(a * ids.length + b);
      if (side < -.001 || Math.abs(side) <= .001 && normal[0] * preference[0] + normal[1] * preference[1] < 0) {
        normal[0] *= -1; normal[1] *= -1;
      }
      const weight = weights[a] + weights[b];
      if (!weight) continue;
      const amount = stride * .85 * Math.max(0, 1 - (gap - clearance) / (stride * 4));
      const space = (actor, direction) => {
        const proposed = pose[actor].map((value, axis) => value + normal[axis] * amount * direction);
        return distance(proposed, bound(proposed, actor));
      };
      if (weights[a] && space(a, 1) > .01 || weights[b] && space(b, -1) > .01) {
        normal[0] *= -1; normal[1] *= -1;
      }
      if (weights[a]) pose[a] = bound(pose[a].map((value, axis) => value + normal[axis] * amount * weights[a] / weight), a);
      if (weights[b]) pose[b] = bound(pose[b].map((value, axis) => value - normal[axis] * amount * weights[b] / weight), b);
    }
    for (let iteration = 0; iteration < 40; iteration++) {
      let greatest = 0;
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        const dx = pose[a][0] - pose[b][0], dy = pose[a][1] - pose[b][1], gap = Math.hypot(dx, dy), weight = weights[a] + weights[b];
        if (gap >= clearance || !weight) continue;
        greatest = Math.max(greatest, clearance - gap);
        const normal = gap > .001 ? [dx / gap, dy / gap] : normals.get(a * ids.length + b);
        const amount = clearance - gap + .001;
        if (weights[a]) pose[a] = bound(pose[a].map((value, axis) => value + normal[axis] * amount * weights[a] / weight), a);
        if (weights[b]) pose[b] = bound(pose[b].map((value, axis) => value - normal[axis] * amount * weights[b] / weight), b);
      }
      if (greatest < .001) break;
    }
    poses.push(pose);
    if (tick >= 96 && pose.every((point, actor) => distance(point, targets[actor]) < .05)) break;
    if (tick === 600) throw new Error(`Movement cannot clear its alignment: ${ids.filter((_, actor) => distance(pose[actor], targets[actor]) >= .05).map(id => `${id} (${pose[ids.indexOf(id)].map(Math.round)}) to (${targets[ids.indexOf(id)].map(Math.round)})`).join('; ')}`);
  }
  poses.push(targets);
  const times = poses.map((_, index) => index / (poses.length - 1));
  return Object.fromEntries(ids.map((id, actor) => [id, Object.assign(poses.map(pose => pose[actor]), { times })]));
}

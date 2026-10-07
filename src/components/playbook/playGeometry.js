// Shared geometry: a token has a 19-unit body and a 27-unit active halo.
export const COURT = { width: 500, height: 470, rim: [250, 44] };
export const PLAYER_GAP = 58;
export const ZONES = {
  top: [250, 304], slot: [142, 282], wing: [72, 208], corner: [40, 78],
  elbow: [170, 190], block: [174, 120], dunker: [194, 56], short_corner: [104, 48],
  rim: [250, 48], lane: [250, 120], nail: [250, 190], high_post: [250, 218],
  free_throw: [250, 190], baseline: [110, 40], restricted: [250, 60], half_court: [250, 432],
};
const CENTRAL = new Set(['top', 'rim', 'lane', 'nail', 'high_post', 'free_throw', 'restricted', 'half_court']);
export const ZONE_RE = /\b(short[-\s]+corner|deep[-\s]+corner|dunker(?:[-\s]+spot)?|free[-\s]throw[-\s]+line|high[-\s]+post|mid[-\s]post|low[-\s]post|restricted[-\s]+area|half[-\s]court|nail|slot|wing|corner|elbow|block|rim|basket|paint|lane|middle|center|perimeter|top(?:[-\s]+of[-\s]+the[-\s]+(?:key|arc))?(?!-lock)|baseline|post|arc)(?:s|es)?\b/gi;
export const clonePositions = (pos) => Object.fromEntries(Object.entries(pos).map(([id, pt]) => [id, [...pt]]));
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const clampPoint = ([x, y]) => [Math.max(32, Math.min(468, x)), Math.max(32, Math.min(438, y))];
export const sideAt = ([x]) => x < 250 ? 'left' : 'right';
export function zoneKey(phrase) {
  const p = phrase.toLowerCase().replace(/-/g, ' ');
  if (/short corner/.test(p)) return 'short_corner';
  if (/dunker/.test(p)) return 'dunker';
  if (/free throw/.test(p)) return 'free_throw';
  if (/high post/.test(p)) return 'high_post';
  if (/half court/.test(p)) return 'half_court';
  if (/mid post|low post|block|^posts?$/.test(p)) return 'block';
  if (/restricted/.test(p)) return 'restricted';
  if (/rim|basket/.test(p)) return 'rim';
  if (/paint|lane|middle|center/.test(p)) return 'lane';
  if (/top|arc/.test(p)) return 'top';
  if (/wing|perimeter/.test(p)) return 'wing';
  return p.replace(/s$/, '').replace(/ /g, '_');
}
export function zonePoint(zone, side = 'right') {
  const point = ZONES[zone] || ZONES.wing;
  return CENTRAL.has(zone) || side === 'left' ? [...point] : [500 - point[0], point[1]];
}
export function sideOf(text, fallback) {
  if (/\bleft\b/i.test(text) && !/\bright\b/i.test(text)) return 'left';
  if (/\bright\b/i.test(text) && !/\bleft\b/i.test(text)) return 'right';
  if (/weak|opposite|backside|far side/i.test(text)) return fallback === 'left' ? 'right' : 'left';
  return fallback;
}
// Allocate stable landing spots, rather than pushing every teammate whenever
// a cutter arrives. Stationary teammates retain their last frame's positions.
export function settlePositions(targets, previous, moved = new Set(Object.keys(targets))) {
  const result = {};
  const ids = Object.keys(targets).sort((a, b) => Number(moved.has(a)) - Number(moved.has(b)));
  for (const id of ids) {
    const desired = clampPoint(previous && !moved.has(id) ? previous[id] : targets[id]);
    const candidates = [desired];
    for (let radius = PLAYER_GAP; radius <= 290; radius += 14) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
        const p = [desired[0] + Math.cos(angle) * radius, desired[1] + Math.sin(angle) * radius];
        if (p[0] >= 32 && p[0] <= 468 && p[1] >= 32 && p[1] <= 438) candidates.push(p);
      }
    }
    const score = (p) => distance(p, desired) + (Math.abs(desired[0] - 250) > 75 && sideAt(p) !== sideAt(desired) ? 180 : 0);
    candidates.sort((a, b) => score(a) - score(b));
    result[id] = candidates.find(p => Object.values(result).every(other => distance(p, other) >= PLAYER_GAP - 0.01)) || desired;
  }
  return result;
}
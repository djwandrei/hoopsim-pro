import { ZONES, distance } from '@/components/playbook/playGeometry';

const LABELS = {
  top: 'the top of the key', slot: 'the slot', wing: 'the wing', corner: 'the corner',
  elbow: 'the elbow', block: 'the block', dunker: 'the dunker spot', short_corner: 'the short corner',
  rim: 'the rim', lane: 'the middle of the lane', nail: 'the nail', high_post: 'the high post',
  free_throw: 'the free-throw line', restricted: 'the restricted area', baseline: 'the baseline',
  half_court: 'mid court',
};
const LATERAL = new Set(['slot', 'wing', 'corner', 'elbow', 'block', 'short_corner', 'dunker']);

// Nearest known court zone for a point, with left/right side where it matters.
export function zoneNameOf(point) {
  let best = null;
  let bestDist = Infinity;
  for (const [key, spot] of Object.entries(ZONES)) {
    const d = distance(point, spot);
    if (d < bestDist) { bestDist = d; best = key; }
  }
  const base = LABELS[best] || best.replace(/_/g, ' ');
  return LATERAL.has(best) ? `${point[0] < 250 ? 'left' : 'right'} ${base}` : base;
}

// Plain-language record of what a frame actually moved, for the narration panel.
export function describeFrame(previous, next, passes = [], screens = []) {
  const lines = [];
  for (const id of Object.keys(next).sort()) {
    const from = previous[id];
    const to = next[id];
    if (!from || distance(from, to) <= 6) continue;
    lines.push(`${id} moves from ${zoneNameOf(from)} to ${zoneNameOf(to)}.`);
  }
  for (const screen of screens) lines.push(`${screen.screener} sets a screen for ${screen.target}.`);
  for (const pass of passes) lines.push(`${pass.handoff ? 'Handoff' : 'Pass'}: ${pass.from} → ${pass.to}.`);
  return lines;
}
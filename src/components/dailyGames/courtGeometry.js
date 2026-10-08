import { roleOf } from '@/components/dailyGames/lineupRoles';

// One projection for floor markings, raised hoop geometry, and HTML portraits.
// Portraits stay outside transformed/flattened layers, so they cannot be clipped
// or tilted by the court's perspective.
export function projectCourt(x, depth, height = 0) {
  const t = depth / 47;
  const scale = 1 / (1.48 - 0.48 * t);
  return { x: 500 + (x - 25) * 18 * scale, y: 195 + 340 * t * scale - height * 15 * scale };
}

export const courtPoints = points => points.map(([x, depth, height]) => {
  const p = projectCourt(x, depth, height);
  return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
}).join(' ');

export const courtRect = (left, back, right, front, height = 0) =>
  courtPoints([[left, back, height], [right, back, height], [right, front, height], [left, front, height]]);

export function courtArc(x, depth, radius, from = 0, to = Math.PI * 2, height = 0) {
  return Array.from({ length: 65 }, (_, i) => {
    const angle = from + (to - from) * i / 64;
    const p = projectCourt(x + radius * Math.cos(angle), depth + radius * Math.sin(angle), height);
    return `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');
}

// Five separated floor locations: no second center can stack near the rim.
const COURT_SLOTS = [
  { x: 16, depth: 12 }, { x: 36, depth: 21 }, { x: 6, depth: 31 },
  { x: 44, depth: 32 }, { x: 25, depth: 42 },
];
const PREFERENCES = { C: [0, 1, 2, 3, 4], F: [1, 2, 0, 3, 4], G: [4, 3, 2, 1, 0] };
export function allocateCourtSlots(lineup) {
  const assigned = [];
  const used = new Set();
  lineup.map((player, index) => ({ index, role: roleOf(player) }))
    .sort((a, b) => ['C', 'F', 'G'].indexOf(a.role) - ['C', 'F', 'G'].indexOf(b.role) || a.index - b.index)
    .forEach(({ index, role }) => {
      const slot = PREFERENCES[role].find(candidate => !used.has(candidate));
      used.add(slot);
      assigned[index] = COURT_SLOTS[slot];
    });
  return assigned;
}
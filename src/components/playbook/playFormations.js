import { clonePositions, ZONE_RE, zoneKey, zonePoint, sideOf, sideAt, settlePositions } from '@/components/playbook/playGeometry';
import { offenseTokens } from '@/components/playbook/playClauses';
const SPREAD = { O1: [250, 314], O2: [422, 216], O3: [78, 216], O4: [452, 64], O5: [174, 124] };
function formationFor(play) {
  const name = `${play.name} ${play.alignment}`.toLowerCase();
  if (/horns|double high/.test(name)) return { O1: [250, 314], O2: [454, 64], O3: [46, 64], O4: [330, 190], O5: [170, 190] };
  if (/floppy|single-double/.test(name)) return { O1: [250, 314], O2: [250, 64], O3: [104, 114], O4: [350, 114], O5: [410, 114] };
  if (/box|rectangle/.test(name)) return { O1: [250, 314], O2: [330, 190], O3: [170, 190], O4: [330, 114], O5: [170, 114] };
  if (/diamond/.test(name)) return { O1: [250, 314], O2: [250, 216], O3: [156, 120], O4: [344, 120], O5: [250, 48] };
  if (/1-4 high|four across/.test(name)) return { O1: [250, 314], O2: [432, 190], O3: [68, 190], O4: [330, 190], O5: [170, 190] };
  if (/1-4 low|double low/.test(name)) return { O1: [250, 314], O2: [456, 64], O3: [44, 64], O4: [330, 114], O5: [170, 114] };
  if (/vertical stack|double stack/.test(name)) return { O1: [380, 314], O2: [250, 90], O3: [250, 150], O4: [250, 210], O5: [250, 270] };
  if (/horizontal stack|^line /.test(name)) return { O1: [250, 314], O2: [148, 150], O3: [216, 150], O4: [284, 150], O5: [352, 150] };
  if (/flex/.test(name)) return { O1: [170, 294], O2: [400, 216], O3: [46, 64], O4: [360, 290], O5: [174, 120] };
  if (/triangle/.test(name)) return { O1: [350, 294], O2: [426, 210], O3: [72, 216], O4: [142, 294], O5: [328, 120] };
  if (/zoom|chicago|handoff hub/.test(name)) return { O1: [142, 304], O2: [454, 64], O3: [46, 64], O4: [382, 150], O5: [290, 270] };
  if (/pistol|21|side handler/.test(name)) return { O1: [420, 276], O2: [454, 100], O3: [46, 64], O4: [104, 260], O5: [310, 370] };
  if (/double drag|transition|early.offense|fast break|open floor/.test(name)) return { O1: [250, 370], O2: [432, 260], O3: [68, 260], O4: [170, 430], O5: [330, 430] };
  if (/empty/.test(name)) return { O1: [422, 232], O2: [142, 290], O3: [46, 64], O4: [72, 210], O5: [316, 292] };
  if (/5-out|five.*outside|delay|princeton/.test(name)) return { O1: [250, 314], O2: [428, 212], O3: [72, 212], O4: [454, 64], O5: [46, 64] };
  if (/3-out|high-low/.test(name)) return { ...clonePositions(SPREAD), O4: [330, 190], O5: [174, 114] };
  return clonePositions(SPREAD);
}
// Read grouped assignments once: O4/O5 at elbows is a mirrored pair, not a
// dangling O4 followed by an O5-only location. Narrative formations use templates.
export function initialPositions(play) {
  const pos = formationFor(play);
  const assigned = new Set();
  for (const segment of (play.alignment || '').split(/[;,]/)) {
    const group = /\bO[1-5]\b(?:\s*(?:[/,&]|\band\b)\s*O[1-5])*/i.exec(segment);
    if (!group) continue;
    const players = offenseTokens(group[0]);
    const tail = segment.slice(group.index + group[0].length).split(/\bO[1-5]\b/i)[0];
    const zones = [...tail.matchAll(ZONE_RE)];
    const zone = zones[0];
    if (!zone) continue;
    const key = zoneKey(zone[0]);
    players.forEach((id, index) => {
      const side = players.length > 1 ? (index % 2 ? 'right' : 'left') : sideOf(tail, sideAt(pos[id]));
      pos[id] = zonePoint(key, side);
      assigned.add(id);
    });
  }
  // Explicit spots take precedence; unassigned template occupants are placed last.
  const ordered = Object.fromEntries([...assigned, ...Object.keys(pos).filter(id => !assigned.has(id))].map(id => [id, pos[id]]));
  return settlePositions(ordered);
}
export function initialBallOwner(play) {
  const text = play.alignment || '';
  const match = /\b(O[1-5])\b[^;,]{0,26}\b(?:ball handler|ball-handler|ball holder|handoff hub|with the ball)\b/i.exec(text);
  return match ? match[1].toUpperCase() : /zoom|chicago/i.test(play.name) ? 'O5' : 'O1';
}
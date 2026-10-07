import { clonePositions } from '@/components/playbook/playGeometry';
import { passBall, guard } from '@/components/playbook/defenseGeometry';
const ZONES = {
  '2-3 Zone': { X1: [178, 264], X2: [322, 264], X3: [110, 140], X4: [390, 140], X5: [250, 96] },
  '3-2 Zone': { X1: [250, 274], X2: [116, 232], X3: [384, 232], X4: [170, 118], X5: [330, 118] },
  '1-3-1 Zone': { X1: [250, 274], X2: [106, 198], X3: [394, 198], X4: [250, 88], X5: [250, 178] },
  'Box-and-One': { X1: [382, 222], X2: [172, 232], X3: [328, 232], X4: [172, 120], X5: [328, 120] },
};
export function zoneSetup(scene, name) {
  scene.defense = clonePositions(ZONES[name]);
  scene.matchups = Object.fromEntries(Object.keys(scene.defense).map(id => [id, null]));
  if (name === 'Box-and-One') { scene.matchups.X1 = 'O2'; guard(scene, 'X1', 'O2'); }
}
function shift(scene, name, side) {
  const base = ZONES[name];
  Object.entries(base).forEach(([id, p]) => {
    if (name === 'Box-and-One' && id === 'X1') { guard(scene, id, 'O2'); return; }
    scene.defense[id] = [p[0] + side * (id === 'X5' ? 18 : 34), p[1]];
  });
}
export function zoneStep(scene, name, step) {
  scene.cue = 'Example: top → wing → interior/corner; defenders react to the ball';
  if (name === 'Box-and-One') {
    if (step === 2) { passBall(scene, 'O3'); shift(scene, name, -1); }
    if (step === 3) { scene.offense.O2 = [330, 296]; guard(scene, 'X1', 'O2'); scene.via.X1 = [[398, 296]]; }
    if (step === 4) { passBall(scene, 'O2'); guard(scene, 'X1', 'O2'); scene.defense.X3 = [278, 274]; }
    return;
  }
  if (step < 3) return;
  if (step === 3) { passBall(scene, 'O2'); shift(scene, name, 1); }
  if (step === 4 && name === '2-3 Zone') {
    scene.offense.O5 = [250, 204]; passBall(scene, 'O5'); scene.defense.X5 = [250, 148]; scene.defense.X3 = [188, 92];
  }
  if (step === 4 && name === '3-2 Zone') { passBall(scene, 'O4'); scene.defense.X5 = [397, 74]; scene.defense.X4 = [252, 100]; }
  if (step === 4 && name === '1-3-1 Zone') { passBall(scene, 'O4'); scene.defense.X4 = [397, 74]; scene.defense.X5 = [270, 126]; }
  if (step === 3 && name === '1-3-1 Zone') { scene.defense.X1 = [392, 270]; scene.defense.X3 = [381, 204]; }
  if (step === 5) {
    if (name === '2-3 Zone') scene.defense.X3 = [235, 78];
    if (name === '3-2 Zone') scene.defense.X4 = [250, 94];
  }
}
import { clonePositions } from '@/components/playbook/playGeometry';
import { passBall, guard, exchangeMatchups } from '@/components/playbook/defenseGeometry';
const BACKCOURT = { O1: [250, 814], O2: [80, 596], O3: [426, 448], O4: [104, 212], O5: [250, 904] };
export function pressSetup(scene, name) {
  if (name === 'Half-Court Trap') {
    scene.offense.O1 = [370, 420]; scene.defense.X1 = [350, 348]; return;
  }
  scene.offense = clonePositions(BACKCOURT);
  scene.defense = name === '2-2-1 Press'
    ? { X1: [170, 732], X2: [330, 732], X3: [134, 512], X4: [366, 512], X5: [250, 174] }
    : { X1: [250, 736], X2: [114, 654], X3: [386, 654], X4: [250, 442], X5: [250, 174] };
  if (name === 'Run-and-Jump') [1, 2, 3, 4, 5].forEach(i => guard(scene, `X${i}`));
  else scene.matchups = Object.fromEntries(Object.keys(scene.defense).map(id => [id, null]));
}
export function pressStep(scene, name, step) {
  scene.cue = 'Full-court press: front pressure, sideline trigger, interceptor and deep safety';
  if (name === 'Half-Court Trap') {
    scene.cue = 'Example: sideline trap → pass out → defensive recovery';
    if (step === 0) { scene.offense.O1 = [394, 362]; guard(scene, 'X1'); }
    if (step === 1) { scene.offense.O1 = [432, 252]; scene.defense.X1 = [380, 240]; }
    if (step === 2) scene.defense.X2 = [436, 308];
    if (step === 3) { scene.defense.X3 = [180, 206]; scene.defense.X4 = [330, 126]; scene.defense.X5 = [250, 74]; }
    if (step === 4) { passBall(scene, 'O3'); guard(scene, 'X3'); scene.defense.X2 = [330, 218]; }
    return;
  }
  if (name === 'Run-and-Jump') {
    if (step === 0) { scene.offense.O1 = [300, 688]; guard(scene, 'X1'); }
    if (step === 1) { scene.offense.O1 = [380, 602]; scene.matchups.X2 = 'O1'; guard(scene, 'X2'); }
    if (step === 2) { scene.matchups.X1 = 'O2'; guard(scene, 'X1'); }
    if (step === 3) { scene.defense.X3 = [322, 450]; scene.defense.X5 = [250, 204]; }
    if (step === 4) { passBall(scene, 'O3'); exchangeMatchups(scene, 'X2', 'X3'); guard(scene, 'X2'); guard(scene, 'X3'); }
    return;
  }
  if (name === '2-2-1 Press') {
    if (step === 0) { scene.offense.O1 = [420, 748]; scene.defense.X2 = [365, 744]; }
    if (step === 3) { scene.offense.O1 = [430, 622]; scene.defense.X2 = [377, 596]; scene.defense.X4 = [430, 682]; }
    if (step === 4) { scene.defense.X1 = [244, 616]; scene.defense.X3 = [284, 450]; }
  } else {
    if (step === 0) scene.defense.X1 = [250, 750];
    if (step === 4) { scene.offense.O1 = [428, 636]; scene.defense.X1 = [374, 614]; scene.defense.X3 = [440, 696]; }
    if (step === 5) { passBall(scene, 'O2'); scene.defense.X4 = [144, 532]; }
    if (step === 6) scene.defense.X5 = [250, 168];
  }
}
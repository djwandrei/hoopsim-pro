import { guard, shell, passBall } from '@/components/playbook/defenseGeometry';
export function manStep(scene, name, step) {
  scene.cue = 'Example: wing pass, penetration, then recovery';
  if (name === 'Man-to-Man') {
    if (step === 0) guard(scene, 'X1');
    if (step === 1) shell(scene, 0.12);
    if (step === 2) { passBall(scene, 'O2'); shell(scene, 0.2); }
    if (step === 3) { scene.offense.O3 = [188, 94]; scene.defense.X3 = [146, 142]; scene.via.X3 = [[112, 198]]; }
    if (step === 4) { scene.offense.O2 = [324, 172]; scene.offense.O5 = [160, 68]; scene.defense.X5 = [272, 144]; guard(scene, 'X2'); }
  } else if (name === 'Gap Man') {
    if (step === 0) guard(scene, 'X1');
    if (step === 1) shell(scene, 0.32);
    if (step === 2) { scene.defense.X4 = [302, 140]; scene.defense.X5 = [248, 76]; }
    if (step === 3) { scene.offense.O1 = [298, 214]; scene.defense.X2 = [350, 178]; scene.defense.X1 = [318, 268]; }
    if (step === 4) { passBall(scene, 'O3'); shell(scene, 0.16); }
  } else {
    if (step === 0) guard(scene, 'X1');
    if (step === 1) shell(scene, 0.43);
    if (step === 2) { scene.offense.O1 = [300, 214]; scene.defense.X1 = [344, 258]; scene.defense.X2 = [346, 162]; scene.defense.X5 = [234, 152]; }
    if (step === 3) { passBall(scene, 'O2'); shell(scene, 0.34); guard(scene, 'X2'); }
    if (step === 4) { passBall(scene, 'O3'); shell(scene, 0.38); guard(scene, 'X3'); }
  }
}
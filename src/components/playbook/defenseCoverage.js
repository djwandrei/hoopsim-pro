import { guard, shell, exchangeMatchups, passBall } from '@/components/playbook/defenseGeometry';
export function coverageSetup(scene, name) {
  scene.offense.O1 = /Ice/.test(name) ? [424, 258] : [306, 326];
  scene.offense.O5 = /Ice/.test(name) ? [336, 270] : [230, 290];
  shell(scene);
  if (/Drop/.test(name)) scene.defense.X5 = [250, name === 'Deep Drop' ? 96 : 168];
  if (name === 'Scram Switch') { exchangeMatchups(scene, 'X1', 'X5'); scene.offense.O5 = [302, 126]; shell(scene); }
}
function useScreen(scene) {
  scene.offense.O1 = [300, 214]; scene.offense.O5 = [210, 94];
  scene.via.O1 = [[300, 280], [285, 246]];
}
export function coverageStep(scene, name, step) {
  scene.cue = 'Illustrated response to a ball screen; X labels keep their identity when assignments change';
  if (/Drop|At-Level/.test(name)) {
    if (step === 0) { scene.defense.X1 = [366, 314]; scene.via.X1 = [[324, 368]]; }
    if (step === 1) { useScreen(scene); scene.defense.X5 = [250, name === 'Deep Drop' ? 102 : name === 'At-Level' ? 258 : 154]; }
    if (step === 2) { scene.defense.X1 = [358, 238]; if (name === 'At-Level') scene.defense.X5 = [280, 154]; }
    if (step === 3) { guard(scene, 'X1'); scene.defense.X5 = name === 'Deep Drop' ? [250, 102] : [260, 140]; }
    if (step === 4 && name !== 'Deep Drop') scene.defense.X4 = [265, 86];
    if (step === 5) guard(scene, 'X5');
    return;
  }
  if (/Ice/.test(name)) {
    if (step === 0) scene.defense.X1 = [374, 268];
    if (step === 1) { scene.offense.O1 = [438, 174]; scene.defense.X1 = [414, 230]; }
    if (step === 2) scene.defense.X5 = [383, 146];
    if (step === 4) scene.defense.X4 = [312, 90];
    return;
  }
  if (name === 'Under') {
    if (step === 0) scene.defense.X1 = [300, 260];
    if (step === 1) { useScreen(scene); scene.defense.X1 = [300, 156]; scene.via.X1 = [[166, 230], [220, 210]]; }
    if (step === 2) scene.defense.X5 = [238, 154];
    if (step === 3) guard(scene, 'X1');
    return;
  }
  if (/Hedge/.test(name)) {
    if (step === 0) { scene.offense.O1 = [310, 272]; scene.defense.X1 = [366, 296]; }
    if (step === 1) { scene.defense.X5 = [310, 334]; scene.via.X5 = [[380, 304]]; }
    if (step === 2) { scene.offense.O1 = [394, 368]; scene.offense.O5 = [212, 100]; scene.defense.X5 = [344, 328]; }
    if (step === 3) guard(scene, 'X1');
    if (step === 4) guard(scene, 'X5');
    if (step === 5) scene.defense.X4 = [268, 106];
    return;
  }
  if (/Blitz/.test(name)) {
    if (step === 0) scene.offense.O1 = [330, 286];
    if (step === 1) { scene.defense.X5 = [384, 276]; scene.offense.O5 = [208, 152]; }
    if (step === 2) { scene.defense.X1 = [276, 276]; scene.defense.X5 = [384, 276]; }
    if (step === 3) { scene.defense.X3 = [160, 184]; scene.defense.X4 = [310, 112]; }
    if (step === 4) { passBall(scene, 'O5'); scene.defense.X3 = [168, 100]; }
    if (step === 5) { guard(scene, 'X5'); guard(scene, 'X1'); }
    return;
  }
  if (name === 'Pre-Switch') {
    if (step === 1) { exchangeMatchups(scene, 'X5', 'X4'); shell(scene); }
    if (step === 2) guard(scene, 'X4');
    if (step === 4) { useScreen(scene); exchangeMatchups(scene, 'X1', 'X4'); shell(scene); scene.cue = 'Example: pre-switch X4 onto the screener, then switch the ball screen'; }
    return;
  }
  if (name === 'Scram Switch') {
    if (step === 1) { scene.matchups.X4 = 'O5'; scene.matchups.X1 = 'O4'; guard(scene, 'X4'); guard(scene, 'X1'); }
    if (step === 2) guard(scene, 'X1');
    if (step === 4) shell(scene);
    return;
  }
  if (name === 'Peel Switch') {
    if (step === 0) { scene.offense.O1 = [318, 174]; scene.defense.X1 = [372, 226]; }
    if (step === 1) { scene.matchups.X2 = 'O1'; guard(scene, 'X2'); }
    if (step === 2) { scene.defense.X1 = [412, 292]; scene.via.X1 = [[420, 236]]; }
    if (step === 3) { scene.matchups.X1 = 'O2'; guard(scene, 'X1'); }
    if (step === 5) { guard(scene, 'X3'); guard(scene, 'X4'); }
    return;
  }
  if (/Triple Switch/.test(name)) {
    if (step === 0) { useScreen(scene); guard(scene, 'X1'); guard(scene, 'X5'); }
    if (step === 1) scene.offense.O2 = [265, 100];
    if (step === 2) { scene.matchups.X2 = 'O5'; guard(scene, 'X2'); }
    if (step === 3) { scene.offense.O2 = [360, 316]; scene.matchups.X5 = 'O2'; guard(scene, 'X5'); }
    if (step === 4) guard(scene, 'X1');
    scene.cue = 'Contain then exchange: X1→O1, X2→roller O5, X5→popper O2';
    return;
  }
  // Switch, Switch-Back and Switch Everything each have different timing.
  const initialSwitch = name === 'Switch-Back' ? 0 : 1;
  if (step === initialSwitch) { useScreen(scene); exchangeMatchups(scene, 'X1', 'X5'); guard(scene, 'X5'); }
  if (step === (name === 'Switch-Back' ? 1 : 2)) guard(scene, 'X1');
  if (name === 'Switch-Back') {
    if (step === 3) { scene.matchups.X1 = 'O1'; guard(scene, 'X1'); }
    if (step === 4) { scene.matchups.X5 = 'O5'; guard(scene, 'X5'); }
  } else if (step === 3) shell(scene);
  if (name === 'Switch Everything' && step === 4) { exchangeMatchups(scene, 'X1', 'X5'); scene.offense.O1 = [346, 258]; shell(scene); }
}
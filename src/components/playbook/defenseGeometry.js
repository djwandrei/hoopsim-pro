import { COURT, clampPoint, clonePositions, distance } from '@/components/playbook/playGeometry';
export const HALF_OFFENSE = { O1: [250, 342], O2: [434, 232], O3: [66, 232], O4: [450, 64], O5: [322, 116] };
export const ZONE_OFFENSE = { ...HALF_OFFENSE, O5: [50, 64] };
export const isDefensivePlay = play => /defensive scheme|ball-screen defense|defensive rotation/i.test(play.type || '') || /defensive|defensive coverages|trapping schemes/i.test(play.category || '') || /^(?:1-2-1-1 Diamond Press|2-2-1 Press|Run-and-Jump|Half-Court Trap)$/.test(play.name);
export const identityMatchups = () => Object.fromEntries([1, 2, 3, 4, 5].map(i => [`X${i}`, `O${i}`]));
export function guard(scene, defender, player = scene.matchups[defender], offset = 54) {
  const p = scene.offense[player];
  const d = Math.max(1, distance(p, COURT.rim));
  scene.defense[defender] = clampPoint([p[0] + (250-p[0])*offset/d, p[1] + (44-p[1])*offset/d], scene.courtHeight);
}
export function shell(scene, shrink = 0) {
  Object.keys(scene.defense).forEach(id => {
    guard(scene, id);
    if (scene.matchups[id] !== scene.ballOwner && shrink) {
      const p = scene.defense[id];
      scene.defense[id] = [p[0] + (250-p[0])*shrink, p[1] + (175-p[1])*shrink];
    }
  });
}
export function passBall(scene, receiver) {
  if (scene.ballOwner !== receiver) scene.exchanges.push({ from: scene.ballOwner, to: receiver, handoff: false });
  scene.ballOwner = receiver;
}
export function exchangeMatchups(scene, a, b) {
  [scene.matchups[a], scene.matchups[b]] = [scene.matchups[b], scene.matchups[a]];
}
export function createDefenseScene(play) {
  const full = /Diamond Press|2-2-1 Press|Run-and-Jump/.test(play.name);
  const zone = /Zone|Box-and-One/.test(play.name);
  const scene = { offense: clonePositions(zone ? ZONE_OFFENSE : HALF_OFFENSE), defense: {}, matchups: identityMatchups(), ballOwner: 'O1', exchanges: [], via: {}, cue: 'Illustrative five-on-five sequence', courtHeight: full ? 940 : 470 };
  [1, 2, 3, 4, 5].forEach(i => { scene.defense[`X${i}`] = [250, 180]; guard(scene, `X${i}`, `O${i}`, 78); });
  return scene;
}
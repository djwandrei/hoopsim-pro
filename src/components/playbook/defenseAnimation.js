import { clonePositions, settlePositions, distance } from '@/components/playbook/playGeometry';
import { planRoutes, routeLength } from '@/components/playbook/playMotion';
import { createDefenseScene } from '@/components/playbook/defenseGeometry';
import { zoneSetup, zoneStep } from '@/components/playbook/defenseZone';
import { manStep } from '@/components/playbook/defenseMan';
import { coverageSetup, coverageStep } from '@/components/playbook/defenseCoverage';
import { pressSetup, pressStep } from '@/components/playbook/defensePress';
export function buildDefenseFrames(play) {
  const scene = createDefenseScene(play);
  const zone = /Zone|Box-and-One/.test(play.name);
  const press = /Press|Run-and-Jump|Half-Court Trap/.test(play.name);
  const man = /^(Man-to-Man|Gap Man|Pack Line)$/.test(play.name);
  if (zone) zoneSetup(scene, play.name);
  else if (press) pressSetup(scene, play.name);
  else if (!man) coverageSetup(scene, play.name);
  const snapshot = (text, previous) => {
    const desired = { ...scene.offense, ...scene.defense };
    const moved = new Set(Object.keys(desired).filter(id => !previous || distance(previous[id], desired[id]) > 0.5));
    const positions = settlePositions(desired, previous, moved, scene.courtHeight > 470 ? 64 : 52, scene.courtHeight);
    scene.offense = Object.fromEntries(Object.entries(positions).filter(([id]) => id.startsWith('O')));
    scene.defense = Object.fromEntries(Object.entries(positions).filter(([id]) => id.startsWith('X')));
    const routes = previous ? planRoutes(previous, positions, scene.via, scene.courtHeight) : {};
    const travel = Math.max(0, ...Object.values(routes).map(routeLength));
    return { text, offense: clonePositions(scene.offense), defense: clonePositions(scene.defense), matchups: { ...scene.matchups },
      ballOwner: scene.ballOwner, exchanges: [...scene.exchanges], passes: scene.exchanges.map(p => [p.from, p.to]), passFirst: scene.exchanges.length > 0,
      screens: !zone && !press && !/Scram|Peel/.test(play.name) ? [{ screener: 'O5', target: 'O1', point: scene.offense.O5 }] : [],
      involved: [...moved], routes, courtHeight: scene.courtHeight, cue: scene.cue,
      duration: Math.max(1800, Math.min(4400, 800 + travel * 7 + scene.exchanges.length * 450)) };
  };
  const setup = snapshot(`Setup — ${play.name}: ${play.alignment}`, null);
  const frames = play.steps.map((text, index) => {
    const previous = clonePositions({ ...scene.offense, ...scene.defense });
    scene.exchanges = []; scene.via = {};
    if (zone) zoneStep(scene, play.name, index);
    else if (press) pressStep(scene, play.name, index);
    else if (man) manStep(scene, play.name, index);
    else coverageStep(scene, play.name, index);
    return snapshot(text, previous);
  });
  return { setup, frames };
}
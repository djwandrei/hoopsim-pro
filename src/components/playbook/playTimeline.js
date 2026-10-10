import { COURT, clonePositions, distance, zonePoint, sideAt, clampPoint } from '@/components/playbook/playGeometry';
import { planRoutes, routeLength, routeSpeed } from '@/components/playbook/playMotion';
import { describeFrame, describeCommand, describeStep, positionText } from '@/components/playbook/playNarration';

const ZONES = {
  '2-3': { X1: [175, 265], X2: [325, 265], X3: [110, 135], X4: [390, 135], X5: [250, 90] },
  '3-2': { X1: [250, 275], X2: [115, 235], X3: [385, 235], X4: [170, 120], X5: [330, 120] },
  '1-3-1': { X1: [250, 275], X2: [110, 200], X3: [390, 200], X4: [250, 85], X5: [250, 180] },
  'box-one': { X1: [390, 235], X2: [170, 235], X3: [330, 235], X4: [170, 120], X5: [330, 120] },
};
const all = scene => ({ ...scene.offense, ...scene.defense });
const copyScreens = screens => screens.map(screen => ({ ...screen, point: [...screen.point] }));
function guardPoint(scene, id, shrink = 0) {
  const pos = scene.offense[scene.matchups[id]];
  if (!pos) return scene.defense[id] || [250, 180];
  if (scene.matchups[id] === scene.inbounder && (pos[0] > 500 || pos[1] < 0)) {
    if (scene.ballOwner !== scene.inbounder) return pos[1] < 0 ? [300, 150] : [350, 190];
    return pos[1] < 0 ? [pos[0], 35] : [465, pos[1]];
  }
  const length = Math.max(1, distance(pos, COURT.rim)), offset = scene.courtHeight > 470 ? 66 : 50;
  const point = [pos[0] + (250 - pos[0]) * offset / length, pos[1] + (44 - pos[1]) * offset / length];
  return clampPoint([point[0] + (250 - point[0]) * shrink, point[1] + (175 - point[1]) * shrink], scene.courtHeight);
}
function point(value, scene, id) {
  if (Array.isArray(value)) return [...value];
  if (['guard', 'gap', 'pack'].includes(value)) return guardPoint(scene, id, value === 'gap' ? 0.25 : value === 'pack' ? 0.42 : 0);
  const lateral = /^(left|right)-(.+)$/.exec(value);
  return zonePoint(lateral ? lateral[2] : value, lateral ? lateral[1] : 'right');
}

// Offensive destinations have priority. Clearance corrections stay local;
// a defender cannot push a cutter to a different side of the floor.
function land(scene, moving) {
  const desired = all(scene), placed = {}, gap = scene.courtHeight > 470 ? 51 : 39;
  const ids = Object.keys(desired).sort((a, b) => Number(a.startsWith('X')) - Number(b.startsWith('X')) || Number(moving.has(a)) - Number(moving.has(b)));
  for (const id of ids) {
    const target = desired[id], inbound = id === scene.inbounder && (target[0] > 500 || target[1] < 0);
    const origin = inbound ? target : clampPoint(target, scene.courtHeight);
    const clear = candidate => Object.values(placed).every(other => distance(candidate, other) >= gap - 0.001);
    let found = clear(origin) ? origin : null;
    for (let radius = 4; !found && radius <= 100; radius += 4) {
      const candidates = Array.from({ length: 24 }, (_, index) => clampPoint([origin[0] + Math.cos(index * Math.PI / 12) * radius, origin[1] + Math.sin(index * Math.PI / 12) * radius], scene.courtHeight));
      candidates.sort((a, b) => distance(a, origin) - distance(b, origin));
      found = candidates.find(candidate => (Math.abs(origin[0] - 250) < 65 || sideAt(candidate) === sideAt(origin)) && clear(candidate));
    }
    if (!found) throw new Error(`No legal landing spot for ${id}`);
    placed[id] = found;
  }
  scene.offense = Object.fromEntries(Object.entries(placed).filter(([id]) => id.startsWith('O')));
  scene.defense = Object.fromEntries(Object.entries(placed).filter(([id]) => id.startsWith('X')));
  scene.screens = scene.screens.map(screen => ({ ...screen, point: [...scene.offense[screen.screener]] }));
  return placed;
}
function snapshot(scene) {
  return { offense: clonePositions(scene.offense), defense: clonePositions(scene.defense), matchups: { ...scene.matchups }, ballOwner: scene.ballOwner, lastOwner: scene.lastOwner, ball: scene.ball ? [...scene.ball] : null, screens: copyScreens(scene.screens) };
}
function followDefense(scene, focus = scene.ballOwner || scene.lastOwner) {
  if (!scene.autoGuard) return;
  if (scene.zone) {
    const base = ZONES[scene.zone], owner = scene.offense[scene.ballOwner || scene.lastOwner];
    const shift = owner ? Math.max(-1, Math.min(1, (owner[0] - 250) / 170)) : 0;
    for (const [id, pos] of Object.entries(base)) scene.defense[id] = id === 'X1' && scene.zone === 'box-one' ? guardPoint(scene, id) : [pos[0] + shift * 28, pos[1]];
  } else {
    const focusPlayers = new Set(Array.isArray(focus) ? focus : [focus]);
    for (const [id, guarded] of Object.entries(scene.matchups)) {
      if (focusPlayers.has(guarded) && !scene.screens.some(screen => screen.target === id && !screen.used)) {
        const before = scene.phaseStart, start = before?.offense[guarded], finish = scene.offense[guarded];
        if (start && distance(start, finish) < .01 && before.ballOwner === scene.ballOwner) continue;
        const defender = before?.defense[id];
        // A defender beaten on the high side by a backcut recovers behind
        // the cutter. Do not send that defender through the rim to re-form
        // an artificial goal-side alignment on the other side of the player.
        const closingOut = start && distance(start, finish) < .01 && before.ballOwner !== scene.ballOwner;
        if (start && defender && (closingOut || finish[1] < start[1] - 30 && defender[1] > start[1] + 20)) {
          const origin = closingOut ? finish : start;
          const offset = defender.map((value, axis) => value - origin[axis]), length = Math.hypot(...offset) || 1;
          scene.defense[id] = clampPoint(finish.map((value, axis) => value + offset[axis] * (scene.courtHeight > 470 ? 66 : 50) / length), scene.courtHeight);
        } else scene.defense[id] = guardPoint(scene, id);
        scene.following[id] = guarded;
      }
    }
  }
}
function createScene(definition) {
  const scene = { offense: {}, defense: {}, matchups: {}, screens: [], checkpoints: {}, ballOwner: definition.owner, lastOwner: definition.owner, ball: null,
    courtHeight: definition.courtHeight || 470, zone: definition.zone, autoGuard: definition.autoGuard !== false, inbounder: definition.inbounder, inboundSide: definition.inboundSide };
  for (const [id, value] of Object.entries(definition.setup)) scene.offense[id] = point(value, scene, id);
  if (Object.keys(scene.offense).length !== 5 || !scene.offense[scene.ballOwner]) throw new Error('Play setup must have five players and a ball carrier.');
  if (!definition.formation || definition.defense) {
    scene.matchups = definition.zone ? Object.fromEntries([1, 2, 3, 4, 5].map(i => [`X${i}`, definition.zone === 'box-one' && i === 1 ? 'O2' : null])) : definition.matchups || Object.fromEntries([1, 2, 3, 4, 5].map(i => [`X${i}`, `O${i}`]));
    for (const id of Object.keys(scene.matchups)) scene.defense[id] = definition.defenders?.[id] ? point(definition.defenders[id], scene, id) : definition.zone ? [...ZONES[definition.zone][id]] : guardPoint(scene, id);
  }
  scene.screens = (definition.screens || []).map(item => ({ screener: item.actor, target: item.target, kind: item.kind, point: point(item.point, scene, item.actor) }));
  land(scene, new Set(Object.keys(all(scene))));
  return scene;
}
function addPhase(scene, phases, command, mutate, via = {}) {
  const before = snapshot(scene), previous = all(scene);
  scene.phaseStart = before;
  scene.following = {};
  mutate();
  const desired = all(scene), moving = new Set(Object.keys(desired).filter(id => distance(previous[id], desired[id]) > 0.01));
  const positions = land(scene, moving), routes = planRoutes(previous, positions, via, scene.courtHeight, scene.following);
  const travel = Math.max(0, ...Object.values(routes).map(routeLength));
  const actionDuration = command.type === 'pass' ? command.handoff ? 450 : Math.min(1300, 400 + distance(scene.offense[before.ballOwner], scene.offense[scene.ballOwner]) * 2)
    : command.type === 'shot' ? 1000 : travel > 1 ? Math.max(650, Math.min(scene.courtHeight > 470 ? 4500 : 3000, 450 + travel * 5)) : 600;
  // Smoothstep's peak slope is 1.5. The phase clock includes recovery paths,
  // so a delayed defender never has to sprint through a long route instantly.
  const duration = Math.max(actionDuration, ...Object.values(routes).map(route => routeSpeed(route) * 1.5 / .25));
  const exchange = command.type === 'pass' ? { from: before.ballOwner, to: scene.ballOwner, handoff: command.handoff } : null;
  const created = scene.screens.filter(screen => !before.screens.some(old => old.screener === screen.screener && old.target === screen.target && distance(old.point, screen.point) < 1));
  const actions = describeFrame(previous, positions, exchange ? [exchange] : [], created);
  if (command.type === 'shot') actions.push(`${before.ballOwner} releases a shot attempt.`);
  if (command.note) actions.push(command.note);
  const description = describeCommand(command, before, snapshot(scene));
  if (command.type === 'swap') actions.push(description);
  phases.push({ ...snapshot(scene), previous, startOwner: before.ballOwner, startBall: before.ball, startMatchups: before.matchups, startScreens: before.screens, routes, duration, exchange, shot: command.type === 'shot' ? { from: before.ballOwner, to: [...COURT.rim] } : null, actions,
    concurrent: command.type === 'together', description });
}
function runMovement(scene, phases, command) {
  const commands = command.type === 'together' ? command.commands : [command];
  if (!Array.isArray(commands) || !commands.length || command.type === 'together' && commands.length < 2) throw new Error('Simultaneous movement requires at least two independent actions.');
  const claimed = new Set(), via = {}, actors = all(scene);
  const known = id => { if (!actors[id]) throw new Error(`Unknown actor ${id}`); };
  // Resolve screen anchors and cutter paths from the common starting pose.
  // Never create a screen and use it in the same phase, or move its setter
  // while a teammate is using that screen.
  const intents = commands.map(item => {
    if (!['move', 'defend', 'screen', 'use'].includes(item.type)) throw new Error(`Cannot run ${item.type} as simultaneous movement.`);
    let targets, used, newScreen;
    if (item.type === 'screen') {
      known(item.actor); known(item.target);
      const target = actors[item.target], actor = scene.offense[item.actor];
      if (!actor) throw new Error('Only an offensive player can set a screen.');
      const dir = actor[0] < target[0] ? -1 : 1;
      const where = item.point ? point(item.point, scene, item.actor) : item.kind === 'handoff' ? actor
        : [target[0] + dir * 48, target[1] + (item.kind === 'back' ? -22 : item.kind === 'down' ? 28 : 0)];
      targets = { [item.actor]: clampPoint(where, scene.courtHeight) };
      newScreen = { screener: item.actor, target: item.target, kind: item.kind };
    } else {
      targets = item.type === 'use' ? { [item.actor]: item.to } : item.to;
      if (!targets || typeof targets !== 'object') throw new Error('Movement needs actor destinations.');
      Object.assign(via, item.via || {});
      if (item.type === 'use') {
        used = scene.screens.find(screen => screen.screener === item.screener);
        if (!used) throw new Error(`No established screen from ${item.screener}`);
        known(item.actor);
        const start = scene.offense[item.actor], end = point(item.to, scene, item.actor), anchor = used.point;
        const candidates = [[anchor[0] - 48, anchor[1]], [anchor[0] + 48, anchor[1]], [anchor[0], anchor[1] - 48], [anchor[0], anchor[1] + 48]];
        candidates.sort((a, b) => distance(start, a) + distance(a, end) - distance(start, b) - distance(b, end));
        via[item.actor] = [clampPoint(candidates[0], scene.courtHeight)];
      }
    }
    for (const id of Object.keys(targets)) {
      known(id);
      if (claimed.has(id)) throw new Error(`${id} has conflicting simultaneous destinations.`);
      claimed.add(id);
    }
    return { item, targets, used, newScreen };
  });
  for (const { used, newScreen } of intents) {
    if (used && claimed.has(used.screener)) throw new Error(`${used.screener} must stay set until the cutter clears the screen.`);
    if (newScreen && claimed.has(newScreen.target)) throw new Error('Set the screen after its target reaches the authored position.');
  }
  addPhase(scene, phases, command, () => {
    const focus = new Set();
    // Offensive movement supplies the destinations for defensive guard/gap
    // reads. All explicit defensive instructions override automatic tracking.
    for (const { item, targets, newScreen } of intents) for (const [id, value] of Object.entries(targets)) if (id.startsWith('O')) {
      scene.offense[id] = point(value, scene, id);
      scene.screens = scene.screens.filter(screen => screen.screener !== id);
      if (item.type === 'move' || newScreen) { focus.add(scene.ballOwner); focus.add(id); }
    }
    for (const { item, used, newScreen } of intents) {
      if (newScreen) scene.screens.push({ ...newScreen, point: [...scene.offense[newScreen.screener]] });
      if (used) {
        for (const screen of scene.screens) if (screen.target === used.target) screen.used = true;
        if (item.track !== false) focus.add(scene.matchups[used.target]);
      }
    }
    if (focus.size) followDefense(scene, [...focus]);
    for (const { targets } of intents) for (const [id, value] of Object.entries(targets)) if (id.startsWith('X')) {
      scene.defense[id] = point(value, scene, id);
      delete scene.following[id];
    }
  }, via);
}
function runCommand(scene, phases, notes, command) {
  const known = id => { if (!all(scene)[id]) throw new Error(`Unknown actor ${id}`); };
  if (command.type === 'mark') { scene.checkpoints[command.key] = snapshot(scene); return; }
  if (command.type === 'branch') {
    if (!scene.checkpoints[command.key]) throw new Error(`Unknown branch checkpoint ${command.key}`);
    if (phases.length) throw new Error('A branch must begin its authored step.');
    Object.assign(scene, snapshot(scene.checkpoints[command.key])); notes.push(command.text); return;
  }
  if (command.type === 'note') { notes.push(command.text); return; }
  if (command.type === 'hold') { addPhase(scene, phases, command, () => {}); return; }
  if (command.type === 'shot') {
    if (!scene.ballOwner) throw new Error('Cannot shoot without possession.');
    addPhase(scene, phases, command, () => { scene.lastOwner = scene.ballOwner; scene.ballOwner = null; scene.ball = [...COURT.rim]; }); return;
  }
  if (command.type === 'swap') {
    if (!scene.matchups[command.a] || !scene.matchups[command.b]) throw new Error('Switches require two man assignments.');
    // A switch exchanges assignments at the screen; the defenders keep their
    // court positions instead of sprinting across one another to re-form.
    addPhase(scene, phases, command, () => { [scene.matchups[command.a], scene.matchups[command.b]] = [scene.matchups[command.b], scene.matchups[command.a]]; });
    return;
  }
  if (command.type === 'pass') {
    known(command.to);
    if (!scene.ballOwner || scene.ballOwner === command.to) throw new Error(`Invalid ball transfer to ${command.to}`);
    const from = scene.ballOwner;
    if (command.handoff && distance(scene.offense[from], scene.offense[command.to]) > 62) {
      const a = scene.offense[from], b = scene.offense[command.to], length = distance(a, b);
      runCommand(scene, phases, notes, { type: 'move', to: { [command.to]: [a[0] + (b[0] - a[0]) * 50 / length, a[1] + (b[1] - a[1]) * 50 / length] } });
    }
    addPhase(scene, phases, command, () => {
      if (command.handoff) {
        const target = Object.keys(scene.matchups).find(id => scene.matchups[id] === command.to) || `X${command.to[1]}`;
        scene.screens = scene.screens.filter(screen => screen.screener !== from);
        scene.screens.push({ screener: from, target, kind: 'handoff', used: true, point: [...scene.offense[from]] });
      }
      scene.ballOwner = command.to; scene.lastOwner = command.to; scene.ball = null; followDefense(scene, command.to);
    }); return;
  }
  runMovement(scene, phases, command);
}
export function compileSequence(play, definition) {
  if (play.steps.length !== definition.steps.length) throw new Error(`${play.name}: authored step count changed; review its animation sequence.`);
  const scene = createScene(definition);
  const decorate = frame => ({ ...frame, courtHeight: scene.courtHeight, inboundSide: scene.inboundSide, cue: definition.formation ? undefined : 'Illustrated five-on-five sequence; labelled reads show the chosen example.' });
  const setup = decorate({ ...snapshot(scene), text: positionText(`Setup — ${play.name} lines up: ${play.alignment}`), routes: {}, actions: [], passes: [], exchanges: [], involved: Object.keys(all(scene)), duration: 0, isSetup: true });
  const frames = play.steps.map((text, index) => {
    const phases = [], notes = [];
    for (const command of definition.steps[index]) {
      try { runCommand(scene, phases, notes, command); }
      catch (error) { throw new Error(`step ${index + 1}, ${command.type}: ${error.message}`); }
    }
    if (!phases.length) addPhase(scene, phases, { type: 'hold' }, () => {});
    const routes = {};
    for (const phase of phases) for (const [id, route] of Object.entries(phase.routes)) routes[id] = [...(routes[id] || []).slice(0, -1), ...route];
    const exchanges = phases.flatMap(phase => phase.exchange ? [phase.exchange] : []);
    return decorate({ ...snapshot(scene), text: describeStep(phases, notes, text), phases, routes, exchanges, passes: exchanges.map(item => [item.from, item.to]), actions: [...notes, ...new Set(phases.flatMap(phase => phase.actions))].map(positionText),
      involved: Object.keys(routes).filter(id => phases.some(phase => distance(phase.previous[id], all(phase)[id]) > 1) || exchanges.some(exchange => exchange.from === id || exchange.to === id)), duration: phases.reduce((sum, phase) => sum + phase.duration, 0) });
  });
  return { setup, frames };
}

import { safeStorage } from '@/lib/safeStorage';
import { clonePositions, distance } from '@/components/playbook/playGeometry';
import { compileSequence } from '@/components/playbook/playTimeline';
import { actorsForFrame, samplePose } from '@/components/playbook/playMotionPose';
import { move, defend, together, pass, screen, cutOffScreen, shot, hold, note, SPREAD } from '@/components/playbook/playSequence';
import { positionText, roleLabel, zoneNameOf } from '@/components/playbook/playNarration';

export const CUSTOM_PLAYS_KEY = 'swishiq-playbook-custom-plays-v1';
export const MAX_CUSTOM_STEPS = 30;
export const MAX_CUSTOM_PLAYS = 40;
export const OFFENSE_IDS = ['O1', 'O2', 'O3', 'O4', 'O5'];
export const DEFENSE_IDS = ['X1', 'X2', 'X3', 'X4', 'X5'];
export const ACTOR_IDS = [...OFFENSE_IDS, ...DEFENSE_IDS];
const TYPES = ['move', 'pass', 'handoff', 'shot', 'screen', 'use'];
export const SCREEN_TYPES = ['ball', 'down', 'back', 'flare', 'cross', 'flat', 'step-up', 'pin'];
export const customId = () => `custom-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const text = (value, limit, label) => { assert(typeof value === 'string' && value.length <= limit, `${label} must be ${limit} characters or fewer.`); return value.trim(); };
const split = positions => ({ offense: Object.fromEntries(OFFENSE_IDS.map(id => [id, positions[id]])), defense: Object.fromEntries(DEFENSE_IDS.map(id => [id, positions[id]])) });

export function createCustomPlay() {
  const seed = compileSequence({ name: 'Custom play', alignment: '', steps: [] }, { setup: SPREAD, owner: 'O1', steps: [] });
  return { version: 1, id: customId(), name: 'My new play', goal: '', showDefense: true, owner: 'O1', courtHeight: 470,
    setup: clonePositions({ ...seed.setup.offense, ...seed.setup.defense }), steps: [] };
}
export function createCustomStep(positions) {
  return { id: customId(), title: '', notes: '', positions: clonePositions(positions), action: { type: 'move' } };
}
export function ballOwnerBeforeStep(play, index) {
  let owner = play.owner;
  for (const step of play.steps.slice(0, index)) {
    if (['pass', 'handoff'].includes(step.action.type)) owner = step.action.to;
    if (step.action.type === 'shot') owner = null;
  }
  return owner;
}
function readPositions(value, height, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: player positions are missing.`);
  assert(Object.keys(value).length === 10 && Object.keys(value).every(id => ACTOR_IDS.includes(id)), `${label}: include all five offensive and defensive players.`);
  return Object.fromEntries(ACTOR_IDS.map(id => {
    const pos = value[id];
    assert(Array.isArray(pos) && pos.length === 2 && pos.every(Number.isFinite), `${label}: ${roleLabel(id)} needs a valid court position.`);
    assert(pos[0] >= 32 && pos[0] <= 468 && pos[1] >= 32 && pos[1] <= height - 32, `${label}: ${roleLabel(id)} must stay inside the court.`);
    return [id, [...pos]];
  }));
}
// Reconstruct a small, bounded schema. Imported or stored content cannot supply
// engine commands, URLs, executable code, or arbitrary object keys.
export function normalizeCustomPlay(value) {
  assert(value && value.version === 1, 'This play file has an unsupported format.');
  assert(typeof value.id === 'string' && /^custom-[a-z0-9-]{6,80}$/i.test(value.id), 'This play needs a valid custom ID.');
  assert(OFFENSE_IDS.includes(value.owner), 'Choose a starting ballhandler.');
  assert([470, 940].includes(value.courtHeight), 'Choose a half court or full court.');
  assert(Array.isArray(value.steps) && value.steps.length <= MAX_CUSTOM_STEPS, `A play can contain up to ${MAX_CUSTOM_STEPS} steps.`);
  const ids = new Set();
  const steps = value.steps.map((step, index) => {
    assert(step && typeof step.id === 'string' && /^custom-[a-z0-9-]{6,80}$/i.test(step.id) && !ids.has(step.id), `Step ${index + 1} needs a unique ID.`);
    ids.add(step.id);
    assert(step.action && TYPES.includes(step.action.type), `Step ${index + 1} has an unknown action.`);
    const action = { type: step.action.type };
    if (['pass', 'handoff'].includes(action.type)) { assert(OFFENSE_IDS.includes(step.action.to), `Step ${index + 1}: select a receiver.`); action.to = step.action.to; }
    if (action.type === 'screen') {
      assert(OFFENSE_IDS.includes(step.action.screener) && DEFENSE_IDS.includes(step.action.target) && SCREEN_TYPES.includes(step.action.kind), `Step ${index + 1}: select a screener, defender, and screen type.`);
      Object.assign(action, { screener: step.action.screener, target: step.action.target, kind: step.action.kind });
    }
    if (action.type === 'use') {
      assert(OFFENSE_IDS.includes(step.action.actor) && OFFENSE_IDS.includes(step.action.screener) && step.action.actor !== step.action.screener, `Step ${index + 1}: the cutter and screener must be different players.`);
      Object.assign(action, { actor: step.action.actor, screener: step.action.screener });
    }
    return { id: step.id, title: text(step.title, 70, 'Step title'), notes: text(step.notes, 400, 'Step description'),
      positions: readPositions(step.positions, value.courtHeight, `Step ${index + 1}`), action };
  });
  return { version: 1, id: value.id, name: text(value.name, 80, 'Play name'), goal: text(value.goal, 500, 'Tactical goal'),
    showDefense: value.showDefense !== false, owner: value.owner, courtHeight: value.courtHeight,
    setup: readPositions(value.setup, value.courtHeight, 'Setup'), steps };
}
function validateSpacing(positions, height, label, hidden) {
  const gap = height > 470 ? 51 : 39;
  for (let a = 0; a < ACTOR_IDS.length; a++) for (let b = a + 1; b < ACTOR_IDS.length; b++) {
    const first = ACTOR_IDS[a], second = ACTOR_IDS[b];
    assert(distance(positions[first], positions[second]) >= gap - .001,
      `${label}: ${roleLabel(first)} and ${roleLabel(second)} overlap. Separate their positions.${hidden && (first[0] === 'X' || second[0] === 'X') ? ' Turn on Show defense to adjust defenders.' : ''}`);
  }
}
export function customPlayDefinition(draft) {
  const play = normalizeCustomPlay(draft);
  assert(play.name.length, 'Give your play a name.');
  assert(play.steps.length, 'Add at least one step before previewing or saving your play.');
  validateSpacing(play.setup, play.courtHeight, 'Setup', !play.showDefense);
  let previous = play.setup, owner = play.owner;
  const activeScreens = new Set();
  const steps = play.steps.map((step, index) => {
    const label = `Step ${index + 1}`, action = step.action;
    validateSpacing(step.positions, play.courtHeight, label, !play.showDefense);
    const moved = ACTOR_IDS.filter(id => distance(previous[id], step.positions[id]) > .01);
    if (action.type === 'use') {
      assert(activeScreens.has(action.screener), `${label}: set a screen with ${roleLabel(action.screener)} in an earlier step first.`);
      assert(!moved.includes(action.screener), `${label}: ${roleLabel(action.screener)} must hold the screen while ${roleLabel(action.actor)} uses it.`);
      assert(distance(previous[action.actor], step.positions[action.actor]) > 10, `${label}: place ${roleLabel(action.actor)} beyond the screen to define the cut.`);
    }
    for (const id of moved) activeScreens.delete(id);
    const offense = Object.fromEntries(moved.filter(id => id[0] === 'O' && !(action.type === 'use' && id === action.actor)).map(id => [id, step.positions[id]]));
    const defense = Object.fromEntries(moved.filter(id => id[0] === 'X').map(id => [id, step.positions[id]]));
    const motions = [];
    if (Object.keys(offense).length) motions.push(move(offense));
    if (Object.keys(defense).length) motions.push(defend(defense));
    if (action.type === 'use') motions.push(cutOffScreen(action.actor, step.positions[action.actor], action.screener, false));
    const commands = motions.length > 1 ? [together(...motions)] : [...motions];
    if (['pass', 'handoff'].includes(action.type)) {
      assert(owner && owner !== action.to, `${label}: choose a receiver other than the current ballhandler (${owner ? roleLabel(owner) : 'none'}).`);
      if (action.type === 'handoff') assert(distance(step.positions[owner], step.positions[action.to]) <= 62, `${label}: bring the ballhandler and receiver within handoff range before the exchange.`);
      commands.push(pass(action.to, action.type === 'handoff')); owner = action.to;
    }
    if (action.type === 'shot') {
      assert(owner && index === play.steps.length - 1, `${label}: a shot must be the final step.`);
      commands.push(shot()); owner = null;
    }
    if (action.type === 'screen') {
      assert(distance(step.positions[action.screener], step.positions[action.target]) <= 90, `${label}: place ${roleLabel(action.screener)} next to ${roleLabel(action.target)} to set the screen.`);
      commands.push(screen(action.screener, action.target, action.kind, step.positions[action.screener]));
      activeScreens.add(action.screener);
    }
    if (!commands.length) commands.push(hold('Hold the current spacing and read the defense.'));
    if (step.notes.trim()) commands.push(note(positionText(step.notes)));
    previous = step.positions;
    return commands;
  });
  const { offense, defense } = split(play.setup);
  return { setup: offense, defenders: defense, owner: play.owner, autoGuard: false, courtHeight: play.courtHeight, steps };
}
export function customLibraryPlay(draft) {
  const play = normalizeCustomPlay(draft);
  return { id: play.id, name: play.name, type: 'Custom play', category: 'My plays', tags: [], goal: play.goal, reads: [],
    alignment: OFFENSE_IDS.map(id => `${roleLabel(id)} at ${zoneNameOf(play.setup[id])}`).join('; '),
    steps: play.steps.map((step, index) => step.title || `Step ${index + 1}`), customDraft: play };
}
export function compileCustomPlay(draft) {
  const play = customLibraryPlay(draft);
  const animation = compileSequence(play, customPlayDefinition(play.customDraft));
  // Arbitrary formations can exceed the route planner's clearance budget.
  // Reject those steps with editing guidance instead of saving a bad animation
  // or quietly changing the user's authored endpoints.
  for (const [index, frame] of animation.frames.entries()) {
    const end = actorsForFrame(frame), desired = play.customDraft.steps[index].positions;
    for (const id of ACTOR_IDS) assert(distance(end[id], desired[id]) < .05,
      `Step ${index + 1}: ${roleLabel(id)} cannot reach this position with the current spacing. Adjust the formation or split the movement into two steps.`);
    let elapsed = 0;
    for (const phase of frame.phases) {
      for (let tick = 0; tick <= 150; tick++) {
        const pose = samplePose(frame, frame.routes, (elapsed + phase.duration * tick / 150) / frame.duration);
        for (const id of ACTOR_IDS) assert(pose.actors[id]?.every(Number.isFinite), `Step ${index + 1}: ${roleLabel(id)} has an invalid route.`);
        for (let a = 0; a < ACTOR_IDS.length; a++) for (let b = a + 1; b < ACTOR_IDS.length; b++) {
          assert(distance(pose.actors[ACTOR_IDS[a]], pose.actors[ACTOR_IDS[b]]) >= (frame.courtHeight > 470 ? 49.3 : 37.9),
            `Step ${index + 1}: ${roleLabel(ACTOR_IDS[a])} and ${roleLabel(ACTOR_IDS[b])} cross too closely. Adjust their destinations or split the movement into two steps.`);
        }
      }
      elapsed += phase.duration;
    }
  }
  return animation;
}
export function readCustomPlays(storage = safeStorage()) {
  try {
    const raw = storage?.getItem(CUSTOM_PLAYS_KEY);
    if (!raw) return { plays: [], message: '' };
    const data = JSON.parse(raw);
    assert(data.version === 1 && Array.isArray(data.plays) && data.plays.length <= MAX_CUSTOM_PLAYS, 'Saved play storage could not be read.');
    const plays = [], seen = new Set(); let skipped = 0;
    for (const item of data.plays) try {
      const play = normalizeCustomPlay(item);
      assert(!seen.has(play.id), 'Duplicate saved play.');
      seen.add(play.id); plays.push(play);
    } catch { skipped++; }
    return { plays, message: skipped ? `${skipped} saved play${skipped === 1 ? '' : 's'} could not be loaded. The saved data has been preserved.` : '' };
  } catch { return { plays: [], message: 'Saved plays could not be loaded. Existing browser data has been preserved.' }; }
}
export function writeCustomPlays(plays, storage = safeStorage()) {
  assert(plays.length <= MAX_CUSTOM_PLAYS, `You can save up to ${MAX_CUSTOM_PLAYS} custom plays.`);
  const clean = plays.map(normalizeCustomPlay);
  if (!storage) return false;
  try {
    // Preserve unreadable records before replacing their envelope with a save.
    if (readCustomPlays(storage).message) {
      const previous = storage.getItem(CUSTOM_PLAYS_KEY);
      if (previous) storage.setItem(`${CUSTOM_PLAYS_KEY}-recovery-${Date.now()}`, previous);
    }
    storage.setItem(CUSTOM_PLAYS_KEY, JSON.stringify({ version: 1, plays: clean })); return true;
  }
  catch { return false; }
}
export function exportCustomPlay(play) {
  return JSON.stringify({ format: 'swishiq-custom-play', version: 1, play: normalizeCustomPlay(play) }, null, 2);
}
export function importCustomPlay(source) {
  assert(typeof source === 'string' && source.length <= 200000, 'Choose a SwishIQ play JSON file smaller than 200 KB.');
  let data; try { data = JSON.parse(source); } catch { throw new Error('This file is not valid play JSON.'); }
  assert(data.format === 'swishiq-custom-play' && data.version === 1, 'Choose a file exported from the SwishIQ play builder.');
  const play = normalizeCustomPlay(data.play);
  play.id = customId();
  compileCustomPlay(play);
  return play;
}

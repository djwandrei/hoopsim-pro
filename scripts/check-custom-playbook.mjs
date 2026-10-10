import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const root = process.cwd();
const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(specifier.startsWith('@/') ? pathToFileURL(path.join(root, 'src', `${specifier.slice(2)}.js`)).href : specifier, context);
} });
try {
  const model = await import('../src/components/playbook/customPlays.js');
  const { samplePose, actorsForFrame } = await import('../src/components/playbook/playMotionPose.js');
  const { distance } = await import('../src/components/playbook/playGeometry.js');
  const { createCustomPlay, createCustomStep, compileCustomPlay, customPlayDefinition, normalizeCustomPlay, importCustomPlay, exportCustomPlay,
    readCustomPlays, writeCustomPlays, CUSTOM_PLAYS_KEY, ballOwnerBeforeStep, ACTOR_IDS } = model;
  const store = new Map();
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  let samples = 0, minGap = Infinity;
  const validateAnimation = draft => {
    const animation = compileCustomPlay(draft);
    assert.equal(animation.frames.length, draft.steps.length);
    let previous = animation.setup;
    for (const [index, frame] of animation.frames.entries()) {
      assert(!/\b[OX][1-5]\b/.test(frame.text), 'Descriptions must use position labels.');
      const end = actorsForFrame(frame);
      for (const id of ACTOR_IDS) assert(distance(end[id], draft.steps[index].positions[id]) < .01, `Editor endpoint changed: ${id}`);
      assert.deepEqual(frame.phases[0].previous, actorsForFrame(previous), 'A step teleported a player.');
      for (let tick = 0; tick <= 300; tick++) {
        const pose = samplePose(frame, frame.routes, tick / 300);
        samples++;
        assert(pose.ball.every(Number.isFinite));
        for (const id of ACTOR_IDS) assert(pose.actors[id].every(Number.isFinite));
        for (let a = 0; a < ACTOR_IDS.length; a++) for (let b = a + 1; b < ACTOR_IDS.length; b++) {
          const gap = distance(pose.actors[ACTOR_IDS[a]], pose.actors[ACTOR_IDS[b]]);
          minGap = Math.min(minGap, gap);
          assert(gap >= 37.9, `${draft.name} step ${index + 1}: overlapping actors ${ACTOR_IDS[a]}, ${ACTOR_IDS[b]} (${gap})`);
        }
      }
      previous = frame;
    }
    return animation;
  };
  const draft = createCustomPlay(); draft.name = 'Wing exchange';
  const moveStep = createCustomStep(draft.setup);
  Object.assign(moveStep.positions, { O1: [300, 320], O2: [445, 270], X1: [270, 265], X2: [390, 230] });
  moveStep.action = { type: 'pass', to: 'O2' }; moveStep.notes = 'O1 reads the help while O2 lifts.';
  const finish = createCustomStep(moveStep.positions); finish.action = { type: 'shot' };
  draft.steps = [moveStep, finish];
  const animation = validateAnimation(draft);
  assert(animation.frames[0].phases[0].concurrent, 'Offense and defense should move together.');
  assert.equal(animation.frames[0].ballOwner, 'O2');
  assert.equal(animation.frames[1].ballOwner, null);
  assert.equal(ballOwnerBeforeStep(draft, 1), 'O2');
  assert.equal(ballOwnerBeforeStep(draft, 2), null);
  const hidden = { ...structuredClone(draft), showDefense: false };
  assert.deepEqual(compileCustomPlay(hidden), animation, 'Hiding defense changed the underlying play.');
  assert.equal(writeCustomPlays([draft], storage), true);
  assert.deepEqual(readCustomPlays(storage).plays, [normalizeCustomPlay(draft)]);
  const imported = importCustomPlay(exportCustomPlay(draft));
  assert.notEqual(imported.id, draft.id); assert.deepEqual(imported.steps, draft.steps);
  validateAnimation(imported);
  writeCustomPlays([], storage); assert.equal(readCustomPlays(storage).plays.length, 0);
  writeCustomPlays([draft], storage); assert.equal(readCustomPlays(storage).plays.length, 1);
  assert.equal(writeCustomPlays([draft], null), false);
  assert.equal(writeCustomPlays([draft], { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }), false);
  const corrupt = '{original unreadable data'; store.set(CUSTOM_PLAYS_KEY, corrupt);
  assert(readCustomPlays(storage).message);
  assert.equal(writeCustomPlays([draft], storage), true);
  assert([...store.entries()].some(([key, value]) => key.startsWith(`${CUSTOM_PLAYS_KEY}-recovery-`) && value === corrupt));
  const invalid = edit => { const play = structuredClone(draft); edit(play); return play; };
  assert.throws(() => compileCustomPlay(createCustomPlay()), /Add at least one step/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.name = ' '; })), /Give your play a name/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].positions.O1 = [...play.steps[0].positions.O2]; })), /overlap/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].positions.O1 = [999, 999]; })), /inside the court/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].action.to = 'O1'; })), /other than the current ballhandler/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].action = { type: 'shot' }; })), /final step/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].action = { type: 'handoff', to: 'O2' }; })), /handoff range/);
  assert.throws(() => compileCustomPlay(invalid(play => { play.steps[0].action = { type: 'use', actor: 'O1', screener: 'O5' }; })), /earlier step/);
  assert.throws(() => importCustomPlay(JSON.stringify({ format: 'swishiq-custom-play', version: 1, play: { ...draft, owner: '__proto__' } })), /ballhandler/);
  assert.throws(() => importCustomPlay('not json'), /valid play JSON/);
  assert.throws(() => importCustomPlay('{}'), /exported from/);
  assert.throws(() => importCustomPlay('x'.repeat(200001)), /smaller than/);
  assert.throws(() => normalizeCustomPlay(invalid(play => { play.steps[1].id = play.steps[0].id; })), /unique ID/);
  assert.throws(() => writeCustomPlays(Array.from({ length: 41 }, () => draft), storage), /up to 40/);
  const handoff = createCustomPlay(); handoff.name = 'Handoff';
  const exchange = createCustomStep(handoff.setup); exchange.positions.O2 = [300, 304]; exchange.action = { type: 'handoff', to: 'O2' }; handoff.steps = [exchange];
  validateAnimation(handoff);
  const screenPlay = createCustomPlay(); screenPlay.name = 'Custom ball screen';
  const establish = createCustomStep(screenPlay.setup); establish.positions.O5 = [300, 254]; establish.action = { type: 'screen', screener: 'O5', target: 'X1', kind: 'ball' };
  const use = createCustomStep(establish.positions); use.positions.O1 = [350, 240]; use.action = { type: 'use', actor: 'O1', screener: 'O5' };
  const roll = createCustomStep(use.positions); Object.assign(roll.positions, { O1: [385, 130], O5: [250, 130] }); roll.action = { type: 'pass', to: 'O5' };
  screenPlay.steps = [establish, use, roll]; validateAnimation(screenPlay);
  assert.throws(() => customPlayDefinition({ ...screenPlay, steps: [establish, { ...use, positions: { ...use.positions, O5: [300, 310] } }] }), /hold the screen/);
  console.log(JSON.stringify({ result: 'passed', sampledStates: samples, minPlayerGap: minGap, checks: 'movement, concurrent defense, possession, handoff, screen setup/use/roll, endpoints, import/export, storage/recovery, validation' }));
} finally { hooks.deregister(); }

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
// Load the pure animation modules directly. No dev server or application
// plugins are needed for a deterministic check of the authored sequences.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('@/') ? pathToFileURL(path.join(root, 'src', `${specifier.slice(2)}.js`)).href : specifier, context);
}, load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  return url.endsWith('/playLibrary.js') ? { ...loaded, source: String(loaded.source).replace('import.meta.env.BASE_URL', "'/'") } : loaded;
} });
try {
  const { parseLibrary } = await import('../src/components/playbook/playLibrary.js');
  const { buildFrames } = await import('../src/components/playbook/playAnimation.js');
  const { default: sequences } = await import('../src/components/playbook/playSequences.js');
  const { actorsForFrame, samplePose, staticPose, ballAt, pointOnArc } = await import('../src/components/playbook/playMotionPose.js');
  const { distance, ZONES, zonePoint } = await import('../src/components/playbook/playGeometry.js');
  const { routeSpeed } = await import('../src/components/playbook/playMotion.js');
  const { zoneNameOf, mirrorText, positionText, roleLabel } = await import('../src/components/playbook/playNarration.js');
  const { expandCommands, together, move, screen, cutOffScreen, pass, SPREAD } = await import('../src/components/playbook/playSequence.js');
  const { compileSequence } = await import('../src/components/playbook/playTimeline.js');
  const library = parseLibrary(await fs.readFile(path.join(root, 'public/playbook/play-library.md'), 'utf8'));
  const allPlays = library.categories.flatMap(category => category.plays), names = new Set(allPlays.map(play => play.name));
  const plays = process.argv.length > 2 ? allPlays.filter(play => process.argv.slice(2).includes(play.name)) : allPlays;
  const errors = [], collisions = [], handoffs = [], screenDistances = [], coverage = [], results = new Map();
  const counts = { plays: plays.length, definitions: Object.keys(sequences).length, steps: 0, phases: 0, concurrentPhases: 0, multiPlayerPhases: 0, coordinatedOffensePhases: 0, samples: 0, passes: 0, handoffs: 0, shots: 0, screens: 0, branches: 0, minHalfGap: Infinity, minFullGap: Infinity };
  const expect = (condition, message) => { if (!condition) errors.push(message); };
  const targetPoint = value => {
    const lateral = typeof value === 'string' ? /^(left|right)-(.+)$/.exec(value) : null;
    return Array.isArray(value) ? value : zonePoint(lateral ? lateral[2] : value, lateral ? lateral[1] : 'right');
  };
  const checkDestinations = (targets, positions, label) => {
    for (const [id, value] of Object.entries(targets)) if (id.startsWith('O'))
      expect(distance(targetPoint(value), positions[id]) <= 20, `${label}: ${id} displaced from its authored spot; clear the teammate occupying it`);
  };
  expect(allPlays.length === 181, 'Library count changed; review every definition.');
  expect(names.size === allPlays.length, 'Duplicate play name.');
  for (const name of process.argv.slice(2)) expect(names.has(name), `Unknown requested play: ${name}`);
  for (const name of Object.keys(sequences)) expect(names.has(name), `${name}: extra sequence`);
  const validatePoint = (value, label, height, inbound = false) => {
    expect(Array.isArray(value) && value.length === 2 && value.every(Number.isFinite), `${label}: invalid coordinate`);
    if (!Array.isArray(value)) return;
    expect(inbound || value[0] >= 31.99 && value[0] <= 468.01 && value[1] >= 31.99 && value[1] <= height - 31.99, `${label}: coordinate outside court ${value}`);
  };
  for (const play of plays) {
    const label = play.name;
    let result;
    try { result = buildFrames(play); } catch (error) { errors.push(`${label}: ${error.message}`); continue; }
    results.set(label, result);
    const definition = sequences[label], height = result.setup.courtHeight, full = height > 470;
    expect(!/\b[OX][1-5]\b/i.test(result.setup.text), `${label}: setup must use position labels`);
    checkDestinations(definition.setup, result.setup.offense, `${label} setup`);
    coverage.push({ name: label, category: play.category, steps: result.frames.length, phases: result.frames.reduce((sum, frame) => sum + frame.phases.length, 0),
      branches: definition.steps.filter(commands => commands.some(command => command.type === 'branch')).length,
      descriptions: result.frames.map(frame => frame.text) });
    if (definition.formation) for (const id of ['O2', 'O3', 'O4', 'O5']) {
      const command = definition.steps.flat().find(item => item.type === 'move' && item.to[id]);
      if (!command) continue;
      const value = command.to[id], lateral = typeof value === 'string' ? /^(left|right)-(.+)$/.exec(value) : null;
      const target = Array.isArray(value) ? value : zonePoint(lateral ? lateral[2] : value, lateral ? lateral[1] : 'right');
      expect(distance(result.setup.offense[id], target) <= 60, `${label}: ${id} stages too far from its opening spot`);
      if (Math.abs(target[0] - 250) > 30) expect((result.setup.offense[id][0] - 250) * (target[0] - 250) > 0, `${label}: ${id} stages on the wrong side`);
    }
    expect(result.frames.length === play.steps.length, `${label}: missing steps`);
    let previous = result.setup;
    for (const [step, frame] of result.frames.entries()) {
      counts.steps++;
      expect(frame.text.length > 10 && !/\b[OX][1-5]\b/i.test(frame.text), `${label} step ${step + 1}: missing readable position-based description`);
      expect(frame.actions.every(text => !/\b[OX][1-5]\b/i.test(text)), `${label} step ${step + 1}: action list must use position labels`);
      expect(!/undefined|\bNaN\b|Then [ox][1-5]\b/.test(frame.text), `${label} step ${step + 1}: invalid narration`);
      // Explicit later commands can replace a move: screens place the setter,
      // and handoffs may tighten the receiver's approach. Every other offensive
      // destination must survive clearance planning without a silent relocation.
      const targets = {};
      for (const command of expandCommands(definition.steps[step])) {
        if (command.type === 'move') Object.assign(targets, command.to);
        if (command.type === 'use') targets[command.actor] = command.to;
        if (command.type === 'screen') delete targets[command.actor];
        if (command.type === 'pass' && command.handoff) delete targets[command.to];
      }
      checkDestinations(targets, frame.offense, `${label} step ${step + 1}`);
      const branch = definition.steps[step].some(command => command.type === 'branch');
      if (branch) { counts.branches++; expect(frame.actions.some(text => /^Alternate read:/.test(text)), `${label} ${step + 1}: unlabelled branch`); }
      let prior = branch ? null : previous;
      let elapsed = 0;
      for (const [index, phase] of frame.phases.entries()) {
        counts.phases++;
        if (phase.concurrent) counts.concurrentPhases++;
        const where = `${label} step ${step + 1} phase ${index + 1}`, end = actorsForFrame(phase), ids = Object.keys(end);
        if (ids.filter(id => distance(phase.previous[id], end[id]) > 6).length > 1) counts.multiPlayerPhases++;
        if (Object.keys(phase.offense).filter(id => distance(phase.previous[id], end[id]) > 6).length > 1) counts.coordinatedOffensePhases++;
        expect(Object.keys(phase.offense).length === 5, `${where}: must have five attackers`);
        expect(Object.keys(phase.defense).length === (definition.formation && !definition.defense ? 0 : 5), `${where}: wrong defensive shell`);
        const assignments = Object.values(phase.matchups).filter(Boolean);
        expect(assignments.length === new Set(assignments).size, `${where}: duplicate man assignment`);
        expect(phase.ballOwner === null || Boolean(phase.offense[phase.ballOwner]), `${where}: invalid ball owner`);
        if (prior) {
          expect(prior.ballOwner === phase.startOwner, `${where}: possession discontinuity`);
          for (const [id, pos] of Object.entries(actorsForFrame(prior))) expect(distance(pos, phase.previous[id]) < 0.01, `${where}: actor teleported ${id}`);
        }
        for (const [id, pos] of Object.entries(end)) validatePoint(pos, `${where} ${id}`, height, id === definition.inbounder && (pos[0] > 500 || pos[1] < 0));
        if (phase.exchange) {
          counts.passes++; expect(phase.exchange.from === phase.startOwner && phase.exchange.to === phase.ballOwner && phase.startOwner !== phase.ballOwner, `${where}: illegal pass`);
          if (phase.exchange.handoff) {
            counts.handoffs++; const gap = distance(phase.offense[phase.exchange.from], phase.offense[phase.exchange.to]);
            if (gap > 62.01) handoffs.push({ where, gap });
          }
        }
        if (phase.shot) { counts.shots++; expect(phase.shot.from === phase.startOwner && phase.ballOwner === null, `${where}: illegal shot`); }
        for (const screen of phase.screens) {
          counts.screens++; expect(screen.screener.startsWith('O') && screen.target.startsWith('X') && end[screen.target], `${where}: wrong screen target`);
          expect(distance(screen.point, phase.offense[screen.screener]) < 0.01, `${where}: floating screen marker`);
          if (!phase.startScreens.some(old => old.screener === screen.screener && old.target === screen.target)) screenDistances.push({ where, screener: screen.screener, target: screen.target, gap: distance(screen.point, end[screen.target]) });
        }
        for (const [id, route] of Object.entries(phase.routes)) {
          expect(routeSpeed(route) * 1.5 / phase.duration <= .250001, `${where}: ${id} exceeds the movement speed limit`);
          if (phase.startScreens.some(screen => screen.screener === id) && phase.screens.some(screen => screen.screener === id) && distance(phase.previous[id], end[id]) < .01)
            expect(route.every(point => distance(point, phase.previous[id]) < .01), `${where}: established screener moves during the cut`);
        }
        let minimum = Infinity, collision = null;
        for (let tick = 0; tick <= 250; tick++) {
          counts.samples++;
          const t = tick / 250, pose = samplePose(frame, frame.routes, (elapsed + t * phase.duration) / frame.duration);
          for (const [id, pos] of Object.entries(pose.actors)) validatePoint(pos, `${where} sample ${tick} ${id}`, height, id === definition.inbounder && (pos[0] > 468 || pos[1] < 32));
          for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
            const gap = distance(pose.actors[ids[a]], pose.actors[ids[b]]);
            if (gap < minimum) { minimum = gap; collision = { where, pair: [ids[a], ids[b]], t, gap, positions: pose.actors }; }
          }
          if (pose.passPaths.length) expect(distance(pose.ball, pointOnArc(pose.passPaths[0], t * t * (3 - 2 * t))) < 0.02 || tick === 250, `${where}: ball diverged from drawn pass`);
          if (pose.ball) expect(pose.ball.every(Number.isFinite), `${where}: invalid ball coordinate`);
        }
        if (minimum < (full ? 49.3 : 37.9)) collisions.push({ ...collision, previous: phase.previous, routes: phase.routes,
          timings: Object.fromEntries(Object.entries(phase.routes).filter(([, route]) => route.timing).map(([id, route]) => [id, route.timing])) });
        if (full) counts.minFullGap = Math.min(counts.minFullGap, minimum); else counts.minHalfGap = Math.min(counts.minHalfGap, minimum);
        const startPose = samplePose(frame, frame.routes, elapsed / frame.duration);
        const expectedBall = ballAt(phase.previous, phase.startOwner, phase.startBall);
        if (expectedBall) expect(distance(startPose.ball, expectedBall) < 0.02, `${where}: ball jumps at phase start`);
        elapsed += phase.duration;
        prior = phase;
      }
      expect(Math.abs(elapsed - frame.duration) < 0.01, `${label}: wrong duration`);
      const finalPose = samplePose(frame, frame.routes, 1);
      assert.deepEqual(finalPose, staticPose(frame));
      previous = frame;
    }
  }
  // Tactical regressions: spacing, possession, weak side, switches and mirroring.
  const five = results.get('5-Out');
  if (five) { const last = five.frames.at(-1); expect(distance(last.offense.O1, ZONES.top) < 1, '5-Out: final hold relocates the handler'); expect(Object.values(last.offense).every(([x,y]) => y >= 230 || x <= 60 || x >= 440), '5-Out: paint not empty'); }
  for (const name of ['Hammer', 'P&R → Hammer', 'Post → Hammer', 'BLOB Hammer']) { const result = results.get(name); if (result) expect(result.frames.at(-1).offense.O3[0] < 70, `${name}: weak-side shooter must finish in left corner`); }
  const early = results.get('Early Pistol'); if (early) expect(early.frames[3].ballOwner === 'O2', 'Early Pistol: handoff did not transfer to O2');
  const inverted = results.get('Inverted Pick-and-Roll'); if (inverted) expect(inverted.setup.ballOwner === 'O4', 'Inverted P&R: wrong initial handler');
  const triangle = results.get('Triangle Offense'); if (triangle) expect(triangle.frames[0].offense.O1[0] > 400 && triangle.frames[1].offense.O5[0] > 300 && triangle.frames[1].offense.O2[0] > 400, 'Triangle: entry must form a strong-side corner, wing and post triangle');
  const delay = results.get('Delay Offense'); if (delay) expect(delay.frames[2].screens.some(screen => screen.screener === 'O4' && screen.target === 'X3'), 'Delay: first Zoom must stay on the chosen left side');
  const backdoor = results.get('Backdoor Cut'); if (backdoor) for (const frame of backdoor.frames.slice(1, 3)) expect(frame.defense.X2[1] > frame.offense.O2[1], 'Backdoor: beaten defender must recover behind the cutter, including after the catch');
  const switchResult = results.get('Triple Switch vs Spain'); if (switchResult) assert.deepEqual(switchResult.frames.at(-1).matchups, { X1:'O1', X2:'O5', X3:'O3', X4:'O4', X5:'O2' });
  for (const name of ['Flex Cut', 'Flex Offense']) {
    const result = results.get(name); if (!result) continue;
    expect(distance(result.setup.offense.O3, zonePoint('corner', 'left')) < 1, `${name}: baseline cutter must start in the corner`);
    expect(distance(result.frames[1].offense.O3, zonePoint('block', 'right')) < 1, `${name}: flex cut must reach the opposite block`);
  }
  const flex = results.get('Flex Offense'); if (flex) {
    expect(distance(flex.frames[3].offense.O1, zonePoint('corner', 'left')) < 1, 'Flex: down screener must clear to the corner');
    expect(distance(flex.frames.at(-1).offense.O4, zonePoint('block', 'left')) < 1, 'Flex: next corner cutter must reverse through the lane');
  }
  const princeton = results.get('Princeton Offense'); if (princeton)
    expect(princeton.frames[4].offense.O3[1] > princeton.setup.offense.O3[1] + 90, 'Princeton: the weak-side pindown must lift O3 from the corner');
  for (const [name, step, actor] of [['Princeton Chin', 4, 'O3'], ['Triangle Offense', 4, 'O3'], ['Swing Offense', 2, 'O2'], ['Horns Flare', 2, 'O3'], ['Horns UCLA', 5, 'O3']]) {
    const result = results.get(name); if (!result) continue;
    const start = result.frames[step].phases[0].previous, frame = result.frames[step], owner = frame.ballOwner;
    expect(distance(frame.offense[actor], frame.offense[owner]) > distance(start[actor], start[owner]) + 20, `${name}: flare must cut away from the ball`);
  }
  const continuity = results.get('Continuity P&R'); if (continuity)
    expect(continuity.frames[0].offense.O1[0] > 250 && continuity.frames[1].offense.O2[0] < 250 && continuity.frames[4].offense.O2[0] < 250, 'Continuity P&R: second action must attack the opposite side');
  const under = results.get('Under'); if (under) {
    expect(under.frames[1].offense.O1[0] < under.setup.offense.O5[0] && under.frames[1].defense.X1[1] < under.setup.offense.O5[1], 'Under: defender must cross below the screen to the other side');
    expect(under.frames.at(-1).phases[0].previous.O1[1] > under.setup.offense.O5[1] + 40, 'Under: pull-up must remain behind the screen');
  }
  const rimRun = results.get('Rim Run'); if (rimRun) expect(rimRun.frames[3].phases[0].previous.O1[1] < 470, 'Rim Run: guard must advance before feeding the rim');
  const primary = results.get('Primary Fast Break'); if (primary) expect(primary.frames[3].offense.O1[1] < 470 && primary.frames[3].offense.O4[1] < 470, 'Fast break: guard and trailer must advance with the play');
  const hitAhead = results.get('Hit-Ahead Break'); if (hitAhead) expect(hitAhead.frames[2].phases[0].previous.O1[1] < 500, 'Hit-ahead: guard must advance before the lead pass');
  const skipDrive = results.get('Skip-and-Drive'); if (skipDrive) expect(skipDrive.setup.ballOwner === 'O2' && skipDrive.frames[0].ballOwner === 'O3', 'Skip-and-Drive: skip must start on the opposite wing');
  const spainSlip = results.get('Spain Slip'); if (spainSlip) {
    expect(distance(spainSlip.frames[1].offense.O2, spainSlip.frames[1].defense.X5) < 65, 'Spain Slip: guard must sell the back screen to X5');
    expect(!spainSlip.frames.some(frame => frame.screens.some(screen => screen.screener === 'O2')), 'Spain Slip: guard must slip before setting the back screen');
  }
  expect(zoneNameOf([460,78]) === 'the right corner', 'Right corner narration chooses a left-only zone');
  expect(mirrorText('Left wing, right corner', true) === 'Right wing, left corner', 'Mirror narration does not swap both sides');
  expect(mirrorText(mirrorText('Left wing, right corner', true), true) === 'Left wing, right corner', 'Mirroring twice must be identity');
  expect(positionText('O1 passes to O5; X1 guards O2.') === 'PG passes to C; PG defender guards SG.', 'Narration: offensive and defensive labels must stay distinct');
  expect(positionText('O2-O5; O1–O5; X1/X5; O2/O3/O4') === 'SG, SF, PF, and C; PG, SG, SF, PF, and C; PG defender and C defender; SG, SF, and PF', 'Narration: actor ranges and groups must use readable positions');
  expect(roleLabel('X4') === 'PF defender', 'Narration: defender badge must identify defense');
  // Concurrency is authored explicitly, with dependency checks. Reject a
  // cutter using a moving or not-yet-established setter, conflicting targets,
  // and possession changes hidden inside movement groups.
  const example = { name: 'Concurrency check', alignment: 'Spread', steps: ['Move'] };
  for (const [commands, pattern] of [
    [[together(move({ O2: 'right-slot' }), move({ O2: 'rim' }))], /conflicting/],
    [[together(screen('O5', 'X1'), cutOffScreen('O1', 'rim', 'O5'))], /No established screen/],
    [[screen('O5', 'X1'), together(cutOffScreen('O1', 'rim', 'O5'), move({ O5: 'rim' }))], /must stay set/],
    [[together(move({ O2: 'right-slot' }), pass('O2'))], /Cannot run pass/],
  ]) assert.throws(() => compileSequence(example, { setup: SPREAD, owner: 'O1', steps: [commands] }), pattern);
  const blocker = results.get('Blocker-Mover'); if (blocker) {
    const phase = blocker.frames[1].phases.find(item => item.concurrent && item.routes.O2 && distance(item.previous.O2, item.offense.O2) > 6);
    expect(Boolean(phase && distance(phase.previous.O3, phase.offense.O3) > 6), 'Blocker-Mover: both sides must cut during one phase');
    expect(/while/.test(blocker.frames[1].text), 'Blocker-Mover: description must explain simultaneous action');
    const preceding = blocker.frames[1].phases[0];
    expect(preceding.screens.length >= 2 && phase.startScreens.length >= 2, 'Blocker-Mover: both setters must be established before either cut');
  }
  for (const [name, index, handler, setter] of [
    ['Basic Pick-and-Roll', 3, 'O1', 'O5'], ['Pick-and-Pop', 2, 'O1', 'O5'],
    ['Flat Pick-and-Roll', 3, 'O1', 'O5'], ['Zipper Pick-and-Roll', 5, 'O2', 'O5'],
    ['Drag Screen', 3, 'O1', 'O5'], ['Zoom → Pick-and-Roll', 3, 'O2', 'O4'],
  ]) {
    const result = results.get(name); if (!result) continue;
    const frame = result.frames[index], phase = frame.phases[0];
    expect(distance(phase.previous[handler], phase.previous[setter]) >= 49, `${name}: handler must clear the screen before the release`);
    expect(distance(phase.previous[handler], phase.offense[handler]) > 10 && distance(phase.previous[setter], phase.offense[setter]) > 10, `${name}: downhill dribble and release must run together`);
    const mid = samplePose(frame, frame.routes, phase.duration * .5 / frame.duration);
    expect(distance(mid.actors[handler], phase.previous[handler]) > 3 && distance(mid.actors[setter], phase.previous[setter]) > 3, `${name}: both players must be moving during the shared phase`);
    expect(/while/.test(frame.text), `${name}: explain the dribble and release occurring together`);
  }
  expect(handoffs.length === 0, `${handoffs.length} handoffs exceed receiving reach`);
  expect(collisions.length === 0, `${collisions.length} phases have overlapping token bodies`);
  const report = { counts, coverage, errors, handoffs, collisions, distantScreenExamples: screenDistances.filter(item => item.gap > 150) };
  const reportPath = process.env.SWISHIQ_PLAYBOOK_REPORT || path.join(os.tmpdir(), 'swishiq-playbook-animation-check.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ counts, errors: errors.slice(0, 30), handoffs, collisions: collisions.map(({ where, pair, gap }) => ({ where, pair, gap })), reportPath }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { hooks.deregister(); }

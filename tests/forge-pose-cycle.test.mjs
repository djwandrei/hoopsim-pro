import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { OrthographicCamera, Vector3 } from 'three';
import { project, windowlessEnvironment, saveRuntimeReview } from './helpers/forge-windowless-env.js';

const { loadForgeAthlete } = await import('../src/components/forge/forgeAthleteAssets.js');
const { FORGE_ATHLETE_RELEASE: release } = await import('../src/components/forge/forgeAthleteRelease.js');
const { FORGE_POSE_RELEASE } = await import('../src/components/forge/forgePoseRelease.js');
const { createForgePoseCycle } = await import('../src/components/forge/forgePoseCycle.js');
const { createForgeAnchorProjector } = await import('../src/components/forge/forgeStageConnections.js');
const { frameReferenceCamera } = await import('../src/components/forge/referenceView.js');
const { default: wardrobe } = await import('../src/components/forge/forgeAthleteWardrobe.js');
const environment = windowlessEnvironment();
const fullInterval = Math.PI * 4;

test('pose asset corruption retries, and the cycle rejects a different model before moving joints', async () => {
  environment.corrupt(FORGE_POSE_RELEASE.path);
  await assert.rejects(loadForgeAthlete(), /integrity check/);
  environment.recover(FORGE_POSE_RELEASE.path);
  const { model, rig, poses } = await loadForgeAthlete();
  const before = model.getObjectByName('right_wrist').quaternion.clone();
  const invalid = structuredClone(poses); invalid.modelSha256 = 'wrong';
  assert.throws(() => createForgePoseCycle(model, rig, invalid, release), /does not match/);
  assert.deepEqual(model.getObjectByName('right_wrist').quaternion.toArray(), before.toArray());
});

test('two actual turns advance dunk, jump shot, dribble and repeat while wardrobe and markers follow', async () => {
  const { model, rig, poses } = await loadForgeAthlete(), controller = wardrobe(model);
  try {
    const geometry = model.getObjectByName('jersey').geometry;
    const cycle = createForgePoseCycle(model, rig, poses, release);
    const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 60);
    camera.position.set(-8.09, .205, 5.93); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    frameReferenceCamera(camera, 504, 560, cycle.fit);
    const anchors = createForgeAnchorProjector(model);
    const refresh = () => { model.updateMatrixWorld(true); model.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); }); };
    assert.equal(cycle.id, 'dunk');
    cycle.advance(Math.PI * 2, 1); assert.equal(cycle.id, 'dunk');
    // Zero delta is the same path as a paused, offscreen, or reduced-motion view.
    const paused = model.getObjectByName('right_wrist').quaternion.clone();
    cycle.advance(0, 60); assert.deepEqual(model.getObjectByName('right_wrist').quaternion.toArray(), paused.toArray());
    const picks = Object.fromEntries(['scoring', 'rebounding', 'decision', 'jumpShot', 'finishing', 'perimeterDefense', 'playmaking'].map(key => [key, { value: 80, player: { teamCode: 'DAL' } }]));
    await controller.update(picks, { jersey: 'icon', shorts: 'icon' });
    const material = model.getObjectByName('jersey').material;
    const directory = process.env.FORGE_POSE_REVIEW ? path.join(project, 'docs/forge-pose-cycle/runtime-review') : null;
    if (directory) await saveRuntimeReview(model, 'dunk', directory);
    cycle.advance(Math.PI * 2, 1); assert.equal(cycle.id, 'jump-shot'); refresh();
    assert.equal(model.getObjectByName('basketball').visible, true);
    const shootingAnchor = anchors(camera).jumpShot;
    assert.ok(shootingAnchor.visible);
    if (directory) await saveRuntimeReview(model, 'jump-shot', directory);
    cycle.advance(fullInterval, 1); assert.equal(cycle.id, 'dribble'); refresh();
    assert.equal(model.getObjectByName('basketball').visible, true);
    await controller.update(picks, { jersey: 'icon', shorts: 'icon' });
    assert.equal(model.getObjectByName('basketball').visible, true, 'Wardrobe edits retain the dribbling ball');
    for (const target of Object.values(anchors(camera))) assert.ok(target.visible && Number.isFinite(target.x) && Number.isFinite(target.y));
    assert.ok(Math.abs(anchors(camera).jumpShot.y - shootingAnchor.y) > .1);
    assert.equal(model.getObjectByName('jersey').geometry, geometry);
    assert.equal(model.getObjectByName('jersey').material, material);
    if (directory) await saveRuntimeReview(model, 'dribble', directory);
    cycle.advance(fullInterval, .2); assert.equal(cycle.id, 'dunk');
    assert.equal(model.getObjectByName('basketball').visible, true, 'The ball remains visible through the return to dunk');
    cycle.advance(.01, 1); refresh();
    assert.equal(model.getObjectByName('basketball').visible, true);
  } finally { controller.dispose(); }
});

test.after(() => environment.restore());

test('the visible ball remains in the fitted frame during every pose transition', async () => {
  const { model, rig, poses } = await loadForgeAthlete();
  const cycle = createForgePoseCycle(model, rig, poses, release);
  const ball = model.getObjectByName('basketball');
  for (let target = 0; target < 3; target++) {
    cycle.advance(fullInterval, .05);
    for (let frame = 0; frame < 18; frame++) {
      cycle.advance(.001, .05); model.updateMatrixWorld(true);
      const center = ball.getWorldPosition(new Vector3());
      assert.equal(ball.visible, true);
      assert.ok(Math.abs(center.y) + .119 < cycle.fit.halfY, 'ball height stays inside the fitted camera');
      assert.ok(Math.hypot(center.x, center.z) + .119 < cycle.fit.sweep, 'ball stays inside the full-turn sweep');
      for (const name of ['right-arm', 'left-arm', 'right-sleeve', 'left-sleeve']) {
        const influences = model.getObjectByName(name).morphTargetInfluences;
        assert.ok(influences.every(value => Number.isFinite(value) && value >= 0));
        assert.ok(Math.abs(influences.reduce((sum, value) => sum + value, 0) - 1) < 1e-6);
      }
    }
  }
});

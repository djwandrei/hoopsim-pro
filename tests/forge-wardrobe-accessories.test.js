import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { windowlessEnvironment, digest } from './helpers/forge-windowless-env.js';

const { loadForgeAthlete } = await import('../src/components/forge/forgeAthleteAssets.js');
const { default: wardrobe } = await import('../src/components/forge/forgeAthleteWardrobe.js');
const { normalizeForgeAppearance } = await import('../src/components/forge/forgeWardrobeRules.js');
const { forgeBuildQuery, decodeForgeBuild } = await import('../src/components/forge/forgeReceipt.js');
const environment = windowlessEnvironment();
const pick = teamCode => ({ player: { teamCode }, value: 80 });
const all = { scoring: pick('LAL'), rebounding: pick('BOS'), decision: pick('CHI'), jumpShot: pick('GSW'), finishing: pick('DAL'), playmaking: pick('NYK'), perimeterDefense: pick('MIA') };
const textureHash = mesh => digest(mesh.material.map.image.toBuffer('image/png'));

test('fitted accessories follow the authored skin without changing the source mesh', async () => {
  const { model } = await loadForgeAthlete();
  const body = model.getObjectByName('featureless_body'), original = digest(Buffer.from(body.geometry.attributes.position.array.buffer));
  const controller = wardrobe(model);
  await controller.update(all, {});
  for (const name of ['wristband', 'knee-sleeve']) {
    const mesh = model.getObjectByName(name), count = mesh.geometry.attributes.position.count;
    assert.ok(mesh.isSkinnedMesh && mesh.visible && count > 100);
    assert.deepEqual(mesh.skeleton.bones, body.skeleton.bones);
    const before = mesh.getVertexPosition(0, new Vector3());
    const bone = model.getObjectByName(name === 'wristband' ? 'left_elbow' : 'right_knee');
    bone.rotation.x += .15; model.updateMatrixWorld(true); mesh.skeleton.update();
    assert.ok(before.distanceTo(mesh.getVertexPosition(0, new Vector3())) > .001);
    for (let index = 0; index < count; index++) {
      const weights = mesh.geometry.attributes.skinWeight;
      assert.ok(Math.abs([0, 1, 2, 3].reduce((sum, slot) => sum + weights.getComponent(index, slot), 0) - 1) < 1e-6);
      assert.ok(mesh.getVertexPosition(index, new Vector3()).toArray().every(Number.isFinite));
    }
  }
  assert.equal(digest(Buffer.from(body.geometry.attributes.position.array.buffer)), original);
  let geometryDisposed = 0;
  for (const name of ['wristband', 'knee-sleeve']) model.getObjectByName(name).geometry.addEventListener('dispose', () => geometryDisposed++);
  controller.dispose();
  assert.equal(geometryDisposed, 2); assert.equal(model.getObjectByName('wristband'), undefined);
});

test('donors unlock distinct accessories and matching shoes; old team overrides cannot recolor uniforms', async () => {
  const { model } = await loadForgeAthlete(), controller = wardrobe(model);
  const mesh = name => model.getObjectByName(name);
  await controller.update({ scoring: all.scoring, jumpShot: all.jumpShot }, {});
  assert.equal(mesh('right-sleeve').visible, true); assert.equal(mesh('left-sleeve').visible, false);
  assert.equal(mesh('wristband').visible, false); assert.equal(mesh('knee-sleeve').visible, false);
  await controller.update(all, {});
  const jersey = textureHash(mesh('jersey')), shorts = textureHash(mesh('shorts')), shoes = textureHash(mesh('left-shoe'));
  assert.equal(textureHash(mesh('left-shoe')), textureHash(mesh('right-shoe')));
  assert.equal(mesh('wristband').visible, true); assert.equal(mesh('knee-sleeve').visible, true);
  await controller.update(all, {}, { uniformTeamCode: 'TOR', leftSleeve: true, wristband: false, kneeSleeve: false, rightSleeve: false, shoeTeamCode: 'DAL' });
  assert.equal(textureHash(mesh('jersey')), jersey); assert.equal(textureHash(mesh('shorts')), shorts);
  assert.equal(textureHash(mesh('left-shoe')), shoes);
  assert.equal(textureHash(mesh('left-shoe')), textureHash(mesh('right-shoe')));
  for (const name of ['wristband', 'knee-sleeve', 'right-sleeve', 'left-sleeve']) assert.equal(mesh(name).visible, false);
  await controller.update({ ...all, perimeterDefense: undefined, finishing: undefined }, {});
  assert.equal(mesh('wristband').visible, false); assert.equal(mesh('knee-sleeve').visible, false);
  controller.dispose();
});

test('saved builds preserve the new toggles and discard retired wardrobe overrides', () => {
  const legacy = { uniformTeamCode: 'TOR', shoeTeamCode: 'DAL', leftSleeve: true, rightSleeve: false, wristband: false, kneeSleeve: false, bodyColor: 'warm' };
  assert.ok(!Object.hasOwn(normalizeForgeAppearance(legacy), 'uniformTeamCode'));
  assert.ok(!Object.hasOwn(normalizeForgeAppearance(legacy), 'shoeTeamCode'));
  const query = forgeBuildQuery({ mode: 'wheel', year: 2025, picks: { scoring: ['player_1', 80] }, appearance: legacy });
  const restored = decodeForgeBuild(query);
  assert.ok(restored);
  assert.deepEqual(restored.appearance, normalizeForgeAppearance(legacy));
  assert.equal(normalizeForgeAppearance({ leftSleeve: false }).kneeSleeve, true);
});

test.after(() => environment.restore());

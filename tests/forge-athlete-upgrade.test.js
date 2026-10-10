import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetRoot, project, digest, windowlessEnvironment, saveRuntimeReview } from './helpers/forge-windowless-env.js';

const { FORGE_ATHLETE_RELEASE: release } = await import('../src/components/forge/forgeAthleteRelease.js');
const { loadForgeAthlete, loadUniformCatalog } = await import('../src/components/forge/forgeAthleteAssets.js');
const { applyForgeDunk } = await import('../src/components/forge/forgeAthleteBinding.js');
const { default: wardrobe } = await import('../src/components/forge/forgeAthleteWardrobe.js');
const { WARDROBE_SKILLS, DEFAULT_WARDROBE_EDITIONS, wardrobeTeam } = await import('../src/components/forge/forgeWardrobeRules.js');
const environment = windowlessEnvironment();
const picks = codes => Object.fromEntries(Object.entries(codes).map(([skill, code]) => [skill, { player: { teamCode: code }, value: 80 }]));
const records = model => { const map = new Map(); model.traverse(mesh => { if (mesh.isMesh) map.set(mesh.geometry.name || mesh.name, mesh); }); return map; };
const dark = mesh => mesh.material.customProgramCacheKey() === 'forge-reference-silhouette-v2';
const complete = picks({ scoring: 'LAL', rebounding: 'BOS', decision: 'CHI', jumpShot: 'GSW', playmaking: 'NYK', perimeterDefense: 'MIA', finishing: 'DAL', clutch: 'MIN', body: 'BOS', rimProtection: 'DEN' });

test('matched refined assets load through the real Three.js pipeline; corrupt releases retry safely', async () => {
  environment.corrupt(release.rig.path);
  await assert.rejects(loadForgeAthlete(), /integrity check/);
  environment.recover(release.rig.path);
  const first = await loadForgeAthlete(), second = await loadForgeAthlete();
  assert.ok(first.fit.halfY > 1 && first.fit.halfY < 2);
  assert.ok(first.fit.sweep > .5 && Number.isFinite(first.fit.sweep));
  const meshes = records(first.model);
  assert.equal(meshes.size, 13);
  assert.equal([...meshes.values()].reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0), release.triangles);
  for (const mesh of meshes.values()) if (mesh.isSkinnedMesh) assert.equal(mesh.skeleton.bones.length, 47);
  assert.notEqual(first.model.getObjectByName('waist'), second.model.getObjectByName('waist'));
  assert.notEqual(first.model.getObjectByName('jersey').material, second.model.getObjectByName('jersey').material);
  assert.equal(first.model.getObjectByName('jersey').geometry, second.model.getObjectByName('jersey').geometry);
  assert.equal(environment.requests.filter(url => url === release.model.path).length, 2); // failed load plus successful cache fill
  assert.equal(first.model.getObjectByName('basketball').position.distanceTo(second.model.getObjectByName('basketball').position), 0);
});

test('binding rejects a different pose or skeleton before changing the model', async () => {
  const bytes = await readFile(path.join(assetRoot, release.model.path));
  const rig = JSON.parse(await readFile(path.join(assetRoot, release.rig.path), 'utf8'));
  const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const before = source.scene.getObjectByName('right_wrist').position.clone();
  const changed = structuredClone(rig); changed.pose.translations.at(-1)[0] = NaN;
  assert.throws(() => applyForgeDunk(source.scene, changed, release), /does not match/);
  assert.deepEqual(source.scene.getObjectByName('right_wrist').position, before);
  changed.pose.translations.at(-1)[0] = 0; changed.bones[38].parent = 8;
  assert.throws(() => applyForgeDunk(source.scene, changed, release), /does not match/);
  assert.deepEqual(source.scene.getObjectByName('right_wrist').position, before);
  applyForgeDunk(source.scene, rig, release);
  const jersey = source.scene.getObjectByName('jersey');
  for (const index of [0, Math.floor(jersey.geometry.attributes.position.count / 2), jersey.geometry.attributes.position.count - 1]) {
    const vertex = jersey.getVertexPosition(index, new Vector3()).applyMatrix4(jersey.matrixWorld);
    assert.ok(vertex.toArray().every(Number.isFinite));
  }
});

test('both draft modes retain progressive donor unlocks, independent editions, undo and restart', async () => {
  assert.deepEqual(WARDROBE_SKILLS, { jersey: 'scoring', shorts: 'rebounding', headband: 'decision', 'right-sleeve': 'jumpShot', wristband: 'finishing', 'knee-sleeve': 'perimeterDefense', 'left-shoe': 'playmaking', 'right-shoe': 'playmaking' });
  const { model } = await loadForgeAthlete(), controller = wardrobe(model);
  const meshes = Object.fromEntries([...model.children].filter(mesh => mesh.isMesh).map(mesh => [mesh.geometry.name || mesh.name, mesh]));
  // Three names geometry by mesh; retain material identities while we inspect.
  const byName = name => meshes[name] || model.getObjectByName(name === 'body' ? 'featureless_body' : name);
  const review = process.env.FORGE_REVIEW_DIR;
  await controller.update({}, DEFAULT_WARDROBE_EDITIONS);
  assert.ok(dark(byName('jersey'))); assert.equal(byName('headband').visible, false); assert.equal(byName('right-sleeve').visible, false);
  if (review) await saveRuntimeReview(model, 'empty', review);
  await controller.update(picks({ scoring: 'LAL' }), DEFAULT_WARDROBE_EDITIONS);
  assert.equal(byName('jersey').material.map.image.width, 2048); assert.ok(dark(byName('shorts')));
  const jerseyTexture = byName('jersey').material.map;
  await controller.update(picks({ scoring: 'LAL', rebounding: 'BOS', decision: 'CHI' }), DEFAULT_WARDROBE_EDITIONS);
  assert.equal(byName('jersey').material.map, jerseyTexture); assert.equal(byName('headband').visible, true); assert.equal(byName('right-sleeve').visible, false);
  if (review) await saveRuntimeReview(model, 'partial', review);
  await controller.update(complete, DEFAULT_WARDROBE_EDITIONS);
  assert.equal(byName('right-sleeve').visible, true); assert.equal(byName('left-sleeve').visible, false);
  assert.ok(!dark(byName('basketball'))); assert.ok(dark(byName('head-neck')) && dark(byName('right-arm')));
  assert.equal(byName('left-shoe').material.map.image.width, 1024);
  assert.equal(digest(byName('left-shoe').material.map.image.toBuffer('image/png')), digest(byName('right-shoe').material.map.image.toBuffer('image/png')));
  const shortsTexture = byName('shorts').material.map;
  await controller.update(complete, { jersey: 'association', shorts: 'icon' });
  assert.notEqual(byName('jersey').material.map, jerseyTexture); assert.equal(byName('shorts').material.map, shortsTexture);
  if (review) await saveRuntimeReview(model, 'complete', review);
  const undone = { ...complete }; delete undone.scoring; delete undone.decision; delete undone.finishing;
  await controller.update(undone, DEFAULT_WARDROBE_EDITIONS);
  assert.ok(dark(byName('jersey'))); assert.equal(byName('headband').visible, false); assert.ok(!dark(byName('basketball')));
  assert.equal(byName('wristband').visible, false); assert.equal(byName('knee-sleeve').visible, true);
  assert.equal(byName('shorts').material.map, shortsTexture);
  await controller.update({}, DEFAULT_WARDROBE_EDITIONS);
  for (const [name, mesh] of Object.entries(meshes)) if (name !== 'basketball') assert.ok(dark(mesh));
  assert.equal(byName('wristband').visible, false); assert.equal(byName('knee-sleeve').visible, false);
  controller.dispose();
});

test('late uniform loads cannot repaint an undo or a newer donor', async () => {
  const { model } = await loadForgeAthlete(), controller = wardrobe(model), jersey = model.getObjectByName('jersey');
  environment.slowImages('orlando');
  const oldLoad = controller.update(picks({ scoring: 'ORL' }), DEFAULT_WARDROBE_EDITIONS);
  await controller.update({}, DEFAULT_WARDROBE_EDITIONS); await oldLoad;
  assert.ok(dark(jersey));
  const stale = controller.update(picks({ scoring: 'ORL' }), { jersey: 'statement' });
  await controller.update(picks({ scoring: 'SAC' }), { jersey: 'association' });
  const latest = jersey.material.map; await stale; assert.equal(jersey.material.map, latest);
  controller.dispose(); environment.slowImages('');
});

test('all 90 original uniform designs and every declared image remain available', async () => {
  const catalog = await loadUniformCatalog(); assert.equal(catalog.items.length, 90);
  assert.equal(new Set(catalog.teams.map(team => wardrobeTeam(team.code))).size, 30);
  let count = 0, fallbackPanels = 0;
  for (const item of catalog.items) for (const key of ['image', 'front', 'back']) {
    if (!item[key]) { assert.notEqual(key, 'image'); fallbackPanels++; continue; }
    assert.ok((await readFile(path.join(assetRoot, item[key]))).length > 1000); count++;
  }
  assert.equal(count, 270); assert.equal(fallbackPanels, 0);
  const root = path.join(project, 'docs/forge-athlete-800k'); await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'validation.json'), JSON.stringify({ status: 'passed', triangles: release.triangles, controls: release.controls, modelSha256: release.model.sha256, rigSha256: release.rig.sha256, uniformDesigns: 90, uniformImages: count, existingFallbackPanels: fallbackPanels,
    checks: ['actual GLTFLoader and SkeletonUtils clones', 'rig and model integrity plus retry', 'all material/element names', 'donor unlocks', 'independent garment editions', 'undo/restart', 'late load cancellation', 'body remains silhouette'],
    scope: 'Windowless Three.js and real local 2D texture rendering; no app/browser/GPU visual check', deployed: false, archivesRebuilt: false }, null, 2) + '\n');
});

test.after(() => environment.restore());

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MathUtils, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetRoot, digest, windowlessEnvironment } from './helpers/forge-windowless-env.js';

const { FORGE_ATHLETE_RELEASE: release } = await import('../src/components/forge/forgeAthleteRelease.js');
const { FORGE_POSE_RELEASE } = await import('../src/components/forge/forgePoseRelease.js');
const { loadForgeAthlete } = await import('../src/components/forge/forgeAthleteAssets.js');
const { createForgePoseCycle } = await import('../src/components/forge/forgePoseCycle.js');
const environment = windowlessEnvironment();
const BASE_MODEL = 'basketball-athlete-outfit-2e4b44a67c3c.glb';
const POSE_INTERVAL = Math.PI * 4;
const CORRECTED_MESHES = ['right-arm', 'left-arm', 'right-sleeve', 'left-sleeve'];

const meshMap = root => {
  const result = new Map();
  root.traverse(mesh => { if (mesh.isMesh) result.set(mesh.name, mesh); });
  return result;
};

const bytesOf = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

async function parseGlb(file) {
  const bytes = await readFile(file);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function updateSkin(model) {
  model.updateMatrixWorld(true);
  model.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
}

function radialSectionArea(mesh, model, side) {
  const elbow = model.getObjectByName(`${side}_elbow`).getWorldPosition(new Vector3());
  const wrist = model.getObjectByName(`${side}_wrist`).getWorldPosition(new Vector3());
  const axis = wrist.sub(elbow).normalize();
  const point = new Vector3();
  let squaredRadius = 0, count = 0;
  const position = mesh.geometry.attributes.position;
  for (let index = 0; index < position.count; index++) {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
    const relative = point.sub(elbow);
    const along = relative.dot(axis);
    if (Math.abs(along) > .025) continue;
    const radiusSquared = Math.max(0, relative.lengthSq() - along * along);
    if (radiusSquared > .095 * .095) continue;
    squaredRadius += radiusSquared;
    count++;
  }
  assert.ok(count > 10, `${mesh.name} must have enough elbow vertices for a cross-section`);
  return Math.PI * squaredRadius / count;
}

function applyPose(model, rig, pose) {
  const nodes = rig.bones.map(bone => model.getObjectByName(bone.name));
  const axis = new Vector3(), turn = new Quaternion();
  nodes.forEach((node, index) => {
    const bone = rig.bones[index];
    const parent = bone.parent < 0 ? [0, 0, 0] : rig.bones[bone.parent].pivot;
    node.position.set(
      bone.pivot[0] - parent[0] + pose.translations[index][0],
      bone.pivot[1] - parent[1] + pose.translations[index][1],
      bone.pivot[2] - parent[2] + pose.translations[index][2],
    );
    node.quaternion.identity();
    bone.axes.forEach((direction, slot) => node.quaternion.multiply(turn.setFromAxisAngle(
      axis.fromArray(direction), MathUtils.degToRad(pose.rotations[index][slot]),
    )));
  });
}

function minimumWorldY(mesh) {
  const point = new Vector3();
  let minimum = Infinity;
  for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
    minimum = Math.min(minimum, point.y);
  }
  return minimum;
}

test('arm derivative preserves the authored head and skin data while keeping the jersey budget', async () => {
  const originalBytes = await readFile(path.join(assetRoot, BASE_MODEL));
  assert.equal(digest(originalBytes), release.armRefinement.baseModelSha256, 'the pinned derivative source must be the authored 800k asset');
  const [original, current] = await Promise.all([
    parseGlb(path.join(assetRoot, BASE_MODEL)),
    loadForgeAthlete(),
  ]);
  const originalMeshes = meshMap(original.scene), currentMeshes = meshMap(current.model);
  const headBefore = originalMeshes.get('head-neck'), headAfter = currentMeshes.get('head-neck');
  assert.ok(headBefore && headAfter);
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    assert.ok(headBefore.geometry.attributes[name] && headAfter.geometry.attributes[name], `head-neck ${name} attribute exists`);
    assert.ok(bytesOf(headBefore.geometry.attributes[name].array).equals(bytesOf(headAfter.geometry.attributes[name].array)), `head-neck ${name} bytes stay exact`);
  }
  assert.ok(headBefore.geometry.index && headAfter.geometry.index);
  assert.ok(bytesOf(headBefore.geometry.index.array).equals(bytesOf(headAfter.geometry.index.array)), 'head-neck index bytes stay exact');

  for (const [name, mesh] of currentMeshes) {
    if (!mesh.isSkinnedMesh) continue;
    assert.equal(mesh.skeleton.bones.length, release.skinJoints, `${name} uses the authored skeleton`);
    const weights = mesh.geometry.attributes.skinWeight;
    const indices = mesh.geometry.attributes.skinIndex;
    assert.equal(weights.itemSize, 4);
    assert.equal(indices.count, weights.count);
    for (let vertex = 0; vertex < weights.count; vertex++) {
      let sum = 0;
      for (let slot = 0; slot < 4; slot++) {
        const weight = weights.getComponent(vertex, slot);
        assert.ok(Number.isFinite(weight) && weight >= 0, `${name} vertex ${vertex} has valid weight`);
        assert.ok(indices.getComponent(vertex, slot) < mesh.skeleton.bones.length, `${name} vertex ${vertex} uses a valid joint`);
        sum += weight;
      }
      assert.ok(Math.abs(sum - 1) < 1e-5, `${name} vertex ${vertex} weights sum to one`);
    }

    // Arm shaping adds morph deltas without rewriting bind weights. Jersey
    // subdivision is the only operation that creates new skin rows.
    if (name === 'jersey') continue;
    const before = originalMeshes.get(name);
    assert.ok(before, `original ${name} mesh exists`);
    for (const attribute of ['skinIndex', 'skinWeight']) {
      assert.ok(bytesOf(before.geometry.attributes[attribute].array).equals(bytesOf(mesh.geometry.attributes[attribute].array)), `${name} ${attribute} bytes stay exact`);
    }
  }

  const triangles = [...currentMeshes.values()].reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
  assert.equal(release.triangles, 967181);
  assert.equal(triangles, release.triangles, 'the subdivided jersey stays within the reviewed triangle budget');
});

test('jump-shot correctives restore elbow radial area without changing the skin transforms', async () => {
  const { model, rig, poses } = await loadForgeAthlete();
  assert.deepEqual(poses.poses.map(pose => pose.id), ['dunk', 'jump-shot', 'dribble']);
  assert.deepEqual(release.armRefinement.correctives, ['dunk', 'jump-shot', 'dribble']);
  for (const item of poses.poses) {
    assert.equal(item.pose.ballAttached, true, `${item.id} keeps the ball attached`);
    assert.equal(item.pose.ballVisible, true, `${item.id} keeps the ball visible`);
  }

  const arms = meshMap(model);
  for (const name of CORRECTED_MESHES) {
    const mesh = arms.get(name);
    assert.ok(mesh?.morphTargetDictionary && mesh.morphTargetInfluences, `${name} has live corrective targets`);
    assert.deepEqual(Object.keys(mesh.morphTargetDictionary).sort(), ['dunk', 'dribble', 'jump-shot'].sort());
    for (const targetName of ['dunk', 'jump-shot', 'dribble']) {
      const target = mesh.geometry.morphAttributes.position[mesh.morphTargetDictionary[targetName]];
      assert.ok(target, `${name} has the ${targetName} position target`);
      const displacement = target.array.reduce((sum, value) => sum + value * value, 0);
      assert.ok(displacement > 1e-10, `${name} ${targetName} corrective is nonempty`);
    }
  }

  const cycle = createForgePoseCycle(model, rig, poses, release);
  cycle.advance(POSE_INTERVAL, 1);
  assert.equal(cycle.id, 'jump-shot');
  updateSkin(model);
  for (const name of CORRECTED_MESHES) {
    const mesh = arms.get(name);
    assert.equal(mesh.morphTargetInfluences[mesh.morphTargetDictionary['jump-shot']], 1, `${name} applies the shot target`);
  }

  const rightArm = arms.get('right-arm');
  const matricesWithCorrective = Array.from(rightArm.skeleton.boneMatrices);
  const areaWithCorrective = radialSectionArea(rightArm, model, 'right');
  for (const name of CORRECTED_MESHES) arms.get(name).morphTargetInfluences.fill(0);
  updateSkin(model);
  const matricesWithoutCorrective = Array.from(rightArm.skeleton.boneMatrices);
  const areaWithoutCorrective = radialSectionArea(rightArm, model, 'right');
  assert.deepEqual(matricesWithCorrective, matricesWithoutCorrective, 'morphs do not change the skin matrices or their blend determinants');
  for (const name of CORRECTED_MESHES) {
    const mesh = arms.get(name);
    mesh.morphTargetInfluences[mesh.morphTargetDictionary['jump-shot']] = 1;
  }
  updateSkin(model);
  const restoredArea = radialSectionArea(rightArm, model, 'right');
  assert.ok(restoredArea > areaWithoutCorrective, `shot elbow radial area improves (${areaWithoutCorrective} -> ${restoredArea})`);
});

test('pose-cycle morph influences stay independent between athlete clones', async () => {
  const [first, second] = await Promise.all([loadForgeAthlete(), loadForgeAthlete()]);
  const firstCycle = createForgePoseCycle(first.model, first.rig, first.poses, release);
  const secondCycle = createForgePoseCycle(second.model, second.rig, second.poses, release);
  const firstArm = first.model.getObjectByName('right-arm'), secondArm = second.model.getObjectByName('right-arm');
  assert.notEqual(firstArm.morphTargetInfluences, secondArm.morphTargetInfluences);
  firstCycle.advance(POSE_INTERVAL, 1);
  assert.equal(firstCycle.id, 'jump-shot');
  assert.equal(secondCycle.id, 'dunk');
  secondCycle.advance(POSE_INTERVAL * 2, 1);
  assert.equal(secondCycle.id, 'dribble');
  assert.equal(firstArm.morphTargetInfluences[firstArm.morphTargetDictionary['jump-shot']], 1);
  assert.equal(secondArm.morphTargetInfluences[secondArm.morphTargetDictionary.dribble], 1);
});

test('additional defense pose keeps the athletic lean and both soles planted', async () => {
  const { model, rig, poses } = await loadForgeAthlete();
  const defense = poses.additionalPoses?.find(item => item.id === 'defense');
  assert.ok(defense, 'the defense pose remains available outside the three-pose cycle');
  assert.equal(defense.pose.ballAttached, true);
  assert.equal(defense.pose.ballVisible, false);
  assert.equal(defense.pose.rotations.length, rig.bones.length);
  assert.equal(defense.pose.translations.length, rig.bones.length);
  assert.ok(defense.pose.rotations.every(row => row.every(Number.isFinite)));
  assert.ok(defense.pose.translations.every(row => row.every(Number.isFinite)));

  const indexOf = name => rig.bones.findIndex(bone => bone.name === name);
  const rightKnee = defense.pose.rotations[indexOf('right_knee')][0];
  const leftKnee = defense.pose.rotations[indexOf('left_knee')][0];
  assert.ok(rightKnee > 35 && rightKnee < 75);
  assert.ok(leftKnee > 35 && leftKnee < 75);
  assert.ok(Math.abs(rightKnee - leftKnee) < .01, 'defensive knee flexion stays symmetric');
  assert.ok(defense.pose.rotations[indexOf('spine')][0] > 5, 'the stance retains a forward athletic lean');
  assert.ok(defense.pose.rotations[indexOf('chest')][0] > 5, 'the upper body follows the lean');

  model.position.set(0, 0, 0);
  for (const name of CORRECTED_MESHES) model.getObjectByName(name).morphTargetInfluences.fill(0);
  applyPose(model, rig, defense.pose);
  updateSkin(model);
  const rightSole = minimumWorldY(model.getObjectByName('right-shoe'));
  const leftSole = minimumWorldY(model.getObjectByName('left-shoe'));
  assert.ok(Math.abs(rightSole) < .005, `right sole stays at the floor (${rightSole})`);
  assert.ok(Math.abs(leftSole) < .005, `left sole stays at the floor (${leftSole})`);
});

test.after(() => environment.restore());

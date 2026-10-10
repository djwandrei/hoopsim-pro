import { Box3, MathUtils, Quaternion, Vector3 } from 'three';

const FULL_TURN = Math.PI * 2;
const TRANSITION_SECONDS = .85;
const IDS = ['dunk', 'jump-shot', 'dribble'];
const vector = row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite);
// A verified catalog is shared by clones of the same immutable release. Scan
// the full mesh once, then reuse only the bounds and centers across viewers.
const fittedCatalogs = new WeakMap();

// Animate the existing skeleton and ball attachment; garment/accessory skin
// weights follow the same joints. No geometry is rebuilt between poses.
export function createForgePoseCycle(model, rig, catalog, release) {
  const fail = () => { throw new Error('The athlete pose cycle does not match this model. Retry the athlete assets.'); };
  if (catalog.version !== 1 || catalog.modelSha256 !== release.model.sha256 || catalog.sourceSha256 !== release.sourceSha256 ||
      catalog.controls !== release.controls || catalog.rotationsPerPose !== 2 || catalog.poses?.length !== IDS.length) fail();
  const nodes = rig.bones.map(bone => model.getObjectByName(bone.name));
  if (nodes.length !== release.controls || nodes.some(node => !node)) fail();
  const axis = new Vector3(), turn = new Quaternion();
  const targets = catalog.poses.map((item, at) => {
    const pose = item.pose;
    if (item.id !== IDS[at] || !pose || pose.rotations?.length !== nodes.length || pose.translations?.length !== nodes.length ||
        !pose.rotations.every(vector) || !pose.translations.every(vector) || pose.ballAttached !== true || typeof pose.ballVisible !== 'boolean') fail();
    return {
      id: item.id, label: item.label, ballVisible: pose.ballVisible,
      positions: rig.bones.map((bone, index) => new Vector3(...bone.pivot)
        .sub(bone.parent < 0 ? new Vector3() : new Vector3(...rig.bones[bone.parent].pivot)).add(new Vector3(...pose.translations[index]))),
      rotations: rig.bones.map((bone, index) => {
        const quaternion = new Quaternion();
        bone.axes.forEach((direction, slot) => quaternion.multiply(turn.setFromAxisAngle(axis.fromArray(direction), MathUtils.degToRad(pose.rotations[index][slot]))));
        return quaternion;
      }),
      center: new Vector3(),
    };
  });
  const ball = model.getObjectByName('basketball');
  if (!ball) fail();
  const correctiveMeshes = [];
  if (release.armRefinement) {
    for (const name of ['right-arm', 'left-arm', 'right-sleeve', 'left-sleeve']) {
      const mesh = model.getObjectByName(name);
      if (!mesh?.morphTargetInfluences || IDS.some(id => !Number.isInteger(mesh.morphTargetDictionary?.[id]))) fail();
      correctiveMeshes.push(mesh);
    }
  }
  const correctArms = (from, to = from, blend = 1) => {
    for (const mesh of correctiveMeshes) {
      mesh.morphTargetInfluences.fill(0);
      mesh.morphTargetInfluences[mesh.morphTargetDictionary[from]] += 1 - blend;
      mesh.morphTargetInfluences[mesh.morphTargetDictionary[to]] += blend;
    }
  };
  const updateMatrices = () => {
    model.updateMatrixWorld(true);
    model.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  };
  const apply = target => {
    nodes.forEach((node, index) => { node.position.copy(target.positions[index]); node.quaternion.copy(target.rotations[index]); });
    correctArms(target.id);
    model.position.copy(target.center);
    model.userData.forgeBallVisible = target.ballVisible; ball.visible = target.ballVisible;
    updateMatrices();
  };
  // Measure each complete pose once at load time. One fixed camera envelope
  // avoids a camera jump at each switch and contains the complete turn.
  let fitted = fittedCatalogs.get(catalog);
  if (!fitted) {
    const fit = { halfY: 0, sweep: 0 };
    for (const target of targets) {
      apply(target);
      const box = new Box3();
      model.traverse(mesh => { if (mesh.isMesh && (mesh !== ball || target.ballVisible)) box.expandByObject(mesh, true); });
      target.center.copy(box.getCenter(new Vector3())).negate();
      const size = box.getSize(new Vector3());
      fit.halfY = Math.max(fit.halfY, size.y * .57);
      fit.sweep = Math.max(fit.sweep, Math.hypot(size.x, size.z) * .57);
    }
    // Wrist-local prop motion can arc beyond both endpoint poses. Include
    // that small transition path in the fixed frame without rescanning the
    // full garment meshes on every intermediate sample.
    ball.geometry.computeBoundingSphere();
    const center = new Vector3(), scale = new Vector3();
    for (let to = 0; to < targets.length; to++) {
      const previous = targets[(to + targets.length - 1) % targets.length], target = targets[to];
      for (let sample = 0; sample <= 24; sample++) {
        const blend = sample / 24;
        nodes.forEach((node, joint) => {
          node.position.lerpVectors(previous.positions[joint], target.positions[joint], blend);
          node.quaternion.slerpQuaternions(previous.rotations[joint], target.rotations[joint], blend);
        });
        model.position.lerpVectors(previous.center, target.center, blend);
        model.updateMatrixWorld(true);
        ball.localToWorld(center.copy(ball.geometry.boundingSphere.center)); ball.getWorldScale(scale);
        const radius = ball.geometry.boundingSphere.radius * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
        fit.halfY = Math.max(fit.halfY, (Math.abs(center.y) + radius) * 1.04);
        fit.sweep = Math.max(fit.sweep, (Math.hypot(center.x, center.z) + radius) * 1.04);
      }
    }
    fitted = { fit, centers: targets.map(target => target.center.clone()) };
    fittedCatalogs.set(catalog, fitted);
  } else targets.forEach((target, index) => target.center.copy(fitted.centers[index]));
  let index = 0, traveled = 0, elapsed = TRANSITION_SECONDS, previous = targets[0];
  apply(targets[0]);
  return {
    fit: { ...fitted.fit },
    get id() { return targets[index].id; },
    get label() { return targets[index].label; },
    advance(rotationDelta, dt) {
      if (!Number.isFinite(rotationDelta) || !Number.isFinite(dt) || rotationDelta <= 0 || dt <= 0) return;
      traveled += rotationDelta;
      const interval = catalog.rotationsPerPose * FULL_TURN;
      if (traveled >= interval) {
        const steps = Math.floor(traveled / interval);
        previous = targets[index]; index = (index + steps) % targets.length;
        traveled %= interval; elapsed = 0;
      }
      if (elapsed >= TRANSITION_SECONDS) return;
      elapsed = Math.min(TRANSITION_SECONDS, elapsed + dt);
      const fraction = elapsed / TRANSITION_SECONDS, blend = fraction * fraction * (3 - 2 * fraction), target = targets[index];
      nodes.forEach((node, joint) => {
        node.position.lerpVectors(previous.positions[joint], target.positions[joint], blend);
        node.quaternion.slerpQuaternions(previous.rotations[joint], target.rotations[joint], blend);
      });
      correctArms(previous.id, target.id, blend);
      model.position.lerpVectors(previous.center, target.center, blend);
      model.userData.forgeBallVisible = previous.ballVisible && target.ballVisible || target.ballVisible && fraction >= .9;
      ball.visible = model.userData.forgeBallVisible;
    },
  };
}

import * as THREE from 'three';

// Validate the authored skeleton before changing any joint. A model/pose from
// different releases must fail together rather than render detached limbs.
export function applyForgeDunk(root, rig, release) {
  const fail = () => { throw new Error('The athlete pose does not match this model. Reload the athlete assets.'); };
  if (rig.modelSha256 !== release.model.sha256 || rig.bones.length !== release.controls ||
      rig.pose.rotations.length !== release.controls || rig.pose.translations.length !== release.controls) fail();
  const nodes = rig.bones.map(bone => root.getObjectByName(bone.name));
  const vector = row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite);
  const meshes = new Map();
  root.traverse(mesh => { if (mesh.isMesh) meshes.set(mesh.material.name, mesh); });
  if (meshes.size !== release.elements.length || release.elements.some(name => !meshes.has(name))) fail();
  let triangles = 0;
  for (const mesh of meshes.values()) {
    triangles += mesh.geometry.index.count / 3;
    if (mesh.isSkinnedMesh && (mesh.skeleton.bones.length !== release.skinJoints ||
        mesh.skeleton.bones.some((bone, index) => bone.name !== rig.bones[index].name))) fail();
  }
  if (triangles !== release.triangles) fail();
  rig.bones.forEach((bone, index) => {
    const node = nodes[index], parent = nodes[bone.parent];
    const rest = parent ? new THREE.Vector3(...bone.pivot).sub(new THREE.Vector3(...rig.bones[bone.parent].pivot)) : new THREE.Vector3(...bone.pivot);
    if (!node || (parent && node.parent !== parent) || node.position.distanceTo(rest) > 1e-5 ||
        !vector(rig.pose.translations[index]) || !vector(rig.pose.rotations[index]) ||
        bone.axes.length !== 3 || bone.axes.some(axis => !vector(axis) || Math.abs(new THREE.Vector3(...axis).length() - 1) > 1e-5)) fail();
  });
  const axis = new THREE.Vector3(), turn = new THREE.Quaternion();
  rig.bones.forEach((bone, index) => {
    const node = nodes[index];
    node.position.add(new THREE.Vector3(...rig.pose.translations[index]));
    node.quaternion.identity();
    bone.axes.forEach((direction, slot) => node.quaternion.multiply(turn.setFromAxisAngle(axis.fromArray(direction), THREE.MathUtils.degToRad(rig.pose.rotations[index][slot]))));
  });
  root.updateMatrixWorld(true);
  root.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.skeleton.update(); });
  const box = new THREE.Box3().setFromObject(root, true), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
  return { halfY: size.y * .57, sweep: Math.hypot(size.x, size.z) * .57 };
}

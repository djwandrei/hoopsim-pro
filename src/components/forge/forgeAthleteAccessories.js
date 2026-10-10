import * as THREE from 'three';

// Cut fitted cloth shells from the authored skin, including interpolated skin
// weights at each cuff. This keeps the knee covered through the existing bend
// and puts the wristband on the forearm rather than the rotating hand.
function fittedBand(source, name, joint, toward, lower, upper, radius, joints) {
  if (!source?.isSkinnedMesh) throw new Error(`The athlete cannot fit its ${name}.`);
  const { skeleton, geometry } = source, attrs = geometry.attributes;
  const boneIndex = bone => skeleton.bones.findIndex(item => item.name === bone);
  const rest = bone => new THREE.Vector3().setFromMatrixPosition(skeleton.boneInverses[boneIndex(bone)].clone().invert()).applyMatrix4(source.bindMatrix.clone().invert());
  const center = rest(joint), axis = rest(toward).sub(center).normalize();
  const allowed = new Set(joints.map(boneIndex));
  const positions = [], normals = [], indices = [], weights = [];
  const vertex = index => {
    const p = new THREE.Vector3().fromBufferAttribute(attrs.position, index);
    const n = new THREE.Vector3().fromBufferAttribute(attrs.normal, index);
    const skin = new Map();
    for (let slot = 0; slot < 4; slot++) {
      const bone = attrs.skinIndex.getComponent(index, slot), weight = attrs.skinWeight.getComponent(index, slot);
      if (weight > 0) skin.set(bone, (skin.get(bone) || 0) + weight);
    }
    return { p, n, skin, t: p.clone().sub(center).dot(axis) };
  };
  const interpolate = (a, b, t) => {
    const skin = new Map();
    for (const [bone, weight] of a.skin) skin.set(bone, weight * (1 - t));
    for (const [bone, weight] of b.skin) skin.set(bone, (skin.get(bone) || 0) + weight * t);
    return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t), skin, t: a.t + (b.t - a.t) * t };
  };
  const clip = (polygon, plane, sign) => {
    const result = [];
    for (let at = 0; at < polygon.length; at++) {
      const a = polygon[at], b = polygon[(at + 1) % polygon.length];
      const insideA = (a.t - plane) * sign >= 0, insideB = (b.t - plane) * sign >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) result.push(interpolate(a, b, (plane - a.t) / (b.t - a.t)));
    }
    return result;
  };
  const append = point => {
    const n = point.n.clone().normalize();
    positions.push(...point.p.clone().addScaledVector(n, .0025).toArray());
    normals.push(...n.toArray());
    const skin = [...point.skin].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = skin.reduce((total, [, weight]) => total + weight, 0);
    for (let slot = 0; slot < 4; slot++) { indices.push(skin[slot]?.[0] || 0); weights.push((skin[slot]?.[1] || 0) / sum); }
  };
  // Cache vertex classification within this extraction; body geometry is shared
  // between previews and must never be edited or disposed by an accessory.
  const cache = new Map();
  const read = index => {
    if (!cache.has(index)) cache.set(index, vertex(index));
    return cache.get(index);
  };
  for (let at = 0; at < geometry.index.count; at += 3) {
    const ids = [0, 1, 2].map(slot => geometry.index.getX(at + slot));
    const distances = ids.map(index => (attrs.position.getX(index) - center.x) * axis.x + (attrs.position.getY(index) - center.y) * axis.y + (attrs.position.getZ(index) - center.z) * axis.z);
    if (distances.every(t => t < lower) || distances.every(t => t > upper)) continue;
    const triangle = ids.map(read);
    if (triangle.some(v => [...v.skin].reduce((total, [bone, weight]) => total + (allowed.has(bone) ? weight : 0), 0) < .5)) continue;
    if (triangle.some(v => v.p.clone().sub(center).addScaledVector(axis, -v.t).length() > radius)) continue;
    const polygon = clip(clip(triangle, lower, 1), upper, -1);
    for (let at = 1; at < polygon.length - 1; at++) {
      const a = polygon[0], b = polygon[at], c = polygon[at + 1];
      if (b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq() < 1e-18) continue;
      append(a); append(b); append(c);
    }
  }
  if (!positions.length) throw new Error(`The athlete could not fit its ${name}.`);
  const shell = new THREE.BufferGeometry();
  shell.name = name;
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  shell.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  shell.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  shell.computeBoundingBox(); shell.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ name, color: 0xffffff, roughness: .92, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(shell, material);
  mesh.name = name; mesh.userData.forgeAccessory = true; mesh.frustumCulled = false;
  mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
  mesh.bindMode = source.bindMode; mesh.bind(skeleton, source.bindMatrix);
  source.parent.add(mesh);
  return mesh;
}

export default function forgeAthleteAccessories(model) {
  const wristband = fittedBand(model.getObjectByName('left-arm'), 'wristband', 'left_wrist', 'left_elbow', .018, .068, .10, ['left_elbow', 'left_wrist']);
  const kneeSleeve = fittedBand(model.getObjectByName('featureless_body'), 'knee-sleeve', 'right_knee', 'right_hip', -.115, .095, .14, ['right_hip', 'right_knee', 'right_ankle']);
  model.updateMatrixWorld(true);
  return () => { for (const mesh of [wristband, kneeSleeve]) { mesh.removeFromParent(); mesh.geometry.dispose(); } };
}

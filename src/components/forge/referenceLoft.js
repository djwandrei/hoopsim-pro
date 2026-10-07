import * as THREE from 'three';
import { referenceSection, referenceContour } from '@/components/forge/referenceSections';

// One continuous surface along anatomical cross-sections, including the joint.
// No cylinders, spherical joint covers, or separate muscle blobs.
export function referenceLoft(rows, material, frameHint = [1, 0, 0], profile = 'skin') {
  const curve = new THREE.CatmullRomCurve3(rows.map(r => new THREE.Vector3(...r.slice(0, 3))), false, 'centripetal');
  const steps = Math.max(24, (rows.length - 1) * 8), sides = 32;
  const positions = [], indices = [];
  let previousTangent, normal;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, p = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    if (!normal) {
      normal = new THREE.Vector3(...frameHint);
      if (Math.abs(normal.dot(tangent)) > 0.9) normal.set(0, 0, 1);
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    } else {
      normal.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(previousTangent, tangent));
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    }
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    previousTangent = tangent;
    const u = t * (rows.length - 1), a = Math.min(Math.floor(u), rows.length - 2);
    const f = u - a;
    const rx = referenceSection(rows, a, f, 3);
    const power = referenceSection(rows, a, f, 5, profile === 'cloth' ? .82 : profile === 'shoe' ? .68 : 1);
    const front = referenceSection(rows, a, f, 6, row => row[4]);
    const back = referenceSection(rows, a, f, 7, row => row[4]);
    for (let j = 0; j < sides; j += 1) {
      const angle = j / sides * Math.PI * 2;
      const [x, depth] = referenceContour(angle, rx, front, back, power, profile);
      const v = p.clone().addScaledVector(normal, x).addScaledVector(binormal, depth);
      positions.push(v.x, v.y, v.z);
      if (i < steps) {
        const c = i * sides + j, n = i * sides + (j + 1) % sides;
        indices.push(c, n, c + sides, n, n + sides, c + sides);
      }
    }
  }
  // Closed end caps; adjacent sections overlap only inside the clothing/skin.
  for (const end of [0, 1]) {
    const row = rows[end ? rows.length - 1 : 0], center = positions.length / 3;
    positions.push(row[0], row[1], row[2]);
    const base = end ? steps * sides : 0;
    for (let j = 0; j < sides; j += 1) {
      const a = base + j, b = base + (j + 1) % sides;
      indices.push(...(end ? [center, a, b] : [center, b, a]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
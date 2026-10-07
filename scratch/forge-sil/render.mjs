// Headless silhouette harness: builds the reference sculpt, projects it
// orthographically from a given azimuth, and prints an ASCII occupancy map so
// the sculpt can be compared against the reference renders directly.
import * as THREE from 'three';
import { buildReferenceSculpt } from './referenceSculpt.js';

const meshes = [];
buildReferenceSculpt({
  addMesh: (_key, mesh) => meshes.push(mesh),
  goldRec: () => ({ mat: {} }),
  deepRec: () => ({ mat: {} })
});

// Collect world-space triangles.
const tris = [];
for (const mesh of meshes) {
  const pos = mesh.geometry.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    tris.push([a, b, c]);
  }
}
// The ball.
{
  const g = new THREE.SphereGeometry(0.175, 24, 18);
  const p = g.attributes.position, m = new THREE.Matrix4().makeTranslation(...REFERENCE_BALL());
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    v.fromBufferAttribute(p, i).applyMatrix4(m);
    const v2 = new THREE.Vector3().fromBufferAttribute(p, i + 1).applyMatrix4(m);
    const v3 = new THREE.Vector3().fromBufferAttribute(p, i + 2).applyMatrix4(m);
    tris.push([v.clone(), v2, v3]);
  }
}
function REFERENCE_BALL() { return [-0.2, 2.55, -0.13]; }

const az = Number(process.argv[2] || 0);          // camera azimuth (rad): 0 = front (+z toward camera)
const W = Number(process.argv[3] || 96), H = Number(process.argv[4] || 64);
const xs = Number(process.argv[5] || 1.7), ys = 3.0; // half-extents: x half-width, y total height from -0.1

// Orthographic projection from azimuth az: camera direction d = (sin az, 0, cos az).
// Screen-x = dot(p, right), right = (cos az, 0, -sin az); screen-y = p.y.
const cos = Math.cos(az), sin = Math.sin(az);
const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
for (const [a, b, c] of tris) {
  const pts = [a, b, c].map(p => {
    const sx = p.x * cos - p.z * sin;
    return [sx, p.y];
  });
  // Rasterize the triangle's edges (silhouette only needs coverage).
  for (let i = 0; i < 3; i += 1) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 3];
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 40));
    for (let t = 0; t <= n; t += 1) {
      const x = x1 + (x2 - x1) * t / n, y = y1 + (y2 - y1) * t / n;
      const col = Math.round((x + xs) / (2 * xs) * (W - 1));
      const row = Math.round((ys - (y + 0.1)) / ys * (H - 1));
      if (row >= 0 && row < H && col >= 0 && col < W) grid[row][col] = '#';
    }
  }
}
console.log(`az=${az.toFixed(2)}`);
for (const row of grid) console.log(row.join(''));